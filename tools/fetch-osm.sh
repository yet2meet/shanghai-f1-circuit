#!/usr/bin/env bash
# 从 OpenStreetMap（Overpass API）拉取赛车场周边的真实地物，分类保存为 JSON。
# 用法：bash tools/fetch-osm.sh <输出目录>
# 数据 © OpenStreetMap contributors，ODbL 许可。
set -u
OUT="${1:-osm}"
mkdir -p "$OUT"
BBOX="31.322,121.198,31.356,121.245"
MIRRORS=(https://maps.mail.ru/osm/tools/overpass/api/interpreter https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter)

declare -A Q
Q[buildings]="way[building]($BBOX);relation[building]($BBOX);way[\"building:part\"]($BBOX);"
Q[roads]="way[highway]($BBOX);"
Q[landcover]="way[natural]($BBOX);relation[natural]($BBOX);way[water]($BBOX);way[waterway]($BBOX);relation[water]($BBOX);way[landuse]($BBOX);relation[landuse]($BBOX);"
Q[venue]="way[leisure]($BBOX);relation[leisure]($BBOX);way[amenity]($BBOX);way[barrier]($BBOX);way[man_made]($BBOX);way[railway]($BBOX);way[sport]($BBOX);way[\"area:highway\"]($BBOX);way[surface]($BBOX);"

for name in "${!Q[@]}"; do
  ok=0
  for attempt in 1 2 3; do
    for url in "${MIRRORS[@]}"; do
      curl -s -m 240 -A "shanghai-f1-circuit-viewer/1.0" \
        --data-urlencode "data=[out:json][timeout:180];(${Q[$name]});out geom;" "$url" -o "$OUT/$name.json.tmp"
      if node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$OUT/$name.json.tmp" 2>/dev/null; then
        mv "$OUT/$name.json.tmp" "$OUT/$name.json"; ok=1
        echo "$name: $(stat -c %s "$OUT/$name.json") bytes from $url"
        break 2
      fi
    done
    sleep $((attempt * 15))
  done
  [ $ok = 1 ] || echo "$name: FAILED"
done
rm -f "$OUT"/*.tmp
