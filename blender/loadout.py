"""
The player with each kind of weapon: a lineup of the attack clips' key frames, the weapon
mounted in the fist the way the game mounts it (items.MOUNTS, render/character.js).

Rows: sword (Slash), bow (Shoot), crossbow (HoldCrossbow, CrossbowShot), staff (HoldStaff,
Cast; a lightning staff too), trident (HoldTrident, Thrust, and Cast: its lightning), a throwing flask (HoldThrow, Throw; held by the neck, items.flask_mount). Each figure is a copy of the rig playing its clip at one frame (an NLA strip offset).
A last image shows the town's villagers (src/world/town.js VILLAGERS) standing in their hold
poses, tinted, wearing and holding their things (items.WEARS) the way render/figure.js mounts
them. Nothing is exported; this is for checking poses, grips and aim.

    Blender -b --python blender/loadout.py -- [directory] [--side | --top] [--villagers]

One image per weapon kind, <directory>/loadout-<kind>-<view>.png, and
<directory>/loadout-villagers-<view>.png (default directory: blender/previews/; view: front by
default, --side from the right, --top from above like the game camera; --villagers: only
the villagers).

    Blender -b --python blender/loadout.py -- --mounts

prints the mounts for items.MOUNTS (weapons) and items.WEARS (worn and held things).
"""
from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Matrix, Vector

import character
import items

HERE = Path(__file__).resolve().parent
SCENE_FRAME = 200

# (weapon, [(clip, frame), ...]) per row
ROWS = [
    ('weapon_sword_medium', [('Slash', 0), ('Slash', 10), ('Slash', 15), ('Slash', 18), ('Slash', 24)]),
    ('weapon_bow_recurve', [('HoldBow', 0), ('Shoot', 7), ('Shoot', 13), ('Shoot', 18), ('Shoot', 21), ('Shoot', 26)]),
    ('weapon_crossbow_light', [('HoldCrossbow', 0), ('CrossbowShot', 6), ('CrossbowShot', 9), ('CrossbowShot', 12),
                               ('CrossbowShot', 19), ('CrossbowShot', 23), ('CrossbowShot', 27)]),
    ('weapon_staff_arcane', [('HoldStaff', 0), ('Cast', 7), ('Cast', 12), ('Cast', 16), ('Cast', 22)]),
    ('weapon_staff_lightning', [('HoldStaff', 0), ('Cast', 7), ('Cast', 12), ('Cast', 16), ('Cast', 22)]),
    ('weapon_trident_sea', [('HoldTrident', 0), ('Thrust', 4), ('Thrust', 7), ('Thrust', 11), ('Thrust', 13), ('Thrust', 17),
                            ('Thrust', 22)]),
    ('item_flask_fire', [('HoldThrow', 0), ('Throw', 4), ('Throw', 8), ('Throw', 12), ('Throw', 17), ('Throw', 22)]),
]


# the villagers of src/world/town.js (VILLAGERS there): their clay tint and outfit
VILLAGERS = [
    ('innkeeper', '#d9b48c', ['held_towel']),
    ('groom', '#b9c79a', ['held_rope']),
    ('smith', '#c99a86', ['wear_welding_mask', 'held_hammer', 'held_pliers']),
    ('keeper', '#e0c7a0', ['held_feed_bag']),
    ('alchemist', '#b8b0d8', ['wear_wizard_hat']),
    ('enchanter', '#9fc3c9', ['wear_headscarf', 'held_crystal_ball']),
]


def weapon_kind(name):
    if name in items.WEARS:
        return name
    if name.startswith('item_flask_'):
        return 'throw'
    return next(k for k in ('sword', 'bow', 'crossbow', 'staff', 'trident') if name.startswith('weapon_' + k))


def mount(rig, weapon, kind):
    """A copy of `weapon` (and its parts) in the rig's socket for `kind` (a weapon kind, or the
    name of a worn or held thing)."""
    socket = items.WEARS[kind][0] if kind in items.WEARS else 'hand.R' if kind == 'throw' else items.MOUNTS[kind][0]
    obj = weapon.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    for child in weapon.children:
        c = child.copy()
        bpy.context.scene.collection.objects.link(c)
        c.parent = obj
        c.hide_render = False
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = socket
    obj.matrix_parent_inverse = Matrix.Identity(4)
    # Blender bone parenting is tail-relative; the game's socket is the bone's head
    obj.matrix_basis = Matrix.Translation((0, -rig.data.bones[socket].length, 0)) @ items.mount_matrix(kind)
    return obj


