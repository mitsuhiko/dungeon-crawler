import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, WATER, LAVA, ACID, MUD, HEAD_Y, SWIM_FEET, SWIM_DEPTH, SWIM_STEP } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { canMove } from '../src/physics/canmove.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, wading, wadeable, tooDeep, peril, swimWater, setTide } from '../src/physics/fluid.js';
import { climb } from '../src/physics/climb.js';
import { wayOut } from '../src/physics/swimout.js';
import { flight, along, RESCUE, CARRIED_H, shareOf } from '../src/core/rescue.js';

function bank(dx = 1, dz = 0, fluid = WATER) {
  const m = flatMap(), f = m.floors[5 * N + 5], water = m.floors[(5 + dz) * N + 5 + dx];
  Object.assign(water, { fluid, surf: -1, top: -3, bottom: -5, cs: [-1.5, -1.5, -1.5, -1.5] });
  Object.assign(player, { x: 5.5 + dx * 0.24, z: 5.5 + dz * 0.24, y: 0,
    vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0,
    support: f, stun: 0, coyote: 0, jumpBuf: 0 });
  return water;
}

test('walking and running stop before water, lava and acid ledges in every direction', () => {
  for (const fluid of [WATER, LAVA, ACID]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const run of [false, true]) {
      bank(dx, dz, fluid);
      for (let i = 0; i < 120; i++) movePlayer(1 / 60, dx, dz, run, false);
      assert.equal(Math.floor(player.x), 5);
      assert.equal(Math.floor(player.z), 5);
      assert.equal(player.y, 0);
      assert.equal(player.grounded, true);
      assert.equal(dx ? player.vx : player.vz, 0);
    }
  }
});

test('water guard includes corner probes and still permits sliding along the bank', () => {
  bank(); player.z = 5.99;
  assert.equal(canMove(5.8, 5.99, 'x', 1), false);
  assert.equal(canMove(5.74, 5.9, 'z', -1), true);
});

test('jumping and airborne movement can cross the guarded edge', () => {
  bank();
  movePlayer(1 / 60, 1, 0, false, true);
  assert.equal(player.grounded, false);
  assert.ok(player.vy > 0);
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  for (let i = 0; i < 20; i++) movePlayer(1 / 60, 1, 0, false, false);
  assert.ok(player.x > 6);
});

test('dry drops remain unguarded; every fluid and every void is guarded', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
    bank(1, 0, fluid);
    assert.equal(canMove(5.85, 5.5, 'x', 1), false);
  }
  const dry = bank(); dry.fluid = 0;
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  const hole = bank(); state.map.cols[hole.c] = [];
  assert.equal(canMove(5.85, 5.5, 'x', 1), false);
  // a floor overhead is nothing to stand on either
  state.map.cols[hole.c] = [{ ...hole, fluid: 0, top: 8, bottom: 6, cs: [4, 4, 4, 4] }];
  assert.equal(canMove(5.85, 5.5, 'x', 1), false);
});

test('walking and running stop before a hole through the cube in every direction', () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const run of [false, true]) {
    const hole = bank(dx, dz); state.map.cols[hole.c] = [];
    for (let i = 0; i < 120; i++) movePlayer(1 / 60, dx, dz, run, false);
    assert.equal(Math.floor(player.x), 5);
    assert.equal(Math.floor(player.z), 5);
    assert.equal(player.y, 0);
    assert.equal(player.grounded, true);
  }
  // a jump still goes out over it, and a bridge across it is walkable
  const hole = bank(); state.map.cols[hole.c] = [];
  movePlayer(1 / 60, 1, 0, false, true);
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  bank(); state.map.cols[hole.c] = [];
  state.map.pieces[hole.c].push({ c: hole.c, kind: 'bridge', dx: 1, dz: 0, j: 0, run: { kind: 'landing', y0: 0 } });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
});

