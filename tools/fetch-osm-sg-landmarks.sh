#!/usr/bin/env bash
# 取新加坡地标周边（滨海湾金沙、鱼尾狮公园，范围见 tools/landmark-zones.json）的 OSM 地物 → tools/osm-raw-sg/landmarks.json
# 这些地标离赛道较远，不在 fetch-osm-sg.sh 的“沿赛道一条带”里，单独取。
# 用法：bash tools/fetch-osm-sg-landmarks.sh      之后：node tools/gen-sg.mjs
# 数据 © OpenStreetMap contributors，ODbL 许可。
set -u
cd "$(dirname "$0")/osm-raw-sg"
MIRRORS=(https://overpass.openstreetmap.fr/api/interpreter https://overpass-api.de/api/interpreter https://overpass.private.coffee/api/interpreter https://overpass.kumi.systems/api/interpreter)
Q=$(node -e "
const z=JSON.parse(require('fs').readFileSync('../landmark-zones.json','utf8'));
const f=(a)=>z.map((k)=>a.replace(/AR/g,'(around:'+k.r+','+k.c[0]+','+k.c[1]+')')).join('');
console.log(f('way[building]AR;way[\"building:part\"]AR;relation[building]AR;way[highway]AR;way[leisure~\"park|garden|pitch\"]AR;way[landuse~\"grass|recreation_ground\"]AR;way[natural~\"water|bay\"]AR;relation[natural=water]AR;way[water]AR;way[waterway]AR;way[man_made]AR;node[tourism=artwork]AR;way[tourism]AR;node[name~\"Merlion|Helix|Supertree\",i]AR;way[name~\"Merlion|Helix|Marina Bay Sands|ArtScience|Supertree|Flower Dome|Cloud Forest\",i]AR;way[amenity=fountain]AR;'))")
for attempt in 1 2 3; do
  for url in "${MIRRORS[@]}"; do
    curl -s -m 120 -A "shanghai-f1-circuit-viewer/1.0 (hobby project)" --data-urlencode "data=[out:json][timeout:150];($Q);out geom;" "$url" -o landmarks.json.tmp
    if node -e "JSON.parse(require('fs').readFileSync('landmarks.json.tmp','utf8'))" 2>/dev/null; then
      mv landmarks.json.tmp landmarks.json; echo "landmarks: $(stat -c %s landmarks.json) bytes from $url"; exit 0
    fi
  done
  sleep 5
done
echo "landmarks: FAILED"
