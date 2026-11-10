import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { STANDS, TURNS, TRUE_NORTH } from './data.js';
import { V, night, nightEmissives, fmtPrice } from './util.js';
import { buildTrack } from './track.js';
import { buildStands, seatColor, seatMatrix, seatWorld as seatPos, seatFacing, SELECTED_COLOR } from './stands.js';
import { buildVenue } from './venue.js';
import { buildEnvironment, applyTime, fitShadow } from './environment.js';
import { buildCars } from './cars.js';
import { buildOSM } from './osm.js';
import { buildPitBuilding } from './pitbuilding.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');

// ───────────────────────── 渲染器 ─────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 1, 14000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = 1.52;
controls.minDistance = 6;
controls.maxDistance = 6500;
controls.zoomToCursor = true;
controls.zoomSpeed = 1.1;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ───────────────────────── 场景 ─────────────────────────
// 分步搭建：每一步之间把主线程让出来，启动页的地球才不会卡住
const splash = window.__splash;
const step = (p, text) => { splash?.progress(p, text); return new Promise((r) => setTimeout(r, 40)); };
await step(0.3, '铺设赛道');
const track = buildTrack(scene);
await step(0.45, '搭建看台与座位');
const { stands, hitboxes } = buildStands(scene);
await step(0.6, '搭建维修区与围场');
// 可选的授权素材清单（public/brand/manifest.json），没有则使用文字名称牌
const brand = await fetch('./brand/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
const pitb = buildPitBuilding(scene, brand);
const venue = buildVenue(scene, track, pitb);
await step(0.68, '加载周边道路、水系与建筑');
const osm = buildOSM(scene);
await step(0.72, '种植草木与周边环境');
const env = buildEnvironment(scene, track, stands, renderer);
const cars = buildCars(scene, track);
const standById = Object.fromEntries(stands.map((s) => [s.spec.id, s]));

const HOME = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
function updateHome() {
  // 页面在后台标签页中打开时窗口尺寸可能为 0，这里兜底避免算出 NaN
  const aspect = innerWidth && innerHeight ? innerWidth / innerHeight : 1.6;
  // 竖屏用更广的视角，并按水平视野算出能装下整条赛道的距离
  camera.fov = aspect < 0.85 ? 55 : 38;
  camera.updateProjectionMatrix();
  const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
  const portrait = aspect < 0.85;
  const k = Math.max(1, (portrait ? 620 : 860) / Math.tan(hf) / 2013);
  // 从主看台一侧望向赛道：大直道横在近处，1 号弯在左、14 号发卡弯在右；竖屏时更接近俯视
  HOME.target.copy(env.center).add(new THREE.Vector3(portrait ? -120 : -40, 0, innerWidth > 860 ? -150 : 0));
  HOME.pos.copy(HOME.target).add(portrait ? new THREE.Vector3(-900 * k, 1850 * k, 40 * k) : new THREE.Vector3(-1680 * k, 1560 * k, 60 * k));
}
updateHome();
// 开场从正上方高空俯冲下来，衔接启动页里“放大到上海”的镜头
camera.position.copy(HOME.target).add(new THREE.Vector3(-500, 6000, 0));
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
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
  controls.enabled = false;
}
// ───────────────────────── 座位视角：原地环顾 ─────────────────────────
// 相机固定在座位的视线点上，拖动只改变视线方向；滚轮 / ± 按钮改变视野角度（望远），不移动相机。
let seatCam = null; // { eye, fov }：进入座位视角前的视野角度，退出时恢复
const ORBIT_DEFAULTS = { minDistance: controls.minDistance, minPolarAngle: 0, maxPolarAngle: controls.maxPolarAngle, enablePan: true, enableZoom: true };
const SEAT_LOOK = 0.1; // 视线目标点离眼睛的距离（米），只用来确定朝向
function enterSeatCam(eye) {
  seatCam = { eye: eye.clone(), fov: camera.fov };
  Object.assign(controls, { minDistance: 0.01, minPolarAngle: 0.05, maxPolarAngle: Math.PI - 0.05, enablePan: false, enableZoom: false });
  applyViewOffset();
}
function exitSeatCam() {
  if (!seatCam) return;
  Object.assign(controls, ORBIT_DEFAULTS);
  camera.fov = seatCam.fov;
  camera.updateProjectionMatrix();
  seatCam = null;
  applyViewOffset();
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
}, { passive: false });

