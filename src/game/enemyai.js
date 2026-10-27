// Shared floor-bound behaviour. Species tuning controls health, speed, clearance,
// wind-up / strike / recovery, and what a hit does; a species with several attacks
// picks one each time it strikes, among those its target is in reach of. A ranged attack is
// thrown from its reach away when it has a clear shot; a species that also fights up close
// keeps closing in while its throw recovers. A pouncing one is carried forward through its leap,
// one that retreats (the Spicy) rolls back before it fires its beam (game/beams.js; the Wolk's
// lightning is a beam too), and the Wolla's storm blows from its hit frame on (game/gusts.js).
// One that rides (the Tornado) is carried through the air on a twister of its own (game/twisters.js
// spins them up, and the ones it throws).
//
// Whom it goes after: the player, or when playing together the nearer of the two players
// (game/party.js chooseTarget, its `target`); "the player" below is that one.
//
// Awareness: an enemy sees the player within its `aggro` ahead of it, half as far behind it,
// and hears one right next to it. It turns towards a player it half notices, reacts a moment
// after it notices, and calls the others near it. A hunt follows the player over the floor
// graph (stairs, ramps, bridges and landings included) to where it last knew the player stood,
// or to the nearest floor it can strike (or shoot) them from; out of sight it keeps hunting for a
// while, then searches around that spot and only then goes home. A hit makes it hunt for longer,
// and further: it knows where the shot came from and goes there.
// One that cannot get at the player (no way to them, and no spot to shoot them from) takes cover
// (`hide`): hit, almost at once; else after a moment glaring from as close as it gets. It runs to the
// nearest floor out of the player's sight or out of their weapon's range, lies low there and
// comes back into the fight once it sees a way to them, or goes home after a while.
// In the fight its `style` decides what it does between blows: a skirmisher backs off and
// circles, then darts in again; a ranged one keeps its distance and sidesteps; a brute holds
// its ground (and a `charge`r runs at the player from a few cells away). Throws are aimed a
// little ahead of a running player.
// A burrowing one (a `burrow`: the Squirtle) keeps diving under the floor in the fight, moving
// about fast down there where nothing sees, hits or touches it, and coming up again to throw.
// A fluid dweller (a `dwells`: the Squirtle, physics/dwell.js) does all of that in its fluid alone:
// its hunts, posts and cover are all in it, it dives under its surface and never on land, and it
// leaps out of it only to crash down on a player near it. Out of it (it leapt, its tide fell, its
// flood drained) it goes `ashore`: it stands a moment, dissolves into a puddle and runs back into
// the nearest of it; with none to get back to it seeps away. It keeps its distance from a player
// who shoots, but comes up to the shore near one with a short weapon (`closeIn`).
import { player, state } from './state.js';
import { party, chooseTarget, alive as canHurt } from './party.js';
import { playerFloor, strikePlayer, hitBody, attacker } from './enemycombat.js';
import { stepEnemy, findPath, pathToward, around, clearLine, walkable, nearest, floorAt } from '../physics/enemynav.js';
import { walkerOf, walker, wetAt } from '../physics/dwell.js';
import { postPath, coverPath, covered, shorePath } from './tactics.js';
import { combatStats } from '../core/combat.js';
import { attackOf, pickAttack, attacksInReach, lungeDistance, lungeAt, retreatAt, fireAt, shotOf, blowOf, behind } from '../core/enemies.js';
import { launchProjectile } from './projectiles.js';
import { fireBeam } from './beams.js';
import { tryHordeAttack } from './hordes.js';
import { enemySlow } from '../core/status.js';
import { chillFactor } from '../core/projectiles.js';
import { enemyMire } from '../core/footing.js';
import { themeById } from '../themes/depth.js';

const THINK = 0.2;         // s between decisions
export const AHEAD = -0.2; // ahead: the cosine of the angle to the player is above this (about 100 degrees each way)
export const BEHIND = 0.5; // the share of its aggro an enemy sees behind it
export const HEAR = 1.6;   // cells: this close it notices the player without seeing them
export const WARY = 1.4;   // times its aggro: it turns towards a player it can see this far
const REACT = 0.3;         // s (and up to as much again) from noticing to giving chase
const CALL = 5;            // cells: how far a call to arms carries
const MEMORY = 3;          // s it hunts on out of sight
const PROVOKED = 6;        // s after a hit it hunts on out of sight
const SEARCH = 4;          // s it searches around the spot it lost the player at
const STRANDED = 1.5;      // s it glares from as close as it gets at a player it cannot reach
const BALK = 0.4;          // s, after a hit: a player out of reach for this long sends it into cover
const HUNT = 24;           // longest path (steps) it plans on a hunt
const FAR = 40;            // longest path (steps) it plans after a hit, and to cover
const HIDE = 6;            // s it lies low in cover before it goes home
const DANGER = 8;          // cells: how far a player whose weapon it cannot tell hits from
const SAFE = 4;            // cells: the least it keeps away from a player it hides from
const LEAD = 0.5;          // how much of a running player's way a throw is aimed ahead
const STAND = 1.2;         // s a fluid dweller stands on land before it dissolves
const RISE = 0.3;          // s a fluid dweller's puddle lies in its fluid before it rises
const DRY = 1.5;           // s a fluid dweller's puddle with no way back into its fluid lasts
const SHORE = 0.3;         // cells inside a short weapon's reach a fluid dweller comes up to

// Calls to arms: where an enemy noticed the player (or was hit), heard by idle allies nearby.
let calls = [];
export const resetCalls = () => { calls = []; };
export function stepCalls(dt) { calls = calls.filter(c => (c.t -= dt) > 0); }
const call = e => calls.push({ x: e.x, y: e.y, z: e.z, t: 0.3, from: e });

