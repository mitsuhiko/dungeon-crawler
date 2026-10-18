"""
Game-ready version of the clay figure: skinned mesh + skeleton + animations.

Animations (all in place, the game moves the character; one-shots start and
end in the neutral standing pose so they can be cross-faded from anything):
    Walk         -- loop, 28 frames @ 30 fps, ground speed WALK_SPEED (extras: speed)
    Run          -- loop, 20 frames @ 30 fps, ground speed RUN_SPEED (extras: speed)
    Swim         -- loop, doggy paddle at SWIM_SPEED (extras: speed, water_level)
    SwimIdle     -- loop, treading water (extras: water_level)
    Climb        -- loop, alternating ladder grips / steps (extras: distance, speed)
    Jump         -- crouch, push-off, ballistic flight, landing, recovery; the
                    game slices it by frame number (see JUMP_V0), keep timing
    JumpLandSit  -- jump, lose balance, land on the bottom, bounce, stay sitting
    GetUpBack    -- lying on the back -> knees to the chest, rock onto the feet, stand (extras: move_time)
    GetUpFront   -- lying face down -> push up, knees under, sit back on the feet, stand (extras: move_time)
    Kick         -- right front kick
    Punch        -- right straight punch from a guard
    Slash        -- right-handed overhead diagonal slash (extras: weapon_socket)
    Throw        -- a flask lobbed overhand from the right fist (extras: weapon_socket,
                    active_start: it lets go, muzzle: where)
    Roll         -- forward roll; game moves ~`distance` forward (extras: distance)
    Flex         -- static strongman pose (the original sculpt)
    Hold<Name>   -- still poses of one arm carrying a weapon (HOLDS: Bow, Crossbow, Staff, Throw; extras:
                    weapon) or a held item (CARRIES: Towel, Orb, Hammer, Pliers, Rope, Feed);
                    extras: hold, arm_bones

Sockets: hand.L / hand.R are non-deforming bones at the fists for weapons.

How the motion is made:
  * hips and feet are keyed procedurally; legs are solved with analytic
    two-bone IK so planted feet move backwards at exactly the ground speed
    (no foot sliding when the game moves the root at that speed)
  * the jumps use a real ballistic arc (g = 9.81) whose take-off speed comes
    from the push-off; landing on the bottom bounces with restitution 0.3
  * ground contact is enforced on the deformed mesh: one-shots are lifted
    wherever they would sink into the floor, the roll keeps its lowest point
    on the floor; arm and head springs collide with the floor
  * spine, head, upper arms and forearms are damped spring pendulums
    under gravity, driven by the motion of the bone they hang from.  They are
    simulated in sub-steps and baked to keyframes.  Looping clips are
    simulated for several cycles and the settled last cycle is kept, so they
    loop seamlessly.

Units are metres, the figure is ~2 m tall, +Z up, the character faces -Y,
+X is the character's left (".L").

Headless regeneration (also saves the editable, unarmed rig):
    Blender -b --python blender/character.py -- assets/character.glb blender/character.blend

Usage inside Blender (e.g. via MCP):
    import sys; sys.path.insert(0, "<repo>/blender")
    import importlib, figure, character
    importlib.reload(figure); importlib.reload(character)
    character.main(export_path="<repo>/assets/character.glb")
"""
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

import figure

FPS = 30
G = 9.81
GRAVITY = Vector((0.0, 0.0, -G))

CHAR_NAME = "Character"
RIG_NAME = "CharacterRig"

# The game mesh is sampled directly at a coarse voxel size: that gives evenly
# sized quads everywhere.  (Decimating a finer mesh produces long slivers
# along the straight limbs that span the joints and fold into fins.)
GAME_VOXEL = 0.028
GAME_ARM_FILLET = 0.02      # small, so no web forms in the armpit of the rest pose
WEIGHT_SMOOTH_ITERS = 30    # surface diffusion of skin weights (see compute_weights)

# --- skeleton ---------------------------------------------------------------
HIP_Z = 0.70
KNEE_Z = 0.37
THIGH_LEN = HIP_Z - KNEE_Z
SHIN_LEN = KNEE_Z           # shin ends at the sole (z = 0)
LEG_LEN = THIGH_LEN + SHIN_LEN
SPINE_Z = (0.98, 1.40)
HEAD_BONE_Z = (1.44, 1.96)
SOLE_R = figure.LIMB_R - figure.SOLE_ROUND   # radius of the flat sole disc

WALK_FRAMES, WALK_SPEED = 28, 0.95
RUN_FRAMES, RUN_SPEED = 20, 2.4
CLIMB_FRAMES = 36
GAME_SCALE = 0.55                  # rig units -> game units (CHAR_SCALE)
CLIMB_DISTANCE = 2 * 0.28 / GAME_SCALE   # two game ladder rungs, in rig units


# ============================================================================
# small math helpers
# ============================================================================
def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def np_smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def rot_x(a):
    return Matrix.Rotation(a, 3, "X")


def rot_y(a):
    return Matrix.Rotation(a, 3, "Y")


def rot_z(a):
    return Matrix.Rotation(a, 3, "Z")


