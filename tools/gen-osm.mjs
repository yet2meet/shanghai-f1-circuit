// 把 OpenStreetMap 原始数据（tools/osm-raw/*.json，由 tools/fetch-osm.sh 下载）
// 换算成场景坐标，生成 src/osm-data.js。
// 数据 © OpenStreetMap contributors，ODbL 许可 —— 页面中需保留署名。
// 用法：node tools/gen-osm.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { toScene } from './proj.mjs';

const RAW = new URL('./osm-raw/', import.meta.url);
const elements = new Map();
for (const f of ['buildings', 'venue', 'landcover', 'roads']) {
  for (const e of JSON.parse(readFileSync(new URL(f + '.json', RAW), 'utf8')).elements) elements.set(e.type + e.id, e);
}
const CX = -200, CN = 0, RADIUS = 2300; // 保留的范围（米）
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => g.map((p) => toScene(p.lon, p.lat));
const flat = (pts) => pts.flatMap(([x, n]) => [r1(x), r1(n)]);
const bbox = (pts) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, n] of pts) { a = Math.min(a, x); b = Math.min(b, n); c = Math.max(c, x); d = Math.max(d, n); } return [a, b, c, d]; };
const inRange = (pts) => { const [a, b, c, d] = bbox(pts); const dx = Math.max(a - CX, 0, CX - c), dn = Math.max(b - CN, 0, CN - d); return Math.hypot(dx, dn) < RADIUS; };
const area = (g) => g.reduce((s, p, i) => { const q = g[(i + 1) % g.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const plen = (g) => g.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - g[i][0], p[1] - g[i][1]), 0);
const closed = (g) => g.length > 3 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1];
const open = (g) => (closed(g) ? g.slice(0, -1) : g);
const centroid = (g) => { let x = 0, n = 0; for (const p of g) { x += p[0]; n += p[1]; } return [x / g.length, n / g.length]; };
function pip([x, n], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, ni] = poly[i], [xj, nj] = poly[j];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) c = !c;
  }
  return c;
}
// 多边形关系：把成员线段首尾相接拼成闭合环
function rings(members, role) {
  const segs = members.filter((m) => m.geometry && (m.role || 'outer') === role).map((m) => proj(m.geometry));
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (!closed(ring) && guard++ < 500) {
      const end = ring[ring.length - 1];
      const k = segs.findIndex((s) => (s[0][0] === end[0] && s[0][1] === end[1]) || (s[s.length - 1][0] === end[0] && s[s.length - 1][1] === end[1]));
      if (k < 0) break;
      let s = segs.splice(k, 1)[0];
      if (!(s[0][0] === end[0] && s[0][1] === end[1])) s = s.slice().reverse();
      ring = ring.concat(s.slice(1));
    }
    if (ring.length >= 4) out.push(open(ring));
  }
  return out;
}
const polysOf = (e) => {
  if (e.type === 'way') return e.geometry && closed(proj(e.geometry)) ? [{ outer: open(proj(e.geometry)), holes: [] }] : [];
  const outers = rings(e.members || [], 'outer'), inners = rings(e.members || [], 'inner');
  return outers.map((o) => ({ outer: o, holes: inners.filter((h) => pip(h[0], o)) }));
};

// ── 主赛道与维修通道（raceway）──
const MAIN_ID = 'way156328670', PIT_IDS = ['way107371138', 'way107371147'];
let main = open(proj(elements.get(MAIN_ID).geometry));
// 朝向：大直道上行驶方向为 +n；起点取最接近 bacinger 数据起点 (-500, -352) 的点
const i0 = main.reduce((b, p, i) => (Math.hypot(p[0] + 500, p[1] + 352) < Math.hypot(main[b][0] + 500, main[b][1] + 352) ? i : b), 0);
main = main.slice(i0).concat(main.slice(0, i0));
if (main[3][1] < main[0][1]) main = [main[0], ...main.slice(1).reverse()];
const trackLen = plen([...main, main[0]]);
const segDist = ([x, n], g) => {
  let best = Infinity;
  for (let i = 0; i < g.length - 1; i++) {
    const [ax, an] = g[i], [bx, bn] = g[i + 1];
    const dx = bx - ax, dn = bn - an, l2 = dx * dx + dn * dn || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, n - an - dn * t));
  }
  return best;
};
const mainClosed = [...main, main[0]];
const nearestIdx = ([x, n]) => main.reduce((b, p, i) => (Math.hypot(p[0] - x, p[1] - n) < Math.hypot(main[b][0] - x, main[b][1] - n) ? i : b), 0);

