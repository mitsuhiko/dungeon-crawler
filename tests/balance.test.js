import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { World } from '../src/world/world.js';
import { TRIALS, STONE_TIME, newTrial, stepTrial, touchStone, crustState, resolveTrial, resetTrial, trialFluidLevel, trialSealed } from '../src/core/trials.js';
import { TrialOwner, trialMessage, followTrial } from '../src/net/trials.js';
import { N, LH, CHAR_R, CHAR_H, LAVA, ACID } from '../src/core/constants.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt, setGoneFloors } from '../src/physics/collide.js';
import { inFluid, setTrialFluid } from '../src/physics/fluid.js';

const model = () => ({ key: 'k', kind: 'balance', basin: 4.5, crust: [{ c: 1, f: 1, stone: 0 }, { c: 2, f: 2, stone: 0 }, { c: 7, f: 7, stone: 1 }] });
test('a whole slab sinks exactly three seconds after first contact, independently of other slabs', () => {
  const m = model(), s = newTrial(m);
  assert.equal(touchStone(m, s, 0), false, 'idle does not start a clock');
  stepTrial(s, 0, { away: true });
  assert.ok(trialSealed(s));
  assert.equal(touchStone(m, s, 0), true);
  stepTrial(s, 2);
  assert.equal(touchStone(m, s, 0), false, 'returning cannot reset the timer');
  assert.equal(touchStone(m, s, 1), true);
  stepTrial(s, STONE_TIME - 2 - 0.001);
  assert.equal(crustState(m, s, m.crust[0]), 'shaking');
  stepTrial(s, 0.001);
  assert.equal(crustState(m, s, m.crust[0]), 'gone');
  assert.equal(crustState(m, s, m.crust[1]), 'gone', 'all four cells use the same clock');
  assert.equal(crustState(m, s, m.crust[2]), 'shaking', 'the next slab has its own three seconds');
  stepTrial(s, 2);
  assert.equal(crustState(m, s, m.crust[2]), 'gone');
  assert.equal(touchStone(m, s, 99), false);
  assert.equal(touchStone(m, s, NaN), false);
  assert.equal(trialFluidLevel(m, s), m.basin);
  resolveTrial(s);
  assert.equal(crustState(m, s, m.crust[0]), 'whole');
  assert.equal(trialFluidLevel(m, s), null);
  resetTrial(s);
  assert.deepEqual(s.stones, {});
  assert.equal(crustState(m, s, m.crust[0]), 'whole');
});

test('slab clocks are sent immediately to friends and late joiners, including long attempts', () => {
  const m = model(), s = newTrial(m), owner = new TrialOwner(), viewer = newTrial(m);
  stepTrial(s, 0, { away: true }); stepTrial(s, 10000.004);
  owner.messages(0, [1], s, 123);
  touchStone(m, s, 0);
  const sent = owner.messages(1, [1], s, 123);
  assert.equal(sent.length, 1, 'a landing sends immediately, not at the next heartbeat');
  const packet = trialMessage(sent[0][0]);
  assert.deepEqual(packet.stones, { 0: 10000 });
  followTrial(viewer, packet);
  stepTrial(viewer, 3);
  assert.equal(crustState(m, viewer, m.crust[0]), 'gone');
  assert.ok(owner.messages(2, [1, 2], s, 123)[0][0].stones);
  for (const stones of [{ 0: Infinity }, { 0: -1 }, { 0: 10001 }, { bad: 0 }, []])
    assert.equal(trialMessage({ ...packet, stones }).stones, undefined);
});

function* rooms() {
  for (const seed of [0, 1, 2, 3, 123, 456]) {
    const w = new World(seed, { trial: 'balance' });
    for (const d of [2, 8, 15, 19]) {
      const t = w.layout(d).trials.find(t => t.kind === 'balance');
      if (t) yield { seed, d, m: w.cube(t.key).map };
    }
  }
}

