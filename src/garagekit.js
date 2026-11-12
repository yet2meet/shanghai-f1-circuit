// 车库内部的小件：技师、轮胎、保温毯、风炮气管、千斤顶，以及烘焙了明暗的地面 / 天花 / 侧墙纹理。
// 全部做成可实例化的小几何体，明暗靠纹理和顶点色“画”出来，不增加灯光，开销很小。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function seg(a, b, r1, r2, n = 6) {                // 两点之间的圆台
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r2, r1, d.length(), n, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
function ball(c, r, sx = 1, sy = 1, sz = 1) { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); g.translate(...c); return g; }
const strip = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
function tint(g, hex) {
  g = strip(g);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * 技师：队服（上衣、长袖、帽子，按实例换队色）+ 其余（裤、鞋、耳机用顶点色；皮肤为白色，由实例颜色给出肤色）。
 * 面朝 +z，脚底 y = 0。pose：stand 站立 / work 俯身伸手 / sit 坐在椅子上、手搭桌面
 */
const CREW = {};
export function crewGeo(pose) {
  if (CREW[pose]) return CREW[pose];
  const SKIN = '#ffffff', PANTS = '#3a3f4a', SHOE = '#4a4f58', DARK = '#26282d';
  const sit = pose === 'sit', work = pose === 'work';
  const hip = sit ? 0.55 : 0.92;
  const lean = work ? 0.34 : sit ? 0.05 : 0;
  const upper = (g) => { g.rotateX(lean); g.translate(0, hip, 0); return g; };   // 上半身绕髋部前倾
  const shirt = [], rest = [];
  // 躯干：旋转体（臀 → 腰 → 胸 → 肩 → 颈根），前后压扁
  const prof = [[0.001, 0], [0.16, 0.02], [0.155, 0.16], [0.145, 0.24], [0.17, 0.4], [0.2, 0.5], [0.19, 0.55], [0.07, 0.6], [0.001, 0.6]];
  const torso = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 8);
  torso.scale(1, 1, 0.62);
  shirt.push(upper(torso));
  const sh = 0.52;                                  // 肩高（相对髋部）
  rest.push(tint(upper(seg([0, sh, 0], [0, sh + 0.12, 0.01], 0.045, 0.042)), SKIN));
  rest.push(tint(upper(ball([0, sh + 0.22, 0.01], 0.105, 0.95, 1.15, 1.05)), SKIN));
  // 队帽 + 帽檐
  const cap = new THREE.SphereGeometry(0.114, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(0.98, 1.05, 1.08); cap.translate(0, sh + 0.245, 0.008);
  shirt.push(upper(cap), upper(box(0.17, 0.016, 0.13, 0, sh + 0.25, 0.15)));
  // 耳机
  for (const s of [-1, 1]) rest.push(tint(upper(ball([s * 0.105, sh + 0.215, 0.012], 0.042, 0.6, 1.1, 1)), DARK));
  // 手臂（长袖）与手
  const arms = sit ? { elbow: [0.24, sh - 0.27, 0.1], hand: [0.14, sh - 0.35, 0.4] }
    : work ? { elbow: [0.24, sh - 0.25, 0.14], hand: [0.17, sh - 0.3, 0.44] }
      : { elbow: [0.25, sh - 0.3, 0], hand: [0.27, sh - 0.6, 0.04] };
  for (const s of [-1, 1]) {
    const e = [s * arms.elbow[0], arms.elbow[1], arms.elbow[2]], h = [s * arms.hand[0], arms.hand[1], arms.hand[2]];
    shirt.push(upper(seg([s * 0.2, sh - 0.02, 0], e, 0.055, 0.048)), upper(seg(e, h, 0.046, 0.038)));
    rest.push(tint(upper(ball([h[0], h[1] - 0.03, h[2] + 0.03], 0.043, 0.85, 1, 1.05)), SKIN));
  }
  // 腿与鞋
  for (const s of [-1, 1]) {
    if (sit) {
      const knee = [s * 0.1, hip + 0.04, 0.42], foot = [s * 0.1, 0.08, 0.4];
      rest.push(tint(seg([s * 0.085, hip + 0.06, 0.02], knee, 0.075, 0.06), PANTS), tint(seg(knee, foot, 0.058, 0.045), PANTS));
      rest.push(tint(ball([s * 0.1, 0.04, 0.45], 0.06, 0.85, 0.55, 1.7), SHOE));
    } else {
      const fz = work ? s * 0.09 : 0;                // 俯身时前后脚错开
      rest.push(tint(seg([s * 0.085, hip, 0], [s * 0.09, 0.47, fz * 0.6 + 0.01], 0.072, 0.058), PANTS));
      rest.push(tint(seg([s * 0.09, 0.47, fz * 0.6 + 0.01], [s * 0.09, 0.07, fz], 0.056, 0.045), PANTS));
      rest.push(tint(ball([s * 0.09, 0.04, fz + 0.05], 0.06, 0.85, 0.55, 1.7), SHOE));
    }
  }
  CREW[pose] = { shirt: mergeGeometries(shirt.map(strip)), rest: mergeGeometries(rest) };
  return CREW[pose];
}

/** 旋转体，uv：u 绕圆周一圈，v 沿剖面（按剖面点序号均分），可指定落在图集的 [v0, v1] 一段 */
function latheUV(profile, segs, v0 = 0, v1 = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  return g;
}
const TYRE_PROFILE = [[0.001, -0.1], [0.2, -0.1], [0.215, -0.19], [0.34, -0.19], [0.375, -0.1], [0.375, 0.1], [0.34, 0.19], [0.215, 0.19], [0.2, 0.1], [0.001, 0.1]];
const BLANKET_PROFILE = [[0.001, -0.15], [0.2, -0.16], [0.33, -0.185], [0.38, -0.12], [0.385, 0], [0.38, 0.12], [0.33, 0.185], [0.2, 0.16], [0.001, 0.15]];
export const COMPOUNDS = ['#e8002d', '#ffd400', '#f2f2f2'];   // 软 / 中 / 硬 的胎壁色带
/** 裸胎（带轮辋），轴沿 Y；i 选择配方（0 软、1 中、2 硬），对应 tyreTex 图集里的一行 */
export function tyreGeo(i = 0) { return latheUV(TYRE_PROFILE, 12, 1 - (i + 1) / 3, 1 - i / 3); }
/** 套着保温毯的轮胎，轴沿 Y */
export function blanketGeo() { return latheUV(BLANKET_PROFILE, 12); }

/**
 * 轮胎贴图图集（横向绕圆周一圈，纵向沿剖面：轮辋面 → 轮辋唇 → 胎壁 → 胎肩 → 胎面 → 另一侧对称），三行分别是三种配方。
 * 轮辋画辐条与中心锁螺母，胎壁画配方色带与一圈字块，胎面画磨损条纹。
 */
export function tyreTex() {
  const W = 512, RH = 144;
  return canvasTex(W, RH * 3, (c) => {
    COMPOUNDS.forEach((col, row) => {
      c.save(); c.translate(0, row * RH);
      const band = RH / 9;                           // 剖面 10 个点 → 9 段
      const both = (k, draw) => { draw(k * band); draw((8 - k) * band); };   // 两侧对称
      c.fillStyle = '#141518'; c.fillRect(0, 0, W, RH);
      both(0, (y) => {                               // 轮辋面：辐条
        c.fillStyle = '#2b2d32'; c.fillRect(0, y, W, band);
        c.fillStyle = '#8d939c'; for (let i = 0; i < 10; i++) c.fillRect((i + 0.2) * (W / 10), y, (W / 10) * 0.6, band);
      });
      c.fillStyle = '#c4c9d0'; c.fillRect(0, 0, W, 3); c.fillRect(0, RH - 3, W, 3);            // 中心锁螺母
      both(1, (y) => { c.fillStyle = '#5d626a'; c.fillRect(0, y, W, band); c.fillStyle = '#a5abb4'; c.fillRect(0, y + band * 0.35, W, 2); });   // 轮辋唇
      both(2, (y) => {                               // 胎壁：配方色带 + 字块
        c.fillStyle = '#18191c'; c.fillRect(0, y, W, band);
        c.fillStyle = col; c.fillRect(0, y + band * 0.62, W, band * 0.2);
        for (const x0 of [28, 284]) { c.fillRect(x0, y + band * 0.2, 46, band * 0.3); c.fillRect(x0 + 54, y + band * 0.2, 12, band * 0.3); c.fillRect(x0 + 72, y + band * 0.2, 30, band * 0.3); }
        c.fillStyle = 'rgba(255,255,255,0.75)';
        for (const x0 of [168, 424]) { c.fillRect(x0, y + band * 0.24, 22, band * 0.2); c.fillRect(x0 + 28, y + band * 0.24, 34, band * 0.2); }
      });
      both(3, (y) => { const g = c.createLinearGradient(0, y, 0, y + band); g.addColorStop(0, '#1d1e22'); g.addColorStop(1, '#101114'); c.fillStyle = g; c.fillRect(0, y, W, band); });
      const ty = 4 * band;                           // 胎面：光头胎，带细微磨损条纹
      c.fillStyle = '#17181b'; c.fillRect(0, ty, W, band);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(255,255,255,${0.02 + ((i * 37) % 10) * 0.004})`; c.fillRect((i * 61) % W, ty + ((i * 29) % Math.ceil(band)), 5 + (i % 7), 1); }
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, ty + band * 0.48, W, 1.5);
      c.restore();
    });
  });
}

/** 保温毯贴图：白底（乘实例队色）+ 分片缝线 + 魔术贴绑带 + 电源接口 + 白色标签；轮毂口偏暗 */
export function blanketTex() {
  const W = 256, H = 128;
  return canvasTex(W, H, (c) => {
    const band = H / 8;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(0,0,0,${0.02 + ((i * 13) % 7) * 0.006})`; c.fillRect((i * 53) % W, (i * 31) % H, 2, 1); }   // 布纹
    for (const y of [0, H - band]) { const g = c.createLinearGradient(0, y ? H : 0, 0, y ? H - band : band); g.addColorStop(0, '#2a2a2a'); g.addColorStop(1, '#6a6a6a'); c.fillStyle = g; c.fillRect(0, y, W, band); }
    c.fillStyle = 'rgba(0,0,0,0.30)';
    for (const y of [band * 2, band * 3, band * 5, band * 6]) c.fillRect(0, y - 1, W, 2);     // 环向缝线
    for (let x = 0; x < W; x += W / 8) c.fillRect(x, band, 1.5, H - 2 * band);                // 分片缝线
    c.fillStyle = '#1b1c1f'; c.fillRect(20, band * 1.2, 14, H - band * 2.4);                  // 魔术贴绑带
    c.fillStyle = '#3a3c41'; c.fillRect(34, band * 3.6, 12, band * 0.8);                      // 电源接口
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(140, band * 3.3, 44, band * 1.4);      // 标签
    c.fillStyle = '#1b1c1f'; c.fillRect(145, band * 3.6, 26, 3); c.fillRect(145, band * 4.2, 34, 3);
  });
}

/** 风炮气管：从天花（原点）垂下约 3.9 m，末端回弯并挂着风炮（朝 +x 一侧） */
export function hoseGeo() {
  const pts = [[0, 0, 0], [0, -1.3, 0.02], [0.04, -2.6, 0], [0.1, -3.45, -0.04], [0.19, -3.86, 0], [0.29, -3.62, 0.05], [0.31, -3.3, 0.06]].map((p) => new THREE.Vector3(...p));
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 4, false);
  const gun = [box(0.07, 0.2, 0.09, 0.31, -3.2, 0.06), box(0.055, 0.07, 0.24, 0.31, -3.12, 0.16), seg([0.31, -3.12, 0.27], [0.31, -3.12, 0.36], 0.035, 0.035, 8)];
  return mergeGeometries([tube, ...gun].map(strip));
}

/** 千斤顶：低矮的托架 + 两个小轮 + 向 -z 伸出的长把手 */
export function jackGeo() {
  const parts = [
    box(0.46, 0.07, 0.62, 0, 0.09, 0), box(0.3, 0.1, 0.12, 0, 0.17, 0.22),
    seg([0, 0.1, -0.25], [0, 0.82, -1.35], 0.022, 0.022, 6), seg([-0.24, 0.82, -1.35], [0.24, 0.82, -1.35], 0.022, 0.022, 6),
  ];
  for (const s of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateZ(Math.PI / 2).translate(s * 0.26, 0.07, 0.2));
  return mergeGeometries(parts.map(strip));
}

/** 地面软阴影贴图（圆角矩形，边缘虚化） */
export function blobTex() {
  return canvasTex(64, 64, (c) => { c.shadowColor = '#000'; c.shadowBlur = 13; c.fillStyle = '#000'; c.fillRect(19, 19, 26, 26); });
}

// 一个车队车库（3 个开间）里的灯位：[相对车库中线的横向偏移 x, 进深 z]
const lightSpots = (bayW) => { const out = []; for (const j of [-1, 0, 1]) for (const lx of [-2.2, 2.2]) for (const lz of [3, 7, 11]) out.push([j * bayW + lx, lz]); return out; };

/** 车库地面：浅灰环氧地坪 + 地砖缝 + 灯下的亮斑 + 门口的天光 + 墙根的暗角 */
export function garageFloorTex(tw, GD, bayW) {
  return canvasTex(1024, 512, (c, w, h) => {
    const X = (x) => (0.5 + x / tw) * w, Z = (z) => (z / GD) * h, mx = w / tw, mz = h / GD;
    c.fillStyle = '#b4b9c0'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30,36,46,0.20)'; c.lineWidth = 1;
    for (let x = -tw / 2; x < tw / 2; x += 1.2) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), h); c.stroke(); }
    for (let z = 0; z < GD; z += 1.2) { c.beginPath(); c.moveTo(0, Z(z)); c.lineTo(w, Z(z)); c.stroke(); }
    for (const [lx, lz] of lightSpots(bayW)) {       // 灯下亮斑（椭圆）
      c.save(); c.translate(X(lx), Z(lz)); c.scale(mx, mz);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 2.6); g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(-2.6, -2.6, 5.2, 5.2); c.restore();
    }
    const grad = (x0, y0, x1, y1, a, b) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
    c.fillStyle = grad(0, 0, 0, Z(3.2), 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0)'); c.fillRect(0, 0, w, Z(3.2));                 // 门口天光
    c.fillStyle = grad(0, h, 0, Z(GD - 2.2), 'rgba(12,16,24,0.42)', 'rgba(12,16,24,0)'); c.fillRect(0, Z(GD - 2.2), w, h);              // 背墙墙根
    c.fillStyle = grad(0, 0, mx * 1.6, 0, 'rgba(12,16,24,0.38)', 'rgba(12,16,24,0)'); c.fillRect(0, 0, mx * 1.6, h);                    // 两侧隔墙墙根
    c.fillStyle = grad(w, 0, w - mx * 1.6, 0, 'rgba(12,16,24,0.38)', 'rgba(12,16,24,0)'); c.fillRect(w - mx * 1.6, 0, mx * 1.6, h);
  });
}

