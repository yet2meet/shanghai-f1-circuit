// 分享：点击后生成一张“当前视角”海报（标题 + 场景画面 + 二维码），下方可复制图片或只复制网址。
// 微信内置浏览器不允许网页写入图片到剪贴板，改为提示“长按图片发送给朋友”（微信原生菜单，还能识别二维码）。
import { t, L, onLang, isEn } from './i18n.js';
import { circuit, shareUrl } from './circuits/index.js';

const URL = shareUrl('https://shanghai-f1-circuit.pages.dev/'); // 非默认赛道带 ?c=，朋友打开直接看到同一条赛道
const ICON = '<svg viewBox="0 0 24 24"><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/></svg>';
const wechat = /MicroMessenger/i.test(navigator.userAgent);
const canCopyImage = !wechat && !!(navigator.clipboard && window.ClipboardItem);

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** 海报 1080×1440：标题 + 当前画面 + 二维码 */
async function makePoster(snapshot) {
  const [{ default: qrcode }, logo] = await Promise.all([import('qrcode-generator'), loadImg('./brand/f1-logo-white.svg')]);
  const W = 1080, H = 1440, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px "PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif`;
  g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, W, H);
  // 头部：F1 标志 + 名称
  const lg = g.createLinearGradient(72, 72, 160, 160); lg.addColorStop(0, '#ff1e1e'); lg.addColorStop(1, '#c00000');
  g.fillStyle = lg; rr(g, 72, 72, 96, 96, 26); g.fill(); g.drawImage(logo, 86, 104, 68, 17);
  g.fillStyle = '#1d1d1f'; g.font = font(700, 54); g.fillText(L(circuit, 'name'), 196, 128, W - 260);
  g.fillStyle = 'rgba(60,60,67,0.7)'; g.font = font(500, 30);
  g.fillText(isEn() ? `FORMULA 1 ${circuit.gpEn} · ${circuit.km} km · ${circuit.turns} turns` : `${circuit.nameEn} · F1 ${circuit.gp}`, 196, 172, W - 260);
  // 画面：当前视角，按比例裁切铺满
  const src = snapshot(), sx = 72, sy = 230, sw = W - 144, sh = 900;
  g.save(); rr(g, sx, sy, sw, sh, 36); g.clip();
  const k = Math.max(sw / src.width, sh / src.height), dw = src.width * k, dh = src.height * k;
  g.drawImage(src, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2; rr(g, sx, sy, sw, sh, 36); g.stroke();
  // 底部：二维码 + 说明
  const qr = qrcode(0, 'M'); qr.addData(URL); qr.make();
  const n = qr.getModuleCount(), qs = 220, cell = qs / n, qx = W - 72 - qs - 24, qy = 1190;
  g.fillStyle = '#fff'; rr(g, qx - 24, qy - 24, qs + 48, qs + 48, 28); g.fill();
  g.fillStyle = '#1d1d1f';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(qx + col * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
  g.fillStyle = '#1d1d1f'; g.font = font(700, 40);
  g.fillText(isEn() ? (circuit.hasStands ? 'Scout your seat before race day' : 'Walk the circuit before race day') : '开赛前，先来踩个点', 72, 1236, 700);
  // 两行说明等长（各 13 字），行动号召做成红色胶囊，长短对比是有意的
  g.fillStyle = 'rgba(60,60,67,0.75)'; g.font = font(500, 29);
  const lines = circuit.hasStands
    ? (isEn() ? ['Try any seat before you go', 'Day, night or satellite view'] : ['每个座位，都能先坐上去看看', '白天黑夜，卫星实景，一键切换'])
    : (isEn() ? ['Roam the street circuit freely', 'Day, night or satellite view'] : ['在街道赛道上，自由漫游', '白天黑夜，卫星实景，一键切换']);
  lines.forEach((s, i) => g.fillText(s, 72, 1290 + i * 42, 660));
  const cta = isEn() ? (wechat ? 'Long-press to step in  →' : 'Scan to step in  →') : (wechat ? '长按识别 · 进场  →' : '扫码进场  →');
  g.font = font(700, 26);
  const cw = g.measureText(cta).width + 44;
  g.fillStyle = '#e10600'; rr(g, 72, 1352, cw, 50, 25); g.fill();
  g.fillStyle = '#fff'; g.fillText(cta, 94, 1386);
  g.fillStyle = 'rgba(60,60,67,0.45)'; g.font = font(500, 21); g.fillText('shanghai-f1-circuit.pages.dev  ·  © 2026 yet2meet', 72, 1430);
  return c;
}

export function initShare(toast, snapshot) {
  const b = document.createElement('button');
  b.id = 'shareBtn';
  b.className = 'help-btn share-btn glass';
  b.innerHTML = ICON;
  const label = () => { b.title = t('分享', 'Share'); b.setAttribute('aria-label', b.title); };
  label(); onLang(label);
  document.querySelector('.top-right').insertBefore(b, document.getElementById('guideBtn'));

  const copyText = async (s) => {
    try { await navigator.clipboard.writeText(s); return true; } catch { /* 退回旧方法 */ }
    const ta = document.createElement('textarea'); ta.value = s; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); return ok;
  };

  let sheet = null;
  b.addEventListener('click', async () => {
    if (sheet) return;
    sheet = document.createElement('div');
    sheet.id = 'shareSheet';
    sheet.innerHTML = `<div class="ss-card glass" role="dialog" aria-modal="true">
      <button class="close ss-close" aria-label="${t('关闭', 'Close')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <h3>${t('分享这个视角', 'Share this view')}</h3>
      <div class="ss-img"><div class="ss-wait">${t('正在生成海报…', 'Creating poster…')}</div></div>
      <p class="ss-hint">${wechat ? t('长按图片，可发送给朋友或识别二维码', 'Long-press the image to send it or scan the QR code') : canCopyImage ? t('海报含二维码，扫码即可打开', 'The poster includes a QR code that opens the site') : t('长按（电脑上右键）海报即可复制', 'Long-press (or right-click) the poster to copy it')}</p>
      <div class="ss-btns">
        ${canCopyImage ? `<button class="btn primary ss-img-btn" disabled>${t('复制图片', 'Copy image')}</button>` : ''}
        <button class="btn ghost ss-link">${t('只复制网址', 'Copy link only')}</button>
      </div></div>`;
    document.body.appendChild(sheet);
    const close = () => { sheet.classList.remove('on'); removeEventListener('keydown', onKey, true); const s = sheet; sheet = null; setTimeout(() => s.remove(), 300); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    addEventListener('keydown', onKey, true);
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.ss-close')) close(); });
    sheet.querySelector('.ss-link').addEventListener('click', async () => {
      toast((await copyText(URL)) ? t('网址已复制，可以粘贴发送给朋友', 'Link copied — paste it to share') : URL);
    });
    requestAnimationFrame(() => sheet?.classList.add('on'));
    setTimeout(() => sheet?.classList.add('on'), 30);

    let poster;
    try { poster = await makePoster(snapshot); } catch (e) { console.error(e); }
    if (!sheet) return;
    const box = sheet.querySelector('.ss-img');
    if (!poster) { box.innerHTML = `<div class="ss-wait">${t('海报生成失败，可以先复制网址', 'Could not create the poster — copy the link instead')}</div>`; return; }
    const url = poster.toDataURL('image/jpeg', 0.9);
    box.innerHTML = `<img src="${url}" alt="${t('分享海报', 'Share poster')}" />`;   // data URL：微信长按可直接发送 / 保存
    const ib = sheet.querySelector('.ss-img-btn');
    if (ib) {
      // 预先生成 PNG：点击时立刻写入剪贴板（Safari 要求在点击的同一时刻调用，不能先等待生成）
      const png = new Promise((r) => poster.toBlob(r, 'image/png'));
      ib.disabled = false;
      ib.addEventListener('click', async () => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          toast(t('图片已复制，可以粘贴到聊天或文档里', 'Image copied — paste it into a chat or document'));
        } catch {
          toast(t('浏览器不允许复制图片，可以长按（电脑上右键）海报复制', 'This browser blocked copying — long-press (or right-click) the poster to copy it'));
        }
      });
    }
  });
}