function viewFor(s, mode) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(s.f, up);
  const target = s.center.clone();
  const mk = isMobile() ? 1.7 : 1;
  if (mode === 'seats') {
    const d = THREE.MathUtils.clamp(s.L * 0.16 + 40, 52, 105) * (isMobile() ? 1.35 : 1);
    return { pos: s.center.clone().addScaledVector(s.f, d).addScaledVector(up, s.H * 0.5 + 40), target };
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
const seatName = (s, seat) => `${s.spec.zones[seat.zone].name} · 第 ${seat.row} 排 · 左起第 ${seat.num} 座`;
const sideName = (b) => (b.side === 't1' ? '（1 号弯一侧）' : b.side === 't16' ? '（16 号弯一侧）' : '');
const isMobile = () => innerWidth <= 860;

function blockView(s, b) {
  const up = new THREE.Vector3(0, 1, 0);
  const k = isMobile() ? 1.5 : 1;
  flyTo(b.center.clone().addScaledVector(b.f, 26 * k).addScaledVector(up, 15 * k), b.center, 1.1);
}

// ───────────────────────── UI：列表 ─────────────────────────
const minPrice = (spec) => Math.min(...Object.values(spec.zones).map((z) => z.price));
const mainColor = (spec) => spec.color || Object.values(spec.zones).slice(-1)[0].color;
const X_ICON = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const listEl = $('#listItems');
STANDS.forEach((spec) => {
  const multi = Object.keys(spec.zones).length > 1;
  const b = document.createElement('button');
  b.className = 'item';
  b.dataset.id = spec.id;
  b.innerHTML = `<div class="badge" style="background:${mainColor(spec)}">${spec.code}</div>
    <div class="item-main"><b>${spec.name}</b><span>${spec.turns}</span></div>
    <div class="item-price">${fmtPrice(minPrice(spec))}<small>${multi ? '起 · ' : ''}三日票</small></div>`;
  b.onclick = () => selectStand(spec.id);
  listEl.appendChild(b);
});

// ───────────────────────── UI：场景标签 ─────────────────────────
const labelsEl = $('#labels');
const labels = [];
stands.forEach((s) => {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<em style="background:${mainColor(s.spec)}">${s.spec.code}</em><b>${s.spec.name}</b><span>${fmtPrice(minPrice(s.spec))}${Object.keys(s.spec.zones).length > 1 ? ' 起' : ''}</span>`;
  el.onclick = () => selectStand(s.spec.id);
  labelsEl.appendChild(el);
  labels.push({ el, pos: s.labelPos, kind: 'stand', id: s.spec.id, ax: -0.5, ay: -1, dy: -16 });
});
TURNS.forEach(([n, x, y]) => {
  const el = document.createElement('div');
  el.className = 'turn';
  el.textContent = n;
  labelsEl.appendChild(el);
  labels.push({ el, pos: V(x, y, 14), kind: 'turn', ax: -0.5, ay: -0.5, dy: 0 });
});
// 票区标签（进入选座后显示；只有一个票区的看台不重复标注）
stands.forEach((s) => s.blocks && new Set(s.blocks.map((b) => b.zone)).size > 1 && s.blocks.forEach((b) => {
  const el = document.createElement('div');
  el.className = 'sec off';
  el.style.setProperty('--c', s.spec.zones[b.zone].color);
  el.textContent = b.code;
  el.onclick = () => blockView(s, b);
  labelsEl.appendChild(el);
  labels.push({ el, pos: b.label, kind: 'block', id: s.spec.id, ax: -0.5, ay: -1, dy: 0 });
}));

// ───────────────────────── UI：小地图 ─────────────────────────
const mm = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  // 小地图与主视角同向：屏幕右 = 场景 +z，屏幕上 = 场景 +x
  const grow = (p, r = 0) => { x0 = Math.min(x0, p.z - r); x1 = Math.max(x1, p.z + r); z0 = Math.min(z0, -p.x - r); z1 = Math.max(z1, -p.x + r); };
  track.pts.forEach((p) => grow(p));
  stands.forEach((s) => grow(s.center, 60));
  const pad = 50;
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  let d = '';
  for (let i = 0; i < track.N; i += 3) d += (i ? 'L' : 'M') + track.pts[i].z.toFixed(0) + ' ' + (-track.pts[i].x).toFixed(0);
  const turns = TURNS.map(([n, x, y]) => {
    // 弯号放在赛道外侧
    const i = track.nearest(x, -y), k = track.curv[i] < 0 ? 1 : -1;
    const px = track.pts[i].x + track.nor[i].x * 62 * k, pz = track.pts[i].z + track.nor[i].z * 62 * k;
    return `<text class="mm-turn" x="${pz.toFixed(0)}" y="${(-px + 14).toFixed(0)}">${n}</text>`;
  }).join('');
  const marks = stands.map((s) => `<g class="mm-stand" data-id="${s.spec.id}" transform="translate(${s.center.z.toFixed(0)} ${(-s.center.x).toFixed(0)})">
      <title>${s.spec.name}</title><circle class="mm-ring" r="62"/><circle r="46" fill="${mainColor(s.spec)}"/><text y="17">${s.spec.code}</text></g>`).join('');
  const el = $('#minimap');
  el.innerHTML = `<svg viewBox="${x0} ${z0} ${x1 - x0} ${z1 - z0}" role="img" aria-label="赛道小地图">
    <path class="mm-track-o" d="${d}Z"/><path class="mm-track" d="${d}Z"/>
    <line class="mm-start" x1="-120" y1="478" x2="-120" y2="522"/>
    ${turns}${marks}
    <g id="mmCam"><path d="M0 0 L-70 -150 A165 165 0 0 1 70 -150 Z"/><circle r="20"/></g>
  </svg><span class="mm-n" style="--north:${((Math.atan2(-TRUE_NORTH[1], TRUE_NORTH[0]) * 180) / Math.PI).toFixed(0)}deg">N</span>`;
  el.addEventListener('click', (e) => {
    const g = e.target.closest('.mm-stand');
    if (g) selectStand(g.dataset.id);
  });
  return { cam: el.querySelector('#mmCam'), marks: [...el.querySelectorAll('.mm-stand')], x0, x1, z0, z1 };
})();
function updateMinimap() {
  const t = controls.target, c = camera.position;
  const x = THREE.MathUtils.clamp(t.z, mm.x0 + 30, mm.x1 - 30), z = THREE.MathUtils.clamp(-t.x, mm.z0 + 30, mm.z1 - 30);
  const a = (Math.atan2(t.z - c.z, t.x - c.x) * 180) / Math.PI;
  mm.cam.setAttribute('transform', `translate(${x.toFixed(0)} ${z.toFixed(0)}) rotate(${a.toFixed(1)})`);
}

const _v = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  const dist = camera.position.distanceTo(controls.target);
  for (const l of labels) {
    _v.copy(l.pos).project(camera);
    let show = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    if (l.kind === 'stand') show &&= state.mode !== 'seats' && !(state.mode === 'stand' && state.stand.spec.id === l.id);
    else if (l.kind === 'block') show &&= state.mode === 'seats' && state.stand.spec.id === l.id && camera.position.distanceTo(l.pos) < 330 && camera.position.y > l.pos.y;
    else show &&= state.mode === 'overview' ? dist < 3200 && !isMobile() : state.mode === 'stand';
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
  const sub = z.day ? `周五 ${fmtPrice(z.day.fri)} · 周六 ${fmtPrice(z.day.sat)} · 周日 ${fmtPrice(z.day.sun)}` : z.note || '';
  return `<div class="zone"><i style="background:${z.color}"></i>
    <div class="zone-main"><b>${z.name}</b><em class="tag ok">官方票价</em><span>${sub}</span></div>
    <div class="zone-price">${fmtPrice(z.price)}</div></div>`;
}
function renderDetail() {
  const s = state.stand;
  if (!s) { detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  const spec = s.spec;
  const head = `<div class="d-head"><div class="badge" style="background:${mainColor(spec)}">${spec.code}</div>
    <div><h2>${spec.name}</h2><p>${spec.turns}</p></div>
    <button class="close" data-act="close" aria-label="关闭">${X_ICON}</button></div>`;

  if (state.mode === 'seats') {
    const picked = [...state.selected.values()];
    const rows = picked.map((p) => {
      const seat = p.stand.seats[p.idx], z = p.stand.spec.zones[seat.zone];
      return `<div class="seat-row" data-act="view" data-key="${p.stand.spec.id}:${p.idx}" title="点击切换到该座位视角"><i style="background:${z.color}"></i>
        <div>${seatName(p.stand, seat)}<small>${z.name} · 三日票</small></div><b>${fmtPrice(z.price)}</b>
        <button data-act="remove" data-key="${p.stand.spec.id}:${p.idx}" aria-label="移除">${X_ICON}</button></div>`;
    }).join('');
    // 票区快速定位：只列官方票区（A 看台的 A上 被铂金区分成 1 号弯一侧和 16 号弯一侧两段）
    const zoneCount = new Set(s.blocks.map((b) => b.zone)).size;
    const seen = new Set();
    const chipList = s.blocks.filter((b) => { const k = b.zone + b.side; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => y.tier - x.tier);
    const sections = zoneCount > 1
      ? `<div class="sec-title">官方票区 · 点击定位</div>
        <div class="chips wide">${chipList.map((b) => `<button class="chip" data-act="block" data-b="${b.idx}" style="--c:${spec.zones[b.zone].color}">${b.code}${sideName(b)}</button>`).join('')}</div>`
      : `<div class="sec-title">官方票区</div><p class="d-desc" style="margin:0 2px 12px">整座看台为同一票区：${Object.values(spec.zones)[0].name}。官方未公布更细的分区编号。</p>`;
    detail.innerHTML = `<div class="d-scroll">${head}
      <div class="legend" style="margin-top:16px">
        ${Object.values(spec.zones).map((z) => `<span><i style="background:${z.color}"></i>${z.name} ${fmtPrice(z.price)}</span>`).join('')}
      </div>
      ${sections}
      <div class="sec-title" style="margin-top:14px">已标记座位（${picked.length}/${MAX_SEATS}）</div>
      ${rows || '<div class="cart-empty">点击座位标记，双击直接进入座位视角</div>'}
      <p class="seat-note">排号、座号为模型内按位置的计数（从前往后数排、面向赛道从左往右数座），不是票面座号。</p>
      <div class="actions">
        <button class="btn primary" data-act="seatview" ${picked.length ? '' : 'disabled'}>座位视角</button>
        <div class="btn-row">
          <button class="btn ghost" data-act="back">返回看台</button>
        </div>
      </div></div>`;
    return;
  }

  const stats = spec.type === 'seats'
    ? `<div class="stat"><small>入口</small><b>${spec.gate}</b></div>
       <div class="stat"><small>模型座位</small><b>${s.seats.length.toLocaleString()}</b></div>
       <div class="stat"><small>官方票区</small><b>${new Set(s.blocks.map((b) => b.zone)).size} 个</b></div>`
    : `<div class="stat"><small>入口</small><b>${spec.gate}</b></div>
       <div class="stat"><small>类型</small><b>${spec.type === 'grass' ? '草地' : '款待'}</b></div>
       <div class="stat"><small>座位</small><b>${spec.type === 'grass' ? '不对号' : '包厢'}</b></div>`;
  detail.innerHTML = `<div class="d-scroll">${head}
    <p class="d-desc">${spec.desc}</p>
    <div class="stats">${stats}</div>
    <div class="sec-title">票价 · 三日票</div>
    ${Object.values(spec.zones).map(zoneRow).join('')}
    <div class="actions">
      ${spec.type === 'seats'
        ? `<button class="btn primary" data-act="seats"><svg viewBox="0 0 24 24"><path d="M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4zM7 18v2M17 18v2"/></svg>进入选座</button>`
        : `<button class="btn ghost" disabled>${spec.type === 'grass' ? '草地票不对号入座' : '款待套票需官方渠道预订'}</button>`}
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
  else if (act === 'view') { const p = state.selected.get(b.dataset.key); if (p) seatView(p.stand, p.idx); }
});

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
    ? '滚轮放大 · 点击票区或座位 · 双击进入座位视角 · Esc 返回'
    : '拖动旋转 · 滚轮缩放 · 右键平移 · 点击看台探索';
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
    if (state.selected.size >= MAX_SEATS) return toast(`最多同时标记 ${MAX_SEATS} 个座位`);
    state.selected.set(key, { stand: s, idx });
  }
  paintSeat(s, idx);
  renderDetail();
}
function seatView(s, idx) {
  const p = seatWorld(s, idx);
  const eye = p.clone().add(new THREE.Vector3(0, 1.25, 0)); // 坐姿视线高度
  // 视线：朝向赛道、略微向下（与看向 14 m 外、低 2.85 m 的点同一方向）
  const dir = seatFacing(s, idx).clone().multiplyScalar(14).add(new THREE.Vector3(0, -2.85, 0)).normalize();
  flyTo(eye, eye.clone().addScaledVector(dir, SEAT_LOOK), 1.4);
  enterSeatCam(eye);
  toast(isMobile() ? '座位视角 · 拖动环顾 · ± 望远' : '座位视角 · 拖动环顾 · 滚轮望远');
}

