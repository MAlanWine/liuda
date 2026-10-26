// Draw a static design illustration. Does not execute or test the mini-program.
const fs = require('fs')
const path = require('path')
const root = path.join(__dirname,'..')
const brand = fs.readFileSync(path.join(root,'miniprogram/assets/brand/liuda-comma.png')).toString('base64')
let sharp
try { sharp = require('sharp') }
catch (_) {
  const dir = process.env.LIUDA_PREVIEW_NODE_MODULES
  if (!dir) throw new Error('Install sharp or set LIUDA_PREVIEW_NODE_MODULES to its node_modules directory.')
  sharp = require(path.join(dir,'sharp'))
}
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const out = []
const add = s => out.push(s)
const rect = (x,y,w,h,r,fill,stroke='none') => add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`)
const circle = (x,y,r,fill,stroke='none',sw=1) => add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`)
const text = (s,x,y,size=13,color='#17191e',weight=400,anchor='start') => add(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`)
const line = (x1,y1,x2,y2,color,width=1) => add(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`)
const comma = (x,y,s=24,color='#fff') => add(`<path transform="translate(${x} ${y}) scale(${s/32})" d="M7 -13C-3 -17 -7 -9 -4 -2C-3 2 1 4 5 3C4 8 -1 12 -7 14C2 17 13 7 14 -3C16 -9 12 -12 7 -13Z" fill="${color}"/>`)

add('<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="1090" viewBox="0 0 1040 1090"><g font-family="PingFang SC,Heiti SC,Noto Sans CJK SC,sans-serif">')
rect(0,0,1040,1090,0,'#f7f7f3')
text('留答 · 地图界面精简',44,54,27,'#17191e',600)
text('静态布局示意 · 地图为虚构场景 · 非真机截图',44,82,13,'#777d87')

function phone(x,menu=false) {
  const y=120,w=390,h=800
  rect(x,y,w,h,34,'#08090b')
  add(`<clipPath id="phone-${x}"><rect x="${x+4}" y="${y+4}" width="382" height="792" rx="30"/></clipPath><g clip-path="url(#phone-${x})">`)
  text('9:41',x+22,y+29,12,'#f3f4f6',600)
  text('● ▰',x+363,y+29,11,'#f3f4f6',400,'end')
  text('留答',x+195,y+67,16,'#f3f4f6',600,'middle')
  rect(x+305,y+44,66,26,13,'#08090b','#272a31')
  text('•••  ◉',x+338,y+62,13,'#f3f4f6',500,'middle')
  const top=y+88,bottom=y+708
  add(`<clipPath id="map-${x}"><rect x="${x+4}" y="${top}" width="382" height="${bottom-top}"/></clipPath><g clip-path="url(#map-${x})">`)
  rect(x+4,top,382,bottom-top,0,'#eceee9')
  // Schematic roads and buildings, independent of any real map tiles or user data.
  const blocks=[[18,30,107,72],[173,18,101,94],[26,174,118,91],[207,189,108,64],[50,332,108,92],[239,338,114,96],[32,504,101,78],[196,509,125,57]]
  for(const [bx,by,bw,bh] of blocks) rect(x+bx,top+by,bw,bh,7,'#faf9f2','#e2e4de')
  line(x+150,top-20,x+170,bottom+20,'#fff',20)
  line(x-10,top+141,x+400,top+156,'#fff',19)
  line(x-10,top+299,x+400,top+311,'#fff',21)
  line(x-10,top+475,x+400,top+483,'#fff',18)
  rect(x+212,top+355,107,65,12,'#dce9da')
  text('教学楼',x+37,top+74,11,'#89918e')
  text('图书馆',x+201,top+74,11,'#89918e')
  text('校园路',x+295,top+288,11,'#929990')
  text('草坪',x+248,top+395,10,'#8c9e88')
  circle(x+187,top+353,18,'#d4e3e8')
  circle(x+187,top+353,6,'#4d93ad','#fff',2)
  rect(x+169,top+310,63,37,19,'#292c33')
  comma(x+190,top+328,27)
  text('2',x+218,top+334,13,'#fff',600,'middle')

  // The three persistent controls mirror the source layout.
  rect(x+18,top+15,143,44,23,'#15171c','#353840')
  rect(x+26,top+23,27,27,9,'#000')
  add(`<image href="data:image/png;base64,${brand}" x="${x+26}" y="${top+23}" width="27" height="27"/>`)
  text('附近 2 条',x+61,top+43,13,'#f3f4f6',500)
  text('⌄',x+144,top+41,13,'#a0a4ae')
  circle(x+350,top+37,22,'#fffefa','#e1e2df')
  for(let i=-1;i<=1;i++) circle(x+350+i*7,top+37,1.7,'#15171c')
  circle(x+349,bottom-67,23,'#fffefa','#e1e2df')
  circle(x+349,bottom-67,9,'none','#15171c',1.7)
  circle(x+349,bottom-67,2.5,'#15171c')
  text('地图版权区',x+370,bottom-9,9,'#8a9098',400,'end')
  add('</g>')

  rect(x+4,bottom,382,92,0,'#08090b')
  line(x+4,bottom,x+386,bottom,'#272a31')
  circle(x+69,bottom+27,10,'none','#f3f4f6',1.4)
  text('↗',x+69,bottom+32,17,'#f3f4f6',400,'middle')
  rect(x+172,bottom+12,46,30,12,'#f0f1f3')
  text('＋',x+195,bottom+35,26,'#121316',400,'middle')
  rect(x+309,bottom+17,24,21,8,'none','#989da8')
  text('···',x+321,bottom+30,16,'#989da8',400,'middle')
  text('附近',x+69,bottom+59,11,'#f3f4f6',400,'middle')
  text('留下',x+195,bottom+59,11,'#989da8',400,'middle')
  text('消息',x+321,bottom+59,11,'#989da8',400,'middle')
  rect(x+142,y+h-12,106,4,2,'#f3f4f6')

  if(menu) {
    rect(x+4,top,382,h-92,0,'#08090b66')
    const sy=y+379
    rect(x+12,sy,366,294,16,'#fffefa')
    const labels=['刷新附近留话','查看 3D 空间示意','地图缩放','地图上的逗号','定位与连接状态','切换体验模式']
    labels.forEach((label,i)=>{
      text(label,x+195,sy+31+i*49,15,'#17191e',400,'middle')
      if(i<5) line(x+28,sy+49+i*49,x+362,sy+49+i*49,'#ebebe6')
    })
    rect(x+12,sy+306,366,49,14,'#fffefa')
    text('取消',x+195,sy+337,15,'#777d87',400,'middle')
  }
  add('</g>')
}
phone(77)
phone(573,true)
text('平时，地图与留话是主角',272,958,18,'#17191e',600,'middle')
text('附近入口 ＋ 更多 ＋ 回到我',272,986,13,'#777d87',400,'middle')
text('工具按需展开',768,958,18,'#17191e',600,'middle')
text('原生菜单外观以实际微信客户端为准',768,986,13,'#777d87',400,'middle')
text('异常才提示 · 演示场景保留标识 · 地图版权信息保留',520,1047,13,'#777d87',400,'middle')
add('</g></svg>')
const svg=out.join('')
const dest=path.join(root,'docs/previews/map-interface-cleanup')
fs.writeFileSync(dest+'.svg',svg)
sharp(Buffer.from(svg)).resize(1560).png().toFile(dest+'.png').then(()=>console.log('Static design preview written.')).catch(error=>{console.error(error.message);process.exitCode=1})
