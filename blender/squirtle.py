"""
Squirtle: a living wave, from the kids' sketch.

A breaking wave that is a creature, seen from the side: its back rises out of its fluid at the
rear and arches up and forward into the crest, and the crest is its head (an eye on either
flank); the lip of the wave curls over in front of it. The curl comes down from under the head
and forward again under the snout as its lower jaw, the tip turned up: between them, opening
forward, its mouth, the dark barrel of the wave. Under the jaw its front comes down into its
fluid; under the arch is the wave's hollow. Foam along the crest, on the lip, the jaw's tip and
round its foot. Much wider than round (WIDE: everything is twice as wide across as it is
thick).

The game draws its body as its fluid (render/squirtleview.js: the water, lava or slime it lives
in, the palette of the body of fluid it is in, the fluid's moving cells streaming over it): its
materials only say which part is which (body, foam, mouth, eyes, pupils), and its UVs are flow
coordinates: u along the way the water runs (up its back, over the crest and out to the lip; up
its chest and forward along the jaw), v round it (cells; the seam in the hollow under the arch and
inside the mouth). Its feet are at z = 0; the game floats it with the lower 0.3 of its body under
its fluid's surface and draws nothing of it under that.
Faces -Y in Blender, +Z up; one unit = one game cell, 1.6 cells tall to its crest, 1.9 long.

Rig: root (carries the squash, the stretch and the puddle: the whole body's scale), and under it
back0, back1, back2, neck, head, lip (up the back, over the crest, the curl), chest, jaw (the
front, the lower jaw). The poses are the sketch's curve bent (`warp`): the head tips up and the
jaw drops to open the mouth, the lip curls, the top leans forward or back about the rear foot,
the more the higher (a roll running up the back), and it sways across; each bone follows where
the curve takes its ends.

Clips, 30 fps, in place:
    SquirtleIdle    48-frame loop: breathing, it rolls and swells, its mouth opening and shutting.
    SquirtleSwim    36-frame loop: leaning into the way it goes, the lip curled over, surging.
    SquirtleSpit    1.1 s: rears back with its mouth wide and lunges; the ball leaves its mouth at
                    frame 15 (extras.hit_frame, extras.muzzle: the middle of its mouth).
    SquirtleLeap    1.8 s: gathers itself low, throws itself out (frame 12: the game carries it
                    through the air), stretched out, curling over, and crashes down flat at frame
                    36, then gathers itself up again.
    SquirtleMelt    0.8 s: slumps into a flat puddle (the game scrubs it as it dissolves on land).
                    Held.
    SquirtleDeath   1.4 s: shudders, crashes forward and runs out into a puddle. Held.

Headless:
    Blender -b --python blender/squirtle.py -- assets/squirtle.glb blender/squirtle.blend \
        blender/previews/squirtle-preview.png
"""
import math
from pathlib import Path
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import character as C
import creature as K

NAME, RIG_NAME = "Squirtle", "SquirtleRig"
SCENE, COLLECTION, STAGE = "Squirtle", "SquirtleAsset", "SquirtleStage"
FPS, TAU = K.FPS, K.TAU
V = Vector
CLIPS = ("SquirtleIdle", "SquirtleSwim", "SquirtleSpit", "SquirtleLeap", "SquirtleMelt", "SquirtleDeath")
HELD = ("SquirtleMelt", "SquirtleDeath")

# the parts (the game draws the body in its fluid's colours: this is the classic water's); where
# on the body its foam is and the barrel of its mouth, its colour attribute says (flow_colors)
MATERIALS = (("SquirtleBody", "#2c9ad8", 0), ("SquirtleEyes", "#f4f8fb", 0), ("SquirtlePupils", "#0e1626", 0))
BODY_M, EYE_M, PUPIL_M = range(len(MATERIALS))

VOXEL, FINE = 0.014, 0.007
IDLE_FRAMES, SWIM_FRAMES, SWIM_SPEED = 48, 36, 2.2
SPIT_FRAMES, SPIT_HIT = 33, 15
LEAP_FRAMES, LEAP_GO, LEAP_HIT = 54, 12, 36
MELT_FRAMES, DEATH_FRAMES = 24, 42

# --- the sketch -----------------------------------------------------------------
# Its units: f forward from the back of its rear, h up; times S to cells, its middle (the game's
# origin) at f = MID; across, everything is WIDE times as wide as it is thick.
S, MID, WIDE = 2.7, 0.36, 2.0


