# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "numpy>=1.26"]
# ///
"""
An ink layer for the films (docs/film.md): a generated painting of white ink on black made into
what the game loads, assets/film/<name>.png. It goes grey (the ink's brightness is all the game
reads), its blacks are made black (the generators leave a faint grey ground, or a frame), it fades
out towards the picture's edges (so no stroke ends at a hard border), it is cut down to the ink
and a margin, and scaled to at most --size pixels on its longer side.

    uv run tools/inklayer.py <painting.png> <name> [--size 1024] [--black 0.06] [--margin 0.04]
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("name")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--black", type=float, default=0.06, help="this bright and below is black")
    ap.add_argument("--margin", type=float, default=0.04, help="kept round the ink, share of the longer side")
    ap.add_argument("--edge", type=float, default=0.06, help="the fade at the picture's edges, share of its sides")
    a = ap.parse_args()

    img = np.asarray(Image.open(a.src).convert("L"), dtype=np.float32) / 255.0
    h, w = img.shape
    # the ground to black, and what is above it stretched back to full range
    ink = np.clip((img - a.black) / (1.0 - a.black), 0.0, 1.0)
    # fade towards the edges of the painting
    ys = np.linspace(0, 1, h)[:, None]
    xs = np.linspace(0, 1, w)[None, :]
    ramp = lambda t: np.clip(np.minimum(t, 1 - t) / a.edge, 0, 1) ** 1.5
    ink *= ramp(xs) * ramp(ys)
    # cut down to the ink
    rows = np.where(ink.max(axis=1) > 0.02)[0]
    cols = np.where(ink.max(axis=0) > 0.02)[0]
    if not len(rows):
        raise SystemExit("no ink in it")
    m = int(a.margin * max(h, w))
    y0, y1 = max(0, rows[0] - m), min(h, rows[-1] + 1 + m)
    x0, x1 = max(0, cols[0] - m), min(w, cols[-1] + 1 + m)
    ink = ink[y0:y1, x0:x1]
    out = Image.fromarray((ink * 255 + 0.5).astype(np.uint8), "L")
    s = a.size / max(out.size)
    if s < 1:
        out = out.resize((round(out.width * s), round(out.height * s)), Image.LANCZOS)
    dest = ROOT / "assets" / "film" / f"{a.name}.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, optimize=True)
    print(f"{dest.relative_to(ROOT)}: {out.width}x{out.height}, {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
