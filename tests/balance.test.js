import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { player } from '../src/game/state.js';
import { World } from '../src/world/world.js';
import { TRIALS, STONE_TIME, QUICK_TIME, RHYTHM, stoneTime, stoneLeft, rhythmWindow, newTrial, stepTrial, touchStone, crustState, spendTrial, resolveTrial, resetTrial, trialFluidLevel, trialSealed } from '../src/core/trials.js';
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
  assert.equal(trialFluidLevel(m, s), m.basin, 'resolved, the basin stays at its level');
  resetTrial(s);
  assert.deepEqual(s.stones, {});
  assert.equal(crustState(m, s, m.crust[0]), 'whole');
});

// a steady slab (0), a quick one (1) and a rhythm stone (2): up 4 s of every 7, 1 s into its beat at 0
const kinds = () => ({ ...model(), crust: [...model().crust, { c: 9, f: 9, stone: 2 }],
  slabs: [{ kind: 'steady' }, { kind: 'quick' }, { kind: 'rhythm', up: 4, period: 7, offset: 1 }] });
test('a pale slab sinks sooner, a dark one rises and sinks to its beat whoever stands on it', () => {
  const m = kinds(), s = newTrial(m), rhythm = m.crust[3];
  assert.equal(stoneTime(m, 0), STONE_TIME); assert.equal(stoneTime(m, 1), QUICK_TIME);
  assert.equal(crustState(m, s, rhythm), 'whole', 'idle: as its beat has it at the start');
  stepTrial(s, 0, { away: true });
  assert.equal(touchStone(m, s, 2), false, 'no clock of its own');
  touchStone(m, s, 1);
  stepTrial(s, QUICK_TIME - 0.01);
  assert.equal(crustState(m, s, m.crust[2]), 'shaking');
  assert.equal(crustState(m, s, rhythm), 'shaking', `${RHYTHM.shake} s before it goes under`);
  assert.ok(Math.abs(stoneLeft(m, s, 2) - (3 - s.t)) < 1e-9);
  const w = rhythmWindow(m.slabs[2], s.t);
  assert.ok(Math.abs(w.from + 1) < 1e-9 && Math.abs(w.to - 3) < 1e-9, 'up from -1 s to 3 s');
  stepTrial(s, 0.02);
  assert.equal(crustState(m, s, m.crust[2]), 'gone');
  stepTrial(s, 1);
  assert.equal(crustState(m, s, rhythm), 'gone');
  assert.equal(rhythmWindow(m.slabs[2], s.t), null);
  assert.equal(stoneLeft(m, s, 2), 0);
  stepTrial(s, 7 - 1 - RHYTHM.rise + 0.05 - s.t);   // (just into its rise)
  assert.equal(crustState(m, s, rhythm), 'rising', 'coming up: seen, not there yet');
  stepTrial(s, RHYTHM.rise);
  assert.equal(crustState(m, s, rhythm), 'whole', 'up again a beat later');
  assert.equal(stoneLeft(m, s, 0), null, 'a steady slab nobody landed on has no clock');
  spendTrial(s);
  assert.equal(crustState(m, s, rhythm), 'gone', 'spent: it sinks with the rest');
  resolveTrial(s);
  assert.equal(crustState(m, s, rhythm), 'whole');
});

// (the robot's rescue puts the balance back for a new try, TRIALS.balance.retries: game/rescue.js;
// spent only where it cannot, playing together, and then for good)
test('a spent attempt: unsealed, every slab sunk, it never arms again; a rescue is a new try instead', () => {
  assert.ok(TRIALS.balance.retries);
  const m = model(), s = newTrial(m);
  assert.equal(spendTrial(s), false, 'an idle trial is not spent');
  stepTrial(s, 0, { away: true });
  touchStone(m, s, 0);
  stepTrial(s, STONE_TIME + 0.5);
  touchStone(m, s, 1);
  stepTrial(s, 1);
  assert.deepEqual([crustState(m, s, m.crust[0]), crustState(m, s, m.crust[2])], ['gone', 'shaking']);
  assert.equal(spendTrial(s, trialFluidLevel(m, s)), true);
  assert.equal(s.phase, 'spent');
  assert.equal(trialSealed(s), false, 'the seals open: they can leave to start it over');
  assert.deepEqual(m.crust.map(q => crustState(m, s, q)), ['gone', 'gone', 'gone'], 'every slab sinks: nobody crosses to a shut door');
  assert.equal(trialFluidLevel(m, s), m.basin, 'the basin stays');
  assert.equal(touchStone(m, s, 1), false);
  const t = s.t;
  assert.equal(stepTrial(s, 10, { away: true }), null, 'it never arms again');
  assert.deepEqual([s.phase, s.t], ['spent', t], 'its clock stopped');
  assert.equal(spendTrial(s), false, 'spent once');
  resetTrial(s);
  assert.equal(s.phase, 'idle', 'coming back in, it is as built');
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

test('generated rooms have small safe aprons, varied slab sizes and silhouettes, harmful fluid and checked jumps', () => {
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
    for (const cells of groups.values()) assert.ok([4, 6, 9].includes(cells.length));
    assert.ok(new Set(tr.crust.map(q => q.form)).size >= 2, 'different silhouettes in each room');
    assert.ok(new Set([...groups.values()].map(c => c.length)).size >= 2, 'different sizes in each room');
    for (const q of tr.crust.filter(q => q.form === 'L')) {
      const cells = groups.get(q.stone), xs = cells.map(c => c % N), zs = cells.map(c => c / N | 0);
      assert.ok((Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...zs) - Math.min(...zs) + 1) > cells.length, 'an L is not just a rectangle');
    }
    const owner = new Map(tr.crust.map(q => [q.c, q.stone]));
    for (const [c, stone] of owner) for (const dc of [1, -1, N, -N])
      assert.ok(!owner.has(c + dc) || owner.get(c + dc) === stone, 'no walking between slabs');
    assert.ok(tr.check.stones.length >= 2);
    assert.equal(tr.slabs.length, groups.size);
    assert.ok(tr.check.stones.every(q => q.spare >= 0 && q.stay < (q.kind === 'quick' ? QUICK_TIME : q.kind === 'rhythm' ? tr.slabs[q.stone].up : STONE_TIME)));
    assert.ok(tr.check.stones.some(q => q.kind === 'rhythm'), 'nobody gets across without watching a beat');
    for (const q of tr.slabs.filter(q => q.kind === 'rhythm')) assert.ok(q.up >= 4 && q.period - q.up >= 2 && q.offset >= 0 && q.offset <= q.period);
    n++;
  }
  assert.ok(n >= 8, `checked ${n} rooms`);
});

