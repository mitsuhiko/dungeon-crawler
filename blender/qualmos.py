"""
Qualmos: the boss at the core of the world (depth 20, core/bosses.js), after a child's drawing: a
slender blue-green amphibian on six thick tentacles with rings of pale green suckers, two thin arms
ending in green palms with three clawed fingers, a round head ringed with hard spines (and a row of
them down his back), big glowing sea-green eyes with slit pupils under angry brows, and a wide grin
full of teeth in a green muzzle. Faces -Y in Blender, +Z up; one unit is 0.65 of a game cell
(render/qualmosmodel.js: GAME_SCALE), about 5 units tall.

Built like the other bosses (gusto.py, creature.py): every part a signed distance field meshed
with OpenVDB, all of them joined into one smooth-shaded skinned mesh with plain materials, the rig
and the skin weights computed here, the mesh collapsed to its triangle budget (figure.py
TRIANGLE_BUDGET), and every clip posed frame by frame and baked (CLIPS, each a function of time),
kept off the floor (creature.py ground_clip). It reads off the clips what the game needs
(`points`), exports the GLB and saves blender/qualmos.blend (an output, like gusto.blend: change
this script, not the .blend).

The rig: `root` (at the floor, between the tentacles: turning it tips the whole of him), `body`
(from the hips up: leaning it bends him over his tentacles), `head`, three bones an arm (arm,
forearm, hand) and six tentacles of six bones (tentacleN.0 at the hips .. .5 the tip curling on the
floor): 1 and 6 in front, 2 and 5 at the sides, 3 and 4 behind. The arm and hand on +X are `.R`.
A pose is built of turns about axes of the armature as the rig stands at rest (Pose.turn), so
"lean forward" is the same turn for every bone that leans.

Every clip starts and ends in his stance (`stance`: hunched a little, claws up; the idle and the
walk's first frame go round it), so the game blends them into each other cleanly; his tentacles
never stop moving (an undulation under everything), and every move has a wind-up, a strike that
lands on the attack's hit time (core/enemies.js QUALMOS_ATTACKS: these clips last as long as the
attacks, tests/assets.test.js) and a follow-through.

Clips (30 fps, in place; attacks by core/enemies.js QUALMOS_ATTACKS `clip`, render/qualmosmodel.js):
    QualmosWalk         a loop: his tentacles stepping in two threes, the body bobbing and swaying
                        over them, his arms swinging (extras.speed: the pace it matches)
    QualmosIdle         a loop, standing still: breathing, looking about, claws flexing, tentacles
                        curling (render/enemies.js plays a model's idle while it stands)
    QualmosWhip         a front tentacle coils up behind him and lashes across his front
    QualmosGrab         he leans in, his right hand catches (GRAB_HIT), lifts the catch up high
                        before him and shakes it, and slams it down (GRAB_THROW) (extras.grip:
                        where his hand is, game units, every second frame from the catch to the
                        throw; core/enemies.js QUALMOS_GRAB, tests/assets.test.js checks they agree)
    QualmosDoubleSlam   he rears up, both front tentacles and his arms raised, and slams them down
    QualmosWaterJet     he swells, breathing in, and blasts the jet from his mouth, shaking with it
    QualmosDive         crouches, leaps head first (the game carries him forward), lands on his belly
    QualmosInkBurst     rears back, cheeks full, and spits
    QualmosTailSpin     winds round, spins once all the way round, tentacles flung out flat
    QualmosUndertow     reaches out wide and hauls, arms and tentacles dragging in, again and again
    QualmosSpikeVolley  hunches, arches back and flings his head forward: the spines fly
    QualmosTidalSurge   raises his arms high, calls the water, crashes them down and pushes
    QualmosBellyFlop    blows himself up, jumps, flops onto his belly, lies there dazed (exposed),
                        gets up
    QualmosRage         changing phase: clenches, then bursts up, arms wide, roaring and shaking
    QualmosDeath        2.5 s: hit, staggers, his tentacles buckle and he sinks into a heap. Held.

The muzzles (`points`: his mouth at the jet's and the ink's hit, the top of his head at the
spines'; extras.muzzle) and the grab's grip must match core/enemies.js QUALMOS_AT and QUALMOS_GRAB.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, qualmos; importlib.reload(creature); importlib.reload(qualmos)
    qualmos.main(export_path="<repo>/assets/qualmos.glb", blend_path="<repo>/blender/qualmos.blend")

Headless:
    Blender -b --python blender/qualmos.py -- assets/qualmos.glb blender/qualmos.blend \
        blender/previews/qualmos-preview.png [blender/previews/qualmos-clips]
then compress it: node tools/compress-assets.mjs assets/qualmos.glb
(the last, optional: every clip as a video there, to look at in motion: creature.py clip_videos)
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

NAME, RIG_NAME = "Qualmos", "QualmosRig"
SCENE, COLLECTION, STAGE = "Qualmos", "QualmosAsset", "QualmosStage"
FPS = K.FPS
V = Vector
# the game draws him at this scale (render/qualmosmodel.js): what the game reads off him is in its units
GAME_SCALE = 0.65
# the grab: his hand closes at GRAB_HIT, holds the catch up until GRAB_THROW (frames from 0)
GRAB_HIT, GRAB_THROW = 28, 54
SIDES = (("L", -1), ("R", 1))      # (the .R arm on +X)

# (name, colour, emission); the names are the game's (core/enemies.js QUALMOS `parts`, recolor.js)
MATERIALS = (("QualmosSkin", "#246184", 0), ("QualmosBelly", "#2cb6a0", 0), ("QualmosTeeth", "#f1f8da", 0),
             ("QualmosSpines", "#2c9397", 0), ("QualmosEyes_glow", "#95f9bc", 0.9), ("QualmosMouth", "#0a1822", 0),
             ("QualmosSuckers", "#a0e7b3", 0), ("QualmosSuckerHollows", "#358979", 0))
SKIN_M, BELLY_M, TEETH_M, SPINE_M, EYE_M, MOUTH_M, SUCKER_M, HOLLOW_M = range(len(MATERIALS))
ROUGHNESS = {"QualmosSkin": 0.5, "QualmosBelly": 0.55, "QualmosTeeth": 0.3, "QualmosSpines": 0.45,
             "QualmosEyes_glow": 0.2, "QualmosMouth": 0.8, "QualmosSuckers": 0.5, "QualmosSuckerHollows": 0.7}

VOXEL, DETAIL, FINE = 0.026, 0.014, 0.0075

# --- body plan (rest pose, armature space) -------------------------------------
TORSO_C, TORSO_R = V((0, 0.06, 2.66)), (0.53, 0.4, 1.12)
BELLY_C, BELLY_R = V((0, -0.17, 2.64)), (0.42, 0.29, 0.93)   # the green plate on his front
NECK_C, NECK_R = V((0, 0, 3.62)), (0.31, 0.29, 0.43)
HEAD_C, HEAD_R = V((0, -0.03, 4.13)), (0.66, 0.43, 0.65)
MUZZLE_C, MUZZLE_R = V((0, -0.26, 3.96)), (0.52, 0.28, 0.37)
HIPS = V((0, 0.06, 1.98))      # where the tentacles meet under him

SHOULDER = {s: V((sign * 0.46, 0, 3.3)) for s, sign in SIDES}
ELBOW = {s: V((sign * 1.01, -0.08, 2.68)) for s, sign in SIDES}
WRIST = {s: V((sign * 1.24, -0.22, 2.28)) for s, sign in SIDES}
HAND_TIP = {s: V((sign * 1.3, -0.36, 1.93)) for s, sign in SIDES}
ARM_RADII = (0.15, 0.12, 0.1)

TENTACLES = range(1, 7)
# tentacle 1 in front on his -X side, then round him: 2 at his side, 3 behind, 4, 5, 6
TENT_ANGLE = {i: math.radians(a) for i, a in zip(TENTACLES, (-30, -90, -150, 150, 90, 30))}
# its centre line in its own plane: (out from his middle, up), a sideways sweep (+: round towards
# the front), the points the bones run between (hips .. tip)
TENT_PATH = ((0.2, 1.98, 0), (0.46, 1.42, 0), (0.72, 0.76, 0), (1.06, 0.3, 0.02), (1.42, 0.2, 0.08),
             (1.68, 0.34, 0.18), (1.66, 0.62, 0.32))
TENT_RADII = (0.2, 0.18, 0.16, 0.13, 0.1, 0.075, 0.035)
SUCKERS = 11
SEGMENTS = range(len(TENT_PATH) - 1)
FRONT, FLANK, BACK = (1, 6), (2, 5), (3, 4)   # the tentacles by where they are
WALK_SPEED = 1.7   # rig units / s his walk matches (extras.speed)


def tent_point(i, k):
    """Point k of tentacle i's centre line (armature space)."""
    a = TENT_ANGLE[i]
    out, side = V((math.sin(a), -math.cos(a), 0)), V((math.cos(a), math.sin(a), 0))
    r, z, sweep = TENT_PATH[k]
    turn = -1 if a < 0 else 1      # (each sweeps round towards the front)
    return V((HIPS.x, HIPS.y, 0)) + out * r + side * (sweep * turn) + V((0, 0, z))


def tent_points(i):
    """The points its bones run between (hips .. tip)."""
    return [tent_point(i, k) for k in range(len(TENT_PATH))]


def tent_curve(i, n=6):
    """Its centre line smoothed (Catmull-Rom through tent_points, n points a bone) and the radius
    at each point: the SDF's, so its curl bends round rather than kinking at the joints."""
    pts, out, radii = tent_points(i), [], []
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    for k in range(len(pts) - 1):
        p0, p1, p2, p3 = ext[k:k + 4]
        for j in range(n):
            u = j / n
            out.append(0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3))
            radii.append(TENT_RADII[k] + (TENT_RADII[k + 1] - TENT_RADII[k]) * u)
    return out + [pts[-1]], radii + [TENT_RADII[-1]]


def front_y(c, r, x, z):
    """y of an ellipsoid's front surface (-Y side) at (x, z)."""
    u = 1 - ((x - c.x) / r[0]) ** 2 - ((z - c.z) / r[2]) ** 2
    return c.y - r[1] * math.sqrt(max(0.0, u))


