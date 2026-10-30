import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, LAVA, WATER, CHAR_R, CHAR_H, TEETER } from '../src/core/constants.js';
import { flatMap, state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt, setGoneFloors } from '../src/physics/collide.js';
import { peril } from '../src/physics/fluid.js';

const DT = 1 / 60;
// ground at level 4, and `gap(x, z)` cells of lava (or water) at level 0 under a surface at 3
function room(gap, fluid = LAVA) {
  const m = flatMap();
  for (const f of m.floors) {
    if (gap(f.x, f.z)) Object.assign(f, { top: 0, cs: [0, 0, 0, 0], fluid, surf: 3 });
    else Object.assign(f, { top: 4, cs: Array(4).fill(4 * LH) });
  }
  for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
  const f = m.floors[8 * N + 2];
  Object.assign(player, { x: 2.5, z: 8.5, y: 4 * LH, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0, wade: 0,
    support: f, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, climb: null, gust: null, pull: null, effects: {}, brink: null });
  return m;
}
// push (dx, dz) for `s` s (own: the hero steering themselves): when it first stopped at the
// brink, when it jumped (s), and whether it was ever in the lava
function push(dx, dz, s, { own = true, jumpAt = null, tick = () => {} } = {}) {
  const out = { stop: null, jump: null, burned: false };
  for (let t = 0; t < s; t += DT) {
    tick(t);
    const jumps = player.jumpCount;
    const press = jumpAt !== null && out.stop !== null && out.jump === null && t >= out.stop + jumpAt;   // (once)
    movePlayer(DT, dx, dz, true, press, own);
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