test('generated rooms have small safe aprons, separate four-cell slabs, harmful fluid and checked jumps', () => {
  let n = 0;
  for (const { seed, d, m } of rooms()) {
    const tr = m.trial;
    assert.equal(tr?.kind, 'balance', `${seed}/${d}: generation must not fall back`);
    assert.ok([LAVA, ACID].includes(tr.fluid));
    assert.equal(TRIALS.balance.population, 0);
    assert.equal(tr.entryApron.length, 9); assert.equal(tr.exitApron.length, 9);
    const groups = new Map();
    for (const q of tr.crust) {
      if (!groups.has(q.stone)) groups.set(q.stone, []);
      groups.get(q.stone).push(q.c);
      assert.ok(m.floors[q.f].crust && m.floors[q.f].noSpawn);
    }
    assert.ok(groups.size >= 3);
    for (const cells of groups.values()) assert.equal(cells.length, 4);
    const owner = new Map(tr.crust.map(q => [q.c, q.stone]));
    for (const [c, stone] of owner) for (const dc of [1, -1, N, -N])
      assert.ok(!owner.has(c + dc) || owner.get(c + dc) === stone, 'no walking between slabs');
    assert.ok(tr.check.stones.length >= 2);
    assert.ok(tr.check.stones.every(q => q.stay < STONE_TIME));
    n++;
  }
  assert.ok(n >= 8, `checked ${n} rooms`);
});

// Like trials.test.js' collapse runner: the actual character, acceleration, run-up, collision,
// jump arc and fluid contact, rather than teleporting between the generator's checked points.
test('the real player can jump the checked way before the locally triggered slabs sink', () => {
  const DT = 1 / 60;
  let n = 0;
  try {
    for (const { seed, d, m } of rooms()) {
      const tr = m.trial, s = newTrial(tr), pts = tr.check.path;
      state.map = m;
      Object.assign(player, { x: pts[0].x, y: pts[0].y, z: pts[0].z, vx: 0, vy: 0, vz: 0, visY: pts[0].y,
        grounded: true, swimming: false, fluid: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null });
      stepTrial(s, 0, { away: true });
      setTrialFluid({ y: tr.basin * LH, fluid: tr.fluid });
      setGoneFloors(f => tr.crust.some(q => q.f === f.id && crustState(tr, s, q) === 'gone'));
      const tick = (dx, dz, run, jump) => {
        movePlayer(DT, dx, dz, run, jump); stepTrial(s, DT);
        const q = player.grounded && tr.crust.find(q => q.f === player.support?.id);
        if (q) touchStone(tr, s, q.stone);
        assert.equal(inFluid(groundAt(player.x, player.z, player.y + 0.1, 0), player.y), 0, `${seed}/${d}: fell at ${s.t.toFixed(2)} s`);
      };
      tick(0, 0, false, false);
      for (let j = 1; j < pts.length; j++) {
        const q = pts[j], gap = Math.hypot(q.x - player.x, q.z - player.z) > 1.5;
        let steps = 0, jumped = false;
        if (gap) {
          const dist = Math.hypot(q.x - player.x, q.z - player.z), ux = (q.x - player.x) / dist, uz = (q.z - player.z) / dist;
          if (player.vx * ux + player.vz * uz < 2) for (let k = 0; k < 24; k++) tick(-ux, -uz, false, false);
        }
        while (Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps++ < 300) {
          const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
          const jump = gap && !jumped && player.grounded && dist - 1.5 < CHAR_R + Math.hypot(player.vx, player.vz) * DT * 2 + 0.1;
          if (jump) jumped = true;
          tick(dx / dist, dz / dist, true, jump);
          if (gap && jumped && player.grounded && dist < 0.6) break;
        }
        assert.ok(Math.hypot(q.x - player.x, q.z - player.z) < 0.6, `${seed}/${d}: stuck at point ${j}`);
      }
      assert.ok(tr.exitApron.includes(Math.floor(player.z) * N + Math.floor(player.x)));
      n++;
    }
    assert.ok(n >= 8);
  } finally { setGoneFloors(null); setTrialFluid(null); }
});
