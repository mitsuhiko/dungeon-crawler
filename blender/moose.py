"""
Moose: a grumpy, big-headed moose on four stubby legs, from the kids' drawing.

A long oval barrel of a body on four short, stubby legs with dark hooves; a long thin neck rising
forward from its chest to a big round head with angry brows, a wide grin full of jagged teeth and
two branching antlers; and a long tail curving up behind it to a hard, smooth ball that it swings
like a club. Faces -Y in Blender, +Z up; one unit = one game cell, about 2.4 cells to the tips of
its antlers.

The body, neck, head, legs and tail are one OpenVDB SDF skinned to body, neck and head, two bones
per leg (IK) and a four-bone tail; the antlers, brows, eyes, teeth, mouth and nostrils ride the head
(the eyes on bones of their own, to blink), the hooves the lower legs, the ball the tail's last bone
(`ball`). A ring of little stars (`stars`, scaled away but in MooseDazed) circles over its head when
it is dazed.

Clips, 30 fps, in place (the game supplies root motion):
    MooseWalk    32-frame loop: a heavy lateral-sequence walk (extras.speed).
    MooseRun     16-frame loop: a rocking gallop (extras.speed: the game blends to it as it speeds up).
    MooseToss    1.1 s: lowers its antlers and tosses them up at frame 14 (extras.hit_frame).
    MooseCharge  2.3 s: lowers its head, the antlers to the front, scrapes a hoof and snorts; from
                 frame 21 (the hit frame) to 51 (extras.charge_end) it gallops (the game runs it
                 at you); then it skids to a stop.
    MooseDazed   2.0 s: crashed: jolted back, its head hanging and wobbling, its eyes squeezed, the
                 stars going round over its head; it shakes them off.
    MooseTail    1.2 s: cocks its tail to one side and sweeps the ball round behind it at frame 16
                 (extras.hit_frame).
    MooseDeath   2.0 s: staggers and falls onto its side, the tail flopping, the eyes closing. Held.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, moose; importlib.reload(creature); importlib.reload(moose)
    moose.main(export_path="<repo>/assets/moose.glb", blend_path="<repo>/blender/moose.blend")

Headless:
    Blender -b --python blender/moose.py -- assets/moose.glb blender/moose.blend \
        blender/previews/moose-preview.png
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F

NAME, RIG_NAME = "Moose", "MooseRig"
SCENE, COLLECTION, STAGE = "Moose", "MooseAsset", "MooseStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("MooseWalk", "MooseRun", "MooseToss", "MooseCharge", "MooseDazed", "MooseTail", "MooseDeath")

FUR_HEX, MUZZLE_HEX, BROW_HEX, ANTLER_HEX, BALL_HEX = "#6e4a30", "#9a7656", "#2e1e14", "#e6d8bc", "#4a3020"
HOOF_HEX, EYE_HEX, PUPIL_HEX, TEETH_HEX, MOUTH_HEX, STAR_HEX = "#2a2420", "#ffd23a", "#16120a", "#f6f0e0", "#3a1614", "#ffe27a"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("MooseFur", FUR_HEX, 0), ("MooseMuzzle", MUZZLE_HEX, 0), ("MooseBrows", BROW_HEX, 0),
             ("MooseAntlers", ANTLER_HEX, 0), ("MooseTailBall", BALL_HEX, 0), ("MooseHooves", HOOF_HEX, 0),
             ("MooseEyes_glow", EYE_HEX, 0.6), ("MoosePupils", PUPIL_HEX, 0), ("MooseTeeth", TEETH_HEX, 0),
             ("MooseMouth", MOUTH_HEX, 0), ("MooseStars_glow", STAR_HEX, 2.0))
FUR_M, MUZZLE_M, BROW_M, ANTLER_M, BALL_M, HOOF_M, EYE_M, PUPIL_M, TEETH_M, MOUTH_M, STAR_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.014, 0.008, 0.004
WALK_FRAMES, WALK_SPEED = 32, 0.65
RUN_FRAMES, RUN_SPEED = 16, 2.6
TOSS_FRAMES, TOSS_HIT = 33, 14
CHARGE_FRAMES, CHARGE_HIT, CHARGE_END = 69, 21, 51
DAZED_FRAMES = 60
TAIL_FRAMES, TAIL_HIT = 36, 16
DEATH_FRAMES = 60

# --- body plan ---------------------------------------------------------------------
BODY_C, BODY_R = V((0, 0.1, 0.8)), (0.34, 0.66, 0.33)
NECK = [V((0, -0.4, 1.0)), V((0, -0.6, 1.3)), V((0, -0.76, 1.56))]
NECK_R = (0.14, 0.095, 0.09)
HEAD_C, HEAD_R = V((0, -0.86, 1.78)), (0.28, 0.26, 0.26)
MUZZLE_C, MUZZLE_R = V((0, -0.97, 1.66)), (0.21, 0.2, 0.17)
HIP_Z, KNEE_Z, FOOT_Z = 0.78, 0.42, 0.08
LEGS = {f"{k}.{s}": (V((sign * 0.2, y, HIP_Z)), V((sign * 0.21, y + bend, KNEE_Z)), V((sign * 0.21, y, FOOT_Z)))
        for k, y, bend in (("fore", -0.34, -0.1), ("hind", 0.52, 0.1)) for s, sign in SIDES}
LEG_R = (0.15, 0.128, 0.118)
HOOF_HALF = (0.118, 0.128, 0.05)
REST_FEET = {name: pts[2].copy() for name, pts in LEGS.items()}
HIND_PIVOT = V((0, 0.52, 0.5))
TAIL = [V((0, 0.7, 0.92)), V((0, 0.95, 0.96)), V((0, 1.17, 1.06)), V((0, 1.33, 1.23)), V((0, 1.41, 1.43))]
TAIL_R = (0.075, 0.056, 0.048, 0.043, 0.04)
TAIL_BONES = [f"tail_{i + 1}" for i in range(len(TAIL) - 1)]
TAIL_W = [w / sum(0.6 + 0.25 * i for i in range(len(TAIL_BONES))) for w in (0.6 + 0.25 * i for i in range(len(TAIL_BONES)))]   # each bone's share of a bend
BALL_C, BALL_R = V((0, 1.43, 1.57)), 0.16
STAR_C, STAR_RING, STARS = V((0, -0.86, 2.3)), 0.3, 5


def head_sdf(P):
    return K.smin(K.ellipsoid(P, HEAD_C, HEAD_R), K.ellipsoid(P, MUZZLE_C, MUZZLE_R), 0.08)


def front_y(x, z, lo=-0.86, hi=-1.4):
    """Where the face is at (x, z): the y of the head's surface seen from the front (bisection)."""
    a, b = lo, hi
    for _ in range(40):
        m = (a + b) / 2
        if head_sdf(np.array([[x, m, z]], np.float32))[0] < 0:
            a = m
        else:
            b = m
    return (a + b) / 2


