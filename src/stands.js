// 看台：位置与尺寸全部来自 OpenStreetMap 的真实轮廓（OSM_STANDS），座位按真实尺寸排布。
//   座位间距 0.55 m、排距 0.85 m；每 28 个座位设一条 1.1 m 宽的过道（过道只是建模，不代表官方分区）。
// 票区只用官方名称（A铂金 / A上 / A下 / B / H/K / E）；排号、座号是模型内按位置的计数，不是票面座号。
// 座位直接放在世界坐标里，点选时按“射线 ∩ 座位斜面”解析出排号与座号，不必逐个检测几万个座位。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STANDS, TURNS } from './data.js';
import { OSM_STANDS } from './osm-data.js';
import { V, rng, std, floodlit, lampMat, extrudeProfile } from './util.js';

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
  // 两端侧墙
  for (const sx of [-1, 1]) {
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
  const parts = OSM_STANDS[spec.id];
  parts.forEach((part, pi) => g.add(buildSeatPart(spec, part, pi, ctx)));
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
  let x0 = Infinity, x1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); n0 = Math.min(n0, p[i + 1]); n1 = Math.max(n1, p[i + 1]); }
  // 前沿标识牌
  const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(part.L, 60), 1.6, 0.2), common.colorMat(spec.zones.g.color));
  const front = V(part.front[0], part.front[1]).addScaledVector(f, 4);
  sign.position.set(front.x, 1.2, front.z); sign.rotation.y = rotY;
  g.add(sign);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(part.L, 10, part.D), common.hitMat);
  const c0 = V(part.front[0], part.front[1]).addScaledVector(f, -part.D / 2);
  hb.position.set(c0.x, 5, c0.z); hb.rotation.y = rotY; hb.visible = false; hb.userData.standId = spec.id;
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
    grass: std('#86ba69', { roughness: 1 }, 0.25),
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
