// Rollie and Megalimmer's fight as rules (game/rollie.js runs it; their profiles are
// core/enemies.js ROLLIE and MEGALIMMER). docs/bosses.md tells the whole fight.
//
// Two bosses at once, from the kids' drawing: Rollie, a big Spicy on wheels with eyes on stalks,
// angry brows and long wavy arms, who fights with lasers; and Megalimmer, a ghost twice the hero's
// height, a sheet thrown over nothing but a ball, blurry like a Flimmer. One phase. They take
// turns (`turn`): one of them is the `main` one, who goes for you with all he has; the other keeps
// to the side, so that most of the time there is one to watch, and only now and then joins in, never
// while the main one is in the middle of an attack (`calm`):
//   Rollie at the side  keeps 6 to 9 cells off, round to the side of where the main one is (never
//                       right behind you: `sidePoint`), and now and then sweeps a beam after you or
//                       makes the floor blink round you (the sweep and the grid, below)
//   Megalimmer at the side  runs round you fast, closer and closer (`spiral`), sending twisters at
//                       you (`twisters`), and breaks off to beat you (`breaks`), always at the end
// The main one swaps after `turn` s, or sooner when he is hurt fast (`hurt`). Beaten one, the other
// fights on as before, taking turns with nobody: his turns at the side are as they were.
//
// Rollie's lasers:
//   laser   the Spicy's laser, bigger (a beam: core/beams.js)
//   sabers  two blades of light out of his hands, thrown like boomerangs: they curve after you
//           (`stepSaber`), turn back after `out` s and fly back into his hands, cutting whom they
//           touch on the way out and on the way back
//   sweep   a thin beam that follows you for `time` s (`track` cells/s, slower than you run: it
//           starts beside you, `lead` cells off), burning every `tick` s while it touches you
//   grid    floor cells round you blink (`warn` s), then lasers strike them from above; `waves` of
//           them, `every` s apart, your own cell always among them (`gridCells`)
// Megalimmer: he beats you like a Flimmer (bigger), turns invisible for `vanish.time` s (blows
// still reach him), sends a Stun flimmer at you that stuns you, and calls Ghost flimmers.
import { RUN_SPEED } from './constants.js';

export const ROLLIE_FIGHT = Object.freeze({
  turn: [15, 20],                               // s a turn as the main one lasts
  hurt: { share: 0.15, within: 4, least: 6 },   // the main one losing this share of his health within `within` s swaps (not in his first `least` s)
  calm: 1,                                      // s after the main one's attack the one at the side may start one
  wake: 6,                                      // cells: a player this close to either wakes them both
  // Rollie at the side: this near and far from whom he goes after, this far round (rad) from the main one
  side: { near: 6, far: 9, round: 1.9, every: 0.8 },
  // the attacks' rhythm, s: the first, then between one and the next ([least, most])
  rollie: { sweep: { first: 4, every: [8, 11] }, grid: { first: 7, every: [9, 12] }, summon: { first: 9, every: [18, 22], most: 2 } },
  megalimmer: { vanish: { first: 4, every: [12, 16] }, stunner: { first: 6, every: [10, 14], most: 1 },
    flimmers: { first: 9, every: [18, 22], most: 3 } },
  vanish: { time: 3, fade: 0.35 },              // s invisible, s to fade out and back in
  // Megalimmer's running round: from `from` to `to` cells round whom he goes after over `time` s, at
  // twice the hero's run; no faster round than `spin` rad/s; he breaks off once in the middle of it
  // (`midway`: the share of the way, that likely) and always at its end, dashing in at `dash`
  spiral: { from: 4.5, to: 1.5, time: 9, speed: 2 * RUN_SPEED, spin: 3.2, midway: [0.35, 0.7], chance: 0.4, dash: 7, catch: 1.5 },
  // the twisters he sends at you while he runs round: every [least, most] s, at most `most` about
  // (their blow: core/enemies.js MEGA_TWISTER)
  twisters: { every: [2.2, 3.2], most: 3,
    spec: { speed: 4.6, range: 13, radius: 0.34, height: 1.2, bend: 0.3, lift: 1.3, spin: 1, hands: [[0, 0.5, 0.6]] } },
  // a Stun flimmer goes after `life` s at most, and once it has struck
  stunner: { life: 7, linger: 0.4 },
  sabers: { speed: 9, turn: 2.6, out: 1.15, back: 11, catch: 0.7, radius: 0.55, rise: 1, spin: 16 },
  sweep: { time: 3, track: 1.9, lead: 2.6, radius: 0.32, range: 16, tick: 0.35 },
  grid: { cells: 8, near: 3.5, waves: 3, every: 1.1, warn: 1, strike: 0.35, rise: 1.5 },
  minionsLeave: 0.8,                            // s the minions take to go once both are beaten
});
const F = ROLLIE_FIGHT;

