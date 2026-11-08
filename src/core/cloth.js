// A sheet of cloth thrown over a ball: Megalimmer (core/enemies.js MEGALIMMER, `cloth`), a ghost
// with no person under him, only a hidden ball (his head) and two small hidden balls (his hands)
// pushing his sheet out from under it (drawn by render/megalimmerview.js). Pure rules, no
// three.js, so the tests run it.
//
// The sheet is a round piece of cloth, a grid of points (`grid` across) cut to a disc with a
// ragged hem (a few longer tongues, like a child's drawing of a ghost), laid over the ball. Like
// the ribbons (core/ribbon.js) it is position-based dynamics (Verlet): every point keeps its
// velocity (what it moved in the last step), is pulled down and slowed by the air (`drag`: the
// air's speed, not the point's own, so a sheet carried along fast streams out behind; the air
// stirs a little, `wind`, so it ripples while he floats still); then, a few times over, the cloth
// is pulled back together: each point to its neighbours along the grid (`stretch`: it does not
// stretch) and across its squares (`shear`), each to the one two further on (`bend`: soft, so it
// folds but does not crumple), the points out of the ball (`friction` on it: the sheet does not
// slide off), out of the hands and over the floor. The cap over the top of the ball (`cap`) is
// held softly to its place on it, turned the way he faces (`pin`): it turns with him and keeps
// his eyes in front.
//
// So nothing of it is keyframed: the hem swings and trails behind as he glides, streams out as he
// runs round you, a punch pushes the sheet out in front of him, raised hands lift it and it
// billows (`billow`), and when the ball goes (he dies) the sheet falls down onto the floor in a
// heap.
export const CLOTH = Object.freeze({
  grid: 25,             // points across the square the disc is cut from
  radius: 2.05,         // cells from the middle to the hem (on average: the hem is ragged)
  ragged: 0.16,         // cells the hem goes in and out (tongues)
  tongues: 7,           // how many longer tongues round the hem
  iterations: 6,        // times round the constraints a step
  stretch: 1,           // how hard the grid's links hold (0 .. 1 a time round)
  shear: 0.6,           // ... the links across its squares
  bend: 0.12,           // ... the links two further on (little: it folds)
  compress: 0.04,       // of that, how hard a link holds against being pushed together (cloth gathers in folds)
  drag: 1.6,            // 1/s: how fast the air takes a point's speed (relative to the air) away
  hemDrag: 1.2,         // more of it at the hem (it flutters): the hem's drag is (1 + hemDrag) times
  wind: 0.5,            // cells/s the air stirs at most
  gravity: 9.8,         // cells/s²
  friction: 0.6,        // of its speed along the ball (relative to the ball) a point on it loses a step
  floorFriction: 0.5,   // of its speed along the floor a point on it keeps a step
  cap: 0.75,            // cells (along the sheet) from its middle that are held to the ball
  pin: 0.35,            // how hard the cap is held to its place (a time round, at its middle; less out to its edge)
  step: 1 / 90,         // s: the fixed step it is run at
  maxSteps: 5,          // at most this many steps a frame (a long frame runs slower, not unstable)
  maxSpeed: 30,         // cells/s a point never goes faster than
  carry: 0.5,           // cells the ball may move in a call (more as fast as `run` in a long frame): further (a
  run: 12,              //   jump, a portal) carries the sheet along as it is
  thick: 0.04,          // cells a point stays out of the ball, the hands and off the floor
  flare: 0.3,           // laid out anew: how far out the sheet hangs per cell down below the ball's middle
});

// the hem's radius at angle a round the sheet (a ragged hem: tongues and a little unevenness)
function hemAt(spec, a, seed) {
  const k = spec.tongues;
  const tongue = Math.pow(0.5 + 0.5 * Math.cos(a * k + seed), 3);
  const uneven = 0.35 * Math.sin(a * 3 + seed * 2.1) + 0.25 * Math.sin(a * 11 + seed * 0.7);
  return spec.radius + spec.ragged * (2 * tongue - 0.6 + uneven);
}

