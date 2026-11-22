import * as THREE from 'three';
import { ROW_D } from './seatkit.js';

const UP = new THREE.Vector3(0, 1, 0);
export const VOM_W = 2.8;

export function vomRows(count) {
  const set = new Set();
  if (count < 9) return set;
  const r0 = Math.round(count * 0.5);
  for (let r = r0; r < r0 + 3; r++) set.add(r);
  return set;
}

// 上海看台的三面混凝土护板、门洞正面与深色顶部。
export function addVomitory(ctx, origin, rotY, rows, ti, vom, rowDepth = ROW_D) {
  if (!vom.size) return;
  const rs = [...vom], ra = rows[ti.first + rs[0]], rb = rows[ti.first + rs[rs.length - 1]];
  const z0 = ra.z - rowDepth * 0.5, z1 = rb.z + rowDepth * 0.5, top = rb.y + 1.1;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
  const place = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(origin);
  const box = (w, h, d, lx, ly, lz) => ctx.vomBox.push(new THREE.Matrix4().compose(place(lx, ly, lz), q, new THREE.Vector3(w, h, d)));
  const yb = ra.y - 0.2;
  box(0.25, top - yb, z1 - z0, -VOM_W / 2, (top + yb) / 2, (z0 + z1) / 2);
  box(0.25, top - yb, z1 - z0, VOM_W / 2, (top + yb) / 2, (z0 + z1) / 2);
  box(VOM_W + 0.25, top - yb, 0.25, 0, (top + yb) / 2, z1);
  ctx.vomHole.push(new THREE.Matrix4().compose(place(0, (rb.y + 0.3 + yb) / 2, z0 + 0.05), q, new THREE.Vector3(VOM_W - 0.3, rb.y + 0.3 - yb, 1)));
  ctx.vomFloor.push(new THREE.Matrix4().compose(place(0, rb.y + 0.3, (z0 + z1) / 2), q, new THREE.Vector3(VOM_W - 0.3, 1, z1 - z0 - 0.3)));
}

export function buildVomitoryMeshes(ctx, wall, dark) {
  if (!ctx.vomBox.length) return [];
  const build = (name, geometry, material, matrices) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    mesh.name = name;
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  return [
    build('stand-entrance-walls', new THREE.BoxGeometry(1, 1, 1), wall, ctx.vomBox),
    build('stand-entrance-face', new THREE.PlaneGeometry(1, 1).rotateY(Math.PI), dark, ctx.vomHole),
    build('stand-entrance-top', new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), dark, ctx.vomFloor),
  ];
}
