// Room tasks (docs/trials.md "Room tasks"): small trials laid over an ordinary room, which keep
// its exit (or a branch's vault) shut until they are done. Pure rules and numbers, shared by the
// plan (world/tasks.js), the generator (cubegen/tasks.js), the game (game/tasks.js) and the tests.
// They are trial kinds of the family 'task' (core/trials.js TRIALS): the same state, gate, parts,
// HUD and playing together as a trial room's, in a room the generator built as any other.
//
//   keybearer   one strong enemy of the depth carries the key: defeat it
//   wardstones  stones that mend the wounds of the enemies round them: break them all
//   clear       defeat every enemy of the room
//   lanterns    light every brazier (they stay lit)
//   fading      light every brazier while the others still burn (each burns `burn` s)
//   shards      pick up every shard (on ledges, off the way)
//   hold        light the beacon by the exit, then hold its circle against the waves
//   hidden      find the hidden button
import { enemyKind, ENEMY_KINDS, isRanged } from './enemies.js';
import { DEPTH_SPAWNS } from './spawns.js';
import { mulberry32, hash32 } from './util.js';
import { noun, msg, phrase } from '../i18n/i18n.js';
import { SLACK, USE_TIME } from './trials.js';

export const TASK_KINDS = ['keybearer', 'wardstones', 'clear', 'lanterns', 'fading', 'shards', 'hold', 'hidden'];
// the kinds that need the room's enemies (or bring their own to fight): not in a room without any
export const COMBAT = new Set(['keybearer', 'wardstones', 'clear']);

// How many a depth has (1-19): 2-3 down to depth 4, 3-4 from 5. At most one in a branch room (the
// door of a vault round its reward site), by BRANCH chance where one has a site.
export const taskCount = d => d <= 4 ? [2, 3] : [3, 4];
export const BRANCH = 0.5;

// What the generator places: how many of a kind's things, how far apart (cells), how far off the
// way at least one of them lies (cells from the route's floors, or `high` levels over the entry)
export const PLACE = {
  lanterns: { n: [3, 4], apart: 5, off: 3 },
  fading: { n: [3, 4], apart: 5, off: 2 },
  shards: { n: [3, 5], apart: 4, off: 3 },
  wardstones: { n: [2, 4], apart: 5, off: 0 },
  keybearer: { n: [1, 1], apart: 0, off: 0 },
  hidden: { n: [1, 1], apart: 0, off: 3 },
  hold: { n: [1, 1], apart: 0, off: 0 },
  clear: { n: [0, 0], apart: 0, off: 0 },
};
export const HIGH = 4;   // levels over the entry that count as off the way

// a task's progress kept for the run (lanterns lit, shards taken: bit i for thing i) in run.trials
export const taskMark = key => `task:${key}`;
export const bitsOf = n => [...Array(10).keys()].filter(i => n & (1 << i));
export const countBits = n => bitsOf(n).length;

// --- the keybearer ---------------------------------------------------------------------------------
// One of the depth's kinds that fights up close (as likely as it is there), from the task's id:
// golden like a bounty, four times its health, a little bigger. Never comes back once defeated.
export const BEARER = { hp: 4, damage: 1.3, xp: 3, size: 1.25, poise: 1.2 };
const bearers = new Map();
export function keybearerKind(type) {
  if (bearers.has(type)) return bearers.get(type);
  const base = ENEMY_KINDS[type];
  if (!base) throw new TypeError(`Unknown enemy kind: ${type}`);
  const kind = noun(base.label);
  const k = enemyKind(base, { type: 'keybearer' + base.type, label: `Keybearer ${base.label.toLowerCase()}`,
    words: { t: msg('Keybearer {kind:lower}'), p: { kind }, of: 'kind', caps: true }, bounty: true, keybearer: true,
    poise: Math.max(base.poise ?? 0, BEARER.poise), light: '#ffcf4a', sparks: ['#ffcf4a', '#fff2c0'],
    reason: phrase('Struck down by the keybearer {kind:lower}!', { kind }),
    colors: Object.fromEntries(Object.keys(base.parts ?? {}).map(role => [role, role === 'eyes' ? 'oklch(0.35 0.08 60)' : 'oklch(0.82 0.15 85)'])),
    mods: { hp: BEARER.hp, damage: BEARER.damage, xp: BEARER.xp, size: BEARER.size } });
  bearers.set(type, k);
  return k;
}
// which kind the keybearer at depth d is (by the task's seed); null: the depth has none that fights up close
export function pickBearer(depth, seed) {
  const R = mulberry32(hash32(seed ^ 0x6e7b));
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster;
  const kinds = roster.flatMap(r => Object.entries(r.kinds).map(([type, w]) => [type, w * r.chance]))
    .filter(([type]) => ENEMY_KINDS[type] && !ENEMY_KINDS[type].boss && !ENEMY_KINDS[type].dwells && !isRanged(ENEMY_KINDS[type]));
  if (!kinds.length) return null;
  let r = R() * kinds.reduce((n, [, w]) => n + w, 0);
  for (const [type, w] of kinds) if ((r -= w) < 0) return type;
  return kinds.at(-1)[0];
}

