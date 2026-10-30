"""The town's wall (docs/town.md): its stretches, its towers, its gatehouse over the street and the
arches it stands on where it crosses the water, in game-cell units (character about 1.1 tall).
world/town.js rings the town with them, a cell in from the forest round it.

Blender -b --python blender/town_walls.py -- [output-directory]

Writes assets/town_walls.glb, blender/town_walls.blend and
blender/previews/town_walls-preview.png (an explicit directory receives all three: scratch
builds). MCP: import town_walls; town_walls.main()

Same palette, vertex-colour material and conventions as town.py: one mesh per prop, Z up, the
outer face (the forest's side) facing -Y (glTF +Z), the origin at the middle of its foot. Every
piece stands on a footing sunk into the ground (FOOT under the ground's line; an arch's under the
water's), so it stands on uneven ground and on a slope without a gap under it. A stretch is one
cell long (X from -0.5 to 0.5): they join end to end. The lanterns are the "_glow" material, lit at
night only (world/town.js `night`).
"""
import math
from pathlib import Path
import random
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props
import town
from town import WOOD, TIMBER, EDGE, IRON, DARK, ROOF_RED, ROOF_BLUE, beam, solid, lantern

# how far a piece reaches under the ground's line (world/town.js WALL_FOOT); an arch under the
# water's, and the water's a level (0.5) under the banks
FOOT = .9
ARCH_FOOT = 1.1
# the wall's thickness, the height of its walk over the ground and of its merlons over that
THICK = .66
WALK = 1.85
MERLON = .42
STONES = ['#a49b8b', '#968d7e', '#ada595', '#8c8475', '#9f9789']
FOOTING = '#6d665b'
CAP = '#b8b0a0'
MOSS = '#61793f'
IVY = ['#4f6e36', '#5d7d3f', '#466331']
BANNER = '#2f6f78'
AMBER = '#e2a64b'
LIGHT = '#ffc27a'


def courses(m, x0, x1, z0, z1, y0, y1, rng, height=.27, inset=0):
    """Rows of stone blocks filling the box x0..x1, y0..y1 from z0 to z1, in a running bond;
    each block its own shade and a hair proud of or back from the face."""
    rows = max(1, round((z1 - z0) / height))
    h = (z1 - z0) / rows
    for r in range(rows):
        z = z0 + r * h
        edges = [x0]
        x = x0 + (.18 + .25 * rng.random()) * (1 if r % 2 else .6)
        while x < x1 - .2:
            edges.append(x)
            x += .32 + .28 * rng.random()
        edges.append(x1)
        for a, b in zip(edges, edges[1:]):
            d = rng.uniform(-.012, .016)
            m.box(((a + b) / 2, (y0 + y1) / 2, z + h / 2), (b - a - .012, y1 - y0 + 2 * d - inset, h - .012),
                  rng.choice(STONES))


def footing(m, w, d, top, x=0, y=0):
    """The footing under the ground, its plinth showing a little over it."""
    m.box((x, y, (top - .1) / 2), (w + .06, d + .06, top - .1), FOOTING)
    m.box((x, y, top - .05), (w + .1, d + .1, .2), FOOTING)


def merlons(m, x0, x1, y, z, depth=.2, width=.42, gap=.36, rng=None):
    """Merlons along X on the parapet's face line y, starting with a gap of half `gap`."""
    n = max(1, round((x1 - x0) / (width + gap)))
    step = (x1 - x0) / n
    for i in range(n):
        cx = x0 + step * (i + .5)
        m.box((cx, y, z + MERLON / 2), (step - gap, depth, MERLON), rng.choice(STONES) if rng else CAP)
        m.box((cx, y, z + MERLON + .025), (step - gap + .04, depth + .04, .05), CAP)


def parapet(m, x0, x1, top, rng):
    """The wall's top: its walk (paved), the parapet on the outer side with its merlons, a low
    lip on the inner side."""
    m.box(((x0 + x1) / 2, 0, top + .02), (x1 - x0, THICK, .04), CAP)
    m.box(((x0 + x1) / 2, -THICK / 2 + .11, top + .11), (x1 - x0, .22, .18), CAP)
    merlons(m, x0, x1, -THICK / 2 + .11, top + .2, depth=.22, rng=rng)
    m.box(((x0 + x1) / 2, THICK / 2 - .06, top + .07), (x1 - x0, .12, .1), CAP)


