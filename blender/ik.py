"""
Inverse kinematics for the clips the Blender scripts bake (docs/combat.md "Posing by IK").

The scripts pose every frame in code and bake it (creature.py bake, ground_clip). Turning bones by
angles (forward kinematics) is fine for what floats free; but where a limb touches something (a
foot on the floor, a hand on what it holds, a tentacle's tip on a spot it slams) angles never quite
keep it there: the foot skates, the tip sinks into the floor. Such a limb is posed backwards from
the point it must reach:

    two_bone(root, target, a, b, pole)      a leg or an arm: hip (shoulder) -> knee (elbow) ->
                                            foot (hand), the knee bending towards `pole`
    pole_from(root, target, hint, fallback) the way a knee keeps bending, without flipping
    soften(root, target, reach)             a target pulled in as it nears full stretch (soft IK:
                                            no knee shooting out as it comes back into reach)
    chain(joints, target)                   any number of bones reaching a point (FABRIK),
                                            staying close to the shape they start from: given the
                                            limb's rest shape (carried along with what it hangs
                                            from), a tentacle, tail or neck bends as it does at
                                            rest; to arrive along a way, reach the point one bone
                                            short of the target and run the last bone into it
    step(phase, duty, stride, lift)         a planted contact's walk: still on the floor for its
                                            share of the loop (sliding back as fast as the body
                                            walks, so it does not skate), then lifted and swung
                                            forward
    aim(skel, name, poses, head, direction) a bone put at a point, pointing a way: its basis
    aim_chain(skel, names, poses, joints)   bones along the joints a solver gave
    arc(root, target, lengths, bow)         a chain laid along a smooth arc from its root to a
                                            point, bowing out along `bow` as far as it must to fit
                                            (no zigzag where it is slack): tentacles, tails, necks
    frame_turn, curl                        a shape hung off a chain's end (a tentacle's curling
                                            tip) following the end as it turns

Everything is in armature space (mathutils Vectors). `skel` is a character.py Skeleton, `poses` the
armature-space matrices of the bones posed so far (parents before children).
"""
import math

from mathutils import Matrix, Quaternion, Vector


def two_bone(root, target, a, b, pole):
    """(knee, end) of a two-bone limb from `root` of lengths a and b reaching for `target`, bent
    towards `pole` (a direction); out of reach it stretches straight towards it."""
    d_vec = target - root
    d = min(d_vec.length, (a + b) * 0.9995)
    n = d_vec.normalized()
    cos_a = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
    sin_a = math.sqrt(1 - cos_a * cos_a)
    perp = pole - n * pole.dot(n)
    perp.normalize()
    knee = root + n * (a * cos_a) + perp * (a * sin_a)
    end = root + n * d
    return knee, end


def pole_from(root, target, hint, fallback, sure=0.25):
    """Which way a knee (elbow) should bend reaching from `root` to `target`: the way the joint
    `hint` already sits off that line (it keeps bending as it did), leaning on `fallback` (a
    direction) as the hint nears the line, where the side it is on would flip frame to frame."""
    n = (target - root).normalized()
    off = (hint - root) - n * (hint - root).dot(n)
    fb = fallback - n * fallback.dot(n)
    k = min(1.0, off.length / sure)
    if off.length > 1e-9:
        off.normalize()
    if fb.length > 1e-9:
        fb.normalize()
    out = off * k + fb * (1 - k)
    return out if out.length > 1e-6 else fb


def lengths_of(joints):
    return [(b - a).length for a, b in zip(joints, joints[1:])]


def soften(root, target, reach, soft=0.9):
    """The target pulled in a little where it nears the end of the chain's `reach`: past `soft` of
    it, the chain reaches ever less of the way further out, never quite straight (a limb at full
    stretch is a singular pose: a hair nearer, and its knee shoots out; soft IK)."""
    gap = target - root
    d, s = gap.length, reach * soft
    if d <= s or d < 1e-9:
        return target
    k = reach - s
    return root + gap * ((s + k * (1 - math.exp(-(d - s) / k))) / d)


def chain(joints, target, lengths=None, iterations=200, tolerance=1e-6):
    """FABRIK: the joints of a chain (its root first, kept where it is) moved so that its end is at
    `target`, each bone its length; it starts from the shape given and stays near it (that is how
    a knee is told which way to bend: give it the shape bent that way). Out of reach, straight
    towards the target (nearly out of reach it converges slowly: hence the many iterations; too few,
    and the chain jumps as its target crosses into reach)."""
    pts = [p.copy() for p in joints]
    lengths = lengths or lengths_of(pts)
    root = pts[0].copy()
    if (target - root).length >= sum(lengths):
        d = (target - root).normalized()
        out = [root]
        for L in lengths:
            out.append(out[-1] + d * L)
        return out
    for _ in range(iterations):
        pts[-1] = target.copy()
        for k in range(len(pts) - 2, -1, -1):
            pts[k] = pts[k + 1] + (pts[k] - pts[k + 1]).normalized() * lengths[k]
        pts[0] = root.copy()
        for k in range(len(pts) - 1):
            pts[k + 1] = pts[k] + (pts[k + 1] - pts[k]).normalized() * lengths[k]
        if (pts[-1] - target).length < tolerance:
            break
    return pts


def bezier(p0, p1, p2, p3, n=48):
    out = []
    for k in range(n + 1):
        u = k / n
        w = 1 - u
        out.append(p0 * (w * w * w) + p1 * (3 * w * w * u) + p2 * (3 * w * u * u) + p3 * (u * u * u))
    return out


