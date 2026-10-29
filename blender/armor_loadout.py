"""
The hero in armor (armor.py, through items.py): a row per set, the parts on their bones the way
the game puts them there (src/render/figure.js), in a few of the character's clips, to check that
nothing sinks into the body or flies off it. Nothing is exported.

    Blender -b blender/character.blend --python blender/armor_loadout.py -- [directory] [--side | --top]

One image per set: <directory>/armor-<set>-<view>.png (default directory: blender/previews/).
"""
from pathlib import Path
import math
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Matrix, Vector

import armor
import items

HERE = Path(__file__).resolve().parent
SCENE_FRAME = 200

# the sets: (name, [armor item names]); the poses: (clip, frame, the shield on the back)
SETS = [
    ('light', ['armor_head_cap', 'armor_body_padded', 'armor_shield_buckler', 'armor_feet_sandals']),
    ('leather', ['armor_head_skullcap', 'armor_body_leather', 'armor_shield_round', 'armor_feet_boots']),
    ('chain', ['armor_head_nasal', 'armor_body_chain', 'armor_shield_kite', 'armor_feet_hobnail']),
    ('scale', ['armor_head_horned', 'armor_body_scale', 'armor_shield_heater', 'armor_feet_greaves']),
    ('plate', ['armor_head_great', 'armor_body_plate', 'armor_shield_tower', 'armor_feet_winged']),
    ('prow', ['armor_head_nasal', 'armor_body_chain', 'armor_shield_prow', 'armor_feet_hobnail']),
    ('bulwark', ['armor_head_horned', 'armor_body_scale', 'armor_shield_bulwark', 'armor_feet_greaves']),
    ('aegis', ['armor_head_great', 'armor_body_plate', 'armor_shield_aegis', 'armor_feet_winged']),
]
POSES = [('Jump', 0, False), ('Walk', 6, False), ('Run', 4, False), ('Slash', 15, False), ('Shoot', 18, True),
         ('Roll', 10, False), ('Climb', 10, False)]
VIEWS = {'front': Vector((-4, -14, 4)), 'side': Vector((-14, -2, 2.5)), 'top': Vector((0, -9, 14))}


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
    strip = track.strips.new(clip, SCENE_FRAME - frame, act)
    if act.slots:
        strip.action_slot = act.slots[0]
    strip.extrapolation = 'HOLD'
    return r


def wear(rig, thing, back):
    """Copies of the armor's parts, each parented to its bone where it sits in the rest pose."""
    out = []
    for part in [thing, *thing.children]:
        obj = part.copy()
        obj.parent = None
        bpy.context.scene.collection.objects.link(obj)
        obj.hide_render = False
        slung = back and part.get('back_bone')
        bone = part['back_bone'] if slung else part['bone']
        world = Matrix.Translation(rig.location) @ part.matrix_world
        if slung:
            world = Matrix.Translation(rig.location) @ armor.shield_back() @ armor.shield_arm().inverted() @ part.matrix_world
        obj.parent = rig
        obj.parent_type = 'BONE'
        obj.parent_bone = bone
        obj.matrix_parent_inverse = Matrix.Identity(4)
        bpy.context.view_layer.update()
        obj.matrix_world = world
        out.append(obj)
    return out


def main(out=None, view='front'):
    scene = bpy.context.scene
    rig, mesh = bpy.data.objects['CharacterRig'], bpy.data.objects['Character']
    for o in list(scene.objects):
        if o not in (rig, mesh) and o.type in ('MESH', 'LIGHT', 'CAMERA'):
            o.hide_render = True
    things = {o.name: o for o in items.build(scene) if o.name.startswith('armor_')}
    for o in bpy.data.objects:
        if o.get('cube_crawler_item') or o.get('cube_crawler_part'):
            o.hide_render = True
    rig.hide_render = mesh.hide_render = True
    body = bpy.data.materials.new('ArmorBody')
    body.use_nodes = True
    body.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.75, .62, .5, 1)
    mesh.data.materials.clear()
    mesh.data.materials.append(body)
    world = bpy.data.worlds.new('ArmorWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.62, .68, .74, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    scene.world = world
    floor = bpy.data.meshes.new('ArmorFloor')
    floor.from_pydata([(-80, -80, 0), (80, -80, 0), (80, 80, 0), (-80, 80, 0)], [], [(0, 1, 2, 3)])
    scene.collection.objects.link(bpy.data.objects.new('ArmorFloor', floor))
    sun = bpy.data.objects.new('ArmorSun', bpy.data.lights.new('ArmorSun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), math.radians(-20), math.radians(-30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('ArmorCamera', bpy.data.cameras.new('ArmorCamera'))
    scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'AgX'
    rows = []
    rig.data.pose_position = 'REST'
    for row, (name, set_items) in enumerate(SETS):
        group = []
        for i, (clip, frame, back) in enumerate(POSES):
            r = figure_at(rig, mesh, clip, frame, (i * 1.8, row * 40, 0))
            group += [r, *r.children]
            for thing in set_items:
                group += wear(r, things[thing], back and thing.startswith('armor_shield'))
        rows.append((name, group))
    rig.data.pose_position = 'POSE'
    scene.frame_set(SCENE_FRAME)
    directory = Path(out).resolve() if out else HERE / 'previews'
    directory.mkdir(parents=True, exist_ok=True)
    n = len(POSES)
    for row, (name, group) in enumerate(rows):
        for _, other in rows:
            for o in other:
                o.hide_render = o not in group or o.type == 'ARMATURE'
        centre = Vector(((n - 1) * 0.9, row * 40, 1.0))
        cam.location = centre + VIEWS[view]
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.ortho_scale = n * 1.85
        scene.render.resolution_x = 1800
        scene.render.resolution_y = int(1800 * 3.2 / cam.data.ortho_scale)
        scene.render.filepath = str(directory / f'armor-{name}-{view}.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    view = 'side' if '--side' in args else 'top' if '--top' in args else 'front'
    paths = [a for a in args if not a.startswith('--')]
    main(paths[0] if paths else None, view)
