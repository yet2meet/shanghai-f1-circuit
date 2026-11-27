#!/usr/bin/env python3
"""Rebuild Monza's site data from the retained OpenStreetMap extract."""
import gzip
import heapq
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/osm-raw-monza/venue.osm.gz'
OUT = ROOT / 'src/circuits/monza'
PROJECTION = dict(LAT0=45.621, lon0=9.285, R=6371000, M=[0, 0], r=[1, 0], d=[0, 1])

# F1 uses the car chicane at Rettifilo. The motorcycle and Junior branches
# are separate OSM ways. The order starts northbound on the main straight.
TRACK = (
    19842206, 179968242, 179968264, 179968220, 179968262, 179968245,
    179968263, 179968229, 179968251, 179968230, 179968252, 179968228, 1443867792,
    1443867793, 179968254, 179968226, 179968249, 179968239,
    179968257, 179968234,
)
OVAL = (
    1313097098, 19982933, 725687995, 725687994, 34404729, 34404730,
    231256008, 231256009, 34404638, 19983025, 1313098146, 1313098145,
)
PIT = 38168747
GARAGE = 34404652
PODIUM = 219396377
GATES = {
    'A': (2505270905, '1 2 3 4 5 23 24 25 26 27 28 29 30 35'),
    'B': (2414663576, '1 2 3 4 5 6 7 8 12 13 14 16 26 27 28 29 30 32 P'),
    'C': (2800563160, '6 7 8 12 13 14 16 32 P'),
    'D': (2039874466, '6 9 10 10BIS 11 12 13 14 16 18 32 33 34 P'),
    'G': (115473531, '9 10 10BIS 11 12 13 14 16 17 18 20 21 22 23 33 GF P'),
}
WALK = {'path', 'footway', 'steps', 'track', 'cycleway', 'pedestrian'}
DRIVE = {'service', 'unclassified', 'residential', 'secondary'}

def tags(element):
    return {tag.attrib['k']: tag.attrib['v'] for tag in element.findall('tag')}

def points_of(element):
    return [int(node.attrib['ref']) for node in element.findall('nd')]

def project(lat, lon):
    scale = math.pi * PROJECTION['R'] / 180
    return [
        round((lon - PROJECTION['lon0']) * scale * math.cos(math.radians(PROJECTION['LAT0'])), 2),
        round((lat - PROJECTION['LAT0']) * scale, 2),
    ]

def chain(ways, ids, closed=False):
    result = []
    for id_ in ids:
        piece = ways[id_][0]
        if result and result[-1] == piece[-1]:
            piece = piece[::-1]
        if result and result[-1] != piece[0]:
            raise ValueError(f'Disconnected way {id_}: {result[-1]} / {piece[0]}')
        result.extend(piece[bool(result):])
    if closed and result[-1] != result[0]:
        raise ValueError('Race circuit is not closed')
    return result[:-1] if closed else result

def read_map():
    with gzip.open(SOURCE, 'rb') as source:
        root = ET.parse(source).getroot()
    nodes = {int(n.attrib['id']): project(float(n.attrib['lat']), float(n.attrib['lon']))
             for n in root.findall('node')}
    ways = {int(w.attrib['id']): (points_of(w), tags(w)) for w in root.findall('way')}
    return nodes, ways

def unit(x, n):
    d = math.hypot(x, n)
    return x / d, n / d

def aim(a, b):
    return unit(b[0] - a[0], b[1] - a[1])

def shift(p, d, t):
    return [round(p[i] + d[i] * t, 2) for i in range(2)]

def stand_body(item, stands):
    target = item['target']
    if 'osm' in item:
        p = stands[item['osm']]
        if 'slice' not in item:
            return p
        # Laterale Destra is mapped as one outline. The short inter-stand
        # breaks are visible in photographs, but their stations are estimated.
        a, b, c, d = p
        lo, hi = item['slice']
        return [shift(b, aim(b, c), math.dist(b, c) * t) for t in (1-hi, 1-lo)] + [
            shift(a, aim(a, d), math.dist(a, d) * t) for t in (1-lo, 1-hi)]
    if 'arc' in item:
        front = item['arc']
        mid = len(front) // 2
        tx, tn = aim(front[mid - 1], front[mid + 1])
        dx, dn = aim(target, front[mid])
        side = 1 if -tn * dx + tx * dn > 0 else -1
        rear = []
        for i, p in enumerate(front):
            tx, tn = aim(front[max(0, i-1)], front[min(len(front)-1, i+1)])
            rear.append(shift(p, [-tn, tx], item['depth'] * side))
        return front + rear[::-1]
    p = item['front']
    dx, dn = aim(target, p)
    length, depth = item['size']
    a, b = (shift(p, [dn, -dx], sign * length / 2) for sign in (-1, 1))
    return [a, b, shift(b, [dx, dn], depth), shift(a, [dx, dn], depth)]

