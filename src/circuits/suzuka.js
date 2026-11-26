import * as THREE from 'three';
import { t } from '../i18n.js';
import { V, std } from '../util.js';
import { buildTrack } from '../track.js';
import { buildCars } from '../cars.js';
import { buildEnvironment } from '../environment.js';
import { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR } from '../seatkit.js';
import { buildStartGrid } from './sg/landmarks.js';
import { crossover, buildCrossover, setCrossoverHeights } from './suzuka/crossover.js';
import { buildStands, standPlans } from './suzuka/stands.js';
import { pitPath, garageFrame, buildPit } from './suzuka/pit.js';
import { buildFootprints } from './suzuka/buildings.js';
import { buildSakura, buildWheel, buildWoodlandSakura } from './suzuka/landmarks.js';
import { buildSpectatorEntrance } from './suzuka/entrance.js';
import { connectedRoads } from './suzuka/road-network.js';
import { areas, blossomAreas, buildings, forestAt, GROUND_COLOR, parkingLink, roads, showRoad, VERGE_COLOR } from './suzuka/scenery.js';
import { buildLandCover, buildRoads, buildShoulders, indexPath, pondShorelines, polygonIndex } from './suzuka/terrain.js';
import { meshBatch, sign } from './suzuka/meshes.js';
import map from './suzuka/map-data.json';
import projection from './suzuka/projection.json';

const STANDS = [];
const TURNS = map.turns.map(([i, x, n]) => [i, x, n, 0]);
const groundAt = () => 0;
const TRUE_NORTH = [0, 1];
const venue = [-1080, -685, 1180, -685, 1180, 710, -1080, 710];
const sourceAt = indexPath(map.track.map(([x, n, y]) => V(x, n, y)), true);
const garage = map.buildings.find(b => b.id === 184422099);
const paddockAccess = map.roads.find(road => road.id === 1420756725);
const ponds = pondShorelines(areas);
const bridge = crossover(map.upper, map.lower);
const [upperX, upperN] = map.upper[0];
const upperHeight = map.track.find(([x, n]) => x === upperX && n === upperN)[2];
const woodlandAt = polygonIndex(map.areas.filter(a => a.kind === 'forest'));

function addStarter(scene, track, index) {
  const root = new THREE.Group();
  const p = track.pts[index], n = track.nor[index], tangent = track.tan[index];
  root.position.copy(p);
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(n, new THREE.Vector3(0, 1, 0), tangent));
  const steel = std('#c8cfca', { metalness: 0.31 }, 0.36), black = std('#293135', {}, 0.28);
  const batch = meshBatch(root), span = track.widthAt(index) * 2 + 5.2;
  for (const side of [-1, 1]) batch.box(steel, side * span / 2, 3.4, 0, 0.48, 7, 0.68);
  batch.box(steel, 0, 6.9, 0, span + 0.55, 0.70, 0.9);
  for (let i = -2; i <= 2; i++) {
    batch.box(black, i * 1.25, 6.25, 0, 0.87, 0.48, 0.58);
    batch.box(std('#802f30', {}, 0.2), i * 1.25, 6.25, -0.304, 0.60, 0.18, 0.04);
  }
  batch.flush();
  const panel = sign('SUZUKA CIRCUIT', 9.1, 0.66);
  panel.position.set(0, 6.9, -0.461); panel.rotation.y = Math.PI;
  root.add(panel);
  scene.add(root);
}

