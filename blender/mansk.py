"""
Mansk: the boss of the seventh descent (depth 6), from the kids' drawing.

A mask floating with nobody behind it: a white shell, flat on top with a little point in the
middle, rounding off below like a shield, hollow at the back; two dots for eyes, a big round open
mouth with darkness behind it (what he breathes in goes in there), a blue diamond on his forehead,
and two long wavy beige horns that spring from the corners of the mask and end in round knobs.
Faces -Y in Blender, +Z up; one unit = one game cell, about 3.7 cells tall with his horns (the
mask about 1.6). He floats; the game lifts him higher still and lands him (game/mansk.js).

In his third phase his horns break (the game scales them away from the second bone on, leaving a
stump, render/manskview.js) and long red ribbons come out of the stumps, like the ties of a mask:
those are no part of the model, the game simulates them as ropes (core/ribbon.js) tied to the
`stump` bones.

Rig: root, body (the mask), mouth (scaled to open and close it), horn.L.0..3 and horn.R.0..3
(base to tip), and three bones the game reads: stump.L / stump.R (where a horn breaks: the top
of its first bone, pointing on along it) and tip.L / tip.R (its knob).

Clips, 30 fps, in place (the game supplies root motion and how high he floats):
    ManskHover    48-frame loop: floating, bobbing and rocking, the horns waving like weed.
    ManskInhale   3.2 s: leans back, his mouth opening wide (the tell), then leans in and from
                  frame 18 (extras.hit_frame) sucks the air in (extras.muzzle: his mouth) till
                  frame 84 (extras.pull_end), shaking, his horns blown forward; then gulps.
    ManskSpit     1.8 s: what he sucked in is in his mouth (extras.grip: where, every second frame
                  from 0 to the spit): he chews at frames 12 and 24 (extras.bites) and spits it
                  out at frame 36 (extras.throw_frame), lunging forward.
    ManskOrbs     1.8 s: rears up, his horns rising and spreading; at frame 24 (the hit frame)
                  balls of light gather at their knobs (extras.tips: [left, right]) and over his
                  diamond (extras.diamond).
    ManskSummon   1.6 s: spins right round, and at frame 30 Tornados come (extras.muzzle).
    ManskSlow     1.8 s: bows, his diamond to the front, and lifts his head slowly: at frame 30
                  time goes slow.
    ManskLash     2.8 s: (phase 3, no horns) leans back, then lunges at frame 24: his ribbons catch;
                  he draws back and up, holding what they caught (extras.grip, every fourth frame
                  from the catch to the release), squeezing at frames 36, 48 and 60 and letting go
                  at frame 72 (extras.throw_frame).
    ManskWhirl    2.4 s: winds up and whirls round twice, his ribbons sweeping all round; frame 36.
    ManskRise     2.2 s: (into phase 2) a roar, his mouth wide, shaking, rising.
    ManskBreak    2.8 s: (into phase 3) shakes harder and harder, his horns straining, and at frame
                  36 jerks back as they break; then turns slowly while his ribbons come out.
    ManskDeath    2.4 s: shudders, tips over backwards and falls flat on the floor, face up, like a
                  mask dropped: slaps down (extras.flat_frame), bounces a little and lies still,
                  the horns limp along the floor. Held.
    ManskDance    3.4 s: (his intro, game/bossreveals.js) comes up out of a bow and dances on six
                  beats (extras.beats, s): sways right, sways left, twirls right round over two
                  beats, crouches, springs up and lands in a ta-da, horns spread, mouth open,
                  held to the end. In place: the game glides him across the stage and lifts him.

Headless:
    Blender -b --python blender/mansk.py -- assets/mansk.glb blender/mansk.blend \
        blender/previews/mansk-preview.png
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

NAME, RIG_NAME = "Mansk", "ManskRig"
SCENE, COLLECTION, STAGE = "Mansk", "ManskAsset", "ManskStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("ManskHover", "ManskInhale", "ManskSpit", "ManskOrbs", "ManskSummon", "ManskSlow", "ManskLash",
         "ManskWhirl", "ManskRise", "ManskBreak", "ManskDeath", "ManskDance")

HEAD_HEX, HORN_HEX, EYE_HEX, MOUTH_HEX, DIAMOND_HEX = "#f3f1ec", "#d9c49c", "#1c1c26", "#3a0d1c", "#3d8bff"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("ManskHead", HEAD_HEX, 0), ("ManskHorns", HORN_HEX, 0), ("ManskEyes", EYE_HEX, 0),
             ("ManskMouth", MOUTH_HEX, 0), ("ManskDiamond_glow", DIAMOND_HEX, 1.8))
HEAD_M, HORN_M, EYE_M, MOUTH_M, DIAMOND_M = range(len(MATERIALS))

VOXEL, DETAIL, FINE = 0.016, 0.009, 0.005
HOVER_FRAMES, HOVER_SPEED = 48, 0.6
INHALE_FRAMES, INHALE_HIT, PULL_END = 96, 18, 84
SPIT_FRAMES, SPIT_BITES, SPIT_THROW = 54, (12, 24), 36
ORBS_FRAMES, ORBS_HIT = 54, 24
SUMMON_FRAMES, SUMMON_HIT = 48, 30
SLOW_FRAMES, SLOW_HIT = 54, 30
LASH_FRAMES, LASH_HIT, LASH_SQUEEZE, LASH_RELEASE = 84, 24, (36, 48, 60), 72
WHIRL_FRAMES, WHIRL_HIT = 72, 36
RISE_FRAMES = 66
BREAK_FRAMES, BREAK_AT = 84, 36
DEATH_FRAMES = 72
DANCE_FRAMES, DANCE_LEAD, DANCE_BEAT, DANCE_BEATS = 102, 12, 15, 6   # (120 bpm: a beat every 15 frames)
LOOP_T = HOVER_FRAMES / FPS

# --- body plan -----------------------------------------------------------------
# The mask: a thin shell (SHELL thick) bent like a face, its sides and its top and bottom curving
# back from the middle (`bend`, the surface's y over x and z), in the outline of the drawing: a
# cone rounded at both ends seen from the front, narrow below and wide above, cut flat on top, a
# little point in the middle of the top. Hollow behind, as a mask is.
OUTLINE = (V((0, 0, 0.86)), V((0, 0, 1.55)), 0.45, 0.62)
TOP_Z = 1.98
SPIKE = (V((0, 0, 1.84)), V((0, 0, 2.36)), 0.22, 0.03)   # the point in the middle of the top
SHELL, FRONT, BEND_X, BEND_Z, BEND_MID = 0.075, -0.3, 0.6, 0.2, 1.3


def bend(x, z):
    """y of the middle of the shell at (x, z): the face, curving back to its sides and ends."""
    return FRONT + BEND_X * x * x + BEND_Z * (z - BEND_MID) ** 2


def on_mask(x, z, out=0.0):
    """The point on the mask's front at (x, z), `out` further in front of it."""
    return V((x, bend(x, z) - SHELL / 2 - out, z))


