"""
Woppylava: a walking volcano, from the kids' drawing.

He walks on seven stubby, curvy legs of dark stone set round under a dark stone rim (the heavily
scribbled band of the drawing). Above the rim his body is a volcano: a cone of grey-brown basalt
whose sides are lumpy stone waves, glowing cracks here and there and lava running down from the
lip, with an open crater on top full of glowing lava. Out of the crater sprays a plume of lava, a
fan of glowing streaks. His arms are lava: two thick, drippy, glowing streams that burst sideways
out of the stone and end in big hands. His face floats freely above the plume, not attached to
him: a broad, pale mask of ash-stone with a big angry V of a brow, two small glowing eyes and a
wide grin, lava glowing inside it. Faces -Y in Blender, +Z up; one unit = one game cell. About 2.5
cells to the crater's lip, 4.2 to the top of his face; his feet stand round in about 1.3 cells.

Rig: root; body (the rim, and all that walks with it), cone (the volcano on it, a leaf: squashed
and stretched in the clips), plume (the lava fountain, its scale its size: small at rest, huge in
the eruption, 0 when he dies), leg.0 .. leg.6 / leg.<i>.lower (IK; leg.0 in front, then round
over his left: leg.1 .. leg.3 on his left, leg.4 .. leg.6 on his right; foot.<i>: the foot, kept
flat), arm.L.0 .. arm.L.3 /
hand.L and arm.R.0 .. arm.R.3 / hand.R (the lava arms, out of the cone's sides; the bones may move
apart along the arm: it stretches); face (on the root: it floats), jaw (its lower part, hinged at
the back: the roar) and mouth (the glow in the grin, scaled open with the jaw).

Clips, 30 fps, in place (the game supplies root motion):
    WoppylavaWalk     40-frame loop: the seven legs ripple front to back, a side half a step
                      behind the other, the body sways, the arms drip and swing, the face bobs
                      (extras.speed).
    WoppylavaSwipe    1.4 s: his right arm draws back and sweeps round across his front, low, at
                      frame 21 (extras.hit_frame, extras.muzzle: the right hand then).
    WoppylavaErupt    1.8 s: crouches, shudders, and his crater blasts at frame 27, the plume
                      shooting up huge (extras.muzzle: the crater's top then); settles.
    WoppylavaWall     1.8 s: swings both arms out wide and slams them down flat onto the floor
                      at his sides at frame 30, pushing (extras.hands: both hands then).
    WoppylavaHands    1.8 s: raises both arms straight up high overhead, hands clawing at frame
                      27, the face tipping up (extras.hands).
    WoppylavaSummon   1.6 s: heaves and his crater spits at frame 27 (extras.muzzle: the crater).
    WoppylavaRise     3.0 s: the phase change: stomps his legs one after another, raises his arms,
                      the face rises and roars; at frame 45 a huge slam, the arms down on the floor,
                      the plume at its biggest (extras.muzzle: the crater); holds it a little, settles.
    WoppylavaDeath    2.4 s: the plume dies down to nothing, the arms sag to the floor, the legs
                      buckle, the body sinks, the face drifts down onto the crater. Held.

Headless:
    Blender -b --python blender/woppylava.py -- assets/woppylava.glb blender/woppylava.blend \
        blender/previews/woppylava-preview.png
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

NAME, RIG_NAME = "Woppylava", "WoppylavaRig"
SCENE, COLLECTION, STAGE = "Woppylava", "WoppylavaAsset", "WoppylavaStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("WoppylavaWalk", "WoppylavaSwipe", "WoppylavaErupt", "WoppylavaWall", "WoppylavaHands", "WoppylavaSummon",
         "WoppylavaRise", "WoppylavaDeath")

STONE_HEX, RIM_HEX, LEGS_HEX, CRACK_HEX, CRATER_HEX = "#74665c", "#2f2826", "#4b403a", "#ff5a14", "#ff6f1a"
PLUME_HEX, ARMS_HEX, HOT_HEX, FACE_HEX, BROW_HEX = "#ffc23a", "#ff7a16", "#ffe27a", "#d9d0c3", "#3a302c"
EYE_HEX, MOUTH_HEX = "#ffe24a", "#ff7a1a"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("WoppylavaStone", STONE_HEX, 0), ("WoppylavaRim", RIM_HEX, 0), ("WoppylavaLegs", LEGS_HEX, 0),
             ("WoppylavaCracks_glow", CRACK_HEX, 1.8), ("WoppylavaCrater_glow", CRATER_HEX, 2.2),
             ("WoppylavaPlume_glow", PLUME_HEX, 2.4), ("WoppylavaArms_glow", ARMS_HEX, 2.0), ("WoppylavaArmsHot_glow", HOT_HEX, 2.6),
             ("WoppylavaFace", FACE_HEX, 0), ("WoppylavaBrow", BROW_HEX, 0), ("WoppylavaEyes_glow", EYE_HEX, 2.6),
             ("WoppylavaMouth_glow", MOUTH_HEX, 2.2))
STONE_M, RIM_M, LEGS_M, CRACK_M, CRATER_M, PLUME_M, ARMS_M, HOT_M, FACE_M, BROW_M, EYE_M, MOUTH_M = range(len(MATERIALS))
ROUGHNESS = {"WoppylavaStone": 0.9, "WoppylavaRim": 0.85, "WoppylavaLegs": 0.85, "WoppylavaCracks_glow": 0.5,
             "WoppylavaCrater_glow": 0.3, "WoppylavaPlume_glow": 0.3, "WoppylavaArms_glow": 0.35, "WoppylavaArmsHot_glow": 0.3,
             "WoppylavaFace": 0.8, "WoppylavaBrow": 0.8, "WoppylavaEyes_glow": 0.3, "WoppylavaMouth_glow": 0.3}

# (the limbs coarser: the collapse keeps their joints whole, blender/figure.py _protect)
VOXEL, DETAIL, FINE, LIMB = 0.026, 0.02, 0.009, 0.034
WALK_FRAMES, WALK_SPEED = 40, 1.2
SWIPE_FRAMES, SWIPE_HIT = 42, 21
ERUPT_FRAMES, ERUPT_HIT = 54, 27
WALL_FRAMES, WALL_HIT = 54, 30
HANDS_FRAMES, HANDS_HIT = 54, 27
SUMMON_FRAMES, SUMMON_HIT = 48, 27
RISE_FRAMES, RISE_HIT = 90, 45
DEATH_FRAMES = 72


def crag(P, f=6.0, seed=0.0):
    """A smooth craggy noise in -1..1 (sums of products of warped sines): stone that is not round."""
    x, y, z = P[..., 0] * f + seed, P[..., 1] * f + 1.3 * seed, P[..., 2] * f - 0.7 * seed
    a = np.sin(x + 1.7 * np.sin(0.8 * y + 0.3))
    b = np.sin(1.3 * y + 1.4 * np.sin(0.9 * z + 1.1))
    c = np.sin(1.1 * z + 1.6 * np.sin(1.2 * x + 2.3))
    return (a * b + b * c + c * a) / 3


def cyl(P):
    """Distance from the axis and the angle round it (0 in front, -Y; growing over his left, +X)."""
    x, y = P[..., 0], P[..., 1]
    return np.sqrt(x * x + y * y), np.arctan2(x, -y)


def radial(th):
    return V((math.sin(th), -math.cos(th), 0))


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


# --- body plan: the rim, the cone, the crater ------------------------------------------
RIM_Z, RIM_R, RIM_H = 1.0, 1.14, 0.19
CONE_Z0, CONE_Z1, CONE_R0, CONE_R1 = 1.0, 2.5, 1.1, 0.5
CRATER_C, CRATER_R = V((0, 0, 2.68)), (0.46, 0.46, 0.4)
POOL_C, POOL_R = V((0, 0, 2.31)), (0.46, 0.46, 0.075)
PLUME_BASE = V((0, 0, 2.34))
BODY_PIVOT = V((0, 0, 0.95))
CRATER_TOP = V((0, 0, 2.5))


def cone_radius(z, th, waves=True):
    u = np.clip((z - CONE_Z0) / (CONE_Z1 - CONE_Z0), 0, 1)
    r = CONE_R1 + (CONE_R0 - CONE_R1) * (1 - u) ** 1.25
    if waves:
        # stony waves round his sides: big lumpy ledges, wobbling up and down as they go round
        swell = 0.3 + 0.7 * np.sin(np.pi * np.clip(u * 1.15, 0, 1))      # (calmer where it sits on the rim)
        r = r + 0.16 * np.sin(TAU * 2.2 * u + 1.6 * np.sin(3 * th + 0.4) + 0.8 * np.sin(5 * th + 1)) * swell
        r = r + 0.05 * np.sin(TAU * 4.6 * u + 2.0 * np.sin(2 * th + 2.0)) * swell
        r = r + 0.04 * np.sin(6 * th + 3.0 * u)
    return r


def cone_sdf(P):
    rho, th = cyl(P)
    z = P[..., 2]
    d = (rho - cone_radius(z, th)) * 0.6
    d = K.smax(d, z - CONE_Z1 - 0.02 * np.sin(4 * th + 1), 0.08)     # the lip
    d = K.smax(d, 0.9 - z, 0.02)
    d = K.smax(d, -K.ellipsoid(P, CRATER_C, CRATER_R), 0.06)          # the crater
    return d + 0.03 * crag(P, 3.5, 3.0)


def rim_sdf(P):
    rho, th = cyl(P)
    z = P[..., 2] - RIM_Z - 0.045 * np.sin(2 * th + 0.7) - 0.02 * np.sin(5 * th)
    R = RIM_R + 0.05 * np.sin(5 * th + 0.3) + 0.03 * np.sin(9 * th + 1)
    rr = RIM_H * 0.95
    qx, qz = rho - (R - rr), np.abs(z) - (RIM_H - rr)
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qz, 0) ** 2) + np.minimum(np.maximum(qx, qz), 0) - rr
    return d + 0.03 * crag(P, 4.0, 5.0)


def rivulets():
    """Lava running down from the crater's lip: (points, radii) each."""
    out = []
    for th0, length, seed in ((0.55, 1.1, 0.0), (2.7, 1.25, 1.0), (4.35, 0.95, 2.0), (-0.9, 0.7, 3.0)):
        pts, radii = [], []
        for k in range(13):
            u = k / 12
            z = CONE_Z1 - 0.03 - u * length
            th = th0 + 0.13 * math.sin(5.0 * u + seed)
            r = float(cone_radius(np.float32(z), np.float32(th), waves=True)) + 0.012
            pts.append(radial(th) * r + V((0, 0, z)))
            radii.append(0.05 - 0.025 * u)
        out.append((pts, radii))
    return out


