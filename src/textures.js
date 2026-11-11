// 地面细节纹理：草地、砂石、沥青。
// 全部在加载时用 canvas 程序化生成（每张 256×256 灰度、可无缝平铺，总共约 1 MB 显存），不需要下载任何图片。
// 着色器按世界坐标 xz 采样（不依赖模型 UV），两种尺度叠加 + 一张低频“斑驳”纹理打散重复感；
// 纹理是以 50% 灰为中性的明暗细节，乘在材质原有颜色上，所以各处仍保持原来的配色。
import * as THREE from 'three';
import { rng } from './util.js';

const S = 256;

function make(draw, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const r = rng(seed);
  // 无缝平铺：每个元素在越界时再画一份到对侧
  // 只有贴近边缘的元素才在对侧补画（全部画 9 份会让生成时间变成约 9 倍）
  const wrap = (fn, x, y, rad) => {
    const xs = [0], ys = [0];
    if (x - rad < 0) xs.push(S); if (x + rad > S) xs.push(-S);
    if (y - rad < 0) ys.push(S); if (y + rad > S) ys.push(-S);
    for (const dx of xs) for (const dy of ys) {
      if (dx || dy) { g.save(); g.translate(dx, dy); fn(); g.restore(); } else fn();
    }
  };
  draw(g, r, wrap);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace; // 作为明暗系数使用，不做色彩空间转换
  return t;
}
const grey = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

let cache = null;
const SHARED = {};
export function groundTextures() {
  if (cache) return cache;
  // 草：大量短草叶（明暗交错）+ 少量深色土斑
  const grass = make((g, r, wrap) => {
    // 草丛团块（远看时仍能看出的明暗斑驳）
    for (let i = 0; i < 420; i++) {
      const x = r() * S, y = r() * S, rr = 3 + r() * 11, v = r() < 0.5 ? 70 + r() * 30 : 160 + r() * 40;
      wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, grey(v | 0, 0.55)); gr.addColorStop(1, grey(v | 0, 0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }, x, y, rr);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 4200; i++) {
      const x = r() * S, y = r() * S, len = 2 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.3, v = r() < 0.5 ? 50 + r() * 40 : 170 + r() * 60;
      wrap(() => { g.strokeStyle = grey(v | 0, 0.8); g.lineWidth = 0.7 + r() * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); }, x, y, len + 1);
    }
  }, 11);
  // 砂石：密集的圆润小石子，带亮面与阴影
  const gravel = make((g, r, wrap) => {
    g.fillStyle = grey(96); g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S, w = 1.2 + r() * 2.8, h = w * (0.6 + r() * 0.4), rot = r() * 3.14, v = 100 + r() * 90;
      wrap(() => {
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillStyle = grey(50, 0.5); g.beginPath(); g.ellipse(0.7, 0.9, w, h, 0, 0, 7); g.fill();       // 阴影
        g.fillStyle = grey(v | 0); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 7); g.fill();
        g.fillStyle = grey(Math.min(255, v + 45) | 0, 0.7); g.beginPath(); g.ellipse(-w * 0.3, -h * 0.35, w * 0.4, h * 0.3, 0, 0, 7); g.fill(); // 高光
        g.restore();
      }, x, y, w + 2);
    }
  }, 23);
  // 沥青：细密骨料颗粒 + 少量浅色石子 + 若干细裂缝 / 修补块
  const asphalt = make((g, r, wrap) => {
    for (let i = 0; i < 9000; i++) { const x = r() * S, y = r() * S, v = 60 + r() * 130; g.fillStyle = grey(v | 0, 0.45); g.fillRect(x, y, 1, 1); }
    for (let i = 0; i < 420; i++) { const x = r() * S, y = r() * S, s = 0.8 + r() * 1.4, v = 150 + r() * 70; wrap(() => { g.fillStyle = grey(v | 0, 0.7); g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }, x, y, s); }
    for (let i = 0; i < 4; i++) { const x = r() * S, y = r() * S, w = 20 + r() * 40, h = 12 + r() * 30, v = r() < 0.5 ? 108 : 146; wrap(() => { g.fillStyle = grey(v, 0.35); g.fillRect(x, y, w, h); }, x + w / 2, y + h / 2, Math.max(w, h)); }
    g.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      let x = r() * S, y = r() * S; const pts = [[x, y]];
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 14; y += 3 + r() * 8; pts.push([x, y]); }
      wrap(() => { g.strokeStyle = grey(40, 0.6); g.beginPath(); pts.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke(); }, pts[0][0], pts[0][1] + 40, 80);
    }
  }, 37);
  // 低频斑驳：打散大面积平铺的重复感
  const macro = make((g, r, wrap) => {
    for (let i = 0; i < 260; i++) { const x = r() * S, y = r() * S, rr = 10 + r() * 34, v = 80 + r() * 96; wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, grey(v | 0, 0.5)); gr.addColorStop(1, grey(v | 0, 0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }, x, y, rr); }
  }, 51);
  cache = { grass, gravel, asphalt, macro };
  // 所有地面材质共用同一个 uniform 对象：照片纹理加载完成后只需替换一次 value，全场同时生效
  for (const k of ['grass', 'gravel', 'asphalt']) SHARED[k] = { value: cache[k] };
  SHARED.macro = { value: macro };
  return cache;
}

