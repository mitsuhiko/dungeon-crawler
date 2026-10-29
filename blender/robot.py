"""
The robot: the hero's companion, a clockwork made by the star-readers of star-glass (docs/story.md,
"The robot").

A floating, faceted oval of clear, faintly aqua star-glass, cut in big flat facets like the glass
bird (blender/glassbird.py), a little wider at the top than at the bottom. On its front two round
eyes of glowing amber glass, each in a thin brass rim like a porthole; a thin brass band runs round
its waist. Inside, seen through the glass, an amber core glows (like the bird's), and behind it two
glass gears turn, meshed. On each side a glass gear turns as a hub, and from it a little wing of
four glass feathers rises and sweeps back, like the ark's (assets/film/ark.png). On top a small
wind-up key of glass on a brass shaft turns slowly. It has no legs: it hovers. Faces -Y in
Blender, +Z up; one unit = one game cell. About 0.4 tall and 0.33 wide, with its wings 0.6 wide,
its middle 0.9 above the floor while it hovers (about the hero's shoulders: the hero is ~1.1).

Every part is rigid on its bone (one mesh, flat shaded, each vertex on one bone):
    root      the floor under it (not deforming)
    body      the glass egg, the waist band, the eye rims, the hubs' axles, the key's shaft
    core      the amber core (pulses: scale)
    eye.L/R   the amber eyes (blink: squashed along the bone's Z; widen: scale)
    hub.L/R   the side gears (turn about the bone, the side's axis)
    wing.L/R  the wings (flap about the body's forward axis at the hub, sweep about its up axis)
    gear.A/B  the two gears inside (turn about the bone, the forward axis; A has 12 teeth, B 8)
    key       the wind-up key's bow (turns about the bone, up)

Clips, 30 fps, in place (the game moves it):
    RobotHover    96-frame loop: floating, bobbing and looking about, the wings fluttering,
                  the gears turning, one blink.
    RobotFly      48-frame loop: following: leaning forward, the wings beating harder.
    RobotTalk     48-frame loop: while it talks: the eyes and the core pulse with the syllables,
                  it nods and sways, the gears turn twice as fast.
    RobotDormant  90-frame loop: lying on its back in the mud where it is found, the wings
                  flopped, the eyes shut, the gears still; once a wing twitches and an eye
                  flickers.
    RobotWake     3.6 s: from RobotDormant: twitches, the eyes flicker open (extras.wake_frame),
                  the gears start, it lifts off (extras.lift_frame), shakes the mud off and
                  settles into RobotHover's first frame.
    RobotRevive   2.4 s: it brings the hero back: rises, turns right round, spreads its wings and
                  its core flares at frame 40 (extras.hit_frame: the hero comes back), then
                  settles.
    RobotCheer    1.6 s: a happy hop and a somersault, the eyes squinting.
    RobotCarry    32-frame loop: carrying the hero out of a fluid (they hang from it by the hands,
                  their clip Hang, blender/character.py): straining, the wings beating hard and
                  wide, the eyes squeezed, the core glowing bright, the gears racing.

Headless:
    Blender -b --python blender/robot.py -- assets/robot.glb blender/robot.blend \
        blender/previews/robot-preview.png
then compress the GLB: node tools/compress-assets.mjs assets/robot.glb
"""
import math
from pathlib import Path
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F

NAME, RIG_NAME = "Robot", "RobotRig"
SCENE, COLLECTION, STAGE = "Robot", "RobotAsset", "RobotStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
CLIPS = ("RobotHover", "RobotFly", "RobotTalk", "RobotDormant", "RobotWake", "RobotRevive", "RobotCheer", "RobotCarry")
SIDES = (("L", 1), ("R", -1))           # the robot's left is +X (it faces -Y)

GLASS_HEX, GEAR_HEX, EYE_HEX, CORE_HEX, BRASS_HEX = "#bfeee6", "#d6f7f1", "#ffa43c", "#ffa640", "#c09040"
VOXEL = 0.004
TRIANGLES = 240                          # the egg's facets
SEED = 11

HOVER_FRAMES, FLY_FRAMES, TALK_FRAMES, DORMANT_FRAMES = 96, 48, 48, 90
WAKE_FRAMES, WAKE_EYES, WAKE_LIFT = 108, 36, 54
REVIVE_FRAMES, REVIVE_HIT = 72, 40
CHEER_FRAMES = 48
CARRY_FRAMES = 32