def at(f, h, x=0.0):
    """A point of the sketch in Blender (x across in cells)."""
    return V((x, -(f - MID) * S, h * S))


# the curve, [f, h, radius] per part: the back (from the rear up the arch), the head (the crest,
# the snout and the lip curling over), the throat (down from under the head), the jaw (forward
# under the mouth, the tip turned up), the chest (down to the floor). The back and the head melt
# into one, the throat, the jaw and the chest into another, and the two only just join: so the
# mouth between the snout and the jaw stays open.
BACK = [(0.07, 0, 0.12), (0.11, 0.16, 0.104), (0.2, 0.33, 0.096), (0.33, 0.44, 0.092), (0.47, 0.48, 0.09)]
HEAD = [(0.47, 0.48, 0.095), (0.58, 0.505, 0.1), (0.66, 0.495, 0.075), (0.73, 0.47, 0.045), (0.775, 0.43, 0.026), (0.79, 0.395, 0.016)]
THROAT = [(0.52, 0.44, 0.07), (0.54, 0.37, 0.062), (0.53, 0.3, 0.06)]
JAW = [(0.53, 0.3, 0.06), (0.61, 0.27, 0.05), (0.69, 0.28, 0.038), (0.73, 0.315, 0.022)]
CHEST = [(0.53, 0.3, 0.06), (0.52, 0.18, 0.066), (0.55, 0.04, 0.075)]
FEET = [(0.06, 0.0, 0.14), (0.56, 0.0, 0.12)]       # the rear's, the front's: cut by the floor
# [f, h, across (times S * WIDE)]: the white and the pupil of an eye, on the head's flanks
EYE, PUPIL = (0.63, 0.545, 0.072), (0.655, 0.548, 0.082)
MOUTH = (0.68, 0.37)                                 # the middle of the mouth at rest
MELT, JOIN = 0.06 * S, 0.012 * S


def squeeze(P):
    Q = np.array(P, np.float32, copy=True)
    Q[..., 0] /= WIDE
    return Q


def tube(Q, curve):
    return K.tapered_tube(Q, [at(f, h) for f, h, _ in curve], [r * S for *_, r in curve])


def ball(Q, f, h, r):
    return np.linalg.norm(Q - np.asarray(at(f, h), np.float32), axis=-1) - r * S


def crest_top(f):
    """How high the top of the back and the head stands at f (sketch units)."""
    curve = BACK + HEAD[1:]
    fs = [c[0] for c in curve]
    return np.interp(f, fs, [c[1] + c[2] for c in curve])


# little lumps of foam along the crest, where the wave breaks
TUFTS = [(f, float(crest_top(f)) - 0.012, r) for f, r in ((0.40, 0.022), (0.46, 0.026), (0.52, 0.028), (0.58, 0.026), (0.64, 0.02))]


def group_a(Q):
    d = K.smin(tube(Q, BACK), tube(Q, HEAD), MELT)
    d = K.smin(d, ball(Q, *FEET[0]), MELT)
    for t in TUFTS:
        d = K.smin(d, ball(Q, *t), 0.025 * S)
    return d


def group_b(Q):
    d = K.smin(K.smin(tube(Q, THROAT), tube(Q, JAW), MELT * 0.5), tube(Q, CHEST), MELT)
    return K.smin(d, ball(Q, *FEET[1]), MELT)


def body_sdf(P):
    Q = squeeze(P)
    d = K.smin(group_a(Q), group_b(Q), JOIN) * 0.85
    return K.smax(d, -P[..., 2], 0.01)        # flat underneath, on the floor


def eye_sdf(P, spot, radii, side):
    f, h, x = spot
    return K.ellipsoid(P, at(f, h, side * x * S * WIDE), radii)


