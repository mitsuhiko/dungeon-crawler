// A long ribbon as a rope: Mansk's red ribbons in his third phase (game/mansk.js, drawn by
// render/manskview.js, docs/bosses.md "Mansk"). Pure rules, no three.js, so the tests run it.
//
// A ribbon is a chain of `segments` + 1 points, the first one tied to its anchor (the stump of a
// broken horn) and the second kept going out the way the stump points (`dir`), so it comes out of
// the horn rather than hanging off a pin. The rest is position-based dynamics (Verlet): every
// point keeps its velocity (what it moved in the last step), is pulled by what the caller says
// (`accel`: gravity, the air it is swung through, the swirl of the dance) and slowed by the air
// (`drag`); then, a few times over, the chain is pulled back together: each link to its length
// (it does not stretch), each point to the one two further on no closer than `bend` of two links
// (it bends, but does not fold up on itself), the points out of the spheres (his head) and over
// the floor (where they slide a little: `friction`). A target (`targets`: the ribbon reaching for
// the hero and wound round them while it squeezes) pulls its point towards it each time round.
//
// So the ribbons are not keyframed: they trail behind as he turns and flies, swing out as he
// spins, coil round what they hold and fall slack where he leaves them, like the ribbons of a
// gymnast. A ribbon `grow`s out of its stump (0 .. 1: how much of its length is out yet).
export const RIBBON = Object.freeze({
  segments: 24,         // links
  length: 4.8,          // cells, all of it out
  width: 0.2,           // cells across (drawn: render/manskview.js)
  iterations: 10,       // times round the constraints a step
  bend: 0.6,            // a point and the one two further on stay at least this share of two links apart
  stiff: 0.25,          // how hard that holds (0 .. 1 a time round)
  drag: 0.45,           // 1/s: how fast the air takes a point's speed away (little: they fly out as he spins)
  friction: 0.5,        // of its speed along the floor a point on it keeps a step
  step: 1 / 120,        // s: the fixed step it is run at
  maxSteps: 8,          // at most this many steps a frame (a long frame runs slower, not unstable)
  snap: 3,              // cells the anchor may jump in a step before the ribbon is laid out anew
  thick: 0.06,          // cells a point stays off the floor and out of a sphere
});

// a new ribbon at anchor a ({ x, y, z }), laid out straight along dir (a unit vector)
export function newRibbon(a, dir, spec = RIBBON, grow = 1) {
  const n = spec.segments + 1, p = new Float64Array(n * 3);
  const r = { spec, n, p, q: null, grow, acc: 0, anchor: { x: a.x, y: a.y, z: a.z }, dir: { ...dir } };
  layOut(r, a, dir);
  return r;
}
// lay ribbon r out straight from anchor a along dir, at rest
export function layOut(r, a, dir) {
  const len = linkLength(r);
  for (let i = 0; i < r.n; i++) {
    r.p[i * 3] = a.x + dir.x * len * i; r.p[i * 3 + 1] = a.y + dir.y * len * i; r.p[i * 3 + 2] = a.z + dir.z * len * i;
  }
  r.q = Float64Array.from(r.p);
  r.anchor = { x: a.x, y: a.y, z: a.z };
}
// how long one link is now (a ribbon still growing out has short ones)
export const linkLength = r => r.spec.length / r.spec.segments * Math.max(0.02, Math.min(1, r.grow));
// point i of ribbon r: { x, y, z }
export const pointOf = (r, i) => ({ x: r.p[i * 3], y: r.p[i * 3 + 1], z: r.p[i * 3 + 2] });
// how long the chain is now (the sum of its links)
export function chainLength(r) {
  let s = 0;
  for (let i = 1; i < r.n; i++) s += Math.hypot(r.p[i * 3] - r.p[i * 3 - 3], r.p[i * 3 + 1] - r.p[i * 3 - 2], r.p[i * 3 + 2] - r.p[i * 3 - 1]);
  return s;
}

// Run ribbon r on by dt s, in fixed steps. world: {
//   anchor: { x, y, z }   where its stump is now (moved smoothly over the steps from where it was)
//   dir: { x, y, z }      which way the stump points (unit)
//   accel(i, x, y, z, out)  the acceleration on point i (out: [ax, ay, az]); default: gravity 9.8 down
//   spheres: [{ x, y, z, r }]  what it may not go into
//   floor(x, z, y)        the floor's height under (x, z) near y (or -Infinity: none)
//   targets: [{ i, x, y, z, k }]  point i pulled towards (x, y, z), k of the way each time round
// }
export function stepRibbon(r, dt, world) {
  const s = r.spec, a1 = world.anchor;
  if (Math.hypot(a1.x - r.anchor.x, a1.y - r.anchor.y, a1.z - r.anchor.z) > s.snap) layOut(r, a1, world.dir ?? r.dir);
  r.acc = Math.min(r.acc + dt, s.step * s.maxSteps);
  const steps = Math.floor(r.acc / s.step + 1e-9);
  if (!steps) return 0;
  r.acc -= steps * s.step;
  const a0 = r.anchor;
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    step(r, { x: a0.x + (a1.x - a0.x) * u, y: a0.y + (a1.y - a0.y) * u, z: a0.z + (a1.z - a0.z) * u }, world);
  }
  r.anchor = { x: a1.x, y: a1.y, z: a1.z };
  if (world.dir) r.dir = { ...world.dir };
  return steps;
}

