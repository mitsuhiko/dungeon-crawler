// Attack input/timing and geometry-gated damage, for every kind of weapon. Jumping is never an
// attack. Attacks are queued with a target (an enemy, a point, or null for straight ahead) and
// stay queued for a moment, so a click during an attack chains into the next one. Swords hit
// what is in the blade's arc (hitWithSword); bows, crossbows and staffs turn to their target
// while they draw and let a shot go (game/shots.js); a flask in hand is thrown the same way
// (game/throws.js), once its cooldown allows.
import { player, state, setStatus } from './state.js';
import { startSwing, advanceSwing, cancelSwing, inSwordArc, swordHit, combatStats, shotDue, reloadTime, KINDS } from '../core/combat.js';
import { clearLine } from '../physics/enemynav.js';
import { enemyHitFx, swingFx, shotFx, evadedFx } from './juice.js';
import { fireShot } from './shots.js';
import { throwFlask } from './throws.js';
import { cooldownLeft } from '../core/potions.js';
import { relay } from '../net/online.js';
import { absent, enemyName, baseY } from '../core/enemies.js';
import { enchantHit } from './enchants.js';
import { tr } from '../i18n/i18n.js';
import { weaponFactor } from '../core/status.js';
import { DIVE } from '../core/umbra.js';

const BUFFER = 0.3;   // s a queued attack waits for the current swing to allow the next
// the critical-hit roll of each blade hit, and a blurry enemy's roll to let a blow or shot through
// (core/enemies.js evades), in 0..1 (browser checks pin them to keep numbers exact)
export const rolls = { crit: () => Math.random(), evade: () => Math.random() };

export function queueAttack(target = null) {
  const s = player.sword;
  s.requested = true; s.buffer = BUFFER; s.target = target;
}

function aimYaw(target) {
  if (!target) return player.yaw;
  const dx = target.x - player.x, dz = target.z - player.z;
  return Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : player.yaw;
}

// learn: architecture.html#swing-journey (see learn/README.md)
export function updateSword(dt) {
  if (state.inventoryOpen) return;
  if (state.transitioning) { cancelSwing(player); return; }
  // (inside a Bolime the weapon is slowed too: core/status.js weaponFactor; the buffer keeps real time)
  // (and under water, game/dive.js: core/umbra.js DIVE)
  advanceSwing(player, dt * weaponFactor(player) * (player.diving ? DIVE.attack : 1));
  const s = player.sword;
  // a drawn shot follows its target until it goes, then flies
  if (s.active && s.stats?.ranged && !s.fired && s.target?.profile && !absent(s.target)) s.yaw = aimYaw(s.target);
  if (shotDue(player)) {
    s.fired = true; s.reloading = s.stats.kind === 'crossbow';
    if (s.stats.kind === 'throw') throwFlask(player, s.stats, s.target, s.yaw);
    else fireShot(player, s.stats, s.target, s.yaw);
  }
  // a crossbow's string ratchets back and a bolt clicks in a moment before it is loaded again
  if (s.reloading && s.stats.chain - s.cool >= reloadTime(s.stats) - 0.25) { s.reloading = false; shotFx({ stats: s.stats }, 'reload'); }
  if (!s.requested) return;
  if ((s.buffer -= dt) < 0) { s.requested = false; return; }
  const target = s.target, stats = combatStats(player);
  if (!stats) { s.requested = false; setStatus(tr('No weapon equipped')); return; }
  if (stats.kind === 'throw' && cooldownLeft(player, stats.flask, state.time) > 0) return;   // waits in the buffer
  if (!startSwing(player, aimYaw(target))) return;
  s.requested = false; s.target = target;
  setStatus(tr(KINDS[s.stats.kind].verb));
  swingFx(s.stats.kind);
}

// enemy e took `hit` ({ damage, crit }) from a blow or shot along (dx, dz): it is knocked back
// along it, heavier bodies less (knockback affixes push harder; a poised enemy that shrugs the
// blow off barely moves), with the hit's effects. `before`: its health before the hit. by: who
// hit it (playing together, a friend's stand-in, game/party.js): it goes after them now. Our
// hits on enemies another player runs go to that player too (net/online.js relay).
// learn: network.html#boss, space.html#unit (see learn/README.md)
export function hitEnemy(e, hit, before, dx, dz, knockback = 1, by = player) {
  e.lastHit = by === player ? null : by.slot;   // who struck last (null: we did): its loot is theirs (game/enemies.js)
  state.enemyGrace = 0;   // you started it
  const l = Math.hypot(dx, dz) || 1;
  const push = (e.hp ? e.staggered ? 2.6 : 0.6 : 3.6) * knockback / e.profile.mass;
  e.kbx = dx / l * push; e.kbz = dz / l * push;
  e.target = by;
  enemyHitFx(e, before - e.hp, !e.hp, dx, dz, hit.crit, by === player);
  if (by === player) relay.hit?.(e, before - e.hp, hit.crit, dx, dz, knockback);
}

// learn: architecture.html#swing-journey (see learn/README.md)
export function hitWithSword(list) {
  const p = player;
  if (state.inventoryOpen || state.transitioning || p.ragdoll || p.held || p.stun > 0 || p.hp <= 0) return;
  for (const e of list) {
    if (!inSwordArc(p, e)) continue;
    const y = Math.max(baseY(e) + 0.1, Math.min(p.y + 0.4, baseY(e) + e.profile.bodyHeight - 0.05));
    if (!clearLine(p.x, p.y + 0.4, p.z, e.x, y, e.z)) continue;
    const before = e.hp, hit = swordHit(p, e, rolls.crit(), rolls.evade());
    if (!hit) continue;
    if (hit.evaded) { evadedFx(e, e.x - p.x, e.z - p.z); continue; }
    hitEnemy(e, hit, before, e.x - p.x, e.z - p.z, p.sword.stats?.knockback ?? 1);
    enchantHit(e, hit, p.sword.stats);
    const words = { level: e.level, name: enemyName(e.profile), hp: e.hp, max: e.profile.hp };
    if (e.hp) setStatus(p.sword.stats?.kind === 'trident' ? tr('Stabbed Lv {level} {name} ({hp}/{max})', words)
      : tr('Slashed Lv {level} {name} ({hp}/{max})', words));
  }
}
export const cancelSword = (resetCooldown = false) => cancelSwing(player, resetCooldown);
