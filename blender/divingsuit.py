"""The diving suit of Umbra's reef (src/game/dive.js, render/divesuit.js; docs/bosses.md "Umbra").

An old diving suit of brass and copper, steampunk: a round brass helmet with a big porthole in front,
a little one on each side and one on top, rivets round them, a valve and a hose; a copper corselet
over the shoulders, bolted, that the helmet sits on; a tank of two copper bottles on the back with
gauges and straps; heavy boots with brass toes and lead soles. Built like the armor (blender/armor.py,
with its helpers and items.Mesh), in the character's own space and rest pose (blender/character.py:
Z up, the face towards -Y), every part naming the bone it follows (`bone`): the helmet the head, the
corselet and the tank the spine, the boots their shins. The game puts each part on its bone by the
bone's rest frame (render/divesuit.js, like render/figure.js wears armor), and shows the whole of it
standing on its stand in the reef before anybody wears it.

The portholes' glass glows a little (the glow slot, in the reef's water's teal), so the hero's face
is lit from inside and the helmet reads in the dark water.

    Blender -b --python blender/divingsuit.py -- [assets/divingsuit.glb] [blender/previews/divingsuit-preview.png]
"""
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import armor as A
import items as I
import props as P

NAME = 'DivingSuit'
BRASS = '#c8963e'
BRASS_DARK = '#8a6428'
COPPER = '#b8683a'
COPPER_DARK = '#7a3f22'
LEAD = '#4a4d55'
GLASS = '#3fa8b8'
CANVAS = '#7a6a4e'
CANVAS_DARK = '#5a4c36'
GAUGE = '#e8e0c8'
GLOW = 3            # items.GLOW_SLOT: the portholes' glass, lit in m.glow
METAL = 1           # items.make_mesh: the metal surface

HELM_R = A.HEAD_R + .1                    # the helmet's ball
HELM = A.HEAD + Vector((0, 0, .03))       # its middle


def on_ball(phi, theta, r=HELM_R, at=HELM):
    """A point on the helmet's ball: phi round from the front (-Y, towards +X), theta down from the top."""
    d = Vector((math.sin(theta) * math.sin(phi), -math.sin(theta) * math.cos(phi), math.cos(theta)))
    return at + d * r, d


def frame_of(n):
    """Two axes across the normal n."""
    side = n.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    return side, side.cross(n).normalized()


def torus(m, c, n, radius, thickness, color, segs=18, section=6):
    """A ring of `thickness` round the axis n through c, `radius` out."""
    side, up = frame_of(n)
    rings = []
    for i in range(segs):
        a = math.tau * i / segs
        out = side * math.cos(a) + up * math.sin(a)
        rings.append([m.vert(c + out * (radius + thickness * math.cos(math.tau * j / section)) + n * (thickness * math.sin(math.tau * j / section)))
                      for j in range(section)])
    for i in range(segs):
        for j in range(section):
            k, l = (i + 1) % segs, (j + 1) % section
            m.face((rings[i][j], rings[k][j], rings[k][l], rings[i][l]), color)


def porthole(m, phi, theta, radius, depth=.05):
    """A round window in the helmet: a thick brass rim standing out of it, the glass set in, rivets round."""
    c, n = on_ball(phi, theta)
    m.slot = METAL
    torus(m, c + n * depth * .5, n, radius + .012, .03, BRASS)
    m.slot = GLOW
    m.lathe(c, [(-.01, radius + .01), (depth * .35, radius + .01), (depth * .35, 0)], GLASS, n=16, jitter=0, axis=tuple(n))
    side, up = frame_of(n)
    for k in range(6):
        a = math.tau * (k + .5) / 6
        at = c + n * (depth * .5) + (side * math.cos(a) + up * math.sin(a)) * (radius + .05)
        A.rivet(m, at, tuple(n), BRASS_DARK, .012, slot=METAL)
    m.slot = 0
    return c, n, side, up


