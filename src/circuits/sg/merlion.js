// 鱼尾狮雕像（Merlion）：用有向距离场（SDF）把鱼身、头、头巾式鬃毛、尾巴、鳍、獠牙融合成一整块封闭的实心网格
// （Marching Cubes 取等值面），所以部件之间不会穿插、不会露缝，也不会是空心的薄壳。
// 造型依据实景照片：细长直立的鳞身、头巾式的整块鬃毛（竖向沟纹、下摆外张）、沿前胸翘起的胸鳍、
// 下方大涡卷的尾与背后竖起的尾鳍片、蓝白瓷砖的波浪形台座。高度按公开介绍 8.6 m（含台座约 10 m）。
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { canvasTex, floodlit, night } from '../../util.js';

// ───────────── 距离场工具 ─────────────
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
/** 椭球（近似距离） */
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
/** 圆头锥（两端半径不同的胶囊） */
function rc(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az, y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y, x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// ───────────── 雕像的距离场 ─────────────
const Y0 = 1.55;                       // 台座顶面（雕像落脚处）
const YH = Y0 + 5.15;                  // 头的中心高度
const TILT = 0.2, CT = Math.cos(TILT), ST = Math.sin(TILT);
const PY = YH - 0.1, PZ = 0.35;        // 头部转轴
// 尾巴：位于 YZ 平面内的涡卷（半径逐渐收小的螺旋），沿螺旋排一串圆头锥
const SCROLL = [];
{
  const N = 22, Cy = Y0 + 1.45, Cz = -2.15;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N, ph = t * Math.PI * 1.7, R = 1.25 - 0.62 * t, p = [0, Cy + R * Math.sin(ph), Cz + R * Math.cos(ph)], r = 0.52 - 0.3 * t;
    if (prev) SCROLL.push([...prev.p, ...p, prev.r, r]);
    prev = { p, r };
  }
}
const dist2 = (x, y, z, cx, cy, cz) => Math.hypot(x - cx, y - cy, z - cz);

