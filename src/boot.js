// 入口：先显示轻量的地球启动页，再异步加载体积较大的 3D 主场景
import './splash.js';

window.__splash.progress(0.06, '正在加载渲染引擎');
import('./main.js').catch((err) => {
  console.error(err);
  window.__splash.fail('加载失败，请刷新页面重试');
});
