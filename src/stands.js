// 看台：位置与尺寸全部来自 OpenStreetMap 的真实轮廓（OSM_STANDS），座位按真实尺寸排布。
//   座位间距 0.55 m、排距 0.85 m；每 28 个座位设一条 1.1 m 宽的过道（过道只是建模，不代表官方分区）。
// 票区只用官方名称（A铂金 / A上 / A下 / B / H/K / E）；排号、座号是模型内按位置的计数，不是票面座号。
// 座位直接放在世界坐标里，点选时按“射线 ∩ 座位斜面”解析出排号与座号，不必逐个检测几万个座位。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STANDS, TURNS, TRACK_POINTS } from './data.js';
import { OSM_STANDS } from './osm-data.js';
import { V, rng, std, floodlit, lampMat, extrudeProfile } from './util.js';
import { groundDetail } from './textures.js';

export const ROW_D = 0.85;
export const PITCH = 0.55;
const BLOCK = 28, AISLE = 2; // 每个分区 28 座 + 2 个座位宽的过道
export const SELECTED_COLOR = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);

function seatGeometry() {
  const pan = new THREE.BoxGeometry(0.47, 0.07, 0.42); pan.translate(0, 0.44, -0.02);
  const back = new THREE.BoxGeometry(0.47, 0.42, 0.06); back.translate(0, 0.68, 0.2);
  return mergeGeometries([pan, back]); // 24 个三角形；座位数量大，几何尽量精简
}

/** OSM 坐标里的看台框架 → 三维：front 为前沿中点，f 指向赛道 */
function frameOf(part) {
  const front = V(part.front[0], part.front[1]);
  const f = new THREE.Vector3(part.f[0], 0, -part.f[1]).normalize();
  return { front, f, rotY: Math.atan2(-f.x, -f.z) };
}

/**
 * 弧形看台：OSM 中多于 4 个顶点的轮廓（如 B2、B3）是沿弯道弯曲的。
 * 取轮廓中靠赛道一侧的顶点链作为前沿，按约 10 m 一段切成若干直段，每段按原有方式排座；
 * 相邻两段之间的楔形空隙用看台剖面绕接缝竖轴旋转（lathe）填满，得到连续的弧形阶梯。
 */
const SEG = 10;
function trackDist(x, n) {
  let b = Infinity;
  for (const [tx, tn] of TRACK_POINTS) { const d = (tx - x) ** 2 + (tn - n) ** 2; if (d < b) b = d; }
  return Math.sqrt(b);
}
function curveParts(parts) {
  const out = [];
  parts.forEach((part, pi) => {
    const P = part.poly, N = P.length / 2;
    if (N <= 4) { out.push({ ...part, chain: pi }); return; }
    const pts = [];
    for (let i = 0; i < N; i++) pts.push([P[i * 2], P[i * 2 + 1], trackDist(P[i * 2], P[i * 2 + 1])]);
    // 弧形带状轮廓：两端的“端头”边是相距最远的两条边；它们之间的两条长链一条是前沿、一条是后沿，离赛道近的是前沿
    const mid = (i) => [(pts[i][0] + pts[(i + 1) % N][0]) / 2, (pts[i][1] + pts[(i + 1) % N][1]) / 2];
    // 端头边从前沿走到后沿：沿边每米离赛道距离的变化接近 1；沿弧的边几乎为 0。取得分最高、且相距足够远的两条
    const score = (i) => { const p = pts[i], q = pts[(i + 1) % N]; return Math.abs(p[2] - q[2]) / Math.max(1, Math.hypot(p[0] - q[0], p[1] - q[1])); };
    let span = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) span = Math.max(span, Math.hypot(mid(i)[0] - mid(j)[0], mid(i)[1] - mid(j)[1]));
    let c1 = 0, c2 = 1, best = -1;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const d = Math.hypot(mid(i)[0] - mid(j)[0], mid(i)[1] - mid(j)[1]);
      if (d < span * 0.6) continue;
      const s = score(i) + score(j);
      if (s > best) { best = s; c1 = i; c2 = j; }
    }
    const chainA = [], chainB = [];
    for (let i = c1 + 1; ; i = (i + 1) % N) { chainA.push(pts[i]); if (i === c2) break; }
    for (let i = c2 + 1; ; i = (i + 1) % N) { chainB.push(pts[i]); if (i === c1) break; }
    const avg = (c) => c.reduce((s, p) => s + p[2], 0) / c.length;
    const [front, back] = avg(chainA) < avg(chainB) ? [chainA, chainB] : [chainB, chainA];
    // 前沿链沿弧长等分成若干段
    const cum = [0];
    for (let i = 1; i < front.length; i++) cum.push(cum[i - 1] + Math.hypot(front[i][0] - front[i - 1][0], front[i][1] - front[i - 1][1]));
    const len = cum[cum.length - 1], n = Math.max(1, Math.round(len / SEG));
    const at = (d) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return [front[i - 1][0] + (front[i][0] - front[i - 1][0]) * t, front[i - 1][1] + (front[i][1] - front[i - 1][1]) * t];
    };
    // 进深：前沿各点到后沿折线的距离取中位数（整段一致，相邻段的台阶才能对齐）
    const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy); };
    const ds = [];
    for (let k = 0; k <= 10; k++) { const [x, y] = at((len * k) / 10); let m = Infinity; for (let i = 1; i < back.length; i++) m = Math.min(m, segDist(x, y, back[i - 1], back[i])); ds.push(m); }
    ds.sort((a, b) => a - b);
    const D = Math.max(12, ds[5]);
    for (let k = 0; k < n; k++) {
      const a = at((len * k) / n), b = at((len * (k + 1)) / n);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let fx = -(b[1] - a[1]) / L, fn = (b[0] - a[0]) / L;
      const mx = (a[0] + b[0]) / 2, mn = (a[1] + b[1]) / 2;
      if (trackDist(mx + fx * 8, mn + fn * 8) > trackDist(mx - fx * 8, mn - fn * 8)) { fx = -fx; fn = -fn; } // 每段单独判断：朝向赛道一侧
      out.push({ ...part, code: part.code, front: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f: [fx, fn], L, D, chain: pi, a, b, first: k === 0, last: k === n - 1 });
    }
  });
  return out;
}