# --- body plan -------------------------------------------------------------------------------------
CENTRE = V((0, 0, 0.9))
BODY_R = (0.165, 0.145, 0.2)
EGG = 0.09                               # how much wider it is at the top than at the bottom
EYE_DIR, EYE_R = V((0.55, -0.8, 0.3)).normalized(), 0.048
BAND_Z = -0.06                           # the waist band, under the middle
HUB_Z, HUB_ROOT, HUB_TIP, HUB_TEETH = 0.045, 0.04, 0.054, 10
FEATHERS = ((76, 0.2, 0.05), (52, 0.18, 0.048), (28, 0.15, 0.044), (5, 0.11, 0.038))   # (up from level, length, width)
SWEEP_BACK = 0.38
GEAR_A = dict(root=0.054, tip=0.067, teeth=12, hole=0.018, thick=0.014)
GEAR_B = dict(teeth=8, hole=0.012, thick=0.014)
GEAR_A_C = CENTRE + V((-0.045, 0.062, -0.025))
GEAR_B_DIR = V((0.62, 0, 0.78)).normalized()
CORE_C, CORE_R = CENTRE + V((0, 0.01, -0.012)), 0.034
B_RATIO = GEAR_A["teeth"] / GEAR_B["teeth"]


def egg_sdf(P):
    q = P - np.asarray(CENTRE, np.float32)
    zn = np.clip(q[..., 2] / BODY_R[2], -1, 1)
    k = (1 + EGG * zn)[..., None]
    q = np.concatenate([q[..., :2] / k, q[..., 2:]], axis=-1)
    return K.ellipsoid(q, (0, 0, 0), BODY_R)


def sdf_at(p):
    return float(egg_sdf(np.asarray([tuple(p)], np.float32))[0])


def surface(direction, start=CENTRE):
    """Where a ray from `start` leaves the egg (on its smooth surface), and the normal there."""
    d = direction.normalized()
    t = 0.0
    while sdf_at(start + d * t) < 0:
        t += 0.0005
    p = start + d * t
    e = 0.001
    n = V(tuple(sdf_at(p + V(a) * e) - sdf_at(p - V(a) * e) for a in ((1, 0, 0), (0, 1, 0), (0, 0, 1))))
    return p, n.normalized()


def frame(axis, hint):
    """An orthonormal 3x3 (columns x, y, z) with z along `axis` and x as close to `hint` as can be."""
    z = axis.normalized()
    x = (hint - z * hint.dot(z)).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def side_point(s):
    return surface(V((s, 0, 0)), CENTRE + V((0, 0, HUB_Z)))


# --- low-poly pieces (local coordinates; z is the piece's axis) -----------------------------------
def placed(co, faces, origin, basis):
    co = np.asarray(co, np.float64) @ np.asarray(basis, np.float64).T + np.asarray(tuple(origin), np.float64)
    return co, faces


def prism_ring(outer, inner, thick):
    """A flat ring: an outline of points (x, y) outside, as many inside, `thick` deep along z."""
    n, h = len(outer), thick / 2
    co = [(x, y, h) for x, y in outer] + [(x, y, h) for x, y in inner] + \
         [(x, y, -h) for x, y in outer] + [(x, y, -h) for x, y in inner]
    o, i, ob, ib = 0, n, 2 * n, 3 * n
    faces = []
    for k in range(n):
        j = (k + 1) % n
        faces += [(o + k, o + j, i + j, i + k), (ob + k, ib + k, ib + j, ob + j),
                  (o + k, ob + k, ob + j, o + j), (i + k, i + j, ib + j, ib + k)]
    return co, faces


def gear(root, tip, teeth, hole, thick, phase=0.0):
    """A gear: trapezoid teeth round a ring with a hole (four outline points a tooth)."""
    outer, inner, pitch = [], [], TAU / teeth
    for k in range(teeth):
        for f, r in ((0, root), (0.2, tip), (0.5, tip), (0.7, root)):
            a = phase + (k + f) * pitch
            outer.append((r * math.cos(a), r * math.sin(a)))
            inner.append((hole * math.cos(a), hole * math.sin(a)))
    return prism_ring(outer, inner, thick)


def disc(r, thick, n=8):
    h = thick / 2
    co = [(0, 0, h), (0, 0, -h)] + [(r * math.cos(TAU * k / n), r * math.sin(TAU * k / n), z) for z in (h, -h) for k in range(n)]
    faces = []
    for k in range(n):
        j = (k + 1) % n
        faces += [(0, 2 + k, 2 + j), (1, 2 + n + j, 2 + n + k), (2 + k, 2 + n + k, 2 + n + j, 2 + j)]
    return co, faces


def torus(R, r, n=10, m=4):
    co = []
    for k in range(n):
        a = TAU * k / n
        for l in range(m):
            b = TAU * l / m + math.pi / m
            co.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    faces = [(k * m + l, ((k + 1) % n) * m + l, ((k + 1) % n) * m + (l + 1) % m, k * m + (l + 1) % m)
             for k in range(n) for l in range(m)]
    return co, faces


