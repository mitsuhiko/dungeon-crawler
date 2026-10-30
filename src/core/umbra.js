// Umbra's fight as rules (game/umbra.js runs it, game/dive.js the water and the diving suit; his
// profiles are core/enemies.js UMBRA, UMBRA_TWO and UMBRA_THREE). docs/bosses.md tells the whole fight.
//
// Umbra is a long sea snake, a shadow with glowing markings, in a flooded reef (cubegen/arenashapes.js
// `reef`). The room is dry as the hero comes in, a diving suit of brass on a stand in its middle;
// putting it on (everyone in the room gets one) shuts the way out behind them, the water rises over
// everything and he comes. From then on the air in the suit's tank runs out (`air`): all of it
// under water, beaten in time or dead.
//
// He swims through the water in three dimensions: his head goes where he steers it (`steer`), and his
// body follows the way it went (a trail of where the head was, `newTrail` / `pushTrail`; his body is
// that trail, `bodyAt`). The hero walks on the bottom; a blade reaches him only where his body passes
// at their height, so his ways go over the hilltops (where you meet him from on top of them), down
// at you to bite, and down onto the bottom when he makes the earth quake (and lies there a moment).
// Three phases, a third of his health each (`splits`); between them he rages (`rage` s, warded):
//   1   bites, the shockwave (a ring running over the floor: jump it, or stand higher), the
//       earthquake (thrown off balance: slowed, no blows, sliding downhill a little; jump it),
//       volcanoes in the floor (`vents`) and squirtles of the deep
//   2   and jets of water from the four walls and from above (`jets`: a warning first, then they
//       push, stun and hurt), and his shield of air and water (`shield`: `time` s, nothing hurts him)
//   3   and mud rising up from the bottom (`mud`): it only slows, the deeper the more, so the high
//       ground is where to be; his squirtles are of the mud now
// Pure: no three.js, no game state, so the tests run it.
import { mulberry32 } from './util.js';
import { N, LH, HEAD_Y } from './constants.js';

export const UMBRA_FIGHT = Object.freeze({
  splits: [2 / 3, 1 / 3],     // the shares of his health phases 2 and 3 start at
  rage: 2.6,                  // s he rages between phases (warded)
  appear: 0.5,                // s more nothing hurts him after
  air: 240,                   // s of air in the suit's tank
  suit: 3.6,                  // s the suit takes to put on (game/dive.js, render/divesuit.js)
  flood: 5,                   // s the water takes to rise
  drain: 4,                   // s it takes to drain once he is beaten
  // his body: cells long from the tip of his snout to his tail, how many bones it has (the model's
  // spine, blender/umbra.py), how thick (its radius at its thickest, the head's, the tail's tip), and
  // the spheres it is hit by (`parts`: a blade reaches what of him is at its height)
  body: { length: 10.4, bones: 24, radius: 0.46, head: 0.42, tip: 0.08, parts: 10, neck: 0.75 },
  // swimming: cells/s cruising and coming at you, how fast his heading turns (rad/s), how far his
  // head keeps over the ground (cells, his middle) and under the surface
  swim: { cruise: 2.3, approach: 3.4, turn: 2.1, clear: 0.62, top: 0.9, wander: [2.5, 4.5] },
  // a bite: how close his head comes to whom it bites before he strikes, the lunge's speed (cells/s)
  bite: { from: 2.3, lunge: 6.5, reach: 1.15, back: 1.8 },
  // the earthquake: he dives down onto the bottom near you and slams his body onto it; who stands
  // on the ground (not in a jump) is thrown off balance (`stagger` s: no blows, slowed to `slow`,
  // sliding downhill at `slide` cells/s for `slideTime` s), and he lies there `exposed` s (blows
  // hurt him `damage` times as much); the first `first` s into the fight, then every `every` s
  quake: { stagger: 0.75, slow: 0.4, slide: 2.4, slideTime: 0.45, exposed: 2.4, damage: 1.5, first: 9, every: [12, 16] },
  // the volcanoes: `count` of them break open in the floor round you, glow `warn` s and erupt for
  // `erupt` s, spitting a lava bomb every `bomb` s each (onto the floor `spread` cells round) and
  // burning up through the water over them (`column`: who is within `r` cells and up to `height`
  // over it takes `power` of his damage every `tick` s and is pushed up at `pop`); every `every` s
  vents: { count: [2, 3], warn: 1.6, erupt: 4, bomb: 0.55, spread: [0.8, 3.2], first: 5, every: [10, 14], apart: 2.2, near: [1.5, 5.5],
    column: { r: 0.7, height: 4.5, tick: 0.5, power: 0.3, pop: 4.5 } },
  // the jets (phase 2 on): `volleys` of them, each `warn` s of warning (bubbles along their way,
  // the pipe glowing), then `blast` s of water: a wall's runs straight across the room `width`
  // cells wide at `height` cells over the bottom (the hills stand in its way), one from above comes
  // down `r` cells round; who it catches is hurt (`power`), dazed (`daze` s) and pushed along
  // (`push` cells/s for `pushTime` s); `gap` s between volleys; every `every` s
  jets: { volleys: [3, 4], warn: 1.3, blast: 0.6, gap: 0.55, width: 1.5, height: 1.1, power: 0.55, daze: 0.75, push: 8, pushTime: 0.45,
    down: { r: 1.15, power: 0.65, daze: 0.9 }, first: 4, every: [15, 19], walls: [1, 2], downs: [0, 2] },
  // his shield of air and water (phase 2 on): `cast` s to call it, `time` s it holds; every `every` s
  shield: { cast: 1, time: 4, first: 7, every: [12, 16] },
  // the mud (phase 3): it rises from the bottom in steps, levels over the lowest floor of the reef
  // (`steps`), each over `rise` s, standing `hold` s before the next; now and then it sinks back a
  // step (`ebb`). It only slows (`slowAt`: by how deep it is over the feet)
  mud: { steps: [1.5, 3, 4], rise: 4, hold: [11, 15], ebb: 0.3, first: 3 },
  // his squirtles (squirtles of the deep, of the mud in phase 3): as many as fill up to `most`
  // (a phase each), every `every` s
  squirtles: { most: [2, 2, 3], every: [15, 13, 11], first: 6 },
  leave: 0.5,                 // s a minion he takes along lingers, gone, before it is let go
});