LOW_C = V((0, 0, 1.05))
PIVOT = V((0, 0, 1.15))
EYES = {s: on_mask(sign * 0.2, 1.5, -0.01) for s, sign in SIDES}
EYE_RADII = (0.058, 0.035, 0.078)
MOUTH_C = on_mask(0, 0.98)              # the middle of his mouth's opening
MOUTH_HOLE = (V((0, MOUTH_C.y, 0.98)), (0.22, 0.4, 0.28))
DIAMOND_C, DIAMOND_R = on_mask(0, 1.76, -0.015), (0.11, 0.05, 0.15)
VOID_C = V((0, bend(0, 0.98) + 0.1, 0.98))   # the darkness behind his mouth
HORN_SEGS, HORN_LEN = 4, 1.75
HORN_R = (0.1, 0.085, 0.075, 0.068, 0.065)
KNOB_R = 0.1


def horn_point(s, u):
    sign = 1 if s == "L" else -1
    return V((sign * (0.42 + 0.3 * u + 0.1 * math.sin(3 * math.pi * u)), bend(0.42, 1.86) + 0.05 * math.sin(TAU * u), 1.86 + 1.7 * u))


def horn_curve(s, n=40):
    return [horn_point(s, u) for u in np.linspace(0, 1, n)]


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def horn_joints(s):
    """HORN_SEGS + 1 points along the horn at equal arc length (the bones' heads and the tip)."""
    pts = horn_curve(s, 200)
    a = arc(pts)
    return [pts[int(np.searchsorted(a, a[-1] * k / HORN_SEGS).clip(0, len(pts) - 1))] for k in range(HORN_SEGS + 1)]


def outline_sdf(P):
    """How far (x, z) is outside the mask's outline (seen from the front)."""
    Q = P * np.asarray((1, 0, 1), np.float32)
    a, b, r1, r2 = OUTLINE
    d = K.smax(K.round_cone(Q, a, b, r1, r2), P[..., 2] - TOP_Z, 0.12)
    a, b, r1, r2 = SPIKE
    return K.smin(d, K.round_cone(Q, a, b, r1, r2), 0.08)


def head_sdf(P):
    """The mask: the bent sheet SHELL thick within its outline, its rim rounded. (Distances across
    the sheet go by y, a little too far where it curves most: fine for meshing it.)"""
    x, z = P[..., 0], P[..., 2]
    sheet = np.abs(P[..., 1] - (FRONT + BEND_X * x * x + BEND_Z * (z - BEND_MID) ** 2)) - SHELL / 2
    return K.smax(sheet, outline_sdf(P), 0.03)


