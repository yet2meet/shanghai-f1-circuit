// F1 赛车模型（2026 规则的大致比例）：车长 5.6 m、轴距 3.4 m、宽 1.9 m、轮径 0.72 m。
// 车身用“截面放样”生成：沿车长方向给出一串超椭圆截面（宽、高、中心高度），连成光滑的鼻锥—座舱—发动机盖。
// 返回按材质分组的几何体，赛道上的车和车库里的车共用同一套。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 截面放样：sections = [{ z, w, h, y, p, x }]，p 为超椭圆指数（2=椭圆，越大越方） */
function loft(sections, seg = 20) {
  const pos = [], idx = [];
  const ring = (s) => {
    const a = s.w / 2, b = s.h / 2, p = s.p ?? 2.6, x0 = s.x ?? 0;
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
      pos.push(x0 + a * Math.sign(c) * Math.abs(c) ** (2 / p), s.y + b * Math.sign(sn) * Math.abs(sn) ** (2 / p), s.z);
    }
  };
  sections.forEach(ring);
  for (let k = 0; k < sections.length - 1; k++) {
    for (let i = 0; i < seg; i++) {
      const a = k * seg + i, b = k * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 两端封口
  for (const [k, flip] of [[0, true], [sections.length - 1, false]]) {
    const s = sections[k], ci = pos.length / 3;
    pos.push(s.x ?? 0, s.y, s.z);
    for (let i = 0; i < seg; i++) {
      const a = k * seg + i, b = k * seg + ((i + 1) % seg);
      flip ? idx.push(ci, b, a) : idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** 翼型截面沿 x 方向拉伸成翼片：chord 弦长、thick 厚度、aoa 迎角（弧度） */
function airfoil(span, chord, thick, aoa, x, y, z) {
  const s = new THREE.Shape();
  const n = 10;
  for (let i = 0; i <= n; i++) { const t = i / n; s.lineTo(t * chord, thick * 4 * t * (1 - t) * (1 - 0.3 * t)); }
  for (let i = n; i >= 0; i--) { const t = i / n; s.lineTo(t * chord, -thick * 0.6 * 4 * t * (1 - t)); }
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -span / 2);
  g.rotateY(Math.PI / 2);   // 拉伸方向改为 x（翼展），弦长沿 -z
  g.rotateX(-aoa); // 负值 = 后缘上翘
  g.translate(x, y, z);
  return g.toNonIndexed();
}

function tube(points, r, seg = 24) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(c, seg, r, 6, false).toNonIndexed();
}
function rod(a, b, r = 0.018) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g.toNonIndexed();
}
const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); return g.translate(x, y, z).toNonIndexed(); };
const clean = (geos) => mergeGeometries(geos.map((g) => { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); return c; }));

/** 轮胎：圆角矩形截面绕轴旋转；轴沿 x */
function tyre(width, x, z, r = 0.36) {
  const pts = [];
  const ri = 0.235, rr = 0.06;
  pts.push(new THREE.Vector2(ri, -width / 2));
  for (let i = 0; i <= 6; i++) { const t = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(t) * rr, -width / 2 + rr + Math.sin(t) * rr)); }
  for (let i = 0; i <= 6; i++) { const t = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(t) * rr, width / 2 - rr + Math.sin(t) * rr)); }
  pts.push(new THREE.Vector2(ri, width / 2));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(Math.PI / 2);
  return g.translate(x, r, z).toNonIndexed();
}
function disc(r, w, x, z, yc = 0.36) { const g = new THREE.CylinderGeometry(r, r, w, 24); g.rotateZ(Math.PI / 2); return g.translate(x, yc, z).toNonIndexed(); }
function ringStripe(xPos, z) { const g = new THREE.TorusGeometry(0.305, 0.012, 4, 36); g.rotateY(Math.PI / 2); return g.translate(xPos, 0.36, z).toNonIndexed(); }

