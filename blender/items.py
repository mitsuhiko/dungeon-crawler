"""The Glass Bird loot / equipment library, built through Blender MCP.

Texture-free, flat-shaded, deterministic geometry; reuses props.Mesh and palette.
Weapons use character.py rig units and grip-centred pivots (runtime scale .55).
Loot/chests use game cells and ground pivots. All exported roots are at origin.
The treasure chest is the one animated asset: its lid is a child object on the
hinge with the Open and Close actions (glTF clips).

MCP: import items; items.main()
CLI: Blender -b --python blender/items.py -- [output-directory] [--only PREFIX]

--only PREFIX exports and renders only the items whose names start with it (armor_: the armor of
armor.py), and leaves the other GLBs and icons alone; the manifest and the overview are still
written for everything.

Default output: assets/items.glb + assets/items/ (glb, icons, manifest; the game draws
items from their models, the icons are for the kids' guide, learn/),
blender/items.blend, blender/previews/items-preview.png.
"""
import hashlib
import json
import math
from pathlib import Path
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import armor
import props
import town

COLLECTION = 'CubeCrawlerItems'
WOOD = '#82603b'
BARK = '#6e4420'
CUT = '#bc9865'
LEATHER = '#69442d'
STEEL = '#bdc8ca'
EDGE = '#dce1d9'
IRON = '#484852'
GOLD = '#b69558'
SILVER = '#bbc4c6'
COPPER = '#b87950'
CREAM = '#e4dcc0'
GEMS = [('#b94e61', '#ef9b9f'), ('#b7d9df', '#edf3e8'),
        ('#4d9b76', '#a5d5ac'), ('#537fac', '#a2c3dc'), ('#916aaa', '#c7a3d3')]
PARCHMENT = '#e3cd9b'
PARCHMENT_EDGE = '#c3a571'
INK = '#6b4a33'
VIOLET = '#5d3f80'
LILAC = '#c4a2e6'
RIM = '#9a72c4'
PORTAL = '#2b1d42'
GLEAM = '#f0e6f5'
# portal scroll sigils (pool, rim, swirl, heart, seal): the town portal's violet, the room portal's teal
SCROLL_INKS = [(PORTAL, RIM, LILAC, GLEAM, VIOLET), ('#123a37', '#3f9c8f', '#8fdcc9', '#e6f7f1', '#2f6e66')]
# Chest lid hinge (Blender, before the ground shift, which is 0 for the chest) and its clips:
# (frame, lid angle in degrees about +X, handle type); negative opens it backwards.
CHEST_HINGE = (0, .30, .445)
CHEST_FPS = 24
CHEST_CLIPS = {
    # unlatch with a little rattle, swing up past the rest angle, settle back onto it
    'Open': [(0, 0, 'AUTO_CLAMPED'), (3, -6, 'AUTO_CLAMPED'), (5, -2, 'AUTO_CLAMPED'),
             (15, -114, 'AUTO_CLAMPED'), (19, -103, 'AUTO_CLAMPED'), (23, -108, 'AUTO_CLAMPED')],
    # a small lift off the stop, an accelerating fall, a slam and a short bounce
    'Close': [(0, -108, 'AUTO_CLAMPED'), (4, -113, 'AUTO_CLAMPED'), (13, 0, 'VECTOR'),
              (15, -5, 'AUTO_CLAMPED'), (18, 0, 'AUTO_CLAMPED')],
}


# How each kind of weapon sits in the hand: the socket bone and the rotation (glTF space, x y z w)
# taking the weapon's own axes into the bone's (bone +Y runs down the forearm out of the fist,
# +Z is the knuckles: forward with the arm hanging, up with it held out in front). The game
# reads these from the GLB extras (render/character.js); loadout.py previews them.
#   sword:    the blade 60 degrees from the forearm
#   bow:      in the left fist, limbs up and the belly forward with the arm held out
#   crossbow: like a pistol, the stock along the forearm, its top over the knuckles
#   staff:    straight through the fist, upright with the forearm held level
#   trident:  along the forearm, 12 degrees up from it
#   flail:    its handle held like a sword's grip
MOUNTS = {
    'sword': ('hand.R', (math.sin(math.pi / 6), 0, 0, math.cos(math.pi / 6))),
    'flail': ('hand.R', (math.sin(math.pi / 6), 0, 0, math.cos(math.pi / 6))),
    'bow': ('hand.L', (-0.1934, 0.2476, 0.5894, 0.7443)),
    'crossbow': ('hand.R', (-0.3083, 0.3874, -0.3157, 0.8095)),
    'staff': ('hand.R', (-0.0989, -0.6061, -0.7408, 0.2723)),
    # the trident along the forearm out of the fist, tipped up a little towards the knuckles (so its
    # butt passes under the elbow): the arm aims it (character.py HoldTrident, Thrust)
    'trident': ('hand.R', (math.sin(math.radians(6)), 0, 0, math.cos(math.radians(6)))),
}
# the player's attack clip for each kind (character.py)
CLIPS = {'sword': 'Slash', 'flail': 'Slash', 'bow': 'Shoot', 'crossbow': 'CrossbowShot', 'staff': 'Cast', 'trident': 'Thrust',
         'throw': 'Throw'}

# Things a character wears or carries (category 'wearable' / 'held'): name: (socket bone,
# rotation (glTF x y z w) and offset (rig units) in the socket bone's head frame, the arm's
# hold pose (character.py CARRIES; the game lays its Hold<Name> clip over the others)).
# Headwear is modelled around the head's centre (figure.HEAD_Z; Blender Z up, the face towards
# -Y), so it sits upright above the head bone's root; held items are modelled around the fist.
# The rotations and offsets come from blender/loadout.py --mounts (AIMS there).
WEARS = {
    'wear_headscarf': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_welding_mask': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_wizard_hat': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_hood': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_miner_helmet': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_explorer_hat': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'wear_straw_hat': ('head', (0.0, 0.0, 0.0, 1.0), (0.0, 0.26, 0.0), None),
    'held_towel': ('hand.L', (0.6848, -0.1319, 0.1281, 0.7052), (0.0, -0.11, 0.0), 'towel'),
    'held_crystal_ball': ('hand.R', (-0.0873, -0.7346, -0.6202, 0.2609), (0.1537, 0.0733, 0.2943), 'orb'),
    'held_rope': ('hand.R', (-0.4136, -0.3007, -0.8559, 0.0775), (0.0, 0.0, 0.0), 'rope'),
    'held_hammer': ('hand.R', (0.5313, 0.5908, 0.4854, 0.3648), (0.0, 0.0, 0.0), 'hammer'),
    'held_pliers': ('hand.L', (-0.0316, 0.6471, 0.7473, 0.1478), (0.0, 0.0, 0.0), 'pliers'),
    'held_feed_bag': ('hand.L', (-0.0821, 0.5792, 0.7958, 0.1564), (0.0, 0.0, 0.0), 'feed'),
}
# where in the outfit each socket is (core/items.js `slot`)
SLOTS = {'head': 'head', 'hand.R': 'right', 'hand.L': 'left'}
# how high over the fist (rig units) the crystal ball floats; the game bobs it about there
BALL_FLOAT = .34


def flask_mount():
    """A throwing flask in the fist: upright like a staff in its hold (the same pose), held by
    the neck (FLASK_GRIP) at FLASK_SCALE. (rotation, offset) in the socket bone's frame."""
    x, y, z, w = MOUNTS['staff'][1]
    q = Quaternion((w, x, y, z))
    return q, -(q @ Vector((0, FLASK_GRIP * FLASK_SCALE, 0)))


def mount_matrix(kind):
    """The weapon's own (Blender) space in its socket bone's head frame, from MOUNTS (or a worn
    or held item's, from WEARS, by its name; 'throw': a flask's)."""
    to_gltf = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
    if kind == 'throw':
        q, offset = flask_mount()
        return Matrix.Translation(offset) @ (q.to_matrix() @ to_gltf).to_4x4() @ Matrix.Scale(FLASK_SCALE, 4)
    if kind in WEARS:
        _, (x, y, z, w), offset, _ = WEARS[kind]
    else:
        (x, y, z, w), offset = MOUNTS[kind][1], (0, 0, 0)
    return Matrix.Translation(offset) @ (Quaternion((w, x, y, z)).to_matrix() @ to_gltf).to_4x4()


def gltf(p):
    """A Blender point in glTF (Y up) space, rounded."""
    return [round(p[0], 4), round(p[2], 4), round(-p[1], 4) + 0.0]


class Mesh(props.Mesh):
    def __init__(self, seed):
        super().__init__(random.Random(seed))
        self.slots = []
        self.slot = 0
        # moving parts: [(name suffix, Mesh, pivot)], child objects pivoting at `pivot`
        self.parts = []

    def face(self, ids, color, glow=False, shade=1):
        # (the glow is kept for the quest things made from props, quest_prop; the other items
        # leave it alone)
        super().face(ids, color, glow, shade)
        self.slots.append(self.slot)


def surface(name, roughness, metallic):
    mat = props.material(name)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def remove_item(name):
    old = bpy.data.objects.get(name)
    if not old:
        return
    if not old.get('cube_crawler_item') and not old.get('cube_crawler_part'):
        raise ValueError(f'Refusing to replace unrelated object: {name}')
    for child in list(old.children):
        remove_item(child.name)
    data = old.data
    bpy.data.objects.remove(old, do_unlink=True)
    if data.users == 0:
        bpy.data.meshes.remove(data)


def make_mesh(m, name):
    triangles, colors, slots = [], [], []
    for face, color, slot in zip(m.faces, m.colors, m.slots):
        for i in range(1, len(face) - 1):
            tri = (face[0], face[i], face[i + 1])
            a, b, c = (Vector(m.vertices[j]) for j in tri)
            if (b - a).cross(c - a).length > 1e-10:
                triangles.append(tri)
                colors.append(color)
                slots.append(slot)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(m.vertices, [], triangles)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    for mat in (surface('Items_Clay', .88, 0), surface('Items_Metal', .56, .2),
                surface('Items_Facets', .38, .05)):
        mesh.materials.append(mat)
    if GLOW_SLOT in slots or armor.TRIM_SLOT in slots:   # a quest thing's glowing parts (quest_prop), lit in the prop's colour
        mesh.materials.append(props.material(name + '_glow', glow=getattr(m, 'glow', None) or '#ffffff', strength=1.5))
    if armor.TRIM_SLOT in slots:   # armor's trim (armor.py): the game tints it by rarity
        mesh.materials.append(surface('Items_Trim', .42, .45))
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    mesh.color_attributes.active_color = attr
    for poly, color, slot in zip(mesh.polygons, colors, slots):
        poly.material_index = slot
        poly.use_smooth = False
        for loop in poly.loop_indices:
            attr.data[loop].color = color
    return mesh


def finish(m, name, info, collection):
    dz = 0
    if info['attach'] == 'ground':
        dz = -min(v[2] for part in [m] + [p[1] for p in m.parts] for v in part.vertices)
        m.vertices = [(x, y, z + dz) for x, y, z in m.vertices]
    remove_item(name)
    obj = bpy.data.objects.new(name, make_mesh(m, name))
    collection.objects.link(obj)
    obj['cube_crawler_item'] = True
    for key, value in info.items():
        obj[key] = value
    for suffix, part, pivot, *extras in m.parts:
        # vertices relative to the pivot, so the part rotates about it
        part.vertices = [(x - pivot[0], y - pivot[1], z - pivot[2]) for x, y, z in part.vertices]
        child = bpy.data.objects.new(f'{name}_{suffix}', make_mesh(part, f'{name}_{suffix}'))
        collection.objects.link(child)
        child['cube_crawler_part'] = True
        for key, value in (extras[0] if extras else {}).items():   # (armor: the bone it follows)
            child[key] = value
        child.parent = obj
        child.location = (pivot[0], pivot[1], pivot[2] + dz)
    return obj


def part_vertices(obj):
    """The asset's vertices in root space at rest, moving parts included."""
    out = [v.co.copy() for v in obj.data.vertices]
    for child in obj.children:
        out += [child.location + v.co for v in child.data.vertices]
    return out


def lid_clips(lid):
    """The chest's Open and Close actions on the lid, owned by muted NLA tracks for export."""
    lid.animation_data_create()
    for track in list(lid.animation_data.nla_tracks):
        lid.animation_data.nla_tracks.remove(track)
    for name, keys in CHEST_CLIPS.items():
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        act = bpy.data.actions.new(name)
        lid.animation_data.action = act
        for frame, angle, _ in keys:
            lid.rotation_euler = (math.radians(angle), 0, 0)
            lid.keyframe_insert('rotation_euler', frame=frame)
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for point, (_, _, handle) in zip(curve.keyframe_points, keys):
                            point.handle_left_type = point.handle_right_type = handle
                        curve.update()
        act.use_frame_range = True
        act.frame_start, act.frame_end = 0, keys[-1][0]
        act['fps'] = CHEST_FPS
        act['duration'] = keys[-1][0] / CHEST_FPS
        track = lid.animation_data.nla_tracks.new()
        track.name, track.mute = name, True
        strip = track.strips.new(name, 0, act)
        strip.action_slot = act.slots[0]
        strip.extrapolation = 'NOTHING'
    lid.animation_data.action = None
    lid.rotation_euler = (0, 0, 0)


def stick(m, v):
    paths = [[(-.25, 0, .047), (-.06, -.012, .055), (.13, .015, .06), (.29, .005, .078)],
             [(-.3, .035, .047), (-.07, 0, .06), (.14, -.02, .08), (.35, .02, .11)],
             [(-.38, -.015, .045), (-.11, .02, .055), (.15, .0, .075), (.41, .02, .12)]]
    points = paths[v]
    m.tube(points, [.035, .047, .037, .024], BARK, n=7)
    if v:
        fork = points[2]
        branch_length = .21 if v == 1 else .12
        m.tube([fork, (fork[0] + .015, branch_length * .57, .08),
                (fork[0] + .07, branch_length, .10)], [.025, .019, .008], BARK, n=6)
    for p, direction, radius in [(points[0], Vector(points[0]) - Vector(points[1]), .028),
                                  (points[-1], Vector(points[-1]) - Vector(points[-2]), .02)]:
        m.lathe(p, [(0, radius), (.003, radius)], CUT, n=7, jitter=0, axis=direction)
    # Bark ridges and a pale chipped patch, rather than texture detail.
    m.tube([(-.12, -.026, .084), (.015, -.022, .092), (.13, -.009, .10)], .007, WOOD, n=4)
    m.box((-.06, .009, .105), (.065, .02, .006), CUT, tilt=.12)


def coin(m, v, detail=True):
    color = [GOLD, SILVER, COPPER][v]
    dark = ['#8e703b', '#879598', '#875138'][v]
    m.slot = 1
    m.lathe((0, 0, 0), [(0, .119), (.009, .14), (.025, .14), (.034, .119)],
            color, n=12, jitter=0, colors=[color, dark, color])
    if detail:
        for z in (.033, .001):
            m.ring((0, 0, z), .106, .008, color, n=12, section=4)
    # Raised diamond mint stamp on BOTH faces, legible from above.
    for z in (.04, -.006):
        m.box((0, 0, z), (.09, .09, .012), color, tilt=math.pi / 4)
        m.box((0, 0, z + (.007 if z > 0 else -.007)), (.027, .027, .006), dark, tilt=math.pi / 4)
    if detail:
        for i in range(12):
            a = math.tau * i / 12
            m.box((.14 * math.cos(a), .14 * math.sin(a), .017), (.009, .018, .012), color, tilt=a)


def gem(m, v, center=(0, 0, 0), scale=1):
    """Five silhouettes: ruby cabochon, diamond, emerald step cut, two prisms."""
    start = len(m.vertices)
    color, light = GEMS[v]
    m.slot = 2
    if v == 0:
        m.lathe((0, 0, 0), [(0, .065), (.05, .15), (.12, .145), (.21, .085), (.245, .045)],
                color, n=6, jitter=0, colors=[color, color, light, color], phase=math.pi / 6)
    elif v == 1:
        m.lathe((0, 0, 0), [(0, 0), (.135, .16), (.15, .16), (.235, .09)],
                color, n=8, jitter=0, colors=[color, light, color], phase=math.pi / 8)
    elif v == 2:
        ring_ids = []
        outline = [(-1, -.55), (-.7, -.85), (.7, -.85), (1, -.55),
                   (1, .55), (.7, .85), (-.7, .85), (-1, .55)]
        for z, r in [(0, .065), (.055, .125), (.135, .125), (.19, .087)]:
            ring_ids.append([m.vert((x * r, y * r * 1.4, z)) for x, y in outline])
        m.face(tuple(reversed(ring_ids[0])), color)
        for k, (a, b) in enumerate(zip(ring_ids, ring_ids[1:])):
            for i in range(8):
                j = (i + 1) % 8
                m.face((a[i], a[j], b[j], b[i]), light if i % 3 == 0 and k == 2 else color)
        m.face(ring_ids[-1], light)
    else:
        m.lathe((0, 0, 0), [(0, .085), (.07, .125), (.23 if v == 3 else .31, .105),
                              (.34 if v == 3 else .43, 0)], color, n=5 if v == 3 else 6,
                jitter=0, colors=[color, color, light], phase=.3)
    for i in range(start, len(m.vertices)):
        p = m.vertices[i]
        m.vertices[i] = tuple(center[k] + p[k] * scale for k in range(3))
    m.slot = 0


