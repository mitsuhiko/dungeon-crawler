"""
Umbra: the long sea snake of the flooded reef in the middle of act III (src/core/enemies.js UMBRA,
docs/bosses.md "Umbra").

A shadow of a snake: a long body of near-black blue skin, darker on the back and a deep teal on the
belly, a row of cyan lights glowing along each side (his markings: what you see of him in the dark
water) and a ragged fin running along his back from his head to the tip of his tail, a frill of
spines on each side of his head. His head is long and flat like an eel's, with a hinged lower jaw
full of thin teeth and pale glowing eyes. About 10.4 cells from snout to tail (core/umbra.js
UMBRA_FIGHT.body), his body as thick as core/umbra.js radiusAt says. Faces -Y in Blender, +Z up;
one unit = one game cell (exported at scale 1).

He lies straight in his rest pose: the middle of his head over the origin at the height of his
body's middle (`MID`), the snout out in front, the body back along +Y. His spine is a chain of
`BONES` bones, each parented to the root (not to each other), from his neck to the tip of his tail;
the game puts each where his body is (render/umbraview.js: along the way his head went, core/umbra.js
bodyAt), and his head bone where his head is. His clips only move what the game does not: his jaw,
his eyes (their scale: their glow), the frills of his head.

Clips, 30 fps, in place:
    UmbraSwim    2 s loop: the jaw working a little, the frills breathing (the game swims him)
    UmbraBite    1.25 s: the jaw opening wide as he draws back, snapping shut at 0.72 s
    UmbraWave    1.7 s: a roar, the jaw wide, the frills spread, at 1.0 s the shockwave
    UmbraQuake   3.9 s: jaw open as he dives, shut at the slam (1.1 s), lying stunned, eyes dim
    UmbraVents / UmbraSummon / UmbraJets / UmbraShield: a cast, the jaw open at the hit frame
    UmbraRage    2.6 s: a long roar, frills spread and shaking
    UmbraDeath   3 s: the jaw falling slack, the eyes fading out. Held.

Headless:
    Blender -b --python blender/umbra.py -- assets/umbra.glb blender/umbra.blend blender/previews/umbra-preview.png
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import creature as K

NAME, RIG_NAME = "Umbra", "UmbraRig"
SCENE, COLLECTION, STAGE = "Umbra", "UmbraAsset", "UmbraStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
SKIN_HEX = "#141b2c"
BELLY_HEX = "#1d4650"
FIN_HEX = "#2b2a58"
MARK_HEX = "#7ae8ff"
EYE_HEX = "#d8fbff"
MOUTH_HEX = "#3a1426"
TOOTH_HEX = "#e8f0ec"

# his body (core/umbra.js UMBRA_FIGHT.body): length, thickness
LENGTH, R_MAX, R_HEAD, R_TIP = 10.4, 0.46, 0.42, 0.08
MID = R_MAX                      # the height of his body's middle at rest
NECK = 0.45                      # cells from the middle of his head back to his neck
SNOUT = 0.8                      # cells from the middle of his head forward to his snout
BONES = 24                       # the spine's bones, neck to tail
VOXEL, DETAIL = 0.04, 0.014


def radius(u):
    """core/umbra.js radiusAt: u from the middle of his head (0) to the tip of his tail (1)."""
    if u < 0.08:
        return R_HEAD + (R_MAX - R_HEAD) * (u / 0.08)
    if u < 0.45:
        return R_MAX
    k = (u - 0.45) / 0.55
    return R_TIP + (R_MAX - R_TIP) * (1 - k * k)


def at(s):
    """The body's middle s cells back from the middle of his head (rest pose)."""
    return Vector((0, s, MID))


SPINE = [(f"spine_{i}", NECK + i * (LENGTH - NECK) / BONES, NECK + (i + 1) * (LENGTH - NECK) / BONES) for i in range(BONES)]


