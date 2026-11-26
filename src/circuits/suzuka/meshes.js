import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex } from '../../util.js';

const up = new THREE.Vector3(0, 1, 0);

export function meshBatch(group) {
  const batches = new Map();
  const add = (material, geo) => {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(geo.index ? geo.toNonIndexed() : geo);
  };
  return {
    add,
    box(material, x, y, z, w, h, d) {
      add(material, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    },
    beam(material, a, b, width) {
      const delta = b.clone().sub(a), mid = a.clone().lerp(b, 0.5);
      if (delta.lengthSq() < 1e-8) return;
      add(material, new THREE.BoxGeometry(width, delta.length(), width)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize())).translate(...mid));
    },
    flush() {
      for (const [material, geos] of batches) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
      }
    },
  };
}

export function sign(text, width, height, bg = '#172425') {
  const map = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6ee';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 54px system-ui';
    g.fillText(text, w / 2, h / 2, w - 20);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
}

export function footprint(points, base, height) {
  const shape = new THREE.Shape(points.map(([x, n]) => new THREE.Vector2(x, n)));
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, base, 0);
}
