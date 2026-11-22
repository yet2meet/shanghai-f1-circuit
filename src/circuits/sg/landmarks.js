// 滨海湾的地标与赛道配套。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V, std, floodlit, lampMat, rng } from '../../util.js';
import { merlionStatue, merlionWater } from './merlion.js';
import { asGround } from '../../osm.js';

// 新加坡摩天轮（Singapore Flyer）：轮径 150 m、总高 165 m、28 个空调轿厢——
// 出处：新加坡摩天轮官网 singaporeflyer.com.sg/fact.html、Wikipedia、新加坡国家图书馆 Infopedia（三者一致；OSM 节点同为 165 m）。
// 位置与轮面方向取自 OSM 中 attraction=big_wheel 的轮廓（tools/gen-sg.mjs）。
// 主轴、双柱与四组拉索依据《The Arup Journal 2/2008》；地面锚点为示意。
export function buildFlyer(scene, { c, ax }) {
  const R = 75, TOP = 165, HUB = TOP - R, N = 28;
  const g = new THREE.Group();
  g.name = 'flyer';
  g.position.set(c[0], 0, -c[1]);
  g.rotation.y = Math.atan2(ax[1], ax[0]); // 局部 +X 沿轮面（OSM 轮廓长轴）
  const steel = std('#e9ecf0', { roughness: 0.4, metalness: 0.5 }, 0.3);
  const rims = [];
  for (const z of [-2.2, 2.2]) rims.push(new THREE.TorusGeometry(R - 1.5, 0.9, 6, 120).translate(0, HUB, z));
  const ringSteel = lampMat('#e9ecf0', '#bedbfa', 0.40, { roughness: 0.4, metalness: 0.5 });
  const ring = new THREE.Mesh(mergeGeometries(rims), ringSteel);
  ring.castShadow = true;
  g.add(ring);
  // 辐条：从轮毂到轮缘的拉索
  const cables = [];
  for (let k = 0; k < N * 2; k++) {
    const a = (k / (N * 2)) * Math.PI * 2;
    for (const z of [-2.2, 2.2]) cables.push(0, HUB, z * 0.3, Math.cos(a) * (R - 1.5), HUB + Math.sin(a) * (R - 1.5), z);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cables, 3));
  g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#c3c8cf', transparent: true, opacity: 0.55 })));
  // 轿厢
  const glass = lampMat('#9fc2d6', '#cfe8ff', 0.9, { roughness: 0.15, metalness: 0.5 });
  const cap = new THREE.InstancedMesh(new THREE.CapsuleGeometry(1.9, 3.2, 4, 10).rotateX(Math.PI / 2), glass, N); // 长轴沿轮厚方向
  const m = new THREE.Matrix4();
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    cap.setMatrixAt(k, m.makeTranslation(Math.cos(a) * (R + 1.2), HUB + Math.sin(a) * (R + 1.2), 0));
  }
  cap.castShadow = true;
  g.add(cap);
  // 主轴跨过轮面，两端分别落在一根主柱上。
  const spindleLength = 25.25, spindleRadius = 1.3, columnRadius = 1.425;
  const columnOffset = spindleLength / 2 - columnRadius;
  const columnHeight = HUB - spindleRadius / 2;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 9, 16).rotateX(Math.PI / 2).translate(0, HUB, 0), steel));
  const supports = [new THREE.CylinderGeometry(spindleRadius, spindleRadius, spindleLength, 16).rotateX(Math.PI / 2).translate(0, HUB, 0)];
  const stays = [];
  for (const side of [-1, 1]) {
    supports.push(new THREE.CylinderGeometry(columnRadius, columnRadius, columnHeight, 16).translate(0, columnHeight / 2, side * columnOffset));
    // 每侧两组斜拉索，每组六根，从轴端连到地面锚点。
    for (const anchor of [-34, 34]) for (let cable = 0; cable < 6; cable++) {
      const offset = (cable - 2.5) * 0.18;
      stays.push(offset, HUB, side * columnOffset, anchor + offset, 0, side * 38);
    }
  }
  const support = new THREE.Mesh(mergeGeometries(supports), steel);
  support.castShadow = true;
  g.add(support);
  const stayGeometry = new THREE.BufferGeometry();
  stayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stays, 3));
  g.add(new THREE.LineSegments(stayGeometry, new THREE.LineBasicMaterial({ color: '#aab2be', transparent: true, opacity: 0.45 })));
  scene.add(g);
  return g;
}