# --- sculpture ---------------------------------------------------------------
def head_sdfs():
    """SDFs of the head (x: side, y: back, z: up; the middle of his head at the origin's height)."""
    def skull(P):
        Q = P - np.array([0, 0, MID], np.float32)
        d = K.ellipsoid(Q, (0, 0.05, 0.04), (0.4, 0.62, 0.3))
        d = K.smin(d, K.ellipsoid(Q, (0, -0.48, 0.0), (0.27, 0.42, 0.17)), 0.12)   # the long flat snout
        for s in (1, -1):   # the sockets the eyes sit in, and the brows over them
            d = K.smin(d, K.ellipsoid(Q, (s * 0.3, -0.24, 0.1), (0.11, 0.14, 0.11)), 0.05)
            d = K.smin(d, K.ellipsoid(Q, (s * 0.3, -0.22, 0.2), (0.12, 0.2, 0.06)), 0.05)
        return K.smax(d, -(Q[..., 2] + 0.06), 0.03)   # (open below: the jaw is its own)

    def jaw(P):
        Q = P - np.array([0, 0, MID], np.float32)
        d = K.ellipsoid(Q, (0, -0.25, -0.1), (0.3, 0.62, 0.13))
        return K.smax(d, Q[..., 2] + 0.05, 0.02)

    def mouth(P):
        Q = P - np.array([0, 0, MID], np.float32)
        return K.ellipsoid(Q, (0, -0.3, -0.06), (0.25, 0.55, 0.035))

    def teeth(P):
        Q = P - np.array([0, 0, MID], np.float32)
        d = None
        for k in range(7):
            y = -0.72 + k * 0.1
            for s in (1, -1):
                x = s * (0.21 - 0.012 * (6 - k))
                for z0, z1 in ((-0.05, -0.12), (-0.07, 0.0)):
                    c = K.round_cone(Q, (x, y, z0), (x, y - 0.01, z1), 0.018, 0.003)
                    d = c if d is None else np.minimum(d, c)
        return d
    return skull, jaw, mouth, teeth


def body_sdf():
    n = 60
    pts = [at(NECK * 0.2 + (LENGTH - NECK * 0.2) * k / n) for k in range(n + 1)]
    radii = [radius((NECK * 0.2 + (LENGTH - NECK * 0.2) * k / n) / LENGTH) for k in range(n + 1)]

    def body(P):
        return K.tapered_tube(P, pts, radii)
    return body, pts, radii


def fin_sdf():
    """The ragged fin along his back: a thin membrane standing on his spine, from behind his head to
    the tip of his tail, its edge scalloped between its rays, lower towards the tail."""
    s0, s1 = 0.15, LENGTH - 0.1

    def top(y):
        u = np.clip(y / LENGTH, 0, 1)
        r = np.where(u < 0.08, R_HEAD + (R_MAX - R_HEAD) * (u / 0.08), np.where(u < 0.45, R_MAX, R_TIP + (R_MAX - R_TIP) * (1 - ((u - 0.45) / 0.55) ** 2)))
        return MID + r

    def fin(P):
        x, y, z = P[..., 0], P[..., 1], P[..., 2]
        base = top(y) - 0.06
        ray = np.abs(np.sin(y * TAU / 0.55))
        h = (0.1 + 0.2 * ray ** 0.6) * (1 - 0.55 * np.clip(y / LENGTH, 0, 1)) * np.clip((y - s0) / 0.5, 0, 1)
        d = np.maximum(np.abs(x) - 0.018, z - (base + h))
        d = np.maximum(d, base - 0.1 - z)
        return np.maximum(d, np.maximum(s0 - y, y - s1))
    return fin


def frill_sdf(side):
    """The frill of spines behind each side of his head, swept back."""
    def frill(P):
        d = None
        for k in range(5):
            base = Vector((side * 0.32, 0.12 + k * 0.07, MID + 0.08 - k * 0.04))
            tip = base + Vector((side * (0.32 - 0.03 * k), 0.36 + 0.03 * k, 0.12 - 0.07 * k))
            c = K.round_cone(P, base, tip, 0.045, 0.01)
            d = c if d is None else K.smin(d, c, 0.03)
        return d
    return frill


def marks_sdf():
    """The glowing lights along each side: a row of spots, smaller towards the tail, and two over the eyes."""
    spots = []
    for k in range(26):
        s = 0.7 + k * (LENGTH - 1.4) / 25
        u = s / LENGTH
        r = radius(u)
        for side in (1, -1):
            spots.append((at(s) + Vector((side * r * 0.93, 0, r * 0.25)), 0.055 * (1 - 0.5 * u) + 0.015))

    def marks(P):
        d = None
        for c, rr in spots:
            e = K.ellipsoid(P, tuple(c), (rr * 0.6, rr * 1.6, rr))
            d = e if d is None else np.minimum(d, e)
        return d
    return marks, spots


def eye_center(side):
    return Vector((side * 0.355, -0.24, MID + 0.11))