// 维修通道：两段拼接
let pit = proj(elements.get(PIT_IDS[0]).geometry);
const pit2 = proj(elements.get(PIT_IDS[1]).geometry);
const join = (a, b) => {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  if (d(a[a.length - 1], b[0]) < 1) return a.concat(b.slice(1));
  if (d(a[a.length - 1], b[b.length - 1]) < 1) return a.concat(b.slice().reverse().slice(1));
  if (d(a[0], b[b.length - 1]) < 1) return b.concat(a.slice(1));
  if (d(a[0], b[0]) < 1) return b.slice().reverse().concat(a.slice(1));
  return a;
};
pit = join(pit, pit2);
if (pit[pit.length - 1][1] < pit[0][1]) pit.reverse(); // 与大直道同向

// ── 看台：最小外接矩形 → 前沿中点、朝向赛道的方向、长、深 ──
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function frame(poly, h) {
  const hp = hull(poly);
  let best = null;
  for (let i = 0; i < hp.length; i++) {
    const a = hp[i], b = hp[(i + 1) % hp.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], v = [-u[1], u[0]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of hp) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, u, v, u0, u1, v0, v1 };
  }
  let { u, v, u0, u1, v0, v1 } = best;
  if (u1 - u0 < v1 - v0) { [u, v] = [v, [-u[0], -u[1]]]; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; } // 长边作为 u
  const L = u1 - u0, D = v1 - v0, um = (u0 + u1) / 2;
  const at = (uu, vv) => [u[0] * uu + v[0] * vv, u[1] * uu + v[1] * vv];
  const sideA = at(um, v0), sideB = at(um, v1);
  const frontIsA = segDist(sideA, mainClosed) < segDist(sideB, mainClosed);
  const front = frontIsA ? sideA : sideB;
  const f = frontIsA ? [-v[0], -v[1]] : v; // 由看台指向赛道
  return { front: front.map(r1), f: f.map((x) => +x.toFixed(4)), L: r1(L), D: r1(D), h: h ? +h : null, poly: flat(poly) };
}
const way = (id) => elements.get('way' + id);
const heightOf = (e) => (e.tags.height ? parseFloat(e.tags.height) : null);
const STAND_PARTS = {
  A: [['A', 1372574254]],
  B: [['B1', 156341844], ['B2', 156341848], ['B3', 156341851]],
  H: [['H', 156346102]],
  K: [['K', 156346098]],
  E: [156974483, 156974485, 156974487, 156974489, 156974491, 156974493, 156974496, 156974497, 156974499, 156974500, 156974506].map((id) => ['E', id]),
  F: [['F', 485553716]], J: [['J', 485553709]],
  P: [['P', 1371944279]],
};
const stands = {};
const usedForStands = new Set();
for (const [sid, parts] of Object.entries(STAND_PARTS)) {
  let list = parts.map(([code, id]) => {
    const e = way(id);
    usedForStands.add(e.type + e.id); // 维修楼（P）由 src/pitbuilding.js 按此轮廓程序化建模
    return { code, ...frame(open(proj(e.geometry)), heightOf(e)) };
  });
  // E 看台由多段小看台组成：按沿赛道的先后顺序编号 E1、E2…
  if (sid === 'E') {
    list.sort((a, b) => nearestIdx(a.front) - nearestIdx(b.front));
    list.forEach((p, i) => (p.code = 'E' + (i + 1)));
  }
  stands[sid] = list;
}
// 看台的整体外轮廓（建筑本身）不再单独挤出，避免与座位模型重叠
for (const id of [107371135, 1372223261, 1372223262]) usedForStands.add('way' + id);

// ── 场馆红线：OSM 中“上海国际赛车场”（leisure=sports_centre）的边界 ──
// 只保留红线以内（外扩 30 m）的地物，红线外统一铺成平整草地
const VENUE = open(proj(elements.get('way156311798').geometry));
// 南侧圆形广场（地铁站、1 号门入口）不在 OSM 红线内，单独圈入：中心 (-891, 79)，半径 260 m
const PLAZA = [-891, 79], PLAZA_R = 260;
const inPlaza = ([x, n]) => Math.hypot(x - PLAZA[0], n - PLAZA[1]) < PLAZA_R;
const inKeep = (p) => pip(p, VENUE) || inPlaza(p);
const nearVenue = (pts) => {
  const [cx, cn] = centroid(pts);
  if (inKeep([cx, cn])) return true;
  return segDist([cx, cn], [...VENUE, VENUE[0]]) < 30;
};

