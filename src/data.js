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
    id: 'A', code: 'A', name: '主看台', nameEn: 'Main Grandstand', type: 'seats', color: '#d7262c',
    roofBottom: 29.75, // 顶棚底部高度（OSM），镜头需压在顶棚之下
    roofLength: 330,   // OSM 中顶棚沿看台方向的长度（看台本身 391 m，两端由“翼”覆盖）
    turns: '发车大直道 · 发车点 · 维修区 · 领奖台', turnsEn: 'Main straight · Start · Pit lane · Podium',
    gate: '1 号门', gateEn: 'Gate 1',
    desc: '双层主看台长 391 米、高 24.5 米，正对发车格、维修站与领奖台；两端的“翼”形结构横跨赛道与维修楼相连。官方票区分为 A铂金（上层中段）、A上（上层）和 A下（下层）。',
    descEn: 'A two-tier main grandstand, 391 m long and 24.5 m high, facing the starting grid, pit lane and podium. The "wing" structures at each end span the track to the pit building. Official zones: A Platinum (upper tier, centre), A Upper and A Lower.',
    base: 2.74, // 下层首排高 2.74 m（施工报道）
    realMain: true, // 按真实构造：外露框架后立面、16 部外部楼梯、43 根顶棚钢柱、顶棚底面红黄圆盘、层间包厢玻璃带
    tiers: [
      // 下层 2.74 → 12.1 m；上层 15.6 → 27 m（两层之间为包厢层）
      { rows: 17, rise: 0.585, zone: 'low' },
      // 铂金区位置按官方座位图量取：上层中段，自 1 号弯一端起约 35%–62% 的长度
      { rows: 22, rise: 0.543, gap: 3.2, lift: 3.5, zone: 'high', center: { zone: 'plat', fromT1: 0.35, toT1: 0.62 } },
    ],
    zones: {
      plat: { name: 'A铂金', nameEn: 'A Platinum', color: '#a8862a', price: 4680, day: null, note: '仅售三日票', noteEn: '3-day pass only' },
      high: { name: 'A上', nameEn: 'A Upper', color: '#d7262c', price: 3280, day: { fri: 550, sat: 990, sun: 2790 } },
      low: { name: 'A下', nameEn: 'A Lower', color: '#5b8fd1', price: 2580, day: { fri: 440, sat: 780, sun: 2230 } },
    },
  },
  {
    id: 'B', code: 'B', name: 'B 看台', nameEn: 'Grandstand B', type: 'seats', color: '#e9579a',
    turns: '大直道末端 · 1–3 号弯', turnsEn: 'End of main straight · Turns 1–3',
    gate: '1 / 2 号门', gateEn: 'Gates 1 / 2',
    desc: '沿 1–3 号弯外侧环绕的三段看台，俯瞰不断收紧的复合右弯，是起步后首圈缠斗的观赛点。',
    descEn: 'Three sections wrapping around the outside of Turns 1–3, overlooking the tightening right-hander — the place to watch first-lap battles.',
    base: 1.8, height: 15, maxRows: 30,
    curve: true, // B1 直段 + B2、B3 两段弧形，是一座沿 1–3 号弯连续环绕的看台（OSM 中 B2、B3 为弧形轮廓）
    tiers: [{ zone: 'b' }],
    zones: { b: { name: 'B', color: '#e9579a', price: 2180, day: { fri: 410, sat: 740, sun: 1890 } } },
  },
  {
    id: 'H', code: 'H', name: 'H 看台', nameEn: 'Grandstand H', type: 'seats', color: '#6f4ba3',
    roofBottom: 18,
    turns: '1.2 km 长直道末端 · 14 号发卡弯刹车区', turnsEn: 'End of the 1.2 km back straight · Turn 14 braking zone',
    gate: '9 号门', gateEn: 'Gate 9',
    desc: '13 片荷叶形顶棚下的看台，位于长直道末端，赛车全速抵达后在 14 号发卡弯前重刹。与 K 看台同属 H/K 票区。',
    descEn: 'Seats beneath 13 lotus-leaf roofs at the end of the back straight, where cars brake hard from top speed for the Turn 14 hairpin. Shares the H/K zone with Grandstand K.',
    base: 1.6,
    tiers: [{ zone: 'hk' }],
    zones: { hk: { name: 'H/K', color: '#6f4ba3', price: 1680, day: { fri: 330, sat: 660, sun: 1450 } } },
  },
  {
    id: 'K', code: 'K', name: 'K 看台', nameEn: 'Grandstand K', type: 'seats', color: '#6f4ba3',
    roofBottom: 18,
    turns: '长直道末端 · 14 号发卡弯', turnsEn: 'End of back straight · Turn 14 hairpin',
    gate: '1 号门', gateEn: 'Gate 1',
    desc: '与 H 看台隔着长直道相望，13 片荷叶形顶棚，可以看到赛车全速驶来后在发卡弯前重刹。与 H 看台同属 H/K 票区。',
    descEn: 'Facing Grandstand H across the back straight under 13 lotus-leaf roofs: watch cars arrive at full speed and brake for the hairpin. Shares the H/K zone with Grandstand H.',
    base: 1.6,
    tiers: [{ zone: 'hk' }],
    zones: { hk: { name: 'H/K', color: '#6f4ba3', price: 1680, day: { fri: 330, sat: 660, sun: 1450 } } },
  },
  {
    id: 'E', code: 'E', name: 'E 看台', nameEn: 'Grandstand E', type: 'seats', color: '#e3dc3d',
    turns: '11–13 号弯组合', turnsEn: 'Turns 11–13',
    gate: '6 号门', gateEn: 'Gate 6',
    desc: '2026 赛季再度开放，沿 11–13 号弯外侧排开的一组小看台，可以看到赛车切入 11 号弯、沿 12–13 号长右弯加速驶上长直道。购买 E 看台门票可享受免费接驳。',
    descEn: 'Reopened for 2026: a row of small stands outside Turns 11–13, watching cars turn into 11 and accelerate through the long 12–13 right-hander onto the back straight. E tickets include a free shuttle.',
    base: 1.2, height: 7.5,
    tiers: [{ zone: 'e' }],
    zones: { e: { name: 'E', color: '#e3dc3d', price: 1580, day: null, note: '仅售三日票', noteEn: '3-day pass only' } },
  },
  {
    id: 'C', code: 'C', name: 'C 草地', nameEn: 'C Grass', type: 'grass', color: '#7cc36c',
    // OpenStreetMap 没有 C 草地的轮廓，官方座位图只标出“6 号弯外侧”，这里只标注位置，不建模草坡
    approx: [205, 515],
    turns: '6 号发卡弯外侧（位置示意）', turnsEn: 'Outside the Turn 6 hairpin (approximate)', gate: '2 号门', gateEn: 'Gate 2',
    desc: '草地看台，不对号入座。官方座位图只标出了大致位置（6 号发卡弯外侧），没有找到精确轮廓，因此模型中只标注位置。',
    descEn: 'General-admission grass area. The official seating map only marks its rough position (outside the Turn 6 hairpin) and no exact outline was found, so the model only marks the location.',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票', noteEn: 'Grass · 3-day pass only' } },
  },
  {
    id: 'F', code: 'F', name: 'F 草地', nameEn: 'F Grass', type: 'grass', color: '#7cc36c',
    turns: '长直道中段', turnsEn: 'Middle of the back straight', gate: '9 号门', gateEn: 'Gate 9',
    desc: '沿 1.2 km 长直道铺开的近 500 米草地看台，不对号入座，近距离感受全油门尾速。',
    descEn: 'Nearly 500 m of grass banking along the 1.2 km back straight — general admission, close to cars at full throttle.',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票', noteEn: 'Grass · 3-day pass only' } },
  },
  {
    id: 'J', code: 'J', name: 'J 草地', nameEn: 'J Grass', type: 'grass', color: '#7cc36c',
    turns: '14 号发卡弯外侧', turnsEn: 'Outside the Turn 14 hairpin', gate: '9 号门', gateEn: 'Gate 9',
    desc: '位于 14 号发卡弯外、H 与 K 看台之间的草坡，正对重刹入弯与超车点。',
    descEn: 'A grass bank outside the Turn 14 hairpin between Grandstands H and K, facing the heavy braking zone and overtaking spot.',
    zones: { g: { name: 'C/F/J', color: '#7cc36c', price: 480, day: null, note: '草地票 · 仅售三日票', noteEn: 'Grass · 3-day pass only' } },
  },
  {
    id: 'P', code: 'P', name: '围场俱乐部', nameEn: 'Paddock Club', type: 'club', color: '#c8102e',
    turns: '维修区一侧 · Paddock Club', turnsEn: 'Pit lane side · Paddock Club', gate: 'P1 停车场接驳', gateEn: 'Shuttle from car park P1',
    desc: '官方贵宾产品“围场俱乐部 PADDOCK CLUB”，位于维修区一侧。官方另有主看台会所、一号弯俱乐部、冲刺俱乐部等贵宾产品，位置仅有示意，未建模。',
    descEn: 'The official hospitality product PADDOCK CLUB, beside the pit lane. Other hospitality products (Main Grandstand Lounge, Turn 1 Club, Sprint Club) only have indicative locations and are not modelled.',
    zones: { p: { name: '围场俱乐部', nameEn: 'Paddock Club', color: '#c8102e', price: 42800, day: null, note: '仅售三日票 · 贵宾产品', noteEn: '3-day pass only · Hospitality' } },
  },
];

