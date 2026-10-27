"""
Monteur: the boss of the eighth descent (depth 7, the first of act II), from the kids' drawing.

His first form is a moose made of stone: a long blocky body on four short thick legs with dark
hooves, a long neck rising forward to a round head with a long snout, a glowing red eye on each
side and a row of jagged teeth along its mouth, two big branching antlers, and little antler crowns
standing up along his back. Moss grows on his back. Between his antlers float five stones with
glowing cracks: those he throws (the game hides the ones he has thrown and grows them back,
render/monteurview.js). Faces -Y in Blender, +Z up; one unit = one game cell. About 3.4 cells to
the tips of his antlers.

His second form is a sun of stone: a round craggy ball with antlers sticking out all round it
like rays, a face in the middle (red eyes under heavy brows, a mouth full of jagged teeth), on two
short legs. The stones float over it, between its upper rays. One model holds both forms: each clip
shows one and scales the other's bones away (the change shows both).

Rig: root; moose (all of the moose rides it: scaled away in the sun's clips), body, neck, head (the
antlers, eyes and teeth on it), per leg upper.<leg> / lower.<leg> (fore.L, fore.R, hind.L,
hind.R; IK); sun (the sun: scaled away in the moose's clips), ball (the face on it), ray.0 ..
ray.10 (the antlers round it, from the left round over the top to the right), supper.L / slower.L
and supper.R / slower.R (its legs); stone.0 .. stone.4 (the floating stones, on the root).

Clips, 30 fps, in place (the game supplies root motion):
    MonteurWalk       36-frame loop: a heavy lateral-sequence walk (extras.speed).
    MonteurThrow      1.3 s: rears his head back and flicks it forward at frame 21: a stone flies
                      (extras.hit_frame, extras.muzzle: where the stones float then).
    MonteurCharge     2.4 s: lowers his head, the antlers to the front, and scrapes a hoof; from
                      frame 27 (the hit frame) to 60 (extras.charge_end) he gallops (the game runs
                      him at you); then he skids to a stop.
    MonteurStuck      2.2 s: crashed: his head on the ground, dazed, shaking it, getting up.
    MonteurSummon     1.5 s: rears up on his hind legs and stomps down at frame 30 (extras.muzzle).
    MonteurChange     3.0 s: rears up roaring, crumbles and shrinks away while the sun swells up out
                      of him, the stones flying over to it.
    MonteurSunWalk    24-frame loop: the sun waddling on its two legs (extras.speed).
    MonteurSunThrow   1.1 s: leans back and lunges forward at frame 18: a stone flies.
    MonteurRoll       2.4 s: crouches, tucks its legs and from frame 27 to 60 rolls over and over
                      (the game runs it at you); pops back up.
    MonteurSunStuck   2.0 s: crashed: tipped over on its back, legs kicking, rocking; up again.
    MonteurRain       1.8 s: crouches and heaves up, rays flaring, at frame 33 throwing stones up
                      into the sky (extras.muzzle: the top of the ball).
    MonteurSpin       2.0 s: spins right round twice, rays flaring; at frame 36 the world turns.
    MonteurSunSummon  1.4 s: a hop and a stomp at frame 27 (extras.muzzle).
    MonteurRaise      2.8 s: crouches and digs his rays into the floor, stomping at frame 27 (the
                      floor cracks), strains, shaking, and heaves a mountain up out of it at frame
                      63, stretching up, rays flaring; settles.
    MonteurDeath      2.4 s: the sun shudders, sinks, its rays drooping, and topples over on its
                      back; the stones drop to the floor. Held.
    MonteurStone      (a prop, not a clip): the stone he throws, and that rains down.

Headless:
    Blender -b --python blender/monteur.py -- assets/monteur.glb blender/monteur.blend \
        blender/previews/monteur-preview.png
"""
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector, Euler

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K
import figure as F

NAME, RIG_NAME, PROP = "Monteur", "MonteurRig", "MonteurStone"
SCENE, COLLECTION, STAGE = "Monteur", "MonteurAsset", "MonteurStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("MonteurWalk", "MonteurThrow", "MonteurCharge", "MonteurStuck", "MonteurSummon", "MonteurChange",
         "MonteurSunWalk", "MonteurSunThrow", "MonteurRoll", "MonteurSunStuck", "MonteurRain", "MonteurSpin",
         "MonteurSunSummon", "MonteurRaise", "MonteurDeath")

STONE_HEX, DARK_HEX, ANTLER_HEX, MOSS_HEX = "#8d877c", "#4a4540", "#c4bba9", "#6b7b45"
EYE_HEX, TEETH_HEX, MOUTH_HEX, PEBBLE_HEX, VEIN_HEX = "#ff3b24", "#efe8d8", "#24181a", "#a39d91", "#ffb347"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("MonteurStone", STONE_HEX, 0), ("MonteurDark", DARK_HEX, 0), ("MonteurAntlers", ANTLER_HEX, 0),
             ("MonteurMoss", MOSS_HEX, 0), ("MonteurEyes_glow", EYE_HEX, 2.2), ("MonteurTeeth", TEETH_HEX, 0),
             ("MonteurMouth", MOUTH_HEX, 0), ("MonteurPebbles", PEBBLE_HEX, 0), ("MonteurVeins_glow", VEIN_HEX, 1.6))
STONE_M, DARK_M, ANTLER_M, MOSS_M, EYE_M, TEETH_M, MOUTH_M, PEBBLE_M, VEIN_M = range(len(MATERIALS))
PROP_MATERIALS = (("MonteurStoneRock", PEBBLE_HEX, 0), ("MonteurStoneVeins_glow", VEIN_HEX, 1.6))

VOXEL, DETAIL, FINE = 0.022, 0.012, 0.007
WALK_FRAMES, WALK_SPEED = 36, 1.15
THROW_FRAMES, THROW_HIT = 39, 21
CHARGE_FRAMES, CHARGE_HIT, CHARGE_END = 72, 27, 60
STUCK_FRAMES = 66
SUMMON_FRAMES, SUMMON_HIT = 45, 30
CHANGE_FRAMES = 90
SUN_WALK_FRAMES, SUN_WALK_SPEED = 24, 1.3
SUN_THROW_FRAMES, SUN_THROW_HIT = 33, 18
ROLL_FRAMES, ROLL_HIT, ROLL_END = 72, 27, 60
SUN_STUCK_FRAMES = 60
RAIN_FRAMES, RAIN_HIT = 54, 33
SPIN_FRAMES, SPIN_HIT = 60, 36
SUN_SUMMON_FRAMES, SUN_SUMMON_HIT = 42, 27
RAISE_FRAMES, RAISE_HIT, RAISE_HEAVE = 84, 27, 63
DEATH_FRAMES = 72