function bodyD(x, y, z) {
  const zb = z / 0.88;
  return Math.min(
    rc(x, y, zb, 0, Y0 - 0.3, -0.05, 0, Y0 + 1.6, 0.1, 1.36, 1.46),
    rc(x, y, zb, 0, Y0 + 1.6, 0.1, 0, Y0 + 3.2, 0.2, 1.46, 1.36),
    rc(x, y, zb, 0, Y0 + 3.2, 0.2, 0, Y0 + 4.7, 0.25, 1.36, 1.2),
  ) * 0.88;
}
function hoodD(x, y, z) {
  const zs = (z + 0.5) / 0.78 - 0.5;                                  // 前后压扁
  let d = rc(x, y, zs, 0, YH + 0.6, -0.55, 0, YH - 2.3, -0.45, 1.45, 1.95) * 0.78;
  d = smax(d, -ell(x, y, z, 0, YH + 0.2, 1.3, 1.25, 1.7, 1.55), 0.2);  // 前面开出脸的窗口
  return d + 0.075 * Math.sin(Math.atan2(x, z + 0.5) * 14);            // 竖向沟纹
}
/** 头（局部坐标 u,v,w，整体略微上仰） */
function headLocal(u, v, w) {
  const m = (a, b) => smin(a, b, 0.12);
  let d = ell(u, v, w, 0, 0.25, 0, 1.15, 1.1, 1.15);                                  // 颅
  d = m(d, ell(u, v, w, 0, -0.2, 1.05, 0.75, 0.5, 1.0));                              // 鼻吻
  d = m(d, ell(u, v, w, 0, 0.2, 1.95, 0.3, 0.22, 0.27));                              // 鼻头
  d = m(d, ell(u, v, w, 0, -0.62, 1.0, 0.5, 0.22, 0.75));                             // 下颌
  for (const s of [-1, 1]) {
    d = m(d, ell(u, v, w, s * 0.5, -0.2, 0.9, 0.45, 0.38, 0.6));                      // 脸颊
    d = m(d, ell(u, v, w, s * 0.5, 0.85, 0.95, 0.5, 0.16, 0.3));                      // 粗眉
    d = m(d, ell(u, v, w, s * 0.75, 1.2, -0.2, 0.28, 0.32, 0.15));                    // 耳
    d = m(d, rc(u, v, w, s * 0.28, -0.3, 1.55, s * 0.28, -0.64, 1.55, 0.09, 0.03));   // 上獠牙
    d = m(d, rc(u, v, w, s * 0.22, -0.56, 1.5, s * 0.22, -0.3, 1.5, 0.08, 0.03));     // 下獠牙
    d = smax(d, -ell(u, v, w, s * 0.5, 0.55, 0.95, 0.2, 0.1, 0.13), 0.05);            // 眼窝
  }
  return smax(d, -ell(u, v, w, 0, -0.35, 1.15, 0.55, 0.26, 0.6), 0.08);               // 张开的嘴
}
function headD(x, y, z) {
  const yy = y - PY, zz = z - PZ;
  return headLocal(x, yy * CT - zz * ST, yy * ST + zz * CT);
}
function tailD(x, y, z) {
  let d = ell(x, y, z, 0, Y0 + 3.2, -1.95, 0.2, 2.3, 0.9);                              // 背后竖起的尾鳍片
  for (const s of SCROLL) d = Math.min(d, rc(x, y, z, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]));
  return d;
}
function finD(x, y, z) {
  let d = 1e9;
  for (const s of [-1, 1]) {
    const xc = s * 1.15, xs = (x - xc) * 2.3 + xc;                                       // x 方向压薄成片
    d = Math.min(d,
      rc(xs, y, z, s * 1.1, Y0 + 0.9, 0.95, s * 1.25, Y0 + 2.2, 1.35, 0.28, 0.22) / 2.3,
      rc(xs, y, z, s * 1.25, Y0 + 2.2, 1.35, s * 1.05, Y0 + 3.4, 1.3, 0.22, 0.12) / 2.3);
  }
  return d;
}
function sdf(x, y, z) {
  const b = bodyD(x, y, z);
  const hood = dist2(x, y, z, 0, YH - 1.0, -0.4) < 3.7 ? hoodD(x, y, z) : dist2(x, y, z, 0, YH - 1.0, -0.4) - 3.4;
  const head = dist2(x, y, z, 0, YH, 0.9) < 3.3 ? headD(x, y, z) : dist2(x, y, z, 0, YH, 0.9) - 3.0;
  const tail = dist2(x, y, z, 0, Y0 + 2.0, -2.0) < 3.7 ? tailD(x, y, z) : dist2(x, y, z, 0, Y0 + 2.0, -2.0) - 3.4;
  const fin = dist2(x, y, z, 0, Y0 + 2.2, 1.1) < 3.0 ? finD(x, y, z) : dist2(x, y, z, 0, Y0 + 2.2, 1.1) - 2.7;
  return smin(smin(smin(smin(b, hood, 0.3), head, 0.28), tail, 0.25), fin, 0.2);
}

// ───────────── Marching Cubes ─────────────
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