const GRAVITY = (i, x, y, z, out) => { out[0] = 0; out[1] = -9.8; out[2] = 0; };
const out = [0, 0, 0];
function step(r, anchor, world) {
  const s = r.spec, h = s.step, p = r.p, q = r.q, keep = Math.exp(-s.drag * h), accel = world.accel ?? GRAVITY;
  // move: inertia, slowed by the air, and what pulls on it
  for (let i = 1; i < r.n; i++) {
    const j = i * 3;
    accel(i, p[j], p[j + 1], p[j + 2], out);
    for (let c = 0; c < 3; c++) {
      const now = p[j + c], v = (now - q[j + c]) * keep;
      q[j + c] = now;
      p[j + c] = now + v + out[c] * h * h;
    }
  }
  q[0] = p[0]; q[1] = p[1]; q[2] = p[2];
  p[0] = anchor.x; p[1] = anchor.y; p[2] = anchor.z;
  const len = linkLength(r), dir = world.dir ?? r.dir, floor = world.floor, spheres = world.spheres ?? [], targets = world.targets ?? [];
  for (let it = 0; it < s.iterations; it++) {
    // out of the stump the way it points
    p[3] += (anchor.x + dir.x * len - p[3]) * 0.6; p[4] += (anchor.y + dir.y * len - p[4]) * 0.6; p[5] += (anchor.z + dir.z * len - p[5]) * 0.6;
    for (const t of targets) {
      const j = t.i * 3;
      if (t.i <= 0 || t.i >= r.n) continue;
      p[j] += (t.x - p[j]) * t.k; p[j + 1] += (t.y - p[j + 1]) * t.k; p[j + 2] += (t.z - p[j + 2]) * t.k;
    }
    // the links (the anchor does not give)
    for (let i = 0; i + 1 < r.n; i++) link(p, i, i + 1, len, i === 0 ? 0 : 0.5, 1);
    // bending: two further on, never closer than `bend` of two links
    for (let i = 0; i + 2 < r.n; i++) link(p, i, i + 2, 2 * len * s.bend, i === 0 ? 0 : 0.5, s.stiff, true);
    for (let i = 1; i < r.n; i++) {
      const j = i * 3;
      for (const b of spheres) {
        const dx = p[j] - b.x, dy = p[j + 1] - b.y, dz = p[j + 2] - b.z, d = Math.hypot(dx, dy, dz), min = b.r + s.thick;
        if (d < min && d > 1e-6) { const k = min / d; p[j] = b.x + dx * k; p[j + 1] = b.y + dy * k; p[j + 2] = b.z + dz * k; }
      }
      if (floor) {
        const f = floor(p[j], p[j + 2], p[j + 1]) + s.thick;
        if (p[j + 1] < f) {
          p[j + 1] = f;
          // on the floor it slides, slowing: its step along the floor is cut
          q[j] = p[j] - (p[j] - q[j]) * s.friction; q[j + 2] = p[j + 2] - (p[j + 2] - q[j + 2]) * s.friction;
          q[j + 1] = Math.min(q[j + 1], p[j + 1]);
        }
      }
    }
  }
}
// pull points a and b (indices) to `rest` apart: wa of the change on a, the rest on b; `min`:
// only when closer than that
function link(p, a, b, rest, wa, k, min = false) {
  const i = a * 3, j = b * 3, dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], d = Math.hypot(dx, dy, dz);
  if (d < 1e-9 || (min && d >= rest)) return;
  const e = (d - rest) / d * k, wb = 1 - wa;
  p[i] += dx * e * wa; p[i + 1] += dy * e * wa; p[i + 2] += dz * e * wa;
  p[j] -= dx * e * wb; p[j + 1] -= dy * e * wb; p[j + 2] -= dz * e * wb;
}
// how fast point i moves now (cells/s, from its last step)
export function speedOf(r, i) {
  const j = i * 3;
  return Math.hypot(r.p[j] - r.q[j], r.p[j + 1] - r.q[j + 1], r.p[j + 2] - r.q[j + 2]) / r.spec.step;
}
