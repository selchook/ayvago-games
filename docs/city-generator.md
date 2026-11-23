# Procedural city generator

`src/core/three/city/` builds whole cities from a seed: a road network that is not a plain grid,
districts, lots and buildings, gentle terrain, a seaside with a pier, a lighthouse and a marina,
props, traffic and pedestrian data, named places for missions, and a streamed three.js view with
a full day–night cycle. Downtown, the shopping streets and the apartment blocks are assembled from
the Quaternius Downtown City MegaKit (CC0); houses, towers and industry stay procedural. It is
opt-in: nothing in `@core` imports it and no existing game uses it, so shipped games do not change
and none of it lands in `dist/` until a game imports it.

The primary style is **Sunny Coast Town** (Güneşli Sahil Kasabası); the preview opens on it. The
others (Neon Metropolis, Old Industrial, Suburbia, Harbor City) use the same machinery.

- **Import.** `@core/three` re-exports it for 3D games. A plain three.js page (the preview tool)
  imports `src/core/three/city` directly. Headless code (Node tests, bots, workers) imports
  `src/core/three/city/data`, which has no three.js.
- **Art.** Procedural geometry and shaders for roads, sidewalks, terrain, props and the
  procedural buildings (windows, markings and paving drawn by the shaders), plus the building kit
  (`public/assets/quaternius/downtown-megakit/kit.glb`, 443 KB). Without the kit every building
  is procedural. An optional hook can put other CC0 models on landmark lots ("hybrid", below).

## Preview tool

`npm run dev`, then open `/tools/city-preview/` (dev only: it is not a game, not in the platform
catalogue and not part of `npm run build`).

- **Panel.** Seed (🎲 for a random one), style, size, look (an hour and the weather), **time**
  (a slider over 24 hours) and **speed** (stopped, 1 min/s, 10 min/s, 1 h/s, 3 h/s), district mix
  sliders, detail radius, and toggles for the kit, props, far LOD, wireframe, lane graph,
  colliders, pedestrian graph, minimap and shadows. The URL keeps the city:
  `?seed=7&style=coast&size=1400&time=19.5`; add `&speed=0.2` to run the clock, `&nokit` to draw
  every building procedurally.