def face(x, z, out=0.0):
    return V((x, front_y(x, z) - out, z))


# the grin: a wide groove from corner to corner, curving up at the ends
MOUTH = [face(x, 1.6 + 0.075 * (x / 0.18) ** 2) for x in np.linspace(-0.18, 0.18, 9)]
MOUTH_W = 0.045
EYES = {s: face(sign * 0.11, 1.83, -0.03) for s, sign in SIDES}
EYE_R = 0.056
BROWS = {s: (face(sign * 0.035, 1.915, 0.0), face(sign * 0.17, 1.96, -0.01)) for s, sign in SIDES}
NOSTRILS = {s: face(sign * 0.055, 1.73, 0.0) for s, sign in SIDES}


def antler(sign):
    """One antler: [(points, radii)], the beam first, then its tines, as forks in the drawing."""
    s = sign
    root = V((s * 0.15, -0.84, 1.98))
    beam = ([root, V((s * 0.3, -0.83, 2.08)), V((s * 0.47, -0.81, 2.17)), V((s * 0.6, -0.79, 2.33)), V((s * 0.66, -0.78, 2.47))],
            (0.05, 0.044, 0.038, 0.032, 0.022))
    tines = [([V((s * 0.3, -0.83, 2.08)), V((s * 0.28, -0.9, 2.26)), V((s * 0.31, -0.93, 2.4))], (0.034, 0.028, 0.02)),
             ([V((s * 0.47, -0.81, 2.17)), V((s * 0.46, -0.84, 2.34)), V((s * 0.5, -0.86, 2.46))], (0.034, 0.028, 0.02)),
             ([V((s * 0.6, -0.79, 2.33)), V((s * 0.74, -0.79, 2.36)), V((s * 0.82, -0.8, 2.44))], (0.03, 0.025, 0.018))]
    return [beam] + tines


def torso_sdf(P):
    d = K.ellipsoid(P, BODY_C, BODY_R)
    # a little hump over the shoulders, the chest a little deeper
    d = K.smin(d, K.ellipsoid(P, V((0, -0.28, 1.0)), (0.26, 0.3, 0.2)), 0.12)
    return K.smin(d, K.ellipsoid(P, V((0, -0.36, 0.72)), (0.24, 0.26, 0.24)), 0.1)


