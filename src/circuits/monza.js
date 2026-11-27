import * as THREE from 'three';
import { t } from '../i18n.js';
import { buildCars } from '../cars.js';
import { buildEnvironment } from '../environment.js';
import { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR } from '../seatkit.js';
import { buildTrack } from '../track.js';
import { canvasTex, std, V } from '../util.js';
import { buildStartGrid } from './sg/landmarks.js';
import { buildSilverstoneStands } from './silverstone/stands.js';
import { indexPath } from './suzuka/terrain.js';
import { buildBanking } from './monza/banking.js';
import { buildPit, pitPath } from './monza/pit.js';
import { buildScenery, groundWithPortals } from './monza/scenery.js';
import { standPlans } from './monza/stands.js';
import map from './monza/map-data.json';
import projection from './monza/projection.json';

const STANDS = [];
const TRUE_NORTH = [0, 1];
const venue = [-735, -1440, 1115, -1440, 1115, 1320, -735, 1320];
const TURNS = [
  [1, -235, 389], [2, -205, 403], [3, -136, 894], [4, 503, 1019],
  [5, 523, 1048], [6, 880, 1135], [7, 923, 845], [8, 70, 123],
  [9, 62, 69], [10, 4, 23], [11, -189, -1008],
];
const groundAt = () => 0;
const source = 'https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf';
const ticketMap = 'https://www.monzanet.it/wp-content/uploads/2026/06/GP_F1_2026_LISTINO_PREZZI_6_17.pdf';
const spectatorGuide = 'https://www.monzanet.it/en/gp-spectator-information/';

function landmark(name, nameEn, target, eye, labelHeight = 8) {
  return { name, nameEn, at: [target.x, -target.z, labelHeight], targetY: target.y,
    view: eye.clone().sub(target).toArray() };
}

function fitAlboretoRunoff(track, footprint) {
  // Match the gravel and the fence to the mapped frontage of stand 22.
  const points = footprint.map(p => V(...p));
  const cross = (a, b) => a.x * b.z - a.z * b.x;
  const limits = [];
  track.pts.forEach((point, i) => {
    const normal = track.nor[i];
    for (let j = 0; j < points.length; j++) {
      const delta = points[j].clone().sub(point);
      const edge = points[(j + 1) % points.length].clone().sub(points[j]);
      const angle = cross(normal, edge);
      if (Math.abs(angle) < 1e-8) continue;
      const t = cross(delta, normal) / angle;
      const reach = cross(delta, edge) / angle;
      if (t < 0 || t > 1 || reach <= 0 || reach > 30) continue;
      limits.push({ distance: track.dist[i], width: reach - track.widthAt(i) - 3.5 - 2.65 });
    }
  });
  track.gwL.forEach((width, i) => {
    for (const limit of limits) {
      const taper = 0.28 * Math.abs(track.dist[i] - limit.distance);
      width = Math.min(width, Math.max(0, limit.width + taper));
    }
    track.gwL[i] = width;
  });
}

function controlLine(scene, track, index) {
  const texture = canvasTex(128, 16, (g, w, h) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#e9e7dd' : '#252726';
      g.fillRect(x * w / 16, y * h / 2, w / 16, h / 2);
    }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.widthAt(index) * 2 - 0.86, 0.76).rotateX(-Math.PI / 2),
    std('#ffffff', { map: texture, depthWrite: false }, 0.80));
  line.name = 'monza-control-line';
  line.position.copy(track.pts[index]).setY(0.208);
  line.rotation.y = Math.atan2(track.tan[index].x, track.tan[index].z);
  line.renderOrder = -0.95;
  scene.add(line);
}

