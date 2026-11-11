// 由 OpenStreetMap 真实地物生成周边环境：地块、道路（含高架与桥梁）、水系、铁路、树行、围栏、停车场、建筑。
// 地图数据 © OpenStreetMap contributors（ODbL）。
// 唯一的“填充”内容：OSM 只标了住宅区范围、没有逐栋楼的轮廓，这些区域里的楼房是按区域类型生成的示意体块。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM_BUILDINGS, OSM_AREAS, OSM_LINES } from './osm-data.js';
import { rng, std, floodlit, canvasTex, nightEmissives } from './util.js';
import { loft } from './f1car.js';
import { groundDetail } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);

// 平铺地面图层：不写深度、按顺序绘制，彻底避免共面闪烁
function groundMat(color, glow = 0.35, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, ...opts });
  m.depthWrite = false;
  return glow ? floodlit(m, glow) : m;
}
export function asGround(mesh, order) {
  mesh.renderOrder = order;
  mesh.receiveShadow = true;
  mesh.material.depthWrite = false;
  return mesh;
}

function shapeOf(p, holes = []) {
  const s = new THREE.Shape();
  for (let i = 0; i < p.length; i += 2) (i ? s.lineTo(p[i], p[i + 1]) : s.moveTo(p[i], p[i + 1]));
  for (const h of holes) {
    const hp = new THREE.Path();
    for (let i = 0; i < h.length; i += 2) (i ? hp.lineTo(h[i], h[i + 1]) : hp.moveTo(h[i], h[i + 1]));
    s.holes.push(hp);
  }
  return s;
}
function inside(x, n, p) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    if ((p[i + 1] > n) !== (p[j + 1] > n) && x < ((p[j] - p[i]) * (n - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  }
  return c;
}
const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a / 2); };
const bboxOf = (p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); b = Math.min(b, p[i + 1]); d = Math.max(d, p[i + 1]); } return [a, b, c, d]; };
/** 多边形的主方向（最长边） */
function mainAxis(p) {
  let best = 0, ang = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length, dx = p[j] - p[i], dn = p[j + 1] - p[i + 1], l = Math.hypot(dx, dn);
    if (l > best) { best = l; ang = Math.atan2(dn, dx); }
  }
  return ang;
}

/** 折线条带：p 为 [x,n,...]，w 宽，yFn(累计距离, 总长) 给出高度 */
function strip(p, w, yFn = () => 0, off = 0) {
  const N = p.length / 2;
  if (N < 2) return null;
  const dist = [0];
  for (let i = 1; i < N; i++) dist.push(dist[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
  const total = dist[N - 1];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
    let tx = p[b * 2] - p[a * 2], tn = p[b * 2 + 1] - p[a * 2 + 1];
    const tl = Math.hypot(tx, tn) || 1; tx /= tl; tn /= tl;
    // 左法线（x,n 平面），转角处做斜接补偿
    let nx = -tn, nn = tx, k = 1;
    if (i > 0 && i < N - 1) {
      const ax = p[i * 2] - p[i * 2 - 2], an = p[i * 2 + 1] - p[i * 2 - 1], al = Math.hypot(ax, an) || 1;
      const cos = (ax / al) * tx + (an / al) * tn;
      k = 1 / Math.max(0.5, Math.sqrt((1 + cos) / 2));
    }
    const y = yFn(dist[i], total);
    const x = p[i * 2], n = p[i * 2 + 1];
    for (const s of [1, -1]) {
      const o = off + (s * w * k) / 2;
      pos.push(x + nx * o, y, -(n + nn * o));
      uv.push(dist[i] / 4, s > 0 ? 0 : 1);
    }
    if (i) { const q = i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); } // 朝上的面（之前朝下，被背面剔除）
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.total = total;
  return g;
}
/** 折线竖墙（护栏、桥梁侧墙、围栏网） */
function wallAlong(p, h, yFn = () => 0, off = 0) {
  const N = p.length / 2;
  const pos = [], idx = [];
  let d = 0;
  for (let i = 0; i < N; i++) {
    if (i) d += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
    let tx = p[b * 2] - p[a * 2], tn = p[b * 2 + 1] - p[a * 2 + 1];
    const tl = Math.hypot(tx, tn) || 1; tx /= tl; tn /= tl;
    const x = p[i * 2] - tn * off, n = p[i * 2 + 1] + tx * off, y = yFn(d);
    pos.push(x, y, -n, x, y + h, -n);
    if (i) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** 沿折线按间距取点：回调 (x, n, 切向角, 累计距离) */
function along(p, step, cb, start = 0) {
  let carry = start, d0 = 0;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    const ax = p[i * 2], an = p[i * 2 + 1], bx = p[i * 2 + 2], bn = p[i * 2 + 3];
    const l = Math.hypot(bx - ax, bn - an);
    let t = carry;
    for (; t < l; t += step) cb(ax + ((bx - ax) * t) / l, an + ((bn - an) * t) / l, Math.atan2(bn - an, bx - ax), d0 + t);
    carry = t - l; d0 += l;
  }
}
/** 把 ExtrudeGeometry 拆成 顶面/侧面 两份，分别用屋顶和外墙材质 */
function splitCapsSides(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = [];
  for (const grp of g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count }]) {
    const part = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name];
      part.setAttribute(name, new THREE.Float32BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
    }
    out.push(part);
  }
  return out;
}

