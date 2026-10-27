import { ITEMS, COINS, ARMOR_SLOTS } from './items.js';
import { tc } from '../i18n/i18n.js';

// A slot holds { instanceId, itemId, count, gen? }. `gen` is a generated item's own data
// (core/gear/): a slot with it is one unique item and never stacks.
// The quick bar (keys 1-6) holds references into the bag, not items: { itemId } for stackables
// (any stack of that item; the slot stays when none are left) and { instanceId } for unique
// items (it clears when that item leaves the bag).
// `equipped` is the weapon (an instance); `readied` a flask in hand instead of it, by item id
// (any stack of it), until none is left or the weapon is taken again (game/equipment.js).
// `worn` is the armor, one instance per slot (core/items.js ARMOR_SLOTS: head, body, shield,
// feet; null: nothing there). Like the weapon, what is worn stays in the bag.

export const BAG_SIZE = 24, BAR_SIZE = 6;
export function whole(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Expected a non-negative safe integer');
  return n;
}
// learn: memory.html#bag-code (see learn/README.md)
export function createInventory() {
  return { slots: Array(BAG_SIZE).fill(null), currency: COINS.map(c => ({ itemId: c.id, count: 0 })),
    bar: Array(BAR_SIZE).fill(null), equipped: null, readied: null, worn: emptyWorn(), nextInstance: 1, version: 0 };
}
export const emptyWorn = () => Object.fromEntries(ARMOR_SLOTS.map(s => [s, null]));
export const copperTotal = inv => whole(inv.currency.reduce((n, s) => n + s.count * ITEMS[s.itemId].value, 0));
// learn: code.html#math (see learn/README.md)
export function coinCounts(copper) {
  whole(copper);
  return [Math.floor(copper / 1000), Math.floor(copper % 1000 / 10), copper % 10];
}
// learn: code.html#functions (see learn/README.md)
export function formatCoins(copper) {
  return coinCounts(copper).map((n, i) => n ? `${n}${tc('coin', COINS[i].suffix)}` : '').filter(Boolean).join(' ') || `0${tc('coin', 'c')}`;
}
function setCopper(inv, total) {
  coinCounts(total).forEach((count, i) => { inv.currency[i].count = count; });
  inv.version++;
}
export function addCopper(inv, amount) {
  whole(amount);
  const total = whole(copperTotal(inv) + amount);
  if (amount) setCopper(inv, total);
  return true;
}
// learn: code.html#decisions (see learn/README.md)
export function spendCopper(inv, amount) {
  whole(amount);
  const total = copperTotal(inv);
  if (total < amount) return false;
  if (amount) setCopper(inv, total - amount);
  return true;
}
export const ownedItem = (inv, instanceId) => inv.slots.find(s => s?.instanceId === instanceId) || null;
export const equippedItem = inv => ownedItem(inv, inv.equipped);
export function equipItem(inv, instanceId) {
  const slot = ownedItem(inv, instanceId);
  if (!slot || !ITEMS[slot.itemId]?.weapon) return false;
  if (inv.equipped !== instanceId || inv.readied) { inv.equipped = instanceId; inv.readied = null; inv.version++; }
  return true;
}
// Put on the piece of armor `instanceId` (in its slot, instead of what was there); false: not
// armor in the bag
export function wearItem(inv, instanceId) {
  const slot = ownedItem(inv, instanceId), a = ITEMS[slot?.itemId]?.armor;
  if (!a) return false;
  inv.worn ??= emptyWorn();
  if (inv.worn[a.slot] !== instanceId) { inv.worn[a.slot] = instanceId; inv.version++; }
  return true;
}
// take off what is worn in `slot` (it stays in the bag)
export function takeOffItem(inv, slot) {
  if (!inv.worn?.[slot]) return false;
  inv.worn[slot] = null; inv.version++;
  return true;
}
// the armor slots with nothing worn in them (armor drops lean towards them: core/gear/drops.js)
export const bareSlots = inv => ARMOR_SLOTS.filter(s => !inv.worn?.[s]);
export const isWorn = (inv, instanceId) => !!instanceId && Object.values(inv.worn ?? {}).includes(instanceId);
// the armor worn in `slot` (its bag slot), or null
export const wornItem = (inv, slot) => ownedItem(inv, inv.worn?.[slot]);
function forgetWorn(inv, instanceId) {
  for (const k of Object.keys(inv.worn ?? {})) if (inv.worn[k] === instanceId) inv.worn[k] = null;
}
// how many of item `itemId` the bag holds, over all its stacks
export const countOf = (inv, itemId) => inv.slots.reduce((n, s) => n + (s?.itemId === itemId ? s.count : 0), 0);
// a bag slot holding item `itemId` (the first), or null
export const slotOf = (inv, itemId) => inv.slots.find(s => s?.itemId === itemId) || null;
// Take a throwable flask in hand (null: put it away, back to the weapon). false: there is none.
export function readyItem(inv, itemId) {
  if (itemId && (ITEMS[itemId]?.use !== 'throw' || !countOf(inv, itemId))) return false;
  if (inv.readied !== itemId) { inv.readied = itemId; inv.version++; }
  return true;
}
// the flask in hand, while there is one left
export const readiedItem = inv => inv.readied && countOf(inv, inv.readied) ? ITEMS[inv.readied] : null;
// the last of a readied flask gone: back to the weapon
function forgetReadied(inv, itemId) { if (inv.readied === itemId && !countOf(inv, itemId)) inv.readied = null; }