def on_head(x, z, sink=0.0):
    return V((x, front_y(HEAD_C, HEAD_R, x, z) + sink, z))


def on_muzzle(x, z, sink=0.0):
    return V((x, front_y(MUZZLE_C, MUZZLE_R, x, z) + sink, z))


EYE = {s: on_head(sign * 0.275, 4.31, -0.02) for s, sign in SIDES}
EYE_R = (0.125, 0.08, 0.2)
SOCKET = {s: on_head(sign * 0.275, 4.3, 0.06) for s, sign in SIDES}
SOCKET_R = (0.2, 0.12, 0.27)
PUPIL_R = (0.03, 0.03, 0.15)
GLINT_R = (0.025, 0.02, 0.03)
BROW = {s: [on_head(sign * (0.08 + 0.39 * u), 4.5 + 0.13 * u - 0.06 * u * u, -0.04) for u in np.linspace(0, 1, 6)] for s, sign in SIDES}
# the grin: its middle line rises towards the corners, widest in the middle
GRIN_W, GRIN_Z, GRIN_RISE, GRIN_H = 0.42, 3.87, 0.9, 0.07
MOUTH = on_muzzle(0, GRIN_Z, -0.05)            # where he spits and blows from
CROWN = V((0, 0.05, 4.76))                     # where his spines fly from


def grin_z(x):
    return GRIN_Z + GRIN_RISE * x * x


def grin_half(x):
    return GRIN_H * math.sqrt(max(0.0, 1 - (x / (GRIN_W + 0.02)) ** 2)) + 0.012


def head_spines():
    """(base, tip, radius) of the spines round his head: four a side, three on his crown."""
    out = []
    for s, sign in SIDES:
        for k, z in enumerate((3.86, 4.12, 4.38, 4.62)):
            base = V((sign * (0.5 - 0.05 * k), 0.05, z))
            out.append((base, base + V((sign * 0.52, 0.06, 0.28 + 0.06 * k)), 0.085))
    for x in (-0.25, 0, 0.25):
        base = V((x * 0.9, 0.05, 4.68 - abs(x) * 0.25))
        out.append((base, base + V((x * 1.2, 0.03, 0.38 - abs(x) * 0.3)), 0.08))
    return out


def dorsal_spines():
    out = []
    for k in range(7):
        z = 1.98 + 0.27 * k
        y = front_y(TORSO_C, (TORSO_R[0], -TORSO_R[1], TORSO_R[2]), 0, z) - 0.06   # (the back)
        out.append((V((0, y, z)), V((0, y + 0.34, z + 0.22)), 0.07))
    return out


def teeth():
    """(base, tip, radius, lower): eleven above pointing down, eight below pointing up (on his jaw),
    in between each other."""
    out = []
    for x in np.linspace(-0.37, 0.37, 11):
        top = grin_z(x) + grin_half(x) * 0.9
        out.append((on_muzzle(x, top, -0.01), on_muzzle(x, top - grin_half(x) * 1.8, -0.015), 0.022, False))
    for x in np.linspace(-0.31, 0.31, 8):
        bottom = grin_z(x) - grin_half(x) * 0.9
        out.append((on_muzzle(x, bottom, -0.01), on_muzzle(x, bottom + grin_half(x) * 1.6, -0.015), 0.02, True))
    return out


def fingers(s):
    """(knuckle, tip) of his three fingers, and where each claw ends."""
    sign = 1 if s == "R" else -1
    out = []
    for k in (-1, 0, 1):
        knuckle = WRIST[s] + V((sign * 0.06 + 0.11 * k, -0.06, -0.12))
        tip = knuckle + V((0.03 * k, -0.06, -0.2))
        out.append((knuckle, tip, tip + V((0.01 * k, -0.05, -0.1))))
    return out


def sucker_frames(i):
    """(centre, normal, size) of tentacle i's suckers: a row down the front of it, from the knee
    to near the tip, smaller towards the tip."""
    pts, out = tent_points(i), []
    lengths = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])
    for n in range(SUCKERS):
        s = lengths[-1] * (0.22 + 0.7 * n / (SUCKERS - 1))
        k = min(int(np.searchsorted(lengths, s)) - 1, len(pts) - 2)
        u = (s - lengths[k]) / (lengths[k + 1] - lengths[k])
        c = pts[k].lerp(pts[k + 1], u)
        t = (pts[k + 1] - pts[k]).normalized()
        r = TENT_RADII[k] + (TENT_RADII[k + 1] - TENT_RADII[k]) * u
        face = V((0, -1, -0.6)) if i in (1, 2, 5, 6) else V((-math.copysign(1, tent_point(i, 3).x), 0, -0.6))
        nrm = (face - t * face.dot(t)).normalized()
        out.append((c + nrm * r * 0.92, nrm, r))
    return out


def torus(P, c, n, R, r):
    """A ring of major radius R and thickness r round c, lying across n."""
    a = n.orthogonal().normalized()
    b = n.cross(a)
    L = K.local(P, c, (a, b, n))
    q = np.sqrt(L[..., 0] ** 2 + L[..., 1] ** 2) - R
    return np.sqrt(q * q + L[..., 2] ** 2) - r


def torso_sdf(P):
    return K.smin(K.ellipsoid(P, TORSO_C, TORSO_R), K.ellipsoid(P, NECK_C, NECK_R), 0.12)


def grin_sdf(P):
    """A thin dark patch lying on the muzzle: the open grin."""
    x, z = P[..., 0], P[..., 2]
    zc = GRIN_Z + GRIN_RISE * x * x
    hh = GRIN_H * np.sqrt(np.clip(1 - (x / (GRIN_W + 0.02)) ** 2, 0, 1)) + 0.012
    band = np.maximum(np.abs(z - zc) - hh, np.abs(x) - GRIN_W)
    shell = np.abs(K.ellipsoid(P, MUZZLE_C, MUZZLE_R) - 0.004) - 0.012
    return np.maximum(np.maximum(shell, band), P[..., 1] - (MUZZLE_C.y - 0.1))


def arm_sdf(P, s):
    return K.tapered_tube(P, [SHOULDER[s], ELBOW[s], WRIST[s]], ARM_RADII)


def hand_sdf(P, s):
    sign = 1 if s == "R" else -1
    d = K.ellipsoid(P, WRIST[s] + V((sign * 0.05, -0.05, -0.08)), (0.17, 0.12, 0.2))
    return d


def fingers_sdf(P, s):
    d = None
    for knuckle, tip, _ in fingers(s):
        f = K.round_cone(P, knuckle, tip, 0.06, 0.045)
        d = f if d is None else np.minimum(d, f)
    return d


def claws_sdf(P, s):
    d = None
    for _, tip, claw in fingers(s):
        c = K.round_cone(P, tip, claw, 0.035, 0.005)
        d = c if d is None else np.minimum(d, c)
    return d


# the small things (teeth, pupils and glints, claws, suckers) are a mesh of their own, collapsed to
# a share of the triangle budget of their own: in one with the rest, the collapse would spend the
# budget on a hundred little rings and leave the head in shards
BUDGET_SMALL = 3000


def build_mesh(coll):
    """-> (the big parts, the small things): (mesh, owners) each."""
    parts, small = K.Parts(), K.Parts()
    pad = V((0.06,) * 3)
    parts.add("body", torso_sdf, TORSO_C - V(TORSO_R) - pad, NECK_C + V(NECK_R) + pad, VOXEL, mat=SKIN_M)
    parts.add("body", lambda P: K.ellipsoid(P, BELLY_C, BELLY_R), BELLY_C - V(BELLY_R) - pad, BELLY_C + V(BELLY_R) + pad, VOXEL, mat=BELLY_M)
    for base, tip, r in dorsal_spines():
        lo, hi = K.bounds([base, tip], r + 0.03)
        parts.add("body", lambda P, a=base, b=tip, r=r: K.round_cone(P, a, b, r, 0.008), lo, hi, DETAIL, mat=SPINE_M)
    # the head
    parts.add("head", lambda P: K.ellipsoid(P, HEAD_C, HEAD_R), HEAD_C - V(HEAD_R) - pad, HEAD_C + V(HEAD_R) + pad, VOXEL, mat=SKIN_M)
    parts.add("muzzle", lambda P: K.ellipsoid(P, MUZZLE_C, MUZZLE_R), MUZZLE_C - V(MUZZLE_R) - pad, MUZZLE_C + V(MUZZLE_R) + pad,
              VOXEL * 0.8, mat=BELLY_M)
    w = GRIN_W + 0.05
    parts.add("muzzle", grin_sdf, (-w, MUZZLE_C.y - MUZZLE_R[1] - 0.05, GRIN_Z - 0.12), (w, MUZZLE_C.y, GRIN_Z + 0.26), DETAIL * 0.75, mat=MOUTH_M)
    for base, tip, r, lower in teeth():
        lo, hi = K.bounds([base, tip], r + 0.02)
        small.add("jaw" if lower else "head", lambda P, a=base, b=tip, r=r: K.round_cone(P, a, b, r, 0.002), lo, hi, FINE, mat=TEETH_M)
    for s, _ in SIDES:
        so, e = SOCKET[s], EYE[s]
        parts.add("head", lambda P, c=so: K.ellipsoid(P, c, SOCKET_R), so - V(SOCKET_R) - pad, so + V(SOCKET_R) + pad, DETAIL, mat=SPINE_M)
        parts.add("head", lambda P, c=e: K.ellipsoid(P, c, EYE_R), e - V(EYE_R) - pad, e + V(EYE_R) + pad, FINE, mat=EYE_M)
        pupil = e + V((0, -EYE_R[1] + 0.01, 0))
        small.add("head", lambda P, c=pupil: K.ellipsoid(P, c, PUPIL_R), pupil - V(PUPIL_R) - pad, pupil + V(PUPIL_R) + pad, FINE, mat=MOUTH_M)
        glint = e + V((-0.04 * (1 if s == "R" else -1), -EYE_R[1] + 0.005, 0.07))
        small.add("head", lambda P, c=glint: K.ellipsoid(P, c, GLINT_R), glint - V((0.06,) * 3), glint + V((0.06,) * 3), FINE, mat=TEETH_M)
        lo, hi = K.bounds(BROW[s], 0.1)
        parts.add("head", lambda P, pts=BROW[s]: K.tapered_tube(P, pts, np.linspace(0.06, 0.045, len(pts))), lo, hi, DETAIL, mat=SKIN_M)
    for base, tip, r in head_spines():
        lo, hi = K.bounds([base, tip], r + 0.03)
        parts.add("head", lambda P, a=base, b=tip, r=r: K.round_cone(P, a, b, r, 0.008), lo, hi, DETAIL, mat=SPINE_M)
    # the arms: a round shoulder, the arm, a green palm, three fingers and their claws
    for s, _ in SIDES:
        c = SHOULDER[s]
        parts.add(f"shoulder.{s}", lambda P, c=c: K.ellipsoid(P, c, (0.25, 0.26, 0.3)), c - V((0.34,) * 3), c + V((0.34,) * 3), DETAIL, mat=SKIN_M)
        lo, hi = K.bounds([SHOULDER[s], ELBOW[s], WRIST[s]], 0.2)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=SKIN_M)
        lo, hi = K.bounds([WRIST[s]], 0.3)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, DETAIL, mat=BELLY_M)
        pts = [p for f in fingers(s) for p in f]
        lo, hi = K.bounds(pts, 0.09)
        parts.add(f"hand.{s}", lambda P, s=s: fingers_sdf(P, s), lo, hi, FINE, mat=SKIN_M)
        small.add(f"hand.{s}", lambda P, s=s: claws_sdf(P, s), lo, hi, FINE, mat=TEETH_M)
    # the tentacles and their suckers (a pale ring, a darker hollow in it)
    for i in TENTACLES:
        pts, radii = tent_curve(i)
        lo, hi = K.bounds(pts, 0.24)
        parts.add(f"tentacle.{i}", lambda P, pts=pts, radii=radii: K.tapered_tube(P, pts, radii), lo, hi, VOXEL, mat=SKIN_M)
        for c, n, r in sucker_frames(i):
            R = 0.42 * r
            lo, hi = c - V((R + 0.05,) * 3), c + V((R + 0.05,) * 3)
            small.add(f"tentacle.{i}", lambda P, c=c, n=n, R=R: torus(P, c, n, R, 0.18 * R + 0.006), lo, hi, FINE, mat=SUCKER_M)
            small.add(f"tentacle.{i}", lambda P, c=c, n=n, R=R: K.ellipsoid(P, c - n * (0.45 * R), (0.7 * R,) * 3),
                      lo, hi, FINE, mat=HOLLOW_M)
    return (parts.mesh(NAME, coll, MATERIALS), parts.owners), (small.mesh(NAME + "Small", coll, MATERIALS), small.owners)