def hermite(y0, y1, m0, m1, u):
    u2, u3 = u * u, u * u * u
    return ((2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * m0
            + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * m1)


def keyframes(*pts):
    """Piecewise smoothstep interpolation through (time, value) points."""
    def f(t):
        if t <= pts[0][0]:
            return pts[0][1]
        for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
            if t <= t1:
                return lerp(v0, v1, smoothstep(t0, t1, t))
        return pts[-1][1]
    return f


# ============================================================================
# mesh + skeleton + weights
# ============================================================================
def build_mesh(scene):
    return figure.build(scene, pose="apose", voxel=GAME_VOXEL, name=CHAR_NAME,
                        arm_fillet=GAME_ARM_FILLET)


def build_rig(scene):
    old = bpy.data.objects.get(RIG_NAME)
    if old is not None:
        data = old.data
        bpy.data.objects.remove(old)
        bpy.data.armatures.remove(data)

    arm = bpy.data.armatures.new(RIG_NAME)
    rig = bpy.data.objects.new(RIG_NAME, arm)
    scene.collection.objects.link(rig)
    rig.show_in_front = True
    arm.display_type = "STICK"

    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    fwd = Vector((0, -1, 0))

    def bone(name, head, tail, parent=None, connect=False, roll_to=fwd):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.align_roll(roll_to)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    bone("root", (0, 0, 0), (0, 0.3, 0), roll_to=Vector((0, 0, 1)))
    bone("hips", (0, 0, HIP_Z), (0, 0, SPINE_Z[0]), "root")
    bone("spine", (0, 0, SPINE_Z[0]), (0, 0, SPINE_Z[1]), "hips", True)
    bone("head", (0, 0, HEAD_BONE_Z[0]), (0, 0, HEAD_BONE_Z[1]), "spine")
    for side, path in zip(("R", "L"), figure.arm_paths("apose")):
        _, sh, el, fist = path
        s = 1 if side == "L" else -1
        bone(f"upper_arm.{side}", sh, el, "spine")
        bone(f"forearm.{side}", el, fist, f"upper_arm.{side}", True)
        # weapon / prop socket at the fist, not deforming
        d = (Vector(fist) - Vector(el)).normalized()
        hb = bone(f"hand.{side}", fist, Vector(fist) + d * 0.12, f"forearm.{side}", True)
        hb.use_deform = False
        bone(f"thigh.{side}", (s * figure.LEG_X, 0, HIP_Z), (s * figure.LEG_X, 0, KNEE_Z), "hips")
        bone(f"shin.{side}", (s * figure.LEG_X, 0, KNEE_Z), (s * figure.LEG_X, 0, 0.0), f"thigh.{side}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def _polyline_closest(P, pts):
    """Distance to a polyline and arc-length parameter of the closest point."""
    best_d = np.full(len(P), np.inf, dtype=np.float32)
    best_s = np.zeros(len(P), dtype=np.float32)
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        a, b = np.asarray(a, np.float32), np.asarray(b, np.float32)
        ba = b - a
        L = float(np.linalg.norm(ba))
        h = np.clip(((P - a) @ ba) / (L * L), 0.0, 1.0)
        d = np.linalg.norm(P - a - h[:, None] * ba, axis=1)
        m = d < best_d
        best_d[m] = d[m]
        best_s[m] = acc + h[m] * L
        acc += L
    return best_d, best_s


def compute_weights(ob):
    """Skin weights straight from the shape description.

    Every vertex gets a soft membership to the body parts it is closest to
    (torso, head, each limb), and within a part weights blend smoothly across
    the joints along the limb axis.
    """
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    P = co.reshape(-1, 3)
    n = len(P)
    z = P[:, 2]

    parts = []  # (signed distance, {bone: weight array})

    # torso: hips below, spine above
    d = figure._sd_round_box(P, figure.TORSO_CENTER, figure.TORSO_HALF, figure.TORSO_ROUND)
    ws = np_smoothstep(0.86, 1.10, z)
    parts.append((d, {"hips": 1 - ws, "spine": ws}))

    # head, blending into the spine at the neck
    d = figure._sd_sphere(P, (0, 0, figure.HEAD_Z), figure.HEAD_R)
    wh = np_smoothstep(1.38, 1.52, z)
    parts.append((d, {"spine": 1 - wh, "head": wh}))

    b = 0.07
    for side, path in zip(("R", "L"), figure.arm_paths("apose")):
        root, sh, el, fist = (Vector(p) for p in path)
        d, s = _polyline_closest(P, [root, sh, el, fist])
        s_sh = (sh - root).length
        s_el = s_sh + figure.UPPER_ARM_LEN
        w_parent = 1 - np_smoothstep(s_sh - b, s_sh + b, s)
        w_fore = np_smoothstep(s_el - b, s_el + b, s)
        w_upper = np.clip(1 - w_parent - w_fore, 0, 1)
        parts.append((d - figure.LIMB_R,
                      {"spine": w_parent, f"upper_arm.{side}": w_upper, f"forearm.{side}": w_fore}))

    for side, s_x in (("R", -figure.LEG_X), ("L", figure.LEG_X)):
        top = 0.85
        d, s = _polyline_closest(P, [(s_x, 0, top), (s_x, 0, -0.2)])
        s_hip, s_knee = top - HIP_Z, top - KNEE_Z
        w_parent = 1 - np_smoothstep(s_hip - 0.08, s_hip + 0.08, s)
        w_shin = np_smoothstep(s_knee - b, s_knee + b, s)
        w_thigh = np.clip(1 - w_parent - w_shin, 0, 1)
        parts.append((d - figure.LIMB_R,
                      {"hips": w_parent, f"thigh.{side}": w_thigh, f"shin.{side}": w_shin}))

    # membership: the closest part wins, with only a narrow blend so that
    # e.g. the surface of the upper arm never sticks to the torso (that
    # smears the arm and makes it look thicker when it swings).  Joint
    # blending is done along the limb axis above.
    D = np.stack([p[0] for p in parts], axis=1)
    tau = 0.006
    M = np.exp(-(D - D.min(axis=1, keepdims=True)) / tau)
    M /= M.sum(axis=1, keepdims=True)

    bones = [b.name for b in ob.parent.data.bones if b.use_deform and b.name != "root"]
    W = np.zeros((n, len(bones)), np.float32)
    for k, (_, wd) in enumerate(parts):
        for bname, w in wd.items():
            W[:, bones.index(bname)] += M[:, k] * w

    # Diffuse the weights over the surface.  Where two parts meet (armpit,
    # crotch, neck) the weights would otherwise jump between neighbouring
    # vertices, and all the stretching of a swinging limb lands on that one
    # row of edges -> fins.  Surface diffusion turns the seam into a gradient
    # a few edges wide, while the middle of a limb stays on its own bones.
    E = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", E)
    E = E.reshape(-1, 2)
    deg = np.bincount(E.ravel(), minlength=n).astype(np.float32)[:, None]
    for _ in range(WEIGHT_SMOOTH_ITERS):
        acc = np.zeros_like(W)
        np.add.at(acc, E[:, 0], W[E[:, 1]])
        np.add.at(acc, E[:, 1], W[E[:, 0]])
        W += 0.5 * (acc / np.maximum(deg, 1) - W)

    # max 4 influences, normalised
    order = np.argsort(-W, axis=1)
    W[np.arange(n)[:, None], order[:, 4:]] = 0.0
    W /= W.sum(axis=1, keepdims=True)

    ob.vertex_groups.clear()
    groups = [ob.vertex_groups.new(name=bn) for bn in bones]
    for j, vg in enumerate(groups):
        col = W[:, j]
        idx = np.nonzero(col > 1e-4)[0]
        for i in idx:
            vg.add([int(i)], float(col[i]), "REPLACE")


# ============================================================================
# pose evaluation (pure math, no depsgraph)
# ============================================================================
class Skeleton:
    def __init__(self, rig):
        bones = rig.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.parent = {b.name: b.parent.name if b.parent else None for b in bones}
        self.rest_rel = {}
        for name, p in self.parent.items():
            self.rest_rel[name] = self.rest[p].inverted() @ self.rest[name] if p else self.rest[name].copy()
        self.rest_rot = {k: v.to_3x3() for k, v in self.rest.items()}

    def base(self, name, poses):
        """Armature-space matrix of the bone with an identity local transform."""
        p = self.parent[name]
        return poses[p] @ self.rest_rel[name] if p else self.rest_rel[name].copy()

    def frame_rot(self, name, poses):
        """Rotation taking rest-pose directions to the bone's current frame."""
        return poses[name].to_3x3() @ self.rest_rot[name].inverted()

    def set(self, name, poses, desired):
        poses[name] = desired
        return self.base(name, poses).inverted() @ desired

    def aim(self, name, poses, direction, twist=0.0):
        """Point the bone along `direction` (armature space), with an optional
        twist about its own axis, using the smallest swing from its base."""
        base = self.base(name, poses)
        tb = base @ Matrix.Rotation(twist, 4, "Y") if twist else base
        y = tb.col[1].xyz.normalized()
        swing = y.rotation_difference(direction.normalized()).to_matrix()
        desired = Matrix.Translation(base.translation) @ (swing @ tb.to_3x3()).to_4x4()
        poses[name] = desired
        return base.inverted() @ desired


def two_bone_ik(hip, target, a, b, pole):
    d_vec = target - hip
    d = min(d_vec.length, (a + b) * 0.9995)
    n = d_vec.normalized()
    cos_a = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
    sin_a = math.sqrt(1 - cos_a * cos_a)
    perp = pole - n * pole.dot(n)
    perp.normalize()
    knee = hip + n * (a * cos_a) + perp * (a * sin_a)
    foot = hip + n * d
    return knee, foot


# ============================================================================
# springs (the physics)
# ============================================================================
def _floor_clamp(d, pivot, reach, radius):
    """Keep the sphere of `radius` at `pivot + d * reach` above z = 0."""
    zmin = (radius - pivot.z) / reach
    if d.z >= zmin or zmin >= 1.0:
        return d
    if zmin <= -1.0:
        return d
    h = Vector((d.x, d.y, 0.0))
    if h.length < 1e-6:
        h = Vector((0.0, -1.0, 0.0))
    h.normalize()
    return h * math.sqrt(1.0 - zmin * zmin) + Vector((0.0, 0.0, zmin))


def simulate(pivots, targets, length, k, zeta, gravity=1.0, substeps=12, collide=None,
             drag=0.0, flow=None):
    """Point mass on a rigid rod hanging from a moving pivot.

    The mass is pulled towards `pivot + length * target_dir` by a damped
    spring (muscle tone) and by gravity, and keeps its momentum when the
    pivot accelerates.  `collide=(reach, radius)` keeps the end of the limb
    above the floor (inelastic contact).  `gravity` scales g (buoyancy in
    water), `drag` pulls the mass towards the velocity of the surrounding
    `flow` (water streaming past an in-place swimmer).  Returns the direction
    per frame.
    """
    h = 1.0 / (FPS * substeps)
    c = 2 * zeta * math.sqrt(k)
    g = GRAVITY * gravity
    flow = flow or Vector()
    p = pivots[0] + targets[0] * length
    v = Vector()
    prev_tp = p.copy()
    out = [targets[0].copy()]
    for f in range(len(pivots) - 1):
        for i in range(1, substeps + 1):
            t = i / substeps
            pv = pivots[f].lerp(pivots[f + 1], t)
            td = targets[f].lerp(targets[f + 1], t).normalized()
            tp = pv + td * length
            tv = (tp - prev_tp) / h
            prev_tp = tp
            a = g + (tp - p) * k - (v - tv) * c - (v - flow) * drag
            p_old = p.copy()
            v = v + a * h
            p = p + v * h
            d = (p - pv).normalized()
            if collide:
                d = _floor_clamp(d, pv, *collide)
            p = pv + d * length
            v = (p - p_old) / h
        out.append((p - pivots[f + 1]).normalized())
    return out


SPRINGS = {
    # name: (length to centre of mass, stiffness, damping ratio)
    "spine": (0.42, 700.0, 0.45),
    "head": (0.45, 380.0, 0.30),
}


# ============================================================================
# motion description -> baked poses
# ============================================================================
def arm_dir(swing, abduct, side_sign):
    """Hanging-arm direction in rest axes: swing > 0 is forward."""
    return rot_x(-swing) @ rot_y(-side_sign * abduct) @ Vector((0, 0, -1))


def arm_target(spec, side_sign):
    """Arm spec -> (upper arm direction in chest rest axes, elbow bend).

    spec is either (swing, abduct, bend) or (dx, dy, dz, bend) with an
    explicit direction in the chest frame (x = character's left, -y = forward),
    or an IK spec (see IK): its first four are such a direction and bend.
    """
    if len(spec) >= 4:
        return Vector(spec[:3]).normalized(), spec[3]
    return arm_dir(spec[0], spec[1], side_sign), spec[2]


def IK(hand, pole, w=1.0, fk=None, side_sign=1):
    """Arm spec reaching the fist (the hand socket) for `hand` (armature space), the elbow
    bending towards `pole` (chest axes).  w blends from the plain spec `fk` (neutral by
    default) to the reach, so a key can fade an arm in and out of a grip.  The springs
    still carry the arm, so it lags a little behind fast reaches."""
    fk = Vector(fk) if fk is not None else A(0.0, D(6), D(15), side_sign)
    return Vector((*fk[:4], *hand, *pole, w))


def reach(spec):
    """(hand, pole, weight) of an IK spec, or None."""
    if len(spec) == 11 and spec[10] > 1e-4:
        return Vector(spec[4:7]), Vector(spec[7:10]), min(1.0, spec[10])
    return None


def ik_keys(*keys):
    """keyframes() over arm specs that mix plain and IK keys: plain keys take the reach of
    their nearest IK key with weight 0, so the hand target never sweeps through the body
    while an arm fades into or out of a reach."""
    reaches = [(t, s) for t, s in keys if len(s) == 11]
    out = []
    for t, s in keys:
        if len(s) != 11:
            near = min(reaches, key=lambda r: abs(r[0] - t))[1]
            s = Vector((*s[:4], *near[4:10], 0.0))
        out.append((t, s))
    return keyframes(*out)


def A(swing, abduct, bend, side_sign):
    """Arm spec as an explicit 4-vector (so different kinds of keys blend)."""
    d = arm_dir(swing, abduct, side_sign)
    return Vector((d.x, d.y, d.z, bend))


def _per_side(v):
    return v if isinstance(v, dict) else {"L": v, "R": v}


def solve_motion(skel, params, n_frames, arm_k, arm_zeta, fore_k, fore_zeta, env=None, springs=None):
    """params(frame) -> dict describing the authored motion.

    arm_k / arm_zeta / fore_k / fore_zeta are floats or {"L": .., "R": ..}.
    env: {"gravity", "drag", "flow", "floor"} for all springs (e.g. water).
    springs: overrides for SPRINGS ("spine" / "head").
    Returns a list of {bone: basis matrix} per frame.
    """
    env = dict({"gravity": 1.0, "drag": 0.0, "flow": None, "floor": True}, **(env or {}))
    springs = dict(SPRINGS, **(springs or {}))
    arm_k, arm_zeta = _per_side(arm_k), _per_side(arm_zeta)
    fore_k, fore_zeta = _per_side(fore_k), _per_side(fore_zeta)
    P = [params(f) for f in range(n_frames)]
    poses = [dict() for _ in range(n_frames)]
    bases = [dict() for _ in range(n_frames)]
    sides = (("L", 1), ("R", -1))

    # level 0: root, hips, legs (kinematic + IK)
    for f, prm in enumerate(P):
        ps, bs = poses[f], bases[f]
        bs["root"] = skel.set("root", ps, skel.base("root", ps))
        pitch, roll, yaw = prm["hips_rot"]
        R = rot_z(yaw) @ rot_x(pitch) @ rot_y(roll)
        desired = Matrix.Translation(prm["hips_pos"]) @ (R @ skel.rest_rot["hips"]).to_4x4()
        bs["hips"] = skel.set("hips", ps, desired)
        hips_R = skel.frame_rot("hips", ps)
        pole = hips_R @ Vector((0, -1, 0.0))
        wl = prm.get("feet_local_w", 0.0)
        for side, _ in sides:
            hip = skel.base(f"thigh.{side}", ps).translation
            tgt = prm["feet"][side].copy()
            if wl > 0:  # feet given relative to the hips (tucks, legs in the air)
                local = prm["hips_pos"] + hips_R @ prm["feet_local"][side]
                tgt = tgt.lerp(local, wl)
            ground = tgt.z
            knee, foot = two_bone_ik(hip, tgt, THIGH_LEN, SHIN_LEN, pole)
            for _ in range(3 if ground < 0.06 and wl < 0.5 else 0):
                # lift the target so the tilted flat sole doesn't dig in
                shin = (foot - knee).normalized()
                tilt = math.acos(max(-1.0, min(1.0, -shin.z)))
                tgt = Vector((tgt.x, tgt.y, ground + SOLE_R * math.sin(tilt)))
                knee, foot = two_bone_ik(hip, tgt, THIGH_LEN, SHIN_LEN, pole)
            bs[f"thigh.{side}"] = skel.aim(f"thigh.{side}", ps, knee - hip)
            bs[f"shin.{side}"] = skel.aim(f"shin.{side}", ps, foot - knee)

    def run_spring(name, pivot_fn, target_fn, length, k, zeta, twist_fn=None, collide=None):
        pivots = [pivot_fn(f) for f in range(n_frames)]
        targets = [target_fn(f) for f in range(n_frames)]
        dirs = simulate(pivots, targets, length, k, zeta, gravity=env["gravity"],
                        collide=collide if env["floor"] else None, drag=env["drag"], flow=env["flow"])
        for f in range(n_frames):
            tw = twist_fn(f) if twist_fn else 0.0
            bases[f][name] = skel.aim(name, poses[f], dirs[f], tw)

    # level 1: spine
    L, k, z = springs["spine"]
    run_spring(
        "spine",
        lambda f: skel.base("spine", poses[f]).translation,
        lambda f: skel.frame_rot("hips", poses[f]) @ rot_x(P[f]["spine_lean"]) @ Vector((0, 0, 1)),
        L, k, z,
        twist_fn=lambda f: P[f]["spine_twist"],
    )

    # level 2: head and upper arms
    L, k, z = springs["head"]
    run_spring(
        "head",
        lambda f: skel.base("head", poses[f]).translation,
        lambda f: skel.frame_rot("spine", poses[f]) @ rot_x(P[f]["head_pitch"]) @ Vector((0, 0, 1)),
        L, k, z,
        twist_fn=lambda f: P[f]["head_twist"],
        collide=(figure.HEAD_Z - HEAD_BONE_Z[0], figure.HEAD_R),
    )
    def upper_target(f, side, s):
        spec = P[f]["arms"][side]
        chest = skel.frame_rot("spine", poses[f])
        d = chest @ arm_target(spec, s)[0]
        r = reach(spec)
        if r:   # aim the upper arm where a two-bone reach puts the elbow
            hand, pole, w = r
            shoulder = skel.base(f"upper_arm.{side}", poses[f]).translation
            elbow, _ = two_bone_ik(shoulder, hand, figure.UPPER_ARM_LEN, figure.FOREARM_LEN, chest @ pole)
            d = d.lerp((elbow - shoulder).normalized(), w).normalized()
        return d

    for side, s in sides:
        run_spring(
            f"upper_arm.{side}",
            lambda f, side=side: skel.base(f"upper_arm.{side}", poses[f]).translation,
            lambda f, side=side, s=s: upper_target(f, side, s),
            figure.UPPER_ARM_LEN * 0.6, arm_k[side], arm_zeta[side],
            collide=(figure.UPPER_ARM_LEN, figure.LIMB_R),
        )

    # level 3: forearms bend forward about the chest's side axis (or point at their reach
    # from wherever the elbow got to); "fore_twist" rolls them about their own axis
    for side, s in sides:
        def fore_target(f, side=side, s=s):
            spec = P[f]["arms"][side]
            chest = skel.frame_rot("spine", poses[f])
            upper = poses[f][f"upper_arm.{side}"].col[1].xyz.normalized()
            axis = chest @ Vector((1, 0, 0))
            d = Quaternion(axis, -arm_target(spec, s)[1]) @ upper
            r = reach(spec)
            if r:
                hand, _, w = r
                elbow = skel.base(f"forearm.{side}", poses[f]).translation
                d = d.lerp((hand - elbow).normalized(), w).normalized()
            return d
        run_spring(
            f"forearm.{side}",
            lambda f, side=side: skel.base(f"forearm.{side}", poses[f]).translation,
            fore_target,
            figure.FOREARM_LEN * 0.6, fore_k[side], fore_zeta[side],
            twist_fn=lambda f, side=side: P[f].get("fore_twist", {}).get(side, 0.0),
            collide=(figure.FOREARM_LEN, figure.LIMB_R),
        )
    return bases


# ============================================================================
# the clips
# ============================================================================
def foot_track(ph, duty, stride, lift, speed, period, skew=1.0):
    """Foot position (y, z) relative to the hips for a leg at phase ph.

    Stance: the foot moves backwards (+Y) at exactly `speed`.
    Swing: Hermite curve that leaves and lands with the stance velocity.
    """
    if ph < duty:
        return -stride / 2 + stride * (ph / duty), 0.0
    u = (ph - duty) / (1 - duty)
    m = speed * (1 - duty) * period  # stance velocity in swing-parameter units
    y = hermite(stride / 2, -stride / 2, m, m, u)
    z = lift * math.sin(math.pi * u ** skew)
    return y, z


def walk_params(n):
    T = n / FPS
    duty = 0.60
    stride = WALK_SPEED * duty * T
    reach = LEG_LEN * 0.975

    # hip height from the stance legs (inverted pendulum), smoothed
    samples = 240
    hz = np.zeros(samples)
    for i in range(samples):
        ph = i / samples
        hs = []
        for off in (0.0, 0.5):
            p = (ph + off) % 1
            if p < duty:
                y, _ = foot_track(p, duty, stride, 0.0, WALK_SPEED, T)
                hs.append(math.sqrt(reach * reach - y * y))
        hz[i] = min(hs)
    k = np.exp(-0.5 * (np.arange(-30, 31) / 9.0) ** 2)
    k /= k.sum()
    hz = np.array([np.dot(k, np.take(hz, range(i - 30, i + 31), mode="wrap")) for i in range(samples)])

    def params(f):
        ph = (f / n) % 1
        w = 2 * math.pi * ph
        feet = {}
        for side, s, off in (("L", 1, 0.0), ("R", -1, 0.5)):
            y, z = foot_track((ph + off) % 1, duty, stride, 0.075, WALK_SPEED, T, skew=0.85)
            feet[side] = Vector((s * figure.LEG_X, y, z))
        hip_z = float(np.interp(ph * samples, np.arange(samples + 1), np.append(hz, hz[0])))
        arm = math.radians(15) * math.cos(w)
        bend = math.radians(18)
        return {
            "hips_pos": Vector((0.035 * math.sin(w - 0.3), 0.0, hip_z)),
            "hips_rot": (math.radians(3), -math.radians(3) * math.sin(w - 0.3), -math.radians(5) * math.cos(w)),
            "spine_lean": math.radians(2),
            "spine_twist": math.radians(9) * math.cos(w),
            "head_pitch": -math.radians(4),
            "head_twist": -math.radians(4) * math.cos(w),
            "feet": feet,
            "arms": {"R": (arm, math.radians(6), bend), "L": (-arm, math.radians(6), bend)},
        }
    return params


def run_params(n):
    T = n / FPS
    duty = 0.36
    stride = RUN_SPEED * duty * T
    ts = duty * T                      # stance time
    tf = T / 2 - ts                    # flight time per step
    v_up = G * tf / 2                  # vertical take-off speed
    comp = v_up * ts / math.pi         # stance compression (spring-mass)
    z_td = math.sqrt((LEG_LEN * 0.985) ** 2 - (stride / 2) ** 2)

    def hip_height(ph):
        step = (ph * 2) % 1
        t = step * T / 2
        if t < ts:
            return z_td - comp * math.sin(math.pi * t / ts)
        t -= ts
        return z_td + v_up * t - 0.5 * G * t * t

    def params(f):
        ph = (f / n) % 1
        w = 2 * math.pi * ph
        feet = {}
        for side, s, off in (("L", 1, 0.0), ("R", -1, 0.5)):
            y, z = foot_track((ph + off) % 1, duty, stride, 0.24, RUN_SPEED, T, skew=0.7)
            feet[side] = Vector((s * figure.LEG_X, y, z))
        arm = math.radians(28) * math.cos(w - 0.25)
        return {
            "hips_pos": Vector((0.02 * math.sin(w - 0.3), 0.0, hip_height(ph))),
            "hips_rot": (math.radians(9), -math.radians(4) * math.sin(w - 0.3), -math.radians(10) * math.cos(w)),
            "spine_lean": math.radians(5),
            "spine_twist": math.radians(14) * math.cos(w),
            "head_pitch": -math.radians(11),
            "head_twist": -math.radians(7) * math.cos(w),
            "feet": feet,
            "arms": {"R": (math.radians(4) + arm, math.radians(10), math.radians(85)),
                     "L": (math.radians(4) - arm, math.radians(10), math.radians(85))},
        }
    return params


# The game (src/render/character.js) cuts the Jump clip into pieces by
# frame number: idle 0-2, push-off 15-27, apex 26-31, landing 37-58.  Keep this
# timeline (take-off at frame 18, touchdown at frame 37, 59 frames) stable.
JUMP_V0 = 2 * (HIP_Z + 0.005 - 0.47) / 0.15     # take-off speed, fixes the air time


def jump_params():
    """Returns (params, n_frames, pre_roll_frames).

    A compact, athletic jump: moderate squat with the arms swinging back,
    arms drive forward-up (not overhead) at take-off, body stays fairly
    upright and the eyes level, light tuck in the air, soft landing.
    """
    stand = STAND_Z
    t_c0, t_c1, t_to = 0.15, 0.45, 0.60
    z_crouch, z_to = 0.54, HIP_Z + 0.005
    v0 = JUMP_V0
    push_exp = v0 * (t_to - t_c1) / (z_to - z_crouch)   # push curve ends at exactly v0
    t_air = 2 * v0 / G
    t_land = t_to + t_air
    omega = 11.0                                         # landing absorption (stiff legs)
    t_end = t_land + 0.70
    n = int(round(t_end * FPS)) + 1
    pre = int(0.6 * FPS)

    def hip_z(t):
        if t < t_c0:
            return stand
        if t < t_c1:
            return lerp(stand, z_crouch, smoothstep(t_c0, t_c1, t))
        if t < t_to:
            u = (t - t_c1) / (t_to - t_c1)
            return z_crouch + (z_to - z_crouch) * u ** push_exp
        if t < t_land:
            ta = t - t_to
            return z_to + v0 * ta - 0.5 * G * ta * ta
        tl = t - t_land
        a = z_to - stand
        b = -v0 + omega * a
        return stand + (a + b * tl) * math.exp(-omega * tl)

    swing = keyframes((t_c0, 0.0), (t_c1, D(-35)), (t_to, D(80)), (t_to + 0.25, D(55)),
                      (t_land - 0.05, D(30)), (t_land + 0.20, D(8)), (t_end, 0.0))
    abduct = keyframes((t_c0, D(6)), (t_to, D(12)), (t_to + 0.30, D(28)), (t_land, D(20)), (t_end, D(6)))
    elbow = keyframes((t_c0, D(15)), (t_c1, D(20)), (t_to, D(25)), (t_land - 0.1, D(30)),
                      (t_land + 0.15, D(30)), (t_end, D(15)))
    hips_y = keyframes((t_c0, 0.0), (t_c1, 0.03), (t_to, 0.0))
    air_pitch = keyframes((t_c0, 0.0), (t_c1, D(12)), (t_to, D(-3)), (t_land, D(3)))
    air_lean = keyframes((t_c0, 0.0), (t_c1, D(6)), (t_to, D(-3)), (t_land, D(2)))

    def params(f):
        t = (f - pre) / FPS
        z = hip_z(t)
        if t < t_land:
            pitch, spine = air_pitch(t), air_lean(t)
        else:
            squash = max(0.0, (stand - z) / 0.10)
            fade = smoothstep(0.0, 0.10, t - t_land)
            pitch = lerp(D(3), D(14) * squash, fade)
            spine = lerp(D(2), D(6) * squash, fade)
        feet = {}
        for side, s in (("L", 1), ("R", -1)):
            if t_to < t < t_land:
                u = (t - t_to) / t_air
                tuck = 0.12 * math.sin(math.pi * u) ** 0.8
                fz = max(0.0, z - (LEG_LEN - 0.005) + tuck)
                fy = -0.04 * math.sin(math.pi * u)
            else:
                fz = max(0.0, z - (LEG_LEN - 0.005))
                fy = 0.0
            feet[side] = Vector((s * figure.LEG_X, fy, fz))
        arm = lambda s: (swing(t), abduct(t), elbow(t))
        return {
            "hips_pos": Vector((0.0, hips_y(t) if t < t_to else 0.0, z)),
            "hips_rot": (pitch, 0.0, 0.0),
            "spine_lean": spine,
            "spine_twist": 0.0,
            "head_pitch": -(pitch + spine) * 0.9,
            "head_twist": 0.0,
            "feet": feet,
            "arms": {"L": arm(1), "R": arm(-1)},
        }
    return params, n, pre


# ----------------------------------------------------------------------------
# swimming.  The game swims chest deep: the feet are 0.5 game units below the
# surface, i.e. WATER_Z in rig units at CHAR_SCALE 0.55.  In water most of
# gravity is cancelled by buoyancy and the limbs feel strong drag relative to
# the water, which streams backwards past the in-place swimmer.
# ----------------------------------------------------------------------------
WATER_Z = 0.91
SWIM_FRAMES, SWIM_SPEED = 24, 1.6
SWIM_IDLE_FRAMES = 36


def water_env(speed):
    return {"gravity": 0.1, "drag": 5.0, "flow": Vector((0, speed, 0)), "floor": False}


def swim_params(n):
    """Doggy paddle: body inclined forward, head up, hands paddle alternately
    in circles at the surface in front of the chest, legs pedal underneath."""
    pitch, lean = math.radians(42), math.radians(8)

    def params(f):
        w = 2 * math.pi * ((f / n) % 1)
        arms, legs = {}, {}
        for side, s, off in (("L", 1, 0.0), ("R", -1, math.pi)):
            a = w + off
            # reach forward with a long arm over the surface, pull down and back with a bent
            # elbow.  Swing is relative to the chest, which leans forward by pitch + lean, so
            # world angle from straight down = swing - (pitch + lean): ~55..100 degrees.
            arms[side] = (pitch + lean + D(78) + D(24) * math.cos(a), D(24) + D(6) * math.sin(a),
                          D(40) - D(25) * math.cos(a))
            b = w + off + 1.2
            legs[side] = Vector((s * figure.LEG_X, 0.12 + 0.12 * math.sin(b), -0.52 + 0.08 * math.cos(b)))
        return pose_params(
            hips_pos=Vector((0, 0.10, 0.65 + 0.02 * math.cos(2 * w))),
            hips_rot=(pitch, D(4) * math.sin(w), D(5) * math.cos(w)),
            spine_lean=lean, spine_twist=-D(8) * math.cos(w),
            head_pitch=-(pitch + lean) * 0.85, head_twist=D(4) * math.cos(w),
            feet_local=legs, feet_local_w=1.0, arms=arms,
        )
    return params


def swim_idle_params(n):
    """Treading water: upright, hands sculling in and out at the surface,
    legs eggbeater underneath, a slow bob."""
    def params(f):
        w = 2 * math.pi * ((f / n) % 1)
        arms, legs = {}, {}
        for side, s, off in (("L", 1, 0.0), ("R", -1, math.pi)):
            a = 2 * w   # two sculls per cycle, both hands together
            arms[side] = (D(32), D(42) + D(18) * math.sin(a), D(45) + D(10) * math.cos(a))
            b = w + off
            legs[side] = Vector((s * (0.20 + 0.05 * math.cos(b)), -0.05 + 0.10 * math.sin(b), -0.50))
        return pose_params(
            hips_pos=Vector((0, 0, 0.62 + 0.025 * math.sin(2 * w))),
            hips_rot=(D(8), 0.0, D(3) * math.sin(w)),
            spine_lean=D(3), head_pitch=-D(8),
            feet_local=legs, feet_local_w=1.0, arms=arms,
        )
    return params


# ----------------------------------------------------------------------------
# one-shot actions.  All start and end in the neutral standing pose so the
# game can cross-fade into and out of them from anything.
# ----------------------------------------------------------------------------
D = math.radians
STAND_Z = HIP_Z - 0.01
PRE_ROLL = int(0.5 * FPS)       # frames of neutral pose to settle the springs


def neutral_arms():
    return {"L": A(0.0, D(6), D(15), 1), "R": A(0.0, D(6), D(15), -1)}


def neutral_feet():
    return {"L": Vector((figure.LEG_X, 0, 0)), "R": Vector((-figure.LEG_X, 0, 0))}


def pose_params(**kw):
    p = {
        "hips_pos": Vector((0, 0, STAND_Z)), "hips_rot": (0.0, 0.0, 0.0),
        "spine_lean": 0.0, "spine_twist": 0.0, "head_pitch": 0.0, "head_twist": 0.0,
        "feet": neutral_feet(), "arms": neutral_arms(),
    }
    p.update(kw)
    return p


def one_shot(duration, fn):
    """fn(t) -> params.  Returns (params(frame), n_frames, pre_roll)."""
    n = int(round(duration * FPS)) + 1
    return (lambda f: fn(max(0.0, (f - PRE_ROLL) / FPS))), n, PRE_ROLL


def kick_params():
    """Front kick with the right leg: chamber, snap out, re-chamber, step down."""
    X = figure.LEG_X
    na = neutral_arms()
    foot = keyframes((0.10, Vector((-X, 0, 0))), (0.28, Vector((-0.14, -0.30, 0.40))),
                     (0.38, Vector((-0.12, -0.68, 0.64))), (0.50, Vector((-0.12, -0.66, 0.62))),
                     (0.62, Vector((-0.14, -0.28, 0.36))), (0.82, Vector((-X, 0, 0))))
    hips_x = keyframes((0.05, 0.0), (0.22, 0.07), (0.66, 0.07), (0.85, 0.0))
    hips_z = keyframes((0.05, STAND_Z), (0.22, STAND_Z - 0.03), (0.66, STAND_Z - 0.03), (0.85, STAND_Z))
    pitch = keyframes((0.22, 0.0), (0.38, D(-20)), (0.50, D(-17)), (0.70, 0.0))
    yaw = keyframes((0.22, 0.0), (0.38, D(12)), (0.55, D(10)), (0.75, 0.0))
    lean = keyframes((0.22, 0.0), (0.38, D(-6)), (0.55, D(-5)), (0.75, 0.0))
    arm_l = keyframes((0.08, na["L"]), (0.30, A(D(35), D(40), D(50), 1)),
                      (0.55, A(D(30), D(40), D(50), 1)), (0.85, na["L"]))
    arm_r = keyframes((0.08, na["R"]), (0.30, A(D(-30), D(35), D(30), -1)),
                      (0.55, A(D(-25), D(35), D(30), -1)), (0.85, na["R"]))

    def fn(t):
        return pose_params(
            hips_pos=Vector((hips_x(t), 0, hips_z(t))),
            hips_rot=(pitch(t), 0.0, yaw(t)),
            spine_lean=lean(t),
            head_pitch=-(pitch(t) + lean(t)) * 0.8,
            head_twist=-yaw(t) * 0.6,
            feet={"L": Vector((X, 0, 0)), "R": foot(t)},
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(0.95, fn)


def punch_params():
    """Right straight punch: raise guard, twist and extend, retract, relax."""
    na = neutral_arms()
    guard_l = Vector((0.25, -0.45, -0.85, D(125)))
    guard_r = Vector((-0.25, -0.45, -0.85, D(125)))
    turn = D(28) + D(12)                       # spine twist + hips yaw at impact
    hit = rot_z(-turn) @ Vector((0, -1, 0.10))  # straight ahead in world space
    hit_r = Vector((hit.x, hit.y, hit.z, D(4)))
    pull_l = Vector((0.30, -0.30, -0.90, D(130)))
    tg, ts0, ts1, tr, tg2, te = 0.18, 0.28, 0.36, 0.46, 0.60, 0.85
    arm_r = keyframes((0.04, na["R"]), (tg, guard_r), (ts0, guard_r), (ts1, hit_r), (tr, hit_r),
                      (tg2, guard_r), (te, na["R"]))
    arm_l = keyframes((0.04, na["L"]), (tg, guard_l), (ts0, guard_l), (ts1, pull_l), (tr, pull_l),
                      (tg2, guard_l), (te, na["L"]))
    twist = keyframes((ts0, 0.0), (ts1, D(28)), (tr, D(26)), (tg2, 0.0))
    yaw = keyframes((ts0, 0.0), (ts1, D(12)), (tr, D(11)), (tg2, 0.0))
    lean = keyframes((0.04, 0.0), (tg, D(4)), (ts0, D(4)), (ts1, D(9)), (tr, D(8)), (tg2, D(4)), (te, 0.0))
    hz = keyframes((0.04, STAND_Z), (tg, STAND_Z - 0.04), (tg2, STAND_Z - 0.04), (te, STAND_Z))

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))),
            hips_rot=(0.0, 0.0, yaw(t)),
            spine_lean=lean(t), spine_twist=twist(t),
            head_pitch=-lean(t) * 0.8, head_twist=-(twist(t) + yaw(t)) * 0.8,
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(0.95, fn)


