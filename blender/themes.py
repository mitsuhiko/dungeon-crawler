"""
Theme library for The Glass Bird: artwork for themes the game does not have yet.

Same contract as clutter.py (and props.py): one Blender unit = one game cell, Z up,
flat normals, linear COLOR_0, ONE mesh per prop named "<set>_<prop>_<variant>" at the
origin, glTF extras (attach, radius, blocking, priority, light, intensity, sway, cover,
shore, fluid, drop), an optional "<name>_glow" emissive material. Nothing here is
hooked up to the game yet; see docs/assets/themes.md for the sets and the plans.

On top of the clutter attachments ("ground", "ceiling", "wall", "lip", "water") this
library adds:

    attach "line"     one segment of a string hung between two anchors (prayer flags).
                      Origin at the start of the string, the string runs along +X from
                      x = 0 to x = 1 (one cell) at z = 0, the flags hang below (z < 0),
                      thin along Y. The game stretches and bends segments along a sagging
                      curve (see the highlands vignette for how).
    landmark: true    a ground prop bigger than one cell: a destination piece, placed
                      deliberately (like the town buildings), never scattered. Extras
                      add footprint [x, z] in cells and height.
    anchors           optional extra: points (glTF space, Y up) where strings may be tied,
                      e.g. the top of a flag pole or a chorten's spire.
    vignette: true    a ground prop bigger than one cell like a landmark (colliders,
                      occluders, footprint and height), but a little set piece the generator
                      scatters through a theme's rooms (an abandoned shed), never a reward site.
    flicker           how a prop's light lives: "flame" (it flickers like a fire: lanterns,
                      candles) or "pulse" (it breathes slowly: glowing mushrooms, runes).
    fluid "honey"     a new fluid for the honey hive.

Builders live in themes_highlands.py, themes_surface.py, themes_caves.py, themes_canyon.py,
themes_darkforest.py, themes_slime.py and themes_museum.py (Mansk's museum: no theme, what his
arena is dressed with); the classic
themes' landmarks (the sets of props.py and clutter.py) in themes_classic.py.

Landmarks also get a role (how a reward site is built around them) and two lists of boxes
derived from their mesh (volumes()): colliders and occluders for the cutaway.

Headless (build, validate, export, save the showroom, render previews):
    Blender -b --python blender/themes.py -- [output-directory] [--no-render]

Default output: assets/themes/<set>.glb + assets/themes/manifest.json, blender/themes.blend,
renders in blender/previews/ (themes-preview.png, themes/<set>.png,
themes/<set>-landmarks.png, themes/highlands-vignette.png).

Inside Blender / MCP:
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, props, clutter_geo, clutter, themes_highlands, themes_surface, themes_caves, themes_canyon, themes
    for mod in (props, clutter_geo, clutter, themes_highlands, themes_surface, themes_caves, themes_canyon, themes):
        importlib.reload(mod)
    themes.main(render=False)
"""
import hashlib
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props  # noqa: E402
import clutter  # noqa: E402
import themes_highlands  # noqa: E402
import themes_surface  # noqa: E402
import themes_caves  # noqa: E402
import themes_classic  # noqa: E402
import themes_canyon  # noqa: E402
import themes_darkforest  # noqa: E402
import themes_slime  # noqa: E402
import themes_museum  # noqa: E402

SEED = 9137
COLLECTION = "CubeCrawlerThemes"
PREVIEW = "ThemesPreview_NOT_EXPORTED"
VIGNETTE = "ThemesVignette_NOT_EXPORTED"
FLUIDS = clutter.FLUIDS + ("honey",)
LANDMARK_RADIUS = 1.75
ROLES = ("shrine", "gate", "camp", "monument")
LANDMARK_TRIANGLES = 4000
LINE_TRIANGLES = 400
EXTRA_KEYS = clutter.EXTRA_KEYS + ("drop", "landmark", "role", "footprint", "height", "anchors", "colliders",
                                   "occluders", "vignette", "flicker")
FLICKERS = ("flame", "pulse")
BUILDERS = (themes_highlands, themes_surface, themes_caves, themes_classic, themes_canyon, themes_darkforest, themes_slime, themes_museum)


def spec(theme, prop, priority=1, variants=2, attach="ground", **hints):
    return (theme, prop, priority, variants, attach, hints)


def cover(theme, prop, priority=1, **hints):
    return spec(theme, prop, priority, cover=True, max_radius=clutter.COVER_RADIUS, **hints)


def landmark(theme, prop, role, priority=1, variants=1, **hints):
    """A landmark and how a reward site is built around it (the game: cubegen/sites.js):
    shrine   the chest stands in front of it
    gate     you walk through it (its colliders leave a passage along glTF Z at x = 0) to the
             chest behind it
    camp     the chest stands beside it, with a few small things around
    monument it stands beside the chest and frames it"""
    assert role in ROLES, role
    return spec(theme, prop, priority, variants, landmark=True, role=role, blocking=True, max_radius=None, **hints)


def vignette(theme, prop, priority=1, variants=1, **hints):
    """A little set piece the generator scatters through the theme's rooms (cubegen/vignettes.js):
    bigger than a cell, with colliders and occluders like a landmark, but no reward site."""
    return spec(theme, prop, priority, variants, vignette=True, blocking=True, max_radius=None, **hints)


def big(hints):
    """Landmarks and vignettes: bigger than a cell, placed deliberately, colliders of their own."""
    return bool(hints.get("landmark") or hints.get("vignette"))


def line(theme, prop, priority=1, variants=2, **hints):
    return spec(theme, prop, priority, variants, attach="line", max_radius=None, **hints)


