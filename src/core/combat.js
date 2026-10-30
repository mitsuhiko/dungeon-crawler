// Pure attack rules. Jumping / body contact never call damageEnemy.
// An attack (a sword or flail swing, a trident's stab, a bow or crossbow shot, a spell, a trident's
// lightning) is a quick wind-up, a short
// active window and a recovery that a new attack (chaining) or movement can cut short. Swords and
// flails hit in the active window (inSwordArc; a flail of two or three balls strikes once with
// each, one after the other: ballAt); the ranged kinds let their shot go at its start (shotDue,
// core/shots.js). Each kind has its clip in character.glb, retimed to fit (swingClipTime): their
// own frames are the *_CLIP below.
// A weapon's `interval` is the time from one attack to the next when chaining (its attack
// speed); every other attack time scales with it. A flask in hand (core/inventory.js readied)
// attacks too: a throw, its flask lobbed at the target (game/throws.js). Potion buffs (core/
// potions.js) quicken attacks and add damage.
import { OLD_SWORD, ITEMS } from './items.js';
import { equippedItem, readiedItem } from './inventory.js';
import { levelDamage } from './progression.js';
import { itemStats } from './gear/stats.js';
import { effectMod, flaskStats } from './potions.js';
import { absent, baseY, exposedBy, hurtBy, steadyNow, wardedNow, evades } from './enemies.js';

// the clips' own timing (s): character.glb extras (blender/character.py)
export const SLASH_CLIP = { duration: 32 / 30, activeStart: 15 / 30, activeEnd: 21 / 30 };
// the bow is drawn and loosed at activeStart; a chained shot starts at `redraw`, the bow still up
export const SHOOT_CLIP = { duration: 32 / 30, activeStart: 18 / 30, activeEnd: 20 / 30, redraw: 7 / 30 };
// the bolt flies at activeStart, the crossbow is drawn and loaded again at `reloaded`
export const CROSSBOW_CLIP = { duration: 36 / 30, activeStart: 9 / 30, activeEnd: 11 / 30, reloaded: 26 / 30 };
export const CAST_CLIP = { duration: 28 / 30, activeStart: 12 / 30, activeEnd: 14 / 30 };
// a trident's stab: drawn back, then driven out (its prongs strike from activeStart to activeEnd;
// its lightning leaves the prongs at activeStart)
export const THRUST_CLIP = { duration: 26 / 30, activeStart: 11 / 30, activeEnd: 15 / 30 };
// the flask leaves the hand at activeStart
export const THROW_CLIP = { duration: 26 / 30, activeStart: 12 / 30, activeEnd: 14 / 30 };
// game time (s) for the basic sword (the glassmaker's old sword's timing)
// learn: checks.html#try-test, combat.html#chain #damage (see learn/README.md)
export const SWORD = {
  damage: 30, range: 0.85, arc: Math.PI * 0.42,
  activeStart: 0.16, activeEnd: 0.27,   // the blade connects ~0.16 s after the click
  moveCancel: 0.3, chain: 0.42,         // walk out of the recovery / swing again from here
  duration: 0.62,
};
// a flail at the interval of a middling one: slower to come round than a sword (the ball trails
// the hand), its sweep longer (room for each of its balls to strike in turn)
export const FLAIL = { activeStart: 0.24, activeEnd: 0.38, moveCancel: 0.44, chain: 0.62, duration: 0.8 };
// the ranged kinds at the interval of a middling one: activeStart is when the shot leaves
export const BOW = { activeStart: 0.36, activeEnd: 0.4, moveCancel: 0.44, chain: 0.62, duration: 0.78 };
export const CROSSBOW = { activeStart: 0.2, activeEnd: 0.24, moveCancel: 0.3, chain: 0.84, duration: 0.95 };
export const STAFF = { activeStart: 0.28, activeEnd: 0.32, moveCancel: 0.38, chain: 0.62, duration: 0.72 };
// a trident at the interval of a middling one: a quick stab, its prongs going through for a while
// (its lightning thrown the same way, the bolt leaving at activeStart)
export const TRIDENT = { activeStart: 0.24, activeEnd: 0.34, moveCancel: 0.4, chain: 0.58, duration: 0.66 };
export const THROW = { activeStart: 0.3, activeEnd: 0.34, moveCancel: 0.38, chain: 0.7, duration: 0.8 };
// how each kind of weapon attacks: its timing, its clip, and what it shoots (core/shots.js SHOTS)
// learn: combat.html#shoot (see learn/README.md)
export const KINDS = {
  sword: { timing: SWORD, clip: SLASH_CLIP, shot: null, verb: 'Sword slash' },
  flail: { timing: FLAIL, clip: SLASH_CLIP, shot: null, verb: 'Flail swing' },
  bow: { timing: BOW, clip: SHOOT_CLIP, shot: 'arrow', verb: 'Bow shot' },
  crossbow: { timing: CROSSBOW, clip: CROSSBOW_CLIP, shot: 'bolt', verb: 'Crossbow shot' },
  staff: { timing: STAFF, clip: CAST_CLIP, shot: 'spell', verb: 'Spell cast' },
  trident: { timing: TRIDENT, clip: THRUST_CLIP, shot: null, verb: 'Trident stab' },
  // a trident's lightning, thrown at what is out of its reach (combatStats)
  zap: { timing: TRIDENT, clip: THRUST_CLIP, shot: 'lightning', verb: 'Lightning' },
  throw: { timing: THROW, clip: THROW_CLIP, shot: 'flask', verb: 'Throw' },
};
const TIMES = ['activeStart', 'activeEnd', 'moveCancel', 'chain', 'duration'];
// how far above and below their feet the ranged kinds can aim (a sword sweeps knee to chest)
export const AIM_BAND = { below: 2.2, above: 2.6 };
// a blow taking at least this share of an enemy's health staggers it even while it is poised
// learn: combat.html#stagger-code (see learn/README.md)
export const HEAVY_HIT = 0.25;
// how far beyond blade reach the wind-up steps in towards a target (game/update.js)
export const LUNGE_REACH = 0.6;
// The player's attack, whatever the weapon (named for the sword it once was).
// requested: an attack is queued (buffer: for how much longer); target: what it aims at
// (an enemy, a point {x, z} or null for straight ahead); fired: the shot of this attack left;
// chained: it started while the one before was still going; ball: which of a flail's balls
// strikes now (hits: what it struck)
export const swordState = () => ({ active: false, requested: false, buffer: 0, target: null,
  t: 0, cool: 0, serial: 0, yaw: 0, stats: null, hits: new Set(), fired: false, chained: false, ball: 0 });
