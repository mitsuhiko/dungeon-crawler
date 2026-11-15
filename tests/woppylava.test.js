// Woppylava, the walking volcano (core/woppylava.js, game/woppylava.js, docs/bosses.md). His arena and
// the volcano that rises out of it: tests/cinder.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt } from '../src/core/bosses.js';
import { WOPPYLAVA, WOPPYLAVA_TWO, MAGMA_FACE, MAGMA_CAT, BLAZE_FACE, ASH_CAT, ENEMY_KINDS, STAGE_PROFILES, makeEnemy, enemyProfile,
  guardianLevel, blowOf } from '../src/core/enemies.js';
import { WOPPYLAVA_FIGHT as G, phaseFloor, summonCount, barred, stirOf, wallVolley, wallAt, wallSpan, inWall, handVolley, handPhase,
  handLands, handSpan, trackHand, underHand, bombSpots, islesOf, islesLeft, poured, lavaSurfaces } from '../src/core/woppylava.js';
import { damageEnemy } from '../src/core/combat.js';
import { kindsIn } from '../src/core/spawns.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { EPITHETS, INTROS } from '../src/core/bossintro.js';
import { N, LH, RUN_SPEED } from '../src/core/constants.js';

const ALL = ['swipe', 'erupt', 'walls', 'hands', 'summon', 'rise'];
const allowed = o => ALL.filter(n => !barred(o).has(n));
const BOX = [2, 2, N - 2, N - 2];

test('Woppylava takes the place of the descent guardian of depth 18, his fire creatures come with him', () => {
  assert.equal(BOSSES[18], 'woppylava'); assert.equal(bossAt(18), 'woppylava'); assert.equal(bossAt(18, 'side'), null);
  const w = new World(5), map = state.map = w.cube(w.layout(18).down).map;
  assert.equal(map.guardian.boss, 'woppylava'); assert.equal(guardianLockMessage(map), 'Defeat Woppylava to unlock this descent');
  for (const k of ['woppylava', 'magmaface', 'magmacat']) assert.ok(kindsIn(map).includes(k), k);
  assert.ok(MAGMA_FACE.minion && MAGMA_FACE.lavaproof && MAGMA_FACE.species === BLAZE_FACE.species && ENEMY_KINDS.magmaface === MAGMA_FACE);
  assert.ok(MAGMA_CAT.minion && MAGMA_CAT.lavaproof && MAGMA_CAT.species === ASH_CAT.species && ENEMY_KINDS.magmacat === MAGMA_CAT);
  assert.ok(EPITHETS.woppylava && INTROS.woppylava?.reveal === 'woppylava');
});

test('two phases: at two thirds of his health he rises; lava does not burn him', () => {
  assert.deepEqual(STAGE_PROFILES.woppylava, [WOPPYLAVA, WOPPYLAVA_TWO]);
  assert.ok(WOPPYLAVA.lavaproof && WOPPYLAVA.fireproof);
  const e = makeEnemy({ id: 'w', level: guardianLevel(18, 'descent'), x: 0, y: 0, z: 0 }, WOPPYLAVA);
  e.hpFloor = phaseFloor(e.profile.hp, 1);
  damageEnemy(e, 1e9);
  assert.equal(e.hp, Math.ceil(e.profile.hp * 2 / 3), 'no blow takes him below two thirds in phase 1: a third of his life lost');
  assert.equal(phaseFloor(1000, 2), 0);
  assert.equal(stirOf(e.profile.hp, e.profile.hp), 0); assert.ok(stirOf(e.hp, e.profile.hp) > 0.99);
  // his lava's blows set on fire; the walls and the hands knock down
  for (const name of ['swipe', 'erupt', 'walls', 'hands']) assert.ok(blowOf(e.profile, WOPPYLAVA.attacks.find(a => a.name === name)).burn, name);
  for (const name of ['walls', 'hands']) assert.ok(blowOf(e.profile, WOPPYLAVA.attacks.find(a => a.name === name)).knockDown, name);
});

