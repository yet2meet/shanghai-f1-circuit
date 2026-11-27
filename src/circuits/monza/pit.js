import * as THREE from 'three';
import { asGround } from '../../osm.js';
import { TEAMS } from '../../teams.js';
import { makePath, ribbon, std, V } from '../../util.js';
import { garageInterior } from '../suzuka/garage-interior.js';
import { footprint, meshBatch, sign } from '../suzuka/meshes.js';
import { indexPath, sampleLine } from '../suzuka/terrain.js';

const SURFACE = 0.163;
const FAST = 3.30;
const blend = THREE.MathUtils.smoothstep;
const pitBoxes = [
  [8, 12], [13, 17], [18, 22], [23, 27], [29, 33], [34, 38],
  [39, 42], [43, 46], [47, 51], [52, 55], [56, 59],
];

export function buildPit(scene, track, map, path) {
  const root = new THREE.Group();
  root.name = 'monza-pit';
  const garages = new THREE.Group();
  garages.name = 'monza-pit-garages';
  const [a, b, c, d] = map.garage.map(p => V(...p));
  const along = d.clone().sub(a).normalize(), inward = new THREE.Vector3(-along.z, 0, along.x);
  const length = a.distanceTo(d), depth = a.distanceTo(b);
  garages.position.copy(a).setY(SURFACE);
  garages.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), inward));
  root.add(garages);
  root.updateMatrixWorld(true);

  const raceAt = indexPath(track.pts, true, 28);
  const laneAt = indexPath(path.pts, false, 48);
  const asphalt = scene.getObjectByName('circuit-asphalt').material;
  const concrete = std('#c8c4bb', {}, 0.38);
  const line = std('#f3f1e8', {}, 0.66);
  const glass = std('#5c8995', { roughness: 0.27, metalness: 0.32 }, 0.24);
  const dark = std('#30363a', {}, 0.29);
  const fascia = std('#dddcd4', {}, 0.30);
  const rails = std('#809194', { metalness: 0.31 }, 0.28);
  const maroon = std('#883645', {}, 0.44);
  const batch = meshBatch(root);
  const position = (i, off, y) => path.pts[i].clone().addScaledVector(path.nor[i], off).setY(y);
  const apron = path.pts.map((p, i) => {
    const alignment = -path.nor[i].dot(inward);
    const reach = p.clone().sub(a).dot(inward) / Math.max(alignment, 0.5);
    const mouth = p.clone().addScaledVector(path.nor[i], reach);
    const u = mouth.sub(a).dot(along);
    const taper = blend(Math.min(u, length - u), -22, 1);
    return THREE.MathUtils.lerp(FAST, Math.max(FAST, -reach + 0.13), taper);
  });
  const lanes = new THREE.Mesh(ribbon(path, { offA: FAST, offB: i => -apron[i], y: SURFACE, uv: 16 }), asphalt);
  lanes.name = 'monza-pit-pavement';
  root.add(asGround(lanes, -1.18));
  asphalt.depthWrite = true;
  const joins = (i, off, tolerance = 0.65) => {
    const p = position(i, off, 0);
    const hit = raceAt(p.x, p.z);
    return Boolean(hit && hit.d < track.widthAt(hit.i) + tolerance);
  };
  const paint = (lo, hi, mat, skip) => {
    const item = new THREE.Mesh(ribbon(path, {
      offA: hi, offB: lo, y: SURFACE + 0.043, skip,
    }), mat);
    root.add(asGround(item, -0.97));
  };
  paint(FAST - 0.22, FAST - 0.06, line, i => joins(i, FAST) && path.dist[i] % 9 > 5);
  paint(-FAST + 0.15, -FAST + 0.30, line, i => joins(i, -FAST) || apron[i] < FAST + 0.7);
  paint(-FAST - 1.8, -FAST - 0.14, maroon, i => apron[i] < FAST + 2.15);
  for (let i = 1; i < path.N; i++) {
    if (joins(i, FAST + 0.8, 1.5) || joins(i - 1, FAST + 0.8, 1.5)) continue;
    const p = position(i, FAST + 0.55, 0.63), q = position(i - 1, FAST + 0.55, 0.63);
    batch.beam(concrete, p, q, 0.86);
    batch.beam(rails, p.clone().setY(1.57), q.clone().setY(1.57), 0.09);
    if (i % 3 === 0) batch.beam(rails, p.clone().setY(1.01), p.clone().setY(1.62), 0.07);
  }

  const body = meshBatch(garages);
  body.box(concrete, length / 2, -0.115, depth / 2, length, 0.23, depth + 0.01);
  body.box(fascia, length / 2, 2.35, depth - 0.2, length, 4.70, 0.45);
  for (const x of [0, length]) body.box(fascia, x, 2.33, depth / 2, 0.40, 4.66, depth);
  body.box(concrete, length / 2, 4.85, depth / 2 - 0.55, length + 0.40, 0.55, depth + 2.90);
  body.box(dark, length / 2, 7.56, depth / 2 + 0.29, length - 0.3, 4.92, depth - 0.59);
  body.box(glass, length / 2, 7.75, -0.02, length - 0.38, 3.48, 0.65);
  body.box(fascia, length / 2, 10.36, depth / 2 - 0.58, length + 1.2, 0.40, depth + 2.2);
  body.box(rails, length / 2, 6.18, -2.05, length, 0.11, 0.14);
  body.box(glass, length / 2, 5.66, -2.03, length, 0.99, 0.09);

  // FIA pit diagram numbered positions, south (entry) to north (exit).
  const bayWidth = length / 60;
  const bays = Array.from({ length: 60 }, (_, i) => {
    const team = pitBoxes.findIndex(([from, to]) => i + 1 >= from && i + 1 <= to);
    return TEAMS[team];
  });
  const colors = new Map(TEAMS.map(team => [team, std(team.color, {}, 0.58)]));
  const teamLabels = {
    redbull: 'RED BULL', astonmartin: 'ASTON MARTIN', racingbulls: 'RACING BULLS',
  };
  for (const [i, team] of bays.entries()) {
    const x = (i + 0.5) * bayWidth;
    body.box(rails, i * bayWidth, 2.27, 0.02, 0.24, 4.54, 0.34);
    body.box(rails, i * bayWidth, 7.75, -0.38, 0.09, 3.49, 0.13);
    body.box(team ? colors.get(team) : dark, x, 4.29, -0.16, bayWidth - 0.28, 0.30, 0.13);
    if (!team) body.box(rails, x, 2.01, 0.02, bayWidth - 0.27, 4.02, 0.15);
    body.box(concrete, x, -0.045, -0.23, bayWidth - 0.24, 0.09, 0.50);
  }

  for (const team of TEAMS) {
    const first = bays.indexOf(team), last = bays.lastIndexOf(team);
    const x = (first + last + 1) * bayWidth / 2;
    const logo = sign(teamLabels[team.id] ?? team.name.toUpperCase(), bayWidth - 0.37, 0.52, '#2a3032');
    logo.position.set(x, 4.24, -0.245);
    logo.rotation.y = Math.PI;
    garages.add(logo);
    const front = garages.localToWorld(new THREE.Vector3(x, 0, 0));
    const lane = laneAt(front.x, front.z);
    if (!lane || lane.d < FAST + 2.6) continue;
    const reach = Math.min(5.2, lane.d - FAST - 1.6);
    body.box(line, x, 0.039, -reach - 0.94, 4.4, 0.015, 0.12);
    for (const side of [-1, 1]) body.box(line, x + side * 2.18, 0.039, -reach, 0.12, 0.015, 1.9);
    const p = position(lane.i, FAST + 1.11, SURFACE);
    if (!joins(lane.i, FAST + 1.1, 3)) {
      const booth = new THREE.Group();
      booth.position.copy(p);
      booth.rotation.y = Math.atan2(path.tan[lane.i].x, path.tan[lane.i].z);
      const b = meshBatch(booth);
      b.box(dark, 0, 0.37, 0, 1.06, 0.72, 5.8);
      b.box(glass, 0, 1.36, 0, 0.96, 1.17, 5.65);
      b.box(colors.get(team), 0, 2.02, 0, 1.23, 0.16, 6.0);
      b.flush();
      root.add(booth);
    }
  }
  body.flush();
  const interiorDepth = Math.min(depth - 0.4, 16.4);
  const { room } = garageInterior(garages, bays, bayWidth, interiorDepth, map.track, { name: 'MONZA', km: '5.793 km' });
  const podium = footprint(map.podium, 5.2, 0.62);
  batch.add(fascia, podium);
  const podiumCenter = map.podium.reduce((p, q) => p.addScaledVector(V(...q), 1 / map.podium.length), new THREE.Vector3());
  const anchor = podiumCenter.clone().addScaledVector(inward, 9.4);
  batch.box(concrete, anchor.x, 2.62, anchor.z, 3.6, 5.24, 7);
  batch.box(glass, podiumCenter.x, 6.22, podiumCenter.z, 5.0, 0.62, 5.2);
  batch.flush();
  scene.add(root);

  const garageCenter = a.clone().lerp(c, 0.5);
  return {
    camBuildings: [
      { p: map.garage.flat(), h: 10.7, m: 0 },
      { p: map.podium.flat(), h: 6.62, m: 5.2 },
    ],
    update(camera) { room.visible = camera.position.distanceToSquared(garageCenter) < 390 ** 2; },
  };
}

export function pitPath(map) {
  return makePath(sampleLine(map.pit, 1.7));
}
