import * as THREE from 'three';
import { std, V } from '../../util.js';
import { buildSilverstoneStands } from '../silverstone/stands.js';
import { curvedStandPlan } from '../silverstone/stand-curve.js';
import { meshBatch } from './meshes.js';

const range = (a, b) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => a + i * Math.sign(b - a));
// Front and rear boundaries picked from the unmodified OSM outlines, in
// corresponding order. Continuous sweep keeps steps and rails around the bends.
const curves = {
  183393132: [range(4, 8), range(3, 0)],
  184143131: [range(0, 8), range(20, 9)],
  184143132: [range(12, 23), range(11, 1)],
  'b2-turn1': [range(0, 5), range(6, 10)],
  184143133: [range(0, 11), range(27, 12)],
  184105033: [range(26, 14), range(0, 13)],
  184104828: [range(0, 6), range(20, 7)],
  183393129: [[20, ...range(19, 14)], range(2, 11)],
  183953758: [range(10, 5), range(0, 4)],
  183953761: [range(15, 8), range(0, 7)],
};
const standDepths = { 183393132: 8, 184143131: 8, 184143132: 11.5, 'b2-turn1': 10.5 };
const familyApproaches = {
  A: ['主直道与 1 号弯', 'Main straight and Turn 1'],
  B: ['2 号弯', 'Turn 2'],
  Q: ['减速弯', 'Chicane'],
  V: ['主直道上下层', 'Main straight · lower and upper tiers'],
};

// Smooth the inner turn of E so the back rows keep a continuous radius.
const eFront = [[324.86, 93.67], [344.4, 87.47], [361.13, 76.71], [376.5, 61.5],
  [387.6, 45], [390.8, 27.7], [386.4, 9], [377, -12], [361.45, -51.14]];