def build_mesh(coll):
    skull, jaw, mouth, teeth = head_sdfs()
    body, pts, radii = body_sdf()
    parts = K.Parts()
    lo, hi = K.bounds([Vector((0, -1.0, 0)), Vector((0, LENGTH + 0.2, 0)), Vector((0.6, 0, MID * 2 + 0.2)), Vector((-0.6, 0, -0.05))], 0.08)

    def skin(P):
        return K.smin(body(P), skull(P), 0.14)
    # the belly a deep teal, the back near black (by the height of the quad's middle over the body's middle)
    parts.add("body", skin, lo, hi, VOXEL, mat=lambda c: np.where(c[:, 2] < MID - 0.22, 1, 0))
    hlo, hhi = K.bounds([Vector((-0.45, -1.0, MID - 0.3)), Vector((0.45, 0.5, MID + 0.1))], 0.04)
    parts.add("jaw", jaw, hlo, hhi, DETAIL, mat=1)
    parts.add("head", mouth, hlo, hhi, DETAIL, mat=5)
    parts.add("head", teeth, hlo, hhi, 0.007, mat=6)
    flo, fhi = K.bounds([Vector((0, 0, MID)), Vector((0, LENGTH + 0.4, MID + 0.6))], 0.1)
    parts.add("fin", fin_sdf(), flo, fhi, 0.03, mat=2)
    for side, name in ((1, "frill.L"), (-1, "frill.R")):
        a, b = K.bounds([Vector((side * 0.25, 0.0, MID - 0.15)), Vector((side * 0.75, 0.75, MID + 0.35))], 0.06)
        parts.add(name, frill_sdf(side), a, b, 0.016, mat=2)
    marks, spots = marks_sdf()
    parts.add("marks", marks, Vector((-0.7, 0.2, 0)), Vector((0.7, LENGTH, MID * 2)), 0.02, mat=3)
    for side, name in ((1, "eye.L"), (-1, "eye.R")):
        e = eye_center(side)
        parts.add(name, lambda P, c=e: K.ellipsoid(P, tuple(c), (0.075, 0.095, 0.07)), e - Vector((0.12,) * 3), e + Vector((0.12,) * 3), 0.008, mat=4)
    obj = parts.mesh(NAME, coll, (("UmbraSkin", SKIN_HEX, 0), ("UmbraBelly", BELLY_HEX, 0), ("UmbraFins", FIN_HEX, 0),
                                  ("UmbraMarks_glow", MARK_HEX, 3.0), ("UmbraEyes_glow", EYE_HEX, 4.0), ("UmbraMouth", MOUTH_HEX, 0),
                                  ("UmbraTeeth", TOOTH_HEX, 0)))
    obj["enemy"] = "umbra"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    Z = (0, 0, 1)
    bones = [("root", (0, 0, 0), (0, 0.3, 0), None, False, Z)]
    bones.append(("head", at(NECK), at(-SNOUT), "root", True, Z))
    hinge = Vector((0, 0.05, MID - 0.08))
    bones.append(("jaw", hinge, hinge + Vector((0, -0.6, -0.04)), "head", True, Z))
    for side, name in ((1, "L"), (-1, "R")):
        e = eye_center(side)
        bones.append((f"eye.{name}", e, e + Vector((0, -0.08, 0)), "head", True, Z))
        f0 = Vector((side * 0.32, 0.12, MID + 0.06))
        bones.append((f"frill.{name}", f0, f0 + Vector((side * 0.2, 0.3, 0.05)), "head", True, Z))
    for name, s0, s1 in SPINE:
        bones.append((name, at(s0), at(s1), "root", True, Z))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "umbra", "forward": "-Y", "root_motion": False,
                                              "spine": [n for n, _, _ in SPINE], "neck": NECK, "length": LENGTH})


def spine_weights(s, names):
    """Linear blend between the neighbouring bones' middles along the body (the head's before the neck)."""
    centers = [(-0.2, "head")] + [((s0 + s1) / 2, name) for name, s0, s1 in SPINE]
    cs = np.array([c for c, _ in centers])
    W = np.zeros((len(s), len(names)), np.float32)
    idx = np.clip(np.searchsorted(cs, s) - 1, 0, len(cs) - 2)
    t = np.clip((s - cs[idx]) / (cs[idx + 1] - cs[idx]), 0, 1)
    t = t * t * (3 - 2 * t)
    for k, (_, name) in enumerate(centers):
        j = names.index(name)
        W[:, j] += np.where(idx == k, 1 - t, 0) + np.where(idx + 1 == k, t, 0)
    return W


