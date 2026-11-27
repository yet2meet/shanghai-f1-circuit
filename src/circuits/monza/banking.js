import * as THREE from 'three';
import { makePath, std, V } from '../../util.js';
import { indexPath } from '../suzuka/terrain.js';
import { meshBatch } from '../suzuka/meshes.js';

const HALF = 5.5;
const THICKNESS = 0.70;
const gradient = THREE.MathUtils.smoothstep;

export function buildBanking(scene, map, track) {
  const control = map.oval.map(p => V(...p));
  const curve = new THREE.CatmullRomCurve3(control, false, 'centripetal');
  curve.arcLengthDivisions = 8000;
  const path = makePath(curve.getSpacedPoints(1200));
  const raceAt = indexPath(track.pts, true, 24);
  const openings = [34404729, 725687995, 34404638].map(id => {
    const [a, b] = map.crossings[id];
    const start = V(...a), end = V(...b), center = start.clone().lerp(end, 0.5);
    return { start, end, center, half: start.distanceTo(end) / 2 };
  });
  const [raceOpening] = openings;
  const distanceAlong = (p, opening) => {
    const axis = opening.end.clone().sub(opening.start).normalize();
    return Math.abs(p.clone().sub(opening.center).dot(axis));
  };
  const rampAt = p => openings.reduce((lift, opening) => {
    const d = p.distanceTo(opening.center);
    return Math.max(lift, 1 - gradient(d, opening.half + 6, opening.half + 75));
  }, 0);
  // The published peak gradient is 80%. The width, inner-edge elevation,
  // variable radius of the cross section and slab thickness are illustrative.
  const sections = path.pts.map((p, i) => {
    const direction = path.tan[i];
    const turn = gradient(Math.abs(direction.x), 0.14, 0.75);
    const taper = gradient(Math.min(path.dist[i], path.total - path.dist[i]), 5, 80);
    const bank = turn * taper;
    const ramp = rampAt(p), base = 0.11 + Math.max(2.0 * bank, 5.68 * ramp);
    const sharedStraight = Math.min(path.dist[i], path.total - path.dist[i]) < 220
      && (raceAt(p.x, p.z)?.d ?? Infinity) < 10.8;
    return {
      point: (v, dy = 0) => p.clone().addScaledVector(path.nor[i], v - HALF)
        .setY(base + bank * (0.12 * v + 0.34 * v * v / (2 * HALF)) + dy),
      base, bank, visible: !sharedStraight,
    };
  });
  const root = new THREE.Group();
  root.name = 'monza-historic-oval';
  const batch = meshBatch(root);
  const concrete = std('#aaa395', { side: THREE.DoubleSide }, 0.34);
  const underside = std('#898477', { side: THREE.DoubleSide }, 0.25);
  const retaining = std('#8e8574', {}, 0.29);
  const coping = std('#c0b5a0', {}, 0.33);
  const joints = std('#766e60', {}, 0.24);
  const stripGeometry = (a, b, dy, reverse = false) => {
    const position = [], uv = [], index = [];
    sections.forEach((s, i) => {
      for (const v of [a, b]) {
        const p = s.point(v, dy);
        position.push(...p);
        uv.push(path.dist[i] / 10, v / 10);
      }
      if (i && s.visible && sections[i - 1].visible) {
        const k = i * 2;
        if (reverse) index.push(k - 2, k, k - 1, k - 1, k, k + 1);
        else index.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const geometry = new THREE.BufferGeometry().setIndex(index);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return geometry;
  };
  const soffit = new THREE.Group();
  soffit.name = 'monza-oval-soffit';
  for (let v = 0; v < 2 * HALF; v++) {
    batch.add(concrete, stripGeometry(v + 1, v, 0));
    const face = new THREE.Mesh(stripGeometry(v + 1, v, -THICKNESS, true), underside);
    face.receiveShadow = true;
    soffit.add(face);
  }
  root.add(soffit);

  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    if (!a.visible || !b.visible) continue;
    for (const v of [0, HALF * 2]) {
      batch.beam(retaining, a.point(v, -0.30), b.point(v, -0.30), 0.65);
      if (v > 0 && b.base + b.bank > 1) batch.beam(coping, a.point(v, 0.26), b.point(v, 0.26), 0.55);
    }
    if (i % 4 === 0) {
      for (let v = 0; v < 2 * HALF; v += 2.75) {
        batch.beam(joints, b.point(v + 0.09, 0.008), b.point(v + 2.66, 0.008), 0.035);
      }
    }
    const p = path.pts[i];
    const bridge = openings.some(o => p.distanceTo(o.center) < o.half + 15 && distanceAlong(p, o) < o.half + 2.2);
    if (bridge || i % 4 || b.base + b.bank < 1.25) continue;
    for (const v of [0.75, 9.7]) {
      const top = b.point(v, -THICKNESS + 0.08);
      if (top.y < 0.35 || (raceAt(top.x, top.z)?.d ?? Infinity) < 10.5) continue;
      const foot = top.clone().addScaledVector(path.nor[i], v > HALF ? -0.8 : 0.24).setY(0.22);
      batch.box(retaining, foot.x, 0.14, foot.z, 2.25, 0.36, 2.25);
      batch.beam(retaining, foot, top, 1.35);
    }
  }
  batch.flush();
  scene.add(root);

  const bankAt = indexPath(path.pts, false, 20);
  const raceIndex = track.nearest(raceOpening.center.x, raceOpening.center.z);
  const crossing = track.pts[raceIndex], direction = track.tan[raceIndex];
  const target = crossing.clone().setY(2.35);
  const eye = crossing.clone().addScaledVector(direction, -34).setY(2.15);
  const axis = raceOpening.end.clone().sub(raceOpening.start).normalize();
  const lateral = new THREE.Vector3(-axis.z, 0, axis.x);
  const p = [[raceOpening.start, -1], [raceOpening.end, -1], [raceOpening.end, 1], [raceOpening.start, 1]]
    .flatMap(([end, sign]) => {
      const edge = end.clone().addScaledVector(lateral, sign * HALF);
      return [edge.x, -edge.z];
    });
  return { bankAt, target, eye,
    camBuilding: { p, m: 5.09, h: 11.0 } };
}
