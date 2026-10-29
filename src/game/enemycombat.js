// Bites, rams, slaps, pinches and kicks, thrown blows, burning, chill and poison, and solid
// bodies. Contact never damages an enemy. A blow lands on the body the enemy goes after
// (game/party.js): our player, or a friend's stand-in, who gets it sent over (hitBody).
import { player, state, setStatus } from './state.js';
import { takeDamage } from '../core/progression.js';
import { flash } from './hud.js';
import { playerHurtFx, burnHurtFx, poisonHurtFx, zappedFx, squashedFx } from './juice.js';
import { knockDown } from './ragdoll.js';
import { canMove } from '../physics/canmove.js';
import { walkable, stepEnemy } from '../physics/enemynav.js';
import { attackOf, blowOf, enemyWords } from '../core/enemies.js';
import { ignite, burnStep, burntOut, chillFrom, chillStep } from '../core/projectiles.js';
import { afflict, statusStep, statusOver, slowFrom, slower, slowStep } from '../core/status.js';
import { engulfPlayer, markEngulfing } from './engulf.js';
import { immuneTo } from '../core/potions.js';
import { absent, airborne } from '../core/enemies.js';
import { SIT_IMPACT } from '../core/constants.js';
import { grabPlayer } from './grab.js';
import { twirlPlayer } from './twirl.js';
import { guardBlow, wornDefense } from './armor.js';
import { tr, msg } from '../i18n/i18n.js';

