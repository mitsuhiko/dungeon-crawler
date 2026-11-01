// The Wolla's storm (core/gusts.js), read off each enemy's attack clock: its storm cloud
// thunders at the attack's `thunder` times, and from the hit frame on it blows for the gust's
// time. A body in the gust with a clear line to the mouth is hit once per blow: hurt, and
// pushed back (blowOf's `push`, carried out by physics/move.js; a friend's body gets it sent
// over). Only the game that runs the enemies hurts anyone (`hurt`); shown another player's
// enemies, the storm is seen and heard here all the same, from the clock the runner sends.
// A stagger or death ends the attack and with it the storm. Gusto's vortex is a gust too (kind
// 'vortex'): no storm cloud, but it breathes in from the gust's `inhale` time to the blow.
//
// Gusto breathing in (an attack with a `pull`, core/enemies.js GUSTO_INHALE) is read off the
// clock the same way, and every game pulls its own player (player.pull, physics/move.js): it
// harms nobody, so nothing needs sending. And when he lies helpless after a grab that caught
// nothing (an attack with `exposed`), every game shows him crashing down and says so (Squarlo
// out of breath, or stuck with his foot down, says so too). Squarlo calling the tide (a `cast` of
// 'tide') is announced by every game as he starts. Squarlo's jet is a gust (kind 'jet').
import { ROOM_SCALE } from '../core/constants.js';
import { player, setStatus } from './state.js';
import { party, alive } from './party.js';
import { attackOf, blowOf, enemyName } from '../core/enemies.js';
import { muzzleAt } from '../core/beams.js';
import { inGust, gustDir } from '../core/gusts.js';
import { hitBody, attacker } from './enemycombat.js';
import { clearLine } from '../physics/enemynav.js';
import { stormFx, felledFx, tideCallFx } from './juice.js';
import { tr } from '../i18n/i18n.js';

export function updateGusts(list, dt, hurt = true) {
  player.pull = null;
  for (const e of list) {
    const a = e.mode === 'attack' ? attackOf(e) : null, g = a?.gust ?? a?.pull;
    if (a?.exposed && e.t >= (a.exposed.from ?? 0) && e.felled !== e.attacks) { e.felled = e.attacks; felled(e, a.exposed); }
    if (a?.cast === 'tide' && e.called !== e.attacks) { e.called = e.attacks; calls(e); }
    if (!g) { e.storm = null; continue; }
    if (e.storm?.attacks !== e.attacks) e.storm = { attacks: e.attacks, t: e.t - dt, hit: new Set() };
    const s = e.storm, t0 = s.t, t = s.t = e.t;
    if (a.pull) { breathe(e, a, g, t0, t, dt); continue; }
    g.thunder.forEach((at, i) => { if (t0 < at && t >= at) stormFx(e, g, 'thunder', i); });
    if (g.inhale !== undefined && t >= g.inhale && t < a.hitAt) stormFx(e, g, 'inhale', dt);
    if (t0 < a.hitAt && t >= a.hitAt) stormFx(e, g, 'blow');
    if (t < a.hitAt || t >= a.hitAt + g.time) continue;
    stormFx(e, g, 'gust', dt);
    if (hurt) blow(e, a, g, s.hit);
  }
}
function blow(e, a, g, hit) {
  const o = muzzleAt(e, g.muzzle);
  for (const p of party()) {
    if (hit.has(p) || !alive(p) || (p !== player && !p.here) || !inGust(e, g, p)) continue;
    if (!clearLine(o.x, o.y, o.z, p.x, p.y + p.h * 0.55, p.z)) continue;
    hit.add(p);
    const [nx, nz] = gustDir(e, g, p);
    hitBody(p, { ...blowOf(e.profile, a), by: attacker(e) }, o.x, o.z, nx, nz);
  }
}

// e breathing in, pull spec g: from the hit frame for g.time, our player is pulled while in the
// cone before its mouth with a clear line to it, up to g.stop cells from it
function breathe(e, a, g, t0, t, dt) {
  if (t0 < a.hitAt && t >= a.hitAt) stormFx(e, g, 'suck');
  if (t < a.hitAt || t >= a.hitAt + g.time) return;
  stormFx(e, g, 'pull', dt);
  const p = player;
  if (p.hp <= 0 || p.ragdoll || p.held || p.climb || p.swimming || !inGust(e, g, p)) return;
  const o = muzzleAt(e, g.muzzle), dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
  if (d <= g.stop || !clearLine(o.x, o.y, o.z, p.x, p.y + p.h * 0.55, p.z)) return;
  p.pull = { ux: dx / d, uz: dz / d, speed: g.speed, hold: g.hold, room: d - g.stop };
}

// a grab that caught nothing: down he goes (`thud`); and what every game says about it
function felled(e, x) {
  if (x.thud) felledFx(e);
  if (x.say && Math.hypot(e.x - player.x, e.z - player.z) < 14) setStatus(tr(x.say, { name: enemyName(e.profile) }));
}
// Squarlo starts calling the tide
function calls(e) {
  tideCallFx(e);
  if (Math.hypot(e.x - player.x, e.z - player.z) < 24 * ROOM_SCALE) setStatus(tr('{name} calls the tide! Get up a hill!', { name: enemyName(e.profile) }));
}
