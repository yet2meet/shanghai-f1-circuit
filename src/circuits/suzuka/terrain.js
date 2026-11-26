import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asGround } from '../../osm.js';
import { groundDetail } from '../../textures.js';
import { canvasTex, makePath, ribbon, std, V } from '../../util.js';
const mix = THREE.MathUtils.lerp;

// Spatial index of line segments. Interpolation preserves the shared height
// and width at way junctions and can distinguish the two decks by elevation.
export function indexPath(points, closed = false, padding = 32) {
  const cell = 32, cells = new Map();
  const key = (i, j) => i + 65536 * j;
  const at = n => Math.floor(n / cell);
  for (let i = 0; i < points.length - Number(!closed); i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    if (!length2) continue;
    const segment = { i, a, b, dx, dz, length2, length: Math.sqrt(length2) };
    for (let j = at(Math.min(a.z, b.z) - padding); j <= at(Math.max(a.z, b.z) + padding); j++) {
      for (let k = at(Math.min(a.x, b.x) - padding); k <= at(Math.max(a.x, b.x) + padding); k++) {
        const id = key(k, j);
        if (!cells.has(id)) cells.set(id, []);
        cells.get(id).push(segment);
      }
    }
  }
  return (x, z, y, omit = () => false) => {
    let best = Infinity, hit;
    for (const s of cells.get(key(at(x), at(z))) ?? []) {
      if (omit(s.i)) continue;
      const t = THREE.MathUtils.clamp(((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.length2, 0, 1);
      const rx = x - (s.a.x + t * s.dx), rz = z - (s.a.z + t * s.dz), height = mix(s.a.y, s.b.y, t);
      const d = rx * rx + rz * rz + (y === undefined ? 0 : (y - height) ** 2);
      if (d < best) {
        best = d;
        hit = { i: s.i, t, height, d: Math.hypot(rx, rz), side: (rx * s.dz - rz * s.dx) / s.length };
      }
    }
    return hit;
  };
}

export function contains(p, x, n) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, an] = p[i], [bx, bn] = p[j];
    if ((an > n) !== (bn > n) && x < (bx - ax) * (n - an) / (bn - an) + ax) inside = !inside;
  }
  return inside;
}

export function bounds(p) {
  return p.reduce(([x0, n0, x1, n1], [x, n]) => [Math.min(x, x0), Math.min(n, n0), Math.max(x, x1), Math.max(n, n1)],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

export function polygonIndex(items) {
  const cell = 64, bins = new Map(), key = (i, j) => i + 65536 * j;
  for (const item of items) {
    const [x0, n0, x1, n1] = bounds(item.p);
    for (let j = Math.floor(n0 / cell); j <= Math.floor(n1 / cell); j++) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
        const k = key(i, j);
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k).push(item);
      }
    }
  }
  return (x, n) => (bins.get(key(Math.floor(x / cell), Math.floor(n / cell))) ?? []).find(item => contains(item.p, x, n));
}

export function sampleLine(points, step) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, an] = points[i], [bx, bn] = points[i + 1];
    const count = Math.ceil(Math.hypot(bx - ax, bn - an) / step);
    for (let j = 0; j < count; j++) {
      const x = mix(ax, bx, j / count), n = mix(an, bn, j / count);
      samples.push(V(x, n));
    }
  }
  const [x, n] = points.at(-1);
  samples.push(V(x, n));
  return samples;
}

export function buildRoads(scene, runs) {
  const root = new THREE.Group();
  root.name = 'osm';
  const batches = new Map(), endpoints = new Map();
  const material = {
    road: groundDetail(std('#80858b', {}, 0.19), 'asphalt', { size: 3, k: 0.31 }),
    service: groundDetail(std('#94999f', {}, 0.19), 'asphalt', { k: 0.25 }),
    walk: groundDetail(std('#b9b4a9', {}, 0.19), 'asphalt', { size: 1.8, k: 0.18 }),
    gravel: groundDetail(std('#a19a90', {}, 0.16), 'gravel', { k: 0.38 }),
    raceway: groundDetail(std('#505257', {}, 0.29), 'asphalt', { k: 0.55 }),
    edge: std('#c8c9c5', {}, 0.21),
    paint: std('#f3f2ec', {}, 0.4),
  };
  const add = (key, geom) => {
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(geom);
  };
  for (const { road, points } of runs) {
    const path = makePath(points);
    const key = road.kind === 'raceway' ? 'raceway'
      : /gravel|unpaved|compacted|dirt|ground/.test(road.surface ?? '') ? 'gravel'
      : ['footway', 'path', 'pedestrian'].includes(road.kind) ? 'walk'
      : road.kind === 'service' ? 'service' : 'road';
    const half = road.w / 2;
    add(key, ribbon(path, { offA: half, offB: -half }));
    if ((key === 'walk' && road.surface === 'paving_stones') || (key === 'road' && road.lanes >= 2)) {
      for (const side of [-1, 1]) {
        const edge = side * (half - 0.13);
        add('edge', ribbon(path, { offA: edge + 0.085, offB: edge - 0.085,
          skip: i => Math.min(path.dist[i], path.total - path.dist[i]) < 5.5 }));
      }
    }
    if (key === 'road' && road.lanes >= 2) {
      add('paint', ribbon(path, { offA: 0.074, offB: -0.074,
        skip: i => Math.min(path.dist[i], path.total - path.dist[i]) < 8 || path.dist[i] % 13 > 9.5 }));
    }
    // Shared endpoint disks close the wedge between differently angled road ribbons.
    for (const p of [path.pts[0], path.pts.at(-1)]) {
      const id = `${key}:${p.x}:${p.z}`;
      if (!endpoints.has(id) || endpoints.get(id).half < half) endpoints.set(id, { key, p, half });
    }
  }
  for (const { key, p, half } of endpoints.values()) {
    add(key, new THREE.CircleGeometry(half, 10).rotateX(-Math.PI / 2).translate(p.x, 0, p.z));
  }
  for (const [key, geos] of batches) {
    const detail = key === 'paint' || key === 'edge';
    const mesh = new THREE.Mesh(mergeGeometries(geos), material[key]);
    mesh.position.y = detail ? 0.073 : 0.055;
    mesh.name = `suzuka-${key}`;
    root.add(asGround(mesh, detail ? -2 : -2.1));
  }
  scene.add(root);
  return root;
}

