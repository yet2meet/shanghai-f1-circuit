// 版权署名、免责声明与“关于”面板。
// 署名同时写进页面 meta、控制台和构建产物的文件头，整站被搬走时这些信息会一起带走，作为原创凭据。
import { t, onLang } from './i18n.js';

export const AUTHOR = 'yet2meet';
export const YEAR = 2026;

const sections = () => [
  [t('免责声明', 'Disclaimer'), t(
    '本网站为个人非官方作品，与 Formula 1、FIA、上海国际赛车场及各车队均无隶属、赞助或合作关系。票价、票区、座位与入口信息仅供参考，购票与观赛请以官方渠道发布为准；本站不提供任何售票服务。场馆、赛道与建筑模型根据公开测绘数据与资料还原，可能与实际存在差异，部分细节为推测或示意。',
    'This is an unofficial personal project, not affiliated with, sponsored by or endorsed by Formula 1, the FIA, Shanghai International Circuit or any team. Prices, zones, seats and gates are for reference only — always rely on official channels for tickets and event information. This site does not sell tickets. The venue, track and buildings are reconstructed from public survey data and sources and may differ from reality; some details are inferred or illustrative.')],
  [t('版权声明', 'Copyright'), t(
    `© ${YEAR} ${AUTHOR}，保留所有权利。本站的源代码、程序化三维模型、界面设计与文案均为作者原创，未经书面许可，不得复制、修改、转载、分发或部署本站及其任何部分。`,
    `© ${YEAR} ${AUTHOR}. All rights reserved. The source code, procedural 3D models, interface design and text of this site are original works of the author. Copying, modifying, republishing, distributing or deploying this site or any part of it without written permission is prohibited.`)],
  [t('商标与素材', 'Trademarks & assets'), t(
    'Formula 1、F1 标志及各车队名称、标志均为其各自权利人所有，本站按项目方获得的授权使用，仅用于识别与展示。',
    'Formula 1, the F1 logo and all team names and logos are the property of their respective owners and are used under authorisation obtained by the project, for identification and display only.')],
  [t('数据来源', 'Data sources'), t(
    '票价：2026 F1 喜力中国大奖赛官方票价表（久事体育）。地图数据 © OpenStreetMap 贡献者（ODbL）。三维渲染：three.js。',
    'Prices: official 2026 F1 Heineken Chinese Grand Prix price list (Juss Sports). Map data © OpenStreetMap contributors (ODbL). 3D rendering: three.js.')],
];

export function initAbout() {
  // 左下角的署名条（点开“关于”）
  const bar = document.createElement('button');
  bar.id = 'aboutBar';
  bar.className = 'about-bar';
  const label = () => { bar.innerHTML = `© ${YEAR} ${AUTHOR} · <u>${t('关于与免责声明', 'About & disclaimer')}</u>`; };
  label();
  bar.addEventListener('click', open);
  document.body.appendChild(bar);
  onLang(() => { label(); if (dlg) fill(); });

  // 控制台署名
  console.log(`%c上海国际赛车场 · Shanghai International Circuit%c\n© ${YEAR} ${AUTHOR}. All rights reserved. 未经许可禁止复制、转载或部署。`,
    'font:700 14px sans-serif;color:#e10600', 'font:12px sans-serif;color:inherit');
}

let dlg = null;
function fill() {
  dlg.querySelector('.ab-body').innerHTML = `
    <div class="ab-head"><div class="brand-mark"><span></span></div>
      <div><h3>${t('上海国际赛车场', 'Shanghai International Circuit')}</h3><p>${t('作者', 'Created by')} ${AUTHOR}</p></div></div>
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
