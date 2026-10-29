import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assetsRoot } from './paths.js';
import { ITEMS, WEAPONS, OLD_SWORD, COINS, TOWN_PORTAL, ROOM_PORTAL, HEALTH_POTION, isMelee } from '../src/core/items.js';
import { createInventory, addItem, addInstance, removeItem, takeItem, equipItem, equippedItem, addCopper, spendCopper, copperTotal, coinCounts,
  assignBar, autoBar, barEntry, barIndexOf, BAR_SIZE, wornItem } from '../src/core/inventory.js';
import { fixedWeapon } from '../src/core/gear/generate.js';
import { createPlayerStats, carryTools, createRun, xpForLevel, xpToNext, levelFromXP, xpProgress, xpScale, awardXP, awardKill, takeDamage, regenerate,
  levelDamage, maxHealth, fullHealth, START_POTIONS, DEV_GOLD } from '../src/core/progression.js';
import { drinkPotion, tickEffects } from '../src/core/potions.js';
import { SPIDER, STUNDER, enemyProfile, enemyRoll, makeEnemy, coinRange, depthLevel, guardianLevel, worldLevelFor, cleanWorldLevel, MAX_WORLD_LEVEL } from '../src/core/enemies.js';
import { chestLoot, CHESTS } from '../src/core/chests.js';
import { smithStock } from '../src/core/shops.js';
import { questRewards } from '../src/core/quests.js';
import { mulberry32 } from '../src/core/util.js';
import { itemStats } from '../src/core/gear/stats.js';
import { swordState, combatStats, startSwing, advanceSwing, swordHit, cancelSwing, damageEnemy, canChangeWeapon, shotDue, KINDS } from '../src/core/combat.js';

const assetPath = url => resolve(assetsRoot, url);
const hero = () => ({ ...createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() });
function equip(p, id) {
  addItem(p.inventory, id);
  equipItem(p.inventory, p.inventory.slots.find(s => s?.itemId === id).instanceId);
}

test("a new player has the glassmaker's old sword equipped, the scrolls and a few potions on the quick bar and empty currency slots", () => {
  const p = createPlayerStats();
  assert.deepEqual([p.xp, p.level, p.hp, p.maxHp], [0, 1, 100, 100]);
  assert.equal(p.inventory.slots.length, 24);
  assert.deepEqual(p.inventory.slots.filter(Boolean).map(s => s.itemId), [OLD_SWORD.id, TOWN_PORTAL.id, ROOM_PORTAL.id, HEALTH_POTION.id]);
  assert.equal(equippedItem(p.inventory).itemId, OLD_SWORD.id);
  assert.equal(p.inventory.bar.length, BAR_SIZE);
  assert.equal(barEntry(p.inventory, 0).slot.itemId, TOWN_PORTAL.id);
  assert.deepEqual(barEntry(p.inventory, 1), { itemId: HEALTH_POTION.id, slot: p.inventory.slots[3], count: START_POTIONS });
  assert.ok(p.inventory.bar.slice(2, 5).every(r => r === null));
  assert.equal(barEntry(p.inventory, 5).slot.itemId, ROOM_PORTAL.id, 'the room portal scroll on the last slot');
  assert.equal(createRun().townPortal, null);
  assert.deepEqual(p.inventory.currency.map(s => s.itemId), COINS.map(c => c.id));
  assert.deepEqual(p.inventory.currency.map(s => s.count), [0, 0, 0]);
  // with the dev tools: gold to spend
  assert.equal(copperTotal(createPlayerStats(true).inventory), DEV_GOLD * 1000);
  // a new hero in the game comes empty-handed: the sword is found in the merchant camp (core/intro.js)
  const bare = createPlayerStats(false, { armed: false });
  assert.equal(equippedItem(bare.inventory), null);
  assert.deepEqual(bare.inventory.slots.filter(Boolean).map(s => s.itemId), [TOWN_PORTAL.id, ROOM_PORTAL.id, HEALTH_POTION.id]);
});
test('developer heroes start with OMG level-99 armor, staff and triple flail, normal heroes do not', () => {
  for (const armed of [true, false]) {
    const dev = createPlayerStats(true, { armed }), inv = dev.inventory, staff = equippedItem(inv);
    assert.equal(dev.god, true);
    assert.equal(staff.itemId, 'weapon_staff_arcane');
    const flail = inv.slots.find(s => s?.itemId === 'weapon_flail_triple');
    const armor = ['head', 'body', 'shield', 'feet'].map(slot => wornItem(inv, slot));
    assert.deepEqual(armor.map(s => s.itemId), ['armor_head_great', 'armor_body_plate', 'armor_shield_tower', 'armor_feet_greaves']);
    for (const item of [staff, flail, ...armor]) {
      assert.equal(item.gen.rarity, 'omg'); assert.equal(item.gen.ilvl, 99);
      assert.ok(item.gen.affixes.length > 0, 'ordinary generated gear, not bare item definitions');
      assert.equal(inv.slots.filter(s => s?.itemId === item.itemId).length, 1);
    }
    assert.equal(ITEMS[flail.itemId].weapon.balls, 3);
    assert.equal(barEntry(inv, 2).slot, staff); assert.equal(barEntry(inv, 3).slot, flail);
    assert.ok(equipItem(inv, flail.instanceId)); assert.equal(equippedItem(inv), flail);
    assert.ok(equipItem(inv, staff.instanceId));
    assert.equal(dev.level, 1, 'item level is not hero level');
    assert.equal(dev.maxHp, fullHealth(1, inv)); assert.equal(dev.hp, dev.maxHp);
    const hp = dev.hp; takeDamage(dev, 1e9, 10); assert.equal(dev.hp, hp);
    dev.god = false; takeDamage(dev, 1, 11); assert.equal(dev.hp, hp - 1);
  }
  const normal = createPlayerStats();
  assert.equal(normal.god, false);
  assert.equal(equippedItem(normal.inventory).itemId, OLD_SWORD.id);
  assert.ok(Object.values(normal.inventory.worn).every(id => id === null));
  assert.ok(!normal.inventory.slots.some(s => s?.gen?.rarity === 'omg'));
});

