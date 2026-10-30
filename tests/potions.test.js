import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { assetsRoot } from './paths.js';
import { ITEMS, POTIONS, HEALTH_POTION, HEAL_TIME } from '../src/core/items.js';
import { createPlayerStats, regenerate, PLAYER } from '../src/core/progression.js';
import { drinkPotion, tickEffects, effectMod, immuneTo, cooldownLeft, cooldownShare, activeEffects, clearEffects,
  flaskStats, flaskPower, potionTable, rollPotion, rollPotions, BUFFS } from '../src/core/potions.js';
import { addItem, removeItem, takeItem, equipItem, readyItem, readiedItem, autoBar, countOf, slotOf, copperTotal, addCopper } from '../src/core/inventory.js';
import { swordState, combatStats, startSwing, readiedFlask, damageEnemy, KINDS } from '../src/core/combat.js';
import { SHOPS, buy, priceOf, shopPrice } from '../src/core/shops.js';
import { afflict, enemyTick, statusOver, immuneTo as statusImmune, toxinOf } from '../src/core/status.js';
import { blowOf, VENOM_ADDER, BOG_SPIDER, REDBACK, FIRECAT, FIREFACE, FIRE_SHRAPS, SPIDER, makeEnemy, enemyProfile } from '../src/core/enemies.js';
import { launchFlask, stepFlask, arcOf, clampTarget, burstVictims, inArea, flightTime, releasePoint } from '../src/core/throws.js';
import { mulberry32 } from '../src/core/util.js';

const hero = () => ({ ...createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() });
const potion = id => ITEMS[id];
const flasks = POTIONS.filter(p => p.use === 'throw'), drinks = POTIONS.filter(p => p.use === 'drink');

test('every potion is a stackable with a price and a model, a cooldown and a family', () => {
  assert.ok(drinks.length >= 9 && flasks.length === 3);
  assert.ok(POTIONS.filter(p => p.effect?.heal).length >= 4, 'several kinds of health potion');
  for (const p of POTIONS) {
    assert.equal(p.category, 'potion'); assert.equal(p.stackLimit, 99);
    assert.ok(Number.isSafeInteger(p.price) && p.price > 0, p.id);
    assert.ok(p.cooldown > 0 && p.level >= 1 && p.weight > 0 && p.family && p.description, p.id);
    assert.ok(existsSync(resolve(assetsRoot, p.model)), p.model);
    assert.equal(!!p.flask, p.use === 'throw'); assert.equal(!!p.effect, p.use === 'drink');
    if (p.effect) assert.ok(p.effect.time > 0 && (p.effect.heal ? p.effect.time < 1 : p.effect.time >= 10), `${p.id}: health pours in quickly, the rest lasts`);
    if (p.effect?.buff) assert.ok(BUFFS.includes(p.effect.buff));
  }
  assert.deepEqual([...new Set(drinks.filter(p => p.effect.buff).map(p => p.effect.buff))].sort(), [...BUFFS].sort());
  assert.ok(drinks.some(p => p.effect.cure === 'toxic'));
  // the stronger health potions heal more, cost more and drop deeper
  const heals = drinks.filter(p => p.effect.heal).sort((a, b) => a.effect.heal - b.effect.heal);
  for (let i = 1; i < heals.length; i++) assert.ok(heals[i].price > heals[i - 1].price && heals[i].level >= heals[i - 1].level);
  assert.ok(flasks.some(f => f.flask.blast && !f.flask.burn) && flasks.some(f => f.flask.burn && f.flask.patch) && flasks.some(f => f.flask.toxin && f.flask.cloud));
});

test('each kind of potion has its own cooldown, but the health potions share one', () => {
  const p = hero(), minor = potion('item_potion_health_minor'), haste = potion('item_potion_haste');
  p.hp = 10;
  assert.equal(HEALTH_POTION.cooldown, HEAL_TIME); assert.equal(minor.cooldown, HEAL_TIME); assert.equal(haste.cooldown, 1);
  assert.ok(drinkPotion(p, HEALTH_POTION, 5).heal);
  assert.equal(drinkPotion(p, HEALTH_POTION, 5.5), 'wait');
  assert.equal(drinkPotion(p, minor, 5.5), 'wait', 'another kind of health potion waits too');
  assert.ok(drinkPotion(p, haste, 5.5).buff, 'other kinds do not');
  assert.equal(drinkPotion(p, haste, 6), 'wait');
  assert.ok(Math.abs(cooldownLeft(p, minor.id, 5.5) - (HEAL_TIME - 0.5)) < 1e-9);
  assert.ok(Math.abs(cooldownShare(p, HEALTH_POTION.id, 5 + HEAL_TIME * 0.75) - 0.25) < 1e-9);
  assert.equal(cooldownShare(p, HEALTH_POTION.id, 5 + HEAL_TIME), 0);
  assert.ok(drinkPotion(p, minor, 5 + HEAL_TIME).heal);
  // the two heals pour in, all of each
  for (let t = 5; t < 5 + HEAL_TIME + 1; t += 0.05) tickEffects(p, 0.05, t + 0.05);
  assert.ok(Math.abs(p.hp - Math.min(p.maxHp, 10 + (HEALTH_POTION.effect.heal + minor.effect.heal) * p.maxHp)) < 1e-9);
});