- **Cameras.**
  - Overview: orbit, drag to turn, right drag or two fingers to pan, wheel or pinch to zoom.
  - Fly: WASD, Q/E down and up, Shift fast, drag to look.
  - Street: walk at eye height over the terrain, WASD, Shift to run, drag to look; buildings,
    walls, railings, poles, trunks and café tables block you (the plan's colliders). On touch the
    left half of the screen is a stick and the right half looks around.
- **Stats line.** Plan time, chunks (loaded, queued, cached), chunk build time, kit buildings and
  their triangles, draw calls, triangles, GPU geometries and textures, ms per frame, the time of
  day and its phase.
- **Screenshot set** downloads an aerial and three street views by day and by night.
- `window.__city` holds the hooks the scripts use (`generate`, `aerial`, `street(i | name)`,
  `detail(name)`, `look`, `setTime`, `setSpeed`, `kit`, `settle`, `measure`, `capture`, `minimap`,
  `pois` …).

## Scripts

| | |
|---|---|
| `npm run test:city` | `scripts/city-test.mjs`: the plan checks (`scripts/city-unit.ts`) and the GPU memory check (`scripts/city-memory.mjs`) |
| `npx tsx scripts/city-unit.ts` | plan checks only, 5 styles × 3 seeds: same seed gives the same plan hash and another seed a different one, no lot overlaps, every lot inside its block and facing a road, no building on a road, the lane graph strongly connected, the pedestrian graph connected (promenade, islands and decks included), unique place ids, kit buildings on the kit's 2 m × 3 m grid with their doors on the facade, no road steeper than 8 % over the terrain, the coast town's pier, lighthouse, marina, main street and beach, generation time |
| `node scripts/city-memory.mjs` | the coast town with the kit, the street camera across it and back three times with the clock running; then a whole day at one spot (no shader program compiled, no more draw calls at night than at noon); then three regenerations. Three.js geometries and textures must stay flat |
| `npm run city:shots -- --out DIR` | `scripts/city-shots.mjs`: the coast town's main street and a low aerial at sunrise, noon, sunset and night, residential and promenade streets, close-ups of the kit-built main street, the pier, the lighthouse, the marina and the beach, a six-frame time-lapse of one view (`timelapse.png`) and the plan; then shots of the other styles. Writes `metrics.json` (GL draw calls and triangles per shot) and `contact-sheet.png` (`--pick a.png,b.png --sheet-only` re-picks it without rendering) |
| `node tools/import-megakit.mjs <kit dir> <node_modules>` | re-imports the building kit (see `docs/assets/LICENSES.md`) |

The test and shot scripts start their own Vite server (ports 5433/5434) unless given `--url`.

## API

```ts
import { generateCity, cityQuery, walkAreas, doors, CityView, CityKit, CITY_KIT_ASSET, signalState } from '@core/three';

const plan = generateCity({ seed: 42, style: 'coast', size: 1400, districts: { park: 1.5 } });
const q = cityQuery(plan);
q.roadAt(x, z);              // { edge, node, s, lateral } on asphalt, else null
q.nearestLane(x, z, yaw);    // { lane, s, d, x, z, dx, dz }: lanes facing the yaw count as nearer
q.lotAt(x, z); q.blockAt(x, z); q.deckAt(x, z);
q.surfaceAt(x, z);           // 'road' | 'sidewalk' | 'building' | 'water' | 'park' | 'pier' | 'beach' …
q.groundAt(x, z);            // where feet or wheels rest (terrain, sidewalk, deck, sand)
q.terrainAt(x, z); q.heightAt(x, z);   // the bare terrain; a roof's top or the ground
q.collides(x, z, radius); q.drivable(x, z); q.walkable(x, z);
q.pois('cafe', player);      // named places of a kind, nearest first; q.poi('lighthouse')

const view = new CityView(plan, world.scene, { kit, time: 18.5, timeScale: 0.05, onPhase: (p) => … });
world.onFrame = (dt) => view.update(player.position, world.camera, dt);
view.setTime(6.5); view.timeScale = 1 / 60; view.phase; view.light.sunDir;
```

`generateCity(options)`:

| option | |
|---|---|
| `seed` | any integer; the same options always give the same plan (`planHash(plan)`) |
| `style` | `coast` (Sunny Coast Town / Güneşli Sahil Kasabası), `metropolis` (Neon Metropolis / Neon Metropol), `industrial` (Old Industrial / Eski Sanayi Şehri), `suburbia` (Suburbia / Banliyö), `harbor` (Harbor City / Liman Şehri) |
| `size` | side of the square in metres (styles default to 1400–2000) |
| `districts` | multipliers of the style's district weights: `downtown`, `commercial`, `residential`, `suburban`, `industrial`, `docks`, `park` |
| `water` | override: `river`, `coast`, `both`, `none` |
| `ring` | ring road on or off |
| `height` | building height multiplier |

### The plan (`CityPlan`, plain data)

Units are metres; x runs east, z south, y up; a heading `h` faces `(sin h, cos h)` (three.js
`rotation.y`). Traffic keeps right. Heights in the plan are absolute (sea level 0, the water at
-0.7).

- **Roads.**
  - `nodes`: junctions, bends and dead ends, each with its asphalt outline, traffic lights
    (`signal`, `phase`), crosswalks and a roundabout island radius.
  - `edges`: streets as centreline polylines with class (`boulevard` with a planted median,
    `avenue`, `street` with parking strips, `alley`), lanes per direction, half width, bridge
    flag, the trims where the junctions take over, the blocks on each side and a name.
  - `mainStreet`: the edge of the main street (shops on both sides, awnings and café tables; on
    the coast it runs down towards the sea).
- **Blocks.** Kerb outline, sidewalk width, inner outline, district, ground; kinds `block`,
  `park`, `plaza`, `water` (a river between its quays) and `outer` (the city's edge: on the coast,
  the promenade along the sea wall).
- **Lots.** Oriented boxes along the street fronts (front on the sidewalk), with the road they
  face and their use: building, parking, container yard, gas station.
- **Buildings.** Type (tower, office, midrise, shop, apartment, rowhouse, house, warehouse,
  factory, gas), footprint, height, floors and floor height, `y` (its ground floor: the terrain at
  its door plus the sidewalk). Parts are boxes with a kind: masses with a roof and a facade style,
  roof boxes, water tanks, antennas, spires, lit crowns, helipads, awnings, signs, balconies, fire
  escapes, chimneys, canopies, roof stair houses, loading doors and garages.
  - `kit`: a kit building's spec (wall: render, brick, stone or metal, and its tint; trim colour;
    window family; ground floor: shops or plain; cornice; window rhythm; corner columns; a band;
    which sides face a street; the door bays). Its mass is snapped to the kit's grid (2 m bays,
    3 m floors), so the collider is the facade.
  - `doors`: every way in (`main`, `shop`, `back`) with position, height and heading (facing
    out); kit buildings' doors are where the kit draws them.
  - `shop`: what its shops sell (`cafe`, `bakery`, `grocery`, `pharmacy`, `books`, `boutique`,
    `icecream`, `restaurant`, `bank`, `bikes`, `surf`, `hardware`).
  - Also the front door, a roof reachable by stairs (`roofAccess`), a landmark tag and the
    lit-window share at night.