/** 生成每一层的排：返回 rows[{z,y,tier,r}] 与剖面 */
function layoutRows(spec, part) {
  const base = spec.base ?? 1.6;
  const tiers = spec.tiers.map((t) => ({ ...t }));
  if (tiers.length === 1 && !tiers[0].rows) {
    const usable = part.D - 1.4;
    const rows = Math.max(4, Math.min(Math.floor(usable / ROW_D), spec.maxRows ?? 99));
    const top = (part.h ?? spec.height ?? 12) - 1.4;
    tiers[0].rows = rows;
    tiers[0].rise = THREE.MathUtils.clamp((top - base) / rows, 0.26, 0.55);
  }
  const prof = [[0, 0], [0, base]];
  const rows = [], tierInfo = [];
  let z = 0.6, y = base;
  prof.push([z, y]);
  tiers.forEach((t, k) => {
    if (k > 0) {
      z += t.gap ?? 3; prof.push([z, y]);
      tierInfo[k - 1].lipZ = z; tierInfo[k - 1].lipY = y;
      y += t.lift ?? 3; prof.push([z, y]);
    }
    const first = rows.length;
    for (let r = 0; r < t.rows; r++) {
      rows.push({ z: z + ROW_D * 0.5, y, tier: k, r });
      z += ROW_D; prof.push([z, y]);
      if (r < t.rows - 1) { y += t.rise; prof.push([z, y]); }
    }
    tierInfo.push({ first, count: t.rows, rise: t.rise, t });
  });
  const H = y, D = Math.max(z + 1.2, part.D);
  prof.push([D, y], [D, 0]);
  return { rows, tierInfo, prof, H, D, base, tiers };
}

/**
 * 把看台里静止不动的普通网格按材质合并成一个（混凝土、墙、挑檐、灯带……）：
 * 一座看台从几十上百次绘制调用降到十几次，对低配手机帮助最大。
 * 座位（实例化）、远景条带、点击区域（不可见）等需要单独控制的对象不合并。
 */
function mergeStatic(g, keep) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), m = new THREE.Matrix4();
  const groups = new Map();
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || keep.has(o) || !o.visible || Array.isArray(o.material)) return;
    const geo = o.geometry;
    const key = o.material.uuid + '|' + Object.keys(geo.attributes).sort().join(',') + '|' + (geo.index ? 'i' : 'n');
    if (!groups.has(key)) groups.set(key, { mat: o.material, list: [], cast: false, recv: false, order: o.renderOrder });
    const e = groups.get(key);
    e.list.push(o); e.cast ||= o.castShadow; e.recv ||= o.receiveShadow;
  });
  for (const e of groups.values()) {
    if (e.list.length < 2) continue;
    const geos = e.list.map((o) => o.geometry.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    for (const o of e.list) { o.parent.remove(o); o.geometry.dispose(); }
    const mm = new THREE.Mesh(merged, e.mat);
    mm.castShadow = e.cast; mm.receiveShadow = e.recv; mm.renderOrder = e.order;
    g.add(mm);
  }
}

/** 弧形看台相邻两段之间的扇形填充：看台剖面绕接缝竖轴旋转，台阶与两侧直段对齐 */
function buildFans(spec, parts, mats) {
  const geos = [];
  for (let i = 1; i < parts.length; i++) {
    const p0 = parts[i - 1], p1 = parts[i];
    if (!p0.a || !p1.a || p0.chain !== p1.chain) continue;
    const lay = layoutRows(spec, p1);
    const r0 = frameOf(p0).rotY, r1 = frameOf(p1).rotY;
    let d = r1 - r0; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 1e-3) continue;
    const g = new THREE.LatheGeometry(lay.prof.map(([z, y]) => new THREE.Vector2(Math.max(0, z), y)), Math.max(2, Math.ceil(Math.abs(d) / 0.08)), d > 0 ? r0 : r1, Math.abs(d));
    const j = p0.b; // 两段共用的前沿接缝点
    g.translate(j[0], 0, -j[1]);
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), mats.concrete.clone());
  m.material.side = THREE.DoubleSide;
  m.castShadow = m.receiveShadow = true;
  return m;
}

