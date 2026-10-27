#!/usr/bin/env python3
"""Draw a reference coverage figure, not a navigation or production map.

Requires Pillow and a CJK font path. Geometry is read from the prepared GeoJSON.
The local equirectangular projection uses WGS84 degrees around campus latitude.
"""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', required=True)
    args = parser.parse_args()
    folder = Path(__file__).resolve().parents[1] / 'docs/campus/uibe'
    data = json.loads((folder / 'data/uibe-osm-wgs84.geojson').read_text())
    features = data['features']
    campus = next(f for f in features if f['properties']['layer'] == 'campus')
    ring = campus['geometry']['coordinates'][0]
    lon0 = min(c[0] for c in ring)
    lat0 = min(c[1] for c in ring)
    lon1 = max(c[0] for c in ring)
    lat1 = max(c[1] for c in ring)
    meter_x = 111320 * math.cos(math.radians((lat0 + lat1) / 2))
    meter_y = 111320
    scale = min(780 / ((lon1 - lon0) * meter_x),
                1060 / ((lat1 - lat0) * meter_y))

    def project(c):
        return (60 + (c[0] - lon0) * meter_x * scale,
                200 + (lat1 - c[1]) * meter_y * scale)

    image = Image.new('RGB', (1320, 1440), '#f8f7f3')
    draw = ImageDraw.Draw(image)
    fonts = {n: ImageFont.truetype(args.font, n) for n in (17, 20, 22, 28, 42)}
    ink, muted = '#263744', '#5b6871'
    draw.text((48, 40), '贸大 · 现有开放数据覆盖', font=fonts[42], fill=ink)
    draw.text((50, 108), '2026-10-27 下载  ·  WGS84  ·  尚未现场核验', font=fonts[22], fill=muted)
    draw.polygon([project(c) for c in ring], fill='#ecefe9', outline='#8d9b97', width=2)
    for layer in ('road', 'sport', 'building'):
        for feature in features:
            if feature['properties']['layer'] != layer:
                continue
            geometry = feature['geometry']
            coords = geometry['coordinates'][0] if geometry['type'] == 'Polygon' else geometry['coordinates']
            points = [project(c) for c in coords]
            if geometry['type'] == 'Polygon':
                draw.polygon(points, fill='#8aa89b' if layer == 'sport' else '#c6a77e',
                             outline='#748778' if layer == 'sport' else '#9c805e', width=2)
            else:
                draw.line(points, fill='#f8f7f3', width=7)
                draw.line(points, fill='#aab1ac', width=2)
    named = [f for f in features if f['properties']['layer'] in ('building', 'sport')
             and f['properties']['tags'].get('name')]
    for index, feature in enumerate(named, 1):
        geometry = feature['geometry']
        coords = geometry['coordinates'][0] if geometry['type'] == 'Polygon' else geometry['coordinates']
        unique = coords[:-1] if coords[0] == coords[-1] else coords
        center = [sum(c[axis] for c in unique) / len(unique) for axis in (0, 1)]
        x, y = project(center)
        draw.ellipse((x-16, y-16, x+16, y+16), fill=ink)
        draw.text((x, y-1), str(index), font=fonts[17], anchor='mm', fill='#ffffff')
        draw.text((900, 215 + (index-1)*48), '%02d  %s' % (index, feature['properties']['tags']['name']),
                  font=fonts[20], fill=ink)
    draw.text((900, 170), '源数据中的名称', font=fonts[28], fill=ink)
    for y, color, label in ((940, '#c6a77e', '24 个建筑轮廓'),
                            (983, '#aab1ac', '38 段道路 / 步道'),
                            (1026, '#8aa89b', '4 个运动设施图形')):
        draw.rectangle((900, y+4, 921, y+25), fill=color)
        draw.text((935, y), label, font=fonts[22], fill=ink)
    draw.text((900, 1100), '没有高度与楼层数据', font=fonts[22], fill=muted)
    draw.text((900, 1140), '空白不代表现实中空置', font=fonts[22], fill=muted)
    draw.text((900, 1180), '不是留答底图效果图', font=fonts[22], fill=muted)
    bar = 100 * scale
    draw.line((60, 1305, 60+bar, 1305), fill=ink, width=4)
    draw.line((60, 1297, 60, 1313), fill=ink, width=3)
    draw.line((60+bar, 1297, 60+bar, 1313), fill=ink, width=3)
    draw.text((60, 1320), '约 100m  /  北向上', font=fonts[20], fill=muted)
    draw.text((48, 1383), '© OpenStreetMap contributors · ODbL 1.0 · openstreetmap.org/copyright',
              font=fonts[20], fill=muted)
    image.save(folder / 'coverage.png')


if __name__ == '__main__':
    main()