function polygonize({ x0, y0, z0, x1, y1, z1 }, h) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[at(i, j, k)] = sdf(x0 + i * h, y0 + j * h, z0 + k * h);
  const grad = (i, j, k, out) => {
    const ii = clamp(i, 1, nx - 2), jj = clamp(j, 1, ny - 2), kk = clamp(k, 1, nz - 2);
    out[0] = F[at(ii + 1, jj, kk)] - F[at(ii - 1, jj, kk)]; out[1] = F[at(ii, jj + 1, kk)] - F[at(ii, jj - 1, kk)]; out[2] = F[at(ii, jj, kk + 1)] - F[at(ii, jj, kk - 1)];
  };
  const pos = [], nor = [];
  const vp = new Array(12), vn = new Array(12), ga = [0, 0, 0], gb = [0, 0, 0];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let ci = 0; const val = new Array(8);
    for (let c = 0; c < 8; c++) { val[c] = F[at(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2])]; if (val[c] < 0) ci |= 1 << c; }
    const em = edgeTable[ci]; if (!em) continue;
    for (let e = 0; e < 12; e++) {
      if (!(em & (1 << e))) continue;
      const [a, b] = EDGE[e], va = val[a], vb = val[b], t = va / (va - vb);
      const ca = CORNER[a], cb = CORNER[b];
      vp[e] = [x0 + (i + ca[0] + (cb[0] - ca[0]) * t) * h, y0 + (j + ca[1] + (cb[1] - ca[1]) * t) * h, z0 + (k + ca[2] + (cb[2] - ca[2]) * t) * h];
      grad(i + ca[0], j + ca[1], k + ca[2], ga); grad(i + cb[0], j + cb[1], k + cb[2], gb);
      const nxv = ga[0] + (gb[0] - ga[0]) * t, nyv = ga[1] + (gb[1] - ga[1]) * t, nzv = ga[2] + (gb[2] - ga[2]) * t, l = Math.hypot(nxv, nyv, nzv) || 1;
      vn[e] = [nxv / l, nyv / l, nzv / l];
    }
    for (let t = ci * 16; triTable[t] !== -1 && t < ci * 16 + 16; t += 3) {
      const e0 = triTable[t], e1 = triTable[t + 1], e2 = triTable[t + 2];
      const A = vp[e0], B = vp[e1], C = vp[e2];
      // 朝向以距离场梯度（指向外）为准，保证三角形外表面朝外，不会出现“看进去是空的”
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      const gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
      const flip = gx * (vn[e0][0] + vn[e1][0] + vn[e2][0]) + gy * (vn[e0][1] + vn[e1][1] + vn[e2][1]) + gz * (vn[e0][2] + vn[e1][2] + vn[e2][2]) < 0;
      const order = flip ? [e0, e2, e1] : [e0, e1, e2];
      for (const e of order) { pos.push(...vp[e]); nor.push(...vn[e]); }
    }
  }
  return { pos, nor };
}

/** 鱼鳞：一排排错开的圆头鳞片（每格 2 行 × 1 列，可无缝平铺） */
function scaleTexture() {
  return canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#f2f1ed'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(86,92,100,0.62)'; c.lineWidth = 3;
    for (let row = 0; row < 3; row++) for (let i = -1; i <= 2; i++) {
      const cx = i * w + (row % 2 ? w / 2 : 0), cy = row * (h / 2);
      c.beginPath(); c.arc(cx, cy, w * 0.5, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(cx, cy, w * 0.3, 0.15, Math.PI - 0.15); c.stroke();
    }
  }, [1, 1]);
}

/** 蓝白瓷砖的波浪形台座：封闭的实心体（沿长度方向拉伸的截面），条纹沿波浪长度方向 */
function plinthMesh() {
  const PL = 9.0, PD = 5.4, N = 30;
  const prof = (t) => (t < 0.62 ? 0.18 + 1.45 * Math.pow(Math.sin((t / 0.62) * Math.PI / 2), 2) : 0.18 + 1.45 * Math.pow(Math.cos(((t - 0.62) / 0.38) * Math.PI / 2), 1.6));
  const shape = new THREE.Shape();
  shape.moveTo(-PD / 2, 0);
  for (let i = 0; i <= N; i++) shape.lineTo(-PD / 2 + (i / N) * PD, prof(i / N));
  shape.lineTo(PD / 2, 0); shape.lineTo(-PD / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PL, bevelEnabled: false, steps: 24 });
  geo.translate(0, 0, -PL / 2); geo.rotateY(Math.PI / 2);                          // 长度沿 x，截面在 (z, y)
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2), arc = [0];
  for (let i = 1; i <= N; i++) arc.push(arc[i - 1] + Math.hypot(PD / N, prof(i / N) - prof((i - 1) / N)));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const env = 0.12 + 0.88 * Math.pow(Math.cos(Math.min(1, Math.abs(x) / (PL / 2)) * Math.PI / 2 * 0.98), 0.4);   // 两端收低成圆头
    const t = clamp((z + PD / 2) / PD, 0, 1), top = prof(t);
    p.setY(i, y * env);
    uv[i * 2] = 0.5; uv[i * 2 + 1] = (arc[Math.round(t * N)] + (top - y)) / 0.55;     // 每 0.55 m 一条带，沿深度方向变色 → 条纹沿长度
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const tex = canvasTex(8, 192, (c, w, h) => {
    const cols = ['#1d3f96', '#2b62c9', '#f1f1ee', '#2b62c9', '#1d3f96', '#f1f1ee'];
    cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, (i * h) / cols.length, w, h / cols.length); });
  }, [1, 1]);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return new THREE.Mesh(geo, floodlit(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), 0.4));
}

