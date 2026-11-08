// Megalimmer's sheet as cloth (core/cloth.js): thrown over a ball, it drapes round it, stays on it
// as it flies and turns, trails behind, is pushed out by the hands under it, and never breaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOTH, newCloth, stepCloth, clothPoint, hemCentre, pointAt } from '../src/core/cloth.js';

const R = 0.5, Y = 1.55, DT = 1 / 60;
const ball = (x = 0, z = 0) => ({ x, y: Y, z, r: R });
const rest = [{ x: -0.42, y: 0.95, z: 0.06, r: 0.2 }, { x: 0.42, y: 0.95, z: 0.06, r: 0.2 }];
// a sheet hung over a ball at the origin a while, facing +z
function hung(seconds = 1.5) {
  const c = newCloth(ball());
  for (let t = 0; t < seconds; t += DT) stepCloth(c, DT, { head: ball(), yaw: 0, hands: rest, floor: 0 });
  return c;
}
const settled = hung();
const points = c => Array.from({ length: c.n }, (_, k) => clothPoint(c, k));
// how far into ball h the deepest point is (0: none in it)
const depth = (c, h) => Math.max(0, ...points(c).map(p => h.r - Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z)));

test('it drapes over the ball: the hem hangs well below its middle, all round it, over the floor', () => {
  const c = settled, hem = c.hem.map(k => clothPoint(c, k)), mid = hemCentre(c);
  assert.ok(c.n > 200 && c.n < 600, `${c.n} points`);
  assert.ok(mid.y < Y - 0.6, `the hem's middle at ${mid.y}`);
  assert.ok(Math.hypot(mid.x, mid.z) < 0.15, `the hem round the ball: ${mid.x} ${mid.z}`);
  // (folded, a little of it may tuck in under the ball, but on the whole it hangs round it, on every side)
  const out = hem.map(p => Math.hypot(p.x, p.z)), mean = out.reduce((a, b) => a + b) / out.length;
  assert.ok(mean > R * 1.1 && mean < 1.5 && Math.max(...out) < 2, `the hem ${mean} out`);
  const sides = new Set(hem.map(p => Math.floor((Math.atan2(p.x, p.z) + Math.PI) / (Math.PI / 4)) % 8));
  assert.equal(sides.size, 8);
  for (const p of hem) assert.ok(p.y >= -1e-9, `under the floor: ${p.y}`);
  // its middle sits on top of the ball
  const top = clothPoint(c, c.centre);
  assert.ok(Math.hypot(top.x, top.y - (Y + R), top.z) < 0.1, `${JSON.stringify(top)}`);
  assert.equal(depth(c, ball()), 0);
});

test('it stays on the ball as it flies off fast and as it turns, and never goes into it', () => {
  const c = hung();
  let x = 0, worst = 0;
  for (let t = 0; t < 1.5; t += DT) {
    x += 7 * DT;
    stepCloth(c, DT, { head: ball(x), yaw: 0, hands: rest.map(h => ({ ...h, x: h.x + x })), floor: 0 });
    worst = Math.max(worst, depth(c, ball(x)));
  }
  const top = clothPoint(c, c.centre);
  assert.ok(Math.hypot(top.x - x, top.y - (Y + R), top.z) < 0.15, `left the top of the ball: ${top.x - x} ${top.y}`);
  assert.ok(worst < 0.02, `into the ball: ${worst}`);
  // spun round (and round) fast: the sheet turns with it, its front (his eyes) kept in front
  const front = pointAt(c, 0, 0.56);
  let yaw = 0;
  for (let t = 0; t < 1.5; t += DT) {
    yaw += 6 * DT;
    stepCloth(c, DT, { head: ball(x), yaw, floor: 0 });
    worst = Math.max(worst, depth(c, ball(x)));
  }
  const f = clothPoint(c, front), seen = Math.atan2(f.x - x, f.z), off = Math.atan2(Math.sin(seen - yaw), Math.cos(seen - yaw));
  assert.ok(Math.abs(off) < 0.35, `the front is ${off} off`);
  assert.ok(worst < 0.02, `into the ball: ${worst}`);
});

test('it trails behind a fast glide, the more the faster, and streams out with more drag', () => {
  const lag = (speed, drag = 1) => {
    const c = hung();
    let x = 0;
    for (let t = 0; t < 1.5; t += DT) {
      x += speed * DT;
      stepCloth(c, DT, { head: ball(x), yaw: Math.PI / 2, floor: 0, drag });
    }
    return x - hemCentre(c).x;
  };
  const slow = lag(1.5), fast = lag(5), streaming = lag(5, 1.9);
  assert.ok(fast > 0.35, `the hem only ${fast} behind`);
  assert.ok(fast > slow + 0.15 && streaming > fast + 0.05, `${slow} ${fast} ${streaming}`);
});

test('a hand moving out under it pushes the sheet out there', () => {
  // (how far forward the sheet is at his chest)
  const c = hung(), reach = () => Math.max(...points(c).filter(p => p.y > 1.1 && p.y < 1.6).map(p => p.z));
  const before = reach();
  // (the right hand punching out in front, over a tenth of a second)
  const to = { x: -0.12, y: 1.32, z: 1.05, r: 0.2 }, from = rest[0];
  for (let t = 0; t < 0.4; t += DT) {
    const k = Math.min(1, t / 0.1), h = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k, r: 0.2 };
    stepCloth(c, DT, { head: ball(), yaw: 0, hands: [h, rest[1]], floor: 0 });
  }
  assert.ok(before < 1.05, `${before}`);
  assert.ok(reach() > before + 0.25 && reach() > 1.25, `the sheet only out to ${reach()}`);
  // and no point of it is inside the hand
  const h = to;
  assert.ok(Math.min(...points(c).map(p => Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z))) >= h.r);
});

test('without the ball it falls onto the floor', () => {
  const c = hung();
  for (let t = 0; t < 2.5; t += DT) stepCloth(c, DT, { head: null, yaw: 0, floor: 0 });
  const high = Math.max(...points(c).map(p => p.y));
  assert.ok(high < 0.6, `still up to ${high}`);
  assert.ok(Math.min(...points(c).map(p => p.y)) >= 0);
});

test('a huge frame or a jump far away leaves it whole and on the ball', () => {
  const c = hung();
  stepCloth(c, 30, { head: ball(), yaw: 0, floor: 0 });
  assert.ok(c.p.every(Number.isFinite));
  // jumped far (a portal): carried along to the ball where it is now
  stepCloth(c, DT, { head: ball(40, -25), yaw: 2, floor: 0 });
  stepCloth(c, 5, { head: ball(41, -25), yaw: -1, floor: 0 });
  assert.ok(c.p.every(Number.isFinite) && c.q.every(Number.isFinite));
  const top = clothPoint(c, c.centre);
  assert.ok(Math.hypot(top.x - 41, top.z + 25) < 0.3, `${top.x} ${top.z}`);
  assert.ok(Math.max(...points(c).map(p => Math.hypot(p.x - 41, p.z + 25))) < CLOTH.radius + 0.6);
  // and a step of nothing does nothing
  assert.equal(stepCloth(c, 0, { head: ball(41, -25), yaw: -1 }), 0);
});
