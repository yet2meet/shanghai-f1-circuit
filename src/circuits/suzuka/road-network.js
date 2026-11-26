import { makePath } from '../../util.js';
import { indexPath, sampleLine } from './terrain.js';

function visibleRuns(roads, trackAt, track, showRoad) {
  const runs = [];
  for (const road of roads) {
    const path = makePath(sampleLine(road.p, 3.2));
    const half = road.w / 2;
    let start = 0;
    for (let i = 0; i <= path.N; i++) {
      if (i < path.N) {
        const p = path.pts[i], normal = path.nor[i];
        const hit = trackAt(p.x, p.z, p.y);
        const offCircuit = !hit || hit.d >= track.widthAt(hit.i) + 0.75 || Math.abs(p.y - hit.height) >= 1.3;
        if (offCircuit && [-half, 0, half].every(offset =>
          showRoad(p.x + normal.x * offset, -p.z - normal.z * offset, road))) continue;
      }
      if (i - start > 1) runs.push({ road, points: path.pts.slice(start, i) });
      start = i + 1;
    }
  }
  return runs;
}

// Audit the same clipped strips that will be drawn. Shared vertices and
// pavement overlaps join the strips before dangling branches are removed.
export function connectedRoads(roads, trackAt, track, showRoad, atDestination) {
  const runs = visibleRuns(roads, trackAt, track, showRoad);
  const vertices = new Map();
  const link = (a, b) => {
    if (a === b) return;
    a.neighbors.add(b);
    b.neighbors.add(a);
  };
  for (const run of runs) {
    const { road, points } = run;
    run.at = indexPath(points, false, road.w / 2 + 0.12);
    const closedCircuit = road.kind === 'raceway' && points[0].distanceToSquared(points.at(-1)) < 0.01;
    run.nodes = points.map((p, i) => {
      const key = p.x + ':' + p.z;
      if (!vertices.has(key)) vertices.set(key, { point: p, neighbors: new Set(), anchor: false });
      const node = vertices.get(key);
      if (closedCircuit || atDestination(p.x, -p.z, road, i === 0 || i === points.length - 1)) node.anchor = true;
      return node;
    });
    for (let i = 1; i < run.nodes.length; i++) link(run.nodes[i - 1], run.nodes[i]);
  }
  for (const run of runs) {
    for (const [end, previous] of [[run.nodes[0], run.nodes[1]], [run.nodes.at(-1), run.nodes.at(-2)]]) {
      if (end.neighbors.size > 1) continue;
      const direction = end.point.clone().sub(previous.point).normalize();
      let joint;
      for (const other of runs) {
        if (other === run) continue;
        const hit = other.at(end.point.x, end.point.z);
        if (!hit || hit.d > other.road.w / 2 || (joint && hit.d >= joint.d)) continue;
        const index = hit.i + Number(hit.t >= 0.5);
        if (index === 0 || index === other.nodes.length - 1) continue;
        const tangent = other.points[hit.i + 1].clone().sub(other.points[hit.i]).normalize();
        if (Math.abs(direction.dot(tangent)) > 0.94) continue;
        joint = { d: hit.d, node: other.nodes[index] };
      }
      if (joint) link(end, joint.node);
    }
  }
  const loose = [...vertices.values()].filter(node => !node.anchor && node.neighbors.size < 2);
  for (let i = 0; i < loose.length; i++) {
    const node = loose[i];
    for (const next of node.neighbors) {
      next.neighbors.delete(node);
      if (!next.anchor && next.neighbors.size === 1) loose.push(next);
    }
    node.neighbors.clear();
  }
  // A cycle without an entrance or destination is still an isolated remnant.
  const reachable = new Set();
  const connected = [...vertices.values()].filter(node => node.anchor);
  for (let i = 0; i < connected.length; i++) {
    const node = connected[i];
    if (reachable.has(node)) continue;
    reachable.add(node);
    for (const next of node.neighbors) if (!reachable.has(next)) connected.push(next);
  }
  const result = [];
  for (const { road, nodes } of runs) {
    let start = 0;
    for (let i = 1; i <= nodes.length; i++) {
      if (i < nodes.length && reachable.has(nodes[i]) && nodes[i - 1].neighbors.has(nodes[i])) continue;
      if (i - start > 1) result.push({ road, points: nodes.slice(start, i).map(node => node.point) });
      start = i;
    }
  }
  return result;
}