# where each kind's mount is solved: the clip and frame, and how the weapon should lie in the
# armature there (its glTF +Y and +Z axes): the bow upright, belly forward, at the loose; the
# crossbow level and pointing ahead at the shot; the staff upright in the hold
AIMS = {
    'bow': ('Shoot', 18, 'hand.L', (0, 0, 1), (-1, 0, 0)),
    'crossbow': ('CrossbowShot', 9, 'hand.R', (0, -1, 0), (0, 0, 1)),
    'staff': ('HoldStaff', 0, 'hand.R', (0, 0, 1), (0, -1, 0)),
}


# Where each worn or held thing's mount is solved: the clip (None: the rest pose), how two of
# its glTF axes should point in the armature there and where its origin goes, from the socket
# bone's head (the fist, or the head bone's root). An axis is a vector, or a sum of terms:
# vectors, 'forearm' (along the forearm, out of the fist), 'out' (away from the body on the
# hand's side), negated with a leading '-'. Headwear sits upright on the head's
# centre; the towel lies over the wrist, the crystal ball floats over the fist, the others hang
# from or stand up out of it (the rope's coil turned half towards the front, so it shows from
# the game's camera).
UP, FORWARD = (0, 0, 1), (0, -1, 0)
WEAR_AIMS = {
    'wear_headscarf': (None, {'y': UP, 'z': FORWARD}, ('head', (0, 0, 0))),
    'wear_welding_mask': (None, {'y': UP, 'z': FORWARD}, ('head', (0, 0, 0))),
    'wear_wizard_hat': (None, {'y': UP, 'z': FORWARD}, ('head', (0, 0, 0))),
    'held_towel': ('HoldTowel', {'y': UP, 'z': ('-forearm',)}, ('forearm', -.11)),
    'held_crystal_ball': ('HoldOrb', {'y': UP, 'z': FORWARD}, ('up', items.BALL_FLOAT)),
    'held_rope': ('HoldRope', {'y': UP, 'z': ('out', FORWARD)}, None),
    'held_hammer': ('HoldHammer', {'y': (0, -.45, 1), 'x': FORWARD}, None),
    'held_pliers': ('HoldPliers', {'y': (0, -.45, 1), 'z': FORWARD}, None),
    'held_feed_bag': ('HoldFeed', {'y': UP, 'z': FORWARD}, None),
}


def frame_of(axes):
    """A rotation matrix (columns: the item's glTF x y z) from two of its axes; the first one
    given is kept exactly, the second is made square to it."""
    (a, va), (b, vb) = list(axes.items())
    va, vb = Vector(va).normalized(), Vector(vb)
    vb = (vb - va * vb.dot(va)).normalized()
    cols = {a: va, b: vb}
    c = next(k for k in 'xyz' if k not in cols)
    # right-handed: x = y × z, y = z × x, z = x × y
    cols[c] = va.cross(vb) if (a, b) in (('y', 'z'), ('z', 'x'), ('x', 'y')) else vb.cross(va)
    return Matrix((cols['x'], cols['y'], cols['z'])).transposed()


def solve_wear(rig, name):
    """(rotation glTF x y z w, offset) of a worn or held thing, as WEAR_AIMS says."""
    clip, axes, place = WEAR_AIMS[name]
    bone = items.WEARS[name][0]
    if clip:
        rig.animation_data.action = bpy.data.actions[clip]
        bpy.context.scene.frame_set(0)
        m = rig.pose.bones[bone].matrix
    else:
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        bpy.context.view_layer.update()
        m = rig.data.bones[bone].matrix_local
    rot = m.to_3x3()
    forearm = rot @ Vector((0, 1, 0))
    side = 1 if bone.endswith('.L') else -1

    def direction(d):
        if all(isinstance(c, (int, float)) for c in d):
            return Vector(d)
        out = Vector()
        for term in d:   # a sum of named directions and vectors
            if isinstance(term, str):
                sign = -1 if term.startswith('-') else 1
                out += sign * (forearm if term.lstrip('-') == 'forearm' else Vector((side, 0, 0)))
            else:
                out += Vector(term)
        return out
    want = frame_of({k: direction(v) for k, v in axes.items()})
    q = (rot.transposed() @ want).to_quaternion()
    offset = Vector()
    if place:
        kind, value = place
        if kind == 'head':
            offset = Vector((0, 0, character.figure.HEAD_Z)) - m.translation
        elif kind == 'forearm':
            offset = forearm * value
        else:
            offset = Vector((0, 0, value))
    local = rot.transposed() @ offset
    return (tuple(round(c, 4) + 0.0 for c in (q.x, q.y, q.z, q.w)),
            tuple(round(c, 4) + 0.0 for c in local))


