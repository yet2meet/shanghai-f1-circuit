// 赛道注册表：只放轻量的元信息（名称、公里数、界面文案），不引入任何三维或地图数据。
// 场景与地图数据按赛道分模块，选中后动态加载。
//
// 启动时选哪条赛道：
//   1. 网址指定赛道时优先使用网址（分享链接用）；
//   2. 否则读上次退出时记住的赛道（同一浏览器 = 同一用户）；
//   3. 都没有（第一次来）→ 上海。
// 切换赛道后更新当前状态和上次访问记录，供分享和下次启动使用。

const KEY = 'sic-circuit';

export const CIRCUITS = [
  {
    id: 'it',
    name: '蒙扎国家赛车场', nameEn: 'Autodromo Nazionale Monza',
    short: '蒙扎赛道', shortEn: 'Monza',
    city: '蒙扎', cityEn: 'Monza', gp: '意大利大奖赛', gpEn: 'Italian Grand Prix',
    km: '5.793', turns: 11, hasStands: true, hasSeats: true, unpriced: true,
    load: () => import('./monza.js'),
    dict: {
      title: ['蒙扎国家赛车场 · Autodromo Nazionale Monza', 'Autodromo Nazionale Monza · Formula 1 Italian Grand Prix'],
      brandName: ['蒙扎国家赛车场', 'Autodromo Nazionale Monza'],
      brandShort: ['蒙扎赛道', 'Monza'],
      brandSub: ['Autodromo Nazionale Monza · 5.793 km · 11 弯', '蒙扎国家赛车场 · 5.793 km · 11 turns'],
      splashSub: ['FORMULA 1 · 意大利大奖赛', 'FORMULA 1 · ITALIAN GRAND PRIX'],
      pillList: ['看台与座位', 'Grandstands & seats'],
      listTitle: ['看台与座位', 'Grandstands & seats'],
      listSub: ['模型示意 · 无票价', 'Schematic · no prices'],
      footnote: [
        '分区与推荐入口参考 2026 意大利大奖赛资料。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Sections and recommended gates follow 2026 Italian GP references.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
  {
    id: 'jp',
    name: '铃鹿赛道', nameEn: 'Suzuka Circuit',
    short: '铃鹿赛道', shortEn: 'Suzuka',
    city: '铃鹿', cityEn: 'Suzuka', gp: '日本大奖赛', gpEn: 'Japanese Grand Prix',
    km: '5.807', turns: 18, hasStands: true, hasSeats: true, unpriced: true,
    load: () => import('./suzuka.js'),
    dict: {
      title: ['铃鹿赛道 · Suzuka Circuit', 'Suzuka Circuit · Formula 1 Japanese Grand Prix'],
      brandName: ['铃鹿赛道', 'Suzuka Circuit'],
      brandShort: ['铃鹿赛道', 'Suzuka'],
      brandSub: ['Suzuka Circuit · 5.807 km · 18 弯', '铃鹿赛道 · 5.807 km · 18 turns'],
      splashSub: ['FORMULA 1 · 日本大奖赛', 'FORMULA 1 · JAPANESE GRAND PRIX'],
      pillList: ['看台与座位', 'Grandstands & seats'],
      listTitle: ['看台与座位', 'Grandstands & seats'],
      listSub: ['模型示意 · 无票价', 'Schematic · no prices'],
      footnote: [
        '看台分区参考 2026 日本大奖赛资料。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Grandstand sections follow 2026 Japanese GP references.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
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
      brandSub: ['Silverstone Circuit · 5.891 km · 18 弯', '银石赛道 · 5.891 km · 18 turns'],
      splashSub: ['FORMULA 1 · 英国大奖赛', 'FORMULA 1 · BRITISH GRAND PRIX'],
      pillList: ['看台与座位', 'Grandstands & seats'],
      listTitle: ['看台与座位', 'Grandstands & seats'],
      listSub: ['模型示意 · 无票价', 'Schematic · no prices'],
      footnote: [
        '看台位置参考 2025 英国大奖赛场图。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Grandstand locations follow the 2025 British GP event map.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
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
    km: '4.927', turns: 19, hasStands: true, hasSeats: true,
    load: () => import('./singapore.js'),
    dict: {
      title: ['滨海湾街道赛道 · Marina Bay Street Circuit', 'Marina Bay Street Circuit · Formula 1 Singapore Grand Prix'],
      brandName: ['滨海湾街道赛道', 'Marina Bay Street Circuit'],
      brandShort: ['滨海湾赛道', 'Marina Bay'],
      brandSub: ['Marina Bay Street Circuit · 4.927 km · 19 弯', '滨海湾街道赛道 · 4.927 km · 19 turns'],
      splashSub: ['FORMULA 1 · 新加坡大奖赛', 'FORMULA 1 · SINGAPORE GRAND PRIX'],
      listSub: ['三日票 · 新币', '3-day pass · SGD'],
      footnote: [
        '票价：新加坡大奖赛官网各看台页面当前显示的三日票成人标价（页面为 2027 年赛事，未找到 2026 年价格）。看台位置据官网与官方 Circuit Park Map，外形与尺寸为示意。<br/>地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 贡献者',
        'Prices: 3-day adult prices currently shown on the Singapore GP grandstand pages (the page is for the 2027 event; no 2026 prices found). Stand locations follow the website and official Circuit Park Map; shapes and sizes are schematic.<br/>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      ],
    },
  },
];

const byId = Object.fromEntries(CIRCUITS.map((c) => [c.id, c]));

function storedCircuit() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function resolve() {
  try {
    const q = new URLSearchParams(location.search).get('c');
    if (q && byId[q]) return q;
  } catch { /* 非浏览器环境 */ }
  const s = storedCircuit();
  if (s && byId[s]) return s;
  return 'sh';
}

export let CURRENT = resolve();
export let circuit = byId[CURRENT];

/** 记住当前赛道：下次打开时直接回到这里 */
export function rememberCircuit(id = CURRENT) {
  try { localStorage.setItem(KEY, id); } catch { /* 无痕模式等 */ }
}

export function switchCircuit(id) {
  if (!byId[id] || id === CURRENT) return;
  CURRENT = id;
  circuit = byId[id];
  rememberCircuit(id);
  const u = new URL(location.href);
  u.searchParams.delete('c');
  history.replaceState(history.state, '', u);
}

/** 分享链接：非默认赛道带上 ?c=，朋友打开时直接看到同一条赛道 */
export function shareUrl(base) {
  return CURRENT === 'sh' ? base : `${base}?c=${CURRENT}`;
}