def grip(m, length=.28, radius=.04, color=LEATHER):
    m.slot = 0
    m.lathe((0, 0, 0), [(-length / 2, radius * .8), (-length / 2 + .025, radius),
                         (length / 2 - .025, radius), (length / 2, radius * .8)], color, n=8, jitter=0)
    for i in range(5):
        z = -length / 2 + .035 + i * (length - .07) / 4
        m.lathe((0, 0, 0), [(z, radius * 1.07), (z + .012, radius * 1.07)], '#80563b', n=8, jitter=0)


def sword(m, v):
    # Short, arming, longsword, broad cleaver, two-handed greatsword.
    tip, width, handle = [(.64, .068, .25), (.9, .085, .28), (1.2, .073, .34),
                          (.92, .145, .28), (1.47, .12, .45)][v]
    grip(m, handle)
    guard_z = handle / 2 + .035
    m.slot = 1
    m.lathe((0, 0, -handle / 2 - .03), [(-.03, .026), (-.012, .062), (.019, .055), (.033, .032)],
            GOLD if v != 4 else IRON, n=8, jitter=0)
    reach = [.15, .19, .22, .23, .29][v]
    if v == 3:
        # Small swept brass quillons and a heavy blade with clipped shoulders.
        m.tube([(-reach, 0, guard_z + .04), (-reach * .6, 0, guard_z),
                (reach * .6, 0, guard_z), (reach, 0, guard_z + .04)], .031, GOLD, n=6)
    else:
        m.tube([(-reach, 0, guard_z - .02), (-reach * .7, 0, guard_z + .006),
                (reach * .7, 0, guard_z + .006), (reach, 0, guard_z - .02)],
               [.022, .035, .035, .022], IRON if v == 4 else GOLD, n=6)
    rings = []
    sections = [(guard_z + .016, width * .72, .017), (guard_z + .1, width, .029),
                (tip - .23, width * (.92 if v == 3 else .76), .026),
                (tip - .10, width * (.8 if v == 3 else .44), .017)]
    for z, w, t in sections:
        rings.append([m.vert(p) for p in [(w, 0, z), (0, -t, z), (-w, 0, z), (0, t, z)]])
    m.face(tuple(reversed(rings[0])), STEEL)
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            m.face((a[i], a[j], b[j], b[i]), STEEL if i % 2 else EDGE)
    tip_id = m.vert((width * .25 if v == 3 else 0, 0, tip))
    for i in range(4):
        m.face((rings[-1][i], rings[-1][(i + 1) % 4], tip_id), STEEL if i % 2 else EDGE)
    # Shallow, geometric fuller on the long and two-handed blades.
    if v in (2, 4):
        for y in (-.031, .031):
            m.box((0, y, (guard_z + .15 + tip - .24) / 2),
                  (.022, .004, tip - .24 - guard_z - .15), '#839699')
    m.slot = 0


# Bows: (name, half length, bend back towards the archer, recurve of the tips, limb radius at
# the grip / the tips, wood, stripe down the back, grip wrap, tip caps)
BOWS = [
    ('short', .50, .11, 0, (.030, .014), '#9a7046', None, LEATHER, None),
    ('hunting', .62, .14, .02, (.033, .016), BARK, CUT, '#4f6b3a', CREAM),
    ('recurve', .68, .17, .07, (.036, .017), WOOD, CUT, LEATHER, GOLD),
    ('long', .88, .17, 0, (.036, .016), '#c4955a', '#8a5a2e', LEATHER, CREAM),
    ('war', .76, .20, .09, (.040, .018), '#4a3c36', '#2f2a2a', '#8c3b32', IRON),
]
STRING = '#efe6c8'


def bow_limb(v):
    """Upper limb points from the grip to the tip (lower: mirrored), radii and tip."""
    _, length, bend, recurve, (r0, r1), *_ = BOWS[v]
    points, radii = [], []
    for i in range(9):
        t = i / 8
        flip = max(0, (t - .62) / .38) ** 2
        points.append((-bend * t ** 1.8 + recurve * flip * 1.6, 0, length * t))
        radii.append(r0 + (r1 - r0) * t ** .8)
    return points, radii


def bow_tips(v):
    """(top tip, nock) in Blender space: the string runs tip - nock - mirrored tip."""
    tip = bow_limb(v)[0][-1]
    return tip, (tip[0], 0, 0)


def bow(m, v=0):
    # In XZ; +X is forward (away from the archer), the grip exactly at the origin, the limbs
    # bend back towards the archer and the string runs straight behind the grip. The string is
    # its own part (`string`), so the game can hide it and draw it pulled.
    name, length, bend, recurve, _, wood, stripe, wrap, tip_color = BOWS[v]
    half, radii = bow_limb(v)
    points = [(x, y, -z) for x, y, z in reversed(half[1:])] + half
    m.tube(points, list(reversed(radii[1:])) + radii, wood, n=6)
    if stripe:
        m.tube([(x + r * .75, y, z) for (x, y, z), r in zip(points, list(reversed(radii[1:])) + radii)][2:-2],
               .008 + radii[0] * .15, stripe, n=4)
    grip(m, .24 if v != 3 else .28, radii[0] + .012, wrap if v != 1 else LEATHER)
    if v == 1:
        # hunter's cloth tied above the grip, two loose ends and a pair of feathers
        m.lathe((0, 0, .14), [(0, radii[0] + .018), (.035, radii[0] + .018)], wrap, n=6, jitter=0)
        m.tube([(.03, .02, .15), (.06, .05, .08), (.07, .06, .0)], [.012, .01, .006], wrap, n=4)
        m.leaf((.02, .03, .13), (.11, .08, .03), .022, CREAM)
        m.leaf((.02, -.01, .13), (.09, .03, .0), .02, '#a35a3a')
    tip = half[-1]
    if tip_color:
        m.slot = 1 if tip_color in (GOLD, IRON) else 0
        for s in (-1, 1):
            a, b = Vector(half[-2]), Vector(tip)
            d = (b - a).normalized()
            d.z *= s
            end = (tip[0], 0, s * tip[2])
            if v == 4:   # iron-shod, spiked tips
                m.lathe(end, [(-.05, radii[-1] * 1.5), (0, radii[-1] * 1.6), (.06, 0)], tip_color, n=5, jitter=0, axis=d)
            else:
                m.lathe(end, [(-.03, radii[-1] * 1.45), (.015, radii[-1] * 1.35), (.03, radii[-1] * .6)],
                        tip_color, n=6, jitter=0, axis=d)
        m.slot = 0
    if v == 4:
        # iron bands up the limbs and a red tassel
        m.slot = 1
        for k in (3, 5):
            for s in (-1, 1):
                a, b = Vector(half[k - 1]), Vector(half[k + 1])
                d = (b - a).normalized()
                d.z *= s
                c = (half[k][0], 0, s * half[k][2])
                m.lathe(c, [(-.012, radii[k] * 1.25), (.012, radii[k] * 1.25)], IRON, n=6, jitter=0, axis=d)
        m.slot = 0
        m.tube([(.0, .0, -.15), (.03, .03, -.24), (.02, .05, -.33)], [.014, .012, .006], wrap, n=4)
    if v == 2:
        m.slot = 1
        for s in (-1, 1):
            m.lathe((0, 0, s * .135), [(-.008, radii[0] + .016), (.008, radii[0] + .016)], GOLD, n=8, jitter=0)
        m.slot = 0
    string = Mesh(m.rng.randrange(1 << 30))
    string.tube([tip, (tip[0], 0, 0), (tip[0], 0, -tip[2])], .0065, STRING, n=4)
    m.parts.append(('string', string, (0, 0, 0)))


def arrow(m, v=0):
    # Nock pivot; +Z runs towards arrowhead. Not a hand-grip pivot.
    m.lathe((0, 0, 0), [(0, .012), (.70, .012)], CUT, n=6, jitter=0)
    m.slot = 1
    m.lathe((0, 0, 0), [(.67, .021), (.72, .021)], IRON, n=6, jitter=0)
    m.leaf((0, 0, .70), (0, 0, .86), .048, STEEL)
    m.slot = 0
    for angle in (0, math.tau / 3, 2 * math.tau / 3):
        start = len(m.vertices)
        m.leaf((.013, 0, .045), (.022, 0, .22), .038, CREAM)
        for i in range(start, len(m.vertices)):
            x, y, z = m.vertices[i]
            m.vertices[i] = (x * math.cos(angle) - y * math.sin(angle),
                             x * math.sin(angle) + y * math.cos(angle), z)
    m.tube([(-.014, 0, 0), (-.014, 0, .026)], .009, LEATHER, n=4)
    m.tube([(.014, 0, 0), (.014, 0, .026)], .009, LEATHER, n=4)


def bolt(m, v=0):
    # Crossbow bolt: nock pivot, +Z runs towards the head; short, thick, two stiff vanes.
    m.lathe((0, 0, 0), [(0, .015), (.44, .015)], WOOD, n=6, jitter=0)
    m.slot = 1
    m.lathe((0, 0, 0), [(.42, .022), (.47, .024), (.56, 0)], IRON, n=4, jitter=0, phase=math.pi / 4)
    m.slot = 0
    for angle in (0, math.pi):
        start = len(m.vertices)
        m.box((.03, 0, .1), (.04, .006, .14), LEATHER)
        for i in range(start, len(m.vertices)):
            x, y, z = m.vertices[i]
            m.vertices[i] = (x * math.cos(angle) - y * math.sin(angle), x * math.sin(angle) + y * math.cos(angle), z)
    m.lathe((0, 0, 0), [(0, .018), (.025, .018)], CUT, n=6, jitter=0)


# Crossbows: forward is +Z, the top (where the bolt lies) is -Y, the prod spans X. The fist holds
# the pistol grip at the origin; the stock runs above it. (name, stock behind / in front of the
# grip, prod half width, prod sweep, prod colour, stock colour)
CROSSBOWS = [
    ('hand', .14, .30, .21, .05, WOOD, '#9a7046'),
    ('light', .30, .40, .29, .07, WOOD, WOOD),
    ('repeating', .26, .44, .26, .06, BARK, '#7a5634'),
    ('heavy', .36, .50, .34, .09, IRON, BARK),
    ('arbalest', .44, .58, .40, .11, STEEL, '#5b4030'),
]
STOCK_Y = -.165   # the stock's centre line, above the fist
LATCH_Z = -.02    # the nut holding the drawn string, above the grip


def crossbow_string(v):
    """(tip, rest, latch) in Blender space; the other tip mirrors x."""
    _, back, front, width, sweep, *_ = CROSSBOWS[v]
    y = STOCK_Y - .045
    tip = (width, y, front - .05 - sweep)
    return tip, (0, y, front - .05 - sweep * .35), (0, y, LATCH_Z)


def crossbow(m, v=0):
    name, back, front, width, sweep, prod, stock = CROSSBOWS[v]
    y = STOCK_Y
    # stock: a long tiller with a deeper butt at the back
    m.box((0, y, (front - back) / 2), (.065, .075, front + back), stock)
    m.box((0, y - .04, (front - .05 + LATCH_Z) / 2 + .02), (.022, .008, front - .05 - LATCH_Z), '#5d4128')   # groove
    if back > .2:
        m.box((0, y + .03, -back + .1), (.075, .13, .2), stock)
    # pistol grip through the fist and a long iron trigger lever under the stock
    m.tube([(0, .07, -.03), (0, 0, 0), (0, y + .03, .02)], [.038, .042, .04], LEATHER, n=6)
    m.slot = 1
    m.tube([(0, y + .04, -.06), (0, y + .1, -.13), (0, y + .13, -.2)], [.012, .011, .009], IRON, n=4)
    m.box((0, y - .03, LATCH_Z), (.05, .035, .04), IRON)   # the nut
    m.slot = 0
    # prod, swept back at its tips, lashed to the front of the stock
    zf = front - .05
    tip, rest, latch = crossbow_string(v)
    m.slot = 1 if prod in (IRON, STEEL) else 0
    m.tube([(-width, y, zf - sweep), (-width * .6, y, zf - sweep * .25), (0, y, zf),
            (width * .6, y, zf - sweep * .25), (width, y, zf - sweep)],
           [.016, .024, .03, .024, .016], prod, n=6)
    m.slot = 0
    m.box((0, y, zf), (.085, .09, .06), LEATHER)
    if v >= 3:   # stirrup at the front to brace it with a foot
        m.slot = 1
        m.ring((0, y + .02, front + .07), .06, .012, IRON, n=8, section=4, vertical=True)
        m.slot = 0
    if v == 2:   # the bolt magazine and its cocking lever on top
        m.box((0, y - .11, .16), (.07, .13, .3), '#5d4128')
        m.box((0, y - .18, .16), (.08, .02, .32), stock)
        m.slot = 1
        m.tube([(.05, y - .05, -.12), (.06, y - .16, .02), (.05, y - .19, .3)], .011, IRON, n=4)
        m.slot = 0
    if v == 4:   # windlass at the butt
        m.slot = 1
        m.lathe((-.07, y, -back + .07), [(0, .03), (.14, .03)], IRON, n=6, jitter=0, axis=(1, 0, 0))
        for s in (-1, 1):
            m.tube([(s * .08, y, -back + .07), (s * .09, y + .08, -back + .02), (s * .1, y + .1, -back - .02)], .01, IRON, n=4)
        m.slot = 0
    if v == 0:   # brass furniture on the little one
        m.slot = 1
        m.box((0, y + .01, -back + .01), (.07, .085, .02), GOLD)
        m.slot = 0
    # the string (drawn, as found) and the loaded bolt are their own parts
    string = Mesh(m.rng.randrange(1 << 30))
    string.tube([tip, latch, (-tip[0], tip[1], tip[2])], .007, STRING, n=4)
    m.parts.append(('string', string, (0, 0, 0)))
    loaded = Mesh(m.rng.randrange(1 << 30))
    bolt(loaded)
    loaded.vertices = [(x, y + STOCK_Y - .053, z + LATCH_Z + .005) for x, y, z in loaded.vertices]
    m.parts.append(('bolt', loaded, (0, 0, 0)))


# Staffs: along +Z, the grip at the origin, the foot near the floor when held upright at the hip.
# (name, gem colour index or None, the colour its spell glows in)
STAFFS = [('gnarled', 2), ('oak', 3), ('ember', 0), ('crystal', 1), ('arcane', 4)]


def staff_head(v):
    """Where the spell leaves the staff (Blender space)."""
    return [(0, 0, 1.12), (0, 0, 1.24), (0, 0, 1.3), (0, 0, 1.32), (.012, 0, 1.2)][v]