# --- rig / skin ----------------------------------------------------------------
# the spine: hips -> chest -> neck -> the top of his head; the jaw hinges at the back of his muzzle
SPINE = (V((0, 0, 1.9)), V((0, 0, 2.9)), V((0, 0, 3.6)), V((0, 0, 4.65)))
JAW = (V((0, -0.05, 3.98)), V((0, -0.55, 3.8)))


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0, 0.5), None, False, fwd),
             ("body", SPINE[0], SPINE[1], "root", True, fwd),
             ("chest", SPINE[1], SPINE[2], "body", True, fwd),
             ("head", SPINE[2], SPINE[3], "chest", True, fwd),
             ("jaw", JAW[0], JAW[1], "head", True, up)]
    for s, _ in SIDES:
        bones += [(f"arm.{s}", SHOULDER[s], ELBOW[s], "chest", True, fwd),
                  (f"forearm.{s}", ELBOW[s], WRIST[s], f"arm.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], HAND_TIP[s], f"forearm.{s}", True, fwd)]
    for i in TENTACLES:
        pts = tent_points(i)
        for k in range(len(pts) - 1):
            bones.append((f"tentacle{i}.{k}", pts[k], pts[k + 1], f"tentacle{i}.{k - 1}" if k else "root", True, up))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "qualmos", "forward": "-Y", "attack_style": "boss", "root_motion": False})


def shares(along, bounds, names, width):
    """Bone shares along a chain: names[k] between bounds[k - 1] and bounds[k] (arc length)."""
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
    """Skin weights by what each part is (its owner's kind); rigid: every part follows its bones
    as one (the small things: a sucker or a tooth does not bend, and with no joint inside it the
    collapse may take it down to a few triangles, figure.py _protect)."""
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    col = names.index
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        Q = P[lo:hi]
        WB = np.zeros((hi - lo, len(names)), np.float32)
        if part == "body":       # the torso, bending from the hips through the chest into the head
            c, h = C.np_smoothstep(2.55, 3.15, Q[:, 2]), C.np_smoothstep(3.45, 3.85, Q[:, 2])
            WB[:, col("body")], WB[:, col("chest")], WB[:, col("head")] = 1 - c, c - h, h
        elif part == "head":
            WB[:, col("head")] = 1
        elif part == "jaw":
            WB[:, col("jaw")] = 1
        elif part == "muzzle":   # below the grin his jaw, above it his head (the grin stretches open)
            line = np.array([grin_z(x) for x in Q[:, 0]])
            j = C.np_smoothstep(0.03, -0.05, Q[:, 2] - line)
            WB[:, col("jaw")], WB[:, col("head")] = j, 1 - j
        elif part == "shoulder":     # (the ball turns about its middle with the arm, its inner side less)
            a = 0.7 + 0.3 * C.np_smoothstep(0.0, 0.18, np.abs(Q[:, 0]) - abs(SHOULDER[s].x))
            WB[:, col("chest")], WB[:, col(f"arm.{s}")] = 1 - a, a
        elif part == "hand":
            WB[:, col(f"hand.{s}")] = 1
        else:
            if part == "arm":
                pts = [SHOULDER[s], ELBOW[s], WRIST[s]]
                bones, width = (f"arm.{s}", f"forearm.{s}"), 0.08
            else:
                pts = tent_points(int(s))
                bones, width = tuple(f"tentacle{s}.{k}" for k in range(len(pts) - 1)), 0.1
            _, along = C._polyline_closest(Q, pts)
            for name, share in shares(along, list(arc(pts)[1:-1]), bones, width).items():
                WB[:, col(name)] += share
            WB = K.diffuse(obj, lo, hi, WB, 4)
        if rigid:
            WB[:] = WB.mean(axis=0)
        W[lo:hi] = WB
    K.write_weights(obj, names, W)


def build():
    """His scene, rig and one skinned mesh, collapsed to its budget (the big parts and the small
    things each to their share, then joined)."""
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
    obj["enemy"] = "qualmos"
    obj["style"] = "smooth_clay"
    for name, roughness in ROUGHNESS.items():
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- curves -----------------------------------------------------------------
def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def ease(u, kind="smooth"):
    u = clamp(u)
    if kind == "in":        # gathering speed: a strike (not cubed: that ends so fast it pops)
        return u * u
    if kind == "out":       # losing it: a recovery, a rise (with "in", a thrown body's arc)
        return 1 - (1 - u) ** 2
    if kind == "linear":
        return u
    return u * u * (3 - 2 * u)


def curve(t, keys):
    """The value at time t of keys [(time, value[, easing into it]), ...], eased between them;
    held before the first and after the last. Values may be numbers or Vectors."""
    if t <= keys[0][0]:
        return keys[0][1]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            return a[1] + (b[1] - a[1]) * ease((t - a[0]) / (b[0] - a[0]), b[2] if len(b) > 2 else "smooth")
    return keys[-1][1]


def shake(t, rate, amount, seed=0.0):
    """A tremble: two frequencies out of step (radians or units)."""
    return amount * (math.sin(math.tau * rate * t + seed) * 0.7 + math.sin(math.tau * rate * 1.73 * t + 2.1 + seed) * 0.3)


# --- poses ------------------------------------------------------------------
# His trunk, head, jaw and (mostly) his arms are turned by angles; his tentacles are posed from where
# they must reach (ik.py): each has a contact, the point where it meets the floor (its fourth joint;
# the two bones past it curl up off the floor), which stays where the clip puts it, and the tentacle
# is laid along a curve from his hips to it (bowing up and out as far as it must), its tip curling
# off it. An arm may reach for a point too (Pose.reach).
FK = ("root", "body", "chest", "head", "jaw")
REACH = 4          # the tentacles' bones from the hips to the contact; the rest curl off it


class Rig:
    """What the poses need of the rig: every bone's rest orientation, the tentacles' rest shape."""

    def __init__(self, rig):
        self.rig = rig
        self.skel = C.Skeleton(rig)
        self.rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
        self.joints = {i: tent_points(i) for i in TENTACLES}
        self.lengths = {i: IK.lengths_of(j) for i, j in self.joints.items()}
        self.home = {i: j[REACH].copy() for i, j in self.joints.items()}               # its contact at rest
        self.out = {i: V((j[REACH].x - HIPS.x, j[REACH].y - HIPS.y, 0)).normalized() for i, j in self.joints.items()}
        self.side = {i: V((0, 0, 1)).cross(self.out[i]) for i in TENTACLES}             # round him, to his .L side
        self.dirs = {i: [(b - a).normalized() for a, b in zip(j, j[1:])] for i, j in self.joints.items()}
        self.arm = {s: ((ELBOW[s] - SHOULDER[s]).length, (WRIST[s] - ELBOW[s]).length) for s, _ in SIDES}
        self.arm_bones = {s: (*self.arm[s], (HAND_TIP[s] - WRIST[s]).length) for s, _ in SIDES}


