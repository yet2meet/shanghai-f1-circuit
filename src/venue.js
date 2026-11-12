// 赛道边设施：维修通道（OSM 真实线形）、维修墙与车队指挥台、车库门与车队色带、领奖台、
// 发车线与发车格、发车灯架、裁判岗亭、刹车距离牌。
// 建筑本体（维修楼、主看台顶棚、“翼”形结构、围场行宫等）由 osm.js 按 OSM 真实轮廓生成。
import * as THREE from 'three';
import { TEAMS, TURNS } from './data.js';
import { OSM_PIT, OSM_STANDS } from './osm-data.js';
import { V, std, lampMat, makePath, ribbon, wall, canvasTex, floodlit } from './util.js';
import { asGround } from './osm.js';
import { HW } from './track.js';
import { groundDetail } from './textures.js';

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
  const nStand = TEAMS.length;
  const standGeo = new THREE.BoxGeometry(2.0, 2.4, 6.5).translate(0, 1.2, 0);
  const roofGeo = new THREE.BoxGeometry(3.2, 0.25, 7.2).translate(0, 3.4, 0);
  const pws = new THREE.InstancedMesh(standGeo, dark, nStand);
  const pwr = new THREE.InstancedMesh(roofGeo, floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.8), nStand);
  for (let k = 0; k < nStand; k++) {
    const gpos = pitb.toWorld(pitb.bayX(k * 3 + 1), 0); // 该队中间车库正对的位置
    let idx = 0, bd = Infinity;
    pit.pts.forEach((pp, j) => { const dd = pp.distanceTo(gpos); if (dd < bd) { bd = dd; idx = j; } });
    const pt = pit.pts[idx], nr = pit.nor[idx], t = pit.tan[idx];
    q.setFromAxisAngle(UP, Math.atan2(t.x, t.z));
    m4.compose(p.copy(pt).addScaledVector(nr, 5.2), q, s.set(1, 1, 1));
    pws.setMatrixAt(k, m4); pwr.setMatrixAt(k, m4);
    pwr.setColorAt(k, c.set(TEAMS[k].color));
  }
  pws.castShadow = true;
  g.add(pws, pwr);

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

  scene.add(g);
  return { startIndex: iS };
}
