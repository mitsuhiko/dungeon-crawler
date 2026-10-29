// Treasure chests at the cube's reward sites (map.rewardSites, docs/world.md): hover one to see
// it (game/lootlabels.js), click it to walk up and open it (game/orders.js), or stand next to it
// and press the action key (F or right Ctrl, game/action.js). Its loot (core/chests.js) lies
// in it, shrunk, while the lid opens (render/chests.js stowLoot) and spills out in front of it
// once the lid is open and stays open for the run (run.chests). What it spilled is
// `kept`: a death does not take it away, as the chest does not close again either. Playing
// together a chest opens for everyone: the loot is the opener's roll (game/loot.js), and the
// others see the lid open (shareChest).
import { vaultLocked } from './trials.js';
import { player, state, setStatus, worldLevel } from './state.js';
import { chestLoot } from '../core/chests.js';
import { favoredKind } from '../core/combat.js';
import { bareSlots } from '../core/inventory.js';
import { showChestOpen, stowLoot } from '../render/chests.js';
import { spill } from './loot.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { tr } from '../i18n/i18n.js';
import { narrate } from './narrator.js';

const OPEN_REACH = 1.2;   // cells from the chest's centre the player opens it from

// the closed chests in this cube
export const closedChests = () => (state.map?.rewardSites ?? []).filter(s => s.anchor && !state.run.chests.has(s.id));
export const canReachChest = site => Math.hypot(site.anchor.x - player.x, site.anchor.z - player.z) <= OPEN_REACH
  && Math.abs(site.anchor.y - player.y) <= 0.8;

// the closed chest the player stands next to (the nearest one), if any
export function chestInReach() {
  let best = null, bestD = Infinity;
  for (const s of closedChests()) {
    if (vaultLocked(s)) continue;   // a puzzle's vault, not solved yet (game/trials.js)
    const d = Math.hypot(s.anchor.x - player.x, s.anchor.z - player.z);
    if (d < bestD && canReachChest(s)) { best = s; bestD = d; }
  }
  return best;
}


export function openChest(site) {
  if (state.run.chests.has(site.id) || state.run.dropped.has(`c:${site.id}`) || !state.map) return false;
  state.run.chests.add(site.id);
  // the loot only comes out once the lid is all the way open
  const opening = showChestOpen(state.world, site.id);
  const { copper, items } = chestLoot(site, state.map.depth, state.map.seed, favoredKind(player), bareSlots(player.inventory), worldLevel());
  const a = site.anchor, front = site.approach ?? a;
  spill(`c:${site.id}`, front, copper, items, { kept: true }, { x: a.x, y: a.y + 0.6, z: a.z }, opening,
    list => stowLoot(state.world, site.id, list));
  sfx('chest', { at: a }); jingle('chest', { delay: 0.4 });   // the hinge and the lid, then the glint
  setStatus(tr('You opened a treasure chest'));
  narrate('chest');
  return true;
}

// Playing together, another player opened chest `id` (net/session.js): open here too (the
// lid opens if we are there; elsewhere it is open once we come)
export function shareChest(id) {
  if (state.run.chests.has(id)) return;
  state.run.chests.add(id);
  const site = state.map?.rewardSites?.find(s => s.id === id);
  if (!site) return;
  showChestOpen(state.world, id);
  if (site.anchor) { sfx('chest', { at: site.anchor }); jingle('chest', { delay: 0.4 }); }
}
