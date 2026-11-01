// Group intentions only: species AI retains paths, committed attacks and damage.
import { HORDE } from '../core/hordes.js';
import { ROOM_SCALE } from '../core/constants.js';
import { walkable, findPath, clearLine } from '../physics/enemynav.js';

export function createHordeGroups(map, list) {
  if (!map.horde) return [];
  const group = { ...map.horde, members: list.filter(e => e.hordeId === map.horde.id),
    active: false, lost: 0, think: 0, startsIn: 0 };
  for (const e of group.members) e.horde = { group, wakeIn: 0, lastHp: e.hp };
  return [group];
}

function activate(group, active) {
  if (group.active === active) return;
  group.active = active; group.lost = 0;
  for (const e of group.members) {
    e.horde.wakeIn = active ? e.hordeReaction : 0;
    e.think = 0;
  }
}

// Called once per game tick, not once per species. Hits alarm even when they kill the scout.
// Perception/path reachability is throttled; reaction and attack-start clocks are not.
export function coordinateHordes(groups, player, dt) {
  let awakened = 0;
  for (const group of groups) {
    group.startsIn = Math.max(0, group.startsIn - dt);
    let provoked = false;
    for (const e of group.members) {
      provoked ||= e.hp < e.horde.lastHp;
      e.horde.lastHp = e.hp;
      e.horde.wakeIn = Math.max(0, e.horde.wakeIn - dt);
    }
    const alive = player.hp > 0 && !player.ragdoll;
    if (!alive) { activate(group, false); continue; }
    if ((group.think -= dt) > 0 && !provoked) continue;
    group.think = .2;
    const members = group.members.filter(e => e.mode !== 'dead');
    if (!members.length) { activate(group, false); continue; }
    const cfg = members[0].profile, target = player.grounded && !player.swimming && walkable(player.support, cfg.height) ? player.support : null;
    const within = Math.hypot(player.x - group.anchor.x, player.z - group.anchor.z) <= group.radius;
    const reachable = within && target && findPath(group.floor, target, Math.round(32 * ROOM_SCALE), cfg.height);
    const spotted = reachable && members.some(e => Math.hypot(player.x - e.x, player.z - e.z) < cfg.aggro
      && Math.abs(player.y - e.y) <= 1 && clearLine(e.x, e.y + .4, e.z, player.x, player.y + .6, player.z));
    if (!group.active && reachable && (provoked || spotted)) { activate(group, true); awakened++; }
    if (group.active) {
      group.lost = reachable ? 0 : group.lost + .2;
      if (group.lost >= HORDE.giveUp) activate(group, false);
    }
  }
  return awakened;
}

// Reserve immediately so several species/ticks cannot all start in the same frame.
// Never cancel attacks already committed; the limit is on simultaneous wind-ups/recovery.
export function tryHordeAttack(e) {
  if (!e.horde) return true;
  const group = e.horde.group;
  if (!group.active || e.horde.wakeIn > 0 || group.startsIn > 0
    || group.members.filter(e => e.mode === 'attack').length >= HORDE.attackers) return false;
  group.startsIn = HORDE.startGap;
  return true;
}
