// What a defeated enemy drops besides its coins: maybe a weapon, armor, a potion. Seeded by
// the world seed, the enemy's id and its life (`wave`, core/respawn.js), so the same enemy always
// drops the same thing in one life (also when it comes back after a death, like its coins), and
// something new when it comes back after a while. The item level is the enemy's level, so deeper
// drops hit harder (core/gear/stats.js).
//   ordinary enemies: a weapon 5% of the time and a potion 3%, both × √(its XP / 30): the
//     tougher the kind, the likelier (a spider 4% / 2.5%, a Stunder 8% / 5%, a Triangle 10% / 6%)
//   side guardians: one weapon, at least Decent (Unusual from level 10), and a potion
//   descent guardians: two weapons, at least Decent (Unusual from level 5, Remarkable from 14), and two
//     potions
//   a kind with its own `drops` ({ weapons: false, potion: chance, potions: [item ids] }: Gusto's
//     Custo triangles) drops no weapons and one of `potions` at that chance
//   a guardian with a kind of weapon of its own (`ownWeapon`: Renew's flails) always drops one of
//     them: its first weapon is of that kind (any of its bases, however deep)
//   a guardian that leans towards a kind (`leansTo`: { kind, chance }, Squarlo's tridents): each of
//     its weapons is of that kind that often (any of its bases, however deep), else rolled as ever
// Guardians also roll with luck (rarer results) and are the only source of OMG items.
// Crystals (for the Enchanter, core/gear/enchants.js) on a stream of their own: ordinary enemies
// one 1.5% of the time (× the same √ of their XP), side guardians one, descent guardians two;
// each of the five kinds as likely. Kinds with their own `drops` drop none.
// Armor on a stream of its own too: ordinary enemies a piece ARMOR_CHANCE of the time (× the same √
// of their XP), guardians one each, at least Decent like their weapons. It leans towards the
// slots the player wears nothing in (`bare`, gear/bases.js rollArmorBase).
// Which potion is drawn by the enemy's level (core/potions.js potionTable): mostly health
// potions, the stronger ones and the rest deeper down.
// favor: the kind of weapon the player fights with; drops lean towards it (gear/bases.js).
import { mulberry32, hash32 } from '../util.js';
import { RARITY } from './rarities.js';
import { rollWeapon, rollArmor } from './generate.js';
import { rollPotions } from '../potions.js';
import { CRYSTALS } from '../items.js';

// learn: loot.html#drops (see learn/README.md)
export const WEAPON_CHANCE = 0.05, POTION_CHANCE = 0.03;
// how much more an enemy of base XP `xp` (level 1) drops than a plain one
const worth = xp => Math.sqrt(Math.max(1, xp ?? 30) / 30);
export const dropChance = xp => Math.min(0.15, WEAPON_CHANCE * worth(xp));
export const potionChance = xp => Math.min(0.1, POTION_CHANCE * worth(xp));
export const CRYSTAL_CHANCE = 0.015, ARMOR_CHANCE = 0.04;
export const armorChance = xp => Math.min(0.12, ARMOR_CHANCE * worth(xp));
export const crystalChance = xp => Math.min(0.05, CRYSTAL_CHANCE * worth(xp));

// learn: loot.html#drops (see learn/README.md)
export function guardianDrops(role, level) {
  if (role === 'descent') return { count: 2, floor: RARITY[level >= 14 ? 'remarkable' : level >= 5 ? 'unusual' : 'decent'].rank, luck: 0.2, guardian: true, potions: 2 };
  return { count: 1, floor: RARITY[level >= 10 ? 'unusual' : 'decent'].rank, luck: 0.1, guardian: true, potions: 1 };
}

export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const stream = (enemy, seed, salt) => mulberry32(hash32(hashString(String(enemy.id)) ^ Math.imul(seed >>> 0, 0x9e3779b1) ^ salt
  ^ (enemy.wave ? Math.imul(enemy.wave, 0x85ebca6b) : 0)));

// enemy: { id, level, kind? (its level-1 profile), guardian?, guardianRole? }; seed: the world's
// learn: code.html#loops (see learn/README.md)
export function weaponDrops(enemy, seed = 0, favor = null) {
  const R = stream(enemy, seed, 0x10075);
  const level = Math.max(1, enemy.level || 1);
  if (enemy.kind?.drops?.weapons === false) return [];
  if (!enemy.guardian) return R() < dropChance(enemy.kind?.dropXP ?? enemy.kind?.xp) * (enemy.kind?.dropScale ?? 1) ? [rollWeapon(R, level, { favor })] : [];
  const g = guardianDrops(enemy.guardianRole ?? 'descent', level), out = [];
  const own = enemy.kind?.ownWeapon, lean = enemy.kind?.leansTo;
  for (let i = 0; i < g.count; i++) {
    const kind = own && i === 0 ? own : lean && R() < lean.chance ? lean.kind : null;
    out.push(rollWeapon(R, level, { ...g, favor, ...(kind && { kind }) }));
  }
  return out;
}
// `n` crystals drawn with rng R, each kind as likely: [{ itemId, count }], one entry per kind
export function rollCrystals(R, n) {
  const counts = new Map();
  for (let i = 0; i < n; i++) { const id = CRYSTALS[Math.floor(R() * CRYSTALS.length)].id; counts.set(id, (counts.get(id) ?? 0) + 1); }
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
}
export function crystalDrops(enemy, seed = 0) {
  const R = stream(enemy, seed, 0xc4157a1);
  if (enemy.kind?.drops) return [];
  const n = enemy.guardian ? (enemy.guardianRole ?? 'descent') === 'descent' ? 2 : 1
    : R() < crystalChance(enemy.kind?.dropXP ?? enemy.kind?.xp) * (enemy.kind?.dropScale ?? 1) ? 1 : 0;
  return rollCrystals(R, n);
}
// potions, on a stream of their own (so weapon drops do not depend on them)
export function potionDrops(enemy, seed = 0) {
  const R = stream(enemy, seed, 0x9071), level = Math.max(1, enemy.level || 1), own = enemy.kind?.drops;
  if (own?.potions) return R() < own.potion ? [{ itemId: own.potions[Math.floor(R() * own.potions.length)], count: 1 }] : [];
  const n = enemy.guardian ? guardianDrops(enemy.guardianRole ?? 'descent', level).potions
    : R() < potionChance(enemy.kind?.dropXP ?? enemy.kind?.xp) * (enemy.kind?.dropScale ?? 1) ? 1 : 0;
  return rollPotions(R, level, n);
}
// a piece of armor, or none; bare: the slots the player wears nothing in (drops lean towards them)
export function armorDrops(enemy, seed = 0, bare = null) {
  const R = stream(enemy, seed, 0xa4302), level = Math.max(1, enemy.level || 1);
  if (enemy.kind?.drops) return [];
  if (!enemy.guardian) return R() < armorChance(enemy.kind?.dropXP ?? enemy.kind?.xp) * (enemy.kind?.dropScale ?? 1) ? [rollArmor(R, level, { favor: bare })] : [];
  const g = guardianDrops(enemy.guardianRole ?? 'descent', level);
  return [rollArmor(R, level, { floor: g.floor, luck: g.luck, guardian: true, favor: bare })];
}
// everything but the coins
export const enemyDrops = (enemy, seed = 0, favor = null, bare = null) => [...weaponDrops(enemy, seed, favor), ...armorDrops(enemy, seed, bare),
  ...potionDrops(enemy, seed), ...crystalDrops(enemy, seed)];
