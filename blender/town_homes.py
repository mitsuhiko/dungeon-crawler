"""The town's homes and what stands round them: cottages, a townhouse, a barn and a shed for the
people of the town, and the yards' and the street's things (fences, garden beds, a washing line,
market stalls, a trough, beehives, a chicken coop, a planter, a scarecrow), in game-cell units
(character about 1.1 tall). world/town.js lines its streets and lanes with them, seeded.

Blender -b --python blender/town_homes.py -- [output-directory]

Writes assets/town_homes.glb, blender/town_homes.blend and
blender/previews/town_homes-preview.png (an explicit directory receives all three: scratch
builds). MCP: import town_homes; town_homes.main()

Same palette, vertex-colour material and conventions as town.py: one mesh per prop, Z up, fronts
facing -Y (glTF +Z: a home's door), the origin at the middle of its foot. A home's lantern is its
"_glow" material, its windows' panes the "_window" one (lit at night only, render/night.js). The
homes have no inside: their doors stay shut.
"""
import math
from pathlib import Path
import random
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import props
import town
from town import (WOOD, TIMBER, EDGE, CREAM, STONE, STONE_DARK, IRON, HAY, DARK, GLOW, ROOF_RED, ROOF_BLUE,
                  ROOF_GREEN, beam, crate, barrel, pot, solid, house, door, window, lantern, fence, move_part, roof,
                  foundation, gable)

BLOOMS = ['#e7cf7d', '#dca184', '#c97a9a', '#f0ede0', '#9fb6e0']
LEAF = '#659449'
SOIL = '#5a4331'
CLOTH = ['#c9b48a', '#8fa3b8', '#b77a6a', '#e3d8bd', '#7f9367']


def chimney(m, x, y, base, top):
    m.box((x, y, (base + top) / 2), (.36, .36, top - base), STONE_DARK)
    for z in (top - .5, top - .2):
        m.box((x - .02, y - .185, z), (.26, .05, .14), STONE)
    m.box((x, y, top + .06), (.48, .48, .12), STONE)
    m.box((x, y, top + .125), (.26, .26, .018), DARK)


def turned(m, fn, at, yaw):
    """fn(m) built at the origin facing -Y, then moved to `at` and turned by yaw."""
    start = len(m.vertices)
    fn(m)
    move_part(m, start, at, yaw)


def side_windows(m, w, y, z, size=(.48, .52)):
    for s in (-1, 1):
        turned(m, lambda m: window(m, 0, 0, z, *size), (s * w / 2, y, 0), s * math.pi / 2)


def turn_all(m, yaw):
    move_part(m, 0, (0, 0, 0), yaw)


def build_cottage_a(m, v):
    # a timber cottage, its gable to the street, a flower box under the window
    w, d, eave, ridge = 2.3, 2.1, 2.0, 3.05
    house(m, w, d, eave, ridge, ROOF_RED)
    front = -d / 2
    door(m, -.45, front, w=.66, h=1.3)
    window(m, .55, front, 1.18, .5, .55, flower=True)
    for i, c in enumerate(BLOOMS[:3]):
        m.blob((.4 + i * .15, front - .25, .82), (.07, .06, .06), c, n=5)
    window(m, 0, front, 2.45, .38, .38)
    side_windows(m, w, .1, 1.2)
    chimney(m, .62, .55, 2.2, 3.35)
    lantern(m, (-.95, front - .14, 1.32), .6)
    barrel(m, (w / 2 + .25, .55, 0), .2, .5)


def build_cottage_b(m, v):
    # a stone cottage, its eaves to the street, two windows and a chimney at its end
    w, d, eave, ridge = 2.9, 2.0, 1.75, 2.85
    house(m, d, w, eave, ridge, ROOF_BLUE, '#b3ab9b')
    turn_all(m, math.pi / 2)
    front = -d / 2
    # stones showing through the plaster
    rng = random.Random(311)
    for _ in range(14):
        m.box((rng.uniform(-w / 2 + .2, w / 2 - .2), front - .015, rng.uniform(.4, eave - .2)), (rng.uniform(.18, .3), .03, rng.uniform(.1, .16)), STONE)
    door(m, 0, front, w=.7, h=1.3)
    for x in (-.85, .85):
        window(m, x, front, 1.15, .5, .52, flower=True)
        for i, c in enumerate(BLOOMS[1:4]):
            m.blob((x - .15 + i * .15, front - .25, .79), (.065, .06, .06), c, n=5)
    chimney(m, w / 2 - .3, .25, 1.6, 3.2)
    lantern(m, (.55, front - .14, 1.3), .6)
    crate(m, (-w / 2 - .3, .3, .22), .42)