def slash_params():
    """Right-handed diagonal overhead slash (weapon goes on the hand.R socket)."""
    na = neutral_arms()
    wind = Vector((-0.45, 0.35, 0.82, D(75)))   # cocked up and back over the right shoulder
    over = Vector((-0.20, -0.45, 0.87, D(40)))  # passing overhead
    s = rot_z(-D(47)) @ Vector((0.35, -0.65, -0.68))
    strike = Vector((s.x, s.y, s.z, D(10)))      # down, forward, across to the left
    s = rot_z(-D(50)) @ Vector((0.45, -0.40, -0.80))
    follow = Vector((s.x, s.y, s.z, D(15)))
    tw, to, ts, tf, te = 0.32, 0.41, 0.48, 0.60, 1.00
    arm_r = keyframes((0.05, na["R"]), (tw, wind), (to, over), (ts, strike), (tf, follow), (te, na["R"]))
    arm_l = keyframes((0.05, na["L"]), (tw, A(D(30), D(25), D(45), 1)), (ts, A(D(-25), D(30), D(30), 1)),
                      (tf, A(D(-20), D(30), D(30), 1)), (te, na["L"]))
    twist = keyframes((0.05, 0.0), (tw, D(-30)), (to, D(-5)), (ts, D(35)), (tf, D(38)), (te, 0.0))
    yaw = keyframes((0.05, 0.0), (tw, D(-10)), (ts, D(12)), (tf, D(12)), (te, 0.0))
    lean = keyframes((0.05, 0.0), (tw, D(-6)), (ts, D(15)), (tf, D(16)), (te, 0.0))
    pitch = keyframes((0.05, 0.0), (ts, D(6)), (tf, D(6)), (te, 0.0))
    hz = keyframes((0.05, STAND_Z), (tw, STAND_Z - 0.01), (ts, STAND_Z - 0.07), (tf, STAND_Z - 0.07), (te, STAND_Z))

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))),
            hips_rot=(pitch(t), 0.0, yaw(t)),
            spine_lean=lean(t), spine_twist=twist(t),
            head_pitch=-(pitch(t) + lean(t)) * 0.7, head_twist=-(twist(t) + yaw(t)) * 0.5,
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(1.05, fn)


