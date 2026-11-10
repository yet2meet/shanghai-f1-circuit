// 看台：位置与尺寸全部来自 OpenStreetMap 的真实轮廓（OSM_STANDS），座位按真实尺寸排布。
//   座位间距 0.55 m、排距 0.85 m；每 28 个座位设一条 1.1 m 宽的过道，过道之间为一个分区。
// 座位直接放在世界坐标里，点选时按“射线 ∩ 座位斜面”解析出排号与座号，不必逐个检测几万个座位。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STANDS } from './data.js';
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
  const leg = new THREE.BoxGeometry(0.06, 0.4, 0.06); leg.translate(0, 0.2, 0.05);
  return mergeGeometries([pan, back, leg]);
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
  const { mats, seats, base, rot, partOf, blocks, blockMap, single } = ctx;
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
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(L, H + 1.4, 0.4), mats.white);
  backWall.position.set(0, (H + 1.4) / 2, D - 0.2);
  backWall.castShadow = true;
  G.add(backWall);
  if (H > 10) {
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
  tierInfo.forEach((ti) => {
    if (ti.lipZ === undefined) return;
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
  const small = L < 50;
  const rails = ctx.rails;

  const pick = { inv: G.matrixWorld.clone().invert(), tiers: [] };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(UP, rotY), v = new THREE.Vector3();
  const rand = ctx.rand;
  tierInfo.forEach((ti, k) => {
    const t = ti.t;
    const halfRows = Math.ceil(ti.count / 2);
    const index = new Int32Array(ti.count * nSlots).fill(-1);
    const r0 = rows[ti.first];
    pick.tiers.push({ z0: r0.z, y0: r0.y + 0.45, k: ti.rise / ROW_D, rows: ti.count, nSlots, x0, index });
    for (let r = 0; r < ti.count; r++) {
      const row = rows[ti.first + r];
      const band = single && r >= halfRows ? 1 : 0;
      const suffix = t.suffix ?? (single ? 'AB'[band] : '');
      for (let s = 0; s < nSlots; s++) {
        const within = s % per;
        if (within >= BLOCK) continue;
        const bi = Math.floor(s / per);
        const code = small ? part.code + suffix : spec.code === part.code ? `${part.code}${bi + 1}${suffix}` : `${part.code}-${bi + 1}${suffix}`;
        const key = pi + ':' + k + ':' + code;
        let b = blockMap.get(key);
        if (!b) {
          const bx = (s + BLOCK / 2) / nSlots;
          const zone = t.center && bx >= t.center.from && bx <= t.center.to ? t.center.zone : t.zone;
          b = { idx: blocks.length, code, tier: k, band, zone, shade: (blocks.length + band) % 2, count: 0, sum: new THREE.Vector3(), top: 0, part: pi };
          blockMap.set(key, b);
          blocks.push(b);
        }
        const lx = x0 + (s + 0.5) * PITCH;
        v.set(lx, row.y, row.z).applyMatrix4(G.matrixWorld);
        b.count++; b.sum.add(v); b.top = Math.max(b.top, v.y);
        index[r * nSlots + s] = seats.length;
        seats.push({ zone: b.zone, block: b.idx, shade: b.shade, row: r + 1 - (band ? halfRows : 0), num: within + 1, tier: k, part: pi, j: rand() });
        base.push(v.x, v.y, v.z);
        rot.push(rotY);
      }
    }
    // 过道扶手：每条过道中线一根，顺着台阶斜向上
    const rLast = rows[ti.first + ti.count - 1];
    for (let s = BLOCK; s < nSlots; s += per) {
      const ax = x0 + (s + AISLE / 2) * PITCH;
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

  partOf.push({ f, rotY, front, L, D, H, G, pick });
  return G;
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
    single: spec.tiers.length === 1, rand: rng(spec.id.charCodeAt(0) * 7919),
    rails: railBatcher(mats.steel), glassPanels: [], hitboxes: common.hitboxes, hitMat: common.hitMat, colorMat: common.colorMat,
  };
  const parts = OSM_STANDS[spec.id];
  parts.forEach((part, pi) => g.add(buildSeatPart(spec, part, pi, ctx)));
  g.add(ctx.rails.build());
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
  blocks.forEach((b) => {
    b.center = b.sum.multiplyScalar(1 / b.count);
    b.label = new THREE.Vector3(b.center.x, b.top + 4.5, b.center.z);
    b.f = ctx.partOf[b.part].f;
  });

  const s = { g, mesh, seats, base: new Float32Array(base), rot: new Float32Array(rot), blocks, parts: ctx.partOf };
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

/** 座位颜色 = 票价分区颜色，相邻分区深浅交替以便分辨 */
export function seatColor(spec, s, out = new THREE.Color()) {
  return out.set(spec.zones[s.zone].color).offsetHSL(0, 0, (s.shade ? 0.075 : -0.055) + (s.j - 0.5) * 0.05);
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
  // 观众
  const rand = rng(spec.id.charCodeAt(0) * 131);
  let A = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; A += p[i] * p[j + 1] - p[j] * p[i + 1]; } A = Math.abs(A / 2);
  const n = Math.min(1800, Math.round(A / 14));
  let x0 = Infinity, x1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); n0 = Math.min(n0, p[i + 1]); n1 = Math.max(n1, p[i + 1]); }
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.28, 0.9, 2, 6), mats.people, n);
  const mats4 = new THREE.Matrix4(), c = new THREE.Color();
  const palette = ['#ff453a', '#ffd60a', '#0a84ff', '#ffffff', '#30d158', '#ff9f0a', '#1c1c1e', '#bf5af2', '#e8002d', '#27f4d2'];
  let k = 0, guard = 0;
  while (k < n && guard++ < n * 20) {
    const x = x0 + rand() * (x1 - x0), nn = n0 + rand() * (n1 - n0);
    if (!insidePoly(x, nn, p)) continue;
    people.setMatrixAt(k, mats4.makeTranslation(x, 1.5 + 0.73, -nn));
    people.setColorAt(k, c.set(palette[(rand() * palette.length) | 0]));
    k++;
  }
  people.count = k;
  g.add(people);
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
    white: std('#eef0f3', { roughness: 0.6 }, 0.22),
    dark: std('#2a2c31', { roughness: 0.6 }, 0.2),
    steel: std('#c9ced6', { roughness: 0.35, metalness: 0.6 }, 0.45),
    glass: lampMat('#7fa6c4', '#ffd9a0', 1.2, { roughness: 0.1, metalness: 0.6 }),
    glassRail: new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    fenceMesh: new THREE.MeshStandardMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
    led: lampMat('#ffffff', '#ffffff', 3),
    seat: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.55 }), 0.58),
    grass: std('#5fa64a', { roughness: 1 }, 0.5),
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
    if (!OSM_STANDS[spec.id]) { console.warn('看台缺少 OSM 轮廓：', spec.id); continue; }
    const s = spec.type === 'seats' ? buildSeatStand(spec, mats, seatGeo, common) : spec.type === 'grass' ? buildGrass(spec, mats, common) : buildClub(spec, common);
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
