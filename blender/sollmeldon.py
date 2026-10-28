"""
Sollmeldon: the boss of depth 10 (core/bosses.js): a dinosaur of black mud with three heads on long
necks (cat's eyes, beige-yellow, with slit pupils), bat wings and three legs (two behind, one in the
middle in front), a short heavy tail. Faces -Y in Blender, +Z up; one unit is a game cell
(render/sollmeldonmodel.js: GAME_SCALE 1), about 3.3 units tall to his middle head.

Built like the other bosses (qualmos.py, creature.py): every part a signed distance field meshed with
OpenVDB, all of them joined into one smooth-shaded skinned mesh with plain materials, the rig and
the skin weights computed here, the mesh collapsed to its triangle budget (figure.py
TRIANGLE_BUDGET: the big parts and the small things each to a share of their own), every clip posed
frame by frame and baked (CLIPS, each a function of time), kept off the floor (creature.py
ground_clip). It reads off the clips what the game needs (`points`), exports the GLB and saves
blender/sollmeldon.blend (an output: change this script, not the .blend).

The rig: `root` (at the floor), `body` (the hips to the chest), `chest` (to the shoulders), four
bones of tail, three necks of five bones (neck.L.0 .. neck.L.4; L on +X, his left), a head on each
(head.L, M, R: hung from the chest, put at its neck's tip every frame, so a head can come off and fly
in its cut clip) with its jaw, two wings (wing.L: the arm, wing.L.1 the forearm, finger.L.0 .. 2
the fingers the membrane is spread between) and three legs (thigh, shin, foot: .L and .R behind,
.F in front, posed by IK from where their toes stand: ik.py).

Clips (30 fps, in place; attacks by core/enemies.js SOLLMELDON `clip`, render/sollmeldonmodel.js):
    SollmeldonWalk      a loop: his three legs stepping one after the other (two always down), the
                        body rolling over them, necks swaying, wings folded (extras.speed)
    SollmeldonIdle      a loop, standing: breathing, the heads looking about out of step
    SollmeldonFly       a loop, up in the air (the game lifts him): wings beating, legs hanging
    SollmeldonBiteL/M/R one head draws back, lunges forward on its stretched neck and snaps (hit 27)
    SollmeldonSpit      the heads rear back and spit at once (hit 24)
    SollmeldonAirSpit   flying, the heads spit down (hit 15)
    SollmeldonSummon    he rears up on his hind legs and stomps the front one (hit 33)
    SollmeldonCutL/M/R  a head cut off (2.6 s): he rears and shakes, the head tears off at CUT_AT,
                        flies, lands beside him at CUT_LAND and melts into mud; its stump shrinks
    SollmeldonDeath     2.6 s: he staggers, his legs buckle, and he sinks melting into mud. Held.

The mouths at the spits' hits, the landing spots of the cut heads (`points`) must match core/enemies.js
SOLLMELDON_AT (tests/assets.test.js), the attack clips last as long as the attacks.

Headless:
    Blender -b --python blender/sollmeldon.py -- assets/sollmeldon.glb blender/sollmeldon.blend \\
        blender/previews/sollmeldon-preview.png [blender/previews/sollmeldon-clips]
then compress it: node tools/compress-assets.mjs assets/sollmeldon.glb
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F
import ik as IK

NAME, RIG_NAME = "Sollmeldon", "SollmeldonRig"
SCENE, COLLECTION, STAGE = "Sollmeldon", "SollmeldonAsset", "SollmeldonStage"
FPS = K.FPS
V = Vector
GAME_SCALE = 1.0
# the cut: the head comes off at CUT_AT, lands at CUT_LAND (frames; core/sollmeldon.js cutAt, cutLand)
CUT_AT, CUT_LAND = 33, 52

# (name, colour, emission); the names are the game's (core/enemies.js SOLLMELDON `parts`)
MATERIALS = (("SollmeldonMud", "#120e0b", 0), ("SollmeldonWings", "#0c0a08", 0), ("SollmeldonEyes_glow", "#e8d49a", 1.3),
             ("SollmeldonPupils", "#050403", 0), ("SollmeldonMouth", "#3a0f0c", 0), ("SollmeldonTeeth", "#2e2822", 0))
MUD_M, WING_M, EYE_M, PUPIL_M, MOUTH_M, TEETH_M = range(len(MATERIALS))
ROUGHNESS = {"SollmeldonMud": 0.22, "SollmeldonWings": 0.45, "SollmeldonEyes_glow": 0.2, "SollmeldonPupils": 0.3,
             "SollmeldonMouth": 0.6, "SollmeldonTeeth": 0.35}
VOXEL, DETAIL, FINE = 0.05, 0.03, 0.012

# --- body plan (rest pose, armature space: +X his left, -Y forward, +Z up) ----------------------
BODY_C, BODY_R = V((0, 0.15, 1.5)), (0.7, 1.0, 0.6)
CHEST_C, CHEST_R = V((0, -0.55, 1.78)), (0.66, 0.58, 0.6)
BELLY_C, BELLY_R = V((0, -0.05, 1.2)), (0.56, 0.8, 0.42)
HIPS, CHEST_J, SHOULDERS = V((0, 0.4, 1.45)), V((0, -0.5, 1.75)), V((0, -0.95, 2.05))
TAIL = [V((0, 0.95, 1.55)), V((0, 1.55, 1.3)), V((0, 2.1, 0.95)), V((0, 2.55, 0.6)), V((0, 2.85, 0.42))]
TAIL_R = (0.44, 0.32, 0.21, 0.13, 0.05)

HEADS = (("L", 1), ("M", 0), ("R", -1))
SIGN = dict(HEADS)


def neck_points(s):
    """The six joints of neck s (its five bones), base to where the head sits: a curve up and forward."""
    g = SIGN[s]
    if s == "M":
        a, b, c = V((0, -0.95, 2.15)), V((0, -1.3, 2.85)), V((0, -1.85, 2.98))
    else:
        a, b, c = V((0.4 * g, -0.82, 2.0)), V((0.72 * g, -1.18, 2.55)), V((0.95 * g, -1.68, 2.66))
    return [a * (1 - u) ** 2 + b * 2 * u * (1 - u) + c * u * u for u in np.linspace(0, 1, 6)]


NECKS = {s: neck_points(s) for s, _ in HEADS}
NECK_R = (0.27, 0.23, 0.2, 0.17, 0.15, 0.15)
# a head, as it sits on its neck's tip (`base`): its skull, snout and jaw, and where things are on it
HS = 1.3   # (the heads a little big for the necks: they must read from far off)
HEAD_SKULL, HEAD_SKULL_R = V((0, -0.16, 0.06)) * HS, tuple(r * HS for r in (0.23, 0.3, 0.2))
HEAD_SNOUT, HEAD_SNOUT_R = V((0, -0.46, 0.0)) * HS, tuple(r * HS for r in (0.16, 0.27, 0.12))
HEAD_JAW, HEAD_JAW_R = V((0, -0.42, -0.12)) * HS, tuple(r * HS for r in (0.14, 0.27, 0.075))
JAW_HINGE, MOUTH_TIP = V((0, -0.15, -0.08)) * HS, V((0, -0.7, -0.08)) * HS
MOUTH = V((0, -0.72, -0.05)) * HS                # where it spits from (the head's own frame: from its base)
EYE_AT, EYE_R = V((0.15, -0.3, 0.13)) * HS, tuple(r * HS for r in (0.065, 0.055, 0.08))
PUPIL_R = tuple(r * HS for r in (0.012, 0.02, 0.062))


def head_base(s):
    return NECKS[s][-1]


def head_point(s, p, x_mirror=1):
    """A point given in a head's own frame (from its base) in armature space (rest)."""
    return head_base(s) + V((p.x * x_mirror, p.y, p.z))