# ----------------------------------------------------------------------------
# ranged weapons and staffs.  How a weapon sits in the fist is items.MOUNTS; the
# game plays these clips like Slash, retimed to the weapon's attack speed
# (core/combat.js).  Each starts and ends in its weapon's hold pose (HOLDS: the
# right arm only; the game lays it over idle / walk / run, render/animator.js),
# so cross-fades in and out of them do not pop.
# ----------------------------------------------------------------------------
HOLDS = {   # kind: (side, arm spec, forearm twist)
    # forearm level in front of the hip: the bow stands upright at the left, the crossbow points
    # ahead, the staff stands upright
    "bow": ("L", A(D(8), D(16), D(78), 1), D(62)),
    "crossbow": ("R", A(D(14), D(16), D(74), -1), 0.0),
    "staff": ("R", A(D(8), D(18), D(80), -1), 0.0),
    # a throwing flask held up by the neck like the staff (items.flask_mount)
    "throw": ("R", A(D(8), D(18), D(80), -1), 0.0),
}
# How a hand carries the held items of blender/items.py (WEARS there): a still clip Hold<Name>
# per item, one arm each, laid over the other clips like the weapons' holds (render/figure.js).
CARRIES = {   # name: (side, arm spec, forearm twist)
    # the towel over the left forearm, held level in front like a waiter's
    "towel": ("L", A(D(10), D(10), D(88), 1), 0.0),
    # the right hand raised before the chest, the crystal ball floating over the fist
    "orb": ("R", A(D(14), D(12), D(94), -1), 0.0),
    # a smith's tools held ready: the hammer up in the right fist, the pliers in the left
    "hammer": ("R", A(D(6), D(12), D(62), -1), 0.0),
    "pliers": ("L", A(D(6), D(12), D(58), 1), 0.0),
    # a coil of rope hanging from the right fist, a little away from the leg
    "rope": ("R", A(D(4), D(22), D(30), -1), 0.0),
    # a feed bag held out in front from the left fist
    "feed": ("L", A(D(14), D(10), D(66), 1), 0.0),
}
# frames the game needs: when the shot leaves, and when a chained shot or a reload is done
SHOOT_FRAMES = {"duration": 32, "active_start": 18, "active_end": 20, "redraw": 7}
CROSSBOW_FRAMES = {"duration": 36, "active_start": 9, "active_end": 11, "reloaded": 26}
CAST_FRAMES = {"duration": 28, "active_start": 12, "active_end": 14}
THROW_FRAMES = {"duration": 26, "active_start": 12, "active_end": 14}


