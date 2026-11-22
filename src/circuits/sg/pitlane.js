import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blanketGeo, blanketTex, crewGeo } from '../../garagekit.js';
import { asGround } from '../../osm.js';
import { screenGeo } from '../../pitscreens.js';
import { TEAMS } from '../../teams.js';
import { groundDetail } from '../../textures.js';
import { V, canvasTex, makePath, ribbon, rng, std, wall } from '../../util.js';
import { addRoadFill } from './night-lighting.js';

// FIA 2026 Singapore GP Pit Lane V2, p. 2：编号与分配按入口到出口排列。
const pitTeams = [
  ['mclaren', 9, 'McLaren / Mercedes'], ['mercedes', 12],
  ['redbull', 15, 'Red Bull / Ferrari'], ['ferrari', 18],
  ['williams', 22, 'Williams / Racing Bulls'], ['racingbulls', 24],
  ['astonmartin', 28], ['haas', 31], ['audi', 34], ['alpine', 37], ['cadillac', 40],
].map(([id, stopBay, shared]) => ({ team: TEAMS.find((team) => team.id === id), stopBay, shared }));
export const SG_GARAGE_SLOTS = ['FOM', 'FIA', 'FIA', 'FIA', 'FIA'];
for (const { team, shared } of pitTeams) {
  SG_GARAGE_SLOTS.push(team, team, team);
  if (shared) SG_GARAGE_SLOTS.push(shared);
}
const WALL_WIDTH = 0.28;
const WALL_HEIGHT = 1.15;
const PLATFORM_WIDTH = 1.1;
const FAST_WIDTH = 3.2;
const PIT_HALF_WIDTH = 4.2;
const EXIT_TAPER_SAMPLES = 9;

// 入口分流标线替换主赛道左边线。两端以 OSM 的入口位置和 T19 后的主直道定位。
export function sgPitEntryEdges(track) {
  const start = track.nearest(-638, 308);
  const end = track.nearest(-513, 246);
  return (i) => start <= end ? i >= start && i <= end : i >= start || i <= end;
}

function exitJoin(track, pit) {
  const [x, n] = pit.at(-1);
  return track.nearest(x, -n);
}

export function sgPitExitKerbs(track, pit) {
  const join = exitJoin(track, pit);
  return (i) => i >= join - 4 && i <= join + EXIT_TAPER_SAMPLES;
}

/** 取赛车主直道靠维修区的路面边界，避免在同一位置使用第二套赛道宽度。 */
function trackEdgeAt(track, z, nearX) {
  let closest = Infinity;
  let edgeX = nearX;
  for (let i = 0; i < track.N; i++) {
    const j = (i + 1) % track.N;
    const a = track.pts[i], b = track.pts[j];
    const na = track.nor[i], nb = track.nor[j];
    const az = a.z + na.z * track.hw, bz = b.z + nb.z * track.hw;
    if (az === bz || (z - az) * (z - bz) > 0) continue;
    const x = THREE.MathUtils.lerp(a.x + na.x * track.hw, b.x + nb.x * track.hw, (z - az) / (bz - az));
    const distance = Math.abs(x - nearX);
    if (distance < closest) { closest = distance; edgeX = x; }
  }
  return edgeX;
}

function pitPath(pit, track) {
  // OSM 最末一点只是两路相接处。沿 T2 的左侧把汇入线延伸至路幅收尽。
  const points = pit.slice(0, -1).map(([x, n]) => V(x, n));
  const join = exitJoin(track, pit);
  for (const [ahead, offset] of [[4, track.hw - 0.8], [EXIT_TAPER_SAMPLES, track.hw - PIT_HALF_WIDTH - 1.2]]) {
    const i = (join + ahead) % track.N;
    points.push(track.pts[i].clone().addScaledVector(track.nor[i], offset));
  }
  const controls = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    // 长直线插入控制点，避免曲线在两端被相邻弯道拉偏。
    const steps = Math.ceil(start.distanceTo(end) / 23);
    for (let j = 1; j <= steps; j++) controls.push(start.clone().lerp(end, j / steps));
  }
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal');
  curve.arcLengthDivisions = 4096;
  return makePath(curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.85)));
}