def ivy(m, rng, side, x0, x1, z0, z1, count=9):
    """Ivy climbing a face (side -1: the outer, +1: the inner), thick at its foot."""
    y = side * (THICK / 2 + .03)
    for _ in range(count):
        sx = rng.uniform(.1, .2)
        x = rng.uniform(x0 + sx, x1 - sx)
        z = z0 + (z1 - z0) * rng.random() ** 1.8
        m.blob((x, y, z), (sx, .05, rng.uniform(.1, .2)), rng.choice(IVY), n=5)


def wall_lantern(m, x, y, z, side=1):
    """A lantern on an iron bracket out of a face (side +1: the inner, -1: the outer)."""
    beam(m, (x, y, z + .42), (x, y + side * .3, z + .42), .04, IRON)
    beam(m, (x, y, z + .18), (x, y + side * .2, z + .4), .03, IRON)
    m.box((x, y + side * .02, z + .3), (.12, .04, .3), IRON)
    lantern(m, (x, y + side * .3, z), .9)


def build_wall(m, v):
    """One cell of the wall: a stretch (v 0), ivy over it (1), a lantern on its inner face (2)."""
    rng = random.Random(311 + v)
    footing(m, 1.0, THICK, FOOT)
    courses(m, -.5, .5, FOOT, FOOT + WALK, -THICK / 2, THICK / 2, rng)
    parapet(m, -.5, .5, FOOT + WALK, rng)
    m.box((0, 0, FOOT + .02), (1.0, THICK + .14, .06), MOSS)
    if v == 1:
        ivy(m, rng, -1, -.45, .45, FOOT, FOOT + WALK * .9, 12)
        ivy(m, rng, 1, -.4, .3, FOOT, FOOT + WALK * .5, 5)
    if v == 2:
        wall_lantern(m, 0, THICK / 2, FOOT + 1.05)


def build_arch(m, v):
    """One cell of the wall where it crosses the water: an arch over it, a grate in the arch."""
    rng = random.Random(411 + v)
    surface = ARCH_FOOT
    ground = surface + .5
    top = ground + WALK
    spring, crown = surface + .35, surface + .8
    # the piers (half of one at each end: two arches side by side share one)
    for s in (-1, 1):
        m.box((s * .43, 0, spring / 2), (.14, THICK + .06, spring), FOOTING)
    # the arch's stones over the opening (its underside a half circle) and the wall over it
    r = .36
    arc = [(r * math.cos(math.pi * i / 8), spring + (crown - spring) * math.sin(math.pi * i / 8)) for i in range(9)]
    outline = [(-.5, top), (.5, top), (.5, spring)] + [(x, z) for x, z in arc] + [(-.5, spring)]
    solid(m, [(x, -THICK / 2, z) for x, z in outline], (0, THICK, 0), STONES[0])
    # voussoirs round the opening, on both faces
    for s in (-1, 1):
        for i in range(8):
            a0, a1 = math.pi * i / 8, math.pi * (i + 1) / 8
            am = (a0 + a1) / 2
            x, z = (r + .07) * math.cos(am), spring + (crown - spring + .07) * math.sin(am)
            m.box((x, s * (THICK / 2 + .005), z), (.13, .03, .13), rng.choice(STONES), tilt=0)
    # courses over the arch, on its faces
    for s in (-1, 1):
        y = s * (THICK / 2 + .004)
        z = crown + .12
        while z < top - .1:
            x = -.5 + rng.uniform(0, .25)
            while x < .5:
                w = min(.5 - x, rng.uniform(.25, .45))
                if w > .06:
                    m.box((x + w / 2, y, z + .12), (w - .012, .02, .24 - .012), rng.choice(STONES))
                x += w
            z += .25
    # the grate: iron bars down into the water, two across them
    for i in range(5):
        x = -.24 + i * .12
        h = spring + (crown - spring) * math.sqrt(max(0, 1 - (x / r) ** 2)) - .02
        m.box((x, 0, h / 2 + .2), (.03, .03, h - .4), IRON)
    for z in (surface + .02, spring - .05):
        m.box((0, 0, z), (.62, .035, .035), IRON)
    parapet(m, -.5, .5, top, rng)
    if v == 1:
        wall_lantern(m, 0, THICK / 2, ground + 1.0)


