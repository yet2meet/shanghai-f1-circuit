import * as THREE from 'three';
import { V, rng, std, floodlit, lampMat, canvasTex } from './util.js';

function glowTexture() {
  return canvasTex(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,244,214,0.55)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  });
}

// 天空：天顶→地平线渐变 + 太阳圆盘与日晕 + 地平线薄雾；下半球为地面色（供环境反射使用）
const SKY_VERT = 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix * vec4(position * 100.0, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); }';
const SKY_FRAG = `uniform vec3 top; uniform vec3 bottom; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunAmt;
varying vec3 vP;
void main(){
  vec3 d = normalize(vP);
  float h = clamp(d.y * 1.15 + 0.04, 0.0, 1.0);
  vec3 col = mix(bottom, top, pow(h, 0.55));
  col = mix(col, bottom * 1.06, exp(-abs(d.y) * 18.0) * 0.6);           // 地平线薄雾
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 1800.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.08) * sunAmt; // 太阳与日晕
  col = mix(col, ground, smoothstep(0.0, -0.06, d.y));                    // 地面
  gl_FragColor = vec4(col, 1.0);
}`;
function skyMaterial(u, opts = {}) {
  return new THREE.ShaderMaterial({ uniforms: u, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, ...opts });
}

/**
 * cfg（由各赛道档案提供）：
 *   center    视角中心 [x, n]（米）
 *   trueNorth 真北在场景 (x, n) 坐标中的单位向量
 *   sun       白天太阳的方位角、高度角（度；按比赛时刻与经纬度算出）
 *   poles     是否沿赛道布置照明灯杆（灯杆位置没有可靠资料的赛道不放）
 */
