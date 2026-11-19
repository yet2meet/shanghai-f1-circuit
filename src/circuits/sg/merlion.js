// 鱼尾狮雕像（Merlion）：用有向距离场（SDF）把鱼身、头、鬃毛、鳍和獠牙融合成一整块封闭的实心网格
// （Marching Cubes 取等值面），所以部件之间不会穿插、不会露缝，也不会是空心的薄壳。
// 造型参考新加坡旅游局的侧视照片和新加坡国家美术馆的背面照片。
import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { canvasTex, floodlit, night, rng } from '../../util.js';

// ───────────── 距离场工具 ─────────────
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const smoothstep = THREE.MathUtils.smoothstep;
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
const Y0 = 1.36;                       // 台座顶面（雕像落脚处）
const YH = Y0 + 5.15;                  // 头的中心高度
const TILT = 0.12, CT = Math.cos(TILT), ST = Math.sin(TILT);
const PY = YH - 0.1, PZ = 0.35;        // 头部转轴
const dist2 = (x, y, z, cx, cy, cz) => Math.hypot(x - cx, y - cy, z - cz);

// 错开的鱼鳞随鱼身一起生成；下缘凸起，上缘顺着石身过渡。
function scaleRelief(x, y, z) {
  const row = (y - Y0) / 0.39;
  const t = row - Math.floor(row);
  const angle = Math.atan2(x, z - 0.1) * 18 / (2 * Math.PI) + (Math.floor(row) % 2) * 0.5;
  const u = (angle - Math.round(angle)) * 2;
  const edge = 0.09 + 0.39 * u * u;
  const height = smoothstep(t, edge, edge + 0.19) * (1 - smoothstep(t, edge + 0.22, 0.99));
  return height * 0.105;
}
function bodyD(x, y, z) {
  const zb = z / 0.88;
  const body = Math.min(
    rc(x, y, zb, 0, Y0 - 0.3, -0.05, 0, Y0 + 1.6, 0.1, 1.32, 1.30),
    rc(x, y, zb, 0, Y0 + 1.6, 0.1, 0, Y0 + 3.2, 0.2, 1.30, 1.37),
    rc(x, y, zb, 0, Y0 + 3.2, 0.2, 0, Y0 + 4.65, 0.25, 1.37, 1.18),
  ) * 0.88;
  return Math.abs(body) < 0.20 && y < YH - 0.9 ? body - scaleRelief(x, y, z) : body;
}
function hoodD(x, y, z) {
  const a = Math.atan2(x, -(z + 0.32));
  const rear = (1 + Math.cos(a)) / 2;
  const zs = (z + 0.35) / 0.84 - 0.35;
  let d = rc(x, y, zs, 0, YH + 0.63, -0.37, 0, YH - 2.45, -0.34, 1.42, 1.65) * 0.84;
  const seam = Math.pow((1 + Math.cos(a * 10 + 0.18 * (y - YH) * Math.sin(a))) / 2, 7);
  const offset = 0.19 * Math.cos(a * 3);
  // 后颈三层鬃毛的下沿外翻，层与层之间留出折边的阴影。
  for (const edge of [YH - 0.43 + offset, YH - 1.52 + offset]) {
    d -= 0.29 * rear * smoothstep(y, edge, edge + 0.15) * (1 - smoothstep(y, edge + 0.18, edge + 0.85));
  }
  const hem = Y0 + 2.82 + 0.58 * (1 - rear) + 0.19 * Math.cos(a * 6);
  d = smax(d + 0.14 * seam, hem - y, 0.075);
  return smax(d, -ell(x, y, z, 0, YH + 0.02, 1.30, 1.36, 1.57, 1.53), 0.14);
}
const mouthD = (x, y, z) => ell(x, y, z, 0, -0.40, 1.62, 0.68, 0.34, 0.88);
const eyeD = (x, y, z) => ell(Math.abs(x), y, z, 0.59, 0.40, 1.025, 0.29, 0.16, 0.24);
const nostrilD = (x, y, z) => ell(Math.abs(x), y, z, 0.20, 0.045, 1.91, 0.115, 0.105, 0.15);
/** 头（局部坐标 u,v,w，整体略微上仰） */
function headLocal(u, v, w) {
  const m = (a, b) => smin(a, b, 0.11);
  const x = Math.abs(u);
  let d = ell(x, v, w, 0, 0.22, 0.04, 1.18, 1.09, 1.10);
  d = m(d, ell(x, v, w, 0.44, -0.04, 1.28, 0.46, 0.37, 0.62));          // 饱满的两侧鼻吻
  d = m(d, ell(x, v, w, 0, 0.20, 1.67, 0.40, 0.28, 0.35));             // 鼻头
  d = m(d, ell(x, v, w, 0, 0.62, 0.93, 0.32, 0.45, 0.31));             // 鼻梁接额头
  d = m(d, ell(x, v, w, 0, -0.72, 1.04, 0.68, 0.32, 0.74));            // 厚下颌
  d = m(d, ell(x, v, w, 0.80, -0.25, 0.79, 0.36, 0.54, 0.46));         // 脸颊
  d = m(d, ell(x, v + (x - 0.56) * 0.24, w, 0.59, 0.61, 0.97, 0.44, 0.20, 0.30)); // 眉骨
  const ear = ell(x, v + (x - 0.92) * 0.32, w, 0.94, 1.21, 0.31, 0.24, 0.30, 0.22);
  d = m(d, smax(ear, -ell(x, v, w, 0.96, 1.22, 0.50, 0.12, 0.17, 0.09), 0.05));
  d = smax(smax(smax(d, -mouthD(x, v, w), 0.06), -eyeD(x, v, w), 0.04), -nostrilD(x, v, w), 0.04);
  // 切出眼窝和嘴腔之后再接上眼球、牙齿，使牙尖伸入开口。
  d = smin(d, ell(x, v, w, 0.59, 0.40, 0.91, 0.16, 0.107, 0.135), 0.04);
  d = smin(d, rc(x, v, w, 0.43, -0.27, 1.52, 0.42, -0.53, 1.55, 0.108, 0.029), 0.04);
  d = smin(d, rc(x, v, w, 0.42, -0.71, 1.48, 0.43, -0.51, 1.52, 0.088, 0.026), 0.04);
  for (const offset of [0.09, 0.26]) {
    d = smin(d, ell(x, v, w, offset, -0.29, 1.62, 0.087, 0.11, 0.11), 0.028);
    d = smin(d, ell(x, v, w, offset, -0.62, 1.54, 0.087, 0.095, 0.12), 0.028);
  }
  return d;
}
function headD(x, y, z) {
  const yy = y - PY, zz = z - PZ;
  return headLocal(x, yy * CT - zz * ST, yy * ST + zz * CT);
}
function finD(x, y, z) {
  const u = Math.abs(x);
  const sweep = clamp((y - Y0 - 1.1) / 2.2, 0, 1);
  const zf = z - sweep * sweep * 0.54;
  const xf = (u - 0.95) * 1.8 + 0.95;
  const lobe = ell(xf, y, zf, 0.91, Y0 + 2.05, 1.08, 0.37, 1.40, 0.49) / 1.8;
  const rib = Math.cos(Math.atan2(zf - 0.70, y - Y0 - 0.67) * 38);
  return lobe + 0.024 * rib;
}
function sdf(x, y, z) {
  const b = bodyD(x, y, z);
  const hood = dist2(x, y, z, 0, YH - 1.0, -0.4) < 3.7 ? hoodD(x, y, z) : dist2(x, y, z, 0, YH - 1.0, -0.4) - 3.4;
  const head = dist2(x, y, z, 0, YH, 0.9) < 3.3 ? headD(x, y, z) : dist2(x, y, z, 0, YH, 0.9) - 3.0;
  const fin = dist2(x, y, z, 0, Y0 + 2.2, 1.1) < 3.0 ? finD(x, y, z) : dist2(x, y, z, 0, Y0 + 2.2, 1.1) - 2.7;
  return Math.max(smin(smin(smin(b, hood, 0.16), head, 0.15), fin, 0.12), Y0 - 0.14 - y);
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
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (let row = 0; row < 2; row++) for (let i = -1; i <= 1; i++) {
      const cx = (i + (row === 0 ? 0.5 : 0)) * w, cy = row * h / 2;
      c.strokeStyle = 'rgba(119,113,101,0.40)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx - 62, cy + 34); c.quadraticCurveTo(cx, cy + 79, cx + 62, cy + 34); c.stroke();
      c.strokeStyle = 'rgba(146,139,124,0.34)'; c.lineWidth = 1.4;
      for (let j = -4; j <= 4; j++) {
        const u = j / 4.5;
        c.beginPath(); c.moveTo(cx + u * 12, cy + 22); c.quadraticCurveTo(cx + u * 32, cy + 34, cx + u * 54, cy + 54 - 17 * u * u); c.stroke();
      }
    }
  }, [1, 1]);
}

