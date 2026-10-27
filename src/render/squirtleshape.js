// The Squirtle's shape (render/squirtleview.js draws it, a body of fluid: render/fluidbody.js):
// the kids' sketch seen from the side, as soft tubes and balls along a curve, posed by a few
// numbers (`p`): open (the mouth, 0..1), lean (its top forward, rad), squash (< 1 lower and
// wider), stretch (longer: the leap), puddle (0 a wave .. 1 flat on the floor), sink (0 up .. 1
// under its fluid), sway and slosh (its crest wagging and lagging, cells), size (the kind's, times
// how small it is on land). No three.js: tools/squirtle-shape.mjs looks at it too.
// The sketch's units (`f` forward from the back of its rear, MID its middle, `h` up), times SIZE
// (and the kind's size) to cells.
export const SIZE = 2.7, MID = 0.36, WIDE = 2;
// the curve: [f, h, radius] per part: back (the rear and the arch), head (the crest and the snout),
// throat (down from under the head), jaw (forward under the mouth), chest (down to the floor).
// The back and the head melt into one, the throat, the jaw and the chest into another, and the
// two only join (GROUP: their parts' groups): so the mouth between the snout and the jaw stays open.
const CURVE = {
  back: [[0.07, 0, 0.12], [0.11, 0.16, 0.104], [0.2, 0.33, 0.096], [0.33, 0.44, 0.092], [0.47, 0.48, 0.09]],
  head: [[0.47, 0.48, 0.095], [0.58, 0.505, 0.1], [0.66, 0.495, 0.075], [0.73, 0.47, 0.04]],
  throat: [[0.52, 0.44, 0.07], [0.54, 0.37, 0.062], [0.53, 0.3, 0.06]],
  jaw: [[0.53, 0.3, 0.06], [0.61, 0.27, 0.05], [0.69, 0.28, 0.038], [0.73, 0.315, 0.022]],
  chest: [[0.53, 0.3, 0.06], [0.52, 0.18, 0.066], [0.55, 0.04, 0.075]],
};
const GROUP = { back: 0, head: 0, throat: 1, jaw: 1, chest: 1 };
const FEET = [[0.06, 0.0, 0.14, 0], [0.56, 0.0, 0.12, 1]];   // balls, cut by the floor: where it meets its fluid
const NECK = [0.47, 0.48], HINGE = [0.53, 0.3];      // the head tips up about the one, the jaw drops about the other
// [f, h, across (squeezed: times WIDE)]: the white, the pupil, on the head's flanks
export const EYES = [[0.63, 0.545, 0.072], [0.655, 0.548, 0.082]];
export const MOUTH = [0.68, 0.37], CREST = 0.585;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// the blobs of the shape, posed, in the group's frame (x across, y up, z forward; cells)
export function shape(p) {
  const S = SIZE * p.size, blobs = [], sl = p.slosh, sway = p.sway;
  const place = (f, h, part) => {
    // the head tips up and the jaw drops, opening the mouth
    if (part === 'head' || part === 'jaw') {
      const [cf, ch] = part === 'head' ? NECK : HINGE, a = part === 'head' ? p.open * 0.28 : -p.open * 0.55;
      const df = f - cf, dh = h - ch, c = Math.cos(a), s = Math.sin(a);
      f = cf + df * c - dh * s; h = ch + df * s + dh * c;
    }
    // its top leans forward (or back) about its rear foot, the more the higher
    const k = clamp(h / 0.5, 0, 1.3), th = p.lean * k, c = Math.cos(th), s = Math.sin(th), df = f - 0.07;
    f = 0.07 + df * c + h * s; h = -df * s + h * c;
    h *= p.squash * (1 - p.puddle);
    f = MID + (f - MID) * p.stretch / Math.sqrt(p.squash);
    const still = 1 - p.puddle;
    return [(sway * k * S + sl.x * k * k) * still, h * S - p.sink * 0.62 * S, (f - MID) * S + sl.z * k * k * still];
  };
  const shrink = 1 - 0.8 * p.puddle;
  // (a part's pieces join as they are, smooth already; a part melts into the others)
  let top = -Infinity;
  for (const [part, pts] of Object.entries(CURVE)) for (let i = 1; i < pts.length; i++) {
    const [fa, ha, ra] = pts[i - 1], [fb, hb, rb] = pts[i], a = place(fa, ha, part), b = place(fb, hb, part);
    blobs.push({ kind: 'tube', a, b, ra: ra * S * shrink, rb: rb * S * shrink, group: GROUP[part], ...i > 1 && { melt: 0.012 * S } });
    top = Math.max(top, a[1] + ra * S * shrink, b[1] + rb * S * shrink);
  }
  for (const [f, h, r, group] of FEET) blobs.push({ kind: 'ball', c: place(f, h, 'back'), r: r * S * shrink, group });
  // a puddle: a lens of it on the floor, as wide as it was long
  if (p.puddle > 0.02) {
    const R = 1.4 * S * 0.3, thick = 0.035 * S * p.puddle;
    blobs.push({ kind: 'ball', c: [0, thick - R, 0], r: R, melt: 0.08 * S });
  }
  return { S, blobs, place, top, floor: -p.sink * 0.62 * S - 0.001 };
}