def staff(m, v=0):
    if v == 0:
        # a crooked branch with a curled knot holding a little green stone
        m.tube([(0, 0, -.92), (.03, 0, -.5), (-.02, .01, -.1), (.02, 0, .3), (-.01, -.01, .7),
                (.04, 0, .98), (.12, 0, 1.08), (.13, 0, 1.18), (.06, 0, 1.22)],
               [.035, .038, .04, .041, .044, .05, .045, .036, .024], BARK, n=7)
        m.tube([(-.01, .01, .6), (-.09, .02, .74), (-.12, .01, .85)], [.022, .016, .008], BARK, n=5)
        grip(m, .3, .048)
        gem(m, 2, (.05, 0, 1.08), .3)
        m.ring((.02, 0, .94), .052, .01, CUT, n=7, section=3)
    elif v == 1:
        # straight oak, brass bands, three prongs cupping a blue orb
        m.tube([(0, 0, -.92), (0, 0, 0), (0, 0, 1.05)], [.038, .042, .046], WOOD, n=8)
        grip(m, .34, .05)
        m.slot = 1
        for z in (-.88, -.3, .3, .98):
            m.lathe((0, 0, z), [(0, .052), (.04, .052)], GOLD, n=8, jitter=0)
        for i in range(3):
            a = math.tau * i / 3
            c, s = math.cos(a), math.sin(a)
            m.tube([(0, 0, 1.0), (c * .1, s * .1, 1.14), (c * .09, s * .09, 1.3), (c * .04, s * .04, 1.36)],
                   [.018, .016, .013, .007], GOLD, n=5)
        m.slot = 2
        m.lathe((0, 0, 1.11), [(0, 0), (.03, .07), (.13, .09), (.23, .06), (.26, 0)], GEMS[3][0], n=8, jitter=0,
                colors=[GEMS[3][0], GEMS[3][1], GEMS[3][0]])
        m.slot = 0
    elif v == 2:
        # dark wood in iron, a ruby flame cupped by brass tongues
        m.tube([(0, 0, -.92), (.015, 0, -.4), (0, 0, 0), (-.015, 0, .5), (0, 0, 1.06)],
               [.037, .04, .043, .045, .05], '#4a3428', n=7)
        grip(m, .34, .05, '#6b2f2a')
        m.slot = 1
        for z in (-.9, .62, 1.0):
            m.lathe((0, 0, z), [(0, .058), (.05, .058)], IRON, n=7, jitter=0)
        for i in range(5):
            a = math.tau * i / 5
            m.leaf((math.cos(a) * .04, math.sin(a) * .04, 1.04), (math.cos(a) * .12, math.sin(a) * .12, 1.3), .035, GOLD)
        m.slot = 2
        m.lathe((0, 0, 1.06), [(0, .03), (.08, .075), (.18, .06), (.34, 0)], GEMS[0][0], n=6, jitter=0,
                colors=[GEMS[0][0], GEMS[0][1], GEMS[0][0]])
        m.slot = 0
    elif v == 3:
        # pale birch bound in silver, crowned with a cluster of clear shards
        m.tube([(0, 0, -.92), (0, 0, 0), (.01, 0, .6), (0, 0, 1.08)], [.036, .04, .042, .05], '#d8cfb8', n=8)
        m.tube([(.03, -.02, -.5), (.035, -.025, .1), (.03, -.02, .7)], .006, '#9c927b', n=4)   # bark streak
        grip(m, .34, .05, '#5a6a82')
        m.slot = 1
        for z in (-.88, .34, 1.02):
            m.lathe((0, 0, z), [(0, .053), (.045, .053)], SILVER, n=8, jitter=0)
        m.slot = 2
        m.shard((0, 0, 1.04), .07, .34, GEMS[1][0])
        for i in range(4):
            a = math.tau * i / 4 + .4
            m.shard((math.cos(a) * .06, math.sin(a) * .06, 1.03), .035, .16 + .03 * (i % 2), GEMS[1][1])
        m.slot = 0
    else:
        # the forked staff: brass collars and an amethyst held in a ring
        m.tube([(0, 0, -.92), (-.023, 0, -.35), (0, 0, 0), (.025, 0, .55), (.02, 0, 1.08)],
               [.043, .039, .042, .045, .06], BARK, n=8)
        grip(m, .38, .05)
        m.slot = 1
        for z in (-.88, -.24, .24, .94):
            m.lathe((0, 0, z), [(0, .055), (.045, .055)], GOLD, n=8, jitter=0)
        m.slot = 0
        for side in (-1, 1):
            m.tube([(.02, 0, 1.0), (side * .14, 0, 1.12), (side * .17, 0, 1.33),
                    (side * .12, 0, 1.50)], [.059, .047, .035, .013], WOOD, n=6)
        gem(m, 4, (.012, 0, 1.08), .86)
        m.slot = 1
        m.ring((.01, 0, 1.12), .10, .015, GOLD, n=8, section=4)
        m.slot = 0
        m.tube([(-.02, .04, .91), (-.18, .025, .78), (-.20, .02, .63)], .012, LEATHER, n=5)
        gem(m, 3, (-.20, .02, .56), .22)


# The lightning staffs: the staff itself a bolt of lightning, broad and squared off at the top
# where the lightning leaves, zigzagging down to a point at the bottom, straight where the fist
# holds it (round the origin, wrapped in a grip), a stone set in its head. Held and cast like the
# other staffs (MOUNTS['staff']). (name, bolt metal, its edge, the stone (colour, light), the
# inlay down its middle (or None))
BOLT_STAFFS = [
    ('spark', COPPER, '#d79a6a', ('#e8b440', '#ffe08a'), None),
    ('lightning', '#d2b062', '#efd894', ('#8fc4ec', '#e2f2ff'), '#bfe3ff'),
    ('thunder', '#45424f', '#6a6578', ('#916aaa', '#d7b8f0'), '#b98cff'),
]
# the bolt's middle line (x, z) from its point at the bottom to its head, and how broad it is there
BOLT_LINE = [(.05, -.92), (-.035, -.62), (.09, -.55), (0, -.3), (0, -.18), (0, 0), (0, .18), (0, .3),
             (-.12, .6), (.06, .66), (-.05, .97), (.1, 1.03), (.02, 1.2)]
BOLT_WIDTH = [.006, .045, .05, .045, .03, .03, .03, .06, .085, .095, .105, .115, .15]
BOLT_HEAD = (.02, 0, 1.28)   # where the lightning leaves (Blender space)


def bolt_outline(scale=1.0):
    """The bolt's two edges, [(left, right)] at each point of BOLT_LINE: out from the line at right
    angles (mitred where it bends, but not too far)."""
    pts = [Vector((x, 0, z)) for x, z in BOLT_LINE]
    out = []
    for i, p in enumerate(pts):
        a = (p - pts[i - 1]).normalized() if i else None
        b = (pts[i + 1] - p).normalized() if i + 1 < len(pts) else None
        first = a if a is not None else b
        d = (a + b).normalized() if a is not None and b is not None and (a + b).length > 1e-6 else first
        n = Vector((-d.z, 0, d.x))
        k = 1 / max(.45, n.dot(Vector((-first.z, 0, first.x))))
        w = BOLT_WIDTH[i] * scale * min(k, 1.8)
        out.append((p - n * w, p + n * w))
    return out


def bolt_staff(m, v=0):
    name, metal, edge, (stone, light), inlay = BOLT_STAFFS[v]
    t = .05 + .006 * v
    edges = bolt_outline()
    m.slot = 1
    rings = [[m.vert(l + Vector((0, -t / 2, 0))), m.vert(r + Vector((0, -t / 2, 0))),
              m.vert(r + Vector((0, t / 2, 0))), m.vert(l + Vector((0, t / 2, 0)))] for l, r in edges]
    for i, (a, b) in enumerate(zip(rings, rings[1:])):
        for k in range(4):
            j = (k + 1) % 4
            m.face((a[k], a[j], b[j], b[k]), metal if k % 2 == 0 else edge)
    m.face(tuple(reversed(rings[0])), edge)
    m.face(rings[-1], edge)
    if inlay:   # a glowing line down the middle of both faces
        m.slot = 2
        for side in (-1, 1):
            pts = [Vector((x, side * (t / 2 + .004), z)) for x, z in BOLT_LINE[1:-1]]
            m.tube(pts, .009, inlay, n=4)
    m.slot = 0
    grip(m, .34, .05, '#4a3428' if v == 2 else LEATHER)
    m.slot = 1
    for z in (-.19, .19):   # collars round the ends of the grip
        m.lathe((0, 0, z), [(-.018, .058), (.018, .058)], edge, n=8, jitter=0)
    # the head: a stone set in a squared mount
    head = Vector((BOLT_LINE[-1][0], 0, BOLT_LINE[-1][1] - .04))
    m.box(head, (.2, t + .02, .1), edge)
    m.slot = 2
    for side in (-1, 1):
        m.lathe(head + Vector((0, side * (t / 2 + .008), 0)), [(0, .06), (.022, .055), (.038, 0)],
                stone, n=6, jitter=0, axis=(0, side, 0), colors=[stone, light])
    m.shard(head + Vector((0, 0, .05)), .045, .14 + .04 * v, stone)
    m.slot = 0


# Tridents: a long shaft along +Z, the grip at the origin, a stone set in its butt; at its top a
# collar and three prongs, the middle one straight with a leaf-shaped point, the outer ones bending
# out and up and curling over at their tips like hooks. (name, shaft, its bands, the head's metal,
# its edge, the stone (colour, light), the wrap)
TRIDENTS = [
    ('fisher', WOOD, '#7a5a3a', '#b0804e', '#d7a46e', None, '#c9b48a'),
    ('sea', '#4a3428', STEEL, STEEL, EDGE, ('#3f78b8', '#a8d4f2'), LEATHER),
    ('storm', '#2e2a36', GOLD, '#c9a456', '#f0dc9a', ('#7f56b8', '#d7b8f0'), '#5b4a7a'),
]
TRIDENT_TIP = 1.6   # how high its middle prong reaches; where its lightning leaves (a little under it)


def prong(m, side, color, edge, spread=.15):
    """An outer prong: out from the collar, up, its tip curling outwards and down like a hook."""
    s = side
    pts = [(s * .04, 0, 1.13), (s * spread, 0, 1.18), (s * (spread + .02), 0, 1.3), (s * (spread + .01), 0, 1.43),
           (s * (spread - .02), 0, 1.5)]
    m.tube(pts, [.026, .024, .022, .018, .012], color, n=6)
    # the point, and the hook curling back down off it
    m.leaf((s * (spread - .02), 0, 1.49), (s * (spread - .05), 0, 1.57), .022, edge)
    m.leaf((s * (spread + .015), 0, 1.44), (s * (spread + .06), 0, 1.38), .016, edge)


def trident(m, v=0):
    name, shaft, band, metal, edge, stone, wrap = TRIDENTS[v]
    m.tube([(0, 0, -1.0), (0, 0, 0), (0, 0, 1.1)], [.034, .036, .034], shaft, n=8)
    grip(m, .36, .046, wrap)
    m.slot = 1
    for z in (-.92, -.22, .22, .7):
        m.lathe((0, 0, z), [(-.015, .046), (.015, .046)], band, n=8, jitter=0)
    # the collar: a diamond between two rings, the prongs rising out of it
    m.lathe((0, 0, 1.04), [(0, .04), (.03, .056), (.07, .062), (.11, .04)], metal, n=8, jitter=0)
    m.lathe((0, 0, 1.12), [(-.04, .045), (0, .085), (.04, .045)], edge, n=4, jitter=0)
    for side in (-1, 1):
        prong(m, side, metal, edge, .15 + .01 * v)
    m.tube([(0, 0, 1.12), (0, 0, 1.36), (0, 0, 1.5)], [.03, .026, .02], metal, n=6)
    m.leaf((0, 0, 1.48), (0, 0, TRIDENT_TIP), .04, edge)
    if v == 2:   # the storm's: little lightning-bolt barbs on its middle prong
        for side in (-1, 1):
            m.leaf((0, 0, 1.3), (side * .07, 0, 1.36), .016, edge)
    # the butt: a ring and a six-sided stone in a cage (the fisher's a plain iron cap)
    m.lathe((0, 0, -1.0), [(-.04, 0), (-.025, .045), (.02, .045)], band, n=8, jitter=0)
    m.slot = 0
    if stone:
        m.slot = 2
        m.lathe((0, 0, -1.06), [(-.06, 0), (-.035, .055), (.035, .055), (.06, 0)], stone[0], n=6, jitter=0,
                colors=[stone[0], stone[1], stone[0]])
        m.slot = 1
        for i in range(3):
            a = math.tau * i / 3
            m.tube([(0, 0, -1.0), (.06 * math.cos(a), .06 * math.sin(a), -1.06), (0, 0, -1.13)], .007, edge, n=4)
        m.slot = 2   # a stone in the collar too
        for side in (-1, 1):
            m.lathe((0, side * .06, 1.075), [(0, .02), (.012, .016), (.02, 0)], stone[0], n=6, jitter=0, axis=(0, side, 0))
        m.slot = 0
    else:
        m.slot = 1
        m.lathe((0, 0, -1.0), [(-.05, 0), (-.03, .04), (0, .04)], IRON, n=8, jitter=0)
        m.slot = 0


# Flails (morning stars): the handle along +Z, the grip at the origin, an iron cap at its top
# with an eye (the anchor) from which a chain runs to each ball. As modelled the chains curve
# over to the side in the XZ plane (how it lies on the floor, how the bag shows it); in a hand
# the game hangs and swings them itself (src/render/held.js): the first link is a part of its
# own (`link`, straight up from the anchor, long along +Z) that the game copies along each
# chain, the other links are `chain` (hidden in a hand), and each ball is a part (`ball`,
# `ball2`, `ball3`) pivoting at the end of its chain.
# (name, top of the handle, links in a chain, ball radius, balls, spikes (0 studs, 1 spikes,
# 2 long ones), wood, grip wrap, ball metal, spike metal)
FLAILS = [
    ('ball', .30, 6, .13, 1, 0, WOOD, LEATHER, IRON, IRON),
    ('morningstar', .34, 7, .13, 1, 1, BARK, LEATHER, IRON, STEEL),
    ('twin', .34, 6, .11, 2, 1, '#4a3428', '#6b2f2a', IRON, STEEL),
    ('knight', .40, 8, .12, 1, 2, '#5b4030', '#3f5a8c', '#7d8a94', GOLD),
    ('triple', .36, 6, .09, 3, 1, '#3a2d26', LEATHER, IRON, STEEL),
]
LINK = (.02, .007, 1.6)   # a chain link's radius, wire and stretch along its length
PITCH = .062              # from one link's middle to the next
EYE = .035                # from the end of a chain to its ball
# how far each chain bends over as modelled (rad from +Z), by the number of balls
DRAPE = {1: [.95], 2: [.8, -.8], 3: [1, 0, -1]}


def loop(m, center, axis, normal, radius, wire, color, stretch=1):
    """A ring about center, its circle through axis (stretched along it) and normal to `normal`."""
    start = len(m.vertices)
    m.ring((0, 0, 0), radius, wire, color, n=8, section=3, ellipse=stretch)
    y = Vector(axis).normalized()
    z = Vector(normal)
    z = z - y * z.dot(y)
    z = z.normalized() if z.length > 1e-6 else y.orthogonal().normalized()
    x = y.cross(z)
    for i in range(start, len(m.vertices)):
        v = Vector(m.vertices[i])
        m.vertices[i] = tuple(Vector(center) + x * v.x + y * v.y + z * v.z)


def chain_link(m, center, axis, k):
    """Link k of a chain about `center`, long along axis; every other one turned a quarter."""
    side = Vector((0, 1, 0)) if k % 2 == 0 else Vector(axis).cross(Vector((0, 1, 0)))
    loop(m, center, axis, side, LINK[0], LINK[1], IRON, LINK[2])


def flail_anchor(v):
    return (0, 0, FLAILS[v][1] + .045)


def flail_chain(v, i):
    """Chain i of flail v as modelled: its links' middles with their directions, its end and the
    direction there. A circular arc from the anchor, straight up at first."""
    links, balls = FLAILS[v][2], FLAILS[v][4]
    bend, length = DRAPE[balls][i], links * PITCH
    ax, _, az = flail_anchor(v)

    def at(s):
        if abs(bend) < 1e-6:
            return Vector((ax, 0, az + s)), Vector((0, 0, 1))
        k = bend / length
        return (Vector((ax + (1 - math.cos(k * s)) / k, 0, az + math.sin(k * s) / k)),
                Vector((math.sin(k * s), 0, math.cos(k * s))))
    end, d = at(length)
    return [at((j + .5) * PITCH) for j in range(links)], end, d


def spiked_ball(m, end, axis, radius, spikes, metal, spike):
    """A ball hanging from `end` (the end of its chain) along axis, by its eye."""
    axis = Vector(axis).normalized()
    center = Vector(end) + axis * (EYE + radius)
    m.slot = 1
    m.lathe(center, [(-radius, 0), (-radius * .72, radius * .7), (0, radius), (radius * .72, radius * .7), (radius, 0)],
            metal, n=8, jitter=0, axis=axis)
    loop(m, Vector(end) + axis * EYE * .55, axis, Vector((0, 1, 0)), EYE * .4, .008, IRON)
    # the spikes point to the corners of an icosahedron, but not where the eye is
    t = (1 + 5 ** .5) / 2
    corners = [Vector(p).normalized() for p in [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t),
                                                (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]]
    turn = Vector((0, 0, 1)).rotation_difference(axis)
    long, wide = [(.12, .3), (.7, .28), (1.05, .25)][spikes]
    for d in corners:
        d = turn @ d
        if d.dot(axis) < -.75:
            continue
        m.lathe(center + d * radius * .8, [(0, radius * wide), (radius * (long + .2), 0)], spike, n=4, jitter=0, axis=d)
    m.slot = 0


