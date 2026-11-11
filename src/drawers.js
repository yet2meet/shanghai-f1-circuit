// 左上角（手机为底部）两个胶囊按钮：“看台与票价”“赛道信息”。平时收起，点击展开，同一时间只开一个。
import { t, onLang } from './i18n.js';

// 赛道基本信息（FIA / F1 官方公布的赛道数据；圈速纪录截至 2025 赛季）
const facts = () => [
  [t('赛道长度', 'Track length'), '5.451 km'],
  [t('比赛圈数', 'Race laps'), '56'],
  [t('比赛距离', 'Race distance'), '305.066 km'],
  [t('弯道', 'Corners'), t('16 个（7 左 · 9 右）', '16 (7 left · 9 right)')],
  [t('最长直道', 'Longest straight'), t('约 1.2 km（13–14 号弯之间）', '≈ 1.2 km (Turns 13–14)')],
  [t('首届大奖赛', 'First Grand Prix'), '2004'],
  [t('赛道设计', 'Designer'), 'Hermann Tilke'],
  [t('比赛圈速纪录', 'Race lap record'), '1:32.238'],
];
const notes = () => [
  t('圈速纪录由迈克尔·舒马赫于 2004 年创造（截至 2025 赛季）。', 'Lap record set by Michael Schumacher in 2004 (as of the 2025 season).'),
  t('赛道平面取汉字“上”的造型；1–2 号弯是一个不断收紧的蜗牛形右弯，14 号弯是全年最重的刹车点之一。', 'The layout is shaped like the Chinese character 上 (“shang”). Turns 1–2 form a tightening snail-shaped right-hander; Turn 14 is one of the heaviest braking points of the season.'),
  t('赛车场建在嘉定原有的沼泽地上，地基靠大量桩基和发泡聚苯乙烯块稳定，整体地势平坦。', 'The circuit was built on former marshland in Jiading, stabilised with extensive piling and expanded polystyrene blocks; the site is essentially flat.'),
];

let open = '';
export function initDrawers() {
  const body = document.body;
  const pList = document.getElementById('pillList'), pInfo = document.getElementById('pillInfo');
  const info = document.getElementById('info');
  const renderInfo = () => {
    info.innerHTML = `<div class="d-scroll">
      <div class="panel-head" style="padding:4px 4px 10px"><h2>${t('上海国际赛车场', 'Shanghai International Circuit')}</h2><span class="muted">${t('F1 中国大奖赛', 'F1 Chinese Grand Prix')}</span></div>
      <div class="facts">${facts().map(([k, v]) => `<div${v.length > 11 ? ' class="wide"' : ''}><small>${k}</small><b>${v}</b></div>`).join('')}</div>
      ${notes().map((n) => `<p class="fact-note">${n}</p>`).join('')}
    </div>`;
  };
  renderInfo();
  const set = (which) => {
    open = open === which ? '' : which;
    if (open) body.dataset.open = open; else delete body.dataset.open;
    pList.setAttribute('aria-expanded', open === 'list');
    pInfo.setAttribute('aria-expanded', open === 'info');
  };
  pList.addEventListener('click', () => set('list'));
  pInfo.addEventListener('click', () => set('info'));
  // 选了看台就收起列表（详情面板会在另一侧打开）
  document.getElementById('listItems').addEventListener('click', (e) => { if (e.target.closest('.item') && open) set(open); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); set(open); } }, true);
  onLang(renderInfo);
}
export const closeDrawers = () => { if (open) document.getElementById(open === 'list' ? 'pillList' : 'pillInfo').click(); };