# wings: shoulder, elbow, wrist, three finger tips, and where the membrane meets the body behind
WINGS = {s: {"shoulder": V((0.42 * g, -0.3, 2.0)), "elbow": V((1.25 * g, 0.0, 2.55)), "wrist": V((2.0 * g, 0.25, 2.45)),
             "tips": [V((2.95 * g, 0.1, 2.85)), V((3.05 * g, 0.75, 2.05)), V((2.5 * g, 1.15, 1.45))], "root": V((0.5 * g, 0.75, 1.72))}
         for s, g in (("L", 1), ("R", -1))}
# legs: hip, knee, ankle, toe (L and R behind, F in front), digitigrade: the knee forward, the ankle back
LEGS = {"L": (V((0.55, 0.4, 1.3)), V((0.74, 0.0, 0.74)), V((0.72, 0.42, 0.3)), V((0.72, -0.02, 0.1))),
        "R": (V((-0.55, 0.4, 1.3)), V((-0.74, 0.0, 0.74)), V((-0.72, 0.42, 0.3)), V((-0.72, -0.02, 0.1))),
        "F": (V((0, -0.82, 1.3)), V((0, -1.15, 0.76)), V((0, -0.92, 0.3)), V((0, -1.36, 0.1)))}
LEG_R = (0.33, 0.22, 0.15, 0.11)
WALK_SPEED = 1.6   # units / s his walk matches (extras.speed)
FEET = ("L", "R", "F")


# --- SDFs -------------------------------------------------------------------------------------------
def tri_sdf(P, a, b, c, thick):
    """Distance to the triangle abc (a thin slab of `thick`)."""
    a, b, c = (np.asarray(v, np.float32) for v in (a, b, c))
    ba, cb, ac = b - a, c - b, a - c
    pa, pb, pc = P - a, P - b, P - c
    nor = np.cross(ba, ac)
    dot2 = lambda v: np.einsum("...i,...i", v, v)
    side = (np.sign(np.einsum("...i,...i", pa, np.cross(ba, nor))) + np.sign(np.einsum("...i,...i", pb, np.cross(cb, nor)))
            + np.sign(np.einsum("...i,...i", pc, np.cross(ac, nor))))
    edge = np.minimum(np.minimum(
        dot2(ba * np.clip((pa @ ba) / dot2(ba), 0, 1)[..., None] - pa),
        dot2(cb * np.clip((pb @ cb) / dot2(cb), 0, 1)[..., None] - pb)),
        dot2(ac * np.clip((pc @ ac) / dot2(ac), 0, 1)[..., None] - pc))
    face = (pa @ nor) ** 2 / dot2(nor)
    return np.sqrt(np.where(side < 2, edge, face)) - thick


def membrane_sdf(P, s):
    w = WINGS[s]
    sh, el, wr, (t0, t1, t2), root = w["shoulder"], w["elbow"], w["wrist"], w["tips"], w["root"]
    d = None
    for a, b, c in ((sh, el, root), (el, wr, root), (wr, t0, t1), (wr, t1, t2), (wr, t2, root)):
        t = tri_sdf(P, a, b, c, 0.022)
        d = t if d is None else np.minimum(d, t)
    # its trailing edge scalloped between the fingers
    for a, b in ((t0, t1), (t1, t2), (t2, root)):
        mid, n = (a + b) / 2, (b - a).length
        out = (mid - wr).normalized()
        d = K.smax(d, -K.ellipsoid(P, mid + out * n * 0.42, (n * 0.5,) * 3), 0.03)
    return d


def wing_bones_sdf(P, s):
    w = WINGS[s]
    d = K.tapered_tube(P, [w["shoulder"], w["elbow"], w["wrist"]], (0.1, 0.075, 0.06))
    for tip in w["tips"]:
        d = np.minimum(d, K.round_cone(P, w["wrist"], tip, 0.05, 0.02))
    return d