def void_sdf(P):
    """The darkness behind his mouth: a dark disc behind the opening, wide enough that the mouth
    opened wide still shows only darkness (it stays with the mask, not the mouth)."""
    c, r = MOUTH_HOLE
    return K.ellipsoid(P, VOID_C, (r[0] + 0.2, 0.03, r[2] + 0.22))


def hole_sdf(P):
    c, r = MOUTH_HOLE
    return K.ellipsoid(P, c, r)


def body_sdf(P):
    return np.maximum(head_sdf(P), -hole_sdf(P))


def lining_sdf(P):
    """The inside of his mouth: the hole's wall, a little in from the head's cut."""
    return np.maximum(np.abs(hole_sdf(P) + 0.014) - 0.012, head_sdf(P) - 0.01)


def diamond_sdf(P):
    q = np.abs(P - np.asarray(DIAMOND_C, np.float32)) / np.asarray(DIAMOND_R, np.float32)
    return (q.sum(axis=-1) - 1) * min(DIAMOND_R) * 0.6


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = V((-0.72, -0.45, 0.38)), V((0.72, 0.15, 2.42))
    parts.add("body", body_sdf, lo, hi, VOXEL, mat=HEAD_M)
    c, r = MOUTH_HOLE
    parts.add("mouth", lining_sdf, c - V(r) - V((0.04,) * 3), c + V(r) + V((0.04,) * 3), FINE, mat=MOUTH_M)
    parts.add("void", void_sdf, VOID_C - V((0.5, 0.08, 0.6)), VOID_C + V((0.5, 0.08, 0.6)), DETAIL, mat=MOUTH_M)
    for s, _ in SIDES:
        e = EYES[s]
        parts.add("body", lambda P, c=e: K.ellipsoid(P, c, EYE_RADII), e - V((0.1,) * 3), e + V((0.1,) * 3), FINE, mat=EYE_M)
        pts = horn_curve(s)
        radii = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(HORN_R)), HORN_R)
        knob = horn_point(s, 1)
        lo, hi = K.bounds(pts, KNOB_R + 0.05)
        parts.add(f"horn.{s}", lambda P, pts=pts, radii=radii, knob=knob:
                  K.smin(K.tapered_tube(P, pts, radii), K.ellipsoid(P, knob, (KNOB_R, KNOB_R, KNOB_R * 1.15)), 0.05),
                  lo, hi, DETAIL, mat=HORN_M)
    parts.add("body", diamond_sdf, DIAMOND_C - V(DIAMOND_R) - V((0.03,) * 3), DIAMOND_C + V(DIAMOND_R) + V((0.03,) * 3), FINE * 0.8,
              mat=DIAMOND_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "mansk"
    obj["head_color"] = HEAD_HEX
    obj["horn_color"] = HORN_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
def horn_name(s, j):
    return f"horn.{s}.{j}"


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", PIVOT, PIVOT + V((0, 0, 0.4)), "root", True, fwd),
             ("mouth", MOUTH_C, MOUTH_C + V((0, -0.2, 0)), "body", True, up)]
    for s, _ in SIDES:
        J = horn_joints(s)
        for j in range(HORN_SEGS):
            bones.append((horn_name(s, j), J[j], J[j + 1], horn_name(s, j - 1) if j else "body", True, fwd))
        d1 = (J[2] - J[1]).normalized()
        bones.append((f"stump.{s}", J[1], J[1] + d1 * 0.2, horn_name(s, 0), False, fwd))
        d = (J[-1] - J[-2]).normalized()
        bones.append((f"tip.{s}", J[-1], J[-1] + d * 0.15, horn_name(s, HORN_SEGS - 1), False, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "mansk", "forward": "-Y", "attack_style": "boss", "normal_speed": HOVER_SPEED, "root_motion": False})


