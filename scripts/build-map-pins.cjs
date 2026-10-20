// Code-native marker assets and a clearly labelled design preview. Run with sharp on NODE_PATH.
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const root = path.resolve(__dirname,'..')
const output = path.join(root,'miniprogram/assets/map-pins')
const preview = path.join(root,'docs/previews')
const colors = ['#555962','#292c33','#090b0f'],sizes = [32,39,46]
fs.mkdirSync(output,{ recursive:true }); fs.mkdirSync(preview,{ recursive:true })
function svg(tier,count,selected) {
  const size = sizes[tier-1],width = size+(count===1?0:19)+8,height = size+8
  const comma = '<path d="M17 7C11.5 7 8 10.6 8 15c0 4.3 3 7.4 7 7.5-1.5 3-4 4.9-7.5 6.1-.9.3-1.3 1.3-.6 2.1.5.7 1.3 1 2.3.7C20.3 28.3 25 22.7 25 15c0-4.5-3-8-8-8Z" fill="#f5f5f2"/>'
  return { width,height,source:`<svg xmlns="http://www.w3.org/2000/svg" width="${width*3}" height="${height*3}" viewBox="0 0 ${width} ${height}"><rect x="4" y="4" width="${width-8}" height="${size}" rx="${size/2}" fill="${colors[tier-1]}" stroke="${selected?'#ffffff':'#c6c8cb'}" stroke-width="${selected?2.5:1}"/><g transform="translate(4 4) scale(${size/34})">${comma}</g>${count===1?'':`<text x="${size+10}" y="${height/2+4}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${count==='9+'?10:12}" font-weight="700" fill="#ffffff">${count}</text>`}</svg>` }
}
async function main() {
  for (let tier=1;tier<=3;tier++) for (const count of [1,2,3,4,5,6,7,8,9,'9+']) for (const selected of [false,true]) {
    const art = svg(tier,count,selected)
    const name = `h${tier}-n${count==='9+'?'9plus':count}${selected?'-selected':''}.png`
    await sharp(Buffer.from(art.source)).png().toFile(path.join(output,name))
  }
  const icon = (tier,count,x,y,selected=false) => {
    const art = svg(tier,count,selected)
    return `<svg x="${x}" y="${y}" width="${art.width*1.25}" height="${art.height*1.25}" viewBox="0 0 ${art.width} ${art.height}">${art.source.replace(/^.*?<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`
  }
  const text = (x,y,value,size=15,color='#f3f4f6',weight=400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${value}</text>`
  const map = x => `<g transform="translate(${x} 148)"><rect width="480" height="850" rx="25" fill="#ebece8"/><g fill="#dbdfd6" stroke="#f9faf6" stroke-width="12"><path d="M0 120 190 60 250 215 0 285Z"/><path d="M270 40 480 80 480 300 330 265Z"/><path d="M0 340 220 275 270 465 0 530Z"/><path d="M340 330 480 370 480 580 300 530Z"/><path d="M0 590 200 520 270 740 0 815Z"/><path d="M330 620 480 650 480 850 340 850Z"/></g><rect x="24" y="22" width="207" height="45" rx="22" fill="#15171c"/>${text(43,51,'❜  教学楼附近',18)}<rect x="358" y="22" width="99" height="45" rx="22" fill="#15171c"/>${text(376,50,'3D空间',15)}<circle cx="211" cy="486" r="30" fill="#448ed2" fill-opacity=".12" stroke="#448ed2" stroke-opacity=".35"/><circle cx="211" cy="486" r="8" fill="#318edb"/>${icon(3,3,160,380)}${icon(2,1,331,257)}${icon(1,1,72,189)}<rect x="20" y="92" width="117" height="36" rx="18" fill="#15171c"/>${text(37,116,'附近 6 条 ⌄',14)}<rect x="20" y="142" width="132" height="31" rx="15" fill="#fffefa"/>${text(34,162,'热度越高，逗号越大',10,'#555962')}<rect x="0" y="777" width="480" height="73" rx="20" fill="#08090b"/>${text(59,823,'附近',17)}${text(225,823,'＋',31)}${text(378,823,'消息',17)}</g>`
  const row = (y,copy,tag,stats) => `<path d="M20 ${y-24}H440" stroke="#343841"/>${text(23,y,'教学楼 · 门前台阶',12,'#aeb4c0')}${text(403,y,'42m',12,'#aeb4c0')}${text(23,y+34,copy,18)}<rect x="23" y="${y+48}" width="51" height="22" rx="6" fill="#e8ebf0"/>${text(31,y+63,tag,11,'#15171c')}${text(86,y+63,stats,12,'#aeb4c0')}${text(363,y+63,'走近看看 →',11,'#d9dde5')}`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1110" viewBox="0 0 1080 1110"><rect width="1080" height="1110" fill="#f5f5f0"/><g font-family="PingFang SC,Arial,sans-serif">${text(35,48,'留答 · 逗号热度与地点聚合',28,'#15171c',600)}${text(35,83,'地图看数量，点开选留话。大小代表热度，数字代表留言数量。',16,'#666c76')}${text(36,126,'01  浏览地图',16,'#15171c',600)}${text(573,126,'02  同一地点的留言列表',16,'#15171c',600)}${map(30)}${map(570)}<g transform="translate(580 558)"><rect width="460" height="410" rx="25" fill="#15171c" stroke="#4a4e58"/>${text(22,39,'教学楼 · 门前台阶',21,'#f3f4f6',600)}${text(423,37,'×',26,'#b2b7c0')}${text(23,69,'3 条留话 · 1 个地点',12,'#9da4b0')}<rect x="337" y="49" width="53" height="26" rx="13" fill="#eceef2"/>${text(349,67,'推荐',12,'#15171c')}${text(403,67,'最新',12,'#9da4b0')}${row(111,'这个门周末也开吗？','新留话','♡ 0 · 接话 0')}${row(229,'课没翘成，在台阶上先飞了一跤。','热门','♡ 23 · 接话 2')}${row(347,'下雨的时候走右边，有扶手。','普通','♡ 2 · 接话 0')}</g>${text(35,1041,'普通',13,'#5f6570')}${icon(1,1,87,1010)}${text(187,1041,'有回应',13,'#5f6570')}${icon(2,1,249,1007)}${text(363,1041,'热门',13,'#5f6570')}${icon(3,1,403,1002)}${text(570,1041,'选中时增加白色描边；新留言保留展示机会。',14,'#5f6570')}${text(35,1085,'界面示意 · 非真实地图和互动数据。小程序已实现对应入口，真机效果待确认。',13,'#7c828b')}</g></svg>`
  const clipped = source.replace('<g transform="translate(580 558)">','<defs><clipPath id="sheet-clip"><rect width="460" height="410" rx="25"/></clipPath></defs><g transform="translate(580 558)" clip-path="url(#sheet-clip)">')
  fs.writeFileSync(path.join(preview,'map-heat-and-clusters.svg'),clipped)
  await sharp(Buffer.from(clipped)).png().toFile(path.join(preview,'map-heat-and-clusters.png'))
  console.log('Generated 60 marker icons and docs/previews/map-heat-and-clusters.png')
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