def build_tower(m, v):
    """A round tower of the wall (its corners, and along it): open on top with a brazier (v 0) or
    under a pointed roof, a banner on its outer side (1)."""
    rng = random.Random(511 + v)
    R = .8
    body = FOOT + 3.0
    m.lathe((0, 0, 0), [(0, R + .1), (FOOT + .1, R + .1), (FOOT + .25, R + .02)], FOOTING, n=10, jitter=0)
    # its stones in rings, each its own shade
    rings = 11
    for i in range(rings):
        z0 = FOOT + .25 + (body - FOOT - .25) * i / rings
        z1 = FOOT + .25 + (body - FOOT - .25) * (i + 1) / rings
        start = len(m.faces)
        m.lathe((0, 0, z0), [(0, R), (z1 - z0, R)], STONES[i % len(STONES)], n=10, jitter=.012,
                phase=(i % 2) * math.pi / 10)
        for k in range(start, len(m.faces)):
            m.colors[k] = tuple(min(1, c * rng.uniform(.9, 1.08)) for c in m.colors[k][:3]) + (1,)
    # corbels and the parapet round its top
    m.lathe((0, 0, body), [(0, R + .02), (.18, R + .16), (.2, R + .16)], CAP, n=10, jitter=0)
    for i in range(10):
        a = math.tau * i / 10
        m.box((math.cos(a) * (R + .05), math.sin(a) * (R + .05), body - .1), (.16, .16, .2), FOOTING, tilt=a)
    if v == 0:
        m.lathe((0, 0, body + .2), [(0, R + .16), (.3, R + .16), (.3, R - .02), (.06, R - .02)], STONES[1], n=10, jitter=0)
        for i in range(8):
            a = math.tau * (i + .5) / 8
            m.box((math.cos(a) * (R + .06), math.sin(a) * (R + .06), body + .5 + MERLON / 2 - .05),
                  (.34, .2, MERLON), rng.choice(STONES), tilt=a + math.pi / 2)
        # a brazier burning on top
        m.lathe((0, 0, body + .26), [(0, .06), (.3, .06), (.42, .2), (.5, .24)], IRON, n=8, jitter=0)
        start = len(m.faces)
        m.blob((0, 0, body + .62), (.17, .17, .16), '#ffb24a', n=6, jitter=.15)
        m.glows[start:] = [True] * (len(m.faces) - start)
    else:
        m.lathe((0, 0, body + .2), [(0, R + .16), (.12, R + .16)], STONES[1], n=10, jitter=0)
        roof = ROOF_RED if rng.random() < .5 else ROOF_BLUE
        m.lathe((0, 0, body + .3), [(0, R + .3), (.15, R + .22), (1.55, 0)], roof[0], n=10, jitter=0,
                colors=[roof[0], roof[1]])
        beam(m, (0, 0, body + 1.8), (0, 0, body + 2.35), .04, IRON)
        solid(m, [(0, 0, body + 2.3), (.42, 0, body + 2.2), (0, 0, body + 2.1)], (0, .02, 0), BANNER)
        # a banner on its outer face: the glass bird, amber on teal
        y = -R - .03
        m.box((0, y, body - .75), (.5, .03, .9), BANNER)
        solid(m, [(-.25, y - .02, body - 1.2), (0, y - .02, body - .95), (.25, y - .02, body - 1.2)],
              (0, .02, 0), BANNER)
        bird(m, 0, y - .025, body - .65, .32)
        m.box((0, y - .02, body - .28), (.62, .05, .05), TIMBER)
    # arrow slits
    for k in range(3):
        a = -math.pi / 2 + (k - 1) * .9
        for z in (FOOT + 1.2, FOOT + 2.3):
            m.box((math.cos(a) * (R + .005), math.sin(a) * (R + .005), z), (.07, .04, .34), DARK, tilt=a + math.pi / 2)
    # its door, on the inner side; a lantern over it
    m.box((0, R - .05, FOOT + .62), (.5, .2, 1.0), TIMBER)
    m.box((0, R + .02, FOOT + .6), (.42, .08, .92), WOOD)
    for z in (FOOT + .35, FOOT + .85):
        m.box((0, R + .07, z), (.4, .02, .04), IRON)
    wall_lantern(m, .5, R - .1, FOOT + 1.25)


def bird(m, x, y, z, s):
    """The glass bird on a banner: its body, its wings up, its tail (a raised amber shape)."""
    pts = [(-.5, .05), (-.15, .12), (-.32, .5), (0, .22), (.32, .5), (.15, .12), (.5, .05), (.12, -.08),
           (.18, -.42), (0, -.24), (-.18, -.42), (-.12, -.08)]
    solid(m, [(x + px * s, y, z + pz * s) for px, pz in pts], (0, .02, 0), AMBER)


