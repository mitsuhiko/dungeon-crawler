// The events with actors of their own (docs/trials.md): `siege` (waves for the beacon's ring) and
// `chase` (the relic's warden hunting you back to the gate). Stepped from game/trials.js
// updateTrial; the game that owns the trial (net/trials.js) spawns the waves and the warden and
// counts the hold (the trial's bits, told to the others); the enemies go to the others as any do.
import { ARM_TIME, TRIALS, SIEGE, holdTime, HUNTER } from '../core/trials.js';
import { ENEMY_KINDS, isRanged, makeEnemy, coinRange, depthLevel, enemyKind } from '../core/enemies.js';
import { RUN_SPEED, N } from '../core/constants.js';
import { moveFactor } from '../core/status.js';
import { effectMod } from '../core/potions.js';
import { swarmKind } from '../core/hordes.js';
import { DEPTH_SPAWNS } from '../core/spawns.js';
import { hordeKinds, hordeSize } from '../world/hordes.js';
import { walkable, groundY } from '../physics/enemynav.js';
import { mulberry32, hash32 } from '../core/util.js';
import { hashString } from '../core/gear/drops.js';
import { player, state, setStatus, worldLevel } from './state.js';
import { addEnemies, removeEnemies, mirroring, allEnemies } from './enemies.js';
import { online } from '../net/online.js';
import { sfx } from '../audio/sfx.js';
import { msg, phrase, noun, tr } from '../i18n/i18n.js';

const bodies = () => [player, ...online.buddies.filter(b => b.here && b.hp > 0)].filter(b => b.hp > 0);

// --- siege ---------------------------------------------------------------------------------------

let raiders = new Set(), attempt = 0;
// the room put back (a fail, a death, coming in): the attackers and the warden gone
export function resetEvents() {
  if (raiders.size) { const ids = raiders; removeEnemies(e => ids.has(e.id)); }
  raiders = new Set(); attempt++;
  dropWarden();
}

// the depth's heaviest kind that fights up close (of its roster)
function heaviest(depth) {
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster.flatMap(r => Object.keys(r.kinds)).map(k => ENEMY_KINDS[k])
    .filter(k => k && !k.boss && !isRanged(k));
  return roster.sort((a, b) => b.hp - a.hp)[0] ?? null;
}
// the depth's light kinds (the horde's) and its heaviest that fights up close
function waveKinds(depth) {
  const light = hordeKinds(depth).map(k => ENEMY_KINDS[k]).filter(Boolean).map(k => swarmKind(k, 0.5));
  return { light: light.length ? light : [ENEMY_KINDS.snake], heavy: heaviest(depth) ?? light[0] };
}

function spawnWave(m, s, k) {
  const depth = state.map.depth, R = mulberry32(hash32(hashString(m.key) ^ Math.imul(k + 1, 0x9e37) ^ attempt));
  const [lo, hi] = hordeSize(depth), n = Math.round((lo + hi) / 2 / SIEGE.waves), { light, heavy } = waveKinds(depth), level = depthLevel(depth, worldLevel());
  const ring = state.map.floors.filter(f => Math.hypot(f.x + 0.5 - m.ring.x, f.z + 0.5 - m.ring.z) <= m.ring.r && walkable(f, 0.9) && !f.fluid);
  const mouths = [m.mouths[k % m.mouths.length], m.mouths[(k + 1) % m.mouths.length]];
  const list = [];
  for (let i = 0; i < n + (k === SIEGE.waves - 1 ? 1 : 0); i++) {
    const kind = i === n ? heavy : light[Math.floor(R() * light.length)], mouth = mouths[i % 2];
    const f = state.map.floors.filter(g => !g.fluid && Math.hypot(g.x + 0.5 - mouth.x, g.z + 0.5 - mouth.z) < 1.6 && walkable(g, kind.height ?? 0.9))
      .sort((a, b) => Math.hypot(a.x + 0.5 - mouth.x, a.z + 0.5 - mouth.z) - Math.hypot(b.x + 0.5 - mouth.x, b.z + 0.5 - mouth.z))[i % 3] ?? null;
    if (!f || !ring.length) continue;
    const [clo, chi] = coinRange(kind, level), id = `trial:${m.key}:siege${attempt}:${k}:${i}`;
    const e = makeEnemy({ id, level, coinDrop: Math.round((clo + chi) / 4), kind, f, x: f.x + 0.5, y: groundY(f, f.x + 0.5, f.z + 0.5), z: f.z + 0.5,
      yaw: Math.atan2(m.ring.x - f.x - 0.5, m.ring.z - f.z - 0.5) }, kind, i);
    e.siege = m.key;   // (kept out of a guardian room's posting, game/defence.js)
    e.defence = { post: ring[Math.floor(R() * ring.length)], engage: true };
    raiders.add(id); list.push(e);
  }
  addEnemies(list);
  sfx('rumble', { volume: 0.4 });
  setStatus(k === 0 ? tr('They are coming from the dark!') : tr('Wave {n} of {of}!', { n: k + 1, of: SIEGE.waves }));
}