test('the portal scrolls are bound: they never leave the bag and never stack', () => {
  for (const [def, name] of [[TOWN_PORTAL, 'item_town_portal'], [ROOM_PORTAL, 'item_room_portal']]) {
    const inv = createPlayerStats().inventory, scroll = inv.slots.find(s => s?.itemId === def.id);
    assert.ok(def.bound && def.use && !def.model && def.picture === `assets/items/${name}.glb` && existsSync(assetPath(def.picture)));
    const before = JSON.stringify(inv);
    assert.equal(takeItem(inv, scroll.instanceId), null);
    assert.equal(JSON.stringify(inv), before);
    assert.ok(takeItem(inv, inv.equipped));   // ordinary items still can
    assert.equal(def.stackLimit, 1);
  }
});
test('a hero from before the room portal scroll gets one, on the last bar slot if it is free', () => {
  const old = () => {
    const inv = createPlayerStats().inventory, i = inv.slots.findIndex(s => s?.itemId === ROOM_PORTAL.id);
    inv.bar[5] = null; inv.slots[i] = null;
    return inv;
  };
  const inv = carryTools(old());
  assert.equal(inv.slots.filter(s => s?.itemId === ROOM_PORTAL.id).length, 1);
  assert.equal(barEntry(inv, 5).slot.itemId, ROOM_PORTAL.id);
  assert.equal(carryTools(inv).slots.filter(s => s?.itemId === ROOM_PORTAL.id).length, 1, 'only once');
  const busy = old(), potion = busy.slots.find(s => s?.itemId === HEALTH_POTION.id);
  assignBar(busy, 5, potion.instanceId);
  carryTools(busy);
  assert.ok(busy.slots.some(s => s?.itemId === ROOM_PORTAL.id));
  assert.deepEqual(busy.bar[5], { itemId: HEALTH_POTION.id }, 'a slot in use stays as it is');
});
test('the quick bar references bag items: moves, toggles, keeps stacks and forgets items that leave', () => {
  const inv = createInventory();
  const sword = addInstance(inv, fixedWeapon(OLD_SWORD.id)), scroll = addInstance(inv, { itemId: TOWN_PORTAL.id });
  addItem(inv, 'item_potion_health', 3); addItem(inv, 'item_crystal_ruby', 2);
  const potion = inv.slots.find(s => s?.itemId === 'item_potion_health');
  assert.equal(assignBar(inv, 0, inv.slots.find(s => s?.itemId === 'item_crystal_ruby').instanceId), false, 'crystals have no use');
  assert.ok(assignBar(inv, 5, potion.instanceId)); assert.deepEqual(inv.bar[5], { itemId: 'item_potion_health' });
  assert.ok(assignBar(inv, 5, potion.instanceId)); assert.equal(inv.bar[5], null);
  assert.equal(assignBar(inv, 0, 'missing'), false);
  assert.throws(() => assignBar(inv, BAR_SIZE, sword), RangeError);
  const v = inv.version;
  assert.ok(assignBar(inv, 2, sword)); assert.ok(inv.version > v);
  assert.deepEqual(barEntry(inv, 2), { itemId: OLD_SWORD.id, slot: ownedSlot(inv, sword), count: 1 });
  assert.ok(assignBar(inv, 4, sword));   // moves
  assert.equal(inv.bar[2], null); assert.equal(barIndexOf(inv, ownedSlot(inv, sword)), 4);
  assert.ok(assignBar(inv, 4, sword));   // the same slot again: off
  assert.ok(inv.bar.every(r => r === null));
  assert.ok(assignBar(inv, 0, scroll)); assert.ok(assignBar(inv, 1, sword));
  assert.ok(assignBar(inv, 0, sword));   // replaces the scroll there
  assert.equal(barEntry(inv, 0).slot.instanceId, sword); assert.equal(barIndexOf(inv, ownedSlot(inv, scroll)), -1);
  assert.ok(takeItem(inv, sword));
  assert.equal(barEntry(inv, 0), null, 'a unique item that left the bag clears its slot');
  // stackables are referenced by item: any stack of it, and the slot stays when none are left
  inv.bar[3] = { itemId: 'item_potion_health' };
  assert.equal(barEntry(inv, 3).count, 3);
  assert.ok(removeItem(inv, potion.instanceId, 3));
  assert.deepEqual(barEntry(inv, 3), { itemId: 'item_potion_health', slot: null, count: 0 });
  addItem(inv, 'item_potion_health', 2);
  assert.equal(barEntry(inv, 3).count, 2);
});
const ownedSlot = (inv, id) => inv.slots.find(s => s?.instanceId === id);
test('stacking, overflow into multiple slots, and weapon instances preserve counts', () => {
  const inv = createInventory();
  assert.ok(addItem(inv, 'item_potion_health', 150));
  assert.deepEqual(inv.slots.filter(Boolean).map(s => s.count), [99, 51]);
  assert.ok(addItem(inv, 'item_potion_health', 70));
  assert.deepEqual(inv.slots.filter(Boolean).map(s => s.count), [99, 99, 22]);
  assert.ok(addItem(inv, OLD_SWORD.id, 2));
  const swords = inv.slots.filter(s => s?.itemId === OLD_SWORD.id);
  assert.notEqual(swords[0].instanceId, swords[1].instanceId);
  assert.ok(equipItem(inv, swords[1].instanceId));
  assert.equal(equippedItem(inv), swords[1]); assert.equal(swords[1].count, 1);
  assert.equal(equipItem(inv, inv.slots[0].instanceId), false);
  assert.equal(equipItem(inv, 'missing'), false);
  assert.ok(removeItem(inv, inv.slots[0].instanceId, 99));
  assert.ok(addItem(inv, 'item_crystal_ruby'));
  assert.equal(equippedItem(inv), swords[1]); // slot insertion cannot change equipped identity
  assert.ok(removeItem(inv, swords[1].instanceId));
  assert.equal(inv.equipped, null);
});
test('a full bag is atomic, while currency is never blocked by capacity', () => {
  const inv = createInventory(); addItem(inv, OLD_SWORD.id, 23); addItem(inv, 'item_potion_health', 98);
  const before = JSON.stringify(inv);
  assert.equal(addItem(inv, 'item_potion_health', 2), false);
  assert.equal(JSON.stringify(inv), before);
  assert.ok(addItem(inv, 'item_coin_copper', 1237));
  assert.deepEqual(inv.currency.map(s => s.count), [1, 23, 7]);
});
test('coins roll up, make change when spent, and never use floating gold', () => {
  const inv = createInventory();
  for (const [amount, counts] of [[9, [0,0,9]], [1, [0,1,0]], [990, [1,0,0]], [237, [1,23,7]]]) {
    addCopper(inv, amount); assert.deepEqual(inv.currency.map(s => s.count), counts);
  }
  addItem(inv, 'item_coin_silver', 77); addItem(inv, 'item_coin_gold', 200);
  assert.equal(copperTotal(inv), 202007);
  assert.deepEqual(inv.currency.map(s => s.count), [202, 0, 7]);
  assert.ok(spendCopper(inv, 8)); assert.deepEqual(inv.currency.map(s => s.count), [201, 99, 9]);
  const before = JSON.stringify(inv);
  assert.equal(spendCopper(inv, 999999), false); assert.equal(JSON.stringify(inv), before);
  for (let n = 0; n < 10000; n++) {
    const c = coinCounts(n); assert.ok(c[1] < 100 && c[2] < 10);
    assert.equal(c[0] * 1000 + c[1] * 10 + c[2], n);
  }
});
test('invalid counts and unsafe integer currency cannot corrupt inventory', () => {
  const inv = createInventory(), before = JSON.stringify(inv);
  for (const n of [-1, .5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => addItem(inv, OLD_SWORD.id, n));
    assert.throws(() => addCopper(inv, n)); assert.throws(() => spendCopper(inv, n));
  }
  assert.throws(() => addItem(inv, 'unknown'));
  assert.throws(() => addItem(inv, 'item_coin_gold', Number.MAX_SAFE_INTEGER));
  assert.equal(JSON.stringify(inv), before);
  addCopper(inv, Number.MAX_SAFE_INTEGER);
  assert.throws(() => addCopper(inv, 1)); assert.equal(copperTotal(inv), Number.MAX_SAFE_INTEGER);
});
test('XP thresholds are exact, increasing, and support multiple level-ups', () => {
  assert.deepEqual([1,2,3,4,5].map(xpForLevel), [0,500,2060,4800,8840]);
  for (let level = 1; level <= 500; level++) {
    assert.equal(levelFromXP(xpForLevel(level)), level);
    assert.equal(xpForLevel(level + 1) - xpForLevel(level), xpToNext(level));
    assert.ok(xpToNext(level + 1) > xpToNext(level));
    assert.equal(levelFromXP(xpForLevel(level + 1) - 1), level);
  }
  const p = createPlayerStats(); p.hp = 60;
  assert.equal(awardXP(p, 8840), 4);
  assert.deepEqual([p.level, p.hp, p.maxHp], [5,100,140]);
  assert.deepEqual(xpProgress(p), { current: 0, required: xpToNext(5) });
  assert.throws(() => awardXP(p, -1)); assert.equal(p.xp, 8840);
  p.hp = 0; awardXP(p, xpToNext(5)); assert.equal(p.hp, 0); // no resurrection from a reward
});
test('levels add health and a little damage; kills far below the player pay less, above it more', () => {
  assert.deepEqual([1, 2, 11, 21].map(maxHealth), [100, 110, 200, 300]);
  assert.deepEqual([1, 2, 11].map(levelDamage), [1, 1.02, 1.2]);
  for (const d of [-2, -1, 0, 1, 2]) assert.ok(xpScale(10, 10 - d) >= 1, `${d} levels apart`);
  assert.equal(xpScale(10, 12), 1.2); assert.equal(xpScale(10, 30), 1.5);
  assert.equal(xpScale(10, 7), 0.8); assert.equal(xpScale(10, 5), 0.4); assert.equal(xpScale(30, 1), 0.1);
  for (let d = 0; d < 20; d++) assert.ok(xpScale(10, 10 - d - 1) <= xpScale(10, 10 - d));
});
test('a health potion pours part of the maximum in within a second, one drink a second', () => {
  const p = createPlayerStats(), pour = (from, to) => { for (let t = from; t < to - 1e-9; t += 0.05) tickEffects(p, 0.05, t + 0.05); };
  assert.equal(drinkPotion(p, HEALTH_POTION, 1), 'full');
  takeDamage(p, 70, 1);
  assert.deepEqual(drinkPotion(p, HEALTH_POTION, 2), { heal: 40 }); assert.equal(p.hp, 30, 'not all at once');
  pour(2, 2.3); assert.ok(p.hp > 30 && p.hp < 70);
  pour(2.3, 3); assert.ok(Math.abs(p.hp - 70) < 1e-9);
  assert.equal(drinkPotion(p, HEALTH_POTION, 2.5), 'wait');
  assert.deepEqual(drinkPotion(p, HEALTH_POTION, 3), { heal: 30 }); pour(3, 4);
  assert.equal(p.hp, 100, 'never above the maximum');
  p.hp = 0; assert.equal(drinkPotion(p, HEALTH_POTION, 9), 'dead'); assert.equal(p.hp, 0);
  assert.equal(HEALTH_POTION.use, 'drink'); assert.ok(HEALTH_POTION.effect.heal > 0 && HEALTH_POTION.effect.time < 1 && HEALTH_POTION.cooldown === 1);
});
test('picked-up potions go on the first free quick bar slot unless they are on it already', () => {
  const inv = createPlayerStats().inventory;
  removeItem(inv, inv.slots.find(s => s?.itemId === HEALTH_POTION.id).instanceId, START_POTIONS);
  assert.deepEqual(barEntry(inv, 1).count, 0, 'the empty slot stays');
  addItem(inv, HEALTH_POTION.id, 2); assert.ok(autoBar(inv, HEALTH_POTION.id));
  assert.deepEqual(inv.bar.filter(r => r?.itemId === HEALTH_POTION.id).length, 1, 'not twice');
  inv.bar[1] = null; assert.ok(autoBar(inv, HEALTH_POTION.id));
  assert.deepEqual(inv.bar[1], { itemId: HEALTH_POTION.id });
  addItem(inv, 'item_crystal_ruby'); assert.equal(autoBar(inv, 'item_crystal_ruby'), false);
  assert.equal(autoBar(inv, OLD_SWORD.id), false, 'only usable stackables');
  inv.bar.fill({ instanceId: 'x' }); inv.bar[1] = null; inv.bar[0] = { instanceId: 'y' };
  removeItem(inv, inv.slots.find(s => s?.itemId === HEALTH_POTION.id).instanceId, 2); addItem(inv, HEALTH_POTION.id);
  assert.ok(autoBar(inv, HEALTH_POTION.id));
});
test('scaled species remain distinct without changing navigation or animation timing', () => {
  for (const level of [0, -1, .5, Infinity]) assert.throws(() => enemyProfile(SPIDER, level));
  for (const [p, hp, damage, xp] of [[SPIDER,54,21,40],[STUNDER,235,42,160]]) {
    const scaled = enemyProfile(p, 5);
    assert.deepEqual([scaled.hp, scaled.damage, scaled.xp], [hp,damage,xp]);
    for (const key of ['height','radius','chase','hitAt','attackTime','knock']) assert.equal(scaled[key], p[key]);
    const e = makeEnemy({ level: 5 }, p);
    assert.equal(e.hp, hp); assert.equal(e.level, 5); assert.equal(e.profile.damage, damage);
    assert.equal(p.hp, p === SPIDER ? 32 : 140);
  }
});
test('enemy levels and rewards are deterministic, depth-based and independent of spawn RNG', () => {
  const variations = new Set();
  for (let seed = 0; seed < 64; seed++) for (let depth = 0; depth <= 20; depth++) for (const p of [SPIDER,STUNDER]) {
    const map = { seed, depth, key: `0,${-depth},0` }, a = enemyRoll(map, p, 17);
    assert.deepEqual(a, enemyRoll(map, p, 17));
    const base = Math.max(1, depth);
    assert.equal(depthLevel(depth), base);
    assert.ok(a.level >= Math.max(1, base - 1) && a.level <= base + 1);
    if (depth < 2) assert.equal(a.level, 1);
    else variations.add(a.level - base);
    const [lo, hi] = coinRange(p, a.level);
    assert.deepEqual(coinRange(p, 1), p.coins);
    assert.ok(a.coinDrop >= lo && a.coinDrop <= hi);
    assert.notEqual(a.id, enemyRoll(map, p, 18).id);
    assert.notEqual(a.id, enemyRoll(map, p === SPIDER ? STUNDER : SPIDER, 17).id);
  }
  assert.deepEqual([...variations].sort(), [-1,0,1]);
});
test('a world of a higher level lifts every level by the same, from the road out of town to the core', () => {
  assert.equal(worldLevelFor(1), 1, 'a fresh hero makes a world of level 1');
  assert.equal(worldLevelFor(3), 1);
  assert.equal(worldLevelFor(11), 9, 'two levels under the hero');
  assert.equal(worldLevelFor(500), MAX_WORLD_LEVEL);
  assert.equal(cleanWorldLevel(undefined), 1); assert.equal(cleanWorldLevel(2.5), 1); assert.equal(cleanWorldLevel(-3), 1);
  for (let depth = 0; depth <= 20; depth++) {
    assert.equal(depthLevel(depth, 9), depthLevel(depth) + 8);
    assert.equal(guardianLevel(depth, 'descent', 9), guardianLevel(depth, 'descent') + 8);
    for (let seed = 0; seed < 16; seed++) {
      const map = { seed, depth, key: `0,${-depth},0` }, a = enemyRoll(map, SPIDER, 5), b = enemyRoll({ ...map, level: 9 }, SPIDER, 5);
      assert.equal(b.level, a.level + 8);
      assert.equal(b.id, a.id, 'the same enemy, only stronger');
    }
  }
  // what a world gives lifts with it: chests, quest rewards, the Smith's armor
  const site = { id: 'site:1', prestige: 'rare' };
  assert.ok(chestLoot(site, 3, 7, null, null, 9).items.filter(i => i.gen).every(i => i.gen.ilvl === depthLevel(3, 9) + CHESTS.rare.level));
  assert.ok(smithStock(7, 3, 0, 9).every(w => w.item.gen.ilvl === 11));
  assert.ok(questRewards(mulberry32(3), 3, 'medium', 9).xp > questRewards(mulberry32(3), 3, 'medium').xp);
});

