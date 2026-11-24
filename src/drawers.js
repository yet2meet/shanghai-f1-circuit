// 左上角（手机为底部）两个胶囊按钮：“看台与票价”“赛道信息”。平时收起，点击展开，同一时间只开一个。
import { t, L, onLang } from './i18n.js';
import { circuit } from './circuits/index.js';

let open = '';
/** info：当前赛道档案的 info（facts / notes）；没有看台的赛道不显示“看台与票价”按钮 */
export function initDrawers(data, { signal }) {
  const body = document.body;
  const pList = document.getElementById('pillList'), pInfo = document.getElementById('pillInfo');
  const info = document.getElementById('info');
  pList.style.display = circuit.hasStands ? '' : 'none';
  const renderInfo = () => {
    info.innerHTML = `<div class="d-scroll">
      <div class="panel-head" style="padding:4px 4px 10px"><h2>${L(circuit, 'name')}</h2><span class="muted">F1 ${L(circuit, 'gp')}</span></div>
      <div class="facts">${data.facts().map(([k, v]) => `<div${v.length > 11 ? ' class="wide"' : ''}><small>${k}</small><b>${v}</b></div>`).join('')}</div>
      ${data.notes().map((n) => `<p class="fact-note">${n}</p>`).join('')}
    </div>`;
  };
  renderInfo();
  const set = (which) => {
    open = open === which ? '' : which;
    if (open) body.dataset.open = open; else delete body.dataset.open;
    pList.setAttribute('aria-expanded', open === 'list');
    pInfo.setAttribute('aria-expanded', open === 'info');
  };
  pList.addEventListener('click', () => set('list'), { signal });
  pInfo.addEventListener('click', () => set('info'), { signal });
  // 选了看台就收起列表（详情面板会在另一侧打开）
  document.getElementById('listItems').addEventListener('click', (e) => { if (e.target.closest('.item') && open) set(open); }, { signal });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { e.stopImmediatePropagation(); set(open); } }, { capture: true, signal });
  onLang(renderInfo, { signal });
}
export const closeDrawers = () => { if (open) document.getElementById(open === 'list' ? 'pillList' : 'pillInfo').click(); };