/** 侧墙 UV 以米计：u 沿墙面水平方向，v 为离地高度（减去 base），便于贴按层高绘制的立面贴图 */
function wallUV(g, base = 0) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    const nx = nor[i * 3], nz = nor[i * 3 + 2], L = Math.hypot(nx, nz) || 1;
    uv[i * 2] = pos[i * 3] * (-nz / L) + pos[i * 3 + 2] * (nx / L);
    uv[i * 2 + 1] = pos[i * 3 + 1] - base;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** 把非索引几何按法线朝上 / 朝下拆成两份（顶面、底面） */
function splitUpDown(g) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv?.array;
  const up = { p: [], n: [], u: [] }, dn = { p: [], n: [], u: [] };
  for (let i = 0; i < pos.length / 9; i++) {
    const o = nor[i * 9 + 1] < 0 ? dn : up;
    o.p.push(...pos.slice(i * 9, i * 9 + 9)); o.n.push(...nor.slice(i * 9, i * 9 + 9));
    if (uv) o.u.push(...uv.slice(i * 6, i * 6 + 6));
  }
  return [up, dn].map((o) => {
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    b.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    if (uv) b.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    return b;
  });
}

function windowTexture(wall, glass, lit) {
  return canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = wall; c.fillRect(0, 0, w, h);
    c.fillStyle = glass; c.fillRect(10, 18, 44, 30);
    if (lit) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = Math.random() < 0.6 ? '#fff' : '#555'; c.fillRect(10, 18, 44, 30); }
  });
}

/** 多边形主方向（主成分）：返回中心、长轴单位向量、长度、宽度 */
function principal(p) {
  let cx = 0, cn = 0; const N = p.length / 2;
  for (let i = 0; i < p.length; i += 2) { cx += p[i]; cn += p[i + 1]; }
  cx /= N; cn /= N;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < p.length; i += 2) { const dx = p[i] - cx, dy = p[i + 1] - cn; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(ang), un = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const dx = p[i] - cx, dy = p[i + 1] - cn, u = dx * ux + dy * un, v = -dx * un + dy * ux;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return { cx: cx + ux * um - un * vm, cn: cn + un * um + ux * vm, ux, un, L: u1 - u0, W: v1 - v0 };
}

let MAT_REF = null;
/** “翼”：沿长轴放样的梭形体 + 玻璃带 + 眼形窗 */
function buildWing(b, put) {
  const M = MAT_REF;
  const P = principal(b.p);
  const H = Math.max(4, b.h - b.m);
  const yMid = b.m + H * 0.5;
  const n = 40;
  const skin = [], band = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t);
    const w = Math.max(0.15, P.W * 0.5 * Math.pow(s, 0.55) * 2);        // 平面：两端尖
    const h = Math.max(0.12, H * Math.pow(s, 0.85));                      // 立面：中部最厚
    const z = (t - 0.5) * P.L;
    skin.push({ z, w, h, y: yMid - H * 0.08 * (1 - s), p: 2.3 });
    if (t > 0.16 && t < 0.84) band.push({ z, w: w * 1.012, h: h * 0.3, y: yMid + h * 0.06, p: 2.3 });
  }
  const place = (g) => {
    g.rotateY(Math.atan2(P.ux, -P.un));   // 局部 z 轴对齐长轴（场景中 z = -n）
    g.translate(P.cx, 0, -P.cn);
    return g;
  };
  // loft 的截面沿 -z 方向排列时三角形绕向是反的（外表面朝内，被背面剔除后整只“翼”像是透明的），这里翻转绕向
  const outward = (g) => {
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } }
    else for (const a of Object.values(g.attributes)) {                 // 非索引：交换每个三角形的第 2、3 个顶点
      const s = a.itemSize, arr = a.array;
      for (let v = 0; v < a.count; v += 3) for (let c = 0; c < s; c++) { const k = arr[(v + 1) * s + c]; arr[(v + 1) * s + c] = arr[(v + 2) * s + c]; arr[(v + 2) * s + c] = k; }
    }
    g.computeVertexNormals();
    return g;
  };
  put(M.wingSkin, place(outward(loft(skin, 28))));
  put(M.wingGlass, place(outward(loft(band, 28))));
  // 眼形小窗：两端附近，左右各一
  for (const t of [0.13, 0.87]) {
    const s = Math.sin(Math.PI * t), w = P.W * 0.5 * Math.pow(s, 0.55) * 2, h = H * Math.pow(s, 0.85);
    for (const side of [-1, 1]) {
      const e = new THREE.SphereGeometry(1, 16, 8).toNonIndexed();
      e.scale(0.25, h * 0.16, P.L * 0.045);
      e.translate(side * w * 0.5, yMid + h * 0.05, (t - 0.5) * P.L);
      for (const k of Object.keys(e.attributes)) if (k !== 'position' && k !== 'normal') e.deleteAttribute(k);
      put(M.eye, place(e));
    }
  }
}