// in the ring: a body within its radius, about its level
const inRing = (m, b) => Math.hypot(b.x - m.ring.x, b.z - m.ring.z) <= m.ring.r + 0.3 && Math.abs(b.y - m.ring.y) < 1.5;
export function stepSiege(m, s, dt, resolve) {
  if (m.kind !== 'siege' || s.phase !== 'running') return;
  // they go straight for the players (whoever is about, to their floor or where they can strike
  // them from); with no way to anyone, they make for their posts in the ring
  for (const e of allEnemies()) if (raiders.has(e.id) && e.defence) e.defence.engage = true;
  if (mirroring()) return;
  const hold = holdTime(state.map.depth);
  if (bodies().some(b => inRing(m, b))) s.bits.hold = Math.min(hold, (s.bits.hold ?? 0) + dt);
  const want = Math.min(SIEGE.waves, Math.floor((s.bits.hold ?? 0) / hold * SIEGE.waves) + 1);
  while ((s.bits.wave ?? 0) < want) { spawnWave(m, s, s.bits.wave ?? 0); s.bits.wave = (s.bits.wave ?? 0) + 1; }
  if ((s.bits.hold ?? 0) >= hold) {   // the beacon flares: whoever is left flees into the mouths
    const ids = raiders;
    removeEnemies(e => ids.has(e.id) && e.mode !== 'dead');
    raiders = new Set();
    resolve();
  }
}
// lighting the beacon starts it (the clock, the seals): not stepping off the pad
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
  if (s.kind === 'siege') {
    if (s.phase === 'idle') return { line: tr('Light the beacon when you are ready, then hold its ring'), fill: 0 };
    const hold = holdTime(state.map.depth), k = (s.bits.hold ?? 0) / hold, n = Math.floor(k * 100);
    if (s.phase === 'armed') return { line: tr('The beacon blazes: something stirs in the dark…'), fill: 0 };
    return { line: bodies().some(b => inRing(m, b)) ? tr('Hold the ring: {n}%', { n }) : tr('Get back in the ring! ({n}%)', { n }), fill: k };
  }
  if (s.kind === 'chase') {
    if (s.phase === 'idle') return { line: tr('Take the relic from its altar, then run for the gate'), fill: 0 };
    const gap = wardenGap();
    if (gap == null) return { line: tr('The relic is taken: something stirs in its lair…'), fill: 0 };
    return { line: tr('Run! It is {n} cells away: through the gate and pull the lever', { n: gap }), fill: Math.max(0, Math.min(1, 1 - gap / 12)) };
  }
  return null;
}
export const EVENT_HOW = {
  siege: msg("Hold the beacon's ring against the waves!"),
  chase: msg('The relic is taken, and its warden wakes. Run back through the gate and drop the portcullis!'),
};
export const EVENT_DONE = {
  siege: msg('The beacon flares: they flee into the dark.'),
  chase: msg('The portcullis crashes down: the warden is shut in with its hall.'),
};
export const isActorEvent = kind => kind === 'siege' || kind === 'chase';
export { TRIALS };
