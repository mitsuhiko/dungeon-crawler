"""
Shared building blocks for the SDF clay enemies (snake.py, octonaut.py,
fireface.py, triangle.py, firecat.py, shraps.py, spicy.py).

Same construction as stunder.py / spider.py: every part is a signed distance
field meshed with OpenVDB (figure._sdf_to_mesh), all parts are joined into
ONE smooth-shaded skinned mesh with plain materials, and all motion is
computed in Python and baked to explicit keys (no runtime constraints).

Everything here is safe in a shared Blender MCP session: each creature
lives in its own scene + collection, exports only its own rig / mesh /
actions, and `save_blend` writes an isolated project via a background
Blender without touching the interactive file.
"""
import math
from pathlib import Path
import subprocess
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import figure as F

FPS = 30
D = math.radians
TAU = math.tau
# Both new creatures share shining purple eyes.
EYE_HEX = "#9b3dff"
EYE_STRENGTH = 1.5
PUPIL_HEX = "#1d0a29"


def rgba(hex_color):
    rgb = [int(hex_color[1 + i:3 + i], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb) + (1,)


def material(name, hex_color, emission=0.0, roughness=0.62):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    color = rgba(hex_color)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Subsurface Weight"].default_value = 0.04 if not emission else 0
    bsdf.inputs["Subsurface Radius"].default_value = (0.05, 0.05, 0.05)
    bsdf.inputs["Emission Color"].default_value = color if emission else (0, 0, 0, 1)
    bsdf.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = color
    return mat


# --- SDF helpers -------------------------------------------------------------
# learn: art.html#sdf-code (see learn/README.md)
def ellipsoid(P, center, radii):
    """IQ ellipsoid distance approximation (well-behaved zero surface)."""
    q = P - np.asarray(center, np.float32)
    r = np.asarray(radii, np.float32)
    k0 = np.linalg.norm(q / r, axis=-1)
    k1 = np.linalg.norm(q / (r * r), axis=-1)
    return np.where(k1 > 1e-8, k0 * (k0 - 1) / np.maximum(k1, 1e-8), -min(r))


def round_cone(P, a, b, r1, r2):
    """Capped cone with rounded ends, radius r1 at a and r2 at b."""
    a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
    ba, rr = b - a, r1 - r2
    l2 = float(ba @ ba)
    a2, il2 = l2 - rr * rr, 1 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - y[..., None] * ba
    x2 = np.einsum("...i,...i", xv, xv)
    y2, z2 = y * y * l2, z * z * l2
    k = np.sign(rr) * rr * rr * x2
    d = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d = np.where(np.sign(y) * a2 * y2 < k, np.sqrt(x2 + y2) * il2 - r1, d)
    return np.where(np.sign(z) * a2 * z2 > k, np.sqrt(x2 + z2) * il2 - r2, d)


def tapered_tube(P, pts, radii):
    """Hard union of round cones along a polyline with per-point radii."""
    d = None
    for a, b, r1, r2 in zip(pts, pts[1:], radii, radii[1:]):
        t = round_cone(P, a, b, r1, r2)
        d = t if d is None else np.minimum(d, t)
    return d


def local(P, origin, axes):
    """Coordinates of P in an orthonormal frame (axes = 3 world vectors)."""
    Q = P - np.asarray(origin, np.float32)
    return np.stack([Q @ np.asarray(a, np.float32) for a in axes], axis=-1)


smin, smax, polyline = F._smin, F._smax, F._sd_polyline


def bounds(points, pad):
    pts = np.array([tuple(p) for p in points], np.float32)
    return pts.min(axis=0) - pad, pts.max(axis=0) + pad


# --- scene / collections -----------------------------------------------------
def creature_scene(name):
    """A dedicated scene, so a shared MCP session's own scenes stay untouched."""
    scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    window = getattr(bpy.context, "window", None)
    if window is not None and window.scene != scene:
        window.scene = scene
    obj = getattr(bpy.context, "object", None)
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.fps = FPS
    return scene


def collection(name, scene):
    coll = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    return coll


def clear_collection(name):
    coll = bpy.data.collections.get(name)
    if not coll:
        return
    for obj in list(coll.objects):
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is None or data.users:
            continue
        for kind, store in ((bpy.types.Mesh, bpy.data.meshes), (bpy.types.Armature, bpy.data.armatures),
                            (bpy.types.Light, bpy.data.lights), (bpy.types.Camera, bpy.data.cameras)):
            if isinstance(data, kind):
                store.remove(data)


# collapse a finished, weighted mesh to its game budget (figure.TRIANGLE_BUDGET)
decimate = F.decimate


# --- mesh assembly -----------------------------------------------------------
class Parts:
    """Collects SDF parts; owners keep vertex ranges + metadata for skinning."""

    def __init__(self):
        self.co, self.quads, self.mats, self.owners, self.n = [], [], [], [], 0

    def add(self, kind, sdf, lo, hi, voxel, mat=0, **meta):
        """mat: a material index, or a function of the quad centres (N x 3) that
        returns one index per quad (bands, stripes)."""
        me = F._sdf_to_mesh("CreaturePart", sdf, lo, hi, voxel)
        co = np.empty(len(me.vertices) * 3, np.float32)
        q = np.empty(len(me.loops), np.int32)
        me.vertices.foreach_get("co", co)
        me.loops.foreach_get("vertex_index", q)
        bpy.data.meshes.remove(me)
        co, q = co.reshape(-1, 3), q.reshape(-1, 4)
        assert len(co), f"empty part {kind}"
        self.co.append(co)
        self.quads.append(q + self.n)
        self.mats.append(np.asarray(mat(co[q].mean(axis=1)), np.int32) if callable(mat)
                         else np.full(len(q), mat, np.int32))
        self.owners.append(dict(kind=kind, lo=self.n, hi=self.n + len(co), **meta))
        self.n += len(co)

    def mesh(self, name, coll, materials):
        co, q = np.concatenate(self.co), np.concatenate(self.quads)
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(co))
        me.vertices.foreach_set("co", co.ravel())
        me.loops.add(len(q) * 4)
        me.loops.foreach_set("vertex_index", q.ravel())
        me.polygons.add(len(q))
        me.polygons.foreach_set("loop_start", np.arange(0, len(q) * 4, 4, dtype=np.int32))
        me.polygons.foreach_set("material_index", np.concatenate(self.mats))
        me.update()
        me.validate()
        me.shade_smooth()
        for mat_name, color, emission in materials:
            me.materials.append(material(mat_name, color, emission))
        obj = bpy.data.objects.new(name, me)
        coll.objects.link(obj)
        return obj