def flow_colors(obj):
    """The body's colour attribute (smooth, per vertex; the game sharpens it, wobbly): r the foam
    (along the crest's top and front, on the lip, the jaw's tip, round the foot), g the barrel of
    the mouth (inside the curl, facing into it, from the back of the throat to the lips), b how
    high up the body (0 at the foot, 1 at the crest)."""
    me = obj.data
    P = K.mesh_points(obj)
    n = np.empty(len(P) * 3, np.float32)
    me.vertices.foreach_get("normal", n)
    n = n.reshape(-1, 3)
    f, h = MID - P[:, 1] / S, P[:, 2] / S
    nf, nh = -n[:, 1], n[:, 2]
    ss = C.np_smoothstep
    near = lambda p, r0, r1: 1 - ss(r0, r1, np.hypot(f - p[0], h - p[1]))
    mats = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", mats)
    eye = np.zeros(len(P), bool)
    for p, m in zip(me.polygons, mats):
        if m != BODY_M:
            eye[list(p.vertices)] = True
    # the top of the body along it (the mesh's, melted fuller than the curve)
    bins = np.arange(0.0, 0.85, 0.01)
    tops = np.array([h[~eye & (np.abs(f - b) < 0.012)].max(initial=0) for b in bins])
    top = np.interp(f, bins, tops)
    crest = ss(top - 0.022, top - 0.006, h) * ss(0.44, 0.58, f) * (1 - ss(0.72, 0.78, f))
    foam = np.maximum.reduce([crest, near(HEAD[-1], 0.012, 0.03), near(JAW[-1], 0.015, 0.035),
                              1 - ss(0.008, 0.03, h)])
    mf, mh = np.clip(f, 0.56, 0.7), MOUTH[1] + 0.02
    toward = ((mf - f) * nf + (mh - h) * nh) / np.maximum(np.hypot(mf - f, mh - h), 1e-4)
    mouth = ss(0.1, 0.5, toward) * ss(0.48, 0.53, f) * ss(0.27, 0.31, h) * (1 - ss(0.44, 0.48, h)) * (1 - ss(0.74, 0.79, f))
    foam = foam * (1 - mouth)
    rgba = np.stack([foam, mouth, np.clip(h / 0.6, 0, 1), np.ones_like(h)], axis=1)
    rgba[eye] = (0, 0, 0, 1)
    attr = me.color_attributes.get("Flow") or me.color_attributes.new("Flow", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", rgba.astype(np.float32).ravel())
    me.color_attributes.active_color = attr


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = (-0.2 * S * WIDE, -(0.84 - MID) * S, -0.02), (0.2 * S * WIDE, (MID + 0.02) * S, 0.66 * S)
    parts.add("body", body_sdf, lo, hi, VOXEL)
    for side in (-1, 1):
        for spot, radii, mat in ((EYE, (0.034 * S, 0.038 * S, 0.04 * S), EYE_M), (PUPIL, (0.018 * S, 0.022 * S, 0.024 * S), PUPIL_M)):
            c = at(spot[0], spot[1], side * spot[2] * S * WIDE)
            parts.add("eye", lambda P, s=spot, r=radii, sd=side: eye_sdf(P, s, r, sd), c - V((0.15,) * 3), c + V((0.15,) * 3), FINE, mat=mat)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "squirtle"
    obj["body_color"] = MATERIALS[0][1]
    obj["style"] = "fluid"
    return obj, parts.owners


# --- rig / skin --------------------------------------------------------------
# deform bones: (head, tail) in sketch units, and which part of the curve each follows
BONES = {
    "back0": ((0.07, 0.0), (0.12, 0.19)), "back1": ((0.12, 0.19), (0.22, 0.35)), "back2": ((0.22, 0.35), (0.35, 0.45)),
    "neck": ((0.35, 0.45), (0.5, 0.49)), "head": ((0.5, 0.49), (0.68, 0.48)), "lip": ((0.68, 0.48), (0.785, 0.41)),
    "chest": ((0.55, 0.02), (0.53, 0.29)), "jaw": ((0.53, 0.29), (0.74, 0.31)),
}
PART = {"back0": "back", "back1": "back", "back2": "back", "neck": "back", "head": "head", "lip": "lip", "chest": "front", "jaw": "jaw"}
A_BONES = ("back0", "back1", "back2", "neck", "head", "lip")
NECK, HINGE, LIP0, REAR = (0.47, 0.48), (0.53, 0.3), (0.68, 0.48), (0.07, 0.0)


def build_rig(coll):
    bones = [("root", (0, 0, 0), (0, 0.1, 0), None, False, (0, 0, 1))]
    for name, (a, b) in BONES.items():
        bones.append((name, at(*a), at(*b), "root", True, (1, 0, 0)))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "squirtle", "forward": "-Y", "attack_style": "spit",
                                              "normal_speed": SWIM_SPEED, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    col = {n: names.index(n) for n in names}
    for o in owners:
        lo, hi = o["lo"], o["hi"]
        if o["kind"] == "eye":
            W[lo:hi, col["head"]] = 1
            continue
        Q = squeeze(P[lo:hi])
        in_a = group_a(Q) < group_b(Q)
        WB = np.zeros((hi - lo, len(names)), np.float32)
        # up the back and over the crest: by how far along it
        pts = [at(*BONES[n][0]) for n in A_BONES] + [at(*BONES["lip"][1])]
        _, s = C._polyline_closest(Q, pts)
        joints = np.cumsum([0] + [(b - a).length for a, b in zip(pts, pts[1:])])[1:-1]
        past = [C.np_smoothstep(j - 0.08, j + 0.08, s) for j in joints]
        for k, n in enumerate(A_BONES):
            WB[:, col[n]] = np.where(in_a, (past[k - 1] if k else 1) - (past[k] if k < len(past) else 0), 0)
        # the front: the chest, the jaw (from the hinge on), the throat (the chest's at the
        # bottom, the head's at the top)
        chest_d, _ = C._polyline_closest(Q, [at(*BONES["chest"][0]), at(*BONES["chest"][1])])
        jaw_d, jaw_s = C._polyline_closest(Q, [at(f, h) for f, h, _ in JAW])
        throat_pts = [at(f, h) for f, h, _ in reversed(THROAT)]
        throat_d, throat_s = C._polyline_closest(Q, throat_pts)
        throat_len = sum((b - a).length for a, b in zip(throat_pts, throat_pts[1:]))
        best = np.argmin(np.stack([chest_d, jaw_d, throat_d]), axis=0)
        jaw_w = C.np_smoothstep(0.0, 0.15, jaw_s)
        up = C.np_smoothstep(0.35, 0.95, throat_s / throat_len)
        b = ~in_a
        WB[:, col["chest"]] += np.where(b & (best == 0), 1, 0) + np.where(b & (best == 1), 1 - jaw_w, 0) + np.where(b & (best == 2), 1 - up, 0)
        WB[:, col["jaw"]] += np.where(b & (best == 1), jaw_w, 0)
        WB[:, col["head"]] += np.where(b & (best == 2), up, 0)
        W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
    K.write_weights(obj, names, W)


# --- flow coordinates (UVs) -------------------------------------------------------
def _frame(Q, curve, outward):
    """Closest point on a curve: arc length s, the angle round it from its outward side (the
    seam on the other) and its circumference there (cells)."""
    pts = [np.asarray(at(f, h), np.float32) for f, h, _ in curve]
    radii = [r * S for *_, r in curve]
    best = np.full(len(Q), np.inf, np.float32)
    s = np.zeros(len(Q), np.float32)
    theta = np.zeros(len(Q), np.float32)
    circ = np.ones(len(Q), np.float32)
    acc = 0.0
    for (a, b), (ra, rb) in zip(zip(pts, pts[1:]), zip(radii, radii[1:])):
        ba = b - a
        L = float(np.linalg.norm(ba))
        t = np.clip(((Q - a) @ ba) / (L * L), 0, 1)
        d = Q - a - t[:, None] * ba
        dist = np.linalg.norm(d, axis=1)
        m = dist < best
        ty, tz = ba[1] / L, ba[2] / L
        n = np.array((0, tz, -ty) if outward > 0 else (0, -tz, ty), np.float32)
        th = np.arctan2(d[:, 0], d @ n)
        r = ra + (rb - ra) * t
        best[m], s[m], theta[m] = dist[m], acc + t[m] * L, th[m]
        circ[m] = (TAU * r * (1 + WIDE) / 2)[m]
        acc += L
    return best, s, theta, circ


def _diffuse(obj, keep, values, iterations, rate=0.5):
    """Smooth per-vertex values over the mesh's edges between the vertices kept."""
    E = np.empty(len(obj.data.edges) * 2, np.int32)
    obj.data.edges.foreach_get("vertices", E)
    E = E.reshape(-1, 2)
    E = E[keep[E[:, 0]] & keep[E[:, 1]]]
    degree = np.bincount(E.ravel(), minlength=len(values)).astype(np.float32)
    for _ in range(iterations):
        acc = np.zeros_like(values)
        np.add.at(acc, E[:, 0], values[E[:, 1]])
        np.add.at(acc, E[:, 1], values[E[:, 0]])
        values = np.where(degree > 0, values + rate * (acc / np.maximum(degree, 1) - values), values)
    return values


def flow_uvs(obj):
    """u along the way the water runs, v round the body (both cells; the eyes none); per corner,
    so a face across the seam does not stretch round the whole body."""
    me = obj.data
    P = K.mesh_points(obj)
    mats = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", mats)
    body = np.ones(len(P), bool)
    for p, m in zip(me.polygons, mats):
        if m in (EYE_M, PUPIL_M):
            body[list(p.vertices)] = False
    Q = squeeze(P)
    in_a = group_a(Q) < group_b(Q)
    _, sa, ta, ca = _frame(Q, BACK + HEAD[1:], +1)
    # the front: up the chest, then forward along the jaw or up the throat from the hinge
    dc, sc, tc, cc = _frame(Q, CHEST[::-1] + JAW[1:], -1)
    dt, st, tt, ct = _frame(Q, THROAT[::-1], -1)
    hinge = sum((at(*a[:2]) - at(*b[:2])).length for a, b in zip(CHEST[::-1], CHEST[::-1][1:]))
    throat = dt < dc
    u = np.where(in_a, sa, np.where(throat, hinge + st, sc)).astype(np.float32)
    u = np.where(body, _diffuse(obj, body, u, 8), 0)
    circ = np.where(in_a, ca, np.where(throat, ct, cc))
    v = np.where(body, np.where(in_a, ta, np.where(throat, tt, tc)) / TAU * circ, 0)
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    loops = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loops)
    starts = np.empty(len(me.polygons), np.int32)
    totals = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_start", starts)
    me.polygons.foreach_get("loop_total", totals)
    lu, lv = u[loops].astype(np.float32), v[loops].astype(np.float32)
    for s0, n in zip(starts, totals):
        vs = lv[s0:s0 + n]
        c = circ[loops[s0:s0 + n]].mean()
        if vs.max() - vs.min() > 0.5 * c:
            lv[s0:s0 + n] = np.where(vs < 0, vs + c, vs)
    uv.data.foreach_set("uv", np.stack([lu, lv], axis=1).ravel())


