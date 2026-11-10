// 经纬度 → 场景坐标 (x, n)，与 gen-track.mjs 完全一致
import { readFileSync } from 'node:fs';
const P = JSON.parse(readFileSync(new URL('./projection.json', import.meta.url), 'utf8'));
const D2R = Math.PI / 180;
const kx = D2R * P.R * Math.cos(P.LAT0 * D2R), ky = D2R * P.R;
export function toScene(lon, lat) {
  const de = (lon - P.lon0) * kx - P.M[0], dn = (lat - P.LAT0) * ky - P.M[1];
  return [-500 + de * P.r[0] + dn * P.r[1], 25 + de * P.d[0] + dn * P.d[1]];
}
