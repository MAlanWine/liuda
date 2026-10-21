const demo = require('../data/demo')
const geo = require('../utils/geo')
const KEY = 'liuda-local-v2'
let memory
function load() {
  if (memory) return memory
  try { memory = wx.getStorageSync(KEY) } catch (e) { memory = null }
  if (!memory || memory.version !== 2) memory = { version: 2, live: [], demo: [], changes: {} }
  return memory
}
function commit(next) { wx.setStorageSync(KEY, next); memory = next }
function snapshot() { return JSON.parse(JSON.stringify(load())) }
function all(mode) {
  const db = load()
  if (mode === 'live') return db.live.slice()
  return db.demo.concat(demo.posts.map(post => Object.assign({}, post, db.changes[post.id] || {})))
}
function get(mode, id) { return all(mode).find(post => post.id === id) || null }
function nearby(mode, position) {
  return all(mode).map(post => geo.decorate(post, position, mode)).sort((a, b) => geo.distance(a, position) - geo.distance(b, position))
}
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function create(mode, position, input) {
  const check = geo.gate(position, input.place || position, mode)
  if (!check.ok) throw new Error(check.reason)
  const text = String(input.text || '').trim()
  if (!text || text.length > 300) throw new Error('请写下 1—300 字的留话。')
  const db = snapshot(), bucket = mode === 'live' ? db.live : db.demo
  if (bucket.length >= 50) throw new Error('本机体验版最多保存 50 条留话，请先删除一些。')
  const place = input.place || position
  const post = { id: id(), name: String(input.name || '').trim().slice(0, 40) || '路过的这个地方',
    sceneId: input.place ? (input.place.sceneId || input.place.id) : 'place-' + id(),
    latitude: place.latitude, longitude: place.longitude, coordinateSystem: 'gcj02',
    text, teaser: text.slice(0, 14) + '……', photoPath: input.photoPath || '',
    likes: 0, liked: false, comments: [], owned: true,participated:true, demo: mode === 'demo', mode,
    createdAt: Date.now(), accuracy: geo.accuracy(position) }
  bucket.unshift(post)
  commit(db)
  return post
}
function change(mode, post, fn) {
  const db = snapshot(), value = fn(JSON.parse(JSON.stringify(post)))
  if (mode === 'demo' && demo.posts.some(item => item.id === post.id)) db.changes[post.id] = value
  else {
    const bucket = mode === 'live' ? db.live : db.demo, index = bucket.findIndex(item => item.id === post.id)
    if (index < 0) throw new Error('留话已不存在。')
    bucket[index] = value
  }
  commit(db)
  return value
}
function interact(mode, postId, position, fn) {
  const post = get(mode, postId)
  if (!post) throw new Error('没有找到这条留话。')
  const check = geo.gate(position, post, mode)
  if (!check.ok) throw new Error(check.reason)
  return change(mode, post, fn)
}
function comment(mode, postId, position, text) {
  const content = String(text || '').trim()
  if (!content || content.length > 300) throw new Error('回复请写 1—300 字。')
  const post = get(mode,postId)
  if (!post) throw new Error('没有找到这条留话。')
  const participated = !!(post.owned || post.participated || post.comments.some(item => item.mine))
  if (!participated) {
    const check = geo.gate(position,post,mode)
    if (!check.ok) throw new Error(check.reason)
  }
  return change(mode,post,post => {
    if (post.comments.length >= 100) throw new Error('这条留话在本机已达到 100 条回复。')
    post.comments.push({ id:id(),name:'你 · 匿名',text:content,createdAt:Date.now(),mine:true,entry:participated ? 'continuation' : 'onsite' })
    post.participated = true
    post.updatedAt = Date.now()
    return post
  })
}
function like(mode, postId, position) {
  return interact(mode, postId, position, post => { post.likes += post.liked ? -1 : 1; post.liked = !post.liked; return post })
}
function remove(mode, postId) {
  const post = get(mode, postId)
  if (!post || !post.owned) throw new Error('只能删除自己在本机留下的内容。')
  const db = snapshot(), bucket = mode === 'live' ? 'live' : 'demo'
  db[bucket] = db[bucket].filter(item => item.id !== postId)
  commit(db)
  if (post.photoPath) wx.removeSavedFile({ filePath: post.photoPath })
}
function conversations(mode) {
  return all(mode).filter(post => post.owned || post.participated || post.comments.some(item => item.mine))
    .map(post => ({ id:post.id,name:post.name,owned:post.owned,participated:true,commentCount:post.comments.length,
      createdAt:post.createdAt,updatedAt:post.updatedAt || post.createdAt }))
    .sort((a,b) => (b.updatedAt || 0)-(a.updatedAt || 0))
}
module.exports = { all,get,nearby,create,comment,like,remove,conversations }