// A new sheet laid over ball `head` ({ x, y, z, r }), facing yaw (what +z of the sheet's own
// layout turns to: x = sin yaw, z = cos yaw). -> {
//   n: points; p, q: where they are and were (x, y, z each); a, b: where each lies on the flat
//   sheet (a across, b forward, cells from its middle); uv: those as 0 .. 1; tris: the triangles
//   (point indices, wound so their normal faces out of the ball); hem: the points on the hem;
//   centre: the point in the middle }
export function newCloth(head, yaw = 0, spec = CLOTH, seed = 1.3) {
  const g = spec.grid, half = (g - 1) / 2, cell = (spec.radius + spec.ragged * 2) / half;
  const id = new Int32Array(g * g).fill(-1), a = [], b = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const x = (i - half) * cell, z = (j - half) * cell, d = Math.hypot(x, z);
    if (d > hemAt(spec, Math.atan2(x, z), seed)) continue;
    id[j * g + i] = a.length; a.push(x); b.push(z);
  }
  const n = a.length, links = [], bends = [], tris = [], cap = [];
  const at = (i, j) => i >= 0 && j >= 0 && i < g && j < g ? id[j * g + i] : -1;
  const join = (list, u, v) => { if (u >= 0 && v >= 0) list.push(u, v); };
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const o = at(i, j);
    if (o < 0) continue;
    join(links, o, at(i + 1, j)); join(links, o, at(i, j + 1));
    join(bends, o, at(i + 2, j)); join(bends, o, at(i, j + 2));
    const r = at(i + 1, j), d = at(i, j + 1), rd = at(i + 1, j + 1);
    // the squares, split one way and the other in turn (so the folds do not all run one way);
    // wound so that, on the flat sheet with +y up, each triangle faces up
    if (rd >= 0 && (r >= 0 || d >= 0)) {
      if ((i + j) % 2) {
        if (r >= 0) tris.push(o, rd, r);
        if (d >= 0) tris.push(o, d, rd);
      } else if (r >= 0 && d >= 0) tris.push(o, d, r, r, d, rd);
      else if (r >= 0) tris.push(o, rd, r);
      else tris.push(o, d, rd);
    } else if (r >= 0 && d >= 0) tris.push(o, d, r);
  }
  // the shear links: across every square that is all there
  const shears = [];
  for (let j = 0; j + 1 < g; j++) for (let i = 0; i + 1 < g; i++) {
    join(shears, at(i, j), at(i + 1, j + 1)); join(shears, at(i + 1, j), at(i, j + 1));
  }
  const rest = list => {
    const r = new Float64Array(list.length / 2);
    for (let k = 0; k < r.length; k++) r[k] = Math.hypot(a[list[2 * k]] - a[list[2 * k + 1]], b[list[2 * k]] - b[list[2 * k + 1]]);
    return r;
  };
  for (let k = 0; k < n; k++) if (Math.hypot(a[k], b[k]) <= spec.cap) cap.push(k);
  // the hem: points with a neighbour along the grid missing
  const hem = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const o = at(i, j);
    if (o >= 0 && (at(i + 1, j) < 0 || at(i - 1, j) < 0 || at(i, j + 1) < 0 || at(i, j - 1) < 0)) hem.push(o);
  }
  let centre = 0;
  for (let k = 1; k < n; k++) if (Math.hypot(a[k], b[k]) < Math.hypot(a[centre], b[centre])) centre = k;
  const span = 2 * half * cell, uv = new Float32Array(n * 2), out = new Float64Array(n);
  const reach = Math.max(...a.map((x, k) => Math.hypot(x, b[k])));
  for (let k = 0; k < n; k++) {
    uv[2 * k] = a[k] / span + 0.5; uv[2 * k + 1] = b[k] / span + 0.5;
    out[k] = Math.hypot(a[k], b[k]) / reach;   // (0 in the middle, 1 at the hem's furthest)
  }
  const c = { spec, n, cell, a: Float64Array.from(a), b: Float64Array.from(b), uv, out, tris: Uint16Array.from(tris), hem, centre,
    links: Int32Array.from(links), linkRest: rest(links), shears: Int32Array.from(shears), shearRest: rest(shears),
    bends: Int32Array.from(bends), bendRest: rest(bends), cap: Int32Array.from(cap),
    p: new Float64Array(n * 3), q: new Float64Array(n * 3), acc: 0, time: seed * 10,
    head: null, yaw, hands: [], contact: new Uint8Array(n) };
  drape(c, head, yaw);
  return c;
}