def solve_mounts(rig):
    """Mount rotations (glTF x y z w) that put each weapon as AIMS says; for items.MOUNTS."""
    out = {}
    for kind, (clip, frame, bone, y, z) in AIMS.items():
        rig.animation_data.action = bpy.data.actions[clip]
        bpy.context.scene.frame_set(frame)
        bone_rot = rig.pose.bones[bone].matrix.to_3x3()
        y, z = Vector(y).normalized(), Vector(z).normalized()
        want = Matrix((y.cross(z), y, z)).transposed()   # columns: the weapon's glTF axes
        q = (bone_rot.transposed() @ want).to_quaternion()
        out[kind] = (round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4))
    return out


def fcurves(act):
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def pose_from(rig, clip, frame=0, bones=None):
    """Pose rig's bones (only `bones`, if given) as `clip` has them at `frame`."""
    for fc in fcurves(bpy.data.actions[clip]):
        if not fc.data_path.startswith('pose.bones["'):
            continue
        name = fc.data_path.split('"')[1]
        if bones and name not in bones:
            continue
        prop = fc.data_path.rsplit('.', 1)[1]
        getattr(rig.pose.bones[name], prop)[fc.array_index] = fc.evaluate(frame)


def villager_at(rig, mesh, outfit, location, tint):
    """A still copy of the rig: standing (the first frame of Jump), each held thing's arm in its
    Hold pose, the body tinted, the outfit mounted."""
    r, m = rig.copy(), mesh.copy()
    for o in (r, m):
        bpy.context.scene.collection.objects.link(o)
        o.hide_render = False
    m.parent = r
    m.modifiers['Armature'].object = r
    r.location = location
    r.animation_data_clear()
    pose_from(r, 'Jump', 0)
    for name in outfit:
        hold = items.WEARS[name][3]
        if hold:
            side = items.WEARS[name][0][-1]
            pose_from(r, 'Hold' + hold.capitalize(), 0, {f'upper_arm.{side}', f'forearm.{side}'})
    m.data = m.data.copy()
    body = bpy.data.materials.new('LoadoutVillager')
    body.use_nodes = True
    body.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*items.props.linear(tint), 1)
    m.data.materials.clear()
    m.data.materials.append(body)
    return r


def figure_at(rig, mesh, clip, frame, location):
    r, m = rig.copy(), mesh.copy()
    for o in (r, m):
        bpy.context.scene.collection.objects.link(o)
        o.hide_render = False
    m.parent = r
    m.modifiers['Armature'].object = r
    r.location = location
    r.animation_data_clear()
    r.animation_data_create()
    track = r.animation_data.nla_tracks.new()
    act = bpy.data.actions[clip]
    strip = track.strips.new(clip, SCENE_FRAME - frame, act)   # plays `frame` at the scene frame
    if act.slots:
        strip.action_slot = act.slots[0]
    strip.extrapolation = 'HOLD'
    return r


