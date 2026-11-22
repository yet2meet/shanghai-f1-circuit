import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, std, V } from '../../util.js';

// 两个旧 OSM building 轮廓的标称位置。临时标牌的尺寸及画面为示意。
const signs = [
  { id: '507976158', name: 'National Pits Straight', tip: [121.1, 852.2], root: [124.1, 819.2], cantilever: true },
  { id: '507977621', name: 'Maggotts', tip: [459.2, 452.0], root: [465.3, 452.3], cantilever: false },
];

export const SIGN_FOOTPRINTS = new Set(signs.map(sign => sign.id));

export function buildSilverstoneSigns(scene) {
  const paint = canvasTex(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = '#202b39';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ed2039';
    ctx.fillRect(0, h - 7, w, 7);
    ctx.font = 'bold italic 79px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5f7f8';
    ctx.fillText('SILVERSTONE', w / 2, h * 0.51, w * 0.88);
  });
  const face = std('#ffffff', { map: paint, roughness: 0.72 }, 0.37);
  const steel = std('#4c5660', { roughness: 0.60, metalness: 0.35 }, 0.22);
  for (const { name, tip, root, cantilever } of signs) {
    const a = V(...tip), b = V(...root);
    const delta = b.clone().sub(a), span = delta.length();
    const group = new THREE.Group();
    group.name = `silverstone-sign-${name}`;
    group.position.copy(a);
    group.rotation.y = Math.atan2(-delta.z, delta.x);
    const parts = [];
    const beam = (x0, y0, z0, x1, y1, z1, width) => {
      const axis = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
      const geo = new THREE.BoxGeometry(width, axis.length(), width);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
      parts.push(geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    };
    const bottom = cantilever ? 6.1 : 2.55;
    const panelWidth = cantilever ? 16.0 : span;
    const panelHeight = cantilever ? 1.58 : 1.42;
    const panelY = bottom + panelHeight / 2;
    const baseXs = cantilever ? [span - 1.19, span] : [0.52, span - 0.52];
    const depth = cantilever ? 0.56 : 0.15;
    for (const x of baseXs) {
      parts.push(new THREE.BoxGeometry(cantilever ? 1.8 : 0.44, 0.28, cantilever ? 2.1 : 0.51).translate(x, 0.14, 0));
      for (const z of cantilever ? [-depth, depth] : [0]) beam(x, 0.24, z, x, panelY, z, cantilever ? 0.19 : 0.13);
    }
    if (cantilever) {
      const low = panelY - 0.38, high = panelY + 0.38, panels = Math.ceil(span / 2.75);
      for (const z of [-depth, depth]) {
        for (const y of [low, high]) beam(0, y, z, span, y, z, 0.14);
        for (let i = 0; i < panels; i++) {
          const x = span * i / panels, next = span * (i + 1) / panels;
          beam(x, low, z, x, high, z, 0.095);
          beam(x, i % 2 ? high : low, z, next, i % 2 ? low : high, z, 0.088);
          beam(x, high, -depth, x, high, depth, 0.08);
        }
      }
    }
    if (cantilever) {
      for (const side of [-1, 1]) {
        parts.push(new THREE.BoxGeometry(panelWidth, panelHeight, 0.18).translate(panelWidth / 2, panelY, side * (depth + 0.025)));
      }
    } else {
      parts.push(new THREE.BoxGeometry(panelWidth, panelHeight, 0.20).translate(panelWidth / 2, panelY, 0));
    }
    const structure = new THREE.Mesh(mergeGeometries(parts), steel);
    structure.castShadow = structure.receiveShadow = true;
    group.add(structure);
    for (const side of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(panelWidth - 0.12, panelHeight - 0.10), face);
      board.position.set(panelWidth / 2, panelY, side * (cantilever ? depth + 0.12 : 0.105));
      board.rotation.y = side > 0 ? 0 : Math.PI;
      group.add(board);
    }
    scene.add(group);
  }
}
