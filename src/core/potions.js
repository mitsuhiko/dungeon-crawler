// Potion rules (core/items.js POTIONS): drinking, the timed effects a drink puts on the drinker,
// each kind's cooldown and how strong a flask is. Pure; game/quickbar.js drinks, game/throws.js
// throws. Times are game time (state.time), which stands still while the bag is open.
//   p.effects: what is working on the player, by key: 'heal:<item>' (health pouring in; two
//     kinds of health potion pour in side by side), 'buff:<stat>' (one per stat: drinking it
//     again starts it over) and 'immune:<status>'
//   p.cooldowns: cooldown (cooldownOf: the item id, 'heal' for every health potion) -> the time it
//     can be used again
import { ITEMS, POTIONS } from './items.js';

// the stats a buff adds a share to: movement speed and jump height (physics/move.js), attack
// speed and damage (core/combat.js)
export const BUFFS = ['moveSpeed', 'attackSpeed', 'damage', 'jump'];
// a flask's damage grows with the player's level as fast as enemies' health grows with theirs
// (core/enemies.js GROWTH), so a flask stays worth throwing
export const FLASK_GROWTH = 0.17;
export const flaskPower = level => 1 + FLASK_GROWTH * (Math.max(1, level || 1) - 1);
// a flask's numbers for a thrower of `level` (might: what a damage buff multiplies them by),
// whole points
export function flaskStats(def, level, might = 1) {
  const f = def.flask, k = flaskPower(level) * might, dot = s => s && { ...s, damage: Math.round(s.damage * k) };
  return { ...f, blast: Math.round((f.blast ?? 0) * k), burn: dot(f.burn), toxin: dot(f.toxin) };
}

export const createPotionState = () => ({ effects: {}, cooldowns: {} });
// Each kind waits for its own cooldown, but the health potions share one (HEAL_COOLDOWN s): what
// heals you, all told, is one potion every so often, whichever it is.
export const HEAL_COOLDOWN = 'heal';
export const cooldownOf = itemId => ITEMS[itemId]?.family === 'heal' ? HEAL_COOLDOWN : itemId;
export const cooldownLeft = (p, itemId, time) => Math.max(0, (p.cooldowns?.[cooldownOf(itemId)] ?? -Infinity) - time);
// the share of the item's cooldown still to wait (0: ready), for the quick bar
export function cooldownShare(p, itemId, time) {
  const c = ITEMS[itemId]?.cooldown;
  return c ? Math.min(1, cooldownLeft(p, itemId, time) / c) : 0;
}
export function startCooldown(p, itemId, time) { p.cooldowns[cooldownOf(itemId)] = time + (ITEMS[itemId].cooldown ?? 0); }

// Drink potion `def` at `time`: puts its effect on p and starts its cooldown. What it does
// ({ heal: the health it pours in }, { cured: whether it ended the status }, { buff }), or why
// not: 'dead', 'wait' (its cooldown), 'full' (a health potion at full health).
export function drinkPotion(p, def, time) {
  const e = def.effect;
  if (p.hp <= 0) return 'dead';
  if (cooldownLeft(p, def.id, time) > 0) return 'wait';
  if (e.heal && p.hp >= p.maxHp) return 'full';
  startCooldown(p, def.id, time);
  const timed = { itemId: def.id, time: e.time, until: time + e.time };
  if (e.heal) {
    const amount = e.heal * p.maxHp;
    p.effects['heal:' + def.id] = { ...timed, kind: 'heal', left: amount, rate: amount / e.time };
    return { heal: Math.min(amount, p.maxHp - p.hp) };
  }
  if (e.cure) {
    const cured = !!p[e.cure];
    p[e.cure] = null;
    if (e.immune) p.effects['immune:' + e.immune] = { ...timed, kind: 'immune', status: e.immune };
    return { cured };
  }
  p.effects['buff:' + e.buff] = { ...timed, kind: 'buff', buff: e.buff, value: e.value };
  return { buff: e.buff };
}

// every step: health pours in, effects run out (a heal always pours in all of it)
export function tickEffects(p, dt, time) {
  for (const [key, f] of Object.entries(p.effects)) {
    if (f.kind === 'heal') {
      const n = time >= f.until ? f.left : Math.min(f.left, f.rate * dt);
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + n);
      f.left -= n;
    }
    if (time >= f.until) delete p.effects[key];
  }
}
// the share a buff adds to `stat` now (0 without one)
export const effectMod = (p, stat) => p.effects?.['buff:' + stat]?.value ?? 0;
export const immuneTo = (p, status) => !!p.effects?.['immune:' + status];
// what is working on p, longest first, for the HUD: [{ key, itemId, left (s), share (of its time) }]
export const activeEffects = (p, time) => Object.entries(p.effects ?? {}).filter(([, f]) => f.kind !== 'heal')
  .map(([key, f]) => ({ key, itemId: f.itemId, left: Math.max(0, f.until - time), share: Math.max(0, f.until - time) / f.time }))
  .sort((a, b) => b.left - a.left);
// death ends them all (the cooldowns stay)
export function clearEffects(p) { p.effects = {}; }

// The potions that drop at item level `level` (enemies' and chests'): those whose `level` it
// reaches, as [def, weight]. Health potions stay the likeliest.
export const potionTable = level => POTIONS.filter(p => p.level <= Math.max(1, level || 1)).map(p => [p, p.weight]);
// one potion's item id, drawn from potionTable(level) with the random source R
export function rollPotion(R, level) {
  const table = potionTable(level), total = table.reduce((n, [, w]) => n + w, 0);
  let r = R() * total;
  for (const [p, w] of table) if ((r -= w) < 0) return p.id;
  return table[table.length - 1][0].id;
}
// n potions drawn at `level`, as stacks: [{ itemId, count }]
export function rollPotions(R, level, n) {
  const counts = new Map();
  for (let i = 0; i < n; i++) { const id = rollPotion(R, level); counts.set(id, (counts.get(id) ?? 0) + 1); }
  return [...counts].map(([itemId, count]) => ({ itemId, count }));
}
