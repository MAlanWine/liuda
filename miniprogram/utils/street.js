// Canvas 2D 透视街区。画布在屏幕外绘制，帧作为普通背景图显示，避免原生层遮挡 UI。
// 按需刷新，移动时最多约 12 帧/秒；演示几何与真实定位空间严格分开。
const geo = require('./geo')
const demo = require('../data/demo')
function create(canvas, width, height, onPins) {
 const ctx = canvas.getContext('2d')
 const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
 const dpr = Math.min(info.pixelRatio || 1, 1.5)
 canvas.width = width * dpr; canvas.height = height * dpr
 ctx.scale(dpr, dpr)
 const w = width, h = height, design = { details: true }
 // 场景保留明亮的日常自然色；黑白品牌色用于界面控件。
 const palette = { bg:'#fffef9',sky:'#cfe6f0',horizon:'#eff4e5',ground:'#c7c7a9',road:'#e4d7b8',paving:'#d5c7a6',wall:'#e7d6b6',wall2:'#c4c7aa',roof:'#b97956',roof2:'#75816c',window:'#8aaba6',windowframe:'#f4e6ca',leaf:'#76966c',leaf2:'#a7b270',trunk:'#8e775d',bench:'#ae845d',stone:'#b6b8a4',gift:'#e3a159',green:'#365a3c' }
 let camera = {}, faces = [], model = null, frame = null, disposed = false
 let eye = null, target = null, liveOrigin = null
 // 真机 Canvas 的颜色输出统一为 #RRGGBB，避免明暗运算生成长小数 RGB 字符串。
 const shadedColors = new Map()
 function shade(color, factor) {
  const amount = Number.isFinite(factor) ? factor : 1
  const key = color + ':' + amount
  if (shadedColors.has(key)) return shadedColors.get(key)
  const value = '#' + [1,3,5].map(start => {
   const channel = Math.max(0, Math.min(255, Math.round(parseInt(color.slice(start,start+2),16) * amount)))
   return channel.toString(16).padStart(2,'0')
  }).join('')
  shadedColors.set(key,value)
  return value
 }
 function poly(points,color,shadeBy=1){faces.push({points,color:shade(color,shadeBy)});}
 function box(x,y,z,sx,sy,sz,color){const a=x-sx/2,b=x+sx/2,c=z-sz/2,d=z+sz/2,t=y+sy;
  poly([[a,y,c],[b,y,c],[b,t,c],[a,t,c]],color,.78);poly([[b,y,d],[a,y,d],[a,t,d],[b,t,d]],color,1);poly([[a,y,d],[a,y,c],[a,t,c],[a,t,d]],color,.88);poly([[b,y,c],[b,y,d],[b,t,d],[b,t,c]],color,.83);poly([[a,t,c],[b,t,c],[b,t,d],[a,t,d]],color,1.08);}
 function crown(x,y,z,rx,ry,rz,color){const rings=5,segs=7,pts=[];for(let r=0;r<=rings;r++){const phi=Math.PI*r/rings;pts[r]=[];for(let j=0;j<segs;j++){const theta=Math.PI*2*j/segs+(r%2)*.14;pts[r].push([x+rx*Math.sin(phi)*Math.cos(theta),y+ry*Math.cos(phi),z+rz*Math.sin(phi)*Math.sin(theta)]);}}for(let r=0;r<rings;r++)for(let j=0;j<segs;j++){const n=(j+1)%segs;poly([pts[r][j],pts[r+1][j],pts[r+1][n]],color,.82+.15*Math.cos(j));poly([pts[r][j],pts[r+1][n],pts[r][n]],color,.92+.12*Math.cos(j));}}
 function tree(x,z,variant=0){box(x,0,z,.20,2.1,.20,palette.trunk);crown(x,2.8,z,1.1,1.65,1.0,variant?palette.leaf2:palette.leaf);crown(x+.32,2.35,z+.12,.85,.9,.9,variant?palette.leaf2:palette.leaf);}
 function bench(x,z){for(let i=0;i<3;i++)box(x,.5,z+(i-1)*.18,1.8,.12,.15,palette.bench);for(let i=0;i<2;i++)box(x,.9+i*.23,z-.3,1.8,.16,.10,palette.bench);[-.65,.65].forEach(d=>{box(x+d,0,z,.10,.6,.55,palette.roof2);box(x+d,.4,z-.3,.1,.95,.1,palette.roof2);});}
 function building(x,z,sx,sz,height,color,roof){box(x,0,z,sx,height,sz,color);box(x,height,z,sx+.25,.22,sz+.3,roof);box(x,height+.22,z,sx-.6,.18,sz-.3,roof);
  if(!design.details)return;
  const streetWall=x<0?x+sx/2+.012:x-sx/2-.012;
  for(let y=1.15;y<height-.4;y+=1.7)for(let zz=z-sz/2+1;zz<z+sz/2-.5;zz+=1.65){box(streetWall,y,zz,.05,.93,.77,palette.windowframe);box(streetWall+(x<0?.036:-.036),y+.1,zz,.035,.72,.58,palette.window);}
  for(let xx=x-sx/2+.7;xx<x+sx/2-.3;xx+=1.5)for(let y=1.1;y<height-.6;y+=1.7){box(xx,y,z+sz/2+.014,.8,.94,.04,palette.windowframe);box(xx,y+.1,z+sz/2+.04,.62,.73,.025,palette.window);}
  const dx=x<0?x+sx/2+.06:x-sx/2-.06;box(dx,0,z+sz*.23,.07,2,1.35,palette.roof2);box(dx+(x<0?.045:-.045),.12,z+sz*.23,.025,1.7,1.05,palette.window);
 }
 function demoScene(){faces=[];
  for(let z=-85;z<34;z+=3){poly([[-20,0,z],[20,0,z],[20,0,z+3],[-20,0,z+3]],palette.ground);poly([[-3.15,.012,z],[3.15,.012,z],[3.15,.012,z+3],[-3.15,.012,z+3]],palette.road);[-1,1].forEach(s=>{const a=s*3.15,b=s*5.2;poly([[a,.025,z],[b,.025,z],[b,.025,z+3],[a,.025,z+3]],palette.paving);});if(design.details){for(let x=-3;x<3;x+=1.5)poly([[x,.017,z],[x+.018,.017,z],[x+.018,.017,z+3],[x,.017,z+3]],palette.paving);poly([[-3.15,.02,z],[3.15,.02,z],[3.15,.02,z+.025],[-3.15,.02,z+.025]],palette.paving);}}
  building(-8.2,1,5.8,15,6.5,palette.wall,palette.roof);building(-8,-20,5.5,17,8.1,palette.wall2,palette.roof2);building(-8,-44,6,18,7,palette.wall,palette.roof);
  building(8.6,-8,6,17,5.5,palette.wall2,palette.roof2);building(9,-34,6,20,7.5,palette.wall,palette.roof);
  for(let i=0;i<3;i++)box(-4.4,.09*i,8.4,.8+i*.38,.09,2.1,palette.stone);
  [-2,-16,-32,-49,-66].forEach((z,i)=>tree(4.1,z,i%2));[-8,-29,-48,-68].forEach((z,i)=>tree(-4,z,i%2));
  tree(4.05,6,1);tree(-4.2,1,0);bench(3.9,4);
  bench(3.9,-6);bench(3.9,-25);
  box(2.65,0,-6,.68,.10,.68,palette.stone);box(2.65,.10,-6,.50,.68,.50,palette.gift);box(2.65,.78,-6,.57,.06,.57,palette.roof);box(2.65,.32,-5.74,.31,.28,.01,palette.windowframe);box(2.65,.38,-5.729,.20,.04,.01,palette.roof);
  box(-2.8,.02,8,.56,.06,.36,palette.green);box(-2.8,.085,8,.39,.012,.045,palette.windowframe);
  [-11,-34,-56].forEach(z=>{box(-3.5,0,z,.07,3.3,.07,palette.roof2);box(-3.3,3.25,z,.45,.07,.07,palette.roof2);box(-3.1,3.03,z,.25,.25,.25,palette.windowframe);});
 }

 function view(p) {
  const dx=p[0]-camera.x,dy=p[1]-camera.y,dz=p[2]-camera.z
  const side=Math.cos(camera.yaw)*dx-Math.sin(camera.yaw)*dz,forward=-Math.sin(camera.yaw)*dx-Math.cos(camera.yaw)*dz
  return [side,dy*Math.cos(camera.pitch)+forward*Math.sin(camera.pitch),forward*Math.cos(camera.pitch)-dy*Math.sin(camera.pitch)]
 }
 function project(p) { const v=view(p); return {x:w/2+camera.f*v[0]/v[2],y:camera.cy-camera.f*v[1]/v[2],depth:v[2]} }
 function clip(points) {
  const out=[]
  for(let i=0;i<points.length;i++) { const a=points[i],b=points[(i+1)%points.length],ina=a[2]>.3,inb=b[2]>.3
   if(ina)out.push(a)
   if(ina!==inb){const t=(.3-a[2])/(b[2]-a[2]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),.3])}
  } return out
 }
 function spaceScene() {
  faces=[]
  const gx=Math.floor(eye.x/5)*5,gz=Math.floor(eye.z/5)*5
  poly([[gx-65,0,gz-65],[gx+65,0,gz-65],[gx+65,0,gz+65],[gx-65,0,gz+65]],palette.road)
  for(let i=-60;i<=60;i+=5){
   poly([[gx+i,.01,gz-65],[gx+i+.025,.01,gz-65],[gx+i+.025,.01,gz+65],[gx+i,.01,gz+65]],palette.paving)
   poly([[gx-65,.01,gz+i],[gx+65,.01,gz+i],[gx+65,.01,gz+i+.025],[gx-65,.01,gz+i+.025]],palette.paving)
  }
 }
 function point(post) { const p=geo.local(post,model.mode==='demo'?demo.origin:liveOrigin);return [p.x/4,1,18+p.z/4] }
 function draw() {
  frame=null
  if(disposed||!model||!eye)return
  const dx=target.x-eye.x,dz=target.z-eye.z,moving=Math.hypot(dx,dz)>.01
  eye.x+=dx*.23; eye.z+=dz*.23
  camera=model.overview?{x:eye.x,y:29,z:eye.z+12,yaw:0,pitch:.86,f:w*.9,cy:h*.40}:{x:eye.x,y:1.75,z:eye.z,yaw:model.yaw||0,pitch:.035,f:w*.92,cy:h*.39}
  const sky=ctx.createLinearGradient(0,0,0,h*.48);sky.addColorStop(0,palette.sky);sky.addColorStop(1,palette.horizon);ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);ctx.fillStyle=palette.ground;ctx.fillRect(0,camera.cy,w,h-camera.cy)
  if(model.mode==='demo')demoScene();else spaceScene()
  const rendered=[]
  faces.forEach(face=>{const pts=clip(face.points.map(view));if(pts.length<3)return
   const screen=pts.map(p=>[w/2+camera.f*p[0]/p[2],camera.cy-camera.f*p[1]/p[2]])
   if(screen.every(p=>p[0]<0)||screen.every(p=>p[0]>w)||screen.every(p=>p[1]<0)||screen.every(p=>p[1]>h))return
   rendered.push({screen,color:face.color,depth:pts.reduce((s,p)=>s+p[2],0)/pts.length})
  })
  rendered.sort((a,b)=>b.depth-a.depth).forEach(face=>{ctx.fillStyle=face.color;ctx.beginPath();face.screen.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill()})
  {
   const pins=model.posts.slice(0,18).map((post,index)=>{
    const p=project(point(post)),near=geo.distance(model.position,post)<6
    const visible=near||(p.depth>1&&p.x>0&&p.x<w&&p.y>80&&p.y<h-20)
    const x=near?w/2:Math.max(62,Math.min(w-62,p.x))
    const y=near?h*.68:Math.max(110,Math.min(h-35,p.y))
    return {id:post.id,name:post.name.split(' · ').pop(),distanceLabel:post.distanceLabel,x:Math.round(x),y:Math.round(y),visible,active:model.selectedId===post.id&&model.cardVisible}
   })
   onPins(pins, canvas.toDataURL('image/jpeg', .86))
  }
  if(moving)schedule()
 }
 function schedule() { if(!disposed&&frame===null)frame=setTimeout(draw,80) }
 return {
  update(next) {
   if(disposed||!geo.valid(next.position))return
   if(!model||model.mode!==next.mode){eye=null;liveOrigin=next.mode==='live'?next.position:null}
   model=next
   const p=geo.local(next.position,next.mode==='demo'?demo.origin:liveOrigin)
   target={x:p.x/4,z:18+p.z/4}
   if(!eye||Math.hypot(target.x-eye.x,target.z-eye.z)>25)eye=Object.assign({},target)
   schedule()
  },
  destroy(){disposed=true;if(frame!==null)clearTimeout(frame)}
 }
}
module.exports = { create }