test('buffs last their time, quicken and strengthen attacks, and wear off; drinking again starts one over', () => {
  const p = hero(), plain = combatStats(p);
  for (const id of ['item_potion_haste', 'item_potion_might', 'item_potion_swiftness', 'item_potion_leaping']) assert.ok(drinkPotion(p, potion(id), 0).buff);
  assert.equal(effectMod(p, 'moveSpeed'), 0.3); assert.equal(effectMod(p, 'jump'), 0.5);
  const fast = combatStats(p);
  assert.ok(Math.abs(fast.chain - plain.chain / 1.25) < 1e-9 && fast.duration < plain.duration && fast.activeStart < plain.activeStart);
  assert.equal(fast.damage, Math.round(plain.damage * 1.3));
  assert.deepEqual(activeEffects(p, 10).map(f => f.itemId).sort(), ['item_potion_haste', 'item_potion_leaping', 'item_potion_might', 'item_potion_swiftness']);
  assert.ok(activeEffects(p, 10).every(f => f.left === 20 && Math.abs(f.share - 2 / 3) < 1e-9));
  tickEffects(p, 1, 20); assert.ok(drinkPotion(p, potion('item_potion_haste'), 20).buff);
  tickEffects(p, 1, 30);
  assert.equal(effectMod(p, 'damage'), 0, 'run out'); assert.equal(effectMod(p, 'attackSpeed'), 0.25, 'started over at 20');
  tickEffects(p, 1, 50); assert.equal(effectMod(p, 'attackSpeed'), 0);
  assert.deepEqual(combatStats(p), plain);
  drinkPotion(p, potion('item_potion_might'), 60); clearEffects(p); assert.equal(effectMod(p, 'damage'), 0, 'death ends them');
});

test('poison hurts over time and stops regeneration; an antidote cures it and keeps it off', () => {
  const p = hero(), antidote = potion('item_potion_antidote');
  p.hp = 50; p.toxic = afflict({ time: 4, ticks: 4, damage: 20 });
  regenerate(p, 1, 100); assert.equal(p.hp, 50, 'no healing while poisoned');
  assert.deepEqual(drinkPotion(p, antidote, 100), { cured: true });
  assert.equal(p.toxic, null); assert.ok(immuneTo(p, 'toxic'));
  regenerate(p, 1, 100); assert.equal(p.hp, 50 + PLAYER.REGEN * p.maxHp);
  tickEffects(p, 1, 100 + antidote.effect.time); assert.ok(!immuneTo(p, 'toxic'));
  assert.deepEqual(drinkPotion(p, antidote, 200), { cured: false }, 'drunk ahead of time it only protects');
});

test('venomous kinds poison with their bite, fiery ones shrug off fire, and enemy ticks are whole points', () => {
  for (const kind of [VENOM_ADDER, BOG_SPIDER, REDBACK]) {
    const blow = blowOf(enemyProfile(kind, 4));
    assert.ok(blow.toxin && blow.toxin.damage > 0 && blow.toxin.damage < blow.damage * 2, kind.type);
  }
  assert.equal(blowOf(SPIDER).toxin, null);
  assert.deepEqual(toxinOf(null, 10), null);
  for (const kind of [FIRECAT, FIREFACE, FIRE_SHRAPS]) assert.ok(statusImmune({ profile: kind }, 'burning'), kind.type);
  assert.ok(!statusImmune({ profile: SPIDER }, 'burning') && !statusImmune({ profile: FIRECAT }, 'toxic'));
  const d = afflict({ time: 4, ticks: 8, damage: 45 });
  let total = 0;
  for (let t = 0; t < 4.01; t += 0.1) { const n = enemyTick(d, 0.1); assert.ok(Number.isInteger(n)); total += n; }
  assert.ok(statusOver(d)); assert.ok(Math.abs(total - 45) <= 1);
  // a tick hurts without staggering
  const e = makeEnemy({ x: 1, z: 1, y: 0, id: 's', level: 1 }, SPIDER);
  const before = e.hp;
  damageEnemy(e, 3, false);
  assert.equal(e.hp, before - 3); assert.ok(!e.staggered && e.mode !== 'dead');
  damageEnemy(e, e.hp, false); assert.equal(e.mode, 'dead');
});