def flail(m, v=0):
    _, top, links, radius, balls, spikes, wood, wrap, metal, spike = FLAILS[v]
    gold = spike == GOLD
    # the handle: a shaft with a pommel, the grip wrapped, an iron cap with its eye at the top
    m.lathe((0, 0, 0), [(-.2, 0), (-.2, .03), (-.17, .04), (-.15, .036), (top - .04, .036), (top, .03), (top, 0)],
            wood, n=8, jitter=0)
    grip(m, .26, .042, wrap)
    m.slot = 1
    m.lathe((0, 0, -.2), [(-.025, 0), (-.02, .045), (.02, .048), (.03, .038)], GOLD if gold else metal, n=8, jitter=0)
    m.lathe((0, 0, top - .06), [(0, .042), (.05, .045), (.065, .03), (.075, 0)], metal, n=8, jitter=0)
    for z in ((.16, top - .1) if top > .32 else (.16,)):
        m.lathe((0, 0, z), [(0, .041), (.022, .041)], GOLD if gold else IRON, n=8, jitter=0)
    anchor = Vector(flail_anchor(v))
    loop(m, anchor - Vector((0, 0, .008)), (0, 0, 1), (1, 0, 0), .017, .007, IRON)
    m.slot = 0
    if gold:   # the knight's: a tassel under the cap
        m.tube([(.035, .02, top - .08), (.07, .04, top - .2), (.08, .05, top - .3)], [.014, .012, .005], wrap, n=4)
    first, rest = Mesh(m.rng.randrange(1 << 30)), Mesh(m.rng.randrange(1 << 30))
    first.slot = rest.slot = 1
    m.parts += [('link', first, tuple(anchor + Vector((0, 0, PITCH * .5)))), ('chain', rest, tuple(anchor))]
    for i in range(balls):
        middles, end, d = flail_chain(v, i)
        for k, (p, axis) in enumerate(middles):
            chain_link(rest if i or k else first, p, axis, k)
        ball = Mesh(m.rng.randrange(1 << 30))
        spiked_ball(ball, end, d, radius, spikes, metal, spike)
        m.parts.append(('ball' if i == 0 else f'ball{i + 1}', ball, tuple(end)))


# Drinkable potions (src/core/items.js POTIONS): name: (bottle shape, liquid, glass tint, emblem
# on the label, size, a band round the shoulder). Bottles are opaque stylised glass. The health
# potions share the heart and grow from a slim vial to an ornate flask; the others each have a
# colour and an emblem of their own (a cross cures, a wing quickens the feet, a bolt the
# hands, a sword hits harder, an arrow jumps higher). Mana and stamina have no use yet.
POTION_LOOKS = {
    'health': (0, '#bb5d60', '#dcc4bb', 'heart', 1, None),
    'mana': (1, '#5b89b4', '#bfd0d2', 'rune', 1, None),
    'stamina': (2, '#6b9c68', '#cbd3b3', 'leaf', 1, None),
    'health_minor': (3, '#d27f78', '#ead5cc', 'heart', .95, None),
    'health_greater': (0, '#a8303d', '#dcb4b0', 'heart', 1.15, GOLD),
    'health_superior': (4, '#8c1838', '#e2b6c2', 'heart', 1.2, GOLD),
    'antidote': (1, '#3f9f8f', '#c4e3da', 'cross', 1, None),
    'swiftness': (2, '#4fa9d6', '#c6e2ee', 'wing', 1, None),
    'haste': (3, '#e0962a', '#f2dcae', 'bolt', 1, None),
    'might': (0, '#bf4a2a', '#e9c2ae', 'sword', 1.05, IRON),
    'leaping': (4, '#93c23a', '#dfeebd', 'arrow', 1, None),
}
POTIONS = list(POTION_LOOKS)
# bottle shapes: lathe profile [(height, radius)], sides, turn, and the label (front y, height z,
# width, height)
SHAPES = [
    ([(0, .065), (.04, .125), (.14, .15), (.23, .115), (.275, .049)], 8, 0, (-.145, .14, .085, .077)),   # round
    ([(0, .068), (.025, .09), (.235, .09), (.28, .043)], 6, 0, (-.092, .14, .085, .077)),                # tall
    ([(0, .095), (.025, .13), (.14, .13), (.24, .055)], 4, math.pi / 4, (-.096, .12, .085, .077)),       # square
    ([(0, .05), (.02, .068), (.27, .066), (.31, .042)], 6, 0, (-.064, .16, .06, .08)),                   # slim vial
    ([(0, .13), (.03, .16), (.07, .148), (.22, .066), (.3, .046)], 8, math.pi / 8, (-.142, .075, .085, .066)),   # cone
]


def emblem(m, kind, y, z, k, color):
    """The emblem on a label at (y, z) (the label's front), k: its size against the round
    bottle's label."""
    y -= .012 * k
    if kind == 'heart':   # two lobes and a pointed lower half
        m.blob((-.015 * k, y, z + .012 * k), (.017 * k, .006, .017 * k), color, n=5, jitter=0)
        m.blob((.015 * k, y, z + .012 * k), (.017 * k, .006, .017 * k), color, n=5, jitter=0)
        m.leaf((0, y - .003, z - .028 * k), (0, y - .003, z + .015 * k), .027 * k, color)
    elif kind == 'rune':
        m.box((-.012, y, z + .015), (.025, .007, .025), color, tilt=0)
        m.box((.007, y, z - .014), (.025, .007, .035), color)
    elif kind == 'leaf':
        m.leaf((-.018, y - .003, z - .025), (.018, y - .003, z + .025), .015, color)
    elif kind == 'cross':
        m.box((0, y, z), (.016 * k, .008, .052 * k), color)
        m.box((0, y, z), (.052 * k, .008, .016 * k), color)
    elif kind == 'wing':  # three feathers fanning up and out
        for tx, tz, w in ((.03, .016, .011), (.026, .03, .012), (.014, .04, .011)):
            m.leaf((-.022 * k, y, z - .022 * k), (tx * k, y, (z + tz * k)), w * k, color)
    elif kind == 'bolt':  # a zigzag of lightning
        pts = [(-.012, .034), (.014, .006), (-.010, .002), (.012, -.032)]
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            m.leaf((ax * k, y, z + az * k), (bx * k, y, z + bz * k), .009 * k, color)
    elif kind == 'sword':  # point up, a cross guard and the grip
        m.leaf((0, y, z - .016 * k), (0, y, z + .038 * k), .009 * k, color)
        m.box((0, y, z - .018 * k), (.036 * k, .008, .008 * k), color)
        m.box((0, y, z - .03 * k), (.009 * k, .008, .016 * k), color)
    elif kind == 'arrow':  # pointing up
        m.box((0, y, z - .012 * k), (.011 * k, .008, .036 * k), color)
        m.leaf((0, y - .001, z + .004 * k), (0, y - .001, z + .036 * k), .022 * k, color)


def potion(m, v):
    """A drinkable potion (POTION_LOOKS, by its index in POTIONS)."""
    start = len(m.vertices)
    shape, color, tint, mark, size, band = POTION_LOOKS[POTIONS[v]]
    profile, n, phase, (y, z, w, h) = SHAPES[shape]
    neck = profile[-1][0]
    m.slot = 2
    m.lathe((0, 0, 0), profile, color, n=n, jitter=0, phase=phase, colors=[color, color, color, tint])
    m.lathe((0, 0, 0), [(neck - .009, .054), (neck + .064, .054),
                         (neck + .067, .067), (neck + .088, .067)], tint, n=8, jitter=0)
    m.slot = 0
    m.lathe((0, 0, 0), [(neck + .082, .048), (neck + .12, .052), (neck + .127, .038)],
            CUT, n=7, jitter=0)
    m.slot = 1
    m.lathe((0, 0, 0), [(neck + .01, .058), (neck + .032, .058)], GOLD, n=8, jitter=0)
    m.slot = 0
    # Cream paper medallion with raised icon; opaque stylised glass, no sorting.
    m.box((0, y, z), (w, .013, h), CREAM)
    emblem(m, mark, y, z, w / .085, color)
    # Small chunky highlight strip, not a realistic transparent bottle.
    m.tube([(-.045, y + .015, z + .045), (-.045, y + .023, z + .085)], .006, tint, n=4)
    if band:   # a metal band round the shoulder, and a cap over the cork
        m.slot = 1
        r = max(rr for hh, rr in profile if hh >= neck * .6)
        m.ring((0, 0, neck * .78), r * .93, .014, band, n=n * 2 if n < 8 else n, section=4)
        m.lathe((0, 0, 0), [(neck + .115, .056), (neck + .14, .05), (neck + .15, .02)], band, n=8, jitter=0)
        m.slot = 0
    if POTIONS[v] == 'health_superior':   # a star over the heart
        star(m, Vector((0, y - .02, z + h * .36)), Vector((0, -1, .2)).normalized(), .016, GOLD)
    if size != 1:
        m.vertices[start:] = [(x * size, yy * size, zz * size) for x, yy, zz in m.vertices[start:]]


# Throwing flasks (src/core/items.js POTIONS with `flask`): a round belly and a long neck the fist
# holds them by (FLASK_GRIP), the same size for all, so one mount fits: name: (glass, tint,
# label, emblem colour). Blast: smoky glass bound with iron and a lit fuse; fire: a rag stuffed
# in the neck; toxic: sealed with wax, bubbles in the shoulder and a skull on a dark label.
FLASK_LOOKS = {
    'blast': ('#4a4556', '#9f98ad', CREAM, '#e2602a'),
    'fire': ('#d0532a', '#f0b890', CREAM, '#e8642a'),
    'toxic': ('#62a62a', '#c8e6a0', '#2c3a22', '#e8e0c8'),
}
FLASKS = list(FLASK_LOOKS)
FLASK_GRIP = .29      # the neck's middle (Blender z), where the fist holds it
FLASK_SCALE = 1.1     # how big it is in the hand against its size on the floor (rig units: x 0.55)


def flask(m, v):
    """A throwing flask (FLASK_LOOKS, by its index in FLASKS)."""
    kind = FLASKS[v]
    glass, tint, label, mark = FLASK_LOOKS[kind]
    m.slot = 2
    m.lathe((0, 0, 0), [(0, .045), (.025, .105), (.11, .14), (.19, .11), (.235, .055), (.25, .042)], glass,
            n=10, jitter=0, colors=[glass, glass, glass, glass, tint])
    m.lathe((0, 0, 0), [(.245, .04), (.32, .038), (.325, .05), (.345, .05)], tint, n=8, jitter=0)
    m.slot = 0
    y, z = -.142, .12
    m.box((0, y, z), (.08, .013, .075), label)
    if kind == 'blast':
        m.slot = 1
        for hz in (.055, .175):
            m.ring((0, 0, hz), .128 if hz < .1 else .124, .013, IRON, n=10, section=4)
        m.slot = 0
        m.lathe((0, 0, 0), [(.335, .036), (.37, .04), (.375, .03)], CUT, n=7, jitter=0)
        m.tube([(0, 0, .37), (.012, .004, .41), (.045, .006, .44), (.075, .004, .43)], [.009, .008, .007, .006], '#3a2e22', n=5)
        m.blob((.08, .004, .432), (.02, .02, .02), '#ffb347', n=5, jitter=.2)
        star(m, Vector((0, y - .008, z)), Vector((0, -1, 0)), .03, mark, points=8, depth=.008)
    elif kind == 'fire':
        # a rag stuffed in the neck, its ends hanging out over the shoulder
        m.tube([(0, 0, .3), (0, 0, .37), (.01, -.005, .4)], [.036, .042, .03], '#d8c8a0', n=6)
        m.tube([(.025, -.01, .385), (.06, -.025, .35), (.075, -.035, .29)], [.016, .013, .009], '#c46a3a', n=4)
        m.tube([(-.02, .01, .38), (-.05, .02, .36), (-.065, .03, .32)], [.014, .011, .008], '#d8c8a0', n=4)
        m.leaf((0, y - .012, z - .03), (0, y - .012, z + .032), .022, mark)
        m.leaf((0, y - .016, z - .026), (.004, y - .016, z + .012), .012, '#ffd25a')
    else:
        # sealed with wax dripping down the neck, bubbles rising in the glass
        m.lathe((0, 0, 0), [(.33, .046), (.36, .052), (.375, .03)], '#6b3f7a', n=8, jitter=0)
        for a, l in ((.3, .03), (2.2, .045), (4.1, .025)):
            m.tube([(math.cos(a) * .05, math.sin(a) * .05, .34), (math.cos(a) * .046, math.sin(a) * .046, .34 - l)],
                   [.012, .006], '#6b3f7a', n=4)
        for bx, bz, r in ((.06, .2, .016), (.085, .165, .012), (.035, .215, .01)):
            m.blob((bx, -.08, bz), (r, r, r), tint, n=5, jitter=0)
        # a skull: the head, two dark eyes, the jaw
        m.blob((0, y - .011, z + .008), (.022, .007, .02), mark, n=6, jitter=0)
        m.box((0, y - .01, z - .016), (.022, .008, .012), mark)
        for ex in (-.008, .008):
            m.box((ex, y - .019, z + .006), (.008, .004, .009), label)
    m.tube([(-.07, y + .04, .07), (-.075, y + .055, .15)], .007, tint, n=4)


def scroll(m, v=0):
    """Portal scrolls: a parchment sheet between two rollers, sloping down towards the viewer
    from the fat back roll, with a portal sigil and a dangling wax seal; violet for the town
    portal (v=0), teal for the room portal (v=1)."""
    PORTAL, RIM, LILAC, GLEAM, VIOLET = SCROLL_INKS[v]
    back, front = (.09, .08), (-.25, .036)        # roll centres (y, z); radii are the z
    # Rolls of parchment on wooden rods with brass knobs; the back one holds most of the sheet.
    for (y, r), half, rod in ((back, .21, .017), (front, .2, .013)):
        m.lathe((-half, y, r), [(0, r * .9), (.008, r), (2 * half - .008, r), (2 * half, r * .9)],
                PARCHMENT, n=10, jitter=0, axis=(1, 0, 0), colors=[PARCHMENT_EDGE, PARCHMENT, PARCHMENT_EDGE])
        for side in (-1, 1):
            # rolled-up layers showing on the ends
            m.lathe((side * half, y, r), [(0, r * .66), (.004, r * .66)], PARCHMENT_EDGE,
                    n=10, jitter=0, axis=(side, 0, 0))
            m.lathe((side * half, y, r), [(0, r * .3), (.007, r * .3)], '#a88c62',
                    n=8, jitter=0, axis=(side, 0, 0))
            m.lathe((side * half, y, r), [(0, rod), (.035, rod)], WOOD, n=6, jitter=0, axis=(side, 0, 0))
            m.slot = 1
            m.lathe((side * (half + .035), y, r), [(0, rod * 1.2), (.008, rod * 1.9), (.026, rod * 1.9),
                    (.036, rod * .9)], GOLD, n=8, jitter=0, axis=(side, 0, 0))
            m.slot = 0
    # The sheet leaves the top of the back roll and runs down onto the front one.
    p0, p1 = Vector((0, back[0], back[1] + back[1] - .006)), Vector((0, front[0] + .012, front[1] * 2 - .004))
    along = (p1 - p0).normalized()
    normal = Vector((0, -along.z, along.y))
    if normal.z < 0:
        normal = -normal
    t, half = .009, .2
    ids = [m.vert(p + Vector((x, 0, 0)) + normal * dz) for p in (p0, p1)
           for x in (-half, half) for dz in (-t / 2, t / 2)]
    # ids: p0(-x lo, -x hi, +x lo, +x hi), p1(...)
    for f, color in [((1, 3, 7, 5), PARCHMENT), ((0, 4, 6, 2), PARCHMENT_EDGE),
                     ((0, 1, 5, 4), PARCHMENT_EDGE), ((2, 6, 7, 3), PARCHMENT_EDGE),
                     ((0, 2, 3, 1), PARCHMENT_EDGE), ((4, 5, 7, 6), PARCHMENT_EDGE)]:
        m.face([ids[i] for i in f], color)
    length = (p1 - p0).length
    centre = p0.lerp(p1, .5)

    def on_sheet(start, lift=0):
        # local (x, y, z) -> the sheet: x across, y down the slope, z out of the paper
        for i in range(start, len(m.vertices)):
            x, y, z = m.vertices[i]
            m.vertices[i] = tuple(centre + Vector((x, 0, 0)) + along * y + normal * (z + t / 2 + lift))

    # Portal sigil: a dark violet pool in a lilac ring, a two-armed swirl and a pale heart.
    start = len(m.vertices)
    m.lathe((0, 0, 0), [(0, .08), (.004, .08)], PORTAL, n=14, jitter=0)   # matte: stays deep
    m.slot = 2
    m.ring((0, 0, .004), .086, .008, RIM, n=14, section=4)
    for arm in (0, math.pi):
        points = [(r * math.cos(arm + a), r * math.sin(arm + a), .006)
                  for r, a in [(.013, 0), (.028, .9), (.045, 1.8), (.06, 2.7), (.069, 3.4)]]
        m.tube(points, [.007, .0075, .007, .006, .0045], LILAC, n=4)
    m.lathe((0, 0, 0), [(0, .016), (.009, .013), (.012, 0)], GLEAM, n=6, jitter=0)
    m.slot = 0
    # inked runes around the sigil, and lines of script above and below it
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        m.box((.114 * math.cos(a), .114 * math.sin(a) * .95, .002), (.016, .016, .004), INK, tilt=a)
    for y, w in [(-length * .375, .2), (-length * .445, .13), (length * .375, .22), (length * .445, .15)]:
        m.box((-.01 if w < .2 else 0, y, .002), (w, .007, .004), INK)
    on_sheet(start)
    # Wax seal on violet ribbon tails, hanging off the front roll onto the ground.
    seal = (.1, front[0] - .12, 0)
    for dx in (-.016, .016):
        tail = [(seal[0] + dx * .5, front[0] - .022, front[1] * .9), (seal[0] + dx, front[0] - .06, .008),
                (seal[0] + dx * 1.3, seal[1] + .025, .006)]
        m.tube(tail, [.006, .006, .005], VIOLET, n=4)
    m.slot = 2
    m.lathe(seal, [(0, .036), (.012, .04), (.02, .034)], VIOLET, n=9, jitter=.06)
    m.ring((seal[0], seal[1], .02), .021, .004, LILAC, n=9, section=3)
    m.lathe((seal[0], seal[1], .018), [(0, .009), (.006, .006)], GLEAM, n=6, jitter=0)
    m.slot = 0