// the equipped weapon instance (a bag slot), and its base type; a player without an
// inventory (tests) holds the glassmaker's plain old sword
export const equippedInstance = p => p.inventory ? equippedItem(p.inventory) : { itemId: OLD_SWORD.id, count: 1 };
export const equippedWeapon = p => ITEMS[equippedInstance(p)?.itemId] || null;
// the kind of weapon p fights with (what loot leans towards, core/gear/bases.js), or null
export const favoredKind = p => equippedWeapon(p)?.weapon?.kind ?? null;
export const canChangeWeapon = p => !p.sword.active && !p.ragdoll && !p.climb && !p.swimming && !p.swimOut && p.stun <= 0 && p.hp > 0;
// the flask p holds ready to throw, if any
export const readiedFlask = p => p.inventory ? readiedItem(p.inventory) : null;
// null without a weapon (or a flask in hand): no attacks at all. Haste (attackSpeed) shortens
// every attack time, might (damage) adds to the damage (a flask's too).
// A trident stabs what is within its reach (`target`, an enemy: the stab's lunge included) and
// throws lightning at what is further off: its attack is then of kind 'zap', a ranged one
// (zapStats). Asked without a target (what to aim at, how far to walk up: game/input.js,
// game/orders.js) it answers with its lightning, which reaches furthest; a target that is no
// enemy (a point, or straight ahead: null) is stabbed at.
export function combatStats(p, target) {
  const haste = 1 + effectMod(p, 'attackSpeed'), might = 1 + effectMod(p, 'damage'), flask = readiedFlask(p);
  if (flask) {
    const f = flaskStats(flask, p.level, might), T = THROW, speed = 1 / haste;
    return { ...SWORD, kind: 'throw', ranged: true, flask: flask.id, ...f, damage: f.blast, crit: 0, critDamage: 1, knockback: 1,
      pierce: 0, burst: f.radius, ...Object.fromEntries(TIMES.map(k => [k, T[k] * speed])) };
  }
  let weapon = itemStats(equippedInstance(p));
  if (!weapon) return null;
  if (weapon.zap && !withinStab(p, target, weapon)) weapon = zapStats(weapon);
  const interval = weapon.interval / haste, T = KINDS[weapon.kind].timing, speed = interval / T.chain;
  return { ...SWORD, ...weapon, damage: Math.round(weapon.damage * levelDamage(p.level || 1) * might),
    ...Object.fromEntries(TIMES.map(k => [k, T[k] * speed])), chain: interval };
}

