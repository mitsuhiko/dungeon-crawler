// Rollie and Megalimmer, two bosses at once at depth 9 (core/rollie.js, game/rollie.js, docs/bosses.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { worldOf } from './worlds.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { ROLLIE, MEGALIMMER, ENEMY_KINDS, guardianLevel, makeEnemy, blowOf, MEGA_TWISTER } from '../src/core/enemies.js';
import { ROLLIE_FIGHT as G, newTurns, stepTurns, sidePoint, spiralRadius, spiralTime, spiralStep, newSpiral, newSaber, stepSaber,
  sabreCuts, trackAim, sweepStart, beamGap, gridCells, barredFor } from '../src/core/rollie.js';
import { guardianId, partnerId, guardianIds, restoreDefeated } from '../src/core/guardians.js';
import { createRun, awardKill } from '../src/core/progression.js';
import { bossesOf, bossOf } from '../src/core/bossbar.js';
import { speciesIn } from '../src/core/spawns.js';
import { guardianSpots, enemySpots } from '../src/game/enemyspawn.js';
import { walkable } from '../src/physics/enemynav.js';


test('Rollie and Megalimmer are the boss of depth 9, a pair: each the other\'s partner, both a boss of the same fight', () => {
  assert.equal(BOSSES[9], 'rollie'); assert.equal(bossAt(9), 'rollie'); assert.equal(bossAt(9, 'side'), null);
  assert.equal(ENEMY_KINDS.rollie, ROLLIE); assert.equal(ENEMY_KINDS.megalimmer, MEGALIMMER);
  assert.equal(ROLLIE.partner, 'megalimmer'); assert.equal(MEGALIMMER.partner, 'rollie');
  assert.equal(ROLLIE.boss, 'rollie'); assert.equal(MEGALIMMER.boss, 'rollie');
  // Megalimmer: twice the hero's height, blurry but less often missed than a Flimmer, a sheet over a ball
  assert.ok(MEGALIMMER.height >= 2 && MEGALIMMER.cloth && MEGALIMMER.blur.evade < ENEMY_KINDS.flimmer.blur.evade);
  // Rollie: a Spicy twice its size, on wheels
  assert.ok(ROLLIE.height >= 1.9 * ENEMY_KINDS.spicy.height && ROLLIE.wheel > 0);
  assert.deepEqual(ROLLIE.attacks.map(a => a.name), ['laser', 'sabers', 'sweep', 'grid', 'swipe', 'summon']);
  assert.deepEqual(MEGALIMMER.attacks.map(a => a.name), ['pummel', 'vanish', 'stunner', 'flimmers']);
  // the Stun flimmer stuns (its blow's shock); his twisters knock you down
  const stun = ENEMY_KINDS.stunflimmer;
  assert.ok(blowOf(stun, stun.attacks[0]).shock > 1);
  assert.ok(blowOf(MEGALIMMER, MEGA_TWISTER).knockDown);
});

test('their arena: both stand in it, the second beside the first, the gate neither\'s till one is left; their minions\' models come along', () => {
  for (const seed of [1, 123]) {
    const w = worldOf(seed), map = state.map = w.cube(w.descentSpec(9).key).map;
    const spots = guardianSpots(map), [r, m] = spots;
    assert.equal(spots.length, 2, `seed ${seed}`);
    assert.equal(r.kind, ROLLIE); assert.equal(m.kind, MEGALIMMER);
    assert.equal(r.id, guardianId(map.key)); assert.equal(m.id, partnerId(map.key));
    assert.ok(spots.every(s => s.pair === map.key && s.pairGate === map.key && !s.guardianGate && s.guardian && s.level === guardianLevel(9, 'descent', map.level)));
    const d = Math.hypot(r.x - m.x, r.z - m.z);
    assert.ok(d > 2 && d < 6, `seed ${seed}: beside him (${d.toFixed(2)})`);
    assert.ok(m.f.encounter && walkable(m.f, MEGALIMMER.height) && Math.abs(m.y - r.y) < 0.8, `seed ${seed}: on the fight's ground`);
    assert.equal(enemySpots(map, ROLLIE).length, 1); assert.equal(enemySpots(map, MEGALIMMER).length, 1);
    for (const k of ['rollie', 'megalimmer', 'rolliespicy', 'stunflimmer', 'megaflimmer']) assert.ok(speciesIn(map).includes(ENEMY_KINDS[k].species), k);
  }
});

