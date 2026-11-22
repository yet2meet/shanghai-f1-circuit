// 启动页：一颗点阵地球，随自转依次点亮 F1 各分站；
// 加载完成后转到当前赛道所在的城市并不断放大，淡出到 3D 赛道。
// 切换赛道时与之接力：旧页面镜头拉升、淡入地球（startDeparture）→ 刷新 → 新页面的地球从旧城市接着转到新城市（arrive 模式）→ 放大进入。
// 只用 2D canvas，不依赖 three.js，所以能在主场景下载和搭建期间先显示出来。
import topo from 'world-atlas/land-110m.json';
import { GP_VENUES } from './venues.js';
import { L, t } from './i18n.js';
import { CURRENT, CIRCUITS } from './circuits/index.js';

const D2R = Math.PI / 180;

// ── 解码 TopoJSON，把陆地画到一张经纬度贴图上，再采样成点阵 ──
function landRings() {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
  const rings = [];
  for (const geo of topo.objects.land.geometries) {
    const polys = geo.type === 'Polygon' ? [geo.arcs] : geo.arcs;
    for (const poly of polys) for (const ring of poly) {
      const pts = [];
      for (const i of ring) {
        const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
      }
      rings.push(pts);
    }
  }
  return rings;
}
function buildDots() {
  const mw = 720, mh = 360;
  const mc = document.createElement('canvas');
  mc.width = mw; mc.height = mh;
  const m = mc.getContext('2d', { willReadFrequently: true });
  m.fillStyle = '#fff';
  m.beginPath();
  for (const ring of landRings()) {
    ring.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * mw, y = ((90 - lat) / 180) * mh;
      if (i) m.lineTo(x, y); else m.moveTo(x, y);
    });
    m.closePath();
  }
  m.fill('evenodd');
  const img = m.getImageData(0, 0, mw, mh).data;
  const out = [];
  const STEP = 1.55;
  let row = 0;
  for (let lat = -58; lat <= 84; lat += STEP, row++) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * D2R)) / STEP));
    for (let k = 0; k < n; k++) {
      const lon = -180 + ((k + (row % 2) * 0.5) * 360) / n;
      const px = Math.min(mw - 1, Math.floor(((lon + 180) / 360) * mw)), py = Math.min(mh - 1, Math.floor(((90 - lat) / 180) * mh));
      if (img[(py * mw + px) * 4 + 3] > 120) out.push(lon * D2R, Math.sin(lat * D2R), Math.cos(lat * D2R));
    }
  }
  return new Float32Array(out);
}
let dotsCache = null;
const getDots = () => (dotsCache ||= buildDots()); // 点阵只算一次，切换赛道的过渡动画复用

/**
 * 跑一颗地球。mode：
 *   tour    第一次进入：从墨尔本出发向东转一整圈，停在 toId 所在城市，等加载完成后放大、淡出
 *   arrive  切换赛道后的新页面：地球已停在 fromId（旧赛道）的城市，直接转向 toId，等加载完成后放大、淡出
 *   depart  切换赛道时的旧页面：地球从放大状态缩回全貌（淡入），结束后调用 onDone（去刷新页面）
 */
