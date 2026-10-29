// Armor (docs/armor.md): the bases, the generator, stats, what is worn, drops, the Smith's wares,
// saves, what a friend sees, and the models' parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, decoderReady } from '../tools/glb.mjs';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS, ARMORS, HATS, CARRIED, WEARABLES, ARMOR_SLOTS, isGear } from '../src/core/items.js';
import { RARITY, RARITIES } from '../src/core/gear/rarities.js';
import { AFFIX, AFFIXES } from '../src/core/gear/affixes.js';
import { ARMOR_BASES, BASES, baseTags } from '../src/core/gear/bases.js';
import { rollArmor, rollWeapon } from '../src/core/gear/generate.js';
import { armorStats, armorReduction, wornTotals, armorGrowth, MAX_REDUCTION, MAX_BLOCK, itemStats } from '../src/core/gear/stats.js';
import { armorDrops, weaponDrops, armorChance, ARMOR_CHANCE } from '../src/core/gear/drops.js';
import { createInventory, addInstance, wearItem, takeOffItem, takeItem, removeItem, isWorn, wornItem, bareSlots, addCopper, copperTotal } from '../src/core/inventory.js';
import { fullHealth, maxHealth, refreshMaxHp, createPlayerStats, regenerate, PLAYER } from '../src/core/progression.js';
import { checkInventory, createHero, checkHero, heroStats, checkSmith } from '../src/core/save.js';
import { smithStock, buyStock, armorPrice, STOCK_SIZE, STOCK_BEST, SHOPS } from '../src/core/shops.js';
import { canReroll, rerollWeapon, rerollCost } from '../src/core/crafting.js';
import { validGen, walkTakes } from '../src/core/loot.js';
import { wornOf, PROTOCOL } from '../src/net/protocol.js';
import { SPIDER, STUNDER } from '../src/core/enemies.js';

const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const slotOf = item => ITEMS[item.itemId].armor.slot;

test('five pieces of armor for every slot (eight shields, and the hats), a light one from item level 1, each with a model', () => {
  assert.deepEqual(ARMOR_SLOTS, ['head', 'body', 'shield', 'feet']);
  for (const slot of ARMOR_SLOTS) {
    const bases = ARMOR_BASES.filter(b => slotOf(b) === slot);
    assert.equal(bases.length, (slot === 'shield' ? 8 : 5) + (slot === 'head' ? HATS.length : slot === 'shield' ? CARRIED.length : 0), slot);
    assert.ok(bases.some(b => b.minLevel === 1), `a ${slot} piece from item level 1`);
    assert.deepEqual(bases.map(b => b.tags), bases.map(() => ['armor', slot]));
  }
  // every hat the villagers wear is head armor too, everything they carry off-hand armor, and drops
  assert.deepEqual(HATS.map(h => h.id), WEARABLES.filter(w => w.slot === 'head').map(w => w.id));
  assert.deepEqual(CARRIED.map(h => h.id), WEARABLES.filter(w => w.slot !== 'head').map(w => w.id));
  assert.equal(ARMORS.length + HATS.length + CARRIED.length, ARMOR_BASES.length);
  for (const c of CARRIED) {
    assert.equal(c.category, 'held'); assert.ok(['left', 'right'].includes(c.slot));
    assert.ok(c.armor.block > 0 && c.armor.block < ITEMS.armor_shield_buckler.armor.block && Object.keys(c.armor.perks).length, c.id);
  }
  for (const a of [...ARMORS, ...HATS]) {
    assert.equal(a.category, HATS.includes(a) ? 'wearable' : 'armor'); assert.equal(a.slot, a.armor.slot); assert.equal(a.stackLimit, 1);
    assert.equal(a.model, `assets/items/${a.id}.glb`);
    assert.ok(a.armor.armor > 0 && a.description, a.id);
    assert.equal(a.armor.block > 0, a.slot === 'shield', `${a.id}: only shields block`);
    assert.ok(isGear(a.id) && !isGear('item_potion_health'));
    assert.deepEqual(baseTags(a.id), ['armor', a.slot]);
  }
  // heavier pieces come deeper down and hold more (the hats are light, each a little something of its own)
  for (const h of HATS) assert.ok(h.armor.armor < ITEMS.armor_head_great.armor.armor && (Object.keys(h.armor.perks).length || h.armor.speed || h.armor.armor >= 8), h.id);
  for (const slot of ARMOR_SLOTS) {
    const bases = ARMOR_BASES.filter(b => slotOf(b) === slot && ITEMS[b.itemId].armor.speed === 0 && ARMORS.includes(ITEMS[b.itemId]));
    for (let i = 1; i < bases.length; i++) assert.ok(ITEMS[bases[i].itemId].armor.armor > ITEMS[bases[i - 1].itemId].armor.armor, bases[i].itemId);
  }
  // the weapons' bases are as they were
  assert.ok(BASES.every(b => ITEMS[b.itemId].weapon));
});