def stage(scene):
    world = bpy.data.worlds.new('LoadoutWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.62, .68, .74, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    scene.world = world
    floor = bpy.data.meshes.new('LoadoutFloor')
    floor.from_pydata([(-50, -50, 0), (50, -50, 0), (50, 50, 0), (-50, 50, 0)], [], [(0, 1, 2, 3)])
    mat = bpy.data.materials.new('LoadoutFloor')
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.55, .56, .5, 1)
    floor.materials.append(mat)
    scene.collection.objects.link(bpy.data.objects.new('LoadoutFloor', floor))
    body = bpy.data.materials.new('LoadoutBody')
    body.use_nodes = True
    body.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.75, .62, .5, 1)
    sun = bpy.data.objects.new('LoadoutSun', bpy.data.lights.new('LoadoutSun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), math.radians(-20), math.radians(-30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('LoadoutCamera', bpy.data.cameras.new('LoadoutCamera'))
    scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    return cam, body


VIEWS = {   # camera offset from the row's middle, per view
    'front': Vector((-4, -14, 4)),   # from the front and the characters' right
    'side': Vector((-14, -2, 2.5)),  # from their right
    'top': Vector((0, -9, 14)),      # high, like the game camera
}


def render_villagers(scene, cam, rig, mesh, things, directory, view):
    """All villagers in one row: <directory>/loadout-villagers-<view>.png."""
    shown = []
    for i, (_, tint, outfit) in enumerate(VILLAGERS):
        r = villager_at(rig, mesh, outfit, (i * 1.6, -40, 0), tint)
        shown += [r, *r.children]
        for name in outfit:
            w = mount(r, things[name], name)
            shown += [w, *w.children]
    for o in scene.objects:
        if o.type in ('MESH', 'ARMATURE') and o.name != 'LoadoutFloor':
            o.hide_render = o not in shown or o.type == 'ARMATURE'
    n = len(VILLAGERS)
    centre = Vector(((n - 1) * 0.8, -40, 1.1))
    cam.location = centre + VIEWS[view]
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = n * 1.7
    scene.render.resolution_x = 1600
    scene.render.resolution_y = int(1600 * 3.4 / cam.data.ortho_scale)
    scene.render.filepath = str(directory / f'loadout-villagers-{view}.png')
    bpy.ops.render.render(write_still=True)


def main(out=None, view='front', only_villagers=False):
    """One image per row: <out>/loadout-<kind>-<view>.png (default blender/previews/), and the
    villagers (only them: only_villagers)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    rig, mesh = character.main(scene)
    weapons = {o.name: o for o in items.build(scene)}
    for o in weapons.values():
        for part in [o, *o.children]:
            part.hide_render = True
    rig.hide_render = mesh.hide_render = True
    cam, body = stage(scene)
    mesh.data.materials.clear()
    mesh.data.materials.append(body)
    rows = []
    for row, (weapon, shots) in enumerate([] if only_villagers else ROWS):
        group = []
        for i, (clip, frame) in enumerate(shots):
            r = figure_at(rig, mesh, clip, frame, (i * 1.8, row * 40, 0))
            group += [r, *r.children]
            w = mount(r, weapons[weapon], weapon_kind(weapon))
            group += [w, *w.children]
        kind = weapon_kind(weapon)   # (a second row of a kind is named for its weapon)
        rows.append((kind if all(r[0] != kind for r in rows) else weapon.replace('weapon_', ''), len(shots), group))
    scene.frame_set(SCENE_FRAME)
    directory = Path(out).resolve() if out else HERE / 'previews'
    directory.mkdir(parents=True, exist_ok=True)
    for row, (kind, n, group) in enumerate(rows):
        for _, _, other in rows:
            for o in other:
                o.hide_render = o not in group or (o.type == 'ARMATURE')
        centre = Vector(((n - 1) * 0.9, row * 40, 1.0))
        cam.location = centre + VIEWS[view]
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.ortho_scale = max(4.2, n * 1.85)
        scene.render.resolution_x = 1600
        scene.render.resolution_y = int(1600 * 3.2 / cam.data.ortho_scale)
        scene.render.filepath = str(directory / f'loadout-{kind}-{view}.png')
        bpy.ops.render.render(write_still=True)
    render_villagers(scene, cam, rig, mesh, weapons, directory, view)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--mounts' in args:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        rig = character.main(bpy.context.scene)[0]
        for kind, q in solve_mounts(rig).items():
            print('MOUNT', kind, q)
        for name in WEAR_AIMS:
            print('WEAR', name, *solve_wear(rig, name))
        sys.exit(0)
    view = 'side' if '--side' in args else 'top' if '--top' in args else 'front'
    paths = [a for a in args if not a.startswith('--')]
    main(paths[0] if paths else None, view, '--villagers' in args)