- **Seaside.** `decks`: the pier (wooden, lamps along it, a T head with a café kiosk and tables),
  the marina's jetties (floating, boats moored on both sides) and the stone breakwater, each with
  its root on the sea wall, its end, half width and deck height. `lighthouse`: on the breakwater's
  tip.
- **Props.** Lamps, traffic lights, trees (leafy, palm, conifer), benches, bins, hydrants, bus
  stops, parked cars, containers, dock cranes, pumps, fountains, statues, planters, ponds, pools,
  beach umbrellas with loungers, café tables, beach huts, lifeguard towers, boats and sailboats,
  and the kit's bollards, planters, drains and manholes. `walls` holds fences, hedges, chain-link
  and railings (the sea wall's, the pier's).
- **Traffic.**
  - `lanes`: polylines with direction, index, speed and the connectors leaving their end.
  - `connectors`: curves through each junction with their turn (straight, left, right, U-turn)
    and signal group. U-turns happen at dead ends only, and roundabouts circulate anticlockwise.
  - `signals`: the pole positions. `signalState(node, group, t)` gives green, yellow or red on a
    30 s cycle.
  - `parking`: every bay (street or lot) with its heading and whether a placeholder car is in it.
- **Pedestrians.** `walk`: a ring along every block's sidewalk (the promenade and walkable
  islands included), crossings at the junctions and paths out along the decks.
- **Places.** `pois`: named places with a stable id, a kind, a name in English and Turkish, a
  position (absolute height), a heading to face it and a radius: `lighthouse`, `pier`,
  `pier-cafe`, `marina`, `beach-0` …, `promenade`, `main-street`, `park-<id>` (the biggest is the
  City Park / Kent parkı), `plaza-<id>` (Town Square / Kent meydanı), `fountain-<i>`,
  `bus-<i>`, `docks-<i>`, `shop-<building>` (kind `shop` or `cafe`, named by what it sells: Bakery /
  Fırın, Pharmacy / Eczane …), `gas-<building>`, `tower`, `bridge-<edge>`.
- **Spawns.** Start, free parking spots, doors, rooftops, gas stations, the tallest tower,
  parks, plazas, bridges, dock cranes, the pier head, the marina's jetties and the beaches.
- **Collision.** `colliders`: oriented boxes with an absolute height range (building masses,
  walls, fences, railings). `circles`: poles, trunks, fountains, kiosks, huts, café tables,
  bollards, the lighthouse.
- **Water.** River and sea outlines and beaches; inland river ends narrow into a stream. The
  minimap comes from `minimapRaster(plan, res)` (one byte per cell), `minimapVector(plan)` or
  `drawMinimap(ctx2d, plan, scale, { lanes, colliders, spawns, walk })`.
- **Terrain.** `terrain`: its parameters; `terrainOf(plan)` builds the height field (cached),
  `terrainOf(plan).h(x, z)` samples it.

### The open world

A game with people on foot and vehicles gets everything from the plan (`world.ts`, pure data):

