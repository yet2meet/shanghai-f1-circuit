const endKey = (p, end) => (end ? p.slice(-2) : p.slice(0, 2)).join(',');
const MOTOR = /^road:(motorway|primary|secondary|tertiary|trunk|unclassified|residential|service|living_street)/;

export function joinBridgeWays(sourceWays, indoorEnds) {
  const endpoints = new Set(sourceWays.flatMap(({ k, p }) => [0, 1].map((end) => `${MOTOR.test(k)}:${endKey(p, end)}`)));
  const ways = sourceWays.flatMap((way) => {
    const pieces = [];
    let start = 0;
    for (let i = 2; i < way.p.length - 2; i += 2) {
      if (!endpoints.has(`${MOTOR.test(way.k)}:${way.p[i]},${way.p[i + 1]}`)) continue;
      pieces.push({ ...way, p: way.p.slice(start, i + 2) });
      start = i;
    }
    pieces.push({ ...way, p: way.p.slice(start) });
    return pieces;
  });
  const nodes = new Map();
  const ends = ways.map((way) => [0, 1].map((end) => {
    const { p } = way;
    const i = end ? p.length - 2 : 0, j = end ? i - 2 : 2;
    const dx = p[j] - p[i], dn = p[j + 1] - p[i + 1];
    const length = Math.hypot(dx, dn) || 1;
    const edge = { way, end, dx: dx / length, dn: dn / length };
    const key = `${MOTOR.test(way.k)}:${endKey(p, end)}`;
    if (!nodes.has(key)) nodes.set(key, []);
    nodes.get(key).push(edge);
    edge.node = nodes.get(key);
    return edge;
  }));
  const edges = new Map(ways.map((way, i) => [way, ends[i]]));

  // OSM 共用端点相连。岔口用转角最小的两条路作为连续主线。
  for (const node of nodes.values()) {
    let best = node.length === 2 ? 0.35 : -0.65;
    let pair;
    for (let i = 0; i < node.length; i++) for (let j = i + 1; j < node.length; j++) {
      const a = node[i], b = node[j];
      const dot = a.dx * b.dx + a.dn * b.dn;
      if (a.way !== b.way && dot < best) { best = dot; pair = [a, b]; }
    }
    if (pair) { pair[0].next = pair[1]; pair[1].next = pair[0]; }
  }

  const reached = new Set();
  for (const way of ways) {
    if (reached.has(way)) continue;
    const component = [way];
    reached.add(way);
    for (const member of component) for (const edge of edges.get(member)) for (const other of edge.node) {
      if (!reached.has(other.way)) { reached.add(other.way); component.push(other.way); }
    }
    const height = Math.max(...component.map((member) => member.height));
    for (const member of component) member.height = height;
  }

  const used = new Set();
  const starts = ends.flat();
  const runs = [];
  for (const start of [...starts.filter((edge) => !edge.next), ...starts]) {
    if (used.has(start.way)) continue;
    const p = [], widths = [], junctions = [];
    let current = start, last;
    while (current && !used.has(current.way)) {
      const { way, end } = current;
      if (p.length) widths[widths.length - 1] = (widths.at(-1) + way.w) / 2;
      for (let i = p.length ? 2 : 0; i < way.p.length; i += 2) {
        const j = end ? way.p.length - i - 2 : i;
        p.push(way.p[j], way.p[j + 1]);
        widths.push(way.w);
      }
      used.add(way);
      last = edges.get(way)[1 - end];
      current = last.next;
      if (current && !used.has(current.way) && last.node.length > 2) junctions.push(widths.length - 1);
    }
    const { k, height } = start.way;
    const open = [start, last].map((edge) => Number(edge.node.length === 1 && !indoorEnds.has(endKey(edge.way.p, edge.end))));
    runs.push({ k, y: 1, w: Math.max(...widths), p, deck: { height, widths, open, ...(junctions.length ? { junctions } : {}) } });
  }
  return runs;
}
