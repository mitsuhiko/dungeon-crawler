// The world's roll (core/roll.js): turning slowly to rest at a quarter, spinning on, what the keys
// follow, and turning a screen direction back to the unturned screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLL, QUARTER, KEY_MODES, stepRoll, nextStop, stepKeys, latchKeys, settleLatch, unturn, unturnMouse, wrap, nearestTo } from '../src/core/roll.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// turns r to its target frame by frame (60/s): how long it took and the most it moved a frame
function run(r, dt = 1 / 60) {
  let t = 0, fastest = 0;
  while (r.angle !== r.target && t < 60) {
    const was = r.angle;
    stepRoll(r, dt);
    fastest = Math.max(fastest, Math.abs(r.angle - was) / dt);
    t += dt;
  }
  return { t, fastest };
}

test('the roll turns slowly to its quarter and rests there exactly', () => {
  const r = { angle: 0, target: QUARTER, speed: 0 };
  const { t, fastest } = run(r);
  assert.equal(r.angle, QUARTER);
  assert.equal(r.speed, 0);
  assert.ok(fastest <= ROLL.speed + 1e-9, 'never faster than its speed');
  // a quarter: speeding up and slowing down, about 5 s; half round about 8.5 s
  assert.ok(t > 4 && t < 6, `a quarter in ${t} s`);
  const h = { angle: 0, target: 2 * QUARTER, speed: 0 };
  const half = run(h).t;
  assert.ok(half > 7.5 && half < 9.5, `half round in ${half} s`);
});

test('the roll eases in and out', () => {
  const r = { angle: 0, target: QUARTER, speed: 0 };
  stepRoll(r, 0.1);
  assert.ok(r.speed < ROLL.speed / 2, 'starts slowly');
  // halfway it goes at its speed
  while (r.angle < QUARTER / 2) stepRoll(r, 1 / 60);
  close(r.speed, ROLL.speed, 1e-6);
  // just before the end it is slow again
  while (r.target - r.angle > 0.01) stepRoll(r, 1 / 60);
  assert.ok(r.speed < ROLL.speed / 3);
});

test('the roll turns back the other way', () => {
  const r = { angle: QUARTER, target: -QUARTER, speed: 0 };
  run(r);
  assert.equal(r.angle, -QUARTER);
});

test('spinning goes on to another quarter, never staying', () => {
  for (let i = 0; i < 4; i++) {
    const to = nextStop(QUARTER, (i + 0.5) / 4), d = Math.abs(to - QUARTER);
    assert.ok(d === QUARTER || d === 2 * QUARTER);
  }
  // all four ways come up
  assert.equal(new Set([0, 0.3, 0.6, 0.9].map(x => nextStop(0, x))).size, 4);
});

test('angles wrap, and a quarter is reached the shorter way', () => {
  close(wrap(3 * Math.PI), Math.PI);
  close(wrap(-Math.PI / 2), -Math.PI / 2);
  close(nearestTo(2 * Math.PI, 0), 2 * Math.PI);           // already there, whole turns on
  close(nearestTo(2 * Math.PI, 3 * QUARTER), 2 * Math.PI - QUARTER);
});

test('the keys: with the world, with the screen, or catching up once it rests', () => {
  assert.equal(stepKeys('world', 0, QUARTER, 5, 0.1), 0);
  assert.equal(stepKeys('screen', 0, QUARTER, 0, 0.1), QUARTER);
  // turning (or not rested long enough): they stay
  assert.equal(stepKeys('catchup', 0, QUARTER / 2, 0, 0.1), 0);
  assert.equal(stepKeys('catchup', 0, QUARTER, ROLL.settle / 2, 0.1), 0);
  // rested: they catch up, most of the way in a second, all the way in a few
  let k = 0, t = 0;
  for (; t < 1; t += 1 / 60) k = stepKeys('catchup', k, QUARTER, ROLL.settle + t, 1 / 60);
  assert.ok(k > QUARTER * 0.85 && k < QUARTER);
  for (; t < 6; t += 1 / 60) k = stepKeys('catchup', k, QUARTER, ROLL.settle + t, 1 / 60);
  assert.equal(k, QUARTER);
  // the shorter way, whatever whole turns the roll went
  const n = stepKeys('catchup', 0, 2 * Math.PI + 0.1, 5, 1 / 60);
  assert.ok(n > 0 && n < 0.1);
});

