import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolutionController, nativeRatio, SMALL_PIXELS } from '../src/core/resolution.js';

// feed `ms` of frames, each `interval` apart and `spent` of them the frame's own work; returns
// the ratios the controller switched to
function run(c, ms, interval, spent) {
  const changes = [];
  for (let t = 0; t < ms; t += interval) {
    const r = c.tick(interval, spent);
    if (r) changes.push(r);
  }
  return changes;
}

// a GPU-bound scene: frame time grows with the pixels shaded (gpu ms at ratio 1), but not
// below vsync at 60 Hz
function gpuBound(c, ms, gpu, spent = 3) {
  for (let t = 0; t < ms;) {
    const interval = Math.max(1000 / 60, spent + gpu * c.ratio * c.ratio);
    c.tick(interval, spent);
    t += interval;
  }
}

test('GPU-bound slow frames lower the resolution until frames are fast, never below the floor', () => {
  const c = resolutionController(2);
  assert.equal(c.min, 1);
  assert.deepEqual(run(c, 1000, 30, 5), [1.7]);
  const d = resolutionController(2);
  gpuBound(d, 20000, 6);       // 27 ms at 2x: fast enough at about 1.6x
  assert.ok(d.ratio < 1.75 && d.ratio > 1.3, String(d.ratio));
  const e = resolutionController(2);
  gpuBound(e, 60000, 40);      // hopeless: down to (within a step of) the floor, no further
  assert.ok(e.ratio >= e.min && e.ratio < e.min / 0.85, String(e.ratio));
});

test('CPU-bound slow frames keep the resolution', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 5000, 30, 25), []);
  assert.equal(c.ratio, 2);
});

test('a step down that does not help is taken back and stepping down rests', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 1000, 33.4, 4), [1.7]);   // e.g. a browser capping the frame rate at 30
  assert.deepEqual(run(c, 1000, 33.4, 4), [2]);
  assert.deepEqual(run(c, 20000, 33.4, 4), []);
  assert.equal(c.ratio, 2);
});

test('smooth frames raise the resolution again after a calm spell', () => {
  const c = resolutionController(2);
  run(c, 1000, 30, 5);
  assert.equal(c.ratio, 1.7);
  assert.deepEqual(run(c, 3000, 16.7, 4), []);
  assert.equal(run(c, 2000, 16.7, 4).length, 1);
  assert.ok(Math.abs(c.ratio - 1.87) < 1e-9);
  run(c, 20000, 16.7, 4);
  assert.equal(c.ratio, 2);   // up to the device's ratio, not beyond
});

test('a step up that is too much makes the next calm spell longer', () => {
  const c = resolutionController(2);
  run(c, 1000, 30, 5);                       // 2 -> 1.7
  run(c, 1000, 16.7, 4);                     // proves itself
  run(c, 4000, 16.7, 4);                     // calm: 1.7 -> 1.87
  assert.ok(Math.abs(c.ratio - 1.87) < 1e-9);
  run(c, 1000, 30, 5);                       // too slow right away: steps down, calm doubles
  assert.ok(c.ratio < 1.87);
  const at = c.ratio;
  assert.deepEqual(run(c, 6000, 16.7, 4), []);   // 4 s is no longer enough
  run(c, 3000, 16.7, 4);
  assert.ok(c.ratio > at);
});

test('stalls (a background tab, a hitch) are not counted', () => {
  const c = resolutionController(2);
  assert.deepEqual(run(c, 20000, 500, 5), []);
  assert.equal(c.ratio, 2);
});

// feed `ms` of frames under a frame rate cap of `target` ms
function capped(c, ms, interval, spent, target) {
  const changes = [];
  for (let t = 0; t < ms; t += interval) {
    const r = c.tick(interval, spent, target);
    if (r) changes.push(r);
  }
  return changes;
}

test('a frame rate cap is not mistaken for slow frames', () => {
  const c = resolutionController(2);
  assert.deepEqual(capped(c, 20000, 1000 / 30, 4, 1000 / 30), []);   // capped at 30, keeping up
  assert.equal(c.ratio, 2);
  const d = resolutionController(2);
  assert.deepEqual(capped(d, 1000, 50, 5, 1000 / 30), [1.7]);        // capped at 30 but only making 20
  const e = resolutionController(2);
  run(e, 1000, 30, 5);                                               // 2 -> 1.7
  capped(e, 1000, 1000 / 30, 4, 1000 / 30);                          // proves itself under the cap
  capped(e, 8000, 1000 / 30, 4, 1000 / 30);                          // smooth at the cap: back up
  assert.ok(e.ratio > 1.7, String(e.ratio));
  const f = resolutionController(2);
  assert.deepEqual(capped(f, 1000, 1000 / 60, 4, 1000 / 60), []);    // a cap of 60 judges as before
  assert.deepEqual(capped(f, 1000, 30, 5, 1000 / 60), [1.7]);
});

