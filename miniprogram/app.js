const location = require('./services/location')

App({
  globalData: { mode: 'demo', demoWalk: 0, view: 'street' },
  onHide() { location.stop() }
})
