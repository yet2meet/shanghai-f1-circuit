import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crewGeo, blanketGeo, blanketTex, hoseGeo, jackGeo } from '../../garagekit.js';
import { screenGeo } from '../../pitscreens.js';
import { asGround } from '../../osm.js';
import { groundDetail } from '../../textures.js';
import { makePath, ribbon, std, V } from '../../util.js';

// Wing 的局部坐标：沿车库排列为 x，朝主赛道为 -z。以主赛道的实际路缘
// 网格为外边界，以车库立面为内边界，避免直道上的工作区与快车道侵入赛道。
export function buildPitWorkspace(pit, track, teams, slots) {
  const group = new THREE.Group();
  group.name = 'silverstone-pit-workspace';
  pit.group.add(group);
  const inverse = pit.group.matrixWorld.clone().invert();
  const edge = track.pts.map((point, i) => point.clone()
    .addScaledVector(track.nor[i], -track.hw).applyMatrix4(inverse));
  const findEdge = (x) => {
    let closest = -Infinity;
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length];
      if ((x - a.x) * (x - b.x) > 0 || a.x === b.x) continue;
      const z = THREE.MathUtils.lerp(a.z, b.z, (x - a.x) / (b.x - a.x));
      if (z < -9 && z > -65) closest = Math.max(closest, z);
    }
    if (!Number.isFinite(closest)) throw new Error('银石维修区缺少主赛道路缘交点');
    return closest;
  };
  const x0 = -pit.L / 2 + 10, x1 = pit.L / 2 - 10;
  const count = Math.ceil((x1 - x0) / 2);
  const path = makePath(Array.from({ length: count + 1 }, (_, i) => new THREE.Vector3(
    THREE.MathUtils.lerp(x1, x0, i / count), 0, 0)), false);
  const edges = path.pts.map(p => findEdge(p.x));
  // 维修墙和通行平台的宽度为示意。平台留出行走空间，指挥台底座不进入快车道。
  const wall = i => edges[i] + 0.62;
  const platform = i => wall(i) + 2.65;
  const split = i => platform(i) + 3.65;
  const paint = std('#f4f4ef', { roughness: 0.68 }, 0.78);
  const dark = std('#30353b', { roughness: 0.78 }, 0.48);
  const concrete = std('#a5a7a7', { roughness: 0.88 }, 0.30);
  const metal = std('#929ba3', { metalness: 0.47, roughness: 0.55 }, 0.26);
  const band = (a, b, y, material, order, from, to) => {
    const mesh = new THREE.Mesh(ribbon(path, { offA: b, offB: a, y, from, to, uv: 9 }), material);
    group.add(asGround(mesh, order));
  };
  band(i => edges[i], 0.06, 0.15, groundDetail(std('#414448', {}, 0.48), 'asphalt', { size: 3 }), -1.17);
  band(platform, split, 0.16, groundDetail(std('#33363a', {}, 0.48), 'asphalt', { size: 3 }), -1.13);
  band(i => split(i) - 0.08, i => split(i) + 0.08, 0.196, paint, -0.98);
  band(i => platform(i) + 0.14, i => platform(i) + 0.26, 0.195, paint, -0.98);

  const batches = new Map();
  const add = (material, geometry) => {
    if (!batches.has(material)) batches.set(material, []);
    const meshGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!material.map) meshGeometry.deleteAttribute('uv');
    batches.get(material).push(meshGeometry);
  };
  const box = (material, x, y, z, w, h, d) => add(material, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const beam = (material, a, b, w, h = w) => {
    const delta = b.clone().sub(a);
    add(material, new THREE.BoxGeometry(delta.length(), h, w).rotateY(Math.atan2(-delta.z, delta.x))
      .translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  };
  for (let i = 1; i <= count; i++) {
    const a = path.pts[i - 1].x, b = path.pts[i].x;
    beam(concrete, V(a, -wall(i - 1), 0.63), V(b, -wall(i), 0.63), 0.38, 0.96);
    beam(concrete, V(a, -(platform(i - 1) - 1.3), 0.19), V(b, -(platform(i) - 1.3), 0.19), 2.55, 0.12);
    if (i % 2 === 0) box(metal, b, 1.62, wall(i), 0.055, 1.10, 0.055);
    beam(metal, V(a, -wall(i - 1), 2.16), V(b, -wall(i), 2.16), 0.035);
  }

  const display = new THREE.MeshStandardMaterial({
    map: pit.telemetryTexture, emissiveMap: pit.telemetryTexture,
    emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.45,
  });
  const rubber = std('#191c21', { roughness: 0.94 }, 0.24);
  const taskLights = std('#ebedef', { roughness: 0.4 }, 0.75);
  const glass = new THREE.MeshStandardMaterial({ color: '#c2d1db', opacity: 0.24, transparent: true, depthWrite: false, roughness: 0.2 });
  const blankets = std('#33363b', { map: blanketTex(), roughness: 0.8 }, 0.3);
  const crew = { sit: [], stand: [], work: [] };
  for (const [teamIndex, team] of teams.entries()) {
    const x = pit.bayX(slots.indexOf(team) + 1);
    const index = Math.round((x1 - x) / (x1 - x0) * count);
    const z = wall(index) + 1.23;
    const teamMat = std(team.color, { roughness: 0.61 }, 0.55);
    box(dark, x, 0.42, z, 6.3, 0.38, 1.82);
    box(dark, x, 1.35, z - 0.47, 6.1, 0.09, 0.60);
    box(dark, x, 1.09, z - 0.72, 6.12, 0.50, 0.08);
    box(teamMat, x, 2.76, z, 6.42, 0.12, 2.03);
    box(teamMat, x, 2.63, z - 0.97, 6.42, 0.22, 0.09);
    box(glass, x, 1.64, z - 0.80, 6.1, 0.63, 0.035);
    box(metal, x, 1.06, z + 0.86, 5.7, 0.06, 0.06);
    for (const dx of [-3.08, 3.08]) for (const dz of [-0.87, 0.87]) box(metal, x + dx, 1.64, z + dz, 0.07, 2.15, 0.07);
    for (let i = 0; i < 3; i++) box(metal, x + 3.08 + (i + 0.5) * 0.22, 0.51 - i * 0.12, z + 0.30, 0.23, 0.12, 0.64);
    for (let i = 0; i < 5; i++) {
      const station = x + (i - 2) * 1.11;
      box(rubber, station, 1.12, z + 0.34, 0.40, 0.08, 0.40);
      box(rubber, station, 1.34, z + 0.52, 0.40, 0.39, 0.07);
      box(metal, station, 0.86, z + 0.34, 0.06, 0.48, 0.06);
      for (const dx of [-0.25, 0.25]) {
        box(dark, station + dx, 1.60, z - 0.42, 0.49, 0.30, 0.09);
        add(display, screenGeo((teamIndex + i + Number(dx > 0)) % 4, 0.44, 0.25).translate(station + dx, 1.60, z - 0.368));
        box(metal, station + dx, 1.43, z - 0.44, 0.055, 0.11, 0.055);
      }
      if ((i + teamIndex) % 3 !== 0) crew.sit.push([station, 0.58, z + 0.27, Math.PI, team.color]);
    }
    // FIA 图把每队工作区放在对应车库前方。依本段宽度布置换胎标线、设备和人员。
    const stopZ = Math.max(split(index) + 2.25, -5.4);
    const boomZ = stopZ + 0.6, gantryY = 4.75;
    box(dark, x, gantryY, boomZ, 8.05, 0.19, 0.22);
    box(taskLights, x, gantryY - 0.12, boomZ, 3.1, 0.055, 0.15);
    add(metal, jackGeo().rotateY(Math.PI).translate(x, 0.17, stopZ + 0.78));
    for (const sign of [-1, 1]) {
      box(paint, x + sign * 3.25, 0.187, stopZ, 0.11, 0.012, 3.65);
      box(paint, x + sign * 2.72, 0.187, stopZ + 1.79, 1.12, 0.012, 0.11);
      box(dark, x + sign * 3.96, gantryY, boomZ / 2, 0.19, 0.23, -boomZ + 0.08);
      box(dark, x + sign * 3.96, gantryY / 2 + 0.10, -0.37, 0.19, gantryY - 0.13, 0.19);
      box(metal, x + sign * 3.96, 0.19, -0.37, 0.34, 0.055, 0.34);
      add(rubber, hoseGeo().rotateY(sign < 0 ? Math.PI : 0).translate(x + sign * 2.45, gantryY - 0.10, boomZ));
      box(teamMat, x + sign * 5, 0.62, -1.0, 0.75, 0.93, 0.67);
      box(metal, x + sign * 5, 1.12, -1.0, 0.79, 0.065, 0.70);
      for (const dx of [-0.23, 0.23]) for (const dz of [-0.21, 0.21]) {
        add(rubber, new THREE.CylinderGeometry(0.066, 0.066, 0.054, 8)
          .rotateZ(Math.PI / 2).translate(x + sign * 5 + dx, 0.21, -1 + dz));
      }
      for (let i = 0; i < 3; i++) add(blankets, blanketGeo().translate(x + sign * 4.4, 0.31 + i * 0.35, -2.2));
      crew[sign < 0 ? 'stand' : 'work'].push([x + sign * 4.3, 0.16, stopZ + 1.3, sign * 0.7 + Math.PI, team.color]);
    }
    box(teamMat, x, 0.19, stopZ - 1.74, 2.3, 0.015, 0.24);
  }
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = material !== glass && material !== paint && material !== display;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [pose, people] of Object.entries(crew)) {
    const geo = crewGeo(pose);
    const shirt = new THREE.InstancedMesh(geo.shirt, std('#ffffff', {}, 0.46), people.length);
    const body = new THREE.InstancedMesh(geo.rest, std('#ffffff', { vertexColors: true }, 0.30), people.length);
    const actor = new THREE.Object3D(), color = new THREE.Color();
    people.forEach(([x, y, z, yaw, tint], i) => {
      actor.position.set(x, y, z);
      actor.rotation.y = yaw;
      actor.updateMatrix();
      shirt.setMatrixAt(i, actor.matrix); body.setMatrixAt(i, actor.matrix);
      shirt.setColorAt(i, color.set(tint)); body.setColorAt(i, color.set(['#f0c3a0', '#d19574', '#966149'][i % 3]));
    });
    group.add(shirt, body);
  }
  return group;
}
