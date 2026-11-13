#!/usr/bin/env bash
# 从 OpenStreetMap（Overpass API）拉取新加坡滨海湾赛道周边的地物，保存到 tools/osm-raw-sg/。
# 不取整个矩形范围（市中心建筑太密，查询会超时），而是围绕赛道中心线取一条带状区域：
#   bnear  赛道两侧 230 m 内的建筑与建筑部件      btall  远处高于 90 m 或 20 层以上的高楼（天际线）
#   rnear  赛道两侧 330 m 内的道路                 water  水域、公园、草地
#   venue  赛道两侧 400 m 内的休闲、剧院、桥梁等    race   OSM 中的 raceway（维修通道、起终点直道）
# 用法：bash tools/fetch-osm-sg.sh      之后：node tools/gen-sg.mjs
# 数据 © OpenStreetMap contributors，ODbL 许可。
set -u
cd "$(dirname "$0")/osm-raw-sg"
MIRRORS=(https://overpass.openstreetmap.fr/api/interpreter https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter https://overpass.kumi.systems/api/interpreter)
B='1.272,103.835,1.309,103.881'
POLY=$(node -e "
const g=JSON.parse(require('fs').readFileSync('centerline.geojson','utf8')).features[0].geometry.coordinates;
console.log(g.filter((_,i)=>i%2===0).map(([lo,la])=>la.toFixed(5)+','+lo.toFixed(5)).join(','))")

fetch() { # $1 名称  $2 查询
  for attempt in 1 2 3; do
    for url in "${MIRRORS[@]}"; do
      curl -s -m 90 -A "shanghai-f1-circuit-viewer/1.0 (hobby project)" --data-urlencode "data=$2" "$url" -o "$1.json.tmp"
      if node -e "JSON.parse(require('fs').readFileSync('$1.json.tmp','utf8'))" 2>/dev/null; then
        mv "$1.json.tmp" "$1.json"; echo "$1: $(stat -c %s "$1.json") bytes from $url"; return 0
      fi
    done
    sleep 5
  done
  echo "$1: FAILED"
}

[ -z "${SKIP_MAIN:-}" ] && fetch bnear  "[out:json][timeout:120];(way[building](around:230,$POLY);way[\"building:part\"](around:230,$POLY);relation[building](around:230,$POLY););out geom;" &
[ -z "${SKIP_MAIN:-}" ] && fetch btall  "[out:json][timeout:120];(way[building][height~\"^(9[0-9]|[1-9][0-9]{2})\"]($B);way[\"building:levels\"~\"^([2-9][0-9])\"]($B);way[\"building:part\"][height~\"^(9[0-9]|[1-9][0-9]{2})\"]($B););out geom;" &
[ -z "${SKIP_MAIN:-}" ] && fetch rnear  "[out:json][timeout:120];(way[highway](around:330,$POLY);way[railway](around:330,$POLY););out geom;" &
[ -z "${SKIP_MAIN:-}" ] && fetch water  "[out:json][timeout:120];(way[natural~\"water|bay|coastline|wetland\"]($B);relation[natural=water]($B);way[water]($B);relation[water]($B);way[waterway~\"river|canal|stream\"]($B);way[landuse~\"grass|recreation_ground|forest|meadow\"]($B);way[leisure~\"park|garden|pitch\"]($B);relation[leisure=park]($B);way[man_made~\"pier|bridge\"]($B););out geom;" &
[ -z "${SKIP_MAIN:-}" ] && fetch venue  "[out:json][timeout:120];(way[leisure](around:400,$POLY);way[amenity~\"^(grandstand|theatre|arts_centre|stadium)\$\"](around:400,$POLY);way[man_made](around:400,$POLY);way[tourism](around:400,$POLY);node[name~\"Grandstand|Pit |Podium|Paddock|Flyer\",i](around:500,$POLY);way[name~\"Grandstand|Pit |Podium|Paddock|Padang|Flyer\",i](around:500,$POLY););out geom;" &
[ -z "${SKIP_MAIN:-}" ] && fetch race   "[out:json][timeout:90];(way[highway=raceway](1.27,103.83,1.32,103.89);way[leisure=track](1.27,103.83,1.32,103.89););out geom;" &
wait

# 桥两端接壤的建筑与道路：先运行一遍 node tools/gen-sg.mjs 生成 bridge-bboxes.json（桥周边的范围），再取这些范围内的地物
#（只补取这一步：SKIP_MAIN=1 bash tools/fetch-osm-sg.sh）
if [ -f bridge-bboxes.json ]; then
  BQ=$(node ../bridge-queries.mjs b)
  RQ=$(node ../bridge-queries.mjs r)
  fetch bbridge "[out:json][timeout:150];($BQ);out geom;" &
  fetch rbridge "[out:json][timeout:150];($RQ);out geom;" &
  wait
fi
rm -f ./*.tmp