/** 蓝白马赛克波座与下方的石材台基。 */
function plinthMesh() {
  const group = new THREE.Group();
  group.name = 'merlion-plinth';
  const geo = new THREE.SphereGeometry(1, 72, 40);
  const { position: p, uv } = geo.attributes;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), r = Math.hypot(nx, nz);
    const x = nx * 3.03, z = nz * 4.36 + 0.40;
    const crest = 0.16 * Math.sin(z * 1.3 + 0.8);
    const shoulder = smoothstep(r, 0.37, 0.65) * (1 - smoothstep(r, 0.85, 1));
    const top = 0.43 + 1.09 * (1 - smoothstep(r, 0.25, 1)) + crest * shoulder;
    const y = ny >= 0 ? top : 0.43 + ny * 0.13;
    p.setXYZ(i, x, y, z);
    uv.setXY(i, (z + 0.16 * x) / 1.15, (y + 0.23 * x - crest) / 0.83);
  }
  geo.computeVertexNormals();
  const tex = canvasTex(192, 192, (c, w, h) => {
    const random = rng(484);
    const colors = ['#1f4883', '#285a95', '#527fa4', '#356795', '#224b88', '#325fa0'];
    const tw = w / 6, th = h / colors.length;
    c.fillStyle = '#99a4a1'; c.fillRect(0, 0, w, h);
    for (const [row, color] of colors.entries()) for (let col = -1; col < 6; col++) {
      const x = (col + (row % 2) * 0.5) * tw, y = row * th;
      c.fillStyle = color; c.fillRect(x + 1, y + 1, tw - 2, th - 2);
      if (row === 3) { c.fillStyle = '#b7c9c7'; c.fillRect(x + 1, y + 9, tw - 2, 12); }
      c.fillStyle = `rgba(255,255,255,${random() * 0.17})`; c.fillRect(x + 1, y + 1, tw - 2, th - 2);
    }
  }, [1, 1]);
  const tiles = new THREE.Mesh(geo, floodlit(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.44 }), 0.38));
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.03, 0.44, 64), floodlit(new THREE.MeshStandardMaterial({ color: '#62686c', roughness: 0.9 }), 0.24));
  footing.scale.set(3.10, 1, 4.45);
  footing.position.set(0, 0.22, 0.40);
  for (const mesh of [footing, tiles]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  return group;
}