RIVULETS = rivulets()


# --- the plume --------------------------------------------------------------------
def plume_streaks():
    """The fountain: a jet in the middle and a fan of streaks round it, each with a drop."""
    streaks = []
    for k in range(9):
        phi = TAU * k / 9 + 0.3 * math.sin(2.1 * k)
        tilt = D(16 + 10 * ((k * 5) % 3))
        length = 0.5 + 0.07 * ((k * 7) % 4)
        out = radial(phi)
        pts = [PLUME_BASE + V((0, 0, 0.02)) + V((0, 0, length * u)) + out * (math.sin(tilt) * length * u ** 1.4)
               for u in np.linspace(0, 1, 6)]
        radii = [0.07 - 0.045 * u for u in np.linspace(0, 1, 6)]
        tip_dir = (pts[-1] - pts[-2]).normalized()
        drop = pts[-1] + tip_dir * 0.08
        streaks.append((pts, radii, drop))
    return streaks


STREAKS = plume_streaks()


def plume_sdf(P):
    d = K.round_cone(P, PLUME_BASE, PLUME_BASE + V((0, 0, 0.22)), 0.09, 0.035)
    for pts, radii, drop in STREAKS:
        d = K.smin(d, K.tapered_tube(P, pts, radii), 0.04)
        d = np.minimum(d, F._sd_sphere(P, drop, 0.04))
    return d


# --- legs -------------------------------------------------------------------------
LEG_COUNT = 7
LEG_TH = [TAU * i / LEG_COUNT for i in range(LEG_COUNT)]
LEGS = [(radial(th) * 0.74 + V((0, 0, 0.92)), radial(th) * 1.16 + V((0, 0, 0.6)), radial(th) * 1.27 + V((0, 0, 0.14)))
        for th in LEG_TH]
LEG_R = (0.19, 0.17, 0.16, 0.15)
REST_FEET = [pts[2].copy() for pts in LEGS]


def leg_sdf(P, i):
    hip, knee, foot = LEGS[i]
    out = radial(LEG_TH[i])
    # curvy: bulging out a little more between the hip and the knee
    # curvy: bulging out above the knee, in again under it, the foot kicked out
    curve = catmull([hip, hip.lerp(knee, 0.55) + out * 0.08 + V((0, 0, 0.05)), knee + out * 0.04, knee.lerp(foot, 0.55) - out * 0.07, foot], 5)
    radii = list(np.interp(np.linspace(0, 1, len(curve)), np.linspace(0, 1, len(LEG_R)), LEG_R))
    d = K.tapered_tube(P, curve, radii)
    # a big round foot, its toe turned out
    tang = V((0, 0, 1)).cross(out)
    c = foot + out * 0.06 + V((0, 0, -0.01))
    Q = K.local(P, c, (out, tang, V((0, 0, 1))))
    toe = K.ellipsoid(Q, (0, 0, 0), (0.25, 0.2, 0.13))
    return K.smax(K.smin(d, toe, 0.06), 0.009 - P[..., 2], 0.02)      # pressed flat onto the floor


# --- arms -------------------------------------------------------------------------
ARM_ROOT = {s: V((sign * 0.5, 0.02, 1.74)) for s, sign in SIDES}
ARM_LEN, HAND_LEN = 0.42, 0.36
ARM_R0, ARM_R1 = 0.22, 0.13
# (azimuth: 0 out to the side, > 0 forward; elevation: > 0 up) of each of the four arm bones and the hand
REST_ARM = [(D(4), D(40)), (D(6), D(12)), (D(8), D(-22)), (D(10), D(-55)), (D(12), D(-72))]


def arm_dir(sign, az, el):
    return V((sign * math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), math.sin(el)))


def arm_chain(root, dirs, stretch=1.0):
    pts = [root.copy()]
    for d in dirs[:4]:
        pts.append(pts[-1] + d * (ARM_LEN * stretch))
    return pts


