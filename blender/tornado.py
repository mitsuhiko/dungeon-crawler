"""
Tornado: a little wind spirit in a skirt, from the kids' sketch.

A floating face (two glowing eyes under angry V brows, no head round them)
over a thin body whose two arms rise up on either side of it like a U, the
hands curling outwards at the top. At the waist a wide, round overskirt with
a scalloped hem flares out over a long A-line skirt, both striped with
swirls, and four stubby little feet peek out under the hem. Faces -Y in
Blender, +Z up; one unit = one game cell, about 1.35 cells to the top of its
brows.

Every part is an OpenVDB SDF, rigid on its bone: the overskirt and the skirt
on bones of their own (wave0, wave1: the game turns them about their axes,
every other one the other way, so the swirls keep running round), the body on
the hips and the chest, the face on a floating head bone, the four legs on a
bone each, the arms skinned to their upper and lower bones and the hands. The
tip.L / tip.R bones (not deforming) mark where a twister spins up over each
hand.

Clips, 30 fps, in place (the game supplies root motion, and lifts it into
the air on a twister while it rides one):
    TornadoWalk   20-frame shuffle at 0.6 cells/s: the feet patter in
                  diagonal pairs, the body bobs and sways, the arms wave.
    TornadoCast   1.6 s: it lifts its hands high and whirls them while a
                  twister spins up over each (from frame 6, extras.form_frame),
                  then flings both down and forward at frame 27
                  (extras.hit_frame): the twisters drop to the floor and go.
    TornadoHop    1.4 s: it crouches, a twister lifts it at frame 9
                  (extras.ride_frame) and carries it off, arms spread, feet
                  tucked; it lands at frame 33 (extras.hit_frame).
    TornadoSlam   2.0 s: it crouches, rides a twister up from frame 9,
                  raises both hands over its head and slams them down as it
                  crashes onto its target at frame 45 (extras.hit_frame).
    TornadoDeath  2.0 s: it spins round and round, slower and slower, its
                  arms flung out, wobbles and topples over onto its side, the
                  eyes closing. Held.
    TornadoTwister (a prop, not a clip): one of its twisters, two spirals of
                  wind round a thin funnel, one cell tall, its tip at the origin.

Inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, creature, tornado; importlib.reload(creature); importlib.reload(tornado)
    tornado.main(export_path="<repo>/assets/tornado.glb", blend_path="<repo>/blender/tornado.blend")

Headless:
    Blender -b --python blender/tornado.py -- assets/tornado.glb blender/tornado.blend \
        blender/previews/tornado-preview.png
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
import figure as F

NAME, RIG_NAME, PROP = "Tornado", "TornadoRig", "TornadoTwister"
SCENE, COLLECTION, STAGE = "Tornado", "TornadoAsset", "TornadoStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
SIDES = (("L", 1), ("R", -1))
CLIPS = ("TornadoWalk", "TornadoCast", "TornadoHop", "TornadoSlam", "TornadoDeath")

BODY_HEX, SKIRT_HEX, SWIRL_HEX = "#cdb2f2", "#b394e6", "#8d6cc9"
EYE_HEX, PUPIL_HEX, BROW_HEX = "#ffd84a", "#1a1024", "#2b1c3c"
WIND_HEX, WIND_DEEP_HEX = "#ece2ff", "#bda6ee"
# (name, colour, emission); indices are the parts' `mat`
MATERIALS = (("TornadoBody", BODY_HEX, 0), ("TornadoSkirt", SKIRT_HEX, 0), ("TornadoSwirl", SWIRL_HEX, 0),
             ("TornadoEyes_glow", EYE_HEX, 0.6), ("TornadoPupils", PUPIL_HEX, 0), ("TornadoBrows", BROW_HEX, 0))
BODY_M, SKIRT_M, SWIRL_M, EYE_M, PUPIL_M, BROW_M = range(len(MATERIALS))
WIND_MATERIALS = (("TornadoWind", WIND_HEX, 0.15), ("TornadoWindDeep", WIND_DEEP_HEX, 0.1))

VOXEL, DETAIL, FINE = 0.0105, 0.006, 0.0035
WALK_FRAMES, WALK_SPEED = 20, 0.6
CAST_FRAMES, CAST_FORM, CAST_HIT = 48, 6, 27
HOP_FRAMES, HOP_RIDE, HOP_LAND = 42, 9, 33
SLAM_FRAMES, SLAM_RIDE, SLAM_HIT = 60, 9, 45
DEATH_FRAMES = 60

# --- body plan -------------------------------------------------------------------
HEM_Z, WAIST_Z = 0.17, 0.6
SKIRT_R = (0.255, 0.085)                  # at the hem, at the waist
PEPLUM_C, PEPLUM_R = V((0, 0, 0.545)), (0.31, 0.3, 0.125)
TORSO = (V((0, 0, 0.56)), V((0, 0, 0.97)))
TORSO_R = (0.092, 0.068)
PELVIS = V((0, 0, 0.32))
CHEST_BASE, CHEST_TOP = V((0, 0, 0.66)), V((0, 0, 0.98))

LEGS = {"FL": V((0.068, -0.075, 0)), "FR": V((-0.068, -0.075, 0)), "BL": V((0.155, 0.06, 0)), "BR": V((-0.155, 0.06, 0))}
LEG_TOP = {k: V((p.x * 0.55, p.y * 0.55, 0.26)) for k, p in LEGS.items()}
ANKLE = {k: V((p.x, p.y, 0.065)) for k, p in LEGS.items()}
# (each leg bends at a knee halfway down, a little forward: thigh leg.*, shin shin.*)
KNEE = {k: (LEG_TOP[k] + ANKLE[k]) / 2 + V((0, -0.03, 0)) for k in LEGS}
FOOT_C = {k: V((p.x, p.y - 0.022, 0.042)) for k, p in LEGS.items()}
FOOT_SIZE = (0.05, 0.066, 0.042)
LEG_R = (0.042, 0.035)

SHOULDER = {s: V((sign * 0.05, 0, 0.925)) for s, sign in SIDES}
ELBOW = {s: V((sign * 0.215, 0.005, 0.95)) for s, sign in SIDES}
WRIST = {s: V((sign * 0.25, 0.005, 1.17)) for s, sign in SIDES}
HAND = {s: [WRIST[s], V((sign * 0.262, 0.005, 1.25)), V((sign * 0.31, 0.0, 1.3)), V((sign * 0.355, -0.005, 1.285))]
        for s, sign in SIDES}
TIP = {s: HAND[s][-1] for s, _ in SIDES}
ARM_R = (0.045, 0.044, 0.038)
HAND_R = (0.037, 0.034, 0.03, 0.022)

FACE = V((0, -0.05, 1.21))
EYES = {s: V((sign * 0.078, -0.055, 1.19)) for s, sign in SIDES}
EYE_R, PUPIL_R = 0.052, 0.024
PUPIL_DIR = {s: V((sign * 0.25, -0.95, 0.12)).normalized() for s, sign in SIDES}
BROWS = {s: (V((sign * 0.15, -0.065, 1.305)), V((sign * 0.022, -0.085, 1.245))) for s, sign in SIDES}
BROW_R = (0.02, 0.024)


# --- sculpture -----------------------------------------------------------------------
def capped_cone(P, z0, z1, r0, r1, wobble=None):
    """A cone frustum about the z axis from z0 (radius r0) to z1 (radius r1); `wobble`
    (theta, z) -> extra radius scallops its side."""
    h = (z1 - z0) / 2
    x = np.linalg.norm(P[..., :2], axis=-1)
    if wobble is not None:
        x = x - wobble(np.arctan2(P[..., 1], P[..., 0]), P[..., 2])
    y = P[..., 2] - (z0 + h)
    k2x, k2y = r1 - r0, 2 * h
    cax = x - np.minimum(x, np.where(y < 0, r0, r1))
    cay = np.abs(y) - h
    t = np.clip(((r1 - x) * k2x + (h - y) * k2y) / (k2x * k2x + k2y * k2y), 0, 1)
    cbx, cby = x - r1 + k2x * t, y - h + k2y * t
    s = np.where((cbx < 0) & (cay < 0), -1.0, 1.0)
    return s * np.sqrt(np.minimum(cax * cax + cay * cay, cbx * cbx + cby * cby))


def hem_scallops(theta, z):
    """Ten round scallops round the hem, fading out up the skirt."""
    return 0.016 * np.cos(10 * theta) * (1 - C.np_smoothstep(HEM_Z, HEM_Z + 0.16, z))


def skirt_sdf(P):
    return capped_cone(P, HEM_Z + 0.012, WAIST_Z, SKIRT_R[0] - 0.012, SKIRT_R[1] - 0.012, hem_scallops) - 0.012


def peplum_sdf(P):
    theta = np.arctan2(P[..., 1], P[..., 0])
    k = 1 + 0.06 * np.cos(8 * theta) * C.np_smoothstep(0.1, 0.3, np.linalg.norm(P[..., :2], axis=-1))
    Q = P.copy()
    Q[..., 0] /= k
    Q[..., 1] /= k
    return K.ellipsoid(Q, PEPLUM_C, PEPLUM_R) * np.minimum(k, 1)


def torso_sdf(P):
    return K.round_cone(P, TORSO[0], TORSO[1], *TORSO_R)


def swirl_mats(base, turns, n):
    """Swirling stripes: n bands winding round the axis, `turns` turns a cell up."""
    def mats(centers):
        theta = np.arctan2(centers[:, 1], centers[:, 0])
        u = np.modf((theta / TAU * n + centers[:, 2] * turns * n) % 1 + 1)[0]
        return np.where(u < 0.24, SWIRL_M, base)
    return mats


def straight_frame(k):
    """The frame of a straight bone from the leg's top to its ankle, rolled to face -Y (as the leg's
    one bone was: its clips swing, splay and draw it up in it)."""
    y = (ANKLE[k] - LEG_TOP[k]).normalized()
    z = V((0, -1, 0)) - y * y.dot(V((0, -1, 0)))
    z.normalize()
    return Matrix((y.cross(z), y, z)).transposed()


def leg_sdf(P, k):
    mid = (LEG_R[0] + LEG_R[1]) / 2
    d = K.smin(K.round_cone(P, LEG_TOP[k], KNEE[k], LEG_R[0], mid), K.round_cone(P, KNEE[k], ANKLE[k], mid, LEG_R[1]), 0.01)
    return K.smin(d, K.ellipsoid(P, FOOT_C[k], FOOT_SIZE), 0.03)


def arm_pts(s):
    return [SHOULDER[s], ELBOW[s], WRIST[s]]


def arm_sdf(P, s):
    return K.tapered_tube(P, arm_pts(s), ARM_R)


def hand_sdf(P, s):
    return K.tapered_tube(P, HAND[s], HAND_R)


def brow_sdf(P, s):
    a, b = BROWS[s]
    return K.round_cone(P, a, b, *BROW_R)


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = (-0.32, -0.32, HEM_Z - 0.04), (0.32, 0.32, WAIST_Z + 0.04)
    parts.add("wave0", skirt_sdf, lo, hi, VOXEL, mat=swirl_mats(SKIRT_M, 1.6, 5))
    lo, hi = (-0.4, -0.4, 0.38), (0.4, 0.4, 0.72)
    parts.add("wave1", peplum_sdf, lo, hi, VOXEL, mat=swirl_mats(SKIRT_M, 1.0, 8))
    lo, hi = K.bounds(TORSO, 0.11)
    parts.add("torso", torso_sdf, lo, hi, DETAIL, mat=BODY_M)
    for k in LEGS:
        lo, hi = K.bounds([LEG_TOP[k], ANKLE[k], FOOT_C[k]], 0.08)
        parts.add(f"leg.{k}", lambda P, k=k: leg_sdf(P, k), lo, hi, DETAIL, mat=BODY_M)
    for s, _ in SIDES:
        lo, hi = K.bounds(arm_pts(s), 0.06)
        parts.add(f"arm.{s}", lambda P, s=s: arm_sdf(P, s), lo, hi, DETAIL, mat=BODY_M)
        lo, hi = K.bounds(HAND[s], 0.05)
        parts.add(f"hand.{s}", lambda P, s=s: hand_sdf(P, s), lo, hi, FINE, mat=BODY_M)
        e = EYES[s]
        parts.add(f"eye.{s}", lambda P, c=e: F._sd_sphere(P, c, EYE_R), e - V((0.06,) * 3), e + V((0.06,) * 3), FINE, mat=EYE_M)
        pupil = e + PUPIL_DIR[s] * 0.04
        parts.add(f"eye.{s}", lambda P, c=pupil: F._sd_sphere(P, c, PUPIL_R), pupil - V((0.03,) * 3), pupil + V((0.03,) * 3),
                  FINE, mat=PUPIL_M)
        lo, hi = K.bounds(BROWS[s], 0.04)
        parts.add("head", lambda P, s=s: brow_sdf(P, s), lo, hi, FINE, mat=BROW_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "tornado"
    obj["body_color"] = BODY_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def helix(turns, phase, r0, r1, t0, t1, n=96):
    """A spiral winding up from the tip, widening as it goes: its centre line and radii."""
    pts, radii = [], []
    for k in range(n):
        u = k / (n - 1)
        th = TAU * turns * u + phase
        r = r0 + (r1 - r0) * u ** 1.25
        pts.append(V((r * math.cos(th), r * math.sin(th), 0.03 + 0.92 * u)))
        radii.append(t0 + (t1 - t0) * u)
    return pts, radii


def build_prop(coll):
    """One of its twisters: two spirals of wind winding up round each other about a thin
    funnel, wide at the top; a plain mesh (no rig), one cell tall, its tip on the origin."""
    parts = K.Parts()
    for i, (turns, phase, r0, r1, t0, t1, mat) in enumerate(((3.2, 0, 0.03, 0.27, 0.02, 0.05, 0),
                                                             (3.2, math.pi, 0.025, 0.21, 0.016, 0.036, 1))):
        pts, radii = helix(turns, phase, r0, r1, t0, t1)
        lo, hi = K.bounds(pts, 0.07)
        parts.add(f"spiral{i}", lambda P, pts=pts, radii=radii: K.tapered_tube(P, pts, radii), lo, hi, 0.012, mat=mat)
    parts.add("funnel", lambda P: K.round_cone(P, V((0, 0, 0.03)), V((0, 0, 0.62)), 0.02, 0.085), (-0.12, -0.12, 0), (0.12, 0.12, 0.72),
              0.012, mat=1)
    obj = parts.mesh(PROP, coll, WIND_MATERIALS)
    for name, roughness in (("TornadoWind", 0.45), ("TornadoWindDeep", 0.5)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    K.decimate(obj, 1500)
    return obj


# --- rig / skin ----------------------------------------------------------------------
def build_rig(coll):
    up, fwd = (0, 0, 1), (0, -1, 0)
    bones = [("root", (0, 0, 0), (0, 0.2, 0), None, False, up),
             ("hips", PELVIS, CHEST_BASE, "root", True, fwd),
             ("wave0", V((0, 0, HEM_Z)), V((0, 0, WAIST_Z)), "hips", True, fwd),
             ("wave1", V((0, 0, 0.47)), V((0, 0, 0.67)), "hips", True, fwd),
             ("chest", CHEST_BASE, CHEST_TOP, "hips", True, fwd),
             ("head", V((0, -0.05, 1.1)), V((0, -0.05, 1.36)), "chest", True, fwd)]
    for s, sign in SIDES:
        e = EYES[s]
        bones += [(f"eye.{s}", e, e + V((0, -0.06, 0)), "head", True, up),
                  (f"arm_upper.{s}", SHOULDER[s], ELBOW[s], "chest", True, fwd),
                  (f"arm_lower.{s}", ELBOW[s], WRIST[s], f"arm_upper.{s}", True, fwd),
                  (f"hand.{s}", WRIST[s], HAND[s][2], f"arm_lower.{s}", True, fwd),
                  (f"tip.{s}", TIP[s], TIP[s] + V((sign * 0.03, 0, 0.05)), f"hand.{s}", False, fwd)]
    for k in LEGS:
        bones.append((f"leg.{k}", LEG_TOP[k], KNEE[k], "hips", True, fwd))
        bones.append((f"shin.{k}", KNEE[k], ANKLE[k], f"leg.{k}", True, fwd))
    return K.armature(RIG_NAME, coll, bones, {
        "enemy": "tornado", "forward": "-Y", "attack_style": "twisters", "normal_speed": WALK_SPEED,
        "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        part, s = (kind.split(".") + [""])[:2]
        Q = P[lo:hi]
        if part == "torso":
            up = C.np_smoothstep(CHEST_BASE.z - 0.05, CHEST_BASE.z + 0.06, Q[:, 2])
            W[lo:hi, names.index("hips")] = 1 - up
            W[lo:hi, names.index("chest")] = up
        elif part == "arm":
            pts = arm_pts(s)
            _, along = C._polyline_closest(Q, pts)
            joint = (pts[1] - pts[0]).length
            past = C.np_smoothstep(joint - 0.04, joint + 0.04, along)
            top = 1 - C.np_smoothstep(0.0, 0.04, along)
            WB = np.zeros((hi - lo, len(names)), np.float32)
            WB[:, names.index(f"arm_upper.{s}")] = (1 - past) * (1 - top)
            WB[:, names.index("chest")] = top
            WB[:, names.index(f"arm_lower.{s}")] = past
            W[lo:hi] = K.diffuse(obj, lo, hi, WB, 4)
        elif part == "hand":
            _, along = C._polyline_closest(Q, HAND[s])
            own = C.np_smoothstep(0.0, 0.04, along)
            W[lo:hi, names.index(f"hand.{s}")] = own
            W[lo:hi, names.index(f"arm_lower.{s}")] = 1 - own
        elif part == "leg":   # the thigh to the knee, the shin (and the foot) from it
            _, along = C._polyline_closest(Q, [LEG_TOP[s], KNEE[s], ANKLE[s]])
            a = (KNEE[s] - LEG_TOP[s]).length
            knee = C.np_smoothstep(a - 0.02, a + 0.02, along)
            W[lo:hi, names.index(f"leg.{s}")] = 1 - knee
            W[lo:hi, names.index(f"shin.{s}")] = knee
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
    for name, roughness in (("TornadoBody", 0.62), ("TornadoSkirt", 0.66), ("TornadoSwirl", 0.6),
                            ("TornadoEyes_glow", 0.25), ("TornadoPupils", 0.2), ("TornadoBrows", 0.5)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion --------------------------------------------------------------------------
REST_HAND = {s: WRIST[s].copy() for s, _ in SIDES}                   # chest space
REST_DIR = {s: (HAND[s][2] - WRIST[s]).normalized() for s, _ in SIDES}
REST_ELBOW = {s: V((sign * 1.0, 0.1, -0.6)) for s, sign in SIDES}    # which way the elbows point


def params(**kw):
    p = {"t": 0.0, "pos": V(), "pitch": 0.0, "roll": 0.0, "yaw": 0.0, "pivot": PELVIS,
         "chest": (0.0, 0.0, 0.0), "face": V(), "head": (0.0, 0.0, 0.0), "eyes": 1.0,
         "skirt": (0.0, 0.0, 1.0), "peplum": (0.0, 0.0, 1.0),       # (tilt x, tilt y, flare)
         "legs": {k: (0.0, 0.0, 0.0) for k in LEGS},                 # (swing, splay, lift)
         "hands": {s: REST_HAND[s].copy() for s, _ in SIDES},
         "dirs": {s: REST_DIR[s].copy() for s, _ in SIDES},
         "elbows": {s: REST_ELBOW[s].copy() for s, _ in SIDES}}
    p.update(kw)
    return p


def solver(rig, fn):
    skel = C.Skeleton(rig)
    length = {b.name: b.length for b in rig.data.bones}

    def solve(f, lift):
        p = fn(f)
        L = Matrix.Translation((0, 0, lift))
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, L @ skel.rest["root"])
        # (it turns about its own axis; it tips and topples about the pivot)
        R = (C.rot_y(p["roll"]) @ C.rot_x(p["pitch"])).to_4x4()
        piv = p["pivot"]
        B = L @ Matrix.Translation(p["pos"]) @ C.rot_z(p["yaw"]).to_4x4() @ Matrix.Translation(piv) @ R @ Matrix.Translation(-piv)
        bases["hips"] = skel.set("hips", poses, B @ skel.rest["hips"])
        for bone, (tx, ty, flare) in (("wave0", p["skirt"]), ("wave1", p["peplum"])):
            bases[bone] = K.pose_local(skel, bone, poses, Matrix.Rotation(tx, 4, "X") @ Matrix.Rotation(ty, 4, "Z")
                                       @ Matrix.Diagonal((flare, 1 / math.sqrt(flare), flare, 1)))
        cp, cy, cr = p["chest"]
        bases["chest"] = K.pose_local(skel, "chest", poses, Matrix.Rotation(cp, 4, "X") @ Matrix.Rotation(cy, 4, "Y")
                                      @ Matrix.Rotation(cr, 4, "Z"))
        hp, hy, hr = p["head"]
        bases["head"] = K.pose_local(skel, "head", poses, Matrix.Translation(p["face"]) @ Matrix.Rotation(hp, 4, "X")
                                     @ Matrix.Rotation(hy, 4, "Y") @ Matrix.Rotation(hr, 4, "Z"))
        e = max(0.06, p["eyes"])
        for s, _ in SIDES:
            bases[f"eye.{s}"] = K.pose_local(skel, f"eye.{s}", poses, Matrix.Diagonal((1, 1, e, 1)))
        # each foot where a straight leg from its top, swung, splayed and drawn up so, would put it; the
        # knee bends to reach it (ik.py limb)
        carry = poses["hips"] @ skel.rest["hips"].inverted()
        for k, sign in (("FL", 1), ("FR", -1), ("BL", 1), ("BR", -1)):
            swing, splay, up = p["legs"][k]
            F = straight_frame(k)
            turn = F @ (Matrix.Rotation(swing, 3, "X") @ Matrix.Rotation(sign * splay, 3, "Z")) @ F.transposed()
            foot = LEG_TOP[k] + F @ V((0, -up, 0)) + turn @ (ANKLE[k] - LEG_TOP[k])
            rest = (LEG_TOP[k], KNEE[k], ANKLE[k])
            (thigh, shank), _ = IK.limb(rest, foot, turn @ (KNEE[k] - LEG_TOP[k]))
            bases[f"leg.{k}"] = skel.set(f"leg.{k}", poses, carry @ thigh @ skel.rest[f"leg.{k}"])
            bases[f"shin.{k}"] = skel.set(f"shin.{k}", poses, carry @ shank @ skel.rest[f"shin.{k}"])
        Cm = poses["chest"] @ skel.rest["chest"].inverted()
        c3 = Cm.to_3x3()
        for s, _ in SIDES:
            u, lo, hand = f"arm_upper.{s}", f"arm_lower.{s}", f"hand.{s}"
            shoulder = skel.base(u, poses).translation
            elbow, wrist = C.two_bone_ik(shoulder, Cm @ p["hands"][s], length[u], length[lo], c3 @ p["elbows"][s])
            bases[u] = skel.aim(u, poses, elbow - shoulder)
            bases[lo] = skel.aim(lo, poses, wrist - elbow)
            bases[hand] = skel.aim(hand, poses, c3 @ p["dirs"][s])
            bases[f"tip.{s}"] = K.pose_local(skel, f"tip.{s}", poses, Matrix())
        return bases
    return solve


def blink(t, at, length=0.2):
    u = (t - at) / length
    return 1 - 0.94 * math.sin(math.pi * u) ** 2 if 0 <= u <= 1 else 1.0


def raised(s, sign, up, out=0.0, fwd=0.0):
    """Where the hand goes when lifted `up` cells (and `out` further out, `fwd` forward)."""
    return REST_HAND[s] + V((sign * out, -fwd, up))


def walk(f):
    n = WALK_FRAMES
    ph = (f / n) % 1
    w = TAU * ph
    legs = {}
    for k in LEGS:
        q = w + (0 if k in ("FL", "BR") else math.pi)
        legs[k] = (D(16) * math.sin(q), 0.0, 0.03 * max(0.0, math.cos(q)))
    hands = {s: raised(s, sign, 0.025 * math.sin(w + (0 if s == "L" else math.pi)), 0.015 * math.cos(w))
             for s, sign in SIDES}
    dirs = {s: (REST_DIR[s] + V((0, 0, 0.25 * math.sin(2 * w + (0 if s == "L" else 1.5))))).normalized() for s, _ in SIDES}
    return params(t=f / FPS, pos=V((0, 0, 0.012 * math.cos(2 * w))), roll=D(3) * math.sin(w), yaw=D(4) * math.sin(w + 0.5),
                  chest=(D(2) * math.cos(2 * w), 0, D(-3) * math.sin(w)), face=V((0, 0.012 * math.cos(2 * w - 0.8), 0)),
                  head=(0, D(4) * math.sin(w - 0.6), D(3) * math.sin(w)), eyes=blink(f, 9, 4),
                  skirt=(D(3) * math.cos(w), D(2) * math.sin(w), 1.0), peplum=(D(-2) * math.cos(w), D(-2) * math.sin(w), 1.0),
                  legs=legs, hands=hands, dirs=dirs)


def cast(f):
    k, t = C.keyframes, f / FPS
    hit = CAST_HIT / FPS
    lift = k((0, 0), (0.15, -0.04), (0.45, 0.17), (hit - 0.08, 0.2), (hit + 0.05, -0.12), (1.25, -0.05), (1.6, 0))(t)
    out = k((0, 0), (0.45, 0.06), (hit - 0.08, 0.08), (hit + 0.05, 0.02), (1.6, 0))(t)
    fwd = k((0, 0), (0.45, -0.03), (hit - 0.08, -0.06), (hit + 0.05, 0.3), (1.2, 0.12), (1.6, 0))(t)
    whirl = C.smoothstep(0.2, 0.45, t) * (1 - C.smoothstep(hit - 0.12, hit, t))
    hands, dirs = {}, {}
    for s, sign in SIDES:
        a = TAU * 2.2 * t + (0 if s == "L" else math.pi)
        circle = V((sign * 0.05 * math.cos(a), 0.05 * math.sin(a), 0.03 * math.sin(a))) * whirl
        hands[s] = raised(s, sign, lift, out, fwd) + circle
        flung = C.smoothstep(hit - 0.08, hit + 0.04, t) * (1 - C.smoothstep(hit + 0.25, 1.5, t))
        dirs[s] = (REST_DIR[s] + V((0, -1.4 * flung, -0.6 * flung)) + V((0, 0, 0.6)) * whirl).normalized()
    lean = k((0, 0), (0.45, -1), (hit - 0.08, -1.2), (hit + 0.05, 1), (1.6, 0))(t)
    return params(t=t, pos=V((0, 0.01 * lean, -0.015 * max(0.0, lean))), pitch=D(5) * lean,
                  chest=(D(6) * lean, 0, 0), face=V((0, 0, 0.02 * whirl)), head=(D(-6) * lean, 0, D(5) * math.sin(TAU * 3 * t) * whirl),
                  eyes=k((0, 1), (0.3, 1.1), (hit - 0.05, 0.55), (hit + 0.15, 0.55), (1.0, 1))(t),
                  skirt=(D(-3) * lean, D(3) * whirl * math.sin(TAU * 2 * t), 1 + 0.06 * whirl),
                  peplum=(D(-4) * lean, D(-3) * whirl * math.sin(TAU * 2 * t), 1 + 0.08 * whirl),
                  legs={k_: (D(-6) * lean, 0.0, 0.0) for k_ in LEGS}, hands=hands, dirs=dirs)


def ride_pose(t, take_off, land, slam=False):
    """Crouch, lifted off (feet tucked, arms out, skirts flaring), land with a squash."""
    k = C.keyframes
    crouch = k((0, 0), (take_off - 0.12, 1), (take_off + 0.02, -0.4), (take_off + 0.2, 0), (land - 0.06, 0),
               (land + 0.02, 1.1), (land + 0.3, 0))(t)
    air = C.smoothstep(take_off - 0.05, take_off + 0.15, t) * (1 - C.smoothstep(land - 0.08, land + 0.02, t))
    flail = math.sin(TAU * 3 * t)
    hands, dirs = {}, {}
    if slam:
        up = C.smoothstep(take_off, take_off + 0.4, t) * (1 - C.smoothstep(land - 0.16, land - 0.02, t))
        smash = C.smoothstep(land - 0.16, land - 0.02, t) * (1 - C.smoothstep(land + 0.2, land + 0.45, t))
        for s, sign in SIDES:
            hands[s] = REST_HAND[s] + V((sign * (-0.12 * up + 0.04 * smash), -0.08 * up - 0.2 * smash, 0.24 * up - 0.3 * smash))
            dirs[s] = (REST_DIR[s] + V((-sign * 0.8 * up, -0.2 * up - 0.9 * smash, 0.4 * up - 0.8 * smash))).normalized()
        lean = -0.6 * up + 1.4 * smash
    else:
        for s, sign in SIDES:
            hands[s] = REST_HAND[s] + V((sign * 0.14 * air, 0.0, -0.1 * air + 0.03 * air * flail * sign))
            dirs[s] = (REST_DIR[s] + V((sign * 0.9 * air, 0, -0.3 * air))).normalized()
        lean = -0.5 * air
    legs = {k_: (D(-40) * air * (1 if k_[0] == "F" else -0.6), D(12) * air, 0.07 * air) for k_ in LEGS}
    return params(t=t, pos=V((0, 0, -0.05 * max(0.0, crouch))), pitch=D(6) * lean,
                  chest=(D(6) * lean + D(-5) * max(0.0, crouch), 0, D(4) * air * flail),
                  face=V((0, 0, -0.03 * max(0.0, crouch) + 0.02 * air)), head=(D(-4) * lean, D(5) * air * flail, 0),
                  eyes=k((0, 1), (take_off - 0.1, 0.5), (take_off + 0.15, 1.15), (land - 0.1, 1.0), (land + 0.05, 0.4),
                         (land + 0.3, 1))(t),
                  skirt=(D(-4) * lean, 0, 1 + 0.16 * air + 0.06 * max(0.0, crouch)),
                  peplum=(D(-5) * lean, 0, 1 + 0.2 * air + 0.08 * max(0.0, crouch)),
                  legs=legs, hands=hands, dirs=dirs)


def hop(f):
    return ride_pose(f / FPS, HOP_RIDE / FPS, HOP_LAND / FPS)


def slam(f):
    return ride_pose(f / FPS, SLAM_RIDE / FPS, SLAM_HIT / FPS, slam=True)


def death(f):
    k, t = C.keyframes, f / FPS
    spin = TAU * 2 * (1 - (1 - min(1.0, t / 1.1)) ** 2)
    fall = min(1.0, max(0.0, (t - 0.85) / 0.45)) ** 2
    since = max(0.0, t - 1.3)
    bounce = 0.03 * math.exp(-since * 9) * abs(math.sin(TAU * 1.6 * since)) if t > 1.3 else 0.0
    fling = C.smoothstep(0.0, 0.3, t) * (1 - C.smoothstep(1.0, 1.5, t))
    limp = C.smoothstep(1.1, 1.6, t)
    hands, dirs = {}, {}
    for s, sign in SIDES:
        hands[s] = REST_HAND[s] + V((sign * 0.16 * fling, 0, -0.18 * fling)) + V((sign * 0.05, -0.05, -0.2)) * limp
        dirs[s] = (REST_DIR[s] + V((sign * 1.2 * fling, 0, -0.6 * fling - 0.6 * limp))).normalized()
    return params(t=t, pivot=V((0.25, 0, 0)), yaw=spin, roll=D(84) * fall, pos=V((0, 0, bounce)),
                  chest=(D(-8) * limp, 0, D(10) * fling * math.sin(TAU * 2 * t)),
                  face=V((0, 0, -0.08 * limp)), head=(D(14) * limp, D(-12) * limp, D(8) * fling * math.sin(TAU * 3 * t)),
                  eyes=k((0, 1), (0.2, 1.2), (1.0, 1), (1.3, 0.6), (1.6, 0.06))(t),
                  skirt=(D(6) * fling * math.sin(TAU * 2 * t), 0, 1 + 0.18 * fling),
                  peplum=(D(-6) * fling * math.sin(TAU * 2 * t), 0, 1 + 0.22 * fling - 0.05 * limp),
                  legs={k_: (D(10) * limp, D(18) * fling, 0.0) for k_ in LEGS}, hands=hands, dirs=dirs)


def bone_point(rig, action, frame, bone, at="head"):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    pb = rig.pose.bones[bone]
    return rig.matrix_world @ (pb.head if at == "head" else pb.tail)


def game(v):
    return [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "TornadoWalk", solver(rig, walk), WALK_FRAMES, cyclic=True, extras={"speed": WALK_SPEED})
    c = K.ground_clip(rig, obj, "TornadoCast", solver(rig, cast), CAST_FRAMES,
                      extras={"attack_style": "twisters", "hit_frame": CAST_HIT, "hit_time": CAST_HIT / FPS,
                              "form_frame": CAST_FORM})
    c.pose_markers.new("Form").frame = CAST_FORM
    c.pose_markers.new("Fling").frame = CAST_HIT
    h = K.ground_clip(rig, obj, "TornadoHop", solver(rig, hop), HOP_FRAMES,
                      extras={"attack_style": "ride", "hit_frame": HOP_LAND, "hit_time": HOP_LAND / FPS, "ride_frame": HOP_RIDE})
    h.pose_markers.new("Ride").frame = HOP_RIDE
    h.pose_markers.new("Land").frame = HOP_LAND
    s = K.ground_clip(rig, obj, "TornadoSlam", solver(rig, slam), SLAM_FRAMES,
                      extras={"attack_style": "ride", "hit_frame": SLAM_HIT, "hit_time": SLAM_HIT / FPS, "ride_frame": SLAM_RIDE})
    s.pose_markers.new("Ride").frame = SLAM_RIDE
    s.pose_markers.new("Slam").frame = SLAM_HIT
    K.ground_clip(rig, obj, "TornadoDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.6}, settle_from=round(1.35 * FPS))
    K.register(rig, CLIPS)
    # where the twisters spin up and leave from: over the hands at the fling
    hands = [game(bone_point(rig, "TornadoCast", CAST_HIT, f"tip.{s}")) for s, _ in SIDES]
    c["hands"] = hands
    return {"hands": hands}


# --- previews ------------------------------------------------------------------------
def preview(scene, rig, prop, path):
    prop.hide_render = False
    prop.location = (1.05, 0.25, 0)
    prop.scale = (1.0, 1.0, 1.15)
    shots = [("TornadoWalk", 0, (3.0, -5.4, 2.4)), ("TornadoWalk", 5, (-5.0, -2.0, 2.0)),
             ("TornadoCast", 20, (3.6, -4.6, 2.2)), ("TornadoCast", CAST_HIT + 2, (4.8, -2.4, 1.8)),
             ("TornadoSlam", 36, (3.4, -4.8, 2.6)), ("TornadoDeath", DEATH_FRAMES, (0.6, -5.2, 3.4))]
    try:
        K.contact_sheet(scene, rig, shots, path, (0.2, 0.1, 0.65), size=360, cols=3)
    finally:
        prop.hide_render = True
        prop.location = (0, 0, 0)
        prop.scale = (1, 1, 1)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    obj.data.validate()
    K.decimate(obj)
    obj.data.validate()
    points = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("TornadoDeath",))
    report.update(points)
    K.setup_stage(scene, "Tornado", STAGE, (0, 0, 0.7), 2.4)
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, WALK_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Tornado", NAME, (0, 0, 0.7), 2.8)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, prop, preview_path)]
    print("Tornado:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "tornado.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "tornado.blend"),
         preview_path=args[2] if len(args) > 2 else None)
