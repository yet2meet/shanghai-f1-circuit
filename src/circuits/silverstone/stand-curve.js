import * as THREE from 'three';
import { V } from '../../util.js';

// 两条边各取连续的测绘点。Landostand A 后缘保留四个退台区段。
const outlines = {
  'Landostand A': [[10, 11, 12, 13, 0], [8, 7, 5, 3, 1]],
  'Club Corner': [[6, 7, 8, 9, 10, 11], [5, 4, 3, 2, 1, 0]],
  'Woodcote A': [[3, 2, 1], [4, 5, 0]],
  'Luffield': [[1, 2, 3, 4, 5], [0, 8, 7, 6]],
  'International Paddock': [[0, 6, 5], [1, 2, 3, 4]],
};
const steppedRear = {
  'Landostand A': [[8, 7], [6, 5], [4, 3], [2, 1]],
};

const cross = (a, b) => a.x * b.z - a.z * b.x;
const mix = THREE.MathUtils.lerp;

function smoothEdge(points, regular) {
  const source = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const count = Math.max(2, Math.ceil(source.getLength() / 0.85));
  let samples = source.getSpacedPoints(count);
  for (let pass = 0; pass < (regular ? 34 : 18); pass++) {
    samples = samples.map((p, i, line) => i === 0 || i === count ? p
      : p.clone().multiplyScalar(0.5).addScaledVector(line[i - 1], 0.25).addScaledVector(line[i + 1], 0.25));
  }
  const intervals = Math.max(2, Math.ceil(count / 8));
  const controls = regular ? Array.from({ length: intervals + 1 },
    (_, i) => samples[Math.round(i * count / intervals)]) : samples;
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal');
  curve.arcLengthDivisions = count * 5;
  return { curve, count };
}

