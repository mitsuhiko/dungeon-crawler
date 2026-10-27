// The action key, F or right Ctrl (game/input.js), and the use button on touch screens
// (game/touch.js): does the first thing that works where the player stands:
//   1. open the closed treasure chest beside them (game/chests.js)
//   2. talk to the villager beside them: their quests, or their shop (game/inventory.js talkTo)
//   3. use the trial's part beside them: a button, a lever ... (game/trials.js)
//   4. wake the robot asleep beside them (game/robot.js)
//   5. collect the coins and items around them (game/loot.js; four cells across)
// pendingAction says which (for the use button's picture), useAction does it and says whether it
// did anything. With nothing to do the key does nothing.
import { player, state } from './state.js';
import { chestInReach, openChest } from './chests.js';
import { canTrade } from './orders.js';
import { talkTo } from './inventory.js';
import { collectable, requestCollect } from './loot.js';
import { shopOf } from '../core/shops.js';
import { GIVERS, giverOf } from '../core/quests.js';
import { peopleHere } from './npcs.js';
import { ITEMS } from '../core/items.js';
import { partInReach, usePart } from './trials.js';
import { sleepingRobot, canWakeRobot, wakeRobot } from './robot.js';
import { tr, noun } from '../i18n/i18n.js';

// a villager with something to say: quests to give, or wares
export const talkative = v => !!(shopOf(v) || giverOf(v) || v?.lost || v?.helper);
// who they are, as words: 'Ada the hermit', the Innkeeper, the Smith, or by their name
const titleOf = v => v.title ?? (GIVERS[v.name] || shopOf(v) ? noun(GIVERS[v.name]?.title ?? shopOf(v).title, { caps: true }) : noun(v.name, { proper: true }));
// the villager the player stands next to who has something to say (the nearest one), if any
function villagerInReach() {
  let best = null, bestD = Infinity;
  for (const v of peopleHere()) {
    if (!talkative(v) || !canTrade(v)) continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bestD) { best = v; bestD = d; }
  }
  return best;
}

// of the pickups a collect takes, the one to show: items before coins, the dearest, the nearest
function showcase(list) {
  const coin = p => ITEMS[p.itemId]?.category === 'currency', price = p => ITEMS[p.itemId]?.price ?? 0;
  const d = p => Math.hypot(p.x - player.x, p.z - player.z);
  return list.reduce((a, b) => (coin(a) !== coin(b) ? (coin(a) ? b : a)
    : price(a) !== price(b) ? (price(a) > price(b) ? a : b) : d(a) <= d(b) ? a : b));
}

// what the action key would do here: null, or { kind: 'chest' | 'talk' | 'part' | 'robot' | 'collect', target,
// label, picture (what it is about, as an item id for render/itemviews.js; not for talk),
// count (collect: how many pickups) }
export function pendingAction() {
  if (state.mode !== 'play' || !state.map || state.transitioning || state.inventoryOpen
    || player.down || player.ragdoll || player.hp <= 0) return null;
  const chest = chestInReach();
  if (chest) return { kind: 'chest', target: chest, label: tr('Open the chest'), picture: 'treasure_chest' };
  const villager = villagerInReach();
  if (villager) return { kind: 'talk', target: villager, label: tr('Talk to {who:the}', { who: titleOf(villager) }) };
  const part = partInReach();
  if (part) return { kind: 'part', target: part, label: part.label };   // (said in the language of the moment: game/trials.js partLabel)
  const robot = sleepingRobot();
  if (canWakeRobot(robot)) return { kind: 'robot', target: robot, label: tr('Wake the robot') };
  const loot = collectable();
  if (loot.length) {
    const best = showcase(loot);
    return { kind: 'collect', target: best, label: tr('Collect'), picture: ITEMS[best.itemId] ? best.itemId : null, count: loot.length };
  }
  return null;
}

export function useAction() {
  const a = pendingAction();
  if (a?.kind === 'chest') return openChest(a.target);
  if (a?.kind === 'talk') { talkTo(a.target); return true; }
  if (a?.kind === 'part') return usePart(a.target);
  if (a?.kind === 'robot') return wakeRobot(a.target);
  if (a?.kind === 'collect') { requestCollect(); return true; }
  return false;
}
