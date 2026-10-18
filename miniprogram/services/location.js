const geo = require('../utils/geo')
let current = null
let tracking = false
let startTask = null
let epoch = 0
let pendingFix = null
const listeners = new Set()
function receive(result) {
  if (!geo.valid(result)) return
  current = Object.assign({}, result, { source: 'gps', coordinateSystem: 'gcj02', timestamp: Date.now() })
  listeners.forEach(fn => fn(current))
}
function privacy() {
  return new Promise((resolve, reject) => {
    if (wx.requirePrivacyAuthorize) wx.requirePrivacyAuthorize({ success: resolve, fail: reject })
    else resolve()
  })
}
function fresh() {
  if (current && Date.now() - current.timestamp < 8000) return Promise.resolve(current)
  if (pendingFix) return pendingFix
  pendingFix = privacy().then(() => new Promise((resolve, reject) => {
    wx.getLocation({ type: 'gcj02', isHighAccuracy: true, highAccuracyExpireTime: 5000,
      success: result => {
        if (!geo.valid(result)) { reject(new Error('未获取到有效位置。')); return }
        receive(result)
        resolve(current)
      }, fail: reject })
  })).finally(() => { pendingFix = null })
  return pendingFix
}
function start() {
  if (tracking) return Promise.resolve(current)
  if (startTask) return startTask
  const ticket = epoch
  startTask = fresh().then(position => {
    if (ticket !== epoch) throw Object.assign(new Error('定位已暂停'), { cancelled: true })
    return new Promise((resolve, reject) => {
      wx.offLocationChange(receive)
      wx.onLocationChange(receive)
      wx.startLocationUpdate({ type: 'gcj02',
        success: () => {
          if (ticket !== epoch) { wx.stopLocationUpdate({}); wx.offLocationChange(receive); reject(Object.assign(new Error('定位已暂停'), { cancelled: true })); return }
          tracking = true
          resolve(position)
        }, fail: error => { wx.offLocationChange(receive); reject(error) }
      })
    })
  }).finally(() => { if (ticket === epoch) startTask = null })
  return startTask
}
function stop() {
  epoch += 1
  startTask = null
  tracking = false
  wx.offLocationChange(receive)
  wx.stopLocationUpdate({})
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function explain(error) {
  const message = error && (error.errMsg || error.message) || ''
  if (/privacy/i.test(message)) return '请先阅读并同意小程序隐私保护指引。开发者需要在管理后台配置位置与相机用途。'
  if (/auth|authorize|deny|denied|permission/i.test(message)) return '请在微信设置中允许位置权限；开发者还需为这个 AppID 开通定位接口并配置隐私指引。'
  return '暂未取得持续定位。请检查手机定位、AppID 的定位接口权限和网络，再重试。'
}
module.exports = { fresh, start, stop, subscribe, peek: () => current, isTracking: () => tracking, explain }