// Use the same local alignment as the S-bends for D1–D4 and D5.
function standAtTrack(track, first, last, setback, depth) {
  const start = track.nearest(...first), end = track.nearest(...last);
  const point = (i, offset) => {
    const p = track.pts[i].clone().addScaledVector(track.nor[i], offset);
    return [p.x, -p.z];
  };
  const front = [];
  const rear = [];
  for (let i = Math.min(start, end); i < Math.max(start, end); i += 2) {
    front.push(point(i, setback));
    rear.push(point(i, setback + Math.sign(setback) * depth));
  }
  front.push(point(Math.max(start, end), setback));
  rear.push(point(Math.max(start, end), setback + Math.sign(setback) * depth));
  return curvedStandPlan({
    polygon: [...front, ...rear],
    curveOutline: [range(0, front.length - 1), range(front.length, front.length * 2 - 1)],
    regularSweep: true, depth,
  });
}
const data = {
  V1: ['主直道下层', 'Main straight · lower tier', '#4a7b9b'],
  V2: ['主直道上层', 'Main straight · upper tier', '#7497b3'],
  VIP: ['主直道贵宾区', 'Main straight · VIP', '#788b8a'],
  A1: ['1 号弯前', 'Approach to Turn 1', '#759882'],
  A2: ['主直道末端', 'Main straight end', '#759882'],
  B1: ['1–2 号弯', 'Turns 1–2', '#789188'],
  B2: ['1–2 号弯后排', 'Turns 1–2 · upper stand', '#8ea58d'],
  C: ['2 号弯至 S 弯', 'Turn 2 to S Curves', '#9a625c'],
  D: ['S 弯与逆倾角弯', 'S Curves & Gyaku Bank', '#829a69'],
  E: ['逆倾角弯与 Dunlop', 'Gyaku Bank & Dunlop', '#7e9b7d'],
  G: ['8 字交叉与 130R', 'Crossover & 130R', '#678c96'],
  H: ['110R', '110R', '#7c9279'],
  I: ['发夹弯', 'Hairpin', '#a08865'],
  J: ['200R 西区', '200R · West Area', '#7c9167'],
  L: ['匙弯西区', 'Spoon · West Area', '#809269'],
  M: ['匙弯外侧', 'Spoon outside', '#758e6d'],
  N: ['匙弯出口西区', 'Spoon exit · West Area', '#819865'],
  O: ['西直道', 'West Straight', '#7a9390'],
  P: ['减速弯入口', 'Chicane approach', '#7a8d9f'],
  Q1: ['减速弯出口', 'Chicane exit', '#8e8772'],
  Q2: ['减速弯', 'Chicane', '#968778'],
  R: ['最后一弯', 'Final Corner', '#857b8f'],
  S: ['最后一弯家庭区', 'Final Corner · family seating', '#a8847f'],
};
// 2027 Japanese GP 3-day advance prices (JPY, tax incl., suzukacircuit.jp).
const prices = {
  V1: [112000, true, 'V1-1 JP¥117,000 · V1-2 JP¥112,000（2027 官网价）', 'V1-1 JP¥117,000 · V1-2 JP¥112,000 (2027 official)'],
  V2: [120000, true, 'V2-1–V2-9：JP¥120,000–280,000（2027 官网价）', 'V2-1 to V2-9: JP¥120,000–280,000 (2027 official)'],
  VIP: [650000, true, 'VIP Suite Premium 起步价（2027 官网价）', 'VIP Suite Premium starting price (2027 official)'],
  A1: [75600, true, 'A1-1 JP¥75,600 · A1-2 JP¥88,400（2027 官网价）', 'A1-1 JP¥75,600 · A1-2 JP¥88,400 (2027 official)'],
  A2: [103200, false],
  B1: [75400, false],
  B2: [89600, true, 'B2-1 JP¥89,600 · B2-2 JP¥97,000 · B2-3 JP¥108,000', 'B2-1 JP¥89,600 · B2-2 JP¥97,000 · B2-3 JP¥108,000'],
  C: [48400, true, '正价 JP¥48,400–58,000（2027 官网价）', 'Standard JP¥48,400–58,000 (2027 official)'],
  'D-1': [36400, false], 'D-2': [36400, false], 'D-3': [60600, false], 'D-4': [60600, false],
  'D-5': [60600, false], 'D-6': [44600, false], 'D-7': [65800, false], 'D-8': [65800, false],
  'E-1': [42000, false], 'E-2': [55000, false], 'E-3': [46200, false], 'E-4': [46200, false],
  'E-5': [60600, false], 'E-6': [60600, false],
  'G-1': [30000, false], 'G-2': [24000, false], 'G-3': [37200, false], 'G-4': [42000, false], 'G-5': [32200, false],
  H: [46000, false],
  'I-1': [56400, false], 'I-2': [58800, false], 'I-3': [58800, false], 'I-4': [58800, false], 'I-5': [58800, false], 'I-6': [54000, false],
  J: [22000, false, '西区自由席通票（2027 官网价）', 'West Area Ticket (2027 official)'],
  L: [22000, false, '西区自由席通票（2027 官网价）', 'West Area Ticket (2027 official)'],
  N: [22000, false, '西区自由席通票（2027 官网价）', 'West Area Ticket (2027 official)'],
  M: [40000, true, 'JP¥40,000–45,000（2027 官网价）', 'JP¥40,000–45,000 (2027 official)'],
  'M-1': [45000, false], 'M-2': [45000, false], 'M-3': [40000, false],
  'O-1': [29000, true, '下层 JP¥29,000 · 上层 JP¥34,600', 'Lower JP¥29,000 · Upper JP¥34,600'],
  'O-2': [29000, true, '下层 JP¥29,000 · 上层 JP¥34,600', 'Lower JP¥29,000 · Upper JP¥34,600'],
  'P-1': [40000, false], 'P-2': [37000, false], 'P-3': [34000, false],
  Q1: [63200, true, 'Q1-1 JP¥63,200 · Q1-2 JP¥75,000', 'Q1-1 JP¥63,200 · Q1-2 JP¥75,000'],
  Q2: [105600, false],
  R: [72000, false],
  S: [72000, true, '家庭区成人票（2027 官网价）', 'Family Seat adult (2027 official)'],
};
function suzukaZone(zoneKey, color) {
  const [price = null, priceRange = false, noteZh, noteEn] = prices[zoneKey] ?? [];
  return {
    name: `${zoneKey} 区`, nameEn: `Section ${zoneKey}`, color, price, priceRange,
    tag: '2027 官网价', tagEn: '2027 official',
    note: noteZh ?? '2027 日本大奖赛成人三日预售价（含税）',
    noteEn: noteEn ?? '2027 Japanese GP 3-day advance price (tax incl.)',
  };
}