def band(z_off, height, thick, n=18):
    """The waist band: a flat strip round the egg at CENTRE.z + z_off, just outside it."""
    outer, inner = [], []
    for k in range(n):
        a = TAU * (k + 0.5) / n
        p, _ = surface(V((math.cos(a), math.sin(a), 0)), CENTRE + V((0, 0, z_off)))
        rel = V((p.x, p.y))
        outer.append(tuple(rel + rel.normalized() * (thick + 0.004)))
        inner.append(tuple(rel - rel.normalized() * 0.006))
    co, faces = prism_ring(outer, inner, height)
    return placed(co, faces, CENTRE + V((0, 0, z_off)), Matrix.Identity(3))


def feather(length, width, thick):
    """A glass feather: a long crystal, pointed at both ends, its cross-section a diamond (x: its
    width, z: its thickness), along y."""
    stations = ((0.2, 0.75, 1.0), (0.55, 1.0, 0.8), (0.85, 0.6, 0.5))
    co = [(0, 0, 0)]
    for u, w, t in stations:
        co += [(width * w / 2, length * u, 0), (0, length * u, thick * t / 2),
               (-width * w / 2, length * u, 0), (0, length * u, -thick * t / 2)]
    co.append((0, length, 0))
    tip = len(co) - 1
    faces = [(0, 1 + (k + 1) % 4, 1 + k) for k in range(4)]
    for s in range(len(stations) - 1):
        a, b = 1 + 4 * s, 5 + 4 * s
        faces += [(a + k, a + (k + 1) % 4, b + (k + 1) % 4, b + k) for k in range(4)]
    last = 1 + 4 * (len(stations) - 1)
    faces += [(last + k, last + (k + 1) % 4, tip) for k in range(4)]
    return co, faces


