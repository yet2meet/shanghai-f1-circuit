// 生成新加坡滨海湾街道赛道的场景数据 → src/circuits/sg/data.js、src/circuits/sg/projection.json
//
// 输入（tools/osm-raw-sg/，由 tools/fetch-osm-sg.sh 下载，赛道中心线为随仓库保存的 GeoJSON）：
//   centerline.geojson  赛道中心线（bacinger/f1-circuits · sg-2008.geojson，MIT；长度字段 4928 m，对应 2023 年起的 19 弯布局）
//   race.json           OSM 中的 highway=raceway（维修通道、起终点直道）
//   bnear / btall       赛道两侧 230 m 内的建筑；以及远处高于 90 m 或 20 层以上的高楼（天际线）
//   rnear               赛道两侧 330 m 内的道路
//   water               水域、公园、草地
// 用法：node tools/gen-sg.mjs
//
// 坐标系与上海一致：x = 行驶方向右侧(+)，n = 起终点直道的行驶方向(+)，单位米；
// 赛道按真实行驶方向（逆时针）排列。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { joinBridgeWays } from './sg-road-network.mjs';

const RAW = new URL('./osm-raw-sg/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, RAW), 'utf8'));
const D2R = Math.PI / 180, R = 6371008.8, LAT0 = 1.29, LON0 = 103.86;
const enu = ([lon, lat]) => [(lon - LON0) * D2R * R * Math.cos(LAT0 * D2R), (lat - LAT0) * D2R * R];
const r1 = (v) => Math.round(v * 10) / 10;

// ───────────────────────── 赛道中心线与弯道 ─────────────────────────
const cl = read('centerline.geojson').features[0].geometry.coordinates;
const E = cl.slice(0, -1).map(enu).reverse(); // 数据是顺时针，真实行驶方向为逆时针（OSM 维修通道 oneway 方向、官方资料均为逆时针）

/** 向心 Catmull-Rom 加密到 step 米，仅用于识别弯道 */
function densify(P, step) {
  const n = P.length, out = [], pt = (i) => P[((i % n) + n) % n];
  const d = (a, b) => Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1]));
  for (let i = 0; i < n; i++) {
    const p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
    const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const m = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const L = (a, b, ta, tb) => [((tb - t) / (tb - ta)) * a[0] + ((t - ta) / (tb - ta)) * b[0], ((tb - t) / (tb - ta)) * a[1] + ((t - ta) / (tb - ta)) * b[1]];
      const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      out.push(L(L(A1, A2, 0, t2), L(A2, A3, t1, t3), t1, t2));
    }
  }
  return out;
}
const STEP = 4, S = densify(E, STEP), N = S.length;
const ang = S.map((a, i) => { const b = S[(i + 1) % N]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
const dang = ang.map((a, i) => { let d = ang[(i + 1) % N] - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; });
const W = 4;
const kap = dang.map((_, i) => { let s = 0; for (let j = -W; j <= W; j++) s += dang[(i + j + N) % N]; return s / ((2 * W + 1) * STEP); }); // 约 36 m 窗口内的曲率（rad/m，左转为正）
const THR = 0.0075;
let st = 0; while (Math.abs(kap[st]) > THR) st++;
let runs = [], i0 = -1;
for (let k = 0; k < N; k++) {
  const on = Math.abs(kap[(st + k) % N]) > THR;
  if (on && i0 < 0) i0 = k;
  if ((!on || k === N - 1) && i0 >= 0) { runs.push({ a: i0, b: k - 1 }); i0 = -1; }
}
runs = runs.map(({ a, b }) => { let tot = 0; for (let k = a; k <= b; k++) tot += dang[(st + k) % N]; return { a, b, tot }; });
const merged = [];
for (const r of runs) { const m = merged[merged.length - 1]; if (m && Math.sign(m.tot) === Math.sign(r.tot) && (r.a - m.b) * STEP < 30) { m.b = r.b; m.tot += r.tot; } else merged.push({ ...r }); }
const big = merged.filter((r) => Math.abs(r.tot) > 20 * D2R);
const sign = big.map((r) => (r.tot > 0 ? 'L' : 'R')).join('');
// 官方资料（formula1.com 2026 赛道指南、singaporegp.sg）给出的现行 19 弯布局：
//   1 左（Sheares） 2 右 3 左 4 微弯 5 右 6 微弯 7 左（Memorial） 8 右 9 左 10 左 11 右 12 左（Anderson 桥） 13 左发卡 14 右 15 微弯 16 右 17 左 18–19 双弧左
// 曲率识别出 17 个明显弯，其中 12→13 之间多出一个仅 26° 的小右弯（中心线数据的细小摆动，不是编号弯）；
// 4、6、15 号弯官方称为“kink”（小角度），在对应路段内取曲率最大处。
const EXPECT = 'LRLRLRLLRLRLRRLLL';
if (sign !== EXPECT) throw new Error(`弯道序列与预期不符：${sign}（应为 ${EXPECT}）`);
const bigMid = big.map((r) => (st + Math.floor((r.a + r.b) / 2)) % N);
const NUM = [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, null, 13, 14, 16, 17, 18, 19]; // 识别出的第 k 个弯 → 官方弯号
const turnIdx = {};
big.forEach((_, k) => { if (NUM[k]) turnIdx[NUM[k]] = bigMid[k]; });
const kinkBetween = (lo, hi) => { // 两个弯之间曲率最大处（距两端各 40 m 以外）
  let best = -1, bk = 0;
  const m = Math.round(40 / STEP);
  for (let i = (turnIdx[lo] + m) % N; i !== (turnIdx[hi] - m + N) % N; i = (i + 1) % N) if (Math.abs(kap[i]) > bk) { bk = Math.abs(kap[i]); best = i; }
  return { i: best, k: bk };
};
const kinks = { 4: kinkBetween(3, 5), 6: kinkBetween(5, 7), 15: kinkBetween(14, 16) };
for (const [n, v] of Object.entries(kinks)) turnIdx[n] = v.i;

// 起终点直道：19 号弯出弯 → 1 号弯入弯（OSM 维修通道、官方“pit straight”所在的东侧直道）
const t19 = S[turnIdx[19]], t1 = S[turnIdx[1]];
const dl = Math.hypot(t1[0] - t19[0], t1[1] - t19[1]);
const d = [(t1[0] - t19[0]) / dl, (t1[1] - t19[1]) / dl]; // 行驶方向（东、北分量）
const r = [d[1], -d[0]];                                  // 行驶方向右侧
const M = [(t19[0] + t1[0]) / 2, (t19[1] + t1[1]) / 2];
const toXN = ([e, n]) => [-500 + (e - M[0]) * r[0] + (n - M[1]) * r[1], 25 + (e - M[0]) * d[0] + (n - M[1]) * d[1]];
const toScene = (lon, lat) => toXN(enu([lon, lat]));
const north = [+r[1].toFixed(4), +d[1].toFixed(4)];

// 赛道点：从 19 号弯出弯（起终点直道起点）开始
const startVert = E.reduce((b, p, i) => (Math.hypot(p[0] - t19[0], p[1] - t19[1]) < Math.hypot(E[b][0] - t19[0], E[b][1] - t19[1]) ? i : b), 0);
const ordered = E.slice(startVert).concat(E.slice(0, startVert)).map(toXN).map(([x, n]) => [r1(x), r1(n)]);
const turns = Object.keys(turnIdx).map(Number).sort((a, b) => a - b).map((n) => { const [x, y] = toXN(S[turnIdx[n]]); return [n, Math.round(x), Math.round(y)]; });
let trackLen = 0;
for (let i = 0; i < ordered.length; i++) { const p = ordered[i], q = ordered[(i + 1) % ordered.length]; trackLen += Math.hypot(q[0] - p[0], q[1] - p[1]); }
console.log('弯道序列', sign, '→ 19 个弯；kink 曲率', Object.fromEntries(Object.entries(kinks).map(([n, v]) => [n, v.k.toFixed(4)])));
console.log('中心线折线长度', trackLen.toFixed(0), 'm；直道长', dl.toFixed(0), 'm；真北', north);

// 投影参数（供卫星影像使用，与 tools/gen-track.mjs 同格式）
const projection = { LAT0, R, lon0: LON0, M, r, d };
writeFileSync(new URL('../src/circuits/sg/projection.json', import.meta.url), JSON.stringify(projection, null, 2));

// ───────────────────────── OSM 地物 ─────────────────────────
const elements = new Map();
for (const f of ['bnear', 'btall', 'rnear', 'water', 'venue', 'bbridge', 'rbridge', 'landmarks']) {
  if (!existsSync(new URL(f + '.json', RAW))) continue;
  for (const e of read(f + '.json').elements) elements.set(e.type + e.id, e);
}
const flat = (pts) => pts.flatMap(([x, n]) => [r1(x), r1(n)]);
const proj = (g) => g.map((p) => toScene(p.lon, p.lat));
const closedPts = (g) => g.length > 3 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1];
const open = (g) => (closedPts(g) ? g.slice(0, -1) : g);
const area = (g) => g.reduce((s, p, i) => { const q = g[(i + 1) % g.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const centroid = (g) => { let x = 0, n = 0; for (const p of g) { x += p[0]; n += p[1]; } return [x / g.length, n / g.length]; };
function pip([x, n], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, ni] = poly[i], [xj, nj] = poly[j];
    if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) c = !c;
  }
  return c;
}
function rings(members, role) {
  const segs = members.filter((m) => m.geometry && (m.role || 'outer') === role).map((m) => proj(m.geometry));
  const out = [];
  while (segs.length) {
    let ring = segs.shift(), guard = 0;
    while (!closedPts(ring) && guard++ < 500) {
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
  if (e.type === 'way') { if (!e.geometry) return []; const g = proj(e.geometry); return closedPts(g) ? [{ outer: open(g), holes: [] }] : []; }
  const outers = rings(e.members || [], 'outer'), inners = rings(e.members || [], 'inner');
  return outers.map((o) => ({ outer: o, holes: inners.filter((h) => pip(h[0], o)) }));
};
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
const trackClosed = [...ordered, ordered[0]];
/** 多边形 / 折线（扁平 [x,n,…] 点列已转成点对）离赛道最近的距离：取各顶点距离的最小值 */
const distToTrack = (g) => Math.min(...g.map((p) => segDist(p, trackClosed)));
// 只保留赛道周边：远离主赛道的零散建筑、绿地、道路没有意义，反而让画面显得空旷零碎
const KEEP = { buildings: 380, areas: 650, green: 150, greenReach: 300, roads: 340, bridges: 900, nearBridge: 300 };
// 地标区域（滨海湾金沙、鱼尾狮公园）：离赛道较远，但属于必须做好的地标，区域内的建筑、道路、绿地、水面完整保留
const ZONES = JSON.parse(readFileSync(new URL('./landmark-zones.json', import.meta.url), 'utf8')).map((z) => ({ ...z, sc: toScene(z.c[1], z.c[0]) }));
const zoneD = (p) => Math.min(...ZONES.map((z) => Math.hypot(p[0] - z.sc[0], p[1] - z.sc[1]) - z.r)); // <= 0 表示在某个地标区域内
const inZone = (g) => g.some((p) => zoneD(p) <= 0);
const HW = 6.5, WALL = HW + 2; // 赛道半宽与护墙外缘（与 src/circuits/singapore.js 一致）
/** 最近的赛道线段：返回 [距离, 线段方向 x, n] */
const nearestSeg = ([x, n]) => {
  let best = [Infinity, 1, 0];
  for (let i = 0; i < trackClosed.length - 1; i++) {
    const [ax, an] = trackClosed[i], [bx, bn] = trackClosed[i + 1];
    const dx = bx - ax, dn = bn - an, l2 = dx * dx + dn * dn || 1, l = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (n - an) * dn) / l2));
    const d = Math.hypot(x - ax - dx * t, n - an - dn * t);
    if (d < best[0]) best = [d, dx / l, dn / l];
  }
  return best;
};
/** 建筑轮廓是否压到赛道（含护墙）：顶点或边上的采样点落入赛道走廊，或轮廓包住赛道上的点 */
const overlapsTrack = (g) => {
  const m = g.length;
  for (let i = 0; i < m; i++) {
    const a = g[i], b = g[(i + 1) % m], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 4));
    for (let j = 0; j < k; j++) if (segDist([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k], trackClosed) < WALL + 1) return true;
  }
  for (let i = 0; i < ordered.length; i += 3) if (pip(ordered[i], g)) return true;
  return false;
};
// 维修通道（OSM highway=raceway, raceway=pitlane，oneway）
const pitEl = [...elements.values()].find((e) => e.tags?.raceway === 'pitlane');
const race = read('race.json').elements.find((e) => e.id === 100484287);
const pit = proj((pitEl || race).geometry).map(([x, n]) => [r1(x), r1(n)]);
// 维修通道在行驶方向哪一侧：取其中点相对赛道的符号
{
  const mid = pit[Math.floor(pit.length / 2)];
  let bi = 0, bd = Infinity;
  ordered.forEach((p, i) => { const dd = Math.hypot(p[0] - mid[0], p[1] - mid[1]); if (dd < bd) { bd = dd; bi = i; } });
  const a = ordered[bi], b = ordered[(bi + 1) % ordered.length];
  const cross = (b[0] - a[0]) * (mid[1] - a[1]) - (b[1] - a[1]) * (mid[0] - a[0]); // 场景 (x, n) 平面：>0 为 n 轴逆时针侧
  // 场景 (x,n) 中右手系：行进方向向量 t，位置相对 t 的叉积 <0 为右侧
  console.log('维修通道中点距中心线', bd.toFixed(1), 'm；', cross < 0 ? '在行驶方向右侧' : '在行驶方向左侧');
}

