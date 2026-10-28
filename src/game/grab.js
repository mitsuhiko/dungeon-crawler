// Grabs (core/enemies.js, an attack with a `grab`: Gusto's, the Mecked's): caught at the attack's
// hit frame (game/enemycombat.js strikePlayer, a blow with `grab`: the enemy's id), the player is
// held in its hands: no moving, striking or getting hurt by anything else, carried along the
// clip's grip path (core/gusto.js gripAt). A grab with `bites` (the Mecked's) bites the player at
// those times while it holds them: each bite is the blow's damage through the armor (the arms
// are pinned: no shield) and its poison, and a deadly one drops them. At the throw time it lets go:
// a grab that `knockDown`s (Gusto's) throws them down in front of itself, then the blow lands and
// they go over as a ragdoll and get up as after any knock-down; any other shoves them away on
// their feet, a little stunned.
// There is no wriggling free; only a stagger (a heavy blow, a friend's) or its death makes it
// let go, and the player drops unhurt.
// Playing together the grab is a blow like any other: the game of the player it caught carries
// it out, after the enemy as it is shown there (net/foes.js).
import { player, state, setStatus } from './state.js';
import { allEnemies } from './enemies.js';
import { attackOf, enemyName } from '../core/enemies.js';
import { gripAt } from '../core/gusto.js';
import { muzzleAt } from '../core/beams.js';
import { knockDown } from './ragdoll.js';
import { cancelSword } from './sword.js';
import { canMove } from '../physics/canmove.js';
import { groundAt } from '../physics/collide.js';
import { STEP } from '../core/constants.js';
import { playerHurtFx } from './juice.js';
import { armorOnly } from './armor.js';
import { poisonPlayer } from './enemycombat.js';
import { takeDamage } from '../core/progression.js';
import { flash } from './hud.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

// the grab under way, if the enemy still holds on: its attack's grab spec
function holding(h) {
  const e = h.e, a = e.mode === 'attack' && e.attacks === h.attacks ? attackOf(e) : null;
  return a?.grab && allEnemies().includes(e) ? a : null;
}

// blow: the grab's (game/enemycombat.js hitPlayer); from (fx, fz)
export function grabPlayer(blow, fx, fz) {
  const e = allEnemies().find(x => x.id === blow.grab);
  if (!e || !holding({ e, attacks: e.attacks })) {   // it let go already: knocked over, as it would be thrown
    knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by });
    return;
  }
  cancelSword();
  Object.assign(player, { held: { e, attacks: e.attacks, blow, fx, fz }, vx: 0, vy: 0, vz: 0, gust: null, climb: null, getUp: null });
  sfx('grab', { at: player });
  setStatus(tr('{name} grabbed you!', { name: enemyName(e.profile) }));
}

// every step while held (game/update.js): carried along, then thrown or let go
export function tickHeld() {
  const h = player.held, a = holding(h), e = h.e;
  if (!a) { player.held = null; knockDown({ hop: 1 }); return; }   // let go: dropped, unhurt
  const g = a.grab, bites = g.bites ?? [];
  h.bites ??= 0;
  while (h.bites < bites.length && e.t >= bites[h.bites]) {
    h.bites++;
    bitePlayer(e, { ...h.blow, damage: h.blow.damage * (g.bitePower ?? 1) }, g.choke);
    if (!player.held) return;   // (a deadly bite: dropped)
  }
  if (e.t >= g.throwAt) { if (a.knockDown) throwPlayer(e, g, h.blow); else releasePlayer(e, g); return; }
  const size = e.profile.size ?? 1, at = muzzleAt(e, gripAt(g, a.hitAt, e.t).map(v => v * size));
  // towards the hands, sliding along walls rather than into them
  const dx = at.x - player.x, dz = at.z - player.z;
  if (dx && canMove(player.x + dx, player.z, 'x', Math.sign(dx))) player.x += dx;
  if (dz && canMove(player.x, player.z + dz, 'z', Math.sign(dz))) player.z += dz;
  const y = at.y - g.hold * size;
  player.y = Math.max(y, groundAt(player.x, player.z, y, STEP).h);   // never into the floor
  player.vx = player.vy = player.vz = 0;
  player.grounded = false;
}

function throwPlayer(e, g, blow) {
  player.held = null;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  player.vx = fx * g.throw; player.vz = fz * g.throw; player.vy = -2;
  playerHurtFx(Math.min(blow.damage, player.hp), e.x, e.z);
  knockDown({ damage: blow.damage, hop: blow.hop, reason: blow.reason, by: blow.by });
}

// a bite while held: the blow through the armor alone, and its poison
function bitePlayer(e, blow, choke = false) {
  const b = armorOnly(blow), p = player, damage = Math.min(b.damage, p.hp);
  sfx(choke ? 'grab' : 'chomp', { at: p });
  playerHurtFx(damage, e.x, e.z);
  if (p.hp <= b.damage) { knockDown({ damage: b.damage, hop: 1, reason: b.reason, by: b.by }); return; }
  if (b.damage > 0) p.lastHurt = { reason: b.reason, by: b.by ?? null };
  takeDamage(p, b.damage, state.time); flash(); setStatus(tr(b.reason));
  if (b.toxin) poisonPlayer(b.toxin, b.reason.replace(/^Chewed on/, 'Poisoned'), b.by);
}
// let go without throwing: shoved away in front of it, landing on their feet a little stunned
function releasePlayer(e, g) {
  player.held = null;
  player.vx = Math.sin(e.yaw) * g.throw; player.vz = Math.cos(e.yaw) * g.throw; player.vy = 0;
  player.stun = Math.max(player.stun || 0, 0.3);
}