function buildSeatPart(spec, part, pi, ctx) {
  const { mats, seats, base, rot, partOf, blocks, blockMap } = ctx;
  const { front, f, rotY } = frameOf(part);
  const G = new THREE.Group();
  G.position.copy(front); G.rotation.y = rotY;
  G.updateMatrixWorld(true);
  const L = part.L;
  const lay = layoutRows(spec, part);
  const { rows, tierInfo, H, D } = lay;

  // 混凝土阶梯
  const body = new THREE.Mesh(extrudeProfile(lay.prof, L), mats.concrete);
  body.castShadow = body.receiveShadow = true;
  G.add(body);
  // 后墙与立面
  if (spec.realMain) {
    buildMainRear(G, L, D, H, mats, spec);
  } else {
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(L, H + 1.4, 0.4), mats.white);
    backWall.position.set(0, (H + 1.4) / 2, D - 0.2);
    backWall.castShadow = true;
    G.add(backWall);
  }
  if (H > 10 && !spec.realMain) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 2.2, 0.15), mats.glass);
    band.position.set(0, H * 0.45, D + 0.02);
    G.add(band);
  }
  // 两端侧墙（弧形看台内部的接缝处不要侧墙，由扇形填充连起来）
  for (const sx of [-1, 1]) {
    if (part.a && ((sx < 0 && !part.first) || (sx > 0 && !part.last))) continue;
    const side = new THREE.Mesh(extrudeProfile(lay.prof, 0.35), mats.white);
    side.position.x = sx * (L / 2 + 0.17);
    side.castShadow = true;
    G.add(side);
  }
  // 前沿挡墙（看台标识色）
  const zoneColor = spec.zones[lay.tiers[0].zone].color;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(L, lay.base - 0.1, 0.3), ctx.colorMat(zoneColor));
  wall.position.set(0, (lay.base - 0.1) / 2, -0.15);
  G.add(wall);
  // 层间挑檐：深色饰面 + 灯带
  tierInfo.forEach((ti, k) => {
    if (ti.lipZ === undefined) return;
    if (spec.realMain) {
      // 两层之间的包厢层：通长玻璃带 + 竖梃 + 上方灯带（施工报道：24 个大小包厢）
      const lift = lay.tiers[k + 1].lift ?? 3;
      const glassBand = new THREE.Mesh(new THREE.BoxGeometry(L, lift - 0.5, 0.12), mats.vipGlass);
      glassBand.position.set(0, ti.lipY + 0.25 + (lift - 0.5) / 2, ti.lipZ - 0.06);
      G.add(glassBand);
      for (let x = -L / 2; x <= L / 2 + 0.01; x += 2.0) ctx.rails.seg(G, [x, ti.lipY + 0.2, ti.lipZ - 0.12], [x, ti.lipY + lift - 0.2, ti.lipZ - 0.12], 0.045);
      const led = new THREE.Mesh(new THREE.BoxGeometry(L, 0.28, 0.2), mats.led);
      led.position.set(0, ti.lipY + lift - 0.1, ti.lipZ - 0.1);
      G.add(led);
      return;
    }
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(L, 1.4, 0.3), mats.dark);
    fascia.position.set(0, ti.lipY + 2.2, ti.lipZ - 0.15);
    const led = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.32), mats.led);
    led.position.set(0, ti.lipY + 1.3, ti.lipZ - 0.15);
    G.add(fascia, led);
  });

  // 座位槽位：过道每 28 座一条
  const slotsTotal = Math.floor((L - 1.2) / PITCH);
  const per = BLOCK + AISLE;
  let nSlots = slotsTotal;
  const rem = slotsTotal % per;
  if (rem > 0 && rem < 8 && slotsTotal > per) nSlots = slotsTotal - rem; // 太窄的零头不设座
  const x0 = -(nSlots * PITCH) / 2;
  const rails = ctx.rails;
  // 看台哪一端靠近 1 号弯：用于按官方座位图放置铂金区
  const [, t1x, t1n] = TURNS.find((tt) => tt[0] === 1);
  const t1 = V(t1x, t1n);
  const endPlus = new THREE.Vector3(L / 2, 0, 0).applyMatrix4(G.matrixWorld), endMinus = new THREE.Vector3(-L / 2, 0, 0).applyMatrix4(G.matrixWorld);
  const plusIsT1 = endPlus.distanceTo(t1) < endMinus.distanceTo(t1);

  const pick = { inv: G.matrixWorld.clone().invert(), tiers: [] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(UP, rotY), v = new THREE.Vector3();
  const rand = ctx.rand;
  tierInfo.forEach((ti, k) => {
    const t = ti.t;
    const index = new Int32Array(ti.count * nSlots).fill(-1);
    const r0 = rows[ti.first];
    pick.tiers.push({ z0: r0.z, y0: r0.y + 0.45, k: ti.rise / ROW_D, rows: ti.count, nSlots, x0, index });
    for (let r = 0; r < ti.count; r++) {
      const row = rows[ti.first + r];
      let num = 0; // 面向赛道时从左往右数
      let runZone = null, runStart = 0;
      const flushRun = (endSlot) => {
        if (runZone === null) return;
        const xa = x0 + runStart * PITCH, xb = x0 + endSlot * PITCH;
        ctx.carpet.push({ G, xa, xb, y: row.y + 0.55, z0: row.z - ROW_D * 0.45, z1: row.z + ROW_D * 0.45, color: spec.zones[runZone].color });
      };
      for (let s = 0; s < nSlots; s++) {
        if (s % per >= BLOCK) continue;
        num++;
        // 票区：铂金区按“距 1 号弯一端的比例”判定，其余为该层的票区
        const fromT1 = plusIsT1 ? 1 - (s + 0.5) / nSlots : (s + 0.5) / nSlots;
        const c = t.center;
        const zone = c && fromT1 >= c.fromT1 && fromT1 <= c.toT1 ? c.zone : t.zone;
        const side = c && zone !== c.zone ? (fromT1 < c.fromT1 ? 't1' : 't16') : '';
        if (zone !== runZone) { flushRun(s); runZone = zone; runStart = s; }
        const key = pi + ':' + k + ':' + zone + ':' + side;
        let b = blockMap.get(key);
        if (!b) {
          b = { idx: blocks.length, code: spec.zones[zone].name, side, tier: k, zone, count: 0, sum: new THREE.Vector3(), top: 0, part: pi };
          blockMap.set(key, b);
          blocks.push(b);
        }
        const lx = x0 + (s + 0.5) * PITCH;
        v.set(lx, row.y, row.z).applyMatrix4(G.matrixWorld);
        b.count++; b.sum.add(v); b.top = Math.max(b.top, v.y);
        index[r * nSlots + s] = seats.length;
        seats.push({ zone, block: b.idx, row: r + 1, num, tier: k, part: pi, j: rand() });
        base.push(v.x, v.y, v.z);
        rot.push(rotY);
      }
      flushRun(nSlots);
    }
    // 过道扶手：每条过道中线一根，顺着台阶斜向上；每级台阶前沿一条黄色防滑边
    const rLast = rows[ti.first + ti.count - 1];
    for (let s = BLOCK; s < nSlots; s += per) {
      const ax = x0 + (s + AISLE / 2) * PITCH;
      for (let r = 0; r < ti.count; r++) {
        const rr = rows[ti.first + r];
        ctx.nosing.push(new THREE.Matrix4().makeTranslation(ax, rr.y + 0.012, rr.z - ROW_D * 0.5 + 0.04).premultiply(G.matrixWorld));
      }
      rails.seg(G, [ax, r0.y + 1.0, r0.z - 0.3], [ax, rLast.y + 1.0, rLast.z + 0.3], 0.05);
      for (let r = 0; r < ti.count; r += 4) {
        const rr = rows[ti.first + r];
        rails.seg(G, [ax, rr.y, rr.z], [ax, rr.y + 1.0, rr.z], 0.04);
      }
    }
    // 每层前沿栏杆
    const fy = (k === 0 ? lay.base : tierInfo[k - 1].lipY + (lay.tiers[k].lift ?? 3)) + 1.05;
    const fz = r0.z - ROW_D * 0.5 - 0.05;
    rails.seg(G, [-L / 2, fy, fz], [L / 2, fy, fz], 0.05);
    for (let x = -L / 2; x <= L / 2 + 0.01; x += 2.4) rails.seg(G, [x, fy - 1.05, fz], [x, fy, fz], 0.04);
    ctx.glassPanels.push({ G, L, y: fy - 0.55, z: fz + 0.03 });
  });
  // 后排栏杆
  rails.seg(G, [-L / 2, H + 1.4 + 1.0, D - 0.3], [L / 2, H + 1.4 + 1.0, D - 0.3], 0.05);
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 2.4) rails.seg(G, [x, H + 1.4, D - 0.3], [x, H + 2.4, D - 0.3], 0.04);

  // 拾取用碰撞盒
  const hb = new THREE.Mesh(new THREE.BoxGeometry(L, H + 10, D), ctx.hitMat);
  hb.position.set(0, (H + 10) / 2, D / 2);
  hb.visible = false;
  hb.userData.standId = spec.id;
  G.add(hb);
  ctx.hitboxes.push(hb);

  if (spec.realMain && spec.roofBottom) buildMainRoofUnderside(G, Math.min(L, spec.roofLength ?? L), D, spec.roofBottom, mats, ctx);
  partOf.push({ f, rotY, front, L, D, H, G, pick });
  return G;
}

