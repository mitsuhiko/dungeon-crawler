// The world's days and nights: one cycle of DAY.length s on the world's play time
// (state.run.clock, game/worldclock.js), the same in every cube of the world, going on while you
// are elsewhere, and the same for friends playing together (together the clock is the host's).
// Its cycle begins with the morning: DAY.day s of the sun going along its path, the dusk, the night,
// the dawn; a world's clock starts at noon (START_CLOCK). What a cube shows of it is its sky's
// (themes/index.js `sky`, game/daycycle.js): under an open sky all of it, the sun moving (its
// shadows baked again as it goes, render/bake.js); under the hazy skies of act II the light only
// (the sun stays where it is); in a theme that is always night (the dark forest) a little lighter
// by day; nothing in the caves, indoors and in a boss's arena. The slime meteorites fall at night (core/meteors.js).
//
// The sun's path (sunPath): an arc over the sky through where the noon sun stands (NOON, the sun
// of the cubes without days and nights too), never under `low` degrees while it casts shadows: the
// lower the sun, the faster its shadows sweep. Along it, SUN_KEYS + 1 places (its keys) each
// BAKE_EVERY s of the day apart, spaced so that the tips of the shadows move as far from one to
// the next; between two the light shows a blend of both (render/bake.js). At night the moon
// stands where the noon sun does; the sun gives way to it, and it to the sun, halfway through the
// dusk and the dawn, when neither shines (sunAt `light`).

export const DAY = { day: 280, dusk: 30, night: 80, dawn: 30 };
DAY.length = DAY.day + DAY.dusk + DAY.night + DAY.dawn;   // 420 s: seven minutes
export const BAKE_EVERY = 1.5;                             // s of the day from one of the sun's places to the next
export const SUN_KEYS = Math.round(DAY.day / BAKE_EVERY);  // its places along the day: 0 .. SUN_KEYS
export const SUN_LOW = 35;                                 // degrees: the lowest the sun goes (a theme's `sunLow`)
const GLOW = 50;                                           // s into the day the morning's warm light lasts (and the evening's)

const smooth = x => x * x * (3 - 2 * x);
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
// where the noon sun (and the moon) stands: towards it from the ground
export const NOON = unit(-12, 34, 8);

// how far into the cycle `clock` is (s)
export const dayPhase = clock => ((clock % DAY.length) + DAY.length) % DAY.length;

// how far into the night it is at `clock` (s): 0 day, 1 night, in between in the dusk and the dawn
export function nightAt(clock) {
  const s = dayPhase(clock), { day, dusk, night, dawn } = DAY;
  if (s < day) return 0;
  if (s < day + dusk) return smooth((s - day) / dusk);
  if (s < day + dusk + night) return 1;
  return 1 - smooth((s - day - dusk - night) / dawn);
}
// is it night (more than halfway turned)?
export const isNight = clock => nightAt(clock) >= 0.5;
// how long (s) until the light is next halfway turned (the middle of the next dusk or dawn)
export function nextTurn(clock) {
  const s = dayPhase(clock), L = DAY.length, turns = [DAY.day + DAY.dusk / 2, L - DAY.dawn / 2];
  return [...turns, ...turns.map(t => t + L)].find(t => t > s) - s;
}
// the warm light of a low sun, 0..1: the morning's and the evening's (GLOW s into the day), all
// through the dusk and the dawn (the night takes over from it there: game/daycycle.js)
export function glowAt(clock) {
  const s = dayPhase(clock);
  if (s >= DAY.day) return 1;
  return smooth(Math.max(0, 1 - Math.min(s, DAY.day - s) / GLOW));
}

// The times of day the dev command goes to (game/devcommands.js /daytime): s into the cycle.
export const DAYTIMES = { morning: 0, noon: DAY.day / 2, evening: DAY.day - GLOW, dusk: DAY.day,
  night: DAY.day + DAY.dusk, dawn: DAY.day + DAY.dusk + DAY.night };
// A new world's clock starts at noon (core/progression.js createRun, core/save.js createWorld): the
// hero comes into the town in the light of the day, the sun high.
export const START_CLOCK = DAYTIMES.noon;
// the next `clock` (s) from `clock` on at time of day `name` (DAYTIMES)
export function nextDaytime(clock, name) {
  const at = clock - dayPhase(clock) + DAYTIMES[name];
  return at > clock ? at : at + DAY.length;
}

// The sun's path for a lowest elevation of `low` degrees: its keys, { id, dir: [x, y, z] towards
// the sun }, and how far the tip of a unit-high thing's shadow goes along it (travel). The arc is
// a great circle through NOON, square to it where it rises and sets.
const paths = new Map();
export function sunPath(low = SUN_LOW) {
  if (paths.has(low)) return paths.get(low);
  const [nx, ny, nz] = NOON, h = Math.hypot(nx, nz), E = [nz / h, 0, -nx / h];
  const a0 = Math.asin(Math.min(1, Math.sin(low * Math.PI / 180) / ny)), a1 = Math.PI - a0;
  const dirAt = a => { const c = Math.cos(a), s = Math.sin(a); return [E[0] * c + nx * s, ny * s, E[2] * c + nz * s]; };
  const tip = d => [-d[0] / d[1], -d[2] / d[1]];
  // the shadow's tip along the arc, finely, then the keys equally far apart along it
  const M = 2048, at = [0], as = [a0];
  let prev = tip(dirAt(a0));
  for (let i = 1; i <= M; i++) {
    const a = a0 + (a1 - a0) * i / M, p = tip(dirAt(a));
    at.push(at[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); as.push(a); prev = p;
  }
  const travel = at[M], keys = [];
  for (let k = 0, i = 0; k <= SUN_KEYS; k++) {
    const want = travel * k / SUN_KEYS;
    while (i < M - 1 && at[i + 1] < want) i++;
    const f = at[i + 1] > at[i] ? Math.min(1, Math.max(0, (want - at[i]) / (at[i + 1] - at[i]))) : 0;
    keys.push({ id: `${low}:${k}`, dir: dirAt(as[i] + (as[i + 1] - as[i]) * f) });
  }
  const path = { low, keys, travel };
  paths.set(low, path);
  return path;
}
export const NOON_KEY = { id: 'noon', dir: NOON };

// Where the sun stands at `clock` (s) on the path of `low`: between keys a and b (t: how far from a
// to b), the one after them (next: baked ahead), and how strongly it shines (light: 0 halfway
// through the dusk and the dawn, where the sun and the moon change places).
export function sunAt(clock, low = SUN_LOW) {
  const s = dayPhase(clock), { day, dusk, night, dawn } = DAY, { keys } = sunPath(low), K = SUN_KEYS;
  const at = (a, b, t, next, light = 1) => ({ a, b, t, next, light });
  if (s < day) {
    const u = s / day * K, i = Math.min(K - 1, Math.floor(u));
    return at(keys[i], keys[i + 1], u - i, keys[i + 2] ?? NOON_KEY);
  }
  if (s < day + dusk) {
    const x = (s - day) / dusk;
    return x < 0.5 ? at(keys[K], keys[K], 0, NOON_KEY, smooth(1 - 2 * x)) : at(NOON_KEY, NOON_KEY, 0, keys[0], smooth(2 * x - 1));
  }
  if (s < day + dusk + night) return at(NOON_KEY, NOON_KEY, 0, keys[0]);
  const x = (s - day - dusk - night) / dawn;
  return x < 0.5 ? at(NOON_KEY, NOON_KEY, 0, keys[0], smooth(1 - 2 * x)) : at(keys[0], keys[0], 0, keys[1], smooth(2 * x - 1));
}
