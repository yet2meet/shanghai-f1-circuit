// 车库里的屏幕画面：一张 2 × 2 图集（每格 512 × 320），仿真实 F1 车库的四类界面，全部用 2D canvas 绘制。
//   0 遥测：速度 / 油门 / 刹车 / 档位 / 转速曲线，带读数
//   1 计时榜：名次、队色、车手代码、轮胎配方、圈速、差距、三段成绩色块
//   2 赛道图：上海真实线形 + 三个计时段着色 + 车位点 + 赛道状态与天气
//   3 车辆状态：四轮胎温、刹车温度、电池、燃油、DRS
// 画面内容均为示意数据。
import * as THREE from 'three';
import { canvasTex } from './util.js';

const CW = 512, CH = 320;
const FONT = '"SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
const PURPLE = '#c56bff', GREEN = '#5be37a', YELLOW = '#ffd84a', RED = '#ff5a6e', CYAN = '#3ad1ff', DIM = '#8fa3bd', INK = '#dbe6f5';

/** teams：[{ color }]（计时榜与车位点的队色）；trackPts：赛道中心线 [[x, n], …] */
export function screenAtlas(teams, trackPts) {
  return canvasTex(CW * 2, CH * 2, (c) => {
    const txt = (s, x, y, size = 11, col = INK, align = 'left', weight = 600) => {
      c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y);
    };
    const panel = (x, y, w, h) => {
      c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(120,160,210,0.28)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    // ── 小图标 ──
    const icon = {
      signal(x, y) { c.fillStyle = GREEN; for (let i = 0; i < 4; i++) c.fillRect(x + i * 4, y + 9 - i * 3, 3, 3 + i * 3); },
      battery(x, y, k, col = GREEN) { c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x, y, 26, 12); c.fillStyle = INK; c.fillRect(x + 27, y + 3.5, 2.5, 5); c.fillStyle = col; c.fillRect(x + 2, y + 2, 22 * k, 8); },
      thermo(x, y, col = '#ff8a3a') { c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 10); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(x, y + 12, 3.6, 0, 7); c.fill(); c.fillRect(x - 1, y + 5, 2, 6); },
      wind(x, y) { c.strokeStyle = '#8fc7ff'; c.lineWidth = 1.5; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x, y + i * 4); c.lineTo(x + 14 - i * 3, y + i * 4); c.stroke(); } },
      drop(x, y, col = CYAN) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - 6); c.quadraticCurveTo(x + 6, y + 2, x, y + 5); c.quadraticCurveTo(x - 6, y + 2, x, y - 6); c.fill(); },
      flag(x, y, col = GREEN) { c.fillStyle = INK; c.fillRect(x, y, 1.5, 14); c.fillStyle = col; c.fillRect(x + 1.5, y, 12, 8); },
      compound(x, y, ch, col) { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6.5, 0, 7); c.stroke(); txt(ch, x, y + 0.5, 8, col, 'center', 800); },
      gear(x, y) {
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 4, 0, 7); c.stroke();
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; c.beginPath(); c.moveTo(x + Math.cos(a) * 4.5, y + Math.sin(a) * 4.5); c.lineTo(x + Math.cos(a) * 6.5, y + Math.sin(a) * 6.5); c.stroke(); }
      },
    };
    const cell = (i, title, right, draw) => {
      c.save(); c.translate((i % 2) * CW, Math.floor(i / 2) * CH); c.beginPath(); c.rect(0, 0, CW, CH); c.clip();
      const g = c.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#0a1626'); g.addColorStop(1, '#060d18');
      c.fillStyle = g; c.fillRect(0, 0, CW, CH);
      c.fillStyle = '#12233b'; c.fillRect(0, 0, CW, 26); c.fillStyle = '#e10600'; c.fillRect(0, 0, 5, 26);
      txt(title, 14, 13.5, 13, '#ffffff', 'left', 800); txt(right, CW - 36, 13.5, 11, '#9fb4cf', 'right');
      icon.signal(CW - 28, 7);
      draw();
      c.restore();
    };
    const wave = (k, x) => Math.sin(x * 0.021 + k * 1.7) * 0.5 + Math.sin(x * 0.057 + k) * 0.3 + Math.sin(x * 0.11 + k * 3) * 0.2;

    // ── 0 遥测 ──
    cell(0, 'TELEMETRY · CAR DATA', 'LAP 14 / 56', () => {
      const rows = [['SPEED', 'km/h', CYAN, '312'], ['THROTTLE', '%', GREEN, '100'], ['BRAKE', 'bar', RED, '0'], ['GEAR', '', YELLOW, '8'], ['RPM', '', PURPLE, '11450']];
      rows.forEach(([name, unit, col, val], k) => {
        const y = 32 + k * 54;
        panel(8, y, 404, 50);
        c.strokeStyle = 'rgba(120,160,210,0.14)'; c.lineWidth = 1;
        for (let x = 48; x < 412; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 50); c.stroke(); }
        c.beginPath(); c.moveTo(8, y + 25); c.lineTo(412, y + 25); c.stroke();
        c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
        for (let x = 0; x <= 400; x += 3) {
          let v = wave(k, x);
          if (k === 1) v = v > -0.1 ? 0.85 : -0.85;
          else if (k === 2) v = wave(1, x) > -0.1 ? -0.85 : 0.5 + wave(4, x) * 0.3;
          else if (k === 3) v = Math.round(v * 4) / 4;
          const py = y + 25 - v * 19;
          if (x) c.lineTo(10 + x, py); else c.moveTo(10 + x, py);
        }
        c.stroke();
        txt(name, 14, y + 9, 9, col, 'left', 700);
        panel(418, y, 86, 50);
        txt(val, 498, y + 21, 20, '#ffffff', 'right', 800); txt(unit || name, 498, y + 40, 8, DIM, 'right');
      });
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(286, 32); c.lineTo(286, 298); c.stroke(); c.setLineDash([]);
      icon.gear(16, 310); txt('SECTOR 2 · T11 · DELTA −0.184', 30, 310, 9, DIM);
    });

    // ── 1 计时榜 ──
    cell(1, 'LIVE TIMING · PRACTICE 2', '38:12', () => {
      [['POS', 10, 'left'], ['DRIVER', 56, 'left'], ['TYRE', 152, 'center'], ['BEST LAP', 250, 'right'], ['GAP', 322, 'right'], ['S1', 356, 'center'], ['S2', 400, 'center'], ['S3', 444, 'center'], ['PIT', 500, 'right']]
        .forEach(([s, x, al]) => txt(s, x, 37, 9, DIM, al, 700));
      const codes = ['NOR', 'RUS', 'VER', 'LEC', 'SAI', 'LAW', 'ALO', 'OCO', 'HUL', 'GAS', 'BOT'];
      const comp = [['S', '#e8002d'], ['M', '#ffd400'], ['H', '#f2f2f2']];
      for (let r = 0; r < 11; r++) {
        const y = 46 + r * 24.6;
        c.fillStyle = r % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; c.fillRect(6, y, CW - 12, 22);
        txt(String(r + 1), 30, y + 11.5, 13, '#ffffff', 'right', 800);
        c.fillStyle = teams[r % teams.length].color; c.fillRect(42, y + 3, 5, 16);
        txt(codes[r], 56, y + 11.5, 13, '#ffffff', 'left', 800);
        icon.compound(152, y + 11, ...comp[(r * 2 + 1) % 3]);
        const ms = 32180 + r * 143 + ((r * 71) % 60);
        txt(`1:${String(Math.floor(ms / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`, 250, y + 11.5, 12, r === 0 ? PURPLE : '#e6eefb', 'right', 700);
        txt(r ? `+${((ms - 32180) / 1000).toFixed(3)}` : 'LEADER', 322, y + 11.5, 10, '#9fb4cf', 'right');
        [0, 1, 2].forEach((k) => { c.fillStyle = (r + k * 2) % 7 === 0 ? PURPLE : (r * 3 + k) % 3 ? GREEN : YELLOW; c.fillRect(338 + k * 44, y + 6, 36, 10); });
        txt(String(1 + ((r * 5) % 4)), 500, y + 11.5, 11, '#9fb4cf', 'right');
      }
    });

    // ── 2 赛道图 ──
    cell(2, 'TRACK MAP · SHANGHAI', '5.451 km', () => {
      let x0 = Infinity, x1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const [x, n] of trackPts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); n0 = Math.min(n0, n); n1 = Math.max(n1, n); }
      const k = Math.min(296 / (x1 - x0), 258 / (n1 - n0));
      const P = ([x, n]) => [22 + (296 - (x1 - x0) * k) / 2 + (x - x0) * k, 44 + (258 - (n1 - n0) * k) / 2 + (n1 - n) * k];   // n 朝上
      const N = trackPts.length;
      c.lineJoin = c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 9; c.beginPath();
      trackPts.forEach((p, i) => { const [x, y] = P(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
      c.closePath(); c.stroke();
      [RED, CYAN, YELLOW].forEach((col, s) => {          // 三个计时段
        const a = Math.floor((s * N) / 3), b = Math.floor(((s + 1) * N) / 3);
        c.strokeStyle = col; c.lineWidth = 3.5; c.beginPath();
        for (let i = a; i <= b; i++) { const [x, y] = P(trackPts[i % N]); if (i === a) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
      });
      const [sx, sy] = P(trackPts[0]); c.fillStyle = '#ffffff'; c.fillRect(sx - 7, sy - 1.5, 14, 3);   // 起终点线
      teams.forEach((t, i) => {                          // 车位点
        const [x, y] = P(trackPts[Math.floor(((i * 0.083 + 0.04) % 1) * N)]);
        c.fillStyle = '#0a1626'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
        c.fillStyle = t.color; c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill();
      });
      panel(336, 36, 168, 98); txt('TRACK STATUS', 346, 50, 9, DIM, 'left', 700);
      icon.flag(348, 62); txt('GREEN', 368, 70, 15, GREEN, 'left', 800);
      [RED, CYAN, YELLOW].forEach((col, s) => { c.fillStyle = col; c.fillRect(346 + s * 52, 92, 46, 6); txt('S' + (s + 1), 369 + s * 52, 112, 10, INK, 'center'); });
      panel(336, 142, 168, 162); txt('WEATHER', 346, 156, 9, DIM, 'left', 700);
      icon.thermo(354, 172); txt('AIR', 370, 180, 10, '#9fb4cf'); txt('21.4°C', 494, 180, 13, '#ffffff', 'right', 800);
      icon.thermo(354, 204, RED); txt('TRACK', 370, 212, 10, '#9fb4cf'); txt('33.8°C', 494, 212, 13, '#ffffff', 'right', 800);
      icon.wind(348, 240); txt('WIND', 370, 244, 10, '#9fb4cf'); txt('2.6 m/s', 494, 244, 13, '#ffffff', 'right', 800);
      icon.drop(354, 276); txt('RAIN', 370, 276, 10, '#9fb4cf'); txt('10 %', 494, 276, 13, '#ffffff', 'right', 800);
    });

    // ── 3 车辆状态 ──
    cell(3, 'CAR STATUS · TYRES', 'STINT 2', () => {
      // 俯视车身轮廓 + 前后翼
      c.strokeStyle = 'rgba(160,190,230,0.55)'; c.lineWidth = 2; c.beginPath();
      [[150, 50], [162, 96], [176, 150], [176, 236], [164, 284], [136, 284], [124, 236], [124, 150], [138, 96]].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath(); c.stroke();
      c.strokeRect(110, 42, 80, 8); c.strokeRect(118, 288, 64, 8);
      const temp = (t) => (t < 85 ? CYAN : t < 98 ? GREEN : t < 108 ? YELLOW : RED);
      [[58, 66, [96, 101, 104], 'FL'], [202, 66, [103, 100, 95], 'FR'], [58, 210, [99, 104, 110], 'RL'], [202, 210, [109, 103, 98], 'RR']].forEach(([x, y, ts, name]) => {
        ts.forEach((t, i) => { c.fillStyle = temp(t); c.fillRect(x + i * 14, y, 12, 62); });   // 内 / 中 / 外
        c.strokeStyle = INK; c.lineWidth = 1.5; c.strokeRect(x - 1.5, y - 1.5, 43, 65);
        const left = x < 150, tx = left ? x - 8 : x + 49, al = left ? 'right' : 'left';
        txt(name, tx, y + 10, 10, DIM, al, 700); txt(ts[1] + '°', tx, y + 30, 15, '#ffffff', al, 800); txt('21.' + (4 + (ts[0] % 5)) + ' psi', tx, y + 50, 9, '#9fb4cf', al);
      });
      panel(312, 36, 192, 268);
      txt('ERS', 322, 54, 9, DIM, 'left', 700); icon.battery(322, 66, 0.72); txt('72 %', 494, 72, 14, '#ffffff', 'right', 800);
      txt('FUEL', 322, 100, 9, DIM, 'left', 700); icon.drop(330, 118, YELLOW);
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(344, 113, 80, 10); c.fillStyle = YELLOW; c.fillRect(344, 113, 51, 10);
      txt('63.5 kg', 494, 118, 12, '#ffffff', 'right', 800);
      txt('BRAKES °C', 322, 146, 9, DIM, 'left', 700);
      [['FL', 612], ['FR', 598], ['RL', 441], ['RR', 452]].forEach(([n, v], i) => {
        const bx = 322 + (i % 2) * 92, by = 158 + Math.floor(i / 2) * 30;
        icon.thermo(bx + 5, by + 2, v > 550 ? RED : YELLOW); txt(n, bx + 16, by + 10, 9, '#9fb4cf'); txt(String(v), bx + 80, by + 10, 13, '#ffffff', 'right', 800);
      });
      txt('DRS', 322, 232, 9, DIM, 'left', 700); c.fillStyle = GREEN; c.fillRect(322, 242, 84, 20); txt('ENABLED', 364, 252.5, 10, '#06210f', 'center', 800);
      txt('MODE', 416, 232, 9, DIM, 'left', 700); c.strokeStyle = CYAN; c.lineWidth = 1.5; c.strokeRect(416.5, 242.5, 78, 19); txt('PUSH 6', 455, 252.5, 10, CYAN, 'center', 800);
      icon.gear(330, 284); txt('BAL 54.2 %  DIFF 7', 344, 284, 10, INK);
    });
  });
}

/** 屏幕平面：uv 指向图集的第 i 格 */
export function screenGeo(i, w = 0.88, h = 0.53) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  const u0 = (i % 2) * 0.5, v0 = i < 2 ? 0.5 : 0;   // 画布上方两格对应 v 的上半
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.5);
  return g;
}
