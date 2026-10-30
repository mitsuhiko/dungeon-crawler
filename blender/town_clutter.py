"""The town's own clutter: street lamps, benches, a well, a hand cart, flower pots, hay
bales, a woodpile, a notice board, garlands and their poles, hedges and dry stone walls, in
game-cell units (character about 1.1 tall).

Blender -b --python blender/town_clutter.py -- [output-directory]

Writes assets/town_clutter.glb, blender/town_clutter.blend and
blender/previews/town_clutter-preview.png (an explicit directory receives all three:
scratch builds). MCP: import town_clutter; town_clutter.main()

Same palette, vertex-colour material and conventions as town.py: one mesh per prop, Z up,
fronts facing -Y (glTF +Z), the origin at the middle of its foot. The street lamps' glass and the
garlands' bulbs are the "_glow" material: the game lights them at night only (world/town.js
`night`). A garland is strung of segments (attach "line": its cord from the origin along X to 1).
"""
import math
from pathlib import Path
import random
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props
import town
from town import (WOOD, TIMBER, EDGE, CREAM, STONE, STONE_DARK, IRON, HAY, DARK, GLOW, ROOF_RED,
                  beam, crate, pot, solid)

LAMP_LIGHT = '#ffcf8a'
TERRACOTTA = '#b8714e'
BLOOMS = ['#e7cf7d', '#dca184', '#c97a9a', '#f0ede0', '#9fb6e0']


def shift(m, dx):
    """Move the whole prop along X (its origin to the middle of its foot)."""
    m.vertices = [(x + dx, y, z) for x, y, z in m.vertices]


def lamp_head(m, x, y, z, size=1.0):
    """A four-sided lantern: iron cap and foot, its glass glowing."""
    s = size
    m.box((x, y, z), (.2 * s, .2 * s, .05 * s), IRON)
    start = len(m.faces)
    m.box((x, y, z + .14 * s), (.15 * s, .15 * s, .22 * s), GLOW)
    m.glows[start:] = [True] * (len(m.faces) - start)
    for dx in (-.085, .085):
        for dy in (-.085, .085):
            m.box((x + dx * s, y + dy * s, z + .14 * s), (.03 * s, .03 * s, .24 * s), IRON)
    m.lathe((x, y, z + .25 * s), [(0, .15 * s), (.11 * s, .03 * s), (.14 * s, 0)], IRON, n=4, jitter=0,
            phase=math.pi / 4)


def build_street_lamp(m, v):
    m.box((0, 0, .09), (.3, .3, .18), STONE_DARK)
    m.box((0, 0, .21), (.2, .2, .08), STONE)
    if v == 0:
        # a post with its lantern on top
        m.lathe((0, 0, .24), [(0, .05), (1.5, .04)], IRON, n=6, jitter=0)
        m.ring((0, 0, .9), .055, .015, IRON, n=6)
        m.box((0, 0, 1.75), (.24, .24, .05), IRON)
        lamp_head(m, 0, 0, 1.77, 1.15)
    else:
        # a taller post with two lanterns hanging off its arms
        m.lathe((0, 0, .24), [(0, .055), (1.85, .045)], IRON, n=6, jitter=0)
        m.lathe((0, 0, 2.09), [(0, .06), (.12, 0)], IRON, n=6, jitter=0)
        for s in (-1, 1):
            beam(m, (0, 0, 1.95), (s * .4, 0, 1.95), .045, IRON)
            beam(m, (0, 0, 1.68), (s * .28, 0, 1.95), .035, IRON)
            beam(m, (s * .4, 0, 1.95), (s * .4, 0, 1.86), .02, IRON)
            lamp_head(m, s * .4, 0, 1.55, .95)


def build_crook_lamp(m, v):
    """A wooden post with a crook, its lantern hanging from it (for the lanes)."""
    m.lathe((0, 0, 0), [(0, .12), (.12, .11), (.16, .08)], STONE_DARK, n=6, jitter=.05)
    beam(m, (0, 0, .1), (0, 0, 2.05), .1, TIMBER)
    beam(m, (0, 0, 1.98), (.48, 0, 1.98), .08, TIMBER)
    beam(m, (0, 0, 1.62), (.3, 0, 1.96), .06, TIMBER)
    beam(m, (.42, 0, 1.94), (.42, 0, 1.8), .02, IRON)
    lamp_head(m, .42, 0, 1.5, .9)
    shift(m, -.12)


# the garlands' bulbs (their light) and the pennants between them
BULBS = ['#ffd27a', '#ff9f8a', '#ffe7a6']
PENNANTS = ['#c9544a', '#e3c45a', '#4f8fb0', '#f0ede0', '#7da35a']