def chest(m, v=0):
    # Hollow, empty planked box with a barrel lid on a hinge at the back (its own part,
    # animated by lid_clips). Things can be put on its floor later (`contents` extra).
    m.box((0, 0, .055), (.94, .60, .11), BARK)
    m.box((0, 0, .114), (.84, .49, .008), '#5d4128')
    for y in (-.276, .276):
        for i in range(6):
            m.box((-.39 + i * .156, y, .275), (.15, .055, .34), WOOD if i % 2 else '#967049')
    for x in (-.45, .45):
        for i in range(4):
            m.box((x, -.216 + i * .144, .275), (.055, .138, .34), WOOD if i % 2 else '#967049')
    m.slot = 1
    for x in (-.33, .33):
        for y in (-.31, .31):
            m.box((x, y, .26), (.066, .018, .385), GOLD)
        m.box((x, 0, .012), (.066, .62, .02), GOLD)
    for x in (-.485, .485):
        m.ring((x, 0, .25), .087, .014, IRON, n=8, section=4, vertical=True, yaw=math.pi / 2)
    m.box((0, -.319, .367), (.105, .028, .136), GOLD)
    m.box((0, -.337, .375), (.018, .009, .032), IRON)
    m.lathe((0, -.343, .394), [(0, .014), (.006, .014)], IRON, n=8, jitter=0, axis=(0, -1, 0))
    for x in (-.33, .33):
        for z in (.11, .37):
            m.lathe((x, -.325, z), [(0, .014), (.009, .01)], SILVER, n=6, jitter=0, axis=(0, -1, 0))
    # hinge knuckles on the back edge
    for x in (-.2, .2):
        m.lathe((x - .04, .305, .445), [(0, .018), (.08, .018)], IRON, n=6, jitter=0, axis=(1, 0, 0))
    m.slot = 0
    lid = Mesh(m.rng.randrange(1 << 30))
    m.parts.append(('lid', lid, CHEST_HINGE))
    # Lid cross section: lower edge then nine semicircular points, a convex prism.
    section = [(-.30, .445), (.30, .445)] + [(.30 * math.cos(a), .465 + .19 * math.sin(a))
               for a in [i * math.pi / 8 for i in range(9)]]
    def prism(x0, x1, profile, color):
        a = [lid.vert((x0, y, z)) for y, z in profile]
        b = [lid.vert((x1, y, z)) for y, z in profile]
        lid.face(tuple(reversed(a)), color)
        lid.face(b, color)
        for i in range(len(a)):
            j = (i + 1) % len(a)
            lid.face((a[i], a[j], b[j], b[i]), color)
    for i in range(6):
        prism(-.468 + i * .156, -.468 + i * .156 + .152, section,
              WOOD if i % 2 else '#967049')
    # the dark underside shows once it is open; it sits a little below the planks' flat
    # bottom (z .445) rather than flush with it, which would z-fight
    lid.box((0, 0, .443), (.86, .52, .006), '#5d4128')
    lid.slot = 1
    for x in (-.33, .33):
        for i in range(8):
            a, b = i * math.pi / 8, (i + 1) * math.pi / 8
            profile = [(.301 * math.cos(a), .465 + .191 * math.sin(a)),
                       (.301 * math.cos(b), .465 + .191 * math.sin(b)),
                       (.316 * math.cos(b), .465 + .204 * math.sin(b)),
                       (.316 * math.cos(a), .465 + .204 * math.sin(a))]
            prism(x - .033, x + .033, profile, GOLD)
    lid.box((0, -.316, .474), (.075, .025, .083), GOLD)
    lid.slot = 0


# ----------------------------------------------------------------------------
# Worn and held things (WEARS). Headwear is built around the head's centre: the clay head is
# a ball of figure.HEAD_R (.26); the face looks towards -Y. Held items are built around the
# fist, which is the round end of an arm of radius figure.LIMB_R (.125).
# ----------------------------------------------------------------------------
HEAD_R = .26
TRIM = armor.TRIM_SLOT   # the trim of headwear, which is head armor too (src/core/items.js)
SCARF = '#8a3a6c'
SCARF_DOTS = '#e3b64e'
SCARF_DARK = '#6d2c55'
TOWEL = '#ece6d4'
TOWEL_STRIPE = '#5e86b2'
ROPE = '#c7a36a'
ROPE_DARK = '#9c7a48'
BURLAP = '#b59c6b'
BURLAP_DARK = '#8f7650'
MASK = '#6f7550'
MASK_DARK = '#4f5439'
LENS = '#27463a'
HAT = '#4a3d8e'
HAT_DARK = '#3a2f72'
STAR = '#e6c35a'
BALL = ('#8fb8e6', '#c9e2f7', '#6f8fd0')


def on_sphere(center, radius, phi, theta):
    """A point on a sphere: theta from straight up, phi round from the front (-Y) towards +X."""
    s = math.sin(theta)
    return Vector(center) + radius * Vector((s * math.sin(phi), -s * math.cos(phi), math.cos(theta)))


def recolor(m, k, color, shade=1):
    """Give face k another colour (the facet jitter as Mesh.face draws it)."""
    value = shade * m.rng.uniform(.93, 1.07)
    m.colors[k] = tuple(min(1, c * value) for c in props.linear(color)) + (1,)


def sheet(m, grid, thickness, color, closed=False):
    """A cloth or shell over a grid of (point, outward direction) (rows of columns), `thickness`
    thick outwards. color(i, j): the face between columns i, i + 1 and rows j, j + 1. closed:
    the columns wrap round."""
    rows, cols = len(grid), len(grid[0])
    outer = [[m.vert(p + n * thickness) for p, n in row] for row in grid]
    inner = [[m.vert(p) for p, n in row] for row in grid]
    span = cols if closed else cols - 1
    for j in range(rows - 1):
        for i in range(span):
            k = (i + 1) % cols
            c = color(i, j)
            m.face((outer[j][i], outer[j][k], outer[j + 1][k], outer[j + 1][i]), c)
            m.face((inner[j][k], inner[j][i], inner[j + 1][i], inner[j + 1][k]), c, shade=.8)
    # the edges
    for j in (0, rows - 1):
        for i in range(span):
            k = (i + 1) % cols
            m.face((inner[j][i], inner[j][k], outer[j][k], outer[j][i]), color(min(i, span - 1), min(j, rows - 2)), shade=.9)
    if not closed:
        for i in (0, cols - 1):
            for j in range(rows - 1):
                m.face((inner[j][i], inner[j + 1][i], outer[j + 1][i], outer[j][i]), color(min(i, span - 1), j), shade=.9)
    return outer


def star(m, center, normal, size, color, points=5, depth=.012):
    """A flat star standing out of a surface along `normal`."""
    normal = Vector(normal).normalized()
    u = normal.cross(Vector((0, 0, 1)))
    if u.length < 1e-6:
        u = Vector((1, 0, 0))
    u.normalize()
    v = normal.cross(u)
    rim = []
    for i in range(points * 2):
        a = math.pi * i / points
        r = size if i % 2 == 0 else size * .45
        rim.append(Vector(center) + u * (r * math.sin(a)) + v * (r * math.cos(a)))
    top = [m.vert(p + normal * depth) for p in rim]
    low = [m.vert(p) for p in rim]
    mid_top = m.vert(Vector(center) + normal * depth * 1.4)
    for i in range(len(rim)):
        j = (i + 1) % len(rim)
        m.face((top[i], top[j], mid_top), color)
        m.face((low[i], low[j], top[j], top[i]), color, shade=.85)
    m.face(tuple(reversed(low)), color)


def headscarf(m, v=0):
    """A plum kerchief with golden dots over the hair, from the forehead down over the ears to the nape,
    knotted at the back with two short tails."""
    def edge(phi):   # how far down it reaches (from straight up) all round
        return math.radians(64 + 54 * (1 - math.cos(phi)) / 2 + 10 * math.sin(phi) ** 2)
    n, rows, r = 24, 7, HEAD_R + .008
    grid = []
    for j in range(rows + 1):
        row = []
        for i in range(n):
            phi = math.tau * i / n
            theta = max(.06, edge(phi) * j / rows)
            p = on_sphere((0, 0, 0), r, phi, theta)
            row.append((p, p.normalized()))
        grid.append(row)
    sheet(m, grid, .024, lambda i, j: SCARF_DOTS if (i + 3 * (j % 2)) % 6 == 0 and 0 < j < rows - 1 else SCARF,
          closed=True)
    m.lathe((0, 0, r + .02), [(-.02, .025), (0, 0)], SCARF, n=8, jitter=0)   # the crown
    # the hem: a rolled edge all round
    hem = [on_sphere((0, 0, 0), r + .014, math.tau * i / n, edge(math.tau * i / n)) for i in range(n + 1)]
    m.slot = TRIM   # (the trim: worn as armor, it takes the rarity's colour)
    for a, b in zip(hem, hem[1:]):
        m.tube([a, b], .018, SCARF_DARK, n=5)
    m.slot = 0
    # the knot at the nape and its tails
    knot = on_sphere((0, 0, 0), r + .03, math.pi, math.radians(112))
    m.blob(knot, (.055, .045, .045), SCARF_DARK, n=6, jitter=.08)
    for side in (-1, 1):
        base = knot + Vector((side * .035, .01, -.01))
        tip = base + Vector((side * .08, .07, -.16))
        m.leaf(base, tip, .045, SCARF)
        m.box(tip + Vector((0, 0, .015)), (.03, .012, .03), SCARF_DOTS, tilt=side * .4)


def welding_mask(m, v=0):
    """A smith's welding mask, visor down: a flat, boxy olive shield in front of the face, a
    little narrower at the chin, with a dark green window in its upper half. Its sides and top
    turn back towards the head, hinged on knobs to a headband; the round head shows behind it."""
    top_w, low_w, low, high, front, back = .5, .43, -.25, .27, -.34, -.13
    rows, cols = 6, 8

    def across(z):   # the plate's half width at height z
        return (low_w + (top_w - low_w) * (z - low) / (high - low)) / 2

    def plate_y(x, z):   # curved a little round the face, the chin turned back
        return front + .35 * x * x + .12 * max(0, -.12 - z) ** 1.5 * 4
    grid = []
    for j in range(rows + 1):
        z = low + (high - low) * j / rows
        h = across(z)
        grid.append([(Vector((x, plate_y(x, z), z)), Vector((0, -1, 0)))
                     for x in [-h + 2 * h * i / cols for i in range(cols + 1)]])
    sheet(m, grid, .024, lambda i, j: MASK)
    # the sides and the top turn back towards the head, so it reads as a box
    for side in (-1, 1):
        flank = []
        for j in range(rows + 1):
            z = low + (high - low) * j / rows
            x = side * across(z)
            y0 = plate_y(x, z)
            flank.append([(Vector((x, y0 + (back - y0) * t, z)), Vector((side, 0, 0))) for t in (0, .5, 1)])
        sheet(m, flank, .022, lambda i, j: MASK_DARK)
    h = across(high)
    lid = [[(Vector((x, plate_y(x, high) + (back - plate_y(x, high)) * t, high)), Vector((0, 0, 1)))
            for x in [-h + 2 * h * i / cols for i in range(cols + 1)]] for t in (0, .5, 1)]
    sheet(m, lid, .022, lambda i, j: MASK_DARK)
    # the window: a raised frame and the dark green glass, in the upper half
    wz, ww, wh = .1, .3, .12
    y = plate_y(0, wz) - .024
    m.slot = TRIM
    for (cx, cz, sx, sz) in [(0, wz + wh / 2 + .02, ww + .08, .04), (0, wz - wh / 2 - .02, ww + .08, .04),
                             (-ww / 2 - .02, wz, .04, wh), (ww / 2 + .02, wz, .04, wh)]:
        m.box((cx, y - .012 + .35 * cx * cx, cz), (sx, .03, sz), MASK_DARK)
    m.slot = 2
    m.box((0, y + .004, wz), (ww, .012, wh), LENS)
    m.box((-.08, y - .004, wz + .03), (.06, .004, .018), '#7fa595')   # a glint
    m.slot = TRIM
    # hinge knobs on the sides, where the headband holds the mask
    for side in (-1, 1):
        m.lathe((side * (across(.02) + .01), back + .03, .02), [(0, .045), (.03, .045), (.045, .028)], IRON,
                n=8, jitter=0, axis=(side, 0, 0))
    m.slot = 0
    # the headband round the back of the head and a strap over the crown
    band = [Vector((side * (across(.02) + .01), back + .03, .02)) for side in (1,)]
    band += [on_sphere((0, 0, 0), HEAD_R + .012, math.radians(a), math.radians(88)) for a in range(100, 261, 20)]
    band += [Vector((-(across(.02) + .01), back + .03, .02))]
    m.tube(band, .022, LEATHER, n=5)
    crown = [on_sphere((0, 0, 0), HEAD_R + .012, math.radians(90 if a >= 0 else -90), math.radians(abs(a)))
             for a in range(-88, 89, 16)]
    crown = [p + Vector((0, .02, 0)) for p in crown]
    m.tube(crown, .02, LEATHER, n=5)


def wizard_hat(m, v=0):
    """A tall indigo wizard's hat with a wide, drooping brim, a gold band and stars, its tip
    bent back."""
    base = .1   # where the brim sits on the head (the head is .24 across there)
    m.lathe((0, .01, base), [(-.05, .47), (-.035, .48), (-.005, .43), (.012, .3), (.02, .235)], HAT_DARK, n=18,
            jitter=0, colors=[HAT_DARK, HAT, HAT])
    path = [(0, .01, base), (0, .02, base + .18), (0, .04, base + .38), (0, .1, base + .56), (0, .2, base + .7),
            (0, .32, base + .74)]
    radii = [.25, .2, .145, .09, .045, .012]
    m.tube(path, radii, HAT, n=12)
    m.slot = TRIM
    m.lathe((0, .01, base), [(0, .255), (.07, .235)], STAR, n=18, jitter=0)
    for (k, t, phi, size) in [(0, .55, -.3, .045), (1, .3, .9, .035), (1, .7, -1.1, .03), (2, .4, .2, .03),
                              (0, .3, 2.6, .04), (2, .1, -2.2, .03)]:
        a, b = Vector(path[k]), Vector(path[k + 1])
        c = a.lerp(b, t)
        r = radii[k] + (radii[k + 1] - radii[k]) * t
        normal = Vector((math.sin(phi), -math.cos(phi), .25)).normalized()
        star(m, c + Vector((normal.x, normal.y, 0)).normalized() * (r - .004), normal, size, STAR)
    m.slot = 0