class Pose:
    def __init__(self, R):
        self.R = R
        self.rot = {n: Quaternion() for n in R.rest}
        self.loc = {n: Vector() for n in R.rest}
        self.scl = {n: Vector((1, 1, 1)) for n in R.rest}
        # each tentacle: its contact's offset from where it rests (`offset`, armature space), how
        # much it goes with his root (`ride`: 0 the floor holds it, 1 it moves and turns with all of
        # him: in the air), how far its tip curls (1: as at rest), how its middle bows (`bow`: a
        # direction, else up and out), the way it arrives at its contact (`arrive`, else as at rest)
        self.feet = {i: {"offset": Vector(), "ride": 0.0, "curl": 1.0, "bow": None, "arrive": None} for i in TENTACLES}
        self.reaches = {}
        self.floor = 0.0   # (how far ground_clip lifted all of him off the floor this frame)
        # how loosely each arm hangs (1: its hand trails the pose with weight, a spring, ARM_SPRING;
        # 0: exactly where the clip puts it, for a precise reach); the wrists where the clip puts them
        self.loose = {s: 1.0 for s, _ in SIDES}
        self.arm_dirs = {}     # each arm's bones' ways as posed (armature space)
        self.arm_ways = {}     # ... given instead (the spring's), the arm laid along them from its shoulder

    def turn(self, bone, axis, angle):
        """Turn a bone about an axis of the armature (as the rig stands at rest), on top of its turns so far."""
        if angle:
            q = Quaternion(self.R.rest[bone].transposed() @ Vector(axis), angle)
            self.rot[bone] = q @ self.rot[bone]

    def move(self, bone, offset):
        self.loc[bone] += self.R.rest[bone].transposed() @ Vector(offset)

    def size(self, bone, s):
        self.scl[bone] = Vector((s, s, s)) if isinstance(s, (int, float)) else Vector(s)

    # his parts, by what they do
    def lean(self, a=0.0, side=0.0, twist=0.0, up=0.0, back=0.0):
        """The trunk over the hips, shared by the body and the chest (a curl, not a plank): forward
        (+), to his .L side (+), round to his .L side (+); raised and shifted back (rig units)."""
        for b in ("body", "chest"):
            self.turn(b, (1, 0, 0), a / 2)
            self.turn(b, (0, 1, 0), -side / 2)
            self.turn(b, (0, 0, 1), -twist / 2)
        if up or back:
            self.move("body", (0, back, up))

    def tip(self, a=0.0, side=0.0, spin=0.0, up=0.0, forward=0.0):
        """The whole of him about the floor between his tentacles: forward (+), to his .L side (+),
        spun round to his .L side (+); lifted, moved forward (rig units)."""
        self.turn("root", (0, 0, 1), -spin)
        self.turn("root", (1, 0, 0), a)
        self.turn("root", (0, 1, 0), -side)
        if up or forward:
            self.move("root", (0, -forward, up))

    def look(self, nod=0.0, turn=0.0, tilt=0.0):
        """The head: down (+), round to his .L side (+), tilted to his .L side (+)."""
        self.turn("head", (1, 0, 0), nod)
        self.turn("head", (0, 0, 1), -turn)
        self.turn("head", (0, 1, 0), -tilt)

    def jaw(self, a):
        """His mouth open (radians)."""
        self.turn("jaw", (1, 0, 0), a)

    def arm(self, side, fwd=0.0, out=0.0, elbow=0.0, wrist=0.0, twist=0.0):
        """An arm (side 'L' or 'R'): raised forward (+, up over the head past pi/2), out to the side
        (+), the elbow bent forward (+), the hand bent up (+), the forearm turned inward (+)."""
        s = 1 if side == "R" else -1
        self.turn(f"arm.{side}", (0, -s, 0), out)
        self.turn(f"arm.{side}", (1, 0, 0), -fwd)
        self.turn(f"forearm.{side}", (1, 0, 0), -elbow)
        self.turn(f"forearm.{side}", (0, 0, 1), s * twist)
        self.turn(f"hand.{side}", (1, 0, 0), -wrist)

    def arms(self, **kw):
        self.arm("L", **kw)
        self.arm("R", **kw)

    def reach(self, side, target, weight=1.0, pole=None, space=None):
        """The arm's wrist to `target` (`weight` of the way from where its angles put it, turning
        bone by bone), the elbow bending towards `pole` (else as it bends already). The target is in
        armature space, or given as at rest and carried along with the bone `space` (a hand on his
        belly stays on it as he leans)."""
        if weight > 0:
            self.reaches[side] = (target, min(1.0, weight), pole, space)

    def foot(self, i, offset=None, out=0.0, up=0.0, forward=0.0, ride=None, curl=None, bow=None, arrive=None):
        """Tentacle i's contact: moved by `offset`, `out` from him, `up`, `forward` (on top of what is
        there); `ride` (0 floor, 1 with his root), its curl times `curl`, its bow, its way in."""
        f = self.feet[i]
        f["offset"] += (offset if offset is not None else Vector()) + self.R.out[i] * out + Vector((0, -forward, up))
        if ride is not None:
            f["ride"] = ride
        if curl is not None:
            f["curl"] *= curl
        if bow is not None:
            f["bow"] = bow
        if arrive is not None:
            f["arrive"] = arrive

    def feet_all(self, **kw):
        for i in TENTACLES:
            self.foot(i, **kw)

    # -> the bases to bake
    def bases(self):
        R, skel, poses, out = self.R, self.R.skel, {}, {}

        def fk(name):
            basis = Matrix.LocRotScale(self.loc[name], self.rot[name], self.scl[name])
            poses[name] = skel.base(name, poses) @ basis
            out[name] = basis

        for name in FK:
            fk(name)
        for s, _ in SIDES:
            names = (f"arm.{s}", f"forearm.{s}", f"hand.{s}")
            for n in names:
                fk(n)
            if s in self.reaches:   # (`weight` of the way from where the angles put it to the target's)
                target, w, pole, space = self.reaches[s]
                if space:
                    target = poses[space] @ skel.rest[space].inverted() @ target
                fk_joints = [poses[n].translation.copy() for n in names]
                shoulder = fk_joints[0]
                sign = 1 if s == "R" else -1
                # (the elbow bends the way it already does: no flip as the reach eases in)
                if pole is None:   # (as it bends already; near straight, out, down and back, as an elbow hangs)
                    pole = IK.pole_from(shoulder, target, fk_joints[1], poses["chest"].to_3x3().normalized() @ V((sign, 0.5, -0.4)))
                elbow, end = IK.two_bone(shoulder, target, *R.arm[s], pole)
                shoulder, elbow, end = IK.blend(shoulder, fk_joints, [shoulder, elbow, end], R.arm[s], w)
                out[names[0]] = IK.aim(skel, names[0], poses, shoulder, elbow - shoulder)
                out[names[1]] = IK.aim(skel, names[1], poses, elbow, end - elbow)
                fk(names[2])
            if s in self.arm_ways:
                joint = poses[names[0]].translation.copy()
                for n, d, L in zip(names, self.arm_ways[s], R.arm_bones[s]):
                    out[n] = IK.aim(skel, n, poses, joint, d)
                    joint = joint + d.normalized() * L
            self.arm_dirs[s] = [poses[n].to_3x3().col[1].normalized() for n in names]
        # (how his root is moved and turned from where it rests: the root bone's own frame is not the
        # armature's, its y running up)
        root = poses["root"] @ skel.rest["root"].inverted()
        r3 = root.to_3x3().normalized()
        up = r3 @ V((0, 0, 1))
        for i in TENTACLES:
            f = self.feet[i]
            names = [f"tentacle{i}.{k}" for k in SEGMENTS]
            hip = skel.base(names[0], poses).translation.copy()
            # (riding partly: carried and turned that share of the way with his root, not drawn on a
            # straight line between where the floor holds it and where he would carry it)
            ride = Quaternion().slerp(root.to_quaternion(), f["ride"]).to_matrix()
            target = root.translation * f["ride"] + ride @ (R.home[i] + f["offset"])
            arrive = f["arrive"] if f["arrive"] is not None else ride @ R.dirs[i][REACH - 1]
            if isinstance(arrive, tuple):   # (("out", w): w of the way to straight on from his hips, flung)
                arrive = R.dirs[i][REACH - 1].lerp((target - hip).normalized(), arrive[1])
            # Laid along an arc from his hips to its contact, the slack bowing its middle up and out
            # (or along `bow`, swaying with `sway`): never a zigzag (ik.py arc); soft near full stretch.
            bow = f["bow"] if f["bow"] is not None else (r3 @ R.out[i] + up * 1.4)
            if f.get("sway"):
                bow = bow + (r3 @ R.side[i]) * (6 * f["sway"])
            # (its last bone runs into the contact along `arrive`; the rest arc from his hips to it)
            last = R.lengths[i][REACH - 1]
            goal = IK.soften(hip, target - arrive.normalized() * last, sum(R.lengths[i][:REACH - 1]), 0.92)
            joints = IK.arc(hip, goal, R.lengths[i][:REACH - 1], bow)
            joints.append(joints[-1] + (target - joints[-1]).normalized() * last)
            # (its rest sideways, turned as the tentacle now reaches, for its tip's curl)
            reach_rest = R.joints[i][REACH] - R.joints[i][0]
            swing = (r3 @ reach_rest).rotation_difference(joints[REACH] - joints[0]).to_matrix() @ r3
            # the tip curls off the contact as at rest (times its curl), turned as the tentacle arrives
            turn = IK.frame_turn(R.dirs[i][REACH - 1], joints[REACH] - joints[REACH - 1], R.side[i], swing @ R.side[i])
            d = (joints[REACH] - joints[REACH - 1]).normalized()
            for k in range(REACH, len(names)):
                d = IK.curl(d, R.dirs[i][k - 1], R.dirs[i][k], f["curl"], turn)
                joints.append(joints[-1] + d * R.lengths[i][k])
            # (the floor holds it: no joint below its own thickness)
            for k in range(1, len(joints)):
                joints[k].z = max(joints[k].z, 1.3 * TENT_RADII[k] + 0.06 + self.floor)
            out.update(IK.aim_chain(skel, names, poses, joints))
        return out


def undulate(p, t, amount=1.0, rate=0.55, rate2=None):
    """His tentacles never keep still: their tips curl and uncurl, their middles sway, out of step
    with each other (rate, rate2: waves a second of the curl and the sway; a loop needs both to fit it)."""
    if amount <= 0:
        return
    rate2 = 0.8 * rate if rate2 is None else rate2
    for i in TENTACLES:
        p.foot(i, curl=1 + 0.25 * amount * math.sin(math.tau * rate * t + i * 1.7))
        p.feet[i]["sway"] = 0.08 * amount * math.sin(math.tau * rate2 * t + i * 1.7 + 1.3)