export const resetEnemyCombat = () => { player.burning = null; player.chilled = null; player.slowed = null; player.toxic = null; player.gust = null; player.pull = null; player.shocked = 0; player.dazed = 0; player.flat = 0; player.held = null; player.engulfed = null; player.gulped = false; };
// who struck a blow, for the chronicle when it kills us (game/log.js logDeath); it goes along
// with the blow (core/enemies.js blowOf), over the network too
export const attacker = e => ({ words: enemyWords(e.profile), level: e.level, guardian: !!e.guardian });
// poison the player (a venomous bite, acid; core/status.js), unless an antidote keeps it off;
// by: the enemy that did it (attacker)
export function poisonPlayer(toxin, reason, by = null) {
  if (!toxin || immuneTo(player, 'toxic') || player.hp <= 0) return false;
  if (!player.toxic) setStatus(tr('Poisoned! An antidote cures it'));
  player.toxic = { ...afflict(toxin, reason), by };
  return true;
}
export const playerFloor = (height, p = player) => p.grounded && !p.swimming && walkable(p.support, height) ? p.support : null;
// a blow (core/enemies.js blowOf) from (fx, fz) that shoves the player along (nx, nz); a gust's
// blow (its `push`) goes on blowing the player that way for a moment (physics/move.js), and a
// bolt's (its `shock`) stuns: no moving, jumping or striking for that long (render/shocked.js), and
// one that squashes (its `daze`: a giant landing on us) knocks us flat onto our bottom, dazed and
// seeing stars, as long.
// A grab's (its `grab`: the id of the enemy that caught us) is carried out by game/grab.js; held
// in its hands, nothing else hurts us. So is a twister's (its `twirl`), by game/twirl.js. The
// rest goes through the shield and the armor first (game/armor.js guardBlow): a blocked blow is
// a small one that does nothing else.
export function hitPlayer(blow, fx, fz, nx, nz) {
  const p = player;
  if (p.held || p.rescue) return;   // (in the robot's hands, game/rescue.js: nothing hurts)
  if (typeof blow.grab === 'string') { grabPlayer(blow, fx, fz); return; }
  // swallowed by a Bolime coming down on us (game/engulf.js); already inside one, it only lands on us
  if (typeof blow.engulf === 'string') { if (engulfPlayer(blow)) return; blow = { ...blow, engulf: null }; }
  if (blow.twirl) { twirlPlayer(blow, nx, nz); return; }   // caught in a twister (game/twirl.js)
  blow = guardBlow(blow);
  if (blow.blocked) {   // caught on the shield: a little of it gets through, nothing else (game/armor.js shows it)
    if (p.hp <= blow.damage) { knockDown({ damage: blow.damage, reason: blow.reason, by: blow.by ?? null }); return; }
    if (blow.damage > 0) { p.lastHurt = { reason: blow.reason, by: blow.by ?? null }; takeDamage(p, blow.damage, state.time); }
    return;
  }
  p.vx = nx * blow.knock; p.vz = nz * blow.knock;
  playerHurtFx(Math.min(blow.damage, p.hp), fx, fz);
  // fire thaws a chill and ice puts a fire out
  const by = blow.by ?? null;
  if (blow.burn && p.hp > blow.damage) { p.burning = { ...ignite(blow.burn, blow.reason), by }; p.chilled = null; }
  if (blow.chill && p.hp > blow.damage) { p.chilled = chillFrom(blow.chill); p.burning = null; }
  if (blow.slow && p.hp > blow.damage) slowPlayer(blow.slow);   // (a Slug's slime ball, a slime meteorite)
  if (blow.toxin && p.hp > blow.damage) poisonPlayer(blow.toxin, (blow.reason ?? msg('Bitten!')).replace(/^Bitten/, 'Poisoned'), by);   // (src/i18n/sources.js has these)
  // only a heavy blow or a deadly one knocks you over; the rest are a short flinch and a shove
  if (blow.knockDown || p.hp <= blow.damage) {
    knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by }); return;
  }
  if (blow.damage > 0) p.lastHurt = { reason: blow.reason, by };
  takeDamage(p, blow.damage, state.time); flash(); setStatus(tr(blow.reason));
  p.vx *= 0.6; p.vz *= 0.6; p.stun = 0.15;
  // a fire geyser (Foggery's) pops the player up into the air
  if (blow.pop > 0 && blow.pop < 12 && !p.climb) { p.vy = blow.pop; p.grounded = false; }
  const shock = blow.shock;
  if (shock > 0 && shock < 3) { p.stun = Math.max(p.stun, shock); p.shocked = shock; zappedFx(); }
  const daze = blow.daze;
  if (daze > 0 && daze <= 5 && !p.climb && !p.swimming) {
    p.vx = p.vz = 0; p.stun = Math.max(p.stun, daze); p.dazed = daze;
    p.landImpact = SIT_IMPACT + 1; p.landCount++;   // (down on our bottom: render/blendtree.js sits)
    squashedFx();
  }
  const push = blow.push;
  if (push && push.speed > 0 && push.speed < 30 && push.time > 0 && push.time < 3)
    p.gust = { vx: nx * push.speed, vz: nz * push.speed, t: push.time, time: push.time };
}
// a blow on body p: our player, or a friend's stand-in (it says how to send it over)
export function hitBody(p, blow, fx, fz, nx, nz) {
  if (p.remote && typeof blow.engulf === 'string') markEngulfing(blow.engulf, p);   // (a Bolime holds on to a friend it caught)
  if (p.remote) p.hurt(blow, fx, fz, nx, nz);
  else hitPlayer(blow, fx, fz, nx, nz);
}
// e's blow lands on its target if it is in reach and in front of it (behind it, for one struck
// behind it: `back`, the Moose's tail); true: it did. over: what this blow has of its own (one of a
// beating's `more`: its power, its shove)
export function strikePlayer(e, over = null) {
  const p = e.target?.here ? e.target : player, a = over ? { ...attackOf(e), ...over } : attackOf(e), dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (p.ragdoll || p.held || p.rescue || p.hp <= 0 || d > a.hitReach || Math.abs(p.y - e.y) > 0.85) return false;
  if (d > 0.01 && Math.cos(Math.atan2(dx, dz) - e.yaw - (a.back ? Math.PI : 0)) < a.arc) return false;
  const blow = { ...blowOf(e.profile, a), by: attacker(e), ...a.grab && { grab: e.id } };   // a grab catches (game/grab.js)
  hitBody(p, blow, e.x, e.z, d ? dx / d : Math.sin(e.yaw), d ? dz / d : Math.cos(e.yaw));
  return true;
}
// On fire: the burn ticks away (also while knocked down); water puts it out. A lethal
// tick knocks the player down for good.
export function updateBurning(dt) {
  const p = player, b = p.burning;
  if (!b) return;
  if (p.hp <= 0 || p.swimming || p.fluidDeath) { p.burning = null; return; }
  const damage = burnStep(b, dt) * (1 - wornDefense().burnResist / 100);   // (armor of the Oven Mitt)
  if (damage > 0) {
    burnHurtFx(Math.min(damage, p.hp));
    if (!p.ragdoll && p.hp <= damage) knockDown({ damage, reason: b.reason, by: b.by });
    else takeDamage(p, Math.min(damage, p.hp), state.time);
  }
  if (burntOut(b)) p.burning = null;
}
// Poisoned: the poison ticks away (also while knocked down), and the body does not heal by
// itself meanwhile (core/progression.js regenerate). Water does not wash it out.
export function updateToxic(dt) {
  const p = player, d = p.toxic;
  if (!d) return;
  if (p.hp <= 0 || p.fluidDeath) { p.toxic = null; return; }
  const damage = statusStep(d, dt) * (1 - wornDefense().poisonResist / 100);   // (armor of the Iron Stomach)
  if (damage > 0) {
    poisonHurtFx(Math.min(damage, p.hp));
    if (!p.ragdoll && p.hp <= damage) knockDown({ damage, reason: d.reason || msg('Poisoned'), by: d.by });
    else takeDamage(p, Math.min(damage, p.hp), state.time);
  }
  if (statusOver(d)) p.toxic = null;
}
// Chilled or slowed: slower (physics/move.js; a slowing with `weapons` the weapon too, game/sword.js)
// until it wears off; dying or water ends it too.
export function updateChill(dt) {
  const p = player;
  if (p.chilled && (p.hp <= 0 || p.fluidDeath || !chillStep(p.chilled, dt))) p.chilled = null;
  if (p.slowed && (p.hp <= 0 || p.fluidDeath || !slowStep(p.slowed, dt))) p.slowed = null;
}
// slow the player by `spec` ({ time, slow, weapons?, source? }, core/status.js slowFrom): the
// stronger slowing counts
export function slowPlayer(spec) {
  if (!(spec?.time > 0 && spec.time <= 10 && spec.slow >= 0.2 && spec.slow <= 1)) return;   // (a friend's blow may say anything)
  player.slowed = slower(player.slowed, slowFrom(spec));
}
function pushPlayer(dx, dz) {
  const p = player;
  if (dx && canMove(p.x + dx, p.z, 'x', Math.sign(dx))) p.x += dx;
  if (dz && canMove(p.x, p.z + dz, 'z', Math.sign(dz))) p.z += dz;
}
// moveEnemies: false where the enemies are only shown here (another player runs them): they push
// the player but nobody here moves them
export function contactEnemies(list, dt, moveEnemies = true) {
  const p = player;
  for (const e of list) {
    if (absent(e) || airborne(e) || p.ragdoll || p.held || p.rescue || p.flipping || p.engulfed?.e === e) continue;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz), body = p.r + e.profile.radius;
    if (d >= body || p.y >= e.y + e.profile.bodyHeight || p.y + p.h <= e.y) continue;
    const nx = d ? dx / d : 1, nz = d ? dz / d : 0, depth = body - d;
    const share = e.profile.mass / (e.profile.mass + 0.45);
    pushPlayer(nx * depth * share, nz * depth * share);
    if (moveEnemies) stepEnemy(e, -nx * depth * (1 - share), -nz * depth * (1 - share));
  }
  if (!moveEnemies) return;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (absent(a) || absent(b) || airborne(a) || airborne(b) || Math.abs(a.y - b.y) > 0.6) continue;
    const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), r = a.profile.radius + b.profile.radius;
    if (d >= r) continue;
    const nx = d ? dx / d : 1, nz = d ? dz / d : 0, push = Math.min(r - d, dt * 1.5);
    const share = b.profile.mass / (a.profile.mass + b.profile.mass);
    stepEnemy(a, nx * push * share, nz * push * share);
    stepEnemy(b, -nx * push * (1 - share), -nz * push * (1 - share));
  }
}
