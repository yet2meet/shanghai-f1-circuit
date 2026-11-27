import { V } from '../../util.js';
import { curvedStandPlan } from '../silverstone/stand-curve.js';
import layout from './stand-layout.json';

export const GATES = {
  A: { name: 'A/B · Vedano', zones: '1 2 3 4 5 23 24 25 26 27 28 29 30 35' },
  B: { name: 'B · Santa Maria', zones: '1 2 3 4 5 6 7 8 12 13 14 16 26 27 28 29 30 32 P' },
  C: { name: 'C · Costa Bassa', zones: '6 7 8 12 13 14 16 32 P' },
  D: { name: 'D · Lesmo', zones: '6 9 10 10BIS 11 12 13 14 16 18 32 33 34 P' },
  G: { name: 'G · Mirabello', zones: '9 10 10BIS 11 12 13 14 16 17 18 20 21 22 23 33 GF P' },
};

const catalog = [
  ['1', 'Centrale', '中央看台', 'blue'],
  ['GT', 'Gradinate Traguardo', '主直道阶梯看台', 'blue', '2 3 27 28 29 30'],
  ['4', 'Laterale Sinistra', '主直道左侧看台', 'blue'],
  ['5', 'Piscina', '泳池看台', 'yellow'],
  ['6', 'Alta Velocità', '高速看台', 'green', '6A 6B 6C'],
  ['7', 'Biassono', '比亚索诺看台', 'yellow'],
  ['8', 'Prima Variante', '第一减速弯看台', 'yellow', '8A 8B 8BIS'],
  ['9', 'Seconda Variante', '第二减速弯看台', 'green'],
  ['10', 'Roggia', '罗贾看台', 'green'],
  ['10 BIS', 'Lesmo 2 Interno', '第二莱斯莫弯内侧看台', 'green'],
  ['11', 'Serraglio', '塞拉利奥看台', 'green'],
  ['ASC', 'Ascari', '阿斯卡里看台', 'green', '12 13 14 16'],
  ['17', 'Ascari Esterna', '阿斯卡里外侧看台', 'red', '17A 17B'],
  ['18', 'Uscita Ascari A', '阿斯卡里出口 A 看台', 'orange'],
  ['20', 'Rettilineo Parabolica Esterna', '阿尔博雷托弯前直道外侧看台', 'red'],
  ['21', 'Laterale Parabolica', '阿尔博雷托弯侧看台', 'red', '21A 21B 21C 21D 21E'],
  ['22', 'Parabolica', '阿尔博雷托弯看台', 'red'],
  ['23', 'Parabolica Interna', '阿尔博雷托弯内侧看台', 'orange', '23A 23B'],
  ['24', 'Vedano', '韦达诺看台', 'blue'],
  ['25', 'Uscita Parabolica', '阿尔博雷托弯出口看台', 'blue'],
  ['26', 'Laterale Destra', '主直道右侧看台', 'blue', '26A 26B 26C'],
  ['32', 'Junior Interna', '小赛道内侧看台', 'orange'],
  ['33', 'Seconda Variante', '第二减速弯侧看台', 'green', '33A 33B'],
  ['34', 'Lesmo 1 Esterna', '第一莱斯莫弯外侧看台', 'green'],
  ['35', 'Vedano', '韦达诺分区看台', 'blue', '35A 35B 35C'],
  ['GF', 'Gradinate Interno Parabolica', '阿尔博雷托弯内侧阶梯看台', 'orange'],
];
const colors = { blue: '#497bab', green: '#40866d', red: '#a9484d', yellow: '#ccb94d', orange: '#d08454' };
const locations = {
  '1': ['起终点直道 · 正对维修区', 'Main straight · opposite pits'],
  GT: ['主直道 · 2 / 3 / 27–30 区', 'Main straight · Sections 2, 3, 27–30'],
  '4': ['主直道北段', 'North main straight'],
  '5': ['主直道北端', 'North end of main straight'],
  '6': ['1 号弯前内侧 · 6A–6C', 'Turn 1 approach inside · 6A–6C'],
  '7': ['1 号弯前外侧', 'Turn 1 approach outside'],
  '8': ['1–2 号弯 · 8A / 8B / 8 BIS', 'Turns 1–2 · 8A / 8B / 8 BIS'],
  '9': ['4–5 号弯', 'Turns 4–5'],
  '10': ['4–5 号弯出口', 'Turns 4–5 exit'],
  '10 BIS': ['7 号弯内侧', 'Inside Turn 7'],
  '11': ['塞拉利奥直道', 'Serraglio straight'],
  ASC: ['8–10 号弯 · 12 / 13 / 14 / 16', 'Turns 8–10 · 12 / 13 / 14 / 16'],
  '17': ['10 号弯外侧 · 17A / 17B', 'Outside Turn 10 · 17A / 17B'],
  '18': ['10 号弯出口', 'Turn 10 exit'],
  '20': ['10–11 号弯直道', 'Approach to Turn 11'],
  '21': ['11 号弯入口 · 21A–21E', 'Turn 11 entry · 21A–21E'],
  '22': ['11 号弯外侧', 'Outside Turn 11'],
  '23': ['11 号弯出口内侧 · 23A / 23B', 'Inside Turn 11 exit · 23A / 23B'],
  '24': ['11 号弯出口外侧', 'Outside Turn 11 exit'],
  '25': ['主直道南段 · 维修道入口', 'South main straight · pit entry'],
  '26': ['主直道南段 · 26A–26C', 'South main straight · 26A–26C'],
  '32': ['主直道内侧', 'Inside main straight'],
  '33': ['4–5 号弯入口 · 33A / 33B', 'Turns 4–5 entry · 33A / 33B'],
  '34': ['6 号弯外侧', 'Outside Turn 6'],
  '35': ['11 号弯出口 · 35A–35C', 'Turn 11 exit · 35A–35C'],
  GF: ['11 号弯内侧', 'Inside Turn 11'],
};
const roofs = new Set(['1', '4', '18', '22', '24', '26A', '26B', '26C']);
// 2026 Italian GP official 3-day weekend prices (EUR, VAT incl., monzanet.it).
const prices = {
  '1': 1344,
  '2': 444, '3': 444, '27': 444, '28': 444, '29': 444, '30': 444,
  '4': 684, '5': 594,
  '6A': 594, '6B': 684, '6C': 1008,
  '7': 684,
  '8A': 684, '8B': 684, '8BIS': 594,
  '9': 792, '10': 792, '10BIS': 444, '11': 444,
  '12': 594, '13': 594, '14': 594, '16': 792,
  '17A': 594, '17B': 594, '18': 594, '20': 444,
  '21A': 594, '21B': 594, '21C': 444, '21D': 444, '21E': 444,
  '22': 684, '23A': 444, '23B': 594, '24': 594, '25': 210,
  '26A': 1008, '26B': 684, '26C': 594,
  '32': 210, '33A': 792, '33B': 792, '34': 684,
  '35A': 444, '35B': 444, '35C': 444, 'GF': 210,
};
const special = {
  '8A': 'Prima Variante Esterna A', '8B': 'Prima Variante Esterna B', '8BIS': 'Uscita Prima Variante',
  '12': 'Ascari 3', '13': 'Ascari 4', '14': 'Ascari 2', '16': 'Ascari',
  '33A': 'Seconda Variante 1', '33B': 'Seconda Variante 2',
};