def build_cottage_c(m, v):
    # a tall narrow townhouse, its upper storey jutting out over the street
    w, d, eave, ridge = 2.0, 2.3, 3.1, 4.1
    house(m, w, d, eave, ridge, ROOF_GREEN, '#e6d6b3')
    front = -d / 2
    m.box((0, front - .06, 1.92), (w + .15, .2, .2), TIMBER)
    for x in (-.9, .9):
        beam(m, (x, front - .07, 1.95), (x, front - .07, eave), .1)
    beam(m, (-.9, front - .08, 2.0), (-.3, front - .08, 2.7), .08)
    door(m, -.4, front, w=.62, h=1.3)
    window(m, .48, front, 1.15, .46, .55)
    for x in (-.45, .45):
        window(m, x, front, 2.55, .44, .55, flower=True)
    window(m, 0, front, 3.5, .34, .34)
    side_windows(m, w, .3, 2.55, (.4, .5))
    chimney(m, -.55, .7, 3.0, 4.45)
    lantern(m, (-.85, front - .14, 1.3), .6)
    pot(m, (.95, front - .3, 0), '#b8714e', 1.1)
    for j in range(3):
        m.blob((.95 + .05 * math.cos(j * 2.1), front - .3 + .05 * math.sin(j * 2.1), .36), (.07, .07, .08), LEAF, n=5)


def build_cottage_d(m, v):
    # a broad house, its eaves to the street, a porch with a bench over its door
    w, d, eave, ridge = 3.2, 2.2, 2.0, 3.15
    house(m, d, w, eave, ridge, ROOF_GREEN, '#d9c9a5')
    turn_all(m, math.pi / 2)
    front = -d / 2
    door(m, -.5, front, w=.68, h=1.32)
    for x in (.55, 1.15):
        window(m, x, front, 1.2, .44, .52)
    window(m, -1.2, front, 1.2, .42, .5, flower=True)
    # the porch: a little roof on two posts
    for i in range(4):
        xa, xb = -1.3 + i * .55, -1.3 + (i + 1) * .55
        solid(m, [(xa, front - .02, 1.78), (xb, front - .02, 1.78), (xb, front - .78, 1.55), (xa, front - .78, 1.55)],
              (0, 0, -.06), ROOF_GREEN[i % 3])
    for x in (-1.25, .85):
        beam(m, (x, front - .74, 0), (x, front - .74, 1.6), .1)
    m.box((.35, front - .42, .38), (.8, .3, .07), EDGE)
    for x in (.02, .68):
        m.box((x, front - .42, .18), (.07, .25, .36), TIMBER)
    lantern(m, (-.05, front - .2, 1.3), .6)
    chimney(m, -w / 2 + .45, .3, 1.8, 3.35)


def build_barn(m, v):
    # a plank barn, its big doors under the gable, hay showing in its loft
    w, d, eave, ridge = 2.9, 3.0, 2.0, 3.4
    foundation(m, w, d)
    m.box((0, 0, (eave + .2) / 2), (w, d, eave - .2), '#8a6440')
    gable(m, 0, 0, w, d, eave, ridge, '#8a6440')
    for i in range(12):
        x = -w / 2 + (i + .5) * w / 12
        m.box((x, -d / 2 - .02, eave / 2), (.03, .03, eave - .3), '#6b4c31')
    for xx in (-w / 2, w / 2):
        for yy in (-d / 2, d / 2):
            beam(m, (xx, yy, .18), (xx, yy, eave), .17)
    roof(m, 0, 0, w, d, eave, ridge, ROOF_RED, rows=4, columns=7)
    front = -d / 2
    for s in (-1, 1):
        m.box((s * .4, front - .06, .85), (.78, .08, 1.5), WOOD)
        beam(m, (s * .05, front - .12, .15), (s * .75, front - .12, 1.55), .07, EDGE)
        beam(m, (s * .75, front - .12, .15), (s * .05, front - .12, 1.55), .07, EDGE)
    m.box((0, front - .08, 1.66), (1.75, .1, .14), TIMBER)
    m.box((0, front - .04, 2.45), (.7, .06, .55), DARK)
    m.box((0, front - .06, 2.3), (.62, .1, .26), HAY, jitter=.02)
    lantern(m, (1.05, front - .15, 1.45), .65)
    for x in (-w / 2 - .45, -w / 2 - .45):
        m.box((x, -.6, .2), (.7, .44, .4), HAY, jitter=.02)
    m.box((-w / 2 - .45, .2, .2), (.7, .44, .4), HAY, jitter=.02)
    m.box((-w / 2 - .4, -.2, .6), (.7, .44, .4), HAY, jitter=.02)


