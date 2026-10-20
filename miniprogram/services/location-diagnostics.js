// 仅在内存保留失败原因和授权状态；不记录或上传坐标、照片、用户身份或凭据。
const BUILD = 'location-diag-20261019-01'
let lastFailure = null
function safeText(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/https?:\/\/\S+/gi,'[链接已隐藏]')
    .replace(/\b(?:token|secret|openid|authorization)\s*[=:]\s*[^\s,;]+/gi,'[敏感字段已隐藏]')
    .replace(/[+-]?\d{1,3}\.\d{4,}/g,'[数值已隐藏]')
    .slice(0,360)
}
function capture(error) {
  if (!error || error.cancelled) return
  lastFailure = {
    api:safeText(error.stage || 'unknown'),
    errMsg:safeText(error.errMsg || error.message || '未返回错误说明'),
    errno:safeText(error.errno), errCode:safeText(error.errCode), code:safeText(error.code),
    occurredAt:new Date().toISOString()
  }
}
function syncRead(name, select) {
  if (typeof wx[name] !== 'function') return { available:false }
  try { return Object.assign({ available:true },select(wx[name]())) }
  catch (error) { return { available:true, error:safeText(error.errMsg || error.message) } }
}
function asyncRead(name, select) {
  return new Promise(resolve => {
    if (typeof wx[name] !== 'function') { resolve({ available:false }); return }
    try { wx[name]({ success:value => resolve(Object.assign({ available:true },select(value))),
      fail:error => resolve({ available:true,error:safeText(error.errMsg || error.message) }) }) }
    catch (error) { resolve({ available:true,error:safeText(error.errMsg || error.message) }) }
  })
}
async function collect() {
  const account = syncRead('getAccountInfoSync',value => ({
    appId:value.miniProgram && value.miniProgram.appId,
    envVersion:value.miniProgram && value.miniProgram.envVersion,
    version:value.miniProgram && value.miniProgram.version
  }))
  const runtime = syncRead('getAppBaseInfo',value => ({ SDKVersion:value.SDKVersion,version:value.version }))
  const system = syncRead('getSystemSetting',value => ({ locationEnabled:value.locationEnabled }))
  const wechat = syncRead('getAppAuthorizeSetting',value => ({
    locationAuthorized:value.locationAuthorized,locationReducedAccuracy:value.locationReducedAccuracy
  }))
  const [scope,privacy] = await Promise.all([
    asyncRead('getSetting',value => ({ locationAuthorized:value.authSetting && value.authSetting['scope.userLocation'] })),
    asyncRead('getPrivacySetting',value => ({ needAuthorization:value.needAuthorization,privacyContractName:safeText(value.privacyContractName) }))
  ])
  return { build:BUILD,lastFailure:lastFailure && Object.assign({},lastFailure),account,runtime,system,wechat,scope,privacy }
}
module.exports = { capture, collect }
