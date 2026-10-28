import { createInventory, addInstance, addItem, equipItem, wearItem, assignBar, whole } from './inventory.js';
import { OLD_SWORD, TOWN_PORTAL, ROOM_PORTAL, TOOLS, HEALTH_POTION } from './items.js';
import { fixedWeapon, rollWeapon, rollArmor } from './gear/generate.js';
import { wornTotals } from './gear/stats.js';
import { createPotionState } from './potions.js';
import { createQuestLog } from './quests.js';
import { noteKill } from './respawn.js';
import { START_CLOCK } from './daycycle.js';

// The player's numbers. docs/balance.md explains the targets; tools/balance.mjs plays them through.
//   a level costs XP_BASE + XP_STEP (L - 1) + XP_CURVE (L - 1)² XP, so the first levels come in a
//     few kills and later ones take about one depth each
//   maximum health: HP + HP_PER_LEVEL per level; weapon damage: + DAMAGE_PER_LEVEL per level
//   regeneration: REGEN of the maximum per second, after REGEN_DELAY s without damage
// learn: stronger.html#formula #levels (see learn/README.md)
export const PLAYER = { HP: 100, HP_PER_LEVEL: 10, DAMAGE_PER_LEVEL: 0.02,
  XP_BASE: 500, XP_STEP: 1000, XP_CURVE: 60, REGEN: 0.04, REGEN_DELAY: 5 };
// learn: code.html#functions, stronger.html#curve #formula (see learn/README.md)
export const xpToNext = level => PLAYER.XP_BASE + PLAYER.XP_STEP * (level - 1) + PLAYER.XP_CURVE * (level - 1) ** 2;
// the XP that reaching `level` takes in all: the sum of xpToNext below it
export const xpForLevel = level => {
  const n = level - 1;
  return PLAYER.XP_BASE * n + PLAYER.XP_STEP * n * (n - 1) / 2 + PLAYER.XP_CURVE * (n - 1) * n * (2 * n - 1) / 6;
};
// learn: code.html#functions, stronger.html#levels (see learn/README.md)
export const maxHealth = level => PLAYER.HP + PLAYER.HP_PER_LEVEL * (level - 1);
// ... and with what the armor worn adds (core/gear/stats.js wornTotals)
export const fullHealth = (level, inventory) => maxHealth(level) + wornTotals(inventory).life;
// the maximum health after the armor worn changed: health gained comes with it (like a level),
// health lost takes off only what is now over the maximum
export function refreshMaxHp(p) {
  const max = fullHealth(p.level, p.inventory), was = p.maxHp;
  if (max === was) return false;
  p.maxHp = max;
  if (p.hp > 0) p.hp = Math.min(max, p.hp + Math.max(0, max - was));
  return true;
}
// what the player's level multiplies weapon damage by
// learn: code.html#functions, combat.html#damage, stronger.html#levels (see learn/README.md)
export const levelDamage = level => 1 + PLAYER.DAMAGE_PER_LEVEL * (level - 1);
export function levelFromXP(xp) {
  whole(xp);
  let lo = 1, hi = 2;
  while (xpForLevel(hi) <= xp) hi *= 2;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xpForLevel(mid) <= xp) lo = mid; else hi = mid; }
  return lo;
}
// What a kill is worth against the player's level: enemies more than two levels below give
// less and less (a tenth at the least), so going back up to farm does not pay; enemies above
// give a tenth more per level, up to half again.
// learn: stronger.html#curve #farming (see learn/README.md)
export function xpScale(playerLevel, enemyLevel) {
  const d = playerLevel - enemyLevel;
  return (d < 0 ? 10 + Math.min(5, -d) : Math.max(1, 10 - 2 * Math.max(0, d - 2))) / 10;   // in tenths: exact
}
export function xpProgress(p) {
  return { current: p.xp - xpForLevel(p.level), required: xpToNext(p.level) };
}
// a new run: the glassmaker's old sword in hand (armed), the town portal scroll on quick bar slot 1,
// a few health potions on slot 2 and the room portal scroll on the last slot; with the dev tools
// (dev: true) also DEV_GOLD gold, OMG item-level-99 plate armor, a staff and triple flail,
// with the staff equipped, both weapons on the quick bar, and god mode.
// A new hero in the game starts empty-handed
// (armed: false; core/save.js createHero, game/flow.js): the sword is found in the merchant camp
// (core/intro.js). The tests' heroes and the dev tools' have it in hand.
export const START_POTIONS = 3, DEV_GOLD = 5000;
const BAR_SLOTS = { [TOWN_PORTAL.id]: 0, [ROOM_PORTAL.id]: 5 };
// every hero carries the tools (core/items.js TOOLS): a hero saved before one existed gets it
// (on its quick bar slot, if that is free); a full bag waits for room
export function carryTools(inventory) {
  for (const t of TOOLS) {
    if (inventory.slots.some(s => s?.itemId === t.id)) continue;
    const id = addInstance(inventory, { itemId: t.id }), slot = BAR_SLOTS[t.id];
    if (id && slot !== undefined && !inventory.bar[slot]) assignBar(inventory, slot, id);
  }
  return inventory;
}
export function createPlayerStats(dev = false, { armed = true } = {}) {
  const inventory = createInventory();
  if (dev) addItem(inventory, 'item_coin_gold', DEV_GOLD);
  if (dev) {
    const staff = addInstance(inventory, rollWeapon(() => .5, 99, { itemId: 'weapon_staff_arcane', rarity: 'omg' }));
    const flail = addInstance(inventory, rollWeapon(() => .5, 99, { itemId: 'weapon_flail_triple', rarity: 'omg' }));
    equipItem(inventory, staff);
    assignBar(inventory, 2, staff); assignBar(inventory, 3, flail);
    for (const itemId of ['armor_head_great', 'armor_body_plate', 'armor_shield_tower', 'armor_feet_greaves'])
      wearItem(inventory, addInstance(inventory, rollArmor(() => .5, 99, { itemId, rarity: 'omg' })));
  } else if (armed) equipItem(inventory, addInstance(inventory, fixedWeapon(OLD_SWORD.id)));
  carryTools(inventory);
  addItem(inventory, HEALTH_POTION.id, START_POTIONS);
  assignBar(inventory, 1, inventory.slots.find(s => s?.itemId === HEALTH_POTION.id).instanceId);
  const hp = fullHealth(1, inventory);
  return { xp: 0, level: 1, maxHp: hp, hp, god: dev, lastDamageAt: -Infinity, toxic: null, ...createPotionState(), inventory };
}
// defeated: enemy IDs; loot: cube key -> pickups lying there (game/loot.js); chests: the reward
// sites whose chests are open (game/chests.js); townPortal: the open town portal, if any
// (game/townportal.js); quests: the world's quest log (core/quests.js); clock: the world's play time
// (s, main.js); kills: the ordinary kills, for them to come back (core/respawn.js)
// loot: the pickups on the floor per cube (game/loot.js); dropped: the drops (their sources) that came
// trials: what a trial room keeps that its gate cannot (a sunken room's stages drained: key -> count)
// smith: the Smith's armor for sale (core/shops.js smithStock): how often we came back to town
// (visit) and what of this visit's we bought (sold: indices)
// learn: memory.html#notes (see learn/README.md)
export const createRun = () => ({ defeated: new Set(), unlockedGates: new Set(), loot: new Map(), dropped: new Set(), chests: new Set(), townPortal: null, trials: new Map(),
  quests: createQuestLog(), clock: START_CLOCK, kills: new Map(), smith: { visit: 0, sold: [] },
  told: new Set() });   // the narrator's lines said in this world (core/narration.js ids, game/narrator.js)