def cross(a, b, c):
    return (b[0]-a[0]) * (c[1]-a[1]) - (b[1]-a[1]) * (c[0]-a[0])

def intersect(a, b, c, d):
    return cross(a, b, c) * cross(a, b, d) < 0 and cross(c, d, a) * cross(c, d, b) < 0

def gate_code(zone):
    code = zone.replace(' ', '')
    if code == '8BIS':
        return '8'
    return code if code in ('10BIS', 'GF', 'P') else code.rstrip('ABCDEF')

def roads_for_gates(nodes, ways, track, layout, bodies):
    graph = {}
    edges = {}
    race = list(zip(track, track[1:] + track[:1]))
    for id_, (refs, t) in ways.items():
        highway = t.get('highway')
        if highway not in WALK | DRIVE or t.get('area') == 'yes':
            continue
        tunnel = t.get('tunnel') == 'yes'
        bridge = t.get('bridge') in ('yes', 'viaduct') or t.get('layer') == '1'
        kind = 'walk' if highway in WALK else 'drive'
        width = 3.2 if kind == 'walk' else 6.2 if t.get('lanes') == '2' else 4.6
        if tunnel:
            width = min(width, 4.5)
        for i, (a, b) in enumerate(zip(refs, refs[1:])):
            p, q = nodes[a], nodes[b]
            if p == q or not any(-630 < x < 1040 and -1380 < n < 1260 for x, n in (p, q)):
                continue
            if not tunnel and not bridge and any(intersect(p, q, c, d) for c, d in race):
                continue
            length = math.dist(p, q)
            count = 1 if tunnel or bridge else math.ceil(length / 24)
            chain = [a]
            for j in range(1, count):
                ref = -(id_ * 100000 + i * 100 + j)
                nodes[ref] = shift(p, aim(p, q), length * j / count)
                chain.append(ref)
            chain.append(b)
            for j, (u, v) in enumerate(zip(chain, chain[1:])):
                key = (id_, i, j)
                edges[key] = (u, v, kind, width, tunnel, bridge)
                weight = length / count * (1.14 if kind == 'drive' else 1) * (2.2 if t.get('access') == 'private' else 1)
                graph.setdefault(u, []).append((v, key, weight))
                graph.setdefault(v, []).append((u, key, weight))

    def tree(origin, service=False):
        queue, score, previous = [(0, origin)], {origin: 0}, {}
        while queue:
            cost, a = heapq.heappop(queue)
            if score[a] != cost:
                continue
            for b, key, weight in graph.get(a, ()):
                if service and edges[key][2] != 'drive':
                    continue
                updated = cost + weight
                if updated >= score.get(b, math.inf):
                    continue
                score[b] = updated
                previous[b] = (a, key)
                heapq.heappush(queue, (updated, b))
        return score, previous

    selected = set()
    route_counts = {}
    links = {}
    missing = []
    gate_data = {}
    for gate, (id_, zones) in GATES.items():
        origin = min(graph, key=lambda node: math.dist(nodes[node], nodes[id_]))
        gate_data[gate] = nodes[origin]
        score, previous = tree(origin)
        count = 0
        destinations = []
        for entry, p in zip(layout, bodies):
            if not any(gate_code(z) in zones.split() for z in entry['zones']):
                continue
            target = entry['target']
            cx, cn = (sum(v)/len(p) for v in zip(*p))
            outward = aim(target, (cx, cn))
            rear = sorted(p, key=lambda v: sum(x*d for x, d in zip(v, outward)))[-2:]
            anchor = [round(sum(v)/len(rear), 2) for v in zip(*rear)]
            destinations.append(('/'.join(entry['zones']), anchor))
        if 'P' in zones.split():
            destinations.append(('P', [-180, 599] if gate in ('B', 'C') else [487, 580]))
        for name, anchor in destinations:
            candidates = sorted(score, key=lambda node: math.dist(anchor, nodes[node]))[:45]
            end = next((node for node in candidates if (not all(
                edges[key][4] or edges[key][5] for _, key, _ in graph[node])
                and not any(intersect(anchor, nodes[node], c, d) for c, d in race))), None)
            if end is None or math.dist(anchor, nodes[end]) > 185:
                missing.append((gate, name))
                continue
            if math.dist(anchor, nodes[end]) > 0.4:
                links[name, end] = [nodes[end], anchor]
            count += 1
            while end in previous:
                end, key = previous[end]
                selected.add(key)
        route_counts[gate] = count

    # Keep the paddock service route through the mapped tunnel and end it
    # at the scene boundary just east of the historic oval.
    score, previous = tree(115473216, service=True)
    service_end = min(score, key=lambda node: math.dist(nodes[node], [402, -591]))
    while service_end in previous:
        service_end, key = previous[service_end]
        selected.add(key)
    runs = []
    for (id_, i, j) in sorted(selected):
        a, b, kind, width, tunnel, bridge = edges[id_, i, j]
        if runs and runs[-1]['id'] == id_ and runs[-1]['end'] == a:
            runs[-1]['p'].append(nodes[b])
            runs[-1]['end'] = b
        else:
            runs.append(dict(id=id_, start=a, end=b, p=[nodes[a], nodes[b]], kind=kind, w=width,
                             tunnel=tunnel, bridge=bridge))
    return runs, list(links.values()), gate_data, route_counts, missing

