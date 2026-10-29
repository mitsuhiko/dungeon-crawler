// The player's shots in flight in the current cube (core/shots.js): arrows, bolts, spells and
// lightning. They hit the enemies they meet, stop at walls and props or at their range; a spell
// bursts where it ends, lightning jumps on from the enemy it struck to the next ones. Travel and level resets clear them. Playing together, the friend's shots fly
// here too (`ghost`): they stop where they would, but their hits are the friend's to make.
import { player, state, setStatus } from './state.js';
import { insideSolid } from '../physics/collide.js';
import { clearLine } from '../physics/enemynav.js';
import { weaponHit } from '../core/combat.js';
import { launchShot, stepShot, burstTargets, chainTargets, chainShare, aimPoint, BURST_SHARE, MUZZLES, SHOTS } from '../core/shots.js';
import { hitEnemy, rolls } from './sword.js';
import { shotFx, chainFx, evadedFx } from './juice.js';
import { drawShots, removeShotViews } from '../render/shots.js';
import { relay } from '../net/online.js';
import { enchantHit } from './enchants.js';
import { tr } from '../i18n/i18n.js';
import { enemyName, evades } from '../core/enemies.js';

export let shots = [];
const solid = (x, y, z) => insideSolid(x, z, y);

// can p's ranged weapon of `stats` hit enemy e from where p stands: is the line from where the
// shot leaves to the middle of its body clear of the level?
export function lineOfFire(p, e, stats) {
  const a = aimPoint(e);
  return clearLine(p.x, p.y + MUZZLES[stats.kind][1], p.z, a.x, a.y, a.z);
}
// the attack with stats `stats` lets its shot go at `target`, from p turned to `yaw`
export function fireShot(p, stats, target, yaw) {
  const shot = launchShot(p, stats, target, yaw);
  shots.push(shot);
  shotFx(shot, 'launch');
  relay.shoot?.(shot);
  return shot;
}
// the friend's shot (what relay.shoot sent): { kind, stats, x, y, z, vx, vy, vz, from }
export function ghostShot(s) {
  const stats = { ...s.stats, jumps: Math.min(4, Math.max(0, s.stats.jumps | 0)) };   // (a friend's lightning jumps on too)
  const shot = { ...s, stats, spec: SHOTS[s.kind], travelled: 0, t: 0, hits: new Set(), left: s.stats.pierce ?? 0, x0: s.x, y0: s.y, z0: s.z, ghost: true };
  shots.push(shot);
  shotFx(shot, 'launch');
}

// (dodge: the roll to go through a blurry one; 1 for a shot that already went at it, stepShot)
function strike(shot, e, share = 1, dodge = rolls.evade()) {
  const before = e.hp, hit = weaponHit(player, shot.stats, e, rolls.crit(), share, dodge);
  if (!hit) return;
  if (hit.evaded) { evadedFx(e, e.x - shot.x, e.z - shot.z); return; }
  // knocked back along the flight (a burst: away from where it went off)
  const [dx, dz] = share < 1 ? [e.x - shot.x, e.z - shot.z] : [shot.vx, shot.vz];
  hitEnemy(e, hit, before, dx, dz, shot.stats.knockback ?? 1);
  enchantHit(e, hit, shot.stats);
  if (e.hp) setStatus(tr('Hit Lv {level} {name} ({hp}/{max})', { level: e.level, name: enemyName(e.profile), hp: e.hp, max: e.profile.hp }));
}

// lightning that struck enemy `from` jumps on to the next ones (core/shots.js chainTargets): it
// hurts them (ours; a friend's is drawn only), each for less, where the level is not in the way
const inSight = (a, b) => { const p = aimPoint(a), q = aimPoint(b); return clearLine(p.x, p.y, p.z, q.x, q.y, q.z); };
function chain(shot, from, enemies) {
  chainTargets(shot, enemies, from, inSight).forEach((e, i) => {
    chainFx(shot, from, e);
    shot.hits.add(e);
    if (!shot.ghost) strike(shot, e, chainShare(i));
    from = e;
  });
}

export function updateShots(dt, enemies) {
  if (state.inventoryOpen || state.transitioning || !shots.length) return;
  shots = shots.filter(shot => {
    // (our own shots may go through a blurry Flimmer; a friend's rolled for theirs on their side)
    const { hits, misses, end } = stepShot(shot, dt, enemies, solid, shot.ghost ? null : e => evades(e, rolls.evade()));
    if (!shot.ghost) for (const e of hits) strike(shot, e, 1, 1);
    for (const e of misses) evadedFx(e, shot.vx, shot.vz);
    if (!end) return true;
    if (shot.stats.burst && !shot.ghost) for (const e of burstTargets(shot, enemies)) strike(shot, e, BURST_SHARE);
    if (shot.stats.jumps && end === 'hit' && hits.length) chain(shot, hits.at(-1), enemies);
    shotFx(shot, end);
    removeShotViews([shot]);
    return false;
  });
}
export const drawAllShots = (dt, off) => drawShots(shots, dt, off);
export function clearShots() { removeShotViews(shots); shots = []; }
