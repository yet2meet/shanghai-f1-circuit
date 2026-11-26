import * as THREE from 'three';
import { canvasTex, std, V } from '../../util.js';
import { footprint, meshBatch, sign } from './meshes.js';

const features = {
  184415318: { type: 'tower', name: 'WEST CONTROL' },
  184423963: { type: 'office' },
  184429429: { type: 'office', name: 'MEDICAL CENTRE' },
  184430907: { type: 'office', name: 'CENTER HOUSE' },
  184430909: { type: 'office' },
  184430911: { type: 'office' },
  465595141: { type: 'hotel', name: 'SUZUKA CIRCUIT HOTEL' },
  466925741: { type: 'office', name: 'TRAFFIC EDUCATION CENTER' },
  466813342: { type: 'hall' },
};

const centroid = pts => pts.reduce((a, p) => a.addScaledVector(p, 1 / pts.length), new THREE.Vector3());

export function buildFootprints(scene, buildings, heightAt) {
  const root = new THREE.Group();
  root.name = 'suzuka-buildings';
  scene.add(root);
  const batch = meshBatch(root);
  const concrete = std('#d1d2ce', {}, 0.19);
  const walls = {
    hall: std('#abb1b4', {}, 0.19), hotel: std('#ddd4c6', {}, 0.18), office: concrete, tower: concrete,
    shop: std('#bbbcb4', {}, 0.20),
  };
  const roof = std('#7e858c', { metalness: 0.18, roughness: 0.57 }, 0.15);
  const coping = std('#e1e2df', { roughness: 0.58 }, 0.24);
  const frame = std('#535f67', { metalness: 0.28, roughness: 0.48 }, 0.24);
  const window = std('#6c8797', { roughness: 0.21, metalness: 0.34, envMapIntensity: 1.2 }, 0.23);
  const joint = std('#b0b3b4', {}, 0.2);
  const doorMap = canvasTex(32, 96, (g, w, h) => {
    g.fillStyle = '#6b757b'; g.fillRect(0, 0, w, h);
    for (let i = 3; i < h; i += 4) { g.fillStyle = '#91989b'; g.fillRect(0, i, w, 1); }
  });
  const shutter = std('#ffffff', { map: doorMap, metalness: 0.18 }, 0.22);
  const models = [];
  for (const b of buildings) {
    const points = b.p.map(p => V(...p)), center = centroid(points);
    const floor = heightAt(center.x, center.z), elevations = points.map(p => heightAt(p.x, p.z));
    const low = Math.min(...elevations) - 0.18;
    const use = features[b.id] ?? { type: b.kind === 'house' ? 'hotel' : b.name ? 'shop' : 'office' };
    const entrance = b.id === 466005760;
    const height = use.type === 'tower' ? Math.max(b.h, 7.2) : b.h;
    const top = Math.max(low + 1.1, floor + height);
    const canopy = b.roof || entrance || b.id === 466005785 || b.id === 465595105;
    const eaves = canopy ? (entrance ? floor + 4.2 : Math.max(floor + 2.6, top - 0.4)) : top;
    const edges = points.map((a, i) => {
      const next = points[(i + 1) % points.length], delta = next.clone().sub(a);
      const length = delta.length(), axis = delta.normalize();
      const out = new THREE.Vector3(-axis.z, 0, axis.x);
      if (out.dot(a.clone().lerp(next, 0.5).sub(center)) < 0) out.negate();
      return { a, axis, out, length };
    });
    const front = edges.reduce((a, e) => e.length > a.length ? e : a);
    const boxOn = (edge, material, u, y, w, h, d, offset = 0) => {
      const p = edge.a.clone().addScaledVector(edge.axis, u).addScaledVector(edge.out, offset);
      batch.add(material, new THREE.BoxGeometry(w, h, d)
        .rotateY(Math.atan2(-edge.axis.z, edge.axis.x)).translate(p.x, y, p.z));
    };
    if (!canopy) batch.add(walls[use.type], footprint(b.p, low, top - low - 0.22));
    batch.add(entrance ? coping : roof, footprint(b.p, eaves - 0.22, entrance ? 0.65 : 0.25));

    for (const edge of edges) {
      if (edge.length < 2.8) continue;
      boxOn(edge, coping, edge.length / 2, eaves - 0.16, edge.length + 0.22, 0.25, 0.20, 0.07);
      if (canopy) {
        const count = Math.max(1, Math.floor(edge.length / 6));
        for (let j = 0; j < count; j++) {
          const u = (j + 0.5) * edge.length / count;
          const at = edge.a.clone().addScaledVector(edge.axis, u);
          const base = heightAt(at.x, at.z) - 0.12;
          const h = Math.max(0.25, eaves - base);
          boxOn(edge, frame, u, base + h / 2, entrance ? 0.36 : 0.22, h, entrance ? 0.36 : 0.22);
        }
        continue;
      }
      boxOn(edge, joint, edge.length * 0.5, Math.min(top - 0.4, floor + 0.45), edge.length, 0.38, 0.14, 0.07);
      const levels = Math.max(1, Math.round(height / 3.4)), levelHeight = height / levels;
      const panels = Math.max(1, Math.floor(edge.length / (use.type === 'hotel' ? 3.8 : 4.3)));
      const width = edge.length / panels;
      for (let j = 0; j < panels; j++) {
        const u = (j + 0.5) * width;
        const entry = edge === front && j === Math.floor(panels / 2);
        for (let level = 0; level < levels; level++) {
          if (!level && entry) {
            const doorWidth = Math.min(width * 0.76, 3.25), doorH = Math.min(levelHeight * 0.76, 2.72);
            const p = edge.a.clone().addScaledVector(edge.axis, u);
            const threshold = Math.max(low, heightAt(p.x, p.z) - 0.03);
            if (threshold + doorH > top - 0.35) continue;
            boxOn(edge, frame, u, threshold + doorH / 2, doorWidth + 0.16, doorH + 0.13, 0.15, 0.084);
            boxOn(edge, use.type === 'hall' ? shutter : window, u, threshold + doorH / 2, doorWidth, doorH, 0.06, 0.165);
            boxOn(edge, coping, u, threshold + doorH + 0.19, doorWidth + 0.42, 0.16, 0.84, 0.36);
            continue;
          }
          const y = floor + (level + 0.56) * levelHeight, h = Math.min(1.6, levelHeight * 0.58);
          const pane = Math.min(width * (use.type === 'tower' ? 0.9 : 0.67), 5.2);
          boxOn(edge, frame, u, y, pane + 0.12, h + 0.12, 0.109, 0.08);
          boxOn(edge, window, u, y, pane, h, 0.056, 0.146);
          if (pane > 2.2) boxOn(edge, frame, u, y, 0.060, h, 0.055, 0.181);
          boxOn(edge, coping, u, y - h / 2 - 0.06, pane + 0.22, 0.09, 0.22, 0.104);
        }
      }
    }
    const title = entrance ? 'SUZUKA CIRCUIT' : use.name;
    if (title) {
      const p = front.a.clone().addScaledVector(front.axis, front.length / 2).addScaledVector(front.out, entrance ? 0.23 : 0.21);
      const width = Math.min(front.length - 0.7, entrance ? 14 : title.length * 0.55);
      const board = sign(title, width, entrance ? 1.0 : 0.82, '#36434b');
      board.position.copy(p).setY(entrance ? eaves : top - 0.65);
      board.rotation.y = Math.atan2(front.out.x, front.out.z);
      root.add(board);
    }
    models.push({ h: canopy ? eaves + 0.45 : top, m: canopy ? eaves - 0.22 : 0, p: b.p.flat() });
  }
  batch.flush();
  return models;
}