/** 主看台后立面：外露的灰色混凝土框架（约 8 m 柱网）+ 16 部外部楼梯间 + 不锈钢网板（据实拍照片与施工报道） */
function buildMainRear(G, L, D, H, mats, spec) {
  const top = H + 1.4;
  // 框架后的深色内凹面，让框架显得是“透空”的
  const recess = new THREE.Mesh(new THREE.BoxGeometry(L, top, 0.3), mats.dark);
  recess.position.set(0, top / 2, D - 2.6);
  G.add(recess);
  // 柱：约 8 m 一根（施工报道：底层约 250 根柱，间距约 8 m）
  const nCol = Math.round(L / 8);
  const colGeo = new THREE.BoxGeometry(1.1, top, 1.1);
  const cols = new THREE.InstancedMesh(colGeo, mats.frame, nCol + 1);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i <= nCol; i++) cols.setMatrixAt(i, m4.makeTranslation(-L / 2 + (i * L) / nCol, top / 2, D - 0.55));
  cols.castShadow = true;
  G.add(cols);
  // 楼层梁：与座位分层对应
  for (const y of [2.74, 7.4, 12.1, 15.6, 21.3, top - 0.4]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(L, 0.75, 1.3), mats.frame);
    beam.position.set(0, y, D - 0.65);
    G.add(beam);
  }
  // 16 部外部楼梯间：向外凸出的竖向楼梯塔，正面挂不锈钢网板
  const nStair = 16;
  for (let i = 0; i < nStair; i++) {
    const x = -L / 2 + ((i + 0.5) * L) / nStair;
    const core = new THREE.Mesh(new THREE.BoxGeometry(6.5, top + 2.5, 5), mats.frame);
    core.position.set(x, (top + 2.5) / 2, D + 2.4);
    core.castShadow = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, top + 1), mats.steelMesh);
    mesh.position.set(x, (top + 1) / 2 + 0.6, D + 4.95);
    G.add(core, mesh);
  }
}

