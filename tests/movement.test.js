import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, WALK_SPEED, RUN_SPEED, RUN_RAMP, BRAKE } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { flinchPlayer, PLAYER_POISE } from '../src/core/combat.js';

const DT = 1 / 60;
function stand() {
  const m = flatMap();
  Object.assign(player, { x: 2.5, z: 8.5, y: 0, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false,
    fluid: 0, support: m.floors[8 * N + 2], stun: 0, poised: 0, coyote: 0, jumpBuf: 0 });
}
const speed = () => Math.hypot(player.vx, player.vz);
// steps until the speed reaches `v` (or the limit), and how far that took
function until(v, dx, dz, run, limit = 120) {
  const x0 = player.x;
  for (let i = 1; i <= limit; i++) {
    movePlayer(DT, dx, dz, run, false);
    if (speed() >= v - 1e-9) return { t: i * DT, d: player.x - x0 };
  }
  return { t: Infinity, d: player.x - x0 };
}

test('the controller leaves a full poise window after a flinch so the hero can move under rapid hits', () => {
  stand(); flinchPlayer(player);
  for (let i = 0; i < 6; i++) movePlayer(DT, 1, 0, true, false);
  assert.ok(player.stun > 0 && player.poised === PLAYER_POISE.recovery);
  for (let i = 0; i < 4; i++) movePlayer(DT, 1, 0, true, false);
  assert.ok(player.stun <= 0);
  const x = player.x;
  for (let i = 0; i < 30; i++) {
    assert.equal(flinchPlayer(player), false);
    movePlayer(DT, 1, 0, true, false);
  }
  assert.ok(player.x > x + 0.5, 'held movement escapes instead of being stunlocked');
  assert.ok(player.poised > 0 && player.poised < 0.11);
});

test('running ramps up over RUN_RAMP, passing walking pace early, so taps stay precise', () => {
  stand();
  const walk = until(WALK_SPEED, 1, 0, true);
  assert.ok(walk.t < RUN_RAMP * 0.75, 'walking pace after about 70% of the ramp: ' + walk.t);
  stand();
  const run = until(RUN_SPEED, 1, 0, true);
  assert.ok(Math.abs(run.t - RUN_RAMP) <= DT, 'full run after RUN_RAMP: ' + run.t);
  assert.ok(run.d < RUN_SPEED * RUN_RAMP / 2 + 0.05, 'the ramp covers about half a run');
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, true, false);
  assert.ok(Math.abs(speed() - RUN_SPEED) < 1e-9, 'holds its top speed');
  // a single-frame tap barely moves
  stand(); movePlayer(DT, 1, 0, true, false);
  for (let i = 0; i < 30; i++) movePlayer(DT, 0, 0, true, false);
  assert.ok(player.x - 2.5 < 0.01 && speed() === 0, 'a tap is a nudge: ' + (player.x - 2.5));
});

test('walking caps at walking pace, and Ctrl while running slows down to it', () => {
  stand();
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, false, false);
  assert.ok(Math.abs(speed() - WALK_SPEED) < 1e-9);
  stand();
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, true, false);
  let frames = 0;
  while (speed() > WALK_SPEED + 1e-9 && frames < 60) { movePlayer(DT, 1, 0, false, false); frames++; }
  assert.ok(frames * DT <= (RUN_SPEED - WALK_SPEED) / BRAKE + DT, 'slowing to a walk brakes quickly');
});

test('stopping brakes quickly and turning keeps the speed', () => {
  stand();
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, true, false);
  let frames = 0;
  while (speed() > 0 && frames < 60) { movePlayer(DT, 0, 0, true, false); frames++; }
  assert.ok(frames * DT <= RUN_SPEED / BRAKE + DT, 'stops within ' + RUN_SPEED / BRAKE + ' s');
  stand();
  for (let i = 0; i < 60; i++) movePlayer(DT, 1, 0, true, false);
  movePlayer(DT, 0, 1, true, false);
  assert.ok(Math.abs(speed() - RUN_SPEED) < 1e-9 && player.vx === 0 && player.vz > 0, 'a 90° turn keeps running');
  movePlayer(DT, 0, -1, true, false);
  assert.ok(player.vz < 0 && Math.abs(speed() - RUN_SPEED) < 1e-9, 'reversing keeps running');
  // a partial input (a mouse order settling onto its spot) asks for less speed
  for (let i = 0; i < 60; i++) movePlayer(DT, 0, -0.25, true, false);
  assert.ok(Math.abs(speed() - RUN_SPEED * 0.25) < 1e-9);
});

test('a steep but walkable slope is walked up to its top', () => {
  // corners rise 1.4 per cell from x = 3 to x = 7: the rim ahead lies more than a step above the feet
  stand();
  const h = X => 1.4 * Math.min(4, Math.max(0, X - 3));
  for (const f of state.map.floors) { f.cs = [h(f.x), h(f.x + 1), h(f.x), h(f.x + 1)]; }
  for (let i = 0; i < 240; i++) movePlayer(DT, 1, 0, false, false);
  assert.ok(player.x > 7.5, 'walked over the top: ' + player.x);
  assert.ok(Math.abs(player.y - 5.6) < 1e-6);
});