| | |
|---|---|
| `walkAreas(plan)` | where people walk: every sidewalk ring (kerb outline with the block's inner edge as a hole), plazas and parks, the promenade, beaches, the pier, jetties and the breakwater, each with its height |
| `doors(plan)` | every way into a building, facing out, with the building's id |
| `parkingSpots(plan)` | every bay with the height under it and its id |
| `vehicleLanes(plan)` | the lane graph (`lanes` and `connectors`) |
| `spawnAt(plan, kind, near)` | the spawn of a kind nearest to a point |
| `plan.pois`, `cityQuery(plan).pois(kind, near)` | the mission system's places |
| `plan.colliders`, `plan.circles`, `cityQuery(plan).collides(x, z, r)` | what blocks a person or a car |
| `cityQuery(plan).groundAt(x, z)` | the height to put a foot or a wheel at |

**Hooks for vehicles and people** (their models come later):

- `new CityView(plan, scene, { cars: false })` (or `view.setCars(false)`) hides the placeholder
  parked cars (instanced boxes); `plan.parking` and `parkingSpots(plan)` say where cars stand.
- `onChunk(e)`: called when a 128 m chunk is loaded or dropped (`e.type`, its square, the parking
  bays in it): spawn a game's own parked cars, pedestrians and traffic there and remove them
  when it goes. `view.parkingAt(x, z)` lists a chunk's bays.
- `onPhase(phase, previous)`: dawn, day, dusk and night (switch NPC schedules, turn on headlights).
- `view.groundAt(x, z)` and `cityQuery(plan).groundAt(x, z)` for placing actors.

### How a city is laid out

1. **Site.**
   - The perimeter road, inset from the square, or the coast promenade on the sea side with a
     beach in front of it.
   - On the coast: the pier near the town centre, the lighthouse on a breakwater towards one end
     and the marina's basin beside it, carved up to the sea wall (no beach there).
   - A meandering river between two quay roads; its inland ends narrow into a stream.
   - A downtown centre kept away from the water.
   - A district field: downtown in the middle, then a commercial ring, residential, suburbs on
     the edge. Industry sits in a noise-chosen sector and docks along the water. The borders are
     noisy, so districts blend.
2. **Skeleton.** The roads go into one planar graph (every crossing split, nearby nodes snapped)
   in priority order:
   - perimeter, quays and the ring road (an ellipse round downtown);
   - diagonals from the centre;
   - the borders of 2–3 Voronoi grid zones, which become avenues;
   - each zone's own street grid: its own angle, spacing by district, every 4th line an avenue,
     wavy in the curvy styles.

   Pieces that would run alongside an existing road are left out.
3. **Water and cleanup.**
   - A few crossings become bridges: the perimeter and ring always, others spaced apart. The
     rest of the wet edges go.
   - Short edges merge, stubs go, and so do sharp angles: under ~32° between main roads and
     under ~41° where a local street meets another road (a diagonal crossing the grid at a sharp
     angle would make a wide wedge of asphalt). Junctions keep at most five roads.
   - Some local streets are dropped for bigger blocks and T junctions.
   - Alleys cut big downtown blocks, and cul-de-sacs reach into big suburban ones.
4. **Junctions and blocks.**
   - Chains are collapsed into street polylines. Every junction gets kerb corners: line
     crossings with rounded fillets, arcs round dead ends and cul-de-sac bulbs, roundabouts
     (1–2 per city).
   - Roads are trimmed where the junction outlines start, so asphalt never overlaps.
   - A block's kerb outline is walked from those corners. Faces whose kerbs cross mean
     overlapping roads: the weaker road goes and the step repeats. A leftover tangle is split
     into simple loops: small ones become planted traffic islands, bigger ones little squares
     with a sidewalk ring and crossings to the blocks round them.
5. **Terrain.** A gentle height field: on the coast the land rises from the sea (about 18 m over
   the town), every style has low rolling hills, and past the city's edge the land climbs into
   hills (a coastal plain stays low along the sea). The promenade, beaches and quays stay at sea
   level; the land ramps up over ~400 m from the water. Roads stay under 8 %.
6. **Lots and buildings.**
   - The sidewalk is inset from the kerb (narrow necks are cut).
   - Lots are cut along each street front, longest fronts first, shrinking until they fit
     without overlapping.
   - Buildings come from the district: height falls off with the distance to the centre, so the
     skyline peaks downtown. A building stands level on its door's height, with a plinth down to
     the lowest corner.
   - Offices, midrises, shops and apartments up to eight floors in the districts where the kit
     fits become kit buildings: snapped to the grid, dressed by style (render in coast colours
     with white trims on the coast, brick, stone and metal elsewhere), shops with awnings and
     blade signs, balconies or fire escapes on apartments. The main street is all shops.
   - The tallest tower gets a spire.
7. **The rest.** Lanes, signals, the pedestrian graph, the seaside (decks, huts, lifeguard
   towers, palms and benches along the sea wall), props, café terraces, colliders, spawns and the
   named places.

## Drawing and streaming (`CityView`)

- **Chunks.** 128 m squares. Within `near` (default 320 m) of the focus a chunk is built:
  - one merged mesh with one material: roads with markings, junctions, kerbs, sidewalks,
    grounds, the procedural buildings, the kit buildings' dressing and shadow proxies, decks,
    fences and small props. Within `detail` (220 m) in full; further out without the small props,
    fences and railings (level 1). The full-detail radius shrinks as the camera climbs (to 40 m at
    220 m up), so aerial views get the lighter chunks;
  - its shadow casters first in the buffer: the shadow pass draws only them, not the ground;
  - instance records for trees, lamps, traffic lights, parked cars, containers and the kit's
    street props, drawn by one `InstancedMesh` per kind for the whole view (trees in the sun's
    shadow box get a second, shadow-casting mesh);
  - lamp halos (one more instanced mesh).

  Up to `budget` ms of chunk building runs per update, nearest first. A chunk that leaves frees
  its GPU geometry at once and keeps its arrays in a CPU cache (96 chunks) for a fast return.
- **The kit.** `KitLayer` (in `kitview.ts`): one `InstancedMesh` per kit piece (42 pieces; one
  corner piece per wall family, straight cornices round the corners and two window families per
  city keep the number in use low), filled with the kit buildings round the focus and in front of
  the camera, nearest first, until `kitBudget` triangles (95 000) or `kitTypes` piece types (22,
  each a draw call) are used; the kit radius (at most `kitRadius`, 110 m) ends there, and the
  buildings beyond show their far boxes (the shader hides a kit building's far box inside that
  radius). Refilled when the focus moves 8 m or the camera turns 15°. The pieces receive shadows; each kit building's shadow proxy (a box in
  its chunk, never drawn in the main pass) casts them.
  - The kit material: a Lambert with a slot shader over one 2D texture array (the kit's eight
    tiling base colours at 512 px): the wall slot shows render (the building's colour with a
    plaster grain), brick, stone or metal, tinted per building; trims take the building's trim
    colour, storefront frames are green or dark; glass reflects the sky by day and lights up
    window by window at night; shopfronts glow after dusk; the night light map lights the walls
    from the street.
