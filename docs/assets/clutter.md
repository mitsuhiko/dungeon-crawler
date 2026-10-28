# Clutter library (second scatter set)

![All 13 sets](../img/clutter.jpg)

120 prop types × 2 variants = **240 meshes, 44,584 triangles**, built and inspected
through Blender MCP. Same low-poly, flat-shaded, vertex-coloured style and contract
as `blender/props.py` / `assets/props/`; this is an *addition*, not a replacement.
**Hooked up to the game**, including cover, shore, fluid-surface and cliff-lip placement.
Signature props are reserved for deliberate destination arrangements.

## Files

- `blender/clutter.py`: library script (specs, build, validation, export, showroom, previews).
- `blender/clutter_geo.py`: shared geometry helpers and palette (on top of `props.Mesh`).
- `blender/clutter_surface.py`, `blender/clutter_depths.py`: builders for any/relics/meadow/peaks/badlands/roots
  and frozen/swamp/nests/mines/ruins/volcanic/abyss.
- `assets/clutter/<set>.glb`: the library, one file per set, every prop a named root at the origin
  (the game loads a set when a cube shows it).
- `blender/clutter.blend`: an editable showroom with one block per set (ground props in columns,
  variant `a` in front; a cliff with wall/lip props; a pool with water props; a floating
  slab with ceiling props). The preview geometry is in `ClutterPreview_NOT_EXPORTED`.
- `blender/previews/clutter/<set>.png`: per-set preview renders; `blender/previews/clutter-preview.png`: all of them stacked (local, not committed; the picture above is a copy in `docs/img/`, `node tools/preview-images.mjs`).
- `assets/clutter/manifest.json`: per-prop set, attach, flags, triangles, sizes and Blender bounds.
- `blender/tests/test_clutter.py`: determinism, validation and actual binary-GLB checks.

`props.py`'s `finish()` gained two attachment modes (`lip`, `water`). Existing props
export byte-identically.

## Props

