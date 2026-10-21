const config = require('../config/cloud')
const location = require('./location')
let initialized = false, joined = false, joining = null, clockOffset = 0,protocol = 0
function error(code, message) { return Object.assign(new Error(message), { code }) }
function configured() { return !!(config.enabled && config.envId && wx.cloud) }
function init() {
  if (!configured()) throw error('CLOUD_NOT_CONFIGURED', '联机试用尚未开放，请先完成云环境配置。')
  if (!initialized) { wx.cloud.init({ env:config.envId, traceUser:false }); initialized = true }
}
async function call(action, payload = {}) {
  init()
  let response
  const started = Date.now()
  try { response = await wx.cloud.callFunction({ name:config.functionName, data:Object.assign({}, payload, { action }), config:{ env:config.envId } }) }
  catch (cause) { throw error('NETWORK_ERROR', '联机请求未完成，请检查网络后重试。') }
  const body = response && response.result
  if (!body || typeof body.ok !== 'boolean') throw error('SERVICE_UNAVAILABLE', '联机服务返回异常。')
  if (Number.isFinite(body.serverTime)) clockOffset = body.serverTime - (started + Date.now()) / 2
  if (!body.ok) {
    if (!body.error || typeof body.error.code !== 'string' || typeof body.error.message !== 'string') throw error('SERVICE_UNAVAILABLE', '联机服务返回异常。')
    if (['INVITE_REQUIRED','AUTH_REQUIRED','PILOT_CLOSED','FORBIDDEN'].includes(body.error.code)) joined = false
    throw error(body.error.code, body.error.message)
  }
  return body.data
}
async function ensure() {
  if (joined) return
  if (!joining) joining = call('status').then(result => { joined = true; protocol = result.protocol || 1 }).finally(() => { joining = null })
  return joining
}
function serialize(position) {
  return { latitude:position.latitude, longitude:position.longitude, accuracy:position.accuracy,
    horizontalAccuracy:position.horizontalAccuracy, source:position.source,
    coordinateSystem:'gcj02', timestamp:position.timestamp + clockOffset }
}
function requestId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14) + '-' + Math.random().toString(36).slice(2, 10) }
async function read(action, payload, position) {
  await ensure()
  const p = position || await location.fresh()
  return call(action, Object.assign({}, payload, { position:serialize(p) }))
}
async function ticket(purpose, postId) {
  await ensure()
  const position = await location.fresh()
  return call('presence', { purpose, postId:postId || '', position:serialize(position) })
}
async function write(action, purpose, payload, id) {
  const presence = await ticket(purpose, payload.postId)
  const position = await location.fresh()
  return call(action, Object.assign({}, payload, { requestId:id || requestId(), ticket:presence.ticket, position:serialize(position) }))
}
function normalize(post) {
  // 服务端已决定层次。客户端只能收紧权限，不能从本地缓存补回全文。
  return Object.assign({ comments:[], previewComments:[], photoPath:'', liked:false }, post,
    { canReply:typeof post.canReply === 'boolean' ? post.canReply : !!post.canInteract,
      canLike:typeof post.canLike === 'boolean' ? post.canLike : !!post.canInteract,
      participated:post.participated === true,
      readExpiresAt:post.readExpiresAt ? post.readExpiresAt - clockOffset : 0 })
}
function visible(post, position) {
  if (!post) return null
  const geo = require('../utils/geo')
  const distance = geo.distance(position, post), dot = distance > 200
  const value = Object.assign({}, post, { distance:Number.isFinite(distance) ? Math.round(distance) : null, distanceLabel:Number.isFinite(distance) ? Math.round(distance) + 'm' : '等待定位' })
  if (post.participated && post.accessMode === 'participant') {
    if (Date.now() >= post.readExpiresAt) return Object.assign(value,{ level:'dot',text:'',displayText:'对话信息已过期，刷新后继续。',
      comments:[],previewComments:[],photoPath:'',photoPresent:false,canInteract:false,canReply:false,canLike:false })
    const onsite = !!post.canInteract && geo.gate(position,post,'live').ok
    return Object.assign(value,{ canReply:true,canInteract:onsite,canLike:onsite,
      distanceLabel:Number.isFinite(distance) ? value.distanceLabel : '可离场继续' })
  }
  if ((post.level === 'full' && (Date.now() >= post.readExpiresAt || !geo.gate(position, post, 'live').ok)) || (post.level === 'preview' && dot)) {
    return Object.assign(value, { level:dot ? 'dot' : 'preview', teaser:dot ? '' : post.teaser,
      text:'', displayText:dot ? '这里有人留过话，走近看看。' : post.teaser || '再走近一点。',
      comments:[], previewComments:[], photoPath:'', photoPresent:false, canInteract:false,canReply:false,canLike:false })
  }
  return value
}
async function nearby(position) {
  const result = await read('nearby', {}, position)
  return { posts:result.posts.map(normalize), limited:result.limited }
}
function requireContinuationProtocol() {
  if (protocol < 2) throw error('SERVER_UPDATE_REQUIRED','云函数尚未更新，请先部署支持离场续聊的新版 liudaApi。')
}
async function readConversation(action,id,position) {
  await ensure(); requireContinuationProtocol()
  const payload = { postId:id }
  // A participant can read without requesting or transmitting a new GPS fix.
  if (position && position.source === 'gps' && Date.now()-position.timestamp < 15000) payload.position = serialize(position)
  try { return await call(action,payload) }
  catch (cause) {
    if (cause.code !== 'LOCATION_REQUIRED') throw cause
    return call(action,{ postId:id,position:serialize(await location.fresh()) })
  }
}
async function thread(id, position) { return normalize(await readConversation('thread',id,position)) }
async function create(input, id) { return write('post', 'post', { name:input.name, text:input.text, sceneId:input.sceneId || '', photoId:input.photoId || '' }, id) }
async function addComment(postId,text,id,continuation = false) {
  if (!continuation) return write('comment','comment',{ postId,text },id)
  await ensure(); requireContinuationProtocol()
  return call('continueComment',{ postId,text,requestId:id || requestId() })
}
async function setLike(postId, desired, id) { return write('like', 'like', { postId, desired }, id) }
async function remove(postId, id) { await ensure(); return call('delete',{ postId,requestId:id || requestId() }) }
async function join(inviteCode) { const result = await call('join', { inviteCode }); joined = true; protocol = result.protocol || 1; return result }
async function mine() { await ensure(); return (await call('mine')).posts }
async function conversations() { await ensure(); requireContinuationProtocol(); return (await call('conversations')).threads }
async function inbox() { await ensure(); requireContinuationProtocol(); return call('inbox') }
async function activity() { await ensure(); return (await call('activity')).events }
async function preparePhoto(path) {
  const info = await new Promise((resolve, reject) => wx.getImageInfo({ src:path, success:resolve, fail:reject }))
  const ratio = Math.min(1, 1024 / Math.max(info.width, info.height))
  const compressed = await new Promise((resolve, reject) => wx.compressImage({ src:path, quality:45,
    compressedWidth:Math.round(info.width * ratio), compressedHeight:Math.round(info.height * ratio), success:resolve, fail:reject }))
  const file = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath:compressed.tempFilePath, encoding:'base64', success:resolve, fail:reject }))
  if (file.data.length > 700000) throw error('PHOTO_SIZE', '图片仍然过大，请重新拍摄或先只留文字。')
  return file.data
}
async function uploadPhoto(base64, id) { return write('uploadPhoto', 'photo', { base64 }, id) }
const photoPaths = new Map()
async function readPhoto(postId, position) {
  const result = await readConversation('photo',postId,position)
  if (!result.base64) return ''
  const path = wx.env.USER_DATA_PATH + '/liuda-view-' + postId + (result.contentType === 'image/png' ? '.png' : '.jpg')
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath:path, data:result.base64, encoding:'base64', success:resolve, fail:reject }))
  photoPaths.set(postId, path)
  return path
}
function clearPhoto(postId) {
  const path = photoPaths.get(postId)
  if (path) { wx.getFileSystemManager().unlink({ filePath:path, fail:() => {} }); photoPaths.delete(postId) }
}
function clearPhotos() { Array.from(photoPaths.keys()).forEach(clearPhoto) }
function needsJoin(cause) { return ['INVITE_REQUIRED','AUTH_REQUIRED','CLOUD_NOT_CONFIGURED','PILOT_CLOSED','SERVER_NOT_READY'].includes(cause && cause.code) }
function openConnect() {
  const pages = getCurrentPages()
  if (pages.length && pages[pages.length - 1].route === 'pages/connect/index') return
  wx.navigateTo({ url:'/pages/connect/index' })
}
module.exports = { configured, init, ensure, join, nearby, thread, create, addComment, setLike, remove,
  mine,conversations,inbox,activity,preparePhoto,uploadPhoto,readPhoto,clearPhoto,clearPhotos,visible,requestId,needsJoin,openConnect }