/**
 * 鱼尾狮（Merlion）主像：位置取自 OSM Merlion Fountain，高度 8.6 m 取自新加坡旅游局。
 * 水柱从狮口喷向滨海湾，雕塑细节按实拍照片近似建模。
 * @param at  { c: [x, n] 主像位置, toward: [x, n] 面向的点 }
 */
export function buildMerlion(scene, { c, toward }) {
  const root = new THREE.Group();
  root.name = 'merlion';
  const main = merlionStatue(1);
  main.position.set(c[0], 0, -c[1]);
  main.rotation.y = Math.atan2(toward[0] - c[0], -(toward[1] - c[1]));
  main.add(merlionWater(main.userData.mouth));
  root.add(main);
  scene.add(root);
  return root;
}

/**
 * 金沙空中花园（SkyPark）：OSM 里是一块 14 m 厚的整体平台（min_height 193 → 207 m）。
 * 平台顶上加：150 m 长的无边泳池（长度出自公开介绍，位置取塔楼 3 一侧，示意）、边缘灯带、屋顶绿化。
 */
export function buildSkyParkDetail(scene, { deck, tower3 }) {
  const P = []; for (let i = 0; i < deck.p.length; i += 2) P.push([deck.p[i], -deck.p[i + 1]]);   // (x, z)
  let cx = 0, cz = 0; for (const [x, z] of P) { cx += x / P.length; cz += z / P.length; }
  let sxx = 0, sxz = 0, szz = 0; for (const [x, z] of P) { const dx = x - cx, dz = z - cz; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity; for (const [x, z] of P) { const u = (x - cx) * ux + (z - cz) * uz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
  const len = u1 - u0, y = deck.h;
  const endSign = ((tower3[0] - cx) * ux + (-tower3[1] - cz) * uz) >= 0 ? 1 : -1;    // 塔楼 3 在轴的哪一端
  const poolU = endSign * (len / 2 - 75 - 22);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(150, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#46c8ff', emissive: '#1fa6e8', emissiveIntensity: 0.5, roughness: 0.08, metalness: 0.3 }));
  pool.position.set(cx + ux * poolU, y + 0.12, cz + uz * poolU); pool.rotation.y = -ang;
  scene.add(pool);
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P.map(([x, z]) => new THREE.Vector3(x, y + 0.5, z))), new THREE.LineBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0.9 }));
  scene.add(edge);
  const rand = rng(193);
  const inPoly = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
  const trees = [];
  for (let tries = 0; trees.length < 90 && tries < 4000; tries++) {
    const u = u0 + rand() * len, v = (rand() - 0.5) * 38;
    const x = cx + ux * u - uz * v, z = cz + uz * u + ux * v;
    const lu = u - poolU - 0, lv = v; // 泳池在轴上 poolU 处（以 cx 为原点），宽 16 m、长 150 m
    if (!inPoly(x, z) || (Math.abs((x - cx) * ux + (z - cz) * uz - poolU) < 82 && Math.abs(-(x - cx) * uz + (z - cz) * ux) < 11)) continue;
    void lu; void lv;
    trees.push([x, z]);
  }
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), floodlit(new THREE.MeshStandardMaterial({ color: '#4f9a58', roughness: 1, flatShading: true }), 0.08), trees.length);
  const m4 = new THREE.Matrix4();
  trees.forEach(([x, z], i) => { const r = 1.6 + rand() * 1.4; im.setMatrixAt(i, m4.makeScale(r, r * 1.1, r).setPosition(x, y + 1.5 + r * 0.5, z)); });
  im.castShadow = true;
  scene.add(im);
}

/**
 * 滨海湾花园的超级树（Supertree Grove）：OSM 有树丛的轮廓，没有逐棵的位置，所以在轮廓内按间距示意 12 棵
 * （树丛共 12 棵；高度 25–50 m 取自官方介绍）。夜里树冠发光。
 */