def mesh_points(obj):
    co = np.empty(len(obj.data.vertices) * 3, np.float32)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def diffuse(obj, lo, hi, WB, iterations, rate=0.5):
    """Smooth skin weights over the mesh surface of the vertex range [lo, hi)."""
    E = np.empty(len(obj.data.edges) * 2, np.int32)
    obj.data.edges.foreach_get("vertices", E)
    E = E.reshape(-1, 2)
    E = E[(E[:, 0] >= lo) & (E[:, 1] >= lo) & (E[:, 0] < hi) & (E[:, 1] < hi)] - lo
    degree = np.bincount(E.ravel(), minlength=len(WB)).astype(np.float32)[:, None]
    for _ in range(iterations):
        acc = np.zeros_like(WB)
        np.add.at(acc, E[:, 0], WB[E[:, 1]])
        np.add.at(acc, E[:, 1], WB[E[:, 0]])
        WB += rate * (acc / np.maximum(degree, 1) - WB)
    return WB


def write_weights(obj, names, W):
    """At most four influences per vertex (glTF), normalised, as vertex groups."""
    W = np.maximum(W, 0)
    order = np.argsort(-W, axis=1)
    W[np.arange(len(W))[:, None], order[:, 4:]] = 0
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-8)
    assert np.allclose(W.sum(axis=1), 1, atol=1e-5), "Unweighted vertices"
    obj.vertex_groups.clear()
    for j, name in enumerate(names):
        group = obj.vertex_groups.new(name=name)
        for i in np.flatnonzero(W[:, j] > 1e-5):
            group.add([int(i)], float(W[i, j]), "REPLACE")


