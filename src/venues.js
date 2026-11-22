// F1 大奖赛举办地（按 2026 赛历整理的 24 站，坐标为赛道大致位置）
// 赛历每年会有调整，增删分站直接改这个列表即可。
// id：本站已经做好三维模型的赛道（与 src/circuits/index.js 的 id 对应），启动页的地球会停在当前选中的那一站。
export const GP_VENUES = [
  { city: '墨尔本', gp: '澳大利亚大奖赛', cityEn: 'Melbourne', gpEn: 'Australian Grand Prix', lat: -37.85, lon: 144.97 },
  { city: '上海', gp: '中国大奖赛', cityEn: 'Shanghai', gpEn: 'Chinese Grand Prix', lat: 31.34, lon: 121.22, id: 'sh' },
  { city: '铃鹿', gp: '日本大奖赛', cityEn: 'Suzuka', gpEn: 'Japanese Grand Prix', lat: 34.84, lon: 136.54 },
  { city: '萨基尔', gp: '巴林大奖赛', cityEn: 'Sakhir', gpEn: 'Bahrain Grand Prix', lat: 26.03, lon: 50.51 },
  { city: '吉达', gp: '沙特阿拉伯大奖赛', cityEn: 'Jeddah', gpEn: 'Saudi Arabian Grand Prix', lat: 21.63, lon: 39.1 },
  { city: '迈阿密', gp: '迈阿密大奖赛', cityEn: 'Miami', gpEn: 'Miami Grand Prix', lat: 25.96, lon: -80.24 },
  { city: '蒙特利尔', gp: '加拿大大奖赛', cityEn: 'Montréal', gpEn: 'Canadian Grand Prix', lat: 45.5, lon: -73.52 },
  { city: '蒙特卡洛', gp: '摩纳哥大奖赛', cityEn: 'Monte Carlo', gpEn: 'Monaco Grand Prix', lat: 43.73, lon: 7.42 },
  { city: '巴塞罗那', gp: '巴塞罗那-加泰罗尼亚大奖赛', cityEn: 'Barcelona', gpEn: 'Barcelona-Catalunya Grand Prix', lat: 41.57, lon: 2.26 },
  { city: '斯皮尔伯格', gp: '奥地利大奖赛', cityEn: 'Spielberg', gpEn: 'Austrian Grand Prix', lat: 47.22, lon: 14.76 },
  { city: '银石', gp: '英国大奖赛', cityEn: 'Silverstone', gpEn: 'British Grand Prix', lat: 52.07, lon: -1.02, id: 'gb' },
  { city: '斯帕', gp: '比利时大奖赛', cityEn: 'Spa', gpEn: 'Belgian Grand Prix', lat: 50.44, lon: 5.97 },
  { city: '布达佩斯', gp: '匈牙利大奖赛', cityEn: 'Budapest', gpEn: 'Hungarian Grand Prix', lat: 47.58, lon: 19.25 },
  { city: '赞德沃特', gp: '荷兰大奖赛', cityEn: 'Zandvoort', gpEn: 'Dutch Grand Prix', lat: 52.39, lon: 4.54 },
  { city: '蒙扎', gp: '意大利大奖赛', cityEn: 'Monza', gpEn: 'Italian Grand Prix', lat: 45.62, lon: 9.28 },
  { city: '马德里', gp: '西班牙大奖赛', cityEn: 'Madrid', gpEn: 'Spanish Grand Prix', lat: 40.46, lon: -3.62 },
  { city: '巴库', gp: '阿塞拜疆大奖赛', cityEn: 'Baku', gpEn: 'Azerbaijan Grand Prix', lat: 40.37, lon: 49.85 },
  { city: '新加坡', gp: '新加坡大奖赛', cityEn: 'Singapore', gpEn: 'Singapore Grand Prix', lat: 1.29, lon: 103.86, id: 'sg' },
  { city: '奥斯汀', gp: '美国大奖赛', cityEn: 'Austin', gpEn: 'United States Grand Prix', lat: 30.13, lon: -97.64 },
  { city: '墨西哥城', gp: '墨西哥城大奖赛', cityEn: 'Mexico City', gpEn: 'Mexico City Grand Prix', lat: 19.4, lon: -99.09 },
  { city: '圣保罗', gp: '圣保罗大奖赛', cityEn: 'São Paulo', gpEn: 'São Paulo Grand Prix', lat: -23.7, lon: -46.7 },
  { city: '拉斯维加斯', gp: '拉斯维加斯大奖赛', cityEn: 'Las Vegas', gpEn: 'Las Vegas Grand Prix', lat: 36.11, lon: -115.17 },
  { city: '卢赛尔', gp: '卡塔尔大奖赛', cityEn: 'Lusail', gpEn: 'Qatar Grand Prix', lat: 25.49, lon: 51.45 },
  { city: '亚斯码头', gp: '阿布扎比大奖赛', cityEn: 'Yas Marina', gpEn: 'Abu Dhabi Grand Prix', lat: 24.47, lon: 54.6 },
];
