// 生成“桥周边”的 Overpass 查询片段（由 tools/fetch-osm-sg.sh 调用）。范围见 tools/osm-raw-sg/bridge-bboxes.json（tools/gen-sg.mjs 生成）。
//   node tools/bridge-queries.mjs b   桥周边的建筑与建筑部件
//   node tools/bridge-queries.mjs r   桥周边的主要道路（不含步行道、小径，避免数据过大）
import { readFileSync } from 'node:fs';
const boxes = JSON.parse(readFileSync(new URL('./osm-raw-sg/bridge-bboxes.json', import.meta.url), 'utf8'));
const mode = process.argv[2];
const ROADS = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const q = ([s, w, n, e]) => {
  const bb = `${s},${w},${n},${e}`;
  return mode === 'b' ? `way[building](${bb});way["building:part"](${bb});` : `way[highway~"^(${ROADS})$"](${bb});`;
};
console.log(boxes.map(q).join(''));
