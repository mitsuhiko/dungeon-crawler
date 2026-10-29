import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { FOGGERY, FOGGERY_BALL, FOG_FACE, FOG_CAT, FIREFACE, FIRECAT, ENEMY_KINDS, STAGE_PROFILES, wardedNow } from '../src/core/enemies.js';
import { FOGGERY_FIGHT, TOWER, PLATFORMS, LAVA, splitHp, summonCount, barred, rampHeight, rampMarks, slotGrid, slotNext,
  newLava, moveLava, stepLava, puzzleMoves, puzzleStart, puzzleAt, platformsAt } from '../src/core/foggery.js';
import { guardianLockMessage } from '../src/core/guardians.js';
import { tideLevel } from '../src/core/squarlo.js';
import { findPath } from '../src/physics/enemynav.js';
import { mulberry32 } from '../src/core/util.js';
import { floorY } from '../src/core/surfaces.js';
import { LH, HEAD, JUMP_V, GRAV, WALK_SPEED, CHAR_H } from '../src/core/constants.js';

const fifthDescent = seed => {
  const w = new World(seed), L = w.layout(4);
  return { w, L, map: state.map = w.cube(L.down).map };
};

test('Foggery takes the place of the descent guardian of depth 4, and only that one', () => {
  assert.equal(BOSSES[4], 'foggery'); assert.equal(bossAt(4), 'foggery'); assert.equal(bossAt(4, 'side'), null);
  for (const seed of [0, 3]) {
    const w = new World(seed);
    for (let d = 3; d < 6; d++) for (const [key, g] of w.layout(d).guardians) {
      assert.equal(g.boss === 'foggery', d === 4 && g.role === 'descent', `${seed} ${d} ${key}`);
      if (g.boss !== 'foggery') continue;
      const map = w.cube(key).map;
      assert.equal(map.arena.type, 'tower'); assert.equal(guardianLockMessage(map), 'Defeat Foggery to unlock this descent');
    }
  }
  assert.equal(ENEMY_KINDS.foggery, FOGGERY);
  assert.deepEqual(STAGE_PROFILES.foggery, [FOGGERY, FOGGERY_BALL, FOGGERY_BALL]);
  // his minions: plain Fire-faces and Fire-cats, weaker, minions; the cats wade through lava
  assert.equal(FOG_FACE.label, FIREFACE.label); assert.equal(FOG_CAT.label, FIRECAT.label);
  assert.ok(FOG_FACE.minion && FOG_CAT.minion && FOG_CAT.lavaproof && FOGGERY.lavaproof && FOG_FACE.lavaproof);
  assert.ok(FOG_FACE.hp < FIREFACE.hp && FOG_CAT.hp < FIRECAT.hp);
});

test('his doorway is in the middle of its face, high up, and you come in onto the bridge over the lava', () => {
  for (const seed of [0, 1, 2, 5, 9]) {
    const { w, map } = fifthDescent(seed), door = map.portals[0], well = map.portals[1];
    assert.equal(door.y, BOSS_ARENAS.foggery.door * LH);
    assert.equal(w.cube(w.layout(4).down).map, map);
    // the face's portal in the middle (cubegen/portals.js: the pad's middle cell)
    assert.ok([door.x, door.z].includes(BOSS_ARENAS.foggery.centre));
    // past the doorway the bridge, over the lava at rest
    const bridge = door.floor.link.find(f => f?.tower === 'bridge');
    assert.ok(bridge && bridge.top * LH > tideLevel(map.tide, LAVA.rest) * LH + 2, 'the bridge well over the lava');
    // he waits at the foot of the ramp, just out of the lava, a way off along the ramp from the bridge
    const g = map.guardian;
    assert.equal(g.floor.tower, 'ramp');
    assert.ok(g.floor.ramp < 0.15 && g.floor.top * LH < tideLevel(map.tide, LAVA.rest) * LH + 0.5);
    assert.ok(g.y > tideLevel(map.tide, LAVA.rest) * LH, 'on dry land');
    assert.ok(findPath(bridge, g.floor, 200, FOGGERY.height).length > 8);
    // no parapets up the ramp
    assert.ok(map.fenceList.every(r => r.pts.every(([x, , z]) => map.cols[Math.floor(z) * 16 + Math.floor(x)].some(f => f.tower === 'bridge'))));
    // the well lies on the caldera's floor, under the lava until he is beaten
    assert.equal(well.kind, 'down'); assert.equal(well.y, TOWER.ground * LH);
    assert.ok(tideLevel(map.tide, LAVA.rest) > TOWER.ground && tideLevel(map.tide, LAVA.gone) < TOWER.ground);
  }
});

