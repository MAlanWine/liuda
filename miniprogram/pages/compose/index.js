const geo = require('../../utils/geo')
const demo = require('../../data/demo')
const location = require('../../services/location')
const repository = require('../../services/repository')
const api = require('../../services/api')
const drafts = require('../../services/drafts')
const { selectTab } = require('../../utils/layout')

Page({
  data:{ mode:'demo',text:'',name:'',photoPath:'',selectedPlace:null,published:null,
    textEditor:[{ id:0,value:'' }],nameEditor:[{ id:0,value:'' }],textLength:0,
    positionLabel:'模拟当前位置',ready:true,busy:false,cameraBusy:false,positionBusy:false,placeBusy:false,
    canPublish:false,hasDraft:false,publishError:'',publishStage:'' },
  onShow() {
    selectTab(this,1)
    this._visible = true
    this._generation = (this._generation || 0) + 1
    const mode = getApp().globalData.mode,changed = mode !== this.data.mode
    const draft = drafts.read(mode)
    this._photoPosition = draft.photoPosition
    this._pending = draft.attempt
    this.setFormValues({ mode,text:draft.text,name:draft.name,selectedPlace:draft.selectedPlace,photoPath:draft.photoPath,
      published:changed ? null : this.data.published,publishError:changed ? '' : this.data.publishError })
    const removed = getApp().globalData.removedPostIds || []
    if (this.data.published && (this.data.published.id === getApp().globalData.removedPostId || removed.includes(this.data.published.id))) this.setData({ published:null })
    const requested = getApp().globalData.composePlace
    if (requested) {
      getApp().globalData.composePlace = null
      if (requested.mode === mode) this.setFormValues({ selectedPlace:drafts.place(requested.place),name:requested.place.name,published:null })
    }
    this.updatePosition(mode === 'demo' ? demo.position(getApp().globalData.demoWalk) : location.peek())
    if (mode === 'live') {
      this._unsubscribe = location.subscribe(position => { if (this._visible) this.updatePosition(position) })
      this.refreshPosition()
    }
    this._positionTimer = setInterval(() => { if (this._visible) this.updatePosition(this._position) },3000)
  },
  onHide() { this.leave() },onUnload() { this.leave() },
  leave() {
    this.saveDraft(); this._visible = false; clearInterval(this._positionTimer)
    this._generation = (this._generation || 0) + 1
    this.setData({ positionBusy:false,placeBusy:false })
    if (this._unsubscribe) this._unsubscribe()
    this._unsubscribe = null; location.stop()
  },
  saveDraft() {
    if (this.data.published) return
    drafts.save(this.data.mode,Object.assign({},this.data,{ photoPosition:this._photoPosition,attempt:this._pending }))
  },
  // Native editors own keystrokes. Only an explicit restore/clear/place selection
  // replaces their keyed seed; ordinary page updates never echo old text back.
  setFormValues(patch) {
    const next = Object.assign({},patch)
    ;['text','name'].forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(patch,field)) return
      const id = this._editorVersion = (this._editorVersion || 0) + 1
      next[field + 'Editor'] = [{ id,value:patch[field] }]
      if (field === 'text') next.textLength = patch[field].length
    })
    this.setData(next)
  },
  readEdit(field,event) {
    const editor = this.data[field + 'Editor'][0]
    if (!editor || Number(event.currentTarget.dataset.editor) !== editor.id) return false
    const value = event.detail.value
    if (typeof value !== 'string' || value === this.data[field]) return false
    // These fields are logic-only; WXML binds to immutable editor seeds instead.
    this.data[field] = value
    return true
  },
  patchForm(patch) {
    const changed = {}
    Object.keys(patch).forEach(key => { if (this.data[key] !== patch[key]) changed[key] = patch[key] })
    if (Object.keys(changed).length) this.setData(changed)
  },
  updateForm() {
    const hasDraft = !!(this.data.text || this.data.name || this.data.photoPath)
    this.patchForm({ hasDraft,textLength:this.data.text.length,canPublish:!!(this.data.ready && this.data.text.trim() && this.data.name.trim()) })
    this.saveDraft()
  },
  updatePosition(position) {
    this._position = position
    const check = geo.gate(position,this.data.selectedPlace || position,this.data.mode)
    const label = this.data.mode === 'demo' ? '模拟当前位置 · 不使用 GPS' : geo.valid(position) ?
      (check.ok ? '已到场 · 精度约 ' + Math.ceil(geo.accuracy(position)) + 'm' : check.reason) : '等待手机位置'
    this.patchForm({ ready:check.ok,positionLabel:label }); this.updateForm()
  },
  async refreshPosition() {
    if (this.data.positionBusy) return
    const mode = this.data.mode,generation = this._generation
    this.setData({ positionBusy:true })
    try {
      const position = mode === 'demo' ? demo.position(getApp().globalData.demoWalk) : await location.start()
      if (this._visible && this.data.mode === mode && this._generation === generation) this.updatePosition(position)
    } catch (error) {
      if (!error.cancelled && this._visible && this._generation === generation) { this.setData({ positionLabel:location.explain(error),ready:false }); this.updateForm() }
    } finally { if (this._generation === generation) this.setData({ positionBusy:false }) }
  },
  onTextInput(event) {
    if (!this.readEdit('text',event)) return
    this.patchForm({ publishError:'' }); this.updateForm()
  },
  onNameInput(event) {
    if (!this.readEdit('name',event)) return
    const wasSelected = !!this.data.selectedPlace
    this.patchForm({ selectedPlace:null,publishError:'' })
    if (wasSelected) this.updatePosition(this._position); else this.updateForm()
  },
  async position(useSelected = true) {
    return this.positionFor(this.data.mode,useSelected ? this.data.selectedPlace : null)
  },
  async positionFor(mode,place) {
    const position = mode === 'demo' ? demo.position(getApp().globalData.demoWalk) : await location.fresh()
    if (this._visible && this.data.mode === mode) this.updatePosition(position)
    const check = geo.gate(position,place || position,mode)
    if (!check.ok) throw new Error(check.reason)
    return position
  },
  choosePlace() {
    if (this.data.busy || this.data.placeBusy) return
    wx.showActionSheet({ itemList:['在当前位置新建地点','使用附近已有地点'],success:result => {
      if (result.tapIndex === 0) this.createHere(); else this.chooseExisting()
    } })
  },
  async createHere() {
    const mode = this.data.mode,generation = this._generation
    try {
      await this.position(false)
      if (!this._visible || this.data.mode !== mode || this._generation !== generation) return
      if (this.data.selectedPlace) this.setFormValues({ name:'',selectedPlace:null,publishError:'' })
      else this.patchForm({ selectedPlace:null,publishError:'' })
      this.updatePosition(this._position)
      wx.showToast({ title:'在下方写清具体位置',icon:'none' })
    } catch (error) { this.error(error) }
  },
  async chooseExisting() {
    if (this.data.placeBusy) return
    const mode = this.data.mode,generation = this._generation
    this.setData({ placeBusy:true })
    try {
      const position = await this.position(false),seen = new Set()
      const nearby = await repository.nearby(mode,position)
      if (!this._visible || this.data.mode !== mode || this._generation !== generation) return
      const places = nearby.filter(post => {
        const key = post.sceneId || post.name + ':' + post.latitude.toFixed(6) + ':' + post.longitude.toFixed(6)
        if (seen.has(key) || !geo.gate(position,post,mode).ok) return false
        seen.add(key); return true
      }).slice(0,5)
      if (!places.length) {
        wx.showModal({ title:'现场还没有已有地点',content:'可以直接在当前位置新建，用名称写清楼门、台阶或长椅。',confirmText:'新建地点',
          success:result => { if (result.confirm && this._visible && this.data.mode === mode && this._generation === generation) this.createHere() } })
        return
      }
      wx.showActionSheet({ itemList:places.map(post => post.name + ' · ' + post.distanceLabel),success:result => {
        if (!this._visible || this.data.mode !== mode || this._generation !== generation) return
        const place = places[result.tapIndex]
        this.setFormValues({ selectedPlace:drafts.place(place),name:place.name,publishError:'' }); this.updatePosition(this._position)
      } })
    } catch (error) { this.error(error) }
    finally { if (this._generation === generation) this.setData({ placeBusy:false }) }
  },
  async capturePhoto() {
    if (this.data.cameraBusy || this.data.busy) return
    const mode = this.data.mode
    this.setData({ cameraBusy:true })
    try {
      await this.position()
      const result = await new Promise((resolve,reject) => wx.chooseMedia({ count:1,mediaType:['image'],sourceType:['camera'],sizeType:['compressed'],success:resolve,fail:reject }))
      if (this.data.mode !== mode) return
      this._photoPosition = await this.position()
      this.setData({ photoPath:result.tempFiles[0].tempFilePath,publishError:'' }); this._pending = null; this.updateForm()
    } catch (error) { if (!/cancel/i.test(error.errMsg || '')) this.error(error) }
    finally { this.setData({ cameraBusy:false }) }
  },
  previewPhoto() { if (this.data.photoPath) wx.previewImage({ urls:[this.data.photoPath] }) },
  clearPhoto() { this.setData({ photoPath:'' }); this._photoPosition = null; this._pending = null; this.updateForm() },
  discard() {
    if (this.data.busy || this.data.cameraBusy || !this.data.hasDraft) return
    wx.showModal({ title:'清空这份草稿？',content:'本次填写的文字、地点和照片会清空。',confirmText:'清空',
      success:result => {
        if (!result.confirm) return
        drafts.clear(this.data.mode); this._photoPosition = null; this._pending = null
        this.setFormValues({ text:'',name:'',selectedPlace:null,photoPath:'',publishError:'' }); this.updatePosition(this._position)
      } })
  },
  async publish() {
    if (this.data.busy || this.data.cameraBusy) return
    if (!this.data.text.trim()) { wx.showToast({ title:'先写下一句话',icon:'none' }); return }
    if (!this.data.name.trim()) { wx.showToast({ title:'给这个地点起个具体名称',icon:'none' }); return }
    const mode = this.data.mode,text = this.data.text,name = this.data.name,place = this.data.selectedPlace,photoPath = this.data.photoPath,photoPosition = this._photoPosition
    const fingerprint = JSON.stringify([mode,text,name,place && place.sceneId,photoPath])
    if (!this._pending || this._pending.fingerprint !== fingerprint) this._pending = { fingerprint,requestId:api.requestId(),photoRequestId:api.requestId(),photoId:'' }
    const attempt = this._pending
    this.setData({ busy:true,publishError:'',publishStage:'确认现场…' }); this.saveDraft()
    let savedPhoto = ''
    try {
      let position = await this.positionFor(mode,place)
      if (mode === 'live') await api.ensure()
      if (!this._visible || this.data.mode !== mode) throw new Error('已离开发布页，草稿已保留，请返回后重试。')
      if (place && !geo.gate(position,place,mode).ok) throw new Error('已经离开所选地点，请靠近后再留下。')
      if (photoPath) {
        if (!photoPosition || geo.distance(position,photoPosition)>50 || Date.now()-photoPosition.timestamp>600000) throw new Error('照片已不在当前现场范围，请重新拍摄。')
        this.setData({ publishStage:'处理现场照片…' })
        if (mode === 'demo') {
          const saved = await new Promise((resolve,reject) => wx.saveFile({ tempFilePath:photoPath,success:resolve,fail:reject })); savedPhoto = saved.savedFilePath
        } else if (!attempt.photoId) {
          const base64 = await api.preparePhoto(photoPath),uploaded = await api.uploadPhoto(base64,attempt.photoRequestId)
          attempt.photoId = uploaded.photoId
        }
        if (!this._visible || this.data.mode !== mode) throw new Error('已离开发布页，草稿已保留，请返回后重试。')
        position = await this.positionFor(mode,place)
        if (geo.distance(position,photoPosition)>50) throw new Error('已经离开拍照位置，请重新拍摄。')
      }
      this.setData({ publishStage:mode === 'demo' ? '留在演示区…' : '审核并留下…' })
      const post = await repository.create(mode,position,{ text,name,place,photoPath:savedPhoto,photoId:attempt.photoId },attempt.requestId)
      drafts.clear(mode)
      if (this.data.mode === mode) {
        this._photoPosition = null; this._pending = null
        this.setFormValues({ text:'',name:'',selectedPlace:null,photoPath:'',hasDraft:false,canPublish:false,
          published:{ id:post.id,name,mode },publishError:'' })
      }
    } catch (error) {
      if (savedPhoto) wx.removeSavedFile({ filePath:savedPhoto })
      if (this.data.mode === mode) {
        this.setData({ publishError:(error.message || location.explain(error)) + (error.code === 'NETWORK_ERROR' ? ' 提交结果未确认，请保留原内容重试。' : '') })
        this.saveDraft()
        if (api.needsJoin(error) && this._visible) api.openConnect()
      }
    } finally { this.setData({ busy:false,publishStage:'' }) }
  },
  viewPublished() {
    const post = this.data.published
    if (post) wx.navigateTo({ url:'/pages/thread/index?mode=' + post.mode + '&id=' + encodeURIComponent(post.id) })
  },
  publishedMap() {
    const post = this.data.published
    if (post) getApp().globalData.openPostId = post.id
    wx.switchTab({ url:'/pages/explore/index' })
  },
  writeAgain() { this.setData({ published:null,publishError:'' }); this.updatePosition(this._position) },
  locationDetails() { wx.navigateTo({ url:'/pages/location-status/index' }) },
  goNearby() { wx.switchTab({ url:'/pages/explore/index' }) },
  error(error) {
    if (!this._visible) return
    if (api.needsJoin(error)) { this.saveDraft(); api.openConnect(); return }
    wx.showModal({ title:'暂时无法完成',content:error.message || location.explain(error),showCancel:false })
  }
})