def towel(m, v=0):
    """A striped towel folded over a forearm (along Y): over the top of the arm, hanging down on
    both sides, one side longer."""
    r = .125 + .025   # the forearm's radius and a little air
    profile = [(-r - .02, -.33), (-r - .01, -.2), (-r, -.06)]
    profile += [(-r * math.cos(a), r * math.sin(a)) for a in [math.pi * i / 8 for i in range(1, 8)]]
    profile += [(r, -.06), (r + .01, -.16), (r + .02, -.24)]
    width, cols = .24, 3
    grid = []
    for j, (x, z) in enumerate(profile):
        a = Vector(profile[max(j - 1, 0)])
        b = Vector(profile[min(j + 1, len(profile) - 1)])
        t = (b - a).normalized()
        n = Vector((-t.y, t.x))   # outwards, away from the arm
        if n.dot(Vector((x, z))) < 0:
            n = -n
        grid.append([(Vector((x, -width / 2 + width * i / cols, z)), Vector((n.x, 0, n.y))) for i in range(cols + 1)])
    stripes = {1, len(profile) - 3}
    sheet(m, grid, .022, lambda i, j: TOWEL_STRIPE if j in stripes else TOWEL)
    # a little fringe on the long end
    m.slot = TRIM
    for i in range(5):
        y = -width / 2 + .025 + i * (width - .05) / 4
        m.box((-r - .03, y, -.35), (.014, .016, .04), TOWEL)
    m.slot = 0


def crystal_ball(m, v=0):
    """A faceted crystal ball with three small shards circling it; it floats over the fist (the
    game bobs and turns it about its centre, the origin)."""
    r = .16
    light, pale, deep = BALL
    m.slot = 2
    profile = [(-r, 0)] + [(-r * math.cos(a), r * math.sin(a)) for a in [math.pi * i / 7 for i in range(1, 7)]] + [(r, 0)]
    m.lathe((0, 0, 0), profile, light, n=12, jitter=0, colors=[deep, light, pale, light, deep, light])
    m.slot = TRIM
    for i in range(3):
        a = math.tau * i / 3 + .4
        c = Vector((math.cos(a) * .25, math.sin(a) * .25, .04 * (i - 1)))
        m.lathe(c + Vector((0, 0, -.03)), [(0, 0), (.03, .024), (.06, 0)], pale, n=4, jitter=0, phase=a)
    m.slot = 0


def rope(m, v=0):
    """A coil of rope hanging from the fist (the coil's top, at the origin), its loose end
    hanging out, bound where the fist holds it."""
    turns, per, n = 3, 18, 6
    points = []
    for k in range(turns * per + 1):
        a = math.pi / 2 + math.tau * k / per
        turn = k / per
        radius = .21 + .014 * math.sin(turn * 2.1)
        centre = Vector((0, -.04 + .04 * turn, -.2))
        points.append(centre + Vector((radius * math.cos(a), 0, radius * math.sin(a))))
    start = len(m.faces)
    m.tube(points, .03, ROPE, n=n)
    for s in range(len(points) - 1):   # twisted strands
        for i in range(n):
            if (s + i) % 3 == 0:
                recolor(m, start + 1 + s * n + i, ROPE_DARK)
    end = points[-1]
    start = len(m.faces)
    tail = [end, end + Vector((.09, .01, -.06)), end + Vector((.15, .015, -.24)), end + Vector((.16, .02, -.44))]
    m.tube(tail, [.03, .029, .027, .025], ROPE, n=n)
    for s in range(len(tail) - 1):
        for i in range(n):
            if (s + i) % 3 == 0:
                recolor(m, start + 1 + s * n + i, ROPE_DARK)
    m.lathe(tail[-1], [(0, .03), (.035, .036), (.05, .014)], '#e2cc9a', n=6, jitter=.1,
            axis=tail[-1] - tail[-2])   # frayed end
    # the binding round the bundle, either side of the fist
    m.slot = TRIM
    for x in (-.13, .13):
        m.lathe((x - .03, 0, 0), [(0, .06), (.06, .06)], ROPE_DARK, n=7, jitter=0, axis=(1, 0, 0))
    m.slot = 0


def hammer(m, v=0):
    """A smith's hammer: a wooden handle through the fist, the iron head along X (the striking
    face at +X, a cross peen at -X)."""
    top = .5
    m.tube([(0, 0, -.17), (0, 0, .15), (0, 0, top)], [.04, .038, .034], WOOD, n=7)
    m.slot = TRIM
    m.lathe((0, 0, -.19), [(0, .045), (.035, .045), (.05, .036)], '#5d4128', n=7, jitter=0)
    m.slot = 1
    m.box((0, 0, top), (.22, .12, .12), IRON)
    m.lathe((.11, 0, top), [(0, .074), (.05, .074), (.065, .062)], STEEL, n=8, jitter=0, axis=(1, 0, 0))
    m.lathe((-.11, 0, top), [(0, .064), (.12, .016)], STEEL, n=4, jitter=0, axis=(-1, 0, 0), phase=math.pi / 4)
    m.slot = TRIM
    m.box((0, 0, top + .065), (.04, .07, .025), IRON)   # the wedge
    m.slot = 0


def pliers(m, v=0):
    """A smith's pliers: two iron arms crossing at a rivet, the handles through the fist, the
    jaws up, holding a small glowing billet."""
    m.slot = 1
    for side, y in ((-1, .02), (1, -.02)):
        m.tube([(side * .06, y, -.22), (side * .045, y, -.03), (0, y, .25), (-side * .034, y, .38),
                (-side * .018, y, .48)], [.022, .025, .028, .022, .017], IRON, n=5)
        m.box((-side * .024, y, .48), (.036, .03, .07), IRON)
    m.lathe((0, -.045, .25), [(0, .04), (.09, .04)], STEEL, n=7, jitter=0, axis=(0, 1, 0))
    m.slot = TRIM
    for side in (-1, 1):
        m.tube([(side * .062, 0, -.24), (side * .05, 0, -.07)], .036, '#7b3a2b', n=6)
    m.slot = 2
    m.box((0, 0, .52), (.045, .045, .15), '#f07a2a')
    m.slot = 0


def feed_bag(m, v=0):
    """A small burlap bag of animal feed hanging from a cord in the fist: grain heaped in its
    open mouth and a carrot sticking out."""
    start, size = len(m.vertices), 1.25
    lip = -.13
    m.lathe((0, 0, lip - .27), [(0, .07), (.04, .13), (.14, .155), (.23, .135), (.27, .115)], BURLAP, n=9,
            jitter=.05, colors=[BURLAP, BURLAP, BURLAP_DARK, BURLAP])
    m.slot = TRIM
    m.ring((0, 0, lip), .118, .022, BURLAP_DARK, n=9, section=4)
    m.slot = 0
    m.blob((0, 0, lip + .005), (.1, .1, .045), '#d9b85c', n=7, jitter=.15)
    for i in range(7):
        a = math.tau * i / 7
        m.box((math.cos(a) * .06, math.sin(a) * .06, lip + .04), (.022, .014, .014), '#a67c3a', tilt=a)
    # the carrot stands in the grain, its point down in the bag, its leaves up
    top = Vector((.07, .03, lip + .14))
    m.lathe(top, [(0, .034), (.05, .032), (.22, 0)], '#e07a2e', n=6, jitter=0,
            axis=Vector((-.04, -.02, -1)).normalized())
    for d in ((-.05, .02, .1), (.03, -.04, .11), (-.01, .05, .09)):
        m.leaf(top, top + Vector(d), .018, '#5e9c4a')
    m.slot = TRIM
    m.tube([(-.118, 0, lip), (-.08, 0, lip + .07), (0, 0, .02), (.08, 0, lip + .07), (.118, 0, lip)],
           .013, '#7d5e3c', n=5)
    m.slot = 0
    m.vertices[start:] = [(x * size, y * size, z * size) for x, y, z in m.vertices[start:]]


# ----------------------------------------------------------------------------
# Quest items (category 'quest'): the things the quests have you find, carry and bring back
# (src/core/quests.js). They lie on the ground like loot; the quest carries them, not a bag.
# ----------------------------------------------------------------------------
PAPER = '#efe4c8'
PAPER_EDGE = '#cdbb92'
WAX = '#b33a3a'
WAX_DARK = '#8a2a2c'
BROWN_PAPER = '#b98d5a'
BROWN_DARK = '#946c40'
TWINE = '#e8d7a6'
PLUSH = '#d9c2b4'
PLUSH_DARK = '#b89e90'
PLUSH_PINK = '#e6a3a8'
BUTTON = '#2c2420'
BRASS = '#c49a4c'
BRASS_DARK = '#8e6c34'
GLASS = '#cfe6ee'
JOURNAL = '#7b3f2c'
JOURNAL_DARK = '#5b2d20'
RIBBON = '#3f6fa8'


def slab(m, outline, z0, z1, top, side=None, bottom=None):
    """A flat solid from a closed 2D outline (counter-clockwise, x y), between heights z0 and z1."""
    lo = [m.vert((x, y, z0)) for x, y in outline]
    hi = [m.vert((x, y, z1)) for x, y in outline]
    # fanned from the middle, so an outline with dents (a heart, a torn edge) stays inside itself
    cx, cy = sum(x for x, _ in outline) / len(outline), sum(y for _, y in outline) / len(outline)
    mid_lo, mid_hi = m.vert((cx, cy, z0)), m.vert((cx, cy, z1))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        m.face((lo[j], lo[i], mid_lo), bottom or side or top, shade=.85)
        m.face((hi[i], hi[j], mid_hi), top)
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        m.face((lo[i], lo[j], hi[j], hi[i]), side or top, shade=.9)


def locket(m, v=0):
    """A heart-shaped gold locket lying on its back, a small ruby on its lid, its fine chain
    curled beside it."""
    heart = []
    for i in range(24):
        t = math.tau * i / 24
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        heart.append((x * .0085, y * .0085 + .01))
    heart.reverse()
    m.slot = 1
    slab(m, heart, 0, .035, GOLD, GOLD)
    slab(m, [(x * .78, y * .78 + .004) for x, y in heart], .035, .05, '#d2b26c', GOLD)   # the lid's raised face
    m.lathe((0, .135, .02), [(-.01, .014), (.01, .014)], GOLD, n=6, jitter=0, axis=(0, 1, 0))   # the bail
    # the chain: little links in a loose loop beside it
    for k in range(16):
        a = math.tau * k / 16
        c = (math.cos(a) * .13 - .05, .21 + math.sin(a) * .07, .012)
        m.ring(c, .014, .005, GOLD, n=6, section=3, vertical=k % 2 == 1, yaw=a)
    m.slot = 2
    gem(m, 0, center=(0, .02, .05), scale=.22)
    m.slot = 0


def toy_rabbit(m, v=0):
    """A child's plush rabbit, sitting: a soft round body and head, long ears (one flopped),
    button eyes, a pink nose and a fluffy tail."""
    m.blob((0, .02, .12), (.13, .12, .13), PLUSH, n=9, jitter=.04)
    m.blob((0, -.02, .3), (.1, .09, .09), PLUSH, n=9, jitter=.04)
    for side in (-1, 1):
        m.blob((side * .07, -.07, .05), (.045, .06, .04), PLUSH_DARK, n=7, jitter=.05)   # feet
        m.blob((side * .1, -.04, .15), (.035, .04, .06), PLUSH_DARK, n=7, jitter=.05)    # arms
        m.box((side * .04, -.1, .32), (.022, .012, .022), BUTTON)                       # button eyes
    m.leaf((-.04, -.01, .37), (-.07, .02, .55), .035, PLUSH)          # the ear that stands up
    m.leaf((-.04, -.015, .372), (-.065, .012, .53), .02, PLUSH_PINK)
    m.leaf((.04, -.01, .37), (.16, .06, .42), .035, PLUSH)            # the one that flops
    m.blob((0, -.105, .29), (.02, .015, .016), PLUSH_PINK, n=6, jitter=0)   # the nose
    m.blob((0, .15, .09), (.045, .04, .045), '#f2ece4', n=7, jitter=.12)   # the tail
    m.ring((0, -.05, .23), .07, .012, RIBBON, n=10, section=3)          # a ribbon round the neck
    m.leaf((.03, -.11, .23), (.07, -.13, .17), .02, RIBBON)


def letter(m, v=0):
    """A sealed letter lying on the ground: an envelope with its flap folded down and a red wax
    seal."""
    w, h, t = .34, .22, .018
    m.box((0, 0, t / 2), (w, h, t), PAPER)
    flap = [m.vert(p) for p in ((-w / 2, h / 2, t + .002), (w / 2, h / 2, t + .002), (0, -.01, t + .004))]
    m.face(tuple(flap), PAPER_EDGE)
    for side in (-1, 1):   # the folds of the back
        a, b, c = m.vert((side * w / 2, -h / 2, t + .001)), m.vert((side * w / 2, h / 2, t + .001)), m.vert((side * .02, 0, t + .002))
        m.face((a, b, c) if side < 0 else (b, a, c), '#e4d6b4')
    m.lathe((0, -.01, t), [(0, .04), (.012, .042), (.02, .034)], WAX, n=9, jitter=.08)
    m.lathe((0, -.01, t + .02), [(0, .02), (.004, .02)], WAX_DARK, n=8, jitter=0)


def parcel(m, v=0):
    """A parcel wrapped in brown paper, tied crosswise with twine and a bow on top, a little
    address label tucked under the string."""
    w, d, h = .3, .24, .17
    m.box((0, 0, h / 2), (w, d, h), BROWN_PAPER)
    m.box((0, 0, h - .006), (w * .96, d * .96, .014), BROWN_DARK)   # the folded top
    m.slot = 0
    for along in (0, 1):   # the twine all round, both ways
        if along:
            m.box((0, 0, h / 2), (.018, d + .012, h + .012), TWINE)
        else:
            m.box((0, 0, h / 2), (w + .012, .018, h + .012), TWINE)
    for side in (-1, 1):   # the bow
        m.ring((side * .035, 0, h + .02), .03, .009, TWINE, n=8, section=3, vertical=True, yaw=0)
        m.leaf((0, 0, h + .01), (side * .05, -.05, h + .002), .012, TWINE)
    m.box((.07, -.07, h + .004), (.08, .05, .006), PAPER, tilt=.3)   # the label
    m.box((.07, -.07, h + .008), (.05, .006, .002), INK, tilt=.3)


def map_scrap(m, v=0):
    """A torn scrap of an old map: rough parchment edges, a dotted way drawn in ink, a hill and
    a red cross."""
    outline = [(-.19, -.13), (-.07, -.15), (.03, -.12), (.12, -.15), (.2, -.1), (.17, -.02), (.21, .06),
               (.16, .13), (.05, .11), (-.04, .15), (-.15, .12), (-.2, .03), (-.16, -.04)]
    slab(m, outline, 0, .012, PARCHMENT, PARCHMENT_EDGE)
    z = .013
    for i, (x, y) in enumerate([(-.14, -.07), (-.09, -.04), (-.04, -.05), (.01, -.01), (.05, .03), (.09, .05)]):
        m.box((x, y, z), (.022, .01, .002), INK, tilt=.4 + i * .1)
    for (x, y) in ((-.11, .06), (-.06, .08)):   # hills
        m.face((m.vert((x - .03, y - .02, z)), m.vert((x + .03, y - .02, z)), m.vert((x, y + .03, z))), INK)
    for a in (math.pi / 4, -math.pi / 4):   # the cross
        m.box((.12, .07, z + .001), (.06, .014, .003), WAX, tilt=a)


def ring_item(m, v=0):
    """A gold ring standing on its edge, a blue gem set in its top."""
    r, t = .09, .022
    m.slot = 1
    m.ring((0, 0, r + t), r, t, GOLD, n=14, section=5, vertical=True, yaw=0)
    m.lathe((0, 0, 2 * r + t), [(-.012, .03), (.012, .03), (.02, .022)], GOLD, n=6, jitter=0)
    m.slot = 2
    gem(m, 3, center=(0, 0, 2 * r + t + .02), scale=.22)
    m.slot = 0


def compass(m, v=0):
    """A brass pocket compass, its lid open: a round case, a glass face over a red and silver
    needle, a ring to hang it by."""
    m.slot = 1
    m.lathe((0, 0, 0), [(0, .1), (.005, .118), (.03, .12), (.045, .11)], BRASS, n=14, jitter=0)
    m.slot = 0
    m.lathe((0, 0, .046), [(0, .098), (.002, .098)], CREAM, n=14, jitter=0)   # the dial
    for k in range(8):
        a = math.tau * k / 8
        m.box((math.cos(a) * .08, math.sin(a) * .08, .049), (.012 if k % 2 else .02, .004, .002), INK, tilt=a)
    m.box((0, .035, .052), (.016, .07, .006), WAX)       # the needle's north
    m.box((0, -.035, .052), (.016, .07, .006), SILVER)   # and its south
    m.lathe((0, 0, .05), [(0, .012), (.008, .012)], BRASS_DARK, n=6, jitter=0)
    m.slot = 2
    m.lathe((0, 0, .047), [(0, .1), (.006, .1)], GLASS, n=14, jitter=0)
    m.slot = 1
    # the lid, open, standing up behind it, and the ring
    m.lathe((0, .125, .03), [(0, .1), (.022, .1)], BRASS_DARK, n=14, jitter=0, axis=(0, 1, .25))
    m.ring((0, -.135, .03), .025, .008, BRASS, n=8, section=3)
    m.slot = 0