def crag(P, f=6.0, seed=0.0):
    """A smooth craggy noise in -1..1 (sums of products of warped sines): stone that is not round."""
    x, y, z = P[..., 0] * f + seed, P[..., 1] * f + 1.3 * seed, P[..., 2] * f - 0.7 * seed
    a = np.sin(x + 1.7 * np.sin(0.8 * y + 0.3))
    b = np.sin(1.3 * y + 1.4 * np.sin(0.9 * z + 1.1))
    c = np.sin(1.1 * z + 1.6 * np.sin(1.2 * x + 2.3))
    return (a * b + b * c + c * a) / 3


# --- body plan: the moose ---------------------------------------------------------
BODY_C, BODY_HALF, BODY_ROUND = V((0, 0.12, 1.2)), (0.4, 0.82, 0.36), 0.2
NECK = [V((0, -0.5, 1.32)), V((0, -0.8, 1.78)), V((0, -0.98, 2.12))]
NECK_R = (0.27, 0.22, 0.19)
HEAD_C, HEAD_R = V((0, -1.06, 2.27)), (0.27, 0.29, 0.26)
SNOUT = (V((0, -1.2, 2.22)), V((0, -1.5, 2.07)), 0.19, 0.14)
SNOUT_TIP = V((0, -1.66, 2.06))
EYES = {s: V((sign * 0.205, -1.2, 2.36)) for s, sign in SIDES}
EYE_R = 0.066
MOUTH_C, MOUTH_R = V((0, -1.37, 2.035)), (0.158, 0.2, 0.03)
HIND_PIVOT = V((0, 0.76, 0.98))
LEGS = {f"{k}.{s}": (V((sign * 0.27, y, 0.98)), V((sign * 0.285, y + (-0.03 if k == "fore" else 0.04), 0.52)), V((sign * 0.285, y, 0.09)))
        for k, y in (("fore", -0.5), ("hind", 0.76)) for s, sign in SIDES}
LEG_R = (0.21, 0.185, 0.19)
HOOF_HALF = (0.19, 0.21, 0.09)
REST_FEET = {name: pts[2].copy() for name, pts in LEGS.items()}
CRESTS = (-0.36, 0.12, 0.56)    # where the little antler crowns stand along his back (y)


def antler(sign):
    """His antler on one side: [(points, radii)], the beam first, then its tines (wavy, upwards)."""
    s = sign
    beam = ([V((s * 0.13, -1.04, 2.47)), V((s * 0.42, -1.0, 2.66)), V((s * 0.72, -0.96, 2.8)), V((s * 0.98, -0.93, 3.03)),
             V((s * 1.1, -0.92, 3.33))], (0.088, 0.074, 0.064, 0.054, 0.04))
    tines = [([V((s * 0.3, -1.02, 2.6)), V((s * 0.31, -1.27, 2.78)), V((s * 0.38, -1.4, 2.98))], (0.052, 0.042, 0.03)),
             ([V((s * 0.46, -0.99, 2.68)), V((s * 0.42, -1.02, 2.98)), V((s * 0.5, -1.0, 3.3))], (0.056, 0.046, 0.032)),
             ([V((s * 0.72, -0.96, 2.8)), V((s * 0.69, -0.95, 3.12)), V((s * 0.78, -0.94, 3.44))], (0.056, 0.046, 0.032)),
             ([V((s * 0.98, -0.93, 3.03)), V((s * 1.24, -0.92, 3.12)), V((s * 1.4, -0.92, 3.3))], (0.05, 0.042, 0.03))]
    return [beam] + tines


def crest(y):
    """A little antler crown standing up from his back at y: a stem and two branches."""
    top = BODY_C.z + BODY_HALF[2] - 0.05
    stem = V((0, y, top))
    up = V((0, y - 0.02, top + 0.3))
    return [([stem, up, V((0, y - 0.05, top + 0.48))], (0.06, 0.048, 0.03)),
            ([up, V((0.15, y - 0.03, top + 0.42)), V((0.2, y - 0.05, top + 0.56))], (0.045, 0.036, 0.026)),
            ([up, V((-0.15, y - 0.01, top + 0.4)), V((-0.21, y, top + 0.52))], (0.045, 0.036, 0.026))]


def torso_sdf(P):
    d = F._sd_round_box(P, BODY_C, BODY_HALF, BODY_ROUND)
    # a little sag in the middle of the back, the shoulders over the forelegs a bit higher
    return d - 0.05 * np.exp(-((P[..., 1] + 0.45) / 0.3) ** 2) * (P[..., 2] > BODY_C.z)


def neck_sdf(P):
    return K.tapered_tube(P, NECK, NECK_R)


def head_sdf(P):
    a, b, r1, r2 = SNOUT
    return K.smin(K.ellipsoid(P, HEAD_C, HEAD_R), K.round_cone(P, a, b, r1, r2), 0.1)


def leg_sdf(P, name):
    a, m, p = LEGS[name]
    return K.tapered_tube(P, [a, m, p], LEG_R)


def moose_sdf(P):
    d = K.smin(torso_sdf(P), neck_sdf(P), 0.18)
    d = K.smin(d, head_sdf(P), 0.12)
    for name in LEGS:
        d = K.smin(d, leg_sdf(P, name), 0.1)
    # his mouth: a groove round the snout, the darkness in it another part
    c, r = MOUTH_C, MOUTH_R
    d = K.smax(d, -K.ellipsoid(P, c, (r[0] + 0.02, r[1] + 0.01, r[2] + 0.012)), 0.015)
    return d + 0.03 * crag(P, 6.0, 1.0)


def mossy(lo_z, seed, inside=None):
    """A part's quads: moss in craggy patches on top (above lo_z, and where `inside` says), stone
    elsewhere."""
    def mat(Cq):
        n = crag(Cq, 5.0, seed)
        on = (Cq[:, 2] > lo_z) & (n > 0.18)
        if inside is not None:
            on &= inside(Cq)
        return np.where(on, MOSS_M, STONE_M)
    return mat


def hoof_sdf(P, name):
    p = LEGS[name][2]
    return F._sd_round_box(P, p + V((0, -0.02, -0.005)), HOOF_HALF, 0.06)


def teeth_sdf(P):
    """A row of jagged teeth along each side of his mouth, up and down in turn."""
    d = None
    for _, sign in SIDES:
        for i in range(6):
            y = -1.22 - 0.055 * i
            x = sign * (0.15 - 0.012 * i)
            up = i % 2 == 0
            base = V((x, y, MOUTH_C.z + (-0.028 if up else 0.028)))
            tip = base + V((0, 0, 0.07 if up else -0.07))
            t = K.round_cone(P, base, tip, 0.022, 0.004)
            d = t if d is None else np.minimum(d, t)
    return d


# --- body plan: the sun -----------------------------------------------------------
SUN_C, SUN_R = V((0, 0, 1.62)), 0.8
RAYS = [D(a) for a in range(-150, 151, 30)]     # from the up direction towards +x (left): 11 of them, none at the bottom
SUN_EYES = {s: V((sign * 0.26, -0.7, 1.8)) for s, sign in SIDES}
SUN_EYE_R = 0.08
SUN_MOUTH_C, SUN_MOUTH_R = V((0, -0.72, 1.36)), (0.34, 0.1, 0.07)
SLEGS = {s: (V((sign * 0.3, 0.02, 1.0)), V((sign * 0.33, -0.07, 0.52)), V((sign * 0.32, 0, 0.09))) for s, sign in SIDES}
SLEG_R = (0.18, 0.16, 0.17)
REST_SFEET = {s: pts[2].copy() for s, pts in SLEGS.items()}