// can a trident's stab (its reach `weapon.range`, the lunge's LUNGE_REACH beyond) reach target?
// (undefined: nothing in particular, its lightning reaches further; not an enemy: stab ahead)
function withinStab(p, target, weapon) {
  if (target === undefined) return false;
  if (!target?.profile) return true;
  return Math.hypot(target.x - p.x, target.z - p.z) <= weapon.range + target.profile.radius + LUNGE_REACH;
}
// a trident's attack stats for its lightning: ranged, its range, a share of the stab's damage
export const zapStats = w => ({ ...w, kind: 'zap', ranged: true, range: w.zap.range, damage: Math.max(1, Math.round(w.damage * w.zap.share)),
  shot: 'lightning', jumps: w.zap.jumps, pierce: 0, burst: 0, color: w.color ?? '#9fd0ff' });

// the attack clip's time for attack time t: wind-up, active window and recovery are each
// mapped onto the clip's own parts, so the blade connects (the shot leaves) on the clip's
// frames for it. from: where in the clip the wind-up starts (a chained bow shot: redraw)
export function swingClipTime(stats, t, from = 0) {
  const s = stats || SWORD, C = KINDS[s.kind ?? 'sword'].clip;
  const seg = (t0, t1, c0, c1) => c0 + (c1 - c0) * (t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1);
  if (t < s.activeStart) return seg(0, s.activeStart, from, C.activeStart);
  if (t < s.activeEnd) return seg(s.activeStart, s.activeEnd, C.activeStart, C.activeEnd);
  return seg(s.activeEnd, s.duration, C.activeEnd, C.duration);
}
// where the clip of the attack p is making starts (a chained bow shot skips raising the bow)
export const swingClipFrom = s => s.chained && s.stats?.kind === 'bow' ? SHOOT_CLIP.redraw : 0;
// the attack time at which a crossbow is loaded again (its clip's `reloaded`, retimed)
export function reloadTime(stats) {
  const C = CROSSBOW_CLIP;
  return stats.activeEnd + (C.reloaded - C.activeEnd) / (C.duration - C.activeEnd) * (stats.duration - stats.activeEnd);
}
// is a bolt lying on p's crossbow? Not from the shot until the reload lays the next one, even
// when moving cut the reload short (then once the shot's cooldown says so)
export function crossbowLoaded(p) {
  const s = p.sword, stats = s.stats;
  return !s.fired || stats?.kind !== 'crossbow' || s.cool <= 0 || stats.chain - s.cool >= reloadTime(stats);
}

