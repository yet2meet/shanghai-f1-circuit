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

// 票区与票价：全部取自 2026 F1 喜力中国大奖赛官方票价表（久事体育发布，本地宝 2025-12-05 转载）。
// 官方只划分到“票区”（A铂金 / A上 / A下 / B / H/K / E / C/F/J），没有公布更细的分区编号，这里不另造编号。
// day：周五 / 周六 / 周日单日票；null 表示仅售三日票。颜色沿用官方座位图的配色。
export const PRICE_SOURCE = '2026 F1 喜力中国大奖赛官方票价表';

// 看台的位置、长度、进深全部取自 OpenStreetMap 上的真实轮廓（见 osm-data.js 中的 OSM_STANDS）。
// tiers：座位层的划分。rows 为空时按真实进深自动排满（排距 0.85 m）。
export const STANDS = [
  {
    id: 'A', code: 'A', name: '主看台', type: 'seats', color: '#d7262c',
    roofBottom: 29.75, // 顶棚底部高度（OSM），镜头需压在顶棚之下
    turns: '发车大直道 · 发车点 · 维修区 · 领奖台',
    gate: '1 号门',
    desc: '双层主看台长 391 米、高 24.5 米，正对发车格、维修站与领奖台；两端的“翼”形结构横跨赛道与维修楼相连。官方票区分为 A铂金（上层中段）、A上（上层）和 A下（下层）。',
    base: 2.2,
    tiers: [
      { rows: 17, rise: 0.4, zone: 'low' },
      // 铂金区位置按官方座位图量取：上层中段，自 1 号弯一端起约 35%–62% 的长度
      { rows: 22, rise: 0.48, gap: 3.2, lift: 4.1, zone: 'high', center: { zone: 'plat', fromT1: 0.35, toT1: 0.62 } },
    ],
    zones: {
      plat: { name: 'A铂金', color: '#a8862a', price: 4680, day: null, note: '仅售三日票' },
      high: { name: 'A上', color: '#d7262c', price: 3280, day: { fri: 550, sat: 990, sun: 2790 } },
      low: { name: 'A下', color: '#5b8fd1', price: 2580, day: { fri: 440, sat: 780, sun: 2230 } },
    },
  },
  {
    id: 'B', code: 'B', name: 'B 看台', type: 'seats', color: '#e9579a',
    turns: '大直道末端 · 1–3 号弯',
    gate: '1 / 2 号门',
    desc: '沿 1–3 号弯外侧环绕的三段看台，俯瞰不断收紧的复合右弯，是起步后首圈缠斗的观赛点。',
    base: 1.8, height: 15, maxRows: 30,
    tiers: [{ zone: 'b' }],
    zones: { b: { name: 'B', color: '#e9579a', price: 2180, day: { fri: 410, sat: 740, sun: 1890 } } },
  },
  {
    id: 'H', code: 'H', name: 'H 看台', type: 'seats', color: '#6f4ba3',
    roofBottom: 18,
    turns: '1.2 km 长直道末端 · 14 号发卡弯刹车区',
    gate: '9 号门',
    desc: '13 片荷叶形顶棚下的看台，位于长直道末端，赛车全速抵达后在 14 号发卡弯前重刹。与 K 看台同属 H/K 票区。',
    base: 1.6,
    tiers: [{ zone: 'hk' }],
    zones: { hk: { name: 'H/K', color: '#6f4ba3', price: 1680, day: { fri: 330, sat: 660, sun: 1450 } } },
  },
  {
    id: 'K', code: 'K', name: 'K 看台', type: 'seats', color: '#6f4ba3',
    roofBottom: 18,
    turns: '长直道末端 · 14 号发卡弯',
    gate: '1 号门',
    desc: '与 H 看台隔着长直道相望，13 片荷叶形顶棚，可以看到赛车全速驶来后在发卡弯前重刹。与 H 看台同属 H/K 票区。',
    base: 1.6,
    tiers: [{ zone: 'hk' }],
    zones: { hk: { name: 'H/K', color: '#6f4ba3', price: 1680, day: { fri: 330, sat: 660, sun: 1450 } } },
  },
  {
    id: 'E', code: 'E', name: 'E 看台', type: 'seats', color: '#e3dc3d',
    turns: '11–13 号弯组合',
    gate: '6 号门',
    desc: '2026 赛季再度开放，沿 11–13 号弯外侧排开的一组小看台，可以看到赛车切入 11 号弯、沿 12–13 号长右弯加速驶上长直道。购买 E 看台门票可享受免费接驳。',
    base: 1.2, height: 7.5,
    tiers: [{ zone: 'e' }],
    zones: { e: { name: 'E', color: '#e3dc3d', price: 1580, day: null, note: '仅售三日票' } },
  },
  {
    id: 'C', code: 'C', name: 'C 草地', type: 'grass', color: '#7cc36c',
    // OpenStreetMap 没有 C 草地的轮廓，官方座位图只标出“6 号弯外侧”，这里只标注位置，不建模草坡
    approx: [205, 515],
    turns: '6 号发卡弯外侧（位置示意）', gate: '2 号门',
    desc: '草地看台，不对号入座。官方座位图只标出了大致位置（6 号发卡弯外侧），没有找到精确轮廓，因此模型中只标注位置。',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票' } },
  },
  {
    id: 'F', code: 'F', name: 'F 草地', type: 'grass', color: '#7cc36c',
    turns: '长直道中段', gate: '9 号门',
    desc: '沿 1.2 km 长直道铺开的近 500 米草地看台，不对号入座，近距离感受全油门尾速。',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票' } },
  },
  {
    id: 'J', code: 'J', name: 'J 草地', type: 'grass', color: '#7cc36c',
    turns: '14 号发卡弯外侧', gate: '9 号门',
    desc: '位于 14 号发卡弯外、H 与 K 看台之间的草坡，正对重刹入弯与超车点。',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票' } },
  },
  {
    id: 'P', code: 'P', name: '围场俱乐部', type: 'club', color: '#c8102e',
    turns: '维修区一侧 · Paddock Club', gate: 'P1 停车场接驳',
    desc: '官方贵宾产品“围场俱乐部 PADDOCK CLUB”，位于维修区一侧。官方另有主看台会所、一号弯俱乐部、冲刺俱乐部等贵宾产品，位置仅有示意，未建模。',
    zones: { p: { name: '围场俱乐部', color: '#c8102e', price: 42800, day: null, note: '仅售三日票 · 贵宾产品' } },
  },
];

