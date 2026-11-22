// 银石 2025 大奖赛布局的坐标基线。输入为 bacinger/f1-circuits 的 gb-1948.geojson（MIT）。
// 弯号根据 FIA 2025 英国大奖赛赛道图与中心线逐段对应，位置为近似值。
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('./osm-raw-silverstone/centerline.geojson', import.meta.url), 'utf8'));
const coordinates = source.features[0].geometry.coordinates;
if (source.features[0].geometry.type !== 'LineString' || coordinates.length !== 135 ||
    coordinates[0][0] !== coordinates.at(-1)[0] || coordinates[0][1] !== coordinates.at(-1)[1]) {
  throw new Error('银石中心线输入与弯号基准不一致；请先重新核对原始数据');
}
const R = 6371000, LAT0 = 52.0712, lon0 = -1.01675;
const kx = Math.PI / 180 * R * Math.cos(LAT0 * Math.PI / 180), ky = Math.PI / 180 * R;
const project = ([lon, lat]) => [+(kx * (lon - lon0)).toFixed(1), +(ky * (lat - LAT0)).toFixed(1)];
// 原始线以顺时针方向排列；重复闭合点不参与 Catmull-Rom 闭合。
const points = coordinates.slice(0, -1).map(project);
const turnIndices = [74, 80, 88, 94, 103, 110, 121, 129, 3, 14, 18, 21, 26, 31, 41, 54, 59, 67];
const turns = turnIndices.map((index, i) => [i + 1, ...points[index]]);
let length = 0;
for (let i = 0; i < points.length; i++) {
  const a = points[i], b = points[(i + 1) % points.length];
  length += Math.hypot(b[0] - a[0], b[1] - a[1]);
}
if (length < 5700 || length > 6100) throw new Error(`中心线长度异常: ${length.toFixed(1)} m`);

const out = new URL('../src/circuits/silverstone/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('track-data.js', out), `// 由 tools/gen-silverstone.mjs 生成。中心线 © bacinger/f1-circuits（MIT）。\n// (x, n) 分别朝东、朝北，单位米。弯号由 FIA 2025 赛道图估计。\nexport const TRACK_POINTS = ${JSON.stringify(points)};\nexport const TURNS = ${JSON.stringify(turns)};\nexport const TRUE_NORTH = [0, 1];\n`);
// 符合 satellite.js 使用的投影格式：x = 东向米，n = 北向米。
writeFileSync(new URL('projection.json', out), JSON.stringify({ LAT0, R, lon0, M: [-500, 25], r: [1, 0], d: [0, 1] }, null, 2) + '\n');
console.log(`中心线 ${points.length} 点，折线长度 ${length.toFixed(1)} m；FIA 官方长度 5891 m。`);