export function cancelSwing(p, resetCooldown = false) {
  p.sword.active = false;
  p.sword.requested = false; p.sword.buffer = 0;
  p.sword.hits.clear();
  if (resetCooldown) p.sword.cool = 0;
}
// a new swing may start when idle, or once the current one reaches its chain point (cool)
export function startSwing(p, yaw = p.yaw) {
  const s = p.sword, stats = combatStats(p, s.target ?? null);
  if (!stats || s.cool > 0 || p.ragdoll || p.swimming || p.swimOut || p.climb || p.stun > 0 || p.hp <= 0) return false;
  // Snapshot this swing: a level-up or later equipment change cannot alter a hit midway.
  Object.assign(s, { chained: s.active, active: true, t: 0, cool: stats.chain, yaw, serial: s.serial + 1, stats, fired: false, ball: 0 });
  s.hits.clear();
  return true;
}
// the ranged kinds: has the attack reached the moment its shot leaves (and not shot yet)?
export const shotDue = p => p.sword.active && !!p.sword.stats?.ranged && !p.sword.fired && p.sword.t >= p.sword.stats.activeStart;
// movement may cut the swing short once the blade has gone through
export const canMoveCancel = p => p.sword.active && p.sword.t >= (p.sword.stats || SWORD).moveCancel;
export function advanceSwing(p, dt) {
  const s = p.sword;
  s.cool = Math.max(0, s.cool - dt);
  if (!s.active) return;
  if (p.ragdoll || p.swimming || p.climb || p.stun > 0 || p.hp <= 0) { cancelSwing(p); return; }
  s.t += dt;
  if (s.t >= (s.stats || SWORD).duration) { cancelSwing(p); return; }
  const ball = ballAt(s.stats, s.t);
  if (ball !== s.ball) { s.ball = ball; s.hits.clear(); }   // the next ball: it may strike them all again
}
// which of a flail's balls strikes at attack time t: its active window shared out between them
// (0 for everything else, and before the window)
export function ballAt(stats, t) {
  const n = stats?.balls ?? 1;
  if (n < 2 || t < stats.activeStart) return 0;
  return Math.min(n - 1, Math.floor((t - stats.activeStart) / (stats.activeEnd - stats.activeStart) * n));
}

