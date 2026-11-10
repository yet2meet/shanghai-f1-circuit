import * as THREE from 'three';

// 夜间“泛光照明”强度（0 = 白天，1 = 灯光全开），所有 floodlit 材质共享
export const night = { value: 0 };
// 夜间自发光的材质（窗户、灯带等）
export const nightEmissives = [];

export const V = (x, n, y = 0) => new THREE.Vector3(x, y, -n);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 让材质在夜间按自身颜色发光，模拟被球场灯照亮的效果 */
export function floodlit(mat, k = 1) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.uniforms.uGlowK = { value: k };
    s.fragmentShader =
      'uniform float uNight;\nuniform float uGlowK;\n' +
      s.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uNight * uGlowK;'
      );
  };
  mat.customProgramCacheKey = () => 'floodlit';
  return mat;
}

export function std(color, opts = {}, glow = 0) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
  return glow > 0 ? floodlit(m, glow) : m;
}

/** 夜间点亮的自发光材质 */
export function lampMat(color, emissive, max = 2, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 0, roughness: 0.3, metalness: 0.1, ...opts,
  });
  nightEmissives.push({ m, max });
  return m;
}

/** 将 (z, y) 剖面沿局部 X 方向拉伸成长条体，居中于 x = 0 */
export function extrudeProfile(pts, length) {
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  return g;
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** 由一串点生成路径：切线、左法线、累计里程 */
export function makePath(pts, closed = false) {
  const N = pts.length;
  const tan = [], nor = [], dist = [];
  let d = 0;
  for (let i = 0; i < N; i++) {
    const a = pts[closed ? (i - 1 + N) % N : Math.max(i - 1, 0)];
    const b = pts[closed ? (i + 1) % N : Math.min(i + 1, N - 1)];
    const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    tan.push(t);
    nor.push(new THREE.Vector3(t.z, 0, -t.x)); // 行进方向的左侧
    if (i > 0) d += pts[i].distanceTo(pts[i - 1]);
    dist.push(d);
  }
  const total = closed ? d + pts[N - 1].distanceTo(pts[0]) : d;
  return { pts, tan, nor, dist, total, closed, N };
}

const fn = (v) => (typeof v === 'function' ? v : () => v);

/** 沿路径的水平带状面（offA 在左，offB 在右，offA > offB） */
export function ribbon(path, { offA, offB, y = 0, uv = 10, from = 0, to = null }) {
  const N = path.N;
  const last = to ?? (path.closed ? N : N - 1);
  const fa = fn(offA), fb = fn(offB);
  const pos = [], uvs = [], idx = [], nrm = [];
  for (let k = from; k <= last; k++) {
    const i = k % N;
    const p = path.pts[i], n = path.nor[i];
    const a = fa(i), b = fb(i);
    pos.push(p.x + n.x * a, y, p.z + n.z * a, p.x + n.x * b, y, p.z + n.z * b);
    nrm.push(0, 1, 0, 0, 1, 0);
    const u = (k < N ? path.dist[i] : path.total + path.dist[i]) / uv;
    uvs.push(u, 0, u, 1);
    if (k > from) {
      const q = (k - from) * 2;
      idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** 沿路径的竖直墙面 */
export function wall(path, { off, h = 1.2, y = 0, from = 0, to = null, skip = null, uv = 10 }) {
  const N = path.N;
  const last = to ?? (path.closed ? N : N - 1);
  const fo = fn(off);
  const pos = [], uvs = [], idx = [];
  let q = 0, prev = false;
  for (let k = from; k <= last; k++) {
    const i = k % N;
    if (skip && skip(i)) { prev = false; continue; }
    const p = path.pts[i], n = path.nor[i], o = fo(i);
    const x = p.x + n.x * o, z = p.z + n.z * o;
    pos.push(x, y, z, x, y + h, z);
    const u = path.dist[i] / uv;
    uvs.push(u, 0, u, 1);
    if (prev) idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
    q += 2; prev = true;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function smooth(arr, r, closed = true) {
  const N = arr.length, out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0, c = 0;
    for (let j = -r; j <= r; j++) {
      let k = i + j;
      if (closed) k = (k + N) % N; else if (k < 0 || k >= N) continue;
      s += arr[k]; c++;
    }
    out[i] = s / c;
  }
  return out;
}

export const fmtPrice = (p) => '¥' + p.toLocaleString('zh-CN');