def hold_params(kind):
    """The resting grip on a weapon or a held item, as a still clip (Hold<Kind>)."""
    arms = neutral_arms()
    side, spec, twist = HOLDS.get(kind) or CARRIES[kind]
    arms[side] = spec
    return one_shot(2 / FPS, lambda t: pose_params(arms=arms, fore_twist={side: twist}))


def shoot_params():
    """Bow (in the left fist): turn side-on, raise the bow, draw the string to the cheek,
    loose, follow through, lower.  The arrow leaves at active_start; a chained shot starts
    at `redraw`, with the bow already up."""
    F = {k: v / FPS for k, v in SHOOT_FRAMES.items()}
    na = neutral_arms()
    _, hold, hold_twist = HOLDS["bow"]
    tr, td, tl, tf, th, te = F["redraw"], 0.47, F["active_start"], 0.70, 0.80, F["duration"]
    bow = Vector((0.03, -0.95, 1.38))           # the bow fist, held out at shoulder height
    bow_pole = Vector((1, 0.3, 0.1))            # elbow out to the side: the forearm level
    arm_l = ik_keys((0.02, hold), (tr, IK(bow, bow_pole, 1, hold)),
                    (th, IK(bow, bow_pole, 1, hold)), (te, hold))
    pull = Vector((-1, 0.4, 0.6))               # the drawing elbow: out, back and up
    string = Vector((-0.12, -0.40, 1.40))       # reaching for the string
    cheek = Vector((-0.21, -0.08, 1.45))        # full draw
    loose = Vector((-0.27, -0.02, 1.47))        # the fingers fly back past the ear
    arm_r = ik_keys((0.02, na["R"]), (tr, IK(string, pull, 1, side_sign=-1)),
                    (td, IK(cheek, pull, 1, side_sign=-1)), (tl, IK(cheek, pull, 1, side_sign=-1)),
                    (tf, IK(loose, pull, 1, side_sign=-1)), (th, IK(loose, pull, 0.85, side_sign=-1)),
                    (te, na["R"]))
    yaw = keyframes((0.02, 0.0), (tr, D(-25)), (th, D(-25)), (te, 0.0))
    twist = keyframes((0.02, 0.0), (tr, D(-24)), (td, D(-30)), (tl, D(-30)), (tf, D(-33)), (th, D(-30)), (te, 0.0))
    lean = keyframes((0.02, 0.0), (tr, D(3)), (tl, D(3)), (tf, D(-2)), (th, D(1)), (te, 0.0))
    hz = keyframes((0.02, STAND_Z), (tr, STAND_Z - 0.035), (th, STAND_Z - 0.035), (te, STAND_Z))
    roll = keyframes((0.02, hold_twist), (tr, 0.0), (th, 0.0), (te, hold_twist))

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))), hips_rot=(0.0, 0.0, yaw(t)),
            spine_lean=lean(t), spine_twist=twist(t),
            head_pitch=-lean(t) * 0.7, head_twist=-(twist(t) + yaw(t)) * 0.85,
            arms={"L": arm_l(t), "R": arm_r(t)}, fore_twist={"L": roll(t)},
        )
    return one_shot(te, fn)


def crossbow_params():
    """Crossbow (in the right fist): raise it to the chest, shoot, kick up, lower it to the
    belly where the left hand draws the string and lays a bolt (`reloaded`), back to the hold."""
    F = {k: v / FPS for k, v in CROSSBOW_FRAMES.items()}
    na = neutral_arms()
    hold = HOLDS["crossbow"][1]   # (no twist)
    ta, tk, tk2, tlow, tg, tp, tb, tr2, te = (0.21, F["active_start"] + 0.05, 0.42, 0.56, 0.64, 0.76,
                                              F["reloaded"], 1.0, F["duration"])
    aim = Vector((-0.40, -0.48, 1.16))
    kick = Vector((-0.40, -0.40, 1.27))
    belly = Vector((-0.20, -0.40, 0.98))
    out = Vector((-1, 0.3, -0.5))
    arm_r = ik_keys((0.02, hold), (ta, IK(aim, out, 1, hold)), (F["active_start"], IK(aim, out, 1, hold)),
                    (tk, IK(kick, out, 1, hold)), (tk2, IK(aim, out, 1, hold)),
                    (tlow, IK(belly, out, 1, hold)), (tb + 0.04, IK(belly, out, 1, hold)), (tr2, hold), (te, hold))
    grab = Vector((-0.05, -0.47, 1.0))          # the string, at the front of the stock
    drawn = Vector((0.0, -0.36, 1.08))          # drawn back to the nut
    bolt = Vector((-0.06, -0.44, 1.06))         # a bolt laid in the groove
    low = Vector((1, 0, -1))
    brace = A(D(22), D(8), D(45), 1)
    arm_l = ik_keys((0.02, na["L"]), (ta, brace), (tk2, brace), (tg, IK(grab, low, 1, brace)),
                    (tp, IK(drawn, low, 1, brace)), (tb, IK(bolt, low, 1, brace)), (tr2, na["L"]), (te, na["L"]))
    lean = keyframes((0.02, 0.0), (ta, D(5)), (F["active_start"], D(5)), (tk, D(-3)), (tk2, D(3)),
                     (tlow, D(12)), (tb, D(12)), (tr2, D(2)), (te, 0.0))
    twist = keyframes((0.02, 0.0), (ta, D(8)), (tk2, D(8)), (tlow, D(18)), (tb, D(16)), (tr2, D(3)), (te, 0.0))
    hz = keyframes((0.02, STAND_Z), (ta, STAND_Z - 0.04), (tk, STAND_Z - 0.03), (tlow, STAND_Z - 0.06),
                   (tb, STAND_Z - 0.06), (tr2, STAND_Z - 0.01), (te, STAND_Z))

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))), hips_rot=(0.0, 0.0, 0.0),
            spine_lean=lean(t), spine_twist=twist(t),
            head_pitch=-lean(t) * 0.6, head_twist=-twist(t) * 0.7,
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(te, fn)


