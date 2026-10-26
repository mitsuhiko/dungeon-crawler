# Theme library (artwork for new themes)

![All 10 sets](../img/themes.jpg)

![Prayer highlands vignette](../img/themes-highlands-vignette.jpg)

![Dark forest](../img/themes-darkforest.jpg)

![Dark forest vignettes and landmarks](../img/themes-darkforest-landmarks.jpg)

![Slime marsh](../img/themes-slime.jpg)

![Slime marsh vignettes and landmarks](../img/themes-slime-landmarks.jpg)

Artwork for thirteen alternative themes, and landmarks for the eleven classic ones: **235 prop
types, 409 meshes, 122,573 triangles**. These were built and checked through Blender MCP. The
style and contract are the same as `blender/clutter.py` (low-poly, flat-shaded,
vertex-coloured, one mesh per prop). **Hooked up to the game** as themes a world may pick for
their depths alongside the classic ones, and every depth builds its major reward site around one of its
theme's landmarks (see "Integration"); flag lines and the honey fluid are not built yet.

## Files

- `blender/themes.py`: library driver (specs, build, validation, export, showroom,
  previews, highlands vignette).
- `blender/themes_geo.py`: shared helpers (cloth sheets, ribbons, lettering, lofts,
  wobble/streaks for rock) and the palette (`LUNGTA`, `WHITEWASH`, `MAROON`, `GOLD`, ...).
- `blender/themes_highlands.py`, `blender/themes_surface.py`, `blender/themes_caves.py`,
  `blender/themes_canyon.py`, `blender/themes_darkforest.py`, `blender/themes_slime.py`: the builders; `blender/themes_classic.py`: the classic themes' landmarks;
  `blender/themes_museum.py`: Mansk's museum (no theme: what his arena is dressed with).
- `assets/themes/<set>.glb`: the library, one file per set, every prop a named root at the origin
  (the game loads a set when a cube shows it).
- `assets/themes/manifest.json`: per-prop set, attach, flags, triangles, sizes, bounds,
  footprint/height/anchors, and the landmarks' role, colliders and occluders.
- `blender/themes.blend`: the editable showroom. Each set gets a block (ground props in columns, a
  cliff with wall/lip props, a pool for water props and a slab for ceiling props), plus a
  landmark row and the highlands vignette scene.
- `blender/previews/themes/<set>.png`, `<set>-landmarks.png`, `highlands-vignette.png`,
  `blender/previews/themes-preview.png` (local renders, not committed; the pictures above are
  copies in `docs/img/`, `node tools/preview-images.mjs`).

`props.py`'s `finish()` gained a `line` radius case and `clutter.check()` takes a
`fluids` argument. The clutter library still exports byte-identically and `test_clutter.py` passes.

## Sets

| Set | Theme (act) | Mood |
|---|---|---|
| highlands | Prayer highlands (I) | Tibetan prayer-flag hills: whitewash, maroon, gold, the five flag colours, turquoise lakes |
| karst | Karst terraces (I) | Guilin limestone needles, rice terraces, bamboo, red pavilions |
| clouds | Cloud kingdom (I) | Cloud kingdom: puffs, wind chimes, storm jars, sky gates |
| saltflats | Salt flats (I) | White salt crust, pink halite, flamingos, brine pools |
| lagoon | Lagoon isles (I) | Palms, sand, rowboats, a shipwreck, stilt huts |
| canyon | Deep canyon (I) | Sandstone strata, cottonwoods by the river, hoodoos, petroglyphs, cliff dwellings |
| darkforest | Dark forest (I) | Wooded hills at night: tall firs, lanterns, glowing mushrooms, old stones, abandoned sheds |
| slime | Slime marsh (II, open) | Moss and pools of toxic slime: drooping slime trees, goo mounds with bones in them, bubbling vents, meteorite craters |
| museum | none: Mansk's arena (I, depth 6) | A museum hall with a stage: things on show on pedestals and in glass cases, gold-framed paintings, a red stage curtain, velvet ropes, footlights and spotlights ([bosses.md](../bosses.md#mansk)) |
| hive | Honey hive (II) | Honey hive: wax, comb, honey fluid (slows rather than hurts) |
| cenote | Jungle cenote (II, open) | Sunlit jungle temple: jade, glyphs, vines, a step shrine |
| grotto | Sunken grotto (II) | Sunken grotto: kelp, clams, glowing jellies, a sunken bell |
| forge | Dwarven forge (II, open: a works yard) | Dwarven forge: pipes, gears, anvils, slag, steam vents |
| ossuary | Ossuary (III) | Candlelit catacombs: bone walls, urns, candelabra (spooky but friendly) |