def ico(r, subdivisions=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=r)
    co = [tuple(v.co) for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return co, faces


# --- the parts -------------------------------------------------------------------------------------
def faceted_shell():
    """The egg's SDF meshed, then collapsed to TRIANGLES big flat facets (as the glass bird)."""
    lo, hi = CENTRE - V((0.21, 0.19, 0.23)), CENTRE + V((0.21, 0.19, 0.23))
    me = F._sdf_to_mesh("RobotDense", egg_sdf, tuple(lo), tuple(hi), VOXEL)
    obj = bpy.data.objects.new("RobotDense", me)
    bpy.context.scene.collection.objects.link(obj)
    me.calc_loop_triangles()
    mod = obj.modifiers.new("Facets", "DECIMATE")
    mod.decimate_type, mod.use_collapse_triangulate = "COLLAPSE", True
    mod.ratio = TRIANGLES / len(me.loop_triangles)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(me)
    co = [tuple(v.co) for v in low.vertices]
    faces = [tuple(p.vertices) for p in low.polygons]
    bpy.data.meshes.remove(low)
    return co, faces


def layout():
    """Where everything sits: {name: (origin, basis)} for the bones and the pieces."""
    at = {}
    for side, s in SIDES:
        p, n = surface(V((s * EYE_DIR.x, EYE_DIR.y, EYE_DIR.z)))
        at[f"eye.{side}"] = (p + n * 0.006, frame(n, V((0, 0, 1))))
        hub, hn = side_point(s)
        at[f"hub.{side}"] = (hub + hn * 0.012, frame(V((s, 0, 0)), V((0, 0, 1))))
        at[f"wing.{side}"] = (hub + hn * 0.026, frame(V((s, 0, 0)), V((0, 0, 1))))
    top, _ = surface(V((0, 0, 1)))
    at["key"] = (top, frame(V((0, 0, 1)), V((1, 0, 0))))
    at["core"] = (CORE_C, Matrix.Identity(3))
    fwd = V((0, -1, 0))
    at["gear.A"] = (GEAR_A_C, frame(fwd, V((1, 0, 0))))
    pitch_a = (GEAR_A["root"] + GEAR_A["tip"]) / 2
    pitch_b = pitch_a / B_RATIO
    at["gear.B"] = (GEAR_A_C + GEAR_B_DIR * (pitch_a + pitch_b), frame(fwd, V((1, 0, 0))))
    return at


def feather_dirs(s):
    out = []
    for up, length, width in FEATHERS:
        a = D(up)
        out.append((V((s * math.cos(a), SWEEP_BACK, math.sin(a))).normalized(), length, width))
    return out


def parts():
    """(co, faces, material, bone) for every piece."""
    at = layout()
    out = [(*faceted_shell(), "RobotGlass", "body")]
    out.append((*band(BAND_Z, 0.026, 0.008), "RobotBrass", "body"))
    for side, s in SIDES:
        o, b = at[f"eye.{side}"]
        out.append((*placed(*disc(EYE_R, 0.022, 10), o, b), "RobotEye", f"eye.{side}"))
        out.append((*placed(*torus(EYE_R + 0.006, 0.009, 12, 4), o + b.col[2] * 0.006, b), "RobotBrass", "body"))
        o, b = at[f"hub.{side}"]
        out.append((*placed(*gear(HUB_ROOT, HUB_TIP, HUB_TEETH, 0.016, 0.016), o, b), "RobotGear", f"hub.{side}"))
        out.append((*placed(*disc(0.019, 0.04, 8), o, b), "RobotBrass", "body"))
        root, _ = at[f"wing.{side}"]
        for d, length, width in feather_dirs(s):
            w = V((0, -1, 0)).cross(d).normalized()          # its width, in the wing's plane
            n = d.cross(w)                                    # its thickness
            basis = Matrix((w, d, n)).transposed()
            out.append((*placed(*feather(length, width, 0.012), root, basis), "RobotGlass", f"wing.{side}"))
    o, b = at["key"]
    out.append((*placed(*disc(0.01, 0.07, 6), o + V((0, 0, 0.012)), b), "RobotBrass", "body"))
    key_basis = frame(V((0, -1, 0)), V((1, 0, 0)))             # the bow stands upright, facing forward
    for s in (-1, 1):
        out.append((*placed(*torus(0.026, 0.008, 10, 4), o + V((s * 0.03, 0, 0.068)), key_basis), "RobotGear", "key"))
    out.append((*placed(*disc(0.016, 0.014, 6), o + V((0, 0, 0.048)), b), "RobotGear", "key"))
    out.append((*placed(*ico(CORE_R), CORE_C, Matrix.Identity(3)), "RobotCore", "core"))
    o, b = at["gear.A"]
    to_b = (b.inverted() @ GEAR_B_DIR)
    phi = math.atan2(to_b.y, to_b.x)                             # towards B, in A's plane
    pitch_a, pitch_b = TAU / GEAR_A["teeth"], TAU / GEAR_B["teeth"]
    out.append((*placed(*gear(**GEAR_A, phase=phi - 0.35 * pitch_a), o, b), "RobotGear", "gear.A"))
    o, b = at["gear.B"]
    root_b = GEAR_A["root"] / B_RATIO * 0.97
    tip_b = root_b + (GEAR_A["tip"] - GEAR_A["root"])
    out.append((*placed(*gear(root_b, tip_b, phase=phi + math.pi - 0.85 * pitch_b, **GEAR_B), o, b), "RobotGear", "gear.B"))
    return out, at


# --- materials, mesh, rig ---------------------------------------------------------------------------
def materials():
    out = {}
    for name, hex_color, emission, roughness in (("RobotGlass", GLASS_HEX, 0, 0.04), ("RobotGear", GEAR_HEX, 0, 0.08),
                                                 ("RobotEye", EYE_HEX, 1.4, 0.3), ("RobotCore", CORE_HEX, 1.2, 0.4),
                                                 ("RobotBrass", BRASS_HEX, 0, 0.32)):
        mat = K.material(name, hex_color, emission, roughness)
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Subsurface Weight"].default_value = 0
        if name in ("RobotGlass", "RobotGear"):
            bsdf.inputs["Transmission Weight"].default_value = 1
            bsdf.inputs["IOR"].default_value = 1.45
            mat.use_raytrace_refraction = True          # (the preview: see the core and the gears inside)
            mat.thickness_mode = "SLAB"                 # a thin shell of glass, not a solid lens
        if name == "RobotBrass":
            bsdf.inputs["Metallic"].default_value = 1
        out[name] = mat
    return out


def bone_list(at):
    up = (0, 0, 1)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", CENTRE, CENTRE + V((0, 0, 0.2)), "root", True, (0, -1, 0)),
             ("core", CORE_C, CORE_C + V((0, 0, 0.08)), "body", True, (0, -1, 0))]
    for name in ("eye.L", "eye.R", "hub.L", "hub.R", "gear.A", "gear.B", "key"):
        o, b = at[name]
        bones.append((name, o, o + b.col[2] * 0.06, "body", True, b.col[0] if name != "key" else (0, -1, 0)))
    for side, s in SIDES:
        o, _ = at[f"wing.{side}"]
        mid = feather_dirs(s)[1][0]
        bones.append((f"wing.{side}", o, o + mid * 0.12, "body", True, (0, -1, 0)))
    return bones


