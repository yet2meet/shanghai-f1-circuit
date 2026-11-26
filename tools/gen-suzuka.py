"""Project the retained OSM/GSI snapshots for the Suzuka scene.

Run: python -X utf8 tools/gen-suzuka.py
Source and interpretation notes: tools/suzuka-sources.md.
"""
from functools import lru_cache
import gzip
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'osm-raw-suzuka'
OUT = ROOT.parent / 'src' / 'circuits' / 'suzuka'
R, LAT, LON = 6371000, 34.844, 136.5325
KY = math.pi / 180 * R
KX = KY * math.cos(math.radians(LAT))
DATUM = 16


def tags(element):
    return {tag.get('k'): tag.get('v') for tag in element.findall('tag')}


def project(lon, lat):
    return [round((lon - LON) * KX, 2), round((lat - LAT) * KY, 2)]


@lru_cache(maxsize=None)
def tile(kind, x, y):
    with gzip.open(RAW / f'{kind}-{x}-{y}.txt.gz', 'rt') as stream:
        return [[math.nan if v == 'e' else float(v) for v in line.strip().split(',')] for line in stream]


def altitude(x, n):
    lon, lat = LON + x / KX, LAT + n / KY
    for kind, zoom in [('dem5a', 15), ('dem', 14)]:
        scale = 256 * 2 ** zoom
        u = scale * (lon + 180) / 360 - 0.5
        v = scale * (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 - 0.5
        i, j = math.floor(u), math.floor(v)
        a, b = u - i, v - j
        samples = [(tile(kind, col // 256, row // 256)[row % 256][col % 256], weight)
                   for col, wx in [(i, 1 - a), (i + 1, a)]
                   for row, wy in [(j, 1 - b), (j + 1, b)] for weight in [wx * wy]]
        if all(math.isfinite(value) for value, _ in samples):
            return sum(value * weight for value, weight in samples) - DATUM
    raise ValueError(f'Missing GSI coverage at {lon}, {lat}')


def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def main():
    with gzip.open(RAW / 'venue.osm.gz', 'rb') as stream:
        osm = ET.parse(stream).getroot()
    nodes = {int(e.get('id')): project(float(e.get('lon')), float(e.get('lat'))) for e in osm.findall('node')}
    ways = {int(e.get('id')): ([int(n.get('ref')) for n in e.findall('nd')], tags(e)) for e in osm.findall('way')}
    relation = osm.find("relation[@id='284570']")
    race = {int(m.get('ref')) for m in relation.findall('member') if not m.get('role')}
    by_start = {ways[i][0][0]: i for i in race}
    assert len(by_start) == len(race)
    first = 183391665  # Main straight, in the mapped one-way race direction
    route = [first]
    while (nxt := by_start[ways[route[-1]][0][-1]]) != first:
        assert nxt not in route
        route.append(nxt)
    assert set(route) == race, (len(route), race - set(route))

    def points(i):
        return [nodes[j] for j in ways[i][0]]

    def interpolate_at(points, f):
        lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
        d = f * sum(lengths)
        for a, b, length in zip(points, points[1:], lengths):
            if d <= length:
                return [round(x + (y - x) * d / length, 2) for x, y in zip(a, b)]
            d -= length
        return points[-1]

    # At the crossover the DEM can sample the deck instead of the lower road.
    # Interpolate T9–T10 between the mapped covered span's ends, away from the deck.
    under = 183391655
    under_points = [interpolate_at(points(under), i / 16) for i in range(17)]
    ends = [altitude(*under_points[0]), altitude(*under_points[-1])]
    upper = points(175231434)
    # Laser returns at the deck ends include the ramp below. Sample along the
    # asphalt 12 m outside both ends and interpolate over the covered road.
    span = math.dist(*upper)
    deck_ends = [altitude(*(a + (a - b) * 12 / span for a, b in zip(p, q)))
                 for p, q in [upper, upper[::-1]]]
    deck_y = {tuple(p): deck_ends[j] for j, p in enumerate(upper)}
    center, turns = [], {}
    for i in route:
        pp = under_points if i == under else points(i)
        t = ways[i][1]
        width = float(t['width'])
        for j, p in enumerate(pp[:-1]):
            height = ends[0] + (ends[1] - ends[0]) * j / 16 if i == under else deck_y.get(tuple(p), altitude(*p))
            center.append([*p, round(height, 2), width])
        if 'raceway:corner_number' in t and i != 183391661:
            turns[int(t['raceway:corner_number'])] = interpolate_at(pp, 0.5)
    length = sum(math.dist(a[:2], b[:2]) for a, b in zip(center, center[1:] + center[:1]))
    assert 5780 < length < 5840 and set(turns) == set(range(1, 19)), length
    # The four-wheel entrance branches at T18. The inside chicane connector
    # shown on the course guide is for motorcycles.
    pit = points(120917578)

    roads, areas, buildings, stands = [], [], [], []
    classes = {'primary': 9, 'secondary': 8, 'tertiary': 7, 'unclassified': 6, 'residential': 5,
               'service': 4.6, 'pedestrian': 5, 'footway': 2.4, 'track': 3, 'path': 1.6}
    area_types = {'water': 'water', 'wood': 'forest', 'forest': 'forest', 'grass': 'grass',
                  'meadow': 'grass', 'grassland': 'grass', 'scrub': 'forest', 'farmland': 'fields'}
    xmin, xmax, nmin, nmax = -1432, 1512, -896, 1040
    region = [xmin, nmin, xmax, nmax]
    stand_aliases = {183999763: 'J', 183999779: 'H', 184004012: 'I', 184105033: 'I'}
    for i, (refs, t) in ways.items():
        if any(ref not in nodes for ref in refs):
            continue
        p = points(i)
        if not p:
            continue
        name = t.get('name:en') or t.get('name', '')
        closed = refs[0] == refs[-1] and len(p) >= 4
        inside = [xmin < x < xmax and nmin < n < nmax for x, n in p]
        if not any(inside):
            continue
        if t.get('grandstand') == 'yes' or t.get('leisure') == 'bleachers':
            stands.append({'id': i, 'name': stand_aliases.get(i, name), 'p': p[:-1]})
            continue
        highway = t.get('highway')
        if highway in classes and not (t.get('bridge') or t.get('tunnel') or t.get('covered') or t.get('layer', '0') != '0'):
            width = t.get('width', '')
            entry = {'id': i, 'kind': highway, 'w': classes[highway], 'p': p}
            if width.replace('.', '', 1).isdigit() and 1 <= float(width) <= 25:
                entry['w'] = float(width)
            if t.get('lanes', '').isdigit() and t.get('oneway') != 'yes':
                entry['lanes'] = int(t['lanes'])
            if t.get('surface'):
                entry['surface'] = t['surface']
            roads.append(entry)
        elif highway == 'raceway' and (t.get('sport') == 'karting' and not t.get('layer') or i in {153525062, 411295350}):
            roads.append({'id': i, 'kind': 'raceway', 'w': 8 if i == 153525062 else 4, 'p': p})
        if not closed:
            continue
        p = p[:-1]
        kind = area_types.get(t.get('natural')) or area_types.get(t.get('landuse'))
        if t.get('amenity') == 'parking':
            kind = 'parking'
        elif t.get('landuse') == 'reservoir':
            kind = 'water'
        elif t.get('area:highway') in classes or (t.get('highway') == 'pedestrian' and t.get('area') == 'yes'):
            kind = 'paved'
        if kind:
            areas.append({'id': i, 'kind': kind, 'p': p})
        if t.get('building') and all(inside):
            height = t.get('height', '').split(' ')[0]
            levels = t.get('building:levels', '')
            h = float(height) if height.replace('.', '', 1).isdigit() else float(levels) * 3.25 if levels.replace('.', '', 1).isdigit() else 4.8
            buildings.append({'id': i, 'name': name, 'h': h, 'kind': t['building'],
                              'roof': t['building'] == 'roof', 'p': p})

    step = 8
    w, h = (xmax - xmin) // step + 1, (nmax - nmin) // step + 1
    grid = [round(altitude(xmin + i * step, nmin + j * step) * 10) for j in range(h) for i in range(w)]
    OUT.mkdir(parents=True, exist_ok=True)
    write('projection.json', {'LAT0': LAT, 'R': R, 'lon0': LON, 'M': [-500, 25], 'r': [1, 0], 'd': [0, 1]})
    write('terrain-data.json', {'x': xmin, 'n': nmin, 'step': step, 'w': w, 'h': h, 'grid': grid})
    write('map-data.json', {
        'track': center, 'turns': [[i, *turns[i]] for i in range(1, 19)], 'pit': pit,
        'upper': points(175231434), 'lower': points(under), 'region': region, 'stands': stands,
        'roads': roads, 'areas': areas, 'buildings': buildings, 'wheel': points(184107083)[:-1],
    })
    print(f'OSM: {len(route)} ways, {len(center)} points, {length:.2f} m; FIA: 5807 m')
    print(f'DEM: {w}×{h}, relative range {min(grid)/10:.1f}…{max(grid)/10:.1f} m; crossover spans: {points(175231434)}, {points(under)}')
    print(f'{len(stands)} stand polygons, {len(buildings)} footprints, {len(roads)} road ways, {len(areas)} areas')


if __name__ == '__main__':
    main()
