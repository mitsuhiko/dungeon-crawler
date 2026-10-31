# World of cubes (spike)

The world is an unbounded grid of cubes `(X, Y, Z)`. `Y = 0` is the surface and deeper
strata go down to depth 20 (`MIN_Y = -20`). Cubes come into existence lazily, the first time you get
near them, and stay around after that.

## Layers

| Layer | Code | Contents |
|---|---|---|
| World | `src/world/` | WFC tiles, faces, specs, the cube cache |
| Themes | `src/themes/` | per-depth palettes, lighting, generator settings, materials |
| Generator | `src/cubegen/` | turns a spec into a map |
| Game | `src/game/flow.js`, `portals.js`, `minimap.js` | entering cubes, portal travel, the overview |
| Render | `src/render/markers.js`, `neighbors.js` | portal looks, low-detail neighbors |

## Only where you have been

The one rule every feature has to keep, however big it is or however many cubes it spans:

- **A cube shows only once you have been in it.** Drawn (the low-detail surroundings), on the
  minimap, anywhere: never before a visit. Not the far side of a gorge span, not the other cubes
  of a spiral or a hairpin, not the room under a great shaft or any other hole, not a cube that
  is merely generated or prefetched. `discoveredCubes` (`core/viewdistance.js`) is the only
  thing that picks what is drawn around you, and it goes by `visits` alone; nothing adds cubes
  beside it.
- **The way into an unvisited cube is a portal.** Every step of the route from one cube to the
  next crosses a portal on their shared face, inside spans and large areas too. A face opens
  (no glass, no gates, walk across) only once both its cubes have been visited
  (`discoveredFaces`, "Opened side connections" below), never because of what a cube is part of.
- **Down is a fall.** A hole of any kind (void, a great shaft) drops you into the cube below
  (`game/fall.js`); that is the only way you see it before you have been there, by being there.

So a place that spans several cubes is discovered one cube at a time, like everything else, and
reads as one place once you have walked it (its faces opened, all of it drawn). A feature that
wants to be seen from afar has to be seen from inside the cube you are in. Checks: the gorge span
and discovery cases in `tests/viewdistance.test.js`, a portal on every route step
(`tests/layout.test.js`), an area walked a cube at a time (`tests/areas.test.js`), and in the
browser `runProxyIntegrityChecks()` and `runShaftViewChecks()` (`tests/browser/neighbor.js`).
The span's far side was shown early once (and taken out again); so were the area's other cubes
and the room under a shaft. Do not bring it back.

## The town (`world/town.js`, `cubegen/town.js`, `game/handover.js`)

The town is not one cube but a place of `TOWN_ACROSS` × `TOWN_DEEP` (3 × 4) **tiles**: ordinary
16 × 16 cubes of the depth-0 grid, laid out together round its gate and turned with it (the road
leaves the town `seed % 4`: `townOf(seed)`, its `tiles` by their place `{ i, j }`, `j` counted from
the gate's row). The gate's tile is `(0,0,0)`; a new world starts in the inn's tile (`World.start`,
`START_TILE`). The idea, and what is still to come, is in [town.md](town.md).

- **Known from the start.** All its tiles count as visited when a world begins (`game/flow.js
  knowTown`): on the map, drawn round the hero, the faces between them open. The town is home: the
  one exception to "Only where you have been" above.
- **One cube at a time.** Only the tile the hero is in is played and drawn in full; the others are
  its surroundings (`render/neighbors.js`), half as dim as the surroundings outside the town
  (`dim`, `render/materials.js NEIGHBOR_DIM`) and with all they are dressed with, houses and trees
  too (`shownFar`). From outside the town they look like any other surroundings.