export function buildShoulders(scene, track, pitAt, color) {
  const root = scene.getObjectByName('track');
  const grass = groundDetail(std(color, {}, 0.19), 'grass', { k: 0.30 });
  for (const side of [-1, 1]) {
    const skip = i => {
      const p = track.pts[i], n = track.nor[i], w = track.widthAt(i);
      if (p.y > 0.02) return true;
      if (side > 0) return false;
      const distance = w + 1.8;
      const hit = pitAt(p.x - distance * n.x, p.z - distance * n.z, p.y);
      return Boolean(hit && hit.d < 6.4);
    };
    const edge = (i, offset) => side * (track.widthAt(i) + offset);
    for (const [near, far, bank] of [[-0.10, 2.25, false], [2.25, 4.8, true]]) {
      const offA = i => edge(i, side > 0 ? far : near);
      const offB = i => edge(i, side > 0 ? near : far);
      const heightAt = (x, z, i) => {
        const p = track.pts[i];
        if (!bank) return p.y + 0.096;
        const lateral = Math.abs((x - p.x) * track.nor[i].x + (z - p.z) * track.nor[i].z);
        const amount = THREE.MathUtils.clamp((lateral - track.widthAt(i) - near) / (far - near), 0, 1);
        return mix(p.y + 0.096, 0.025, amount);
      };
      root.add(asGround(new THREE.Mesh(ribbon(track.path, { offA, offB, heightAt, skip }), grass), -1.36));
    }
  }
}

const shapeGeometry = polygon => new THREE.ShapeGeometry(new THREE.Shape(polygon.map(p => new THREE.Vector2(...p))))
  .rotateX(-Math.PI / 2);

export function pondShorelines(areas) {
  return areas.filter(area => area.kind === 'water').map(({ id, p }) => {
    // Cut corner noise at the mapped shoreline while retaining the banks.
    const rim = p.flatMap((a, i) => {
      const b = p[(i + 1) % p.length];
      return [0.18, 0.82].map(t => [mix(a[0], b[0], t), mix(a[1], b[1], t)]);
    });
    return { id, p: rim };
  });
}

export function buildLandCover(root, areas, ponds, grassColor) {
  const material = {
    grass: groundDetail(std(grassColor, {}, 0.16), 'grass', { k: 0.38 }),
    parking: groundDetail(std('#a3a7ad', {}, 0.15), 'asphalt', { k: 0.30 }),
    paved: groundDetail(std('#b6b5b0', {}, 0.15), 'asphalt', { k: 0.19 }),
  };
  for (const kind of Object.keys(material)) {
    const patches = areas.filter(a => a.kind === kind).map(a => shapeGeometry(a.p));
    if (!patches.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(patches), material[kind]);
    mesh.position.y = 0.026;
    mesh.name = `suzuka-cover-${kind}`;
    root.add(asGround(mesh, -4.5));
  }
  const ripple = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#809ba9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 36; i++) {
      g.strokeStyle = i % 3 === 0 ? '#698593' : '#8ea8b3';
      g.lineWidth = 0.65;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = i * h / 36 + 1.5 * Math.sin(x / w * Math.PI * 4 + i * 0.6);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }, [1, 1]);
  const water = std('#a4bac4', { map: ripple, roughness: 0.27, metalness: 0.26, envMapIntensity: 0.65 }, 0.19);
  const bank = groundDetail(std('#a4a796', {}, 0.11), 'gravel', { k: 0.29 });
  for (const pond of ponds) {
    const geo = shapeGeometry(pond.p);
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 15, pos.getZ(i) / 15);
    const surface = new THREE.Mesh(geo, water);
    surface.name = `suzuka-pond-${pond.id}`;
    surface.position.y = 0.042;
    root.add(asGround(surface, -3.45));
    // A narrow gravel shoreline follows the water.
    const edge = makePath(pond.p.map(p => V(...p)), true);
    const winding = pond.p.reduce((sum, [x, n], i) => {
      const [a, b] = pond.p[(i + 1) % pond.p.length]; return sum + x * b - a * n;
    }, 0);
    const offsets = winding > 0 ? { offA: 0.075, offB: -2.0 } : { offA: 2, offB: -0.075 };
    root.add(asGround(new THREE.Mesh(ribbon(edge, { ...offsets, y: 0.034 }), bank), -3.6));
  }
}
