import * as THREE from 'three';
import { makePath, std, V } from '../../util.js';
import { buildEntrancePaving } from './entrance-paving.js';
import { meshBatch, sign } from './meshes.js';
import { indexPath, polygonIndex, sampleLine } from './terrain.js';
import map from './map-data.json';

const flatY = 0.112;
const halfWidth = 4.25;
// The mapped footbridge (183393114) and park steps (1374948775).
const parkSteps = [608.87, 394.15];
const nearDeck = [588.53, 378.79];
const farDeck = [560.57, 357.67];
const fieldSteps = [544.84, 345.79];
const deckY = 5.42;

// Official venue plan: Welcome Square, footbridge, GP Field, Circuit Wheel, GP Square.
const parkApproach = [[635.9, 466.8], [635.5, 450], [633, 436], [628, 421], [619, 406], parkSteps];
const spectatorApproach = [fieldSteps, [545, 329], [548, 308], [553, 287], [558, 265],
  [558, 243], [557, 223], [561, 207], [573, 192], [589, 177], [608, 166],
  [616, 166], [629, 170], [641, 167], [650, 155], [657, 136], [675, 116], [695, 101], [712, 83],
  [724, 72], [739, 61], [750, 43]];
const standConcourse = [[634.1, 124.34], [653.12, 100.95], [655.07, 98.56], [697.61, 46.27],
  [706.26, 35.63], [725.03, 12.54], [742.34, -8.72]];
const mappedWay = id => map.roads.find(way => way.id === id).p;

// Hotel area map: the pink vehicle route reaches THE MAIN from Parking Gate;
// the paths south of the hotel lead through the separate Hotel Gate.
const hotelWalks = [
  ['parking-to-main-gate', 2.15, [
    [962.7, 972.8], [949, 979], [927, 986], ...mappedWay(1339015270), ...mappedWay(1339015271),
    ...mappedWay(1339015272), [650, 621], [649, 611],
  ]],
  ['hotel-gate', 3.1, [[649, 611], [678, 575], [704, 548], [731, 530], [757, 512], [780, 500],
    [799, 483], [803, 480], [803, 464], [811.7, 451.5], [805, 439]]],
  ['hotel-gate-to-welcome', 3.35, [
    [805, 439], [789, 424], [779, 411], [753, 403], [744, 406], [744, 421], [730, 435], [716, 437], [691, 445],
    [669, 451], [648, 448], [635.5, 450],
  ]],
  ['circuit-plaza-walk', 2.65, [
    [744, 406], [727, 393], [714, 380], [706, 365], [707, 352], [704, 346], [700, 345],
  ]],
  ['racing-zone-walk', 2.2, [[714, 380], [731, 379], [744, 376], [751.5, 369]]],
  ['hotel-reception', 2.75, [[803, 480], [810.35, 485.94], [826, 489], [845.81, 482.32],
    ...mappedWay(465616143).slice(2, -1), [901.7, 541.2]]],
  ['hotel-garden', 2.45, [...mappedWay(465595153), [840.13, 548.51], ...mappedWay(465595150).slice(1)]],
  ['hotel-west', 2.25, [[838.57, 546.75], [841, 561], [846, 575], [849, 587.5]]],
  ['hotel-dining', 2.25, [
    [838.57, 546.75], [835, 549], ...mappedWay(465595151).slice(0, -1).reverse(),
    [789, 562], [781, 582], [781, 606], [774.2, 618],
  ]],
  ['hotel-north', 2.55, [[849, 587.5], [825, 595], [824, 617], [836, 619], [854, 620], [875, 642],
    [892, 674], [898, 694], [914, 705]]],
  ['hotel-spa', 2.5, [[901.7, 541.2], [895, 550], [896, 566], [901, 577], [910, 584], [923, 588.5]]],
  ['hotel-front-drive', 2.55, [[938.9, 544], [948, 544], [953, 547.4]]],
];
const plazas = [
  [[629, 485], [642, 485], [642.8, 467], [646, 453], [644, 444],
    [637, 439], [626, 444], [624, 454], [629, 468]],
  [[552, 242], [563, 242], [568, 235], [569, 217], [565, 207], [555, 204], [551, 215]],
  [[710, 56], [726, 60], [752, 57], [770, 49], [776, 35],
    [768, 25], [750, 23], [732, 30], [717, 39]],
  [[802, 441], [808, 443], [815, 445], [819, 454], [815, 463], [807, 464], [802, 457]],
  [[956, 971], [961, 967], [964, 970], [969, 976], [964, 980], [957, 977]],
];
// At-grade crossings positioned where distinct pedestrian approaches meet live roads.
const crossings = [
  [[813, 852], [825, 870], 1.95],
  [[659, 598], [675, 579], 2.65],
  [[662, 632], [645, 614], 1.9],
  [[799, 477], [815, 489], 2.1],
  [[831, 619], [859, 620], 2.1],
  [[787, 600], [775, 616], 1.8],
  [[675, 116], [655.07, 98.56], 2.25],
  [[751, 44], [742, 25], 2.3],
];

