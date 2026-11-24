// 赛道切换：左上角的品牌条就是切换入口，点开列出所有赛道。
import { t, L, onLang } from './i18n.js';
import { CIRCUITS, CURRENT } from './circuits/index.js';

const CODE = { sh: 'SH', sg: 'SG' };

export function initSwitcher(onSelect) {
  const brand = document.getElementById('brand');
  if (!brand) return;
  brand.setAttribute('role', 'button');
  brand.setAttribute('tabindex', '0');
  brand.setAttribute('aria-haspopup', 'listbox');
  brand.setAttribute('aria-expanded', 'false');
  brand.insertAdjacentHTML('beforeend', '<i class="chev" aria-hidden="true"></i>');

  const menu = document.createElement('div');
  menu.id = 'circuitMenu';
  menu.className = 'circuit-menu glass';
  menu.setAttribute('role', 'listbox');
  document.body.appendChild(menu);

  const label = () => { brand.title = t('切换赛道', 'Switch circuit'); brand.setAttribute('aria-label', `${L(CIRCUITS.find((c) => c.id === CURRENT), 'name')} · ${brand.title}`); };
  const render = () => {
    label();
    menu.innerHTML = `<div class="cm-title">${t('切换赛道', 'Switch circuit')}</div>` + CIRCUITS.map((c) => `
      <button class="cm-item${c.id === CURRENT ? ' active' : ''}" role="option" aria-selected="${c.id === CURRENT}" data-id="${c.id}">
        <div class="badge cm-badge">${CODE[c.id] || c.id.toUpperCase()}</div>
        <div class="item-main"><b>${L(c, 'name')}</b><span>${L(c, 'city')} · ${L(c, 'gp')} · ${c.km} km · ${c.turns}${t(' 弯', ' turns')}</span></div>
        ${c.id === CURRENT ? `<em class="cm-now">${t('当前', 'Now')}</em>` : ''}
      </button>`).join('') + `<p class="cm-note">${t('下次打开会回到你上次看的赛道。', 'Next time you open the site, you will return to the circuit you last viewed.')}</p>`;
  };
  render();
  onLang(render);

  let isOpen = false;
  const set = (on) => {
    isOpen = on;
    menu.classList.toggle('on', on);
    brand.setAttribute('aria-expanded', String(on));
    brand.classList.toggle('open', on);
  };
  brand.addEventListener('click', (e) => { e.stopPropagation(); set(!isOpen); });
  brand.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!isOpen); }
  });
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('.cm-item');
    if (!b) return;
    set(false);
    if (b.dataset.id !== CURRENT) onSelect(b.dataset.id);
  });
  document.addEventListener('click', () => { if (isOpen) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) { e.stopImmediatePropagation(); set(false); } }, true);
  return render;
}
