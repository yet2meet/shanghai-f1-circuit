// 维修楼（Pit Building）：按 OpenStreetMap 轮廓（长 322 m、进深 31 m、高 12 m，正面朝赛道）程序化建模。
//   一层：33 个车库开间（11 支车队 × 3 间），开门可见地坪、队色背墙、天花灯、赛车、轮胎架、工具柜、监控屏
//   二层：车队办公，带形窗 + 竖向窗框
//   三层：围场俱乐部玻璃幕墙 + 外挑观景阳台（玻璃栏板、扶手）
//   屋顶：挑檐、灯带、檐下筒灯、屋面设备
//   维修通道：各队停车位标线、头顶灯架、轮胎堆
// 车库按 2026 赛季车库顺序排列（data.js 中的 TEAMS），冠军车队靠近维修通道入口（16 号弯一端）。
// 车队名称牌用文字绘制；如在 public/brand/manifest.json 中提供了授权的车队标志，会自动替换上去。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM_STANDS } from './osm-data.js';
import { TEAMS } from './data.js';
import { V, rng, std, floodlit, lampMat, canvasTex, nightEmissives } from './util.js';

/** 车队名称牌纹理：队色底 + 队名；有授权标志时左侧绘制标志 */
function teamSign(team, brand) {
  const W = 1024, Hc = 128;
  const draw = (c, logo) => {
    c.fillStyle = team.color; c.fillRect(0, 0, W, Hc);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, Hc - 10, W, 10);
    let x = W / 2;
    if (logo) { const h = Hc - 28, w = (logo.width / logo.height) * h; c.drawImage(logo, 40, 14, w, h); x = 40 + w + (W - 40 - w) / 2; }
    c.fillStyle = team.text; c.font = '700 64px "Helvetica Neue", Arial, "PingFang SC", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(team.name.toUpperCase(), x, Hc / 2 + 2, W - (logo ? x - W / 2 + 120 : 80));
  };
  const tex = canvasTex(W, Hc, (c) => draw(c, null));
  const file = brand?.teams?.[team.id];
  if (file) {
    const img = new Image();
    img.onload = () => { draw(tex.image.getContext('2d'), img); tex.needsUpdate = true; };
    img.src = './brand/' + file;
  }
  return tex;
}
const UP = new THREE.Vector3(0, 1, 0);

/** 批量实例：add(x,y,z, sx,sy,sz, rotY, color) 使用局部坐标 */
function batch(geo, mat, G) {
  const list = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, color = null) {
      q.setFromAxisAngle(UP, ry);
      list.push([m.compose(p.set(x, y, z), q, s.set(sx, sy, sz)).clone().premultiply(G.matrixWorld), color]);
    },
    build(shadow = true) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const c = new THREE.Color();
      list.forEach(([mm, col], i) => { im.setMatrixAt(i, mm); if (col) im.setColorAt(i, c.set(col)); });
      im.castShadow = shadow; im.receiveShadow = true;
      return im;
    },
  };
}

function carGeometry() {
  const b = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const wheel = (x, z, r) => { const g = new THREE.CylinderGeometry(r, r, 0.4, 16); g.rotateZ(Math.PI / 2); return g.translate(x, r, z); };
  const body = mergeGeometries([
    b(0.8, 0.45, 3.4, 0, 0.42, -0.1), b(0.45, 0.28, 1.8, 0, 0.32, 2.3), b(1.7, 0.42, 1.7, 0, 0.38, -0.45),
    b(0.32, 0.55, 1.2, 0, 0.85, -0.9), b(0.05, 0.5, 1.4, 0, 1.05, -1.7),
  ]);
  const dark = mergeGeometries([
    b(1.95, 0.06, 0.55, 0, 0.12, 3.0), b(1.6, 0.06, 0.45, 0, 0.95, -2.45), b(0.06, 0.65, 0.55, 0.78, 0.65, -2.45), b(0.06, 0.65, 0.55, -0.78, 0.65, -2.45),
    b(1.4, 0.05, 0.9, 0, 0.1, -2.1), b(0.06, 0.06, 0.9, 0, 0.98, 0.55),
    wheel(0.86, 1.8, 0.33), wheel(-0.86, 1.8, 0.33), wheel(0.9, -1.75, 0.36), wheel(-0.9, -1.75, 0.36),
  ]);
  return { body, dark };
}

