# Depths

Quick reference for every depth (`Y = 0` to `Y = -20`, `depth = -Y`). Themes come from
`src/themes/index.js` and `src/themes/caves.js`. Every theme belongs to one of the story's three
acts and may appear at any depth of it; each world shows half of each act's themes, in story
order (see [world.md](world.md#themes-per-world-themesindexjs-themescavesjs-themesdepthjs)). The
layout comes from `src/world/layout.js`, the enemy roster per depth from `DEPTH_SPAWNS` in
`src/core/spawns.js`, and enemy levels from `enemyRoll` in `src/core/enemies.js`. Enemy kinds
(recoloured, stronger versions of a species) are described in `docs/enemy-kinds.md`.

## Overview

The depths come in three acts of light, one per act of the story ([story.md](story.md)), each
seven depths with the town before them and the core after (`light` in the themes,
`render/look.js`): **light** under the open sky (act I, 1–6, after the town), **medium** in the
sunlit hollows (act II, 7–13: open marshes, a works yard and a jungle under a hazy sky, and caves
where light falls in through cracks, and glowing things; the character's lamp at about half) and
**dark** in the deep (act III, 14–19 and the core: only the deep's own fires and crystals, and
the lamp at full; every theme walled in). `tests/themes.test.js` checks every theme against its
band.

| Depth | Act | Light | Layout (ring radius) | Enemy level (base, range) |
|---:|---|---|---|---|
| 0 | the town (Meadow islands) | light | town + road to the first well | 1 (always 1) |
| 1 | I | light | arc, r=3 | 1 (always 1) |
| 2 | I | light | arc, r=3 | 2 (1–3) |
| 3 | I | light | arc, r=3 | 3 (2–4) |
| 4 | I | light | arc, r=3 | 4 (3–5) |
| 5 | I | light | arc, r=3 | 5 (4–6) |
| 6 | I | light | arc, r=2 | 6 (5–7) |
| 7 | II | medium | arc, r=2 | 7 (6–8) |
| 8 | II | medium | arc, r=2 | 8 (7–9) |
| 9 | II | medium | arc, r=2 | 9 (8–10) |
| 10 | II | medium | arc, r=2 | 10 (9–11) |
| 11 | II | medium | arc, r=2 | 11 (10–12) |
| 12 | II | medium | arc, r=2 | 12 (11–13) |
| 13 | II | medium | arc, r=1 | 13 (12–14) |
| 14 | III | dark | arc, r=1 | 14 (13–15) |
| 15 | III | dark | arc, r=1 | 15 (14–16) |
| 16 | III | dark | arc, r=1 | 16 (15–17) |
| 17 | III | dark | arc, r=1 | 17 (16–18) |
| 18 | III | dark | arc, r=1 | 18 (17–19) |
| 19 | III | dark | arc, r=1 | 19 (18–20) |
| 20 | the core (Obsidian abyss) | dark | 3×3 core around the axis | 20 (19–21) |

The themes of each act, in their story order (a world shows them in this order down the act):

| Act | Theme | Kind | Fluids / river |
|---|---|---|---|
| I | Meadow islands | open, sky islands | water |
| I | Cloud kingdom | open, sky islands | water |
| I | Lagoon isles | open, sky islands | water |
| I | Karst terraces | open, sky islands | water |
| I | Dark forest | open, at night | water |
| I | Snowy peaks | open, sky islands | water |
| I | Prayer highlands | open, sky islands | water |
| I | Salt flats | open | water |
| I | Badlands | open | water (some lava / acid) |
| I | Deep canyon | open, rock walls | water |
| II | Root caves | cave | water |
| II | Sunken grotto | cave | water |
| II | Dwarven forge | open (a works yard) | water (some lava) |
| II | Honey hive | cave | water |
| II | Fungal swamp | open | acid river |
| II | Jungle cenote | open | water (some lava) |
| II | Frozen caves | cave | water |
| II | Slime marsh | open, meteorites at night | acid river |
| III | Crystal mines | cave | water (some lava) |
| III | Spider nests | cave | acid river |
| III | Ossuary | cave | acid river |
| III | Buried ruins | cave | acid river, lava |
| III | Volcanic depths | cave | lava river |
| III | Obsidian abyss | cave, large voids (and the core) | lava only |

The canyon (the last of act I's themes) is the last of the sky: like a cave its cubes are walled in by rock (17–23
levels high, open at the portals and rivers; `walls` in the theme), so the route winds through
a gorge of red, salmon and cream sandstone, but the sun still shines in.

Gorge spans (every depth but the town and the core, as often as the theme says: most on the
sky islands, the peaks and the badlands, now and then in the caves): some rooms are joined by
one long bridge over a valley or the open sky, sometimes out to a lonely island; see
[world.md](world.md#gorge-spans-worldspansjs-cubegenspanjs). Their gorge cubes have half the
usual population.

Big heights (every depth but the town and the core, see
[world.md](world.md#big-heights-tablelands-pinnacles-great-shafts-worldheightsjs-cubegenheightsjs)):
at most one large area on the route (a tableland: an escarpment to climb, a plateau, and a way
down: a leap onto something soft, a ramp round a great shaft into the depth below, or a climb; a
spiral: four rooms round a mountain, a railed ramp winding up it; a hairpin: two bridges over one
canyon, out low and back high), at most one set piece (a pinnacle or a lone peak with a reward
site on top, or a great lake), and short tunnels through ridges of rock, most of all under rock
walls. See [world.md](world.md#large-areas-spiral-and-hairpin-worldareasjs-cubegenareasjs).

## Enemies per depth

Every layer also has one coordinated [wild horde pack](hordes.md), replacing that cube's
ordinary roster with 6–24 light enemies. The table below is for ordinary rooms; a quieter
approach room may halve its counts. Guardian arenas still use their doubled roster.

Each depth has its own roster (`DEPTH_SPAWNS` in `src/core/spawns.js`). The town and the
merchant camp have no enemies (`enemyFreeAt` in `src/world/town.js`: `Y = 0` and
`max(|X|, |Z|) ≤ 1`). The rest of the depth-0 road uses the row for depth 0.

A roster entry is `species chance count (packs) [kinds]`:

- **chance**: how likely a cube is to have the species at all. No percentage means always.
- **count**: how many spawn when it is there.
- **packs**: the biggest group it spawns in. No value means each one spawns on its own.
  **troops of 3**: always exactly three together, all of one kind (the Flimmers: their count is
  rounded to whole troops).
- **kinds**: which kinds of the species spawn, and how often. Each pack draws one kind, so a
  pack is all Redbacks or all plain spiders. No value means the species' base kind.
- **(... only)**: the species keeps to some of the depth's themes (`where`: the Squirtles to the
  fluids, each kind to its own: the blue ones to the water of the Lagoon isles, the Sunken grotto
  and the Jungle cenote, the Moss ones to the Slime marsh's acid, the Coral ones to the lava of the
  Volcanic depths and the Obsidian abyss; the Dark forest's Gloom
  spiders, Lantern-faces and Shadow flimmers to the forest; the Slugs and the Bolimes to the Slime marsh), at
  every depth of the theme's act, since a theme may appear anywhere in its act. **(not ...)**:
  everywhere but there (`'!theme'`: the ordinary spiders of depths 2 to 6 and the Flimmers of
  depths 4 to 6 leave the forest to its own).

`mix` is the most species a single cube can hold. The Squirtles live in fluids
(`src/physics/dwell.js`): they are only put down in a fluid of their kind's, so a cube without
one has none, whatever the roster says (and a guardian arena has a pond dug for them,
`src/cubegen/guardian.js`).

| Depth | mix | Roster |
|---:|---:|---|
| 0 | 1 | snakes 1–2 |
| 1 | 2 | snakes 2–4, Stunders 20% 1, Wolks 25% 1, Squirtles 60% 1–2 (Lagoon isles only), spiders 70% 2–4 (packs ≤2) [Gloom spider] (Dark forest only), Fire-faces 30% 1 [Lantern-face] (Dark forest only) |
| 2 | 3 | snakes 2–5 [75% Grass snake, 25% Sand viper], spiders 60% 2–4 (packs ≤2) (not the Dark forest), Stunders 25% 1, Wolks 35% 1–2, Tornados 30% 1, Squirtles 60% 1–3 (Lagoon isles only), Flimmers 35% 3 (troops of 3), spiders 80% 3–5 (packs ≤2) [75% Gloom spider, 25% Spider] (Dark forest only), Fire-faces 40% 1–2 [Lantern-face] (Dark forest only) |
| 3 | 3 | spiders 8–14 (packs ≤3) [Frost spider] (not the Dark forest), Stunders 70% 1–2 [Frost stunder], Shraps 30% 1, Wolks 50% 1–2 [67% Storm wolk, 33% Wolk], snakes 70% 2–4 (packs ≤2) [Frost adder], Triangles 20% 1, Tornados 35% 1–2 [67% Frost tornado, 33% Tornado], Squirtles 60% 1–3 (Lagoon isles only), Flimmers 45% 3 (troops of 3) [Frost flimmer], spiders 80% 4–6 (packs ≤2) [67% Gloom spider, 33% Spider] (Dark forest only), Fire-faces 40% 1–2 [Lantern-face] (Dark forest only) |
| 4 | 3 | snakes 3–6 (packs ≤2) [Sand viper], spiders 80% 4–8 (packs ≤3) [80% Spider, 20% Redback] (not the Dark forest), Stunders 60% 1–2 [50% Stone stunder, 50% Stunder], Wolks 50% 1–2 [Dust wolk], Tornados 40% 1–2 [67% Dust tornado, 33% Tornado], Squirtles 60% 2–3 (packs ≤2) (Lagoon isles only), Flimmers 45% 3–6 (troops of 3) [67% Haze flimmer, 33% Flimmer] (not the Dark forest), Flimmers 35% 3 (troops of 3) [Shadow flimmer] (Dark forest only), spiders 80% 4–7 (packs ≤3) [67% Gloom spider, 33% Spider] (Dark forest only), Fire-faces 45% 1–2 [Lantern-face] (Dark forest only) |
| 5 | 3 | snakes 4–7 (packs ≤2) [Sand viper], spiders 80% 5–9 (packs ≤3) [80% Spider, 20% Redback] (not the Dark forest), Stunders 60% 1–2 [50% Stone stunder, 50% Stunder], Wolks 40% 1–2 [50% Dust wolk, 50% Storm wolk], Wollas 30% 1–2, Tornados 35% 1–2 [50% Dust tornado, 50% Tornado], Squirtles 60% 2–3 (packs ≤2) (Lagoon isles only), Flimmers 45% 3–6 (troops of 3) [67% Haze flimmer, 33% Flimmer] (not the Dark forest), Flimmers 35% 3 (troops of 3) [Shadow flimmer] (Dark forest only), spiders 80% 5–8 (packs ≤3) [67% Gloom spider, 33% Spider] (Dark forest only), Fire-faces 50% 1–2 [Lantern-face] (Dark forest only) |
| 6 | 3 | snakes 5–8 (packs ≤2) [50% Sand viper, 50% Blood viper], spiders 80% 6–10 (packs ≤3) [67% Spider, 33% Redback] (not the Dark forest), Stunders 60% 1–3 [50% Stone stunder, 50% Stunder], Wolks 40% 1–2 [50% Dust wolk, 50% Storm wolk], Wollas 35% 1–2, Octonauts 15% 1, Meckeds 15% 1, Tornados 30% 1–2 [Dust tornado], Squirtles 60% 2–4 (packs ≤2) (Lagoon isles only), Flimmers 40% 3–6 (troops of 3) [Haze flimmer] (not the Dark forest), Flimmers 35% 3 (troops of 3) [Shadow flimmer] (Dark forest only), spiders 80% 5–9 (packs ≤3) [67% Gloom spider, 33% Spider] (Dark forest only), Fire-faces 50% 1–2 [Lantern-face] (Dark forest only) |
| 7 | 3 | spiders 7–12 (packs ≤3) [67% Spider, 33% Bog spider], snakes 80% 4–7 (packs ≤2) [50% Grass snake, 50% Blood viper], Stunders 60% 1–2, Meckeds 50% 1–2, Wollas 40% 1–2, Octonauts 20% 1, Squirtles 70% 2–3 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 1–3 [40% Spotted slug, 40% Black slug, 20% Slug] (Slime marsh only), Bolimes 95% 2–3 (packs ≤2) [40% Toxic bolime, 40% Glow bolime, 20% Bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 8 | 3 | spiders 8–13 (packs ≤3) [57% Spider, 29% Bog spider, 14% Redback], snakes 80% 4–8 (packs ≤2) [Blood viper], Stunders 60% 1–3 [50% Stunder, 50% Stone stunder], Meckeds 60% 1–3 (packs ≤2), Wollas 45% 1–2, Octonauts 25% 1–2, Squirtles 70% 2–3 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 1–3 [40% Spotted slug, 40% Black slug, 20% Slug] (Slime marsh only), Bolimes 95% 2–3 (packs ≤2) [40% Toxic bolime, 40% Glow bolime, 20% Bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 9 | 3 | Octonauts 3–4, Shraps 80% 1–3, spiders 80% 6–10 (packs ≤3) [Frost spider], Stunders 70% 1–2 [Frost stunder], snakes 80% 3–5 (packs ≤2) [Frost adder], Meckeds 60% 1–2 [Frost mecked], Tornados 25% 1 [Frost tornado], Squirtles 80% 2–4 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 1–3 [40% Spotted slug, 40% Black slug, 20% Slug] (Slime marsh only), Bolimes 95% 2–3 (packs ≤2) [40% Toxic bolime, 40% Glow bolime, 20% Bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 10 | 3 | Octonauts 3–5 (packs ≤2) [75% Octonaut, 25% Coral octonaut], Shraps 90% 2–3, spiders 80% 7–12 (packs ≤4) [Frost spider], Stunders 70% 1–2 [Frost stunder], snakes 70% 3–5 (packs ≤2) [Frost adder], Triangles 15% 1, Meckeds 65% 1–2 [Frost mecked], Tornados 30% 1–2 [Frost tornado], Squirtles 80% 2–4 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 2–3 [67% Black slug, 33% Spotted slug] (Slime marsh only), Bolimes 95% 2–4 (packs ≤2) [67% Glow bolime, 33% Toxic bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 11 | 3 | snakes 6–10 (packs ≤3) [Venom adder], Octonauts 80% 2–4 (packs ≤2) [75% Bog octonaut, 25% Octonaut], Spicies 60% 1–2 [50% Spicy, 50% Habanero], Wollas 40% 1–2 [Bog wolla], spiders 60% 6–10 (packs ≤4) [Bog spider], Meckeds 50% 1–2 [Bog mecked], Stunders 25% 1–2, Fire-faces 30% 1 [Blaze-face], Squirtles 80% 2–4 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 2–3 [67% Black slug, 33% Spotted slug] (Slime marsh only), Bolimes 95% 2–4 (packs ≤2) [67% Glow bolime, 33% Toxic bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 12 | 3 | snakes 7–12 (packs ≤3) [67% Venom adder, 33% Blood viper], Octonauts 80% 3–5 (packs ≤2) [75% Bog octonaut, 25% Octonaut], Spicies 80% 1–3 [50% Spicy, 50% Habanero], Wollas 50% 1–2 [Bog wolla], spiders 60% 8–12 (packs ≤4) [Bog spider], Meckeds 55% 1–3 (packs ≤2) [Bog mecked], Fire-faces 30% 1 [Blaze-face], Squirtles 80% 2–4 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 2–3 [67% Black slug, 33% Spotted slug] (Slime marsh only), Bolimes 95% 2–4 (packs ≤2) [67% Glow bolime, 33% Toxic bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 13 | 3 | snakes 8–12 (packs ≤3) [50% Venom adder, 50% Blood viper], Octonauts 80% 3–5 (packs ≤2) [67% Coral octonaut, 33% Bog octonaut], Spicies 60% 1–2 [50% Habanero, 50% Spicy], Triangles 40% 1–2 [Emerald triangle], Wollas 30% 1–2 [50% Bog wolla, 50% Storm wolla], spiders 30% 10–14 (packs ≤4) [50% Bog spider, 50% Redback], Meckeds 50% 1–2 [Bog mecked], Squirtles 80% 2–4 (packs ≤2) (Sunken grotto, Jungle cenote only), Slugs 90% 2–3 [67% Black slug, 33% Spotted slug] (Slime marsh only), Bolimes 95% 2–4 (packs ≤2) [67% Glow bolime, 33% Toxic bolime] (Slime marsh only), Squirtles 50% 1–3 (packs ≤2) [Moss squirtle] (Slime marsh only) |
| 14 | 3 | spiders 18–26 (packs ≤6) [50% Redback, 50% Bog spider], Stunders 50% 1–2 [Stone stunder], Octonauts 30% 1–2 [50% Octonaut, 50% Coral octonaut], snakes 40% 4–6 (packs ≤3) [50% Venom adder, 50% Shadow mamba], Spicies 50% 1–2 [Nightshade], Meckeds 45% 1–2 [Bone mecked], Wollas 30% 1–2 [Storm wolla], Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 15 | 3 | spiders 20–28 (packs ≤7) [50% Redback, 50% Spider], Stunders 60% 1–3 [Stone stunder], Octonauts 40% 1–2 [Coral octonaut], Spicies 60% 1–2 [Nightshade], snakes 60% 4–6 (packs ≤3) [Shadow mamba], Meckeds 50% 1–3 (packs ≤2) [Bone mecked], Triangles 15% 1, Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 16 | 3 | Triangles 2–3 [67% Triangle, 33% Emerald triangle], Stunders 70% 1–3 [Stone stunder], Octonauts 70% 2–5 (packs ≤2) [50% Octonaut, 50% Coral octonaut], Wollas 50% 1–3 [Storm wolla], spiders 50% 10–14 (packs ≤4) [50% Frost spider, 50% Redback], Shraps 70% 1–2 [Amethyst shraps], Fire-cats 40% 1–2 [Ash cat], Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 17 | 3 | Triangles 80% 1–3 [33% Triangle, 33% Emerald triangle, 33% Crimson triangle], Octonauts 80% 3–6 (packs ≤2) [67% Coral octonaut, 33% Bog octonaut], snakes 60% 10–14 (packs ≤4) [Shadow mamba], Fire-cats 50% 2–3 (packs ≤2) [50% Ash cat, 50% Fire-cat], spiders 40% 10–16 (packs ≤5) [Redback], Shraps 50% 1–2 [Amethyst shraps], Wollas 30% 1–2 [Storm wolla], Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 18 | 4 | Fire-faces 1–3, Fire-cats 3–5 (packs ≤2) [50% Fire-cat, 50% Ash cat], Shraps 80% 1–3 [Fire shraps], Stunders 80% 1–3 [Magma stunder], snakes 60% 10–14 (packs ≤4) [Shadow mamba], Wollas 50% 1–2 [Ember wolla], Tornados 40% 1–2 [Fire tornado], spiders 25% 14–20 (packs ≤6) [Redback], Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 19 | 3 | Fire-faces 2–3 [50% Fire-face, 50% Blaze-face], Fire-cats 5–8 (packs ≤3) [50% Fire-cat, 50% Void cat], Shraps 60% 1–2 [Fire shraps], Triangles 60% 1–2 [Crimson triangle], Wollas 50% 1–2 [Ember wolla], Stunders 70% 1–2 [Magma stunder], Tornados 35% 1 [Fire tornado], Squirtles 70% 1–3 (packs ≤2) [Coral squirtle] (Volcanic depths, Obsidian abyss only) |
| 20 | 4 | Fire-cats 5–9 (packs ≤3) [Void cat], Fire-faces 2–4 [Wisp-face], Triangles 80% 2–3 [50% Crimson triangle, 50% Triangle], Stunders 70% 2–3 [Magma stunder], Wollas 40% 1–2 [Ember wolla], spiders 30% 18–26 (packs ≤8) [Redback] |

The design rules behind the table:

- **The surface ramps up slowly.** Depth 1 has only snakes, a rare Stunder and Wolk, and
  Squirtles in the lagoons. Depth 2 adds a few spiders and now and then a Tornado. Depth 3 is the first spider-heavy
  depth, with more Stunders, Frost adders and a rare Triangle as a mini-boss. Depth 4 mixes
  snakes, spiders and Stunders, and the canyon (5–6) goes on with them, Sand vipers and Stone
  stunders first, Dust wolks in the wind and the first Wollas. Troops of three blurry Flimmers
  turn up from depth 2 to 6, where act I had the fewest species: frosty at 3, like heat haze over
  the badlands and the canyon from 4, almost black in the Dark forest.
- **Each theme has one or two signature species:** Wolks and Tornados under the open sky of the
  meadows, the snowy peaks, the badlands and the canyon, Octonauts and Shraps in the frozen caves,
  snakes and Spicies in the swamp and the cenote, Meckeds (by kind) from the root caves to the ossuary, Wollas (by kind) from the canyon down, spiders in the nests, Triangles in the mines and ruins, Fire-faces,
  Fire-cats and Fire shraps in the volcanic depths and the abyss, and the Slugs and the Bolimes,
  which live nowhere else, in the slime marsh.
- **Kinds take turns where they fit, and get stronger with depth.** A kind keeps its colours
  everywhere; the rosters place it where its look and name fit ([enemy-kinds.md](enemy-kinds.md#the-palette)).
  Frost spiders, Frost stunders, Frost adders and the Shraps live in the snow and ice. Bog
  spiders, Bog octonauts, Bog wollas and Venom adders live in the swamp, with the Spicies and
  their Habaneros and the Bog meckeds; Nightshades in the nests. The Meckeds go ochre in the root caves,
  pale blue in the frozen caves, dark green in the swamp and the cenote and bone-white in the nests.
  The Tornados blow lilac over the meadows, pale blue over the snowy peaks and through the frozen
  caves, ochre over the badlands and the canyon, and on fire in the volcanic depths and the abyss. Stone stunders live in the badlands, canyons and
  nests, Amethyst shraps and Ash cats in the mines and the forge, and the fire kinds burn
  hotter the deeper they live (orange, yellow, blue). Within a species the stronger kinds take
  over deeper down. The snakes go from Grass snakes to Sand vipers (badlands), then Blood vipers,
  then Shadow mambas (nests, ruins and volcanic depths). Spiders go from plain spiders to Redbacks.
- **Still by depth, not yet by theme.** The rows were made when every depth had its own few
  themes. Now that a theme may appear anywhere in its act, the kinds picked for the themes that
  used to live at a depth (the Frost kinds at 3 and at 9–10, the Bog kinds at 11–12) turn up in
  whatever theme a world has there; only the `where` species follow their themes through the
  act. Giving the other kinds to their themes is still to do.
- **A species' kinds turn up about as often as each other.** Each takes its own stretch of
  depths rather than a sliver of another's: summed over the depths, no kind is seen more than
  about three times as often as its rarest sibling (`/tools/palette.html` measures it).
- **Rare guests preview the next theme.** A 10–20% roll lets a species show up a theme
  early: an Octonaut at 6 and 7, a Mecked at 6, a Shraps at 3, a Triangle at 10 and 15, a Blaze-face at 11 and 12, an Ash cat at 16.
- **Ranged species stay few.** Fire-faces, Triangles, Shraps, Spicies, Wollas, Wolks, Tornados and Slugs never go above 4 per
  cube, because several shooters at once are hard to read and to dodge. The Shraps throws and
  pinches, so it stays at 1–3; so does the Spicy, whose lasers are easy to dodge one at a time
  but not from three sides. The Wolk, whose lightning also stuns, comes alone or in twos, and so
  does the Tornado, whose twisters lift you and throw you down.
- **Melee species get more numerous.** Spiders go from 2–4 at depth 2 to 8–14 at 3, 20–28 in
  the nests, and up to 26 in the core. They spawn in packs, and the packs get bigger the
  deeper you go. Snakes grow the same way, but more slowly.

### Variety within a depth

Every cube rolls its own population with its own seeded stream (`population(map)`), so two
cubes at the same depth can feel quite different. Three controls decide how different:

1. **Chance**: each species rolls whether it is in the cube at all.
2. **Mix**: if more species roll present than `mix` allows, the extra ones are dropped.
   Always-present species are kept first. The rest are kept in a random order weighted by
   chance. A low mix means focused cubes (only spiders and a Stunder, say), and a high mix
   means mixed ones. Because of this cut, a rare species' real share can be lower than its
   chance. At depth 8, for example, the Triangle's 15% ends up at about 3%.
3. **Lead**: one present species (picked by chance) dominates the cube. It takes its count
   from the top half of its range, and every other species from the bottom half. This gives
   cubes like a spider den with a lone snake, or a snake pit with a few spiders, at the same
   depth.

Placement (`enemySpots` in `src/game/enemyspawn.js`) uses one seeded stream per species. The
first member of a pack keeps `profile.spacing` from every other enemy of its species. The
rest of the pack gathers within `1.5 + √size` cells of it, on the same level, at least 1.2
cells apart. Floors must have room for the biggest kind the entry can draw. If there is not
enough safe floor, fewer enemies spawn. In practice the target count is almost always met.
Each pack then draws its kind on a separate seeded stream, so kinds never move a spot.

With `?dev=1`, the depth line in the dev panel shows the cube's population. The lead species
is marked with `*`.

The console (`` ` ``, `docs/console.md`) can also spawn any enemy kind (`game/devspawn.js`):
`/spawn <enemy> [level] [count] [front|cursor]` (no level: the level this depth rolls for it;
the kind completes from its name, `/spawn red 5 3`). Spawns take the nearest floors that fit
their body, spread a little apart. `/kill` kills every enemy with XP and loot, `/remove`
removes them without, `/passive` makes enemies stand still and never attack. Spawns get ids of their own,
so they never count as the cube's defeated enemies, and vanish when the cube resets. Guardian
kinds keep their bars and drops but guard no gate. From the console:
`__game.spawnEnemy('redback', { level: 5, n: 3 })`, `__game.killEnemies()`,
`__game.clearEnemies()`. Checks: `await (await import('/tests/browser/dev.js')).runDevSpawnChecks()`.

### Measured population

These numbers come from 4 seeds and 32 cubes per depth on real generated cubes, guardian arenas
(with their doubled defenders and the guardian), wild packs in ordinary terrain and quieter approaches included (`node tools/depth-population.mjs`).
They are averages per cube, and "max" is the most enemies in any one cube. XP is at the
enemies' own levels, before the player's level scales it.

| Depth | Enemies | Max | XP | Depth | Enemies | Max | XP |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 2.8 | 7 | 163 | 11 | 16.6 | 36 | 2511 |
| 1 | 4.6 | 12 | 236 | 12 | 18.0 | 44 | 3056 |
| 2 | 7.9 | 18 | 423 | 13 | 18.1 | 30 | 3809 |
| 3 | 13.9 | 28 | 737 | 14 | 30.3 | 64 | 3795 |
| 4 | 12.6 | 26 | 890 | 15 | 28.1 | 58 | 3840 |
| 5 | 14.1 | 30 | 1155 | 16 | 12.4 | 32 | 3986 |
| 6 | 15.3 | 36 | 1492 | 17 | 18.6 | 40 | 5629 |
| 7 | 17.1 | 32 | 1478 | 18 | 16.1 | 50 | 6148 |
| 8 | 18.8 | 42 | 1812 | 19 | 12.2 | 24 | 6358 |
| 9 | 13.0 | 30 | 1812 | 20 | 16.8 | 33 | 7304 |
| 10 | 14.6 | 32 | 2373 |  |  |  |  |

The enemy count drops at a theme change that brings in stronger species (9, 16, 19). The
XP per cube keeps rising (or holds, at 7 and 9 and 14, where the theme changes).

## Enemy levels

- Base level: the depth (`depthLevel`), 1 on the surface, 20 at the core.
- Depths 0 and 1: always level 1.
- From depth 2: a seeded −1 / 0 / +1 roll, weighted 25% / 50% / 25%, clamped to at least 1.
  The roll is per cube, species and spawn floor, so it is stable when you come back.
- Guardians: a level above the depth (side), two above (descent), from depth 1 on.
- Levels never follow the player's level. Only HP, damage, XP and coins scale. Size, speed,
  timing and knockback stay the same. Kinds change those (`docs/enemy-kinds.md`).
- Every species grows at the same rate per level (`GROWTH`): HP +17%, damage +10%, XP and
  coins +25% of its level-1 values. Why these: [balance.md](balance.md).

## Species stats

At level 1; at level `L` multiply HP by `1 + 0.17 (L − 1)`, damage by `1 + 0.1 (L − 1)`, XP
and coins by `1 + 0.25 (L − 1)`, and round.

| Species | Tier | HP | Damage | XP | Coins (copper) | Poise |
|---|---|---:|---:|---:|---|---:|
| Spider | weak, swarms | 32 | 15 | 20 | 4–8 | – |
| Snake | weak | 48 | 16 | 30 | 6–12 | – |
| Flimmer | weak, in threes, blurry (40% of blows go through it while it shimmers) | 28 | 12 (a beating: four punches of 3, then 7) | 22 | 4–8 | – |
| Octonaut | medium | 90 | 20 (spin 28) | 55 | 12–22 | 0.8 s |
| Shraps | medium, throws | 110 | 22 (ice ball 20, chills) | 70 | 16–28 | 0.8 s |
| Spicy | medium, laser | 100 | 26 (laser burst) | 72 | 16–30 | 0.6 s |
| Wolla | medium, storm | 95 | 22 (storm, pushes back) | 64 | 14–26 | 0.6 s |
| Wolk | medium, lightning | 85 | 20 (bolt, stuns 0.9 s) | 60 | 12–24 | 0.5 s |
| Mecked | medium, grabs and bites | 105 | 20 (a grab: two bites of 12) | 66 | 14–26 | 0.6 s |
| Tornado | medium, twisters | 95 | 22 (twister, knocks down; slam 26) | 66 | 14–26 | 0.5 s |
| Slug | medium, slow, spits slime | 120 | 18 (slime ball, slows) | 62 | 12–24 | 0.8 s |
| Bolime | medium, pounces and swallows | 110 | 16 (swallowed: bites of 6.4 every 0.9 s) | 64 | 12–24 | 0.6 s |
| Stunder | heavy | 140 | 30 | 80 | 20–35 | 1.5 s |
| Fire-face | strong, ranged | 120 | 22 (+6 burn) | 90 | 24–40 | 0.8 s |
| Fire-cat | strong | 130 | 26 | 95 | 22–38 | 0.4 s |
| Triangle | strong, ranged | 170 | 28 | 110 | 28–46 | 1.2 s |

These are the base kinds. The other kinds multiply them (`docs/enemy-kinds.md`). For example, a
level 5 Blood viper has `round(67 × 1.68)` = 113 HP. Poise: for how long after a stagger lighter
hits do not stagger it again ([combat.md](combat.md)).

For example, at depth 20 (level 20): spider 135 HP / 44 damage, Stunder 592 HP / 87 damage,
Triangle 719 HP / 81 damage, a Magma stunder 799 HP / 122 damage. The player arrives there at
about level 22 with 310 HP and a weapon dealing about 190 a hit.