// Under water (game/dive.js, physics/move.js): the diving suit's heavy boots keep the hero on the
// bottom; gravity pulls `gravity` as hard (a jump goes up `jump` as fast: higher and slower), walking
// is `walk` as fast; and everything is slowed by the water (`attack`: a weapon's swing, `shots`:
// what flies through it, an arrow, a spit, a lava bomb)
export const DIVE = Object.freeze({ gravity: 0.5, jump: 0.85, walk: 0.8, attack: 0.8, shots: 0.6, control: 4 });

// the health below which no blow takes him in phase `phase` (0 in the last)
export const phaseFloor = (maxHp, phase) => phase <= UMBRA_FIGHT.splits.length ? Math.ceil(maxHp * UMBRA_FIGHT.splits[phase - 1]) : 0;
// how many squirtles a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, UMBRA_FIGHT.squirtles.most[phase - 1] - alive);
// the air left (s) `t` s into the fight (never under 0)
export const airLeft = t => Math.max(0, UMBRA_FIGHT.air - Math.max(0, t));
// the air bar's text: 3:12
export const airText = s => { const n = Math.ceil(Math.max(0, s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

// The attacks he may not start now (names): those not his phase's yet; the ones whose time has not
// come (`due`: name -> true); the bite only with somebody to bite near; and while one is due that
// takes the room (the jets, the earthquake) nothing else but it.
const ALL = ['bite', 'wave', 'quake', 'vents', 'summon', 'jets', 'shield'];
const MINE = [['bite', 'wave', 'quake', 'vents', 'summon'], ['bite', 'wave', 'quake', 'vents', 'summon', 'jets', 'shield'],
  ['bite', 'wave', 'quake', 'vents', 'summon', 'jets', 'shield']];
export function barred({ phase, due = {}, near = false }) {
  const mine = new Set(MINE[phase - 1]);
  for (const first of ['jets', 'quake']) if (due[first] && mine.has(first)) return new Set(ALL.filter(n => n !== first));
  return new Set(ALL.filter(n => !mine.has(n) || (n === 'bite' ? !near : n !== 'wave' && !due[n])));
}

// --- his body: the way his head went ----------------------------------------------------------------

// A trail: where his head was, newest first ({ x, y, z } each, at least STEP apart), long enough
// for all of his body. Made lying out behind a head at `head` going the way (dx, dy, dz) points.
const STEP = 0.12;
export function newTrail(head, [dx, dy, dz], length = UMBRA_FIGHT.body.length) {
  const l = Math.hypot(dx, dy, dz) || 1, pts = [];
  for (let s = 0; s <= length + 1; s += STEP) pts.push({ x: head.x - dx / l * s, y: head.y - dy / l * s, z: head.z - dz / l * s });
  return { pts, length };
}
// the head now at p: put on the trail (once it moved far enough; the newest point always follows it),
// and what is past the body's end cut off
export function pushTrail(trail, p) {
  const pts = trail.pts, a = pts[0], b = pts[1];
  if (b && Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < STEP) { a.x = p.x; a.y = p.y; a.z = p.z; }
  else pts.unshift({ x: p.x, y: p.y, z: p.z });
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    if (s > trail.length + 0.5) { pts.length = i + 1; break; }
  }
}
// the point `s` cells back along the trail from the head (past its end: its last point), and the way
// the body runs there (towards the head, unit)
export function bodyAt(trail, s) {
  const pts = trail.pts;
  let at = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (at + l >= s || i === pts.length - 1) {
      const k = l > 1e-6 ? Math.min(1, (s - at) / l) : 0, d = l > 1e-6 ? l : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, dx: (a.x - b.x) / d, dy: (a.y - b.y) / d, dz: (a.z - b.z) / d };
    }
    at += l;
  }
  const p = pts[0];
  return { x: p.x, y: p.y, z: p.z, dx: 0, dy: 0, dz: 1 };
}
// His body sinking onto the bottom once he is beaten: every point of the trail falls (`speed`
// cells/s) till it lies on the ground (ground(x, z): the highest floor there) by its thickness
export function settleTrail(trail, ground, dt, speed = 1.6) {
  const L = trail.length;
  let s = 0;
  trail.pts.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - trail.pts[i - 1].x, p.y - trail.pts[i - 1].y, p.z - trail.pts[i - 1].z);
    const rest = ground(p.x, p.z) + radiusAt(Math.min(1, s / L)) * 0.85;
    if (p.y > rest) p.y = Math.max(rest, p.y - speed * dt * (1 + s / L));
  });
}
// how thick his body is `u` of the way from his head (0) to the tip of his tail (1): his head, a
// little thicker behind it, tapering off towards the tail
export function radiusAt(u) {
  const B = UMBRA_FIGHT.body;
  if (u < 0.08) return B.head + (B.radius - B.head) * (u / 0.08);
  if (u < 0.45) return B.radius;
  const k = (u - 0.45) / 0.55;
  return B.tip + (B.radius - B.tip) * (1 - k * k);
}
// the spheres his body is hit by: `parts` along it, from his head back ({ x, y, z, r, s })
export function bodyParts(trail, n = UMBRA_FIGHT.body.parts) {
  const L = UMBRA_FIGHT.body.length, out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.min(0.92, (i + 0.35) / n), p = bodyAt(trail, u * L);
    out.push({ x: p.x, y: p.y, z: p.z, r: radiusAt(u), s: u * L });
  }
  return out;
}