test('the lava: under the top in phases 1 and 2, over it in phase 3, under the platforms always', () => {
  const L = TOWER.lava;
  assert.ok(L.rest > TOWER.ground && L.high < TOWER.top && L.flood > TOWER.top && L.flood < PLATFORMS.top);
  assert.ok((PLATFORMS.top - L.flood) * LH > 0.1, 'the platforms stand out of it');
  // the platforms are reached from the top with a jump (a jump rises JUMP_V² / 2g)
  assert.ok((PLATFORMS.top - TOWER.top) * LH < JUMP_V * JUMP_V / (2 * GRAV) - 0.2);
  const w = newLava();
  moveLava(w, LAVA.high, 60);
  stepLava(w, 30); assert.ok(Math.abs(w.k - 0.5) < 1e-9);
  stepLava(w, 40); assert.equal(w.k, 1);
  moveLava(w, LAVA.flood, 6); stepLava(w, 6); assert.equal(w.k, LAVA.flood);
});

test('the tower narrows as it rises, half as wide at the top, a ramp winding up round it from the floor to the top', () => {
  const N = 16;
  for (const seed of [0, 1, 2, 3, 4, 7, 11, 23]) {
    const { map } = fifthDescent(seed), t = map.tower;
    // no walls: the caldera's floor and its lava go out to the cube's sides (but the bridge from the doorway)
    for (let i = 0; i < N * N; i++) {
      const x = i % N, z = (i / N) | 0;
      if (x && z && x < N - 1 && z < N - 1) continue;
      assert.ok(map.cols[i].every(f => f.ground || f.tower === 'bridge'), `${x},${z}`);
    }
    assert.deepEqual(map.tide.box, [0, 0, N, N]);
    // wide at the foot, half as wide at the top (and clear of the rim all round)
    const reach = test => Math.max(...map.floors.filter(test).map(f => Math.hypot(f.x + 0.5 - TOWER.mid, f.z + 0.5 - TOWER.mid)));
    const foot = reach(f => f.tower === 'ramp'), crown = reach(f => f.tower === 'top');
    assert.ok(foot > 5 && foot < 6.6, 'foot ' + foot); assert.ok(crown < foot * 0.65, `crown ${crown} vs foot ${foot}`);
    for (const f of map.floors) if (f.tower) assert.ok(f.x > 1 && f.z > 1 && f.x < N - 2 && f.z < N - 2 || f.tower === 'bridge', `${f.x},${f.z} by the rim`);
    // the higher up the ramp, the nearer the middle
    const ramp = map.floors.filter(f => f.tower === 'ramp'), r = f => Math.hypot(f.x + 0.5 - TOWER.mid, f.z + 0.5 - TOWER.mid);
    const low = ramp.filter(f => f.top < 6), high = ramp.filter(f => f.top > 14);
    assert.ok(low.reduce((n, f) => n + r(f), 0) / low.length > high.reduce((n, f) => n + r(f), 0) / high.length + 1);
    // one floor to a column, but the bridge over the caldera's floor
    for (const col of map.cols) assert.ok(col.length === 1 || col.length === 2 && col[1].tower === 'bridge');
    const m = rampMarks(t.door);
    assert.equal(rampHeight(0, t.door), TOWER.ground); assert.equal(rampHeight(m.jc, t.door), t.door); assert.equal(rampHeight(m.t, t.door), TOWER.top);
    const goal = map.cols[t.goal.z * 16 + t.goal.x].at(-1);
    assert.equal(goal.tower, 'top');
    for (const h of [FOGGERY.height, FOGGERY_BALL.height]) assert.ok(findPath(map.guardian.floor, goal, 200, h), `${seed}: he climbs to the top`);
    assert.ok(findPath(goal, map.portals[1].floor, 200, CHAR_H), `${seed}: the way down to the well`);
    // a slow walker up the ramp keeps ahead of the rising lava (half again as slow as walking)
    const path = findPath(map.portals[0].floor, goal, 200, CHAR_H);
    path.forEach((f, i) => {
      const at = i / WALK_SPEED * 1.5, lava = tideLevel(map.tide, Math.min(1, at / FOGGERY_FIGHT.lava.rise));
      assert.ok(floorY(f, 0.5, 0.5) / LH > lava, `${seed}: overtaken at ${f.x},${f.z} (${at.toFixed(1)} s)`);
    });
    // the top: flat, a good few cells; some of the platforms' slots touch it
    const top = map.floors.filter(f => f.tower === 'top');
    assert.ok(top.length >= 28 && top.every(f => f.cs.every(y => y === TOWER.top * LH)));
    assert.ok(map.movers.touch.length >= PLATFORMS.near + 2);
    // nothing of the tower reaches up close under where the platforms float
    for (const s of map.movers.slots) for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++)
      for (const f of map.cols[(s.z + b) * 16 + s.x + a]) assert.ok(Math.max(...f.cs) / LH <= PLATFORMS.top - PLATFORMS.clear, `${f.x},${f.z}`);
    // stones and rocks lie about, none in the doorway
    assert.ok(map.arenaPlacements.length > 20);
    for (const q of map.arenaPlacements) assert.ok(!map.portals[0].cells.includes(Math.floor(q.z) * 16 + Math.floor(q.x)), q.name);
  }
});

