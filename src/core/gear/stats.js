// A weapon instance's stats: its base type's, grown by its item level and scaled by rarity, then
// changed by its affixes. Combat (core/combat.js) only ever reads these, never the base type.
//   kind: sword, flail, trident, bow, crossbow or staff; ranged: it shoots (core/shots.js) rather than
//   swings (a trident does both: core/combat.js combatStats)
//   damage: (base × item level growth × rarity + flat) × (1 + percent), rounded
//   interval: the time between attacks, shortened by `speed` percent (every attack time with it)
//   range: (+ reach in cells) × (1 + percent); arc: the base's × (1 + percent)
//   crit / critDamage: chance (0..1, CRIT_CHANCE without affixes) and multiplier; leech: life on
//   hit; knockback: multiplier (the base's, a flail's heavier, × its affixes); pierce / burst /
//   color / balls (a flail's: each strikes) / shot / jumps (lightning's): the base's (core/items.js);
//   zap: a trident's lightning from afar, { range (+ the range affixes' percentage), share, jumps }
//   enchant: { id, value }, only when it has one: the Enchanter's (core/gear/enchants.js, game/enchants.js)
import { ITEMS, isMelee } from '../items.js';
import { AFFIX, describeAffix } from './affixes.js';
import { rarityOf } from './rarities.js';
import { ENCHANT, enchantOf, describeEnchant } from './enchants.js';
import { namesBase, sayName } from './names.js';
import { tr, sayAs } from '../../i18n/i18n.js';

export const ARC = Math.PI * 0.42;   // the basic swing arc (core/combat.js SWORD.arc)
// learn: combat.html#damage (see learn/README.md)
export const CRIT_CHANCE = 0.05;     // every weapon crits this often without affixes
// learn: combat.html#damage (see learn/README.md)
export const CRIT_DAMAGE = 1.5;      // a critical hit without affixes
// base damage grows by this share per item level: a weapon found ten depths further down hits
// half again as hard as the same one from the top (enemy health grows 12% a level; the
// player's level adds the rest, core/progression.js)
// learn: loot.html#stats-code (see learn/README.md)
export const ILVL_DAMAGE = 0.05;
// learn: loot.html#stats-code (see learn/README.md)
export const ilvlDamage = ilvl => 1 + ILVL_DAMAGE * (Math.max(1, ilvl || 1) - 1);

// learn: loot.html#stats-code, stronger.html#race (see learn/README.md)
export function itemStats(item) {
  const def = ITEMS[item?.itemId], w = def?.weapon;
  if (!w) return null;
  const sum = { damage: 0, damagePct: 0, speed: 0, arc: 0, crit: 0, critDamage: 0, range: 0, rangePct: 0, leech: 0, knockback: 0 };
  for (const a of item.gen?.affixes ?? []) {
    const { stat, op } = AFFIX[a.id];
    sum[op === 'pct' && (stat === 'damage' || stat === 'range') ? stat + 'Pct' : stat] += a.value;
  }
  const kind = w.kind ?? 'sword', enchant = enchantOf(item), far = 1 + sum.rangePct / 100;
  // (a trident's reach takes the flat reach, its lightning's range the percentage)
  return {
    kind, ranged: !isMelee(kind),
    damage: Math.max(1, Math.round((w.damage * ilvlDamage(item.gen?.ilvl) * rarityOf(item).damage + sum.damage) * (1 + sum.damagePct / 100))),
    interval: Math.round(w.interval * (1 - sum.speed / 100) * 1000) / 1000,
    range: Math.round((w.range + sum.range) * (w.zap ? 1 : far) * 100) / 100,
    ...(w.zap && { zap: { range: Math.round(w.zap.range * far * 100) / 100, share: w.zap.share, jumps: w.zap.jumps ?? 0 } }),
    arc: ARC * w.arc * (1 + sum.arc / 100),
    crit: CRIT_CHANCE + sum.crit / 100,
    critDamage: CRIT_DAMAGE + sum.critDamage / 100,
    leech: sum.leech,
    knockback: (w.knockback ?? 1) * (1 + sum.knockback / 100),
    pierce: w.pierce ?? 0, burst: w.burst ?? 0, ...(w.color && { color: w.color }), ...(w.balls > 1 && { balls: w.balls }),
    ...(w.shot && { shot: w.shot }), ...(w.jumps && { jumps: w.jumps }),
    ...(enchant && { enchant }),
  };
}

// what to call it, and the base type to show under the name (null when the name says it). An
// enchanted weapon wears its enchantment in front of its name ("Toasty Duskfang"); the name it was
// found with stays in `gen.name`, so a new enchantment renames it and an old save shows it too.
// In the language of the moment (core/gear/names.js sayName).
export const displayName = item => sayName(item, ENCHANT[item?.gen?.enchant]?.name ?? null);
// What to keep of an item to say its name later (the chronicle, a friend's news): { item: {
// itemId, gen: { name, rarity, enchant } } }, which say() (src/i18n/i18n.js) turns into its name.
export const itemWords = item => ({ item: { itemId: item.itemId, ...(item.gen && { gen: { name: item.gen.name, rarity: item.gen.rarity,
  ...(item.gen.enchant && { enchant: item.gen.enchant }) } }) } });
