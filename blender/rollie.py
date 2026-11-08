"""
Rollie: a big robot-creature on wheels, from a child's drawing (a big Spicy).

Two big wheels (a tyre, a hub and five spokes) are joined by a thick axle bar;
on the bar stands a rounded, barrel-shaped body with a grille of glowing
vertical slots down its front. Two wavy eye stalks rise from its top, each
ending in a big round eye (a pale sclera with a glowing iris) under an angry
slanted brow (the two make the drawing's "V"). Two long wavy arms come out of
its sides and end in glowing ball hands (the light-saber emitters). Faces -Y in
Blender, +Z up; one unit = one game cell, about 2.6 cells tall.

Rig: root; axle (the bar: the wheels and the body ride on it; it tips over in
the death); wheel.L/R (children of the axle; the game spins them about the
axle by the distance rolled, so the clips leave them still); body (pivots on
the axle like a turret: pitch, sway, yaw); grille (the glowing panel behind
the slots: it swells and pushes out in the summon); per side stalk1..3, eye
(scale = glow) and brow (both children of the stalk's tip), arm1..5 and hand
(scale = the hand's glow; the arm bones may also move apart along the chain:
the arms stretch in the swipe).

Clips, 30 fps, in place (the game supplies root motion and wheel spin):
    RollieRoll    32-frame loop: rolling along (extras.speed), the body leaning
                  into it, bobbing and swaying, the stalks wobbling, the arms
                  trailing and waving.
    RollieIdle    60-frame loop: standing, arms swaying, eyes looking about,
                  the brows twitching.
    RollieLaser   2.3 s: rolls back (the game moves it between extras.retreat_from
                  and retreat_to), brakes and braces, the eyes swell; the beam
                  shines from frame 30 (beam_frame) and bursts at 54 (hit_frame).
    RollieSabers  1.7 s: both arms swing back and fling forward; the hands throw
                  two spinning blades at frame 24 (extras.hands).
    RollieSweep   4.0 s: braces low, the eyes glow; a beam from frame 24 to 114.
    RollieGrid    1.8 s: raises both arms high and slams the hands down onto the
                  floor at frame 30 (extras.hands_mid).
    RollieSwipe   1.4 s: the body turns to one side with both arms out, then
                  sweeps round across its front, stretching the arms; they pass
                  the front at frame 21 (extras.reach).
    RollieSummon  1.6 s: leans forward, the grille swells and pushes out, and
                  something pops out of it at frame 30 (extras.muzzle).
    RollieDeath   2.4 s: shudders, tips over backwards onto its back, arms limp,
                  the eyes droop and dim. Held.
The points the game needs (game x, up, forward) are put on the clips' extras and printed.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, rollie; importlib.reload(creature); importlib.reload(rollie)
    rollie.main(export_path="<repo>/assets/rollie.glb", blend_path="<repo>/blender/rollie.blend")

Headless (a fourth path: a directory for the clips as videos, creature.clip_videos):
    Blender -b --python blender/rollie.py -- assets/rollie.glb blender/rollie.blend \
        blender/previews/rollie-preview.png
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

NAME, RIG_NAME = "Rollie", "RollieRig"
SCENE, COLLECTION, STAGE = "Rollie", "RollieAsset", "RollieStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
BUDGET = F.TRIANGLE_BUDGET.get(NAME, 10000)

BODY_HEX, ARMS_HEX, BROW_HEX = "#86e02c", "#5fb021", "#1c2612"
TIRE_HEX, HUB_HEX, SCLERA_HEX = "#26351b", "#4d7d24", "#f3f0dc"
EYE_HEX, GRILLE_HEX, HANDS_HEX = "#ff2414", "#d8ff3a", "#ff4a1c"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("RollieBody", BODY_HEX, 0), ("RollieArms", ARMS_HEX, 0), ("RollieBrow", BROW_HEX, 0),
             ("RollieTire", TIRE_HEX, 0), ("RollieHub", HUB_HEX, 0), ("RollieSclera", SCLERA_HEX, 0),
             ("RollieEyes_glow", EYE_HEX, 2.4), ("RollieGrille_glow", GRILLE_HEX, 1.8),
             ("RollieHands_glow", HANDS_HEX, 2.2))
BODY_M, ARMS_M, BROW_M, TIRE_M, HUB_M, SCLERA_M, EYES_M, GRILLE_M, HANDS_M = range(len(MATERIALS))
ROUGHNESS = {"RollieBody": 0.45, "RollieArms": 0.5, "RollieTire": 0.85, "RollieHub": 0.4,
             "RollieSclera": 0.3, "RollieEyes_glow": 0.25}

VOXEL, DETAIL = 0.012, 0.009
WALK_FRAMES, WALK_SPEED = 32, 0.8
IDLE_FRAMES = 60
LASER_FRAMES, LASER_BEAM, LASER_HIT = 69, 30, 54
RETREAT = (0.05, 0.8, 0.8)           # from, to (s), distance (cells): the game backs it off
SABERS_FRAMES, SABERS_HIT = 51, 24
SWEEP_FRAMES, SWEEP_BEAM, SWEEP_END, SWEEP_AT = 120, 24, 114, 60
GRID_FRAMES, GRID_HIT = 54, 30
SWIPE_FRAMES, SWIPE_HIT = 42, 21
SUMMON_FRAMES, SUMMON_HIT = 48, 30
DEATH_FRAMES = 72
CLIPS = {"RollieRoll": WALK_FRAMES, "RollieIdle": IDLE_FRAMES, "RollieLaser": LASER_FRAMES,
         "RollieSabers": SABERS_FRAMES, "RollieSweep": SWEEP_FRAMES, "RollieGrid": GRID_FRAMES,
         "RollieSwipe": SWIPE_FRAMES, "RollieSummon": SUMMON_FRAMES, "RollieDeath": DEATH_FRAMES}

# --- body plan -----------------------------------------------------------------
WHEEL_R, TIRE_R, TIRE_W = 0.42, 0.095, 1.35     # wheel (to the tyre's outside), tyre tube, its width factor
WHEEL_X = 0.75
AXLE_C = V((0, 0, WHEEL_R))
WHEELS = {s: V((sign * WHEEL_X, 0, WHEEL_R)) for s, sign in SIDES}
BAR_R, BAR_X = 0.085, 0.86

BODY_C, BODY_A, BODY_B, BODY_H = V((0, 0, 1.0)), 0.55, 0.40, 0.58
SLOTS_X, SLOT_Z, SLOT_W, SLOT_DEPTH = (-0.28, -0.14, 0.0, 0.14, 0.28), (0.74, 1.26), 0.034, 0.06

STALK_LEN, STALK_R0, STALK_R1 = 0.24, 0.062, 0.048
STALK_ANGLES = ((0.32, 0.04), (-0.18, 0.1), (0.3, -0.02))          # (out, forward) of each segment
STALK_ROOT = {s: V((sign * 0.2, -0.03, 1.5)) for s, sign in SIDES}
EYE_R, EYE_UP = 0.19, 0.15                                             # eye radius, centre above the stalk tip

ARM_LEN, ARM_R0, ARM_R1 = 0.32, 0.085, 0.062
ARM_ANGLES = ((0.15, -0.5), (0.25, 0.08), (0.3, -0.8), (0.32, -0.2), (0.35, -0.85))   # (az: forward, el: up)
ARM_ROOT = {s: V((sign * 0.47, -0.02, 1.12)) for s, sign in SIDES}
HAND_R, HAND_OUT = 0.155, 0.1                                          # ball radius, centre past the wrist


def stalk_dir(sign, out, fwd):
    return C.rot_y(sign * out) @ C.rot_x(fwd) @ V((0, 0, 1))


def arm_dir(sign, az, el):
    return V((sign * math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), math.sin(el)))


def chain(root, dirs, length, stretch=1.0):
    pts = [root.copy()]
    for d in dirs:
        pts.append(pts[-1] + d * (length * stretch))
    return pts


STALK_DIRS = {s: [stalk_dir(sign, *a) for a in STALK_ANGLES] for s, sign in SIDES}
STALK_J = {s: chain(STALK_ROOT[s], STALK_DIRS[s], STALK_LEN) for s, _ in SIDES}
EYES = {s: STALK_J[s][-1] + STALK_DIRS[s][-1] * EYE_UP for s, _ in SIDES}
ARM_DIRS = {s: [arm_dir(sign, *a) for a in ARM_ANGLES] for s, sign in SIDES}
ARM_J = {s: chain(ARM_ROOT[s], ARM_DIRS[s], ARM_LEN) for s, _ in SIDES}
HANDS = {s: ARM_J[s][-1] + ARM_DIRS[s][-1] * HAND_OUT for s, _ in SIDES}


def brow_line(s):
    """The angry brow over an eye: low and thick over the inside, rising to a point outside."""
    sign = 1 if s == "L" else -1
    e = EYES[s]
    return [e + V((-sign * 0.17, -0.12, 0.13)), e + V((-sign * 0.03, -0.1, 0.225)),
            e + V((sign * 0.11, -0.065, 0.29)), e + V((sign * 0.25, -0.02, 0.35))]


BROW_RADII = (0.068, 0.062, 0.048, 0.018)
BROW_C = {s: (brow_line(s)[1] + brow_line(s)[2]) / 2 for s, _ in SIDES}


def catmull(pts, n=6):
    """A smooth curve through the points (n per segment)."""
    ext = [pts[0] * 2 - pts[1]] + list(pts) + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n):
            u = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    out.append(pts[-1].copy())
    return out


# --- sculpture ---------------------------------------------------------------
def barrel_sdf(P):
    q = P - np.asarray(BODY_C, np.float32)
    qz = q[..., 2]
    bulge = 1 - 0.1 * (qz / BODY_H) ** 2
    radial = np.sqrt((q[..., 0] / BODY_A) ** 2 + (q[..., 1] / BODY_B) ** 2)
    return K.smax((radial - bulge) * BODY_B, np.abs(qz) - BODY_H, 0.22)


def slots_2d(P, grow=0.0):
    """Distance (in x, z) to the slots' rounded outlines."""
    d = None
    for x in SLOTS_X:
        dx = np.abs(P[..., 0] - x)
        dz = np.maximum(0, np.maximum(SLOT_Z[0] - P[..., 2], P[..., 2] - SLOT_Z[1]))
        e = np.sqrt(dx * dx + dz * dz) - (SLOT_W + grow)
        d = e if d is None else np.minimum(d, e)
    return d


