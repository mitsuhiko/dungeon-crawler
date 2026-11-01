// Prepare the model first, then commit visual + inventory equipment together. The hand holds the
// weapon, or a flask readied to throw (core/inventory.js readyItem; game/throws.js) instead.
// Armor goes on and off at once (game/armor.js puts it on the hero).
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { ITEMS } from '../core/items.js';
import { ownedItem, equipItem, addInstance, readyItem, wearItem, takeOffItem, wornItem } from '../core/inventory.js';
import { rollWeapon, rollArmor } from '../core/gear/generate.js';
import { displayName } from '../core/gear/stats.js';
import { RARITIES } from '../core/gear/rarities.js';
import { ENCHANTS } from '../core/gear/enchants.js';
import { dropAtFeet } from './loot.js';
import { equippedWeapon, canChangeWeapon, readiedFlask } from '../core/combat.js';
import { prepareSword, equipSword } from '../render/character.js';
import { tr } from '../i18n/i18n.js';

let request = 0;
export const equipmentAllowed = () => !state.transitioning && !state.equipping && canChangeWeapon(player);
export async function syncEquippedWeapon() {
  const token = ++request, inventory = player.inventory, flask = readiedFlask(player), def = flask ?? equippedWeapon(player);
  state.equipping = true;
  try {
    const model = def ? await prepareSword(def.model) : null;
    // (in its look, core/looks.js: the weapon's own, a flask's kind's)
    if (token === request && inventory === player.inventory) equipSword(model, flask ? flask.id : ownedItem(inventory, inventory.equipped));
  } finally { if (token === request) state.equipping = false; }
}
export async function equipOwnedWeapon(instanceId) {
  if (!equipmentAllowed()) { setStatus(tr('Finish your current action before changing weapons')); return false; }
  const inventory = player.inventory, slot = ownedItem(inventory, instanceId), def = ITEMS[slot?.itemId];
  if (!def?.weapon) return false;
  const token = ++request;
  state.equipping = true;
  try {
    const model = await prepareSword(def.model);
    if (token !== request || inventory !== player.inventory || !canChangeWeapon(player) || state.transitioning
        || ownedItem(inventory, instanceId) !== slot) return false;
    equipItem(inventory, instanceId); equipSword(model, slot); sfx('equip');
    setStatus(tr('Equipped {item}', { item: displayName(slot) }));
    return true;
  } catch (error) {
    console.error('weapon failed to load', error);
    setStatus(tr('Could not load this weapon; your previous sword is still equipped'));
    return false;
  } finally { if (token === request) state.equipping = false; }
}
// put on the piece of armor `instanceId` (instead of what was in its slot)
export function wearArmor(instanceId) {
  const slot = ownedItem(player.inventory, instanceId);
  if (!wearItem(player.inventory, instanceId)) return false;
  sfx('equip', { pitch: 0.8 }); sfx('clink', { pitch: 0.6, volume: 0.6 });
  setStatus(tr('Wearing {item}', { item: displayName(slot) }));
  return true;
}
// take off what is worn in `slot` (it stays in the bag)
export function takeOffArmor(slot) {
  const was = wornItem(player.inventory, slot);
  if (!takeOffItem(player.inventory, slot)) return false;
  sfx('toss', { volume: 0.5 });
  setStatus(tr('Took off {item}', { item: displayName(was) }));
  return true;
}
// Take flask `itemId` in hand to throw it (null: put it away, the weapon back in hand).
export async function readyFlask(itemId) {
  const inventory = player.inventory, def = itemId && ITEMS[itemId];
  if (!equipmentAllowed()) { setStatus(tr('Finish your current action first')); return false; }
  if (itemId && !readyItem(inventory, itemId)) { setStatus(tr('No {item} left', { item: def ? tr(def.name) : tr('flask') })); return false; }
  if (!itemId) readyItem(inventory, null);
  await syncEquippedWeapon();
  if (inventory !== player.inventory) return false;
  sfx(itemId ? 'toss' : 'equip', { volume: 0.6 });
  // (touch controls, game/touch.js: aimed with the action button)
  const how = globalThis.document?.body.classList.contains('touch') ? tr('aim with the action button') : tr('click where to throw it');
  setStatus(itemId ? tr('{item} in hand: {how}', { item: tr(def.name), how }) : tr('{item} back in hand', { item: displayName(equippedItemOf(inventory)) || tr('Weapon') }));
  return true;
}
const equippedItemOf = inv => ownedItem(inv, inv.equipped);
// dev tools (?dev=1): roll a weapon of this base, rarity and item level into the bag and
// equip it, or drop one at your feet
const devRoll = (itemId, rarity, ilvl) => rollWeapon(Math.random, ilvl, { itemId, rarity });
export async function devSwapWeapon(itemId, rarity = 'vanilla', ilvl = 1) {
  if (!state.dev || !ITEMS[itemId]?.weapon || !equipmentAllowed()) return false;
  const id = addInstance(player.inventory, devRoll(itemId, rarity, ilvl));
  if (!id) { setStatus(tr('Inventory is full')); return false; }
  return equipOwnedWeapon(id);
}
export function devDropWeapon(itemId, rarity = 'unusual', ilvl = 8) {
  if (!state.dev || !ITEMS[itemId]?.weapon) return null;
  return dropAtFeet(devRoll(itemId, rarity, ilvl));
}
// dev tools: roll a piece of armor into the bag and put it on, or drop one at your feet
export function devWearArmor(itemId, rarity = 'vanilla', ilvl = 1) {
  if (!state.dev || !ITEMS[itemId]?.armor) return false;
  const id = addInstance(player.inventory, rollArmor(Math.random, ilvl, { itemId, rarity }));
  if (!id) { setStatus(tr('Inventory is full')); return false; }
  return wearArmor(id);
}
export function devDropArmor(itemId, rarity = 'unusual', ilvl = 8) {
  if (!state.dev || !ITEMS[itemId]?.armor) return null;
  return dropAtFeet(rollArmor(Math.random, ilvl, { itemId, rarity }));
}
// dev tools: n rolls of weapon or armor `itemId` at your feet, a rarity each from the worst to the
// best (and round again), every other weapon enchanted: their looks side by side (core/looks.js;
// many more at once: tests/browser/looks.html)
export function devDropLooks(itemId, n = 10, ilvl = 20) {
  const def = ITEMS[itemId];
  if (!state.dev || !(def?.weapon || def?.armor)) return 0;
  for (let i = 0; i < n; i++) {
    const rarity = RARITIES[i % RARITIES.length].id;
    const item = (def.weapon ? rollWeapon : rollArmor)(Math.random, ilvl, { itemId, rarity });
    if (def.weapon && i % 2) item.gen.enchant = ENCHANTS[(i >> 1) % ENCHANTS.length].id;
    dropAtFeet(item);
  }
  return n;
}
// dev tools: put headwear on the player (a Vanilla one, into the bag: hats are head armor), or
// take off what is on the head (null). Only headwear: the player's hands carry the weapon.
export function devWear(itemId) {
  if (!state.dev) return false;
  if (itemId == null) { takeOffArmor('head'); return true; }
  if (ITEMS[itemId]?.slot !== 'head') { setStatus(tr('Only headwear on the player')); return false; }
  return devWearArmor(itemId, 'vanilla', 1);
}
