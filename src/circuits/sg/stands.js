// 新加坡看台的放置与建模。
// 位置：每个看台“在哪个弯道 / 哪两个弯道之间、行驶方向的哪一侧”取自官网各看台页面与官方 Circuit Park Map
// （singaporegp.sg/event-info/circuit-park-map，图上各看台红色标记所在的路段与一侧；该图“不按比例绘制”）。
// 官方没有公布的看台长度、进深、高度、座位数：按常见临时看台量级给出示意体量（阶梯状座席块），界面上注明“示意”；
// 座位按常规看台尺寸（座距 0.55 m、排距 0.85 m）排布，径向过道和出入口为示意。
// 造型：沿赛道曲线整体扫掠——每一排座席是一条与赛道平行的弧，后墙、端面连续，弯道处的看台是圆滑的弧形而不是拼接的直条。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { std, floodlit } from '../../util.js';
import { ROW_D, PITCH, seatGeometry, seatMatrix, seatColor } from '../../seatkit.js';
import { SG_STANDS } from './stands-data.js';

const FRONT = 11;   // 看台前沿离赛道中心线的距离：路面半宽 6.5 + 护墙与防护网约 2 + 通道
const BLOCK = 28;
const AISLE_W = 2 * PITCH;
const ENTRY_W = 2.8;
const ENTRY_ROWS = 3;
const UNDER_H = 4.6;         // 高架桥下的看台限高（桥面下沿约 5.5 m）

const inPoly = (x, n, p) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > n) !== (p[j + 1] > n) && x < ((p[j] - p[i]) * (n - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
};
const segD = (x, n, p) => { // 点到折线（扁平 [x,n,…]）的最短距离
  let best = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i], an = p[i + 1], dx = p[i + 2] - ax, dn = p[i + 3] - an, l2 = dx * dx + dn * dn || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, n - an - dn * t));
  }
  return best;
};

function arcLength(at, last, depth) {
  const dist = [0];
  let prev = at(0, depth, 0);
  for (let j = 1; j <= last; j++) {
    const point = at(j, depth, 0);
    dist.push(dist[j - 1] + point.distanceTo(prev));
    prev = point;
  }
  return {
    total: dist[last],
    uAt(distance) {
      let lo = 0, hi = last;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (dist[mid] <= distance) lo = mid; else hi = mid;
      }
      return lo + (distance - dist[lo]) / Math.max(1e-6, dist[hi] - dist[lo]);
    },
    distanceAt(u) {
      const j = Math.min(Math.floor(u), last - 1);
      return THREE.MathUtils.lerp(dist[j], dist[j + 1], u - j);
    },
  };
}

function aisleLayout(arc) {
  const blocks = Math.max(2, Math.round((arc.total + AISLE_W) / (BLOCK * PITCH + AISLE_W)));
  const blockWidth = (arc.total - (blocks - 1) * AISLE_W) / blocks;
  if (blockWidth < PITCH) return [];
  const entryHalfWidth = Math.min(ENTRY_W / 2, (blockWidth + AISLE_W) / 3);
  return Array.from({ length: blocks - 1 }, (_, j) => {
    const center = (j + 1) * (blockWidth + AISLE_W) - AISLE_W / 2;
    return [-entryHalfWidth, -AISLE_W / 2, AISLE_W / 2, entryHalfWidth].map(d => arc.uAt(center + d));
  });
}

function rowSections(aisles, last, entry) {
  const sections = [];
  let start = 0;
  for (const [wideL, left, right, wideR] of aisles) {
    const a = entry ? wideL : left, b = entry ? wideR : right;
    sections.push({ a: start, b: a, kind: 'seat' });
    sections.push({ a, b, kind: entry ? 'entry' : 'aisle' });
    start = b;
  }
  sections.push({ a: start, b: last, kind: 'seat' });
  return sections;
}

