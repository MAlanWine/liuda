const { posts } = require('../../data/demo')

Page({
  data: { demoDistance: 800, posts },
  onDistanceChange(event) {
    this.setData({ demoDistance: Number(event.detail.value) })
  },
  openThread(event) {
    const id = encodeURIComponent(event.currentTarget.dataset.id)
    wx.navigateTo({ url: `/pages/thread/index?id=${id}&distance=${this.data.demoDistance}` })
  },
  openCompose() {
    wx.navigateTo({ url: '/pages/compose/index' })
  }
})