ARM_DIRS = {s: [arm_dir(sign, *a) for a in REST_ARM] for s, sign in SIDES}
ARM_J = {s: arm_chain(ARM_ROOT[s], ARM_DIRS[s]) for s, _ in SIDES}
HAND_C = {s: ARM_J[s][-1] + ARM_DIRS[s][4] * 0.19 for s, _ in SIDES}


def hand_axes(s):
    """The hand's axes at rest: along it, across it (to the thumb: towards his body), its palm's normal."""
    sign = 1 if s == "L" else -1
    a = ARM_DIRS[s][4]
    across = a.cross(V((0, 1, 0))).normalized()
    if across.x * sign > 0:
        across = -across
    return a, across, a.cross(across).normalized()


def hand_sdf(P, s):
    a, across, n = hand_axes(s)
    c = HAND_C[s]
    d = K.ellipsoid(K.local(P, c, (across, n, a)), (0, 0, 0), (0.2, 0.1, 0.19))
    for phi in (-0.6, -0.15, 0.3):             # three fat fingers, spread
        f = (a * math.cos(phi) + across * math.sin(phi)).normalized()
        base = c + f * 0.1
        tip = base + f * 0.24 + n * 0.04
        d = K.smin(d, K.round_cone(P, base, tip, 0.07, 0.058), 0.035)
    t = (a * 0.3 + across * 0.95).normalized()  # the thumb
    base = c + across * 0.11 - a * 0.04
    d = K.smin(d, K.round_cone(P, base, base + t * 0.19 + n * 0.04, 0.075, 0.06), 0.035)
    return d


def arm_curve(s):
    pts = ARM_J[s] + [HAND_C[s]]
    curve = catmull(pts, 6)
    u = np.linspace(0, 1, len(curve))
    radii = (ARM_R0 + (ARM_R1 - ARM_R0) * u) * (1 + 0.1 * np.sin(u * TAU * 2.5 + 0.5))
    return curve, list(radii)


def drips(s):
    """Lava dripping off the underside of the arm: (top, bottom, radius at the bottom) each."""
    curve, radii = arm_curve(s)
    out = []
    for frac, length in ((0.4, 0.26), (0.6, 0.18), (0.8, 0.3)):
        k = int(frac * (len(curve) - 1))
        top = curve[k] + V((0, 0, -radii[k] * 0.6))
        out.append((top, top + V((0, 0, -length)), 0.065))
    return out


def arm_sdf(P, s):
    curve, radii = arm_curve(s)
    d = K.tapered_tube(P, curve, radii)
    for top, bottom, r in drips(s):
        d = K.smin(d, K.round_cone(P, top, bottom, 0.08, r * 0.65), 0.05)
        d = K.smin(d, F._sd_sphere(P, bottom + V((0, 0, -0.01)), r), 0.03)
    return K.smin(d, hand_sdf(P, s), 0.05)


def arm_exit(s):
    """Where the arm bursts out of the stone (on its first bone)."""
    a, b = ARM_J[s][0], ARM_J[s][1]
    for k in range(200):
        p = a.lerp(b, k / 199)
        rho, th = math.hypot(p.x, p.y), math.atan2(p.x, -p.y)
        if rho > float(cone_radius(np.float32(p.z), np.float32(th))):
            return p
    return b


ARM_EXIT = {s: arm_exit(s) for s, _ in SIDES}


def cone_mats(Cq):
    """Stone, with glowing cracks here and there and round where the arms burst out."""
    n = crag(Cq, 4.5, 9.0)
    z = Cq[:, 2]
    crack = (np.abs(n) < 0.045) & (z > 1.15) & (z < 2.45) & (crag(Cq, 2.5, 4.0) > 0.0)
    for s, _ in SIDES:
        e = np.asarray(ARM_EXIT[s], np.float32)
        near = np.linalg.norm(Cq - e, axis=1)
        crack |= (near < 0.3) & ((near < 0.22) | (np.abs(crag(Cq, 9.0, 2.0)) < 0.08))
    inner = K.ellipsoid(Cq, CRATER_C, np.array(CRATER_R) + 0.03) < 0     # the crater's walls glow too, low down
    crack |= inner & (z < 2.42)
    return np.where(crack, CRACK_M, STONE_M)


def arm_mats(seed):
    def mat(Cq):
        return np.where(np.abs(crag(Cq, 5.5, seed)) < 0.09, HOT_M, ARMS_M)     # hotter, yellow swirls in it
    return mat


# --- the face ---------------------------------------------------------------------
FACE_C, FACE_R = V((0, 0.06, 3.6)), (0.88, 0.4, 0.6)
FACE_TILT = D(-9)          # tipped back a little: it looks up at the camera, high over him
MOUTH_W, MOUTH_Z, MOUTH_UP = 0.46, 3.24, 0.15
JAW_HINGE = V((0, 0.3, 3.36))
EYE_X, EYE_Z, EYE_R = 0.36, 3.72, (0.085, 0.06, 0.11)


def face_front(x, z, inset=0.0):
    """y of the face's front at (x, z) (inset: that far in)."""
    rx, ry, rz = FACE_R
    q = 1 - (x / rx) ** 2 - ((z - FACE_C.z) / rz) ** 2
    return FACE_C.y - (ry - inset) * math.sqrt(max(0.0, q))


def mouth_z(x):
    return MOUTH_Z + MOUTH_UP * (min(1.0, abs(x) / MOUTH_W)) ** 2.6


def mouth_line(inset=0.0, n=13):
    pts = []
    for x in np.linspace(-MOUTH_W, MOUTH_W, n):
        z = mouth_z(x)
        pts.append(V((x, face_front(x, z, inset), z)))
    return pts


def mouth_radii(n=13, r=0.07):
    return [r * (1 - 0.55 * (x / MOUTH_W) ** 2) for x in np.linspace(-MOUTH_W, MOUTH_W, n)]


EYES = {s: V((sign * EYE_X, face_front(sign * EYE_X, EYE_Z) + 0.03, EYE_Z)) for s, sign in SIDES}
BROW = [V((x, face_front(x, z) - 0.01, z)) for x, z in ((-0.33, 4.0), (-0.16, 3.85), (0.0, 3.69), (0.16, 3.85), (0.33, 4.0))]


def mask_sdf(P):
    d = K.ellipsoid(P, FACE_C, FACE_R)
    d = K.smin(d, K.ellipsoid(P, FACE_C + V((0, -0.06, -0.28)), (0.55, 0.32, 0.3)), 0.1)   # a heavy chin
    for s, sign in SIDES:
        d = K.smax(d, -K.ellipsoid(P, EYES[s] + V((0, 0.0, 0)), (0.115, 0.075, 0.14)), 0.025)  # the sockets
    line, deep = mouth_line(), mouth_line(0.1)
    radii = mouth_radii()
    d = K.smax(d, -np.minimum(K.tapered_tube(P, line, radii), K.tapered_tube(P, deep, radii)), 0.02)
    return d + 0.01 * crag(P, 4.0, 7.0)


def mouth_glow_sdf(P):
    return K.tapered_tube(P, mouth_line(0.045), mouth_radii(r=0.075))


def brow_sdf(P):
    curve = catmull(BROW, 4)
    radii = list(np.interp(np.linspace(0, 1, len(curve)), [0, 0.5, 1], [0.04, 0.06, 0.04]))
    return K.tapered_tube(P, curve, radii)


