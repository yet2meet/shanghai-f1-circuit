// 2025 赛事图可对应到的 OSM 看台轮廓；平面尺寸及朝向按轮廓投影估计。
// 排数、座位、出入口及高度仍为示意；同名轮廓不等同于官方票区划分。
import { Color } from 'three';
import osm from './osm-data.json';

const names = new Set([
  'Hamilton Straight A', 'Farm Curve', 'The View', 'Abbey', 'International Paddock',
  'Luffield Corner', 'Becketts', 'Chapel', 'Village B', 'Woodcote A',
  'National Pit Straight', 'Luffield', 'Woodcote B', 'Copse A', 'Copse B',
  'Copse C', 'Copse D', 'Stirling A', 'Stirling B', 'Village A', 'Vale', 'Club A', 'Club B',
  'Stowe A', 'Stowe B', 'Stowe C',
]);
// 覆盖状态参考银石官网 2026 看台 FAQ；是否与 2025 完全一致仍需照片复核。
const covered2026 = new Set(['Abbey B', 'Village B', 'Luffield Corner', 'Luffield', 'Woodcote A', 'Woodcote B', 'Stirling B', 'Copse A', 'Copse B', 'Copse C', 'Becketts', 'Club Corner', 'Hamilton Straight A']);

// 预览识别色按看台名称固定，各分区以同色系明度区分。
const standColors = {
  'Hamilton Straight': '#b33146',
  'Farm Curve': '#49793d',
  'The View': '#345d88',
  'Abbey': '#6c4c9e',
  'International Paddock': '#86475f',
  'Luffield Corner': '#a74b3f',
  'Becketts': '#ac3a77',
  'Chapel': '#327a52',
  'Village': '#217b82',
  'Woodcote': '#8d6c20',
  'National Pits Straight': '#496088',
  'Luffield': '#5b3c88',
  'Copse': '#3453a4',
  'Stirling': '#3b7466',
  'Vale': '#824697',
  'Club A': '#286278',
  'Club Corner': '#73693c',
  'Landostand': '#bf5725',
};
const sectionLightness = { A: 0, B: 0.047, C: 0.094, D: 0.141 };

const standLocations = {
  'Farm Curve': ['2–3 号弯外侧', 'Outside Turns 2–3'],
  'The View': ['1–2 号弯内侧', 'Inside Turns 1–2'],
  'International Paddock': ['1–2 号弯内侧', 'Inside Turns 1–2'],
  'Luffield Corner': ['7 号弯入口', 'Turn 7 entry'],
  'Luffield': ['7 号弯外侧', 'Outside Turn 7'],
  'National Pits Straight': ['8–9 号弯老维修直道', 'National Pit Straight (Turns 8–9)'],
  'Becketts': ['11–13 号弯外侧', 'Outside Turns 11–13'],
  'Chapel': ['14 号弯外侧', 'Outside Turn 14'],
  'Vale': ['16 号弯', 'Turn 16'],
  'Club A': ['17 号弯', 'Turn 17'],
  'Club Corner': ['17–18 号弯', 'Turns 17–18'],
};
const familyLocations = {
  'Hamilton Straight': ['起终点直道 · 正对维修区', 'Start/finish straight · opposite pits'],
  Abbey: ['1 号弯 · A / B 区', 'Turn 1 · Sections A–B'],
  Village: ['3–4 号弯 · A / B 区', 'Turns 3–4 · Sections A–B'],
  Woodcote: ['8 号弯 · A / B 区', 'Turn 8 · Sections A–B'],
  Stirling: ['9 号弯入口 · A / B 区', 'Turn 9 entry · Sections A–B'],
  Copse: ['9 号弯 · A–D 区', 'Turn 9 · Sections A–D'],
  Landostand: ['15 号弯（Stowe）· A–D 区', 'Turn 15 (Stowe) · Sections A–D'],
};

