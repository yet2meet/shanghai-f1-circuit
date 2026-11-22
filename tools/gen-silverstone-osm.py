"""从保留的 OSM 原始 XML 提取银石地物；坐标基准与 gen-silverstone.mjs 一致。"""
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'tools' / 'osm-raw-silverstone'
FILES = ['south-west', 'south-east', 'center-west', 'center-east-a', 'center-east-b', 'center-east-c', 'center-east-d', 'north-west', 'north-east']
LAT0, LON0, R = 52.0712, -1.01675, 6371000
KX, KY = math.pi / 180 * R * math.cos(math.radians(LAT0)), math.pi / 180 * R

nodes, ways, relations = {}, {}, {}
for name in FILES:
    root = ET.parse(RAW / f'{name}.osm').getroot()
    for node in root.findall('node'):
        nodes[node.attrib['id']] = (float(node.attrib['lon']), float(node.attrib['lat']))
    for way in root.findall('way'):
        ways[way.attrib['id']] = way
    for relation in root.findall('relation'):
        relations[relation.attrib['id']] = relation

def geometry(way):
    refs = [nd.attrib['ref'] for nd in way.findall('nd')]
    if any(ref not in nodes for ref in refs):
        return None
    return [[round((nodes[ref][0] - LON0) * KX, 1), round((nodes[ref][1] - LAT0) * KY, 1)] for ref in refs]

def contains(poly, x, y):
    inside = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:]):
        if (ay > y) != (by > y) and x < ax + (bx - ax) * (y - ay) / (by - ay):
            inside = not inside
    return inside

gp_ways = {m.attrib['ref'] for m in relations['51160'].findall('member') if m.attrib['type'] == 'way'}
wing_id = '227332429'
wing_outline = geometry(ways[wing_id])
if not wing_outline:
    raise RuntimeError('Silverstone Wing 缺少轮廓节点')
buildings, stands, bridges, roads, raceways, areas, pit, wing = [], [], [], [], [], [], None, None
wing_parts, wing_solar = [], []
for ident, way in ways.items():
    tags = {tag.attrib['k']: tag.attrib['v'] for tag in way.findall('tag')}
    pts = geometry(way)
    if not pts or len(pts) < 2:
        continue
    closed = len(pts) >= 4 and pts[0] == pts[-1]
    if closed and (tags.get('building:part') or tags.get('generator:source') == 'solar'):
        polygon = pts[:-1]
        center = [sum(axis) / len(polygon) for axis in zip(*polygon)]
        if contains(wing_outline, *center):
            if tags.get('building:part'):
                wing_parts.append({'id': ident, 'p': polygon, 'tags': tags})
            else:
                wing_solar.append(polygon)
    if ident == '227902927':
        pit = pts
    elif tags.get('highway') == 'raceway' and ident not in gp_ways and tags.get('surface') != 'dirt':
        raceways.append({'id': ident, 'name': tags.get('name', ''), 'p': pts,
                         'width': tags.get('width'), 'sport': tags.get('sport'), 'surface': tags.get('surface')})
    if tags.get('building') not in (None, 'no', 'construction') and closed:
        item = {'id': ident, 'name': tags.get('name', ''), 'tags': tags, 'p': pts[:-1]}
        if ident == wing_id:
            wing = item
        elif tags['building'] == 'grandstand':
            stands.append(item)
        elif tags['building'] == 'bridge':
            bridges.append(item)
        else:
            buildings.append(item)
    elif tags.get('area') != 'yes' and tags.get('highway') in ('primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified', 'footway', 'pedestrian', 'path', 'cycleway', 'living_street', 'track', 'steps'):
        roads.append({'id': ident, 'kind': tags['highway'], 'name': tags.get('name', ''), 'p': pts,
                      'bridge': tags.get('bridge'), 'tunnel': tags.get('tunnel'), 'layer': tags.get('layer'),
                      'width': tags.get('width'), 'lanes': tags.get('lanes'), 'service': tags.get('service'),
                      'surface': tags.get('surface'), 'nodes': [nd.attrib['ref'] for nd in way.findall('nd')]})
    elif closed and not tags.get('building:part'):
        kind = ('water' if tags.get('natural') == 'water' or tags.get('water') else
                'forest' if tags.get('natural') == 'wood' or tags.get('landuse') == 'forest' else
                'grass' if tags.get('landuse') in ('grass', 'meadow') or tags.get('natural') == 'grassland' else
                'park' if tags.get('leisure') in ('park', 'garden') else
                'pitch' if tags.get('leisure') == 'pitch' else
                'parking' if tags.get('amenity') == 'parking' else
                'gravel' if tags.get('surface') in ('gravel', 'compacted') and tags.get('area') == 'yes' else
                'paved' if tags.get('area') == 'yes' and (
                    tags.get('surface') in ('asphalt', 'paved', 'concrete', 'paving_stones')
                    or tags.get('highway') in ('pedestrian', 'service', 'footway')) else None)
        if kind:
            areas.append({'id': ident, 'kind': kind, 'p': pts[:-1]})

if not pit or not wing:
    raise RuntimeError('缺少国际维修通道或 Silverstone Wing；检查 OSM 数据完整性')
wing.update(parts=wing_parts, solar=wing_solar)
out = ROOT / 'src' / 'circuits' / 'silverstone' / 'osm-data.json'
out.write_text(json.dumps({'buildings': buildings, 'stands': stands, 'bridges': bridges, 'roads': roads, 'raceways': raceways, 'areas': areas, 'pit': pit, 'wing': wing}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'建筑 {len(buildings)}，看台轮廓 {len(stands)}，桥形建筑 {len(bridges)}，道路 {len(roads)}，赛道线 {len(raceways)}，地块 {len(areas)}，维修通道 {len(pit)} 点。')
