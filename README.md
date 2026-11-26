# F1 赛道 3D 浏览器

**简体中文** · [English](README.en.md)

在浏览器中探索上海国际赛车场、新加坡滨海湾街道赛道、英国银石赛道和日本铃鹿赛道。可以查看场馆地标、看台分区和已收录的参考票价，并体验座位视角。

| 赛道 | 模型内容 | 在线体验 |
| --- | --- | --- |
| **上海国际赛车场** · 5.451 km · 16 弯 | 主看台和各分区、维修楼、围场、内场卡丁车场，以及周边道路与地铁。默认白天。 | [打开上海](https://shanghai-f1-circuit.pages.dev/?c=sh) |
| **新加坡滨海湾街道赛道** · 4.927 km · 19 弯 | 13 座可选座的看台、F1 维修楼和维修通道、城市道路与桥梁，以及滨海湾地标。默认夜晚。 | [打开新加坡](https://shanghai-f1-circuit.pages.dev/?c=sg) |
| **银石赛道** · 5.891 km · 18 弯 | 采用 2025 英国大奖赛布局，含 Landostand 等看台、Silverstone Wing、维修区、Stowe 内场和场内道路。默认白天。 | [打开银石](https://shanghai-f1-circuit.pages.dev/?c=gb) |
| **铃鹿赛道** · 5.807 km · 18 弯 | 以 2026 日本大奖赛为基准，包含 8 字交叉桥、春季樱花景观、摩天轮、维修区和可选座看台。默认白天。 | [打开铃鹿](https://shanghai-f1-circuit.pages.dev/?c=jp) |

## 浏览方式

- 从左上角的赛道菜单切换城市。切换时通过地球视角过渡。首次打开无参数的首页时显示上海，之后会记住当前浏览器上次查看的赛道。`?c=sh`、`?c=sg`、`?c=gb`、`?c=jp` 可直达对应赛道。
- 从小地图、弯号或地标定位。打开**看台与票价**可查看分区，选中座位后可切换到对应视角。票价采用项目收录的官方资料，座位编号由模型生成。
- 支持中英文界面、手机竖屏、昼夜切换和卫星底图。分享功能可以生成带二维码的当前视角海报，也可以复制赛道链接。

## 新加坡场景

- **夜景**分别调节赛道路面与维修通道的补光。滨海艺术中心、鱼尾狮和摩天轮有各自的夜间照明，滨水区域增加了局部水面反光。
- **路网与桥梁**按 OSM 共用端点恢复滨海桥、Sheares 高架匝道和 Jubilee 步行桥的连接，同一路幅衔接处统一标高与铺面。桥墩避让赛道与周边道路，桥下看台按模型净空布置。
- **看台**沿赛道曲线建模，设有阶梯过道、出入口和护栏。**维修区**包含车队车库、快车道、换胎位、维修墙指挥台和工作人员。
- **维修通道进出口**按主赛道路缘平滑分流和汇入。入口设虚实线，T1 前的出口设红白边和黄色隔离带。通道和主赛道的接缝共用路面纹理与夜间补光。

## 银石场景

- **看台**覆盖 2025 赛事场地图上的 28 个命名分区，共 18 个看台入口。点击 Landostand 等看台后可查看字母分区及座位。座位为模型示意，票价未收录。
- **维修区**包含 Silverstone Wing、41 个车库开间、快车道、换胎工位以及 10 支车队指挥台。
- **场内设施**包含 Stowe 内场、保时捷体验中心、Hilton 酒店及通行桥。

## 铃鹿场景

- **地标与樱花**。点击正门樱花道、S 弯樱花、铃鹿摩天轮或 8 字交叉桥可跳转到近景。迎宾广场、S‑PLAZA 和周边林地也布置了浅粉樱花。
- **看台与维修区**。从 19 个看台入口进入对应座区，例如进入 A 看台后选择 A1 或 A2。主直道旁的维修区包含车队车房、维修通道和围场。
- **入口动线**。正门与酒店门的步道在迎宾广场一带接合，经步行桥、摩天轮和 GP 广场通往主看台。

看台座号、出入口、铺面尺度、樱花树位、维修区设施和桥体细部为示意。[铃鹿数据来源与建模说明](tools/suzuka-sources.md)

## 本地运行

使用 Node.js 和 npm 在仓库根目录启动开发服务。

```bash
npm ci
npm run dev
```

打开终端给出的本地地址。用以下命令生成并预览生产构建。

```bash
npm run build
npm run preview
```

生产构建输出到 `dist/`，线上站点由 Cloudflare Pages 提供。新增赛道时，在 `src/circuits/` 添加场景档案，并在赛道注册表和启动页场馆列表登记。[赛道注册表](src/circuits/index.js) · [场馆列表](src/venues.js)

## 数据与模型精度

### 上海国际赛车场

| 内容 | 依据与精度 |
| --- | --- |
| 赛道、维修通道、看台和场馆 | 赛道中心线及维修通道来自 OpenStreetMap。A、B、H、K、E 看台的主要尺寸来自 OSM 建筑轮廓。主看台翼形结构、H/K 顶棚、维修楼及围场建筑参考 OSM 三维部件。 |
| 看台、座位和票价 | 票区和票价参考久事体育的 2026 年中国大奖赛官方资料。模型座距 0.55 m、排距 0.85 m，按示意分区和过道排布。排号和座号为模型编号。 |
| 草地看台与缓冲区 | F/J 草地及场馆周边地物参考 OSM。C 草地的位置参考观赛资料，边界按卫星图近似描绘。砂石缓冲区宽度按弯道曲率估算。 |
| 维修楼与内场 | 维修楼轮廓来自 OSM，内部车库、楼层和阳台为示意，车库顺序参考 2025 年车队积分榜。内场卡丁车场、卫生间和配套设施的位置来自 OSM，宽度、立面和内部细节按场景建模。 |

### 新加坡滨海湾街道赛道

| 内容 | 依据与精度 |
| --- | --- |
| 赛道走向与弯号 | 中心线采用 [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) 的 `sg-2008.geojson`，对应 2023 年起的 19 弯布局。弯号位置结合官方弯序和曲率估算。赛道路宽、起终点线与发车格位置为示意。 |
| 看台位置与座位 | 依据新加坡大奖赛的看台资料和 Circuit Park Map。收录 Pit、Super Pit、Pit Exit、Turn 1、Turn 2、Raffles、Republic、Stamford、Padang、Empress、Connaught、Bayfront 和 Marina Bay。尺寸、出入口和座位编号为模型示意。 |
| 票价 | 收录自页面标题为 2027 年赛事的官方成人三日票标价，币种为新加坡元，含 9% GST。票价与库存以官方售票渠道为准。 |
| 维修楼与维修通道 | 轮廓与进出场走向来自 OSM。车库和换胎位分配参考 [FIA 2026 维修通道图](https://www.fia.com/system/files/decision-document/2026_singapore_grand_prix_-_competition_notes_-_pit_lane_v2.pdf#page=2)，进出口标线和隔离带参考 [FIA 2025 现场照片](https://www.fia.com/system/files/decision-document/2025_singapore_grand_prix_-_race_directors_event_notes_.pdf#page=7)。车道尺寸、标线位置、指挥台和内部陈设为示意。 |
| 城市道路与桥梁 | 走向、道路共用端点、岸线和周边地物来自 OSM。高架坡度、标高、桥身和桥墩按场景简化。滨海桥的车道、步道和护栏单独建模。 |
| 地标与灯光 | 滨海艺术中心的音乐厅和剧院参考 OSM 轮廓及 [DP Architects](https://www.dpa.com.sg/projects/esplanade-theatres-on-the-bay/) 和 [MERO](https://www.mero.com.sg/project_references/esplanade-theatres-on-the-bay-green-mark-gold/) 的建筑资料。鱼尾狮、摩天轮、金沙空中花园和滨海湾花园结合地图与公开资料建模，造型细节与夜景照明为近似。 |

## 更新地图数据

仓库已包含地图输入与生成数据，本地启动可直接使用。可在 Bash 中运行以下命令刷新相应赛道的 OSM 数据。

```bash
# 上海
bash tools/fetch-osm.sh tools/osm-raw
node tools/gen-track.mjs
node tools/gen-osm.mjs

# 新加坡
bash tools/fetch-osm-sg.sh
bash tools/fetch-osm-sg-landmarks.sh
node tools/gen-sg.mjs
```

新加坡生成脚本输出 `src/circuits/sg/data.js` 与 `projection.json`，并刷新用于获取桥梁周边地物的查询范围。

银石使用 `tools/osm-raw-silverstone/` 中的原始地图数据。运行 `node tools/gen-silverstone.mjs` 和 `python -X utf8 tools/gen-silverstone-osm.py` 生成赛道与 OSM 场景数据。

铃鹿使用 `tools/osm-raw-suzuka/` 中的 OSM 和国土地理院高程快照。运行 `python -X utf8 tools/gen-suzuka.py` 可重建模型数据。

## 来源与许可

- 地图数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，按 ODbL 使用。新加坡和银石的中心线来自 bacinger/f1-circuits。[MIT 许可](public/third-party/f1-circuits-LICENSE.md)
- 铃鹿使用平面场地，保留 8 字交叉桥的局部引坡。重建时使用日本国土地理院的高程数据区分交叉桥的上下两段。 [国土地理院瓦片目录](https://maps.gsi.go.jp/development/ichiran.html) · [内容使用条款](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)
- 3D 渲染使用 [Three.js](https://threejs.org/)，开发和构建使用 Vite。启动页的地球轮廓来自 [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth，公有领域），卫星底图来自 Esri World Imagery。
- [地面纹理来源](public/tex/SOURCES.md) · [品牌素材来源](public/brand/SOURCES.md) · [品牌素材配置](public/brand/README.md)

© 2026 yet2meet，保留所有权利。项目源代码和模型的权利条款见 [LICENSE](LICENSE)，第三方内容适用各自的许可。

本项目为非官方爱好者作品。观赛信息仅供参考，票价、座位和入场安排以赛事组织方发布的信息为准。
