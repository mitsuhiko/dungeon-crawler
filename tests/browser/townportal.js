// Browser integration checks for the quick bar and the town portal scroll. Resets to a fresh
// seed-3 run before and after. From the devtools console:
//   await (await import('./tests/browser/townportal.js')).runTownPortalChecks()
import { player, state } from '../../src/game/state.js';
import { newWorld, enterCube, spawnAt } from '../../src/game/flow.js';
import { updatePlayer } from '../../src/game/update.js';
import { clearInput } from '../../src/game/input.js';
import { updateInventory } from '../../src/game/inventory.js';
import { updateQuickbar } from '../../src/game/quickbar.js';
import { dropFromBag } from '../../src/game/loot.js';
import { TOWN_PORTAL } from '../../src/core/items.js';
import { barEntry } from '../../src/core/inventory.js';
import { CAST_TIME } from '../../src/core/townportal.js';
import { paused } from './combat.js';
import { N } from '../../src/core/constants.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = code => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};
const $ = id => document.getElementById(id);
const DUNGEON = '0,0,-2';
const townFx = () => state.world.portalFx.filter(f => f.obj.userData.portal.kind === 'town');
const steps = (n, dt = 0.1) => { for (let i = 0; i < n && !state.transitioning; i++) updatePlayer(dt); };
async function arrived(key) {
  for (let i = 0; i < 150 && (state.transitioning || state.cubeKey !== key); i++) await delay(20);
  check(!state.transitioning && state.cubeKey === key, `Portal travel to ${key} timed out`);
}
// stand in the pad until it takes you
function stepIn(pad) {
  Object.assign(player, { x: pad.x, y: pad.y, z: pad.z, vx: 0, vy: 0, vz: 0, grounded: true, stun: 0 });
  steps(20);
  check(state.transitioning, 'Standing in the portal must take you through');
}

