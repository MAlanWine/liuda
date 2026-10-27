const KEY = 'liuda-view-preferences-v1'
function read() {
  let saved
  try { saved = wx.getStorageSync(KEY) } catch (error) {}
  const mode = saved && saved.mode === 'live' ? 'live' : 'demo'
  const view = saved && ['map','street','campus'].includes(saved.view) ? saved.view : mode === 'live' ? 'map' : 'street'
  return { mode,view:mode === 'demo' ? 'street' : view }
}
function save(mode,view) {
  try { wx.setStorageSync(KEY,{ mode:mode === 'live' ? 'live' : 'demo',view:['map','street','campus'].includes(view) ? view : 'map' }) } catch (error) {}
}
module.exports = { read,save }
