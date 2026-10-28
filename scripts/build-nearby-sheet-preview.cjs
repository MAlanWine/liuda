// Layout-only fixtures using the production WXML/WXSS. No GPS, camera or API calls.
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname,'..')
const markup = fs.readFileSync(path.join(root,'miniprogram/pages/explore/index.wxml'),'utf8')
const escape = value => String(value == null ? '' : value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const brand = 'data:image/png;base64,' + fs.readFileSync(path.join(root,'miniprogram/assets/brand/liuda-comma.png')).toString('base64')
const tree = { tag:'root',children:[] },stack = [tree]
for (const token of markup.match(/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g)) {
  if (token.startsWith('</')) { stack.pop(); continue }
  if (!token.startsWith('<')) { stack.at(-1).children.push({text:token}); continue }
  const tag = token.match(/^<([\w-]+)/)[1],attrs = {}
  for (const match of token.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[match[1]] = match[2]
  if (/\bwx:else(?:\s|>)/.test(token)) attrs['wx:else'] = ''
  const node = {tag,attrs,children:[]}; stack.at(-1).children.push(node)
  if (!token.endsWith('/>')) stack.push(node)
}
const expression = (code,data) => Function('d','with(d){return (' + code + ')}')(data)
const interpolate = (text,data) => text.replace(/{{(.*?)}}/g,(_,code)=>expression(code,data) ?? '')
function render(nodes,data) {
  let chain = false
  return nodes.map(node => {
    if (node.text !== undefined) return escape(interpolate(node.text,data))
    const a = node.attrs
    if ('wx:if' in a) { chain = !!expression(a['wx:if'].slice(2,-2),data); if (!chain) return '' }
    else if ('wx:elif' in a) { if (chain) return ''; chain = !!expression(a['wx:elif'].slice(2,-2),data); if (!chain) return '' }
    else if ('wx:else' in a) { if (chain) return ''; chain = true }
    else chain = false
    if (a['wx:for']) return expression(a['wx:for'].slice(2,-2),data).map(item=>render([{...node,attrs:Object.fromEntries(Object.entries(a).filter(([key])=>key!=='wx:for'))}],{...data,item})).join('')
    if (node.tag === 'privacy-gate') return ''
    if (node.tag === 'block') return render(node.children,data)
    const tag = {view:'div',text:'span',image:'img','cover-view':'div','cover-image':'img'}[node.tag] || node.tag
    let attributes = ''
    for (const [key,value] of Object.entries(a)) {
      if (!['class','src','placeholder','maxlength','aria-label','aria-role','style','disabled'].includes(key)) continue
      const resolved = interpolate(value,data)
      if (key === 'disabled') { if (resolved === 'true') attributes += ' disabled'; continue }
      attributes += ' ' + key + '="' + escape(key === 'src' ? brand : resolved) + '"'
    }
    if (tag === 'input') attributes += ' value="' + escape(interpolate(a.value || '',data)) + '"'
    if (['img','input'].includes(tag)) return '<' + tag + attributes + '>'
    return '<' + tag + attributes + '>' + (tag === 'textarea' ? escape(interpolate(a.value || '',data)) : render(node.children,data)) + '</' + tag + '>'
  }).join('')
}
function findSheet(node) {
  if (node.attrs && node.attrs.class === 'point-sheet') return node
  for (const child of node.children || []) { const found = findSheet(child); if (found) return found }
}
const sheet = findSheet(tree)
const rows = [
  {id:'a',owned:true,participated:true,name:'图书馆西门',distanceLabel:'约 12m',copy:'西门的还书箱，晚上也能用。',likesLabel:'12',commentsLabel:'3',tier:1,access:'可续聊'},
  {id:'b',owned:false,participated:false,name:'教学楼北侧长椅',distanceLabel:'约 32m',copy:'下午这里有树荫，适合坐一会儿。',likesLabel:'8',commentsLabel:'2',tier:2,access:'可接话'}
]
const base = {sheetVisible:true,sheetTitle:'附近的留话',sheetSubtitle:'2 条留话 · 2 个地点',sheetSort:'heat',sheetMaxHeight:340,sheetRows:rows}
const mixed = [
  {...rows[0],name:'图书馆西门靠近步行道交汇处的第一张长椅',copy:'绕到西门不用上台阶，推车和搬东西可以从这边走。'},
  {...rows[1],id:'c',name:'图书馆西门',distanceLabel:'约 97m',likesLabel:'7.2千',commentsLabel:'328',tier:3,access:'走近看看',copy:'这里藏着一个很舒服的角落，路过的人可以来歇歇脚。'},
  {...rows[0],id:'d',owned:false,participated:true,distanceLabel:'待定位',copy:'下次路过，还来这张长椅聊聊。'}
]
const states = [
  {label:'390px · 附近留话',width:390,data:base},
  {label:'320px · 同组、多条留话',width:320,data:{...base,sheetTitle:'图书馆西门第一张长椅',sheetSubtitle:'3 条留话 · 1 个地点',sheetSort:'latest',sheetRows:mixed,sheetMaxHeight:310}},
  {label:'320px · 空列表',width:320,data:{...base,sheetSubtitle:'0 条留话 · 0 个地点',sheetRows:[]}}
]
let css = fs.readFileSync(path.join(root,'miniprogram/app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(root,'miniprogram/pages/explore/index.wxss'),'utf8')
css = css.replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(-?[\d.]+)rpx/g,'calc($1 * var(--rpx))')
const docs = states.map(state=>'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>:root{--rpx:calc(100vw / 750)}body{margin:0}div{box-sizing:border-box}'+css+'.scene{height:570px;background:#e8e9e4}.bottom-area{bottom:18px}.caption{position:absolute;top:20px;left:20px;color:#778079;font-size:12px}</style><div class="scene"><div class="caption">背景仅为布局示意</div><div class="bottom-area">'+render([sheet],state.data)+'</div></div></html>')
const directory = path.join(root,'docs/previews/nearby-sheet')
fs.mkdirSync(directory,{recursive:true})
fs.writeFileSync(path.join(directory,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>留答 · 附近留话列表</title><style>body{margin:0;padding:20px;background:#f3f3ef;color:#24262b;font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}h1{font-size:21px;margin:0 0 8px}p{margin:0 0 20px;color:#747980;font-size:12px}main{display:flex;gap:20px;flex-wrap:wrap}section{display:grid;gap:10px}iframe{border:0;border-radius:22px;box-shadow:0 4px 24px #0001}</style><h1>留答 · 附近的留话</h1><p>生产 WXML/WXSS 的布局预览 · 模拟内容，不调用定位及云端接口；原生覆盖层仍需真机确认。</p><main>'+states.map(state=>'<section><label>'+state.label+'</label><iframe title="'+state.label+'" width="'+state.width+'" height="570" srcdoc="'+escape(docs[states.indexOf(state)])+'"></iframe></section>').join('')+'</main></html>')
console.log('Wrote docs/previews/nearby-sheet/index.html')