def compute_weights(obj, owners):
    """The body, its fin and its lights along the spine (by how far back they are); the skull on the
    head bone, whole; the rest on its own bone."""
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind in ("body", "fin", "marks"):
            s = P[lo:hi, 1].astype(np.float32)
            block = spine_weights(s, names)
            head = s < NECK * 0.6
            block[head] = 0
            block[head, names.index("head")] = 1
            W[lo:hi] = block
        else:
            W[lo:hi, names.index(kind)] = 1
    K.write_weights(obj, names, W)


def build():
    scene = K.creature_scene(SCENE)
    K.clear_collection(COLLECTION)
    coll = K.collection(COLLECTION, scene)
    rig = build_rig(coll)
    obj, owners = build_mesh(coll)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    compute_weights(obj, owners)
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
def pose(jaw=0.0, eyes=1.0, frill=0.0, shake=0.0, t=0.0):
    """The bases (local, over the rest pose) of what his clips move."""
    out = {}
    out["jaw"] = Matrix.Rotation(-jaw, 4, "X")   # (opening: down)
    e = max(0.05, eyes)
    for side, name in ((1, "L"), (-1, "R")):
        out[f"eye.{name}"] = Matrix.Diagonal((e, e, e, 1))
        out[f"frill.{name}"] = Matrix.Rotation(side * (frill + shake * math.sin(TAU * 9 * t)), 4, "Z")
    return out


def keyed(*points):
    """A function of t through (t, value) points, eased between them."""
    def f(t):
        if t <= points[0][0]:
            return points[0][1]
        for (t0, v0), (t1, v1) in zip(points, points[1:]):
            if t <= t1:
                u = (t - t0) / (t1 - t0) if t1 > t0 else 1
                u = u * u * (3 - 2 * u)
                return v0 + (v1 - v0) * u
        return points[-1][1]
    return f


CLIP_SPEC = {
    # name: (seconds, hit time, jaw keys (degrees), frill keys (degrees), eye keys, shake keys)
    "UmbraBite": (1.25, 0.72, ((0, 4), (0.45, 52), (0.68, 56), (0.74, 0), (1.0, 6), (1.25, 4)), ((0, 0), (0.45, 18), (0.8, 6), (1.25, 0)), None, None),
    "UmbraWave": (1.7, 1.0, ((0, 4), (0.6, 30), (0.9, 62), (1.4, 58), (1.7, 4)), ((0, 0), (0.8, 35), (1.4, 30), (1.7, 0)), None, ((0, 0), (0.9, 1), (1.4, 0))),
    "UmbraQuake": (3.9, 1.1, ((0, 4), (0.8, 46), (1.05, 50), (1.12, 0), (1.3, 8), (3.6, 8), (3.9, 4)), ((0, 0), (0.9, 30), (1.3, -8), (3.6, -8), (3.9, 0)),
                   ((0, 1), (1.2, 1), (1.5, 0.55), (3.5, 0.55), (3.9, 1)), None),
    "UmbraVents": (1.6, 0.95, ((0, 4), (0.7, 40), (1.0, 48), (1.6, 4)), ((0, 0), (0.9, 25), (1.6, 0)), None, ((0.6, 0), (0.95, 0.6), (1.3, 0))),
    "UmbraSummon": (1.6, 0.95, ((0, 4), (0.8, 44), (1.0, 50), (1.6, 4)), ((0, 0), (0.9, 20), (1.6, 0)), None, None),
    "UmbraJets": (1.7, 1.1, ((0, 4), (0.9, 40), (1.15, 58), (1.7, 4)), ((0, 0), (1.0, 35), (1.7, 0)), None, ((0.8, 0), (1.1, 0.8), (1.5, 0))),
    "UmbraShield": (1.0, 0.6, ((0, 4), (0.5, 30), (0.7, 20), (1.0, 4)), ((0, 0), (0.5, 40), (1.0, 0)), None, None),
    "UmbraRage": (2.6, 1.9, ((0, 4), (0.5, 50), (0.8, 66), (2.2, 62), (2.6, 4)), ((0, 0), (0.6, 40), (2.2, 40), (2.6, 0)), None, ((0.5, 0), (0.8, 1), (2.2, 1), (2.6, 0))),
}