def lumps(seed, centre, radii, n, size):
    """Lumps of mud on an ellipsoid's upper surface: (centre, radius) each."""
    R = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        u, v = R.uniform(0, math.tau), R.uniform(0.15, 1.2)
        d = V((math.cos(u) * math.sin(v), math.sin(u) * math.sin(v), math.cos(v)))
        out.append((centre + V((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * 0.94, size * R.uniform(0.6, 1.2)))
    return out


def drips(seed, centre, radii, n, length):
    """Drips of mud hanging under an ellipsoid: (top, bottom, radius) each."""
    R = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        u, v = R.uniform(0, math.tau), R.uniform(0.0, 0.8)
        top = centre + V((math.cos(u) * math.sin(v) * radii[0], math.sin(u) * math.sin(v) * radii[1], -math.cos(v) * radii[2])) * 0.92
        out.append((top, top - V((0, 0, length * R.uniform(0.5, 1.2))), 0.05 * R.uniform(0.7, 1.3)))
    return out


def torso_sdf(P):
    d = K.smin(K.ellipsoid(P, BODY_C, BODY_R), K.ellipsoid(P, CHEST_C, CHEST_R), 0.25)
    d = K.smin(d, K.ellipsoid(P, BELLY_C, BELLY_R), 0.2)
    for c, r in lumps(3, BODY_C, BODY_R, 14, 0.14) + lumps(5, CHEST_C, CHEST_R, 8, 0.12):
        d = K.smin(d, K.ellipsoid(P, c, (r, r, r * 0.8)), 0.08)
    for top, bottom, r in drips(7, BELLY_C, BELLY_R, 9, 0.28):
        d = K.smin(d, K.round_cone(P, top, bottom, r, r * 0.55), 0.06)
    return d


def head_sdf(P, s):
    b = head_base(s)
    d = K.ellipsoid(P, b + HEAD_SKULL, HEAD_SKULL_R)
    d = K.smin(d, K.ellipsoid(P, b + HEAD_SNOUT, HEAD_SNOUT_R), 0.1)
    # a brow ridge over each eye, a bump of a nostril each side of the snout
    for g in (1, -1):
        d = K.smin(d, K.ellipsoid(P, b + V((0.13 * g, -0.3, 0.2)) * HS, (0.09 * HS, 0.1 * HS, 0.045 * HS)), 0.04)
        d = K.smin(d, K.ellipsoid(P, b + V((0.07 * g, -0.68, 0.07)) * HS, (0.05, 0.05, 0.04)), 0.03)
    # a few lumps of mud on top, and its mouth's slit cut in (the jaw is a part of its own)
    for c, r in lumps(11 + ord(s), b + HEAD_SKULL, HEAD_SKULL_R, 4, 0.06):
        d = K.smin(d, K.ellipsoid(P, c, (r, r, r)), 0.03)
    return d


def mouth_sdf(P, s):
    """The inside of the mouth: a dark wedge between the snout and the jaw."""
    b = head_base(s)
    return K.ellipsoid(P, b + V((0, -0.44, -0.07)) * HS, (0.12 * HS, 0.25 * HS, 0.05 * HS))


def jaw_sdf(P, s):
    b = head_base(s)
    return K.smin(K.ellipsoid(P, b + HEAD_JAW, HEAD_JAW_R), K.ellipsoid(P, b + V((0, -0.2, -0.1)) * HS, (0.15 * HS, 0.12 * HS, 0.08 * HS)), 0.06)


def teeth(s):
    """(base, tip, radius, lower) of a few blunt teeth along the snout and the jaw."""
    b, out = head_base(s), []
    for g in (1, -1):
        for k, y in enumerate((-0.32, -0.46, -0.6)):
            x = (0.12 - 0.03 * k) * g
            out.append((b + V((x, y, -0.06)) * HS, b + V((x, y, -0.13)) * HS, 0.02 * HS, False))
            out.append((b + V((x * 0.9, y + 0.05, -0.1)) * HS, b + V((x * 0.9, y + 0.05, -0.04)) * HS, 0.018 * HS, True))
    return out


def neck_sdf(P, s):
    pts = NECKS[s]
    d = K.tapered_tube(P, pts, NECK_R)
    for k in (1, 2, 3, 4):   # lumps of mud along its back
        c = pts[k] + V((0, 0.06, NECK_R[k] * 0.85))
        d = K.smin(d, K.ellipsoid(P, c, (0.07, 0.09, 0.07)), 0.05)
    return d


def leg_sdf(P, s):
    hip, knee, ankle, toe = LEGS[s]
    d = K.tapered_tube(P, [hip, knee, ankle], LEG_R[:3])
    d = K.smin(d, K.ellipsoid(P, hip.lerp(knee, 0.3), (0.3, 0.3, 0.36)), 0.12)   # (a heavy thigh)
    d = K.smin(d, K.round_cone(P, ankle, toe, LEG_R[2], LEG_R[3]), 0.06)
    return d


def claws(s):
    """(base, tip) of the three toes' claws of a foot."""
    hip, knee, ankle, toe = LEGS[s]
    out = []
    for k in (-1, 0, 1):
        base = toe + V((0.08 * k, -0.02, -0.02))
        out.append((base, base + V((0.06 * k, -0.15, -0.06))))
    return out


BUDGET_SMALL = 1600


def build_mesh(coll):
    """-> (the big parts, the small things): (mesh, owners) each."""
    parts, small = K.Parts(), K.Parts()
    pad = V((0.1,) * 3)
    lo = V((-0.85, -1.25, 0.55)), V((0.85, 1.35, 2.5))
    parts.add("body", torso_sdf, *lo, VOXEL, mat=MUD_M)
    tlo, thi = K.bounds(TAIL, 0.5)
    parts.add("tail", lambda P: K.tapered_tube(P, TAIL, TAIL_R), tlo, thi, VOXEL, mat=MUD_M)
    for s, _ in HEADS:
        nlo, nhi = K.bounds(NECKS[s], 0.38)
        parts.add(f"neck.{s}", lambda P, s=s: neck_sdf(P, s), nlo, nhi, DETAIL * 1.3, mat=MUD_M)
        b = head_base(s)
        hlo, hhi = b + V((-0.32, -0.85, -0.3)) * HS, b + V((0.32, 0.2, 0.32)) * HS
        parts.add(f"head.{s}", lambda P, s=s: head_sdf(P, s), hlo, hhi, DETAIL, mat=MUD_M)
        parts.add(f"jaw.{s}", lambda P, s=s: jaw_sdf(P, s), hlo, hhi, DETAIL, mat=MUD_M)
        parts.add(f"head.{s}", lambda P, s=s: mouth_sdf(P, s), hlo, hhi, DETAIL, mat=MOUTH_M)
        for g in (1, -1):
            e = b + V((EYE_AT.x * g, EYE_AT.y, EYE_AT.z))
            parts.add(f"head.{s}", lambda P, c=e: K.ellipsoid(P, c, EYE_R), e - V((0.12,) * 3), e + V((0.12,) * 3), FINE, mat=EYE_M)
            pupil = e + V((0.03 * g, -0.03, 0)) * HS
            small.add(f"head.{s}", lambda P, c=pupil: K.ellipsoid(P, c, PUPIL_R), pupil - V((0.1,) * 3), pupil + V((0.1,) * 3), FINE, mat=PUPIL_M)
        for base, tip, r, lower in teeth(s):
            tlo2, thi2 = K.bounds([base, tip], r + 0.03)
            small.add(f"jaw.{s}" if lower else f"head.{s}", lambda P, a=base, b2=tip, r=r: K.round_cone(P, a, b2, r, 0.004), tlo2, thi2, FINE, mat=TEETH_M)
    for s in ("L", "R"):
        w = WINGS[s]
        pts = [w["shoulder"], w["elbow"], w["wrist"], *w["tips"], w["root"]]
        wlo, whi = K.bounds(pts, 0.15)
        parts.add(f"wing.{s}", lambda P, s=s: membrane_sdf(P, s), wlo, whi, DETAIL, mat=WING_M)
        parts.add(f"wing.{s}", lambda P, s=s: wing_bones_sdf(P, s), wlo, whi, DETAIL, mat=MUD_M)
    for s in FEET:
        llo, lhi = K.bounds(LEGS[s], 0.4)
        parts.add(f"leg.{s}", lambda P, s=s: leg_sdf(P, s), llo, lhi, DETAIL * 1.3, mat=MUD_M)
        for base, tip in claws(s):
            clo, chi = K.bounds([base, tip], 0.08)
            small.add(f"foot.{s}", lambda P, a=base, b2=tip: K.round_cone(P, a, b2, 0.045, 0.008), clo, chi, FINE, mat=TEETH_M)
    return (parts.mesh(NAME, coll, MATERIALS), parts.owners), (small.mesh(NAME + "Small", coll, MATERIALS), small.owners)


# --- rig / skin -------------------------------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0, 0.5), None, False, fwd),
             ("body", HIPS, CHEST_J, "root", True, up),
             ("chest", CHEST_J, SHOULDERS, "body", True, up)]
    for k in range(len(TAIL) - 1):
        bones.append((f"tail.{k}", TAIL[k], TAIL[k + 1], f"tail.{k - 1}" if k else "body", True, up))
    for s, _ in HEADS:
        pts = NECKS[s]
        for k in range(5):
            bones.append((f"neck.{s}.{k}", pts[k], pts[k + 1], f"neck.{s}.{k - 1}" if k else "chest", True, up))
        b = head_base(s)
        bones.append((f"head.{s}", b, b + V((0, -0.5, 0)), "chest", True, up))
        bones.append((f"jaw.{s}", b + JAW_HINGE, b + MOUTH_TIP, f"head.{s}", True, up))
    for s in ("L", "R"):
        w = WINGS[s]
        bones += [(f"wing.{s}", w["shoulder"], w["elbow"], "chest", True, up),
                  (f"wing.{s}.1", w["elbow"], w["wrist"], f"wing.{s}", True, up)]
        for k, tip in enumerate(w["tips"]):
            bones.append((f"finger.{s}.{k}", w["wrist"], tip, f"wing.{s}.1", True, up))
    for s in FEET:
        hip, knee, ankle, toe = LEGS[s]
        bones += [(f"thigh.{s}", hip, knee, "chest" if s == "F" else "body", True, fwd),
                  (f"shin.{s}", knee, ankle, f"thigh.{s}", True, fwd),
                  (f"foot.{s}", ankle, toe, f"shin.{s}", True, up)]
    return K.armature(RIG_NAME, coll, bones, {"enemy": "sollmeldon", "forward": "-Y", "attack_style": "boss", "root_motion": False})


def shares(along, bounds, names, width):
    past = [C.np_smoothstep(b - width, b + width, along) for b in bounds]
    out = {}
    for k, name in enumerate(names):
        before = past[k - 1] if k else np.ones_like(along)
        after = past[k] if k < len(past) else np.zeros_like(along)
        out[name] = before - after
    return out


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def compute_weights(obj, owners, rigid=False):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    col = names.index
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        Q = P[lo:hi]
        WB = np.zeros((hi - lo, len(names)), np.float32)
        if part == "body":       # the hips into the chest (forward), the tail's root behind
            c, t = C.np_smoothstep(-0.15, -0.6, Q[:, 1]), C.np_smoothstep(0.85, 1.15, Q[:, 1])
            WB[:, col("chest")], WB[:, col("tail.0")], WB[:, col("body")] = c, t * (1 - c), (1 - c) * (1 - t)
        elif part in ("head", "jaw", "foot"):
            WB[:, col(f"{part}.{s}")] = 1
        elif part == "wing":     # by the nearest of its bones, the root of it on the chest
            w = WINGS[s]
            segs = [(f"wing.{s}", w["shoulder"], w["elbow"]), (f"wing.{s}.1", w["elbow"], w["wrist"])] + \
                [(f"finger.{s}.{k}", w["wrist"], tip) for k, tip in enumerate(w["tips"])] + [("chest", w["shoulder"], w["root"])]
            D = np.stack([C._polyline_closest(Q, [a, b])[0] for _, a, b in segs], axis=1)
            Wd = 1 / np.maximum(D, 0.02) ** 3
            Wd /= Wd.sum(axis=1, keepdims=True)
            for k, (name, _, _) in enumerate(segs):
                WB[:, col(name)] += Wd[:, k]
            WB = K.diffuse(obj, lo, hi, WB, 3)
        else:
            if part == "tail":
                pts, bones, width, root = TAIL, [f"tail.{k}" for k in range(len(TAIL) - 1)], 0.12, "body"
            elif part == "neck":
                pts, bones, width, root = NECKS[s], [f"neck.{s}.{k}" for k in range(5)], 0.08, "chest"
            else:   # a leg
                hip, knee, ankle, toe = LEGS[s]
                pts, bones, width, root = [hip, knee, ankle, toe], [f"thigh.{s}", f"shin.{s}", f"foot.{s}"], 0.08, "chest" if s == "F" else "body"
            _, along = C._polyline_closest(Q, pts)
            for name, share in shares(along, list(arc(pts)[1:-1]), bones, width).items():
                WB[:, col(name)] += share
            # (its root blends into what it hangs from)
            r = 1 - C.np_smoothstep(0.0, 0.22, along)
            WB *= (1 - r)[:, None]
            WB[:, col(root)] += r
            WB = K.diffuse(obj, lo, hi, WB, 4)
        if rigid:
            WB[:] = WB.mean(axis=0)
        W[lo:hi] = WB
    K.write_weights(obj, names, W)


def build():
    scene = K.creature_scene(SCENE)
    K.clear_collection(COLLECTION)
    coll = K.collection(COLLECTION, scene)
    rig = build_rig(coll)
    meshes = build_mesh(coll)
    for (o, owners), budget, rigid in zip(meshes, (F.TRIANGLE_BUDGET[NAME] - BUDGET_SMALL, BUDGET_SMALL), (False, True)):
        o.parent = rig
        o.modifiers.new("Armature", "ARMATURE").object = rig
        compute_weights(o, owners, rigid)
        K.decimate(o, budget)
    obj, small = meshes[0][0], meshes[1][0]
    view_layer = bpy.context.view_layer
    for o in view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    small.select_set(True)
    view_layer.objects.active = obj
    bpy.ops.object.join()
    obj["enemy"] = "sollmeldon"
    obj["style"] = "smooth_clay"
    for name, roughness in ROUGHNESS.items():
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- curves -------------------------------------------------------------------------------------------
def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def ease(u, kind="smooth"):
    u = clamp(u)
    if kind == "in":
        return u * u
    if kind == "out":
        return 1 - (1 - u) ** 2
    if kind == "linear":
        return u
    return u * u * (3 - 2 * u)


def curve(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            return a[1] + (b[1] - a[1]) * ease((t - a[0]) / (b[0] - a[0]), b[2] if len(b) > 2 else "smooth")
    return keys[-1][1]


def shake(t, rate, amount, seed=0.0):
    return amount * (math.sin(math.tau * rate * t + seed) * 0.7 + math.sin(math.tau * rate * 1.73 * t + 2.1 + seed) * 0.3)


# --- poses ----------------------------------------------------------------------------------------------
FK_ORDER = ["root", "body", "chest"] + [f"tail.{k}" for k in range(len(TAIL) - 1)]


class Rig:
    def __init__(self, rig):
        self.rig = rig
        self.skel = C.Skeleton(rig)
        self.rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
        self.legs = {s: (LEGS[s][1] - LEGS[s][0]).length for s in FEET}
        self.shins = {s: (LEGS[s][2] - LEGS[s][1]).length for s in FEET}
        # each head as it sits on its neck's tip (the neck's last bone's tail frame -> the head's)
        self.on_neck = {}
        for s, _ in HEADS:
            n4 = rig.data.bones[f"neck.{s}.4"]
            tip = n4.matrix_local @ Matrix.Translation((0, n4.length, 0))
            self.on_neck[s] = tip.inverted() @ rig.data.bones[f"head.{s}"].matrix_local


class Pose:
    def __init__(self, R):
        self.R = R
        self.rot = {n: Quaternion() for n in R.rest}
        self.loc = {n: Vector() for n in R.rest}
        self.scl = {n: Vector((1, 1, 1)) for n in R.rest}
        # each foot: its toe's offset from where it rests, and how much it rides with his root (0:
        # the floor holds it, 1: it hangs from him, in the air)
        self.feet = {s: {"offset": Vector(), "ride": 0.0, "up": 0.0} for s in FEET}
        self.free = {}     # a head off its neck: s -> (where it is, its turn, its size)
        self.stretch = {s: 1.0 for s, _ in HEADS}
        self.floor = 0.0

    def turn(self, bone, axis, angle):
        if angle:
            q = Quaternion(self.R.rest[bone].transposed() @ Vector(axis), angle)
            self.rot[bone] = q @ self.rot[bone]

    def move(self, bone, offset):
        self.loc[bone] += self.R.rest[bone].transposed() @ Vector(offset)

    def size(self, bone, s):
        self.scl[bone] = Vector((s, s, s)) if isinstance(s, (int, float)) else Vector(s)

    def tip(self, a=0.0, side=0.0, spin=0.0, up=0.0, forward=0.0):
        """All of him about the floor: tipped forward (+), to his left (+), spun (+ left); lifted, moved forward."""
        self.turn("root", (0, 0, 1), spin)
        self.turn("root", (1, 0, 0), a)
        self.turn("root", (0, 1, 0), side)
        if up or forward:
            self.move("root", (0, -forward, up))

    def lean(self, a=0.0, side=0.0, twist=0.0):
        """The chest over the hips: forward (+, down), to his left (+), round to his left (+)."""
        for b in ("body", "chest"):
            self.turn(b, (1, 0, 0), a / 2)
            self.turn(b, (0, 1, 0), side / 2)
            self.turn(b, (0, 0, 1), twist / 2)

    def tail(self, up=0.0, side=0.0):
        for k in range(len(TAIL) - 1):
            self.turn(f"tail.{k}", (1, 0, 0), up / 4)
            self.turn(f"tail.{k}", (0, 0, 1), side / 4)

    def neck(self, s, bend=0.0, side=0.0, stretch=1.0, twist=0.0):
        """A neck: bent down/forward (+) or drawn back up (-), to his left (+), stretched (each bone
        set off further along the one before it: the mud between them draws out)."""
        for k in range(5):
            b = f"neck.{s}.{k}"
            self.turn(b, (1, 0, 0), bend / 5)
            self.turn(b, (0, 0, 1), side / 5)
            self.turn(b, (0, 1, 0), twist / 5)
            if stretch != 1 and k:
                self.loc[b] += Vector((0, (stretch - 1) * (NECKS[s][k] - NECKS[s][k - 1]).length, 0))
        self.stretch[s] *= stretch

    def head(self, s, nod=0.0, turn=0.0, tilt=0.0):
        """A head on its neck: nodded down (+), turned to his left (+), tilted to his left (+)."""
        self.turn(f"head.{s}", (1, 0, 0), nod)
        self.turn(f"head.{s}", (0, 0, 1), turn)
        self.turn(f"head.{s}", (0, 1, 0), tilt)

    def jaw(self, s, a):
        self.turn(f"jaw.{s}", (1, 0, 0), a)

    def wing(self, s, back=0.0, down=0.0, fold=0.0, spread=0.0, beat=0.0):
        """A wing (s 'L' or 'R'): swung back (+), down (+); its forearm folded in (+); its fingers
        closed together (fold) or spread; beaten down (+) as a whole."""
        g = 1 if s == "L" else -1
        self.turn(f"wing.{s}", (0, 0, 1), back * g)
        self.turn(f"wing.{s}", (0, 1, 0), (down + beat) * g)
        self.turn(f"wing.{s}.1", (0, 0, 1), -fold * 1.6 * g)
        self.turn(f"wing.{s}.1", (0, 1, 0), beat * 0.4 * g)
        for k in range(3):
            self.turn(f"finger.{s}.{k}", (0, 0, 1), (fold * (1.2 + 0.25 * k) - spread * (k - 1) * 0.3) * g)

    def foot(self, s, offset=None, forward=0.0, up=0.0, out=0.0, ride=None):
        f = self.feet[s]
        g = SIGN.get(s, 0) if s != "F" else 0
        f["offset"] += (offset if offset is not None else Vector()) + Vector((out * g, -forward, up))
        f["up"] += up
        if ride is not None:
            f["ride"] = ride

    def bases(self):
        R, skel, poses, out = self.R, self.R.skel, {}, {}

        def fk(name):
            basis = Matrix.LocRotScale(self.loc[name], self.rot[name], self.scl[name])
            poses[name] = skel.base(name, poses) @ basis
            out[name] = basis

        for name in FK_ORDER:
            fk(name)
        for s, _ in HEADS:
            for k in range(5):
                fk(f"neck.{s}.{k}")
            n4 = f"neck.{s}.4"
            if s in self.free:   # (off its neck, flying)
                at, rot, size = self.free[s]
                desired = Matrix.LocRotScale(at, rot @ R.rest[f"head.{s}"].to_quaternion(), Vector((size, size, size)))
            else:   # on its neck's tip (its scale not passed on), turned as it is posed
                L = R.rig.data.bones[n4].length * self.stretch[s]
                tip = poses[n4] @ Matrix.Translation((0, L, 0))
                frame = Matrix.Translation(tip.translation) @ tip.to_3x3().normalized().to_4x4()
                desired = frame @ R.on_neck[s] @ Matrix.LocRotScale(self.loc[f"head.{s}"], self.rot[f"head.{s}"], self.scl[f"head.{s}"])
            poses[f"head.{s}"] = desired
            out[f"head.{s}"] = skel.base(f"head.{s}", poses).inverted() @ desired
            fk(f"jaw.{s}")
        for s in ("L", "R"):
            for n in (f"wing.{s}", f"wing.{s}.1", f"finger.{s}.0", f"finger.{s}.1", f"finger.{s}.2"):
                fk(n)
        # the legs: from where his toes stand (on the floor, or hanging from him)
        root = poses["root"] @ skel.rest["root"].inverted()
        r3 = root.to_3x3().normalized()
        for s in FEET:
            hip0, knee0, ankle0, toe0 = LEGS[s]
            f = self.feet[s]
            ride = Quaternion().slerp(root.to_quaternion(), f["ride"]).to_matrix()
            toe = root.translation * f["ride"] + ride @ (toe0 + f["offset"])
            toe.z = max(toe.z, 0.1 + self.floor * (1 - f["ride"]))
            lift = f["up"]   # (the step's: not the clip's lift off the floor)
            heel = ride @ (ankle0 - toe0)
            # (lifted, the foot points down a little as it swings)
            heel = Matrix.Rotation(-0.5 * clamp(lift / 0.3), 3, "X") @ heel if lift > 0 else heel
            ankle = toe + heel
            names = (f"thigh.{s}", f"shin.{s}", f"foot.{s}")
            hip = skel.base(names[0], poses).translation.copy()
            pole = r3 @ V((0, -1, 0.1))
            ankle = IK.soften(hip, ankle, R.legs[s] + R.shins[s], 0.95)
            knee, end = IK.two_bone(hip, ankle, R.legs[s], R.shins[s], pole)
            out[names[0]] = IK.aim(skel, names[0], poses, hip, knee - hip)
            out[names[1]] = IK.aim(skel, names[1], poses, knee, end - knee)
            out[names[2]] = IK.aim(skel, names[2], poses, end, toe - end)
        return out


def stance(p, k=1.0):
    """How he stands: wings folded along his sides, necks curving up, heads looking ahead, tail up a little."""
    for s in ("L", "R"):
        p.wing(s, back=1.25 * k, down=0.55 * k, fold=1.0 * k)
    p.tail(up=0.15 * k)
    p.neck("L", side=0.08 * k)
    p.neck("R", side=-0.08 * k)
    for s, _ in HEADS:
        p.head(s, nod=0.12 * k)


def breathe(p, t, T):
    b = math.sin(math.tau * t / 2.4) * clamp(min(t, T - t) / 0.4)
    p.size("body", (1 + 0.02 * b, 1, 1 + 0.02 * b))
    p.lean(a=-0.02 * b)


def sway_heads(p, t, amount=1.0, rate=0.35):
    """The heads never keep quite still: each sways on its own, out of step."""
    for i, (s, g) in enumerate(HEADS):
        ph = math.tau * rate * t + i * 2.1
        p.neck(s, bend=0.06 * amount * math.sin(ph), side=0.07 * amount * math.sin(ph * 0.7 + 1))
        p.head(s, turn=0.12 * amount * math.sin(ph * 1.3 + 0.5), tilt=0.06 * amount * math.sin(ph + 2))


def vec(x, y, z):
    return Vector((x, y, z))


# --- the clips ------------------------------------------------------------------------------------------
def idle(p, t, T):
    ph = math.tau * t / T
    b = math.sin(2 * ph)
    p.size("body", (1 + 0.025 * b, 1, 1 + 0.03 * b))
    p.lean(a=-0.03 * b, side=0.03 * math.sin(ph))
    p.tail(side=0.15 * math.sin(ph), up=0.05 * b)
    for i, (s, g) in enumerate(HEADS):   # each head looks about on its own
        q = ph + i * 2.1
        p.neck(s, bend=0.08 * math.sin(q), side=0.12 * math.sin(q + 0.8))
        p.head(s, turn=0.35 * math.sin(q + 1.6), nod=0.1 * math.sin(2 * q), tilt=0.1 * math.sin(q))
        p.jaw(s, 0.04 + 0.04 * math.sin(2 * q + i))
    for s in ("L", "R"):   # the wings shift on his back
        p.wing(s, back=0.05 * math.sin(ph + (0 if s == "L" else 1)), down=0.04 * b)


def walk(p, t, T):
    # his three legs step one after another (each down two thirds of the loop: two always on the floor)
    duty = 0.7
    stride = WALK_SPEED * duty * T
    ph = t / T
    for s, o in (("L", 0.0), ("F", 1 / 3), ("R", 2 / 3)):
        along, lift = IK.step(ph + o, duty, stride, 0.3)
        p.foot(s, forward=along, up=lift)
    w = math.tau * ph
    p.tip(up=0.04 * math.cos(3 * w) - 0.04, side=0.04 * math.sin(w))
    p.lean(side=0.05 * math.sin(w), twist=0.06 * math.sin(w))
    p.tail(side=-0.25 * math.sin(w), up=0.05 * math.cos(3 * w))
    for i, (s, g) in enumerate(HEADS):
        p.neck(s, bend=0.05 * math.cos(3 * w + i), side=-0.06 * math.sin(w + i * 0.5))
        p.head(s, nod=-0.05 * math.cos(3 * w + i + 0.6), turn=0.08 * math.sin(w + i))
    for s in ("L", "R"):
        p.wing(s, down=0.03 * math.cos(3 * w))


def fly(p, t, T):
    # up in the air (the game lifts him): his wings beat (spread out, down and up), his legs hang back,
    # his tail streams out behind, his heads forward
    w = math.tau * t / T
    beat = math.sin(w)
    for s in ("L", "R"):
        p.wing(s, back=-1.25 + 0.15, down=-0.55, fold=-1.0 + 0.25 * (0.5 - 0.5 * beat), beat=0.75 * beat, spread=0.4)
    p.tip(up=0.45 + 0.15 * math.cos(w), a=0.12)
    p.lean(a=-0.05 * math.cos(w))
    p.tail(up=0.3, side=0.1 * math.sin(w * 0.5))
    for s in FEET:   # hanging back, swinging a little with the beats
        p.foot(s, up=0.25 + 0.05 * math.cos(w), forward=-0.35 + 0.05 * beat, ride=1)
    sway_heads(p, t, 0.6, 1 / T)
    for s, _ in HEADS:
        p.neck(s, bend=0.15 - 0.05 * math.cos(w))


def bite(s):
    def clip(p, t, T):
        # the head `s` draws back up (the tell), then lunges forward on its stretched neck and snaps at
        # the hit (0.9 s); the others lean out of its way
        hit = 27 / FPS
        back = curve(t, [(0, 0), (0.6, 1, "out"), (hit - 0.12, 0.9), (hit, 0, "in"), (T, 0)])
        lunge = curve(t, [(0.6, 0), (hit, 1, "in"), (hit + 0.25, 0.9), (T, 0)])
        open_ = curve(t, [(0.3, 0), (0.6, 0.35), (hit - 0.08, 0.75, "out"), (hit, 0.0, "in"), (hit + 0.3, 0.1), (T, 0)])
        g = SIGN[s]
        p.neck(s, bend=-0.7 * back + 0.85 * lunge, side=0.15 * g * back - 0.1 * g * lunge, stretch=1 + 0.35 * lunge)
        p.head(s, nod=-0.35 * back + 0.25 * lunge + shake(t, 7, 0.05) * back)
        p.jaw(s, 0.6 * open_)
        p.lean(a=-0.12 * back + 0.2 * lunge, twist=0.12 * g * lunge)
        p.tip(forward=0.1 * lunge, a=0.04 * lunge)
        for o, og in HEADS:
            if o != s:
                p.neck(o, side=0.3 * (og - g) * 0.5 * (back + lunge), bend=-0.15 * (back + lunge))
                p.head(o, turn=-0.3 * g * lunge)
        p.foot("F", forward=0.15 * lunge)
        p.tail(up=-0.15 * lunge + 0.1 * back)
        for w in ("L", "R"):
            p.wing(w, back=-0.15 * back, down=-0.1 * back)
        sway_heads(p, t, 0.4)
    return clip


def spit(p, t, T):
    # the heads rear back, swelling (the tell), and thrust forward spitting at the hit (0.8 s)
    hit = 24 / FPS
    back = curve(t, [(0, 0), (0.6, 1, "out"), (hit, 0, "in"), (T, 0)])
    thrust = curve(t, [(0.6, 0), (hit, 1, "in"), (hit + 0.25, 0.8), (T, 0)])
    for i, (s, g) in enumerate(HEADS):
        p.neck(s, bend=-0.5 * back + 0.45 * thrust, side=0.1 * g * back, stretch=1 + 0.12 * thrust)
        p.head(s, nod=-0.4 * back + 0.15 * thrust)
        p.size(f"head.{s}", 1 + 0.1 * back)
        p.jaw(s, 0.15 * back + 0.55 * thrust)
    p.lean(a=-0.15 * back + 0.15 * thrust)
    p.tail(up=0.2 * back)
    for w in ("L", "R"):
        p.wing(w, back=-0.25 * back, down=-0.2 * back)


def air_spit(p, t, T):
    # flying (his wings beating as in his fly loop), the heads spit down at the hit (0.5 s)
    fly(p, t, 24 / FPS)
    hit = 15 / FPS
    back = curve(t, [(0, 0), (hit - 0.1, 1, "out"), (hit, 0, "in")])
    thrust = curve(t, [(hit - 0.1, 0), (hit, 1, "in"), (T, 0)])
    for s, g in HEADS:
        p.neck(s, bend=-0.35 * back + 0.6 * thrust)
        p.head(s, nod=-0.3 * back + 0.35 * thrust)
        p.jaw(s, 0.2 * back + 0.5 * thrust)


def summon(p, t, T):
    # he rears up on his hind legs (the front one off the floor), wings half spread, heads up roaring,
    # and stomps the front foot down at the hit (1.1 s): mud bubbles up round it (the game)
    hit = 33 / FPS
    rear = curve(t, [(0, 0), (0.85, 1, "out"), (hit, 0, "in"), (T, 0)])
    stomp = curve(t, [(hit - 0.05, 0), (hit, 1, "in"), (hit + 0.3, 0.6), (T, 0)])
    p.tip(a=-0.25 * rear + 0.06 * stomp, up=0.2 * rear - 0.08 * stomp)
    p.foot("F", up=0.6 * rear, forward=0.2 * rear)
    p.lean(a=-0.2 * rear + 0.15 * stomp)
    for s, g in HEADS:
        p.neck(s, bend=-0.5 * rear + 0.3 * stomp, side=0.25 * g * rear)
        p.head(s, nod=-0.5 * rear + 0.3 * stomp)
        p.jaw(s, 0.6 * rear + 0.3 * stomp)
    for w in ("L", "R"):
        p.wing(w, back=-0.8 * rear, down=-0.4 * rear, fold=-0.5 * rear)
    p.tail(up=-0.3 * rear)


def cut(s):
    def clip(p, t, T):
        # a head cut off: he rears and shakes; the head thrashes, tears off at CUT_AT, flies in an arc
        # (tumbling) and lands beside him at CUT_LAND, melting into mud; its stump shrinks back; the
        # other heads roar
        at, land = CUT_AT / FPS, CUT_LAND / FPS
        g = SIGN[s]
        rear = curve(t, [(0, 0), (0.7, 1, "out"), (at, 0.8), (1.6, 0.2), (T, 0)])
        quake = shake(t, 9, 0.08) * curve(t, [(0.3, 0), (0.6, 1), (1.6, 1), (2.2, 0)])
        p.tip(a=-0.2 * rear, up=0.1 * rear, side=quake * 0.5)
        p.lean(a=-0.2 * rear + quake, side=0.15 * g * rear)
        thrash = shake(t, 5, 0.35) * curve(t, [(0.1, 0), (0.4, 1), (at, 1)])
        p.neck(s, bend=-0.4 * rear + thrash, side=0.4 * g * rear + thrash)
        for o, og in HEADS:
            if o != s:
                p.neck(o, bend=-0.6 * rear, side=-0.2 * g * rear)
                p.head(o, nod=-0.5 * rear)
                p.jaw(o, 0.6 * rear)
        # its stump shrinks back once the head is off
        gone = curve(t, [(at, 0), (at + 0.5, 1, "out")])
        for k in range(1, 5):
            p.size(f"neck.{s}.{k}", max(0.02, 1 - gone))
        for w in ("L", "R"):
            p.wing(w, back=-0.6 * rear, down=-0.3 * rear, fold=-0.3 * rear)
        p.tail(up=-0.2 * rear + quake)
        if t >= at:   # off: where it flies and lands (its own frame, from where it came off)
            u = clamp((t - at) / (land - at))
            start = p.R.rig.data.bones[f"head.{s}"].head_local.copy()
            end = vec(CUT_SPOT[s].x, CUT_SPOT[s].y, 0.22)
            pos = start.lerp(end, u) + vec(0, 0, 1.4 * math.sin(math.pi * u))
            spin = Quaternion(Vector((g * 0.3, 1, 0.2)).normalized(), 4.5 * ease(u, "out"))
            melt = curve(t, [(land, 1), (land + 0.6, 0.02)])
            squash = curve(t, [(land - 0.02, 1), (land + 0.08, 0.6), (land + 0.6, 0.02)])
            p.free[s] = (pos - vec(0, 0, 0.2 * (1 - squash)), spin, max(0.02, 0.5 * (melt + squash)))
    return clip


# where each head lands as it is cut off (armature space, on the floor: core/enemies.js SOLLMELDON_AT.cut)
CUT_SPOT = {"L": vec(2.2, -1.6, 0), "M": vec(0.4, -3.0, 0), "R": vec(-2.2, -1.6, 0)}


def death(p, t, T):
    # struck, he rears back; his legs buckle and he sinks, slumping forward, his necks dropping, his
    # wings sagging out over the floor, and his mud flattening out (melting)
    hit = curve(t, [(0, 0), (0.25, 1, "out"), (0.7, 0.3), (1.0, 0)])
    buckle = curve(t, [(0.4, 0), (1.4, 1, "in"), (1.55, 0.95), (1.7, 1)])
    melt = curve(t, [(1.0, 0), (2.4, 1, "in")])
    p.tip(a=-0.2 * hit + 0.15 * buckle, up=-0.6 * buckle - 0.5 * melt)
    p.size("body", (1 + 0.3 * melt, 1 + 0.15 * melt, 1 - 0.55 * melt))
    p.size("chest", (1 + 0.2 * melt, 1, 1 - 0.3 * melt))
    p.lean(a=-0.3 * hit + 0.4 * buckle)
    for i, (s, g) in enumerate(HEADS):
        p.neck(s, bend=-0.6 * hit + 1.2 * buckle, side=0.4 * g * buckle)
        p.head(s, nod=-0.4 * hit + 0.6 * buckle)
        p.jaw(s, 0.5 * hit + 0.3 * buckle)
    for w in ("L", "R"):
        p.wing(w, back=1.25 - 1.25 * buckle, down=0.55 - 0.3 * buckle, fold=1.0 - 0.7 * buckle)
    for s in FEET:
        p.foot(s, out=0.4 * buckle)
    p.tail(up=-0.3 * buckle)


CLIPS = {
    "SollmeldonWalk": (walk, 36, True, {"speed": WALK_SPEED}),
    "SollmeldonIdle": (idle, 90, True, {}),
    "SollmeldonFly": (fly, 24, True, {}),
    "SollmeldonBiteL": (bite("L"), 48, False, {}),
    "SollmeldonBiteM": (bite("M"), 48, False, {}),
    "SollmeldonBiteR": (bite("R"), 48, False, {}),
    "SollmeldonSpit": (spit, 42, False, {}),
    "SollmeldonAirSpit": (air_spit, 33, False, {}),
    "SollmeldonSummon": (summon, 54, False, {}),
    "SollmeldonCutL": (cut("L"), 78, False, {}),
    "SollmeldonCutM": (cut("M"), 78, False, {}),
    "SollmeldonCutR": (cut("R"), 78, False, {}),
    "SollmeldonDeath": (death, 78, False, {"hold_last_frame": True}),
}
DEATH_SETTLE = 62
FLYING = ("SollmeldonFly", "SollmeldonAirSpit")


def solver(R, name):
    fn, n, loop, _ = CLIPS[name]
    T = n / FPS

    def solve(f, lift):
        p = Pose(R)
        t = f / FPS
        stance(p)
        if not loop and fn is not death:
            breathe(p, t, T)
        if name not in FLYING and not name.startswith("SollmeldonCut") and fn is not death and name != "SollmeldonWalk":
            sway_heads(p, t, 0.5)
        fn(p, t, T)
        p.move("root", (0, 0, lift))
        for foot in p.feet.values():
            foot["offset"].z += lift * (1 - foot["ride"])
        p.floor = lift
        for s in p.free:   # (kept off the floor with him)
            at, rot, size = p.free[s]
            p.free[s] = (at + V((0, 0, lift)), rot, size)
        return p.bases()
    return solve


def animate(rig, obj):
    R = Rig(rig)
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for name, (fn, n, loop, extras) in CLIPS.items():
        K.ground_clip(rig, obj, name, solver(R, name), n, cyclic=loop, extras=extras,
                      settle_from=DEATH_SETTLE if name == "SollmeldonDeath" else None)


# --- what the game reads off him -------------------------------------------------------------------
def game(v):
    return [round(v.x * GAME_SCALE, 3), round(v.z * GAME_SCALE, 3), round(-v.y * GAME_SCALE, 3)]


def bone_point(rig, clip, frame, bone, rest_point):
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ rig.data.bones[bone].matrix_local.inverted() @ rest_point


def points(rig):
    """Each head's mouth as it spits (on the ground and flying), and where each head lands as it is cut
    off (on the floor), put on the clips (extras) and returned."""
    out = {"mouths": [], "air": [], "cut": []}
    for s, _ in HEADS:
        mouth = head_base(s) + MOUTH
        out["mouths"].append(game(bone_point(rig, "SollmeldonSpit", 24, f"head.{s}", mouth)))
        out["air"].append(game(bone_point(rig, "SollmeldonAirSpit", 15, f"head.{s}", mouth)))
        landed = game(bone_point(rig, f"SollmeldonCut{s}", CUT_LAND, f"head.{s}", head_base(s)))
        out["cut"].append([landed[0], 0, landed[2]])
        bpy.data.actions[f"SollmeldonCut{s}"]["land"] = out["cut"][-1]
    bpy.data.actions["SollmeldonSpit"]["muzzles"] = out["mouths"]
    bpy.data.actions["SollmeldonAirSpit"]["muzzles"] = out["air"]
    # where his Mud squirtles are called from: his front foot as it stomps
    hip, knee, ankle, toe = LEGS["F"]
    out["summon"] = game(bone_point(rig, "SollmeldonSummon", 33, "foot.F", toe))
    bpy.data.actions["SollmeldonSummon"]["muzzle"] = out["summon"]
    for clip, frame in (("SollmeldonSpit", 24), ("SollmeldonAirSpit", 15), ("SollmeldonSummon", 33), ("SollmeldonBiteL", 27),
                        ("SollmeldonBiteM", 27), ("SollmeldonBiteR", 27)):
        bpy.data.actions[clip]["hit_frame"] = frame
    for s, _ in HEADS:
        bpy.data.actions[f"SollmeldonCut{s}"]["cut_frame"] = CUT_AT
        bpy.data.actions[f"SollmeldonCut{s}"]["land_frame"] = CUT_LAND
    rig.animation_data.action = None
    return out


# --- previews ------------------------------------------------------------------------------------------
def preview(scene, rig, path):
    far, target = (6.0, -7.5, 4.2), (0, -0.4, 1.6)
    shots = [("SollmeldonIdle", 0, far), ("SollmeldonWalk", 12, far), ("SollmeldonFly", 6, far), ("SollmeldonBiteL", 27, far),
             ("SollmeldonSpit", 24, far), ("SollmeldonSummon", 26, far), ("SollmeldonCutM", 44, far), ("SollmeldonDeath", 78, far)]
    K.contact_sheet(scene, rig, shots, path, target, size=360, cols=4)


def videos(scene, rig, out_dir):
    views = [((6.0, -9.0, 4.2), 8.0), ((10.0, 0.0, 3.0), 8.0)]
    return K.clip_videos(scene, rig, tuple(CLIPS), out_dir, (0, -0.4, 1.6), views)


def main(export_path=None, blend_path=None, preview_path=None, video_dir=None):
    scene, rig, obj = build()
    animate(rig, obj)
    report = K.validate(rig, obj, tuple(CLIPS), held=("SollmeldonDeath",))
    report.update(points(rig))
    K.register(rig, tuple(CLIPS))
    K.setup_stage(scene, "Sollmeldon", STAGE, (0, -0.4, 1.6), 7.5, camera=(6.0, -9.0, 5.0))
    rig.animation_data.action = bpy.data.actions["SollmeldonIdle"]
    scene.frame_start, scene.frame_end = 0, CLIPS["SollmeldonIdle"][1]
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), tuple(CLIPS), "Sollmeldon", NAME, (0, -0.4, 1.6), 10.0)
    if preview_path:
        preview(scene, rig, preview_path)
    if video_dir:
        report["videos"] = videos(scene, rig, video_dir)
    obj.data.calc_loop_triangles()
    report["triangles"] = len(obj.data.loop_triangles)
    print("Sollmeldon:", {k: v for k, v in report.items() if k != "clips"})
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "sollmeldon.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "sollmeldon.blend"),
         preview_path=args[2] if len(args) > 2 else None, video_dir=args[3] if len(args) > 3 else None)