# --- rig ---------------------------------------------------------------------
def armature(name, coll, bones, props=None):
    """bones: (name, head, tail, parent, deform, roll_to)."""
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    coll.objects.link(rig)
    rig.show_in_front = True
    arm.display_type = "STICK"
    view_layer = bpy.context.view_layer
    for o in view_layer.objects:
        if o is not None:
            o.select_set(False)
    view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent, deform, roll_to in bones:
        b = arm.edit_bones.new(bone_name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.align_roll(Vector(roll_to))
        b.use_deform = deform
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for key, value in (props or {}).items():
        rig[key] = value
    return rig


def aim_at(skel, name, poses, head, direction, spin=None):
    """Put a bone's head at `head` and point it along `direction` (armature
    space), with the smallest swing from its parent-driven base frame. An
    optional extra world rotation `spin` (3x3) is applied afterwards."""
    base = skel.base(name, poses)
    y = base.col[1].xyz.normalized()
    rot = y.rotation_difference(direction.normalized()).to_matrix() @ base.to_3x3()
    if spin is not None:
        rot = spin @ rot
    desired = Matrix.Translation(head) @ rot.to_4x4()
    poses[name] = desired
    return base.inverted() @ desired


def pose_local(skel, name, poses, basis):
    """Give a bone an explicit local basis (relative to its parent-driven rest)."""
    poses[name] = skel.base(name, poses) @ basis
    return basis


def flicker(i, t, period, amp=1.0):
    """Flame tongue i at time t: two sway angles (radians) and a stretch factor.
    Every frequency is a whole multiple of 1 / period, so loops of that period
    close seamlessly; the per-tongue phases keep neighbours out of step."""
    f = TAU * t / period
    a = amp * (D(8) * math.sin(3 * f + 1.7 * i) + D(4) * math.sin(7 * f + 0.9 * i * i))
    b = amp * (D(6) * math.sin(4 * f + 2.3 * i + 0.5) + D(3) * math.sin(9 * f + 1.3 * i))
    s = 1 + amp * (0.10 * math.sin(5 * f + 0.7 * i) + 0.05 * math.sin(11 * f + 2.1 * i))
    return a, b, s


def flame_tongue(base, up, side, length, r0, curl, waves=1.2, tip=0.012, n=12):
    """Centre line and radii of an S-curved flame tongue (base wide, tip sharp)."""
    pts, radii = [], []
    for k in range(n + 1):
        u = k / n
        pts.append(base + up * (length * u) + side * (curl * math.sin(math.pi * waves * u) * u))
        radii.append(tip + (r0 - tip) * (1 - u) ** 0.9)
    return pts, radii


def about(point, rotation):
    """4x4 rotation about a world point."""
    return Matrix.Translation(point) @ rotation.to_4x4() @ Matrix.Translation(-point)


# --- baking ------------------------------------------------------------------
def bake(rig, name, frames, cyclic, extras=None):
    """Bake ALL TRS explicitly (eye scale, floor correction, translated chains)."""
    old = bpy.data.actions.get(name)
    if old:
        bpy.data.actions.remove(old)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    prev = {}
    for f, bases in enumerate(frames):
        for bone_name, basis in bases.items():
            pb = rig.pose.bones[bone_name]
            loc, quat, scale = basis.decompose()
            if bone_name in prev and quat.dot(prev[bone_name]) < 0:
                quat.negate()
            prev[bone_name] = quat.copy()
            pb.location, pb.rotation_quaternion, pb.scale = loc, quat, scale
            for key in ("location", "rotation_quaternion", "scale"):
                pb.keyframe_insert(key, frame=f, group=bone_name)
    for layer in act.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "LINEAR"
    act.use_frame_range = True
    act.frame_start, act.frame_end = 0, len(frames) - 1
    act.use_cyclic = cyclic
    act["loop"] = cyclic
    act["fps"] = FPS
    act["duration"] = (len(frames) - 1) / FPS
    act["root_motion"] = False
    for key, value in (extras or {}).items():
        act[key] = value
    return act


def ground_clip(rig, obj, name, solve, n, cyclic=False, extras=None, settle_from=None):
    """solve(f, lift) -> bases. Lifts frames whose deformed mesh dips below z=0;
    from frame `settle_from` on (a corpse) the mesh is also lowered onto it."""
    lifts = np.zeros(n + 1)
    for _ in range(6):
        frames = [solve(f, float(lifts[f])) for f in range(n + 1)]
        if cyclic:
            frames[-1] = {key: mat.copy() for key, mat in frames[0].items()}
        act = bake(rig, name, frames, cyclic, extras)
        minima = C.mesh_min_z(rig, obj, act)
        correction = np.maximum(0, -minima)
        if settle_from is not None:
            correction[settle_from:] = -minima[settle_from:]
        if np.abs(correction).max() < 0.0005:
            break
        if cyclic:
            correction = np.array([(correction[(i - 1) % n] + 2 * correction[i % n]
                                    + correction[(i + 1) % n]) / 4 for i in range(n)] + [0])
            correction[-1] = correction[0]
        lifts += correction
    assert minima.min() > -0.001, (name, float(minima.min()))
    return act


def register(rig, clips):
    """Muted NLA tracks: explicit clip ownership for the glTF exporter."""
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for name in clips:
        action = bpy.data.actions[name]
        track = rig.animation_data.nla_tracks.new()
        track.name, track.mute = name, True
        strip = track.strips.new(name, 0, action)
        strip.action_slot = action.slots[0]
        strip.extrapolation = "NOTHING"
    rig.animation_data.action = bpy.data.actions[clips[0]]


def validate(rig, obj, clips, held=()):
    assert obj.parent == rig and obj.modifiers[0].type == "ARMATURE"
    assert all(p.use_smooth for p in obj.data.polygons)
    for v in obj.data.vertices:
        weights = [g.weight for g in v.groups]
        assert 0 < len(weights) <= 4 and abs(sum(weights) - 1) < 1e-4, v.index
    scene = bpy.context.scene
    report = []
    for name in clips:
        act = bpy.data.actions[name]
        minima = C.mesh_min_z(rig, obj, act)
        assert minima.min() > -0.001, (name, float(minima.min()))
        if act.use_cyclic or name in held:
            scene.frame_set(int(act.frame_end) - (2 if name in held else 0))
            start = {pb.name: pb.matrix.copy() for pb in rig.pose.bones}
            scene.frame_set(int(act.frame_end) if name in held else 0)
            for pb in rig.pose.bones:
                err = max(abs(start[pb.name][i][j] - pb.matrix[i][j]) for i in range(4) for j in range(4))
                assert err < 0.001, (name, pb.name, err)
        report.append({"name": name, "duration": act["duration"], "min_z": round(float(minima.min()), 4)})
    obj.data.calc_loop_triangles()
    return {"vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles),
            "bones": len(rig.data.bones), "clips": report}


# --- staging / export --------------------------------------------------------
def setup_stage(scene, prefix, coll_name, target, ortho, camera=(3.0, -6.5, 3.0)):
    clear_collection(coll_name)
    coll = collection(coll_name, scene)
    me = bpy.data.meshes.new(prefix + "Ground")
    me.from_pydata([(-12, -12, -0.002), (12, -12, -0.002), (12, 12, -0.002), (-12, 12, -0.002)],
                   [], [(0, 1, 2, 3)])
    me.materials.append(material(prefix + "StageGround", "#c3c7bd"))
    coll.objects.link(bpy.data.objects.new(prefix + "Ground", me))
    for name, location, energy, size in (("Key", (-3, -4, 6), 420, 4), ("Fill", (4, -1, 4), 160, 3),
                                         ("Rim", (1, 3, 5), 320, 3)):
        light = bpy.data.lights.new(prefix + name, "AREA")
        light.energy, light.size = energy, size
        obj = bpy.data.objects.new(prefix + name, light)
        coll.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.new(prefix + "Camera", bpy.data.cameras.new(prefix + "Camera"))
    coll.objects.link(cam)
    cam.location = camera
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
    scene.camera = cam
    world_name = prefix + "World"
    scene.world = bpy.data.worlds.get(world_name) or bpy.data.worlds.new(world_name)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    background.inputs["Strength"].default_value = 0.45
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 800, 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    return cam


def render_still(scene, rig, action, frame, path):
    rig.animation_data.action = bpy.data.actions[action]
    scene.frame_set(frame)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def clip_videos(scene, rig, clips, out_dir, target, views, size=420, fps=FPS):
    """Each clip as a little video (out_dir/<clip>.mp4: the views side by side, flat-shaded, on a
    floor), to look at a clip in motion, which still frames do not show (a foot skating, a tentacle
    snapping, timing that drags). views: (camera location, ortho scale) each, looking at `target`.
    Needs ffmpeg. Writes nothing into the repository unless out_dir is in it (blender/previews/ is
    ignored)."""
    import shutil
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg, "clip_videos needs ffmpeg"
    engine, light, color = scene.render.engine, scene.display.shading.light, scene.display.shading.color_type
    cam_saved = scene.camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light, scene.display.shading.color_type = "STUDIO", "MATERIAL"
    cam = bpy.data.objects.new("ClipVideoCamera", bpy.data.cameras.new("ClipVideoCamera"))
    scene.collection.objects.link(cam)
    cam.data.type, cam.data.ortho_scale = "ORTHO", views[0][1]
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = size
    written = []
    try:
        for clip in clips:
            act = bpy.data.actions[clip]
            rig.animation_data.action = act
            with tempfile.TemporaryDirectory(prefix="clip-") as directory:
                for f in range(int(act.frame_start), int(act.frame_end) + 1):
                    scene.frame_set(f)
                    tiles = []
                    for v, (location, ortho) in enumerate(views):
                        cam.location, cam.data.ortho_scale = location, ortho
                        cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
                        scene.render.filepath = str(Path(directory) / f"v{v}.png")
                        bpy.ops.render.render(write_still=True, scene=scene.name)
                        img = bpy.data.images.load(scene.render.filepath)
                        tiles.append(np.array(img.pixels[:], np.float32).reshape(size, size, 4))
                        bpy.data.images.remove(img)
                    frame = bpy.data.images.new("ClipFrame", size * len(views), size, alpha=True)
                    frame.pixels = np.concatenate(tiles, axis=1).ravel()
                    frame.filepath_raw = str(Path(directory) / f"f{f:04d}.png")
                    frame.file_format = "PNG"
                    frame.save()
                    bpy.data.images.remove(frame)
                path = out_dir / f"{clip}.mp4"
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-pattern_type", "glob",
                                "-i", str(Path(directory) / "f*.png"), "-pix_fmt", "yuv420p", "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
                                str(path)], check=True)
                written.append(str(path))
    finally:
        bpy.data.objects.remove(cam, do_unlink=True)
        scene.camera = cam_saved
        scene.render.engine = engine
        scene.display.shading.light, scene.display.shading.color_type = light, color
    return written


