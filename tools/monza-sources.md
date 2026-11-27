# 蒙扎国家赛车场数据与验收

**版本** 2026 意大利大奖赛，9 月 4 至 6 日，正赛于 9 月 6 日当地时间 15:00 CEST 开始。场景为东向 X、北向 N 的米制平面投影，Three.js 采用 `z = −N`，地面基准为 0 m。日光按赛道坐标与正赛时刻估算，方位约 216.3°，高度约 45.7°。

## 资料与对象

| 对象 | 依据 | 项目中的精度 |
| --- | --- | --- |
| **现役赛道、第一减速弯、阿尔博雷托弯** | [FIA 2026 意大利大奖赛文件 6，赛道图 v2](https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf#page=2) · [场馆赛道说明](https://www.monzanet.it/en/circuit/) · [2024 改造说明](https://www.monzanet.it/en/the-future-of-f1-starts-from-monza/) | 顺时针，11 弯。OSM 共用节点闭环，使用汽车版第一减速弯。FIA 中心线 5,793 m，原始折线 5,794.27 m，渲染平面曲线约 5,794.29 m，相差约 1.29 m。分段宽度采用场馆公布的 10–12 m 范围。弯号锚点、发车线、计时线、路肩和护墙局部细节为示意。 |
| **1955 老高速环道及塞拉利奥下穿** | [场馆历史与结构说明](https://www.monzanet.it/en/the-flyover-of-monza/) · [桥梁及环道现场照片](https://commons.wikimedia.org/wiki/Category:Overpass_bridge_(Autodromo_Nazionale_Monza)) · OSM 跨层路段 | 老环道公布全长 4,250 m，弯道最大倾斜为 80% 坡比。模型保留两段弯道、东侧直线和与现役主直道重合的走向。老环跨越现役赛道定位于 OSM `34404729` 与 `1443867793`。混凝土面接缝、弯道斜截面、梁底、支撑和桥下开口按资料形态建模。横向宽度、板厚、净空和标高为示意。 |
| **看台与票区** | [2026 年 3 月票区图](https://www.monzanet.it/wp-content/uploads/2026/03/GP_F1_2026_LISTINO_PREZZI_3_2.pdf) · [2026 年 6 月票区图及覆盖情况](https://www.monzanet.it/wp-content/uploads/2026/06/GP_F1_2026_LISTINO_PREZZI_6_17.pdf) · [8A、8B 与 8 BIS 现场记录](https://oversteer48.com/monza-grandstand-8a-8b-8bis-prima-variante-esterna/) · [主直道阶梯台与大看台现场记录](https://oversteer48.com/monza-grandstand-gradinate-traguardo-2-3-27-28-29-30/) | OSM 台体轮廓与票区图侧别交叉核对。8A／8B 共用台体，上下排分区，8 BIS 独立。GT 的 2、3、27、28、29、30 分成六个低阶梯台。26A／B／C 有实体边界，分段位置估算。未测台体、出入口、支架和座席尺寸为示意。模型排座及视觉容量为场景数据。 |
| **观众入口和场内道路** | [2026 官方观众指南](https://www.monzanet.it/en/gp-spectator-information/) · [场馆入场及停车总图](https://www.monzanet.it/images/content/pages/docs/autodromo-monza-Dg0Bga1lGA9hkjO.pdf) · OSM 道路、隧道和共用节点 | 当年指南决定推荐门与票区关系，场馆总图辅助确认方向，OSM 决定可用走向与立交层级。检票门精确位置、台体侧接续、道路宽度与局部坡度为示意。 |
| **20 号看台旁步行桥** | [OSM 有顶桥面](https://www.openstreetmap.org/way/194458113) · [西侧楼梯](https://www.openstreetmap.org/way/1357168027) · [东侧楼梯](https://www.openstreetmap.org/way/1357168026) | 按共用节点接地面步道、30 级与 27 级金属楼梯及有顶桥面。栏杆、梁柱和绝对尺寸为示意。 |
| **维修道、维修楼和围场** | [FIA 2026 意大利大奖赛文件 6，维修道图](https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf#page=3) · [场馆维修楼历史](https://www.monzanet.it/en/history/) · [车房、维修道和领奖台现场说明](https://www.monzanet.it/en/monza-racetrack-circuit-experience/) | 维修道中心线、车房建筑、领奖台和围场使用 OSM 平面。比赛方向从 McLaren 工位经 Mercedes、Red Bull、Ferrari、Williams、Racing Bulls、Aston Martin、Haas、Audi、Alpine 到 Cadillac。车库开间基于场馆公布的 60 个车房与赛事工位顺序。具体门洞、设备尺度、标线位置和前场细部为示意。 |
| **景观** | OSM 草地、林地、停车与建筑边界 · [场馆改造与园区说明](https://www.monzanet.it/en/the-future-of-f1-starts-from-monza/) | 阿尔博雷托弯外侧空地使用中性底板，周边有林带与步道。树位、建筑立面、围场设备和夜景光线为示意。 |

## 票区及入口

场景包含 **26 个总览入口、49 个命名票区及 48 个模型台体**。票区以 6 月清单为准，分区名称保留意大利文。Circolare Prato 的若干观赛草地通过场地与步行动线表达。GF 的排座为观察视线用的模型计数。

| 合并入口 | 展开后对应的票区 |
| --- | --- |
| GT · Gradinate Traguardo | 2、3、27、28、29、30 |
| 6 · Alta Velocità | 6A、6B、6C |
| 8 · Prima Variante | 8A 上排、8B 下排、8 BIS |
| ASC · Ascari | 12、13、14、16 |
| 17 · Ascari Esterna | 17A、17B |
| 21 · Laterale Parabolica | 21A、21B、21C、21D、21E |
| 23 · Parabolica Interna | 23A、23B |
| 26 · Laterale Destra | 26A、26B、26C |
| 33 · Seconda Variante | 33A、33B |
| 35 · Vedano | 35A、35B、35C |

| 官方推荐门 | 官方指南列出的票区 |
| --- | --- |
| **A/B · Vedano** | 1、2、3、4、5、23、24、25、26、27–30、35A–C |
| **B · Santa Maria** | 1–8、12–14、16、26、27–30、32、Circolare Prato |
| **C · Costa Bassa** | 6、7、8、12–14、16、32、Circolare Prato |
| **D · Lesmo** | 6、9、10、10 BIS、11、12–14、16、18、32、33A–B、34、Circolare Prato |
| **G · Mirabello** | 9、10、10 BIS、11、12–14、16、17A–B、18、20–23、33A–B、GF、Circolare Prato |

## 重建

在仓库根目录运行 `python -X utf8 tools/gen-monza.py`。生成脚本读取 [OSM 快照](osm-raw-monza/venue.osm.gz) 和 [台体定位](../src/circuits/monza/stand-layout.json)，输出米制投影及场景数据。快照从 [场地主范围查询](https://api.openstreetmap.org/api/0.6/map?bbox=9.269,45.608,9.296,45.638) 与 [Lesmo 东侧补充范围](https://api.openstreetmap.org/api/0.6/map?bbox=9.2959,45.6278,9.2994,45.6322) 裁出。OSM 数据 © [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，遵循 ODbL。

道路以场馆节点、推荐门与看台接点为目的地筛选。生成数据包含 102 条 OSM 路段以及 50 条示意接续。同层车道与围场铺面先合并，步道从车道铺面裁去交叠部分。有 OSM 层级依据的桥面、隧道和引坡独立生成。

## 本地生产验收

| 项目 | 实测结果 |
| --- | --- |
| **俯视和重点弯组** | 生产预览走查全景、第一减速弯、阿尔博雷托弯及老环道，核对现役闭环、历史线路和两条路线的侧别。 |
| **塞拉利奥下穿** | 低位视角检查混凝土板底、支撑和下层沥青贯通。按下层路幅采样 63 个桥底交点，最小模型净空 **5.25 m**。实景绝对标高和净空待测。 |
| **20 号看台旁步行桥** | 从两端地面和赛道低位查看桥面与楼梯接点。以渲染网格采样 30 级和 27 级踏步，两端与各自地面步道同高，桥面下方的模型净空约 **5.46 m**。 |
| **全部看台** | 48 个台体逐一抓取斜侧图，检查底座、台阶、护栏和出入口。座位朝向按相邻赛道取样，GF 连续弧形台体进深为 **6 m**。11 号台按现场相邻关系避开 Serraglio 原建筑。[11 号台现场资料](https://oversteer48.com/monza-grandstand-11-serraglio/) |
| **22、34 和 13 号看台** | 用生产预览的俯视、斜侧画面和渲染网格复查。22 号按现有 OSM 台体轮廓收紧砂石缓冲区及防护网，34 号和 13 号（Ascari 4）调整示意台体。三处台体与砂石缓冲区的最小模型间距分别约 **1.3 m、3.5 m、6.9 m**。 |
| **1 号看台机位** | 桌面和竖屏分别进入看台概览和选座。用相机到目标的视线对照建筑轮廓及高度，两种机位均可直接看到台体和座席。 |
| **入口与道路** | 浏览器分别到达五处观众门。生成道路中心网络为一个连通分量，1,046 个节点、1,057 条边。54 个叶节点均落在推荐门、看台或草地接头及场景边缘。围场东侧服务路在穿过老环道后收口。Lesmo 门用局部下坡接入 OSM 隧道。通行接头尺寸和场内通行权以现场为准。 |
| **维修区三段** | 检查进场和出场的低位画面，两个维修道端面中心均进入现役沥青路幅，端面中心离赛道路缘约 6 m。快车道按模型保持 6.60 m。车库门槛与前场同为 0.163 m，以 Ferrari 车房低位检查车、人员和器材的放置。 |
| **界面** | Chrome 桌面查看中英文、昼夜、小地图、3D 看台及座位视角。浏览 26 个看台列表入口，逐个检查 33 个合并子区的跳转与返回。用画布选中 8A 座位并进入第一视角。390 × 844 竖屏触控打开 Costa Bassa 和 8B。复制分享链接并校验海报二维码。 |
| **启动和回归** | 清缓存限速验证只加载蒙扎场馆入口，场景就绪后依次预取铃鹿、银石、上海、新加坡。逐条菜单切换并返回蒙扎。模拟约 4 FPS 及铃鹿的后台预取失败，验证蒙扎镜头和昼夜能够收尾、银石可继续切入、无参记忆与蒙扎查询参数优先。 |

生产预览使用 `http://127.0.0.1:4173/?c=it`。手机验收使用 Chrome 触控和竖屏模拟。