function mainEdgeOffset(track, path, i, edge, nearest) {
  const p = path.pts[i], n = path.nor[i];
  let offset = -Infinity;
  // 用通道横断面与主赛道路缘线段求交，保留准确的接缝位置。
  for (let j = nearest - 6; j <= nearest + 6; j++) {
    const a = edge[(j + track.N) % track.N], b = edge[(j + 1 + track.N) % track.N];
    const dx = b.x - a.x, dz = b.z - a.z;
    const det = n.x * dz - n.z * dx;
    if (Math.abs(det) < 0.0001) continue;
    const ax = a.x - p.x, az = a.z - p.z;
    const t = (ax * n.z - az * n.x) / det;
    if (t < 0 || t > 1) continue;
    const s = (ax * dz - az * dx) / det;
    if (Math.abs(s) < Math.abs(offset)) offset = s;
  }
  return offset;
}

function alignAsphalt(geometry, track, path, mainSamples, uvMetres) {
  const { position, uv } = geometry.attributes;
  let wrap = 0;
  for (let i = 0; i < path.N; i++) {
    const k = mainSamples[i];
    if (i && mainSamples[i - 1] - k > track.N / 2) wrap += track.total;
    const p = track.pts[k], t = track.tan[k], n = track.nor[k];
    for (const row of [2 * i, 2 * i + 1]) {
      const x = position.getX(row) - p.x, z = position.getZ(row) - p.z;
      const along = track.dist[k] + wrap + x * t.x + z * t.z;
      const lateral = track.hw - x * n.x - z * n.z;
      // 路缘处使用与主赛道相同的 UV，向通道外侧平滑展开纹理和夜间补光。
      const v = lateral >= 0 ? lateral / (2 * track.hw) : Math.min(-lateral / 18, 0.7);
      uv.setXY(row, along / uvMetres, v);
    }
  }
}

function buildPitCrew(people) {
  const crew = new THREE.Group();
  crew.name = 'sg-pit-crew';
  const shirtMaterial = std('#ffffff', { roughness: 0.85 }, 0.4);
  const bodyMaterial = std('#ffffff', { roughness: 0.75, vertexColors: true }, 0.3);
  const skinColors = ['#f3d2b4', '#e8bc96', '#d29f78', '#a8714d', '#7a4e33'];
  const random = rng(3302);
  const actor = new THREE.Object3D();
  const color = new THREE.Color();
  for (const [pose, list] of Object.entries(people)) {
    const geometry = crewGeo(pose);
    const shirt = new THREE.InstancedMesh(geometry.shirt, shirtMaterial, list.length);
    const body = new THREE.InstancedMesh(geometry.rest, bodyMaterial, list.length);
    shirt.name = `${pose}-uniforms`;
    body.name = `${pose}-bodies`;
    list.forEach(({ x, y, z, yaw, team }, i) => {
      actor.position.set(x, y, z);
      actor.rotation.y = yaw;
      actor.updateMatrix();
      shirt.setMatrixAt(i, actor.matrix);
      body.setMatrixAt(i, actor.matrix);
      shirt.setColorAt(i, color.set(team.color));
      body.setColorAt(i, color.set(skinColors[Math.floor(random() * skinColors.length)]));
    });
    shirt.castShadow = body.castShadow = true;
    crew.add(shirt, body);
  }
  return crew;
}