def build_shed(m, v):
    # a lean-to shed, open in front, firewood stacked in it, tools by its side
    w, d, hi, lo = 1.8, 1.25, 1.7, 1.25
    m.box((0, d / 2, hi / 2), (w, .08, hi), WOOD)
    for s in (-1, 1):
        solid(m, [(s * w / 2, -d / 2, 0), (s * w / 2, d / 2, 0), (s * w / 2, d / 2, hi), (s * w / 2, -d / 2, lo)], (s * -.08, 0, 0), WOOD)
    for i in range(4):
        xa, xb = -w / 2 - .15 + i * (w + .3) / 4, -w / 2 - .15 + (i + 1) * (w + .3) / 4
        solid(m, [(xa, -d / 2 - .2, lo), (xb, -d / 2 - .2, lo), (xb, d / 2 + .1, hi + .05), (xa, d / 2 + .1, hi + .05)],
              (0, 0, -.06), ROOF_RED[i % 3])
    for x in (-w / 2, w / 2):
        beam(m, (x, -d / 2, 0), (x, -d / 2, lo), .1)
    for row, (n, z) in enumerate(((5, .1), (4, .28), (4, .45), (3, .62))):
        for i in range(n):
            x = (i - (n - 1) / 2) * .3
            m.lathe((x, .1, z), [(-.4, .09), (.4, .09)], '#8a6a48', n=6, jitter=.08, axis=(0, 1, 0), phase=row + i)
            m.lathe((x, -.3, z), [(0, .07), (.01, .07)], '#d8bf94', n=6, jitter=0, axis=(0, 1, 0))
    beam(m, (w / 2 + .1, -.2, 0), (w / 2 + .14, -.25, 1.0), .035, WOOD)
    m.box((w / 2 + .14, -.25, .08), (.2, .04, .14), IRON)
    m.lathe((-w / 2 - .3, -.2, 0), [(0, .2), (.32, .19)], '#8a6a48', n=8, jitter=.04)
    m.lathe((-w / 2 - .3, -.2, .32), [(0, .18), (.01, .18)], '#d8bf94', n=8, jitter=0)


def build_fence(m, v):
    # two cells of fence along X; the second has a little gate in its middle
    if v == 0:
        fence(m, (-1, 0, 0), (1, 0, 0), posts=4, height=.72)
    else:
        fence(m, (-1, 0, 0), (-.35, 0, 0), posts=2, height=.72)
        fence(m, (.35, 0, 0), (1, 0, 0), posts=2, height=.72)
        for x in (-.28, -.1, .1, .28):
            m.box((x, .02, .36), (.11, .05, .6), '#a98a5c')
        for z in (.18, .55):
            m.box((0, .0, z), (.66, .06, .07), EDGE)
        beam(m, (-.3, -.01, .15), (.3, -.01, .58), .05, EDGE)


def build_garden_bed(m, v):
    # a bed of vegetables (or of flowers) in a frame of planks
    w, d = 1.5, .95
    m.box((0, 0, .07), (w, d, .14), SOIL)
    for s in (-1, 1):
        m.box((0, s * d / 2, .09), (w + .06, .06, .18), WOOD)
        m.box((s * w / 2, 0, .09), (.06, d, .18), WOOD)
    for row in range(3):
        y = (row - 1) * .28
        for i in range(5):
            x = (i - 2) * .27
            if v == 0:
                if row == 1:
                    for j in range(3):
                        m.leaf((x, y, .14), (x + .05 * (j - 1), y + .03, .36), .035, '#7aa354')
                    m.blob((x, y, .16), (.04, .04, .03), '#d9813f', n=5)
                else:
                    m.blob((x, y, .22), (.11, .11, .09), '#87ad62' if (i + row) % 2 else '#6f9a52', n=6)
            else:
                m.blob((x, y, .2), (.09, .09, .07), LEAF, n=5)
                for j in range(2):
                    m.blob((x + .04 * (j - .5), y + .03, .31), (.05, .05, .04), BLOOMS[(i + row + j) % len(BLOOMS)], n=5)