def build():
    scene = K.creature_scene(SCENE)
    K.clear_collection(COLLECTION)
    coll = K.collection(COLLECTION, scene)
    mats = materials()
    pieces, at = parts()
    rig = K.armature(RIG_NAME, coll, bone_list(at), {
        "companion": "robot", "forward": "-Y", "hover_height": round(CENTRE.z, 3), "root_motion": False})
    names = [m for m in mats]
    co, faces, mat_of, bone_of, n = [], [], [], [], 0
    for c, f, mat, bone in pieces:
        co.append(np.asarray(c, np.float64))
        faces += [tuple(i + n for i in face) for face in f]
        mat_of += [names.index(mat)] * len(f)
        bone_of.append((n, n + len(c), bone))
        n += len(c)
    me = bpy.data.meshes.new(NAME)
    me.from_pydata(np.concatenate(co).tolist(), [], faces)
    for m in names:
        me.materials.append(mats[m])
    me.polygons.foreach_set("material_index", np.asarray(mat_of, np.int32))
    bm = bmesh.new()                                 # every piece closed, its faces outward
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    me.validate()
    me.shade_flat()
    obj = bpy.data.objects.new(NAME, me)
    coll.objects.link(obj)
    obj["companion"] = "robot"
    obj["style"] = "glass"
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    groups = {}
    for lo, hi, bone in bone_of:
        g = groups.get(bone) or obj.vertex_groups.new(name=bone)
        groups[bone] = g
        g.add(list(range(lo, hi)), 1.0, "REPLACE")
    return scene, rig, obj


# --- motion -----------------------------------------------------------------------------------------
def params(**kw):
    p = {"pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "flap": [0.0, 0.0], "sweep": [0.0, 0.0],
         "eye": [1.0, 1.0], "eye_size": 1.0, "core": 1.0, "gear": 0.0, "hub": 0.0, "key": 0.0}
    p.update(kw)
    return p


def mix(a, b, t):
    out = {}
    for k, va in a.items():
        vb = b[k]
        out[k] = [x + (y - x) * t for x, y in zip(va, vb)] if isinstance(va, list) else va + (vb - va) * t
    return out


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        B = L @ Matrix.Translation(p["pos"]) @ K.about(CENTRE, R)
        bases["body"] = skel.set("body", poses, B @ skel.rest["body"])
        bases["core"] = skel.set("core", poses, B @ skel.rest["core"] @ Matrix.Diagonal((p["core"],) * 3 + (1,)))
        for i, (side, s) in enumerate(SIDES):
            e = p["eye_size"]
            bases[f"eye.{side}"] = skel.set(f"eye.{side}", poses, B @ skel.rest[f"eye.{side}"]
                                            @ Matrix.Diagonal((e, e, e * max(0.06, p["eye"][i]), 1)))
            bases[f"hub.{side}"] = skel.set(f"hub.{side}", poses, B @ skel.rest[f"hub.{side}"]
                                            @ Matrix.Rotation(s * TAU * p["hub"], 4, "Y"))
            root = skel.rest[f"wing.{side}"].translation
            w = C.rot_z(s * p["sweep"][i]) @ C.rot_y(-s * p["flap"][i])
            bases[f"wing.{side}"] = skel.set(f"wing.{side}", poses, B @ K.about(root, w) @ skel.rest[f"wing.{side}"])
        bases["gear.A"] = skel.set("gear.A", poses, B @ skel.rest["gear.A"] @ Matrix.Rotation(TAU * p["gear"], 4, "Y"))
        bases["gear.B"] = skel.set("gear.B", poses, B @ skel.rest["gear.B"]
                                   @ Matrix.Rotation(-TAU * p["gear"] * B_RATIO, 4, "Y"))
        bases["key"] = skel.set("key", poses, B @ skel.rest["key"] @ Matrix.Rotation(TAU * p["key"], 4, "Y"))
        return bases
    return solve


def bump(t, a, b):
    """0 before a, up to 1 in the middle, 0 again at b."""
    return math.sin(math.pi * C.smoothstep(a, b, t)) if a < t < b else 0.0


def hover(f, n=HOVER_FRAMES):
    """Floating: everything a whole number of times round the loop, so it closes."""
    w = TAU * f / n
    t = f / FPS
    flutter = D(16) * math.sin(8 * w)
    blink = 1 - bump(t, 2.1, 2.35)
    return params(pos=V((0.01 * math.sin(w), 0, 0.035 * math.sin(2 * w))), pitch=D(3) * math.sin(2 * w + 1),
                  roll=D(4) * math.sin(w), yaw=D(8) * math.sin(w + 0.5),
                  flap=[D(8) + flutter, D(8) + D(16) * math.sin(8 * w + 0.4)], sweep=[D(3) * math.sin(4 * w)] * 2,
                  eye=[blink, blink], core=1 + 0.05 * math.sin(2 * w), gear=2 * f / n, hub=f / n, key=f / n)


