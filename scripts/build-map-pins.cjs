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
  const expected = new Set(['user-location.png'])
  for (let tier=1;tier<=3;tier++) for (let n=1;n<=10;n++) for (const selected of [false,true]) {
    for (const grounded of [false,true]) {
      const art = svg(tier,n,selected,grounded)
      const filename = path.basename(style.appearance(tier,n,selected,grounded).iconPath)
      expected.add(filename)
      const image = await sharp(Buffer.from(art.source)).png({ palette:true,colours:32,dither:0,compressionLevel:9,effort:10 }).toBuffer()
      fs.writeFileSync(path.join(output,filename),image)
      count++; bytes += image.length
    }
  }
  const user = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#dae8f6" stroke-width="1"/><circle cx="12" cy="12" r="7.5" fill="#278ee2"/></svg>'
  const image = await sharp(Buffer.from(user)).png().toBuffer()
  fs.writeFileSync(path.join(output,'user-location.png'),image)
  count++; bytes += image.length
  // Remove only generated, obsolete directional variants from the previous design.
  for (const name of fs.readdirSync(output)) {
    if (/^h[1-3]-n(?:[1-9]|9plus)(?:-selected)?-(?:north|east|south|west)(?:-clear)?\.png$/.test(name) && !expected.has(name)) fs.unlinkSync(path.join(output,name))
  }
  console.log(`Generated ${count} PNG markers (${bytes} bytes).`)
}
main().catch(error => { console.error(error.message); process.exitCode=1 })