def journal(m, v=0):
    """A small leather journal, closed, its strap round it and a blue ribbon marker hanging out."""
    w, d, h = .24, .3, .07
    m.box((0, 0, .008), (w, d, .016), JOURNAL)              # the back cover
    m.box((.004, 0, h / 2), (w - .016, d - .02, h - .03), CREAM)   # the pages
    m.box((0, 0, h - .008), (w, d, .016), JOURNAL)           # the front cover
    m.box((-w / 2 + .01, 0, h / 2), (.02, d, h), JOURNAL_DARK)   # the spine
    m.box((.05, 0, h / 2), (.03, d + .006, h + .006), JOURNAL_DARK)   # the strap
    m.slot = 1
    m.box((.05, -d / 2 - .006, h / 2), (.04, .01, .03), BRASS)   # its buckle
    m.slot = 0
    m.box((-.03, -d / 2 - .03, .01), (.022, .07, .004), RIBBON, tilt=.2)
    m.box((-.02, .02, h + .001), (.06, .08, .002), JOURNAL_DARK)   # a worn patch on the cover


# Quest things made from the world's props (props.py, clutter_*.py, themes_*.py): the same
# builder as the prop that lies about as clutter, made small enough to carry, with a red bow
# and a paper tag tied on top, so a quest's thing never looks like the clutter round it (the
# game adds a gold glow). Any of them can be lost, gathered or carried (src/core/quests.js).
# (item id, the prop it is made from (or a builder of its own, where the prop is more than the
# thing: a lantern on its post, a wheel half in the sand), its variant)
QUEST_PROPS = [
    ('backpack', 'abandoned_pack', 0), ('shield', 'broken_shield', 0), ('lantern', 'carried_lantern', 0),
    ('pickaxe', 'loose_pickaxe', 0), ('flour_sack', 'sacks', 0), ('cider_barrel', 'barrel', 0),
    ('supply_crate', 'crate', 0), ('fireworks', 'dynamite_crate', 0), ('singing_crystal', 'crystal_cluster', 0),
    ('silver_bars', 'ingot_stack', 0), ('gears', 'gear_pile', 0), ('crucible', 'crucible', 0),
    ('toadstool', 'mushroom_small', 0), ('thunder_jar', 'storm_jar', 0), ('bird_nest', 'sky_nest', 0),
    ('rainbow_crystal', 'rainbow_crystal', 0), ('crab', 'crab', 0), ('ice_shard', 'ice_shard', 0),
    ('butter_lamps', 'butter_lamps', 0), ('prayer_stone', 'mani_stones', 0), ('wagon_wheel', 'loose_wagon_wheel', 0),
    ('horned_skull', 'bleached_skull', 0), ('pink_salt', 'pink_halite', 0), ('painted_pots', 'clay_pots', 0),
    ('paper_lantern', 'luminaria', 0), ('cave_mushrooms', 'mushroom_cluster', 0), ('ice_heart', 'ice_crystal', 0),
    ('pearl_clam', 'giant_clam', 0), ('sea_glass', 'sea_glass', 0), ('spore_pod', 'spore_pod', 0),
    ('pitcher_plant', 'pitcher_plant', 0), ('honey_pot', 'honey_pot', 0), ('candles', 'wax_candles', 0),
    ('jade_idol', 'jade_idol', 0), ('incense_bowl', 'copal_bowl', 0), ('spider_eggs', 'egg_sac', 0),
    ('bone_lantern', 'bone_lantern', 0), ('old_urn', 'funeral_urn', 0), ('stone_tablet', 'stone_tablet', 0),
    ('statue_head', 'statue_head', 0), ('fire_crystal', 'fire_crystal', 0), ('obsidian', 'obsidian_shard', 0),
    ('void_crystal', 'void_crystal', 0), ('rune_stone', 'rune_stone', 0),
]
QUEST_SIZE = .4         # the longest side of a quest thing made from a prop (cells, before the game's loot scale)
GLOW_SLOT = 3           # make_mesh: the faces that glow, in the prop's light colour
BOW = '#c8322f'
BOW_DARK = '#8e1f22'


def carried_lantern(m, v=0):
    """The mines' lantern (clutter_geo.lantern_body) off its post, with a ring to carry it by."""
    import clutter_geo
    clutter_geo.lantern_body(m, (0, 0, .2))
    m.ring((0, 0, .44), .05, .01, IRON, n=8, section=3, vertical=True, yaw=0)


def loose_pickaxe(m, v=0):
    """A miner's pickaxe lying on the ground (the one in clutter_depths.build_pickaxe_in_rock, out of
    its rock)."""
    m.tube([(-.22, 0, .03), (.2, 0, .03)], [.026, .022], WOOD, n=5)
    m.tube([(.2, -.24, .035), (.2, -.12, .05), (.2, 0, .055), (.2, .12, .05), (.2, .23, .03)],
           [.012, .035, .048, .035, .014], IRON, n=5)


def loose_wagon_wheel(m, v=0):
    """A wagon wheel with two spokes broken, leaning (clutter_surface.build_broken_wagon_wheel, out
    of the sand)."""
    import clutter_geo
    rim = .32
    m.ring((0, 0, 0), rim, .03, WOOD, n=12, section=4)
    m.lathe((0, 0, -.05), [(0, .06), (.1, .06)], BARK, n=6)
    for i in range(8):
        if i in (2, 3):
            continue
        a = math.tau * i / 8
        m.tube([props.polar(.05, a), props.polar(rim - .02, a)], .018, BARK, n=4)
    clutter_geo.xform(m, 0, rot=(1.2, 0, .3), offset=(0, 0, .12))


OWN_LIGHTS = {'carried_lantern': '#ffcf8a'}


def prop_builder(prop):
    """The builder of a world prop (or one of its own, above), and the colour of its light (None:
    it has none)."""
    import clutter, clutter_depths, clutter_surface, themes   # (Blender's modules: only when needed)
    if prop in OWN_LIGHTS or prop in ('loose_pickaxe', 'loose_wagon_wheel'):
        return globals()[prop], OWN_LIGHTS.get(prop)
    light = None
    for spec in props.SPECS:
        if spec[1] == prop:
            light = spec[6].get('light')
    for spec in clutter.SPECS + themes.SPECS:
        if spec[1] == prop:
            light = spec[5].get('light')
    for module in (props, clutter_surface, clutter_depths, *themes.BUILDERS):
        fn = getattr(module, 'build_' + prop, None)
        if fn:
            return fn, light
    raise KeyError('no builder for ' + prop)


def bow_and_tag(m, top):
    """A red bow tied on at `top`, two loops and two tails, and a paper tag on a string."""
    x, y, z = top
    m.slot = 0
    m.blob((x, y, z + .015), (.022, .02, .018), BOW_DARK, n=6, jitter=0)   # the knot
    for side in (-1, 1):
        m.ring((x + side * .036, y, z + .03), .03, .009, BOW, n=8, section=3, vertical=True, yaw=0, ellipse=.7)
        m.leaf((x + side * .008, y - .01, z + .012), (x + side * .05, y - .05, z - .03), .014, BOW)
    # the tag on its string, hanging off the front
    tz = max(z - .07, .036)   # (on something flat the tag lies on the ground in front)
    m.tube([(x + .01, y - .015, z + .01), (x + .03, y - .05, (z + tz) / 2), (x + .045, y - .07, tz + .025)], .003, TWINE, n=3)
    m.box((x + .05, y - .075, tz), (.05, .006, .07), PAPER, tilt=.25)
    m.box((x + .05, y - .079, tz + .025), (.03, .002, .006), INK, tilt=.25)


def quest_prop(m, v=0):
    """A world prop as a quest thing (QUEST_PROPS): made small (QUEST_SIZE), its glowing faces
    on GLOW_SLOT, a bow and a tag on its top."""
    _, prop, variant = QUEST_PROPS[v]
    build_prop, m.glow = prop_builder(prop)
    m.anchors = []   # (string anchors some builders note: not needed here)
    build_prop(m, variant)
    for i, lit in enumerate(m.glows):
        if lit:
            m.slots[i] = GLOW_SLOT
    lo = [min(p[k] for p in m.vertices) for k in range(3)]
    hi = [max(p[k] for p in m.vertices) for k in range(3)]
    s = QUEST_SIZE / max(b - a for a, b in zip(lo, hi))
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    m.vertices = [((x - cx) * s, (y - cy) * s, (z - lo[2]) * s) for x, y, z in m.vertices]
    # the bow sits on the highest point near the middle (else the highest of all)
    reach = .3 * QUEST_SIZE
    near = [p for p in m.vertices if math.hypot(p[0], p[1]) < reach] or m.vertices
    top = max(near, key=lambda p: p[2])
    bow_and_tag(m, (top[0], top[1], top[2]))


# Headwear for the people out in the world (src/core/npcs.js), around the head's centre like
# the others (HEAD_R, the face towards -Y)
HOOD = '#6b5a45'
HOOD_DARK = '#54463a'
HELMET = '#d8a93a'
HELMET_DARK = '#a37d2a'
LAMP = '#fff0b0'
FELT = '#7a5b3e'
FELT_DARK = '#5b4430'
STRAW = '#d9bf78'
STRAW_DARK = '#b89a55'


def hood(m, v=0):
    """A pilgrim's hood: rough cloth over the head down to the neck and shoulders, open round the
    face, its point falling back over the nape."""
    def edge(phi):   # how far down it reaches (from straight up) all round: low at the back, the face open
        front = (1 + math.cos(phi)) / 2   # 1 at the face, 0 at the back
        return math.radians(150 - 95 * front ** 1.5)
    n, rows, r = 24, 8, HEAD_R + .03
    grid = []
    for j in range(rows + 1):
        row = []
        for i in range(n):
            phi = math.tau * i / n
            theta = max(.06, edge(phi) * j / rows)
            flare = 1 + .25 * max(0, theta - math.radians(95))   # it widens over the shoulders
            p = on_sphere((0, 0, 0), r * flare, phi, theta)
            row.append((p, p.normalized()))
        grid.append(row)
    sheet(m, grid, .03, lambda i, j: HOOD_DARK if j == rows - 1 else HOOD, closed=True)
    # the hem round the face, and the point falling back
    hem = [on_sphere((0, 0, 0), r + .02, math.tau * i / n, edge(math.tau * i / n)) for i in range(-4, 5)]
    m.slot = TRIM
    m.tube(hem, .02, HOOD_DARK, n=5)
    m.slot = 0
    top = on_sphere((0, 0, 0), r + .02, math.pi, math.radians(40))
    m.tube([top, top + Vector((0, .1, -.04)), top + Vector((0, .17, -.16))], [.07, .045, .015], HOOD, n=6)


def miner_helmet(m, v=0):
    """A miner's helmet: a hard yellow dome with a ridge over the top, a short brim, and a lamp
    on the front."""
    base = .02
    m.lathe((0, 0, base), [(0, HEAD_R + .04), (.05, HEAD_R + .035), (.14, HEAD_R - .01), (.22, .16), (.28, .07), (.3, 0)],
            HELMET, n=16, jitter=0, colors=[HELMET, HELMET, HELMET_DARK, HELMET])
    m.lathe((0, 0, base - .015), [(0, HEAD_R + .09), (.025, HEAD_R + .085), (.035, HEAD_R + .03)], HELMET_DARK, n=16, jitter=0)
    m.slot = TRIM
    m.tube([(0, -.22, base + .17), (0, -.12, base + .27), (0, 0, base + .31), (0, .12, base + .27), (0, .22, base + .17)],
           .024, HELMET_DARK, n=5)   # the ridge
    m.slot = 1
    lamp = Vector((0, -HEAD_R - .05, base + .12))
    m.lathe(lamp + Vector((0, .04, 0)), [(0, .05), (.06, .05), (.07, .055)], IRON, n=10, jitter=0, axis=(0, -1, 0))
    m.slot = 2
    m.lathe(lamp + Vector((0, -.03, 0)), [(0, .045), (.008, .045)], LAMP, n=10, jitter=0, axis=(0, -1, 0))
    m.slot = 0


def explorer_hat(m, v=0):
    """An explorer's felt hat: a wide brim turned up at one side, a dented crown, a band with a
    feather."""
    base = .12
    m.lathe((0, 0, base), [(-.015, .44), (0, .45), (.012, .43), (.02, .25)], FELT_DARK, n=18, jitter=0)
    start = len(m.vertices)
    m.lathe((0, 0, base), [(.01, .25), (.12, .24), (.2, .2), (.24, .12), (.25, 0)], FELT, n=14, jitter=0)
    for i in range(start, len(m.vertices)):   # the dent along the top
        x, y, z = m.vertices[i]
        if z > base + .2:
            m.vertices[i] = (x, y, z - .04 * max(0, 1 - abs(x) / .08))
    for i in range(start - 18 * 4, start):   # the brim turned up on the left
        x, y, z = m.vertices[i]
        if x < -.25:
            m.vertices[i] = (x, y, z + (-.25 - x) * .7)
    m.slot = TRIM
    m.lathe((0, 0, base + .01), [(0, .255), (.05, .245)], '#3d2d22', n=14, jitter=0)
    m.slot = 0
    m.leaf(Vector((.2, .1, base + .04)), Vector((.3, .26, base + .2)), .035, '#c8553a')


def straw_hat(m, v=0):
    """A trapper's wide straw hat: a low crown, a broad flat brim woven in rings, a cord band."""
    base = .13
    m.lathe((0, 0, base), [(-.012, .5), (.004, .5), (.02, .45), (.03, .26)], STRAW, n=20, jitter=.01,
            colors=[STRAW, STRAW_DARK, STRAW])
    for rr in (.32, .41):   # the woven rings on the brim
        m.ring((0, 0, base + .025 - (rr - .3) * .1), rr, .007, STRAW_DARK, n=20, section=3)
    m.lathe((0, 0, base + .02), [(0, .26), (.1, .25), (.15, .2), (.17, .1), (.18, 0)], STRAW, n=14, jitter=.02)
    m.slot = TRIM
    m.lathe((0, 0, base + .03), [(0, .265), (.035, .26)], '#7a4a2a', n=14, jitter=0)
    m.slot = 0


# (name, builder, variant, category, attachment)
SPECS = [(f'item_stick_{s}', stick, i, 'resource', 'ground')
         for i, s in enumerate(('short', 'forked', 'long'))] + [
    (f'item_coin_{s}', coin, i, 'currency', 'ground') for i, s in enumerate(('gold', 'silver', 'copper'))] + [
    (f'item_crystal_{s}', gem, i, 'gem', 'ground')
    for i, s in enumerate(('ruby', 'diamond', 'emerald', 'sapphire', 'amethyst'))] + [
    (f'weapon_sword_{s}', sword, i, 'weapon', 'hand')
    for i, s in enumerate(('short', 'medium', 'long', 'broad', 'greatsword'))] + [
    (f'weapon_bow_{b[0]}', bow, i, 'weapon', 'hand') for i, b in enumerate(BOWS)] + [
    (f'weapon_crossbow_{c[0]}', crossbow, i, 'weapon', 'hand') for i, c in enumerate(CROSSBOWS)] + [
    (f'weapon_staff_{s[0]}', staff, i, 'weapon', 'hand') for i, s in enumerate(STAFFS)] + [
    (f'weapon_staff_{s[0]}', bolt_staff, i, 'weapon', 'hand') for i, s in enumerate(BOLT_STAFFS)] + [
    (f'weapon_trident_{t[0]}', trident, i, 'weapon', 'hand') for i, t in enumerate(TRIDENTS)] + [
    (f'weapon_flail_{f[0]}', flail, i, 'weapon', 'hand') for i, f in enumerate(FLAILS)] + [
    ('weapon_arrow', arrow, 0, 'ammunition', 'nock'),
    ('weapon_bolt', bolt, 0, 'ammunition', 'nock'),
    *[(f'item_potion_{p}', potion, i, 'consumable', 'ground') for i, p in enumerate(POTIONS)],
    *[(f'item_flask_{f}', flask, i, 'consumable', 'ground') for i, f in enumerate(FLASKS)],
    ('treasure_chest', chest, 0, 'container', 'ground'),
    ('item_town_portal', scroll, 0, 'tool', 'ground'),
    ('item_room_portal', scroll, 1, 'tool', 'ground')] + [
    ('wear_headscarf', headscarf, 0, 'wearable', 'head'),
    ('wear_welding_mask', welding_mask, 0, 'wearable', 'head'),
    ('wear_wizard_hat', wizard_hat, 0, 'wearable', 'head'),
    ('held_towel', towel, 0, 'held', 'hand'),
    ('held_crystal_ball', crystal_ball, 0, 'held', 'hand'),
    ('held_rope', rope, 0, 'held', 'hand'),
    ('held_hammer', hammer, 0, 'held', 'hand'),
    ('held_pliers', pliers, 0, 'held', 'hand'),
    ('held_feed_bag', feed_bag, 0, 'held', 'hand'),
    ('wear_hood', hood, 0, 'wearable', 'head'),
    ('wear_miner_helmet', miner_helmet, 0, 'wearable', 'head'),
    ('wear_explorer_hat', explorer_hat, 0, 'wearable', 'head'),
    ('wear_straw_hat', straw_hat, 0, 'wearable', 'head')] + [
    (f'quest_{q}', builder, 0, 'quest', 'ground') for q, builder in (
        ('locket', locket), ('toy_rabbit', toy_rabbit), ('letter', letter), ('parcel', parcel),
        ('map_scrap', map_scrap), ('ring', ring_item), ('compass', compass), ('journal', journal))] + [
    (f'quest_{q[0]}', quest_prop, i, 'quest', 'ground') for i, q in enumerate(QUEST_PROPS)] + [
    (name, builder, 0, 'armor', 'body') for name, builder, _ in armor.ARMOR]
