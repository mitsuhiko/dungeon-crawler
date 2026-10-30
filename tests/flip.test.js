import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { World } from '../src/world/world.js';
import { BOSSES, bossAt, BOSS_ARENAS } from '../src/core/bosses.js';
import { FLIP, SKY_WOLLA, WOLLA, ENEMY_KINDS, makeEnemy, guardianLevel, attacksInReach, wardedNow } from '../src/core/enemies.js';
import { FLIP_FIGHT, splitHp, summonCount, barred, S, MID, vi, GROUP, FACES, SIDES, IDENTITY, ORIENTS, orientKey, orientIndex,
  mul, transpose, rotation, turnTo, turnPoint, downFace, opposite, nextDown, orientedFloors, brokenWalls, apply } from '../src/core/flip.js';
import { FLIP_ARENA } from '../src/cubegen/fliparena.js';
import { propMetadata } from '../src/core/propcatalog.js';
import { guardianSpots } from '../src/game/enemyspawn.js';
import { speciesIn, kindsIn } from '../src/core/spawns.js';
import { guardianId, gateLocked, guardianLockMessage } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';
import { insideSolid, groundAt } from '../src/physics/collide.js';
import { findPath } from '../src/physics/enemynav.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { LH } from '../src/core/constants.js';

const fourthDescent = seed => {
  const w = new World(seed), L = w.layout(3);
  return { w, L, map: state.map = w.cube(L.down).map };
};
const named = name => FLIP.attacks.find(a => a.name === name);
// the box with each side down (the walls by a quarter turn from the floor, the top by a half)
const everySide = O0 => Object.keys(FACES).map(face => face === downFace(O0) ? O0 : turnTo(O0, face, 0.3).O);

test('Flip takes the place of the descent guardian of depth 3, and only that one', () => {
  assert.equal(BOSSES[3], 'flip');
  assert.equal(bossAt(3), 'flip'); assert.equal(bossAt(3, 'side'), null);
  for (const seed of [0, 1, 7]) {
    const w = new World(seed);
    for (let d = 2; d < 5; d++) for (const [key, g] of w.layout(d).guardians) {
      const boss = d === 3 && g.role === 'descent';
      assert.equal(g.boss === 'flip', boss, `${seed} ${d} ${key}`);
      if (!boss) continue;
      const map = w.cube(key).map;
      assert.equal(map.guardian.boss, 'flip'); assert.equal(guardianLockMessage(map), 'Defeat Flip to unlock this descent');
    }
  }
});

test('he fights alone in his box, and brings his Sky wollas', () => {
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = fourthDescent(seed), spots = guardianSpots(map);
    assert.equal(map.arena.type, BOSS_ARENAS.flip.type);
    assert.equal(spots.length, 1);
    const [s] = spots;
    assert.equal(s.kind, FLIP); assert.equal(s.id, guardianId(map.key)); assert.equal(s.level, guardianLevel(3, 'descent'));
    assert.deepEqual(speciesIn(map).sort(), ['flip', 'wolla']);
    assert.deepEqual(kindsIn(map).sort(), ['flip', 'skywolla']);
    assert.ok(gateLocked(map, createRun()));
    assert.equal(map.flip.solid.length, S * S * S);
    // the doorway and the well stand at the entrance's level, the way between them is walkable
    const [entry, well] = map.portals;
    assert.equal(entry.y, well.y);
    for (const p of map.portals) for (const c of p.cells) assert.equal(map.cols[c][0].top * LH, entry.y, `${seed}: pad ${c}`);
    assert.ok(findPath(entry.floor, map.guardian.floor, 40, FLIP.height));
    assert.ok(findPath(map.guardian.floor, well.floor, 40, FLIP.height));
    // no props: only the box's own cells
    assert.equal(map.arenaPlacements.length, 0);
    assert.equal(buildCubeGeometry(map).length, 1);
  }
});

