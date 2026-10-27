// Mouse orders, Diablo style: click the floor to walk there, a way out of the cube (a portal, the
// town portal, a house's door: game/ways.js) to walk up to it and through, click an enemy to go and hit
// it (with a bow, crossbow or staff: until it is in range and in sight, then shoot), click an item on the floor (or its label) to go and pick it up, click a treasure chest to
// go and open it, click a villager to walk up and talk (their quests or wares: game/inventory.js talkTo), click a trial's
// part (a lever, a runestone, a tablet ...) to walk up and use it, as the action key does (game/trials.js usePart), the robot
// asleep in the merchant camp to walk up to it and wake it (game/robot.js wakeRobot). Holding the button
// keeps walking towards the cursor / keeps attacking. WASD cancels.
// Orders steer only; the speed (run, or walk with Ctrl) is up to update.js, but for jumps (always
// at a run, as they were found).
// Walks follow the hero's way (physics/playernav.js: floors, stairs, bridges, landings, and
// ladders and the jumps he can make; to the reachable node closest to the target), cutting
// corners where the way is clear, else head straight for the target.
import { combatStats, inReachBand } from '../core/combat.js';
import { lineOfFire } from './shots.js';
import { planWalk, retarget, steerWalk } from '../physics/playernav.js';
import { player, state } from './state.js';
import { pointer, pickFloor, hoveredEnemy } from './pointer.js';
import { queueAttack } from './sword.js';
import { groundAt } from '../physics/collide.js';
import { lootHere, takePickup, canReachPickup } from './loot.js';
import { canReachChest, openChest } from './chests.js';
import { TRADE_REACH } from '../core/shops.js';
import { talkTo } from './inventory.js';
import { absent } from '../core/enemies.js';
import { usePart, canReachPart, partUsable } from './trials.js';
import { sleepingRobot, canWakeRobot, wakeRobot } from './robot.js';

// kind: 'move' (to x, z) | 'attack' (enemy) | 'pickup' (a pickup) | 'chest' (a reward site) |
// 'trade' (a villager) | 'part' (a trial's part) | 'way' (a way out, game/ways.js) | 'robot' (the robot
// asleep: game/robot.js); walk: the way there (physics/playernav.js),
// kept from order to order while the hero gets there (a jump or climb under way finishes first)
export const order = { kind: null, x: 0, z: 0, floor: null, enemy: null, pickup: null, chest: null, villager: null, part: null, way: null, into: false, walk: null, repath: 0, stuck: 0, lx: 0, lz: 0, hold: 0 };

export function clearOrder() { order.kind = null; order.enemy = null; order.pickup = null; order.chest = null; order.villager = null; order.part = null; order.way = null; order.walk = null; }
// Teleports/travel invalidate cube-local targets; a held click must not recreate them.
export function clearMouseInput() { clearOrder(); pointer.down = false; pointer.mode = null; }

const floorOf = s => s && s.kind !== 'pillar' ? s : null;

// the way to order.x, z on `floor` (y: its height there, if known)
function plan(floor, y = null) {
  const nearest = order.kind === 'move';
  if (order.walk) retarget(order.walk, floor, order.x, order.z, y, nearest);
  else order.walk = planWalk(floor, order.x, order.z, y, nearest);
}
function begin(kind) {
  if (order.kind !== kind) Object.assign(order, { stuck: 0, lx: player.x, lz: player.z });
  order.kind = kind; order.into = false;
}

