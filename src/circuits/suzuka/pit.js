import * as THREE from 'three';
import { asGround } from '../../osm.js';
import { TEAMS } from '../../teams.js';
import { makePath, ribbon, std, V } from '../../util.js';
import { indexPath, sampleLine } from './terrain.js';
import { meshBatch, sign } from './meshes.js';
import { garageInterior } from './garage-interior.js';

const mix = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;
const PAVEMENT_Y = 0.162;
const FAST_HALF = 4; // OSM way 120917578 width=8, excluding the adjoining apron.

export function pitPath(points) {
  return makePath(sampleLine(points, 1.65));
}

export function garageFrame(path, building) {
  const [a, b] = [building.p[0], building.p[3]].map(p => V(...p));
  const forward = b.clone().sub(a).normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const length = a.distanceTo(b), depth = 14.3;
  const closestPit = indexPath(path.pts, false, 55);
  return { a, forward, right, length, depth, closestPit };
}

export function buildPit(scene, path, track, trackAt, frame, building, trackPoints, paddockAccess) {
  const { a, forward, right, length, depth, closestPit } = frame;
  const root = new THREE.Group();
  root.name = 'suzuka-pit';
  const line = std('#f7f6ee', {}, 0.83);
  const concrete = std('#d5d5cd', {}, 0.43);
  const asphalt = scene.getObjectByName('circuit-asphalt').material;
  const apron = path.pts.map((p, i) => {
    const normal = path.nor[i];
    const alignment = normal.dot(right);
    if (Math.abs(alignment) < 0.5) return FAST_HALF;
    const reach = p.clone().sub(a).dot(right) / alignment;
    const front = p.clone().addScaledVector(normal, -reach);
    const along = front.sub(a).dot(forward);
    const taper = smoothstep(Math.min(along, length - along), -14, -0.5);
    return mix(FAST_HALF, Math.max(FAST_HALF, reach + 0.12), taper);
  });
  const lane = new THREE.Mesh(ribbon(path, { offA: FAST_HALF, offB: i => -apron[i], y: PAVEMENT_Y }), asphalt);
  lane.name = 'suzuka-pit-asphalt';
  root.add(asGround(lane, -1.16));

  // Widen the exit-side service-road mouth where it meets the pit pavement.
  const access = makePath(sampleLine(paddockAccess.p.slice(0, 5), 1.1));
  const mouthHalf = i => mix(3.05, paddockAccess.w / 2, smoothstep(access.dist[i], 4, access.total - 1.5));
  const mouth = new THREE.Mesh(ribbon(access, {
    offA: mouthHalf, offB: i => -mouthHalf(i),
    heightAt: (x, z, i) => mix(PAVEMENT_Y + 0.001, 0.056, smoothstep(access.dist[i], 4, access.total - 0.5)),
  }), scene.getObjectByName('suzuka-service').material);
  mouth.name = 'suzuka-paddock-mouth';
  root.add(asGround(mouth, -1.17));
  asphalt.depthWrite = true;
  const merge = i => {
    const p = path.pts[i], race = trackAt(p.x, p.z, p.y);
    return race ? race.d < track.widthAt(race.i) + 3.7 : false;
  };
  const junction = closestPit(access.pts[0].x, access.pts[0].z);
  const junctionDistance = mix(path.dist[junction.i], path.dist[junction.i + 1], junction.t);
  const band = (lo, hi, dashed = false) => {
    root.add(asGround(new THREE.Mesh(ribbon(path, {
      offA: hi, offB: lo, y: 0.207,
      skip: i => (merge(i) && (!dashed || path.dist[i] % 8 > 4.8))
        || (lo < 0 && Math.abs(path.dist[i] - junctionDistance) < 3.4),
    }), line), -0.96));
  };
  band(3.51, 3.71, true);
  band(-3.96, -3.71);
  const clear = path.pts.map((p, i) => {
    const edge = p.clone().addScaledVector(path.nor[i], 4.58), race = trackAt(edge.x, edge.z, p.y);
    return race && race.d > track.widthAt(race.i) + 0.38 && race.d < 19 && !merge(i);
  });
  const walls = meshBatch(root);
  for (let i = 1; i < path.N; i++) {
    if (!clear[i - 1] || !clear[i]) continue;
    for (const y of [0.48, 1.0, 1.34]) {
      const p = path.pts[i - 1].clone().addScaledVector(path.nor[i - 1], 4.56);
      const q = path.pts[i].clone().addScaledVector(path.nor[i], 4.56);
      p.y += y; q.y += y;
      walls.beam(concrete, p, q, y < 0.6 ? 0.94 : y === 1 ? 0.25 : 0.04);
    }
  }
  walls.flush();

  // Two-storey pit frontage and open lower bays within the mapped building.
  const buildingRoot = new THREE.Group();
  buildingRoot.name = 'suzuka-pit-garages';
  buildingRoot.position.copy(a).setY(PAVEMENT_Y);
  const xAxis = forward;
  const yAxis = right.clone().cross(xAxis).normalize();
  buildingRoot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, right));
  root.add(buildingRoot);
  const { box, flush } = meshBatch(buildingRoot);
  const dark = std('#253032', {}, 0.3), steel = std('#9da7a4', { metalness: 0.35 }, 0.34);
  const glass = std('#58727b', { roughness: 0.28, metalness: 0.28 }, 0.23);
  const floor = std('#898e8b', {}, 0.48);
  const facade = 5.1;
  box(floor, length / 2, -0.1, depth / 2, length, 0.2, depth);
  box(concrete, length / 2, 2.4, depth, length, 5.4, 0.45);
  box(concrete, length / 2, facade - 0.25, depth / 2 - 1, length, 0.55, depth + 3.8);
  box(dark, length / 2, 7.25, depth / 2, length, 4.1, depth);
  box(glass, length / 2, 7.45, -0.12, length - 0.3, 2.8, 0.19);
  box(concrete, length / 2, 9.61, depth / 2 - 0.65, length + 2.2, 0.48, depth + 3.6);
  box(concrete, length / 2, 5.45, -2.15, length + 0.8, 0.38, 0.2);
  for (const x of [0, length]) box(concrete, x, 2.4, depth / 2, 0.52, 4.8, depth);
  const bayWidth = length / 48;
  // Official FIA numbered positions express team order along the working lane.
  // The venue separately specifies 48 permanent bays.
  const teamFirst = [5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45];
  const bays = Array.from({ length: 48 }, (_, i) => {
    const position = Math.floor((48 - i - 0.5) * 55 / 48) + 1;
    return position > 48 ? undefined : TEAMS[teamFirst.findLastIndex(slot => slot <= position)];
  });
  const teamMats = Object.fromEntries(TEAMS.map(team => [team.id, std(team.color, {}, 0.62)]));
  for (const [i, team] of bays.entries()) {
    const x = (i + 0.5) * bayWidth;
    box(steel, i * bayWidth, 2.5, 0.05, 0.27, 5, 0.38);
    box(steel, i * bayWidth, 7.47, -0.24, 0.095, 2.9, 0.17);
    box(team ? teamMats[team.id] : dark, x, 4.07, -0.11, bayWidth - 0.35, 0.55, 0.25);
    if (!team) {
      box(steel, x, 1.91, 0.07, bayWidth - 0.29, 3.83, 0.18);
      for (let y = 0.20; y < 3.80; y += 0.19) box(dark, x, y, -0.024, bayWidth - 0.31, 0.021, 0.02);
    }
  }
  for (const team of TEAMS) {
    const first = bays.indexOf(team), last = bays.lastIndexOf(team);
    if (first < 0) continue;
    const x = (Math.floor((first + last) / 2) + 0.5) * bayWidth;
    const label = sign(team.name.toUpperCase(), bayWidth - 0.65, 0.58, '#253032');
    label.position.set(x, 4.07, -0.245);
    label.rotation.y = Math.PI;
    buildingRoot.add(label);
    const at = a.clone().addScaledVector(forward, x), pit = closestPit(at.x, at.z);
    if (!pit || pit.d < 6.8) continue;
    const stop = Math.min(4.3, pit.d - 5.4);
    const workMark = (across, offset, width, reach) => {
      const point = buildingRoot.localToWorld(new THREE.Vector3(across, 0, offset));
      const lane = closestPit(point.x, point.z);
      if (lane) box(line, across, lane.height + 0.198 - point.y, offset, width, 0.016, reach);
    };
    for (const side of [-1, 1]) {
      workMark(x + side * 3, -stop, 0.12, 2.4);
      workMark(x + side * 2.55, -stop - 1.14, 0.94, 0.12);
    }
    const k = pit.i, point = path.pts[k].clone().addScaledVector(path.nor[k], 5.37);
    const race = trackAt(point.x, point.z, point.y);
    if (!race || race.d < track.widthAt(race.i) + 1.05) continue;
    const pod = new THREE.Group();
    pod.position.copy(point);
    pod.rotation.y = Math.atan2(path.tan[k].x, path.tan[k].z);
    const booth = meshBatch(pod);
    booth.box(dark, 0, 0.36, 0, 1.32, 0.72, 6.0);
    booth.box(glass, 0.34, 1.42, 0, 0.12, 1.12, 5.9);
    booth.box(teamMats[team.id], 0, 2.20, 0, 1.58, 0.15, 6.2);
    for (const side of [-1, 1]) booth.box(steel, -0.5, 1.42, side * 2.91, 0.11, 1.42, 0.12);
    booth.flush();
    root.add(pod);
  }
  flush();
  const { room, cameraBay } = garageInterior(buildingRoot, bays, bayWidth, depth, trackPoints);
  scene.add(root);
  const gallery = cameraBay ?? length / 2;
  const target = buildingRoot.localToWorld(new THREE.Vector3(gallery, 1.51, 3.7));
  const view = buildingRoot.localToWorld(new THREE.Vector3(gallery + 2.4, 2.67, -8.2)).sub(target).toArray();
  const center = buildingRoot.position.clone().addScaledVector(xAxis, length * 0.5);
  return {
    target,
    view,
    camBuilding: { p: building.p.flat(), h: PAVEMENT_Y + 10.2, m: 0 },
    update(camera) {
      room.visible = camera.position.distanceToSquared(center) < 375 ** 2;
    },
  };
}