def breathe(p, t, T):
    """Breathing, nothing of it at the clip's ends (they are the stance)."""
    b = math.sin(math.tau * t / 2.2) * clamp(min(t, T - t) / 0.4)
    p.lean(a=0.015 * b, up=0.025 * b)
    p.look(nod=-0.02 * b)


def stance(p, k=1.0):
    """How he stands (k: how much of it): hunched a little over his tentacles, head up, his arms
    hanging loose at his sides, elbows bent a little, claws curled in towards his belly, his
    tentacles where they rest, a little bent under him (not on stilts)."""
    p.tip(up=-0.15 * k)
    p.lean(a=0.12 * k)
    p.look(nod=-0.1 * k)
    p.arms(fwd=0.2 * k, out=-0.32 * k, elbow=0.55 * k, wrist=0.35 * k, twist=0.45 * k)


def vec(x, y, z):
    return Vector((x, y, z))


# --- the clips ---------------------------------------------------------------
# Each takes the pose and the time (s) and adds the clip to the stance.

def idle(p, t, T):
    # standing (render/enemies.js plays it when he stands still): breathing deep, looking about,
    # his claws flexing, his jaw working, his tentacles curling and shifting their weight
    ph = math.tau * t / T
    b = math.sin(2 * ph)
    p.lean(a=0.03 * b, up=0.05 * b, side=0.03 * math.sin(ph), twist=0.05 * math.sin(ph + 0.6))
    p.size("body", (1 + 0.025 * b, 1, 1 + 0.025 * b))
    p.look(turn=0.3 * math.sin(ph), nod=-0.04 * b + 0.06 * math.sin(2 * ph + 1), tilt=0.08 * math.sin(ph + 1.2))
    p.jaw(0.03 + 0.03 * math.sin(2 * ph + 0.5))
    # half the loop his arms hang and his claws flex; the other half he rubs his hands together
    # before his belly, looking down at them, grinning
    rub = (0.5 - 0.5 * math.cos(ph)) ** 2
    for side, sign, o in (("L", -1, 0), ("R", 1, math.pi)):
        flex = math.sin(2 * ph + o)
        p.arm(side, fwd=0.06 * b, elbow=0.12 * flex, wrist=0.2 * math.sin(2 * ph + o + 0.8), out=0.04 * math.sin(ph + o))
        circle = vec(0.05 * math.cos(6 * ph + o), 0, 0.05 * math.sin(6 * ph + o))
        p.reach(side, vec(sign * 0.15, -0.85, 2.6) + circle, rub, space="body")
    p.look(nod=0.25 * rub)
    for i in TENTACLES:
        c = math.sin(ph + i * 1.05)
        p.foot(i, curl=1 + 0.35 * c, out=0.04 * math.sin(ph + i * 2.1))
    undulate(p, t, 0.8, rate=2 / T, rate2=1 / T)


def walk(p, t, T):
    # two threes of tentacles step in turn: planted, a contact slides back under him exactly as fast
    # as he walks (no skating); lifted, it swings forward in an arc (at the loop's start both threes
    # are on the floor: render/enemies.js shows that frame when he stands still without an idle)
    duty = 0.55
    stride = WALK_SPEED * duty * T
    ph = t / T
    for i in TENTACLES:
        along, lift = IK.step(ph + (0.0 if i in (1, 3, 5) else 0.5), duty, stride, 0.45)
        p.foot(i, forward=along, up=lift, curl=1 + 0.6 * lift)
    w = math.tau * ph
    p.tip(up=-0.3 + 0.06 * math.cos(2 * w))   # (down low, bobbing: slack in his tentacles for their steps)
    p.lean(a=0.06, side=0.05 * math.sin(w), twist=0.07 * math.sin(w))
    p.look(nod=-0.03 * math.cos(2 * w), turn=-0.05 * math.sin(w), tilt=-0.04 * math.sin(w))
    for side, s in (("L", 1), ("R", -1)):
        swing = 0.45 * math.sin(w + (0 if side == "L" else math.pi))
        p.arm(side, fwd=swing, out=0.1 + 0.08 * math.cos(w), elbow=0.25 + 0.25 * math.sin(w + s - 0.6), wrist=0.2 * math.sin(w + 1))


def whip(p, t, T):
    # tentacle 1 (front, on his .L side) coils up beside him and lashes across his front at the hit
    # (1.05 s): its contact flies along this path, the rest of it trailing
    hit = 1.05
    path = [(0, vec(0, 0, 0)), (0.6, vec(-0.4, 1.0, 2.6)), (0.85, vec(-0.5, 1.2, 2.8)),
            (hit - 0.08, vec(-1.6, -0.9, 1.7), "in"), (hit, vec(0.2, -2.0, 1.4), "linear"),
            (hit + 0.15, vec(1.9, -0.6, 1.2), "out"), (1.45, vec(1.2, 0.0, 0.9)), (T, vec(0, 0, 0))]
    at = curve(t, path)
    flying = curve(t, [(0, 0), (0.3, 1), (1.5, 1), (T, 0)])
    p.foot(1, offset=at, curl=curve(t, [(0, 1), (0.6, 2.2), (0.85, 2.4), (hit, 0.2, "in"), (1.4, 0.8), (T, 1)]),
           arrive=("out", flying))
    tw = curve(t, [(0, 0), (0.7, 0.4), (hit - 0.05, -0.3, "in"), (1.3, -0.35), (T, 0)])
    p.lean(twist=tw, side=curve(t, [(0, 0), (0.7, -0.12), (hit, 0.1, "in"), (T, 0)]),
           a=curve(t, [(0, 0), (0.7, -0.1), (hit, 0.2, "in"), (T, 0)]))
    p.look(turn=-0.6 * tw, nod=curve(t, [(0, 0), (0.7, -0.15), (hit, 0.1), (T, 0)]))
    p.jaw(curve(t, [(0, 0), (0.85, 0.1), (hit, 0.3, "in"), (1.4, 0.05), (T, 0)]))
    # his arm on that side throws the lash along with it; the other flies out for balance
    p.arm("L", out=curve(t, [(0, 0), (0.7, 0.9), (hit, -0.5, "in"), (1.35, -0.6), (T, 0)]),
          fwd=curve(t, [(0, 0), (0.7, -0.7), (hit, 1.3, "in"), (1.35, 1.1), (T, 0)]),
          elbow=curve(t, [(0, 0), (0.7, 0.9), (hit, -0.3, "in"), (T, 0)]))
    p.arm("R", out=curve(t, [(0, 0), (0.7, 0.3), (hit, 1.1, "in"), (1.4, 0.9), (T, 0)]),
          fwd=curve(t, [(0, 0), (0.7, 0.6), (hit, -0.4, "in"), (T, 0)]), elbow=curve(t, [(0, 0), (hit, -0.3), (T, 0)]))
    for i in (2, 5, 6):   # bracing: out wide
        p.foot(i, out=curve(t, [(0, 0), (0.5, 0.2), (T, 0)]))
    undulate(p, t)


def grab(p, t, T):
    # he leans in and his right hand reaches the catch (its wrist along this path), lifts it up high
    # before him and shakes it, and slams it down at the throw
    hit, throw = GRAB_HIT / FPS, GRAB_THROW / FPS
    jig = shake(t, 5, 0.1) * curve(t, [(hit + 0.35, 0), (hit + 0.45, 1), (throw - 0.2, 1), (throw - 0.1, 0)])
    p.lean(a=curve(t, [(0, 0), (0.3, -0.15), (hit, 0.45, "in"), (hit + 0.4, 0.05), (throw - 0.12, 0.0), (throw, 0.45, "in"), (T, 0)]),
           twist=curve(t, [(0, 0), (0.3, -0.25), (hit, 0.15, "in"), (hit + 0.4, 0.2), (throw, 0.1), (T, 0)]),
           up=curve(t, [(0, 0), (hit + 0.4, 0.15), (throw - 0.1, 0.2), (throw, -0.2, "in"), (T, 0)]))
    p.look(nod=curve(t, [(0, 0), (0.3, -0.1), (hit, 0.1), (hit + 0.4, -0.3), (throw, 0.25), (T, 0)]),
           turn=curve(t, [(0, 0), (hit, 0), (hit + 0.4, -0.35), (throw - 0.1, -0.3), (throw, 0), (T, 0)]))
    p.jaw(curve(t, [(0, 0), (hit, 0.1), (hit + 0.4, 0.35), (throw - 0.1, 0.3), (throw, 0.15), (T, 0)]))
    p.arm("R", fwd=curve(t, [(0, 0), (0.3, -0.5), (0.55, 0.4)]), elbow=curve(t, [(0, 0), (0.3, 0.9), (0.55, 0.3)]))
    wrist = curve(t, [(0.45, vec(1.0, -1.0, 2.6)), (hit, vec(0.7, -2.15, 2.6), "in"), (hit + 0.4, vec(1.05, -1.45, 3.85)),
                      (throw - 0.1, vec(1.05, -1.4, 4.0)), (throw, vec(1.05, -1.75, 2.0), "in"), (throw + 0.15, vec(1.0, -1.6, 2.1))])
    held = curve(t, [(0.3, 0), (0.6, 1), (throw + 0.1, 1), (T, 0)])
    p.reach("R", wrist + vec(0, 0, jig), held)
    p.loose["R"] = 1 - held   # (his catch exactly where the game holds it: the grip)
    p.arm("L", fwd=curve(t, [(0, 0), (0.3, 0.3), (hit, -0.3), (hit + 0.4, 0.5), (throw, -0.2), (T, 0)]),
          out=curve(t, [(0, 0), (hit, 0.5), (throw, 0.6), (T, 0)]), elbow=curve(t, [(0, 0), (hit + 0.4, 0.5), (T, 0)]))
    for i in FRONT:   # bracing
        p.foot(i, forward=curve(t, [(0, 0), (hit, 0.3), (throw, 0.35), (T, 0)]))
    undulate(p, t)