test('a gate opens with the second of them; a death before rolls both back, after it neither comes back', () => {
  const key = 'k', run = createRun(), body = (id, kind) => ({ ...makeEnemy({ id, level: 1, coinDrop: 0, guardian: true, guardianRole: 'descent', pairGate: key }, kind), mode: 'dead', hp: 0 });
  const r = body(guardianId(key), ROLLIE), m = body(partnerId(key), MEGALIMMER);
  awardKill({ xp: 0, level: 1, hp: 1, maxHp: 1, inventory: [] }, run, r);
  assert.ok(run.defeated.has(r.id) && !run.unlockedGates.has(key), 'the first: no gate');
  restoreDefeated(run, new Set());
  assert.ok(!run.defeated.has(r.id), 'a death: he is back');
  m.guardianGate = key;   // (the last one has it: game/rollie.js)
  for (const e of [r, m]) awardKill({ xp: 0, level: 1, hp: 1, maxHp: 1, inventory: [] }, run, e);
  assert.ok(run.unlockedGates.has(key));
  restoreDefeated(run, new Set());
  assert.deepEqual(guardianIds(key).filter(id => run.defeated.has(id)), guardianIds(key), 'both stay beaten');
});

test('two stacked bars: the nearer\'s pair, Rollie\'s first, a beaten one\'s still about', () => {
  const b = (id, kind, o = {}) => ({ ...makeEnemy({ id, x: 0, z: 0, level: 1, guardian: true, guardianRole: 'descent', pair: 'p' }, kind), ...o });
  const r = b('r', ROLLIE, { x: 9 }), m = b('m', MEGALIMMER, { x: 1 }), other = b('o', ENEMY_KINDS.monteur, { x: 30, pair: undefined });
  assert.equal(bossOf([r, m, other], { x: 0, z: 0 }), m);
  assert.deepEqual(bossesOf([m, other, r], { x: 0, z: 0 }), [r, m]);
  r.mode = 'dead'; r.hp = 0;
  assert.deepEqual(bossesOf([m, r], { x: 0, z: 0 }), [r, m], 'the beaten one\'s row empties');
  assert.deepEqual(bossesOf([other], { x: 0, z: 0 }), [other]);
  assert.deepEqual(bossesOf([], { x: 0, z: 0 }), []);
});

test('they take turns: after a turn, or sooner once the main one is hurt fast; one left alone keeps going to the side', () => {
  const T = newTurns('rollie', 0);
  assert.equal(T.turn, G.turn[0]);
  let swapped = false, t = 0;
  while (!swapped && t < 30) { swapped = stepTurns(T, 0.1, 1000, 1000, true, 0); t += 0.1; }
  assert.ok(Math.abs(t - G.turn[0]) < 0.15 && T.main === 'megalimmer');
  // hurt fast: a sixth of his health in a second swaps, but not in the first moments of his turn
  const H = newTurns('rollie', 1);
  assert.equal(stepTurns(H, 0.5, 1000, 1000, true), false);
  assert.equal(stepTurns(H, 0.5, 830, 1000, true), false, 'too early in his turn');
  for (let i = 0; i < 50; i++) stepTurns(H, 0.1, 830, 1000, true);
  assert.equal(H.main, 'rollie');
  let hp = 830, quick = false;
  for (let i = 0; i < 30 && !quick; i++) { hp -= 7; quick = stepTurns(H, 0.1, hp, 1000, true); }
  assert.ok(quick && H.main === 'megalimmer', 'hurt fast: swapped');
  // alone: main and side by turns
  const A = newTurns('megalimmer', 0);
  for (let t = 0; t < G.turn[0] + 0.2; t += 0.1) stepTurns(A, 0.1, 500, 1000, false, 0);
  assert.equal(A.side, true);
  for (let t = 0; t < G.turn[0] + 0.2; t += 0.1) stepTurns(A, 0.1, 500, 1000, false, 0);
  assert.equal(A.side, false);
});

test('Rollie at the side: off round to the side of the main one, never behind you, 6 to 9 cells away', () => {
  const p = { x: 10, z: 10 };
  for (const [r, m] of [[{ x: 10, z: 30 }, { x: 10, z: 13 }], [{ x: 11, z: 11 }, { x: 14, z: 10 }], [{ x: 2, z: 12 }, null]]) {
    const s = sidePoint(p, r, m), d = Math.hypot(s.x - p.x, s.z - p.z);
    assert.ok(d >= G.side.near - 1e-9 && d <= G.side.far + 1e-9, `${d}`);
    if (!m) continue;
    const a = Math.atan2(s.x - p.x, s.z - p.z), b = Math.atan2(m.x - p.x, m.z - p.z), off = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    assert.ok(Math.abs(off - G.side.round) < 1e-9, 'round to the side of the main one');
    assert.ok(off < Math.PI - 0.8, 'not behind the hero facing the main one');
  }
});