def along(points, lengths):
    """Joints at the given bone lengths along a polyline from its start (past its end: on along its
    last direction)."""
    out, k, acc, want = [points[0].copy()], 0, 0.0, 0.0
    seg = [(b - a).length for a, b in zip(points, points[1:])]
    for L in lengths:
        want += L
        while k < len(seg) - 1 and acc + seg[k] < want:
            acc += seg[k]
            k += 1
        a, b = points[k], points[k + 1]
        u = (want - acc) / seg[k] if seg[k] > 1e-9 else 0.0
        out.append(a + (b - a) * u)
    return out


def arc_length(points):
    return sum((b - a).length for a, b in zip(points, points[1:]))


def arc(root, target, lengths, bow):
    """The joints of a chain of `lengths` laid along an arc from `root` to `target`, bowing out
    along `bow` (a direction) just as far as it must to be as long as the chain, so its end lands on
    the target: the slack goes into one smooth bow, never a zigzag (as FABRIK alone may fold it),
    and the further the target, the flatter the bow (it changes smoothly: the bow's length grows
    with its height, so there is one fit). Out of reach the chain lies straight towards it."""
    total = sum(lengths)
    gap = target - root
    d = gap.length
    if d < 1e-6:
        return chain([root + bow.normalized() * sum(lengths[:k]) for k in range(len(lengths) + 1)], target, lengths)
    n = gap / d
    b = bow - n * bow.dot(n)
    b = b.normalized() if b.length > 1e-6 else n.orthogonal().normalized()
    shaped = lambda k: bezier(root, root + gap / 3 + b * k, root + gap * (2 / 3) + b * k, target)
    if d >= total * 0.9999:
        return along([root, root + n * total], lengths)
    lo, hi = 0.0, total
    for _ in range(40):
        mid = (lo + hi) / 2
        if arc_length(shaped(mid)) < total:
            lo = mid
        else:
            hi = mid
    return chain(along(shaped(hi), lengths), target, lengths, iterations=8)   # (onto the target exactly)


def step(phase, duty=0.5, stride=1.0, lift=0.3):
    """Where a stepping contact is in its loop at `phase` (0..1): (along, up). Planted for the first
    `duty` of the loop, sliding from +stride/2 to -stride/2 along the way the body walks (in place,
    the floor slides back under it, so the contact must too, as fast); then lifted (up to `lift`)
    and swung forward again, easing in and out."""
    phase %= 1.0
    if phase < duty:
        return stride * (0.5 - phase / duty), 0.0
    u = (phase - duty) / (1 - duty)
    e = u * u * (3 - 2 * u)
    return stride * (e - 0.5), lift * math.sin(math.pi * u)


def aim(skel, name, poses, head, direction, up=None):
    """The basis that puts bone `name` at `head`, pointing along `direction` (armature space), turned
    the least from where its parent holds it (or with its z axis towards `up`). Its parent's scale is
    not passed on (a limb of a body puffed up stays its size)."""
    base = skel.base(name, poses)
    b3 = base.to_3x3().normalized()
    y = b3.col[1].normalized()
    rot = y.rotation_difference(direction.normalized()).to_matrix() @ b3
    if up is not None:
        yy = direction.normalized()
        z = up - yy * up.dot(yy)
        if z.length > 1e-6:
            z.normalize()
            rot = Matrix((yy.cross(z), yy, z)).transposed()
    desired = Matrix.Translation(head) @ rot.to_4x4()
    poses[name] = desired
    return base.inverted() @ desired


def blend(root, fk, ik, lengths, w):
    """Joints of a chain `w` of the way from its pose by angles (`fk` joints) to its pose by IK
    (`ik` joints), bone by bone turning from the one way to the other (lengths kept): an IK reach
    eased in and out without a jump."""
    out = [root.copy()]
    for k, L in enumerate(lengths):
        a, b = (fk[k + 1] - fk[k]).normalized(), (ik[k + 1] - ik[k]).normalized()
        d = a.slerp(b, w) if a.dot(b) > -0.999 else (b if w > 0.5 else a)
        out.append(out[-1] + d.normalized() * L)
    return out


def aim_chain(skel, names, poses, joints):
    """Bases of bones `names` laid along `joints` (one more than the bones), each from its joint to
    the next."""
    return {n: aim(skel, n, poses, joints[k], joints[k + 1] - joints[k]) for k, n in enumerate(names)}


def frame_turn(a_from, a_to, side_from, side_to):
    """The turn taking a direction `a_from` with its sideways `side_from` to `a_to` with `side_to`:
    how a shape hung off one end of a chain (a tentacle's curling tip) follows the end as it turns.
    The sideways should turn with the chain (its rest sideways carried along as the chain is), not
    be taken from the world's up: where the chain points up or down that would flip frame to frame."""
    def frame(d, side):
        d = d.normalized()
        s = side - d * side.dot(d)
        if s.length < 1e-6:
            s = d.orthogonal()
        s.normalize()
        return Matrix((d, s, s.cross(d))).transposed()
    return frame(a_to, side_to) @ frame(a_from, side_from).transposed()


def curl(direction, rest_from, rest_to, k, turn):
    """A bone's direction curling off the one before it (`direction`) as `rest_to` does off
    `rest_from` at rest, k times as much (0: straight on), its plane turned by `turn` (frame_turn)."""
    q = rest_from.normalized().rotation_difference(rest_to.normalized())
    axis, angle = q.axis, q.angle
    return Quaternion(turn @ axis, angle * k) @ direction.normalized()