def build_laundry_line(m, v):
    # two posts, a line between them, the wash hanging out to dry
    for s in (-1, 1):
        beam(m, (s * 1.0, 0, 0), (s * 1.0, 0, 1.55), .08, TIMBER)
        beam(m, (s * 1.0, -.15, 1.5), (s * 1.0, .15, 1.5), .06, TIMBER)
    pts = [(-1 + 2 * i / 8, 0, 1.48 - .12 * math.sin(math.pi * i / 8)) for i in range(9)]
    m.tube(pts, .012, '#e8e0c8', n=4)
    rng = random.Random(77)
    for i, x in enumerate((-.62, -.2, .22, .6)):
        z = 1.48 - .12 * math.sin(math.pi * (x + 1) / 2)
        w, h = rng.uniform(.26, .4), rng.uniform(.3, .5)
        m.box((x, 0, z - h / 2), (w, .025, h), CLOTH[i % len(CLOTH)], jitter=.01)
        m.box((x - w / 2 + .03, 0, z + .01), (.025, .05, .05), WOOD)
    if v == 1:
        m.lathe((.0, -.3, 0), [(0, .2), (.18, .25), (.2, .26)], WOOD, n=10, jitter=.02)
        m.blob((0, -.3, .22), (.18, .18, .06), CLOTH[3], n=6)


def build_market_stall(m, v):
    # a table under a striped awning, things to sell on it
    w, d = 1.5, .8
    accent = ['#b78e49', '#7b8a62'][v]
    m.box((0, 0, .7), (w, d, .07), EDGE)
    m.box((0, -d / 2 + .03, .45), (w, .05, .45), WOOD)
    for x in (-w / 2 + .06, w / 2 - .06):
        for y in (-d / 2 + .06, d / 2 - .06):
            beam(m, (x, y, 0), (x, y, .7), .07, TIMBER)
        beam(m, (x, d / 2 - .06, .7), (x, d / 2 - .06, 1.85), .07, TIMBER)
        beam(m, (x, -d / 2 - .25, .7), (x, -d / 2 - .25, 1.55), .06, TIMBER)
    for i in range(6):
        xa, xb = -w / 2 - .1 + i * (w + .2) / 6, -w / 2 - .1 + (i + 1) * (w + .2) / 6
        solid(m, [(xa, -d / 2 - .4, 1.55), (xb, -d / 2 - .4, 1.55), (xb, d / 2, 1.85), (xa, d / 2, 1.85)], (0, 0, -.03),
              accent if i % 2 else CREAM)
    if v == 0:
        for i in range(4):
            x = -.55 + i * .37
            m.box((x, -.05, .82), (.3, .3, .12), WOOD)
            for j in range(3):
                m.blob((x + (j - 1) * .08, -.05 + (j % 2) * .06, .94), (.06, .06, .05), ['#c9583e', '#e3b14b', '#8fb35a', '#d9813f'][i], n=5)
    else:
        for i in range(3):
            m.lathe((-.5 + i * .5, 0, .74), [(0, .07), (.32, .07)], CLOTH[i + 1], n=8, jitter=0, axis=(0, 1, 0))
        for x in (-.3, .25):
            m.blob((x, .2, .82), (.14, .1, .07), '#c99a5a', n=6)
    crate(m, (w / 2 + .3, .15, .2), .38)
    m.box((-w / 2 - .25, .1, .18), (.3, .3, .36), HAY, jitter=.02)


def build_trough(m, v):
    m.box((0, 0, .32), (1.2, .5, .42), WOOD)
    m.box((0, 0, .5), (1.06, .36, .04), '#638585')
    for x in (-.5, .5):
        m.box((x, 0, .08), (.1, .56, .16), TIMBER)
    for x in (-.25, .25):
        m.box((x, -.26, .32), (.05, .03, .4), EDGE)
    pot(m, (.8, .1, 0), WOOD, 1.3)


