import { test } from 'node:test';
import assert from 'node:assert/strict';
import './fixtures.js';
import { INTROS, EPITHETS, BLINK, introOf, epithetOf, blendAt, blinking, dimAt, within, shotAt, shotFrame, shotPoint, shotScale } from '../src/core/bossintro.js';
import { BOSSES } from '../src/core/bosses.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const anchors = { hero: { x: 2, y: 1, z: 8 }, spot: { x: 12, y: 1, z: 8 }, boss: { x: 12, y: 1, z: 8 } };
const frame = shotFrame(anchors.hero, anchors.spot);

test('every boss has an epithet and an intro of his own; a Temp Boss the shared epithet and the drop; met before: again', () => {
  for (const boss of Object.values(BOSSES)) {
    assert.ok(EPITHETS[boss], boss);
    assert.equal(introOf({ boss }, false), INTROS[boss], boss);
    assert.equal(INTROS[boss].reveal, boss, `${boss}: his own reveal`);
  }
  assert.equal(epithetOf({ bossPlaceholder: true }), EPITHETS.temp);
  assert.equal(introOf({ bossPlaceholder: true }, false), INTROS.drop);
  assert.equal(introOf({ boss: 'gusto' }, true), INTROS.again);
});

test('an intro\'s moments come in order: his name before the camera cuts back, control back by its end', () => {
  for (const [name, d] of Object.entries(INTROS)) {
    assert.ok(d.hold <= d.length && d.walk <= d.hold || !d.hold, name);
    assert.ok(d.name[0] < d.name[1] && d.name[1] <= d.length, name);
    assert.ok(d.bar <= d.length, name);
    if (!d.blend) continue;
    assert.ok(d.blend[0] < d.blend[1] && d.blend[1] < d.blend[2] && d.blend[2] <= d.hold, name);
    assert.ok(d.name[1] <= d.blend[2], `${name}: the name gone before the cut back`);
    assert.ok(d.name[1] - d.name[0] >= 2, `${name}: the name long enough to read`);
    assert.ok(d.length >= 7, `${name}: slow enough to see`);
    assert.ok(d.shots.every((k, i) => !i || k.t > d.shots[i - 1].t), `${name}: keys in order`);
    assert.ok(d.shots.at(-1).t <= d.blend[2], `${name}: the last key before the cut back`);
    if (d.dim) assert.ok(d.dim.at.every((a, i) => !i || a >= d.dim.at[i - 1]) && d.dim.at[3] <= d.length, `${name}: the light goes and comes back in order`);
    if (d.fires) assert.ok(d.fires.out < d.fires.back && d.fires.back <= d.blend[2], `${name}: the fires back before the cut`);
  }
});

test('an intro\'s camera turns back the right way up; its anchors are the shared ones or its reveal\'s', () => {
  const ANCHORS = new Set(['hero', 'spot', 'boss', 'start', 'behind', 'shore', 'aside']);
  for (const [name, d] of Object.entries(INTROS)) {
    const rolls = [];
    for (const k of d.shots) {
      rolls.push(k.roll ?? rolls.at(-1) ?? 0);
      assert.ok(ANCHORS.has(k.cam[0]) && ANCHORS.has(k.look[0]), `${name} at ${k.t}: ${k.cam[0]}, ${k.look[0]}`);
    }
    if (rolls.length) assert.ok(Math.abs(rolls.at(-1) % 360) < 3, `${name}: upright at the end (${rolls.at(-1)})`);
  }
});

test('Flip\'s camera turns once round with his cartwheel', () => {
  const d = INTROS.flip, [a, b] = d.at.turn, keys = d.shots;
  const at = t => keys.find(k => Math.abs(k.t - t) < 1e-9);
  assert.ok(at(a) && at(b), 'keys where the turn starts and ends');
  assert.equal(Math.abs(at(b).roll - at(a).roll), 360);
  assert.ok(a >= d.at.flip && d.name[0] >= b, 'his name once the world is still again');
});

test('the free camera comes in smoothly and cuts back behind the black bars', () => {
  const d = INTROS.drop, [a, b, c] = d.blend;
  assert.equal(blendAt(d, a - 0.1), 0);
  assert.ok(blendAt(d, (a + b) / 2) > 0.3 && blendAt(d, (a + b) / 2) < 0.7);
  assert.equal(blendAt(d, (b + c) / 2), 1);
  assert.equal(blendAt(d, c + 0.01), 0);
  assert.ok(!blinking(d, c - BLINK - 0.01) && blinking(d, c - BLINK / 2) && blinking(d, c + 0.05) && !blinking(d, c + 0.2));
  assert.equal(blendAt(INTROS.again, 1), 0);
});

test('the light goes and comes back', () => {
  const d = INTROS.drop;
  assert.equal(dimAt(d, 0), 0);
  assert.ok(near(dimAt(d, d.dim.at[1] + 0.1), d.dim.to));
  assert.equal(dimAt(d, d.dim.at[3] + 0.1), 0);
  assert.equal(dimAt(INTROS.totnar, 3), 0, 'Totnar\'s reveal does the dark itself');
  assert.ok(within([1, 2], 1.5) && !within([1, 2], 2) && !within(null, 1));
});

test('shots are given round their anchors in the frame from the hero to the boss, a big boss further', () => {
  assert.deepEqual(frame.f, [1, 0]);
  assert.deepEqual(shotPoint(frame, anchors, ['spot', -4, 0, 2]), [8, 3, 8]);
  const big = shotFrame(anchors.hero, anchors.spot, 1.5);
  assert.deepEqual(shotPoint(big, anchors, ['spot', -4, 0, 2]), [6, 4, 8]);
  assert.deepEqual(shotPoint(big, anchors, ['hero', -2, 0, 2]), [0, 3, 8], 'round the hero in cells');
  const left = shotFrame(anchors.hero, anchors.spot, 1, -1);
  assert.ok(near(shotPoint(frame, anchors, ['spot', 0, 1, 0])[2], -shotPoint(left, anchors, ['spot', 0, 1, 0])[2] + 16));
  assert.ok(shotScale(0.7) < shotScale(2.2) && shotScale(2.2) === 1 && shotScale(3) > 1);
});

test('the camera goes through its keys, easing; a cut jumps', () => {
  const keys = [{ t: 0, cam: ['spot', -6, 0, 1], look: ['spot', 0, 0, 1], fov: 50 },
    { t: 2, cam: ['spot', -4, 0, 1], look: ['spot', 0, 0, 1], fov: 30, roll: 4 },
    { t: 3, cam: ['spot', -2, 3, 1], look: ['spot', 0, 0, 1], cut: true }];
  assert.deepEqual(shotAt(keys, -1, frame, anchors).cam, [6, 2, 8]);
  assert.deepEqual(shotAt(keys, 2, frame, anchors).cam, [8, 2, 8]);
  const mid = shotAt(keys, 1, frame, anchors);
  assert.ok(near(mid.cam[0], 7, 1e-9) && near(mid.fov, 40) && near(mid.roll, 2));
  assert.equal(shotAt(keys, 2.9, frame, anchors).cam[0], 8, 'before a cut: holds');
  assert.deepEqual(shotAt(keys, 3, frame, anchors).cam, [10, 2, 11]);
  assert.equal(shotAt(keys, 3, frame, anchors).fov, 30, 'the lens carries on');
  assert.equal(shotAt([], 1, frame, anchors), null);
});