def ray_dir(a):
    return V((math.sin(a), 0, math.cos(a)))


def ray(i):
    """Ray i, an antler sticking out of the ball: [(points, radii)], its beam, then a tine."""
    a = RAYS[i]
    d, side = ray_dir(a), V((math.cos(a), 0, -math.sin(a))) * (1 if i % 2 else -1)
    fwd = V((0, -0.08, 0))
    base, mid, tip = SUN_C + d * 0.66, SUN_C + d * 1.12 + side * 0.07 + fwd, SUN_C + d * 1.62 - side * 0.03 + fwd * 1.5
    tine = mid + (d * 0.6 + side * 0.8).normalized() * 0.36 + fwd
    return [([base, mid, tip], (0.095, 0.068, 0.036)), ([mid, tine], (0.05, 0.03))]


def ball_sdf(P):
    d = np.linalg.norm(P - np.asarray(SUN_C, np.float32), axis=-1) - SUN_R
    for s, _ in SIDES:
        e = SUN_EYES[s]
        brow = e + V((0, -0.01, 0.13))
        d = K.smin(d, K.ellipsoid(P, brow, (0.19, 0.1, 0.07)), 0.06)                  # a heavy brow
        d = K.smax(d, -K.ellipsoid(P, e, (0.12, 0.12, 0.1)), 0.03)                    # the socket under it
    d = K.smax(d, -K.ellipsoid(P, SUN_MOUTH_C, SUN_MOUTH_R), 0.02)                    # the mouth
    d = K.smin(d, K.ellipsoid(P, V((0, -0.82, 1.6)), (0.09, 0.08, 0.13)), 0.05)        # a craggy nose
    return d + 0.03 * crag(P, 5.0, 4.0)


def sun_teeth_sdf(P):
    d = None
    c, r = SUN_MOUTH_C, SUN_MOUTH_R
    for i in range(9):
        x = -0.27 + 0.0675 * i
        up = i % 2 == 0
        z = c.z + (-r[2] + 0.005 if up else r[2] - 0.005)
        y = -math.sqrt(max(0.0, SUN_R ** 2 - x * x - (z - SUN_C.z) ** 2)) + 0.03
        base = V((x, y, z))
        t = K.round_cone(P, base, base + V((0, 0, 0.075 if up else -0.075)), 0.028, 0.005)
        d = t if d is None else np.minimum(d, t)
    return d


def sleg_sdf(P, s):
    return K.tapered_tube(P, list(SLEGS[s]), SLEG_R)


def sfoot_sdf(P, s):
    return F._sd_round_box(P, SLEGS[s][2] + V((0, -0.03, -0.005)), (0.18, 0.21, 0.09), 0.06)


# --- the floating stones ------------------------------------------------------------
STONES = 5
STONE_R = (0.15, 0.13, 0.16, 0.12, 0.14)
RING_M = (V((0, -1.0, 3.1)), 0.34)       # where they float round over his head (moose), and its radius
RING_S = (V((0, -0.42, 2.62)), 0.32)     # ... over the ball (sun)


def ring_point(ring, i, orbit=0.0, bob=0.0):
    c, r = ring
    a = TAU * i / STONES + orbit
    return c + V((r * math.cos(a), r * 0.75 * math.sin(a), 0.07 * (1 if i % 2 else -1) + bob))


REST_STONES = [ring_point(RING_M, i) for i in range(STONES)]


def stone_sdf(P, c, r, seed):
    return K.ellipsoid(P, c, (r * 1.1, r * 0.95, r * 0.85)) + 0.02 * crag(P, 18.0, seed)


def veins(seed, f=16.0):
    def mat(Cq):
        return np.where(np.abs(crag(Cq, f, seed + 7)) < 0.045, VEIN_M, PEBBLE_M)
    return mat


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = V((-0.62, -1.8, -0.02)), V((0.62, 1.12, 2.6))
    parts.add("moose", moose_sdf, lo, hi, VOXEL, mat=mossy(BODY_C.z + 0.24, 2.0, lambda Cq: Cq[:, 1] > -0.55))
    c, r = MOUTH_C, MOUTH_R
    parts.add("head", lambda P: K.ellipsoid(P, c, r), c - V(r) - V((0.03,) * 3), c + V(r) + V((0.03,) * 3), FINE, mat=MOUTH_M)
    parts.add("head", teeth_sdf, c - V((0.22, 0.3, 0.12)), c + V((0.22, 0.3, 0.12)), FINE * 0.7, mat=TEETH_M)
    for s, _ in SIDES:
        e = EYES[s]
        parts.add("head", lambda P, c=e: K.ellipsoid(P, c, (EYE_R * 0.7, EYE_R, EYE_R)), e - V((0.1,) * 3), e + V((0.1,) * 3), FINE, mat=EYE_M)
    for s, sign in SIDES:
        branches = antler(sign)
        lo, hi = K.bounds([p for pts, _ in branches for p in pts], 0.12)
        parts.add("head", lambda P, b=branches: min_tubes(P, b), lo, hi, DETAIL, mat=ANTLER_M)
    for y in CRESTS:
        branches = crest(y)
        lo, hi = K.bounds([p for pts, _ in branches for p in pts], 0.1)
        parts.add("body", lambda P, b=branches: min_tubes(P, b), lo, hi, DETAIL, mat=ANTLER_M)
    for name in LEGS:
        p = LEGS[name][2]
        parts.add(f"lower.{name}", lambda P, n=name: hoof_sdf(P, n), p - V((0.24, 0.26, 0.14)), p + V((0.24, 0.26, 0.14)), FINE * 1.4, mat=DARK_M)
    # the sun
    lo, hi = SUN_C - V((SUN_R + 0.12,) * 3), SUN_C + V((SUN_R + 0.12,) * 3)
    parts.add("ball", ball_sdf, lo, hi, DETAIL * 1.2, mat=mossy(SUN_C.z + 0.5, 5.0))
    for s, _ in SIDES:
        e = SUN_EYES[s]
        parts.add("ball", lambda P, c=e: K.ellipsoid(P, c + V((0, 0.02, 0)), (SUN_EYE_R,) * 3), e - V((0.12,) * 3), e + V((0.12,) * 3), FINE, mat=EYE_M)
    c, r = SUN_MOUTH_C, SUN_MOUTH_R
    parts.add("ball", lambda P: K.ellipsoid(P, c + V((0, 0.05, 0)), (r[0] - 0.02, 0.05, r[2] - 0.01)), c - V((0.4, 0.15, 0.12)),
              c + V((0.4, 0.15, 0.12)), FINE, mat=MOUTH_M)
    parts.add("ball", sun_teeth_sdf, c - V((0.36, 0.2, 0.18)), c + V((0.36, 0.2, 0.18)), FINE * 0.8, mat=TEETH_M)
    for i in range(len(RAYS)):
        branches = ray(i)
        lo, hi = K.bounds([p for pts, _ in branches for p in pts], 0.12)
        parts.add(f"ray.{i}", lambda P, b=branches: min_tubes(P, b), lo, hi, DETAIL, mat=ANTLER_M)
    for s, _ in SIDES:
        lo, hi = K.bounds(SLEGS[s], 0.22)
        parts.add(f"sleg.{s}", lambda P, s=s: sleg_sdf(P, s), lo, hi, DETAIL, mat=STONE_M)
        p = SLEGS[s][2]
        parts.add(f"slower.{s}", lambda P, s=s: sfoot_sdf(P, s), p - V((0.24, 0.26, 0.14)), p + V((0.24, 0.26, 0.14)), FINE * 1.4, mat=DARK_M)
    # the floating stones
    for i in range(STONES):
        c, r = REST_STONES[i], STONE_R[i]
        parts.add(f"stone.{i}", lambda P, c=c, r=r, i=i: stone_sdf(P, c, r, i * 3.1), c - V((r * 1.4,) * 3), c + V((r * 1.4,) * 3),
                  FINE * 1.5, mat=veins(i * 3.1))
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "monteur"
    obj["stone_color"] = STONE_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def min_tubes(P, branches):
    """The hard union of tapered tubes (an antler and its tines), softly joined."""
    d = None
    for pts, radii in branches:
        t = K.tapered_tube(P, pts, radii)
        d = t if d is None else K.smin(d, t, 0.035)
    return d


