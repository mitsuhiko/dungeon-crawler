"""Armor for the player (src/core/items.js ARMORS): helms, body armor, shields and boots.

Built by items.py (SPECS there; `import armor`), with its Mesh, in the character's own space and
rest pose (blender/character.py: the clay figure of figure.py in its A-pose, Z up, the face
towards -Y). Every part is a separate object that names the bone it follows (`bone`): a
breastplate the spine, the belt the hips, a shoulder plate its upper arm, a tasset its thigh, a
boot its shin. The game puts each part on its bone by the bone's rest frame (src/render/figure.js),
so a part only has to sit right in the rest pose.

The trim of every piece (bands, rims, hems, buckles) is on TRIM_SLOT, the glTF material
Items_Trim: the game tints it in the item's rarity colour and makes it glow for the rare ones; its
vertex colour is a neutral pale steel. Gems are on the facets slot (2) and glow from Decent up.

A shield is modelled in a frame of its own (its face towards -Y, its top +Z) and placed on the
outside of the left forearm (SHIELD_ARM). Its `back_bone` and `back_gltf` (a matrix in glTF space,
column-major) move it from there onto the back, where it goes while a bow needs the hand; its
`floor_gltf` lays it face up for the floor and the pictures.

    Blender -b --python blender/items.py -- [output-directory] [--only armor_]
"""
import math

from mathutils import Matrix, Vector

TRIM_SLOT = 4   # items.make_mesh: the Items_Trim material

# the figure (blender/figure.py, character.py): head, torso slab, arms, legs
HEAD = Vector((0, 0, 1.70))
HEAD_R = .26
TORSO_Z, TORSO_CORE, TORSO_R = 1.04, (.15, .015, .26), .14   # the rounded box: centre height, core half extents, rounding
LIMB_R = .125
SHOULDER = .40, 1.30              # x (both sides), z
ARM_DOWN = math.radians(30)       # the A-pose
UPPER_ARM, FOREARM = .36, .32
LEG_X, KNEE_Z = .16, .37

LEATHER = '#6e472e'
LEATHER_LIGHT = '#8c5d3c'
LEATHER_DARK = '#4e3220'
CLOTH = '#c9b58c'
CLOTH_DARK = '#a6915f'
STEEL = '#b9c3c6'
STEEL_DARK = '#8b979b'
IRON = '#6c7078'
IRON_DARK = '#4d5158'
TRIM = '#e0dbcd'
WOOD = '#8a6440'
WOOD_DARK = '#6a4a2c'
SLIT = '#1b1d22'
HORN = '#e8dcc0'
HORN_TIP = '#b9a888'
PAINT = ['#a8423a', '#3f6aa0', '#3f7a52', '#8a5aa0']
FEATHER = '#f2efe6'


# --- shells ----------------------------------------------------------------------------------------

def sheet(m, grid, thickness, color, closed=False):
    """A shell over a grid of (point, outward direction) rows of columns, `thickness` thick
    outwards; color(i, j) -> (colour, slot) of the face between columns i, i + 1 and rows j, j + 1;
    closed: the columns wrap round."""
    rows, cols = len(grid), len(grid[0])
    outer = [[m.vert(p + n * thickness) for p, n in row] for row in grid]
    inner = [[m.vert(p) for p, n in row] for row in grid]
    span = cols if closed else cols - 1

    def put(ids, i, j, shade=1):
        c, slot = color(i, j)
        m.slot = slot
        m.face(ids, c, shade=shade)
    for j in range(rows - 1):
        for i in range(span):
            k = (i + 1) % cols
            put((outer[j][i], outer[j][k], outer[j + 1][k], outer[j + 1][i]), i, j)
            put((inner[j][k], inner[j][i], inner[j + 1][i], inner[j + 1][k]), i, j, .75)
    for j, jj in ((0, 0), (rows - 1, rows - 2)):
        for i in range(span):
            k = (i + 1) % cols
            put((inner[j][i], inner[j][k], outer[j][k], outer[j][i]), i, jj, .9)
    if not closed:
        for i, ii in ((0, 0), (cols - 1, span - 1)):
            for j in range(rows - 1):
                put((inner[j][i], inner[j + 1][i], outer[j + 1][i], outer[j][i]), ii, j, .9)
    m.slot = 0
    return outer


def solid(color, slot=0):
    return lambda i, j: (color, slot)


def rounded_ring(core, radius, n, z, lift=0.0):
    """n points (and outward normals) round a rounded rectangle at height z: core half extents
    (x, y), corner radius; lift tilts the normals up (the top of a rounded box)."""
    out = []
    per = n // 4
    for q, (sx, sy, a0) in enumerate(((1, -1, -math.pi / 2), (1, 1, 0), (-1, 1, math.pi / 2), (-1, -1, math.pi))):
        for k in range(per):
            a = a0 + (math.pi / 2) * k / (per - 1)
            c = Vector((sx * core[0], sy * core[1], 0))
            d = Vector((math.cos(a), math.sin(a), 0))
            normal = (d + Vector((0, 0, lift))).normalized()
            out.append((c + d * radius + Vector((0, 0, z)), normal))
    return out


def torso_ring(z, off, n=24, bulge=0.0, flare=0.0):
    """Round the torso (the figure's rounded box) at height z, `off` outside its surface; bulge
    pushes the front out at the middle (a breastplate), flare widens it (a skirt)."""
    rr = TORSO_R + off + flare
    dz = max(0.0, abs(z - TORSO_Z) - TORSO_CORE[2])
    r = math.sqrt(max(1e-6, rr * rr - dz * dz))
    lift = dz / r * (1 if z > TORSO_Z else -1)
    ring = rounded_ring(TORSO_CORE[:2], r, n, z, lift)
    if bulge:
        ring = [(p + Vector((0, -bulge * max(0, -nrm.y) * math.cos(min(1, abs(p.x) / .32) * math.pi / 2), 0)), nrm)
                for p, nrm in ring]
    return ring


def top_z(off, angle):
    """The height on the torso's top round, `angle` up from where it starts rounding."""
    return TORSO_Z + TORSO_CORE[2] + (TORSO_R + off) * math.sin(math.radians(angle))


def band(m, ring, height, thickness, color, slot=TRIM_SLOT):
    """A band (a closed ring of quads `height` tall) over a ring of (point, normal)."""
    grid = [[(p - Vector((0, 0, height / 2)), nrm) for p, nrm in ring], [(p + Vector((0, 0, height / 2)), nrm) for p, nrm in ring]]
    sheet(m, grid, thickness, solid(color, slot), closed=True)


