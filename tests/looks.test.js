// Items' looks (core/looks.js, docs/looks.md): pure, from what the item keeps; the same item the
// same pixels, apart items apart, every collectable's model taking its look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb } from '../tools/glb.mjs';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS, OLD_SWORD } from '../src/core/items.js';
import { RARITIES } from '../src/core/gear/rarities.js';
import { AFFIXES } from '../src/core/gear/affixes.js';
import { ENCHANTS } from '../src/core/gear/enchants.js';
import { rollWeapon, rollArmor, fixedWeapon } from '../src/core/gear/generate.js';
import { lookOf, lookKey, parseLook, paintLook, lookSlot, LOOK_W, LOOK_H, LOOK_SLOTS } from '../src/core/looks.js';

const sword = (seed, rarity = 'unusual') => rollWeapon(mulberry32(seed), 12, { itemId: 'weapon_sword_long', rarity });
const same = (a, b) => Buffer.from(a).equals(Buffer.from(b));

test('the same item gives the same pixels; a copy of it (a save, a friend) too', () => {
  const item = sword(1), copy = JSON.parse(JSON.stringify(item));
  assert.equal(lookKey(item), lookKey(copy));
  assert.ok(same(paintLook(lookOf(item)), paintLook(lookOf(copy))));
  assert.equal(paintLook(lookOf(item)).length, LOOK_W * LOOK_H * 4);
  assert.equal(LOOK_W, 16 * LOOK_SLOTS.length);
});

test('two of one base and rarity look apart; every texel shades, is painted or glows', () => {
  const pixels = Array.from({ length: 8 }, (_, i) => paintLook(lookOf(sword(10 + i))));
  for (let i = 1; i < pixels.length; i++) assert.ok(!same(pixels[0], pixels[i]), `roll ${i} looks like roll 0`);
  for (const r of RARITIES) {
    const px = paintLook(lookOf(sword(3, r.id)));
    for (let i = 3; i < px.length; i += 4) assert.ok([0, 128, 255].includes(px[i]), `${r.id}: alpha ${px[i]}`);
  }
});

test('the key says it all, and comes back from a string', () => {
  for (const item of [sword(2), rollArmor(mulberry32(4), 9, { itemId: 'armor_body_scale', rarity: 'omg' }), 'item_coin_gold', fixedWeapon(OLD_SWORD.id)]) {
    assert.deepEqual(parseLook(lookKey(item)), lookOf(item));
    assert.equal(lookKey(lookKey(item)), lookKey(item), 'a key is its own key');
  }
  for (const bad of ['', 'nope:1:::', 'weapon_sword_long:xyz:::', 'weapon_sword_long:1:bogus::', 'weapon_sword_long:1::fire:',
    'weapon_sword_long:1:::nope', 'weapon_sword_long:1::', 'weapon_sword_long:1::::', null, 3, 'x'.repeat(300)])
    assert.equal(parseLook(bad), null, String(bad));
});

test('the Enchanter and the Smith change a look, but it stays the same weapon\'s', () => {
  const item = sword(5), look = lookOf(item);
  const enchanted = { ...item, gen: { ...item.gen, enchant: 'toasty' } }, rerolled = { ...item, gen: { ...item.gen, affixes: [{ id: 'leech', tier: 1, value: 1 }] } };
  for (const other of [enchanted, rerolled]) {
    assert.equal(lookOf(other).seed, look.seed, 'the same patterns');
    assert.notEqual(lookKey(other), lookKey(item));
    assert.ok(!same(paintLook(lookOf(other)), paintLook(look)));
  }
  assert.equal(lookOf(enchanted).enchant, 'toasty');
  assert.deepEqual(lookOf(rerolled).marks, ['leech']);
});

test('stackables look like their kind: the id is the look', () => {
  for (const id of ['item_potion_health', 'item_coin_copper', 'item_crystal_ruby', 'quest_locket']) {
    const look = lookOf({ itemId: id, count: 3 });
    assert.deepEqual(look, lookOf(id));
    assert.equal(look.rarity, null);
  }
  assert.notEqual(lookKey('item_potion_health'), lookKey('item_potion_antidote'));
  assert.equal(lookKey('treasure_chest'), '', 'not an item');
});

test('every collectable\'s model has a material that takes its look', () => {
  for (const def of Object.values(ITEMS)) {
    const path = def.model ?? def.picture;
    const json = readGlb(resolve(assets, path.replace(/^assets\//, ''))).json;
    assert.ok(json.materials.some(m => lookSlot(m.name) >= 0), `${def.id}: ${json.materials.map(m => m.name)}`);
  }
  assert.deepEqual(['Items_Clay', 'Items_Metal', 'Items_Trim', 'Items_Facets', 'SwordGrip', 'SwordBlade', 'quest_lantern_glow'].map(lookSlot), [0, 1, 2, 3, 0, 1, -1]);
});

test('every affix leaves a mark and every enchantment an element', () => {
  for (const a of AFFIXES) {
    const item = sword(7);
    item.gen.affixes = [{ id: a.id, tier: 1, value: 1 }];
    assert.deepEqual(lookOf(item).marks, [a.id], a.id);
    assert.ok(!same(paintLook(lookOf(item)), paintLook(lookOf({ ...item, gen: { ...item.gen, affixes: [] } }))), `${a.id} shows`);
  }
  for (const e of ENCHANTS) assert.equal(lookOf({ ...sword(7), gen: { ...sword(7).gen, enchant: e.id } }).enchant, e.id, e.id);
});