export function buildEnvironment(scene, track, stands, renderer, cfg) {
  const CENTER = V(cfg.center[0], cfg.center[1]);
  const env = { glows: [] };
  const DAY = { top: C('#2f86e0'), bottom: C('#cfe6f7'), sun: C('#fff0d6'), hemiSky: C('#cfe4ff'), hemiGround: C('#7a7560'), sunPos: sunAt(cfg.trueNorth, cfg.sun.az, cfg.sun.el) };
  env.DAY = DAY;
  const rand = rng(20040926);

  // ── 天空 ──
  const skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, ground: { value: new THREE.Color('#c9ccd1') }, sunDir: { value: new THREE.Vector3(0.4, 0.75, -0.5) }, sunColor: { value: new THREE.Color('#fff1d6') }, sunAmt: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(skyU));
  sky.renderOrder = -1000; sky.frustumCulled = false;
  scene.add(sky);
  env.skyU = skyU;

  // 星空
  const sp = [];
  for (let i = 0; i < 1400; i++) {
    const th = rand() * Math.PI * 2, ph = Math.acos(rand() * 0.95 + 0.03);
    sp.push(Math.sin(ph) * Math.cos(th) * 6000, Math.cos(ph) * 6000, Math.sin(ph) * Math.sin(th) * 6000);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  env.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  env.stars.frustumCulled = false;
  scene.add(env.stars);

  // ── 地面 ──
  const grassTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#eceef0'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const l = 30 + Math.random() * 16;
      c.fillStyle = `hsla(210,6%,${l + 50}%,0.25)`;
      c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  }, [90, 90]);
  // 底图：OSM 未标注用途的土地在这一带基本是农田与绿地
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ map: grassTex, color: '#d3d6da', roughness: 1, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.renderOrder = -10;
  scene.add(ground);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  const nearStand = (x, z, pad = 0) => stands.some((s) => (s.center.x - x) ** 2 + (s.center.z - z) ** 2 < (s.radius + pad) ** 2);

  // ── 赛道照明灯杆 ──
  const poles = [];
  for (let i = 0; cfg.poles !== false && i < track.N; i += 34) {
    for (const side of [1, -1]) {
      if ((side > 0) === track.pitLeft && track.pitZone(i)) continue;
      const off = track.hw + 9 + (side > 0 ? track.gwL[i] : track.gwR[i]);
      const x = track.pts[i].x + track.nor[i].x * off * side, z = track.pts[i].z + track.nor[i].z * off * side;
      if (nearStand(x, z, -14)) continue;
      poles.push(x, z, Math.atan2(-track.nor[i].x * side, -track.nor[i].z * side));
    }
  }
  const nP = poles.length / 3, PH = 26;
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.5, PH, 6), std('#9aa0a8', { metalness: 0.6, roughness: 0.4 }, 0.3), nP);
  const headGeo = new THREE.BoxGeometry(4.2, 1.2, 0.8); headGeo.translate(0, 0, 0.6);
  const headMesh = new THREE.InstancedMesh(headGeo, lampMat('#f5f5f5', '#fff6de', 6), nP);
  const gp = [];
  for (let i = 0; i < nP; i++) {
    const x = poles[i * 3], z = poles[i * 3 + 1];
    p3.set(x, PH / 2, z); q.identity(); s3.set(1, 1, 1);
    poleMesh.setMatrixAt(i, m4.compose(p3, q, s3));
    p3.set(x, PH, z); q.setFromAxisAngle(up, poles[i * 3 + 2]);
    headMesh.setMatrixAt(i, m4.compose(p3, q, s3));
    gp.push(x, PH, z);
  }
  poleMesh.castShadow = true;
  scene.add(poleMesh, headMesh);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  const glow = new THREE.Points(gg, new THREE.PointsMaterial({
    map: glowTexture(), size: 46, sizeAttenuation: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, color: '#fff2d2', fog: false,
  }));
  scene.add(glow);
  env.glows.push(glow);

  // ── 光源 ──
  env.hemi = new THREE.HemisphereLight('#cfe6ff', '#6b7a55', 1.1);
  env.sun = new THREE.DirectionalLight('#fff4e0', 3);
  env.sun.castShadow = true;
  env.sun.shadow.mapSize.set(2048, 2048); // 阴影范围随视角缩放，2048 已足够清晰
  const sc = env.sun.shadow.camera;
  sc.left = -1250; sc.right = 1250; sc.top = 1250; sc.bottom = -1250; sc.near = 100; sc.far = 4200;
  env.sun.shadow.bias = -0.0004; env.sun.shadow.normalBias = 0.6;
  env.sun.target.position.copy(CENTER);
  scene.add(env.hemi, env.sun, env.sun.target);

  scene.fog = new THREE.Fog('#cfe4f5', 5200, 14000);

  // ── 环境反射：分别为白天和夜晚预先生成一张，玻璃、金属、水面据此反射天空 ──
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const u = THREE.UniformsUtils.clone(skyU);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial(u)));
    const bake = (k) => {
      u.top.value.lerpColors(DAY.top, NIGHT.top, k); u.bottom.value.lerpColors(DAY.bottom, NIGHT.bottom, k);
      u.ground.value.set(k ? '#0b0d10' : '#c9ccd1'); u.sunDir.value.copy(DAY.sunPos).normalize(); u.sunAmt.value = k ? 0 : 1;
      return pmrem.fromScene(envScene, 0.02).texture;
    };
    env.envDay = bake(0); env.envNight = bake(1);
    pmrem.dispose();
    scene.environment = env.envDay;
  }
  env.sky = sky;
  env.center = CENTER;
  return env;
}