// ───────────────────────── 指针拾取 ─────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('#tooltip');
let pointer = null, down = null, lastClick = 0, lastKey = '';
canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerleave', () => { pointer = null; clearHover(); state.hoverStand = null; });
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
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
});
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
      tooltip.innerHTML = `<b>${seatName(s, seat)}</b><small>${state.selected.has(s.spec.id + ':' + i) ? '已标记 · 再次点击取消' : `${z.name} · 三日票 ${fmtPrice(z.price)}`}</small>`;
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
});

const seg = $('#themeSeg');
function setNight(on) {
  state.nightTarget = on ? 1 : 0;
  seg.classList.toggle('night', on);
  seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.mode === 'night') === on));
  document.documentElement.dataset.theme = on ? 'dark' : 'light';
  toast(on ? '黑夜模式 · 赛道灯光自动开启' : '白天模式');
}
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setNight(b.dataset.mode === 'night');
});

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

// ───────────────────────── 昼夜 ─────────────────────────
function applyNight(t) {
  const e = t * t * (3 - 2 * t);
  applyTime(env, scene, e);
  const lights = THREE.MathUtils.smoothstep(t, 0.45, 0.92); // 天色暗下来后灯光依次亮起
  night.value = lights;
  for (const { m, max } of nightEmissives) m.emissiveIntensity = max * lights;
  for (const g of env.glows) g.material.opacity = lights * 0.9;
  bloom.strength = 0.03 + lights * 0.5;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.12, e);
}
applyNight(0);

