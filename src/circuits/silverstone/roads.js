// 以 OSM 共享节点接回引道。桥面高度与引道坡度为示意。
import osm from './osm-data.json';
const widths = { primary: 10, secondary: 9, tertiary: 8, unclassified: 7, residential: 6, living_street: 5, service: 4.5, pedestrian: 4, cycleway: 3, footway: 2, path: 1.6, track: 3.3, steps: 1.9 };
function roadWidth(r) {
  const width = Number(r.width);
  if (width > 0) return width;
  const lanes = Number(r.lanes);
  if (lanes > 0) return lanes * 3.1 + 0.5;
  if (r.service === 'parking_aisle') return 5.2;
  if (r.service === 'driveway') return 3.3;
  return widths[r.kind];
}
const line = (r, points = r.p) => ({ id: r.id, k: `road:${r.kind}`, surface: r.surface, w: roadWidth(r), y: 0, p: points.flat() });
const byId = new Map(osm.roads.map(r => [r.id, r]));
// 航拍可辨认两座车行通道桥。Wellington 的三条 OSM 线共用一个桥体。
const pavedBridges = {
  '4851856': { spanWidth: 7.7, carriageway: 6.4 },
  '126446852': { spanWidth: 12.3, carriageway: 6.1 },
};
const wellingtonFootways = new Set(['360074746', '360077715']);
const crossings = [
  ['4851856', '4851855', '7997754', 6.2],
  ['126446852', '4852061', '126446855', 6.2],
  ['360074746', '360074745', '360074739', 6.2],
  ['360077715', '360074741', '360077714', 6.2],
  ['892391586', '892391585', '227912198', 5.3],
  ['3594674', '1200856803', '126446853', 4.7],
  ['359883696', '359224808', '359883703', 4.7],
  ['359883702', '359883707', '359883694', 4.7],
];

// 从桥端沿邻接道路取至多 70 m 引道，截点另一侧保持地面道路。
function arm(road, node, max = 70) {
  const pts = road.nodes[0] === node ? road.p : road.nodes.at(-1) === node ? [...road.p].reverse() : null;
  if (!pts) throw new Error(`桥梁与引道 ${road.id} 没有共享节点`);
  const ramp = [pts[0]]; let distance = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance + length >= max) {
      const f = (max - distance) / length, cut = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      ramp.push(cut);
      return { ramp, remainder: [cut, ...pts.slice(i)] };
    }
    ramp.push(b); distance += length;
  }
  return { ramp, remainder: [] };
}

export function silverstoneRoads() {
  const used = new Set(crossings.flatMap(([bridge, first, last]) => [bridge, first, last]));
  const lines = osm.roads.filter(r => !used.has(r.id) && (!r.bridge || r.bridge === 'no') && (!r.tunnel || r.tunnel === 'no')).map(r => line(r));
  for (const [bridgeId, firstId, lastId, height] of crossings) {
    const bridge = byId.get(bridgeId), first = byId.get(firstId), last = byId.get(lastId);
    if (!bridge || !first || !last) throw new Error(`桥梁 ${bridgeId} 缺少原始数据`);
    const rampLength = height >= 5 ? 70 : 36;
    const a = arm(first, bridge.nodes[0], rampLength), b = arm(last, bridge.nodes.at(-1), rampLength);
    if (a.remainder.length > 1) lines.push(line(first, a.remainder));
    if (b.remainder.length > 1) lines.push(line(last, b.remainder));
    if (wellingtonFootways.has(bridgeId)) {
      // 两侧步行引道仍接到原节点，中间跨段由同一块 Wellington 桥面承接。
      for (const [road, approach] of [[first, a.ramp], [last, b.ramp]]) {
        const w = roadWidth(road);
        lines.push({ ...line(road, [...approach].reverse()), y: 1,
          deck: { height, widths: approach.map(() => w), junctions: [approach.length - 1, approach.length - 1], open: [1, 0] } });
      }
      continue;
    }
    const points = [...a.ramp.slice().reverse(), ...bridge.p.slice(1), ...b.ramp.slice(1)];
    const paved = pavedBridges[bridgeId];
    const w = paved?.spanWidth ?? roadWidth(bridge);
    const widths = [...rampWidths(a.ramp, w, roadWidth(first)).reverse(),
      ...bridge.p.slice(1).map(() => w),
      ...rampWidths(b.ramp, w, roadWidth(last)).slice(1)];
    const junctions = [a.ramp.length - 1, a.ramp.length + bridge.p.length - 2];
    lines.push({ ...line(bridge, points), w: Math.max(...widths), y: 1,
      deck: { height, widths, junctions, open: [1, 1], carriageway: paved?.carriageway } });
  }
  return lines;
}

function rampWidths(points, from, to) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths.at(-1) + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  return lengths.map(d => from + (to - from) * d / lengths.at(-1));
}
