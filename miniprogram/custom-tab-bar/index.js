const { tabLayout } = require('../utils/layout')
Component({
  data: { selected: 0, safeBottom: 0 },
  lifetimes: {
    attached() {
      const routes = ['pages/explore/index', 'pages/compose/index', 'pages/messages/index']
      const pages = getCurrentPages(), page = pages[pages.length - 1]
      this.setData({ selected: Math.max(0, routes.indexOf(page && page.route)), safeBottom: tabLayout().safeBottom })
    }
  },
  methods: {
    switchPage(event) {
      const index = Number(event.currentTarget.dataset.index)
      const routes = ['/pages/explore/index', '/pages/compose/index', '/pages/messages/index']
      if (!routes[index] || index === this.data.selected || this._switching) return
      this._switching = true
      wx.switchTab({ url: routes[index], complete: () => { this._switching = false } })
    }
  }
})