// --- wardstones ----------------------------------------------------------------------------------
// A wardstone is an enemy that never moves nor strikes (game/tasks.js keeps it `waiting`): hit it
// to break it. While it stands it mends the wounds of the enemies within WARD.radius cells,
// WARD.mend of their health every WARD.every s. Its health grows with the depth like any enemy's.
export const WARD = { radius: 4.5, mend: 0.08, every: 2 };
export const WARD_KIND = {
  type: 'ward', species: 'ward', label: 'Wardstone', hp: 70, damage: 0, knock: 0,
  xp: 25, coins: [4, 8],
  radius: 0.4, height: 1.3, bodyHeight: 1.2, mass: 1e6,
  aggro: 0, giveUp: 0, chase: 0, wander: 0, homeSpeed: 0,
  reach: 0, hitReach: 0, hitAt: 0, trackUntil: 0, attackTime: 1, cooldown: 1e6, attacks: [],
  arc: 0, knockDown: false, hop: 0, reason: 'A wardstone', ichor: ['#d8c4ff', '#7a5ac8'], pitch: 0.6,
  poise: 1, hitStun: 0, deathTime: 0.8, corpseTime: 1.2, ward: true, viewless: true,
  drops: { weapons: false, potion: 0 },
  seedSalt: 0x3a7d5, spacing: 4,
};

// --- fading fires -----------------------------------------------------------------------------------
// Each brazier burns `burn` s once lit; every one burning at once wins. The burn is fitted to the
// fastest round of them (from the first lit to the last: `tour`, at running speed, a USE_TIME at
// each): a slow player's time for it (SLACK) and a second more, at least FADING.least s.
export const FADING = { least: 8, most: 40, extra: 1 };
export const fitBurn = (tour, n) => Math.min(FADING.most, Math.max(FADING.least, Math.ceil(((tour + USE_TIME * (n - 1)) * SLACK + FADING.extra) * 2) / 2));
// is a fading flame lit at clock time t (s)? bit: when it was lit, in tenths of a second + 1 (0: never)
export const litNow = (bit, t, burn) => !!bit && t < (bit - 1) / 10 + burn;
// is brazier part p of task m (map.trial) burning in state s? (lit for good once done)
export const lanternLit = (m, s, p) => s.phase === 'resolved' || (m.kind === 'fading' ? litNow(s.bits?.[p.id], s.t, m.burn) : !!s.bits?.[p.id]);

// --- hold the circle --------------------------------------------------------------------------------
// The beacon by the exit: lit (F), the circle round it must be held HOLD.time(depth) s (it fills only
// while a player stands in it, and pauses while nobody does); HOLD.waves waves come at even shares of
// it, out of the dark arches at the room's edge. Not sealed: leaving the room puts it back.
export const HOLD = { waves: 3, radius: 1.8 };
export const holdTime = depth => Math.round(20 + 20 * Math.max(0, Math.min(1, (depth - 2) / 17)));

// --- the hidden button --------------------------------------------------------------------------------
// A glint shows it within HIDDEN.near cells; once the room was entered HIDDEN.hint s ago (and it is
// still not found) a pale light rises over it, seen from anywhere.
export const HIDDEN = { near: 3.5, hint: 60 };
