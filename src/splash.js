// 启动页：一颗点阵地球，随自转依次点亮 F1 各分站；
// 加载完成后转到上海并不断放大，淡出到 3D 赛道。
// 只用 2D canvas，不依赖 three.js，所以能在主场景下载和搭建期间先显示出来。
import topo from 'world-atlas/land-110m.json';
import { GP_VENUES } from './venues.js';
import { L, t } from './i18n.js';

const D2R = Math.PI / 180;
const root = document.getElementById('splash');
const cv = root.querySelector('canvas');
const ctx = cv.getContext('2d');
const elCity = root.querySelector('.sp-city');
const elGp = root.querySelector('.sp-gp');
const elCount = root.querySelector('.sp-count');
const elBar = root.querySelector('.sp-bar i');
const elStep = root.querySelector('.sp-step');

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
const dots = buildDots();
const venues = GP_VENUES.map((v) => ({ ...v, lam: v.lon * D2R, s: Math.sin(v.lat * D2R), c: Math.cos(v.lat * D2R), t0: 0 }));
const home = venues.find((v) => v.home);

// ── 状态 ──
// 从赛季揭幕站墨尔本出发（铃鹿在旁），一路向东转一整圈，最后停在上海
const S = { prevD: 999, lon: 146, lat: 16, zoom: 1, phase: 'spin', t: 0, w: 0, h: 0, dpr: 1, last: null, lit: 0, alpha: 1 };
let goto = null, resolveFinish = null, raf = 0, done = false, ready = false;
// 地球始终匀速自转：加载快也要把 24 站全部转完再去上海，加载慢就继续匀速转
const SPEED = 30;      // 度/秒
const SLOW = 28;       // 抵达上海前最后这么多度内平滑减速

function resize() {
  S.dpr = Math.min(devicePixelRatio || 1, 2);
  S.w = root.clientWidth || innerWidth; S.h = root.clientHeight || innerHeight;
  cv.width = Math.max(1, S.w * S.dpr); cv.height = Math.max(1, S.h * S.dpr);
}
addEventListener('resize', resize);
resize();


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
  if (S.phase === 'spin') {
    S.lon += SPEED * dt;
    const dLon = ((((home.lon - S.lon) % 360) + 360) % 360);
    // 恰好转到上海前 SLOW 度时才开始减速；此时还没亮的分站必须都在剩下这段路上（减速途中会依次亮起）
    if (ready && dLon <= SLOW && S.prevD > SLOW) {
      const pending = venues.every((v) => v.t0 || ((((v.lon - S.lon) % 360) + 360) % 360) <= dLon + 1);
      if (pending) {
        goto = { done: 0, total: dLon, lon0: S.lon, lat0: S.lat };
        S.phase = 'goto';
        elStep.textContent = t('即将抵达上海', 'Arriving in Shanghai');
        setTimeout(end, (SLOW / SPEED * 2.5 + 2.4) * 1000 + 1500); // 后台标签页 rAF 暂停时的兜底
      }
    }
    S.prevD = dLon;
  } else if (S.phase === 'goto') {
    const left = goto.total - goto.done;
    const v = SPEED * Math.max(0.08, Math.min(1, Math.sqrt(left / SLOW)));   // 匀速，最后一段平滑减速
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
    const age = (now - v.t0) / 1000;
    const isHome = v.home && S.phase !== 'spin';
    const col = v.home ? '255,214,10' : '255,69,58';
    if (age < 1.3 || isHome) {
      const p = isHome ? (now / 1100) % 1 : age / 1.3;
      ctx.strokeStyle = `rgba(${col},${(1 - p) * 0.9 * edge})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 4 + p * 26, 0, 7); ctx.stroke();
    }
    const r = (v.home ? 5 : 3.6) + Math.max(0, 1 - age * 2.5) * 4;
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

raf = requestAnimationFrame(draw);

window.__splash = {
  /** p: 0..1 */
  progress(p, text) {
    elBar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, p))})`;
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
      setTimeout(end, (540 / SPEED + 4) * 1000);
    });
  },
  fail(msg) { elStep.textContent = msg; root.classList.add('failed'); },
};