/** 主看台顶棚底面：43 根钢柱（施工方案：12.72–28 m 区段钢柱 43 根）+ 红黄圆盘 + 前沿灯具 */
function buildMainRoofUnderside(G, L, D, roofBottom, mats, ctx) {
  const n = 43;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + ((i + 0.5) * L) / n;
    ctx.rails.seg(G, [x, 12.7, D + 0.6], [x, roofBottom, D + 0.6], 0.42);
  }
  // 顶棚底面的红、黄圆盘（实拍照片可见；“灯笼”寓意来自单一来源，未证实）
  const disc = new THREE.CircleGeometry(2.2, 32);
  disc.rotateX(Math.PI / 2); // 朝下
  const red = new THREE.InstancedMesh(disc, mats.discRed, 64), yel = new THREE.InstancedMesh(disc, mats.discYellow, 64);
  let nr = 0, ny = 0;
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let x = -L / 2 + 8, k = 0; x < L / 2 - 4; x += 14, k++) {
    for (const [z, alt] of [[9, 0], [24, 1]]) {
      v.set(x + (alt ? 7 : 0), roofBottom - 0.06, z).applyMatrix4(G.matrixWorld);
      m4.makeTranslation(v.x, v.y, v.z);
      if ((k + alt) % 2 === 0 && nr < 64) red.setMatrixAt(nr++, m4); else if (ny < 64) yel.setMatrixAt(ny++, m4);
    }
  }
  red.count = nr; yel.count = ny;
  ctx.extra.push(red, yel);
  // 顶棚前沿下方的照明灯具
  for (let x = -L / 2 + 5; x < L / 2; x += 10) ctx.rails.seg(G, [x - 0.6, roofBottom - 0.35, 3], [x + 0.6, roofBottom - 0.35, 3], 0.2);
}

/** 圆柱/细杆批量实例化：rails.seg(G, a, b, r) 在组 G 的局部坐标中画一段 */
function railBatcher(mat) {
  const list = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), m = new THREE.Matrix4();
  return {
    seg(G, pa, pb, r) {
      a.set(...pa).applyMatrix4(G.matrixWorld); b.set(...pb).applyMatrix4(G.matrixWorld);
      d.subVectors(b, a); const len = d.length(); if (len < 1e-3) return;
      q.setFromUnitVectors(UP, d.divideScalar(len));
      s.set(r * 2, len, r * 2);
      list.push(m.compose(a.clone().lerp(b, 0.5), q, s).clone());
    },
    build() {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.frustumCulled = false;
      return im;
    },
  };
}

function buildSeatStand(spec, mats, seatGeo, common) {
  const g = new THREE.Group();
  const ctx = {
    mats, seats: [], base: [], rot: [], partOf: [], blocks: [], blockMap: new Map(),
    rand: rng(spec.id.charCodeAt(0) * 7919),
    rails: railBatcher(mats.steel), glassPanels: [], nosing: [], carpet: [], extra: [], hitboxes: common.hitboxes, hitMat: common.hitMat, colorMat: common.colorMat,
  };
  const parts = spec.curve ? curveParts(OSM_STANDS[spec.id]) : OSM_STANDS[spec.id];
  parts.forEach((part, pi) => g.add(buildSeatPart(spec, part, pi, ctx)));
  if (spec.curve) g.add(buildFans(spec, parts, mats));
  g.add(ctx.rails.build());
  ctx.extra.forEach((m) => g.add(m));
  // 栏杆玻璃面板（合并成一个网格）
  const panels = ctx.glassPanels.map(({ G, L, y, z }) => {
    const geo = new THREE.PlaneGeometry(L, 1.0);
    geo.translate(0, y, z);
    return geo.applyMatrix4(G.matrixWorld);
  });
  if (panels.length) g.add(new THREE.Mesh(mergeGeometries(panels), mats.glassRail));

  const { seats, base, rot, blocks } = ctx;
  const mesh = new THREE.InstancedMesh(seatGeo, mats.seat, seats.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const col = new THREE.Color();
  seats.forEach((st, i) => {
    q.setFromAxisAngle(UP, rot[i]);
    mesh.setMatrixAt(i, m4.compose(p.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]), q, one));
    mesh.setColorAt(i, seatColor(spec, st, col));
  });
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  g.add(mesh);
  // 远景替身：每排一条按票区上色的座面条带（几百个三角形），镜头靠近时才显示逐个座位
  const cp = [], cc = [], c3 = new THREE.Color(), vv = new THREE.Vector3();
  for (const r of ctx.carpet) {
    c3.set(r.color);
    const quad = [[r.xa, r.z0], [r.xb, r.z0], [r.xb, r.z1], [r.xa, r.z0], [r.xb, r.z1], [r.xa, r.z1]];
    for (const [x, z] of quad) { vv.set(x, r.y, z).applyMatrix4(r.G.matrixWorld); cp.push(vv.x, vv.y, vv.z); cc.push(c3.r, c3.g, c3.b); }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  cg.computeVertexNormals();
  const carpet = new THREE.Mesh(cg, mats.carpet);
  carpet.visible = false;
  g.add(carpet);
  // 台阶防滑边
  const nose = new THREE.InstancedMesh(new THREE.BoxGeometry(AISLE * PITCH - 0.1, 0.025, 0.07), mats.nosing, ctx.nosing.length);
  ctx.nosing.forEach((m, i) => nose.setMatrixAt(i, m));
  nose.frustumCulled = false;
  g.add(nose);
  blocks.forEach((b) => {
    b.center = b.sum.multiplyScalar(1 / b.count);
    b.label = new THREE.Vector3(b.center.x, b.top + 4.5, b.center.z);
    b.f = ctx.partOf[b.part].f;
  });

  mergeStatic(g, new Set([mesh, carpet, nose]));
  const s = { g, mesh, seats, base: new Float32Array(base), rot: new Float32Array(rot), blocks, parts: ctx.partOf, carpet };
  s.pickSeat = (ray) => pickSeat(s, ray);
  return s;
}

