// Layout-only fixtures using the production WXML/WXSS. No GPS, camera or API calls.
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname,'..')
const markup = fs.readFileSync(path.join(root,'miniprogram/pages/thread/index.wxml'),'utf8')
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
    else if ('wx:elif' in a) { if (chain) return ''; chain = !!expression(a['wx:elif'].slice(2,-2),data); if (!chain) return '' }
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
const post = {id:'layout-demo',owned:true,participated:true,name:'图书馆西门第一张长椅',level:'full',displayText:'这里下午有树荫，适合歇歇脚。',photoPath:'',liked:false,likes:3,canLike:false,canReply:true,canInteract:false,commentCount:0,comments:[]}
const base = {post,mode:'live',busy:false,pendingAction:'',retrying:false,locating:false,replyEditor:[{id:1,value:''}],replyLength:0,hasReplyText:false,missing:false,loading:false,needsJoin:false,status:'已参与这条对话 · 离场也可继续',timeLabel:'10月28日',distanceLabel:'位置待更新'}
const comments = [{id:'a',name:'路过的人 1',entry:'onsite',text:'傍晚坐在这里也很舒服。'},{id:'b',name:'路过的人 2',entry:'continuation',text:'下次路过也来歇一会儿。'}]
const fixtures = {
  away:base,
  onsite:{...base,post:{...post,owned:false,participated:false,canReply:true,canLike:true,canInteract:true,comments,commentCount:2},status:'已到场 · 接一句后可离场继续',distanceLabel:'约 12m'},
  distant:{...base,post:{...post,owned:false,participated:false,level:'preview',displayText:'这个座位有一个隐藏功能……',canReply:false},status:'请再靠近一些，确认到场后才能操作。',distanceLabel:'约 97m'},
  typed:{...base,replyEditor:[{id:1,value:'我也在这里歇过脚，下次再来。'}],replyLength:15,hasReplyText:true},
  sending:{...base,busy:true,pendingAction:'reply',replyEditor:[{id:1,value:'我也在这里歇过脚。'}],replyLength:9,hasReplyText:true},
  liking:{...base,busy:true,pendingAction:'like',post:{...post,canLike:true,canInteract:true}},
  long:{...base,post:{...post,name:'图书馆西门靠近连廊与步行道交汇处的第一张长椅',displayText:('这是很长的现场留言，用来检查换行与卡片边界。\n').repeat(5),comments,commentCount:2}},
  expired:{...base,post:{...post,level:'dot',displayText:'对话信息已过期，刷新后继续。',canReply:false},status:'已参与这条对话 · 离场也可继续'},
  missing:{...base,post:null,missing:true},
  error:{...base,post:null,status:'网络暂时不可用，请重试。'},
  loading:{...base,post:null,loading:true}
}
for (const state of Object.values(fixtures)) state.replyLength = state.replyEditor[0].value.length
let css = fs.readFileSync(path.join(root,'miniprogram/app.wxss'),'utf8') + '\n' + fs.readFileSync(path.join(root,'miniprogram/pages/thread/index.wxss'),'utf8')
css = css.replace(/(^|\n)page\s*\{/g,'$1body {').replace(/(-?[\d.]+)rpx/g,'calc($1 * var(--rpx))')
css += '\nbutton{border:0}textarea{resize:none}input::placeholder,textarea::placeholder{color:#858a96;opacity:1}'
const directory = path.join(root,'docs/previews/thread-layout')
fs.mkdirSync(directory,{recursive:true})
for (const [name,data] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(directory,name+'.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--rpx:calc(100vw / 750)}body{margin:0}div{box-sizing:border-box}button,input,textarea{font-family:inherit}button{cursor:pointer}span{box-sizing:border-box}'+css+'.nav{height:44px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;border-bottom:1px solid #15171c}</style><div class="nav">这里的对话</div>'+render(tree.children,data)+'</html>')
}
const labels = {away:'已参与 · 离场续聊',onsite:'已到场 · 首次接话',distant:'未到场 · 预览',typed:'填写后',sending:'发送中',liking:'点赞中',long:'长标题及多条回复',expired:'内容待同步',missing:'已删除',error:'网络错误',loading:'加载中'}
fs.writeFileSync(path.join(directory,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>留答 · 对话页布局</title><style>body{margin:0;padding:20px;background:#eceeea;color:#24262b;font:14px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}h1{font-size:21px;margin:0 0 6px}p{margin:0 0 14px;color:#696d75;font-size:12px}main{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}section{display:grid;gap:8px}iframe{border:0;border-radius:20px;background:#08090b;box-shadow:0 6px 32px #0001}select{padding:6px;border-radius:8px;border:1px solid #bbb}</style><h1>留答 · 对话页</h1><p>使用生产 WXML/WXSS 的布局预览 · 内容与权限均为模拟数据，不调用云端接口。</p><main><section><label>390px · <select id="state">${Object.keys(fixtures).map(key=>'<option value="'+key+'">'+labels[key]+'</option>').join('')}</select></label><iframe id="primary" title="390px 对话布局" width="390" height="610" src="away.html"></iframe></section><section><label>320px · 现场首次接话</label><iframe title="320px 现场接话" width="320" height="610" src="onsite.html"></iframe></section><section><label>320px · 未到场预览</label><iframe title="320px 预览" width="320" height="610" src="distant.html"></iframe></section></main><script>document.querySelector('select').onchange=e=>document.querySelector('#primary').src=e.target.value+'.html'</script></html>`)
console.log('Wrote thread layout fixtures to docs/previews/thread-layout/')