test('Megalimmer runs round you closer and closer, fast, and breaks off', () => {
  assert.equal(spiralRadius(0), G.spiral.from); assert.equal(spiralRadius(G.spiral.time), G.spiral.to); assert.equal(spiralRadius(99), G.spiral.to);
  assert.ok(Math.abs(spiralRadius(spiralTime(3)) - 3) < 1e-9);
  const p = { x: 0, z: 0 }, c = newSpiral({ x: 4.5, z: 0 }, p, 0, () => 0.3);
  assert.ok(c.midway > 0 && c.midway < G.spiral.time);
  let last = spiralStep(c, p, 0.01), most = 0;
  for (let t = 0; t < G.spiral.time; t += 0.05) {
    const at = spiralStep(c, p, 0.05);
    most = Math.max(most, Math.hypot(at.x - last.x, at.z - last.z) / 0.05);
    last = at;
  }
  assert.ok(most <= G.spiral.speed * 1.05 + 1e-9, `no faster than he runs (${most.toFixed(2)})`);
  assert.ok(most > 2 * 2.8 * 0.9, 'about twice the hero\'s run');
  assert.ok(Math.abs(Math.hypot(last.x, last.z) - G.spiral.to) < 1e-6);
});

test('his blades curve after you, turn back and fly into his hands, cutting on the way out and back', () => {
  const s = newSaber({ x: 0, y: 1, z: 0 }, 0.6), target = { x: 0, y: 1, z: 8 }, home = { x: 0, y: 1.2, z: -0.5 };
  let cut = 0, steps = 0;
  while (!s.done && steps < 1000) {
    stepSaber(s, s.out ? target : null, home, 1 / 60);
    if (sabreCuts(s, { x: 0, y: 0.1, z: 8 }) && !s.hit.has('p')) { s.hit.add('p'); cut++; }
    steps++;
  }
  assert.ok(s.done, 'caught again');
  assert.ok(steps / 60 > G.sabers.out && steps / 60 < 4);
  assert.ok(cut >= 1, 'it cut whom it went for');
});

test('the sweep starts beside you and follows slower than you run; the grid strikes your own cell first, round you', () => {
  const e = { x: 0, z: 0 }, p = { x: 0, y: 0, z: 8 }, aim = sweepStart(e, p, 1);
  assert.ok(Math.abs(Math.hypot(aim.x - p.x, aim.z - p.z) - G.sweep.lead) < 1e-9);
  trackAim(aim, p, 0.5);
  assert.ok(Math.abs(Math.hypot(aim.x - p.x, aim.z - p.z) - (G.sweep.lead - G.sweep.track * 0.5)) < 1e-9);
  assert.ok(G.sweep.track < 2.8, 'slower than the hero runs');
  assert.ok(beamGap({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }, { x: 0.2, y: 1, z: 5 }) < 0.21);
  assert.ok(beamGap({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }, { x: 0, y: 1, z: -3 }) > 2.9, 'not behind him');
  const floors = [];
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) floors.push({ x, z, y: 0 });
  let i = 0;
  const R = () => (i = (i * 7 + 3) % 11) / 11;
  const cells = gridCells({ x: 8, z: 8 }, floors, R);
  assert.equal(cells.length, G.grid.cells); assert.deepEqual([cells[0].x, cells[0].z], [8, 8]);
  assert.equal(new Set(cells).size, cells.length);
  assert.ok(cells.every(c => Math.hypot(c.x - 8, c.z - 8) <= G.grid.near));
});

test('what each may start: the main one all he has (as his timers let him), the one at the side only his side attacks, and only while the main one rests', () => {
  const names = ROLLIE.attacks.map(a => a.name), all = { sweep: true, grid: true, summon: true }, room = { summon: true };
  assert.deepEqual([...barredFor('rollie', names, { main: true, due: all, busy: false, room })], []);
  assert.deepEqual([...barredFor('rollie', names, { main: true, due: {}, busy: false, room })], ['sweep', 'grid', 'summon']);
  assert.deepEqual([...barredFor('rollie', names, { main: true, due: all, busy: false, room: {} })], ['summon']);
  assert.deepEqual([...barredFor('rollie', names, { main: false, due: all, busy: false, room })].sort(), ['laser', 'sabers', 'summon', 'swipe']);
  assert.deepEqual([...barredFor('rollie', names, { main: false, due: all, busy: true, room })].sort(), names.slice().sort());
  const mnames = MEGALIMMER.attacks.map(a => a.name), mdue = { vanish: true, stunner: true, flimmers: true }, mroom = { stunner: true, flimmers: true };
  assert.deepEqual([...barredFor('megalimmer', mnames, { main: true, due: mdue, busy: false, room: mroom })], []);
  assert.deepEqual([...barredFor('megalimmer', mnames, { main: true, due: mdue, busy: false, room: mroom, hidden: true })], ['vanish']);
  // (at the side he runs round you: his fight starts his beatings itself)
  assert.deepEqual([...barredFor('megalimmer', mnames, { main: false, due: mdue, busy: false, room: mroom })].sort(), mnames.slice().sort());
});