def double_slam(p, t, T):
    # he rears up, both front tentacles raised high before him and his arms over his head, and brings
    # them all down together at the hit (1.2 s), the tentacles slapping the floor far out in front
    hit = 1.2
    up = curve(t, [(0, 0), (0.85, 1, "out"), (0.98, 1.05), (hit, 0, "in"), (1.45, -0.05), (T, 0)])
    down = curve(t, [(0, 0), (0.98, 0), (hit, 1, "in"), (1.5, 1), (T, 0)])
    p.tip(a=-0.1 * up + 0.12 * down)
    p.lean(a=-0.2 * up + 0.45 * down, up=0.3 * up - 0.25 * down)
    p.size("body", (1 + 0.08 * down, 1 - 0.08 * down, 1 + 0.08 * down))
    p.look(nod=-0.35 * up + 0.3 * down)
    p.jaw(0.25 * up + 0.35 * down * (1 - curve(t, [(1.5, 0), (T, 1)])))
    p.arms(fwd=2.5 * up + 0.8 * down, out=0.25 * up, elbow=0.4 * up - 0.4 * down, wrist=0.3 * down)
    for i in FRONT:
        x = R_SIGN[i] * 0.55
        at = curve(t, [(0, vec(0, 0, 0)), (0.85, vec(x, -0.9, 3.3) - HOME[i], "out"), (0.98, vec(x, -0.8, 3.5) - HOME[i]),
                       (hit, vec(x * 1.1, -1.75, 0.15) - HOME[i], "in"), (1.5, vec(x * 1.1, -1.7, 0.15) - HOME[i]), (T, vec(0, 0, 0))])
        way = p.R.dirs[i][REACH - 1].lerp(V((0, 0.3, 1)), clamp(up)).lerp(V((0, -1, -0.3)), clamp(down))
        p.foot(i, offset=at, curl=curve(t, [(0, 1), (0.9, 1.8), (hit, 0.3, "in"), (1.5, 0.5), (T, 1)]), arrive=way.normalized())
    for i in FLANK + BACK:   # braced wide
        p.foot(i, out=0.25 * down + 0.1 * up)
    undulate(p, t, 0.6)


def water_jet(p, t, T):
    # he swells, breathing in, then blasts the jet from his open mouth (from the hit, 1.2 s, to 2.3 s),
    # shaking with it, braced against its push
    hit, end = 1.2, 2.3
    breath = curve(t, [(0, 0), (1.0, 1, "out"), (hit, 0, "in"), (T, 0)])
    jet = curve(t, [(1.0, 0), (hit, 1, "in"), (end, 1), (end + 0.4, 0)])
    buzz = jet * shake(t, 11, 1)
    p.size("body", 1 + 0.12 * breath)
    p.size("head", 1 / (1 + 0.12 * breath))
    for b in ("arm.L", "arm.R"):
        p.size(b, 1 / (1 + 0.12 * breath))
    p.lean(a=-0.3 * breath + 0.25 * jet + 0.03 * buzz, back=0.12 * jet, up=0.1 * breath)
    p.look(nod=-0.5 * breath + 0.3 * jet + 0.04 * buzz, tilt=0.03 * buzz)
    p.jaw(0.1 * breath + 0.45 * jet + 0.03 * buzz)
    p.arms(out=0.9 * jet, fwd=-0.5 * jet, elbow=0.3 * jet, wrist=-0.4 * jet)   # (blasting: flung back, braced)
    for side, sign in SIDES:   # breathing in, his hands cupped at the corners of his mouth
        p.reach(side, vec(sign * 0.6, -0.75, 3.8), curve(t, [(0.15, 0), (0.7, 1), (1.05, 1), (1.25, 0)]), space="head")
    for i in TENTACLES:   # braced against the push: the front ones forward, the rest out
        p.foot(i, forward=0.35 * jet if i in FRONT else -0.15 * jet, out=0.2 * jet + 0.1 * breath)
    undulate(p, t, 1 - 0.5 * jet)


def dive(p, t, T):
    # crouches (his tentacles bunch under him), leaps head first, tucked (the game carries him
    # forward), lands on his belly at the hit (1.5 s) with his tentacles stretched out behind, gets up
    hit = 1.5
    crouch = curve(t, [(0, 0), (0.75, 1, "out"), (0.85, 0.8), (1.0, 0)])
    air = curve(t, [(0.8, 0), (1.12, 1, "out"), (1.42, 0, "in")])   # height
    over = curve(t, [(0.8, 0), (1.1, 1.0), (hit, 1.35, "in"), (1.9, 1.3), (2.6, 0)])   # head first
    land = curve(t, [(1.4, 0), (hit, 1, "in"), (1.7, 0.8), (2.2, 0)])
    tuck = curve(t, [(0.72, 0), (1.0, 1), (1.3, 1), (1.55, 0)])
    p.tip(a=0.15 * crouch + over, up=1.4 * air - 0.35 * crouch)
    p.lean(a=0.3 * crouch - 0.1 * air, up=-0.2 * land)
    p.size("body", (1 + 0.1 * land, 1 - 0.1 * land, 1 + 0.1 * land))
    p.look(nod=-0.3 * crouch - 0.6 * curve(t, [(0.8, 0), (1.1, 1), (1.5, 0.6), (2.4, 0)]))
    p.jaw(0.3 * curve(t, [(0.9, 0), (1.2, 1), (1.6, 0)]))
    p.arms(fwd=-0.7 * crouch + 2.6 * curve(t, [(0.8, 0), (1.1, 1, "out"), (1.45, 0.45), (2.4, 0)]),
           out=0.3 * crouch + 0.5 * land, elbow=0.4 * crouch - 0.6 * air)
    for side, sign in SIDES:   # landing on his hands, pushing himself back up off them
        plant = curve(t, [(1.35, 0), (1.5, 1, "in"), (2.1, 1), (2.45, 0)])
        p.reach(side, vec(sign * 1.15, -3.3, 0.5), plant)
        p.loose[side] = 1 - plant
    for i in TENTACLES:
        p.foot(i, out=-0.35 * crouch - 0.3 * tuck, up=0.2 * tuck, ride=tuck, curl=1 + crouch - 0.6 * tuck)
    undulate(p, t, 1 - 0.6 * curve(t, [(0.8, 0), (1.0, 1), (1.6, 1), (2.0, 0)]))


def ink_burst(p, t, T):
    # rears back, cheeks full, and spits at the hit (1.3 s), his jaw snapping open
    hit = 1.3
    back = curve(t, [(0.3, 0), (1.18, 1, "out"), (hit, 0, "in"), (T, 0)])
    spit = curve(t, [(1.18, 0), (hit, 1, "in"), (1.6, 0.8), (T, 0)])
    p.size("head", 1 + 0.1 * back - 0.04 * spit)
    p.lean(a=-0.3 * back + 0.3 * spit, up=0.1 * back)
    p.look(nod=-0.55 * back + 0.4 * spit + shake(t, 9, 0.03) * back)
    p.jaw(0.5 * spit)
    flung = curve(t, [(1.1, 0), (1.45, 1), (1.7, 0.8), (T, 0)])   # (his arms a beat slower than his head)
    p.arms(fwd=-0.5 * flung, out=0.9 * flung, elbow=-0.2 * flung)
    for side, sign in SIDES:   # rearing back, clutching his swollen belly
        p.reach(side, vec(sign * 0.3, -0.62, 2.5), curve(t, [(0.3, 0), (0.8, 1), (1.15, 1), (1.35, 0)]), space="body")
    for i in TENTACLES:
        p.foot(i, out=0.15 * spit, curl=1 + 0.4 * back)
    undulate(p, t)


def tail_spin(p, t, T):
    # winds round, then spins once all the way round, low, his tentacles flung out flat and
    # trailing the turn, and settles (he ends where he began: once round)
    hit = 1.3
    wind = curve(t, [(0, 0), (0.7, 1, "out")])
    turn = curve(t, [(0.8, 0), (1.65, 1, "smooth")])
    speed = curve(t, [(0.85, 0), (1.15, 1), (1.45, 1), (1.75, 0)])
    p.tip(spin=-0.9 * wind + (math.tau + 0.9) * turn, up=-0.75 * speed)   # (down low: his flung tentacles skim the floor)
    p.lean(up=-0.3 * wind * (1 - turn) + 0.1 * speed, a=0.2 * wind * (1 - turn))
    p.look(turn=0.4 * wind * (1 - turn) - 0.3 * speed)
    p.jaw(0.3 * speed)
    p.arms(out=1.1 * speed + 0.2 * wind * (1 - turn), fwd=-0.5 * wind * (1 - turn) + 0.2 * speed, elbow=-0.4 * speed)
    for i in TENTACLES:   # (riding the spin, out wide and up off the floor, trailing it)
        p.foot(i, out=1.0 * speed - 0.2 * wind * (1 - turn), up=1.4 * speed, offset=p.R.side[i] * (0.7 * speed),
               ride=speed, curl=1 - 0.6 * speed)
    undulate(p, t, 1 - 0.6 * speed)


def undertow(p, t, T):
    # reaches out wide, then hauls: arms sweep in and his front tentacles drag back along the floor,
    # lift, reach out again (twice, from the hit, 1 s, to 2.3 s)
    hit, end = 1.0, 2.3
    reach = curve(t, [(0, 0), (0.85, 1, "out"), (end, 1), (end + 0.5, 0)])
    haul = 0.5 - 0.5 * math.cos(math.tau * 2 * clamp((t - hit) / (end - hit))) if hit < t < end else 0   # (twice: done at its end)
    p.lean(a=0.35 * reach - 0.35 * haul, back=0.15 * haul, side=0.05 * math.sin(math.tau * 1.25 * t) * reach)
    p.look(nod=0.15 * reach - 0.2 * haul)
    p.jaw(0.15 * reach)
    p.arms(fwd=1.3 * reach, out=0.7 * reach, elbow=0.1 * reach)
    # hauling hand over hand, as on a rope: one hand reaches out and grips while the other pulls
    # back to his hip, then the other way round
    hauling = curve(t, [(hit - 0.15, 0), (hit + 0.1, 1), (end - 0.1, 1), (end + 0.25, 0)])
    for side, sign, o in (("L", -1, 0.0), ("R", 1, 0.5)):
        u = (2 * (t - hit) / (end - hit) + o) % 1
        pull = 0.5 - 0.5 * math.cos(math.pi * min(1.0, u / 0.55)) if u < 0.55 else 0.5 + 0.5 * math.cos(math.pi * (u - 0.55) / 0.45)
        far, near = vec(sign * 0.5, -1.2, 2.75), vec(sign * 0.8, -0.35, 2.35)
        p.reach(side, far.lerp(near, pull) + vec(0, 0, 0.25 * math.sin(math.pi * u) * (u >= 0.55)), hauling, space="chest")
    for i in FRONT + FLANK:
        if hit < t < end:
            along, lift = IK.step(2 * (t - hit) / (end - hit), 0.6, 1.1, 0.35)
        else:
            along, lift = 0.55, 0.0
        p.foot(i, forward=reach * (0.45 + along), up=lift, curl=1 + lift)
    for i in BACK:
        p.foot(i, forward=-0.2 * reach)
    undulate(p, t)