function sliceStand(plan, a, b) {
  const start = a * plan.L, end = b * plan.L;
  return {
    ...plan, L: end - start,
    at: (u, v, y) => plan.at(start + u, v, y),
    outwardAt: u => plan.outwardAt(start + u),
    stations: (u, v) => plan.stations(start + u, start + v).map(s => s - start),
  };
}

function seatSections(names, cuts, props = {}) {
  return names.map((name, i) => ({ ...props, name, along: [cuts[i], cuts[i + 1]] }));
}

function extraStand(section, front, outward, depth) {
  const rear = front.slice().reverse().map(point => point.clone().addScaledVector(outward, depth));
  return { id: section.toLowerCase(), name: section[0], section,
    p: [...front, ...rear].map(p => [p.x, -p.z]) };
}

function behindStand(plan, a, b, offset, depth, section) {
  return extraStand(section, [a, b].map(t => plan.at(plan.L * t, offset)),
    plan.outwardAt(plan.L * (a + b) / 2), depth);
}

function straightSections(item, track, sections, cuts, setback = 0, depth) {
  const outline = straightOutline(item.p, track, 0.25, 0.23);
  const [a, b, , rear] = item.name.startsWith('V') && outline[0].x < outline[1].x
    ? [outline[1], outline[0], outline[3], outline[2]] : outline;
  const outward = rear.clone().sub(a).normalize();
  const axis = b.clone().sub(a).normalize();
  return sections.map((section, i) => ({
    ...extraStand(section, [cuts[i], cuts[i + 1]].map((t, end) =>
      a.clone().lerp(b, t).addScaledVector(outward, setback)
        .addScaledVector(axis, end ? -0.58 : 0.58)),
    outward, depth ?? a.distanceTo(rear)), name: item.name,
  }));
}

function temporaryA2(track, a1) {
  // The official A2 inset locates the temporary block downstream of A1-1.
  // Length and setback are scaled estimates from the inset and the A1 footprint.
  const cx = a1.p.reduce((v, p) => v + p[0] / a1.p.length, 0);
  const cn = a1.p.reduce((v, p) => v + p[1] / a1.p.length, 0);
  const start = track.dist[track.nearest(cx, -cn)] + 124;
  const ends = [start, start + 73].map(s => track.dist.findIndex(d => d >= s));
  const corner = (i, m) => {
    const p = track.pts[i].clone().addScaledVector(track.nor[i], m);
    return [p.x, -p.z];
  };
  return { id: 'a2', name: 'A2', p: [corner(ends[0], 17), corner(ends[1], 17), corner(ends[1], 28), corner(ends[0], 28)] };
}

function straightOutline(polygon, track, sideInset, endInset) {
  const pts = polygon.map(p => V(...p));
  const center = pts.reduce((sum, p) => sum.addScaledVector(p, 1 / pts.length), new THREE.Vector3());
  let axis = new THREE.Vector3(1, 0, 0), longest = 0;
  for (let i = 0; i < pts.length; i++) {
    const delta = pts[(i + 1) % pts.length].clone().sub(pts[i]);
    if (delta.lengthSq() > longest) { longest = delta.lengthSq(); axis = delta.normalize(); }
  }
  const outward = new THREE.Vector3(-axis.z, 0, axis.x);
  const onTrack = track.pts[track.nearest(center.x, center.z)];
  if (outward.dot(center.clone().sub(onTrack)) < 0) outward.negate();
  const u = pts.map(p => p.clone().sub(center).dot(axis)), v = pts.map(p => p.clone().sub(center).dot(outward));
  const u0 = Math.min(...u) + endInset, u1 = Math.max(...u) - endInset;
  const v0 = Math.min(...v) + sideInset, v1 = Math.max(...v) - sideInset;
  const area = Math.abs(u.reduce((sum, x, i) => {
    const next = (i + 1) % u.length; return sum + x * v[next] - u[next] * v[i];
  }, 0)) / 2;
  const depth = Math.min(v1 - v0, area / (Math.max(...u) - Math.min(...u) - 0.46) - (sideInset - 0.25) * 2);
  const frontV = THREE.MathUtils.clamp(-depth / 2, v0, v1 - depth);
  const point = (l, d) => center.clone().addScaledVector(axis, l).addScaledVector(outward, frontV + d);
  return [point(u0, 0), point(u1, 0), point(u1, depth), point(u0, depth)];
}

