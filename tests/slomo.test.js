import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { SLOMO, SLOMO_SLUG, ARM_SLUG, OOZE_SLUG, OOZE_BOLIME, SLIME_SQUIRTLE, SQUIRTLE, ENEMY_KINDS, STAGE_PROFILES,
  makeEnemy, absent, blowOf } from '../src/core/enemies.js';
import { SLOMO_FIGHT, phaseFloor, summonCount, barred, newFlood, stepFlood, raiseFlood, drainFlood, floodBox, rainOf } from '../src/core/slomo.js';
import { damageEnemy } from '../src/core/combat.js';
import { launch, stepProjectile } from '../src/core/projectiles.js';
import { kindsIn, speciesIn } from '../src/core/spawns.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { worldThemes, themeAt } from '../src/themes/depth.js';
import { BOWL } from '../src/cubegen/arenashapes.js';
import { LH, N, HEAD_Y, WATER, ACID } from '../src/core/constants.js';

const bowlOf = seed => { const w = new World(seed), L = w.layout(13); return state.map = w.cube(L.down).map; };
const named = (p, name) => p.attacks.find(a => a.name === name);

test('Slomo takes the place of the descent guardian of depth 13, the slime marsh\'s depth', () => {
  assert.equal(BOSSES[13], 'slomo'); assert.equal(bossAt(13), 'slomo'); assert.equal(bossAt(13, 'side'), null);
  // the slime marsh is act II's last theme: the bottom of the act in every world that shows it
  let slime = 0;
  for (let s = 1; s <= 400; s++) if (themeAt(13, worldThemes(s * 7919)).props === 'slime') slime++;
  assert.ok(slime > 150, 'often the slime marsh: ' + slime);
  const map = bowlOf(3);
  assert.equal(map.guardian.boss, 'slomo'); assert.equal(guardianLockMessage(map), 'Defeat Slomo to unlock this descent');
  // he brings his minions' models along (their kinds: summoned, or come to life where his arms land)
  for (const k of ['slomo', 'armslug', 'oozeslug', 'oozebolime', 'slimesquirtle']) assert.ok(kindsIn(map).includes(k), k);
  assert.deepEqual(speciesIn(map).sort(), ['bolime', 'slomo', 'slug', 'squirtle']);
});

test('his slime bowl: a flat basin his flood stands in, under the head, the mounds and the doorways dry', () => {
  for (const seed of [1, 2, 3, 8, 42]) {
    const map = bowlOf(seed), t = map.tide;
    assert.equal(map.arena.type, 'bowl'); assert.equal(BOSS_ARENAS.slomo.type, 'bowl');
    assert.ok(t.flood && t.fluid === WATER && t.look === ACID, 'waded through as water, drawn as slime');
    const zone = map.floors.filter(f => f.encounter), low = Math.min(...zone.map(f => f.top));
    const depth = (t.high - low) * LH;
    assert.ok(depth > 0.3 && depth < HEAD_Y - 0.25, `never over the head: ${depth}`);
    const wet = zone.filter(f => f.top < t.high);
    assert.ok(wet.length >= zone.length * 0.5, `most of the bowl floods: ${wet.length}/${zone.length}`);
    assert.ok(wet.every(f => f.x >= t.box[0] && f.z >= t.box[1] && f.x < t.box[2] && f.z < t.box[3]), 'inside its box');
    for (const p of map.portals) assert.ok(p.floor.top > t.high, 'the doorways stay dry');
    assert.ok(map.guardian.floor.top > t.high, 'and his spot');
    assert.ok(t.rest < low && t.gone === t.rest, 'dry at rest');
    assert.ok(Math.abs(t.high - (map.portals[0].floor.top + BOWL.low) - BOWL.flood) < 1e-9);
  }
});