// learn: stronger.html#xp-code (see learn/README.md)
export function awardXP(p, amount) {
  whole(amount);
  const xp = whole(p.xp + amount), oldLevel = p.level, oldMax = p.maxHp;
  p.xp = xp; p.level = levelFromXP(xp); p.maxHp = fullHealth(p.level, p.inventory);
  if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp - oldMax);
  return p.level - oldLevel;
}
// XP is granted at once; the coins are only returned: they drop as loot to be picked up. Some
// pay nothing (`noReward`: a boss's proxies, those that left); a boss's summoned minions pay once
// (`awarded`) but are never remembered as defeated (they never come back anyway).
// learn: stronger.html#xp-code (see learn/README.md)
export function awardKill(p, run, enemy) {
  if (enemy.mode !== 'dead' || enemy.hp !== 0 || !enemy.id || enemy.noReward || enemy.awarded || run.defeated.has(enemy.id)) return null;
  const xp = whole(Math.round(enemy.profile.xp * xpScale(p.level, enemy.level || 1))), coins = whole(enemy.coinDrop);
  whole(p.xp + xp);   // validate before mutating any state
  const levels = awardXP(p, xp);
  if (enemy.summoned) enemy.awarded = true; else { run.defeated.add(enemy.id); noteKill(run, enemy); }
  if (enemy.guardian && enemy.guardianGate) run.unlockedGates.add(enemy.guardianGate);
  return { xp, coins, levels };
}
// p.god (dev: /god on, game/devcommands.js): nothing takes any health
export function takeDamage(p, amount, time) {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Invalid damage');
  if (amount > 0 && !p.god) { p.hp = Math.max(0, p.hp - amount); p.lastDamageAt = time; }
}
// no regeneration while poisoned (core/status.js); armor of Licking Wounds heals faster
export function regenerate(p, dt, time) {
  if (p.hp > 0 && !p.toxic && time - p.lastDamageAt >= PLAYER.REGEN_DELAY)
    p.hp = Math.min(p.maxHp, p.hp + PLAYER.REGEN * (1 + wornTotals(p.inventory).regen / 100) * p.maxHp * dt);
}