def rivet(m, at, normal, color=TRIM, size=.014, slot=TRIM_SLOT):
    m.slot = slot
    m.lathe(at, [(0, size), (size * .7, size * .7), (size * 1.1, 0)], color, n=5, jitter=0, axis=normal)
    m.slot = 0


def gem(m, at, normal, size=.03, color='#c94b5a'):
    """A cut stone standing out of a surface (on the facets slot: it glows in the rarity's colour)."""
    m.slot = 2
    m.lathe(at, [(0, size), (size * .5, size * .9), (size, size * .45), (size * 1.25, 0)], color, n=6, jitter=0, axis=normal)
    m.slot = 0


# --- the body's frames -----------------------------------------------------------------------------

def arm_frame(side):
    """The upper arm's frame at the shoulder joint in the A-pose: (origin, along the arm, up off
    the arm's top, forward); side 1 is the left arm (+X)."""
    sx, sz = SHOULDER
    along = Vector((side * math.cos(ARM_DOWN), 0, -math.sin(ARM_DOWN)))
    up = Vector((side * math.sin(ARM_DOWN), 0, math.cos(ARM_DOWN)))
    return Vector((side * sx, 0, sz)), along, up, Vector((0, -1, 0))


SHIELD_TURN = math.radians(50)   # how far a shield on the arm is turned from facing out to facing ahead


def shield_arm():
    """Where a shield sits: on the outside of the left forearm in the A-pose, its face out,
    its top towards the elbow. A matrix from the shield's own frame into the figure's."""
    origin, along, up, fwd = arm_frame(1)
    face = (up * math.cos(SHIELD_TURN) + fwd * math.sin(SHIELD_TURN)).normalized()   # out from the arm, turned to the front
    centre = origin + along * (UPPER_ARM + FOREARM * .55) + face * (LIMB_R + .045)
    top = -along                   # its top towards the elbow
    x = top.cross(-face)           # the shield's own x: right-handed with -y = face, z = top
    return Matrix((
        (x.x, -face.x, top.x, centre.x),
        (x.y, -face.y, top.y, centre.y),
        (x.z, -face.z, top.z, centre.z),
        (0, 0, 0, 1)))


def shield_back():
    """On the back: the face out behind, the top up, between the shoulder blades."""
    centre = Vector((0, TORSO_CORE[1] + TORSO_R + .06, 1.08))
    return Matrix(((-1, 0, 0, centre.x), (0, -1, 0, centre.y), (0, 0, 1, centre.z), (0, 0, 0, 1)))


def shield_floor():
    """Lying face up (the floor, the pictures), its top away from the viewer."""
    return Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


TO_GLTF = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def gltf_matrix(m):
    """A Blender-space matrix as glTF (Y up) sees it, column-major."""
    g = TO_GLTF @ m @ TO_GLTF.inverted()
    return [round(g[r][c], 6) + 0.0 for c in range(4) for r in range(4)]


def place(m, matrix, start=0):
    """Move the vertices of m from `start` on by matrix."""
    for i in range(start, len(m.vertices)):
        m.vertices[i] = tuple(matrix @ Vector(m.vertices[i]))


def part(m, suffix, bone, build):
    """A part of m on another bone: build(p) fills a new mesh p (in the figure's space)."""
    p = type(m)(m.rng.randrange(1 << 30))
    build(p)
    m.parts.append((suffix, p, (0, 0, 0), {'bone': bone}))
    return p


# --- helms (on the head) --------------------------------------------------------------------------

def dome(m, radius, top, bottom, color, rows=5, n=18, slot=0, shape=None, thickness=.03):
    """A bowl over the head: from `top` (angle from straight up) down to `bottom`; shape(t, phi)
    scales the radius (t: 0 top .. 1 bottom)."""
    grid = []
    for j in range(rows + 1):
        t = j / rows
        theta = math.radians(top + (bottom - top) * t)
        row = []
        for i in range(n):
            phi = math.tau * i / n
            r = radius * (shape(t, phi) if shape else 1)
            d = Vector((math.sin(theta) * math.sin(phi), -math.sin(theta) * math.cos(phi), math.cos(theta)))
            row.append((HEAD + d * r, d))
        grid.append(row)
    return sheet(m, grid, thickness, color if callable(color) else solid(color, slot), closed=True)


def rim(m, radius, theta, color=TRIM, thickness=.022, slot=TRIM_SLOT, n=18, height=.045):
    """A band round the head at angle theta from straight up."""
    t = math.radians(theta)
    ring = []
    for i in range(n):
        phi = math.tau * i / n
        d = Vector((math.sin(t) * math.sin(phi), -math.sin(t) * math.cos(phi), 0)).normalized()
        ring.append((HEAD + Vector((0, 0, math.cos(t) * radius)) + d * (math.sin(t) * radius), d))
    band(m, ring, height, thickness, color, slot)


def head_cap(m, v=0):
    """A round cap of boiled leather sewn from panels, a rolled rim, a button on top."""
    r = HEAD_R + .012
    dome(m, r, 4, 72, lambda i, j: (LEATHER if i % 3 else LEATHER_LIGHT, 0), rows=4)
    rim(m, r + .015, 70, LEATHER_DARK, slot=0)
    rim(m, r + .03, 74, TRIM, height=.025, thickness=.012)
    m.slot = TRIM_SLOT
    m.lathe(HEAD + Vector((0, 0, r + .025)), [(-.02, .035), (0, .03), (.02, 0)], TRIM, n=6, jitter=0)
    m.slot = 0


def head_skullcap(m, v=0):
    """A plain iron bowl with a riveted band and a short brim."""
    r = HEAD_R + .015
    dome(m, r, 0, 70, IRON, rows=4, slot=1)
    rim(m, r + .02, 68, TRIM, height=.06)
    for i in range(8):
        phi = math.tau * i / 8
        t = math.radians(68)
        d = Vector((math.sin(t) * math.sin(phi), -math.sin(t) * math.cos(phi), 0)).normalized()
        rivet(m, HEAD + Vector((0, 0, math.cos(t) * r)) + d * (math.sin(t) * r + .045), d)
    rim(m, r + .055, 76, IRON_DARK, height=.018, thickness=.03, slot=1)


def nasal_shape(t, phi):
    return 1 + .32 * (1 - t) ** 3   # a pointed crown