def neck_sdf(P):
    return K.tapered_tube(P, NECK, NECK_R)


def leg_sdf(P, name):
    return K.tapered_tube(P, list(LEGS[name]), LEG_R)


def tail_sdf(P):
    return K.tapered_tube(P, TAIL, TAIL_R)


def mouth_sdf(P, r):
    return K.tapered_tube(P, MOUTH, [r] * len(MOUTH))


def body_sdf(P):
    d = K.smin(torso_sdf(P), neck_sdf(P), 0.1)
    d = K.smin(d, head_sdf(P), 0.08)
    for name in LEGS:
        d = K.smin(d, leg_sdf(P, name), 0.08)
    d = K.smin(d, tail_sdf(P), 0.06)
    d = K.smax(d, -mouth_sdf(P, MOUTH_W), 0.012)        # the grin's groove (the dark in it is another part)
    return K.smax(d, -P[..., 2], 0.006)


def body_mats(centers):
    """A paler muzzle round the grin, fur elsewhere."""
    x, y, z = centers[:, 0], centers[:, 1], centers[:, 2]
    muzzle = K.ellipsoid(centers, MUZZLE_C + V((0, -0.05, -0.02)), (0.2, 0.17, 0.16)) < 0.02
    return np.where(muzzle & (y < -0.95) & (z < 1.8), MUZZLE_M, FUR_M)


def teeth():
    """Jagged teeth along the grin: (base, tip) pairs, a row pointing down from its top edge and a
    row pointing up from its bottom edge, in between each other."""
    out = []
    for i in range(1, len(MOUTH) - 1):
        a = MOUTH[i]
        out.append((a + V((0, 0.012, MOUTH_W - 0.008)), a + V((0, 0.006, -0.012))))
    for i in range(1, len(MOUTH) - 2):
        a = (MOUTH[i] + MOUTH[i + 1]) / 2
        out.append((a + V((0, 0.012, -MOUTH_W + 0.008)), a + V((0, 0.006, 0.012))))
    return out


def teeth_sdf(P):
    d = None
    for a, b in teeth():
        t = K.round_cone(P, a, b, 0.024, 0.004)
        d = t if d is None else np.minimum(d, t)
    return d


def star_points():
    """The stars over the head: (centre, outward direction) round a ring."""
    return [(STAR_C + V((math.cos(a), math.sin(a), 0)) * STAR_RING, V((math.cos(a), math.sin(a), 0)))
            for a in (TAU * i / STARS for i in range(STARS))]


def star_sdf(P, c, n):
    """A little five-pointed star standing up, facing `n`."""
    side = V((-n.y, n.x, 0))
    d = None
    for k in range(5):
        a = TAU * k / 5
        tip = c + (V((0, 0, 1)) * math.cos(a) + side * math.sin(a)) * 0.075
        t = K.round_cone(P, c, tip, 0.032, 0.008)
        d = t if d is None else K.smin(d, t, 0.01)
    return d


