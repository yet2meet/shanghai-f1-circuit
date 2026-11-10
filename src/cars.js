import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEAMS } from './data.js';
import { floodlit } from './util.js';

function carGeometries() {
  const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const body = mergeGeometries([
    b(0.75, 0.42, 3.2, 0, 0.45, -0.2),   // 单体壳
    b(0.42, 0.24, 1.7, 0, 0.36, 2.1),    // 鼻锥
    b(1.75, 0.38, 1.6, 0, 0.4, -0.5),    // 侧箱
    b(0.3, 0.5, 0.9, 0, 0.85, -0.7),     // 进气口
  ]);
  const wings = mergeGeometries([
    b(1.95, 0.07, 0.55, 0, 0.18, 2.85),  // 前翼
    b(1.6, 0.07, 0.45, 0, 0.98, -2.35),  // 尾翼
    b(0.06, 0.6, 0.5, 0.78, 0.72, -2.35), b(0.06, 0.6, 0.5, -0.78, 0.72, -2.35),
    b(1.5, 0.06, 0.9, 0, 0.14, -2.0),    // 扩散器
  ]);
  const wheel = (x, z) => { const g = new THREE.CylinderGeometry(0.36, 0.36, 0.38, 14); g.rotateZ(Math.PI / 2); g.translate(x, 0.36, z); return g; };
  const wheels = mergeGeometries([wheel(0.86, 1.75), wheel(-0.86, 1.75), wheel(0.9, -1.7), wheel(-0.9, -1.7)]);
  const light = b(0.22, 0.14, 0.08, 0, 0.42, -2.6);
  return { body, wings, wheels, light };
}

export function buildCars(scene, track) {
  const geo = carGeometries();
  const tyre = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 });
  const carbon = floodlit(new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5 }), 0.3);
  const rear = new THREE.MeshStandardMaterial({ color: '#400', emissive: '#ff1a10', emissiveIntensity: 4 });
  const cars = [];
  const n = TEAMS.length * 2; // 2026：11 支车队 × 2 辆
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const paint = floodlit(new THREE.MeshStandardMaterial({ color: TEAMS[(i / 2) | 0].color, roughness: 0.3, metalness: 0.4 }), 0.8);
    const body = new THREE.Mesh(geo.body, paint);
    body.castShadow = true;
    g.add(body, new THREE.Mesh(geo.wings, carbon), new THREE.Mesh(geo.wheels, tyre), new THREE.Mesh(geo.light, rear));
    // 1:1 尺寸：车长约 5.7 m、宽 1.95 m（与真实 F1 赛车一致）
    scene.add(g);
    cars.push({ g, s: track.total * ((0.08 + i * 0.041) % 1) + ((i * 37) % 11), lane: ((i * 13) % 7 - 3) * 0.6 });
  }
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
      }
    },
  };
}
