// 先画出轻量地球，渲染器和初始赛道的模块并行载入。
import { applyStatic, initLang, t } from './i18n.js';
import { CIRCUITS, CURRENT, circuit, rememberCircuit, switchCircuit } from './circuits/index.js';
import { startSplash, startTransition } from './splash.js';
import { initSwitcher } from './switcher.js';

const initialCircuit = circuit;
const loading = Promise.all([import('./main.js'), initialCircuit.load().then((mod) => mod.default)]);
initLang();
document.body.dataset.circuit = CURRENT;
const splash = startSplash();
splash.progress(1 / 24, t('正在加载渲染引擎', 'Loading render engine'));

async function start() {
  const [{ prefetchCircuit, prepareCircuit, mountCircuit }, initialProfile] = await loading;
  splash.progress(2 / 24, t(`正在准备${initialCircuit.city}`, `Preparing ${initialCircuit.cityEn}`));
  let entry = await prepareCircuit(initialCircuit, (p, label) => {
    splash.progress((2 + p * 21) / 24, label);
  }, initialProfile);

  let active = mountCircuit(entry);
  let switching = true;
  const others = CIRCUITS.filter((target) => target.id !== initialCircuit.id);
  let prefetchPending = false;

  // 空闲时逐个载入模块。场景搭建和预渲染留给切换时的共享渲染器。
  function schedulePrefetch() {
    if (switching || prefetchPending || !others.length) return;
    prefetchPending = true;
    const loadNext = async () => {
      try {
        if (!switching) await prefetchCircuit(others.shift());
      } catch {
        // 单个模块失败后继续预取队列。
      } finally {
        prefetchPending = false;
        schedulePrefetch();
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(loadNext, { timeout: 2500 });
    } else {
      window.setTimeout(loadNext, 250);
    }
  }

  const renderSwitcher = initSwitcher(async (id) => {
    if (switching || id === CURRENT) return;
    switching = true;
    const from = circuit;
    const target = CIRCUITS.find((item) => item.id === id);
    const transition = startTransition(from.id, target);
    document.body.classList.add('leaving');
    active.liftOff();
    void prefetchCircuit(target).catch(() => {});
    try {
      await transition.covered;
      active.pause();
      const next = await prepareCircuit(target, (p, label) => transition.progress(p, label));
      active.dispose();
      switchCircuit(id);
      document.body.dataset.circuit = CURRENT;
      applyStatic();
      active = mountCircuit(next);
      entry = next;
      renderSwitcher();
      await transition.finish();
      active.reveal();
    } catch (error) {
      console.error(error);
      active.dispose();
      switchCircuit(from.id);
      document.body.dataset.circuit = CURRENT;
      applyStatic();
      active = mountCircuit(entry);
      renderSwitcher();
      active.reveal({ recovering: true });
      transition.dismiss();
      active.notify(t('场地加载失败，请重试', 'Could not load the circuit. Please try again.'));
    } finally {
      document.body.classList.remove('leaving');
      switching = false;
      schedulePrefetch();
    }
  });

  await splash.finish();
  rememberCircuit();
  active.reveal({ startup: true, guide: true });
  switching = false;
  await splash.closed;
  schedulePrefetch();
}

start().catch((error) => {
  console.error(error);
  splash.fail(t('加载失败，请刷新页面重试', 'Could not load the circuit. Please refresh to try again.'));
});