function run(root, { mode = 'tour', fromId = null, toId = CURRENT, onDone = null } = {}) {
const cv = root.querySelector('canvas');
const ctx = cv.getContext('2d');
const elCity = root.querySelector('.sp-city');
const elGp = root.querySelector('.sp-gp');
const elCount = root.querySelector('.sp-count');
const elBar = root.querySelector('.sp-bar i');
const elStep = root.querySelector('.sp-step');
const dots = getDots();
const venues = GP_VENUES.map((v) => ({ ...v, lam: v.lon * D2R, s: Math.sin(v.lat * D2R), c: Math.cos(v.lat * D2R), t0: 0 }));
// 地球最后停在目标赛道（第一次来是上海；老用户是上次退出时的赛道）
const home = venues.find((v) => v.id === toId) || venues.find((v) => v.id === 'sh');
const origin = (fromId && venues.find((v) => v.id === fromId)) || home;
const focus = mode === 'depart' ? origin : home; // 一直脉动的那一站
let turn = null, departed = false;

// ── 状态 ──
// 从赛季揭幕站墨尔本出发（铃鹿在旁），一路向东转一整圈，最后停在当前赛道所在的城市
const LON0 = 146;
const S = { lon: LON0, lat: 16, zoom: 1, phase: 'spin', t: 0, w: 0, h: 0, dpr: 1, last: null, lit: 0, alpha: 1 };
let goto = null, resolveFinish = null, raf = 0, done = false, ready = mode === 'depart';
// 地球始终匀速自转：加载快也要把 24 站全部转完再去上海，加载慢就继续匀速转
// 巡游：以 BASE 匀速转一圈（约 6.7 秒）。加载提前完成 → 逐渐加速，约 1.5 秒内转完剩下的路；
// 加载较慢 → 临近上海时平滑放慢、悠悠靠近但不越过，等加载完成再停稳。转速只做渐变，没有突变。
const TOTAL = ((((home.lon - LON0) % 360) + 360) % 360) || 360;   // 墨尔本 → 一圈 → 上海，约 335°
const BASE = 50, MAX = 90, FINISH = 1.5;                           // 度/秒；加载完后收尾时间（秒）
const SLOW = 28;                                                   // 最后这么多度内平滑减速停到上海
let speed = BASE;   // 必须写在 BASE 声明之后，否则模块加载时就会抛 ReferenceError

function resize() {
  S.dpr = Math.min(devicePixelRatio || 1, 2);
  S.w = root.clientWidth || innerWidth; S.h = root.clientHeight || innerHeight;
  cv.width = Math.max(1, S.w * S.dpr); cv.height = Math.max(1, S.h * S.dpr);
}
addEventListener('resize', resize);
resize();


if (mode !== 'tour') {
  // 过渡动画：全部分站已点亮，地球从旧赛道所在的城市开始
  S.lon = origin.lon; S.lat = origin.lat;
  for (const v of venues) v.t0 = 1;
  if (mode === 'arrive') {
    const dLon = ((home.lon - origin.lon + 540) % 360) - 180, dLat = home.lat - origin.lat;
    turn = { k: 0, dur: Math.min(3.2, Math.max(1.5, Math.hypot(dLon, dLat) / 50)), lon0: origin.lon, lat0: origin.lat, dLon, dLat };
    S.phase = 'turn';
  } else { S.phase = 'depart'; S.t = 0; S.zoom = 27; root.style.opacity = '0'; }
}

function setCaption(v) {
  elCity.textContent = L(v, 'city');
  elGp.textContent = L(v, 'gp');
  elCity.parentElement.classList.remove('pop');
  void elCity.offsetWidth;
  elCity.parentElement.classList.add('pop');
  S.last = v;
}

function draw(now) {
  const dt = Math.min(0.05, (now - (draw.prev || now)) / 1000);
  draw.prev = now;

  // 推进动画
  if (S.phase === 'turn') {
    // 切换赛道：平滑转向新城市
    turn.k = Math.min(1, turn.k + dt / turn.dur);
    const e = turn.k * turn.k * (3 - 2 * turn.k);
    S.lon = turn.lon0 + turn.dLon * e; S.lat = turn.lat0 + turn.dLat * e;
    if (turn.k > 0.55 && S.last !== home) setCaption(home);
    if (turn.k >= 1) { S.phase = ready ? 'zoom' : 'wait'; S.t = 0; if (S.last !== home) setCaption(home); }
  } else if (S.phase === 'wait') {
    if (ready) { S.phase = 'zoom'; S.t = 0; }                   // 已转到位，等主场景加载完成再放大
  } else if (S.phase === 'depart') {
    // 旧页面：从放大状态缩回地球全貌，同时淡入
    S.t = Math.min(1, S.t + dt / 1.5);
    S.zoom = 1 + Math.pow(1 - S.t, 2.6) * 26;
    S.alpha = Math.min(1, S.t / 0.5);
    root.style.opacity = S.alpha.toFixed(3);
    if (S.t >= 1 && !departed) { departed = true; setTimeout(() => onDone?.(), 250); }
  } else if (S.phase === 'spin') {
    const left = TOTAL - (S.lon - LON0);
    const want = ready ? Math.min(MAX, Math.max(speed, left / FINISH)) : BASE;
    speed += (want - speed) * Math.min(1, dt * 1.5);                            // 渐变
    if (!ready) speed = Math.min(speed, Math.max(0, (left - 3) * 0.9));         // 还没加载完：越接近上海越慢，不越过
    S.lon += speed * dt;
    if (ready && TOTAL - (S.lon - LON0) <= Math.max(SLOW * Math.min(1, speed / BASE), 2)) {
      goto = { done: 0, total: Math.max(0.05, TOTAL - (S.lon - LON0)), lon0: S.lon, lat0: S.lat, v0: Math.max(speed, 3) };
      S.phase = 'goto';
      // 巡游路线从墨尔本向东一整圈，停在当前赛道所在城市；还没经过的站（如去新加坡时的上海）在靠站时一并点亮
      for (const v of venues) if (!v.t0) v.t0 = performance.now();
      elStep.textContent = t(`即将抵达${home.city}`, `Arriving in ${home.cityEn}`);
      setTimeout(end, 6000); // 后台标签页 rAF 暂停时的兜底
    }
  } else if (S.phase === 'goto') {
    const left = goto.total - goto.done;
    const v = goto.v0 * Math.max(0.08, Math.min(1, Math.sqrt(left / Math.max(1, goto.total))));   // 平滑减速
    goto.done = Math.min(goto.total, goto.done + v * dt);
    S.lon = goto.lon0 + goto.done;
    const k = goto.total ? goto.done / goto.total : 1;
    S.lat = goto.lat0 + (home.lat - goto.lat0) * (k * k * (3 - 2 * k));
    if (goto.total - goto.done < 0.02) { S.phase = 'zoom'; S.t = 0; if (S.last !== home) setCaption(home); }
  } else if (S.phase === 'zoom') {
    S.t = Math.min(1, S.t + dt / 1.7);
    S.zoom = 1 + Math.pow(S.t, 2.6) * 26;
    S.alpha = 1 - Math.max(0, (S.t - 0.5) / 0.5);
    root.style.opacity = S.alpha.toFixed(3);
    if (S.t >= 0.5 && resolveFinish) { resolveFinish(); resolveFinish = null; }
    if (S.t >= 1) return end();
  }
  // 进度条与地球同步：显示巡游走过的比例
  if (S.phase !== 'zoom') elBar.style.transform = `scaleX(${(mode === 'tour' ? Math.max(0.03, Math.min(1, (S.lon - LON0) / TOTAL)) : 1).toFixed(4)})`;

  const { w, h, dpr } = S;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(w * 0.44, h * 0.27) * S.zoom;
  const cx = w / 2, cy = h * 0.5;
  const st = Math.sin(S.lat * D2R), ct = Math.cos(S.lat * D2R), lon0 = S.lon * D2R;

  // 大气辉光 + 球体
  let g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.32);
  g.addColorStop(0, 'rgba(70,130,255,0.34)'); g.addColorStop(1, 'rgba(70,130,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, 7); ctx.fill();
  g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
  g.addColorStop(0, '#1b3a78'); g.addColorStop(0.6, '#0d1d42'); g.addColorStop(1, '#060b1c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(150,190,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();

  // 陆地点阵（按朝向分三档透明度批量绘制）
  const size = Math.max(1.2, R * 0.0075);
  const buckets = [[], [], []];
  for (let i = 0; i < dots.length; i += 3) {
    const l = dots[i] - lon0, s = dots[i + 1], c = dots[i + 2];
    const z1 = c * Math.cos(l), z2 = s * st + z1 * ct;
    if (z2 <= 0.02) continue;
    const x = cx + R * c * Math.sin(l), y = cy - R * (s * ct - z1 * st);
    if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
    (z2 > 0.6 ? buckets[2] : z2 > 0.3 ? buckets[1] : buckets[0]).push(x, y);
  }
  ['rgba(170,200,255,0.28)', 'rgba(185,212,255,0.55)', 'rgba(215,230,255,0.9)'].forEach((col, k) => {
    ctx.fillStyle = col;
    const b = buckets[k];
    for (let i = 0; i < b.length; i += 2) ctx.fillRect(b[i] - size / 2, b[i + 1] - size / 2, size, size);
  });

  // 分站
  let lit = 0, newest = null;
  for (const v of venues) {
    const l = v.lam - lon0;
    const z1 = v.c * Math.cos(l), z2 = v.s * st + z1 * ct;
    // 分站经过画面中线（经度差 12° 以内）时点亮
    const dl = ((((v.lon - S.lon) % 360) + 540) % 360) - 180;
    if (!v.t0 && Math.abs(dl) < 12 && z2 > 0) { v.t0 = now; if (S.phase !== 'zoom' && (!newest || Math.abs(dl) < newest.d)) newest = { v, d: Math.abs(dl) }; }
    if (v.t0) lit++;
    if (z2 <= 0.03) continue;
    const x = cx + R * v.c * Math.sin(l), y = cy - R * (v.s * ct - z1 * st);
    const edge = Math.min(1, z2 * 2.2);
    if (!v.t0) {
      ctx.fillStyle = `rgba(255,255,255,${0.28 * edge})`;
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
      continue;
    }
    const age = Math.max(0, (now - v.t0) / 1000);
    const isHome = v === focus && S.phase !== 'spin';
    const col = v === focus ? '255,214,10' : '255,69,58';
    if (age < 1.3 || isHome) {
      const p = isHome ? (now / 1100) % 1 : age / 1.3;
      ctx.strokeStyle = `rgba(${col},${(1 - p) * 0.9 * edge})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 4 + p * 26, 0, 7); ctx.stroke();
    }
    const r = (v === focus ? 5 : 3.6) + Math.max(0, 1 - age * 2.5) * 4;
    ctx.shadowColor = `rgba(${col},0.95)`; ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(${col},${edge})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${0.95 * edge})`;
    ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 7); ctx.fill();
    if (v === S.last && (age < 2.2 || isHome)) {
      ctx.font = '600 13px -apple-system, "PingFang SC", "Microsoft YaHei UI", sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${edge})`;
      ctx.fillText(L(v, 'city'), x + 12, y - 9);
    }
  }
  if (newest) setCaption(newest.v);
  if (lit !== S.lit) { S.lit = lit; elCount.textContent = `${lit} / ${venues.length}`; }

  raf = requestAnimationFrame(draw);
}

function end() {
  if (done) return;
  done = true;
  cancelAnimationFrame(raf);
  removeEventListener('resize', resize);
  if (resolveFinish) { resolveFinish(); resolveFinish = null; }
  root.remove();
}

draw(performance.now()); // 第一帧立刻画出来，刷新后的过渡不留空白

return {
  /** p: 0..1 */
  progress(_p, text) {   // 进度条跟随地球巡游，这里只更新文字
    if (text) elStep.textContent = text;
  },
  /** 加载完成：转到上海 → 放大 → 淡出。Promise 在开始淡出时兑现。 */
  finish() {
    if (done) return Promise.resolve();
    this.progress(1, t('准备就绪', 'Ready'));
    ready = true;   // 不打断自转：等全部分站展示完，再匀速转到上海
    return new Promise((res) => {
      resolveFinish = res;
      // 标签页在后台时 rAF 会暂停，这里兜底，保证主场景一定能显示出来（最多再转一圈半）
      setTimeout(end, ((mode === 'tour' ? TOTAL / BASE + FINISH : 6) + 6) * 1000);
    });
  },
  fail(msg) { elStep.textContent = msg; root.classList.add('failed'); },
};
}

// ── 入口 ──
// 切换赛道后的新页面：sessionStorage 里有 20 秒内的过渡记录就走 arrive 模式（见 circuits/index.js 的 switchCircuit）
function readTransition() {
  try {
    const raw = sessionStorage.getItem('sic-trans');
    sessionStorage.removeItem('sic-trans');
    const j = raw && JSON.parse(raw);
    if (j && Date.now() - j.ts < 20000 && j.to === CURRENT && j.from !== CURRENT) return j;
  } catch { /* 无痕模式等 */ }
  return null;
}
const trans = readTransition();
window.__splash = run(document.getElementById('splash'), trans ? { mode: 'arrive', fromId: trans.from, toId: CURRENT } : { mode: 'tour', toId: CURRENT });

/** 切换赛道的第一段：在当前页面上盖一层地球，从放大状态缩回全貌；缩完后调用 onDone（刷新页面进入下一段） */
export function startDeparture(toId, onDone) {
  const target = CIRCUITS.find((c) => c.id === toId);
  const el = document.createElement('div');
  el.id = 'splash';
  el.className = 'departing';
  // 与 index.html 里的启动页结构一致，标题用目标赛道的名称，刷新后接上同一画面
  el.innerHTML = `<canvas></canvas>
    <div class="sp-top"><div class="brand-mark" role="img" aria-label="Formula 1"><span></span></div>
      <h1>${t(...target.dict.brandName)}</h1><p>${t(...target.dict.splashSub)}</p></div>
    <div class="sp-bottom"><div class="sp-venue"><b class="sp-city">&nbsp;</b><span class="sp-gp">&nbsp;</span></div>
      <div class="sp-meta"><span class="sp-step">${t('正在前往', 'Heading to')} ${L(target, 'city')}</span><span class="sp-count">${GP_VENUES.length} / ${GP_VENUES.length}</span></div>
      <div class="sp-bar"><i></i></div><div class="sp-credit">© 2026 yet2meet</div></div>`;
  document.body.appendChild(el);
  return run(el, { mode: 'depart', fromId: CURRENT, toId, onDone });
}