- **Far LOD.** Every building as a box with the same window shader, in 1024 m tiles, over a ground
  map (the plan rasterised at about 2–3 m per texel) draped on the terrain, with a skirt round
  it to the horizon and a ring of hills further out. A far box hides itself (vertex shader) once
  its building's chunk is loaded (kit buildings: inside the kit radius). A water plane shows
  wherever the ground map has water.
- **Materials.**
  - The city material is a Lambert with vertex colours. Its shader switches on a per-vertex kind
    and draws windows (by floor and bay from UVs in metres, lit by a hash per window at night,
    shopfronts on the ground floor), lane markings, stop lines, crosswalks, parking bays, paving
    joints, brick courses, corrugated metal, roof tiles, deck boards and traffic light phases.
  - The others are the kit material, water (ripples, sky reflection, sun glitter, the low sun's
    path and the moon's glint, city lights), a sky dome (gradient, sunrise and sunset glow, sun,
    moon and twinkling stars, city glow), additive lamp halos and the lighthouse's beams.
- **The clock.** `view.setTime(hours)`, `view.timeScale` (game hours per real second; `update()`
  moves the clock), `view.time`, `view.phase` (`dawn` 5:12–7:18, `day`, `dusk` 18:12–20:48,
  `night`), `onPhase`, `view.light` (the current sky colours, sun and moon directions, lamp
  level). `daylight.ts` interpolates keyframes over 24 hours (sunrise 6:18, sunset 19:18):
  - the sun moves along an arc (east, south, west) with the shadows; at night the moon takes the
    shadow light over (dim, blue), so shadows never switch off;
  - sky gradient, fog, hemisphere light, the sea's colour and reflections change with the hour;
  - sunrise and sunset glow round the sun's side of the horizon, and a warm path on the sea;
  - stars and the moon come out at night;
  - street lamps come on one by one at dusk and go off at dawn (each halo and bulb has its own
    moment), the baked light map fades in with them, windows light up one by one, shopfronts
    and signs glow, the lighthouse's lantern lights and its beams turn.

  All of it goes through uniforms: no shader recompiles while time passes, no allocation per
  frame, and the same draw calls by night as by day (`scripts/city-memory.mjs` checks both).
  `view.setLook(id)` still works (day 12:30, golden hour 18:30, night 22:30, overcast: 13:00 under
  grey skies); `view.setWeather(overcast)` mixes in the grey.
