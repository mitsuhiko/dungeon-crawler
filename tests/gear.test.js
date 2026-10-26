import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS, OLD_SWORD, WEAPONS, WEAPON_KINDS, isMelee } from '../src/core/items.js';
import { RARITIES, RARITY, rarityOdds, rollRarity } from '../src/core/gear/rarities.js';
import { AFFIXES, AFFIX, MAX_PREFIXES, MAX_SUFFIXES, MAX_TIER, affixTier, describeAffix } from '../src/core/gear/affixes.js';
import { BASES, BASE, FAVOR } from '../src/core/gear/bases.js';
import { rollWeapon, fixedWeapon, GEN_VERSION } from '../src/core/gear/generate.js';
import { weaponDrops, armorDrops, potionDrops, crystalDrops, enemyDrops, dropChance, potionChance, guardianDrops } from '../src/core/gear/drops.js';
import { itemStats, displayName, baseLine, affixLines, affixEntries, weaponDps, ilvlDamage, ARC, CRIT_CHANCE, CRIT_DAMAGE } from '../src/core/gear/stats.js';
import { createInventory, addInstance, takeItem, equipItem, equippedItem, hasRoom } from '../src/core/inventory.js';
import { createPlayerStats } from '../src/core/progression.js';
import { swordState, combatStats, startSwing, advanceSwing, swordHit } from '../src/core/combat.js';
import { SPIDER, STUNDER, TRIANGLE, ENEMY_KINDS, RENEW, makeEnemy, guardianLevel } from '../src/core/enemies.js';

