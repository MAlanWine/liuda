const { posts } = require('../../data/demo')

Page({
  data: { post: null, distance: 800 },
  onLoad(options) {
    const post = posts.find((item) => item.id === options.id)
    const rawDistance = Number(options.distance)
    const distance = Number.isFinite(rawDistance) ? Math.max(0, Math.min(1000, rawDistance)) : 800
    this.setData({ post: post || null, distance })
  },
  explainReply() {
    wx.showModal({ title: '现场评论', content: '正式版本会重新验证实时位置后才允许提交。当前后端尚未接通，未发送任何内容。', showCancel: false })
  },
  explainChat() {
    wx.showModal({ title: '匿名私聊 · 规则预览', content: '现场发起申请；作者同意后消耗付费额度。开通后离场可继续聊。任何一方都可以结束并双向删除站内会话。当前没有支付或私聊服务。', showCancel: false })
  }
})