/** 和上海的弧形看台一样，以前沿弧长定位每道剖面，向后排取局部法线。 */
export function curvedStandPlan(spec) {
  const outline = spec.curveOutline ?? outlines[spec.turnsEn];
  if (!outline) return;
  const [front, back] = outline.map(edge => edge.map(i => V(...spec.polygon[i])));
  const { curve: centerline, count } = smoothEdge(front, spec.regularSweep);
  const L = centerline.getLength();
  const end = centerline.getTangentAt(0.5);
  const inward = new THREE.Vector3(-end.z, 0, end.x);
  const towardsBack = back[Math.floor(back.length / 2)].clone().sub(centerline.getPointAt(0.5));
  const side = inward.dot(towardsBack) >= 0 ? 1 : -1;
  const step = L / Math.ceil(L / 0.72);
  const stations = (a, b) => {
    const cuts = [a];
    for (let i = Math.floor(a / step) + 1; i * step < b - 1e-6; i++) cuts.push(i * step);
    cuts.push(b);
    return cuts;
  };
  const outwardAt = u => {
    const t = centerline.getTangentAt(u / L);
    return new THREE.Vector3(-side * t.z, 0, side * t.x);
  };
  if (spec.regularSweep) {
    const { curve: rear } = smoothEdge(back, true);
    const widths = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      return rear.getPointAt(t).sub(centerline.getPointAt(t)).dot(outwardAt(t * L));
    }).sort((a, b) => a - b);
    const D = spec.depth ?? widths[10];
    return {
      L, D, side, stations, outwardAt, depthAt: () => D,
      at: (u, v, y = 0) => centerline.getPointAt(u / L).addScaledVector(outwardAt(u), v).setY(y),
    };
  }
  const rearBays = steppedRear[spec.turnsEn];
  if (rearBays) {
    const samples = Math.max(2, count * 4);
    const project = point => {
      let bestU = 0, bestDist = Infinity;
      for (let i = 0; i <= samples; i++) {
        const u = L * i / samples;
        const d = centerline.getPointAt(u / L).distanceToSquared(point);
        if (d < bestDist) { bestDist = d; bestU = u; }
      }
      const span = L / samples;
      let lo = Math.max(0, bestU - span), hi = Math.min(L, bestU + span);
      for (let iter = 0; iter < 12; iter++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (centerline.getPointAt(m1 / L).distanceToSquared(point) < centerline.getPointAt(m2 / L).distanceToSquared(point)) hi = m2;
        else lo = m1;
      }
      const u = (lo + hi) / 2;
      const v = point.clone().sub(centerline.getPointAt(u / L)).dot(outwardAt(u));
      return { u, v };
    };
    const raw = rearBays.map(([aIdx, bIdx]) => {
      const a = project(V(...spec.polygon[aIdx])), b = project(V(...spec.polygon[bIdx]));
      return { uStart: Math.min(a.u, b.u), uEnd: Math.max(a.u, b.u), depth: (a.v + b.v) / 2 };
    }).sort((a, b) => a.uStart - b.uStart);
    const bays = raw.map((bay, i) => ({
      from: i === 0 ? 0 : (raw[i - 1].uEnd + bay.uStart) / 2,
      to: i === raw.length - 1 ? L : (bay.uEnd + raw[i + 1].uStart) / 2,
      depth: bay.depth,
    }));
    const D = Math.max(...bays.map(b => b.depth));
    const depthAt = u => (bays.find(b => u <= b.to + 1e-6) ?? bays.at(-1)).depth;
    const at = (u, v, y = 0) => centerline.getPointAt(u / L).addScaledVector(outwardAt(u), v).setY(y);
    return { L, D, side, at, stations, outwardAt, depthAt, constantDepth: true, bays };
  }
  const rearAngles = back.slice(0, -1).map((p, i) => back[i + 1].clone().sub(p));
  let depths = Array.from({ length: count + 1 }, (_, i) => {
    const p = centerline.getPointAt(i / count), normal = outwardAt(L * i / count);
    let distance = Infinity;
    for (let j = 0; j < rearAngles.length; j++) {
      const delta = back[j].clone().sub(p), along = rearAngles[j];
      const angle = cross(normal, along);
      if (Math.abs(angle) < 1e-6) continue;
      const s = cross(delta, normal) / angle;
      const d = cross(delta, along) / angle;
      if (d >= 2 && s >= (j === 0 ? -0.4 : 0) && s <= (j === rearAngles.length - 1 ? 1.4 : 1)) distance = Math.min(distance, d);
    }
    return distance;
  });
  const widths = depths.filter(Number.isFinite).sort((a, b) => a - b);
  if (!widths.length) return;
  const D = widths[Math.floor(widths.length / 2)];
  depths = depths.map((depth, i) => {
    if (Number.isFinite(depth)) return depth;
    const last = depths.findLastIndex((d, j) => j < i && Number.isFinite(d));
    const next = depths.findIndex((d, j) => j > i && Number.isFinite(d));
    return last < 0 ? depths[next] : next < 0 ? depths[last] : mix(depths[last], depths[next], (i - last) / (next - last));
  });
  for (let pass = 0; pass < 16; pass++) {
    depths = depths.map((depth, i, line) => 0.5 * depth + 0.25 * (line[Math.max(0, i - 1)] + line[Math.min(count, i + 1)]));
  }
  const depthAt = u => {
    const fraction = (u / L) * count;
    const i = Math.min(count - 1, Math.floor(fraction));
    const t = fraction - i, a = depths[i], b = depths[i + 1];
    const da = i === 0 ? b - a : (b - depths[i - 1]) * 0.5;
    const db = i + 1 === count ? b - a : (depths[i + 2] - a) * 0.5;
    return mix(a, b, t * t * (3 - 2 * t)) + t * (1 - t) * ((1 - t) * da - t * db);
  };
  const at = (u, v, y = 0) => {
    return centerline.getPointAt(u / L).addScaledVector(outwardAt(u), v * depthAt(u) / D).setY(y);
  };
  return { L, D, side, at, stations, outwardAt, depthAt };
}

/** 踏面、踢面分别取法线，沿弧方向连续，横断面保持清晰的直角。 */
export function sweepStandSlab(plan, from, to, lo, hi, height, base) {
  const cuts = plan.stations(from, to);
  const yAt = typeof base === 'function' ? base : () => base;
  const bottom = v => yAt(v), top = v => yAt(v) + height;
  const profile = [[lo, bottom(lo)], [lo, top(lo)], [hi, top(hi)], [hi, bottom(hi)]];
  const pos = [], indices = [], uv = [];
  const vertex = (u, v, y) => {
    const p = plan.at(u, v, y);
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
  };
  const face = (a, b, c, d, flip) => {
    if (flip) indices.push(a, c, b, b, c, d);
    else indices.push(a, b, c, b, d, c);
  };
  for (let e = 0; e < 4; e++) {
    const a = profile[e], b = profile[(e + 1) % 4];
    const start = pos.length / 3;
    cuts.forEach((u, i) => {
      vertex(u, ...a);
      vertex(u, ...b);
      const p = start + 2 * i;
      if (i) face(p - 2, p - 1, p, p + 1, plan.side < 0);
    });
  }
  for (const [u, last] of [[from, false], [to, true]]) {
    const p = pos.length / 3;
    for (const point of profile) vertex(u, ...point);
    face(p, p + 1, p + 3, p + 2, last !== (plan.side > 0));
  }
  const geo = new THREE.BufferGeometry().setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}
