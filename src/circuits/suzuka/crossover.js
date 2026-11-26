import * as THREE from 'three';
import { makePath, ribbon, std, V, wall } from '../../util.js';
import { meshBatch } from './meshes.js';

const DECK_Y = 5.55;

export function crossover(upper, lower) {
  const [a, b] = upper.map(p => V(...p)), [c, d] = lower.map(p => V(...p));
  const u = b.clone().sub(a), l = d.clone().sub(c);
  const cross = (p, q) => p.x * q.z - p.z * q.x;
  const center = a.clone().addScaledVector(u, cross(c.clone().sub(a), l) / cross(u, l));
  const width = u.length();
  const along = u.normalize(), below = l.normalize();
  const inSpan = (p, pad = 0) => {
    const f = p.clone().sub(a).dot(along);
    return f >= -pad && f <= width + pad;
  };
  return { a, b, center, along, below, inSpan };
}

export function setCrossoverHeights(points, { center, a, b, along }, sourceHeight) {
  // The original 3D coordinates distinguish the upper road from the one underneath.
  const reference = center.clone().setY(sourceHeight);
  let anchor = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceToSquared(reference) < points[anchor].distanceToSquared(reference)) anchor = i;
  }
  const deck = points[anchor];
  const heights = new Float32Array(points.length);
  const approach = 86;
  for (const direction of [-1, 1]) {
    const adjacent = points[(anchor + direction + points.length) % points.length];
    const ahead = adjacent.clone().sub(deck).dot(along) > 0;
    const limit = Math.abs((ahead ? b : a).clone().sub(deck).dot(along));
    for (let i = anchor, distance = 0; distance < limit + approach;) {
      heights[i] = DECK_Y * (1 - THREE.MathUtils.smoothstep(distance, limit, limit + approach));
      const next = (i + direction + points.length) % points.length;
      distance += Math.hypot(points[next].x - points[i].x, points[next].z - points[i].z);
      i = next;
    }
  }
  points.forEach((point, i) => { point.y = heights[i]; });
}