def body_shape(P):
    d = barrel_sdf(P)
    for s, sign in SIDES:
        d = K.smin(d, F._sd_sphere(P, ARM_ROOT[s] + V((sign * 0.04, 0, 0)), 0.11), 0.05)    # shoulder sockets
        d = K.smin(d, K.round_cone(P, STALK_ROOT[s], STALK_ROOT[s] + V((0, 0, 0.09)), 0.085, 0.07), 0.05)   # stalk collars
    # a saddle where it sits on the bar
    return K.smin(d, K.round_cone(P, V((-0.3, 0, WHEEL_R + 0.02)), V((0.3, 0, WHEEL_R + 0.02)), 0.14, 0.14), 0.08)


def body_sdf(P):
    d = body_shape(P)
    cut = np.maximum(np.maximum(slots_2d(P), -barrel_sdf(P) - SLOT_DEPTH), P[..., 1])
    return K.smax(d, -cut, 0.008)


def grille_sdf(P):
    """A thin shell under the slots, just above their floor: what glows through them."""
    b = barrel_sdf(P) + SLOT_DEPTH - 0.014
    shell = np.abs(b + 0.02) - 0.02
    return np.maximum(np.maximum(shell, slots_2d(P, 0.006)), P[..., 1])


def front_y(x, z):
    """Where the barrel's front is at (x, z)."""
    lo, hi = -1.0, 0.0
    for _ in range(40):
        m = (lo + hi) / 2
        if barrel_sdf(np.array([[x, m, z]], np.float32))[0] > 0:
            lo = m
        else:
            hi = m
    return hi


GRILLE_C = V((0, front_y(0, 1.0) + 0.04, 1.0))
SUMMON_AT = V((0, front_y(0, SLOT_Z[0] + 0.02) - 0.02, SLOT_Z[0] + 0.02))


def bar_sdf(P):
    d = K.round_cone(P, V((-BAR_X, 0, WHEEL_R)), V((BAR_X, 0, WHEEL_R)), BAR_R, BAR_R)
    for s, sign in SIDES:      # caps on the ends
        d = K.smin(d, K.ellipsoid(P, V((sign * BAR_X, 0, WHEEL_R)), (0.05, 0.11, 0.11)), 0.03)
    return d


def tire_sdf(P, c):
    q = P - np.asarray(c, np.float32)
    ring = np.sqrt(q[..., 1] ** 2 + q[..., 2] ** 2) - (WHEEL_R - TIRE_R)
    return np.sqrt(ring ** 2 + (q[..., 0] / TIRE_W) ** 2) - TIRE_R


