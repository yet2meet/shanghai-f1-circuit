// 卫星影像底图（Esri World Imagery，WGS84 / Web 墨卡托瓦片）。
// 与赛道、建筑使用同一套经纬度 → 场景坐标换算（tools/projection.json），所以影像与模型一一对应。
// 只在用户打开开关时才下载（约 70 张 z17 瓦片，约 1–2 MB），拼成一张纹理贴在一块按瓦片角点投影的网格上。
import * as THREE from 'three';
import P from '../tools/projection.json';
import { OSM_VENUE } from './osm-data.js';

const D2R = Math.PI / 180;
const kx = D2R * P.R * Math.cos(P.LAT0 * D2R), ky = D2R * P.R;
/** 经纬度 → 场景 (x, n)，与 tools/proj.mjs 完全一致 */
function toScene(lon, lat) {
  const de = (lon - P.lon0) * kx - P.M[0], dn = (lat - P.LAT0) * ky - P.M[1];
  return [-500 + de * P.r[0] + dn * P.r[1], 25 + de * P.d[0] + dn * P.d[1]];
}
/** 场景 (x, n) → 经纬度（上式的逆） */
function toLonLat(x, n) {
  const a = x + 500, b = n - 25;
  const det = P.r[0] * P.d[1] - P.r[1] * P.d[0];
  const de = (a * P.d[1] - b * P.r[1]) / det, dn = (b * P.r[0] - a * P.d[0]) / det;
  return [(de + P.M[0]) / kx + P.lon0, (dn + P.M[1]) / ky + P.LAT0];
}
const tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat, z) => ((1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2) * 2 ** z;
const lonOf = (x, z) => (x / 2 ** z) * 360 - 180;
const latOf = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) / D2R;
const URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export const SAT_CREDIT = 'Esri, Maxar, Earthstar Geographics';

export function createSatellite(scene, { mobile = false } = {}) {
  let mesh = null, loading = null, on = false;
  const hidden = [];

  async function build(onProgress) {
    const z = mobile ? 16 : 17; // 手机用低一级（约 2.4 m/像素，四分之一流量）
    // 覆盖范围：赛车场红线外扩 150 m
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < OSM_VENUE.length; i += 2) {
      for (const [dx, dn] of [[-150, -150], [150, 150], [-150, 150], [150, -150]]) {
        const [lon, lat] = toLonLat(OSM_VENUE[i] + dx, OSM_VENUE[i + 1] + dn);
        x0 = Math.min(x0, tileX(lon, z)); x1 = Math.max(x1, tileX(lon, z));
        y0 = Math.min(y0, tileY(lat, z)); y1 = Math.max(y1, tileY(lat, z));
      }
    }
    const tx0 = Math.floor(x0), tx1 = Math.floor(x1), ty0 = Math.floor(y0), ty1 = Math.floor(y1);
    const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = nx * S; canvas.height = ny * S;
    const g = canvas.getContext('2d');
    g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, canvas.width, canvas.height);
    let done = 0;
    const total = nx * ny;
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(new Promise((res) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { g.drawImage(img, (tx - tx0) * S, (ty - ty0) * S); onProgress?.(++done / total); res(); };
        img.onerror = () => { onProgress?.(++done / total); res(); };
        img.src = URL(z, tx, ty);
      }));
    }
    await Promise.all(jobs);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // 网格：每张瓦片 4×4 小格，角点按经纬度投影到场景（墨卡托与场景坐标的细微非线性也一并处理）
    const sub = 4, gx = nx * sub, gy = ny * sub;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
      const tx = tx0 + i / sub, ty = ty0 + j / sub;
      const [x, n] = toScene(lonOf(tx, z), latOf(ty, z));
      pos.push(x, 0.03, -n);
      uv.push(i / gx, 1 - j / gy);
      if (i < gx && j < gy) {
        const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    // 影像本身已含光影，不再参与场景光照；夜间整体压暗
    const mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -9.5;
    mesh.name = 'satellite';
    mesh.visible = false;
    scene.add(mesh);
  }

  /** 平面地物（OSM 地块、道路、水面，赛道两侧的草坪与砂石）：开卫星图时隐藏，让影像露出来 */
  function flatLayers() {
    const out = [];
    scene.traverse((o) => {
      if (o === mesh || !o.isMesh || o.isInstancedMesh) return;
      const inOsm = (() => { let p = o.parent; while (p) { if (p.name === 'osm') return true; p = p.parent; } return false; })();
      const inTrack = (() => { let p = o.parent; while (p) { if (p.name === 'track') return true; p = p.parent; } return false; })();
      if (inOsm && o.renderOrder < 0) out.push(o);                       // OSM 平面地物
      else if (inTrack && o.renderOrder <= -1.4) out.push(o);            // 赛道两侧草坪、砂石缓冲区
    });
    return out;
  }

  return {
    get on() { return on; },
    async set(v, onProgress) {
      on = v;
      if (v && !mesh) { loading ||= build(onProgress); await loading; }
      if (!mesh) return;
      mesh.visible = on;
      if (on) { hidden.length = 0; for (const o of flatLayers()) if (o.visible) { o.visible = false; hidden.push(o); } }
      else { hidden.forEach((o) => { o.visible = true; }); hidden.length = 0; }
    },
    /** 昼夜：t = 0 白天 … 1 黑夜 */
    night(t) { if (mesh) mesh.material.color.setScalar(1 - 0.82 * t); },
  };
}