export const between = ([a, b], r = Math.random()) => a + (b - a) * r;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// The turns. A fight: { main: 'rollie' | 'megalimmer', turn (s left of it), t (s into it), log
// ([{ t, hp }] the main one's health over the last `hurt.within` s), now (s into the fight) }.
export const newTurns = (main = 'rollie', r = Math.random()) => ({ main, turn: between(F.turn, r), t: 0, log: [], now: 0 });
// one step of the turns, with the main one's health now (hp, of most) and whether the other one
// still stands: true when they swap now (a swap swaps `main`)
export function stepTurns(T, dt, hp, most, other, r = Math.random()) {
  T.now += dt; T.t += dt; T.turn -= dt;
  T.log.push({ t: T.now, hp });
  while (T.log.length && T.log[0].t < T.now - F.hurt.within) T.log.shift();
  const hurt = T.t >= F.hurt.least && T.log[0].hp - hp >= F.hurt.share * most;
  if (T.turn > 0 && !hurt) return false;
  if (other) T.main = T.main === 'rollie' ? 'megalimmer' : 'rollie';
  T.side = !other && !T.side;   // (one left alone takes turns with nobody: at the side every other turn)
  Object.assign(T, { turn: between(F.turn, r), t: 0, log: [] });
  return true;
}

// Where Rollie stands at the side, round player p ({ x, z }), from himself at r ({ x, z }), the main
// one at m (null: none): round to the side of the main one (`side.round` either way, the nearer to
// where he is), as far from p as he is, but no nearer than `near` nor further than `far`.
export function sidePoint(p, r, m) {
  const S = F.side, mine = Math.atan2(r.x - p.x, r.z - p.z), d = Math.min(S.far, Math.max(S.near, Math.hypot(r.x - p.x, r.z - p.z)));
  let a = mine;
  if (m) {
    const base = Math.atan2(m.x - p.x, m.z - p.z), one = base + S.round, two = base - S.round;
    a = Math.abs(wrap(one - mine)) < Math.abs(wrap(two - mine)) ? one : two;
  }
  return { x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d };
}

// Megalimmer running round: c = { a (rad round the player), dir (±1), t (s along the spiral) }.
// How far round the player he runs, t s along it
export const spiralRadius = t => F.spiral.from + (F.spiral.to - F.spiral.from) * Math.min(1, Math.max(0, t / F.spiral.time));
// ... and how far along it a radius r lies (to go on round from where a beating left him)
export const spiralTime = r => F.spiral.time * Math.min(1, Math.max(0, (F.spiral.from - r) / (F.spiral.from - F.spiral.to)));
// The point he runs for after dt s more round player p: round at his speed (no faster than `spin`)
export function spiralStep(c, p, dt) {
  c.t += dt;
  const r = spiralRadius(c.t), w = Math.min(F.spiral.spin, F.spiral.speed / r);
  c.a += c.dir * w * dt;
  return { x: p.x + Math.sin(c.a) * r, z: p.z + Math.cos(c.a) * r, r };
}
// a new run round from where he is, at s (along the spiral: 0 from the widest), its break midway
// (null: none this time) and the way round
export function newSpiral(e, p, t = 0, r = Math.random) {
  return { a: Math.atan2(e.x - p.x, e.z - p.z), dir: r() < 0.5 ? -1 : 1, t,
    midway: r() < F.spiral.chance ? F.spiral.time * between(F.spiral.midway, r()) : null };
}