def jaw_weight(Q):
    """How much of the mask goes with the jaw: all below the grin's line (and its level round the
    sides), blended over the grin's groove."""
    x = Q[:, 0]
    line = MOUTH_Z + MOUTH_UP * np.minimum(1.0, np.abs(x) / MOUTH_W) ** 2.6
    return C.np_smoothstep(line + 0.025, line - 0.025, Q[:, 2])


# --- the mesh ---------------------------------------------------------------------
def build_mesh(coll):
    parts = K.Parts()
    parts.add("cone", cone_sdf, (-1.35, -1.35, 0.85), (1.35, 1.35, 2.62), VOXEL, mat=cone_mats)
    parts.add("cone", lambda P: K.ellipsoid(P, POOL_C, POOL_R), POOL_C - V((0.5, 0.5, 0.12)), POOL_C + V((0.5, 0.5, 0.12)),
              DETAIL, mat=CRATER_M)
    for pts, radii in RIVULETS:
        lo, hi = K.bounds(pts, 0.08)
        parts.add("cone", lambda P, pts=pts, radii=radii: K.tapered_tube(P, pts, radii), lo, hi, FINE * 1.4, mat=CRATER_M)
    parts.add("body", rim_sdf, (-1.32, -1.32, 0.72), (1.32, 1.32, 1.28), VOXEL, mat=RIM_M)
    lo, hi = PLUME_BASE - V((0.6, 0.6, 0.1)), PLUME_BASE + V((0.6, 0.6, 0.75))
    parts.add("plume", plume_sdf, lo, hi, FINE * 1.6, mat=PLUME_M)
    for i in range(LEG_COUNT):
        lo, hi = K.bounds(list(LEGS[i]) + [LEGS[i][2] + radial(LEG_TH[i]) * 0.3], 0.25)
        lo[2] = max(lo[2], -0.05)
        parts.add(f"leg.{i}", lambda P, i=i: leg_sdf(P, i), lo, hi, LIMB, mat=LEGS_M)
    for (s, _), seed in zip(SIDES, (1.0, 6.0)):
        a, _, _ = hand_axes(s)
        lo, hi = K.bounds(ARM_J[s] + [HAND_C[s] + a * 0.35] + [b for _, b, _ in drips(s)], 0.32)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, LIMB * 0.8, mat=arm_mats(seed))
    lo, hi = FACE_C - V((0.85, 0.5, 0.72)), FACE_C + V((0.85, 0.5, 0.7))
    parts.add("mask", mask_sdf, lo, hi, DETAIL, mat=FACE_M)
    lo, hi = K.bounds(mouth_line(), 0.12)
    parts.add("mouth", mouth_glow_sdf, lo, hi, FINE, mat=MOUTH_M)
    lo, hi = K.bounds(BROW, 0.1)
    parts.add("face", brow_sdf, lo, hi, FINE, mat=BROW_M)
    for s, _ in SIDES:
        e = EYES[s]
        parts.add("face", lambda P, c=e: K.ellipsoid(P, c, EYE_R), e - V((0.12,) * 3), e + V((0.12,) * 3), FINE * 0.8, mat=EYE_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "woppylava"
    obj["stone_color"] = STONE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


# --- rig / skin -------------------------------------------------------------------
ARM_BONES = {s: [f"arm.{s}.{k}" for k in range(4)] for s, _ in SIDES}


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("body", BODY_PIVOT, BODY_PIVOT + V((0, 0, 0.6)), "root", True, fwd),
             ("cone", V((0, 0, CONE_Z0)), CRATER_TOP, "body", True, fwd),
             ("plume", PLUME_BASE, PLUME_BASE + V((0, 0, 0.55)), "body", True, fwd)]
    for i, (hip, knee, foot) in enumerate(LEGS):
        out = radial(LEG_TH[i])
        bones += [(f"leg.{i}", hip, knee, "body", True, out), (f"leg.{i}.lower", knee, foot, f"leg.{i}", True, out),
                  (f"foot.{i}", foot, foot + out * 0.2, f"leg.{i}.lower", True, (0, 0, 1))]
    for s, _ in SIDES:
        parent = "body"
        for k, name in enumerate(ARM_BONES[s]):
            bones.append((name, ARM_J[s][k], ARM_J[s][k + 1], parent, True, up))
            parent = name
        w = ARM_J[s][-1]
        bones.append((f"hand.{s}", w, w + ARM_DIRS[s][4] * HAND_LEN, parent, True, up))
    bones += [("face", FACE_C, FACE_C + V((0, 0, 0.5)), "root", True, fwd),
              ("jaw", JAW_HINGE, V((0, face_front(0, MOUTH_Z - 0.1), MOUTH_Z - 0.1)), "face", True, up),
              ("mouth", V((0, face_front(0, MOUTH_Z), MOUTH_Z)), V((0, face_front(0, MOUTH_Z), MOUTH_Z + 0.2)), "face", True, fwd)]
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "woppylava", "forward": "-Y", "attack_style": "boss", "normal_speed": WALK_SPEED, "root_motion": False})


def arc(pts):
    return np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])


def chain_weights(Q, joints, parent, names):
    """Smooth weights along a chain: all of a bone at its middle, shared with the next at the
    joints, the parent's at the root and the last bone's at the tip (blender/rollie.py)."""
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
        WB = np.zeros((len(Q), len(names)), np.float32)
        if kind.startswith("leg."):
            i = int(kind.split(".")[1])
            hip, knee, foot = LEGS[i]
            # (the foot: past the end of the lower bone, its own)
            shares = chain_weights(Q, [hip + (hip - knee).normalized() * 0.12, hip, knee, foot], "body",
                                   ["body", f"leg.{i}", f"leg.{i}.lower"])
            flat = C.np_smoothstep(foot.z + 0.13, foot.z + 0.01, Q[:, 2])     # the foot, under the ankle
            shares = {name: value * (1 - flat) for name, value in shares.items()}
            shares[f"foot.{i}"] = flat
            iterations = 4
        elif kind.startswith("arm."):
            s = kind.split(".")[1]
            a, _, _ = hand_axes(s)
            shares = chain_weights(Q, ARM_J[s] + [HAND_C[s] + a * 0.3], "body", ARM_BONES[s] + [f"hand.{s}"])
            iterations = 4
        elif kind == "mask":
            j = jaw_weight(Q)
            shares = {"jaw": j, "face": 1 - j}
            iterations = 0
        else:
            W[lo:hi, names.index(kind)] = 1
            continue
        for name, value in shares.items():
            WB[:, names.index(name)] += value
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, iterations) if iterations else WB
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


# --- motion -----------------------------------------------------------------------
def T(v):
    return Matrix.Translation(v)


def params(**kw):
    p = {"t": 0.0,
         # the body (about BODY_PIVOT), the cone squashed (across, up)
         "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "squash": (1.0, 1.0),
         # where the feet stand (`ride`: 1 = carried along with the body instead)
         "feet": [f.copy() for f in REST_FEET], "ride": [0.0] * LEG_COUNT,
         # the arms: (azimuth, elevation) of the four bones and the hand, in the body's frame; how far
         # apart the bones move (stretch), the hand turned about itself (twist) and sized (hand_k)
         "arms": {s: list(REST_ARM) for s, _ in SIDES}, "stretch": {s: 1.0 for s, _ in SIDES},
         "twist": {s: 0.0 for s, _ in SIDES}, "hand_k": {s: 1.0 for s, _ in SIDES},
         # the plume: (width, height), leaning (forward, sideways)
         "plume": (1.0, 1.0), "plume_lean": (0.0, 0.0),
         # the face: moved, turned (pitch: > 0 down, yaw, roll); the jaw open (0 .. 1)
         "face_pos": V(), "face_rot": (FACE_TILT, 0.0, 0.0), "jaw": 0.0}
    p.update(kw)
    return p