def animate(rig):
    rig.animation_data_create()
    names = []
    swim_frames = 60
    K.bake(rig, "UmbraSwim", [pose(jaw=D(4 + 3 * math.sin(TAU * f / swim_frames)), frill=D(6) * math.sin(TAU * f / swim_frames + 1), t=f / FPS)
                              for f in range(swim_frames + 1)], True, {"speed": 2.3})
    names.append("UmbraSwim")
    for name, (seconds, hit, jaw, frill, eyes, shake) in CLIP_SPEC.items():
        J, Fr = keyed(*jaw), keyed(*frill)
        E = keyed(*eyes) if eyes else (lambda t: 1)
        S = keyed(*shake) if shake else (lambda t: 0)
        n = round(seconds * FPS)
        act = K.bake(rig, name, [pose(jaw=D(J(f / FPS)), frill=D(Fr(f / FPS)), eyes=E(f / FPS), shake=D(6) * S(f / FPS), t=f / FPS) for f in range(n + 1)],
                     False, {"hit_time": hit, "hit_frame": round(hit * FPS)})
        act.pose_markers.new("Hit").frame = round(hit * FPS)
        names.append(name)
    death = keyed((0, 4), (0.4, 40), (1.6, 28), (3.0, 22))
    fade = keyed((0, 1), (0.8, 1), (2.6, 0.06), (3.0, 0.06))
    frill = keyed((0, 0), (0.6, 30), (2.0, -15), (3.0, -15))
    n = 3 * FPS
    K.bake(rig, "UmbraDeath", [pose(jaw=D(death(f / FPS)), eyes=fade(f / FPS), frill=D(frill(f / FPS))) for f in range(n + 1)], False,
           {"hold_last_frame": True, "hold_from": 2.6})
    names.append("UmbraDeath")
    K.register(rig, names)
    return names


def preview(scene, rig, path):
    """A still of him curled in an S along the floor, his head raised a little, roaring, as the game
    would lay his spine (each bone on the curve, along it: render/umbraview.js)."""
    rig.animation_data.action = bpy.data.actions["UmbraWave"]
    scene.frame_set(round(1.2 * FPS))

    def curve(s):
        u = s / LENGTH
        return Vector((1.6 * math.sin(u * TAU * 0.85), s * 0.62, MID + 0.5 * max(0, 1 - s / 2.5)))

    def place(name, s0, s1):
        pb, b = rig.pose.bones[name], rig.data.bones[name]
        a, c = curve(s0), curve(s1)
        rest = b.matrix_local
        y = (rest.to_3x3() @ Vector((0, 1, 0))).normalized()
        rot = y.rotation_difference((c - a).normalized()).to_matrix() @ rest.to_3x3()
        pb.matrix = Matrix.Translation(a) @ rot.to_4x4()
        bpy.context.view_layer.update()
    for name, s0, s1 in SPINE:
        place(name, s0, s1)
    place("head", NECK, -SNOUT)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    # and his head, close, his jaw open
    cam = scene.camera
    old = cam.location.copy(), cam.rotation_euler.copy(), cam.data.ortho_scale
    cam.location = (2.2, -2.6, 1.6)
    cam.rotation_euler = (Vector((0, 0.2, MID)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = 2.6
    scene.render.filepath = str(path).replace(".png", "-head.png")
    bpy.ops.render.render(write_still=True)
    cam.location, cam.rotation_euler, cam.data.ortho_scale = old


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj, 16000)
    names = animate(rig)
    obj.data.calc_loop_triangles()
    report = {"vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles), "bones": len(rig.data.bones),
              "clips": {n: round(bpy.data.actions[n]["duration"], 3) for n in names}}
    rig.animation_data.action = bpy.data.actions["UmbraSwim"]
    scene.frame_start, scene.frame_end = 0, 59
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if preview_path:
        K.setup_stage(scene, "Umbra", STAGE, (0, LENGTH * 0.33, 0.5), 7, camera=(7.0, -4.0, 6.0))
        Path(preview_path).parent.mkdir(parents=True, exist_ok=True)
        preview(scene, rig, preview_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), names, "Umbra", NAME, (0, LENGTH * 0.4, 0.5), 10)
    print("Umbra:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "umbra.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "umbra.blend"),
         preview_path=args[2] if len(args) > 2 else str(root / "previews" / "umbra-preview.png"))