test('the platforms slide like a sliding puzzle: into empty slots next to theirs, never stopping, never overlapping, nobody left alone for long', () => {
  for (const seed of [1, 4, 9]) {
    const { map } = fifthDescent(seed), mv = map.movers, cache = {}, S = mv.slots;
    assert.ok(S.length >= 30 && S.length <= slotGrid().length);
    assert.deepEqual(mv.next, slotNext(S));
    assert.equal(mv.start.length, PLATFORMS.count);
    assert.ok(mv.start.filter(s => mv.touch.includes(s)).length >= PLATFORMS.near);
    let prev = null;
    const lonely = new Array(PLATFORMS.count).fill(0);
    for (let n = 0; n < 2000; n++) {
      const { occ, moves } = puzzleAt(mv, n * PLATFORMS.every, cache);
      const held = [...occ].filter(p => p >= 0);
      assert.equal(held.length, PLATFORMS.count); assert.equal(new Set(held).size, PLATFORMS.count);
      assert.ok(mv.touch.filter(s => occ[s] >= 0).length >= PLATFORMS.near, `step ${n}`);
      // they never stop
      assert.ok(moves.length >= 1 && moves.length <= PLATFORMS.moves, `step ${n}: ${moves.length} moves`);
      for (const m of moves) { assert.equal(occ[m.from], m.p); assert.equal(occ[m.to], -1); assert.ok(mv.next[m.from].includes(m.to)); }
      assert.equal(new Set(moves.map(m => m.to)).size, moves.length);
      if (prev) for (let s = 0; s < S.length; s++) assert.ok(occ[s] === prev.occ[s] || prev.moves.some(m => m.from === s || m.to === s));
      prev = { occ: Int8Array.from(occ), moves };
      // whoever stands on one can soon jump on to another: none stays alone long
      for (let s = 0; s < S.length; s++) if (occ[s] >= 0) {
        const p = occ[s], alone = mv.next[s].every(c => occ[c] < 0);
        lonely[p] = alone ? lonely[p] + 1 : 0;
        assert.ok(lonely[p] <= 10, `${seed}: platform ${p} alone for ${lonely[p]} steps at step ${n}`);
      }
    }
    // every game that knows the time sees the same, whatever it asked before
    assert.deepEqual(platformsAt(mv, 123.4, {}), platformsAt(mv, 123.4, cache));
    // half way through a slide: between its slots
    const t = 7 * PLATFORMS.every + PLATFORMS.move / 2, { moves } = puzzleAt(mv, t, {}), at = platformsAt(mv, t, {});
    const m = moves[0], p = at.find(o => o.p === m.p);
    assert.ok(Math.abs(p.x - (S[m.from].x + S[m.to].x) / 2) < 1e-9 && Math.abs(p.z - (S[m.from].z + S[m.to].z) / 2) < 1e-9);
  }
  // no move that would leave the top too few, while another can move; and when none other can,
  // they still do not stop
  const slots = slotGrid(), next = slotNext(slots), occ = new Int8Array(slots.length).fill(-1), touch = [0, 1, 2];
  occ[0] = 0; occ[1] = 1; occ[2] = 2; occ[20] = 3;
  for (let i = 0; i < 20; i++) {
    const moves = puzzleMoves(occ, [-1, -1, -1, -1], touch, next, mulberry32(i));
    assert.ok(moves.length && moves.every(m => m.p === 3), JSON.stringify(moves));
  }
  occ[20] = -1;
  assert.equal(puzzleMoves(occ, [-1, -1, -1], touch, next, mulberry32(1)).length, 1);
  assert.equal(puzzleStart(slots, touch, mulberry32(3)).filter(s => touch.includes(s)).length, 3);
});