/** 车库天花：深色吊顶 + 龙骨格 + 灯具周围的光晕（朝下的平面，画布上边 = 背墙） */
export function garageCeilTex(tw, GD, bayW) {
  return canvasTex(512, 256, (c, w, h) => {
    const X = (x) => (0.5 + x / tw) * w, Z = (z) => (1 - z / GD) * h, mx = w / tw, mz = h / GD;
    c.fillStyle = '#2a2d33'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    for (let x = -tw / 2; x < tw / 2; x += 1.2) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), h); c.stroke(); }
    for (let z = 0; z < GD; z += 1.2) { c.beginPath(); c.moveTo(0, Z(z)); c.lineTo(w, Z(z)); c.stroke(); }
    for (const [lx, lz] of lightSpots(bayW)) {
      c.save(); c.translate(X(lx), Z(lz)); c.scale(mx, mz);
      const g = c.createRadialGradient(0, 0, 0.2, 0, 0, 1.9); g.addColorStop(0, 'rgba(235,242,255,0.55)'); g.addColorStop(1, 'rgba(235,242,255,0)');
      c.fillStyle = g; c.fillRect(-1.9, -1.9, 3.8, 3.8); c.restore();
    }
  });
}

/** 车库侧墙：分块的展板墙，顶部被灯洗亮、墙根偏暗 */
export function garageWallTex() {
  return canvasTex(512, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.55, '#e3e6ea'); g.addColorStop(1, '#a9aeb6');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(30,36,46,0.22)'; for (let i = 1; i < 13; i++) c.fillRect(Math.round((i * w) / 13), 0, 1, h);
    c.fillStyle = 'rgba(30,36,46,0.16)'; c.fillRect(0, Math.round(h * 0.46), w, 1);
  });
}