// where the flat sheet's point (a, b) lies wrapped over ball h (radius R), facing yaw: over the
// ball as far as a quarter round it (to its middle), then hanging down, flaring a little
function wrapped(c, a, b, h, R, yaw, out, k) {
  const d = Math.hypot(a, b), phi = Math.atan2(a, b) + yaw, sx = Math.sin(phi), sz = Math.cos(phi), top = R * Math.PI / 2;
  if (d <= top) {
    const th = d / R, s = Math.sin(th) * R;
    out[k] = h.x + sx * s; out[k + 1] = h.y + Math.cos(th) * R; out[k + 2] = h.z + sz * s;
  } else {
    const down = d - top, s = R + down * c.spec.flare;
    out[k] = h.x + sx * s; out[k + 1] = h.y - down; out[k + 2] = h.z + sz * s;
  }
}
// lay the sheet c over ball h anew, at rest (when it is made)
export function drape(c, h, yaw = c.yaw) {
  const R = h.r + c.spec.thick;
  for (let k = 0; k < c.n; k++) wrapped(c, c.a[k], c.b[k], h, R, yaw, c.p, k * 3);
  c.q.set(c.p);
  c.head = { x: h.x, y: h.y, z: h.z, r: h.r }; c.yaw = yaw;
  c.hands = [];
}
// move all of sheet c with the ball, now at h, as it is (no flinging it about after a jump)
function carry(c, h) {
  const dx = h.x - c.head.x, dy = h.y - c.head.y, dz = h.z - c.head.z;
  for (let k = 0; k < c.n * 3; k += 3) {
    c.p[k] += dx; c.p[k + 1] += dy; c.p[k + 2] += dz;
    c.q[k] += dx; c.q[k + 1] += dy; c.q[k + 2] += dz;
  }
  c.head = { x: h.x, y: h.y, z: h.z, r: h.r };
  c.hands = c.hands.map(b => ({ ...b, x: b.x + dx, y: b.y + dy, z: b.z + dz }));
}
// point k of sheet c: { x, y, z }
export const clothPoint = (c, k) => ({ x: c.p[k * 3], y: c.p[k * 3 + 1], z: c.p[k * 3 + 2] });

// Run sheet c on by dt s, in fixed steps. world: {
//   head: { x, y, z, r }   the ball where it is now (moved smoothly over the steps from where it
//                          was); null: no ball (he died), nothing holds the sheet up
//   yaw                    which way he faces (the cap turns with it)
//   pin                    0 .. 1: how much the cap is held (1; 0 lets go of it)
//   hands: [{ x, y, z, r }]  the hands under the sheet (each matched to the one before by its place in the list)
//   floor                  the floor's height under him (-Infinity: none)
//   drag                   times the sheet's drag (1; more: it streams out behind more)
//   billow                 0 .. 1: the air under the sheet puffs it out and up (his hands raised in a cast)
//   wind                   times the stirring of the air (1)
// } -> how many steps were run
export function stepCloth(c, dt, world) {
  const s = c.spec, h1 = world.head;
  if (h1 && c.head && Math.hypot(h1.x - c.head.x, h1.y - c.head.y, h1.z - c.head.z) > s.carry + s.run * Math.min(Math.max(dt, 0), s.step * s.maxSteps)) carry(c, h1);
  if (!(dt > 0)) return 0;
  c.acc = Math.min(c.acc + dt, s.step * s.maxSteps);
  const steps = Math.floor(c.acc / s.step + 1e-9);
  if (!steps) return 0;
  c.acc -= steps * s.step;
  const h0 = c.head ?? h1, y0 = c.yaw, y1 = world.yaw ?? c.yaw, dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
  const hands1 = world.hands ?? [], hands0 = c.hands;
  for (let k = 1; k <= steps; k++) {
    const u = k / steps, v = (k - 1) / steps;
    const head = h1 ? lerpBall(h0, h1, u) : null, was = h1 ? lerpBall(h0, h1, v) : null;
    const hands = hands1.map((b, i) => lerpBall(hands0[i] ?? b, b, u));
    step(c, head, was, y0 + dy * u, hands, world);
  }
  c.head = h1 ? { x: h1.x, y: h1.y, z: h1.z, r: h1.r } : null;
  c.yaw = y1;
  c.hands = hands1.map(b => ({ x: b.x, y: b.y, z: b.z, r: b.r }));
  // (never left broken: should anything have gone wrong, it is laid out anew)
  for (let k = 0; k < c.n * 3; k++) if (!Number.isFinite(c.p[k]) || !Number.isFinite(c.q[k])) {
    if (h1) drape(c, h1, y1); else { c.p.fill(0); c.q.fill(0); }
    break;
  }
  return steps;
}
const lerpBall = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, r: a.r + (b.r - a.r) * u });