export async function runTownPortalChecks() {
  const results = [];
  await newWorld(3); clearInput();
  try {
    await paused(async () => {
      const inv = player.inventory, scroll = inv.slots.find(s => s?.itemId === TOWN_PORTAL.id);
      updateQuickbar();
      const slots = [...document.querySelectorAll('#quickbar .qb-slot')];
      check(slots.length === 6 && barEntry(inv, 0)?.slot === scroll && !slots[0].querySelector('img').hidden
        && barEntry(inv, 1)?.itemId === 'item_potion_health' && !slots[1].querySelector('img').hidden
        && slots.slice(2, 5).every(b => b.querySelector('img').hidden) && !slots[5].querySelector('img').hidden,
        'A run starts with the scroll on quick bar slot 1, potions on 2 and the room portal scroll on 6');
      check(!dropFromBag(scroll.instanceId) && inv.slots.includes(scroll), 'The scroll cannot be dropped');
      results.push('quick bar / scroll on 1 / bound');

      // the inventory: 1-6 assign the selected item, Drop is off for the scroll, opening cancels a cast
      press('KeyI');
      const sword = inv.slots.find(s => s?.instanceId === inv.equipped);
      press('Digit3');
      check(barEntry(inv, 2)?.slot === sword && !state.cast, 'With the bag open, 3 puts the selected weapon on slot 3');
      press('Digit3');
      check(!barEntry(inv, 2), 'The same key again takes it off');
      document.querySelector(`[data-slot="${inv.slots.indexOf(scroll)}"]`).click();
      updateInventory();
      check($('inventory-drop').disabled && !$('inventory-use').hidden, 'The scroll has Use and no Drop');
      press('KeyI');
      results.push('assign / unassign / Use button');

      press('Digit1');
      check(!state.cast, 'No portal from town');

      enterCube(await state.cubes.get(DUNGEON), 2);
      const start = { x: player.x, y: player.y, z: player.z };
      // no room anywhere around (a well on every cell): the scroll is not read at all
      const portals = state.map.portals;
      state.map.portals = [...portals, { kind: 'down', cells: Array.from({ length: N * N }, (_, i) => i) }];
      press('Digit1');
      state.map.portals = portals;
      check(!state.cast && state.statusMsg === 'No room for a portal here', 'Without room no cast starts');
      press('Digit1');
      check(state.cast?.duration === CAST_TIME, 'Using the scroll starts a 5 s cast');
      updateQuickbar();
      check(slots[0].classList.contains('casting'), 'The bar shows the cast');
      player.autoDir = [1, 0]; updatePlayer(1 / 60); player.autoDir = null;
      check(!state.cast, 'Moving interrupts the cast');
      spawnAt(start.x, start.y, start.z);
      press('Digit1'); steps(20);
      player.lastDamageAt = state.time + 0.01; steps(1);
      check(!state.cast, 'Being hurt interrupts the cast');
      player.lastDamageAt = -Infinity;   // the frame loop (and state.time) is paused here
      press('Digit1'); steps(5); press('Digit1');
      check(!state.cast && !state.run.townPortal, 'Using it again cancels the cast');
      press('Digit1'); press('KeyI'); press('KeyI');
      check(!state.cast, 'Opening the inventory cancels the cast');
      press('Digit1'); steps(CAST_TIME * 10 - 2);
      check(state.cast && !state.run.townPortal, 'The portal waits for the whole cast');
      steps(3);
      const tp = state.run.townPortal;
      check(tp?.key === DUNGEON && townFx().length === 1 && !state.cast, 'A finished cast opens a portal in this cube: ' + state.statusMsg + ' ' + JSON.stringify(state.cast));
      check(Math.hypot(tp.pad.x - player.x, tp.pad.z - player.z) > 1 && Math.hypot(tp.back.x - player.x, tp.back.z - player.z) < 1e-6,
        'The portal opens in front of you and remembers where you stand');
      results.push('no room: no cast');
      results.push('5 s cast / interrupts (move, hurt, key, inventory) / portal opens');

      stepIn(tp.pad);
      await arrived(state.cubes.town.portal);
      const end = state.map.town.portal;
      check(state.run.townPortal === tp && townFx().length === 1 && townFx()[0].obj.userData.portal.x === end.x,
        'In town the other end stands on its spot, the portal stays open');
      check(Math.hypot(player.x - end.x, player.z - end.z) > 0.8, 'You arrive beside it, not in it');
      steps(15);
      check(state.cubeKey === state.cubes.town.portal && !state.transitioning, 'Arriving does not send you straight back');
      results.push('to town / arrival beside the town end');

      stepIn(end);
      await arrived(DUNGEON);
      check(Math.hypot(player.x - start.x, player.z - start.z) < 0.05 && Math.abs(player.y - start.y) < 0.05,
        'Back through, you stand exactly where you cast it');
      check(!state.run.townPortal && !townFx().length, 'Both ends close behind you');
      results.push('back to the exact spot / both ends close');

      press('Digit1'); steps(CAST_TIME * 10 + 1);
      const first = state.run.townPortal;
      check(first && townFx().length === 1, 'A second portal opens');
      spawnAt(start.x + 0.01, start.y, start.z);
      player.yaw += Math.PI;
      press('Digit1'); steps(CAST_TIME * 10 + 1);
      check(state.run.townPortal !== first && townFx().length === 1, 'Casting again moves the portal: ' + state.statusMsg + ' ' + JSON.stringify({ cast: state.cast, p: [player.x, player.z, player.yaw], first: first.pad, now: state.run.townPortal?.pad }));
      await newWorld(3);
      check(!state.run.townPortal && !state.cast && barEntry(player.inventory, 0)?.itemId === TOWN_PORTAL.id, 'A new world closes the portal');
      results.push('recast replaces / new world resets');
    });
  } finally {
    player.autoDir = null;
    await newWorld(3); clearInput();
  }
  return results;
}
