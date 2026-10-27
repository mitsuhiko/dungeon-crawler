"""
Qualmos: the boss at the core of the world (depth 20, core/bosses.js), after a child's drawing: a
slender blue-green amphibian on six tentacles with pale green suckers, two arms with clawed
fingers, hard spines on his head and back, glowing sea-green eyes and a wide grin full of teeth.

Unlike the other bosses, he is not built here: he is modelled and animated by hand in
blender/qualmos.blend (its parts in the collection SOURCE, on the rig SOURCE_RIG, the clips the
actions named Boss*; the scene's NLA track shows them off one after the other). This script opens
it, joins the parts into one skinned mesh (Qualmos, its materials named for the game: CLIPS,
MATERIALS), adds his death (Boss* has none), collapses the mesh to its triangle budget
(figure.py TRIANGLE_BUDGET) and exports it. The .blend itself is never written.

Clips (30 fps, in place; attacks by core/qualmos.js QUALMOS_ATTACKS `clip`, render/qualmosmodel.js):
    QualmosWalk         tentacle gait, loop (extras.speed: the pace it matches)
    QualmosWhip .. QualmosBellyFlop   his eleven attacks (see core/qualmos.js)
    QualmosRage         changing phase: tenses, spreads his arms and roars
    QualmosDeath        2.5 s: sags forward and down, arms dropping. Held.

Headless:
    Blender -b --python blender/qualmos.py -- assets/qualmos.glb blender/previews/qualmos-preview.png
then compress it: node tools/compress-assets.mjs assets/qualmos.glb
"""
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creature as K
import figure as F

ROOT = Path(__file__).resolve().parent
SOURCE_BLEND = ROOT / "qualmos.blend"
SOURCE, SOURCE_RIG = "BOSS | Amphibious creature concept", "BOSS RIG | Select to view actions"
NAME, RIG_NAME = "Qualmos", "QualmosRig"
# the authored actions -> the clips the game knows
CLIPS = {
    "BossWalk": "QualmosWalk", "BossWhip": "QualmosWhip", "BossGrab": "QualmosGrab", "BossDoubleSlam": "QualmosDoubleSlam",
    "BossWaterJet": "QualmosWaterJet", "BossDive": "QualmosDive", "BossInkBurst": "QualmosInkBurst",
    "BossTailSpin": "QualmosTailSpin", "BossUndertow": "QualmosUndertow", "BossSpikeVolley": "QualmosSpikeVolley",
    "BossTidalSurge": "QualmosTidalSurge", "BossBellyFlop": "QualmosBellyFlop", "BossRage": "QualmosRage",
}
LOOPS = {"QualmosWalk": {"speed": 1.7}}
DEATH, DEATH_FRAMES = "QualmosDeath", 76
# the authored materials -> the game's names (an enemy's parts keep their material names: recolor.js)
MATERIALS = {
    "Skin | Deep ocean blue": "QualmosSkin", "Belly | Turquoise green": "QualmosBelly", "Teeth | Aged ivory": "QualmosTeeth",
    "Hard spines | Blue green": "QualmosSpines", "Eyes | Luminous sea green": "QualmosEyes_glow",
    "Mouth and pupils": "QualmosMouth", "Suckers | Pale green": "QualmosSuckers", "Sucker centers": "QualmosSuckerHollows",
}


def rest(rig):
    for p in rig.pose.bones:
        p.location, p.rotation_euler, p.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)


def start(act):
    """Slide the clip's keys back to start at frame 0."""
    first, last = (int(f) for f in act.frame_range)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.co.x -= first
                        point.handle_left.x -= first
                        point.handle_right.x -= first
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, last - first
    act["fps"], act["duration"] = K.FPS, act.frame_end / K.FPS


def death(rig):
    """He sags forward and down over 3/4 of the clip, his arms dropping, and stays there."""
    act = bpy.data.actions.new(DEATH)
    act.use_fake_user = True
    rig.animation_data.action = act
    for f in range(1, DEATH_FRAMES + 1):
        u = min(1, (f - 1) / (DEATH_FRAMES - 1) / 0.75)
        u = u * u * (3 - 2 * u)
        rest(rig)
        bones = rig.pose.bones
        bones["body"].rotation_euler.x = 0.6 * u
        bones["body"].location.y = -0.6 * u
        bones["head"].rotation_euler.x = 0.4 * u
        bones["arm.L"].rotation_euler.z = 0.3 * u
        bones["arm.R"].rotation_euler.z = -0.3 * u
        for p in bones:
            for key in ("location", "rotation_euler", "scale"):
                p.keyframe_insert(key, frame=f, group=p.name)
    act["hold_last_frame"] = True
    rig.animation_data.action = None
    return act


def build():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    rig = bpy.data.objects[SOURCE_RIG]
    rig.name = RIG_NAME
    rig.animation_data.action = None
    for track in list(rig.animation_data.nla_tracks):   # (the showcase)
        rig.animation_data.nla_tracks.remove(track)
    bpy.context.scene.frame_set(1)
    rest(rig)
    death(rig)
    for old, new in CLIPS.items():
        act = bpy.data.actions[old]
        act.name = new
        act["loop"] = new in LOOPS
        for key, value in LOOPS.get(new, {}).items():
            act[key] = value
    for act in list(bpy.data.actions):   # (the idle, which the game does not play)
        if act.name not in (*CLIPS.values(), DEATH):
            bpy.data.actions.remove(act)
    for act in bpy.data.actions:   # authored from frame 1: from 0, so a clip lasts its frames / FPS
        start(act)
    rest(rig)
    bpy.context.view_layer.update()
    # one skinned mesh, joined at the rest pose (one armature modifier, every vertex group kept)
    parts = [o for o in bpy.data.collections[SOURCE].objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = obj.data.name = NAME
    for m in obj.data.materials:
        m.name = MATERIALS[m.name]
    assert len(obj.data.materials) <= 12, len(obj.data.materials)
    F.decimate(obj)
    K.register(rig, (*CLIPS.values(), DEATH))   # (what the exporter takes: one muted NLA track a clip)
    return bpy.context.scene, rig, obj


def preview(scene, rig, path):
    far, target = (5.5, -7.0, 4.0), (0, 0, 1.8)
    shots = [("QualmosWalk", 10, far), ("QualmosWhip", 30, far), ("QualmosDoubleSlam", 36, far), ("QualmosWaterJet", 40, far),
             ("QualmosTailSpin", 40, far), ("QualmosSpikeVolley", 40, far), ("QualmosBellyFlop", 70, far), ("QualmosDeath", DEATH_FRAMES - 1, far)]
    K.contact_sheet(scene, rig, shots, path, target, size=360, cols=4)


def main(export_path, preview_path=None):
    scene, rig, obj = build()
    obj.data.calc_loop_triangles()
    print(f"{NAME}: {len(obj.data.vertices)} vertices, {len(obj.data.loop_triangles)} triangles, "
          f"{len(obj.data.materials)} materials, {len(bpy.data.actions)} clips")
    K.export_gltf(rig, obj, export_path)
    if preview_path:
        preview(scene, rig, preview_path)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    main(args[0] if args else str(ROOT.parent / "assets" / "qualmos.glb"), args[1] if len(args) > 1 else None)
