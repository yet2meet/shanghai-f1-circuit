// 2026 赛季车队（各赛道共用）
// 2026 赛季 11 支车队，按维修区车库顺序排列：
//   车库按上一赛季（2025）车队积分榜排名分配，冠军车队使用最靠近维修通道入口的车库（formula1.com 说明）。
//   2025 车队榜：迈凯伦、梅赛德斯、红牛、法拉利、威廉姆斯、Racing Bulls、阿斯顿·马丁、哈斯、Sauber（2026 起为奥迪）、Alpine；
//   凯迪拉克为 2026 年新加入的第 11 支车队。
// color 为各队常用的代表色；livery 为赛车涂装的主色 / 副色 / 点缀色（均为近似值，非官方色值）；
// logo 由 public/brand/manifest.json 提供（可选）。
export const TEAMS = [
  { id: 'mclaren', name: 'McLaren', zh: '迈凯伦', color: '#ff8000', text: '#111111', livery: ['#ff8000', '#1b1b1f', '#ff8000'] },
  { id: 'mercedes', name: 'Mercedes', zh: '梅赛德斯', color: '#27f4d2', text: '#111111', livery: ['#1c1d21', '#c9ced4', '#27f4d2'] },
  { id: 'redbull', name: 'Red Bull Racing', zh: '红牛', color: '#3671c6', text: '#ffffff', livery: ['#1b2a4a', '#e10600', '#ffcc00'] },
  { id: 'ferrari', name: 'Ferrari', zh: '法拉利', color: '#e8002d', text: '#ffffff', livery: ['#dc0000', '#f4f4f4', '#ffd800'] },
  { id: 'williams', name: 'Williams', zh: '威廉姆斯', color: '#64c4ff', text: '#0b1d3a', livery: ['#0a1e5c', '#00a3e0', '#ffffff'] },
  { id: 'racingbulls', name: 'Racing Bulls', zh: 'Racing Bulls', color: '#6692ff', text: '#ffffff', livery: ['#f4f5f7', '#1634cc', '#e10600'] },
  { id: 'astonmartin', name: 'Aston Martin', zh: '阿斯顿·马丁', color: '#229971', text: '#ffffff', livery: ['#00594f', '#cedc00', '#00594f'] },
  { id: 'haas', name: 'Haas', zh: '哈斯', color: '#b6babd', text: '#b0001e', livery: ['#f2f2f2', '#1b1b1f', '#e10600'] },
  { id: 'audi', name: 'Audi', zh: '奥迪', color: '#a7adb3', text: '#c4001c', livery: ['#b8bcc1', '#1b1b1f', '#e2001a'] },
  { id: 'alpine', name: 'Alpine', zh: 'Alpine', color: '#ff87bc', text: '#0a2a5c', livery: ['#0f3a8a', '#ff87bc', '#1b1b1f'] },
  { id: 'cadillac', name: 'Cadillac', zh: '凯迪拉克', color: '#1e1e24', text: '#ffffff', livery: ['#111114', '#f2f2f2', '#c9a14a'] },
];
export const TEAM_COLORS = TEAMS.map((t) => t.color);
