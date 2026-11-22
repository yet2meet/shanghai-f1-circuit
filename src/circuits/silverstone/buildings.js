import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, std, V } from '../../util.js';

// 平面采用各建筑自己的 OSM 轮廓。Porsche 官方照片可辨认圆形玻璃厅和屋檐，
// Stowe 的场地图确认其与车库通道的关系。未有剖面处采用示意层高与开间。
export const FEATURE_BUILDINGS = {
  '359423684': 9.2, // Porsche Experience Centre
  '436789622': 7.1, // Stowe Complex
  '169852619': 5.6, // Silverstone Experience Centre
  '169852620': 6.2, // Workshop
  '227342443': 20.7, // Hilton Garden Inn，六层
};

export function buildSilverstoneBuildings(scene, buildings, raceways) {
  const white = std('#c4c7c7', { roughness: 0.70, metalness: 0.16 }, 0.18);
  const steel = std('#899199', { roughness: 0.57, metalness: 0.35 }, 0.14);
  const fascia = std('#41474c', { roughness: 0.62, metalness: 0.28 }, 0.17);
  const glass = std('#4d687a', { roughness: 0.21, metalness: 0.38 }, 0.24);
  const door = std('#a3a8a9', { roughness: 0.7, metalness: 0.2 }, 0.17);
  const dark = std('#3a4146', { roughness: 0.78 }, 0.16);
  for (const item of buildings) {
    const height = FEATURE_BUILDINGS[item.id];
    if (!height) continue;
    const isPorsche = item.id === '359423684';
    const isGarage = item.id === '436789622' || item.id === '169852620';
    const isHotel = item.id === '227342443';
    const shape = new THREE.Shape(item.p.map(([x, n]) => new THREE.Vector2(x, n)));
    const signedArea = THREE.ShapeUtils.area(shape.getPoints());
    const batch = new Map();
    const add = (material, geo) => {
      if (!batch.has(material)) batch.set(material, []);
      batch.get(material).push(geo.index ? geo.toNonIndexed() : geo);
    };
    const polygon = (material, y, depth) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      add(material, geo.rotateX(-Math.PI / 2).translate(0, y, 0));
    };
    polygon(white, 0, height - 0.45);
    if (isPorsche) {
      // 圆形屋顶气窗、银色外墙与屋顶平台可在保时捷资料的第 3、19 页辨认。
      const x = 264.5, z = 513;
      add(glass, new THREE.CylinderGeometry(6.4, 6.4, 1.05, 36).translate(x, height + 0.52, z));
      add(steel, new THREE.CylinderGeometry(6.6, 6.6, 0.45, 36).translate(x, height + 1.10, z));
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        add(steel, new THREE.BoxGeometry(0.09, 1.07, 0.09)
          .translate(x + Math.cos(angle) * 6.42, height + 0.52, z + Math.sin(angle) * 6.42));
      }
      // 标识朝向按入口前场和曲面轮廓推定，字样及相对高度参考官方外观图。
      const sign = canvasTex(1024, 256, (ctx, w, h) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 76px Arial';
        ctx.fillStyle = '#c70e25';
        ctx.fillText('P O R S C H E', w / 2, h * 0.37);
        ctx.font = 'bold 38px Arial';
        ctx.fillStyle = '#303237';
        ctx.fillText('Experience Centre Silverstone', w / 2, h * 0.71);
      });
      const signMat = std('#ffffff', { map: sign, alphaTest: 0.55, side: THREE.DoubleSide, roughness: 0.72 }, 0.32);
      const wall = item.p.slice(7, 14).map(p => V(...p));
      const lengths = [0];
      for (let i = 1; i < wall.length; i++) lengths.push(lengths.at(-1) + wall[i].distanceTo(wall[i - 1]));
      for (let i = 1; i < wall.length; i++) {
        const a = wall[i - 1], b = wall[i], t = b.clone().sub(a).normalize();
        const normal = new THREE.Vector3(t.z, 0, -t.x);
        const geo = new THREE.PlaneGeometry(a.distanceTo(b), 2.9);
        const uv = geo.attributes.uv, length = lengths.at(-1);
        for (let j = 0; j < uv.count; j++) uv.setX(j, 1 - (uv.getX(j) ? lengths[i] : lengths[i - 1]) / length);
        const middle = a.clone().lerp(b, 0.5).addScaledVector(normal, 0.15);
        add(signMat, geo.rotateY(Math.atan2(-t.z, t.x)).translate(middle.x, 6.1, middle.z));
      }
    }
    polygon(steel, height - 0.24, 0.24);
    const stowePit = raceways.filter(r => /Stowe Circuit ?Pit/i.test(r.name));
    const distanceToPit = (x, n) => {
      let best = Infinity;
      for (const road of stowePit) for (let i = 1; i < road.p.length; i++) {
        const [a, b] = [road.p[i - 1], road.p[i]];
        const dx = b[0] - a[0], dn = b[1] - a[1];
        const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (n - a[1]) * dn) / (dx * dx + dn * dn || 1), 0, 1);
        best = Math.min(best, Math.hypot(x - a[0] - dx * t, n - a[1] - dn * t));
      }
      return best;
    };
    for (let i = 0; i < item.p.length; i++) {
      const [x, n] = item.p[i], [xx, nn] = item.p[(i + 1) % item.p.length];
      const a = V(x, n), b = V(xx, nn), length = a.distanceTo(b);
      if (length < 0.3) continue;
      const tangent = b.clone().sub(a).normalize();
      const outward = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(signedArea > 0 ? 1 : -1);
      const place = (material, at, y, width, high, depth, offset = 0.035) => {
        const center = a.clone().addScaledVector(tangent, at).addScaledVector(outward, offset);
        add(material, new THREE.BoxGeometry(width, high, depth).rotateY(Math.atan2(-tangent.z, tangent.x))
          .translate(center.x, y, center.z));
      };
      place(fascia, length / 2, height - 0.31, length, 0.28, 0.19);
      if (isHotel) {
        const atrium = length < 7 && x > -415 && x < -405 && n > -200 && n < -192;
        const bays = Math.max(1, Math.round(length / 3.1)), pitch = length / bays;
        place(steel, length / 2, 0.59, length, 1.15, 0.08);
        if (atrium) place(glass, length / 2, 10.35, length, 19.6, 0.11);
        for (let level = 0; level < 5; level++) {
          const y = 5.20 + level * 3.18;
          place(steel, length / 2, y, length, 0.21, 0.93, 0.29);
          place(fascia, length / 2, y - 0.28, length, 0.15, 0.19);
          if (!atrium) for (let bay = 0; bay < bays; bay++) {
            place(glass, pitch * (bay + 0.5), y + 1.20, pitch * 0.69, 1.82, 0.10);
            place(steel, pitch * (bay + 0.5), y + 1.20, 0.072, 1.82, 0.14);
          }
        }
        if (!atrium && length > 8) {
          place(fascia, length / 2, 2.67, length - 0.25, 2.95, 0.09);
          for (let y = 1.32; y < 4.06; y += 0.15) place(steel, length / 2, y, length - 0.25, 0.03, 0.09, 0.10);
        }
        place(white, length / 2, height + 0.18, length, 0.25, 2.45, 0.95);
        continue;
      }
      const mid = a.clone().lerp(b, 0.5).addScaledVector(outward, 4);
      const inboard = a.clone().lerp(b, 0.5).addScaledVector(outward, -4);
      const apronSide = distanceToPit(mid.x, -mid.z) < distanceToPit(inboard.x, -inboard.z);
      const shutterSide = isGarage && length > 20 && apronSide;
      if (shutterSide) {
        const count = Math.floor(length / 5.3), step = length / count;
        for (let j = 0; j < count; j++) {
          const at = step * (j + 0.5);
          place(dark, at, 1.77, step - 0.56, 3.54, 0.17, 0.09);
          place(door, at, 1.75, step - 0.78, 3.29, 0.09, 0.19);
          for (let y = 0.35; y < 3.35; y += 0.28) place(fascia, at, y, step - 0.84, 0.020, 0.018, 0.25);
        }
      } else if (!isGarage) {
        const count = Math.max(1, Math.round(length / 2.07)), step = length / count;
        const signWall = isPorsche && i >= 7 && i < 13;
        for (let j = 0; j < count; j++) {
          if (step >= 0.95) place(glass, (j + 0.5) * step, isPorsche ? 2.0 : 2.25, step * 0.72, 1.34, 0.08);
          if (isPorsche && !signWall) place(glass, (j + 0.5) * step, 5.5, step * 0.9, 3.45, 0.08);
          if (isPorsche) place(steel, j * step, 5.2, 0.045, 6.15, 0.048);
        }
        if (isPorsche) {
          for (const y of [3.6, 7.45]) place(steel, length / 2, y, length, 0.05, 0.08);
          if (i >= 7 && i < 24) {
            for (const y of [height + 0.49, height + 0.99]) place(steel, length / 2, y, length, 0.049, 0.049, -0.14);
            place(steel, length / 2, height + 0.50, 0.043, 1, 0.043, -0.14);
          }
        }
      } else {
        place(steel, length / 2, 0.34, length, 0.65, 0.11);
        place(steel, length / 2, height - 0.68, length, 0.085, 0.12);
        for (let j = 1; j < Math.ceil(length / 2.6); j++) {
          place(steel, j * 2.6, height / 2, 0.05, height - 1.41, 0.063);
        }
      }
    }
    const group = new THREE.Group();
    group.name = item.name;
    for (const [material, geos] of batch) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    scene.add(group);
  }
}
