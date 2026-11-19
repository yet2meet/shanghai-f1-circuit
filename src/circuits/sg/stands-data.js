// 新加坡大奖赛看台：名称、所在弯道、入口、票价全部取自新加坡大奖赛官网各看台页面
// （singaporegp.sg/tickets/general-tickets/grandstands/<看台名>/，2026-10 的页面内容）。
//
// 能确认的：每个看台“位于哪个弯道 / 哪两个弯道之间”，个别看台写明了行驶方向的哪一侧（Raffles 左、Republic 右、Padang 左），
//   Super Pit 在 Pit 看台的上层、正对车库（车库在行驶方向左侧 → 看台在右侧）。
// 官方 Circuit Park Map（singaporegp.sg/event-info/circuit-park-map，不按比例绘制）上各看台红色标记所在的路段与一侧，补足了没写方向的看台：
//   Pit 与 Super Pit 在起终点直道东侧（右）；Pit Exit 在直道北端、维修通道出口一侧（左）；Turn 1、Turn 2 在 1–2 号弯外侧（右）；
//   Stamford 在 Nicoll Highway 北侧（7→8 号弯，右）；Padang 在 St Andrew’s Road 南侧（左）；Empress 在 Fullerton Road 西侧（右）；
//   Connaught 在 Esplanade 桥通往 14 号弯的路段北侧（左）；Bayfront、Marina Bay 在 17、18 号弯外侧（右）。
// 官网没有公布的（因此是示意）：看台的具体范围、长度、进深、高度、座位数、有无顶棚。
//   3D 里按官网给的弯道位置放一座示意体量（阶梯状座席块），尺寸取常见临时看台量级，并在界面上注明“示意”。
// 没收录：Promenade（页面无法读取）、Chicane @ Turn 2（页面 404，官网列表里没有位置说明）。
//
// 价格：官网列表页当前显示的“三日票成人票”标价（新币，含 9% GST）。页面标题为“2027 Tickets”，
//   没有 2026 年赛事的价格，所以界面上注明“官网当前标价（页面为 2027 年赛事）”，不当作 2026 年票价。
//   官网上显示的“售罄 / 有限”状态随时变化，不收录。
const NOTE = '看台位置依据官网说明；模型尺寸、座席、楼梯和看台内部出入口均为示意，官方通行门号见上方。';
const NOTE_EN = 'Grandstand locations follow the official descriptions. Model dimensions, seating, stairs and internal entrances are schematic. See above for official access gates.';

/** 按价位分色（只用于区分，不是官方配色） */
const colorOf = (price) => (price >= 2000 ? '#d7262c' : price >= 1600 ? '#e9579a' : price >= 1200 ? '#f59e0b' : '#2e9e5b');

const mk = (id, code, name, nameEn, price, extra) => {
  const color = colorOf(price);
  return {
    id, code, name, nameEn, type: 'seats', color,
    zones: { g: { name: '三日票（成人）', nameEn: '3-day pass (adult)', color, price, day: null, note: '官网当前标价 · 页面为 2027 年赛事', noteEn: 'Current website price · page shows the 2027 event', tag: '官网标价', tagEn: 'Website price' } },
    ...extra,
  };
};