def hub_sdf(P, c):
    d = K.ellipsoid(P, c, (0.1, 0.13, 0.13))
    rim = WHEEL_R - TIRE_R * 1.3
    for k in range(5):
        a = TAU * k / 5 + 0.3
        tip = c + V((0, math.sin(a), math.cos(a))) * rim
        d = K.smin(d, K.round_cone(P, c, tip, 0.038, 0.028), 0.03)
    q = P - np.asarray(c, np.float32)
    inner = np.abs(np.sqrt(q[..., 1] ** 2 + q[..., 2] ** 2) - rim) - 0.025      # an inner rim
    return K.smin(d, np.maximum(inner, np.abs(q[..., 0]) - 0.05), 0.02)


def wheel_mats(centers, c):
    r = np.sqrt((centers[:, 1] - c[1]) ** 2 + (centers[:, 2] - c[2]) ** 2)
    return np.where(r > WHEEL_R - TIRE_R * 1.55, TIRE_M, HUB_M)


def tube(pts, r0, r1):
    curve = catmull(pts)
    return curve, [r0 + (r1 - r0) * v for v in np.linspace(0, 1, len(curve))]


def stalk_sdf(P, s):
    curve, radii = tube(STALK_J[s] + [EYES[s]], STALK_R0, STALK_R1)
    return K.tapered_tube(P, curve, radii)


def arm_sdf(P, s):
    pts = ARM_J[s]
    curve, radii = tube(pts, ARM_R0, ARM_R1)
    d = K.tapered_tube(P, curve, radii)
    w, dw = pts[-1], ARM_DIRS[s][-1]
    cuff = K.round_cone(P, w - dw * 0.05, w + dw * 0.0, ARM_R1 + 0.03, ARM_R1 + 0.035)   # a cuff at the wrist
    return K.smin(d, cuff, 0.02)


def eye_sdf(P, s):
    return F._sd_sphere(P, EYES[s], EYE_R)


def iris_sdf(P, s):
    c = EYES[s] + V((0, -(EYE_R - 0.04), 0.005))
    return K.ellipsoid(P, c, (0.105, 0.06, 0.105))


def brow_sdf(P, s):
    return K.tapered_tube(P, catmull(brow_line(s), 4), list(np.interp(np.linspace(0, 3, 13), range(4), BROW_RADII)))


def box(c, r):
    c, r = V(c), V((r,) * 3) if np.isscalar(r) else V(r)
    return c - r, c + r


def bounds_of(pts, pad):
    return K.bounds(pts, pad)


def build_mesh(coll):
    parts = K.Parts()
    parts.add("body", body_sdf, (-0.72, -0.5, 0.25), (0.72, 0.5, 1.68), VOXEL, mat=BODY_M)
    parts.add("grille", grille_sdf, (-0.4, -0.45, 0.65), (0.4, -0.1, 1.35), DETAIL * 0.8, mat=GRILLE_M)
    parts.add("axle", bar_sdf, (-BAR_X - 0.08, -0.14, WHEEL_R - 0.14), (BAR_X + 0.08, 0.14, WHEEL_R + 0.14), VOXEL, mat=HUB_M)
    for s, sign in SIDES:
        c = WHEELS[s]
        lo, hi = c - V((0.16, WHEEL_R + 0.03, WHEEL_R + 0.03)), c + V((0.16, WHEEL_R + 0.03, WHEEL_R + 0.03))
        both = lambda P, c=c: np.minimum(tire_sdf(P, c), hub_sdf(P, c))
        parts.add(f"wheel.{s}", both, lo, hi, VOXEL, mat=lambda q, c=c: wheel_mats(q, c))
        lo, hi = bounds_of(STALK_J[s] + [EYES[s]], 0.08)
        parts.add(f"stalk.{s}", lambda P, s=s: stalk_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        parts.add(f"eye.{s}", lambda P, s=s: eye_sdf(P, s), *box(EYES[s], EYE_R + 0.03), DETAIL * 0.8, mat=SCLERA_M)
        parts.add(f"eye.{s}", lambda P, s=s: iris_sdf(P, s), *box(EYES[s] + V((0, -EYE_R + 0.04, 0)), 0.14), 0.006, mat=EYES_M)
        lo, hi = bounds_of(brow_line(s), 0.08)
        parts.add(f"brow.{s}", lambda P, s=s: brow_sdf(P, s), lo, hi, 0.007, mat=BROW_M)
        lo, hi = bounds_of(ARM_J[s], 0.13)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=ARMS_M)
        parts.add(f"hand.{s}", lambda P, s=s: F._sd_sphere(P, HANDS[s], HAND_R), *box(HANDS[s], HAND_R + 0.03),
                  DETAIL * 0.8, mat=HANDS_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "rollie"
    obj["body_color"] = BODY_HEX
    obj["eye_color"] = EYE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("axle", AXLE_C, AXLE_C + V((0, 0, 0.25)), "root", True, fwd),
             ("body", AXLE_C, V((0, 0, 1.6)), "axle", True, fwd),
             ("grille", GRILLE_C, GRILLE_C + V((0, -0.15, 0)), "body", True, up)]
    for s, sign in SIDES:
        w = WHEELS[s]
        bones.append((f"wheel.{s}", w, w + V((sign * 0.15, 0, 0)), "axle", True, up))
        parent = "body"
        for i in range(3):
            a, b = STALK_J[s][i], STALK_J[s][i + 1]
            bones.append((f"stalk{i + 1}.{s}", a, b, parent, True, fwd))
            parent = f"stalk{i + 1}.{s}"
        e = EYES[s]
        bones.append((f"eye.{s}", e, e + V((0, -0.15, 0)), parent, True, up))
        bones.append((f"brow.{s}", BROW_C[s], BROW_C[s] + V((0, -0.1, 0)), parent, True, up))
        parent = "body"
        for i in range(5):
            a, b = ARM_J[s][i], ARM_J[s][i + 1]
            bones.append((f"arm{i + 1}.{s}", a, b, parent, True, up))
            parent = f"arm{i + 1}.{s}"
        w = ARM_J[s][-1]
        bones.append((f"hand.{s}", w, w + ARM_DIRS[s][-1] * 0.2, parent, True, up))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "rollie", "forward": "-Y", "attack_style": "laser", "normal_speed": WALK_SPEED,
        "wheel_radius": WHEEL_R, "eye_light": EYE_HEX, "eye_intensity": 2.4, "root_motion": False})


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def chain_weights(Q, joints, parent, names):
    """Smooth weights along a chain: all of a bone at its middle, shared with the next at the
    joints, the parent's at the root and the last bone's at the tip."""
    _, along = C._polyline_closest(Q, joints)
    A = arc(joints)
    centres = [0.0] + [(A[i] + A[i + 1]) / 2 for i in range(len(names))] + [A[-1]]
    owners = [parent] + list(names) + [names[-1]]
    out = {}
    for k, name in enumerate(owners):
        onehot = np.zeros(len(centres))
        onehot[k] = 1
        out[name] = out.get(name, 0) + np.interp(along, centres, onehot)
    return out


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        Q = P[lo:hi]
        part, _, s = kind.partition(".")
        if part == "stalk":
            shares = chain_weights(Q, STALK_J[s] + [EYES[s]], "body", [f"stalk{i + 1}.{s}" for i in range(3)])
        elif part == "arm":
            shares = chain_weights(Q, ARM_J[s], "body", [f"arm{i + 1}.{s}" for i in range(5)])
        else:
            W[lo:hi, names.index(kind)] = 1
            continue
        WB = np.zeros((len(Q), len(names)), np.float32)
        for name, value in shares.items():
            WB[:, names.index(name)] += value
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 3)
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
    for name, roughness in ROUGHNESS.items():
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
def params(**kw):
    p = {"t": 0.0,
         "apos": V(), "apitch": 0.0, "aroll": 0.0, "pivot": AXLE_C.copy(),   # the axle (and all on it)
         "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0,                   # the body on the axle
         "stalks": {s: [(0.0, 0.0)] * 3 for s, _ in SIDES},                   # (out, forward) offsets
         "look": {s: (0.0, 0.0) for s, _ in SIDES},                           # eye (turn, nod down)
         "glow": {s: 1.0 for s, _ in SIDES},
         "brow": {s: (0.0, 0.0) for s, _ in SIDES},                           # (angrier tilt, lift)
         "arms": {s: [(0.0, 0.0)] * 5 for s, _ in SIDES},                     # (forward, up) offsets
         "stretch": {s: 1.0 for s, _ in SIDES}, "hands": {s: 1.0 for s, _ in SIDES},
         "grille": (1.0, 0.0)}                                                # (scale, push out)
    p.update(kw)
    return p


