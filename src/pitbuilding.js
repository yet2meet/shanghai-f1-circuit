// 维修楼（Pit Building）：按 OpenStreetMap 轮廓（长 322 m、进深 31 m、高 12 m，正面朝赛道）程序化建模，
// 外观依据实拍照片，车库数量依据施工报道（一层共 36 个车库）。
//   一层：36 个车库开间（11 支车队 × 3 间，余 3 间备用），车库内有赛车、队色背景墙、工作台、遥测屏、轮胎架、技师
//   车库层上方：黑白相间的广告带
//   二层：围场俱乐部，整面玻璃 + 两块大屏
//   屋顶：深灰檐口带 + 屋顶平台玻璃栏板 + 屋面设备
//   维修通道：各车停车位标线、头顶灯架、轮胎堆
// 车库按 2026 赛季车库顺序排列（data.js 中的 TEAMS），冠军车队靠近维修通道入口（16 号弯一端）。
// 车队名称牌用文字绘制；如在 public/brand/manifest.json 中提供了授权的车队标志，会自动替换上去。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OSM_STANDS } from './osm-data.js';
import { TEAMS } from './data.js';
import { f1CarGeometry } from './f1car.js';
import { V, rng, std, floodlit, lampMat, canvasTex, nightEmissives } from './util.js';
import { TRACK_POINTS } from './track-data.js';
import { crewGeo, tyreGeo, blanketGeo, tyreTex, blanketTex, hoseGeo, jackGeo, blobTex, garageFloorTex, garageCeilTex, garageWallTex } from './garagekit.js';
import { screenAtlas, screenGeo } from './pitscreens.js';

/** 单色标志在深色底上绘成白色剪影（真实车库在深色背景上也多用单色白标），浅色底保留原色；
 *  manifest.json 的 fullColor 列表中的彩色标志（迈凯伦、红牛、法拉利）始终保留原色：
 *  自带底色的直接圆角裁切绘制，透明底的放在一块白色圆角标牌上，保证在任何队色上都清晰 */