def fly(f, n=FLY_FRAMES):
    w = TAU * f / n
    beat = math.sin(6 * w)
    return params(pos=V((0, 0, 0.012 * math.sin(6 * w - 1))), pitch=D(16) + D(2) * math.sin(6 * w),
                  roll=D(5) * math.sin(w), yaw=D(3) * math.sin(w + 1),
                  flap=[D(12) + D(34) * beat] * 2, sweep=[D(14) + D(6) * math.sin(6 * w + 1)] * 2,
                  core=1 + 0.04 * math.sin(2 * w), gear=2 * f / n, hub=2 * f / n, key=f / n)


def talk(f, n=TALK_FRAMES):
    w = TAU * f / n
    syll = max(0.0, math.sin(6 * w)) * (0.7 + 0.3 * math.sin(2 * w + 1)) + 0.4 * max(0.0, math.sin(10 * w + 2))
    syll = min(1.0, syll)
    return params(pos=V((0, 0, 0.018 * syll + 0.01 * math.sin(2 * w))), pitch=D(5) * math.sin(2 * w) - D(4) * syll,
                  roll=D(6) * math.sin(w), yaw=D(5) * math.sin(w + 1),
                  flap=[D(10) + D(12) * math.sin(8 * w)] * 2, sweep=[D(4) * math.sin(4 * w)] * 2,
                  eye=[1 - 0.25 * syll] * 2, eye_size=1 + 0.12 * syll, core=1 + 0.22 * syll,
                  gear=2 * f / n, hub=f / n, key=f / n)


DORMANT_DROP = [None]   # how far its middle sinks to lie on the floor (measured once, animate())


def dormant(f=0, n=DORMANT_FRAMES):
    t = f / FPS
    twitch = bump(t, 1.55, 1.85)
    flicker = bump(t, 2.2, 2.45)
    return params(pos=V((0, 0, -(DORMANT_DROP[0] or 0))), pitch=D(-78), roll=D(16), yaw=D(24),
                  flap=[D(-28), D(-22) + D(25) * twitch], sweep=[D(48), D(44) - D(10) * twitch],
                  eye=[0.06, 0.06 + 0.35 * flicker])


def wake(f):
    k, t = C.keyframes, f / FPS
    lie, air = dormant(0), hover(0)
    up = k((0, 0), (1.8, 0), (2.6, 1))(t)
    p = mix(lie, air, up)
    twitch = bump(t, 0.5, 0.8)
    p["flap"] = [p["flap"][0] + D(20) * twitch, p["flap"][1] + D(30) * bump(t, 0.65, 0.95)]
    eye = max(0.35 * bump(t, 0.75, 0.95), k((0, 0.06), (1.0, 0.06), (WAKE_EYES / FPS, 1))(t))
    eye -= 0.9 * bump(t, 1.45, 1.6)                                   # one blink, to see
    p["eye"] = [max(0.06, eye)] * 2
    p["eye_size"] = 1 + 0.15 * bump(t, 1.1, 1.6)
    flutter = k((0, 0), (1.3, 0), (1.6, 1), (2.8, 1), (3.3, 0))(t)
    beat = flutter * (D(28) * math.sin(TAU * 4.2 * (t - 1.3)))
    p["flap"] = [x + beat for x in p["flap"]]
    p["roll"] += D(4) * math.sin(TAU * 5 * t) * bump(t, 1.3, 1.8)    # it rocks in the mud
    shake = bump(t, 2.6, 3.15)
    p["yaw"] += D(28) * math.sin(TAU * 6 * (t - 2.6)) * shake          # shakes the mud off
    p["roll"] += D(10) * math.sin(TAU * 6 * (t - 2.6) + 1) * shake
    p["pos"] = p["pos"] + V((0, 0, 0.06 * bump(t, 2.4, 3.3)))
    spin = k((0, 0), (1.0, 0), (WAKE_FRAMES / FPS, 1))(t)              # the clockwork starts
    p["gear"], p["hub"], p["key"] = 2 * spin, spin, spin
    p["core"] = 1 + 0.25 * bump(t, 0.9, 1.5)
    return p


def one_shot(t, end, custom, turns):
    """A clip that starts and ends in RobotHover's first frame: `custom` blended in and out of it,
    and `turns` (whole turns by the end: the spins, the gears) added as they are."""
    env = C.keyframes((0, 0), (0.2, 1), (end - 0.35, 1), (end, 0))(t)
    p = mix(hover(0), custom, env)
    for key, value in turns.items():
        p[key] += value
    return p