# --- motion ------------------------------------------------------------------
def params(**kw):
    p = {"open": 0.0, "lean": 0.0, "roll": 0.0, "phase": 0.0, "sway": 0.0, "curl": 0.0, "squash": 1.0, "stretch": 1.0,
         "puddle": 0.0, "bob": 0.0, "surge": 0.0, "swell": 1.0}
    p.update(kw)
    return p


def rot(f, h, c, a):
    df, dh = f - c[0], h - c[1]
    ca, sa = math.cos(a), math.sin(a)
    return c[0] + df * ca - dh * sa, c[1] + df * sa + dh * ca


def warp(f, h, part, p):
    """Where the sketch's point (f, h) of a part goes in pose p (Blender, before the root's
    squash): the lip curls over, the head tips up and the jaw drops (the mouth opening), the top
    leans about the rear foot the more the higher, a roll running up it, and sways across."""
    if part == "lip":
        f, h = rot(f, h, LIP0, -p["curl"])
    if part in ("head", "lip"):
        f, h = rot(f, h, NECK, p["open"] * 0.28)
    if part == "jaw":
        f, h = rot(f, h, HINGE, -p["open"] * 0.55)
    k = min(max(h / 0.5, 0.0), 1.3)
    th = p["lean"] * k + p["roll"] * k * math.sin(p["phase"] - 2.4 * k)
    df, c, s = f - REAR[0], math.cos(th), math.sin(th)
    f, h = REAR[0] + df * c + h * s, -df * s + h * c
    return at(f, h, p["sway"] * k * S)


