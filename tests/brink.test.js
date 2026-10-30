import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, LAVA, WATER, CHAR_R, CHAR_H, TEETER, SIT_IMPACT } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt, setGoneFloors } from '../src/physics/collide.js';
import { peril } from '../src/physics/fluid.js';
import { edgeKey } from '../src/core/util.js';

const DT = 1 / 60;
// ground at level 4, and `gap(x, z)` cells of lava (or water) at level 0 under a surface at 3
function room(gap, fluid = LAVA) {
  return land((x, z) => gap(x, z) ? 0 : 4, (x, z) => gap(x, z) ? { fluid, surf: 3 } : null);
}
// dry ground at `level(x, z)` (the hero on (2, 8), at its level); `wet(x, z)`: a fluid there
function land(level, wet = () => null) {
  const m = flatMap();
  for (const f of m.floors) {
    const l = level(f.x, f.z);
    Object.assign(f, { top: l, cs: Array(4).fill(l * LH) }, wet(f.x, f.z));
  }
  for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
  const f = m.floors[8 * N + 2];
  Object.assign(player, { x: 2.5, z: 8.5, y: f.top * LH, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0, wade: 0,
    support: f, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, climb: null, gust: null, pull: null, effects: {}, brink: null,
    landImpact: 0, landCount: 0, jumpCount: 0 });
  return m;
}
// push (dx, dz) for `s` s (own: the hero steering themselves): when it first stopped at the
// brink, when it jumped (s), and whether it was ever in the lava
function push(dx, dz, s, { own = true, run = true, jumpAt = null, tick = () => {} } = {}) {
  const out = { stop: null, jump: null, burned: false };
  for (let t = 0; t < s; t += DT) {
    tick(t);
    const jumps = player.jumpCount;
    const press = jumpAt !== null && out.stop !== null && out.jump === null && t >= out.stop + jumpAt;   // (once)
    movePlayer(DT, dx, dz, run, press, own);
    if (player.brink && out.stop === null) out.stop = t;
    if (player.jumpCount !== jumps && out.jump === null) out.jump = t;
    if (peril(groundAt(player.x, player.z, player.y + 0.1, 0), player.y)) out.burned = true;
  }
  return out;
}

test('walking on at a one-cell gap over lava teeters at the brink, then jumps it', () => {
  room(x => x === 6);
  const r = push(1, 0, 4);
  assert.ok(r.stop !== null && r.jump !== null, 'stopped at the brink and jumped');
  assert.ok(r.jump - r.stop >= TEETER - DT && r.jump - r.stop < TEETER + 0.1, `teetered ${TEETER} s: ${r.jump - r.stop}`);
  assert.ok(!r.burned && player.grounded && player.x > 8, 'over it, on the far side: ' + player.x);
});

test('with nothing to land on, the hero holds at the brink; pushing along it slides', () => {
  room(x => x >= 6 && x <= 9);
  const r = push(1, 0, 3);
  assert.ok(r.jump === null && !r.burned && player.grounded, 'no jump into the lava');
  assert.ok(player.x > 5.6 && player.x < 6, 'held at the brink: ' + player.x);
  assert.ok(player.brink?.hold, 'teetering, with nothing there');
  push(0, 0, DT);
  assert.equal(player.brink, null, 'letting go lets go of the brink');
  // along the edge (45° off it): sliding, no teeter
  const z = player.z, s = push(Math.SQRT1_2, Math.SQRT1_2, 1);
  assert.ok(s.jump === null && s.stop === null && player.z > z + 0.3, 'slid along the brink: ' + (player.z - z));
});

test('the jump key pressed while held at the brink leaps the way pushed, not straight up', () => {
  room(x => x === 6);
  const r = push(1, 0, 3, { jumpAt: 0.05 });
  assert.ok(r.jump !== null && r.jump - r.stop < TEETER, 'jumped at once');
  assert.ok(!r.burned && player.grounded && player.x > 7.2, 'over the gap: ' + player.x);
});

test('a mouse order is stopped at the brink as before, and never jumps it by itself', () => {
  room(x => x === 6);
  const r = push(1, 0, 2, { own: false });
  assert.ok(r.jump === null && r.stop === null && player.x > 5.6 && player.x < 6);
});

test('deep water is walked into off its bank, and swum in', () => {
  room(x => x >= 6, WATER);
  for (const f of state.map.floors) if (f.fluid) f.surf = 3.6;
  const r = push(1, 0, 2);
  assert.ok(r.stop === null && player.swimming, 'in the water, swimming');
});

test('the jump looks ahead: onto a stone that will be up when it lands, not one that sinks first', () => {
  const m = room(x => x === 6);
  // the far side (x >= 7) is a stone, up or not on a clock: `up(t)`, t s from now
  for (const f of m.floors) if (f.x >= 7) f.crust = true;
  let now = 0, up = () => true;
  setGoneFloors((f, ahead) => !up(now + ahead));
  try {
    // up now, but under by the time the jump would land: no jump, until it is up again for good
    up = t => t < 0.5 || t > 2;
    const r = push(1, 0, 3, { tick: t => { now = t; } });
    assert.ok(r.jump !== null && r.jump > 1.5, 'waited for it: ' + r.jump);
    assert.ok(!r.burned && player.grounded && player.x > 7, 'and landed on it');
    // under now, and up in time for the landing: jumped at once
    room(x => x === 6);
    for (const f of state.map.floors) if (f.x >= 7) f.crust = true;
    up = t => t > 1.6;
    const s = push(1, 0, 3, { tick: t => { now = t; } });
    assert.ok(s.jump !== null && s.jump < 1.6, 'set off before it was up: ' + s.jump);
    assert.ok(!s.burned && player.grounded && player.x > 7, 'and landed on it');
  } finally { setGoneFloors(null); }
});

