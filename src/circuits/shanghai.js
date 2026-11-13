// 上海国际赛车场档案：这条赛道的场景搭建、数据与文案。
// 搭建步骤与原 main.js 中的写法一致，只是搬到了这里，主程序对各条赛道一视同仁。
import * as THREE from 'three';
import { t } from '../i18n.js';
import { STANDS, TURNS, TRUE_NORTH } from '../data.js';
import { OSM_STANDS } from '../osm-data.js';
import { TRACK_POINTS } from '../track-data.js';
import { OSM_TRACK, OSM_PIT, OSM_VENUE, OSM_BUILDINGS, OSM_AREAS, OSM_LINES } from '../osm-data.js';
import projection from '../../tools/projection.json';
import { buildTrack } from '../track.js';
import { buildStands, seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR } from '../stands.js';
import { buildVenue } from '../venue.js';
import { buildEnvironment } from '../environment.js';
import { buildCars } from '../cars.js';
import { buildOSM } from '../osm.js';
import { buildKarting } from '../karting.js';
import { buildPitBuilding } from '../pitbuilding.js';

// 护墙标识带：赛车场名称 + 2026 赛事官方全称（喜力为冠名赞助商）。
// 各弯道的具体赞助商布置没有可靠公开资料，因此不按弯道摆放品牌，只用已确认的赛事名称。
const ADS = [
  ['#0d1b3e', '#ffffff', '上海国际赛车场'], ['#e10600', '#ffffff', 'SHANGHAI INTERNATIONAL CIRCUIT'],
  ['#0b7a3b', '#ffffff', 'FORMULA 1 HEINEKEN CHINESE GRAND PRIX 2026'], ['#15151e', '#ffd60a', 'F1 喜力中国大奖赛 · SHANGHAI 2026'],
];

// 场馆自身的范围（场景坐标）：落在里面的建筑按场内配套楼、顶棚、“翼”等专门造型处理
const venueZone = (p) => {
  let x0 = Infinity, n0 = Infinity, x1 = -Infinity, n1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); n0 = Math.min(n0, p[i + 1]); n1 = Math.max(n1, p[i + 1]); }
  const cx = (x0 + x1) / 2, cn = (n0 + n1) / 2;
  return cx > -900 && cx < 560 && cn > -620 && cn < 640;
};

