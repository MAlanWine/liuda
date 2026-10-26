// Static zoom illustration using real generated PNG assets. Does not run the app.
const fs = require('fs')
const path = require('path')
const style = require('../miniprogram/utils/map-marker-style')
const root = path.resolve(__dirname,'..')
let sharp
try { sharp = require('sharp') }
catch (_) { sharp = require(path.join(process.env.LIUDA_PREVIEW_NODE_MODULES,'sharp')) }
const out=[]
const add=s=>out.push(s)
const rect=(x,y,w,h,r,fill,stroke='none')=>add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`)
const circle=(x,y,r,fill,stroke='none',sw=1)=>add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`)
const text=(copy,x,y,size=13,color='#17191e',weight=400,anchor='start')=>add(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${copy}</text>`)
function image(filename,x,y,w,h) {
  const data=fs.readFileSync(path.join(root,filename)).toString('base64')
  add(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${data}"/>`)
}
function marker(x,y,tier,count) {
  const art=style.geometry(tier,count,true)
  const filename=style.appearance(tier,count,false,true).iconPath.slice(1)
  image('miniprogram/'+filename,x-art.groundX,y-art.groundY,art.width,art.height)
}
add('<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="1050" viewBox="0 0 1040 1050"><g font-family="PingFang SC,Heiti SC,Arial,sans-serif">')
rect(0,0,1040,1050,0,'#f7f7f3')
text('留答 · 缩放地图，落点不漂移',44,50,27,'#17191e',600)
text('静态设计示意 · 虚构地图与内容 · 非真机缩放验证',44,78,13,'#777d87')
function phone(x,zoom) {
  const top=210,bottom=800,cx=x+175,cy=top+354
  rect(x,120,390,780,32,'#08090b')
  add(`<clipPath id="phone${x}"><rect x="${x+4}" y="124" width="382" height="772" rx="29"/></clipPath><g clip-path="url(#phone${x})">`)
  text('9:41',x+22,149,12,'#f5f5f2',600)
  text('● ▰',x+365,149,11,'#f5f5f2',400,'end')
  text('留答',x+195,186,16,'#f5f5f2',600,'middle')
  rect(x+305,163,64,25,13,'#08090b','#25282e')
  text('•••  ◉',x+337,180,12,'#f5f5f2',400,'middle')
  add(`<clipPath id="map${x}"><rect x="${x+4}" y="${top}" width="382" height="590"/></clipPath><g clip-path="url(#map${x})">`)
  rect(x+4,top,382,bottom-top,0,'#eceee9')
  add(`<g transform="translate(${cx} ${cy}) scale(${zoom})">`)
  for (let row=-3;row<=2;row++) for (let col=-2;col<=2;col++) {
    const bx=col*180+16,by=row*160+12
    rect(bx,by,140,116,7,'#faf9f2','#dfe2db')
  }
  add('<path d="M0 -800V800 M-700 0H700" fill="none" stroke="#fff" stroke-width="17"/>')
  text('教学楼',30,-72,12,'#8a918c')
  text('图书馆',207,-210,12,'#8a918c')
  circle(0,0,2.5,'#555962')
  add('</g>')
  // Pixel-sized art with geographic ground anchors, independent of the background zoom.
  circle(cx,cy,26*zoom,'#348fdb14','#348fdb55')
  marker(cx,cy,1,2)
  marker(cx+180*zoom,cy-150*zoom,2,1)
  // Draw the position asset last, reflecting the client's high marker zIndex.
  image('miniprogram/assets/map-pins/user-location.png',cx-12,cy-12,24,24)
  text('同一个地点',cx+19,cy+25,11,'#278ee2',500)
  rect(x+18,top+15,133,44,23,'#15171c','#353840')
  image('miniprogram/assets/brand/liuda-comma.png',x+26,top+23,27,27)
  text('附近 3 条',x+59,top+43,13,'#f5f5f2',500)
  text('⌄',x+134,top+41,13,'#a0a4ae')
  circle(x+350,top+37,22,'#fffefa','#e1e2df')
  for(let i=-1;i<=1;i++) circle(x+350+i*7,top+37,1.7,'#15171c')
  circle(x+349,bottom-65,23,'#fffefa','#e1e2df')
  circle(x+349,bottom-65,9,'none','#15171c',1.7)
  circle(x+349,bottom-65,2.5,'#15171c')
  text('地图版权区',x+372,bottom-9,9,'#909690',400,'end')
  add('</g>')
  rect(x+4,bottom,382,96,0,'#08090b')
  text('↗',x+70,bottom+32,24,'#f5f5f2',400,'middle')
  rect(x+172,bottom+12,46,30,12,'#f0f1f3')
  text('＋',x+195,bottom+35,26,'#121316',400,'middle')
  text('◌',x+321,bottom+32,24,'#a0a4ae',400,'middle')
  text('附近',x+70,bottom+59,11,'#f5f5f2',400,'middle')
  text('留下',x+195,bottom+59,11,'#a0a4ae',400,'middle')
  text('消息',x+321,bottom+59,11,'#a0a4ae',400,'middle')
  add('</g>')
}
text('放大看 · 留话与蓝点同处一个地点',72,109,15,'#17191e',600)
text('缩小看 · 地图收缩，针脚仍在原地点',578,109,15,'#17191e',600)
phone(66,1);phone(574,.5)
text('针脚末端 = 留话真实位置',72,937,15,'#17191e',600)
text('取消四向偏移，不根据蓝点远近挪动逗号',72,963,13,'#777d87')
text('蓝点置顶，保持可见',578,937,15,'#278ee2',600)
text('来自实际 GPS，不使用画面中心代替当前位置',578,963,13,'#777d87')
text('缩小后相近留言可聚合；聚合是数量入口，点开可查看原来的具体地点。',44,1022,13,'#777d87')
add('</g></svg>')
const source=out.join(''),dir=path.join(root,'docs/previews')
fs.mkdirSync(dir,{ recursive:true })
fs.writeFileSync(path.join(dir,'marker-zoom-anchors.svg'),source)
sharp(Buffer.from(source)).resize(1560).png().toFile(path.join(dir,'marker-zoom-anchors.png')).then(()=>console.log('Generated static zoom/anchor preview.')).catch(error=>{console.error(error.message);process.exitCode=1})