def shares(along, bounds, names, width):
    past = [C.np_smoothstep(b - width, b + width, along) for b in bounds]
    out = {}
    for k, name in enumerate(names):
        before = past[k - 1] if k else np.ones_like(along)
        after = past[k] if k < len(past) else np.zeros_like(along)
        out[name] = before - after
    return out


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    c, r = MOUTH_HOLE
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        if part == "mouth":
            W[lo:hi, names.index("mouth")] = 1
        elif part == "void":
            W[lo:hi, names.index("body")] = 1
        elif part == "body":
            # round the mouth the face goes with it (opening, it stretches the lips)
            q = P[lo:hi]
            e = np.sqrt(((q[:, 0] - c.x) / r[0]) ** 2 + ((q[:, 2] - c.z) / r[2]) ** 2)
            m = 1 - C.np_smoothstep(1.0, 1.9, e)
            W[lo:hi, names.index("mouth")] = m
            W[lo:hi, names.index("body")] = 1 - m
        else:
            pts = horn_joints(s)
            bones = tuple(horn_name(s, j) for j in range(HORN_SEGS))
            _, along = C._polyline_closest(P[lo:hi], pts)
            WB = np.zeros((hi - lo, len(names)), np.float32)
            for name, share in shares(along, list(arc(pts)[1:HORN_SEGS]), bones, 0.06).items():
                WB[:, names.index(name)] += share
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
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
    for name, roughness in (("ManskHead", 0.55), ("ManskHorns", 0.6), ("ManskEyes", 0.3), ("ManskMouth", 0.8),
                            ("ManskDiamond_glow", 0.15)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
REST_JOINTS = {s: horn_joints(s) for s, _ in SIDES}
REST_DIRS = {s: [(J[j + 1] - J[j]).normalized() for j in range(HORN_SEGS)] for s, J in REST_JOINTS.items()}
SEG_LEN = {s: [(J[j + 1] - J[j]).length for j in range(HORN_SEGS)] for s, J in REST_JOINTS.items()}


def params(**kw):
    p = {"pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0), "mouth": (1.0, 1.0),
         "wave": (0.0, 1.0),       # the horns waving: time, strength
         "spread": 0.0,            # the horns turned outwards (rad)
         "back": 0.0,              # ... and backwards (rad; < 0: forwards)
         "droop": 0.0}             # 1: hanging limp (death)
    p.update(kw)
    return p


def body_motion(p):
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    rigid = Matrix.Translation(p["pos"]) @ K.about(PIVOT, R)
    sx, sz = p["squash"]
    return rigid, rigid @ K.about(LOW_C, Matrix.Diagonal((sx, sx, sz)))


def horn_dirs(s, p, r3):
    sign = 1 if s == "L" else -1
    t, amp = p["wave"]
    w = TAU * t / LOOP_T
    side = V((0, 1, 0))           # the horn's plane is about x-z: it waves about y, and nods about x
    out, a_side, a_nod = [], sign * p["spread"], p["back"]
    for j in range(HORN_SEGS):
        a_side += amp * (D(5) + D(3) * j) * math.sin(w + 1.3 * j + (0 if s == "L" else 2.2))
        a_nod += amp * (D(4) + D(2) * j) * math.sin(2 * w + 0.9 * j + (0.5 if s == "L" else 1.7))
        R = Matrix.Rotation(-a_side, 3, side) @ Matrix.Rotation(-a_nod, 3, V((1, 0, 0)))
        d = (r3 @ (R @ REST_DIRS[s][j])).normalized()
        if p["droop"] > 0:     # limp, lying along the floor (armature space), spread a little
            d = d.lerp(V((sign * (0.35 + 0.1 * j), 1, -0.08 - 0.06 * j)).normalized(), p["droop"]).normalized()
        out.append(d)
    return out


def solver(rig, fn):
    skel = C.Skeleton(rig)

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        rigid, squashed = body_motion(p)
        rigid, squashed = L @ rigid, L @ squashed
        bases["body"] = skel.set("body", poses, squashed @ skel.rest["body"])
        mx, mz = p["mouth"]
        mx, mz = 1 + (mx - 1) * 0.8, 1 + (mz - 1) * 0.5     # (the mask narrows below: the mouth opens more across)
        bases["mouth"] = skel.set("mouth", poses, squashed @ K.about(MOUTH_C, Matrix.Diagonal((mx, 1, mz))) @ skel.rest["mouth"])
        r3 = rigid.to_3x3()
        for s, _ in SIDES:
            head = squashed @ REST_JOINTS[s][0]
            for j, d in enumerate(horn_dirs(s, p, r3)):
                name = horn_name(s, j)
                bases[name] = K.aim_at(skel, name, poses, head, d)
                head = head + d * SEG_LEN[s][j]
        return bases
    return solve


def hover(f):
    w = TAU * f / HOVER_FRAMES
    return params(pos=V((0.012 * math.sin(w), 0, 0.06 * math.sin(w))), pitch=D(3) * math.cos(w), roll=D(3) * math.sin(w + 0.6),
                  yaw=D(2) * math.sin(w + 1.1), mouth=(1 + 0.04 * math.sin(2 * w), 1 + 0.06 * math.sin(2 * w)), wave=(f / FPS, 1.0))


def blend(a, b, k):
    """Parameters a eased into b (numbers, tuples and vectors), k of the way."""
    out = {}
    for key, va in a.items():
        vb = b[key]
        if isinstance(va, tuple):
            out[key] = tuple(x + (y - x) * k for x, y in zip(va, vb))
        elif isinstance(va, Vector):
            out[key] = va.lerp(vb, k)
        else:
            out[key] = va + (vb - va) * k
    return out


def with_hover(f, **kw):
    """The hover at frame f with some parameters replaced."""
    p = hover(f % HOVER_FRAMES)
    p.update(kw)
    return p


def inhale(f):
    k, t = C.keyframes, f / FPS
    hit, end = INHALE_HIT / FPS, PULL_END / FPS
    tell = k((0, 0), (hit, 1), (hit + 0.25, 0.4), (end, 0.4), (end + 0.15, 0))(t)          # leaning back, the mouth opening
    suck = k((0, 0), (hit - 0.05, 0), (hit + 0.2, 1), (end, 1), (end + 0.12, 0))(t)
    gulp = k((0, 0), (end, 0), (end + 0.1, 1), (INHALE_FRAMES / FPS, 0))(t)
    flutter = math.sin(TAU * 9 * t) * suck
    return with_hover(f, pos=V((0.012 * flutter, 0.06 * tell - 0.1 * suck, 0.05 * tell)), pitch=D(-12) * tell + D(9) * suck,
                      roll=D(1.5) * flutter, squash=(1 + 0.05 * suck - 0.04 * gulp, 1 - 0.03 * suck + 0.06 * gulp),
                      mouth=(1 + 0.3 * tell + 0.5 * suck - 0.3 * gulp, 1 + 0.4 * tell + 0.6 * suck - 0.35 * gulp),
                      wave=(t, 0.6 + 1.4 * suck), back=D(-14) * suck + D(10) * tell)


def spit(f):
    k, t = C.keyframes, f / FPS
    throw = SPIT_THROW / FPS
    chew = sum(math.exp(-((t - b / FPS) / 0.07) ** 2) for b in SPIT_BITES)
    lunge = k((0, 0), (throw - 0.12, -0.3), (throw, 1), (throw + 0.3, 0.3), (SPIT_FRAMES / FPS, 0))(t)
    shut = k((0, 1), (throw - 0.1, 1), (throw, 0), (SPIT_FRAMES / FPS, 0))(t)
    return with_hover(f, pos=V((0, -0.2 * lunge, -0.06 * chew)), pitch=D(8) * chew + D(14) * lunge,
                      squash=(1 + 0.08 * shut + 0.05 * chew, 1 - 0.04 * shut - 0.05 * chew),
                      mouth=(0.65 + 0.35 * (1 - shut) + 0.5 * max(0, lunge), 0.45 + 0.55 * (1 - shut) + 0.7 * max(0, lunge)),
                      wave=(t, 1 + chew))


def orbs(f):
    k, t = C.keyframes, f / FPS
    hit = ORBS_HIT / FPS
    rear = k((0, 0), (hit, 1), (hit + 0.6, 1), (ORBS_FRAMES / FPS, 0))(t)
    return with_hover(f, pos=V((0, 0.05 * rear, 0.12 * rear)), pitch=D(-10) * rear, spread=D(14) * rear, back=D(16) * rear,
                      wave=(t, 1 - 0.6 * rear), mouth=(1 + 0.15 * rear, 1 + 0.25 * rear))


def summon(f):
    k, t = C.keyframes, f / FPS
    hit = SUMMON_HIT / FPS
    spin = k((0, 0), (0.2, 0), (hit, 1))(t)
    bob = k((0, 0), (hit - 0.1, 0.4), (hit, -0.3), (SUMMON_FRAMES / FPS, 0))(t)
    return with_hover(f, yaw=TAU * C.smoothstep(0, 1, spin), pos=V((0, 0, 0.1 * bob)), spread=D(20) * math.sin(math.pi * spin),
                      wave=(t, 1 + math.sin(math.pi * spin)))


def slow(f):
    k, t = C.keyframes, f / FPS
    hit = SLOW_HIT / FPS
    bow = k((0, 0), (hit - 0.2, 1), (hit, 0.8), (hit + 0.7, 0), (SLOW_FRAMES / FPS, 0))(t)
    rise = k((0, 0), (hit, 0), (hit + 0.5, 1), (SLOW_FRAMES / FPS, 0))(t)
    return with_hover(f, pos=V((0, -0.06 * bow, -0.06 * bow + 0.08 * rise)), pitch=D(18) * bow - D(6) * rise,
                      mouth=(1 - 0.2 * bow + 0.15 * rise, 1 + 0.3 * rise), wave=(t * (1 - 0.6 * rise), 1), back=D(-8) * bow)


def lash(f):
    k, t = C.keyframes, f / FPS
    hit, release = LASH_HIT / FPS, LASH_RELEASE / FPS
    back = k((0, 0), (hit - 0.08, 1), (hit, 0), (LASH_FRAMES / FPS, 0))(t)
    lunge = k((0, 0), (hit - 0.1, 0), (hit, 1), (hit + 0.4, 0.2), (release, 0.2), (release + 0.1, 0.8), (LASH_FRAMES / FPS, 0))(t)
    hold = k((0, 0), (hit, 0), (hit + 0.4, 1), (release, 1), (release + 0.2, 0))(t)
    squeeze = sum(math.exp(-((t - s / FPS) / 0.08) ** 2) for s in LASH_SQUEEZE)
    return with_hover(f, pos=V((0.02 * math.sin(TAU * 6 * t) * squeeze, 0.12 * back - 0.25 * lunge + 0.15 * hold, 0.2 * hold)),
                      pitch=D(-14) * back + D(16) * lunge - D(8) * hold, roll=D(5) * squeeze * math.sin(TAU * 3 * t),
                      squash=(1 + 0.06 * squeeze, 1 - 0.05 * squeeze), mouth=(1 + 0.3 * squeeze, 1 + 0.5 * squeeze + 0.4 * lunge))


def whirl(f):
    k, t = C.keyframes, f / FPS
    hit = WHIRL_HIT / FPS
    wind = k((0, 0), (0.5, 1), (0.6, 1), (WHIRL_FRAMES / FPS, 1))(t)
    spin = k((0, 0), (0.5, 0), (hit, 0.5), (2.0, 0.95), (WHIRL_FRAMES / FPS, 1))(t)
    tilt = math.sin(math.pi * C.smoothstep(0.5, 2.1, t))
    return with_hover(f, yaw=D(-30) * k((0, 0), (0.5, 1), (0.6, 0))(t) + 2 * TAU * spin * wind, roll=D(12) * tilt,
                      pos=V((0, 0, 0.1 * tilt)), mouth=(1 + 0.2 * tilt, 1 + 0.4 * tilt))


def rise(f):
    k, t = C.keyframes, f / FPS
    roar = k((0, 0), (0.4, 1), (1.7, 1), (RISE_FRAMES / FPS, 0))(t)
    shake = math.sin(TAU * 11 * t) * roar
    return with_hover(f, pos=V((0.02 * shake, 0.05 * roar, 0.3 * C.smoothstep(0.2, 1.8, t) * (1 - C.smoothstep(1.8, 2.2, t)))),
                      pitch=D(-16) * roar, roll=D(3) * shake, mouth=(1 + 0.5 * roar, 1 + 0.65 * roar), spread=D(18) * roar,
                      back=D(14) * roar, wave=(t, 1 + 2 * roar))


def break_clip(f):
    k, t = C.keyframes, f / FPS
    at = BREAK_AT / FPS
    strain = C.smoothstep(0.1, at, t) * (1 - C.smoothstep(at, at + 0.05, t))
    shake = math.sin(TAU * (8 + 8 * strain) * t) * strain
    jerk = k((0, 0), (at, 0), (at + 0.08, 1), (at + 0.5, 0.2), (BREAK_FRAMES / FPS, 0))(t)
    turn = C.smoothstep(at + 0.3, BREAK_FRAMES / FPS, t)
    return with_hover(f, pos=V((0.03 * shake, 0.12 * jerk, 0.05 * jerk)), pitch=D(-6) * strain - D(18) * jerk, roll=D(5) * shake,
                      yaw=D(40) * math.sin(math.pi * turn), mouth=(1 + 0.4 * strain + 0.4 * jerk, 1 + 0.6 * strain + 0.6 * jerk),
                      spread=D(25) * strain, back=D(20) * strain, wave=(t, 1 + 3 * strain))


def death(f):
    """Shudders, tips over backwards and falls flat on the floor, face up, like a mask dropped:
    it slaps down, bounces a little and lies still, the horns limp along the floor behind it."""
    t = f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - C.smoothstep(0.1, 0.6, t))
    fall = C.smoothstep(0.35, 1.15, t) ** 2          # (faster and faster, like falling)
    since = max(0.0, t - 1.15)
    bounce = math.exp(-since * 9) * abs(math.sin(TAU * 1.8 * since)) if t > 1.15 else 0.0
    return params(pos=V((0.02 * shudder, 0.35 * fall, -1.0 * fall + 0.06 * bounce)), pitch=D(-90) * fall + D(5) * bounce,
                  roll=D(4) * shudder, mouth=(1 + 0.2 * fall, 1 + 0.3 * fall), wave=(t, 1.2 * (1 - C.smoothstep(0.1, 0.9, t))),
                  droop=C.smoothstep(0.4, 1.3, t))


