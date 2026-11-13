// 座位的共用部分（各赛道的看台共用）：几何、实例矩阵、世界坐标、朝向、颜色
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROW_D = 0.85;   // 排距（米）
export const PITCH = 0.55;   // 座距（米）
export const SELECTED_COLOR = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);

export function seatGeometry() {
  const pan = new THREE.BoxGeometry(0.47, 0.07, 0.42); pan.translate(0, 0.44, -0.02);
  const back = new THREE.BoxGeometry(0.47, 0.42, 0.06); back.translate(0, 0.68, 0.2);
  return mergeGeometries([pan, back]); // 24 个三角形；座位数量大，几何尽量精简
}

/** 座位实例矩阵（高亮/选中时放大、抬高） */
export function seatMatrix(s, i, scale, lift, out) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, s.rot[i]);
  return out.compose(new THREE.Vector3(s.base[i * 3], s.base[i * 3 + 1] + lift, s.base[i * 3 + 2]), q, new THREE.Vector3(scale, scale, scale));
}
export const seatWorld = (s, i) => new THREE.Vector3(s.base[i * 3], s.base[i * 3 + 1], s.base[i * 3 + 2]);
export const seatFacing = (s, i) => (s.parts[s.seats[i].part].pick.arc ? new THREE.Vector3(-Math.sin(s.rot[i]), 0, -Math.cos(s.rot[i])) : s.parts[s.seats[i].part].f);

/** 座位颜色 = 官方票区颜色（带一点随机明暗，避免看起来像一整块色板） */
export function seatColor(spec, s, out = new THREE.Color()) {
  return out.set(spec.zones[s.zone].color).offsetHSL(0, 0, (s.j - 0.5) * 0.06);
}