def contact_sheet(scene, rig, shots, path, target, size=360, cols=4):
    """Render (action, frame, camera location) shots into one tiled preview PNG."""
    cam = scene.camera
    saved = (cam.location.copy(), cam.rotation_euler.copy(), scene.render.resolution_x,
             scene.render.resolution_y, rig.animation_data.action, scene.frame_current)
    scene.render.resolution_x = scene.render.resolution_y = size
    rows = (len(shots) + cols - 1) // cols
    sheet = np.ones((rows * size, cols * size, 4), np.float32)
    try:
        with tempfile.TemporaryDirectory(prefix="sheet-") as directory:
            for i, (action, frame, location) in enumerate(shots):
                rig.animation_data.action = bpy.data.actions[action]
                scene.frame_set(frame)
                cam.location = location
                cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
                scene.render.filepath = str(Path(directory) / f"{i}.png")
                bpy.ops.render.render(write_still=True, scene=scene.name)
                img = bpy.data.images.load(scene.render.filepath)
                px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
                bpy.data.images.remove(img)
                r, c = rows - 1 - i // cols, i % cols
                sheet[r * size:(r + 1) * size, c * size:(c + 1) * size] = px
        out = bpy.data.images.new("ContactSheet", cols * size, rows * size, alpha=True)
        out.pixels = sheet.ravel()
        out.filepath_raw = str(path)
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)
    finally:
        cam.location, cam.rotation_euler = saved[0], saved[1]
        scene.render.resolution_x, scene.render.resolution_y = saved[2], saved[3]
        rig.animation_data.action = saved[4]
        scene.frame_set(saved[5])