/** 鱼尾狮雕像（局部 +z 为面朝方向，原点在台座中心）。scale = 1 为 8.6 m 高的主像 */
export function merlionStatue(scale = 1) {
  const g = new THREE.Group();
  const { pos, nor } = polygonize({ x0: -3.3, y0: Y0 - 0.5, z0: -4.4, x1: 3.3, y1: YH + 3.2, z1: 3.3 }, 0.085);
  const n = pos.length / 3, aBody = new Float32Array(n), aDark = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    aBody[i] = 1 - clamp((Math.abs(bodyD(x, y, z)) - 0.02) / 0.2, 0, 1);                   // 鳞片只出现在鱼身上
    const yy = y - PY, zz = z - PZ, v = yy * CT - zz * ST, w = yy * ST + zz * CT, u = x;
    const cav = ell(u, v, w, 0, -0.35, 1.15, 0.55, 0.26, 0.6), eye = Math.min(ell(u, v, w, 0.5, 0.55, 0.95, 0.2, 0.1, 0.13), ell(u, v, w, -0.5, 0.55, 0.95, 0.2, 0.1, 0.13));
    aDark[i] = cav > -0.05 && cav < 0.16 ? 1 : eye < 0.1 ? 0.85 : 0;                        // 嘴里、眼窝发暗
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBody', new THREE.BufferAttribute(aBody, 1));
  geo.setAttribute('aDark', new THREE.BufferAttribute(aDark, 1));
  const tex = scaleTexture(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.8, map: tex });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.vertexShader = 'attribute float aBody;\nattribute float aDark;\nvarying float vBody;\nvarying float vDark;\nvarying vec3 vPosO;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBody = aBody; vDark = aDark; vPosO = position;');
    s.fragmentShader = 'varying float vBody;\nvarying float vDark;\nvarying vec3 vPosO;\nuniform float uNight;\n' +
      s.fragmentShader
        .replace('#include <map_fragment>', 'vec2 suv = vec2(atan(vPosO.x, vPosO.z) * 19.0 / 6.2831853, vPosO.y / 0.76);\n  vec3 sc = texture2D(map, suv).rgb;\n  diffuseColor.rgb *= mix(vec3(1.0), sc, vBody);\n  diffuseColor.rgb *= (1.0 - 0.78 * vDark);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.35;');
  };
  mat.customProgramCacheKey = () => 'merlionStone';
  const stone = new THREE.Mesh(geo, mat);
  stone.castShadow = stone.receiveShadow = true;
  stone.frustumCulled = false;
  g.add(stone);
  const plinth = plinthMesh(); plinth.castShadow = plinth.receiveShadow = true; g.add(plinth);
  // 喷水口在雕像坐标里的位置（头的局部坐标 (0, -0.35, 1.85) 转回世界）
  const v = -0.35, w = 1.85;
  g.userData.mouth = [0, PY + v * CT + w * ST, PZ - v * ST + w * CT];
  g.scale.setScalar(scale);
  return g;
}
