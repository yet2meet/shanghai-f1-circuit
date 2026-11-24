// 中英双语：t('中文', 'English') 按当前语言取值；L(obj, 'name') 取数据里的 name / nameEn。
// 默认中文。切换语言不刷新页面：静态文字按 data-i18n 键替换，动态界面通过 onLang 注册的回调重绘。
import { circuit } from './circuits/index.js';

const KEY = 'sic-lang';
const saved = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
export let lang = saved === 'en' ? 'en' : 'zh'; // 默认中文；用户切换过则记住选择

export const t = (zh, en) => (lang === 'en' ? en : zh);
export const L = (o, k) => (lang === 'en' && o?.[k + 'En'] != null ? o[k + 'En'] : o?.[k]);
export const isEn = () => lang === 'en';

// 页面静态文字（index.html 中 data-i18n / data-i18n-title / data-i18n-aria）
const DICT = {
  day: ['白天', 'Day'],
  night: ['黑夜', 'Night'],
  dayNight: ['昼夜模式', 'Day / night'],
  pillList: ['看台与票价', 'Stands & prices'],
  pillInfo: ['赛道信息', 'Circuit info'],
  pillSat: ['卫星图', 'Satellite'],
  listTitle: ['看台与票价', 'Grandstands & Prices'],
  zoomOut: ['缩小', 'Zoom out'],
  zoomIn: ['放大', 'Zoom in'],
  home: ['全景', 'Overview'],
  homeTitle: ['回到全景', 'Back to overview'],
  osm: ['© OpenStreetMap 贡献者', '© OpenStreetMap contributors'],
  splashStep: ['正在准备', 'Preparing'],
  loadingProgress: ['加载进度', 'Loading progress'],
  langLabel: ['语言', 'Language'],
  switchCircuit: ['切换赛道', 'Switch circuit'],
};
export const d = (k) => t(...(circuit.dict[k] || DICT[k]));

export function applyStatic() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = d('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.innerHTML = d(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = d(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', d(el.dataset.i18nAria)); });
  document.querySelectorAll('#langSeg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  document.querySelector('#langSeg')?.classList.toggle('en', lang === 'en');
}

const listeners = new Set();
export function onLang(fn, { signal } = {}) {
  listeners.add(fn);
  signal?.addEventListener('abort', () => listeners.delete(fn), { once: true });
}
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