const target = new Float64Array(3);
function step(c, head, was, yaw, hands, world) {
  const s = c.spec, h = s.step, p = c.p, q = c.q, n = c.n, t = (c.time += h);
  const floor = world.floor ?? -Infinity, billow = world.billow ?? 0, windK = (world.wind ?? 1) * s.wind, dragK = world.drag ?? 1;
  const vmax = s.maxSpeed * h, g = s.gravity * h * h;
  // move: inertia, slowed by the (stirring) air, and pulled down; puffed out and up in a billow
  for (let k = 0; k < n; k++) {
    const j = k * 3, x = p[j], y = p[j + 1], z = p[j + 2];
    const keep = Math.exp(-s.drag * dragK * (1 + s.hemDrag * c.out[k] * c.out[k]) * h);
    // the air's own speed here (a slow swirl of gusts), a step's worth
    const wx = windK * h * Math.sin(1.3 * z + 1.7 * t + Math.sin(0.9 * x - 1.1 * t)),
      wy = windK * h * 0.4 * Math.sin(1.6 * x + 1.9 * z + 2.3 * t),
      wz = windK * h * Math.sin(1.4 * x - 1.5 * t + Math.sin(1.2 * z + 0.7 * t));
    let vx = wx + (x - q[j] - wx) * keep, vy = wy + (y - q[j + 1] - wy) * keep, vz = wz + (z - q[j + 2] - wz) * keep;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > vmax) { const f = vmax / sp; vx *= f; vy *= f; vz *= f; }
    let ax = 0, ay = -g, az = 0;
    if (billow > 0 && head && y < head.y) {
      // out from his middle and up, the more the lower down (the hem most)
      const ox = x - head.x, oz = z - head.z, l = Math.hypot(ox, oz) || 1, low = Math.min(1, (head.y - y) / 1.5);
      const gust = billow * h * h * (0.75 + 0.25 * Math.sin(t * 7 + k * 0.37));
      ax += ox / l * 6 * low * gust; az += oz / l * 6 * low * gust; ay += 2.5 * low * gust;
    }
    q[j] = x; q[j + 1] = y; q[j + 2] = z;
    p[j] = x + vx + ax; p[j + 1] = y + vy + ay; p[j + 2] = z + vz + az;
  }
  const pin = head ? (world.pin ?? 1) * s.pin : 0, R = head ? head.r + s.thick : 0;
  const contact = c.contact;
  for (let it = 0; it < s.iterations; it++) {
    links(p, c.links, c.linkRest, s.stretch, s.compress);
    links(p, c.shears, c.shearRest, s.shear, s.compress);
    links(p, c.bends, c.bendRest, s.bend, s.compress);
    // the cap, held to its place on the ball, turned the way he faces
    if (pin > 0) for (let m = 0; m < c.cap.length; m++) {
      const k = c.cap[m], j = k * 3, w = pin * (1 - 0.7 * Math.hypot(c.a[k], c.b[k]) / s.cap);
      wrapped(c, c.a[k], c.b[k], head, R, yaw, target, 0);
      p[j] += (target[0] - p[j]) * w; p[j + 1] += (target[1] - p[j + 1]) * w; p[j + 2] += (target[2] - p[j + 2]) * w;
    }
    const last = it === s.iterations - 1;
    for (let k = 0; k < n; k++) {
      const j = k * 3;
      if (head && R > s.thick) {
        const dx = p[j] - head.x, dy = p[j + 1] - head.y, dz = p[j + 2] - head.z, d = Math.hypot(dx, dy, dz);
        if (d < R) {
          const nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : 1, nz = d > 1e-9 ? dz / d : 0;
          p[j] = head.x + nx * R; p[j + 1] = head.y + ny * R; p[j + 2] = head.z + nz * R;
          contact[k] = 1;
        }
        // on it, it holds on: its speed along the ball (relative to the ball, which moves) is cut
        if (last && contact[k]) {
          contact[k] = 0;
          const mx = head.x - was.x, my = head.y - was.y, mz = head.z - was.z;
          let rx = p[j] - q[j] - mx, ry = p[j + 1] - q[j + 1] - my, rz = p[j + 2] - q[j + 2] - mz;
          const ex = p[j] - head.x, ey = p[j + 1] - head.y, ez = p[j + 2] - head.z, el = Math.hypot(ex, ey, ez) || 1;
          const along = (rx * ex + ry * ey + rz * ez) / el;
          rx -= ex / el * along; ry -= ey / el * along; rz -= ez / el * along;
          q[j] += rx * s.friction; q[j + 1] += ry * s.friction; q[j + 2] += rz * s.friction;
        }
      }
      for (const b of hands) {
        const dx = p[j] - b.x, dy = p[j + 1] - b.y, dz = p[j + 2] - b.z, d = Math.hypot(dx, dy, dz), min = b.r + s.thick + c.cell * 0.4;
        if (d < min && d > 1e-9) { const f = min / d; p[j] = b.x + dx * f; p[j + 1] = b.y + dy * f; p[j + 2] = b.z + dz * f; }
      }
      const f = floor + s.thick;
      if (p[j + 1] < f) {
        p[j + 1] = f;
        if (last) {
          q[j] = p[j] - (p[j] - q[j]) * s.floorFriction; q[j + 2] = p[j + 2] - (p[j + 2] - q[j + 2]) * s.floorFriction;
          q[j + 1] = Math.min(q[j + 1], p[j + 1]);
        }
      }
    }
  }
}
// pull each pair of points (list: index pairs) to its rest length apart, k of the way (each takes
// half); pushed closer together than that, only `compress` of k
function links(p, list, rest, k, compress) {
  for (let m = 0, l = rest.length; m < l; m++) {
    const i = list[2 * m] * 3, j = list[2 * m + 1] * 3;
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-9) continue;
    const e = (d - rest[m]) / d * k * (d < rest[m] ? compress * 0.5 : 0.5);
    p[i] += dx * e; p[i + 1] += dy * e; p[i + 2] += dz * e;
    p[j] -= dx * e; p[j + 1] -= dy * e; p[j + 2] -= dz * e;
  }
}

// the middle of the hem: { x, y, z } (where the sheet's lower edge is on the whole)
export function hemCentre(c) {
  let x = 0, y = 0, z = 0;
  for (const k of c.hem) { x += c.p[k * 3]; y += c.p[k * 3 + 1]; z += c.p[k * 3 + 2]; }
  const l = c.hem.length || 1;
  return { x: x / l, y: y / l, z: z / l };
}
// the point of the sheet nearest to (a, b) on the flat sheet (cells: a across, b forward)
export function pointAt(c, a, b) {
  let best = 0, d = Infinity;
  for (let k = 0; k < c.n; k++) { const e = Math.hypot(c.a[k] - a, c.b[k] - b); if (e < d) { d = e; best = k; } }
  return best;
}