export const SG_STANDS = [
  mk('PT', 'PT', 'Pit 看台', 'Pit Grandstand', 1888, {
    turns: '起终点直道 · 19 号弯一带 · 正对车库', turnsEn: 'Pit straight · near Turn 19 · opposite the garages',
    gate: '1、2 号门', gateEn: 'Gates 1, 2', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `官网标注“位于 19 号弯”，沿起终点直道，可以直接看到车库内部。另有青少年票（三日票 S$888）。通行票区 Zone 1–4。${NOTE}`,
    descEn: `Listed as “located at Turn 19”, along the pit straight with direct views into the garages. A junior pass is also sold (3-day S$888). Access zones 1–4. ${NOTE_EN}`,
    at: { pitFace: 0.5 }, side: 'right', size: [200, 11, 7],
  }),
  mk('SP', 'SP', 'Super Pit 看台', 'Super Pit Grandstand', 2608, {
    turns: '起终点直道 · 维修区看台上层 · 正对车库', turnsEn: 'Pit straight · upper rows of the Pit Grandstand · opposite the garages',
    gate: '1、2 号门', gateEn: 'Gates 1, 2', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于起终点直道，在维修区看台的上层，正对各队车库。通行票区 Zone 1–4。${NOTE}`,
    descEn: `Along the pit straight, in the upper rows of the Pit Grandstand, directly opposite the team garages. Access zones 1–4. ${NOTE_EN}`,
    at: { pitFace: 0.5 }, side: 'right', size: [130, 7, 11], behind: 'PT',
  }),
  mk('PX', 'PX', 'Pit Exit 看台', 'Pit Exit Grandstand', 1698, {
    turns: '起终点直道 · 维修通道出口旁 · 看 1 号弯', turnsEn: 'Pit straight · beside the pit lane exit · views of Turn 1',
    gate: '2 号门', gateEn: 'Gate 2', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `沿起终点直道，在维修通道出口旁，视野正对 1 号弯。通行票区 Zone 1–4。${NOTE}`,
    descEn: `Along the pit straight beside the pit lane exit, with exceptional views of Turn 1. Access zones 1–4. ${NOTE_EN}`,
    at: { pit: 0.93 }, side: 'left', size: [36, 4, 4.6], // 贴近 1 号弯，留出步行桥与维修通道的净空
  }),
  mk('T1', 'T1', '1 号弯看台', 'Turn 1 Grandstand', 1798, {
    turns: '起终点直道尽头 · 1 号弯', turnsEn: 'End of the pit straight · Turn 1',
    gate: '1 号门', gateEn: 'Gate 1', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于起终点直道尽头的 1 号弯，官网称其为视野开阔的“抢手”看台。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turn 1, positioned at the end of the pit straight (“a commanding position”). Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 1 }, side: 'right', size: [70, 11, 8],
  }),
  mk('T2', 'T2', '2 号弯看台', 'Turn 2 Grandstand', 1798, {
    turns: '1、2 号弯 · 俯瞰 1–3 号弯与维修通道出口', turnsEn: 'Turns 1–2 · overlooking Turns 1–3 and the pit lane exit',
    gate: '1 号门', gateEn: 'Gate 1', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于 1、2 号弯，居高俯瞰 1 到 3 号弯与维修通道出口。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turns 1 and 2, an elevated spot overlooking Turns 1 to 3 and the pit lane exit. Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 2 }, side: 'right', size: [70, 11, 9],
  }),
  mk('RF', 'RF', 'Raffles 看台', 'Raffles Grandstand', 1268, {
    turns: '5 号弯 · Raffles Boulevard · 行驶方向左侧', turnsEn: 'Turn 5 · Raffles Boulevard · drivers’ left',
    gate: '2 号门', gateEn: 'Gate 2', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于 5 号弯，沿 Raffles Boulevard、行驶方向左侧，正对车手压入 5 号右弯。另含新加坡摩天轮的免费乘坐（先到先得）。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turn 5 along Raffles Boulevard on the drivers’ left, facing the sharp Turn 5 right-hander. Includes complimentary Singapore Flyer rides (first come, first served). Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 5 }, side: 'left', size: [46, 7, 8],
  }),
  mk('RP', 'RP', 'Republic 看台', 'Republic Grandstand', 1038, {
    turns: '5 号弯 · 行驶方向右侧', turnsEn: 'Turn 5 · drivers’ right',
    gate: '2 号门', gateEn: 'Gate 2', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于 5 号弯，行驶方向右侧，离 Promenade 地铁站和 2 号门步行很近。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turn 5 on the drivers’ right, a short walk from Promenade MRT station and Gate 2. Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 5 }, side: 'right', size: [70, 11, 8],
  }),
  mk('ST', 'ST', 'Stamford 看台', 'Stamford Grandstand', 638, {
    turns: '7、8 号弯之间', turnsEn: 'Between Turns 7 and 8',
    gate: '3B、4、5、6 号门', gateEn: 'Gates 3B, 4, 5, 6', access: 'Zone 4', accessEn: 'Zone 4',
    desc: `位于 7、8 号弯之间，视野里是灯火通明的城市天际线。通行票区仅 Zone 4。另有青少年票（三日票 S$438）。${NOTE}`,
    descEn: `Between Turns 7 and 8, framed by the illuminated city skyline. Access zone 4 only. A junior pass is also sold (3-day S$438). ${NOTE_EN}`,
    at: { between: [7, 8], t: 0.5 }, side: 'right', size: [90, 7, 8],
  }),
  mk('PD', 'PD', 'Padang 看台', 'Padang Grandstand', 768, {
    turns: '9、10 号弯之间 · 行驶方向左侧 · 靠近 Padang 球迷区', turnsEn: 'Between Turns 9 and 10 · drivers’ left · beside the Padang Fan Zone',
    gate: '3A、4、5、6、7 号门', gateEn: 'Gates 3A, 4, 5, 6, 7', access: 'Zone 4', accessEn: 'Zone 4',
    desc: `位于 9、10 号弯之间、行驶方向左侧，离 Padang 球迷区最近；车手从这里冲向 10 号弯（旧称 Singapore Sling）。通行票区仅 Zone 4。${NOTE}`,
    descEn: `Between Turns 9 and 10 on the drivers’ left, the grandstand closest to the Padang Fan Zone; cars charge towards Turn 10, formerly the Singapore Sling. Access zone 4 only. ${NOTE_EN}`,
    at: { between: [9, 10], t: 0.66 }, side: 'left', size: [138, 11, 8],
  }),
  mk('EM', 'EM', 'Empress 看台', 'Empress Grandstand', 768, {
    turns: '11、12 号弯之间 · 市政区 · Anderson Bridge', turnsEn: 'Between Turns 11 and 12 · Civic District · Anderson Bridge',
    gate: '4、5、6 号门', gateEn: 'Gates 4, 5, 6', access: 'Zone 4', accessEn: 'Zone 4',
    desc: `位于 11、12 号弯之间的市政区（Civic District），车手从 Anderson Bridge 的拱洞下驶过。通行票区仅 Zone 4。${NOTE}`,
    descEn: `Between Turns 11 and 12 in the historic Civic District, with cars sweeping under the arches of the Anderson Bridge. Access zone 4 only. ${NOTE_EN}`,
    at: { between: [11, 12], t: 0.9 }, side: 'right', size: [48, 11, 8], frontOffset: 17,
  }),
  mk('CN', 'CN', 'Connaught 看台', 'Connaught Grandstand', 768, {
    turns: '14 号弯 · 俯瞰 Esplanade 桥高速段', turnsEn: 'Turn 14 · overlooking the run across Esplanade Bridge',
    gate: '3A、4、5、6、7 号门', gateEn: 'Gates 3A, 4, 5, 6, 7', access: 'Zone 4', accessEn: 'Zone 4',
    desc: `位于 14 号弯，俯瞰车手高速驶过 Esplanade 桥并刹车入 14 号弯；附近的 Jubilee 桥也是观景点。通行票区仅 Zone 4。${NOTE}`,
    descEn: `At Turn 14, overlooking the high-speed run across the Esplanade Bridge and the braking zone for Turn 14; the nearby Jubilee Bridge also offers a setting. Access zone 4 only. ${NOTE_EN}`,
    at: { between: [13, 14], t: 0.88 }, side: 'left', size: [88, 11, 8],
  }),
  mk('BF', 'BF', 'Bayfront 看台', 'Bayfront Grandstand', 1488, {
    turns: '17 号弯 · 本杰明·海勒斯大桥下', turnsEn: 'Turn 17 · beneath the Benjamin Sheares Bridge',
    gate: '8 号门（也可经 1、2 号门）', gateEn: 'Gate 8 (or Gates 1, 2)', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于 17 号弯，在本杰明·海勒斯大桥（Benjamin Sheares Bridge）下方；车手过 16、17 号弯后，从看台和新加坡摩天轮前加速驶过。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turn 17 beneath the Benjamin Sheares Bridge; drivers negotiate Turns 16 and 17 before accelerating past the grandstand and the Singapore Flyer. Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 17 }, side: 'right', size: [34, 7, 4.6],
  }),
  mk('MB', 'MB', 'Marina Bay 看台', 'Marina Bay Grandstand', 1798, {
    turns: '18 号弯 · 最后两个弯', turnsEn: 'Turn 18 · the last two corners',
    gate: '8 号门', gateEn: 'Gate 8', access: 'Zone 1–4', accessEn: 'Zones 1–4',
    desc: `位于 18 号弯，可以看到车手冲出最后两个弯、驶上起终点直道。通行票区 Zone 1–4。${NOTE}`,
    descEn: `At Turn 18, where drivers tackle the last two corners before charging onto the pit straight. Access zones 1–4. ${NOTE_EN}`,
    at: { turn: 18 }, side: 'right', size: [70, 5, 8],
  }),
];

export const SG_STANDS_NOTE = 'Promenade 看台与 Chicane @ Turn 2 看台官网有售，但没有位置说明（页面无法读取 / 404），暂未收录。';