SPECS = [
    # --- Prayer highlands: high, hilly, windy grassland under a deep blue sky ---
    cover("highlands", "tussock_grass", sway=0.35),
    cover("highlands", "scree_patch"),
    cover("highlands", "lungta_scraps"),
    spec("highlands", "blue_poppy", sway=0.3),
    spec("highlands", "juniper_shrub", sway=0.1),
    spec("highlands", "mani_stones"),
    spec("highlands", "lhatse", blocking=True, sway=0.2),
    spec("highlands", "tharchok", blocking=True, sway=0.15),
    spec("highlands", "chorten_small", blocking=True),
    spec("highlands", "prayer_wheel", blocking=True),
    spec("highlands", "butter_lamps", light="#ffc060", intensity=1.2),
    spec("highlands", "sang_burner", light="#ff9a50", intensity=0.8),
    spec("highlands", "yak_skull"),
    spec("highlands", "khata_drape", attach="lip", sway=0.4),
    spec("highlands", "flag_drape", attach="lip", sway=0.5),
    spec("highlands", "prayer_wheel_row", attach="wall"),
    spec("highlands", "tsatsa_niche", attach="wall"),
    spec("highlands", "glacier_floe", attach="water", fluid="water"),
    line("highlands", "flag_run", sway=0.6),
    landmark("highlands", "chorten_great", "shrine", light="#ffd080", intensity=0.8),
    landmark("highlands", "nomad_tent", "camp"),
    landmark("highlands", "mani_wall", "monument"),
    landmark("highlands", "hermitage", "camp"),
    # --- Karst and rice terraces: limestone needles, flooded steps, bamboo, mist ---
    cover("karst", "rice_shoots", sway=0.4),
    cover("karst", "moss_stones"),
    spec("karst", "bamboo_clump", blocking=True, sway=0.3),
    spec("karst", "banana_plant", sway=0.3),
    spec("karst", "stone_lantern", blocking=True, light="#ffd080", intensity=1.2),
    spec("karst", "scarecrow", sway=0.1),
    spec("karst", "rice_sheaves"),
    spec("karst", "karst_needle", blocking=True),
    spec("karst", "lotus", attach="water", fluid="water"),
    spec("karst", "bamboo_raft", attach="water", fluid="water"),
    spec("karst", "fern_curtain", attach="lip", sway=0.35),
    spec("karst", "wall_shrine", attach="wall", light="#ffb060", intensity=0.8),
    landmark("karst", "pavilion", "camp"),
    landmark("karst", "karst_tower", "monument"),
    # --- Cloud kingdom: islands on cloud banks, wind, the Wolks' home ---
    cover("clouds", "cloud_tufts"),
    cover("clouds", "wind_feathers"),
    spec("clouds", "cloud_bush", sway=0.15),
    spec("clouds", "storm_jar", light="#a8d0ff", intensity=1.2),
    spec("clouds", "wind_chimes", sway=0.5),
    spec("clouds", "rainbow_crystal", light="#e8f0ff", intensity=1),
    spec("clouds", "sky_nest"),
    spec("clouds", "weather_vane", blocking=True),
    spec("clouds", "cloud_spill", attach="lip", sway=0.2),
    spec("clouds", "raincloud", attach="ceiling", sway=0.15),
    landmark("clouds", "sky_gate", "monument"),
    landmark("clouds", "wind_harp", "monument"),
    # --- Deep canyon: sandstone walls in strata, a green river floor, springs, old dwellings ---
    cover("canyon", "desert_grass", sway=0.3),
    cover("canyon", "red_gravel"),
    spec("canyon", "cottonwood", blocking=True, sway=0.15),
    spec("canyon", "yucca", sway=0.1),
    spec("canyon", "sagebrush", sway=0.15),
    spec("canyon", "hoodoo", blocking=True),
    spec("canyon", "cairn"),
    spec("canyon", "petroglyph_boulder", blocking=True),
    spec("canyon", "clay_pots"),
    spec("canyon", "luminaria", light="#ffb060", intensity=0.9),
    spec("canyon", "hanging_garden", attach="lip", sway=0.3),
    spec("canyon", "petroglyph_panel", attach="wall"),
    spec("canyon", "river_reeds", attach="water", fluid="water", sway=0.3),
    landmark("canyon", "cliff_dwelling", "camp"),
    landmark("canyon", "canyon_arch", "gate"),
    landmark("canyon", "balanced_rock", "monument"),
    # --- Salt flats: white crust, a thin mirror of water, pink crystals, flamingos ---
    cover("saltflats", "salt_crust"),
    cover("saltflats", "salt_crystals"),
    spec("saltflats", "salt_pillar", blocking=True),
    spec("saltflats", "pink_halite"),
    spec("saltflats", "flamingo", sway=0.05),
    spec("saltflats", "salt_bricks", blocking=True),
    spec("saltflats", "bleached_shrub"),
    spec("saltflats", "salt_cones"),
    spec("saltflats", "brine_crystals", attach="water", fluid="water"),
    spec("saltflats", "wading_flamingo", attach="water", fluid="water"),
    spec("saltflats", "salt_crust_lip", attach="lip"),
    landmark("saltflats", "salt_harvest", "camp"),
    landmark("saltflats", "salt_arch", "gate"),
    # --- Tropical lagoon: archipelago over turquoise water, sand, palms, wrecks ---
    cover("lagoon", "shell_scatter"),
    cover("lagoon", "sand_ripples"),
    spec("lagoon", "palm_tree", blocking=True, sway=0.3),
    spec("lagoon", "beach_grass", sway=0.4),
    spec("lagoon", "driftwood"),
    spec("lagoon", "tiki_torch", light="#ffa040", intensity=1.5),
    spec("lagoon", "rowboat", blocking=True),
    spec("lagoon", "buried_chest"),
    spec("lagoon", "crab"),
    spec("lagoon", "coral_head", attach="water", fluid="water"),
    spec("lagoon", "seaweed_drape", attach="lip", sway=0.3),
    spec("lagoon", "barnacles", attach="wall"),
    landmark("lagoon", "shipwreck", "camp"),
    landmark("lagoon", "stilt_hut", "camp"),
    # --- Honey hive (cave): wax cells, honey as a slow fluid, candles ---
    cover("hive", "wax_flakes"),
    cover("hive", "pollen_dust"),
    spec("hive", "comb_mound", blocking=True, light="#ffb030", intensity=0.6),
    spec("hive", "wax_candles", light="#ffd080", intensity=1.2),
    spec("hive", "larva_cells"),
    spec("hive", "honey_pot"),
    spec("hive", "giant_flower", sway=0.2),
    spec("hive", "bee_husk"),
    spec("hive", "honey_bubbles", attach="water", fluid="honey"),
    spec("hive", "comb_raft", attach="water", fluid="honey"),
    spec("hive", "wall_comb", attach="wall", light="#ffb030", intensity=0.5),
    spec("hive", "honey_drips", attach="ceiling", sway=0.1),
    spec("hive", "honey_overflow", attach="lip"),
    landmark("hive", "comb_tower", "monument", light="#ffb030", intensity=1),
    landmark("hive", "royal_cell", "shrine", light="#ffe090", intensity=1.5),
    # --- Sunlit cenote (cave): a jungle under a hole in the sky, jade, vines ---
    cover("cenote", "jungle_litter"),
    cover("cenote", "jade_shards"),
    spec("cenote", "monstera", sway=0.25),
    spec("cenote", "orchid_rock"),
    spec("cenote", "jade_idol", blocking=True),
    spec("cenote", "serpent_head", blocking=True),
    spec("cenote", "copal_bowl", light="#ffb050", intensity=1),
    spec("cenote", "macaw_perch", sway=0.1),
    spec("cenote", "hanging_vines", attach="ceiling", sway=0.4),
    spec("cenote", "jungle_drape", attach="lip", sway=0.35),
    spec("cenote", "glyph_panel", attach="wall"),
    spec("cenote", "cenote_lilies", attach="water", fluid="water"),
    landmark("cenote", "step_shrine", "shrine"),
    landmark("cenote", "ceiba_roots", "monument"),
    # --- Sunken grotto (cave): flooded, bioluminescent, kelp and jellies ---
    cover("grotto", "sea_glass", light="#7fe0ff", intensity=0.4),
    cover("grotto", "pearl_sand"),
    spec("grotto", "kelp_stalk", sway=0.5),
    spec("grotto", "anemone", light="#ff7ad0", intensity=0.6, sway=0.2),
    spec("grotto", "giant_clam", light="#e8f4ff", intensity=0.8),
    spec("grotto", "brain_coral"),
    spec("grotto", "sunken_anchor", blocking=True),
    spec("grotto", "jelly_lantern", light="#9ae0ff", intensity=1.2),
    spec("grotto", "jellyfish", attach="water", fluid="water", light="#a8e8ff", intensity=0.8),
    spec("grotto", "glow_strands", attach="ceiling", light="#7fe8ff", intensity=0.6, sway=0.2),
    spec("grotto", "coral_wall", attach="wall", light="#ff9ad0", intensity=0.4),
    spec("grotto", "kelp_drape", attach="lip", sway=0.4),
    landmark("grotto", "sunken_bell", "monument"),
    landmark("grotto", "giant_shell", "shrine", light="#9ae0ff", intensity=1),
    # --- Dwarven forge (cave): gears, pipes, steam vents, furnaces ---
    cover("forge", "metal_shavings"),
    cover("forge", "slag_bits", light="#ff7030", intensity=0.4),
    spec("forge", "anvil_block", blocking=True),
    spec("forge", "ingot_stack"),
    spec("forge", "gear_pile"),
    spec("forge", "steam_vent"),
    spec("forge", "crucible", light="#ff8030", intensity=1.2),
    spec("forge", "valve_pipe", blocking=True),
    spec("forge", "coal_bin", blocking=True),
    spec("forge", "pipe_run", attach="wall"),
    spec("forge", "gauge_panel", attach="wall", light="#7aff9a", intensity=0.5),
    spec("forge", "chain_hoist", attach="ceiling", sway=0.15),
    spec("forge", "slag_raft", attach="water", fluid="lava", light="#ff6020", intensity=0.8),
    spec("forge", "pipe_bend", attach="lip"),
    landmark("forge", "great_gear", "monument", light="#ff8a3a", intensity=1.2, flicker="pulse"),
    landmark("forge", "furnace", "shrine", light="#ff7a30", intensity=2),
    # --- Ossuary catacombs (cave): bones in neat rows, candles, quiet ---
    cover("ossuary", "bone_dust"),
    cover("ossuary", "candle_stubs", light="#ffb060", intensity=0.5),
    spec("ossuary", "skull_pile"),
    spec("ossuary", "candelabra", light="#ffc070", intensity=1.2),
    spec("ossuary", "sarcophagus", blocking=True),
    spec("ossuary", "funeral_urn"),
    spec("ossuary", "bone_lantern", light="#ffc070", intensity=1),
    spec("ossuary", "skull_wall", attach="wall"),
    spec("ossuary", "candle_niche", attach="wall", light="#ffb060", intensity=0.8),
    spec("ossuary", "bone_chandelier", attach="ceiling", light="#ffc070", intensity=1.2, sway=0.15),
    spec("ossuary", "skull_ledge", attach="lip"),
    landmark("ossuary", "bone_arch", "gate", light="#ffc070", intensity=1, flicker="flame"),
    landmark("ossuary", "crypt_shrine", "shrine", light="#ffb060", intensity=1),
    # --- Dark forest: wooded hills at night, lanterns, glowing mushrooms, abandoned places ---
    cover("darkforest", "leaf_litter"),
    cover("darkforest", "glowcap_patch", light="#7af0ff", intensity=0.5, flicker="pulse"),
    cover("darkforest", "moss_mound"),
    spec("darkforest", "dark_fir_tree", blocking=True, sway=0.06),
    spec("darkforest", "gnarled_tree", blocking=True, sway=0.08),
    spec("darkforest", "bare_tree", priority=2, blocking=True, sway=0.05),
    spec("darkforest", "glow_mushrooms", light="#5affc8", intensity=1, flicker="pulse"),
    spec("darkforest", "giant_glowshroom", priority=2, blocking=True, light="#c890ff", intensity=1.4, flicker="pulse"),
    spec("darkforest", "mossy_stump", priority=2, blocking=True, light="#5affc8", intensity=0.7, flicker="pulse"),
    spec("darkforest", "lantern_post", priority=2, blocking=True, light="#ffb85a", intensity=1.5, flicker="flame"),
    spec("darkforest", "standing_stone", priority=2, blocking=True, light="#8ab8ff", intensity=0.6, flicker="pulse"),
    spec("darkforest", "rotten_log", priority=2, blocking=True, light="#7af0ff", intensity=0.5, flicker="pulse"),
    spec("darkforest", "twig_charm", priority=2, sway=0.25),
    spec("darkforest", "dark_fern", sway=0.3),
    spec("darkforest", "bramble", sway=0.1),
    spec("darkforest", "shelf_fungus", attach="wall", light="#5affc8", intensity=0.6, flicker="pulse"),
    spec("darkforest", "root_drape", attach="lip", sway=0.3),
    spec("darkforest", "hanging_lantern", attach="ceiling", light="#ffb85a", intensity=1.2, flicker="flame", sway=0.15),
    spec("darkforest", "black_lilies", attach="water", fluid="water", light="#c8fff0", intensity=0.5, flicker="pulse"),
    line("darkforest", "lantern_string", light="#ffc070", intensity=0.8, flicker="flame"),
    vignette("darkforest", "abandoned_shed", light="#ffb85a", intensity=1, flicker="flame"),
    vignette("darkforest", "collapsed_cabin", light="#5affc8", intensity=0.8, flicker="pulse"),
    vignette("darkforest", "woodcutter_camp", light="#ffb85a", intensity=0.9, flicker="flame"),
    vignette("darkforest", "wayside_shrine", light="#ffc070", intensity=1, flicker="flame"),
    vignette("darkforest", "stone_circle", light="#8ab8ff", intensity=1, flicker="pulse"),
    vignette("darkforest", "overgrown_wagon", light="#ffb85a", intensity=0.8, flicker="flame"),
    landmark("darkforest", "lantern_tree", "monument", light="#ffb85a", intensity=1.6, flicker="flame"),
    landmark("darkforest", "mossy_arch", "gate", light="#7af0ff", intensity=1, flicker="pulse"),
    landmark("darkforest", "forest_chapel", "shrine", light="#ffc070", intensity=1.3, flicker="flame"),
    # --- Slime marsh: moss and pools of toxic slime, slime trees, where the meteorites came down ---
    cover("slime", "slime_moss"),
    cover("slime", "goo_puddle", light="#b8ff5a", intensity=0.4, flicker="pulse"),
    spec("slime", "slime_tree", blocking=True, sway=0.05, light="#b8ff5a", intensity=0.8, flicker="pulse"),
    spec("slime", "slime_mushrooms", light="#b8ff5a", intensity=0.8, flicker="pulse"),
    spec("slime", "goo_mound", priority=2, blocking=True, light="#b8ff5a", intensity=0.4, flicker="pulse"),
    spec("slime", "slimed_rock", priority=2, blocking=True, light="#b8ff5a", intensity=0.3, flicker="pulse"),
    spec("slime", "bubble_vent", light="#d8ff9a", intensity=1, flicker="pulse"),
    spec("slime", "slime_reeds", sway=0.3),
    spec("slime", "slime_seep", attach="wall", light="#b8ff5a", intensity=0.5, flicker="pulse"),
    spec("slime", "slime_drip", attach="lip", light="#b8ff5a", intensity=0.4, flicker="pulse"),
    spec("slime", "goo_pads", attach="water", fluid="acid", light="#b8ff5a", intensity=0.5, flicker="pulse"),
    spec("slime", "bulb_tree", priority=2, blocking=True, sway=0.06, light="#b8ff5a", intensity=1, flicker="pulse"),
    spec("slime", "dead_slimed_tree", priority=2, blocking=True, sway=0.04, light="#b8ff5a", intensity=0.4, flicker="pulse"),
    spec("slime", "spore_pods", light="#b8ff5a", intensity=0.7, flicker="pulse", sway=0.15),
    spec("slime", "glow_stalk", priority=2, blocking=True, light="#b8ff5a", intensity=1.3, flicker="pulse", sway=0.08),
    vignette("slime", "slimed_cart", light="#b8ff5a", intensity=0.8, flicker="pulse"),
    vignette("slime", "swallowed_hut", light="#ffd070", intensity=0.9, flicker="flame"),
    vignette("slime", "fresh_meteor", light="#b8ff5a", intensity=1.2, flicker="pulse"),
    landmark("slime", "meteor_crater", "shrine", light="#b8ff5a", intensity=1.6, flicker="pulse"),
    landmark("slime", "giant_slime_tree", "monument", light="#b8ff5a", intensity=1.4, flicker="pulse"),
    # --- Museum: Mansk's hall and stage (no theme: cubegen/arenaprops.js `stage` dresses his arena) ---
    spec("museum", "pedestal_vase", priority=2, blocking=True),
    spec("museum", "pedestal_bust", priority=2, blocking=True),
    spec("museum", "display_case", priority=2, blocking=True, light="#cfe4ff", intensity=0.7, flicker="pulse"),
    spec("museum", "statue", priority=2, blocking=True, per_variant={1: {"light": "#8fc8ff", "intensity": 0.3, "flicker": "pulse"}}),
    spec("museum", "rope_posts"),
    spec("museum", "plaque"),
    spec("museum", "footlights", light="#ffd890", intensity=0.8, flicker="flame"),     # (gaslights)
    spec("museum", "spotlight", blocking=True, light="#fff0c8", intensity=1.5, flicker="pulse"),
    spec("museum", "painting", attach="wall"),
    spec("museum", "curtain", attach="wall"),
    # --- the classic themes' landmarks (themes_classic.py) ---
    landmark("meadow", "windmill", "monument"),
    landmark("meadow", "wishing_well", "shrine"),
    landmark("peaks", "expedition_camp", "camp"),
    landmark("peaks", "ice_arch", "gate"),
    landmark("badlands", "covered_wagon", "camp"),
    landmark("badlands", "windpump", "monument"),
    landmark("roots", "root_gate", "gate"),
    landmark("roots", "hollow_stump", "shrine"),
    landmark("frozen", "ice_throne", "shrine", light="#9fd8ff", intensity=1),
    landmark("frozen", "frozen_falls", "monument"),
    landmark("swamp", "giant_toadstool", "monument", light="#8fff7a", intensity=1.2),
    landmark("swamp", "witch_hut", "camp", light="#8fff7a", intensity=1),
    landmark("nests", "web_gate", "gate", light="#c8a0ff", intensity=1, flicker="pulse"),
    landmark("nests", "brood_cluster", "monument", light="#c8a0ff", intensity=1.2, flicker="pulse"),
    landmark("mines", "headframe", "gate", light="#ffcf8a", intensity=1.5),
    landmark("mines", "giant_geode", "shrine", light="#c08fff", intensity=1.5),
    landmark("ruins", "temple_gate", "gate", light="#ffa040", intensity=1.5, flicker="flame"),
    landmark("ruins", "colossus_head", "monument", light="#ffc060", intensity=1.2, flicker="pulse"),
    landmark("volcanic", "fire_shrine", "shrine", light="#ff6a20", intensity=2),
    landmark("volcanic", "fumarole", "monument", light="#ff7a30", intensity=1.5),
    landmark("abyss", "chained_obelisk", "monument", light="#ff3030", intensity=1.2),
    landmark("abyss", "void_throne", "shrine", light="#a050ff", intensity=1.5),
]
SETS = list(dict.fromkeys(s[0] for s in SPECS))
FLUID_COLORS = {"water": "#3f6f88", "lava": "#d0501a", "acid": "#7ab030", "honey": "#d89020"}


