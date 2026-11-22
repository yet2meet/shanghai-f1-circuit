// 赛道注册表：只放轻量的元信息（名称、公里数、界面文案），不引入任何三维或地图数据。
// 场景与地图数据按赛道分模块，选中后动态加载。
//
// 启动时选哪条赛道：
//   1. 网址指定赛道时优先使用网址（分享链接用）；
//   2. 否则读上次退出时记住的赛道（同一浏览器 = 同一用户）；
//   3. 都没有（第一次来）→ 上海。
// 切换赛道 = 记住新赛道 + 刷新页面，启动页的地球会重新转到新赛道。

const KEY = 'sic-circuit';

export const CIRCUITS = [
  {
    id: 'gb',
    name: '银石赛道', nameEn: 'Silverstone Circuit',
    short: '银石赛道', shortEn: 'Silverstone',
    city: '银石', cityEn: 'Silverstone', gp: '英国大奖赛', gpEn: 'British Grand Prix',
    km: '5.891', turns: 18, hasStands: true, hasSeats: true, unpriced: true,
    load: () => import('./silverstone.js'),
    dict: {
      title: ['银石赛道 · Silverstone Circuit', 'Silverstone Circuit · Formula 1 British Grand Prix'],
      brandName: ['银石赛道', 'Silverstone Circuit'],
      brandShort: ['银石赛道', 'Silverstone'],
      brandSub: ['5.891 km · 18 弯', '5.891 km · 18 turns'],
      splashSub: ['FORMULA 1 · 英国大奖赛', 'FORMULA 1 · BRITISH GRAND PRIX'],
      listSub: ['座席为示意 · 票价未收录，请以官方售票信息为准', 'Schematic seating · prices not recorded; consult the official ticket site'],
      footnote: [
        '看台位置参考 2025 英国大奖赛场图。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Grandstand locations follow the 2025 British Grand Prix event map.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
  {
    id: 'sh',
    name: '上海国际赛车场', nameEn: 'Shanghai International Circuit',
    short: '上海国际赛车场', shortEn: 'Shanghai Circuit',
    city: '上海', cityEn: 'Shanghai', gp: '中国大奖赛', gpEn: 'Chinese Grand Prix',
    km: '5.451', turns: 16, hasStands: true, hasSeats: true,
    load: () => import('./shanghai.js'),
    dict: {
      title: ['上海国际赛车场 · Shanghai International Circuit', 'Shanghai International Circuit · Formula 1 Chinese Grand Prix'],
      brandName: ['上海国际赛车场', 'Shanghai International Circuit'],
      brandShort: ['上海国际赛车场', 'Shanghai Circuit'],
      brandSub: ['Shanghai International Circuit · 5.451 km · 16 弯', '上海国际赛车场 · 5.451 km · 16 turns'],
      splashSub: ['FORMULA 1 · 中国大奖赛', 'FORMULA 1 · CHINESE GRAND PRIX'],
      listSub: ['三日票 · 人民币', '3-day pass · CNY'],
      footnote: [
        '票价：2026 F1 喜力中国大奖赛官方票价表（久事体育）。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Prices: official 2026 F1 Heineken Chinese Grand Prix price list (Juss Sports).<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
  {
    id: 'sg',
    name: '滨海湾街道赛道', nameEn: 'Marina Bay Street Circuit',
    short: '滨海湾赛道', shortEn: 'Marina Bay',
    city: '新加坡', cityEn: 'Singapore', gp: '新加坡大奖赛', gpEn: 'Singapore Grand Prix',
    km: '4.927', turns: 19, hasStands: true, hasSeats: false,
    load: () => import('./singapore.js'),
    dict: {
      title: ['滨海湾街道赛道 · Marina Bay Street Circuit', 'Marina Bay Street Circuit · Formula 1 Singapore Grand Prix'],
      brandName: ['滨海湾街道赛道', 'Marina Bay Street Circuit'],
      brandShort: ['滨海湾赛道', 'Marina Bay'],
      brandSub: ['Marina Bay Street Circuit · 4.927 km · 19 弯', '滨海湾街道赛道 · 4.927 km · 19 turns'],
      splashSub: ['FORMULA 1 · 新加坡大奖赛', 'FORMULA 1 · SINGAPORE GRAND PRIX'],
      listSub: ['三日票 · 新币 · 官网当前标价', '3-day pass · SGD · current website price'],
      footnote: [
        '票价：新加坡大奖赛官网各看台页面当前显示的三日票成人标价（页面为 2027 年赛事，未找到 2026 年价格）。看台位置据官网与官方 Circuit Park Map，外形与尺寸为示意。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Prices: 3-day adult prices currently shown on the Singapore GP grandstand pages (the page is for the 2027 event; no 2026 prices found). Stand locations follow the website and official Circuit Park Map; shapes and sizes are schematic.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
];

const byId = Object.fromEntries(CIRCUITS.map((c) => [c.id, c]));

function resolve() {
  try {
    const q = new URLSearchParams(location.search).get('c');
    if (q && byId[q]) return q;
  } catch { /* 非浏览器环境 */ }
  try {
    const s = localStorage.getItem(KEY);
    if (s && byId[s]) return s;
  } catch { /* 无痕模式等 */ }
  return 'sh';
}

export const CURRENT = resolve();
export const circuit = byId[CURRENT];

/** 记住当前赛道：下次打开时直接回到这里 */
export function rememberCircuit(id = CURRENT) {
  try { localStorage.setItem(KEY, id); } catch { /* 无痕模式等 */ }
}

/**
 * 切换赛道：记住新赛道 → 记下“从哪来、到哪去”（新页面的启动页据此接着转，见 splash.js）→ 刷新页面。
 * 网址里的 ?c= 去掉，以免覆盖刚做的选择。
 */
export function switchCircuit(id) {
  if (!byId[id] || id === CURRENT) return;
  rememberCircuit(id);
  try { sessionStorage.setItem('sic-trans', JSON.stringify({ from: CURRENT, to: id, ts: Date.now() })); } catch { /* 无痕模式等：退回普通启动页 */ }
  const u = new URL(location.href);
  u.searchParams.delete('c');
  location.href = u.toString();
}

/** 分享链接：非默认赛道带上 ?c=，朋友打开时直接看到同一条赛道 */
export function shareUrl(base) {
  return CURRENT === 'sh' ? base : `${base}?c=${CURRENT}`;
}
