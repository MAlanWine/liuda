const { offset } = require('../utils/geo')
// 原点与所有示例点仅用于虚构街区演示，不代表贸大真实地点或建筑测绘数据。
const origin = { latitude: 39.9786, longitude: 116.4215 }
const scenes = [
  { id: 'stairs', name: '教学楼 · 门前台阶', east: -11.2, north: 40,
    text: '课没翘成，在这级台阶上先飞了一跤。', teaser: '这级台阶，走的时候留意一下……', likes: 23,
    comments: [{ id: 'a', name: '路人 A', text: '建议把这级台阶列入体育选修。' }, { id: 'b', name: '路人 B', text: '右边有扶手，下雨天记得走那边。' }] },
  { id: 'bench', name: '树下长椅', east: 10, north: 96,
    text: '这个座位有一个隐藏功能：坐下就不想去上课了。', teaser: '这个座位有一个隐藏功能……', likes: 12,
    comments: [{ id: 'c', name: '路人 A', text: '午饭后效果翻倍。' }] },
  { id: 'door', name: '教学楼 · 侧门', east: -19.6, north: 132,
    text: '这扇门请拉，别问我怎么知道的。', teaser: '第一次来的人，基本都会……', likes: 6, comments: [] }
]
const posts = scenes.map(item => Object.assign({}, item, offset(origin, item.east, item.north), {
  sceneId: 'demo-' + item.id, mode: 'demo', demo: true, owned: false, photoPath: '', createdAt: 0, liked: false
}))
// Additional local-only examples make grouping and all three heat sizes visible.
const demoNow = Date.now()
posts.push(Object.assign({},posts[0],{ id:'stairs-tip',text:'下雨的时候走右边，有扶手。',
  teaser:'下雨的时候，右边更好走……',likes:2,comments:[],createdAt:demoNow-3*86400000 }))
posts.push(Object.assign({},posts[0],{ id:'stairs-question',text:'这个门周末也开吗？路过的同学接一句。',
  teaser:'周末从这里进，门开吗？',likes:0,comments:[],createdAt:demoNow-2*3600000 }))
posts.push({ id:'quiet-corner',sceneId:'demo-quiet-corner',name:'路口 · 小树旁',
  ...offset(origin,-9,68),text:'这里的风刚刚好，发会儿呆。',teaser:'这里适合停一下……',
  likes:0,comments:[],mode:'demo',demo:true,owned:false,photoPath:'',liked:false,createdAt:demoNow-3600000 })
function position(walk) { return Object.assign(offset(origin, 0, walk), { source: 'demo', timestamp: Date.now(), accuracy: 1 }) }
module.exports = { posts, origin, position }