// (a big body turns no faster than its `turnSpeed`, rad/s: Slomo steps round, he does not spin)
// learn: space.html#angles (see learn/README.md)
const turn = (e, yaw, dt, rate = 8) => {
  let d = Math.atan2(Math.sin(yaw - e.yaw), Math.cos(yaw - e.yaw)) * Math.min(1, dt * rate);
  const most = e.profile.turnSpeed;
  if (most) d = Math.max(-most * dt, Math.min(most * dt, d));
  e.yaw += d;
};
// the player e goes after (one that left the cube is not gone after any more)
const foe = e => e.target && (e.target === player || e.target.here) ? e.target : player;
const toPlayer = e => { const p = foe(e); return Math.atan2(p.x - e.x, p.z - e.z); };
const side = () => Math.random() < 0.5 ? -1 : 1;
// how it walks: its height, a fluid dweller's walker (physics/dwell.js)
const nav = e => walkerOf(e);
// slime holds an enemy's feet as it holds the player's (core/footing.js enemyMire), and a slowing
// (slime thrown or fallen on it, core/status.js) slows how fast it moves, not what else it does
const mired = e => enemyMire(e, state.map, state.map?.biome && themeById(state.map.biome)) * chillFactor(e.slowed);
function steer(e, x, z, speed, dt) {
  if (e.under) speed *= e.profile.burrow.speed / e.profile.chase;   // (it moves fast under the floor)
  speed *= mired(e);
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d < 0.05) { e.speed = 0; return true; }
  turn(e, Math.atan2(dx, dz), dt);
  const forward = Math.max(0, (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d);
  const step = Math.min(d, speed * forward * dt), x0 = e.x, z0 = e.z;
  stepEnemy(e, Math.sin(e.yaw) * step, Math.cos(e.yaw) * step);
  e.speed = Math.hypot(e.x - x0, e.z - z0) / dt;
  return false;
}
// move along (ux, uz) while facing the player: sidesteps and backing off. Returns the share
// of the step it managed.
function slide(e, ux, uz, speed, dt) {
  const x0 = e.x, z0 = e.z;
  speed *= mired(e);
  stepEnemy(e, ux * speed * dt, uz * speed * dt);
  turn(e, toPlayer(e), dt);
  e.speed = Math.hypot(e.x - x0, e.z - z0) / dt;
  return e.speed / speed;
}
function follow(e, speed, dt, end) {
  if (!e.path) { e.speed = 0; return true; }
  const i = e.path.indexOf(e.f);
  if (i > 0) e.path = e.path.slice(i);
  const next = e.path[1];
  if (next) { steer(e, next.x + 0.5, next.z + 0.5, speed, dt); return false; }
  return steer(e, end ? end[0] : e.f.x + 0.5, end ? end[1] : e.f.z + 0.5, speed, dt);
}

