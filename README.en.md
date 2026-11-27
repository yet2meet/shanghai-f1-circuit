# F1 Circuit 3D Viewer

[简体中文](README.md) · **English**

Explore Shanghai International Circuit, Marina Bay Street Circuit, Silverstone, Suzuka, and Autodromo Nazionale Monza in your browser. Find grandstands and available reference prices, look out from a modeled seat, and navigate using nearby landmarks.

| Circuit | What's modeled | Live viewer |
| --- | --- | --- |
| **Shanghai International Circuit** · 5.451 km · 16 turns | Grandstands and seating sections, the pit building, paddock, infield kart track, surrounding roads, and the metro line. Opens in daylight. | [Explore Shanghai](https://shanghai-f1-circuit.pages.dev/?c=sh) |
| **Marina Bay Street Circuit** · 4.927 km · 19 turns | 13 grandstands with selectable seats, the F1 Pit Building and pit lane, city roads and bridges, and Marina Bay landmarks. Opens at night. | [Explore Singapore](https://shanghai-f1-circuit.pages.dev/?c=sg) |
| **Silverstone Circuit** · 5.891 km · 18 turns | 2025 British Grand Prix layout, including Landostand, the Silverstone Wing, pit lane, the Stowe infield, and venue roads. Opens in daylight. | [Explore Silverstone](https://shanghai-f1-circuit.pages.dev/?c=gb) |
| **Suzuka Circuit** · 5.807 km · 18 turns | 2026 Japanese Grand Prix layout with the figure-eight crossover, spring cherry blossoms, Circuit Wheel, pit facilities, and selectable seats. Opens in daylight. | [Explore Suzuka](https://shanghai-f1-circuit.pages.dev/?c=jp) |
| **Autodromo Nazionale Monza** · 5.793 km · 11 turns | 2026 Italian Grand Prix layout with the first chicane, Curva Alboreto, historic banking, pit facilities, and selectable seats. Opens in daylight. | [Explore Monza](https://shanghai-f1-circuit.pages.dev/?c=it) |

## Using the viewer

- Switch cities from the circuit menu in the upper-left corner. The view transitions through the globe. The bare homepage opens Shanghai on a first visit and remembers your last circuit in the same browser. Links with `?c=sh`, `?c=sg`, `?c=gb`, `?c=jp`, or `?c=it` select a circuit directly.
- Find your bearings with the minimap, turn markers, and landmarks. Open the grandstand list to browse sections and available reference prices, then select a seat to see the circuit from there. The model generates seat numbers.
- Switch between English and Chinese or between day and night, and toggle the satellite basemap. The layout supports portrait phones. You can create a poster of the current view with a QR code or copy the circuit link.

## Singapore scene

- **Night lighting** adds separate fill to the racing surface and pit lane. The Esplanade, Merlion, and Singapore Flyer have individual lighting, with localized reflections along the waterfront.
- **Roads and bridges** include restored connections at Esplanade Bridge, the Sheares viaduct ramps, and Jubilee Bridge. Elevated roads join at shared OpenStreetMap endpoints. Connected decks use consistent elevations and surfacing at their joints. Piers avoid the circuit and neighboring roads, and grandstands below bridges follow the modeled clearance.
- **Grandstands and pit lane** include tiered aisles, entrances, and railings, as well as team garages, the fast lane, pit stop bays, pit-wall consoles, and crew.
- **Pit entry and exit** taper into the racing surface. The entry has a dashed line that becomes solid, and the exit has a yellow divider with red-and-white edges before Turn 1. Both junctions share the main track's asphalt texture and night lighting.

## Silverstone scene

- **Grandstands** cover 28 named sections from the 2025 event map, organized into 18 groups. Open Landostand or another group to browse its sections and modeled seats. Ticket prices are unavailable in the viewer.
- **Pit facilities** include the Silverstone Wing, 41 garage bays, the fast lane, pit stop bays, and consoles for ten teams.
- **Venue landmarks** include the Stowe infield, Porsche Experience Centre, the Hilton, and the venue's bridges.

## Suzuka scene

- **Landmarks and cherry blossoms.** Select the Main Gate cherry avenue, the first Esses blossoms, the Circuit Wheel, or the figure-eight crossover for a closer view. Pale pink blossoms also appear around Welcome Square, S‑PLAZA, and the surrounding wooded areas.
- **Grandstands and pit facilities.** Browse 19 grandstand groups and their seating sections, such as A1 and A2 within Grandstand A. The main straight is flanked by the pit lane, team garages, and paddock.
- **Entrance routes.** Walks from the Main Gate and Hotel Gate join near Welcome Square and continue over the footbridge, past the Circuit Wheel, and through GP Square to the main grandstand.

Seat numbers, entrances, pavement dimensions, tree locations, pit facilities, and bridge details are illustrative. [Suzuka sources and modeling notes](tools/suzuka-sources.md)

## Monza scene

- **Race circuit and historic oval.** Select Serraglio underpass to see the historic oval's concrete bridge from the modern track.
- **Spectator gates and grandstands.** The 2026 spectator guide identifies five recommended spectator entrances at Vedano, Santa Maria, Costa Bassa, Lesmo, and Mirabello. Open one grandstand group to find its sections and modeled seats.
- **Pits.** Eleven teams follow the FIA pit drawing. The model includes the fast lane, the pit wall, pit stop markings, and furnished garages.

Bridge clearances, unmeasured stand boundaries, walkway connections, garage details and individual seats are illustrative. [Monza sources and modeling notes](tools/monza-sources.md)

## Run locally

Use Node.js and npm to start the development server from the repository root.

```bash
npm ci
npm run dev
```

Open the local address printed in the terminal. Use the following commands to build and preview the production site.

```bash
npm run build
npm run preview
```

The production build goes into `dist/`. Cloudflare Pages hosts the live viewer. To add a circuit, create a scene profile under `src/circuits/` and register it with the circuit loader and the opening globe's venue list. [Circuit registry](src/circuits/index.js) · [Venue list](src/venues.js)

## Data and model accuracy

### Shanghai International Circuit

| Feature | Source and modeling detail |
| --- | --- |
| Circuit, pit lane, and venue | The centerline and pit lane come from OpenStreetMap. The main dimensions of Grandstands A, B, H, K, and E follow OSM building footprints. The main grandstand wings, H/K canopies, pit building, and paddock buildings reference OSM 3D building parts. |
| Grandstands, seats, and prices | Ticket zones and prices reference Juss Sports' official 2026 Chinese Grand Prix materials. The model uses 0.55 m seat spacing, 0.85 m row spacing, and schematic sections and aisles. Row and seat numbers are generated by the model. |
| Grass stands and runoff | Grass stands F/J and surrounding venue features reference OSM. Grass stand C was located using spectator information and its approximate boundary was traced from satellite imagery. Gravel runoff widths are estimated from corner curvature. |
| Pit building and infield | The pit building footprint comes from OSM. Its garages, floors, and balconies are illustrative, with garage order based on the 2025 constructors' standings. OSM supplies the locations of the infield kart track, restrooms, and supporting facilities. Widths, façades, and interiors are modeled for the scene. |

### Marina Bay Street Circuit

| Feature | Source and modeling detail |
| --- | --- |
| Circuit layout and turns | The centerline uses `sg-2008.geojson` from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) for the 19-turn layout used since 2023. Turn markers combine the official sequence with estimated curve positions. Track width, the start/finish line, and the starting grid are approximate. |
| Grandstand locations and seats | Locations follow Singapore Grand Prix grandstand information and the Circuit Park Map. The model includes Pit, Super Pit, Pit Exit, Turn 1, Turn 2, Raffles, Republic, Stamford, Padang, Empress, Connaught, Bayfront, and Marina Bay. Dimensions, entrances, and seat numbering are illustrative. |
| Ticket prices | The project records official adult three-day prices from pages labeled for the 2027 event, in SGD including 9% GST. Consult the official ticketing site for prices and availability. |
| Pit building and pit lane | The footprint and approach routes come from OSM. Garage and pit stop assignments follow the [FIA 2026 pit lane plan](https://www.fia.com/system/files/decision-document/2026_singapore_grand_prix_-_competition_notes_-_pit_lane_v2.pdf#page=2). The entry and exit markings reference [FIA photos from 2025](https://www.fia.com/system/files/decision-document/2025_singapore_grand_prix_-_race_directors_event_notes_.pdf#page=7). Lane widths, marking positions, pit-wall consoles, and interiors are illustrative. |
| City roads and bridges | Road alignments, shared endpoints, shorelines, and surrounding features come from OSM. Gradients, elevations, bridge decks, and piers are simplified for the scene. Esplanade Bridge has separately modeled lanes, walkways, and railings. |
| Landmarks and lighting | The Esplanade concert hall and theatre reference OSM footprints and architectural material from [DP Architects](https://www.dpa.com.sg/projects/esplanade-theatres-on-the-bay/) and [MERO](https://www.mero.com.sg/project_references/esplanade-theatres-on-the-bay-green-mark-gold/). The Merlion, Singapore Flyer, Sands SkyPark, and Gardens by the Bay use map data and published references. Model details and night lighting are approximate. |

## Refresh map data

The repository includes the map inputs and generated data used to run the viewer. Run the commands for the desired circuit in Bash to refresh its OSM data.

```bash
# Shanghai
bash tools/fetch-osm.sh tools/osm-raw
node tools/gen-track.mjs
node tools/gen-osm.mjs

# Singapore
bash tools/fetch-osm-sg.sh
bash tools/fetch-osm-sg-landmarks.sh
node tools/gen-sg.mjs
```

The Singapore generator writes `src/circuits/sg/data.js` and `projection.json` and refreshes the query bounds for features near the bridges.

Silverstone's source data is in `tools/osm-raw-silverstone/`. Run `node tools/gen-silverstone.mjs` and `python -X utf8 tools/gen-silverstone-osm.py` to regenerate the circuit and OSM scene data.

Suzuka's OSM and GSI elevation snapshots are in `tools/osm-raw-suzuka/`. Regenerate the scene data with `python -X utf8 tools/gen-suzuka.py`.

Monza uses the OSM snapshot in `tools/osm-raw-monza/` and the grandstand locations in `src/circuits/monza/stand-layout.json`. Regenerate the site data with `python -X utf8 tools/gen-monza.py`.

## Sources and licensing

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the ODbL. Singapore and Silverstone centerlines come from bacinger/f1-circuits. [MIT license](public/third-party/f1-circuits-LICENSE.md)
- Suzuka uses a flat site with local approaches to the figure-eight overpass. The build data uses Geospatial Information Authority of Japan tiles to identify the upper and lower track segments. [GSI tile catalog](https://maps.gsi.go.jp/development/ichiran.html) · [Content terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)
- [Three.js](https://threejs.org/) renders the 3D scene, and Vite provides the development server and build. The opening globe uses [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain). The satellite basemap uses Esri World Imagery.
- [Ground texture credits](public/tex/SOURCES.md) · [Brand asset credits](public/brand/SOURCES.md) · [Brand asset configuration](public/brand/README.md)

© 2026 yet2meet. All rights reserved. See [LICENSE](LICENSE) for the terms covering the project's source code and models. Third-party content remains under its respective licenses.

This is an unofficial fan project. Spectator information is for reference. Consult the event organizer for official ticket prices, seating, and entry arrangements.