// hit: a pickFloor() result
export function orderMove(hit) {
  begin('move');
  Object.assign(order, { x: hit.x, z: hit.z, floor: floorOf(hit.s), enemy: null, pickup: null, repath: 1e9 });
  plan(order.floor);
}
// walk to (x, y, z) (a quest's thing to find, game/questworld.js: walking onto it picks it up)
export function orderWalk(x, y, z) {
  begin('move');
  Object.assign(order, { x, z, floor: floorOf(groundAt(x, z, y + 0.3, 0).s), enemy: null, pickup: null, repath: 1e9 });
  plan(order.floor, y);
}
export function orderAttack(e) {
  begin('attack');
  Object.assign(order, { enemy: e, pickup: null, repath: 0 });
}
// p: a pickup in this cube
export function orderPickup(p) {
  begin('pickup');
  Object.assign(order, { x: p.x, z: p.z, floor: floorOf(groundAt(p.x, p.z, p.y + 0.3, 0).s), enemy: null, pickup: p, repath: 1e9 });
  plan(order.floor, p.y);
  if (canReachPickup(p)) { takePickup(p); clearOrder(); }   // already there
}
// site: a reward site with a closed chest; walk to the spot in front of it
export function orderChest(site) {
  begin('chest');
  const at = site.approach ?? site.anchor;
  Object.assign(order, { x: at.x, z: at.z, floor: floorOf(groundAt(at.x, at.z, at.y + 0.3, 0).s), enemy: null, pickup: null, chest: site, repath: 1e9 });
  plan(order.floor, at.y);
  if (canReachChest(site)) { openChest(site); clearOrder(); }
}

// a villager (state.map.villagers) close enough to trade with
export const canTrade = v => Math.hypot(v.x - player.x, v.z - player.z) <= TRADE_REACH && Math.abs(v.y - player.y) <= 0.8;
// v: a villager with something to say (quests, wares); walk to the spot in front of them
export function orderTrade(v) {
  begin('trade');
  const x = v.x + Math.sin(v.yaw) * 0.85, z = v.z + Math.cos(v.yaw) * 0.85;
  Object.assign(order, { x, z, floor: floorOf(groundAt(x, z, v.y + 0.3, 0).s), enemy: null, pickup: null, chest: null, villager: v, repath: 1e9 });
  plan(order.floor, v.y);
  if (canTrade(v)) { clearOrder(); talkTo(v); }
}

// p: a part from game/trials.js usableParts; walk up to it and use it
export function orderPart(p) {
  begin('part');
  Object.assign(order, { x: p.x, z: p.z, floor: floorOf(groundAt(p.x, p.z, p.y + 0.3, 0).s), enemy: null, pickup: null, chest: null, villager: null, part: p, repath: 1e9 });
  plan(order.floor, p.y);
  if (canReachPart(p)) { clearOrder(); usePart(p); }
}

// w: a way out of the cube (game/ways.js); walk up to it, then on into it (a gate, a door) or
// stand on it while it charges (a well, a ring, the town portal: game/portals.js takes you)
export function orderWay(w) {
  begin('way');
  const at = w.walk;
  Object.assign(order, { x: at.x, z: at.z, floor: floorOf(groundAt(at.x, at.z, at.y + 0.3, 0).s), enemy: null, pickup: null, chest: null, villager: null, part: null, way: w, repath: 1e9 });
  plan(order.floor, at.y);
}
// r: the robot asleep (game/robot.js sleepingRobot); walk up to it and wake it
export function orderRobot(r) {
  begin('robot');
  Object.assign(order, { x: r.x, z: r.z, floor: floorOf(groundAt(r.x, r.z, r.y + 0.3, 0).s), enemy: null, pickup: null, chest: null, villager: null, part: null, way: null, repath: 1e9 });
  plan(order.floor, r.y);
  if (canWakeRobot(r)) { clearOrder(); wakeRobot(r); }
}
// (close enough to its spot to go on into a gate or door)
const INTO = 0.15;

// the held button: keep walking to the cursor, or pick the next enemy under it
export function holdPointer(dt) {
  if (!pointer.down || state.transitioning || state.inventoryOpen) return;
  if (pointer.mode === 'move' && (order.hold -= dt) <= 0) {
    order.hold = 0.12;
    const hit = pickFloor();
    if (hit) orderMove(hit);
  } else if (pointer.mode === 'attack' && order.kind !== 'attack' && hoveredEnemy()) orderAttack(hoveredEnemy());
}