// Like trials.test.js' collapse runner: the actual character, acceleration, run-up, collision,
// jump arc and fluid contact, rather than teleporting between the generator's checked points. It
// waits for the plan's take-offs (the rhythm stones' beats), setting off LEAD s before each.
const LEAD = 0.8;
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
      setGoneFloors(f => tr.crust.some(q => q.f === f.id && ['gone', 'rising'].includes(crustState(tr, s, q))));
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
          // the plan's take-off (go): set off about a run-up before it
          while (s.t < pts[j - 1].go - LEAD) tick(0, 0, false, false);
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

// The same way with the keys alone, never the jump key: walking on at each brink, the hero
// teeters and jumps it (physics/brink.js), onto a stone only once it will be up to land on. They
// set off SET_OFF s before the plan's take-off: the walk to the brink and the teeter.
const SET_OFF = 0.4;
test('walking on at each brink gets across the checked way, never into the basin', () => {
  const DT = 1 / 60;
  let n = 0;
  try {
    for (const { seed, d, m } of rooms()) {
      const tr = m.trial, s = newTrial(tr), pts = tr.check.path;
      state.map = m;
      Object.assign(player, { x: pts[0].x, y: pts[0].y, z: pts[0].z, vx: 0, vy: 0, vz: 0, visY: pts[0].y, grounded: true, swimming: false,
        fluid: 0, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null, brink: null });
      stepTrial(s, 0, { away: true });
      setTrialFluid({ y: tr.basin * LH, fluid: tr.fluid });
      const under = (q, t) => ['gone', 'rising'].includes(crustState(tr, { ...s, t }, q));
      setGoneFloors((f, ahead) => tr.crust.some(q => q.f === f.id && under(q, s.t + ahead)));
      let jumps = 0;
      const tick = (dx, dz) => {
        const c = player.jumpCount;
        movePlayer(DT, dx, dz, true, false, true); stepTrial(s, DT);
        if (player.jumpCount !== c) jumps++;
        const q = player.grounded && tr.crust.find(q => q.f === player.support?.id);
        if (q) touchStone(tr, s, q.stone);
        assert.equal(inFluid(groundAt(player.x, player.z, player.y + 0.1, 0), player.y), 0, `${seed}/${d}: fell at ${s.t.toFixed(2)} s`);
      };
      tick(0, 0);
      for (let j = 1; j < pts.length; j++) {
        const q = pts[j], gap = Math.hypot(q.x - player.x, q.z - player.z) > 1.5;
        if (gap) while (s.t < pts[j - 1].go - SET_OFF) tick(0, 0);
        for (let steps = 0; Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps < 300; steps++) {
          const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
          tick(dx / dist, dz / dist);
        }
        assert.ok(Math.hypot(q.x - player.x, q.z - player.z) < 0.6, `${seed}/${d}: stuck at point ${j}`);
      }
      assert.ok(tr.exitApron.includes(Math.floor(player.z) * N + Math.floor(player.x)));
      assert.equal(jumps, pts.filter((q, j) => j && Math.hypot(q.x - pts[j - 1].x, q.z - pts[j - 1].z) > 1.5).length, `${seed}/${d}: a jump a gap`);
      n++;
    }
    assert.ok(n >= 8);
  } finally { setGoneFloors(null); setTrialFluid(null); }
});
