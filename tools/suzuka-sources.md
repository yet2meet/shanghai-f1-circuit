# 铃鹿赛道资料与建模基准

模型基准为 **2026 日本大奖赛**（3 月 27–29 日），白天按正赛发车时刻 **3 月 29 日 14:00 JST** 估算太阳方位 **228.24°**、高度 **47.67°**。世界坐标用米制，原点为 **34.844°N，136.5325°E**，`+X` 朝东、`-Z` 朝北，`Y=0` 为模型的统一地面。原始高程快照以约海拔 16 米为基准。 [F1 赛事日程](https://www.formula1.com/en/latest/article/formula-1-aramco-japanese-grand-prix-2026.1IyYWpqFWscTlaykVZsJ1O)

| 对象 | 资料与做法 | 精度 |
| --- | --- | --- |
| **中心线** | OSM relation **284570** 按共用节点组接 40 条单向道路。按 FIA 2026 场图核对 T1–T18、顺时针比赛方向、S 弯、Degner、发夹、Spoon、130R 和末段减速弯。 | 投影闭合折线 5,806.52 米，FIA 5,807 米。弯号取映射路段近似位置。宽度来自 OSM 标注，缓冲区、护栏及部分路肩示意。 |
| **地面与交叉桥** | 场地、主赛道和服务道共用平面底图。按 OSM ways **175231434**（上层）和 **183391655**（下层）定层。桥面局部抬升 5.55 米，两端平顺落回地面。 | 桥厚、桥台、引坡、护栏和净空为模型尺度。 |
| **维修区** | OSM way **120917578**、维修楼 **184422099**。四轮赛车入口在 T18，出口汇入 T1 前。实体 48 开间来自场馆指南，车队顺序参考 FIA 2026 维修图。车房内的赛车、工作人员、监控屏和装备采用与上海相同的模型组件。 | 起跑和计时线的绝对位置、各车队的设备摆放、车房尺寸、快车道边界与指挥台为示意。围场服务道补齐入口与车库端部的场内接驳。 |
| **看台** | 19 个总览入口。A、B、Q、V 按共同前缀合并，分区名称和位置关系参考 2026 日本大奖赛官方票区图。B2-1 和 B2-2 共享连续台体，向 T1 延伸的 B2-3 有独立台体。D-1 至 D-4、E-1 与 E-2、V1-1 与 V1-2 各自共用台体。Q2 沿入弯侧为一条连续看台，出弯方向的 Q1 包含临时 Q1-2。 | 分区精确边界、排数、座号、标高、出入口和顶棚尺寸为示意。 [官方票区索引](https://www.suzukacircuit.jp/eng/f1/ticket/) · [B2 图](https://www.suzukacircuit.jp/eng/f1/ticket/seat_b2.html) · [D 区图](https://www.suzukacircuit.jp/f1/ticket/seat_d.html) · [Q2 图](https://www.suzukacircuit.jp/eng/f1/ticket/seat_q2.html) |
| **樱花** | 正门通道与酒店 S‑PLAZA 参考铃鹿市观光协会资料，首段 S 弯参考 2026 大奖赛现场摄影。迎宾广场及其他林地采用浅粉樱花景观。 | 树位、株数及花况为春季场景表达。 [观光协会赏樱资料](https://www.kanko.suzuka.mie.jp/flower/spring/387/) · [S 弯现场照片](https://car.watch.impress.co.jp/docs/news/2109537.html) |
| **摩天轮** | OSM **184107083** 定位和定向，官方高度约 50 米，官方照片用于复刻红色支架、双轮缘与轿厢。 | 轮径、支座尺寸和 40 个轿厢为示意。 |
| **观众入口** | 依据官方场内图串联正门、迎宾广场、跨园区道路步行桥、摩天轮、GP 广场与 V 区主看台外侧通道。正门雨棚、桥位和看台后侧步道分别使用 OSM 466005760、183393114、1374948775、184107079。 | 连续铺面、入口雨棚、标识、桥面标高与台阶为示意。 [铃鹿官方场图](https://www.suzukacircuit.jp/eng/map_s/) · [官方步行指南](https://www.suzukacircuit.jp/eng/motorsports_s/walk/) |
| **酒店与停车接驳** | 按酒店官方平面图和驾车指引，以停车门进场，沿 North 馆外侧车道抵达 THE MAIN 前台。酒店步行网接入 THE MAIN、THE SPA、西馆、北馆、餐厅和独立 Hotel Gate，进园后与正门迎宾广场接合。入场道路及酒店步道参考 OSM 465595223、175229519、465595129、465595153、465616143。 | 门厅和停车区进出支线的局部位置、铺面宽度为示意。 [酒店官方路线图](https://www.suzukacircuit.jp/eng/hotel/map/index.html) · [驾车到场指引](https://www.suzukacircuit.jp/eng/access_s/car/) |
| **周边交通与建筑** | 场馆范围内的 OSM 道路、建筑与池塘。道路区分车行道、服务道和步道，合并共用端点。池塘有独立水面和窄岸带。建筑按功能绘制窗、门和檐口。 | 地下通道和未纳入观众入口的高架待单独建模。部分建筑高度、立面、道路宽度和水位取估值。 |

赛事资料链接 [FIA 赛道和维修区图](https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_battery_containment_area_and_red_zone.pdf) · [FIA 赛道参数](https://www.fia.com/system/files/decision-document/2026_japanese_grand_prix_-_competition_visa_v2.pdf) · [铃鹿场馆指南](https://www.suzukacircuit.jp/eng/course_s/) · [铃鹿票区](https://www.suzukacircuit.jp/eng/f1/ticket/) · [铃鹿摩天轮](https://www.suzukacircuit.jp/eng/park/attraction/circuit-wheel/) · [铃鹿市观光协会樱花实景](https://www.kanko.suzuka.mie.jp/flower/spring/387/)

## 离线重建

```powershell
python -X utf8 tools/gen-suzuka.py
```

- **地图**是 `tools/osm-raw-suzuka/venue.osm.gz`。保留 OSM Map API 的 XML 原始响应，覆盖 136.517–136.551°E、34.836–34.853°N。OSM © 贡献者，采用 ODbL。 [下载端点](https://api.openstreetmap.org/api/0.6/map?bbox=136.517,34.836,136.551,34.853) · [OSM 版权与许可](https://www.openstreetmap.org/copyright)
- **高程**为同目录 DEM5A（z15）和 DEM10B（z14）文本瓦片的 gzip 快照。日本国土地理院高程快照用于重建源数据和识别交叉桥上下层。 [国土地理院瓦片目录](https://maps.gsi.go.jp/development/ichiran.html) · [内容使用条款](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)
- **生成输出**位于 `src/circuits/suzuka/`。原始采样值与投影参数同模型代码分开保存。模型材质与樱花图案由程序绘制，官方图和照片用于形状与位置核对。

## 本地验收

| 入口与机位 | 预期与实测 | 状态 |
| --- | --- | --- |
| **铃鹿 · 俯视与整圈几何** | 平面中心线约 5,808.22 米。1,600 个采样点中只有交叉桥及两端引坡的 57 个点有抬升。两端最大引坡坡度约 9.6%。 | 通过 |
| **铃鹿 · 交叉桥下和维修区** | 桥下 25 个射线采样点的最小模型净空约 4.63 米。维修通道入口、出口与主线相接，接合区路面高差约 2 毫米。沿 48 开间车库门槛抽样 944 处，均和前场铺面齐平。 | 通过 |
| **铃鹿 · 地面道路** | 检查实际渲染的 94 段道路。路端均接入其他路段、铺面或设施，闭合路线按连通性校核。Chrome 复查正门桥下车道、围场入口和南赛道周边，并用射线核对车道与维修区铺面的交接。 | 通过 |
| **铃鹿 · 正门至 GP 广场** | Chrome 从正门、跨街桥和主看台后侧核对进场动线。几何检查 1,356 处步道位置和 999 处桥面位置，确认主线和支路接合、跨街桥不断开、步道无建筑或比赛路幅冲突。 | 通过 |
| **铃鹿 · 停车门、酒店门** | 合并步道与广场铺面，沿实际车道边缘裁切。明确横穿的位置用过街标线连接，沿路并行的步道调整到车道侧面。复核酒店门、正门和 GP 广场接点、停车门到 THE MAIN 的车行路线、桥面和桥下车道。过街线位置和样式为模型示意。 | 通过 |
| **铃鹿 · 看台** | 几何检查 49 个实体台体，覆盖 19 个总览入口。弧形看台各段保持固定进深，后缘无折返。检查 87,718 个座位均在比赛路幅外。浏览器检查共用台体上的调焦点、官方分区按钮及中英文界面。 | 通过 |
| **铃鹿 · 樱花道、摩天轮、全景** | 核对正门、迎宾广场、S‑PLAZA 与 S 弯的种植范围。Chrome 近景确认阴影中的花瓣仍保持浅粉色。桌面核对中英文地标浮标，390×844 竖屏核对布局和标签。 | 通过 |
| **生产版 · 启动与交互** | 1280×820 Chrome 冷启动进入上海，切铃鹿、新加坡、银石后切回并重开，复核看台列表、昼夜、中英文、分享海报与链接。指定赛道覆盖浏览记录。铃鹿影像成功返回 77 张瓦片。模拟铃鹿模块加载失败，上海可启动，切换失败后恢复可交互状态。 | 通过 |
| **发布** | 当前交付为本地生产预览。 | 本地 |
