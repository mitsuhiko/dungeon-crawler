// The Squirtles live in fluids (physics/dwell.js): put down only in one, moving only through it,
// leaping onto the land only to crash down on a player near it, and running back into it as a
// puddle. (What their AI does with that, game/enemyai.js `ashore` and `closeIn`,
// tests/browser/squirtle.js plays out: the AI needs the renderer.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { LH, WATER, LAVA, ACID } from '../src/core/constants.js';
import { SQUIRTLE, CORAL_SQUIRTLE, MOSS_SQUIRTLE, ENEMY_KINDS, makeEnemy } from '../src/core/enemies.js';
import { World } from '../src/world/world.js';
import { testRoomKey } from '../src/world/testrooms.js';
import { walker, walkerOf, wetAt, standY, livesOn, SUNK } from '../src/physics/dwell.js';
import { walkable, findPath, nearest, stepEnemy } from '../src/physics/enemynav.js';
import { shape, fieldOf, restPose, MOUTH, SIZE, MID } from '../src/render/squirtleshape.js';
import { surfaceNets, field } from '../src/render/fluidfield.js';
import { enemySpots } from '../src/game/enemyspawn.js';
import { population } from '../src/core/spawns.js';
import { setTide } from '../src/physics/fluid.js';

const world = new World(4);
const room = name => state.map = world.cube(testRoomKey(name, 3)).map;
const floor = (m, x, z) => m.cols[z * 16 + x].find(f => !f.kind && f.layer === 0);
const lake = m => m.floors.filter(f => f.fluid === WATER);
const ashore = (m, x, z) => m.floors.find(f => !f.fluid && f.x === x && f.z === z);

test('a wave taller than the hero, its ball of water a bit bigger, a leap, and each kind lives in its own fluid', () => {
  assert.deepEqual([SQUIRTLE.radius, SQUIRTLE.height], [0.65, 1.8]);
  const leap = SQUIRTLE.attacks.find(a => a.name === 'leap');
  assert.ok(leap.ride.onto && leap.beam.kind === 'stomp' && leap.minReach > 0 && leap.reach < SQUIRTLE.reach, 'a leap onto a player near it');
  assert.ok(SQUIRTLE.projectile.radius > 0.15 && ENEMY_KINDS.slimesquirtle.projectile.radius > 0.17);
  assert.deepEqual([SQUIRTLE.dwells, MOSS_SQUIRTLE.dwells, CORAL_SQUIRTLE.dwells], [[WATER], [ACID], [LAVA]]);
});

test('in the lake of the shores room it floats, lives on its water alone, and climbs back into it from the bank', () => {
  const m = room('shores'), water = lake(m), f = floor(m, 7, 8), bank = ashore(m, 2, 8);
  assert.ok(water.length > 20 && f.fluid === WATER);
  assert.equal(wetAt(SQUIRTLE, f), f.surf * LH);
  assert.equal(standY(SQUIRTLE, f, 7.5, 8.5), f.surf * LH - SQUIRTLE.bodyHeight * SUNK, 'floating, a third of it under');
  const inside = walker(SQUIRTLE);
  assert.ok(walkable(f, inside) && !walkable(bank, inside), 'its water only');
  assert.ok(findPath(f, floor(m, 4, 11), 20, inside), 'a way through the lake');
  assert.equal(findPath(f, floor(m, 9, 10), 40, inside), null, 'never under the bridge: too low for it');
  assert.equal(findPath(f, bank, 40, inside), null, 'none onto the land');
  assert.equal(walkable(f, SQUIRTLE.height), false, 'and no other walks in it');
  // from the bank, over the land, into the water
  const back = nearest(bank, g => livesOn(SQUIRTLE, g), 40, walker(SQUIRTLE, true));
  assert.ok(back && back.at(-1).fluid === WATER);
  // a Coral squirtle has no lava here: the lake is not for it
  assert.equal(wetAt(CORAL_SQUIRTLE, f), null);
});