- **Night.** A light map baked once on the CPU (lamp pools, shop glow, gas station canopies; its
  alpha holds the terrain's height, so walls are lit from their foot) lights the ground and the
  lower walls. There are no per-lamp lights.
- **Shadows.** One light casts them (the sun, the moon at night), its shadow box following the
  focus (`shadowExtent`, 110 m; `shadowMapSize` 2048, 1024 on phones). Only the chunks inside that
  box cast, and only their casters.
- **Prop distances.** Instanced props are drawn nearer than the chunks: trees within 190–200 m,
  lamps within 240 m, traffic lights within 180 m, containers within 220 m, parked cars within
  160 m and the kit's street props within 140 m. They are refilled as the focus moves.
- **Hybrid.** Pass `replace: (building) => Object3D | null` to put a loaded model (for example a
  CC0 GLB through `loadModel` / `model()`) on a landmark or tower lot. The view fits it to the
  footprint, and the procedural building and its far box are left out.
- **Other calls.** `view.setNear()`, `setDetail()`, `setLod()`, `setProps()`, `setCars()`,
  `setShadows()`, `setWireframe()`, `setFogScale()`, `overlay('lanes' | 'colliders' | 'walk', on)`,
  `loadAll(focus)` (no pop-in on the first frame), `groundAt()`, `parkingAt()`, `stats()` (with
  the kit's numbers, the clock and `gpu`: an estimate of the view's GPU memory in MB).
  `dispose()` frees everything, and a `World3D` frees what is left in its scene on shutdown
  anyway.

### A game using it

1. In preload: `loadModel(load, 'city-kit', asset(CITY_KIT_ASSET))` (the kit is optional).
2. In `createGame()`:
   - `plan = generateCity({ seed, style: 'coast' })`;
   - `kit = CityKit.from(model('city-kit'))` (once per game; `kit.dispose()` at the end);
   - `view = new CityView(plan, world.scene, { kit, time: 9, timeScale: 1 / 60, cars: false, onChunk, onPhase })`,
     without `world.addLights()`, since the view brings its sun and sky light;
   - `view.loadAll(start)`.
3. Each frame: `view.update(player.position, world.camera, dt)`.
4. Gameplay: drive on `q.roadAt()`, follow `plan.lanes` and `connectors` for traffic, respect
   `signalState()`, walk the `walk` graph and `walkAreas()`, collide with `q.collides()`, stand
   on `q.groundAt()`, spawn at `plan.spawns`, send the player to `plan.pois`, enter `doors()`,
   park in `plan.parking`, draw the HUD minimap with `drawMinimap()`.

## Budget (measured)

These were measured in the repo's headless Chromium (SwiftShader, so frame times mean nothing)
and in Node on a shared 4-core machine. Draw calls and triangles are counted at the GL level,
with the shadow pass included (`renderer.info` leaves the shadow pass out).

BUDGET_TABLE

## What is still simple

- Cars and people are not simulated: the plan carries lanes, signals, parking bays, walk areas,
  doors and places for a game to use, and the view has hooks for its own models.
- Buildings have no interiors; kit glass is opaque (lit or dark, no fake rooms).
- The terrain is gentle by design: no cliffs, tunnels or stairs between levels; a building's
  plinth takes up the slope of its lot. Beaches step down 0.5 m from the sea wall with no stairs.
- The kit's realistic textures are tinted towards the coast's colours; up close the procedural
  houses and towers are still flatter than the kit buildings.
- Kit buildings switch to their far boxes at the kit radius (about 60–110 m): the window pattern
  changes at the switch.
- Aerial views with a big detail radius are still heavier than a street view (the lighter chunks
  drop the small props, not the buildings): 85–110 draw calls at a 420 m radius. Use the far LOD
  (a small `near`) for overviews in a game.
