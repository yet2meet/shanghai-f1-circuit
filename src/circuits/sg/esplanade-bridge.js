// Esplanade Drive 的桥与南引道：OSM ways 35037538、528539591、173779730。
import * as THREE from 'three';
import { groundDetail } from '../../textures.js';
import { canvasTex, makePath, ribbon, std, V } from '../../util.js';

const FROM = [-1707.1, -411.7];
const TO = [-1620.8, -135];
const SOUTH_APPROACH = [[-1718.7, -444.7], [-1710.3, -422], [-1709, -417.6]];
const NORTH_APPROACH = [[-1606.7, -93.9], [-1589.7, -41.7], [-1576.7, -8.2], [-1573.2, 0.1], [-1541.9, 66.9], [-1526.7, 99.2]];
const ROAD_HALF = 15.6 / 2;
const PAVEMENT = 0.12;
const OUTER_EDGE = 13.25;

/** 北岸绿地面穿过道路数据，只清理引道和临水步道占用的范围。 */
export function esplanadeBridgeTreeClearance() {
  const end = V(...TO);
  const direction = V(...NORTH_APPROACH[0]).sub(end).normalize();
  const across = new THREE.Vector3(direction.z, 0, -direction.x);
  const clearance = [];
  for (let d = -30; d <= 42; d += 6) {
    const at = end.clone().addScaledVector(direction, d);
    clearance.push({ c: [at.x, -at.z], r: ROAD_HALF + 0.8 });
    if (d <= 6) {
      at.addScaledVector(across, (ROAD_HALF + OUTER_EDGE) / 2);
      clearance.push({ c: [at.x, -at.z], r: 4.1 });
    }
  }
  return clearance;
}

export function buildEsplanadeBridge(scene) {
  const root = new THREE.Group();
  root.name = 'sg-esplanade-bridge';
  const deckPath = makePath([V(...FROM), V(...TO)]);
  const roadPath = makePath([...SOUTH_APPROACH, FROM, TO, ...NORTH_APPROACH].map(([x, n]) => V(x, n)));
  const length = deckPath.total;
  const asphalt = groundDetail(std('#747983', { roughness: 0.95 }, 0.27), 'asphalt', { size: 3, k: 0.28, mk: 0.06 });
  const concrete = std('#a7abb0', { roughness: 0.95 }, 0.3);
  const fascia = std('#777f8a', { roughness: 0.9 }, 0.24);
  const coping = std('#c1c5c9', { roughness: 0.85 }, 0.34);
  const rail = std('#959faa', { roughness: 0.52, metalness: 0.25 }, 0.35);
  const paint = std('#e3e6e7', { roughness: 0.85 }, 0.36);
  const dashed = canvasTex(64, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w / 3, h); }, [1, 1]);
  const dashPaint = std('#e3e6e7', { map: dashed, alphaTest: 0.5, roughness: 0.85 }, 0.36);

  function surface(name, path, a, b, y, material, order) {
    const geometry = ribbon(path, { offA: a, offB: b, y, uv: 9 });
    if (path === roadPath) {
      // 引道末端接至 OSM 道路高度，标线与路面沿用同一个过渡。
      const pos = geometry.attributes.position;
      for (const i of [0, 1, pos.count - 2, pos.count - 1]) pos.setY(i, y - (PAVEMENT - 0.043));
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    root.add(mesh);
  }
  surface('carriageway', roadPath, ROAD_HALF, -ROAD_HALF, PAVEMENT, asphalt, -1.82);
  surface('race-deck', deckPath, -ROAD_HALF + 0.02, -27.8, PAVEMENT, asphalt, -1.83);
  for (const x of [-3.5, 0, 3.5]) surface('lane-dash', roadPath, x + 0.075, x - 0.075, PAVEMENT + 0.01, dashPaint, -1.72);
  for (const x of [-7.25, 7.25]) surface('edge-line', roadPath, x + 0.085, x - 0.085, PAVEMENT + 0.01, paint, -1.72);

  const structure = new THREE.Group();
  structure.name = 'deck-structure';
  structure.position.copy(deckPath.pts[0]);
  const tangent = deckPath.tan[0];
  structure.rotation.y = Math.atan2(tangent.x, tangent.z);
  root.add(structure);

  function beam(x, width, bottom, top, material, order = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, top - bottom, length), material);
    mesh.position.set(x, (top + bottom) / 2, length / 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    structure.add(mesh);
  }

  const edges = [OUTER_EDGE, -32.25];
  const [outer, inner] = edges;
  const outerCurb = ROAD_HALF - 0.08;
  const sections = Math.ceil(length / 3.2);
  beam((outer + inner) / 2, outer - inner, -0.38, PAVEMENT - 0.025, fascia, -2.35);
  for (const [i, [a, b]] of [[outerCurb, outer], [inner, -27.72]].entries()) {
    const x = edges[i] + (i === 0 ? -0.16 : 0.16);
    beam((a + b) / 2, b - a, PAVEMENT - 0.035, 0.29, concrete);
    beam(i === 0 ? a + 0.1 : b - 0.1, 0.2, PAVEMENT, 0.31, coping);
    beam(x, 0.32, 0.29, 0.48, coping);
    beam(x, 0.085, 0.77, 0.83, rail);
    beam(x, 0.11, 1.15, 1.23, rail);

    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.68, 0.09), rail, sections + 1);
    const matrix = new THREE.Matrix4();
    for (let j = 0; j <= sections; j++) {
      const z = THREE.MathUtils.lerp(0.15, length - 0.15, j / sections);
      posts.setMatrixAt(j, matrix.makeTranslation(x, 0.81, z));
    }
    posts.instanceMatrix.needsUpdate = true;
    structure.add(posts);
  }

  // 北岸原步道端点在桥台外，接一小段收窄的坡道。
  const end = deckPath.pts[1];
  const toWalk = V(-1630.4, -124.9).sub(end);
  const walkCentre = toWalk.dot(deckPath.nor[1]);
  const walkPath = makePath([end, end.clone().addScaledVector(tangent, toWalk.dot(tangent))]);
  const ramp = ribbon(walkPath, {
    offA: (i) => i ? walkCentre + 1.3 : outer,
    offB: (i) => i ? walkCentre - 1.3 : outerCurb,
    y: 0.29,
  });
  ramp.attributes.position.setY(2, 0.045);
  ramp.attributes.position.setY(3, 0.045);
  ramp.computeVertexNormals();
  const rampMesh = new THREE.Mesh(ramp, concrete);
  rampMesh.name = 'north-walkway-ramp';
  rampMesh.receiveShadow = true;
  root.add(rampMesh);
  scene.add(root);
}