test('his fight: eyes thrown one at a time, Fire-faces, then the ball, his cats, fireballs and geysers', () => {
  assert.equal(splitHp(1000, 1), 334); assert.equal(splitHp(1000, 2), 167);
  assert.equal(summonCount(1, 1), 2); assert.equal(summonCount(2, 0), 2); assert.equal(summonCount(3, 2), 0);
  // phase 1: an eye only while he has it; the summon when due
  const names = list => FOGGERY.attacks.map(a => a.name).filter(n => !list.has(n));
  assert.deepEqual(names(barred({ phase: 1, eyes: [1, 1] })), ['eyeL', 'eyeR']);
  assert.deepEqual(names(barred({ phase: 1, eyes: [0.4, 1], summonDue: true })), ['eyeR', 'summon']);
  assert.deepEqual(names(barred({ phase: 1, eyes: [0, 0.2] })), []);
  // phases 2 and 3: his cats when due and nothing else; the fireball, the volley, the geysers when due
  const ball = list => FOGGERY_BALL.attacks.map(a => a.name).filter(n => !list.has(n));
  assert.deepEqual(ball(barred({ phase: 2, catsDue: true, geyserDue: true })), ['cats']);
  assert.deepEqual(ball(barred({ phase: 2 })), ['spit']);
  assert.deepEqual(ball(barred({ phase: 3, geyserDue: true })), ['volley', 'geyser']);
  // the eyes are each thrown from their own hand; the cats are called warded, from any height
  const [eyeL, eyeR] = FOGGERY.attacks;
  assert.equal(eyeL.projectile.eye, 0); assert.equal(eyeR.projectile.eye, 1);
  assert.equal(eyeL.projectile.muzzle[0], -eyeR.projectile.muzzle[0]);
  const cats = FOGGERY_BALL.attacks.find(a => a.name === 'cats');
  assert.ok(cats.ward && cats.cast && cats.summon.kind === 'fogcat');
  assert.ok(wardedNow({ mode: 'attack', profile: FOGGERY_BALL, attack: FOGGERY_BALL.attacks.indexOf(cats) }));
  const geyser = FOGGERY_BALL.attacks.find(a => a.name === 'geyser');
  assert.ok(geyser.beam.kind === 'geyser' && geyser.beam.bolts === 3 && geyser.burn && geyser.pop > 0);
  assert.equal(FOGGERY_BALL.attacks.find(a => a.name === 'volley').projectile.volley, 3);
  assert.equal(FOGGERY_FIGHT.catsAgain, 8); assert.equal(FOGGERY_FIGHT.lava.rise, 60);
});
