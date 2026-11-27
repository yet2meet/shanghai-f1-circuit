import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { V, night, nightEmissives } from './util.js';
import { applyTime, fitShadow } from './environment.js';
import { initGuide } from './guide.js';
import { initAbout } from './about.js';
import { initDrawers, closeDrawers } from './drawers.js';
import { initShare } from './share.js';
import { createSatellite, SAT_CREDIT } from './satellite.js';
import { loadPhotoTextures } from './textures.js';
import { buildCamLimits } from './camlimits.js';
import { t as tr, L, onLang, isEn } from './i18n.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');

// ───────────────────────── 渲染器 ─────────────────────────
// 性能档位：手机 / 平板用更低的像素比与抗锯齿采样
const MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth <= 860;
// 手机屏幕像素密度高（iPhone 为 3），1.25 倍会被拉伸约 2.4 倍而发糊：手机上限提到 2，掉帧时再自动下调（最低 1）
const DPR_CAP = Math.min(devicePixelRatio, MOBILE ? 2 : 1.5);
const DPR_MIN = Math.min(DPR_CAP, MOBILE ? 1 : 0.75);
// 画面先渲染到后期处理缓冲（自带多重采样抗锯齿），画布本身不再开抗锯齿；
// 不用对数深度缓冲（会让显卡的提前深度剔除失效），改为按镜头距离动态调整近裁剪面来保证深度精度
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR_CAP);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 柔和阴影边缘
renderer.shadowMap.autoUpdate = false; // 阴影只在视角变化或每隔几帧更新一次
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 }));
const renderPass = new RenderPass(null, null);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const profiles = new Map();
const prepared = new Map();
let brand;
let shadowTarget;

export function prefetchCircuit(circuit) {
  if (!profiles.has(circuit.id)) {
    const loading = circuit.load().then((mod) => mod.default).catch((error) => {
      profiles.delete(circuit.id);
      throw error;
    });
    profiles.set(circuit.id, loading);
  }
  return profiles.get(circuit.id);
}