test('armor affixes roll only on armor, and weapon affixes only on weapons', () => {
  const R = mulberry32(7);
  for (let i = 0; i < 400; i++) {
    const a = rollArmor(R, 1 + (i % 25), { rarity: RARITIES[4 + (i % 6)].id });
    assert.equal(a.gen.affixes.length, RARITY[a.gen.rarity].affixes, `${a.itemId} ${a.gen.rarity}`);
    for (const x of a.gen.affixes) {
      const tags = AFFIX[x.id].tags;
      assert.ok(tags.includes('armor') || tags.includes(slotOf(a)), `${x.id} on ${a.itemId}`);
      const [lo, hi] = AFFIX[x.id].tiers[x.tier - 1];
      assert.ok(x.value >= lo && x.value <= hi);
    }
    assert.equal(new Set(a.gen.affixes.map(x => x.id)).size, a.gen.affixes.length);
    const w = rollWeapon(R, 1 + (i % 25), { rarity: 'omg' });
    assert.ok(w.gen.affixes.every(x => !AFFIX[x.id].tags.includes('armor')));
  }
  for (const a of AFFIXES.filter(a => a.tags.includes('armor')))
    assert.ok(!a.tags.includes('melee') && !a.tags.includes('ranged'), a.id);
});

test('rollArmor is seeded, plain JSON, named with armor words, and leans towards bare slots', () => {
  const a = rollArmor(mulberry32(3), 9), b = rollArmor(mulberry32(3), 9);
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.ok(validGen(a.gen) && !walkTakes(a));
  assert.equal(rollArmor(mulberry32(1), 5, { rarity: 'vanilla', itemId: 'armor_head_cap' }).itemId, 'armor_head_cap');
  assert.throws(() => rollArmor(mulberry32(1), 5, { itemId: 'weapon_sword_short' }));
  // only what the item level allows
  assert.ok(many(300, i => rollArmor(mulberry32(i), 1)).every(x => ARMOR_BASES.find(b => b.itemId === x.itemId).minLevel === 1));
  // a slot asked for, and a cap on the rarity (the Smith's)
  assert.ok(many(100, i => rollArmor(mulberry32(i), 20, { slot: 'feet', maxRank: RARITY.unusual.rank, luck: 2 }))
    .every(x => slotOf(x) === 'feet' && RARITY[x.gen.rarity].rank <= RARITY.unusual.rank));
  // favour: the bare slot three times as likely as each of the others
  const shields = many(4000, i => rollArmor(mulberry32(i + 10), 12, { favor: ['shield'] })).filter(x => slotOf(x) === 'shield').length;
  assert.ok(Math.abs(shields / 4000 - 0.5) < 0.04, `${shields} of 4000`);
});

