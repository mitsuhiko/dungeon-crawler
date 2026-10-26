"""Theme builders: the museum (see themes.py).

    museum  Mansk's arena (core/bosses.js BOSS_ARENAS.mansk, cubegen/arenaprops.js `stage`): a
            museum hall with a stage at its end. Things on show on pedestals and in glass cases
            (a mask among them), paintings in gold frames and a red stage curtain on the walls,
            velvet ropes on brass posts, footlights along the stage's edge and spotlights on it.
            No theme of its own: the hall is built in the colours of whatever theme its depth has
            (themes/surfaces.js); these are what it is dressed with.

Every builder is build_<prop>(m, variant) on a props.Mesh in attachment space (Blender: Z up; the
front of a ground prop faces -Y; a wall prop's wall is the plane y = 0, the prop standing out of
it towards +Y, clutter_geo.flatten_back).
"""
import math
from pathlib import Path
import sys

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from props import TAU, polar  # noqa: E402
from clutter_geo import lit, xform, flatten_back  # noqa: E402

MARBLE = ("#ece8e0", "#ddd7cc", "#e4dfd5")
MARBLE_DARK = "#bdb6aa"
GOLD = ("#d9a93a", "#c08f2a", "#e8c25a")
VELVET = ("#a01a26", "#86121c", "#b42432")
VELVET_DARK = "#5e0c14"
WOOD = ("#6a4528", "#5a3a22", "#7a5232")
BRASS = "#c9a24a"
FRAME = "#9fb4bf"
BULB = "#ffe2a0"
LAMP = "#2e2e34"
CLAY = ("#c2683a", "#a85a32")
INK = "#1e1a1a"
PORCELAIN = ("#f2f4f8", "#3a5aa8")


# --- helpers -------------------------------------------------------------------
def plinth(m, h, w=0.36, top=None):
    """A marble pedestal h high, w wide, with a base and a cap a little wider."""
    m.box((0, 0, 0.04), (w + 0.08, w + 0.08, 0.08), MARBLE_DARK)
    m.box((0, 0, 0.08 + (h - 0.16) / 2), (w, w, h - 0.16), MARBLE[0])
    m.box((0, 0, h - 0.04), (w + 0.07, w + 0.07, 0.08), top or MARBLE[1])
    return h


def post(m, x, y, h=0.62):
    """A brass post on a round foot, a knob on top: where a velvet rope hangs."""
    m.lathe((x, y, 0), [(0, 0.09), (0.03, 0.08), (0.04, 0.03), (h, 0.022), (h + 0.01, 0)], BRASS, n=8, jitter=0.02)
    m.blob(Vector((x, y, h + 0.03)), (0.04, 0.04, 0.04), GOLD[2], n=5, jitter=0.02)
    return Vector((x, y, h - 0.04))


def rope(m, a, b, sag=0.16, r=0.022, color=VELVET[0], n=6):
    pts = [a.lerp(b, k / n) - Vector((0, 0, sag * 4 * (k / n) * (1 - k / n))) for k in range(n + 1)]
    m.tube(pts, r, color, n=4)


def vase(m, base, v):
    """An amphora of red clay with black bands, or a blue and white porcelain vase."""
    if v == 0:
        m.lathe(base, [(0, 0.06), (0.04, 0.09), (0.14, 0.13), (0.24, 0.11), (0.3, 0.05), (0.38, 0.055), (0.4, 0.07)], CLAY[0], n=10,
                jitter=0.01, colors=[CLAY[0], INK, CLAY[1], CLAY[0], INK, CLAY[0]])
        for s in (-1, 1):
            m.tube([base + Vector((s * 0.05, 0, 0.36)), base + Vector((s * 0.13, 0, 0.33)), base + Vector((s * 0.11, 0, 0.22))], 0.014, CLAY[1], n=4)
    else:
        m.lathe(base, [(0, 0.05), (0.06, 0.1), (0.18, 0.14), (0.3, 0.1), (0.38, 0.04), (0.44, 0.06)], PORCELAIN[0], n=10,
                jitter=0.01, colors=[PORCELAIN[0], PORCELAIN[1], PORCELAIN[0], PORCELAIN[1], PORCELAIN[0]])