def body_rot(p):
    return C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])


def frames_of(p, lift=0.0):
    """World matrices: the axle's delta and the body's delta."""
    L = Matrix.Translation((0, 0, lift))
    A = L @ Matrix.Translation(p["apos"]) @ K.about(p["pivot"], C.rot_x(p["apitch"]) @ C.rot_y(p["aroll"]))
    B = A @ Matrix.Translation(p["pos"]) @ K.about(AXLE_C, body_rot(p))
    return A, B


def arm_joints(p, s, B):
    sign = 1 if s == "L" else -1
    b3 = B.to_3x3()
    dirs = [b3 @ arm_dir(sign, az + daz, el + dl) for (az, el), (daz, dl) in zip(ARM_ANGLES, p["arms"][s])]
    return chain(B @ ARM_ROOT[s], dirs, ARM_LEN, p["stretch"][s]), dirs


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        poses, bases = {}, {}
        A, B = frames_of(p, lift)
        bases["root"] = skel.set("root", poses, Matrix.Translation((0, 0, lift)) @ skel.rest["root"])
        bases["axle"] = skel.set("axle", poses, A @ skel.rest["axle"])
        bases["body"] = skel.set("body", poses, B @ skel.rest["body"])
        b3 = B.to_3x3()
        gs, push = p["grille"]
        bases["grille"] = skel.set("grille", poses, B @ Matrix.Translation((0, -push, 0)) @ skel.rest["grille"]
                                   @ Matrix.Diagonal((gs, gs, gs, 1)))
        for s, sign in SIDES:
            bases[f"wheel.{s}"] = K.pose_local(skel, f"wheel.{s}", poses, Matrix.Identity(4))
            j = B @ STALK_ROOT[s]
            for i, ((out, fwd), (do, df)) in enumerate(zip(STALK_ANGLES, p["stalks"][s])):
                name = f"stalk{i + 1}.{s}"
                d = b3 @ stalk_dir(sign, out + do, fwd + df)
                bases[name] = K.aim_at(skel, name, poses, j, d)
                j = j + d * STALK_LEN
            tip = poses[f"stalk3.{s}"]
            centre = tip @ skel.rest[f"stalk3.{s}"].inverted() @ EYES[s]
            turn, nod = p["look"][s]
            R = (b3 @ C.rot_z(turn) @ C.rot_x(nod)).to_4x4()
            g = max(0.05, p["glow"][s])
            eye = Matrix.Translation(centre) @ R @ skel.rest_rot[f"eye.{s}"].to_4x4() @ Matrix.Diagonal((g, g, g, 1))
            bases[f"eye.{s}"] = skel.set(f"eye.{s}", poses, eye)
            tilt, rise = p["brow"][s]
            brow = (Matrix.Translation(centre + b3 @ V((0, 0, rise))) @ R @ C.rot_y(-sign * tilt).to_4x4()
                    @ Matrix.Translation(-EYES[s]) @ skel.rest[f"brow.{s}"])
            bases[f"brow.{s}"] = skel.set(f"brow.{s}", poses, brow)
            joints, dirs = arm_joints(p, s, B)
            for i in range(5):
                name = f"arm{i + 1}.{s}"
                bases[name] = K.aim_at(skel, name, poses, joints[i], dirs[i])
            K.aim_at(skel, f"hand.{s}", poses, joints[5], dirs[4])
            h = p["hands"][s]
            bases[f"hand.{s}"] = skel.set(f"hand.{s}", poses, poses[f"hand.{s}"] @ Matrix.Diagonal((h, h, h, 1)))
        return bases
    return solve


def k(*pts):
    return C.keyframes(*pts)


def bump(t, a, b):
    """0 .. 1 .. 0 over [a, b]."""
    return math.sin(math.pi * min(1, max(0, (t - a) / (b - a)))) ** 2


def wave(t, period, amp, lag=0.9, phase=0.0, n=5, twice=1):
    """A wave running out along a chain: one angle a segment."""
    return [amp * math.sin(TAU * twice * t / period - lag * i + phase) for i in range(n)]


def pose_keys(t, keys, rest):
    """Offsets from `rest` (a list of angle pairs) interpolated through keys (time, absolute pairs
    or None = rest), smoothstep from one to the next."""
    keys = [(tk, rest if v is None else v) for tk, v in keys]
    if t <= keys[0][0]:
        cur = keys[0][1]
    elif t >= keys[-1][0]:
        cur = keys[-1][1]
    else:
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t <= t1:
                u = C.smoothstep(t0, t1, t)
                cur = [(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u) for (x0, y0), (x1, y1) in zip(a, b)]
                break
    return [(a - ra, e - re) for (a, e), (ra, re) in zip(cur, rest)]


def add(pairs, daz=None, del_=None):
    daz = daz or [0] * len(pairs)
    del_ = del_ or [0] * len(pairs)
    return [(a + x, e + y) for (a, e), x, y in zip(pairs, daz, del_)]


