const geo = require('./geo')
const markerStyle = require('./map-marker-style')
const DAY = 86400000
const { COLORS,SIZES,appearance } = markerStyle
const safeCount = value => Number.isFinite(value) ? Math.max(0,Math.floor(value)) : 0

function heat(post,now = Date.now()) {
  let participants = safeCount(post.replyParticipantCount)
  if (post.demo && !Number.isFinite(post.replyParticipantCount)) {
    participants = new Set((post.comments || []).filter(item => !item.mine).map(item => item.name)).size
  }
  // A legacy server without participant counts gets no comment-based boost.
  // Counting raw replies here would reward repeated replies by one person.
  const activity = post.lastEngagedAt || post.createdAt
  const age = activity > 0 ? Math.max(0,now - activity) : 0
  const score = (safeCount(post.likes) + 3 * participants) * Math.pow(.5,age / (7 * DAY))
  const tier = score >= 20 ? 3 : score >= 5 ? 2 : 1
  return { score,tier,color:COLORS[tier-1],size:SIZES[tier-1],
    label:['普通','有回应','热门'][tier-1],fresh:post.createdAt > 0 && now - post.createdAt >= 0 && now - post.createdAt < DAY }
}
function pixel(point,scale) {
  const lat = Math.max(-85,Math.min(85,point.latitude)) * Math.PI / 180
  const world = 256 * Math.pow(2,scale)
  return { x:(point.longitude + 180) / 360 * world,
    y:(.5 - Math.log((1 + Math.sin(lat)) / (1 - Math.sin(lat))) / (4 * Math.PI)) * world }
}
function groups(posts,project,selectedId,cardVisible) {
  const items = posts.filter(geo.valid).slice().sort((a,b) => String(a.id).localeCompare(String(b.id)))
    .map(post => ({ post,point:project(post) })).filter(item => item.point && Number.isFinite(item.point.x) && Number.isFinite(item.point.y))
  const parents = items.map((_,i) => i)
  function root(i) { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i] } return i }
  for (let i=0;i<items.length;i++) for (let j=0;j<i;j++) {
    const a = items[i],b = items[j]
    const same = a.post.sceneId && a.post.sceneId === b.post.sceneId
    // Join overlapping screen footprints; real coordinates/scenes remain intact.
    if (same || (Math.abs(a.point.x-b.point.x) < 80 && Math.abs(a.point.y-b.point.y) < 60)) parents[root(i)] = root(j)
  }
  const buckets = new Map(),now = Date.now()
  items.forEach((item,i) => { const key = root(i); if (!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(item) })
  return Array.from(buckets.values()).map(bucket => {
    const x = bucket.reduce((sum,item) => sum+item.point.x,0)/bucket.length
    const y = bucket.reduce((sum,item) => sum+item.point.y,0)/bucket.length
    // Anchor a display group to a real member, never manufacture a new place.
    const anchor = bucket.reduce((best,item) => Math.hypot(item.point.x-x,item.point.y-y) < Math.hypot(best.point.x-x,best.point.y-y) ? item : best)
    const postIds = bucket.map(item => item.post.id)
    const sceneCount = new Set(bucket.map(item => item.post.sceneId || item.post.id)).size
    const hottest = bucket.map(item => heat(item.post,now)).sort((a,b) => b.score-a.score)[0]
    const active = !!cardVisible && postIds.includes(selectedId)
    return Object.assign({ id:postIds.join('|'),postIds,sceneCount,count:bucket.length,
      name:sceneCount === 1 ? anchor.post.name : '附近的留话',
      latitude:anchor.post.latitude,longitude:anchor.post.longitude,
      x:Math.round(anchor.point.x),y:Math.round(anchor.point.y),
      tier:hottest.tier,heatLabel:hottest.label,active },appearance(hottest.tier,bucket.length,active))
  })
}
function mapGroups(posts,scale,selectedId,cardVisible) {
  return groups(posts,post => pixel(post,scale),selectedId,cardVisible)
    .map(group => Object.assign({},group,appearance(group.tier,group.count,group.active,true)))
}
function streetGroups(pins,posts,selectedId,cardVisible) {
  const visible = new Map(pins.filter(pin => pin.visible).map(pin => [pin.id,pin]))
  return groups(posts.filter(post => visible.has(post.id)),post => visible.get(post.id),selectedId,cardVisible)
}
function ranked(posts,sort) {
  if (sort === 'latest') return posts.slice().sort((a,b) => (b.createdAt || 0)-(a.createdAt || 0) || String(a.id).localeCompare(String(b.id)))
  const now = Date.now(),ordered = posts.slice().sort((a,b) => heat(b,now).score-heat(a,now).score || (b.createdAt || 0)-(a.createdAt || 0))
  // Reserve the first and then every fourth slot for a recent ordinary post.
  const fresh = ordered.filter(post => heat(post,now).fresh && heat(post,now).tier === 1).sort((a,b) => b.createdAt-a.createdAt)
  const result = [],used = new Set()
  while (result.length < ordered.length) {
    const candidate = result.length % 4 === 0 ? fresh.find(post => !used.has(post.id)) : null
    const post = candidate || ordered.find(item => !used.has(item.id))
    if (!post) break
    used.add(post.id); result.push(post)
  }
  return result
}
module.exports = { heat,appearance,mapGroups,streetGroups,ranked }