test('armor grows with item level and rarity; what it takes off a blow is bounded', () => {
  const at = (rarity, ilvl, itemId = 'armor_body_plate') => armorStats(rollArmor(mulberry32(1), ilvl, { rarity, itemId }));
  assert.equal(at('vanilla', 1).armor, 30);
  assert.equal(at('vanilla', 11).armor, Math.round(30 * armorGrowth(11)));
  assert.ok(at('omg', 20).armor > at('fabled', 20).armor);
  assert.equal(armorStats({ itemId: 'weapon_sword_short' }), null);
  assert.equal(itemStats({ itemId: 'armor_head_cap' }), null);
  const shield = armorStats(rollArmor(mulberry32(1), 1, { rarity: 'vanilla', itemId: 'armor_shield_tower' }));
  assert.equal(shield.block, 22);
  assert.equal(armorStats(rollArmor(mulberry32(1), 1, { rarity: 'vanilla', itemId: 'armor_feet_winged' })).moveSpeed, 6);
  // a hat's own perks count like affixes
  const straw = armorStats(rollArmor(mulberry32(1), 1, { rarity: 'vanilla', itemId: 'wear_straw_hat' }));
  assert.deepEqual([straw.slot, straw.armor, straw.burnResist], ['head', 3, 10]);
  assert.equal(armorStats(rollArmor(mulberry32(1), 1, { rarity: 'vanilla', itemId: 'wear_explorer_hat' })).moveSpeed, 2);
  // the same piece from as deep as the enemy takes off as much at every depth
  for (const level of [1, 5, 10, 20]) {
    const a = at('vanilla', level).armor;
    assert.ok(Math.abs(armorReduction(a, level) - armorReduction(30, 1)) < 0.01, `level ${level}`);
  }
  assert.ok(armorReduction(30, 10) < armorReduction(30, 1), 'an old piece takes off less deeper down');
  assert.equal(armorReduction(0, 3), 0);
  assert.equal(armorReduction(1e9, 1), MAX_REDUCTION);
});

test('what is worn: one piece a slot, it stays in the bag, and leaving the bag takes it off', () => {
  const inv = createInventory();
  const R = mulberry32(2);
  const helm = addInstance(inv, rollArmor(R, 3, { itemId: 'armor_head_cap', rarity: 'vanilla' }));
  const helm2 = addInstance(inv, rollArmor(R, 3, { itemId: 'armor_head_skullcap', rarity: 'vanilla' }));
  const shield = addInstance(inv, rollArmor(R, 3, { itemId: 'armor_shield_round', rarity: 'vanilla' }));
  const sword = addInstance(inv, rollWeapon(R, 3));
  assert.deepEqual(bareSlots(inv), ARMOR_SLOTS);
  assert.ok(!wearItem(inv, sword) && !wearItem(inv, 'nope'));
  assert.ok(wearItem(inv, helm) && wearItem(inv, shield));
  assert.ok(isWorn(inv, helm) && wornItem(inv, 'head').instanceId === helm);
  assert.deepEqual(bareSlots(inv), ['body', 'feet']);
  assert.ok(wearItem(inv, helm2));
  assert.ok(!isWorn(inv, helm) && isWorn(inv, helm2), 'a new helm instead of the old one');
  const t = wornTotals(inv);
  assert.equal(t.armor, armorStats(wornItem(inv, 'head')).armor + armorStats(wornItem(inv, 'shield')).armor);
  assert.equal(t.block, 13);
  assert.equal(wornTotals(inv, { shield: false }).block, 0, 'a shield on the back blocks nothing');
  assert.ok(takeOffItem(inv, 'head') && !takeOffItem(inv, 'head'));
  assert.equal(inv.worn.head, null);
  takeItem(inv, shield);
  assert.equal(inv.worn.shield, null, 'dropped: not worn any more');
  wearItem(inv, helm);
  removeItem(inv, helm, 1);
  assert.equal(inv.worn.head, null);
  assert.deepEqual(wornTotals(undefined), { armor: 0, block: 0, moveSpeed: 0, life: 0, regen: 0, burnResist: 0, poisonResist: 0, steady: 0 });
});