def spike_volley(p, t, T):
    # hunches, arches back (bristling) and flings his head forward at the hit (1.2 s): the spines fly
    hit = 1.2
    hunch = curve(t, [(0, 0), (0.45, 1, "out"), (0.6, 0.6), (1.0, 0)])
    arch = curve(t, [(0.45, 0), (1.05, 1, "out"), (hit, 0, "in"), (T, 0)])
    fling = curve(t, [(1.05, 0), (hit, 1, "in"), (1.55, 0.7), (T, 0)])
    bristle = shake(t, 14, 0.04) * arch
    p.lean(a=0.45 * hunch - 0.4 * arch + 0.5 * fling + bristle, up=-0.15 * hunch + 0.15 * arch)
    p.size("body", (1, 1 + 0.06 * arch, 1))
    p.look(nod=0.45 * hunch - 0.45 * arch + 0.45 * fling + bristle)
    p.jaw(0.25 * arch + 0.2 * fling)
    p.arms(fwd=-0.3 * hunch - 0.5 * arch + 0.6 * fling, out=0.2 * hunch + 0.6 * arch, elbow=0.8 * hunch + 0.3 * arch)
    for i in TENTACLES:
        p.foot(i, out=0.15 * fling - 0.1 * hunch, curl=1 + 0.5 * hunch)
    undulate(p, t)


def tidal_surge(p, t, T):
    # raises his arms and his front tentacles high, calling the water, crashes them down at the hit
    # (1.7 s), the tentacles slapping the floor far ahead, and pushes the wave on
    hit = 1.7
    call = curve(t, [(0, 0), (1.35, 1, "out"), (1.45, 1.05), (hit, 0, "in")])
    crash = curve(t, [(1.45, 0), (hit, 1, "in"), (2.5, 0.85), (T, 0)])
    tremble = shake(t, 12, 0.04) * call
    p.tip(a=-0.12 * call + 0.12 * crash)
    p.lean(a=-0.25 * call + 0.45 * crash + tremble, up=0.3 * call - 0.2 * crash)
    p.look(nod=-0.5 * call + 0.2 * crash)
    p.jaw(0.3 * call + 0.25 * crash)
    p.arms(fwd=2.8 * call + 1.15 * crash + tremble, out=0.35 * call - 0.1 * crash, elbow=0.2 * call - 0.5 * crash, wrist=0.5 * crash)
    for i in TENTACLES:
        if i in FRONT:
            x = R_SIGN[i] * 0.7
            at = curve(t, [(0, vec(0, 0, 0)), (1.35, vec(x, -1.0, 3.1) - HOME[i], "out"), (1.45, vec(x, -0.9, 3.25) - HOME[i]),
                           (hit, vec(x * 1.1, -1.8, 0.15) - HOME[i], "in"), (2.5, vec(x * 1.1, -1.75, 0.15) - HOME[i]), (T, vec(0, 0, 0))])
            way = p.R.dirs[i][REACH - 1].lerp(V((0, -0.2, 1)), clamp(call)).lerp(V((0, -1, -0.2)), clamp(crash))
            p.foot(i, offset=at + vec(0, 0, tremble), curl=1 + 0.8 * call - 0.6 * crash, arrive=way.normalized())
        else:
            p.foot(i, out=0.25 * crash, forward=-0.15 * crash)
    undulate(p, t, 1 + call)


def belly_flop(p, t, T):
    # blows himself up, crouches, jumps, flops onto his belly at the hit (2.3 s), lies there dazed (the
    # game: exposed), his tentacles flat out behind him, and pushes himself up on his hands
    hit = 2.3
    puff = curve(t, [(0, 0), (1.0, 1, "out"), (hit, 1), (2.6, 0.6), (3.4, 0)])
    crouch = curve(t, [(0.95, 0), (1.25, 1, "out"), (1.38, 0, "in")])
    air = curve(t, [(1.3, 0), (1.85, 1, "out"), (hit, 0, "in")])
    over = curve(t, [(1.35, 0), (2.15, 1.45), (hit, 1.55, "in"), (3.7, 1.5), (4.3, 0)])
    splat = curve(t, [(2.2, 0), (hit, 1, "in"), (2.45, 0.5), (2.6, 0.7), (3.0, 0)])
    lie = curve(t, [(2.3, 0), (2.5, 1), (3.7, 1), (4.1, 0)])
    getup = curve(t, [(3.6, 0), (3.95, 1), (4.5, 0)])
    tuck = curve(t, [(1.25, 0), (1.55, 1), (2.05, 1), (2.4, 0)])
    s = 1 + 0.4 * puff
    p.size("body", (s * (1 + 0.15 * splat), s * (1 - 0.2 * splat), s * (1 + 0.15 * splat)))
    p.size("head", 1 / s)
    for b in ("arm.L", "arm.R"):
        p.size(b, 1 / s)
    p.tip(a=over, up=1.9 * air - 0.3 * crouch)
    p.lean(a=0.2 * crouch - 0.1 * air - 0.15 * getup, up=-0.1 * puff)
    dazed = lie * shake(t, 1.3, 0.25)
    p.look(nod=-0.3 * puff - 0.6 * lie + 0.2 * getup, turn=dazed, tilt=0.6 * dazed)
    p.jaw(0.15 * puff * (1 - lie) + 0.35 * splat + 0.2 * lie)
    p.arms(out=0.9 * puff + 0.5 * lie, fwd=-0.3 * puff + 1.2 * curve(t, [(1.4, 0), (2.1, 1), (hit, 0.3), (3.7, 0.3), (3.9, 1.6), (4.5, 0)]),
           elbow=0.5 * crouch - 0.5 * lie + 0.4 * getup)
    for side, sign in SIDES:   # pushing himself up off the floor
        plant = curve(t, [(3.55, 0), (3.8, 1), (4.05, 1), (4.35, 0)])
        p.reach(side, vec(sign * 1.1, -3.0, 0.5), plant)
        p.loose[side] = 1 - plant
    for i in TENTACLES:   # (out wide puffed up; tucked in the air; flat out behind him lying)
        p.foot(i, out=0.35 * puff - 0.3 * tuck + 0.3 * lie, up=0.2 * tuck, ride=tuck, forward=-0.5 * lie,
               curl=1 + 0.8 * crouch - 0.7 * lie)
    undulate(p, t, 1 - 0.6 * lie)


def rage(p, t, T):
    # changing phase: clenches, bursts up with his arms wide, roaring, shaking, his tentacles slapping
    # the floor, and settles at the hit (2 s)
    hit = 2.0
    clench = curve(t, [(0, 0), (0.5, 1, "out"), (0.62, 0, "in")])
    roar = curve(t, [(0.5, 0), (0.85, 1, "out"), (hit, 1), (T, 0)])
    quake = shake(t, 16, 0.05) * curve(t, [(0.7, 0), (0.85, 1), (hit, 1), (2.2, 0)])
    p.lean(a=0.35 * clench - 0.3 * roar + quake, up=-0.35 * clench + 0.25 * roar, side=quake)
    p.look(nod=0.4 * clench - 0.6 * roar + quake, tilt=0.5 * quake)
    p.jaw(0.55 * roar + 0.5 * quake)
    p.arms(out=-0.3 * clench + 1.4 * roar, fwd=0.6 * clench + 0.9 * roar + 2 * quake, elbow=1.5 * clench - 0.3 * roar, wrist=0.6 * roar)
    # bursting up he beats his chest, fist after fist, before he flings his arms wide
    beating = curve(t, [(0.45, 0), (0.6, 1), (1.25, 1), (1.45, 0)])
    for side, sign, o in (("L", -1, 0.0), ("R", 1, math.pi)):
        knock = 0.5 + 0.5 * math.cos(math.tau * 3.2 * t + o)
        p.reach(side, vec(sign * 0.3, -0.7 - 0.35 * knock, 2.95 + 0.1 * knock), beating, space="chest")
    for i in TENTACLES:
        slap = roar * (0.5 + 0.5 * math.sin(math.tau * 1.6 * t + i * 2.0)) ** 2
        p.foot(i, up=0.6 * slap, out=0.25 * roar - 0.15 * clench, curl=1 + clench + slap)
    undulate(p, t, 1 + roar)


def death(p, t, T):
    # struck, he reels back; his tentacles buckle and slide out flat round him as he sinks onto them,
    # slumping forward and over to his side; held
    hit = curve(t, [(0, 0), (0.18, 1, "out"), (0.6, 0.3), (1.0, 0)])
    buckle = curve(t, [(0.35, 0), (1.3, 1, "in"), (1.45, 0.95), (1.6, 1)])
    slump = curve(t, [(0.9, 0), (1.9, 1, "in"), (2.05, 0.93), (2.2, 1)])
    sway = math.sin(math.tau * 1.1 * t) * curve(t, [(0.25, 0), (0.6, 1), (1.4, 0)])
    p.tip(side=0.04 * sway, up=-1.2 * buckle)   # (all of him sinks: his tentacles slide out flat)
    p.lean(a=-0.35 * hit + 1.25 * slump, side=0.12 * sway + 0.3 * slump)
    p.look(nod=-0.5 * hit + 0.5 * slump, tilt=0.5 * slump, turn=0.2 * sway - 0.3 * slump)
    p.jaw(0.15 * hit + 0.3 * slump)
    p.arms(fwd=0.9 * hit - 0.5 * buckle, out=0.5 * hit + 0.5 * buckle, elbow=-0.4 * hit - 0.6 * buckle, wrist=-0.3 * slump)
    for side, sign in SIDES:   # struck, clutching his chest, then his arms go limp (and still: a corpse)
        p.reach(side, vec(sign * 0.25, -0.65, 2.95), curve(t, [(0.05, 0), (0.3, 1), (0.75, 1), (1.2, 0)]), space="chest")
        p.loose[side] = curve(t, [(1.9, 1), (2.3, 0)])
    for i in TENTACLES:
        p.foot(i, out=0.95 * buckle, curl=1 - 0.8 * buckle, bow=p.R.out[i] + V((0, 0, 1.6 - 1.3 * buckle)))
    undulate(p, t, 1 - buckle)