def body_frame(p, lift=0.0):
    R = C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"])
    return T((0, 0, lift)) @ T(p["pos"]) @ K.about(BODY_PIVOT, R)


def arm_joints(p, s, B):
    sign = 1 if s == "L" else -1
    b3 = B.to_3x3()
    dirs = [(b3 @ arm_dir(sign, az, el)).normalized() for az, el in p["arms"][s]]
    return arm_chain(B @ ARM_ROOT[s], dirs, p["stretch"][s]), dirs


def frame_along(head, direction, base_rot):
    """A bone at `head` pointing along `direction`, swung the least from `base_rot` (3x3)."""
    y = base_rot.col[1].normalized()
    swing = y.rotation_difference(direction.normalized()).to_matrix()
    return T(head) @ (swing @ base_rot).to_4x4()


def solver(rig):
    skel = C.Skeleton(rig)
    rest, rot = skel.rest, skel.rest_rot
    length = {b.name: b.length for b in rig.data.bones}
    order = [b.name for b in rig.data.bones]

    def solve(f, lift, fn):
        p = fn(f)
        out = {"root": T((0, 0, lift)) @ rest["root"]}
        B = body_frame(p, lift)
        B3 = B.to_3x3()
        out["body"] = B @ rest["body"]
        sx, sz = p["squash"]
        Cn = B @ K.about(V((0, 0, CONE_Z0)), Matrix.Diagonal((sx, sx, sz)))
        out["cone"] = Cn @ rest["cone"]
        w, h = p["plume"]
        fl, sl = p["plume_lean"]
        R = B3 @ C.rot_x(fl) @ C.rot_y(sl)
        out["plume"] = T(Cn @ PLUME_BASE) @ (R @ rot["plume"] @ Matrix.Diagonal((max(w, 0.001), max(h, 0.001), max(w, 0.001)))).to_4x4()
        for i in range(LEG_COUNT):
            up, lo = f"leg.{i}", f"leg.{i}.lower"
            hip = B @ LEGS[i][0]
            target = p["feet"][i].lerp(B @ REST_FEET[i], p["ride"][i])
            pole = B3 @ (radial(LEG_TH[i]) + V((0, 0, 0.35)))
            knee, foot = C.two_bone_ik(hip, target, length[up], length[lo], pole)
            out[up] = frame_along(hip, knee - hip, B3 @ rot[up])
            out[lo] = frame_along(knee, foot - knee, B3 @ rot[lo])
            out[f"foot.{i}"] = T(foot) @ rest[f"foot.{i}"].to_3x3().to_4x4()      # flat on the floor: they do not roll
        for s, _ in SIDES:
            joints, dirs = arm_joints(p, s, B)
            for k, name in enumerate(ARM_BONES[s]):
                out[name] = frame_along(joints[k], dirs[k], B3 @ rot[name])
            hand = f"hand.{s}"
            M = frame_along(joints[4], dirs[4], B3 @ rot[hand])
            hk = p["hand_k"][s]
            spin = Matrix.Rotation(p["twist"][s], 3, dirs[4])
            out[hand] = T(joints[4]) @ (spin @ M.to_3x3() @ Matrix.Diagonal((hk, hk, hk))).to_4x4()
        fp, fy, fr = p["face_rot"]
        Fm = T((0, 0, lift)) @ T(p["face_pos"]) @ K.about(FACE_C, C.rot_z(fy) @ C.rot_x(fp) @ C.rot_y(fr))
        out["face"] = Fm @ rest["face"]
        j = p["jaw"]
        out["jaw"] = Fm @ K.about(JAW_HINGE, C.rot_x(D(24) * j)) @ T((0, 0, -0.06 * j)) @ rest["jaw"]
        out["mouth"] = Fm @ T((0, 0.02 * j, -0.1 * j)) @ rest["mouth"] @ Matrix.Diagonal((1 + 0.15 * j, 1 + 3.2 * j, 1 + 0.3 * j, 1))
        poses, bases = {}, {}
        for name in order:
            bases[name] = skel.set(name, poses, out[name])
        return bases
    return lambda fn: (lambda f, lift: solve(f, lift, fn))


# --- the clips ----------------------------------------------------------------------
k_ = C.keyframes


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def bump(t, a, b):
    """0 .. 1 .. 0 over [a, b]."""
    return math.sin(math.pi * min(1, max(0, (t - a) / (b - a)))) ** 2


def mix(a, b, u):
    return [(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u) for (x0, y0), (x1, y1) in zip(a, b)]


def track(t, keys):
    """An arm pose through keys (time, pose), smoothstep from one to the next."""
    if t <= keys[0][0]:
        return list(keys[0][1])
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            return mix(a, b, C.smoothstep(t0, t1, t))
    return list(keys[-1][1])


def wiggle(pose, daz=None, del_=None):
    daz = daz or [0] * len(pose)
    del_ = del_ or [0] * len(pose)
    return [(a + x, e + y) for (a, e), x, y in zip(pose, daz, del_)]


def deg(*pairs):
    return [(D(a), D(e)) for a, e in pairs]


WIDE = deg((-5, 55), (-5, 45), (-4, 32), (0, 18), (0, 10))             # out to the sides, raised
UP = deg((0, 62), (4, 70), (6, 78), (6, 84), (6, 88))                  # straight up overhead
SLAM = deg((4, 5), (4, -15), (6, -32), (8, -48), (10, 0))              # down to the floor at the side (to_floor)
DROOP = deg((14, 0), (22, -30), (30, -55), (34, -72), (38, -15))       # sagging to the floor (to_floor)
SWIPE_BACK = deg((-30, 38), (-48, 22), (-62, 8), (-70, -8), (-74, -18))
SWIPE_CROSS = deg((45, 0), (80, -18), (110, -28), (135, -28), (150, -20))
SWIPE_ON = deg((75, 0), (118, -15), (150, -24), (172, -24), (185, -18))


def to_floor(p, s, z=0.09, weight=1.0):
    """Bend the arm's elevations down (more towards the hand) until its wrist is at height z;
    by `weight` of the way."""
    B = body_frame(p)

    def wrist(delta):
        q = dict(p, arms=dict(p["arms"]))
        q["arms"][s] = [(a, e - delta * (0.8 + 0.1 * k)) if k < 4 else (a, e) for k, (a, e) in enumerate(p["arms"][s])]
        joints, _ = arm_joints(q, s, B)
        return joints[4].z, q["arms"][s]
    lo, hi = D(-80), D(80)
    for _ in range(40):
        mid = (lo + hi) / 2
        if wrist(mid)[0] > z:
            lo = mid
        else:
            hi = mid
    done = wrist((lo + hi) / 2)[1]
    p["arms"][s] = mix(p["arms"][s], done, weight)
    return p


def gait(t, period, speed, duty, lift, offsets, skew=0.9):
    feet = []
    stride = speed * duty * period
    for i, off in enumerate(offsets):
        y, z = C.foot_track(((t / period) + off) % 1, duty, stride, lift, speed, period, skew=skew)
        feet.append(REST_FEET[i] + V((0, y, z)))
    return feet


