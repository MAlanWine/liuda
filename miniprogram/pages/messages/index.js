const repository = require('../../services/repository')
const api = require('../../services/api')
const time = require('../../utils/time')
const { selectTab } = require('../../utils/layout')
Page({
  data:{ posts:[],threads:[],events:[],mode:'demo',replies:0,loading:false,connected:false,error:'',needsJoin:false,section:'joined' },
  onShow() {
    selectTab(this,2); this._visible = true; this._generation = (this._generation || 0) + 1
    const mode = getApp().globalData.mode
    if (mode !== this.data.mode) this.setData({ posts:[],threads:[],events:[],error:'',section:'joined' })
    this.setData({ mode }); this.load()
    this._timer = setInterval(() => { if (this.data.mode === 'live') this.load() },10000)
  },
  onHide() { this.leave() },onUnload() { this.leave() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  leave() { this._visible = false; clearInterval(this._timer); this._generation = (this._generation || 0) + 1; this._busy = false },
  async load() {
    if (this._busy) return
    this._busy = true; const generation = this._generation
    this.setData({ loading:true })
    try {
      const mode = this.data.mode
      const result = await repository.inbox(mode)
      if (!this._visible || generation !== this._generation) return
      const posts = result.mine,events = result.events,threads = result.threads
      this.setData({ posts:posts.map(post => Object.assign({},post,{ timeLabel:time.label(post.createdAt) })),
        threads:threads.map(post => Object.assign({},post,{ timeLabel:time.label(post.updatedAt || post.createdAt) })),
        events:events.map(event => Object.assign({},event,{ timeLabel:time.label(event.createdAt) })),
        replies:events.length,connected:mode === 'live',error:'',needsJoin:false })
    } catch (error) {
      if (this._visible && generation === this._generation) this.setData({ error:error.message || '暂未同步',connected:false,needsJoin:api.needsJoin(error) })
    } finally { if (generation === this._generation) { this._busy = false; this.setData({ loading:false }) } }
  },
  switchSection(event) { this.setData({ section:event.currentTarget.dataset.section }) },
  open(event) { wx.navigateTo({ url:'/pages/thread/index?mode='+this.data.mode+'&id='+encodeURIComponent(event.currentTarget.dataset.id) }) },
  nearby() { wx.switchTab({ url:'/pages/explore/index' }) },
  compose() { wx.switchTab({ url:'/pages/compose/index' }) },
  connect() { api.openConnect() },
  about() { wx.showModal({ title:'留答 · 邀请试用',content:'到场开启交流，离场也能继续。发布新留话、首次接话需要到场；参与过的具体对话可在这里继续。演示内容只保存在本机。',showCancel:false }) }
})