test('bridges and stacked dry floors above fluids stay walkable', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
  const water = bank(1, 0, fluid);
  state.map.pieces[water.c].push({ c: water.c, kind: 'bridge', dx: 1, dz: 0, j: 0,
    run: { kind: 'landing', y0: 0 } });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  assert.equal(inFluid(groundAt(6.5, 5.5, 0, 0), -0.1), 0);
  state.map.pieces[water.c] = [];
  state.map.cols[water.c].push({ ...water, fluid: 0, bottom: -0.4, cs: [0, 0, 0, 0] });
  assert.equal(canMove(5.85, 5.5, 'x', 1), true);
  assert.equal(inFluid(groundAt(6.5, 5.5, 0, 0), -0.1), 0);
  }
});

test('fluid contact begins below the surface, not while jumping above it; water only over the head', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
    const water = bank(1, 0, fluid), gr = groundAt(6.5, 5.5, 10, 0), surface = water.surf * LH;
    assert.equal(inFluid(gr, surface + 1), 0);
    assert.equal(inFluid(gr, surface), 0);
    assert.equal(inFluid(gr, surface - 0.01), fluid === WATER ? 0 : fluid, 'water only drowns over the head');
    assert.equal(inFluid(gr, surface - HEAD_Y - 0.01), fluid);
    water.fluid = 0;
    assert.equal(inFluid(gr, surface - HEAD_Y - 0.01), 0);
  }
  assert.equal(inFluid({ s: null }, -10), 0);
});

test('water shallower than the head is waded through, slowly; deeper water and the rest stop walking', () => {
  // a step down into water half a cell deep: walked into, the player wades on, slowed
  for (const [fluid, wades] of [[WATER, true], [LAVA, false], [ACID, false]]) {
    const water = bank(1, 0, fluid);
    Object.assign(water, { surf: -0.4, top: -1, cs: [-0.5, -0.5, -0.5, -0.5] });
    assert.equal(canMove(5.85, 5.5, 'x', 1), wades, `${fluid}`);
  }
  const water = bank();
  Object.assign(water, { surf: -0.4, top: -1, cs: [-0.5, -0.5, -0.5, -0.5] });
  state.map.floors[5 * N + 5].cs = [-0.5, -0.5, -0.5, -0.5]; state.map.floors[5 * N + 5].top = -1;
  player.y = -0.5;
  for (let i = 0; i < 30; i++) movePlayer(1 / 60, 1, 0, true, false);
  assert.ok(player.x > 6, 'walked in');
  const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
  assert.equal(inFluid(gr, player.y), 0, 'not drowned');
  assert.ok(wading(gr, player.y) > 0.2 && wading(gr, player.y) < HEAD_Y);
});

test('a sloping bed is waded down, and once the water lifts the body it swims on; from dry land the deep water stops walking', () => {
  // the next cell's bed falls from 0.3 under the surface at its near edge to 1.7 at its far one
  const slope = () => {
    const water = bank();
    Object.assign(water, { surf: 0, top: -4, cs: [-0.3, -1.7, -0.3, -1.7] });
    state.map.floors[5 * N + 5].cs = [0, -0.3, 0, -0.3];
    return water;
  };
  assert.ok(tooDeep(slope()), 'too deep to wade at its floor top');
  for (const run of [false, true]) {
    slope();
    let waded = 0, swam = false;
    for (let i = 0; i < 240 && !swam; i++) {
      movePlayer(1 / 60, 1, 0, run, false);
      const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
      assert.equal(peril(gr, player.y), null, 'nothing takes the hero in water');
      if (player.wade > 0) waded++;
      swam = player.swimming;
    }
    assert.ok(waded > 5 && swam, `waded in (${waded} frames), then swam`);
    for (let i = 0; i < 120; i++) movePlayer(1 / 60, 0, 0, false, false);
    assert.ok(Math.abs(player.y - (0 - SWIM_FEET)) < 0.02, `afloat with the feet ${SWIM_FEET} under the surface: ${player.y}`);
  }
  // from dry land straight over the edge of deep water: held back, but not wading already
  const deep = bank();
  assert.equal(wadeable(groundAt(6.5, 5.5, 0, 0)), false);
  assert.equal(wadeable(groundAt(6.5, 5.5, 0, 0), true), true, 'wading already, on into it');
  void deep;
});