const _r = new THREE.Ray();
function pickSeat(s, ray) {
  let best = -1, bt = Infinity;
  for (const part of s.parts) {
    _r.copy(ray).applyMatrix4(part.pick.inv);
    const o = _r.origin, d = _r.direction;
    for (const t of part.pick.tiers) {
      const den = d.y - d.z * t.k;
      if (Math.abs(den) < 1e-6) continue;
      const tt = (t.y0 + (o.z - t.z0) * t.k - o.y) / den;
      if (tt <= 0 || tt >= bt) continue;
      const x = o.x + d.x * tt, z = o.z + d.z * tt;
      const r = Math.round((z - t.z0) / ROW_D);
      if (r < 0 || r >= t.rows) continue;
      const sl = Math.floor((x - t.x0) / PITCH);
      if (sl < 0 || sl >= t.nSlots) continue;
      const idx = t.index[r * t.nSlots + sl];
      if (idx >= 0) { best = idx; bt = tt; }
    }
  }
  return best;
}

/** 座位实例矩阵（高亮/选中时放大、抬高） */
export function seatMatrix(s, i, scale, lift, out) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, s.rot[i]);
  return out.compose(new THREE.Vector3(s.base[i * 3], s.base[i * 3 + 1] + lift, s.base[i * 3 + 2]), q, new THREE.Vector3(scale, scale, scale));
}
export const seatWorld = (s, i) => new THREE.Vector3(s.base[i * 3], s.base[i * 3 + 1], s.base[i * 3 + 2]);
export const seatFacing = (s, i) => s.parts[s.seats[i].part].f;

/** 座位颜色 = 官方票区颜色（带一点随机明暗，避免看起来像一整块色板） */
export function seatColor(spec, s, out = new THREE.Color()) {
  return out.set(spec.zones[s.zone].color).offsetHSL(0, 0, (s.j - 0.5) * 0.06);
}

// ── 草地看台：按真实轮廓堆出草坡，四周围栏，坡上散布观众 ──
function polyShape(flatPts) {
  const sh = new THREE.Shape();
  for (let i = 0; i < flatPts.length; i += 2) (i ? sh.lineTo(flatPts[i], flatPts[i + 1]) : sh.moveTo(flatPts[i], flatPts[i + 1]));
  return sh;
}
function insidePoly(x, n, p) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > n) !== (p[j + 1] > n) && x < ((p[j] - p[i]) * (n - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
}
/**
 * 草地看台上零星的观众（每 400 m² 约 1 人，F 约 30 人、J 约 30 人），面朝赛道，有站有坐。
 * 三个实例化网格（衣服 / 裤子 / 头）共 3 次绘制调用，开销可以忽略。
 */
const PEOPLE = { shirt: null, legs: null, head: null };
function peopleGeos() {
  if (PEOPLE.shirt) return PEOPLE;
  PEOPLE.shirt = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 6).translate(0, 1.2, 0);
  PEOPLE.legs = new THREE.CylinderGeometry(0.15, 0.12, 0.88, 6).translate(0, 0.44, 0);
  PEOPLE.head = new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.66, 0);
  return PEOPLE;
}
function addGrassFans(g, part, spec) {
  const p = part.poly, N = p.length / 2;
  let A = 0, x0 = Infinity, x1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N; A += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    x0 = Math.min(x0, p[i * 2]); x1 = Math.max(x1, p[i * 2]); n0 = Math.min(n0, p[i * 2 + 1]); n1 = Math.max(n1, p[i * 2 + 1]);
  }
  const count = Math.min(40, Math.round(Math.abs(A / 2) / 400));
  const rand = rng(spec.id.charCodeAt(0) * 131);
  const spots = [];
  for (let k = 0, guard = 0; spots.length < count && guard < count * 60; guard++) {
    // 观众多聚在靠赛道的前半部分，三五成群
    const cx = x0 + rand() * (x1 - x0), cn = n0 + rand() * (n1 - n0);
    if (!insidePoly(cx, cn, p) || trackDist(cx, cn) > 60) continue;
    const grp = 1 + Math.floor(rand() * 4);
    for (let q = 0; q < grp && spots.length < count; q++) {
      const x = cx + (rand() - 0.5) * 3, n = cn + (rand() - 0.5) * 3;
      if (insidePoly(x, n, p)) spots.push([x, n]);
    }
  }
  if (!spots.length) return;
  const G = peopleGeos();
  const skin = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b'];
  const tees = ['#e10600', '#ff8000', '#1e5bc6', '#27f4d2', '#f5c518', '#ffffff', '#1b1b1f', '#2fae66', '#ff87bc', '#64c4ff'];
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, spots.length); m.castShadow = true; return m; };
  const shirt = mk(G.shirt, floodlit(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0.3));
  const legs = mk(G.legs, std('#2b3240', { roughness: 0.9 }, 0.2));
  const head = mk(G.head, floodlit(new THREE.MeshStandardMaterial({ roughness: 0.7 }), 0.3));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), c = new THREE.Color();
  const fx = part.f[0], fn = part.f[1];
  spots.forEach(([x, n], i) => {
    const sit = rand() < 0.55;                                           // 一半以上坐在草坡上
    const yaw = Math.atan2(fx, -fn) + (rand() - 0.5) * 0.9;              // 大致面朝赛道
    q4.setFromAxisAngle(UP, yaw);
    const h = 0.92 + rand() * 0.16;
    s3.set(h, sit ? h * 0.62 : h, h);
    m4.compose(v3.set(x, 1.5, -n), q4, s3);
    shirt.setMatrixAt(i, m4); legs.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
    shirt.setColorAt(i, c.set(tees[Math.floor(rand() * tees.length)]));
    head.setColorAt(i, c.set(skin[Math.floor(rand() * skin.length)]));
  });
  g.add(shirt, legs, head);
}

