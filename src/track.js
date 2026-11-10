import * as THREE from 'three';
import { TRACK_POINTS } from './data.js';
import { V, makePath, ribbon, wall, smooth, std, canvasTex, floodlit } from './util.js';
import { OSM_PIT } from './osm-data.js';
import { asGround } from './osm.js';

export const HW = 7.5; // 赛道半宽（真实路面宽约 13–15 m）

export function buildTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(TRACK_POINTS.map(([x, n]) => V(x, n)), true, 'centripetal');
  const N = 1600;
  const pts = curve.getSpacedPoints(N);
  pts.pop();
  const path = makePath(pts, true);

  // 有符号曲率（负 = 右弯）
  const raw = new Float32Array(N);
  const ds = path.total / N;
  for (let i = 0; i < N; i++) {
    const a = path.tan[(i - 1 + N) % N], b = path.tan[(i + 1) % N];
    const cr = a.z * b.x - a.x * b.z;
    raw[i] = Math.asin(THREE.MathUtils.clamp(cr, -1, 1)) / (2 * ds);
  }
  const curv = smooth(raw, 6);

  // 缓冲区（砂石）宽度：只在弯道外侧
  const gl = new Float32Array(N), gr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = curv[i];
    const w = THREE.MathUtils.clamp((Math.abs(k) - 0.0045) * 3200, 0, 28);
    if (k < 0) gl[i] = w; else gr[i] = w;
  }
  const gwL = smooth(gl, 22), gwR = smooth(gr, 22);

  // 维修区一侧（大直道东侧）不设护墙
  // 维修区一侧：离真实维修通道 24 m 以内的右侧不设护墙（维修墙由 venue.js 单独生成）
  const pitPts = OSM_PIT.map(([x, n]) => [x, -n]);
  const nearPit = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    const P = pts[k];
    for (let m = 0; m < pitPts.length - 1; m++) {
      const [ax, az] = pitPts[m], [bx, bz] = pitPts[m + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const tt = Math.max(0, Math.min(1, ((P.x - ax) * dx + (P.z - az) * dz) / l2));
      if (Math.hypot(P.x - ax - dx * tt, P.z - az - dz * tt) < 24) { nearPit[k] = 1; break; }
    }
  }
  const pitZone = (k) => nearPit[k] === 1;

  const track = {
    path, pts, tan: path.tan, nor: path.nor, dist: path.dist, total: path.total, N, curv, gwL, gwR, pitZone,
    nearest(x, z) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    distTo(x, z, step = 4) {
      let bd = Infinity;
      for (let i = 0; i < N; i += step) {
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) bd = d;
      }
      return Math.sqrt(bd);
    },
  };

  const g = new THREE.Group();
  g.name = 'track';

  // 修剪草坪带（夜间被灯光照亮）
  const vergeTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#5e9e4b'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#69aa55'; c.fillRect(0, 0, w / 2, h);
  }, [1, 1]);
  const verge = new THREE.Mesh(
    ribbon(path, { offA: (i) => HW + 13 + gwL[i], offB: (i) => -(HW + 13 + gwR[i]), y: 0.05, uv: 24 }),
    floodlit(new THREE.MeshStandardMaterial({ map: vergeTex, roughness: 1 }), 0.5)
  );
  g.add(asGround(verge, -1.5));

  // 砂石缓冲区
  const gravelMat = std('#d6c39a', { roughness: 1 }, 0.55);
  const gravelL = new THREE.Mesh(ribbon(path, { offA: (i) => HW + 3.5 + gwL[i], offB: HW + 3.5, y: 0.1 }), gravelMat);
  const gravelR = new THREE.Mesh(ribbon(path, { offA: -(HW + 3.5), offB: (i) => -(HW + 3.5 + gwR[i]), y: 0.1 }), gravelMat);
  g.add(asGround(gravelL, -1.4), asGround(gravelR, -1.4));

  // 沥青路面
  const asphaltTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#34363b'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = 40 + Math.random() * 35;
      c.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
      c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    // 行车线橡胶痕
    const gr2 = c.createLinearGradient(0, 0, 0, h);
    gr2.addColorStop(0.2, 'rgba(0,0,0,0)'); gr2.addColorStop(0.5, 'rgba(0,0,0,0.28)'); gr2.addColorStop(0.8, 'rgba(0,0,0,0)');
    c.fillStyle = gr2; c.fillRect(0, 0, w, h);
  }, [1, 1]);
  const asphalt = new THREE.Mesh(
    ribbon(path, { offA: HW, offB: -HW, y: 0.16, uv: 16 }),
    floodlit(new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92 }), 0.55)
  );
  g.add(asGround(asphalt, -1.2));

  // 白色边线
  const lineMat = std('#f4f4f4', { roughness: 0.6 }, 0.9);
  g.add(asGround(new THREE.Mesh(ribbon(path, { offA: HW - 0.35, offB: HW - 0.8, y: 0.2 }), lineMat), -1.05));
  g.add(asGround(new THREE.Mesh(ribbon(path, { offA: -(HW - 0.8), offB: -(HW - 0.35), y: 0.2 }), lineMat), -1.05));

  // 红白路肩
  const kerbTex = canvasTex(64, 8, (c, w, h) => {
    c.fillStyle = '#f5f5f5'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d92b2b'; c.fillRect(0, 0, w / 2, h);
  }, [1, 1]);
  const kerbMat = floodlit(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 }), 0.9);
  const isKerb = (i) => Math.abs(curv[i]) > 0.005;
  let start = 0;
  while (start < N && isKerb(start)) start++;
  for (let k = start; k < start + N; k++) {
    if (!isKerb(k % N)) continue;
    let e = k;
    while (isKerb((e + 1) % N) && e - k < N) e++;
    const a = Math.max(k - 4, start), b = e + 4;
    g.add(asGround(new THREE.Mesh(ribbon(path, { offA: HW + 2.2, offB: HW - 0.2, y: 0.22, uv: 5, from: a, to: b }), kerbMat), -1.0));
    g.add(asGround(new THREE.Mesh(ribbon(path, { offA: -(HW - 0.2), offB: -(HW + 2.2), y: 0.22, uv: 5, from: a, to: b }), kerbMat), -1.0));
    k = e;
  }

  // 护墙
  // 护墙上的场地标识带（仅使用赛车场自身的名称，不含任何第三方商标）
  const adTex = canvasTex(2048, 64, (c, w, h) => {
    const panels = [
      ['#0d1b3e', '#ffffff', '上海国际赛车场'], ['#e10600', '#ffffff', 'SHANGHAI INTERNATIONAL CIRCUIT'],
      ['#ffffff', '#0d1b3e', '中国大奖赛 · CHINESE GRAND PRIX'], ['#15151e', '#ffd60a', 'SHANGHAI 2026'],
    ];
    const pw = w / panels.length;
    panels.forEach(([bg, fg, text], k) => {
      c.fillStyle = bg; c.fillRect(k * pw, 0, pw, h);
      c.fillStyle = fg; c.font = 'bold 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, k * pw + pw / 2, h / 2 + 2, pw - 30);
    });
  }, [1, 1]);
  const wallMat = floodlit(new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.6, side: THREE.DoubleSide }), 0.6);
  const wl = new THREE.Mesh(wall(path, { off: (i) => HW + 6 + gwL[i], h: 1.3, to: N, uv: 64 }), wallMat);
  const wr = new THREE.Mesh(wall(path, { off: (i) => -(HW + 6 + gwR[i]), h: 1.3, to: N, skip: pitZone, uv: 64 }), wallMat);
  wl.castShadow = wr.castShadow = true;
  g.add(wl, wr);
  // 防护网
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#aeb6c2', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  g.add(new THREE.Mesh(wall(path, { off: (i) => HW + 6.2 + gwL[i], h: 3.2, y: 1.3, to: N }), fenceMat));
  g.add(new THREE.Mesh(wall(path, { off: (i) => -(HW + 6.2 + gwR[i]), h: 3.2, y: 1.3, to: N, skip: pitZone }), fenceMat));

  scene.add(g);
  return track;
}