def dance(f):
    """Up out of a bow, then six beats: a sway to his right and one to his left, a twirl right
    round over the next two, a crouch on the fifth, and up and down into a ta-da on the sixth."""
    k, t = C.keyframes, f / FPS
    b = [(DANCE_LEAD + DANCE_BEAT * i) / FPS for i in range(DANCE_BEATS)]
    pulse = lambda at, w=0.07: math.exp(-((t - at) / w) ** 2)
    bow = k((0, 1), (b[0] - 0.04, 0))(t)
    sway = k((0, 0), (b[0], 1), (b[1], -1), (b[2], 0))(t)
    spin = C.smoothstep(b[2], b[4] - 0.04, t)
    twirl = math.sin(math.pi * spin)
    crouch = pulse(b[4], 0.09)
    up = k((0, 0), (b[4] + 0.05, 0), (b[4] + 0.28, 1), (b[5], 0))(t)
    land = pulse(b[5] + 0.02, 0.07)
    ta = C.smoothstep(b[5] - 0.02, b[5] + 0.16, t)
    accent = pulse(b[0]) + pulse(b[1]) + 0.6 * pulse(b[2]) + crouch + land
    shimmy = math.sin(TAU * 4 * t) * (1 - ta) * (1 - spin * (1 - spin) * 4)
    return with_hover(f, pos=V((0.02 * shimmy, 0.06 * bow, -0.08 * bow - 0.07 * accent + 0.1 * up + 0.06 * ta)),
                      pitch=D(24) * bow + D(6) * crouch - D(8) * up - D(12) * ta,
                      roll=D(13) * sway + D(9) * twirl + D(7) * ta + D(1.5) * shimmy,
                      yaw=TAU * spin + D(10) * sway,
                      squash=(1 + 0.06 * accent - 0.03 * up, 1 - 0.07 * accent + 0.05 * up),
                      mouth=(1 + 0.18 * accent + 0.35 * ta, 1 + 0.3 * accent + 0.5 * ta),
                      wave=(t * 1.6, (1 + 0.8 * twirl) * (1 - 0.55 * ta)), spread=-D(8) * abs(sway) - D(20) * twirl - D(24) * ta,   # (< 0: out wide)
                      back=D(-14) * bow + D(6) * abs(sway) + D(14) * ta)


