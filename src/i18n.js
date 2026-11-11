// 中英双语：t('中文', 'English') 按当前语言取值；L(obj, 'name') 取数据里的 name / nameEn。
// 切换语言不刷新页面：静态文字按 data-i18n 键替换，动态界面通过 onLang 注册的回调重绘。
const KEY = 'sic-lang';
const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
export let lang = saved === 'en' || saved === 'zh' ? saved : (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';

export const t = (zh, en) => (lang === 'en' ? en : zh);
export const L = (o, k) => (lang === 'en' && o?.[k + 'En'] != null ? o[k + 'En'] : o?.[k]);
export const isEn = () => lang === 'en';

// 页面静态文字（index.html 中 data-i18n / data-i18n-title / data-i18n-aria）
const DICT = {
  title: ['上海国际赛车场 · Shanghai International Circuit', 'Shanghai International Circuit · Formula 1 Chinese Grand Prix'],
  brandName: ['上海国际赛车场', 'Shanghai International Circuit'],
  brandShort: ['上海国际赛车场', 'Shanghai Circuit'],
  brandSub: ['Shanghai International Circuit · 5.451 km · 16 弯', '上海国际赛车场 · 5.451 km · 16 turns'],
  day: ['白天', 'Day'],
  night: ['黑夜', 'Night'],
  dayNight: ['昼夜模式', 'Day / night'],
  listTitle: ['看台与票价', 'Grandstands & Prices'],
  listSub: ['三日票 · 人民币', '3-day pass · CNY'],
  footnote: [
    '票价：2026 F1 喜力中国大奖赛官方票价表（久事体育）。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
    'Prices: official 2026 F1 Heineken Chinese Grand Prix price list (Juss Sports).<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  ],
  zoomOut: ['缩小', 'Zoom out'],
  zoomIn: ['放大', 'Zoom in'],
  home: ['全景', 'Overview'],
  homeTitle: ['回到全景', 'Back to overview'],
  osm: ['© OpenStreetMap 贡献者', '© OpenStreetMap contributors'],
  splashSub: ['FORMULA 1 · 中国大奖赛', 'FORMULA 1 · CHINESE GRAND PRIX'],
  splashStep: ['正在准备', 'Preparing'],
  langLabel: ['语言', 'Language'],
};
export const d = (k) => t(...DICT[k]);

function applyStatic() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = d('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = d(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = d(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', d(el.dataset.i18nAria)); });
  document.querySelectorAll('#langSeg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  document.querySelector('#langSeg')?.classList.toggle('en', lang === 'en');
}

const listeners = [];
export const onLang = (fn) => listeners.push(fn);
export function setLang(l) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* 无痕模式等 */ }
  applyStatic();
  listeners.forEach((fn) => fn(l));
}

export function initLang() {
  applyStatic();
  document.querySelector('#langSeg')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setLang(b.dataset.lang);
  });
}
