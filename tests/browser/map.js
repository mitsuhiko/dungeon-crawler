// Browser integration checks for the map (the inventory's Map tab, game/mappanel.js) and the rune
// stones (game/runestones.js, docs/map.md): M, the tab and a click on the minimap open it, the depths
// down its side switch it, a rune stone wakes when pressed and the map travels to it, and not out of
// a guardian's fight. Resets to a fresh seed-3 run before and after. With ?dev=1, from the devtools
// console:
//   await (await import('./tests/browser/map.js')).runMapChecks()
import { player, state } from '../../src/game/state.js';
import { newWorld, enterCube, spawnAt } from '../../src/game/flow.js';
import { clearInput } from '../../src/game/input.js';
import { updateInventory } from '../../src/game/inventory.js';
import { mapView, mapScreen, mapPick } from '../../src/game/mappanel.js';
import { travelBlock, stoneOf } from '../../src/game/runestones.js';
import { runestonesIn, runeDepth } from '../../src/core/runestones.js';
import { hoverables } from '../../src/game/lootlabels.js';
import { parse } from '../../src/world/coords.js';
import { N } from '../../src/core/constants.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const press = code => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};
const $ = id => document.getElementById(id);
const tabShown = () => state.inventoryOpen && $('inventory-tabs').querySelector('[data-tab="map"]').getAttribute('aria-selected') === 'true'
  && !$('map-body').classList.contains('away');
async function arrived(key) {
  for (let i = 0; i < 200 && (state.transitioning || state.cubeKey !== key); i++) await delay(20);
  check(!state.transitioning && state.cubeKey === key, `Travel to ${key} timed out`);
}
// a click (pointer down and up, the mouse) at map point (x, z) in cubes
function clickMap(x, z, pointerType = 'mouse') {
  const canvas = $('map-canvas'), r = canvas.getBoundingClientRect(), [sx, sy] = mapScreen(x, z);
  const k = r.width / canvas.clientWidth, at = { clientX: r.left + sx * k, clientY: r.top + sy * k, pointerId: 7, pointerType, button: 0, bubbles: true };
  canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }));
}

export async function runMapChecks() {
  check(state.dev, 'Run with ?dev=1');
  const results = [];
  await newWorld(3); clearInput();
  try {
    // M opens the map on the depth we are on, M again closes it; the tab and the minimap too
    press('KeyM');
    check(tabShown() && mapView().depth === 0, 'M opens the map, on the town\'s depth');
    press('KeyM');
    check(!state.inventoryOpen, 'M again closes it');
    press('KeyI');
    $('inventory-tabs').querySelector('[data-tab="map"]').click();
    check(tabShown(), 'The Map tab shows it');
    press('KeyM');
    check(!state.inventoryOpen, 'M on the map closes the panel');
    $('minimap').click();
    check(tabShown(), 'A click on the minimap opens the map');
    press('KeyN');
    check(state.inventoryOpen, 'N (the music now) leaves the map open');
    press('Escape');
    check(!state.inventoryOpen, 'Esc closes it');
    results.push('M / tab / minimap');

    // a rune stone of depth 1: walked up to, it is a thing to hover and press
    const plan = state.cubes.layout(1).runestones[0], c = await state.cubes.get(plan.key);
    enterCube(c, c.map.portals.find(p => p.kind === 'side')?.dir ?? 0);
    const stone = runestonesIn(state.map).find(s => s.id === plan.id);
    check(stone && state.world.runestones.some(r => r.id === stone.id), 'The stone stands in its cube');
    // (once the curtain is up: nothing is hovered behind it)
    for (let i = 0; i < 100 && !hoverables().some(h => h.key === `part:${stone.id}`); i++) await delay(20);
    check(hoverables().some(h => h.key === `part:${stone.id}`), 'It is hovered with the other things to click');
    spawnAt(stone.approach.x, stone.approach.y, stone.approach.z);
    await delay(50);
    check(!state.run.runes.has(stone.id), 'It sleeps at first');
    press('KeyF');
    check(state.run.runes.has(stone.id) && state.world.runestones.find(r => r.id === stone.id).want === 1, 'The action key wakes it, and it glows');
    press('KeyF');
    check(tabShown() && mapView().depth === 1 && mapView().chosen?.stone === stone.id, 'Pressed awake, it opens the map there, the stone chosen');
    press('Escape');
    results.push('wake a rune stone');

    // the depths down the map's side: the town and depth 1 now
    press('KeyM');
    const depths = [...$('map-depths').querySelectorAll('[data-depth]')].map(b => Number(b.dataset.depth));
    check(depths.includes(0) && depths.includes(1), `The depths reached are listed (${depths})`);
    $('map-depths').querySelector('[data-depth="0"]').click();
    updateInventory(); await delay(30);
    check(mapView().depth === 0, 'A depth on the side shows it');
    $('map-depths').querySelector('[data-depth="1"]').click();
    updateInventory(); await delay(30);
    check(mapView().depth === 1 && $('map-details-inner').querySelector('[data-travel]'), 'Depth 1 lists its woken stone to travel to');
    const [X, , Z] = parse(stone.key ?? plan.key), at = [X + stone.anchor.x / N, Z + stone.anchor.z / N];
    check(mapPick(...mapScreen(...at))?.stone === stone.id, 'The stone is where the map shows it');
    results.push('depths');

    // travelling: from town (a click on the woken stone), to where it is pressed from, facing it
    press('Escape');
    enterCube(await state.cubes.get(state.cubes.town.start), null);
    await delay(50);
    press('KeyM');
    $('map-depths').querySelector('[data-depth="1"]').click();
    updateInventory(); await delay(30);
    // (a touch: the first tap chooses it, the second goes)
    clickMap(...at, 'touch');
    check(state.inventoryOpen && mapView().chosen?.stone === stone.id && !state.transitioning, 'A tap chooses the stone');
    clickMap(...at, 'touch');
    check(!state.inventoryOpen && state.transitioning, 'A second tap travels');
    await arrived(plan.key);
    check(Math.hypot(player.x - stone.approach.x, player.z - stone.approach.z) < 0.3, 'Arrived beside the stone');
    results.push('travel (touch)');

    // not out of a guardian's fight: its arena while it stands
    const L = state.cubes.layout(1), arena = [...L.guardians].find(([, g]) => g.role === 'descent')[0];
    const ac = await state.cubes.get(arena);
    enterCube(ac, ac.map.portals.find(p => p.kind === 'side')?.dir ?? null);
    await delay(50);
    check(travelBlock(), 'No travelling while the guardian stands');
    press('KeyM');
    $('map-depths').querySelector('[data-depth="1"]').click();
    updateInventory(); await delay(30);
    clickMap(...at);
    check(state.inventoryOpen && !state.transitioning && state.cubeKey === arena, 'A click on the stone does not leave the fight');
    check($('map-details-inner').querySelector('[data-travel]')?.disabled, 'Its Travel button is off');
    press('Escape');
    results.push('not out of a fight');

    // with the mouse a click travels at once
    state.run.unlockedGates.add(arena);
    press('KeyM');
    $('map-depths').querySelector('[data-depth="1"]').click();
    updateInventory(); await delay(30);
    check(!travelBlock() && stoneOf(stone.id), 'Beaten, the way out is free');
    clickMap(...at);
    await arrived(plan.key);
    check(runeDepth(stone.id) === 1, 'A click travels');
    results.push('travel (mouse)');
  } finally {
    if (state.inventoryOpen) press('Escape');
    await newWorld(3); clearInput();
  }
  return results;
}