// a clear line from its eyes to the player's chest, within range and within `rise` above or below
function sees(e, range, rise = 1.6, p = foe(e)) {
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (d > range || Math.abs(p.y - e.y) > rise) return false;
  return clearLine(e.x, e.y + Math.min(e.profile.bodyHeight, 1) * 0.8, e.z, p.x, p.y + 0.6, p.z);
}
// does an unaware enemy notice the player? Ahead of it within aggro, behind it at half that,
// or right next to it
// learn: enemies.html#decide-code (see learn/README.md)
export function notices(e, p = foe(e)) {
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (d < HEAR && Math.abs(p.y - e.y) < 1) return true;
  const ahead = Math.cos(Math.atan2(p.x - e.x, p.z - e.z) - e.yaw) > AHEAD;
  return sees(e, e.profile.aggro * (ahead ? 1 : BEHIND), 1.6, p);
}
// remember where the player is (and the floor they stand on, if this enemy can walk it; in the
// air, the one they stood on while they are still above it)
function spot(e) {
  const p = foe(e), f = playerFloor(e.profile.height, p), old = e.seen?.f;
  const over = old && Math.abs(p.x - old.x - 0.5) < 1 && Math.abs(p.z - old.z - 0.5) < 1;
  e.seen = { x: p.x, y: p.y, z: p.z, f: f ?? (over && !p.grounded ? old : null) };
  e.lost = 0;
}
function notice(e, delay, loud) {
  spot(e);
  e.mode = 'alert'; e.t = delay; e.speed = 0; e.path = null;
  if (loud) call(e);
}
// a hit: it goes after whoever struck it, knows where the shot came from, hunts for longer and
// calls the others
function provoke(e) {
  const by = e.lastHit == null ? player : party().find(b => b.slot === e.lastHit);
  if (canHurt(by) && (by === player || by.here)) e.target = by;
  spot(e); e.provoked = PROVOKED;
  if (e.horde || e.defence) return;   // their groups decide
  call(e);
  if (e.mode !== 'attack' && e.mode !== 'chase') { e.mode = 'chase'; e.think = 0; }
}
function goHome(e) { e.mode = 'home'; e.path = findPath(e.f, e.home, 40, nav(e)) || [e.f]; e.provoked = 0; e.shy = false; }
// searching: to where it lost the player (as close as it gets), then about there
function search(e) {
  const s = e.seen, h = nav(e);
  e.mode = 'search'; e.t = SEARCH; e.pause = 0; e.look = e.yaw;
  e.path = s ? (s.f && findPath(e.f, s.f, HUNT, h)) || pathToward(e.f, s.x, s.y, s.z, HUNT, h) : null;
  e.lair = e.path?.at(-1) ?? e.f;
}
// how far player p can hit it from: their shot's range (a friend's it cannot tell), at least SAFE
function danger(p) {
  const stats = p === player ? combatStats(player) : null;
  return Math.max(SAFE, p === player ? (stats?.ranged ? stats.range : 0) : DANGER) + 1;
}
// How near a fluid dweller comes to the player it fights, that they can hit it (their short
// weapon's reach, SHORE inside it, and its body); null: it keeps its distance as any ranged one
// does (from a player who shoots, or from a friend whose weapon it cannot tell)
function closeIn(e, p = foe(e)) {
  if (!e.profile.dwells || p !== player) return null;
  const stats = combatStats(player);
  return stats?.ranged ? null : (stats?.range ?? 1) + e.profile.radius - SHORE;
}
// the distances a ranged one keeps from the player it fights (a fluid dweller coming up to the
// shore: none, it comes up close)
const keepOf = e => closeIn(e) ? [0, closeIn(e)] : e.profile.keep;
// the way to where it can attack the player it remembers: to the floor they stand on, else to
// the nearest floor it can strike (or shoot) them from (a fluid dweller coming up to the shore:
// one near enough to them, or as near as its fluid goes)
function way(e, far) {
  const s = e.seen, close = closeIn(e);
  if (close) return shorePath(e, s, close, far);
  return (s.f && findPath(e.f, s.f, far, nav(e))) || postPath(e, s, far);
}
// taking cover from a player it cannot get at
function hide(e) {
  const p = foe(e), s = e.seen ?? p;
  e.mode = 'hide'; e.t = HIDE; e.recheck = 1; e.stranded = 0; e.shy = true;
  e.path = coverPath(e, s, danger(p), FAR) ?? [e.f];
}
// Hunting: a way to the player (to their floor, else to a spot to strike them from); with none,
// it goes as close as it gets and takes cover after glaring there a moment (soon after a hit:
// the player has it in their sights). Out of sight for too long, or there and the player gone,
// it starts searching.
function hunt(e) {
  const p = foe(e), cfg = e.profile, d = Math.hypot(p.x - e.x, p.z - e.z);
  if (sees(e, Math.max(cfg.aggro, cfg.giveUp), 4) || d < HEAR) spot(e);   // a quarry up a stair stays in sight
  else e.lost += THINK;
  if (!e.seen) { search(e); return; }
  const provoked = e.provoked > 0;
  e.path = way(e, provoked ? FAR : HUNT);
  if (e.path) { e.stranded = 0; e.shy = false; }
  else {
    // (hit in cover, with still no way to the player: on to other cover at once)
    if (provoked && e.shy) { hide(e); return; }
    e.path = pathToward(e.f, e.seen.x, e.seen.y, e.seen.z, HUNT, nav(e));
    const stuck = provoked || (e.lost === 0 && e.path?.length <= 1);
    e.stranded = stuck ? (e.stranded || 0) + THINK : 0;
    if (e.stranded > (provoked ? BALK : STRANDED)) { hide(e); return; }
  }
  const memory = e.provoked > 0 ? PROVOKED : MEMORY;
  // out of sight: on to where it last saw the player, then look around there
  const there = e.lost > 0.6 && (!e.path || e.path.length <= 1);
  if (e.lost > memory || there) search(e);
}
// Lying low: once it sees the player and a way to them, back into the fight; out of cover
// again (the player moved where it saw them), on to other cover; after a while, home.
function lie(e) {
  const p = foe(e), cfg = e.profile;
  if (sees(e, Math.max(cfg.aggro, cfg.giveUp), 4) || Math.hypot(p.x - e.x, p.z - e.z) < HEAR) {
    spot(e);
    const path = way(e, HUNT);
    if (path) { e.mode = 'chase'; e.path = path; e.side = side(); e.shy = false; return; }
  }
  if (e.t <= 0) { goHome(e); return; }
  if ((e.recheck -= THINK) > 0 || (e.path && e.path.at(-1) !== e.f)) return;
  e.recheck = 1;
  const s = e.seen ?? p, far = danger(p);
  if (!covered(cfg, s, far)(e.f)) e.path = coverPath(e, s, far, FAR) ?? [e.f];
}
// learn: enemies.html#decide-code #state-machine, paths.html#bfs (see learn/README.md)
function decide(e) {
  e.target = chooseTarget(e);
  const p = foe(e), cfg = e.profile, target = playerFloor(cfg.height, p);
  const alive = !p.ragdoll && !p.flipping && p.hp > 0 && !state.transitioning, dist = Math.hypot(p.x - e.x, p.z - e.z);
  // a boss, once hurt or once it has struck, fights on wherever the player goes: in his arena
  // his room says so (game/defence.js), anywhere else (a dev spawn, the boss test room) he does
  const relentless = !e.defence && e.boss && !e.proxy && (e.hp < cfg.hp || e.attacks > 0);
  // a boss whose fight moves him itself: along a way of its own (`route`: Foggery climbing his
  // tower), or where it holds him (`anchored`: Foggery floating over his lava). No hunting, only
  // striking whoever is in reach (game/foggery.js)
  if (e.route || e.anchored) {
    if (e.mode === 'attack') return;
    e.mode = 'chase'; e.lost = 0;
    e.path = e.anchored ? null : e.route();
    return;
  }
  // on one of the platforms round Foggery's tower (`deck`: his Fire-cats, game/foggery.js): it
  // goes for the player over the slab (its fight takes it from one platform to another)
  if (e.deck) {
    if (e.mode === 'attack') return;
    e.mode = 'chase'; e.lost = 0; e.path = [e.f];
    return;
  }
  if (e.defence || relentless) {
    if (e.mode === 'attack') return;   // never cancel a committed wind-up
    // it engages when its room says so, or for a while after a hit: shot at from beyond its
    // post's reach, it goes for the shooter (to their floor, else where it can strike them from)
    // rather than stand there as a target; with no way to them it keeps to its post
    const engage = alive && (relentless || e.defence.engage || e.provoked > 0);
    const route = engage && ((target && findPath(e.f, target, FAR, nav(e))) || postPath(e, p, FAR));
    e.path = route || findPath(e.f, e.defence?.post ?? e.home, 40, nav(e));
    e.mode = route ? 'chase' : 'defend'; e.lost = 0;
    return;
  }
  if (e.horde) {
    if (e.mode === 'attack') return;
    const active = e.horde.group.active && e.horde.wakeIn <= 0 && alive && target;
    if (active) {
      // Approach from different neighbouring floors, then close for the actual bite.
      const flank = dist > 2.5 ? around(target, 1, cfg.height).filter(f => f !== target) : [];
      const goal = flank.length ? flank[e.hordeSlot % flank.length] : target;
      e.path = findPath(e.f, goal, 32, cfg.height);
      e.mode = 'chase'; e.lost = 0;
    } else if (e.mode === 'chase') goHome(e);
    return;
  }
  if (e.mode === 'attack' || e.mode === 'alert') return;
  if (e.mode === 'chase' || e.mode === 'hide') {
    if (!alive) goHome(e); else if (e.mode === 'chase') hunt(e); else lie(e);
    return;
  }
  // unaware: idle, walking about, going home or searching
  e.wary = alive && dist < cfg.aggro * WARY && sees(e, cfg.aggro * WARY);
  // either player can catch its eye
  const noticed = !state.transitioning && party().find(b => canHurt(b) && notices(e, b));
  if (noticed) { e.target = noticed; notice(e, (e.mode === 'search' ? 0.5 : 1) * REACT * (1 + Math.random()), true); return; }
  const heard = alive && calls.find(c => c.from !== e && Math.hypot(c.x - e.x, c.z - e.z) < CALL && Math.abs(c.y - e.y) < 2);
  if (heard) notice(e, REACT * (1.5 + Math.random()), false);
}
// a thrown attack (or a beam) needs a free line from its muzzle height to the player's chest
// (not one that comes down from above, `clear: false`: a giant's stomp)
const clearShot = (e, a, p = foe(e)) => shotOf(a).clear === false || clearLine(e.x, e.y + shotOf(a).muzzle[1], e.z, p.x, p.y + p.h * 0.55, p.z);
// the attacks e could start now (indices into profile.attacks; [0] for a single attack); `barred`
// (attack names) are not to be started now: a boss's summon while its minions are about
// (game/gusto.js); one struck behind it (`back`: the Moose's tail) only with the player there
function ready(e, d) {
  const p = foe(e), list = e.profile.attacks ?? [e.profile];
  if (p.ragdoll || p.held || p.flipping || e.under) return [];   // (flipping: turned with Flip's world, or in a black hole)
  return attacksInReach(e.profile, d, Math.abs(p.y - e.y))
    .filter(i => !e.barred?.has(list[i].name) && (!shotOf(list[i]) || clearShot(e, list[i])) && (!list[i].back || behind(e, p.x, p.z)));
}
// where a wind-up turns to: the player, or for a throw a little ahead of where they run (one
// struck behind it turns its back to them)
function aim(e, a) {
  const p = foe(e);
  if (a.back) return toPlayer(e) + Math.PI;
  if (!a.projectile) return toPlayer(e);
  const t = Math.max(0, a.hitAt - e.t) + Math.hypot(p.x - e.x, p.z - e.z) / a.projectile.speed;
  return Math.atan2(p.x + (p.vx || 0) * t * LEAD - e.x, p.z + (p.vz || 0) * t * LEAD - e.z);
}
// The leap of a pounce: once it takes off it commits to a distance (along its heading, up to
// lunge.stop short of the player) and covers it between lunge.from and lunge.to.
function leap(e, lunge, t0, dx, dz) {
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  if (t0 < lunge.from && e.t >= lunge.from) e.leap = lungeDistance(lunge, Math.max(0, fx * dx + fz * dz));
  const step = (lungeAt(lunge, e.t) - lungeAt(lunge, t0)) * e.leap;
  if (step > 0) stepEnemy(e, fx * step, fz * step);
}
// Pressing on (a Flimmer beating you): between press.from and press.to it steps after the player
// at press.speed, up to press.stop short of them.
function pressOn(e, press, dt, dx, dz, d) {
  if (e.t < press.from || e.t > press.to || d <= press.stop) return;
  const step = Math.min(press.speed * dt, d - press.stop);
  stepEnemy(e, dx / d * step, dz / d * step);
}
// A retreat: it rolls straight back from its heading by retreat.dist over the retreat's window.
function backOff(e, retreat, t0) {
  const step = retreatAt(retreat, e.t) - retreatAt(retreat, t0);
  if (step > 0) stepEnemy(e, -Math.sin(e.yaw) * step, -Math.cos(e.yaw) * step);
}
// A roll (Totnar's): from roll.from to roll.to it rolls along its heading at roll.speed (picking
// up speed at first), turning towards the player at no more than roll.steer rad/s. What stops it
// (a wall, an edge: it never rolls off) bounces it off, towards the player if they are that way;
// after roll.bounces bounces the next stop ends the roll (it sits dizzy for the rest of the attack;
// one that `crash`es, having run nobody over, goes on into that attack: Monteur's charge, dazed).
// Every player it touches (within roll.reach of its body) is run over, once a roll.
function rollOn(e, a, t0, dt) {
  const r = a.roll;
  if (e.t < r.from || t0 >= r.to) return;
  if (t0 < r.from || !e.rolling) e.rolling = { over: new Set(), bounces: 0 };
  const p = foe(e), want = Math.atan2(p.x - e.x, p.z - e.z), off = Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw));
  e.yaw += Math.max(-r.steer * dt, Math.min(r.steer * dt, off));
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), step = r.speed * Math.min(1, (e.t - r.from) / 0.2 + 0.2) * dt;
  const x0 = e.x, z0 = e.z;
  stepEnemy(e, fx * step, fz * step);
  const mx = e.x - x0, mz = e.z - z0;
  e.speed = Math.hypot(mx, mz) / dt;
  const bx = Math.abs(fx * step) > 0.01 && Math.abs(mx) < Math.abs(fx * step) * 0.5;
  const bz = Math.abs(fz * step) > 0.01 && Math.abs(mz) < Math.abs(fz * step) * 0.5;
  if (bx || bz) {
    if (e.rolling.bounces >= r.bounces) {
      e.speed = 0;
      if (r.crash && !e.rolling.over.size) whiff(e, { miss: r.crash });
      else e.t = Math.max(e.t, r.to);
      return;
    }
    e.rolling.bounces++;
    const back = Math.atan2(bx ? -fx : fx, bz ? -fz : fz);
    e.yaw = Math.cos(want - back) > 0.3 ? want : back;
  }
  for (const b of party()) {
    if (!canHurt(b) || !(b === player || b.here) || e.rolling.over.has(b) || b.ragdoll || b.held) continue;
    const dx = b.x - e.x, dz = b.z - e.z, d = Math.hypot(dx, dz);
    if (d > e.profile.radius + (b.r ?? 0.3) + r.reach || Math.abs(b.y - e.y) > 1.2) continue;
    e.rolling.over.add(b);
    hitBody(b, { ...blowOf(e.profile, a), by: attacker(e) }, e.x, e.z, d ? dx / d : fx, d ? dz / d : fz);
  }
}
// A ride (the Tornado's, core/enemies.js TORNADO): from ride.from to the hit frame a twister carries
// it through the air, up to ride.height over the way: `back` cells straight back from its heading
// (away from the player it faces), or `onto` the aim of its beam (where its shadow lies, following
// its target). It comes down at the hit frame on the floor it fits on that its way reaches (it is
// not carried off a ledge or through a wall: the way runs over the floor, as far as that goes).
// Up there it turns towards where it comes down. A ride cut short (its death) comes down where it is.
const RIDE_STEP = 0.2;
function landingOf(e, from, x, z) {
  // (a fluid dweller leaps out of its fluid onto the land: physics/dwell.js walkerOf)
  const s = { x: from.x, y: from.y, z: from.z, f: from.f, profile: e.profile, ashore: true }, dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz);
  for (let k = Math.ceil(d / RIDE_STEP), i = 0; i < k; i++) stepEnemy(s, dx / k, dz / k);
  return s;
}
const rideLift = (r, u) => r.height * 4 * u * (1 - u);
function ride(e, a, t0, dt) {
  const r = a.ride;
  if (e.t < r.from) return;
  if (t0 < r.from || !e.riding || e.riding.attacks !== e.attacks) {
    const back = r.back ? { x: e.x - Math.sin(e.yaw) * r.back, z: e.z - Math.cos(e.yaw) * r.back } : null;
    e.riding = { attacks: e.attacks, x: e.x, y: e.y, z: e.z, f: e.f, to: back };
  }
  const R = e.riding;
  if (r.onto && e.beam) R.to = { x: e.beam.ax, z: e.beam.az };   // (its shadow's last spot, once it has burst)
  const aim = R.to ?? { x: R.x, z: R.z };
  const end = landingOf(e, R, aim.x, aim.z), u = Math.min(1, (e.t - r.from) / (a.hitAt - r.from)), k = u * u * (3 - 2 * u);
  if (u >= 1) { Object.assign(e, { x: end.x, y: end.y, z: end.z, f: end.f }); e.riding = null; return; }
  e.x = R.x + (end.x - R.x) * k; e.z = R.z + (end.z - R.z) * k;
  e.y = R.y + (end.y - R.y) * k + rideLift(r, u);
  if (r.onto && Math.hypot(end.x - e.x, end.z - e.z) > 0.2) turn(e, Math.atan2(end.x - e.x, end.z - e.z), dt, 6);
}
// down from a ride cut short: onto the floor under it, if it fits there, else where it took off
function touchDown(e) {
  const R = e.riding;
  e.riding = null;
  const g = walkable(R.f, e.profile.height) && landingOf(e, R, e.x, e.z);
  if (g && Math.hypot(g.x - e.x, g.z - e.z) < 0.3) Object.assign(e, { x: g.x, y: g.y, z: g.z, f: g.f });
  else Object.assign(e, { x: R.x, y: R.y, z: R.z, f: R.f });
}
// Between blows, by style. Returns false where it should simply close in.
//   skirmish: backs off after a blow, circles at `circle` cells (sidestepping if it `strafe`s,
//     else walking round), then darts in when it can strike again
//   ranged: backs away inside keep[0], sidesteps while its throw recovers (one that `backpedal`s
//     backs away whenever it is too close)
//   brute: holds its ground
function manoeuvre(e, dt, d, strike) {
  const p = foe(e), cfg = e.profile, speed = cfg.chase;
  // a side it cannot go on to: try the other one; and now and then anyway
  const going = moved => {
    e.blocked = moved < 0.25 ? (e.blocked || 0) + dt : 0;
    if (e.blocked > 0.25 || (e.flip -= dt) <= 0) { e.side = -(e.side || 1); e.blocked = 0; e.flip = 1.5 + Math.random() * 2; }
  };
  if (cfg.style === 'skirmish') {
    if (e.cool <= 0 && state.enemyGrace <= 0 && !e.held) return false;
    const away = Math.atan2(e.x - p.x, e.z - p.z), r = cfg.circle;
    const backing = e.cool > cfg.cooldown * 0.6 && d < r;
    const a = away + (e.side || 1) * (backing ? 0.4 : 0.75), R = backing ? r + 0.4 : r;
    const tx = p.x + Math.sin(a) * R, tz = p.z + Math.cos(a) * R;
    if (cfg.strafe) {
      const ux = tx - e.x, uz = tz - e.z, l = Math.hypot(ux, uz) || 1;
      going(slide(e, ux / l, uz / l, speed * 0.75, dt));
    } else {
      const x0 = e.x, z0 = e.z;
      steer(e, tx, tz, speed * 0.75, dt);
      going(Math.hypot(e.x - x0, e.z - z0) / (speed * 0.75 * dt));
    }
    return true;
  }
  if (cfg.style === 'ranged') {
    const ux = (e.x - p.x) / (d || 1), uz = (e.z - p.z) / (d || 1), s = e.side || 1, keep = keepOf(e), close = closeIn(e);
    // one that `backpedal`s (Renew with his staff or bow) runs backwards, facing the player,
    // whenever they are too close, at that share of its speed, ready to shoot or not
    if (cfg.backpedal && d < keep[0] && slide(e, ux, uz, speed * cfg.backpedal, dt) > 0.3) return true;
    if (e.cool <= 0 && state.enemyGrace <= 0 && !e.held) return false;
    if (d < keep[0] && slide(e, ux, uz, speed * 0.9, dt) > 0.5) return true;
    if (!strike && d > keep[0]) return false;   // no shot from here: get one
    if (close && d > close) return false;   // (a fluid dweller: up to the shore, near enough to be hit)
    going(slide(e, uz * s, -ux * s, speed * 0.55, dt));
    return true;
  }
  return false;
}
function fight(e, dt) {
  const p = foe(e), cfg = e.profile, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (!e.path && !e.anchored) { e.speed = 0; turn(e, toPlayer(e), dt, 3); return; }
  const facing = Math.cos(Math.atan2(dx, dz) - e.yaw) > 0.7, list = cfg.attacks ?? [cfg];
  let can = ready(e, d);
  // only throws in reach while they recover: one that also bites keeps coming (a hop away is no bite)
  const closing = e.cool > 0 && can.every(i => shotOf(list[i])) && list.some(a => !shotOf(a) && !a.ride);
  const strike = can.length > 0 && !closing;
  e.held = false;
  if (strike && e.cool <= 0 && state.enemyGrace <= 0) {
    e.speed = 0;
    // a player behind it, in reach of a blow struck behind it (the Moose's tail): that, as it stands
    const rear = can.filter(i => list[i].back);
    if (rear.length) can = rear;
    else { turn(e, Math.atan2(dx, dz), dt); if (!facing) return; }
    if (tryHordeAttack(e)) {
      e.mode = 'attack'; e.t = 0; e.bit = false; e.attacks++; e.attack = pickAttack(cfg, Math.random(), can); e.leap = 0;
      return;
    }
    e.held = true;   // the horde has enough attackers
  }
  // in the fight (close, in sight, a short way): manoeuvre between blows
  // (one held where its fight puts it only turns; one on its own way keeps going between blows)
  if (e.anchored) { e.speed = 0; turn(e, Math.atan2(dx, dz), dt, 3); return; }
  if (e.route) { follow(e, cfg.chase * (e.hurry ?? 1), dt); return; }
  if (d < 4 && e.lost === 0 && e.path.length <= 4 && manoeuvre(e, dt, d, strike)) return;
  // (a fluid dweller coming up to the shore goes on there while its throw recovers)
  const close = closeIn(e);
  if (strike && !(close && d > close)) { e.speed = 0; turn(e, Math.atan2(dx, dz), dt); return; }
  // a charger runs the last few cells at a player it sees, when it can strike again
  const charging = cfg.charge && e.lost === 0 && e.cool <= 0 && d > 1.5 && d < 5;
  follow(e, cfg.chase * (charging ? cfg.charge : 1), dt, e.lost === 0 ? [p.x, p.z] : e.seen && [e.seen.x, e.seen.z]);
}
// learn: enemies.html#state-machine, paths.html#bfs (see learn/README.md)
function act(e, dt) {
  const p = foe(e), cfg = e.profile, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  if (e.mode === 'attack') {
    const a = attackOf(e), t0 = e.t;
    e.t += dt; e.speed = 0;
    if (e.t < a.trackUntil) turn(e, aim(e, a), dt, 6);
    else if (e.beam && !a.beam?.sky) turn(e, Math.atan2(e.beam.ax - e.x, e.beam.az - e.z), dt, 10);   // follows its laser's aim
    if (a.lunge) leap(e, a.lunge, t0, dx, dz);
    if (a.retreat) backOff(e, a.retreat, t0);
    if (a.roll) rollOn(e, a, t0, dt);
    if (a.ride) ride(e, a, t0, dt);
    if (!e.bit && e.t >= fireAt(a)) {
      e.bit = true;
      // (a gust blows and a breath pulls on from here by themselves: game/gusts.js; a roll runs
      // over whom it touches as it goes; a summon and a cast are its boss's, game/gusto.js,
      // game/totnar.js)
      if (a.beam) fireBeam(e, a); else if (a.projectile) launchProjectile(e, a);
      else if (a.summon) e.summon?.(a); else if (a.cast) e.cast?.(a);
      else if (!a.gust && !a.pull && !a.roll && !a.twister && !a.ride && !strikePlayer(e) && a.miss) whiff(e, a);
    }
    // a blow that strikes twice (Renew's twin morning star): again at its `twice`
    if (a.twice && e.bit && e.again !== e.attacks && e.t >= a.twice) { e.again = e.attacks; strikePlayer(e); }
    // a beating (a Flimmer's): blow after blow at each of its `more` times (each its own power and
    // shove, else the attack's), stepping after the player meanwhile (`press`)
    if (a.more && e.bit) {
      if (e.beat?.attacks !== e.attacks) e.beat = { attacks: e.attacks, n: 0 };
      while (e.beat.n < a.more.length && e.t >= a.more[e.beat.n].at) strikePlayer(e, a.more[e.beat.n++]);
    }
    if (a.press) pressOn(e, a.press, dt, dx, dz, d);
    if (e.t >= a.attackTime) { e.mode = 'chase'; e.cool = (a.recover ?? cfg.cooldown) * (0.8 + Math.random() * 0.4); e.side = side(); }
    return;
  }
  if (e.mode === 'alert') {   // noticed: turns to look, then gives chase
    e.speed = 0; turn(e, toPlayer(e), dt, 10);
    if ((e.t -= dt) <= 0) { e.mode = 'chase'; e.think = 0; e.side = side(); }
    return;
  }
  if (e.mode === 'chase') { fight(e, dt); return; }
  if (e.mode === 'hide') {   // runs for cover, then lies low there, facing where it saw the player
    e.t -= dt;
    if (!follow(e, cfg.chase, dt)) return;
    e.speed = 0;
    if (e.seen) turn(e, Math.atan2(e.seen.x - e.x, e.seen.z - e.z), dt, 3);
    return;
  }
  if (e.mode === 'defend') {
    if (follow(e, e.guardian ? cfg.homeSpeed : cfg.chase, dt)) turn(e, toPlayer(e), dt, 2);
    return;
  }
  if (e.mode === 'search') {   // walks to where it lost the player, then looks about nearby
    if ((e.t -= dt) <= 0) { goHome(e); return; }
    if (!follow(e, (cfg.wander + cfg.chase) / 2, dt)) return;
    e.speed = 0; turn(e, e.look, dt, 3);
    if ((e.pause -= dt) > 0) return;
    const spots = around(e.lair ?? e.f, 2, nav(e));
    e.path = findPath(e.f, spots[Math.floor(Math.random() * spots.length)], 6, nav(e));
    e.look = e.yaw + (Math.random() - 0.5) * 3; e.pause = 0.5 + Math.random() * 0.7;
    return;
  }
  if (e.mode === 'walk' || e.mode === 'home') {
    if (follow(e, e.mode === 'home' ? cfg.homeSpeed : cfg.wander, dt)) {
      e.mode = 'idle'; e.t = 2 + Math.random() * 4; e.speed = 0; e.look = e.yaw;
    }
    return;
  }
  // idle: looks about, and turns towards a player it half notices
  e.speed = 0;
  if (e.wary && !p.ragdoll) turn(e, toPlayer(e), dt, 1.5);
  else if (e.look !== undefined) turn(e, e.look, dt, 2);
  if ((e.t -= dt) > 0) return;
  if (Math.random() < 0.35) { e.look = e.yaw + (Math.random() - 0.5) * 2.5; e.t = 1 + Math.random() * 2; return; }
  const spots = around(e.home, 2, nav(e));
  e.path = findPath(e.f, spots[Math.floor(Math.random() * spots.length)], 6, nav(e));
  e.mode = e.path ? 'walk' : 'idle'; e.t = 2;
}
// A blow that caught nothing and has a `miss` (Gusto's grab): it goes on into that attack (his
// face-plant), from its start, as a new attack (it is shown as one: render, net/foes.js).
function whiff(e, a) {
  const i = (e.profile.attacks ?? []).findIndex(x => x.name === a.miss);
  if (i < 0) return;
  e.attack = i; e.t = 0; e.attacks++; e.bit = true;
}
// Burrowing (game/enemyai.js header): in the fight (chasing, attacking, taking cover) it stays up
// for burrow.up s, then, once it is not in the middle of a throw, dives (`under`) for
// burrow.under s and comes up where it has a shot (or after a while longer anyway); it throws a
// moment after coming up (one that `pop`s comes up when its time is up, wherever it is: a boss's
// summoned ones). Out of the fight it comes up and stays up. `dig`: s left of either.
const between = ([a, b]) => a + (b - a) * Math.random();
function burrow(e, dt) {
  const b = e.profile.burrow;
  if (e.mode !== 'chase' && e.mode !== 'attack' && e.mode !== 'hide') { e.under = 0; e.dig = undefined; return; }
  e.dig = (e.dig ?? between(b.up)) - dt;
  if (e.under) {
    const p = foe(e), d = Math.hypot(p.x - e.x, p.z - e.z);
    // (a fluid dweller coming up to the shore comes up there)
    const close = closeIn(e), shot = d > keepOf(e)[0] && d < (close ?? e.profile.reach * 0.9) && Math.abs(p.y - e.y) < 1.5;
    if (e.dig <= 0 && (shot || e.pop || e.dig <= -1.5)) { e.under = 0; e.pop = false; e.dig = between(b.up); e.cool = Math.max(e.cool, b.sink + 0.3); }
  } else if (e.dig <= 0 && e.mode !== 'attack' && (!e.profile.dwells || wetAt(e.profile, e.f) !== null)) { e.under = 1; e.dig = between(b.under); }
}
// A fluid dweller out of its fluid (game/enemyai.js header): it leapt onto the land, or its fluid
// went from under it. It cannot keep its shape there: it stands STAND s, still to be hit (and
// shrinking: render/enemies.js), then dissolves into a puddle (`under`: nothing touches it) that
// runs back over the land into the nearest of its fluid, as fast as it moves under the surface,
// and on into it until its body is clear of the bank (`inside`), and rises there (RISE s later).
// Meanwhile it walks as on land (`ashore`: physics/dwell.js walkerOf). With no way back into one it seeps away after DRY s (no
// reward: the land took it). true: it is ashore.
function ashore(e, dt) {
  const cfg = e.profile;
  if (wetAt(cfg, e.f) !== null && (e.mode !== 'ashore' || inside(e))) {
    if (e.mode === 'ashore') {
      Object.assign(e, { mode: e.seen ? 'chase' : 'idle', t: 1, think: 0, path: null, side: side(), ashore: false });
      if (e.under) Object.assign(e, { pop: true, dig: RISE });
    }
    e.dry = 0;
    return false;
  }
  if (e.mode === 'attack') return false;
  if (e.mode !== 'ashore') Object.assign(e, { mode: 'ashore', ashore: true, stand: e.under ? 0 : STAND, path: null, back: 0 });
  if (e.stand > 0) { e.stand -= dt; e.speed = 0; turn(e, toPlayer(e), dt, 3); return true; }
  e.under = 1;
  if ((e.back -= dt) <= 0 || !e.path) {
    e.back = 0.5;
    const w = walker(cfg, false), r = Math.min(cfg.radius, 0.42);
    // (to a floor of its fluid its whole body fits in, standing in its middle)
    const roomy = f => w.ok(f) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(f, f.x + 0.5 + dx, f.z + 0.5 + dz, w));
    e.path = nearest(e.f, roomy, FAR, walkerOf(e));
  }
  if (!e.path) {
    e.speed = 0;
    if ((e.dry = (e.dry ?? 0) + dt) >= DRY) Object.assign(e, { noReward: true, hp: 0, mode: 'dead', deadT: 0, path: null });
    return true;
  }
  e.dry = 0;
  if (follow(e, cfg.chase, dt)) e.back = 0;   // (at its end and still dry: look again)
  return true;
}
// is fluid dweller e all in its fluid, its body clear of the bank (as it moves: physics/enemynav.js)?
function inside(e) {
  const w = walker(e.profile, false), r = Math.min(e.profile.radius, 0.42);
  return [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(e.f, e.x + dx, e.z + dz, w));
}
// a blow's push, sliding along the floor graph and dying away quickly
function knockback(e, dt) {
  if (!e.kbx && !e.kbz) return;
  if (e.riding) { e.kbx = e.kbz = 0; return; }   // (up on its twister: blows do not shove it)
  stepEnemy(e, e.kbx * dt, e.kbz * dt);
  const k = Math.exp(-dt * 10);
  e.kbx *= k; e.kbz *= k;
  if (Math.hypot(e.kbx, e.kbz) < 0.05) e.kbx = e.kbz = 0;
}
// A chilled enemy (an enchanted weapon's, game/statuses.js) lives slower: all it does, moving,
// thinking and striking, takes longer by its chill.
// learn: enemies.html#decide-code #fair (see learn/README.md)
export function stepEnemies(list, realDt) {
  for (const e of list) {
    if (e.riding && (e.mode !== 'attack' || e.attacks !== e.riding.attacks)) touchDown(e);
    knockback(e, realDt);
    if (e.mode === 'dead') { e.deadT += realDt; continue; }
    const slow = enemySlow(e), dt = realDt * slow;
    // (a dormant one hurt before it was ever stepped wakes too)
    if (e.hp < (e.lastHp ?? e.hp) || e.dormant && e.hp < e.profile.hp) { e.dormant = false; provoke(e); }
    e.lastHp = e.hp;
    e.cool = Math.max(0, e.cool - dt); e.hurtT = Math.max(0, e.hurtT - realDt); e.poised = Math.max(0, (e.poised || 0) - realDt);
    e.provoked = Math.max(0, (e.provoked || 0) - dt);
    if (e.stun > 0) { e.stun -= realDt; e.speed = 0; continue; }
    // passive (/passive), or dormant (a test room's lineup, game/devspawn.js: till it is hit), or
    // waiting for its fight to start it (Foggery at the foot of his tower, game/foggery.js)
    if (state.devPassive || e.dormant || e.waiting) { e.speed = 0; e.path = null; if (e.mode !== 'idle') { e.mode = 'idle'; e.t = 1; } continue; }
    if (e.profile.dwells && e.f && ashore(e, dt)) { if (slow < 1) e.speed *= slow; continue; }
    if ((e.think -= dt) <= 0) { e.think = THINK * (0.8 + Math.random() * 0.4); decide(e); }
    if (e.profile.burrow) burrow(e, dt);
    act(e, dt);
    if (slow < 1) e.speed *= slow;   // (its speed over its own slower time: how fast it really goes)
  }
}