def build_beehives(m, v):
    m.box((0, 0, .38), (1.4, .5, .07), EDGE)
    for x in (-.6, .6):
        m.box((x, 0, .18), (.08, .4, .36), TIMBER)
    for i, x in enumerate((-.45, 0, .45)):
        m.lathe((x, 0, .42), [(0, .2), (.12, .21), (.26, .17), (.36, .1), (.42, 0)], '#d0a64e', n=10, jitter=.02,
                colors=['#c49a46', '#d6ae58'])
        m.box((x, -.19, .47), (.07, .04, .05), DARK)
    for i in range(5):
        m.blob((-.3 + i * .17, -.35, .75 + .08 * (i % 2)), (.025, .02, .02), '#2c2620', n=4, jitter=0)


def build_chicken_coop(m, v):
    w, d = 1.1, .8
    for x in (-w / 2 + .05, w / 2 - .05):
        for y in (-d / 2 + .05, d / 2 - .05):
            beam(m, (x, y, 0), (x, y, .45), .07, TIMBER)
    m.box((0, 0, .75), (w, d, .6), '#a5794d')
    for s in (-1, 1):
        solid(m, [(-w / 2 - .1, 0, 1.25), (w / 2 + .1, 0, 1.25), (w / 2 + .1, s * (d / 2 + .12), 1.0), (-w / 2 - .1, s * (d / 2 + .12), 1.0)],
              (0, 0, -.05), ROOF_RED[0 if s > 0 else 2])
    solid(m, [(-w / 2, -d / 2, 1.05), (w / 2, -d / 2, 1.05), (0, -d / 2, 1.24)], (0, d, 0), '#a5794d')
    m.box((.2, -d / 2 - .01, .62), (.22, .03, .26), DARK)
    beam(m, (.2, -d / 2 - .05, .5), (.35, -d / 2 - .45, 0), .09, WOOD)
    for x, y, c in ((-.4, -.7, '#f1ebdc'), (.05, -.85, '#b67a46'), (-.75, -.25, '#f1ebdc')):
        m.blob((x, y, .16), (.1, .14, .1), c, n=6)
        m.blob((x, y - .12, .27), (.06, .06, .06), c, n=5)
        m.blob((x, y - .16, .33), (.025, .03, .03), '#c9443a', n=4, jitter=0)
        m.blob((x, y - .19, .26), (.02, .03, .015), '#e3b14b', n=4, jitter=0)


def build_planter(m, v):
    m.box((0, 0, .2), (1.2, .4, .4), '#8a6a48')
    m.box((0, 0, .41), (1.26, .46, .05), EDGE)
    m.box((0, 0, .4), (1.1, .3, .02), SOIL)
    for i in range(6):
        x = -.5 + i * .2
        m.blob((x, 0, .52), (.1, .1, .09), LEAF, n=5)
        m.blob((x + .04, .03, .62), (.05, .05, .04), BLOOMS[(i + v) % len(BLOOMS)], n=5)


def build_scarecrow(m, v):
    beam(m, (0, 0, 0), (0, 0, 1.6), .08, TIMBER)
    beam(m, (-.55, 0, 1.15), (.55, 0, 1.15), .06, TIMBER)
    m.box((0, 0, 1.05), (.42, .2, .45), '#7f9367', jitter=.02)
    for s in (-1, 1):
        m.box((s * .34, 0, 1.12), (.32, .14, .14), '#7f9367')
        m.leaf((s * .52, 0, 1.12), (s * .66, 0, 1.0), .05, HAY)
    m.blob((0, 0, 1.45), (.15, .14, .16), '#d2bd8f', n=6)
    m.lathe((0, 0, 1.55), [(0, .28), (.04, .28), (.05, .12), (.22, .1), (.26, 0)], '#8a6440', n=8, jitter=.05)
    m.leaf((0, -.08, .85), (0, -.12, .6), .06, HAY)


# (name, builder, variant, hints)
# The water wheel's size, and how high the mill's axle is over its floor (world/town.js puts the wheel
# beside the mill, in the river, its hub on the axle: its foot a little under the water's surface,
# the river a level under the bank; render/props.js turns it about its hub, `spin`)
WHEEL_R, WHEEL_W, AXLE = 1.05, .44, .45