// 新加坡摩天轮：OSM 中 attraction=big_wheel 的轮廓（way 230082125，129 × 83 m 的矩形）给出位置与轮面朝向（长轴方向）
const flyerEl = [...elements.values()].find((e) => e.id === 230082125) || read('venue.json').elements.find((e) => e.id === 230082125);
let FLYER = null;
if (flyerEl) {
  const g = open(proj(flyerEl.geometry));
  const c = centroid(g);
  let best = 0, ax = [1, 0];
  for (let i = 0; i < g.length; i++) { const q = g[(i + 1) % g.length], l = Math.hypot(q[0] - g[i][0], q[1] - g[i][1]); if (l > best) { best = l; ax = [(q[0] - g[i][0]) / l, (q[1] - g[i][1]) / l]; } }
  FLYER = { c: c.map(r1), ax: ax.map((v) => +v.toFixed(4)) };
  console.log('摩天轮', FLYER, '轮廓长边', best.toFixed(0), 'm');
}

// 鱼尾狮：OSM 里 Merlion Fountain（way 182819157，artwork）的位置；面向滨海湾对岸的金沙
let MERLION = null;
{
  const f = elements.get('way182819157');
  if (f) {
    const g = open(proj(f.geometry)), c = centroid(g), mbs = ZONES.find((z) => z.name === 'Marina Bay Sands');
    const cubEl = elements.get('node6283080658'); // The Merlion Cub（幼狮）
    MERLION = { c: c.map(r1), toward: mbs.sc.map(r1), cub: cubEl ? toScene(cubEl.lon, cubEl.lat).map(r1) : null };
    console.log('鱼尾狮', MERLION);
  }
}