def helmet(m, v=0):
    """The round brass helmet over the head."""
    # the ball, from its top round down to where it sits on the corselet
    grid = []
    for j in range(10):
        theta = math.radians(118 * j / 9)
        grid.append([on_ball(math.tau * i / 22, theta) for i in range(22)])
    A.sheet(m, grid, .03, lambda i, j: (BRASS if (i + 2 * j) % 7 else BRASS_DARK, METAL), closed=True)
    # the front porthole, big, with bars across it; one each side, one on top
    c, n, side, up = porthole(m, 0, math.radians(92), .13)
    m.slot = METAL
    for k in (-1, 1):
        a = c + n * .045 + side * (k * .05)
        m.tube([a + up * -.12, a + up * .12], .009, BRASS_DARK, n=5)
    porthole(m, math.radians(90), math.radians(95), .075)
    porthole(m, math.radians(-90), math.radians(95), .075)
    porthole(m, 0, math.radians(28), .06, .035)
    # the bolts round its foot, where it screws onto the corselet
    for k in range(10):
        p, d = on_ball(math.tau * k / 10, math.radians(112))
        A.rivet(m, p + d * .01, tuple(d), BRASS_DARK, .02, slot=METAL)
    # a valve on the side, its wheel, and the air coming in at the back
    p, d = on_ball(math.radians(125), math.radians(70))
    m.slot = METAL
    m.lathe(p, [(0, .04), (.06, .035), (.06, .015), (.09, .015)], COPPER, n=8, jitter=0, axis=tuple(d))
    m.ring(p + d * .1, .045, .01, BRASS_DARK, n=10, section=4, vertical=True, yaw=math.atan2(d.y, d.x))
    p, d = on_ball(math.radians(180), math.radians(80))
    m.lathe(p, [(0, .05), (.07, .045), (.07, .035)], COPPER_DARK, n=8, jitter=0, axis=tuple(d))
    m.slot = 0


def corselet(m, v=0):
    """The copper breastplate over the shoulders the helmet sits on, bolted round its rim."""
    rows = []
    for k, z in enumerate((1.22, 1.3, 1.38, 1.44)):
        off = .045 + .02 * k
        rows.append(A.torso_ring(z, off, n=24, bulge=.03 * (1 - k / 3)))
    A.sheet(m, rows, .03, lambda i, j: (COPPER if j < 2 else COPPER_DARK, METAL), closed=True)
    A.band(m, A.torso_ring(1.22, .1, n=24), .045, .03, BRASS, slot=METAL)
    for k in range(12):
        p, nrm = A.torso_ring(1.25, .115, n=12)[k]
        A.rivet(m, p, tuple(nrm), BRASS_DARK, .016, slot=METAL)
    # the collar the helmet screws onto
    m.slot = METAL
    m.lathe(A.HEAD + Vector((0, 0, -.33)), [(0, HELM_R * .8), (.04, HELM_R * .82), (.06, HELM_R * .74)], BRASS, n=22, jitter=0)
    m.slot = 0


def tank(m, v=0):
    """Two copper bottles on the back, a pipe between their necks, a gauge, straps over the shoulders."""
    back = A.TORSO_CORE[1] + A.TORSO_R + .1
    m.slot = METAL
    for s in (-1, 1):
        c = Vector((s * .1, back, .82))
        m.lathe(c, [(0, .02), (.02, .08), (.06, .09), (.46, .09), (.52, .07), (.56, .03), (.6, .03)], COPPER, n=12, jitter=0)
        for z in (.12, .4):
            m.ring(c + Vector((0, 0, z)), .092, .008, BRASS_DARK, n=12, section=3)
    m.tube([Vector((-.1, back, 1.42)), Vector((0, back + .02, 1.46)), Vector((.1, back, 1.42))], .018, BRASS, n=6)
    # the gauge on the left bottle's neck: a little dial
    g = Vector((-.1, back + .09, 1.32))
    m.lathe(g, [(0, .045), (.02, .045), (.02, .0)], BRASS, n=12, jitter=0, axis=(0, 1, 0))
    m.slot = 0
    m.lathe(g + Vector((0, .021, 0)), [(0, .036), (.003, .036), (.003, 0)], GAUGE, n=12, jitter=0, axis=(0, 1, 0))
    m.box(g + Vector((.012, .026, .008)), (.03, .004, .006), COPPER_DARK, tilt=.6)
    # the hose up to the helmet's back
    m.slot = METAL
    m.tube([Vector((.1, back, 1.44)), Vector((.12, back - .02, 1.56)), Vector((.08, back - .1, 1.66)), Vector((.03, .2, 1.68))],
           [.024, .026, .026, .024], CANVAS_DARK, n=6)
    m.slot = 0
    # the straps, over the shoulders
    for s in (-1, 1):
        pts = [Vector((s * .17, back - .05, 1.3)), Vector((s * .2, .05, 1.43)), Vector((s * .2, -.13, 1.36)), Vector((s * .17, -.17, 1.1))]
        m.tube(pts, .02, CANVAS, n=4)