test('the box can be turned 24 ways; a turn brings the side asked for down, a quarter or half round', () => {
  assert.equal(ORIENTS.length, 24);
  assert.equal(new Set(ORIENTS.map(orientKey)).size, 24);
  for (const O of ORIENTS) {
    assert.equal(orientIndex(O), ORIENTS.indexOf(O));
    for (const face of Object.keys(FACES)) {
      const t = turnTo(O, face, 0.7);
      if (downFace(O) === face) { assert.equal(t, null); continue; }
      assert.equal(downFace(t.O), face, `${orientKey(O)} -> ${face}`);
      assert.equal(orientKey(t.O), orientKey(mul(t.R, O)));
      assert.equal(Math.abs(t.q), face === opposite(downFace(O)) ? 2 : 1);
    }
  }
  // a turned point goes round the middle of the box, and back
  for (const [axis, q] of [['x', 1], ['z', -1], ['x', 2]]) {
    const R = rotation(axis, q), p = turnPoint(R, 3, 2, 11), back = turnPoint(transpose(R), p.x, p.y, p.z);
    assert.deepEqual([back.x, back.y, back.z], [3, 2, 11]);
    assert.ok(Math.abs(Math.hypot(p.x - MID, p.y - MID, p.z - MID) - Math.hypot(3 - MID, 2 - MID, 11 - MID)) < 1e-9);
  }
  // he flips to the floor, the walls beside the one down or the island, never the opposite wall
  for (const down of Object.keys(FACES)) for (let r = 0; r < 1; r += 0.01) {
    const next = nextDown(down, 1, r);
    assert.notEqual(next, down);
    if (SIDES.includes(down)) assert.notEqual(next, opposite(down));
  }
});

test('every side of the box is a floor to fight on, the side overhead is gone, and the holes in it are shut', () => {
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = fourthDescent(seed);
    for (const O of everySide(IDENTITY)) {
      const { floors, cols, down } = orientedFloors(map.flip, O), fight = floors.filter(f => f.encounter);
      // the fight's floors: one walkable piece as big as the side (the island: smaller), mostly
      // at one level, with things to climb: raised floors and the stairs up to them
      const base = Math.min(...fight.map(f => f.top)), tops = new Set([base]);
      assert.ok(fight.filter(f => f.top === base).length > fight.length * 0.7, `${seed} ${down}: mostly flat`);
      assert.ok(fight.length >= (down === 'top' ? 40 : 150), `${seed} ${down}: ${fight.length} floors`);
      assert.ok(fight.filter(f => f.stair).length >= (down === 'top' ? 4 : 3), `${seed} ${down}: stairs`);
      assert.ok(fight.filter(f => f.top > base && !f.stair).length >= 1, `${seed} ${down}: something to climb`);
      // a stair rises a cell over its cell and is walked onto from both ends
      for (const f of fight.filter(g => g.stair)) {
        assert.equal(Math.max(...f.cs) - Math.min(...f.cs), 1);
        assert.ok(f.link.filter(Boolean).length >= 2, `${seed} ${down}: stair ${f.c} leads somewhere`);
      }
      const seen = new Set([fight[0]]), queue = [fight[0]];
      for (let i = 0; i < queue.length; i++) for (const g of queue[i].link) if (g && !seen.has(g)) { seen.add(g); queue.push(g); }
      assert.ok(fight.every(f => seen.has(f)), `${seed} ${down}: connected`);
      // nothing of the side overhead is left (it would hide everything from the camera)
      assert.ok(floors.every(f => f.top < S * 2 || f.bottom < (S - 1) * 2), `${seed} ${down}: no lid`);
      for (const col of cols) assert.ok(col.every((f, i) => i === 0 || f.bottom >= col[i - 1].top), 'stacked floors do not overlap');
      // the holes in the side down are thin floors over a gap, at the floor's level
      const holes = floors.filter(f => f.hole !== undefined), mine = map.flip.holes.filter(h => h.face === down);
      assert.equal(holes.length > 0, mine.length > 0);
      for (const f of holes) {
        assert.equal(f.bottom, f.top - 1);
        assert.ok(f.encounter && f.top === [...tops][0], `${seed} ${down}: hole ${f.c} is part of the floor`);
        assert.equal(cols[f.c].filter(g => g.top <= f.top).length, 1, 'nothing under a hole');
      }
    }
  }
});

