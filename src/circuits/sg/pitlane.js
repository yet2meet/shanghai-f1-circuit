import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blanketGeo, blanketTex, crewGeo } from '../../garagekit.js';
import { asGround } from '../../osm.js';
import { screenGeo } from '../../pitscreens.js';
import { TEAMS } from '../../teams.js';
import { groundDetail } from '../../textures.js';
import { V, makePath, ribbon, rng, std, wall } from '../../util.js';

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

function pitPath(pit) {
  const points = pit.map(([x, n]) => V(x, n));
  const samples = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1], end = points[i];
    const steps = Math.ceil(start.distanceTo(end) / 2);
    for (let j = 1; j <= steps; j++) samples.push(start.clone().lerp(end, j / steps));
  }
  return makePath(samples);
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

export function buildSGPitLane(scene, pit, track, pitb) {
  const group = new THREE.Group();
  group.name = 'sg-pit-lane';
  const path = pitPath(pit);
  const garageEndZ = pitb.front.z - pitb.L / 2;
  const garageStartZ = pitb.front.z + pitb.L / 2;
  const wallStartZ = garageStartZ + 8;
  const wallEndZ = garageEndZ - 8;
  const start = path.pts.findIndex((p) => p.z <= wallStartZ);
  const end = path.pts.findIndex((p) => p.z < wallEndZ) - 1;
  const faceX = (z) => pitb.front.x - (z - pitb.front.z) * pitb.f.z / pitb.f.x;
  const { lerp, smoothstep } = THREE.MathUtils;
  const wallX = (z) => trackEdgeAt(track, z, faceX(z)) - 0.18;
  const left = [], right = [];
  for (let i = 0; i < path.N; i++) {
    const { x, z } = path.pts[i];
    // 进场和出场沿 OSM 折线；车库段按立面和主直道边缘定宽。
    const blend = smoothstep(z, wallEndZ - 26, wallEndZ) * (1 - smoothstep(z, wallStartZ, wallStartZ + 26));
    if (blend > 0) {
      path.nor[i].lerp(new THREE.Vector3(-1, 0, 0), blend).normalize();
      left.push(lerp(6, x - faceX(z) + 0.25, blend));
      right.push(lerp(-6, x - wallX(z), blend));
    } else {
      left.push(6);
      right.push(-6);
    }
  }

  const asphalt = groundDetail(std('#3b3d42', { roughness: 0.92 }, 0.55), 'asphalt', { size: 3, k: 0.7, mk: 0.12 });
  const fastSurface = groundDetail(std('#282c32', { roughness: 0.93 }, 0.55), 'asphalt', { size: 3, k: 0.7, mk: 0.12 });
  const paint = std('#f4f4f4', { roughness: 0.6 }, 0.8);
  const concrete = std('#92999f', { side: THREE.DoubleSide, roughness: 0.8 }, 0.4);
  const platform = std('#697179', { roughness: 0.85 }, 0.4);
  const band = (offA, offB, y, mat, range = {}, groundOrder = null) => {
    const mesh = new THREE.Mesh(ribbon(path, { offA, offB, y, ...range }), mat);
    if (groundOrder !== null) asGround(mesh, groundOrder);
    else mesh.receiveShadow = true;
    group.add(mesh);
  };
  const edge = (i) => right[i];
  const curb = (i) => edge(i) + WALL_WIDTH + PLATFORM_WIDTH;
  const split = (i) => curb(i) + FAST_WIDTH;
  const range = { from: start, to: end };
  band((i) => left[i], edge, 0.12, asphalt, {}, -2);
  band(split, curb, 0.123, fastSurface, range, -1.99);
  band((i) => split(i) + 0.09, (i) => split(i) - 0.09, 0.14, paint, range, -1.9);
  band((i) => curb(i) + 0.10, curb, 0.14, paint, range, -1.9);
  // 白线保留在进出场，车库段的赛道侧边界改由实体维修墙界定。
  for (const approach of [{ to: start }, { from: end }]) {
    band((i) => left[i] - 0.15, (i) => left[i] - 0.31, 0.14, paint, approach, -1.9);
    band((i) => edge(i) + 0.31, (i) => edge(i) + 0.15, 0.14, paint, approach, -1.9);
  }

  band(curb, edge, 0.23, platform, range);
  const addWall = (off, y, h, mat) => {
    const mesh = new THREE.Mesh(wall(path, { off, y, h, ...range }), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  addWall(curb, 0.12, 0.11, platform);
  addWall(edge, 0.12, WALL_HEIGHT - 0.12, concrete);
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
      box(stopWidth, 0.01, strip, stopX, 0.15, z - stopLength / 2),
      box(strip, 0.01, stopLength, stopX + stopWidth / 2, 0.15, z),
      box(strip, 0.01, stopLength, stopX - stopWidth / 2, 0.15, z),
    ]), paint);
    stop.name = team.id;
    stop.receiveShadow = true;
    const guide = new THREE.Mesh(mergeGeometries([
      box(0.15, 0.01, 4.8, stopX, 0.15, z),
      box(stopWidth * 0.54, 0.01, 0.15, stopX, 0.151, z - 1.82),
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
