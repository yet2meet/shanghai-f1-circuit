// 滨海艺术中心的两片自由曲面屋顶：三角玻璃和香槟色铝制遮阳折板。
// 屋面外沿来自 OSM；屋脊曲率、折板尺寸与排布按 DP Architects 及 MERO 的资料近似。
import * as THREE from 'three';
import { canvasTex, night, nightEmissives, rng, std } from '../../util.js';

const mix = THREE.MathUtils.lerp;
const midpoint = (a, b) => a.clone().lerp(b, 0.5);

/** 沿长轴切开测绘轮廓，取每道横截面的两条檐口。 */
function roofSections(building, frame, count) {
  const { cx, cn, ux, un, L } = frame;
  const perimeter = [];
  for (let i = 0; i < building.p.length; i += 2) {
    const x = building.p[i] - cx, n = building.p[i + 1] - cn;
    perimeter.push([x * ux + n * un, x * un - n * ux]);
  }
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const x = -(L / 2 - 0.025) * Math.cos(Math.PI * t);
    const hits = [];
    for (let j = 0; j < perimeter.length; j++) {
      const [ax, az] = perimeter[j];
      const [bx, bz] = perimeter[(j + 1) % perimeter.length];
      if ((ax <= x && x < bx) || (bx <= x && x < ax)) hits.push(mix(az, bz, (x - ax) / (bx - ax)));
    }
    return { t, x, near: Math.max(...hits), far: Math.min(...hits) };
  });
}

function roofGlassMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.2, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = 'attribute float paneLight;\nvarying vec2 vPane;\nvarying float vPaneLight;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n  vPane = uv; vPaneLight = paneLight;');
    shader.fragmentShader = 'uniform float uNight;\nvarying vec2 vPane;\nvarying float vPaneLight;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
        vec3 edges = vec3(vPane, 1.0 - vPane.x - vPane.y);
        vec3 beam = smoothstep(vec3(0.006), vec3(0.026) + fwidth(edges) * 0.45, edges);
        float glassArea = min(beam.x, min(beam.y, beam.z));
        diffuseColor.rgb *= mix(0.48, 1.0, glassArea);`).replace(
      '#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uNight * vPaneLight * mix(vec3(0.10, 0.045, 0.021), vec3(0.89, 0.49, 0.18), glassArea);`);
  };
  material.customProgramCacheKey = () => 'esplanade-glass';
  return material;
}

