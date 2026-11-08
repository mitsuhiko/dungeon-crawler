import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coinDrops, inCollectReach, inMagnetReach, inFloorReach, steppedOn, stackable, walkTakes, labelled, COLLECT_RADIUS, MAGNET_RADIUS, FLOOR_RADIUS, COLLECT_HEIGHT } from '../src/core/loot.js';
import { ITEMS, WEAPONS } from '../src/core/items.js';
import { createInventory, addItem, copperTotal, fits } from '../src/core/inventory.js';

test('coin drops hold exactly the amount, in a few piles per coin kind', () => {
  assert.deepEqual(coinDrops(0), []);
  for (let copper = 1; copper < 3000; copper += 7) {
    const drops = coinDrops(copper), inv = createInventory();
    assert.equal(drops.reduce((n, d) => n + ITEMS[d.itemId].value * d.count, 0), copper);
    for (const d of drops) { assert.ok(d.count >= 1); assert.ok(addItem(inv, d.itemId, d.count)); }
    assert.equal(copperTotal(inv), copper);
    for (const id of new Set(drops.map(d => d.itemId))) assert.ok(drops.filter(d => d.itemId === id).length <= 4);
  }
  assert.equal(coinDrops(6).length, 4);   // a spider's handful scatters
});

test('the action key reaches stackable pickups within eight cells, walking over takes all but weapons', () => {
  assert.equal(COLLECT_RADIUS, 8);
  const coin = { itemId: 'item_coin_copper', x: 5, y: 1, z: 5 };
  assert.ok(stackable(coin.itemId) && stackable('item_crystal_ruby') && !stackable(WEAPONS[1].id));
  assert.ok(inCollectReach(coin, 5 + COLLECT_RADIUS, 1, 5));
  assert.ok(!inCollectReach(coin, 5 + COLLECT_RADIUS + 0.01, 1, 5));
  assert.ok(!inCollectReach(coin, 5, 3, 5), 'not from a different level');
  assert.ok(!inCollectReach({ ...coin, itemId: WEAPONS[1].id }, 5, 1, 5), 'only stackables');
  assert.ok(steppedOn({ ...coin, itemId: WEAPONS[1].id }, 5.3, 1, 5));
  assert.ok(!steppedOn(coin, 5.6, 1, 5));
  assert.ok(walkTakes(coin) && walkTakes({ itemId: 'item_crystal_ruby' }) && !walkTakes({ itemId: WEAPONS[1].id }));
});

test('labels and the inventory floor column keep their four-cell reach, excluding coins', () => {
  assert.equal(FLOOR_RADIUS, 4);
  const sword = { itemId: WEAPONS[2].id, x: 5, y: 1, z: 5 }, ruby = { ...sword, itemId: 'item_crystal_ruby' };
  assert.ok(labelled(sword) && labelled(ruby) && !labelled({ itemId: 'item_coin_gold' }));
  assert.ok(inFloorReach(sword, 5 + FLOOR_RADIUS, 1, 5) && inFloorReach(ruby, 5, 1 + COLLECT_HEIGHT, 5));
  assert.ok(!inFloorReach(sword, 5 + FLOOR_RADIUS + 0.01, 1, 5) && !inFloorReach(sword, 5, 1 + COLLECT_HEIGHT + 0.01, 5));
  assert.ok(!inFloorReach({ ...sword, itemId: 'item_coin_gold' }, 5, 1, 5));
});

test('coins pull themselves in from three cells, other pickups do not', () => {
  assert.equal(MAGNET_RADIUS, 3);
  const coin = { itemId: 'item_coin_copper', x: 5, y: 1, z: 5 };
  assert.ok(inMagnetReach(coin, 5 + MAGNET_RADIUS, 1, 5));
  assert.ok(!inMagnetReach(coin, 5 + MAGNET_RADIUS + 0.01, 1, 5));
  assert.ok(!inMagnetReach(coin, 5, 3, 5), 'not from a different level');
  assert.ok(inMagnetReach(coin, 5, 1 + COLLECT_HEIGHT, 5), 'vertical boundary');
  assert.ok(!inMagnetReach(coin, 5, 1 + COLLECT_HEIGHT + 0.01, 5));
  assert.ok(inMagnetReach(coin, 6.8, 1, 7.4), 'radial boundary');
  assert.ok(!inMagnetReach(coin, 7.2, 1, 7.2), 'not a square');
  assert.ok(inCollectReach(coin, 10, 1, 5) && !inMagnetReach(coin, 10, 1, 5), 'F reaches beyond the magnet');
  assert.ok(!inMagnetReach({ ...coin, itemId: 'item_crystal_ruby' }, 5, 1, 5), 'only coins');
});

test('a pickup is only reached for when it fits the bag (coins always do)', () => {
  const inv = createInventory(), sword = { itemId: 'weapon_sword_short', count: 1, gen: { rarity: 'vanilla', ilvl: 1, affixes: [], name: 'Sword' } };
  const potion = { itemId: 'item_potion_health', count: 3 };
  assert.ok(fits(inv, sword) && fits(inv, potion));
  for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { instanceId: `x${i}`, itemId: 'weapon_sword_short', count: 1 };
  assert.ok(!fits(inv, sword));                                        // no free slot
  assert.ok(!fits(inv, potion));                                       // no stack of it to add to either
  assert.ok(fits(inv, { itemId: 'item_coin_gold', count: 5 }));      // coins go in the purse
  inv.slots[0] = { instanceId: 'p', itemId: 'item_potion_health', count: 97 };
  assert.ok(fits(inv, { itemId: 'item_potion_health', count: 2 }) && !fits(inv, potion));   // room for two more in the stack
  assert.ok(!fits(inv, { itemId: 'nothing' }));
});
