// 先画出轻量地球，渲染器和初始赛道的模块并行载入。
import { applyStatic, initLang, t } from './i18n.js';
import { CIRCUITS, CURRENT, circuit, firstStartup, rememberCircuit, switchCircuit } from './circuits/index.js';
import { startSplash, startTransition } from './splash.js';
import { initSwitcher } from './switcher.js';

const initialCircuit = circuit;
const loading = Promise.all([import('./main.js'), initialCircuit.load().then((mod) => mod.default)]);
initLang();
document.body.dataset.circuit = CURRENT;
const splash = startSplash(firstStartup);
splash.progress(1 / 24, t('正在加载渲染引擎', 'Loading render engine'));

async function start() {
  const [{ prefetchCircuit, prepareCircuit, mountCircuit }, initialProfile] = await loading;
  const others = CIRCUITS.filter((target) => target.id !== initialCircuit.id);
  const prefetchOthers = () => others.forEach((target) => { void prefetchCircuit(target).catch(() => {}); });
  const targets = firstStartup ? [initialCircuit, ...others] : [initialCircuit];
  const milestones = firstStartup ? [2, 12, 18, 23] : [2, 23];
  let entry;
  if (firstStartup) prefetchOthers();
  for (const [i, target] of targets.entries()) {
    const startAt = milestones[i], span = milestones[i + 1] - startAt;
    splash.progress(startAt / 24, t(`正在准备${target.city}`, `Preparing ${target.cityEn}`));
    const prepared = await prepareCircuit(target, (p, label) => {
      splash.progress((startAt + p * span) / 24, label);
    }, i === 0 ? initialProfile : undefined);
    if (i === 0) entry = prepared;
  }

  let active = mountCircuit(entry);
  let switching = true;
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
    }
  });

  await splash.finish();
  rememberCircuit();
  active.reveal({ startup: true, guide: true });
  switching = false;
  if (!firstStartup) prefetchOthers();
}

start().catch((error) => {
  console.error(error);
  splash.fail(t('加载失败，请刷新页面重试', 'Could not load the circuit. Please refresh to try again.'));
});
