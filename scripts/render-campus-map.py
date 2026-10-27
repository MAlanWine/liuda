#!/usr/bin/env python3
"""Bake the static art layer once; phone rendering draws one image per frame."""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
data = json.loads((root/'docs/campus/uibe/data/campus-render.json').read_text())
items,meta = data['items'],data['metadata']
b = meta['bounds']; width = 1536
scale = width / (b['right']-b['left'])
height = round((b['bottom']-b['top'])*scale)
im = Image.new('RGB',(width,height),'#243b47');d=ImageDraw.Draw(im)
rng=random.Random(29103)
def xy(p): return ((p[0]-b['left'])*scale,(p[1]-b['top'])*scale)
def poly(points,fill,outline=None): d.polygon([xy(p) for p in points],fill=fill,outline=outline)
def inside(p,ring):
    result=False
    for a,c in zip(ring,ring[1:]):
        if (a[1]>p[1])!=(c[1]>p[1]) and p[0]<(c[0]-a[0])*(p[1]-a[1])/(c[1]-a[1])+a[0]:result=not result
    return result
def distance(p,a,c):
    dx,dy=c[0]-a[0],c[1]-a[1]
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy or 1)))
    return math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t)
boundary=meta['boundary'];buildings=[f for f in items if f['layer']=='building'];roads=[f for f in items if f['layer']=='road'];sports=[f for f in items if f['layer']=='sport']
poly(boundary,'#3b534e','#8a9879')
for area in meta['draftAreas']:
    left,top=xy((area['left'],area['top']));right,bottom=xy((area['right'],area['bottom']))
    d.rectangle((left,top,right,bottom),fill='#334b4e')
    for x in range(round(left),round(right),12):d.line((x,top,x,bottom),fill='#3b5354',width=1)
for f in sorted(items,key=lambda f:0 if f['tags'].get('leisure')=='stadium' else 1):
    if f['layer']=='sport':
        poly(f['points'],'#c5a06d' if f['id']==779016645 else '#6f8064','#293f42')
        # The source polygon is retained. Pitch markings below are decorative only.
        xs=[p[0] for p in f['points']];ys=[p[1] for p in f['points']]
        if f['id']==412476323:
            a=xy((min(xs)+12,min(ys)+16));c=xy((max(xs)-12,max(ys)-16))
            d.rounded_rectangle((*a,*c),radius=32*scale,outline='#a47d61',width=max(1,round(scale*5)))
            cx=(a[0]+c[0])/2;cy=(a[1]+c[1])/2;w=(c[0]-a[0])*.54;h=(c[1]-a[1])*.62
            d.rectangle((cx-w/2,cy-h/2,cx+w/2,cy+h/2),outline='#c7c298',width=1)
            d.line((cx-w/2,cy,cx+w/2,cy),fill='#c7c298',width=1)
            d.ellipse((cx-7*scale,cy-7*scale,cx+7*scale,cy+7*scale),outline='#c7c298',width=1)
for f in roads:
    points=[xy(p) for p in f['points']];w=4 if f['tags'].get('highway') in ('footway','pedestrian') else 7
    d.line(points,fill='#213c42',width=round((w+3)*scale),joint='curve')
    d.line(points,fill='#9e916d',width=round((w+1)*scale),joint='curve')
    d.line(points,fill='#c9b78b',width=round(w*scale),joint='curve')
for f in buildings:
    poly([[p[0]+4,p[1]+5] for p in f['points']],'#203943')
    gold=f['id'] in (779016652,779016664,779016655,779016654,632711504,779016646,779016653)
    poly(f['points'],'#c7a16b' if gold else '#637d83','#eed5a4' if gold else '#acb6a4')
    mask=Image.new('1',im.size,0);md=ImageDraw.Draw(mask);md.polygon([xy(p) for p in f['points']],fill=1)
    pattern=im.copy();pd=ImageDraw.Draw(pattern)
    xs=[xy(p)[0] for p in f['points']];ys=[xy(p)[1] for p in f['points']]
    left,top,right,bottom=map(round,(min(xs),min(ys),max(xs),max(ys)))
    for x in range(left,right,6):pd.line((x,top,x,bottom),fill='#b18f63' if gold else '#526d77',width=1)
    for y in range(top,bottom,13):pd.line((left,y,right,y),fill='#d3b57d' if gold else '#71898b',width=1)
    if right-left>20 and bottom-top>20:
        pd.rectangle((left+6,top+6,right-6,bottom-6),outline='#796244' if gold else '#344e5c',width=2)
        pd.rectangle((left+9,top+9,right-9,bottom-9),outline='#e7c58b' if gold else '#879c99',width=1)
    im.paste(pattern,(0,0),mask);d=ImageDraw.Draw(im)
    for x in range(left+14,right-10,22):
        if mask.getpixel((x,min(height-1,top+3))):d.rectangle((x,top+1,x+4,top+5),fill='#f1d495')
for y in range(math.floor(b['top']),math.ceil(b['bottom']),8):
    for x in range(math.floor(b['left']),math.ceil(b['right']),8):
        p=(x+rng.uniform(-2.5,2.5),y+rng.uniform(-2.5,2.5))
        if any(a['left']<p[0]<a['right'] and a['top']<p[1]<a['bottom'] for a in meta['draftAreas']):continue
        if not inside(p,boundary) or rng.random()>.56 or any(inside(p,f['points']) for f in buildings+sports):continue
        if min(distance(p,a,c) for f in roads for a,c in zip(f['points'],f['points'][1:]))<9:continue
        # Reserve the source's closed pedestrian loop, without asserting its place name.
        if any(f['id']==996319884 and inside(p,f['points']) for f in roads):continue
        cx,cy=xy(p);radius=rng.uniform(2.4,3.8)*scale
        d.ellipse((cx-radius+3,cy-radius+4,cx+radius+3,cy+radius+4),fill='#233b43')
        autumn=rng.random()>.94;fill='#a27451' if autumn else rng.choice(['#597567','#637e69','#73856c'])
        d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),fill=fill,outline='#344f4c',width=1)
        d.arc((cx-radius+2,cy-radius+1,cx+radius-2,cy+radius-2),190,285,fill='#c5bc86' if autumn else '#99aa80',width=1)
        d.line((cx-radius*.5,cy+radius*.4,cx+radius*.25,cy-radius*.6),fill='#415e52',width=1)
for f in roads:
    for a,c in zip(f['points'],f['points'][1:]):
        length=math.dist(a,c)
        for step in range(10,round(length),27):
            px=a[0]+(c[0]-a[0])*step/length+5*(c[1]-a[1])/length
            py=a[1]+(c[1]-a[1])*step/length-5*(c[0]-a[0])/length
            cx,cy=xy((px,py));r=2*scale
            d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#a79869')
            d.ellipse((cx-scale*.65,cy-scale*.65,cx+scale*.65,cy+scale*.65),fill='#f1d798')
# Print grain is baked, never regenerated for each GPS update.
for _ in range(46000):
    x=rng.randrange(width);y=rng.randrange(height);color=im.getpixel((x,y));delta=rng.choice([-5,-3,3,5]);d.point((x,y),fill=tuple(max(0,min(255,v+delta)) for v in color))
output=root/'miniprogram/assets/campus/uibe-night.jpg';im.save(output,quality=76,optimize=True,subsampling=0)
print('Baked',width,height,'pixels;',output.stat().st_size,'bytes')
