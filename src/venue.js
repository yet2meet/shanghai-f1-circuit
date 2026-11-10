// 赛道边设施：维修通道（OSM 真实线形）、维修墙与车队指挥台、车库门与车队色带、领奖台、
// 发车线与发车格、发车灯架、裁判岗亭、刹车距离牌。
// 建筑本体（维修楼、主看台顶棚、“翼”形结构、围场行宫等）由 osm.js 按 OSM 真实轮廓生成。
import * as THREE from 'three';
import { TEAM_COLORS, TURNS } from './data.js';
import { OSM_PIT, OSM_STANDS } from './osm-data.js';
import { V, std, lampMat, makePath, ribbon, wall, canvasTex, floodlit } from './util.js';
import { asGround } from './osm.js';
import { HW } from './track.js';

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

export function buildVenue(scene, track) {
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
  const pitAsphalt = new THREE.Mesh(ribbon(pit, { offA: 6, offB: -6, y: 0.14 }), std('#3b3e44', { roughness: 0.9 }, 0.55));
  g.add(asGround(pitAsphalt, -1.15));
  for (const o of [5.6, -5.6]) g.add(asGround(new THREE.Mesh(ribbon(pit, { offA: o + 0.15, offB: o - 0.15, y: 0.16 }), lineMat), -1.0));
  // 快车道与工作区分隔线（靠车库一侧）
  const dashTex = canvasTex(64, 8, (cx, w, h) => { cx.clearRect(0, 0, w, h); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w * 0.55, h); }, [1, 1]);
  const dashMat = new THREE.MeshStandardMaterial({ map: dashTex, transparent: true, alphaTest: 0.5 });
  const i0 = Math.round(N * 0.12), i1 = Math.round(N * 0.9);
  g.add(asGround(new THREE.Mesh(ribbon(pit, { offA: -1.6, offB: -1.9, y: 0.17, uv: 6, from: i0, to: i1 }), dashMat), -1.0));
  // 限速线（入口、出口各一条，横跨维修通道）
  for (const k of [Math.round(N * 0.1), Math.round(N * 0.92)]) {
    const pt = pit.pts[k], t = pit.tan[k];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.5), lineMat.clone());
    line.rotation.set(-Math.PI / 2, 0, Math.atan2(t.x, t.z) + Math.PI / 2);
    line.position.set(pt.x, 0.18, pt.z);
    g.add(asGround(line, -1.0));
  }
  // 维修墙 + 防护网（位于维修通道靠赛道的一侧）
  const pw = new THREE.Mesh(wall(pit, { off: 6.6, h: 1.25, from: i0, to: i1 }), std('#eef0f2', { roughness: 0.7, side: THREE.DoubleSide }, 0.6));
  pw.castShadow = true;
  g.add(pw);
  g.add(new THREE.Mesh(wall(pit, { off: 6.6, h: 3.4, y: 1.25, from: i0, to: i1 }), new THREE.MeshStandardMaterial({ color: '#b8c0cc', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false })));
  // 车队指挥台（沿维修墙一字排开，带遮阳顶）
  const nStand = 11;
  const standGeo = new THREE.BoxGeometry(2.0, 2.4, 6.5).translate(0, 1.2, 0);
  const roofGeo = new THREE.BoxGeometry(3.2, 0.25, 7.2).translate(0, 3.4, 0);
  const pws = new THREE.InstancedMesh(standGeo, dark, nStand);
  const pwr = new THREE.InstancedMesh(roofGeo, floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.8), nStand);
  for (let k = 0; k < nStand; k++) {
    const idx = Math.round(N * (0.3 + (k * 0.45) / (nStand - 1)));
    const pt = pit.pts[idx], nr = pit.nor[idx], t = pit.tan[idx];
    q.setFromAxisAngle(UP, Math.atan2(t.x, t.z));
    m4.compose(p.copy(pt).addScaledVector(nr, 5.2), q, s.set(1, 1, 1));
    pws.setMatrixAt(k, m4); pwr.setMatrixAt(k, m4);
    pwr.setColorAt(k, c.set(TEAM_COLORS[k % TEAM_COLORS.length]));
  }
  pws.castShadow = true;
  g.add(pws, pwr);

  // ── 车库门、车队色带、室内灯（贴在 OSM 维修楼正面）──
  const P = OSM_STANDS.P[0];
  const pf = new THREE.Vector3(P.f[0], 0, -P.f[1]).normalize();
  const pu = new THREE.Vector3().crossVectors(pf, UP); // 沿维修楼长边
  const pFront = V(P.front[0], P.front[1]).addScaledVector(pf, 0.25);
  const nGar = Math.floor((P.L - 6) / 9.4);
  const rotG = Math.atan2(pf.x, pf.z);
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(8.4, 5.4, 0.3), std('#15161a', { roughness: 0.4 }, 0.15), nGar);
  const fascia = new THREE.InstancedMesh(new THREE.BoxGeometry(9.2, 1.4, 0.4), floodlit(new THREE.MeshStandardMaterial({ roughness: 0.5 }), 0.9), nGar);
  const inner = new THREE.InstancedMesh(new THREE.BoxGeometry(7.8, 0.3, 0.2), lamp, nGar);
  q.setFromAxisAngle(UP, rotG);
  for (let k = 0; k < nGar; k++) {
    const off = (k - (nGar - 1) / 2) * 9.4;
    const base = pFront.clone().addScaledVector(pu, off);
    doors.setMatrixAt(k, m4.compose(p.copy(base).setY(2.8), q, s.set(1, 1, 1)));
    fascia.setMatrixAt(k, m4.compose(p.copy(base).setY(6.4).addScaledVector(pf, 0.1), q, s.set(1, 1, 1)));
    fascia.setColorAt(k, c.set(TEAM_COLORS[Math.floor(k / 3) % TEAM_COLORS.length]));
    inner.setMatrixAt(k, m4.compose(p.copy(base).setY(5.2).addScaledVector(pf, 0.2), q, s.set(1, 1, 1)));
  }
  g.add(doors, fascia, inner);
  // 领奖台：维修楼正面，悬挑于维修通道上方
  const pod = pFront.clone().addScaledVector(pu, 40);
  const podium = new THREE.Group();
  podium.position.copy(pod); podium.rotation.y = rotG;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(24, 0.8, 7), white); plat.position.set(0, 9.4, 3.2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(24, 6.5, 0.4), red); back.position.set(0, 13, -0.1);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 0.1), new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.35 })); rail.position.set(0, 10.4, 6.6);
  podium.add(plat, back, rail);
  [[0, 1.6], [-3.2, 1.1], [3.2, 0.8]].forEach(([x, h]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, h, 2.2), dark); b.position.set(x, 9.8 + h / 2, 2.6); podium.add(b); });
  g.add(podium);

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