def build_prop(coll):
    """The stone he throws (and rains down): a craggy rock with glowing cracks, round the origin."""
    parts = K.Parts()
    c, r = V((0, 0, 0)), 0.17
    parts.add("stone", lambda P: stone_sdf(P, c, r, 11.0), (-0.26,) * 3, (0.26,) * 3, 0.008,
              mat=lambda Cq: np.where(np.abs(crag(Cq, 16.0, 18.0)) < 0.045, 1, 0))
    obj = parts.mesh(PROP, coll, PROP_MATERIALS)
    F.decimate(obj, 600)
    return obj


# --- rig / skin --------------------------------------------------------------
LEG_NAMES = tuple(LEGS)


def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("moose", BODY_C, BODY_C + V((0, 0, 0.3)), "root", False, fwd),
             ("body", BODY_C + V((0, 0.6, 0)), BODY_C + V((0, -0.55, 0)), "moose", True, up),
             ("neck", NECK[0], NECK[2], "body", True, fwd),
             ("head", NECK[2], SNOUT_TIP, "neck", True, up)]
    for name, (a, m, p) in LEGS.items():
        bones += [(f"upper.{name}", a, m, "body", True, fwd), (f"lower.{name}", m, p, f"upper.{name}", True, fwd)]
    bones += [("sun", SUN_C, SUN_C + V((0, 0, 0.3)), "root", False, fwd),
              ("ball", SUN_C, SUN_C + V((0, -0.5, 0)), "sun", True, up)]
    for i, a in enumerate(RAYS):
        d = ray_dir(a)
        bones.append((f"ray.{i}", SUN_C + d * 0.66, SUN_C + d * 1.62, "ball", True, (0, -1, 0)))
    for s, (a, m, p) in SLEGS.items():
        bones += [(f"supper.{s}", a, m, "ball", True, fwd), (f"slower.{s}", m, p, f"supper.{s}", True, fwd)]
    for i, c in enumerate(REST_STONES):
        bones.append((f"stone.{i}", c, c + V((0, 0, 0.15)), "root", True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "monteur", "forward": "-Y", "attack_style": "boss", "normal_speed": WALK_SPEED, "root_motion": False})