// 各类地面的默认参数：tint = 斑驳处偏向的色调（草地偏黄、沥青偏灰白、砂石偏暖），bump = 起伏高度（米），stripe = 草坪修剪条纹强度
const PRESET = {
  grass: { tint: [1.12, 1.04, 0.62], tk: 0.35, bump: 0.05, stripe: 0.05 },
  gravel: { tint: [1.08, 0.98, 0.84], tk: 0.3, bump: 0.06, stripe: 0 },
  asphalt: { tint: [1.5, 1.5, 1.55], tk: 0.4, bump: 0.035, stripe: 0, gain: 2.2 }, // 深色路面上明暗差不显眼，细节强度放大
};

/**
 * 给材质加上世界坐标细节纹理（可与 floodlit 等已有 onBeforeCompile 叠加）。
 * kind: 'grass' | 'gravel' | 'asphalt'；size: 一张纹理覆盖的米数；k: 细节强度；mk: 斑驳强度
 * 三种尺度的明暗细节（近看颗粒、中距离团块、远看斑驳）+ 斑驳处的色调变化 + 凹凸光照（近处有受光起伏，远处淡出）
 */
export function groundDetail(mat, kind, { size = 4, k = 0.5, mk = 0.18 } = {}) {
  const T = groundTextures(), P = PRESET[kind];
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.() ?? '';
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    Object.assign(s.uniforms, {
      uDetail: SHARED[kind], uMacro: SHARED.macro, uDS: { value: 1 / size }, uDK: { value: k * (P.gain || 1) }, uMK: { value: mk },
      uTint: { value: new THREE.Vector3(...P.tint) }, uTK: { value: P.tk }, uBump: { value: P.bump }, uStripe: { value: P.stripe },
    });
    s.vertexShader = 'varying vec2 vGWP;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vGWP = (modelMatrix * vec4(transformed, 1.0)).xz;');
    s.fragmentShader = `varying vec2 vGWP;
uniform sampler2D uDetail; uniform sampler2D uMacro;
uniform float uDS; uniform float uDK; uniform float uMK; uniform vec3 uTint; uniform float uTK; uniform float uBump; uniform float uStripe;
float gdH = 0.5;
` + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 p = vGWP * uDS;
    float d1 = texture2D(uDetail, p).r;
    float d2 = texture2D(uDetail, p * 0.31 + vec2(0.41, 0.17)).r;
    float d3 = texture2D(uDetail, p * 0.083 + vec2(0.13, 0.67)).r;
    float m = texture2D(uMacro, vGWP * 0.011).r;
    float m2 = texture2D(uMacro, vGWP * 0.043 + vec2(0.3, 0.6)).r;
    float d = d1 * 0.45 + d2 * 0.33 + d3 * 0.22;
    gdH = d1 * 0.6 + d2 * 0.4;
    float shade = 1.0 + (d - 0.5) * 2.0 * uDK + (m - 0.5) * 2.0 * uMK + (m2 - 0.5) * uMK;
    // 草坪修剪条纹：约 7 m 宽的明暗相间带
    float st = sin(dot(vGWP, vec2(0.62, 0.78)) * 0.45);
    shade += uStripe * smoothstep(-0.25, 0.25, st) - uStripe * 0.5;
    diffuseColor.rgb *= clamp(shade, 0.0, 2.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTint, clamp((m * 0.6 + m2 * 0.4 - 0.42) * 3.0, 0.0, 1.0) * uTK);
  }`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // 由细节高度的屏幕空间导数扰动法线（与 three.js 的 bumpMap 同一算法），60 m 以外淡出
    float fade = uBump * (1.0 - smoothstep(15.0, 60.0, length(vViewPosition)));
    if (fade > 0.0) {
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
      vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
      float det = dot(sx, r1);
      vec2 dh = vec2(dFdx(gdH), dFdy(gdH)) * fade;
      normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
    }
  }`);
  };
  mat.customProgramCacheKey = () => prevKey + '|gd2-' + kind;
  return mat;
}

/**
 * 场景显示后在后台加载真实照片纹理（Poly Haven CC0，灰度明暗图，三张合计约 300 KB），
 * 加载完成后替换程序生成的纹理；加载失败或网络慢时继续使用程序纹理，不影响使用。
 */
export function loadPhotoTextures(renderer) {
  groundTextures();
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const k of ['grass', 'gravel', 'asphalt']) {
    loader.load(`./tex/${k}.jpg`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = aniso;
      const old = SHARED[k].value;
      SHARED[k].value = tex;
      old.dispose();
    }, undefined, () => { /* 保留程序纹理 */ });
  }
}