def cast_params():
    """Staff (in the right fist): lift it up beside the shoulder, then thrust it forward so its
    head points at the target as the spell leaves (active_start), the left palm pushing
    along, and settle back to the hold."""
    F = {k: v / FPS for k, v in CAST_FRAMES.items()}
    na = neutral_arms()
    hold = HOLDS["staff"][1]   # (no twist)
    tw, tc, th, te = 0.25, F["active_start"], 0.56, F["duration"]
    lift = Vector((-0.50, -0.16, 1.22))
    thrust = Vector((-0.34, -0.56, 1.20))
    arm_r = ik_keys((0.02, hold), (tw, IK(lift, Vector((-1, 0.5, -0.4)), 1, hold)),
                    (tc, IK(thrust, Vector((-0.3, 0.2, 1)), 1, hold)), (th, IK(thrust, Vector((-0.3, 0.2, 1)), 1, hold)),
                    (te, hold))
    palm = Vector((0.16, -0.58, 1.24))
    arm_l = ik_keys((0.02, na["L"]), (tw, A(D(40), D(22), D(70), 1)), (tc, IK(palm, Vector((1, 0, -0.5)), 1)),
                    (th, IK(palm, Vector((1, 0, -0.5)), 1)), (te, na["L"]))
    lean = keyframes((0.02, 0.0), (tw, D(-5)), (tc, D(10)), (th, D(9)), (te, 0.0))
    twist = keyframes((0.02, 0.0), (tw, D(-14)), (tc, D(14)), (th, D(12)), (te, 0.0))
    hz = keyframes((0.02, STAND_Z), (tw, STAND_Z - 0.01), (tc, STAND_Z - 0.06), (th, STAND_Z - 0.05), (te, STAND_Z))
    roll = keyframes((0.02, 0.0), (tw, D(30)), (tc, D(90)), (th, D(90)), (te, 0.0))   # the head swings forward

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))), hips_rot=(0.0, 0.0, twist(t) * 0.3),
            spine_lean=lean(t), spine_twist=twist(t) * 0.7,
            head_pitch=-lean(t) * 0.7, head_twist=-twist(t) * 0.8,
            arms={"L": arm_l(t), "R": arm_r(t)}, fore_twist={"R": roll(t)},
        )
    return one_shot(te, fn)


