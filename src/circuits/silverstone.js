// 银石 2025 英国站场景。路线与建筑轮廓采用地图数据。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { t } from '../i18n.js';
import { V, makePath, ribbon, std } from '../util.js';
import { asGround, buildOSM } from '../osm.js';
import { buildTrack } from '../track.js';
import { buildEnvironment } from '../environment.js';
import { buildCars } from '../cars.js';
import { buildSilverstoneStands } from './silverstone/stands.js';
import { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR } from '../seatkit.js';
import { silverstoneStandSpecs } from './silverstone/stands-data.js';
import { buildSilverstonePit, SILVERSTONE_TEAMS } from './silverstone/pit.js';
import { buildStartGrid } from './sg/landmarks.js';
import { silverstoneRoads } from './silverstone/roads.js';
import { buildSilverstoneBuildings, FEATURE_BUILDINGS } from './silverstone/buildings.js';
import { buildSilverstoneSigns, SIGN_FOOTPRINTS } from './silverstone/signs.js';
import { TRACK_POINTS, TURNS, TRUE_NORTH } from './silverstone/track-data.js';
import osm from './silverstone/osm-data.json';
import projection from './silverstone/projection.json';

const flatten = (p) => p.flat();
// 暂用轮廓块表达位置；没有高度的地物不表示实测高度。Wing 的 30 m 是翼尖，不能用于整栋。
const model = (item, height) => ({
  id: item.id, k: item.tags.building, h: height, m: 0, r: '', n: item.name,
  a: item.tags.amenity, g: item.tags['building:material'], p: flatten(item.p), q: [],
});
const buildingHeight = (item) => {
  const height = parseFloat(item.tags.height), levels = parseFloat(item.tags['building:levels']);
  if (FEATURE_BUILDINGS[item.id]) return FEATURE_BUILDINGS[item.id];
  if (height > 0) return height;
  if (levels > 0) return levels * 3.4;
  if (item.tags.amenity === 'toilets') return 4.2;
  if (/garage|detached/.test(item.tags.building)) return 4.5;
  return 6.4;
};
const standBuildings = new Set(['Village A', 'Vale', 'Club A', 'Club B', 'Stowe A', 'Stowe B', 'Stowe C']);
const bridgeBuildings = osm.bridges.map((item) => ({ ...model(item, parseFloat(item.tags.height) || 18.5), m: parseFloat(item.tags.min_height) || 14.5, n: 'Hamilton Straight pedestrian bridge' }));
const mappedBuildings = osm.buildings.filter((item) => !standBuildings.has(item.name) && !SIGN_FOOTPRINTS.has(item.id))
  .map((item) => model(item, buildingHeight(item)));
const models = [model(osm.wing, 12), ...bridgeBuildings, ...mappedBuildings];
const STANDS = [];
const OSM_LINES = [...silverstoneRoads(), ...osm.raceways.map((r) => {
  const w = parseFloat(r.width), stowe = r.name.startsWith('Stowe Circuit');
  return { k: 'raceway', w: Number.isFinite(w) && w > 0 ? w : stowe ? 10 : 6, y: 0, p: flatten(r.p), mergeEdges: stowe };
})];
// 剔除截图中远处大面积 Hazelborough 林地和无附属设施的矩形草地。
const OSM_AREAS = osm.areas.filter((a) => !['431091318', '606178939'].includes(a.id)).map((a) => ({ k: a.kind, p: flatten(a.p), q: [] }));
const venue = [-800, -1000, 800, -1000, 800, 1000, -800, 1000]; // 预览活动范围，非官方场馆边界