test('what he may do when: the casts when due, the walls and the hands first and not twice at once, his fire creatures in phase 2', () => {
  assert.deepEqual(allowed({ phase: 1 }), ['swipe']);
  assert.deepEqual(allowed({ phase: 1, eruptDue: true, summonDue: true }), ['swipe', 'erupt'], 'no fire creatures in phase 1');
  assert.deepEqual(allowed({ phase: 2, eruptDue: true, summonDue: true }), ['swipe', 'erupt', 'summon']);
  assert.deepEqual(allowed({ phase: 1, eruptDue: true, wallsDue: true }), ['walls'], 'a wall due first');
  assert.deepEqual(allowed({ phase: 1, wallsDue: true, wallsBusy: true, handsDue: true }), ['hands'], 'not while walls still roll');
  assert.ok(!allowed({ phase: 2, eruptDue: true, wallsDue: true, handsDue: true, summonDue: true }).includes('rise'), 'only his fight rises');
  assert.equal(summonCount(1, 0), 0); assert.equal(summonCount(2, 1), G.minions.most[1] - 1); assert.equal(summonCount(2, 9), 0);
});

test('a wall of lava rolls across the whole arena; its gap is the way through, and nobody outruns it standing still', () => {
  for (let seed = 1; seed <= 6; seed++) for (const phase of [1, 2]) {
    const p = { x: 6 + seed, z: 15 - seed };
    for (const w of wallVolley(seed, phase, p, BOX)) {
      const [lo, hi] = w.side < 2 ? [BOX[1], BOX[3]] : [BOX[0], BOX[2]];
      assert.ok(w.gap - G.walls.gap / 2 >= lo && w.gap + G.walls.gap / 2 <= hi, 'the gap inside the arena');
      // standing where the hero stood: caught in phase 1 (the gap is a run away), in phase 2 (its gap
      // near them) maybe not
      const caught = t => inWall(w, t, p.x, p.z, BOX);
      let ever = false;
      for (let t = 0; t < wallSpan(BOX); t += 0.02) ever ||= caught(t);
      if (phase === 1) assert.ok(ever, `phase 1 seed ${seed}: the hero has to run`);
      // the gap is safe all the way across
      const g = w.side < 2 ? { x: 0, z: w.gap } : { x: w.gap, z: 0 };
      for (let t = 0; t < wallSpan(BOX); t += 0.05) for (let a = BOX[0] + 0.5; a < BOX[2]; a += 0.5) {
        const q = w.side < 2 ? { x: a, z: g.z } : { x: g.x, z: a };
        assert.ok(!inWall(w, t, q.x, q.z, BOX), 'nobody in the gap is caught');
      }
    }
  }
  // the warning first, then the wall comes from its side
  const w = { side: 0, gap: 12 };
  assert.equal(wallAt(w, 0.5, BOX).phase, 'warn'); assert.ok(!inWall(w, 0.5, BOX[0] + 0.3, 3, BOX));
  assert.ok(inWall(w, G.walls.warn + 0.2, BOX[0] + 0.3, 3, BOX), 'its front at its side first');
  assert.equal(wallAt(w, wallSpan(BOX) + 0.01, BOX).phase, 'done');
  // time to get into the gap (at most `gapOff` cells from where the hero stood, running), however near
  // the wall's side they stand (a cell in): its warning and its way to them
  assert.ok(G.walls.warn + 1 / G.walls.speed > (G.walls.gapOff[0][1] - G.walls.gap / 2 + 0.4) / RUN_SPEED);
});

test('the lava hands: the ring follows its hero, holds still, the hand lands on it', () => {
  const ps = [{ x: 5, z: 5 }, { x: 15, z: 10 }];
  const list = handVolley(3, 2, ps, BOX);
  assert.ok(list.length >= ps.length);
  assert.deepEqual(list.slice(0, 2).map(h => h.follow), [0, 1]);
  for (const h of list) assert.ok(h.x > BOX[0] && h.x < BOX[2] && h.z > BOX[1] && h.z < BOX[3]);
  assert.equal(handPhase(0.1), 'track'); assert.equal(handPhase(G.hands.track + 0.1), 'lock');
  assert.equal(handPhase(handLands() + 0.01), 'hold'); assert.equal(handPhase(handSpan() + 0.01), 'done');
  // the ring keeps up with a hero running in a straight line; once it holds still they get away
  const h = { x: 5, z: 5 }, p = { x: 5, z: 5 };
  for (let t = 0; t < G.hands.track; t += 0.05) { p.x += RUN_SPEED * 0.05; trackHand(h, p, 0.05); }
  assert.ok(underHand(h, p.x, p.z), 'it keeps up');
  assert.ok(!underHand(h, p.x + RUN_SPEED * (G.hands.lock + G.hands.fall), p.z), 'a hero who keeps running gets away');
});

