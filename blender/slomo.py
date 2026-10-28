"""
Slomo: the slime boss at the bottom of act II, from the kids' sketches. One model, three shapes.

Phase 1, the blob: a great see-through dome of lime slime (the game draws its skin translucent:
core/enemies.js SLOMO `shell`), the squiggly stuff a Bolime has inside it (here drawn like the
sketch's angry face: two wavy lines, a bar and a frown), two eye stalks on top with a round eye on
each tip and a V of slime between them, and two long slime arms out of its sides, each ending in a
Slug (the slime marsh's: striped, curly legs, eye stalks). He throws the slugs; the game scales a
thrown one away (`hand.L`, `hand.R`) and grows it back.
Phase 2, on legs: the blob (a little smaller) sits in front of a slug body striped dark across its
back, carried on six long legs, the slug's own eye stalks at its far end.
Phase 3, the slug: the slug alone, turned round (its head in front now), still on its legs.
Each clip shows one shape and scales the others' bones away (HIDDEN); render/slomoview.js blends
the gaits of two shapes while he changes. Faces -Y in Blender, +Z up; one unit = one game cell.

Rig: root; blob (the blob and its arms ride it: placed and sized per shape) with body (the lower
half: squash and stretch), top (the upper half), core (the stuff inside), stalk.L, stalk.R,
arm.L.1-3 and hand.L (the slug on its end), arm.R.1-3 and hand.R; slug (the slug and its legs ride
it: hidden, in place behind the blob, or turned round to the front) with slug.front, slug.mid,
slug.head (its body, front to head), antenna.L, antenna.R, and its legs: leg.1L .. leg.3R (from the
hip to the knee, which stands out and up from it, like a beetle's) and shin.1L .. shin.3R (from the
knee down to the foot). The clips say where each foot goes (as a straight leg from the hip would
put it: swung and splayed); the knees bend to reach it (ik.py limb).

Clips, 30 fps, in place:
    SlomoOoze        the blob's gait, 40-frame loop: squashing and swaying along, arms swinging.
    SlomoArmL / R    1.5 s: winds an arm up and back and whips it forward, the slug leaving its end
                     at frame 27 (extras.hit_frame, extras.muzzle: the slug).
    SlomoMeteor      1.8 s: squashes down and heaves up tall, spitting gloop into the sky at 33.
    SlomoStride      on legs, 32-frame loop: the legs in two tripods, each foot down for half the loop
                     sweeping back at the pace the body goes (extras.speed), lifted for the other half.
    SlomoJump        3 s: crouches on splayed legs, springs off at 21 (extras.ride_frame; the game
                     lifts him), lands at 60 squashed wide and squats winded until 81.
    SlomoFlood       2.4 s: rears up on his hind legs and slams down at 54.
    SlomoMeteorLegs  1.8 s: the meteorites on legs (hit 33).
    SlomoCrawl       the slug's gait on its legs, 36-frame loop, stepping like the stride.
    SlomoSpit        1.4 s: rears up and spits slime at 24 (extras.muzzle: its mouth).
    SlomoSummon      1.6 s: shudders, its back heaving, slimes bursting out at 30.
    SlomoMeteorSlug  1.8 s: the meteorites as the slug (hit 33).
    SlomoFloodSlug   2.4 s: the flood as the slug (hit 54).
    SlomoDeath       2.4 s: as the slug, shudders, sags flat, legs splaying. Held.
    SlomoArmSlug     (a prop, not a clip): a slug he throws, its head first.

Headless:
    Blender -b --python blender/slomo.py -- assets/slomo.glb blender/slomo.blend \
        blender/previews/slomo-preview.png
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
import ik as IK

NAME, RIG_NAME, PROP = "Slomo", "SlomoRig", "SlomoArmSlug"
SCENE, COLLECTION, STAGE = "Slomo", "SlomoAsset", "SlomoStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
CLIPS = ("SlomoOoze", "SlomoArmL", "SlomoArmR", "SlomoMeteor", "SlomoStride", "SlomoJump", "SlomoFlood", "SlomoMeteorLegs",
         "SlomoCrawl", "SlomoSpit", "SlomoSummon", "SlomoMeteorSlug", "SlomoFloodSlug", "SlomoDeath")

SKIN_HEX, CORE_HEX, STALK_HEX, EYE_HEX, PUPIL_HEX = "#8ae048", "#2e7a22", "#6cc23a", "#f4f8d8", "#141a0c"
SLUG_HEX, STRIPE_HEX, FOOT_HEX, SLUG_EYE_HEX, MOUTH_HEX = "#2e5a22", "#16300f", "#5a7a3a", "#e4f0a0", "#14200e"
MATERIALS = (("SlomoSkin", SKIN_HEX, 0.15), ("SlomoCore_glow", CORE_HEX, 0.9), ("SlomoStalk", STALK_HEX, 0),
             ("SlomoEyes", EYE_HEX, 0), ("SlomoPupils", PUPIL_HEX, 0), ("SlomoSlug", SLUG_HEX, 0), ("SlomoStripes", STRIPE_HEX, 0),
             ("SlomoFoot", FOOT_HEX, 0), ("SlomoSlugEyes_glow", SLUG_EYE_HEX, 0.6), ("SlomoMouth", MOUTH_HEX, 0))
SKIN_M, CORE_M, STALK_M, EYE_M, PUPIL_M, SLUG_M, STRIPE_M, FOOT_M, SEYE_M, MOUTH_M = range(len(MATERIALS))
PROP_MATERIALS = (("SlomoArmSlugBody", SLUG_HEX, 0), ("SlomoArmSlugStripes", STRIPE_HEX, 0), ("SlomoArmSlugFoot", FOOT_HEX, 0),
                  ("SlomoArmSlugEyes", SLUG_EYE_HEX, 0.6), ("SlomoArmSlugPupils", PUPIL_HEX, 0))

VOXEL, MID, FINE = 0.02, 0.012, 0.007
HIDDEN = 0.001
OOZE_FRAMES, OOZE_SPEED = 40, 0.9
ARM_FRAMES, ARM_HIT = 45, 27
METEOR_FRAMES, METEOR_HIT = 54, 33
STRIDE_FRAMES = 32
JUMP_FRAMES, JUMP_FROM, JUMP_HIT, JUMP_WINDED = 90, 21, 60, 81
FLOOD_FRAMES, FLOOD_HIT = 72, 54
CRAWL_FRAMES = 36
SPIT_FRAMES, SPIT_HIT = 42, 24
SUMMON_FRAMES, SUMMON_HIT = 48, 30
DEATH_FRAMES = 72

# --- body plan: the blob ---------------------------------------------------------------------
BLOB_C, BLOB_R = V((0, 0, 1.2)), (1.15, 1.05, 1.22)
B0 = V((0, 0, 0.05))                     # the blob bone's head: what it is sized about
STALKS = {s: [V((s * 0.42, -0.1, 2.2)), V((s * 0.56, -0.2, 2.6)), V((s * 0.7, -0.3, 2.95))] for s in (-1, 1)}
EYE_R = 0.16
TUFT = [[V((s * 0.04, -0.2, 2.34)), V((s * 0.24, -0.36, 2.66))] for s in (-1, 1)]


def zigzag(x, z0, z1, y, n=6, amp=0.08):
    return [V((x + (amp if i % 2 else -amp), y, z0 + (z1 - z0) * i / n)) for i in range(n + 1)]


# the stuff inside it, after the sketch's face: two wavy lines, a bar across and a frown under it
CORE = [zigzag(-0.32, 1.45, 2.0, -0.42), zigzag(0.32, 1.45, 2.0, -0.42),
        [V((-0.62, -0.45, 1.22)), V((-0.2, -0.5, 1.18)), V((0.2, -0.5, 1.24)), V((0.62, -0.45, 1.2))],
        [V((-0.55, -0.45, 0.42)), V((-0.32, -0.5, 0.78)), V((0, -0.52, 0.95)), V((0.32, -0.5, 0.78)), V((0.55, -0.45, 0.42))]]
# the arms: out of its sides and down, then up to the slug on the end (x > 0: the left)
ARM_PTS = {s: [V((s * 1.02, 0.05, 1.32)), V((s * 1.45, 0.1, 1.04)), V((s * 1.88, 0.1, 1.06)), V((s * 2.15, 0.05, 1.32))] for s in (1, -1)}
ARM_R = (0.17, 0.14, 0.12, 0.11)
HANDS = {s: V((s * 2.5, 0.05, 1.46)) for s in (1, -1)}
HAND_SIZE = 1.4                          # the slugs on the arms' ends (and the one he throws), times a Slug's plan here
SIDE = {1: "L", -1: "R"}

# --- body plan: the slug (in place behind the blob, phase 2) -----------------------------------
SLUG_PIVOT = V((0, 1.0, 1.3))
SPINE = [V((0, 0.0, 1.42)), V((0, 0.6, 1.5)), V((0, 1.2, 1.46)), V((0, 1.75, 1.38)), V((0, 2.1, 1.34))]
SPINE_R = (0.42, 0.55, 0.52, 0.42, 0.34)
SLUG_HEAD = V((0, 2.12, 1.34))
MOUTH = V((0, 2.42, 1.26))
ANTENNAE = {s: [V((s * 0.13, 2.18, 1.6)), V((s * 0.2, 2.32, 1.86)), V((s * 0.28, 2.42, 2.1))] for s in (-1, 1)}
SEYE_R = 0.085
# (s: side, y: the hip along the body, fan: the foot set forward (-) or back (+) of it: an insect's
# legs fan out, so neighbours never cross as they swing)
LEGS = {f"leg.{i + 1}{SIDE[s]}": (s, y, fan) for i, (y, fan) in enumerate(((0.55, -0.3), (1.1, 0.0), (1.6, 0.3))) for s in (1, -1)}
HIP_Z = 1.18


def leg_points(s, y, fan=0.0):
    """A long leg: out from under the body to a knee higher than the hip, well out to the side (a
    beetle's), and down from it to a round foot."""
    return [V((s * 0.36, y, HIP_Z)), V((s * 1.12, y - 0.03 + 0.5 * fan, 1.45)), V((s * 0.7, y - 0.06 + fan, 0.08))]


def shin(name):
    return "shin." + name[4:]


def hip(name):
    return leg_points(*LEGS[name])[0]


# --- a slug (the arms' ends, the thrown prop) ------------------------------------------------
def slug_parts(parts, c, fwd, owner, scale=1.0, mats=(SLUG_M, STRIPE_M, FOOT_M, SEYE_M, PUPIL_M)):
    """A small Slug at c, its head along fwd (horizontal), as the slime marsh's: a striped body
    on four curly legs, two eye stalks with a round eye on each tip."""
    body_m, stripe_m, foot_m, eye_m, pupil_m = mats
    up, f = V((0, 0, 1)), fwd.normalized()
    side = f.cross(up).normalized()
    k = scale
    spine = [c - f * 0.3 * k + up * 0.02 * k, c - f * 0.08 * k + up * 0.06 * k, c + f * 0.14 * k + up * 0.06 * k, c + f * 0.26 * k + up * 0.04 * k]
    radii = (0.03 * k, 0.12 * k, 0.12 * k, 0.1 * k)
    head = c + f * 0.26 * k + up * 0.05 * k
    lo, hi = K.bounds(spine, 0.16 * k)

    def body(P):
        d = K.tapered_tube(P, spine, radii)
        d = K.smax(d, -(P[..., 2] - (c.z - 0.07 * k)), 0.03 * k)
        return K.smin(d, K.ellipsoid(P, head, (0.1 * k, 0.1 * k, 0.09 * k)), 0.04 * k)

    def stripes(centers):
        along = (centers - np.asarray(c, np.float32)) @ np.asarray(f, np.float32)
        z = centers[:, 2] - c.z
        stripe = (np.sin(along * TAU / (0.09 * k)) > 0.4) & (z > 0.04 * k) & (along < 0.18 * k) & (along > -0.24 * k)
        return np.where(z < -0.05 * k, foot_m, np.where(stripe, stripe_m, body_m))
    parts.add(owner, body, lo, hi, FINE * k, mat=stripes)
    for sx in (-1, 1):   # the eye stalks, and an eye on each tip
        pts = [head + side * sx * 0.03 * k + up * 0.06 * k, head + side * sx * 0.05 * k + f * 0.02 * k + up * 0.17 * k,
               head + side * sx * 0.08 * k + f * 0.03 * k + up * 0.27 * k]
        lo, hi = K.bounds(pts, 0.05 * k)
        parts.add(owner, lambda P, p=pts: K.tapered_tube(P, p, (0.022 * k, 0.017 * k, 0.014 * k)), lo, hi, FINE * k, mat=body_m)
        eye = pts[-1] + up * 0.03 * k
        r = 0.04 * k
        parts.add(owner, lambda P, e=eye: K.ellipsoid(P, e, (r, r, r)), eye - V((r * 2,) * 3), eye + V((r * 2,) * 3), FINE * k * 0.8, mat=eye_m)
        pupil = eye + f * r * 0.85
        parts.add(owner, lambda P, e=pupil: K.ellipsoid(P, e, (0.018 * k, 0.018 * k, 0.018 * k)), pupil - V((0.04 * k,) * 3),
                  pupil + V((0.04 * k,) * 3), FINE * k * 0.8, mat=pupil_m)
    for t in (-0.16, 0.1):   # four short curly legs
        for sx in (-1, 1):
            o = c + f * t * k + side * sx * 0.07 * k
            pts = [o, o + side * sx * 0.04 * k - up * 0.07 * k, o + side * sx * 0.05 * k - up * 0.1 * k + f * 0.03 * k,
                   o + side * sx * 0.03 * k - up * 0.085 * k + f * 0.06 * k]
            lo, hi = K.bounds(pts, 0.05 * k)
            parts.add(owner, lambda P, p=pts: K.tapered_tube(P, p, (0.028 * k, 0.025 * k, 0.02 * k, 0.016 * k)), lo, hi, FINE * k, mat=foot_m)


# --- mesh --------------------------------------------------------------------------------------
def blob_sdf(P):
    d = K.ellipsoid(P, BLOB_C, BLOB_R)
    d = K.smax(d, -(P[..., 2] - 0.03), 0.1)          # it sits on the floor, flat underneath
    for pts in TUFT:                                  # the V on top
        d = K.smin(d, K.round_cone(P, pts[0], pts[1], 0.1, 0.04), 0.07)
    return d


def slug_sdf(P):
    d = K.tapered_tube(P, SPINE, SPINE_R)
    d = K.smax(d, -(P[..., 2] - 1.02), 0.06)          # a flatter belly
    return K.smin(d, K.ellipsoid(P, SLUG_HEAD, (0.34, 0.36, 0.32)), 0.1)


def slug_mats(centers):
    """Dark stripes across its back (the sketch's shading), a paler foot under it."""
    y, z = centers[:, 1], centers[:, 2]
    stripe = (np.sin((y - 0.05) * TAU / 0.3) > 0.2) & (z > 1.62) & (y > 0.08) & (y < 1.85)
    top = (z > 1.85) & (y < 1.85)
    m = np.where(stripe | top, STRIPE_M, SLUG_M)
    return np.where(z < 1.1, FOOT_M, m)


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = BLOB_C - V((1.25, 1.15, 1.25)), BLOB_C + V((1.25, 1.15, 1.6))
    parts.add("body", blob_sdf, lo, hi, VOXEL, mat=SKIN_M)
    for line in CORE:
        lo, hi = K.bounds(line, 0.1)
        parts.add("core", lambda P, p=line: K.tapered_tube(P, p, [0.06] * len(p)), lo, hi, FINE * 1.3, mat=CORE_M)
    for s, pts in STALKS.items():
        side = "stalk.L" if s > 0 else "stalk.R"
        lo, hi = K.bounds(pts, 0.1)
        parts.add(side, lambda P, p=pts: K.tapered_tube(P, p, (0.075, 0.06, 0.05)), lo, hi, FINE * 1.3, mat=STALK_M)
        eye = pts[-1] + V((0, 0, EYE_R * 0.7))
        parts.add(side, lambda P, c=eye: K.ellipsoid(P, c, (EYE_R, EYE_R, EYE_R)), eye - V((0.2,) * 3), eye + V((0.2,) * 3), FINE * 1.3, mat=EYE_M)
        pupil = eye + V((0, -EYE_R * 0.84, 0.0))
        parts.add(side, lambda P, c=pupil: K.ellipsoid(P, c, (0.065, 0.032, 0.07)), pupil - V((0.1,) * 3), pupil + V((0.1,) * 3), FINE, mat=PUPIL_M)
    for s, pts in ARM_PTS.items():
        lo, hi = K.bounds(pts, 0.2)
        parts.add(f"arm.{SIDE[s]}", lambda P, p=pts: K.tapered_tube(P, p, ARM_R), lo, hi, MID, mat=SKIN_M, side=s)
        slug_parts(parts, HANDS[s], V((s, 0, 0)), f"hand.{SIDE[s]}", scale=HAND_SIZE)
    lo, hi = K.bounds(SPINE + [SLUG_HEAD], 0.6)
    parts.add("slug", slug_sdf, lo, hi, MID * 1.2, mat=slug_mats)
    parts.add("slug.head", lambda P: K.ellipsoid(P, MOUTH, (0.14, 0.05, 0.05)), MOUTH - V((0.2,) * 3), MOUTH + V((0.2,) * 3), FINE, mat=MOUTH_M)
    for s, pts in ANTENNAE.items():
        side = "antenna.L" if s > 0 else "antenna.R"
        lo, hi = K.bounds(pts, 0.08)
        parts.add(side, lambda P, p=pts: K.tapered_tube(P, p, (0.05, 0.04, 0.034)), lo, hi, FINE, mat=SLUG_M)
        eye = pts[-1] + V((0, 0, SEYE_R * 0.6))
        parts.add(side, lambda P, c=eye: K.ellipsoid(P, c, (SEYE_R, SEYE_R, SEYE_R)), eye - V((0.12,) * 3), eye + V((0.12,) * 3), FINE, mat=SEYE_M)
        pupil = eye + V((0, SEYE_R * 0.82, 0.005))
        parts.add(side, lambda P, c=pupil: K.ellipsoid(P, c, (0.036, 0.02, 0.04)), pupil - V((0.06,) * 3), pupil + V((0.06,) * 3), FINE, mat=PUPIL_M)
    for name, leg_at in LEGS.items():
        pts = leg_points(*leg_at)
        lo, hi = K.bounds(pts, 0.2)

        def leg(P, p=pts):
            d = K.tapered_tube(P, p, (0.12, 0.1, 0.085))
            return K.smin(d, K.ellipsoid(P, p[-1] + V((0, -0.05, -0.0)), (0.13, 0.17, 0.08)), 0.05)
        parts.add(name, leg, lo, hi, MID, mat=FOOT_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "slomo"
    obj["body_color"] = SKIN_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_prop(coll):
    """The slug he throws: a plain mesh (no rig), its head first (-Y), curled up a little."""
    parts = K.Parts()
    slug_parts(parts, V((0, 0, 0)), V((0, -1, 0)), "prop", scale=HAND_SIZE, mats=(0, 1, 2, 3, 4))
    obj = parts.mesh(PROP, coll, PROP_MATERIALS)
    for name, roughness in (("SlomoArmSlugBody", 0.3), ("SlomoArmSlugStripes", 0.35), ("SlomoArmSlugEyes", 0.2)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    K.decimate(obj, 1500)
    return obj


# --- rig / skin --------------------------------------------------------------------------------
CHAIN = ("slug.front", "slug.mid", "slug.head")
CHAIN_PTS = [SPINE[0], SPINE[1] + V((0, 0.2, 0)), SPINE[3] - V((0, 0.15, 0)), MOUTH]


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, -0.1, 0), None, False, up),
             ("blob", B0, B0 + V((0, 0, 0.6)), "root", False, fwd),
             ("body", B0, (0, 0, 1.2), "blob", True, fwd),
             ("top", (0, 0, 1.2), (0, 0, 2.4), "body", True, fwd),
             ("core", (0, -0.45, 0.4), (0, -0.45, 2.0), "blob", True, fwd)]
    for s, pts in STALKS.items():
        bones.append(("stalk.L" if s > 0 else "stalk.R", pts[0], pts[-1], "top", True, fwd))
    for s, pts in ARM_PTS.items():
        n = SIDE[s]
        for i in range(3):
            bones.append((f"arm.{n}.{i + 1}", pts[i], pts[i + 1], f"arm.{n}.{i}" if i else "blob", True, up))
        bones.append((f"hand.{n}", HANDS[s] - V((s * 0.35, 0, 0)), HANDS[s] + V((s * 0.35, 0, 0)), f"arm.{n}.3", True, up))
    bones.append(("slug", SLUG_PIVOT, SLUG_PIVOT + V((0, 0.6, 0)), "root", False, up))
    for i, name in enumerate(CHAIN):
        bones.append((name, CHAIN_PTS[i], CHAIN_PTS[i + 1], CHAIN[i - 1] if i else "slug", True, up))
    for s, pts in ANTENNAE.items():
        bones.append(("antenna.L" if s > 0 else "antenna.R", pts[0], pts[-1], "slug.head", True, (0, 1, 0)))
    for name, leg_at in LEGS.items():
        pts = leg_points(*leg_at)
        bones.append((name, pts[0], pts[1], "slug", True, fwd))
        bones.append((shin(name), pts[1], pts[2], name, True, fwd))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "slomo", "forward": "-Y", "attack_style": "throw",
                                              "normal_speed": OOZE_SPEED, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    col = names.index
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        Q = P[lo:hi]
        if kind == "body":   # the lower half squashes, the upper wobbles
            up = C.np_smoothstep(0.9, 1.6, Q[:, 2])
            WB = np.zeros((hi - lo, len(names)), np.float32)
            WB[:, col("body")] = 1 - up
            WB[:, col("top")] = up
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
        elif kind.startswith("arm."):   # along the arm, out of the body
            n, pts = kind[4:], ARM_PTS[o["side"]]
            _, along = C._polyline_closest(Q, pts)
            ends = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])
            WB = np.zeros((hi - lo, len(names)), np.float32)
            past = [C.np_smoothstep(e - 0.08, e + 0.08, along) for e in ends[1:3]]
            into = C.np_smoothstep(0.0, 0.18, along)
            WB[:, col("body")] = 1 - into
            WB[:, col(f"arm.{n}.1")] = into * (1 - past[0])
            WB[:, col(f"arm.{n}.2")] = into * (past[0] - past[1])
            WB[:, col(f"arm.{n}.3")] = into * past[1]
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
        elif kind == "slug":   # along its body
            _, along = C._polyline_closest(Q, CHAIN_PTS)
            ends = np.cumsum([0] + [(b - a).length for a, b in zip(CHAIN_PTS, CHAIN_PTS[1:])])
            past = [C.np_smoothstep(e - 0.12, e + 0.12, along) for e in ends[1:3]]
            WB = np.zeros((hi - lo, len(names)), np.float32)
            WB[:, col("slug.front")] = 1 - past[0]
            WB[:, col("slug.mid")] = past[0] - past[1]
            WB[:, col("slug.head")] = past[1]
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 6)
        elif kind.startswith("leg."):   # the thigh to the knee, the shin from it (and the foot)
            pts = leg_points(*LEGS[kind])
            _, along = C._polyline_closest(Q, pts)
            knee = C.np_smoothstep((pts[1] - pts[0]).length - 0.1, (pts[1] - pts[0]).length + 0.1, along)
            W[lo:hi, col(kind)] = 1 - knee
            W[lo:hi, col(shin(kind))] = knee
        else:
            W[lo:hi, col(kind)] = 1
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
    for name, roughness in (("SlomoSkin", 0.12), ("SlomoCore_glow", 0.3), ("SlomoStalk", 0.25), ("SlomoEyes", 0.2), ("SlomoPupils", 0.2),
                            ("SlomoSlug", 0.3), ("SlomoStripes", 0.35), ("SlomoFoot", 0.45), ("SlomoSlugEyes_glow", 0.2), ("SlomoMouth", 0.5)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    # (the preview shows the skin see-through as the game does)
    skin = bpy.data.materials["SlomoSkin"]
    skin.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.5
    skin.surface_render_method = "BLENDED"
    return scene, rig, obj


# --- motion ------------------------------------------------------------------------------------
# The shapes (`form`): where the blob is (`blob`: offset, size), the arms' size, where the slug is
# (`slug`: offset, turn about z, size). The rest moves within a shape: lift (the whole of it off the
# floor), pitch (the whole of it about `pivot`, rearing up), wide / tall (the blob's lower half),
# topwide / toptall / toplean (its upper half), lean (the blob forward), churn (the stuff inside
# turning), stalk / spread (the blob's eye stalks), armL / armR (each segment's turn, armature axes:
# (x, y, z) radians, from the shoulder out), slug pitch (`spitch`), bend / swell / flat (the slug's
# body, front to head), ant (its eye stalks), legs (each leg's swing, forward +) and splay (out +),
# sink (the slug lowered on its splayed legs).
FORMS = {
    1: {"blob": (V((0, 0, 0)), 1.0), "arms": 1.0, "slug": (V((0, 0, 0)), 0.0, HIDDEN)},
    2: {"blob": (V((0, -0.55, 0)), 0.85), "arms": HIDDEN, "slug": (V((0, 0, 0)), 0.0, 1.0)},
    3: {"blob": (V((0, -0.55, 0)), HIDDEN), "arms": HIDDEN, "slug": (V((0, -1.0, 0)), math.pi, 1.0)},
}
LEG_NAMES = tuple(LEGS)


def params(form, **kw):
    p = {"form": FORMS[form], "lift": 0.0, "pitch": 0.0, "pivot": V((0, 1.6, 0)), "wide": 1.0, "tall": 1.0, "topwide": 1.0, "toptall": 1.0,
         "toplean": 0.0, "lean": 0.0, "churn": 0.0, "corescale": 1.0, "stalk": [0.0, 0.0], "spread": [0.0, 0.0],
         "armL": [(0.0, 0.0, 0.0)] * 3, "armR": [(0.0, 0.0, 0.0)] * 3, "spitch": 0.0, "bend": [0.0] * 3, "swell": [1.0] * 3,
         "flat": 1.0, "ant": [0.0, 0.0], "legs": [0.0] * 6, "splay": [0.0] * 6, "sink": 0.0}
    p.update(kw)
    return p


def euler(r):
    return (Matrix.Rotation(r[2], 3, "Z") @ Matrix.Rotation(r[1], 3, "Y") @ Matrix.Rotation(r[0], 3, "X"))


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        poses, bases = {}, {}

        def put(name, delta):
            bases[name] = skel.set(name, poses, delta @ skel.rest[name])
        R = Matrix.Translation((0, 0, lift + p["lift"])) @ K.about(p["pivot"], Matrix.Rotation(p["pitch"], 3, "X"))
        put("root", R)
        # the blob, placed and sized for the shape, leaning
        (off, size), arms = p["form"]["blob"], p["form"]["arms"]
        Db = R @ Matrix.Translation(off) @ K.about(B0, Matrix.Rotation(p["lean"], 3, "X") @ Matrix.Diagonal((size,) * 3))
        put("blob", Db)
        bases["body"] = K.pose_local(skel, "body", poses, Matrix.Diagonal((p["wide"], p["tall"], p["wide"], 1)))
        bases["top"] = K.pose_local(skel, "top", poses, Matrix.Rotation(p["toplean"], 4, "X") @ Matrix.Diagonal((p["topwide"], p["toptall"], p["topwide"], 1)))
        c = p["corescale"]
        bases["core"] = K.pose_local(skel, "core", poses, Matrix.Rotation(p["churn"], 4, "Y") @ Matrix.Diagonal((c, c, c, 1)))
        for k, name in enumerate(("stalk.L", "stalk.R")):
            sgn = 1 if k == 0 else -1
            bases[name] = K.pose_local(skel, name, poses, Matrix.Rotation(p["stalk"][k], 4, "X") @ Matrix.Rotation(sgn * p["spread"][k], 4, "Y"))
        # the arms, segment by segment about their joints (armature axes)
        for s in (1, -1):
            n, pts, turns = SIDE[s], ARM_PTS[s], p["arm" + SIDE[s]]
            Da = Db
            for i in range(3):
                rot = euler(turns[i])
                if i == 0:
                    rot = rot @ Matrix.Diagonal((arms,) * 3)
                Da = Da @ K.about(pts[i], rot)
                put(f"arm.{n}.{i + 1}", Da)
            put(f"hand.{n}", Da)
        # the slug: placed (turned round, sized) for the shape, its body bending, its legs
        (soff, turn, ssize) = p["form"]["slug"]
        Ds = R @ Matrix.Translation(soff + V((0, 0, -p["sink"]))) @ K.about(SLUG_PIVOT, Matrix.Rotation(turn, 3, "Z") @ Matrix.Rotation(p["spitch"], 3, "X")
                                                                   @ Matrix.Diagonal((ssize,) * 3))
        put("slug", Ds)
        for i, name in enumerate(CHAIN):
            sw = p["swell"][i]
            bases[name] = K.pose_local(skel, name, poses, Matrix.Rotation(p["bend"][i], 4, "X") @ Matrix.Diagonal((sw, 1, sw * (p["flat"] if i < 2 else 1), 1)))
        for k, name in enumerate(("antenna.L", "antenna.R")):
            bases[name] = K.pose_local(skel, name, poses, Matrix.Rotation(p["ant"][k], 4, "X"))
        # each leg reaches for where a straight leg from its hip, swung and splayed so, would have its
        # foot (what the clips are made of: the feet that are down stay on the floor), fanned out
        # forward or back as it rests; its knee bending out and up as it does at rest
        for k, name in enumerate(LEG_NAMES):
            s, y, fan = LEGS[name]
            rot = Matrix.Rotation(-s * p["splay"][k], 3, "Y") @ Matrix.Rotation(-p["legs"][k], 3, "X")
            rest, straight = leg_points(s, y, fan), leg_points(s, y)
            foot = straight[0] + rot @ (straight[2] - straight[0]) + (rest[2] - straight[2])
            (thigh, shank), _ = IK.limb(rest, foot, rot @ (rest[1] - rest[0]))
            put(name, Ds @ thigh)
            put(shin(name), Ds @ shank)
        return bases
    return solve


def wave(t, period, phase=0.0):
    return math.sin(TAU * t / period + phase)


def leg_len():
    a, b = leg_points(1, 0)[0], leg_points(1, 0)[-1]
    return (a - b).length


def crouch(splay):
    """How far the slug sinks on legs splayed by `splay` (radians), its feet staying down."""
    return leg_len() * (1 - math.cos(splay))


# -- phase 1
def ooze(f):
    u = f / OOZE_FRAMES
    w = TAU * u
    squash = 0.5 + 0.5 * math.cos(2 * w)
    return params(1, wide=1 + 0.06 * squash, tall=1 - 0.06 * squash, topwide=1 + 0.03 * math.sin(2 * w + 0.8), toptall=1 - 0.03 * math.sin(2 * w + 0.8),
                  toplean=D(4) * math.sin(w + 0.6), lean=D(3) + D(2) * math.sin(2 * w), churn=TAU * u,
                  stalk=[D(8) * math.sin(w), D(8) * math.sin(w + 1.4)], spread=[D(5) * math.sin(2 * w), D(5) * math.sin(2 * w + 1)],
                  armL=[(0, D(10) * math.sin(w), D(8) * math.sin(w)), (0, D(-8) * math.sin(w + 0.7), 0), (0, D(-10) * math.sin(w + 1.4), D(6) * math.sin(w))],
                  armR=[(0, D(10) * math.sin(w + math.pi), D(8) * math.sin(w + math.pi)), (0, D(-8) * math.sin(w + math.pi + 0.7), 0),
                        (0, D(-10) * math.sin(w + math.pi + 1.4), D(6) * math.sin(w + math.pi))])


def arm_throw(side):
    """An arm wound up and back over the shoulder, then whipped forward (towards -Y), the slug
    leaving its end at the hit frame."""
    s = 1 if side == "L" else -1

    def fn(f):
        k, t = C.keyframes, f / FPS
        hit = ARM_HIT / FPS
        wind = k((0, 0), (0.55, 1), (hit - 0.12, 1.05), (hit, 0), (1.5, 0))(t)
        whip = k((0, 0), (hit - 0.12, 0), (hit, 1), (hit + 0.15, 1.05), (1.5, 0))(t)
        # (up and back: the shoulder lifts it, the elbow curls it; forward: it lashes out in front)
        # (about y lifts an arm along x (-s: up), about z swings it back (+s) or forward)
        turns = [(0.0, -s * (D(30) * wind - D(10) * whip), s * (D(35) * wind - D(55) * whip)),
                 (0.0, -s * D(30) * wind, s * (D(25) * wind - D(30) * whip)),
                 (0.0, -s * D(35) * wind, s * (D(20) * wind - D(25) * whip))]
        rest = [(0.0, 0.0, 0.0)] * 3
        lean = D(-6) * wind + D(10) * whip
        return params(1, wide=1 + 0.05 * whip, tall=1 - 0.05 * whip + 0.03 * wind, toplean=D(-6) * wind + D(8) * whip, lean=lean,
                      churn=TAU * t * 0.5, stalk=[D(-15) * wind + D(12) * whip, D(-15) * wind + D(12) * whip],
                      spread=[D(10) * wind, D(10) * wind], **{"arm" + side: turns, "arm" + ("R" if side == "L" else "L"): rest})
    return fn


def meteor_motion(t):
    k = C.keyframes
    hit = METEOR_HIT / FPS
    down = k((0, 0), (0.7, 1), (hit - 0.08, 1.1), (hit, 0), (1.8, 0))(t)
    up = k((0, 0), (hit - 0.1, 0), (hit, 1), (hit + 0.25, 0.8), (1.8, 0))(t)
    shake = math.sin(TAU * 11 * t) * C.smoothstep(0.4, 0.6, t) * (1 - C.smoothstep(hit - 0.1, hit, t))
    return down, up, shake


def meteor1(f):
    t = f / FPS
    down, up, shake = meteor_motion(t)
    raise_ = [(0.0, -D(40) * up + D(15) * down, D(8) * up), (0.0, -D(20) * up, 0.0), (0.0, -D(15) * up, 0.0)]
    raise_r = [(0.0, D(40) * up - D(15) * down, -D(8) * up), (0.0, D(20) * up, 0.0), (0.0, D(15) * up, 0.0)]
    return params(1, wide=1 + 0.16 * down - 0.1 * up + 0.02 * shake, tall=1 - 0.2 * down + 0.16 * up, topwide=1 + 0.06 * down - 0.08 * up,
                  toptall=1 - 0.08 * down + 0.22 * up, toplean=D(3) * shake, churn=TAU * t * (1 + down),
                  stalk=[D(25) * down - D(20) * up, D(25) * down - D(20) * up], spread=[D(18) * up, D(18) * up], armL=raise_, armR=raise_r)


# -- phase 2
# The legs walk in two tripods (1L, 2R, 3L and 1R, 2L, 3R), half a loop apart. A foot is down for the
# first half of its loop (stance): it sweeps back under the body at an even pace along the ground
# (the sine of its swing even in time, so the body rides over it without slipping); the second half
# it is lifted (splayed out further, `lift`) and swings forward again. In half a loop a foot goes
# 2 L sin(amp) back, so the body goes 4 L sin(amp) a loop: the gait's speed (gait_speed), what the
# game takes for the stride, so the feet stay put on the ground as he walks.
TRIPOD = (0, 1, 1, 0, 0, 1)
STRIDE_AMP, CRAWL_AMP, LIFT = D(24), D(20), D(26)


def tripod(u, amp):
    """A leg's swing (forward +) and lift at the share u of its loop."""
    u %= 1.0
    if u < 0.5:
        return math.asin(math.sin(amp) * (1 - 4 * u)), 0.0
    v = (u - 0.5) / 0.5
    return -amp + 2 * amp * (0.5 - 0.5 * math.cos(math.pi * v)), math.sin(math.pi * v)


def gait_speed(amp, frames):
    return 4 * leg_len() * math.sin(amp) / (frames / FPS)


def walk_legs(u, amp, back=1):
    """The six legs' swings and splays at the share u of a walking loop, and how far the body
    sinks so the feet that are down stay on the ground (lower the more they lean: L (1 - cos));
    back: -1 for the slug turned round (phase 3: its legs' forward is the world's backward)."""
    legs, splay = [], []
    for i in range(6):
        a, up = tripod(u + 0.5 * TRIPOD[i], amp)
        legs.append(back * a)
        splay.append(D(6) + LIFT * up)
    down = tripod(u, amp)[0] if u % 1.0 < 0.5 else tripod(u + 0.5, amp)[0]
    return legs, splay, crouch(D(6)) + leg_len() * (1 - math.cos(down))


def stride(f):
    u = f / STRIDE_FRAMES
    w = TAU * u
    legs, splay, sink = walk_legs(u, STRIDE_AMP)
    bob = 0.5 + 0.5 * math.cos(2 * w)   # (the blob squashing as a tripod sets down)
    return params(2, sink=sink, wide=1 + 0.04 * bob, tall=1 - 0.04 * bob, toplean=D(4) * math.sin(w), churn=TAU * u,
                  stalk=[D(8) * math.sin(w), D(8) * math.sin(w + 1.3)], spread=[D(4) * math.sin(2 * w)] * 2,
                  bend=[D(2) * math.sin(2 * w), D(-2) * math.sin(2 * w + 0.8), D(3) * math.sin(2 * w + 1.6)], swell=[1 + 0.03 * math.sin(2 * w - 1.2 * i) for i in range(3)],
                  ant=[D(10) * math.sin(w), D(10) * math.sin(w + 1.2)], legs=legs, splay=splay)


def jump(f):
    k, t = C.keyframes, f / FPS
    fr, hit, winded = JUMP_FROM / FPS, JUMP_HIT / FPS, JUMP_WINDED / FPS
    crouch_k = k((0, 0), (fr - 0.05, 1), (fr + 0.05, 0), (hit - 0.03, 0), (hit + 0.08, 1.15), (hit + 0.3, 0.85), (winded, 0.75), (3.0, 0))(t)
    air = k((0, 0), (fr, 0), (fr + 0.12, 1), (hit - 0.12, 1), (hit, 0))(t)
    land = k((0, 0), (hit - 0.02, 0), (hit + 0.06, 1), (hit + 0.4, 0.25), (3.0, 0))(t)
    pant = math.sin(TAU * 3 * t) * C.smoothstep(hit + 0.2, hit + 0.4, t) * (1 - C.smoothstep(winded - 0.1, winded, t))
    splay = D(42) * crouch_k
    tuck = D(30) * air
    return params(2, sink=crouch(splay) + 0.02 * pant, wide=1 + 0.14 * crouch_k + 0.25 * land - 0.06 * air + 0.03 * pant,
                  tall=1 - 0.16 * crouch_k - 0.28 * land + 0.14 * air - 0.03 * pant, toptall=1 + 0.08 * air - 0.12 * land,
                  topwide=1 + 0.08 * land, lean=D(-6) * crouch_k + D(5) * air, churn=TAU * t,
                  stalk=[D(25) * crouch_k - D(25) * air + D(30) * land, D(22) * crouch_k - D(28) * air + D(30) * land],
                  spread=[D(15) * air + D(20) * land] * 2, bend=[D(-6) * air, D(4) * land, D(10) * air - D(8) * land],
                  ant=[D(30) * land - D(20) * air, D(28) * land - D(22) * air],
                  legs=[tuck * (1 if i < 2 else -1 if i >= 4 else 0.3) for i in range(6)], splay=[splay + D(10) * air] * 6)


def flood_motion(t):
    k = C.keyframes
    hit = FLOOD_HIT / FPS
    rear = k((0, 0), (0.9, 1), (hit - 0.18, 1.08), (hit, 0), (2.4, 0))(t)
    slam = k((0, 0), (hit - 0.03, 0), (hit + 0.06, 1), (hit + 0.4, 0.2), (2.4, 0))(t)
    shake = math.sin(TAU * 9 * t) * C.smoothstep(0.5, 0.8, t) * (1 - C.smoothstep(hit - 0.2, hit, t))
    return rear, slam, shake


def flood2(f):
    t = f / FPS
    rear, slam, shake = flood_motion(t)
    return params(2, pitch=D(-24) * rear, pivot=V((0, 1.7, 0)), wide=1 - 0.05 * rear + 0.3 * slam, tall=1 + 0.1 * rear - 0.3 * slam,
                  toptall=1 + 0.06 * rear - 0.1 * slam, toplean=D(5) * shake, lean=D(-8) * rear + D(10) * slam, churn=TAU * t * 1.5,
                  stalk=[D(-25) * rear + D(30) * slam, D(-25) * rear + D(30) * slam], spread=[D(20) * rear] * 2,
                  bend=[D(8) * rear, D(-4) * rear, D(-8) * rear + D(6) * slam], ant=[D(-20) * rear + D(25) * slam] * 2,
                  legs=[D(30) * rear, D(30) * rear, D(5) * rear, D(5) * rear, D(-10) * rear, D(-10) * rear], splay=[D(8) + D(20) * slam] * 6,
                  sink=crouch(D(8) + D(20) * slam) - crouch(D(8)))


def meteor2(f):
    t = f / FPS
    down, up, shake = meteor_motion(t)
    splay = D(8) + D(28) * down
    return params(2, sink=crouch(splay), wide=1 + 0.14 * down - 0.1 * up + 0.02 * shake, tall=1 - 0.18 * down + 0.16 * up,
                  toptall=1 - 0.06 * down + 0.22 * up, topwide=1 + 0.05 * down - 0.08 * up, churn=TAU * t * (1 + down),
                  stalk=[D(25) * down - D(20) * up] * 2, spread=[D(18) * up] * 2, bend=[D(-5) * up, D(4) * down, D(10) * up],
                  ant=[D(-15) * up, D(-15) * up], splay=[splay] * 6)


# -- phase 3 (the slug turned round: its head in front)
def crawl(f):
    u = f / CRAWL_FRAMES
    w = TAU * u
    legs, splay, sink = walk_legs(u, CRAWL_AMP, back=-1)
    return params(3, sink=sink, bend=[D(2) * math.sin(2 * w), D(-2) * math.sin(2 * w + 0.8), D(3) * math.sin(2 * w + 1.6)],
                  swell=[1 + 0.04 * math.sin(2 * w - 1.2 * i) for i in range(3)], ant=[D(10) * math.sin(w), D(10) * math.sin(w + 1.3)],
                  legs=legs, splay=splay)


def spit(f):
    k, t = C.keyframes, f / FPS
    hit = SPIT_HIT / FPS
    rear = k((0, 0), (0.45, 1), (hit - 0.06, 1.1), (hit, 0), (1.1, 0))(t)
    lunge = k((0, 0), (hit - 0.06, 0), (hit, 1), (hit + 0.2, 1), (1.4, 0))(t)
    swell = k((0, 1), (0.5, 1.1), (hit - 0.04, 1.18), (hit + 0.05, 0.95), (1.2, 1), (1.4, 1))(t)
    # (the head is the chain's end: bending it up rears the front)
    return params(3, bend=[D(2) * rear, D(8) * rear - D(5) * lunge, D(18) * rear - D(10) * lunge], swell=[1, 1.04, swell],
                  ant=[D(-25) * rear + D(12) * lunge] * 2, legs=[D(-8) * rear] * 2 + [0, 0] + [D(6) * rear] * 2, splay=[D(6)] * 6)


def summon(f):
    k, t = C.keyframes, f / FPS
    hit = SUMMON_HIT / FPS
    heave = k((0, 0), (0.8, 1), (hit - 0.05, 1.2), (hit + 0.05, 0), (1.6, 0))(t)
    burst = k((0, 0), (hit - 0.03, 0), (hit + 0.05, 1), (hit + 0.35, 0.2), (1.6, 0))(t)
    shake = math.sin(TAU * 13 * t) * C.smoothstep(0.3, 0.5, t) * (1 - C.smoothstep(hit - 0.1, hit, t))
    return params(3, bend=[D(3) * shake, D(-10) * heave + D(6) * burst, D(8) * heave], swell=[1 + 0.08 * heave, 1 + 0.2 * heave - 0.1 * burst, 1 + 0.05 * heave],
                  ant=[D(30) * burst - D(10) * heave, D(30) * burst - D(10) * heave], splay=[D(6) + D(15) * burst] * 6,
                  sink=crouch(D(6) + D(15) * burst) - crouch(D(6)), legs=[D(4) * shake] * 6)


def meteor3(f):
    t = f / FPS
    down, up, shake = meteor_motion(t)
    return params(3, bend=[D(-4) * down + D(8) * up, D(-6) * down + D(14) * up, D(-10) * down + D(30) * up], swell=[1 + 0.06 * down, 1 + 0.1 * down, 1 + 0.12 * down - 0.05 * up],
                  ant=[D(20) * down - D(30) * up] * 2, splay=[D(6) + D(18) * down] * 6, sink=crouch(D(6) + D(18) * down) - crouch(D(6)),
                  legs=[D(3) * shake] * 6)


def flood3(f):
    t = f / FPS
    rear, slam, shake = flood_motion(t)
    return params(3, pitch=D(-22) * rear, pivot=V((0, 0.5, 0)), bend=[D(4) * rear, D(-4) * rear + D(4) * slam, D(-10) * rear + D(8) * slam],
                  swell=[1 + 0.1 * slam] * 3, flat=1 - 0.15 * slam, ant=[D(-25) * rear + D(30) * slam] * 2,
                  legs=[D(-10) * rear, D(-10) * rear, D(5) * rear, D(5) * rear, D(30) * rear, D(30) * rear],
                  splay=[D(6) + D(22) * slam] * 6, sink=crouch(D(6) + D(22) * slam) - crouch(D(6)))


def death(f):
    t = f / FPS
    shudder = math.sin(TAU * 11 * t) * (1 - C.smoothstep(0.3, 0.7, t))
    sag = C.smoothstep(0.4, 1.8, t)
    splay = D(6) + D(55) * sag
    return params(3, sink=crouch(splay), swell=[1 + 0.18 * sag] * 3, flat=1 - 0.35 * sag,
                  bend=[D(3) * shudder, D(-4) * sag, D(10) * sag], ant=[D(70) * sag, D(55) * sag],
                  legs=[D(10) * shudder] * 6, splay=[splay] * 6)


# --- points the game needs -----------------------------------------------------------------------
def bone_point(rig, action, frame, name, point):
    """Where the point (armature space, at rest) riding bone `name` is at that frame."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    local = rig.data.bones[name].matrix_local.inverted() @ point
    return rig.matrix_world @ (rig.pose.bones[name].matrix @ local)


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SlomoOoze", solver(rig, ooze), OOZE_FRAMES, cyclic=True, extras={"speed": OOZE_SPEED})
    hits = {}
    for side in ("L", "R"):
        a = K.ground_clip(rig, obj, f"SlomoArm{side}", solver(rig, arm_throw(side)), ARM_FRAMES,
                          extras={"attack_style": "throw", "hit_frame": ARM_HIT, "hit_time": ARM_HIT / FPS})
        a.pose_markers.new("Throw").frame = ARM_HIT
        hits[f"arm{side}"] = a
    for name, fn, form in (("SlomoMeteor", meteor1, 1), ("SlomoMeteorLegs", meteor2, 2), ("SlomoMeteorSlug", meteor3, 3)):
        a = K.ground_clip(rig, obj, name, solver(rig, fn), METEOR_FRAMES, extras={"attack_style": "cast", "hit_frame": METEOR_HIT, "hit_time": METEOR_HIT / FPS})
        a.pose_markers.new("Spit").frame = METEOR_HIT
        hits[name] = a
    K.ground_clip(rig, obj, "SlomoStride", solver(rig, stride), STRIDE_FRAMES, cyclic=True, extras={"speed": round(gait_speed(STRIDE_AMP, STRIDE_FRAMES), 3)})
    a = K.ground_clip(rig, obj, "SlomoJump", solver(rig, jump), JUMP_FRAMES,
                      extras={"attack_style": "jump", "ride_frame": JUMP_FROM, "hit_frame": JUMP_HIT, "hit_time": JUMP_HIT / FPS,
                              "winded_frame": JUMP_WINDED})
    a.pose_markers.new("Land").frame = JUMP_HIT
    for name, fn in (("SlomoFlood", flood2), ("SlomoFloodSlug", flood3)):
        a = K.ground_clip(rig, obj, name, solver(rig, fn), FLOOD_FRAMES, extras={"attack_style": "cast", "hit_frame": FLOOD_HIT, "hit_time": FLOOD_HIT / FPS})
        a.pose_markers.new("Slam").frame = FLOOD_HIT
    K.ground_clip(rig, obj, "SlomoCrawl", solver(rig, crawl), CRAWL_FRAMES, cyclic=True, extras={"speed": round(gait_speed(CRAWL_AMP, CRAWL_FRAMES), 3)})
    a = K.ground_clip(rig, obj, "SlomoSpit", solver(rig, spit), SPIT_FRAMES, extras={"attack_style": "spit", "hit_frame": SPIT_HIT, "hit_time": SPIT_HIT / FPS})
    a.pose_markers.new("Spit").frame = SPIT_HIT
    hits["spit"] = a
    a = K.ground_clip(rig, obj, "SlomoSummon", solver(rig, summon), SUMMON_FRAMES,
                      extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    a.pose_markers.new("Summon").frame = SUMMON_HIT
    hits["summon"] = a
    K.ground_clip(rig, obj, "SlomoDeath", solver(rig, death), DEATH_FRAMES, extras={"hold_last_frame": True, "hold_from": 2.0},
                  settle_from=round(1.8 * FPS))
    K.register(rig, CLIPS)
    out = {}
    for side, s in (("L", 1), ("R", -1)):
        a = hits[f"arm{side}"]
        a["muzzle"] = game(bone_point(rig, a.name, ARM_HIT, f"hand.{side}", HANDS[s]))
        out[f"arm{side}"] = list(a["muzzle"])
    for name in ("SlomoMeteor", "SlomoMeteorLegs", "SlomoMeteorSlug"):
        a = hits[name]
        bone, point = ("top", V((0, -0.1, 2.4))) if name != "SlomoMeteorSlug" else ("slug.head", MOUTH)
        a["muzzle"] = game(bone_point(rig, name, METEOR_HIT, bone, point))
        out[name] = list(a["muzzle"])
    a = hits["spit"]
    a["muzzle"] = game(bone_point(rig, "SlomoSpit", SPIT_HIT, "slug.head", MOUTH + V((0, 0.06, 0))))
    out["spit"] = list(a["muzzle"])
    a = hits["summon"]
    a["muzzle"] = game(bone_point(rig, "SlomoSummon", SUMMON_HIT, "slug.mid", V((0, 1.0, 2.0))))
    out["summon"] = list(a["muzzle"])
    return out


# --- previews ----------------------------------------------------------------------------------
def preview(scene, rig, path):
    far = (6.0, -7.5, 4.2)
    shots = [("SlomoOoze", 0, far), ("SlomoArmL", 18, (5.0, -8.0, 3.6)), ("SlomoMeteor", METEOR_HIT, far),
             ("SlomoStride", 8, (7.5, -4.5, 3.6)), ("SlomoJump", 40, far), ("SlomoFlood", 46, (7.5, -3.5, 3.0)),
             ("SlomoCrawl", 0, (6.5, -6.5, 3.6)), ("SlomoSpit", 18, (5.0, -7.5, 3.0)), ("SlomoSummon", SUMMON_HIT, far),
             ("SlomoMeteorSlug", 30, far), ("SlomoDeath", DEATH_FRAMES, far), ("SlomoOoze", 20, (-7.0, 5.0, 4.0))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 1.25), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    K.decimate(obj)
    muzzles = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SlomoDeath",))
    report["muzzles"] = muzzles
    K.setup_stage(scene, "Slomo", STAGE, (0, 0, 1.25), 5.4, camera=(6.0, -7.5, 4.2))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, OOZE_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Slomo", NAME, (0, 0, 1.25), 6)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Slomo:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "slomo.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "slomo.blend"),
         preview_path=args[2] if len(args) > 2 else None)