def revive(f):
    k, t = C.keyframes, f / FPS
    hit, end = REVIVE_HIT / FPS, REVIVE_FRAMES / FPS
    p = hover(0)
    rise = k((0, 0), (0.6, 1), (hit + 0.35, 1), (REVIVE_FRAMES / FPS, 0))(t)
    turn = k((0, 0), (0.25, 0), (hit, 1))(t)
    spread = k((0, 0), (0.5, 1), (hit + 0.4, 1), (REVIVE_FRAMES / FPS, 0))(t)
    flare = bump(t, hit - 0.25, hit + 0.6)
    beat = D(18) * math.sin(TAU * 4 * t) * (1 - spread)
    p.update(pos=V((0, 0, 0.22 * rise)), pitch=D(-14) * flare,
             flap=[D(8) + D(46) * spread + beat] * 2, sweep=[D(-18) * spread] * 2,
             eye=[1.0, 1.0], eye_size=1 + 0.25 * flare, core=1 + 0.9 * flare)
    whole = k((0, 0), (end, 1))(t)
    return one_shot(t, end, p, {"yaw": TAU * turn, "gear": 4 * whole, "hub": 2 * whole, "key": whole})


def cheer(f):
    k, t = C.keyframes, f / FPS
    end = CHEER_FRAMES / FPS
    p = hover(0)
    hop = k((0, 0), (0.15, -0.05), (0.55, 0.24), (1.15, 0.1), (end, 0))(t)
    flip = k((0, 0), (0.3, 0), (1.05, 1))(t)
    happy = k((0, 0), (0.15, 1), (1.3, 1), (end, 0))(t)
    beat = D(30) * math.sin(TAU * 4 * t) * happy
    p.update(pos=V((0, 0, hop)), roll=D(6) * math.sin(TAU * 2 * t) * happy,
             flap=[D(8) + D(20) * happy + beat] * 2, eye=[1 - 0.55 * happy] * 2, eye_size=1 + 0.1 * happy,
             core=1 + 0.2 * happy)
    whole = k((0, 0), (end, 1))(t)
    return one_shot(t, end, p, {"pitch": -TAU * flip, "gear": 2 * whole, "hub": whole, "key": whole})


def carry(f, n=CARRY_FRAMES):
    """Carrying the hero: everything a whole number of times round the loop, so it closes."""
    w = TAU * f / n
    beat = math.sin(4 * w)
    strain = 0.5 + 0.5 * math.sin(2 * w + 0.6)
    return params(pos=V((0.008 * math.sin(w), 0, 0.03 * math.sin(4 * w - 1.2))), pitch=D(-4) + D(3) * math.sin(4 * w),
                  roll=D(6) * math.sin(w) + D(2) * math.sin(4 * w + 1), yaw=D(4) * math.sin(w + 0.7),
                  flap=[D(16) + D(42) * beat, D(16) + D(42) * math.sin(4 * w + 0.15)], sweep=[D(-12) + D(8) * math.sin(4 * w + 1)] * 2,
                  eye=[0.45 + 0.1 * strain] * 2, eye_size=1.05, core=1.2 + 0.12 * math.sin(4 * w),
                  gear=4 * f / n, hub=4 * f / n, key=2 * f / n)


def animate(rig, obj):
    rig.animation_data_create()
    # how far it sinks to lie on its back: bake the lying pose once and measure it
    probe = K.bake(rig, "RobotProbe", [solver(rig, lambda f: dormant(0))(0, 0.0)], False)
    DORMANT_DROP[0] = float(C.mesh_min_z(rig, obj, probe)[0]) - 0.002
    bpy.data.actions.remove(probe)
    K.ground_clip(rig, obj, "RobotHover", solver(rig, hover), HOVER_FRAMES, cyclic=True)
    K.ground_clip(rig, obj, "RobotFly", solver(rig, fly), FLY_FRAMES, cyclic=True)
    K.ground_clip(rig, obj, "RobotTalk", solver(rig, talk), TALK_FRAMES, cyclic=True)
    K.ground_clip(rig, obj, "RobotDormant", solver(rig, dormant), DORMANT_FRAMES, cyclic=True)
    K.ground_clip(rig, obj, "RobotWake", solver(rig, wake), WAKE_FRAMES,
                  extras={"wake_frame": WAKE_EYES, "lift_frame": WAKE_LIFT, "then": "RobotHover"})
    a = K.ground_clip(rig, obj, "RobotRevive", solver(rig, revive), REVIVE_FRAMES,
                      extras={"hit_frame": REVIVE_HIT, "hit_time": REVIVE_HIT / FPS, "then": "RobotHover"})
    a.pose_markers.new("Revive").frame = REVIVE_HIT
    K.ground_clip(rig, obj, "RobotCheer", solver(rig, cheer), CHEER_FRAMES, extras={"then": "RobotHover"})
    K.ground_clip(rig, obj, "RobotCarry", solver(rig, carry), CARRY_FRAMES, cyclic=True)
    K.register(rig, CLIPS)