def export_gltf(rig, obj, path, extra=(), texcoords=False, colors=False):
    """Export rig + skinned mesh, plus `extra` standalone objects (projectile props); texcoords,
    colors: with the mesh's UVs, its active colour attribute (most have neither worth sending)."""
    path = str(Path(path).resolve())
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    view_layer = bpy.context.view_layer
    selected, active = list(bpy.context.selected_objects), view_layer.objects.active
    for o in view_layer.objects:
        if o is not None:
            o.select_set(False)
    rig.select_set(True)
    obj.select_set(True)
    for o in extra:
        o.select_set(True)
    view_layer.objects.active = rig
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                                  use_active_scene=True, export_yup=True, export_extras=True,
                                  export_animation_mode="ACTIONS", export_force_sampling=True,
                                  export_anim_single_armature=False, export_rest_position_armature=True,
                                  export_frame_step=1, export_skins=True, export_normals=True,
                                  export_texcoords=texcoords, export_vertex_color="ACTIVE" if colors else "MATERIAL",
                                  export_cameras=False, export_lights=False)
    finally:
        for o in view_layer.objects:
            if o is not None:
                o.select_set(False)
        for o in selected:
            o.select_set(True)
        view_layer.objects.active = active


def save_blend(scene, path, collections, clips, title, mesh_name, view_center, view_distance):
    """Save an ordinary, isolated project (see stunder.save_blend)."""
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    isolated = scene.copy()
    for coll in list(isolated.collection.children):
        if coll.name not in collections:
            isolated.collection.children.unlink(coll)
    for obj in list(isolated.collection.objects):
        isolated.collection.objects.unlink(obj)
    try:
        with tempfile.TemporaryDirectory(prefix="creature-") as directory:
            library = Path(directory) / "asset.blend"
            bpy.data.libraries.write(str(library), {isolated, *(bpy.data.actions[n] for n in clips)},
                                     compress=True)
            code = f"""import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load({str(library)!r}, link=False) as (source, target):
    target.scenes = source.scenes
    target.actions = source.actions
scene = target.scenes[0]
scene.name = {title!r}
bpy.context.window.scene = scene
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
for obj in scene.objects:
    if obj.type == 'ARMATURE':
        obj.show_in_front = False
mesh = bpy.data.objects[{mesh_name!r}]
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.color_type = 'MATERIAL'
            space.region_3d.view_location = {tuple(view_center)!r}
            space.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
            space.region_3d.view_distance = {view_distance!r}
            space.region_3d.view_perspective = 'ORTHO'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath={str(path)!r}, compress=True)
"""
            subprocess.run([bpy.app.binary_path, "-b", "--python-expr", code],
                           check=True, capture_output=True, text=True)
    finally:
        bpy.data.scenes.remove(isolated)
