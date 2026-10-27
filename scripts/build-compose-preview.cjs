// Layout-only fixtures using the production WXML/WXSS. No GPS, camera or API calls.
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname,'..')
const markup = fs.readFileSync(path.join(root,'miniprogram/pages/compose/index.wxml'),'utf8')
const escape = value => String(value == null ? '' : value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const brand = 'data:image/png;base64,' + fs.readFileSync(path.join(root,'miniprogram/assets/brand/liuda-comma.png')).toString('base64')
const tree = { tag:'root',children:[] },stack = [tree]
for (const token of markup.match(/<[^>]*>|[^<]+/g)) {
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
    else if ('wx:else' in a) { if (chain) return ''; chain = true }
    else chain = false
    if (a['wx:for']) return expression(a['wx:for'].slice(2,-2),data).map(item=>render([{...node,attrs:Object.fromEntries(Object.entries(a).filter(([key])=>key!=='wx:for'))}],{...data,item})).join('')
    if (node.tag === 'privacy-gate') return ''
    if (node.tag === 'block') return render(node.children,data)
    const tag = {view:'div',text:'span',image:'img'}[node.tag] || node.tag
    let attributes = ''
    for (const [key,value] of Object.entries(a)) {
      if (!['class','src','placeholder','maxlength','aria-label','disabled'].includes(key)) continue
      const resolved = interpolate(value,data)
      if (key === 'disabled') { if (resolved === 'true') attributes += ' disabled'; continue }
      attributes += ' ' + key + '="' + escape(key === 'src' ? brand : resolved) + '"'
    }
    if (tag === 'input') attributes += ' value="' + escape(interpolate(a.value || '',data)) + '"'
    if (['img','input'].includes(tag)) return '<' + tag + attributes + '>'
    return '<' + tag + attributes + '>' + (tag === 'textarea' ? escape(interpolate(a.value || '',data)) : render(node.children,data)) + '</' + tag + '>'
  }).join('')
}
const base = { mode:'live',published:null,hasDraft:false,busy:false,cameraBusy:false,placeBusy:false,positionBusy:false,selectedPlace:null,nameEditor:[{id:1,value:''}],textEditor:[{id:2,value:''}],textLength:0,ready:true,positionLabel:'已到场 · 精度约 14m',photoPath:'',publishError:'',canPublish:false,publishStage:'' }
const filled = {...base,hasDraft:true,nameEditor:[{id:1,value:'图书馆西门第一张长椅'}],textEditor:[{id:2,value:'这张长椅下午刚好有树荫，歇一会儿再出发。'}],textLength:23,canPublish:true}
const fixtures = {
  empty:base,
  filled,
  weak:{...base,ready:false,positionLabel:'定位较弱，请到室外开阔处重新定位。'},
  long:{...filled,selectedPlace:{name:'图书馆西侧连廊靠近西门的第一张长椅旁边'},nameEditor:[{id:3,value:'图书馆西侧连廊靠近西门的第一张长椅旁边'}]},
  photo:{...filled,photoPath:'layout-placeholder'},
  busy:{...filled,busy:true,publishStage:'审核并留下…'},
  error:{...filled,publishError:'网络连接暂时不可用，请保留原内容重试。'},
  success:{...base,published:{mode:'live',name:'图书馆西门第一张长椅'}}
}
let css = fs.readFileSync(path.join(root,'miniprogram/app.wxss'),'utf8') + '\n' + fs.readFileSync(path.join(root,'miniprogram/pages/compose/index.wxss'),'utf8')
css = css.replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(-?[\d.]+)rpx/g,'calc($1 * var(--rpx))')
css += '\nbutton { border:0; } textarea { resize:none; } input::placeholder,textarea::placeholder {color:#858a96;opacity:1;}'
const directory = path.join(root,'docs/previews/compose-layout')
fs.mkdirSync(directory,{recursive:true})
for (const [name,data] of Object.entries(fixtures)) {
  const body = render(tree.children,data)
  const photoStyle = name === 'photo' ? '.photo { height:160px; object-fit:contain; background:#22242a; }' : ''
  fs.writeFileSync(path.join(directory,name+'.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--rpx:calc(100vw / 750)}body{margin:0}div{box-sizing:border-box}button,input,textarea{font-family:inherit}button{cursor:pointer}span{box-sizing:border-box}'+css+photoStyle+'.nav{height:44px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600}.bottom{position:fixed;bottom:0;left:0;right:0;height:78px;padding:12px 0 20px;background:#08090b;border-top:1px solid #272a31;display:flex;justify-content:space-around;font-size:11px;color:#a0a4ae}.bottom span{display:flex;align-items:center;flex-direction:column;gap:4px}.bottom b{font-size:20px;font-weight:400;line-height:24px}.bottom .active{color:#f3f4f6}.bottom .active b{width:46px;border-radius:10px;background:#f0f1f3;color:#121316;text-align:center}</style><div class="nav">留在这里</div>'+body+'<div class="bottom"><span><b>↗</b>附近</span><span class="active"><b>＋</b>留下</span><span><b>···</b>消息</span></div></html>')
}
fs.writeFileSync(path.join(directory,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#eceeea;color:#24262b;font:14px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}h1{font-size:22px;margin:0 0 8px}p{color:#696d75}main{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}section{display:grid;gap:12px}iframe{border:0;border-radius:20px;background:#08090b;box-shadow:0 6px 32px #0001}select{padding:8px;border-radius:8px;border:1px solid #bbb}</style><h1>留答 · 现场留话</h1><p>布局预览 · 使用生产 WXML/WXSS 与模拟数据，不调用定位、相机及云接口。照片状态以品牌图代替现场照。</p><main><section><label>390 px · <select id="state">${Object.keys(fixtures).map(key=>'<option value="'+key+'">'+({empty:'空白',filled:'填写后',weak:'定位异常',long:'长地点名称',photo:'已有照片',busy:'提交中',error:'提交失败',success:'发布成功'}[key])+'</option>').join('')}</select></label><iframe id="primary" title="390px 页面布局" width="390" height="830" src="empty.html"></iframe></section><section><label>320 px · 定位异常</label><iframe title="320px 定位异常" width="320" height="830" src="weak.html"></iframe></section><section><label>320 px · 发布成功</label><iframe title="320px 成功状态" width="320" height="700" src="success.html"></iframe></section></main><script>document.querySelector('select').onchange=e=>document.querySelector('#primary').src=e.target.value+'.html'</script></html>`)
console.log('Wrote layout previews to docs/previews/compose-layout/')