def build_garland(m, v):
    """One segment of a garland (attach "line": world/town.js strings them between poles and
    sheers each along its sag): the cord along X from 0 to 1, a bulb hanging from its middle, a
    pennant either side of it."""
    m.tube([(0, 0, 0), (.5, 0, -.006), (1, 0, 0)], .008, '#4a3c2e', n=3)
    m.tube([(.5, 0, -.006), (.5, 0, -.05)], .004, '#3a3028', n=3)
    start = len(m.faces)
    m.lathe((.5, 0, -.15), [(0, .015), (.025, .05), (.075, .055), (.1, .03)], BULBS[v], n=6, jitter=0)
    m.glows[start:] = [True] * (len(m.faces) - start)
    m.lathe((.5, 0, -.06), [(0, .022), (.02, .022)], IRON, n=6, jitter=0)
    for k, x in enumerate((.2, .8)):
        c = PENNANTS[(v * 2 + k) % len(PENNANTS)]
        solid(m, [(x - .07, 0, -.003), (x + .07, 0, -.003), (x, 0, -.17)], (0, .012, 0), c)


def build_garland_pole(m, v):
    """A tall pole the garlands are tied to: a stone foot, a hook at its top, a pennant."""
    m.lathe((0, 0, 0), [(0, .17), (.14, .15), (.2, .1)], STONE, n=6, jitter=.05)
    m.lathe((0, 0, .15), [(0, .055), (2.55, .045)], TIMBER, n=6, jitter=0)
    m.ring((0, 0, 2.55), .06, .015, IRON, n=6)
    m.lathe((0, 0, 2.7), [(0, .07), (.09, 0)], EDGE, n=6, jitter=0)
    beam(m, (0, 0, 2.66), (0, 0, 2.95), .025, IRON)
    solid(m, [(0, 0, 2.94), (.34, 0, 2.86), (0, 0, 2.76)], (0, .015, 0), PENNANTS[v])
    for z in (.9, 1.2):
        m.ring((0, 0, z), .055, .012, '#c9544a' if v else '#4f8fb0', n=6)


def build_hedge(m, v):
    """Two cells of trimmed hedge along X (v 1: in flower)."""
    rng = random.Random(41 + v)
    m.box((0, 0, .36), (1.9, .5, .72), '#4f7034', jitter=.02)
    for i in range(9):
        x = -.85 + i * .2125
        for z, w in ((.42, .3), (.72, .26)):
            m.blob((x + rng.uniform(-.05, .05), rng.uniform(-.04, .04), z), (w * .62, w, w * .55),
                   rng.choice(['#5b7d3c', '#527536', '#628544']), n=5, jitter=.12)
    if v == 1:
        for _ in range(16):
            x, s = rng.uniform(-.9, .9), rng.choice((-1, 1))
            m.blob((x, s * .27, rng.uniform(.35, .8)), (.04, .03, .04), rng.choice(BLOOMS), n=4)


def build_stone_wall(m, v):
    """Two cells of dry stone wall along X, a few stones fallen off it and moss on it (v 1)."""
    rng = random.Random(61 + v)
    stones = ['#9a9488', '#8b8579', '#a8a294', '#7f7a6f']
    for row, (z, h) in enumerate(((.1, .2), (.28, .17), (.44, .15))):
        x = -1.0 + (.1 if row % 2 else 0)
        while x < .98:
            w = min(1.0 - x, rng.uniform(.18, .32))
            if w > .05:
                m.box((x + w / 2, rng.uniform(-.02, .02), z), (w - .02, .42 - row * .05, h), rng.choice(stones),
                      tilt=rng.uniform(-.06, .06), jitter=.015)
            x += w
    m.box((0, 0, .56), (1.96, .3, .08), '#8f8a7e', jitter=.02)
    if v == 1:
        for _ in range(5):
            m.blob((rng.uniform(-.8, .8), rng.uniform(-.08, .08), .6), (.16, .12, .05), '#61793f', n=5)
        m.blob((.6, -.36, .07), (.12, .1, .07), stones[1], n=5)


