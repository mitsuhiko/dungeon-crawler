"""Non-overlapping anatomical UV charts for the paintable clay character.

Split by rig region and dominant normal axis, then project, equalise texel density and
pack without mirroring. The axis split bounds distortion and avoids the tiny overlaps
that relaxing front/back shells creates around thin limb caps. GPU projection painting
bridges the resulting seams. No animation, weights or positions are changed.
Run after decimation, before exporting.

Update an existing source without rebaking animations:
  Blender -b blender/character.blend --python blender/character_uv.py
Then: node tools/compress-assets.mjs assets/character.glb
"""
from pathlib import Path
import sys
import bpy
import bmesh

UV_VERSION = "character-v1"


def unwrap_character(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.hide_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mesh = ob.data
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    mesh.uv_layers.new(name="SkinUV")
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    # Separate anatomical parts so the long silhouette can pack densely. Use summed
    # rig weights, not world-space thresholds, so this also follows the flexed arms.
    def region(name):
        if name.startswith(("upper_arm", "forearm")):
            return "arm" + name[-2:]
        if name.startswith(("thigh", "shin")):
            return "leg" + name[-2:]
        return "head" if name == "head" else "body"
    names = {g.index: region(g.name) for g in ob.vertex_groups}
    weights = []
    for v in mesh.vertices:
        w = {}
        for g in v.groups:
            name = names[g.group]
            w[name] = w.get(name, 0) + g.weight
        weights.append(w)
    charts = {}
    for face in bm.faces:
        w = {}
        for v in face.verts:
            for name, weight in weights[v.index].items():
                w[name] = w.get(name, 0) + weight
        part = max(w, key=w.get)
        # Limb ends and thin side walls need their own caps: forcing them into
        # a front/back shell can fold its boundary over itself without flipping faces.
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        charts[face] = (part, axis, face.normal[axis] < 0)
    for edge in bm.edges:
        edge.seam = len(edge.link_faces) != 2 or charts[edge.link_faces[0]] != charts[edge.link_faces[1]]
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        _, axis, negative = charts[face]
        axes = [i for i in range(3) if i != axis]
        for loop in face.loops:
            loop[uv_layer].uv = (loop.vert.co[axes[0]] * (-1 if negative else 1), loop.vert.co[axes[1]])
    bm.to_mesh(mesh)
    bm.free()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Dominant-axis charts have bounded projection distortion (at most sqrt(3))
    # and no relaxation folds at thin limb caps. Packing moves/scales islands only.
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=16 / 2048)
    bpy.ops.object.mode_set(mode="OBJECT")
    ob["skin_uv_version"] = UV_VERSION
    uv = mesh.uv_layers.active.data
    areas = []
    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        a, b, c = [uv[i].uv for i in tri.loops]
        areas.append(abs((b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x)) / 2)
    assert min(areas) > 1e-12, "Collapsed UV triangle"
    assert all(-1e-6 <= x <= 1.000001 for loop in uv for x in loop.uv), "UV outside atlas"
    print(f"SKIN_UV: {len(areas)} triangles, {sum(areas):.1%} atlas coverage, min area {min(areas):.8f}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root / "blender"))
    import character
    ob, rig = bpy.data.objects[character.CHAR_NAME], bpy.data.objects[character.RIG_NAME]
    unwrap_character(ob)
    character.export_gltf(rig, ob, str(root / "assets" / "character.glb"))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(root / "blender" / "character.blend"))