// ── 建筑与建筑部件 ──
const buildings = [];
const parts = [...elements.values()].filter((e) => e.tags?.['building:part'] && e.type === 'way' && e.geometry);
const partCentroids = parts.map((e) => centroid(open(proj(e.geometry))));
const DEFAULT_H = { industrial: 11, school: 16, dormitory: 18, hospital: 18, residential: 18, apartments: 30, train_station: 12, transportation: 8, garages: 8, roof: 5, sports_hall: 14, commercial: 15, retail: 8 };
for (const e of elements.values()) {
  const t = e.tags || {};
  const isPart = !!t['building:part'];
  if (!t.building && !isPart) continue;
  if (usedForStands.has(e.type + e.id)) continue;
  for (const { outer, holes } of polysOf(e)) {
    if (!inRange(outer) || outer.length < 3 || !nearVenue(outer)) continue;
    // 有建筑部件的建筑外轮廓按 OSM 3D 约定不渲染
    if (!isPart && t.building !== 'roof' && partCentroids.some((c) => pip(c, outer))) continue;
    const A = Math.abs(area(outer));
    const lv = t['building:levels'] ? parseFloat(t['building:levels']) : null;
    let h = t.height ? parseFloat(t.height) : lv ? lv * 3.4 + 1 : DEFAULT_H[t.building] ?? (A < 120 ? 4 : A < 600 ? 6 : 9);
    let mh = t.min_height ? parseFloat(t.min_height) : 0;
    const kind = isPart ? (t['building:part'] === 'roof' ? 'roof' : 'part') : t.building;
    if (kind === 'roof' && !t.min_height) { mh = t.height ? h - 0.8 : 5.5; if (!t.height) h = 6.2; }
    if (t.building === 'roof') { mh = 4.6; h = 5.2; }
    buildings.push({ k: kind, h: r1(h), m: r1(mh), r: t['roof:shape'] || '', n: t.name || '', p: flat(outer), q: holes.map(flat) });
  }
}

// ── 地块（面）──
const AREA_KIND = (t) => {
  if (t.natural === 'water' || t.water) return 'water';
  if (t.natural === 'sand') return 'sand';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'forest';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.natural === 'grassland') return 'grass';
  if (t.landuse === 'flowerbed') return 'flowerbed';
  if (t.landuse === 'farmland' || t.landuse === 'orchard') return 'farmland';
  if (t.landuse === 'residential') return 'residential';
  if (t.landuse === 'industrial' || t.landuse === 'railway' || t.landuse === 'construction') return 'industrial';
  if (t.landuse === 'retail' || t.landuse === 'commercial') return 'retail';
  if (t.landuse === 'cemetery') return 'cemetery';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'park';
  if (t.leisure === 'golf_course') return 'park';
  if (t.leisure === 'pitch') return 'pitch';
  if (t.leisure === 'track') return 'trackfield';
  if (t.amenity === 'parking') return 'parking';
  if (t.highway === 'pedestrian' || t['area:highway']) return 'plaza';
  if (t.surface === 'gravel') return 'gravel';
  if ((t.surface === 'asphalt' || t.surface === 'concrete' || t.surface === 'paving_stones') && (t.area === 'yes' || !t.highway)) return 'paved';
  return null;
};
const areas = [];
for (const e of elements.values()) {
  const t = e.tags || {};
  if (t.building || t['building:part'] || usedForStands.has(e.type + e.id)) continue;
  if (t.highway && t.highway !== 'pedestrian' && !t.area && !t['area:highway']) continue;
  const k = AREA_KIND(t);
  if (!k) continue;
  for (const { outer, holes } of polysOf(e)) {
    if (!inRange(outer) || !nearVenue(outer)) continue;
    if (k === 'residential' || k === 'farmland' || k === 'industrial' || k === 'retail' || k === 'cemetery') continue; // 与场馆无关的用地不画
    areas.push({ k, p: flat(outer), q: holes.map(flat), A: Math.round(Math.abs(area(outer))) });
  }
}
areas.sort((a, b) => b.A - a.A); // 大的先画