test('block and the resistances have ceilings', () => {
  const inv = createInventory(), R = mulberry32(4);
  for (const itemId of ['armor_shield_tower', 'armor_body_plate', 'armor_head_great', 'armor_feet_greaves']) {
    const item = rollArmor(R, 30, { itemId, rarity: 'omg' });
    item.gen.affixes = [{ id: 'blocky', tier: 7, value: 40 }, { id: 'fireproof', tier: 7, value: 40 }];
    wearItem(inv, addInstance(inv, item));
  }
  const t = wornTotals(inv);
  assert.equal(t.block, MAX_BLOCK);
  assert.equal(t.burnResist, 75);
});

test('health from armor raises the maximum, and goes again when it comes off', () => {
  const p = createPlayerStats();
  assert.equal(fullHealth(1, p.inventory), maxHealth(1));
  const item = rollArmor(mulberry32(1), 5, { itemId: 'armor_body_chain', rarity: 'vanilla' });
  item.gen.affixes = [{ id: 'hearty', tier: 2, value: 12 }];
  const id = addInstance(p.inventory, item);
  wearItem(p.inventory, id);
  p.hp = 50;
  assert.ok(refreshMaxHp(p));
  assert.equal(p.maxHp, maxHealth(1) + 12);
  assert.equal(p.hp, 62, 'the health it adds comes with it');
  assert.ok(!refreshMaxHp(p));
  takeOffItem(p.inventory, 'body');
  p.hp = p.maxHp;
  refreshMaxHp(p);
  assert.equal(p.maxHp, maxHealth(1));
  assert.equal(p.hp, maxHealth(1), 'and goes with it');
  // Licking Wounds: faster healing
  const slow = { ...createPlayerStats(), hp: 10, lastDamageAt: -100 }, fast = { ...createPlayerStats(), hp: 10, lastDamageAt: -100 };
  const mend = rollArmor(mulberry32(1), 5, { itemId: 'armor_head_cap', rarity: 'vanilla' });
  mend.gen.affixes = [{ id: 'mending', tier: 1, value: 50 }];
  wearItem(fast.inventory, addInstance(fast.inventory, mend));
  regenerate(slow, 1, 0); regenerate(fast, 1, 0);
  assert.ok(Math.abs((fast.hp - 10) - 1.5 * (slow.hp - 10)) < 1e-9);
  assert.equal(slow.hp - 10, PLAYER.REGEN * slow.maxHp);
});

test('saves keep what is worn, and drop what does not make sense', () => {
  const h = createHero('Ann', { id: 'h-1', now: 1 });
  const R = mulberry32(5);
  const boots = addInstance(h.inventory, rollArmor(R, 4, { itemId: 'armor_feet_boots', rarity: 'decent' }));
  wearItem(h.inventory, boots);
  const back = checkHero(JSON.parse(JSON.stringify(h)));
  assert.equal(back.inventory.worn.feet, boots);
  assert.deepEqual(back.inventory.slots.find(s => s?.instanceId === boots).gen, h.inventory.slots.find(s => s?.instanceId === boots).gen);
  // a piece in the wrong slot, a weapon worn, something not in the bag: nothing worn there
  const saved = JSON.parse(JSON.stringify(h.inventory));
  saved.worn = { head: boots, body: saved.equipped, shield: 'item-999', feet: boots };
  assert.deepEqual(checkInventory(saved).worn, { head: null, body: null, shield: null, feet: boots });
  delete saved.worn;
  assert.deepEqual(checkInventory(saved).worn, { head: null, body: null, shield: null, feet: null }, 'an old save wears nothing');
  // a hero comes in with the health its armor gives
  const hearty = rollArmor(R, 4, { itemId: 'armor_head_cap', rarity: 'decent' });
  hearty.gen.affixes = [{ id: 'hearty', tier: 1, value: 7 }];
  wearItem(h.inventory, addInstance(h.inventory, hearty));
  const s = heroStats(h);
  assert.equal(s.maxHp, maxHealth(1) + 7); assert.equal(s.hp, s.maxHp);
  assert.deepEqual(checkSmith({ visit: 3, sold: [1, 1, 'x', -2, 4] }), { visit: 3, sold: [1, 4] });
  assert.deepEqual(checkSmith(null), { visit: 0, sold: [] });
});

