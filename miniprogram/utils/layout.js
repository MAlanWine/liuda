function tabLayout() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
  return { height: 62 + safeBottom, safeBottom, windowHeight: info.windowHeight, windowWidth: info.windowWidth }
}
function selectTab(page, selected) {
  function sync() { const bar = page.getTabBar && page.getTabBar(); if (bar) bar.setData({ selected }) }
  sync(); wx.nextTick(sync)
}
module.exports = { tabLayout, selectTab }
