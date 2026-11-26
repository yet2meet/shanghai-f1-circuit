import * as THREE from 'three';
import clipping from 'polygon-clipping';
import { asGround } from '../../osm.js';
import { groundDetail } from '../../textures.js';
import { ribbon, std, V } from '../../util.js';
import { bounds } from './terrain.js';

// Keep shared edges on the same millimetre grid during polygon clipping.
const units = 1000;
const snap = value => Math.round(value * units);

function footprint(geometry) {
  const { index, attributes: { position } } = geometry;
  const triangles = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const ring = [0, 1, 2].map(offset => {
      const vertex = index ? index.getX(i + offset) : i + offset;
      return [snap(position.getX(vertex)), snap(-position.getZ(vertex))];
    });
    ring.push(ring[0]);
    triangles.push([ring]);
  }
  return triangles;
}

function geometryOf(polygons) {
  const shape = ([outer, ...holes]) => {
    const points = ring => ring.slice(0, -1).map(([x, n]) => new THREE.Vector2(x / units, n / units));
    const surface = new THREE.Shape(points(outer));
    for (const hole of holes) surface.holes.push(new THREE.Path(points(hole)));
    return surface;
  };
  return new THREE.ShapeGeometry(polygons.map(shape)).rotateX(-Math.PI / 2);
}

export function buildEntrancePaving(root, roadRoot, walks, plazas, crossings) {
  const walkStrips = walks.flatMap(({ path, width }) => {
    const geometry = ribbon(path, { offA: width, offB: -width });
    const triangles = footprint(geometry);
    geometry.dispose();
    return triangles;
  });
  const pedestrian = clipping.union([...walkStrips, ...plazas.map(p => [p.map(([x, n]) => [snap(x), snap(n)])])]);
  const [x0, n0, x1, n1] = bounds(pedestrian.flatMap(p => p[0]));
  const nearEntrance = ([outer]) => {
    const [a, b, c, d] = bounds(outer);
    return a <= x1 && b <= n1 && c >= x0 && d >= n0;
  };
  const traffic = clipping.union(roadRoot.children
    .filter(mesh => ['suzuka-road', 'suzuka-service', 'suzuka-gravel'].includes(mesh.name))
    .flatMap(mesh => footprint(mesh.geometry).filter(nearEntrance)));
  const paving = groundDetail(std('#c9b99f', {}, 0.23), 'asphalt', { size: 2.1, k: 0.21 });
  const walk = new THREE.Mesh(geometryOf(clipping.difference(pedestrian, traffic)), paving);
  walk.name = 'suzuka-entrance-paving';
  walk.position.y = 0.112;
  root.add(asGround(walk, -1.87));

  const mappedWalk = roadRoot.getObjectByName('suzuka-walk');
  if (mappedWalk) {
    const nearby = [], outside = [];
    for (const triangle of footprint(mappedWalk.geometry)) {
      (nearEntrance(triangle) ? nearby : outside).push(triangle);
    }
    const geometry = geometryOf([...outside, ...clipping.difference(nearby, pedestrian, traffic)]);
    mappedWalk.geometry.dispose();
    mappedWalk.geometry = geometry;
  }

  const stripes = [];
  const crossable = clipping.intersection(traffic, pedestrian);
  for (const [from, to, halfWidth] of crossings) {
    const a = V(...from), b = V(...to);
    const travel = b.clone().sub(a).normalize();
    const across = new THREE.Vector3(-travel.z, 0, travel.x);
    for (let offset = -halfWidth + 0.48; offset < halfWidth - 0.35; offset += 0.85) {
      const point = (p, side) => {
        const v = p.clone().addScaledVector(across, offset + side * 0.22);
        return [snap(v.x), snap(-v.z)];
      };
      stripes.push([[point(a, -1), point(b, -1), point(b, 1), point(a, 1)]]);
    }
  }
  const marking = new THREE.Mesh(geometryOf(clipping.intersection(stripes, crossable)), std('#f4f2e9', {}, 0.21));
  marking.name = 'suzuka-pedestrian-crossings';
  marking.position.y = 0.081;
  root.add(asGround(marking, -1.98));
}
