import * as THREE from 'three';
import { canvasTex, lampMat, rng, std, V } from '../../util.js';
import { meshBatch, sign } from './meshes.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const tau = 2 * Math.PI;
const average = p => p.reduce((c, [x, n]) => [c[0] + x / p.length, c[1] + n / p.length], [0, 0]);

export function buildWheel(scene, outline, groundAt) {
  const [x, n] = average(outline), root = new THREE.Group();
  root.name = 'suzuka-circuit-wheel';
  root.position.copy(V(x, n, groundAt(x, -n)));
  // The short cross-bar in the OSM footprint is parallel to the wheel.
  const [a, b] = outline;
  root.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
  scene.add(root);
  const base = meshBatch(root);
  const red = std('#b73636', { metalness: 0.38 }, 0.48);
  const metal = std('#e2e4dc', { metalness: 0.38 }, 0.32);
  const concrete = std('#a9a39b', {}, 0.2);
  const rimLight = lampMat('#eceee3', '#ffd1da', 0.36, { roughness: 0.4 });
  const windows = lampMat('#aac4ca', '#ffdbb9', 0.48, { roughness: 0.27, metalness: 0.18 });
  // An approximately 50 m top height is published. Rim, cabin and supports
  // use the official photo proportions; the cabin count is illustrative.
  const cabins = 40, hub = 27.5, r = 22.2;
  const spindle = new THREE.CylinderGeometry(0.95, 0.95, 13.8, 14).rotateX(Math.PI / 2).translate(0, hub, 0);
  base.add(metal, spindle);
  for (const iz of [-1, 1]) {
    const z = iz * 5.4;
    for (const ix of [-1, 1]) {
      const foot = v(ix * 10.5, 0, iz * 9.6);
      const world = root.localToWorld(foot.clone());
      foot.y = groundAt(world.x, world.z) - root.position.y;
      base.box(concrete, foot.x, foot.y + 0.13, foot.z, 4.0, 0.58, 3.2);
      base.beam(red, foot, v(0, hub, z), 0.92);
    }
    base.beam(red, v(-7.6, 8.6, z + iz * 2.8), v(7.6, 8.6, z + iz * 2.8), 0.54);
    base.beam(red, v(-4.8, 16.4, z + iz * 1.5), v(4.8, 16.4, z + iz * 1.5), 0.48);
  }
  base.box(concrete, 0, 0.38, 0, 15, 0.76, 6.9);
  base.flush();
  const wheel = new THREE.Group();
  wheel.position.y = hub;
  root.add(wheel);
  const ring = meshBatch(wheel);
  for (const side of [-1, 1]) ring.add(rimLight, new THREE.TorusGeometry(r, 0.22, 8, 112).translate(0, 0, side * 0.72));
  const cabin = new THREE.Group();
  const shell = meshBatch(cabin);
  shell.beam(red, v(0, 1.85, 0), v(0, 0.38, 0), 0.12);
  shell.add(red, new THREE.SphereGeometry(1, 10, 8, 0, tau, Math.PI / 2, Math.PI / 2).scale(1.12, 0.66, 0.98));
  shell.add(red, new THREE.SphereGeometry(1, 10, 8, 0, tau, 0, Math.PI / 2).scale(1.12, 0.41, 0.98).translate(0, 1.02, 0));
  shell.box(windows, 0, 0.53, 0, 1.86, 1.08, 1.58);
  for (const xx of [-0.6, 0.6]) for (const zz of [-0.81, 0.81]) shell.box(red, xx, 0.54, zz, 0.08, 1.10, 0.06);
  shell.flush();
  const cabinMeshes = cabin.children.map(part => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, cabins);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  });
  for (let i = 0; i < cabins; i++) {
    const a = i * tau / cabins, next = a + tau / cabins, x = Math.cos(a) * r, y = Math.sin(a) * r;
    for (const side of [-1, 1]) {
      ring.beam(metal, v(0, 0, side * 0.85), v(x, y, side * 0.72), 0.062);
      ring.beam(metal, v(x, y, side * 0.72), v(Math.cos(next) * r, Math.sin(next) * r, -side * 0.72), 0.075);
    }
  }
  ring.flush();
  const title = sign('SUZUKA', 5.6, 1.25, '#a43136');
  title.position.set(0, hub, 1.15);
  root.add(title);
  const transform = new THREE.Matrix4();
  function update(dt) {
    wheel.rotation.z = (wheel.rotation.z + dt * tau / 720) % tau;
    for (let i = 0; i < cabins; i++) {
      const angle = i * tau / cabins + wheel.rotation.z;
      transform.makeTranslation(Math.cos(angle) * r, hub + Math.sin(angle) * r - 1.83, 0);
      for (const mesh of cabinMeshes) mesh.setMatrixAt(i, transform);
    }
    for (const mesh of cabinMeshes) mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { x, n, y: root.position.y, update };
}