test('two phases, half his health each, and his shapes', () => {
  assert.deepEqual(STAGE_PROFILES.slomo, [SLOMO, SLOMO_SLUG]);
  assert.deepEqual([SLOMO.phase, SLOMO_SLUG.phase], [1, 2]);
  const e = makeEnemy({ id: 's', level: 15, x: 0, y: 0, z: 0 }, SLOMO);
  e.hpFloor = phaseFloor(e.profile.hp, 1);
  damageEnemy(e, 1e6);
  assert.equal(e.hp, Math.ceil(e.profile.hp / 2));
  assert.equal(phaseFloor(1000, 1), 500); assert.equal(phaseFloor(1000, 2), 0);
  // the blob is see-through, the slime his own; the slug leaves a trail
  assert.deepEqual(SLOMO.shell.parts, ['SlomoSkin']); assert.ok(SLOMO.slimeborn && SLOMO_SLUG.slimeborn);
  assert.ok(SLOMO_SLUG.trail && SLOMO_SLUG.gait === 'crawl');
  // nothing of the jump is left: no shockwaves, no squashing
  assert.ok(STAGE_PROFILES.slomo.every(p => p.attacks.every(a => !a.jump && !a.wave)));
  // a big body steps round, it does not spin on the spot
  for (const p of STAGE_PROFILES.slomo) assert.ok(p.turnSpeed > 0.5 && p.turnSpeed < 2 && p.turnStride > 0, p.type);
});

test('what he may do when: his phase\'s attacks, the flood and the timed ones when due, an arm while he has it', () => {
  const allowed = o => ['armL', 'armR', 'meteor', 'flood', 'spit', 'summon', 'squirtle'].filter(n => !barred(o).has(n));
  assert.deepEqual(allowed({ phase: 1 }), ['armL', 'armR']);
  assert.deepEqual(allowed({ phase: 1, arms: [0.4, 1], rainDue: true }), ['armR', 'meteor']);
  assert.deepEqual(allowed({ phase: 1, floodDue: true }), ['armL', 'armR'], 'no flood in phase 1');
  assert.deepEqual(allowed({ phase: 2 }), ['spit']);
  assert.deepEqual(allowed({ phase: 2, rainDue: true, slimesDue: true, squirtlesDue: true }), ['meteor', 'spit', 'summon', 'squirtle']);
  assert.deepEqual(allowed({ phase: 2, floodDue: true, rainDue: true }), ['flood']);
  assert.equal(summonCount('slimes', 3), 2); assert.equal(summonCount('slimes', 6), 0); assert.equal(summonCount('squirtles', 0), 2);
  for (const [p, names] of [[SLOMO, ['armL', 'armR', 'meteor']], [SLOMO_SLUG, ['spit', 'summon', 'squirtle', 'flood', 'meteor']]])
    assert.deepEqual(p.attacks.map(a => a.name), names);
  assert.ok(named(SLOMO_SLUG, 'flood').ward, 'nothing hurts him while he calls the flood');
});

test('the flood: in from a side, across in a few seconds, and 10 s to drain', () => {
  const F = SLOMO_FIGHT.flood, w = newFlood(), sides = new Set();
  for (let i = 0; i < 12; i++) { const last = w.side; sides.add(raiseFlood(w, i / 12)); assert.notEqual(w.side, last, 'never the same side twice'); }
  assert.equal(sides.size, 4);
  raiseFlood(w, 0.5);
  let t = 0, across = null, drained = null, wasHigh = null;
  while (w.phase !== 'dry' && t < 30) {
    const now = stepFlood(w, 0.05); t += 0.05;
    if (now === 'high') across = t;
    if (now === 'drain') wasHigh = t;
    if (now === 'dry') drained = t;
  }
  assert.ok(Math.abs(across - F.surge) < 0.1 && Math.abs(drained - wasHigh - 10) < 0.1, `${across} ${wasHigh} ${drained}`);
  assert.equal(F.drain, 10);
  // the part of the box it has reached, from its side
  assert.deepEqual(floodBox([2, 2, 14, 14], 0, 0.25), [11, 2, 14, 14]);
  assert.deepEqual(floodBox([2, 2, 14, 14], 1, 0.5), [2, 2, 8, 14]);
  assert.deepEqual(floodBox([2, 2, 14, 14], 2, 1), [2, 2, 14, 14]);
  assert.deepEqual(floodBox([2, 2, 14, 14], 3, 0.5), [2, 2, 14, 8]);
  // his death drains it from wherever it stands
  raiseFlood(w); stepFlood(w, 0.5); drainFlood(w);
  assert.equal(w.phase, 'drain');
});