# name -> (pose function, frames, loop, extras); the attacks' lengths are core/enemies.js QUALMOS's
CLIPS = {
    "QualmosWalk": (walk, 40, True, {"speed": WALK_SPEED}),
    "QualmosIdle": (idle, 90, True, {}),
    "QualmosWhip": (whip, 54, False, {}),
    "QualmosGrab": (grab, 66, False, {}),
    "QualmosDoubleSlam": (double_slam, 66, False, {}),
    "QualmosWaterJet": (water_jet, 96, False, {}),
    "QualmosDive": (dive, 84, False, {}),
    "QualmosInkBurst": (ink_burst, 72, False, {}),
    "QualmosTailSpin": (tail_spin, 72, False, {}),
    "QualmosUndertow": (undertow, 90, False, {}),
    "QualmosSpikeVolley": (spike_volley, 84, False, {}),
    "QualmosTidalSurge": (tidal_surge, 96, False, {}),
    "QualmosBellyFlop": (belly_flop, 135, False, {}),
    "QualmosRage": (rage, 75, False, {}),
    "QualmosDeath": (death, 75, False, {"hold_last_frame": True}),
}
DEATH_SETTLE = 57   # from this frame on his corpse lies on the floor
HOME = {i: tent_point(i, REACH) for i in TENTACLES}                      # the contacts at rest
R_SIGN = {i: math.copysign(1, tent_point(i, REACH).x) for i in TENTACLES}


# His arms have weight: each of their bones turns after the way the clip points it on a damped
# spring (`freq` swings a second, `damping` of the critical), so they lag when he lurches, swing on
# after he stops and overshoot a fast blow a little (follow-through); the hand trails the forearm,
# the forearm the arm. `loose` 0 holds an arm exactly as the clip says (a precise reach).
ARM_SPRING = {"freq": 2.6, "damping": 0.45}


def spring(targets, loop, freq, damping, substeps=4):
    """Directions trailing `targets` (one a frame) on a damped spring, starting at rest on the
    first; a loop is run three times round and its last round kept, eased onto its start at the seam."""
    w = math.tau * freq
    k, c, h = w * w, 2 * damping * w, 1 / (FPS * substeps)
    x, v, out = targets[0].copy(), Vector(), []
    for _ in range(3 if loop else 1):
        out = []
        for f in range(len(targets)):
            a, b = targets[f], targets[min(f + 1, len(targets) - 1)]
            out.append(x.normalized())
            for i in range(substeps):
                v += ((a.lerp(b, i / substeps) - x) * k - v * c) * h
                x += v * h
    if loop:   # (the last frame is the first)
        miss = out[-1] - out[0]
        out = [(p - miss * (f / (len(out) - 1))).normalized() for f, p in enumerate(out)]
    return out


def solver(R, name):
    """solve(frame, lift) -> the bases of clip `name` at that frame (creature.py ground_clip). Two
    passes: the clip as keyed, for the ways it points his arms; then with his arms on their springs."""
    fn, n, loop, _ = CLIPS[name]
    T = n / FPS

    def keyed(f):
        p = Pose(R)
        t = f / FPS
        stance(p)
        if not loop and fn is not death:   # (a corpse lies still)
            breathe(p, t, T)
        fn(p, t, T)
        return p

    first = [keyed(f) for f in range(n + 1)]
    for p in first:
        p.bases()
    sprung = {s: [spring([p.arm_dirs[s][k] for p in first], loop, freq=ARM_SPRING["freq"] * (1 - 0.15 * k),
                         damping=ARM_SPRING["damping"]) for k in range(3)] for s, _ in SIDES}

    def solve(f, lift):
        p = keyed(f)
        for s, _ in SIDES:   # (the arm on its springs, as loose as the clip lets it be)
            w = first[f].loose[s]
            if w > 0:
                p.arm_ways[s] = [first[f].arm_dirs[s][k].slerp(sprung[s][k][f], w) for k in range(3)]
        p.move("root", (0, 0, lift))
        for foot in p.feet.values():   # (kept off the floor: all of him, his contacts and his reaches too)
            foot["offset"].z += lift * (1 - foot["ride"])
        p.reaches = {s: (target + V((0, 0, 0 if space else lift)), w, pole, space) for s, (target, w, pole, space) in p.reaches.items()}
        p.floor = lift
        return p.bases()
    return solve


def animate(rig, obj):
    R = Rig(rig)
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for name, (fn, n, loop, extras) in CLIPS.items():
        K.ground_clip(rig, obj, name, solver(R, name), n, cyclic=loop, extras=extras,
                      settle_from=DEATH_SETTLE if name == "QualmosDeath" else None)


def check_walk(rig, tolerance=0.03):
    """His walk does not skate: every planted contact slides back under him exactly as fast as he
    walks, on the floor (ik.py step). -> the worst miss (rig units)."""
    act = bpy.data.actions["QualmosWalk"]
    rig.animation_data.action = act
    n, T = int(act.frame_end), act.frame_end / FPS
    duty = 0.55
    worst = 0.0
    tips = {}
    for f in range(n + 1):
        bpy.context.scene.frame_set(f)
        for i in TENTACLES:
            tips.setdefault(i, []).append(rig.matrix_world @ rig.pose.bones[f"tentacle{i}.{REACH - 1}"].tail)
    for i in TENTACLES:
        for f in range(n):
            ph = (f / n + (0.0 if i in (1, 3, 5) else 0.5)) % 1
            if ph + 1 / n >= duty:
                continue
            v = (tips[i][f + 1] - tips[i][f]) * FPS
            worst = max(worst, abs(v.y - WALK_SPEED) / FPS, abs(v.x) / FPS, abs(tips[i][f].z - HOME[i].z))
    rig.animation_data.action = None
    assert worst < tolerance, ("QualmosWalk skates", worst)
    return round(worst, 4)


# --- what the game reads off him -------------------------------------------
def game(v):
    return [round(v.x * GAME_SCALE, 3), round(v.z * GAME_SCALE, 3), round(-v.y * GAME_SCALE, 3)]


def bone_point(rig, clip, frame, bone, rest_point):
    """Where a point of a bone (given at rest, armature space) is at a frame of a clip."""
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ pb.matrix @ rig.data.bones[bone].matrix_local.inverted() @ rest_point


def points(rig):
    """The grab's grip (his right hand, every second frame from the catch to the throw) and the
    muzzles (his mouth as the jet starts and as he spits, the top of his head as the spines fly),
    put on the clips (extras) and returned."""
    act = bpy.data.actions["QualmosGrab"]
    hand = rig.data.bones["hand.R"]
    act["grip"] = [game(bone_point(rig, "QualmosGrab", f, "hand.R", hand.tail_local)) for f in range(GRAB_HIT, GRAB_THROW + 1, 2)]
    act["hit_frame"], act["throw_frame"] = GRAB_HIT, GRAB_THROW
    out = {"grip": [list(v) for v in act["grip"]]}
    for clip, frame, point, key in (("QualmosWaterJet", 36, MOUTH, "jet"), ("QualmosInkBurst", 39, MOUTH, "ink"),
                                    ("QualmosSpikeVolley", 36, CROWN, "spines")):
        bpy.data.actions[clip]["muzzle"] = out[key] = game(bone_point(rig, clip, frame, "head", point))
    rig.animation_data.action = None
    return out




# --- previews -------------------------------------------------------------------
def preview(scene, rig, path):
    far, target = (5.5, -7.0, 4.4), (0, 0, 2.3)
    shots = [("QualmosIdle", 0, far), ("QualmosWhip", 32, far), ("QualmosGrab", 45, far), ("QualmosDoubleSlam", 24, far),
             ("QualmosTailSpin", 40, far), ("QualmosSpikeVolley", 30, far), ("QualmosBellyFlop", 80, far), ("QualmosDeath", 75, far)]
    K.contact_sheet(scene, rig, shots, path, target, size=360, cols=4)


def videos(scene, rig, out_dir):
    """Every clip as a video, from the front and from his side (creature.py clip_videos)."""
    views = [((5.5, -9.0, 4.4), 7.5), ((10.0, 0.0, 3.0), 7.5)]
    return K.clip_videos(scene, rig, tuple(CLIPS), out_dir, (0, -0.5, 2.0), views)


def main(export_path=None, blend_path=None, preview_path=None, video_dir=None):
    scene, rig, obj = build()
    animate(rig, obj)
    report = K.validate(rig, obj, tuple(CLIPS), held=("QualmosDeath",))
    report["walk_skate"] = check_walk(rig)
    report.update(points(rig))
    K.register(rig, tuple(CLIPS))   # (what the exporter takes: one muted NLA track a clip)
    K.setup_stage(scene, "Qualmos", STAGE, (0, 0, 2.4), 6.5, camera=(5.5, -9.0, 5.0))
    rig.animation_data.action = bpy.data.actions["QualmosIdle"]
    scene.frame_start, scene.frame_end = 0, CLIPS["QualmosIdle"][1]
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), tuple(CLIPS), "Qualmos", NAME, (0, 0, 2.4), 9.0)
    if preview_path:
        preview(scene, rig, preview_path)
    if video_dir:
        report["videos"] = videos(scene, rig, video_dir)
    obj.data.calc_loop_triangles()
    report["triangles"] = len(obj.data.loop_triangles)
    print("Qualmos:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "qualmos.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "qualmos.blend"),
         preview_path=args[2] if len(args) > 2 else None, video_dir=args[3] if len(args) > 3 else None)