/** 鱼尾狮雕像（局部 +z 为面朝方向，原点在台座中心）。scale = 1 为 8.6 m 高的主像 */
export function merlionStatue(scale = 1) {
  const g = new THREE.Group();
  const { pos, nor } = polygonize({ x0: -2.2, y0: Y0 - 0.32, z0: -2.55, x1: 2.2, y1: YH + 2.34, z1: 2.9 }, 0.068);
  const n = pos.length / 3, aBody = new Float32Array(n), aDark = new Float32Array(n);
  let top = Y0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    top = Math.max(top, y);
    aBody[i] = (1 - smoothstep(Math.abs(bodyD(x, y, z)), 0.025, 0.15)) * (1 - smoothstep(y, YH - 1.3, YH - 0.8));
    const yy = y - PY, zz = z - PZ, v = yy * CT - zz * ST, w = yy * ST + zz * CT, u = x;
    const mouth = (1 - smoothstep(Math.abs(mouthD(u, v, w)), 0.015, 0.095)) * (1 - smoothstep(w, 1.05, 1.84));
    const nostril = (1 - smoothstep(Math.abs(nostrilD(u, v, w)), 0.012, 0.052)) * (1 - smoothstep(w, 1.86, 2.0));
    const iris = w > 0.931 ? 1 - smoothstep(Math.hypot(Math.abs(u) - 0.59, v - 0.40), 0.05, 0.098) : 0;
    aDark[i] = Math.max(mouth * 0.93, nostril * 0.67, iris * 0.98);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aBody', new THREE.BufferAttribute(aBody, 1));
  geo.setAttribute('aDark', new THREE.BufferAttribute(aDark, 1));
  const tex = scaleTexture();
  const mat = new THREE.MeshStandardMaterial({ color: '#eeece4', roughness: 0.87, map: tex });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.vertexShader = 'attribute float aBody;\nattribute float aDark;\nvarying float vBody;\nvarying float vDark;\nvarying vec3 vPosO;\nvarying vec3 vNormalO;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBody = aBody; vDark = aDark; vPosO = position; vNormalO = normal;');
    s.fragmentShader = 'varying float vBody;\nvarying float vDark;\nvarying vec3 vPosO;\nvarying vec3 vNormalO;\nuniform float uNight;\n' +
      s.fragmentShader
        .replace('#include <map_fragment>', `vec2 suv = vec2(atan(vPosO.x, vPosO.z - 0.1) * 18.0 / 6.2831853, (vPosO.y - ${Y0}) / 0.78);\n  vec3 sc = texture2D(map, suv).rgb;\n  diffuseColor.rgb *= mix(vec3(1.0), sc, vBody);\n  diffuseColor.rgb *= (1.0 - 0.88 * vDark);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 stoneNormal = normalize(vNormalO);
          float frontLight = max(dot(stoneNormal, normalize(vec3(3.2, 1.0, 4.9) - vPosO)), 0.0);
          float backLight = max(dot(stoneNormal, normalize(vec3(-3.0, 1.3, -3.5) - vPosO)), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * uNight * (0.09 + 0.43 * frontLight + 0.27 * backLight);`);
  };
  mat.customProgramCacheKey = () => 'merlionStone';
  const stone = new THREE.Mesh(geo, mat);
  stone.name = 'merlion-sculpture';
  stone.scale.y = 8.6 / (top - Y0);
  stone.position.y = Y0 * (1 - stone.scale.y);
  stone.castShadow = stone.receiveShadow = true;
  g.add(stone, plinthMesh());
  // 从头的局部坐标转换到雕像坐标，并同步雕像的垂直比例。
  const v = -0.40, w = 1.47;
  g.userData.mouth = [0, stone.position.y + (PY + v * CT + w * ST) * stone.scale.y, PZ - v * ST + w * CT];
  g.scale.setScalar(scale);
  return g;
}

