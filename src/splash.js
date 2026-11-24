// 轻量地球动画：加载页和同页切换共用，显示进度来自 3D 场景的实际准备工作。
import topo from 'world-atlas/land-110m.json';
import { GP_VENUES } from './venues.js';
import { L, t } from './i18n.js';
import { CURRENT } from './circuits/index.js';

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

function run(root, { fromId, toId }) {
  const ctx = root.querySelector('canvas').getContext('2d');
  const cv = ctx.canvas;
  const elCity = root.querySelector('.sp-city');
  const elGp = root.querySelector('.sp-gp');
  const elCount = root.querySelector('.sp-count');
  const elBar = root.querySelector('.sp-bar');
  const elStep = root.querySelector('.sp-step');
  const dots = getDots();
  const buckets = [[], [], []];
  const venues = GP_VENUES.map((v) => ({ ...v, lam: v.lon * D2R, s: Math.sin(v.lat * D2R), c: Math.cos(v.lat * D2R), t0: 0 }));
  const home = venues.find((v) => v.id === toId);
  const origin = venues.find((v) => v.id === fromId);
  const total = venues.length;
  const STEP_MAX = total - 1;
  const S = { lon: origin?.lon ?? 146, lat: origin?.lat ?? 16, zoom: origin ? 27 : 1,
    phase: origin ? 'depart' : 'spin', t: 0, w: 0, h: 0, dpr: 1, last: null, alpha: origin ? 0 : 1 };
  let turn, raf = 0, done = false, ready = false, shown = 0;
  let previous = performance.now();
  let resolveCover, resolveReveal;
  const covered = origin ? new Promise((resolve) => { resolveCover = resolve; }) : Promise.resolve();
  const revealed = new Promise((resolve) => { resolveReveal = resolve; });

  function resize() {
    S.dpr = Math.min(devicePixelRatio || 1, 1.5);
    S.w = root.clientWidth || innerWidth; S.h = root.clientHeight || innerHeight;
    cv.width = Math.max(1, S.w * S.dpr); cv.height = Math.max(1, S.h * S.dpr);
  }

  function setCaption(v) {
    elCity.textContent = L(v, 'city');
    elGp.textContent = L(v, 'gp');
    elCity.parentElement.classList.remove('pop');
    void elCity.offsetWidth;
    elCity.parentElement.classList.add('pop');
    S.last = v;
  }

  function setProgress(value) {
    shown = value;
    elCount.textContent = `${value} / ${total}`;
    elBar.setAttribute('aria-valuenow', String(value));
    elBar.firstElementChild.style.transform = `scaleX(${value / total})`;
  }

  function cover() {
    resolveCover?.();
    resolveCover = null;
  }

  function reveal() {
    if (!resolveReveal) return;
    root.classList.add('ready');
    setProgress(total);
    elStep.textContent = t('准备就绪', 'Ready');
    resolveReveal();
    resolveReveal = null;
  }

  function turnHome() {
    const dLon = ((((home.lon - S.lon) % 360) + 540) % 360) - 180;
    const dLat = home.lat - S.lat;
    turn = { elapsed: 0, dur: Math.min(1.05, Math.max(0.5, Math.hypot(dLon, dLat) / 135)),
      lon0: S.lon, lat0: S.lat, dLon, dLat };
    S.phase = 'turn';
  }

  function onVisibility() {
    if (!document.hidden) return;
    if (origin) {
      root.style.opacity = '1';
      cover();
      if (S.phase === 'depart') { S.zoom = 1; turnHome(); }
    }
    if (ready) end();
  }

  function draw(now) {
    const dt = Math.min(0.15, (now - previous) / 1000);
    previous = now;

    if (S.phase === 'depart') {
      S.t = Math.min(1, S.t + dt / 0.7);
      S.zoom = 1 + Math.pow(1 - S.t, 2.6) * 26;
      S.alpha = Math.min(1, S.t / 0.55);
      root.style.opacity = S.alpha.toFixed(3);
      if (S.alpha === 1) cover();
      if (S.t === 1) turnHome();
    } else if (S.phase === 'spin') {
      if (ready) turnHome();
      else S.lon += 52 * dt;
    } else if (S.phase === 'turn') {
      turn.elapsed += dt;
      const k = Math.min(1, turn.elapsed / turn.dur);
      const ease = k * k * (3 - 2 * k);
      S.lon = turn.lon0 + turn.dLon * ease;
      S.lat = turn.lat0 + turn.dLat * ease;
      if (k > 0.55 && S.last !== home) setCaption(home);
      if (k === 1) { S.phase = 'wait'; S.t = 0; }
    } else if (S.phase === 'wait') {
      if (ready) S.phase = 'zoom';
    } else if (S.phase === 'zoom') {
      S.t = Math.min(1, S.t + dt / 0.7);
      S.zoom = 1 + Math.pow(S.t, 2.6) * 26;
      if (S.t >= 0.4) reveal();
      S.alpha = 1 - Math.max(0, (S.t - 0.4) / 0.6);
      root.style.opacity = S.alpha.toFixed(3);
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
    for (const bucket of buckets) bucket.length = 0;
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
    let newest = null;
    for (const v of venues) {
      const l = v.lam - lon0;
      const z1 = v.c * Math.cos(l), z2 = v.s * st + z1 * ct;
      // 分站经过画面中线（经度差 12° 以内）时点亮
      const dl = ((((v.lon - S.lon) % 360) + 540) % 360) - 180;
      if (!v.t0 && Math.abs(dl) < 12 && z2 > 0) { v.t0 = now; if (S.phase !== 'zoom' && (!newest || Math.abs(dl) < newest.d)) newest = { v, d: Math.abs(dl) }; }
      if (z2 <= 0.03) continue;
      const x = cx + R * v.c * Math.sin(l), y = cy - R * (v.s * ct - z1 * st);
      const edge = Math.min(1, z2 * 2.2);
      if (!v.t0) {
        ctx.fillStyle = `rgba(255,255,255,${0.28 * edge})`;
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
        continue;
      }
      const age = Math.max(0, (now - v.t0) / 1000);
      const isHome = v === (S.phase === 'depart' ? origin : home) && S.phase !== 'spin';
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

    raf = requestAnimationFrame(draw);
  }

  function end() {
    if (done) return;
    done = true;
    if (ready) reveal();
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    root.remove();
  }

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  elBar.setAttribute('aria-valuemax', String(total));
  setProgress(0);
  if (origin) {
    root.style.opacity = '0';
    for (const v of venues) v.t0 = 1;
    setCaption(origin);
  }
  if (document.hidden) onVisibility();
  draw(performance.now());

  return {
    covered,
    progress(value, label) {
      if (ready || done) return;
      const next = Math.min(STEP_MAX, Math.floor(value * total + 1e-6));
      if (next > shown) setProgress(next);
      if (label) elStep.textContent = label;
    },
    finish() {
      ready = true;
      if (document.hidden) end();
      return revealed;
    },
    fail(message) {
      elStep.textContent = message;
      root.classList.add('failed');
      cancelAnimationFrame(raf);
    },
    dismiss: end,
  };
}

export function startSplash(first) {
  const root = document.getElementById('splash');
  if (first) {
    const hint = root.querySelector('.sp-note');
    hint.textContent = t('围场小队正在做赛前准备，第一次发车要多等一小会儿',
      'The paddock crew is getting ready. The first start takes a little longer.');
    hint.hidden = false;
  }
  return run(root, { toId: CURRENT });
}

export function startTransition(fromId, target) {
  const root = document.createElement('div');
  root.id = 'splash';
  root.innerHTML = `<canvas></canvas>
    <div class="sp-top"><div class="brand-mark" role="img" aria-label="Formula 1"><span></span></div>
      <h1>${t(...target.dict.brandName)}</h1><p>${t(...target.dict.splashSub)}</p></div>
    <div class="sp-bottom"><div class="sp-venue"><b class="sp-city">&nbsp;</b><span class="sp-gp">&nbsp;</span></div>
      <div class="sp-meta"><span class="sp-step">${t('正在前往', 'Heading to')} ${L(target, 'city')}</span><span class="sp-count"></span></div>
      <div class="sp-bar" role="progressbar" aria-label="${t('加载进度', 'Loading progress')}"><i></i></div>
      <div class="sp-credit">© 2026 yet2meet</div></div>`;
  document.body.appendChild(root);
  return run(root, { fromId, toId: target.id });
}