// All-or-nothing: a full bag never consumes a reward or partially inserts an item.
// learn: memory.html#bag (see learn/README.md)
export function addItem(inv, itemId, count = 1) {
  whole(count);
  const def = ITEMS[itemId];
  if (!def) throw new TypeError(`Unknown item: ${itemId}`);
  if (def.category === 'currency') return addCopper(inv, whole(count * def.value));
  const capacity = inv.slots.reduce((n, s) => n + (!s ? def.stackLimit : s.itemId === itemId ? def.stackLimit - s.count : 0), 0);
  if (capacity < count) return false;
  let left = count;
  for (const s of inv.slots) if (left && s?.itemId === itemId && s.count < def.stackLimit) {
    const take = Math.min(left, def.stackLimit - s.count); s.count += take; left -= take;
  }
  for (let i = 0; left && i < inv.slots.length; i++) if (!inv.slots[i]) {
    const take = Math.min(left, def.stackLimit);
    inv.slots[i] = { instanceId: `item-${inv.nextInstance++}`, itemId, count: take }; left -= take;
  }
  if (count) inv.version++;
  return true;
}
// a single item instance ({ itemId, gen }) into the first free slot; its instanceId, or null
// when the bag is full
// learn: memory.html#bag (see learn/README.md)
export function addInstance(inv, item) {
  const def = ITEMS[item?.itemId];
  if (!def) throw new TypeError(`Unknown item: ${item?.itemId}`);
  if (def.category === 'currency') throw new TypeError('Coins are not instances');
  if (!item.gen) return addItem(inv, item.itemId, item.count ?? 1) ? inv.slots.findLast(s => s?.itemId === item.itemId).instanceId : null;
  const i = inv.slots.indexOf(null);
  if (i < 0) return null;
  const instanceId = `item-${inv.nextInstance++}`;
  inv.slots[i] = { instanceId, itemId: item.itemId, count: 1, gen: item.gen };
  inv.version++;
  return instanceId;
}
// the instance `instanceId` in the bag becomes item ({ itemId, gen }) where it is: same slot, same
// instanceId, so whatever points at it (in hand, worn, on the quick bar) points at the new one.
// false: not in the bag
export function replaceInstance(inv, instanceId, item) {
  const slot = ownedItem(inv, instanceId);
  if (!slot || !ITEMS[item?.itemId]) return false;
  Object.assign(slot, { itemId: item.itemId, count: item.count ?? 1 });
  if (item.gen) slot.gen = item.gen; else delete slot.gen;
  inv.version++;
  return true;
}
// would item ({ itemId, count, gen? }) go into the bag now? (coins always do)
export function fits(inv, item) {
  const def = ITEMS[item?.itemId];
  if (!def) return false;
  if (def.category === 'currency') return true;
  if (item.gen) return hasRoom(inv);
  const capacity = inv.slots.reduce((n, s) => n + (!s ? def.stackLimit : s.itemId === item.itemId ? def.stackLimit - s.count : 0), 0);
  return capacity >= (item.count ?? 1);
}
// a bound item (a portal scroll) never leaves the bag
export const isBound = itemId => !!ITEMS[itemId]?.bound;
// the whole slot out of the bag (unequipping it): { itemId, count, gen? }, or null (also for
// bound items)
// learn: memory.html#bag (see learn/README.md)
export function takeItem(inv, instanceId) {
  const i = inv.slots.findIndex(s => s?.instanceId === instanceId);
  if (i < 0 || isBound(inv.slots[i].itemId)) return null;
  const { itemId, count, gen } = inv.slots[i];
  inv.slots[i] = null;
  if (inv.equipped === instanceId) inv.equipped = null;
  forgetBar(inv, instanceId); forgetReadied(inv, itemId); forgetWorn(inv, instanceId);
  inv.version++;
  return gen ? { itemId, count, gen } : { itemId, count };
}
export const hasRoom = inv => inv.slots.includes(null);

