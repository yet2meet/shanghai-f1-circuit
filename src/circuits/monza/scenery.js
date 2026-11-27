import * as THREE from 'three';
import clipping from 'polygon-clipping';
import { asGround } from '../../osm.js';
import { groundDetail } from '../../textures.js';
import { makePath, ribbon, rng, std, V, wall } from '../../util.js';
import { buildFootprints } from '../suzuka/buildings.js';
import { meshBatch, sign } from '../suzuka/meshes.js';
import { bounds, contains, indexPath, polygonIndex, sampleLine } from '../suzuka/terrain.js';
import { GATES } from './stands.js';
import { buildFootbridge, crossingWays } from './crossing.js';

const SURFACE = 0.057;
const TUNNEL_Y = -3.65;
const DECK_Y = 5.65;
const mix = THREE.MathUtils.lerp;
const ramp = THREE.MathUtils.smoothstep;

function polygon(p) {
  return [[p]];
}

function ribbonOutline(path, half, from = 0, to = path.N - 1) {
  const side = sign => path.pts.slice(from, to + 1).map((p, j) => {
    const q = p.clone().addScaledVector(path.nor[from + j], half * sign);
    return [Math.round(q.x * 1000) / 1000, Math.round(-q.z * 1000) / 1000];
  });
  return [...side(1), ...side(-1).reverse()];
}

function shapes(polygons) {
  const points = p => p.map(([x, n]) => new THREE.Vector2(x, n));
  return polygons.map(([outline, ...holes]) => {
    const shape = new THREE.Shape(points(outline));
    shape.holes = holes.map(h => new THREE.Path(points(h)));
    return shape;
  });
}

function flat(parent, polys, y, material, order, name) {
  if (!polys.length) return;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes(polys)).rotateX(-Math.PI / 2).translate(0, y, 0), material);
  mesh.name = name;
  parent.add(asGround(mesh, order));
}

