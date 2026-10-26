// Mansk's ribbons as ropes (core/ribbon.js): tied to their stump, they keep their length, hang,
// trail, swing out, stay out of his head and off the floor, and reach for what they grab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIBBON, newRibbon, stepRibbon, pointOf, chainLength, linkLength } from '../src/core/ribbon.js';

const UP = { x: 0, y: 1, z: 0 }, OUT = { x: 1, y: 0, z: 0 };
const run = (r, world, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) stepRibbon(r, dt, world); };

test('tied to its anchor, it hangs down its whole length and does not stretch', () => {
  const a = { x: 0, y: 10, z: 0 }, r = newRibbon(a, OUT);
  run(r, { anchor: a, dir: OUT }, 6);
  const tip = pointOf(r, r.n - 1);
  assert.deepEqual(pointOf(r, 0), a);
  assert.ok(Math.abs(chainLength(r) - RIBBON.length) < RIBBON.length * 0.03, `${chainLength(r)}`);
  // it hangs under the stump (which points out sideways), still swinging a little: the air
  // slows it only a little
  assert.ok(tip.y < a.y - RIBBON.length * 0.8, `${tip.y}`);
  assert.ok(Math.abs(tip.x) < 2 && Math.abs(tip.z) < 0.1, `${tip.x} ${tip.z}`);
});

test('it trails behind its anchor as that flies off, and swings out as it spins round', () => {
  const a = { x: 0, y: 10, z: 0 }, r = newRibbon(a, OUT), still = { anchor: a, dir: OUT };
  run(r, still, 4);
  // flying off along +z at 6 cells/s for a second: the tip is left behind
  for (let t = 0; t < 1; t += 1 / 60) { a.z += 6 / 60; stepRibbon(r, 1 / 60, { anchor: { ...a }, dir: OUT }); }
  assert.ok(pointOf(r, r.n - 1).z < a.z - 1.5, `${pointOf(r, r.n - 1).z} vs ${a.z}`);
  // spun round fast on a little circle (a dancer turning): it flies out, far from the axis
  const s = newRibbon({ x: 0, y: 10, z: 0 }, OUT);
  let far = 0;
  for (let t = 0; t < 5; t += 1 / 60) {
    const w = t * 9, at = { x: 0.6 * Math.cos(w), y: 10, z: 0.6 * Math.sin(w) }, dir = { x: Math.cos(w), y: 0, z: Math.sin(w) };
    stepRibbon(s, 1 / 60, { anchor: at, dir });
    if (t > 3) { const tip = pointOf(s, s.n - 1); far = Math.max(far, Math.hypot(tip.x, tip.z)); }
  }
  assert.ok(far > RIBBON.length * 0.5, `${far}`);
  assert.ok(Math.abs(chainLength(s) - RIBBON.length) < RIBBON.length * 0.08, `${chainLength(s)}`);
});

test('it stays out of his head and lies on the floor', () => {
  const a = { x: 0, y: 1.5, z: 0 }, dir = { x: 0.2, y: 0.98, z: 0 }, r = newRibbon(a, dir), head = { x: 0, y: 2.2, z: 0, r: 0.5 };
  run(r, { anchor: a, dir, spheres: [head], floor: () => 0 }, 5);
  for (let i = 1; i < r.n; i++) {
    const p = pointOf(r, i);
    assert.ok(p.y >= RIBBON.thick - 1e-6, `${i}: ${p.y}`);
    assert.ok(Math.hypot(p.x - head.x, p.y - head.y, p.z - head.z) >= head.r - 1e-6, `${i} in the head`);
  }
  // fallen down beside it, much of it lies on the floor
  const low = Array.from({ length: r.n }, (_, i) => pointOf(r, i)).filter(p => p.y < 0.2).length;
  assert.ok(low > r.n / 3, `${low}`);
});

test('a target pulls its point there; growing out, the links are short', () => {
  const a = { x: 0, y: 2, z: 0 }, r = newRibbon(a, OUT), goal = { x: 3, y: 1, z: 2 };
  run(r, { anchor: a, dir: OUT, targets: [{ i: r.n - 1, ...goal, k: 0.3 }] }, 2);
  const tip = pointOf(r, r.n - 1);
  assert.ok(Math.hypot(tip.x - goal.x, tip.y - goal.y, tip.z - goal.z) < 0.4, JSON.stringify(tip));
  const g = newRibbon(a, OUT, RIBBON, 0.1);
  assert.ok(Math.abs(linkLength(g) - RIBBON.length / RIBBON.segments * 0.1) < 1e-9);
  run(g, { anchor: a, dir: OUT }, 1);
  assert.ok(chainLength(g) < RIBBON.length * 0.15);
});

test('a long frame runs in at most maxSteps fixed steps; a jump of the anchor lays it out anew', () => {
  const a = { x: 0, y: 5, z: 0 }, r = newRibbon(a, OUT);
  assert.equal(stepRibbon(r, 1, { anchor: a, dir: OUT }), RIBBON.maxSteps);
  for (const v of r.p) assert.ok(Number.isFinite(v));
  stepRibbon(r, 1 / 60, { anchor: { x: 20, y: 5, z: 0 }, dir: OUT });
  assert.ok(Math.abs(pointOf(r, 0).x - 20) < 1e-9 && pointOf(r, r.n - 1).x > 20);
});
