// Silverstone Wing：轮廓取 OSM way 227332429，车库分配参考 FIA 2025 英国站维修通道图。
// 屋顶高度与立面细节为示意，30 m 是建筑翼尖的高度而非整栋屋高。
import * as THREE from 'three';
import { buildPitBuilding } from '../../pitbuilding.js';
import { TEAMS } from '../../teams.js';
import { std } from '../../util.js';
import osm from './osm-data.json';
import { buildPitWorkspace } from './pit-workspace.js';

const byId = (id) => TEAMS.find((team) => team.id === id);
const sauber = { id: 'sauber', name: 'Sauber', color: '#52e500', text: '#111111', livery: ['#161b16', '#52e500', '#eeeeee'] };
const teams = ['mclaren', 'ferrari', 'redbull', 'mercedes', 'astonmartin', 'alpine', 'haas', 'racingbulls', 'williams'].map(byId).concat(sauber);
export const SILVERSTONE_TEAMS = teams;
// FIA: 01–02 FOM, 03–06 FIA, 07–15 McLaren/Ferrari/Red Bull, 16 FIA,
// 17–31 Mercedes/Aston Martin/Alpine/Haas/Racing Bulls, 32–33 Pirelli,
// 34–39 Williams/Sauber, 40–41 FOM. 数组方向由维修区入口到出口。
const slots = ['FOM', 'FOM', 'FIA', 'FIA', 'FIA', 'FIA'];
for (const team of teams.slice(0, 3)) slots.push(team, team, team);
slots.push('FIA');
for (const team of teams.slice(3, 8)) slots.push(team, team, team);
slots.push('Pirelli', 'Pirelli');
for (const team of teams.slice(8)) slots.push(team, team, team);
slots.push('FOM', 'FOM');

export function buildSilverstonePit(scene, brand, track, trackPoints) {
  const p = osm.wing.p, a = p[21], b = p[35];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const P = { front: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f: [-tangent[1], tangent[0]], L, D: 32.6 };
  const pitb = buildPitBuilding(scene, brand, {
    P, garageSlots: slots, teams, trackPoints, trackLabel: { name: 'SILVERSTONE', km: '5.891 km' },
    showApron: false, showRoofEquipment: false, podium: false, band: ['SILVERSTONE', 'BRITISH GRAND PRIX'], tvLive: 'LIVE · SILVERSTONE',
  });

  buildWingRoof(scene);
  buildPitWorkspace(pitb, track, teams, slots);
  return pitb;
}

function buildWingRoof(scene) {
  const cladding = std('#747d86', { roughness: 0.56, metalness: 0.34 });
  const glass = std('#446277', { roughness: 0.22, metalness: 0.64 });
  const roofMat = std('#5c646b', { roughness: 0.68, metalness: 0.24 });
  const parts = [];
  for (const { p, tags } of osm.wing.parts) {
    const high = Number(tags.height), slope = Number(tags['roof:height']) || 0;
    const low = Math.max(Number(tags.min_height) || 11.5, high - slope);
    const heading = THREE.MathUtils.degToRad(Number(tags['roof:direction']) || 0);
    const project = (x, n) => x * Math.sin(heading) + n * Math.cos(heading);
    const projected = p.map(([x, n]) => project(x, n));
    const min = Math.min(...projected), max = Math.max(...projected);
    const yAt = (x, n) => THREE.MathUtils.lerp(high, slope ? low : high, (project(x, n) - min) / Math.max(max - min, 0.01));
    const points = p.map(([x, n]) => new THREE.Vector2(x, n));
    const roof = new THREE.ShapeGeometry(new THREE.Shape(points));
    const position = roof.attributes.position;
    for (let i = 0; i < position.count; i++) position.setZ(i, yAt(position.getX(i), position.getY(i)));
    roof.rotateX(-Math.PI / 2); roof.computeVertexNormals();
    const top = new THREE.Mesh(roof, roofMat);
    top.castShadow = top.receiveShadow = true;
    scene.add(top);
    const sides = [];
    // 11.5 m 以上的分块接到维修楼玻璃层。翼尖及幕墙按各部件轮廓单独生成。
    const bottom = tags['building:part'] === 'roof' ? low - 0.45 : low === 11.5 && high <= 12 ? 0 : 11.85;
    p.forEach(([x, n], i) => {
      const [xx, nn] = p[(i + 1) % p.length];
      sides.push(x, bottom, -n, xx, bottom, -nn, xx, Math.max(bottom, yAt(xx, nn)), -nn,
        x, bottom, -n, xx, Math.max(bottom, yAt(xx, nn)), -nn, x, Math.max(bottom, yAt(x, n)), -n);
    });
    if (high > 12 || tags['roof:shape'] === 'flat') {
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
      g.computeVertexNormals();
      const side = new THREE.Mesh(g, tags['building:material'] === 'glass' ? glass : cladding);
      side.material.side = THREE.DoubleSide;
      side.castShadow = true; scene.add(side);
    }
    parts.push(top);
  }

  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const solarMat = std('#263a4a', { roughness: 0.5, metalness: 0.46 });
  for (const p of osm.wing.solar) {
    const panel = new THREE.ShapeGeometry(new THREE.Shape(p.map(([x, n]) => new THREE.Vector2(x, n))));
    const pos = panel.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      ray.ray.origin.set(pos.getX(i), 40, -pos.getY(i));
      const hit = ray.intersectObjects(parts, false)[0];
      pos.setZ(i, (hit?.point.y ?? 12.16) + 0.14);
    }
    panel.rotateX(-Math.PI / 2); panel.computeVertexNormals();
    scene.add(new THREE.Mesh(panel, solarMat));
  }
}
