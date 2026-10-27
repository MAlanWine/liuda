const geo = require('../../utils/geo')
const demo = require('../../data/demo')
const location = require('../../services/location')
const store = require('../../services/store')
const repository = require('../../services/repository')
const api = require('../../services/api')
const street = require('../../utils/street')
const preferences = require('../../services/preferences')
const drafts = require('../../services/drafts')
const mapPoints = require('../../utils/map-points')
const campus = require('../../utils/campus-map')
const { tabLayout, selectTab } = require('../../utils/layout')

Page({
  data: {
    mode: 'demo', view: 'street', overview: false, walk: 0, pins: [], posts: [],
    selected: null, cardVisible: true, expanded: false, busy: false,
    hasPosition: true, latitude: demo.origin.latitude, longitude: demo.origin.longitude,
    markers: [], circles: [], following: true, gpsStatus: '未开启定位',
    sceneContext:'演示街区 · 虚构场景',mapNotice:'',mapNoticeAction:'',
    lookHint: true, stageHeight: 600, canvasHeight: 558,
    sceneWidth: 390, sceneFrame: '', cloudConnected: false, cloudStatus: '联机未连接', privacyVisible:false,
    mapScale:18,syncState:'idle',syncBusy:false,emptyLabel:'看看附近',nearbyLabel:'附近留话',selectedIndex:0,nearbyCount:0,cardMaxHeight:210,
    sheetVisible:false,sheetTitle:'附近留话',sheetSubtitle:'',sheetRows:[],sheetSort:'heat',sheetMaxHeight:280,
    selectedGroupCount:0,selectedHeatLabel:'',campusFrame:{labels:[],pins:[],user:null,transform:''},
    campusWidth:campus.metadata.bounds.right-campus.metadata.bounds.left,
    campusHeight:campus.metadata.bounds.bottom-campus.metadata.bounds.top
  },
  onLoad() { this._yaw = 0; this._selectedId = 'stairs'; this._cloudPosts = []; this._position = demo.position(0); this.resizeStage() },
  onShow() {
    selectTab(this, 0)
    this._visible = true
    const global = getApp().globalData
    const switched = this.data.mode !== global.mode
    this._sheetIds = null
    this.setData({ mode: global.mode, walk: global.demoWalk, view: global.view,sheetVisible:false,sheetRows:[],
      cardVisible: switched ? false : this.data.cardVisible })
    if (global.mode === 'demo') this._position = demo.position(global.demoWalk)
    else this._position = location.peek()
    if (switched) { this._selectedId = null; this._pendingOpenId = ''; this._cloudPosts = []; this._lastSync = 0; this.setData({ syncState:'idle',cloudConnected:false,cloudStatus:'联机未连接' }) }
    if (global.removedPostIds) this._cloudPosts = this._cloudPosts.filter(post => !global.removedPostIds.includes(post.id))
    if (global.removedPostId) { this._cloudPosts = this._cloudPosts.filter(post => post.id !== global.removedPostId); global.removedPostId = '' }
    if (global.openPostId) {
      this._selectedId = global.openPostId; this._pendingOpenId = global.openPostId; global.openPostId = ''
      this.setData({ cardVisible:true,expanded:false })
    }
    this.refresh()
    if (this._ready || this.data.view==='campus') this.initCanvas()
    if (global.mode === 'live') this.beginLocation()
    this._timer = setInterval(() => {
      if (this.data.mode === 'live') { this.refresh(); if (Date.now() - (this._lastSync || 0) > 8000) this.syncNearby() }
    }, 3000)
  },
  onReady() { this._ready = true; this.initCanvas() },
  onHide() { this.leave() },
  onUnload() { this.leave() },
  onResize() { this.resizeStage(); this.initCanvas() },
  resizeStage() {
    const size = tabLayout(), stageHeight = Math.max(280, size.windowHeight - size.height)
    const patch = { stageHeight,sceneWidth:size.windowWidth,canvasHeight:stageHeight-(this.data.mode === 'demo' ? 42 : 0),
      cardMaxHeight:Math.max(60,Math.min(210,stageHeight-260)),sheetMaxHeight:Math.max(90,Math.min(300,stageHeight-270)) }
    const changed = {}
    Object.keys(patch).forEach(key => { if (patch[key] !== this.data[key]) changed[key] = patch[key] })
    if (Object.keys(changed).length) this.setData(changed)
  },
  leave() {
    this._visible = false
    this._syncGeneration = (this._syncGeneration || 0) + 1
    this._syncBusy = false
    this._locating = false
    this._sheetIds = null
    this.setData({ syncBusy:false,sheetVisible:false,sheetRows:[] })
    clearInterval(this._timer)
    if (this._unsubscribe) this._unsubscribe()
    this._unsubscribe = null
    location.stop()
    this._rendererEpoch = (this._rendererEpoch || 0) + 1
    if (this._renderer) this._renderer.destroy()
    this._renderer = null
  },
  initCanvas() {
    const campusView = this.data.view === 'campus'
    if (!this._visible || this.data.privacyVisible || (!campusView && (!this._ready || this.data.view !== 'street' || !this.data.hasPosition))) return
    const ticket = this._rendererEpoch = (this._rendererEpoch || 0) + 1
    if (this._renderer) this._renderer.destroy()
    this._renderer = null
    if(campusView){
      this._campusFrameSignature=''
      this._renderer=campus.create(this.data.sceneWidth,this.data.canvasHeight,{
        frame:frame=>{
          if(!this._visible||this.data.view!=='campus'||ticket!==this._rendererEpoch)return
          const signature=JSON.stringify(frame)
          if(signature!==this._campusFrameSignature){this._campusFrameSignature=signature;this.setData({campusFrame:frame})}
        },
        pan:()=>{if(this._visible&&this.data.following)this.setData({following:false})},
        camera:camera=>{
          if(!this._visible||this.data.view!=='campus')return
          if(camera.gesture)this._ignoreCampusTapUntil=Date.now()+500
          const patch={};if(camera.scale!==this.data.mapScale)patch.mapScale=camera.scale
          if(camera.gesture&&this.data.following)patch.following=false
          if(Object.keys(patch).length)this.setData(patch,()=>this.refresh())
        }
      })
      this.paint();return
    }
    wx.nextTick(() => {
      wx.createSelectorQuery().in(this).select('#street').fields({ node: true, size: true }).exec(result => {
        const item = result && result[0]
        if (!item || !item.node || !item.width || ticket !== this._rendererEpoch || !this._visible) return
        this._renderer = street.create(item.node, item.width, item.height, (pins, sceneFrame) => {
          if (!this._visible) return
          const groups = mapPoints.streetGroups(pins,this.data.posts,this._selectedId,this.data.cardVisible)
          this._streetGroups = groups
          const selectedGroup = groups.find(group => group.postIds.includes(this._selectedId))
          this.setData({ pins:groups,sceneFrame,selectedGroupCount:selectedGroup ? selectedGroup.count : 0 })
        })
        this.paint()
      })
    })
  },
  paint() {
    if (this.data.view === 'campus') {
      if(this._renderer)this._renderer.update({position:this._position,groups:this._mapGroups||[],
        following:this.data.following,mapScale:this.data.mapScale})
      return
    }
    if (this._renderer) this._renderer.update({ mode: this.data.mode, position: this._position,
      posts: this.data.posts, selectedId: this._selectedId, cardVisible: this.data.cardVisible,
      yaw: this._yaw, overview: this.data.overview })
  },
  refresh() {
    this.resizeStage()
    const mode = this.data.mode, position = this._position
    const posts = (mode === 'demo' ? store.nearby('demo', position) : this._cloudPosts.map(post => api.visible(post, position)))
      .sort((a,b) => geo.distance(position,a) - geo.distance(position,b))
    if (mode === 'live') this._cloudPosts = posts
    const selected = posts.find(post => post.id === this._selectedId) || null
    const good = geo.valid(position), error = geo.accuracy(position)
    const age = position ? Date.now() - position.timestamp : Infinity
    const gpsStatus = !good ? '等待定位' : age > geo.MAX_AGE ? '定位已过期' : error > 30 ? '定位较弱' : '精度约 ' + Math.ceil(error) + 'm'
    const nearby = posts.filter(post => geo.distance(position, post) <= 350)
    const groups = mapPoints.mapGroups(nearby,this.data.mapScale,this._selectedId,this.data.cardVisible)
    this._mapGroups = groups
    if (!this._markerKeys) { this._markerKeys = new Map(); this._nextMarkerId = 0 }
    this._markerGroups = new Map()
    const markers = groups.map(group => {
      if (!this._markerKeys.has(group.id)) this._markerKeys.set(group.id,++this._nextMarkerId)
      const id = this._markerKeys.get(group.id)
      this._markerGroups.set(id,group)
      return { id,latitude:group.latitude,longitude:group.longitude,iconPath:group.iconPath,
        width:group.width,height:group.height,anchor:group.anchor,zIndex:group.active ? 100 : group.tier,
        'aria-label':group.count + '条留话，' + group.heatLabel }
    })
    // Both use native markers so their order is explicit. Never displace a post to reveal the user.
    if (mode === 'live' && good) markers.push({ id:0,latitude:position.latitude,longitude:position.longitude,
      iconPath:'/assets/map-pins/user-location.png',width:24,height:24,anchor:{ x:.5,y:.5 },
      zIndex:10000,alpha:age > geo.MAX_AGE ? .45 : 1,'aria-label':'我的当前位置' })
    const selectedGroup = (this.data.view === 'street' ? this._streetGroups || [] : groups).find(group => group.postIds.includes(this._selectedId))
    const count = nearby.length,index = nearby.findIndex(post => post.id === this._selectedId)
    let mapNotice = '',mapNoticeAction = ''
    if (mode === 'live') {
      if (this.data.view === 'campus' && this._campusError) {mapNotice='校园底图未载入 · 点此使用标准地图';mapNoticeAction='standard'}
      else if (!good || age > geo.MAX_AGE) { mapNotice = good ? '位置已过期 · 点此重新定位' : '点此定位，看看你在校园哪里'; mapNoticeAction = 'recenter' }
      else if (error > 30) { mapNotice = '定位较弱 · 点此查看原因'; mapNoticeAction = 'location' }
      else if (this.data.view === 'campus' && !campus.contains(position)) {mapNotice='你在校园外 · 正在浏览整校，点此回到我';mapNoticeAction='recenter'}
      else if (count && this.data.syncState === 'join') { mapNotice = '加入试用，发现附近留话'; mapNoticeAction = 'connect' }
      else if (count && this.data.syncState === 'error') { mapNotice = '附近暂未更新 · 点此重试'; mapNoticeAction = 'refresh' }
    }
    const emptyLabel = mode==='live'&&!good ? '开启定位，看看附近留话 →' : this.data.syncState === 'loading' ? '正在看看附近…' : this.data.syncState === 'join' ? '加入现场留话 →' :
      this.data.syncState === 'error' ? '暂未刷新，点此重试 ↻' : '这里还没有留话，留第一句 ＋'
    const patch = { posts, selected, hasPosition: good, markers,
      gpsStatus,mapNotice,mapNoticeAction,
      sceneContext:mode === 'demo' ? '演示街区 · 虚构场景' : this.data.view === 'street' ? '3D 空间示意 · 非真实建筑' : this.data.view === 'campus' ? '贸大夜游 · 底图待现场校准' : '',
      emptyLabel,nearbyCount:count,selectedIndex:index + 1,nearbyLabel:count ? '附近 ' + count + ' 条' : '附近留话',
      selectedGroupCount:selectedGroup ? selectedGroup.count : 0,selectedHeatLabel:selected ? mapPoints.heat(selected).label : '',
      circles: mode === 'live' && good && error < 1000 ? [{ latitude: position.latitude, longitude: position.longitude,
        radius: error, color: '#348fdb55', fillColor: '#348fdb14', strokeWidth: 1 }] : [] }
    if (good && this.data.following) { patch.latitude = position.latitude; patch.longitude = position.longitude }
    if (this.data.sheetVisible) Object.assign(patch,this.sheetPatch(posts))
    // Do not re-send the entire native marker array when only GPS labels change.
    if (this.data.view !== 'map' || JSON.stringify(markers) === this._markerSignature) delete patch.markers
    else this._markerSignature = JSON.stringify(markers)
    this.setData(patch, () => this.paint())
  },
  async syncNearby(force = false) {
    if (!this._visible || this.data.mode !== 'live' || !geo.valid(this._position) || this._syncBusy) return
    if (!force && Date.now() - (this._lastSync || 0) < 8000) return
    const generation = this._syncGeneration || 0
    this._syncBusy = true
    this.setData({ syncBusy:true,syncState:this.data.cloudConnected ? this.data.syncState : 'loading' })
    this.refresh()
    this._lastSync = Date.now()
    try {
      const position = await location.fresh()
      if (!this._visible || this.data.mode !== 'live' || generation !== (this._syncGeneration || 0)) return
      const posts = await repository.nearby('live', position)
      if (!this._visible || this.data.mode !== 'live' || generation !== (this._syncGeneration || 0)) return
      const openId = this._pendingOpenId
      if (openId && !posts.some(post => post.id === openId)) {
        try { posts.unshift(await repository.thread('live',openId,await location.fresh())) }
        catch (error) { if (error.code !== 'POST_MISSING') throw error }
      }
      if (!this._visible || this.data.mode !== 'live' || generation !== (this._syncGeneration || 0)) return
      this._cloudPosts = posts
      if (this._pendingOpenId === openId) this._pendingOpenId = ''
      this.setData({ cloudConnected:true, cloudStatus:'联机已连接',syncState:'ready' })
      this.refresh()
    } catch (error) {
      if (this._visible && this.data.mode === 'live' && generation === (this._syncGeneration || 0)) {
        this.setData({ cloudConnected:false, cloudStatus:api.needsJoin(error) ? '联机试用待开启' : '暂未同步，稍后重试',syncState:api.needsJoin(error) ? 'join' : 'error' })
        this.refresh()
      }
    } finally { if (generation === (this._syncGeneration || 0)) { this._syncBusy = false; this.setData({ syncBusy:false }) } }
  },
  chooseMode() {
    wx.showActionSheet({ itemList: ['演示街区 · 模拟步行', '真实定位 · 联机留话', '加入联机试用', '关于留答'], success: result => {
      if (result.tapIndex === 3) { this.about(); return }
      if (result.tapIndex === 2) { api.openConnect(); return }
      const mode = result.tapIndex === 0 ? 'demo' : 'live'
      if (mode === this.data.mode) { if (mode === 'live') this.recenter(); return }
      this.switchMode(mode,mode === 'demo' ? 'street' : 'map')
    } })
  },
  switchMode(mode,view) {
      location.stop()
      if (this._unsubscribe) this._unsubscribe()
      this._unsubscribe = null
      this._syncGeneration = (this._syncGeneration || 0) + 1
      this._syncBusy = false
      this._locating = false
      this._lastSync = 0
      this._cloudPosts = []
      this._sheetIds = null; this._streetGroups = []; this._mapGroups = []
      this._markerKeys = new Map(); this._nextMarkerId = 0; this._markerSignature = ''
      this._pendingOpenId = ''
      const global = getApp().globalData
      global.mode = mode; global.view = mode === 'demo' ? 'street' : view
      preferences.save(mode,global.view)
      this._position = mode === 'demo' ? demo.position(global.demoWalk) : location.peek()
      this._selectedId = mode === 'demo' ? 'stairs' : null
      this._yaw = 0
      if (this._renderer) this._renderer.destroy()
      this._renderer = null
      this.setData({ mode, view: global.view, cardVisible: mode === 'demo', expanded: false,
        overview: false, following: true, pins: [],sheetVisible:false,sheetRows:[],syncState:'idle',syncBusy:false,cloudConnected:false,cloudStatus:'联机未连接' }, () => {
        this.refresh(); this.initCanvas()
        if (mode === 'live') this.beginLocation()
      })
  },
  beginLocation() {
    if (this._locating || !this._visible || this.data.mode !== 'live') return
    const generation = this._syncGeneration || 0
    this._locating = true
    if (!this._unsubscribe) this._unsubscribe = location.subscribe(position => {
      if (!this._visible || this.data.mode !== 'live') return
      const first = !geo.valid(this._position)
      this._position = position
      this.refresh()
      this.syncNearby()
      if (first && this.data.view!=='campus') this.initCanvas()
    })
    this.setData({ gpsStatus: '正在定位…' })
    location.start().then(position => {
      if (!this._visible || this.data.mode !== 'live') return
      this._position = position; this.refresh(); if(this.data.view!=='campus'||!this._renderer)this.initCanvas(); this.syncNearby(true)
    }).catch(error => {
      if (error.cancelled || !this._visible || this.data.mode !== 'live') return
      this.refresh()
      const problem = location.problem(error)
      wx.showModal({ title:'定位暂不可用', content:problem.message,
        confirmText:problem.action === 'settings' ? '去设置' : problem.action === 'retry' ? '重试' : '知道了',
        showCancel:true, cancelText:problem.action === 'none' ? '查看原因' : '稍后再说',
        success:result => {
          if (result.cancel && problem.action === 'none' && this._visible) { this.locationDetails(); return }
          if (!result.confirm || !this._visible || this.data.mode !== 'live') return
          if (problem.action === 'settings') wx.openSetting({ success:() => { if (this._visible) this.beginLocation() } })
          else if (problem.action === 'retry') this.beginLocation()
        } })
    }).finally(() => { if (generation === (this._syncGeneration || 0)) this._locating = false })
  },
  locationDetails() { wx.navigateTo({ url:'/pages/location-status/index' }) },
  more() {
    if (this._menuOpen) return
    const demoMode = this.data.mode === 'demo'
    const actions = [
      { title:demoMode ? '刷新演示留话' : '刷新附近留话',run:() => this.refreshNearby() },
      { title:'地图与场景',run:() => this.showViewPicker() },
      { title:'地图上的逗号',run:() => this.showHeatInfo() },
      { title:demoMode ? '演示说明' : '定位与连接状态',run:() => this.showMapStatus() },
      { title:'切换体验模式',run:() => this.chooseMode() }
    ]
    if (!demoMode && this.data.view !== 'street') actions.splice(2,0,{ title:'地图缩放',run:() => this.showMapZoom() })
    this._menuOpen = true
    wx.showActionSheet({ itemList:actions.map(action => action.title),
      success:result => { const action = actions[result.tapIndex]; if (action) wx.nextTick(() => { if (this._visible) action.run() }) },
      complete:() => { this._menuOpen = false } })
  },
  showMapZoom() {
    const campusView=this.data.view==='campus'
    wx.showActionSheet({ itemList:campusView ? ['放大地图','缩小地图','查看整校'] : ['放大地图','缩小地图'],success:result => {
      if(!this._visible)return
      if(campusView && this.data.view==='campus' && this._renderer){
        if(result.tapIndex===2)this._renderer.overview()
        else this._renderer.zoom(result.tapIndex===0?1:-1)
      } else if(this.data.view==='map')this.zoom(result.tapIndex===0?1:-1)
    } })
  },
  showViewPicker() {
    const demoMode=this.data.mode==='demo'
    wx.showActionSheet({itemList:demoMode ? ['贸大夜游地图 · 可开启定位',this.data.overview?'演示街区 · 街景视角':'演示街区 · 俯视视角'] : ['标准地图','贸大夜游地图','3D 空间示意'],success:result=>{
      if(!this._visible)return
      if(demoMode){if(result.tapIndex===0)this.openCampus();else this.toggleView()}
      else this.setView(['map','campus','street'][result.tapIndex])
    }})
  },
  openCampus() {if(this.data.mode==='demo')this.switchMode('live','campus');else this.setView('campus')},
  campusInfo() {
    wx.showModal({title:'贸大夜游底图',content:'© OpenStreetMap contributors · ODbL\n底图按开放坐标绘制，尚未现场校准，东北片区等建筑仍待补绘。树木、灯光和屋顶材质是艺术表现。\n蓝点来自手机 GPS；现场留话仍按原有位置与精度校验。可在“地图与场景”中切回标准地图。\n来源：openstreetmap.org/copyright',showCancel:false})
  },
  campusImageError() {this._campusError=true;this.refresh()},
  selectCampusPin(event) {
    if(Date.now()<(this._ignoreCampusTapUntil||0))return
    const group=(this._mapGroups||[]).find(item=>item.id===event.currentTarget.dataset.id)
    if(group)this.openGroup(group)
  },
  campusTap() {if(Date.now()>=(this._ignoreCampusTapUntil||0)){this.closeSheet();this.closeCard()}},
  showHeatInfo() {
    wx.showModal({ title:'地图上的逗号',content:'蓝点是你，逗号是留话。针脚末端是留话位置，缩放时固定在原坐标；蓝点始终置顶。\n逗号越深、略大，互动越热闹；数字是留话数量。附近列表可切换“最新”。',showCancel:false })
  },
  showMapStatus() {
    if (this.data.mode === 'demo') {
      wx.showModal({ title:'演示说明',content:'当前街区和留话为虚构演示，内容只保存在本机。可在“切换体验模式”中使用手机真实定位。',showCancel:false })
      return
    }
    wx.showModal({ title:'定位与连接',content:'定位：'+this.data.gpsStatus+'\n内容：'+(this.data.syncBusy ? '正在刷新' : this.data.cloudStatus)+'\n地图：'+(this.data.following ? '跟随当前位置' : '自由浏览'),
      confirmText:'定位详情',cancelText:'关闭',success:result => { if (result.confirm && this._visible) this.locationDetails() } })
  },
  noticeAction() {
    const action = this.data.mapNoticeAction
    if (action === 'recenter') this.recenter()
    else if (action === 'location') this.locationDetails()
    else if (action === 'connect') api.openConnect()
    else if (action === 'refresh') this.refreshNearby()
    else if (action === 'standard') this.setView('map')
  },
  privacyVisibility(event) {
    if(event.detail.visible){
      this._rendererEpoch=(this._rendererEpoch||0)+1
      if(this._renderer)this._renderer.destroy()
      this._renderer=null
    }
    this.setData({ privacyVisible:event.detail.visible }, () => { if (!event.detail.visible) this.initCanvas() })
  },
  recenter() {
    if (this.data.mode === 'demo') { this._yaw = 0; this.paint(); return }
    if(this.data.view==='campus' && geo.valid(this._position) && !campus.contains(this._position)){
      this.setView('map');this.setData({following:true},()=>this.refresh());this.beginLocation();return
    }
    this.setData({ following: true })
    this.refresh()
    this.beginLocation()
  },
  toggleView() {
    if (this.data.mode === 'demo') { this.setData({ overview: !this.data.overview }); this.paint(); return }
    const view = this.data.view === 'map' ? 'street' : 'map'
    this.setView(view)
  },
  setView(view) {
    if(!['map','street','campus'].includes(view)||this.data.mode!=='live')return
    if(view===this.data.view){if(view==='campus'&&this._renderer)this._renderer.overview();return}
    this._rendererEpoch = (this._rendererEpoch || 0) + 1
    if (this._renderer) this._renderer.destroy()
    this._renderer = null
    this._campusError=false
    this._markerSignature=''
    getApp().globalData.view = view
    preferences.save(this.data.mode,view)
    this.setData({ view, pins: [] }, () => { this.refresh(); this.initCanvas() })
  },
  walk(event) {
    if (this.data.mode !== 'demo') return
    const walk = Number(event.detail.value)
    getApp().globalData.demoWalk = walk
    this._position = demo.position(walk)
    this.setData({ walk, expanded: false }); this.refresh()
  },
  selectPin(event) {
    const group = (this._streetGroups || []).find(item => item.id === event.currentTarget.dataset.id)
    if (group) this.openGroup(group)
  },
  selectMarker(event) {
    this._ignoreMapTapUntil = Date.now() + 500
    const group = this._markerGroups && this._markerGroups.get(Number(event.detail.markerId))
    if (group) this.openGroup(group)
  },
  chooseNearby() {
    const posts = this.data.posts.filter(post => geo.distance(this._position,post)<=350)
    if (!posts.length) { this.emptyAction(); return }
    this.showSheet(null)
  },
  openGroup(group) {
    if (group.count === 1) { this.selectPost(group.postIds[0]); return }
    if (this.data.view !== 'street' && group.sceneCount > 1 && this.data.mapScale < (this.data.view==='campus'?19:20)) {
      const scale = Math.min(this.data.view==='campus'?19:20,this.data.mapScale + 2)
      const members = this.data.posts.filter(post => group.postIds.includes(post.id))
      const split = mapPoints.mapGroups(members,scale,null,false)
      this.setData({ mapScale:scale,latitude:group.latitude,longitude:group.longitude,following:false,
        cardVisible:false,sheetVisible:false,sheetRows:[] })
      this.refresh()
      if(this.data.view==='campus' && this._renderer)this._renderer.goTo(group,Math.min(19,scale))
      if (split.length > 1) { wx.showToast({ title:'已放大，点逗号查看',icon:'none' }); return }
    }
    this.showSheet(group.postIds)
  },
  showSheet(ids) {
    this._sheetIds = ids ? ids.slice() : null
    this.setData(Object.assign({ sheetVisible:true,cardVisible:false,expanded:false },this.sheetPatch(this.data.posts)))
    this.refresh()
  },
  sheetPatch(posts) {
    const members = posts.filter(post => geo.distance(this._position,post)<=350 && (!this._sheetIds || this._sheetIds.includes(post.id)))
    const scenes = new Set(members.map(post => post.sceneId || post.id))
    const rows = mapPoints.ranked(members,this.data.sheetSort).map(post => {
      const heat = mapPoints.heat(post)
      // displayText is already distance/expiry filtered; never use cached raw text.
      return { id:post.id,name:post.name,distanceLabel:post.distanceLabel,copy:post.displayText,
        likes:post.likes || 0,commentCount:post.commentCount || 0,owned:post.owned,
        tier:heat.tier,tag:heat.fresh && heat.tier === 1 ? '新留话' : heat.label,
        access:post.participated || post.owned ? '继续聊' : post.canReply ? '可接话' : '走近看看' }
    })
    return { sheetRows:rows,
      sheetTitle:this._sheetIds && scenes.size === 1 && members.length ? members[0].name : '附近的留话',
      sheetSubtitle:members.length + ' 条留话 · ' + scenes.size + ' 个地点' }
  },
  sortSheet(event) {
    this.setData({ sheetSort:event.currentTarget.dataset.sort === 'latest' ? 'latest' : 'heat' },() => this.refresh())
  },
  selectSheetPost(event) { this.selectPost(event.currentTarget.dataset.id) },
  selectPost(id) {
    if (!this.data.posts.some(post => post.id === id)) return
    this._selectedId = id
    this._sheetIds = null
    this.setData({ cardVisible:true,expanded:false,sheetVisible:false,sheetRows:[] }); this.refresh()
  },
  selectedGroup() {
    const groups = this.data.view !== 'street' ? this._mapGroups : this._streetGroups
    const group = (groups || []).find(item => item.postIds.includes(this._selectedId))
    if (group) this.showSheet(group.postIds)
  },
  closeSheet() { this._sheetIds = null; this.setData({ sheetVisible:false,sheetRows:[] }) },
  stopTap() {},
  nextPost() {
    const posts = this.data.posts.filter(post => geo.distance(this._position,post)<=350)
    if (!posts.length) return
    const index = posts.findIndex(post => post.id === this._selectedId)
    this.selectPost(posts[(index+1)%posts.length].id)
  },
  zoom(step) {
    this.setData({ mapScale:Math.max(14,Math.min(20,this.data.mapScale + step)) },() => this.refresh())
  },
  refreshNearby() {
    if (this.data.mode === 'demo') { this.refresh(); wx.showToast({ title:'附近已刷新',icon:'none' }); return }
    if (this._syncBusy) return
    if (!geo.valid(this._position)) { this.beginLocation(); return }
    this.syncNearby(true)
  },
  closeCard() { this.setData({ cardVisible: false, expanded: false }); this.refresh() },
  mapTap() { if (Date.now() >= (this._ignoreMapTapUntil || 0)) { this.closeSheet(); this.closeCard() } },
  mapChange(event) {
    const detail = event.detail || {},type = event.type === 'begin' || event.type === 'end' ? event.type : detail.type
    const causedBy = event.causedBy || detail.causedBy
    if (['gesture','drag','scale'].includes(causedBy)) this.setData({ following:false })
    if (type === 'end' && Number.isFinite(detail.scale) && detail.scale !== this.data.mapScale) {
      this.setData({ mapScale:detail.scale },() => this.refresh())
    }
  },
  touchStart(event) {
    if(this.data.view==='campus'){if(this._renderer)this._renderer.touchStart(event);return}
    const p = event.touches[0]
    this._touch = { x: p.clientX, y: p.clientY, yaw: this._yaw, moved: false }
  },
  touchMove(event) {
    if(this.data.view==='campus'){if(this._renderer)this._renderer.touchMove(event);return}
    if (!this._touch) return
    const p = event.touches[0], dx = p.clientX - this._touch.x, dy = p.clientY - this._touch.y
    if (Math.hypot(dx, dy) > 6) this._touch.moved = true
    if (this._touch.moved && !this.data.overview) {
      this._yaw = this._touch.yaw - dx * .004
      if (this.data.lookHint) this.setData({ lookHint: false })
      this.paint()
    }
  },
  touchEnd(event) { if(this.data.view==='campus'){if(this._renderer)this._renderer.touchEnd(event);return}if (this._touch && !this._touch.moved) this.closeCard(); this._touch = null },
  touchCancel(event) { if(this.data.view==='campus'){if(this._renderer)this._renderer.touchCancel(event);return}this._touch = null },
  async expand() {
    if (!this.data.selected || this.data.selected.level !== 'full') return
    if (this.data.mode === 'live' && !this.data.expanded) {
      try {
        const id = this._selectedId, post = await repository.thread('live',id,location.peek())
        if (!this._visible || this._selectedId !== id || this.data.mode !== 'live') return
        this._cloudPosts = this._cloudPosts.map(p => p.id === id ? post : p)
        this.refresh()
      } catch (error) { wx.showToast({ title:error.message || '暂未取得回复', icon:'none' }); return }
    }
    this.setData({ expanded: !this.data.expanded })
  },
  openThread() {
    if (!this._selectedId) return
    wx.navigateTo({ url: '/pages/thread/index?id=' + encodeURIComponent(this._selectedId) + '&mode=' + this.data.mode })
  },
  openCompose() { wx.switchTab({ url: '/pages/compose/index' }) },
  leaveHere() {
    if (!this.data.selected || !this.data.selected.canInteract) return
    getApp().globalData.composePlace = { mode:this.data.mode,place:drafts.place(this.data.selected) }
    this.openCompose()
  },
  emptyAction() {
    if (this.data.mode === 'demo' || this.data.syncState === 'ready') this.openCompose()
    else if (this.data.syncState === 'join') api.openConnect()
    else this.refreshNearby()
  },
  async like() {
    if (this.data.busy || !this._selectedId || !this.data.selected) return
    this.setData({ busy: true })
    try {
      const position = this.data.mode === 'demo' ? demo.position(this.data.walk) : await location.fresh()
      await repository.like(this.data.mode, this._selectedId, position, !this.data.selected.liked)
      this._position = position; this.refresh()
      if (this.data.mode === 'live') await this.syncNearby(true)
    } catch (error) { wx.showToast({ title: error.message || location.explain(error), icon: 'none' }) }
    finally { this.setData({ busy: false }) }
  },
  about() {
    wx.showModal({ title: '留答 · 邀请试用', content: '演示街区只保存在本机。配置联机服务并加入试用后，真实留话由后台按位置共享。私聊、支付和真实校园三维模型仍未接入。', showCancel: false })
  }
})
