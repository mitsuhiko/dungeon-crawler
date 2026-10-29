# The town as a piece of its own (plan)

Status: an idea, nothing built. It replaces the one-cube town and the merchant camp
([world.md](world.md#starting-town-worldtownjs-cubegentownjs)) and changes the beginning
([story.md](story.md#the-beginning)). This page lists what has to change; the pages it touches are
updated as it is built.

## The idea

- **The town is the big piece.** The glassmakers closed their glass round the place where the
  people lived, a large piece. The small cubes are scraps of wild land that broke away with it.
  People live in the town and are afraid to leave (but for a few), because of what lives out there.
- **The cubes are the first level of the dungeon.** The road out of town (depth 0) starts at the
  town's gate. The depths below it stay as they are.
- **The story starts with a crash.** Something comes down in the town (the glassmaker's big glass,
  with the robot and his sword tied to it) and leaves a crater. The tutorial happens in the town.

## Decided

- **Tiles.** The town is 12 ordinary cubes of 16 × 16 cells (4 × 3, 64 × 48 cells, about 25 s to
  run across), laid out together as one place. A building, a tree trunk or the pond lies wholly in
  one tile.
- **Known from the start.** All the town's tiles count as visited when the world begins: on the
  map, drawn as surroundings, their faces open. The town is home. This is the one exception to
  "Only where you have been" ([world.md](world.md#only-where-you-have-been)).
- **One cube at a time.** As now, only the tile the hero is in is simulated and drawn in full; the
  other tiles are surroundings. Drawing more than one tile in full comes later (not part of this).
- **No seams.** Between two town tiles there is no glass (no panes, no edges), no travel slide and
  no step in the ground. Walking from one tile into the next looks and feels like walking on.
  Around the whole town there is one glass hull.

## Still to decide

1. **The crash.** His glass bursts in the town (as now, but a crater, smoke, the townsfolk round
   it); or it cracks the town's glass and the crack is the way out; or a wild cube crashes into the
   town and sticks. Leaning towards the first.
2. **Who the hero is.** A local (the "player and all the people live there") or still a stranger
   who remembers nothing. The robot keeps its lost memory either way.
3. **The merchant camp.** Its traders and tents move into the town (a market), or a few brave ones
   camp just outside the gate (then the camp stays a room of the road, but enemy-free).
4. **Where the town lies on the grid** and which tile the gate is in (below, "The layout").
5. **The fight lesson.** The rock with the snakes stays the first room outside (leaning that way),
   or the town gets a training yard.
6. **How the other tiles look** while only one is drawn in full (below, "The surroundings").

## What has to change

### The layout of depth 0 (`world/layout.js`, `world/wfc.js`)

- **The town's tiles on the depth-0 grid**, at `Y = 0`, so the gate is an ordinary side face onto
  the first room of the road (a town apart from the grid could not share a face with it). A 4 × 3
  block (`TOWN_TILES`), turned with the seed as the exit is now (`seed % 4`).
- `build` for `d === 0`: the prefix is no longer town, camp and two straight rooms (`prefix` of
  length 4) but the gate tile and the room in front of it; the candidates (now `cheb >= 2` within
  4) leave out the town's block (and a ring round it, if the road should not run along the
  hull). The road's length: `ROUTE_ROOMS` counted town and camp as rooms; the band for depth 0
  may shrink by two.
- The route still has to end where depth 1 begins (`goal`: a cube with `cheb === 3`). With a town
  of 4 × 3 near the axis there is room; checked over many seeds (`tests/layout.test.js`).
- What counts the prefix: the side guardians from room 3 on (`first = d === 0 ? 3 : 2`), the horde
  from room 4 on (`world/hordes.js`, `route.slice(depth === 0 ? 4 : 2, -1)`), half population
  before a horde (`i > (d === 0 ? 4 : 2)`), no branches next to the safe surface
  (`free`: `cheb(c) <= 1`). All move to the new start.
- The beginning's gates (`gateFaces`, `INTRO_GATES`): `intro:sword` is on the town's gate now
  (shut until the sword is taken), `intro:glass` on the rock room's exit; the rock room
  (`layout.firstGlass`) is the first room outside.
- `layout.exists` holds the town's tiles; `layout.route` does not (they are no part of the route:
  no `routeIndex`, so `sectionsJoined` never asks about them).
- WFC: all town tiles pinned like the town and camp now (`meadow`, one layer; `wfc.js` pins
  `TOWN_KEY` and the camp).
- **Every depth changes.** A depth's route starts where the one above ended (`above.end`), and
  the annexes count from the depths above. A new depth 0 makes every world of a seed different
  from before (below, "Saves").

### Town policy (`world/town.js`)

- `TOWN_KEY` (one key) becomes the set of tiles: `isTown(k)` true for each, plus the tile that
  holds the inn's door (the spawn: `World.start`), the gate tile, the town portal's tile.
- `merchantCampKey`, `isMerchantCamp`, `isClearing`: gone, or the camp moves (decision 3).
- `enemyFreeAt`: now the surface buffer (`Y = 0`, `cheb <= 1`), which covers town, camp and the
  rooms around; then the town's tiles (and the camp if it stays).
- `TOWN_LEVEL` stays the level of all dry ground in town, inner faces included, so the seams are
  flat to begin with.

### The town's plan and generation (`world/town.js`, `cubegen/town.js`)

The biggest piece of work. The plan is made for the whole town in town coordinates (64 × 48), from
the seed, then cut into tiles; each tile's map takes its share.

- **What goes in it:** the four houses, the market (decision 3), more houses for people to live
  in (rescued people, [quests.md](quests.md#where-people-go-when-they-are-found)), the plaza, the
  pond, streets and paths, the crash site (crater, shards: `TOWN_SHARDS`, `render/shards.js`; the
  robot and sword: `CAMP_ROBOT`, `CAMP_RELIC`), the gate, the town portal's spot
  (`TOWN_PORTAL_SPOT`), villagers (`VILLAGERS`), the perimeter grove and the clutter.
- **Cut into tiles:** every building, trunk, villager, pond and the portal spot wholly in one tile,
  and off its seams by at least a body's width (they would be drawn in one tile and stand in the
  way in the next). Small props and ground cover are placed in town coordinates and go to the
  tile their middle is in; their colliders (`staticBlockers`) go to every tile they reach into.
  Ground cover must not thin out along seams (now it keeps off the cube's rim and the gates).
- **Paths** (`map.town.paths`, ribbons in `render/floors.js`, footsteps in `core/footing.js`):
  laid out in town coordinates, cut at the seams; the two halves of a path must meet at a seam
  without a gap or an end cap.
- **Reachability** (the flood fill with body radius, now per clearing): over the whole town, from
  the spawn to the gate, every door, every villager, the portal spot and the crash site, across
  seams.
- **Occlusion** (the cutaway's roof and canopy volumes) per tile, as now.
- **Faces between tiles** (`world/faces.js`, `world/profile.js`): flat at `TOWN_LEVEL` like the
  clearing faces now (`clearingBoundary`), no portal, no river. The town's outer faces: no portal
  but on the gate. `townDir`/`campDir` and `townExitPosition` (the exit's position along the face)
  go with the gate.
- **Interiors** (`cubegen/interior.js`, `World.cube`): a house's door is in its tile, not in the
  start cube (`this.cube(this.start).map.doors`); the door out leads back to that tile (`to:
  TOWN_KEY`).
- Things that skip clearings by name: `world/voids.js`, `world/spots.js` (no spots in town or
  camp: still none in town), `world/waterfalls.js`, `game/meteors.js`, `World.spec` (`floating`,
  `special`, `archetype` for depth 0).

### Discovery

- At a new world, all town tiles are marked visited (`visits`) and the faces between them opened
  (`state.openedFaces`), before the first cube is entered. `discover` (`game/flow.js`) must not
  count them as new (no jingle, the quests' `visit` event, the friend's `relay.visited`).
- The narrator says `wander` for a first visit (`visits === 1`, only out there) and the minimap
  shows visited cubes: the town shows whole from the start.
- `core/viewdistance.js discoveredCubes` reads `visits` alone: unchanged, but its header and
  [world.md](world.md#only-where-you-have-been) name the town as the exception, and
  `tests/viewdistance.test.js` checks that nothing else is.
- All 12 tiles are generated at the start (their geometry for the surroundings). The loading
  screen waits for the spawn tile only; the others come in as they are made.

### Crossing between tiles: no slide

Walking across an open face now goes through `startTravel` (`game/portals.js checkPortals`,
`game/travel.js`): a slide of 0.9 to 1.4 s on rails, the hero placed 0.6 inside the next cube
(`boundaryArrival`). Inside the town that is a seam. Instead, a **handover**:

- When the hero's middle crosses an inner face, the tile behind it becomes the active cube at once:
  `state.cubeKey`, `state.map` and `state.world` change, the hero's position moves by 16 cells
  exactly (no inset), their motion stays. A little hysteresis (crossing back only half a cell past
  the face) keeps it from flipping back and forth on the line.
- Everything kept in world coordinates moves along by the same 16 cells, in the same frame: the
  camera, particles and floating text (`shiftParticles`, `shiftFloatText`, which the slide uses),
  the hero's planted feet (`shiftHeroFeet`), footprints (`render/footprints.js`), what flies
  (shots, thrown flasks), the surroundings' offsets.
- The new tile is built with `buildWorld` and the old one disposed in that frame: it has to be
  ready (its parts made, its props loaded, its bake done or taken from the cache). Its bake
  (`render/bake.js`) now waits while a cube is faded out; here it is in plain sight. So the tiles
  next to the hero are built ahead of time (kept like the bake cache: `CACHE` is 3, 1 on a touch
  screen) and swapped in, not built at the line.
- Not on a handover: `beginVisit` (what a death restores: the town has no enemies, but the
  arrival point moves on, for a death and the Room Portal Scroll), `settleIn`'s narration
  (`arrived`: `home` is for coming back from out there, the place is still the town), the smith's
  new stock (`enterCube`: only when coming from outside the town), `resetEnemies`, the quests'
  `questWorld` per tile (the people standing in it).
- A mouse order to a point beyond the seam: held in town coordinates and walked on after the
  handover (now the pointer only finds ground in the active cube: `game/pointer.js`,
  `game/orders.js`, `physics/playernav.js`).

### Physics at the seams

The physics asks only the active map; outside its 16 × 16 cells is solid (`cellAt` gives `-1`,
`blockedAt` and `canMove` say blocked). Right after a handover the hero stands on the line, half
of their body in the tile behind.

- Either the queries (`physics/collide.js`, `physics/canmove.js`: `cellAt`, `groundAt`,
  `blockedAt`, `ceilingAt`, `insideSolid`, `solidTop`, fences) look into the neighbour's map
  across a seamless face (the neighbour is known, its map is there), or a band along every seam is
  kept clear and flat by the plan and the queries take it as open ground. The first is right, the
  second is cheap; the plan's rules above (nothing on a seam) make either work.
- The close camera's arm (`game/camera.js solidAt`) and the cutaway's blockers likewise.
- `physics/unstuck.js`, `physics/respawn.js` and the last safe spot see only the active tile:
  fine, as long as nothing sits on a seam.

### Glass

- Town tiles get no glass box of their own (`render/glass.js makeGlass`, the surroundings'
  `glassBatch` in `render/neighbors.js`). Hiding a face's pane is there already
  (`setGlassFaces`), but a box always draws its outline's 12 edges.
- The hull: either one box over the whole town (its own size: the box is `N × CUBE_H × N` now),
  drawn whichever tile is active, or each tile drawing only its share of the hull: the panes on
  outer faces, and of the edges only those that lie on the hull (a vertical edge only where both
  of its faces are outer). Its look (`GLASS.corner`, `reach`: stronger near the box's corners) must
  go by the hull's corners, not each tile's, or the rim brightens every 16 cells.
- The hull's height: with `CUBE_H` the town is a flat slab (64 × 16 × 48). Taller, to read as one
  big cube, is a choice.

### The surroundings (the other tiles)

With one tile drawn in full, the other eleven are proxies (`render/neighbors.js`): darker
(`PROXY.tint`), no props but landmarks, no villagers, no lights, no shadows. In the town that is a
seam of its own:

- The town's houses, trees and tents are props (`assets/town.glb`, `town_trees.glb`): in the
  surroundings they would not be there at all. At least they become landmarks of their tiles
  (`shownFar`), better the town's whole dressing.
- The town's surroundings drawn at the full cube's brightness (no darker tint), at least the
  tiles next to the hero.
- Still missing out there: the villagers, the lamps and windows at night, the baked light and
  shadows. That is what drawing more than one tile in full (later) fixes. Until then the camera
  (below) keeps as little of it on screen as it can.

### Camera (`game/camera.js`)

The overview frames the cube: its target is the cube's centre (`cubeCenter`), drawn towards the
hero only when zoomed in (`follow`, about 0.3 at the default zoom). At a handover it would jump 16
cells. In town it follows the hero (`follow` 1), kept inside the town's bounds so it never looks
past the hull, and eases. [camera.md](camera.md) gets a section.

### Lighting

- A tile's bake knows only its own solids and lights. A house's shadow, a lamp's light or a
  window's glow stops at its tile's edge. The plan keeps lamps and tall things back from the seams
  for now (as far as a lamp reaches, about 4 cells, would be a lot: decide how far); baking with the
  neighbours' casters and lights comes with drawing more than one tile.
- The moving sun's shadow map of what moves (`render/scene.js`, ±16 round the cube) follows the
  hero in town.

### Things that know the town by its one key

- `game/townportal.js` (`isTown`, `TOWN_KEY` as the town end), `core/townportal.js`
  (`map.town.portal`), `game/minimap.js` (the town end's pad).
- `game/questworld.js` (a quest ready to hand in: `{ key: TOWN_KEY, villager }`: the villager's
  tile).
- `game/flow.js` (`enterCube`: the smith's stock when coming back to town).
- `cubegen/interior.js` (the door out: `to: TOWN_KEY`; `interior.outside`).
- `game/intro.js`, `game/robot.js`, `core/robot.js` (`robotLies`: the robot lies in the merchant
  camp: now in the crash site's tile), `game/tutorial.js` (`at`: town, camp, rock).
- `core/narration.js placeOf`, `game/log.js placeOf`, `core/chronicle.js` (`'Merchant camp'`),
  `game/narrator.js` (`town`, `home`, `camp`, `road`), `game/music.js` (the town song for
  `enemyFree`), `game/hud.js` (dev line).
- `render/floors.js`, `core/footing.js` (`map.town.paths`, `map.merchantCamp`),
  `render/mountains.js`, `render/cubeassets.js` (warm-up).
- `core/quests.js` (`depthName(0)`: "road out of town", `townOpen`, `away`), `core/questplan.js`
  (`perDepth(0)`).

### Robot, friends

- The robot (`game/robot.js`) follows a trail kept per cube and draws itself in the cube beside
  the hero's while that shows (`beside`); a handover must carry its trail and place along.
- Playing together, a friend is drawn only in the same cube (`render/partner.js`, `net/session.js`
  `them.cube === state.cubeKey`): two players in neighbouring tiles of the town would not see each
  other, a few steps apart. They should (offset by the tiles' places).

### Saves (`core/save.js`, `game/save.js`)

- A world keeps the cube it was left in, the visited cubes, the open faces, the unlocked gates and
  the town portal's cube, all by key. A new depth 0 changes every depth of a seed (above): a world
  saved before cannot go on as it was. The world's version goes up; older worlds are offered as
  over, or started again. Heroes are kept apart from worlds
  ([saves.md](saves.md#heroes-and-worlds-apart)) and are not touched.
- The town's tiles need not be saved as visited (they always are).

### The beginning, the robot's lines, the tutorial

- [story.md](story.md#the-beginning): the three rooms become the town (waking, the crash site, the
  robot waking among the townsfolk, the sword, the gate) and the rock outside. "What happened" gets
  the crash.
- The scenes (`core/scenes.js`, `game/scene.js`: the robot's waking, `CAMP_ROBOT` six cells off)
  move to the crash site.
- The robot's lines (`core/narration.js`): its hello ("How did I end up in the grass?") can stay if
  the crater is in a meadow; the `sword` line's note says "the road beyond the camp". A line whose
  text changes is rendered again (`node tools/narration.mjs`, [narration.md](narration.md)) and
  translated (German) in the same change. New lines for the townsfolk at the crash, if any.
- The recording `'camp'` ("his old sword", found on the road) keeps its place; its note mentions
  the camp.
- The tutorial (`core/tutorial.js STAGES`): the `town` stage's "Go through the gate" now comes
  after the sword; the `camp` stage goes into the town.
- `FIRST_GLASS` (`core/spawns.js`) and the rock (`cubegen/setpieces.js`) stay.

### Words (`src/i18n/`)

New and changed texts in English and German: the town's places (market, gate), the tutorial's
steps, "Merchant camp" (if the camp goes), the robot's label if its place changes, the chronicle's
"the surface". Indonesian catches up later ([i18n.md](i18n.md)).

### Docs and the guide

- [world.md](world.md): "Starting town", "Only where you have been", "Layout" (depth 0),
  "Opened side connections" (the town's faces), "Travel" (the handover).
- [story.md](story.md): "The beginning", the robot, "Still open" (what the town is).
- [depths.md](depths.md) (depth 0's row), [villagers.md](villagers.md) (where they stand),
  [quests.md](quests.md) (people living in town), [camera.md](camera.md),
  [lighting.md](lighting.md) (seams), [online.md](online.md) (friends across tiles),
  [saves.md](saves.md) (the version).
- The guide (`learn/`, English and German) where it shows or names the town, the camp and the
  first rooms (its pages on cubes, the world, the architecture), and the preview pictures of the
  town, if they change (`tools/preview-images.mjs`).

### Checks

- `tests/town.test.js`: the town over many seeds and all four exits: the tiles, every building
  and villager in one tile and off the seams, flat seams, reachability across tiles, the gate, the
  portal spot, the crash site.
- `tests/layout.test.js`, `tests/wfc.test.js`, `tests/hordes.test.js`, `tests/spots.test.js`:
  depth 0's new start.
- `tests/viewdistance.test.js`, `tests/boundaries.test.js`: the town known from the start, its
  inner faces open, nothing else.
- `tests/interior.test.js` (doors in their tiles), `tests/intro.test.js`, `tests/robot.test.js`,
  `tests/save.test.js` (the version), `tests/narration.test.js` (lines changed).
- In the browser: `tests/browser/town.js`, `hover.js` (its `must` list: the town and the camp),
  `beginning.js`, `tutor.js`, `townportal.js`, `interior.js`, `neighbor.js` (the surroundings, the
  town's exception), `boundary.js` (crossing: the handover), `camera.js`.

## Order of work

1. The layout: the town's tiles on depth 0, the road starting at the gate, the town known from the
   start. Each tile a plain town meadow for now, the slide still there. Saves' version.
2. The handover in place of the slide, the camera following in town, physics across seams.
3. The glass hull, the town's surroundings (landmarks, brightness).
4. The town's plan over all tiles: houses, market, paths, the grove, the clutter, villagers.
5. The beginning: the crash site, the robot and the sword in town, the gate, the tutorial, the
   lines.
6. Later: more than one tile drawn in full, baking across seams.
