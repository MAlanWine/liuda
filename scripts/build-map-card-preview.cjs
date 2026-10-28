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
function findCard(node) {
  if (node.attrs && node.attrs.class === 'content-card') return node
  for (const child of node.children || []) { const card = findCard(child); if (card) return card }
}
const card = findCard(tree)
const selected = {owned:true,participated:true,name:'图书馆西门第一张长椅',level:'full',displayText:'这里下午有树荫，适合歇歇脚。',photoPath:'',liked:false,likes:0,commentCount:0,canReply:true,canInteract:true,previewComments:[]}
const base = {selected,selectedDistanceLabel:'约 3m',selectedHeatLabel:'普通',cardVisible:true,sheetVisible:false,cardMaxHeight:210,expanded:false,nearbyCount:2,selectedGroupCount:2}
const states = [
  {label:'390px · 在现场，继续聊',width:390,data:base},
  {label:'320px · 远处留话，较多互动',width:320,data:{...base,selected:{...selected,owned:false,participated:false,level:'preview',displayText:'这个座位有个隐藏功能……',likes:1201,commentCount:98,canReply:false,canInteract:false},selectedDistanceLabel:'约 97m',selectedHeatLabel:'热门',selectedGroupCount:12}},
  {label:'320px · 长地点、展开回复',width:320,data:{...base,expanded:true,selectedDistanceLabel:'位置待更新',selectedHeatLabel:'有回应',selected:{...selected,canInteract:false,name:'图书馆西门靠近连廊与步行道交汇处的第一张长椅',displayText:'这里下午有树荫，适合歇歇脚。\n如果你也路过，留句话吧。',commentCount:2,previewComments:[{id:1,name:'路过的人 1',text:'傍晚坐在这里也很舒服。'},{id:2,name:'路过的人 2',text:'下次路过也来歇一会儿。'}]}}}
]
let css = fs.readFileSync(path.join(root,'miniprogram/app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(root,'miniprogram/pages/explore/index.wxss'),'utf8')
css = css.replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(-?[\d.]+)rpx/g,'calc($1 * var(--rpx))')
const docs = states.map(state=>'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>:root{--rpx:calc(100vw / 750)}body{margin:0}div{box-sizing:border-box}'+css+'.scene{height:570px;background-color:#e8e9e4;background-image:linear-gradient(32deg,transparent 46%,#f8f8f3 46%,#f8f8f3 50%,transparent 50%),linear-gradient(102deg,transparent 50%,#f8f8f3 50%,#f8f8f3 56%,transparent 56%)}.layout-caption{position:absolute;top:20px;left:20px;color:#727b78;font-size:12px}.layout-point{position:absolute;top:100px;left:46%;width:15px;height:15px;border-radius:50%;background:#57aee1;border:3px solid #fff}.bottom-area{bottom:18px}</style><div class="scene"><div class="layout-caption">底图仅为布局示意</div><div class="layout-point"></div><div class="bottom-area">'+render([card],state.data)+'</div></div></html>')
const directory = path.join(root,'docs/previews/map-card-layout')
fs.mkdirSync(directory,{recursive:true})
fs.writeFileSync(path.join(directory,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>留答 · 地图留话卡片</title><style>body{margin:0;padding:20px;background:#f3f3ef;color:#24262b;font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}h1{font-size:21px;margin:0 0 8px}p{margin:0 0 20px;color:#747980;font-size:12px}main{display:flex;gap:20px;flex-wrap:wrap}section{display:grid;gap:10px}iframe{border:0;border-radius:22px;box-shadow:0 4px 24px #0001}</style><h1>留答 · 地图留话卡片</h1><p>生产 WXML/WXSS 的布局预览 · 模拟内容与状态，不调用地图、定位和云接口；原生 cover-view 效果仍需真机确认。</p><main>'+states.map((state,i)=>'<section><label>'+state.label+'</label><iframe title="'+state.label+'" width="'+state.width+'" height="570" srcdoc="'+escape(docs[i])+'"></iframe></section>').join('')+'</main></html>')
console.log('Wrote docs/previews/map-card-layout/index.html')