def hoof_sdf(P, name):
    p = LEGS[name][2]
    return F._sd_round_box(P, V((p.x, p.y - 0.01, HOOF_HALF[2])), HOOF_HALF, 0.04)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.6, -1.3, -0.02), (0.6, 1.56, 2.1), VOXEL, mat=body_mats)
    lo, hi = K.bounds(MOUTH, 0.06)
    parts.add("head", lambda P: mouth_sdf(P - np.array([0, 0.03, 0], np.float32), MOUTH_W * 0.85), lo, hi + V((0, 0.05, 0)), DETAIL,
              mat=MOUTH_M)
    pairs = teeth()
    lo, hi = K.bounds([p for pair in pairs for p in pair], 0.04)
    parts.add("head", teeth_sdf, lo, hi, FINE, mat=TEETH_M)
    for s, sign in SIDES:
        for pts, radii in antler(sign):
            lo, hi = K.bounds(pts, 0.07)
            parts.add("head", lambda P, pts=pts, radii=radii: K.tapered_tube(P, pts, radii), lo, hi, DETAIL, mat=ANTLER_M)
        a, b = BROWS[s]
        lo, hi = K.bounds([a, b], 0.06)
        parts.add("head", lambda P, a=a, b=b: K.round_cone(P, a, b, 0.032, 0.026), lo, hi, FINE, mat=BROW_M)
        n = NOSTRILS[s]
        parts.add("head", lambda P, c=n: K.ellipsoid(P, c, (0.022, 0.016, 0.016)), n - V((0.04,) * 3), n + V((0.04,) * 3), FINE,
                  mat=PUPIL_M)
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.08,) * 3), e + V((0.08,) * 3), FINE, mat=EYE_M)
        pupil = e + V((sign * 0.008, -EYE_R + 0.012, -0.006))
        parts.add(f"eye.{s}", lambda P, c=pupil: F._sd_sphere(P, c, 0.022), pupil - V((0.04,) * 3), pupil + V((0.04,) * 3), FINE,
                  mat=PUPIL_M)
    for name in LEGS:
        p = LEGS[name][2]
        parts.add(f"lower.{name}", lambda P, n=name: hoof_sdf(P, n), V((p.x - 0.16, p.y - 0.17, -0.02)), V((p.x + 0.16, p.y + 0.15, 0.16)),
                  DETAIL, mat=HOOF_M)
    parts.add("ball", lambda P: F._sd_sphere(P, BALL_C, BALL_R), BALL_C - V((0.2,) * 3), BALL_C + V((0.2,) * 3), DETAIL, mat=BALL_M)
    for c, n in star_points():
        parts.add("stars", lambda P, c=c, n=n: star_sdf(P, c, n), c - V((0.12,) * 3), c + V((0.12,) * 3), FINE, mat=STAR_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "moose"
    obj["skin_color"] = FUR_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin ----------------------------------------------------------------------
def build_rig(coll):
    up, fwd, side = (0, 0, 1), (0, -1, 0), (1, 0, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", BODY_C + V((0, 0.55, 0)), BODY_C + V((0, -0.55, 0)), "root", True, up),
             ("neck", NECK[0], NECK[-1], "body", True, fwd),
             ("head", NECK[-1], face(0, 1.7), "neck", True, up)]
    for s, _ in SIDES:
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.06, 0)), "head", True, up))
    for name, (a, m, p) in LEGS.items():
        bones += [(f"upper.{name}", a, m, "body", True, fwd), (f"lower.{name}", m, p, f"upper.{name}", True, fwd)]
    for i, name in enumerate(TAIL_BONES):
        bones.append((name, TAIL[i], TAIL[i + 1], "body" if i == 0 else TAIL_BONES[i - 1], True, side))
    bones.append(("ball", BALL_C, BALL_C + V((0, 0, BALL_R)), TAIL_BONES[-1], True, fwd))
    bones.append(("stars", STAR_C, STAR_C + V((0, 0, 0.2)), "root", True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "moose", "forward": "-Y", "attack_style": "toss_charge_tail", "normal_speed": WALK_SPEED, "root_motion": False})