const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('rarities run from Crap to OMG, each with its own colour and stronger than the last', () => {
  assert.deepEqual(RARITIES.map(r => r.id), ['crap', 'shitty', 'vanilla', 'unremarkable', 'decent', 'unusual', 'remarkable', 'fabled', 'impossible', 'omg']);
  assert.deepEqual(RARITIES.map(r => r.name), ['Crap', 'Shitty', 'Vanilla', 'Unremarkable', 'Decent', 'Unusual', 'Remarkable', 'Fabled', 'Impossible', 'OMG']);
  assert.equal(new Set(RARITIES.map(r => r.css)).size, RARITIES.length);
  for (const r of RARITIES) assert.match(r.css, /^#[0-9a-f]{6}$/);
  for (let i = 1; i < RARITIES.length; i++) {
    const a = RARITIES[i - 1], b = RARITIES[i];
    assert.equal(b.rank, i);
    assert.ok(b.damage > a.damage && b.affixes >= a.affixes && (b.rank <= RARITY.decent.rank || b.weight < a.weight));
    if (b.glow && a.glow) assert.ok(b.glow.ring >= a.glow.ring && b.glow.halo >= a.glow.halo && b.glow.beam >= a.glow.beam);
  }
  // the bottom four neither glow nor roll affixes (an Unremarkable weapon is just that); the rest do
  for (const r of RARITIES.slice(0, 4)) { assert.equal(r.glow, null, r.id); assert.equal(r.affixes, 0, r.id); }
  for (const r of RARITIES.slice(4)) assert.ok(r.glow && r.affixes > 0, r.id);
  assert.ok(RARITY.impossible.glow.light && RARITY.omg.glow.light && !RARITY.fabled.glow.light, 'only the top tiers claim a pooled light');
  assert.deepEqual(RARITIES.filter(r => r.glow?.rainbow).map(r => r.id), ['omg'], 'only OMG is a rainbow');
});

test('rarity odds shift upwards with item level, respect gates, floors and the guardian-only tier', () => {
  for (const ilvl of [1, 3, 5, 9, 14, 20, 40]) for (const opts of [{}, { luck: 0.3, floor: 3, guardian: true }]) {
    const odds = rarityOdds(ilvl, opts);
    assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    RARITIES.forEach((r, i) => { if (ilvl < r.minLevel || r.rank < (opts.floor ?? 0)) assert.equal(odds[i], 0); });
    if (!opts.guardian) assert.equal(odds[RARITY.omg.rank], 0);
  }
  const low = rarityOdds(1), high = rarityOdds(12);
  assert.ok(high[RARITY.unusual.rank] > low[RARITY.unusual.rank] && high[RARITY.crap.rank] < low[RARITY.crap.rank]);
  assert.deepEqual(rarityOdds(1).map(p => p > 0), [true, true, true, true, true, true, false, false, false, false]);
  // the top tiers stay finds even deep down
  const deep = rarityOdds(20);
  assert.ok(deep[RARITY.fabled.rank] < 0.04 && deep[RARITY.impossible.rank] < 0.01, String(deep));
  // a floor above what the item level allows comes down to the best it does allow
  assert.deepEqual(rarityOdds(2, { floor: RARITY.remarkable.rank }).map(p => p > 0), [false, false, false, false, false, true, false, false, false, false]);
  // the rolls follow the odds
  const R = mulberry32(5), n = 40000, seen = new Map();
  for (let i = 0; i < n; i++) { const r = rollRarity(R, 9).id; seen.set(r, (seen.get(r) || 0) + 1); }
  rarityOdds(9).forEach((p, i) => assert.ok(Math.abs((seen.get(RARITIES[i].id) || 0) / n - p) < 0.01, RARITIES[i].id));
});

test('generated weapons are deterministic, plain JSON, and valid for every rarity and level', () => {
  assert.deepEqual(rollWeapon(mulberry32(7), 6), rollWeapon(mulberry32(7), 6));
  const R = mulberry32(11);
  for (const r of RARITIES) for (const ilvl of [1, 4, 8, 13, 19, 30]) for (let k = 0; k < 20; k++) {
    const item = rollWeapon(R, ilvl, { rarity: r.id });
    assert.deepEqual(JSON.parse(JSON.stringify(item)), item);
    assert.equal(item.gen.v, GEN_VERSION); assert.equal(item.gen.rarity, r.id); assert.equal(item.count, 1);
    assert.ok(BASES.some(b => b.itemId === item.itemId && ilvl >= b.minLevel), 'a base allowed at this level');
    assert.equal(item.gen.affixes.length, r.affixes);
    assert.equal(new Set(item.gen.affixes.map(a => a.id)).size, item.gen.affixes.length, 'distinct affixes');
    const kinds = item.gen.affixes.map(a => AFFIX[a.id].kind);
    assert.ok(kinds.filter(k => k === 'prefix').length <= MAX_PREFIXES && kinds.filter(k => k === 'suffix').length <= MAX_SUFFIXES);
    for (const a of item.gen.affixes) {
      assert.equal(a.tier, Math.min(MAX_TIER, affixTier(ilvl) + r.tierBonus));
      const [lo, hi] = AFFIX[a.id].tiers[a.tier - 1];
      assert.ok(a.value >= lo && a.value <= hi, `${a.id} ${a.value} in [${lo}, ${hi}]`);
      assert.ok(describeAffix(a).length);
    }
    assert.ok(item.gen.name.length > 2);
    const s = itemStats(item);
    assert.ok(s.damage >= 1 && s.interval > 0.2 && s.range > 0.5 && s.arc >= ARC && s.crit >= CRIT_CHANCE && s.crit < 0.5
      && s.critDamage >= CRIT_DAMAGE && s.leech >= 0 && s.knockback >= 1);
  }
});

test('every affix tier is an increasing range, and the pool covers the most affixes a rarity needs', () => {
  for (const a of AFFIXES) {
    assert.equal(a.tiers.length, MAX_TIER);
    a.tiers.forEach(([lo, hi], i) => { assert.ok(lo < hi); if (i) assert.ok(lo >= a.tiers[i - 1][0] && hi > a.tiers[i - 1][1]); });
  }
  const most = Math.max(...RARITIES.map(r => r.affixes));
  assert.ok(Math.min(MAX_PREFIXES, AFFIXES.filter(a => a.kind === 'prefix').length)
    + Math.min(MAX_SUFFIXES, AFFIXES.filter(a => a.kind === 'suffix').length) >= most);
  assert.deepEqual([1, 3, 4, 7, 8, 12, 13, 18, 19, 99].map(affixTier), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('names: generated for every rarity, the base under it unless the name says it', () => {
  const R = mulberry32(3);
  for (const r of RARITIES) {
    const item = rollWeapon(R, 20, { rarity: r.id, itemId: 'weapon_sword_long' });
    assert.ok(displayName(item));
    if (r.rank <= RARITY.unremarkable.rank) { assert.match(displayName(item), /Long Sword$/); assert.equal(baseLine(item), null); }
    else assert.equal(baseLine(item), 'Long Sword');
  }
  const names = new Set(many(3000, () => rollWeapon(R, 9, { rarity: 'unusual' }).gen.name.toLowerCase()));
  for (const bad of ['thornthorn', 'hollowhollow', 'boneedge', 'starreaver', 'emberreaver'])
    assert.ok(!names.has(bad), bad);
  assert.ok(names.size > 200, 'plenty of different names');
});

test('stats: item level grows base damage, rarity scales it, affixes add on top', () => {
  const old = fixedWeapon(OLD_SWORD.id);
  assert.deepEqual(old.gen, { v: GEN_VERSION, rarity: 'vanilla', ilvl: 1, affixes: [], name: "Glassmaker's Old Sword" });
  assert.deepEqual(itemStats(old), { kind: 'sword', ranged: false, damage: 30, interval: 0.42, range: 0.85, arc: ARC, crit: CRIT_CHANCE,
    critDamage: CRIT_DAMAGE, leech: 0, knockback: 1, pierce: 0, burst: 0 });
  assert.deepEqual(itemStats({ itemId: OLD_SWORD.id }), itemStats(old), 'a weapon without gen is vanilla');
  const gen = (rarity, affixes, ilvl = 10, itemId = 'weapon_sword_long') => ({ itemId, count: 1, gen: { v: 1, rarity, ilvl, affixes, name: 'x' } });
  assert.equal(ilvlDamage(1), 1); assert.equal(ilvlDamage(11), 1.5);
  assert.equal(itemStats(gen('vanilla', [], 1)).damage, 39);
  assert.equal(itemStats(gen('vanilla', [], 11)).damage, Math.round(39 * 1.5), 'ten item levels: half again');
  assert.equal(itemStats(gen('crap', [])).damage, Math.round(39 * ilvlDamage(10) * 0.75));
  assert.equal(itemStats(gen('omg', [])).damage, Math.round(39 * ilvlDamage(10) * 1.4));
  const s = itemStats(gen('fabled', [{ id: 'sharp', tier: 3, value: 10 }, { id: 'brutal', tier: 3, value: 20 },
    { id: 'swift', tier: 3, value: 10 }, { id: 'reach', tier: 3, value: 0.15 }]));
  assert.equal(s.damage, Math.round((39 * ilvlDamage(10) * 1.24 + 10) * 1.2));
  assert.equal(s.interval, 0.432); assert.equal(s.range, 1.2);
  const t = itemStats(gen('remarkable', [{ id: 'vicious', tier: 2, value: 6 }, { id: 'precision', tier: 2, value: 25 },
    { id: 'leech', tier: 2, value: 3 }, { id: 'force', tier: 2, value: 40 }, { id: 'sweeping', tier: 2, value: 20 }]));
  assert.deepEqual([t.crit, t.critDamage, t.leech, t.knockback, t.arc], [CRIT_CHANCE + 0.06, 1.75, 3, 1.4, ARC * 1.2]);
  // the heavy bases sweep wider; their damage per second rises a little with weight
  assert.equal(itemStats(gen('vanilla', [], 1, 'weapon_sword_broad')).arc, ARC * 1.25);
  const swords = WEAPONS.slice(1).filter(w => w.weapon.kind === 'sword');
  const dps = swords.map(w => weaponDps(itemStats(gen('vanilla', [], 1, w.id))));
  for (let i = 1; i < dps.length; i++) assert.ok(dps[i] >= dps[i - 1] - 1, `${swords[i].id}`);
  assert.ok(dps.at(-1) / dps[0] < 1.3, 'no base outclasses the others');
  const fast = WEAPONS.find(w => w.id === 'weapon_sword_short').weapon, slow = WEAPONS.find(w => w.id === 'weapon_sword_greatsword').weapon;
  assert.ok(fast.interval < 0.35 && slow.interval > 0.6 && slow.range > fast.range + 0.4);
  assert.deepEqual(affixLines(gen('unusual', [{ id: 'reach', tier: 1, value: 0.06 }])), ['+0.06 reach']);
  assert.deepEqual(affixEntries(gen('unusual', [{ id: 'sharp', tier: 1, value: 3 }, { id: 'reach', tier: 1, value: 0.06 }])),
    [{ name: 'Pointy', text: '+3 damage' }, { name: 'of Long Arms', text: '+0.06 reach' }]);
  assert.equal(itemStats({ itemId: 'item_potion_health', count: 1 }), null);
});

test('bows, crossbows and staffs: five bases each, ranged, weaker per second than swords of their weight', () => {
  const gen = (itemId, affixes = [], ilvl = 1) => ({ itemId, count: 1, gen: { v: 1, rarity: 'vanilla', ilvl, affixes, name: 'x' } });
  const dpsOf = id => weaponDps(itemStats(gen(id)));
  const swordDps = WEAPONS.filter(w => w.weapon.kind === 'sword' && w.id !== OLD_SWORD.id).map(w => dpsOf(w.id));
  for (const kind of ['bow', 'crossbow', 'staff']) {
    const list = WEAPONS.filter(w => w.weapon.kind === kind);
    assert.equal(list.length, 5, kind);
    assert.equal(BASES.filter(b => ITEMS[b.itemId].weapon.kind === kind).length, 5, `every ${kind} drops`);
    assert.ok(BASES.some(b => ITEMS[b.itemId].weapon.kind === kind && b.minLevel === 1), `a ${kind} from item level 1`);
    for (const w of list) {
      const s = itemStats(gen(w.id));
      assert.ok(s.ranged && s.kind === kind && s.range >= 4, w.id);
      assert.ok(dpsOf(w.id) < Math.max(...swordDps), `${w.id} does less per second than the heaviest sword`);
      if (kind === 'staff') assert.ok(s.burst > 0 && /^#[0-9a-f]{6}$/.test(s.color), w.id);
      if (kind !== 'crossbow') assert.equal(s.pierce, 0, w.id);
    }
    const dps = list.map(w => dpsOf(w.id)).sort((a, b) => a - b);
    assert.ok(dps.at(-1) / dps[0] < 1.5, `no ${kind} outclasses the others`);
  }
  assert.ok(WEAPONS.some(w => w.weapon.pierce > 0), 'some crossbows pierce');
  // melee-only affixes never roll on ranged bases and the other way round; Distance stretches range
  const R = mulberry32(21);
  for (let k = 0; k < 400; k++) {
    const item = rollWeapon(R, 20, { rarity: 'omg' }), ranged = !isMelee(ITEMS[item.itemId].weapon.kind);
    for (const a of item.gen.affixes) assert.ok(AFFIX[a.id].tags.includes(ranged ? 'ranged' : 'melee'), `${a.id} on ${item.itemId}`);
  }
  // drops lean towards the kind you fight with: about two in five of them once every kind drops
  const share = (favor, n = 8000) => { const R2 = mulberry32(5); let k = 0;
    for (let i = 0; i < n; i++) if (ITEMS[rollWeapon(R2, 12, { favor }).itemId].weapon.kind === (favor ?? 'bow')) k++;
    return k / n; };
  assert.ok(Math.abs(share(null) - 0.2) < 0.02 && Math.abs(share('bow') - FAVOR / (FAVOR + 4)) < 0.02, `${share(null)} ${share('bow')}`);
  assert.deepEqual(weaponDrops({ id: 'g', level: 9, guardian: true, guardianRole: 'side' }, 4, 'staff'),
    weaponDrops({ id: 'g', level: 9, guardian: true, guardianRole: 'side' }, 4, 'staff'), 'still seeded');
  assert.equal(itemStats(gen('weapon_bow_long', [{ id: 'distance', tier: 3, value: 25 }])).range, 10);
  assert.deepEqual(affixLines(gen('weapon_bow_long', [{ id: 'distance', tier: 3, value: 25 }])), ['+25% range']);
});

test('flails: five bases, melee, wide and shoving, their balls striking in turn; from Renew on', () => {
  const gen = (itemId, ilvl = 1) => ({ itemId, count: 1, gen: { v: 1, rarity: 'vanilla', ilvl, affixes: [], name: 'x' } });
  assert.deepEqual(WEAPON_KINDS, ['sword', 'flail', 'bow', 'crossbow', 'staff']);
  const list = WEAPONS.filter(w => w.weapon.kind === 'flail'), swords = WEAPONS.filter(w => w.weapon.kind === 'sword');
  assert.equal(list.length, 5);
  assert.deepEqual(list.map(w => w.weapon.balls ?? 1), [1, 1, 2, 1, 3]);
  const widest = Math.max(...swords.map(w => itemStats(gen(w.id)).arc)), dps = list.map(w => weaponDps(itemStats(gen(w.id))));
  for (const w of list) {
    const s = itemStats(gen(w.id));
    assert.ok(isMelee(s.kind) && !s.ranged && s.arc > widest && s.knockback > 1, w.id);
    assert.equal(s.balls, w.weapon.balls > 1 ? w.weapon.balls : undefined);
    assert.equal(BASE[w.id].minLevel >= 7, true, 'none before Renew\'s depth');
    assert.deepEqual(BASE[w.id].tags, ['flail', 'melee']);
  }
  assert.ok(Math.max(...dps) / Math.min(...dps) < 1.3, 'no flail outclasses the others');
  // with more balls, each hits for less, but together for more
  const twin = itemStats(gen('weapon_flail_twin')), star = itemStats(gen('weapon_flail_morningstar'));
  assert.ok(twin.damage < star.damage && weaponDps(twin) > weaponDps(star));
  // the melee affixes roll on them
  const R = mulberry32(3);
  for (let k = 0; k < 200; k++) {
    const item = rollWeapon(R, 12, { rarity: 'omg', kind: 'flail' });
    assert.equal(ITEMS[item.itemId].weapon.kind, 'flail');
    for (const a of item.gen.affixes) assert.ok(AFFIX[a.id].tags.includes('melee'), a.id);
  }
  // Renew always drops one, whatever you fight with; the twin morning star among them too
  const level = guardianLevel(5, 'descent'), seen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const [first] = weaponDrops({ id: 'renew', level, kind: RENEW, guardian: true, guardianRole: 'descent' }, seed, 'bow');
    assert.equal(ITEMS[first.itemId].weapon.kind, 'flail', `seed ${seed}`);
    seen.add(first.itemId);
  }
  assert.ok(seen.has('weapon_flail_twin') && seen.size >= 4, [...seen].join());
  // and nobody else drops them up there
  for (let k = 0; k < 400; k++) assert.notEqual(ITEMS[rollWeapon(R, 6).itemId].weapon.kind, 'flail');
});

test('drops: seeded per enemy and world, likelier from tougher kinds, guardians always drop', () => {
  assert.equal(dropChance(30), 0.05); assert.equal(potionChance(30), 0.03);
  assert.ok(dropChance(SPIDER.xp) < dropChance(STUNDER.xp) && dropChance(STUNDER.xp) < dropChance(TRIANGLE.xp));
  assert.ok(Object.values(ENEMY_KINDS).every(k => dropChance(k.xp) <= 0.15 && potionChance(k.xp) <= 0.1));
  const e = { id: '0,-4,0:spider:17', level: 3, kind: SPIDER };
  assert.deepEqual(weaponDrops(e, 9), weaponDrops(e, 9));
  assert.deepEqual(enemyDrops(e, 9), [...weaponDrops(e, 9), ...armorDrops(e, 9), ...potionDrops(e, 9), ...crystalDrops(e, 9)]);
  for (const kind of [SPIDER, STUNDER, TRIANGLE]) {
    const n = 20000, ids = many(n, i => ({ id: `k:${kind.type}:${i}`, level: 6, kind }));
    const weapons = ids.reduce((a, x) => a + weaponDrops(x, 1).length, 0), potions = ids.reduce((a, x) => a + potionDrops(x, 1).length, 0);
    assert.ok(Math.abs(weapons / n - dropChance(kind.xp)) < 0.01, `${kind.type}: ${weapons / n}`);
    assert.ok(Math.abs(potions / n - potionChance(kind.xp)) < 0.01, `${kind.type}: ${potions / n}`);
  }
  // which potion: one of those that drop at the enemy's level, health potions the likeliest
  const kinds = new Map();
  for (const d of many(3000, i => potionDrops({ id: `p:${i}`, level: 2, kind: TRIANGLE }, 3)).flat()) {
    assert.equal(d.count, 1); assert.ok(ITEMS[d.itemId].level <= 2, d.itemId);
    kinds.set(d.itemId, (kinds.get(d.itemId) ?? 0) + 1);
  }
  assert.ok(kinds.size > 2 && [...kinds].every(([id, n]) => id === 'item_potion_health' || n < kinds.get('item_potion_health')));
  // the world seed matters: same ids in another world drop other things
  const ids = many(400, i => ({ id: `0,-2,0:snake:${i}`, level: 5 }));
  assert.notDeepEqual(ids.map(e => weaponDrops(e, 1)), ids.map(e => weaponDrops(e, 2)));
  for (const [role, level, count, least, potions] of [['side', 1, 1, 'decent', 1], ['side', 9, 1, 'decent', 1], ['side', 10, 1, 'unusual', 1],
    ['descent', 1, 2, 'decent', 2], ['descent', 5, 2, 'unusual', 2], ['descent', 14, 2, 'remarkable', 2], ['descent', 22, 2, 'remarkable', 2]]) {
    assert.equal(guardianDrops(role, level).count, count);
    for (let i = 0; i < 50; i++) {
      const g = { id: `${i},0,0:guardian`, level, guardian: true, guardianRole: role }, drops = weaponDrops(g, 4);
      assert.equal(drops.length, count);
      for (const d of drops) assert.ok(RARITY[d.gen.rarity].rank >= RARITY[least].rank, `${role} L${level}: ${d.gen.rarity}`);
      const got = potionDrops(g, 4);
      assert.equal(got.reduce((n, d) => n + d.count, 0), potions);
      assert.ok(got.every(d => ITEMS[d.itemId].category === 'potion' && ITEMS[d.itemId].level <= level));
    }
  }
  // OMG only from guardians
  for (let i = 0; i < 3000; i++) for (const d of weaponDrops({ id: `x:${i}`, level: 40 }, 3)) assert.notEqual(d.gen.rarity, 'omg');
});

test('instances: own slots, taken out whole, equipped ones unequip, and a full bag refuses', () => {
  const p = createPlayerStats(), inv = p.inventory, first = equippedItem(inv);
  assert.equal(first.itemId, OLD_SWORD.id); assert.equal(first.gen.name, "Glassmaker's Old Sword"); assert.equal(first.gen.rarity, 'vanilla');
  const item = rollWeapon(mulberry32(1), 5, { rarity: 'remarkable' }), id = addInstance(inv, item);
  const slot = inv.slots.find(s => s?.instanceId === id);
  assert.deepEqual(slot.gen, item.gen); assert.equal(slot.count, 1);
  assert.ok(equipItem(inv, id)); assert.equal(combatStats(p).damage, itemStats(item).damage);
  assert.deepEqual(takeItem(inv, id), item);
  assert.equal(inv.equipped, null); assert.equal(combatStats(p), null, 'no weapon: no attacks');
  assert.equal(takeItem(inv, id), null);
  assert.deepEqual(takeItem(inv, first.instanceId), fixedWeapon(OLD_SWORD.id));
  const full = createInventory();
  for (let i = 0; i < full.slots.length; i++) assert.ok(addInstance(full, item));
  assert.ok(!hasRoom(full));
  const before = JSON.stringify(full);
  assert.equal(addInstance(full, item), null); assert.equal(JSON.stringify(full), before);
  assert.throws(() => addInstance(full, { itemId: 'item_coin_gold' }));
  assert.ok(WEAPONS.every(w => ITEMS[w.id] === w));
});

test('crits multiply damage, life on hit heals up to the maximum', () => {
  const p = { ...createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() };
  const inv = p.inventory;
  equipItem(inv, addInstance(inv, { itemId: 'weapon_sword_long', count: 1, gen: { v: 1, rarity: 'vanilla', ilvl: 5, name: 'x',
    affixes: [{ id: 'vicious', tier: 2, value: 10 }, { id: 'leech', tier: 2, value: 3 }, { id: 'precision', tier: 2, value: 50 }] } }));
  const stats = combatStats(p), hit = Math.round(39 * ilvlDamage(5));
  assert.equal(stats.crit, CRIT_CHANCE + 0.1); assert.equal(stats.critDamage, 2); assert.equal(stats.damage, hit);
  const swing = () => { p.sword.cool = 0; startSwing(p); advanceSwing(p, stats.activeStart + .001); };
  p.hp = 50;
  swing(); let e = makeEnemy({ x: 0, y: 0, z: 0.8 }, STUNDER);
  assert.deepEqual(swordHit(p, e, 0.5), { damage: hit, crit: false }); assert.equal(p.hp, 53);
  advanceSwing(p, 5); swing(); e = makeEnemy({ x: 0, y: 0, z: 0.8 }, STUNDER);
  assert.deepEqual(swordHit(p, e, 0.05), { damage: hit * 2, crit: true }); assert.equal(e.hp, STUNDER.hp - hit * 2);
  p.hp = p.maxHp - 1; advanceSwing(p, 5); swing(); swordHit(p, makeEnemy({ x: 0, y: 0, z: 0.8 }, STUNDER), 0.9);
  assert.equal(p.hp, p.maxHp);
});