def build_bench(m, v):
    w = 1.05 if v == 0 else .8
    m.box((0, 0, .42), (w, .34, .06), WOOD)
    m.box((0, -.12, .42), (w, .1, .065), EDGE)
    for x in (-w / 2 + .1, w / 2 - .1):
        m.box((x, -.1, .2), (.07, .07, .4), TIMBER)
        m.box((x, .1, .38), (.07, .07, .76), TIMBER)
        m.box((x, 0, .1), (.06, .26, .05), TIMBER)
    for z in (.6, .72):
        m.box((0, .13, z), (w, .04, .08), WOOD)
    if v == 1:
        # a bucket of flowers set down beside it
        pot(m, (w / 2 + .2, -.05, 0), WOOD, .9)
        for i, c in enumerate(BLOOMS[:3]):
            m.blob((w / 2 + .2 + (i - 1) * .06, -.05, .27), (.06, .06, .06), c, n=5)


def build_well(m, v):
    m.lathe((0, 0, 0), [(0, .48), (.62, .46), (.7, .5)], STONE, n=12, jitter=.03)
    m.lathe((0, 0, .68), [(0, .4), (.03, .4)], '#3e5a63', n=12, jitter=0)
    for i in range(6):
        a = i * math.tau / 6 + .3
        m.box(props.polar(.47, a, .35), (.16, .1, .12), STONE_DARK, tilt=a + math.pi / 2)
    for s in (-1, 1):
        beam(m, (s * .5, 0, .2), (s * .5, 0, 1.55), .1, TIMBER)
    beam(m, (-.58, 0, 1.18), (.62, 0, 1.18), .07, WOOD)
    m.lathe((0, 0, 1.18), [(-.18, .07), (.18, .07)], WOOD, n=6, jitter=0, axis=(1, 0, 0))
    beam(m, (.62, 0, 1.18), (.62, -.18, 1.05), .03, IRON)
    # rope and bucket
    beam(m, (0, 0, 1.12), (0, 0, .95), .015, HAY)
    pot(m, (0, 0, .72), WOOD, .9)
    m.ring((0, 0, .95), .09, .01, IRON, n=8)
    # a little gable roof
    for s in (-1, 1):
        solid(m, [(-.7, 0, 1.92), (.7, 0, 1.92), (.7, s * .62, 1.45), (-.7, s * .62, 1.45)], (0, 0, -.06), ROOF_RED[1 if s > 0 else 0])
    solid(m, [(-.58, -.5, 1.47), (-.58, .5, 1.47), (-.58, 0, 1.88)], (-.05, 0, 0), WOOD)
    solid(m, [(.58, -.5, 1.47), (.58, .5, 1.47), (.58, 0, 1.88)], (.05, 0, 0), WOOD)


def build_handcart(m, v):
    m.box((0, 0, .5), (1.0, .62, .07), WOOD)
    for s in (-1, 1):
        m.box((0, s * .3, .62), (1.0, .05, .2), EDGE)
    m.box((.48, 0, .62), (.05, .62, .2), EDGE)
    m.box((-.48, 0, .62), (.05, .62, .2), EDGE)
    for s in (-1, 1):
        m.ring((.05, s * .37, .32), .27, .035, TIMBER, n=12)
        for i in range(4):
            a = i * math.pi / 4
            beam(m, (.05 - .26 * math.cos(a), s * .37, .32 - .26 * math.sin(a)),
                 (.05 + .26 * math.cos(a), s * .37, .32 + .26 * math.sin(a)), .03, WOOD)
        beam(m, (-.5, s * .24, .5), (-1.02, s * .24, .6), .055, TIMBER)
    beam(m, (.05, -.4, .32), (.05, .4, .32), .05, IRON)
    beam(m, (.42, -.2, .46), (.42, -.2, .05), .05, TIMBER)
    beam(m, (.42, .2, .46), (.42, .2, .05), .05, TIMBER)
    if v == 0:
        for x, y, c in ((-.2, -.1, '#cdb88a'), (.15, .12, '#bda476'), (.2, -.14, '#cdb88a')):
            m.blob((x, y, .7), (.2, .16, .17), c, n=7)
    else:
        m.box((0, 0, .7), (.9, .52, .2), HAY, jitter=.03)
        for i in range(5):
            m.blob(((i - 2) * .18, 0, .82), (.14, .24, .08), HAY, n=6)
        crate(m, (.2, 0, 1.03), .32)
    shift(m, .26)   # (round the middle of the whole: its handles out to one side)


