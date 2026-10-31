// The event with an actor of its own (docs/trials.md): `chase` (the relic's warden hunting you back
// to the gate). Stepped from game/trials.js updateTrial; the game that owns the trial
// (net/trials.js) spawns the warden; it goes to the others as any enemy does. (The siege's waves
// are the room task Hold the circle's now: game/tasks.js.)
import { TRIALS, HUNTER } from '../core/trials.js';
import { ENEMY_KINDS, isRanged, makeEnemy, coinRange, depthLevel, enemyKind } from '../core/enemies.js';
import { RUN_SPEED, N } from '../core/constants.js';
import { moveFactor } from '../core/status.js';
import { effectMod } from '../core/potions.js';
import { DEPTH_SPAWNS } from '../core/spawns.js';
import { player, state, setStatus, worldLevel } from './state.js';
import { addEnemies, removeEnemies, mirroring, allEnemies } from './enemies.js';
import { sfx } from '../audio/sfx.js';
import { msg, phrase, noun, tr } from '../i18n/i18n.js';

let attempt = 0;
// the room put back (a fail, a death, coming in): the warden gone
export function resetEvents() {
  attempt++;
  dropWarden();
}

// the depth's heaviest kind that fights up close (of its roster)
function heaviest(depth) {
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster.flatMap(r => Object.keys(r.kinds)).map(k => ENEMY_KINDS[k])
    .filter(k => k && !k.boss && !isRanged(k));
  return roster.sort((a, b) => b.hp - a.hp)[0] ?? null;
}
// taking the relic starts it (the clock, the seals): not stepping off the pad
export function lightBeacon(s) {
  if (s.phase !== 'idle') return false;
  s.phase = 'armed'; s.t = 0; s.bits.hold = 0; s.bits.wave = 0;
  return true;
}

// --- chase: the relic ------------------------------------------------------------------------------

// The warden: the depth's heaviest close fighter, HUNTER.mods stronger, out of its lair the room's
// `wake` s after the relic is taken (the owner spawns it), hunting the players (posted at its lair, always
// engaged: game/enemyai.js) at HUNTER.ratio times the speed its quarry can run at now. The
// portcullis dropped: trapped in the hall it stays there, glaring, and is gone once the room is left;
// one already through is gone at once (it slinks back into its lair a while later either way).
// Killed, the hunt is over too.
let warden = null;   // its id
const wardens = new Map();   // kind -> the warden's kind
function wardenKind(base) {
  const kind = noun(base.label);
  if (!wardens.has(base)) wardens.set(base, enemyKind(base, { mods: HUNTER.mods, type: base.type, label: `Raging ${base.label.toLowerCase()}`,
    words: { t: msg('Raging {kind:lower}'), p: { kind }, of: 'kind', caps: true },
    mass: base.mass * HUNTER.mass, knock: base.knock * 1.3, reason: phrase('Caught by the raging {kind:lower}!', { kind }) }));
  return wardens.get(base);
}
function dropWarden() {
  if (warden) { const id = warden; removeEnemies(e => e.id === id); }
  warden = null;
}
const wardenOf = () => warden && allEnemies().find(e => e.id === warden);
// how fast body b can run now (a chill slows it, a swiftness potion quickens it)
const runSpeed = b => RUN_SPEED * (b === player ? moveFactor(player) * (1 + effectMod(player, 'moveSpeed')) : 1);
export function stepChase(m, s, dt, resolve) {
  if (m.kind !== 'chase') return;
  const live = s.phase === 'armed' || s.phase === 'running';
  if (mirroring()) return;   // (the owner runs it; the warden comes to the others as any enemy)
  if (live && !warden && s.t >= (m.wake ?? HUNTER.wake)) spawnWarden(m);
  const e = wardenOf();
  if (!e) return;
  if (e.mode === 'dead') { if (live) resolve(); warden = null; return; }
  if (s.phase === 'resolved') {   // trapped behind the portcullis: back to its lair, and gone a while later
    if (e.defence) { e.defence.engage = false; e.provoked = 0; e.profile.chase = runSpeed(player) * 0.5; }
    if (s.done > HUNTER.linger) dropWarden();
    return;
  }
  const quarry = e.target && e.target !== player && e.target.here ? e.target : player;
  e.profile.chase = runSpeed(quarry) * HUNTER.ratio;
  if (e.defence) e.defence.engage = true;
}
function spawnWarden(m) {
  const depth = state.map.depth, base = heaviest(depth) ?? ENEMY_KINDS.stunder, kind = wardenKind(base), level = depthLevel(depth, worldLevel());
  const f = state.map.floors[m.lair.f];
  if (!f) return;
  const [clo, chi] = coinRange(kind, level), id = `trial:${m.key}:warden${attempt}`;
  const e = makeEnemy({ id, level, coinDrop: Math.round((clo + chi) / 2), kind, f, x: m.lair.x, y: m.lair.y, z: m.lair.z, yaw: m.lair.yaw }, kind, 0);
  e.siege = m.key;   // (kept out of a guardian room's posting, game/defence.js)
  e.defence = { post: f, engage: true };
  e.warden = true;
  warden = id;
  addEnemies([e]);
  sfx('rumble', { volume: 0.7, pitch: 0.5 });
  setStatus(tr('{kind:A} breaks out of its lair!', { kind: noun(ENEMY_KINDS[kind.type]?.label ?? kind.label) }));
}
// the lever dropped the portcullis: one already through the gate is gone, one in the hall trapped
export function dropPortcullis(m) {
  const e = wardenOf();
  if (!e || mirroring()) return;
  const c = Math.floor(e.z) * N + Math.floor(e.x);
  if (!new Set(m.hall).has(c)) dropWarden();
}
// how far the warden is from us (cells), for the HUD; null: not out
export function wardenGap() {
  const e = wardenOf() ?? allEnemies().find(q => q.warden || q.id.includes(':warden'));
  return e && e.mode !== 'dead' ? Math.round(Math.hypot(e.x - player.x, e.z - player.z)) : null;
}

// the HUD's line for these kinds: { line, fill } (null: not one of them)
export function eventHud(m, s) {
  if (s.kind === 'chase') {
    if (s.phase === 'idle') return { line: tr('Take the relic from its altar, then run for the gate'), fill: 0 };
    const gap = wardenGap();
    if (gap == null) return { line: tr('The relic is taken: something stirs in its lair…'), fill: 0 };
    return { line: tr('Run! It is {n} cells away: through the gate and pull the lever', { n: gap }), fill: Math.max(0, Math.min(1, 1 - gap / 12)) };
  }
  return null;
}
export const EVENT_HOW = {
  chase: msg('The relic is taken, and its warden wakes. Run back through the gate and drop the portcullis!'),
};
export const EVENT_DONE = {
  chase: msg('The portcullis crashes down: the warden is shut in with its hall.'),
};
export const isActorEvent = kind => kind === 'chase';
export { TRIALS };