// the same with quality levels (the lighting on Auto): [ratio, level] after each change
function leveled(c, ms, interval, spent) {
  const seen = [];
  for (let t = 0; t < ms; t += interval) {
    const before = `${c.ratio},${c.level}`;
    c.tick(interval, spent, 0);
    if (`${c.ratio},${c.level}` !== before) seen.push([c.ratio, c.level]);
  }
  return seen;
}

test('on Auto the quality level goes down before the resolution', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 2 });
  assert.deepEqual(leveled(c, 1000, 30, 5), [[2, 1]]);
  assert.deepEqual(leveled(c, 2100, 26, 5), [[2, 0]]);     // judged a second later: helped, next
  assert.deepEqual(leveled(c, 2100, 23, 5), [[1.7, 0]]);   // none left: the resolution
});

test('CPU-bound slow frames take only the quality level down', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 3 });
  assert.deepEqual(leveled(c, 1000, 30, 25), [[2, 2]]);
  assert.deepEqual(leveled(c, 2100, 26, 22), [[2, 1]]);
  assert.equal(c.ratio, 2);
});

test('a quality step that does not help is taken back after its settling second', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 2 });
  assert.deepEqual(leveled(c, 1000, 30, 25), [[2, 1]]);
  assert.deepEqual(leveled(c, 1000, 30, 25), []);          // settling
  assert.deepEqual(leveled(c, 1000, 30, 25), [[2, 2]]);    // no faster: back
  assert.deepEqual(leveled(c, 20000, 30, 25), []);         // and it rests
});

test('a quality step that does not help leaves the resolution to step down next', () => {
  // GPU-bound, the pixels are what costs: the level changes nothing
  const c = resolutionController(2, undefined, { levels: 3, level: 1 });
  const seen = [];
  for (let t = 0; t < 15000;) {
    const interval = Math.max(1000 / 60, 3 + 8 * c.ratio * c.ratio), before = `${c.ratio},${c.level}`;
    c.tick(interval, 3); t += interval;
    if (`${c.ratio},${c.level}` !== before) seen.push([+c.ratio.toFixed(3), c.level]);
  }
  assert.deepEqual(seen.slice(0, 3), [[2, 0], [2, 1], [1.7, 1]]);   // tried, taken back, the pixels next
  assert.ok(c.ratio < 1.5 && c.level === 1, `${c.ratio} ${c.level}`);
});

test('smooth frames raise the resolution first, then the quality level', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 1 });
  leveled(c, 1000, 30, 5);                                 // 2,0
  leveled(c, 2100, 26, 5);                                 // settled, helped: 1.7,0
  leveled(c, 1000, 16.7, 4);                               // proves itself
  const up = leveled(c, 60000, 16.7, 4).map(([r, l]) => `${r.toFixed(2)},${l}`);
  assert.deepEqual(up, ['1.87,0', '2.00,0', '2.00,1', '2.00,2', '2.00,3']);
});

test('without Auto the level stays where it was set', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 3 });
  c.setQuality(0);
  assert.deepEqual(leveled(c, 3000, 30, 25), []);
  assert.equal(c.level, 0);
  c.setQuality(3, 1);
  assert.equal(c.level, 1);
});

test('a few hitches in a second of smooth frames step nothing down', () => {
  const c = resolutionController(2, undefined, { levels: 3, level: 2 });
  for (let s = 0; s < 5; s++) {
    for (let i = 0; i < 55; i++) c.tick(16.7, 4, 0);
    for (let i = 0; i < 4; i++) c.tick(200, 150, 0);   // a shader compiling, a cube built
  }
  assert.equal(c.ratio, 2);
  assert.ok(c.level >= 2, String(c.level));   // (smooth enough to try one up, even)
});

test('a small device draws no more than its pixel budget, phones keep their 2x', () => {
  assert.equal(nativeRatio(3, 390, 844, true), 2);              // iPhone 16e
  assert.equal(nativeRatio(3, 440, 956, true), 2);              // a Pro Max
  const ipad = nativeRatio(2, 1180, 820, true);                 // iPad Air 11"
  assert.ok(ipad > 1.3 && ipad < 1.5, String(ipad));
  assert.ok(Math.abs(1180 * 820 * ipad ** 2 - SMALL_PIXELS) < 1);
  assert.equal(nativeRatio(2, 4000, 3000, true), 1);            // never under the CSS pixels
  assert.equal(nativeRatio(2, 1180, 820, false), 2);            // elsewhere the screen's, at most 2
  assert.equal(nativeRatio(1, 1180, 820, true), 1);
});