def head_nasal(m, v=0):
    """A pointed helm on a riveted band, a bar down over the nose."""
    r = HEAD_R + .02
    dome(m, r, 0, 74, lambda i, j: (STEEL if i % 2 else STEEL_DARK, 1), rows=6, shape=nasal_shape)
    rim(m, r + .02, 72, TRIM, height=.065)
    m.slot = TRIM_SLOT
    top = HEAD + Vector((0, -(r + .045) * math.sin(math.radians(72)), math.cos(math.radians(72)) * r + .02))
    m.box(top + Vector((0, 0, -.1)), (.05, .025, .2), TRIM)   # the nasal
    m.slot = 0
    for i in range(10):
        phi = math.tau * (i + .5) / 10
        t = math.radians(72)
        d = Vector((math.sin(t) * math.sin(phi), -math.sin(t) * math.cos(phi), 0)).normalized()
        rivet(m, HEAD + Vector((0, 0, math.cos(t) * r)) + d * (math.sin(t) * r + .05), d, IRON_DARK, slot=1)


def horn(m, side):
    """A horn curving out from the side of the helm, up and forward at the tip."""
    base = HEAD + Vector((side * (HEAD_R + .02), .02, .1))
    pts = [base, base + Vector((side * .12, -.01, .03)), base + Vector((side * .22, -.04, .12)),
           base + Vector((side * .25, -.08, .24)), base + Vector((side * .22, -.12, .32))]
    m.tube(pts[:3], [.07, .058, .045], HORN, n=7)
    m.tube(pts[2:], [.045, .03, .008], HORN_TIP, n=7)


def head_horned(m, v=0):
    """A heavy iron helm with cheek guards and two curved horns."""
    r = HEAD_R + .022
    dome(m, r, 0, 78, IRON, rows=5, slot=1, shape=lambda t, phi: 1 + .06 * (1 - t))
    rim(m, r + .022, 74, TRIM, height=.07)
    # a ridge front to back over the crown
    m.slot = TRIM_SLOT
    arc = [HEAD + Vector((0, -math.sin(math.radians(a)) * (r + .055), math.cos(math.radians(a)) * (r + .045)))
           for a in range(-70, 71, 20)]
    m.tube(arc, .022, TRIM, n=5)
    m.slot = 1
    for side in (-1, 1):   # the cheek guards
        c = HEAD + Vector((side * .2, -.12, -.09))
        m.box(c, (.05, .14, .13), IRON_DARK, tilt=side * .5)
    m.slot = 0
    for side in (-1, 1):
        horn(m, side)


