// A cached image transform plus small overlay patches. No native canvas layer or image export.
const geo = require('./geo')
const campus = require('../data/campus')
const RAD = Math.PI / 180
function point(position) { const p=geo.local(position,campus.origin);return{x:p.x,z:p.z} }
function contains(position) {
  if(!geo.valid(position)||position.coordinateSystem!=='gcj02')return false
  const p=point(position),ring=campus.boundary;let inside=false
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j]
    if((a[1]>p.z)!==(b[1]>p.z)&&p.x<(b[0]-a[0])*(p.z-a[1])/(b[1]-a[1])+a[0])inside=!inside
  }
  return inside
}
function scaleForZoom(zoom){return Math.pow(2,zoom)/(156543.03392*Math.cos(campus.origin.latitude*RAD))}
function zoomForScale(scale){return Math.log2(scale*156543.03392*Math.cos(campus.origin.latitude*RAD))}
function create(width,height,callbacks={}) {
  const bounds=campus.bounds,camera={x:0,z:0,s:1}
  let disposed=false,frame=null,model={},gesture=null,initialized=false,following=false,acquired=false
  const round=n=>Math.round(n*100)/100
  function screen(p){return{x:width/2+(p.x-camera.x)*camera.s,y:height/2+(p.z-camera.z)*camera.s}}
  function fit(){camera.x=(bounds.left+bounds.right)/2;camera.z=(bounds.top+bounds.bottom)/2;camera.s=Math.min((width-24)/(bounds.right-bounds.left),(height-128)/(bounds.bottom-bounds.top))}
  function schedule(){if(!disposed&&frame===null)frame=setTimeout(draw,50)}
  function changed(userGesture){if(callbacks.camera)callbacks.camera({scale:round(Math.max(14,Math.min(20,zoomForScale(camera.s)))),gesture:!!userGesture})}
  function draw(){
    frame=null;if(disposed)return
    const corner=screen({x:bounds.left,z:bounds.top}),labels=[],placed=[]
    for(const place of campus.labels.slice().sort((a,b)=>(a.id===779016652?-1:b.id===779016652?1:0))) {
      const p=screen(place),font=camera.s<.7?9:camera.s<1.5?10:12,w=place.name.length*font+12
      const box={l:p.x-w/2,r:p.x+w/2,t:p.y-10,b:p.y+10}
      if(p.y<100||p.y>height-22||box.l<5||box.r>width-5||placed.some(a=>a.l<box.r&&a.r>box.l&&a.t<box.b&&a.b>box.t))continue
      labels.push({id:place.id,name:place.name,x:round(p.x),y:round(p.y),font});placed.push(box)
    }
    for(const area of campus.draftAreas){const p=screen({x:(area.left+area.right)/2,z:(area.top+area.bottom)/2});if(p.x>60&&p.x<width-60&&p.y>100&&p.y<height-30)labels.push({id:'draft',name:area.label,x:round(p.x),y:round(p.y),font:9,draft:true})}
    const pins=(model.groups||[]).map(group=>{
      const p=screen(point(group)),anchor=group.anchor||{x:.5,y:.5}
      return{id:group.id,x:round(p.x-group.width*anchor.x),y:round(p.y-group.height*anchor.y),width:group.width,height:group.height,iconPath:group.iconPath,count:group.count}
    }).filter(p=>p.x>-60&&p.x<width+60&&p.y>-60&&p.y<height+60)
    let user=null
    if(geo.valid(model.position)&&model.position.coordinateSystem==='gcj02') {
      const p=screen(point(model.position)),error=geo.accuracy(model.position)
      if(p.x>-150&&p.x<width+150&&p.y>-150&&p.y<height+150)user={x:round(p.x),y:round(p.y),fresh:Date.now()-model.position.timestamp<=geo.MAX_AGE,
        radius:Number.isFinite(error)&&error<150?round(error*camera.s):0}
    }
    const meters=camera.s>2?20:camera.s>.8?50:100
    if(callbacks.frame)callbacks.frame({transform:'translate('+round(corner.x)+'px,'+round(corner.y)+'px) scale('+camera.s.toFixed(6)+')',
      labels,pins,user,scaleWidth:round(meters*camera.s),scaleText:meters+' m'})
  }
  function update(next){
    model=next;const inside=contains(next.position)
    if(!initialized){initialized=true;if(inside&&next.following){const p=point(next.position);camera.x=p.x;camera.z=p.z;camera.s=scaleForZoom(next.mapScale||18);acquired=true}changed(false)}
    else if(next.following&&inside&&!gesture){const p=point(next.position);camera.x=p.x;camera.z=p.z;if(!acquired){acquired=true;camera.s=scaleForZoom(18);changed(false)}else if(!following&&Number.isFinite(next.mapScale))camera.s=scaleForZoom(next.mapScale)}
    following=!!next.following;schedule()
  }
  function touches(event){return(event.touches||[]).map(t=>({x:Number.isFinite(t.x)?t.x:t.clientX,y:Number.isFinite(t.y)?t.y:t.clientY}))}
  function start(event){const ps=touches(event);if(ps.length)gesture={points:ps,x:camera.x,z:camera.z,s:camera.s,moved:ps.length>1}}
  function move(event){
    if(!gesture)return
    const ps=touches(event);if(!ps.length)return
    if(ps.length!==gesture.points.length){start(event);gesture.moved=true;return}
    const a=gesture.points[0],p=ps[0]
    if(ps.length===1){const dx=p.x-a.x,dy=p.y-a.y;if(Math.hypot(dx,dy)>5)gesture.moved=true;camera.x=gesture.x-dx/gesture.s;camera.z=gesture.z-dy/gesture.s}
    else{gesture.moved=true;const b=gesture.points[1],q=ps[1],mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2},before={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const ratio=Math.hypot(p.x-q.x,p.y-q.y)/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));camera.s=Math.max(scaleForZoom(14),Math.min(scaleForZoom(19),gesture.s*ratio));camera.x=gesture.x+(before.x-width/2)/gesture.s-(mid.x-width/2)/camera.s;camera.z=gesture.z+(before.y-height/2)/gesture.s-(mid.y-height/2)/camera.s}
    if(gesture.moved&&following){following=false;if(callbacks.pan)callbacks.pan()}
    schedule()
  }
  function end(event){if(!gesture)return;const moved=gesture.moved;if(touches(event).length){start(event);gesture.moved=true;return}gesture=null;if(moved)changed(true)}
  function zoom(step){camera.s=scaleForZoom(Math.max(14,Math.min(19,zoomForScale(camera.s)+step)));changed(false);schedule()}
  function goTo(position,zoom){const p=point(position);camera.x=p.x;camera.z=p.z;if(Number.isFinite(zoom))camera.s=scaleForZoom(zoom);changed(false);schedule()}
  function overview(){fit();following=false;if(callbacks.pan)callbacks.pan();changed(false);schedule()}
  function destroy(){disposed=true;clearTimeout(frame);frame=null;model={};gesture=null}
  function cancel(){const moved=gesture&&gesture.moved;gesture=null;if(moved)changed(true)}
  fit();schedule()
  return{update,touchStart:start,touchMove:move,touchEnd:end,touchCancel:cancel,zoom,goTo,overview,destroy}
}
module.exports={create,contains,point,scaleForZoom,zoomForScale,metadata:campus}