# --- checks -----------------------------------------------------------------------------------------
def validate(rig, obj):
    """Every vertex on exactly one bone, every piece closed, the loops closing, nothing under the
    floor, and the one-shots ending where RobotHover starts."""
    assert obj.parent == rig and obj.modifiers[0].type == "ARMATURE"
    for v in obj.data.vertices:
        assert len(v.groups) == 1 and abs(v.groups[0].weight - 1) < 1e-6, v.index
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    open_edges = [e for e in bm.edges if len(e.link_faces) != 2]
    bm.free()
    assert not open_edges, f"{len(open_edges)} open edges"
    scene = bpy.context.scene

    def pose(name, frame):
        rig.animation_data.action = bpy.data.actions[name]
        scene.frame_set(frame)
        return {pb.name: pb.matrix.copy() for pb in rig.pose.bones}

    def same(a, b, what):
        for name in a:
            err = max(abs(a[name][i][j] - b[name][i][j]) for i in range(4) for j in range(4))
            assert err < 0.002, (what, name, err)

    report = []
    start = pose("RobotHover", 0)
    for name in CLIPS:
        act = bpy.data.actions[name]
        minima = C.mesh_min_z(rig, obj, act)
        assert minima.min() > -0.001, (name, float(minima.min()))
        end = int(act.frame_end)
        if act.use_cyclic:
            same(pose(name, 0), pose(name, end), name)
        elif act.get("then") == "RobotHover":
            same(start, pose(name, end), name)
        report.append({"name": name, "duration": round(act["duration"], 3), "min_z": round(float(minima.min()), 4)})
    obj.data.calc_loop_triangles()
    return {"vertices": len(obj.data.vertices), "triangles": len(obj.data.loop_triangles),
            "bones": len(rig.data.bones), "clips": report}


# --- previews -----------------------------------------------------------------------------------------
def preview(scene, rig, path):
    """Shots of the clips on the grey stage, each framed on the robot where it is. In Cycles: EEVEE
    hides what is inside the glass."""
    cam = scene.camera
    cam.data.type, cam.data.lens = "PERSP", 60
    engine, view = scene.render.engine, scene.view_settings.view_transform
    scene.render.engine, scene.view_settings.view_transform = "CYCLES", "Standard"
    scene.cycles.samples, scene.cycles.use_denoising = 64, True
    up = CENTRE.z
    shots = [("RobotHover", 0, (0.0, -1.9, up + 0.25), up), ("RobotHover", 30, (-1.4, -1.3, up + 0.6), up),
             ("RobotHover", 0, (1.9, 0.6, up + 0.3), up), ("RobotHover", 66, (0.9, 1.6, up + 0.9), up),
             ("RobotFly", 10, (-1.9, -0.4, up + 0.3), up), ("RobotTalk", 4, (0.6, -1.8, up + 0.5), up + 0.02),
             ("RobotDormant", 0, (-1.0, -1.2, 1.5), 0.15), ("RobotWake", 40, (0.8, -1.6, 1.1), 0.3),
             ("RobotWake", 84, (-0.5, -1.9, 1.3), up + 0.05), ("RobotRevive", REVIVE_HIT, (0.6, -2.0, up + 0.6), up + 0.22),
             ("RobotCheer", 22, (-1.9, -0.6, up + 0.4), up + 0.2), ("RobotCarry", 4, (1.2, -1.6, up - 0.3), up)]
    size, cols = 360, 4
    rows = (len(shots) + cols - 1) // cols
    sheet = np.ones((rows * size, cols * size, 4), np.float32)
    scene.render.resolution_x = scene.render.resolution_y = size
    with tempfile.TemporaryDirectory(prefix="robot-") as directory:
        for i, (action, f, location, z) in enumerate(shots):
            rig.animation_data.action = bpy.data.actions[action]
            scene.frame_set(f)
            cam.location = location
            target = V((0, 0, z))
            cam.data.lens = 60 * (V(location) - target).length / 2.0
            cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(Path(directory) / f"{i}.png")
            bpy.ops.render.render(write_still=True, scene=scene.name)
            img = bpy.data.images.load(scene.render.filepath)
            px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
            bpy.data.images.remove(img)
            r, c = rows - 1 - i // cols, i % cols
            sheet[r * size:(r + 1) * size, c * size:(c + 1) * size] = px
    out = bpy.data.images.new("RobotSheet", cols * size, rows * size, alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = str(path)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    scene.render.engine, scene.view_settings.view_transform = engine, view
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_set(0)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    animate(rig, obj)
    report = validate(rig, obj)
    K.setup_stage(scene, "Robot", STAGE, tuple(CENTRE), 1.2, camera=(0.0, -2.2, CENTRE.z + 0.3))
    for name in ("RobotKey", "RobotFill", "RobotRim"):           # (the stage's lights are made for bigger things)
        bpy.data.lights[name].energy *= 0.6
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, HOVER_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Robot", NAME, tuple(CENTRE), 1.6)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Robot:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "robot.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "robot.blend"),
         preview_path=args[2] if len(args) > 2 else None)
