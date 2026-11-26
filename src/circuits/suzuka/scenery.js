import { V } from '../../util.js';
import { contains, indexPath } from './terrain.js';
import map from './map-data.json';

export const GROUND_COLOR = '#d3d6da';
export const VERGE_COLOR = '#83a86b';

// Projected from the two review annotations using the turn markers as anchors.
const outskirts = [
  [[-1108, -298], [-713, -252], [-598, -802], [-968, -845]],
  [[-508, -517], [355, -417], [393, -856], [-426, -951]],
];
const park = [[437, 312], [573, 415], [570, 649], [752, 734], [1049, 742],
  [1160, 484], [1052, 266], [868, 150], [678, 159], [481, 202]];
const hotelApproach = [[655, 630], [819, 895], [914, 1020], [1023, 987], [1034, 748], [874, 641]];
const entranceFacilities = new Set([
  308666548, 308666565, 308666577, 308691935, 308691944, 308691949,
  465595105, 465595138, 465595139, 465595141, 465595142, 465595143,
  465595144, 465595154, 465595156, 465616123, 466005760, 466005784, 466005785, 466435888, 1339015274, 1344669283,
]);
const entranceArea = [[572, 508], [724, 800], [1086, 806], [1149, 497], [882, 340], [640, 340], [620, 380]];
const southCourse = map.roads.find(road => road.id === 153525062);
const circuitAt = indexPath(map.track.map(p => V(...p)), true, 290);
const southAt = indexPath(southCourse.p.map(p => V(...p)), false, 95);
export const excluded = (x, n) => outskirts.some(p => contains(p, x, n));
const parkAt = (x, n) => contains(park, x, n);
const trackDistance = (x, n) => circuitAt(x, -n)?.d ?? Infinity;
const southDistance = (x, n) => southAt(x, -n)?.d ?? Infinity;
const infield = [[432, -31], [473, 152], [668, -52], [899, -335], [934, -493],
  [753, -396], [599, -245], [443, -166]];
const inVenue = (x, n) => parkAt(x, n) || contains(infield, x, n)
  || trackDistance(x, n) < 157 || southDistance(x, n) < 56;
const usable = (x, n) => !excluded(x, n) && inVenue(x, n);
const depot = /工場|倉庫|事業所|物流|製作所|生産|製作/;
const area = p => Math.abs(p.reduce((a, [x, n], i) => {
  const [u, v] = p[(i + 1) % p.length];
  return a + x * v - u * n;
}, 0)) / 2;
const center = p => p.reduce((q, [x, n]) => [q[0] + x / p.length, q[1] + n / p.length], [0, 0]);

export const buildings = map.buildings.filter(b => {
  const [x, n] = center(b.p);
  if (b.id === 184422099 || depot.test(b.name) || b.p.some(p => excluded(...p))) return false;
  if (entranceFacilities.has(b.id)) return true;
  if (contains(entranceArea, x, n)) return false;
  if (!usable(x, n) || b.kind === 'industrial' || b.kind === 'warehouse') return false;
  return Boolean(b.name) || area(b.p) >= (parkAt(x, n) ? 42 : 72);
});

const paddockEntrance = map.roads.find(road => road.id === 175233078);
const paddockConnector = {
  kind: 'service', w: paddockEntrance.w,
  // Close the gap between the approach and the mapped apron loop (469451657).
  p: [paddockEntrance.p[0], [768.77, -178.62]],
};
const motorsportRoads = new Set([153525062, 411295350]);
// The gate approach and the service road link both carriageways to the venue.
const parkRoads = new Set([34096665, 34096666, 72874298, 73144616, 922298549, 175235091]);
const parkingRoads = new Set([73144616, 465595101, 465595102, 465595103, 465595104, 465595111,
  465595223, 465595225, 465595126, 175229519, 175238361, 465616127, 465616136, 465595129, 'parking-gate']);
// The two mapped approaches stop at the canopy edges. The parking gate has an open carriageway.
const parkingGateLane = { id: 'parking-gate', kind: 'service', w: 5.4,
  p: [[966.2, 967.62], [969.4, 957.4], [972.74, 948.72]] };
export const parkingLink = road => parkingRoads.has(road.id);
export const showRoad = (x, n, road) => usable(x, n)
  || (parkingLink(road) && contains(hotelApproach, x, n))
  || (parkRoads.has(road.id) && !excluded(x, n) && x > 360 && x < 1250 && n < 655);
export const roads = [...map.roads.filter(road => (road.kind !== 'raceway' || motorsportRoads.has(road.id))
  && road.p.some(([x, n]) => showRoad(x, n, road))), paddockConnector, parkingGateLane];
export const areas = map.areas.filter(a => {
  const [x, n] = center(a.p);
  if (a.kind === 'parking' && [465595094, 465616125].includes(a.id)) return true;
  return usable(x, n) && a.p.every(p => !excluded(...p))
    && ['grass', 'parking', 'paved', 'water'].includes(a.kind)
    && a.p.filter(p => usable(...p)).length >= a.p.length * 0.8;
});

export const forestAt = (x, n) => !excluded(x, n)
  && ((trackDistance(x, n) < 92 && n > -490) || parkAt(x, n));

// Gate and S-PLAZA: Suzuka City Tourism Association. Esses: photos from
// inside the first S bend in Car Watch's 2026 GP report. Tree spacing is illustrative.
export const blossomAreas = [
  { id: 'avenue', name: '正门樱花道', nameEn: 'Main Gate cherry blossoms', seed: 290326,
    row: [[635, 474], [635, 513], [627, 557], [642, 591], [650, 621]], offsets: [-24, -16, -7.4, 7.4, 16, 24],
    at: [632, 516], view: [-4.5, -2.3, -38], labelOffset: -23 },
  { id: 's-plaza', seed: 250327,
    row: [[811, 516], [833, 529], [854, 543], [881, 550], [899, 543], [924, 532]],
    offsets: [-21, -13, -5.4, 4.6, 11.7, 20, 28] },
  { id: 'esses', name: 'S 弯樱花', nameEn: 'Esses cherry blossoms', seed: 590013,
    row: [[635, -422], [671, -437], [706, -463], [739, -502], [783, -539], [812, -577]],
    offsets: [-20, -12, -5.1, 1, 8.4, 16, 24],
    at: [721, -478], view: [99, 16, -79], labelOffset: -21 },
];
