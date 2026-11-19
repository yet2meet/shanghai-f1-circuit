// 滨海湾街道赛道（新加坡）档案。
// 只做查得到的内容（原则见 docs/场馆三维复刻指令模板.md）：
//   · 赛道中心线：bacinger/f1-circuits（MIT）sg-2008.geojson，4928 m，对应 2023 年起的 19 弯布局；按真实行驶方向（逆时针）排列
//   · 维修通道、道路、水域、公园、建筑（含高度，含 F1 Pit Building 与 Padang）：OpenStreetMap 真实测绘数据
//   · 新加坡摩天轮：位置与朝向取自 OSM，轮径 / 总高 / 轿厢数取自官网（见 sg/landmarks.js）
//   · 弯号：官方 19 弯的左右方向序列与中心线曲率位置对应（见 tools/gen-sg.mjs）
// 看台：位置取自官网各看台页面与官方 Circuit Park Map（见 sg/stands-data.js），范围与座位数官网未公布，3D 为沿赛道扫掠的示意体量；
// 没有可核实资料、因此没有做的：看台的具体范围与座位数、起终点线的精确位置、赛道灯杆位置、赛道上的赞助商广告布置。
import * as THREE from 'three';
import { t } from '../i18n.js';
import { TRACK_POINTS, TRUE_NORTH, TURNS, PIT, VENUE, CENTER, FLYER, PITB, MERLION, LANDMARKS, GROVE, OSM_BUILDINGS, OSM_AREAS, OSM_LINES } from './sg/data.js';
import { buildFlyer, buildMerlion, buildStartGrid, buildSkyParkDetail, buildSupertrees } from './sg/landmarks.js';
import { buildSGPitLane, SG_GARAGE_SLOTS } from './sg/pitlane.js';
import { buildPitBuilding } from '../pitbuilding.js';
import { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR } from '../seatkit.js';
import { buildSGStands } from './sg/stands.js';
import { SG_STANDS, SG_STANDS_NOTE } from './sg/stands-data.js';
import projection from './sg/projection.json';
import { buildTrack } from '../track.js';
import { buildEnvironment } from '../environment.js';
import { buildCars } from '../cars.js';
import { buildOSM } from '../osm.js';

// 护墙标识带：赛道名称 + 2026 赛事官方全称（formula1.com 与 singaporegp.sg 页面标题所用名称，新加坡航空为冠名赞助商）。
// 各弯道的具体赞助商布置没有可靠公开资料，因此不按位置摆放品牌，只用已确认的赛事名称（纯文字）。
const ADS = [
  ['#0d1b3e', '#ffffff', '滨海湾街道赛道'], ['#e10600', '#ffffff', 'MARINA BAY STREET CIRCUIT'],
  ['#0b3b8c', '#ffffff', 'FORMULA 1 SINGAPORE AIRLINES SINGAPORE GRAND PRIX 2026'], ['#15151e', '#ffd60a', 'F1 新加坡大奖赛 · SINGAPORE 2026'],
];

/** 由 OSM 的 F1 Pit Building 轮廓得出立面框架：面向赛道（东）一侧近似沿 n 方向的最长边为立面，进深取到轮廓最西处 */
function pitFrame({ p }) {
  let xMax = -Infinity, xMin = Infinity;
  for (let i = 0; i < p.length; i += 2) { xMax = Math.max(xMax, p[i]); xMin = Math.min(xMin, p[i]); }
  const n = p.length / 2;
  let best = null;
  for (let i = 0; i < n; i++) {
    const a = [p[i * 2], p[i * 2 + 1]], b = [p[((i + 1) % n) * 2], p[((i + 1) % n) * 2 + 1]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(b[0] - a[0]) < 4 && (a[0] + b[0]) / 2 > xMin + (xMax - xMin) * 0.5 && (!best || len > best.len)) best = { a, b, len };
  }
  const faceX = (best.a[0] + best.b[0]) / 2;
  let n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i] - faceX) < 2) { n0 = Math.min(n0, p[i + 1]); n1 = Math.max(n1, p[i + 1]); }
  const midN = (n0 + n1) / 2;
  const slope = (best.b[0] - best.a[0]) / (best.b[1] - best.a[1]);
  const x = best.a[0] + slope * (midN - best.a[1]);
  return { front: [x, midN], f: [1, -slope], L: (n1 - n0) * Math.hypot(1, slope), D: x - xMin };
}