test('his slug arms fly in an arc onto the player and come to life as Arm slugs that latch on', () => {
  const arm = named(SLOMO, 'armL').projectile, e = { x: 8, y: 2, z: 4, yaw: 0 }, target = { x: 8, y: 2.5, z: 10 };
  assert.equal(arm.becomes, 'armslug'); assert.ok(arm.lob > 0);
  const pr = launch(e, arm, target);
  assert.ok(pr.vy > 0, 'thrown up');
  let top = pr.y, end = null;
  for (let i = 0; i < 200 && !end; i++) { end = stepProjectile(pr, 1 / 60, null, (x, y) => y < 2); top = Math.max(top, pr.y); }
  assert.equal(end, 'blocked'); assert.ok(top > 3, 'over an arc: ' + top);
  assert.ok(Math.abs(pr.z - target.z) < 1.2, 'down where the player was: ' + pr.z);
  assert.ok(blowOf(SLOMO, named(SLOMO, 'armL')).slow, 'it slows');
  // the Arm slug: small, quick for a slug, never spits (it only crawls after the player), and
  // latched on nothing touches it
  assert.ok(ARM_SLUG.minion && ARM_SLUG.latches && ARM_SLUG.reach === 0 && !ARM_SLUG.projectile && ARM_SLUG.size < 0.7);
  assert.ok(ARM_SLUG.chase > ENEMY_KINDS.slug.chase * 2);
  assert.ok(absent({ mode: 'split', profile: ARM_SLUG }) && !absent({ mode: 'chase', profile: ARM_SLUG }));
  const L = SLOMO_FIGHT.latch;
  assert.ok(L.hold / L.bite >= 3 && L.hold <= 3, 'a few bites, then it drops off');
});

test('his minions: slime green, the Slime squirtle a bit bigger and spitting slime', () => {
  for (const k of [ARM_SLUG, OOZE_SLUG, OOZE_BOLIME, SLIME_SQUIRTLE]) {
    assert.ok(k.minion && k.coins[1] === 0 && ENEMY_KINDS[k.type] === k, k.type);
    assert.ok(k.slimeborn || k.swims, k.type + ' is not held by the slime, nor drowned in the flood');
  }
  assert.ok(SLIME_SQUIRTLE.size > 1.2 && SLIME_SQUIRTLE.height > SQUIRTLE.height);
  assert.equal(SLIME_SQUIRTLE.projectile.kind, 'slimeball'); assert.ok(SLIME_SQUIRTLE.projectile.slow);
  assert.equal(named(SLOMO_SLUG, 'summon').summon.kind, 'oozeslug'); assert.equal(named(SLOMO_SLUG, 'summon').summon.also, 'oozebolime');
  assert.equal(named(SLOMO_SLUG, 'squirtle').summon.kind, 'slimesquirtle');
  assert.deepEqual(SLOMO_FIGHT.minions, { slimes: 5, squirtles: 2 });
});

test('his meteorites: the first on the player, the rest round them, each in its turn', () => {
  for (const p of STAGE_PROFILES.slomo) {
    const rain = named(p, 'meteor').rain, list = rainOf(rain, 7);
    assert.equal(list.length, rain.count);
    assert.ok(Math.hypot(list[0].dx, list[0].dz) <= 0.5);
    for (const m of list.slice(1)) { const d = Math.hypot(m.dx, m.dz); assert.ok(d >= rain.spread[0] - 1e-9 && d <= rain.spread[1] + 1e-9); }
    assert.deepEqual(list.map(m => m.delay), list.map((_, i) => i * rain.stagger));
    assert.deepEqual(rainOf(rain, 7), list, 'the same cast, the same rain');
  }
  assert.ok(N > 0);
});