test('a flask in hand throws instead of the weapon until none are left; its damage grows with the level', () => {
  const p = hero(), inv = p.inventory, blast = potion('item_flask_blast');
  assert.equal(readyItem(inv, blast.id), false, 'none in the bag');
  assert.equal(readyItem(inv, HEALTH_POTION.id), false, 'only flasks');
  addItem(inv, blast.id, 2);
  assert.ok(readyItem(inv, blast.id)); assert.equal(readiedFlask(p), blast);
  const s = combatStats(p);
  assert.equal(s.kind, 'throw'); assert.ok(s.ranged && s.flask === blast.id && s.range === blast.flask.range && s.damage === blast.flask.blast);
  assert.ok(startSwing(p)); assert.equal(KINDS[p.sword.stats.kind].verb, 'Throw');
  assert.equal(flaskStats(blast, 11).blast, Math.round(blast.flask.blast * flaskPower(11)));
  assert.ok(flaskPower(11) > 2.5 && flaskPower(1) === 1);
  const fire = flaskStats(potion('item_flask_fire'), 6, 1.3);
  assert.equal(fire.burn.damage, Math.round(potion('item_flask_fire').flask.burn.damage * flaskPower(6) * 1.3));
  // the last one gone: the weapon again
  removeItem(inv, slotOf(inv, blast.id).instanceId, 1); assert.equal(inv.readied, blast.id);
  removeItem(inv, slotOf(inv, blast.id).instanceId, 1); assert.equal(inv.readied, null); assert.equal(combatStats(p).kind, 'sword');
  addItem(inv, blast.id, 3); readyItem(inv, blast.id);
  takeItem(inv, slotOf(inv, blast.id).instanceId); assert.equal(readiedItem(inv), null, 'dropped');
  addItem(inv, blast.id); readyItem(inv, blast.id);
  equipItem(inv, inv.equipped); assert.equal(inv.readied, null, 'taking the weapon puts it away');
  readyItem(inv, blast.id); readyItem(inv, null); assert.equal(inv.readied, null);
});

test('one potion of a family goes on the quick bar by itself', () => {
  const inv = createPlayerStats().inventory;   // health potions on slot 2
  addItem(inv, 'item_potion_health_minor', 2);
  assert.equal(autoBar(inv, 'item_potion_health_minor'), false, 'a health potion is there already');
  for (const id of ['item_potion_antidote', 'item_potion_haste', 'item_flask_fire']) { addItem(inv, id); assert.ok(autoBar(inv, id), id); }
  for (const id of ['item_potion_might', 'item_flask_toxic']) { addItem(inv, id); assert.equal(autoBar(inv, id), false, id); }
  assert.deepEqual(inv.bar.map(r => r && (r.itemId ?? 'scroll')), ['scroll', HEALTH_POTION.id, 'item_potion_antidote', 'item_potion_haste', 'item_flask_fire', 'scroll']);
});

test('the alchemist sells every potion for its price, all or nothing', () => {
  assert.deepEqual(SHOPS.alchemist.wares, POTIONS.map(p => p.id));
  const inv = createPlayerStats().inventory;
  assert.equal(buy(inv, HEALTH_POTION.id), 'poor');
  addCopper(inv, 100);
  assert.equal(buy(inv, HEALTH_POTION.id, 2), 'ok');
  assert.equal(copperTotal(inv), 100 - 2 * priceOf(HEALTH_POTION.id)); assert.equal(countOf(inv, HEALTH_POTION.id), 3 + 2);
  assert.equal(buy(inv, HEALTH_POTION.id, 2), 'poor'); assert.equal(copperTotal(inv), 20);
  assert.equal(buy(inv, 'item_crystal_ruby'), 'unknown'); assert.equal(buy(inv, HEALTH_POTION.id, 0), 'unknown');
  for (let i = 0; i < 24; i++) addItem(inv, 'weapon_sword_short');
  addCopper(inv, 10000);
  assert.equal(buy(inv, 'item_flask_fire'), 'full'); assert.equal(copperTotal(inv), 10020, 'nothing spent');
  assert.equal(buy(inv, HEALTH_POTION.id), 'ok', 'onto its stack');
  // deeper down they cost more, as the Smith's and the Enchanter's prices do
  assert.equal(shopPrice(HEALTH_POTION.id, 1), priceOf(HEALTH_POTION.id));
  assert.equal(shopPrice(HEALTH_POTION.id, 11), 340);
  assert.equal(shopPrice('item_crystal_ruby', 5), null);
  const before = copperTotal(inv);
  assert.equal(buy(inv, HEALTH_POTION.id, 1, 11), 'ok');
  assert.equal(copperTotal(inv), before - 340);
});