sayAs('item', it => ITEMS[it?.itemId] ? (it.gen ? displayName(it) : tr(ITEMS[it.itemId].name)) : '', it => {
  if (!it || typeof it !== 'object' || !Object.hasOwn(ITEMS, it.itemId)) return null;
  const g = it.gen && typeof it.gen === 'object' ? it.gen : null;
  return { itemId: it.itemId, ...(g && typeof g.name === 'string' && { gen: { name: g.name.slice(0, 80), rarity: String(g.rarity ?? 'vanilla').slice(0, 20),
    ...(typeof g.enchant === 'string' && { enchant: g.enchant.slice(0, 20) }) } }) };
});
export const baseLine = item => item?.gen && !namesBase(item.gen.rarity) ? tr(ITEMS[item.itemId].name) : null;
export const affixLines = item => (item?.gen?.affixes ?? []).map(describeAffix);
// ... with each affix's name: [{ name: 'Pointy', text: '+5 damage' }]
export const affixEntries = item => (item?.gen?.affixes ?? []).map(a => ({ name: tr(AFFIX[a.id].name), text: describeAffix(a) }));
// ... and its enchantment: { name: 'Toasty', text: 'Sets things burning ...' } or null
export function enchantEntry(item) {
  const e = enchantOf(item);
  return e && { id: e.id, name: tr(ENCHANT[e.id].name), text: describeEnchant(e.id, e.value) };
}
// damage per second, counting crits (and every ball of a flail striking): what to compare weapons by
export const weaponDps = s => s.damage * (s.balls ?? 1) * (1 + s.crit * (s.critDamage - 1)) / s.interval;
// a trident's lightning: what its throws do per second (null for other weapons)
export const zapDps = s => s.zap ? weaponDps(s) * s.zap.share : null;

// --- armor ---------------------------------------------------------------------------------------
// A piece of armor's stats (core/items.js ARMORS), like a weapon's: its base armor grown by item
// level (ARMOR_GROWTH a level) and scaled by rarity (the weapons' damage factor), then changed by
// its affixes. null for what is not armor.
//   slot; armor; block: percent chance (shields); moveSpeed: percent (boots); life: + maximum
//   health; regen: percent faster healing; burnResist / poisonResist: percent less from burning /
//   poison; steady: percent less shoved about. A base's own `perks` (the hats: core/items.js
//   WEARABLES) count like affixes.
// Armor grows as fast as enemy damage (core/enemies.js GROWTH.damage), and the share of a blow it
// takes off (armorReduction) is reckoned against the level of what struck it: a piece from as deep
// as the enemy takes off as much at every depth, an older one less and less.
export const ARMOR_GROWTH = 0.1, ARMOR_K = 160, MAX_REDUCTION = 0.75;
// a block takes BLOCK_TAKES of the blow, none of its shove or statuses; at most MAX_BLOCK percent
export const BLOCK_TAKES = 0.2, MAX_BLOCK = 50;
export const armorGrowth = level => 1 + ARMOR_GROWTH * (Math.max(1, level || 1) - 1);
const ARMOR_STATS = ['armor', 'block', 'moveSpeed', 'life', 'regen', 'burnResist', 'poisonResist', 'steady'];
export function armorStats(item) {
  const a = ITEMS[item?.itemId]?.armor;
  if (!a) return null;
  const sum = { armor: 0, armorPct: 0, block: 0, moveSpeed: 0, life: 0, regen: 0, burnResist: 0, poisonResist: 0, steady: 0 };
  for (const [k, v] of Object.entries(a.perks ?? {})) sum[k] += v;
  for (const x of item.gen?.affixes ?? []) {
    const { stat, op } = AFFIX[x.id];
    sum[op === 'pct' && stat === 'armor' ? 'armorPct' : stat] += x.value;
  }
  return {
    slot: a.slot,
    armor: Math.max(1, Math.round((a.armor * armorGrowth(item.gen?.ilvl) * rarityOf(item).damage + sum.armor) * (1 + sum.armorPct / 100))),
    block: a.block + sum.block, moveSpeed: a.speed + sum.moveSpeed,
    life: sum.life, regen: sum.regen, burnResist: sum.burnResist, poisonResist: sum.poisonResist, steady: sum.steady,
  };
}
// the share of a blow (0..MAX_REDUCTION) `armor` takes off one from an enemy of `level`
export const armorReduction = (armor, level) => armor > 0 ? Math.min(MAX_REDUCTION, armor / (armor + ARMOR_K * armorGrowth(level))) : 0;
// What everything worn adds up to (inv.worn: core/inventory.js). The shield's block only counts
// while it is in hand (`shield`: false with a bow, it is on the back then). The resistances add
// up to at most 75%.
export function wornTotals(inv, { shield = true } = {}) {
  const out = Object.fromEntries(ARMOR_STATS.map(k => [k, 0]));
  for (const id of Object.values(inv?.worn ?? {})) {
    const s = id && armorStats(inv.slots.find(x => x?.instanceId === id));
    if (s) for (const k of ARMOR_STATS) out[k] += s[k];
  }
  if (!shield) out.block = 0;
  out.block = Math.min(MAX_BLOCK, out.block);
  for (const k of ['burnResist', 'poisonResist', 'steady']) out[k] = Math.min(75, out[k]);
  return out;
}