test('turning the box carries what stood in it into open space, and it falls onto the new floor', () => {
  for (const seed of [0, 3]) {
    const { map } = fourthDescent(seed);
    let O = IDENTITY;
    for (const face of ['px', 'pz', 'top', 'nx', 'bottom', 'nz', 'top']) {
      const before = orientedFloors(map.flip, O), t = turnTo(O, face, 0.6);
      const after = orientedFloors(map.flip, t.O);
      for (const f of before.floors.filter(g => g.encounter && g.hole === undefined)) {
        // a body standing there (its middle), turned with the box
        state.map = { ...map, cols: before.cols, floors: before.floors };
        const x = f.x + 0.5, y = f.top * LH + 0.4, z = f.z + 0.5;
        assert.ok(!insideSolid(x, z, y));
        const p = turnPoint(t.R, x, y, z);
        state.map = { ...map, cols: after.cols, floors: after.floors };
        assert.ok(!insideSolid(p.x, p.z, p.y), `${seed} ${face}: ${x},${y},${z} -> inside`);
        // something under it, or (upside down) the vortex takes it to the island
        if (face !== 'top') assert.ok(Number.isFinite(groundAt(p.x, p.z, p.y, 0).h), `${seed} ${face}: nothing under it`);
      }
      O = t.O;
    }
  }
});

test('the holes are high in the walls: shut over the floor, none at the floor\'s level but the doorway', () => {
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = fourthDescent(seed), { bottom, holes } = map.flip;
    const door = holes.filter(h => h.door);
    assert.equal(door.length, 1);
    for (const h of holes) {
      assert.ok(SIDES.includes(h.face));
      for (const i of h.cells) {
        assert.equal(map.flip.solid[i], 0);
        const y = Math.floor(i / (S * S));
        // out of reach from the floor (a jump is less than a cell), the doorway down at it
        if (h.door) assert.ok(y >= bottom && y < bottom + FLIP_ARENA.door);
        else assert.ok(y >= bottom + 3, `${seed}: hole ${h.id} at ${y}`);
      }
    }
    // the island floats in the middle, its underside (the floor upside down) flat but for the
    // little stepped pyramid in its middle
    const I = FLIP_ARENA.island;
    let cells = 0, under = 0;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) if (map.flip.solid[vi(x, I.y0, z)] === GROUP.island) {
      cells++;
      const below = map.flip.solid[vi(x, I.y0 - 1, z)];
      assert.ok(below === 0 || below === GROUP.island);
      if (below) under++;
    }
    assert.ok(cells >= 40 && under === 5, `${seed}: ${under}`);
  }
});

test('a balcony juts out of a wall beside every side, up a staircase: the fight may go on up there', () => {
  let n = 0;
  for (const seed of [0, 1, 2, 7, 42]) {
    const { map } = fourthDescent(seed), { shelves } = map.flip;
    n += shelves.length;
    for (const sh of shelves) {
      assert.ok(SIDES.includes(sh.host) && sh.host !== sh.face && sh.host !== opposite(sh.face));
      const O = sh.face === 'bottom' ? IDENTITY : turnTo(IDENTITY, sh.face, 0).O, { floors } = orientedFloors(map.flip, O);
      const fight = floors.filter(f => f.encounter), base = Math.min(...fight.map(f => f.top));
      const up = fight.filter(f => f.shelf && !f.stair), stairs = fight.filter(f => f.shelf && f.stair);
      // a platform four cells up, as big as twenty cells, and its four stairs, all walked to from the floor
      assert.ok(up.length >= 18 && up.every(f => f.top === base + 8), `${seed} ${sh.face}: ${up.length}`);
      assert.equal(stairs.length, 4);
    }
  }
  assert.ok(n >= 22, `${n} balconies`);
});

test('the walls round the floor break open but for a parapet, a frame and the balcony', () => {
  for (const seed of [0, 7]) {
    const { map } = fourthDescent(seed), flip = map.flip;
    for (const O of everySide(IDENTITY)) {
      const { floors } = orientedFloors(flip, O), fight = floors.filter(f => f.encounter), baseY = Math.min(...fight.map(f => f.top)) * LH;
      const { faces, removed } = brokenWalls(flip, O, baseY);
      assert.ok(faces.every(f => apply(O, FACES[f])[1] === 0));
      assert.ok(removed.size > (downFace(O) === 'top' ? 20 : 200), `${seed} ${downFace(O)}: ${removed.size}`);
      for (const i of removed) {
        assert.ok(!flip.shelf[i] && faces.map(f => GROUP[f]).includes(flip.solid[i]));
        const p = turnPoint(O, i % S + 0.5, Math.floor(i / (S * S)) + 0.5, Math.floor(i / S) % S + 0.5);
        assert.ok(p.y > baseY + 2 && p.y < S - 1, 'the parapet and the top stay');
      }
      // broken open, the floor is still all there to fight on, and still walled in by the parapet
      const after = orientedFloors(flip, O, removed), still = after.floors.filter(f => f.encounter);
      assert.ok(still.length >= fight.length - 2, `${seed} ${downFace(O)}: ${still.length} of ${fight.length}`);
    }
  }
});