export function buildSakura(scene, groundAt, occupied, area) {
  const root = new THREE.Group();
  root.name = `suzuka-sakura-${area.id}`;
  scene.add(root);
  const rand = rng(area.seed);
  const bark = std('#594033', {}, 0.24);
  const stems = meshBatch(root);
  const flowers = [], fallen = [], trees = [];
  function plant(x, n, h = 5.8 + rand() * 2.8) {
    trees.push([x, n]);
    const g = groundAt(x, -n), phi = rand() * tau;
    const foot = V(x, n, g - 0.18);
    const fork = foot.clone().add(v(Math.cos(phi) * 0.52, h * 0.39, Math.sin(phi) * 0.52));
    const shoulder = foot.clone().lerp(fork, 0.45).add(v(-0.14, 0, 0.23));
    const up = v(0, 1, 0);
    function branch(from, to, bottom, top) {
      const delta = to.clone().sub(from), center = from.clone().lerp(to, 0.5);
      stems.add(bark, new THREE.CylinderGeometry(top, bottom, delta.length() + 0.17, 6)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize())).translate(...center));
    }
    branch(foot, shoulder, 0.28, 0.22);
    branch(shoulder, fork, 0.22, 0.16);
    for (let b = 0; b < 7; b++) {
      const a = phi + b * 2.399, spread = h * (0.18 + rand() * 0.23);
      const tip = foot.clone().add(v(Math.cos(a) * spread, h * (0.68 + rand() * 0.25), Math.sin(a) * spread));
      const bend = fork.clone().lerp(tip, 0.56).add(v(0, 0.41, 0));
      branch(fork.clone().add(v(0, (b % 3) * -0.18, 0)), bend, 0.085, 0.051);
      branch(bend, tip, 0.051, 0.018);
      for (let m = 0; m < 17; m++) {
        const theta = rand() * tau, r = Math.sqrt(rand()) * 1.95;
        flowers.push({ p: tip.clone().add(v(Math.cos(theta) * r, (rand() - 0.36) * 2.1, Math.sin(theta) * r)), s: 0.92 + rand() * 1.55 });
      }
    }
    for (let i = 0; i < 65; i++) {
      const theta = rand() * tau, r = Math.sqrt(rand()) * 4.5, px = x + r * Math.cos(theta), z = -n + r * Math.sin(theta);
      fallen.push({ p: v(px, groundAt(px, z) + 0.071, z), s: 0.07 + rand() * 0.14 });
    }
  }

  const { row = [], offsets, positions = [] } = area;
  for (let j = 1; j < row.length; j++) {
    const [ax, an] = row[j - 1], [bx, bn] = row[j];
    const d = Math.hypot(bx - ax, bn - an), dx = (bx - ax) / d, dn = (bn - an) / d;
    for (let k = 2.9; k < d - 0.2; k += 5.4 + rand() * 1.4) {
      for (const off of offsets) {
        const gap = off + (rand() - 0.5) * 1.8;
        const along = k + (rand() - 0.5) * 2.7;
        const x = ax + along * dx + dn * gap, n = an + along * dn - dx * gap;
        if (occupied(x, n) || trees.some(([tx, tn]) => (tx - x) ** 2 + (tn - n) ** 2 < 3.8 ** 2)) continue;
        plant(x, n);
      }
    }
  }
  for (const [x, n, height] of positions) plant(x, n, height);
  stems.flush();
  const blossoms = canvasTex(128, 128, (g, w, h) => {
    const sample = rng(4212);
    for (let i = 0; i < 51; i++) {
      const angle = sample() * tau, radius = Math.sqrt(sample()) * 52;
      const x = w / 2 + Math.cos(angle) * radius, y = h / 2 + Math.sin(angle) * radius;
      const petal = 2.4 + sample() * 2.9, rot = sample() * tau;
      g.fillStyle = ['#ffe7f0', '#ffc6dc', '#fff1f6', '#ffb9d5', '#ffd6e7'][Math.floor(sample() * 5)];
      for (let j = 0; j < 5; j++) {
        const a = rot + j * tau / 5;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * petal, y + Math.sin(a) * petal, petal * 1.18, petal * 0.7, a, 0, tau);
        g.fill();
      }
      g.fillStyle = '#e990b2';
      g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  });
  const material = std('#fff7fa', {
    map: blossoms, alphaTest: 0.34, side: THREE.DoubleSide, roughness: 1,
    emissiveMap: blossoms, emissive: '#ffc7df', emissiveIntensity: 0.40,
  }, 0.32);
  const spray = new THREE.PlaneGeometry(1, 1, 3, 3);
  const ps = spray.attributes.position;
  for (let i = 0; i < ps.count; i++) ps.setZ(i, 0.19 * Math.cos(ps.getX(i) * Math.PI) * Math.cos(ps.getY(i) * Math.PI));
  spray.computeVertexNormals();
  const leaves = new THREE.InstancedMesh(spray, material, flowers.length * 2);
  const petals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 5).rotateX(-Math.PI / 2), std('#f5c6d5', {}, 0.24), fallen.length);
  const o = new THREE.Object3D(), color = new THREE.Color();
  flowers.forEach(({ p, s }, i) => {
    const a = rand() * tau, lean = (rand() - 0.5) * 1.9;
    for (let j = 0; j < 2; j++) {
      o.position.copy(p);
      o.rotation.set(lean + j * 1.1, a + j * Math.PI / 2, rand() * tau, 'YXZ');
      o.scale.set(s, s * (0.66 + rand() * 0.31), 1);
      o.updateMatrix();
      leaves.setMatrixAt(i * 2 + j, o.matrix);
      leaves.setColorAt(i * 2 + j, color.setHSL(0.97, 0.15 + rand() * 0.21, 0.84 + rand() * 0.15));
    }
  });
  fallen.forEach(({ p, s }, i) => {
    o.position.copy(p); o.rotation.set(0, rand() * tau, 0);
    o.scale.set(s, 1, s * (0.63 + rand() * 0.3)); o.updateMatrix();
    petals.setMatrixAt(i, o.matrix);
  });
  leaves.receiveShadow = true;
  leaves.castShadow = true;
  root.add(leaves, petals);
  root.userData.treeCount = trees.length;
}

export function buildWoodlandSakura(scene, woodland, occupied, groundAt) {
  const rand = rng(19620920), trees = [];
  for (let n = -590; n < 805; n += 27) for (let x = -1145; x < 1200; x += 27) {
    const px = x + rand() * 21, pn = n + rand() * 21;
    if (!woodland(px, pn) || occupied(px, pn)) continue;
    trees.push([px, pn, 4.1 + rand() * 6.0]);
  }
  buildSakura(scene, groundAt, occupied, { id: 'woodland', seed: 513821, positions: trees });
}