def flat(az, el, n=5, bend=0.0):
    """An arm pointing (az, el), straight or with a bend wave along it."""
    return [(az, el + bend * math.sin(1.9 * i)) for i in range(n)]


def roll(f):
    t = f / FPS
    T = WALK_FRAMES / FPS
    w = TAU * t / T
    stalks = {s: [(D(5) * math.sin(w - 0.8 - 0.5 * i + ph), D(-7) + D(4) * math.sin(2 * w - 1.0 - 0.5 * i))
                  for i in range(3)] for (s, _), ph in zip(SIDES, (0, 0.6))}
    arms = {}
    for (s, _), ph in zip(SIDES, (0, math.pi)):
        trail = [(-0.35 - 0.08 * i, 0.12 + 0.02 * i) for i in range(5)]
        arms[s] = add(trail, wave(t, T, D(6), 0.8, ph + 1), wave(t, T, D(12), 0.9, ph))
    return params(t=t, pos=V((0.012 * math.sin(w), 0, -0.004 + 0.012 * math.cos(2 * w))), pitch=D(5) + D(1.5) * math.sin(2 * w),
                  roll=D(3) * math.sin(w), yaw=D(2.5) * math.sin(w + 0.5), stalks=stalks, arms=arms,
                  look={s: (D(5) * math.sin(w), 0) for s, _ in SIDES},
                  brow={s: (D(3) * math.sin(2 * w), 0) for s, _ in SIDES})


def idle(f):
    t = f / FPS
    T = IDLE_FRAMES / FPS
    w = TAU * t / T
    twitch = bump(t, 1.15, 1.45)
    stalks = {s: [(D(4) * math.sin(w + 0.6 * i + ph), D(3) * math.sin(2 * w + 0.5 * i + ph)) for i in range(3)]
              for (s, _), ph in zip(SIDES, (0, 1.3))}
    arms = {s: add([(0, 0)] * 5, wave(t, T, D(7), 0.7, ph + 1), wave(t, T, D(9), 0.9, ph, twice=2))
            for (s, _), ph in zip(SIDES, (0, math.pi))}
    look = (D(16) * math.sin(w) + D(4) * math.sin(3 * w), D(4) * math.sin(2 * w + 0.5))
    return params(t=t, pos=V((0, 0, 0.008 * math.sin(2 * w))), pitch=D(1.5) * math.sin(w), roll=D(1.5) * math.sin(w + 1),
                  yaw=D(4) * math.sin(w), stalks=stalks, arms=arms,
                  look={s: look for s, _ in SIDES}, glow={s: 1 + 0.03 * math.sin(2 * w) for s, _ in SIDES},
                  brow={s: (D(12) * twitch, -0.02 * twitch) for s, _ in SIDES},
                  hands={s: 1 + 0.05 * math.sin(2 * w + ph) for (s, _), ph in zip(SIDES, (0, 2))})


def laser(f):
    t = f / FPS
    fire, hit, end = LASER_BEAM / FPS, LASER_HIT / FPS, LASER_FRAMES / FPS
    r0, r1, _ = RETREAT
    u = C.smoothstep(r0, r1, t)
    env = math.sin(math.pi * min(1, max(0, (t - r0) / (r1 - r0)))) ** 0.7
    beam = 1 if fire <= t < hit else 0
    tremble = beam * math.sin(TAU * 13 * t)
    after = t - hit
    jolt = math.exp(-6 * after) * math.sin(TAU * 2 * after) if after > 0 else 0
    sway = math.sin(TAU * 2 * u)
    pitch = D(k((0, 0), (0.2, 9), (0.6, 7), (0.85, -7), (0.97, 3), (fire, 2), (hit, 3), (hit + 0.1, -9), (end, 0))(t)) - D(3) * jolt
    pos = V((0.02 * sway * env, 0, k((0, 0), (0.3, -0.01), (0.8, -0.04), (hit, -0.045), (hit + 0.12, 0.0), (end, 0))(t)))
    stalks = {s: [(D(4) * sway * env + D(1.5) * tremble, D(k((0, 0), (0.25, 10), (0.75, 4), (0.9, -8), (fire, 0), (hit, 0),
                                                              (hit + 0.1, -14), (hit + 0.3, 5), (end, 0))(t)) * (0.6 + 0.3 * i))
                  for i in range(3)] for s, _ in SIDES}
    brace = [(-0.05, -0.15)] * 5
    arms = {}
    for (s, _), ph in zip(SIDES, (0, math.pi)):
        a = pose_keys(t, [(0, None), (0.35, add(ARM_ANGLES, [-0.25] * 5, [0.3] * 5)), (0.8, add(ARM_ANGLES, [-0.15] * 5, [0.2] * 5)),
                          (fire, add(ARM_ANGLES, *zip(*brace))), (hit, add(ARM_ANGLES, *zip(*brace))),
                          (hit + 0.12, add(ARM_ANGLES, [-0.3] * 5, [0.35] * 5)), (end, None)], ARM_ANGLES)
        flail = wave(t, 0.75, D(12) * env, 0.9, ph)
        arms[s] = add(a, None, [x + D(2) * tremble for x in flail])
    glow = k((0, 1), (0.8, 1), (fire, 1.3), (hit - 0.05, 1.36), (hit, 1.45), (hit + 0.15, 0.92), (end, 1))(t) + 0.04 * beam * math.sin(TAU * 17 * t)
    brow = (D(k((0, 0), (0.7, 0), (fire, 14), (hit, 16), (hit + 0.2, 4), (end, 0))(t)),
            k((0, 0), (fire, -0.025), (hit, -0.03), (hit + 0.2, 0.01), (end, 0))(t))
    return params(t=t, pos=pos, pitch=pitch, roll=D(6) * sway * env + D(1.2) * tremble, yaw=D(4) * math.sin(TAU * 2 * u + 0.9) * env,
                  stalks=stalks, arms=arms, look={s: (0, D(k((0, 0), (0.8, 0), (fire, 4), (hit, 4), (end, 0))(t))) for s, _ in SIDES},
                  glow={s: glow for s, _ in SIDES}, brow={s: brow for s, _ in SIDES})