test('a jump into deep water swims: afloat at its swimming height, slow, and nothing drowns', () => {
  bank();
  movePlayer(1 / 60, 1, 0, true, true);
  let swam = 0;
  for (let i = 0; i < 90; i++) { movePlayer(1 / 60, i < 30 ? 1 : 0, 0, false, false); if (player.swimming) swam++; }
  assert.ok(swam > 30, 'swimming');
  assert.ok(Math.floor(player.x) === 6, 'in the water');
  assert.equal(player.grounded, false);
  assert.ok(Math.abs(player.y - (-0.5 - SWIM_FEET)) < 0.03, `afloat: ${player.y}`);
  assert.equal(peril(groundAt(player.x, player.z, player.y + 0.1, 0), player.y), null);
  assert.equal(swimWater(groundAt(player.x, player.z, player.y + 0.1, 0)), -0.5);
  // a jump out of it is a hop: back into it
  movePlayer(1 / 60, 0, 0, false, true);
  assert.ok(!player.swimming && player.vy > 0);
  for (let i = 0; i < 90; i++) movePlayer(1 / 60, 0, 0, false, false);
  assert.ok(player.swimming, 'back in the water');
});

test('a swimmer climbs out onto a bank a level over the water, not onto one two levels over', () => {
  for (const [bankTop, out] of [[0, true], [0.5, false]]) {
    const water = bank();
    const shore = state.map.floors[5 * N + 5];
    Object.assign(shore, { top: bankTop / LH, cs: Array(4).fill(bankTop) });
    Object.assign(player, { x: 6.5, y: water.surf * LH - SWIM_FEET, z: 5.5, grounded: false, swimming: true, support: water, wade: 0 });
    for (let i = 0; i < 240; i++) movePlayer(1 / 60, -1, 0, false, false);
    assert.equal(player.x < 6, out, `bank ${bankTop} over a surface at ${water.surf * LH}: ${player.x}`);
    if (out) assert.ok(player.grounded && !player.swimming && Math.abs(player.y - bankTop) < 1e-6);
    else assert.ok(player.swimming);
  }
  // wading on a bed a level under the surface, the same bank a level over it is climbed too
  const water = bank();
  Object.assign(water, { surf: -1, top: -2, cs: Array(4).fill(-1) });
  Object.assign(player, { x: 6.5, y: -1, z: 5.5, grounded: true, swimming: false, support: water });
  for (let i = 0; i < 240; i++) movePlayer(1 / 60, -1, 0, false, false);
  assert.ok(player.x < 6 && player.y === 0, `waded out: ${player.x}, ${player.y}`);
  assert.ok(SWIM_STEP > 2 * LH + SWIM_FEET - 2 * LH);
});

test('a swimmer goes under a bridge, not up through its deck', () => {
  const water = bank();
  for (let x = 6; x < 10; x++) {
    const f = state.map.floors[5 * N + x];
    Object.assign(f, { fluid: WATER, surf: -1, top: -3, bottom: -5, cs: Array(4).fill(-1.5) });
    // (its deck a level over the water's surface, its underside a little under the swimmer's head)
    state.map.pieces[f.c].push({ c: f.c, kind: 'bridge', dx: 1, dz: 0, j: 0, run: { kind: 'landing', y0: 0.5 } });
  }
  Object.assign(player, { x: 9.5, y: water.surf * LH - SWIM_FEET, z: 5.5, grounded: false, swimming: true, support: water });
  for (let i = 0; i < 90; i++) movePlayer(1 / 60, -1, 0, false, false);
  assert.ok(player.swimming && player.y < -0.9, `still swimming: ${player.y}`);
  assert.ok(player.x < 9, 'swam on');
});

test('what takes the hero: lava and acid on contact, a boss\'s mud or slime over the head; clear water never', () => {
  for (const fluid of [WATER, LAVA, ACID]) {
    const f = bank(1, 0, fluid), gr = groundAt(6.5, 5.5, 10, 0), surface = f.surf * LH;
    assert.equal(peril(gr, surface + 0.1), null, 'over it');
    assert.equal(peril(gr, surface - 0.01)?.fluid ?? 0, fluid === WATER ? 0 : fluid);
    assert.equal(peril(gr, surface - 3)?.fluid ?? 0, fluid === WATER ? 0 : fluid);
  }
  flatMap();
  const gr = groundAt(5.5, 5.5, 10, 0);
  gr.i = 5 * N + 5;
  for (const look of [0, MUD, ACID]) {
    setTide({ y: 1, fluid: WATER, look, box: [0, 0, N, N] });
    assert.equal(peril(gr, 0.5), null, 'waded');
    assert.equal(peril(gr, 1 - HEAD_Y - 0.05)?.look ?? null, look ? look : null, `over the head: ${look}`);
    assert.equal(swimWater(gr) !== null, !look, 'only clear water is swum in');
  }
  setTide(null);
  assert.ok(SWIM_DEPTH < HEAD_Y);
});

