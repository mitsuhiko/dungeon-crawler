// Which base types drop, from what item level and how often. A base is an item in
// core/items.js; `tags` decide which affixes may roll on it (core/gear/affixes.js): its kind
// (sword, flail, trident, bow, crossbow, staff) and how it fights (melee or ranged; a trident both).
// To add a dropping weapon: define the item (with its model), then list it here.
// The glassmaker's old sword is never dropped: it waits in the merchant camp (core/intro.js).
// Every kind but the flails and the tridents has a light base from item level 1 and heavier ones
// further down, the heaviest from about item level 12 to 16, so something new turns up all the way
// down; the flails only from item level 7 (Renew's, the time boss, who always drops one: he is the
// first to hand you one), the tridents from 3 (Squarlo's, who drops them more often). A kind's
// weights add up to the same, so each kind is about as likely as the others once all of it drops.
// Rolls lean towards the kind the player fights with (`favor`, FAVOR times its weight): about
// half of the weapons are of that kind, so whatever you use keeps finding upgrades while the
// other kinds still turn up.
import { ITEMS, isMelee } from '../items.js';

const base = (itemId, minLevel, weight = 1, extra = []) => {
  const kind = ITEMS[itemId].weapon.kind;
  return { itemId, minLevel, weight, tags: [kind, isMelee(kind) ? 'melee' : 'ranged', ...extra] };
};

export const BASES = [
  base('weapon_sword_short', 1),
  base('weapon_sword_medium', 1),
  base('weapon_sword_long', 4),
  base('weapon_sword_broad', 8),
  base('weapon_sword_greatsword', 12, 1, ['two-handed']),
  base('weapon_flail_ball', 7),
  base('weapon_flail_morningstar', 9),
  base('weapon_flail_twin', 11),
  base('weapon_flail_knight', 13),
  base('weapon_flail_triple', 15),
  // tridents (melee and ranged: they stab and throw lightning) from depth 3 on, three of them:
  // as likely as a kind of five together (Squarlo's lean towards them: core/gear/drops.js)
  base('weapon_trident_fisher', 3, 5 / 3, ['ranged']),
  base('weapon_trident_sea', 7, 5 / 3, ['ranged']),
  base('weapon_trident_storm', 12, 5 / 3, ['ranged']),
  base('weapon_bow_short', 1),
  base('weapon_bow_hunting', 1),
  base('weapon_bow_recurve', 4),
  base('weapon_bow_long', 8),
  base('weapon_bow_war', 12),
  base('weapon_crossbow_hand', 1),
  base('weapon_crossbow_light', 3),
  base('weapon_crossbow_repeating', 6),
  base('weapon_crossbow_heavy', 9),
  base('weapon_crossbow_arbalest', 14),
  // eight staffs, the lightning staffs from further down: as likely as a kind of five together
  base('weapon_staff_gnarled', 1, 5 / 8),
  base('weapon_staff_oak', 2, 5 / 8),
  base('weapon_staff_ember', 5, 5 / 8),
  base('weapon_staff_spark', 7, 5 / 8),
  base('weapon_staff_crystal', 9, 5 / 8),
  base('weapon_staff_arcane', 12, 5 / 8),
  base('weapon_staff_lightning', 13, 5 / 8),
  base('weapon_staff_thunder', 16, 5 / 8),
];
export const BASE = Object.fromEntries(BASES.map(b => [b.itemId, b]));
// tags for any weapon or armor, including those that never drop
export function baseTags(itemId) {
  if (BASE[itemId]) return BASE[itemId].tags;
  if (ITEMS[itemId]?.armor) return ['armor', ITEMS[itemId].armor.slot];
  const kind = ITEMS[itemId]?.weapon?.kind ?? 'sword';
  return [kind, isMelee(kind) ? 'melee' : 'ranged'];
}

export const FAVOR = 3;
// favor: a kind (sword, flail, trident, bow, crossbow, staff) to lean towards, or null; kind: only that kind,
// any of its bases however deep (a boss's own: Renew's flails, core/gear/drops.js)
export function rollBase(rng, ilvl, favor = null, kind = null) {
  const open = kind ? BASES.filter(b => b.tags[0] === kind) : BASES.filter(b => ilvl >= b.minLevel);
  const weight = b => b.weight * (b.tags[0] === favor ? FAVOR : 1);
  let w = rng() * open.reduce((n, b) => n + weight(b), 0);
  for (const b of open) if ((w -= weight(b)) < 0) return b;
  return open.at(-1);
}

// Armor (core/items.js ARMORS): five of each slot (eight shields: the prow shields from deep
// down), a light one or two from item level 1 and heavier ones further down, and what the villagers wear and carry (core/items.js WEARABLES: light
// head armor, half as likely as a helm each; off-hand things, a little less likely than a shield). Tags: 'armor' and the slot. A roll picks the slot
// first, each as likely, then a base of it by weight; it leans towards the slots the player wears
// nothing in (`favor`: a list of slots, FAVOR times as likely), so an empty slot soon gets something.
const armorBase = (itemId, minLevel, weight = 1) => ({ itemId, minLevel, weight, tags: ['armor', ITEMS[itemId].armor.slot] });
export const ARMOR_BASES = [
  armorBase('armor_head_cap', 1), armorBase('armor_head_skullcap', 2), armorBase('armor_head_nasal', 4),
  armorBase('armor_head_horned', 6), armorBase('armor_head_great', 8),
  armorBase('wear_headscarf', 1, .5), armorBase('wear_hood', 1, .5), armorBase('wear_straw_hat', 1, .5),
  armorBase('wear_explorer_hat', 2, .5), armorBase('wear_wizard_hat', 3, .5), armorBase('wear_miner_helmet', 3, .5),
  armorBase('wear_welding_mask', 4, .5),
  armorBase('held_towel', 1, .4), armorBase('held_feed_bag', 1, .4), armorBase('held_rope', 1, .4),
  armorBase('held_pliers', 2, .4), armorBase('held_hammer', 3, .4), armorBase('held_crystal_ball', 4, .4),
  armorBase('armor_body_padded', 1), armorBase('armor_body_leather', 2), armorBase('armor_body_chain', 4),
  armorBase('armor_body_scale', 6), armorBase('armor_body_plate', 8),
  armorBase('armor_shield_buckler', 1), armorBase('armor_shield_round', 2), armorBase('armor_shield_kite', 4),
  armorBase('armor_shield_heater', 6), armorBase('armor_shield_tower', 8),
  armorBase('armor_shield_prow', 9), armorBase('armor_shield_bulwark', 11), armorBase('armor_shield_aegis', 13),
  armorBase('armor_feet_sandals', 1), armorBase('armor_feet_boots', 1), armorBase('armor_feet_hobnail', 3),
  armorBase('armor_feet_greaves', 5), armorBase('armor_feet_winged', 7),
];
for (const b of ARMOR_BASES) BASE[b.itemId] = b;
// favor: slots to lean towards (an array), or null; slot: only this slot
const draw = (rng, list, weight) => {
  let w = rng() * list.reduce((n, x) => n + weight(x), 0);
  for (const x of list) if ((w -= weight(x)) < 0) return x;
  return list.at(-1);
};
export function rollArmorBase(rng, ilvl, favor = null, slot = null) {
  const open = ARMOR_BASES.filter(b => ilvl >= b.minLevel && (!slot || b.tags[1] === slot));
  const slots = [...new Set(open.map(b => b.tags[1]))];
  const s = slot ?? draw(rng, slots, x => favor?.includes(x) ? FAVOR : 1);
  return draw(rng, open.filter(b => b.tags[1] === s), b => b.weight);
}
