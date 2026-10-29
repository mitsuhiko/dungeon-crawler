// Trials (docs/trials.md): rooms built around one goal that is more than walking to the exit.
// Pure rules and data, shared by the world (the plan), the generator, the game and the tests.
//
// Two families: events change the room while you are in it (timed, the room sealed, failing
// puts you back in the room before); puzzles are untimed and open (walk away, come back).
//
//   kind: { id, name (what the warning on the portal says), family: 'event' | 'puzzle',
//           sealed, timed, depths: [first, last], themes (theme ids it fits, null: any),
//           weight (when drawn among the kinds that fit), color, built (planned at all),
//           strict (its themes hold even for a sunken room's stages: the ice slide is ice only),
//           population (how many enemies live in the room, times the usual),
//           combines (a combiner: how many puzzles of the rotation it holds, world/trials.js
//           combinerStages), mounts (a puzzle a combiner may hold: cubegen/trials/puzzles.js) }
import { msg } from '../i18n/i18n.js';

export const TRIALS = {
  flood: { name: msg('Rising water'), family: 'event', sealed: true, timed: true, depths: [1, 19], themes: null, weight: 1, color: '#3fa8ff', built: true,
    population: 0.5 },
  sunken: { name: msg('The sunken room'), family: 'event', sealed: false, timed: false, depths: [2, 19], themes: null, weight: 1, color: '#3fd0c0', built: true,
    population: 0.3, combines: 2 },
  collapse: { name: msg('Crumbling floor'), family: 'event', sealed: true, timed: true, depths: [1, 19], themes: null, weight: 1, color: '#e0a050', built: true,
    population: 0.3 },
  // (retries: a miss the robot pulls the hero out of puts the room back for a new try, game/rescue.js)
  balance: { name: msg('Balance'), family: 'event', sealed: true, timed: true, depths: [1, 19],
    themes: ['swamp', 'nests', 'ruins', 'volcanic', 'abyss', 'ossuary', 'forge'], weight: 1, color: '#e09050', built: true, population: 0, retries: true },
  cold: { name: msg('Cold snap'), family: 'event', sealed: true, timed: true, depths: [1, 13], themes: ['peaks', 'frozen'], weight: 1.5, color: '#9fe8ff', built: true,
    population: 0.5 },
  storm: { name: msg('The storm'), family: 'event', sealed: true, timed: true, depths: [1, 6],
    themes: ['meadow', 'clouds', 'lagoon', 'karst', 'peaks', 'highlands', 'badlands', 'saltflats', 'canyon'], weight: 1, color: '#b0b8ff', built: true,
    population: 0.3 },
  siege: { name: msg('Hold the beacon'), family: 'event', sealed: true, timed: true, depths: [2, 19], themes: null, weight: 1, color: '#ff7a3a', built: true,
    population: 0.3, armByPart: true },
  chase: { name: msg('The relic'), family: 'event', sealed: true, timed: true, depths: [4, 19], themes: null, weight: 1, color: '#ff4060', built: true,
    population: 0, armByPart: true },
  miasma: { name: msg('Sinking fog'), family: 'event', sealed: true, timed: true, depths: [5, 19], themes: 'walled', weight: 1, color: '#9adf50', built: true,
    population: 0.5 },
  slide: { name: msg('Ice slide'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['peaks', 'frozen'], strict: true, weight: 2, color: '#bfe8ff', built: true,
    population: 0.5, mounts: true },
  mirror: { name: msg('Mirror beam'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['mines', 'forge', 'ruins', 'abyss', 'highlands'], weight: 1.5, color: '#ffe060', built: true,
    population: 0.5, mounts: true },
  braziers: { name: msg('Lights out'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#ffa040', built: true,
    lean: { ossuary: 2.5, ruins: 2.5 }, population: 0.5, mounts: true },
  crates: { name: msg('Crates on plates'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#c09060', built: true,
    population: 0.5, mounts: true },
  timedgate: { name: msg('Timed gate'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: null, weight: 1, color: '#f0d0a0', built: true,
    population: 0.5 },
  runes: { name: msg('Rune order'), family: 'puzzle', sealed: false, timed: false, depths: [1, 19], themes: ['ruins', 'highlands', 'ossuary', 'karst', 'abyss'], weight: 1.5, color: '#c0a0ff',
    built: true, population: 0.5 },
};
for (const [id, t] of Object.entries(TRIALS)) t.id = id;
export const TRIAL_KINDS = Object.keys(TRIALS);

// a trial resolved is its gate in run.unlockedGates (core/guardians.js portalLocked)
export const trialGate = key => `trial:${key}`;
export const isTrialGate = g => typeof g === 'string' && g.startsWith('trial:');
export const trialOf = kind => TRIALS[kind] ?? null;
export const isEvent = kind => TRIALS[kind]?.family === 'event';
export const isPuzzle = kind => TRIALS[kind]?.family === 'puzzle';

// does kind fit depth d of theme `theme` (themes/index.js)? force: the dev's ?trial= lifts the limits
export function trialFits(kind, d, theme, force = false) {
  const t = TRIALS[kind];
  if (!t) return false;
  if (force) return true;
  if (!t.built || d < t.depths[0] || d > t.depths[1]) return false;
  if (t.themes === 'walled') return !!(theme.cave || theme.walls);
  return !t.themes || t.themes.includes(theme.props);
}

// the weight of a kind in theme `theme`
export const trialWeight = (kind, theme) => TRIALS[kind].weight * (TRIALS[kind].lean?.[theme.props] ?? 1);

// ?trial=<kind> or ?trial=sunken:slide,mirror (dev, tests): { kind, stages } or null
export function parseForce(s) {
  if (!s) return null;
  const [kind, rest] = String(s).split(':');
  if (!TRIALS[kind]) return null;
  return { kind, stages: rest ? rest.split(',').filter(k => isPuzzle(k)) : null };
}

// --- timing (docs/trials.md "Timing check") -----------------------------------------------------

export const ARM_TIME = 3;   // s of telegraph between arming and the clock running
// The pace every timed event is checked and fitted against: the hero runs (RUN_SPEED: the game
// always does), and a slow player takes SLACK times as long as the fastest way, plus REACT s to
// take in the banner. The hazard is fitted as close to that slow player as it allows, so that a
// perfect runner comes within CLOSE s of it at least once (the tests check both sides).
// learn: world.html#trial-check (see learn/README.md)
export const SLACK = 1.3;
// learn: world.html#trial-check (see learn/README.md)
export const REACT = 1.5;
// learn: world.html#trial-check (see learn/README.md)
export const CLOSE = 5;
// when the slow player gets where a perfect runner is at t s (the trial's clock: from arming)
export const slowTime = t => t * SLACK + REACT;
export const DRAIN_TIME = 5;   // s for the water to drain back once resolved
export const SPENT_DRAIN = 1;  // ... and once spent: as the robot pulls the hero out (game/rescue.js)
const drainOf = s => s.phase === 'spent' ? SPENT_DRAIN : DRAIN_TIME;

// The flood's timeline: the water starts at `from` (levels) and rises in pulses of `step` levels,
// each over `rise` s, the j-th starting at pulses[j] s (the trial's clock: from arming), never over
// `to`. Pure data: physics, render and tests all read the same thing.
//   { kind: 'flood', from, to, step, rise, pulses: [s, ...] }
export const FLOOD = { step: 2, rise: 2, max: 70 };

// the water's level (in levels, fractional) at time t of the trial's clock
export function floodLevel(tl, t) {
  let level = tl.from;
  for (let j = 0; j < tl.pulses.length; j++) {
    const p = tl.pulses[j];
    if (t <= p) break;
    level = tl.from + tl.step * j + tl.step * Math.min(1, (t - p) / tl.rise);
  }
  return Math.min(level, tl.to);
}

// the first time the water stands over level h (null: never)
export function floodTime(tl, h) {
  if (h < tl.from) return 0;
  if (h >= tl.to) return null;
  const j = Math.floor((h - tl.from) / tl.step);
  if (j >= tl.pulses.length) return null;
  return tl.pulses[j] + tl.rise * (h - tl.from - tl.step * j) / tl.step;
}

// when the next pulse starts after time t (null: no more), for the HUD's countdown
export const nextPulse = (tl, t) => tl.pulses.find(p => p > t) ?? null;
// the time the water is up (the last pulse done)
export const floodEnd = tl => (tl.pulses.at(-1) ?? 0) + tl.rise;

// draining back: from level `at` down to `from` over DRAIN_TIME, s seconds after resolving
export const drainLevel = (tl, at, s, T = DRAIN_TIME) => at - (at - tl.from) * Math.min(1, s / T);

// Fit a flood's pulses to the way up: needs[j] is the earliest the j-th pulse may start (a slow
// player has left every floor it floods by then). Each pulse starts then, no later: the water
// comes up behind the slow player; but never before the one before it is done (the water rises
// `step` levels in `rise` s at the fastest) nor while the room is still armed. null: it cannot be
// done within FLOOD.max s (the way up is too long).
export function fitFlood(from, to, needs = [], step = FLOOD.step, rise = FLOOD.rise) {
  const n = Math.max(1, Math.ceil((to - from) / step)), pulses = [];
  for (let j = 0; j < n; j++) pulses.push(Math.ceil(Math.max(needs[j] ?? 0, ARM_TIME, j ? pulses[j - 1] + rise : 0) * 100) / 100);
  if (pulses.at(-1) + rise > FLOOD.max) return null;
  return { kind: 'flood', from, to, step, rise, pulses };
}

// --- miasma -----------------------------------------------------------------------------------------
// The fog (a flood upside down): timeline { kind: 'miasma', top (levels: where its underside
// starts), from: 0, to (the levels it sinks), step, rise, pulses }. Its underside's height (world
// units) at time t; resolved, it lifts back up over DRAIN_TIME. A head in it hurts: FOG.hurt of the
// max HP a second, FOG.more more for every further second in it. It sinks a step in FOG.rise s at
// the fastest (quicker than the water rises: a way down drops faster than a way up climbs).
export const FOG = { over: 3, rise: 1, hurt: 0.06, more: 0.03, pulses: 8 };   // (pulses: at most, the steps grow to fit)
export const fogLevel = (tl, t) => tl.top - floodLevel(tl, t);   // (levels)
export function fogY(m, s) {
  if (!m?.timeline || m.kind !== 'miasma' || !s || s.phase === 'idle') return null;
  const tl = m.timeline;
  const T = drainOf(s);
  if (s.phase === 'resolved' || s.phase === 'spent') return s.at == null || s.done >= T ? null : (s.at + (tl.top + 6 - s.at) * Math.min(1, s.done / T)) * 0.5;
  return fogLevel(tl, s.t) * 0.5;
}
export const fogHurt = (maxHp, inFor) => maxHp * (FOG.hurt + FOG.more * inFor);

// --- cold --------------------------------------------------------------------------------------------
// Each player's cold meter (0-100): away from warmth it rises to 100 in `freeze` s (the room's,
// map.trial.freeze); within COLD.radius cells of a lit brazier (or the great fire) it drops
// COLD.thaw times as fast. At 100 you freeze. The generator fits the room's freezing time so that a
// perfect runner going straight for the great fire freezes at COLD.dash of the way (between
// COLD.quick and COLD.freeze s), and sets the braziers so that the meter of a slow player lighting
// them on the way never goes over COLD.reach; the braziers at least COLD.apart cells apart; along:
// how many on the way (at least, at most); least: the cells the way takes at least.
export const COLD = { freeze: 20, quick: 7, dash: 0.8, radius: 2.5, thaw: 4, reach: 0.9, apart: 6, along: [1, 6], least: 25 };
export function coldStep(meter, dt, warm, freeze = COLD.freeze) {
  const rate = 100 / freeze;
  return Math.max(0, Math.min(100, meter + (warm ? -rate * COLD.thaw : rate) * dt));
}

// --- storm -------------------------------------------------------------------------------------------
// The gusts, in a steady cycle of STORM.period s from the clock running: a warning, the gust, a
// lull. Out on the hill's ramp and not behind a boulder, a gust pulls a body outwards off the hill
// (away from its eye) at STORM.speed cells/s and takes STORM.hold of its steering against it
// (physics/move.js pulled): over the ramp's edge. A slow player crosses each stretch out in the
// wind within (lull + warning) / SLACK; the boulders stand as far apart as that lets (a perfect
// runner's longest stretch at least STORM.wait), so the gusts must be waited out behind them.
export const STORM = { warning: 1.5, gust: 2.5, lull: 3.5, period: 7.5, speed: 2.6, hold: 0.5, shun: 5, wait: 1.75 };   // (shun: the way checked keeps to the shelter, exposed time counting so much more)
export const stormAllowance = () => (STORM.lull + STORM.warning) / SLACK;
export function stormPhase(t) {
  if (t < ARM_TIME) return { phase: 'calm', left: ARM_TIME - t };
  const c = (t - ARM_TIME) % STORM.period;
  return c < STORM.warning ? { phase: 'warning', left: STORM.warning - c } : c < STORM.warning + STORM.gust ? { phase: 'gust', left: STORM.warning + STORM.gust - c }
    : { phase: 'lull', left: STORM.period - c };
}

// --- siege ---------------------------------------------------------------------------------------------
// HOLD s in the ring (it fills only while a player is in it; it pauses, never drops) from depth 2's 45
// to depth 19's 90; four waves come at even shares of it.
export const SIEGE = { waves: 4 };
export const holdTime = depth => Math.round(45 + 45 * Math.max(0, Math.min(1, (depth - 2) / 17)));

// --- chase: the relic ---------------------------------------------------------------------------------
// Taking the relic arms the room; `wake` s later (the room's, map.trial.wake) its warden breaks out of
// its lair: a kind of the depth's roster (its heaviest that fights up close), HUNTER.mods stronger,
// hunting the players over the floor graph (no ladders, no jumps) at HUNTER.ratio times the speed its
// quarry runs at now (a swiftness potion quickens it too, a chill slows it): faster than you. Its
// waking is fitted per room: as soon as still lets a slow player pull the lever before it is at the
// gate, between HUNTER.wake and HUNTER.late s. Dropping the portcullis (the lever inside the gate)
// traps it; killing it ends the hunt as well.
export const HUNTER = { wake: 1, late: 6, ratio: 1.2, mods: { hp: 6, damage: 2, size: 1.35, xp: 2 }, mass: 4, least: 12, linger: 6 };

// --- runes ---------------------------------------------------------------------------------------------
// A rune room's stones and the order to press them in, from the trial's id alone (the clue's tablet,
// in another room, says the same): 4 stones at depths 1-9, 5-6 from 10, each a glyph of the set.
export const RUNE_GLYPHS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
export function runeOrder(id, depth) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const R = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const n = depth < 10 ? 4 : 5 + (R() < 0.5 ? 0 : 1), pool = [...RUNE_GLYPHS], glyphs = [];
  for (let i = 0; i < n; i++) glyphs.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { glyphs, order };
}
// the clue read for good (the hero remembers it): kept in run.trials (saved, like a sunken room's stage)
export const clueMark = key => `clue:${key}`;

// --- states (docs/trials.md "States") ------------------------------------------------------------
//   idle      the room as built; an event arms when a player steps off the arrival pad
//   armed     ARM_TIME s of telegraph: the banner, the rumble; nothing hurts yet
//   running   the clock runs (t, from arming on): the water rises
//   resolved  the goal is met; `done` counts the s since (the water drains back)
//   spent     the attempt is over without a death: the robot carried the hero back to the start
//             (game/rescue.js). The seals open, the clock stops, the water drains back (the fog
//             lifts) as when resolved, the crust all falls away, and it does not arm again:
//             leaving the room and coming back starts it over (a new state, game/trials.js enterTrial).
//             (Not a kind that `retries`: there the robot puts it back to idle for a new try.)
// One state per trial room a game is in: { key, kind, phase, t, done, at (the water's level when
// it was resolved or spent) }. Puzzles never arm: they are just there.

export const ARM_DISTANCE = 1.2;   // cells off the arrival pad that arm an event
// bits: a puzzle's state, part id -> a small number (a lever's 0/1, a plate held ...); start: the
// puzzle's own start (its parts as the generator left them, map.trial.start)
export const newTrial = (trial, resolved = false) => ({ key: trial.key, kind: trial.kind, phase: resolved ? 'resolved' : 'idle', t: 0,
  done: resolved ? Infinity : 0, at: null, bits: { ...trial.start }, ...trial.kind === 'balance' && { stones: {} } });

// One step of dt s. input: { away (a player stepped off the arrival pad) }. Returns what happened:
// 'armed', 'running' (the phase it came into), or nothing.
export function stepTrial(s, dt, input = {}) {
  if (s.phase === 'idle') {
    if (isEvent(s.kind) && TRIALS[s.kind].timed && !TRIALS[s.kind].armByPart && input.away) { s.phase = 'armed'; s.t = 0; return 'armed'; }
    return null;
  }
  if (s.phase === 'resolved' || s.phase === 'spent') { s.done += dt; return null; }
  s.t += dt;
  if (s.phase === 'armed' && s.t >= ARM_TIME) { s.phase = 'running'; return 'running'; }
  return null;
}

// Sealed (docs/trials.md "Sealing"): while an event of a sealed kind is armed or running, no
// portal, open face, scroll or teleport takes anyone out of its room
export const trialSealed = s => !!s && !!TRIALS[s.kind]?.sealed && (s.phase === 'armed' || s.phase === 'running');
export const SEALED_MESSAGE = msg('The way out is sealed');   // (said with tr where it shows)

// the goal is met (level: the water's level then, for it to drain back from)
export function resolveTrial(s, level = null) {
  if (s.phase === 'resolved') return false;
  s.phase = 'resolved'; s.done = 0; s.at = level;
  return true;
}
// the attempt is over, the room left as it is (level: the water's level then, for it to drain back
// from; the fog's for the miasma). Only an event that is armed or running is spent.
export function spendTrial(s, level = null) {
  if (s.phase !== 'armed' && s.phase !== 'running') return false;
  s.phase = 'spent'; s.done = 0; s.at = level;
  return true;
}
// back as built (a fail, a death, nobody left in the room)
export function resetTrial(s, start = {}) { Object.assign(s, { phase: 'idle', t: 0, done: 0, at: null, bits: { ...start }, ...s.kind === 'balance' && { stones: {} } }); }

// what a part does when used (F): the puzzle's bits after it (a lever flips, a button stays down);
// a reset lever puts every bit back to the start
export function useBit(s, part, start = {}) {
  if (part.type === 'lever') s.bits[part.id] = s.bits[part.id] ? 0 : 1;
  else if (part.type === 'button') s.bits[part.id] = 1;
  else if (part.type === 'reset') s.bits = { ...start };
  return s.bits;
}
// is a plate held? by anything standing on its cell: bodies [{ x, y, z }] (players, crates)
export const plateHeld = (p, bodies) => bodies.some(b => Math.floor(b.x) === Math.floor(p.x) && Math.floor(b.z) === Math.floor(p.z) && Math.abs(b.y - p.y) < 0.6);

// the level (in levels) the trial's fluid stands at in map trial `m` with state s, or null for none
export const BASIN = 2;   // the collapse's basin: its fluid's surface (cubegen/river.js RIVER_SURF)
export function trialFluidLevel(m, s) {
  if (!m || !s) return null;
  if (m.kind === 'sunken') return sunkenLevel(m, s);
  // the balance: its basin stands over the room's own sea (cubegen/river.js RIVER_SURF, under the
  // stones' level) in every phase, resolved too: it must not drop when the stones rise and hold
  if (m.kind === 'balance') return m.basin;
  // the collapse: what falls through the crust is in the basin's fluid (its surface over every hole)
  if (m.kind === 'collapse') return s.phase === 'armed' || s.phase === 'running' || s.phase === 'spent' ? BASIN : null;
  if (m.kind !== 'flood') return null;
  const tl = m.timeline;
  if (s.phase === 'idle') return null;
  if (s.phase === 'resolved' || s.phase === 'spent') return s.at == null || s.done >= drainOf(s) ? null : drainLevel(tl, s.at, s.done, drainOf(s));
  return floodLevel(tl, s.t);
}

export const PART_REACH = 1.1;   // how near a part (a button, a lever ...) has to be to use it (cells)

// About how long a trial room takes a player who knows what to do (s): the balance simulation's
// estimate (tools/balance.mjs). An event: its clock to the goal (about the slow player's, the
// hazard fitted to it); a puzzle: walking it through.
export const TRIAL_TIME = { flood: 18, collapse: 16, balance: 25, slide: 60, sunken: 150, mirror: 60, braziers: 50, crates: 120, timedgate: 40,
  miasma: 10, cold: 20, storm: 25, siege: 75, chase: 20, runes: 45 };
export const trialTime = kind => TRIAL_TIME[kind] ?? 60;

// --- collapse ----------------------------------------------------------------------------------------
// The crust crumbles in a wave from the entry: a crust cell d cells (over the crust) from the entry
// apron goes at ARM_TIME + delay + d / speed, shaking for WAVE.shake s before. Both are fitted per
// room (cubegen/trials/index.js): the speed the slow player's own pace along the crust (between
// WAVE.speed and WAVE.fastest cells/s), the delay as little as lets that slow player outrun it, plus
// WAVE.margin s (at most WAVE.most).
export const WAVE = { speed: 1.3, fastest: 2.8, margin: 0.3, most: 8, shake: 1.5 };
export const crumbleTime = (wave, d) => ARM_TIME + wave.delay + d / wave.speed;

// is crust cell q ({ d }) of trial m gone at state s? (shaking: the SHAKE s before)
// ('rising': a rhythm stone coming up, not there yet for the physics, like 'gone')
export function crustState(m, s, q) {
  if (!s || s.phase === 'resolved') return 'whole';
  const slab = m.kind === 'balance' ? m.slabs?.[q.stone] : null;
  // (a rhythm stone stands as its beat has it at the start while nobody has set off)
  if (s.phase === 'idle') return slab?.kind === 'rhythm' ? rhythmState(slab, 0) : 'whole';
  // spent: all of it falls away (the slabs sink), so nobody crosses a room that can no longer be won
  if (s.phase === 'spent') return 'gone';
  if (m.kind === 'balance') {
    if (slab?.kind === 'rhythm') return rhythmState(slab, s.t);
    const at = s.stones?.[q.stone];
    return at == null ? 'whole' : s.t >= at + stoneTime(m, q.stone) ? 'gone' : 'shaking';
  }
  const at = crumbleTime(m.wave, q.d);
  return s.t >= at ? 'gone' : s.t >= at - WAVE.shake ? 'shaking' : 'whole';
}

// The balance's stones come in three kinds (map.trial.slabs[stone].kind, cubegen/trials/index.js
// finishBalance):
//   steady  grey: sinks STONE_TIME s after its first grounded landing
//   quick   pale: the same, but QUICK_TIME s
//   rhythm  dark: rises and sinks on a beat of its own on the trial's clock, whoever stands on it:
//           up for `up` s of every `period` (shaking the last RHYTHM.shake of them), then under,
//           coming up (seen, not yet there) the last RHYTHM.rise s before it is up again;
//           `offset`: where in its beat it is at the trial's 0
// A steady or quick slab's clock starts at its first grounded landing. Leaving it, landing again
// or another player arriving never buys more time. The clock runs while airborne.
export const STONE_TIME = 3, QUICK_TIME = 2;
export const RHYTHM = { shake: 1.2, rise: 0.8 };
export const stoneTime = (m, stone) => m?.slabs?.[stone]?.kind === 'quick' ? QUICK_TIME : STONE_TIME;
// where rhythm stone `slab` is in its beat at t (s since it was last up)
export const beatAt = (slab, t) => ((t + slab.offset) % slab.period + slab.period) % slab.period;
export function rhythmState(slab, t) {
  const u = beatAt(slab, t);
  return u < slab.up - RHYTHM.shake ? 'whole' : u < slab.up ? 'shaking' : u < slab.period - RHYTHM.rise ? 'gone' : 'rising';
}
// the time the rhythm stone that is up at t came up and goes under ({ from, to }), or null (it is not up)
export function rhythmWindow(slab, t) {
  const u = beatAt(slab, t);
  return u < slab.up ? { from: t - u, to: t - u + slab.up } : null;
}
// how long the stone has before it sinks (s; null: no clock running on it)
export function stoneLeft(m, s, stone) {
  const slab = m?.slabs?.[stone];
  if (slab?.kind === 'rhythm') { const w = rhythmWindow(slab, s.t); return w ? w.to - s.t : 0; }
  const at = s?.stones?.[stone];
  return at == null ? null : Math.max(0, at + stoneTime(m, stone) - s.t);
}
export function touchStone(m, s, stone) {
  if (m?.kind !== 'balance' || !s || (s.phase !== 'armed' && s.phase !== 'running')
    || !Number.isInteger(stone) || !m.crust.some(q => q.stone === stone) || s.stones?.[stone] != null
    || m.slabs?.[stone]?.kind === 'rhythm') return false;
  (s.stones ??= {})[stone] = s.t;
  return true;
}

// --- puzzles: parts (docs/trials.md "Puzzle parts") ----------------------------------------------
// A puzzle is a layout of parts plus a rule. map.trial.parts: [{ id, type, x, y, z, yaw?, ... }]
//   lever    F toggles it          button  F presses it once     plate   pressed while stood on
//   gate     a portcullis across a gap (a box in the way while shut)
//   reset    F puts the puzzle back to its start
// The puzzle's state is a few bits and small numbers (state.trial.bits: part id -> value).
export const PART_LABELS = { button: msg('Press the button'), lever: msg('Pull the lever'), reset: msg('Pull the lever: start again'),
  mirror: msg('Turn the mirror'), brazier: msg('Light or put out the brazier'), crate: null, valve: msg('Open the vent valve'),
  warm: msg('Light the brazier'), fire: msg('Light the great fire'), rod: msg('Pull the lightning rod'), beacon: msg('Light the beacon'),
  portcullis: null, relic: msg('Take the relic'), runestone: msg('Press the runestone'), tablet: msg('Read the carved tablet') };
export const USE_TIME = 1;   // s an F on a part takes

// --- slide (docs/trials.md, `slide`) -------------------------------------------------------------
// The field: w x h cells of ice (rock: cells you cannot slide into), a rim round it with two gaps:
// the entry (beside field cell entry, on side entry.side) and the goal's gate (goal, goal.side).
// On the ice you slide the way you set off, along the grid, until a rock or the rim stops you.
//   field: { w, h, rock: [0|1 ...] (row by row), entry: { x, z, side }, goal: { x, z, side } }
// (sides as DIRS: 0 +x, 1 -x, 2 +z, 3 -z)
const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const fieldIn = (F, x, z) => x >= 0 && z >= 0 && x < F.w && z < F.h;
export const isRock = (F, x, z) => !!F.rock[z * F.w + x];
// Where a slide from (x, z) along d ends: [x, z] on the field, or 'out' (through the entry gap, off
// the field), or 'goal' (through the goal's gate, once it is open)
export function slideStop(F, x, z, d, open = false) {
  const [dx, dz] = SD[d];
  for (;;) {
    const nx = x + dx, nz = z + dz;
    if (!fieldIn(F, nx, nz)) {
      if (x === F.entry.x && z === F.entry.z && d === F.entry.side) return 'out';
      if (open && x === F.goal.x && z === F.goal.z && d === F.goal.side) return 'goal';
      return [x, z];
    }
    if (isRock(F, nx, nz)) return [x, z];
    x = nx; z = nz;
  }
}

// --- sunken (docs/trials.md, `sunken`) -----------------------------------------------------------
// The room's water stands at W[stage] (m.water: one level a stage, the last the rivers'); a stage
// solved, it sinks to the next over SINK s (s.sink: { from, t }). Drained for good once resolved.
export const SINK = 4;
export function sunkenLevel(m, s) {
  const W = m.water, at = Math.min(s.stage ?? 0, W.length - 1), to = W[at];
  if (s.sink && s.sink.t < SINK) return s.sink.from + (to - s.sink.from) * s.sink.t / SINK;
  return s.phase === 'resolved' || at >= W.length - 1 ? null : to;
}
// a stage solved (i: its puzzle; only the stage the room is at counts): true when it was
export function sinkStage(m, s, i) {
  if (i !== (s.stage ?? 0) || s.phase === 'resolved') return false;
  s.sink = { from: sunkenLevel(m, s) ?? m.water[i], t: 0 };
  s.stage = i + 1;
  return true;
}

// --- mirror (docs/trials.md, `mirror`) -----------------------------------------------------------
// A field of w x h cells; an emitter beside it shoots a beam into cell `from` heading `dir`; mirrors
// stand on some cells ('/' or '\', bit 0 or 1 of their state), blockers (rocks) on others, lenses
// (crystals the beam shines through, lighting them) on others. The beam runs on until it leaves the
// field: where it leaves says whether it reached the receiver. Solved: the receiver lit and every
// lens with it (beamDone).
//   field: { w, h, mirrors: [[x, z], ...], blockers: [[x, z], ...], lenses: [[x, z], ...],
//            emitter: { x, z, dir }, receiver: { x, z, side } }
// (a mirror's bit: 0 '/' (turns +x into -z), 1 '\' (turns +x into +z); sides and directions as DIRS)
// -> { cells, lit, end, stopped, hits (the lenses it shines through, by index), turns (the mirror
//    cells it turns at, in order) }
const SLASH = [3, 2, 1, 0], BACK = [2, 3, 0, 1];   // the new heading after a '/' or a '\' mirror
export function traceBeam(F, bits, blocked = () => false) {
  let [x, z] = [F.emitter.x, F.emitter.z], d = F.emitter.dir;
  const cells = [], seen = new Set(), hits = [], turns = [];
  const mirrorAt = new Map(F.mirrors.map(([mx, mz], i) => [`${mx},${mz}`, i])), rock = new Set(F.blockers.map(b => `${b[0]},${b[1]}`));
  const lensAt = new Map((F.lenses || []).map(([lx, lz], i) => [`${lx},${lz}`, i]));
  while (x >= 0 && z >= 0 && x < F.w && z < F.h) {
    const k = `${x},${z}`;
    if (seen.has(k + d) || rock.has(k) || blocked(x, z)) return { cells: [...cells, [x, z]], lit: false, end: [x, z], stopped: true, hits, turns };
    seen.add(k + d); cells.push([x, z]);
    const m = mirrorAt.get(k), l = lensAt.get(k);
    if (l !== undefined && !hits.includes(l)) hits.push(l);
    if (m !== undefined) { d = bits[m] ? BACK[d] : SLASH[d]; turns.push([x, z]); }
    x += SD[d][0]; z += SD[d][1];
  }
  // it leaves the field through side `d` beside (x - dx, z - dz)
  const [ex, ez] = [x - SD[d][0], z - SD[d][1]];
  return { cells, lit: d === F.receiver.side && ex === F.receiver.x && ez === F.receiver.z, end: [x, z], stopped: false, hits, turns };
}
// is the mirror puzzle solved by this beam: the receiver lit, every lens on the way?
export const beamDone = (F, beam) => beam.lit && beam.hits.length === (F.lenses || []).length;

// --- braziers: lights out (docs/trials.md, `braziers`) --------------------------------------------
// links[i]: the braziers lit or put out with brazier i (and i itself). bits[i]: lit.
export const pressBrazier = (bits, links, i) => { for (const j of [i, ...links[i]]) bits[j] = bits[j] ? 0 : 1; return bits; };
export const allLit = bits => bits.every(Boolean);

// --- crates (docs/trials.md, `crates`) ---------------------------------------
// A field of w x h cells (cell index x + z w): walls (rubble) on some, plates on some, crates
// (their cells: the puzzle's bits). A crate is pushed one cell by walking into it; never pulled. A
// push of the crate at c the way d: the cell beyond free (on the field, no wall, no crate).
//   field: { w, h, walls: [c], plates: [c], entry: { x, z, side } }
export function pushTarget(F, crates, c, d) {
  const x = c % F.w + SD[d][0], z = Math.floor(c / F.w) + SD[d][1];
  if (x < 0 || z < 0 || x >= F.w || z >= F.h) return null;
  const n = z * F.w + x;
  return F.walls.includes(n) || crates.includes(n) ? null : n;
}
// is every plate held? by a crate (a body standing on one does not count: the puzzle is the crates)
export const platesHeld = (F, crates) => F.plates.every(p => crates.includes(p));
