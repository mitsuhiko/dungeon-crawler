// Items' looks (core/looks.js, docs/looks.md): pure, from what the item keeps; the same item the
// same pixels, apart items apart, every collectable's model taking its look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb } from '../tools/glb.mjs';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS, OLD_SWORD, QUEST_ITEMS } from '../src/core/items.js';
import { RARITIES } from '../src/core/gear/rarities.js';
import { AFFIXES } from '../src/core/gear/affixes.js';
import { ENCHANTS } from '../src/core/gear/enchants.js';
import { rollWeapon, rollArmor, fixedWeapon } from '../src/core/gear/generate.js';
import { lookOf, lookKey, parseLook, paintLook, lookSlot, lookHash, partScales, QUEST_STUFF, MIN_ACROSS, BOOST, LOOK_W, LOOK_H, LOOK_SLOTS } from '../src/core/looks.js';

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

// a tile of a look's pixels (0: clay, 1: metal, 2: trim, 3: facets)
const tileOf = (px, i) => Array.from({ length: 16 }, (_, y) => Array.from(px.subarray((y * LOOK_W + i * 16) * 4, (y * LOOK_W + i * 16 + 16) * 4))).flat();

test('pinned looks: the hash, the generator and the layers stay as they are', () => {
  // A change here changes how every item in every world looks. If it is meant, update the hashes.
  const PINNED = {
    'weapon_sword_long:98528a95:crap::': 'bc86f2ea',
    'weapon_staff_arcane:5184dc32:remarkable:zappy:brutal+leech+precision': '99f6b7b9',
    'weapon_flail_triple:3f4f0236:omg::brutal+swift+sweeping+leech+force': 'f5b98fda',
    'armor_body_plate:cb3faffa:fabled::sturdy+thick+hearty+steady': '4ac45e50',
    'item_coin_gold:7f050c51:::': '4cd75ce2',
    'quest_honey_pot:6fc199b4:::': '405ff18f',
  };
  for (const [key, hash] of Object.entries(PINNED))
    assert.equal(lookHash(String.fromCharCode(...paintLook(parseLook(key)))).toString(16), hash, key);
  assert.equal(lookOf('item_coin_gold').seed.toString(16), '7f050c51', 'the seed of an id');
  assert.equal(lookHash('abc').toString(16), '1a47e90b', 'FNV-1a');
});

test('each layer draws on its own: an enchantment or a mark leaves the patterns and the other tiles alone', () => {
  const item = sword(9), px = paintLook(lookOf(item));
  for (const other of [{ ...item, gen: { ...item.gen, enchant: 'icky' } }, { ...item, gen: { ...item.gen, affixes: [{ id: 'force', tier: 1, value: 20 }] } }]) {
    const o = paintLook(lookOf(other));
    assert.deepEqual(tileOf(o, 2), tileOf(px, 2), 'the trim');
    assert.deepEqual(tileOf(o, 3), tileOf(px, 3), 'the facets');
  }
  // a rarer roll of the same name: the same patterns under the rarity's work
  const plain = paintLook({ ...lookOf(item), rarity: 'vanilla' }), rare = paintLook({ ...lookOf(item), rarity: 'decent' });
  const differ = tileOf(plain, 1).filter((v, i) => v !== tileOf(rare, 1)[i]).length;
  assert.ok(differ > 0 && differ <= 16 * 4, `only the inlay's row changes (${differ})`);
});

test('the best rarities show fewer marks: their runes and filigree speak', () => {
  const look = { ...lookOf(sword(4)), marks: ['sharp', 'brutal', 'swift', 'leech', 'force'] };
  for (const [rarity, shown] of [['unusual', 3], ['fabled', 2], ['impossible', 1], ['omg', 1]]) {
    const all = paintLook({ ...look, rarity }), some = paintLook({ ...look, rarity, marks: look.marks.slice(0, shown) });
    assert.ok(same(all, some), `${rarity}: ${shown}`);
  }
});

test('every quest thing is made of something of its own', () => {
  for (const q of QUEST_ITEMS) {
    const json = readGlb(resolve(assets, q.model.replace(/^assets\//, ''))).json;
    if (json.materials.some(m => m.name === 'Items_Clay')) assert.ok(QUEST_STUFF[q.id], q.id);
  }
});

test('thin parts take more texels: enough across, up to twice as many', () => {
  // a box 1 x 0.5 x 0.5 and, apart, a blade 1 x 0.05 x 0.01 (two triangles of each, enough)
  const quad = (x0, y0, w, h, z = 0) => [x0, y0, z, x0 + w, y0, z, x0, y0 + h, z, x0 + w, y0 + h, z, x0 + w, y0, z, x0, y0 + h, z];
  const box = [...quad(0, 0, 1, 0.5), ...quad(0, 0, 1, 0.5, 0.5)], blade = quad(3, 0, 0.05, 1, 0).map((v, i) => i % 3 === 2 ? v + (i % 9 === 2 ? 0.01 : 0) : v);
  const s = partScales(Float32Array.from([...box, ...blade]), null, 40);
  assert.equal(s[0], 40, 'a broad part keeps the model\'s');
  assert.equal(s.at(-1), Math.min(40 * BOOST, MIN_ACROSS / 0.05), 'a thin one more');
  // a small part inside a big one's box goes with it
  const inner = quad(0.2, 0.1, 0.02, 0.02, 0.5);
  assert.equal(partScales(Float32Array.from([...box, ...inner]), null, 40).at(-1), 40);
});
