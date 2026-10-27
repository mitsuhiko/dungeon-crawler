import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { flatMap } from './fixtures.js';
import { toOklch, fromOklch, parseColor, recolorFn, recolorTable, toHex, toLinear } from '../src/core/oklch.js';
import { ENEMY_KINDS, ENEMY_PROFILES, BOSS_PROFILES, MINION_PROFILES, SNAKE, SAND_VIPER, BLOOD_VIPER, SHADOW_MAMBA, OCTONAUT, SHRAPS, SPICY, enemyKind, enemyRoll, makeEnemy, GROWTH } from '../src/core/enemies.js';
import { DEPTH_SPAWNS } from '../src/core/spawns.js';
import { enemySpots, pickKind } from '../src/game/enemyspawn.js';

const atDepth = (seed, depth) => Object.assign(flatMap(seed), { depth });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} vs ${b}`);
const hueNear = (a, b, eps, msg) => near(Math.abs(((a - b + 540) % 360) - 180), 0, eps, msg);
function materials(species) {
  const b = readFileSync(resolve(assets, species + '.glb'));
  const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
  return Object.fromEntries(json.materials.map(m => [m.name, { color: m.pbrMetallicRoughness.baseColorFactor.slice(0, 3), emissive: m.emissiveFactor }]));
}

test('OKLCH round-trips sRGB and matches the reference values', () => {
  for (let i = 0; i < 200; i++) {
    const rgb = [Math.random(), Math.random(), Math.random()], back = fromOklch(toOklch(rgb));
    rgb.forEach((v, k) => near(back[k], v, 1e-6));
  }
  const red = parseColor('#ff0000');   // CSS Color 4: oklch(62.8% 0.2577 29.23)
  near(red.l, 0.628, 1e-3); near(red.c, 0.2577, 1e-3); near(red.h, 29.23, 0.05);
  assert.deepEqual(parseColor('oklch(50% 0.1 400)'), { l: 0.5, c: 0.1, h: 40 });
  assert.equal(toHex(toLinear('#3a7')), '#33aa77');
  assert.throws(() => parseColor('rebeccapurple'));
});
test('out-of-gamut colours give up chroma, not lightness or hue', () => {
  const rgb = fromOklch({ l: 0.7, c: 0.4, h: 150 }), c = toOklch(rgb);
  assert.ok(rgb.every(v => v >= 0 && v <= 1));
  near(c.l, 0.7, 1e-3); hueNear(c.h, 150, 0.5); assert.ok(c.c < 0.4);
});
test('a colour op moves the anchor to the target and the rest of the role along with it', () => {
  const body = toLinear('oklch(0.84 0.137 133)'), belly = toLinear('oklch(0.71 0.146 135)');
  const f = recolorFn('oklch(0.6 0.15 27)', body), b = toOklch(f(body)), r = toOklch(f(belly));
  near(b.l, 0.6, 1e-3); near(b.c, 0.15, 1e-3); hueNear(b.h, 27, 0.5);
  near(r.l / b.l, 0.71 / 0.84, 2e-3, 'keeps the belly as much darker');
  hueNear(r.h, 29, 0.5, 'turns the hue as far');
  // a grey anchor has no hue to turn: the hue is set
  const grey = [0.035, 0.035, 0.038], g = toOklch(recolorFn('oklch(0.4 0.1 25)', grey)(grey));
  near(g.l, 0.4, 1e-3); near(g.c, 0.1, 2e-3); hueNear(g.h, 25, 0.5);
  // object ops: set, scale, shift
  const o = toOklch(recolorFn({ h: 200, cs: 0.5, dl: -0.1 })(body));
  near(o.l, 0.74, 1e-3); hueNear(o.h, 200, 0.5); near(o.c, 0.137 / 2, 2e-3);
});
test('a recolour table touches only the listed materials, emissive included', () => {
  const m = materials('snake'), parts = SNAKE.parts;
  const t = recolorTable(m, parts, { skin: 'oklch(0.6 0.19 27)', eyes: '#ffd040', SnakeRibs: { l: 0.3 } });
  assert.deepEqual(Object.keys(t).sort(), ['SnakeBody', 'SnakeEyes_glow', 'SnakeRibs']);
  assert.ok(t.SnakeEyes_glow.emissive && !t.SnakeBody.emissive);
  assert.equal(toHex(t.SnakeEyes_glow.color), '#ffd040');
  near(toOklch(t.SnakeRibs.color).l, 0.3, 1e-3, 'a material entry wins over its role');
});

test('every kind recolours materials its species model has, and only those', () => {
  assert.equal(new Set(Object.values(ENEMY_KINDS).map(k => k.type)).size, Object.keys(ENEMY_KINDS).length);
  const species = new Map([...ENEMY_PROFILES, ...BOSS_PROFILES, ...MINION_PROFILES].map(p => [p.type, p]));
  for (const p of [...ENEMY_PROFILES, ...BOSS_PROFILES, ...MINION_PROFILES]) {
    if (p.model === false) continue;   // (no model: the Squirtle, a body of its fluid, render/squirtleview.js)
    const m = materials(p.model ?? p.species);   // (Renew and the Flimmers are the hero's own figure: assets/character.glb)
    for (const [role, names] of Object.entries(p.parts)) for (const name of names) assert.ok(m[name], `${p.type} ${role}: ${name}`);
    for (const name of Object.keys(m)) if (/Teeth|Fangs|Pupils|Mouth/.test(name) && name !== 'StunderMouth')
      assert.ok(!Object.values(p.parts).flat().includes(name), `${name} keeps its colour`);
  }
  for (const k of Object.values(ENEMY_KINDS)) {
    const base = species.get(k.species);
    assert.ok(base, k.type);
    assert.equal(k.seedSalt, base.seedSalt);
    assert.equal(k.parts, base.parts);
    if (k === base) continue;
    // (a boss's minion that is its species plain, Foggery's Fire-faces and Fire-cats: same look, same name)
    if (k.plain) { assert.ok(k.minion && k.label === base.label && k.colors === base.colors, k.type); continue; }
    assert.ok(k.colors && k.label !== base.label, k.type);
    if (base.model === false) { assert.ok(k.colors.body && k.colors.belly, k.type); continue; }
    const m = materials(base.model ?? k.species), t = recolorTable(m, k.parts, k.colors);
    for (const key of Object.keys(k.colors)) assert.ok(k.parts[key] || m[key], `${k.type}: ${key}`);
    for (const { color } of Object.values(t)) assert.ok(color.every(v => v >= 0 && v <= 1));
    for (const key of ['light', ...(k.sparks ?? []), ...(k.ichor ?? [])]) if (typeof k[key] === 'string') parseColor(k[key]);
  }
});
test('three snakes in rising strength; the red one bites hardest and is a fifth faster', () => {
  const tiers = [SNAKE, SAND_VIPER, BLOOD_VIPER];
  for (let i = 1; i < tiers.length; i++) for (const key of ['hp', 'damage', 'xp', 'chase'])
    assert.ok(tiers[i][key] > tiers[i - 1][key], `${tiers[i].type} ${key}`);
  near(BLOOD_VIPER.chase, SNAKE.chase * 1.2, 1e-9);
  near(BLOOD_VIPER.wander, SNAKE.wander * 1.2, 1e-9);
  assert.ok(BLOOD_VIPER.coins[0] > SNAKE.coins[0]);
  const snakes = Object.values(ENEMY_KINDS).filter(k => k.species === 'snake' && !k.guardian);
  assert.equal(snakes.length, 6);
  for (const k of snakes) if (k !== SHADOW_MAMBA) assert.ok(SHADOW_MAMBA.hp > k.hp && SHADOW_MAMBA.damage > k.damage && SHADOW_MAMBA.chase > k.chase, k.type);
  // six snakes, told apart at a glance: their skins differ in hue or clearly in lightness
  for (const a of snakes) for (const b of snakes) if (a !== b) {
    const [x, y] = [a, b].map(k => parseColor(k.colors?.skin ?? 'oklch(0.84 0.137 133)'));
    assert.ok(Math.abs(((x.h - y.h + 540) % 360) - 180) > 40 || Math.abs(x.l - y.l) > 0.3 || Math.abs(x.c - y.c) > 0.08, a.type + ' vs ' + b.type);
  }
  const hue = k => parseColor(k.colors.skin).h;
  assert.ok(hue(BLOOD_VIPER) < 40 && hue(SAND_VIPER) > 60 && hue(SAND_VIPER) < 100);
});
test('a kind scales its body, reach and attacks with its size', () => {
  const big = enemyKind(OCTONAUT, { type: 'big', label: 'Big', mods: { size: 1.5 } });
  near(big.radius, OCTONAUT.radius * 1.5, 1e-9); near(big.height, OCTONAUT.height * 1.5, 1e-9);
  big.attacks.forEach((a, i) => near(a.hitReach, OCTONAUT.attacks[i].hitReach * 1.5, 1e-9));
  assert.equal(big.size, 1.5); assert.equal(big.hp, OCTONAUT.hp); assert.equal(big.xp, OCTONAUT.xp);
  // a melee attack's own reach grows with the body, a throw's does not; its muzzle moves with the model
  const crab = enemyKind(SHRAPS, { type: 'bigcrab', label: 'Big crab', mods: { size: 1.5 } }), [pinch, toss] = crab.attacks;
  near(pinch.reach, SHRAPS.attacks[0].reach * 1.5, 1e-9); assert.equal(toss.reach, SHRAPS.attacks[1].reach);
  assert.equal(crab.reach, toss.reach);
  toss.projectile.muzzle.forEach((v, i) => near(v, SHRAPS.attacks[1].projectile.muzzle[i] * 1.5, 1e-9));
  // a beam's muzzle moves with the model too, its reach stays, and bigger wheels roll further per turn
  const bot = enemyKind(SPICY, { type: 'bigspicy', label: 'Big spicy', mods: { size: 1.5 } });
  bot.beam.muzzle.forEach((v, i) => near(v, SPICY.beam.muzzle[i] * 1.5, 1e-9));
  assert.equal(bot.reach, SPICY.reach); near(bot.wheel, SPICY.wheel * 1.5, 1e-9);
  const e = makeEnemy({ f: null, x: 0, y: 0, z: 0, level: 3 }, BLOOD_VIPER);
  assert.equal(e.type, 'bloodviper'); assert.equal(e.profile.species, 'snake');
  assert.equal(e.hp, Math.round(BLOOD_VIPER.hp * (1 + 2 * GROWTH.hp)), 'a kind grows at the same rate as its species');
  assert.ok(Number.isInteger(e.profile.damage) && Number.isInteger(e.profile.xp));
});

test('every roster draws real kinds of its own species, and every ordinary kind lives somewhere', () => {
  const used = new Set();
  for (const [depth, row] of DEPTH_SPAWNS.entries()) for (const e of row.roster) for (const [type, w] of Object.entries(e.kinds)) {
    assert.equal(ENEMY_KINDS[type]?.species, e.type, `depth ${depth}: ${type}`);
    assert.ok(w > 0); used.add(type);
  }
  // (guardians, bosses and a boss's minions live in no roster)
  assert.deepEqual([...used].sort(), Object.values(ENEMY_KINDS).filter(k => !k.guardian && !k.minion).map(k => k.type).sort());
  assert.equal(pickKind({ snake: 1, bloodviper: 3 }, 0.2), SNAKE);
  assert.equal(pickKind({ snake: 1, bloodviper: 3 }, 0.3), BLOOD_VIPER);
});
test('kinds are drawn from the roster, ids and levels do not depend on them', () => {
  let mixed = 0;
  for (let seed = 0; seed < 40; seed++) {
    const map = atDepth(seed, 15), spots = enemySpots(map, ENEMY_KINDS.spider);
    assert.deepEqual(spots.map(s => s.kind.type), enemySpots(map, ENEMY_KINDS.spider).map(s => s.kind.type));
    const kinds = new Set(spots.map(s => s.kind.type));
    for (const k of kinds) assert.ok(['spider', 'bogspider', 'redback'].includes(k));
    if (kinds.size > 1) mixed++;
    for (const s of spots) {
      const plain = enemyRoll(map, ENEMY_KINDS.spider, s.f.id);
      assert.equal(s.id, plain.id); assert.equal(s.level, plain.level);
      assert.ok(s.coinDrop >= s.kind.coins[0] * (1 + .25 * (s.level - 1)) - 1);
    }
  }
  assert.ok(mixed > 10, 'a nest holds several kinds of spider');
});