// ───────────────────────── 循环 ─────────────────────────
function resize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  const seatFov = seatCam ? camera.fov : null;
  updateHome();
  if (seatCam) { seatCam.fov = camera.fov; camera.fov = seatFov; }
  applyViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.t !== state.nightTarget) {
    const d = dt / 2.4;
    state.t = state.nightTarget > state.t ? Math.min(1, state.t + d) : Math.max(0, state.t - d);
    applyNight(state.t);
  }
  if (fly) {
    fly.t += dt / fly.dur;
    const e = ease(Math.min(1, fly.t));
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    camera.lookAt(controls.target);
    if (fly.t >= 1) { fly = null; controls.enabled = true; }
  } else {
    controls.update();
    if (seatCam) pinSeatCam();
  }
  fitShadow(env, controls.target, camera.position.distanceTo(controls.target));
  // 看台细节层级：镜头离看台较远时用座面条带代替逐个座位
  for (const s of stands) {
    if (!s.carpet) continue;
    const near = camera.position.distanceTo(s.center) < 280 + s.L * 0.5 || state.stand === s;
    s.mesh.visible = near; s.carpet.visible = !near;
  }
  if (pointer && !fly && !down?.dragging) pick(pointer.x, pointer.y);
  cars.update(dt);
  composer.render();
  updateLabels();
  updateMinimap();
  requestAnimationFrame(frame);
}

// 预编译着色器并渲染第一帧，然后让启动页的地球转到上海、放大、淡出
await step(0.88, '点亮灯光与材质');
try { await renderer.compileAsync(scene, camera); } catch { /* 不支持异步编译时首帧会同步编译 */ }
camera.lookAt(controls.target);
composer.render();
await step(1, '即将抵达上海');
await splash?.finish();
clock.getDelta();
flyTo(HOME.pos, HOME.target, 2.8); // 开场镜头
requestAnimationFrame(frame);

window.__app = { state, camera, controls, scene, renderer, stands, selectStand, enterSeats, goHome, setNight, toggleSeat, seatView, track, dolly, get seatCam() { return seatCam; } };