def root_matrix(p, lift=0.0):
    q = p["squash"]
    sx = (1 + 0.35 * p["puddle"]) / math.sqrt(q)
    sy = p["stretch"] * (1 + 0.25 * p["puddle"]) / math.sqrt(q)
    sz = q * (1 - 0.94 * p["puddle"])
    return Matrix.Translation((0, -p["surge"], p["bob"] + lift)) @ Matrix.Diagonal((sx, sy, sz, 1))


def solver(rig, fn):
    skel = C.Skeleton(rig)
    rest = {n: rig.data.bones[n].matrix_local.copy() for n in BONES}

    def solve(fr, lift):
        p = fn(fr)
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, root_matrix(p, lift))
        for name, (a0, b0) in BONES.items():
            a, b = warp(*a0, PART[name], p), warp(*b0, PART[name], p)
            d0 = at(*b0) - at(*a0)
            swing = d0.normalized().rotation_difference((b - a).normalized()).to_matrix()
            sw = p["swell"] if name in ("neck", "head", "lip") else 1 + (p["swell"] - 1) * 0.6
            D = Matrix.Translation(a) @ (swing @ rest[name].to_3x3()).to_4x4() @ Matrix.Diagonal((sw, (b - a).length / d0.length, sw, 1))
            bases[name] = rest[name].inverted() @ D      # (under the root, which carries its scale)
        return bases
    return solve


