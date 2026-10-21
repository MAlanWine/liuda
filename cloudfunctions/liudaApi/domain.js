const crypto = require('crypto')
const EARTH = 6371008.8, RAD = Math.PI / 180
class PublicError extends Error {
  constructor(code, message) { super(message); this.code = code; this.public = true }
}
const fail = (code, message) => { throw new PublicError(code, message) }
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const random = () => crypto.randomBytes(24).toString('hex')
const aliasHash = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex')
function equal(a, b) {
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb)
}
function text(value, maximum, name) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail('INVALID_INPUT', name + '长度不正确。')
  return value.trim()
}
function point(value, now) {
  if (!value || value.source !== 'gps' || value.coordinateSystem !== 'gcj02' ||
      !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
      Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) fail('INVALID_LOCATION', '请使用手机真实定位。')
  if (!Number.isFinite(value.timestamp) || value.timestamp > now + 5000 || now - value.timestamp > 15000) fail('STALE_LOCATION', '位置已过期，请重新定位。')
  const accuracy = value.horizontalAccuracy > 0 ? value.horizontalAccuracy : value.accuracy
  if (!Number.isFinite(accuracy) || accuracy <= 0) fail('WEAK_LOCATION', '未取得有效定位精度。')
  return { latitude: value.latitude, longitude: value.longitude, accuracy, timestamp: value.timestamp }
}
function distance(a, b) {
  const lat = (b.latitude - a.latitude) * RAD, lon = (b.longitude - a.longitude) * RAD
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(lon / 2) ** 2
  return EARTH * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
function onsite(position, target) { return position.accuracy <= 30 && distance(position, target) + position.accuracy <= 50 }
function requireOnsite(position, target) {
  if (position.accuracy > 30) fail('WEAK_LOCATION', '定位较弱，请到室外开阔处重试。')
  if (!onsite(position, target)) fail('NOT_ONSITE', '已经离开现场，请走近后再操作。')
}
function level(position, target) { return onsite(position, target) ? 'full' : distance(position, target) <= 200 ? 'preview' : 'dot' }
function summary(post, position, uid, participated = false) {
  const onsiteNow = !!position && onsite(position,post)
  const tier = participated ? 'full' : position ? level(position,post) : 'dot'
  const full = tier === 'full', d = position ? Math.round(distance(position,post)) : null
  const displayText = full ? post.text : tier === 'preview' ? post.teaser : '这里有人留过话，走近看看。'
  return { id: post._id, sceneId: post.sceneId, name: post.name,
    latitude: post.latitude, longitude: post.longitude, coordinateSystem: 'gcj02',
    level: tier, displayText, text: full ? post.text : '', teaser: tier === 'dot' ? '' : post.teaser,
    distance:d, distanceLabel:d === null ? '已参与' : d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm',
    participated,accessMode:participated ? 'participant' : onsiteNow ? 'onsite' : 'nearby',
    canInteract:onsiteNow,canReply:participated || onsiteNow,canLike:onsiteNow,
    commentCount: post.commentCount, likes: post.likeCount, liked: false,
    replyParticipantCount: Array.isArray(post.replyParticipantIds) ? post.replyParticipantIds.length : 0,
    lastEngagedAt: post.lastEngagedAt || post.createdAt,
    photoPresent: full && !!post.photoId, photoPath: '', comments: [], previewComments: [],
    owned: post.owner === uid, demo: false, mode: 'live', createdAt: post.createdAt,
    readExpiresAt:participated ? Date.now()+60000 : position ? Math.min(Date.now()+12000,position.timestamp+15000) : 0 }
}
function mime(buffer) {
  if (buffer.length > 524288 || buffer.length < 12) fail('PHOTO_SIZE', '图片应小于 512KB，请重新拍摄。')
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  fail('PHOTO_FORMAT', '只支持现场 JPEG 或 PNG 图片。')
}
module.exports = { PublicError, fail, hash, random, aliasHash, equal, text, point, distance, onsite, requireOnsite, summary, mime }
