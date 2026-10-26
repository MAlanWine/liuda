// Offline code-native assets. No image generation in location callbacks.
const fs = require('fs')
const path = require('path')
const style = require('../miniprogram/utils/map-marker-style')
const { svg } = require('./map-marker-svg.cjs')
let sharp
try { sharp = require('sharp') }
catch (_) { sharp = require(path.join(process.env.LIUDA_PREVIEW_NODE_MODULES,'sharp')) }
const output = path.resolve(__dirname,'../miniprogram/assets/map-pins')
fs.mkdirSync(output,{ recursive:true })
async function main() {
  let count = 0,bytes = 0
  for (let tier=1;tier<=3;tier++) for (let n=1;n<=10;n++) for (const selected of [false,true]) {
    for (const direction of Object.keys(style.DIRECTIONS)) for (const protect of direction === 'center' ? [false] : [false,true]) {
      const art = svg(tier,n,selected,direction,protect)
      const filename = path.basename(style.appearance(tier,n,selected,direction,protect).iconPath)
      const image = await sharp(Buffer.from(art.source)).png({ palette:true,colours:32,dither:0,compressionLevel:9,effort:10 }).toBuffer()
      fs.writeFileSync(path.join(output,filename),image)
      count++; bytes += image.length
    }
  }
  console.log(`Generated ${count} PNG markers (${bytes} bytes).`)
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