test('every side has its clutter glued to it, standing in nobody\'s way', () => {
  for (const seed of [0, 1, 6, 42]) {
    const { map } = fourthDescent(seed), { clutter } = map.flip;
    for (const side of ['bottom', ...SIDES, 'island']) assert.ok(clutter.filter(c => c.side === side).length >= 6, `${seed} ${side}`);
    for (const c of clutter) {
      const p = propMetadata.get(c.name);
      assert.ok(p && !p.blocking && p.attach === 'ground', c.name);
      // its foot on the side, its up the side's way in, in open air
      const up = c.normal, x = c.x + up[0] * 0.25, y = c.y + up[1] * 0.25, z = c.z + up[2] * 0.25;
      assert.equal(map.flip.solid[vi(Math.floor(x), Math.floor(y), Math.floor(z))], 0, `${seed} ${c.name} in a wall`);
      const bx = c.x - up[0] * 0.25, by = c.y - up[1] * 0.25, bz = c.z - up[2] * 0.25;
      assert.ok(map.flip.solid[vi(Math.floor(bx), Math.floor(by), Math.floor(bz))], `${seed} ${c.name} on nothing`);
    }
  }
});

test('his attacks: a ball, a volley in phase 2, the flip (warded), Sky wollas and black holes', () => {
  assert.equal(named('throw').projectile.kind, 'ball');
  assert.equal(named('volley').projectile.volley, 3);
  assert.ok(named('flip').cast === 'flip' && named('flip').ward);
  assert.ok(named('hole').cast === 'hole' && !named('hole').ward);
  assert.equal(named('summon').summon.kind, 'skywolla');
  const e = makeEnemy({ id: 'f', level: 5, x: 8, y: 2, z: 8 }, FLIP);
  e.mode = 'attack'; e.attack = FLIP.attacks.indexOf(named('flip'));
  assert.ok(wardedNow(e));
  // a flip can start from anywhere, at any height
  assert.ok(attacksInReach(FLIP, 30, 8).includes(FLIP.attacks.indexOf(named('flip'))));
  // the Sky wolla: a light blue Wolla, a minion
  assert.equal(SKY_WOLLA.species, WOLLA.species); assert.ok(SKY_WOLLA.minion); assert.equal(ENEMY_KINDS.skywolla, SKY_WOLLA);
  assert.ok(SKY_WOLLA.hp < WOLLA.hp && SKY_WOLLA.coins[1] === 0);
});

test('the fight\'s rules: the flip once due bars the rest, black holes and the volley only in phase 2', () => {
  const all = ['throw', 'volley', 'flip', 'summon', 'hole'];
  const allowed = s => all.filter(n => !s.has(n));
  assert.deepEqual(allowed(barred({ phase: 1, flipDue: true, summonDue: true, holeDue: true })), ['flip']);
  assert.deepEqual(allowed(barred({ phase: 1, flipDue: false, summonDue: false, holeDue: true })), ['throw']);
  assert.deepEqual(allowed(barred({ phase: 1, flipDue: false, summonDue: true, holeDue: false })), ['throw', 'summon']);
  assert.deepEqual(allowed(barred({ phase: 2, flipDue: false, summonDue: false, holeDue: true })), ['volley', 'hole']);
  assert.deepEqual(allowed(barred({ phase: 2, flipDue: true, summonDue: true, holeDue: true })), ['flip']);
  assert.equal(splitHp(1680), 840);
  assert.equal(summonCount(1, 1), FLIP_FIGHT.minions[0] - 1); assert.equal(summonCount(2, 9), 0);
  // a turn is over before the next one may start, and the holes open only after a landing
  assert.ok(FLIP_FIGHT.turnHalf < FLIP_FIGHT.flip.every[0] && FLIP_FIGHT.holes.delay > 0);
});