- **No seams.** Between two tiles (a tile's `map.seams`, the sides with another tile beyond) there
  is no portal, no glass and no step in the ground: their faces are flat at the town's level (as
  every face touching the town). Each tile's glass draws only its share of one hull round the whole
  town: no pane on a seam, none of the edges on it, the brighter corners only at the hull's own
  (`setGlassSeams`, `render/glass.js`). A seam is walked across as any open face is ("Opened side
  connections" below, `game/handover.js`): the physics reads the tile beyond as it lies there, up to
  a cell past the seam, and once the hero's middle is `PAST` (0.25) beyond it the tile beyond takes
  over at once, the hero, what is in the air and the planted feet moved by a cube's width, so
  nothing on the screen jumps; the tile left dissolves into its proxy. The tiles are made and loaded
  ahead (`prefetchTown`); until one is, the hero stands on the seam. The overview camera follows
  the hero all the way in town (`game/camera.js`), else it would pan a cube's width at every seam.
- **Still seams for now:** the villagers, the shards of the crash and the robot asleep are drawn
  only in the tile played in, the surroundings have no baked shadows (their lights shine without
  them, across the seams: docs/lighting.md), and
  a friend in another tile is not drawn (`render/partner.js`). Drawing more than one tile in full
  comes later ([town.md](town.md)).
- **Only the gate leads out.** The town's outer faces never open, whatever lies beyond and however
  much of it was visited (`core/boundaries.js discoveredFaces`); its gate is the first portal of
  depth 0's route.

Every tile has an authored plan of its own (`TILES` in `world/town.js`, in the tile's frame: local
`z = 0` towards the gate's side, `+x` the next tile across), made from the tile's seed:

| | 0 | 1 | 2 |
|---|---|---|---|
| **0** (the gate's row) | an orchard | the market: the three tents along the street, the gate | the traders' camp: a fire ring, their stock |
| **1** | the stable, the groom | the plaza: the crash (`CRASH`: the shards of the glassmaker's big glass, the robot asleep and his sword beside it), the town portal's spot | the smithy, the smith |
| **2** | the garden by the lake | the inn (the spawn, its door to the street) | the pet shop, the keeper |
| **3** | a grove with a wishing well | the green with the town's well | the windmill |

The street (`STREET`, town-local x = 8.5) runs from the gate straight back through the middle
column to the green (over the water and up the cliff, below); lanes cross the plaza's row
(`LANE_1`) and the inn's (`LANE_2`) to the houses either side. They are laid out alike in every tile, as wide on both sides of a seam, so
they meet there; rendered as grid-aligned ribbons rather than whole-cell paving.

- **Buildings** (`BUILDINGS`, `MERCHANTS`: each with its `tile` and its place in it) stand on the
  cube grid (quarter turns), each wholly in its tile. The inn, the blacksmith and the pet shop
  have doors and colliders that follow their walls and attached props (`parts`), so you can walk
  right up to the door and in (see House interiors below); the stable and the tents collide with
  their whole footprint. Tents have no doors.
- **Villagers** stand at their trades (`VILLAGERS`, see [villagers.md](villagers.md)): the
  innkeeper on the inn's porch, a groom in front of the horses, the smith at the anvil, the pet
  keeper by the rabbit pen, and at the market the alchemist and the enchanter in front of the
  potion and herb tents. Each is a body-sized circle collider, placed before the clutter.
- **The grove**: large oak/elm/birch trees from `assets/town_trees.glb` in the forest outside the
  wall and the woods inside it (not by the seams inside it), bushes between them; 6–7 units tall,
  higher than the inn; their
  crowns may overhang, but only the trunks block movement. The cutaway includes building and
  canopy occlusion volumes, independently of body colliders, so foreground roofs and foliage
  reveal the player as the camera turns.
- **Dressing**: each tile's set pieces (signposts, street lamps, wells, benches, the notice board,
  flower pots, hay bales and hand carts, barrels/crates/sacks by each trade, the blacksmith's
  planks and coal, the lake's reeds/stones/lily pads, the traders' campfire with log seats and a
  woodpile, the windmill), garlands over the streets from pole to pole, hedges and dry stone walls
  a cell back from the ways (more of them in the lower town), a lamp every few steps along every
  way, stones in groups here and there (`outcrops`), and seeded ground cover growing in patches
  (`land.patch`: thick here, the grass bare there, about half as much as it once was), from
  `props/`/`clutter/` models and the
  town's own (`assets/town_clutter.glb`, docs/assets/town.md), `put`/`group`/`scatter`. A set
  piece tries its candidates in order (`near`: the spots round a place, nearest first) and is
  skipped if none fits. Every prop avoids the oriented building footprints, trunks, other
  clutter, the water (except water/shore props) and the path ribbons; blocking props get circle
  colliders and keep clear of the gate, the spawn and doorsteps by a full character width.
- **The seams stay clear**: nothing that stands in the way (a building, a trunk, a villager, a
  blocking prop) comes closer to a seam than `SEAM_CLEAR` (0.9) plus its radius, so a body
  crossing never runs into something the tile played in does not know.

**The land** (`world/townland.js`, `makeLand`): the ground under all twelve tiles at once, from
the world's seed, so what runs across a seam runs on and every world's town is a land of its own.
It is the generator's own ground: a whole level per cell (`cubegen/smooth.js` makes slopes of the
small steps and leaves the big ones as cliffs), its stairs and bridges runs (`cubegen/shape.js`),
its water fluid floors and where the river comes down a fall (`core/falls.js`). Each tile is built
from it (`tileGround` in `world/town.js`).

- **Three bands.** The lower town round the gate (the first rows, level 4), the water across the
  whole town (from the back of the plaza's row, `WATER_FROM`, into the inn's row, `WATER_TO`) and
  the upper town up to half a cube over it (`UPPER`, 16 levels; 12 to 16, the landscape's `rise`), its cliff rising straight out of the
  water and winding a cell in and out, a strand at its foot here and there (in every tile a way
  out of the deep water: `physics/swimout.js`).
- **The street** crosses the water on two bridges, a pier between them on the seam, to a quay at
  the cliff's foot in the inn's tile and climbs the cliff by a deep stair along it (`INN_STAIR`).
- **The lake.** In the garden the water broadens to a bay (8 to 13 cells deep into the upper
  town); a long span comes down over it from the upper town's edge to a rock standing in it on the
  seam (a run in each tile: a run never crosses a seam), and on down to the lower town's shore or a
  cell or two past it into the lower town; in some worlds two of them, side by side. Or, where one
  fits, a *tall* one: its rock on the seam a pillar most of the way up the cliff, the span down from
  it long and as steep as a span may be (`LH` × 1.45 a cell), landing on a way of the lower town or
  far on into it (high over a way it passes); over a deep bay first to a second pillar out in it,
  higher still, a span between the two. In some worlds (`landscape.wide`: the bay as deep as it
  goes, the hill in the other back corner, no gorge, the grove's well off its way) a *wide* one,
  three tiles long: from the back row's ground up to a pillar standing on the upper town behind
  the bay on its seam (five to seven levels over it), from there high over the bay's back and the
  lake down to the tall pillar on the lower seam, and on down to the lower town. Under a span the
  ground stays a level under its deck. A span's ends are walked to from the town: kept level a
  little round them, and where no way comes near one a trail leads to it (`trails`, `to: 'span'`).
  Each span is built in a style of its own (`SPAN_STYLES`, themes/builds.js: rope, chain, plank,
  stone arches on piers, iron, prayer flags; a gorge's level ones a rock arch too), now and then the
  same as the last; no leg or pier stands where the town walks (`pathFloors` in `tileGround`).
- **The gorge**, in about half the worlds: from the back of the bay on into the upper town, three
  cells wide and as deep as the lake, winding a cell now and then (straight across a seam), cliffs
  on both sides; a stream comes in from the back and falls into its head, one or two spans cross
  it from rim to rim, high over its water (each in a style of its own, as the lake's), the lanes that
  come to it cross it on bridges, and a ledge a level over its water in each tile it reaches into
  is the way out of it. In such a world the hill stands in the other back corner and the grove's
  wishing well on the gorge's far side.
- **A landing stage**, in some worlds: in the pet shop's tile a second way up the cliff, from the
  lower town's shore a bridge out over the water to a pier on the seam, a bridge on to the cliff's
  foot (straight there), and a stair up along it to a tongue of the upper town by the seam. (Where
  it leaves the river nowhere to come down, the stream into the gorge is the river, or the world
  has no stage.)
- **The lower town's own water.** Its shore winds: points of land a cell or two out into the water,
  a few cells wide each (coves into the land where nothing stands for good, which the lane along
  the shore leaves little room for), straight by the street's bridges, the landing stage, the
  seams and the wall; a span over the lake never lands in a cove, and a boat lies pulled up on the
  shore now and then. In some worlds (`landscape.brook`) a brook rises at a spring by the front
  wall in one of the corner tiles (stones and reeds round it: `land.spring`) and winds on through
  the lower town to the shore and into the lake, two cells wide, waded, bridged where a way
  crosses it; a mill may stand by it. In some others (`landscape.pond`) the lower town has a pond of
  its own, rounder and bigger than a marsh's, reeds and lily pads round it, a bench looking out
  over it.
- **The river** comes in from the back of the town across the upper town, two cells wide, and
  falls over the cliff's edge into the water (where the cliff runs straight), now by the wall, now
  nearer the middle; waded, bridged where a way crosses it. In some worlds without a gorge a stream
  comes down on the lake's side too, over the cliff into the bay.
- **The mill**, in about half the worlds: on a bank of the river (or a stream) where it runs
  straight on for a few cells, well up from its fall, on level ground of its own; its wheel turns
  in the water beside it, and its windows light up at night.
- **Old ruins**, in most worlds: what stood here before the town, on wild ground of their own,
  most often in the upper town by the cliff's edge, else out in the lower town: a temple's gate
  among the bases of its columns, a colossus's head among toppled columns, or a colonnade with an
  arch fallen at its end; rubble, tiles, urns and tablets about them (`RUINS`, `oldRuins`).
- **A style of its own** (`land.style`, from a dice of its own): how many homes a tile has at
  most and how many short lanes the town has, how many trees stand in the open and whether firs
  or broadleaves, how many hedges and dry stone walls line the ways, how often a garland hangs
  over a lane, how many homes stand on terraces, which trees line the avenues, how thick the
  ground cover grows. The lane along the front of the town runs inside the market now (it never
  fitted where it was).
- **A landscape of its own** (`land.landscape`, from a dice of its own as well):
  - *its wood* (`WOODS`): mixed firs and broadleaves where the land's kinds of wood go, a fir
    wood (ferns and moss under it), a birch wood (grass and flowers), an oak wood, an old wood
    (gnarled trees among firs and oaks, brambles, rotten logs, a scene in it more often) or a heath
    (few trees, birches, firs and tall ones, tussocks, juniper and scree under them); its trees
    stand outside the wall, in the woods inside it and in the open, and its floor grows under them;
  - *how its woods lie* inside the wall (`WOOD_SHAPES`): a belt along the wall and woods here and
    there, many small groves, one big wood filling a corner or two (never before the gate), or
    open parkland with hardly a wood and more trees standing alone;
  - *the forms of its wild ground* (`UPPER_FORMS`, `LOWER_FORMS`, `relief` in `makeLand`): the
    upper town flat (a plateau), in broad swells (downs), in terraced fields a step of two levels
    over the next up towards the back (terraces, never by a seam), in rocky knolls where its ground
    is wildest (highland) or with a ridge along its longest wild line (off the seams); the lower
    town in knolls (meadow, as before), a marsh with round shallow ponds (waded; reeds, cattails and
    lily pads round them: `ponds`), an orchard's level ground with fruit trees in rows on a grid of
    the whole town's (`orchard`), a flat green, dells sunk into it, or rough ground with stones.
    Each form has its own ground cover and as many outcrops as it is rough (`FORMS` in
    `world/town.js`); the rugged ones come up closer to what stands level (a terrace's wall or a
    knoll's foot by a way). No form steps more than a level at a seam or near the wall, and the
    wall's own cells stand level;
  - *its cliff, hill and hollow* (`CLIFFS`, `RISES`, `HILLS`, `HOLLOWS`): the cliff winding a cell
    or two or straight, and twelve to sixteen levels high (the stair, the falls and the spans with
    it); the hill a hill, a broad low mound rising gently (flowers on its sides) or a steep peak
    (boulders and scree), each cut off where its foot would reach further; the hollow a dell, a
    shallower dell with a pool at its bottom (on its far side from the town's middle, reeds and lily
    pads round it), or a quarry deeper, its sides walls of stone two levels a cell but where a way
    comes down into it from the town, a pick left in a block, a cart, stone lying about;
  - *how settled each band is* (`landscape.settled`, and how much room its form leaves: `ROOM` in
    `plotTown`): fewer short lanes and homes where the ground is rugged or wet, or the band hardly
    built up, so more of it is wild.
- Each world's land differs in more than where these lie: how deep the bay reaches, how far the
  cliff winds, how far a span goes. `node tools/townmap.mjs [seed ...]` draws a world's land from
  above (a PNG a seed: its levels over its band's, water, stairs, bridges, spans, falls, ways and
  homes; `--sheet [count]` many worlds side by side in one, their landscapes in the console).
- **The hill** in a back corner (a tent on its top, the corner's set piece on a knoll on its
  shoulder), **the hollow** in a front corner (a tent at its bottom), trails up and down to them,
  woods here and there.
- **The wall** (`WALL`, `wallSide`): round the whole town on the fourth row of cells in from its
  outer sides (`assets/town_walls.glb`, blender/town_walls.py): a stretch on each of its cells
  (ivy on some, a lantern on its inner face on every fourth), an arch with a grate where it crosses
  the water (the lake's bay at the sides, the river at the back), a round tower at each corner and
  every 7 to 10 cells along it (off the seams, the water and the cliff), the gatehouse over the
  street where it comes in from the gate (`WALL_GATE`). Each piece stands on a footing sunk into
  the ground under it, so it follows the ground's levels, the cliff too; it stands in the way as
  its box and hides the hero behind it (the cutaway). It runs on across the seams (the one thing
  that does). Outside it the forest stands close and tall on ground three to six levels over the
  town's, a cliff down to the road from the gate: nobody walks there, and the generator's checks
  leave it out (its seams' cells, `map.town.wallSide`). Lanes run along it inside.
- **What stands level**: the buildings, streets, lanes and paths, the people, the crash, the
  spawn and the gate keep the level they stand on; the wild ground round them takes its band's
  form (above: up to five levels over it, or a couple under it in a dell; less towards the seams
  and the wall). The people's homes (`HOMES`, `plotTown`) are laid out
  round the land's big things along every way; a home only keeps its own footing level (its yard
  rolls), and now and then (more often in the lower town) stands on a terrace a level to three
  over its way, its path a ramp up to its door.
- **Seams**: the cells either side of one stand alike and level, dry or as deep in water, and
  nothing stands near one.

Every tile is pinned to a lowland socket and one layer **before the surface collapses**. Every face
touching the town is flat at the lower town's level, and neighbouring terrain's shared boundary
corners are pinned during smoothing. No tile depends on generation retries, exploration order or
the `?arche=` debug override. A tile is checked as it is made (`cubegen/town.js`): a
body-radius-aware flood fill (`townReach`: walking, wading, swimming the deep water) reaches its
gate and spawn (if it has them), every cell along its seams, every frontage and doorstep, the town
portal's spot and the beginning's things; the way between two cell centres must be clear too, with
a little room to spare, so a crate cannot pinch a route shut.

**At night** (the world's days and nights below) the town lights up: the street lamps (placed
with `night`), the garlands' bulbs (every other one with a light of its own), the wall's lanterns,
its towers' braziers and the gatehouse's lanterns, and the houses' windows (their panes' own
material) come on through the dusk, each
house and lamp at its own moment, and go out again through the dawn; the windows' candlelight
glimmers a little (`render/night.js`, docs/lighting.md). Fireflies drift over the meadow, a few of
them bright enough to light the grass (the meadow's `nightMotes`).

`enemyFree` is generation metadata, retained on cached maps and checked before any
species-specific spawn selection: the town's tiles, and only those (`enemyFreeAt`), have no
enemies. The road has them from the room past the gate, the beginning's rock with its three
snakes.

The initial loading screen waits for the start tile, the ordinary prop library and the town
building/tree libraries; the other tiles come in as they are made. Static building/tent colliders
are generated in the worker, independent of download timing; rendering cannot accidentally remove
them.

`npm test` includes town checks across seeds and all four exit orientations
(`tests/town.test.js`): the tiles round the gate, the land (its three bands, the street's bridges
and stair, the span over the lake, the river's fall, the hill and the hollow with their tents, a
land of its own for every world), every building and tent once and in its tile, the seams (flat,
no portal, nothing standing near,
reached all along, walked across), only the gate joining the town to what lies round it,
non-overlapping assets, dry reachable gates/frontages using actual movement probes,
generation-order-independent boundaries, grid-aligned buildings and straight paths, clutter
placement and colliders, box/trunk collision, canopy occlusion, and matching Blender exports. For
real worker/asset/render checks, run `await (await import('./tests/browser/town.js')).runTownChecks()`
from `index.html`'s devtools: the town known from the start, the buildings drawn in their tiles,
one hull, and walking across its seams.

## House interiors (`cubegen/interior.js`, `game/doors.js`, `render/interior.js`)

The houses with a door (inn, blacksmith, pet shop) each have an inside: a map of its own
under the key `interior:<building>` (`world/town.js interiorKey`), outside the cube grid.
It has no WFC tile, faces, neighbours, glass box, minimap cell or enemies, counts as town
(depth 0, the town song, no town portal casting) and is generated in the worker on first
use, like a cube.

- **Proportions:** the room is the house's walled body (`body` in `BUILDINGS`) at one shared
  scale (`INTERIOR_SCALE`, 3.8 cells per model unit), so the inn (13 × 11) stays bigger than
  the blacksmith (10 × 10) and the pet shop (10 × 9). Storeys fit the 1.1-unit character
  instead of the models' scale: the inn's ground storey is 3 units, the others' 2.5.
- **Orientation:** the room stands the way the house does in town, which turns with the
  exit. The front wall faces where the house's front faces and holds the door where the
  model has it along the front, so walking in keeps your direction.
- **Upstairs:** the inn has a gallery along its back wall (its real upper storey), the
  others a loft under the gable. A wooden stair climbs the house's right-hand wall to it;
  a railing runs along the open edge and invisible rails line the stair.
- **Walls all round:** box colliders just outside the floor, with a stone footing and
  plaster in a timber frame, windows on the back (upstairs) and right (downstairs) walls.
  There is no floor outside them, but no way to get there: you cannot fall out.
- **Doors:** walking into a door (`core/doors.js atDoor`: on its side, within its width,
  against its face, pushing towards it) takes you through at once, with a fade and a creak
  (`door` sound). You arrive on the other door's doorstep (`DOORSTEP`, 0.75), facing the way
  you walked. Each arrival starts a visit. Town doors lead in (`map.doors`, `to` the
  interior); the door inside leads back to its house. The interiors behind a cube's doors
  are prefetched.
- **Cutaway:** the walls on the camera's side come away entirely, down to the floor, with
  everything mounted on them (`uWallBox`/`uFrontKinds` in `render/cutshader.js`: inside
  houses only the walls' own `stone` mesh, not the floors, stair or railing). The door
  stands in front of that band, so it stays. Walls cast no shadows. No two faces in the
  interior share a plane, so nothing z-fights, also not in the cut.

`npm test` covers which houses have interiors, walking into every town door for all four
exits, proportions, orientation matching the outside, running into every wall, the stair
and both doors (`tests/interior.test.js`). From the browser's devtools,
`await (await import('./tests/browser/interior.js')).runInteriorChecks()` walks in and out
of every house over four seeds and checks the cut walls.

## Wave function collapse (`world/tiles.js`, `world/wfc.js`)

Each cube collapses to a **tile** with four side sockets:

- `L`: lowland.
- `H`: highland, meaning the ground reaches the first layer.
- `W`: lowland with a river crossing the face.

Tile kinds are meadow (`LLLL`), highland (`HHHH`), slope (L and H mixed), river (two `W`),
lake (one or more `W`) and gorge (both `H` and `W`).

The tile set covers all 81 socket combinations, so collapsing a cube next to any set of
collapsed neighbors always succeeds. There is no backtracking and never a contradiction.
Uniform tiles weigh more, which grows regions; the mixed tiles appear where regions meet.

Each depth is its own puzzle: domains and layer counts only look at the four side
neighbours, never up or down. A depth collapses **in one go**, the first time any of its
cubes is prepared: its layout's cubes plus their side neighbours (the neighbours carry the
faces between a room and the rock around it), lowest entropy first. Each cube draws from its
own random stream (world seed plus cube key), and the region is fixed by the layout, which
only depends on the seed. So the tiles depend on the seed alone, **not on the order of
exploration**: walking a depth backwards, prefetching other portals or generating depth 9
before depth 2 gives the same world. That is 17–42 cubes per depth, a few
milliseconds. Cubes outside a depth's layout are refused (`World.prepare` throws) rather
than collapsed on the fly, which would bring the order dependence back.
`tests/wfc.test.js` covers this.

### Later: an unbounded world

This only works because every depth is bounded (`world/layout.js`): the whole region a depth
can ever need is known up front. Portals that lead off the planned route into endless wilds
would need a different scheme. The plan is a hybrid:

- The planned region still collapses first, in one go. Off-route cubes only ever border
  tiles that are already fixed, so the route stays a function of the seed.
- The wilds pick each **face's** socket from world-space noise fields (rivers as a noise
  contour sampled at cube corners, highland from a threshold field) and derive the cube's
  tile from its four faces. The tile set covers all 81 socket combinations, so this always
  fits, needs no search and does not depend on the order. Where the wilds touch the planned
  region, the region's sockets win.
- Rules that read the layout (`voidAllowed`, cascades, spouts, side portals, guardians)
  need their own order-independent equivalents off the route, e.g. a per-face hash for
  portals.

We tried noise sockets for the planned route too: it made the world coherent at map scale
but dull at room scale. Over 40 seeds, 68% of rooms had the same kind as the room before
(WFC: 46%) and only 28% had mixed edges (WFC: 53%), so it is meant for the wilds only.
Lazily continuing the WFC into the wilds would also work, but then the wilds depend on the
exploration order again; reproducing them would need the collapse order or the tiles saved.

## Faces (`world/faces.js`)

A face is decided once, by whichever of its two cubes is prepared first, and stored under
the cube on its low side. Its layout comes from the face's own random stream.

**Side faces** carry:
- **Ground profile:** 16 levels sampled from world-space noise (`core/wnoise.js`) in the
  socket's height band. Both cubes pin their edge cells to the profile and blend inwards.
- **Corner vertices:** where four faces meet, the vertex gets one height from the four
  sockets there, so corner cells match too.
- **River crossing** (on `W`): all rivers flow at one world level (`RIVER_SURF`), and the
  fluid is fixed per stratum.
- **Portal:** position along the face, layer and level. Layers sit at world-fixed levels
  (`LAYER_BASE = [0, 10, 16, 22]`), so a layer-2 gate lines up on both sides.

**Vertical faces** carry a down/up portal: a well in the upper cube, a ring on the top layer
of the lower cube.

Which faces carry portals is decided by the depth's layout (see below), not per cube.

## Layout: the spiral down (`world/layout.js`)

Which cubes exist and how they connect depends only on the world seed:

- **Depth 0:** the town's tiles (above, "The town") lie round `(0,0,0)`, its gate's tile, the
  first room of an 18–24-room route to the first well; the road runs straight out of the gate for
  two rooms, then anywhere within five cubes of the axis but the town (no branch into it). The
  town's gate and the next room's way out are gates of the beginning (`gateFaces`, `intro:sword`
  and `intro:glass`, `core/intro.js`, [story.md](story.md#the-beginning)): shut until the
  glassmaker's sword is taken at the crash in town and his glass found on the next room's rock.
  The town's tiles but the gate's are no rooms of the route (no `routeIndex`, nothing planned in
  them: they are added to `exists` last). That room
  (`firstGlass`) is always a lone peak (`cubegen/setpieces.js`, its tile pinned flat all round), his
  glass on its top where a discovery's chest would be, three grass snakes at its foot.
- **Depths 1–19:** seeded routes through a two-cube-wide ring around the axis. Each route's
  length, counting the up ring and well, comes from its band in `ROUTE_ROOMS`: 18–24 rooms
  at depths 0–3, 16–22 at 4–7, 14–20 at 8–11, 12–18 at 12–15 and 9–16 at 16–19. The next
  route starts below the well; depth 19's ends on a corner of its ring (see the core).
- **Ring size:** the radius shrinks with depth (3 → 2 → 1). Bounded path search keeps the
  long routes on the small rings.
- **Depth 20:** the core, whose entry-to-centre route walks all 9 rooms of its 3x3 (only
  possible from a corner) and has no further descent.
- **Branches:** optional one-room detours fit within the band's most rooms per depth. No
  portal loops or discovered-face shortcuts can bypass undiscovered route rooms or guardians.
- **Guardians:** every well has a stronger descent guardian (future boss placeholder, a "Temp
  Boss" to players; a real boss where there is one, docs/bosses.md),
  with one or two mandatory side guardian arenas on its approach. They stand at evenly
  spaced rooms, moved to the nearest free one off a large area (and the room after it).
- **Large areas:** a depth's large area (see "Large areas" below) is built into the route:
  the search lays its rooms down whole at a chosen step (a template, any way round) and
  backtracks as usual where it does not fit. On its own random stream, so a depth without
  one keeps its route.
- **Trial rooms:** rooms built round one goal, an event (the water rises, the room is sealed)
  or a puzzle ([trials.md](trials.md), `world/trials.js`), planned on their own random stream
  after the hordes, spans, heights and the area and before the branches. A trial on the route
  holds its exit shut like a side guardian's gate (`gateFaces`, `trial:<key>`). Never in a
  guardian's, the horde's, a span's, a height piece's or the area's room, next to a cube the
  WFC pins, or under a void or a shaft; pinned `LLLL` with its own layers (no river crosses it).
  Entered only by its portals; the portal into it warns of it.

Layer counts are part of the WFC state. A collapsing cube's count is drawn towards its
neighbours' counts, so tall regions form. A face's portal sits on any layer both cubes
have, half the time the highest one (guardian faces always on the ground). Over 40 seeds
that gives L0 54%, L1 28%, L2 15%, L3 4%.

## Void and relief

- **Void:** a cube may have columns with no ground at all, open to the depth below. This is
  only allowed where the cube below exists in the next depth's layout (`world/voids.js`).
- **How much:** the amount comes from the theme. It is large for the sky islands (depths 1–3)
  and the abyss (19), small for crevasses and sinkholes in between.
- **Shape:** the void field is world-space noise, and face profiles carry `VOID` cells, so
  open areas line up across faces.
- **What stays solid:** portal pads, the ground around them and rivers. Upper slabs over
  void float without pillars.
- **Falling in:** you fall into the cube below (`game/fall.js`) with the vertical slide. You
  come out at the same spot, 5 units over the ground (at least 2.5, `RESCUE.clear`). The cube
  below is found then (discovered, on the map), but a fall is no way into it. With the robot
  along it catches you before you land (`game/rescue.js catchFall`) and carries you back up:
  the vertical slide upwards (`game/travel.js` 'lift', into the cube the fall started in, its
  visit going on), out over the hole and on to its last safe spot, for a quarter of your most
  health (all of it if that is all you have: you fall to your death). With no robot yet, if it is
  void there too you keep falling; the first landing (or leaving the world) costs full fall
  damage (`FALL_DAMAGE`, 60 HP) and puts you back in the cube the fall started in, at its last
  safe spot, or at its entry if the landing killed you. Out of a cube with nothing below (the
  core, a trial room, Flip's box) the robot catches you just under the floor; with no robot,
  that hurts (25) and puts you back on the last safe spot. Checked in the browser by
  `tests/browser/fall.js` (`?dev=1`, `await (await import('./tests/browser/fall.js')).runFallChecks()`).
- **Relief:** themes also have a `relief` that stretches highland faces (up to level ~18 in
  the snowy peaks) and makes hills and plateaus taller.

## Falls into the cube below (`world/cascades.js`, `cubegen/cascades.js`)

- **The look:** a pool in one cube spills over the edge of its void and pours out through
  the bottom of the glass box. In the cube below, the stream comes in through the top of
  the box into a catch pool at the same spot. Falling through the void there lands you in
  that pool.
- **Decision:** the shared vertical face decides it from world data only (void field,
  layout, the face's own random stream), so either cube may be generated first. A fall
  needs:
  - void allowed in the upper cube, and that cube not a pinnacle's (its pool and hole would
    cut into the needle's ramp);
  - a lower cube that is no span, large area, peak, pinnacle or tableland descent (the
    catch pool would flood a bridge, a ramp or a plunge's soft landing);
  - a void cell inside the inner 8×8 with solid ground on the side it flows from;
  - a cell at least 5 away from the wells and rings of both cubes and from the upper
    cube's own catch pool.

  Chance 45%. The fluid is the depth's river fluid 60% of the time, otherwise its fluid mix.
- **Upper cube:** forces the void cell open and floods a small pool beside it. Neither gets
  slabs above it.
- **Lower cube:** clears the void around the spot, floods the catch pool and keeps slabs
  off it. The sheet's column is claimed, so no structure crosses it.
- **Open shaft:** the 3×3 around the fall cell (and for inflows around the cell upstream)
  stays free of slabs on every layer, so the water never seems to pass through a floor.
- **Results:** about 7% of cubes, mostly in the sky islands and the abyss. Over 8 worlds,
  all 270 falls have a matching end in the cube below.

## Falls across a side face (`world/spouts.js`, `cubegen/spouts.js`)

- **The look:** a stream on an upper layer of one cube runs to a side face and over it onto
  a short lip in the neighbour. From the lip's inner edge it falls into a pool on the
  ground there.
- **Face record:** the side face holds the spout: `{ pos, layer, from, type }`.
  - Both cubes must exist and have the layer.
  - The spot keeps 5 cells from the face's portal and clear of its river crossing.
  - The ground under the lip lies at least 7 levels below the layer.
  - Falls through the void in either cube keep their shafts.
  - Cave walls open around it.
  - Chance 30%. It has its own random stream, so the other face decisions do not change.
- **Source cube:** a strip of the layer 3 wide and 5 deep from the face, with a channel down
  its middle. The surface is a level under the banks, with a bank at the back.
- **Receiving cube:** a 3×1 lip on its outer ring at the same level, the catch pool just
  inside, and open air between them.
- **Matching edges:** spout slabs are pad-like (`prot` 99: flat, kept, no structures
  through them), so the layer lines up across the face just as at upper-layer portal pads.
  A well or ring (`cubegen/portals.js`) moves off a spout's strip, lip and catch pool,
  as off another portal's pad.
  Over 3 worlds, no upper-layer edge cell differs on any of 1943 faces.
- **How many:** about one cube in ten gets one.

## Gorge spans (`world/spans.js`, `cubegen/span.js`)

On every depth but the town and the core, some rooms may be joined by one long bridge over a
valley. How often, and how, is up to the depth's theme (`spans` in `themes/index.js`): most
often on the sky islands, the peaks and the badlands, now and then in the caves.

- **The look:** a straight line of cubes. A room at one end, one or two gorge cubes, and at
  the other end the next room on the route or a lonely island. The valley runs across the
  line: a ledge along the room it starts from, a sheer drop to a floor just over the river,
  the far bank. The bridge leaves from a pad at the face and lands on a pad at the far face.
  Between two gorge cubes it rests on a rock pinnacle standing at the shared face.
- **Levels:** every crossing face has a deck level. A span either stays level over the valley
  (headland to headland, levels 10–15) or comes down from the top tier to the ground: a
  headland at level 14–20 (18–22 over two gorge cubes) to a bank at level 4–6. Over two
  cubes the pinnacle stands halfway. A high crossing is a headland: the room's edge rises to
  it, so the bridge leaves from a cliff top instead of a floating slab.
- **Islands:** a branch that goes straight out from a route room: one or two gorge cubes,
  then an island plateau (levels 5–12) in the valley. Nothing else touches the gorge or the
  island, so the bridge is the only way in. The island usually gets the depth's rare reward
  site (sites prefer branch rooms far from the route).
- **Over the sky:** some of the spans with no other room beside their gorge (and no room may be
  placed beside it later) cross bottomless sky instead (`sky`: half of them on the meadows, more
  over the clouds, fewer in the lagoons, none on the ground of the badlands or in the caves but
  the abyss): the valley is void, the rock pinnacle rises out of nothing and the island floats. The pads stand right at the edge (no
  ground is made solid around them, `portals.js`); falling off is falling out of the world.
- **Planning:** `planSpans` runs on its own random stream after the horde, before branches.
  On the route it looks for straight runs of the spine with one or two inner cubes, none of
  them a guardian or the horde room, gorge cells two cubes apart. A depth gets at most `max`
  spans (`spans` in the theme: chance, max, route, island, sky, deck; two on the surface, one in
  a cave). Gorge cubes get role `span`, no reward sites and half the population.
- **In the caves:** the faces carry the caves' rock walls (17–24 levels high), so the decks stay
  lower there (`deck`: at most level 15 instead of 22); the headlands and the top tier scale
  down with it.
- **World:** the WFC pins span cubes before collapsing the depth: one layer, sockets from the
  deck levels (`H` from level 8), `W` on the sides of the gorge cube with the river. They
  never have void and nothing falls into them from above. `spanProfile` (`profile.js`) gives
  the gorge cubes' side faces the valley's cross-section, so the valley runs on into the
  cubes beside it; corners inside the span lie on the valley floor (`spanVertex`). Crossing
  faces get the pad at the deck level (3 cells, ground portals), shoulders a level lower on a
  headland or the island's edge, and the same position along the face (`faces.js`), so the
  bridge runs straight.
- **Generator:** gorge cubes and islands have their own archetypes (`shapeGorge`,
  `shapeIsland`). The valley floor ramps up to low room ends, so falling off never leaves you
  in a pit, and is kept a head's height under the deck; no random slope climbs out of it
  (`smooth.js`), or its corners could join a pad's at the deck's height. Where a river's bank has to come up
  under a low deck anyway, no way of the route search leads onto or off it. The bridge is not
  searched for: `spanBridge` hands the route search a ready move from pad to pad (both ways),
  12 cells long and as steep as the levels say. It is placed like any bridge, in one style for
  the whole span (from the theme's weights), with a deeper sag for rope and tall trestles
  under plank and iron. Invisible side rails keep you on it like on every bridge.
- **Discovery as usual** ("Only where you have been"): a span's cubes show only once visited,
  like every other cube. Each crossing is a portal, so the gorge, the far bank and the island
  come into view one cube at a time as you cross.
- **Dev:** `/span [n]` jumps to the start of the world's next (or n-th) span.
- **Checks:** `tests/spans.test.js` covers the plan (on every depth but the town and the core,
  straight, in budget, unguarded, islands apart, sky and deck as the theme says), the pads on both sides of every crossing, matching ground on every face of every
  span cube, one bridge per gorge cube clear of the ground, every portal leading on, and the
  same cubes whatever the exploration order; the character walks every bridge both ways and
  pushing sideways halfway across keeps it on the deck. Over 200 seeds all 4472 span cubes and
  their rooms generate, in 1.26 attempts on average (over 1000 seeds, all 22965).

## Big heights: tablelands, pinnacles, great shafts (`world/heights.js`, `cubegen/heights.js`)

Planned with the layout from the seed alone, on their own random stream (after the spans,
before the branches), as often as the theme says (`heightsOf`: `heights` in the theme can
override the defaults; the canyon has more). Every depth has two slots, rolled on a stream of
their own (`planSlots`): the **large area** (75%: a tableland, or one of the large areas below,
by the theme's weights; at most one per depth) and the **set piece** (70%: a pinnacle, or one of
the set-piece cubes below). Over 300 worlds about 60% of the depths get a large area (a
spiral 32%, a tableland 18%, a hairpin 10%) and about 62% a set piece.

- **Tableland:** three rooms in a row on the route (never its ends, nothing guarded, no horde,
  not beside a span), at most one per depth:
  - **ascent:** you come in at the foot of an escarpment. A shelf at the shelf level `hi`
    (17–20 under the sky, 13–15 under rock walls) runs along its far side to the plateau; the
    cliff stands at `cu` along the way through, often with a terrace halfway up along part of
    it. The route climbs it with stairs and ladders.
  - **plateau:** high ground all round, a few knolls.
  - **descent:** down from the plateau's edge, one of three:
    - **plunge:** a soft landing (3 by 2 cells, the theme's `soft` colour: hay, sand, snow,
      moss, web, ash) right under the edge, 11 or more levels down. The route leaps
      (`drop` onto a `soft` floor, any depth; `plunge` on the move when deeper than an
      ordinary drop). Landing on something soft never hurts or knocks you over
      (`landingSpeed` in `physics/move.js`). A ladder usually stands beside it for the way
      back.
    - **great shaft:** a hole (radius 2.6–3.2) open to the depth below (only over an ordinary
      room: no horde, large area or set piece, and no river crossing it, `shaftOf`), a ramp winding down
      round it from the plateau's side (the long way round, railed) to a cut leading out to
      the exit, and a rim up high everywhere else. Nothing may cross the hole (`noCross`: no
      stairs, bridges, landings or jumps over it). Only where the depth below has an ordinary
      room right under it (`shaftOf`); otherwise the planned shaft becomes a plunge. That
      room gets a dry, flat basin under the hole (`shaftBottom`) and knows you may fall in there
      (`fallMask`). The hole is a hole like any other: the room under it is not drawn before
      you have been there ("Only where you have been"), and falling in is a fall into the cube
      below like any other.
    - **stairs:** a cliff with a terrace, climbed down like the ascent is climbed up.
  - **faces:** the plateau's faces are all at `hi` (and its corners), so the pads between the
    three rooms are up there. The ascent's and descent's side faces carry the escarpment's
    cross-section, so the cliff runs on into the rock beside them; the faces the route comes
    in and goes out by keep their own profile, and where they are side faces a cove opens at
    the foot of the cliff round the pad. The WFC pins the three cubes with one layer (high
    sockets towards the plateau). No void, no branches off them.
  - **the route:** in a plunge's or a shaft's descent, every other way down off the shelf
    costs 40 more, so the route leaps or winds down the ramp (`descentRoute`).
- **Pinnacle:** in one of the depth's discovery rooms (a reward site not built round a
  landmark; no river), a needle of rock: a top of radius 2.3 (19–21 levels under the sky,
  14–16 under rock walls, and at least ten over its foot), a railed ramp once round it, a flat
  ring at its foot. The reward site is its top. Stairs, ladders and bridges onto the needle
  cost 40 more, so the way up winds round it (`pinnacleRoute`).
- **Kept cells:** what these shapes depend on (`ctx.keep`) gets no slabs, sites, hordes, pools
  or stream falls.
- **Dev:** `/height <ascent|plateau|descent|shaft|pinnacle|spiral|hairpin|peak|lake|tunnel>` jumps to the next one.
- **Checks:** `tests/heights.test.js`: the plan (seeded, on the route, clear of guardians,
  hordes and spans, no branches), the faces (the plateau high all round, the pads up there,
  the same whichever cube decides them), every tableland of 8 worlds generating with the route
  climbing, crossing and coming down (leaping onto something soft in a plunge), the shaft's
  open hole, its ramp and the dry basin below, the pinnacle's site on top reached by the ramp,
  and the character landing softly after a plunge.

## Large areas: spiral and hairpin (`world/areas.js`, `cubegen/areas.js`)

A stretch of the route laid out as one place over several cubes, planned with the layout from the
seed alone. The layout builds the area's shape into the route (above), so its rooms follow each
other on the route in a fixed order: never the first room, the room after it never the last, no
guardian in it nor in the room after it, no horde, no branch beside it, no span next to it.
Each area cube has one layer (the WFC pins it) and no void, cascade, tunnel or spout.

- **Discovered a cube at a time** ("Only where you have been"): every step of the route from one
  of its cubes to the next crosses a portal, and its other cubes show only once visited. The faces
  between its cubes carry no cave walls (`isInnerFace`), and at corners where such a face ends no
  face is walled, so the corner cells of all four cubes agree (`innerCorner`). Once both sides of
  an inner face are visited it opens like any other (`discoveredFaces`), so a walked area reads
  as one place.
- **Spiral (2x2):** a mountain on the corner the four cubes share, a ramp winding once round it
  (radius 4.6 to 8 cells) from the foot, where the route comes in (level 5), up to the top (19–21
  under the sky, 14–16 under rock walls), then a ridge out to the exit's headland on the last
  cube's face. The ground is one function of world position (`spiralAt`: core, ramp, ridge or
  foot), used by the faces (`areaProfile`, `areaVertex`: the mountain's level at the shared
  corner) and by the cubes alike, so they agree by construction. The face between the first and
  the last cube carries the mountain across the ramp's band. The foot (the rest, low ground) is
  capped a level over the ramp's start.
  - **Railed all along:** every cliff edge of the ramp and the ridge gets a rail (`ctx.railed`),
    and before the rails exist the reach graph allows no drop off them (`reach.js`). So the foot
    of the later cubes is out of reach in the cube, gets no escapes and no ways up (`ctx.foot`),
    decor keeps off the ramp and an area's rims, and escapes never climb onto a rim. Walking the
    foot through the faces once they are open leads nowhere: the way up is the ramp. No random
    slope joins a railed ramp cell to the foot (`smooth.js`), or it could pull a pad's corner
    down with it, too steep to walk.
  - **The route walks it** (`areaRoute`): every move but a walk that starts or ends on the ramp
    costs 40 more, and no drop or jump leaves it over the side.
  - **The mountain** stands three levels over the top of the ramp: never walked onto.
- **Hairpin (2x3):** `a b c` out, `d e f` back. Two spans (`twin`, `world/spans.js`) side by
  side, gorges `b` and `e`, whose valleys meet in one canyon (no river: the low bridge starts too
  low for its banks). The low bridge goes out from the foot `a` (about 5 to 10), the turn rooms
  `c` and `d` climb (a pad between them, `turn`), the high bridge comes back (about 14 to the top,
  19–22, in caves lower) to the summit `f`: high all round, its faces and corners at the top, so
  the room after it comes down from a high face. The foot is capped low, the summit's face over it
  a cliff. Over the sky (`sky`, as often as the theme's sky spans) the canyon is bottomless, only
  where no room lies beside it. A hairpin counts as one of the depth's spans.
- **Reward sites:** none in an area but where nothing else is left (then on the foot of either,
  or the hairpin's summit, as high as the ground goes there).
- **Dev:** `/height spiral` or `/height hairpin` goes in at the foot.
- **Checks:** `tests/areas.test.js`: the plan (seeded, in its shape and order on the route,
  never guarded, about one large area per depth), discovery (a portal on every step through it,
  walked in order no face opens towards a cube not yet visited, and once walked all of its inner
  faces are open), matching ground on every
  face of every area cube whichever cube decided it, one layer, the spiral's route walked from
  the foot to the top (on the foot, past a ladder or a steep step the walker cannot take), pushing off the ramp where it is high keeps you on it, no structure from
  the foot onto the ramp, the hairpin's two bridges, summit and foot, and the same cubes whatever
  the exploration order.

## Spots for the quests (`world/spots.js`, `cubegen/spots.js`)

Every depth keeps some places free for the quests' people and things: hiding places, seats and,
every third depth, a camp with a fire near where the depth begins. Planned from the seed with the
layout, placed by the cube's generator level, dry and reachable both ways, with nothing built or
put on them; the camp's fire is the only thing they show. See
[quests.md](quests.md#spots-planned-from-the-seed).

## Trial rooms (`world/trials.js`, `cubegen/trials/`, `game/trials.js`)

Rooms built round a goal that is more than walking to the exit: events (the flood: climb the
summit before the water) and puzzles. Planned from the seed (see the layout above), built by the
kind's generator in `cubegen/trials/`, checked (an event's timing against a slow player,
`cubegen/trials/timing.js`), run by `game/trials.js`. See [trials.md](trials.md).

## Set pieces: lone peak and great lake (`cubegen/setpieces.js`)

Mostly empty rooms built round one thing (`spec.sparse`: one layer, no cave pillars, no decor,
a quarter of the props and nothing in the way, `render/propplace.js`). Enemies come as usual.

- **Lone peak:** in one of the depth's discoveries (a reward site not built round a landmark),
  never next to a pinned cube, its sockets pinned low (a flat field). A steep block of 4x4 cells
  (5x5 for a bigger site) 10–13 levels over the worn-flat field, the discovery on top. Stairs,
  bridges and jumps onto or off the top cost 40 more (`setPieceRoute`), so the way up is a ladder.
- **Great lake:** in a room of the route or a branch (not the entrance, arenas or the horde room),
  one layer (its sockets as the WFC made them). Water of the depth's river fluid from three cells
  in (four in places), at the rivers' level, so a river coming in runs into it and ends there. The
  route keeps to the shore (lava and acid kill, the water is swum in; no jumps in a lake cube). A discovery there
  waits on an islet (level with the shore, water all round it) reached by a bridge (a stair onto
  or off it costs 40 more, `setPieceRoute`). A fall from
  the cube above lands in the lake (it is its catch pool).
- **Dev:** `/height peak`, `/height lake`.
- **Checks:** `tests/areas.test.js`: the peak's discovery on top and only a ladder onto it, the
  lake's water never on the outer ring but where a river comes in, its route dry, the islet's
  discovery reached by a bridge.

## Tunnels (`cubegen/tunnel.js`)

A short tunnel the way leads through: a ridge of rock across the cube, between the two portals
farthest apart (one on the ground), with a passage two cells wide and 3–6 long bored through
it at ground level and a flat apron at each mouth. In caves and canyons the ridge runs from
wall to wall, so the tunnel is the way; on the surface it falls away towards the faces, a hill
with a tunnel. 25% of the cubes on the surface, 40% under rock walls (45% in the canyon) may
get one: not in the town, guardian arenas, spans, height pieces, horde rooms, or where rivers
run, falls come or go, or spouts pour; and only where the ridge fits clear of the pads.

- **The roof** is a floor of its own (`roof`, layer 0) over the passage floor, solid from two
  units over it (`ROOF`, 4 levels) up to the ridge's top. The character walks under it; the
  cutaway takes it for a slab (`game/cutinfo.js`) and opens it around you.
- **Nothing in the way:** no structure stands in the passage or on the aprons (`noCross`),
  slabs and pools keep off the ridge.
- Over 3 worlds, more than half the tunnels lie on a route (the others are passed by a route
  on another layer).

## Cube archetypes (`cubegen/archetypes.js`)

Every cube gets a big shape on top of the blended ground. The shaping fades out towards the
faces, so the outer ring still matches the neighbours.

| Archetype | Shape |
|---|---|
| plain | nothing extra |
| chasm | a winding split across the cube with raised rims |
| spire | a tall needle on a raised base |
| sinkhole | a round pit with a raised rim |
| archipelago | islands |
| mesa | one big flat-topped block |
| crater | a ring wall around a lake of the depth's fluid |
| gorge, island | only in gorge spans (above) |
| ascent, plateau, descent, pinnacle | only for the big height pieces (above) |
| spiral, foot, turn, summit | only in the large areas (above) |
| peak, lake | only for the set pieces (above) |

Chasms, sinkholes and archipelagos open to the void where the world allows it. Elsewhere
they hold the depth's fluid instead: a river gorge, an acid canal or a lava sea.

The archetype is chosen by the theme's weights (`arche`), scaled by how the WFC kind leans:
highland towards mesa and spire, lake towards archipelago and crater, gorge towards chasm.
The town and its road stay plain. In dev mode, `?arche=<name>` forces one archetype
everywhere.

Structures: a stair never runs right beside a bridge at a similar height, and timber legs
under plank bridges never stand where another structure passes underneath.

## Caves (depth 7 and deeper) and the canyon (5–6)

- **Chamber walls:** cave cubes are enclosed by rock walls. A side face's `wall` (in
  `world/profile.js`) is shared by both cubes. Each cube raises its outer ring to the wall
  height (levels 17–23) and the ring inside it to a rough half-height foot.
- **Openings:** walls open around portals and river crossings. Corners come from the shared
  vertex point, so the four faces meeting there agree.
- **The canyon:** its theme has `walls`: the same rock walls along the faces (`walled` on the
  spec and the map), under the open sky. The route winds through a sandstone gorge.
- **Pillars:** one to three rock columns rise to the top level in every cave cube.
- **Walls down:** the faces towards the camera are cut down to just over the character in the
  cutaway shader (`frontWall` in `render/cutshader.js`), in caves and canyons (`map.walled`). The cut rock shows as a flat
  cross-section, like a cutaway model.

## Themes per world (`themes/index.js`, `themes/caves.js`, `themes/depth.js`)

Every theme belongs to one of the story's three acts (`act`; `ACTS`: the depths of each, see
[story.md](story.md)) and may appear at any depth of it (`depths` follows from the act). Every
world draws its themes from its seed (`worldThemes(seed)`, its own random stream per act): an
act shows `SHARE` (half) of its themes, rounded up or down at random so the share comes out
right, each equally likely, so every theme is as likely to be in a world as any other, whichever
act it belongs to and however many themes its act has. A theme's `weight` (1) makes it likelier
than the rest of its act: the slime marsh (3.2) is in about 80% of the worlds, the other act II
themes in about 46%. They come down the act in their story
order (the order of `THEMES`), the act's depths dealt out among them, a depth each and the rest
at random, no theme for more than `LONGEST` (3) depths. The town (0) is always in the meadows
(`TOWN`), the core (20) in the obsidian abyss (`CORE`). The picks are kept as stretches
(`[{ at, theme }]`, each lasting until the next). Forced themes (`?theme=`, the tests) win every
depth they may appear at: an act with any of them shows them alone.

| Act | Depths | Themes, in story order |
|---|---|---|
| | 0 | Meadow islands (the town and its road, always: `TOWN`) |
| I | 1–6 | Meadow islands, Cloud kingdom, Lagoon isles, Karst terraces, Dark forest (a night theme), Snowy peaks, Prayer highlands, Salt flats, Badlands, Deep canyon (walled in like a cave, under the sky) |
| II | 7–13 | Root caves, Sunken grotto, Dwarven forge (open), Honey hive, Fungal swamp (open), Jungle cenote (open), Frozen caves, Slime marsh (open, meteorites at night) |
| III | 14–19 | Crystal mines, Spider nests, Ossuary, Buried ruins, Volcanic depths, Obsidian abyss |
| | 20 | Obsidian abyss (the core, always: `CORE`) |

- **Where it is read:** the picks live on the layouts (`world.layout.themes`, each depth's
  `layout.theme`). The layout reads a depth's gorge spans from it; the worker reads the rest
  from there (WFC weights, void, relief, cave walls, fluids of falls and spouts, reward sites);
  a spec and its map carry the theme's id as `biome` (its prop set), and everything that draws
  or sounds a map reads it back with `themeOf(map)` (palette, props, footsteps, ambience,
  music, names). A map without a theme is a bug: `themeOf` throws. The light follows the
  world's picks (`lightAt(depth, themes)`, blended between the starts of the stretches); with no
  world yet (the menu before its first cube) it is the town's.
- **Light in three bands, one per act:** light under the sky (0–6), medium in the sunlit
  hollows (7–13: caves lit through cracks, and open themes under a hazy sky, dim stars at
  most), dark in the deep (14–20). Each theme's `light` belongs to its band; its `lamp` (0, about a half, 1)
  sets how bright the character's own light is (`render/look.js`). A **night** theme (`night`:
  the dark forest) is under the sky in the light band but lit like the deep: a few stars, a dim
  blue moon, fog, the character's full lamp, and its own lights.
- **Days and nights** (`core/daycycle.js`, `game/daycycle.js`, `themes/skies.js`): the world
  has one day of `DAY.length` (420) s on its play time (`state.run.clock`,
  `game/worldclock.js`), the same in every cube and for friends playing together (the host's
  clock); it goes on while you are elsewhere. A world begins in the morning: 280 s of sun, 30
  s of dusk, 80 s of night, 30 s of dawn. What a cube shows of it is its theme's `sky` (from the
  rest unless given):
  - `open` (act I under the sky, the town): the sun goes along an arc through the noon sun
    (`NOON`, where it always stood), never lower than `sunLow` (35°; the canyon 50°, over its
    walls), its shadows baked again as it goes (docs/lighting.md); mornings and evenings take
    on a warm light (`SUNSET`), the night its `light.night` (else one made from its sky: a blue
    moonlight, lit like the deep, the character's full lamp). At night the moon stands where the
    noon sun does; the sun gives way to it (and it to the sun) halfway through the dusk (the
    dawn), where neither shines.
  - `hazy` (act II's open themes): the same light, the sun staying at noon (no bakes).
  - `night` (the dark forest): always night, a little lighter by day (`light.day`).
  - `none` (the caves, act III, the core): no days and nights. Neither indoors, in trial and
    test rooms, nor in a boss's arena, where it is always noon (the bosses' own light: Totnar's
    dark, Renew's dusk), but for a boss whose arena keeps the days and nights of its theme's sky
    like any cube (`core/bosses.js` BOSS_ARENAS `days`: Gusto's).
  `state.night` is how far into the night the cube is; the look follows the time of day eased
  (`render/look.js`), so coming out of a cave at night fades the dark in; a word says when it
  turns. On the lowest lighting level the sun stays at noon everywhere (`movingSun`,
  `game/quality.js`). `/daytime` and `/dayspeed` (docs/console.md).
- **What the theme changes:** acts I and II mix open themes and walled ones (`cave`, `walls`);
  every theme of act III is walled in. The route, its guardians and hordes depend on the seed
  alone; the gorge spans (and with them where the branches go) are the theme's. Which large
  area a depth gets (`planSlots`) is the depth's: the weights of the first theme of its act,
  whichever theme the world picked there.
- **Same per depth:** the enemy rosters (`DEPTH_SPAWNS`) go by depth; the species that keep to
  one theme (`where`) are in every row of its act ([depths.md](depths.md#enemies-per-depth)).

### The dark forest (`darkforest`)

Wooded hills at night (act I, among the meadows and the sky islands): tall firs and gnarled trees, lanterns
on posts and in the branches, glowing mushrooms, old stones, and the abandoned places of people
long gone. What makes it so, all in its theme entry:

- **Ground:** little void (`void` 0.1) and few floating floors (`layers` 0.3: a cube keeps the
  upper layers the WFC gave it only that often, `world/wfc.js`), but more hills (`hills`: 2–4
  round hills a cube and a rolling floor, `cubegen/ground.js`), gorges and rivers (`tiles`),
  crossed by natural rock arches, logs and rope (`BUILDS.darkforest`), and short tunnels
  through the ridges (`heights.tunnel` 0.5). Its spans (and its `heights`) keep to what the
  route depends on, so the route is the same whatever a world picks.
- **Grove** (`grove`, `render/propplace.js`): trees in thickets and clearings by the cube's
  noise, beside the way too (back from it, so it runs between trunks), and lantern posts by the
  way, their lanterns hanging out over it. A tree's collider is its trunk. Lanterns hang from the
  branches of some trees (the trees' `anchors`), and strings of paper lanterns (`lantern_string`,
  attach `line`) are tied between the anchors of trees 2–5 apart, at most three a room, over the
  way first: each segment sheared along the sagging curve (an explicit `matrix` on the
  placement), never into the ground or what is over it, always a head's room over the ground.
  Checks: `tests/grove.test.js`.
- **Vignettes** (`vignettes`, below): a shed, a cabin, a camp, a shrine, a stone circle or a
  wagon in most rooms.
- **Lights**: every glowing prop gives off light (as everywhere, `docs/lighting.md`); lanterns
  flicker, mushrooms and runes breathe (`flicker`, `render/props.js`, `render/flames.js`), their
  glowing parts with their lights, each in its own time (seeded by where it stands); fireflies
  drift round the character (`motes`, `render/motes.js`).
- **Enemies:** Gloom spiders and Lantern-faces of its own (`core/spawns.js`, `where`; the
  ordinary spiders of depth 2 keep out of it, `'!darkforest'`), see [depths.md](depths.md).

### The slime marsh (`slime`)

Green moss and pools of toxic slime (act II, the last of its themes: an open marsh in a hollow
under the act's hazy sky, no rock walls, lit like the sunlit hollows by day): drooping slime trees, mounds of goo with bones or a sword stuck in them, bubbling
vents, reeds, and the craters the slime meteorites left. What makes it so, in its theme entry:

- **Ground:** low and wet, few holes (`void` 0.1), more lakes and rivers
  (`tiles`). Its fluid is acid (`fluids`, `river`: falling in is the end), in slime greens of
  its own (`FAMILY.slime` in `themes/fluids.js`: the `goo`, `ooze` and `bog` anchors). Logs and
  planks cross it (`BUILDS.slime`). Its spans keep to what the route depends on.
- **Props** (`assets/themes/slime.glb`, `blender/themes_slime.py`): the slime glows a little,
  more so where it is fresh; landmarks: a meteorite's crater and a giant slime tree.
- **Grove** (`grove`): slime trees, bulb trees and dead slimed trees in thickets (fewer than the
  forest's, no lanterns or strings), and glowing stalks by the way (`waylights`), their bulbs
  hanging over it.
- **Vignettes**: a cart stuck in the slime, a hut a blob has half swallowed, a meteorite that
  came down not long ago; in about every other room.
- **The slime holds the feet** (`mire` 0.88, `core/footing.js mireOf`): on its slime ground
  (the `slime` surface: everything under the highest tops, which are bare rock; its own squelching
  steps, `audio/footsteps.js`) the player walks and runs a little slower (`physics/move.js
  mired`: what was underfoot last holds through a jump off it, and the jumps click to move takes
  are planned with it), and so do the enemies that walk (`game/enemyai.js`, `enemyMire`: not the
  slime's own `slimeborn` creatures, nor what floats or rides the air). Bridges and stairs do not
  hold. Whoever walks there leaves wet footprints that dry up in a few seconds
  (`render/footprints.js`): the hero's at each foot's touchdown (`game/footsteps.js`), a friend's
  and the enemies' every so far as they walk.
- **Its nights** (the world's, see Days and nights above): a green moonlight of its own
  (`light.night`: stars, fog, the character's full lamp, the slime glowing), and glowing spores
  and a wisp drifting (`nightMotes`, `render/motes.js`).
- **Slime meteorites** (`meteors`, `core/meteors.js`, `game/meteors.js`, `render/meteors.js`): at
  the world's night lumps of glowing slime fall out of the sky, every 2–4 s a cube. When and where is the
  cube's and the night's (from the cube's seed and the world's play time), so every game playing
  together sees the same ones; a third of them come down near the player instead (each game near
  its own: a friend does not see those). Each first shows where it will land, a shadow growing
  for 1.7 s with a rim pulsing faster, then falls the last 0.55 s with a whistle and lands with a
  wet boom: whoever is within 1.1 cells is hit (16 at depth 1, growing with the depth like the
  enemies' blows; knocked back, slowed to 55% for 2 s, not knocked over), the enemies too (a bit
  harder, and slowed; only in the game that runs them). One whose shadow showed less than 0.6 s
  (a long frame together, where the clock runs on real time; coming in late) lands without
  hitting the player, and one that landed does not come again should the clock go back. The splat
  it leaves slows whoever wades through it for 6 s. They land only on floors open to the sky, and under a roof (a slab, an
  arch, a tunnel) nothing reaches you. Never in the town, inside houses, in trial,
  test or boss rooms. Checks: `tests/meteors.test.js`, `tests/browser/meteors.js`.

### Vignettes (`cubegen/vignettes.js`)

Little set pieces of a theme, scattered through its rooms (`vignettes`: [min, max] a room):
the theme library's `vignette` props (bigger than a cell, with colliders and occluders derived
from their mesh like landmarks, but never a reward site). Placed after the route, the reward
sites and the spots have their ways and before the structures:

- on dry ground of the bottom layer, off the portals, the reward sites, the spots, the horde's
  patch and the way's structures, never blocking or levelling a floor of the way (one may reach
  over it), with room overhead; ground up to two levels off is levelled under it;
- near the way (scored by how far from it), each on a quarter turn, its origin in a cell's middle
  or at a corner as it takes the fewest cells; where the one whose turn it is finds no room, the
  next of the theme's (the smallest last), never the same one twice in a room;
- never cutting anything off: with its cells blocked and levelled, every portal, reward site and
  spot is still reached from where the cube is entered and leads to where it is left.

They claim their cells like a landmark (`landmarkClaims` in `cubegen/sites.js`): blocked where
the character could not stand, kept flat and free of structures under them. The map gets
`vignettes` ([{ name, x, y, z, yaw }]; the surroundings show them like landmarks), their
placements (with a few small things of the theme's around them), colliders and occluders, and
their cells are kept free of ambient props. Optional: one that finds no room is left out. In the
dark forest a room gets about 1.2 of them. Checks: `tests/vignettes.test.js`.
- **Dev:** `?theme=clouds,forge` (with `?dev=1`) makes those themes win every depth they may
  appear at (their acts show them alone). `new World(seed, { themes: ['mines'] })` does the same
  in tests.
- **Checks:** `tests/themes.test.js`: the picks (stable, each act in story order, no stretch
  longer than `LONGEST`, every theme in about `SHARE` of the worlds but by its `weight`, the town always in the
  meadows and the core in the abyss), act III walled in, every theme complete (act, structures,
  arenas, site recipes, spans, its own props), the same route whatever the picks, and every
  theme generating its depths dressed from its own set.

### The fluids' colours (`themes/fluids.js`, `cubegen/fluidbodies.js`, `render/fluidpal.js`)

Water, lava and acid are not one colour each: every world makes its own palettes from its
seed, a few per fluid and depth, within the family of each theme (`FAMILY`: anchor colours by
name, the blue and teal waters from bright royal and lagoon down to the deep's navy and dark
teal; acid only greens; lava orange to crimson). Water's hues (OKLCH 188–270) and acid's
(118–146) stay over 40° apart, and acid is always bright and vivid, so the two are never
mistaken for each other. A palette is picked between two of the family's anchors and
jittered; the rest of it (darker swirls, the light lines between the cells, foam, glow, the
falls' colours) follows from its body colour in OKLCH: dark water is duller, its pattern
fainter, its lines leaning towards teal (never into the greens).

- **One colour per fluid in a cube** (`stampFluidBodies`, from the map alone, in
  `World.cube`): what runs on into another cube (fluid at the cube's edge, a spout, a fall out
  through the bottom) or a trial's rising fluid takes its depth's running palette (slot 0, the
  same through a stretch of depths with one theme), so rivers keep their colour across the
  faces; otherwise a fall from the depth above brings that depth's; otherwise the cube picks one
  of its depth's other slots from its key. Every fluid floor carries its row (`f.pal`, and the
  map `fluidRows`), every fall the rows at its top and foot (`fall.pal`): a fall from above into
  a cube whose fluid runs on turns from the one into the other on its way down (only where the
  theme changes between the two depths do they differ).
- **Drawing:** the rows go into the fluid geometry (`pal` attribute, `render/parts.js`), the
  palettes into one small texture (`render/fluidpal.js`), so the active cube, the batched
  proxies, the trial's water, caps and splashes all agree. With no world: the classic look.
- **Looks per fluid** (`render/materials.js FLUID_LOOK style`, patterns baked in
  `render/watercells.js`, each only while shown): water's wandering cells; lava's crust, big
  slow dark plates hotter towards the glowing cracks, a hot seam along the banks; acid's
  sludge, cells with bubbles blowing up and popping, a green stain on the banks.
- **Under the clear fluids** (water, acid; `render/underwater.js`, the active cube's terrain,
  structures and props only): each vertex under the low-water line (the lowest the surface
  sinks) is pushed sideways by the slope of the waves over it, the more the deeper it lies (a
  vertex shader edit, no extra pass). The solids are split along that line when the cube is
  built (`render/cubegeo.js`), so a bank or a bridge's pier bends under the water only, never
  over it; a prop moves as a whole, and only if it lies all under the line; a standing fluid
  (trials, tides) pushes nothing. And
  caustics play on what lies there: water's baked cells again, where the sunlight through the
  surface lands, softer and fainter deeper down. `UNDERWATER.shift` / `.glow` (uniforms) tune or
  turn off either live.
- **Mud** (`cubegen/mudpools.js`, `core/constants.js MUD`): a theme's `mud` (root caves 0.25, the
  fungal swamp 0.5, the jungle cenote 0.3, the badlands 0.2, the dark forest 0.3) is the share of
  its pools of water that are mud: a body of water standing on its own in the cube (not a river or
  a sea running on into the next cube, nor one a fall pours into or out of). Its floors stay water
  (`f.fluid`: waded and swum in alike, a way out of it like any) and get the look (`f.look = MUD`,
  `drawnFluid`): the mud's palette (`MUD_ROW`), drawn as a part of its own (`render/parts.js`,
  `DRAWN_FLUIDS`) in the marbled goop of Sollmeldon's (`FLUID_LOOK[MUD]` style `goop`,
  `render/goop.js`) with the sludge's bubbles, not see-through. Round 60% of them (`POCKETS`)
  1–3 **pockets of mud** lie on the dry ground up to 3 cells out and up to 3 levels over its
  surface (no structure, portal, ramp, site or the outer ring; no props in them): a dome of mud
  each (`map.mudPockets`: x, z, its ground y, radius, volume), a few centimetres deep. In the game
  each is a little field of mud as his are (`core/sollmeldon.js`), settled once and holding still,
  drawn as his are (`render/mud.js mudSheet`) (`game/muddy.js`). Decided at the very end of a
  cube on a random stream of its own: worlds without mud come out as they did.
- **Dev:** `?palette=classic` (the old look) or `?palette=<seed>` (another world's),
  `/palette [seed|classic]` re-rolls them live and names the ones here;
  `tests/browser/palettes.html?seed=<n>` shows a world's palettes. **Checks:**
  `tests/fluidcolors.test.js` (in gamut, hues per fluid, stretches) and `tests/sweeps/fluids.js`
  (one colour per fluid in a cube, the same across every face and down every fall).

## Themed structures (`themes/builds.js`, `render/bridges.js`)

- **Materials per theme:** each theme (by its prop set) names the stone, wood, rope, iron and
  (where it builds ice bridges or vine ladders) ice and vines its structures are made of. Stairs, landings, bridges,
  fences and ladders use shades of those; natural rock arches take the ground's own rock and
  grass. Examples: grey stone and dark wood in the peaks, sandstone in the badlands and
  ruins, mossy wood in the swamp, basalt and iron in the volcanic depths.
- **Bridge styles** (`BRIDGE_STYLES`):

  | Style | Look | Where |
  |---|---|---|
  | `stone` | arched deck with parapets, piers between the arches (down to a river's bed) | ground or a fluid up to 8 units below, nothing else underneath; never over a void or the sky |
  | `plank` | sagging planks, posts with rope rails, timber legs | anywhere |
  | `rope` | spaced slats, a post at each end, rope hand lines, deep sag, no legs | anywhere |
  | `iron` | flat girder deck, railings, bracing | anywhere |
  | `log` | three logs side by side reaching onto the banks, lashed, a rope hand line | ordinary bridges of 1–4 cells, never a span |
  | `chain` | plank deck hung by rods from two chains between iron towers | 2 cells or more, room for the towers over both ends |
  | `ice` | a slab of ice, shards along its edges, icicles under it | anywhere |
  | `rockarch` | one rough natural arch of the ground's rock, grass on top, its feet on the ground (a river's bed) | like `stone`; on a span only a level one |
  | `flags` | a rope bridge with tall poles and strings of prayer flags along and across it, fluttering in the wind | room for the poles over both ends |

- **Style mix:** each theme weights the styles (`BUILDS[theme].bridges`):

  | Theme | Bridges | Theme | Bridges |
  |---|---|---|---|
  | meadow | stone 1, plank 1, rope 1, log 2 | roots | log 3, plank 1, rope 1, stone 1 |
  | clouds | rope 3, chain 1, stone 1 | frozen | ice 3, stone 1, plank 1 |
  | lagoon | plank 2, rope 2, log 1 | grotto | plank 1, rope 1, rockarch 2, log 1 |
  | karst | stone 2, rockarch 2, plank 1, rope 1 | swamp | log 2, plank 2, rope 1 |
  | peaks | stone 2, rope 1, flags 1, chain 1, ice 1 | hive | plank 2, rope 1, stone 1 |
  | highlands | flags 3, rope 1, stone 1, log 1 | cenote | rope 2, stone 1, log 1, rockarch 1 |
  | badlands | plank 2, rockarch 2, stone 1, rope 1 | nests | rope 3, plank 1 |
  | saltflats | plank 2, stone 1, rockarch 1, rope 1 | ossuary | stone 4, plank 1 |
  | canyon | rope 2, plank 1, rockarch 2 | mines | plank 2, iron 2, chain 2, stone 1 |
  | ruins | stone 4, plank 1 | forge | iron 2, chain 2, stone 1 |
  | volcanic | iron 2, rockarch 2, chain 1, stone 1 | abyss | iron 1, chain 2, stone 2 |

- **Where a style may go:** `BRIDGE_STYLES` (`themes/builds.js`) says for each style what it
  sounds like underfoot, how far it sags, what holds it up (piers, timber legs or nothing) and
  where it fits: only over ground or a fluid close below (arches), across the open sky or not, on a
  span or not (and only a level one), how long an ordinary bridge it makes, and how high its
  towers or poles stand. Those only go where nothing is over both ends (`roomOver` in
  `cubegen/shape.js`: no floor, structure or landmark overhang); a span's cubes have one
  layer, so nothing is over a span's ends. A bridge picks among the theme's styles that fit,
  by weight (plank if none does); the generator, the span planner and the footsteps all read
  the same table. Bridges of any style may cross lava. The weights are tuned against what
  actually gets built (the arches and chains fit fewer bridges than the others): over a few
  seeds each theme's own styles come out close to their share, the ruins and the ossuary
  about two thirds stone.
- **Dev:** `?bridge=<style>` (with `?dev=1`; `new World(seed, { bridge })` in tests) builds
  every bridge in that style wherever it fits. `/bridge [style] [depth]` stands you at the
  next bridge (of that style) from this depth (or that one) on down.
- **Checks:** `tests/builds.test.js`: every style has a builder and a surface, every theme
  has a style that fits wherever a bridge goes, picks keep to the styles that fit, the new
  styles only where they fit in generated worlds (lengths, spans, room for towers, no legs)
  and drawn, and themes building their own (logs in the roots, ice in the frozen caves,
  flags in the highlands).

## Ladders and jumps (`cubegen/climbs.js`, `physics/climb.js`)

Routes can now also use these moves:

- **Ladder:** up or down a cliff face of 3–14 levels between neighbouring columns. The
  ladder stands in the lower cell against the higher column's wall.
  - Both floor edges are pinned flat, so the ladder meets them exactly, and fences stay off
    them.
  - The ladder claims the space in front of the wall. One hanging from a floating platform
    also claims the air under the platform behind it, so no bridge or stair runs through the
    ladder there (or leads straight into it).
  - You get on by pushing into the wall at its foot, or by walking over the edge above it.
  - Pushing towards the wall climbs, pulling away climbs down, and Space lets go.
  - At the top you step onto the upper floor.
  - There is no climb animation yet: the walk cycle stands in.
  - **Styles** (`LADDER_STYLES` in `themes/builds.js`, drawn by `render/ladders.js`): every
    style keeps its rungs or holds where the wooden ladder has them (0.28 apart from a
    quarter over the foot), so the climb meets them.

    | Style | Look | Hangs free |
    |---|---|---|
    | `wood` | two rails and rungs, a little over the top | yes, at a quarter of its weight |
    | `rope` | rope sides, wooden rungs, a slight bow, over the edge to two stakes | yes |
    | `vine` | two or three twisting vines with leaves, loops to step on, a tuft over the edge | yes |
    | `iron` | U-shaped rungs bolted into the rock, two grab handles over the edge | no |
    | `footholds` | holds cut into the rock left and right in turn, a chain from a peg on the edge | no |

  - **Pick:** among the theme's weights (`BUILDS[theme].ladders`) the ones that fit; a
    ladder hanging from a floating platform only takes the styles that can hang (rope if none
    of the theme's can). The roll is a hash of the cube's seed and the two floors
    (`ladderStyle` in `cubegen/climbs.js`), not the generator's random stream, so the rest of
    the cube does not change with it. The style is on the map's ladder (`style`).

    | Theme | Ladders | Theme | Ladders |
    |---|---|---|---|
    | meadow | wood 2, rope 1 | roots | vine 2, wood 1, rope 1 |
    | clouds | rope 3, wood 1 | frozen | footholds 2, iron 1, rope 1 |
    | lagoon | rope 2, wood 1, vine 1 | grotto | rope 2, vine 1, wood 1 |
    | karst | vine 2, wood 1, footholds 1 | swamp | vine 3, wood 1 |
    | peaks | iron 2, rope 1, wood 1 | hive | wood 2, rope 1, footholds 1 |
    | highlands | wood 2, rope 1, footholds 1 | cenote | vine 3, footholds 1, rope 1 |
    | badlands | wood 2, footholds 2 | nests | rope 3, footholds 1 |
    | saltflats | wood 2, footholds 1 | ossuary | footholds 2, wood 1 |
    | canyon | rope 2, footholds 2, wood 1 | mines | wood 2, iron 2 |
    | ruins | footholds 3, wood 1, rope 1 | forge | iron 3, wood 1 |
    | volcanic | iron 2, footholds 2 | abyss | iron 2, rope 1, footholds 1 |

  - **Dev:** `?ladder=<style>` (with `?dev=1`; `new World(seed, { ladder })` in tests) puts
    that style wherever it fits; `/ladder [style] [depth]` stands you at the foot of the next
    one. Checks in `tests/builds.test.js`.
- **Jump:** over one or two cells of open drop (or void).
  - The target is at most 1 level higher and at most 2 lower. Over two cells it must be
    exactly 2 lower, for the time in the air.
  - There must be level run-up ground behind the take-off.
  - The air over the gap is claimed, so no structure crosses it.
  - Jumping while moving is a leap of at least 3.4 units/s.
  - Routes keep a take-off waypoint for the test bots.

## Props (`render/props.js`, `render/propplace.js`)

Decoration comes from `assets/props/` (133 models), `assets/clutter/`
(222 additional models) and `assets/themes/` (374 models for the alternative themes, see
[the theme library](assets/themes.md)). Each theme names its prop set (`props`); neutral `any_*` rocks are
tinted with the theme's rock colour. Placement runs on the main thread when a cube's meshes
are built, seeded by the cube. It draws from the catalog (`core/propcatalog.js`), which knows
every prop from its metadata, so placement and colliders never wait for a download; the
geometry is one file per library and prop set, loaded with the cube's enemy models before the
cube is entered (`render/cubeassets.js`, `WorldClient.get`; the cubes behind the portals are
asked for early, and theirs come along, see "Off the main thread" below). One factor, `CLUTTER` in `core/propcatalog.js` (0.75), scales
every scatter pass below, the guardian arenas' cover and loose things and the town's ground
cover; authored set pieces keep their count.

- **Ground props:** on dry floors without structures, only where they fit under the floor
  above.
- **Blocking props** (trees, boulders, columns): never in or next to route columns or near
  portals. They get round colliders (`map.blockers`) that the player and the spiders respect.
- **Ceiling props:** not placed; slab undersides are never visible from the camera.
- **Wall props:** fit within exposed cliff faces.
- **Cover:** a separate dense, non-blocking pass on dry terrain, including routes and
  slopes; tilted to the floor normal. Glowing cover is emissive only.
- **Shore:** only beside fluids; **water props:** only on matching fluid surfaces.
- **Lip props:** drape over cliff tops with sufficient hanging clearance.
- **Signature assets:** reserved for deliberate destination recipes, not uniform scatter.
  So are the theme library's landmarks (bigger than a cell; reward sites place them, see
  below) and string segments (`line`: the dark forest's strings of lanterns, its grove ties them), and the
  vignettes (placed by `cubegen/vignettes.js`).
- **Grove:** a theme with a `grove` (the dark forest) gets its trees in thickets and clearings,
  on a random stream of its own (see "The dark forest").
- **Lamps by the way:** a theme with `waylights` (the dark forest's lantern posts, the deep's
  lanterns, candelabras, braziers) puts them beside the way, on the far side of the floor, only
  their foot in the way (`docs/lighting.md`, "Light in the deep").

They are drawn as one instanced mesh per prop (and per material part), with per-cube
material clones so they fade and get cut with their cube. Props with `sway` bend in the
wind in the vertex shader. Every glowing prop gives off light, a fixed light of its cube with a
baked shadow (`docs/lighting.md`): landmarks and vignettes first, then the brightest, should a
cube ever have more than it takes.
A fire's light flickers with its flame; a prop's `flicker` makes its light flicker like a flame
(lanterns, candles) or breathe slowly (`pulse`: glowing mushrooms, runes), and its glowing parts
with it (a shader patch, `glowMaterial`). A placement may carry its own `matrix` instead of
x, y, z, yaw and scale (a string's sheared segments).

## Waterfall grottos (`cubegen/grotto.js`)

Behind some tall clear-water falls a small cave is hidden, in the cube itself, with an uncommon
chest at its back. The only hint is the curtain: its stream is two cells across, the only stream
that is, and it comes down broader than usual (1.9 units across instead of 0.9). Nothing else marks
it, and the cave is closed all round, so it shows from nowhere but through the falling water.

- **Which falls:** a stream's water fall (not one into the cube below or across a face) that drops
  at least 7 levels into its own pool, where that pool has a shore somewhere (dry ground level
  with it or a level over it, under the sky: not a pool down a pit). Not in trial rooms, the
  beginning's third room, the town or the guardian arenas. The first fall that fits gets the
  cave, at most one a cube. Over 4 worlds about seven cubes a world have one.
- **The stream two across:** the floors beside the stream on one side (either, `+1` first) are
  flooded to its surface all along, as a pool is (`cubegen/pools.js`): dry ground of its layer,
  none of it kept (as below) or on the outer ring, a slab thick enough, walled in all round. Its
  new lip has to pour clear into the pool beside the fall's cell (water level with it there,
  nothing in the way of the curtain). A fall that cannot have it gets no cave. The fall is then
  a wide one (`side`, `core/falls.js`): it pours from both cells, its curtain hangs between them
  (`render/parts.js`, its foam with it, `render/falls.js`), and everything that knows where a fall
  comes down (containment, structures, its push, its sound) takes both cells.
- **The cave:** level with the pool, its mouth right behind the curtain: across both its cells,
  with a room of two by two or one cell behind; else behind one of them, with a room of three
  across behind the mouth or a passage of two. Over it the rock (or the slab the fall pours
  off) stays as a roof `ROOF` levels up (`cubegen/tunnel.js`, a `roof` like a tunnel's: the
  cutaway opens it like a slab, `game/cutinfo.js`, and it does not count for its layer's cut
  height). Where the cave lies under an overhang, the slab round it is brought down to the
  ground as a hill pokes up into one (`cubegen/slabs.js`): rock all round but at the mouth. Only
  dry ground and the pool's own water give way to it; portal pads, sites, a horde's camp, ramps,
  tunnels and the big pieces' cells stay as they are, and the cube's outer ring is never touched.
- **When:** after the fluids are settled and before their shores (`carveGrotto`), so the moves,
  routes, escapes and checks that follow know it; no structure is built in it (`noCross`). It
  draws nothing from the generator's random stream: a cube without a cave comes out exactly as
  it would without the stage (`spec.grotto: false` leaves it out, for the tests).
- **The chest** (`finishGrotto`, once the cube is checked): an ordinary uncommon reward site of
  its own beside the planned ones (`setting: 'grotto'`, id `<cube>:grotto`), at the back, facing
  the mouth, its approach in the mouth. Its cells are reserved (no props), its floors take no
  enemies (`noSpawn`). Opened chests are kept with the run, so it is opened once. A cave that
  cannot be got to and back from the portals stays empty, behind a curtain like any other but as
  broad as its stream (rare: 4 in 27 over 4 worlds).
- **Through the curtain:** a fall's current pushes whoever stands in it out (`physics/hazards.js`);
  this one does not, so you wade or swim through it. A respawn never puts anyone into a cave they
  were not in (`physics/respawn.js`).
- `map.grotto`: `{ fall (its index in map.falls), cells (the mouth first), site, front }`; `front`
  is a place in the pool before the curtain, facing it, not under a bridge (`swim` where the
  water is deep).

Dev: `/waterfall` makes the cubes after this one in turn (this depth on down, then round from the
first) until one has a cave, and puts you at its `front`; again: the next one. `?dev=1&seed=99`,
`/goto 2 3,3` is one. `tests/waterfalls.test.js` checks the cave is closed, flat, roofed and
level with the pool, the stream two across with both cells pouring clear into the pool, the chest
reachable, cubes without one unchanged, and click to move gets from the pool into it.

## Reward sites (`world/sites.js`, `cubegen/sites.js`)

Each stratum budgets four optional destinations, preferring branch cubes: two basic,
one uncommon, and one rare (occasionally exceptional). Prestige and site identity are
fixed before terrain retries and are independent of asset loading. Larger prestige
reserves more space; difficulty/encounter selection is a separate concern.

The rare (or exceptional) one is built around one of the theme's **landmarks**
(`assets/themes/`, see [the theme library](assets/themes.md#landmarks)), chosen with the plan:
the next depth of the same theme gets the theme's next landmark. The site is laid out by the
landmark's role: a shrine with the chest in front of it, a gate with the chest behind it (the
way in leads through), a camp or monument beside the chest. Landmarks face the approach and
stand on quarter turns. Their colliders (boxes derived from the mesh) block the site's cells
the character could not stand on, and of two free neighbours with a wall between them the one
nearer the wall, so the route search only uses ground the character can walk; under a
landmark's overhangs no structure is built. The map gets the colliders, occluders for the
cutaway and `rewardSites[].landmark` (its place, turn and flag anchors). Landmarks also show
in the low-detail surroundings. Over 3 worlds, 56 of 57 landmark sites come about
(`tests/landmarks.test.js`).

Mines have storage rooms, galleries and excavation pits; ruins have burial alcoves,
halls and courtyards. The generator reserves their interior footprints before slabs,
shapes terrain, routes to an interaction approach and back onward, then validates the
final slopes, fences and structural blockers. Required portal routes remain intact.
Upper-layer destinations leave shared rivers and cascade shafts undisturbed.

`map.rewardSites` exposes stable spawn IDs, prestige, setting, reward anchors and
approach/floor records. `sitePlacements` contains deliberate dressing and the sites'
chests, with worker-authored `staticBlockers`. Chests are collidable; clicking one
walks up and opens it, and it spills its loot ([loot.md](loot.md#chests)). Ambient blockers and clutter stay out of these reserved spaces.
Optional placements that cannot fit are reported in `siteFailures`, never downgraded.

See [the generation plan](generation-plan.md) for subsequent biome/district work.
Run `await (await import('./tests/browser/generation.js')).runGenerationChecks()`
in game devtools for real worker, asset, shader and collision checks.

## Generator changes

- Input is a spec (`world.spec(k)`) instead of a seed. Retries vary the seed but never the spec.
- Ground blends from the four face profiles into local detail, hills and plateaus.
- Upper-layer slabs are kept off the outer ring except at portal pads.
- Ramps and pools never modify the outer ring.
- Rivers start at their face crossings and meet at a junction. A lone river ends in a pool;
  lake cubes get a lake.
- Every fluid is walled in: whatever lies next to it reaches its surface, except where a fall
  spills on purpose (`cubegen/contain.js`). Face cells beside a river crossing are never
  void. On the ground, void or low cells next to water become banks (`bankGround`). Ground
  pools keep a dry rim instead of touching other water or the void. Upper pools and stream
  channels thicken their bank slabs down to their own bed, or are skipped. A last pass
  before routing turns any fluid that still stands above its neighbour into ground up to its
  surface (`containFluids`). `tests/sweeps/fluids.js` checks it with the renderer's heights;
  corner smoothing may still sag a bank by up to a level.
- **Water is level with its shore**, walked into and out of: a pool's surface stands level with
  its lowest bank (`cubegen/river.js`, `pools.js`, `streams.js`, `cascades.js`, a guardian's pond,
  the town's), and ground beside any water a level over its surface comes down level with it, on
  the ground layer, inside the outer ring (`shoreWater`, `cubegen/escape.js`): not a portal pad, a
  site, a spot, a horde's camp, a ramp or a kept cell, nor ground beside higher water, nor a ridge
  with lower ground behind it. No slope runs from a bank down under the water beside it
  (`underWater`, `cubegen/smooth.js`): its corner would sag under the surface.
- **Water** is waded along its banks and swum in its middle (the hero wades and swims:
  [combat.md](combat.md#fluids-and-falls)): every water cell beside a bank, or any other ground (on
  one of its four sides), has its bed a level under the surface, waded through; those with water on
  all four sides keep theirs two levels under it, deep enough to swim (`shoalWater`,
  `cubegen/escape.js`; a bank only across a corner leaves a cell deep). So a lake or a pool is deep
  in its middle, a river of three cells or more down its middle, a narrow river not at all. Water
  spreads wider than lava or acid (`WIDER`, `cubegen/river.js`: its pools, lakes and the pools under
  a stream's fall, `cubegen/pools.js`, `streams.js`, have a radius 0.6 cells bigger), so most
  bodies of water have deep water to swim in; every one of them still has a way out (below,
  "Ways out of the water"). Lava
  and acid keep their beds (deep or not, they kill), as do trial rooms' fluids and arenas'. Corner
  smoothing keeps a low bank's corners next to water (a level over it or less) no higher than its
  level, so a slope up from the water starts where a swimmer reaches (`lowBankAt`,
  `cubegen/smooth.js`).
- Routing is described in "The way down" below. Moves already used are cheap, so routes
  share paths. Each route is kept for test bots and the path overlay (P).
- Drops are capped at 8 levels (deeper ones ragdoll you) and need an extra level of headroom.
- Lake cubes and half of the underground cubes get floating islands (no pillars).

## Guardian descents

Every descent at depths 0–19 has an amber descent guardian, explicitly marked as a
future boss placeholder (players see it as the "Temp Boss" of its species), or a real boss.
Every approach also has one or two hot-pink sideways guardians ("Guardian" and their species).
Their dry arenas contain twice the normal local population. Guardian death alone
permanently unlocks the corresponding red side gate or well for the current run.
Defenders coordinate to intercept the approach while it lives.
See [guardian mechanics, generation and checks](guardians.md).

## The way down (`cubegen/route.js`, `cubegen/reach.js`, `cubegen/escape.js`)

The world guarantees that from anywhere you can arrive, you can get to depth 20.

- **Exits:** the layout gives every cube an exit, the portal one step closer to the well
  down along the depth's portal links (`layout.exit`). The well cube's exit is the well, the
  town's is its road, and the core leads to its centre. Exits depend only on the seed.
- **Routes:** a required route from every other portal (the spawn and the up ring included)
  to the exit, then a best-effort route from the exit back to each portal. Drops and
  downhill jumps are one-way, so a portal may only be reachable from one side.
- **Optional structures:** structures needed only by the ways back or escapes are left out
  when they do not fit, together with the routes that needed them.
- **Final check:** after smoothing and fences, `reachTo` rebuilds what the character can
  physically do:
  - walk level ground and slopes, jump up one level (and back over a one-cell gap it jumped
    to a floor within a level), drop down any cliff without a fence;
  - swim, and climb out of water onto a bank up to a level over its surface (with the final
    slopes, the middle of the bank's edge at most a swimmer's step over the feet: `SWIM_STEP`
    from `SWIM_FEET` under the surface);
  - use the built structures both ways.

  Every portal must reach the exit, and no route may pass a floor whose smoothed corner
  leaves less than the character's height under the slab above. Nobody who can get into a
  water may be stuck in it: from every water floor got to, some floor out of the water must be
  got to (`stuckInWater`; trial rooms aside, their fluid is the trial's). Otherwise the attempt
  is retried.
- **Ways out of the water** (`addWaterEscapes`, `cubegen/escape.js`): a body of water the hero
  can get into (they swim) whose banks all stand more than a level over its surface gets a ladder
  up out of it, standing in the water against the bank's wall: onto the lowest bank that leads to
  the exit, else onto any (whose own way on the escapes after it find). It is a move of its own
  (not a route: the routes keep out of the water) and dropped like the escapes when it does not fit.
  Its `map.ladders` entry carries the water's surface (`wet`): it is taken hold of swimming
  (`physics/climb.js`), and climbing down it lets go into the water. `tests/sweeps/water.js` checks
  that no cube's water traps anyone, that a quarter to half of it is deep, and that a swimmer anywhere in it
  gets out with a click.
- **No jump after a drop:** a route never jumps right after dropping the same way, because
  the fall carries you into the gap.
- **Fall landings:** `fallMask` marks where you can fall in from the cube above (its void
  field, a cell wider). Up to six landings there that do not lead to the exit get an escape
  route (stairs, ladders, bridges). The map's `safe` flags mark floors that lead on.
  `fallPoint` moves any dry landing that still does not (sealed pits) to the nearest one
  that does. Landings in a fluid are kept (and fatal), with a dry death entry nearby.
- **Before:** routes ran from the first portal to the others, so drops made them one-way
  in the wrong direction. 7.7% of portals could not reach the way on, and none of 12 test
  worlds could be finished; four of them trapped you in the town. Now 64 of 64 test worlds
  reach depth 20 from the town (Node check over all 21 depths, about 3 ms per cube, 1.07
  attempts per cube on average).

## Cutaway (`game/cut.js`, `render/section.js`, `render/cutshader.js`, `render/ghosts.js`)

The overview's. The close view behind the hero has none: its camera stays out of the solids,
and the walls stay up (`docs/camera.md`).

- **When and how deep:** rays from the character to the camera find what hides it, and the
  cut height drops just below that (`game/cut.js`).
- **The shape:** a nine-cornered polygon on a circle 2.8 units around the character on
  screen. The corners sit at irregular angles and the shape turns slowly (0.18 rad/s). The
  edge is hard; there is no dither.
- **What gets cut:** everything above the cut height, closer to the camera than the
  character and inside the shape, is discarded.
- **What you see instead:**
  - The back faces of cut solids show as a flat section cap, one colour per kind of solid:
    the rock strata at the cut height, the structure stone or the wood, a little darker than
    a lit floor. One colour keeps the inner faces from reading as a see-through hollow.
  - Fluids get flat caps.
  - What was removed (terrain, structures, props) is drawn again as very faint glass: a
    twin of every cut solid that shares its geometry, draws only inside the cutaway, writes
    no depth and grows a little more opaque at grazing angles, so the shapes read. There is
    one glass material per cube, because fading patches materials per cube.

## Travel and what you see (`game/travel.js`)

Walking into a portal does not cut to black. The next cube is built beside the current one
(or `CUBE_H + BASE` below or above it). Both slide past the fixed camera while the
character walks through the gate, falls down the well or rises up the ring.

Wells down and rings up have to charge first: the player must stay in the circle for
0.75 s going down or 1.5 s going up (`portalChargeDuration`, `game/portals.js`) while a
white bar fills over the portal (`render/portalbar.js`). Stepping out resets the charge.

The new cube is active from the first frame. The player moves in its coordinates plus the
slide offset, so when the slide ends the offset is zero and nothing jumps. The section cut
is off during the slide.

What is in the air slides along: the shared particles (fireflies, embers, sparks:
`render/particles.js shiftParticles`) and text standing at a point (damage numbers:
`render/floattext.js shiftFloatText`) move by as much as the cubes each frame, and the
enemies' effects at a point of their cube are emitted where the cube is drawn
(`render/enemies.js here`). What keeps a place of its own in the air and emits particles
there every frame (the wisps, `render/motes.js`) rides along with the particles
(`render/particles.js rideAlong`). A cut to another cube behind the curtain (doors, the town
portal, `game/flow.js enterCube`) drops all of it instead: it was in the old cube's place.

A side portal into a cube that is not drawn yet (no low-detail proxy on screen) would have
the character walk over nothing until the new cube fades in. Instead a dark blue cloud
spills out of the gate as the travel starts (also covering a cube still generating). The
new cube then fades in 0.4 s later than usual (`CLOUD_DELAY`): the walk keeps its pace and
the character waits on the cloud for that long. The cloud dissolves over 0.45 s once a
quarter of the new cube is there, if need be after the slide has ended
(`render/portalcloud.js`). Cubes whose proxy is visible cross-fade on their own and get no
cloud.

Respawn entries are separate from live crossing positions: airborne crossings still
preserve height and motion, but their saved entry is snapped to dry, supported ground
(`physics/respawn.js`). Death, recovery and returns from falls revalidate the point,
including body clearance and support around the feet. Unsafe entries move to the
nearest valid floor or structure rather than repeating a fall through the void.
Run `await (await import('./tests/browser/respawn.js')).runRespawnChecks()` to check
void/non-finite entries and both death and recovery after a fall.

### Town portal (`game/townportal.js`)

The Town Portal Scroll (quick bar slot 1) opens a two-way portal to town:

- **Casting:** using it starts a 5 s cast (`CAST_TIME`, `core/townportal.js`). A violet bar
  floats over the player and fills the scroll's quick bar slot. Moving, jumping, a mouse order,
  attacking, taking damage, being knocked over, falling, swimming, climbing, travel, opening the
  inventory or using the scroll again cancels it. It cannot be cast in town; anywhere else
  (guardian rooms included) it can.
- **The pad:** a finished cast opens the portal on free ground around the player, best 1.6
  cells in front, else nearer, farther (up to 2.7) or to the side, down to right beside them
  (just out of its trigger; `padOffsets`, `core/townportal.js`). Its whole disc (radius 0.62)
  must be dry, flat, supported, on the player's level, off the cube's own portal pads and
  reachable in a straight line, so a 1.5 x 1.5 cell spot is enough. The room is checked when
  the scroll is used: if nowhere fits, "No room for a portal here" and no cast starts (and
  again when the cast ends). The run keeps one portal, `run.townPortal = { key, depth, pad, back }`, where
  `back` is the exact spot the player cast it from. Casting again moves it.
- **Town end:** the plaza's tile (`PORTAL_TILE`) reserves a fixed spot for it, west of the street
  across from the crash (`TOWN_PORTAL_SPOT`, `world/town.js`, rotated with the exit). Clutter
  keeps off it and town generation checks that it is dry and reachable (`map.town.portal`).
- **Going through:** either end works like a well. Stand in it for 1 s (with the white charge
  bar) and the screen fades (no slide, the cubes are not neighbours). You arrive in town 1.4
  cells from its end, towards the middle of the plaza, and the portal stays open. Through the town end you
  arrive exactly where you cast it, and **both ends close**. Each arrival starts a new visit
  (`enterCube(c, null, null, at)`), so a death respawns you at the arrival point.
- **Drawing:** `render/markers.js townPortalFx` draws a violet swirl under a light column. It is
  added to a built cube (`render/world.js setTownPortal`) on casting, rebuilds and travel,
  fades with its cube and uses a pooled light. Respawn points keep off it. The minimap shows a
  violet dot at both ends and "portal open: depth N".
- A new world (`N`) closes it.

Run `await (await import('./tests/browser/townportal.js')).runTownPortalChecks()` to check the
quick bar, assignment, the cast and its interruptions, both trips and closing.

### Getting unstuck (`physics/unstuck.js`, `game/roomportal.js`)

- **Wedged:** the controller should never walk the body into anything, but knockbacks, gusts,
  ragdolls, moving villagers, jumps into low blockers and concave corners (the rim probes of
  `canMove` can leave the body overlapping two walls, so every move fails) still wedge it.
  The body counts as wedged with something solid through its middle (`blockedAt` up to 0.45,
  so a low ceiling over the head does not count) or when it cannot move 0.06 in any of the
  four directions. Not while rising or falling, on a ladder, in a ragdoll, between cubes or in
  a fall through cubes. After 0.3 s (`WEDGED_TIME`) it is put on the nearest spot it stands
  freely on, within 2 cells, on its level, a step up or on top of what it is stuck in (1.5 up
  or down at most), preferring floors that lead out of the cube (`map.safe`); with none of those
  close by, at the last safe spot; failing that the nearest free spot at all. No countdown
  and no message.
- **The last safe spot** (`player.safe`, `physics/hazards.js`) is only taken from floors that
  lead out of the cube (`map.safe`), never from the bottom of a pit.
- **Room Portal Scroll** (quick bar slot 6, bound, never used up): the way out of a place you
  cannot leave on foot. Using it starts a 3 s cast (`ROOM_PORTAL_CAST`, `core/items.js`) that
  moving, jumping, a mouse order, attacking, taking damage, being knocked over, travel,
  opening the inventory or using it again cancels, as does falling more than 1 or drifting
  more than 1 cell away. Unlike the town portal it needs no firm ground (it works in a pit,
  on a ladder, or wedged), and it works in town and houses too. Then the screen fades and you
  stand where you came into this cube (`state.arrival`), with your health and conditions as
  they were; the cube is not reset as on a death. Portals and open faces at the arrival point
  wait until you step out of them (`lockPortalsHere`).
  Playing together it is the Teleport Scroll and can take you to a friend as well (see
  `docs/online.md`).

### Opened side connections

A shared side face opens as soon as the cubes on both sides have been discovered
(`discoveredFaces` in `core/boundaries.js`), whether or not it has a gate or that gate
has been crossed. Neighbouring rooms reached by different routes can be walked between.
Opening is tracked explicitly by `faceKey` for the current world. A progression section
is a route room plus its branches (`routeIndex`). Two sections without a portal between
them join only over ground already covered (`sectionsJoined`): every route room between
them discovered, and none of their forward exits still guarded. So a route that bends
back alongside itself opens up once walked, but rooms first reached by a fall or the town
portal cannot skip unseen rooms or guardians. Locked guardian faces never open through
discovery. Some rooms join their neighbours only through their own portals (`portalsOnly`):
- an annex, always
- a trial room until its trial is resolved; from then on its other faces open like any room's
- the town with what lies round it: only its gate joins them (the faces between its own tiles,
  its seams, open as the town is known, from the start: "The town" above)

Their glass box glows orange (below). Discovering a cube or unlocking a gate re-checks every discovered cube, since
either can join sections elsewhere. On an opened face both gates and both dividing glass
panes disappear; cube outlines remain. Re-entry, mesh rebuilds and low-detail proxies use
the same opened-face state.

An opened side face is **walked across** anywhere along it, regardless of the original
portal's position or layer, with no slide: the slide is the first view of a cube, through its
portal; a cube already visited is simply walked into (`game/handover.js`, the same as the
town's seams, "The town" above):

- **The physics reads the cube beyond.** The sides of the cube played in that are walked
  across now (`crossable`: the town's seams and the open faces, set every step with
  `physics/collide.js setAcross`) let the body past them: up to a cell past one, ground,
  structures, blockers and ceilings are the neighbour's own, read from its map
  (`physics/collide.js locate`, `spotAt`), so a body crossing, half in the next cube, stands
  and moves as it would there. Solids past the side block the way like any wall; a walking
  body is kept on a stair or bridge lying along the side (its side rail, `physics/canmove.js`),
  a jump goes over it. `cellAt` only ever knows its own map. Loot rests in its cube
  (`physics/rest.js`), and the last safe spot is only taken inside it.
- **Once the hero's middle is `PAST` (0.25) beyond the side the cube beyond takes over** at
  once: it becomes the cube played in (discovered, its visit begun, its enemies put in, what
  the narrator says on arriving, the robot along: `game/flow.js settleIn`), and the hero, what
  is in the air and the planted feet move by a cube's width, so nothing on the screen jumps.
  Back the other way it is `PAST` again, so walking along a side does not hand over and back.
  The cube is got ready ahead (`game/flow.js readyAhead`, and its bake made ahead,
  `game/bakeahead.js`); until it is, the hero stands past the side. Not in a swim out of the
  water (they stand on past the side until it is over); during a fall through cubes no side is
  walked across.
- **What is seen**: the cube left dissolves into its proxy and the one taken over out of its
  own (`FADE`, 0.3 s), where they stand (complementary dither, as in the slide), its enemies
  with it. The overview pans over from where it looked to where it looks now in 0.7 s
  (`game/camera.js panCamera`), so the view does not jump a cube's width, nor lurch walking
  into or out of the town; in town it follows the hero anyway (no pan).
- **What keeps the side shut**, as a wall: travel, a fall through cubes, a trial room sealed
  (`game/trials.js sealedOut`), a guardian's gate locked, a guardian still standing in its arena,
  Umbra's water (the diving suit), Flip's box turned. Steering out over it says why (`game/portals.js`), or asks whether
  to leave the fight (`game/leavefight.js`); leaving goes through with the slide.
- **Click to walk**: the floor under the cursor is found on the ground of a cube beyond a side
  walked across too, when the ray meets none in the cube (`game/pointer.js pickFloor`); the
  hero walks up to that side, across from the spot, on over it like into a gate, and on in the
  cube beyond to the spot clicked (`game/orders.js orderAcross`, `carryOrder`).

The minimap marks opened connections as green lines along their faces; unopened portals
retain gold/cyan markers, or red crossed seals while guardian-locked.

Cubes remain separate simulation spaces: only the cube played in is simulated, and enemies
cannot cross their boundaries (their walks know their own cube only: `physics/enemynav.js`).
Generation, portal metadata, routing and arrival-safety logic are unchanged; opened
connections simply add paths. Down/up travel always uses portals, except falling through
voids, and never opens a side connection. Starting a new world clears all opened faces.

Checks: `npm test` includes shared-face identity, the body stepping into the cube beyond (and
not past a corner, a cliff or a rail), enemy containment and the town's seams. From the
browser's devtools, run
`await (await import('./tests/browser/boundary.js')).runBoundaryChecks()` for
all four side orientations: the first crossing's slide, walking back across (no slide, no jump,
no bounce), a click across, rebuilds, airborne crossings, a solid past the side,
generation failure, reset, gated neighbours discovered by another route and vertical travel. `runModifierKeyChecks()` in that
module checks the Ctrl (walk) and Shift (auto-attack) modifiers and input clearing; the movement
ramp and auto-attack themselves are checked by `runControlChecks()` in `tests/browser/combat.js`.

While sliding, the old cube dissolves out and the new one dissolves in (`render/fade.js`).
The dissolve is an ordered-dither discard per cube, so depth and sorting stay intact.

The cube you leave cross-fades into its low-detail proxy, and the cube you enter out of
its proxy (if you had been there). The two use complementary dither patterns, so one draws
exactly the pixels the other drops. Every cube, full or proxy, sits in its own glass box
(`render/glass.js`) that moves and fades with it (`game/travelfx.js`), with panes omitted
on opened side connections.

The player always looks through that box, so it is drawn to be read without being in the way:

- **Edges** are thin strips widened on screen in the vertex shader (WebGL lines are always one
  pixel wide and alias), a world width held between 1 and 1.5 CSS pixels, with a soft falloff on
  either side. They are a little stronger near the corners of the box's outline and fainter along
  their middles. Edges and corners inside the outline (seen from above: the top corner nearest the
  camera and its three edges, right over the play area) are fainter still and get no stronger
  corner. The full cube's edges sit a few depth steps ahead of its cut caps
  (`render/section.js CAP_AHEAD`), or the bottom of the box breaks up into dashes.
- **Panes** (only the side panes, from the inside, so only the far ones show, behind the
  terrain) are a touch denser along their rims and nearly clear in the middle: an edge reads as
  the rim of a pane of glass, not as a line drawn over the world.
- The numbers are `GLASS` in `render/glass.js`, the same for the full cube's box and the
  proxies' (at 0.6 strength).
- **A room that joins only through its portals** (`core/boundaries.js portalsOnly`: an annex, a
  trial room until it is resolved) glows a warm orange instead, its edges and panes stronger
  (`setGlassShut`, `shut*` in `GLASS`). Its faces are walls however well you know the rooms
  around it, and the box says so. For a proxy it is the instance's `aFade.w`.

The minimap and the low-detail surroundings only show cubes you have visited; prefetching
never discovers a cube. There are no exceptions ("Only where you have been"). Surroundings include diagonals and distant cubes on the active
stratum, within 48 world units (three cube widths) of the player's horizontal position.
Distance is measured to cube bounds, with an eight-unit dither fade at the outer edge.
`core/viewdistance.js` holds the radius and discovery selection.

A cube is drawn from parts (`render/parts.js`): terrain, structure stone, wood, prayer flags, a
surface per fluid and the falls of each fluid. The flags part (`sway`) carries a uv per vertex,
how far it swings (0 where a flag hangs from its string, 1 at its lower edge); the active cube
flutters them in the wind in the vertex shader (`swayMaterial`, `WIND` in
`render/materials.js`), the proxies and the shadows keep them still. The worker packs each part once: merged over the layers,
indexed and quantized (Int16 positions at 1/1024 units, Int8 normals, Uint16 colours, all padded
to four components): about 20 bytes a vertex and 1.6 vertices a triangle instead of 36 bytes and
three. The active cube (`render/partmeshes.js`) and its proxy draw the same parts, and both take
their materials from one table of looks (`render/materials.js`: 'full' is PBR, cut, shadowed and
animated, 'proxy' is Lambert and darker). So lava stays lava and acid stays acid out there,
falls pour there too, and a new part or fluid shows in both or neither.

`render/neighbors.js` draws every proxy as instances in shared `BatchedMesh`es, one per part
plus one for all landmarks (the only props shown; their glowing parts still glow, dimmed with the
cube, the town's windows and street lamps lit at night as in the cube played in), without
enemies, lights or shadows. The landmarks' batch culls each of its props against the view on
its own, and the small ones (the town's flowers and grass) show only within the quality level's
reach of the hero (docs/lighting.md, `dressing`). Every proxy's glass box is one instanced draw for the panes and one
for the outlines (`render/glass.js glassBatch`). All the surroundings take at most a dozen draw
calls, however many cubes they are. A proxy's fades (travel dissolve, inverted cross-fade and
distance) live per instance in a small data texture of each batch; its `group` is a stand-in
holding those values and the position travel moves, and `cullNeighbors` writes them into the
batches once a frame (disposing proxies writes at once too: the main menu draws without culling,
and the glass of a world just left must not stay). Whole-cube bounds are frustum-culled there after the camera updates,
including both sets during travel; fully fogged cubes are skipped too. Proxy solids and fluids
use the screen-space cutaway region to reveal the player, independent of the active cube's cut
height; this reveal is disabled during travel. Proxies are pushed back a little in depth
(polygon offset): a cube and its neighbour both have a cliff wall on their shared face, and the
proxy's must lose there, or it fights the section caps seen through a cut. Lava pulses in proxies as in the cube you are in;
the falls' textures stream in both.

**The people of the surroundings** (`game/standins.js`): the villagers and the people out in the
world (residents, the quests' people, the people found living at a camp) stand in every cube shown
round you, up to two cubes from the one played in (`game/drawn.js NEAR`), as they do there: they
breathe, look about and turn to the hero coming close. They are figures of their own, drawn as
their cube is (`render/farlook.js`: dimmed like its proxy, a little less, `NEIGHBOR_DIM.people`,
and dissolving with it), without the lights of what they wear, and nothing to hover or click. Each
proxy has its own, so travel's two sets cross-fade with their people and a proxy kept across a
refresh, a slide or the town's tiles handed over keeps them. `game/drawn.js drawnAt` says where a
cube is drawn now (the cube played in, the one a slide carries away, or a proxy shown near): the
robot left behind, the crash on the town's plaza and the friends in other cubes go by it too.

Proxy geometry uses an LRU cache keyed by worker geometry identity, with a 64-entry / 32 MiB
budget (of packed parts). Live proxies pin their geometry (so the live set can exceed the
budget); unused entries leave the batches and world resets clear the cache. Batches compact
their space before they grow. Refreshes and travel reuse overlapping proxies rather than
uploading duplicate geometry or fading the surroundings out and back in.

Checks: `npm test` covers discovery, stratum filtering, conservative selection, distance
fades and the parts (`tests/parts.test.js`: every builder layer is a part, packing keeps every
triangle in place, falls, transfer). Run `await (await import('./tests/browser/neighbor.js')).runNeighborChecks()`
for shared batches and geometry, per-proxy fades, fluid looks, refresh/revisit reuse, opened
panes, frustum rotation, distance culling, fade isolation, shader compilation, travel rebasing
and cache eviction. `runExpandedTravelChecks()` in the same module verifies continuous proxy
reuse and cleanup during real travel through a fully explored stratum, and
`runPartParityChecks()` that every cube generated so far draws the same parts full and as a
proxy. `runProxyIntegrityChecks(trips, explore)` travels sideways, down and up (through explored
or new cubes) and jumps between cubes, checking after each step and while sliding that only
discovered cubes of the live sets are drawn, each instance active with its own geometry, placed,
faded and shown as its proxy, the batches' draw lists and contents match, the glass boxes are
exactly the shown proxies', and nothing stays drawn after leaving the world.

## Off the main thread (`world/worker.js`, `world/client.js`)

The world lives in a module worker. That covers WFC, faces, map generation and the cube
geometry (`render/cubegeo.js` builds typed arrays per layer, `render/parts.js` packs them into
parts). The main thread receives each map by structured clone (the object graph survives) and
the parts as transferred buffers, and only wraps them into meshes; the proxies' batches copy
them once per cached cube.

After entering a cube, the cubes behind its portals (and doors) are prefetched, so travel
usually starts at once: their maps, what they show (`render/cubeassets.js` `cubeAssets`: prop
sets, enemy models, the coins they drop) and their shaders (`warmCube`). One step further, the
cubes behind those cubes' wells and rings get their maps and models too (`game/flow.js`
`prefetchAround`), so a new depth's downloads are in before you stand at its well. If a cube is
not ready, the player waits in the portal and a spinner shows (`game/hud.js` `whenReady`).

The worker makes cubes one at a time from a queue; a cube someone waits for (`WorldClient.get`,
urgent) goes to its front, so the cube you walk into is not made after all the ones fetched
ahead. Models are fetched at once but parsed one per frame, right after a frame went out
(`render/turns.js`), and so is the one heavy step of warming a cube.

Shaders are compiled before they are drawn (`render/warmup.js`). three.js compiles a material's
program the first time it draws it, and that frame waits for the driver: a new depth brought
a handful, which stalled its first frame by a second and more on a phone. Warming a cube builds
it once off-screen (`buildWorld`), puts its parts into the proxy batches it will be drawn in
later (a batch's shader depends on its geometry's attributes), makes an enemy of each kind it
can have (`render/enemies.js` `enemyWarmup`: body, silhouette, bar, label, a wet one's puddle)
and the loot they drop (`render/loot.js` `lootWarmup`), compiles all of it with
`renderer.compile` and throws it away; the programs stay (`render/programs.js`). With
KHR_parallel_shader_compile the driver compiles in the background and travel waits until it is
done. At the start of a world everything that hides in the scene until used (the particle
layers, the portal cloud) is compiled as well.

Point lights come from a fixed pool (`render/lightpool.js`). A changing light count made
three.js recompile every lit shader on each cube change, which was the biggest stutter. The
hero's own light (`render/character.js`) stays in the scene too, hero shown or not: it used to
ride on the figure, and going from the main menu into the game changed the count.

## Results

- **Edge continuity:** over 400 face pairs, ground height and fluid match on every edge cell,
  corners included. Slab presence and portal positions match too.
- **Generation:** about 3 ms per cube. Over 1000 cubes, most succeed on the first attempt
  and the worst took 5.
- **Routes:** a bot walks every route (portal to exit, the ways back, escapes). 1487 of
  1488 routes pass (780 cubes, 40 worlds).
- **Rendering (original four-neighbor baseline):** active cube plus four low-detail
  neighbors at 60 fps, 57 draw calls. Expanded surroundings are distance/frustum/fog culled;
  draw count now depends on exploration, camera orientation and zoom.

## Known issues / open questions

- **Stuck route:** 1 cube in 1000 has a route the character cannot walk. Corner smoothing
  pulls a slab corner below its own underside. This is an old smoothing quirk that the
  world-fixed layer levels make a bit more likely.
- **Corner vertices:** the height rule ("H if more than two of the four sockets are H") is
  arbitrary. Highland corners can show small dips.
- **Vertical portals:** they only need to line up loosely; a pad that would overlap another
  portal moves to a free spot in that cube.
