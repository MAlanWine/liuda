const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const folder = path.join(root, 'docs/campus/uibe')
const data = JSON.parse(fs.readFileSync(path.join(folder, 'data/uibe-osm-wgs84.geojson'), 'utf8'))
const template = fs.readFileSync(path.join(__dirname, 'templates/uibe-art-sample.html'), 'utf8')
const marker = '/* CAMPUS_DATA */null'
if (template.split(marker).length !== 2) throw new Error('Expected one data placeholder')
const output = template.replace(marker, JSON.stringify(data).replace(/</g, '\\u003c'))
fs.writeFileSync(path.join(folder, 'art-sample.html'), output)
console.log('Built docs/campus/uibe/art-sample.html; source features:', data.features.length)