// learn: combat.html#arc-code #hit-test (see learn/README.md)
export function inSwordArc(p, enemy) {
  const s = p.sword, stats = s.stats || SWORD;
  if (!s.active || stats.ranged || s.t < stats.activeStart || s.t > stats.activeEnd
      || absent(enemy) || s.hits.has(enemy)) return false;
  const dx = enemy.x - p.x, dz = enemy.z - p.z, distance = Math.hypot(dx, dz);
  if (distance > stats.range + enemy.profile.radius) return false;
  if (distance > 0.01 && Math.cos(Math.atan2(dx, dz) - s.yaw) < Math.cos(stats.arc)) return false;
  // A blade sweeps around knee-to-chest height, not through a floor below us.
  const bottom = p.y + 0.08, top = p.y + 0.85, y = baseY(enemy);
  return y + enemy.profile.bodyHeight > bottom && y < top;
}
// can the weapon of `stats` reach enemy e's height? A blade sweeps the band inSwordArc checks;
// shots fly up or down to the ranged kinds' AIM_BAND
export function inReachBand(p, e, stats) {
  const y = baseY(e);
  if (stats?.ranged) return y + e.profile.bodyHeight > p.y - AIM_BAND.below && y < p.y + AIM_BAND.above;
  return y + e.profile.bodyHeight > p.y + 0.08 && y < p.y + 0.85;
}
// Keyboard soft-targeting, like Diablo's controller scheme: the closest living enemy within
// the weapon's reach plus `extra`, preferring those ahead along `yaw`.
// visible(e): line of sight, checked only for the candidates that would win.
export function softTarget(p, enemies, yaw = p.yaw, visible = () => true, extra = 0) {
  const stats = combatStats(p) || SWORD, range = stats.range;
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    if (absent(e) || !inReachBand(p, e, stats)) continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d > range + e.profile.radius + extra) continue;
    const ahead = d > 0.01 ? Math.cos(Math.atan2(dx, dz) - yaw) : 1;
    const score = d * (1.5 - 0.5 * ahead);   // straight behind counts as twice as far
    if (score < bestScore && visible(e)) { best = e; bestScore = score; }
  }
  return best;
}
// A hit staggers: it interrupts a wind-up (each swing can hit an enemy only once). Then the
// enemy is poised for profile.poise s: lighter hits hurt it but do not stagger it again, so it
// can strike back (enemy.staggered says which it was). stagger: false for damage that only
// hurts (burning, poison ticks; core/status.js). A boss's own rules (core/gusto.js) bend this:
// a body that passes for another (`host`: Umbra's along his body) takes nothing itself, its host does;
// nothing hurts an enemy while it is `shield`ed (s), no blow takes it below its `hpFloor`, and
// any hit at all fells a `proxy`. Nothing staggers an enemy in the `steady` part of an attack
// (Totnar rolling, core/enemies.js steadyNow), nor a `steadfast` one (Squarlo a giant), and
// nothing hurts one in a `ward`ed one (Squarlo calling the tide, wardedNow).
// learn: combat.html#damage #stagger-code (see learn/README.md)
export function damageEnemy(enemy, amount, stagger = true) {
  // (a body that passes for another, along his body: Umbra's, game/umbra.js; the blow is his)
  if (enemy.host) return !absent(enemy) && damageEnemy(enemy.host, amount, stagger);
  if (absent(enemy) || enemy.shield > 0 || wardedNow(enemy)) return false;
  if (enemy.proxy) amount = enemy.hp;
  enemy.hp = Math.max(Math.min(enemy.hpFloor ?? 0, enemy.hp), enemy.hp - amount);
  enemy.hurtT = 0.22;
  if (!stagger && enemy.hp) return true;
  if ((exposedBy(enemy) > 1 || steadyNow(enemy) || enemy.profile.steadfast) && enemy.hp) { enemy.staggered = false; return true; }   // lying helpless: it stays down
  enemy.staggered = !enemy.hp || !(enemy.poised > 0) || amount >= HEAVY_HIT * enemy.profile.hp;
  if (!enemy.hp) {
    enemy.mode = 'dead'; enemy.deadT = 0; enemy.path = null; enemy.speed = 0;
  } else if (enemy.staggered) {
    enemy.mode = 'chase'; enemy.stun = enemy.profile.hitStun; enemy.speed = 0;
    enemy.cool = Math.max(enemy.cool, 0.45);
    enemy.think = 0;
    enemy.poised = enemy.profile.poise ?? 0;
  }
  return true;
}
// a blade hit: { damage, crit } (false for none). roll: the crit roll in 0..1. A crit
// multiplies the damage; life on hit (leech) heals, never above the maximum. dodge: the roll
// for a blurry enemy to let it through (weaponHit)
// learn: architecture.html#swing-journey, checks.html#try-test, code.html#whole (see learn/README.md)
export function swordHit(p, enemy, roll = Math.random(), dodge = Math.random()) {
  if (!inSwordArc(p, enemy)) return false;
  p.sword.hits.add(enemy);
  return weaponHit(p, p.sword.stats || SWORD, enemy, roll, 1, dodge);
}
// any weapon's hit on enemy with the attack stats `stats` (a swing's, or a shot's snapshot of
// them), for `share` of its damage (a spell's burst: less): { damage, crit } or false. An enemy
// lying helpless (core/enemies.js exposedBy) takes more, an armoured one less (hurtBy). A blurry
// one (a Flimmer) that shimmers lets it go right through it now and then (core/enemies.js evades,
// with the roll `dodge`: 1 never): { evaded: true }, nothing done.
// learn: code.html#whole (see learn/README.md)
export function weaponHit(p, stats, enemy, roll = Math.random(), share = 1, dodge = Math.random()) {
  if (evades(enemy, dodge)) return { evaded: true, damage: 0, crit: false };
  const crit = roll < (stats.crit ?? 0);
  const damage = Math.max(1, Math.round(stats.damage * share * (crit ? stats.critDamage ?? 1.5 : 1) * hurtBy(enemy)));
  if (!damageEnemy(enemy, damage)) return false;
  if (stats.leech && p.hp > 0) p.hp = Math.min(p.maxHp ?? Infinity, p.hp + stats.leech * (enemy.profile.leechScale ?? 1));
  return { damage, crit };
}