// each vertex's colour (out: [r, g, b]): the inside of the mouth dark, foam on the crest, the snout,
// the jaw's tip and round its feet, else its body's (colors: { body, foam, mouth }, each { r, g, b })
export function paintOf(colors, sh, p) {
  const S = sh.S, m = sh.place(MOUTH[0], MOUTH[1], 'head'), mj = sh.place(MOUTH[0], MOUTH[1] - 0.04, 'jaw');
  const mx = 0, my = (m[1] + mj[1]) / 2, mz = (m[2] + mj[2]) / 2, mr = (0.06 + 0.05 * p.open) * S;
  const crest = sh.top - 0.04 * S, snout = sh.place(0.73, 0.47, 'head'), tip = sh.place(0.73, 0.315, 'jaw');
  const base = sh.floor + 0.025 * S, foamy = p.puddle < 0.5;
  const near = (q, x, y, z, r) => (q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2 < r * r;
  return (x, y, z, out) => {
    let c = colors.body;
    if (p.puddle < 0.6 && (x - mx) ** 2 + ((y - my) * 1.2) ** 2 + (z - mz) ** 2 < mr * mr && z < mz + 0.02 * S) c = colors.mouth;
    else if (foamy && (y > crest || y < base + 0.008 * S * Math.sin(x * 25 + z * 17) || near(snout, x, y, z, 0.045 * S) || near(tip, x, y, z, 0.035 * S))) c = colors.foam;
    out[0] = c.r; out[1] = c.g; out[2] = c.b;
  };
}

// the field to make its surface from, and the box to look in (cells, in its own frame)
export function fieldOf(sh, p, t) {
  const S = sh.S, R = 1.4 * S * 0.3;
  const s = { blobs: sh.blobs, wide: WIDE, melt: 0.06 * S, join: 0.012 * S, floor: sh.floor, ripple: 0.0015 * S, t };
  const box = [-0.19 * S * WIDE, sh.floor - 0.02, -0.6 * S * p.stretch, 0.19 * S * WIDE, 0.7 * S, 0.56 * S * p.stretch];
  if (p.puddle > 0.02) {
    const r = Math.sqrt(2 * R * 0.035 * S) + 0.1;
    box[0] = Math.min(box[0], -r); box[3] = Math.max(box[3], r); box[2] = Math.min(box[2], -r); box[5] = Math.max(box[5], r);
  }
  return { s, box };
}
// a pose at rest
export const restPose = (more = {}) => ({ open: 0, lean: 0, squash: 1, stretch: 1, puddle: 0, sink: 0, sway: 0, slosh: { x: 0, z: 0 }, size: 1, ...more });
