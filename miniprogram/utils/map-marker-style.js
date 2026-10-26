// Shared by the client and the offline PNG generator. Units are logical pixels.
const COLORS = ['#555962','#292c33','#090b0f']
const SIZES = [22,26,30]
function geometry(tier,count,grounded = false) {
  const size = SIZES[tier-1],bubbleWidth = size + (count > 1 ? 16 : 0)
  const width = Math.max(44,bubbleWidth+8)
  const groundY = grounded ? 4+size+12 : 22
  const height = grounded ? Math.max(44,groundY+4) : 44
  const badge = count > 9 ? '9plus' : String(count)
  return { size,bubbleWidth,width,height,cx:width/2,cy:grounded ? 4+size/2 : 22,
    groundX:width/2,groundY,anchor:{ x:.5,y:groundY/height },suffix:grounded ? '-grounded' : '',badge }
}
function appearance(tier,count,active,grounded = false) {
  const art = geometry(tier,count,grounded)
  return { width:art.width,height:art.height,anchor:art.anchor,
    iconPath:'/assets/map-pins/h' + tier + '-n' + art.badge + (active ? '-selected' : '') + art.suffix + '.png' }
}
module.exports = { COLORS,SIZES,geometry,appearance }
