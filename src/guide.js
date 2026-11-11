// 新手引导：第一次打开时逐步指出主要操作；右上角“?”可随时重看
const KEY = 'sic-guide-v1';

const mobile = () => innerWidth <= 860;
const STEPS = [
  { title: '欢迎来到上海国际赛车场', body: '赛道、看台与建筑均按真实测绘数据还原。花 20 秒了解几个基本操作。', icon: '🏁' },
  {
    title: '自由查看', icon: '🖐',
    body: () => (mobile()
      ? '单指拖动旋转视角，双指捏合缩放，双指拖动平移。'
      : '按住左键拖动旋转，滚轮缩放，按住右键拖动平移。'),
  },
  { target: '#list', title: '看台与票价', body: '这里列出每个看台的位置和官方票价。点击任一看台，镜头会飞到那里，并显示看台详情。' },
  { target: '#list', title: '选座与座位视角', body: '在看台详情里点「进入选座」，再点选座位；双击座位或点「座位视角」，就能坐在这个座位上看赛道。' },
  { target: '#minimap', title: '赛道小地图', body: '小地图标出了 16 个弯道和各看台的位置，点击看台圆点也能直接跳转。' },
  { target: '#themeSeg', title: '白天 / 黑夜', body: '切换到黑夜，赛道照明、看台和建筑的灯光会自动亮起。' },
  { target: '.dock', title: '回到全景', body: '看迷路了？随时点「全景」回到俯瞰视角。现在开始探索吧。' },
];

export function initGuide({ force = false } = {}) {
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch { /* 无痕模式等 */ }
  addHelpButton();
  if (!seen || force) setTimeout(start, 2200); // 等开场镜头落定
}

function addHelpButton() {
  if (document.getElementById('guideBtn')) return;
  const b = document.createElement('button');
  b.id = 'guideBtn';
  b.className = 'help-btn glass';
  b.title = '操作引导';
  b.setAttribute('aria-label', '操作引导');
  b.textContent = '?';
  b.addEventListener('click', start);
  document.querySelector('.top-right')?.appendChild(b);
}

let root = null;
function start() {
  if (root) return;
  let i = 0;
  root = document.createElement('div');
  root.id = 'guide';
  root.innerHTML = `<div class="g-ring"></div>
    <div class="g-card glass" role="dialog" aria-modal="true" aria-labelledby="gTitle">
      <div class="g-icon"></div>
      <h3 id="gTitle"></h3><p></p>
      <div class="g-foot"><div class="g-dots"></div>
        <div class="g-btns"><button class="g-skip">跳过</button><button class="g-prev">上一步</button><button class="g-next">下一步</button></div></div>
    </div>`;
  document.body.appendChild(root);
  const ring = root.querySelector('.g-ring'), card = root.querySelector('.g-card');
  const dots = root.querySelector('.g-dots');
  dots.innerHTML = STEPS.map(() => '<i></i>').join('');
  const done = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    root.classList.remove('on');
    removeEventListener('keydown', onKey); removeEventListener('resize', place);
    const r = root; root = null;
    setTimeout(() => r.remove(), 350);
  };
  const go = (k) => { if (k >= STEPS.length) return done(); i = Math.max(0, k); render(); };
  function place() {
    const s = STEPS[i];
    const el = s.target && document.querySelector(s.target);
    const r = el && el.getClientRects().length ? el.getBoundingClientRect() : null; // fixed 定位元素的 offsetParent 为 null，不能用它判断可见
    const cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight, m = 14;
    if (!r || !r.width) {
      ring.classList.add('none');
      ring.style.left = W / 2 + 'px'; ring.style.top = H / 2 + 'px'; ring.style.width = ring.style.height = '0px';
      card.style.left = (W - cw) / 2 + 'px'; card.style.top = mobile() ? H - ch - 24 + 'px' : (H - ch) / 2 + 'px';
      return;
    }
    const pad = 8;
    ring.classList.remove('none');
    ring.style.left = r.left - pad + 'px'; ring.style.top = r.top - pad + 'px';
    ring.style.width = r.width + pad * 2 + 'px'; ring.style.height = r.height + pad * 2 + 'px';
    // 卡片放在目标旁边空间最大的一侧
    const room = { right: W - r.right, left: r.left, below: H - r.bottom, above: r.top };
    let x, y;
    if (mobile()) { x = (W - cw) / 2; y = room.below > ch + 30 ? r.bottom + 18 : Math.max(m, r.top - ch - 18); }
    else if (room.right > cw + 40) { x = r.right + 22; y = Math.min(Math.max(m, r.top), H - ch - m); }
    else if (room.left > cw + 40) { x = r.left - cw - 22; y = Math.min(Math.max(m, r.top), H - ch - m); }
    else if (room.above > ch + 30) { x = Math.min(Math.max(m, r.left + r.width / 2 - cw / 2), W - cw - m); y = r.top - ch - 22; }
    else { x = Math.min(Math.max(m, r.left + r.width / 2 - cw / 2), W - cw - m); y = r.bottom + 22; }
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  function render() {
    const s = STEPS[i];
    root.querySelector('.g-icon').textContent = s.icon || String(i + 1);
    root.querySelector('.g-icon').classList.toggle('num', !s.icon);
    root.querySelector('h3').textContent = s.title;
    root.querySelector('p').textContent = typeof s.body === 'function' ? s.body() : s.body;
    dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i));
    root.querySelector('.g-prev').style.display = i ? '' : 'none';
    root.querySelector('.g-skip').style.display = i < STEPS.length - 1 ? '' : 'none';
    root.querySelector('.g-next').textContent = i === 0 ? '开始' : i === STEPS.length - 1 ? '完成' : '下一步';
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    place();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') done();
    else if (e.key === 'Enter' || e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
  };
  root.querySelector('.g-next').onclick = () => go(i + 1);
  root.querySelector('.g-prev').onclick = () => go(i - 1);
  root.querySelector('.g-skip').onclick = done;
  addEventListener('keydown', onKey); addEventListener('resize', place);
  render();
  requestAnimationFrame(() => root?.classList.add('on'));
  setTimeout(() => root?.classList.add('on'), 50);
  root.querySelector('.g-next').focus();
}