| Set | Pri | Props (attach; flags) |
|---|---|---|
| any | P1 | `gravel_patch` (ground; cover), `stone_chips` (ground; cover), `rock_outcrop` (wall), `rock_slab` (ground), `cairn` (ground) |
| any | P2 | `shore_stones` (ground; shore) |
| relics | P1 | `adventurer_remains` (ground), `old_campfire` (ground), `abandoned_pack` (ground), `torch_sconce` (wall; light #ffb060) |
| relics | P2 | `broken_shield` (ground), `signpost` (ground), `sword_in_ground` (ground) |
| meadow | P1 | `clover_patch` (ground; cover), `daisies` (ground; cover; sway 0.3), `island_roots` (ceiling; sway 0.25), `grass_drape` (lip; sway 0.4), `lily_pads` (water; water), `cattails` (ground; shore; sway 0.5), `fern` (ground; sway 0.35) |
| meadow | P2 | `berry_bush` (ground; sway 0.15), `fairy_ring` (ground), `sapling` (ground; sway 0.3) |
| peaks | P1 | `snow_patch` (ground; cover), `frost_grass` (ground; cover; sway 0.3), `snow_cornice` (lip), `alpine_flowers` (ground; sway 0.3) |
| peaks | P2 | `expedition_flag` (ground; sway 0.5), `dead_pine_snag` (ground; blocking) |
| badlands | P1 | `cracked_mud` (ground; cover), `dry_grass` (ground; cover; sway 0.4), `prickly_pear` (ground), `agave` (ground), `rib_cage` (ground; blocking), `broken_wagon_wheel` (ground) |
| badlands | P2 | `termite_mound` (ground; blocking), `dry_root_drape` (lip; sway 0.2), `oasis_reeds` (ground; shore; sway 0.5) |
| roots | P1 | `leaf_litter` (ground; cover), `moss_patch` (ground; cover), `root_web` (wall), `glowworm_threads` (ceiling; light #7fd8ff; sway 0.15) |
| roots | P2 | `burrow_mound` (ground), `cave_fern` (ground; sway 0.3), `root_drape` (lip; sway 0.2) |
| frozen | P1 | `frost_crust` (ground; cover), `ice_chips` (ground; cover), `frost_crystals` (wall), `ice_floe` (water; water), `frozen_adventurer` (ground; blocking) |
| frozen | P2 | `ice_pillar` (ground; blocking), `frozen_drape` (lip) |
| swamp | P1 | `moss_carpet` (ground; cover), `tiny_glowcaps` (ground; cover; light #8fff7a), `swamp_lilies` (water; water; light #c8ff9a), `algae_mat` (water; water), `fungal_tree` (ground; blocking; light #8fff7a), `hanging_moss` (lip; sway 0.4) |
| swamp | P2 | `acid_foam` (water; acid; light #7dff3a), `mangrove_roots` (ground; shore; blocking), `puffballs` (ground), `pitcher_plant` (ground) |
| nests | P1 | `web_floor` (ground; cover), `husk_scraps` (ground; cover), `web_sheet` (wall), `shed_exoskeleton` (ground), `glow_spores` (ground; cover; light #c8a0ff), `glow_eggs` (ground; light #c8a0ff), `pale_fungus` (ground; light #e0d8ff), `dew_web` (wall; light #a8d0ff), `silk_drape` (lip; sway 0.2) |
| nests | P2 | `web_pillar` (ground; blocking), `wall_eggs` (wall), `hanging_egg_sacs` (ceiling; sway 0.2), `webbed_crate` (ground; blocking), `glow_silk` (lip; light #d0b0ff; sway 0.2) |
| mines | P1 | `ore_chips` (ground; cover), `coal_scatter` (ground; cover), `wall_lantern` (wall; light #ffcf8a), `ore_vein` (wall; light #8fa8ff, `_b` #c08fff), `hanging_lantern` (ceiling; light #ffcf8a; sway 0.15), `pickaxe_in_rock` (ground), `ore_pile` (ground) |
| mines | P2 | `wheelbarrow` (ground; blocking), `plank_stack` (ground; blocking), `sacks` (ground), `tipped_cart` (ground; blocking), `dynamite_crate` (ground; blocking), `pulley_hook` (ceiling; sway 0.2) |
| ruins | P1 | `broken_tiles` (ground; cover), `sand_drift` (ground; cover), `wall_relief` (wall), `urn` (ground), `toppled_column` (ground; blocking), `obelisk_broken` (ground; blocking), `oil_lamps` (ground; light #ffb860; a fire), `wall_brazier` (wall; light #ffa040; a fire) |
| ruins | P2 | `hanging_censer` (ceiling; light #ffb050; sway 0.2), `altar` (ground; blocking), `collapsed_arch` (ground; blocking), `stone_tablet` (ground), `glyph_stone` (ground; light #8ad8ff) |
| volcanic | P1 | `cinders` (ground; cover; light #ff6a20), `pumice_chips` (ground; cover), `magma_seep` (wall; light #ff6a20), `lava_crust` (water; lava; light #ff5a1a), `sulfur_vent` (ground) |
| volcanic | P2 | `rope_lava` (ground), `fire_crystal` (ground; light #ff8a3a), `lava_stalactite` (ceiling; light #ff5a1a), `scorched_bones` (ground) |
| abyss | P1 | `void_flakes` (ground; cover), `dangling_chains` (lip; sway 0.2), `void_crystal` (ground; light #a050ff), `ritual_circle` (ground; light #ff3030), `wall_shackles` (wall), `wall_runes` (wall; light #ff3030) |
| abyss | P2 | `hovering_rock` (ground; blocking), `weapon_graveyard` (ground; blocking), `broken_altar` (ground; blocking) |

Object names are `<set>_<prop>_<a|b>`, so the existing `registerProps()` split
(`set` = first token, `base` = the middle) works unchanged. No name collides with
`props/`. `any_*` props are strictly neutral grey (validated) for the per-theme tint;
ruins masonry is neutral as in `props/`; everything else, including `relics`, is coloured.

## Contract (Blender Z up → glTF Y up, Blender +Y → glTF -Z)

- One mesh per prop with flat normals and `COLOR_0`; material `Props_VertexColor`, plus
  `<name>_glow` (emissive) on props with a `light` hint. No textures, UVs, rigs or animation.
- Extras: `attach`, `radius`, `blocking`, `priority`, optional `light`, `intensity`, `sway`,
  and the new `cover`, `shore`, `fluid`, `drop`.
- Budgets: cover ≤ 200 triangles, others ≤ 400, `fungal_tree` ≤ 600; ground footprint radius ≤ 0.45.

| attach | origin / extent | game placement |
|---|---|---|
| `ground` | base centre, base at y=0 | as today |
| `ground` + `cover` | ≤ 0.3 tall, radius ≤ 0.35, never blocking | NEW pass: 0–3 per dry cell, also on route/landings and slopes |
| `ground` + `shore` | as ground | only on dry cells with a fluid neighbour |
| `ceiling` | hangs down from y=0 | as today |
| `wall` | back flat on the wall plane, sticks out along glTF -Z | as today |
| `lip` | origin on the cliff's top edge; cliff body is glTF z>0 & y<0. May lie on the top (y≥0, ≤ 0.25 high, up to 0.35 back) and drapes down the face; `drop` = hang depth, `radius` = half-width along the edge | NEW: top edge of a cliff ≥ `drop` + 0.2 high (or a void edge), yaw like walls, at the top corner height |
| `water` | origin on the surface, ≈ ±0.2 around it; `fluid` = water/lava/acid | NEW: on fluid cells at `surf * LH`, matching fluid; may bob slowly |

## Generator integration

`src/render/props.js` loads both libraries and the closed-chest preview.
`propplace.js` supports all five attachments and preserves the new extras:

- Cover is a separate 0–2-per-floor draw, allowed on terrain routes and slopes;
  slope placements tilt to the local floor normal. It does not cover structure decks.
- Shore props require a nearby fluid bank; surface props match the fluid type.
- Lip props require sufficient hanging clearance, accounting for instance scale.
- Non-signature `relics` appear at low weight in caves.
- Glowing cover remains emissive-only, outside the six-point-light budget.
- Destination reservations keep ambient clutter away from rewards and approaches.
  Focal assets such as altars, ritual circles and abandoned expeditions are recipe-only.

`src/cubegen/sites.js` authors destination arrangements before reachability
validation, using worker-safe bounds/collider metadata. `npm run compress-assets` after
re-exporting models compresses them and regenerates the metadata. The game tests verify
that the metadata still matches actual GLBs.

Cross-biome borrowing (e.g. ice floes in peaks or meadow ferns in roots) is not yet
implemented. See `docs/generation-plan.md` for the destination roadmap.

## Rebuild / validate

From the repository root (replace `Blender` with your executable):

```sh
Blender --background --python blender/clutter.py            # build, export, previews
Blender --background --python blender/clutter.py -- --no-render
Blender --background --python blender/tests/test_clutter.py
Blender --background --python blender/props.py    # unchanged library
npm run compress-assets                            # then compress (CONTRIBUTING.md)
```

MCP: `import clutter; clutter.main()` (see the `clutter.py` docstring for the reload order).