# front to back along each side, his right half a step behind his left
WALK_OFFSETS = [0.0, 1 / 7, 2 / 7, 3 / 7, 0.5 + 3 / 7, 0.5 + 2 / 7, 0.5 + 1 / 7]


def idle(f, period=WALK_FRAMES, **kw):
    """Standing, breathing (a loop of `period` frames), the arms dripping, the face bobbing, with
    some parameters replaced."""
    t = f / FPS
    w = TAU * f / period
    arms = {}
    for (s, _), ph in zip(SIDES, (0.0, 2.2)):
        arms[s] = wiggle(REST_ARM, [D(4) * math.sin(w + ph)] * 5, [D(4) * math.sin(2 * w - 0.9 * k + ph) for k in range(5)])
    p = params(t=t, pos=V((0, 0, 0.015 * math.sin(w))), arms=arms,
               plume=(1 + 0.06 * math.sin(3 * w), 1 + 0.1 * math.sin(2 * w + 0.7) + 0.05 * math.sin(5 * w)),
               plume_lean=(D(3) * math.sin(w + 1), D(4) * math.sin(2 * w)),
               face_pos=V((0.02 * math.sin(w + 0.5), 0, 0.07 * math.sin(w + 1.2))),
               face_rot=(FACE_TILT + D(3) * math.sin(w + 2.0), D(3) * math.sin(w), D(3) * math.sin(w + 0.4)))
    p.update(kw)
    return p


def walk(f):
    Tp = WALK_FRAMES / FPS
    t = f / FPS
    w = TAU * t / Tp
    p = idle(f)
    arms = {}
    for (s, sign), ph in zip(SIDES, (0.0, math.pi)):
        swing = [D(10) * math.sin(w + ph - 0.4 * k) for k in range(5)]
        drip = [D(6) * math.sin(2 * w - 0.9 * k + ph) for k in range(5)]
        arms[s] = wiggle(REST_ARM, swing, drip)
    p.update(feet=gait(t, Tp, WALK_SPEED, 0.56, 0.2, WALK_OFFSETS),
             pos=V((0.02 * math.sin(w), 0, 0.02 * math.cos(2 * w))), roll=D(2.5) * math.sin(w), pitch=D(1.5) * math.sin(2 * w + 0.6),
             yaw=D(2) * math.sin(w + 0.4), squash=(1 - 0.015 * math.cos(2 * w), 1 + 0.025 * math.cos(2 * w)), arms=arms)
    return p


def swipe(f):
    t, hit, end = f / FPS, SWIPE_HIT / FPS, SWIPE_FRAMES / FPS
    p = idle(f)
    rest = p["arms"]["R"]
    p["arms"]["R"] = track(t, [(0, rest), (hit - 0.28, SWIPE_BACK), (hit - 0.06, mix(SWIPE_BACK, SWIPE_CROSS, 0.55)),
                               (hit, SWIPE_CROSS), (hit + 0.16, SWIPE_ON), (hit + 0.32, SWIPE_ON), (end, rest)])
    p["stretch"]["R"] = k_((0, 1), (hit - 0.28, 1.1), (hit, 1.6), (hit + 0.3, 1.45), (end, 1))(t)
    p["twist"]["R"] = k_((0, 0), (hit - 0.28, D(-30)), (hit, D(40)), (end, 0))(t)
    p["arms"]["L"] = track(t, [(0, p["arms"]["L"]), (hit - 0.28, wiggle(REST_ARM, [D(20)] * 5, [D(10)] * 5)),
                               (hit + 0.1, wiggle(REST_ARM, [D(-25)] * 5, [D(5)] * 5)), (end, p["arms"]["L"])])
    yaw = k_((0, 0), (hit - 0.28, D(-16)), (hit, D(10)), (hit + 0.2, D(18)), (end, 0))(t)
    lean = k_((0, 0), (hit - 0.28, D(-3)), (hit, D(7)), (hit + 0.3, D(5)), (end, 0))(t)
    p.update(yaw=yaw, pitch=lean, roll=D(-4) * bump(t, hit - 0.2, hit + 0.3), pos=V((0, 0, -0.05 * bump(t, hit - 0.2, hit + 0.35))),
             face_rot=(FACE_TILT + D(6) * bump(t, hit - 0.2, hit + 0.4), yaw * 0.6, D(-5) * bump(t, hit - 0.2, hit + 0.4)),
             face_pos=p["face_pos"] + V((0, -0.08 * bump(t, hit - 0.2, hit + 0.4), 0)))
    return p


def erupt(f):
    t, hit, end = f / FPS, ERUPT_HIT / FPS, ERUPT_FRAMES / FPS
    p = idle(f)
    crouch = k_((0, 0), (hit - 0.12, 1), (hit, -0.35), (hit + 0.3, 0.1), (end, 0))(t)
    shudder = math.sin(TAU * 11 * t) * k_((0, 0), (0.3, 0), (hit - 0.3, 1), (hit, 0.3), (hit + 0.3, 0))(t)
    blast = k_((0, 0), (hit - 0.1, 0), (hit, 1), (hit + 0.25, 0.75), (end - 0.25, 0.08), (end, 0))(t)
    p.update(pos=V((0.035 * shudder, 0, -0.26 * max(0, crouch) + 0.1 * max(0, -crouch))), roll=D(2.5) * shudder,
             squash=(1 + 0.07 * crouch, 1 - 0.1 * crouch + 0.06 * blast),
             plume=(1 - 0.4 * max(0, crouch) * (1 - blast) + 1.7 * blast, 1 - 0.5 * max(0, crouch) * (1 - blast) + 3.6 * blast),
             plume_lean=(D(4) * shudder - D(16) * blast, D(3) * shudder))
    for s, _ in SIDES:
        p["arms"][s] = track(t, [(0, p["arms"][s]), (hit - 0.15, wiggle(REST_ARM, None, [D(-14)] * 5)), (hit + 0.05, WIDE),
                                 (hit + 0.4, WIDE), (end, p["arms"][s])])
        p["arms"][s] = wiggle(p["arms"][s], None, [D(5) * shudder * (-1) ** k for k in range(5)])
    lift = k_((0, 0), (hit - 0.05, -0.08), (hit + 0.15, 0.75), (hit + 0.4, 0.55), (end, 0))(t)
    p["face_pos"] = p["face_pos"] + V((0.02 * shudder, -0.32 * max(0, lift), lift))
    p["face_rot"] = (FACE_TILT - D(22) * max(0, lift) + D(4) * shudder, 0, D(3) * shudder)
    p["jaw"] = 0.6 * bump(t, hit - 0.1, hit + 0.6)
    return p