def sabers(f):
    t = f / FPS
    hit, end = SABERS_HIT / FPS, SABERS_FRAMES / FPS
    back = {s: flat(-0.9, 0.55, bend=0.25) for s, _ in SIDES}
    fling = {s: flat(1.05, 0.12, bend=0.1) for s, _ in SIDES}
    follow = {s: flat(1.25, -0.45, bend=0.2) for s, _ in SIDES}
    arms = {}
    for (s, _), ph in zip(SIDES, (0, math.pi)):
        a = pose_keys(t, [(0, None), (0.45, back[s]), (hit, fling[s]), (hit + 0.2, follow[s]), (end, None)], ARM_ANGLES)
        whip = [D(14) * math.sin(math.pi * C.smoothstep(0.45, hit + 0.25, t)) * math.sin(-0.9 * i - 0.5) for i in range(5)]
        arms[s] = add(a, None, whip)
    stretch = k((0, 1), (0.45, 1), (hit, 1.15), (hit + 0.25, 1.05), (end, 1))(t)
    hands = k((0, 1), (0.45, 1.2), (hit - 0.05, 1.4), (hit + 0.05, 0.75), (1.3, 1), (end, 1))(t)
    stalks = [(0, D(k((0, 0), (0.45, -10), (hit, 12), (hit + 0.25, -6), (end, 0))(t)) * (0.5 + 0.4 * i)) for i in range(3)]
    return params(t=t, pitch=D(k((0, 0), (0.45, -9), (hit, 11), (hit + 0.25, 7), (end, 0))(t)),
                  pos=V((0, k((0, 0), (0.45, 0.04), (hit, -0.06), (end, 0))(t), k((0, 0), (0.45, 0.01), (hit, -0.03), (end, 0))(t))),
                  stalks={s: stalks for s, _ in SIDES}, arms=arms, stretch={s: stretch for s, _ in SIDES},
                  hands={s: hands for s, _ in SIDES},
                  brow={s: (D(k((0, 0), (0.45, 10), (hit, 16), (end, 0))(t)), 0) for s, _ in SIDES},
                  glow={s: k((0, 1), (hit, 1.15), (end, 1))(t) for s, _ in SIDES})


def sweep(f):
    t = f / FPS
    on, off, end = SWEEP_BEAM / FPS, SWEEP_END / FPS, SWEEP_FRAMES / FPS
    hold = k((0, 0), (0.6, 1), (off, 1), (end, 0))(t)
    beam = 1 if on <= t < off else 0
    shudder = beam * (math.sin(TAU * 11 * t) + 0.5 * math.sin(TAU * 17 * t + 1))
    brace = {s: [(-0.1, -0.55 + 0.25 * math.sin(1.7 * i)) for i in range(5)] for s, _ in SIDES}
    arms = {}
    for (s, _), ph in zip(SIDES, (0, math.pi)):
        a = pose_keys(t, [(0, None), (0.6, brace[s]), (off, brace[s]), (end, None)], ARM_ANGLES)
        arms[s] = add(a, wave(t, 2.0, D(6) * hold, 0.7, ph), [x + D(1.5) * shudder for x in wave(t, 1.0, D(7) * hold, 0.9, ph)])
    glow = k((0, 1), (0.3, 1.05), (on, 1.32), (off, 1.32), (end, 1))(t) + 0.05 * beam * math.sin(TAU * 7 * t)
    return params(t=t, pos=V((0.004 * shudder, 0, -0.06 * hold + 0.003 * shudder)), pitch=D(5) * hold + D(0.6) * shudder,
                  roll=D(0.8) * shudder, stalks={s: [(D(1.5) * shudder * (-1) ** i, D(-3) * hold) for i in range(3)] for s, _ in SIDES},
                  arms=arms, look={s: (D(0.6) * shudder, D(3) * hold) for s, _ in SIDES}, glow={s: glow for s, _ in SIDES},
                  brow={s: (D(15) * hold, -0.025 * hold) for s, _ in SIDES},
                  hands={s: 1 + 0.15 * hold for s, _ in SIDES})


def reach_floor(p, s, weight, floor=0.006):
    """Bend the arm's elevations so its hand comes down to the floor (by `weight`), and never
    below it."""
    _, B = frames_of(p)

    def bottom(delta):
        q = dict(p, arms=dict(p["arms"]))
        q["arms"][s] = add(p["arms"][s], None, [delta * (0.4 + 0.15 * i) for i in range(5)])
        joints, dirs = arm_joints(q, s, B)
        h = p["hands"][s]
        return (joints[-1] + dirs[-1] * (HAND_OUT * h)).z - HAND_R * h, q["arms"][s]

    z0, _ = bottom(0)
    target = max(floor, z0 + weight * (floor - z0))
    if abs(target - z0) < 1e-4:
        return
    lo, hi = -1.5, 1.5
    for _ in range(40):
        m = (lo + hi) / 2
        if bottom(m)[0] < target:
            lo = m
        else:
            hi = m
    p["arms"][s] = bottom((lo + hi) / 2)[1]


def grid(f):
    t = f / FPS
    hit, end = GRID_HIT / FPS, GRID_FRAMES / FPS
    high = {s: flat(0.6, 1.15, bend=0.3) for s, _ in SIDES}
    slam = {s: flat(1.15, -0.55, bend=0.12) for s, _ in SIDES}
    arms = {}
    for s, _ in SIDES:
        arms[s] = pose_keys(t, [(0, None), (0.55, high[s]), (0.7, high[s]), (hit, slam[s]), (hit + 0.2, slam[s]), (end, None)], ARM_ANGLES)
        arms[s] = add(arms[s], None, [D(10) * math.sin(TAU * t / 0.55 - 0.9 * i) * bump(t, 0.0, 0.75) for i in range(5)])
    hands = k((0, 1), (0.55, 1.3), (hit - 0.03, 1.45), (hit, 1.5), (hit + 0.15, 1.1), (end, 1))(t)
    p = params(t=t, pitch=D(k((0, 0), (0.55, -10), (0.7, -11), (hit, 14), (hit + 0.08, 12), (hit + 0.3, 10), (end, 0))(t)),
               pos=V((0, 0, k((0, 0), (0.55, 0.02), (hit, -0.05), (hit + 0.1, -0.035), (end, 0))(t))),
               stalks={s: [(0, D(k((0, 0), (0.55, -10), (hit, 14), (hit + 0.12, -6), (end, 0))(t)) * (0.5 + 0.4 * i)) for i in range(3)] for s, _ in SIDES},
               arms=arms, hands={s: hands for s, _ in SIDES},
               look={s: (0, D(k((0, 0), (0.55, -5), (hit, 10), (end, 0))(t))) for s, _ in SIDES},
               brow={s: (D(k((0, 0), (0.55, 8), (hit, 18), (end, 0))(t)), 0) for s, _ in SIDES},
               glow={s: k((0, 1), (hit, 1.2), (end, 1))(t) for s, _ in SIDES})
    contact = k((0, 0), (hit - 0.12, 0), (hit, 1), (hit + 0.2, 1), (hit + 0.45, 0), (end, 0))(t)
    for s, _ in SIDES:
        reach_floor(p, s, contact)
    return p