// ── 线状地物：道路、水道、铁路、树行、围栏、其他赛道 ──
const ROAD_W = { motorway: 24, motorway_link: 9, trunk: 20, primary: 22, primary_link: 9, secondary: 17, secondary_link: 8, tertiary: 13, tertiary_link: 7, unclassified: 9, residential: 7, service: 5, living_street: 6, track: 3.5, footway: 2.6, path: 2, cycleway: 2.5, steps: 2.5, pedestrian: 6 };
const lines = [];
for (const e of elements.values()) {
  if (e.type !== 'way' || !e.geometry || usedForStands.has(e.type + e.id)) continue;
  const t = e.tags || {};
  let k = null, w = 0, y = 0;
  if (t.highway === 'raceway') {
    if (e.type + e.id === MAIN_ID || PIT_IDS.includes(e.type + e.id)) continue;
    k = 'raceway'; w = 11;
  } else if (t.highway && ROAD_W[t.highway] && !t.area) {
    if (t.tunnel) continue;
    k = 'road:' + t.highway; w = ROAD_W[t.highway];
    if (t.lanes && /^(motorway|primary|secondary|tertiary|unclassified|trunk)/.test(t.highway)) w = Math.max(w * 0.5, parseInt(t.lanes, 10) * 3.6 + 2);
    if (t.bridge) y = parseInt(t.layer || '1', 10) || 1;
  } else if (t.waterway) {
    if (t.layer && parseInt(t.layer, 10) < 0) continue; // 涵洞
    k = 'water'; w = t.width ? parseFloat(t.width) : { river: 24, canal: 10, stream: 4, ditch: 2.5, drain: 2.5 }[t.waterway] ?? 4;
  } else if (t.railway === 'subway' || t.railway === 'rail') {
    if (t.tunnel || (t.layer && parseInt(t.layer, 10) < 0)) continue;
    k = 'rail'; w = 9; y = t.bridge ? 1 : 0;
  } else if (t.natural === 'tree_row') { k = 'trees'; w = 6; }
  else if (t.barrier === 'fence' || t.barrier === 'wall') { k = 'fence'; w = 0; }
  if (!k) continue;
  const g = proj(e.geometry);
  if (!inRange(g)) continue;
  // 线状地物：只保留落在红线内的部分（按点裁剪，避免高速公路等穿出红线）
  const inside = g.filter(inKeep);
  if (inside.length < 2 || k === 'rail' || k === 'road:motorway' || k === 'road:motorway_link') continue;
  lines.push({ k, w: r1(w), y, p: flat(inside) });
}

// 统计与输出
const count = (arr) => arr.reduce((m, x) => ((m[x.k] = (m[x.k] || 0) + 1), m), {});
console.log('track', main.length, 'pts', trackLen.toFixed(0), 'm; pit', pit.length, 'pts', plen(pit).toFixed(0), 'm');
console.log('stands', Object.fromEntries(Object.entries(stands).map(([k, v]) => [k, v.map((p) => `${p.code} L${p.L} D${p.D} h${p.h}`).join(' | ')])));
console.log('buildings', buildings.length, count(buildings));
console.log('areas', areas.length, count(areas));
console.log('lines', lines.length, count(lines));

// 坐标按 0.1 m 取整后做增量编码，体积约为直接写小数的 2/3，加载时再解码
const enc = (flat) => { const out = []; let px = 0, pn = 0; for (let i = 0; i < flat.length; i += 2) { const x = Math.round(flat[i] * 10), n = Math.round(flat[i + 1] * 10); out.push(x - px, n - pn); px = x; pn = n; } return out; };
const ENC = {
  B: buildings.map((x) => ({ ...x, p: enc(x.p), q: x.q.map(enc) })),
  A: areas.map(({ A, ...x }) => ({ ...x, p: enc(x.p), q: x.q.map(enc) })),
  L: lines.map((x) => ({ ...x, p: enc(x.p) })),
};
const js = `// 由 tools/gen-osm.mjs 自动生成，请勿手改。
// 地图数据 © OpenStreetMap contributors（ODbL），已换算为场景坐标 (x, n)，单位：米。
// 多边形与折线坐标为 0.1 m 精度的增量编码，下方 D() 负责解码。
const D = (a) => { const o = new Array(a.length); let x = 0, n = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; n += a[i + 1]; o[i] = x / 10; o[i + 1] = n / 10; } return o; };
const RAW = ${JSON.stringify(ENC)};
export const OSM_TRACK = ${JSON.stringify(main.map(([x, n]) => [r1(x), r1(n)]))};
export const OSM_PIT = ${JSON.stringify(pit.map(([x, n]) => [r1(x), r1(n)]))};
export const OSM_STANDS = ${JSON.stringify(stands)};
export const OSM_VENUE = ${JSON.stringify(flat(VENUE))};
export const OSM_BUILDINGS = RAW.B.map((b) => ({ ...b, p: D(b.p), q: b.q.map(D) }));
export const OSM_AREAS = RAW.A.map((a) => ({ ...a, p: D(a.p), q: a.q.map(D) }));
export const OSM_LINES = RAW.L.map((l) => ({ ...l, p: D(l.p) }));
`;
writeFileSync(new URL('../src/osm-data.js', import.meta.url), js);
console.log('wrote src/osm-data.js', (js.length / 1024).toFixed(0), 'KB');