let cache = null;
/** 车头朝 +z，地面 y = 0。返回 { paint, secondary, accent, carbon, tyre, rim, stripe, helmet, visor } */
export function f1CarGeometry() {
  if (cache) return cache;
  const FZ = 1.72, RZ = -1.68; // 前、后轴（轴距 3.4 m）
  // 主车身：鼻锥 → 座舱 → 发动机盖 → 车尾
  const body = loft([
    { z: 2.95, w: 0.16, h: 0.09, y: 0.27, p: 2.2 },
    { z: 2.6, w: 0.24, h: 0.15, y: 0.31, p: 2.4 },
    { z: 2.1, w: 0.34, h: 0.24, y: 0.38 },
    { z: 1.55, w: 0.46, h: 0.36, y: 0.46 },
    { z: 1.0, w: 0.58, h: 0.48, y: 0.52 },
    { z: 0.55, w: 0.70, h: 0.56, y: 0.56 },
    { z: 0.05, w: 0.80, h: 0.56, y: 0.55, p: 3 },
    { z: -0.45, w: 0.82, h: 0.66, y: 0.60, p: 3 },
    { z: -0.9, w: 0.62, h: 0.80, y: 0.66, p: 2.8 },
    { z: -1.45, w: 0.44, h: 0.60, y: 0.58 },
    { z: -2.0, w: 0.30, h: 0.38, y: 0.47 },
    { z: -2.45, w: 0.20, h: 0.22, y: 0.40 },
  ]);
  // 侧箱（左右）
  const pods = [-1, 1].map((s) => loft([
    { z: 0.62, w: 0.30, h: 0.34, y: 0.40, x: s * 0.52, p: 3.2 },
    { z: 0.3, w: 0.46, h: 0.42, y: 0.42, x: s * 0.57, p: 3.2 },
    { z: -0.3, w: 0.48, h: 0.40, y: 0.40, x: s * 0.55, p: 3 },
    { z: -0.95, w: 0.36, h: 0.32, y: 0.36, x: s * 0.47, p: 2.6 },
    { z: -1.6, w: 0.18, h: 0.20, y: 0.31, x: s * 0.33 },
  ], 16));
  // 发动机盖鳍片 + 进气口
  const fin = box(0.025, 0.34, 1.25, 0, 0.95, -1.45);
  const intake = loft([{ z: -0.42, w: 0.26, h: 0.24, y: 1.0, p: 2.2 }, { z: -0.55, w: 0.28, h: 0.26, y: 0.99, p: 2.2 }], 14);
  // 底板（俯视轮廓挤出）
  const fs = new THREE.Shape();
  [[-0.45, 1.25], [0.45, 1.25], [0.72, 0.75], [0.78, -1.2], [0.6, -2.2], [-0.6, -2.2], [-0.78, -1.2], [-0.72, 0.75]].forEach(([x, z], i) => (i ? fs.lineTo(x, -z) : fs.moveTo(x, -z)));
  const floor = new THREE.ExtrudeGeometry(fs, { depth: 0.035, bevelEnabled: false });
  floor.rotateX(-Math.PI / 2); floor.translate(0, 0.06, 0);
  // 前翼：三片翼 + 端板 + 鼻锥支柱
  const fw = [
    airfoil(1.78, 0.32, 0.022, -0.05, 0, 0.09, 3.18),
    airfoil(1.6, 0.18, 0.016, -0.32, 0, 0.16, 2.92),
    airfoil(1.5, 0.14, 0.014, -0.55, 0, 0.23, 2.78),
    box(0.02, 0.26, 0.5, 0.89, 0.18, 2.95), box(0.02, 0.26, 0.5, -0.89, 0.18, 2.95),
    box(0.03, 0.14, 0.08, 0.1, 0.18, 2.9), box(0.03, 0.14, 0.08, -0.1, 0.18, 2.9),
  ];
  // 尾翼：主翼 + DRS 襟翼 + 端板 + 鹅颈支架 + 梁翼；扩散器
  const rw = [
    airfoil(1.0, 0.3, 0.03, -0.12, 0, 0.84, -2.42),
    airfoil(1.0, 0.18, 0.02, -0.55, 0, 0.98, -2.62),
    box(0.02, 0.62, 0.62, 0.51, 0.78, -2.58), box(0.02, 0.62, 0.62, -0.51, 0.78, -2.58),
    box(0.03, 0.42, 0.05, 0, 0.66, -2.42),
    airfoil(0.8, 0.16, 0.016, -0.2, 0, 0.42, -2.3),
    box(1.0, 0.03, 0.42, 0, 0.16, -2.35, 0.32),
  ];
  // Halo
  const halo = [
    tube([[-0.27, 0.80, -0.38], [-0.3, 0.9, -0.05], [-0.18, 0.95, 0.25], [0, 0.96, 0.36], [0.18, 0.95, 0.25], [0.3, 0.9, -0.05], [0.27, 0.80, -0.38]], 0.024, 30),
    tube([[0, 0.96, 0.36], [0, 0.86, 0.5], [0, 0.72, 0.6]], 0.026, 8),
  ];
  // 后视镜
  const mirrors = [-1, 1].flatMap((s) => [box(0.12, 0.05, 0.03, s * 0.47, 0.78, 0.42), rod([s * 0.36, 0.66, 0.42], [s * 0.45, 0.76, 0.42], 0.01)]);
  // 悬挂（上下叉臂 + 推杆/拉杆）
  const susp = [];
  for (const [z, wx] of [[FZ, 0.8], [RZ, 0.79]]) for (const s of [-1, 1]) {
    const hub = [s * (wx - 0.12), 0.36, z];
    susp.push(rod([s * 0.2, 0.52, z + 0.25], [hub[0], 0.5, z]), rod([s * 0.2, 0.52, z - 0.25], [hub[0], 0.5, z]));
    susp.push(rod([s * 0.2, 0.3, z + 0.28], [hub[0], 0.24, z]), rod([s * 0.2, 0.3, z - 0.28], [hub[0], 0.24, z]));
    susp.push(rod([s * 0.22, 0.6, z - 0.1], [hub[0], 0.26, z], 0.014));
  }
  // 车轮：前轮宽 0.30、后轮 0.375；轮毂罩 + 胎侧色环
  const wheels = [[0.8, FZ, 0.3], [-0.8, FZ, 0.3], [0.79, RZ, 0.375], [-0.79, RZ, 0.375]];
  const tyres = wheels.map(([x, z, w]) => tyre(w, x, z));
  const rims = wheels.flatMap(([x, z, w]) => [disc(0.235, w * 0.92, x, z), disc(0.12, w + 0.01, x, z)]);
  const stripes = wheels.flatMap(([x, z, w]) => [ringStripe(x + w / 2 + 0.002, z), ringStripe(x - w / 2 - 0.002, z)]); // 胎侧两面各一圈
  // 车手头盔（白色）与深色护目镜
  const helmet = new THREE.SphereGeometry(0.135, 16, 12).translate(0, 0.86, -0.12).toNonIndexed();
  const visor = new THREE.SphereGeometry(0.137, 16, 6, -0.9, 1.8, 1.25, 0.4).translate(0, 0.86, -0.12).toNonIndexed();

  cache = {
    paint: clean([body, ...pods]),
    secondary: clean([fin, ...halo]),
    accent: clean([fw[3], fw[4], rw[2], rw[3]]),
    carbon: clean([floor, intake, fw[0], fw[1], fw[2], fw[5], fw[6], rw[0], rw[1], rw[4], rw[5], rw[6], ...mirrors, ...susp]),
    tyre: clean(tyres),
    rim: clean(rims),
    stripe: clean(stripes),
    helmet: clean([helmet]),
    visor: clean([visor]),
  };
  return cache;
}

/** 材质（每支车队一套涂装：主色 / 副色 / 点缀色） */
export function carMaterials(team, floodlit) {
  const L = team.livery || [team.color, '#1b1b1f', team.color];
  const paint = (c, r = 0.32) => floodlit(new THREE.MeshPhysicalMaterial({ color: c, roughness: r, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }), 0.6);
  return {
    paint: paint(L[0]), secondary: paint(L[1]), accent: paint(L[2]),
    carbon: floodlit(new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.38, metalness: 0.4 }), 0.15),
    tyre: new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.8 }),
    stripe: new THREE.MeshStandardMaterial({ color: team.compound || '#e10600', roughness: 0.6 }),
    helmet: paint('#f4f4f4', 0.25),
    visor: new THREE.MeshStandardMaterial({ color: '#0d0f14', roughness: 0.1, metalness: 0.9 }),
  };
}