def build_flower_pots(m, v):
    spots = [(-.24, .03, 1.4), (.16, -.13, 1.12), (.27, .21, .9)] if v == 0 else [(-.16, 0, 1.26), (.21, .05, 1.0)]
    for i, (x, y, s) in enumerate(spots):
        pot(m, (x, y, 0), TERRACOTTA if (i + v) % 2 == 0 else '#9c6a4a', s)
        top = .28 * s
        m.lathe((x, y, top - .02), [(0, .1 * s), (.02, .1 * s)], '#4e3a2a', n=8, jitter=0)
        for j in range(4):
            a = j * math.tau / 4 + i
            m.blob((x + .05 * s * math.cos(a), y + .05 * s * math.sin(a), top + .08 * s), (.08 * s, .08 * s, .1 * s), '#659449', n=5)
        for j in range(3):
            a = j * math.tau / 3 + i * 1.7
            m.blob((x + .06 * s * math.cos(a), y + .06 * s * math.sin(a), top + .17 * s), (.045 * s, .045 * s, .04 * s),
                   BLOOMS[(i * 2 + j + v) % len(BLOOMS)], n=5)


def build_hay_bales(m, v):
    def bale(x, y, z, yaw=0):
        m.box((x, y, z + .2), (.7, .44, .4), HAY, tilt=yaw, jitter=.02)
        for dx in (-.18, .18):
            c, s = math.cos(yaw), math.sin(yaw)
            m.box((x + dx * c, y + dx * s, z + .2), (.04, .46, .42), '#948252', tilt=yaw)
        m.blob((x, y, z + .41), (.3, .18, .03), '#d8bc74', n=6)
    if v == 0:
        bale(0, 0, 0, .1)
    else:
        bale(-.2, -.05, 0, .05)
        bale(.45, .1, 0, -.2)
        bale(.1, .02, .4, .5)
    for i in range(6):
        a = i * 1.1
        m.leaf(props.polar(.45, a, 0), props.polar(.6, a + .3, .05), .04, '#d8bc74')


def build_woodpile(m, v):
    # split logs stacked between two stakes, a chopping block with its axe
    for row, (n, z) in enumerate(((4, .1), (3, .28), (2, .45))):
        for i in range(n):
            y = (i - (n - 1) / 2) * .19
            m.lathe((-.1, y, z), [(-.38, .09), (.38, .09)], '#8a6a48', n=6, jitter=.08, axis=(1, 0, 0), phase=row + i)
            m.lathe((-.5, y, z), [(0, .07), (.01, .07)], '#d8bf94', n=6, jitter=0, axis=(1, 0, 0))
    for s in (-1, 1):
        beam(m, (-.1, s * .42, 0), (-.1, s * .42, .62), .06, TIMBER)
    m.lathe((.62, -.08, 0), [(0, .2), (.32, .19)], '#8a6a48', n=8, jitter=.04)
    m.lathe((.62, -.08, .32), [(0, .18), (.01, .18)], '#d8bf94', n=8, jitter=0)
    beam(m, (.6, -.08, .34), (.86, -.2, .66), .04, WOOD)
    m.box((.6, -.06, .38), (.16, .03, .1), IRON, tilt=.4)
    shift(m, -.19)


def build_notice_board(m, v):
    for s in (-1, 1):
        beam(m, (s * .5, 0, 0), (s * .5, 0, 1.75), .1, TIMBER)
    m.box((0, 0, 1.15), (.92, .06, .7), WOOD)
    m.box((0, -.035, 1.52), (.98, .05, .06), EDGE)
    m.box((0, -.035, .79), (.98, .05, .06), EDGE)
    rng = random.Random(77)
    for x, z, w, h in ((-.27, 1.25, .26, .32), (.05, 1.3, .22, .26), (.3, 1.15, .24, .34), (-.05, .98, .3, .2), (-.3, .94, .18, .16)):
        m.box((x, -.04, z), (w, .01, h), CREAM if rng.random() < .7 else '#e8dcb5', tilt=0)
        m.box((x, -.05, z + h / 2 - .03), (.025, .01, .025), DARK)
    solid(m, [(-.62, -.22, 1.72), (.62, -.22, 1.72), (.62, .16, 1.9), (-.62, .16, 1.9)], (0, 0, .05), ROOF_RED[2])


