// 版权署名、免责声明与“关于”面板。
// 署名同时写进页面 meta、控制台和构建产物的文件头，整站被搬走时这些信息会一起带走，作为原创凭据。
import { t, L, onLang } from './i18n.js';
import { circuit } from './circuits/index.js';

export const AUTHOR = 'yet2meet';
export const YEAR = 2026;

let info = null; // 当前赛道档案的 info
let placeBar;
const sections = () => [
  [t('免责声明', 'Disclaimer'), info.disclaimer()],
  [t('版权声明', 'Copyright'), t(
    `© ${YEAR} ${AUTHOR}，保留所有权利。本站的源代码、程序化三维模型、界面设计与文案均为作者原创，未经书面许可，不得复制、修改、转载、分发或部署本站及其任何部分。`,
    `© ${YEAR} ${AUTHOR}. All rights reserved. The source code, procedural 3D models, interface design and text of this site are original works of the author. Copying, modifying, republishing, distributing or deploying this site or any part of it without written permission is prohibited.`)],
  [t('商标与素材', 'Trademarks & assets'), info.trademarks()],
  [t('数据来源', 'Data sources'), info.sources()],
];

export function initAbout(circuitInfo) {
  info = circuitInfo;
  if (placeBar) {
    placeBar();
    if (dlg) fill();
    return;
  }
  // 左下角的署名条（点开“关于”）
  const bar = document.createElement('button');
  bar.id = 'aboutBar';
  bar.className = 'about-bar';
  const label = () => { bar.innerHTML = `© <i>${YEAR} </i>${AUTHOR} · <u>${t('关于', 'About')}<i>${t('与免责声明', ' & disclaimer')}</i></u>`; };
  label();
  bar.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  // 电脑：右下角一行小字；手机：挂在小地图卡片正下方的一个小胶囊（地图署名收进“关于”面板）
  const mq = matchMedia('(max-width: 860px)');
  placeBar = () => (mq.matches ? document.getElementById('minimap') : document.body).appendChild(bar);
  placeBar();
  mq.addEventListener('change', placeBar);
  onLang(() => { label(); if (dlg) fill(); });

  // 控制台署名
  console.log(`%c${circuit.name} · ${circuit.nameEn}%c\n© ${YEAR} ${AUTHOR}. All rights reserved. 未经许可禁止复制、转载或部署。`,
    'font:700 14px sans-serif;color:#e10600', 'font:12px sans-serif;color:inherit');
}

let dlg = null;
function fill() {
  dlg.querySelector('.ab-body').innerHTML = `
    <div class="ab-head"><div class="brand-mark"><span></span></div>
      <div><h3>${L(circuit, 'name')}</h3><p>${t('作者', 'Created by')} ${AUTHOR}</p></div></div>
    ${sections().map(([h, p]) => `<h4>${h}</h4><p>${p}</p>`).join('')}
    <p class="ab-sig">© ${YEAR} ${AUTHOR} · All rights reserved</p>`;
  dlg.querySelector('.ab-close').setAttribute('aria-label', t('关闭', 'Close'));
}
function open() {
  if (dlg) return;
  dlg = document.createElement('div');
  dlg.id = 'about';
  dlg.innerHTML = `<div class="ab-card glass" role="dialog" aria-modal="true">
    <button class="ab-close close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="ab-body"></div></div>`;
  document.body.appendChild(dlg);
  fill();
  const close = () => { dlg.classList.remove('on'); removeEventListener('keydown', onKey, true); const d = dlg; dlg = null; setTimeout(() => d.remove(), 300); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }; // 只关闭面板，不触发“返回全景”
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.ab-close')) close(); });
  addEventListener('keydown', onKey, true);
  setTimeout(() => dlg?.classList.add('on'), 20);
}