/** 从狮口喷出的水束，离口后逐渐散开，水纹随水流方向移动。 */
export function merlionWater([x, y, z]) {
  const points = Array.from({ length: 19 }, (_, i) => {
    const t = i / 18;
    return new THREE.Vector3(x, y + 1.55 * t - (y + 1.47) * t * t, z + 14.5 * t);
  });
  const arc = new THREE.CatmullRomCurve3(points);
  const segments = 48, rim = 10;
  const geometry = new THREE.TubeGeometry(arc, segments, 1, rim);
  const positions = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const center = arc.getPointAt(t);
    const radius = 0.115 + 0.21 * Math.pow(t, 1.25);
    for (let i = 0; i <= rim; i++) {
      const index = row * (rim + 1) + i;
      vertex.fromBufferAttribute(positions, index).sub(center).multiplyScalar(radius).add(center);
      positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 jetUV;
      varying float facing;
      void main() {
        jetUV = uv;
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        facing = max(dot(normalize(normalMatrix * normal), normalize(-p.xyz)), 0.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `uniform float time;
      varying vec2 jetUV;
      varying float facing;
      float randomCell(vec2 cell) {
        return fract(sin(dot(vec2(cell.x, mod(cell.y, 12.0)), vec2(127.1, 311.7))) * 43758.5453);
      }
      float flowNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(p));
        return mix(mix(randomCell(cell), randomCell(cell + vec2(1.0, 0.0)), f.x),
                   mix(randomCell(cell + vec2(0.0, 1.0)), randomCell(cell + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float t = jetUV.x;
        vec2 grainUV = vec2(t * 126.0 - time * 29.0, jetUV.y * 12.0);
        float detail = 1.0 - smoothstep(0.5, 1.4, fwidth(grainUV.x));
        float grain = (flowNoise(grainUV) - 0.5) * detail;
        float foam = smoothstep(0.08, 0.92, facing + 0.31 * grain);
        float opacity = (0.22 + 0.73 * foam) * (1.0 - 0.42 * smoothstep(0.54, 1.0, t));
        gl_FragColor = vec4(mix(vec3(0.37, 0.58, 0.71), vec3(0.91, 0.96, 1.0), foam), opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(geometry, material);
  water.name = 'merlion-water';
  water.onBeforeRender = () => { material.uniforms.time.value = (performance.now() % 100000) / 1000; };
  return water;
}