export default {
  id: 'sg',
  STANDS: SG_STANDS, TURNS, TRUE_NORTH, projection,
  currency: 'S$', // 官网标价为新币
  // 地标标注（像弯号一样标在场景里，点击飞过去）：位置取自 OSM 同名地物
  landmarks: [
    LANDMARKS.mbs && { name: '滨海湾金沙', nameEn: 'Marina Bay Sands', at: [...LANDMARKS.mbs, 205], view: [-420, 150, -420] },
    MERLION && { name: '鱼尾狮公园', nameEn: 'Merlion Park', at: [...MERLION.c, 14], view: [40, 45, 130] },
    FLYER && { name: '新加坡摩天轮', nameEn: 'Singapore Flyer', at: [...FLYER.c, 170], view: [-260, 120, 300] },
    LANDMARKS.esplanade && { name: '滨海艺术中心', nameEn: 'Esplanade', at: [...LANDMARKS.esplanade, 24], view: [-200, 140, 280] },
    LANDMARKS.gardens && { name: '滨海湾花园', nameEn: 'Gardens by the Bay', at: [...LANDMARKS.gardens, 40], view: [-260, 160, -300] },
  ].filter(Boolean),
  seatKit: { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR },
  venue: VENUE,
  osmData: { OSM_BUILDINGS, OSM_AREAS, OSM_LINES },
  // 夜赛赛道（2026 年正赛 10 月 11 日当地时间 20:00 发车）：打开就是夜景
  defaultNight: true,
  center: CENTER,
  // 全景镜头：从南侧望向北，东西向的长边横在画面里，北在上
  home: {
    span: [1250, 1260], ref: 2013, // 按屏幕宽高比拉远，保证整条赛道进画面
    offsets: (portrait) => ({
      target: [0, 0, 0],
      pos: portrait ? [0, 1700, 330] : [60, 1000, 1080],
    }),
  },
  minimap: { orient: 'north-up', turnOffset: 46, coneScale: 0.6, startLine: '' },

  async build(scene, { renderer, step, tr, brand }) {
    await step(0.3, tr('铺设赛道', 'Laying the track'));
    // 赛道半宽取 6.5 m（路宽约 13 m，示意；街道赛护墙紧贴路面）
    const track = buildTrack(scene, { points: TRACK_POINTS, pit: PIT, hw: 6.5, runoff: false, ads: ADS, kerbCurv: 0.006, pitSide: 'left' });
    buildStartGrid(scene, track, TURNS); // 起终点线与发车格：位置依据官方 Circuit Park Map，近似
    // F1 Pit Building（P 房）：位置与轮廓取自 OSM；建模与上海维修楼同一套——车库、车队名称牌与标志、赛车、技师、工程师控制台、遥测屏
    const frame = pitFrame(PITB);
    const pitb = buildPitBuilding(scene, brand, {
      P: frame, trackPoints: TRACK_POINTS, trackLabel: { name: 'MARINA BAY', km: '4.927 km' },
      garageSlots: SG_GARAGE_SLOTS, showApron: false, podium: false,
      band: ['FORMULA 1', '新加坡大奖赛', 'SINGAPORE GRAND PRIX', '滨海湾街道赛道', 'MARINA BAY 2026', 'FORMULA 1'], tvLive: 'LIVE · MARINA BAY',
    });
    buildSGPitLane(scene, PIT, track, pitb);
    await step(0.55, tr('加载周边道路、水系与建筑', 'Loading roads, water and buildings'));
    // 立面：偏深的玻璃幕墙，每格两扇窗，夜里各自亮灯，远看是城市天际线的样子
    buildOSM(scene, { OSM_BUILDINGS, OSM_AREAS, OSM_LINES }, {
      treeKeepOut: [MERLION && { c: MERLION.c, r: 17 }].filter(Boolean), // 鱼尾狮周围不种树，雕像看得清
      durian: true, // 滨海艺术中心的两个圆顶壳（OSM 标为 dome，高 35 m）
      facade: { wall: '#9fa9b4', glass: '#566f88', cols: 2, glow: 0.05 },
      // 滨海湾金沙的塔楼（OSM 建筑部件，高 100 m 以上、在金沙一带）用深色玻璃幕墙
      specialFacade: (b) => (b.h > 100 && Math.hypot(b.p[0] - LANDMARKS.mbs[0], b.p[1] - LANDMARKS.mbs[1]) < 150 ? 'landmark' : null),
    });
    // 金沙空中花园：OSM 的平台（min_height 193 → 207 m）上加泳池、灯带、绿化
    const deck = OSM_BUILDINGS.find((b) => b.m > 150 && b.h > 200 && b.p.length > 20);
    if (deck && LANDMARKS.tower3) buildSkyParkDetail(scene, { deck, tower3: LANDMARKS.tower3 });
    if (GROVE) buildSupertrees(scene, GROVE); // 滨海湾花园的超级树（位置示意，树丛轮廓取自 OSM）
    if (MERLION) buildMerlion(scene, MERLION); // 鱼尾狮（高 8.6 m）：位置取自 OSM Merlion Fountain
    if (FLYER) buildFlyer(scene, FLYER); // 新加坡摩天轮：轮径 150 m、总高 165 m、28 个轿厢（官网 / Wikipedia）
    await step(0.72, tr('点亮城市与赛道', 'Lighting the city and the track'));
    // 白天的太阳：2026-10-09（周五）当地 16:30、北纬 1.3° 算出的方位 —— 高度角约 35°、方位角约 261°（偏西）；
    // 灯杆位置没有可靠资料，不布置照明灯杆，夜间靠路面自身的泛光材质与建筑灯光
    const { stands, hitboxes } = buildSGStands(scene, track, {
      turns: TURNS,
      buildings: [...OSM_BUILDINGS, { p: PITB.p, h: PITB.h }].map((b) => ({ p: b.p, h: b.h })),
      water: OSM_AREAS.filter((a) => a.k === 'water'),
      elevated: OSM_LINES.filter((l) => l.y > 0).map((l) => ({ p: l.p, w: l.w })),
      pitFace: { n0: frame.front[1] - frame.L / 2, n1: frame.front[1] + frame.L / 2 }, // 车库段在直道上的范围

    });
    const env = buildEnvironment(scene, track, stands, renderer, { center: CENTER, trueNorth: TRUE_NORTH, sun: { az: 261, el: 35 }, poles: false });
    const cars = buildCars(scene, track);
    const _p = new THREE.Vector3();
    return {
      track, stands, hitboxes, env, cars, camBuildings: [...OSM_BUILDINGS, { k: 'yes', h: PITB.h, m: 0, r: '', n: 'F1 Pit Building', p: PITB.p, q: [] }],
      /** 每帧：车库内部细节离维修楼 260 m 以内才画 */
      update(dt, camera) {
        pitb.axis.closestPointToPoint(camera.position, true, _p);
        const near = camera.position.distanceTo(_p) < 260;
        if (pitb.detail[0].visible !== near) for (const m of pitb.detail) m.visible = near;
      },
    };
  },

  // ───────────── 文案 ─────────────
  info: {
    facts: () => [
      [t('赛道长度', 'Track length'), '4.927 km'],
      [t('比赛圈数', 'Race laps'), '62'],
      [t('弯道', 'Corners'), t('19 个', '19')],
      [t('首届大奖赛', 'First Grand Prix'), '2008'],
      [t('2026 年正赛', '2026 race'), t('10 月 11 日 · 当地 20:00 发车', 'Oct 11 · 20:00 local start')],
      [t('最高时速', 'Top speed'), t('约 325 km/h（6–7 号弯之间）', '≈ 325 km/h (Turns 6–7)')],
      [t('比赛圈速纪录', 'Race lap record'), t('1:33.808（汉密尔顿，2025）', '1:33.808 (Hamilton, 2025)')],
      [t('有名字的弯', 'Named corners'), t('1 号 Sheares · 7 号 Memorial', 'T1 Sheares · T7 Memorial')],
    ],
    notes: () => [
      t('赛道主要由滨海湾一带的城市道路围合而成，逆时针行驶；1 号弯是起终点直道尽头的 90° 左弯，13 号弯是赛道上最紧的左发卡。', 'The circuit is laid out on city streets around Marina Bay and runs anti-clockwise. Turn 1 is a 90° left at the end of the pit straight; Turn 13 is the tightest left-hand hairpin on the lap.'),
      t('弯号位置按官方的 19 弯左右方向序列与中心线曲率对应；4、6、15 号是官方称为“kink”的小角度弯，位置为近似。', 'Turn numbers are matched to the centreline by the official left/right sequence of the 19 corners and the curvature of the track; Turns 4, 6 and 15 are the shallow “kinks” and their positions are approximate.'),
      t(`看台位置依据官网各看台页面与官方 Circuit Park Map（该图不按比例绘制）；官网没有公布看台的长度、进深、高度和座位数，3D 体量和座位数为示意（座位按常规尺寸排满，可以选座、进入座位视角，但座位数不是官方数字）。标价是官网当前显示的三日票成人价（页面为 2027 年赛事，未找到 2026 年价格）。${SG_STANDS_NOTE}`, 'Stand locations follow the official grandstand pages and the official Circuit Park Map (not drawn to scale). The website gives no length, depth, height or seat count, so the 3D volumes and seat counts are schematic (seats are laid out at standard spacing — you can pick seats and view from them, but the count is not the official capacity). Prices are the 3-day adult prices currently shown on the website (the page is for the 2027 event; no 2026 prices were found). Promenade and Chicane @ Turn 2 have no location description on the website and are not included.'),
      t('维修楼和维修通道的走向取自 OSM，41 个车库开间的分配以及每队一个比赛换胎位参考 FIA 2026 新加坡站维修通道图。快车道与车库侧工作区用白线分隔，车队指挥台沿维修墙布置。车库开间尺寸、通道宽度、指挥台位置和内部陈设为示意。', 'The pit building and pit lane alignment use OSM data. The FIA 2026 Singapore pit lane diagram guides the allocation of 41 garage bays and one race pit-stop position per team. A white line divides the fast lane from the garage-side working lane, with team consoles along the pit wall. Bay dimensions, lane widths, console positions and interiors are illustrative.'),
    ],
    disclaimer: () => t(
      '本网站为个人非官方作品，与 Formula 1、FIA、新加坡大奖赛组织方及各车队均无隶属、赞助或合作关系。赛道、道路与建筑根据公开测绘数据与资料还原，可能与实际存在差异，部分细节为示意（如路宽、灯光、看台与车库的外形尺寸）。票价为官网当前显示的标价，仅供参考，本站不提供任何售票服务，观赛与购票请以官方渠道发布为准。',
      'This is an unofficial personal project, not affiliated with, sponsored by or endorsed by Formula 1, the FIA, the Singapore Grand Prix organisers or any team. The track, roads and buildings are reconstructed from public survey data and sources and may differ from reality; some details are illustrative (such as road width, lighting, and the size of stands and garages). Prices are those currently shown on the website, for reference only. This site does not sell tickets — always rely on official channels for tickets and event information.'),
    trademarks: () => t(
      'Formula 1、F1 标志及各车队名称、标志均为其各自权利人所有，本站按项目方获得的授权使用，仅用于识别与展示。场景中出现的赛事名称 FORMULA 1 SINGAPORE AIRLINES SINGAPORE GRAND PRIX（新加坡航空为冠名赞助商）同属其各自权利人，仅以文字形式还原现场，不代表任何合作或背书。',
      'Formula 1, the F1 logo and all team names and logos are the property of their respective owners and are used under authorisation obtained by the project, for identification and display only. The event name FORMULA 1 SINGAPORE AIRLINES SINGAPORE GRAND PRIX (Singapore Airlines is the title sponsor) shown in the scene belongs to its respective owners; it appears as plain text to reflect the venue and implies no partnership or endorsement.'),
    sources: () => t(
      '赛道中心线：<a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">bacinger/f1-circuits</a>（MIT）。赛道资料与看台、标价：新加坡大奖赛官网（singaporegp.sg，含 Circuit Park Map）、Formula 1 官网。地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者（ODbL）。卫星影像（可选）© Esri, Maxar, Earthstar Geographics。三维渲染：three.js。',
      'Track centreline: <a href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noopener">bacinger/f1-circuits</a> (MIT). Circuit facts, grandstands and prices: Singapore Grand Prix website (singaporegp.sg, incl. Circuit Park Map) and formula1.com. Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL). Satellite imagery (optional) © Esri, Maxar, Earthstar Geographics. 3D rendering: three.js.'),
    guide: {
      welcome: () => t('赛道与周边建筑按真实测绘数据还原。花 20 秒了解几个基本操作。', 'The track and the surrounding buildings are rebuilt from real survey data. Here are the basics in 20 seconds.'),
      night: () => t('滨海湾是夜间比赛的赛道（2026 年正赛当地时间 20:00 发车），默认就是夜景。切到白天，可以看清赛道与周边环境。', 'Marina Bay is a night race (the 2026 race starts at 20:00 local time), so the view opens at night. Switch to day to see the track and its surroundings clearly.'),
    },
  },
};