const C = (h) => new THREE.Color(h);
// 白天的太阳按比赛时刻与经纬度算出真实方位（各赛道档案给出方位角、高度角）。
// 场景坐标由 trueNorth 换算：北 N、东 E = (N.n, -N.x)，水平方向 = cos(az)·N + sin(az)·E。
const sunAt = (trueNorth, azDeg, elDeg) => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  const [nx, nn] = trueNorth, ex = nn, en = -nx;
  const hx = Math.cos(az) * nx + Math.sin(az) * ex, hn = Math.cos(az) * nn + Math.sin(az) * en;
  return V(hx * Math.cos(el), hn * Math.cos(el), Math.sin(el)).multiplyScalar(2000);
};
const NIGHT = {
  top: C('#02040c'), bottom: C('#111d38'), sun: C('#8fb0ff'), hemiSky: C('#22355e'), hemiGround: C('#06080d'),
  sunPos: new THREE.Vector3(-700, 1400, -500),
};

/** t: 0 = 白天, 1 = 黑夜 */
export function applyTime(env, scene, t) {
  const L = THREE.MathUtils.lerp, DAY = env.DAY;
  env.skyU.top.value.lerpColors(DAY.top, NIGHT.top, t);
  env.skyU.bottom.value.lerpColors(DAY.bottom, NIGHT.bottom, t);
  // 黄昏暖色
  const dusk = Math.sin(t * Math.PI);
  env.skyU.bottom.value.lerp(C('#ff9a5c'), dusk * 0.55);
  scene.fog.color.copy(env.skyU.bottom.value);
  env.sun.color.lerpColors(DAY.sun, NIGHT.sun, t).lerp(C('#ff8a4a'), dusk * 0.5);
  env.sun.intensity = L(3.6, 0.28, t);
  env.sunDir = new THREE.Vector3().lerpVectors(DAY.sunPos, NIGHT.sunPos, t).normalize();
  env.sun.position.copy(env.sun.target.position).addScaledVector(env.sunDir, 2000);
  env.skyU.sunDir.value.copy(env.sunDir);
  env.skyU.sunAmt.value = 1 - THREE.MathUtils.smoothstep(t, 0.2, 0.6);
  env.skyU.ground.value.lerpColors(C('#c9ccd1'), C('#07090c'), t);
  if (env.envDay) { scene.environment = t < 0.5 ? env.envDay : env.envNight; scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.25, t); }
  env.hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, t);
  env.hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, t);
  env.hemi.intensity = L(0.48, 0.22, t); // 白天天光略收，阴影才有层次
  env.stars.material.opacity = THREE.MathUtils.smoothstep(t, 0.6, 1);
}

/** 阴影范围跟随视角：镜头越近，阴影贴图覆盖的范围越小、越清晰 */
// 斜看时镜头附近的物体也要在阴影范围内：阴影中心从目标点往镜头的地面投影挪一段，范围同时覆盖两者
const _fitC = new THREE.Vector3();
export function fitShadow(env, aim, dist, eye) {
  let target = aim, half = THREE.MathUtils.clamp(dist * 0.85, 45, 1300);
  if (eye) {
    _fitC.set(eye.x, 0, eye.z);
    const span = Math.hypot(_fitC.x - aim.x, _fitC.z - aim.z);
    _fitC.lerpVectors(aim, _fitC, 0.45).setY(0);
    target = _fitC;
    half = THREE.MathUtils.clamp(Math.max(dist * 0.6, span * 0.6 + 30), 45, 1300);
  }
  const before = env.sun.target.position.clone(), beforeHalf = env.sun.shadow.camera.right;
  const cam = env.sun.shadow.camera;
  const texel = (half * 2) / env.sun.shadow.mapSize.x;
  const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
  env.sun.target.position.set(tx, 0, tz);
  env.sun.target.updateMatrixWorld();
  if (env.sunDir) env.sun.position.set(tx, 0, tz).addScaledVector(env.sunDir, 2000);
  if (Math.abs(cam.right - half) / half > 0.04) {
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1500; cam.far = 2600 + half;
    cam.updateProjectionMatrix();
    env.sun.shadow.normalBias = texel * 1.2;
    env.sun.shadow.bias = -0.00015;
  }
  return !before.equals(env.sun.target.position) || beforeHalf !== env.sun.shadow.camera.right;
}