def build_gatehouse(m, v):
    """The town's gate over the street: two square towers and an arch between them, its doors
    open, the portcullis up, lanterns either side of the way in and out, banners."""
    rng = random.Random(611)
    half, tw, td = 2.5, 1.5, 1.5
    height = FOOT + 3.4
    for s in (-1, 1):
        cx = s * (half - tw / 2)
        footing(m, tw, td, FOOT, x=cx)
        courses(m, cx - tw / 2, cx + tw / 2, FOOT, height, -td / 2, td / 2, rng)
        m.box((cx, 0, height + .03), (tw + .1, td + .1, .06), CAP)
        merlons(m, cx - tw / 2, cx + tw / 2, -td / 2 + .1, height + .06, depth=.2, rng=rng)
        merlons(m, cx - tw / 2, cx + tw / 2, td / 2 - .1, height + .06, depth=.2, rng=rng)
        for yy in (-1, 1):
            m.box((cx + s * (tw / 2 - .1), yy * .3, height + .06 + MERLON / 2), (.2, .3, MERLON), rng.choice(STONES))
        # a banner on its outer face
        y = -td / 2 - .03
        m.box((cx, y, height - .9), (.56, .03, 1.1), BANNER)
        solid(m, [(cx - .28, y - .02, height - 1.45), (cx, y - .02, height - 1.2), (cx + .28, y - .02, height - 1.45)],
              (0, .02, 0), BANNER)
        bird(m, cx, y - .025, height - .82, .36)
        m.box((cx, y - .02, height - .33), (.7, .05, .05), TIMBER)
        # arrow slits on its sides
        m.box((cx, -td / 2 - .005, FOOT + 1.0), (.08, .04, .38), DARK)
    # the arch between them, the wall over it
    inner = half - tw
    top = FOOT + 3.0
    spring, crown = FOOT + 1.75, FOOT + 2.3
    arc = [(inner * math.cos(math.pi * i / 10), spring + (crown - spring) * math.sin(math.pi * i / 10)) for i in range(11)]
    outline = [(-inner, top), (inner, top), (inner, spring)] + arc + [(-inner, spring)]
    solid(m, [(x, -.45, z) for x, z in outline], (0, .9, 0), STONES[2])
    for s in (-1, 1):
        for i in range(10):
            am = math.pi * (i + .5) / 10
            m.box(((inner + .09) * math.cos(am), s * .455, spring + (crown - spring + .09) * math.sin(am)), (.2, .03, .18),
                  rng.choice(STONES))
    m.box((0, 0, top + .03), (2 * inner, .9, .06), CAP)
    merlons(m, -inner, inner, -.35, top + .06, depth=.2, rng=rng)
    # the passage's paving, a hair over the ground's line
    m.box((0, 0, FOOT + .01), (2 * inner, td, .04), '#8f8778')
    # the portcullis drawn up into the arch
    for i in range(7):
        x = -inner + .2 + i * (2 * inner - .4) / 6
        m.box((x, 0, crown - .18), (.04, .05, .5), IRON)
    m.box((0, 0, crown - .4), (2 * inner - .3, .05, .05), IRON)
    # the gates, swung open into the town against the passage's sides
    for s in (-1, 1):
        x = s * (inner - .06)
        m.box((x, .45 + .5, FOOT + .95), (.08, 1.0, 1.75), WOOD)
        for z in (FOOT + .4, FOOT + 1.5):
            m.box((x - s * .05, .95, z), (.03, .96, .08), IRON)
        for i in range(4):
            m.box((x - s * .045, .5 + i * .25, FOOT + .95), (.02, .03, 1.7), TIMBER)
    # lanterns either side of the way, outside and in
    for s in (-1, 1):
        wall_lantern(m, s * (inner + .22), -td / 2, FOOT + 1.4, side=-1)
        wall_lantern(m, s * (inner + .22), td / 2, FOOT + 1.4, side=1)


# (name, builder, variant, hints)
SPECS = [
    ('town_wall_a', build_wall, 0, {'blocking': True}),
    ('town_wall_b', build_wall, 1, {'blocking': True}),
    ('town_wall_lantern_a', build_wall, 2, {'blocking': True, 'light': LIGHT, 'intensity': 2}),
    ('town_wall_arch_a', build_arch, 0, {'blocking': True}),
    ('town_wall_arch_b', build_arch, 1, {'blocking': True, 'light': LIGHT, 'intensity': 2}),
    ('town_wall_tower_a', build_tower, 0, {'blocking': True, 'light': LIGHT, 'intensity': 2.5}),
    ('town_wall_tower_b', build_tower, 1, {'blocking': True, 'light': LIGHT, 'intensity': 2}),
    ('town_gatehouse_a', build_gatehouse, 0, {'blocking': True, 'light': LIGHT, 'intensity': 3}),
]