function luminance(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function opaqueCorner(img) {
  const o = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  o.canvas.width = img.width; o.canvas.height = img.height; o.drawImage(img, 0, 0);
  return o.getImageData(1, 1, 1, 1).data[3] > 200;
}
function drawLogo(c, img, x, y, w, h, bg, full = false) {
  if (full) {
    c.save();
    if (opaqueCorner(img)) { roundRect(c, x, y, w, h, Math.min(w, h) * 0.08); c.clip(); c.drawImage(img, x, y, w, h); }
    else {
      const p = Math.min(w, h) * 0.12;
      c.fillStyle = '#ffffff'; roundRect(c, x - p, y - p, w + 2 * p, h + 2 * p, p * 1.2); c.fill();
      c.drawImage(img, x, y, w, h);
    }
    c.restore();
    return;
  }
  if (luminance(bg) > 0.45) { c.drawImage(img, x, y, w, h); return; }
  const off = document.createElement('canvas'); off.width = Math.ceil(w); off.height = Math.ceil(h);
  const o = off.getContext('2d');
  o.drawImage(img, 0, 0, w, h);
  o.globalCompositeOperation = 'source-in'; o.fillStyle = '#ffffff'; o.fillRect(0, 0, w, h);
  c.drawImage(off, x, y);
}
const isFull = (brand, team) => !!brand?.fullColor?.includes(team.id);
/** 按比例放进一个框里 */
function fit(img, maxW, maxH) { const k = Math.min(maxW / img.width, maxH / img.height); return [img.width * k, img.height * k]; }

/** 车队名称牌纹理：队色底 + 队名；有授权标志时左侧绘制标志 */
function teamSign(team, brand) {
  const W = 1024, Hc = 128;
  const draw = (c, logo) => {
    c.fillStyle = team.color; c.fillRect(0, 0, W, Hc);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, Hc - 10, W, 10);
    let x = W / 2;
    if (logo) { const [w, h] = fit(logo, 300, Hc - 24); drawLogo(c, logo, 40, (Hc - h) / 2, w, h, team.color, isFull(brand, team)); x = 40 + w + (W - 40 - w) / 2; }
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

/** 车库背景墙：涂装主色底 + 副色斜带 + 点缀色细线 + 大字队名；有授权标志时放在左侧 */
function teamWall(team, brand) {
  const [c0, c1, c2] = team.livery || [team.color, '#1b1b1f', team.color];
  const W = 1024, Hc = 256;
  const draw = (c, logo) => {
    c.fillStyle = c0; c.fillRect(0, 0, W, Hc);
    c.fillStyle = c1; c.beginPath(); c.moveTo(W * 0.55, Hc); c.lineTo(W * 0.72, 0); c.lineTo(W, 0); c.lineTo(W, Hc); c.closePath(); c.fill();
    c.fillStyle = c2; c.beginPath(); c.moveTo(W * 0.5, Hc); c.lineTo(W * 0.67, 0); c.lineTo(W * 0.69, 0); c.lineTo(W * 0.52, Hc); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, Hc - 18, W, 18);
    let x = 60;
    if (logo) { const [w, h] = fit(logo, 330, Hc - 40); drawLogo(c, logo, 60, (Hc - h) / 2, w, h, c0, isFull(brand, team)); x = 60 + w + 50; }
    c.fillStyle = team.text; c.font = '800 92px "Helvetica Neue", Arial, sans-serif'; c.textBaseline = 'middle';
    c.fillText(team.name.toUpperCase(), x, Hc / 2, W * 0.5);
  };
  const tex = canvasTex(W, Hc, (c) => draw(c, null));
  const file = brand?.teams?.[team.id];
  if (file) { const img = new Image(); img.onload = () => { draw(tex.image.getContext('2d'), img); tex.needsUpdate = true; }; img.src = './brand/' + file; }
  return tex;
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
    c.fillStyle = '#c8cdd3'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 222 + Math.random() * 26; c.fillStyle = `rgba(${v},${v},${v + 2},0.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.strokeStyle = 'rgba(150,155,162,0.35)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }, [1, 1]);
  const concrete = std('#ffffff', { map: concreteTex, roughness: 0.75 }, 0.16);
  const white = std('#b9bfc7', { roughness: 0.4, metalness: 0.35 }, 0.16); // 银灰金属屋面与封边
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
  add(box(L, 12, 0.4), concrete, 0, 6, D - 0.2);                    // 背立面
  add(box(L, 5.6, 0.25), concrete, 0, 2.8, GD + 0.12);              // 车库背墙（结构）
  for (const sx of [-1, 1]) add(box(0.5, 12.2, D), concrete, sx * (L / 2 - 0.25), 6.1, D / 2); // 两端山墙
  add(box(L - 6, 4.0, 0.1), glass, 0, 9.0, D + 0.02, false);        // 背立面（面向围场）的长玻璃立面
  // 车库层上方的广告带（黑白相间）
  const bandTex = canvasTex(1024, 64, (c, w, h) => {
    const items = ['FORMULA 1', '中国大奖赛', 'CHINESE GRAND PRIX', '上海国际赛车场', 'SHANGHAI 2026', 'FORMULA 1'];
    const pw = w / items.length;
    items.forEach((s, i) => {
      c.fillStyle = i % 2 ? '#ffffff' : '#111114'; c.fillRect(i * pw, 0, pw, h);
      c.fillStyle = i % 2 ? '#111114' : '#ffffff'; c.font = '800 30px "Helvetica Neue", Arial, "PingFang SC", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, i * pw + pw / 2, h / 2 + 1, pw - 16);
    });
  }, [L / 60, 1]);
  const bandMat = floodlit(new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.5 }), 0.8);
  const band = new THREE.Mesh(box(L, 1.0, 0.25), [concrete, concrete, concrete, concrete, concrete, bandMat]);
  band.position.set(0, 6.35, -0.15); G.add(band);
  // 二层：围场俱乐部，整面玻璃（略退后）+ 横梃
  add(box(L - 1, 4.4, 0.1), glass, 0, 9.05, 0.5, false);
  add(box(L - 1, 0.1, 0.16), steel, 0, 9.4, 0.42, false);
  // 深灰檐口带 + 屋面（小挑檐）+ 屋顶平台玻璃栏板
  const canopyMat = std('#4a4f57', { roughness: 0.5, metalness: 0.4 }, 0.12);
  add(box(L + 1, 0.5, D + 2), white, 0, 11.9, D / 2 - 1);
  add(box(L + 1, 1.2, 0.4), canopyMat, 0, 11.6, -1.0);
  add(box(L, 0.1, 0.06), lampMat('#ffffff', '#e8f2ff', 2.5), 0, 11.0, -1.22, false);
  const roofRail = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.1), glassRail);
  roofRail.position.set(0, 12.75, -0.8); G.add(roofRail);
  // 二层两块大屏（实拍照片中可见）
  const tvTex = canvasTex(256, 144, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0d1b2e'); g.addColorStop(1, '#22344f');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e10600'; c.fillRect(0, h - 22, w, 22);
    c.fillStyle = '#fff'; c.font = '700 13px Arial'; c.fillText('LIVE · SHANGHAI', 10, h - 7);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '800 34px Arial'; c.textAlign = 'center'; c.fillText('F1', w / 2, h / 2 - 4);
  });
  for (const sx of [-0.25, 0.25]) {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), new THREE.MeshStandardMaterial({ map: tvTex, emissive: '#ffffff', emissiveMap: tvTex, emissiveIntensity: 0.9 }));
    scr.rotation.y = Math.PI; scr.position.set(sx * L, 9.1, -0.45);
    const frame = new THREE.Mesh(box(8.4, 4.9, 0.5), darkMetal); frame.position.set(sx * L, 9.1, -0.15);
    G.add(frame, scr);
  }
  const strut = batch(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), steel, G);

  // ── 车库开间 ──
  const nB = 36;                       // 上海赛车场比赛工作楼共 36 个车库
  const bayW = (L - 8) / nB;
  const x0 = -(nB * bayW) / 2;
  // 维修通道入口在 n 较小的一端（16 号弯）：第 0 个开间放在离入口最近的一端
  const endPlus = new THREE.Vector3(L / 2, 0, 0).applyMatrix4(G.matrixWorld);
  const endMinus = new THREE.Vector3(-L / 2, 0, 0).applyMatrix4(G.matrixWorld);
  const plusIsEntry = -endPlus.z < -endMinus.z;
  const bayX = (k) => (plusIsEntry ? -1 : 1) * (x0 + (k + 0.5) * bayW);
  const pier = batch(box(0.7, 1, 0.9), concrete, G);
  const mull = batch(box(0.07, 1, 0.16), steel, G);
  const partition = batch(box(0.25, 5.6, GD), concrete, G);
  const lights = batch(box(1.3, 0.06, 0.5), panel, G);
  const drum = batch(new THREE.CylinderGeometry(0.32, 0.32, 1, 12).rotateZ(Math.PI / 2), darkMetal, G);
  const doors = batch(box(1, 5.1, 0.12), doorMat, G);
  // 轮胎：带轮辋与胎壁配方色带的贴图（软 / 中 / 硬三种）；保温毯：带缝线与绑带的布面，按队色染色
  const rackTyreMat = std('#ffffff', { map: tyreTex(), roughness: 0.82 }, 0.12);
  const tyres = [0, 1, 2].map((i) => batch(tyreGeo(i).rotateZ(Math.PI / 2), rackTyreMat, G));
  const blanketMat = floodlit(new THREE.MeshStandardMaterial({ map: blanketTex(), roughness: 0.8 }), 0.5);
  const blanket = batch(blanketGeo().rotateZ(Math.PI / 2), blanketMat, G);
  const rack = batch(box(0.06, 1, 0.06), steel, G);
  const rackBar = batch(box(0.05, 0.05, 1), steel, G);
  // 工具车：抽屉纹理 + 队色框
  const drawerTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b2e34'; for (let i = 0; i < 6; i++) c.fillRect(4, 4 + i * 10, w - 8, 8);
    c.fillStyle = '#9aa1aa'; for (let i = 0; i < 6; i++) c.fillRect(w / 2 - 8, 7 + i * 10, 16, 2);
  });
  const trolley = batch(box(0.9, 1.0, 0.6).translate(0, 0.55, 0), floodlit(new THREE.MeshStandardMaterial({ map: drawerTex, roughness: 0.45, metalness: 0.3 }), 0.4), G);
  const trolleyTop = batch(box(0.94, 0.04, 0.64), steel, G);
  // 屏幕：四种专业界面（遥测 / 计时榜 / 赛道图 / 车辆状态）共用一张图集
  const teleTex = screenAtlas(TEAMS, TRACK_POINTS);
  const teleMat = new THREE.MeshStandardMaterial({ map: teleTex, emissive: '#ffffff', emissiveMap: teleTex, emissiveIntensity: 0.95, roughness: 0.3 });
  const screenB = [0, 1, 2, 3].map((i) => batch(screenGeo(i), teleMat, G));
  const bigScreenB = [0, 1, 2, 3].map((i) => batch(screenGeo(i, 1.5, 0.9), teleMat, G));
  const bigBack = batch(box(1.58, 0.98, 0.06), darkMetal, G);
  const screenBack = batch(box(0.94, 0.59, 0.05), darkMetal, G);
  const desk = batch(box(0.8, 0.05, 3.2), std('#e6e8eb', { roughness: 0.5 }, 0.15), G);
  const deskLeg = batch(box(0.05, 0.75, 0.05), darkMetal, G);
  const chair = batch(mergeGeometries([box(0.5, 0.08, 0.5).translate(0, 0.5, 0), box(0.5, 0.6, 0.06).translate(0, 0.8, 0.24), box(0.06, 0.5, 0.06).translate(0, 0.25, 0)]), darkMetal, G);
  const gantryBeam = batch(box(1, 0.18, 0.25), darkMetal, G);
  const hanger = batch(box(0.03, 1, 0.03), steel, G);
  const tray = batch(box(0.4, 0.08, 1), darkMetal, G);
  const hose = batch(hoseGeo(), floodlit(new THREE.MeshStandardMaterial({ roughness: 0.6 }), 0.4), G);
  const jack = batch(jackGeo(), darkMetal, G);
  const floorLine = batch(box(1, 0.012, 1), floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.4), G);
  // 技师：队服（按队色）+ 裤、鞋、耳机、皮肤；站立 / 俯身作业 / 坐在工作台前三种姿态
  const crewShirtMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 0.4);
  const crewRestMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }), 0.3);
  const crewB = {};
  for (const pose of ['stand', 'work', 'sit']) { const g = crewGeo(pose); crewB[pose] = { shirt: batch(g.shirt, crewShirtMat, G), rest: batch(g.rest, crewRestMat, G) }; }
  const SKINS = ['#f3d2b4', '#e8bc96', '#d29f78', '#a8714d', '#7a4e33'];
  // 烘焙明暗的地面 / 天花 / 侧墙（每队一块），以及物体脚下的软阴影
  const teamW = bayW * 3 - 0.25;
  const gFloor = batch(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), std('#ffffff', { map: garageFloorTex(teamW, GD, bayW), roughness: 0.32 }, 0.35), G);
  const gCeil = batch(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), std('#ffffff', { map: garageCeilTex(teamW, GD, bayW), roughness: 0.9 }, 0.5), G);
  const gWall = batch(new THREE.PlaneGeometry(1, 1), std('#ffffff', { map: garageWallTex(), roughness: 0.55 }, 0.4), G);
  const blob = batch(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), color: '#000000', transparent: true, opacity: 0.55, depthWrite: false }), G);
  const shade = (x, z, sx, sz) => blob.add(x, 0.152, z, sx, 1, sz);
  const person = (pose, x, z, ry, color) => {
    const h = pose === 'sit' ? 1 : 0.94 + rand() * 0.1;
    crewB[pose].shirt.add(x, 0.12, z, h, h, h, ry, color);
    crewB[pose].rest.add(x, 0.12, z, h, h, h, ry, SKINS[Math.floor(rand() * SKINS.length)]);
    shade(x, z, 1.0, 1.0);
  };
  // 赛车：与赛道上同一套精细模型，按材质分组实例化，逐车设置涂装颜色
  const carGeo = f1CarGeometry();
  const white0 = () => floodlit(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }), 0.5);
  const carB = {
    paint: batch(carGeo.paint, white0(), G), secondary: batch(carGeo.secondary, white0(), G), accent: batch(carGeo.accent, white0(), G),
    carbon: batch(carGeo.carbon, std('#16171a', { roughness: 0.38, metalness: 0.4 }, 0.1), G),
    tyre: batch(carGeo.tyre, tyreMat, G), rim: batch(carGeo.rim, std('#2a2c30', { roughness: 0.35, metalness: 0.8 }, 0.1), G),
    stripe: batch(carGeo.stripe, teamMat, G),
  };

  for (let k = 0; k <= nB; k++) {
    const x = x0 + k * bayW;
    pier.add(x, 6.2, 0.45, 1, 12.4, 1);
  }
  for (let x = -L / 2 + 0.8; x < L / 2; x += 1.6) {
    mull.add(x, 9.05, 0.45, 1, 4.4, 1);
  }
  const dir = plusIsEntry ? -1 : 1;
  for (let k = 0; k < nB; k++) {
    const team = TEAMS[Math.floor(k / 3)];
    if (!team) { if (k === TEAMS.length * 3) partition.add(bayX(k) - dir * bayW / 2, 2.8, GD / 2, 1, 1, 1); doors.add(bayX(k), 2.6, 0.35, bayW - 0.7, 1, 1); for (const lz of [3, 7, 11]) lights.add(bayX(k), 5.55, lz); continue; } // 备用车库：关闭
    const [c0, c1, c2] = team.livery || [team.color, '#1b1b1f', team.color];
    const color = team.color;
    const cx = bayX(k);
    const w = bayW - 0.7;
    if (k % 3 === 0) {
      partition.add(cx - dir * bayW / 2, 2.8, GD / 2, 1, 1, 1);
      // 整队门头名称牌（横跨 3 个开间）
      const sign = new THREE.Mesh(new THREE.BoxGeometry(bayW * 3 - 0.7, 1.15, 0.14), [
        concrete, concrete, concrete, concrete,
        floodlit(new THREE.MeshStandardMaterial({ map: teamSign(team, brand), roughness: 0.45 }), 0.6), concrete,
      ]);
      sign.rotation.y = Math.PI;
      sign.position.set(bayX(k + 1), 5.25, -0.05);
      G.add(sign);
      // 车库背景墙：涂装图形 + 队名（横跨 3 个开间）
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(bayW * 3 - 0.4, 5.4), floodlit(new THREE.MeshStandardMaterial({ map: teamWall(team, brand), roughness: 0.6 }), 0.5));
      wall.rotation.y = Math.PI; // 面朝车库门（局部 -z）
      wall.position.set(bayX(k + 1), 2.75, GD - 0.04);
      G.add(wall);
      // 地面、天花与两侧展板墙（烘焙了灯下亮斑与墙根暗角），侧墙上一道队色腰线
      const mid = bayX(k + 1);
      gFloor.add(mid, 0.13, GD / 2, teamW, 1, GD);
      gCeil.add(mid, 5.592, GD / 2, teamW, 1, GD);
      for (const e of [-1, 1]) {
        gWall.add(mid + e * (bayW * 1.5 - 0.14), 2.85, GD / 2 + 0.1, GD - 0.4, 5.4, 1, -e * Math.PI / 2);
        floorLine.add(mid + e * (bayW * 1.5 - 0.15), 2.2, GD / 2 + 0.1, 0.03, 20, GD - 0.5, 0, color);
      }
    }
    for (const lz of [3, 7, 11]) for (const lx of [-2.2, 2.2]) lights.add(cx + lx, 5.55, lz);
    for (const lx of [-2.9, 2.9]) tray.add(cx + lx, 5.4, GD / 2, 1, 1, GD - 1);
    drum.add(cx, 5.3, 0.65, w, 1, 1);
    // 地面工作区标线（队色）
    for (const [fx, fz, sx, sz] of [[0, 1.4, w - 1.2, 0.08], [0, GD - 2.2, w - 1.2, 0.08], [-(w - 1.2) / 2, (GD - 0.8) / 2, 0.08, GD - 3.6], [(w - 1.2) / 2, (GD - 0.8) / 2, 0.08, GD - 3.6]]) floorLine.add(cx + fx, 0.138, fz, sx, 1, sz, 0, color);
    // 轮胎架（两侧，三层，套着队色轮胎保温毯）
    for (const side of [-1, 1]) {
      const rx = cx + side * (w / 2 - 0.55);
      for (const rz of [3.2, 5.6, 8.0]) rack.add(rx, 1.4, rz, 1, 2.8, 1);
      for (let lv = 0; lv < 3; lv++) rackBar.add(rx, 0.12 + lv * 0.85, 5.6, 1, 1, 4.9);
      for (let lv = 0; lv < 3; lv++) for (const tz of [3.7, 4.5, 5.3, 6.1, 6.9, 7.7]) {
        if (rand() < 0.2) continue;
        if (lv === 0) tyres[(k + (side > 0 ? 1 : 0)) % 3].add(rx, 0.5, tz);
        else blanket.add(rx, 0.5 + lv * 0.85, tz, 1, 1, 1, 0, color);
      }
      shade(rx, 5.5, 1.3, 5.8);
    }
    if (k % 3 !== 1) {
      // 赛车：车头朝维修通道（局部 -z）
      for (const [key, bb] of Object.entries(carB)) {
        const col = key === 'paint' ? c0 : key === 'secondary' ? c1 : key === 'accent' ? c2 : key === 'stripe' ? color : null;
        bb.add(cx, 0.13, 6.8, 1, 1, 1, Math.PI, col);
      }
      shade(cx, 6.8, 2.7, 6.6);
      // 前后千斤顶
      jack.add(cx, 0.12, 3.55); jack.add(cx, 0.12, 9.75, 1, 1, 1, Math.PI);
      // 头顶数据屏吊架（面向车头）
      gantryBeam.add(cx, 3.35, 3.0, w - 2, 1, 1);
      for (const hx of [-(w - 2) / 2 + 0.3, (w - 2) / 2 - 0.3]) hanger.add(cx + hx, 4.45, 3.0, 1, 2.1, 1);
      [-1.9, -0.95, 0, 0.95, 1.9].forEach((dx, i) => { screenBack.add(cx + dx, 2.95, 3.03); screenB[[1, 0, 2, 0, 3][i]].add(cx + dx, 2.95, 2.995, 1, 1, 1, Math.PI); });
      // 风炮气管：从天花垂到四个车轮旁，末端挂着风炮
      for (const [hx, hz] of [[-1.3, 5.6], [1.3, 5.6], [-1.3, 8.0], [1.3, 8.0]]) hose.add(cx + hx, 5.5, hz, 1, 1, 1, hx < 0 ? Math.PI : 0, rand() < 0.5 ? '#e10600' : '#ffcc00');
      // 工具车：车尾两侧各一台，背墙前一排
      for (const dx of [-2.6, 2.6]) { trolley.add(cx + dx, 0.12, 11.6, 1, 1, 1, 0, c0); trolleyTop.add(cx + dx, 1.19, 11.6); shade(cx + dx, 11.6, 1.3, 1.0); }
      for (const dx of [-1.5, -0.5, 0.5, 1.5]) { trolley.add(cx + dx, 0.12, GD - 0.5, 1, 1, 1, Math.PI, c0); trolleyTop.add(cx + dx, 1.19, GD - 0.5); }
      shade(cx, GD - 0.6, 4.6, 1.4);
      // 技师：一人俯身在前轮旁，一人站在车尾工具车边，偶尔还有一人在门口看屏幕
      const sd = rand() < 0.5 ? -1 : 1;
      if (rand() < 0.85) person('work', cx + sd * 1.62, 4.75, -sd * Math.PI / 2, color);
      if (rand() < 0.7) person('stand', cx - sd * 1.9, 10.5, Math.PI + (rand() - 0.5) * 1.2, color);
      if (rand() < 0.4) person('stand', cx - sd * 2.7, 1.7, (rand() - 0.5) * 0.6, color);
    } else {
      // 中间开间：两侧工程师工作台（各 3 块屏、2 把椅子，工程师坐在台前）
      for (const side of [-1, 1]) {
        const dx = cx + side * (w / 2 - 1.1);
        desk.add(dx, 0.78, 7.0);
        shade(dx - side * 0.3, 7.0, 2.0, 3.8);
        for (const lz of [5.6, 8.4]) deskLeg.add(dx, 0.4, lz);
        [5.9, 7.0, 8.1].forEach((sz, i) => { screenBack.add(dx + side * 0.28, 1.15, sz, 1, 1, 1, Math.PI / 2); screenB[(i + (side > 0 ? 0 : 2)) % 4].add(dx + side * 0.25, 1.15, sz, 1, 1, 1, -side * Math.PI / 2); });
        for (const cz of [6.2, 7.8]) {
          chair.add(dx - side * 0.75, 0.12, cz, 1, 1, 1, -side * Math.PI / 2);   // 椅背在外、面朝工作台
          if (rand() < 0.75) person('sit', dx - side * 0.75, cz, side * Math.PI / 2, color);
        }
      }
      // 背墙前的一排大屏，偶尔有人站着看
      [-2.5, -0.85, 0.85, 2.5].forEach((dx, i) => { bigBack.add(cx + dx, 2.5, GD - 0.4); bigScreenB[[2, 1, 0, 3][i]].add(cx + dx, 2.5, GD - 0.44, 1, 1, 1, Math.PI); });
      if (rand() < 0.7) person('stand', cx + (rand() - 0.5) * 2.4, GD - 2.6, (rand() - 0.5) * 0.5, color);
    }
  }
  // 屋面设备
  const hvac = batch(box(3.2, 1.6, 2.2), std('#b8bdc4', { roughness: 0.6, metalness: 0.3 }, 0.1), G);
  for (let i = 0; i < 26; i++) hvac.add((rand() - 0.5) * (L - 30), 13.7, 8 + rand() * 20, 1, 1, 1, rand() < 0.5 ? 0 : Math.PI / 2);
  // 檐下筒灯
  const down = batch(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10), lampMat('#ffffff', '#fff3d6', 3), G);
  for (let x = -L / 2 + 2; x < L / 2; x += 3.2) down.add(x, 11.6, -0.6);

  for (const b of [pier, mull, partition, lights, drum, doors, hvac, down, strut]) G.add(b.build());
  // 车库内部的小件：镜头离维修楼较远时整体隐藏（细节层级），近处才画
  const detail = [...tyres, blanket, rack, rackBar, trolley, trolleyTop, ...screenB, ...bigScreenB, bigBack, screenBack, desk, deskLeg, chair, gantryBeam, hanger, tray, hose, jack, floorLine,
    ...Object.values(crewB).flatMap((c) => [c.shirt, c.rest]), ...Object.values(carB)].map((b) => b.build());
  detail.forEach((m) => G.add(m));
  for (const b of [gFloor, gCeil, gWall, blob]) G.add(b.build(false));   // 地面、天花、侧墙、软阴影：不投影
  G.children[G.children.length - 1].renderOrder = 1;
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
  const stackT = batch(blanketGeo(), blanketMat, G);
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
    for (const sx of [-4.2, 4.2]) for (let h = 0; h < 4; h++) stackT.add(cx + sx, 0.32 + h * 0.375, -0.9, 1, 1, 1, h * 1.3, h % 2 ? color : '#2a2b30');
    }
  }
  const pitItems = [marks, marksTeam, gPost, gBeam, gLight, stackT].map((b) => b.build());
  pitItems[0].renderOrder = pitItems[1].renderOrder = -0.95;
  pitItems[0].castShadow = pitItems[1].castShadow = false;

  // ── 领奖台：二层立面外侧的悬挑平台 ──
  const podium = new THREE.Group();
  podium.position.set(40, 0, 0);
  const red = std('#c8102e', { roughness: 0.5 }, 0.6);
  const plat = new THREE.Mesh(box(24, 0.5, 6), white); plat.position.set(0, 7.2, -3.2); plat.castShadow = true;
  const back = new THREE.Mesh(box(24, 2.6, 0.3), red); back.position.set(0, 8.8, -0.35);
  const prail = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.0), glassRail); prail.position.set(0, 7.95, -6.2);
  podium.add(plat, back, prail);
  [[0, 1.0], [-2.8, 0.7], [2.8, 0.45]].forEach(([x, h]) => { const b = new THREE.Mesh(box(2.4, h, 1.8), white); b.position.set(x, 7.45 + h / 2, -3.6); podium.add(b); });
  G.add(podium);

  scene.add(G);
  inst.forEach((c) => scene.add(c));
  pitItems.forEach((c) => scene.add(c));
  const axis = new THREE.Line3(endMinus.clone().setY(2), endPlus.clone().setY(2));
  return { group: G, glass, detail, axis, front: V(P.front[0], P.front[1]), f, L, bayX, nB, toWorld: (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(G.matrixWorld) };
}