def bust(m, base, v):
    """A marble head on its shoulders (v 1: wearing a gold helmet)."""
    m.blob(base + Vector((0, 0, 0.06)), (0.15, 0.09, 0.07), MARBLE[2], n=7, jitter=0.03)
    m.lathe(base + Vector((0, 0, 0.1)), [(0, 0.05), (0.08, 0.045), (0.1, 0)], MARBLE[0], n=6, jitter=0.02)
    head = base + Vector((0, 0, 0.26))
    m.blob(head, (0.085, 0.095, 0.11), MARBLE[0], n=7, jitter=0.03)
    m.blob(head + Vector((0, -0.09, -0.01)), (0.018, 0.03, 0.03), MARBLE[1], n=4, jitter=0.02)   # the nose
    if v == 1:
        m.lathe(head + Vector((0, 0, 0.01)), [(0, 0.1), (0.07, 0.09), (0.12, 0.05), (0.14, 0)], GOLD[0], n=9, jitter=0.02)
        m.box(head + Vector((0, 0.01, 0.16)), (0.025, 0.2, 0.06), VELVET[0])   # the crest
    else:
        m.blob(head + Vector((0, 0.02, 0.06)), (0.095, 0.1, 0.07), MARBLE[1], n=6, jitter=0.06)   # curls


def little_mask(m, at, scale=1.0):
    """A little white mask with two horns, like his: on show in a glass case."""
    s = scale
    m.blob(at, (0.11 * s, 0.03 * s, 0.13 * s), MARBLE[0], n=7, jitter=0.02)
    for x in (-0.04, 0.04):
        m.blob(at + Vector((x * s, -0.03 * s, 0.03 * s)), (0.014 * s, 0.01 * s, 0.018 * s), INK, n=4, jitter=0)
    m.blob(at + Vector((0, -0.03 * s, -0.05 * s)), (0.03 * s, 0.01 * s, 0.04 * s), VELVET_DARK, n=4, jitter=0)
    for sx in (-1, 1):
        pts = [at + Vector((sx * (0.08 + 0.03 * k) * s, 0, (0.1 + 0.07 * k) * s)) + Vector((sx * 0.015 * s * math.sin(k * 2), 0, 0)) for k in range(4)]
        m.tube(pts, 0.012 * s, "#d9c49c", n=4)
    start = len(m.faces)
    m.blob(at + Vector((0, -0.03 * s, 0.08 * s)), (0.015 * s, 0.008 * s, 0.022 * s), "#3d8bff", n=4, jitter=0)
    lit(m, start)


# --- the props -----------------------------------------------------------------
def build_pedestal_vase(m, v):
    """A vase on show on a marble pedestal."""
    h = plinth(m, 0.78)
    vase(m, Vector((0, 0, h)), v)


def build_pedestal_bust(m, v):
    """A marble bust on a pedestal, a little brass plate on its front."""
    h = plinth(m, 0.72)
    bust(m, Vector((0, 0, h)), v)
    m.box((0, -0.19, 0.45), (0.14, 0.012, 0.06), BRASS)


def build_display_case(m, v):
    """A glass case on a wooden cabinet: what is in it lit up (a crown, or a little horned mask)."""
    m.box((0, 0, 0.3), (0.62, 0.48, 0.6), WOOD[0])
    m.box((0, 0, 0.615), (0.66, 0.52, 0.03), WOOD[2])
    m.box((0, -0.245, 0.3), (0.5, 0.01, 0.4), WOOD[1])
    m.box((0, 0, 0.64), (0.5, 0.36, 0.02), VELVET[1])
    # the glass: only its edges show
    x0, x1, y0, y1, z0, z1 = -0.28, 0.28, -0.2, 0.2, 0.64, 1.02
    for x in (x0, x1):
        for y in (y0, y1):
            m.tube([(x, y, z0), (x, y, z1)], 0.012, FRAME, n=3)
    for z in (z0, z1):
        for a, b in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)), ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
            m.tube([(a[0], a[1], z), (b[0], b[1], z)], 0.012, FRAME, n=3)
    start = len(m.faces)
    if v == 0:   # a gold crown, its gems glowing
        m.lathe((0, 0, 0.65), [(0, 0.1), (0.05, 0.11), (0.06, 0.105)], GOLD[0], n=10, jitter=0.01)
        for k in range(5):
            a = TAU * k / 5
            m.leaf(polar(0.1, a, 0.7), polar(0.1, a, 0.8), 0.03, GOLD[2])
        lit(m, start)
        for k in range(5):
            m.blob(Vector(polar(0.105, TAU * k / 5 + 0.6, 0.68)), (0.018, 0.018, 0.018), "#ff3a4a" if k % 2 else "#3d8bff", n=4, jitter=0)
    else:        # a little mask with horns, like his
        m.box((0, 0.05, 0.72), (0.04, 0.04, 0.16), WOOD[1])
        little_mask(m, Vector((0, 0.0, 0.84)), 1.1)
    lit(m, start)