export function buildPitBuilding(scene, brand = null) {
  const P = OSM_STANDS.P[0];
  const f = new THREE.Vector3(P.f[0], 0, -P.f[1]).normalize();
  const G = new THREE.Group();
  G.position.copy(V(P.front[0], P.front[1]));
  G.rotation.y = Math.atan2(-f.x, -f.z); // 局部 -z 朝向赛道
  G.updateMatrixWorld(true);
  const L = P.L, D = P.D, H = 12;
  const rand = rng(3301);

  // 材质
  const concreteTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#eceef1'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 222 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 2},0.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.strokeStyle = 'rgba(150,155,162,0.35)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }, [1, 1]);
  const concrete = std('#ffffff', { map: concreteTex, roughness: 0.75 }, 0.16);
  const white = std('#f4f5f7', { roughness: 0.5 }, 0.16);
  const darkMetal = std('#2b2e34', { roughness: 0.4, metalness: 0.6 }, 0.08);
  const steel = std('#c7ccd3', { roughness: 0.3, metalness: 0.7 }, 0.3);
  const glass = new THREE.MeshStandardMaterial({ color: '#6e8ea8', roughness: 0.06, metalness: 0.85, envMapIntensity: 1.4, emissive: '#ffd59a', emissiveIntensity: 0 });
  nightEmissives.push({ m: glass, max: 0.55 }); // 夜间透出室内灯光
  const glassRail = new THREE.MeshStandardMaterial({ color: '#d5e6f2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const epoxy = std('#d5d8dc', { roughness: 0.35 }, 0.1);
  const panel = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.3, roughness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: '#0b1726', emissive: '#2c6fd6', emissiveIntensity: 0.9, roughness: 0.2 });
  const tyreMat = std('#16171a', { roughness: 0.9 }, 0.05);
  const teamMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2 }), 0.5);
  const doorTex = canvasTex(64, 256, (c, w, h) => {
    c.fillStyle = '#c9cdd3'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(80,85,92,0.45)'; c.fillRect(0, y, w, 2); }
  });
  const doorMat = std('#ffffff', { map: doorTex, roughness: 0.5, metalness: 0.4 }, 0.15);
  const add = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; G.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ── 主体结构 ──
  const GD = 16; // 车库进深
  add(box(L, 0.12, D), epoxy, 0, 0.06, D / 2, false);              // 一层地坪
  add(box(L, 0.8, D - 0.6), concrete, 0, 6.0, D / 2 + 0.3);         // 二层楼板
  add(box(L, 0.35, D + 3.6), concrete, 0, 9.25, D / 2 - 1.8);       // 三层楼板 + 外挑阳台
  add(box(L + 2, 0.55, D + 6.5), white, 0, 12.6, D / 2 - 3.25);     // 屋面 + 前挑檐
  add(box(L + 2, 1.1, 0.35), white, 0, 12.45, -4.8);                // 挑檐封边
  add(box(L, 0.12, 0.06), lampMat('#ffffff', '#e8f2ff', 2.5), 0, 11.92, -4.98, false); // 封边灯带
  add(box(L, 12, 0.4), concrete, 0, 6, D - 0.2);                    // 背立面
  add(box(L, 5.6, 0.25), concrete, 0, 2.8, GD + 0.12);              // 车库背墙（结构）
  for (const sx of [-1, 1]) add(box(0.5, 12.9, D), concrete, sx * (L / 2 - 0.25), 6.45, D / 2); // 两端山墙
  // 二层：实墙 + 带形窗
  add(box(L, 2.8, 0.35), concrete, 0, 7.8, 0.6);
  add(box(L - 1, 1.3, 0.08), glass, 0, 7.85, 0.4, false);
  // 三层：通高玻璃幕墙（退后 0.4 m）
  add(box(L - 1, 2.75, 0.1), glass, 0, 10.85, 0.5, false);
  add(box(L - 1, 0.1, 0.16), steel, 0, 11.3, 0.42, false);          // 幕墙横梃
  // 背立面窗带
  add(box(L - 6, 1.3, 0.1), glass, 0, 7.8, D + 0.02, false);
  add(box(L - 6, 1.3, 0.1), glass, 0, 10.9, D + 0.02, false);
  // 阳台玻璃栏板 + 扶手
  const rail = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.05), glassRail);
  rail.position.set(0, 9.95, -3.55); G.add(rail);
  const hand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, L, 6), steel);
  hand.rotation.z = Math.PI / 2; hand.position.set(0, 10.5, -3.55); G.add(hand);
  // 挑檐支撑斜杆（每两个开间一根）
  const strut = batch(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), steel, G);

  // ── 车库开间 ──
  const bayW = 9.4;
  const nB = Math.floor((L - 8) / bayW);
  const x0 = -(nB * bayW) / 2;
  // 维修通道入口在 n 较小的一端（16 号弯）：第 0 个开间放在离入口最近的一端
  const endPlus = new THREE.Vector3(L / 2, 0, 0).applyMatrix4(G.matrixWorld);
  const endMinus = new THREE.Vector3(-L / 2, 0, 0).applyMatrix4(G.matrixWorld);
  const plusIsEntry = -endPlus.z < -endMinus.z;
  const bayX = (k) => (plusIsEntry ? -1 : 1) * (x0 + (k + 0.5) * bayW);
  const pier = batch(box(0.7, 1, 0.9), concrete, G);
  const mull = batch(box(0.07, 1, 0.16), steel, G);
  const backPanel = batch(box(1, 1, 0.08), teamMat, G);
  const partition = batch(box(0.25, 5.6, GD), concrete, G);
  const lights = batch(box(1.3, 0.06, 0.5), panel, G);
  const drum = batch(new THREE.CylinderGeometry(0.32, 0.32, 1, 12).rotateZ(Math.PI / 2), darkMetal, G);
  const doors = batch(box(1, 5.1, 0.12), doorMat, G);
  const cabinets = batch(box(1.6, 1.0, 0.6), darkMetal, G);
  const cabinetTop = batch(box(1.62, 0.06, 0.62), teamMat, G);
  const tv = batch(box(1.2, 0.72, 0.06), screen, G);
  const tvPost = batch(box(0.08, 1, 0.08), darkMetal, G);
  const tyre = batch(new THREE.CylinderGeometry(0.36, 0.36, 0.38, 14).rotateZ(Math.PI / 2), tyreMat, G);
  const blanket = batch(new THREE.CylinderGeometry(0.37, 0.37, 0.32, 14).rotateZ(Math.PI / 2), teamMat, G);
  const rack = batch(box(0.08, 1, 0.08), steel, G);
  const people = batch(new THREE.CapsuleGeometry(0.22, 1.05, 2, 6).translate(0, 0.75, 0), teamMat, G);
  const { body: carBody, dark: carDark } = carGeometry();
  const cars = batch(carBody, teamMat, G);
  const carParts = batch(carDark, std('#151619', { roughness: 0.5 }, 0.05), G);

  for (let k = 0; k <= nB; k++) {
    const x = x0 + k * bayW;
    pier.add(x, 6.2, 0.45, 1, 12.4, 1);
    if (k % 2 === 0 && k > 0 && k < nB) strut.add(x, 11.0, -2.2, 1, 3.6, 1, 0); // 竖向支撑
  }
  for (let x = -L / 2 + 0.8; x < L / 2; x += 1.6) {
    mull.add(x, 7.85, 0.42, 1, 1.3, 1);
    mull.add(x, 10.85, 0.45, 1, 2.75, 1);
  }
  for (let k = 0; k < nB; k++) {
    const team = TEAMS[Math.floor(k / 3)];
    if (!team) break;
    const color = team.color;
    const cx = bayX(k);
    const w = bayW - 0.7;
    const open = true;
    if (k % 3 === 0) {
      partition.add(cx - (plusIsEntry ? -1 : 1) * bayW / 2, 2.8, GD / 2, 1, 1, 1);
      // 整队门头名称牌（横跨 3 个开间）
      const sign = new THREE.Mesh(new THREE.BoxGeometry(bayW * 3 - 0.7, 1.15, 0.14), [
        concrete, concrete, concrete, concrete,
        floodlit(new THREE.MeshStandardMaterial({ map: teamSign(team, brand), roughness: 0.45 }), 0.6), concrete,
      ]);
      sign.rotation.y = Math.PI; // 贴图面朝赛道（局部 -z）
      sign.position.set(bayX(k + 1), 5.25, -0.05);
      G.add(sign);
    }
    // 队色背墙（下半）+ 白色上半由结构背墙承担
    backPanel.add(cx, 1.6, GD - 0.05, w, 3.2, 1, 0, color);
    for (const lz of [3, 7, 11]) for (const lx of [-2.2, 2.2]) lights.add(cx + lx, 5.55, lz);
    if (!open) { doors.add(cx, 2.6, 0.35, w, 1, 1); continue; }
    drum.add(cx, 5.3, 0.65, w, 1, 1);
    // 工具柜（沿背墙）
    for (const dx of [-3, -1.2, 0.6, 2.4]) { cabinets.add(cx + dx, 0.55, GD - 0.5); cabinetTop.add(cx + dx, 1.08, GD - 0.5, 1, 1, 1, 0, color); }
    // 轮胎架（两侧）
    for (const side of [-1, 1]) {
      const rx = cx + side * (w / 2 - 0.55);
      for (const rz of [3.2, 5.6, 8.0]) rack.add(rx, 1.4, rz, 1, 2.8, 1);
      for (let lv = 0; lv < 3; lv++) for (const tz of [3.7, 4.5, 5.3, 6.1, 6.9, 7.7]) {
        if (rand() < 0.2) continue;
        (lv === 0 ? tyre : blanket).add(rx, 0.45 + lv * 0.85, tz, 1, 1, 1, 0, lv === 0 ? null : color);
      }
    }
    // 两侧开间各停一辆赛车（车头朝维修通道），中间开间放监控屏
    if (k % 3 !== 1) {
      cars.add(cx, 0.12, 6.5, 1, 1, 1, Math.PI, color);
      carParts.add(cx, 0.12, 6.5, 1, 1, 1, Math.PI);
    } else {
      tvPost.add(cx, 1.2, 10.5, 1, 2.4, 1);
      for (const dx of [-1.9, -0.65, 0.65, 1.9]) tv.add(cx + dx, 2.2, 10.45);
      tvPost.add(cx, 1.2, 4.0, 1, 2.4, 1);
      for (const dx of [-0.65, 0.65]) tv.add(cx + dx, 2.2, 3.95);
    }
    // 技师
    const nP = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < nP; i++) people.add(cx + (rand() - 0.5) * 6, 0.12, 2 + rand() * 9, 1, 1, 1, 0, color);
  }
  // 屋面设备
  const hvac = batch(box(3.2, 1.6, 2.2), std('#b8bdc4', { roughness: 0.6, metalness: 0.3 }, 0.1), G);
  for (let i = 0; i < 26; i++) hvac.add((rand() - 0.5) * (L - 30), 13.7, 8 + rand() * 20, 1, 1, 1, rand() < 0.5 ? 0 : Math.PI / 2);
  // 檐下筒灯
  const down = batch(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10), lampMat('#ffffff', '#fff3d6', 3), G);
  for (let x = -L / 2 + 2; x < L / 2; x += 3.2) down.add(x, 12.3, -3.0);

  for (const b of [pier, mull, backPanel, partition, lights, drum, doors, cabinets, cabinetTop, tv, tvPost, tyre, blanket, rack, people, cars, carParts, hvac, down, strut]) G.add(b.build());
  // 让实例矩阵已含 G 的变换：把这些实例放到场景根节点下
  const inst = G.children.filter((c) => c.isInstancedMesh);
  inst.forEach((c) => G.remove(c));

  // ── 维修通道前：停车位标线、头顶灯架、轮胎堆 ──
  const lineMat = std('#f4f4f4', { roughness: 0.6 }, 0.9);
  lineMat.depthWrite = false;
  const marks = batch(box(1, 0.02, 1), lineMat, G);
  const marksTeam = batch(box(1, 0.02, 1), (() => { const m = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.8); m.depthWrite = false; return m; })(), G);
  const gPost = batch(box(0.18, 4.4, 0.18), darkMetal, G);
  const gBeam = batch(box(1, 0.35, 0.35), darkMetal, G);
  const gLight = batch(box(1, 0.12, 0.25), panel, G);
  const stackT = batch(new THREE.CylinderGeometry(0.37, 0.37, 0.34, 14), teamMat, G);
  for (let t = 0; t < TEAMS.length && t * 3 + 2 < nB; t++) {
    const color = TEAMS[t].color;
    for (const cx of [bayX(t * 3), bayX(t * 3 + 2)]) {
    // 停车位：白色外框 5 m × 7 m，中间队色引导线
    const bz = -5.5;
    marks.add(cx, 0.19, bz - 3.5, 5.2, 1, 0.18); marks.add(cx, 0.19, bz + 3.5, 5.2, 1, 0.18);
    marks.add(cx - 2.6, 0.19, bz, 0.18, 1, 7.18); marks.add(cx + 2.6, 0.19, bz, 0.18, 1, 7.18);
    marksTeam.add(cx, 0.2, bz, 0.35, 1, 6.6, 0, color);
    marksTeam.add(cx, 0.2, bz - 1.9, 1.6, 1, 0.35, 0, color);
    // 头顶灯架
    for (const sx of [-3.4, 3.4]) gPost.add(cx + sx, 2.2, bz - 3.8);
    gBeam.add(cx, 4.35, bz - 3.8, 7.2, 1, 1);
    gBeam.add(cx, 4.35, bz, 0.35, 1, 7.6);
    gLight.add(cx, 4.1, bz - 1.2, 3.2, 1, 1); gLight.add(cx, 4.1, bz + 1.2, 3.2, 1, 1);
    // 轮胎堆（套着轮胎保温毯）
    for (const sx of [-4.2, 4.2]) for (let h = 0; h < 4; h++) stackT.add(cx + sx, 0.2 + h * 0.36, -0.9, 1, 1, 1, 0, h % 2 ? color : '#1b1c1f');
    }
  }
  const pitItems = [marks, marksTeam, gPost, gBeam, gLight, stackT].map((b) => b.build());
  pitItems[0].renderOrder = pitItems[1].renderOrder = -0.95;
  pitItems[0].castShadow = pitItems[1].castShadow = false;

  // ── 领奖台：阳台中段外挑 ──
  const podium = new THREE.Group();
  podium.position.set(40, 0, 0);
  const red = std('#c8102e', { roughness: 0.5 }, 0.6);
  const plat = new THREE.Mesh(box(24, 0.5, 6), white); plat.position.set(0, 9.3, -6.4); plat.castShadow = true;
  const back = new THREE.Mesh(box(24, 2.6, 0.3), red); back.position.set(0, 10.9, -3.7);
  const prail = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.0), glassRail); prail.position.set(0, 10.0, -9.4);
  podium.add(plat, back, prail);
  [[0, 1.0], [-2.8, 0.7], [2.8, 0.45]].forEach(([x, h]) => { const b = new THREE.Mesh(box(2.4, h, 1.8), white); b.position.set(x, 9.55 + h / 2, -6.8); podium.add(b); });
  G.add(podium);

  scene.add(G);
  inst.forEach((c) => scene.add(c));
  pitItems.forEach((c) => scene.add(c));
  return { group: G, glass, front: V(P.front[0], P.front[1]), f, L, bayX, nB, toWorld: (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(G.matrixWorld) };
}
