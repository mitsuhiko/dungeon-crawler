# The town as a piece of its own

Status: a first version is built: the town is twelve tiles, known from the start, walked across
without seams, one tile played and drawn in full at a time. What it is made of and how it works is
in [world.md](world.md#the-town-worldtownjs-cubegentownjs-gamehandoverjs); the beginning in it is
in [story.md](story.md#the-beginning). This page keeps the idea, what was decided, and what is
still to come.

## The idea

- **The town is the big piece.** The glassmakers closed their glass round the place where the
  people lived, a large piece. The small cubes are scraps of wild land that broke away with it.
  People live in the town and are afraid to leave (but for a few), because of what lives out there.
- **The cubes are the first level of the dungeon.** The road out of town (depth 0) starts at the
  town's gate. The depths below it stay as they are.
- **The story starts with a crash.** The glassmaker's big glass, with the robot and his sword tied
  to it, came down on the town's plaza and burst: a crater, its shards round it. The tutorial
  happens in the town.

## Decided

- **Tiles.** The town is 12 ordinary cubes of 16 × 16 cells, 3 across and 4 deep (48 × 64 cells),
  on the depth-0 grid round its gate's tile `(0,0,0)` and turned with it. A building or a tree
  trunk lies wholly in one tile, and nothing that stands in the way comes near a seam.
- **A land of its own.** Every world's town lies in its own land, the generator's ground (whole
  levels, cliffs, stairs, bridges, water): the lower town round the gate, the water across the
  whole town, the upper town half a cube over it on its cliff. The street crosses the water and
  climbs the cliff by a stair (in some worlds a second stair climbs it from a landing stage, bridges
  out to it over the water); one or two long spans come down over the lake; the river falls over
  the cliff; in some worlds a gorge cuts on from the lake into the upper town, a stream falling into
  its head and spans across it; a hill with a tent on its top, a hollow with a tent at its bottom, the people's homes
  along every way, some of them on a terrace of their own; a wall round it all a few cells in from
  its sides, towers on it, its gate over the street, and outside it the forest, deep and close
  ([world.md](world.md#the-town-worldtownjs-cubegentownjs-gamehandoverjs)). Each world's town has a
  landscape of its own too: the kind of wood and how its woods lie, the forms of the upper and the
  lower town's wild ground (a marsh with ponds, an orchard, terraces, rocky knolls, a ridge ...),
  how settled each is, how high the cliff rises, the kinds of hill and hollow, the spans' heights
  and styles.
  Its stairs, bridges and span have the invisible side rails of a cube's (`cubegen/fences.js
  runRails`): walking never takes the hero off their sides, only the jump key does.
- **Known from the start.** All the town's tiles count as visited when the world begins: on the
  map, drawn as surroundings, their faces open. The town is home. This is the one exception to
  "Only where you have been" ([world.md](world.md#only-where-you-have-been)).
- **One cube at a time.** Only the tile the hero is in is simulated and drawn in full; the other
  tiles are surroundings, drawn with all their houses, trees and dressing, and dimmed like any
  surroundings but half as much (the town is one place).
- **No seams.** Between two town tiles there is no glass (no panes, no edges), no travel slide and
  no step in the ground. Crossing a seam hands the tile over at once (`game/handover.js`, as
  crossing any open face does out of the town); the overview camera follows the hero in town.
  Around the whole town there is one glass hull.
- **The crash** is the glassmaker's glass coming down on the plaza; the robot lies at its rim
  with the sword. The town's gate opens for the sword; the rock with his first glass is the first
  room outside, the fight lesson.
- **The hero** is still a stranger who remembers nothing, coming out of the inn.
- **The merchant camp is gone**: its tents and traders are the market inside the town's gate.
- **Saves**: a new depth 0 changes every depth of a seed (a depth's route starts where the one
  above ended), so worlds saved before (version 1) start again as new; heroes keep all they carry.

## Still to come

- **More than one tile in full.** The tiles next to the hero drawn in full (their lamps and
  windows lighting them as in the tile played in, baked light and shadows), built ahead and swapped
  in, not built at the seam. (Their bakes are made ahead already, `game/bakeahead.js`: the tile
  built at the seam takes its own at once.) Their people, the crash and the robot already show
  there, as in any surroundings ([world.md](world.md): "The people of the surroundings").
- **Across the seams**: the physics reads the tile beyond a seam (a cell deep) and a click on its
  ground walks over into it, as across any open face ([world.md](world.md#opened-side-connections)),
  but the enemies' walks, the jumps the hero can make and a tile's baked shadows and lamps stop at
  its edge.
- **Room to grow**: more houses for people to live in (the people rescued could move to town,
  [quests.md](quests.md#where-people-go-when-they-are-found)), townsfolk standing round the crash,
  a reason it is the hero who goes.
- **The opening film** still ends with the glass rising into a piece; it could end on the town.
