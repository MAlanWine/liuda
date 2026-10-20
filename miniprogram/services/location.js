const geo = require('../utils/geo')
const privacy = require('./privacy')
const diagnostics = require('./location-diagnostics')
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
function fresh() {
  if (current && Date.now() - current.timestamp < 8000) return Promise.resolve(current)
  if (pendingFix) return pendingFix
  pendingFix = privacy.ensure().then(() => new Promise((resolve, reject) => {
    wx.getLocation({ type: 'gcj02', isHighAccuracy: true, highAccuracyExpireTime: 5000,
      success: result => {
        if (!geo.valid(result)) { reject(new Error('未获取到有效位置。')); return }
        receive(result)
        resolve(current)
      }, fail: error => reject(Object.assign({},error,{ stage:'getLocation' })) })
  })).catch(error => { diagnostics.capture(error); throw error }).finally(() => { pendingFix = null })
  return pendingFix
}
function start() {
  if (tracking) return fresh()
  if (startTask) return startTask
  const ticket = epoch
  startTask = fresh().then(position => {
    if (ticket !== epoch) throw Object.assign(new Error('定位已暂停'), { cancelled: true })
    return new Promise((resolve, reject) => {
      try {
        wx.offLocationChange(receive)
        wx.onLocationChange(receive)
      } catch (error) { reject(Object.assign({},error,{ stage:'onLocationChange',errMsg:error.errMsg || error.message })); return }
      wx.startLocationUpdate({ type: 'gcj02',
        success: () => {
          if (ticket !== epoch) {
            if (!startTask) { wx.stopLocationUpdate({}); wx.offLocationChange(receive) }
            reject(Object.assign(new Error('定位已暂停'), { cancelled: true })); return
          }
          tracking = true
          resolve(position)
        }, fail: error => { if (ticket === epoch) wx.offLocationChange(receive); reject(Object.assign({},error,{ stage:'startLocationUpdate' })) }
      })
    })
  }).catch(error => { diagnostics.capture(error); throw error }).finally(() => { if (ticket === epoch) startTask = null })
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
function problem(error) {
  const message = error && (error.errMsg || error.message) || ''
  if (error && error.code === 'PRIVACY_UNSUPPORTED') return { action:'none', message:'当前微信版本不支持隐私授权，请更新微信后重试。' }
  if (/requiredPrivateInfos|api.*(?:need|must).*declar/i.test(message)) {
    return { action:'none', message:'当前预览代码的位置接口声明未生效，请重新编译并扫码打开最新预览。可查看原始原因核对具体接口。' }
  }
  if (/scope is not declared|not declared in.*privacy|privacy.*(?:not configured|not found|not exist)/i.test(message)) {
    return { action:'none', message:'微信返回：当前生效的隐私指引未声明所需信息。请在同一个 AppID 的隐私指引中确认位置信息已声明并生效；接口开通与隐私声明需要分别完成。' }
  }
  if (/api.*(?:no permission|not authorized)|no permission to access|(?:getLocation|startLocationUpdate|onLocationChange):fail no permission/i.test(message)) {
    return { action:'none', message:'微信当前调用仍返回接口无权限。请核对正在预览的 AppID 与已开通接口的账号，并重新扫码打开最新预览。可查看失败接口与原始原因。' }
  }
  if (/privacy/i.test(message) || error && error.stage === 'privacy') return { action:'retry', message:'尚未完成小程序隐私授权。请重试，阅读指引并选择“同意并继续”；手机定位权限是另一项设置。' }
  if (/auth deny|auth denied|authorize.*(?:deny|denied)|permission denied|auth.*forbid/i.test(message)) return { action:'settings', message:'请在小程序设置中允许使用位置信息，并确认手机系统也允许微信使用定位。' }
  if (/system permission|location service|location.*disabled|gps.*disabled/i.test(message)) return { action:'settings', message:'请在手机系统设置中开启定位，并允许微信在使用期间访问准确位置。' }
  if (error && error.stage === 'startLocationUpdate') return { action:'retry', message:'已取得位置，但持续定位启动失败，请稍后重试。若持续出现，请联系发起人检查持续定位接口。' }
  return { action:'retry', message:'暂未取得位置。请确认手机定位已开启，在信号较好的地方重试。' }
}
function explain(error) { return problem(error).message }
module.exports = { fresh, start, stop, subscribe, peek: () => current, isTracking: () => tracking, explain, problem }
