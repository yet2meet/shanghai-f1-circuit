// 上海国际赛车场 —— 场地数据
// 坐标系：以发车大直道为基准 —— n = 大直道行进方向(+)，x = 行进方向右侧/维修区一侧(+)，单位：米。

export const CIRCUIT = {
  name: '上海国际赛车场',
  en: 'Shanghai International Circuit',
  length: '5.451 km',
  turns: 16,
  opened: 2004,
  address: '上海市嘉定区伊宁路 2000 号',
};

// 赛道中心线：OpenStreetMap 真实测绘数据（5459 m），换算见 tools/gen-osm.mjs；投影基准见 tools/gen-track.mjs
export { TRUE_NORTH } from './track-data.js';
export { OSM_TRACK as TRACK_POINTS } from './osm-data.js';

// 弯道编号位置（取自真实中心线上的弯心）
export const TURNS = [
  [1, -461, 479], [2, -331, 440], [3, -448, 395], [4, -390, 329],
  [5, -76, 467], [6, 155, 470], [7, -208, 235], [8, -72, 5],
  [9, -227, -112], [10, -165, -193], [11, 286, -40], [12, 262, 34],
  [13, 405, -13], [14, -814, -538], [15, -782, -491], [16, -508, -368],
];

// 票价说明：
//   verified: true  —— 来自 2026 赛季公开媒体报道的数字
//   verified: false —— 参考估价，仅用于演示，请以久事体育官方票务为准
// 看台的位置、长度、进深全部取自 OpenStreetMap 上的真实轮廓（见 osm-data.js 中的 OSM_STANDS）。
// tiers：座位层的划分。rows 为空时按真实进深自动排满（排距 0.85 m）。
export const STANDS = [
  {
    id: 'A', code: 'A', name: '主看台', type: 'seats', color: '#e0353b',
    turns: '发车大直道 · 起终点线 · 维修区 · 领奖台',
    gate: '1 号门', capacity: 29000,
    desc: '双层主看台长 391 米、高 24.5 米，正对发车格、维修站与领奖台；两端的“翼”形结构横跨赛道与维修楼相连，是上海赛车场最具标志性的建筑。',
    base: 2.2,
    tiers: [
      // suffix：分区编号后缀，上层为 A1D、A2D…，下层为 A1X、A2X…（可按官方座位图修改）
      { rows: 17, rise: 0.4, zone: 'low', suffix: 'X' },
      { rows: 22, rise: 0.48, gap: 3.2, lift: 4.1, zone: 'high', suffix: 'D', center: { zone: 'plat', from: 0.38, to: 0.62 } },
    ],
    zones: {
      plat: { name: '铂金区', color: '#f2b83b', price: 12900, day: null, verified: true, note: '仅售三日票' },
      high: { name: '高区（上层）', color: '#e0353b', price: 4280, day: 2580, verified: false },
      low: { name: '低区（下层）', color: '#4f6bed', price: 2980, day: 1880, verified: false },
    },
  },
  {
    id: 'B', code: 'B', name: 'B 看台', type: 'seats',
    turns: '大直道末端 · 1–3 号弯“蜗牛弯”',
    gate: '1 / 2 号门', capacity: 9000,
    desc: '由 B1、B2、B3 三段组成，沿 1–3 号弯外侧环绕，俯瞰不断收紧的复合右弯，是起步后首圈缠斗的最佳观赛点。',
    base: 1.8, height: 15, maxRows: 30,
    tiers: [{ zone: 'b' }],
    zones: { b: { name: 'B 看台', color: '#2f8cff', price: 2780, day: 1680, verified: false } },
  },
  {
    id: 'H', code: 'H', name: 'H 看台', type: 'seats',
    turns: '1.2 km 长直道末端 · 14 号发卡弯刹车区',
    gate: '9 号门', capacity: 10000,
    desc: '13 片荷叶形顶棚下的看台，赛车以 320 km/h 以上极速抵达后重刹入弯，是全场超车最密集的地方。',
    base: 1.6,
    tiers: [{ zone: 'h' }],
    zones: { h: { name: 'H 看台', color: '#b566f2', price: 3480, day: 2080, verified: false } },
  },
  {
    id: 'K', code: 'K', name: 'K 看台', type: 'seats',
    turns: '长直道末端 · 14 号发卡弯',
    gate: '1 号门', capacity: 8000,
    desc: '与 H 看台隔着长直道相望，14 片荷叶形顶棚，可以看到赛车全速驶来后在发卡弯前重刹。',
    base: 1.6,
    tiers: [{ zone: 'k' }],
    zones: { k: { name: 'K 看台', color: '#2bc4d8', price: 2580, day: 1580, verified: false } },
  },
  {
    id: 'E', code: 'E', name: 'E 看台', type: 'seats',
    turns: '11–13 号弯组合',
    gate: '6 号门', capacity: 5000,
    desc: '2026 赛季重新开放，由 11 段小看台沿 11–13 号弯外侧排开，可以看到赛车切入 11 号弯、沿 12–13 号长右弯加速驶上长直道。',
    base: 1.2, height: 7.5,
    tiers: [{ zone: 'e' }],
    zones: { e: { name: 'E 看台', color: '#ff4f86', price: 1980, day: 1180, verified: false } },
  },
  {
    id: 'F', code: 'F', name: 'F 草地', type: 'grass',
    turns: '长直道中段 · 内场一侧', gate: '9 号门', capacity: null,
    desc: '沿 1.2 km 长直道铺开的近 500 米草地看台，不对号入座，近距离感受全油门尾速。',
    zones: { g: { name: '草地票', color: '#34c759', price: 480, day: null, verified: true, note: '仅售三日票 · 起售价' } },
  },
  {
    id: 'J', code: 'J', name: 'J 草地', type: 'grass',
    turns: '14 号发卡弯外侧', gate: '9 号门', capacity: null,
    desc: '位于 14 号发卡弯外的大片草坡，正对重刹入弯与超车点。',
    zones: { g: { name: '草地票', color: '#34c759', price: 480, day: null, verified: true, note: '仅售三日票 · 起售价' } },
  },
  {
    id: 'L', code: 'L', name: 'L 草地', type: 'grass',
    turns: '16 号弯出弯 · 大直道起点', gate: '1 号门', capacity: null,
    desc: '紧挨主看台南端的草地，看赛车从 16 号弯出弯后全油门冲上大直道。',
    zones: { g: { name: '草地票', color: '#34c759', price: 480, day: null, verified: true, note: '仅售三日票 · 起售价' } },
  },
  {
    id: 'P', code: 'P', name: '围场俱乐部', type: 'club',
    turns: '维修区上方 · 俯瞰车队车库', gate: 'P1 停车场接驳', capacity: null,
    desc: '位于维修楼二层的顶级款待区，含围场通行、维修区通道漫步与全程餐饮。',
    zones: { p: { name: '围场俱乐部', color: '#8e8e93', price: 42800, day: null, verified: true, note: '三日款待套票' } },
  },
];

export const TEAM_COLORS = [
  '#e8002d', '#27f4d2', '#3671c6', '#ff8000', '#229971',
  '#ff87bc', '#64c4ff', '#6692ff', '#52e252', '#b6babd',
];
