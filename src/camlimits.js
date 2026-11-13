// 自由视角的边界与防穿模。
// 不对三角面做射线检测（低配设备扛不住），而是在加载时把场内实体烧成一张 2.5 m 精度的高度网格（约 1 MB）：
//   top  —— 从地面实心到此高度：建筑、维修楼；看台与草坡按坡面高度计入，所以镜头可以贴着座位、草坡“站”上去
//   band —— 悬空的构件：主看台顶棚、两端的“翼”、荷叶顶棚等（OSM 中带 min_height 的部件）
// 每帧只在镜头移动时查一下镜头周围的 3×3 个格子：碰到建筑就越过楼顶，碰到顶棚就停在顶棚下沿或上方。
const CELL = 2.5, Q = 4;          // 高度量化：0.25 m 一级，Uint8 最多 63.75 m
const EYE = 1.7;                  // 镜头离地面、看台坡面、草坡的最小高度（人眼）
const ROOF = 8;                   // 离建筑屋面、顶棚上沿的最小高度（太贴近只会看到一片屋面）

/** data：{ buildings, venue } —— 当前赛道的 OSM 建筑与场地红线（由赛道档案提供） */
export function buildCamLimits(stands, { buildings: OSM_BUILDINGS, venue: OSM_VENUE }) {
  // 场地范围：OSM 赛车场红线的外接矩形
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < OSM_VENUE.length; i += 2) {
    const x = OSM_VENUE[i], z = -OSM_VENUE[i + 1];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const box = { x0, x1, z0, z1 };
  const W = Math.ceil((x1 - x0) / CELL) + 1, H = Math.ceil((z1 - z0) / CELL) + 1;
  const top = new Uint8Array(W * H), bld = new Uint8Array(W * H), bMin = new Uint8Array(W * H), bMax = new Uint8Array(W * H);
  const q = (h) => Math.max(0, Math.min(255, Math.round(h * Q)));
  const raiseTop = (k, h, b = 0) => { if (top[k] < h) { top[k] = h; bld[k] = b; } };
  const addBand = (k, lo, hi) => {
    if (!bMax[k]) { bMin[k] = lo; bMax[k] = hi; } else { bMin[k] = Math.min(bMin[k], lo); bMax[k] = Math.max(bMax[k], hi); }
  };

  // 多边形（场景 x、OSM n 的扁平数组）逐格扫描
  const fillPoly = (p, fn) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); c = Math.max(c, p[i]); b = Math.min(b, -p[i + 1]); d = Math.max(d, -p[i + 1]); }
    const i0 = Math.max(0, Math.floor((a - x0) / CELL)), i1 = Math.min(W - 1, Math.floor((c - x0) / CELL));
    const j0 = Math.max(0, Math.floor((b - z0) / CELL)), j1 = Math.min(H - 1, Math.floor((d - z0) / CELL));
    const N = p.length / 2, xs = [];
    for (let j = j0; j <= j1; j++) {
      // 扫描线：求这一行与多边形各边的交点，成对填充
      const n = -(z0 + (j + 0.5) * CELL);
      xs.length = 0;
      for (let s = 0, t = N - 1; s < N; t = s++) {
        const ns = p[s * 2 + 1], nt = p[t * 2 + 1];
        if ((ns > n) !== (nt > n)) xs.push(p[s * 2] + ((p[t * 2] - p[s * 2]) * (n - ns)) / (nt - ns));
      }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a0 = Math.max(i0, Math.ceil((xs[k] - x0) / CELL - 0.5)), a1 = Math.min(i1, Math.floor((xs[k + 1] - x0) / CELL - 0.5));
        for (let i = a0; i <= a1; i++) fn(j * W + i);
      }
    }
  };
  for (const b of OSM_BUILDINGS) {
    if (b.m > 0.5) { const lo = q(b.m), hi = q(b.h); fillPoly(b.p, (k) => addBand(k, lo, hi)); }
    else { const hi = q(b.h); fillPoly(b.p, (k) => raiseTop(k, hi, 1)); }
  }
  // 看台：坡面（前沿低、后排高）；款待区 / 维修楼按实心盒子
  for (const s of stands) for (const part of s.parts || []) {
    const { front, f, L, D } = part, Hh = part.H || 0;
    if (!D || !Hh || part.noLimits) continue;
    const rx = -f.z, rz = f.x;  // 沿看台长度方向
    const flat = s.spec.type === 'club';
    const pad = 1.5, back = 6;  // 看台背后的立面楼梯、框架向外凸出约 5 m
    const cs = [[-L / 2 - pad, -pad], [L / 2 + pad, -pad], [L / 2 + pad, D + back], [-L / 2 - pad, D + back]].map(([u, d]) => [front.x + rx * u - f.x * d, front.z + rz * u - f.z * d]);
    const xs = cs.map((c) => c[0]), zs = cs.map((c) => c[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / CELL)), i1 = Math.min(W - 1, Math.floor((Math.max(...xs) - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - z0) / CELL)), j1 = Math.min(H - 1, Math.floor((Math.max(...zs) - z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * CELL - front.x, z = z0 + (j + 0.5) * CELL - front.z;
      const u = x * rx + z * rz, d = -(x * f.x + z * f.z);
      if (Math.abs(u) > L / 2 + pad || d < -pad || d > D + back) continue;
      raiseTop(j * W + i, q(flat ? Hh : Math.max(0.5, (Math.min(D, Math.max(0, d)) / D) * Hh)), flat ? 1 : 0);
    }
  }

  // 3×3 邻域取最大值：让镜头与墙面保持约一个格子（2.5 m）的距离，不会贴脸看到墙的截面
  const near = (x, z, fn) => {
    const i = Math.floor((x - x0) / CELL), j = Math.floor((z - z0) / CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < W && jj < H) fn(jj * W + ii);
    }
  };
  /** 镜头允许的最低高度：地面 / 坡面 + 人眼高度，建筑屋面 + 8 m */
  const minYAt = (x, z) => { let m = EYE; near(x, z, (k) => { const v = top[k] / Q + (bld[k] ? ROOF : EYE); if (v > m) m = v; }); return m; };
  /** 镜头所在位置的悬空构件（顶棚 / 翼）：返回 [下沿, 上沿]，没有则 null */
  const bandAt = (x, z) => {
    let lo = 255, hi = 0;
    near(x, z, (k) => { if (bMax[k]) { lo = Math.min(lo, bMin[k]); hi = Math.max(hi, bMax[k]); } });
    return hi ? [lo / Q, hi / Q] : null;
  };

  /**
   * 约束镜头：注视点限制在场地范围内；镜头不低于地面 / 坡面 + 1.7 m；镜头不进入建筑与顶棚。
   * 返回 true 表示改动了镜头。
   */
  function apply(camera, target, { collide = true } = {}) {
    let moved = false;
    const cx = Math.min(box.x1, Math.max(box.x0, target.x)), cz = Math.min(box.z1, Math.max(box.z0, target.z));
    if (cx !== target.x || cz !== target.z) {
      const dx = cx - target.x, dz = cz - target.z;   // 平移整个视角，而不是让镜头绕着跳
      target.x += dx; target.z += dz; camera.position.x += dx; camera.position.z += dz; moved = true;
    }
    if (target.y < 0) { target.y = 0; moved = true; }
    if (target.y > 60) { target.y = 60; moved = true; }
    const p = camera.position;
    if (collide) {
      // 悬空构件：从下方靠近就停在它下沿以下，从上方靠近就停在它上面（不会钻进顶棚或“翼”里）
      const band = bandAt(p.x, p.z);
      if (band && p.y > band[0] - 1 && p.y < band[1] + ROOF) {
        p.y = p.y < (band[0] + band[1]) / 2 ? band[0] - 1 : band[1] + ROOF;
        moved = true;
      }
    }
    // 离地（含看台坡面、草坡、建筑屋面）不低于人眼高度：碰到楼就从楼顶越过，而不是穿进去
    const minY = collide ? minYAt(p.x, p.z) : EYE;
    if (p.y < minY) { p.y = minY; moved = true; }
    return moved;
  }
  return { apply, box, minYAt };
}