// 地标标注位置（取自 OSM 同名地物的中心）：界面上像弯号一样标出，点击飞过去
const LANDMARKS = {};
{
  const byName = (re) => [...elements.values()].filter((e) => e.tags?.name && re.test(e.tags.name) && (e.geometry || e.members));
  const cen = (list) => {
    // 关系（3D 建筑）的成员没有 outer / inner 角色，直接取成员几何的点
    const pts = list.flatMap((e) => (e.type === 'relation' ? e.members.filter((m) => m.geometry).flatMap((m) => proj(m.geometry)) : polysOf(e).flatMap((pl) => pl.outer)));
    return pts.length ? centroid(pts).map(r1) : null;
  };
  const towers = byName(/^Marina Bay Sands Tower \d$/);
  LANDMARKS.mbs = cen(towers);
  LANDMARKS.tower3 = cen(byName(/^Marina Bay Sands Tower 3$/));
  LANDMARKS.artscience = cen(byName(/^ArtScience Museum$/));
  LANDMARKS.esplanade = cen(byName(/^Esplanade Theatres on the Bay$/));
  LANDMARKS.fullerton = cen(byName(/^The Fullerton Hotel$/));
  LANDMARKS.gardens = ZONES.find((z) => z.name === 'Gardens by the Bay').sc.map(r1);
  console.log('地标位置', JSON.stringify(LANDMARKS));
}