function gateText(codes) {
  return Object.values(GATES).filter(g => codes.some(code => {
    const key = code.replaceAll(' ', '');
    const group = key === '10BIS' ? key : key.match(/^\d+/)?.[0] ?? key;
    return g.zones.split(' ').includes(group);
  })).map(g => g.name).join(' / ');
}

function zoneSpec(key, code, name, color) {
  return {
    name: `${code} · ${name}`, nameEn: `${code} · ${name}`, color, price: prices[key] ?? null,
    tag: '2026 官价', tagEn: '2026 official',
    note: '2026 意大利大奖赛三日联票（含税）', noteEn: '2026 Italian GP 3-day pass (VAT incl.)',
  };
}

export function standPlans(map) {
  return layout.map((item, index) => {
    const keys = item.zones.map(z => z.replaceAll(' ', ''));
    const [code, en, zh, hue, members] = catalog.find(([id, , , , codes]) =>
      codes ? codes.split(' ').includes(keys[0]) : id.replaceAll(' ', '') === keys[0]);
    const color = colors[hue];
    const names = (members?.split(' ') ?? keys).map(key => {
      const display = key === '8BIS' ? '8 BIS' : key === '10BIS' ? '10 BIS' : key;
      const text = special[key] ?? (code === 'GT' ? `${en} ${key}` : members ? `${en} ${key.slice(-1)}` : en);
      return [key, zoneSpec(key, display, text, color)];
    });
    const zoneNames = Object.fromEntries(names);
    const polygon = map.standBodies[index];
    const [turns, turnsEn] = locations[code];
    const spec = {
      id: `IT-${keys[0]}`, code: item.zones[0], name: zh, nameEn: en,
      type: 'seats', schematic: true, polygon, color, viewAt: item.target,
      zones: { g: zoneNames[keys[0]] }, covered: roofs.has(keys[0]),
      bench: ['GT', '8', 'GF'].includes(code),
      gate: gateText(keys), gateEn: gateText(keys),
      turns, turnsEn,
      desc: '台体、入口和模型座席仅用于观察视线。推荐入口来自赛会观众指南。',
      descEn: 'Stand details, entrances and model seats illustrate sightlines. Recommended gates follow the event spectator guide.',
    };
    // Keep both views on the track side of the hospitality building.
    if (code === '1') {
      spec.overviewEye = [-258, 32, 147];
      spec.seatingEye = [-290, 8.8, 218];
    }
    if (members) {
      spec.family = code;
      spec.familyId = `IT-${code}`;
      spec.familyCode = code;
      spec.familyLabel = [zh, en];
      spec.familyZones = zoneNames;
      spec.familyTurns = [spec.turns, spec.turnsEn];
      spec.gate = spec.gateEn = gateText(members.split(' '));
      spec.section = keys[0];
      if (keys.length > 1) {
        // 8A occupies the upper rows and 8B the lower rows of one deck.
        spec.fractionalSubsectionDepth = true;
        spec.subsectionBounds = keys.map((name, i) => ({
          name, along: [0, 1], depth: i ? [0, 0.5] : [0.5, 1], zoneByName: true,
        }));
      }
    }
    if (item.arc) {
      const n = item.arc.length;
      spec.curveOutline = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => 2 * n - 1 - i)];
      spec.regularSweep = true;
      spec.depth = item.depth;
      spec.curvePlan = curvedStandPlan(spec);
    }
    return spec;
  });
}
