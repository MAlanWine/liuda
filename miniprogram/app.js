const location = require('./services/location')
const api = require('./services/api')
const privacy = require('./services/privacy')
const preferences = require('./services/preferences')

App({
  globalData: { mode: 'demo', demoWalk: 0, view: 'street' },
  onLaunch() { Object.assign(this.globalData,preferences.read()); privacy.init() },
  onHide() { location.stop(); api.clearPhotos() }
})