def swipe(f):
    t = f / FPS
    hit, end = SWIPE_HIT / FPS, SWIPE_FRAMES / FPS
    yaw = D(k((0, 0), (0.42, 65), (hit, 0), (0.95, -70), (1.1, -65), (end, 0))(t))
    out = {s: flat(0.75, -0.08, bend=0.05) for s, _ in SIDES}
    arms = {}
    for (s, sign), ph in zip(SIDES, (0, math.pi)):
        a = pose_keys(t, [(0, None), (0.38, out[s]), (0.95, out[s]), (end, None)], ARM_ANGLES)
        # they drag behind the turn, then whip past it: the turn's speed bends them
        drag = sign * D(k((0, 0), (0.42, 8), (0.5, 22), (hit, 10), (0.85, -18), (1.0, 0), (end, 0))(t))
        arms[s] = add(a, [drag * (0.6 + 0.2 * i) for i in range(5)], wave(t, 0.7, D(6) * bump(t, 0, end), 0.8, ph))
    stretch = k((0, 1), (0.42, 1.05), (hit, 1.42), (0.92, 1.25), (end, 1))(t)
    return params(t=t, yaw=yaw, pitch=D(k((0, 0), (0.42, -4), (hit, 7), (end, 0))(t)), roll=D(k((0, 0), (0.42, -5), (hit, 3), (0.95, 5), (end, 0))(t)),
                  pos=V((0, 0, k((0, 0), (0.42, 0.01), (hit, -0.03), (end, 0))(t))),
                  arms=arms, stretch={s: stretch for s, _ in SIDES},
                  stalks={s: [(D(k((0, 0), (0.42, -8), (hit, 10), (0.95, 6), (end, 0))(t)) * (0.5 + 0.3 * i), 0) for i in range(3)] for s, _ in SIDES},
                  look={s: (-yaw * 0.3, 0) for s, _ in SIDES},
                  brow={s: (D(k((0, 0), (0.42, 12), (hit, 16), (end, 0))(t)), 0) for s, _ in SIDES},
                  hands={s: k((0, 1), (hit, 1.2), (end, 1))(t) for s, _ in SIDES})


def summon(f):
    t = f / FPS
    hit, end = SUMMON_HIT / FPS, SUMMON_FRAMES / FPS
    lean = k((0, 0), (0.6, 1), (0.9, 1.05), (hit, 0.6), (hit + 0.15, 0.9), (end, 0))(t)
    wide = {s: [(-0.15 + 0.1 * i, 0.15 + 0.25 * math.sin(1.8 * i)) for i in range(5)] for s, _ in SIDES}
    arms = {}
    for (s, _), ph in zip(SIDES, (0, math.pi)):
        a = pose_keys(t, [(0, None), (0.6, wide[s]), (hit + 0.15, wide[s]), (end, None)], ARM_ANGLES)
        arms[s] = add(a, None, wave(t, 0.8, D(10) * bump(t, 0, end), 0.9, ph))
    scale = k((0, 1), (0.5, 1.02), (0.9, 1.04), (hit, 1.07), (hit + 0.15, 1.02), (end, 1))(t)
    push = k((0, 0), (0.5, 0.02), (0.9, 0.05), (hit, 0.085), (hit + 0.2, 0.03), (end, 0))(t)
    return params(t=t, pitch=D(14) * lean - D(5) * bump(t, hit, hit + 0.3), pos=V((0, -0.03 * lean, -0.02 * lean)),
                  stalks={s: [(0, D(-6) * lean * (0.5 + 0.4 * i)) for i in range(3)] for s, _ in SIDES},
                  arms=arms, look={s: (0, D(18) * lean) for s, _ in SIDES},
                  brow={s: (D(8) * lean, 0) for s, _ in SIDES}, grille=(scale, push),
                  glow={s: 1 + 0.1 * lean for s, _ in SIDES})


def death(f):
    t = f / FPS
    shudder = math.sin(TAU * 9 * t) * (1 - C.smoothstep(0.15, 0.55, t))
    fall = k((0, 0), (0.4, 0.04), (1.0, 1), (1.12, 0.93), (1.3, 1))(t)
    limp = C.smoothstep(0.5, 1.5, t)
    # on its back the body's back is the floor's way: the arms sag onto it, then lie along it
    # (it lies tilted onto its left: the right arm sags further)
    sag = {"L": (-0.3, 0.0, 0.25, 0.3, 0.3), "R": (-1.1, -0.9, -0.5, -0.25, -0.05)}
    flop = {s: [(a, -0.1 + 0.18 * math.sin(2.1 * i + sign)) for i, a in enumerate(sag[s])] for s, sign in SIDES}
    arms = {}
    for s, _ in SIDES:
        a = pose_keys(t, [(0, None), (0.4, add(ARM_ANGLES, None, [0.5] * 5)), (1.0, add(ARM_ANGLES, None, [0.2] * 5)),
                          (1.5, flop[s])], ARM_ANGLES)
        arms[s] = add(a, None, [D(6) * shudder * (-1) ** i for i in range(5)])
    stalks = {s: [(D(8) * shudder * (-1) ** i + D(22) * limp * (0.4 + 0.3 * i), D(-30) * limp * (0.4 + 0.3 * i)) for i in range(3)]
              for s, _ in SIDES}
    glow = k((0, 1), (0.3, 1.15), (0.6, 0.9), (1.6, 0.62))(t)
    return params(t=t, apitch=-D(84) * fall - D(5) * C.smoothstep(0, 0.4, t) * (1 - fall), aroll=D(10) * fall + D(2) * shudder,
                  pitch=D(-4) * fall, roll=D(3) * shudder, yaw=D(12) * limp,
                  stalks=stalks, arms=arms, look={s: (D(-25) * sign * limp, D(40) * limp) for s, sign in SIDES},
                  glow={s: glow for s, _ in SIDES}, brow={s: (D(-10) * limp, -0.03 * limp) for s, _ in SIDES},
                  hands={s: k((0, 1), (0.5, 1), (1.6, 0.7))(t) for s, _ in SIDES})


# --- what the game reads off it --------------------------------------------
def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def bone_point(rig, clip, frame, bone, rest_point):
    """Where a point of a bone (given at rest, armature space) is at a frame of a clip."""
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ rig.data.bones[bone].matrix_local.inverted() @ rest_point


def eyes_at(rig, clip, frame):
    """The fronts of both irises and their midpoint (the beams' muzzle)."""
    fronts = [bone_point(rig, clip, frame, f"eye.{s}", EYES[s] + V((0, -EYE_R - 0.01, 0))) for s, _ in SIDES]
    return (fronts[0] + fronts[1]) / 2, fronts


def hands_at(rig, clip, frame):
    return [bone_point(rig, clip, frame, f"hand.{s}", HANDS[s]) for s, _ in SIDES]