keys = C.keyframes
smooth = C.smoothstep


def idle(fr):
    w = TAU * fr / IDLE_FRAMES
    return params(open=0.5 * (0.5 - 0.5 * math.cos(w)) ** 0.8, squash=1 + 0.03 * math.sin(2 * w), lean=0.04 * math.sin(w),
                  roll=0.05, phase=w, sway=0.012 * math.sin(w + 0.5), bob=0.025 * math.sin(w), curl=0.12 + 0.1 * math.sin(w - 0.6),
                  swell=1 + 0.02 * math.sin(w))


def swim(fr):
    w = TAU * fr / SWIM_FRAMES
    return params(open=0.22 + 0.1 * math.sin(w), lean=0.14 + 0.04 * math.sin(w), roll=0.08, phase=2 * w,
                  squash=0.95 + 0.03 * math.sin(2 * w), stretch=1.08, sway=0.01 * math.sin(w), bob=0.035 * math.sin(2 * w + 0.5),
                  surge=0.03 * math.sin(w), curl=0.35 + 0.15 * math.sin(w - 0.8))


def spit(fr):
    t, hit = fr / FPS, SPIT_HIT / FPS
    rear = keys((0, 0), (0.3, 1), (hit - 0.06, 1.1), (hit, 0), (0.75, 0))(t)
    lunge = keys((0, 0), (hit - 0.06, 0), (hit, 1), (hit + 0.18, 1), (1.05, 0))(t)
    shake = math.sin(TAU * 14 * t) * smooth(0.2, 0.3, t) * (1 - smooth(hit - 0.06, hit, t))
    return params(open=keys((0, 0.1), (0.2, 0.2), (hit - 0.04, 0.8), (hit, 1), (hit + 0.15, 0.9), (0.9, 0.15), (1.1, 0.1))(t),
                  lean=-0.2 * rear + 0.18 * lunge, squash=1 - 0.06 * rear + 0.04 * lunge, swell=1 + 0.08 * rear,
                  curl=0.1 + 0.3 * rear - 0.15 * lunge, sway=0.012 * shake, roll=0.03, phase=TAU * t / 1.6, surge=0.06 * lunge - 0.04 * rear)


def leap(fr):
    t, go, hit, end = fr / FPS, LEAP_GO / FPS, LEAP_HIT / FPS, LEAP_FRAMES / FPS
    gather = keys((0, 0), (go - 0.12, 1), (go, 0.2), (hit - 0.1, 0))(t)
    reach = keys((0, 0), (go - 0.08, 0), (go + 0.1, 1), (hit - 0.12, 0.8), (hit, 0))(t)
    crash = keys((0, 0), (hit - 0.12, 0), (hit, 1), (hit + 0.25, 0.85), (end - 0.1, 0))(t)
    return params(open=keys((0, 0.1), (go, 0.6), (hit - 0.1, 1), (hit, 0.3), (hit + 0.2, 0), (end, 0.1))(t),
                  lean=-0.25 * gather + 0.3 * reach + 0.45 * crash, squash=1 - 0.3 * gather + 0.12 * reach - 0.45 * crash,
                  stretch=1 + 0.25 * reach + 0.3 * crash, curl=0.1 + 0.6 * reach + 0.7 * crash, swell=1 + 0.06 * gather)


def melt(fr):
    m = smooth(0, 0.7, fr / FPS)
    return params(puddle=m, lean=0.25 * m, squash=1 - 0.15 * m, swell=1 + 0.25 * m, curl=0.4 * m, open=0.2 * m)


def death(fr):
    t = fr / FPS
    shudder = math.sin(TAU * 12 * t) * (1 - smooth(0.15, 0.4, t))
    crash = smooth(0.2, 0.7, t)
    m = smooth(0.55, 1.25, t)
    return params(sway=0.03 * shudder, open=keys((0, 0.2), (0.3, 0.9), (0.8, 0.4), (1.2, 0.2))(t),
                  lean=0.5 * crash * (1 - 0.5 * m), squash=1 - 0.3 * crash, puddle=m, swell=1 + 0.2 * m, curl=0.8 * crash)


