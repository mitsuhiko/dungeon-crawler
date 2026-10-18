"""Bake the :ninjajavamc Easter-egg paint layer onto the existing SkinUV atlas.

Reference: the user's rotating gray-stone/cyan Minecraft skin with a grass/dirt cape.
Adapted as paint on Cube Crawler's existing rounded character (no replacement rig/cape).

  Blender -b blender/character.blend --python blender/skin_ninjajavamc.py

No scene, mesh, UV, animation or .blend file is changed. PNG encoding uses only stdlib;
colors are explicit sRGB bytes, with the same row orientation as the runtime painter.
"""
from pathlib import Path
import struct
import zlib
import bpy
import numpy as np

SIZE = 2048
UV_VERSION = "character-v1"


def paint(points):
    x, y, z = points.T
    cell = np.floor(points / .045).astype(np.int64)
    noise = (cell[:, 0] * 73856093) ^ (cell[:, 1] * 19349663) ^ (cell[:, 2] * 83492791)
    stone = np.array([[94, 108, 114], [103, 117, 123], [112, 126, 131], [99, 114, 120],
                      [87, 102, 109], [105, 119, 125], [95, 111, 118], [117, 130, 134]], np.uint8)
    cyan = np.array([[30, 180, 202], [37, 191, 211], [52, 202, 218], [27, 171, 194],
                     [67, 207, 220], [40, 186, 205], [47, 196, 214], [29, 177, 200]], np.uint8)
    # Pixel-stepped split down the face and torso, continuing over the head and feet.
    row = np.floor(z / .09).astype(np.int64)
    boundary = ((row * 7) % 5 - 2) * .012
    blue = x >= boundary
    colors = stone[noise % len(stone)]
    colors[blue] = cyan[noise[blue] % len(cyan)]
    # A dark-blue, pixel-stepped stripe separates the stone and cyan halves.
    navy = np.array([[12, 41, 72], [15, 48, 81], [17, 54, 88], [9, 36, 66]], np.uint8)
    middle = np.abs(x - boundary) < .026
    colors[middle] = navy[noise[middle] % len(navy)]

    # The stone-side eye is dark; the cyan-side eye is extremely pale ice blue.
    # Both are on the front (-Y in Blender), never wrapped onto the back.
    eyes = (np.abs(np.abs(x) - .105) < .032) & (z > 1.72) & (z < 1.81) & (y < -.16)
    colors[eyes & ~blue] = [12, 20, 24]
    colors[eyes & blue] = [231, 253, 255]

    # Paint the grass-block cape motif onto the torso's back. It cannot snag, clip
    # through weapons, or require a second skeleton because it is part of the texture.
    cape = (y > .065) & (np.abs(x) < .215) & (z > .72) & (z < 1.43)
    dirt = np.array([[102, 63, 33], [118, 74, 39], [133, 85, 46], [93, 55, 30],
                     [143, 98, 56], [113, 70, 37], [124, 82, 46], [151, 119, 78]], np.uint8)
    grass = np.array([[29, 112, 24], [40, 136, 30], [31, 123, 25], [53, 145, 35],
                      [24, 98, 20], [45, 132, 27], [62, 151, 39], [34, 117, 22]], np.uint8)
    colors[cape] = dirt[noise[cape] % len(dirt)]
    fringe = 1.23 - ((np.floor(x / .045).astype(np.int64) * 13) % 3) * .025
    green = cape & (z > fringe)
    colors[green] = grass[noise[green] % len(grass)]
    border = cape & ((np.abs(x) > .205) | (z < .735))
    colors[border] = [70, 46, 28]
    return colors


def bake(mesh):
    assert mesh.get("skin_uv_version") == UV_VERSION, "Unexpected SkinUV version"
    data = mesh.data
    data.calc_loop_triangles()
    uv_layer = data.uv_layers.active.data
    pixels = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    for triangle in data.loop_triangles:
        uv = np.array([uv_layer[i].uv[:] for i in triangle.loops], np.float64)
        # glTF exports v = 1 - Blender v. Bake that atlas, not the Blender image convention.
        uv[:, 1] = 1 - uv[:, 1]
        uv *= SIZE
        positions = np.array([data.vertices[i].co[:] for i in triangle.vertices], np.float64)
        low = np.maximum(0, np.floor(uv.min(axis=0)).astype(int))
        high = np.minimum(SIZE, np.ceil(uv.max(axis=0)).astype(int))
        if np.any(high <= low):
            continue
        xx, yy = np.meshgrid(np.arange(low[0], high[0]), np.arange(low[1], high[1]))
        qx, qy = xx.ravel() + .5, yy.ravel() + .5
        a, b, c = uv
        denominator = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
        wa = ((b[1]-c[1])*(qx-c[0]) + (c[0]-b[0])*(qy-c[1])) / denominator
        wb = ((c[1]-a[1])*(qx-c[0]) + (a[0]-c[0])*(qy-c[1])) / denominator
        wc = 1 - wa - wb
        inside = (wa >= -1e-8) & (wb >= -1e-8) & (wc >= -1e-8)
        points = wa[inside, None]*positions[0] + wb[inside, None]*positions[1] + wc[inside, None]*positions[2]
        px, py = xx.ravel()[inside], yy.ravel()[inside]
        pixels[py, px, :3] = paint(points)
        pixels[py, px, 3] = 255
    # Four texels of nearest-neighbour padding, strictly outside the original islands.
    for _ in range(4):
        before = pixels.copy()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            neighbour = np.roll(before, (dy, dx), axis=(0, 1))
            valid = (pixels[:, :, 3] == 0) & (neighbour[:, :, 3] != 0)
            if dx == 1: valid[:, 0] = False
            if dx == -1: valid[:, -1] = False
            if dy == 1: valid[0, :] = False
            if dy == -1: valid[-1, :] = False
            pixels[valid] = neighbour[valid]
    return pixels


def save_png(path, pixels):
    def chunk(kind, content):
        return struct.pack(">I", len(content)) + kind + content + struct.pack(">I", zlib.crc32(kind + content) & 0xffffffff)
    # PNG top row is WebGL v=1, exactly as linearPaintToPNG() exports user paintings.
    rows = b"".join(b"\0" + row.tobytes() for row in pixels[::-1])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"sRGB", b"\0")
    png += chunk(b"tEXt", b"SkinUV\0" + UV_VERSION.encode("ascii"))
    png += chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    print(f"Saved {path} ({len(png):,} bytes)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    save_png(root / "assets" / "skins" / "ninjajavamc.png", bake(bpy.data.objects["Character"]))