def build(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get('TownWalls') or bpy.data.collections.new('TownWalls')
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for i, (name, builder, variant, hints) in enumerate(SPECS):
        m = props.Mesh(random.Random(9900 + i))
        builder(m, variant)
        obj = props.finish(m, name, 'ground', {'max_radius': None, 'blocking': False, **hints}, collection)
        obj['cube_crawler_town_wall'] = True
        obj['foot'] = ARCH_FOOT if 'arch' in name else FOOT
        objects.append(obj)
    return objects


def validate(objects):
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        lo = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
        hi = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
        assert abs(lo[2]) < 1e-6, (obj.name, lo)
        assert not mesh.uv_layers and not any(p.use_smooth for p in mesh.polygons), obj.name
        assert 60 <= len(mesh.loop_triangles) <= 6000, (obj.name, len(mesh.loop_triangles))
        assert ('light' in obj) == (len(mesh.materials) == 2), obj.name
        # (a stretch, an arch: a cell long, so they join end to end)
        if obj.name.startswith(('town_wall_a', 'town_wall_b', 'town_wall_lantern', 'town_wall_arch')):
            assert abs(lo[0] + .5) < .07 and abs(hi[0] - .5) < .07, (obj.name, lo, hi)


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.new('TownWallsPreview')
    if bpy.context.window:
        bpy.context.window.scene = scene
    objects = build(scene)
    validate(objects)
    props.export_gltf(objects, Path(directory) / 'town_walls.glb')
    # the preview: a stretch of wall with its towers and the gate in it, an arcade over a pool
    layout = {'town_gatehouse_a': (0, 0), 'town_wall_tower_a': (-5, 0), 'town_wall_tower_b': (5, 0),
              'town_wall_a': (-3, 0), 'town_wall_b': (3, 0), 'town_wall_lantern_a': (-4, 0),
              'town_wall_arch_a': (-1, -4), 'town_wall_arch_b': (0, -4)}
    for obj in objects:
        x, y = layout[obj.name]
        obj.location = (x, y, -(ARCH_FOOT if 'arch' in obj.name else FOOT))
    extra = []
    for x in (-2, 2, 4):
        o = objects[0].copy()
        o.name = f'TownWallsCopy{x}_NOT_EXPORTED'
        o.location = (x, 0, -FOOT)
        scene.collection.objects.link(o)
        extra.append(o)
    for x in (1, -2):
        o = objects[3].copy()
        o.name = f'TownWallsArchCopy{x}_NOT_EXPORTED'
        o.location = (x, -4, -ARCH_FOOT)
        scene.collection.objects.link(o)
        extra.append(o)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = 'TownWallsFloor_NOT_EXPORTED'
    floor.data.materials.append(town.plain_material('TownWallsGround', '#9fae84'))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-.5, -4, -.5))
    pool = bpy.context.object
    pool.name = 'TownWallsWater_NOT_EXPORTED'
    pool.scale = (5, 3, 1)
    pool.data.materials.append(town.plain_material('TownWallsWater', '#4f7f9c'))
    camera = bpy.data.objects.new('TownWallsCamera', bpy.data.cameras.new('TownWallsCamera'))
    scene.collection.objects.link(camera)
    camera.location = (9, -16, 11)
    town.aim(camera, (0, -1.5, 1.4))
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 14
    scene.camera = camera
    for name, position, energy in [('Key', (-4, -10, 14), 2600), ('Fill', (12, 6, 12), 1400)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location, light.data.energy, light.data.size = position, energy, 10
        town.aim(light, (0, -1, 0))
    world = bpy.data.worlds.new('TownWallsWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    scene.world = world
    scene.render.engine, scene.cycles.samples = 'CYCLES', 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1000, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(Path(previews) / 'town_walls-preview.png')
    if bpy.app.background:
        for other in list(bpy.data.scenes):
            if other != scene and not other.objects:
                bpy.data.scenes.remove(other)
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(blends) / 'town_walls.blend'))
    else:
        bpy.data.libraries.write(str(Path(blends) / 'town_walls.blend'), {scene}, fake_user=True)
    if render:
        bpy.ops.render.render(write_still=True)
    return [{'name': o.name, 'triangles': len(o.data.polygons)} for o in objects]


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    print(main(args[0] if args else None))