function roadSurfaces(scene, map, track) {
  const root = new THREE.Group();
  root.name = 'monza-road-network';
  scene.add(root);
  const drive = groundDetail(std('#8f9395', { side: THREE.DoubleSide }, 0.20), 'asphalt', { size: 4, k: 0.29 });
  const walk = groundDetail(std('#b3ada0', { side: THREE.DoubleSide }, 0.21), 'asphalt', { size: 2, k: 0.20 });
  const concrete = std('#928f84', { side: THREE.DoubleSide }, 0.28);
  const dark = std('#716e62', { side: THREE.DoubleSide }, 0.27);
  const steel = std('#a1a3a0', { side: THREE.DoubleSide }, 0.25);
  const batch = meshBatch(root);
  const crossing = buildFootbridge(root, map.roads, track, SURFACE);
  const roads = [...map.roads, ...map.walkLinks.map(p => ({ p, w: 2.8, kind: 'walk' }))].map(road => ({
    ...road, path: makePath(sampleLine(road.p, road.tunnel ? 2 : 3.5)),
  }));

  const surfaces = [], cuts = [], portals = new Map();
  const key = p => `${p.x},${p.z}`;
  const gates = new Set(Object.values(map.gates).map(p => key(V(...p))));
  for (const { id, tunnel, bridge, path } of roads) {
    if (crossingWays.has(id) || (!tunnel && !bridge)) continue;
    for (const p of [path.pts[0], path.pts.at(-1)]) portals.set(key(p), tunnel ? TUNNEL_Y : DECK_Y);
  }

  const level = { drive: [], walk: [] };
  for (const road of roads) {
    const { p, path, w, tunnel, bridge, kind } = road;
    surfaces.push(...path.pts, null);
    if (crossingWays.has(road.id)) continue;
    const half = w / 2, material = kind === 'drive' ? drive : walk;
    const a = portals.get(key(path.pts[0])) ?? 0;
    const b = portals.get(key(path.pts.at(-1))) ?? 0;
    const approach = Math.min(23, path.total * 0.49);
    const openStart = tunnel && gates.has(key(path.pts[0]));
    const openEnd = tunnel && gates.has(key(path.pts.at(-1)));
    const open = i => (openStart && path.dist[i] < approach) || (openEnd && path.total - path.dist[i] < approach);
    const slope = tunnel ? openStart || openEnd : !bridge && (a !== 0 || b !== 0);
    const heights = path.dist.map(d => {
      if (tunnel) return TUNNEL_Y * (openStart ? ramp(d, 0, approach) : 1)
        * (openEnd ? ramp(path.total - d, 0, approach) : 1);
      if (bridge) return DECK_Y;
      const span = Math.min(path.total * 0.50, a > 0 || b > 0 ? 43 : 24);
      return a * (1 - ramp(d, 0.0, span)) + b * (1 - ramp(path.total - d, 0.0, span));
    });
    path.pts.forEach((point, i) => { point.y = heights[i]; });
    if (tunnel || bridge || a || b) {
      const strip = new THREE.Mesh(ribbon(path, { offA: half, offB: -half, y: SURFACE, uv: 6 }), material);
      strip.receiveShadow = true;
      root.add(strip);
      for (const side of [-1, 1]) {
        if (bridge || tunnel) {
          batch.add(concrete, wall(path, { off: side * half, y: bridge ? -0.62 : SURFACE, h: bridge ? 0.69 : -TUNNEL_Y - 0.29, skip: open }));
          if (bridge) batch.add(steel, wall(path, { off: side * half, y: SURFACE, h: 1.12 }));
        }
        if (slope) {
          const pos = [], uv = [], idx = [];
          path.pts.forEach((p, i) => {
            const q = p.clone().addScaledVector(path.nor[i], side * half);
            const height = p.y + SURFACE;
            pos.push(q.x, Math.min(0, height), q.z, q.x, Math.max(0, height), q.z);
            uv.push(path.dist[i], 0, path.dist[i], 1);
            const k = i * 2;
            if (i && (!tunnel || open(i) || open(i - 1))) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
          });
          const geometry = new THREE.BufferGeometry().setIndex(idx);
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          geometry.computeVertexNormals();
          batch.add(concrete, geometry);
        }
      }
      if (bridge) {
        batch.add(concrete, ribbon(path, { offA: half, offB: -half, y: -0.61 }));
        for (const point of [path.pts[0], path.pts.at(-1)]) {
          if (track.distTo(point.x, point.z, 2) > 8.5) batch.box(concrete, point.x, 2.5, point.z, 1.1, 5.0, w - 0.3);
        }
      }
      if (tunnel) batch.add(dark, ribbon(path, { offA: half + 0.21, offB: -half - 0.21, y: -TUNNEL_Y - 0.22, skip: open }));
      if (!bridge && (!tunnel || openStart || openEnd)) {
        const below = heights.map((y, i) => y < -0.075 && (!tunnel || open(i)) ? i : -1).filter(i => i >= 0);
        for (let i = 0; i < below.length;) {
          const start = below[i];
          while (i + 1 < below.length && below[i + 1] === below[i] + 1) i++;
          const end = below[i++];
          if (end > start) cuts.push(polygon(ribbonOutline(path, half + 0.15, start, end)));
        }
      }
    } else {
      level[kind].push(polygon(ribbonOutline(path, half)));
      // Circular junctions tie the cut ends together at shared topology nodes.
      for (const point of [p[0], p.at(-1)]) {
        if (crossing.feet.has(key(V(...point)))) continue;
        const ring = Array.from({ length: 8 }, (_, i) => {
          const angle = i * Math.PI / 4;
          return [point[0] + half * 0.96 * Math.cos(angle), point[1] + half * 0.96 * Math.sin(angle)];
        });
        level[kind].push(polygon(ring));
      }
    }
  }
  batch.flush();

  const pavement = clipping.union(...level.drive, ...map.paddock.map(polygon));
  const paths = clipping.difference(clipping.union(...level.walk), pavement);
  flat(root, pavement, SURFACE, drive, -2.2, 'monza-drive-pavement');
  flat(root, paths, SURFACE, walk, -2.15, 'monza-walk-pavement');
  const groundCuts = cuts.length ? clipping.union(...cuts) : [];
  const roadAt = indexPath(surfaces, false, 16);
  return { root, roadAt, groundCuts, bridgeBuilding: crossing.camBuilding };
}