function buildPedestrianBridge(scene) {
  const glass = new THREE.MeshStandardMaterial({ color: '#a9c7d7', transparent: true, opacity: 0.42, metalness: 0.2, roughness: 0.35 });
  const frame = std('#b7bec2', { roughness: 0.64, metalness: 0.25 });
  bridgeBuildings.forEach((b) => {
    const shape = new THREE.Shape();
    for (let i = 0; i < b.p.length; i += 2) (i ? shape.lineTo(b.p[i], b.p[i + 1]) : shape.moveTo(b.p[i], b.p[i + 1]));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: b.h - b.m, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, b.m, 0);
    const mesh = new THREE.Mesh(geometry, glass);
    mesh.receiveShadow = true;
    mesh.name = b.n || 'OSM building';
    scene.add(mesh);
    for (const y of [b.m, b.h - 0.29]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.29, bevelEnabled: false });
      const cap = new THREE.Mesh(g.rotateX(-Math.PI / 2).translate(0, y, 0), frame);
      cap.castShadow = cap.receiveShadow = true;
      scene.add(cap);
    }
    // 玻璃桥的侧面采用非对称 Warren 桁架，桥底沿用地图标高。
    const truss = [], up = new THREE.Vector3(0, 1, 0), rotation = new THREE.Quaternion();
    for (let i = 0; i < b.p.length; i += 2) {
      const j = (i + 2) % b.p.length;
      const a = V(b.p[i], b.p[i + 1]), c = V(b.p[j], b.p[j + 1]);
      const length = a.distanceTo(c);
      if (length < 12) continue;
      const lengthwise = c.clone().sub(a).normalize();
      const panels = Math.round(length / 4.15);
      for (let k = 0; k < panels; k++) {
        const lo = (k + (k % 2 ? 0.10 : 0.22)) * length / panels, hi = (k + 0.95) * length / panels;
        const start = a.clone().addScaledVector(lengthwise, lo).setY(k % 2 ? b.h - 0.20 : b.m + 0.24);
        const end = a.clone().addScaledVector(lengthwise, hi).setY(k % 2 ? b.m + 0.24 : b.h - 0.20);
        const delta = end.clone().sub(start);
        const midpoint = start.clone().lerp(end, 0.5);
        truss.push(new THREE.BoxGeometry(0.13, delta.length(), 0.13)
          .applyQuaternion(rotation.setFromUnitVectors(up, delta.normalize())).translate(midpoint.x, midpoint.y, midpoint.z));
      }
    }
    if (truss.length) {
      const structure = new THREE.Mesh(mergeGeometries(truss), frame);
      structure.castShadow = structure.receiveShadow = true;
      scene.add(structure);
    }
  });
}

function buildPit(scene, track) {
  const source = osm.pit.map(([x, n]) => V(x, n)), points = [source[0]];
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1], b = source[i], count = Math.max(1, Math.ceil(a.distanceTo(b)));
    for (let j = 1; j <= count; j++) points.push(a.clone().lerp(b, j / count));
  }
  const path = makePath(points, false);
  const edge = track.pts.map((p, i) => p.clone().addScaledVector(track.nor[i], -track.hw));
  const cross = (ax, az, bx, bz) => ax * bz - az * bx;
  const outside = path.pts.map((p, i) => {
    const k = track.nearest(p.x, p.z), normal = path.nor[i];
    let intersection = Infinity;
    // 用维修通道横断面和主赛道实际边缘的线段求交，避免按最近顶点裁切产生锯齿。
    for (let j = k - 5; j <= k + 5; j++) {
      const a = edge[(j + track.N) % track.N], b = edge[(j + 1 + track.N) % track.N];
      const dx = b.x - a.x, dz = b.z - a.z;
      const det = cross(normal.x, normal.z, dx, dz);
      if (Math.abs(det) < 0.0001) continue;
      const ax = a.x - p.x, az = a.z - p.z;
      const t = cross(ax, az, normal.x, normal.z) / det;
      if (t < 0 || t > 1) continue;
      const s = cross(ax, az, dx, dz) / det;
      if (Math.abs(s) < Math.abs(intersection)) intersection = s;
    }
    return THREE.MathUtils.clamp(intersection, -5, 5);
  });
  const material = scene.getObjectByName('circuit-asphalt').material;
  // 接缝相交处留一小段沥青重叠，主赛道和维修通道共用同一世界坐标材质。
  const surface = new THREE.Mesh(ribbon(path, { offA: i => Math.min(5, outside[i] + 0.16), offB: -5, y: 0.165 }), material);
  surface.name = 'silverstone-pit-lane';
  scene.add(asGround(surface, -1.15));
  const lineMat = std('#f2f2ee', { roughness: 0.7 }, 0.9);
  const marks = [];
  const mark = (offA, offB, from, to) => {
    marks.push(ribbon(path, { offA, offB, y: 0.197, from, to }));
  };
  for (let i = 0; i < path.N;) {
    if (outside[i] <= -4.7) { i++; continue; }
    const from = i;
    while (i + 1 < path.N && outside[i + 1] > -4.7) i++;
    if (i > from) {
      const center = j => -4.75 + 0.11 * (1 - THREE.MathUtils.smoothstep(Math.min(path.dist[j] - path.dist[from], path.dist[i] - path.dist[j]), 0, 3));
      mark(j => center(j) + 0.10, j => center(j) - 0.10, from, i);
    }
    i++;
  }
  // Vale 分流口的虚线沿主赛道边缘，末端接回已有的赛道白线。
  for (let i = 0; i + 1 < path.N && path.dist[i] < 85;) {
    const draw = j => outside[j] > -3.9 && outside[j] < 4.35 && path.dist[j] % 8 < 4.3;
    if (!draw(i)) { i++; continue; }
    const from = i;
    while (i + 1 < path.N && draw(i + 1)) i++;
    if (i > from) mark(j => outside[j] + 0.61, j => outside[j] + 0.26, from, i);
    i++;
  }
  // Farm Curve 并线段延续白色分隔线，线端在维修通道路幅收尽前逐渐收窄。
  const exitFrom = outside.findIndex((offset, i) => path.total - path.dist[i] < 180 && offset < 4.4);
  const exitTo = outside.findLastIndex((offset, i) => i > exitFrom && offset > -4.4);
  if (exitFrom >= 0 && exitTo > exitFrom) {
    const half = i => 0.18 * THREE.MathUtils.smoothstep(path.dist[exitTo] - path.dist[i], 0, 6);
    mark(i => outside[i] + 0.48 + half(i), i => outside[i] + 0.48 - half(i), exitFrom, exitTo);
  }
  if (marks.length) {
    const mesh = new THREE.Mesh(mergeGeometries(marks), lineMat);
    mesh.name = 'silverstone-pit-markings';
    scene.add(asGround(mesh, -1.0));
  }
}