ARMOR_EXTRAS = {name: extras for name, _, extras in armor.ARMOR}


def build(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get(COLLECTION) or bpy.data.collections.new(COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for name, builder, v, category, attach in SPECS:
        seed = 4721 + int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], 'big')
        m = Mesh(seed)
        builder(m, v)
        info = {'category': category, 'attach': attach, 'blocking': category == 'container',
                'units': 'character_rig' if attach != 'ground' else 'cells',
                'game_scale': .55 if attach != 'ground' else 1.0, 'front': '+Z'}
        if category == 'weapon':
            kind = {sword: 'sword', bow: 'bow', crossbow: 'crossbow', staff: 'staff', bolt_staff: 'staff', trident: 'trident',
                    flail: 'flail'}[builder]
            socket, quat = MOUNTS[kind]
            info.update(weapon=kind, socket=socket, mount_quat_gltf=[round(c, 6) for c in quat],
                        grip_angle_blender=-math.pi / 6 if builder == sword else 0,
                        axis_gltf='+Y', axis_blender='+Z', attack_clip=CLIPS[kind])
            if builder == sword:
                info.update(blade_tip=[.64, .9, 1.2, .92, 1.47][v])
            if builder == bow:
                tip, nock = bow_tips(v)
                info.update(forward_gltf='+X', nock_gltf=gltf(nock), string_tip_gltf=gltf(tip), parts='string')
            if builder == crossbow:
                tip, rest, latch = crossbow_string(v)
                info.update(forward_gltf='+Y', top_gltf='+Z', string_tip_gltf=gltf(tip), string_rest_gltf=gltf(rest),
                            string_latch_gltf=gltf(latch), muzzle_gltf=gltf((0, STOCK_Y - .053, CROSSBOWS[v][2] + .06)),
                            parts='string,bolt')
            if builder == staff:
                info.update(head_gltf=gltf(staff_head(v)))
            if builder == bolt_staff:
                info.update(head_gltf=gltf(BOLT_HEAD))
            if builder == trident:   # where its lightning leaves, between the prongs
                info.update(head_gltf=gltf((0, 0, TRIDENT_TIP - .14)))
            if builder == flail:
                # the chains' anchor, how long each is, how far apart its links are, where the first
                # link's middle is; for each ball (flattened) the end of its chain (the ball's pivot)
                # and from there to its middle, as modelled
                links, radius, balls = FLAILS[v][2], FLAILS[v][3], FLAILS[v][4]
                info.update(anchor_gltf=gltf(flail_anchor(v)), chain_length=round(links * PITCH, 4), link_pitch=PITCH,
                            link_gltf=gltf(Vector(flail_anchor(v)) + Vector((0, 0, PITCH * .5))), balls=balls,
                            ball_ends_gltf=[c for i in range(balls) for c in gltf(flail_chain(v, i)[1])],
                            ball_offsets_gltf=[c for i in range(balls) for c in gltf(flail_chain(v, i)[2] * (EYE + radius))],
                            parts=','.join(['link', 'chain'] + ['ball' if i == 0 else f'ball{i + 1}' for i in range(balls)]))
        if builder in (arrow, bolt):
            info.update(axis_gltf='+Y', axis_blender='+Z')
        if name in WEARS:
            socket, quat, offset, hold = WEARS[name]
            info.update(slot=SLOTS[socket], socket=socket, mount_quat_gltf=[round(c, 6) for c in quat],
                        mount_offset_gltf=[round(c, 6) for c in offset])
            if hold:
                info['hold'] = hold
            if builder == crystal_ball:
                info['float'] = BALL_FLOAT
        if category == 'armor':   # in the character's space; a part on each bone it follows (armor.py)
            info.update(ARMOR_EXTRAS[name], slot=name.split('_')[1], units='character_rig', game_scale=.55)
        if builder == potion:
            info['potion_type'] = POTIONS[v]
        if builder == flask:
            # in the right fist by the neck, like a staff (character.py HoldThrow, Throw)
            q, offset = flask_mount()
            info.update(potion_type=FLASKS[v], weapon='throw', socket='hand.R', attack_clip='Throw', hold='throw',
                        mount_quat_gltf=[round(c, 6) for c in (q.x, q.y, q.z, q.w)],
                        mount_offset_gltf=[round(c, 6) + 0.0 for c in offset], mount_scale=FLASK_SCALE)
        if builder == chest:
            # glTF (Y up): the lid's clips, its hinge, and the floor where contents go
            hinge = [CHEST_HINGE[0], CHEST_HINGE[2], -CHEST_HINGE[1]]
            info.update(clips='Open,Close', lid=name + '_lid', hinge_gltf=hinge,
                        contents_gltf=[0, .118, 0], contents_size_gltf=[.84, .49])
        obj = finish(m, name, info, collection)
        if builder == chest:
            lid_clips(obj.children[0])
        objects.append(obj)
    return objects


def validate(objects):
    assert len(objects) == len(SPECS) == 82 + len(QUEST_PROPS) + len(armor.ARMOR)
    assert {o.name for o in objects} == {s[0] for s in SPECS}
    report = []
    for obj in objects:
        assert obj.parent is None
        triangles = 0
        for part in [obj] + list(obj.children):
            mesh = part.data
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            assert not part.modifiers and not part.constraints and (part == obj or not part.children)
            assert tuple(part.scale) == (1, 1, 1) and tuple(part.rotation_euler) == (0, 0, 0)
            assert part == obj or part.get('cube_crawler_part')
            assert not mesh.uv_layers and 'Color' in mesh.color_attributes
            assert not any(p.use_smooth for p in mesh.polygons)
            assert all(math.isfinite(c) for v in mesh.vertices for c in v.co)
            for tri in mesh.loop_triangles:
                a, b, c = (mesh.vertices[i].co for i in tri.vertices)
                assert (b - a).cross(c - a).length > 1e-10, part.name
        assert 20 <= triangles <= 5000, (obj.name, triangles)
        vertices = part_vertices(obj)
        lo = [min(v[i] for v in vertices) for i in range(3)]
        hi = [max(v[i] for v in vertices) for i in range(3)]
        if obj['attach'] in ('ground', 'nock'):
            assert abs(lo[2]) < 1e-6, (obj.name, lo)
        elif obj['attach'] == 'hand':
            assert lo[2] < 0 < hi[2] or obj['category'] == 'held', obj.name
        elif obj['attach'] == 'body':   # armor: every part says its bone
            assert all(p.get('bone') for p in [obj] + list(obj.children)), obj.name
        obj['radius'] = round(max(math.hypot(v.x, v.y) for v in vertices), 4)
        report.append({'name': obj.name, 'triangles': triangles,
                       'size': [round(b - a, 4) for a, b in zip(lo, hi)],
                       'bounds_blender': [lo, hi], 'attach': obj['attach'],
                       'category': obj['category'], 'units': obj['units'], 'game_scale': obj['game_scale'],
                       'glb': f'items/{obj.name}.glb'})
    return report


def export(objects, directory, only=None):
    directory = Path(directory).resolve()
    (directory / 'items').mkdir(parents=True, exist_ok=True)
    report = validate(objects)
    props.export_gltf(objects, directory / 'items.glb', animations=True)
    for obj in objects:
        if not only or obj.name.startswith(only):
            props.export_gltf([obj], directory / 'items' / (obj.name + '.glb'), animations=True)
    (directory / 'items' / 'manifest.json').write_text(json.dumps(
        {'up': 'Y', 'weapon_scale': .55, 'assets': report}, indent=2) + '\n')
    return report


def setup_preview(scene, objects):
    preview = bpy.data.collections.new('ItemsPreview_NOT_EXPORTED')
    scene.collection.children.link(preview)

    def link(name, data):
        obj = bpy.data.objects.new(name, data)
        preview.objects.link(obj)
        return obj

    # Each item has its own plinth; all meshes retain their authoring scale. A row per weapon
    # family, the worn things, the potions (health and the old ones, then the rest and the
    # flasks), then the rest.
    groups = [[o for o in objects if o.name.startswith(p + '_')]
              for p in ('weapon_sword', 'weapon_bow', 'weapon_crossbow', 'weapon_staff', 'weapon_trident', 'weapon_flail')]
    groups.append([o for o in objects if o.name.startswith(('wear_', 'held_'))])
    groups += [[o for o in objects if o.name.startswith(f'armor_{s}_')] for s in ('head', 'body', 'shield', 'feet')]
    groups.append([o for o in objects if o.name.startswith(('item_potion_health', 'item_potion_mana', 'item_potion_stamina'))])
    groups.append([o for o in objects if o.name.startswith(('item_potion_', 'item_flask_')) and not any(o in g for g in groups)])
    rest = [o for o in objects if not any(o in g for g in groups) and not o.name.startswith('quest_')]
    groups += [rest[:8], rest[8:]]
    # the quest things in a block of their own to the right, eight a row
    quests = [o for o in objects if o.name.startswith('quest_')]
    rows = len(groups)
    groups += [quests[i:i + 8] for i in range(0, len(quests), 8)]
    labels = {'weapon_sword_greatsword': 'GREATSWORD', 'treasure_chest': 'CHEST',
              'item_town_portal': 'TOWN PORTAL', 'item_room_portal': 'ROOM PORTAL'}
    for row, group in enumerate(groups):
        for i, obj in enumerate(group):
            x, y = (i - (len(group) - 1) / 2) * 1.6 + (-9 if row < rows else 11.5), ((rows - 1) / 2 - row % rows) * 2.9
            low = min(v.co.z for v in obj.data.vertices)
            obj.location = (x, y, .085 - low)
            platform = bpy.data.meshes.new('ItemPlinth')
            pm = props.Mesh(random.Random(1))
            pm.box((x, y, .02), (1.4, 1.62, .10), '#c3c4b0')
            platform.from_pydata(pm.vertices, [], pm.faces)
            platform.materials.append(town.plain_material('ItemsPreviewPlinth', '#c3c4b0'))
            link('Plinth_' + obj.name, platform)
            label = labels.get(obj.name, obj.name.replace('weapon_', '').replace('item_', '').replace('quest_', '').replace('_', ' ').upper())
            data = bpy.data.curves.new('Label_' + obj.name, 'FONT')
            data.body, data.align_x, data.size = label, 'CENTER', .105
            data.materials.append(town.plain_material('ItemsPreviewInk', '#4f554e'))
            text = link('Label_' + obj.name, data)
            text.location = (x, y - .67, .079)
    mesh = bpy.data.meshes.new('ItemsPreviewFloor')
    mesh.from_pydata([(-200, -200, -.04), (200, -200, -.04), (200, 200, -.04), (-200, 200, -.04)], [], [(0, 1, 2, 3)])
    mesh.materials.append(town.plain_material('ItemsPreviewFloor', '#abafa0'))
    link('ItemsFloor_NOT_EXPORTED', mesh)
    cam = link('ItemsCamera', bpy.data.cameras.new('ItemsCamera'))
    cam.location = (3, -12, 14)
    town.aim(cam, (0, 0, .35))
    cam.data.type, cam.data.ortho_scale = 'ORTHO', 56
    scene.camera = cam
    for name, pos, power, size in [('ItemsKey', (-3, -5, 10), 1500, 7),
                                  ('ItemsFill', (7, -1, 8), 900, 6), ('ItemsRim', (0, 6, 9), 1100, 5)]:
        obj = link(name, bpy.data.lights.new(name, 'AREA'))
        obj.location, obj.data.energy, obj.data.size = pos, power, size
        town.aim(obj, (0, 0, 0))
    world = bpy.data.worlds.new('ItemsWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.65, .72, .80, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.world = world
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = OVERVIEW + (100,)
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.compression = 100
    scene.view_settings.view_transform = 'AgX'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.region_3d.view_camera_zoom = 20
                area.spaces.active.shading.type = 'MATERIAL'
                area.spaces.active.shading.use_scene_world = True
                area.spaces.active.shading.use_scene_lights = True
                area.spaces.active.overlay.show_overlays = False
    return preview


# how big the pictures are (pixels): the overview (portrait: a row per group), each item's icon
# (the kids' guide shows them small)
OVERVIEW = (1600, 1000)
ICON = 256


def render_previews(scene, objects, preview, directory, overview=True, previews=None, only=None):
    """Overview into previews (default: directory); icons into directory/items."""
    directory = Path(directory)
    overview_path = Path(previews or directory) / 'items-preview.png'
    cam = scene.camera
    saved = (cam.location.copy(), cam.rotation_euler.copy(), cam.data.ortho_scale)
    if overview:
        overview_path.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(overview_path)
        # the overview shows the chest open (and empty); the icons show it closed
        lids = [c for o in objects for c in o.children if c.animation_data]
        for lid in lids:
            lid.rotation_euler.x = math.radians(CHEST_CLIPS['Open'][-1][1])
        try:
            bpy.ops.render.render(write_still=True)
        finally:
            for lid in lids:
                lid.rotation_euler.x = 0
    decorations = [o for o in preview.objects if o.type == 'FONT' or o.name.startswith('Plinth_')]
    floor = next(o for o in preview.objects if o.name == 'ItemsFloor_NOT_EXPORTED')
    floor_location = floor.location.copy()
    report = validate(objects)
    before = (scene.render.film_transparent, scene.render.image_settings.color_mode)
    try:
        # Replace the hidden plinths with a contact plane for individual renders. The icons are cut
        # out: no background, the floor only catching the item's shadow (the guide shows them on
        # its own glass, learn/kids.css).
        floor.location.z = .125
        floor.is_shadow_catcher = True
        scene.render.film_transparent = True
        scene.render.image_settings.color_mode = 'RGBA'
        for obj in decorations:
            obj.hide_render = True
        scene.render.resolution_x = scene.render.resolution_y = ICON
        for obj, item in zip(objects, report):
            if only and not obj.name.startswith(only):
                continue
            for other in objects:
                for part in [other] + list(other.children):
                    part.hide_render = other != obj
            lo, hi = [Vector(v) for v in item['bounds_blender']]
            target = obj.location + (lo + hi) * .5
            cam.location = target + Vector((2.0, -5, 3.0))
            town.aim(cam, target)
            cam.data.ortho_scale = max(item['size']) * 1.6
            scene.render.filepath = str(directory / 'items' / (obj.name + '.png'))
            bpy.ops.render.render(write_still=True)
    finally:
        for obj in objects + decorations + [c for o in objects for c in o.children]:
            obj.hide_render = False
        floor.location = floor_location
        floor.is_shadow_catcher = False
        scene.render.film_transparent, scene.render.image_settings.color_mode = before
        cam.location, cam.rotation_euler, cam.data.ortho_scale = saved
        scene.render.resolution_x, scene.render.resolution_y = OVERVIEW
        scene.render.filepath = str(overview_path)


def main(directory=None, render=True, only=None):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.new('ItemsShowroom')
    if bpy.context.window:
        bpy.context.window.scene = scene
    objects = build(scene)
    report = export(objects, directory, only)
    preview = setup_preview(scene, objects)
    bpy.ops.object.select_all(action='DESELECT')
    objects[12].select_set(True)
    bpy.context.view_layer.objects.active = objects[12]
    bpy.ops.wm.save_as_mainfile(filepath=str(blends / 'items.blend'))
    if render:
        render_previews(scene, objects, preview, directory, previews=previews, only=only)
    return report


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    if '--only' in args:
        i = args.index('--only')
        only = args[i + 1]
        del args[i:i + 2]
    if len(args) > 1:
        raise SystemExit('Usage: Blender -b --python blender/items.py -- [output-directory] [--only PREFIX]')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(json.dumps(main(args[0] if args else None, only=only), indent=2))
