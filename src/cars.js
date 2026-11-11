import * as THREE from 'three';
import { f1CarGeometry, carMaterials } from './f1car.js';
import { TEAMS } from './data.js';
import { floodlit } from './util.js';

export function buildCars(scene, track) {
  // 11 辆车（每支车队 1 辆，画面不显拥挤）：每种材质一个实例化网格，涂装颜色逐车设置
  const geo = f1CarGeometry();
  const n = TEAMS.length;
  const base = carMaterials({ livery: ['#ffffff', '#ffffff', '#ffffff'], compound: '#ffffff' }, floodlit);
  const inst = {};
  const col = new THREE.Color();
  for (const k of Object.keys(geo)) {
    const im = new THREE.InstancedMesh(geo[k], base[k], n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = k === 'paint' || k === 'carbon';
    im.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      const t = TEAMS[i], L = t.livery || [t.color, '#1b1b1f', t.color];
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
  for (let i = 0; i < n; i++) cars.push({ g: new THREE.Object3D(), s: track.total * (i / n) + ((i * 37) % 23), lane: ((i * 13) % 7 - 3) * 0.6 }); // 沿一圈大致均匀分布
  // ── 行车线：按真实弧长等距重采样（2 m），再把“弯中靠内”的偏移和走线本身都平滑，
  // 车头方向取行车线的切线并插值，过弯是连续的圆弧而不是折线 ──
  const N = track.N, M = Math.round(track.total / 2), step = track.total / M;
  const cx = new Float32Array(M), cz = new Float32Array(M), nx = new Float32Array(M), nz = new Float32Array(M), kk = new Float32Array(M);
  for (let m = 0, i = 0; m < M; m++) {
    const s = m * step;
    while (i < N - 1 && track.dist[i + 1] <= s) i++;
    const j = (i + 1) % N, d0 = track.dist[i], d1 = j ? track.dist[j] : track.total, t = (s - d0) / Math.max(1e-6, d1 - d0);
    const a = track.pts[i], b = track.pts[j];
    cx[m] = a.x + (b.x - a.x) * t; cz[m] = a.z + (b.z - a.z) * t;
    const na = track.nor[i], nb = track.nor[j], L = Math.hypot(na.x + (nb.x - na.x) * t, na.z + (nb.z - na.z) * t) || 1;
    nx[m] = (na.x + (nb.x - na.x) * t) / L; nz[m] = (na.z + (nb.z - na.z) * t) / L;
    kk[m] = track.curv[i] + (track.curv[j] - track.curv[i]) * t;
  }
  const blur = (arr, r, passes = 3) => {
    let a = arr;
    for (let p = 0; p < passes; p++) {
      const o = new Float32Array(M);
      let acc = 0;
      for (let q = -r; q <= r; q++) acc += a[(q + M) % M];
      for (let m = 0; m < M; m++) { o[m] = acc / (2 * r + 1); acc += a[(m + r + 1) % M] - a[(m - r + M) % M]; }
      a = o;
    }
    return a;
  };
  const kS = blur(kk, 6);                                   // ≈ 25 m 窗口
  const off = blur(kS.map((k) => THREE.MathUtils.clamp(k * 600, -4.5, 4.5)), 10); // 内线偏移，平缓进出弯
  const laneK = blur(kS.map((k) => 1 - Math.min(1, Math.abs(k) * 150)), 10);       // 弯中车道收拢
  const rx = new Float32Array(M), rz = new Float32Array(M), lx = new Float32Array(M), lz = new Float32Array(M);
  for (let m = 0; m < M; m++) { rx[m] = cx[m] + nx[m] * off[m]; rz[m] = cz[m] + nz[m] * off[m]; }
  const sx = blur(rx, 2, 2), sz = blur(rz, 2, 2);           // 走线本身再轻微平滑，去掉残余折角
  const tx = new Float32Array(M), tz = new Float32Array(M);
  for (let m = 0; m < M; m++) {
    const a = (m - 1 + M) % M, b = (m + 1) % M, dx = sx[b] - sx[a], dz = sz[b] - sz[a], L = Math.hypot(dx, dz) || 1;
    tx[m] = dx / L; tz[m] = dz / L; lx[m] = -tz[m]; lz[m] = tx[m];
  }
  // 车道法向与赛道法向同侧
  if (lx[0] * nx[0] + lz[0] * nz[0] < 0) for (let m = 0; m < M; m++) { lx[m] = -lx[m]; lz[m] = -lz[m]; }
  const p = new THREE.Vector3(), fwd = new THREE.Vector3();
  const sample = (s, lane, out, dir) => {
    const f = (((s % track.total) + track.total) % track.total) / step;
    const m = Math.floor(f) % M, n2 = (m + 1) % M, t = f - Math.floor(f);
    const L = lane * (laneK[m] + (laneK[n2] - laneK[m]) * t);
    out.set(sx[m] + (sx[n2] - sx[m]) * t + (lx[m] + (lx[n2] - lx[m]) * t) * L, 0.2, sz[m] + (sz[n2] - sz[m]) * t + (lz[m] + (lz[n2] - lz[m]) * t) * L);
    dir.set(tx[m] + (tx[n2] - tx[m]) * t, 0, tz[m] + (tz[n2] - tz[m]) * t).normalize();
    return Math.abs(kS[m]);
  };
  return {
    update(dt) {
      for (const c of cars) {
        // 目标速度看前方 40 m 内最急的弯（提前刹车），出弯再加速
        let kMax = 0;
        for (let d = 0; d <= 40; d += 8) kMax = Math.max(kMax, sample(c.s + d, c.lane, p, fwd));
        const v = THREE.MathUtils.lerp(86, 24, Math.sqrt(Math.min(1, kMax / 0.011)));
        c.v = c.v === undefined ? v : c.v + (v - c.v) * Math.min(1, dt * (v < c.v ? 2.2 : 1.1));
        c.s += c.v * Math.min(dt, 0.1);
        sample(c.s, c.lane, p, fwd);
        c.g.position.copy(p);
        // 车头方向：切线；再做一点时间上的平滑，防止掉帧时跳角
        const yaw = Math.atan2(fwd.x, fwd.z);
        c.yaw = c.yaw === undefined ? yaw : c.yaw + Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw)) * Math.min(1, dt * 14);
        c.g.rotation.set(0, c.yaw, 0);
        c.g.updateMatrix();
      }
      cars.forEach((c, i) => { for (const im of all) im.setMatrixAt(i, c.g.matrix); });
      for (const im of all) im.instanceMatrix.needsUpdate = true;
    },
  };
}
