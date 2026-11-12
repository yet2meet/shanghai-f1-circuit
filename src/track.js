import * as THREE from 'three';
import { TRACK_POINTS } from './data.js';
import { V, makePath, ribbon, wall, smooth, std, canvasTex, floodlit } from './util.js';
import { OSM_PIT } from './osm-data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asGround } from './osm.js';
import { groundDetail } from './textures.js';

export const HW = 7.5; // 赛道半宽（真实路面宽约 13–15 m）

export function buildTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(TRACK_POINTS.map(([x, n]) => V(x, n)), true, 'centripetal');
  const N = 1600;
  curve.arcLengthDivisions = 20000; // 默认 200 段对 5.4 km 太粗，会让采样点间距从 0.2 m 到 14 m 不等
  const pts = curve.getSpacedPoints(N);
  pts.pop();
  const path = makePath(pts, true);

  // 有符号曲率（负 = 右弯）
  const raw = new Float32Array(N);
  const ds = path.total / N;
  for (let i = 0; i < N; i++) {
    const a = path.tan[(i - 1 + N) % N], b = path.tan[(i + 1) % N];
    const cr = a.z * b.x - a.x * b.z;
    raw[i] = Math.asin(THREE.MathUtils.clamp(cr, -1, 1)) / (2 * ds);
  }
  const curv = smooth(raw, 6);

  // 缓冲区（砂石）宽度：只在弯道外侧
  const gl = new Float32Array(N), gr = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = curv[i];
    const w = THREE.MathUtils.clamp((Math.abs(k) - 0.0045) * 3200, 0, 28);
    if (k < 0) gl[i] = w; else gr[i] = w;
  }
  const gwL = smooth(gl, 22), gwR = smooth(gr, 22);

  // 维修区一侧（大直道东侧）不设护墙
  // 维修区一侧：离真实维修通道 24 m 以内的右侧不设护墙（维修墙由 venue.js 单独生成）
  const pitPts = OSM_PIT.map(([x, n]) => [x, -n]);
  const nearPit = new Uint8Array(N);
  const kerbPit = new Uint8Array(N); // 右侧路肩会压到维修通道路面（维修区出口并线段）
  const _pitD = (x, z) => {
    let bd = Infinity;
    for (let m = 0; m < pitPts.length - 1; m++) {
      const [ax, az] = pitPts[m], [bx, bz] = pitPts[m + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      bd = Math.min(bd, Math.hypot(x - ax - dx * tt, z - az - dz * tt));
    }
    return bd;
  };
  for (let k = 0; k < N; k++) {
    const P = pts[k], n = path.nor[k];
    if (_pitD(P.x, P.z) < 24) nearPit[k] = 1;
    if (_pitD(P.x - n.x * (HW + 1), P.z - n.z * (HW + 1)) < 7.5) kerbPit[k] = 1;
  }
  const pitZone = (k) => nearPit[k] === 1;

  const track = {
    path, pts, tan: path.tan, nor: path.nor, dist: path.dist, total: path.total, N, curv, gwL, gwR, pitZone,
    nearest(x, z) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    distTo(x, z, step = 4) {
      let bd = Infinity;
      for (let i = 0; i < N; i += step) {
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) bd = d;
      }
      return Math.sqrt(bd);
    },
  };

  const g = new THREE.Group();
  g.name = 'track';

  // 修剪草坪带（夜间被灯光照亮）
  const vergeTex = canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#86ba69'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#92c375'; c.fillRect(0, 0, w / 2, h);
  }, [1, 1]);
  const verge = new THREE.Mesh(
    ribbon(path, { offA: (i) => HW + 13 + gwL[i], offB: (i) => -(HW + 13 + gwR[i]), y: 0.05, uv: 24 }),
    groundDetail(floodlit(new THREE.MeshStandardMaterial({ map: vergeTex, roughness: 1 }), 0.25), 'grass', { size: 3, k: 0.8 })
  );
  g.add(asGround(verge, -1.5));

  // 砂石缓冲区
  const gravelMat = groundDetail(std('#dcc189', { roughness: 1 }, 0.3), 'gravel', { size: 2.2, k: 1.0, mk: 0.14 });
  const gravelL = new THREE.Mesh(ribbon(path, { offA: (i) => HW + 3.5 + gwL[i], offB: HW + 3.5, y: 0.1 }), gravelMat);
  const gravelR = new THREE.Mesh(ribbon(path, { offA: -(HW + 3.5), offB: (i) => -(HW + 3.5 + gwR[i]), y: 0.1 }), gravelMat);
  g.add(asGround(gravelL, -1.4), asGround(gravelR, -1.4));

  // 沥青路面
  const asphaltTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#34363b'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = 40 + Math.random() * 35;
      c.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
      c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    // 行车线橡胶痕
    const gr2 = c.createLinearGradient(0, 0, 0, h);
    gr2.addColorStop(0.2, 'rgba(0,0,0,0)'); gr2.addColorStop(0.5, 'rgba(0,0,0,0.28)'); gr2.addColorStop(0.8, 'rgba(0,0,0,0)');
    c.fillStyle = gr2; c.fillRect(0, 0, w, h);
  }, [1, 1]);
  const asphalt = new THREE.Mesh(
    ribbon(path, { offA: HW, offB: -HW, y: 0.16, uv: 16 }),
    groundDetail(floodlit(new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92 }), 0.55), 'asphalt', { size: 3, k: 0.7, mk: 0.12 })
  );
  g.add(asGround(asphalt, -1.2));

  // 白色边线
  const lineMat = std('#f4f4f4', { roughness: 0.6 }, 0.9);
  g.add(asGround(new THREE.Mesh(ribbon(path, { offA: HW - 0.35, offB: HW - 0.8, y: 0.2 }), lineMat), -1.05));
  g.add(asGround(new THREE.Mesh(ribbon(path, { offA: -(HW - 0.8), offB: -(HW - 0.35), y: 0.2 }), lineMat), -1.05));

  // 红白路肩。2026 年赛道专项升级“降低路肩高度”（适配 FIA ECAT），这里贴近路面，只比沥青高约 2 cm；
  // 维修区出口并线段的内侧不画路肩，只留白色分隔线。
  const kerbTex = canvasTex(128, 16, (c, w, h) => {
    c.fillStyle = '#f2f2f0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d42a2a'; c.fillRect(0, 0, w / 2, h);
    // 胎痕与磨损
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(20,20,22,${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1); }
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, w, 1.5); c.fillRect(0, h - 1.5, w, 1.5);
  }, [1, 1]);
  const kerbMat = floodlit(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 }), 0.9);
  const isKerb = (i) => Math.abs(curv[i]) > 0.005;
  let start = 0;
  while (start < N && isKerb(start)) start++;
  for (let k = start; k < start + N; k++) {
    if (!isKerb(k % N)) continue;
    let e = k;
    while (isKerb((e + 1) % N) && e - k < N) e++;
    const a = Math.max(k - 4, start), b = e + 4;
    g.add(asGround(new THREE.Mesh(ribbon(path, { offA: HW + 2.2, offB: HW - 0.2, y: 0.18, uv: 5, from: a, to: b }), kerbMat), -1.0));
    // 右侧：跳过与维修通道重叠的部分
    for (let s0 = a; s0 <= b; s0++) {
      if (kerbPit[s0 % N]) continue;
      let s1 = s0;
      while (s1 < b && !kerbPit[(s1 + 1) % N]) s1++;
      if (s1 > s0) g.add(asGround(new THREE.Mesh(ribbon(path, { offA: -(HW - 0.2), offB: -(HW + 2.2), y: 0.18, uv: 5, from: s0, to: s1 }), kerbMat), -1.0));
      s0 = s1;
    }
    k = e;
  }

  // 护墙
  // 护墙上的标识带：赛车场名称 + 2026 赛事官方全称（喜力为冠名赞助商）。
  // 各弯道的具体赞助商布置没有可靠公开资料，因此不按弯道摆放品牌，只用已确认的赛事名称。
  const adTex = canvasTex(2048, 64, (c, w, h) => {
    const panels = [
      ['#0d1b3e', '#ffffff', '上海国际赛车场'], ['#e10600', '#ffffff', 'SHANGHAI INTERNATIONAL CIRCUIT'],
      ['#0b7a3b', '#ffffff', 'FORMULA 1 HEINEKEN CHINESE GRAND PRIX 2026'], ['#15151e', '#ffd60a', 'F1 喜力中国大奖赛 · SHANGHAI 2026'],
    ];
    const pw = w / panels.length;
    panels.forEach(([bg, fg, text], k) => {
      c.fillStyle = bg; c.fillRect(k * pw, 0, pw, h);
      c.fillStyle = fg; c.font = 'bold 34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, k * pw + pw / 2, h / 2 + 2, pw - 30);
    });
  }, [1, 1]);
  const wallMat = floodlit(new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.6, side: THREE.DoubleSide }), 0.6);
  const wl = new THREE.Mesh(wall(path, { off: (i) => HW + 6 + gwL[i], h: 1.3, to: N, uv: 64 }), wallMat);
  // 右侧护墙从赛道看过去方向相反，贴图反向，文字才不会镜像
  const wr = new THREE.Mesh(wall(path, { off: (i) => -(HW + 6 + gwR[i]), h: 1.3, to: N, skip: pitZone, uv: -64 }), wallMat);
  wl.castShadow = wr.castShadow = true;
  g.add(wl, wr);
  // 防护网：菱形金属网纹理（每米 4 格）+ 每 4 m 一根立柱 + 顶部钢缆
  const meshTex = fenceTexture();
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#c3c9d1', alphaMap: meshTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, metalness: 0.6, roughness: 0.4 });
  const FH = 3.4;
  g.add(new THREE.Mesh(wall(path, { off: (i) => HW + 6.2 + gwL[i], h: FH, y: 1.3, to: N, uv: 1 }), fenceMat));
  g.add(new THREE.Mesh(wall(path, { off: (i) => -(HW + 6.2 + gwR[i]), h: FH, y: 1.3, to: N, skip: pitZone, uv: 1 }), fenceMat));
  const postSpots = [];
  const step = Math.max(1, Math.round(4 / (path.total / N)));
  for (let k = 0; k < N; k += step) {
    for (const side of [1, -1]) {
      if (side < 0 && pitZone(k)) continue;
      const off = side * (HW + 6.3 + (side > 0 ? gwL[k] : gwR[k]));
      postSpots.push(pts[k].x + path.nor[k].x * off, pts[k].z + path.nor[k].z * off, Math.atan2(path.tan[k].x, path.tan[k].z) + (side > 0 ? 0 : Math.PI));
    }
  }
  // 立柱带一段向赛道内侧倾斜的顶部（真实防护网的“鹅颈”造型）
  const postGeo = mergeGeometries([
    new THREE.BoxGeometry(0.12, FH + 1.3, 0.12).translate(0, (FH + 1.3) / 2, 0),
    new THREE.BoxGeometry(0.1, 0.1, 1.0).rotateX(-0.6).translate(0, FH + 1.55, -0.4),
  ]);
  const posts = new THREE.InstancedMesh(postGeo, std('#8d949c', { roughness: 0.4, metalness: 0.7 }, 0.3), postSpots.length / 3);
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), upv = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < postSpots.length / 3; i++) {
    pq.setFromAxisAngle(upv, postSpots[i * 3 + 2] + Math.PI / 2);
    posts.setMatrixAt(i, pm.compose(pp.set(postSpots[i * 3], 0, postSpots[i * 3 + 1]), pq, one));
  }
  posts.castShadow = true;
  g.add(posts);
  // 轮胎防护带：缓冲区较宽（弯道外侧）的护墙前，一道包着输送带的轮胎墙（黑红相间）
  const beltTex = canvasTex(256, 32, (c, w, h) => {
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#d61f26' : '#16171a'; c.fillRect((i * w) / 8, 0, w / 8, h); }
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 2, w, 2);
  }, [1, 1]);
  const beltMat = floodlit(new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8, side: THREE.DoubleSide }), 0.5);
  const beltL = (k) => gwL[k] < 8, beltR = (k) => gwR[k] < 8 || pitZone(k);
  g.add(new THREE.Mesh(wall(path, { off: (i) => HW + 5.2 + gwL[i], h: 1.1, to: N, skip: beltL, uv: 12 }), beltMat));
  g.add(new THREE.Mesh(wall(path, { off: (i) => -(HW + 5.2 + gwR[i]), h: 1.1, to: N, skip: beltR, uv: 12 }), beltMat));
  const topMat = std('#202226', { roughness: 0.9 }, 0.1);
  g.add(new THREE.Mesh(ribbon(path, { offA: (i) => HW + 6 + gwL[i], offB: (i) => HW + 5.2 + gwL[i], y: 1.1, to: N }), topMat));

  scene.add(g);
  return track;
}

/** 菱形金属网的透明度贴图：wall({ uv: 1 }) 时 u 以米计，每米 4 格；v 方向覆盖整个网高 */
function fenceTexture() {
  const tex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
  }, [4, 14]);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