def build_rope_posts(m, v):
    """Two brass posts with a red velvet rope between them: keep back."""
    a, b = post(m, -0.4, 0.0), post(m, 0.4, 0.0)
    rope(m, a, b, sag=0.14 + 0.04 * v)


def build_painting(m, v):
    """A painting in a gold frame: green hills under a blue sky and a sun, or a lady in black."""
    w, h = 0.36, 0.28
    m.box((0, 0.02, 0), (2 * w, 0.02, 2 * h), "#f0e6c8" if v == 0 else "#2a2418")
    if v == 0:
        m.box((0, 0.032, 0.08), (2 * w - 0.02, 0.004, 2 * h * 0.55), "#8fc4e8")
        for x, r, c in ((-0.18, 0.2, "#5a9a46"), (0.12, 0.26, "#4a8a3c"), (0.3, 0.16, "#6aaa52")):
            m.blob(Vector((x, 0.034, -0.2)), (r, 0.004, r * 0.55), c, n=6, jitter=0.02)
        m.blob(Vector((0.2, 0.036, 0.14)), (0.06, 0.004, 0.06), "#ffd24a", n=6, jitter=0)
    else:
        m.blob(Vector((0, 0.034, 0.1)), (0.13, 0.004, 0.12), "#2e1e14", n=7, jitter=0.03)
        m.blob(Vector((0, 0.037, 0.04)), (0.1, 0.004, 0.13), "#e8c8a8", n=7, jitter=0.02)
        m.blob(Vector((0, 0.036, -0.24)), (0.22, 0.004, 0.12), "#141418", n=7, jitter=0.02)
    t = 0.05
    for z in (-h - t / 2, h + t / 2):
        m.box((0, 0.03, z), (2 * w + 2 * t, 0.06, t), GOLD[0])
    for x in (-w - t / 2, w + t / 2):
        m.box((x, 0.03, 0), (t, 0.06, 2 * h), GOLD[1])
    flatten_back(m)


def build_curtain(m, v):
    """A heavy red stage curtain hanging down the wall in folds, a pelmet with a gold fringe over
    it, and a gold rope tying it back."""
    top, bottom, n = 0.82, -0.88, 9
    for k in range(n):
        x = -0.48 + 0.96 * k / (n - 1)
        bulge = 0.04 + 0.03 * (k % 2)
        pull = 0.06 * math.sin(math.pi * k / (n - 1)) if v == 0 else 0.0
        pts = [(x - pull * (1 - (z - bottom) / (top - bottom)) * (1 if x < 0 else -1), bulge, z) for z in (top, 0.0, bottom)]
        m.tube(pts, [0.06, 0.068, 0.075], VELVET[k % 3], n=4)
    m.box((0, 0.06, top + 0.04), (1.0, 0.12, 0.18), VELVET[1])
    for k in range(7):
        x = -0.45 + 0.9 * k / 6
        m.box((x, 0.12, top - 0.07), (0.04, 0.02, 0.06), GOLD[k % 2])
    if v == 0:
        rope(m, Vector((-0.44, 0.13, -0.2)), Vector((0.44, 0.13, -0.2)), sag=0.1, r=0.018, color=GOLD[0])
    flatten_back(m)