test('an eruption: bombs round the heroes and anywhere in the fight, more in phase 2', () => {
  const floors = Array.from({ length: 40 }, (_, i) => ({ x: 3.5 + (i % 8) * 2, z: 3.5 + Math.floor(i / 8) * 3 }));
  const one = bombSpots(7, 1, [{ x: 10, z: 10 }], floors), two = bombSpots(7, 2, [{ x: 10, z: 10 }], floors);
  assert.equal(one.length, G.erupt.count[0]); assert.equal(two.length, G.erupt.count[1]);
  assert.deepEqual(bombSpots(7, 1, [{ x: 10, z: 10 }], floors), one, 'the same seed, the same spots');
  for (const b of one.slice(0, G.erupt.near)) assert.ok(Math.hypot(b.x - 10, b.z - 10) <= G.erupt.spread[1] + 1e-6);
  for (const b of one) assert.ok(b.flight >= G.erupt.flight[0] && b.flight <= G.erupt.flight[1]);
});

test('the lava: the basin\'s, the crater\'s pool, and the eruption pouring down from the top till only the isles are dry, then none', () => {
  // a little cone: cells round the middle, higher inward; its road a ring of cells
  const cells = [], road = [];
  for (let z = 6; z < 18; z++) for (let x = 6; x < 18; x++) {
    const d = Math.hypot(x + 0.5 - 12, z + 0.5 - 12);
    if (d > 6) continue;
    const top = Math.round(18 - d * 2.5);
    cells.push({ c: z * N + x, y: top * LH });
    if (Math.abs(d - 3.5) < 0.6) road.push({ c: z * N + x, x, z, top });
  }
  const isles = islesOf(road, 9);
  assert.equal(isles.length, G.burst.isles);
  assert.equal(new Set(isles.flat()).size, isles.flat().length, 'no cell in two isles');
  const level = 1 * LH, crater = [{ c: 12 * N + 12, y: 15 * LH }];
  const before = lavaSurfaces({ level, box: BOX, crater, cells, isles });
  assert.equal(before[3 * N + 3], level, 'the basin');
  assert.ok(Number.isNaN(before[0]), 'outside its box: dry');
  assert.equal(before[12 * N + 12], 15 * LH + G.craterDepth, 'the crater\'s pool');
  assert.ok(!(before[cells[0].c] > cells[0].y), 'the volcano dry before the eruption');
  // pouring: the top first
  const top = cells.reduce((a, b) => b.y > a.y ? b : a), low = cells.reduce((a, b) => b.y < a.y ? b : a);
  const early = lavaSurfaces({ level, box: BOX, crater, cells, since: G.burst.pour * 0.2, isles });
  assert.ok(early[top.c] > top.y && !(early[low.c] > low.y), 'from the top down');
  const poured_ = lavaSurfaces({ level, box: BOX, crater, cells, since: G.burst.pour + 0.01, isles });
  for (const m of cells) {
    const dry = isles.flat().includes(m.c);
    assert.equal(poured_[m.c] > m.y, !dry, dry ? 'an isle stays dry' : 'everything else under lava');
  }
  assert.ok(poured_[3 * N + 3] > level, 'the basin\'s lava higher too');
  assert.equal(islesLeft(NaN), G.burst.isles); assert.equal(islesLeft(G.burst.pour + 0.01), G.burst.isles);
  assert.equal(islesLeft(G.burst.pour + G.burst.shrink + 0.01), G.burst.isles - 1, 'the first gone a while after');
  const end = G.burst.pour + G.burst.shrink * G.burst.isles;
  assert.equal(islesLeft(end), 0);
  const last = lavaSurfaces({ level, box: BOX, crater, cells, since: end, isles });
  for (const m of cells) assert.ok(last[m.c] > m.y, 'in the end nowhere dry');
  assert.equal(poured(0), 0); assert.equal(poured(1e3), 1);
});