function buildGrass(spec, mats, common) {
  const g = new THREE.Group();
  const part = OSM_STANDS[spec.id][0];
  const { f, rotY } = frameOf(part);
  const geo = new THREE.ExtrudeGeometry(polyShape(part.poly), { depth: 0.6, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 2.5, bevelSegments: 3, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  const mound = new THREE.Mesh(geo, mats.grass);
  mound.castShadow = mound.receiveShadow = true;
  g.add(mound);
  const rails = railBatcher(mats.steel);
  const G0 = new THREE.Group(); G0.updateMatrixWorld(true);
  // 围栏：沿轮廓外扩 3 m
  const p = part.poly, nPts = p.length / 2;
  let cx = 0, cn = 0; for (let i = 0; i < p.length; i += 2) { cx += p[i]; cn += p[i + 1]; } cx /= nPts; cn /= nPts;
  const fencePanels = [];
  for (let i = 0; i < nPts; i++) {
    const ax = p[i * 2], an = p[i * 2 + 1], bx = p[((i + 1) % nPts) * 2], bn = p[((i + 1) % nPts) * 2 + 1];
    const grow = (x, n) => { const dx = x - cx, dn = n - cn, l = Math.hypot(dx, dn) || 1; return [x + (dx / l) * 3, n + (dn / l) * 3]; };
    const [x1, n1] = grow(ax, an), [x2, n2] = grow(bx, bn);
    const len = Math.hypot(x2 - x1, n2 - n1);
    rails.seg(G0, [x1, 1.15, -n1], [x2, 1.15, -n2], 0.03);
    rails.seg(G0, [x1, 0.15, -n1], [x2, 0.15, -n2], 0.03);
    for (let k = 0; k <= len; k += 2.5) {
      const t = k / len, x = x1 + (x2 - x1) * t, n = n1 + (n2 - n1) * t;
      rails.seg(G0, [x, 0, -n], [x, 1.2, -n], 0.035);
    }
    const pg = new THREE.PlaneGeometry(len, 1.0);
    pg.rotateY(-Math.atan2(-(n2 - n1), x2 - x1));
    pg.translate((x1 + x2) / 2, 0.65, -(n1 + n2) / 2);
    fencePanels.push(pg);
  }
  g.add(rails.build(), new THREE.Mesh(mergeGeometries(fencePanels), mats.fenceMesh));
  addGrassFans(g, part, spec);
  let x0 = Infinity, x1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); n0 = Math.min(n0, p[i + 1]); n1 = Math.max(n1, p[i + 1]); }
  // 前沿标识牌
  // 标识牌放在真实轮廓上离赛道最近的那条边的外侧（不规则草坡的外接矩形前沿可能悬在空地上）
  let bi = 0, bd = Infinity;
  for (let i = 0; i < nPts; i++) {
    const mx = (p[i * 2] + p[((i + 1) % nPts) * 2]) / 2, mn = (p[i * 2 + 1] + p[((i + 1) % nPts) * 2 + 1]) / 2;
    const segLen = Math.hypot(p[((i + 1) % nPts) * 2] - p[i * 2], p[((i + 1) % nPts) * 2 + 1] - p[i * 2 + 1]);
    if (segLen < 8) continue;
    const d = trackDist(mx, mn);
    if (d < bd) { bd = d; bi = i; }
  }
  const ax = p[bi * 2], an = p[bi * 2 + 1], bx = p[((bi + 1) % nPts) * 2], bn = p[((bi + 1) % nPts) * 2 + 1];
  const eLen = Math.hypot(bx - ax, bn - an);
  let ox = -(bn - an) / eLen, on = (bx - ax) / eLen;                       // 边的法向，取朝外（远离草坡中心）
  if (ox * ((ax + bx) / 2 - cx) + on * ((an + bn) / 2 - cn) < 0) { ox = -ox; on = -on; }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(eLen * 0.8, 60), 1.6, 0.2), common.colorMat(spec.zones.g.color));
  sign.position.set((ax + bx) / 2 + ox * 4, 1.2, -((an + bn) / 2 + on * 4));
  sign.rotation.y = Math.atan2(-ox, on);
  g.add(sign);
  // 点击区域：按真实轮廓挤出（不再用外接矩形，避免点到空地也选中）
  const hgeo = new THREE.ExtrudeGeometry(polyShape(part.poly), { depth: 10, bevelEnabled: false });
  hgeo.rotateX(-Math.PI / 2);
  const hb = new THREE.Mesh(hgeo, common.hitMat);
  hb.visible = false; hb.userData.standId = spec.id;
  g.add(hb);
  hb.updateMatrixWorld(true);
  common.hitboxes.push(hb);
  return { g, parts: [{ f, rotY, front: V(part.front[0], part.front[1]), L: part.L, D: part.D, H: 3 }] };
}