function makeDeck(at, rows, front, backHeight, lowerLanding, backOpenings) {
  const pos = [], faces = [[], [], []], rowQuads = [], rails = [];
  const quad = (a, b, c, d, material) => {
    const start = pos.length / 3;
    for (const { x, y, z } of [a, b, c, d]) pos.push(x, y, z);
    faces[material].push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const flank = (u, d0, d1, bottom, top, material) => {
    quad(at(u, d0, bottom), at(u, d1, bottom), at(u, d1, top), at(u, d0, top), material);
  };
  const across = (a, b, draw) => {
    for (let u = a; u < b - 1e-6;) {
      const v = Math.min(b, Math.floor(u) + 1);
      draw(u, v);
      u = v;
    }
  };
  const riser = (a, b, d, low, high, material) => {
    across(a, b, (u, v) => quad(at(u, d, low), at(u, d, high), at(v, d, high), at(v, d, low), material));
  };
  const tread = (a, b, d0, d1, y, material) => {
    across(a, b, (u, v) => quad(at(u, d0, y), at(u, d1, y), at(v, d1, y), at(v, d0, y), material));
  };
  const lastRow = rows.at(-1);
  const last = lastRow.sections.at(-1).b;
  const rail = (a, b, depth, base, height, postSpacing) => {
    if (a >= b) return;
    for (const y of [base + height * 0.48, base + height]) {
      across(a, b, (u, v) => rails.push([at(u, depth, y), at(v, depth, y)]));
    }
    const arc = arcLength(at, last, depth);
    const start = arc.distanceAt(a), end = arc.distanceAt(b);
    const count = Math.max(1, Math.ceil((end - start) / postSpacing));
    for (let j = 0; j <= count; j++) {
      const u = j === 0 ? a : j === count ? b : arc.uAt(THREE.MathUtils.lerp(start, end, j / count));
      rails.push([at(u, depth, base), at(u, depth, base + height)]);
    }
  };
  const entryStart = rows.findIndex(row => row.sections.some(section => section.kind === 'entry'));
  const entryEnd = entryStart + ENTRY_ROWS - 1;
  const entryFloor = rows[entryStart - 1]?.y;

  for (const [r, row] of rows.entries()) {
    const d0 = front + r * ROW_D, d1 = d0 + ROW_D;
    const prevY = rows[r - 1]?.y ?? lowerLanding;
    const rowFaces = [];
    for (const { a, b, kind } of row.sections) {
      if (b <= a) continue;
      if (kind === 'entry') {
        // 左、右、高侧共用同一墙顶标高，低侧朝过道开口。
        const wallTop = rows[entryEnd].y + 0.96;
        const thickness = (b - a) * 0.07;
        const left = a + thickness, right = b - thickness;
        const lastEntryRow = r === entryEnd;
        const rear = lastEntryRow ? d1 - 0.02 : d1;
        const openingEnd = lastEntryRow ? rear - 0.2 : rear;
        tread(left, right, d0, openingEnd, entryFloor, 2);
        for (const [outside, inside] of [[a, left], [b, right]]) {
          const from = Math.min(outside, inside), to = Math.max(outside, inside);
          tread(from, to, d0, rear, wallTop, 1);
          flank(outside, d0, rear, row.y, wallTop, 1);
          flank(inside, d0, openingEnd, entryFloor, wallTop, 1);
          if (r === entryStart) riser(from, to, d0, entryFloor, wallTop, 1);
        }
        if (lastEntryRow) {
          riser(left, right, openingEnd, entryFloor, row.y - 0.16, 2);
          riser(left, right, openingEnd, row.y - 0.16, wallTop, 1);
          tread(left, right, openingEnd, rear, wallTop, 1);
          riser(a, b, rear, row.y, wallTop, 1);
        }
        continue;
      }
      const material = kind === 'seat' ? 0 : 1;
      const steps = kind === 'aisle' ? 3 : 1;
      for (let step = 0; step < steps; step++) {
        const f0 = step / steps, f1 = (step + 1) / steps;
        const start = THREE.MathUtils.lerp(d0, d1, f0), end = THREE.MathUtils.lerp(d0, d1, f1);
        const y = THREE.MathUtils.lerp(prevY, row.y, f1);
        const below = THREE.MathUtils.lerp(prevY, row.y, f0);
        across(a, b, (u, v) => {
          const q = [at(u, start, y), at(u, end, y), at(v, end, y), at(v, start, y)];
          quad(...q, material);
          if (material === 0) rowFaces.push(q);
          quad(at(u, start, below), q[0], q[3], at(v, start, below), material);
          if (r === 0 && step === 0 && lowerLanding > 0) quad(at(u, start, 0), at(u, start, lowerLanding), at(v, start, lowerLanding), at(v, start, 0), 0);
          if (r === rows.length - 1 && step === steps - 1) {
            const height = backOpenings.has(a) ? row.y : backHeight;
            quad(at(u, end, 0), at(v, end, 0), at(v, end, height), at(u, end, height), material);
            if (height > row.y) {
              tread(u, v, end - 0.09, end, height, material);
              riser(u, v, end - 0.09, row.y, height, material);
            }
          }
        });
        if (y < row.y) {
          flank(a, start, end, y, row.y, 1);
          flank(b, start, end, y, row.y, 1);
        }
      }
    }
    flank(0, d0, d1, 0, row.y, 0);
    flank(row.sections.at(-1).b, d0, d1, 0, row.y, 0);
    rowQuads.push(rowFaces);
  }

  const rear = front + rows.length * ROW_D - 0.045;
  let startOfRail = 0;
  for (const { a, b } of lastRow.sections) {
    if (!backOpenings.has(a)) continue;
    rail(startOfRail, a, rear, backHeight, 0.92, 2.4);
    startOfRail = b;
  }
  rail(startOfRail, last, rear, backHeight, 0.92, 2.4);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(faces.flat());
  let start = 0;
  faces.forEach((indices, material) => { geometry.addGroup(start, indices.length, material); start += indices.length; });
  geometry.computeVertexNormals();
  return { geometry, rowQuads, rails };
}

/**
 * @param track  buildTrack 的返回值
 * @param data   { turns: TURNS, buildings: [{p, h}], water: [{p}], elevated: [{p, w}], pitFace: { n0, n1 } 维修楼立面沿 n 的范围 }
 *               用来避开已有建筑与水面，并在高架桥下压低看台
 */
export function buildSGStands(scene, track, { turns, buildings, water, elevated, pitFace }) {
  const N = track.N;
  const mPerPt = track.total / N;
  const turnIdx = (n) => { const [, x, y] = turns.find((t) => t[0] === n); return track.nearest(x, -y); };
  const fwd = (a, b) => (b - a + N) % N; // 沿行驶方向从 a 到 b 的点数
  const anchorIndex = (at) => {
    if (at.pitFace != null) { // 沿维修楼立面（车库段）的位置：0 = 入口端，1 = 出口端；Pit / Super Pit 看台“正对车库”
      const n = pitFace.n0 + at.pitFace * (pitFace.n1 - pitFace.n0);
      return track.nearest(track.pts[0].x, -n);
    }
    if (at.turn) return turnIdx(at.turn);
    if (at.between) { const a = turnIdx(at.between[0]), b = turnIdx(at.between[1]); return (a + Math.round(fwd(a, b) * (at.t ?? 0.5))) % N; }
    const a = turnIdx(19), b = turnIdx(1); // 起终点直道：19 号弯出弯 → 1 号弯入弯
    return (a + Math.round(fwd(a, b) * at.pit)) % N;
  };
  const solids = buildings.filter((b) => b.h > 2);
  const ptsOf = (i, L) => { const half = Math.max(2, Math.round(L / 2 / mPerPt)), ks = []; for (let t = -half; t <= half; t++) ks.push((i + t + N) % N); return ks; };
  const underBridge = (x, n) => elevated.some((l) => segD(x, n, l.p) < l.w / 2 + 2);

  /** 沿赛道扫掠足迹上的采样点：返回 [与建筑 / 水面重叠数, 在高架桥下的点数] */
  const probe = (i, side, L, D, shiftPts, frontOffset) => {
    const ks = ptsOf((i + shiftPts + N) % N, L);
    let bad = 0, under = 0, total = 0;
    for (let j = 0; j < ks.length; j += Math.max(1, Math.floor(ks.length / 7))) {
      const P = track.pts[ks[j]], nor = track.nor[ks[j]];
      for (let d = frontOffset; d <= frontOffset + D; d += D / 3) {
        const x = P.x + nor.x * side * d, n = -(P.z + nor.z * side * d);
        total++;
        if (solids.some((b) => inPoly(x, n, b.p)) || water.some((w) => inPoly(x, n, w.p))) bad++;
        if (underBridge(x, n)) under++;
      }
    }
    return [bad, under, total];
  };

  const seatGeo = seatGeometry();
  const seatMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.55 }), 0.58);
  const stairMat = std('#bac0c8', { roughness: 0.85, side: THREE.DoubleSide }, 0.34);
  const entryMat = std('#22262d', { roughness: 0.92, side: THREE.DoubleSide }, 0.18);
  const railGeo = new THREE.BoxGeometry(1, 1, 1);
  const railMat = std('#c6ccd3', { roughness: 0.55, metalness: 0.35 }, 0.36);
  const railUp = new THREE.Vector3(0, 1, 0);
  const stands = [], hitboxes = [], byId = {}, bodyMat = new Map();
  const matFor = (color) => { if (!bodyMat.has(color)) bodyMat.set(color, std(color, { roughness: 0.7, side: THREE.DoubleSide }, 0.3)); return bodyMat.get(color); };
  const tri = (ray, a, b, c, tmp) => ray.intersectTriangle(a, b, c, false, tmp);

  for (const spec of SG_STANDS) {
    const [L, D0, H0] = spec.size;
    const parent = spec.behind && byId[spec.behind];
    const frontOffset = parent?.frontOffset ?? spec.frontOffset ?? FRONT;
    let i = parent ? parent.i : anchorIndex(spec.at);
    // 每个看台在官方位置附近（沿赛道 ±60 m）挑一个不压建筑、不入水的位置；没写明方向的看台两侧都试，优先赛道外侧；
    // 除了官网写明“在桥下”的 Bayfront，其余尽量避开高架桥的投影
    let side = spec.side === 'left' ? 1 : spec.side === 'right' ? -1 : 0, shift = 0;
    if (parent) side = parent.side;
    else {
      const sides = side ? [side] : [track.curv[i] < 0 ? 1 : -1, track.curv[i] < 0 ? -1 : 1]; // 曲率 < 0 为右弯，外侧在左
      let best = Infinity;
      for (const sd of sides) for (const sh of [0, 12, -12, 24, -24, 36, -36, 48, -48, 60, -60].map((m) => Math.round(m / mPerPt))) {
        const [bad, under, total] = probe(i, sd, L, D0, sh, frontOffset);
        const c = bad + (spec.id === 'BF' ? 0 : under * 0.6) + Math.abs(sh) * mPerPt * 0.02 + (sd === sides[0] ? 0 : 0.5) + (total ? 0 : 99);
        if (c < best) { best = c; side = sd; shift = sh; }
      }
    }
    if (!parent) i = (i + shift + N) % N;
    const ks = ptsOf(i, L);
    // 弯道内侧的看台：座席弧的半径不能小于到赛道中心线的距离，否则会折叠，把进深收到不折叠为止
    let D = D0;
    for (const k of ks) { const c = track.curv[k] * side; if (c > 1e-4) D = Math.min(D, Math.max(3, 1 / c - frontOffset - 3)); }
    // 在高架桥下的部分限高，不让座席穿过桥面
    let H = H0;
    for (let j = 0; j < ks.length; j += 4) {
      const P = track.pts[ks[j]], nor = track.nor[ks[j]];
      if (underBridge(P.x + nor.x * side * (frontOffset + D / 2), -(P.z + nor.z * side * (frontOffset + D / 2)))) { H = Math.min(H, UNDER_H); break; }
    }
    const seatFront = frontOffset + (parent?.depth ?? 0); // 上层座席接到下层最后一排
    const base = parent?.H ?? 0.3;
    const rows = Math.max(3, Math.round(D / ROW_D)), rise = (H - (parent ? 0 : 0.3)) / rows;
    const topY = (r) => base + (r + 1) * rise;
    const last = ks.length - 1;
    const out = ks.map(k => new THREE.Vector3(track.nor[k].x * side, 0, track.nor[k].z * side));
    const at = (u, depth, y) => {
      const j = Math.min(Math.floor(u), last - 1);
      const a = track.pts[ks[j]], b = track.pts[ks[j + 1]];
      return a.clone().addScaledVector(out[j], depth).lerp(b.clone().addScaledVector(out[j + 1], depth), u - j).setY(y);
    };
    // 过道由同一条基准弧确定，所有排沿同一法线留空。
    const refArc = arcLength(at, last, seatFront + rows * ROW_D / 2);
    const parentShift = parent ? (parent.last - last) / 2 : 0;
    const inherited = parent?.aisles.map(aisle => aisle.map(u => u - parentShift))
      .filter(([a, , , b]) => a > 0 && b < last);
    const aisles = inherited?.length ? inherited : aisleLayout(refArc);
    const entryStart = rows >= 9 ? Math.floor(rows / 2) : rows;
    const layout = Array.from({ length: rows }, (_, r) => ({
      y: topY(r),
      sections: rowSections(aisles, last, r >= entryStart && r < entryStart + ENTRY_ROWS),
    }));
    const upper = SG_STANDS.find(stand => stand.behind === spec.id);
    const backOpenings = new Set();
    if (upper) {
      const edge = (ks.length - ptsOf(i, upper.size[0]).length) / 2;
      for (const [wideL, left, , wideR] of aisles) if (wideL > edge && wideR < last - edge) backOpenings.add(left);
    }
    const { geometry, rowQuads, rails } = makeDeck(at, layout, seatFront, base + H + 0.5, parent?.deckTop ?? 0, backOpenings);
    const surface = new THREE.Mesh(geometry, [matFor(spec.color), stairMat, entryMat]);
    surface.castShadow = surface.receiveShadow = true;
    const railing = new THREE.InstancedMesh(railGeo, railMat, rails.length);
    railing.name = 'grandstand-railings';
    const railMatrix = new THREE.Matrix4(), railRotation = new THREE.Quaternion();
    const railLength = new THREE.Vector3(), railCenter = new THREE.Vector3(), railScale = new THREE.Vector3();
    rails.forEach(([a, b], index) => {
      railLength.subVectors(b, a);
      const length = railLength.length();
      railRotation.setFromUnitVectors(railUp, railLength.multiplyScalar(1 / length));
      railMatrix.compose(railCenter.copy(a).lerp(b, 0.5), railRotation, railScale.set(0.06, length + 0.04, 0.06));
      railing.setMatrixAt(index, railMatrix);
    });
    surface.add(railing);
    scene.add(surface);

    // 各座席区内按该排弧长排座，过道和出入口与座席面使用同一份分段。
    const seats = [], baseA = [], rotA = [], rowSpans = [];
    const segLen = Math.max(4, Math.round(25 / mPerPt)), nSeg = Math.ceil((ks.length - 1) / segLen);
    for (let r = 0; r < rows; r++) {
      const d = seatFront + (r + 0.5) * ROW_D;
      const arc = arcLength(at, last, d);
      const first = seats.length;
      for (const { a, b, kind } of layout[r].sections) {
        if (kind !== 'seat') continue;
        const start = arc.distanceAt(a), end = arc.distanceAt(b);
        const count = Math.floor((end - start) / PITCH);
        const firstSeat = (start + end - (count - 1) * PITCH) / 2;
        for (let seat = 0; seat < count; seat++) {
          const u = arc.uAt(firstSeat + seat * PITCH), j = Math.floor(u);
          const p = at(u, d, layout[r].y);
          const o = out[j].clone().lerp(out[j + 1], u - j);
          baseA.push(p.x, p.y, p.z); rotA.push(Math.atan2(o.x, o.z));
          seats.push({ zone: 'g', row: r + 1, num: 0, part: Math.min(nSeg - 1, Math.floor(j / segLen)), j: Math.random() });
        }
      }
      // 座号：面朝赛道从左往右数（左侧看台：顺行驶方向的反方向数；右侧看台：顺行驶方向数）
      const cnt = seats.length - first;
      for (let s2 = 0; s2 < cnt; s2++) seats[first + s2].num = side > 0 ? cnt - s2 : s2 + 1;
      rowSpans.push([first, seats.length]);
    }
    const mesh = new THREE.InstancedMesh(seatGeo, seatMat, seats.length);
    mesh.frustumCulled = false;
    const baseF = new Float32Array(baseA), rotF = new Float32Array(rotA);
    const sObj = { seats, base: baseF, rot: rotF };
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let k = 0; k < seats.length; k++) { mesh.setMatrixAt(k, seatMatrix(sObj, k, 1, 0, m4)); mesh.setColorAt(k, seatColor(spec, seats[k], col)); }
    scene.add(mesh);

    // 点击用的不可见碰撞体、镜头防穿模用的分段轮廓：沿弧每约 25 m 一段
    const boxes = [], parts = [];
    for (let j = 0; j + 1 < ks.length; j += segLen) {
      const j1 = Math.min(ks.length - 1, j + segLen), jm = Math.floor((j + j1) / 2), a = track.pts[ks[j]], b = track.pts[ks[j1]], mid = track.pts[ks[jm]];
      const outd = out[jm], len = a.distanceTo(b) + 1, tan = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
      const frontMid = mid.clone().addScaledVector(outd, seatFront);
      const xAxis = side > 0 ? tan.clone().negate() : tan.clone();
      const m = new THREE.Matrix4().makeBasis(xAxis, new THREE.Vector3(0, 1, 0), outd).setPosition(frontMid.x, 0, frontMid.z);
      boxes.push(new THREE.BoxGeometry(len, base + H + 3, D + 2).translate(0, (base + H + 3) / 2, D / 2).applyMatrix4(m));
      parts.push({ front: frontMid, f: outd.clone().negate(), L: len, D, H: base + H, pick: { arc: true } });
    }
    const hit = new THREE.Mesh(mergeGeometries(boxes), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.standId = spec.id; scene.add(hit); hitboxes.push(hit);

    const P = track.pts[i], outward = out[Math.floor(ks.length / 2)];
    const center = P.clone().addScaledVector(outward, seatFront + D / 2).setY((base + H) / 2);
    const f = outward.clone().negate();                      // 由看台指向赛道
    const tmp = new THREE.Vector3();
    const s = {
      spec, center, labelPos: center.clone().setY(base + H + 5), radius: Math.max(L, D) / 2 + 10, L, H: base + H, D, f,
      parts, i, side, seats, base: baseF, rot: rotF, mesh, carpet: new THREE.Object3D(), // 座位在远处隐藏，座席面一直在
      blocks: [{ zone: 'g', idx: 0, tier: 0, side: '', center: center.clone(), f, label: center.clone().setY(base + H + 3) }],
      /** 射线拾取座位：先与各排座席面求交，再在该排里找最近的座位 */
      pickSeat(ray) {
        let bt = Infinity, br = -1;
        for (let r = 0; r < rowQuads.length; r++) for (const q of rowQuads[r]) {
          const h1 = tri(ray, q[0], q[1], q[2], tmp), h2 = h1 ? null : tri(ray, q[0], q[2], q[3], tmp);
          const h = h1 || h2;
          if (h) { const t = ray.origin.distanceTo(h); if (t < bt) { bt = t; br = r; var hx = h.x, hz = h.z; } }
        }
        if (br < 0) return -1;
        let best = -1, bd = 0.45 * 0.45;
        const [a, b] = rowSpans[br];
        for (let k = a; k < b; k++) { const dx = baseF[k * 3] - hx, dz = baseF[k * 3 + 2] - hz, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = k; } }
        return best;
      },
    };
    stands.push(s); byId[spec.id] = { i, side, H: base + H, frontOffset, depth: rows * ROW_D, deckTop: topY(rows - 1), last, aisles };
  }
  return { stands, hitboxes };
}