export function buildOSM(scene) {
  const rand = rng(9020);
  const root = new THREE.Group();
  root.name = 'osm';
  const treeSpots = [];
  const carSpots = [];

  // ── 地块 ──
  const AREA = {
    farmland: ['#7f9b55', -9], residential: ['#c7c3b8', -8], industrial: ['#bdb8ae', -8], retail: ['#cbc1b2', -8], cemetery: ['#8ca576', -8],
    park: ['#97c47c', -7], grass: ['#9cc782', -7], forest: ['#7aae66', -7], flowerbed: ['#92c377', -6], pitch: ['#86bd6c', -6], trackfield: ['#c9876e', -6],
    parking: ['#c6cad0', -5], plaza: ['#dcdfe3', -5], paved: ['#cfd3d8', -5], gravel: ['#d9bf88', -5], sand: ['#e6cf9c', -5], water: ['#5fa8d2', -4],
  };
  const byKind = {};
  for (const a of OSM_AREAS) {
    if (!AREA[a.k]) continue;
    const g = new THREE.ShapeGeometry(shapeOf(a.p, a.q), 2);
    g.rotateX(-Math.PI / 2);
    (byKind[a.k] ||= []).push(g);
    const A = polyArea(a.p);
    const dens = { forest: 60, park: 220 }[a.k]; // 只在公园、林地种树，草坪保持干净
    if (dens) {
      const [x0, n0, x1, n1] = bboxOf(a.p);
      const n = Math.min(1500, Math.round(A / dens));
      for (let k = 0, guard = 0; k < n && guard < n * 8; guard++) {
        const x = x0 + rand() * (x1 - x0), nn = n0 + rand() * (n1 - n0);
        if (inside(x, nn, a.p) && !a.q.some((h) => inside(x, nn, h))) { treeSpots.push(x, nn, a.k === 'forest' ? 1.15 : 1); k++; }
      }
    }
    if (a.k === 'parking') { // 停车场：只停少量车（约 2.5% 的车位），点缀而不显拥挤
      // 车位：沿停车场主方向排布，2.5 m × 5 m，每两排之间留 6 m 车道
      const ang = mainAxis(a.p), ca = Math.cos(ang), sa = Math.sin(ang);
      const [x0, n0, x1, n1] = bboxOf(a.p);
      const cx = (x0 + x1) / 2, cn = (n0 + n1) / 2, R = Math.hypot(x1 - x0, n1 - n0) / 2;
      for (let v = -R; v < R; v += 16) for (const dv of [-2.5, 2.5]) for (let u = -R; u < R; u += 2.6) {
        const x = cx + u * ca - (v + dv) * sa, nn = cn + u * sa + (v + dv) * ca;
        if (inside(x, nn, a.p) && rand() < 0.025) carSpots.push(x, nn, ang);
      }
    }
  }
  const waterMat = floodlit(new THREE.MeshStandardMaterial({ color: AREA.water[0], roughness: 0.18, metalness: 0.25 }), 0.08);
  waterMat.depthWrite = false;
  for (const [k, list] of Object.entries(byKind)) {
    if (k === 'water') {
      // 景观水池的石砌驳岸（沿水面轮廓的浅色窄带）
      const rims = [];
      for (const a of OSM_AREAS) if (a.k === 'water' && polyArea(a.p) < 20000) { const r = strip([...a.p, a.p[0], a.p[1]], 1.3, () => 0.05); if (r) rims.push(r); }
      if (rims.length) { const rm = new THREE.Mesh(mergeGeometries(rims), groundMat('#d8d2c4', 0.1)); rm.position.y = 0.02; root.add(asGround(rm, -3.9)); }
    }
    const mat = k === 'water' ? waterMat : groundMat(AREA[k][0], 0.08);
    const DETAIL = { grass: 'grass', park: 'grass', forest: 'grass', flowerbed: 'grass', pitch: 'grass', farmland: 'grass', cemetery: 'grass', gravel: 'gravel', sand: 'gravel', parking: 'asphalt', paved: 'asphalt', plaza: 'asphalt' };
    if (DETAIL[k]) groundDetail(mat, DETAIL[k], DETAIL[k] === 'grass' ? { size: 3.5, k: 0.8 } : DETAIL[k] === 'gravel' ? { size: 2.2, k: 1.0, mk: 0.14 } : { size: 4, k: 0.45, mk: 0.12 });
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.position.y = 0.02;
    root.add(asGround(m, AREA[k][1]));
  }

  // ── 线状地物 ──
  const ROAD = {
    motorway: '#9aa0a8', motorway_link: '#9aa0a8', primary: '#9ea4ac', primary_link: '#9ea4ac', secondary: '#a2a8b0', secondary_link: '#a2a8b0',
    tertiary: '#a6acb3', tertiary_link: '#a6acb3', unclassified: '#aab0b7', residential: '#aab0b7', service: '#afb4bb', living_street: '#aab0b7',
    track: '#c2c0b9', footway: '#c9ccd1', path: '#c8c8c3', steps: '#c4c7cc', pedestrian: '#d3d5d9', cycleway: '#c2c5ca',
  };
  const ground = {}, raised = {};
  const dash = [], edge = [];
  const parapets = [], piers = [];
  const railBed = [], rails = [], viaduct = [], viaductWalls = [];
  const waterLines = [], raceways = [], raceLines = [], fences = [];
  for (const l of OSM_LINES) {
    const p = l.p;
    if (l.k.startsWith('road:')) {
      const cls = l.k.slice(5);
      let yFn = () => 0, total = 0;
      for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (l.y > 0) {
        const major = /motorway|primary|secondary|tertiary|unclassified|trunk/.test(cls) && total > 120;
        const H = major ? 6.5 * l.y : 1.0;
        const ramp = major ? Math.min(70, total * 0.3) : Math.min(6, total * 0.3);
        yFn = (d, tot = total) => H * Math.min(1, d / ramp, (tot - d) / ramp) + 0.1;
        const g = strip(p, l.w, yFn);
        if (!g) continue;
        (raised[cls] ||= []).push(g);
        parapets.push(wallAlong(p, 1.0, yFn, l.w / 2), wallAlong(p, 1.0, yFn, -l.w / 2));
        if (major) along(p, 32, (x, n, a, d) => { const h = yFn(d) - 0.6; if (h > 2) piers.push(x, n, h); }, 16);
        if (l.w > 9) { const d = strip(p, 0.25, (dd) => yFn(dd) + 0.03); if (d) dash.push(d); }
        continue;
      }
      const g = strip(p, l.w, () => 0.04);
      if (!g) continue;
      (ground[cls] ||= []).push(g);
      if (l.w > 9) { const d = strip(p, 0.25, () => 0.06); if (d) dash.push(d); }
      if (l.w > 15) for (const s of [1, -1]) { const e = strip(p, 0.2, () => 0.06, s * (l.w / 2 - 0.8)); if (e) edge.push(e); }
    } else if (l.k === 'water') {
      const g = strip(p, l.w, () => 0.03); if (g) waterLines.push(g);
    } else if (l.k === 'rail') {
      if (l.y > 0) {
        const g = strip(p, l.w, () => 9); if (g) viaduct.push(g);
        viaductWalls.push(wallAlong(p, 1.3, () => 9, l.w / 2), wallAlong(p, 1.3, () => 9, -l.w / 2), wallAlong(p, 2.2, () => 6.8, 0));
        along(p, 30, (x, n) => piers.push(x, n, 6.8), 15);
        for (const c of [-2.2, 2.2]) for (const r of [-0.72, 0.72]) { const g2 = strip(p, 0.12, () => 9.15, c + r); if (g2) rails.push(g2); }
      } else {
        const g = strip(p, l.w, () => 0.05); if (g) railBed.push(g);
        for (const c of [-2.2, 2.2]) for (const r of [-0.72, 0.72]) { const g2 = strip(p, 0.12, () => 0.2, c + r); if (g2) rails.push(g2); }
      }
    } else if (l.k === 'raceway') {
      const g = strip(p, l.w, () => 0.06); if (g) raceways.push(g);
      for (const s of [1, -1]) { const e = strip(p, 0.35, () => 0.08, s * (l.w / 2 - 0.4)); if (e) raceLines.push(e); }
    } else if (l.k === 'trees') {
      along(p, 7, (x, n) => treeSpots.push(x, n, 1.1));
    } else if (l.k === 'fence') {
      fences.push(l.p);
    }
  }
  const add = (geos, mat, order, ground = true) => {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    if (ground) asGround(m, order); else { m.receiveShadow = true; m.castShadow = true; }
    root.add(m);
    return m;
  };
  add(waterLines, waterMat, -4);
  for (const [cls, list] of Object.entries(ground)) add(list, groundDetail(groundMat(ROAD[cls] || '#c4c7cc', 0.1), 'asphalt', { size: 3, k: 0.5, mk: 0.12 }), /footway|path|steps|pedestrian|cycleway|track/.test(cls) ? -3.5 : -3);
  const dashTex = canvasTex(64, 8, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, 0, w * 0.5, h); }, [1, 1]);
  const dashMat = new THREE.MeshStandardMaterial({ map: dashTex, transparent: true, alphaTest: 0.5 });
  dashMat.depthWrite = false;
  add(dash.filter((g) => g.attributes.position.array[1] < 1), dashMat, -2.5);
  add(edge, groundMat('#f2f2f2', 0.6), -2.5);
  add(railBed, groundMat('#8b8378', 0.2), -3);
  add(raceways, groundMat('#3b3d42', 0.55), -2.2);
  add(raceLines, groundMat('#f4f4f4', 0.8), -2.1);
  // 高架与桥梁
  const concrete = std('#c9ccd0', { roughness: 0.85, side: THREE.DoubleSide }, 0.35);
  for (const [cls, list] of Object.entries(raised)) add(list, std(ROAD[cls] || '#6b6f76', { roughness: 0.95, side: THREE.DoubleSide }, 0.3), 0, false);
  add(dash.filter((g) => g.attributes.position.array[1] >= 1), dashMat, 0, false);
  add(parapets, concrete, 0, false);
  add(viaduct, concrete, 0, false);
  add(viaductWalls, concrete, 0, false);
  add(rails, std('#4b4d52', { roughness: 0.4, metalness: 0.7 }, 0.2), 0, false);
  if (piers.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, 2.2), concrete, piers.length / 3);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < piers.length / 3; i++) {
      const h = piers[i * 3 + 2] || 6.5;
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(piers[i * 3], h / 2, -piers[i * 3 + 1]), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
    }
    im.castShadow = true;
    root.add(im);
  }
  // 围栏（OSM barrier=fence）
  if (fences.length) {
    const panels = fences.map((p) => wallAlong(p, 2.0));
    root.add(new THREE.Mesh(mergeGeometries(panels), new THREE.MeshStandardMaterial({ color: '#8f99a3', transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
    const posts = [];
    for (const p of fences) along(p, 3, (x, n) => posts.push(x, n));
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 5), std('#8a9098', { metalness: 0.6, roughness: 0.4 }, 0.3), posts.length / 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < posts.length / 2; i++) im.setMatrixAt(i, m4.makeTranslation(posts[i * 2], 1.05, -posts[i * 2 + 1]));
    root.add(im);
  }

  // ── 建筑 ──
  const wallTex = windowTexture('#e7e4dd', '#7d93a6');
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(1 / 3.6, 1 / 3.4);
  const litTex = windowTexture('#000', '#fff', true);
  litTex.wrapS = litTex.wrapT = THREE.RepeatWrapping; litTex.repeat.copy(wallTex.repeat);
  const windowWall = floodlit(new THREE.MeshStandardMaterial({ map: wallTex, emissive: '#ffcf8a', emissiveMap: litTex, emissiveIntensity: 0, roughness: 0.8 }), 0.25);
  nightEmissives.push({ m: windowWall, max: 0.9 });
  const MAT = {
    venue: std('#c4c9d0', { roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide }, 0.16), // 建筑主体：浅银灰
    venueRoof: std('#9aa0a8', { roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }, 0.12), // 屋面：中灰
    membrane: std('#f7f8fa', { roughness: 0.45, side: THREE.DoubleSide }, 0.3),
    steel: std('#d5d9df', { roughness: 0.35, metalness: 0.55 }, 0.45),
    roof: std('#8d939b', { roughness: 0.75 }, 0.25),
    plain: std('#dcd7cd', { roughness: 0.85 }, 0.25),
    industrial: std('#c7ccd3', { roughness: 0.7 }, 0.25),
    industrialRoof: std('#6f8fae', { roughness: 0.6 }, 0.25),
  };
  // 上海赛车场的标志性构件（据施工报道与实拍照片）
  MAT.wingSkin = std('#d3d8de', { roughness: 0.38, metalness: 0.3 }, 0.3);       // “翼”的银白金属外壳
  MAT.wingGlass = new THREE.MeshStandardMaterial({ color: '#3f7f73', roughness: 0.08, metalness: 0.85, emissive: '#ffe2b0', emissiveIntensity: 0 });
  nightEmissives.push({ m: MAT.wingGlass, max: 0.6 });
  MAT.eye = new THREE.MeshStandardMaterial({ color: '#1d2b33', roughness: 0.1, metalness: 0.9 });
  MAT.chinaRed = std('#c8102e', { roughness: 0.45, metalness: 0.15 }, 0.5);          // 看台两端的中国红楼梯塔
  const floorsTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#3f7f86'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9d2d6'; c.fillRect(0, 0, w, 7);          // 楼层板
    c.fillStyle = 'rgba(200,215,220,0.6)'; c.fillRect(0, 0, 3, h); // 竖梃
  });
  floorsTex.wrapS = floorsTex.wrapT = THREE.RepeatWrapping; floorsTex.repeat.set(1 / 2.4, 1 / 3.3);
  const floorsLit = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(4, 12, w - 8, h - 16); });
  floorsLit.wrapS = floorsLit.wrapT = THREE.RepeatWrapping; floorsLit.repeat.copy(floorsTex.repeat);
  MAT.towerGlass = new THREE.MeshStandardMaterial({ map: floorsTex, roughness: 0.1, metalness: 0.7, emissive: '#ffe2b0', emissiveMap: floorsLit, emissiveIntensity: 0 });
  nightEmissives.push({ m: MAT.towerGlass, max: 0.7 });                              // 维修楼一侧的绿蓝色玻璃圆塔
  MAT.roofSteel = std('#c3c8cf', { roughness: 0.4, metalness: 0.5 }, 0.25);            // 主看台悬挑钢顶棚：顶面银灰
  MAT.roofUnder = std('#7d848d', { roughness: 0.55, metalness: 0.35 }, 0.35);           // 底面：深一档的金属吊顶，避免与天空混成一片
  // ── 场内配套建筑的立面（按米贴图：u = 沿墙米数，v = 离地高度）──
  const facade = (tw, th, draw, litDraw, glow = 0.2) => {
    const tex = canvasTex(128, Math.round(128 * th / tw), (c, w, h) => draw(c, w, h));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / tw, 1 / th);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.15 });
    if (litDraw) {
      const lit = canvasTex(128, Math.round(128 * th / tw), (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); litDraw(c, w, h); });
      lit.wrapS = lit.wrapT = THREE.RepeatWrapping; lit.repeat.copy(tex.repeat);
      m.emissive = new THREE.Color('#ffd9a0'); m.emissiveMap = lit; m.emissiveIntensity = 0;
      nightEmissives.push({ m, max: 0.8 });
    }
    return floodlit(m, glow);
  };
  // 一般配套楼：银灰金属板 + 每层一条深色带形窗（层高 3.4 m）
  MAT.service = facade(4, 3.4, (c, w, h) => {
    c.fillStyle = '#cfd3d9'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(0, 0, 2, h);
    c.fillStyle = '#4b5b6a'; c.fillRect(0, h * 0.18, w, h * 0.42);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, h * 0.18, w, h * 0.06);
    c.fillStyle = '#b9bec5'; c.fillRect(w * 0.49, h * 0.18, w * 0.02, h * 0.42);
  }, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, h * 0.2, w, h * 0.38); });
  // 玻璃配套楼（OSM building:material = glass）：通高玻璃幕墙 + 竖梃
  MAT.glassBox = facade(1.6, 3.4, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7fa3b4'); g.addColorStop(1, '#4f6f80');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#dfe4e9'; c.fillRect(0, 0, w * 0.05, h); c.fillRect(0, 0, w, h * 0.05);
  }, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.85); });
  MAT.glassBox.metalness = 0.6; MAT.glassBox.roughness = 0.12;
  // 公共卫生间（OSM amenity = toilets）：白墙、深色门洞、顶部百叶通风带、蓝色标识带 + WC 字样
  MAT.toilet = facade(6, 4.2, (c, w, h) => {
    const y = (m) => h - (m / 4.2) * h;              // 米 → 画布 y（画布顶部 = 墙顶）
    c.fillStyle = '#f1f2f3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#8f98a3'; for (let k = 0; k < 6; k++) c.fillRect(0, y(3.85 - k * 0.12), w, 2);   // 百叶
    c.fillStyle = '#1f6fb2'; c.fillRect(0, y(3.15), w, y(2.6) - y(3.15));                          // 标识带
    c.fillStyle = '#fff'; c.font = '800 ' + Math.round((y(2.6) - y(3.15)) * 0.8) + 'px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('WC', w * 0.5, (y(3.15) + y(2.6)) / 2 + 1);
    c.beginPath(); c.arc(w * 0.25, y(3.0), 2.4, 0, 7); c.arc(w * 0.75, y(3.0), 2.4, 0, 7); c.fill();          // 男女图标
    c.fillRect(w * 0.25 - 2, y(2.88), 4, 6); c.beginPath(); c.moveTo(w * 0.75 - 4, y(2.66)); c.lineTo(w * 0.75 + 4, y(2.66)); c.lineTo(w * 0.75, y(2.9)); c.fill();
    c.fillStyle = '#3a4048'; c.fillRect(w * 0.4, y(2.3), w * 0.2, y(0) - y(2.3));                    // 门洞
    c.fillStyle = '#c7ccd2'; c.fillRect(0, y(0.3), w, y(0) - y(0.3));                                // 勒脚
  }, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, h - (3.15 / 4.2) * h, w, (0.55 / 4.2) * h); }, 0.3);
  MAT.kartRoof = std('#e94e1b', { roughness: 0.5, metalness: 0.2 }, 0.3);   // 卡丁车场配套楼屋面：橙色
  MAT_REF = MAT;
  const kartBuildings = [];
  const bucket = new Map();
  const put = (mat, g) => { if (g.index) g = g.toNonIndexed(); if (!bucket.has(mat)) bucket.set(mat, []); bucket.get(mat).push(g); };
  const venueZone = (p) => { const [x0, n0, x1, n1] = bboxOf(p); const cx = (x0 + x1) / 2, cn = (n0 + n1) / 2; return cx > -900 && cx < 560 && cn > -620 && cn < 640; };
  for (const b of OSM_BUILDINGS) {
    const A = polyArea(b.p);
    const hh = Math.max(0.3, b.h - b.m);
    const isVenue = venueZone(b.p) && b.k !== 'industrial';
    if (b.r === 'cone') {
      // 荷叶顶棚的锥形立柱
      const [x0, n0, x1, n1] = bboxOf(b.p);
      const r = Math.max(0.5, Math.sqrt(A / Math.PI));
      const c = new THREE.CylinderGeometry(r * 0.35, r * 0.9, hh, 10);
      c.translate((x0 + x1) / 2, b.m + hh / 2, -(n0 + n1) / 2);
      put(MAT.steel, c);
      continue;
    }
    let geo;
    if (b.r === 'round') {
      // “翼”：两端尖、中部最厚的梭形钢桁架（同济大学结构研究：桁架高度中部最大、向两端减小），
      // 银白金属外壳，中部一条连续的绿色玻璃带，近两端各一个眼形小窗（据实拍照片）
      buildWing(b, put);
      continue;
    } else if (b.k === 'roof' && b.p.length >= 30) {
      // 荷叶形膜结构：薄而边缘圆润
      geo = new THREE.ExtrudeGeometry(shapeOf(b.p, b.q), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.6, bevelSegments: 3 });
      geo.translate(0, 0, 0.45);
    } else {
      geo = new THREE.ExtrudeGeometry(shapeOf(b.p, b.q), { depth: hh, bevelEnabled: false });
    }
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, b.m, 0);
    const [caps, sides] = splitCapsSides(geo);
    if (isVenue && (b.a === 'toilets' || b.a === 'kart' || (b.g === 'glass' && b.k !== 'roof') || (b.k === 'yes' && hh >= 3))) {
      // 场内配套建筑：卫生间亭、卡丁车场配套楼、玻璃小楼、一般配套楼
      const S = sides || caps;
      if (b.a === 'toilets') {
        // 卫生间按真实尺度做成 4.2 m 高的单层亭子 + 外挑 0.6 m 的薄屋面板
        const k = 4.2 / hh; S.scale(1, k, 1); S.translate(0, b.m * (1 - k), 0);
        put(MAT.toilet, wallUV(S, b.m));
        const slab = new THREE.ExtrudeGeometry(shapeOf(b.p, b.q), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.6, bevelSegments: 1 });
        slab.rotateX(-Math.PI / 2); slab.translate(0, b.m + 4.3, 0);
        put(MAT.venueRoof, slab.index ? slab.toNonIndexed() : slab);
        continue;
      }
      put(b.a === 'kart' ? MAT.kartRoof : MAT.venueRoof, caps);
      put(b.g === 'glass' || b.a === 'kart' ? MAT.glassBox : MAT.service, wallUV(S, b.m));
      // 屋顶设备：较大的楼放几台空调外机 / 风机
      if (A > 300) {
        const [x0, n0, x1, n1] = bboxOf(b.p);
        for (let k = 0, tries = 0; k < Math.min(6, Math.round(A / 250)) && tries < 40; tries++) {
          const x = x0 + rand() * (x1 - x0), n = n0 + rand() * (n1 - n0);
          if (!inside(x, n, b.p) || !inside(x + 2, n, b.p) || !inside(x - 2, n, b.p) || !inside(x, n + 2, b.p) || !inside(x, n - 2, b.p)) continue;
          const u = new THREE.BoxGeometry(2.4, 1.3, 1.6); u.rotateY(rand() * 3); u.translate(x, b.h + 0.65, -n);
          put(MAT.steel, u); k++;
        }
      }
      if (b.a === 'kart') kartBuildings.push(b);
      continue;
    }
    if (isVenue) {
      // 白色膜结构只给顶棚：主看台顶棚（高 35 m）与 H/K 荷叶顶棚（多边形点数多）；其余屋面为中灰
      const lotus = b.k === 'roof' && b.p.length >= 40;            // H/K 荷叶膜顶棚：白色
      const mainRoof = b.k === 'roof' && b.h > 25;                   // 主看台悬挑钢顶棚：银灰金属
      const tower = Math.abs(b.h - 29.75) < 0.3;                     // 两端支撑“翼”的塔（OSM 高 29.75 m）
      if (tower && A < 300) { put(MAT.chinaRed, caps); put(MAT.chinaRed, sides || caps); }
      else if (tower) { put(MAT.venueRoof, caps); put(MAT.towerGlass, sides || caps); }
      else if (lotus) { put(MAT.membrane, caps); put(MAT.membrane, sides || caps); }
      else if (mainRoof) { const [top, under] = splitUpDown(caps); put(MAT.roofSteel, top); put(MAT.roofUnder, under); put(MAT.roofSteel, sides || caps); }
      else { put(MAT.venueRoof, caps); put(MAT.venue, sides || caps); }
    } else if (b.k === 'industrial') { put(MAT.industrialRoof, caps); put(MAT.industrial, sides || caps); }
    else { put(MAT.roof, caps); put(hh >= 6 ? windowWall : MAT.plain, sides || caps); }
  }

  // ── 住宅区填充（示意）：有名字的小区 = 高层住宅；无名的 = 村落低层民房 ──
  const houses = [];
  for (const a of OSM_AREAS) {
    if (a.k !== 'residential') continue;
    const ang = mainAxis(a.p), ca = Math.cos(ang), sa = Math.sin(ang);
    const [x0, n0, x1, n1] = bboxOf(a.p);
    const cx = (x0 + x1) / 2, cn = (n0 + n1) / 2, R = Math.hypot(x1 - x0, n1 - n0) / 2;
    const tower = polyArea(a.p) > 30000 && rand() < 0.55;
    const su = tower ? 42 : 16, sv = tower ? 58 : 19;
    for (let u = -R; u < R; u += su) for (let v = -R; v < R; v += sv) {
      const x = cx + u * ca - v * sa, nn = cn + u * sa + v * ca;
      if (!inside(x, nn, a.p) || rand() > (tower ? 0.9 : 0.72)) continue;
      houses.push(x, nn, ang, tower ? 46 + rand() * 12 : 7 + rand() * 4, tower ? 15 : 11, tower ? 54 + rand() * 6 : 6 + rand() * 4);
    }
  }
  if (houses.length) {
    const n = houses.length / 6;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), windowWall, n);
    const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), MAT.roof, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const [x, nn, ang, w, d, h] = houses.slice(i * 6, i * 6 + 6);
      q.setFromAxisAngle(UP, ang);
      im.setMatrixAt(i, m4.compose(p.set(x, 0, -nn), q, s.set(w, h, d)));
      roofs.setMatrixAt(i, m4.compose(p.set(x, h, -nn), q, s.set(w + 0.6, 0.6, d + 0.6)));
    }
    im.castShadow = roofs.castShadow = true;
    root.add(im, roofs);
  }
  for (const [mat, list] of bucket) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
  // 卡丁车场配套楼的屋顶招牌（上赛卡丁车）
  if (kartBuildings.length) {
    const big = kartBuildings.reduce((a, b) => (polyArea(b.p) > polyArea(a.p) ? b : a));
    const P = principal(big.p);
    const signTex = canvasTex(512, 96, (c, w, h) => {
      c.fillStyle = '#16181c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e94e1b'; c.fillRect(0, h - 10, w, 10);
      c.fillStyle = '#fff'; c.font = '800 46px "PingFang SC", "Microsoft YaHei", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('上赛卡丁车  SIC KART', w / 2, h / 2 - 4);
    });
    const sm = new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.15, side: THREE.DoubleSide });
    nightEmissives.push({ m: sm, max: 1.2 });
    const w = Math.min(24, P.L * 0.6), sh = w * 96 / 512;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, sh), sm);
    sign.position.set(P.cx, big.h + 0.4 + sh / 2, -P.cn);
    sign.rotation.y = Math.atan2(P.un, P.ux);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.4, 0.2), MAT.steel);
    legs.position.set(P.cx, big.h + 0.2, -P.cn); legs.rotation.y = sign.rotation.y;
    root.add(sign, legs);
  }

  // ── 树 ──
  const nT = treeSpots.length / 3;
  if (nT) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 5), std('#6a4f3a', { roughness: 1 }), nT);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), floodlit(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 0.06), nT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < nT; i++) {
      const x = treeSpots[i * 3], n = treeSpots[i * 3 + 1], k = treeSpots[i * 3 + 2];
      const h = (6 + rand() * 6) * k, w = (2.2 + rand() * 1.8) * k;
      trunk.setMatrixAt(i, m4.compose(p.set(x, h * 0.25, -n), q.identity(), s.set(1, h * 0.5, 1)));
      crown.setMatrixAt(i, m4.compose(p.set(x, h * 0.66, -n), q.setFromAxisAngle(UP, rand() * 6), s.set(w, h * 0.42, w)));
      crown.setColorAt(i, c.setHSL(0.27 + rand() * 0.05, 0.38 + rand() * 0.12, 0.34 + rand() * 0.09)); // 自然的绿色
    }
    trunk.castShadow = crown.castShadow = true;
    root.add(trunk, crown);
  }

  // ── 停车场车辆 ──
  const nC = carSpots.length / 3;
  if (nC) {
    const body = new THREE.BoxGeometry(4.4, 1.0, 1.85).translate(0, 0.7, 0);
    const cabin = new THREE.BoxGeometry(2.3, 0.55, 1.6).translate(-0.2, 1.45, 0);
    const im = new THREE.InstancedMesh(mergeGeometries([body, cabin]), floodlit(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }), 0.12), nC);
    const cols = ['#f5f5f7', '#1d1d1f', '#8e8e93', '#c7c7cc', '#3a3a3c', '#b02a2a', '#2a4f9c', '#d9d9de', '#f5f5f7', '#2c2c2e'];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    for (let i = 0; i < nC; i++) {
      q.setFromAxisAngle(UP, carSpots[i * 3 + 2] + Math.PI / 2);
      im.setMatrixAt(i, m4.compose(p.set(carSpots[i * 3], 0, -carSpots[i * 3 + 1]), q, one));
      im.setColorAt(i, c.set(cols[(rand() * cols.length) | 0]));
    }
    im.castShadow = true;
    root.add(im);
  }

  scene.add(root);
  return { root, counts: { trees: nT, cars: nC, houses: houses.length / 6, buildings: OSM_BUILDINGS.length } };
}