// 超级树丛（Supertree Grove，OSM way 171979084 的轮廓）：单棵超级树 OSM 没有逐棵标注，树的位置在渲染时在这块轮廓里示意
const gv = elements.get('way171979084');
const GROVE = gv ? flat(open(proj(gv.geometry))) : null;

// 场地范围：赛道外接矩形外扩 150 m（相机范围与卫星影像覆盖）
const xs = ordered.map((p) => p[0]), ns = ordered.map((p) => p[1]);
const bx0 = Math.min(...xs) - 150, bx1 = Math.max(...xs) + 150, bn0 = Math.min(...ns) - 150, bn1 = Math.max(...ns) + 150;
const VENUE = [bx0, bn0, bx1, bn0, bx1, bn1, bx0, bn1].map(r1);
const CENTER = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ns) + Math.max(...ns)) / 2)];

// 线状地物：道路、水道。与赛道重合的桥面保持贴地（赛道铺在上面），横跨赛道的高架保留高度
const ROAD_W = { motorway: 24, motorway_link: 9, trunk: 20, trunk_link: 9, primary: 20, primary_link: 9, secondary: 16, secondary_link: 8, tertiary: 13, tertiary_link: 7, unclassified: 9, residential: 8, service: 5, living_street: 6, footway: 2.6, path: 2, cycleway: 2.6, pedestrian: 6, steps: 2, track: 3.5 };
const lines = [], elevatedWays = [];
const indoorEnds = new Set([...elements.values()].filter((e) => e.geometry && e.tags?.highway === 'corridor' && e.tags.indoor === 'yes')
  .flatMap((e) => [e.geometry[0], e.geometry.at(-1)].map((p) => flat(proj([p])).join(','))));
