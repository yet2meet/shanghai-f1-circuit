// 按 OSM 多边形裁切看台阶梯与座位，座位、过道和高度为示意。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROW_D, PITCH, seatGeometry, seatMatrix, seatColor } from '../../seatkit.js';
import { VOM_W, vomRows, addVomitory, buildVomitoryMeshes } from '../../stand-entrance.js';
import { std, floodlit } from '../../util.js';
import { curvedStandPlan, sweepStandSlab } from './stand-curve.js';

function clip(poly, axis, value, keepAbove) {
  const out = [];
  const inside = (p) => keepAbove ? p[axis] >= value - 1e-7 : p[axis] <= value + 1e-7;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
function rectangle(poly, u0, u1, v0, v1) {
  return [[0, u0, true], [0, u1, false], [1, v0, true], [1, v1, false]]
    .reduce((p, [axis, value, above]) => p.length ? clip(p, axis, value, above) : p, poly);
}
function spans(poly, v) {
  const cuts = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] > v) === (b[1] > v)) continue;
    cuts.push(a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]));
  }
  cuts.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < cuts.length; i += 2) out.push([cuts[i], cuts[i + 1]]);
  return out;
}

export function buildSilverstoneStands(scene, track, specs) {
  const stands = [], hitboxes = [];
  const seatGeo = mergeGeometries([seatGeometry(),
    new THREE.BoxGeometry(0.06, 0.41, 0.18).translate(-0.135, 0.205, 0.07),
    new THREE.BoxGeometry(0.06, 0.41, 0.18).translate(0.135, 0.205, 0.07),
  ]);
  const benchGeo = specs.some(spec => spec.bench)
    ? new THREE.BoxGeometry(PITCH - 0.015, 0.10, 0.33).translate(0, 0.25, 0) : null;
  const seatMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.55 }), 0.58);
  const deckMat = std('#a6adb2', { roughness: 0.9 }, 0.28);
  const stairMat = std('#91a5b4', { roughness: 0.95 }, 0.24);
  const portalMat = std('#c9ced5', { roughness: 0.5, metalness: 0.25 }, 0.18);
  const portalDark = new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.95, side: THREE.DoubleSide });
  const edgeMat = std('#e6c34c', { roughness: 0.77 }, 0.46);
  const steel = std('#7a858e', { metalness: 0.48, roughness: 0.56 }, 0.24);
  const railMaterial = std('#b8c0c5', { metalness: 0.4, roughness: 0.55 }, 0.25);
  const roofMaterial = std('#d6dadd', { roughness: 0.55, metalness: 0.30 }, 0.15);
  for (const spec of specs) {
    const baseY = spec.baseY ?? 0;
    const grade = spec.baseGrade;
    const offset = (x, z) => grade ? (x - grade.x) * grade.dx + (z - grade.z) * grade.dz : 0;
    const curve = spec.curvePlan ?? curvedStandPlan(spec);
    const world = spec.polygon.map(([x, n]) => new THREE.Vector3(x, 0, -n));
    const origin = world.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / world.length);
    let axis = new THREE.Vector3(1, 0, 0), longest = 0;
    world.forEach((p, i) => { const d = world[(i + 1) % world.length].clone().sub(p); if (d.lengthSq() > longest) { longest = d.lengthSq(); axis = d.normalize(); } });
    let outward = new THREE.Vector3(-axis.z, 0, axis.x);
    const nearest = spec.viewAt
      ? new THREE.Vector3(spec.viewAt[0], 0, -spec.viewAt[1])
      : track.pts[track.nearest(origin.x, origin.z)];
    if (outward.dot(origin.clone().sub(nearest)) < 0) { axis.negate(); outward.negate(); }
    let poly, u0, u1, v0, v1, L, D, rows, rowDepth, bays = null;
    if (curve?.bays) {
      rows = Math.max(1, Math.floor(curve.D / ROW_D));
      rowDepth = curve.D / rows;
      bays = curve.bays.map(b => {
        const bayRows = Math.min(rows, Math.max(1, Math.round(b.depth / rowDepth)));
        return { from: b.from, to: b.to, rows: bayRows, depth: bayRows * rowDepth };
      });
      poly = [[0, 0], [curve.L, 0]];
      for (let i = bays.length - 1; i >= 0; i--) {
        poly.push([bays[i].to, bays[i].depth], [bays[i].from, bays[i].depth]);
      }
      u0 = 0; u1 = curve.L; v0 = 0; v1 = Math.max(...bays.map(b => b.depth));
      L = u1 - u0; D = v1 - v0; rowDepth = D / rows;
    } else {
      poly = curve ? [[0, 0], [curve.L, 0], [curve.L, curve.D], [0, curve.D]]
        : world.map(p => { const d = p.clone().sub(origin); return [d.dot(axis), d.dot(outward)]; });
      u0 = Math.min(...poly.map(p => p[0])); u1 = Math.max(...poly.map(p => p[0]));
      v0 = Math.min(...poly.map(p => p[1])); v1 = Math.max(...poly.map(p => p[1]));
      L = u1 - u0; D = v1 - v0; rows = Math.max(1, Math.floor(D / ROW_D));
      rowDepth = D / rows;
    }
    const rise = 0.33, H = 0.3 + rows * rise;
    const bayAt = u => bays.find(b => u <= b.to + 1e-6) ?? bays.at(-1);
    const centers = [];
    for (let u = u0 + 16; u < u1 - 5; u += 16) centers.push(u);
    const entryRows = vomRows(rows);
    const entryStart = entryRows.values().next().value ?? 0;
    const aisleWidth = 2 * PITCH;
    const segmentsAt = widened => {
      const segments = [];
      let cursor = u0;
      for (const u of centers) {
        const half = (widened?.get(u) ?? aisleWidth) / 2;
        segments.push([cursor, u - half, false], [u - half, u + half, true]);
        cursor = u + half;
      }
      segments.push([cursor, u1, false]);
      return segments;
    };
    const segments = segmentsAt();
    const batches = new Map();
    const seats = [], base = [], rot = [], rowSpans = [];
    const add = (material, geometry) => {
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(geometry.index ? geometry.toNonIndexed() : geometry);
    };
    const outAt = curve ? curve.outwardAt : () => outward;
    const toWorld = curve ? curve.at : (u, v, y = 0) => origin.clone().addScaledVector(axis, u).addScaledVector(outward, v).setY(y);
    const flipSubsections = spec.westboundSubsections && toWorld(u1, 0).x > toWorld(u0, 0).x;
    const subsectionU = t => u0 + L * (flipSubsections ? 1 - t : t);
    const subsections = spec.subsectionBounds?.map(({ name, along, depth, zoneByName }) => ({
      name, zone: zoneByName ? name : undefined,
      u: along.map(subsectionU).sort((a, b) => a - b),
      v: depth?.map(value => v0 + value * (spec.fractionalSubsectionDepth ? D : 1)) ?? [v0, v1],
    }));
    const angle = u => { const direction = outAt(u); return Math.atan2(direction.x, direction.z); };
    const beam = (material, a, b, width) => {
      const delta = b.clone().sub(a);
      if (delta.lengthSq() < 1e-6) return;
      const geo = new THREE.BoxGeometry(width, delta.length(), width);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      const center = a.clone().lerp(b, 0.5);
      add(material, geo.translate(center.x, center.y, center.z));
    };
    const slab = (a, b, lo, hi, height, baseY, material = deckMat) => {
      if (b - a < 1e-5 || hi - lo < 1e-5 || height <= 0) return;
      if (curve) {
        add(material, sweepStandSlab(curve, a, b, lo, hi, height, baseY));
        return;
      }
      const points = rectangle(poly, a, b, lo, hi);
      if (points.length < 3) return;
      const shape = new THREE.Shape();
      points.forEach(([u, v], i) => { const p = toWorld(u, v); (i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)); });
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      if (baseY) g.translate(0, baseY, 0);
      add(material, g);
    };
    const entryNear = v0 + entryStart * rowDepth, entryFar = entryNear + 3 * rowDepth;
    const entrySpans = entryRows.size ? [entryNear, entryFar].map(v => [v, spans(poly, v)]) : [];
    const entrances = new Map();
    for (const u of centers) {
      if (!entrySpans.length) break;
      // 弧形越靠后排横向宽度越可能变窄，按实际米数给上海门框让位。
      const scale = Math.min(...entrySpans.map(([v]) => toWorld(u - 1, v).distanceTo(toWorld(u + 1, v)) / 2));
      const width = (VOM_W + 0.32) / scale;
      if (entrySpans.every(([, range]) => range.some(([a, b]) => a <= u - width / 2 && b >= u + width / 2))) entrances.set(u, width);
    }
    const expanded = segmentsAt(entrances);
    const entranceCenters = [...entrances.keys()];
    const inEntrance = u => entranceCenters.some(c => Math.abs(u - c) < 1e-5);
    const stair = (a, b, lo, y) => {
      for (let k = 0; k < 3; k++) {
        const level = y - rise + rise * (k + 1) / 3;
        const front = lo + rowDepth * k / 3;
        slab(a, b, front, lo + rowDepth * (k + 1) / 3, 0.22, level - 0.22, stairMat);
        if (k === 0) slab(a, b, front + 0.032, front + 0.073, 0.008, level, edgeMat);
      }
    };
    const roofSupports = [];
    const depthPoly = poly.map(([u, v]) => [v, u]);
    if (spec.covered) {
      for (let u = u0 + 2; u < u1 - 1; u += 6.2) {
        if (centers.some(c => Math.abs(u - c) < (entrances.get(c) ?? aisleWidth) / 2 + 0.2)) continue;
        for (const [a, b] of spans(depthPoly, u)) if (b - a >= 1.7) roofSupports.push({ u, a, b, postV: b - 0.13 });
      }
    }
    for (let r = 0; r < rows; r++) {
      const lo = v0 + r * rowDepth, hi = v0 + (r + 1) * rowDepth, y = 0.3 + (r + 1) * rise;
      const inEntryRow = entryRows.has(r);
      const rowSegments = inEntryRow ? expanded : segments;
      const rowBounds = bays ? spans(poly, (lo + hi) / 2) : [[u0, u1]];
      for (const [left, right] of rowBounds) for (const [segA, segB, aisle] of rowSegments) {
        const a = Math.max(left, segA), b = Math.min(right, segB);
        if (b - a < 1e-5) continue;
        if (!aisle || (inEntryRow && inEntrance((segA + segB) / 2))) {
          const thickness = Math.min(y, rise + 0.13);
          slab(a, b, lo, hi, thickness, y - thickness);
        } else stair(a, b, lo, y);
      }
      const first = seats.length, v = (lo + hi) / 2;
      const seatSpans = spans(poly, v).flatMap(([left, right]) => rowSegments.filter(([, , aisle]) => !aisle)
        .map(([a, b]) => [Math.max(left, a), Math.min(right, b)]).filter(([a, b]) => a + 0.42 < b));
      for (const [left, right] of seatSpans) {
        const stations = curve ? curve.stations(left, right) : [left, right];
        const distances = [0];
        if (curve) {
          let p = toWorld(stations[0], v);
          for (let i = 1; i < stations.length; i++) {
            const next = toWorld(stations[i], v);
            distances.push(distances.at(-1) + p.distanceTo(next));
            p = next;
          }
        } else distances.push(right - left);
        const length = distances.at(-1), count = Math.floor((length - 0.42) / PITCH);
        let j = 1;
        for (let k = 0; k < count; k++) {
          const d = (length - (count - 1) * PITCH) / 2 + k * PITCH;
          while (distances[j] < d) j++;
          const u = THREE.MathUtils.lerp(stations[j - 1], stations[j], (d - distances[j - 1]) / (distances[j] - distances[j - 1]));
          if (curve && !curve.constantDepth && r % 2 === 1 && rowDepth * curve.depthAt(u) / D < 0.52) continue;
          if (roofSupports.some(post => Math.abs(u - post.u) < 0.34 && Math.abs(v - post.postV) < 0.33)) continue;
          const p = toWorld(u, v);
          base.push(p.x, baseY + offset(p.x, p.z) + y, p.z); rot.push(angle(u));
          const section = subsections?.find(s => u >= s.u[0] && u <= s.u[1] && v >= s.v[0] && v <= s.v[1]);
          seats.push({ zone: 'g', section: section?.zone, detail: section?.name ?? spec.sectionDetail,
            row: r + 1, num: 0, part: 0, j: Math.random() });
        }
      }
      for (let i = first; i < seats.length; i++) seats[i].num = i - first + 1;
      rowSpans.push([first, seats.length]);
    }
    if (!seats.length) continue;
    const entrancesGeometry = { vomBox: [], vomHole: [], vomFloor: [] };
    for (const u of entranceCenters) {
      const depth = curve && !curve.constantDepth ? rowDepth * curve.depthAt(u) / D : rowDepth;
      const frame = Array.from({ length: rows }, (_, r) => ({
        z: (r - entryStart + 0.5) * depth,
        y: 0.3 + (r + 1) * rise,
      }));
      addVomitory(entrancesGeometry, toWorld(u, entryNear), angle(u), frame, { first: 0 }, entryRows, depth);
    }
    const portalMeshes = buildVomitoryMeshes(entrancesGeometry, portalMat, portalDark);
    const raise = mesh => {
      mesh.position.y += baseY;
      if (!grade) return;
      if (mesh.isInstancedMesh) {
        const transform = new THREE.Matrix4().set(
          1, 0, 0, 0, grade.dx, 1, grade.dz, offset(0, 0), 0, 0, 1, 0, 0, 0, 0, 1,
        );
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          mesh.setMatrixAt(i, matrix.premultiply(transform));
        }
        mesh.instanceMatrix.needsUpdate = true;
        return;
      }
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + offset(pos.getX(i), pos.getZ(i)));
      mesh.geometry.computeVertexNormals();
    };
    for (const mesh of portalMeshes) raise(mesh);
    if (portalMeshes.length) scene.add(...portalMeshes);
    const seatMesh = new THREE.InstancedMesh(spec.bench ? benchGeo : seatGeo, seatMat, seats.length);
    const baseF = new Float32Array(base), rotF = new Float32Array(rot);
    const sObj = { seats, base: baseF, rot: rotF };
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (let i = 0; i < seats.length; i++) { seatMesh.setMatrixAt(i, seatMatrix(sObj, i, 1, 0, matrix)); seatMesh.setColorAt(i, seatColor(spec, seats[i], color)); }
    seatMesh.frustumCulled = false; scene.add(seatMesh);
    const midU = (u0 + u1) / 2, front = toWorld(midU, v0), f = outAt(midU).clone().negate();
    const hitCount = curve ? Math.ceil(L / 10) : 1;
    for (let i = 0; i < hitCount; i++) {
      const u = u0 + L * (i + 0.5) / hitCount;
      const bay = bays ? bayAt(u) : null;
      const localV1 = bay ? v0 + bay.depth : v1;
      const localH = bay ? 0.3 + bay.rows * rise : H;
      const depth = toWorld(u, v0).distanceTo(toWorld(u, localV1));
      const hit = new THREE.Mesh(new THREE.BoxGeometry(L / hitCount + (curve ? 1 : 0), localH + 3, depth),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(toWorld(u, (v0 + localV1) / 2, baseY + (localH + 3) / 2));
      hit.position.y += offset(hit.position.x, hit.position.z);
      hit.rotation.y = angle(u);
      hit.userData.standId = spec.id;
      scene.add(hit); hitboxes.push(hit);
    }
    const center = toWorld((u0 + u1) / 2, (v0 + v1) / 2, baseY + H / 2);
    const blocks = subsections?.map(({ name, zone, u: span, v: depth }, idx) => {
      const u = (span[0] + span[1]) / 2, v = THREE.MathUtils.clamp((depth[0] + depth[1]) / 2, v0, v1);
      const point = toWorld(u, v, baseY + 0.3 + rise * (v - v0) / rowDepth);
      return { zone, detail: zone ? undefined : name, idx, tier: 0, side: '', center: point, f: outAt(u).clone().negate(),
        label: point.clone().add(new THREE.Vector3(0, 3, 0)) };
    }) ?? [{ zone: 'g', idx: 0, tier: 0, side: '', center: center.clone(), f,
      label: center.clone().add(new THREE.Vector3(0, H / 2 + 3, 0)) }];
    center.y += offset(center.x, center.z);
    // 看台下方钢支架与斜撑，按每个轮廓截面裁切。
    for (let v = v0 + Math.min(1.5, D / 3); v < v1; v += 3.4) {
      const top = 0.3 + Math.min(rows, Math.floor((v - v0) / rowDepth) + 1) * rise - 0.12;
      for (const [a, b] of spans(poly, v)) {
        if (b - a < 0.5) continue;
        const count = Math.max(1, Math.ceil((b - a - 0.4) / 4.8));
        for (let i = 0; i <= count; i++) {
          const u = THREE.MathUtils.lerp(a + 0.2, b - 0.2, i / count);
          beam(steel, toWorld(u, v), toWorld(u, v, top), 0.14);
          if (i === count) continue;
          const next = THREE.MathUtils.lerp(a + 0.2, b - 0.2, (i + 1) / count);
          beam(steel, toWorld(u, v, top - 0.16), toWorld(next, v, top - 0.16), 0.13);
          if (top > 1.3) beam(steel, toWorld(u, v, 0.25), toWorld(next, v, top - 0.16), 0.07);
        }
      }
    }
    const rail = (a, b, v, y) => {
      for (const h of [0.5, 1.03]) {
        if (curve) slab(a, b, v - 0.024, v + 0.024, 0.048, y + h - 0.024, railMaterial);
        else beam(railMaterial, toWorld(a, v, y + h), toWorld(b, v, y + h), 0.05);
      }
      const bays = Math.max(1, Math.ceil((b - a) / 2.5));
      for (let i = 0; i <= bays; i++) {
        const u = THREE.MathUtils.lerp(a, b, i / bays);
        beam(railMaterial, toWorld(u, v, y), toWorld(u, v, y + 1.03), 0.055);
      }
    };
    if (bays) {
      for (let i = 0; i < bays.length; i++) {
        const { from, to, rows: bayRows, depth: bayDepth } = bays[i];
        const bayBackV = v0 + bayDepth - Math.min(0.15, bayDepth / 4);
        const bayH = 0.3 + bayRows * rise;
        const startU = i > 0 && bays[i - 1].rows > bayRows ? from - 0.075 : from + 0.075;
        const endU = i + 1 < bays.length && bays[i + 1].rows > bayRows ? to + 0.075 : to - 0.075;
        if (endU - startU > 0.35) rail(startU, endU, bayBackV, bayH);
      }
      for (let i = 0; i + 1 < bays.length; i++) {
        if (bays[i].rows === bays[i + 1].rows) continue;
        const hi = bays[i].rows > bays[i + 1].rows ? bays[i] : bays[i + 1];
        const lo = hi === bays[i] ? bays[i + 1] : bays[i];
        const uRail = hi === bays[i] ? bays[i].to - 0.075 : bays[i].to + 0.075;
        const vLo = v0 + lo.depth - Math.min(0.15, lo.depth / 4);
        const vHi = v0 + hi.depth - Math.min(0.15, hi.depth / 4);
        const yLo = 0.3 + lo.rows * rise, yHi = 0.3 + hi.rows * rise;
        for (const h of [0.5, 1.03]) {
          beam(railMaterial, toWorld(uRail, vLo, yLo + h), toWorld(uRail, vHi, yHi + h), 0.048);
        }
        const postCount = Math.max(1, Math.ceil((vHi - vLo) / 2));
        for (let k = 0; k <= postCount; k++) {
          const t = k / postCount, v = THREE.MathUtils.lerp(vLo, vHi, t);
          const stepTop = 0.3 + Math.min(hi.rows, Math.floor((v - v0) / rowDepth) + 1) * rise;
          const railTop = THREE.MathUtils.lerp(yLo, yHi, t) + 1.03;
          beam(railMaterial, toWorld(uRail, v, stepTop), toWorld(uRail, v, railTop), 0.055);
        }
      }
    } else {
      const backV = v1 - Math.min(0.15, D / 4);
      for (const [a, b] of spans(poly, backV)) if (b - a > 0.35) rail(a + 0.075, b - 0.075, backV, H);
    }
    const frontV = v0 + Math.min(0.11, D / 4);
    for (const [left, right] of spans(poly, frontV)) for (const [a, b, aisle] of segments) {
      const start = Math.max(left + 0.075, a), end = Math.min(right - 0.075, b);
      if (!aisle && end > start + 0.2) rail(start, end, frontV, 0.3 + rise);
    }
    // 上海式过道中线扶手，门框前后分别收口。
    const railY = v => 1.3 + rise * ((v - v0) / rowDepth + 0.5);
    for (const u of centers) for (const [a, b] of spans(depthPoly, u)) {
      const runs = entrances.has(u) ? [[a, Math.min(b, entryNear - 0.18)], [Math.max(a, entryFar + 0.27), b]] : [[a, b]];
      for (const [lo, hi] of runs) {
        const start = lo + 0.16, end = hi - 0.16;
        if (end - start < 0.35) continue;
        beam(railMaterial, toWorld(u, start, railY(start)), toWorld(u, end, railY(end)), 0.05);
        for (let v = start; v <= end; v += 4 * rowDepth) {
          const step = (v - v0) / rowDepth;
          const level = 0.3 + rise * (Math.floor(step * 3 + 1) / 3);
          beam(railMaterial, toWorld(u, v, level), toWorld(u, v, railY(v)), 0.04);
        }
      }
    }
    if (spec.covered) {
      const bottom = H + 3.7;
      const heading = THREE.MathUtils.degToRad(Number(spec.roofDirection));
      const slopesTowardRear = !Number.isFinite(heading) || -f.x * Math.sin(heading) + f.z * Math.cos(heading) > 0;
      const roofY = (v) => bottom + 0.11 * (slopesTowardRear ? v1 - v : v - v0);
      if (curve) {
        slab(u0, u1, v0, v1, 0.23, roofY, roofMaterial);
        for (const v of [v0, v1 - 0.14]) slab(u0, u1, v, v + 0.14, 0.21, roofY, steel);
      } else {
        const shape = new THREE.Shape(poly.map(([u, v]) => { const p = toWorld(u, v); return new THREE.Vector2(p.x, -p.z); }));
        const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.23, bevelEnabled: false }).rotateX(-Math.PI / 2);
        const pos = roof.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const v = (pos.getX(i) - origin.x) * outward.x + (pos.getZ(i) - origin.z) * outward.z;
          pos.setY(i, pos.getY(i) + roofY(v));
        }
        roof.computeVertexNormals();
        add(roofMaterial, roof);
      }
      spec.roofBottom = baseY + offset(center.x, center.z) + bottom;
      for (let i = 0; i < poly.length; i++) {
        const [u, v] = poly[i], [nu, nv] = poly[(i + 1) % poly.length];
        if (curve && v === nv) continue;
        beam(steel, toWorld(u, v, roofY(v)), toWorld(nu, nv, roofY(nv)), 0.20);
      }
      for (const { u, a, b, postV } of roofSupports) {
        beam(steel, toWorld(u, a, roofY(a) - 0.16), toWorld(u, b, roofY(b) - 0.16), 0.15);
        beam(steel, toWorld(u, postV, 0.05), toWorld(u, postV, roofY(postV) - 0.16), 0.18);
        const braceV = THREE.MathUtils.lerp(a, b, 0.63);
        beam(steel, toWorld(u, postV, roofY(postV) - 1.05), toWorld(u, braceV, roofY(braceV) - 0.16), 0.095);
      }
    }
    for (const [material, geos] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = mesh.receiveShadow = true;
      raise(mesh);
      scene.add(mesh);
    }
    const normal = grade ? new THREE.Vector3(-grade.dx, 1, -grade.dz) : new THREE.Vector3(0, 1, 0);
    const plane = new THREE.Plane(normal, 0), intersection = new THREE.Vector3();
    const s = { spec, center, labelPos: center.clone().add(new THREE.Vector3(0, H / 2 + 5, 0)), radius: Math.max(L, D) / 2 + 10, L, D, H, f,
      parts: [{ front: front.clone().setY(baseY + offset(front.x, front.z)), f, L, D, H,
        noLimits: Boolean(spec.curveOutline || spec.curvePlan), pick: { arc: true } }],
      seats, base: baseF, rot: rotF, mesh: seatMesh, carpet: new THREE.Object3D(),
      blocks,
      pickSeat(ray) {
        let best = -1, bestDistance = Infinity;
        for (let r = 0; r < rows; r++) {
          plane.constant = -(baseY + offset(0, 0) + 0.3 + (r + 1) * rise);
          if (!ray.intersectPlane(plane, intersection)) continue;
          for (let i = rowSpans[r][0]; i < rowSpans[r][1]; i++) {
            const dx = baseF[i * 3] - intersection.x, dz = baseF[i * 3 + 2] - intersection.z;
            if (dx * dx + dz * dz > 0.45 ** 2) continue;
            const distance = ray.origin.distanceTo(intersection);
            if (distance < bestDistance) { bestDistance = distance; best = i; }
          }
        }
        return best;
      },
    };
    stands.push(s);
  }
  return { stands: groupFamilies(scene, stands, hitboxes, seatMat), hitboxes };
}

