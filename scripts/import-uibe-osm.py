#!/usr/bin/env python3
"""Prepare a preliminary campus reference extract; never update the app map.

Input: an OSM API 0.6 map response downloaded by the maintainer.
Output coordinates: WGS84 longitude, latitude. No GCJ-02 conversion.
Only complete ways are supported. Relations and point POIs are not exported.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

CAMPUS_ID = '412468627'
SOURCE_URL = ('https://api.openstreetmap.org/api/0.6/map'
              '?bbox=116.4181,39.9758,116.4248,39.9821')
EXPORT_TAGS = {'name', 'name:en', 'building', 'building:levels', 'height',
               'amenity', 'highway', 'leisure', 'sport', 'surface', 'access'}


def inside(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:]):
        if ((a[1] > y) != (b[1] > y)
                and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]):
            result = not result
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--retrieved-at', required=True,
                        help='Actual acquisition date, YYYY-MM-DD')
    args = parser.parse_args()
    raw = args.source.read_bytes()
    root = ET.fromstring(raw)
    nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])]
             for n in root.findall('node')}
    campus = root.find("way[@id='%s']" % CAMPUS_ID)
    if campus is None:
        raise ValueError('Campus way missing from input')
    boundary = [nodes[n.attrib['ref']] for n in campus.findall('nd')]
    features, skipped = [], []
    for way in root.findall('way'):
        osm_id = way.attrib['id']
        tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
        refs = [n.attrib['ref'] for n in way.findall('nd')]
        if not refs or any(ref not in nodes for ref in refs):
            skipped.append(osm_id)
            continue
        coords = [nodes[ref] for ref in refs]
        closed = len(coords) >= 4 and refs[0] == refs[-1]
        unique = coords[:-1] if closed else coords
        # Selection only: vertex mean is neither a surveyed point nor an entrance.
        mean = [sum(c[axis] for c in unique) / len(unique) for axis in (0, 1)]
        if osm_id != CAMPUS_ID and not inside(mean, boundary):
            continue
        layer = ('campus' if osm_id == CAMPUS_ID else
                 'building' if 'building' in tags else
                 'road' if 'highway' in tags else
                 'sport' if 'leisure' in tags else None)
        if layer is None:
            continue
        polygon = closed and layer != 'road'
        geometry = {'type': 'Polygon' if polygon else 'LineString',
                    'coordinates': [coords] if polygon else coords}
        features.append({
            'type': 'Feature', 'id': 'way/' + osm_id,
            'properties': {
                'layer': layer, 'osm_type': 'way', 'osm_id': int(osm_id),
                'osm_version': int(way.attrib['version']),
                'osm_edited_at': way.attrib.get('timestamp'),
                'source_url': 'https://www.openstreetmap.org/way/' + osm_id,
                'accuracy_m': None, 'field_verified': False,
                'tags': {k: v for k, v in tags.items() if k in EXPORT_TAGS},
            }, 'geometry': geometry,
        })
    features.sort(key=lambda f: (f['properties']['layer'], f['properties']['osm_id']))
    args.output.mkdir(parents=True, exist_ok=True)
    data = {'type': 'FeatureCollection',
            'name': 'uibe-preliminary-osm-wgs84',
            'attribution': '© OpenStreetMap contributors',
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
            'features': features}
    (args.output / 'uibe-osm-wgs84.geojson').write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    counts = dict(Counter(f['properties']['layer'] for f in features))
    manifest = {
        'retrieved_at': args.retrieved_at,
        'generated_at_utc': datetime.now(timezone.utc).isoformat(),
        'source_url': SOURCE_URL, 'raw_sha256': hashlib.sha256(raw).hexdigest(),
        'coordinates': 'WGS84 longitude, latitude (GeoJSON / RFC 7946)',
        'attribution': '© OpenStreetMap contributors',
        'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
        'counts': counts,
        'features_with_height_or_levels': sum(
            any(k in f['properties']['tags'] for k in ('height', 'building:levels'))
            for f in features),
        'incomplete_way_ids_skipped': skipped,
        'selection': 'Campus way plus tagged ways whose vertex mean is inside it; '
                     'not spatially clipped. Relations and standalone nodes excluded.',
        'accuracy_m': None, 'field_verified': False,
        'app_integrated': False,
    }
    (args.output / 'source-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'features': len(features), 'counts': counts,
                      'incomplete_ways': skipped}, ensure_ascii=False))


if __name__ == '__main__':
    main()
