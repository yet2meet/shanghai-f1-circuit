// 新加坡看台的放置与建模。
// 位置：每个看台“在哪个弯道 / 哪两个弯道之间、行驶方向的哪一侧”取自官网各看台页面与官方 Circuit Park Map
// （singaporegp.sg/event-info/circuit-park-map，图上各看台红色标记所在的路段与一侧；该图“不按比例绘制”）。
// 官方没有公布的看台长度、进深、高度、座位数：按常见临时看台量级给出示意体量（阶梯状座席块），界面上注明“示意”；
// 座位按常规看台尺寸（座距 0.55 m、排距 0.85 m，每 28 座一条过道）排满这块体量，座位数不是官方数字。
// 造型：沿赛道曲线整体扫掠——每一排座席是一条与赛道平行的弧，后墙、端面连续，弯道处的看台是圆滑的弧形而不是拼接的直条。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { std, floodlit } from '../../util.js';
import { ROW_D, PITCH, seatGeometry, seatMatrix, seatColor } from '../../seatkit.js';
import { SG_STANDS } from './stands-data.js';

const FRONT = 11;   // 看台前沿离赛道中心线的距离：路面半宽 6.5 + 护墙与防护网约 2 + 通道
const BLOCK = 28, AISLE = 2; // 每个分区 28 座 + 2 个座位宽的过道（与上海一致）
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

  /** 沿赛道扫掠出阶梯状座席：每排一条与赛道平行的弧；顶面、前立面、后墙、两端面 */
  function sweep(ks, side, frontOffset, rows, rise, base, hBack) {
    const pos = [], nor = [], idx = [];
    const out = ks.map((k) => new THREE.Vector3(track.nor[k].x * side, 0, track.nor[k].z * side));
    const at = (j, d, y) => { const P = track.pts[ks[j]]; return [P.x + out[j].x * d, y, P.z + out[j].z * d]; };
    const quad = (a, b, c, d, n) => {
      const o = pos.length / 3;
      for (const p of [a, b, c, d]) { pos.push(...p); nor.push(...n); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const last = ks.length - 1;
    for (let r = 0; r < rows; r++) {
      const d0 = frontOffset + r * ROW_D, d1 = d0 + ROW_D;
      const hTop = base + (r + 1) * rise, hPrev = r ? base + r * rise : 0;
      for (let j = 0; j < last; j++) {
        quad(at(j, d0, hTop), at(j, d1, hTop), at(j + 1, d1, hTop), at(j + 1, d0, hTop), [0, 1, 0]);                          // 座席面
        quad(at(j, d0, hPrev), at(j, d0, hTop), at(j + 1, d0, hTop), at(j + 1, d0, hPrev), [-out[j].x, 0, -out[j].z]);          // 前立面（朝赛道）
      }
      for (const [j, sgn] of [[0, -1], [last, 1]]) {                                                                          // 两端面
        const tn = track.tan[ks[j]];
        quad(at(j, d0, 0), at(j, d1, 0), at(j, d1, hTop), at(j, d0, hTop), [tn.x * sgn, 0, tn.z * sgn]);
      }
    }
    const dB = frontOffset + rows * ROW_D;
    for (let j = 0; j < last; j++) quad(at(j, dB, 0), at(j + 1, dB, 0), at(j + 1, dB, hBack), at(j, dB, hBack), [out[j].x, 0, out[j].z]); // 后墙
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  const seatGeo = seatGeometry();
  const seatMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.55 }), 0.58);
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
    const seatFront = frontOffset + (parent ? parent.D : 0); // 上层座席接在前一块后面
    const base = parent ? parent.H - 0 : 0.3;
    const rows = Math.max(3, Math.round(D / ROW_D)), rise = (H - (parent ? 0 : 0.3)) / rows;
    const topY = (r) => base + (r + 1) * rise;
    const surface = new THREE.Mesh(sweep(ks, side, seatFront, rows, rise, base, base + H + 0.5), matFor(spec.color));
    surface.castShadow = surface.receiveShadow = true;
    scene.add(surface);

    // ── 座位：每排沿自己的弧线排布，每 28 座一条过道 ──
    const out = ks.map((k) => new THREE.Vector3(track.nor[k].x * side, 0, track.nor[k].z * side));
    const seats = [], baseA = [], rotA = [], rowSpans = [], rowQuads = [];
    const segLen = Math.max(4, Math.round(25 / mPerPt)), nSeg = Math.ceil((ks.length - 1) / segLen);
    for (let r = 0; r < rows; r++) {
      const d = seatFront + (r + 0.5) * ROW_D, y = topY(r);
      const Q = ks.map((k, j) => [track.pts[k].x + out[j].x * d, track.pts[k].z + out[j].z * d]);
      const cum = [0];
      for (let j = 1; j < Q.length; j++) cum.push(cum[j - 1] + Math.hypot(Q[j][0] - Q[j - 1][0], Q[j][1] - Q[j - 1][1]));
      const total = cum[cum.length - 1];
      const first = seats.length;
      let u = PITCH / 2, cnt = 0, jj = 0;
      while (u < total - PITCH / 2) {
        while (jj < cum.length - 2 && cum[jj + 1] < u) jj++;
        const t = (u - cum[jj]) / Math.max(1e-6, cum[jj + 1] - cum[jj]);
        const x = Q[jj][0] + (Q[jj + 1][0] - Q[jj][0]) * t, z = Q[jj][1] + (Q[jj + 1][1] - Q[jj][1]) * t;
        const o = new THREE.Vector3().lerpVectors(out[jj], out[jj + 1], t).normalize();
        baseA.push(x, y, z); rotA.push(Math.atan2(o.x, o.z));
        seats.push({ zone: 'g', row: r + 1, num: 0, part: Math.min(nSeg - 1, Math.floor(jj / segLen)), j: Math.random() });
        cnt++; u += PITCH;
        if (cnt % BLOCK === 0) u += PITCH * AISLE;
      }
      // 座号：面朝赛道从左往右数（左侧看台：顺行驶方向的反方向数；右侧看台：顺行驶方向数）
      for (let s2 = 0; s2 < cnt; s2++) seats[first + s2].num = side > 0 ? cnt - s2 : s2 + 1;
      rowSpans.push([first, seats.length]);
      // 供拾取用的这一排座席面（按路段切成小四边形）
      const d0 = seatFront + r * ROW_D, d1 = d0 + ROW_D, quads = [];
      for (let j = 0; j + 1 < ks.length; j++) {
        const P0 = track.pts[ks[j]], P1 = track.pts[ks[j + 1]];
        quads.push([
          new THREE.Vector3(P0.x + out[j].x * d0, y, P0.z + out[j].z * d0), new THREE.Vector3(P0.x + out[j].x * d1, y, P0.z + out[j].z * d1),
          new THREE.Vector3(P1.x + out[j + 1].x * d1, y, P1.z + out[j + 1].z * d1), new THREE.Vector3(P1.x + out[j + 1].x * d0, y, P1.z + out[j + 1].z * d0),
        ]);
      }
      rowQuads.push(quads);
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
    stands.push(s); byId[spec.id] = { i, side, D, H: base + H, frontOffset };
  }
  return { stands, hitboxes };
}