test('drops: armor on a stream of its own, about 4% of plain enemies, one from every guardian', () => {
  assert.equal(armorChance(30), ARMOR_CHANCE);
  assert.ok(armorChance(SPIDER.xp) < armorChance(STUNDER.xp));
  const n = 20000;
  const found = many(n, i => armorDrops({ id: `k:${i}`, level: 6, kind: { xp: 30 } }, 1).length).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(found / n - ARMOR_CHANCE) < 0.006, `${found} of ${n}`);
  const e = { id: 'g', level: 9, guardian: true, guardianRole: 'side', kind: SPIDER };
  const [g] = armorDrops(e, 3);
  assert.ok(g && RARITY[g.gen.rarity].rank >= RARITY.decent.rank);
  assert.deepEqual(armorDrops(e, 3), armorDrops(e, 3));
  assert.equal(armorDrops({ id: 'c', level: 3, kind: { xp: 30, drops: { weapons: false } } }, 1).length, 0);
  // the weapons are what they were
  assert.deepEqual(weaponDrops(e, 3), weaponDrops(e, 3));
  // the bare slots get more
  const feet = many(n, i => armorDrops({ id: `f:${i}`, level: 6, kind: { xp: 30 } }, 1, ['feet'])).flat();
  assert.ok(feet.filter(x => slotOf(x) === 'feet').length / feet.length > 0.4);
});

test('the Smith sells a piece for every slot, never better than Unusual, the same for a visit', () => {
  assert.equal(SHOPS.smith.stock, 'armor'); assert.equal(SHOPS.smith.service, 'reroll');
  const stock = smithStock(42, 7, 2);
  assert.equal(stock.length, STOCK_SIZE);
  assert.deepEqual(stock.slice(0, 4).map(w => slotOf(w.item)), ARMOR_SLOTS);
  assert.deepEqual(smithStock(42, 7, 2), stock);
  assert.notDeepEqual(smithStock(42, 7, 3), stock, 'a new visit, new armor');
  for (let v = 0; v < 50; v++) for (const w of smithStock(v, 15, v)) {
    assert.ok(RARITY[w.item.gen.rarity].rank <= RARITY[STOCK_BEST].rank);
    assert.equal(w.item.gen.ilvl, 15);
    assert.ok(Number.isSafeInteger(w.price) && w.price > 0 && w.price === armorPrice(w.item));
  }
  assert.equal(smithStock(1, 0, 0)[0].item.gen.ilvl, 1, 'town: item level 1');
  // dearer deeper, dearer rarer, dearer heavier
  const piece = (itemId, rarity, ilvl) => ({ itemId, count: 1, gen: { rarity, ilvl, affixes: [], name: 'x', v: 1 } });
  assert.ok(armorPrice(piece('armor_body_plate', 'vanilla', 10)) > armorPrice(piece('armor_body_plate', 'vanilla', 8)));
  assert.ok(armorPrice(piece('armor_body_plate', 'unusual', 8)) > armorPrice(piece('armor_body_plate', 'decent', 8)));
  assert.ok(armorPrice(piece('armor_body_plate', 'vanilla', 8)) > armorPrice(piece('armor_body_padded', 'vanilla', 8)));
  // buying: all or nothing
  const inv = createInventory(), ware = stock[1];
  assert.equal(buyStock(inv, ware), 'poor');
  addCopper(inv, ware.price + 5);
  assert.equal(buyStock(inv, ware), 'ok');
  assert.equal(copperTotal(inv), 5);
  assert.deepEqual(inv.slots.find(s => s?.itemId === ware.item.itemId).gen, ware.item.gen);
  for (let i = 0; i < 30; i++) addInstance(inv, rollArmor(mulberry32(i), 1));
  addCopper(inv, ware.price);
  assert.equal(buyStock(inv, ware), 'full');
});