export default {
  id: 'sh',
  STANDS, TURNS, TRUE_NORTH, projection,
  venue: OSM_VENUE,
  osmData: { OSM_BUILDINGS, OSM_AREAS, OSM_LINES },
  seatKit: { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR },
  defaultNight: false,
  center: [-200, -20],
  // 开场与“全景”镜头：从主看台一侧望向赛道，大直道横在近处，1 号弯在左、14 号发卡弯在右；竖屏时更接近俯视
  home: {
    span: [860, 620], ref: 2013,
    offsets: (portrait, wide) => ({
      target: [portrait ? -120 : -40, 0, wide ? -150 : 0],
      pos: portrait ? [-900, 1850, 40] : [-1680, 1560, 60],
    }),
  },
  minimap: {
    orient: 'x-up', turnOffset: 62,
    startLine: '<line class="mm-start" x1="-120" y1="478" x2="-120" y2="522"/>',
  },

  /** 搭建场景。step(进度, 文字) 让出主线程并更新启动页文字 */
  async build(scene, { renderer, step, brand, tr }) {
    await step(0.3, tr('铺设赛道', 'Laying the track'));
    const track = buildTrack(scene, { points: OSM_TRACK, pit: OSM_PIT, hw: 7.5, runoff: true, ads: ADS });
    await step(0.45, tr('搭建看台与座位', 'Building grandstands and seats'));
    const { stands, hitboxes } = buildStands(scene, track);
    await step(0.6, tr('搭建维修区与围场', 'Building the pit lane and paddock'));
    const pitb = buildPitBuilding(scene, brand, { P: OSM_STANDS.P[0], trackPoints: TRACK_POINTS });
    buildVenue(scene, track, pitb);
    await step(0.68, tr('加载周边道路、水系与建筑', 'Loading roads, water and buildings'));
    buildOSM(scene, { OSM_BUILDINGS, OSM_AREAS, OSM_LINES }, { venueZone });
    const karting = buildKarting(scene);
    await step(0.72, tr('种植草木与周边环境', 'Planting trees and surroundings'));
    // 白天的太阳：按正赛发车时刻（3 月中旬 15:00，北纬 31.3°）算出的真实方位 —— 高度角约 37°、方位角约 240°（西南偏西）
    const env = buildEnvironment(scene, track, stands, renderer, { center: this.center, trueNorth: TRUE_NORTH, sun: { az: 240, el: 37 } });
    const cars = buildCars(scene, track);
    const _p = new THREE.Vector3();
    return {
      track, stands, hitboxes, env, cars,
      /** 每帧：卡丁车、车库内部细节（离维修楼 260 m 以内才画） */
      update(dt, camera) {
        pitb.axis.closestPointToPoint(camera.position, true, _p);
        const near = camera.position.distanceTo(_p) < 260;
        if (pitb.detail[0].visible !== near) for (const m of pitb.detail) m.visible = near;
        karting.update(dt);
      },
    };
  },

  // ───────────── 文案（赛道信息面板、“关于”、分享海报）─────────────
  info: {
    // 赛道基本信息（FIA / F1 官方公布的赛道数据；圈速纪录截至 2025 赛季）
    facts: () => [
      [t('赛道长度', 'Track length'), '5.451 km'],
      [t('比赛圈数', 'Race laps'), '56'],
      [t('比赛距离', 'Race distance'), '305.066 km'],
      [t('弯道', 'Corners'), t('16 个（7 左 · 9 右）', '16 (7 left · 9 right)')],
      [t('最长直道', 'Longest straight'), t('约 1.2 km（13–14 号弯之间）', '≈ 1.2 km (Turns 13–14)')],
      [t('首届大奖赛', 'First Grand Prix'), '2004'],
      [t('赛道设计', 'Designer'), 'Hermann Tilke'],
      [t('比赛圈速纪录', 'Race lap record'), '1:32.238'],
    ],
    notes: () => [
      t('圈速纪录由迈克尔·舒马赫于 2004 年创造（截至 2025 赛季）。', 'Lap record set by Michael Schumacher in 2004 (as of the 2025 season).'),
      t('赛道平面取汉字“上”的造型；1–2 号弯是一个不断收紧的蜗牛形右弯，14 号弯是全年最重的刹车点之一。', 'The layout is shaped like the Chinese character 上 (“shang”). Turns 1–2 form a tightening snail-shaped right-hander; Turn 14 is one of the heaviest braking points of the season.'),
      t('赛车场建在嘉定原有的沼泽地上，地基靠大量桩基和发泡聚苯乙烯块稳定，整体地势平坦。', 'The circuit was built on former marshland in Jiading, stabilised with extensive piling and expanded polystyrene blocks; the site is essentially flat.'),
    ],
    disclaimer: () => t(
      '本网站为个人非官方作品，与 Formula 1、FIA、上海国际赛车场及各车队均无隶属、赞助或合作关系。票价、票区、座位与入口信息仅供参考，购票与观赛请以官方渠道发布为准；本站不提供任何售票服务。场馆、赛道与建筑模型根据公开测绘数据与资料还原，可能与实际存在差异，部分细节为推测或示意。',
      'This is an unofficial personal project, not affiliated with, sponsored by or endorsed by Formula 1, the FIA, Shanghai International Circuit or any team. Prices, zones, seats and gates are for reference only — always rely on official channels for tickets and event information. This site does not sell tickets. The venue, track and buildings are reconstructed from public survey data and sources and may differ from reality; some details are inferred or illustrative.'),
    trademarks: () => t(
      'Formula 1、F1 标志及各车队名称、标志均为其各自权利人所有，本站按项目方获得的授权使用，仅用于识别与展示。场景中出现的赛事冠名（喜力 Heineken）与官方计时（TAG Heuer）名称同属其各自权利人，仅以文字形式还原现场，不代表任何合作或背书。',
      'Formula 1, the F1 logo and all team names and logos are the property of their respective owners and are used under authorisation obtained by the project, for identification and display only. The race title sponsor (Heineken) and official timekeeper (TAG Heuer) names shown in the scene belong to their respective owners; they appear as plain text to reflect the venue and imply no partnership or endorsement.'),
    sources: () => t(
      '票价：2026 F1 喜力中国大奖赛官方票价表（久事体育）。地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者（ODbL）。卫星影像（可选）© Esri, Maxar, Earthstar Geographics。三维渲染：three.js。',
      'Prices: official 2026 F1 Heineken Chinese Grand Prix price list (Juss Sports). Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors (ODbL). Satellite imagery (optional) © Esri, Maxar, Earthstar Geographics. 3D rendering: three.js.'),
    // 新手引导里与本赛道相关的文字
    guide: {
      welcome: () => t('赛道、看台与建筑均按真实测绘数据还原。花 20 秒了解几个基本操作。', 'The track, grandstands and buildings are rebuilt from real survey data. Here are the basics in 20 seconds.'),
      night: () => t('切换到黑夜，赛道照明、看台和建筑的灯光会自动亮起。', 'Switch to night and the circuit floodlights, stands and buildings light up.'),
    },
  },
};