export function standPlans(track, items) {
  const a2 = temporaryA2(track, items.find(s => s.name === 'A1'));
  const b2 = items.find(s => s.id === 184143132);
  const b2Turn1 = { id: 'b2-turn1', name: 'B2', section: 'B2', sectionDetail: 'B2-3',
    p: [...range(26, 31), ...range(36, 32)].map(i => b2.p[i]) };
  const b2Main = curvedStandPlan({ polygon: b2.p, curveOutline: curves[b2.id], regularSweep: true, depth: standDepths[b2.id] });
  const q1 = items.find(s => s.id === 183393132);
  const q1Main = curvedStandPlan({ polygon: q1.p, curveOutline: curves[q1.id], regularSweep: true, depth: standDepths[q1.id] });
  const q1Temp = { ...behindStand(q1Main, 0.48, 0.97, 9.7, 7.4, 'Q1-2'), name: 'Q1', section: 'Q1', sectionDetail: 'Q1-2' };
  const d = items.find(s => s.id === 469368057);
  const dMain = standAtTrack(track, [608, 232], [411, 90], 33, 13.5);
  const d5 = standAtTrack(track, [636, 324], [616, 259], 36, 12);
  const e = items.find(s => s.id === 467982372);
  const eMain = curvedStandPlan({
    polygon: [...eFront, e.p[0], e.p[24], e.p[20], e.p[17]],
    curveOutline: [range(0, eFront.length - 1), range(eFront.length, eFront.length + 3)],
    regularSweep: true, depth: 16,
  });
  const iStand = items.find(s => s.id === 184105033);
  const iMain = curvedStandPlan({ polygon: iStand.p, curveOutline: curves[iStand.id], regularSweep: true });
  const m = items.find(s => s.name === 'M');
  const mMain = curvedStandPlan({ polygon: m.p, curveOutline: curves[m.id], regularSweep: true });
  const a1 = items.find(s => s.name === 'A1');
  const o = items.find(s => s.name === 'O');
  const pStand = items.find(s => s.name === 'P');
  const v1 = items.find(s => s.name === 'V1');
  const v2 = items.find(s => s.name === 'V2');
  const q2 = items.filter(s => s.name === 'Q2');
  const q2Front = q2.flatMap(item => item.p.slice(2, 4)).sort(([x], [u]) => x - u);
  const q2Rear = q2.flatMap(item => [item.p[0], item.p.at(-1)]).sort(([x], [u]) => x - u);
  const q2Plan = curvedStandPlan({ polygon: [...q2Front, ...q2Rear],
    curveOutline: [range(0, q2Front.length - 1), range(q2Front.length, q2Front.length + q2Rear.length - 1)],
    regularSweep: true, depth: 12.4 });
  const v2Bands = [
    [0, 5.9, [0, 0.25, 0.82, 1], ['V2-1', 'V2-2', 'V2-3']],
    [6.2, 5.6, [0, 0.25, 0.82, 1], ['V2-4', 'V2-5', 'V2-6']],
    [12.1, 6.1, [0, 0.25, 0.79, 1], ['V2-7', 'V2-8', 'V2-9']],
  ];
  const cut = (item, plan, sections, starts) => sections.map((section, i) => ({
    ...item, id: section.toLowerCase(), section,
    curve: sliceStand(plan, starts[i] + (i > 0 ? 0.5 / plan.L : 0), starts[i + 1] - (i < sections.length - 1 ? 0.5 / plan.L : 0)),
  }));
  const replacements = new Map([
    [a1.id, [{ ...a1, sectionDetail: 'A1-1' }]],
    [b2.id, [{ ...b2, curve: b2Main, subsections: seatSections(['B2-1', 'B2-2'], [0, 0.48, 1]) }]],
    [q1.id, [{ ...q1, section: 'Q1', sectionDetail: 'Q1-1', curve: q1Main }]],
    [q2[0].id, [{ ...q2[0], curve: q2Plan }]],
    ...q2.slice(1).map(item => [item.id, []]),
    [d.id, [{ ...d, name: 'D', curve: dMain,
      subsections: seatSections(['D-4', 'D-3', 'D-2', 'D-1'], [0, 0.16, 0.30, 0.62, 1], { zoneByName: true }) }]],
    [469395390, [{ name: 'D', id: 'd-5', section: 'D-5', p: [], curve: d5 }]],
    [e.id, [{ ...e, curve: eMain,
      subsections: seatSections(['E-1', 'E-2'], [0, 0.49, 1], { zoneByName: true }) }]],
    // The ticketed I blocks are on the outside of the hairpin.
    [184004012, []],
    [iStand.id, cut(iStand, iMain, ['I-2', 'I-3', 'I-4', 'I-5'], [0, 0.25, 0.5, 0.75, 1])],
    [o.id, straightSections(o, track, ['O-1', 'O-2'], [0.05, 0.48, 0.94], 12, 8)],
    [pStand.id, straightSections(pStand, track, ['P-1', 'P-2', 'P-3'], [0, 0.23, 0.62, 1])],
    [v1.id, [{ ...v1, subsections: seatSections(['V1-1', 'V1-2'], [0, 0.42, 1]) }]],
  ]);
  const gSections = { 184102012: 'G-2', 184102013: 'G-5', 184102361: 'G-1', 184102368: 'G-3' };
  const additional = [
    a2, b2Turn1, q1Temp,
    ...straightSections(a1, track, ['A1-2'], [0.55, 1.16], 15, 6.2)
      .map(item => ({ ...item, sectionDetail: item.section, section: 'A1' })),
    behindStand(dMain, 0.49, 0.56, 15.5, 6.4, 'D-6'),
    behindStand(d5, 0.67, 0.90, 14.5, 6, 'D-7'),
    behindStand(d5, 0.17, 0.42, 14.5, 6, 'D-8'),
    behindStand(eMain, 0.22, 0.325, 19, 6.8, 'E-3'),
    behindStand(eMain, 0.36, 0.465, 19, 6.8, 'E-4'),
    behindStand(eMain, 0.51, 0.558, 19, 7.2, 'E-5'),
    behindStand(eMain, 0.618, 0.69, 19, 7.2, 'E-6'),
    extraStand('G-4', [V(-125, 52), V(-77, 72)], new THREE.Vector3(-0.38, 0, -0.925).normalize(), 11),
    extraStand('I-1', [V(-147, 318), V(-164, 271)], new THREE.Vector3(0.94, 0, -0.34).normalize(), 9),
    extraStand('I-6', [V(-171, 244), V(-176, 225)], new THREE.Vector3(0.97, 0, -0.25).normalize(), 7.5),
    behindStand(mMain, 0.16, 0.33, 13, 6.5, 'M-1'),
    behindStand(mMain, 0.37, 0.53, 13, 6.5, 'M-2'),
    behindStand(mMain, 0.57, 0.83, 13, 7.5, 'M-3'),
  ];
  return [...items.flatMap(item => replacements.get(item.id) ?? [item]), ...additional].map(({ id, name: code, p, section, sectionDetail, curve, subsections }) => {
    const numbered = /^[ABQV][12]$/.test(code);
    const family = numbered ? code[0] : ['D', 'E', 'G', 'I', 'M', 'O', 'P'].includes(code) ? code : null;
    const [turns, turnsEn, color] = data[code];
    const curveOutline = curves[id];
    const curvePlan = curve ?? (id === 183999763 ? standAtTrack(track, [-268, -250], [-295, -214], 20, 11)
      : curvedStandPlan({ polygon: p, curveOutline, regularSweep: true, depth: standDepths[id] }));
    const inset = [183393103, 184102012, 184102013].includes(id) ? 0.95 : 0.25;
    const straight = curvePlan ? null : straightOutline(p, track, inset, id === 184419745 ? 2.6 : 0.23);
    const straightPolygon = straight?.map(p => [p.x, -p.z]);
    const stations = curvePlan?.stations(0, curvePlan.L).filter((_, i) => i % 4 === 0) ?? [0, 1];
    if (curvePlan && stations.at(-1) !== curvePlan.L) stations.push(curvePlan.L);
    const front = curvePlan ? stations.map(s => curvePlan.at(s, 0)) : straight.slice(0, 2);
    const rear = curvePlan ? stations.map(s => curvePlan.at(s, curvePlan.D)) : straight.slice(2).reverse();
    const pad = [...front, ...rear.slice().reverse()].map(p => [p.x, -p.z]);
    const raisedTier = code === 'V2' || code === 'VIP';
    const baseY = raisedTier ? 4.2 : 0.18;
    const subsectionBounds = id === v2.id ? v2Bands.flatMap(([setback, depth, cuts, sections]) =>
      seatSections(sections, cuts, { depth: [setback, setback + depth] })) : subsections;
    const zoneKey = section ?? gSections[id] ?? code;
    const familyZoneKeys = [...new Set([zoneKey, ...(subsections?.filter(s => s.zoneByName).map(s => s.name) ?? [])])];
    const familyZones = family ? Object.fromEntries(familyZoneKeys.map(k => [k, suzukaZone(k, color)])) : undefined;
    return {
      id: `JP-${id}`, code, family, familyCode: family, familyId: `JP-${family}`,
      section: zoneKey, sectionDetail, subsectionBounds, familyZones,
      westboundSubsections: code === 'V1' || code === 'V2',
      familyTurns: familyApproaches[family] ?? (family ? [turns, turnsEn] : undefined),
      polygon: straightPolygon ?? pad, curvePlan, baseY, pad, raisedTier,
      name: `${code} 看台`, nameEn: `${code} Grandstand`,
      type: 'seats', color, covered: code === 'V2' || code === 'VIP', schematic: true,
      turns, turnsEn, gate: '参照赛事场图', gateEn: 'See official event map',
      desc: code === 'A2' ? '根据官方 A2 分区图定位的临时看台。尺寸、排座、出入口和标高为示意。'
        : '根据赛事票区图与地图轮廓建模。排数、座位、出入口和标高为示意。',
      descEn: code === 'A2' ? 'The temporary stand follows the official A2 seating map. Dimensions, rows, entrances and deck levels are illustrative.'
        : 'Based on the event seating map and mapped footprints. Rows, individual seats, entrances and deck levels are illustrative.',
      zones: { g: suzukaZone(zoneKey, color) },
    };
  });
}