def build_watermill(m, v):
    # a mill by the river: a stone storey, a timber one over it, the wheel's axle out of its +X
    # side (the wheel itself is town_waterwheel_a, turning), sacks of flour by its door
    w, d, eave, ridge = 2.3, 2.1, 2.25, 3.45
    house(m, w, d, eave, ridge, ROOF_RED, '#d8c8a2')
    front = -d / 2
    rng = random.Random(907)
    # the stone storey: blocks over the plaster to a band at a metre
    for side, (x0, x1, y) in enumerate(((-w / 2, w / 2, front - .02), (-w / 2, w / 2, d / 2 + .02))):
        for row in range(4):
            x = x0 + (.1 if row % 2 else 0)
            while x < x1 - .1:
                bw = rng.uniform(.28, .44)
                m.box((min(x + bw / 2, x1 - .1), y, .32 + row * .2), (min(bw, x1 - x) - .02, .05, .18), rng.choice([STONE, '#a3a199', '#8a8984']))
                x += bw
    for x in (-w / 2 - .02, w / 2 + .02):
        for row in range(4):
            for k in range(4):
                m.box((x, -d / 2 + .3 + k * .5 + (.12 if row % 2 else 0), .32 + row * .2), (.05, .44, .18), rng.choice([STONE, '#a3a199', '#8a8984']))
    m.box((0, 0, 1.12), (w + .12, d + .12, .1), TIMBER)
    door(m, -.45, front, w=.7, h=1.3)
    window(m, .55, front, 1.6, .46, .5)
    window(m, -.4, front, 2.7, .36, .36)
    side_windows(m, w, -.3, 1.65, (.42, .48))
    chimney(m, -.6, .6, 2.4, 3.7)
    lantern(m, (-1.0, front - .14, 1.35), .6)
    # the axle out of its side, on a timber bearing, at the wheel's hub
    hub = AXLE
    m.box((w / 2 + .12, 0, hub), (.24, .5, .4), TIMBER)
    m.lathe((w / 2, 0, hub), [(0, .09), (.62, .09)], IRON, n=8, jitter=0, axis=(1, 0, 0))
    # flour sacks and a millstone leaning on the wall
    for i, (x, y) in enumerate(((.35, front - .35), (.62, front - .3), (.5, front - .55))):
        m.blob((x, y, .2 + (i == 2) * .18), (.17, .14, .2), '#e6dcc4', n=6)
    m.lathe((-w / 2 - .12, -.3, .42), [(-.08, .42), (.08, .42)], '#9d978b', n=10, jitter=.02, axis=(1, 0, 0))


def build_waterwheel(m, v):
    # the mill's wheel: two rims on spokes round an iron hub, paddles between them; its foot at the
    # origin, its hub WHEEL_R over it, its axle along X
    R, W, n = WHEEL_R, WHEEL_W, 16
    hub = (0, 0, R)
    at = lambda x, a, r: (x, r * math.cos(a), R + r * math.sin(a))
    for x in (-W / 2, W / 2):
        for k in range(n):
            a, b = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
            beam(m, at(x, a, R - .05), at(x, b, R - .05), .08, WOOD)
            beam(m, at(x, a, R - .32), at(x, b, R - .32), .06, TIMBER)
        for k in range(8):
            a = 2 * math.pi * (k + .5) / 8
            beam(m, at(x, a, .1), at(x, a, R - .32), .07, TIMBER)
    for k in range(n):
        a = 2 * math.pi * k / n
        # a paddle: a plank from the inner rim out past the outer one, across the wheel
        c, s = math.cos(a), math.sin(a)
        r0, r1 = R - .34, R + .02
        solid(m, [(-W / 2 - .02, r0 * c - .03 * s, R + r0 * s + .03 * c), (W / 2 + .02, r0 * c - .03 * s, R + r0 * s + .03 * c),
                  (W / 2 + .02, r1 * c - .03 * s, R + r1 * s + .03 * c), (-W / 2 - .02, r1 * c - .03 * s, R + r1 * s + .03 * c)],
              (0, .06 * s, -.06 * c), EDGE if k % 2 else WOOD)
    m.lathe((-W / 2 - .12, 0, R), [(0, .14), (W + .24, .14)], IRON, n=8, jitter=0, axis=(1, 0, 0))