export default {
  id: 'jp', STANDS, TURNS, TRUE_NORTH, projection, venue,
  seatKit: { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR },
  center: [52, -40], defaultNight: false,
  home: { span: [1120, 640], ref: 2013, offsets: portrait => ({
    target: [0, 0, portrait ? -62 : 0], pos: portrait ? [580, 2370, 60] : [110, 2200, 940],
  }) },
  minimap: { orient: 'north-up', turnOffset: 28, startLine: '' },
  landmarks: [],
  async build(scene, { renderer, step, tr }) {
    await step(0.26, tr('铺设铃鹿赛道', 'Laying the Suzuka circuit'));
    let path, trackAt, pitAt, frame;
    const track = buildTrack(scene, {
      points: map.track, pit: map.pit, hw: 6.5, pitSide: 'right', wallGap: 3.3,
      runoff: true, runoffScale: 0.49,
      setTrackHeights: points => setCrossoverHeights(points, bridge, upperHeight),
      ads: [['#e1e0da', '#455653', 'SUZUKA CIRCUIT']],
      halfWidth(p) {
        const hit = sourceAt(p.x, p.z, p.y);
        return THREE.MathUtils.lerp(map.track[hit.i][3], map.track[(hit.i + 1) % map.track.length][3], hit.t) / 2;
      },
      finishAsphalt(material) {
        material.map.dispose();
        material.map = null;
        material.color.set('#3a3c3d');
      },
      prepareGround(track) {
        trackAt = indexPath(track.pts, true, 54);
        path = pitPath(map.pit);
        frame = garageFrame(path, garage);
        pitAt = indexPath(path.pts, false, 36);
      },
      groundHeight: groundAt,
      skipScenery(i, track) {
        const p = track.pts[i];
        return p.y > 0.02 || Math.hypot(p.x - bridge.center.x, p.z - bridge.center.z) < 23;
      },
      skipEdgeLine(i, side, track) {
        if (side !== -1) return false;
        const p = track.pts[i].clone().addScaledVector(track.nor[i], -track.widthAt(i) + 0.55);
        const hit = pitAt(p.x, p.z, p.y);
        return Boolean(hit && hit.d < 4.3 && Math.abs(hit.height - p.y) < 0.45);
      },
    });
    const crossoverModel = buildCrossover(scene, track, trackAt, bridge);
    buildShoulders(scene, track, pitAt, VERGE_COLOR);
    const control = track.nearest(474, -185);
    const controlLine = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * track.widthAt(control) - 0.82, 0.31).rotateX(-Math.PI / 2),
      std('#f4f4ed', { roughness: 0.69 }, 0.74),
    );
    controlLine.name = 'suzuka-control-line';
    controlLine.position.copy(track.pts[control]);
    controlLine.position.y += 0.214;
    controlLine.rotation.y = Math.atan2(track.tan[control].x, track.tan[control].z);
    scene.add(controlLine);
    const startDistance = (track.dist[control] + 300) % track.total;
    const start = track.dist.findIndex(d => d >= startDistance);
    buildStartGrid(scene, track, TURNS, 0, { startTurn: 18, slots: 22, startIndex: start });
    const p = track.pts[start], n = track.nor[start], w = track.widthAt(start) + 1.2;
    this.minimap.startLine = `<line class="mm-start" x1="${p.x - n.x * w}" y1="${p.z - n.z * w}" x2="${p.x + n.x * w}" y2="${p.z + n.z * w}"/>`;
    addStarter(scene, track, start);
    await step(0.46, tr('搭建维修区与围场', 'Building the pit lane and paddock'));
    const entrance = buildSpectatorEntrance(scene, blossomAreas[0].row);
    const pavedAreas = areas.filter(a => a.kind === 'parking' || a.kind === 'paved');
    const atPavement = polygonIndex(pavedAreas);
    const facilityEdges = indexPath([...buildings, ...pavedAreas].flatMap(({ p }) =>
      [...p.map(point => V(...point)), V(...p[0]), null]), false, 6);
    const venueTraffic = [paddockAccess.p[0], [768.77, -178.62]];
    const roadRuns = connectedRoads(roads, trackAt, track, showRoad, (x, n, road, end) => {
      const walk = ['footway', 'path', 'pedestrian'].includes(road.kind);
      if ((walk && entrance.atWalk(x, n)) || atPavement(x, n)) return true;
      if (parkingLink(road) && Math.hypot(x - 971.8, n - 563.49) < 0.15) return true;
      if (road.kind === 'service' && venueTraffic.some(([a, b]) => Math.hypot(x - a, n - b) < 1.75)) return true;
      return end && (facilityEdges(x, -n)?.d ?? Infinity) < road.w / 2 + 0.22;
    });
    const roadRoot = buildRoads(scene, roadRuns);
    entrance.buildPaving(roadRoot);
    const pit = buildPit(scene, path, track, trackAt, frame, garage, map.track, paddockAccess);
    const walls = buildFootprints(scene, buildings, groundAt);
    buildLandCover(roadRoot, areas, ponds, VERGE_COLOR);
    await step(0.61, tr('搭建看台与观众通道', 'Building grandstands and aisles'));
    const specs = standPlans(track, map.stands);
    const { stands, hitboxes } = buildStands(scene, track, specs);
    STANDS.splice(0, STANDS.length, ...stands.map(s => s.spec));
    await step(0.73, tr('栽植樱花并搭建摩天轮', 'Planting cherry trees and building the Circuit Wheel'));
    const builtAt = polygonIndex([...buildings, garage, ...specs.map(spec => ({ p: spec.pad })), ...ponds]);
    const roadAt = indexPath(roadRuns.flatMap(({ points }) => [...points, null]), false, 12);
    const busy = (x, n) => entrance.occupied(x, n) || Boolean(builtAt(x, n)) || (roadAt(x, -n)?.d ?? Infinity) < 2.8;
    const blockedBlossom = (x, n) => busy(x, n) || (trackAt(x, -n)?.d ?? Infinity) < 17;
    for (const area of blossomAreas) buildSakura(scene, groundAt, blockedBlossom, area);
    buildSakura(scene, groundAt, blockedBlossom, {
      id: 'welcome-square', seed: 392604, row: entrance.blossomRow, offsets: [-21.5, -14, -7.25, 7.25, 14, 21.5],
    });
    const wheel = buildWheel(scene, map.wheel, groundAt);
    const blockedTree = (x, n) => busy(x, n) || track.distTo(x, -n, 4) < 39 || (pitAt(x, -n)?.d ?? Infinity) < 19;
    buildWoodlandSakura(scene, (x, n) => forestAt(x, n) && woodlandAt(x, n), blockedTree, groundAt);
    const bridgeTarget = crossoverModel.center.clone().addScaledVector(crossoverModel.below, -9);
    this.landmarks = [
      ...blossomAreas.filter(area => area.name).map(({ name, nameEn, at: [x, n], view, labelOffset }) => {
        const y = groundAt(x, -n);
        return { name, nameEn, at: [x, n, y + 12], targetY: y + 4, view, labelOffset };
      }),
      { name: '铃鹿摩天轮', nameEn: 'Circuit Wheel', at: [wheel.x, wheel.n, wheel.y + 52], targetY: wheel.y + 24,
        view: [91, 20, 85] },
      { name: '8 字交叉桥', nameEn: 'Figure-eight crossover', at: [bridgeTarget.x, -bridgeTarget.z, crossoverModel.top + 6.5],
        targetY: bridgeTarget.y + 1.8, view: [5, 1.2, 37] },
    ];
    // 2026-03-29 14:00 JST. Azimuth clockwise from geographic north.
    const env = buildEnvironment(scene, track, stands, renderer, { center: this.center, trueNorth: TRUE_NORTH,
      sun: { az: 228.24, el: 47.67 }, poles: false });
    env.ground.material.dispose();
    env.ground.material = std(GROUND_COLOR, { depthWrite: false }, 0.08);
    env.sun.shadow.normalBias = 0.24;
    const cars = buildCars(scene, track);
    return { track, stands, hitboxes, env, cars, groundAt,
      camBuildings: [...walls, pit.camBuilding, crossoverModel.camBuilding], update(dt, camera) { wheel.update(dt); pit.update(camera); } };
  },
  info: {
    facts: () => [[t('赛道长度', 'Track length'), '5.807 km'], [t('弯道', 'Corners'), '18'],
      [t('正赛圈数', 'Race laps'), '53'], [t('基准', 'Reference'), t('2026 日本大奖赛', '2026 Japanese Grand Prix')]],
    notes: () => [
      t('比赛线路以地图为基准，场地使用平面底图。交叉桥及引坡、护墙、维修区尺寸与看台座席为示意。', 'The circuit follows mapped alignments on a flat site. The crossover and its approaches, barriers, pit dimensions and individual seats are illustrative.'),
      t('正门通道、S‑PLAZA 与首段 S 弯的樱花位置参考现场资料，其余林地采用春季樱花景观示意。', 'Cherry blossom locations around the Main Gate, S‑PLAZA and first Esses are based on venue references and photographs. Other wooded areas depict a stylized spring cherry blossom landscape.'),
    ],
    disclaimer: () => t('本网站为独立爱好者作品。观赛安排和购票信息以场馆及赛事组织方发布为准。', 'This is an independent fan project. Consult the venue and organiser for current access and ticket information.'),
    trademarks: () => t('场馆及赛事名称归各自权利人所有。', 'Venue and event names belong to their respective owners.'),
    sources: () => t(
      '地图 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap 贡献者</a>（ODbL）。赛事与景观参考 FIA、铃鹿赛道和铃鹿市观光协会。',
      'Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL). References: FIA, Suzuka Circuit and Suzuka City Tourism Association.',
    ),
    guide: {
      welcome: () => t('按 2026 日本大奖赛布局探索铃鹿。点击地图上的樱花标记可走近观赏。', 'Explore Suzuka in its 2026 Japanese Grand Prix layout. Tap a cherry blossom landmark for a closer view.'),
      night: () => t('默认按正赛时间显示白天。切到黑夜可看樱花道和摩天轮的示意夜景。', 'Daylight follows the race start time. Switch to night for an illustrative view of the cherry avenue and Circuit Wheel.'),
    },
  },
};
