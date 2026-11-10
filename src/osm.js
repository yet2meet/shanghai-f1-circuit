// 由 OpenStreetMap 真实地物生成周边环境：地块、道路（含高架与桥梁）、水系、铁路、树行、围栏、停车场、建筑。
// 地图数据 © OpenStreetMap contributors（ODbL）。
// 唯一的“填充”内容：OSM 只标了住宅区范围、没有逐栋楼的轮廓，这些区域里的楼房是按区域类型生成的示意体块。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM_BUILDINGS, OSM_AREAS, OSM_LINES } from './osm-data.js';
import { rng, std, floodlit, canvasTex, nightEmissives } from './util.js';

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
    if (i) { const q = i * 2; idx.push(q - 2, q, q - 1, q - 1, q, q + 1); }
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

function windowTexture(wall, glass, lit) {
  return canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = wall; c.fillRect(0, 0, w, h);
    c.fillStyle = glass; c.fillRect(10, 18, 44, 30);
    if (lit) { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = Math.random() < 0.6 ? '#fff' : '#555'; c.fillRect(10, 18, 44, 30); }
  });
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
    park: ['#6aa951', -7], grass: ['#74b058', -7], forest: ['#3f7a3a', -7], flowerbed: ['#8cc160', -6], pitch: ['#4e9a49', -6], trackfield: ['#b4533c', -6],
    parking: ['#73777e', -5], plaza: ['#d6d1c5', -5], paved: ['#c8c8c2', -5], gravel: ['#c9b48b', -5], sand: ['#e2d3a6', -5], water: ['#3d84ab', -4],
  };
  const byKind = {};
  for (const a of OSM_AREAS) {
    if (!AREA[a.k]) continue;
    const g = new THREE.ShapeGeometry(shapeOf(a.p, a.q), 2);
    g.rotateX(-Math.PI / 2);
    (byKind[a.k] ||= []).push(g);
    const A = polyArea(a.p);
    const dens = { forest: 45, park: 160, grass: 700, residential: 900, cemetery: 120 }[a.k];
    if (dens) {
      const [x0, n0, x1, n1] = bboxOf(a.p);
      const n = Math.min(1500, Math.round(A / dens));
      for (let k = 0, guard = 0; k < n && guard < n * 8; guard++) {
        const x = x0 + rand() * (x1 - x0), nn = n0 + rand() * (n1 - n0);
        if (inside(x, nn, a.p) && !a.q.some((h) => inside(x, nn, h))) { treeSpots.push(x, nn, a.k === 'forest' ? 1.15 : 1); k++; }
      }
    }
    if (a.k === 'parking' && A < 40000) {
      // 车位：沿停车场主方向排布，2.5 m × 5 m，每两排之间留 6 m 车道
      const ang = mainAxis(a.p), ca = Math.cos(ang), sa = Math.sin(ang);
      const [x0, n0, x1, n1] = bboxOf(a.p);
      const cx = (x0 + x1) / 2, cn = (n0 + n1) / 2, R = Math.hypot(x1 - x0, n1 - n0) / 2;
      for (let v = -R; v < R; v += 16) for (const dv of [-2.5, 2.5]) for (let u = -R; u < R; u += 2.6) {
        const x = cx + u * ca - (v + dv) * sa, nn = cn + u * sa + (v + dv) * ca;
        if (inside(x, nn, a.p) && rand() < 0.62) carSpots.push(x, nn, ang);
      }
    }
  }
  const waterMat = floodlit(new THREE.MeshStandardMaterial({ color: AREA.water[0], roughness: 0.12, metalness: 0.35 }), 0.12);
  waterMat.depthWrite = false;
  for (const [k, list] of Object.entries(byKind)) {
    const mat = k === 'water' ? waterMat : groundMat(AREA[k][0], k === 'parking' || k === 'plaza' || k === 'paved' ? 0.4 : 0.15);
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.position.y = 0.02;
    root.add(asGround(m, AREA[k][1]));
  }

  // ── 线状地物 ──
  const ROAD = {
    motorway: '#5a5e65', motorway_link: '#5a5e65', primary: '#5f636a', primary_link: '#5f636a', secondary: '#62666d', secondary_link: '#62666d',
    tertiary: '#666a71', tertiary_link: '#666a71', unclassified: '#6b6f76', residential: '#6b6f76', service: '#71757c', living_street: '#6b6f76',
    track: '#a4977a', footway: '#cbc4b6', path: '#c2b79f', steps: '#bdb6a8', pedestrian: '#d2ccbf', cycleway: '#b9705c',
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
  for (const [cls, list] of Object.entries(ground)) add(list, groundMat(ROAD[cls] || '#6b6f76', 0.35), /footway|path|steps|pedestrian|cycleway|track/.test(cls) ? -3.5 : -3);
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
    venue: std('#eef0f3', { roughness: 0.5, side: THREE.DoubleSide }, 0.16),
    venueRoof: std('#d9dde2', { roughness: 0.6, side: THREE.DoubleSide }, 0.12),
    membrane: std('#f7f8fa', { roughness: 0.45, side: THREE.DoubleSide }, 0.3),
    steel: std('#d5d9df', { roughness: 0.35, metalness: 0.55 }, 0.45),
    roof: std('#8d939b', { roughness: 0.75 }, 0.25),
    plain: std('#dcd7cd', { roughness: 0.85 }, 0.25),
    industrial: std('#c7ccd3', { roughness: 0.7 }, 0.25),
    industrialRoof: std('#6f8fae', { roughness: 0.6 }, 0.25),
  };
  const bucket = new Map();
  const put = (mat, g) => { if (!bucket.has(mat)) bucket.set(mat, []); bucket.get(mat).push(g); };
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
      // 主看台两端横跨赛道的“翼”：圆润的拱形体
      const bt = hh * 0.42;
      geo = new THREE.ExtrudeGeometry(shapeOf(b.p, b.q), { depth: Math.max(0.3, hh - bt * 2), bevelEnabled: true, bevelThickness: bt, bevelSize: 1.2, bevelSegments: 6, curveSegments: 6 });
      geo.translate(0, 0, bt);
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
    if (isVenue) {
      const membrane = b.k === 'roof' || b.r === 'round' || b.r === 'skillion';
      put(membrane ? MAT.membrane : MAT.venueRoof, caps);
      put(membrane ? MAT.membrane : MAT.venue, sides || caps);
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

  // ── 树 ──
  const nT = treeSpots.length / 3;
  if (nT) {
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 5), std('#6a4f3a', { roughness: 1 }), nT);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), floodlit(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 0.06), nT);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < nT; i++) {
      const x = treeSpots[i * 3], n = treeSpots[i * 3 + 1], k = treeSpots[i * 3 + 2];
      const h = (6 + rand() * 6) * k, w = (2.2 + rand() * 1.8) * k;
      trunk.setMatrixAt(i, m4.compose(p.set(x, h * 0.25, -n), q.identity(), s.set(1, h * 0.5, 1)));
      crown.setMatrixAt(i, m4.compose(p.set(x, h * 0.66, -n), q.setFromAxisAngle(UP, rand() * 6), s.set(w, h * 0.42, w)));
      crown.setColorAt(i, c.setHSL(0.25 + rand() * 0.08, 0.42 + rand() * 0.2, 0.17 + rand() * 0.1));
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