const detailedBridgeWays = new Set([35037538, 164881354, 694102537, 256505618]);
const detailedRoadWays = new Set([173779730, 528539591, 35037535, 459186769]);
const bridgeVerts = [], bridgeRuns = [];
const distBridge = (p) => { let m = Infinity; for (const q of bridgeVerts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < m) m = d; } return m; };
for (const pass of [0, 1]) for (const e of elements.values()) {
  if (e.type !== 'way' || !e.geometry) continue;
  const t = e.tags || {};
  let k = null, w = 0, y = 0;
  if (t.highway === 'raceway') continue; // 赛道本身由中心线生成
  if (t.highway && ROAD_W[t.highway] && !t.area) {
    if ((t.tunnel && t.tunnel !== 'no') || t.indoor === 'yes' || (t.highway === 'footway' && t.covered === 'yes')) continue;
    k = 'road:' + (t.highway === 'trunk' ? 'primary' : t.highway === 'trunk_link' ? 'primary_link' : t.highway); w = ROAD_W[t.highway];
    if (t.lanes && /^(motorway|primary|secondary|tertiary|unclassified|trunk)/.test(t.highway)) w = Math.max(w * 0.5, parseInt(t.lanes, 10) * 3.4 + 2);
    if (t.bridge && t.bridge !== 'no') y = Math.max(1, parseInt(t.layer || '1', 10) || 1);
    else if (/_link$/.test(k) && Number(t.layer) > 0) y = Number(t.layer);
  } else if (t.waterway && /river|canal|stream|drain/.test(t.waterway)) {
    if (t.layer && parseInt(t.layer, 10) < 0) continue;
    k = 'water'; w = t.width ? parseFloat(t.width) : { river: 24, canal: 12, stream: 4, drain: 3 }[t.waterway] ?? 4;
  }
  if (!k || detailedBridgeWays.has(e.id) || detailedRoadWays.has(e.id)) continue;
  const g = proj(e.geometry);
  if (g.length < 2) continue;
  const samples = g.flatMap((p, i) => {
    if (i === 0) return [p];
    const a = g[i - 1], steps = Math.ceil(Math.hypot(p[0] - a[0], p[1] - a[1]) / 12);
    return Array.from({ length: steps }, (_, j) => [a[0] + (p[0] - a[0]) * (j + 1) / steps, a[1] + (p[1] - a[1]) * (j + 1) / steps]);
  });
  if (y > 0) { // 桥面与赛道重合的长度 > 40 m → 赛道在桥上，桥面贴地
    let on = 0;
    for (let i = 1; i < samples.length; i++) {
      const [d, tx, tn] = nearestSeg(samples[i]);
      const dx = samples[i][0] - samples[i - 1][0], dn = samples[i][1] - samples[i - 1][1];
      const length = Math.hypot(dx, dn);
      if (d < 7 && Math.abs(dx * tx + dn * tn) > length * 0.9) on += length;
    }
    if (on > 40) y = 0;
  }
  if ((pass === 0) !== (y > 0)) continue;
  const distance = distToTrack(samples);
  const p = flat(g);
  if (y > 0) {
    if (distance > KEEP.bridges) continue;
    bridgeRuns.push(g);
    bridgeVerts.push(...samples);
    const highway = /^(motorway|trunk_link)$/.test(t.highway) || t.name === 'Sheares Avenue';
    const height = highway ? 10 : (distance < WALL || t.name === 'Bayfront Avenue') ? 5.8 : y > 1 ? 4.8 : 1.4;
    elevatedWays.push({ k, w: r1(w), p, height });
  } else if (distance <= KEEP.roads || inZone(samples) || samples.some((point) => distBridge(point) <= KEEP.nearBridge)) {
    // 同一条道路保留整个 OSM way；横穿赛道的地面道路铺在赛道路面之下。
    lines.push({ k, w: r1(w), y: 0, p });
  }
}
lines.push(...joinBridgeWays(elevatedWays, indoorEnds));

