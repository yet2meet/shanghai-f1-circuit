import * as THREE from 'three';
import { std, V } from '../../util.js';
import { meshBatch } from '../suzuka/meshes.js';

// Covered footbridge and the mapped metal stairs on either end.
export const crossingWays = new Set([194458113, 1357168026, 1357168027]);

export function buildFootbridge(root, roads, track, surface) {
  const deck = roads.find(r => r.id === 194458113);
  const stairs = [[1357168027, 30], [1357168026, 27]];
  const feet = new Set();
  const bridge = new THREE.Group();
  bridge.name = 'monza-mirabello-footbridge';
  root.add(bridge);
  const batch = meshBatch(bridge);
  const height = 5.65 + surface;
  const steel = std('#5e6967', { metalness: 0.34, roughness: 0.61 }, 0.23);
  const structure = std('#777e78', { roughness: 0.79 }, 0.17);
  const roof = std('#737e76', { metalness: 0.23, roughness: 0.7 }, 0.18);
  const tread = std('#acafa8', { metalness: 0.26, roughness: 0.7 }, 0.24);
  const edge = std('#d9d8cc', { roughness: 0.77 }, 0.24);
  const concrete = std('#a6a598', {}, 0.18);
  const width = deck.w;
  const a = V(...deck.p[0]), b = V(...deck.p.at(-1));

  function section(from, to) {
    const along = to.clone().sub(from).normalize();
    const normal = new THREE.Vector3(along.z, 0, -along.x);
    const length = from.distanceTo(to);
    const at = (u, side, y) => from.clone().addScaledVector(along, u).addScaledVector(normal, side).setY(y);
    const box = (mat, u, y, side, w, h, d) => {
      const p = at(u, side, y);
      batch.add(mat, new THREE.BoxGeometry(w, h, d).rotateY(Math.atan2(along.x, along.z)).translate(p.x, p.y, p.z));
    };
    return { at, box, length };
  }

  function rail({ at, length }, yAt, first, last) {
    for (const side of [-1, 1]) {
      const offset = side * (width / 2 - 0.10);
      for (const y of [0.54, 1.04]) batch.beam(steel, at(0, offset, yAt(0) + y), at(length, offset, yAt(length) + y), 0.055);
      const count = Math.ceil(length / 2.25);
      for (let i = first ? 0 : 1; i <= count - Number(!last); i++) {
        const u = i * length / count;
        batch.beam(steel, at(u, offset, yAt(u) - 0.08), at(u, offset, yAt(u) + 1.07), 0.06);
      }
    }
  }

  const span = section(a, b);
  const { length } = span;
  span.box(tread, length / 2, height - 0.045, 0, width, 0.09, length);
  for (const side of [-1, 1]) span.box(structure, length / 2, height - 0.37, side * (width / 2 - 0.17), 0.28, 0.60, length);
  span.box(roof, length / 2, height + 2.59, 0, width + 0.46, 0.18, length + 0.45);
  rail(span, () => height, true, true);
  const bays = Math.ceil(length / 3.4);
  for (let i = 0; i <= bays; i++) {
    const u = i * length / bays;
    for (const side of [-1, 1]) {
      const offset = side * (width / 2 - 0.09);
      batch.beam(steel, span.at(u, offset, height - 0.28), span.at(u, offset, height + 2.53), 0.10);
    }
    batch.beam(steel, span.at(u, -width / 2, height + 2.47), span.at(u, width / 2, height + 2.47), 0.12);
  }
  for (const u of [0.30, length - 0.30]) {
    const p = span.at(u, 0, 0);
    if (track.distTo(p.x, p.z, 2) < 9.5) continue;
    for (const side of [-1, 1]) span.box(structure, u, (height - 0.64) / 2, side * (width / 2 - 0.26), 0.36, height - 0.64, 0.42);
  }

  for (const [id, count] of stairs) {
    const ends = roads.find(r => r.id === id).p.map(p => V(...p));
    const [foot, top] = ends.sort((p, q) => Math.min(q.distanceTo(a), q.distanceTo(b)) - Math.min(p.distanceTo(a), p.distanceTo(b)));
    feet.add(`${foot.x},${foot.z}`);
    const flight = section(foot, top);
    const landing = 0.55, step = (flight.length - landing) / count;
    const rise = (height - surface) / count;
    const yAt = u => surface + Math.max(0, (u - landing) / (flight.length - landing)) * (height - surface);
    flight.box(concrete, landing / 2, surface - 0.085, 0, width, 0.17, landing);
    for (let i = 0; i < count; i++) {
      const u = landing + i * step, y = surface + (i + 1) * rise;
      flight.box(tread, u + step / 2, y - (rise + 0.10) / 2, 0, width, rise + 0.10, step);
      flight.box(edge, u + 0.018, y + 0.002, 0, width - 0.18, 0.012, 0.035);
    }
    for (const side of [-1, 1]) {
      const offset = side * (width / 2 - 0.17);
      batch.beam(structure, flight.at(landing, offset, surface - 0.14), flight.at(flight.length, offset, height - 0.25), 0.22);
    }
    rail(flight, yAt, true, false);
  }
  batch.flush();

  const outline = [[0, -width / 2], [length, -width / 2], [length, width / 2], [0, width / 2]]
    .flatMap(([u, side]) => {
      const p = span.at(u, side, 0);
      return [p.x, -p.z];
    });
  return { feet, camBuilding: { p: outline, m: height - 0.67, h: height + 2.68 } };
}