export default {
  id: 'it', STANDS, TURNS, TRUE_NORTH, projection, venue,
  seatKit: { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR },
  center: [184, -45], defaultNight: false,
  home: { span: [980, 780], ref: 2900, offsets: portrait => ({
    target: [0, 0, 0], pos: portrait ? [60, 4020, 300] : [215, 3950, 670],
  }) },
  minimap: { orient: 'north-up', turnOffset: 35, startLine: '' },
  landmarks: [],
  async build(scene, { renderer, step, tr }) {
    await step(0.25, tr('铺设蒙扎现役赛道', 'Laying the Monza circuit'));
    const path = pitPath(map);
    const plans = standPlans(map);
    const parabolicaStand = plans.find(stand => stand.code === '22');
    const pitAt = indexPath(path.pts, false, 20);
    const cross = V(...map.crossings[34404729][0]).lerp(V(...map.crossings[34404729][1]), 0.5);
    const track = buildTrack(scene, {
      points: map.track, pit: map.pit, hw: 6, pitSide: 'right',
      wallGap: 2.9, runoff: true, runoffScale: 0.56, vergeColor: '#a2ad88',
      wallColor: '#aeb3ae',
      groundHeight: groundAt,
      halfWidth(p) {
        // The venue reports a 10–12 m range. Width stationing is indicative.
        return 5 + Math.max(1 - THREE.MathUtils.smoothstep(p.x, -179, 235), 1 - THREE.MathUtils.smoothstep(p.z, 560, 1130));
      },
      prepareGround: track => fitAlboretoRunoff(track, parabolicaStand.polygon),
      skipScenery(i, layout) {
        return layout.pts[i].distanceToSquared(cross) < 17 ** 2;
      },
      skipEdgeLine(i, side, layout) {
        if (side !== -1) return false;
        const p = layout.pts[i].clone().addScaledVector(layout.nor[i], -layout.widthAt(i) + 0.40);
        return (pitAt(p.x, p.z)?.d ?? Infinity) < 3.38;
      },
      finishAsphalt(material) {
        material.map.dispose();
        material.map = null;
        material.color.set('#383c3d');
      },
    });
    const start = track.nearest(-301, 227);
    const finish = track.nearest(-327, 492);
    buildStartGrid(scene, track, TURNS, 0, { startTurn: 11, startIndex: start, slots: 22 });
    controlLine(scene, track, finish);
    const p = track.pts[start], normal = track.nor[start], w = track.widthAt(start) + 1;
    this.minimap.startLine = `<line class="mm-start" x1="${p.x - normal.x * w}" y1="${p.z - normal.z * w}" x2="${p.x + normal.x * w}" y2="${p.z + normal.z * w}"/>`;

    await step(0.41, tr('搭建老高速环道与维修区', 'Building the historic oval and pits'));
    const banking = buildBanking(scene, map, track);
    const pit = buildPit(scene, track, map, path);
    await step(0.56, tr('接续观众入口与场内道路', 'Connecting spectator gates and paths'));
    const scenery = buildScenery(scene, track, map, path, banking);
    await step(0.68, tr('搭建看台与模型座席', 'Building grandstands and model seating'));
    const { stands, hitboxes } = buildSilverstoneStands(scene, track, plans);
    STANDS.splice(0, STANDS.length, ...stands.map(stand => stand.spec));

    this.landmarks = [
      landmark('塞拉利奥下穿', 'Serraglio underpass', banking.target, banking.eye, 14),
    ];
    // 2026-09-06 15:00 CEST. Azimuth clockwise from true north.
    const env = buildEnvironment(scene, track, stands, renderer, { center: this.center, trueNorth: TRUE_NORTH,
      sun: { az: 216.3, el: 45.7 }, poles: false });
    env.ground.material.dispose();
    env.ground.material = std('#d7d8ce', { depthWrite: false }, 0.08);
    groundWithPortals(env.ground, scenery.groundCuts);
    env.sun.shadow.normalBias = 0.25;
    const cars = buildCars(scene, track);
    return { track, stands, hitboxes, env, cars, groundAt,
      camBuildings: [...scenery.camBuildings, ...pit.camBuildings, banking.camBuilding],
      update(dt, camera) { pit.update(camera); },
    };
  },
  info: {
    facts: () => [[t('赛道长度', 'Track length'), '5.793 km'], [t('弯道', 'Corners'), t('11 个', '11')],
      [t('正赛圈数', 'Race laps'), '53'], [t('基准', 'Reference'), t('2026 意大利大奖赛', '2026 Italian Grand Prix')]],
    notes: () => [
      t('现役比赛线为顺时针。老高速环道是历史地标，在塞拉利奥跨越现役赛道。场地为平面基准，倾角剖面、桥底净空、引坡及维修区尺寸为示意。',
        'The modern race circuit runs clockwise. The historic oval crosses the active track at Serraglio. The site uses a flat datum. The banking profile, clearance, ramps and pit dimensions are illustrative.'),
      t('看台名称和推荐入场门来自赛事资料。台体细部、未测边界、步道接头和排座均为示意。',
        'Grandstand names and recommended gates follow the event references. Stand details, unmeasured boundaries, pedestrian connections and individual seats are illustrative.'),
    ],
    disclaimer: () => t('本网站为独立爱好者作品。购票及现场通行安排以赛事组织方发布的信息为准。',
      'This is an independent fan project. Consult the organiser for current ticketing and access information.'),
    trademarks: () => t('场馆及赛事名称归各自权利人所有。', 'Venue and event names belong to their respective owners.'),
    sources: () => `${t('地图数据', 'Map data')} © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) · <a href="${source}" target="_blank" rel="noopener">FIA 2026</a> · <a href="${ticketMap}" target="_blank" rel="noopener">${t('官方票区图', 'Official grandstand map')}</a> · <a href="${spectatorGuide}" target="_blank" rel="noopener">${t('观众入场指南', 'Spectator guide')}</a>`,
    guide: {
      welcome: () => t('按 2026 意大利大奖赛布局探索蒙扎。点击塞拉利奥下穿，可从赛道路面看老高速环道桥底。',
        'Explore Monza in its 2026 Italian Grand Prix layout. Tap Serraglio underpass to see the historic oval bridge from track level.'),
      night: () => t('默认显示正赛时间的日光，可切换示意夜景。', 'Daylight follows the race start time. The night view is illustrative.'),
    },
  },
};