# (name, builder, variant, hints)
SPECS = [
    ('town_street_lamp_a', build_street_lamp, 0, {'light': LAMP_LIGHT, 'intensity': 4.5}),
    ('town_street_lamp_b', build_street_lamp, 1, {'light': LAMP_LIGHT, 'intensity': 4.5}),
    ('town_bench_a', build_bench, 0, {'blocking': True}),
    ('town_bench_b', build_bench, 1, {'blocking': True}),
    ('town_well_a', build_well, 0, {'blocking': True}),
    ('town_handcart_a', build_handcart, 0, {'blocking': True}),
    ('town_handcart_b', build_handcart, 1, {'blocking': True}),
    ('town_flower_pots_a', build_flower_pots, 0, {}),
    ('town_flower_pots_b', build_flower_pots, 1, {}),
    ('town_hay_bales_a', build_hay_bales, 0, {'blocking': True}),
    ('town_hay_bales_b', build_hay_bales, 1, {'blocking': True}),
    ('town_woodpile_a', build_woodpile, 0, {'blocking': True}),
    ('town_notice_board_a', build_notice_board, 0, {'blocking': True}),
    ('town_street_lamp_c', build_crook_lamp, 0, {'light': LAMP_LIGHT, 'intensity': 4}),
    ('town_garland_a', build_garland, 0, {'light': BULBS[0], 'intensity': 1.6}),
    ('town_garland_b', build_garland, 1, {'light': BULBS[1], 'intensity': 1.6}),
    ('town_garland_c', build_garland, 2, {'light': BULBS[2], 'intensity': 1.6}),
    ('town_garland_pole_a', build_garland_pole, 0, {'blocking': True}),
    ('town_garland_pole_b', build_garland_pole, 1, {'blocking': True}),
    ('town_hedge_a', build_hedge, 0, {'blocking': True}),
    ('town_hedge_b', build_hedge, 1, {'blocking': True}),
    ('town_stone_wall_a', build_stone_wall, 0, {'blocking': True}),
    ('town_stone_wall_b', build_stone_wall, 1, {'blocking': True}),
]
# the garlands' segments hang from their cord (attach "line", as the dark forest's lanterns' strings)
LINES = {'town_garland_a', 'town_garland_b', 'town_garland_c'}


def build(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get('TownClutter') or bpy.data.collections.new('TownClutter')
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for i, (name, builder, variant, hints) in enumerate(SPECS):
        m = props.Mesh(random.Random(9300 + i))
        builder(m, variant)
        obj = props.finish(m, name, 'line' if name in LINES else 'ground', {'max_radius': None, 'blocking': False, **hints}, collection)
        obj['cube_crawler_town_clutter'] = True
        objects.append(obj)
    return objects


def validate(objects):
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        lo = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
        if obj.name in LINES:
            # (its cord from the origin along X to 1, hanging under it)
            assert abs(lo[0]) < .01 and abs(hi[0] - 1) < .01 and hi[2] < .01, (obj.name, lo, hi)
        else:
            assert abs(lo[2]) < 1e-6, (obj.name, lo)
        assert not mesh.uv_layers and not any(p.use_smooth for p in mesh.polygons), obj.name
        assert 60 <= len(mesh.loop_triangles) <= 3000, (obj.name, len(mesh.loop_triangles))
        assert ('light' in obj) == (len(mesh.materials) == 2), obj.name


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.new('TownClutterPreview')
    if bpy.context.window:
        bpy.context.window.scene = scene
    objects = build(scene)
    validate(objects)
    props.export_gltf(objects, Path(directory) / 'town_clutter.glb')
    for i, obj in enumerate(objects):
        obj.location = ((i % 6) * 2.2, (i // 6) * 2.4, 2.2 if obj.name in LINES else 0)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(4, 2, -.02))
    floor = bpy.context.object
    floor.name = 'TownClutterFloor_NOT_EXPORTED'
    floor.data.materials.append(town.plain_material('TownClutterGround', '#c3c4b0'))
    camera = bpy.data.objects.new('TownClutterCamera', bpy.data.cameras.new('TownClutterCamera'))
    scene.collection.objects.link(camera)
    camera.location = (16, -12, 13)
    town.aim(camera, (5.5, 3.6, .6))
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 16
    scene.camera = camera
    for name, position, energy in [('Key', (-2, -8, 14), 1800), ('Fill', (10, 6, 12), 1200)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location, light.data.energy, light.data.size = position, energy, 8
        town.aim(light, (4, 2, 0))
    world = bpy.data.worlds.new('TownClutterWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    scene.world = world
    scene.render.engine, scene.cycles.samples = 'CYCLES', 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1400, 900, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(Path(previews) / 'town_clutter-preview.png')
    if bpy.app.background:
        for other in list(bpy.data.scenes):
            if other != scene and not other.objects:
                bpy.data.scenes.remove(other)
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(blends) / 'town_clutter.blend'))
    else:
        bpy.data.libraries.write(str(Path(blends) / 'town_clutter.blend'), {scene}, fake_user=True)
    if render:
        bpy.ops.render.render(write_still=True)
    return [{'name': o.name, 'triangles': len(o.data.polygons)} for o in objects]


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    print(main(args[0] if args else None))
