// 赛道边设施：维修通道（OSM 真实线形）、维修墙与车队指挥台、车库门与车队色带、领奖台、
// 发车线与发车格、发车灯架、裁判岗亭、刹车距离牌。
// 建筑本体（维修楼、主看台顶棚、“翼”形结构、围场行宫等）由 osm.js 按 OSM 真实轮廓生成。
import * as THREE from 'three';
import { TEAMS, TURNS, TRACK_POINTS } from './data.js';
import { OSM_PIT, OSM_STANDS, OSM_BUILDINGS } from './osm-data.js';
import { V, std, lampMat, makePath, ribbon, wall, canvasTex, floodlit } from './util.js';
import { asGround } from './osm.js';
import { HW } from './track.js';
import { groundDetail } from './textures.js';
import { screenAtlas, screenGeo } from './pitscreens.js';
import { crewGeo } from './garagekit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
// 发车点：按 2026 官方座位图量取 —— 位于主看台中段偏 16 号弯一侧，约在看台全长距 1 号弯一端 62% 处
// （主看台在 OSM 中的范围为 n = -124 … 268，换算得 n ≈ 25）。官方图为示意图，误差约 ±30 m。
const START_LINE = [-500, 25];

function numberTex(text, bg, fg) {
  return canvasTex(128, 96, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = fg; c.font = 'bold 56px -apple-system, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 3);
  });
}

