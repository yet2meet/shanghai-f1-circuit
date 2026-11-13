// 入口：先显示轻量的地球启动页，再异步加载体积较大的 3D 主场景
import { initLang, t } from './i18n.js';
initLang(); // 先套用语言，启动页文字随之切换
import './splash.js';
import { CURRENT, rememberCircuit } from './circuits/index.js';
import { initSwitcher } from './switcher.js';

document.body.dataset.circuit = CURRENT;
rememberCircuit(); // 记住当前赛道：同一浏览器下次打开直接回到这里（第一次来默认上海）
initSwitcher();    // 左上角品牌条 = 切换赛道入口

window.__splash.progress(0.06, t('正在加载渲染引擎', 'Loading render engine'));
import('./main.js').catch((err) => {
  console.error(err);
  window.__splash.fail(t('加载失败，请刷新页面重试', 'Failed to load — please refresh'));
});
