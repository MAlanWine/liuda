// Shared by the client and the offline PNG generator. Units are logical pixels.
const COLORS = ['#555962','#292c33','#090b0f']
const SIZES = [22,26,30]
const DIRECTIONS = { center:[0,0],north:[0,-52],east:[52,0],south:[0,52],west:[-52,0] }

function geometry(tier,count,direction = 'center',protectUser = false) {
  const size = SIZES[tier-1],bubbleWidth = size + (count > 1 ? 16 : 0)
  const offset = DIRECTIONS[direction] || DIRECTIONS.center
  const cx = offset[0],cy = offset[1]
  // At least 44px around the visible bubble; coordinates stay at the ground anchor.
  const halfWidth = Math.max(22,bubbleWidth / 2 + 4),halfHeight = 22
  const left = Math.min(-4,cx-halfWidth),top = Math.min(-4,cy-halfHeight)
  const right = Math.max(4,cx+halfWidth),bottom = Math.max(4,cy+halfHeight)
  const width = right-left,height = bottom-top
  const badge = count > 9 ? '9plus' : String(count)
  const suffix = direction === 'center' ? '' : '-' + direction + (protectUser ? '-clear' : '')
  return { size,bubbleWidth,width,height,cx:cx-left,cy:cy-top,groundX:-left,groundY:-top,
    offsetX:cx,offsetY:cy,anchor:{ x:-left/width,y:-top/height },
    stemGap:protectUser ? 18 : 0,suffix,badge }
}
function appearance(tier,count,active,direction = 'center',protectUser = false) {
  const art = geometry(tier,count,direction,protectUser)
  return { width:art.width,height:art.height,anchor:art.anchor,
    iconPath:'/assets/map-pins/h' + tier + '-n' + art.badge + (active ? '-selected' : '') + art.suffix + '.png' }
}
module.exports = { COLORS,SIZES,DIRECTIONS,geometry,appearance }