test('the keys latch by default: a direction is taken on the screen as it is when given', () => {
  assert.equal(KEY_MODES[0], 'latch');
  const l = { held: false, x: 0, y: 0, angle: 0 };
  // W pressed unrolled: taken at 0; held while the roll turns: it keeps its angle
  assert.equal(latchKeys(l, 0, 1, 0), 0);
  assert.equal(latchKeys(l, 0, 1, QUARTER / 2), 0);
  // the same asked again in the same frame: the same
  assert.equal(latchKeys(l, 0, 1, QUARTER / 2), 0);
  // another key (W + D, a change of 45 degrees): taken anew at the roll now
  assert.equal(latchKeys(l, 1, 1, QUARTER / 2), QUARTER / 2);
  // let go: follows the screen; pressed again later: taken there
  assert.equal(latchKeys(l, 0, 0, QUARTER), QUARTER);
  assert.equal(l.held, false);
  assert.equal(latchKeys(l, 0, 1, 1.5 * QUARTER), 1.5 * QUARTER);
});

test('the stick latches until let go or swung far from where it was taken', () => {
  const l = { held: false, x: 0, y: 0, angle: 0 }, deg = d => d * Math.PI / 180;
  const at = d => [Math.sin(deg(d)), Math.cos(deg(d))];
  latchKeys(l, ...at(0), 0, ROLL.swing);
  // steered a little, and a little more (not as far as the swing from where it was taken): held
  assert.equal(latchKeys(l, ...at(20), 0.5, ROLL.swing), 0);
  assert.equal(latchKeys(l, ...at(-40), 0.6, ROLL.swing), 0);
  // swung further: taken anew
  assert.equal(latchKeys(l, ...at(90), 0.7, ROLL.swing), 0.7);
});

test('a direction held through a half turn keeps its way, and catches up quickly once it rests', () => {
  const r = { angle: 0, target: 2 * QUARTER, speed: 0 }, l = { held: false, x: 0, y: 0, angle: 0 }, dt = 1 / 60;
  let rest = 0, t = 0;
  latchKeys(l, 0, 1, r.angle);
  while (r.angle !== r.target) {
    stepRoll(r, dt); rest = r.angle !== r.target ? 0 : rest + dt;
    settleLatch(l, r.angle, rest, dt);
    assert.ok(r.angle === r.target || latchKeys(l, 0, 1, r.angle) === 0, 'held, turning: the same way in the world');
  }
  // rested: no settling first; most of the way in a quarter second, all of it within a second
  for (; t < 0.25; t += dt) { rest += dt; settleLatch(l, r.angle, rest, dt); }
  assert.ok(Math.abs(wrap(r.angle - l.angle)) < 0.15 * 2 * QUARTER, `${l.angle} after a quarter second`);
  for (; t < 1; t += dt) { rest += dt; settleLatch(l, r.angle, rest, dt); }
  assert.equal(l.angle, r.angle);
  // the shorter way, whatever whole turns the roll went
  const w = settleLatch({ held: true, x: 0, y: 1, angle: 0 }, 2 * Math.PI + 0.1, 1, 1 / 60);
  assert.ok(w.angle > 0 && w.angle < 0.1);
  // nothing held: nothing to settle
  assert.equal(settleLatch({ held: false, angle: 0 }, 1, 1, 1).angle, 0);
});

test('a direction on the rolled screen, on the unrolled one', () => {
  // unrolled: as it is
  assert.deepEqual(unturn(0, 1, 0), [0, 1]);
  // rolled a quarter (the camera's right side up): up the screen was left on the unrolled one,
  // its right was up
  const [ux, uy] = unturn(0, 1, QUARTER), [rx, ry] = unturn(1, 0, QUARTER);
  close(ux, -1); close(uy, 0); close(rx, 0); close(ry, 1);
  // upside down: everything the other way
  const [x, y] = unturn(0.6, 0.8, 2 * QUARTER);
  close(x, -0.6); close(y, -0.8);
  // the mouse (y down) likewise
  const [mx, my] = unturnMouse(1, 0, QUARTER);
  close(mx, 0); close(my, -1);
});
