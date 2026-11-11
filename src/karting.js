// 内场卡丁车场（上赛卡丁车）：OSM 中一条 1235 m 的闭合赛道（公开资料：全长 1.234 km、18 个弯）
// + 维修/连接道。路面、路肩、轮胎墙、起终点线与几辆行驶中的卡丁车按常见卡丁车场规格程序化生成。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM_LINES } from './osm-data.js';
import { makePath, ribbon, std, floodlit, canvasTex, smooth, V } from './util.js';
import { groundDetail } from './textures.js';

const W = 8;            // 赛道宽 8 m（常见卡丁车场 8–10 m）
const KERB = 1.0;

function ground(mat, order) {
  mat.depthWrite = false;
  mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
  return (geo) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.receiveShadow = true; return m; };
}

function pathFrom(flat, closed, step) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(V(flat[i], flat[i + 1]));
  if (closed && pts[0].distanceTo(pts[pts.length - 1]) < 0.5) pts.pop();
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  curve.arcLengthDivisions = 6000;
  const n = Math.max(2, Math.round(curve.getLength() / step));
  const sp = curve.getSpacedPoints(n);
  if (closed) sp.pop();
  return makePath(sp, closed);
}

export function buildKarting(scene) {
  const loopLine = OSM_LINES.find((l) => l.k === 'kart');
  if (!loopLine) return { update() {} };
  const g = new THREE.Group();
  g.name = 'karting';
  const path = pathFrom(loopLine.p, true, 1.2);
  const N = path.N, ds = path.total / N;
  // 有符号曲率（+ = 左弯）
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = path.tan[(i - 2 + N) % N], b = path.tan[(i + 2) % N], na = path.nor[(i - 2 + N) % N];
    raw[i] = Math.asin(THREE.MathUtils.clamp(b.dot(na), -1, 1)) / (4 * ds);
  }
  const curv = smooth(raw, 3);

  const asphalt = groundDetail(floodlit(new THREE.MeshStandardMaterial({ color: '#2f3136', roughness: 0.92 }), 0.12), 'asphalt', { size: 3, k: 0.7, mk: 0.12 });
  const verge = groundDetail(std('#9cc782', { roughness: 1 }, 0.06), 'grass', { size: 3, k: 0.8 });
  const white = std('#f2f2f2', { roughness: 0.6 }, 0.8);
  const kerbTex = canvasTex(64, 8, (c, w, h) => { c.fillStyle = '#d7262c'; c.fillRect(0, 0, w / 2, h); c.fillStyle = '#f4f4f4'; c.fillRect(w / 2, 0, w / 2, h); }, [1, 1]);
  kerbTex.wrapS = THREE.RepeatWrapping;
  const kerbMat = floodlit(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 }), 0.6);

  // 草地缓冲带 → 路面 → 白色边线 → 弯道内侧路肩
  g.add(ground(verge, -2.4)(ribbon(path, { offA: W / 2 + 4, offB: -(W / 2 + 4), y: 0.03 })));
  g.add(ground(asphalt, -2.0)(ribbon(path, { offA: W / 2, offB: -W / 2, y: 0.05 })));
  for (const s of [1, -1]) g.add(ground(white, -1.9)(ribbon(path, { offA: s > 0 ? W / 2 - 0.15 : -W / 2 + 0.45, offB: s > 0 ? W / 2 - 0.45 : -W / 2 + 0.15, y: 0.06, uv: 1e9 })));
  const kerbAt = (i, s) => (s > 0 ? curv[i] > 0.035 : curv[i] < -0.035);
  for (const s of [1, -1]) {
    const geo = ribbon(path, {
      offA: (i) => (s > 0 ? (kerbAt(i, s) ? W / 2 + KERB : W / 2) : -W / 2),
      offB: (i) => (s > 0 ? W / 2 : (kerbAt(i, s) ? -W / 2 - KERB : -W / 2)),
      y: 0.07, uv: 2,
    });
    g.add(ground(kerbMat, -1.85)(geo));
  }

  // 维修/连接道：6 m 宽
  const links = [];
  for (const l of OSM_LINES) if (l.k === 'kartlink') {
    const p = pathFrom(l.p, false, 1.5);
    if (p.N > 1) links.push(ribbon(p, { offA: 3, offB: -3, y: 0.045 }));
  }
  if (links.length) g.add(ground(groundDetail(floodlit(new THREE.MeshStandardMaterial({ color: '#2f3136', roughness: 0.92 }), 0.12), 'asphalt', { size: 3, k: 0.7, mk: 0.12 }), -2.05)(mergeGeometries(links)));

  // 轮胎墙：缓冲带外缘，每 0.75 m 一摞（黑色为主，间隔红白）。离其他赛段太近处不放，避免压到相邻赛道
  const spots = [];
  const tooClose = (x, z, i0) => {
    for (let j = 0; j < N; j += 2) {
      const d = Math.abs(j - i0); if (Math.min(d, N - d) < 14) continue;
      const q = path.pts[j]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < (W / 2 + 2.5) ** 2) return true;
    }
    return false;
  };
  // 轮胎直径 0.64 m，按 0.66 m 间距沿外缘连续排布（在路径点之间插值，弯道外侧按半径放大间距补偿）
  for (const s of [1, -1]) {
    const off = (W / 2 + 3.6) * s;
    let k = 0, ok = true;
    for (let d = 0; d < path.total; d += 0.66 * (1 - Math.max(-0.4, Math.min(0.4, curv[Math.floor(d / ds) % N] * off)))) {
      const f = d / ds, i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
      const x = path.pts[i].x + (path.pts[j].x - path.pts[i].x) * t + (path.nor[i].x + (path.nor[j].x - path.nor[i].x) * t) * off;
      const z = path.pts[i].z + (path.pts[j].z - path.pts[i].z) * t + (path.nor[i].z + (path.nor[j].z - path.nor[i].z) * t) * off;
      if (k % 4 === 0) ok = !tooClose(x, z, i);
      if (ok) spots.push(x, z, k % 10 < 2 ? (k % 20 < 10 ? 0 : 3) : 1);
      k++;
    }
  }
  const tyre = new THREE.CylinderGeometry(0.32, 0.32, 0.78, 10).translate(0, 0.39, 0);
  const tyres = new THREE.InstancedMesh(tyre, floodlit(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 0.25), spots.length / 3);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let k = 0; k < spots.length / 3; k++) {
    tyres.setMatrixAt(k, m4.makeTranslation(spots[k * 3], 0, spots[k * 3 + 1]));
    const t = spots[k * 3 + 2];
    tyres.setColorAt(k, col.set(t === 0 ? '#d7262c' : t === 3 ? '#f2f2f2' : '#1c1d20')); // 黑色为主，每隔一段红/白
  }
  tyres.castShadow = true;
  g.add(tyres);

  // 起终点：靠维修道出口（OSM 维修道与主线的接点）附近的直线段，黑白格线 + 门架
  let si = 0, best = Infinity;
  const pitEnd = V(113, 158);
  for (let i = 0; i < N; i++) {
    const d = path.pts[i].distanceToSquared(pitEnd) + Math.abs(curv[i]) * 4e5;
    if (d < best) { best = d; si = i; }
  }
  const chk = canvasTex(64, 16, (c, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 4, y * 4, 4, 4); } });
  const sp = path.pts[si], across = Math.atan2(-path.nor[si].z, path.nor[si].x); // 局部 x 轴 = 赛道法向
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.0).rotateX(-Math.PI / 2), floodlit(new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6 }), 0.7));
  line.rotation.y = across;
  line.position.set(sp.x, 0.09, sp.z);
  line.renderOrder = -1.8; line.material.depthWrite = false;
  g.add(line);
  const gantry = new THREE.Group();
  const post = std('#d5d9df', { metalness: 0.6, roughness: 0.4 }, 0.3);
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.2, 0.25), post); p.position.set(s * (W / 2 + 0.8), 2.1, 0); gantry.add(p); }
  const beamTex = canvasTex(256, 32, (c, w, h) => { c.fillStyle = '#16181c'; c.fillRect(0, 0, w, h); c.fillStyle = '#e94e1b'; c.fillRect(0, h - 4, w, 4); c.fillStyle = '#fff'; c.font = '800 20px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('START · FINISH', w / 2, h / 2 - 1); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 1.9, 0.8, 0.3), [post, post, post, post, new THREE.MeshStandardMaterial({ map: beamTex, emissive: '#fff', emissiveMap: beamTex, emissiveIntensity: 0.2 }), new THREE.MeshStandardMaterial({ map: beamTex })]);
  beam.position.y = 4.4; gantry.add(beam);
  gantry.position.set(sp.x, 0, sp.z);
  gantry.rotation.y = across;
  gantry.traverse((o) => { o.castShadow = true; });
  g.add(gantry);

  // ── 卡丁车 ──
  const kartGeo = () => {
    const parts = {
      body: [new THREE.BoxGeometry(0.9, 0.16, 0.5).translate(0, 0.22, 0.75),        // 前鼻
        new THREE.BoxGeometry(0.22, 0.2, 0.75).translate(0.5, 0.2, 0.05),            // 侧箱
        new THREE.BoxGeometry(0.22, 0.2, 0.75).translate(-0.5, 0.2, 0.05),
        new THREE.BoxGeometry(1.15, 0.12, 0.22).translate(0, 0.22, -0.85)],          // 后保险杠
      dark: [new THREE.BoxGeometry(0.75, 0.05, 1.7).translate(0, 0.08, 0),            // 底盘
        new THREE.BoxGeometry(0.42, 0.4, 0.36).translate(0, 0.38, -0.38),            // 座椅
        new THREE.BoxGeometry(0.3, 0.32, 0.35).translate(0.28, 0.28, -0.72)],        // 发动机
      tyre: [[0.5, 0.62, 0.13], [-0.5, 0.62, 0.13], [0.55, -0.62, 0.15], [-0.55, -0.62, 0.15]].map(([x, z, r]) =>
        new THREE.CylinderGeometry(r, r, 0.16, 12).rotateZ(Math.PI / 2).translate(x, r, z)),
      suit: [new THREE.BoxGeometry(0.4, 0.42, 0.3).translate(0, 0.6, -0.3), new THREE.BoxGeometry(0.34, 0.14, 0.5).translate(0, 0.38, 0.1)],
      helmet: [new THREE.SphereGeometry(0.15, 12, 8).translate(0, 0.95, -0.25)],
    };
    const out = {};
    for (const k in parts) out[k] = mergeGeometries(parts[k].map((x) => (x.index ? x.toNonIndexed() : x)));
    return out;
  };
  const geo = kartGeo();
  const NK = 8;
  const mats = {
    body: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 }), 0.3),
    dark: std('#1f2124', { roughness: 0.6, metalness: 0.4 }, 0.15),
    tyre: std('#151515', { roughness: 0.9 }, 0.05),
    suit: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.7 }), 0.25),
    helmet: floodlit(new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.2 }), 0.3),
  };
  const palette = ['#e94e1b', '#1f6fb2', '#f5c518', '#2fae66', '#d7262c', '#f2f2f2', '#7a3fb5', '#13b5c7'];
  const inst = {};
  for (const k in geo) {
    const im = new THREE.InstancedMesh(geo[k], mats[k], NK);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.castShadow = k === 'body' || k === 'dark';
    if (k === 'body' || k === 'helmet' || k === 'suit') for (let i = 0; i < NK; i++) im.setColorAt(i, col.set(k === 'suit' ? palette[(i + 3) % NK] : palette[i]));
    g.add(im); inst[k] = im;
  }
  const karts = [];
  for (let i = 0; i < NK; i++) karts.push({ s: (i / NK) * path.total + i * 7, lane: ((i * 5) % 5 - 2) * 0.7, v: 14 });
  const o = new THREE.Object3D();
  const P = new THREE.Vector3();
  const at = (s) => { const f = (((s % path.total) + path.total) % path.total) / ds; const i = Math.floor(f) % N; return { i, j: (i + 1) % N, t: f - Math.floor(f) }; };

  scene.add(g);
  return {
    group: g,
    update(dt) {
      dt = Math.min(dt, 0.1);
      for (let k = 0; k < NK; k++) {
        const c = karts[k];
        let kMax = 0;
        for (let d = 0; d <= 16; d += 4) kMax = Math.max(kMax, Math.abs(curv[at(c.s + d).i]));
        const v = THREE.MathUtils.lerp(19, 8, Math.min(1, kMax / 0.07));
        c.v += (v - c.v) * Math.min(1, dt * (v < c.v ? 3 : 1.2));
        c.s += c.v * dt;
        const { i, j, t } = at(c.s);
        const lane = c.lane * (1 - Math.min(1, Math.abs(curv[i]) / 0.05)) - THREE.MathUtils.clamp(curv[i] * 40, -2, 2);
        P.lerpVectors(path.pts[i], path.pts[j], t);
        const nx = path.nor[i].x + (path.nor[j].x - path.nor[i].x) * t, nz = path.nor[i].z + (path.nor[j].z - path.nor[i].z) * t;
        o.position.set(P.x + nx * lane, 0.06, P.z + nz * lane);
        const tx = path.tan[i].x + (path.tan[j].x - path.tan[i].x) * t, tz = path.tan[i].z + (path.tan[j].z - path.tan[i].z) * t;
        const yaw = Math.atan2(tx, tz);
        c.yaw = c.yaw === undefined ? yaw : c.yaw + Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw)) * Math.min(1, dt * 12);
        o.rotation.set(0, c.yaw, 0);
        o.updateMatrix();
        for (const key in inst) inst[key].setMatrixAt(k, o.matrix);
      }
      for (const key in inst) inst[key].instanceMatrix.needsUpdate = true;
    },
  };
}