def chain(Q, pts, bones, blend=0.05, lead=None, lead_len=0.08):
    """Distance to a joint polyline and smooth per-bone weights along it (blender/firecat.py)."""
    d, along = C._polyline_closest(Q, pts)
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
    return d, w


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        Q = P[lo:hi]
        if kind == "moose":
            dists, groups = [torso_sdf(Q)], [{"body": np.ones(len(Q))}]
            _, w = chain(Q, NECK, ["neck", "neck"], blend=0.08, lead="body", lead_len=0.12)
            dists.append(neck_sdf(Q)); groups.append(w)
            dists.append(head_sdf(Q)); groups.append({"head": np.ones(len(Q))})
            for name in LEGS:
                a, m, p = LEGS[name]
                _, w = chain(Q, [a, m, p], [f"upper.{name}", f"lower.{name}"], blend=0.06, lead="body", lead_len=0.1)
                dists.append(leg_sdf(Q, name)); groups.append(w)
            dm = np.stack(dists, axis=1)
            membership = np.exp(-(dm - dm.min(axis=1, keepdims=True)) / 0.015)
            membership /= membership.sum(axis=1, keepdims=True)
            WB = np.zeros((len(Q), len(names)), np.float32)
            for k, values in enumerate(groups):
                for name, value in values.items():
                    WB[:, names.index(name)] += membership[:, k] * value
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 6)
        elif kind.startswith("sleg."):
            s = kind.split(".")[1]
            a, m, p = SLEGS[s]
            _, w = chain(Q, [a, m, p], [f"supper.{s}", f"slower.{s}"], blend=0.06, lead="ball", lead_len=0.12)
            WB = np.zeros((len(Q), len(names)), np.float32)
            for name, value in w.items():
                WB[:, names.index(name)] += value
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
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
    for name, roughness in (("MonteurStone", 0.85), ("MonteurDark", 0.8), ("MonteurAntlers", 0.7), ("MonteurMoss", 0.95),
                            ("MonteurEyes_glow", 0.3), ("MonteurTeeth", 0.5), ("MonteurMouth", 0.9), ("MonteurPebbles", 0.8),
                            ("MonteurVeins_glow", 0.4)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
def T(v):
    return Matrix.Translation(v)


def about(point, R3):
    return K.about(point, R3)


def params(**kw):
    p = {"t": 0.0,
         "mk": 1.0, "sk": 0.001,                       # how big the moose and the sun are (one of them hidden)
         # the moose: the body (about `pivot`), the neck and the head, the feet (where they stand,
         # `ride`: 1 = carried along with the body instead)
         "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pivot": BODY_C,
         "neck": (0.0, 0.0), "head": (0.0, 0.0, 0.0),
         "feet": {k: v.copy() for k, v in REST_FEET.items()}, "ride": {k: 0.0 for k in REST_FEET},
         # the sun: the ball (about its middle), rolling over (`spin`, forward), squashed (across, up),
         # its rays waving (time, strength), flaring out (rad), drooping (1: down along it); its feet
         # (`tuck`: pulled up under it)
         "spos": V(), "spitch": 0.0, "sroll": 0.0, "syaw": 0.0, "spin": 0.0, "squash": (1.0, 1.0),
         "wave": (0.0, 1.0), "flare": 0.0, "droop": 0.0,
         "sfeet": {k: v.copy() for k, v in REST_SFEET.items()}, "tuck": 0.0,
         # the stones: round over the moose's head or the sun (`stone_form`: 0 .. 1 between them),
         # turned round the ring (`orbit`), bobbing (`bob`: time), raised (`stone_up`), dropped to
         # the floor (`stone_drop`), sized (`stone_k`)
         "orbit": 0.0, "bob": 0.0, "stone_form": 0.0, "stone_up": 0.0, "stone_drop": 0.0, "stone_k": 1.0}
    p.update(kw)
    return p


def frame_along(head, direction, base_rot):
    """A bone at `head` pointing along `direction`, swung the least from `base_rot` (3x3)."""
    y = base_rot.col[1].normalized()
    swing = y.rotation_difference(direction.normalized()).to_matrix()
    return T(head) @ (swing @ base_rot).to_4x4()


DROP = [V((0.6 * math.cos(TAU * i / STONES + 0.4), -0.5 + 0.6 * math.sin(TAU * i / STONES + 0.4), r * 0.85)) for i, r in enumerate(STONE_R)]


def solver(rig):
    skel = C.Skeleton(rig)
    rest, rot = skel.rest, skel.rest_rot
    length = {b.name: b.length for b in rig.data.bones}
    order = [b.name for b in rig.data.bones]

    def moose(p, out):
        R = (C.rot_z(p["yaw"]) @ C.rot_x(p["pitch"]) @ C.rot_y(p["roll"]))
        B = T(p["pos"]) @ about(p["pivot"], R)
        out["moose"] = B @ rest["moose"]
        out["body"] = B @ rest["body"]
        N = B @ about(NECK[0], C.rot_x(p["neck"][0]) @ C.rot_z(p["neck"][1]))
        out["neck"] = N @ rest["neck"]
        hp, hy, hr = p["head"]
        H = N @ about(NECK[2], C.rot_x(hp) @ C.rot_z(hy) @ C.rot_y(hr))
        out["head"] = H @ rest["head"]
        B3 = B.to_3x3()
        for name in LEGS:
            up, lo = f"upper.{name}", f"lower.{name}"
            hip = B @ LEGS[name][0]
            target = p["feet"][name].lerp(B @ REST_FEET[name], p["ride"][name])
            pole = B3 @ (V((0, -1, 0.1)) if name.startswith("fore") else V((0, 1, 0.1)))
            knee, foot = C.two_bone_ik(hip, target, length[up], length[lo], pole)
            out[up] = frame_along(hip, knee - hip, B3 @ rot[up])
            out[lo] = frame_along(knee, foot - knee, B3 @ rot[lo])
        return H

    def sun(p, out):
        R = (C.rot_z(p["syaw"]) @ C.rot_x(p["spitch"]) @ C.rot_y(p["sroll"]))
        sx, sz = p["squash"]
        Sn = T(p["spos"]) @ about(SUN_C, R)
        Sb = Sn @ about(SUN_C, C.rot_x(p["spin"])) @ about(SUN_C, Matrix.Diagonal((sx, sx, sz)))
        out["sun"] = Sn @ rest["sun"]
        out["ball"] = Sb @ rest["ball"]
        t, amp = p["wave"]
        for i, a in enumerate(RAYS):
            base = SUN_C + ray_dir(a) * 0.66
            turn = amp * D(7) * math.sin(TAU * t + 1.9 * i) + math.copysign(1, a or 1) * (p["flare"] + p["droop"] * (math.pi - abs(a)) * 0.55)
            out[f"ray.{i}"] = Sb @ about(base, Matrix.Rotation(turn, 3, "Y")) @ rest[f"ray.{i}"]
        N3 = Sn.to_3x3()
        for s in SLEGS:
            up, lo = f"supper.{s}", f"slower.{s}"
            hip = Sn @ about(SUN_C, Matrix.Diagonal((sx, sx, sz))) @ SLEGS[s][0]
            tucked = Sn @ (SLEGS[s][0] + V((0, -0.1, -0.42)))
            target = p["sfeet"][s].lerp(tucked, p["tuck"])
            knee, foot = C.two_bone_ik(hip, target, length[up], length[lo], N3 @ V((0, -1, 0.1)))
            out[up] = frame_along(hip, knee - hip, N3 @ rot[up])
            out[lo] = frame_along(knee, foot - knee, N3 @ rot[lo])
        return Sn

    def stones(p, H, Sn, out):
        u = p["stone_form"]
        for i in range(STONES):
            bob = 0.05 * math.sin(TAU * p["bob"] + 1.7 * i)
            a = H @ ring_point(RING_M, i, p["orbit"], bob)
            b = Sn @ ring_point(RING_S, i, p["orbit"], bob)
            at = a.lerp(b, u) + V((0, 0, 0.9 * math.sin(math.pi * u) + p["stone_up"] * (1 + 0.15 * i)))
            at = at.lerp(DROP[i], p["stone_drop"])
            spin = Euler((0.6 * math.sin(TAU * p["bob"] + i), 0.5 * math.cos(TAU * p["bob"] + 2 * i), p["orbit"] + i)).to_matrix()
            k = max(0.001, p["stone_k"])
            out[f"stone.{i}"] = T(at) @ (spin @ Matrix.Diagonal((k, k, k))).to_4x4() @ T(-REST_STONES[i]) @ rest[f"stone.{i}"]

    def solve(f, lift, fn):
        p = fn(f)
        out = {}
        H = moose(p, out)
        Sn = sun(p, out)
        stones(p, H, Sn, out)
        L = T((0, 0, lift))
        Sm = about(BODY_C + p["pos"], Matrix.Diagonal((max(0.001, p["mk"]),) * 3))
        Ss = about(SUN_C + p["spos"], Matrix.Diagonal((max(0.001, p["sk"]),) * 3))
        moose_bones = {"moose", "body", "neck", "head", *(f"{k}.{n}" for k in ("upper", "lower") for n in LEGS)}
        out["root"] = rest["root"]
        poses, bases = {}, {}
        for name in order:
            M = out[name]
            if name in moose_bones:
                M = Sm @ M
            elif name != "root" and not name.startswith("stone."):
                M = Ss @ M
            bases[name] = skel.set(name, poses, L @ M)
        return bases
    return lambda fn: (lambda f, lift: solve(f, lift, fn))


# --- the clips -----------------------------------------------------------------
k_ = C.keyframes


def gait(t, period, speed, duty, lift, offsets, rest, skew=0.9):
    feet = {}
    stride = speed * duty * period
    for name, off in offsets.items():
        y, z = C.foot_track(((t / period) + off) % 1, duty, stride, lift, speed, period, skew=skew)
        feet[name] = rest[name] + V((0, y, z))
    return feet


WALK_OFFSETS = {"hind.L": 0.0, "fore.L": 0.75, "hind.R": 0.5, "fore.R": 0.25}


def walk(f):
    Tp = WALK_FRAMES / FPS
    t = f / FPS
    w = TAU * t / Tp
    return params(t=t, feet=gait(t, Tp, WALK_SPEED, 0.64, 0.1, WALK_OFFSETS, REST_FEET),
                  pos=V((0.015 * math.sin(w), 0, 0.025 * math.cos(2 * w))), roll=D(2.5) * math.sin(w), yaw=D(1.5) * math.sin(w + 0.4),
                  neck=(D(3) * math.cos(2 * w), D(2) * math.sin(w)), head=(D(-3) * math.cos(2 * w + 0.5), D(3) * math.sin(w - 0.5), 0),
                  orbit=D(20) * math.sin(w), bob=t / Tp)


def idle_moose(f, **kw):
    """The moose standing, breathing (a loop of WALK_FRAMES), with some parameters replaced."""
    w = TAU * f / WALK_FRAMES
    p = params(t=f / FPS, pos=V((0, 0, 0.012 * math.sin(w))), neck=(D(1.5) * math.sin(w), 0), orbit=D(20) * math.sin(w),
               bob=f / WALK_FRAMES)
    p.update(kw)
    return p


def throw(f):
    t, hit = f / FPS, THROW_HIT / FPS
    back = k_((0, 0), (hit - 0.15, 1), (hit, -0.6), (hit + 0.25, -0.3), (THROW_FRAMES / FPS, 0))(t)
    return idle_moose(f, neck=(D(-16) * back, 0), head=(D(-18) * back, 0, 0), pitch=D(-3) * back,
                      stone_up=0.12 * max(0, back), orbit=D(40) * back)


def charge(f):
    t, hit, end = f / FPS, CHARGE_HIT / FPS, CHARGE_END / FPS
    low = k_((0, 0), (0.4, 1), (end, 1), (end + 0.3, 0))(t)
    feet = {n: v.copy() for n, v in REST_FEET.items()}
    # scraping a hoof before the run
    scrape = math.sin(TAU * 2.2 * t) * k_((0, 0), (0.15, 1), (hit - 0.15, 1), (hit, 0))(t)
    feet["fore.R"] = REST_FEET["fore.R"] + V((0, 0.12 + 0.18 * scrape, 0.05 * max(0, -scrape) + 0.03 * k_((0, 0), (0.15, 1), (hit, 0))(t)))
    run = k_((0, 0), (hit - 0.05, 0), (hit + 0.1, 1), (end - 0.05, 1), (end + 0.15, 0))(t)
    if run > 0:
        Tp = 0.4
        g = gait(t - hit, Tp, 0.9 / (0.38 * Tp), 0.38, 0.22, {"hind.L": 0.0, "hind.R": 0.1, "fore.L": 0.55, "fore.R": 0.45}, REST_FEET, skew=0.8)
        feet = {n: feet[n].lerp(g[n], run) for n in feet}
    w = TAU * (t - hit) / 0.4
    return idle_moose(f, feet=feet, neck=(D(32) * low, 0), head=(D(26) * low + D(4) * run * math.sin(w), 0, 0),
                      pitch=D(6) * low + D(3) * run * math.sin(w + 1), pos=V((0, 0, -0.06 * low + 0.06 * run * abs(math.sin(w / 2)))),
                      orbit=D(20) + 2.5 * run * t, stone_up=-0.1 * low)


def stuck(f):
    t = f / FPS
    crash = k_((0, 0), (0.12, 1), (1.6, 1), (2.1, 0))(t)
    jolt = k_((0, 0), (0.1, 1), (0.35, 0))(t)
    daze = k_((0, 0), (0.4, 0), (0.6, 1), (1.4, 1), (1.7, 0))(t)
    shake = math.sin(TAU * 2.5 * t) * daze
    return idle_moose(f, neck=(D(44) * crash, D(10) * shake), head=(D(30) * crash, D(14) * shake, D(8) * shake), pivot=HIND_PIVOT,
                      pitch=D(9) * crash, pos=V((0, -0.12 * jolt, -0.04 * crash)), roll=D(4) * shake,
                      orbit=TAU * 1.2 * t * daze, stone_up=-0.25 * crash + 0.1 * daze)


def summon(f):
    t, hit = f / FPS, SUMMON_HIT / FPS
    rear = k_((0, 0), (hit - 0.3, 1), (hit, -0.05), (hit + 0.2, 0.04), (SUMMON_FRAMES / FPS, 0))(t)
    ride = {n: (1.0 if n.startswith("fore") else 0.0) * k_((0, 0), (0.3, 1), (hit - 0.05, 1), (hit, 0))(t) for n in REST_FEET}
    return idle_moose(f, pivot=HIND_PIVOT, pitch=D(-30) * rear, ride=ride, neck=(D(-18) * rear, 0), head=(D(-12) * rear, 0, 0),
                      stone_up=0.15 * max(0, rear))


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def change(f):
    t = f / FPS
    rear = k_((0, 0), (0.7, 1), (1.0, 0.8), (1.3, 0))(t)
    ride = {n: (1.0 if n.startswith("fore") else 0.0) * k_((0, 0), (0.3, 1), (1.1, 1), (1.3, 0))(t) for n in REST_FEET}
    shrink = ease((t - 1.1) / 0.8)
    grow = ease((t - 1.5) / 0.75)
    over = math.sin(math.pi * ease((t - 1.9) / 0.7)) * 0.12
    shiver = math.sin(TAU * 13 * t) * k_((0, 0), (1.0, 0), (1.3, 1), (1.9, 0))(t)
    p = idle_moose(f, pivot=HIND_PIVOT, pitch=D(-26) * rear, ride=ride, neck=(D(-20) * rear, 0), head=(D(-16) * rear, 0, D(6) * shiver),
                   yaw=D(160) * shrink, roll=D(3) * shiver, mk=1 - shrink)
    w = TAU * t / (SUN_WALK_FRAMES / FPS)
    p.update(sk=grow + over, syaw=-D(200) * (1 - grow), wave=(t, 1 + 2 * grow), stone_form=ease((t - 1.0) / 1.3),
             orbit=TAU * 0.6 * ease((t - 0.9) / 1.6), bob=t)
    return p


def sun_idle(f, **kw):
    """The sun standing (a loop of SUN_WALK_FRAMES), with some parameters replaced."""
    w = TAU * f / SUN_WALK_FRAMES
    p = params(t=f / FPS, mk=0.001, sk=1.0, stone_form=1.0, spos=V((0, 0, 0.02 * math.sin(w))), wave=(f / SUN_WALK_FRAMES, 1.0),
               orbit=D(20) * math.sin(w), bob=f / SUN_WALK_FRAMES)
    p.update(kw)
    return p


def sun_walk(f):
    Tp = SUN_WALK_FRAMES / FPS
    t = f / FPS
    w = TAU * t / Tp
    return sun_idle(f, sfeet=gait(t, Tp, SUN_WALK_SPEED, 0.6, 0.14, {"L": 0.0, "R": 0.5}, REST_SFEET),
                    spos=V((0.04 * math.sin(w), 0, 0.04 * abs(math.cos(w)))), sroll=D(7) * math.sin(w), syaw=D(4) * math.sin(w))


def sun_throw(f):
    t, hit = f / FPS, SUN_THROW_HIT / FPS
    back = k_((0, 0), (hit - 0.15, 1), (hit, -0.8), (hit + 0.2, -0.3), (SUN_THROW_FRAMES / FPS, 0))(t)
    return sun_idle(f, spitch=D(-14) * back, spos=V((0, 0.06 * back, 0.03 * abs(back))), flare=D(6) * max(0, back),
                    stone_up=0.15 * max(0, back), orbit=D(40) * back)


def roll(f):
    t, hit, end = f / FPS, ROLL_HIT / FPS, ROLL_END / FPS
    crouch = k_((0, 0), (hit - 0.1, 1), (hit + 0.15, 0.4), (end, 0.4), (end + 0.3, 0))(t)
    tuck = k_((0, 0), (hit - 0.3, 1), (end, 1), (end + 0.25, 0))(t)
    u = min(1.0, max(0.0, (t - hit) / (end - hit)))
    spin = -D(25) * k_((0, 0), (hit - 0.1, 1), (hit, 0))(t) + 2 * TAU * (u * u * (3 - 2 * u) * 0.25 + u * 0.75)
    return sun_idle(f, spos=V((0, 0, -0.12 * crouch)), squash=(1 + 0.08 * crouch, 1 - 0.1 * crouch), tuck=tuck, spin=spin,
                    flare=D(-8) * tuck, stone_up=0.35 * tuck, orbit=D(20) + 3 * tuck * t)


def sun_stuck(f):
    t = f / FPS
    over = k_((0, 0), (0.25, 1), (1.5, 1), (1.85, 0))(t)
    rock = math.sin(TAU * 2.2 * t) * k_((0, 0), (0.3, 0), (0.5, 1), (1.4, 1), (1.6, 0))(t)
    kick = math.sin(TAU * 3.5 * t) * over
    feet = {s: REST_SFEET[s] + V((0, 0.2 * kick * (1 if s == "L" else -1), 0)) for s in REST_SFEET}
    return sun_idle(f, spitch=D(-62) * over, sroll=D(9) * rock, spos=V((0, 0.35 * over, -0.2 * over)), tuck=0.6 * over, sfeet=feet,
                    droop=0.25 * over, orbit=TAU * 1.3 * t * over, stone_up=0.1 * over)


def rain(f):
    t, hit = f / FPS, RAIN_HIT / FPS
    crouch = k_((0, 0), (hit - 0.15, 1), (hit, -0.6), (hit + 0.3, -0.2), (RAIN_FRAMES / FPS, 0))(t)
    up = k_((0, 0), (hit - 0.1, 0), (hit + 0.15, 1.3), (hit + 0.45, 0))(t)
    shake = math.sin(TAU * 9 * t) * k_((0, 0), (0.3, 0), (hit - 0.15, 1), (hit, 0))(t)
    return sun_idle(f, spos=V((0.02 * shake, 0, -0.14 * crouch)), squash=(1 + 0.08 * crouch, 1 - 0.1 * crouch), flare=D(-10) * crouch,
                    sroll=D(3) * shake, wave=(t, 1 + 2 * abs(crouch)), stone_up=up, orbit=D(20) + 2 * t)


def spin(f):
    t, hit = f / FPS, SPIN_HIT / FPS
    u = ease((t - 0.25) / 1.5)
    pulse = k_((0, 0), (hit - 0.1, 0), (hit, 1), (hit + 0.3, 0))(t)
    return sun_idle(f, syaw=2 * TAU * u, flare=D(14) * math.sin(math.pi * u), squash=(1 + 0.06 * pulse, 1 - 0.06 * pulse),
                    wave=(t, 1 + 2 * math.sin(math.pi * u)), orbit=TAU * 2 * u, stone_up=0.2 * math.sin(math.pi * u))


def sun_summon(f):
    t, hit = f / FPS, SUN_SUMMON_HIT / FPS
    hop = k_((0, 0), (0.3, -0.4), (hit - 0.3, 1), (hit, 0), (hit + 0.15, -0.5), (SUN_SUMMON_FRAMES / FPS, 0))(t)
    return sun_idle(f, spos=V((0, 0, 0.3 * max(0, hop) - 0.1 * max(0, -hop))), squash=(1 - 0.06 * hop, 1 + 0.08 * hop),
                    tuck=0.5 * max(0, hop), flare=D(8) * max(0, hop), stone_up=0.1 * max(0, hop))


def raise_(f):
    """Crouching, the rays dug into the floor (stomping at RAISE_HIT), straining and shaking, then
    heaving it up at RAISE_HEAVE: stretched up tall, rays flaring, the stones flung up; settling."""
    t, hit, heave, end = f / FPS, RAISE_HIT / FPS, RAISE_HEAVE / FPS, RAISE_FRAMES / FPS
    # down (> 0: crouched, < 0: stretched up)
    down = k_((0, 0), (hit - 0.35, 0.7), (hit - 0.12, -0.2), (hit, 1.0), (heave - 0.15, 1.15), (heave + 0.12, -0.9),
              (heave + 0.45, -0.35), (end, 0))(t)
    shake = math.sin(TAU * 11 * t) * k_((0, 0), (hit, 0), (hit + 0.1, 1), (heave - 0.05, 1), (heave + 0.1, 0))(t)
    lift = max(0.0, -down)
    return sun_idle(f, spos=V((0.03 * shake, 0, -0.2 * max(0.0, down) + 0.3 * lift)), squash=(1 + 0.1 * down, 1 - 0.12 * down),
                    flare=D(-12) * max(0.0, down) + D(20) * lift, droop=0.4 * max(0.0, down), sroll=D(4) * shake, spitch=D(8) * max(0.0, down) - D(6) * lift,
                    wave=(t, 1 + 2.5 * abs(down)), tuck=0.25 * max(0.0, down), stone_up=0.35 * lift, orbit=D(20) + 2 * t)


def death(f):
    """The sun shudders, sinks onto its folding legs, its rays drooping, and topples over on its
    back; the stones drop to the floor round it. Still from 2 s on."""
    t = f / FPS
    shudder = math.sin(TAU * 11 * t) * (1 - ease((t - 0.2) / 0.8))
    sink = ease((t - 0.2) / 0.9)
    fall = ease((t - 0.9) / 0.6) ** 2
    since = max(0.0, t - 1.5)
    bounce = math.exp(-since * 8) * abs(math.sin(TAU * 1.6 * since)) if t > 1.5 else 0.0
    return params(t=t, mk=0.001, sk=1.0, stone_form=1.0, spos=V((0.02 * shudder, 0.5 * fall, -0.45 * sink - 0.3 * fall + 0.05 * bounce)),
                  spitch=D(-85) * fall + D(4) * bounce, sroll=D(3) * shudder, droop=ease((t - 0.3) / 1.2),
                  wave=(min(t, 1.2), 1 - ease((t - 0.2) / 1.0)), tuck=0.3 * fall, stone_drop=ease((t - 0.25) / 0.6) ** 1.5,
                  bob=min(t, 0.3), orbit=0.3 * min(t, 0.3))


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


def stones_middle(rig):
    """The middle of the floating stones now (world)."""
    pts = [bone_point(rig, f"stone.{i}", REST_STONES[i]) for i in range(STONES)]
    return sum(pts, V()) / len(pts)


def animate(rig, obj):
    rig.animation_data_create()
    S = solver(rig)

    def clip(name, fn, n, cyclic=False, extras=None, settle_from=None):
        return K.ground_clip(rig, obj, name, S(fn), n, cyclic=cyclic, extras=extras, settle_from=settle_from)
    clip("MonteurWalk", walk, WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    th = clip("MonteurThrow", throw, THROW_FRAMES, extras={"attack_style": "throw", "hit_frame": THROW_HIT, "hit_time": THROW_HIT / FPS})
    th.pose_markers.new("Throw").frame = THROW_HIT
    ch = clip("MonteurCharge", charge, CHARGE_FRAMES, extras={"attack_style": "charge", "hit_frame": CHARGE_HIT, "hit_time": CHARGE_HIT / FPS,
                                                               "charge_end": CHARGE_END})
    ch.pose_markers.new("Run").frame = CHARGE_HIT
    ch.pose_markers.new("Stop").frame = CHARGE_END
    clip("MonteurStuck", stuck, STUCK_FRAMES, extras={"attack_style": "stuck"})
    su = clip("MonteurSummon", summon, SUMMON_FRAMES, extras={"attack_style": "summon", "hit_frame": SUMMON_HIT, "hit_time": SUMMON_HIT / FPS})
    su.pose_markers.new("Stomp").frame = SUMMON_HIT
    clip("MonteurChange", change, CHANGE_FRAMES, extras={"attack_style": "change"})
    clip("MonteurSunWalk", sun_walk, SUN_WALK_FRAMES, cyclic=True, extras={"speed": SUN_WALK_SPEED})
    st = clip("MonteurSunThrow", sun_throw, SUN_THROW_FRAMES, extras={"attack_style": "throw", "hit_frame": SUN_THROW_HIT,
                                                                     "hit_time": SUN_THROW_HIT / FPS})
    st.pose_markers.new("Throw").frame = SUN_THROW_HIT
    ro = clip("MonteurRoll", roll, ROLL_FRAMES, extras={"attack_style": "charge", "hit_frame": ROLL_HIT, "hit_time": ROLL_HIT / FPS,
                                                        "charge_end": ROLL_END})
    ro.pose_markers.new("Roll").frame = ROLL_HIT
    clip("MonteurSunStuck", sun_stuck, SUN_STUCK_FRAMES, extras={"attack_style": "stuck"})
    ra = clip("MonteurRain", rain, RAIN_FRAMES, extras={"attack_style": "cast", "hit_frame": RAIN_HIT, "hit_time": RAIN_HIT / FPS})
    ra.pose_markers.new("Rain").frame = RAIN_HIT
    sp = clip("MonteurSpin", spin, SPIN_FRAMES, extras={"attack_style": "cast", "hit_frame": SPIN_HIT, "hit_time": SPIN_HIT / FPS})
    sp.pose_markers.new("Turn").frame = SPIN_HIT
    ss = clip("MonteurSunSummon", sun_summon, SUN_SUMMON_FRAMES, extras={"attack_style": "summon", "hit_frame": SUN_SUMMON_HIT,
                                                                        "hit_time": SUN_SUMMON_HIT / FPS})
    ss.pose_markers.new("Stomp").frame = SUN_SUMMON_HIT
    rs = clip("MonteurRaise", raise_, RAISE_FRAMES, extras={"attack_style": "cast", "hit_frame": RAISE_HIT, "hit_time": RAISE_HIT / FPS,
                                                           "heave_frame": RAISE_HEAVE})
    rs.pose_markers.new("Stomp").frame = RAISE_HIT
    rs.pose_markers.new("Heave").frame = RAISE_HEAVE
    clip("MonteurDeath", death, DEATH_FRAMES, extras={"hold_last_frame": True, "hold_from": 2.0}, settle_from=round(1.7 * FPS))
    K.register(rig, CLIPS)
    # the points the game needs, read off the baked clips
    at_frame(rig, "MonteurThrow", THROW_HIT)
    th["muzzle"] = game(stones_middle(rig))
    at_frame(rig, "MonteurSunThrow", SUN_THROW_HIT)
    st["muzzle"] = game(stones_middle(rig))
    at_frame(rig, "MonteurSummon", SUMMON_HIT)
    su["muzzle"] = game(bone_point(rig, "body", V((0, -1.55, 0.1))))
    at_frame(rig, "MonteurSunSummon", SUN_SUMMON_HIT)
    ss["muzzle"] = game(bone_point(rig, "ball", V((0, -1.1, 0.1))))
    at_frame(rig, "MonteurRain", RAIN_HIT)
    ra["muzzle"] = game(bone_point(rig, "ball", SUN_C + V((0, 0, SUN_R))))
    return {"throw": list(th["muzzle"]), "sunThrow": list(st["muzzle"]), "summon": list(su["muzzle"]), "sunSummon": list(ss["muzzle"]),
            "rain": list(ra["muzzle"])}


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    scene.view_settings.view_transform = "Standard"
    side, front, three = (6.5, -2.0, 2.4), (1.8, -7.0, 2.6), (5.0, -5.0, 3.0)
    shots = [("MonteurWalk", 0, three), ("MonteurWalk", 9, side), ("MonteurThrow", THROW_HIT - 4, three), ("MonteurCharge", 14, side),
             ("MonteurCharge", CHARGE_HIT + 8, side), ("MonteurStuck", 30, three), ("MonteurSummon", SUMMON_HIT - 8, side),
             ("MonteurChange", 52, three), ("MonteurSunWalk", 0, front), ("MonteurSunThrow", SUN_THROW_HIT, three),
             ("MonteurRoll", 40, side), ("MonteurSunStuck", 30, three), ("MonteurRain", RAIN_HIT + 3, front), ("MonteurRaise", RAISE_HEAVE + 5, front),
             ("MonteurSpin", 30, front),
             ("MonteurDeath", DEATH_FRAMES, three)]
    K.contact_sheet(scene, rig, shots, path, (0, -0.3, 1.6), size=360, cols=4)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    F.decimate(obj)
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("MonteurDeath",))
    report.update(points)
    K.setup_stage(scene, "Monteur", STAGE, (0, -0.3, 1.6), 4.6, camera=(5.0, -5.0, 3.0))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True             # (it stays at the origin: the game clones it as it is)
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Monteur", NAME, (0, -0.3, 1.6), 6.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Monteur:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "monteur.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "monteur.blend"),
         preview_path=args[2] if len(args) > 2 else None)
