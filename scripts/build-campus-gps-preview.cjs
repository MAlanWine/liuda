const fs=require('fs'),path=require('path')
const root=path.resolve(__dirname,'..'),folder=path.join(root,'docs/campus/uibe')
const metadata=require('../miniprogram/data/campus')
const render=JSON.parse(fs.readFileSync(path.join(folder,'data/campus-render.json'),'utf8'))
const route=render.items.find(f=>f.id===666131237).points
const sources={
  './geo':fs.readFileSync(path.join(root,'miniprogram/utils/geo.js'),'utf8'),
  '../data/campus':'module.exports='+JSON.stringify(metadata),
  './campus-map':fs.readFileSync(path.join(root,'miniprogram/utils/campus-map.js'),'utf8')
}
const bundle=Object.entries(sources).map(([id,code])=>'definitions['+JSON.stringify(id)+']=function(module,exports,require){\n'+code+'\n};').join('\n')
const template=fs.readFileSync(path.join(__dirname,'templates/campus-gps-preview.html'),'utf8')
fs.writeFileSync(path.join(folder,'full-campus-preview.html'),template.replace('/* MODULES */',bundle).replace('/* ROUTE */[]',JSON.stringify(route)))
console.log('Built full-campus-preview.html using the production camera module')