// A laser blade: { x, y, z, h (heading, rad), out (true on the way out), t, home ({ x, y, z }: the
// hand it flies back into, given each step), hit (Set: whom it cut on this way), spin (rad) }.
export const newSaber = (at, h) => ({ ...at, h, out: true, t: 0, hit: new Set(), spin: 0, done: false });
// one step of blade s after target (or null) and back home; done once caught
export function stepSaber(s, target, home, dt) {
  const S = F.sabers;
  s.t += dt; s.spin += S.spin * dt;
  if (s.out) {
    if (target) {
      const want = Math.atan2(target.x - s.x, target.z - s.z), off = wrap(want - s.h);
      s.h += Math.max(-S.turn * dt, Math.min(S.turn * dt, off));
      s.y += Math.max(-S.rise * dt, Math.min(S.rise * dt, target.y - s.y));
    }
    s.x += Math.sin(s.h) * S.speed * dt; s.z += Math.cos(s.h) * S.speed * dt;
    if (s.t >= S.out) { s.out = false; s.hit = new Set(); }
    return s;
  }
  const dx = home.x - s.x, dy = home.y - s.y, dz = home.z - s.z, d = Math.hypot(dx, dy, dz);
  if (d <= Math.max(S.catch, S.back * dt)) { Object.assign(s, home); s.done = true; return s; }
  s.h = Math.atan2(dx, dz);
  s.x += dx / d * S.back * dt; s.y += dy / d * S.back * dt; s.z += dz / d * S.back * dt;
  return s;
}
// does blade s cut body b ({ x, y, z, r?, h? }: its feet)?
export const sabreCuts = (s, b) => Math.hypot(b.x - s.x, b.z - s.z) < F.sabers.radius + (b.r ?? 0.3) && s.y > b.y - 0.2 && s.y < b.y + (b.h ?? 1.1) + 0.3;

// The sweep's beam: from `from` to its aim ({ x, y, z }), which starts `lead` cells to the side of
// whom it follows and follows them at `track` cells/s. Moves the aim towards target (dt s).
export function trackAim(aim, target, dt) {
  const dx = target.x - aim.x, dz = target.z - aim.z, d = Math.hypot(dx, dz), step = Math.min(d, F.sweep.track * dt);
  if (d > 1e-6) { aim.x += dx / d * step; aim.z += dz / d * step; }
  aim.y += (target.y - aim.y) * Math.min(1, dt * 4);
  return aim;
}
// the aim's start beside p, seen from e (to its left or right, `side` ±1)
export function sweepStart(e, p, side) {
  const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
  return { x: p.x + dz / d * F.sweep.lead * side, y: p.y, z: p.z - dx / d * F.sweep.lead * side };
}
// how far point b is from the beam from `from` through `aim` (and on a little past it)
export function beamGap(from, aim, b) {
  const ux = aim.x - from.x, uy = aim.y - from.y, uz = aim.z - from.z, l = Math.hypot(ux, uy, uz) || 1;
  const k = Math.max(0, Math.min(l + 1, ((b.x - from.x) * ux + (b.y - from.y) * uy + (b.z - from.z) * uz) / l));
  return Math.hypot(from.x + ux / l * k - b.x, from.y + uy / l * k - b.y, from.z + uz / l * k - b.z);
}

// The grid's cells for a wave round p's cell ({ x, z }: its column), out of `floors` ([{ x, z }]:
// where it may strike, about p's level): p's own first, then others within `near` cells, picked at
// random (r: a random source), `cells` in all, none twice.
export function gridCells(p, floors, r = Math.random) {
  const own = floors.find(f => f.x === p.x && f.z === p.z);
  const near = floors.filter(f => f !== own && Math.hypot(f.x - p.x, f.z - p.z) <= F.grid.near);
  for (let i = near.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [near[i], near[j]] = [near[j], near[i]]; }
  return [...(own ? [own] : []), ...near].slice(0, F.grid.cells);
}

// What either may start now (the names the shared AI must not start: game/enemyai.js `barred`).
// who: 'rollie' | 'megalimmer'; main: is he the main one now; due: { name: true } what his timers
// let him start; busy: the other is in the middle of an attack (or was, `calm` s ago); room: the
// summons that have room ({ summon, stunner, flimmers }).
const SIDE_ATTACKS = { rollie: new Set(['sweep', 'grid']), megalimmer: new Set() };
const TIMED = new Set(['sweep', 'grid', 'summon', 'vanish', 'stunner', 'flimmers']);
export function barredFor(who, names, { main, due, busy, room, hidden = false }) {
  return new Set(names.filter(n => {
    if (TIMED.has(n) && !due[n]) return true;
    if (['summon', 'stunner', 'flimmers'].includes(n) && !room[n]) return true;
    if (n === 'vanish' && hidden) return true;
    if (main) return false;
    return busy || !SIDE_ATTACKS[who].has(n);
  }));
}