# --- the points the game uses, read off the baked clips -------------------------------
def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def at_frame(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)


def bone_point(rig, bone, local):
    """Where a point given in the rest pose rides with bone `bone` now (world)."""
    pb = rig.pose.bones[bone]
    delta = pb.matrix @ rig.data.bones[bone].matrix_local.inverted()
    return rig.matrix_world @ delta @ local


def head_of(rig, bone):
    return rig.matrix_world @ rig.pose.bones[bone].head


INSIDE = V((0, MOUTH_C.y + 0.15, 0.98))          # where a body sits in his mouth
LASH_GRIP = V((0, -2.0, 1.05))        # where his ribbons hold a body (in his head's frame)


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "ManskHover", solver(rig, hover), HOVER_FRAMES, cyclic=True, extras={"speed": HOVER_SPEED})
    i = K.ground_clip(rig, obj, "ManskInhale", solver(rig, inhale), INHALE_FRAMES,
                      extras={"attack_style": "inhale", "hit_frame": INHALE_HIT, "hit_time": INHALE_HIT / FPS, "pull_end": PULL_END})
    i.pose_markers.new("Pull").frame = INHALE_HIT
    i.pose_markers.new("Gulp").frame = PULL_END
    sp = K.ground_clip(rig, obj, "ManskSpit", solver(rig, spit), SPIT_FRAMES,
                       extras={"attack_style": "grab", "throw_frame": SPIT_THROW, "throw_time": SPIT_THROW / FPS,
                               "bites": [b / FPS for b in SPIT_BITES]})
    sp.pose_markers.new("Spit").frame = SPIT_THROW
    o = K.ground_clip(rig, obj, "ManskOrbs", solver(rig, orbs), ORBS_FRAMES,
                      extras={"attack_style": "cast", "hit_frame": ORBS_HIT, "hit_time": ORBS_HIT / FPS})
    o.pose_markers.new("Orbs").frame = ORBS_HIT
    su = K.ground_clip(rig, obj, "ManskSummon", solver(rig, summon), SUMMON_FRAMES,
                       extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    su.pose_markers.new("Summon").frame = SUMMON_HIT
    sl = K.ground_clip(rig, obj, "ManskSlow", solver(rig, slow), SLOW_FRAMES,
                       extras={"attack_style": "cast", "hit_frame": SLOW_HIT, "hit_time": SLOW_HIT / FPS})
    sl.pose_markers.new("Slow").frame = SLOW_HIT
    la = K.ground_clip(rig, obj, "ManskLash", solver(rig, lash), LASH_FRAMES,
                       extras={"attack_style": "grab", "hit_frame": LASH_HIT, "hit_time": LASH_HIT / FPS,
                               "throw_frame": LASH_RELEASE, "throw_time": LASH_RELEASE / FPS, "bites": [s / FPS for s in LASH_SQUEEZE]})
    la.pose_markers.new("Catch").frame = LASH_HIT
    la.pose_markers.new("Release").frame = LASH_RELEASE
    w = K.ground_clip(rig, obj, "ManskWhirl", solver(rig, whirl), WHIRL_FRAMES,
                      extras={"attack_style": "sweep", "hit_frame": WHIRL_HIT, "hit_time": WHIRL_HIT / FPS})
    w.pose_markers.new("Sweep").frame = WHIRL_HIT
    K.ground_clip(rig, obj, "ManskRise", solver(rig, rise), RISE_FRAMES, extras={"attack_style": "change"})
    b = K.ground_clip(rig, obj, "ManskBreak", solver(rig, break_clip), BREAK_FRAMES,
                      extras={"attack_style": "change", "break_frame": BREAK_AT, "break_time": BREAK_AT / FPS})
    b.pose_markers.new("Break").frame = BREAK_AT
    K.ground_clip(rig, obj, "ManskDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 2.0, "flat_frame": round(1.15 * FPS)}, settle_from=round(1.6 * FPS))
    da = K.ground_clip(rig, obj, "ManskDance", solver(rig, dance), DANCE_FRAMES,
                       extras={"beats": [round((DANCE_LEAD + DANCE_BEAT * i) / FPS, 4) for i in range(DANCE_BEATS)]})
    for n in range(DANCE_BEATS):
        da.pose_markers.new(f"Beat{n + 1}").frame = DANCE_LEAD + DANCE_BEAT * n
    K.register(rig, CLIPS)
    # the points the game needs, read off the baked clips
    at_frame(rig, "ManskInhale", (INHALE_HIT + PULL_END) // 2)
    i["muzzle"] = game(bone_point(rig, "mouth", MOUTH_C + V((0, -0.08, 0))))
    grip = []
    for f in range(0, SPIT_THROW + 1, 2):
        at_frame(rig, "ManskSpit", f)
        grip.append(game(bone_point(rig, "mouth", INSIDE)))
    sp["grip"] = grip
    at_frame(rig, "ManskOrbs", ORBS_HIT)
    o["tips"] = [game(head_of(rig, f"tip.{s}")) for s, _ in SIDES]
    o["diamond"] = game(bone_point(rig, "body", DIAMOND_C))
    at_frame(rig, "ManskSummon", SUMMON_HIT)
    su["muzzle"] = game(bone_point(rig, "body", V((0, -0.7, 0.5))))
    grip = []
    for f in range(LASH_HIT, LASH_RELEASE + 1, 4):
        at_frame(rig, "ManskLash", f)
        grip.append(game(bone_point(rig, "body", LASH_GRIP)))
    la["grip"] = grip
    return {"inhale": list(i["muzzle"]), "spit": [list(g) for g in sp["grip"]], "tips": [list(t) for t in o["tips"]],
            "diamond": list(o["diamond"]), "summon": list(su["muzzle"]), "lash": [list(g) for g in la["grip"]]}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    shots = [("ManskHover", 0, (1.6, -7.5, 2.6)), ("ManskDance", DANCE_LEAD + DANCE_BEAT * 5 + 8, (-4.0, -6.5, 3.0)),
             ("ManskInhale", 50, (3.5, -6.5, 2.4)), ("ManskSpit", 12, (4.5, -5.5, 2.4)),
             ("ManskOrbs", ORBS_HIT + 6, (2.5, -7.0, 2.6)), ("ManskSummon", 18, (-3.0, -7.0, 2.6)),
             ("ManskLash", LASH_HIT + 10, (5.5, -4.5, 2.6)), ("ManskBreak", BREAK_AT - 6, (2.0, -7.0, 2.6)),
             ("ManskRise", 30, (-2.0, -7.2, 2.6)), ("ManskSlow", SLOW_HIT - 4, (3.0, -6.8, 2.4)),
             ("ManskWhirl", WHIRL_HIT, (0.5, -7.5, 3.0)), ("ManskDeath", DEATH_FRAMES, (4.0, -5.5, 3.6))]
    K.contact_sheet(scene, rig, shots, path, (0, 0, 1.75), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("ManskDeath",))
    report.update(points)
    K.setup_stage(scene, "Mansk", STAGE, (0, 0, 1.75), 4.6, camera=(3.0, -8.0, 3.4))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, HOVER_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Mansk", NAME, (0, 0, 1.75), 5.5)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Mansk:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "mansk.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "mansk.blend"),
         preview_path=args[2] if len(args) > 2 else None)