test('it is not shoved out of its water, and stepping keeps it floating', () => {
  const m = room('shores'), f = floor(m, 4, 8);
  const e = makeEnemy({ id: 'sq', f, x: f.x + 0.5, y: standY(SQUIRTLE, f, f.x + 0.5, f.z + 0.5), z: f.z + 0.5, level: 3 }, SQUIRTLE);
  assert.equal(walkerOf(e), walker(e.profile));
  for (let i = 0; i < 30; i++) stepEnemy(e, -0.1, 0);
  assert.ok(e.f.fluid === WATER && e.x > 4, 'held at the shore');
  assert.ok(Math.abs(e.y - (e.f.surf * LH - e.profile.bodyHeight * SUNK)) < 1e-9);
});

test('a standing fluid of its own over the floor is its water too, while it is deep enough', () => {
  const m = room('enemies'), g = m.floors.find(f => f.x === 8 && f.z === 8), top = g.top * LH;
  try {
    setTide({ y: top + 0.4, fluid: WATER, box: [0, 0, 16, 16] });
    assert.equal(wetAt(SQUIRTLE, g), top + 0.4);
    assert.equal(wetAt(MOSS_SQUIRTLE, g), null);
    setTide({ y: top + 0.4, fluid: WATER, look: ACID, box: [0, 0, 16, 16] });
    assert.equal(wetAt(MOSS_SQUIRTLE, g), top + 0.4, "Slomo's flood: water drawn as slime");
    setTide({ y: top + 0.05, fluid: WATER, box: [0, 0, 16, 16] });
    assert.equal(wetAt(SQUIRTLE, g), null, 'too shallow');
  } finally { setTide(null); }
});

test('the Squirtles of a cube are all in its fluids, each kind in its own', () => {
  let n = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World(seed);
    for (const depth of [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17]) for (const k of [...w.layout(depth).exists].slice(0, 30)) {
      const m = state.map = w.cube(k).map;
      if (m.guardian || !population(m).has('squirtle')) continue;
      for (const s of enemySpots(m, SQUIRTLE)) {
        n++;
        assert.ok(s.f.fluid && s.kind.dwells.includes(s.f.fluid), `${s.kind.type} in ${s.f.fluid}`);
        assert.ok(livesOn(s.kind, s.f));
      }
    }
  }
  assert.ok(n > 10, `${n} Squirtles`);
});

test('its body: a closed surface on the sketch\'s curve, its mouth open between the snout and the jaw, a puddle when it melts', () => {
  const body = p => { const sh = shape(p), { s, box } = fieldOf(sh, p, 0); return { sh, s, ...surfaceNets(s, box, 0.08) }; };
  const rest = body(restPose());
  assert.ok(rest.pos.length / 3 > 500 && rest.idx.length % 3 === 0 && rest.idx.every(i => i < rest.pos.length / 3));
  const top = Math.max(...rest.pos.filter((_, i) => i % 3 === 1));
  assert.ok(top > 1.4 && top < SQUIRTLE.height, 'taller than the hero, under its height: ' + top.toFixed(2));
  // the middle of the mouth (where it spits from) is outside the body, open; the jaw under it is not
  const m = rest.sh.place(MOUTH[0], MOUTH[1], 'head');
  assert.ok(field(rest.s, 0, m[1], m[2]) > 0, 'the mouth is open');
  const [, my, mz] = SQUIRTLE.attacks[0].projectile.muzzle;
  assert.ok(Math.abs(my - MOUTH[1] * SIZE) < 0.05 && Math.abs(mz - (MOUTH[0] - MID) * SIZE) < 0.05, 'it spits from its mouth');
  // a puddle: flat and low
  const puddle = body(restPose({ puddle: 1 }));
  assert.ok(Math.max(...puddle.pos.filter((_, i) => i % 3 === 1)) < 0.15, 'flat');
});