// 2026 赛季 11 支车队，按维修区车库顺序排列：
//   车库按上一赛季（2025）车队积分榜排名分配，冠军车队使用最靠近维修通道入口的车库（formula1.com 说明）。
//   2025 车队榜：迈凯伦、梅赛德斯、红牛、法拉利、威廉姆斯、Racing Bulls、阿斯顿·马丁、哈斯、Sauber（2026 起为奥迪）、Alpine；
//   凯迪拉克为 2026 年新加入的第 11 支车队。
// color 为各队常用的代表色（近似值，非官方色值）；logo 由 public/brand/manifest.json 提供（可选）。
export const TEAMS = [
  { id: 'mclaren', name: 'McLaren', zh: '迈凯伦', color: '#ff8000', text: '#111111' },
  { id: 'mercedes', name: 'Mercedes', zh: '梅赛德斯', color: '#27f4d2', text: '#111111' },
  { id: 'redbull', name: 'Red Bull Racing', zh: '红牛', color: '#3671c6', text: '#ffffff' },
  { id: 'ferrari', name: 'Ferrari', zh: '法拉利', color: '#e8002d', text: '#ffffff' },
  { id: 'williams', name: 'Williams', zh: '威廉姆斯', color: '#64c4ff', text: '#0b1d3a' },
  { id: 'racingbulls', name: 'Racing Bulls', zh: 'Racing Bulls', color: '#6692ff', text: '#ffffff' },
  { id: 'astonmartin', name: 'Aston Martin', zh: '阿斯顿·马丁', color: '#229971', text: '#ffffff' },
  { id: 'haas', name: 'Haas', zh: '哈斯', color: '#b6babd', text: '#b0001e' },
  { id: 'audi', name: 'Audi', zh: '奥迪', color: '#a7adb3', text: '#c4001c' },
  { id: 'alpine', name: 'Alpine', zh: 'Alpine', color: '#ff87bc', text: '#0a2a5c' },
  { id: 'cadillac', name: 'Cadillac', zh: '凯迪拉克', color: '#1e1e24', text: '#ffffff' },
];
export const TEAM_COLORS = TEAMS.map((t) => t.color);
