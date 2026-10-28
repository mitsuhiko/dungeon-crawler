"""
Slug: a big dark green slug of the slime marsh, from the kids' sketch.

A long, low body with stripes across its back, carried on four short curly legs (the sketch's
slug has legs), and two long eye stalks with a round eye on each tip. It crawls very slowly,
rippling, and leaves a trail of slime behind (the game: its profile's `trail`). It rears up and
spits balls of slime that slow whatever they hit.
Faces -Y in Blender, +Z up; one unit = one game cell, about 0.9 cells tall to its eyes.

Rig: root, tail, mid, front, head (the body, tail to head), stalk.L, stalk.R (the eye stalks, the
eyes on their tips), and its legs: leg.FL, leg.FR, leg.BL, leg.BR (hip to knee, the knee out to the
side) and shin.FL .. shin.BR (knee to ankle, the curly foot on it). The clips swing each leg as if
straight from the hip; its knee bends to put the foot there (ik.py limb).

Clips, 30 fps, in place:
    SlugCrawl   36-frame loop: the body ripples front to back, the legs shuffle, the stalks bob.
    SlugSpit    1.4 s: rears up and swells, then lunges forward and spits at frame 24
                (extras.hit_frame, extras.muzzle: its mouth).
    SlugDeath   1.6 s: shudders, sags flat, its stalks droop. Held.
    SlugBall    (a prop, not a clip): the ball of slime it spits, its tail behind it.

Headless:
    Blender -b --python blender/slug.py -- assets/slug.glb blender/slug.blend \
        blender/previews/slug-preview.png
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

NAME, RIG_NAME, PROP = "Slug", "SlugRig", "SlugBall"
SCENE, COLLECTION, STAGE = "Slug", "SlugAsset", "SlugStage"
FPS, D, TAU = K.FPS, K.D, K.TAU
V = Vector
CLIPS = ("SlugCrawl", "SlugSpit", "SlugDeath")

BODY_HEX, STRIPE_HEX, FOOT_HEX, EYE_HEX, PUPIL_HEX, MOUTH_HEX, SLIME_HEX = (
    "#2e5a22", "#1a3a14", "#5a7a3a", "#e4f0a0", "#141a0c", "#14200e", "#8ae048")
MATERIALS = (("SlugBody", BODY_HEX, 0), ("SlugStripes", STRIPE_HEX, 0), ("SlugFoot", FOOT_HEX, 0),
             ("SlugEyes_glow", EYE_HEX, 0.6), ("SlugPupils", PUPIL_HEX, 0), ("SlugMouth", MOUTH_HEX, 0))
BODY_M, STRIPE_M, FOOT_M, EYE_M, PUPIL_M, MOUTH_M = range(len(MATERIALS))
BALL_MATERIALS = (("SlugSlime", SLIME_HEX, 0.6),)

VOXEL, FINE = 0.008, 0.004
CRAWL_FRAMES, CRAWL_SPEED = 36, 0.35
SPIT_FRAMES, SPIT_HIT = 42, 24
DEATH_FRAMES = 48

# --- body plan -----------------------------------------------------------------
# the spine from the tip of the tail to the head; the body rides on its legs, 0.12 up
SPINE = [V((0, 0.55, 0.15)), V((0, 0.3, 0.24)), V((0, 0.0, 0.3)), V((0, -0.28, 0.32)), V((0, -0.46, 0.34))]
SPINE_R = (0.05, 0.16, 0.21, 0.2, 0.17)
HEAD_C = V((0, -0.47, 0.35))
MOUTH = V((0, -0.62, 0.3))
STALKS = {s: [V((s * 0.07, -0.48, 0.47)), V((s * 0.1, -0.52, 0.64)), V((s * 0.15, -0.55, 0.8))] for s in (-1, 1)}
EYE_R = 0.065
LEGS = {name: (sx, y) for name, sx, y in (("leg.FL", -1, -0.26), ("leg.FR", 1, -0.26), ("leg.BL", -1, 0.2), ("leg.BR", 1, 0.2))}


def leg_points(sx, y):
    """A short curly leg: out from the body to a knee at the side, down to the ankle, and the foot
    curling up from it."""
    return [V((sx * 0.1, y, 0.16)), V((sx * 0.25, y - 0.01, 0.15)), V((sx * 0.19, y - 0.04, 0.025)), V((sx * 0.15, y - 0.1, 0.035)),
            V((sx * 0.12, y - 0.1, 0.06))]


def shin(name):
    return "shin." + name[4:]


def body_sdf(P):
    d = K.tapered_tube(P, SPINE, SPINE_R)
    # a flatter belly: cut off under it
    d = K.smax(d, -(P[..., 2] - 0.12), 0.04)
    # the head a little rounder
    return K.smin(d, K.ellipsoid(P, HEAD_C, (0.17, 0.18, 0.16)), 0.06)


def body_mats(centers):
    """Stripes across its back (the sketch's), a paler foot underneath, the mouth in front."""
    y, z = centers[:, 1], centers[:, 2]
    stripe = (np.sin((y + 0.05) * TAU / 0.15) > 0.45) & (z > 0.2) & (y > -0.33) & (y < 0.45)
    foot = z < 0.15
    m = np.where(stripe, STRIPE_M, BODY_M)
    return np.where(foot, FOOT_M, m)


def build_mesh(coll):
    parts = K.Parts()
    lo, hi = K.bounds(SPINE + [HEAD_C], 0.24)
    parts.add("body", body_sdf, lo, hi, VOXEL, mat=body_mats)
    parts.add("head", lambda P: K.ellipsoid(P, MOUTH, (0.07, 0.03, 0.035)), MOUTH - V((0.1,) * 3), MOUTH + V((0.1,) * 3), FINE, mat=MOUTH_M)
    for s, pts in STALKS.items():
        side = "stalk.L" if s < 0 else "stalk.R"
        lo, hi = K.bounds(pts, 0.05)
        parts.add(side, lambda P, p=pts: K.tapered_tube(P, p, (0.035, 0.026, 0.022)), lo, hi, FINE)
        eye = pts[-1] + V((0, 0, EYE_R * 0.6))
        parts.add(side, lambda P, c=eye: K.ellipsoid(P, c, (EYE_R, EYE_R, EYE_R)), eye - V((0.09,) * 3), eye + V((0.09,) * 3), FINE, mat=EYE_M)
        pupil = eye + V((0, -EYE_R * 0.82, 0.005))
        parts.add(side, lambda P, c=pupil: K.ellipsoid(P, c, (0.028, 0.016, 0.03)), pupil - V((0.05,) * 3), pupil + V((0.05,) * 3), FINE, mat=PUPIL_M)
    for name, (sx, y) in LEGS.items():
        pts = leg_points(sx, y)
        lo, hi = K.bounds(pts, 0.06)
        parts.add(name, lambda P, p=pts: K.tapered_tube(P, p, (0.045, 0.04, 0.035, 0.028, 0.022)), lo, hi, FINE * 1.3, mat=FOOT_M)
    obj = parts.mesh(NAME, coll, MATERIALS)
    obj["enemy"] = "slug"
    obj["body_color"] = BODY_HEX
    obj["style"] = "smooth_clay"
    return obj, parts.owners


def build_prop(coll):
    """The ball of slime it spits: a plain mesh (no rig), round in front, a tail behind (+Y)."""
    parts = K.Parts()

    def ball(P):
        d = K.smin(K.ellipsoid(P, (0, 0, 0), (0.12, 0.13, 0.12)), K.round_cone(P, V((0, 0.04, 0)), V((0, 0.22, -0.02)), 0.08, 0.02), 0.05)
        return K.smin(d, K.ellipsoid(P, (0.05, -0.02, -0.08), (0.04, 0.04, 0.05)), 0.03)   # a drip off it
    parts.add("ball", ball, (-0.15, -0.16, -0.16), (0.15, 0.25, 0.15), 0.008, mat=0)
    obj = parts.mesh(PROP, coll, BALL_MATERIALS)
    bpy.data.materials["SlugSlime"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.1
    K.decimate(obj, 800)
    return obj


# --- rig / skin --------------------------------------------------------------
CHAIN = ("tail", "mid", "front", "head")
CHAIN_PTS = [SPINE[0], SPINE[1], SPINE[2], SPINE[3], V((0, -0.62, 0.35))]


def build_rig(coll):
    up = (0, 0, 1)
    bones = [("root", (0, 0, 0), (0, -0.1, 0), None, False, up)]
    for i, name in enumerate(CHAIN):
        bones.append((name, CHAIN_PTS[i], CHAIN_PTS[i + 1], CHAIN[i - 1] if i else "root", True, up))
    for s, pts in STALKS.items():
        bones.append(("stalk.L" if s < 0 else "stalk.R", pts[0], pts[-1], "head", True, (0, -1, 0)))
    for name, (sx, y) in LEGS.items():
        pts = leg_points(sx, y)
        bones.append((name, pts[0], pts[1], "front" if y < 0 else "mid", True, (0, -1, 0)))
        bones.append((shin(name), pts[1], pts[2], name, True, (0, -1, 0)))
    return K.armature(RIG_NAME, coll, bones, {"enemy": "slug", "forward": "-Y", "attack_style": "spit",
                                              "normal_speed": CRAWL_SPEED, "root_motion": False})


def compute_weights(obj, owners):
    P = K.mesh_points(obj)
    names = [b.name for b in obj.parent.data.bones if b.use_deform]
    W = np.zeros((len(P), len(names)), np.float32)
    along_of = np.cumsum([0] + [(b - a).length for a, b in zip(CHAIN_PTS, CHAIN_PTS[1:])])
    for o in owners:
        lo, hi, kind = o["lo"], o["hi"], o["kind"]
        if kind in LEGS:   # the thigh to the knee, the shin (and the foot) from it
            pts = leg_points(*LEGS[kind])
            _, along = C._polyline_closest(P[lo:hi], pts)
            a = (pts[1] - pts[0]).length
            knee = C.np_smoothstep(a - 0.03, a + 0.03, along)
            W[lo:hi, names.index(kind)] = 1 - knee
            W[lo:hi, names.index(shin(kind))] = knee
            continue
        if kind != "body":
            W[lo:hi, names.index(kind)] = 1
            continue
        _, along = C._polyline_closest(P[lo:hi], CHAIN_PTS)
        WB = np.zeros((hi - lo, len(names)), np.float32)
        past = [C.np_smoothstep(b - 0.06, b + 0.06, along) for b in along_of[1:4]]
        for k, name in enumerate(CHAIN):
            before = past[k - 1] if k else np.ones_like(along)
            after = past[k] if k < 3 else np.zeros_like(along)
            WB[:, names.index(name)] += before - after
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
    for name, roughness in (("SlugBody", 0.3), ("SlugStripes", 0.35), ("SlugFoot", 0.45), ("SlugEyes_glow", 0.2),
                            ("SlugPupils", 0.2), ("SlugMouth", 0.5)):
        bpy.data.materials[name].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = roughness
    return scene, rig, obj


# --- motion ------------------------------------------------------------------
# each chain bone pitches (`bend`, about its own x), yaws (`side`, about z) and swells (`swell`:
# its thickness, x and z); the stalks pitch and spread (`stalk`, `spread`); the legs swing (`legs`)
def params(**kw):
    p = {"bend": [0.0] * 4, "side": [0.0] * 4, "swell": [1.0] * 4, "flat": 1.0, "stalk": [0.0, 0.0], "spread": [0.0, 0.0],
         "legs": [0.0] * 4}
    p.update(kw)
    return p


LEG_NAMES = ("leg.FL", "leg.FR", "leg.BL", "leg.BR")


def swing_axis(pts):
    """The axis a leg swings about: the x of a bone from its hip to its ankle rolled to face -Y (as
    the straight leg's bone was)."""
    y = (pts[2] - pts[0]).normalized()
    z = V((0, -1, 0)) - y * y.dot(V((0, -1, 0)))
    return y.cross(z.normalized())


def solver(rig, fn):
    skel = C.Skeleton(rig)
    skel_parent = {name: rig.data.bones[name].parent.name for name in LEG_NAMES}

    def solve(f, lift):
        p = fn(f)
        poses, bases = {}, {}
        bases["root"] = skel.set("root", poses, Matrix.Translation((0, 0, lift)) @ skel.rest["root"])
        for i, name in enumerate(CHAIN):
            s = p["swell"][i]
            R = Matrix.Rotation(p["bend"][i], 4, "X") @ Matrix.Rotation(p["side"][i], 4, "Z")
            R = R @ Matrix.Diagonal((s, 1, s * (p["flat"] if i == 0 else 1), 1))
            bases[name] = K.pose_local(skel, name, poses, R)
        for k, name in enumerate(("stalk.L", "stalk.R")):
            sgn = -1 if k == 0 else 1
            R = Matrix.Rotation(p["stalk"][k], 4, "X") @ Matrix.Rotation(sgn * p["spread"][k], 4, "Z")
            bases[name] = K.pose_local(skel, name, poses, R)
        # each leg swung about its hip (as a straight leg from hip to ankle would be: forward +), carried
        # with the body where its hip sits; the knee bends to put the foot there
        for k, name in enumerate(LEG_NAMES):
            pts = leg_points(*LEGS[name])
            par = skel_parent[name]
            carry = poses[par] @ skel.rest[par].inverted()
            turn = carry.to_quaternion().to_matrix() @ Matrix.Rotation(p["legs"][k], 3, swing_axis(pts))
            hip = carry @ pts[0]
            (thigh, shank), _ = IK.limb(pts[:3], hip + turn @ (pts[2] - pts[0]), turn @ (pts[1] - pts[0]), root=hip)
            bases[name] = skel.set(name, poses, thigh @ skel.rest[name])
            bases[shin(name)] = skel.set(shin(name), poses, shank @ skel.rest[shin(name)])
        return bases
    return solve


def crawl(f):
    w = TAU * f / CRAWL_FRAMES
    # a wave of swelling running from the head to the tail, the legs taking turns
    swell = [1 + 0.06 * math.sin(w - 1.2 * i) for i in range(4)]
    return params(swell=swell, bend=[D(3) * math.sin(w), D(-2) * math.sin(w + 0.8), D(2) * math.sin(w + 1.6), D(3) * math.sin(w + 2.2)],
                  side=[D(4) * math.sin(w + 0.5), D(-3) * math.sin(w), 0, D(3) * math.sin(w - 0.4)],
                  stalk=[D(6) * math.sin(w), D(6) * math.sin(w + 1.3)], spread=[D(4) * math.sin(2 * w), D(4) * math.sin(2 * w + 1)],
                  legs=[D(22) * math.sin(w), D(22) * math.sin(w + math.pi), D(22) * math.sin(w + math.pi), D(22) * math.sin(w)])


def spit(f):
    k, t = C.keyframes, f / FPS
    hit = SPIT_HIT / FPS
    rear = k((0, 0), (0.45, 1), (hit - 0.06, 1.1), (hit, 0), (1.1, 0))(t)
    lunge = k((0, 0), (hit - 0.06, 0), (hit, 1), (hit + 0.2, 1), (1.35, 0))(t)
    swell = k((0, 1), (0.5, 1.12), (hit - 0.04, 1.2), (hit + 0.05, 0.95), (1.2, 1), (1.4, 1))(t)
    shake = math.sin(TAU * 12 * t) * C.smoothstep(0.35, 0.45, t) * (1 - C.smoothstep(hit - 0.06, hit, t))
    return params(bend=[D(-4) * rear, D(6) * rear - D(4) * lunge, D(14) * rear - D(6) * lunge, D(12) * rear - D(6) * lunge],
                  side=[0, D(2) * shake, D(-2) * shake, D(2) * shake], swell=[1, 1.03, swell, swell],
                  stalk=[D(-25) * rear + D(10) * lunge, D(-25) * rear + D(10) * lunge], spread=[D(14) * rear, D(14) * rear],
                  legs=[D(-10) * rear, D(-10) * rear, D(8) * rear, D(8) * rear])


def death(f):
    t = f / FPS
    shudder = math.sin(TAU * 11 * t) * (1 - C.smoothstep(0.2, 0.5, t))
    sag = C.smoothstep(0.3, 1.2, t)
    return params(swell=[1 + 0.15 * sag] * 4, flat=1 - 0.35 * sag,
                  bend=[D(3) * shudder, D(-4) * sag, D(8) * sag, D(14) * sag], side=[D(4) * shudder, D(-3) * shudder, D(6) * sag, D(-8) * sag],
                  stalk=[D(70) * sag, D(55) * sag], spread=[D(35) * sag, D(50) * sag],
                  legs=[D(30) * sag, D(-25) * sag, D(25) * sag, D(-30) * sag])


def mouth_at(rig, action, frame):
    rig.animation_data.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame)
    head = rig.pose.bones["head"]
    delta = head.matrix @ rig.data.bones["head"].matrix_local.inverted()
    return rig.matrix_world @ delta @ (MOUTH + V((0, -0.05, 0)))


def animate(rig, obj):
    rig.animation_data_create()
    K.ground_clip(rig, obj, "SlugCrawl", solver(rig, crawl), CRAWL_FRAMES, cyclic=True, extras={"speed": CRAWL_SPEED})
    a = K.ground_clip(rig, obj, "SlugSpit", solver(rig, spit), SPIT_FRAMES,
                      extras={"attack_style": "spit", "hit_frame": SPIT_HIT, "hit_time": SPIT_HIT / FPS})
    a.pose_markers.new("Spit").frame = SPIT_HIT
    K.ground_clip(rig, obj, "SlugDeath", solver(rig, death), DEATH_FRAMES,
                  extras={"hold_last_frame": True, "hold_from": 1.4}, settle_from=round(1.2 * FPS))
    K.register(rig, CLIPS)
    m = mouth_at(rig, "SlugSpit", SPIT_HIT)
    a["muzzle"] = [round(m.x, 3), round(m.z, 3), round(-m.y, 3)]
    return list(a["muzzle"])


# --- previews ----------------------------------------------------------------
def preview(scene, rig, path):
    shots = [("SlugCrawl", 0, (1.8, -2.4, 1.3)), ("SlugCrawl", 12, (-2.6, -0.6, 1.0)),
             ("SlugSpit", 14, (2.2, -1.5, 1.0)), ("SlugSpit", SPIT_HIT, (2.6, -0.4, 0.8)),
             ("SlugDeath", 24, (1.9, -2.1, 1.3)), ("SlugDeath", DEATH_FRAMES, (1.8, -1.8, 1.8))]
    K.contact_sheet(scene, rig, shots, path, (0, -0.05, 0.38), size=360, cols=3)
    return [path]


def main(export_path=None, blend_path=None, preview_path=None):
    scene, rig, obj = build()
    prop = build_prop(bpy.data.collections[COLLECTION])
    K.decimate(obj)
    muzzle = animate(rig, obj)
    report = K.validate(rig, obj, CLIPS, held=("SlugDeath",))
    report["muzzle"] = muzzle
    K.setup_stage(scene, "Slug", STAGE, (0, -0.05, 0.38), 1.6, camera=(1.8, -2.4, 1.3))
    rig.animation_data.action = bpy.data.actions[CLIPS[0]]
    scene.frame_start, scene.frame_end = 0, CRAWL_FRAMES - 1
    scene.frame_set(0)
    prop.hide_render = True
    if export_path:
        K.export_gltf(rig, obj, export_path, extra=(prop,))
    if blend_path:
        K.save_blend(scene, blend_path, (COLLECTION, STAGE), CLIPS, "Slug", NAME, (0, -0.05, 0.38), 1.8)
    if preview_path:
        report["previews"] = [str(p) for p in preview(scene, rig, preview_path)]
    print("Slug:", report)
    return rig, obj, report


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = Path(__file__).resolve().parent
    main(export_path=args[0] if args else str(root.parent / "assets" / "slug.glb"),
         blend_path=args[1] if len(args) > 1 else str(root / "slug.blend"),
         preview_path=args[2] if len(args) > 2 else None)