export function removeItem(inv, instanceId, count = 1) {
  whole(count);
  const i = inv.slots.findIndex(s => s?.instanceId === instanceId);
  if (i < 0 || inv.slots[i].count < count) return false;
  if (!count) return true;
  const { itemId } = inv.slots[i];
  inv.slots[i].count -= count;
  if (!inv.slots[i].count) {
    inv.slots[i] = null;
    if (inv.equipped === instanceId) inv.equipped = null;
    forgetBar(inv, instanceId); forgetReadied(inv, itemId); forgetWorn(inv, instanceId);
  }
  inv.version++;
  return true;
}
// `count` of item `itemId` out of the bag, from as many stacks as it takes (the last ones first);
// all or nothing: false when there are fewer
export function spendItem(inv, itemId, count = 1) {
  whole(count);
  if (countOf(inv, itemId) < count) return false;
  let left = count;
  for (let i = inv.slots.length - 1; left && i >= 0; i--) {
    const s = inv.slots[i];
    if (s?.itemId === itemId) { const take = Math.min(left, s.count); removeItem(inv, s.instanceId, take); left -= take; }
  }
  return true;
}

// Quick bar: weapons (equip on use) and items with a use action.
export const barAllowed = itemId => !!(ITEMS[itemId]?.weapon || ITEMS[itemId]?.use);
// learn: memory.html#references (see learn/README.md)
const barRef = slot => ITEMS[slot.itemId].stackLimit > 1 && !slot.gen ? { itemId: slot.itemId } : { instanceId: slot.instanceId };
const sameRef = (a, b) => !!a && !!b && a.itemId === b.itemId && a.instanceId === b.instanceId;
function forgetBar(inv, instanceId) {
  inv.bar.forEach((r, i) => { if (r?.instanceId === instanceId) inv.bar[i] = null; });
}
// Put the bag item on bar slot `index`, moving it from any other slot; on the slot it already
// has, take it off. false: no such item, or it cannot go on the bar.
// learn: memory.html#bag (see learn/README.md)
export function assignBar(inv, index, instanceId) {
  if (!Number.isInteger(index) || index < 0 || index >= BAR_SIZE) throw new RangeError('No such quick bar slot');
  const slot = ownedItem(inv, instanceId);
  if (!slot || !barAllowed(slot.itemId)) return false;
  const ref = barRef(slot), already = sameRef(inv.bar[index], ref);
  inv.bar.forEach((r, i) => { if (sameRef(r, ref)) inv.bar[i] = null; });
  if (!already) inv.bar[index] = ref;
  inv.version++;
  return true;
}
// A usable stackable (a potion) coming into the bag goes on the first free bar slot, unless it is
// on the bar already, or another of its `family` is (one kind of health potion, of buff, of
// flask, ... goes on by itself; the player can put more on). Whether it is on the bar now.
export function autoBar(inv, itemId) {
  const def = ITEMS[itemId];
  if (!def?.use || def.stackLimit <= 1) return false;
  if (inv.bar.some(r => r?.itemId === itemId)) return true;
  if (def.family && inv.bar.some(r => r?.itemId && ITEMS[r.itemId].family === def.family)) return false;
  const i = inv.bar.indexOf(null), slot = inv.slots.find(s => s?.itemId === itemId);
  if (i < 0 || !slot) return false;
  return assignBar(inv, i, slot.instanceId);
}
// the bar slot holding this bag item (-1: none)
export const barIndexOf = (inv, slot) => !slot ? -1 : inv.bar.findIndex(r => sameRef(r, barRef(slot)));
// What bar slot `index` stands for: { itemId, slot: the bag slot using it takes (null when none
// is left), count }, or null when it is empty.
// learn: memory.html#references (see learn/README.md)
export function barEntry(inv, index) {
  const ref = inv.bar[index];
  if (!ref) return null;
  const slots = ref.itemId ? inv.slots.filter(s => s?.itemId === ref.itemId && !s.gen) : [ownedItem(inv, ref.instanceId)].filter(Boolean);
  if (!ref.itemId && !slots.length) return null;
  return { itemId: ref.itemId ?? slots[0].itemId, slot: slots[0] ?? null, count: slots.reduce((n, s) => n + s.count, 0) };
}