test('drops draw a potion that suits the level, health potions the likeliest', () => {
  assert.deepEqual(potionTable(1).map(([p]) => p.id).sort(), ['item_potion_health', 'item_potion_health_minor']);
  assert.equal(potionTable(30).length, POTIONS.length);
  const R = mulberry32(7), seen = new Map();
  for (let i = 0; i < 20000; i++) { const id = rollPotion(R, 12); seen.set(id, (seen.get(id) ?? 0) + 1); }
  assert.equal(seen.size, POTIONS.length);
  const total = potionTable(12).reduce((n, [, w]) => n + w, 0);
  for (const [p, w] of potionTable(12)) assert.ok(Math.abs(seen.get(p.id) / 20000 - w / total) < 0.01, p.id);
  const stacks = rollPotions(mulberry32(3), 8, 5);
  assert.equal(stacks.reduce((n, s) => n + s.count, 0), 5);
  assert.equal(new Set(stacks.map(s => s.itemId)).size, stacks.length);
  assert.deepEqual(rollPotions(mulberry32(3), 8, 0), []);
});

test('a flask is lobbed onto its target and bursts on what it meets; the arc is the same flight', () => {
  const open = () => false, floor = (x, y) => y < 0;
  const from = { x: 0, y: 1, z: 0 }, to = { x: 4, y: 0, z: 3 };
  const f = launchFlask(from, to);
  assert.ok(f.vy > 0, 'thrown upwards');
  for (let t = 0; t < f.T - 1e-6; t += 0.01) stepFlask(f, Math.min(0.01, f.T - t), [], open);
  assert.ok(Math.hypot(f.x - 4, f.y, f.z - 3) < 1e-6, 'comes down on the target');
  assert.ok(flightTime(6) <= 1 && flightTime(1) < flightTime(6));
  const g = launchFlask(from, to);
  let end = null;
  for (let i = 0; i < 200 && !end; i++) end = stepFlask(g, 1 / 60, [], floor);
  assert.equal(end, 'blocked'); assert.ok(Math.hypot(g.x - 4, g.z - 3) < 0.15 && g.y >= 0);
  const arc = arcOf(from, to, [], floor);
  assert.ok(Math.hypot(arc.end.x - 4, arc.end.z - 3) < 0.15 && arc.points.length > 10 && arc.hit === null);
  // an enemy in the way catches it
  const e = { mode: 'chase', x: 2, y: 0, z: 1.5, profile: { radius: 0.4, bodyHeight: 3 } };
  const hit = arcOf(from, to, [e], floor);
  assert.equal(hit.hit, e); assert.ok(hit.end.x < 2.5);
  // too far: pulled in along the same line
  assert.deepEqual(clampTarget(0, 0, { x: 30, y: 2, z: 40 }, 5), { x: 3, y: 2, z: 4, clamped: true });
  assert.deepEqual(clampTarget(0, 0, { x: 3, y: 2, z: 4 }, 5), { x: 3, y: 2, z: 4 });
  const r = releasePoint({ x: 5, y: 1, z: 5 }, Math.PI / 2);
  assert.ok(r.x > 5 && r.y > 1.5, 'in front of the thrower, up at the hand');
});

test('a burst reaches the living around it, fully at the middle and half at the edge; areas hold what stands in them', () => {
  const body = (x, z, mode = 'chase', y = 0) => ({ mode, x, y, z, profile: { radius: 0.3, bodyHeight: 0.8 } });
  const a = body(0, 0), b = body(1.6, 0), c = body(3, 0), d = body(0.5, 0, 'dead'), up = body(0, 0, 'chase', 5);
  const got = burstVictims({ x: 0, y: 0, z: 0 }, 1.5, [a, b, c, d, up]);
  assert.deepEqual(got.map(v => v.e), [a, b]);
  assert.equal(got[0].share, 1); assert.ok(got[1].share >= 0.5 && got[1].share < 0.6);
  const area = { x: 0, y: 0, z: 0, r: 1 };
  assert.ok(inArea(area, 0.9, 0.2, 0) && inArea(area, 1.2, 0, 0, 0.3) && !inArea(area, 1.5, 0, 0) && !inArea(area, 0, 3, 0));
});
