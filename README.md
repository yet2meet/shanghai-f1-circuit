# 上海国际赛车场 · 3D 看台浏览

在浏览器里探索上海国际赛车场（Shanghai International Circuit）的 3D 模型：赛道、看台、维修区、围场与周边环境，查看各看台位置与参考票价，放大到具体分区和座位，并切换到座位视角看赛道。支持白天 / 黑夜（夜间自动亮灯）和手机竖屏。

## 运行

```bash
npm install
npm run dev
```

## 精度说明

| 内容 | 来源 | 精度 |
| --- | --- | --- |
| 赛道中心线（5459 m，官方 5451 m）、维修通道 | OpenStreetMap | 测绘数据 |
| 看台 A / B / H / K / E 位置、长度、进深、高度 | OpenStreetMap 建筑轮廓 | 测绘数据 |
| 主看台顶棚、两端“翼”形结构、H/K 荷叶顶棚与立柱、维修楼、围场行宫 | OpenStreetMap 三维建筑部件（含高度） | 测绘数据 |
| 草地看台 F / J、道路与高架、水系、地铁 11 号线、停车场、绿地 | OpenStreetMap | 测绘数据 |
| 座位：间距 0.55 m、排距 0.85 m，每 28 座一条过道 | 按常规看台尺寸排布 | 示意（主看台约 2.6 万座；公开资料称主看台约 2.9 万座） |
| 票区（A铂金 / A上 / A下 / B / H/K / E / C/F/J）与票价 | 2026 官方票价表与座位图 | 官方；铂金区与发车点位置按官方示意图量取 |
| 排号、座号 | 模型内按位置计数 | 不是票面座号（官方未公布座位图细节） |
| 维修楼外形（长 322 m、进深 31 m、高 12 m） | OpenStreetMap | 测绘数据；车库、楼层、阳台等内部构造按 F1 维修楼常见形式建模 |
| 车库顺序（11 支车队，每队 3 间） | 2025 车队积分榜；冠军车队靠维修通道入口（formula1.com） | 规则推定，未找到上海站官方车库分配图 |
| 车队配色 | 各队常用代表色 | 近似值，非官方色值 |
| 住宅区内的楼房 | OSM 只有住宅区范围 | 按区域生成的示意体块 |
| 砂石缓冲区宽度 | OSM 未标注 | 按弯道曲率估算 |
| C 草地 | OSM 无轮廓，官方图仅标“6 号弯外侧” | 只标注位置，不建模 |

车队名称牌默认以文字显示。如有授权的车队标志，放进 `public/brand/` 并在 `manifest.json` 中登记即可自动替换，说明见 `public/brand/README.md`。

## 更新地图数据

```bash
bash tools/fetch-osm.sh tools/osm-raw   # 从 Overpass API 重新下载
node tools/gen-track.mjs                # 赛道投影基准
node tools/gen-osm.mjs                  # 生成 src/osm-data.js
```

## 数据来源与许可

- 地图数据 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者，按 ODbL 许可使用。
- 投影基准所用的赛道中心线来自 [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)（MIT）。
- 启动页地球轮廓来自 [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth，公有领域）。
- 3D 渲染：[three.js](https://threejs.org/)。

本项目为非官方的爱好者作品，与 Formula 1、FIA、上海国际赛车场及久事体育均无关联。