SPECS = [
    ('town_cottage_a', build_cottage_a, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_cottage_b', build_cottage_b, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_cottage_c', build_cottage_c, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_cottage_d', build_cottage_d, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_barn_a', build_barn, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_shed_a', build_shed, 0, {'blocking': True}),
    ('town_fence_a', build_fence, 0, {'blocking': True}),
    ('town_fence_b', build_fence, 1, {'blocking': True}),
    ('town_garden_bed_a', build_garden_bed, 0, {}),
    ('town_garden_bed_b', build_garden_bed, 1, {}),
    ('town_laundry_line_a', build_laundry_line, 0, {}),
    ('town_laundry_line_b', build_laundry_line, 1, {}),
    ('town_market_stall_a', build_market_stall, 0, {'blocking': True}),
    ('town_market_stall_b', build_market_stall, 1, {'blocking': True}),
    ('town_trough_a', build_trough, 0, {'blocking': True}),
    ('town_beehives_a', build_beehives, 0, {'blocking': True}),
    ('town_chicken_coop_a', build_chicken_coop, 0, {'blocking': True}),
    ('town_planter_a', build_planter, 0, {}),
    ('town_planter_b', build_planter, 1, {}),
    ('town_scarecrow_a', build_scarecrow, 0, {}),
    ('town_watermill_a', build_watermill, 0, {'blocking': True, 'light': GLOW, 'intensity': .6}),
    ('town_waterwheel_a', build_waterwheel, 0, {}),
]


def build(scene=None):
    scene = scene or bpy.context.scene
    collection = bpy.data.collections.get('TownHomes') or bpy.data.collections.new('TownHomes')
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    objects = []
    for i, (name, builder, variant, hints) in enumerate(SPECS):
        m = props.Mesh(random.Random(9700 + i))
        builder(m, variant)
        obj = props.finish(m, name, 'ground', {'max_radius': None, 'blocking': False, **hints}, collection)
        obj['cube_crawler_town_home'] = name.startswith(('town_cottage', 'town_barn'))
        if name == 'town_waterwheel_a':
            # (it turns about its hub: render/props.js; how high its hub is, how fast, radians a second)
            obj['spin'] = WHEEL_R
            obj['spin_rate'] = -.7
        objects.append(obj)
    return objects


def validate(objects):
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        lo = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
        assert abs(lo[2]) < 1e-6, (obj.name, lo)
        assert not mesh.uv_layers and not any(p.use_smooth for p in mesh.polygons), obj.name
        assert 60 <= len(mesh.loop_triangles) <= 6000, (obj.name, len(mesh.loop_triangles))
        assert ('light' in obj) == (len(mesh.materials) >= 2), obj.name
        if len(mesh.materials) == 3:
            assert mesh.materials[2].name == obj.name + '_window', obj.name


def main(directory=None, render=True):
    directory, blends, previews = props.output_dirs(directory)
    scene = bpy.data.scenes.new('TownHomesPreview')
    if bpy.context.window:
        bpy.context.window.scene = scene
    objects = build(scene)
    validate(objects)
    props.export_gltf(objects, Path(directory) / 'town_homes.glb')
    for i, obj in enumerate(objects):
        big = i < 6
        obj.location = ((i % 6) * 4.2, 0, 0) if big else (((i - 6) % 7) * 2.8, 4.4 + ((i - 6) // 7) * 2.6, 0)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(8, 4, -.02))
    floor = bpy.context.object
    floor.name = 'TownHomesFloor_NOT_EXPORTED'
    floor.data.materials.append(town.plain_material('TownHomesGround', '#c3c4b0'))
    camera = bpy.data.objects.new('TownHomesCamera', bpy.data.cameras.new('TownHomesCamera'))
    scene.collection.objects.link(camera)
    camera.location = (24, -16, 17)
    town.aim(camera, (10, 4, .8))
    camera.data.type, camera.data.ortho_scale = 'ORTHO', 26
    scene.camera = camera
    for name, position, energy in [('Key', (-2, -10, 16), 2600), ('Fill', (18, 6, 12), 1500)]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        scene.collection.objects.link(light)
        light.location, light.data.energy, light.data.size = position, energy, 10
        town.aim(light, (10, 4, 0))
    world = bpy.data.worlds.new('TownHomesWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    scene.world = world
    scene.render.engine, scene.cycles.samples = 'CYCLES', 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1000, 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(Path(previews) / 'town_homes-preview.png')
    if bpy.app.background:
        for other in list(bpy.data.scenes):
            if other != scene and not other.objects:
                bpy.data.scenes.remove(other)
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(blends) / 'town_homes.blend'))
    else:
        bpy.data.libraries.write(str(Path(blends) / 'town_homes.blend'), {scene}, fake_user=True)
    if render:
        bpy.ops.render.render(write_still=True)
    return [{'name': o.name, 'triangles': len(o.data.polygons)} for o in objects]


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    print(main(args[0] if args else None))