def points(rig):
    out = {}
    m, fronts = eyes_at(rig, "RollieLaser", LASER_HIT)
    act = bpy.data.actions["RollieLaser"]
    act["muzzle"], act["eyes"] = out["laser_muzzle"], out["laser_eyes"] = game(m), [game(v) for v in fronts]
    m, fronts = eyes_at(rig, "RollieSweep", SWEEP_AT)
    act = bpy.data.actions["RollieSweep"]
    act["muzzle"], act["eyes"] = out["sweep_muzzle"], out["sweep_eyes"] = game(m), [game(v) for v in fronts]
    hands = hands_at(rig, "RollieSabers", SABERS_HIT)
    bpy.data.actions["RollieSabers"]["hands"] = out["saber_hands"] = [game(v) for v in hands]
    hands = hands_at(rig, "RollieGrid", GRID_HIT)
    mid = (hands[0] + hands[1]) / 2
    bpy.data.actions["RollieGrid"]["hands_mid"] = out["grid_mid"] = game(mid)
    out["grid_hands"] = [game(v) for v in hands]
    out["grid_hand_bottom"] = round(min(v.z for v in hands) - HAND_R * 1.5, 3)
    hands = hands_at(rig, "RollieSwipe", SWIPE_HIT)
    reach = max(V((v.x, v.y)).length for v in hands) + HAND_R
    bpy.data.actions["RollieSwipe"]["reach"] = out["swipe_reach"] = round(reach, 3)
    out["swipe_hands"] = [game(v) for v in hands]
    p = bone_point(rig, "RollieSummon", SUMMON_HIT, "grille", SUMMON_AT)
    bpy.data.actions["RollieSummon"]["muzzle"] = out["summon_point"] = game(p)
    rig.animation_data.action = None
    return out


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "RollieRoll", solver(rig, roll), WALK_FRAMES, cyclic=True,
                  extras={"speed": WALK_SPEED, "wheel_radius": WHEEL_R})
    K.ground_clip(rig, obj, "RollieIdle", solver(rig, idle), IDLE_FRAMES, cyclic=True)
    r0, r1, dist = RETREAT
    act = K.ground_clip(rig, obj, "RollieLaser", solver(rig, laser), LASER_FRAMES,
                        extras={"attack_style": "laser", "hit_frame": LASER_HIT, "hit_time": LASER_HIT / FPS,
                                "beam_frame": LASER_BEAM, "retreat_from": r0, "retreat_to": r1, "retreat": dist})
    act.pose_markers.new("Beam").frame = LASER_BEAM
    act.pose_markers.new("Burst").frame = LASER_HIT
    act = K.ground_clip(rig, obj, "RollieSabers", solver(rig, sabers), SABERS_FRAMES,
                        extras={"attack_style": "sabers", "hit_frame": SABERS_HIT, "hit_time": SABERS_HIT / FPS})
    act.pose_markers.new("Throw").frame = SABERS_HIT
    act = K.ground_clip(rig, obj, "RollieSweep", solver(rig, sweep), SWEEP_FRAMES,
                        extras={"attack_style": "sweep", "hit_frame": SWEEP_BEAM, "hit_time": SWEEP_BEAM / FPS,
                                "beam_frame": SWEEP_BEAM, "beam_end_frame": SWEEP_END,
                                "beam_from": SWEEP_BEAM / FPS, "beam_to": SWEEP_END / FPS})
    act.pose_markers.new("Beam").frame = SWEEP_BEAM
    act.pose_markers.new("BeamEnd").frame = SWEEP_END
    act = K.ground_clip(rig, obj, "RollieGrid", solver(rig, grid), GRID_FRAMES,
                        extras={"attack_style": "grid", "hit_frame": GRID_HIT, "hit_time": GRID_HIT / FPS})
    act.pose_markers.new("Slam").frame = GRID_HIT
    act = K.ground_clip(rig, obj, "RollieSwipe", solver(rig, swipe), SWIPE_FRAMES,
                        extras={"attack_style": "swipe", "hit_frame": SWIPE_HIT, "hit_time": SWIPE_HIT / FPS})
    act.pose_markers.new("Sweep").frame = SWIPE_HIT
    act = K.ground_clip(rig, obj, "RollieSummon", solver(rig, summon), SUMMON_FRAMES,
                        extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    act.pose_markers.new("Pop").frame = SUMMON_HIT
    K.ground_clip(rig, obj, "RollieDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.9}, settle_from=round(1.05 * FPS))


# --- previews ----------------------------------------------------------------
TARGET = (0, 0, 1.25)


def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"     # like the game: no tone mapping of the glow
    far = (5.5, -9.0, 4.5)
    shots = [("RollieIdle", 0, far), ("RollieRoll", 8, (-9.0, -4.5, 3.6)), ("RollieLaser", 45, far),
             ("RollieSabers", 20, (9.5, -2.5, 3.5)), ("RollieGrid", 12, far), ("RollieGrid", GRID_HIT, far),
             ("RollieSwipe", SWIPE_HIT, (2.0, -9.0, 7.0)), ("RollieSummon", SUMMON_HIT, far), ("RollieDeath", DEATH_FRAMES, far)]
    K.contact_sheet(scene, rig, shots, path, TARGET, size=360, cols=3)
    return [path]


def videos(scene, rig, out_dir):
    views = [((6.0, -10.0, 4.0), 5.5), ((11.0, 0.0, 2.5), 5.5), ((0.0, -1.0, 12.0), 6.5)]
    return K.clip_videos(scene, rig, tuple(CLIPS), out_dir, (0, -0.3, 1.1), views, size=300)


def main(export_path=None, blend_path=None, preview_path=None, video_dir=None):
    scene, rig, obj = build()
    K.decimate(obj, BUDGET)
    animate(rig, obj)
    report = K.validate(rig, obj, tuple(CLIPS), held=("RollieDeath",))
    report.update(points(rig))
    K.register(rig, tuple(CLIPS))
    K.setup_stage(scene, "Rollie", STAGE, TARGET, 4.8, camera=(5.5, -9.0, 4.5))
    rig.animation_data.action = bpy.data.actions["RollieIdle"]
    scene.frame_start, scene.frame_end = 0, IDLE_FRAMES
    scene.frame_set(0)
    report["height"] = round(max((obj.matrix_world @ v.co).z for v in obj.data.vertices), 3)
    report["wheel_radius"] = WHEEL_R
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), tuple(CLIPS), "Rollie", NAME, TARGET, 6.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    if video_dir:
        report["videos"] = videos(scene, rig, video_dir)
    print("Rollie:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "rollie.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "rollie.blend"),
         preview_path=args[2] if len(args) > 2 else None, video_dir=args[3] if len(args) > 3 else None)