def mouth_at(rig, action, frame):
    """The middle of the mouth in a frame: between the snout's underside and the jaw."""
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    out = []
    for bone, point in (("head", at(MOUTH[0], MOUTH[1] + 0.035)), ("jaw", at(MOUTH[0], MOUTH[1] - 0.035))):
        pb = rig.pose.bones[bone]
        out.append(rig.matrix_world @ pb.matrix @ rig.data.bones[bone].matrix_local.inverted() @ point)
    return (out[0] + out[1]) / 2


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SquirtleIdle", solver(rig, idle), IDLE_FRAMES, cyclic=True, extras={"speed": 0})
    K.ground_clip(rig, obj, "SquirtleSwim", solver(rig, swim), SWIM_FRAMES, cyclic=True, extras={"speed": SWIM_SPEED})
    a = K.ground_clip(rig, obj, "SquirtleSpit", solver(rig, spit), SPIT_FRAMES,
                      extras={"attack_style": "spit", "hit_frame": SPIT_HIT, "hit_time": SPIT_HIT / FPS})
    a.pose_markers.new("Spit").frame = SPIT_HIT
    b = K.ground_clip(rig, obj, "SquirtleLeap", solver(rig, leap), LEAP_FRAMES,
                      extras={"attack_style": "leap", "hit_frame": LEAP_HIT, "hit_time": LEAP_HIT / FPS, "go_frame": LEAP_GO})
    b.pose_markers.new("Go").frame = LEAP_GO
    b.pose_markers.new("Crash").frame = LEAP_HIT
    K.ground_clip(rig, obj, "SquirtleMelt", solver(rig, melt), MELT_FRAMES, extras={"hold_last_frame": True, "hold_from": 0.7},
                  settle_from=round(0.7 * FPS))
    K.ground_clip(rig, obj, "SquirtleDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.25}, settle_from=round(1.25 * FPS))
    K.register(rig, CLIPS)
    m = mouth_at(rig, "SquirtleSpit", SPIT_HIT)
    game = lambda p: [round(p.x, 3) + 0.0, round(p.z, 3) + 0.0, round(-p.y, 3) + 0.0]   # (+ 0.0: no -0.0)
    a["muzzle"] = game(m)
    return list(a["muzzle"]), game(mouth_at(rig, "SquirtleIdle", 0))


def build():
    scene = K.creature_scene(SCENE)
    K.clear_collection(COLLECTION)
    coll = K.collection(COLLECTION, scene)
    rig = build_rig(coll)
    obj, owners = build_mesh(coll)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    compute_weights(obj, owners)
    for name, roughness in (("SquirtleBody", 0.3), ("SquirtleEyes", 0.3), ("SquirtlePupils", 0.15)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- previews ----------------------------------------------------------------
# a few of the game's palettes (themes/fluids.js, classic): body, the lines between the cells,
# foam, the barrel of the mouth, glow
LOOKS = {
    "water": ("#2c9ad8", "#c8f2ff", "#f8fdff", "#0a2a46", 0.0),
    "lava": ("#ff6a00", "#ffc030", "#ffd870", "#4a1a0c", 2.0),
    "slime": ("#66d42a", "#d8ff9a", "#eaffc8", "#1e4a0c", 0.15),
}


def preview_materials():
    """The body in the cartoon look of the game's fluids: cells (Voronoi on its flow UVs) with
    light lines between them, foam and the barrel of its mouth by its colour attribute."""
    mat = bpy.data.materials["SquirtleBody"]
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    node = nt.nodes.new
    coord, mapping, vor, ramp = node("ShaderNodeTexCoord"), node("ShaderNodeMapping"), node("ShaderNodeTexVoronoi"), node("ShaderNodeValToRGB")
    mapping.inputs["Scale"].default_value = (1.6, 1.6, 1)
    vor.feature = "DISTANCE_TO_EDGE"
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.05, 0.08
    ramp.color_ramp.elements[0].color, ramp.color_ramp.elements[1].color = (1, 1, 1, 1), (0, 0, 0, 1)
    attr, split = node("ShaderNodeAttribute"), node("ShaderNodeSeparateColor")
    attr.attribute_name = "Flow"
    sharp_foam, sharp_mouth = node("ShaderNodeMapRange"), node("ShaderNodeMapRange")
    for m in (sharp_foam, sharp_mouth):
        m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = 0.45, 0.55
    mixes = []
    for name in ("Look", "Foam", "Mouth"):
        m = node("ShaderNodeMix")
        m.data_type, m.name = "RGBA", name
        mixes.append(m)
    look, foam, mouth = mixes
    link = nt.links.new
    link(coord.outputs["UV"], mapping.inputs["Vector"])
    link(mapping.outputs["Vector"], vor.inputs["Vector"])
    link(vor.outputs["Distance"], ramp.inputs["Fac"])
    link(ramp.outputs["Color"], look.inputs["Factor"])
    link(attr.outputs["Color"], split.inputs["Color"])
    link(split.outputs["Red"], sharp_foam.inputs["Value"])
    link(split.outputs["Green"], sharp_mouth.inputs["Value"])
    link(look.outputs["Result"], foam.inputs["A"])
    link(sharp_foam.outputs["Result"], foam.inputs["Factor"])
    link(foam.outputs["Result"], mouth.inputs["A"])
    link(sharp_mouth.outputs["Result"], mouth.inputs["Factor"])
    link(mouth.outputs["Result"], bsdf.inputs["Base Color"])
    link(mouth.outputs["Result"], bsdf.inputs["Emission Color"])


def set_look(name):
    body, line, foam, mouth, glow = LOOKS[name]
    nodes = bpy.data.materials["SquirtleBody"].node_tree.nodes
    nodes["Look"].inputs["A"].default_value, nodes["Look"].inputs["B"].default_value = K.rgba(body), K.rgba(line)
    nodes["Foam"].inputs["B"].default_value, nodes["Mouth"].inputs["B"].default_value = K.rgba(foam), K.rgba(mouth)
    nodes["Principled BSDF"].inputs["Emission Strength"].default_value = glow


def preview(scene, rig, path, size=360, cols=4):
    """At rest, spitting, swimming, leaping out, crashing down, melted, in water, lava and slime."""
    target = V((0, -0.1, 0.72))
    scene.camera.data.ortho_scale = 3.3
    side, front, back = (3.4, -2.2, 1.6), (2.0, -3.6, 1.5), (-3.2, -1.6, 1.8)
    shots = [("SquirtleIdle", 0, side, "water"), ("SquirtleSpit", SPIT_HIT, front, "water"), ("SquirtleSwim", 9, back, "water"),
             ("SquirtleIdle", 24, front, "lava"), ("SquirtleLeap", 22, side, "lava"), ("SquirtleLeap", LEAP_HIT + 2, side, "lava"),
             ("SquirtleSpit", 8, side, "slime"), ("SquirtleMelt", MELT_FRAMES, front, "slime")]
    cam = scene.camera
    scene.render.resolution_x = scene.render.resolution_y = size
    rows = (len(shots) + cols - 1) // cols
    sheet = np.ones((rows * size, cols * size, 4), np.float32)
    with tempfile.TemporaryDirectory(prefix="squirtle-") as directory:
        for i, (action, frame, location, look) in enumerate(shots):
            set_look(look)
            rig.animation_data.action = bpy.data.actions[action]
            scene.frame_set(frame)
            cam.location = location
            cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(Path(directory) / f"{i}.png")
            bpy.ops.render.render(write_still=True, scene=scene.name)
            img = bpy.data.images.load(scene.render.filepath)
            px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
            bpy.data.images.remove(img)
            r, c = rows - 1 - i // cols, i % cols
            sheet[r * size:(r + 1) * size, c * size:(c + 1) * size] = px
    out = bpy.data.images.new("SquirtleSheet", cols * size, rows * size, alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = str(path)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    set_look("water")
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    K.decimate(obj)
    flow_uvs(obj)
    flow_colors(obj)
    muzzle, rest_mouth = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=HELD)
    report["muzzle"], report["mouth_at_rest"] = muzzle, rest_mouth
    K.setup_stage(scene, "Squirtle", STAGE, (0, -0.1, 0.72), 2.6, camera=(3.4, -2.2, 1.6))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, IDLE_FRAMES - 1
    scene.frame_set(0)
    if export_path:
        K.export_gltf(rig, obj, export_path, texcoords=True, colors=True)
    preview_materials()
    set_look("water")
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Squirtle", NAME, (0, -0.1, 0.72), 3.0)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Squirtle:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "squirtle.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "squirtle.blend"),
         preview_path=args[2] if len(args) > 2 else None)