export function buildSupertrees(scene, groveFlat) {
  const P = []; for (let i = 0; i < groveFlat.length; i += 2) P.push([groveFlat[i], -groveFlat[i + 1]]);
  const rand = rng(12);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const inside = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < ((P[j][0] - P[i][0]) * (z - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
  const spots = [];
  for (let tries = 0; spots.length < 12 && tries < 6000; tries++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (inside(x, z) && spots.every(([a, b]) => Math.hypot(a - x, b - z) > 24)) spots.push([x, z]);
  }
  const trunkMat = floodlit(new THREE.MeshStandardMaterial({ color: '#6d5a6e', roughness: 0.9 }), 0.25);
  const garden = floodlit(new THREE.MeshStandardMaterial({ color: '#4d8f5a', roughness: 1 }), 0.15);
  const canopyMat = lampMat('#7a4f8f', '#d27cf0', 1.6, { roughness: 0.5, side: THREE.DoubleSide });
  for (const [x, z] of spots) {
    const h = 25 + rand() * 25, r = 9 + (h - 25) * 0.16;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.4, h, 12, 1, true), trunkMat); trunk.position.y = h / 2; trunk.castShadow = true;
    const vines = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 3.7, h * 0.82, 12, 1, true), garden); vines.position.y = h * 0.41 + 1.5;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(r, 2.2, h * 0.28, 24, 1, true), canopyMat); canopy.position.y = h + h * 0.04; canopy.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.5, 6, 32).rotateX(Math.PI / 2), canopyMat); rim.position.y = h + h * 0.18;
    g.add(trunk, vines, canopy, rim);
    scene.add(g);
  }
  return spots.length;
}

/**
 * 起终点线与发车格。位置依据官方 Circuit Park Map：起终点线（格子旗标记）在起终点直道上、19 号弯出弯之后，
 * 约占 19 号弯 → 1 号弯这段直道的 28%（该图不按比例绘制，是近似位置）；发车格按 F1 常规——22 个车位，
 * 左右交错、前后相隔 8 m、杆位在线后 8 m，杆位在哪一侧官方资料没有写，取 1 号左弯的内侧（左）示意。
 * 弯道里的车位（曲率大处）不画，所以实际画出的车位数可能少于 22。
 */
export function buildStartGrid(scene, track, turns, frac = 0.28, { startTurn = 19, slots: slotCount = 22 } = {}) {
  const N = track.N, mPer = track.total / N, hw = track.hw;
  const idx = (n) => { const [, x, y] = turns.find((t) => t[0] === n); return track.nearest(x, -y); };
  const a = idx(startTurn), b = idx(1);
  const iL = (a + Math.round(((b - a + N) % N) * frac)) % N;
  const up = new THREE.Vector3(0, 1, 0);
  const basis = (k, lateral, y) => {
    const P = track.pts[k], nor = track.nor[k], tan = track.tan[k];
    return new THREE.Matrix4().makeBasis(nor, up, tan).setPosition(P.x + nor.x * lateral, y, P.z + nor.z * lateral);
  };
  // 起终点线：黑白格
  const checker = canvasTexLocal(128, 32, (c, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; c.fillRect((i * w) / 16, (j * h) / 4, w / 16, h / 4); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw - 0.9, 1.2).rotateX(-Math.PI / 2), floodlit(new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6, transparent: true, depthWrite: false }), 0.9));
  line.applyMatrix4(basis(iL, 0, 0.215)); line.renderOrder = -0.9;
  scene.add(line);
  // 发车格：白色外框
  const box = canvasTexLocal(64, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#ffffff'; c.fillRect(5, h * 0.82, w - 10, 6); });
  const slots = [];
  for (let k = 0; k < slotCount; k++) {
    const at = (iL - Math.round((8 + 8 * k) / mPer) + N) % N;
    if (Math.abs(track.curv[at]) > 0.004) continue;
    slots.push(basis(at, (k % 2 === 0 ? 1 : -1) * 2.6, 0.212));
  }
  const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 6).rotateX(-Math.PI / 2), floodlit(new THREE.MeshStandardMaterial({ map: box, roughness: 0.6, transparent: true, depthWrite: false }), 0.9), slots.length);
  slots.forEach((m, i) => gm.setMatrixAt(i, m));
  gm.renderOrder = -0.9; gm.frustumCulled = false;
  scene.add(gm);
  return { index: iL, slots: slots.length };
}
function canvasTexLocal(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