function trees(scene, land, raceAt, pitAt, banking, buildingsAt, standEdgeAt, roadAt) {
  const rand = rng(451206), matrix = new THREE.Matrix4(), color = new THREE.Color();
  const points = [];
  for (const area of land.filter(a => a.kind === 'wood')) {
    const [x0, n0, x1, n1] = bounds(area.p);
    const count = Math.min(1900, Math.ceil((x1 - x0) * (n1 - n0) / 260));
    for (let i = 0; i < count; i++) {
      const x = mix(x0, x1, rand()), n = mix(n0, n1, rand()), z = -n;
      if (!contains(area.p, x, n) || (raceAt(x, z)?.d ?? Infinity) < 22 || (pitAt(x, z)?.d ?? Infinity) < 21 ||
          (banking.bankAt(x, z)?.d ?? Infinity) < 17 || (roadAt(x, z)?.d ?? Infinity) < 7 ||
          buildingsAt(x, n) || (standEdgeAt(x, z)?.d ?? Infinity) < 5) continue;
      const h = mix(8.2, 16.7, rand()), radius = h * mix(0.19, 0.29, rand());
      points.push({ x, z, h, radius });
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.31, 1, 5),
    std('#6b5d49', {}, 0.10), points.length);
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    std('#fff', {}, 0.12), points.length);
  const palette = ['#405e3a', '#496b3d', '#55794a', '#60834b', '#537550'];
  points.forEach(({ x, z, h, radius }, i) => {
    trunks.setMatrixAt(i, matrix.makeScale(1, h * 0.68, 1).setPosition(x, h * 0.34, z));
    canopy.setMatrixAt(i, matrix.makeScale(radius, h * 0.42, radius * 0.97).setPosition(x, h * 0.66, z));
    canopy.setColorAt(i, color.set(palette[Math.floor(rand() * palette.length)]));
  });
  canopy.receiveShadow = true;
  scene.add(trunks, canopy);
}

export function buildScenery(scene, track, map, pit, banking) {
  const { root, roadAt, groundCuts, bridgeBuilding } = roadSurfaces(scene, map, track);
  const raceAt = indexPath(track.pts, true, 155);
  const pitAt = indexPath(pit.pts, false, 26);
  const areas = { grass: [], wood: [] };
  // Use the site base for the clearing east of Curva Alboreto.
  const land = map.land.filter(({ p, kind }) => !(kind === 'grass' && contains(p, 120, -850)) && p.some(([x, n]) =>
    (raceAt(x, -n)?.d ?? Infinity) < 155 || banking.bankAt(x, -n)));
  for (const area of land) areas[area.kind].push(polygon(area.p));
  for (const [kind, color] of [['wood', '#9eaa86'], ['grass', '#a5b287']]) {
    if (!areas[kind].length) continue;
    const cover = clipping.difference(clipping.union(...areas[kind]), groundCuts);
    flat(root, cover, 0.019, groundDetail(std(color, {}, 0.15), 'grass', { size: 4, k: 0.34 }), -5, `monza-${kind}`);
  }
  const verge = groundDetail(std('#a1aa83', {}, 0.19), 'grass', { size: 3, k: 0.38 });
  for (const side of [-1, 1]) {
    const half = i => track.widthAt(i) + (side === 1 ? track.gwL[i] : track.gwR[i]) + 8;
    const offA = side === 1 ? half : i => -track.widthAt(i);
    const offB = side === 1 ? track.widthAt : i => -half(i);
    const edge = new THREE.Mesh(ribbon(track.path, { offA, offB, y: 0.036, uv: 18 }), verge);
    root.add(asGround(edge, -4.3));
  }

  const walls = buildFootprints(scene, map.buildings, () => 0);
  const used = polygonIndex([...map.buildings, ...map.standBodies.map(p => ({ p })), { p: map.garage }]);
  const standEdgeAt = indexPath(map.standBodies.flatMap(p => [...p.map(q => V(...q)), V(...p[0]), null]), false, 6);
  trees(scene, land, raceAt, pitAt, banking, used, standEdgeAt, roadAt);

  const gateRoot = new THREE.Group();
  gateRoot.name = 'monza-gates';
  scene.add(gateRoot);
  const { box, flush } = meshBatch(gateRoot);
  const steel = std('#647471', { metalness: 0.30 }, 0.25);
  for (const [gate, [x, n]] of Object.entries(map.gates)) {
    const board = sign(GATES[gate].name, 5.25, 0.85, '#214c43');
    board.position.set(x, 3.16, -n);
    gateRoot.add(board);
    for (const side of [-1, 1]) box(steel, x + side * 2.55, 1.64, -n, 0.16, 3.34, 0.20);
  }
  flush();
  return { camBuildings: [...walls, bridgeBuilding], groundCuts };
}

export function groundWithPortals(ground, cuts) {
  if (!cuts.length) return;
  const board = polygon([[-7000, -7000], [7000, -7000], [7000, 7000], [-7000, 7000]]);
  ground.geometry.dispose();
  ground.geometry = new THREE.ShapeGeometry(shapes(clipping.difference(board, cuts)));
}