// 桥周边的范围（经纬度）：tools/fetch-osm-sg.sh 据此补取桥两端接壤的建筑与道路
{
  const kx = D2R * R * Math.cos(LAT0 * D2R), ky = D2R * R;
  const fromXN = ([x, n]) => {
    const de = (x + 500) * r[0] + (n - 25) * d[0], dn = (x + 500) * r[1] + (n - 25) * d[1];
    return [LON0 + (M[0] + de) / kx, LAT0 + (M[1] + dn) / ky];
  };
  let boxes = bridgeRuns.map((sg) => {
    const ll = sg.map(fromXN), m = 0.0028;
    return [Math.min(...ll.map((p) => p[1])) - m, Math.min(...ll.map((p) => p[0])) - m, Math.max(...ll.map((p) => p[1])) + m, Math.max(...ll.map((p) => p[0])) + m].map((v) => +v.toFixed(5));
  });
  // 重叠的范围合并成少数几块（每块一次查询）
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i], boxes[j])) { const a = boxes[i], b = boxes[j]; boxes.splice(j, 1); boxes[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; again = true; break outer; }
    }
  }
  writeFileSync(new URL('./osm-raw-sg/bridge-bboxes.json', import.meta.url), JSON.stringify(boxes));
  console.log('桥段', bridgeRuns.length, '个；周边范围', boxes.length, '块');
}

