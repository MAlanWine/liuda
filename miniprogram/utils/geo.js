const EARTH = 6371008.8
const RAD = Math.PI / 180
const FULL_RADIUS = 50
const PREVIEW_RADIUS = 200
const MAX_ACCURACY = 30
const MAX_AGE = 15000

function valid(point) {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
}
function distance(a, b) {
  if (!valid(a) || !valid(b)) return Infinity
  const lat = (b.latitude - a.latitude) * RAD
  const lon = (b.longitude - a.longitude) * RAD
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * RAD) *
    Math.cos(b.latitude * RAD) * Math.sin(lon / 2) ** 2
  return EARTH * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
function offset(origin, east, north) {
  return { latitude: origin.latitude + north / EARTH / RAD,
    longitude: origin.longitude + east / (EARTH * Math.cos(origin.latitude * RAD)) / RAD }
}
function local(point, origin) {
  return { x: (point.longitude - origin.longitude) * RAD * EARTH * Math.cos(origin.latitude * RAD),
    z: -(point.latitude - origin.latitude) * RAD * EARTH }
}
function accuracy(point) {
  if (!point) return Infinity
  const n = point.horizontalAccuracy > 0 ? point.horizontalAccuracy : point.accuracy
  return Number.isFinite(n) && n > 0 ? n : Infinity
}
function gate(position, target, mode) {
  const d = distance(position, target)
  if (mode === 'demo') return { ok: d <= FULL_RADIUS, reason: '走到留话附近再接一句。' }
  if (!valid(position) || position.source !== 'gps') return { ok: false, reason: '请先开启手机定位。' }
  if (Date.now() - position.timestamp > MAX_AGE) return { ok: false, reason: '位置已过期，请重新定位。' }
  const error = accuracy(position)
  if (error > MAX_ACCURACY) return { ok: false, reason: '定位较弱，请到室外开阔处重新定位。' }
  if (d + error > FULL_RADIUS) return { ok: false, reason: '请再靠近一些，确认到场后才能操作。' }
  return { ok: true, reason: '' }
}
function decorate(post, position, mode) {
  const d = distance(position, post)
  const participated = mode === 'demo' && !!(post.owned || post.participated || post.comments.some(item => item.mine))
  const onsite = gate(position,post,mode).ok
  const full = participated || d <= FULL_RADIUS && (mode === 'demo' || onsite)
  const level = full ? 'full' : d <= PREVIEW_RADIUS ? 'preview' : 'dot'
  return Object.assign({}, post, {
    distance: Number.isFinite(d) ? Math.round(d) : null,
    distanceLabel: Number.isFinite(d) ? (d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm') : '待定位',
    level, displayText: full ? post.text : level === 'preview' ? post.teaser : '这里有人留过话，走近看看。',
    participated,accessMode:participated ? 'participant' : onsite ? 'onsite' : 'nearby',
    canInteract:onsite,canReply:participated || onsite,canLike:onsite,commentCount:post.comments.length,
    previewComments: post.comments.slice(-2)
  })
}
module.exports = { distance, offset, local, valid, accuracy, gate, decorate, FULL_RADIUS, PREVIEW_RADIUS, MAX_AGE }