def wall(f):
    t, hit, end = f / FPS, WALL_HIT / FPS, WALL_FRAMES / FPS
    p = idle(f)
    rise = k_((0, 0), (hit - 0.3, 1), (hit - 0.1, 0.8), (hit, -1), (hit + 0.35, -0.8), (end, 0))(t)
    p.update(pos=V((0, 0, 0.08 * max(0, rise) - 0.2 * max(0, -rise))), pitch=D(-3) * max(0, rise) + D(5) * max(0, -rise),
             squash=(1 - 0.03 * rise, 1 + 0.06 * rise))
    for s, _ in SIDES:
        slam = to_floor(params(pos=p["pos"], pitch=p["pitch"], squash=p["squash"], arms={**p["arms"], s: list(SLAM)},
                               stretch={**p["stretch"], s: 1.5}), s)["arms"][s]
        p["arms"][s] = track(t, [(0, p["arms"][s]), (hit - 0.35, WIDE), (hit - 0.18, WIDE), (hit, slam), (hit + 0.35, slam), (end, p["arms"][s])])
        p["stretch"][s] = k_((0, 1), (hit - 0.3, 1.25), (hit, 1.5), (hit + 0.35, 1.5), (end, 1))(t)
        p["twist"][s] = (1 if s == "L" else -1) * k_((0, 0), (hit - 0.2, 0), (hit, D(90)), (hit + 0.35, D(90)), (end, 0))(t)
        p["hand_k"][s] = k_((0, 1), (hit, 1.15), (hit + 0.35, 1.15), (end, 1))(t)
        if hit - 0.02 <= t <= hit + 0.36:
            p = to_floor(p, s)
    jolt = bump(t, hit - 0.05, hit + 0.3)
    p["face_pos"] = p["face_pos"] + V((0, 0, 0.12 * max(0, rise) - 0.18 * jolt))
    p["face_rot"] = (FACE_TILT + D(10) * jolt, 0, 0)
    p["jaw"] = 0.5 * bump(t, hit - 0.3, hit + 0.4)
    p["plume"] = (p["plume"][0] * (1 + 0.3 * jolt), p["plume"][1] * (1 + 0.8 * jolt))
    return p


def hands(f):
    t, hit, end = f / FPS, HANDS_HIT / FPS, HANDS_FRAMES / FPS
    p = idle(f)
    up = k_((0, 0), (hit - 0.15, 1), (hit + 0.35, 1), (end, 0))(t)
    claw = math.sin(TAU * 6 * t) * bump(t, hit - 0.1, hit + 0.4)
    for s, sign in SIDES:
        reach = wiggle(UP, None, [D(6) * claw * (-1) ** k for k in range(5)])
        p["arms"][s] = track(t, [(0, p["arms"][s]), (hit - 0.15, reach), (hit + 0.35, reach), (end, p["arms"][s])])
        p["stretch"][s] = 1 + 0.32 * up + 0.05 * bump(t, hit - 0.1, hit + 0.2)
        p["twist"][s] = sign * (D(40) * up + D(12) * claw)
        p["hand_k"][s] = 1 + 0.3 * up
    p.update(pos=V((0, 0, 0.06 * up)), pitch=D(-4) * up, squash=(1 - 0.02 * up, 1 + 0.05 * up))
    p["face_pos"] = p["face_pos"] + V((0, 0.1 * up, 0.15 * up))
    p["face_rot"] = (FACE_TILT - D(26) * up, 0, D(3) * claw)
    p["jaw"] = 0.45 * up
    return p


def summon(f):
    t, hit, end = f / FPS, SUMMON_HIT / FPS, SUMMON_FRAMES / FPS
    p = idle(f)
    heave = k_((0, 0), (hit - 0.25, 1), (hit - 0.05, 0.6), (hit + 0.05, -0.7), (hit + 0.35, -0.2), (end, 0))(t)
    spit = k_((0, 0), (hit - 0.08, 0), (hit + 0.04, 1), (hit + 0.3, 0.3), (end, 0))(t)
    p.update(pos=V((0, 0, -0.15 * max(0, heave) + 0.08 * max(0, -heave))), squash=(1 + 0.08 * heave, 1 - 0.12 * heave),
             pitch=D(-3) * max(0, -heave), plume=(1 - 0.3 * max(0, heave) + 0.6 * spit, 1 - 0.4 * max(0, heave) + 2.0 * spit))
    for s, _ in SIDES:
        p["arms"][s] = track(t, [(0, p["arms"][s]), (hit - 0.25, wiggle(REST_ARM, [D(-15)] * 5, [D(-15)] * 5)),
                                 (hit + 0.05, mix(REST_ARM, WIDE, 0.7)), (hit + 0.4, mix(REST_ARM, WIDE, 0.5)), (end, p["arms"][s])])
    p["face_pos"] = p["face_pos"] + V((0, 0, 0.35 * spit - 0.06 * max(0, heave)))
    p["face_rot"] = (FACE_TILT - D(14) * spit, 0, 0)
    p["jaw"] = 0.5 * spit
    return p


def rise(f):
    t, hit, end = f / FPS, RISE_HIT / FPS, RISE_FRAMES / FPS
    p = idle(f, period=RISE_FRAMES / 2)
    # the stomps: round the ring, one after another
    feet = [x.copy() for x in REST_FEET]
    jolt = 0.0
    for k, i in enumerate((0, 1, 6, 2, 5, 3, 4)):
        a = 0.08 + 0.15 * k
        feet[i] = feet[i] + V((0, 0, 0.32 * bump(t, a, a + 0.28) ** 0.8))
        jolt += math.exp(-((t - a - 0.28) / 0.05) ** 2)
    slam = k_((0, 0), (hit - 0.2, 0), (hit, 1), (end - 0.55, 0.8), (end, 0))(t)
    raise_ = k_((0, 0), (0.35, 0), (hit - 0.3, 1), (hit - 0.05, 1), (hit + 0.05, 0))(t)
    p.update(feet=feet, pos=V((0, 0, -0.04 * jolt + 0.1 * raise_ - 0.22 * slam)), roll=D(2) * jolt * math.sin(7 * t),
             pitch=D(-4) * raise_ + D(4) * slam, squash=(1 - 0.03 * raise_ + 0.06 * slam, 1 + 0.08 * raise_ - 0.09 * slam))
    for s, sign in SIDES:
        down = to_floor(params(pos=V((0, 0, -0.22)), pitch=D(4), arms={**p["arms"], s: list(SLAM)}, stretch={**p["stretch"], s: 1.45}), s)["arms"][s]
        high = wiggle(UP, None, [D(5) * math.sin(TAU * 4 * t + k) for k in range(5)])
        p["arms"][s] = track(t, [(0, p["arms"][s]), (0.35, p["arms"][s]), (hit - 0.3, high), (hit - 0.12, high), (hit, down),
                                 (end - 0.55, down), (end, p["arms"][s])])
        p["stretch"][s] = k_((0, 1), (0.35, 1), (hit - 0.3, 1.3), (hit, 1.45), (end - 0.55, 1.4), (end, 1))(t)
        p["twist"][s] = sign * k_((0, 0), (hit - 0.3, D(30)), (hit, D(90)), (end - 0.55, D(90)), (end, 0))(t)
        p["hand_k"][s] = k_((0, 1), (hit - 0.3, 1.25), (hit, 1.2), (end - 0.55, 1.15), (end, 1))(t)
        if hit - 0.01 <= t <= end - 0.54:
            p = to_floor(p, s)
    roar = k_((0, 0), (0.6, 0), (hit - 0.3, 1), (end - 0.55, 1), (end, 0))(t)
    shake = math.sin(TAU * 9 * t) * k_((0, 0), (hit - 0.05, 0), (hit + 0.05, 1), (end - 0.6, 0.4), (end - 0.4, 0))(t)
    p["face_pos"] = p["face_pos"] + V((0.03 * shake, -0.3 * roar, 0.6 * roar - 0.05 * slam))
    p["face_rot"] = (FACE_TILT - D(18) * roar + D(8) * slam, D(2) * shake, D(4) * shake)
    p["jaw"] = roar * (0.85 + 0.15 * math.sin(TAU * 5 * t))
    blast = k_((0, 0), (0.4, 0.4), (hit - 0.1, 0.9), (hit, 1), (end - 0.6, 0.8), (end, 0))(t)
    p["plume"] = (1 + 1.6 * blast, 1 + 3.5 * blast + 0.25 * math.sin(TAU * 4 * t) * blast)
    p["plume_lean"] = (p["plume_lean"][0] - D(18) * blast, p["plume_lean"][1])
    return p