// 建筑（含 building:part；有部件的建筑外轮廓按 OSM 3D 约定不渲染）
const buildings = [];
let PITB = null; // F1 Pit Building（OSM way 49890775，高 15 m）：不当普通建筑渲染，由 src/circuits/sg/pitbuilding.js 按此轮廓建车库
const parts = [...elements.values()].filter((e) => e.tags?.['building:part'] && e.type === 'way' && e.geometry);
const partCentroids = parts.map((e) => centroid(open(proj(e.geometry))));
const DEFAULT_H = { industrial: 11, school: 16, hospital: 18, residential: 18, apartments: 30, hotel: 40, office: 40, commercial: 20, retail: 12, train_station: 12, transportation: 8, garages: 8, roof: 5, civic: 14, public: 12, church: 14, temple: 12 };
for (const e of elements.values()) {
  const t = e.tags || {};
  const isPart = !!t['building:part'];
  if (!t.building && !isPart) continue;
  for (const { outer, holes } of polysOf(e)) {
    if (outer.length < 3) continue;
    if (distToTrack(outer) > KEEP.buildings && distBridge(centroid(outer)) > KEEP.nearBridge && !inZone(outer)) continue;
    if (e.id === 49890775) { PITB = { p: flat(outer), h: parseFloat(t.height) || 15 }; continue; }
    if (overlapsTrack(outer)) continue; // 压在赛道上的建筑（OSM 里是高架下的支撑、连廊等）不画
    // 摩天轮在 OSM 里被建成一叠实心圆盘薄片（building:part，高 117–165 m），与真实的镂空轮圈不符：去掉，改用 src/circuits/sg/landmarks.js 的轮圈
    if (isPart && FLYER && Math.hypot(centroid(outer)[0] - FLYER.c[0], centroid(outer)[1] - FLYER.c[1]) < 100 && parseFloat(t.height) >= 100) continue;
    if (!isPart && t.building !== 'roof' && partCentroids.some((c) => pip(c, outer))) continue;
    const A = Math.abs(area(outer));
    const lv = t['building:levels'] ? parseFloat(t['building:levels']) : null;
    const h = t.height ? parseFloat(t.height) : lv ? lv * 3.4 + 1 : DEFAULT_H[t.building] ?? (A < 120 ? 4 : A < 600 ? 6 : 9);
    const mh = t.min_height ? parseFloat(t.min_height) : 0;
    if (!(h > 0) || h <= mh) continue;
    const k = isPart ? (t['building:part'] === 'roof' ? 'roof' : 'part') : t.building;
    const b = { k, h: r1(h), m: r1(mh), r: t['roof:shape'] || '', n: t.name || '', p: flat(outer), q: holes.map(flat) };
    if (t['building:material']) b.g = t['building:material'];
    buildings.push(b);
  }
}

// 地块（面）
const AREA_KIND = (t) => {
  if (t.natural === 'water' || t.water || t.natural === 'bay') return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'forest';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'recreation_ground' || t.natural === 'grassland') return 'grass';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'park';
  if (t.leisure === 'pitch') return 'pitch';
  return null;
};
const areas = [];
for (const e of elements.values()) {
  const t = e.tags || {};
  if (t.building || t['building:part']) continue;
  const k = AREA_KIND(t);
  if (!k) continue;
  for (const { outer, holes } of polysOf(e)) {
    if (distToTrack(outer) > KEEP.areas && !inZone(outer)) continue;
    // 绿地（公园、草坪、林地、球场）只留紧邻赛道的小块（如 Padang）；远处的大片绿地与小岛没有意义
    if (k !== 'water' && !(inZone(outer) && Math.abs(area(outer)) <= 700000) && (distToTrack(outer) > KEEP.green || Math.max(...outer.map((p) => segDist(p, trackClosed))) > KEEP.greenReach || Math.abs(area(outer)) > 80000)) continue;
    areas.push({ k, p: flat(outer), q: holes.map(flat), A: Math.round(Math.abs(area(outer))) });
  }
}
areas.sort((a, b) => b.A - a.A);

