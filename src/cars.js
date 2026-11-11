import * as THREE from 'three';
import { f1CarGeometry, carMaterials } from './f1car.js';
import { TEAMS } from './data.js';
import { floodlit } from './util.js';

export function buildCars(scene, track) {
  // 22 辆车（11 支车队 × 2）：每种材质一个实例化网格，涂装颜色逐车设置，总共只需 10 次绘制调用
  const geo = f1CarGeometry();
  const n = TEAMS.length * 2;
  const base = carMaterials({ livery: ['#ffffff', '#ffffff', '#ffffff'], compound: '#ffffff' }, floodlit);
  const inst = {};
  const col = new THREE.Color();
  for (const k of Object.keys(geo)) {
    const im = new THREE.InstancedMesh(geo[k], base[k], n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = k === 'paint' || k === 'carbon';
    im.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      const t = TEAMS[(i / 2) | 0], L = t.livery || [t.color, '#1b1b1f', t.color];
      const cc = { paint: L[0], secondary: L[1], accent: L[2], stripe: ['#e10600', '#ffd400', '#f2f2f2'][i % 3] }[k];
      if (cc) im.setColorAt(i, col.set(cc));
    }
    scene.add(im);
    inst[k] = im;
  }
  const rear = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.1, 0.04).translate(0, 0.42, -2.62), new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1a10', emissiveIntensity: 4 }), n);
  rear.frustumCulled = false;
  scene.add(rear);
  const all = [...Object.values(inst), rear];
  const cars = [];
  for (let i = 0; i < n; i++) cars.push({ g: new THREE.Object3D(), s: track.total * ((0.08 + i * 0.041) % 1) + ((i * 37) % 11), lane: ((i * 13) % 7 - 3) * 0.6 });
  const p = new THREE.Vector3(), ahead = new THREE.Vector3();
  const sample = (s, lane, out) => {
    const f = ((s % track.total) + track.total) % track.total / track.total * track.N;
    const i = Math.floor(f) % track.N, j = (i + 1) % track.N, t = f - Math.floor(f);
    out.lerpVectors(track.pts[i], track.pts[j], t);
    // 弯中靠内线
    const k = track.curv[i];
    const off = THREE.MathUtils.clamp(k * 600, -4.5, 4.5) + lane * (1 - Math.min(1, Math.abs(k) * 150));
    out.addScaledVector(track.nor[i], off);
    out.y = 0.2;
    return i;
  };
  return {
    update(dt) {
      for (const c of cars) {
        const i = sample(c.s, c.lane, p);
        const k = Math.min(1, Math.abs(track.curv[i]) / 0.011);
        const v = THREE.MathUtils.lerp(86, 26, Math.sqrt(k));
        c.v = c.v === undefined ? v : c.v + (v - c.v) * Math.min(1, dt * 1.6);
        c.s += c.v * dt;
        sample(c.s + 6, c.lane, ahead);
        c.g.position.copy(p);
        c.g.lookAt(ahead);
        c.g.updateMatrix();
      }
      cars.forEach((c, i) => { for (const im of all) im.setMatrixAt(i, c.g.matrix); });
      for (const im of all) im.instanceMatrix.needsUpdate = true;
    },
  };
}
