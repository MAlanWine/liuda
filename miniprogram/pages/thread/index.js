const geo = require('../../utils/geo')
const demo = require('../../data/demo')
const repository = require('../../services/repository')
const api = require('../../services/api')
const location = require('../../services/location')
const time = require('../../utils/time')

Page({
  data:{ post:null, mode:'demo', reply:'',replyEditor:[{ id:0,value:'' }],replyLength:0, busy:false, status:'', missing:false, loading:true, needsJoin:false,retrying:false,timeLabel:'',locating:false },
  onLoad(options) { this._id = options.id || ''; this.setData({ mode:options.mode === 'demo' ? 'demo' : 'live' }) },
  onShow() {
    this._visible = true
    this._generation = (this._generation || 0) + 1
    this._syncBusy = false
    this._syncAgain = false
    if (this.data.mode === 'live') this._unsubscribe = location.subscribe(() => { if (this._visible) { this.refresh(); this.sync() } })
    // Ask the server about participation first. Continuing an existing thread
    // must work even when GPS is unavailable or location permission is denied.
    this.sync(true)
    this._timer = setInterval(() => { this.refresh(); this.sync() },3000)
  },
  onHide() { this.leave() }, onUnload() { this.leave() },
  onPullDownRefresh() { this.retry().finally(() => wx.stopPullDownRefresh()) },
  leave() {
    this._visible = false; this._generation = (this._generation || 0) + 1
    clearInterval(this._timer); if (this._unsubscribe) this._unsubscribe(); this._unsubscribe = null
    location.stop(); api.clearPhoto(this._id); this._photoPath = ''; this._snapshot = null; this._syncBusy = false; this._syncAgain = false
    this.setData({ locating:false })
    if (this.data.mode === 'live') this.setData({ post:null, loading:true })
  },
  currentPosition() { return this.data.mode === 'demo' ? demo.position(getApp().globalData.demoWalk) : location.peek() },
  refresh() {
    const position = this.currentPosition()
    let post = this._snapshot
    if (!post) return
    if (this.data.mode === 'demo') post = geo.decorate(post,position,'demo')
    else {
      post = api.visible(post,position)
      this._snapshot = post
      if (post.level !== 'full') { api.clearPhoto(this._id); this._photoPath = '' }
      post = Object.assign({},post,{ photoPath:post.level === 'full' ? this._photoPath || '' : '' })
    }
    const check = geo.gate(position,post,this.data.mode)
    this.setData({ post, missing:false, loading:false,timeLabel:time.label(post.createdAt),
      status:post.participated ? (this.data.mode === 'demo' ? '演示对话 · 已参与，可离场继续' : '已参与这条对话 · 离场也可继续') :
        this.data.mode === 'demo' ? '演示对话 · 首次接话需要到场' : check.ok ? '已到场 · 接一句后可离场继续' : check.reason })
  },
  async sync(force = false) {
    if (!this._visible) return
    if (this._syncBusy) { if (force) this._syncAgain = true; return }
    if (!force && Date.now() - (this._lastSync || 0) < 8000) return
    this._syncBusy = true; this._lastSync = Date.now()
    const generation = this._generation
    try {
      const position = this.currentPosition()
      const post = await repository.thread(this.data.mode,this._id,position)
      if (!this._visible || generation !== this._generation) return
      this._snapshot = post
      this.setData({ needsJoin:false }); this.refresh()
      if (this.data.mode === 'live' && !post.participated && !location.isTracking()) this.locate(false)
      if (this.data.mode === 'live' && post.level === 'full' && post.photoPresent && !this._photoPath) await this.loadPhoto(generation)
    } catch (error) {
      if (this._visible && generation === this._generation) {
        if (error.code === 'POST_MISSING') { this._snapshot = null; api.clearPhoto(this._id); this.setData({ post:null, missing:true }) }
        if (api.needsJoin(error)) { this._snapshot = null; api.clearPhoto(this._id); this.setData({ post:null }) }
        this.setData({ loading:false, needsJoin:api.needsJoin(error), status:error.code ? error.message : location.explain(error) })
      }
    } finally {
      if (generation === this._generation) {
        this._syncBusy = false
        if (this._syncAgain && this._visible) { this._syncAgain = false; this.sync(true) }
      }
    }
  },
  async loadPhoto(generation) {
    try {
      const path = await api.readPhoto(this._id,this.currentPosition())
      if (!this._visible || generation !== this._generation || !this._snapshot || api.visible(this._snapshot,this.currentPosition()).level !== 'full') { api.clearPhoto(this._id); return }
      this._photoPath = path; this.refresh()
    } catch (error) { if (this._visible && generation === this._generation) this.setData({ status:'文字已同步，图片暂不可用。' }) }
  },
  onReplyInput(event) {
    const editor = this.data.replyEditor[0]
    if (!editor || Number(event.currentTarget.dataset.editor) !== editor.id || typeof event.detail.value !== 'string') return
    // Keep native typing independent of periodic location/thread rendering.
    this.data.reply = event.detail.value
    if (this.data.replyLength !== this.data.reply.length) this.setData({ replyLength:this.data.reply.length })
  },
  clearReply() {
    const id = this.data.replyEditor[0].id + 1
    this.setData({ reply:'',replyLength:0,replyEditor:[{ id,value:'' }] })
  },
  async position() { return this.data.mode === 'demo' ? this.currentPosition() : location.fresh() },
  async sendReply() {
    if (this.data.busy || !this.data.reply.trim() || !this.data.post || !this.data.post.canReply) return
    const text = this.data.reply,continuation = this.data.post.participated === true
    if (!this._replyAttempt || this._replyAttempt.text !== text) this._replyAttempt = { text,id:api.requestId() }
    this.setData({ busy:true })
    try {
      await repository.comment(this.data.mode,this._id,continuation ? null : await this.position(),text,this._replyAttempt.id,continuation)
      this._replyAttempt = null; this.clearReply(); await this.sync(true)
      wx.showToast({ title:continuation ? '已接上这段对话' : '已在现场接上',icon:'success' })
    } catch (error) { this.error(error) }
    finally { this.setData({ busy:false }) }
  },
  async like() {
    if (this.data.busy || !this.data.post || !this.data.post.canLike) return
    this.setData({ busy:true })
    try { await repository.like(this.data.mode,this._id,await this.position(),!this.data.post.liked); await this.sync(true) }
    catch (error) { this.error(error) }
    finally { this.setData({ busy:false }) }
  },
  photo() { if (this.data.post && this.data.post.level === 'full' && this.data.post.photoPath) wx.previewImage({ urls:[this.data.post.photoPath] }) },
  chat() { wx.showModal({ title:'私聊稍后接入',content:'当前先体验现场留话与回复，私聊和付费权益尚未开放。',showCancel:false }) },
  remove() {
    if (this.data.busy) return
    wx.showModal({ title:this.data.mode === 'demo' ? '删除这条演示留话？' : '删除这条留话？',
      content:this.data.mode === 'demo' ? '文字、现场照片和本机回复会一起删除。' : '其他人将无法继续查看或回复。',confirmText:'删除',confirmColor:'#b94d4d',
      success:async result => {
        if (!result.confirm) return
        if (!this._deleteRequestId) this._deleteRequestId = api.requestId()
        this.setData({ busy:true })
        try {
          await repository.remove(this.data.mode,this._id,this._deleteRequestId)
          getApp().globalData.removedPostId = this._id
          getApp().globalData.removedPostIds = (getApp().globalData.removedPostIds || []).filter(id => id !== this._id).concat(this._id).slice(-50)
          if (getApp().globalData.openPostId === this._id) getApp().globalData.openPostId = ''
          this._snapshot = null; api.clearPhoto(this._id)
          wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/explore/index' }) })
        }
        catch (error) { this.error(error) }
        finally { this.setData({ busy:false }) }
      } })
  },
  connect() { api.openConnect() },
  async retry() {
    if (this.data.retrying) return
    this.setData({ retrying:true })
    try {
      if (!this._visible) return
      this._lastSync = 0; await this.sync(true)
    } catch (error) { if (this._visible && !error.cancelled) this.setData({ loading:false,status:location.explain(error) }) }
    finally { this.setData({ retrying:false }) }
  },
  async locate(resync = true) {
    if (this.data.locating || this.data.mode !== 'live') return
    const generation = this._generation
    this.setData({ locating:true })
    try {
      await location.start()
      if (this._visible && generation === this._generation && resync) await this.sync(true)
    } catch (error) {
      if (this._visible && generation === this._generation && !error.cancelled && !(this.data.post && this.data.post.participated)) this.setData({ status:location.explain(error) })
    } finally { if (generation === this._generation) this.setData({ locating:false }) }
  },
  locateHere() { this.locate(true) },
  nearby() {
    if (this.data.post && geo.distance(this.currentPosition(),this.data.post)<=350) getApp().globalData.openPostId = this._id
    wx.switchTab({ url:'/pages/explore/index' })
  },
  locationDetails() { wx.navigateTo({ url:'/pages/location-status/index' }) },
  back() { wx.navigateBack({ fail:() => wx.switchTab({ url:'/pages/explore/index' }) }) },
  error(error) { if (api.needsJoin(error)) { api.openConnect(); return }; wx.showModal({ title:'暂时无法操作',content:error.message || location.explain(error),showCancel:false }) }
})