console.log('buildings', buildings.length, 'areas', areas.length, 'lines', lines.length);
const enc = (f) => { const out = []; let px = 0, pn = 0; for (let i = 0; i < f.length; i += 2) { const x = Math.round(f[i] * 10), n = Math.round(f[i + 1] * 10); out.push(x - px, n - pn); px = x; pn = n; } return out; };
const ENC = {
  B: buildings.map((x) => ({ ...x, p: enc(x.p), q: x.q.map(enc) })),
  A: areas.map(({ A, ...x }) => ({ ...x, p: enc(x.p), q: x.q.map(enc) })),
  L: lines.map((x) => ({ ...x, p: enc(x.p) })),
};
const js = `// 由 tools/gen-sg.mjs 自动生成，请勿手改。
// 赛道中心线：bacinger/f1-circuits（MIT）· sg-2008.geojson（4928 m，对应 2023 年起的 19 弯布局），按真实行驶方向（逆时针）排列。
// 地图数据 © OpenStreetMap contributors（ODbL），已换算为场景坐标 (x, n)，单位：米。
// x = 行驶方向右侧(+)，n = 起终点直道的行驶方向(+)。多边形与折线为 0.1 m 精度的增量编码。
const D = (a) => { const o = new Array(a.length); let x = 0, n = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; n += a[i + 1]; o[i] = x / 10; o[i + 1] = n / 10; } return o; };
const RAW = ${JSON.stringify(ENC)};
export const TRACK_POINTS = ${JSON.stringify(ordered)};
export const TRUE_NORTH = ${JSON.stringify(north)};
/** 弯号位置 [弯号, x, n]：1–3、5、7–14、16–19 为曲率识别出的弯心；4、6、15 号为官方称 kink 的小角度弯，取路段内曲率最大处 */
export const TURNS = ${JSON.stringify(turns)};
export const PIT = ${JSON.stringify(pit)};
export const VENUE = ${JSON.stringify(VENUE)};
export const CENTER = ${JSON.stringify(CENTER)};
/** 新加坡摩天轮：中心 [x, n] 与轮面方向（单位向量），取自 OSM big_wheel 轮廓 */
export const FLYER = ${JSON.stringify(FLYER)};
/** F1 Pit Building 轮廓（OSM，高 15 m） */
export const PITB = ${JSON.stringify(PITB)};
/** 鱼尾狮雕像位置与面向（OSM Merlion Fountain） */
export const MERLION = ${JSON.stringify(MERLION)};
/** 地标标注位置 [x, n]：金沙、艺术科学博物馆、滨海艺术中心、富丽敦酒店、滨海湾花园 */
export const LANDMARKS = ${JSON.stringify(LANDMARKS)};
/** 超级树丛轮廓 [x, n, …]（OSM Supertree Grove） */
export const GROVE = ${JSON.stringify(GROVE)};
export const OSM_BUILDINGS = RAW.B.map((b) => ({ ...b, p: D(b.p), q: b.q.map(D) }));
export const OSM_AREAS = RAW.A.map((a) => ({ ...a, p: D(a.p), q: a.q.map(D) }));
export const OSM_LINES = RAW.L.map((l) => ({ ...l, p: D(l.p) }));
`;
writeFileSync(new URL('../src/circuits/sg/data.js', import.meta.url), js);
console.log('wrote src/circuits/sg/data.js', (js.length / 1024).toFixed(0), 'KB');