def throw_params():
    """A flask (in the right fist) lobbed overhand: drawn back past the ear while the left hand
    points ahead, whipped forward and up so it leaves the hand in front of the face
    (active_start), the arm following through across the body, then back to the hold."""
    F = {k: v / FPS for k, v in THROW_FRAMES.items()}
    na = neutral_arms()
    hold = HOLDS["throw"][1]
    tw, tc, tf, te = 0.25, F["active_start"], 0.58, F["duration"]
    back = Vector((-0.32, 0.14, 1.6))           # cocked behind the right ear
    let_go = Vector((-0.2, -0.47, 1.6))         # out in front, above the eyes
    after = Vector((-0.04, -0.42, 1.08))        # swung down across the body
    arm_r = ik_keys((0.02, hold), (tw, IK(back, Vector((-1, -0.2, 0.35)), 1, hold)),
                    (tw + 0.04, IK(back, Vector((-1, -0.2, 0.35)), 1, hold)),
                    (tc, IK(let_go, Vector((-1, 0.25, -0.45)), 1, hold)),
                    (tf, IK(after, Vector((-0.6, 0.25, -1)), 1, hold)), (te, hold))
    arm_l = keyframes((0.02, na["L"]), (tw, A(D(62), D(18), D(25), 1)), (tc, A(D(25), D(28), D(45), 1)),
                      (tf, A(D(-8), D(24), D(35), 1)), (te, na["L"]))
    twist = keyframes((0.02, 0.0), (tw, D(-30)), (tw + 0.04, D(-30)), (tc, D(14)), (tf, D(22)), (te, 0.0))
    lean = keyframes((0.02, 0.0), (tw, D(-7)), (tc, D(9)), (tf, D(13)), (te, 0.0))
    hz = keyframes((0.02, STAND_Z), (tw, STAND_Z - 0.02), (tc, STAND_Z - 0.05), (tf, STAND_Z - 0.06), (te, STAND_Z))

    def fn(t):
        return pose_params(
            hips_pos=Vector((0, 0, hz(t))), hips_rot=(0.0, 0.0, twist(t) * 0.35),
            spine_lean=lean(t), spine_twist=twist(t) * 0.65,
            head_pitch=-lean(t) * 0.7, head_twist=-twist(t) * 0.9,
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(te, fn)


ROLL_RADIUS = 0.40   # the tucked body rolls like a ball of this radius


def roll_params():
    """Forward roll, in place: squat, tuck, roll 360 degrees over the back,
    come up into a squat and stand.  The game moves the character forward
    by about ROLL_RADIUS * 2 pi during the roll (stored as `distance`)."""
    t0, t1, t2, t3 = 0.22, 0.32, 0.80, 1.18
    centre = Vector((0, -0.30, ROLL_RADIUS))
    com = Vector((0, -0.25, 0.30))              # tucked centre of mass, hips frame
    theta = keyframes((0.02, 0.0), (t0, D(35)), (t2, D(395)), (t3, D(360)))

    def rolled(th):
        return centre - rot_x(th) @ com

    squat = rolled(D(35))
    stand = Vector((0, 0, STAND_Z))
    tuck_w = keyframes((t0, 0.0), (t1, 1.0), (t2 - 0.08, 1.0), (t2 + 0.02, 0.0))
    lean = keyframes((0.02, 0.0), (t0, D(30)), (t1, D(50)), (t2 - 0.05, D(50)), (t2 + 0.06, D(30)), (t3, 0.0))
    nod = keyframes((0.02, 0.0), (t0, D(30)), (t1, D(55)), (t2 - 0.05, D(55)), (t2 + 0.06, D(20)), (t3, 0.0))
    na = neutral_arms()

    def arms(s, side):
        hug = Vector((s * 0.15, -0.55, -0.82, D(95)))
        return keyframes((0.02, na[side]), (t0, A(D(55), D(12), D(20), s)), (t1, hug), (t2 - 0.05, hug),
                         (t2 + 0.10, A(D(45), D(12), D(25), s)), (t3 + 0.05, na[side]))
    arm_l, arm_r = arms(1, "L"), arms(-1, "R")

    def fn(t):
        th = theta(t)
        if t < t0:
            pos = stand.lerp(squat, smoothstep(0.02, t0, t))
        elif t < t2:
            pos = rolled(th)
        else:
            pos = rolled(th).lerp(stand, smoothstep(t2, t3, t))
        tuck = {side: Vector((s * figure.LEG_X, -0.18, -0.22)) for side, s in (("L", 1), ("R", -1))}
        return pose_params(
            hips_pos=pos, hips_rot=(th, 0.0, 0.0),
            spine_lean=lean(t), head_pitch=nod(t),
            feet_local=tuck, feet_local_w=tuck_w(t),
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(1.35, fn)


def jump_land_sit_params():
    """Jump, lose balance in the air, land on the bottom, bounce, stay sitting."""
    t_c0, t_c1, t_to = 0.15, 0.45, 0.60
    z_crouch, z_to = 0.47, HIP_Z + 0.005
    v0 = 2 * (z_to - z_crouch) / (t_to - t_c1)
    z_sit = 0.11
    t_air = (v0 + math.sqrt(v0 * v0 + 2 * G * (z_to - z_sit))) / G
    t_imp = t_to + t_air
    v_imp = G * t_air - v0                      # downward speed at impact
    restitution = 0.3
    t_end = t_imp + 1.2

    def hip_z(t):
        if t < t_c0:
            return STAND_Z
        if t < t_c1:
            return lerp(STAND_Z, z_crouch, smoothstep(t_c0, t_c1, t))
        if t < t_to:
            u = (t - t_c1) / (t_to - t_c1)
            return z_crouch + (z_to - z_crouch) * u * u
        if t < t_imp:
            ta = t - t_to
            return z_to + v0 * ta - 0.5 * G * ta * ta
        tb, v = t_imp, v_imp * restitution     # bouncing on the bottom
        while v > 0.2:
            dur = 2 * v / G
            if t < tb + dur:
                tt = t - tb
                return z_sit + v * tt - 0.5 * G * tt * tt
            tb += dur
            v *= restitution
        return z_sit

    pitch = keyframes((t_c0, 0.0), (t_c1, D(22)), (t_to, D(-5)), (t_to + 0.35 * t_air, D(-45)),
                      (t_imp, D(-30)), (t_imp + 0.3, D(-16)), (t_end, D(-18)))
    lean = keyframes((t_c0, 0.0), (t_c1, D(12)), (t_to, D(-5)), (t_to + 0.5 * t_air, D(5)),
                     (t_imp, D(18)), (t_imp + 0.3, D(10)), (t_end, D(12)))
    legs_w = keyframes((t_to, 0.0), (t_to + 0.15, 1.0), (t_imp - 0.05, 1.0), (t_imp + 0.05, 0.0))
    na = neutral_arms()

    def arms(s, side):
        behind = Vector((s * 0.25, 0.55, -0.80, D(10)))
        return keyframes((t_c0, na[side]), (t_c1, A(D(-60), D(8), D(28), s)), (t_to, A(D(150), D(20), D(10), s)),
                         (t_to + 0.45 * t_air, A(D(110), D(40), D(35), s)), (t_imp - 0.05, behind),
                         (t_imp + 0.3, Vector((s * 0.30, 0.50, -0.81, D(15)))), (t_end, Vector((s * 0.30, 0.50, -0.81, D(15)))))
    arm_l, arm_r = arms(1, "L"), arms(-1, "R")

    def fn(t):
        z = hip_z(t)
        p = pitch(t)
        wobble = D(8) * math.exp(-5 * (t - t_imp)) * math.sin(14 * (t - t_imp)) if t > t_imp else 0.0
        if t < t_to:
            feet = {side: Vector((s * figure.LEG_X, 0, max(0.0, z - (LEG_LEN - 0.005))))
                    for side, s in (("L", 1), ("R", -1))}
        else:
            feet = {side: Vector((s * 0.18, -0.60, 0)) for side, s in (("L", 1), ("R", -1))}
        legs = {side: Vector((s * figure.LEG_X, -0.45, -0.45)) for side, s in (("L", 1), ("R", -1))}
        return pose_params(
            hips_pos=Vector((0, 0.06 * smoothstep(t_c0, t_c1, t) * (1 - smoothstep(t_c1, t_to, t)), z)),
            hips_rot=(p + wobble, 0.0, 0.0),
            spine_lean=lean(t),
            head_pitch=-(p + lean(t)) * 0.6,
            feet=feet, feet_local=legs, feet_local_w=legs_w(t),
            arms={"L": arm_l(t), "R": arm_r(t)},
        )
    return one_shot(t_end, fn)


# Getting up after a ragdoll.  Both clips start lying flat (the game blends the
# ragdoll pose into frame 0, lining the clip up with the body) and end in the
# neutral standing pose with the feet at the origin, so the game puts the player
# where the feet will be.  Feet never slide: they are either planted where they
# end up or moved through the air.  `move_time`: nearly upright; from here the
# game may cut the rest short for walking.
GETUP_LIE_Z = 0.13           # hip joint height lying flat (the mesh lift settles it)
GETUP_SQUAT = Vector((0, 0.10, 0.36))
GETUP_BACK_T = (0.28, 0.48, 0.74, 0.68)    # knees to the chest, rocked onto the feet, standing, move
GETUP_FRONT_T = (0.24, 0.48, 0.70, 0.96, 0.90)   # pushed up, kneeling, sat back on the feet, standing, move


def _getup_feet(points):
    """Feet keyed in armature space: [(t, Vector)] per side, mirrored in x."""
    tracks = {side: keyframes(*[(t, Vector((s * abs(p.x), p.y, p.z))) for t, p in points])
              for side, s in (("L", 1), ("R", -1))}
    return lambda t: {side: f(t) for side, f in tracks.items()}


def get_up_back_params():
    """On the back: pull the knees to the chest and rock forward, landing the
    feet under the hips in a squat, and stand."""
    X, y0 = figure.LEG_X, 0.36
    t_tuck, t_rock, t_stand, _ = GETUP_BACK_T
    t_land = t_rock - 0.06
    hips = keyframes((0.06, Vector((0, y0, GETUP_LIE_Z))), (t_tuck, Vector((0, y0 + 0.02, 0.15))),
                     (t_rock, GETUP_SQUAT), (t_stand, Vector((0, 0, STAND_Z))))
    pitch = keyframes((0.06, D(-88)), (t_tuck, D(-70)), (t_rock, D(28)), (t_stand, 0.0))
    lean = keyframes((0.06, 0.0), (t_tuck, D(35)), (t_rock, D(6)), (t_stand, 0.0))
    nod = keyframes((0.06, 0.0), (t_tuck, D(35)), (t_rock, D(-10)), (t_stand, 0.0))
    # lying feet -> lifted with the knees at the chest -> set down under the body
    feet = _getup_feet([(0.06, Vector((X + 0.03, y0 - 0.66, 0.11))), (t_tuck, Vector((X + 0.02, y0 - 0.32, 0.30))),
                        (t_land, Vector((X, 0.0, 0.0))), (t_stand, Vector((X, 0, 0)))])
    na = neutral_arms()

    def arms(s, side):
        return keyframes((0.06, na[side]), (t_tuck, A(D(45), D(20), D(70), s)),   # hugging the knees
                         (t_rock, A(D(75), D(14), D(30), s)), (t_stand + 0.08, na[side]))
    arm_l, arm_r = arms(1, "L"), arms(-1, "R")

    def fn(t):
        return pose_params(hips_pos=hips(t), hips_rot=(pitch(t), 0.0, 0.0), spine_lean=lean(t),
                           head_pitch=nod(t), feet=feet(t), arms={"L": arm_l(t), "R": arm_r(t)})
    return one_shot(t_stand + 0.10, fn)


def get_up_front_params():
    """Face down: push up on the hands, draw the knees under the hips, sit back
    onto the planted feet into a squat and stand."""
    X, y0 = figure.LEG_X, -0.64
    t_push, t_knees, t_sit, t_stand, _ = GETUP_FRONT_T
    hips = keyframes((0.06, Vector((0, y0, GETUP_LIE_Z + 0.02))), (t_push, Vector((0, y0 + 0.02, 0.20))),
                     (t_knees, Vector((0, -0.34, 0.44))), (t_sit, GETUP_SQUAT),
                     (t_stand, Vector((0, 0, STAND_Z))))
    pitch = keyframes((0.06, D(88)), (t_push, D(82)), (t_knees, D(65)), (t_sit, D(42)), (t_stand, 0.0))
    lean = keyframes((0.06, 0.0), (t_push, D(-35)), (t_knees, D(-5)), (t_sit, D(12)), (t_stand, 0.0))
    look = keyframes((0.06, 0.0), (t_push, D(-35)), (t_knees, D(-25)), (t_sit, D(-20)), (t_stand, 0.0))
    # the toes stay where they lie; the hips come back over them
    feet = _getup_feet([(0.06, Vector((X + 0.02, 0.0, 0.11))), (t_knees, Vector((X + 0.02, 0.0, 0.10))),
                        (t_sit, Vector((X, 0.0, 0.0))), (t_stand, Vector((X, 0, 0)))])
    na = neutral_arms()

    def arms(s, side):
        tucked = A(D(70), D(35), D(110), s)    # hands beside the shoulders
        press = A(D(85), D(18), D(10), s)      # straight arms, palms on the floor
        return keyframes((0.06, na[side]), (0.14, tucked), (t_push, press), (t_knees, press),
                         (t_sit, A(D(50), D(12), D(30), s)), (t_stand + 0.08, na[side]))
    arm_l, arm_r = arms(1, "L"), arms(-1, "R")

    def fn(t):
        return pose_params(hips_pos=hips(t), hips_rot=(pitch(t), 0.0, 0.0), spine_lean=lean(t),
                           head_pitch=look(t), feet=feet(t), arms={"L": arm_l(t), "R": arm_r(t)})
    return one_shot(t_stand + 0.10, fn)


def flex_pose(skel):
    ps = {}
    bs = {}
    bs["root"] = skel.set("root", ps, skel.base("root", ps))
    desired = Matrix.Translation((0, 0, HIP_Z - 0.01)) @ skel.rest_rot["hips"].to_4x4()
    bs["hips"] = skel.set("hips", ps, desired)
    for side, s in (("L", 1), ("R", -1)):
        hip = skel.base(f"thigh.{side}", ps).translation
        knee, foot = two_bone_ik(hip, Vector((s * figure.LEG_X, 0, 0)), THIGH_LEN, SHIN_LEN, Vector((0, -1, 0)))
        bs[f"thigh.{side}"] = skel.aim(f"thigh.{side}", ps, knee - hip)
        bs[f"shin.{side}"] = skel.aim(f"shin.{side}", ps, foot - knee)
    bs["spine"] = skel.aim("spine", ps, Vector((0, 0, 1)))
    bs["head"] = skel.aim("head", ps, Vector((0, 0, 1)))
    for side, s in (("L", 1), ("R", -1)):
        bs[f"upper_arm.{side}"] = skel.aim(f"upper_arm.{side}", ps, Vector((s, 0, 0.05)))
        bs[f"forearm.{side}"] = skel.aim(f"forearm.{side}", ps, Vector((-0.05 * s, 0, 1)))
    return bs


# ============================================================================
# baking to actions
# ============================================================================
def muzzle(rig, act, frame, bone, point):
    """`point` (in `bone`'s head frame) at `frame` of `act`, in game units: [x, up, forward]."""
    rig.animation_data.action = act
    bpy.context.scene.frame_set(frame)
    m = rig.matrix_world @ rig.pose.bones[bone].matrix @ point
    return [round(m.x * GAME_SCALE, 3), round(m.z * GAME_SCALE, 3), round(-m.y * GAME_SCALE, 3)]


def bake_action(rig, name, frames, cyclic, props=None, loc_bones=("hips",)):
    act = bpy.data.actions.get(name)
    if act is not None:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    prev = {}
    for f, bases in enumerate(frames):
        for bname, basis in bases.items():
            pb = rig.pose.bones[bname]
            loc, rot, _ = basis.decompose()
            if bname in prev and rot.dot(prev[bname]) < 0:
                rot.negate()
            prev[bname] = rot
            pb.rotation_quaternion = rot
            pb.keyframe_insert("rotation_quaternion", frame=f, group=bname)
            if bname in loc_bones:
                pb.location = loc
                pb.keyframe_insert("location", frame=f, group=bname)
    act.use_frame_range = True
    act.frame_start = 0
    act.frame_end = max(1, len(frames) - 1)
    act.use_cyclic = cyclic
    for k, v in (props or {}).items():
        act[k] = v
    return act


def mesh_min_z(rig, ob, act):
    """Lowest point of the deformed mesh for every frame of an action."""
    sc = bpy.context.scene
    rig.animation_data.action = act
    rig.update_tag(refresh={"OBJECT", "DATA", "TIME"})
    out = []
    for f in range(int(act.frame_end) + 1):
        sc.frame_set(f)
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
        out.append(float(co[2::3].min()))
    return np.array(out)


def _smooth(x, sigma):
    k = np.exp(-0.5 * (np.arange(-4, 5) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(x, 4, mode="edge"), k, mode="valid")


def make_climb_animation(rig):
    """In-place ladder cycle. Analytic IK keeps grips firm (no arm springs).

    Each hand / foot stays on a rung for half a cycle, travelling down at
    constant speed relative to the moving body; it then retracts and reaches
    the next rung. Opposite hand and foot recover together. The game advances
    or reverses the phase by vertical distance and freezes it while hanging.
    """
    skel = Skeleton(rig)
    frames = []
    for f in range(CLIMB_FRAMES + 1):
        phase = (f / CLIMB_FRAMES) % 1
        w = 2 * math.pi * phase
        ps, bs = {}, {}
        bs["root"] = skel.set("root", ps, skel.base("root", ps))
        hips = Matrix.Translation((0.018 * math.sin(w), 0, STAND_Z))
        bs["hips"] = skel.set("hips", ps, hips @ skel.rest_rot["hips"].to_4x4())
        bs["spine"] = skel.aim("spine", ps, Vector((0, -0.045, 1)), D(3) * math.sin(w))
        bs["head"] = skel.aim("head", ps, Vector((0, 0.10, 1)))

        def contact(ph, high, depth):
            if ph < 0.5:   # planted: exactly cancels the controller's ascent
                return depth, high - CLIMB_DISTANCE * ph
            u = (ph - 0.5) * 2
            z = high - CLIMB_DISTANCE * 0.5 * (1 - smoothstep(0, 1, u))
            return depth + 0.14 * math.sin(math.pi * u) ** 2, z

        for side, s, off in (("L", 1, 0.0), ("R", -1, 0.5)):
            ph = (phase + off) % 1
            y, z = contact(ph, 1.84, -0.34)   # fist surface clears the wall behind the rungs
            shoulder = skel.base(f"upper_arm.{side}", ps).translation
            elbow, hand = two_bone_ik(shoulder, Vector((s * 0.30, y, z)),
                                      figure.UPPER_ARM_LEN, figure.FOREARM_LEN,
                                      Vector((s, 0.25, -0.15)))
            bs[f"upper_arm.{side}"] = skel.aim(f"upper_arm.{side}", ps, elbow - shoulder)
            bs[f"forearm.{side}"] = skel.aim(f"forearm.{side}", ps, hand - elbow)
            y, z = contact((ph + 0.5) % 1, 0.61, -0.30)
            hip = skel.base(f"thigh.{side}", ps).translation
            knee, foot = two_bone_ik(hip, Vector((s * figure.LEG_X, y, z)),
                                     THIGH_LEN, SHIN_LEN, Vector((0, -1, 0)))
            bs[f"thigh.{side}"] = skel.aim(f"thigh.{side}", ps, knee - hip)
            bs[f"shin.{side}"] = skel.aim(f"shin.{side}", ps, foot - knee)
        frames.append(bs)
    return bake_action(rig, "Climb", frames, True,
                       {"distance": CLIMB_DISTANCE,
                        "speed": CLIMB_DISTANCE / (CLIMB_FRAMES / FPS),
                        "rung_spacing": 0.28 / 0.55})


def make_animations(rig, ob):
    skel = Skeleton(rig)
    cycles = 6

    n = WALK_FRAMES
    frames = solve_motion(skel, walk_params(n), n * cycles + 1, arm_k=55.0, arm_zeta=0.22,
                          fore_k=110.0, fore_zeta=0.28)
    bake_action(rig, "Walk", frames[n * (cycles - 1):], True, {"speed": WALK_SPEED})

    n = RUN_FRAMES
    frames = solve_motion(skel, run_params(n), n * cycles + 1, arm_k=320.0, arm_zeta=0.45,
                          fore_k=520.0, fore_zeta=0.5)
    bake_action(rig, "Run", frames[n * (cycles - 1):], True, {"speed": RUN_SPEED})

    params, n, pre = jump_params()
    frames = solve_motion(skel, params, n + pre, arm_k=320.0, arm_zeta=0.8,
                          fore_k=450.0, fore_zeta=0.7,
                          springs={"head": (0.45, 750.0, 0.5), "spine": (0.42, 1100.0, 0.55)})
    bake_action(rig, "Jump", frames[pre:], False)

    for name, n, fn, speed in (("Swim", SWIM_FRAMES, swim_params, SWIM_SPEED),
                               ("SwimIdle", SWIM_IDLE_FRAMES, swim_idle_params, 0.0)):
        frames = solve_motion(skel, fn(n), n * cycles + 1, arm_k=160.0, arm_zeta=0.4,
                              fore_k=220.0, fore_zeta=0.45, env=water_env(speed))
        bake_action(rig, name, frames[n * (cycles - 1):], True,
                    {"speed": speed, "water_level": WATER_Z})

    def one(name, built, arm_k, arm_zeta, fore_k, fore_zeta, props=None, contact="lift"):
        """Bake a one-shot.  Ground contact is enforced on the actual mesh:
        "lift" raises the body wherever it would sink into the floor,
        "always" keeps its lowest point exactly on the floor (rolling)."""
        params, n, pre = built
        offs = np.zeros(n + pre)

        def shifted(f):
            p = params(f)
            p["hips_pos"] = p["hips_pos"] + Vector((0, 0, offs[f]))
            return p

        for _ in range(4):
            frames = solve_motion(skel, shifted, n + pre, arm_k, arm_zeta, fore_k, fore_zeta)
            act = bake_action(rig, name, frames[pre:], False, props)
            m = mesh_min_z(rig, ob, act)
            c = -m if contact == "always" else np.maximum(0.0, -m)
            if np.abs(c).max() < 0.004:
                break
            offs[pre:] += _smooth(c, 1.2)

    one("Kick", kick_params(), 260.0, 0.45, 360.0, 0.5)
    one("Punch", punch_params(), {"L": 320.0, "R": 750.0}, {"L": 0.5, "R": 0.6},
        {"L": 420.0, "R": 950.0}, {"L": 0.5, "R": 0.65})
    one("Slash", slash_params(), {"L": 220.0, "R": 480.0}, {"L": 0.45, "R": 0.5},
        {"L": 300.0, "R": 650.0}, {"L": 0.45, "R": 0.55},
        {"weapon_socket": "hand.R", "contact_frame": 16, "hit_time": 16 / FPS,
         "active_start": 15 / FPS, "active_end": 21 / FPS})
    timing = lambda frames: {k: v / FPS for k, v in frames.items()}   # seconds
    stiff = ({"L": 420.0, "R": 520.0}, {"L": 0.6, "R": 0.6}, {"L": 560.0, "R": 700.0}, {"L": 0.6, "R": 0.62})
    one("Shoot", shoot_params(), *stiff, {"weapon_socket": "hand.L", **timing(SHOOT_FRAMES)})
    one("CrossbowShot", crossbow_params(), *stiff, {"weapon_socket": "hand.R", **timing(CROSSBOW_FRAMES)})
    one("Cast", cast_params(), *stiff, {"weapon_socket": "hand.R", **timing(CAST_FRAMES)})
    one("Throw", throw_params(), *stiff, {"weapon_socket": "hand.R", **timing(THROW_FRAMES)})
    # where each shot leaves at its active_start: the bow fist, the bolt's tip, the staff's head,
    # the thrown flask's belly
    import items
    for clip, frames, bone, kind, point in (
            ("Shoot", SHOOT_FRAMES, "hand.L", None, Vector()),
            ("CrossbowShot", CROSSBOW_FRAMES, "hand.R", "crossbow", Vector((0, items.STOCK_Y - .053, .46))),
            ("Cast", CAST_FRAMES, "hand.R", "staff", Vector(items.staff_head(1))),
            ("Throw", THROW_FRAMES, "hand.R", "throw", Vector((0, 0, .12)))):
        act = bpy.data.actions[clip]
        act["muzzle"] = muzzle(rig, act, frames["active_start"], bone,
                               items.mount_matrix(kind) @ point if kind else point)
    for kind, (side, *_) in HOLDS.items():
        one("Hold" + kind.capitalize(), hold_params(kind), *stiff,
            {"weapon": kind, "hold": kind, "arm_bones": f"upper_arm.{side},forearm.{side}"})
    for kind, (side, *_) in CARRIES.items():
        one("Hold" + kind.capitalize(), hold_params(kind), *stiff,
            {"hold": kind, "arm_bones": f"upper_arm.{side},forearm.{side}"})
    one("Roll", roll_params(), 900.0, 0.7, 1100.0, 0.7, {"distance": round(2 * math.pi * ROLL_RADIUS, 3)},
        contact="always")
    one("JumpLandSit", jump_land_sit_params(), 200.0, 0.35, 260.0, 0.4)
    one("GetUpBack", get_up_back_params(), 260.0, 0.5, 340.0, 0.55, {"move_time": GETUP_BACK_T[-1]})
    one("GetUpFront", get_up_front_params(), 260.0, 0.5, 340.0, 0.55, {"move_time": GETUP_FRONT_T[-1]})

    make_climb_animation(rig)
    bake_action(rig, "Flex", [flex_pose(skel)], False)


# ============================================================================
def main(scene=None, export_path=None, active_action="Walk"):
    scene = scene or bpy.context.scene
    scene.render.fps = FPS

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    # the static sculpt is replaced by the rigged character
    old = bpy.data.objects.get(figure.FIGURE_NAME)
    if old is not None:
        bpy.data.objects.remove(old)

    # Remove the legacy embedded weapon when regenerating an old character scene.
    old_weapon = bpy.data.objects.get("Sword")
    if old_weapon is not None and old_weapon.parent and old_weapon.parent.name == RIG_NAME:
        bpy.data.objects.remove(old_weapon, do_unlink=True)

    rig = build_rig(scene)
    ob = build_mesh(scene)
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    compute_weights(ob)
    figure.decimate(ob)
    from character_uv import unwrap_character
    unwrap_character(ob)

    make_animations(rig, ob)
    register_actions(rig, ("Walk", "Run", "Swim", "SwimIdle", "Climb", "Jump", "JumpLandSit",
                           "GetUpBack", "GetUpFront", "Kick", "Punch", "Slash", "Shoot", "CrossbowShot",
                           "Cast", "Throw", "HoldBow", "HoldCrossbow", "HoldStaff", "HoldThrow",
                           *("Hold" + k.capitalize() for k in CARRIES), "Roll", "Flex"))
    act = bpy.data.actions[active_action]
    rig.animation_data.action = act
    scene.frame_start = int(act.frame_start)
    scene.frame_end = int(act.frame_end) - (1 if act.use_cyclic else 0)

    if export_path:
        export_gltf(rig, ob, export_path)
    return rig, ob


def register_actions(rig, names):
    """Explicit clip ownership, including in a shared Blender MCP session."""
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    for name in names:
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, bpy.data.actions[name])
        track.mute = True


def export_gltf(rig, ob, path):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    for obj in (rig, ob):
        obj.select_set(True)
    vl.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        use_active_scene=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=False,
        export_rest_position_armature=True,
        export_texcoords=True,
        export_cameras=False,
        export_lights=False,
        export_force_sampling=True,
        export_frame_step=1,
        export_extras=True,
        export_yup=True,
    )


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, mesh = main(export_path=str(Path(args[0]).resolve() if args else Path(__file__).resolve().parent.parent / "assets" / "character.glb"))
    if len(args) > 1:
        figure.setup_stage(bpy.context.scene)
        bpy.context.scene.frame_set(0)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(args[1]).resolve()))