## Props

| Set | Props (attach; flags) |
|---|---|
| highlands | `tussock_grass` (ground; cover; sway 0.35), `scree_patch` (ground; cover), `lungta_scraps` (ground; cover), `blue_poppy` (ground; sway 0.3), `juniper_shrub` (ground; sway 0.1), `mani_stones` (ground), `lhatse` (ground; blocking; sway 0.2; anchor), `tharchok` (ground; blocking; sway 0.15; anchor), `chorten_small` (ground; blocking; anchor), `prayer_wheel` (ground; blocking), `butter_lamps` (ground; light #ffc060), `sang_burner` (ground; light #ff9a50), `yak_skull` (ground), `khata_drape` (lip; sway 0.4), `flag_drape` (lip; sway 0.5), `prayer_wheel_row` (wall), `tsatsa_niche` (wall), `glacier_floe` (water), `flag_run` (line; sway 0.6) |
| highlands landmarks | `chorten_great` (light #ffd080; 5 anchors), `nomad_tent` (1 anchor), `mani_wall` (2 anchors), `hermitage` (2 anchors) |
| karst | `rice_shoots` (ground; cover; sway 0.4), `moss_stones` (ground; cover), `bamboo_clump` (ground; blocking; sway 0.3), `banana_plant` (ground; sway 0.3), `stone_lantern` (ground; blocking; light #ffd080), `scarecrow` (ground; sway 0.1), `rice_sheaves` (ground), `karst_needle` (ground; blocking), `lotus` (water), `bamboo_raft` (water), `fern_curtain` (lip; sway 0.35), `wall_shrine` (wall; light #ffb060) |
| karst landmarks | `pavilion`, `karst_tower` |
| clouds | `cloud_tufts` (ground; cover), `wind_feathers` (ground; cover), `cloud_bush` (ground; sway 0.15), `storm_jar` (ground; light #a8d0ff), `wind_chimes` (ground; sway 0.5), `rainbow_crystal` (ground; light #e8f0ff), `sky_nest` (ground), `weather_vane` (ground; blocking), `cloud_spill` (lip; sway 0.2), `raincloud` (ceiling; sway 0.15) |
| clouds landmarks | `sky_gate`, `wind_harp` |
| saltflats | `salt_crust` (ground; cover), `salt_crystals` (ground; cover), `salt_pillar` (ground; blocking), `pink_halite` (ground), `flamingo` (ground; sway 0.05), `salt_bricks` (ground; blocking), `bleached_shrub` (ground), `salt_cones` (ground), `brine_crystals` (water), `wading_flamingo` (water), `salt_crust_lip` (lip) |
| saltflats landmarks | `salt_harvest`, `salt_arch` |
| lagoon | `shell_scatter` (ground; cover), `sand_ripples` (ground; cover), `palm_tree` (ground; blocking; sway 0.3), `beach_grass` (ground; sway 0.4), `driftwood` (ground), `tiki_torch` (ground; light #ffa040), `rowboat` (ground; blocking), `buried_chest` (ground), `crab` (ground), `coral_head` (water), `seaweed_drape` (lip; sway 0.3), `barnacles` (wall) |
| lagoon landmarks | `shipwreck`, `stilt_hut` |
| canyon | `desert_grass` (ground; cover; sway 0.3), `red_gravel` (ground; cover), `cottonwood` (ground; blocking; sway 0.15), `yucca` (ground; sway 0.1), `sagebrush` (ground; sway 0.15), `hoodoo` (ground; blocking), `cairn` (ground), `petroglyph_boulder` (ground; blocking), `clay_pots` (ground), `luminaria` (ground; light #ffb060), `hanging_garden` (lip; sway 0.3), `petroglyph_panel` (wall), `river_reeds` (water; sway 0.3) |
| canyon landmarks | `cliff_dwelling`, `canyon_arch`, `balanced_rock` |
| hive | `wax_flakes` (ground; cover), `pollen_dust` (ground; cover), `comb_mound` (ground; blocking; light #ffb030), `wax_candles` (ground; light #ffd080), `larva_cells` (ground), `honey_pot` (ground), `giant_flower` (ground; sway 0.2), `bee_husk` (ground), `honey_bubbles` (water; honey), `comb_raft` (water; honey), `wall_comb` (wall; light #ffb030), `honey_drips` (ceiling; sway 0.1), `honey_overflow` (lip) |
| hive landmarks | `comb_tower` (light #ffb030), `royal_cell` (light #ffe090) |
| cenote | `jungle_litter` (ground; cover), `jade_shards` (ground; cover), `monstera` (ground; sway 0.25), `orchid_rock` (ground), `jade_idol` (ground; blocking), `serpent_head` (ground; blocking), `copal_bowl` (ground; light #ffb050), `macaw_perch` (ground; sway 0.1), `hanging_vines` (ceiling; sway 0.4), `jungle_drape` (lip; sway 0.35), `glyph_panel` (wall), `cenote_lilies` (water) |
| cenote landmarks | `step_shrine`, `ceiba_roots` |
| grotto | `sea_glass` (ground; cover; light #7fe0ff), `pearl_sand` (ground; cover), `kelp_stalk` (ground; sway 0.5), `anemone` (ground; light #ff7ad0; sway 0.2), `giant_clam` (ground; light #e8f4ff), `brain_coral` (ground), `sunken_anchor` (ground; blocking), `jelly_lantern` (ground; light #9ae0ff), `jellyfish` (water; light #a8e8ff), `glow_strands` (ceiling; light #7fe8ff; sway 0.2), `coral_wall` (wall; light #ff9ad0), `kelp_drape` (lip; sway 0.4) |
| grotto landmarks | `sunken_bell`, `giant_shell` (light #9ae0ff) |
| forge | `metal_shavings` (ground; cover), `slag_bits` (ground; cover; light #ff7030), `anvil_block` (ground; blocking), `ingot_stack` (ground), `gear_pile` (ground), `steam_vent` (ground), `crucible` (ground; light #ff8030), `valve_pipe` (ground; blocking), `coal_bin` (ground; blocking), `pipe_run` (wall), `gauge_panel` (wall; light #7aff9a), `chain_hoist` (ceiling; sway 0.15), `slag_raft` (water; lava; light #ff6020), `pipe_bend` (lip) |
| forge landmarks | `great_gear`, `furnace` (light #ff7a30) |
| ossuary | `bone_dust` (ground; cover), `candle_stubs` (ground; cover; light #ffb060), `skull_pile` (ground), `candelabra` (ground; light #ffc070), `sarcophagus` (ground; blocking), `funeral_urn` (ground), `bone_lantern` (ground; light #ffc070), `skull_wall` (wall), `candle_niche` (wall; light #ffb060), `bone_chandelier` (ceiling; light #ffc070; sway 0.15), `skull_ledge` (lip) |
| ossuary landmarks | `bone_arch`, `crypt_shrine` (light #ffb060) |
| darkforest | `leaf_litter` (ground; cover), `glowcap_patch` (ground; cover; light #7af0ff; pulse), `moss_mound` (ground; cover), `dark_fir_tree` (ground; blocking; sway 0.06; anchor on the trunk), `gnarled_tree` (ground; blocking; sway 0.08; 4 anchors at its branch ends), `bare_tree` (ground; blocking; sway 0.05; 4 anchors), `glow_mushrooms` (ground; light #5affc8; pulse), `giant_glowshroom` (ground; blocking; light #c890ff; pulse), `mossy_stump` (ground; blocking; light #5affc8; pulse), `lantern_post` (ground; blocking; light #ffb85a; flame), `standing_stone` (ground; blocking; light #8ab8ff; pulse), `rotten_log` (ground; blocking; light #7af0ff; pulse), `twig_charm` (ground; sway 0.25), `dark_fern` (ground; sway 0.3), `bramble` (ground; sway 0.1), `shelf_fungus` (wall; light #5affc8; pulse), `root_drape` (lip; sway 0.3), `hanging_lantern` (ceiling; light #ffb85a; flame; sway 0.15), `black_lilies` (water; light #c8fff0; pulse), `lantern_string` (line; light #ffc070; flame) |
| darkforest vignettes | `abandoned_shed` (light #ffb85a; flame), `collapsed_cabin` (light #5affc8; pulse), `woodcutter_camp` (light #ffb85a; flame), `wayside_shrine` (light #ffc070; flame), `stone_circle` (light #8ab8ff; pulse), `overgrown_wagon` (light #ffb85a; flame) |
| darkforest landmarks | `lantern_tree` (light #ffb85a; flame), `mossy_arch` (light #7af0ff; pulse), `forest_chapel` (light #ffc070; flame) |
| slime | `slime_moss` (ground; cover), `goo_puddle` (ground; cover; light #b8ff5a; pulse), `slime_tree` (ground; blocking; sway 0.05; light #b8ff5a; pulse; anchor on the trunk), `slime_mushrooms` (ground; light #b8ff5a; pulse), `goo_mound` (ground; blocking; light #b8ff5a; pulse), `slimed_rock` (ground; blocking; light #b8ff5a; pulse), `bubble_vent` (ground; light #d8ff9a; pulse), `slime_reeds` (ground; sway 0.3), `bulb_tree` (ground; blocking; sway 0.06; light #b8ff5a; pulse; anchors at its bulbs), `dead_slimed_tree` (ground; blocking; sway 0.04; light #b8ff5a; pulse), `spore_pods` (ground; light #b8ff5a; pulse; sway 0.15), `glow_stalk` (ground; blocking; light #b8ff5a; pulse; sway 0.08: the lamp by the way), `slime_seep` (wall; light #b8ff5a; pulse), `slime_drip` (lip; light #b8ff5a; pulse), `goo_pads` (water; acid; light #b8ff5a; pulse) |
| slime vignettes | `slimed_cart` (light #b8ff5a; pulse), `swallowed_hut` (light #ffd070; flame), `fresh_meteor` (light #b8ff5a; pulse) |
| slime landmarks | `meteor_crater` (light #b8ff5a; pulse), `giant_slime_tree` (light #b8ff5a; pulse) |
| museum | `pedestal_vase` (ground; blocking: an amphora, a porcelain vase), `pedestal_bust` (ground; blocking: a marble bust, one in a gold helmet), `display_case` (ground; blocking; light #cfe4ff; pulse: a crown, or a little horned mask like his), `statue` (ground; blocking: a dancer with ribbons; a figure holding up a horned mask, light #8fc8ff; pulse), `rope_posts` (ground), `plaque` (ground), `footlights` (ground; light #ffd890; flame: gaslights), `spotlight` (ground; blocking; light #fff0c8; pulse), `painting` (wall: hills under a sun, a lady in black), `curtain` (wall: red, a gold fringe, tied back or hanging straight) |

### Landmarks

Every theme has at least two (the highlands four). Their role says how a reward site is built
around them (`cubegen/sites.js`):

| Role | Site | Landmarks |
|---|---|---|
| shrine | the chest stands in front of it | `meteor_crater`, `chorten_great`, `royal_cell`, `step_shrine`, `giant_shell`, `furnace`, `crypt_shrine`, `forest_chapel`, `wishing_well`, `hollow_stump`, `ice_throne`, `giant_geode`, `fire_shrine`, `void_throne` |
| gate | you walk through it to the chest behind it | `salt_arch`, `canyon_arch`, `bone_arch`, `mossy_arch`, `ice_arch`, `root_gate`, `web_gate`, `headframe`, `temple_gate` |
| camp | the chest stands beside it, with small things of the theme around | `nomad_tent`, `hermitage`, `pavilion`, `cliff_dwelling`, `salt_harvest`, `shipwreck`, `stilt_hut`, `expedition_camp`, `covered_wagon`, `witch_hut` |
| monument | it stands beside the chest, reaching back | `mani_wall`, `karst_tower`, `balanced_rock`, `sky_gate`, `wind_harp`, `comb_tower`, `ceiba_roots`, `sunken_bell`, `great_gear`, `lantern_tree`, `giant_slime_tree`, `windmill`, `windpump`, `frozen_falls`, `giant_toadstool`, `brood_cluster`, `colossus_head`, `fumarole`, `chained_obelisk` |

The classic themes' landmarks (`themes_classic.py`): meadow `windmill`, `wishing_well`; peaks
`expedition_camp`, `ice_arch`; badlands `covered_wagon`, `windpump`; roots `root_gate`,
`hollow_stump`; frozen `ice_throne`, `frozen_falls`; swamp `giant_toadstool` (light #8fff7a),
`witch_hut` (light #8fff7a); nests `web_gate`, `brood_cluster`; mines `headframe` (light
#ffcf8a), `giant_geode` (light #c08fff); ruins `temple_gate`, `colossus_head`; volcanic
`fire_shrine` (light #ff6a20), `fumarole` (light #ff7a30); abyss `chained_obelisk` (light
#ff3030), `void_throne` (light #a050ff). They are named after the classic sets
(`meadow_windmill_a`) but only live in `assets/themes/`; the classic sets get nothing else here.

Their colliders and occluders are derived from the mesh when the library is built
(`volumes()` in `themes.py`, nothing authored by hand). The mesh is sampled on an eighth-cell
raster of vertical columns. A column with geometry in the walking band (over a step, 0.3,
under head height, 1.3) is solid from the ground to its top; what such columns enclose (a
tower's inside) is solid too. A column with geometry only above the band (a lintel, a roof)
is an overhang the character walks under but cannot jump through. Below 0.3 nothing counts:
it is walked over like ground cover. Colliders are merged into boxes on a quarter-cell raster,
occluders (for the cutaway) on the eighth-cell one with half-unit heights. Gates are checked to
leave a way through along their Z axis at x = 0.

Regular props come in `_a`/`_b` variants. Landmarks have a single variant. Object names are
`<set>_<prop>_<a|b>`, matching the clutter library, and no names collide with it.

## Contract additions

Everything in `docs/assets/clutter.md` applies. In addition:

| extra | meaning |
|---|---|
| `attach: "line"` | One segment of a hanging string. Origin at the string's start; it runs along glTF +X from 0 to 1 (one cell) at y = 0, flags hang below (y < 0), thin along Z. The game stretches it along a sagging curve. Shear each segment vertically (do not rotate it) so the flags keep hanging straight down. `string_segments()` in `themes.py` is the reference. ≤ 400 triangles. |
| `landmark: true` | A ground prop bigger than one cell. It is a destination piece placed deliberately, like town buildings, and is never scattered. Radius ≤ 1.75, ≤ 4000 triangles. Adds `footprint` [x, z] in cells and `height`. Its front (what faces the approach) is glTF +Z. |
| `role` | Landmarks: `shrine`, `gate`, `camp` or `monument` (see "Landmarks"). |
| `colliders` / `occluders` | Landmarks: `[x0, z0, x1, z1, bottom, top]` boxes in glTF space, derived from the mesh. |
| `anchors` | Points in glTF space (Y up) where flag strings may be tied: pole tops, chorten spires, tent ridges, wall ends; on the dark forest's trees, where lanterns hang and their strings are tied. They follow the prop when `finish` shrinks it to its radius and stands it on the ground. |
| `fluid: "honey"` | A new fluid for the hive. |
| `vignette: true` | A little set piece the generator scatters through the theme's rooms (`cubegen/vignettes.js`): a ground prop bigger than one cell like a landmark (radius ≤ 1.75, ≤ 4000 triangles, `footprint`, `height`, `colliders`, `occluders` derived from the mesh, front glTF +Z), but no role and never a reward site. |
| `flicker` | How a prop's light lives: `"flame"` flickers like a fire (lanterns, candles), `"pulse"` breathes slowly (glowing mushrooms, runes). Needs `light`. |

## Integration

Done (see [world.md](../world.md#themes-per-world-themesindexjs-themescavesjs-themesdepthjs)):

- Theme slots: each slot of depths offers alternative themes and the world seed picks one per
  slot (`themes/depth.js worldThemes`). The world stamps the theme's id on every spec and map
  (`biome`), and `themeOf(map)` reads it back. `?theme=clouds,forge` forces picks in dev mode.
- A theme entry per set (`themes/index.js`, `themes/caves.js`): palette, light, archetypes, WFC
  weights, void, relief, fluids. Structure materials (`themes/builds.js`), footstep surfaces
  (`core/footing.js`), wind and drips (`game/ambience.js`), guardian arena palettes
  (`cubegen/arenaprops.js`) and reward-site recipes (`cubegen/sites.js`) for every set.
- `src/render/props.js` loads a set's file (with its `props/` and `clutter/` files) when a cube
  shows the set; `src/core/propmetadata.js` includes it (`npm run compress-assets` regenerates it). The ambient scatter uses the sets' ground, cover, lip, wall and
  water props. Landmarks and `line` segments count as signature props: never scattered.
- Landmarks: each depth's major reward site (rare or exceptional) is built around one of its
  theme's landmarks, chosen with the site's plan (`world/sites.js`; the next depth of the same
  theme gets the next one). The site is laid out by the landmark's role; its colliders block
  the cells the character could not stand on, and its overhangs keep structures out
  (`cubegen/sites.js placeLandmark`). The map gets the colliders (`staticBlockers`), the
  occluders and `rewardSites[].landmark` ({ name, role, x, y, z, yaw, anchors in cube space }).
  Landmarks also show in the low-detail surroundings (`render/neighbors.js`).
  Checks: `tests/landmarks.test.js`.
- Vignettes: the dark forest's little set pieces, about 1.2 a room, placed off the way so they
  never cut anything off (`cubegen/vignettes.js`, [world.md](../world.md#vignettes-cubegenvignettesjs)),
  colliders and occluders like a landmark's; they show in the surroundings too. Checks:
  `tests/vignettes.test.js`.
- Lines: the dark forest ties strings of lanterns (`lantern_string`) between its trees' anchors
  (`render/propplace.js` strings, `tests/grove.test.js`); the highlands' flag lines are not tied
  yet.

Still to do:

- Songs of their own (each alternative plays its slot's classic song) and enemy rosters that
  follow the theme (rosters go by depth: frost spiders in the highlands are fine, in the grotto
  less so).
- Highlands needs:
  - A flag-line pass that connects anchors 3–8 cells apart above head height, plus the fan
    layout from `chorten_great`/`tharchok` down to pegs.
  - A turquoise water tint.
  - A snowy mountain ring in `render/sky.js`.
  - Wind gusts that stiffen the flags.
- Hive needs a honey fluid (slows instead of hurting); until then its rivers are water and
  `honey_bubbles` / `comb_raft` are never placed. Forge steam vents can reuse the gust push
  upwards.

## Rebuild

```sh
Blender --background --python blender/themes.py                 # build, export, previews
Blender --background --python blender/themes.py -- --no-render
npm run compress-assets                                          # then compress (README.md)
```

MCP: see the `themes.py` docstring for the reload order.