test('death rewards occur once per stable enemy ID, including reconstructed enemies', () => {
  const p = createPlayerStats(), run = createRun(), roll = enemyRoll({ seed: 8, depth: 4, key: '0,-4,0' }, STUNDER, 12);
  const e = makeEnemy(roll, STUNDER);
  assert.equal(awardKill(p, run, e), null);
  damageEnemy(e, e.hp); const reward = awardKill(p, run, e);
  // the coins drop as loot: returned, not credited; a kill above the player's level pays more
  const xp = Math.round(e.profile.xp * xpScale(1, e.level));
  assert.ok(e.level > 1 && xp > e.profile.xp);
  assert.equal(p.xp, xp); assert.equal(reward.xp, xp); assert.equal(reward.coins, e.coinDrop); assert.equal(copperTotal(p.inventory), 0);
  assert.ok(reward && run.defeated.has(e.id));
  assert.equal(awardKill(p, run, e), null);
  const copy = makeEnemy(roll, STUNDER); damageEnemy(copy, copy.hp);
  assert.equal(awardKill(p, run, copy), null);
  assert.equal(p.xp, xp);
  const fresh = createPlayerStats(), nextRun = createRun();
  assert.ok(awardKill(fresh, nextRun, copy));
});
test('health regeneration waits five hit-free seconds and restores a share of the level-scaled max HP', () => {
  const p = createPlayerStats(); awardXP(p, xpForLevel(2)); takeDamage(p, 30, 10);
  assert.equal(p.hp, 80); regenerate(p, 1, 14.99); assert.equal(p.hp, 80);
  regenerate(p, 1, 15); assert.equal(p.hp, 80 + 0.04 * 110);
  takeDamage(p, .4, 16); regenerate(p, 1, 20); assert.equal(p.hp, 84);
  regenerate(p, 99, 21); assert.equal(p.hp, 110);
  takeDamage(p, 1000, 22); regenerate(p, 99, 30); assert.equal(p.hp, 0);
});
test('god mode (dev /god) takes no health', () => {
  const p = createPlayerStats(); p.god = true; takeDamage(p, 1000, 5);
  assert.equal(p.hp, 100); assert.notEqual(p.lastDamageAt, 5);
  p.god = false; takeDamage(p, 30, 6); assert.equal(p.hp, 70);
});
test('every weapon has real assets, damage, reach and synchronized attack timing', () => {
  for (const w of WEAPONS) {
    assert.ok(existsSync(assetPath(w.model)));
    const p = hero(); equip(p, w.id); awardXP(p, xpForLevel(5));
    const stats = combatStats(p, null), T = KINDS[w.weapon.kind].timing;   // (a trident: its stab, at what is ahead)
    assert.equal(stats.kind, w.weapon.kind); assert.equal(stats.ranged, !isMelee(w.weapon.kind));
    assert.equal(stats.damage, Math.round(w.weapon.damage * levelDamage(5))); assert.equal(stats.range, w.weapon.range);
    assert.equal(stats.chain, w.weapon.interval, 'attacks chain at the weapon interval');
    assert.ok(Math.abs(stats.activeStart / stats.duration - T.activeStart / T.duration) < 1e-9, 'every attack time scales with it');
    if (stats.ranged) {
      // a shot leaves once, at activeStart, and the blade rules never apply
      assert.ok(startSwing(p));
      const e = makeEnemy({ x: 0, y: 0, z: .5 }, STUNDER);
      advanceSwing(p, stats.activeStart - .01); assert.equal(shotDue(p), false);
      advanceSwing(p, .02); assert.equal(shotDue(p), true); assert.equal(swordHit(p, e, 1), false);
      p.sword.fired = true; assert.equal(shotDue(p), false);
      advanceSwing(p, stats.duration); assert.equal(p.sword.active, false);
      continue;
    }
    assert.ok(startSwing(p));
    const e = makeEnemy({ x: 0, y: 0, z: w.weapon.range + SPIDER.radius - .01 }, STUNDER);
    assert.equal(swordHit(p, e, 1), false);
    advanceSwing(p, stats.activeStart + .001); assert.deepEqual(swordHit(p, e, 1), { damage: stats.damage, crit: false });
    assert.equal(e.hp, STUNDER.hp - stats.damage);
    assert.equal(swordHit(p, e, 1), false);
    // each of a flail's other balls strikes again, in its share of the active window
    const window = (stats.activeEnd - stats.activeStart) / (stats.balls ?? 1);
    for (let b = 1; b < (stats.balls ?? 1); b++) {
      advanceSwing(p, window); assert.equal(p.sword.ball, b);
      assert.deepEqual(swordHit(p, e, 1), { damage: stats.damage, crit: false }); assert.equal(swordHit(p, e, 1), false);
    }
    advanceSwing(p, stats.duration); assert.equal(p.sword.active, false);
  }
});
test('equipment guards current actions, and an active swing snapshots its damage', () => {
  const p = hero(); assert.ok(canChangeWeapon(p)); startSwing(p);
  assert.equal(canChangeWeapon(p), false); assert.equal(p.sword.stats.damage, 30);
  awardXP(p, xpForLevel(6)); assert.equal(combatStats(p).damage, 33); assert.equal(p.sword.stats.damage, 30);
  const e = makeEnemy({ x: 0, y: 0, z: .8 }, STUNDER);
  advanceSwing(p, p.sword.stats.activeStart + .001); swordHit(p, e, 1); assert.equal(e.hp, STUNDER.hp - 30);
  cancelSwing(p, true);
  for (const extra of [{ragdoll:{}},{climb:{}},{swimming:true},{stun:1},{hp:0}]) assert.equal(canChangeWeapon(Object.assign(hero(), extra)), false);
  removeItem(p.inventory, p.inventory.equipped);
  assert.equal(combatStats(p), null); assert.equal(startSwing(p), false);
});
test('every item shows as its model: it has one to draw its picture from, and no icon image', () => {
  for (const def of Object.values(ITEMS)) {
    const url = def.model ?? def.picture;
    assert.ok(url?.endsWith('.glb') && existsSync(assetPath(url)), def.id);
    assert.equal(def.icon, undefined, def.id);
  }
});