def main():
    nodes, ways = read_map()
    coords = lambda ids: [nodes[node] for node in ids]
    track = coords(chain(ways, TRACK, closed=True))
    oval = coords(chain(ways, OVAL))
    length = sum(math.dist(a, b) for a, b in zip(track, track[1:] + track[:1]))
    stands = {id_: coords(ids[:-1]) for id_, (ids, t) in ways.items()
              if t.get('building') == 'grandstand' and ids[0] == ids[-1]}
    layout = json.loads((OUT / 'stand-layout.json').read_text(encoding='utf-8-sig'))
    bodies = [stand_body(item, stands) for item in layout]
    runs, paths, gates, route_counts, missing = roads_for_gates(nodes, ways, track, layout, bodies)
    facilities = []
    land = []
    for id_, (ids, t) in ways.items():
        if len(ids) < 4 or ids[0] != ids[-1]:
            continue
        p = coords(ids[:-1])
        if t.get('building') and t['building'] != 'grandstand' and id_ not in (GARAGE, PODIUM):
            if not all(-410 < x < 640 and -780 < n < 900 for x, n in p):
                continue
            h = float(t.get('height', '0').split(' ')[0]) if t.get('height', '0').split(' ')[0].replace('.', '', 1).isdigit() else 0
            facilities.append(dict(id=id_, p=p, h=h or (12.2 if id_ == 194458105 else 5.8)))
        if t.get('landuse') in ('forest', 'grass') or t.get('natural') in ('wood', 'grassland'):
            if not all(-820 < x < 1120 and -1450 < n < 1320 for x, n in p):
                continue
            land.append(dict(p=p, kind='wood' if t.get('landuse') == 'forest' or t.get('natural') == 'wood' else 'grass'))
    paddock = [coords(ways[i][0][:-1]) for i in (219396373, 12648707, 231258064)]
    data = dict(
        track=track, pit=coords(ways[PIT][0]), oval=oval, standBodies=bodies,
        garage=coords(ways[GARAGE][0][:-1]), podium=coords(ways[PODIUM][0][:-1]),
        crossings={id_: coords(ways[id_][0]) for id_ in (725687995, 34404729, 34404638)},
        roads=runs, walkLinks=paths, gates=gates, buildings=facilities, land=land, paddock=paddock,
        routeAudit=dict(routes=route_counts, unmatched=missing),
    )
    print(f'OSM F1 polyline: {length:.2f} m')
    print(f'{len(bodies)} bodies, {len(runs)} mapped road runs, {len(paths)} schematic stand links')
    print(f'Gate routes: {route_counts}; unmatched: {missing}')
    for path, value in ((OUT / 'map-data.json', data), (OUT / 'projection.json', PROJECTION)):
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