test('the Smith re-rolls armor like weapons', () => {
  const inv = createInventory();
  const id = addInstance(inv, rollArmor(mulberry32(9), 8, { itemId: 'armor_shield_kite', rarity: 'fabled' }));
  addCopper(inv, 1e6);
  const before = inv.slots.find(s => s?.instanceId === id).gen.affixes;
  assert.ok(rerollCost(inv.slots.find(s => s?.instanceId === id)) > 0);
  assert.equal(canReroll(inv, id, 0), 'ok');
  assert.equal(rerollWeapon(inv, id, 0, mulberry32(1)), 'ok');
  const after = inv.slots.find(s => s?.instanceId === id).gen.affixes;
  assert.equal(after.length, before.length);
  for (const x of after) assert.ok(AFFIX[x.id].tags.includes('armor') || AFFIX[x.id].tags.includes('shield'), x.id);
});

test('a friend sees what we wear: id, rarity and whether the shield is on the back', () => {
  assert.ok(PROTOCOL >= 13);
  assert.deepEqual(wornOf(['armor_head_cap@fabled@0', 'armor_shield_kite@decent@1', 'wear_wizard_hat']), [
    { id: 'armor_head_cap', slot: 'head', rarity: 'fabled', back: false }, { id: 'armor_shield_kite', slot: 'shield', rarity: 'decent', back: true }]);
  assert.deepEqual(wornOf(['wear_wizard_hat']), [{ id: 'wear_wizard_hat', slot: 'head', rarity: null, back: false }]);
  assert.deepEqual(wornOf(['held_hammer@unusual@0']), [{ id: 'held_hammer', slot: 'shield', rarity: 'unusual', back: false }], 'carried: in the off hand');
  assert.deepEqual(wornOf(['nope@omg@1', 3, null, 'armor_head_cap@bogus@x']), [{ id: 'armor_head_cap', slot: 'head', rarity: null, back: false }]);
  assert.deepEqual(wornOf('armor_head_cap'), []);
  assert.equal(wornOf(Array(20).fill('armor_feet_boots@vanilla@0')).length, 1, 'one per slot');
});

await decoderReady;
test('every piece of armor is in parts that name their bones; shields say where they go on the back', () => {
  const bones = new Set(['head', 'spine', 'hips', 'upper_arm.L', 'upper_arm.R', 'forearm.L', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']);
  for (const a of ARMORS) {
    const json = readGlb(resolve(assets, `items/${a.id}.glb`)).json;
    const parts = json.nodes.filter(n => n.extras?.bone);
    assert.ok(parts.length >= 1, a.id);
    for (const p of parts) assert.ok(bones.has(p.extras.bone), `${a.id}: ${p.extras.bone}`);
    const root = json.nodes[json.scenes[0].nodes[0]];
    assert.equal(root.extras.slot, a.slot, a.id);
    if (a.slot === 'feet') assert.deepEqual(parts.map(p => p.extras.bone).sort(), ['shin.L', 'shin.R']);
    if (a.slot === 'shield') {
      assert.equal(root.extras.back_bone, 'spine');
      assert.equal(root.extras.back_gltf.length, 16); assert.equal(root.extras.floor_gltf.length, 16);
    }
    // the trim the game tints by rarity
    assert.ok(json.materials.some(m => m.name === 'Items_Trim'), `${a.id} has trim`);
  }
  // a hat sits on the head's socket, a thing carried on its hand's (render/figure.js wear), with
  // trim to show its rarity
  for (const h of [...HATS, ...CARRIED]) {
    const json = readGlb(resolve(assets, `items/${h.id}.glb`)).json, root = json.nodes[json.scenes[0].nodes[0]];
    assert.equal(root.extras.socket, { head: 'head', left: 'hand.L', right: 'hand.R' }[h.slot], h.id);
    assert.ok(!json.nodes.some(n => n.extras?.bone), h.id);
    assert.ok(json.materials.some(m => m.name === 'Items_Trim'), `${h.id} has trim`);
  }
});