// 同一看台的 A/B/C/D 作为一个入口；座位仍保留各自分区、朝向和独立拾取范围。
function groupFamilies(scene, stands, hitboxes, seatMat) {
  const groups = new Map();
  for (const s of stands) if (s.spec.family) {
    if (!groups.has(s.spec.family)) groups.set(s.spec.family, []);
    groups.get(s.spec.family).push(s);
  }
  const done = new Set(), result = [];
  const codes = { Landostand: 'LS', Copse: 'CO', Abbey: 'AB', Village: 'VI', Woodcote: 'WO', Stirling: 'ST', 'Hamilton Straight': 'HS' };
  for (const stand of stands) {
    const family = stand.spec.family;
    if (!family) { result.push(stand); continue; }
    if (done.has(family)) continue;
    done.add(family);
    const members = groups.get(family).slice().sort((a, b) => a.spec.section.localeCompare(b.spec.section));
    const code = stand.spec.familyCode ?? codes[family];
    const id = stand.spec.familyId ?? `GB-${code}`, color = stand.spec.color;
    const zoneSpecs = new Map();
    for (const s of members) for (const block of s.blocks) {
      const zone = block.zone && block.zone !== 'g' ? block.zone : s.spec.section;
      zoneSpecs.set(zone, s.spec.familyZones?.[zone] ?? {
        name: `${zone} 区`, nameEn: `Section ${zone}`, color: s.spec.zones.g.color,
        price: null, tag: '示意', tagEn: 'Schematic', note: '排号、座号为模型计数', noteEn: 'Rows and seats are model numbers',
      });
    }
    const zones = Object.fromEntries([...zoneSpecs.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const [turns, turnsEn] = stand.spec.familyTurns ?? ['选择分区查看', 'Choose a section'];
    const [name, nameEn] = stand.spec.familyLabel ?? [`${family} 看台`, `${family} Grandstand`];
    const spec = { id, code, name, nameEn, family, grouped: true,
      type: 'seats', schematic: true, color, zones,
      gate: stand.spec.gate ?? '待核实',
      gateEn: stand.spec.gateEn ?? 'Unverified', turns, turnsEn,
      desc: stand.spec.groupedDesc ?? (stand.spec.familyTurns ? stand.spec.desc : '按看台汇总相邻分区。位置、分段与座位均为示意。'),
      descEn: stand.spec.groupedDescEn ?? (stand.spec.familyTurns ? stand.spec.descEn : 'Adjacent sections are grouped into one grandstand. Layout and seating are illustrative.'),
    };
    const center = members.reduce((sum, s) => sum.add(s.center), new THREE.Vector3()).multiplyScalar(1 / members.length);
    const radius = Math.max(...members.map(s => s.center.distanceTo(center) + s.radius));
    const offsets = []; let total = 0;
    const seats = [], base = [], rot = [], parts = [], blocks = [];
    members.forEach((s, index) => {
      offsets.push(total); total += s.seats.length;
      for (const seat of s.seats) seats.push({ ...seat, zone: seat.section ?? s.spec.section, part: index });
      for (const value of s.base) base.push(value);
      for (const value of s.rot) rot.push(value);
      parts.push(...s.parts);
      for (const block of s.blocks) blocks.push({ ...block, idx: blocks.length,
        zone: block.zone && block.zone !== 'g' ? block.zone : s.spec.section,
        detail: block.detail ?? s.spec.sectionDetail, roofBottom: s.spec.roofBottom });
      scene.remove(s.mesh);
      for (const hit of hitboxes) if (hit.userData.standId === s.spec.id) hit.userData.standId = id;
    });
    const baseF = new Float32Array(base), rotF = new Float32Array(rot);
    const mesh = new THREE.InstancedMesh(stand.mesh.geometry, seatMat, seats.length), m = new THREE.Matrix4(), c = new THREE.Color();
    const data = { seats, base: baseF, rot: rotF };
    for (let i = 0; i < seats.length; i++) { mesh.setMatrixAt(i, seatMatrix(data, i, 1, 0, m)); mesh.setColorAt(i, seatColor(spec, seats[i], c)); }
    mesh.frustumCulled = false; scene.add(mesh);
    const H = Math.max(...members.map(s => s.H)), f = members[0].f.clone();
    const sectionBlocks = Object.keys(zones).map(zone => blocks.find(b => b.zone === zone));
    result.push({ spec, center, labelPos: center.clone().setY(Math.max(...members.map(s => s.labelPos.y)) + 1), radius, L: radius * 2, D: Math.max(...members.map(s => s.D)), H, f,
      parts, blocks, sectionBlocks, seats, base: baseF, rot: rotF, mesh, carpet: new THREE.Object3D(),
      pickSeat(ray) {
        let best = -1, distance = Infinity;
        members.forEach((s, i) => {
          const index = s.pickSeat(ray);
          if (index < 0) return;
          const p = new THREE.Vector3(s.base[index * 3], s.base[index * 3 + 1], s.base[index * 3 + 2]);
          const d = ray.origin.distanceTo(p);
          if (d < distance) { distance = d; best = offsets[i] + index; }
        });
        return best;
      },
    });
  }
  return result;
}