// 2026 赛季 11 支车队，按维修区车库顺序排列：
//   车库按上一赛季（2025）车队积分榜排名分配，冠军车队使用最靠近维修通道入口的车库（formula1.com 说明）。
//   2025 车队榜：迈凯伦、梅赛德斯、红牛、法拉利、威廉姆斯、Racing Bulls、阿斯顿·马丁、哈斯、Sauber（2026 起为奥迪）、Alpine；
//   凯迪拉克为 2026 年新加入的第 11 支车队。
// color 为各队常用的代表色；livery 为赛车涂装的主色 / 副色 / 点缀色（均为近似值，非官方色值）；
// logo 由 public/brand/manifest.json 提供（可选）。
export const TEAMS = [
  { id: 'mclaren', name: 'McLaren', zh: '迈凯伦', color: '#ff8000', text: '#111111', livery: ['#ff8000', '#1b1b1f', '#ff8000'] },
  { id: 'mercedes', name: 'Mercedes', zh: '梅赛德斯', color: '#27f4d2', text: '#111111', livery: ['#1c1d21', '#c9ced4', '#27f4d2'] },
  { id: 'redbull', name: 'Red Bull Racing', zh: '红牛', color: '#3671c6', text: '#ffffff', livery: ['#1b2a4a', '#e10600', '#ffcc00'] },
  { id: 'ferrari', name: 'Ferrari', zh: '法拉利', color: '#e8002d', text: '#ffffff', livery: ['#dc0000', '#f4f4f4', '#ffd800'] },
  { id: 'williams', name: 'Williams', zh: '威廉姆斯', color: '#64c4ff', text: '#0b1d3a', livery: ['#0a1e5c', '#00a3e0', '#ffffff'] },
  { id: 'racingbulls', name: 'Racing Bulls', zh: 'Racing Bulls', color: '#6692ff', text: '#ffffff', livery: ['#f4f5f7', '#1634cc', '#e10600'] },
  { id: 'astonmartin', name: 'Aston Martin', zh: '阿斯顿·马丁', color: '#229971', text: '#ffffff', livery: ['#00594f', '#cedc00', '#00594f'] },
  { id: 'haas', name: 'Haas', zh: '哈斯', color: '#b6babd', text: '#b0001e', livery: ['#f2f2f2', '#1b1b1f', '#e10600'] },
  { id: 'audi', name: 'Audi', zh: '奥迪', color: '#a7adb3', text: '#c4001c', livery: ['#b8bcc1', '#1b1b1f', '#e2001a'] },
  { id: 'alpine', name: 'Alpine', zh: 'Alpine', color: '#ff87bc', text: '#0a2a5c', livery: ['#0f3a8a', '#ff87bc', '#1b1b1f'] },
  { id: 'cadillac', name: 'Cadillac', zh: '凯迪拉克', color: '#1e1e24', text: '#ffffff', livery: ['#111114', '#f2f2f2', '#c9a14a'] },
];
export const TEAM_COLORS = TEAMS.map((t) => t.color);