// Running off an edge that is no brink (physics/brink.js offEdge): across, where a jump lands
const trench = (w, deep = 0) => land(x => x >= 6 && x < 6 + w ? deep : 4);

test('running at a dry trench a cell wide jumps it, without stopping at its edge', () => {
  trench(1);
  const r = push(1, 0, 3);
  assert.ok(r.stop === null && r.jump !== null, 'ran off and jumped');
  assert.ok(player.grounded && player.x > 7 && Math.abs(player.y - 4 * LH) < 1e-6, 'across, up on the far side: ' + player.x);
});

test('walking (the walk key) at it goes down into it', () => {
  trench(1);
  const r = push(1, 0, 3, { run: false });
  assert.ok(r.jump === null && player.grounded && player.x > 6 && player.x < 7 && player.y < 0.01, 'in the trench: ' + player.x);
});

test('a mouse order is not jumped across by itself either', () => {
  trench(1);
  const r = push(1, 0, 3, { own: false });
  assert.ok(r.jump === null && player.x < 7 && player.y < 0.01, 'in the trench');
});

test('running at a channel of water a cell wide jumps it', () => {
  room(x => x === 6, WATER);
  const r = push(1, 0, 3);
  assert.ok(r.jump !== null && !player.swimming && player.grounded && player.x > 7, 'across the water: ' + player.x);
});

test('a trench too wide to jump is run down into, not stopped at', () => {
  trench(4);
  const r = push(1, 0, 3);
  assert.ok(r.stop === null && r.jump === null, 'no stop, no jump');
  assert.ok(player.grounded && player.x > 6 && player.y < 0.01, 'down in it: ' + player.x);
  assert.equal(player.brink, null, 'and no teetering at its far wall');
});

test('running off a cliff with nothing across falls, and lands hard', () => {
  land(x => x < 6 ? 24 : 0);
  const r = push(1, 0, 3);
  assert.ok(r.stop === null && r.jump === null, 'no stop, no jump');
  assert.ok(player.landImpact > SIT_IMPACT && player.y < 0.01, 'a hard landing deep down: ' + player.landImpact);
});

test('a deep chasm a cell wide is jumped across', () => {
  trench(1, -16);
  const r = push(1, 0, 3);
  assert.ok(r.jump !== null && player.grounded && player.x > 7 && Math.abs(player.y - 4 * LH) < 1e-6, 'across: ' + player.x);
});

test('nothing lower across but a step down is no jump: a step lower than the drop is walked off', () => {
  // the far side two levels lower than the near one (more than a step): run down, no jump
  land(x => x < 6 ? 4 : x === 6 ? 0 : 2);
  const r = push(1, 0, 3);
  assert.equal(r.jump, null, 'no jump onto lower ground');
});

test('a ledge up is not jumped onto by itself', () => {
  land(x => x < 6 ? 4 : 5);
  const r = push(1, 0, 2);
  assert.ok(r.jump === null && player.x < 6 && Math.abs(player.y - 4 * LH) < 1e-6, 'still below it: ' + player.x);
});

// A bridge along x over lava (z 8, and 9 too if `wide`, x 5 to 10), its invisible side rails
// (cubegen/fences.js), the hero on it at (7.5, 8.5); ground (level 4) beside, past the lava
function railedBridge(wide = true) {
  const m = room((x, z) => x >= 5 && x <= 10 && (z === 8 || wide && z === 9)), y = 4 * LH;
  const run = { kind: 'bridge', y0: y, y1: y, k: 6, sag: 0 };
  for (let x = 5; x <= 10; x++) {
    const c = 8 * N + x;
    m.pieces[c].push({ kind: 'bridge', c, j: x - 5, dx: 1, dz: 0, run });
    for (const nz of [7, 9]) m.fences.set(edgeKey(x, 8, x, nz), [{ ymin: y, ymax: y, show: false }]);
  }
  Object.assign(player, { x: 7.5, z: 8.5, y, support: m.pieces[8 * N + 7][0] });
  return m;
}

test('the rails of a bridge hold the hero on it: no teetering at its side, no jump over them', () => {
  railedBridge();
  const r = push(0, 1, 3);
  assert.ok(r.stop === null && r.jump === null && !r.burned, 'held by the rail');
  assert.ok(player.grounded && player.z > 8.5 && player.z < 9 && Math.abs(player.y - 4 * LH) < 1e-6, 'still on the bridge: ' + player.z);
  // walking too
  railedBridge();
  const w = push(0, 1, 3, { run: false });
  assert.ok(w.stop === null && w.jump === null && player.z < 9, 'held by the rail, walking');
});

test('the jump key leaves a bridge over its rail', () => {
  railedBridge(false);
  const r = push(0, 1, 0.5);
  assert.ok(player.z < 9 && r.jump === null, 'held by the rail: ' + player.z);
  movePlayer(DT, 0, 1, true, true, true);
  push(0, 1, 1);
  assert.ok(player.grounded && player.z > 9.2 && Math.abs(player.y - 4 * LH) < 1e-6, 'over the rail, beside the bridge: ' + player.z);
});
