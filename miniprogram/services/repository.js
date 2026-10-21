const store = require('./store')
const geo = require('../utils/geo')
const api = require('./api')
async function nearby(mode, position) { return mode === 'demo' ? store.nearby('demo', position) : (await api.nearby(position)).posts }
async function thread(mode, id, position) {
  if (mode !== 'demo') return api.thread(id, position)
  const value = store.get('demo', id)
  if (!value) throw Object.assign(new Error('这条留话已不可用。'),{ code:'POST_MISSING' })
  return geo.decorate(value, position, 'demo')
}
async function create(mode, position, input, requestId) {
  if (mode === 'demo') return store.create(mode, position, input)
  return api.create({ name:input.name, text:input.text, sceneId:input.place && input.place.sceneId, photoId:input.photoId }, requestId)
}
async function comment(mode,id,position,text,requestId,continuation = false) { return mode === 'demo' ? store.comment(mode,id,position,text) : api.addComment(id,text,requestId,continuation) }
async function like(mode, id, position, desired) { return mode === 'demo' ? store.like(mode,id,position) : api.setLike(id,desired) }
async function remove(mode, id, requestId) { return mode === 'demo' ? store.remove(mode,id) : api.remove(id,requestId) }
async function mine(mode) { return mode === 'demo' ? store.all(mode).filter(post => post.owned).map(p => Object.assign({}, p, { commentCount:p.comments.length })) : api.mine() }
async function conversations(mode) { return mode === 'demo' ? store.conversations(mode) : api.conversations() }
async function inbox(mode) {
  if (mode !== 'demo') return api.inbox()
  const threads = store.conversations(mode)
  return { threads,mine:threads.filter(post => post.owned),events:[] }
}
module.exports = { nearby,thread,create,comment,like,remove,mine,conversations,inbox }
