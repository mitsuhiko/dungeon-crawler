// The weapon (and armor) generator. A roll goes through fixed steps, each driven by a table:
//   rarity (rarities.js, shifted up by item level and luck) -> base type (bases.js, gated by
//   item level) -> affixes (affixes.js: count from the rarity, tier from the item level)
//   -> name (names.js)
// It is pure and seeded: the same rng gives the same item. The result is plain JSON:
//   { itemId, count: 1, gen: { v, rarity, ilvl, affixes: [{ id, tier, value }], name } }
// Items keep what they rolled (not their seed), so tuning the tables later leaves weapons
// already found alone. GEN_VERSION marks which generator made an item.
import { ITEMS } from '../items.js';
import { RARITY, RARITIES, rollRarity } from './rarities.js';
import { rollBase, rollArmorBase, baseTags } from './bases.js';
import { rollAffixes } from './affixes.js';
import { itemName } from './names.js';

export const GEN_VERSION = 1;
export const MAX_ILVL = 99;

const level = ilvl => Math.max(1, Math.min(MAX_ILVL, Math.floor(ilvl) || 1));

// opts: rarity (an id: forces it), itemId (forces the base), kind (only that kind of weapon, any
// of its bases: rollBase), favor (a kind of weapon the base leans towards: rollBase), and the
// rarity odds options (luck, floor, guardian: see rarityOdds)
// learn: loot.html#generate-code (see learn/README.md)
export function rollWeapon(rng, ilvl, opts = {}) {
  ilvl = level(ilvl);
  const rarity = opts.rarity ? RARITY[opts.rarity] : rollRarity(rng, ilvl, opts);
  if (!rarity) throw new TypeError(`Unknown rarity: ${opts.rarity}`);
  const itemId = opts.itemId ?? rollBase(rng, ilvl, opts.favor, opts.kind).itemId, def = ITEMS[itemId];
  if (!def?.weapon) throw new TypeError(`Not a weapon: ${itemId}`);
  const affixes = rollAffixes(rng, rarity.affixes, ilvl, baseTags(itemId), rarity.tierBonus);
  return { itemId, count: 1, gen: { v: GEN_VERSION, rarity: rarity.id, ilvl, affixes, name: itemName(rarity.id, def.name, rng) } };
}

// A piece of armor, the same steps with the armor's bases (bases.js ARMOR_BASES) and words.
// opts: rarity, itemId, slot (only that slot), favor (a list of slots the base leans towards:
// rollArmorBase), maxRank (the best rarity it may be: a rarer roll comes down to it, the
// Smith's wares), and the rarity odds options
export function rollArmor(rng, ilvl, opts = {}) {
  ilvl = level(ilvl);
  let rarity = opts.rarity ? RARITY[opts.rarity] : rollRarity(rng, ilvl, opts);
  if (!rarity) throw new TypeError(`Unknown rarity: ${opts.rarity}`);
  if (opts.maxRank !== undefined && rarity.rank > opts.maxRank) rarity = RARITIES[opts.maxRank];
  const itemId = opts.itemId ?? rollArmorBase(rng, ilvl, opts.favor, opts.slot).itemId, def = ITEMS[itemId];
  if (!def?.armor) throw new TypeError(`Not armor: ${itemId}`);
  const affixes = rollAffixes(rng, rarity.affixes, ilvl, baseTags(itemId), rarity.tierBonus);
  return { itemId, count: 1, gen: { v: GEN_VERSION, rarity: rarity.id, ilvl, affixes, name: itemName(rarity.id, def.name, rng, true) } };
}

// a fixed item, not rolled (the glassmaker's old sword, found in the merchant camp)
export const fixedWeapon = (itemId, rarity = 'vanilla', name = ITEMS[itemId].name) =>
  ({ itemId, count: 1, gen: { v: GEN_VERSION, rarity, ilvl: 1, affixes: [], name } });