export function buildSGPitLane(scene, pit, track, pitb, asphalt, asphaltUV) {
  const group = new THREE.Group();
  group.name = 'sg-pit-lane';
  const path = pitPath(pit, track);
  const garageEndZ = pitb.front.z - pitb.L / 2;
  const garageStartZ = pitb.front.z + pitb.L / 2;
  const wallStartZ = garageStartZ + 8;
  const wallEndZ = garageEndZ - 8;
  const start = path.pts.findIndex((p) => p.z <= wallStartZ);
  const end = path.pts.findIndex((p) => p.z < wallEndZ) - 1;
  const faceX = (z) => pitb.front.x - (z - pitb.front.z) * pitb.f.z / pitb.f.x;
  const { lerp, smoothstep } = THREE.MathUtils;
  const wallX = (z) => trackEdgeAt(track, z, faceX(z)) - 0.18;
  const mainEdge = track.pts.map((p, i) => p.clone().addScaledVector(track.nor[i], track.hw));
  const mainSamples = path.pts.map((p) => track.nearest(p.x, p.z));
  const outer = [], inner = [], clipped = [], junction = [];
  const west = new THREE.Vector3(-1, 0, 0);
  for (let i = 0; i < path.N; i++) {
    const { x, z } = path.pts[i];
    // 进出场先收为单车道，车库段仍按立面与维修墙定宽。
    const blend = smoothstep(z, wallEndZ - 26, wallEndZ) * (1 - smoothstep(z, wallStartZ, wallStartZ + 26));
    path.nor[i].lerp(west, blend).normalize();
    const a = lerp(PIT_HALF_WIDTH, x - faceX(z) + 0.25, blend);
    const b = lerp(-PIT_HALF_WIDTH, x - wallX(z), blend);
    const edgeOffset = i < start || i > end ? mainEdgeOffset(track, path, i, mainEdge, mainSamples[i]) : -Infinity;
    outer.push(a);
    inner.push(b);
    junction.push(edgeOffset);
    clipped.push(Math.min(a, Math.max(b, edgeOffset - 0.18)));
  }

  const fastSurface = groundDetail(std('#282c32', { roughness: 0.93 }, 0.55), 'asphalt', { size: 3, k: 0.7, mk: 0.12 });
  const uvMetres = 10;
  addRoadFill(fastSurface, path.total, uvMetres, 0.98);
  const paint = std('#f4f4f4', { roughness: 0.6 }, 0.8);
  const concrete = std('#92999f', { side: THREE.DoubleSide, roughness: 0.8 }, 0.4);
  const platform = std('#697179', { roughness: 0.85 }, 0.4);
  const band = (offA, offB, y, mat, range = {}, groundOrder = null) => {
    const mesh = new THREE.Mesh(ribbon(path, { offA, offB, y, uv: uvMetres, ...range }), mat);
    if (groundOrder !== null) asGround(mesh, groundOrder);
    else mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const edge = (i) => inner[i];
  const curb = (i) => edge(i) + WALL_WIDTH + PLATFORM_WIDTH;
  const split = (i) => curb(i) + FAST_WIDTH;
  const range = { from: start, to: end };
  const road = band((i) => outer[i], (i) => clipped[i], 0.159, asphalt, { uv: asphaltUV }, -1.21);
  road.name = 'sg-pit-asphalt';
  alignAsphalt(road.geometry, track, path, mainSamples, asphaltUV);
  band(split, curb, 0.16, fastSurface, range, -1.19).name = 'sg-pit-fast-lane';
  band((i) => split(i) + 0.09, (i) => split(i) - 0.09, 0.18, paint, range, -1.04).name = 'sg-pit-fast-lane-line';
  band((i) => curb(i) + 0.10, curb, 0.18, paint, range, -1.04);

  const marks = [];
  const mark = (offset, halfWidth, from, to, draw) => {
    let first = -1;
    for (let i = from; i <= to + 1; i++) {
      if (i <= to && draw(i)) {
        if (first < 0) first = i;
      } else if (first >= 0) {
        if (i - first >= 2) marks.push(ribbon(path, {
          offA: (j) => offset(j) + halfWidth, offB: (j) => offset(j) - halfWidth, y: 0.202, from: first, to: i - 1,
        }));
        first = -1;
      }
    }
  };
  const outsideLine = (i) => outer[i] - 0.21;
  mark(outsideLine, 0.11, 0, start, (i) => outer[i] - clipped[i] > 0.65);
  mark(outsideLine, 0.11, end, path.N - 1, (i) => outer[i] - clipped[i] > 0.65);
  // FIA 照片中的入口虚白线在分流后接实线。主赛道一侧的实线留给车库直道。
  const entryEdges = sgPitEntryEdges(track);
  const entryLength = path.dist[path.pts.findIndex((p) => p.x > -574)];
  mark((i) => Math.max(inner[i] + 0.26, junction[i] - 0.56), 0.17, 0, start, (i) =>
    (entryEdges(mainSamples[i]) || inner[i] > junction[i] + 0.1)
    && (path.dist[i] >= entryLength || (path.dist[i] + 1) % 8 < 5));
  mark((i) => inner[i] + 0.20, 0.12, end, path.N - 1, (i) => inner[i] - junction[i] > 0.36);
  if (marks.length) {
    const mesh = asGround(new THREE.Mesh(mergeGeometries(marks), paint), -0.96);
    mesh.name = 'sg-pit-approach-markings';
    group.add(mesh);
  }

  // T1 前及桥下的出口分隔带：红白边、黄色铺面与排水槽沿两侧路缘收窄。
  const islandWidth = (i) => {
    const z = path.pts[i].z;
    if (!Number.isFinite(junction[i])) return 0;
    return Math.max(0, Math.min(4.6, inner[i] - junction[i]))
      * smoothstep(z, -279, -270) * (1 - smoothstep(z, -226, -216));
  };
  const islandStart = path.pts.findIndex((_, i) => i > end && islandWidth(i) > 0.03);
  const islandEnd = path.pts.findLastIndex((_, i) => i > end && islandWidth(i) > 0.03);
  if (islandStart >= 0 && islandStart < islandEnd) {
    const island = { from: islandStart - 1, to: islandEnd + 1 };
    const line = (fraction) => (i) => inner[i] - islandWidth(i) * fraction;
    const kerbTex = canvasTex(96, 8, (ctx, width, height) => {
      ctx.fillStyle = '#eae8e2'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ba282b'; ctx.fillRect(0, 0, width / 2, height);
    }, [1, 1]);
    const kerb = std('#ffffff', { map: kerbTex, roughness: 0.78 }, 0.8);
    band(line(0), line(1), 0.174, kerb, { ...island, uv: 4.4 }, -0.99).name = 'sg-pit-exit-island';
    band(line(0.19), line(0.81), 0.179, std('#d7a021', { roughness: 0.82 }, 0.8), island, -0.98);
    band(line(0.475), line(0.525), 0.18, std('#383939', { roughness: 0.96 }, 0.64), island, -0.97);
  }

  band(curb, edge, 0.23, platform, range);
  const addWall = (off, y, h, mat) => {
    const mesh = new THREE.Mesh(wall(path, { off, y, h, ...range }), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  addWall(curb, 0.12, 0.11, platform);
  addWall(edge, 0.12, WALL_HEIGHT - 0.12, concrete).name = 'sg-pit-wall';
  addWall((i) => edge(i) + WALL_WIDTH, 0.23, WALL_HEIGHT - 0.23, concrete);
  band((i) => edge(i) + WALL_WIDTH, edge, WALL_HEIGHT, concrete, range);

  const stops = new THREE.Group();
  stops.name = 'sg-pit-stops';
  const consoles = new THREE.Group();
  consoles.name = 'sg-pit-wall-consoles';
  const housing = std('#343a41', { roughness: 0.6, metalness: 0.2 }, 0.45);
  const table = std('#868c93', { roughness: 0.52 }, 0.4);
  const seats = std('#23272d', { roughness: 0.85 }, 0.35);
  const rail = std('#a5aeb7', { roughness: 0.45, metalness: 0.45 }, 0.4);
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.22, roughness: 0.08, depthWrite: false });
  const telemetry = pitb.telemetryTexture;
  const screens = new THREE.MeshStandardMaterial({ map: telemetry, emissive: '#ffffff', emissiveMap: telemetry, emissiveIntensity: 0.5, roughness: 0.35 });
  const consoleParts = new Map();
  const box = (w, h, l, x, y, z) => new THREE.BoxGeometry(w, h, l).translate(x, y, z);
  const screen = (cell, w, h, x, y, z) => screenGeo(cell, w, h).rotateY(-Math.PI / 2).translate(x, y, z);
  const people = { stand: [], work: [], sit: [] };
  const tyres = new THREE.InstancedMesh(blanketGeo(), std('#ffffff', { map: blanketTex(), roughness: 0.8 }, 0.5), pitTeams.length * 3);
  tyres.name = 'sg-pit-tyres';
  tyres.castShadow = tyres.receiveShadow = true;
  const tyreMatrix = new THREE.Matrix4();
  const tyreColor = new THREE.Color();
  const stopLength = 5.7;
  for (const [i, { team, stopBay }] of pitTeams.entries()) {
    // 纵向位置沿 FIA 图上的车库编号定位；标线尺寸适配模型中车库与白线之间的净宽。
    const { z } = pitb.toWorld(pitb.bayX(stopBay - 1), 0);
    const rightEdge = Math.min(wallX(z - stopLength / 2), wallX(z + stopLength / 2));
    const stopLimit = rightEdge - WALL_WIDTH - PLATFORM_WIDTH - FAST_WIDTH;
    const garageLimit = Math.max(faceX(z - stopLength / 2), faceX(z + stopLength / 2));
    const stopWidth = Math.min(3.1, stopLimit - garageLimit - 0.32);
    const stopX = stopLimit - 0.22 - stopWidth / 2;
    const strip = 0.11;
    const stop = new THREE.Mesh(mergeGeometries([
      box(stopWidth, 0.01, strip, stopX, 0.18, z - stopLength / 2),
      box(strip, 0.01, stopLength, stopX + stopWidth / 2, 0.18, z),
      box(strip, 0.01, stopLength, stopX - stopWidth / 2, 0.18, z),
    ]), paint);
    stop.name = team.id;
    stop.receiveShadow = true;
    const guide = new THREE.Mesh(mergeGeometries([
      box(0.15, 0.01, 4.8, stopX, 0.18, z),
      box(stopWidth * 0.54, 0.01, 0.15, stopX, 0.181, z - 1.82),
    ]), std(team.color, { roughness: 0.6 }, 0.65));
    stop.add(guide);
    stops.add(stop);

    // 两名技师和备胎放在车库侧、换胎标线前后，保持停车框内通畅。
    const tyreZ = z + 4.7;
    const tyreX = faceX(tyreZ) + 0.89;
    for (let layer = 0; layer < 3; layer++) {
      const instance = i * 3 + layer;
      tyres.setMatrixAt(instance, tyreMatrix.makeTranslation(tyreX, 0.31 + layer * 0.38, tyreZ));
      tyres.setColorAt(instance, tyreColor.set(layer === 1 ? team.color : '#363940'));
    }
    people.work.push({ x: tyreX, y: 0.12, z: z + 3.67, yaw: 0, team });
    people.stand.push({ x: faceX(z - 4.15) + 1.02, y: 0.12, z: z - 4.15, yaw: i % 2 ? Math.PI / 5 : -Math.PI / 5, team });

    // 复用车库的遥测画面，在维修墙平台上布置六席双屏工作台。
    const x = wallX(z) - WALL_WIDTH - PLATFORM_WIDTH / 2;
    const yaw = Math.atan2(wallX(z + 3) - wallX(z - 3), 6);
    const place = (geometry) => geometry.rotateY(yaw).translate(x, 0, z);
    const housingParts = [box(0.13, 0.75, 5.78, 0.43, 0.605, 0), box(1.02, 0.09, 5.95, 0, 2.13, 0)];
    const supports = [box(0.04, 0.055, 5.8, -0.49, 0.77, 0)];
    const seatParts = [];
    const screenPanels = [];
    for (const endZ of [-2.83, 2.83]) {
      for (const postX of [-0.47, 0.47]) supports.push(box(0.055, 1.86, 0.055, postX, 1.16, endZ));
    }
    for (const [j, deskZ] of [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15].entries()) {
      seatParts.push(box(0.34, 0.07, 0.39, -0.28, 0.81, deskZ), box(0.05, 0.36, 0.37, -0.45, 0.98, deskZ));
      supports.push(box(0.09, 0.55, 0.09, -0.28, 0.51, deskZ), box(0.04, 0.56, 0.04, -0.49, 0.5, deskZ));
      for (const [k, shift] of [-0.19, 0.19].entries()) {
        const screenZ = deskZ + shift;
        screenPanels.push(screen((j * 2 + k) % 4, 0.34, 0.22, 0.28, 1.28, screenZ));
        housingParts.push(box(0.045, 0.25, 0.36, 0.305, 1.28, screenZ), box(0.04, 0.10, 0.045, 0.31, 1.12, screenZ));
      }
      if ((i + j) % 3 === 1 || (i % 3 === 0 && j === 2)) {
        const seat = new THREE.Vector3(-0.28, 0.29, deskZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        people.sit.push({ x: x + seat.x, y: seat.y, z: z + seat.z, yaw: yaw + Math.PI / 2, team });
      }
    }
    for (const [j, displayZ] of [-1.72, 0, 1.72].entries()) {
      screenPanels.push(screen(j + 1, 0.62, 0.29, 0.375, 1.82, displayZ));
      housingParts.push(box(0.05, 0.32, 0.65, 0.402, 1.82, displayZ), box(0.045, 0.13, 0.08, 0.41, 2.03, displayZ));
    }
    const parts = [
      [housing, housingParts], [rail, supports], [seats, seatParts], [screens, screenPanels],
      [table, [box(0.51, 0.07, 5.78, 0.23, 1.04, 0)]],
      [glass, [box(0.018, 0.44, 5.75, 0.49, 1.28, 0)]],
    ];
    for (const [mat, geometries] of parts) {
      if (!consoleParts.has(mat)) consoleParts.set(mat, []);
      consoleParts.get(mat).push(...geometries.map(place));
    }
    const fascia = new THREE.Mesh(mergeGeometries([
      place(box(1.03, 0.11, 5.97, 0, 2.05, 0)),
      place(box(0.035, 0.24, 5.8, -0.5, 0.35, 0)),
    ]), std(team.color, { roughness: 0.65 }, 0.7));
    fascia.name = team.id;
    consoles.add(fascia);
  }
  for (const [mat, geometries] of consoleParts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), mat);
    mesh.castShadow = mat !== screens && mat !== glass;
    mesh.receiveShadow = true;
    consoles.add(mesh);
  }
  group.add(stops, consoles, tyres, buildPitCrew(people));
  scene.add(group);
}