def chain(Q, pts, bones, blend=0.05, lead=None, lead_len=0.08):
    """Smooth per-bone weights along a joint polyline (blender/firecat.py): bones[k] owns
    segment k; `lead` (the parent bone) owns its start."""
    _, along = C._polyline_closest(Q, pts)
    cum = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])
    w = {}
    for k, name in enumerate(bones):
        start = C.np_smoothstep(cum[k] - blend, cum[k] + blend, along) if k else np.ones(len(Q))
        end = C.np_smoothstep(cum[k + 1] - blend, cum[k + 1] + blend, along) if k + 1 < len(bones) else 0
        w[name] = w.get(name, 0) + np.clip(start - end, 0, 1)
    if lead:
        own = C.np_smoothstep(0, lead_len, along)
        for name in w:
            w[name] = w[name] * own
        w[lead] = w.get(lead, 0) + 1 - own
    return w


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        Q = P[lo:hi]
        dists, groups = [torso_sdf(Q)], [{"body": np.ones(len(Q))}]
        dists.append(neck_sdf(Q))
        groups.append(chain(Q, [NECK[0] + V((0, 0.12, -0.1)), NECK[0], NECK[1], NECK[2], HEAD_C], ["body", "neck", "neck", "head"],
                            blend=0.08))
        dists.append(head_sdf(Q))
        groups.append({"head": np.ones(len(Q))})
        for name in LEGS:
            a, m, p = LEGS[name]
            dists.append(leg_sdf(Q, name))
            groups.append(chain(Q, [a + V((0, 0, 0.12)), a, m, p], ["body", f"upper.{name}", f"lower.{name}"], blend=0.06))
        dists.append(tail_sdf(Q))
        groups.append(chain(Q, TAIL, TAIL_BONES, blend=0.05, lead="body", lead_len=0.08))
        dm = np.stack(dists, axis=1)
        membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.015)
        membership /= membership.sum(axis=1, keepdims=True)
        WB = np.zeros((len(Q), len(names)), np.float32)
        for k, values in enumerate(groups):
            for name, value in values.items():
                WB[:, names.index(name)] += membership[:, k] * value
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 6)
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
    for name, roughness in (("MooseFur", 0.85), ("MooseMuzzle", 0.8), ("MooseBrows", 0.85), ("MooseAntlers", 0.6),
                            ("MooseTailBall", 0.45), ("MooseHooves", 0.6), ("MooseEyes_glow", 0.25), ("MoosePupils", 0.2),
                            ("MooseTeeth", 0.35), ("MooseMouth", 0.8), ("MooseStars_glow", 0.4)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion --------------------------------------------------------------------------
def T(v):
    return Matrix.Translation(v)


def about(point, R3):
    return K.about(point, R3)


def frame_along(head, direction, base_rot):
    """A bone at `head` pointing along `direction`, swung the least from `base_rot` (3x3)."""
    y = base_rot.col[1].normalized()
    swing = y.rotation_difference(direction.normalized()).to_matrix()
    return T(head) @ (swing @ base_rot).to_4x4()


def params(**kw):
    p = {"t": 0.0,
         # the body (about `pivot`), the neck and the head; the eyes (1 open, 0 shut)
         "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pivot": BODY_C,
         "neck": (0.0, 0.0), "head": (0.0, 0.0, 0.0), "eyes": 1.0,
         # where the feet stand (world); `ride`: 1 = carried along with the body instead
         "feet": {k: v.copy() for k, v in REST_FEET.items()}, "ride": {k: 0.0 for k in REST_FEET},
         # the tail: curled up (+) or down, swung to the left (+) or right, waving (amplitude, phase)
         "tail": (0.0, 0.0, 0.0, 0.0),
         # the stars over its head: how big (0 gone), how far round
         "stars": (0.0, 0.0)}
    p.update(kw)
    return p


def solver(rig):
    skel = C.Skeleton(rig)
    rest, rot = skel.rest, skel.rest_rot
    length = {b.name: b.length for b in rig.data.bones}
    order = [b.name for b in rig.data.bones]

    def solve(f, lift, fn):
        p = fn(f)
        out = {"root": rest["root"]}
        R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
        B = T(p["pos"]) @ about(p["pivot"], R)
        out["body"] = B @ rest["body"]
        N = B @ about(NECK[0], C.rot_x(p["neck"][0]) @ C.rot_z(p["neck"][1]))
        out["neck"] = N @ rest["neck"]
        hp, hy, hr = p["head"]
        H = N @ about(NECK[-1], C.rot_x(hp) @ C.rot_z(hy) @ C.rot_y(hr))
        out["head"] = H @ rest["head"]
        e = max(0.08, p["eyes"])
        for s, _ in SIDES:
            out[f"eye.{s}"] = H @ about(EYES[s], Matrix.Diagonal((1, 1, e))) @ rest[f"eye.{s}"]
        B3 = B.to_3x3()
        for name in LEGS:
            up, lo = f"upper.{name}", f"lower.{name}"
            hip = B @ LEGS[name][0]
            target = p["feet"][name].lerp(B @ REST_FEET[name], p["ride"][name])
            pole = B3 @ (V((0, -1, 0.1)) if name.startswith("fore") else V((0, 1, 0.1)))
            knee, foot = C.two_bone_ik(hip, target, length[up], length[lo], pole)
            out[up] = frame_along(hip, knee - hip, B3 @ rot[up])
            out[lo] = frame_along(knee, foot - knee, B3 @ rot[lo])
        curl, swing, amp, phase = p["tail"]
        M = B
        for i, name in enumerate(TAIL_BONES):
            sway = amp * math.sin(phase - 0.9 * i) * (0.5 + 0.2 * i)
            M = M @ about(TAIL[i], C.rot_z(swing * TAIL_W[i] + sway) @ C.rot_x(curl * TAIL_W[i]))
            out[name] = M @ rest[name]
        out["ball"] = M @ rest["ball"]
        k, spin = p["stars"]
        k = max(0.001, k)
        over = H @ STAR_C
        out["stars"] = T(over) @ (C.rot_z(spin) @ Matrix.Diagonal((k, k, k))).to_4x4() @ T(-STAR_C) @ rest["stars"]
        L = T((0, 0, lift))
        poses, bases = {}, {}
        for name in order:
            bases[name] = skel.set(name, poses, L @ out[name])
        return bases
    return lambda fn: (lambda f, lift: solve(f, lift, fn))


k_ = C.keyframes


def gait(t, period, speed, duty, lift, offsets, skew=0.9):
    feet = {}
    stride = speed * duty * period
    for name, off in offsets.items():
        y, z = C.foot_track(((t / period) + off) % 1, duty, stride, lift, speed, period, skew=skew)
        feet[name] = REST_FEET[name] + V((0, y, z))
    return feet


WALK_OFFSETS = {"hind.L": 0.0, "fore.L": 0.75, "hind.R": 0.5, "fore.R": 0.25}
RUN_OFFSETS = {"hind.L": 0.0, "hind.R": -0.1, "fore.R": -0.48, "fore.L": -0.58}


def blink(t, at, length=0.2):
    u = (t - at) / length
    return 1 - 0.94 * math.sin(math.pi * u) ** 2 if 0 <= u <= 1 else 1.0


def idle(f, **kw):
    """Standing, breathing, the tail swaying a little (a loop of WALK_FRAMES), with some
    parameters replaced."""
    w = TAU * f / WALK_FRAMES
    p = params(t=f / FPS, pos=V((0, 0, 0.01 * math.sin(w))), neck=(D(1.5) * math.sin(w), 0), tail=(0, 0, D(6), w))
    p.update(kw)
    return p


def walk(f):
    Tp = WALK_FRAMES / FPS
    t = f / FPS
    w = TAU * t / Tp
    return params(t=t, feet=gait(t, Tp, WALK_SPEED, 0.62, 0.09, WALK_OFFSETS),
                  pos=V((0.012 * math.sin(w), 0, -0.01 + 0.014 * math.cos(2 * w))), roll=D(2.5) * math.sin(w), yaw=D(1.5) * math.sin(w + 0.4),
                  neck=(D(-3) * math.cos(2 * w), D(2.5) * math.sin(w)), head=(D(3) * math.cos(2 * w + 0.6), D(-4) * math.sin(w - 0.5), D(2) * math.sin(w)),
                  tail=(D(-4), D(4) * math.sin(w), D(8), w), eyes=blink(f, 20, 5))


def run(f):
    Tp = RUN_FRAMES / FPS
    t = f / FPS
    w = TAU * t / Tp
    return params(t=t, feet=gait(t, Tp, RUN_SPEED, 0.32, 0.17, RUN_OFFSETS, skew=0.8),
                  pos=V((0, 0.03 * math.cos(w), -0.02 + 0.07 * max(0.0, math.sin(w - 0.6)))), pitch=D(6) * math.sin(w + 0.4),
                  neck=(D(10) + D(8) * math.cos(w), 0), head=(D(-6) - D(6) * math.cos(w + 0.4), 0, 0),
                  tail=(D(-14) + D(10) * math.sin(w), 0, D(10), w))


def toss(f):
    t, hit = f / FPS, TOSS_HIT / FPS
    low = k_((0, 0), (hit - 0.12, 1), (hit, -0.55), (hit + 0.2, -0.4), (TOSS_FRAMES / FPS, 0))(t)
    push = k_((0, 0), (hit - 0.12, 0.3), (hit, 1), (hit + 0.3, 0.4), (TOSS_FRAMES / FPS, 0))(t)
    return idle(f, neck=(D(36) * low, 0), head=(D(26) * low, 0, D(-6) * max(0, -low)), pitch=D(6) * max(0, low) - D(4) * max(0, -low),
                pos=V((0, -0.14 * push, -0.04 * max(0, low))), tail=(D(10) * push, 0, D(8), TAU * 2 * t),
                eyes=k_((0, 1), (hit - 0.2, 0.55), (hit + 0.15, 0.55), (TOSS_FRAMES / FPS, 1))(t))


def charge(f):
    t, hit, end = f / FPS, CHARGE_HIT / FPS, CHARGE_END / FPS
    low = k_((0, 0), (0.35, 1), (end, 1), (end + 0.35, 0))(t)
    feet = {n: v.copy() for n, v in REST_FEET.items()}
    # scraping a hoof before the run
    on = k_((0, 0), (0.12, 1), (hit - 0.12, 1), (hit, 0))(t)
    scrape = math.sin(TAU * 2.5 * t) * on
    feet["fore.R"] = REST_FEET["fore.R"] + V((0, 0.1 + 0.14 * scrape, 0.04 * max(0, -scrape) + 0.02 * on))
    run_ = k_((0, 0), (hit - 0.05, 0), (hit + 0.08, 1), (end - 0.05, 1), (end + 0.1, 0))(t)
    if run_ > 0:
        g = gait(t - hit, 0.3, 6.0, 0.22, 0.16, RUN_OFFSETS, skew=0.8)
        feet = {n: feet[n].lerp(g[n], run_) for n in feet}
    # skidding to a stop: the forefeet braced ahead, leaning back
    skid = k_((0, 0), (end - 0.05, 0), (end + 0.1, 1), (end + 0.35, 1), (CHARGE_FRAMES / FPS, 0))(t)
    for n in feet:
        feet[n] = feet[n] + V((0, -0.16 if n.startswith("fore") else -0.04, 0)) * skid
    w = TAU * (t - hit) / 0.3
    snort = math.sin(TAU * 3 * t) * on
    return idle(f, feet=feet, neck=(D(40) * low - D(8) * skid, D(3) * snort), head=(D(22) * low + D(5) * run_ * math.sin(w) + D(4) * snort, 0, 0),
                pitch=D(5) * low + D(4) * run_ * math.sin(w + 1) - D(7) * skid,
                pos=V((0, 0.06 * skid, -0.05 * low + 0.07 * run_ * abs(math.sin(w / 2)))),
                tail=(D(-20) * run_ + D(12) * skid, 0, D(10) + D(10) * run_, TAU * 3 * t),
                eyes=k_((0, 1), (0.3, 0.6), (end + 0.3, 0.6), (CHARGE_FRAMES / FPS, 1))(t))


def dazed(f):
    t = f / FPS
    crash = k_((0, 0), (0.1, 1), (1.5, 1), (1.9, 0))(t)
    jolt = k_((0, 0), (0.08, 1), (0.35, 0.2), (0.6, 0))(t)
    daze = k_((0, 0), (0.25, 0), (0.45, 1), (1.4, 1), (1.7, 0))(t)
    wob = math.sin(TAU * 1.6 * t) * daze
    shake = math.sin(TAU * 6 * t) * k_((0, 0), (1.4, 0), (1.5, 1), (1.75, 0))(t)
    stars = k_((0, 0), (0.15, 0), (0.35, 1), (1.5, 1), (1.8, 0))(t)
    return idle(f, pos=V((0, 0.16 * jolt, -0.06 * crash)), pivot=HIND_PIVOT, pitch=D(7) * crash - D(5) * jolt, roll=D(5) * wob,
                neck=(D(30) * crash, D(10) * wob + D(14) * shake), head=(D(18) * crash, D(12) * wob, D(10) * wob + D(16) * shake),
                tail=(D(-18) * crash, D(10) * wob, D(6), TAU * t), eyes=1 - 0.75 * crash, stars=(stars, TAU * 1.1 * t))


def tail_swipe(f):
    t, hit = f / FPS, TAIL_HIT / FPS
    # cocked to the left, then swept round behind to the right at the hit frame, and back
    swing = k_((0, 0), (hit - 0.2, 1), (hit - 0.06, 0.9), (hit + 0.08, -1.2), (hit + 0.35, -0.8), (TAIL_FRAMES / FPS, 0))(t)
    kick = k_((0, 0), (hit - 0.2, 0.2), (hit, 1), (hit + 0.25, 0.3), (TAIL_FRAMES / FPS, 0))(t)
    flat = k_((0, 0), (hit - 0.25, 1), (hit + 0.3, 1), (TAIL_FRAMES / FPS, 0))(t)   # the tail held out straight back to sweep
    ride = {n: 0.0 if n.startswith("fore") else 0.6 * kick for n in REST_FEET}
    return idle(f, pivot=V((0, -0.34, 0.5)), pitch=D(8) * kick, yaw=D(-14) * swing, ride=ride,
                neck=(D(-8) * kick, D(18) * swing), head=(D(-6) * kick, D(16) * swing, 0),
                tail=(D(-62) * flat, D(80) * swing, D(4), TAU * t), eyes=k_((0, 1), (hit - 0.1, 0.5), (hit + 0.2, 0.5), (1.2, 1))(t))


def death(f):
    t = f / FPS
    reel = k_((0, 0), (0.22, 1), (0.45, 0.6), (0.9, 0))(t)
    fall = min(1.0, max(0.0, (t - 0.3) / 0.55)) ** 2
    since = max(0.0, t - 0.85)
    bounce = 0.04 * math.exp(-since * 9) * abs(math.sin(TAU * 1.6 * since)) if t > 0.85 else 0.0
    limp = C.smoothstep(0.5, 1.1, t)
    ride = {n: C.smoothstep(0.25, 0.6, t) for n in REST_FEET}
    feet = {n: v.copy() for n, v in REST_FEET.items()}
    return params(t=t, pivot=V((0.34, 0.1, 0.0)), pos=V((0, 0.05 * reel, bounce)), pitch=D(-6) * reel, roll=D(84) * fall + D(-3) * reel,
                  feet=feet, ride=ride, neck=(D(-18) * reel + D(26) * limp, D(-12) * limp), head=(D(10) * reel - D(8) * limp, D(-8) * limp, D(-12) * limp),
                  tail=(D(-30) * limp, D(14) * limp, D(14) * (1 - C.smoothstep(0.8, 1.2, t)), TAU * 2.5 * t),
                  eyes=k_((0, 1), (0.15, 1.15), (0.9, 1), (1.2, 1), (1.5, 0.06))(t))


# --- the points the game uses, read off the baked clips -------------------------------
def game(v):
    return [round(v.x, 3) + 0.0, round(v.z, 3) + 0.0, round(-v.y, 3) + 0.0]   # (+ 0.0: no -0.0)


def bone_point(rig, action, frame, bone, local):
    """Where a point given in the rest pose rides with bone `bone` in that frame (world)."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ rig.data.bones[bone].matrix_local.inverted() @ local


def animate(rig, obj):
    rig.animation_data_create()
    S = solver(rig)

    def clip(name, fn, n, cyclic=False, extras=None, settle_from=None):
        return K.ground_clip(rig, obj, name, S(fn), n, cyclic=cyclic, extras=extras, settle_from=settle_from)
    clip("MooseWalk", walk, WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    clip("MooseRun", run, RUN_FRAMES, cyclic=True, extras={"speed": RUN_SPEED})
    to = clip("MooseToss", toss, TOSS_FRAMES, extras={"attack_style": "toss", "hit_frame": TOSS_HIT, "hit_time": TOSS_HIT / FPS})
    to.pose_markers.new("Toss").frame = TOSS_HIT
    ch = clip("MooseCharge", charge, CHARGE_FRAMES, extras={"attack_style": "charge", "hit_frame": CHARGE_HIT, "hit_time": CHARGE_HIT / FPS,
                                                             "charge_end": CHARGE_END})
    ch.pose_markers.new("Run").frame = CHARGE_HIT
    ch.pose_markers.new("Stop").frame = CHARGE_END
    clip("MooseDazed", dazed, DAZED_FRAMES, extras={"attack_style": "stuck"})
    ta = clip("MooseTail", tail_swipe, TAIL_FRAMES, extras={"attack_style": "tail", "hit_frame": TAIL_HIT, "hit_time": TAIL_HIT / FPS})
    ta.pose_markers.new("Swipe").frame = TAIL_HIT
    clip("MooseDeath", death, DEATH_FRAMES, extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.2 * FPS))
    K.register(rig, CLIPS)
    # how far its antlers and its tail's ball reach at the hit frames (the attacks' hitReach)
    tips = [bone_point(rig, "MooseToss", TOSS_HIT, "head", V((sign * 0.66, -0.78, 2.47))) for _, sign in SIDES]
    ball = bone_point(rig, "MooseTail", TAIL_HIT, "ball", BALL_C)
    return {"toss": [game(v) for v in tips], "ball": game(ball)}


# --- previews ------------------------------------------------------------------------
def preview(scene, rig, path):
    side, three, back = (6.0, -1.0, 2.2), (4.6, -4.6, 2.8), (-3.4, 5.0, 3.0)
    shots = [("MooseWalk", 0, three), ("MooseWalk", 8, side), ("MooseRun", 4, side), ("MooseToss", TOSS_HIT - 3, three),
             ("MooseToss", TOSS_HIT + 2, side), ("MooseCharge", 12, three), ("MooseCharge", CHARGE_HIT + 8, side),
             ("MooseDazed", 30, three), ("MooseTail", TAIL_HIT - 6, back), ("MooseTail", TAIL_HIT + 3, back),
             ("MooseDeath", DEATH_FRAMES, three), ("MooseWalk", 0, (0.6, -6.5, 1.9))]
    K.contact_sheet(scene, rig, shots, path, (0, 0.0, 1.1), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    obj.data.validate()
    K.decimate(obj)
    obj.data.validate()
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("MooseDeath",))
    report.update(points)
    K.setup_stage(scene, "Moose", STAGE, (0, 0.0, 1.1), 3.6, camera=(4.6, -4.6, 2.8))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Moose", NAME, (0, 0.0, 1.1), 4.2)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Moose:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "moose.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "moose.blend"),
         preview_path=args[2] if len(args) > 2 else None)