export function buildStands(scene, track, specs) {
  const foundation = new THREE.Group();
  foundation.name = 'suzuka-stand-foundations';
  const batch = meshBatch(foundation), concrete = std('#a6a9ab', { side: THREE.DoubleSide }, 0.22);
  const fascia = std('#d5d9da', {}, 0.23), panel = std('#7a858b', { metalness: 0.18 }, 0.17);
  for (const s of specs) {
    const pos = [], idx = [];
    const path = s.pad.map(p => V(...p));
    for (let i = 0; i < path.length; i++) {
      const point = path[(i + 1) % path.length];
      const before = path[i];
      const steps = Math.max(1, Math.ceil(point.distanceTo(before) / 2));
      for (let j = 0; j < steps; j++) {
        const p = before.clone().lerp(point, j / steps), base = s.baseY;
        const index = pos.length / 3;
        pos.push(p.x, -0.08, p.z, p.x, base + 0.06, p.z);
        if (index) idx.push(index - 2, index - 1, index, index - 1, index + 1, index);
      }
    }
    const end = pos.length / 3;
    idx.push(end - 2, end - 1, 0, end - 1, 1, 0);
    const geo = new THREE.BufferGeometry().setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    batch.add(concrete, geo);
    if (s.raisedTier) {
      const a = path[0], b = path[1], axis = b.clone().sub(a).normalize();
      const out = a.clone().sub(path.at(-1)).normalize();
      const length = a.distanceTo(b), bays = Math.ceil(length / 3.6), width = length / bays;
      for (let i = 0; i < bays; i++) {
        const p = a.clone().addScaledVector(axis, (i + 0.5) * width).addScaledVector(out, 0.075);
        const top = s.baseY;
        const placed = (mat, w, h, d, y, along = 0) => batch.add(mat,
          new THREE.BoxGeometry(w, h, d).rotateY(Math.atan2(-axis.z, axis.x))
            .translate(p.x + along * axis.x, y, p.z + along * axis.z));
        placed(fascia, width + 0.01, 0.31, 0.24, top + 0.045);
        placed(panel, width - 0.27, 0.52, 0.19, top - 0.42);
        const postH = Math.min(3, top);
        placed(fascia, 0.17, postH, 0.27, top - postH / 2, width * 0.5 - 0.065);
      }
    }
  }
  batch.flush();
  scene.add(foundation);
  return buildSilverstoneStands(scene, track, specs);
}