// --- swimming ----------------------------------------------------------------------------------------

// One step of his head (`h`: { x, y, z, dx, dy, dz } its place and heading, unit) towards `goal`
// at `speed` cells/s, its heading turning at most `turn` rad/s; it keeps `clear` over the ground
// (ground(x, z): the highest floor there) a little ahead too, under `surface - top`, and inside the
// box ([x0, z0, x1, z1], `margin` in). Changes h.
export function steer(h, goal, dt, { speed, turn, clear = UMBRA_FIGHT.swim.clear, surface = Infinity, top = UMBRA_FIGHT.swim.top,
  box = [1, 1, N - 1, N - 1], margin = 0.9, ground = () => -Infinity }) {
  let wx = goal.x - h.x, wy = goal.y - h.y, wz = goal.z - h.z;
  const wl = Math.hypot(wx, wy, wz);
  if (wl > 1e-4) { wx /= wl; wy /= wl; wz /= wl; } else { wx = h.dx; wy = h.dy; wz = h.dz; }
  // the floor coming up ahead: up over it
  const ahead = Math.max(ground(h.x + h.dx * 0.9, h.z + h.dz * 0.9), ground(h.x + h.dx * 1.8, h.z + h.dz * 1.8));
  if (h.y < ahead + clear + 0.4) wy = Math.max(wy, 0.55);
  // the box's walls ahead: away from them
  const [x0, z0, x1, z1] = box;
  if (h.x + h.dx < x0 + margin) wx = Math.max(wx, 0.6);
  if (h.x + h.dx > x1 - margin) wx = Math.min(wx, -0.6);
  if (h.z + h.dz < z0 + margin) wz = Math.max(wz, 0.6);
  if (h.z + h.dz > z1 - margin) wz = Math.min(wz, -0.6);
  const l = Math.hypot(wx, wy, wz) || 1;
  wx /= l; wy /= l; wz /= l;
  // turn the heading towards that, at most turn * dt
  const cos = Math.min(1, Math.max(-1, h.dx * wx + h.dy * wy + h.dz * wz)), angle = Math.acos(cos), most = turn * dt;
  if (angle > 1e-5) {
    const k = Math.min(1, most / angle), s = Math.sin(angle);
    const a = Math.sin((1 - k) * angle) / s, b = Math.sin(k * angle) / s;
    let nx = h.dx * a + wx * b, ny = h.dy * a + wy * b, nz = h.dz * a + wz * b;
    if (!Number.isFinite(nx) || angle > Math.PI - 1e-3) { nx = h.dx * (1 - k) + wx * k; ny = h.dy * (1 - k) + wy * k; nz = h.dz * (1 - k) + wz * k; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    h.dx = nx / nl; h.dy = ny / nl; h.dz = nz / nl;
  }
  // never steeper than this: a snake swims, he does not climb straight up
  const flat = Math.hypot(h.dx, h.dz);
  if (Math.abs(h.dy) > 0.85 && flat > 1e-3) { const s = Math.sqrt(1 - 0.85 * 0.85) / flat; h.dx *= s; h.dz *= s; h.dy = Math.sign(h.dy) * 0.85; }
  h.x += h.dx * speed * dt; h.y += h.dy * speed * dt; h.z += h.dz * speed * dt;
  h.x = Math.min(x1 - 0.4, Math.max(x0 + 0.4, h.x)); h.z = Math.min(z1 - 0.4, Math.max(z0 + 0.4, h.z));
  h.y = Math.min(surface - top, Math.max(ground(h.x, h.z) + clear, h.y));
  return h;
}

// Where he goes when he is not after anybody: one of `spots` ({ x, y, z }: over the hilltops, at
// the height of a hero standing on them, and out over the deep), not the one he just left (r: 0..1)
export function nextSpot(spots, last, r = Math.random()) {
  const pool = spots.filter(s => s !== last);
  return pool.length ? pool[Math.floor(r * pool.length) % pool.length] : last;
}
// The spots of a reef (its hills: { x, z, top (world units), r }) he swims through: over each hill's
// top at a hero's chest's height (a blade reaches him from up there) and higher over the deep
export function swimSpots(hills, low, surface) {
  const out = [];
  for (const h of hills) out.push({ x: h.x, y: h.top + 0.5, z: h.z, hill: h });
  const mid = Math.min(surface - 1.5, low + 2.8);
  for (const [x, z] of [[4, 4], [N - 4, 4], [4, N - 4], [N - 4, N - 4], [N / 2, N / 2]]) out.push({ x, y: mid, z, high: true });
  return out;
}

// --- the volcanoes -----------------------------------------------------------------------------------

// Where `n` volcanoes break open round (px, pz): on floors (`floors`: [{ x, z, y }] cell middles
// the reef has, the fight's) `near` cells from it, `apart` from each other; seed: the same cast,
// the same places
export function ventSpots(floors, px, pz, n, seed) {
  const V = UMBRA_FIGHT.vents, R = mulberry32(seed >>> 0), pool = floors.filter(f => {
    const d = Math.hypot(f.x - px, f.z - pz);
    return d >= V.near[0] && d <= V.near[1];
  }), out = [];
  for (let tries = 0; tries < 60 && out.length < n && pool.length; tries++) {
    const f = pool[Math.floor(R() * pool.length)];
    if (out.every(o => Math.hypot(o.x - f.x, o.z - f.z) >= V.apart)) out.push({ x: f.x, y: f.y, z: f.z });
  }
  return out;
}
// A volcano: { x, y, z, t (s since it broke open) }: 'warn', 'erupt' or 'done'
export function ventPhase(v) {
  const V = UMBRA_FIGHT.vents;
  return v.t < V.warn ? 'warn' : v.t < V.warn + V.erupt ? 'erupt' : 'done';
}
// is a body with its feet at (x, y, z) in a volcano's column now (it burns up through the water)?
export function inColumn(v, x, y, z) {
  const C = UMBRA_FIGHT.vents.column;
  return ventPhase(v) === 'erupt' && Math.hypot(x - v.x, z - v.z) < C.r && y > v.y - 0.3 && y < v.y + C.height;
}
// where a lava bomb from it lands (offsets from it), the k-th of its eruption
export function bombAt(v, k, seed) {
  const V = UMBRA_FIGHT.vents, R = mulberry32((seed + k * 7919) >>> 0), a = R() * Math.PI * 2, d = V.spread[0] + R() * (V.spread[1] - V.spread[0]);
  return { dx: Math.cos(a) * d, dz: Math.sin(a) * d };
}

// --- the jets ------------------------------------------------------------------------------------------

// A volley of jets (seed: the same volley, the same jets), aimed at (px, pz) ({ x, z } of a hero):
// from the walls (`side`: 0 from -x along +x, 1 from +x along -x, 2 from -z along +z, 3 from +z along
// -z; `u`: where along the other axis its middle runs, through or near them), and from above
// (`down`: { x, z }, on them or near). box: the reef's ([x0, z0, x1, z1]).
export function jetVolley(seed, px, pz, box = [1, 1, N - 1, N - 1]) {
  const J = UMBRA_FIGHT.jets, R = mulberry32(seed >>> 0), out = [];
  const walls = J.walls[0] + Math.floor(R() * (J.walls[1] - J.walls[0] + 1)), downs = J.downs[0] + Math.floor(R() * (J.downs[1] - J.downs[0] + 1));
  const [x0, z0, x1, z1] = box, clampU = (u, a, b) => Math.min(b - 1, Math.max(a + 1, u));
  for (let i = 0; i < walls; i++) {
    const side = Math.floor(R() * 4), along = side < 2 ? pz : px, off = i === 0 ? (R() - 0.5) * 0.8 : (R() - 0.5) * 6;
    out.push({ kind: 'wall', side, u: side < 2 ? clampU(along + off, z0, z1) : clampU(along + off, x0, x1) });
  }
  for (let i = 0; i < downs; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? R() * 0.4 : 1.5 + R() * 2;
    out.push({ kind: 'down', x: clampU(px + Math.cos(a) * d, x0, x1), z: clampU(pz + Math.sin(a) * d, z0, z1) });
  }
  return out;
}
// the way a wall's jet runs (unit, x and z)
export const jetWay = side => [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
// Is a body (feet at p: { x, y, z }) caught by jet j, which runs `y` high over the bottom (world
// units, a wall's: the bottom of the reef plus its `height`)? A wall's runs across the whole room
// `width` wide unless the ground stands in its way (ground(x, z) over its height between the wall
// and the body: behind a hill you are safe); one from above comes down where it is, `r` round, onto
// whoever is under it (nothing hides them).
export function inJet(j, p, jy, ground = () => -Infinity, box = [1, 1, N - 1, N - 1]) {
  const J = UMBRA_FIGHT.jets;
  if (j.kind === 'down') return Math.hypot(p.x - j.x, p.z - j.z) < J.down.r;
  const [x0, z0, x1, z1] = box, along = j.side < 2 ? p.z : p.x;
  if (Math.abs(along - j.u) > J.width / 2 + 0.25) return false;
  // its height: from a bit under the feet to over the head
  if (jy < p.y - 0.3 || jy > p.y + HEAD_Y + 0.4) return false;
  // from the wall it comes out of to the body: nothing higher than it in the way
  const [wx] = jetWay(j.side), start = j.side === 0 ? x0 : j.side === 1 ? x1 : j.side === 2 ? z0 : z1, at = j.side < 2 ? p.x : p.z;
  const dir = wx || jetWay(j.side)[1];
  for (let s = start + dir * 0.5; (at - s) * dir > 0.4; s += dir * 0.5) {
    const g = j.side < 2 ? ground(s, j.u) : ground(j.u, s);
    if (g > jy + 0.05) return false;
  }
  return true;
}

// --- the mud -----------------------------------------------------------------------------------------

// How much slower mud `depth` deep over the feet makes a body (1: none): a little ankle deep,
// more and more up to the waist, most of all over the head
export function mudSlow(depth) {
  if (!(depth > 0)) return 1;
  const k = Math.min(1, depth / HEAD_Y);
  return depth > HEAD_Y ? 0.35 : 1 - 0.55 * k * (0.6 + 0.4 * k);
}
// The mud's level (levels over the reef's lowest floor) at time t of a mud { step (the step it
// stands at, -1: none yet), from (the level it rises from), t (s since it started that step) }
export function mudLevel(m) {
  const M = UMBRA_FIGHT.mud, to = m.step < 0 ? 0 : M.steps[m.step], k = Math.min(1, m.t / M.rise), e = k * k * (3 - 2 * k);
  return m.from + (to - m.from) * e;
}
// the mud's next step (r: 0..1): up one, or now and then (not from the first) back down one
export function nextMudStep(m, r = Math.random()) {
  const M = UMBRA_FIGHT.mud, top = M.steps.length - 1;
  const step = m.step > 0 && (r < M.ebb || m.step === top) ? m.step - 1 : Math.min(top, m.step + 1);
  return { step, from: mudLevel(m), t: 0 };
}
// its level in world units, the reef's lowest floor at `low` (world units)
export const mudY = (m, low) => low + mudLevel(m) * LH;