def head_great(m, v=0):
    """A great helm: a flat-topped steel bucket over the whole head, an eye slit, breathing
    holes, a brass cross on the face and a crest on top."""
    rx, ry = HEAD_R + .05, HEAD_R + .04
    low, high = HEAD.z - .27, HEAD.z + .2
    n = 20
    grid = []
    for z in (low, low + .12, HEAD.z, high - .06, high):
        row = []
        squeeze = .9 if z == high else 1
        for i in range(n):
            phi = math.tau * i / n
            d = Vector((math.sin(phi), -math.cos(phi), 0))
            row.append((Vector((HEAD.x + d.x * rx * squeeze, HEAD.y + d.y * ry * squeeze, z)), d))
        grid.append(row)
    sheet(m, grid, .03, lambda i, j: (STEEL if j != 1 else STEEL_DARK, 1), closed=True)
    m.slot = 1
    m.lathe(Vector((0, 0, high)), [(0, rx * .9), (.02, rx * .82), (.035, 0)], STEEL_DARK, n=n, jitter=0)
    # the eye slit, a dark band across the front
    m.slot = 0
    for side in (-1, 1):
        m.box(Vector((side * .1, -ry - .028, HEAD.z + .04)), (.15, .02, .04), SLIT, tilt=0)
    for k in range(6):   # breathing holes on the right cheek
        m.box(Vector((.1 + (k % 3) * .04, -ry - .022 + (k % 3) * .015, HEAD.z - .14 - (k // 3) * .05)), (.018, .02, .018), SLIT)
    # the cross: a vertical bar down the face and a band round under the slit
    m.slot = TRIM_SLOT
    m.box(Vector((0, -ry - .04, HEAD.z - .06)), (.045, .025, .3), TRIM)
    band(m, [(Vector((HEAD.x + math.sin(math.tau * i / n) * rx, HEAD.y - math.cos(math.tau * i / n) * ry, HEAD.z - .02)),
              Vector((math.sin(math.tau * i / n), -math.cos(math.tau * i / n), 0))) for i in range(n)], .035, .045, TRIM)
    band(m, [(Vector((HEAD.x + math.sin(math.tau * i / n) * rx, HEAD.y - math.cos(math.tau * i / n) * ry, low + .02)),
              Vector((math.sin(math.tau * i / n), -math.cos(math.tau * i / n), 0))) for i in range(n)], .04, .04, TRIM)
    # a crest of feathers on top, a gem in front of it
    m.slot = 0
    for k in range(5):
        y = -.12 + k * .06
        m.leaf(Vector((0, y, high + .02)), Vector((0, y + .08, high + .2 - abs(k - 2) * .03)), .05, PAINT[0] if k % 2 else FEATHER)
    gem(m, Vector((0, -ry - .05, HEAD.z + .12)), (0, -1, 0), .028)


# --- body armor -----------------------------------------------------------------------------------

def cuirass(m, off, rows, color, bulge=0.0, n=24, thickness=.03):
    """The shell round the torso from the waist up over the shoulders' top, `rows` heights (and
    angles on the top round, as ('top', degrees)), each with its colour (j, i) -> (colour, slot)."""
    def z_of(r):
        return top_z(off, r[1]) if isinstance(r, tuple) else r
    grid = [torso_ring(z_of(r), off, n, bulge * (1 if not isinstance(r, tuple) else max(0, 1 - r[1] / 50))) for r in rows]
    return sheet(m, grid, thickness, lambda i, j: color(i, j), closed=True)


def hem(m, z, off, color=TRIM, height=.04, n=24, slot=TRIM_SLOT, thickness=.026, bulge=0.0, flare=0.0):
    band(m, torso_ring(z, off, n, bulge, flare), height, thickness, color, slot)


def belt(m, z, off, color=LEATHER_DARK, buckle=True, height=.07, flare=0.0):
    """A belt round the hips (its own part, on the hips bone), a buckle in front."""
    hem(m, z, off, color, height, slot=0, thickness=.03, flare=flare)
    if buckle:
        front = TORSO_CORE[1] + TORSO_R + off + flare + .035
        m.slot = TRIM_SLOT
        m.box(Vector((0, -front, z)), (.1, .03, height + .02), TRIM)
        m.slot = 0
        m.box(Vector((0, -front - .016, z)), (.05, .012, height - .025), LEATHER_DARK)


def pauldron(m, side, radius, color, lames=1, trim=True, spikes=0, slot=0):
    """A shoulder plate over the top of the upper arm: a cap round the shoulder joint, tilted out
    along the arm, `lames` more strips under it."""
    origin, along, up, fwd = arm_frame(side)
    for k in range(lames + 1):
        r = radius - .02 * k
        centre = origin + along * (.02 + .07 * k) + up * (-.015 * k)
        grid = []
        rows, n = 4, 12
        for j in range(rows + 1):
            t = math.radians(5 + (78 if k == 0 else 60) * j / rows)
            row = []
            for i in range(n + 1):
                a = math.radians(-95 + 190 * i / n)   # round the top of the arm, front to back
                d = (up * math.cos(t) + (fwd * math.sin(a) + along * math.cos(a) * .45) * math.sin(t)).normalized()
                row.append((centre + d * r, d))
            grid.append(row)
        top = rows - 1
        sheet(m, grid, .028, lambda i, j: ((TRIM, TRIM_SLOT) if trim and j == top else (color, slot)))
    for s in range(spikes):
        a = math.radians(-30 + 60 * s / max(1, spikes - 1))
        base = origin + up * radius * .9 + fwd * math.sin(a) * radius * .4
        m.slot = TRIM_SLOT
        m.lathe(base, [(0, .03), (.09, 0)], TRIM, n=5, jitter=0, axis=up)
        m.slot = 0


def tasset(m, side, color, rows=2, trim=True, slot=1):
    """A plate hanging over the front and outside of the thigh (on the thigh bone)."""
    x = side * LEG_X
    for k in range(rows):
        z = .78 - k * .1
        grid = []
        for zz in (z, z - .12):
            row = []
            for i in range(7):
                a = math.radians(-20 + 130 * i / 6)   # from the front round to the outside
                d = Vector((side * math.sin(a), -math.cos(a), 0))
                row.append((Vector((x, 0, zz)) + d * (LIMB_R + .04 + k * .008), d))
            grid.append(row)
        sheet(m, grid, .022, lambda i, j: ((TRIM, TRIM_SLOT) if trim and k == rows - 1 and i in (0, 5) else (color, slot)))


def body_padded(m, v=0):
    """A quilted cloth vest: stitched in vertical rolls, a hem and a cloth sash."""
    rows = [.86, .97, 1.08, 1.19, 1.3, ('top', 22), ('top', 44), ('top', 58)]
    cuirass(m, .035, rows, lambda i, j: (CLOTH if i % 2 else CLOTH_DARK, 0), bulge=.01)
    hem(m, .86, .045)
    hem(m, top_z(.035, 58), .045, height=.03)

    def sash(p):
        belt(p, .86, .07, CLOTH_DARK, buckle=True, height=.08)
    part(m, 'belt', 'hips', sash)
    for side in (-1, 1):
        part(m, 'pad_' + ('L' if side > 0 else 'R'), f'upper_arm.{"L" if side > 0 else "R"}',
             lambda p, side=side: pauldron(p, side, LIMB_R + .045, CLOTH, lames=0))


def body_leather(m, v=0):
    """A stiff leather jerkin: panels, a strap across the chest, a broad belt, shoulder pads."""
    rows = [.84, .96, 1.08, 1.2, 1.3, ('top', 22), ('top', 44), ('top', 58)]
    cuirass(m, .038, rows, lambda i, j: (LEATHER if (i // 3) % 2 else LEATHER_LIGHT, 0), bulge=.015)
    hem(m, top_z(.038, 58), .048, height=.03)
    # a strap from the right shoulder to the left hip, studded
    m.slot = 0
    pts = [Vector((-.24 + .48 * t, -(TORSO_CORE[1] + TORSO_R + .07) - .015 * math.sin(math.pi * t), 1.36 - .42 * t)) for t in (0, .25, .5, .75, 1)]
    m.tube(pts, .028, LEATHER_DARK, n=5)
    for p in pts[1:4]:
        rivet(m, p + Vector((0, -.022, 0)), (0, -1, 0))

    def wide_belt(p):
        belt(p, .85, .065, LEATHER_DARK, height=.1)
    part(m, 'belt', 'hips', wide_belt)
    for side in (-1, 1):
        part(m, 'pad_' + ('L' if side > 0 else 'R'), f'upper_arm.{"L" if side > 0 else "R"}',
             lambda p, side=side: pauldron(p, side, LIMB_R + .05, LEATHER_LIGHT, lames=1))


def body_chain(m, v=0):
    """Chainmail: a mail shirt (rings in alternating shades) down over the hips, trimmed edges,
    mail over the shoulders."""
    rows = [.98, 1.08, 1.18, 1.27, ('top', 15), ('top', 35), ('top', 55)]
    cuirass(m, .03, rows, lambda i, j: (STEEL if j % 2 else '#a7b2b5', 1))
    hem(m, top_z(.03, 55), .04, height=.03)

    def skirt(p):   # the mail down over the hips, flaring a little
        grid = [torso_ring(z, .03 + f, 24) for z, f in ((1.0, 0), (.88, .008), (.76, .02), (.66, .04))]
        sheet(p, grid, .03, lambda i, j: ((STEEL if j % 2 else '#a7b2b5'), 1), closed=True)
        hem(p, .66, .07, height=.035)
        belt(p, .9, .07, LEATHER_DARK, height=.06)
    part(m, 'skirt', 'hips', skirt)
    for side in (-1, 1):
        part(m, 'mail_' + ('L' if side > 0 else 'R'), f'upper_arm.{"L" if side > 0 else "R"}',
             lambda p, side=side: pauldron(p, side, LIMB_R + .04, STEEL_DARK, lames=1, slot=1))


def body_scale(m, v=0):
    """A coat of overlapping scales (rows of plates, each row a little out over the next), a
    trimmed collar, scaled shoulders and tassets."""
    rows = [.86, .95, 1.04, 1.13, 1.22, 1.3, ('top', 22), ('top', 44), ('top', 58)]
    tones = ['#9aa59a', '#7f8c80', '#b2bcb0']
    cuirass(m, .04, rows, lambda i, j: (tones[(i + (j % 2)) % 3], 1), bulge=.02)
    for z in (.95, 1.04, 1.13, 1.22):   # the scale rows' lower edges
        hem(m, z, .068, '#6f7b70', height=.02, slot=1, thickness=.012, bulge=.02)
    hem(m, .86, .05)
    hem(m, top_z(.04, 58), .05, height=.035)

    part(m, 'belt', 'hips', lambda p: belt(p, .85, .075, LEATHER_DARK))
    for side in (-1, 1):
        s = 'L' if side > 0 else 'R'
        part(m, 'pauldron_' + s, f'upper_arm.{s}', lambda p, side=side: pauldron(p, side, LIMB_R + .055, tones[1], lames=2, slot=1))
        part(m, 'tasset_' + s, f'thigh.{s}', lambda p, side=side: tasset(p, side, tones[0], rows=2))


def body_plate(m, v=0):
    """Plate armor: a shining breastplate with a ridge down the middle and a gem, big shoulder
    plates in lames, a plated belt and tassets."""
    rows = [.88, .98, 1.08, 1.18, 1.27, ('top', 18), ('top', 38), ('top', 56)]
    cuirass(m, .042, rows, lambda i, j: (STEEL if j > 0 else STEEL_DARK, 1), bulge=.04)
    hem(m, .88, .052, bulge=.04)
    hem(m, top_z(.042, 56), .052, height=.035)
    front = TORSO_CORE[1] + TORSO_R + .042 + .04
    m.slot = TRIM_SLOT
    m.tube([Vector((0, -front - .03, z)) for z in (.92, 1.05, 1.2, 1.32)], .018, TRIM, n=5)   # the ridge
    m.slot = 0
    gem(m, Vector((0, -front - .05, 1.24)), (0, -1, 0), .035, '#4f8fd0')
    for x in (-.22, .22):
        rivet(m, Vector((x, -front + .015, 1.3)), (x * 2, -1, 0))

    def plates(p):
        grid = [torso_ring(z, .07 + f, 24) for z, f in ((.94, 0), (.84, .01), (.74, .025))]
        sheet(p, grid, .03, lambda i, j: (STEEL_DARK if j else STEEL, 1), closed=True)
        hem(p, .74, .1, height=.03)
        belt(p, .92, .1, LEATHER_DARK, height=.05)
    part(m, 'belt', 'hips', plates)
    for side in (-1, 1):
        s = 'L' if side > 0 else 'R'
        part(m, 'pauldron_' + s, f'upper_arm.{s}', lambda p, side=side: pauldron(p, side, LIMB_R + .07, STEEL, lames=2, slot=1))
        part(m, 'tasset_' + s, f'thigh.{s}', lambda p, side=side: tasset(p, side, STEEL, rows=2))


# --- shields (in their own frame, then on the forearm) ---------------------------------------------

def outline_disc(m, outline, thickness, face, edge, slot=0, edge_slot=TRIM_SLOT, rim_w=.03, bulge=.03):
    """A shield board from a closed outline (in its own x, z), its face towards -y, a little
    convex; a rim round its edge."""
    n = len(outline)
    centre = Vector((0, 0, 0))
    front = [m.vert(Vector((x, -thickness / 2 - bulge * (1 - min(1, (x * x + z * z) / .09)), z))) for x, z in outline]
    back = [m.vert(Vector((x, thickness / 2, z))) for x, z in outline]
    mid = m.vert(centre + Vector((0, -thickness / 2 - bulge, 0)))
    mid_back = m.vert(centre + Vector((0, thickness / 2, 0)))
    m.slot = slot
    for i in range(n):
        j = (i + 1) % n
        m.face((front[j], front[i], mid), face(i))
        m.face((back[i], back[j], mid_back), WOOD_DARK, shade=.8)
    m.slot = edge_slot
    for i in range(n):
        j = (i + 1) % n
        m.face((front[i], front[j], back[j], back[i]), edge)
    # the rim: a rounded band round the edge
    loop = [Vector((x, 0, z)) for x, z in outline]
    m.tube(loop + loop[:2], rim_w * .6, edge, n=5)
    m.slot = 0


def round_outline(r, n=20):
    return [(r * math.sin(math.tau * i / n), r * math.cos(math.tau * i / n)) for i in range(n)]


def boss(m, r, color=TRIM, slot=TRIM_SLOT, at=(0, 0)):
    m.slot = slot
    m.lathe(Vector((at[0], -.03, at[1])), [(0, r), (-r * .4, r * .8), (-r * .75, r * .35), (-r * .85, 0)], color, n=10, jitter=0,
            axis=(0, 1, 0))
    m.slot = 0


def straps(m, length):
    """The arm straps on the back, where the forearm goes."""
    for z in (-length * .3, length * .25):
        m.box(Vector((0, .045, z)), (.24, .03, .04), LEATHER_DARK)


def shield_buckler(m):
    outline_disc(m, round_outline(.2, 16), .04, lambda i: WOOD if i % 2 else WOOD_DARK, TRIM)
    boss(m, .07)
    straps(m, .2)


def shield_round(m):
    paint = PAINT[0]
    outline_disc(m, round_outline(.3, 22), .045, lambda i: paint if (i // 3) % 2 else '#e3d6b4', TRIM)
    boss(m, .085)
    for i in range(8):
        a = math.tau * i / 8
        rivet(m, Vector((.24 * math.sin(a), -.06, .24 * math.cos(a))), (0, -1, 0))
    straps(m, .3)


def kite_outline():
    pts = []
    for i in range(9):   # the round top
        a = math.pi * (i / 8)
        pts.append((.24 * math.cos(a), .2 + .14 * math.sin(a)))
    pts += [(-.235, .02), (-.17, -.2), (-.08, -.36), (0, -.46), (.08, -.36), (.17, -.2), (.235, .02)]
    return pts[::-1]


def shield_kite(m):
    outline_disc(m, kite_outline(), .045, lambda i: PAINT[1] if i % 4 < 2 else '#e3d6b4', TRIM, bulge=.04)
    m.slot = TRIM_SLOT
    m.box(Vector((0, -.07, -.02)), (.05, .02, .62), TRIM)
    m.box(Vector((0, -.07, .12)), (.36, .02, .05), TRIM)
    m.slot = 0
    boss(m, .06, at=(0, .12))
    straps(m, .4)


def heater_outline():
    pts = [(-.25, .3), (.25, .3)]
    for i in range(1, 8):
        t = i / 8
        pts.append((.25 * math.cos(t * math.pi / 2) ** .8, .3 - .62 * math.sin(t * math.pi / 2) ** 1.4))
    pts.append((0, -.34))
    for i in range(7, 0, -1):
        t = i / 8
        pts.append((-.25 * math.cos(t * math.pi / 2) ** .8, .3 - .62 * math.sin(t * math.pi / 2) ** 1.4))
    return pts[::-1]


def shield_heater(m):
    outline_disc(m, heater_outline(), .05, lambda i: PAINT[3], TRIM, bulge=.035)
    # a crest: a chevron and a gem
    m.slot = TRIM_SLOT
    for side in (-1, 1):
        a, b = Vector((0, -.088, .08)), Vector((side * .2, -.08, -.08))
        m.tube([a, b], .022, TRIM, n=4)
    m.slot = 0
    gem(m, Vector((0, -.09, .17)), (0, -1, 0), .04, '#e0b040')
    straps(m, .4)


def shield_tower(m):
    w, h = .28, .5
    outline = [(-w, h), (w, h), (w + .02, 0), (w, -h), (-w, -h), (-w - .02, 0)]
    # more points along the long sides so it bends round
    pts = []
    for i in range(len(outline)):
        a, b = Vector(outline[i]), Vector(outline[(i + 1) % len(outline)])
        for k in range(3):
            p = a.lerp(b, k / 3)
            pts.append((p.x, p.y))
    outline_disc(m, pts[::-1], .05, lambda i: IRON if i % 2 else IRON_DARK, TRIM, slot=1, bulge=.06)
    m.slot = TRIM_SLOT   # bands across
    for z in (-.3, .3):
        m.box(Vector((0, -.09, z)), (.56, .02, .05), TRIM)
    m.slot = 0
    boss(m, .09)
    for x in (-.2, .2):
        for z in (-.42, .42):
            rivet(m, Vector((x, -.08, z)), (0, -1, 0))
    m.box(Vector((0, -.08, .18)), (.2, .012, .03), SLIT)   # a viewing slit
    straps(m, .5)


# --- the prow shields: long, bent round the arm like a ship's prow, a broad arched top narrowing to a
# point, a double rim, a sunken triangle on the face, a finial on top. Three of them, heavier and
# deeper down: the Prow Shield, the Bulwark, the Aegis.

def prow_outline(w, top, tip, arch, n=6):
    """An arched top from -w to w (rising `arch` in the middle), straight sides bellying out a
    little down to the point at `tip`; counter-clockwise seen from the front (-y)."""
    pts = []
    for i in range(n + 1):   # the arch, right to left
        a = i / n
        x = w * (1 - 2 * a)
        pts.append((x, top + arch * (1 - (x / w) ** 2)))
    for side in (-1, 1):     # down the left side to the point, then up the right one
        steps = range(1, 5) if side < 0 else range(4, 0, -1)
        if side > 0:
            pts.append((0, tip))
        for k in steps:
            t = k / 5
            belly = .035 * math.sin(math.pi * t)
            pts.append((side * (w * (1 - t) + belly), top + (tip - top) * t))
    return pts[::-1]


class Prow:
    """A board bent round the arm: its face towards -y, `curve` how far its edges sweep back
    (behind the face's middle), `bulge` how much its middle stands out."""

    def __init__(self, w, top, tip, arch, thickness, curve, bulge):
        self.w, self.top, self.tip, self.arch = w, top, tip, arch
        self.t, self.curve, self.bulge = thickness, curve, bulge
        self.outline = prow_outline(w, top, tip, arch)
        self.mid = Vector((0, 0, (top + tip) * .5 + .04))

    def bend(self, x):
        return self.curve * (x / self.w) ** 2

    def front(self, x, z, lift=0.0):
        """A point on the face (lifted off it by `lift`)."""
        r2 = (x * x + (z - self.mid.z) ** 2) / (self.top - self.tip) ** 2 * 4
        return Vector((x, -self.t / 2 - self.bulge * max(0, 1 - r2) + self.bend(x) - lift, z))

    def board(self, m, face, back=WOOD_DARK, edge=TRIM, rings=4):
        """The board in rings from the edge in to the middle; face(ring) its colour."""
        outline = [Vector((x, 0, z)) for x, z in self.outline]
        n = len(outline)
        loops_f, loops_b = [], []
        for r in range(rings):
            k = 1 - r / rings
            pts = [self.mid.lerp(p, k) for p in outline]
            loops_f.append([m.vert(self.front(p.x, p.z)) for p in pts])
            loops_b.append([m.vert(Vector((p.x, self.t / 2 + self.bend(p.x), p.z))) for p in pts])
        cf = m.vert(self.front(self.mid.x, self.mid.z))
        cb = m.vert(Vector((0, self.t / 2, self.mid.z)))
        m.slot = 0
        for r in range(rings):
            for i in range(n):
                j = (i + 1) % n
                if r + 1 < rings:
                    m.face((loops_f[r][j], loops_f[r][i], loops_f[r + 1][i], loops_f[r + 1][j]), face(r))
                    m.face((loops_b[r][i], loops_b[r][j], loops_b[r + 1][j], loops_b[r + 1][i]), back, shade=.8)
                else:
                    m.face((loops_f[r][j], loops_f[r][i], cf), face(r))
                    m.face((loops_b[r][i], loops_b[r][j], cb), back, shade=.8)
        m.slot = TRIM_SLOT
        for i in range(n):
            j = (i + 1) % n
            m.face((loops_f[0][i], loops_f[0][j], loops_b[0][j], loops_b[0][i]), edge)
        # the outer rim: a rounded band round the edge, half over the face
        rim_pts = [Vector((p.x, (self.front(p.x, p.z).y + self.t / 2 + self.bend(p.x)) * .5, p.z)) for p in outline]
        m.tube(rim_pts + rim_pts[:2], .02, edge, n=5)
        m.slot = 0

    def band(self, m, k, color=TRIM, radius=.014, slot=TRIM_SLOT):
        """The inner rim: the outline drawn in towards the middle (k: 1 the edge)."""
        m.slot = slot
        pts = [self.mid.lerp(Vector((x, 0, z)), k) for x, z in self.outline]
        pts = [self.front(p.x, p.z, radius * .6) for p in pts]
        m.tube(pts + pts[:2], radius, color, n=4)
        m.slot = 0

    def triangle(self, m, corners, fill, frame=TRIM, fill_slot=0, frame_r=.016, depth=.008):
        """The sunken triangle: a panel a little in front of the face (corners in x, z, its broad
        side up), in a raised frame."""
        cs = [Vector((x, 0, z)) for x, z in corners]
        m.slot = fill_slot
        steps = 4
        # a grid of little triangles, so the panel follows the bent face
        grid = {}
        for i in range(steps + 1):
            for j in range(steps + 1 - i):
                p = cs[0] + (cs[1] - cs[0]) * (i / steps) + (cs[2] - cs[0]) * (j / steps)
                grid[i, j] = m.vert(self.front(p.x, p.z, depth))
        for i in range(steps):
            for j in range(steps - i):
                m.face((grid[i, j], grid[i, j + 1], grid[i + 1, j]), fill)
                if i + j + 1 < steps:
                    m.face((grid[i + 1, j], grid[i, j + 1], grid[i + 1, j + 1]), fill)
        m.slot = TRIM_SLOT if frame == TRIM else 0
        pts = []
        for a, b in zip(cs, cs[1:] + cs[:1]):
            pts += [self.front(*(a.lerp(b, s / steps)).xz, frame_r * .7) for s in range(steps)]
        m.tube(pts + pts[:2], frame_r, frame, n=4)
        m.slot = 0

    def finial(self, m, height, radius, color=TRIM, slot=TRIM_SLOT):
        """A spike on top of the arch, a knob under it."""
        m.slot = slot
        z = self.top + self.arch - .005
        y = -self.t / 2 + self.bend(0) * .5
        m.lathe(Vector((0, y, z)), [(0, radius * .55), (radius * .5, radius), (radius * 1.1, radius * .5),
                                    (radius * 1.5, radius * .7), (height, 0)], color, n=6, jitter=0)
        m.slot = 0

    def straps(self, m):
        for z in (self.tip * .3, self.top * .45):
            m.box(Vector((0, self.t / 2 + .02, z)), (.24, .03, .04), LEATHER_DARK)


def shield_prow(m):
    """The Prow Shield: iron, the triangle painted red, a ruby at its point."""
    p = Prow(.27, .3, -.46, .07, .045, .09, .025)
    p.board(m, lambda r: STEEL_DARK if r % 2 == 0 else IRON)
    p.band(m, .8)
    p.triangle(m, [(-.15, .22), (.15, .22), (0, -.26)], PAINT[0])
    p.finial(m, .11, .03)
    gem(m, p.front(0, -.36, .004), (0, -1, 0), .03, '#c94b5a')
    p.straps(m)


def shield_bulwark(m):
    """The Bulwark: bigger and bent further round, steel, a blue triangle studded at its corners,
    spikes on top and at the shoulders, a sapphire at the point."""
    p = Prow(.3, .33, -.52, .08, .05, .12, .03)
    p.board(m, lambda r: STEEL if r % 2 == 0 else STEEL_DARK)
    p.band(m, .82, radius=.016)
    tri = [(-.17, .25), (.17, .25), (0, -.3)]
    p.triangle(m, tri, PAINT[1], frame_r=.018)
    for x, z in tri:
        rivet(m, p.front(x, z, .02), (0, -1, 0), size=.02)
    for i in range(1, 6):   # studs down the band
        t = i / 6
        for side in (-1, 1):
            x, z = side * .82 * p.w * (1 - t), .82 * (p.top - p.mid.z) * (1 - t) + .82 * (p.tip - p.mid.z) * t + p.mid.z
            rivet(m, p.front(x, z, .02), (0, -1, 0))
    p.finial(m, .17, .035)
    m.slot = TRIM_SLOT
    for side in (-1, 1):    # spikes at the shoulders of the arch
        base = Vector((side * p.w * .96, p.bend(p.w * .96) * .5, p.top + .005))
        m.lathe(base, [(0, .022), (.1, 0)], TRIM, n=5, jitter=0, axis=(side * .7, 0, .7))
    m.slot = 0
    gem(m, p.front(0, -.41, .004), (0, -1, 0), .034, '#4f7fbf')
    p.straps(m)


def shield_aegis(m):
    """The Aegis: dark steel bent furthest round, its triangle a gem that glows (the facets slot),
    a crystal for a finial, a gem at the point."""
    p = Prow(.31, .35, -.56, .09, .05, .14, .035)
    p.board(m, lambda r: IRON_DARK if r % 2 == 0 else '#3a3d44')
    p.band(m, .84, radius=.017)
    p.band(m, .74, radius=.009)
    p.triangle(m, [(-.16, .25), (.16, .25), (0, -.3)], '#7f6ad6', fill_slot=2, frame_r=.02)
    p.finial(m, .14, .036)
    m.slot = 2   # a crystal on the finial
    m.lathe(Vector((0, -p.t / 2 + p.bend(0) * .5, p.top + p.arch + .1)),
            [(0, 0), (.04, .035), (.13, 0)], '#b9a8ff', n=5, jitter=0)
    m.slot = 0
    m.slot = TRIM_SLOT
    for side in (-1, 1):    # swept wings off the shoulders
        a = Vector((side * p.w * .9, p.bend(p.w * .9) * .4, p.top + .02))
        m.tube([a, a + Vector((side * .07, .02, .07)), a + Vector((side * .1, .05, .16))], [.024, .014, .003], TRIM, n=4)
    m.slot = 0
    gem(m, p.front(0, -.44, .004), (0, -1, 0), .036, '#9b7fe0')
    p.straps(m)


SHIELDS = {'buckler': shield_buckler, 'round': shield_round, 'kite': shield_kite, 'heater': shield_heater, 'tower': shield_tower,
           'prow': shield_prow, 'bulwark': shield_bulwark, 'aegis': shield_aegis}


def shield(kind):
    def build(m, v=0):
        SHIELDS[kind](m)
        place(m, shield_arm())
    return build


def shield_extras():
    arm, back = shield_arm(), shield_back()
    return {'back_bone': 'spine', 'back_gltf': gltf_matrix(back @ arm.inverted()),
            'floor_gltf': gltf_matrix(shield_floor() @ arm.inverted())}


# --- boots (one on each shin) ----------------------------------------------------------------------

def leg_ring(side, z, r, n=12, front=0.0):
    """Round the shin at height z, radius r, pushed out at the front by `front` (the toes)."""
    out = []
    for i in range(n):
        a = math.tau * i / n
        d = Vector((math.sin(a), -math.cos(a), 0))
        push = front * max(0, math.cos(a)) ** 2
        out.append((Vector((side * LEG_X, 0, z)) + d * r + Vector((0, -push, 0)), d))
    return out


def boot_shell(m, side, heights, color, n=12, toe=.07):
    """A boot round the shin: rings at `heights` ((z, extra radius, toe), ...), lowest first."""
    grid = [leg_ring(side, z, LIMB_R + extra, n, toe * f) for z, extra, f in heights]
    sheet(m, grid, .025, lambda i, j: color(i, j) if callable(color) else (color, 0), closed=True)
    # the sole under it
    m.slot = 0
    sole = [p for p, _ in leg_ring(side, .012, LIMB_R + heights[0][1] + .02, n, toe * heights[0][2] + .02)]
    low = [m.vert(p - Vector((0, 0, .012))) for p in sole]
    high = [m.vert(p + Vector((0, 0, .02))) for p in sole]
    m.face(tuple(reversed(low)), LEATHER_DARK)
    m.face(tuple(high), LEATHER_DARK)
    for i in range(n):
        j = (i + 1) % n
        m.face((low[i], low[j], high[j], high[i]), LEATHER_DARK)


def cuff(m, side, z, extra, color=TRIM, slot=TRIM_SLOT, height=.035):
    band(m, leg_ring(side, z, LIMB_R + extra), height, .02, color, slot)


def boots(builder):
    """Both boots, each on its shin: the left one in the root, the right one a part."""
    def build(m, v=0):
        builder(m, 1)
        part(m, 'R', 'shin.R', lambda p: builder(p, -1))
    return build


def feet_sandals(m, side):
    m.slot = 0
    sole = [p for p, _ in leg_ring(side, .015, LIMB_R + .02, 12, .09)]
    low = [m.vert(p - Vector((0, 0, .015))) for p in sole]
    high = [m.vert(p + Vector((0, 0, .015))) for p in sole]
    m.face(tuple(reversed(low)), LEATHER)
    m.face(tuple(high), LEATHER)
    for i in range(12):
        j = (i + 1) % 12
        m.face((low[i], low[j], high[j], high[i]), LEATHER)
    for z in (.06, .14, .22):
        band(m, leg_ring(side, z, LIMB_R + .008, 12, .04 if z < .1 else 0), .025, .012, LEATHER_LIGHT, 0)
    cuff(m, side, .22, .022, height=.02)


def feet_boots(m, side):
    boot_shell(m, side, [(.03, .02, 1), (.1, .02, .7), (.18, .015, 0), (.27, .018, 0)], LEATHER)
    cuff(m, side, .27, .035, LEATHER_DARK, slot=0, height=.05)
    cuff(m, side, .1, .04, height=.025)


def feet_hobnail(m, side):
    boot_shell(m, side, [(.03, .025, 1), (.1, .025, .8), (.2, .02, 0), (.3, .022, 0)], lambda i, j: (LEATHER_DARK if j == 0 else LEATHER, 0))
    cuff(m, side, .3, .04, height=.04)
    for i in range(6):   # the nails round the sole
        a = math.tau * i / 6
        d = Vector((math.sin(a), -math.cos(a), 0))
        rivet(m, Vector((side * LEG_X, 0, .012)) + d * (LIMB_R + .05) + Vector((0, -.06 * max(0, math.cos(a)) ** 2, 0)), d, IRON, slot=1)


def feet_greaves(m, side):
    boot_shell(m, side, [(.03, .025, 1), (.1, .025, .8), (.2, .02, 0)], LEATHER_DARK)
    # the greave: a steel plate up the front of the shin to the knee, a knee cop
    grid = []
    for z in (.12, .24, .36):
        row = []
        for i in range(7):
            a = math.radians(-80 + 160 * i / 6)
            d = Vector((math.sin(a), -math.cos(a), 0))
            row.append((Vector((side * LEG_X, 0, z)) + d * (LIMB_R + .04), d))
        grid.append(row)
    sheet(m, grid, .028, lambda i, j: (STEEL, 1))
    m.slot = 1
    m.lathe(Vector((side * LEG_X, -LIMB_R - .02, KNEE_Z + .02)), [(0, .08), (.03, .075), (.055, .04), (.065, 0)], STEEL_DARK, n=8,
            jitter=0, axis=(0, -1, 0))
    m.slot = 0
    cuff(m, side, .12, .07, height=.03)
    rivet(m, Vector((side * LEG_X, -LIMB_R - .09, KNEE_Z + .02)), (0, -1, 0))


def feet_winged(m, side):
    boot_shell(m, side, [(.03, .018, 1), (.1, .018, .7), (.2, .014, 0), (.26, .016, 0)], lambda i, j: ('#e8e2d2' if j else '#c9c0a8', 0))
    cuff(m, side, .26, .03, height=.035)
    for s in (-1, 1):   # a little wing at each side of the ankle, swept back
        base = Vector((side * LEG_X + s * (LIMB_R + .03), .02, .2))
        for k in range(3):
            tip = base + Vector((s * (.08 + .02 * k), .14 - .03 * k, .1 - .05 * k))
            m.leaf(base, tip, .03, FEATHER)
    cuff(m, side, .1, .035, height=.02)


# (name, builder, extras) for items.SPECS: a shield's extras say where it goes on the back
ARMOR = [
    ('armor_head_cap', head_cap, {'bone': 'head'}),
    ('armor_head_skullcap', head_skullcap, {'bone': 'head'}),
    ('armor_head_nasal', head_nasal, {'bone': 'head'}),
    ('armor_head_horned', head_horned, {'bone': 'head'}),
    ('armor_head_great', head_great, {'bone': 'head'}),
    ('armor_body_padded', body_padded, {'bone': 'spine'}),
    ('armor_body_leather', body_leather, {'bone': 'spine'}),
    ('armor_body_chain', body_chain, {'bone': 'spine'}),
    ('armor_body_scale', body_scale, {'bone': 'spine'}),
    ('armor_body_plate', body_plate, {'bone': 'spine'}),
    *[(f'armor_shield_{k}', shield(k), {'bone': 'forearm.L', **shield_extras()}) for k in SHIELDS],
    ('armor_feet_sandals', boots(feet_sandals), {'bone': 'shin.L'}),
    ('armor_feet_boots', boots(feet_boots), {'bone': 'shin.L'}),
    ('armor_feet_hobnail', boots(feet_hobnail), {'bone': 'shin.L'}),
    ('armor_feet_greaves', boots(feet_greaves), {'bone': 'shin.L'}),
    ('armor_feet_winged', boots(feet_winged), {'bone': 'shin.L'}),
]