export function buildVenue(scene, track, pitb) {
  const g = new THREE.Group();
  g.name = 'venue';
  const white = std('#f3f4f6', { roughness: 0.55 }, 0.42);
  const dark = std('#23252a', { roughness: 0.6 }, 0.25);
  const steel = std('#c9ced6', { roughness: 0.35, metalness: 0.6 }, 0.45);
  const red = std('#d7282f', { roughness: 0.5 }, 0.8);
  const lamp = lampMat('#ffffff', '#fff1d0', 2.2);
  const lineMat = std('#f4f4f4', { roughness: 0.6 }, 0.9);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();

  // ── 维修通道 ──
  const pitCurve = new THREE.CatmullRomCurve3(OSM_PIT.map(([x, n]) => V(x, n)), false, 'centripetal');
  const pitPts = pitCurve.getSpacedPoints(Math.round(pitCurve.getLength() / 2));
  const pit = makePath(pitPts, false);
  const N = pit.N;
  // 维修通道在车库前加宽到车库门（工作区），其余路段 12 m
  const toGarage = pit.pts.map((pt) => {
    const d = pt.clone().sub(pitb.front).dot(pitb.f); // 离维修楼正面的距离
    const along = pt.clone().sub(pitb.front).dot(new THREE.Vector3().crossVectors(pitb.f, UP));
    return Math.abs(along) < pitb.L / 2 + 4 && d > 0 && d < 22 ? d : null;
  });
  const offB = (i) => (toGarage[i] !== null ? -toGarage[i] : -6);
  const pitAsphalt = new THREE.Mesh(ribbon(pit, { offA: 6, offB: (i) => offB(i) - 0.2, y: 0.14 }), groundDetail(std('#3b3e44', { roughness: 0.9 }, 0.55), 'asphalt', { size: 3, k: 0.7, mk: 0.12 }));
  g.add(asGround(pitAsphalt, -1.15));
  g.add(asGround(new THREE.Mesh(ribbon(pit, { offA: 5.75, offB: 5.45, y: 0.16 }), lineMat), -1.0));
  // 快车道 / 工作区分界线（实线）
  g.add(asGround(new THREE.Mesh(ribbon(pit, { offA: (i) => (toGarage[i] !== null ? -1.0 : -5.45), offB: (i) => (toGarage[i] !== null ? -1.3 : -5.75), y: 0.16 }), lineMat), -1.0));
  const i0 = Math.round(N * 0.12), i1 = Math.round(N * 0.9);
  // 限速线（入口、出口各一条，横跨维修通道）
  const signTex = canvasTex(128, 128, (cx, w, h) => {
    cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(64, 64, 62, 0, 7); cx.fill();
    cx.strokeStyle = '#d4001a'; cx.lineWidth = 14; cx.beginPath(); cx.arc(64, 64, 54, 0, 7); cx.stroke();
    cx.fillStyle = '#111'; cx.font = 'bold 54px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('80', 64, 68);
  });
  const signMat = floodlit(new THREE.MeshStandardMaterial({ map: signTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), 0.9);
  for (const k of [Math.round(N * 0.1), Math.round(N * 0.92)]) {
    const pt = pit.pts[k], t = pit.tan[k], nr = pit.nor[k];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.5), lineMat.clone());
    line.rotation.set(-Math.PI / 2, 0, Math.atan2(t.x, t.z) + Math.PI / 2);
    line.position.set(pt.x, 0.18, pt.z);
    g.add(asGround(line, -1.0));
    // 限速 80 km/h 标牌（立在维修通道右侧）
    const sp = pt.clone().addScaledVector(nr, -6.8);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), steel); post.position.set(sp.x, 1.1, sp.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), signMat); disc.position.set(sp.x, 2.4, sp.z);
    disc.rotation.y = Math.atan2(t.x, t.z) + Math.PI;
    g.add(post, disc);
  }
  // 维修墙 + 防护网（位于维修通道靠赛道的一侧）
  const pw = new THREE.Mesh(wall(pit, { off: 6.6, h: 1.25, from: i0, to: i1 }), std('#eef0f2', { roughness: 0.7, side: THREE.DoubleSide }, 0.6));
  pw.castShadow = true;
  g.add(pw);
  g.add(new THREE.Mesh(wall(pit, { off: 6.6, h: 3.4, y: 1.25, from: i0, to: i1 }), new THREE.MeshStandardMaterial({ color: '#b8c0cc', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
  // 车队指挥台（沿维修墙一字排开，带遮阳顶）
  // 局部坐标：x 指向维修墙 / 赛道（工程师面朝 +x 坐），z 沿维修通道，y 向上
  const nStand = TEAMS.length;
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const kit = { dark: [], team: [], metal: [], seat: [], screen: [], glass: [] };
  kit.dark.push(
    B(2.4, 1.0, 7.0, 0, 0.5, 0),          // 抬高的平台
    B(0.75, 0.07, 6.7, 0.78, 1.93, 0),    // 长条工作台
    B(0.06, 0.95, 6.7, 1.14, 1.45, 0),    // 工作台前挡板
    B(0.1, 0.3, 7.0, -1.15, 1.15, 0),     // 后侧踢脚
  );
  kit.team.push(
    B(3.1, 0.14, 7.5, 0.25, 3.5, 0),      // 遮阳顶（队色）
    B(0.08, 0.5, 7.5, 1.78, 3.3, 0),      // 顶棚前沿檐板
    B(2.42, 0.14, 7.02, 0, 0.93, 0),      // 平台边沿队色条
    B(0.06, 0.25, 7.0, -1.2, 1.15, 0),    // 后侧护栏下的队色踢脚板（后面敞开，从维修通道能看到工程师的座椅）
  );
  kit.metal.push(B(0.04, 0.04, 7.0, -1.2, 1.75, 0)); // 后侧中间横杆
  for (let i = 0; i <= 6; i++) kit.metal.push(B(0.05, 1.45, 0.05, -1.2, 1.72, -3.4 + i * (6.8 / 6))); // 护栏立杆
  // 顶棚立柱、后侧扶手、上平台的小楼梯
  for (const z of [-3.45, 3.45]) for (const x of [-1.15, 1.2]) kit.metal.push(B(0.07, 2.5, 0.07, x, 2.25, z));
  kit.metal.push(B(0.05, 0.05, 7.0, -1.2, 2.45, 0));
  for (let s = 0; s < 3; s++) kit.metal.push(B(0.9, 0.08, 0.32, -0.5, 0.25 + s * 0.25, 3.65 + (2 - s) * 0.3));
  // 6 个工位：高脚椅 + 每人两块显示屏（屏面朝工程师），顶棚下再挂一排计时屏
  const scr = (cell, w, h, x, y, z) => { const g = screenGeo(cell, w, h); g.rotateY(-Math.PI / 2); g.translate(x, y, z); return g; };
  for (let i = 0; i < 6; i++) {
    const zc = -2.75 + i * 1.1;
    kit.seat.push(B(0.42, 0.07, 0.42, 0.2, 1.62, zc), B(0.06, 0.5, 0.4, -0.02, 1.9, zc));     // 座面、靠背
    kit.metal.push(B(0.05, 0.62, 0.05, 0.2, 1.3, zc), B(0.36, 0.04, 0.04, 0.2, 1.22, zc));    // 立杆、脚踏
    for (const dz of [-0.26, 0.26]) {
      kit.screen.push(scr((i * 2 + (dz > 0 ? 1 : 0)) % 4, 0.48, 0.3, 0.98, 2.22, zc + dz));
      kit.dark.push(B(0.04, 0.34, 0.52, 1.0, 2.22, zc + dz), B(0.04, 0.22, 0.04, 1.02, 2.0, zc + dz));
    }
  }
  for (let i = 0; i < 3; i++) {
    const zc = -2.2 + i * 2.2;
    kit.screen.push(scr((i + 1) % 4, 0.9, 0.54, 1.15, 3.05, zc));
    kit.dark.push(B(0.06, 0.6, 0.96, 1.18, 3.05, zc), B(0.04, 0.35, 0.04, 1.2, 3.3, zc));
  }
  kit.glass.push(B(0.03, 0.55, 6.9, 1.17, 2.25, 0)); // 工作台前的透明防护板
  const geo = (list) => mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
  const teleTex = screenAtlas(TEAMS, TRACK_POINTS);
  const pws = new THREE.InstancedMesh(geo(kit.dark), dark, nStand);
  const pwr = new THREE.InstancedMesh(geo(kit.team), floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.8), nStand);
  const pwExtra = [
    new THREE.InstancedMesh(geo(kit.metal), steel, nStand),
    new THREE.InstancedMesh(geo(kit.seat), std('#1b1c20', { roughness: 0.7 }, 0.2), nStand),
    new THREE.InstancedMesh(geo(kit.screen), new THREE.MeshStandardMaterial({ map: teleTex, emissive: '#ffffff', emissiveMap: teleTex, emissiveIntensity: 0.5, roughness: 0.35 }), nStand),
    new THREE.InstancedMesh(geo(kit.glass), new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false }), nStand),
  ];
  const standAt = []; // 每座指挥台的世界矩阵与对应的维修通道采样点
  for (let k = 0; k < nStand; k++) {
    const gpos = pitb.toWorld(pitb.bayX(k * 3 + 1), 0); // 该队中间车库正对的位置
    let idx = 0, bd = Infinity;
    pit.pts.forEach((pp, j) => { const dd = pp.distanceTo(gpos); if (dd < bd) { bd = dd; idx = j; } });
    const pt = pit.pts[idx], nr = pit.nor[idx], t = pit.tan[idx];
    q.setFromAxisAngle(UP, Math.atan2(t.x, t.z));
    m4.compose(p.copy(pt).addScaledVector(nr, 5.2), q, s.set(1, 1, 1));
    pws.setMatrixAt(k, m4); pwr.setMatrixAt(k, m4);
    for (const im of pwExtra) im.setMatrixAt(k, m4);
    standAt.push({ m: m4.clone(), idx });
    pwr.setColorAt(k, c.set(TEAMS[k].color));
  }
  pws.castShadow = pwr.castShadow = true;
  pwExtra[0].castShadow = pwExtra[1].castShadow = true;
  g.add(pws, pwr, ...pwExtra);

  // ── 维修区人员：部分指挥台坐着工程师；车库门外的工作道上站着 / 弯腰忙碌的技师 ──
  // 人物模型与车库里同一套（面朝 +z，脚底 y = 0），队服按队色、皮肤色随机
  const crewShirtMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 0.4);
  const crewRestMat = floodlit(new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }), 0.3);
  const SKINS = ['#f3d2b4', '#e8bc96', '#d29f78', '#a8714d', '#7a4e33'];
  const crewList = { stand: [], work: [], sit: [] };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pq = new THREE.Quaternion(), ps = new THREE.Vector3(), pp = new THREE.Vector3();
  const addCrew = (pose, M, color, h = 0.94 + rnd() * 0.1) => crewList[pose].push({ m: M.clone().multiply(new THREE.Matrix4().makeScale(h, h, h)), color });
  // 指挥台：隔几队坐 3–5 位工程师，面朝赛道（局部 +x）
  standAt.forEach(({ m }, k) => {
    if (k % 2 === 1 && k !== 3) return;
    const seatsTaken = [0, 1, 2, 3, 4, 5].filter(() => rnd() < 0.7);
    for (const i of seatsTaken) {
      const local = new THREE.Matrix4().compose(pp.set(0.22, 1.1, -2.75 + i * 1.1), pq.setFromAxisAngle(UP, Math.PI / 2), ps.set(1, 1, 1));
      addCrew('sit', m.clone().multiply(local), TEAMS[k].color, 1);
    }
  });
  // 维修通道工作道：每队门口 2–4 人，朝向随机；偶尔一人站在指挥台后面
  standAt.forEach(({ idx }, k) => {
    const n = 2 + Math.floor(rnd() * 3);
    for (let j = 0; j < n; j++) {
      const i2 = Math.min(N - 1, Math.max(0, idx + Math.round((rnd() - 0.5) * 8)));
      const pt = pit.pts[i2], nr = pit.nor[i2];
      const off = (toGarage[i2] !== null ? -toGarage[i2] : -6) + 1.2 + rnd() * 3.5;
      const M = new THREE.Matrix4().compose(pp.copy(pt).addScaledVector(nr, off).setY(0.14), pq.setFromAxisAngle(UP, rnd() * Math.PI * 2), ps.set(1, 1, 1));
      addCrew(rnd() < 0.3 ? 'work' : 'stand', M, TEAMS[k].color);
    }
    if (rnd() < 0.5) {
      const pt = pit.pts[idx], nr = pit.nor[idx], t = pit.tan[idx];
      const M = new THREE.Matrix4().compose(pp.copy(pt).addScaledVector(nr, 3.4).addScaledVector(t, (rnd() - 0.5) * 4).setY(0.14), pq.setFromAxisAngle(UP, Math.atan2(nr.x, nr.z)), ps.set(1, 1, 1));
      addCrew('stand', M, TEAMS[k].color);
    }
  });
  for (const pose of ['stand', 'work', 'sit']) {
    const list = crewList[pose];
    if (!list.length) continue;
    const geo = crewGeo(pose);
    const shirt = new THREE.InstancedMesh(geo.shirt, crewShirtMat, list.length), rest = new THREE.InstancedMesh(geo.rest, crewRestMat, list.length);
    list.forEach(({ m, color }, i) => {
      shirt.setMatrixAt(i, m); rest.setMatrixAt(i, m);
      shirt.setColorAt(i, c.set(color)); rest.setColorAt(i, c.set(SKINS[Math.floor(rnd() * SKINS.length)]));
    });
    shirt.castShadow = rest.castShadow = true;
    g.add(shirt, rest);
  }

  // ── 起终点线、发车格、发车灯架 ──
  const iS = track.nearest(START_LINE[0], -START_LINE[1]);
  const sp = track.pts[iS], st = track.tan[iS];
  const rotS = Math.atan2(st.x, st.z);
  const chk = canvasTex(64, 16, (cx, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cx.fillRect(i * 4, j * 4, 4, 4); }
  });
  const sl = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 1.6), floodlit(new THREE.MeshStandardMaterial({ map: chk }), 0.9));
  sl.rotation.set(-Math.PI / 2, 0, rotS + Math.PI / 2);
  sl.position.set(sp.x, 0.22, sp.z);
  g.add(asGround(sl, -0.9));
  // 22 个发车位：间隔 8 m，左右交错；每格一条横线 + 两条短纵线
  const boxGeo = new THREE.BoxGeometry(3.6, 0.04, 0.35);
  const sideGeo = new THREE.BoxGeometry(0.25, 0.04, 1.6).translate(0, 0, 0.8);
  const gridMat = lineMat.clone();
  const slots = new THREE.InstancedMesh(boxGeo, gridMat, 22), sides = new THREE.InstancedMesh(sideGeo, gridMat, 44);
  const ds = track.total / track.N;
  for (let k = 0; k < 22; k++) {
    const idx = (iS - Math.round((10 + k * 8) / ds) + track.N) % track.N;
    const pt = track.pts[idx], nr = track.nor[idx], tg = track.tan[idx];
    const lat = k % 2 ? -3.0 : 3.0;
    q.setFromAxisAngle(UP, Math.atan2(tg.x, tg.z));
    const at = pt.clone().addScaledVector(nr, lat).setY(0.21);
    slots.setMatrixAt(k, m4.compose(at, q, s.set(1, 1, 1)));
    for (const e of [-1, 1]) sides.setMatrixAt(k * 2 + (e > 0 ? 1 : 0), m4.compose(at.clone().addScaledVector(nr, e * 1.7), q, s.set(1, 1, 1)));
  }
  asGround(slots, -0.9); asGround(sides, -0.9);
  g.add(slots, sides);
  // 发车灯架：横跨赛道
  const gantry = new THREE.Group();
  gantry.position.set(sp.x, 0, sp.z); gantry.rotation.y = rotS;
  for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.2, 0.6), steel); post.position.set(sx * (HW + 1.5), 3.6, 0); gantry.add(post); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 3.6, 1.3, 1.1), dark); beam.position.set(0, 7.0, 0);
  gantry.add(beam);
  const redLamp = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff2014', emissiveIntensity: 3 });
  for (let i = 0; i < 5; i++) for (const yy of [6.75, 7.25]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), redLamp);
    l.position.set(-2 + i, yy, -0.57); l.rotation.y = Math.PI;
    gantry.add(l);
  }
  g.add(gantry);

  // 维修通道时钟：TAG Heuer 自 2025 年起接替 Rolex 成为 F1 官方计时（维修墙上的时钟随之更换）。
  // 只用文字字样，显示上海当地时间；具体位置为近似（立在发车线旁的维修墙上）。
  const clockTex = canvasTex(512, 256, () => {});
  const drawClock = () => {
    const cx = clockTex.image.getContext('2d'), w = 512, h = 256;
    cx.fillStyle = '#0b0c0e'; cx.fillRect(0, 0, w, h);
    cx.fillStyle = '#1d1f24'; cx.fillRect(0, 0, w, 66);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = '#ffffff'; cx.font = 'bold 40px "Helvetica Neue", Arial, sans-serif';
    cx.fillText('TAG HEUER', w / 2, 35);
    cx.fillStyle = '#e10600'; cx.fillRect(0, 64, w, 4);
    const tm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false });
    cx.fillStyle = '#f2f2f2'; cx.font = 'bold 116px "Consolas", "Courier New", monospace';
    cx.fillText(tm, w / 2, 166);
    clockTex.needsUpdate = true;
  };
  drawClock();
  setInterval(drawClock, 1000);
  {
    let ic = 0, bd = Infinity;
    for (let j = i0; j <= i1; j++) { const dd = pit.pts[j].distanceTo(sp); if (dd < bd) { bd = dd; ic = j; } }
    const cp = pit.pts[ic], cn = pit.nor[ic], ct = pit.tan[ic];
    const clk = new THREE.Group();
    clk.position.copy(cp).addScaledVector(cn, 6.6).setY(0);
    clk.rotation.y = Math.atan2(ct.x, ct.z) - Math.PI / 2; // 屏面朝向维修通道
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), steel); pole.position.y = 2.55; clk.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 0.22), dark); box.position.y = 4.4; clk.add(box);
    const faceMat = new THREE.MeshStandardMaterial({ map: clockTex, emissive: '#ffffff', emissiveMap: clockTex, emissiveIntensity: 0.55, roughness: 0.4 });
    for (const sd of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.16, 1.08), faceMat);
      face.position.set(0, 4.4, sd * 0.115); face.rotation.y = sd > 0 ? 0 : Math.PI;
      clk.add(face);
    }
    clk.traverse((o) => { o.castShadow = true; });
    g.add(clk);
  }

  // ── 裁判岗亭（沿赛道外侧，约每 190 m 一座）──
  const posts = [];
  for (let i = 20; i < track.N; i += 56) {
    const side = track.curv[i] > 0 ? -1 : 1;
    if (side < 0 && track.pitZone(i)) continue;
    const off = (HW + 9.5 + (side > 0 ? track.gwL[i] : track.gwR[i])) * side;
    posts.push(track.pts[i].x + track.nor[i].x * off, track.pts[i].z + track.nor[i].z * off, Math.atan2(track.tan[i].x, track.tan[i].z));
  }
  const hut = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 3, 4.4), white, posts.length / 3);
  const hutRoof = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 0.35, 5), std('#ff8a1f', { roughness: 0.6 }, 0.8), posts.length / 3);
  for (let i = 0; i < posts.length / 3; i++) {
    q.setFromAxisAngle(UP, posts[i * 3 + 2]);
    hut.setMatrixAt(i, m4.compose(p.set(posts[i * 3], 1.5, posts[i * 3 + 1]), q, s.set(1, 1, 1)));
    hutRoof.setMatrixAt(i, m4.compose(p.set(posts[i * 3], 3.2, posts[i * 3 + 1]), q, s.set(1, 1, 1)));
  }
  hut.castShadow = true;
  g.add(hut, hutRoof);

  // ── 数字旗号灯板：每个裁判岗前的护墙上一块 LED 点阵板，朝向来车（平时不亮）──
  const ledTex = canvasTex(64, 48, (cx, w, h) => {
    cx.fillStyle = '#08090b'; cx.fillRect(0, 0, w, h);
    cx.fillStyle = '#23262b';
    for (let y = 3; y < h; y += 4) for (let x = 3; x < w; x += 4) { cx.beginPath(); cx.arc(x, y, 1.2, 0, 7); cx.fill(); }
  });
  const nP = posts.length / 3;
  const panelBox = new THREE.InstancedMesh(new THREE.BoxGeometry(1.36, 1.06, 0.16), dark, nP);
  const panelFace = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 0.9).translate(0, 0, 0.085), new THREE.MeshStandardMaterial({ map: ledTex, roughness: 0.35 }), nP);
  const panelLeg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.2, 0.1).translate(0, -1.0, 0), steel, nP);
  let pk = 0;
  for (let i = 20; i < track.N; i += 56) {
    const side = track.curv[i] > 0 ? -1 : 1;
    if (side < 0 && track.pitZone(i)) continue;
    const j = (i - 12 + track.N) % track.N; // 略靠前，让来车先看到
    const off = (HW + 5.7 + (side > 0 ? track.gwL[j] : track.gwR[j])) * side;
    const pt = track.pts[j], tg = track.tan[j], nr = track.nor[j];
    q.setFromAxisAngle(UP, Math.atan2(tg.x, tg.z) + Math.PI - side * 0.35); // 面向来车，略转向赛道
    m4.compose(p.set(pt.x + nr.x * off, 2.4, pt.z + nr.z * off), q, s.set(1, 1, 1));
    panelBox.setMatrixAt(pk, m4); panelFace.setMatrixAt(pk, m4); panelLeg.setMatrixAt(pk, m4);
    pk++;
  }
  panelBox.count = panelFace.count = panelLeg.count = pk;
  panelBox.castShadow = true;
  g.add(panelBox, panelFace, panelLeg);

  // ── 维修区出口信号灯：快车道末端（维修墙尽头）一组红 / 绿灯，绿灯亮表示可以出站 ──
  {
    const k = Math.min(i1 + 2, N - 1);
    const pt = pit.pts[k], t = pit.tan[k], nr = pit.nor[k];
    const pe = new THREE.Group();
    pe.position.copy(pt).addScaledVector(nr, 6.3).setY(0);
    pe.rotation.y = Math.atan2(t.x, t.z) + Math.PI; // 面向驶来的赛车
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), steel); pole.position.y = 1.3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.2, 0.3), dark); head.position.y = 3.1;
    const redOff = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshStandardMaterial({ color: '#3a0d0d', roughness: 0.3 }));
    const greenOn = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshStandardMaterial({ color: '#0a3', emissive: '#22ff66', emissiveIntensity: 2.2 }));
    redOff.position.set(0, 3.38, 0.16); greenOn.position.set(0, 2.84, 0.16);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.36), floodlit(new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (cx, w, h) => {
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
      cx.fillStyle = '#111'; cx.font = 'bold 40px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('PIT EXIT', w / 2, h / 2 + 2);
    }) }), 0.9));
    lbl.position.set(0, 4.0, 0.02);
    pe.add(pole, head, redOff, greenOn, lbl);
    pe.traverse((o) => { o.castShadow = true; });
    g.add(pe);
  }

  // ── 刹车距离牌：1、6、11、14 号弯前 300 / 200 / 100 m，立在弯道外侧 ──
  const boardMats = ['300', '200', '100'].map((t) => floodlit(new THREE.MeshStandardMaterial({ map: numberTex(t, '#0b3d91', '#ffffff'), roughness: 0.5 }), 0.9));
  for (const tn of [1, 6, 11, 14]) {
    const [, tx, ty] = TURNS.find((t) => t[0] === tn);
    const apex = track.nearest(tx, -ty);
    let entry = apex;
    for (let k = 0; k < 120; k++) { const j = (apex - k + track.N) % track.N; if (Math.abs(track.curv[j]) < 0.0035) { entry = j; break; } }
    const dir = Math.sign(track.curv[apex]) || 1; // >0 左弯
    [300, 200, 100].forEach((d, bi) => {
      const j = (entry - Math.round(d / ds) + track.N) % track.N;
      const off = (HW + 3.2) * -dir; // 弯道外侧
      const pt = track.pts[j].clone().addScaledVector(track.nor[j], off);
      const board = new THREE.Group();
      board.position.copy(pt);
      board.rotation.y = Math.atan2(track.tan[j].x, track.tan[j].z) + Math.PI; // 面向来车
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), steel); post.position.y = 0.7;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), boardMats[bi]); panel.position.y = 1.55; panel.position.z = 0.07;
      const backP = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.99, 0.1), dark); backP.position.y = 1.55;
      board.add(post, backP, panel);
      g.add(board);
    });
  }

  // ── 穿越赛道下方的车行隧道（OSM：way 132638863 主直道下方、way 156347882 8 号弯一带下方）──
  // 隧道本体在地下不建模，只做两端的下沉引道：深色坡道 + 两侧挡墙 + 洞口门墙。
  // 洞口落在建筑轮廓内（通向地下车库）的一端不画。
  const TUNNELS = [[[-562, 305], [-469, 303]], [[-5, -46], [-126, -41]]];
  const inBuilding = (x, n) => OSM_BUILDINGS.some((b) => {
    const pp = b.p; let ins = false;
    for (let i = 0, j = pp.length - 2; i < pp.length; j = i, i += 2) {
      const xi = pp[i], ni = pp[i + 1], xj = pp[j], nj = pp[j + 1];
      if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) ins = !ins;
    }
    return ins;
  }) || (() => { // 维修楼（程序生成，不在 OSM 建筑列表里）
    const v = V(x, n).sub(pitb.front), d = v.dot(pitb.f), al = v.dot(new THREE.Vector3().crossVectors(pitb.f, UP));
    return Math.abs(al) < pitb.L / 2 + 2 && d < 2 && d > -45;
  })();
  const rampTex = canvasTex(32, 128, (cx, w, h) => {
    const gr = cx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#07080a'); gr.addColorStop(0.35, '#1d1f23'); gr.addColorStop(1, '#4a4d53');
    cx.fillStyle = gr; cx.fillRect(0, 0, w, h);
  });
  const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.95 });
  const concrete = std('#b9b6ae', { roughness: 0.9 }, 0.35);
  const RW = 7, RL = 26; // 引道宽、长（m）
  for (const [A, B] of TUNNELS) for (const [P, Q] of [[A, B], [B, A]]) {
    if (inBuilding(P[0], P[1])) continue;
    const pw = V(P[0], P[1]), qw = V(Q[0], Q[1]);
    const out = pw.clone().sub(qw).setY(0).normalize(); // 从洞口指向地面道路
    const ang = Math.atan2(out.x, out.z);
    const port = new THREE.Group();
    port.position.copy(pw); port.rotation.y = ang;
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(RW, RL).rotateX(-Math.PI / 2).translate(0, 0.07, RL / 2), rampMat);
    port.add(asGround(ramp, -3.95));
    for (const sd of [-1, 1]) { // 两侧挡墙：外端齐地，往洞口方向墙顶护栏
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, RL).translate(sd * (RW / 2 + 0.2), 0.55, RL / 2), concrete);
      port.add(wl);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(RW + 2, 1.6, 1.2).translate(0, 0.8, -0.6), concrete); // 洞口上方门墙
    port.add(head);
    port.traverse((o) => { if (o.isMesh && o !== ramp) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(port);
  }

  scene.add(g);
  return { startIndex: iS };
}
