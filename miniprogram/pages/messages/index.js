const store = require('../../services/store')
const repository = require('../../services/repository')
const api = require('../../services/api')
const time = require('../../utils/time')
const { selectTab } = require('../../utils/layout')
Page({
  data:{ posts:[],events:[],mode:'demo',replies:0,loading:false,connected:false,error:'',needsJoin:false,section:'mine' },
  onShow() {
    selectTab(this,2); this._visible = true; this._generation = (this._generation || 0) + 1
    const mode = getApp().globalData.mode
    if (mode !== this.data.mode) this.setData({ posts:[],events:[],error:'',section:'mine' })
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
      const [mineResult,eventResult] = await Promise.allSettled([repository.mine(mode),mode === 'live' ? api.activity() : Promise.resolve([])])
      if (!this._visible || generation !== this._generation) return
      if (mineResult.status === 'rejected') throw mineResult.reason
      const posts = mineResult.value,events = eventResult.status === 'fulfilled' ? eventResult.value : this.data.events
      const replies = mode === 'demo' ? store.all(mode).reduce((sum,post) => sum+post.comments.filter(c => c.mine).length,0) : events.length
      this.setData({ posts:posts.map(post => Object.assign({},post,{ timeLabel:time.label(post.createdAt) })),
        events:events.map(event => Object.assign({},event,{ timeLabel:time.label(event.createdAt) })),
        replies,connected:mode === 'live',error:eventResult.status === 'rejected' ? '留话已刷新，回应暂未同步。' : '',
        needsJoin:eventResult.status === 'rejected' && api.needsJoin(eventResult.reason) })
    } catch (error) {
      if (this._visible && generation === this._generation) this.setData({ error:error.message || '暂未同步',connected:false,needsJoin:api.needsJoin(error) })
    } finally { if (generation === this._generation) { this._busy = false; this.setData({ loading:false }) } }
  },
  switchSection(event) { this.setData({ section:event.currentTarget.dataset.section }) },
  open(event) { wx.navigateTo({ url:'/pages/thread/index?mode='+this.data.mode+'&id='+encodeURIComponent(event.currentTarget.dataset.id) }) },
  nearby() { wx.switchTab({ url:'/pages/explore/index' }) },
  compose() { wx.switchTab({ url:'/pages/compose/index' }) },
  connect() { api.openConnect() },
  about() { wx.showModal({ title:'留答 · 邀请试用',content:'在现场留下，也在现场接话。演示内容保存在本机；真实留话在加入试用后共享。',showCancel:false }) }
})