def death(f):
    """The plume dies down, the arms sag onto the floor, the legs buckle, the body sinks and the
    face drifts down onto the crater. Still from 2 s on."""
    t = f / FPS
    shudder = math.sin(TAU * 10 * t) * (1 - ease((t - 0.1) / 0.8))
    sink = ease((t - 0.25) / 1.2)
    die = ease(t / 1.3)
    p = params(t=t, pos=V((0.02 * shudder, 0, -0.52 * sink)), roll=D(2) * shudder + D(3) * sink, pitch=D(4) * sink,
               squash=(1 + 0.05 * sink, 1 - 0.07 * sink), plume=(1 - die, (1 - die) * (1 + 0.6 * bump(t, 0, 0.5))))
    p["feet"] = [x + radial(LEG_TH[i]) * (0.16 * sink) for i, x in enumerate(REST_FEET)]
    for s, sign in SIDES:
        droop = ease((t - 0.15) / 1.4)
        p["arms"][s] = mix(REST_ARM, DROOP, droop)
        p["stretch"][s] = 1 + 0.12 * droop
        p["twist"][s] = sign * D(70) * droop
        if droop > 0:
            p = to_floor(p, s, z=0.1, weight=droop)
        p["arms"][s] = wiggle(p["arms"][s], None, [D(4) * shudder * (-1) ** k for k in range(5)])
    drift = ease((t - 0.35) / 1.5)
    p["face_pos"] = V((0.0, -0.02 * drift, -1.08 * drift - 0.05 * bump(t, 1.6, 2.0)))
    p["face_rot"] = (FACE_TILT + D(17) * drift, 0, D(6) * drift + D(3) * shudder)
    p["jaw"] = 0.4 * bump(t, 0.0, 1.4)
    return p


# --- the points the game uses, read off the baked clips -------------------------------
def game(v):
    return [round(v.x, 3) + 0.0, round(v.z, 3) + 0.0, round(-v.y, 3) + 0.0]   # (+ 0.0: no -0.0)


def at_frame(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)


def bone_point(rig, bone, local):
    """Where a point given in the rest pose rides with bone `bone` now (world)."""
    pb = rig.pose.bones[bone]
    delta = pb.matrix @ rig.data.bones[bone].matrix_local.inverted()
    return rig.matrix_world @ delta @ local


def animate(rig, obj):
    rig.animation_data_create()
    S = solver(rig)

    def clip(name, fn, n, cyclic=False, extras=None, settle_from=None):
        return K.ground_clip(rig, obj, name, S(fn), n, cyclic=cyclic, extras=extras, settle_from=settle_from)

    def attack(name, fn, n, hit, style, marker):
        act = clip(name, fn, n, extras={"attack_style": style, "hit_frame": hit, "hit_time": hit / FPS})
        act.pose_markers.new(marker).frame = hit
        return act
    clip("WoppylavaWalk", walk, WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    sw = attack("WoppylavaSwipe", swipe, SWIPE_FRAMES, SWIPE_HIT, "melee", "Swipe")
    er = attack("WoppylavaErupt", erupt, ERUPT_FRAMES, ERUPT_HIT, "cast", "Erupt")
    wa = attack("WoppylavaWall", wall, WALL_FRAMES, WALL_HIT, "cast", "Slam")
    ha = attack("WoppylavaHands", hands, HANDS_FRAMES, HANDS_HIT, "cast", "Claw")
    su = attack("WoppylavaSummon", summon, SUMMON_FRAMES, SUMMON_HIT, "summon", "Spit")
    ri = attack("WoppylavaRise", rise, RISE_FRAMES, RISE_HIT, "cast", "Slam")
    clip("WoppylavaDeath", death, DEATH_FRAMES, extras={"hold_last_frame": True, "hold_from": 2.0}, settle_from=round(1.9 * FPS))
    K.register(rig, CLIPS)

    def crater():
        return game(bone_point(rig, "cone", CRATER_TOP))

    def hand(s):
        return game(bone_point(rig, f"hand.{s}", HAND_C[s]))
    at_frame(rig, "WoppylavaSwipe", SWIPE_HIT)
    sw["muzzle"] = hand("R")
    at_frame(rig, "WoppylavaErupt", ERUPT_HIT)
    er["muzzle"] = crater()
    at_frame(rig, "WoppylavaWall", WALL_HIT)
    wa["hands"] = [hand("L"), hand("R")]
    at_frame(rig, "WoppylavaHands", HANDS_HIT)
    ha["hands"] = [hand("L"), hand("R")]
    at_frame(rig, "WoppylavaSummon", SUMMON_HIT)
    su["muzzle"] = crater()
    at_frame(rig, "WoppylavaRise", RISE_HIT)
    ri["muzzle"] = crater()
    return {"swipe": list(sw["muzzle"]), "erupt": list(er["muzzle"]), "wall": [list(h) for h in wa["hands"]],
            "hands": [list(h) for h in ha["hands"]], "summon": list(su["muzzle"]), "rise": list(ri["muzzle"])}


# --- previews ----------------------------------------------------------------------
TARGET = (0, -0.2, 2.35)


def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    three, front, side, high = (8.0, -8.0, 4.4), (2.4, -11.0, 3.6), (11.0, -2.4, 3.2), (3.0, -7.5, 9.5)
    shots = [("WoppylavaWalk", 0, three), ("WoppylavaWalk", 10, front), ("WoppylavaWalk", 20, side), ("WoppylavaWalk", 0, high),
             ("WoppylavaSwipe", SWIPE_HIT - 7, three), ("WoppylavaSwipe", SWIPE_HIT, front), ("WoppylavaErupt", ERUPT_HIT - 4, three),
             ("WoppylavaErupt", ERUPT_HIT + 2, front), ("WoppylavaWall", WALL_HIT - 8, front), ("WoppylavaWall", WALL_HIT, three),
             ("WoppylavaHands", HANDS_HIT, front), ("WoppylavaSummon", SUMMON_HIT + 1, three), ("WoppylavaRise", 24, three),
             ("WoppylavaRise", RISE_HIT + 3, front), ("WoppylavaDeath", 36, three), ("WoppylavaDeath", DEATH_FRAMES, three)]
    K.contact_sheet(scene, rig, shots, path, TARGET, size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    F.decimate(obj)
    obj.data.validate(clean_customdata=False)     # (the collapse may leave a face doubled)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("WoppylavaDeath",))
    report.update(points)
    K.setup_stage(scene, "Woppylava", STAGE, TARGET, 6.4, camera=(8.0, -8.0, 4.4))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path)
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Woppylava", NAME, TARGET, 9.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Woppylava:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "woppylava.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "woppylava.blend"),
         preview_path=args[2] if len(args) > 2 else None)
