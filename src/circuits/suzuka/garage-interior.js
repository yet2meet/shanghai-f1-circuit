import * as THREE from 'three';
import { carMaterials, f1CarGeometry } from '../../f1car.js';
import { blanketGeo, blanketTex, crewGeo, garageCeilTex, garageFloorTex, garageWallTex, hoseGeo, jackGeo, tyreGeo, tyreTex } from '../../garagekit.js';
import { screenAtlas, screenGeo } from '../../pitscreens.js';
import { TEAMS } from '../../teams.js';
import { canvasTex, floodlit, std } from '../../util.js';
import { meshBatch } from './meshes.js';

export function garageInterior(building, bays, bayWidth, depth, trackPoints, circuit = { name: 'SUZUKA', km: '5.807 km' }) {
  const room = new THREE.Group();
  room.name = `${circuit.name.toLowerCase()}-garage-interiors`;
  building.add(room);
  const { box, add, flush } = meshBatch(room);
  const dark = std('#323941', { roughness: 0.58, metalness: 0.2 }, 0.47);
  const steel = std('#8a959d', { metalness: 0.55 }, 0.55);
  const jackMat = dark.clone(), hoseMat = steel.clone();
  const benchtop = std('#d6dde2', { metalness: 0.19 }, 0.48);
  const wall = std('#ffffff', { map: garageWallTex() }, 0.76);
  const floor = std('#ffffff', { map: garageFloorTex(3 * bayWidth, depth, bayWidth), roughness: 0.39 }, 0.68);
  const ceiling = std('#ffffff', { map: garageCeilTex(3 * bayWidth, depth, bayWidth) }, 0.64);
  const lamp = new THREE.MeshStandardMaterial({ color: '#d8e8ff', emissive: '#e6f0ff', emissiveIntensity: 0.83 });
  const telemetry = screenAtlas(TEAMS, trackPoints, circuit);
  const monitor = new THREE.MeshStandardMaterial({
    map: telemetry, emissiveMap: telemetry, emissive: '#fff', emissiveIntensity: 0.88, roughness: 0.34,
  });
  const rubber = std('#fff', { map: tyreTex() }, 0.26);
  const tyre = tyreGeo(1).rotateZ(Math.PI / 2);
  const blanket = blanketGeo().rotateZ(Math.PI / 2);
  const fabric = blanketTex();
  const driverJack = jackGeo(), airGun = hoseGeo();
  const workCrew = crewGeo('work'), standCrew = crewGeo('stand'), seatedCrew = crewGeo('sit');
  const body = std('#ebc7a7', { vertexColors: true }, 0.62);
  const car = f1CarGeometry();
  const clearWidth = bayWidth - 0.44;
  const bayScale = Math.min(1, clearWidth / 4.2);

  for (const [i, team] of bays.entries()) {
    if (!team) continue;
    const x = (i + 0.5) * bayWidth, same = bays[i - 1] === team, end = bays[i + 1] !== team;
    if (!same) box(wall, x - bayWidth / 2, 2.32, depth / 2, 0.19, 4.64, depth - 0.12);
    if (end) box(wall, x + bayWidth / 2, 2.32, depth / 2, 0.19, 4.64, depth - 0.12);
    add(floor, new THREE.PlaneGeometry(clearWidth, depth - 0.12).rotateX(-Math.PI / 2).translate(x, 0.012, depth / 2));
    add(ceiling, new THREE.PlaneGeometry(clearWidth, depth - 0.12).rotateX(Math.PI / 2).translate(x, 4.58, depth / 2));
    add(wall, new THREE.PlaneGeometry(clearWidth, 4.53).rotateY(Math.PI).translate(x, 2.29, depth - 0.30));
    for (const z of [2.7, 6.8, 10.9]) {
      for (const side of [-1, 1]) {
        const lx = x + side * (bayWidth * 0.24);
        box(steel, lx, 4.49, z, 0.38, 0.13, 1.66);
        box(lamp, lx, 4.417, z, 0.28, 0.018, 1.56);
      }
    }
    box(dark, x, 4.13, 0.24, clearWidth, 0.38, 0.12);
  }

  const kit = new Map();
  for (const [i, team] of bays.entries()) {
    if (!team) continue;
    if (!kit.has(team)) {
      kit.set(team, {
        color: std(team.color, { roughness: 0.65 }, 0.68),
        shirt: std(team.color, {}, 0.68),
        wraps: std(team.color, { map: fabric }, 0.36), indices: [],
      });
    }
    kit.get(team).indices.push(i);
  }
  let cameraBay;
  for (const [team, { color, shirt, wraps, indices }] of kit) {
    const main = indices[Math.ceil(indices.length / 2) - 1], x = (main + 0.5) * bayWidth;
    const deskBay = indices.find(i => i !== main) ?? main;
    if (team.id === 'ferrari') cameraBay = x;
    const rear = (indices[0] + indices.at(-1) + 1) * bayWidth / 2;
    const panelWidth = indices.length * bayWidth - 0.42;
    const branding = canvasTex(512, 144, (g, w, h) => {
      g.fillStyle = '#252a31'; g.fillRect(0, 0, w, h);
      g.fillStyle = team.color; g.fillRect(0, h - 16, w, 16);
      g.font = '700 52px system-ui'; g.fillStyle = '#f5f5f4'; g.textAlign = 'center';
      g.textBaseline = 'middle'; g.fillText(team.name.toUpperCase(), w / 2, h / 2, w * 0.9);
    });
    add(std('#fff', { map: branding }, 0.68), new THREE.PlaneGeometry(panelWidth, 0.95)
      .rotateY(Math.PI).translate(rear, 3.57, depth - 0.32));
    const materials = carMaterials(team, floodlit);
    for (const key of ['paint', 'secondary', 'accent', 'carbon', 'tyre', 'rim', 'stripe']) {
      add(materials[key], car[key].clone().rotateY(Math.PI).translate(x, 0.043, 6.25));
    }
    add(jackMat, driverJack.clone().translate(x, 0.028, 3.19));
    add(jackMat, driverJack.clone().rotateY(Math.PI).translate(x, 0.028, 9.35));
    box(dark, x, 3.49, 3.22, 4.05 * bayScale, 0.14, 0.25);
    for (const side of [-1, 1]) {
      box(steel, x + side * 1.84 * bayScale, 4.00, 3.22, 0.055, 0.97, 0.055);
      const y = 4.48, z = side < 0 ? 5.2 : 7.5;
      add(hoseMat, airGun.clone().rotateY(side > 0 ? Math.PI : 0).translate(x + side * 1.40, y, z));
      const rack = x + side * Math.min(2.5, clearWidth / 2 - 0.50);
      for (const rz of [4.70, 7.45]) box(steel, rack, 0.95, rz, 0.055, 1.90, 0.065);
      for (const level of [0.15, 0.95, 1.65]) {
        box(steel, rack, level, 6.05, 0.65, 0.06, 2.78);
        for (const rz of [5.10, 5.74, 6.38, 7.02]) add(level < 0.2 ? rubber : wraps,
          (level < 0.2 ? tyre : blanket).clone().translate(rack, level + 0.37, rz));
      }
      const tools = x + side * 1.58 * bayScale;
      box(color, tools, 0.58, 10.7, 0.82, 1.05, 0.60);
      box(benchtop, tools, 1.12, 10.7, 0.86, 0.07, 0.64);
      for (let r = 0; r < 5; r++) box(dark, tools, 0.27 + r * 0.17, 10.377, 0.71, 0.035, 0.055);
    }
    for (const [j, off] of [-1.5, -0.5, 0.5, 1.5].entries()) {
      box(dark, x + off * bayScale, 3.05, 3.22, 0.87 * bayScale, 0.51, 0.09);
      add(monitor, screenGeo(j, 0.79 * bayScale, 0.44).rotateY(Math.PI).translate(x + off * bayScale, 3.05, 3.168));
    }
    box(color, x, 0.026, 1.37, 3.65 * bayScale, 0.021, 0.083);
    for (const side of [-1, 1]) box(color, x + side * 1.82 * bayScale, 0.027, 5.62, 0.086, 0.022, 8.4);
    const deskX = (deskBay + 0.5) * bayWidth;
    box(dark, deskX, 0.49, depth - 2.04, clearWidth - 0.83, 0.96, 0.70);
    box(benchtop, deskX, 1.02, depth - 2.04, clearWidth - 0.73, 0.10, 0.78);
    for (const [j, off] of [-1.2, 0, 1.2].entries()) {
      box(dark, deskX + off * bayScale, 1.49, depth - 2.21, 0.93 * bayScale, 0.59, 0.07);
      add(monitor, screenGeo((j + 1) % 4, 0.88 * bayScale, 0.53).rotateY(Math.PI).translate(deskX + off * bayScale, 1.49, depth - 2.253));
    }
    box(dark, deskX, 0.43, depth - 3.12, 0.46, 0.10, 0.48);
    box(dark, deskX, 0.71, depth - 3.35, 0.44, 0.47, 0.07);
    box(steel, deskX, 0.21, depth - 3.12, 0.08, 0.41, 0.08);
    for (const [figure, px, pz, yaw] of [[workCrew, x + 1.38, 4.93, -Math.PI / 2],
      [standCrew, x - 1.51, 8.13, 1.35], [seatedCrew, deskX, depth - 3.12, 0]]) {
      add(shirt, figure.shirt.clone().rotateY(yaw).translate(px, 0.026, pz));
      add(body, figure.rest.clone().rotateY(yaw).translate(px, 0.026, pz));
    }
  }
  flush();
  return { room, cameraBay };
}
