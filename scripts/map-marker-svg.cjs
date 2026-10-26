const style = require('../miniprogram/utils/map-marker-style')

function svg(tier,count,selected,grounded = false) {
  const art = style.geometry(tier,count,grounded)
  const { width,height,size,bubbleWidth,cx,cy,groundX,groundY } = art
  const stem = !grounded ? '' : `<path d="M${groundX} ${groundY}L${cx} ${cy}" fill="none" stroke="#7d838c" stroke-width="1.25"/><circle cx="${groundX}" cy="${groundY}" r="2.25" fill="#555962" stroke="#fff" stroke-width="1"/>`
  const comma = '<path d="M17 7C11.5 7 8 10.6 8 15c0 4.3 3 7.4 7 7.5-1.5 3-4 4.9-7.5 6.1-.9.3-1.3 1.3-.6 2.1.5.7 1.3 1 2.3.7C20.3 28.3 25 22.7 25 15c0-4.5-3-8-8-8Z" fill="#f5f5f2"/>'
  const left = cx-bubbleWidth/2,top = cy-size/2
  const body = `${stem}<rect x="${left}" y="${top}" width="${bubbleWidth}" height="${size}" rx="${size/2}" fill="${style.COLORS[tier-1]}" stroke="${selected?'#ffffff':'#d0d2d5'}" stroke-width="${selected?2:1}"/><g transform="translate(${left} ${top}) scale(${size/34})">${comma}</g>${count===1?'':`<text x="${left+size+6}" y="${cy+3.5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${count>9?9:10.5}" font-weight="700" fill="#fff">${count>9?'9+':count}</text>`}`
  return { ...art,body,source:`<svg xmlns="http://www.w3.org/2000/svg" width="${width*2}" height="${height*2}" viewBox="0 0 ${width} ${height}">${body}</svg>` }
}
module.exports = { svg }