def builder(prop):
    for module in BUILDERS:
        fn = getattr(module, "build_" + prop, None)
        if fn:
            return fn
    raise KeyError("no builder for " + prop)


def name_of(theme, prop, variant):
    return f"{theme}_{prop}_{chr(97 + variant)}"


def build(scene=None, priority=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for theme, prop, p, count, attach, hints in SPECS:
        if priority is not None and p != priority:
            continue
        for variant in range(count):
            name = name_of(theme, prop, variant)
            seed = SEED + int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")
            m = props.Mesh(random.Random(seed))
            m.anchors = []
            builder(prop)(m, variant)
            info = {k: v for k, v in hints.items() if k != "per_variant"}
            info.update(hints.get("per_variant", {}).get(variant, {}))
            # (finish shrinks a small prop to its radius and stands it on the ground: its anchors too)
            limit, k, dz = info.get("max_radius", props.MAX_RADIUS), 1.0, 0.0
            if m.anchors and limit is not None and attach not in ("wall", "lip"):
                k = min(1, limit / max(math.hypot(x, y) for x, y, z in m.vertices))
            if m.anchors and attach == "ground":
                dz = -min(z for x, y, z in m.vertices)
            m.anchors = [(x * k, y * k, z + dz) for x, y, z in m.anchors]
            obj = props.finish(m, name, attach, info, collection)
            obj["priority"] = p
            obj["cube_crawler_themes"] = True
            for key in ("cover", "shore", "fluid", "landmark", "role", "vignette", "flicker"):
                if key in info:
                    obj[key] = info[key]
            if attach == "lip":
                obj["drop"] = round(-min(v.co.z for v in obj.data.vertices), 4)
            if big(info):
                lo, hi = bounds(obj)
                obj["footprint"] = [round(hi[0] - lo[0], 3), round(hi[1] - lo[1], 3)]
                obj["height"] = round(hi[2], 3)
                obj["colliders"], obj["occluders"] = volumes(obj)
            if m.anchors:
                # Blender (x, y, z) -> glTF (x, z, -y)
                obj["anchors"] = [[round(x, 4), round(z, 4), round(-y, 4)] for x, y, z in m.anchors]
            objects.append(obj)
    return objects


def bounds(obj):
    vs = obj.data.vertices
    return ([min(v.co[k] for v in vs) for k in range(3)], [max(v.co[k] for v in vs) for k in range(3)])


# --- landmark volumes: what the game collides with and cuts away --------------
GRID = 0.125      # cells the mesh is sampled on
STEP_UP = 0.3     # the game's STEP: anything lower is walked over
HEAD_UP = 1.3     # over the character's head (1.1): higher parts (arches, roofs) leave room under them
CHAR_R = 0.22     # the game's CHAR_R


def _clip(poly, axis, value, above):
    """Sutherland-Hodgman: the part of a convex polygon on one side of an axis plane."""
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ia, ib = (a[axis] >= value) == above, (b[axis] >= value) == above
        if ia:
            out.append(a)
        if ia != ib:
            t = (value - a[axis]) / (b[axis] - a[axis])
            out.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return out


def _columns(obj):
    """Sample the mesh on a GRID x GRID raster of vertical columns (Blender XY): per column the
    lowest and highest geometry (ignoring what lies under STEP_UP), whether any of it is in the
    walking band [STEP_UP, HEAD_UP], and the lowest geometry above that band."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    vs = [tuple(v.co) for v in mesh.vertices]
    cols = {}
    for tri in mesh.loop_triangles:
        pts = [vs[i] for i in tri.vertices]
        if max(p[2] for p in pts) < STEP_UP:
            continue
        for i in range(math.floor(min(p[0] for p in pts) / GRID), math.floor(max(p[0] for p in pts) / GRID) + 1):
            strip = _clip(_clip(pts, 0, i * GRID, True), 0, (i + 1) * GRID, False)
            if len(strip) < 3:
                continue
            for j in range(math.floor(min(p[1] for p in strip) / GRID),
                           math.floor(max(p[1] for p in strip) / GRID) + 1):
                part = _clip(_clip(strip, 1, j * GRID, True), 1, (j + 1) * GRID, False)
                if len(part) < 3:
                    continue
                lo, hi = min(p[2] for p in part), max(p[2] for p in part)
                if hi < STEP_UP:
                    continue
                c = cols.setdefault((i, j), [math.inf, -math.inf, False, math.inf])
                c[0], c[1] = min(c[0], lo), max(c[1], hi)
                c[2] = c[2] or lo < HEAD_UP
                if hi >= HEAD_UP:
                    c[3] = min(c[3], max(lo, HEAD_UP))
    # inside closed solids (a tower's hollow, the middle of a stump) nothing is sampled in the
    # band, but nobody gets in there either: what the band's walls enclose is solid
    walls = {c for c, v in cols.items() if v[2]}
    if walls:
        x0, x1 = min(c[0] for c in walls) - 1, max(c[0] for c in walls) + 1
        y0, y1 = min(c[1] for c in walls) - 1, max(c[1] for c in walls) + 1
        seen, stack = {(x0, y0)}, [(x0, y0)]
        while stack:
            x, y = stack.pop()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if x0 <= n[0] <= x1 and y0 <= n[1] <= y1 and n not in seen and n not in walls:
                    seen.add(n)
                    stack.append(n)
        top = max(v[1] for v in cols.values())
        for c in ((x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)):
            if c not in seen and c not in walls:
                cols[c] = [0.0, max(top if c not in cols else cols[c][1], STEP_UP), True, math.inf]
    return cols


def _merge(keys):
    """Greedy rectangles of equal keys: [(i0, j0, i1, j1, key)] over raster cells."""
    done, out = set(), []
    for i, j in sorted(keys, key=lambda c: (c[1], c[0])):
        if (i, j) in done:
            continue
        k = keys[(i, j)]
        i1 = i
        while keys.get((i1 + 1, j)) == k and (i1 + 1, j) not in done:
            i1 += 1
        j1 = j
        while all(keys.get((x, j1 + 1)) == k and (x, j1 + 1) not in done for x in range(i, i1 + 1)):
            j1 += 1
        done.update((x, y) for x in range(i, i1 + 1) for y in range(j, j1 + 1))
        out.append((i, j, i1 + 1, j1 + 1, k))
    return out


def _box(i0, j0, i1, j1, bottom, top):
    """Raster rectangle (Blender XY) -> [x0, z0, x1, z1, bottom, top] in glTF space (z = -y)."""
    return [round(i0 * GRID, 3), round(-j1 * GRID, 3), round(i1 * GRID, 3), round(-j0 * GRID, 3),
            round(bottom, 3), round(top, 3)]


def volumes(obj):
    """A landmark's boxes for the game, derived from its mesh: `colliders` stand wherever there
    is geometry in the walking band, from the ground to its top (walls, legs, trunks), or hang
    over the band (lintels, roofs: ceilings you cannot jump through); `occluders` cover all of
    it for the cutaway. Both as [x0, z0, x1, z1, bottom, top] in glTF space."""
    cols = _columns(obj)
    q = 0.5   # heights in half units, whole ones over 2 (nobody stands that high next to it): fewer boxes
    down = lambda z: math.floor(z / q + 1e-6) * q  # noqa: E731
    up = lambda z: math.ceil(z / q - 1e-6) * q if z <= 2 else float(math.ceil(z - 1e-6))  # noqa: E731
    # colliders on a raster twice as coarse (a quarter cell; the character is 0.22 wide)
    blocks = {}
    for (i, j), (lo, hi, walk, over) in cols.items():
        b = blocks.setdefault((i // 2, j // 2), [-math.inf, False, math.inf])
        b[0], b[1], b[2] = max(b[0], hi), b[1] or walk, min(b[2], over)
    solid = {}
    for c, (hi, walk, over) in blocks.items():
        if walk:
            solid[c] = (0.0, up(hi))
        elif over < math.inf:
            bottom = max(HEAD_UP - 0.05, down(over))
            solid[c] = (bottom, max(up(hi), bottom + q))
    colliders = [_box(i0 * 2, j0 * 2, i1 * 2, j1 * 2, *k) for i0, j0, i1, j1, k in _merge(solid)]
    # the cutaway only needs the rough shape: two raster cells a side, half-unit heights
    coarse = {}
    for (i, j), (lo, hi, walk, _) in cols.items():
        c = (i // 2, j // 2)
        lo = 0.0 if walk else lo
        a, b = coarse.get(c, (math.inf, -math.inf))
        coarse[c] = (min(a, lo), max(b, hi))
    half = {c: (math.floor(lo * 2) / 2, math.ceil(hi * 2) / 2) for c, (lo, hi) in coarse.items()}
    occluders = [_box(i0 * 2, j0 * 2, i1 * 2, j1 * 2, *k) for i0, j0, i1, j1, k in _merge(half)]
    return colliders, occluders


def passage(colliders, half=CHAR_R + 0.05):
    """Is there a way straight through along glTF Z at x = 0 under head height (gates)? As wide
    as the game needs to keep the cells there walkable (cubegen/sites.js landmarkCells)."""
    return not any(b[0] < half and b[2] > -half and b[4] < HEAD_UP - 0.2 for b in colliders)


def validate(objects):
    """Fail on attachment, budget, transform, colour or naming regressions."""
    names = {o.name for o in objects}
    assert len(names) == len(objects)
    taken = {f"{t}_{p}_{chr(97 + v)}" for t, p, _, _, n, _, _ in props.SPECS for v in range(n)}
    taken |= {f"{t}_{p}_{chr(97 + v)}" for t, p, _, n, _, _ in clutter.SPECS for v in range(n)}
    assert not names & taken, sorted(names & taken)
    # the classic sets (props.py, clutter.py) only get landmarks here
    for s in SPECS:
        assert s[0] not in clutter.SETS or s[5].get("landmark"), f"{s[0]}_{s[1]}: classic sets only get landmarks"
    report, failures = [], []
    for obj in objects:
        try:
            report.append(check(obj))
        except AssertionError as e:
            failures.append(repr(e.args[0] if e.args else obj.name))
    assert not failures, "\n".join(failures)
    return report


def check(obj):
    """clutter.check for the clutter attachments; landmarks and lines checked here."""
    if obj.get("flicker"):
        assert obj["flicker"] in FLICKERS and "light" in obj, (obj.name, "flicker without a light")
    if obj["attach"] != "line" and not big(obj):
        entry = clutter.check(obj, fluids=FLUIDS)
    else:
        entry = check_big(obj)
    for key in EXTRA_KEYS:
        if key in obj and key not in entry:
            entry[key] = plain(obj[key])
    return entry


def plain(value):
    """ID property values (arrays, nested lists) as plain JSON values."""
    if hasattr(value, "to_list"):
        value = value.to_list()
    if isinstance(value, (list, tuple)) or hasattr(value, "__len__") and not isinstance(value, str):
        return [plain(v) for v in value]
    return value


def check_big(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    count = len(mesh.loop_triangles)
    attach = obj["attach"]
    theme, prop, variant = clutter.parse(obj.name)
    budget = LINE_TRIANGLES if attach == "line" else LANDMARK_TRIANGLES
    assert props.MIN_TRIANGLES <= count <= budget, (obj.name, count, budget)
    assert obj.parent is None and not obj.modifiers and not obj.constraints, obj.name
    assert tuple(obj.scale) == (1, 1, 1), obj.name
    assert not any(p.use_smooth for p in mesh.polygons), obj.name
    assert not mesh.uv_layers and props.COLOR_ATTRIBUTE in mesh.color_attributes, obj.name
    assert all(math.isfinite(c) for v in mesh.vertices for c in v.co), obj.name
    for tri in mesh.loop_triangles:
        a, b, c = (mesh.vertices[i].co for i in tri.vertices)
        assert (b - a).cross(c - a).length > 1e-10, obj.name
    lo, hi = bounds(obj)
    if attach == "line":
        assert lo[0] >= -0.02 and hi[0] <= 1.02 and hi[2] <= 0.05 and lo[2] < -0.1, (obj.name, lo, hi)
        assert max(abs(lo[1]), abs(hi[1])) <= 0.12, (obj.name, lo, hi)
    else:
        assert attach == "ground" and abs(lo[2]) < 1e-6 and hi[2] > 0, obj.name
        assert obj["radius"] <= LANDMARK_RADIUS + 1e-4, (obj.name, obj["radius"])
        colliders = [list(b) for b in obj["colliders"]]
        assert colliders and obj["occluders"], obj.name
        assert len(colliders) <= 80, (obj.name, len(colliders))
        assert all(b[0] < b[2] and b[1] < b[3] and 0 <= b[4] < b[5] for b in colliders), obj.name
        assert bool(obj.get("landmark")) != bool(obj.get("vignette")), (obj.name, "a landmark or a vignette")
        assert obj.get("vignette") or obj["role"] in ROLES, obj.name
        assert obj.get("role") != "gate" or passage(colliders), (obj.name, "no passage at x = 0")
    glowing = any(p.material_index == 1 for p in mesh.polygons)
    assert glowing == ("light" in obj), obj.name
    if glowing:
        assert mesh.materials[1].name == obj.name + "_glow", obj.name
    entry = {"name": obj.name, "set": theme, "prop": prop, "variant": variant, "priority": obj["priority"],
             "attach": attach, "blocking": bool(obj["blocking"]), "radius": obj["radius"], "triangles": count,
             "size": [round(b - a, 3) for a, b in zip(lo, hi)],
             "bounds_blender": [[round(x, 4) for x in lo], [round(x, 4) for x in hi]]}
    for key in ("light", "intensity", "sway"):
        if key in obj:
            entry[key] = obj[key]
    return entry


def export(objects, directory):
    directory = Path(directory).resolve()
    (directory / "themes").mkdir(parents=True, exist_ok=True)
    states = [(o, o.rotation_euler.copy(), o.location.copy()) for o in objects]
    for obj in objects:
        obj.rotation_euler = (0, 0, 0)
    try:
        report = validate(objects)
    finally:
        for obj, rotation, _ in states:
            obj.rotation_euler = rotation
    props.export_sets(objects, directory / "themes", clutter.export_gltf)
    sets = {s: sorted({r["prop"] for r in report if r["set"] == s}) for s in SETS}
    (directory / "themes" / "manifest.json").write_text(json.dumps({
        "units": "cells", "up": "Y", "front": "+Z", "glb": "themes/<set>.glb", "sets": sets,
        "triangles": sum(r["triangles"] for r in report), "props": report}, indent=2) + "\n")
    return report


# --- showroom -----------------------------------------------------------------
BLOCK_Y = 14
ELEVATION = math.radians(30)
AZIMUTH = math.radians(12)


def setup_preview(scene, objects):
    """Per set: a row of small props (ground in columns, variant a in front; a cliff with
    wall / lip props; a pool with water props; a slab with ceiling props; posts with
    lines) and, behind it, a row of landmarks."""
    old = bpy.data.collections.get(PREVIEW)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    preview = bpy.data.collections.new(PREVIEW)
    scene.collection.children.link(preview)
    rock = clutter.plain_material("ThemesPreviewRock", "#8f8a80")
    ink = clutter.plain_material("ThemesPreviewInk", "#3f453e")
    wood = clutter.plain_material("ThemesPreviewPost", "#6e5236")

    def slab(name, lo, hi, mat):
        mesh = bpy.data.meshes.new(name)
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        verts = [(x, y, z) for z in (z0, z1) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        mesh.from_pydata(verts, [], [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6),
                                     (3, 0, 4, 7)])
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(name, mesh)
        preview.objects.link(obj)
        return obj

    def label(text, location, size=0.13, name=None):
        data = bpy.data.curves.new(name or "Label_" + text, "FONT")
        data.body, data.align_x, data.size = text, "CENTER", size
        data.materials.append(ink)
        obj = bpy.data.objects.new(name or "Label_" + text, data)
        obj.location, obj.rotation_euler = location, (math.pi / 2 - ELEVATION, 0, 0)
        preview.objects.link(obj)
        return obj

    by_name = {o.name: o for o in objects}
    blocks = {}
    for row, theme in enumerate(SETS):
        oy = row * BLOCK_Y
        specs = [s for s in SPECS if s[0] == theme]
        names = lambda s: [by_name[name_of(theme, s[1], v)] for v in range(s[3])]  # noqa: E731
        x, top = 0.0, 2.0
        start = set(preview.objects)
        members = [o for s in specs if not big(s[5]) for o in names(s)]
        for s in (s for s in specs if s[4] == "ground" and not big(s[5])):
            objs = names(s)
            width = max(bounds(o)[1][0] - bounds(o)[0][0] for o in objs)
            for v, obj in enumerate(objs):
                obj.location, obj.rotation_euler = (x, oy + 1.2 * v, 0), (0, 0, 0)
                top = max(top, bounds(obj)[1][2])
            tag = s[1] + (" (cover)" if s[5].get("cover") else " (shore)" if s[5].get("shore") else "")
            label(tag, (x, oy - 0.8, 0.02))
            x += max(1.3, width + 0.45)
        cliff = [s for s in specs if s[4] in ("wall", "lip")]
        if cliff:
            x0 = x
            for s in cliff:
                for obj in names(s):
                    z = 1.0 if s[4] == "wall" else 2.0
                    obj.location, obj.rotation_euler = (x, oy + 1.2, z), (0, 0, math.pi)
                    x += 1.15
                label(f"{s[1]} ({s[4]})", (x - 1.15 * (s[3] + 1) / 2, oy - 0.8, 0.02))
            slab(f"Cliff_{theme}", (x0 - 0.6, oy + 1.2, 0), (x - 0.55, oy + 2.4, 2.0), rock)
            x += 0.3
        water = [s for s in specs if s[4] == "water"]
        if water:
            for s in water:
                x0 = x
                for obj in names(s):
                    obj.location, obj.rotation_euler = (x, oy + 0.3, 0.04), (0, 0, 0)
                    x += 1.1
                label(f"{s[1]} ({s[5]['fluid']})", (x - 1.1 * (s[3] + 1) / 2, oy - 0.8, 0.02))
                fluid = clutter.plain_material("ThemesPreview_" + s[5]["fluid"], FLUID_COLORS[s[5]["fluid"]])
                slab(f"Pool_{theme}_{s[1]}", (x0 - 0.6, oy - 0.4, 0.0), (x - 0.5, oy + 1.0, 0.04), fluid)
            x += 0.3
        ceiling = [s for s in specs if s[4] == "ceiling"]
        if ceiling:
            x0 = x
            for s in ceiling:
                for obj in names(s):
                    obj.location, obj.rotation_euler = (x, oy + 0.35, 2.5), (0, 0, 0)
                    x += 1.0
                label(f"{s[1]} (ceiling)", (x - 1.0 * (s[3] + 1) / 2, oy - 0.8, 0.02))
            slab(f"Slab_{theme}", (x0 - 0.55, oy + 0.0, 2.5), (x - 0.45, oy + 1.4, 2.7), rock)
            x += 0.3
        for s in (s for s in specs if s[4] == "line"):
            for v, obj in enumerate(names(s)):
                y = oy + 0.4 + 1.0 * v
                x0 = x
                obj.location, obj.rotation_euler = (x0, y, 1.6), (0, 0, 0)
                for px in (x0 - 0.03, x0 + 1.03):
                    slab(f"Post_{obj.name}_{px:.2f}", (px - 0.03, y - 0.03, 0), (px + 0.03, y + 0.03, 1.65), wood)
            label(f"{s[1]} (line)", (x + 0.5, oy - 0.8, 0.02))
            x += 1.6
        if members:   # (the classic sets only have landmarks here)
            title = label(theme.upper(), (-0.7, oy - 1.45, 0.02), size=0.32, name="Title_" + theme)
            title.data.align_x = "LEFT"
            blocks[theme] = (-1.0, max(x, 6), oy, top, members + [o for o in preview.objects if o not in start])
        # landmarks: their own row behind the props
        lx, ly, ltop = 0.0, oy + 5.5, 2.0
        start = set(preview.objects)
        marks = [s for s in specs if big(s[5])]
        for s in marks:
            for obj in names(s):
                lo, hi = bounds(obj)
                lx += -lo[0]
                obj.location, obj.rotation_euler = (lx, ly - lo[1], 0), (0, 0, 0)
                label(obj.name.split("_", 1)[1], (lx, ly - 0.4 - 0.5, 0.02))
                lx += hi[0] + 0.9
                ltop = max(ltop, hi[2])
        if marks:
            blocks[theme + "-landmarks"] = (-1.0, max(lx, 6), ly - 0.3, ltop,
                                            [o for s in marks for o in names(s)]
                                            + [o for o in preview.objects if o not in start])
    mesh = bpy.data.meshes.new("ThemesPreviewFloor")
    mesh.from_pydata([(-500, -500, -0.002), (500, -500, -0.002), (500, 500, -0.002), (-500, 500, -0.002)], [],
                     [(0, 1, 2, 3)])
    mesh.materials.append(clutter.plain_material("ThemesPreviewGround", "#c3c4b0"))
    preview.objects.link(bpy.data.objects.new("ThemesPreviewFloor", mesh))

    cam = bpy.data.objects.new("ThemesCamera", bpy.data.cameras.new("ThemesCamera"))
    preview.objects.link(cam)
    cam.data.type = "ORTHO"
    scene.camera = cam
    sun = bpy.data.objects.new("ThemesSun", bpy.data.lights.new("ThemesSun", "SUN"))
    preview.objects.link(sun)
    sun.data.energy, sun.data.angle = 3.2, math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))
    world = bpy.data.worlds.get("ThemesWorld") or bpy.data.worlds.new("ThemesWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.76, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    scene.world = world
    render_settings(scene)
    frame(scene, blocks, SETS[0])
    return preview, blocks


def render_settings(scene):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 24
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"


def frame(scene, blocks, key, px_per_cell=100, span_x=None):
    """Aim the ortho camera at one block (or the span_x part of it), at a fixed pixels-per-cell
    scale, and show only that block's objects (the floor, sun and camera stay)."""
    x0, x1, oy, top, members = blocks[key]
    if span_x:
        x0, x1 = span_x
    keep = set(members)
    for obj in scene.objects:
        if obj.name in ("ThemesPreviewFloor", "ThemesCamera", "ThemesSun"):
            obj.hide_render = False
        elif obj.get("cube_crawler_themes") or any(c.name == PREVIEW for c in obj.users_collection):
            obj.hide_render = obj not in keep
    span = x1 - x0 + 0.6
    height = max(5.0, top * math.cos(ELEVATION) + 3.2)
    target = Vector(((x0 + x1) / 2 + 0.2, oy + 0.6, 0.85 + max(0, top - 2.5) * 0.45))
    d = Vector((math.sin(AZIMUTH) * math.cos(ELEVATION), -math.cos(AZIMUTH) * math.cos(ELEVATION),
                math.sin(ELEVATION)))
    cam = scene.camera
    cam.data.type = "ORTHO"
    cam.location = target + d * 40
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = max(span, height * span / span)
    cam.data.clip_end = 200
    scene.render.resolution_x = int(span * px_per_cell)
    scene.render.resolution_y = int(height * px_per_cell)
    scene.render.resolution_percentage = 100


def render_previews(scene, blocks, directory, keys=None):
    directory = Path(directory)
    (directory / "themes").mkdir(parents=True, exist_ok=True)
    paths = []
    for key in keys or blocks:
        frame(scene, blocks, key)
        path = directory / "themes" / f"{key}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    for obj in scene.objects:
        obj.hide_render = False
    if keys is None:
        clutter.contact_sheet([p for p in paths if "landmarks" not in p.name], directory / "themes-preview.png",
                              scale=0.4)
    return paths


# --- highlands vignette: how the pieces go together (not exported) -------------
def sag(a, b, droop):
    """Points of a hanging string from a to b (Blender space), sagging by droop."""
    a, b = Vector(a), Vector(b)
    n = max(3, int((b - a).length / 0.55) + 1)
    return [a.lerp(b, i / n) - Vector((0, 0, droop * 4 * (i / n) * (1 - i / n))) for i in range(n + 1)]


def string_segments(collection, source, points, name):
    """Instance a line prop along a polyline, one segment per step: what the game would do
    for a flag string between two anchors. Each segment is sheared rather than rotated: its
    X axis becomes the step (stretched to its length), Z stays world up, so the flags keep
    hanging straight down on a sloping string."""
    out = []
    for i, (p, q) in enumerate(zip(points, points[1:])):
        d = q - p
        side = Vector((-d.y, d.x, 0)).normalized()
        obj = bpy.data.objects.new(f"{name}_{i}", source.data)
        obj.matrix_world = Matrix(((d.x, side.x, 0, p.x), (d.y, side.y, 0, p.y), (d.z, side.z, 1, p.z),
                                   (0, 0, 0, 1)))
        collection.objects.link(obj)
        out.append(obj)
    return out


def anchor_world(obj, i=0):
    """An instance's anchor (stored in glTF space on the library mesh's object) in the world."""
    x, y, z = obj.get("anchors", obj.data.get("anchors"))[i]
    obj.update_tag()
    bpy.context.view_layer.update()
    return Euler(obj.rotation_euler).to_matrix() @ Vector((x, -z, y)) + Vector(obj.location)


def setup_vignette(objects):
    """A hillside with a great chorten, a fan of flag strings, poles and scatter."""
    old = bpy.data.collections.get(VIGNETTE)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    scene = bpy.data.scenes.get("ThemesVignette") or bpy.data.scenes.new("ThemesVignette")
    vig = bpy.data.collections.new(VIGNETTE)
    scene.collection.children.link(vig)
    by_name = {o.name: o for o in objects}
    rng = random.Random(7)

    def hill(x, y):
        return (0.55 * math.sin(x * 0.35 + 0.4) * math.cos(y * 0.3) + 0.04 * x + 0.12 * y
                + 0.9 * math.exp(-((x + 2) ** 2 + (y - 9) ** 2) / 14))

    def put(name, x, y, yaw=0.0, z=None):
        src = by_name[name]
        obj = bpy.data.objects.new(name + "_vig", src.data)
        obj.location = (x, y, hill(x, y) - 0.03 if z is None else z)
        obj.rotation_euler = (0, 0, yaw)
        if "anchors" in src:
            obj["anchors"] = src["anchors"]
        vig.objects.link(obj)
        return obj

    # terrain: a gentle faceted hillside, terraced lightly like the game's levels
    size, step = 26, 0.5
    verts, faces, colors = [], [], []
    k = int(size / step) + 1
    for j in range(k):
        for i in range(k):
            x, y = -13 + i * step, -8 + j * step
            verts.append((x, y, hill(x, y)))
    for j in range(k - 1):
        for i in range(k - 1):
            a = j * k + i
            faces.append((a, a + 1, a + k + 1, a + k))
    mesh = bpy.data.meshes.new("VignetteHill")
    mesh.from_pydata(verts, [], faces)
    attr = mesh.color_attributes.new(name=props.COLOR_ATTRIBUTE, type="FLOAT_COLOR", domain="CORNER")
    for poly in mesh.polygons:
        z = sum(verts[v][2] for v in poly.vertices) / 4
        c = props.linear(("#8a8a4e", "#9a9258", "#a49a62", "#8f8a52")[(rng.random() < 0.3) + (z > 0.6) * 2])
        for loop in poly.loop_indices:
            attr.data[loop].color = (*c, 1)
    mesh.materials.append(props.material("Props_VertexColor"))
    vig.objects.link(bpy.data.objects.new("VignetteHill", mesh))
    # distant ridges for the photo's feel
    for i, (cx, cy, s, snow) in enumerate(((-14, 30, 9, True), (4, 34, 12, True), (20, 26, 8, False),
                                           (-26, 20, 7, False))):
        m = props.Mesh(random.Random(i))
        m.lathe((0, 0, 0), [(0, s), (s * 0.35, s * 0.62), (s * 0.62, s * 0.32), (s * 0.8, 0)], "#7a6a5a", n=7,
                jitter=0.25, colors=["#6b5a4a", "#8a7360", "#e8ecef" if snow else "#9a8670"])
        ridge = props.finish(m, f"VignetteRidge{i}", "ground", {"max_radius": None}, vig)
        ridge.location = (cx, cy, -1)

    cx, cy = 0.0, 5.0
    chorten = put("highlands_chorten_great_a", cx, cy, 0.2)
    top = anchor_world(chorten)
    run = by_name["highlands_flag_run_a"], by_name["highlands_flag_run_b"]
    for i in range(14):
        a = i * math.tau / 14 + 0.1
        r = 5.0 + rng.uniform(-0.6, 0.8)
        px, py = cx + r * math.cos(a), cy + r * math.sin(a)
        peg = Vector((px, py, hill(px, py) + 0.35))
        string_segments(vig, run[i % 2], sag(top, peg, 0.35 + 0.1 * rng.random()), f"Fan{i}")
        put("highlands_lhatse_a" if i % 5 == 0 else "highlands_scree_patch_a", px, py, a)
    poles = [(-6.5, 1.0), (-4.0, -1.5), (5.5, 0.5), (7.5, 3.5)]
    pole_tops = []
    for i, (x, y) in enumerate(poles):
        pole = put(f"highlands_tharchok_{'ab'[i % 2]}", x, y, rng.random() * 6)
        pole_tops.append(anchor_world(pole))
    for a, b in ((0, 1), (2, 3)):
        string_segments(vig, run[a % 2], sag(pole_tops[a], pole_tops[b], 0.5), f"Poles{a}")
    put("highlands_mani_wall_a", -3.0, 9.5, 0.3)
    put("highlands_nomad_tent_a", 8.0, 9.0, -0.5)
    put("highlands_hermitage_a", -9.0, 12.0, 0.4)
    put("highlands_chorten_small_a", 3.5, 11.0)
    put("highlands_chorten_small_b", 4.6, 11.4)
    for name, n in (("tussock_grass", 40), ("blue_poppy", 6), ("mani_stones", 4), ("juniper_shrub", 6),
                    ("lungta_scraps", 10), ("scree_patch", 8), ("yak_skull", 1), ("butter_lamps", 1),
                    ("sang_burner", 1), ("prayer_wheel", 2)):
        for j in range(n):
            x, y = rng.uniform(-10, 10), rng.uniform(-3, 13)
            if math.hypot(x - cx, y - cy) < 1.7:
                continue
            put(f"highlands_{name}_{'ab'[j % 2]}", x, y, rng.random() * 6)

    cam = bpy.data.objects.new("VignetteCamera", bpy.data.cameras.new("VignetteCamera"))
    vig.objects.link(cam)
    cam.data.lens = 32
    cam.data.clip_end = 300
    cam.location = (3.5, -12.0, 5.2)
    cam.rotation_euler = (Vector((0.5, 6.0, 1.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sun = bpy.data.objects.new("VignetteSun", bpy.data.lights.new("VignetteSun", "SUN"))
    vig.objects.link(sun)
    sun.data.energy, sun.data.angle = 4.0, math.radians(4)
    sun.rotation_euler = (math.radians(42), math.radians(18), math.radians(-30))
    world = bpy.data.worlds.get("VignetteWorld") or bpy.data.worlds.new("VignetteWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (*props.linear("#3d78d8"), 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world
    render_settings(scene)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    return scene


def render_vignette(scene, directory):
    path = Path(directory) / "themes" / "highlands-vignette.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    window = bpy.context.window
    if window:
        previous, window.scene = window.scene, scene
    try:
        with bpy.context.temp_override(scene=scene):
            bpy.ops.render.render(write_still=True, scene=scene.name)
    finally:
        if window:
            window.scene = previous
    return path


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.get("ThemesShowroom") or bpy.data.scenes.new("ThemesShowroom")
    if bpy.context.window:
        bpy.context.window.scene = scene
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    objects = build(scene)
    report = export(objects, directory)
    preview, blocks = setup_preview(scene, objects)
    vignette = setup_vignette(objects)
    for other in list(bpy.data.scenes):
        if other not in (scene, vignette) and not other.objects:
            bpy.data.scenes.remove(other)
    bpy.ops.wm.save_as_mainfile(filepath=str(blends / "themes.blend"))
    if render:
        render_previews(scene, blocks, previews)
        render_vignette(vignette, previews)
    print(f"The Glass Bird themes: {len(objects)} props, {sum(r['triangles'] for r in report)} triangles")
    return report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    flags = {a for a in args if a.startswith("--")}
    paths = [a for a in args if not a.startswith("--")]
    if len(paths) > 1 or flags - {"--no-render"}:
        raise SystemExit("Usage: Blender -b --python blender/themes.py -- [output-directory] [--no-render]")
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    main(paths[0] if paths else None, render="--no-render" not in flags)