test('a ladder out of the water: taken hold of swimming, climbed out, and climbed down into it again', () => {
  const water = bank();
  const shore = state.map.floors[5 * N + 5];
  Object.assign(shore, { top: 4, cs: Array(4).fill(2) });
  state.map.ladders = [{ c: water.c, x: 6, z: 5, d: 1, y0: water.top * LH, y1: 2, wet: water.surf * LH, lo: water.id, hi: shore.id, style: 'wood' }];
  Object.assign(player, { x: 6.5, y: water.surf * LH - SWIM_FEET, z: 5.5, grounded: false, swimming: true, support: water, climb: null });
  let on = false;
  for (let i = 0; i < 600 && !(on && !player.climb); i++) { if (climb(1 / 60, -1, 0, false)) on = true; else movePlayer(1 / 60, -1, 0, false, false); }
  assert.ok(on, 'took hold of it');
  assert.equal(player.y, 2, 'up to its top');
  assert.equal(groundAt(player.x, player.z, player.y + 0.1, 0).s, shore);
  // and back down into the water
  Object.assign(player, { x: 5.6, y: 2, z: 5.5, grounded: true, swimming: false, support: shore });
  on = false;
  for (let i = 0; i < 600 && !(on && !player.climb); i++) { if (climb(1 / 60, 1, 0, false)) on = true; else movePlayer(1 / 60, 1, 0, false, false); }
  for (let i = 0; i < 30; i++) movePlayer(1 / 60, 0, 0, false, false);
  assert.ok(on && player.swimming, `down into it: ${player.y}`);
  state.map.ladders = [];
});

test('a way out of the water: a bank to climb onto, or none', () => {
  const water = bank();
  assert.equal(wayOut(6.5, 5.5, water.surf * LH), true, 'onto the ground beside it');
  // walled in a level and a half over it all round
  for (const f of state.map.floors) if (f !== water) Object.assign(f, { top: 2, cs: Array(4).fill(1) });
  assert.equal(wayOut(6.5, 5.5, water.surf * LH), false);
  state.map.ladders = [{ c: water.c, x: 6, z: 5, d: 1, y0: water.top * LH, y1: 1, wet: water.surf * LH, lo: water.id, hi: 0 }];
  assert.equal(wayOut(6.5, 5.5, water.surf * LH), true, 'up a ladder');
  state.map.ladders = [];
});

test('the robot\'s flight: up out of it, over to the spot under the roof, as long as it takes', () => {
  const a = { x: 2, y: 0, z: 2 }, b = { x: 8, y: 1, z: 5 };
  const f = flight(a, b);
  assert.deepEqual(f.at(0), a); assert.deepEqual(f.at(1), b);
  assert.ok(f.top <= Math.max(a.y, b.y) + RESCUE.rise + 1e-9 && f.top > b.y);
  assert.ok(f.time >= RESCUE.carry[0] && f.time <= RESCUE.carry[1]);
  // a low roof keeps it down (but over the higher end)
  const low = flight(a, b, () => 3);
  assert.ok(low.top <= 3 - CARRIED_H + 1e-9 || low.top === b.y + 0.3, `${low.top}`);
  for (let t = 0; t <= 1; t += 0.05) assert.ok(low.at(t).y <= Math.max(3 - CARRIED_H, b.y + 0.3) + 1e-9);
  assert.equal(along(0, 1), 0); assert.equal(along(1, 1), 1); assert.ok(along(0.5, 1) === 0.5);
  assert.equal(shareOf(WATER, 0), 0); assert.ok(shareOf(LAVA, 0) > 0 && shareOf(WATER, MUD) > 0);
});
