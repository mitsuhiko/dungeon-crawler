// What the villagers sell or do (world/town.js VILLAGERS, by name). Clicking a villager with a
// shop walks up to them and opens the bag with their wares beside it (game/inventory.js); an item
// is bought for its price in copper (shopPrice: its `price`, core/items.js, grown with the shop's
// level like the Smith's prices), change given. A shop with a `service`
// works on your weapons instead (core/crafting.js): the Enchanter's wares are her enchantments
// (`wares`: their ids), the Smith re-rolls the affix you point at. A shop with `stock` sells
// generated things (the Smith: armor, smithStock), each one of a kind. `hello`: what they say
// when the bag opens. Pure.
import { ITEMS, POTIONS, ARMOR_SLOTS } from './items.js';
import { addItem, addInstance, hasRoom, spendCopper, copperTotal } from './inventory.js';
import { ENCHANTS } from './gear/enchants.js';
import { rollArmor } from './gear/generate.js';
import { RARITY } from './gear/rarities.js';
import { BASE } from './gear/bases.js';
import { roundPrice, PRICE_GROWTH } from './crafting.js';
import { mulberry32, hash32 } from './util.js';
import { depthLevel } from './enemies.js';

export const SHOPS = {
  // the potion seller in the wizard hat: every potion and flask there is
  alchemist: { title: 'Alchemist', trade: 'Potions', wares: POTIONS.map(p => p.id), hello: 'what will it be?' },
  // the one with the crystal ball: an enchantment on a weapon, for copper and crystals
  enchanter: { title: 'Enchanter', trade: 'Enchantments', service: 'enchant', wares: ENCHANTS.map(e => e.id),
    hello: 'pick a weapon from your bag, then an enchantment.' },
  // at the anvil: armor for sale, and one affix of a weapon or a piece of armor re-rolled, for copper
  smith: { title: 'Smith', trade: 'Armor and re-rolls', service: 'reroll', stock: 'armor', wares: [],
    hello: 'armor for sale. Or show me something of yours, and the line you want hammered.' },
};
// how close (cells) the player has to be to a villager to trade
export const TRADE_REACH = 1.4;
export const shopOf = villager => SHOPS[villager?.name] ?? null;
export const priceOf = itemId => ITEMS[itemId]?.price ?? null;
// What it costs at a shop of `level` (the item level of the deepest depth reached in the world,
// core/enemies.js depthLevel: what the Smith forges at, shopLevel): the level-1 price grown like
// the Smith's and the Enchanter's (core/crafting.js PRICE_GROWTH), so a potion costs about as
// much of what a depth pays all the way down. null: it is not for sale.
export const shopLevel = (deepest, world = 1) => depthLevel(deepest, world);
export function shopPrice(itemId, level = 1) {
  const p = priceOf(itemId);
  return p === null ? null : roundPrice(p * (1 + PRICE_GROWTH * (Math.max(1, level) - 1)));
}
// Buy `count` of `itemId` at a shop of `level`, all or nothing: 'ok', or why not: 'poor' (not
// enough coins), 'full' (no room in the bag), 'unknown' (it has no price)
export function buy(inv, itemId, count = 1, level = 1) {
  const price = shopPrice(itemId, level);
  if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(count) || count < 1) return 'unknown';
  if (copperTotal(inv) < price * count) return 'poor';
  if (!addItem(inv, itemId, count)) return 'full';
  spendCopper(inv, price * count);
  return 'ok';
}

// --- the Smith's armor ---------------------------------------------------------------------------
// What the Smith has for sale: STOCK_SIZE pieces of armor, one for every slot and the rest any,
// of the item level of the deepest depth anyone got to in this world (core/quests.js `deepest`;
// in a world of level `world`, core/enemies.js depthLevel),
// never better than Unusual (the great ones are found, not bought). He forges new ones each time
// you come back to town (`visit`, game/smith.js); what you bought is gone until then (`sold`).
// Seeded by the world seed, the depth and the visit: the same for a visit, whatever you do.
export const STOCK_SIZE = 6, STOCK_BEST = 'unusual';
// what a piece costs at item level 1 (Vanilla), by slot; it grows like the Smith's other prices
// (core/crafting.js PRICE_GROWTH), with rarity (ARMOR_RARITY_PRICE) and for the heavier bases (a
// base that drops from item level 5 costs 60% more: BASE_PRICE a level)
export const ARMOR_PRICE = { head: 60, body: 120, shield: 80, feet: 50 }, BASE_PRICE = 0.15;
export const ARMOR_RARITY_PRICE = { crap: 0.4, shitty: 0.6, vanilla: 1, unremarkable: 1.15, decent: 1.6, unusual: 2.5,
  remarkable: 4, fabled: 7, impossible: 12, omg: 20 };
export function armorPrice(item) {
  const a = ITEMS[item?.itemId]?.armor, ilvl = Math.max(1, item?.gen?.ilvl ?? 1);
  if (!a) return null;
  return roundPrice(ARMOR_PRICE[a.slot] * (1 + PRICE_GROWTH * (ilvl - 1)) * (ARMOR_RARITY_PRICE[item.gen?.rarity] ?? 1)
    * (1 + BASE_PRICE * ((BASE[item.itemId]?.minLevel ?? 1) - 1)));
}
// [{ item: { itemId, count, gen }, price }]
export function smithStock(seed, depth, visit = 0, world = 1) {
  const ilvl = shopLevel(depth, world);
  const R = mulberry32(hash32((seed >>> 0) ^ Math.imul(ilvl, 0x9e3779b1) ^ Math.imul(visit + 1, 0x85ebca6b) ^ 0x5317));
  const slots = [...ARMOR_SLOTS, ...Array.from({ length: STOCK_SIZE - ARMOR_SLOTS.length }, () => null)];
  return slots.map(slot => {
    const item = rollArmor(R, ilvl, { slot, maxRank: RARITY[STOCK_BEST].rank });
    return { item, price: armorPrice(item) };
  });
}
// Buy one of the stock (all or nothing): 'ok', 'poor', 'full'
export function buyStock(inv, ware) {
  if (copperTotal(inv) < ware.price) return 'poor';
  if (!hasRoom(inv)) return 'full';
  addInstance(inv, structuredClone(ware.item));
  spendCopper(inv, ware.price);
  return 'ok';
}