/** 没有精确轮廓的票区（C 草地）：只放一个可点击的位置标记，不建模 */
function buildMarker(spec, common) {
  const g = new THREE.Group();
  const at = V(spec.approx[0], spec.approx[1]);
  const ring = new THREE.Mesh(new THREE.RingGeometry(16, 18, 48), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(at.x, 0.3, at.z); ring.renderOrder = -0.5;
  g.add(ring);
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 8, 16), common.hitMat);
  hb.position.set(at.x, 4, at.z); hb.visible = false; hb.userData.standId = spec.id;
  g.add(hb); hb.updateMatrixWorld(true); common.hitboxes.push(hb);
  const f = new THREE.Vector3(-1, 0, 0);
  return { g, parts: [{ f, rotY: 0, front: at.clone(), L: 60, D: 0, H: 2 }] };
}

function buildClub(spec, common) {
  const g = new THREE.Group();
  const part = OSM_STANDS[spec.id][0];
  const { f, rotY } = frameOf(part);
  const c0 = V(part.front[0], part.front[1]).addScaledVector(f, -part.D / 2);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(part.L, 18, part.D), common.hitMat);
  hb.position.set(c0.x, 9, c0.z); hb.rotation.y = rotY; hb.visible = false; hb.userData.standId = spec.id;
  g.add(hb);
  hb.updateMatrixWorld(true);
  common.hitboxes.push(hb);
  return { g, parts: [{ f, rotY, front: V(part.front[0], part.front[1]), L: part.L, D: part.D, H: part.h ?? 12 }] };
}

export function buildStands(scene) {
  const mats = {
    concrete: std('#c4c7cd', { roughness: 0.9 }, 0.2),
    white: std('#c9ced5', { roughness: 0.5, metalness: 0.25 }, 0.18),
    dark: std('#2a2c31', { roughness: 0.6 }, 0.2),
    steel: std('#c9ced6', { roughness: 0.35, metalness: 0.6 }, 0.45),
    glass: lampMat('#7fa6c4', '#ffd9a0', 1.2, { roughness: 0.1, metalness: 0.6 }),
    glassRail: new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    fenceMesh: new THREE.MeshStandardMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    led: lampMat('#ffffff', '#ffffff', 3),
    seat: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.55 }), 0.58),
    nosing: std('#f5c518', { roughness: 0.6 }, 0.7),
    frame: std('#a9adb3', { roughness: 0.85 }, 0.2),                       // 外露混凝土框架（灰）
    vipGlass: lampMat('#4f7286', '#ffd9a0', 1.0, { roughness: 0.08, metalness: 0.7 }),
    steelMesh: new THREE.MeshStandardMaterial({ color: '#cfd4da', metalness: 0.8, roughness: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    discRed: std('#d62a1e', { roughness: 0.5, side: THREE.DoubleSide }, 0.6),
    discYellow: std('#f2b705', { roughness: 0.5, side: THREE.DoubleSide }, 0.6),
    carpet: floodlit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 0.58),
    grass: groundDetail(std('#86ba69', { roughness: 1 }, 0.25), 'grass', { size: 3, k: 0.8 }),
    people: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0.8),
  };
  const colorCache = new Map();
  const common = {
    hitboxes: [], hitMat: new THREE.MeshBasicMaterial(),
    colorMat: (c) => colorCache.get(c) || colorCache.set(c, std(c, { roughness: 0.6 }, 0.8)).get(c),
  };
  const seatGeo = seatGeometry();
  const out = [];
  for (const spec of STANDS) {
    if (!OSM_STANDS[spec.id] && !spec.approx) { console.warn('看台缺少 OSM 轮廓：', spec.id); continue; }
    const s = spec.approx ? buildMarker(spec, common) : spec.type === 'seats' ? buildSeatStand(spec, mats, seatGeo, common) : spec.type === 'grass' ? buildGrass(spec, mats, common) : buildClub(spec, common);
    s.spec = spec;
    scene.add(s.g);
    // 整体框架：中心、朝向、跨度
    const f = new THREE.Vector3();
    const center = new THREE.Vector3();
    let H = 0, D = 0, W = 0;
    for (const p of s.parts) {
      f.addScaledVector(p.f, p.L);
      center.add(p.front.clone().addScaledVector(p.f, -p.D / 2));
      H = Math.max(H, p.H); D = Math.max(D, p.D);
    }
    f.normalize(); center.multiplyScalar(1 / s.parts.length);
    const side = new THREE.Vector3().crossVectors(f, UP);
    let lo = Infinity, hi = -Infinity;
    for (const p of s.parts) for (const sg of [-1, 1]) {
      const pt = p.front.clone().addScaledVector(new THREE.Vector3().crossVectors(p.f, UP), (sg * p.L) / 2);
      const u = pt.sub(center).dot(side); lo = Math.min(lo, u); hi = Math.max(hi, u);
    }
    W = hi - lo;
    s.f = f; s.L = W; s.D = D; s.H = H;
    s.center = center.setY(H * 0.5);
    s.labelPos = s.center.clone().setY(H + (spec.id === 'A' ? 22 : spec.type === 'grass' ? 10 : 18));
    s.radius = W / 2 + 24;
    out.push(s);
  }
  return { stands: out, hitboxes: common.hitboxes };
}