export function buildSpectatorEntrance(scene, cherryAvenue) {
  const root = new THREE.Group();
  root.name = 'suzuka-spectator-entrance';
  scene.add(root);
  const fascia = std('#9c9a93', {}, 0.21);
  const steel = std('#56656b', { metalness: 0.18 }, 0.24);
  const batch = meshBatch(root);
  const walks = [];
  const walk = (points, width) => {
    const path = makePath(sampleLine(points, 2));
    walks.push({ path, at: indexPath(path.pts, false, width + 1), width });
  };
  for (const [, width, points] of hotelWalks) walk(points, width);
  const gateWalk = [cherryAvenue.at(-1), [641, 586], [639, 552], [650, 545], [657, 534],
    [657, 519], [650, 505], [639, 494], cherryAvenue[0]];
  walk([...gateWalk, ...parkApproach], halfWidth);
  walk(spectatorApproach, halfWidth);
  walk(standConcourse, 2.7);
  walk([[675, 116], [655.07, 98.56]], 2.7);
  const gpAccess = [[751, 43], [745, 28], [738.5, 12], [731, 4.8]];
  walk(gpAccess, 3.35);

  // Keep the road at grade and lift only the narrow pedestrian span and stairs.
  const bridge = new THREE.Group();
  bridge.name = 'suzuka-gp-footbridge';
  root.add(bridge);
  const bridgeBatch = meshBatch(bridge);
  const bridgePath = [parkSteps, nearDeck, farDeck, fieldSteps].map(p => V(...p));
  const spanAxis = bridgePath[2].clone().sub(bridgePath[1]).normalize();
  const cross = new THREE.Vector3(-spanAxis.z, 0, spanAxis.x);
  const deckMaterial = std('#c9b99f', {}, 0.23);
  const boxBetween = (a, b, top, thickness, width, material) => {
    const mid = a.clone().lerp(b, 0.5);
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    bridgeBatch.add(material, new THREE.BoxGeometry(a.distanceTo(b) + 0.018, thickness, width)
      .rotateY(yaw).translate(mid.x, top - thickness / 2, mid.z));
  };
  boxBetween(bridgePath[1], bridgePath[2], deckY, 0.61, 2 * halfWidth, deckMaterial);
  for (const p of [bridgePath[1], bridgePath[2]]) {
    for (const side of [-1, 1]) {
      const post = p.clone().addScaledVector(cross, side * (halfWidth - 1));
      bridgeBatch.box(fascia, post.x, 2.42, post.z, 1.12, 4.84, 1.12);
    }
  }
  for (const [start, end, y0, y1] of [[0, 1, flatY, deckY], [1, 2, deckY, deckY], [2, 3, deckY, flatY]]) {
    const a = bridgePath[start], b = bridgePath[end];
    if (y0 !== y1) {
      const count = Math.ceil((deckY - flatY) / 0.18);
      for (let i = 0; i < count; i++) {
        const first = a.clone().lerp(b, i / count), last = a.clone().lerp(b, (i + 1) / count);
        boxBetween(first, last, THREE.MathUtils.lerp(y0, y1, (y0 < y1 ? i : i + 1) / count), 0.23, 2 * halfWidth, deckMaterial);
      }
      for (const side of [-1, 1]) {
        const off = side * (halfWidth - 0.17);
        bridgeBatch.beam(fascia, a.clone().addScaledVector(cross, off).setY(y0 - 0.21),
          b.clone().addScaledVector(cross, off).setY(y1 - 0.21), 0.48);
      }
    }
    for (const side of [-1, 1]) {
      const off = side * (halfWidth - 0.2);
      const first = a.clone().addScaledVector(cross, off).setY(y0), last = b.clone().addScaledVector(cross, off).setY(y1);
      for (const rail of [0.52, 1.06]) {
        const up = new THREE.Vector3(0, rail, 0);
        bridgeBatch.beam(steel, first.clone().add(up), last.clone().add(up), 0.09);
      }
      const count = Math.ceil(a.distanceTo(b) / 2);
      for (let i = 0; i <= count; i++) {
        const p = first.clone().lerp(last, i / count);
        bridgeBatch.box(steel, p.x, p.y + 0.52, p.z, 0.085, 1.08, 0.085);
      }
    }
  }
  bridgeBatch.flush();

  const board = (text, p, next, width) => {
    const from = V(...p), facing = from.clone().sub(V(...next)).normalize();
    const panel = sign(text, width, 1.28, '#344b54');
    panel.position.copy(from).setY(2.43);
    panel.rotation.y = Math.atan2(facing.x, facing.z);
    root.add(panel);
    for (const side of [-1, 1]) {
      const post = from.clone().addScaledVector(new THREE.Vector3(facing.z, 0, -facing.x), side * (width / 2 - 0.34));
      batch.box(steel, post.x, 1.49, post.z, 0.13, 2.85, 0.13);
    }
  };
  board('WELCOME SQUARE  ·  GP SQUARE ↑', [642, 450], [640, 437], 11.6);
  board('CIRCUIT WHEEL  ·  GRANDSTAND ↑', [554, 250], [554, 237], 10.4);
  const [plazaSide, gateCenter, concourseSide] = gpAccess;
  const gateAt = V(...gateCenter), direction = V(...concourseSide).sub(V(...plazaSide)).normalize();
  const outward = new THREE.Vector3(direction.z, 0, -direction.x);
  const gateYaw = Math.atan2(-outward.z, outward.x);
  const canopy = std('#aeb9bb', { metalness: 0.15 }, 0.24);
  batch.add(canopy, new THREE.BoxGeometry(8.9, 0.3, 3.4).rotateY(gateYaw)
    .translate(gateAt.x, 3.72, gateAt.z));
  for (const offset of [-3.62, 3.62]) {
    const post = gateAt.clone().addScaledVector(outward, offset);
    batch.box(steel, post.x, 1.84, post.z, 0.27, 3.68, 0.27);
    batch.box(fascia, post.x, 0.27, post.z, 0.8, 0.38, 0.8);
  }
  const front = V(...gateCenter).addScaledVector(direction, -1.74);
  const back = V(...gateCenter).addScaledVector(direction, 1.74);
  for (const [text, p, yaw] of [
    ['GP ENTRANCE  ·  GRANDSTAND V', front, gateYaw + Math.PI], ['GP SQUARE', back, gateYaw],
  ]) {
    const panel = sign(text, 8.35, 0.75, '#344b54');
    panel.position.copy(p).setY(3.25);
    panel.rotation.y = yaw;
    root.add(panel);
  }
  batch.flush();

  const plazaAt = polygonIndex(plazas.map(p => ({ p })));
  const bridgeAt = indexPath(bridgePath, false, halfWidth + 1);
  const atWalk = (x, n) => Boolean(plazaAt(x, n))
    || walks.some(({ at, width }) => (at(x, -n)?.d ?? Infinity) <= width);
  return {
    atWalk,
    buildPaving: roadRoot => buildEntrancePaving(root, roadRoot, walks, plazas, crossings),
    occupied: (x, n) => atWalk(x, n) || (bridgeAt(x, -n)?.d ?? Infinity) <= halfWidth,
    blossomRow: [[636, 449], [632, 432], [625, 414], [619, 407], parkSteps],
  };
}