def boot(m, side):
    """A heavy diving boot: canvas, a brass toe cap and a thick lead sole, laced over the shin."""
    A.boot_shell(m, side, [(.04, .04, 1.3), (.12, .035, .9), (.22, .028, 0), (.3, .03, 0)], lambda i, j: (CANVAS if j else CANVAS_DARK, 0))
    m.slot = METAL
    # the toe cap
    toe = Vector((side * A.LEG_X, -A.LIMB_R - .07, .06))
    m.lathe(toe, [(-.06, 0), (-.04, .07), (0, .085), (.05, .07), (.07, 0)], BRASS, n=10, jitter=0, axis=(0, -1, 0))
    m.slot = 0
    # the lead sole, thick
    sole = [p for p, _ in A.leg_ring(side, 0, A.LIMB_R + .07, 12, .1)]
    low = [m.vert(p - Vector((0, 0, .03))) for p in sole]
    high = [m.vert(p + Vector((0, 0, .025))) for p in sole]
    m.slot = METAL
    m.face(tuple(reversed(low)), LEAD)
    m.face(tuple(high), LEAD)
    for i in range(12):
        j = (i + 1) % 12
        m.face((low[i], low[j], high[j], high[i]), LEAD)
    A.band(m, A.leg_ring(side, .3, A.LIMB_R + .045), .05, .02, BRASS, slot=METAL)
    m.slot = 0


def build(collection):
    m = I.Mesh(20240916)
    m.glow = GLASS
    helmet(m)
    A.part(m, 'corselet', 'spine', corselet)
    A.part(m, 'tank', 'spine', tank)
    A.part(m, 'bootL', 'shin.L', lambda p: boot(p, 1))
    A.part(m, 'bootR', 'shin.R', lambda p: boot(p, -1))
    for _, p, *_ in m.parts:
        p.glow = GLASS
    obj = I.finish(m, NAME, {'attach': 'none', 'bone': 'head', 'kind': 'divingsuit'}, collection)
    return obj


def render_preview(obj, path):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x, scene.render.resolution_y = 900, 900
    world = bpy.data.worlds.new('DivingSuitWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .2, .24, 1)
    scene.world = world
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    scene.collection.objects.link(cam)
    cam.location = (1.9, -2.6, 1.6)
    target = Vector((0, 0, .95))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    scene.camera = cam
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main(export_path=None, preview=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.data.collections.new('DivingSuitAsset')
    bpy.context.scene.collection.children.link(collection)
    obj = build(collection)
    if export_path:
        P.export_gltf([obj], export_path, animations=True)
    if preview:
        Path(preview).parent.mkdir(parents=True, exist_ok=True)
        render_preview(obj, preview)
    tris = sum(len(o.data.polygons) for o in [obj, *obj.children])
    print('DivingSuit:', {'parts': [c.name for c in obj.children], 'triangles': tris})
    return obj


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / 'assets' / 'divingsuit.glb'),
         preview=args[1] if len(args) > 1 else str(root / 'previews' / 'divingsuit-preview.png'))