export function buildCrossover(scene, track, trackAt, bridge) {
  const root = new THREE.Group();
  root.name = 'suzuka-crossover';
  const concrete = std('#a5a9a3', { side: THREE.DoubleSide }, 0.32);
  const rail = std('#c2c6c1', { metalness: 0.38 }, 0.42);
  const { a, b, along, below, center } = bridge;
  const chooseDeck = p => trackAt(p.x, p.z, DECK_Y);
  const deckPoints = [a, ...track.pts.filter(p => p.y > DECK_Y / 2 && bridge.inSpan(p) && Math.abs(p.clone().sub(center).dot(new THREE.Vector3(-along.z, 0, along.x))) < 3), b];
  deckPoints.sort((p, q) => p.dot(along) - q.dot(along));
  const path = makePath(deckPoints.map(p => p.clone().setY(chooseDeck(p).height)));
  const half = i => track.widthAt(chooseDeck(path.pts[i]).i) + 0.62;
  const width = Math.max(...path.pts.map((_, i) => half(i)));
  const soffit = -0.76;
  const bottom = new THREE.Mesh(ribbon(path, { offA: half, offB: i => -half(i), y: soffit }), concrete);
  bottom.receiveShadow = true;
  root.add(bottom);
  const batch = meshBatch(root);
  // Clip both approaches against the abutments to meet the deck without leaving a slit.
  const ramp = [], faces = [];
  const span = b.clone().sub(a).dot(along);
  const at = p => p.clone().sub(a).dot(along);
  const station = i => ({ p: track.pts[i], n: track.nor[i], w: track.widthAt(i) });
  const clip = (first, last, boundary) => {
    const t = (boundary - at(first.p)) / (at(last.p) - at(first.p));
    return { p: first.p.clone().lerp(last.p, t), n: first.n.clone().lerp(last.n, t).normalize(),
      w: THREE.MathUtils.lerp(first.w, last.w, t) };
  };
  for (let i = 1; i < track.N; i++) {
    let first = station(i - 1), last = station(i);
    if (first.p.y <= 0.02 && last.p.y <= 0.02) continue;
    const near = Math.min(at(first.p), at(last.p)), far = Math.max(at(first.p), at(last.p));
    if (near >= 0 && far <= span) continue;
    if (near < 0 && far > 0) {
      if (at(first.p) > 0) first = clip(first, last, 0);
      else last = clip(first, last, 0);
    } else if (near < span && far > span) {
      if (at(first.p) < span) first = clip(first, last, span);
      else last = clip(first, last, span);
    }
    for (const side of [-1, 1]) {
      const edge = ({ p, n, w }) => p.clone().addScaledVector(n, (w - 0.02) * side);
      const p = edge(first), q = edge(last), k = ramp.length / 3;
      ramp.push(p.x, 0, p.z, p.x, p.y + 0.16, p.z, q.x, 0, q.z, q.x, q.y + 0.16, q.z);
      faces.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      const guard = ({ p, n, w }) => p.clone().addScaledVector(n, (w - 0.36) * side).add(new THREE.Vector3(0, 1.36, 0));
      const top = guard(last);
      batch.beam(rail, guard(first), top, 0.09);
      if (i % 2 === 0) batch.beam(rail, top.clone().setY(q.y + 0.16), top, 0.065);
    }
  }
  const rampGeometry = new THREE.BufferGeometry().setIndex(faces);
  rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ramp, 3));
  rampGeometry.computeVertexNormals();
  const rampMesh = new THREE.Mesh(rampGeometry, concrete);
  rampMesh.receiveShadow = true;
  root.add(rampMesh);
  for (const side of [-1, 1]) {
    const off = i => side * half(i);
    root.add(new THREE.Mesh(wall(path, { off, y: soffit, h: 1.46 }), concrete));
    root.add(new THREE.Mesh(ribbon(path, {
      offA: i => off(i) + (side < 0 ? 0.52 : 0), offB: i => off(i) - (side > 0 ? 0.52 : 0), y: 0.7,
    }), concrete));
    for (let i = 0; i < path.N; i++) {
      const point = path.pts[i].clone().addScaledVector(path.nor[i], off(i) - side * 0.28);
      const top = point.clone().setY(point.y + 1.36);
      batch.beam(rail, point.clone().setY(point.y + 0.61), top, 0.06);
      if (i) {
        const last = path.pts[i - 1].clone().addScaledVector(path.nor[i - 1], off(i - 1) - side * 0.28);
        batch.beam(rail, last.setY(last.y + 1.36), top, 0.09);
      }
    }
  }
  // Solid seats at both ends of the span. The clear opening aligns with
  // Degner–110R below; no support enters the lower roadway.
  for (const p of [path.pts[0], path.pts.at(-1)]) {
    const heel = p.clone().addScaledVector(along, p === path.pts[0] ? -0.4 : 0.4);
    const low = -0.08;
    const seatTop = p.y + soffit + 0.10;
    const geometry = new THREE.BoxGeometry(1.10, seatTop - low, width * 2)
      .rotateY(Math.atan2(-along.z, along.x)).translate(heel.x, (seatTop + low) / 2, heel.z);
    batch.add(concrete, geometry);
  }
  batch.flush();
  scene.add(root);
  const top = chooseDeck(center).height;
  const normal = new THREE.Vector3(along.z, 0, -along.x);
  const polygon = [[a, 1], [b, 1], [b, -1], [a, -1]].flatMap(([p, sign]) => [
    p.x + normal.x * width * sign, -(p.z + normal.z * width * sign),
  ]);
  const camBuilding = { p: polygon, m: Math.min(...path.pts.map(v => v.y)) + soffit,
    h: Math.max(...path.pts.map(v => v.y)) + 0.7 };
  return { below, center, top, camBuilding };
}
