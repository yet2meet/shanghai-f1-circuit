// 右上角“分享”按钮：手机上调起系统分享面板；不支持时（如电脑、微信内置浏览器）复制链接并提示
import { t, onLang } from './i18n.js';

const URL = 'https://shanghai-f1-circuit.pages.dev/';
const ICON = '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/></svg>';

export function initShare(toast) {
  const b = document.createElement('button');
  b.id = 'shareBtn';
  b.className = 'help-btn share-btn glass';
  b.innerHTML = ICON;
  const label = () => { b.title = t('分享', 'Share'); b.setAttribute('aria-label', b.title); };
  label(); onLang(label);
  const wechat = /MicroMessenger/i.test(navigator.userAgent);
  b.addEventListener('click', async () => {
    const data = { title: t('上海国际赛车场 · F1 中国大奖赛', 'Shanghai International Circuit · F1 Chinese GP'), text: t('在浏览器里逛上海国际赛车场：看台、票价、座位视角、卫星图', 'Explore Shanghai International Circuit in 3D: stands, prices, seat views, satellite'), url: URL };
    if (!wechat && navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(URL); }
    catch { const ta = document.createElement('textarea'); ta.value = URL; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); }
    toast(wechat ? t('链接已复制 · 也可点右上角“…”分享给朋友', 'Link copied · or use the “…” menu to share') : t('链接已复制，可以粘贴发送给朋友', 'Link copied — paste it to share'));
  });
  const top = document.querySelector('.top-right');
  top.insertBefore(b, document.getElementById('guideBtn'));
}
