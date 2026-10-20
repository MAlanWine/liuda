// 微信隐私授权与系统定位授权分别处理；同意状态以微信回调为准。
let initialized = false
const pending = new Set()
const listeners = new Set()
function notify() { listeners.forEach(fn => fn(pending.size > 0)) }
function init() {
  if (initialized || !wx.onNeedPrivacyAuthorization) return
  initialized = true
  wx.onNeedPrivacyAuthorization(resolve => { pending.add(resolve); notify() })
}
function ensure() {
  init()
  return new Promise((resolve, reject) => {
    if (!wx.requirePrivacyAuthorize || !wx.onNeedPrivacyAuthorization) {
      reject({ stage:'privacy', code:'PRIVACY_UNSUPPORTED', errMsg:'当前微信版本不支持隐私授权，请更新微信。' })
      return
    }
    wx.requirePrivacyAuthorize({ success:resolve,
      fail:error => reject(Object.assign({}, error, { stage:'privacy' })) })
  })
}
function settle(agreed, buttonId) {
  const callbacks = Array.from(pending)
  callbacks.forEach(resolve => pending.delete(resolve))
  callbacks.forEach(resolve => resolve(agreed ? { event:'agree', buttonId } : { event:'disagree' }))
  notify()
}
function subscribe(fn) { listeners.add(fn); fn(pending.size > 0); return () => listeners.delete(fn) }
module.exports = { init, ensure, subscribe, agree:buttonId => settle(true,buttonId), decline:() => settle(false) }