// this frame's steering { dx, dz, jump, run, ladder (the one it may climb) }, or null without an order; in reach of the target
// it stands and swings instead
export function followOrder(dt) {
  if (!order.kind) return null;
  if (state.transitioning || player.ragdoll || player.hp <= 0) { clearOrder(); return null; }
  let tx = order.x, tz = order.z;
  if (order.kind === 'attack') {
    const e = order.enemy;
    if (!e || absent(e)) { clearOrder(); return null; }
    // a blade needs the enemy in reach at about our height; a shot, in range and in sight
    const stats = combatStats(player), reach = (stats?.range ?? 0.85) + e.profile.radius - 0.08;
    const near = Math.hypot(e.x - player.x, e.z - player.z) <= reach;
    if (!player.climb && near && (stats?.ranged ? inReachBand(player, e, stats) && lineOfFire(player, e, stats) : Math.abs(e.y - player.y) < 0.7)) {
      queueAttack(e);
      if (!pointer.down) clearOrder();   // a click is one swing; holding keeps swinging
      return { dx: 0, dz: 0 };
    }
    tx = order.x = e.x; tz = order.z = e.z;
    if ((order.repath -= dt) <= 0) { order.repath = 0.3; plan(floorOf(e.f), e.y); }
    if (order.walk) { order.walk.x = tx; order.walk.z = tz; }
  }
  if (order.kind === 'pickup') {
    const p = order.pickup;
    if (p.fly || !lootHere().includes(p)) { clearOrder(); return null; }   // someone (C, a death) took it
    if (canReachPickup(p)) { takePickup(p); clearOrder(); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'chest') {
    if (state.run.chests.has(order.chest.id)) { clearOrder(); return null; }
    if (canReachChest(order.chest)) { openChest(order.chest); clearOrder(); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'part') {
    const p = order.part;
    if (!partUsable(p)) { clearOrder(); return null; }   // solved meanwhile, or the trial is over
    if (canReachPart(p)) { clearOrder(); usePart(p); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'robot') {
    const r = sleepingRobot();
    if (!r) { clearOrder(); return null; }   // (woken meanwhile)
    if (canWakeRobot(r)) { clearOrder(); wakeRobot(r); return { dx: 0, dz: 0 }; }
  }
  if (order.kind === 'trade' && canTrade(order.villager)) { const v = order.villager; clearOrder(); talkTo(v); return { dx: 0, dz: 0 }; }
  // along the way (physics/playernav.js), the target at its end ...
  const w = order.walk ?? (order.walk = planWalk(order.floor, tx, tz, null, order.kind === 'move'));
  const s = steerWalk(w, dt);
  if (!s) { clearOrder(); return null; }   // on a ladder that is not on the way
  tx = w.x; tz = w.z;   // (moved to the end of the way, when it gets no closer)
  const left = Math.hypot(tx - player.x, tz - player.z), way = order.way;
  const settle = order.kind === 'move' || order.kind === 'chest' || order.kind === 'trade' || (order.kind === 'way' && !way.push);
  if (settle && w.done && left < 0.08) { clearOrder(); return { dx: 0, dz: 0 }; }   // (on a well, a ring, the town portal: it charges)
  // at a gate or a door: on into it, until it takes us (or, locked, the walking into it gives up)
  if (order.kind === 'way' && way.push && w.done && (order.into || left < INTO)) { order.into = true; s.dx = way.push[0]; s.dz = way.push[1]; s.end = false; }
  // give up when walking into something for a while (not while climbing or in the air)
  if (player.sword.active || player.stun > 0 || player.climb || !player.grounded || Math.hypot(player.x - order.lx, player.z - order.lz) > 0.2) {
    order.stuck = 0; order.lx = player.x; order.lz = player.z;
  } else if ((order.stuck += dt) > 0.6) { clearOrder(); return null; }
  const ease = settle && s.end ? Math.min(1, Math.max(0.25, left / 0.5)) : 1;   // settle onto the spot
  return { dx: s.dx * ease, dz: s.dz * ease, jump: s.jump, run: s.run, ladder: s.ladder };
}