def build_footlights(m, v):
    """A low brass trough along the stage's edge with three lamps glowing in it."""
    m.box((0, 0, 0.04), (0.82, 0.16, 0.08), BRASS)
    m.box((0, 0.06, 0.1), (0.82, 0.04, 0.08), "#8a6a2a")
    start = len(m.faces)
    for x in (-0.28, 0.0, 0.28):
        m.blob(Vector((x, -0.01, 0.11)), (0.05, 0.05, 0.045), BULB, n=5, jitter=0)
    lit(m, start)


def build_spotlight(m, v):
    """A stage lamp on a tripod, its round lamp tilted towards the stage, lit."""
    top = Vector((0, 0, 0.95))
    for k in range(3):
        a = TAU * k / 3 + 0.3
        m.tube([Vector(polar(0.24, a, 0)), top + Vector((0, 0, -0.1))], 0.016, LAMP, n=4)
    m.tube([top + Vector((0, 0, -0.12)), top], 0.02, LAMP, n=4)
    start_lamp = len(m.vertices)
    m.lathe(Vector((0, 0, 0)), [(-0.14, 0.06), (-0.12, 0.1), (0.08, 0.12), (0.1, 0.13)], LAMP, n=9, jitter=0)
    xform(m, start_lamp, rot=(math.radians(60), 0, 0), offset=top + Vector((0, 0, 0.08)))
    start = len(m.faces)
    s0 = len(m.vertices)
    m.lathe(Vector((0, 0, 0)), [(0.1, 0.11), (0.105, 0.0)], BULB, n=9, jitter=0)
    xform(m, s0, rot=(math.radians(60), 0, 0), offset=top + Vector((0, 0, 0.08)))
    lit(m, start)


def build_statue(m, v):
    """A marble statue on a low plinth: a dancer swinging long ribbons (v 0), or a figure holding a
    horned mask up before its face (v 1)."""
    h = plinth(m, 0.3, w=0.4)
    base = Vector((0, 0, h))
    m.tube([base + Vector((-0.05, 0, 0)), base + Vector((-0.04, 0, 0.32))], [0.04, 0.035], MARBLE[0], n=5)
    m.tube([base + Vector((0.05, 0, 0)), base + Vector((0.07, 0, 0.32))], [0.04, 0.035], MARBLE[0], n=5)
    m.lathe(base + Vector((0, 0, 0.3)), [(0, 0.12), (0.1, 0.1), (0.3, 0.09), (0.36, 0.05)], MARBLE[2], n=8, jitter=0.03)
    head = base + Vector((0, 0, 0.75))
    m.blob(head, (0.075, 0.075, 0.09), MARBLE[0], n=6, jitter=0.02)
    if v == 0:
        for s in (-1, 1):
            hand = base + Vector((s * 0.3, 0, 0.82))
            m.tube([base + Vector((s * 0.09, 0, 0.62)), hand], 0.03, MARBLE[1], n=4)
            pts = [hand + Vector((s * (0.04 + 0.06 * k), 0.06 * math.sin(k * 1.4), -0.08 * k + 0.05 * math.sin(k))) for k in range(7)]
            m.tube(pts, 0.016, MARBLE[0], n=4)
    else:
        for s in (-1, 1):
            m.tube([base + Vector((s * 0.09, 0, 0.62)), base + Vector((s * 0.05, -0.14, 0.72))], 0.03, MARBLE[1], n=4)
        little_mask(m, head + Vector((0, -0.12, 0.0)), 0.8)


def build_plaque(m, v):
    """A little sign on a stand, telling what is on show."""
    m.tube([(0, 0, 0), (0, 0, 0.36)], 0.015, BRASS, n=4)
    m.lathe((0, 0, 0), [(0, 0.08), (0.02, 0.06), (0.025, 0)], BRASS, n=7, jitter=0)
    start = len(m.vertices)
    m.box((0, 0, 0), (0.24, 0.02, 0.16), "#2a2420")
    m.box((0, -0.012, 0), (0.2, 0.005, 0.12), "#e6dcc0")
    for k in range(3):
        m.box((-0.02 + 0.02 * (k % 2), -0.016, 0.03 - 0.03 * k), (0.14 - 0.03 * k, 0.003, 0.012), INK)
    xform(m, start, rot=(math.radians(-30), 0, 0), offset=(0, 0, 0.42))
