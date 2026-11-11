// 入口：先显示轻量的地球启动页，再异步加载体积较大的 3D 主场景
import { initLang, t } from './i18n.js';
initLang(); // 先套用语言，启动页文字随之切换
import './splash.js';

window.__splash.progress(0.06, t('正在加载渲染引擎', 'Loading render engine'));
import('./main.js').catch((err) => {
  console.error(err);
  window.__splash.fail(t('加载失败，请刷新页面重试', 'Failed to load — please refresh'));
});