// 官方图标出分区，未提供测量边界。沿比赛方向按相对比例分割作预览。
function splitAlongTrack(item, track, ratio = 0.5) {
  const p = item.p, center = p.reduce((a, v) => [a[0] + v[0] / p.length, a[1] + v[1] / p.length], [0, 0]);
  let axis = [1, 0], max = 0;
  p.forEach((a, i) => { const b = p[(i + 1) % p.length], d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d); if (l > max) { max = l; axis = d.map(v => v / l); } });
  const tangent = track.tan[track.nearest(center[0], -center[1])];
  if (axis[0] * tangent.x - axis[1] * tangent.z < 0) axis = axis.map(v => -v);
  const project = (q) => q[0] * axis[0] + q[1] * axis[1];
  const values = p.map(project), low = Math.min(...values), cut = low + (Math.max(...values) - low) * ratio;
  const half = (lower) => {
    const result = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], va = project(a), vb = project(b);
      const ia = lower ? va <= cut : va >= cut, ib = lower ? vb <= cut : vb >= cut;
      if (ia) result.push(a);
      if (ia !== ib) { const t = (cut - va) / (vb - va); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return result;
  };
  return [half(true), half(false)];
}

export function silverstoneStandSpecs(track) {
  const sources = [...osm.stands, ...osm.buildings].filter(s => names.has(s.name));
  // 2025 图 37 在弯心外，38 和 39 排在出弯侧。保持原有页面顺序和 ID。
  const exitStand = sources.find(s => s.name === 'Stowe C');
  const [landostandC, landostandD] = splitAlongTrack(exitStand, track, 0.69);
  const items = sources.flatMap((item) => {
    if (item.name === 'Abbey') {
      const labels = ['Abbey A', 'Abbey B'];
      return splitAlongTrack(item, track).map((p, i) => ({ ...item, name: labels[i], p, divided: true }));
    }
    if (item.name === 'Stowe B') return [
      { ...item, name: 'Landostand B', renamed: true },
      { ...exitStand, name: 'Landostand C', p: landostandC, divided: true },
    ];
    if (item === exitStand) return [{ ...item, name: 'Landostand D', p: landostandD, divided: true }];
    const aliases = { 'Stowe A': 'Landostand A', 'Club B': 'Club Corner', 'National Pit Straight': 'National Pits Straight' };
    return [{ ...item, name: aliases[item.name] || item.name, renamed: !!aliases[item.name] }];
  });
  return items.map((item, index) => {
    const match = item.name.match(/^(Landostand|Copse|Abbey|Village|Woodcote|Stirling|Hamilton Straight) ([A-D])$/);
    const color = standColors[match?.[1] ?? item.name];
    const zoneColor = match ? `#${new Color(color).offsetHSL(0, 0, sectionLightness[match[2]]).getHexString()}` : color;
    const [turns, turnsEn] = standLocations[item.name] ?? familyLocations[match?.[1]] ?? [item.name, item.name];
    return {
      id: `GB${index}`, sourceId: item.id, code: String(index + 1), name: `${item.name} 看台`, nameEn: `${item.name} Grandstand`,
      family: match ? match[1] : null, section: match ? match[2] : null,
      familyTurns: match ? familyLocations[match[1]] : undefined,
      groupedDesc: '按看台汇总相邻分区。位置、分段与座位均为示意。',
      groupedDescEn: 'Adjacent sections are grouped into one grandstand. Layout and seating are illustrative.',
      type: 'seats', schematic: true, color,
      covered: covered2026.has(item.name),
      roofDirection: item.tags['roof:direction'],
      turns, turnsEn,
      gate: '待核实', gateEn: 'Unverified',
      desc: `以 OSM 看台轮廓定位。${item.divided ? '相邻分区的边界按赛事场地图估算。' : item.renamed ? '名称参考赛事场地图。' : ''}${covered2026.has(item.name) ? '顶棚参考其他年份的官网资料，比赛当年状态待核。' : ''}模型外形、排数、座号和出入口均为示意。`,
      descEn: `Located from an OSM footprint. ${item.divided ? 'Section boundaries are estimated using the event map. ' : item.renamed ? 'The name follows the event map. ' : ''}${covered2026.has(item.name) ? 'The roof follows official information from another year; its event-year status needs verification. ' : ''}Shape, rows, seat numbers and entrances are schematic.`,
      zones: { g: { name: '模型座席', nameEn: 'Model seating', color: zoneColor, price: null, note: '排号、座号为模型计数', noteEn: 'Rows and seats are model numbers', tag: '示意', tagEn: 'Schematic' } },
      polygon: item.p,
    };
  });
}