// 在实际搭建阶段之间让浏览器绘制地球，无需为每一阶段固定等待。
function paintOpportunity() {
  if (document.hidden) return Promise.resolve();
  if (globalThis.scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function homeView(camera, profile, center, home) {
  const aspect = innerWidth && innerHeight ? innerWidth / innerHeight : 1.6;
  const portrait = aspect < 0.85;
  camera.fov = portrait ? 55 : 38;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  const H = profile.home;
  const k = Math.max(1, H.span[portrait ? 1 : 0] / Math.tan(hf) / H.ref);
  const offsets = H.offsets(portrait, innerWidth > 860);
  home.target.copy(center).add(new THREE.Vector3(...offsets.target));
  home.pos.copy(home.target).add(new THREE.Vector3(...offsets.pos).multiplyScalar(k));
}

function sceneLighting(entry, time) {
  const { scene, built: { env }, sat, emissives } = entry;
  const eased = time * time * (3 - 2 * time);
  const lights = THREE.MathUtils.smoothstep(time, 0.45, 0.92);
  applyTime(env, scene, eased);
  sat.night(eased);
  for (const { m, max } of emissives) m.emissiveIntensity = max * lights;
  for (const g of env.glows) g.material.opacity = lights * 0.9;
  return { eased, lights };
}

function rendererLighting({ eased, lights }) {
  night.value = lights;
  bloom.strength = lights * 0.5;
  bloom.enabled = lights > 0.02;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1, 1.12, eased);
}

/** 构建并预渲染场景，之后的切换可直接复用几何、材质和 GPU 缓冲。 */
export async function prepareCircuit(circuit, progress, initialProfile) {
  if (prepared.has(circuit.id)) {
    progress(1, tr('正在接入赛道画面', 'Opening circuit view'));
    return prepared.get(circuit.id);
  }
  brand ??= fetch('./brand/manifest.json').then((r) => r.ok ? r.json() : null).catch(() => null);
  const [profile, assets] = await Promise.all([initialProfile || prefetchCircuit(circuit), brand]);
  progress(0.17, tr('已读取赛道资料', 'Circuit data ready'));
  await paintOpportunity();

  const scene = new THREE.Scene();
  const step = (value, label) => {
    progress(value, label);
    return paintOpportunity();
  };
  let built, emissives;
  try {
    built = await profile.build(scene, { renderer, step, brand: assets, tr });
  } finally {
    emissives = nightEmissives.splice(0);
  }
  const { env, stands } = built;
  if (!MOBILE) env.sun.shadow.mapSize.set(4096, 4096);
  // 每次只绘制一条赛道，各场景可轮流使用同一个阴影缓冲。
  if (shadowTarget) env.sun.shadow.map = shadowTarget;
  const sat = createSatellite(scene, { mobile: MOBILE, projection: profile.projection, venue: profile.venue });
  const camLimits = buildCamLimits(stands, { buildings: built.camBuildings || profile.osmData.OSM_BUILDINGS, venue: profile.venue, groundAt: built.groundAt });
  const entry = { circuit, scene, profile, built, sat, emissives, camLimits };
  const camera = new THREE.PerspectiveCamera(38, 1, 30, 14000);
  const home = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  homeView(camera, profile, env.center, home);
  camera.position.copy(home.target).add(new THREE.Vector3(-500, 6000, 0));
  camera.lookAt(home.target);
  const lighting = sceneLighting(entry, Number(Boolean(profile.defaultNight)));
  fitShadow(env, home.target, camera.position.distanceTo(home.target), camera.position);
  await step(0.85, tr('点亮灯光与材质', 'Lighting and materials'));
  try { await renderer.compileAsync(scene, camera); } catch { /* 首帧可以同步编译 */ }

  renderPass.scene = scene;
  renderPass.camera = camera;
  rendererLighting(lighting);
  renderer.shadowMap.needsUpdate = true;
  // 用小尺寸离屏画面上传纹理并准备后期处理，正式入场再按屏幕尺寸绘制。
  composer.setPixelRatio(1);
  composer.setSize(320, Math.round(320 / camera.aspect));
  composer.renderToScreen = false;
  try { composer.render(); } finally { composer.renderToScreen = true; }
  shadowTarget = env.sun.shadow.map;
  prepared.set(circuit.id, entry);
  progress(1, tr('场地已预备', 'Circuit prepared'));
  return entry;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

export function mountCircuit(entry) {
  const { circuit, scene, profile, built, sat, camLimits } = entry;
  const { STANDS, TURNS, TRUE_NORTH } = profile;
  const { track, stands, hitboxes, env, cars } = built;
  const seatKit = profile.seatKit || {};
  const { seatColor, seatMatrix, seatWorld: seatPos, seatFacing, SELECTED_COLOR } = seatKit;
  const standById = Object.fromEntries(stands.map((s) => [s.spec.id, s]));
  const fmtPrice = (p) => p == null ? tr('未收录票价', 'Price not recorded') : (profile.currency || '¥') + p.toLocaleString('zh-CN');
  const listeners = new AbortController();
  const { signal } = listeners;
  const camera = new THREE.PerspectiveCamera(38, 1, 30, 14000);
  renderPass.scene = scene;
  renderPass.camera = camera;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // 地图式操作：左键 / 单指拖动 = 沿地面平移；右键 / 双指拖动 = 旋转与倾斜；滚轮 / 双指捏合 = 朝指针处缩放
  const MAP_MOUSE = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  const MAP_TOUCH = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { ...MAP_MOUSE };
  controls.touches = { ...MAP_TOUCH };
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = 1.5;
  controls.minDistance = 0.5; // 推到 8 m 以内后继续放大会变成向前走（见 freeCam），不会卡住
  controls.maxDistance = 6500;
  controls.zoomToCursor = true;
  controls.zoomSpeed = 1.1;
  controls.panSpeed = 1.0;

  const HOME = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  function updateHome() {
    homeView(camera, profile, env.center, HOME);
    controls.maxDistance = HOME.pos.distanceTo(HOME.target) * 1.2;
  }
  updateHome();
  camera.position.copy(HOME.target).add(new THREE.Vector3(-500, 6000, 0));
  camera.lookAt(HOME.target);
  controls.target.copy(HOME.target);

  // ───────────────────────── 状态 ─────────────────────────
  const state = {
    mode: 'overview',        // overview | stand | seats
    stand: null,
    hoverSeat: -1,
    hoverStand: null,
    selected: new Map(),     // 'A:123' -> { stand, idx }
    nightTarget: 0,
    t: 0,
  };
  const MAX_SEATS = 6;

  // ───────────────────────── 镜头飞行 ─────────────────────────
  let fly = null;
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function flyTo(pos, target, dur = 1.6) {
    exitSeatCam();
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(),
      started: performance.now(), duration: dur * 1000 };
    controls.enabled = false;
  }
  // ───────────────────────── 自由视角：边界、防穿模、随缩放自动倾斜 ─────────────────────────
  const _off = new THREE.Vector3(), _fwd = new THREE.Vector3(), _sph = new THREE.Spherical();
  let lastDist = 0, limitsDirty = true;
  const WALK_D = 8; // 镜头与注视点的最近距离；再放大就向前走
  controls.addEventListener('change', () => { limitsDirty = true; });
  function freeCam() {
    if (!limitsDirty) return;              // 镜头没动就什么都不算
    limitsDirty = false;
    const t = controls.target, p = camera.position;
    let d = p.distanceTo(t);
    const collide = state.mode !== 'seats'; // 选座模式要压到顶棚下贴近座位，只限制范围与离地高度
    const onGround = collide && p.y <= camLimits.minYAt(p.x, p.z) + 0.6 && d < 120;
    if (lastDist && d < lastDist - 1e-3 && collide && (onGround || d < WALK_D)) {
      // 已经贴近地面时继续放大 = 向前走：保持距离，镜头和注视点一起沿水平方向前进，视线逐渐放平
      const step = Math.min(15, ((lastDist - d) / lastDist) * 40); // 每格滚轮约前进 2 m，与当前距离无关
      _off.subVectors(p, t).setLength(lastDist);
      p.copy(t).add(_off);
      _fwd.subVectors(t, p).setY(0);
      if (_fwd.lengthSq() > 1e-6) {
        _fwd.normalize();
        p.addScaledVector(_fwd, step); t.addScaledVector(_fwd, step);
        const dy = (camLimits.minYAt(p.x, p.z) - p.y) * Math.min(1, step * 0.08); // 边走边降到人眼高度
        p.y += dy; t.y = Math.max(0, t.y + dy);
        _dir.subVectors(t, p).normalize();
        const el = Math.asin(THREE.MathUtils.clamp(_dir.y, -1, 1));
        const el2 = el + (-0.14 - el) * 0.25;  // 目标俯角约 8°，接近站立时平视
        _dir.set(_fwd.x * Math.cos(el2), Math.sin(el2), _fwd.z * Math.cos(el2));
        t.copy(p).addScaledVector(_dir, lastDist);
      }
      d = lastDist;
    } else if (lastDist && Math.abs(Math.log(d / lastDist)) > 1e-4 && collide) {
      // 空中缩放时顺带调整倾斜：拉远逐渐变成俯视，推近逐渐放平（只在缩放时生效，不干扰手动旋转）
      const s = THREE.MathUtils.clamp(Math.log(d / 8) / Math.log(2400 / 8), 0, 1);
      const want = THREE.MathUtils.lerp(1.42, 0.72, s);
      _sph.setFromVector3(_off.subVectors(p, t));
      _sph.phi += (want - _sph.phi) * Math.min(1, Math.abs(Math.log(d / lastDist)) * 3);
      _sph.makeSafe();
      p.copy(t).add(_off.setFromSpherical(_sph));
    }
    camLimits.apply(camera, t, { collide });
    // 贴地时朝指针缩放会把注视点拉到脚下，改为沿视线方向前进
    controls.zoomToCursor = !(collide && p.y <= camLimits.minYAt(p.x, p.z) + 0.6 && p.distanceTo(t) < 120);
    camera.lookAt(t);
    lastDist = p.distanceTo(t);
  }

  // ───────────────────────── 座位视角：原地环顾 ─────────────────────────
  // 相机固定在座位的视线点上，拖动只改变视线方向；滚轮 / ± 按钮改变视野角度（望远），不移动相机。
  let seatCam = null; // { eye, fov }：进入座位视角前的视野角度，退出时恢复
  const ORBIT_DEFAULTS = { minDistance: 0.5, minPolarAngle: 0, maxPolarAngle: controls.maxPolarAngle, enablePan: true, enableZoom: true };
  const SEAT_LOOK = 0.1; // 视线目标点离眼睛的距离（米），只用来确定朝向
  function enterSeatCam(eye) {
    seatCam = { eye: eye.clone(), fov: camera.fov };
    Object.assign(controls, { minDistance: 0.01, minPolarAngle: 0.05, maxPolarAngle: Math.PI - 0.05, enablePan: false, enableZoom: false });
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: THREE.MOUSE.ROTATE };   // 座位视角：拖动 = 原地环顾
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null };
    applyViewOffset();
    document.body.dataset.seatcam = '1';
  }
  function exitSeatCam() {
    if (!seatCam) return;
    Object.assign(controls, ORBIT_DEFAULTS);
    controls.mouseButtons = { ...MAP_MOUSE };
    controls.touches = { ...MAP_TOUCH };
    camera.fov = seatCam.fov;
    camera.updateProjectionMatrix();
    seatCam = null;
    applyViewOffset();
    delete document.body.dataset.seatcam;
  }
  function setSeatFov(fov) {
    camera.fov = THREE.MathUtils.clamp(fov, 12, 80);
    camera.updateProjectionMatrix();
  }
  /** 每帧把相机钉回座位，只保留拖动产生的视线方向 */
  const _dir = new THREE.Vector3();
  function pinSeatCam() {
    _dir.subVectors(controls.target, camera.position).normalize();
    camera.position.copy(seatCam.eye);
    controls.target.copy(seatCam.eye).addScaledVector(_dir, SEAT_LOOK);
  }
  canvas.addEventListener('wheel', (e) => {
    if (!seatCam) return;
    e.preventDefault();
    setSeatFov(camera.fov * Math.exp(e.deltaY * 0.0012));
  }, { passive: false, signal });

  /** 有顶棚的看台：把镜头压到顶棚底部以下，并相应拉远，保证从棚下看清座位 */
  function underRoof(s, pos, target) {
    const roof = s.spec.roofBottom;
    if (!roof || pos.y <= roof - 2.5) return pos;
    const y = roof - 2.5;
    const flat = pos.clone().sub(target).setY(0);
    const drop = pos.y - y;
    flat.setLength(flat.length() + drop * 0.6); // 降低高度的同时往外退一些，视角不至于太平
    return target.clone().add(flat).setY(y);
  }

  function viewFor(s, mode) {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(s.f, up);
    const target = s.center.clone();
    const mk = isMobile() ? 1.7 : 1;
    const presetEye = mode === 'seats' ? s.spec.seatingEye : s.spec.overviewEye;
    if (presetEye) {
      const eye = new THREE.Vector3(...presetEye);
      if (mode !== 'seats' && isMobile()) eye.lerp(target, -0.18);
      return { pos: eye, target };
    }
    if (mode === 'seats') {
      const d = THREE.MathUtils.clamp(s.L * 0.16 + 40, 52, 105) * (isMobile() ? 1.35 : 1);
      return { pos: underRoof(s, s.center.clone().addScaledVector(s.f, d).addScaledVector(up, s.H * 0.5 + 40), target), target };
    }
    const d = (s.L * 0.55 + 120) * mk;
    return { pos: s.center.clone().addScaledVector(s.f, d).addScaledVector(right, d * 0.45).addScaledVector(up, d * (s.spec.roof === 'cantilever' ? 0.5 : 0.72)), target };
  }

  // ───────────────────────── 座位着色 ─────────────────────────
  const _c = new THREE.Color(), _m = new THREE.Matrix4(), _white = new THREE.Color('#ffffff');
  function paintSeat(s, i) {
    const seat = s.seats[i];
    const sel = state.selected.has(s.spec.id + ':' + i);
    if (sel) _c.copy(SELECTED_COLOR);
    else {
      seatColor(s.spec, seat, _c);
      if (i === state.hoverSeat && s === state.stand) _c.lerp(_white, 0.6);
    }
    s.mesh.setColorAt(i, _c);
    s.mesh.instanceColor.needsUpdate = true;
    const k = sel ? 1.35 : 1;
    s.mesh.setMatrixAt(i, seatMatrix(s, i, k, sel ? 0.12 : 0, _m));
    s.mesh.instanceMatrix.needsUpdate = true;
  }
  function seatWorld(s, i) {
    return seatPos(s, i);
  }
  // 排号、座号是模型内按位置的计数（每层从前往后数排，面向赛道从左往右数座），不是票面座号
  const seatName = (s, seat) => (isEn()
    ? `${L(s.spec.zones[seat.zone], 'name')} · Row ${seat.row} · Seat ${seat.num} from left`
    : `${s.spec.zones[seat.zone].name} · 第 ${seat.row} 排 · 左起第 ${seat.num} 座`);
  const sideName = (b) => (b.side === 't1' ? tr('（1 号弯一侧）', ' (Turn 1 side)') : b.side === 't16' ? tr('（16 号弯一侧）', ' (Turn 16 side)') : '');
  const isMobile = () => innerWidth <= 860;

  function blockView(s, b) {
    const up = new THREE.Vector3(0, 1, 0);
    const k = isMobile() ? 1.5 : 1;
    const viewStand = b.roofBottom ? { ...s, spec: { ...s.spec, roofBottom: b.roofBottom } } : s;
    flyTo(underRoof(viewStand, b.center.clone().addScaledVector(b.f, 26 * k).addScaledVector(up, 15 * k), b.center), b.center, 1.1);
  }

  // ───────────────────────── UI：列表 ─────────────────────────
  const minPrice = (spec) => { const prices = Object.values(spec.zones).map((z) => z.price).filter((p) => p != null); return prices.length ? Math.min(...prices) : null; };
  const mainColor = (spec) => spec.color || Object.values(spec.zones).slice(-1)[0].color;
  const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  const listEl = $('#listItems');
  const fromTxt = () => tr(' 起', '+');
  function renderList() {
    listEl.innerHTML = '';
    STANDS.forEach((spec) => {
      const multi = Object.keys(spec.zones).length > 1;
      const b = document.createElement('button');
      b.className = 'item';
      b.dataset.id = spec.id;
      b.innerHTML = `<div class="badge" style="background:${mainColor(spec)}">${spec.code}</div>
        <div class="item-main"><b>${L(spec, 'name')}</b><span>${L(spec, 'turns')}</span></div>
        ${circuit.unpriced ? '' : `<div class="item-price">${fmtPrice(minPrice(spec))}<small>${multi ? tr('起 · ', 'from · ') : ''}${tr('三日票', '3-day')}</small></div>`}`;
      b.onclick = () => selectStand(spec.id);
      listEl.appendChild(b);
    });
  }
  renderList();

  // ───────────────────────── UI：场景标签 ─────────────────────────
  const labelsEl = $('#labels');
  labelsEl.replaceChildren();
  const labels = [];
  const standLabel = (s) => `<em style="background:${mainColor(s.spec)}">${s.spec.code}</em><b>${L(s.spec, 'name')}</b>${circuit.unpriced ? '' : `<span>${fmtPrice(minPrice(s.spec))}${Object.keys(s.spec.zones).length > 1 ? fromTxt() : ''}</span>`}`;
  stands.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML = standLabel(s);
    el.onclick = () => selectStand(s.spec.id);
    labelsEl.appendChild(el);
    labels.push({ el, pos: s.labelPos, kind: 'stand', id: s.spec.id, ax: -0.5, ay: -1, dy: -16 });
  });
  TURNS.forEach(([n, x, y, h = 0]) => {
    const el = document.createElement('div');
    el.className = 'turn';
    el.textContent = n;
    labelsEl.appendChild(el);
    labels.push({ el, pos: V(x, y, h + 14), kind: 'turn', ax: -0.5, ay: -0.5, dy: 0 });
  });
  // 地标标签（如滨海湾金沙、鱼尾狮公园）：像弯号一样标在地图上，点击镜头飞过去
  (profile.landmarks || []).forEach((lm) => {
    const el = document.createElement('div');
    el.className = 'lm glass';
    el.innerHTML = `<i></i><b>${L(lm, 'name')}</b>`;
    el.onclick = () => flyToLandmark(lm);
    labelsEl.appendChild(el);
    labels.push({ el, pos: V(lm.at[0], lm.at[1], lm.at[2] ?? 12), kind: 'landmark', lm, ax: -0.5, ay: -1, dy: lm.labelOffset ?? -6 });
  });
  function flyToLandmark(lm) {
    if (state.mode !== 'overview') goHome();
    const t = V(lm.at[0], lm.at[1], lm.targetY ?? (lm.at[2] ?? 12) * 0.25);
    const v = lm.view || [-230, 150, 260];
    flyTo(t.clone().add(new THREE.Vector3(v[0], v[1], v[2])), t, 1.8);
  }
  // 票区标签（进入选座后显示；只有一个票区的看台不重复标注）
  stands.forEach((s) => s.blocks && new Set(s.blocks.map((b) => b.zone)).size > 1 && (s.sectionBlocks ?? s.blocks).forEach((b) => {
    const el = document.createElement('div');
    el.className = 'sec off';
    el.style.setProperty('--c', s.spec.zones[b.zone].color);
    el.textContent = L(s.spec.zones[b.zone], 'name');
    el.onclick = () => blockView(s, b);
    labelsEl.appendChild(el);
    labels.push({ el, pos: b.label, kind: 'block', id: s.spec.id, zone: b.zone, ax: -0.5, ay: -1, dy: 0 });
  }));

  // ───────────────────────── UI：小地图 ─────────────────────────
  // 小地图与全景视角同向：orient 'x-up'（上海：屏幕右 = 场景 +z，屏幕上 = 场景 +x）；'north-up'（屏幕右 = 场景 +x，屏幕上 = 场景 -z）
  const mm = (() => {
    const MM = profile.minimap;
    const toMM = MM.orient === 'north-up' ? (x, z) => [x, z] : (x, z) => [z, -x];
    const arrowDeg = (u, v) => (Math.atan2(u, -v) * 180) / Math.PI; // 把“朝上”的图形转到小地图上的方向 (u, v)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const grow = (p, r = 0) => { const [u, v] = toMM(p.x, p.z); x0 = Math.min(x0, u - r); x1 = Math.max(x1, u + r); z0 = Math.min(z0, v - r); z1 = Math.max(z1, v + r); };
    track.pts.forEach((p) => grow(p));
    stands.forEach((s) => grow(s.center, 60));
    const pad = 50;
    x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
    let d = '';
    for (let i = 0; i < track.N; i += 3) { const [u, v] = toMM(track.pts[i].x, track.pts[i].z); d += (i ? 'L' : 'M') + u.toFixed(0) + ' ' + v.toFixed(0); }
    const turns = TURNS.map(([n, x, y]) => {
      // 弯号放在赛道外侧
      const i = track.nearest(x, -y), k = track.curv[i] < 0 ? 1 : -1;
      const [u, v] = toMM(track.pts[i].x + track.nor[i].x * MM.turnOffset * k, track.pts[i].z + track.nor[i].z * MM.turnOffset * k);
      return `<text class="mm-turn" x="${u.toFixed(0)}" y="${(v + 14).toFixed(0)}">${n}</text>`;
    }).join('');
    const marks = stands.map((s) => { const [u, v] = toMM(s.center.x, s.center.z); return `<g class="mm-stand" data-id="${s.spec.id}" transform="translate(${u.toFixed(0)} ${v.toFixed(0)})">
        <title>${L(s.spec, 'name')}</title><circle class="mm-ring" r="62"/><circle r="46" fill="${mainColor(s.spec)}"/><text y="17">${s.spec.code}</text></g>`; }).join('');
    const el = $('#minimap');
    const [nu, nv] = toMM(TRUE_NORTH[0], -TRUE_NORTH[1]);
    const mmW = x1 - x0, mmH = z1 - z0;
    el.style.setProperty('--mm-ratio', (mmW / mmH).toFixed(4));
    el.innerHTML = `<svg viewBox="${x0} ${z0} ${mmW} ${mmH}" style="aspect-ratio:${mmW.toFixed(1)}/${mmH.toFixed(1)}" role="img" aria-label="${tr('赛道小地图', 'Track map')}">
      <path class="mm-track-o" d="${d}Z"/><path class="mm-track" d="${d}Z"/>
      ${MM.startLine || ''}
      ${turns}${marks}
      <g id="mmCam"><g transform="scale(${MM.coneScale || 1})"><path d="M0 0 L-70 -150 A165 165 0 0 1 70 -150 Z"/><circle r="20"/></g></g>
    </svg><span class="mm-n" style="--north:${arrowDeg(nu, nv).toFixed(0)}deg">N</span>`;
    const syncMinimapClear = () => {
      const h = el.offsetHeight;
      document.documentElement.style.setProperty('--mm-clear', `${h ? h + 36 : 276}px`);
    };
    syncMinimapClear();
    requestAnimationFrame(syncMinimapClear);
    addEventListener('resize', syncMinimapClear, { signal });
    el.addEventListener('click', (e) => {
      const g = e.target.closest('.mm-stand');
      if (g) selectStand(g.dataset.id);
    }, { signal });
    return { cam: el.querySelector('#mmCam'), marks: [...el.querySelectorAll('.mm-stand')], x0, x1, z0, z1, toMM, arrowDeg };
  })();
  function updateMinimap() {
    const t = controls.target, c = camera.position;
    const [u, v] = mm.toMM(t.x, t.z);
    const x = THREE.MathUtils.clamp(u, mm.x0 + 30, mm.x1 - 30), z = THREE.MathUtils.clamp(v, mm.z0 + 30, mm.z1 - 30);
    const [du, dv] = mm.toMM(t.x - c.x, t.z - c.z);
    const a = mm.arrowDeg(du, dv);
    mm.cam.setAttribute('transform', `translate(${x.toFixed(0)} ${z.toFixed(0)}) rotate(${a.toFixed(1)})`);
  }

  const _v = new THREE.Vector3();
  function updateLabels() {
    const w = innerWidth, h = innerHeight;
    const mobile = isMobile();
    const dist = camera.position.distanceTo(controls.target);
    const groundY = built.groundAt?.(camera.position.x, camera.position.z) ?? 0;
    const low = camera.position.y - groundY < 40; // 贴近地面时只保留近处的标签
    const homeDist = HOME.pos.distanceTo(HOME.target); // 全景镜头的距离：手机竖屏的全景比桌面远得多，标签的显示范围随它放宽
    for (const l of labels) {
      _v.copy(l.pos).project(camera);
      let show = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      if (show && low && l.kind !== 'block' && l.kind !== 'landmark') show = camera.position.distanceTo(l.pos) < (l.kind === 'stand' ? 450 : 220);
      if (l.kind === 'stand') show &&= state.mode !== 'seats' && !(state.mode === 'stand' && state.stand.spec.id === l.id);
      else if (l.kind === 'block') show &&= state.mode === 'seats' && state.stand.spec.id === l.id && camera.position.distanceTo(l.pos) < 330 && camera.position.y > l.pos.y;
      else if (l.kind === 'landmark') show &&= state.mode !== 'seats' && dist < Math.max(4200, homeDist * 1.3) && !(low && camera.position.distanceTo(l.pos) > 900);
      else show &&= state.mode === 'overview' ? dist < Math.max(mobile ? 0 : 3200, homeDist * 1.15) : state.mode === 'stand';
      l.el.classList.toggle('off', !show);
      if (!show) continue;
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h + l.dy;
      l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${l.ax * 100}%,${l.ay * 100}%)`;
      if (l.kind === 'stand') l.el.classList.toggle('hot', state.hoverStand === l.id);
    }
  }

  // ───────────────────────── UI：详情面板 ─────────────────────────
  const detail = $('#detail');
  function zoneRow(z) {
    const sub = z.day ? `${tr('周五', 'Fri')} ${fmtPrice(z.day.fri)} · ${tr('周六', 'Sat')} ${fmtPrice(z.day.sat)} · ${tr('周日', 'Sun')} ${fmtPrice(z.day.sun)}` : L(z, 'note') || '';
    return `<div class="zone"><i style="background:${z.color}"></i>
      <div class="zone-main"><b>${L(z, 'name')}</b><em class="tag ok">${L(z, 'tag') || tr('官方票价', 'Official')}</em><span>${sub}</span></div>
      ${circuit.unpriced ? '' : `<div class="zone-price">${fmtPrice(z.price)}</div>`}</div>`;
  }
  function renderDetail() {
    const s = state.stand;
    if (!s) { detail.classList.add('hidden'); return; }
    detail.classList.remove('hidden');
    const spec = s.spec;
    const head = `<div class="d-head"><div class="badge" style="background:${mainColor(spec)}">${spec.code}</div>
      <div><h2>${L(spec, 'name')}</h2><p>${L(spec, 'turns')}</p></div>
      <button class="close" data-act="close" aria-label="${tr('关闭', 'Close')}">${X_ICON}</button></div>`;

    if (state.mode === 'seats') {
      const picked = [...state.selected.values()];
      const rows = picked.map((p) => {
        const seat = p.stand.seats[p.idx], z = p.stand.spec.zones[seat.zone];
        return `<div class="seat-row" data-act="view" data-key="${p.stand.spec.id}:${p.idx}" title="${tr('点击切换到该座位视角', 'View from this seat')}"><i style="background:${z.color}"></i>
          <div>${seatName(p.stand, seat)}<small>${L(z, 'name')}${circuit.unpriced ? '' : ` · ${tr('三日票', '3-day pass')}`}</small></div>${circuit.unpriced ? '' : `<b>${fmtPrice(z.price)}</b>`}
          <button data-act="remove" data-key="${p.stand.spec.id}:${p.idx}" aria-label="${tr('移除', 'Remove')}">${X_ICON}</button></div>`;
      }).join('');
      // 票区快速定位：只列官方票区（A 看台的 A上 被铂金区分成 1 号弯一侧和 16 号弯一侧两段）
      const zoneCount = new Set(s.blocks.map((b) => b.zone)).size;
      const seen = new Set();
      const chipList = s.blocks.filter((b) => { const k = b.detail ?? b.zone + b.side; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((x, y) => y.tier - x.tier);
      const sections = zoneCount > 1
        ? `<div class="sec-title">${circuit.unpriced ? tr('模型分区 · 点击定位', 'Model sections · tap to locate') : tr('官方票区 · 点击定位', 'Official zones · tap to locate')}</div>
          <div class="chips wide">${chipList.map((b) => `<button class="chip" data-act="block" data-b="${b.idx}" style="--c:${spec.zones[b.zone].color}">${b.detail ?? L(spec.zones[b.zone], 'name')}${sideName(b)}</button>`).join('')}</div>`
        : circuit.unpriced
          ? `<div class="sec-title">${tr('模型区域', 'Model area')}</div><p class="d-desc" style="margin:0 2px 12px">${tr('模型未按官方票区细分。', 'The model does not reproduce official ticket subdivisions.')}</p>`
          : `<div class="sec-title">${tr('官方票区', 'Official zone')}</div><p class="d-desc" style="margin:0 2px 12px">${tr(`整座看台为同一票区：${Object.values(spec.zones)[0].name}。官方未公布更细的分区编号。`, `The whole stand is one zone: ${L(Object.values(spec.zones)[0], 'name')}. No finer section numbers are published officially.`)}</p>`;
      detail.innerHTML = `<div class="d-scroll">${head}
        <div class="legend" style="margin-top:16px">
          ${Object.values(spec.zones).map((z) => `<span><i style="background:${z.color}"></i>${L(z, 'name')}${circuit.unpriced ? '' : ` ${fmtPrice(z.price)}`}</span>`).join('')}
        </div>
        ${sections}
        <div class="sec-title" style="margin-top:14px">${tr('已标记座位', 'Marked seats')}（${picked.length}/${MAX_SEATS}）</div>
        ${rows || `<div class="cart-empty">${tr('点击座位标记，双击直接进入座位视角', 'Tap a seat to mark it; double-tap to view from it')}</div>`}
        <p class="seat-note">${tr('排号、座号为模型内按位置的计数（从前往后数排、面向赛道从左往右数座），不是票面座号。', 'Row and seat numbers are counted by position in the model (rows front to back, seats left to right facing the track) and are not the numbers printed on tickets.')}</p>
        <div class="actions">
          <button class="btn primary" data-act="seatview" ${picked.length ? '' : 'disabled'}>${tr('座位视角', 'Seat view')}</button>
          <div class="btn-row">
            <button class="btn ghost" data-act="back">${tr('返回看台', 'Back to stand')}</button>
          </div>
        </div></div>`;
      return;
    }

    const stats = spec.type === 'seats'
      ? `<div class="stat"><small>${tr('入口', 'Entrance')}</small><b>${L(spec, 'gate')}</b></div>
         <div class="stat"><small>${tr('模型座位', 'Seats (model)')}</small><b>${s.seats.length.toLocaleString()}</b></div>
         <div class="stat"><small>${circuit.unpriced ? tr('分区', 'Sections') : tr('官方票区', 'Zones')}</small><b>${new Set(s.blocks.map((b) => b.zone)).size}${tr(' 个', '')}</b></div>`
      : spec.type === 'block'
      ? `<div class="stat"><small>${tr('入口', 'Entrance')}</small><b>${L(spec, 'gate')}</b></div>
         <div class="stat"><small>${tr('通行票区', 'Access zones')}</small><b>${L(spec, 'access')}</b></div>
         <div class="stat"><small>${tr('3D 体量', '3D volume')}</small><b>${tr('示意', 'Schematic')}</b></div>`
      : `<div class="stat"><small>${tr('入口', 'Entrance')}</small><b>${L(spec, 'gate')}</b></div>
         <div class="stat"><small>${tr('类型', 'Type')}</small><b>${spec.type === 'grass' ? tr('草地', 'Grass') : tr('款待', 'Hospitality')}</b></div>
         <div class="stat"><small>${tr('座位', 'Seating')}</small><b>${spec.type === 'grass' ? tr('不对号', 'Unreserved') : tr('包厢', 'Suite')}</b></div>`;
    detail.innerHTML = `<div class="d-scroll">${head}
      <p class="d-desc">${L(spec, 'desc')}</p>
      <div class="stats">${stats}</div>
      ${spec.grouped ? `<div class="sec-title">${tr('选择分区', 'Choose a section')}</div><div class="chips wide">${(s.sectionBlocks ?? s.blocks).map((b) => `<button class="chip" data-act="group-zone" data-b="${b.idx}" style="--c:${spec.zones[b.zone].color}">${L(spec.zones[b.zone], 'name')}</button>`).join('')}</div>` : ''}
      ${spec.grouped || circuit.unpriced ? '' : `<div class="sec-title">${tr('票价 · 三日票', 'Prices · 3-day pass')}</div>${Object.values(spec.zones).map(zoneRow).join('')}`}
      <div class="actions">
        ${spec.type === 'seats'
          ? `<button class="btn primary" data-act="seats"><svg viewBox="0 0 24 24"><path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4zM7 18v2M17 18v2"/></svg>${tr('进入选座', 'Choose seats')}</button>`
          : spec.type === 'block'
          ? `<button class="btn ghost" disabled>${tr('座位模型未建：官网未公布看台范围与座位图', 'No seat model: the website publishes no stand extent or seat map')}</button>`
          : `<button class="btn ghost" disabled>${spec.type === 'grass' ? tr('草地票不对号入座', 'Grass areas are unreserved') : tr('款待套票需官方渠道预订', 'Hospitality is booked through official channels')}</button>`}
      </div></div>`;
  }
  detail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') goHome();
    else if (act === 'seats') enterSeats();
    else if (act === 'back') selectStand(state.stand.spec.id);
    else if (act === 'remove') toggleSeat(b.dataset.key);
    else if (act === 'seatview') { const last = [...state.selected.values()].pop(); if (last) seatView(last.stand, last.idx); }
    else if (act === 'block') blockView(state.stand, state.stand.blocks[+b.dataset.b]);
    else if (act === 'group-zone') { const block = state.stand.blocks[+b.dataset.b]; enterSeats(); blockView(state.stand, block); }
    else if (act === 'view') { const p = state.selected.get(b.dataset.key); if (p) seatView(p.stand, p.idx); }
  }, { signal });

  /** 手机端底部有面板时，把画面整体上移，避免看台被面板挡住 */
  function applyViewOffset() {
    const w = innerWidth, h = innerHeight;
    if (isMobile() && state.mode !== 'overview' && !seatCam && w && h) camera.setViewOffset(w, h, 0, Math.round(h * 0.2), w, h);
    else camera.clearViewOffset();
  }
  function syncList() {
    document.body.dataset.mode = state.mode;
    applyViewOffset();
    mm.marks.forEach((g) => g.classList.toggle('on', state.stand?.spec.id === g.dataset.id));
    listEl.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', state.stand?.spec.id === el.dataset.id));
    $('#hint').textContent = state.mode === 'seats'
      ? tr('拖动平移 · 右键旋转 · 滚轮缩放 · 点击票区或座位 · 双击进入座位视角 · Esc 返回', 'Drag to move · right-drag to rotate · scroll to zoom · click a zone or seat · double-click for seat view · Esc to go back')
      : circuit.hasStands
        ? tr('拖动平移 · 右键旋转 · 滚轮缩放（贴地后继续滚动 = 前进）· 点击看台探索', 'Drag to move · right-drag to rotate · scroll to zoom (keep scrolling at ground level to walk) · click a stand')
        : tr('拖动平移 · 右键旋转 · 滚轮缩放（贴地后继续滚动 = 前进）', 'Drag to move · right-drag to rotate · scroll to zoom (keep scrolling at ground level to walk)');
  }

  // ───────────────────────── 交互流程 ─────────────────────────
  function clearHover() {
    const s = state.stand, i = state.hoverSeat;
    state.hoverSeat = -1;
    if (s?.mesh && i >= 0) paintSeat(s, i);
    tooltip.classList.remove('on');
  }
  function selectStand(id) {
    clearHover();
    state.stand = standById[id];
    state.mode = 'stand';
    const v = viewFor(state.stand, 'stand');
    flyTo(v.pos, v.target);
    renderDetail(); syncList();
  }
  function enterSeats() {
    if (!state.stand?.mesh) return;
    state.mode = 'seats';
    const v = viewFor(state.stand, 'seats');
    flyTo(v.pos, v.target, 1.3);
    renderDetail(); syncList();
  }
  function goHome() {
    clearHover();
    updateHome();
    state.mode = 'overview';
    state.stand = null;
    flyTo(HOME.pos, HOME.target, 1.8);
    renderDetail(); syncList();
  }
  function toggleSeat(key) {
    const [id, idxS] = key.split(':');
    const s = standById[id], idx = +idxS;
    if (state.selected.has(key)) state.selected.delete(key);
    else {
      if (state.selected.size >= MAX_SEATS) return toast(tr(`最多同时标记 ${MAX_SEATS} 个座位`, `You can mark up to ${MAX_SEATS} seats`));
      state.selected.set(key, { stand: s, idx });
    }
    paintSeat(s, idx);
    renderDetail();
  }
  // 手机端座位视角：收起底部大面板，只留一条小胶囊（座位名 · 票价 · 退出），不挡视野
  let seatNow = null;
  const seatBar = document.createElement('div');
  seatBar.id = 'seatBar';
  seatBar.className = 'glass';
  document.body.appendChild(seatBar);
  function renderSeatBar() {
    if (!seatNow) return;
    const seat = seatNow.s.seats[seatNow.idx], z = seatNow.s.spec.zones[seat.zone];
    seatBar.innerHTML = `<i style="background:${z.color}"></i><div><b>${seatName(seatNow.s, seat)}</b><small>${circuit.unpriced ? tr('模型示意', 'Schematic model') : `${tr('三日票', '3-day pass')} ${fmtPrice(z.price)}`}</small></div><button>${tr('退出', 'Exit')}</button>`;
  }
  seatBar.addEventListener('click', (e) => { if (e.target.closest('button')) enterSeats(); });
  function seatView(s, idx) {
    const p = seatWorld(s, idx);
    const eye = p.clone().add(new THREE.Vector3(0, 1.25, 0)); // 坐姿视线高度
    // 视线：朝向赛道、略微向下（与看向 14 m 外、低 2.85 m 的点同一方向）
    const dir = seatFacing(s, idx).clone().multiplyScalar(14).add(new THREE.Vector3(0, -2.85, 0)).normalize();
    flyTo(eye, eye.clone().addScaledVector(dir, SEAT_LOOK), 1.4);
    enterSeatCam(eye);
    seatNow = { s, idx }; renderSeatBar();
    toast(isMobile() ? tr('座位视角 · 拖动环顾 · ± 望远', 'Seat view · drag to look around · ± to zoom') : tr('座位视角 · 拖动环顾 · 滚轮望远', 'Seat view · drag to look around · scroll to zoom'));
  }

  // ───────────────────────── 指针拾取 ─────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tooltip = $('#tooltip');
  let pointer = null, down = null, lastClick = 0, lastKey = '';
  let lastPointerMove = 0;
  canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; lastPointerMove = performance.now(); }, { signal });
  canvas.addEventListener('pointerleave', () => { pointer = null; clearHover(); state.hoverStand = null; }, { signal });
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; }, { signal });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    pick(e.clientX, e.clientY);
    if (state.mode === 'seats' && state.hoverSeat >= 0) {
      const now = performance.now();
      const key = state.stand.spec.id + ':' + state.hoverSeat;
      const dbl = now - lastClick < 340 && lastKey === key;
      lastKey = key;
      if (dbl) {
        if (!state.selected.has(key)) toggleSeat(key);
        if (state.selected.has(key)) seatView(state.stand, state.hoverSeat);
      } else toggleSeat(key);
      lastClick = now;
    } else if (state.hoverStand) selectStand(state.hoverStand);
  }, { signal });
  function pick(x, y) {
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (state.mode === 'seats') {
      const s = state.stand;
      const i = s.pickSeat(ray.ray);
      if (i !== state.hoverSeat) {
        const prev = state.hoverSeat;
        state.hoverSeat = i;
        if (prev >= 0) paintSeat(s, prev);
        if (i >= 0) paintSeat(s, i);
      }
      if (i >= 0) {
        const seat = s.seats[i], z = s.spec.zones[seat.zone];
        tooltip.innerHTML = `<b>${seatName(s, seat)}</b><small>${state.selected.has(s.spec.id + ':' + i) ? tr('已标记 · 再次点击取消', 'Marked · click again to unmark') : circuit.unpriced ? L(z, 'name') : `${L(z, 'name')} · ${tr('三日票', '3-day')} ${fmtPrice(z.price)}`}</small>`;
        tooltip.style.transform = `translate(${Math.min(x + 16, innerWidth - 240)}px,${y + 18}px)`;
        tooltip.classList.add('on');
        canvas.style.cursor = 'pointer';
      } else { tooltip.classList.remove('on'); canvas.style.cursor = ''; }
      state.hoverStand = null;
      return;
    }
    const hit = ray.intersectObjects(hitboxes, false)[0];
    const id = hit ? hit.object.userData.standId : null;
    state.hoverStand = id && !(state.mode === 'stand' && state.stand.spec.id === id) ? id : null;
    canvas.style.cursor = state.hoverStand ? 'pointer' : '';
  }

  // ───────────────────────── 工具条 / 主题 ─────────────────────────
  function dolly(k) {
    if (fly) return;
    if (seatCam) return setSeatFov(camera.fov * (k < 1 ? 0.7 : 1.4));
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    const len = THREE.MathUtils.clamp(dir.length() * k, controls.minDistance, controls.maxDistance);
    flyTo(controls.target.clone().add(dir.setLength(len)), controls.target, 0.45);
  }
  $('#zoomIn').onclick = () => dolly(0.62);
  $('#zoomOut').onclick = () => dolly(1.6);
  $('#home').onclick = goHome;
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.mode === 'seats') selectStand(state.stand.spec.id);
    else if (state.mode === 'stand') goHome();
  }, { signal });

  const seg = $('#themeSeg');
  function setNight(on, { instant = false, silent = false } = {}) {
    state.nightTarget = on ? 1 : 0;
    if (instant) { state.t = state.nightTarget; applyNight(state.t); }
    seg.classList.toggle('night', on);
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'night') === on));
    document.documentElement.dataset.theme = on ? 'dark' : 'light';
    if (!silent) toast(on ? tr('黑夜模式 · 赛道灯光自动开启', 'Night mode · circuit lights on') : tr('白天模式', 'Day mode'));
  }
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setNight(b.dataset.mode === 'night');
  }, { signal });

  function applyNight(time) {
    rendererLighting(sceneLighting(entry, time));
  }
  setNight(Boolean(profile.defaultNight), { instant: true, silent: true });

  // ───────────────────────── 循环 ─────────────────────────
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    bloom.setSize(Math.ceil((w * renderer.getPixelRatio()) / 2), Math.ceil((h * renderer.getPixelRatio()) / 2)); // 泛光用半分辨率
    camera.aspect = w / h;
    const seatFov = seatCam ? camera.fov : null;
    updateHome();
    if (seatCam) { seatCam.fov = camera.fov; camera.fov = seatFov; }
    applyViewOffset();
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, { signal });
  resize();

  const clock = new THREE.Clock();
  // ── 运行时的性能控制 ──
  const perf = { ema: 16, dpr: DPR_CAP, slow: 0, fast: 0, frame: 0, lastShadow: -99 };
  const lastCam = new THREE.Vector3(), lastTgt = new THREE.Vector3();
  let camMoved = true;
  /** 自适应画质：持续掉帧时降低像素比，长时间流畅再升回去 */
  function governor(dt) {
    perf.ema = perf.ema * 0.95 + dt * 1000 * 0.05;
    if (perf.ema > 26) { perf.slow += dt; perf.fast = 0; } else if (perf.ema < 14) { perf.fast += dt; perf.slow = 0; } else { perf.slow = perf.fast = 0; }
    let next = perf.dpr;
    if (perf.slow > 1.5 && perf.dpr > DPR_MIN) next = Math.max(DPR_MIN, perf.dpr - 0.25);
    if (perf.fast > 4 && perf.dpr < DPR_CAP) next = Math.min(DPR_CAP, perf.dpr + 0.25);
    if (next !== perf.dpr) { perf.dpr = next; perf.slow = perf.fast = 0; renderer.setPixelRatio(next); resize(); }
  }
  let skip = false, frameId = 0;
  function frame() {
    frameId = requestAnimationFrame(frame);
    const elapsed = clock.getDelta();
    const dt = Math.min(elapsed, 0.05);
    // 画面静止时降到约 30 帧/秒（赛道上的赛车仍在动），节省一半的显卡开销
    const busy = fly || camMoved || state.t !== state.nightTarget || performance.now() - lastPointerMove < 600;
    if (busy) governor(dt); // 只用连续渲染时的真实帧间隔来判断是否掉帧
    skip = !busy && !skip;
    if (skip) { perfClock.dt += dt; return; }
    const step = Math.min(dt + perfClock.dt, 0.1); perfClock.dt = 0;
    tick(step, elapsed);
  }
  const perfClock = { dt: 0 };
  function tick(dt, visualDt = dt) {
    perf.frame++;
    if (state.t !== state.nightTarget) {
      const d = visualDt / 2.4;
      state.t = state.nightTarget > state.t ? Math.min(1, state.t + d) : Math.max(0, state.t - d);
      applyNight(state.t);
    }
    if (fly) {
      const progress = THREE.MathUtils.clamp((performance.now() - fly.started) / fly.duration, 0, 1);
      const e = ease(progress);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      camera.lookAt(controls.target);
      if (progress === 1) { fly = null; controls.enabled = true; lastDist = 0; limitsDirty = true; } // 飞行结束后不触发自动倾斜
    } else {
      controls.update();
      if (seatCam) pinSeatCam();
      else freeCam();
    }
    const dist = camera.position.distanceTo(controls.target);
    camMoved = camera.position.distanceToSquared(lastCam) > 1e-4 || controls.target.distanceToSquared(lastTgt) > 1e-4;
    lastCam.copy(camera.position); lastTgt.copy(controls.target);
    // 近裁剪面随镜头距离变化：近看时 0.3 m，远看时放宽，保证深度精度
    const near = THREE.MathUtils.clamp(Math.min(dist, camera.position.y) * 0.02, 0.3, 30);
    if (Math.abs(camera.near - near) / near > 0.15) { camera.near = near; camera.updateProjectionMatrix(); }
    const shadowMoved = fitShadow(env, controls.target, dist, camera.position);
    // 阴影：视角变化时立即重画，否则每 4 帧一次（让行驶中的赛车阴影跟上）
    if (shadowMoved || camMoved || perf.frame - perf.lastShadow >= 4) { renderer.shadowMap.needsUpdate = true; perf.lastShadow = perf.frame; }
    // 看台细节层级：镜头离看台较远时用座面条带代替逐个座位
    for (const s of stands) {
      if (!s.carpet) continue;
      const near = camera.position.distanceTo(s.center) < 280 + s.L * 0.5 || state.stand === s;
      s.mesh.visible = near; s.carpet.visible = !near;
    }
    if (pointer && !fly && !down?.dragging) pick(pointer.x, pointer.y);
    cars.update(dt);
    built.update?.(dt, camera); // 赛道自己的逐帧更新（上海：卡丁车、车库内部细节）
    composer.render();
    updateLabels();
    updateMinimap();

  }

  renderDetail();
  syncList();
  initGuide(profile.info, { offer: false });
  initAbout(profile.info);
  if (!$('#shareBtn')) initShare(toast, () => { composer.render(); return renderer.domElement; });
  initDrawers(profile.info, { signal });
  fitShadow(env, controls.target, camera.position.distanceTo(controls.target), camera.position);
  renderer.shadowMap.needsUpdate = true;
  tick(0); // 首帧与界面都提交后，启动页才获准收尾。

  // 卫星底图开关：第一次打开时才下载影像
  {
    const btn = $('#pillSat'), credit = $('#satCredit');
    btn.classList.remove('busy');
    btn.setAttribute('aria-pressed', String(sat.on));
    credit.textContent = sat.on ? tr('影像 © ', 'Imagery © ') + SAT_CREDIT : '';
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('busy')) return;
      const next = !sat.on;
      btn.setAttribute('aria-pressed', next);
      if (next) { btn.classList.add('busy'); toast(tr('正在加载卫星影像…', 'Loading satellite imagery…')); }
      await sat.set(next, (p) => { if (!signal.aborted) btn.style.setProperty('--p', p); });
      if (signal.aborted) return;
      btn.classList.remove('busy');
      credit.textContent = next ? tr('影像 © ', 'Imagery © ') + SAT_CREDIT : '';
      if (next) toast(tr('卫星图已开启 · 与赛道、建筑按同一坐标对齐', 'Satellite on · aligned to the same coordinates as the track and buildings'));
      limitsDirty = true;
    }, { signal });
    onLang(() => { if (sat.on) credit.textContent = tr('影像 © ', 'Imagery © ') + SAT_CREDIT; }, { signal });
  }
  onLang(() => {
    renderList(); renderDetail(); syncList(); renderSeatBar();
    labels.forEach((l) => {
      if (l.kind === 'stand') l.el.innerHTML = standLabel(standById[l.id]);
      else if (l.kind === 'block') l.el.textContent = L(standById[l.id].spec.zones[l.zone], 'name');
      else if (l.kind === 'landmark') l.el.innerHTML = `<i></i><b>${L(l.lm, 'name')}</b>`;
    });
    const svg = $('#minimap svg'); if (svg) svg.setAttribute('aria-label', tr('赛道小地图', 'Track map'));
    $('#minimap').querySelectorAll('.mm-stand').forEach((g) => { const ti = g.querySelector('title'); if (ti) ti.textContent = L(standById[g.dataset.id].spec, 'name'); });
    toast(tr('已切换为中文', 'Switched to English'));
  }, { signal });

  /** 切换赛道的第一段：退出选座，镜头升到高空（与启动页“从高空俯冲下来”的镜头方向相反），地球随后盖上来 */
  function liftOff() {
    clearHover();
    const t = controls.target.clone().setY(0);
    flyTo(t.clone().add(new THREE.Vector3(-500, 6000, 0)), t, 1.7);
  }
  window.__app = { state, camera, controls, scene, renderer, stands, selectStand, enterSeats, goHome, setNight, toggleSeat, seatView, track, dolly, liftOff, get seatCam() { return seatCam; }, perf };

  function resume() {
    if (frameId) return;
    clock.getDelta();
    frameId = requestAnimationFrame(frame);
  }

  function pause() {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  return {
    liftOff,
    pause,
    notify: toast,
    reveal({ startup = false, guide = false, recovering = false } = {}) {
      if (startup) setTimeout(() => loadPhotoTextures(renderer), 600);
      if (guide) initGuide(profile.info);
      flyTo(HOME.pos, HOME.target, startup ? 2.1 : recovering ? 0.65 : 1.55);
      resume();
    },
    dispose() {
      pause();
      closeDrawers();
      clearHover();
      const seats = [...state.selected.values()];
      state.selected.clear();
      for (const { stand, idx } of seats) paintSeat(stand, idx);
      exitSeatCam();
      listeners.abort();
      controls.dispose();
      seatBar.remove();
      if (sat.on) void sat.set(false);
      $('#toast').classList.remove('on');
    },
  };
}