const mergeSegments = [osm.pit.slice(0, 4), osm.pit.slice(-18)];
function skipPitEdge(index, side, track) {
  if (side !== -1) return false;
  const p = track.pts[index], normal = track.nor[index];
  const x = p.x - normal.x * (track.hw - 0.6), n = -(p.z - normal.z * (track.hw - 0.6));
  return mergeSegments.some((segment) => segment.some((b, i) => {
    if (!i) return false;
    const a = segment[i - 1], dx = b[0] - a[0], dn = b[1] - a[1], len2 = dx * dx + dn * dn || 1;
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (n - a[1]) * dn) / len2, 0, 1);
    return Math.hypot(x - a[0] - t * dx, n - a[1] - t * dn) < 4.8;
  }));
}

const wingCenter = osm.wing.p.reduce((a, p) => [a[0] + p[0] / osm.wing.p.length, a[1] + p[1] / osm.wing.p.length], [0, 0]);
export default {
  id: 'gb', STANDS, TURNS, TRUE_NORTH, projection, venue,
  seatKit: { seatColor, seatMatrix, seatWorld, seatFacing, SELECTED_COLOR },
  osmData: { OSM_BUILDINGS: models, OSM_AREAS, OSM_LINES },
  center: [0, 0], defaultNight: false,
  home: { span: [1100, 1100], ref: 2013, offsets: (portrait) => ({ target: [0, 0, 0], pos: portrait ? [0, 2500, 350] : [-1400, 1700, 1550] }) },
  minimap: { orient: 'north-up', turnOffset: 50, startLine: '' },
  landmarks: [{ name: 'Silverstone Wing（示意）', nameEn: 'Silverstone Wing (schematic)', at: [...wingCenter, 18], view: [-180, 100, 180] }],
  async build(scene, { renderer, step, tr, brand }) {
    await step(0.3, tr('铺设银石赛道', 'Laying Silverstone circuit'));
    const track = buildTrack(scene, {
      points: TRACK_POINTS, pit: osm.pit, hw: 7.5, runoff: true, pitSide: 'right', vergeColor: '#d3d6da',
      skipEdgeLine: skipPitEdge, ads: [['#eeeeee', '#444444', 'SILVERSTONE']],
      finishAsphalt(material) {
        // 取消跨路幅 UV 对颜色的影响，保留世界坐标下共用的沥青细节纹理。
        material.map.dispose();
        material.map = null;
        material.color.set('#34363b');
      },
    });
    // FIA 2025 图示起点在 Club 到 Abbey 的直道；位置及发车格间距为近似，杆位在行驶方向左侧。
    const grid = buildStartGrid(scene, track, TURNS, 0.42, { startTurn: 18, slots: 20 });
    const start = track.pts[grid.index], normal = track.nor[grid.index];
    this.minimap.startLine = `<line class="mm-start" x1="${start.x - normal.x * 10}" y1="${start.z - normal.z * 10}" x2="${start.x + normal.x * 10}" y2="${start.z + normal.z * 10}"/>`;
    buildPit(scene, track);
    await step(0.55, tr('加载场馆轮廓', 'Loading venue footprints'));
    const specs = silverstoneStandSpecs(track);
    const inside = (x, n, poly) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > n) !== (poly[j][1] > n) && x < (poly[j][0] - poly[i][0]) * (n - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
      return c;
    };
    buildOSM(scene, { OSM_BUILDINGS: mappedBuildings.filter(b => !FEATURE_BUILDINGS[b.id]), OSM_AREAS, OSM_LINES }, {
      areaColors: { grass: '#d3d6da', forest: '#d3d6da', park: '#d3d6da', pitch: '#d3d6da', paved: '#a8adb1', parking: '#a9adb0' },
      roadSurfaces: true,
      parkingCars: false,
      roofEquipment: false,
      venueZone: p => track.distTo(p[0], -p[1], 4) < 320,
      roadSupportClear: (x, n) => track.distTo(x, -n, 2) > 22 && !specs.some((s) => inside(x, n, s.polygon)) && !osm.buildings.some((b) => inside(x, n, b.p)),
    });
    buildPedestrianBridge(scene);
    buildSilverstoneBuildings(scene, osm.buildings, osm.raceways);
    buildSilverstoneSigns(scene);
    const displayTrack = track.pts.slice(grid.index).concat(track.pts.slice(0, grid.index)).map((p) => [p.x, -p.z]);
    const pitb = buildSilverstonePit(scene, brand, track, displayTrack);
    await step(0.65, tr('搭建示意看台', 'Building schematic grandstands'));
    const { stands, hitboxes } = buildSilverstoneStands(scene, track, specs);
    STANDS.splice(0, STANDS.length, ...stands.map((stand) => stand.spec));
    // 2025-07-06 15:00 BST（14:00 UTC）当地太阳约方位 226.5°、高度 53.7°。
    const env = buildEnvironment(scene, track, stands, renderer, { center: [0, 0], trueNorth: TRUE_NORTH, sun: { az: 226.5, el: 53.7 }, poles: false });
    const cars = buildCars(scene, track, SILVERSTONE_TEAMS);
    const nearest = new THREE.Vector3();
    return { track, stands, hitboxes, env, cars,
      update(dt, camera) {
        pitb.axis.closestPointToPoint(camera.position, true, nearest);
        const near = camera.position.distanceTo(nearest) < 260;
        if (pitb.detail[0].visible !== near) for (const item of pitb.detail) item.visible = near;
      },
    };
  },
  info: {
    facts: () => [[t('赛道长度', 'Track length'), '5.891 km'], [t('弯道', 'Corners'), t('18 个', '18')], [t('基准', 'Reference'), '2025 British GP']],
    notes: () => [
      t('中心线与弯号为近似。维修通道宽度、缓冲区及护墙为示意，赛道按平面建模。', 'The centreline and corner positions are approximate. Pit lane width, runoff and barriers are illustrative. The model uses a flat track surface.'),
      t('看台分区参考 2025 赛事图，座席和出入口为示意。Wing 屋顶、配套建筑轮廓和道路取自地图数据，车库按 FIA 2025 维修通道图分配。立面、工作区尺寸和未标宽度的道路仍待测量复核。', 'Grandstand sections follow the 2025 event map, with illustrative seating and entrances. The Wing roof, building footprints and roads use map data. Garage assignments follow the FIA 2025 pit lane plan. Facades, working area dimensions and untagged road widths remain approximate.'),
    ],
    disclaimer: () => t('本网站为非官方爱好者作品。购票及现场通行安排以赛事组织方发布的信息为准。', 'This is an unofficial fan project. Consult the event organiser for ticketing and venue access.'),
    trademarks: () => t('场馆及赛事名称归各自权利人所有。', 'Venue and event names belong to their respective owners.'),
    sources: () => t('中心线：bacinger/f1-circuits（MIT）；地图数据 © OpenStreetMap 贡献者（ODbL）；赛事参考：FIA 与银石赛道 2025 年官方图。', 'Centreline: bacinger/f1-circuits (MIT); map data © OpenStreetMap contributors (ODbL); event references: FIA and Silverstone 2025 maps.'),
    guide: {
      welcome: () => t('按 2025 年英国大奖赛布局探索银石的赛道、看台与场馆。', 'Explore the track, grandstands and venue at Silverstone in its 2025 British Grand Prix layout.'),
      night: () => t('可切换昼夜；夜间照明为示意。', 'Switch between day and night; night lighting is illustrative.'),
    },
  },
};
