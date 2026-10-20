// 未提交的本人草稿只在当前运行内存中保留，演示与真实模式分别保存。
const drafts = {}
function place(value) {
  if (!value) return null
  return { id:value.id,sceneId:value.sceneId,name:value.name,latitude:value.latitude,longitude:value.longitude }
}
function read(mode) { return drafts[mode] || { text:'',name:'',selectedPlace:null,photoPath:'',photoPosition:null,attempt:null } }
function save(mode,value) {
  drafts[mode] = { text:value.text || '',name:value.name || '',selectedPlace:place(value.selectedPlace),
    photoPath:value.photoPath || '',photoPosition:value.photoPosition || null,attempt:value.attempt || null }
}
function clear(mode) { delete drafts[mode] }
module.exports = { read,save,clear,place }