function meshFromTriangles(name, xyz, rgb, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildEsplanadeRoof(building, frame, root) {
  const concertHall = building.n === 'Esplanade Concert Hall';
  const group = new THREE.Group();
  group.name = concertHall ? 'esplanade-concert-hall' : 'esplanade-theatre';
  group.position.set(frame.cx, 0, -frame.cn);
  group.rotation.y = Math.atan2(frame.un, frame.ux);

  const lengthCells = Math.round(frame.L / 1.85), arcCells = Math.round(frame.W / 1.45);
  const height = building.h - 0.8;
  const eave = 7.05;
  const stations = roofSections(building, frame, lengthCells);
  const weights = stations.map(({ t }) => Math.pow(Math.sin(Math.PI * t), concertHall ? 0.79 : 0.70) * (1 + (concertHall ? 0.19 : -0.13) * (2 * t - 1)));
  const peak = Math.max(...weights);
  const rows = stations.map(({ t, x, near, far }, i) => Array.from({ length: arcCells + 1 }, (_, j) => {
    const skew = i % 2 && j > 0 && j < arcCells ? 0.34 : 0;
    const v = (j + skew) / arcCells;
    const arc = Math.sin(v * Math.PI);
    const w = (1 - Math.cos(v * Math.PI)) / 2;
    const span = near - far;
    const z = mix(near, far, w) + span * 0.055 * arc * (concertHall ? 1 : -1);
    const rim = eave + 1.2 * (t - 0.5) + 0.85 * Math.sin(Math.PI * t) * (2 * w - 1);
    const y = mix(rim, height, (weights[i] / peak) * Math.pow(arc, 0.87));
    return new THREE.Vector3(x, y, z);
  }));

  const paneXYZ = [], paneRGB = [], paneUV = [], paneLight = [];
  const shadeXYZ = [], shadeRGB = [];
  const random = rng(concertHall ? 401 : 729);
  const glass = new THREE.Color('#778b95'), silver = new THREE.Color('#c6b9a4');
  const color = new THREE.Color();
  function pane(a, b, c) {
    const y = (a.y + b.y + c.y) / 3;
    color.copy(glass).multiplyScalar(0.79 + random() * 0.37);
    const light = mix(0.75, 0.07, THREE.MathUtils.smoothstep(y, 12, 33)) * (0.75 + random() * 0.35);
    for (const p of [a, b, c]) {
      paneXYZ.push(p.x, p.y, p.z);
      paneRGB.push(color.r, color.g, color.b);
      paneLight.push(light);
    }
    paneUV.push(0, 0, 1, 0, 0, 1);
  }
  function foldedShade(a, b, c, d) {
    const center = midpoint(a, c).lerp(midpoint(b, d), 0.5);
    const along = b.clone().sub(a), across = d.clone().sub(a);
    const normal = along.clone().cross(across);
    const area = normal.length();
    // 尖端和檐口的过渡单元保持玻璃，折板不越过屋面边界。
    if (center.y < 10.6 || area < 0.39 || Math.min(along.length(), across.length()) < 0.63) return;
    normal.divideScalar(area);
    if (normal.y < 0) normal.negate();
    const root = midpoint(a, b).lerp(center, 0.10).addScaledVector(normal, 0.06);
    const left = a.clone().lerp(d, 0.57).lerp(center, 0.10).addScaledVector(normal, 0.05);
    const right = b.clone().lerp(c, 0.57).lerp(center, 0.10).addScaledVector(normal, 0.05);
    const tip = midpoint(d, c).lerp(center, 0.16).addScaledVector(normal, Math.min(1.04, 0.44 * Math.sqrt(area)));
    color.copy(silver).multiplyScalar(0.91 + random() * 0.15);
    for (const p of [root, left, tip, root, tip, right]) {
      shadeXYZ.push(p.x, p.y, p.z);
      shadeRGB.push(color.r, color.g, color.b);
    }
  }

  for (let i = 0; i < lengthCells; i++) for (let j = 0; j < arcCells; j++) {
    const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
    if (i % 2) { pane(a, b, d); pane(b, c, d); }
    else { pane(a, b, c); pane(a, c, d); }
    foldedShade(a, b, c, d);
  }
  // 檐口下逐段落到地面，露出基座的部分用深灰色裙墙收口。
  const skirtXYZ = [], skirtRGB = [];
  const wallColor = new THREE.Color('#7c8180');
  const edge = rows.map((row) => row[0])
    .concat(rows.at(-1).slice(1), rows.slice(0, -1).reverse().map((row) => row.at(-1)), rows[0].slice(1, -1).reverse());
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    const bottomA = a.clone().setY(building.m), bottomB = b.clone().setY(building.m);
    for (const p of [a, bottomA, b, b, bottomA, bottomB]) {
      skirtXYZ.push(p.x, p.y, p.z);
      skirtRGB.push(wallColor.r, wallColor.g, wallColor.b);
    }
  }
  const skirt = meshFromTriangles('esplanade-eaves', skirtXYZ, skirtRGB, std('#ffffff', { vertexColors: true, side: THREE.DoubleSide }, 0.23));
  const panes = meshFromTriangles('esplanade-glass', paneXYZ, paneRGB, roofGlassMaterial());
  panes.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(paneUV, 2));
  panes.geometry.setAttribute('paneLight', new THREE.Float32BufferAttribute(paneLight, 1));
  const shades = meshFromTriangles('esplanade-sunshades', shadeXYZ, shadeRGB, std('#ffffff', { vertexColors: true, side: THREE.DoubleSide, metalness: 0.22, roughness: 0.44 }, 0.20));
  group.add(skirt, panes, shades);
  root.add(group);
}

/** 低层前厅：横向石材梁之间的连续玻璃幕墙，沿原建筑外沿展开。 */
export function esplanadeFacade() {
  const rows = [[26, 72], [118, 92]];
  const facade = (lit) => canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = lit ? '#000000' : '#aea9a0';
    c.fillRect(0, 0, w, h);
    if (!lit) {
      c.fillStyle = '#848382'; c.fillRect(0, h - 22, w, 22);
      c.fillStyle = '#d2c7b3'; c.fillRect(0, 18, w, 8); c.fillRect(0, 111, w, 7);
    }
    for (const [y, height] of rows) for (let i = 0; i < 6; i++) {
      const x = i * w / 6;
      c.fillStyle = lit ? (i === 1 || i === 4 ? '#9a714c' : '#ffd897') : (i % 3 === 0 ? '#5d7885' : '#79909a');
      c.fillRect(x + 1, y, w / 6 - 2, height);
      c.fillStyle = lit ? '#322319' : '#69767b';
      c.fillRect(x + 1, y + height * 0.68, w / 6 - 2, 2);
    }
  }, [1 / 12, 1 / 13]);
  const material = std('#ffffff', { map: facade(false), roughness: 0.53, emissive: '#ffffff', emissiveMap: facade(true), emissiveIntensity: 0 }, 0.14);
  nightEmissives.push({ m: material, max: 0.68 });
  return material;
}
