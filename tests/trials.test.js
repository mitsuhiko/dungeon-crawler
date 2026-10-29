import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { makeLayouts } from '../src/world/layout.js';
import { World } from '../src/world/world.js';
import { step, faceKey, parse, key } from '../src/world/coords.js';
import { voidAllowed, fallMask } from '../src/world/voids.js';
import { MAX_DEPTH, worldThemes } from '../src/themes/depth.js';
import { TRIALS, trialGate, floodLevel, floodTime, nextPulse, drainLevel, DRAIN_TIME, fitFlood, floodEnd, FLOOD, ARM_TIME, CLOSE, slowTime, stormAllowance,
  newTrial, stepTrial, resolveTrial, spendTrial, SPENT_DRAIN, resetTrial, trialFluidLevel, trialSealed, WAVE, crumbleTime, crustState, BASIN,
  slideStop, fieldIn, isRock, useBit, plateHeld, sinkStage, SINK, traceBeam, beamDone, pressBrazier, allLit, pushTarget, platesHeld, FOG, fogLevel, fogY, fogHurt, COLD, coldStep, STORM, stormPhase, holdTime, HUNTER, runeOrder } from '../src/core/trials.js';
import { solveSlide, slideBand, solveMirror, solveBraziers, brazierPattern, solveSokoban } from '../src/cubegen/trials/solve.js';
import { PUZZLE_SIZE } from '../src/cubegen/trials/puzzles.js';
import { setGoneFloors } from '../src/physics/collide.js';
import { portalPos } from '../src/world/trials.js';
import { portalLocked } from '../src/core/guardians.js';
import { createRun } from '../src/core/progression.js';
import { discoveredFaces, portalsOnly } from '../src/core/boundaries.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt } from '../src/physics/collide.js';
import { inFluid, setTrialFluid, underTrialFluid } from '../src/physics/fluid.js';
import { checkDeadlines } from '../src/cubegen/trials/timing.js';
import { N, LH, CHAR_R, CHAR_H, WATER, HEAD_Y } from '../src/core/constants.js';

const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);
const forced = (seed, trial) => makeLayouts(seed, worldThemes(seed), { trial });

test('trials come with the seed: an event on about 45% of the depths from 1 to 19, a kind that fits each', () => {
  let events = 0, depths = 0;
  for (let seed = 0; seed < 200; seed++) {
    const L = makeLayouts(seed);
    for (let d = 0; d <= MAX_DEPTH; d++) {
      const list = L(d).trials;
      if (d === 0 || d === MAX_DEPTH) { assert.equal(list.length, 0); continue; }
      depths++;
      const ev = list.filter(t => TRIALS[t.kind].family === 'event');
      assert.ok(ev.length <= 1, `${seed}/${d}: one event slot`);
      events += ev.length;
      for (const t of list) {
        assert.ok(TRIALS[t.kind].built && d >= TRIALS[t.kind].depths[0] && d <= TRIALS[t.kind].depths[1], `${seed}/${d}: ${t.kind}`);
        const th = TRIALS[t.kind].themes, theme = L(d).theme;
        assert.ok(!th || (th === 'walled' ? theme.cave || theme.walls : th.includes(theme.props)), `${seed}/${d}: ${t.kind} in ${theme.props}`);
      }
    }
  }
  // (45% of the depths roll one; not every depth has a room that fits)
  assert.ok(events / depths > 0.32 && events / depths < 0.47, `events on ${(100 * events / depths).toFixed(1)}% of the depths`);
});

test('forced floods: one per depth where a room fits, the same plan whatever the order, never in an excluded room', () => {
  let rooms = 0, depths = 0;
  for (let seed = 0; seed < 60; seed++) {
    const a = forced(seed, 'flood'), b = forced(seed, 'flood');
    for (const d of [...DEPTHS].reverse()) b(d);   // the other way round
    for (let d = 0; d <= MAX_DEPTH; d++) {
      const L = a(d);
      assert.deepEqual(L.trials.map(t => [t.key, t.kind, t.from]), b(d).trials.map(t => [t.key, t.kind, t.from]), `${seed}/${d}`);
      if (d === 0 || d === MAX_DEPTH) { assert.equal(L.trials.length, 0); continue; }
      depths++;
      assert.ok(L.trials.length <= 1, `${seed}/${d}: one event slot`);
      for (const t of L.trials) {
        rooms++;
        assert.equal(t.kind, 'flood'); assert.equal(t.role, 'route');
        const i = L.route.indexOf(t.key);
        assert.ok(i >= 2 && i <= L.route.length - 2, `${seed}/${d}: at ${i} of ${L.route.length}`);
        assert.equal(L.route[i - 1], t.from);
        assert.equal(step(t.from, t.fromDir), t.key);
        assert.equal(step(t.key, t.exit), L.route[i + 1]);
        assert.equal(L.gateFaces.get(faceKey(t.key, t.exit)), trialGate(t.key));
        assert.equal(L.trialCells.get(t.key), t);
        for (const k of [t.key, t.from]) {
          assert.ok(!L.guardians.has(k) && !L.hordes.has(k) && !L.spanCells.has(k) && !L.heightCells.has(k) && !L.areaCells.has(k),
            `${seed}/${d}: ${k} is not ordinary`);
        }
        assert.ok(L.pinnacle !== t.key && L.peak !== t.key && L.lake !== t.key && L.annex?.key !== t.key && L.annex?.parent !== t.key);
        assert.ok(!L.sitePlans.has(t.key), `${seed}/${d}: a reward site in the trial room`);
        assert.ok(!(L.spots.get(t.key) || []).length, `${seed}/${d}: a quest spot in the trial room`);
        // entered only by its two portals: no branch attaches to it, nothing pinned beside it
        const links = [0, 1, 2, 3].filter(d4 => L.portals.has(faceKey(t.key, d4)) || L.portals.has(faceKey(step(t.key, d4), d4 ^ 1)));
        assert.deepEqual(links.sort(), [t.fromDir ^ 1, t.exit].sort(), `${seed}/${d}: portals of ${t.key}`);
        for (let d4 = 0; d4 < 4; d4++) {
          const n = step(t.key, d4);
          assert.ok(!L.spanCells.has(n) && !L.heightCells.has(n) && !L.areaCells.has(n), `${seed}/${d}: pinned beside ${t.key}`);
        }
      }
    }
  }
  assert.ok(rooms / depths > 0.8, `floods in ${rooms} of ${depths} depths`);
});

test('nothing falls into a trial room, no river crosses it, it has one layer', () => {
  let n = 0;
  for (let seed = 0; seed < 12; seed++) {
    const w = new World(seed, { trial: 'flood' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) {
      n++;
      const [X, Y, Z] = parse(t.key);
      assert.equal(voidAllowed(w, t.key), false);
      if (d > 1 && w.layout(d - 1).exists.has(key(X, Y + 1, Z))) assert.equal(voidAllowed(w, key(X, Y + 1, Z)), false);
      assert.equal(fallMask(w, t.key), null, `${seed}/${d}: a fall into ${t.key}`);
      w.prepare(t.key);
      const tile = w.wfc.tiles.get(t.key);
      assert.deepEqual(tile.sock, ['L', 'L', 'L', 'L']); assert.equal(tile.K, 1);
      for (let d4 = 0; d4 < 4; d4++) {
        const f = w.faces.get(faceKey(t.key, d4));
        assert.ok(!f.river && !f.spout, `${seed}/${d}: ${t.key} face ${d4}`);
      }
      const spec = w.spec(t.key);
      assert.equal(spec.trial.kind, 'flood'); assert.ok(!spec.tunnel && !spec.pinnacle && !spec.voidOK);
      w.prepare(t.from);
      assert.equal(w.spec(t.from).trialFaces[t.fromDir], 'flood');
    }
  }
  assert.ok(n > 150, `${n} trial rooms`);
});

test('the kinds: every one has a name, a family and depths', () => {
  for (const [id, t] of Object.entries(TRIALS)) {
    assert.ok(t.name && ['event', 'puzzle'].includes(t.family) && t.depths[0] >= 1 && t.depths[1] <= 19, id);
    assert.equal(t.id, id);
  }
});

// every flood room of a few worlds, generated
function* floods(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'flood' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'flood') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}
const SEEDS = Array.from({ length: 10 }, (_, i) => i);

test('every flood room generates: a summit, the highest ground, reached from every portal, and on to the exit', () => {
  let n = 0, attempts = 0;
  for (const { t, seed, d, m } of floods(SEEDS)) {
    n++; attempts += m.attempts;
    const tr = m.trial;
    assert.equal(tr.kind, 'flood'); assert.equal(tr.gate, t.gate); assert.equal(m.archetype, 'trial'); assert.ok(m.trialRoom);
    const top = m.floors[tr.goalFloor];
    assert.equal(top.top, tr.summit.level);
    const inside = g => Math.min(g.x, g.z, N - 1 - g.x, N - 1 - g.z) >= 2;
    assert.ok(m.floors.every(g => g.fluid || !inside(g) || g.top <= tr.summit.level), `${seed}/${d}: the summit is not the highest`);
    assert.ok(tr.summit.level - tr.lo >= 10, `${seed}/${d}: the summit is ${tr.summit.level - tr.lo} over its foot`);
    // the way up starts at the entry's pad and ends on the summit
    const entry = m.portals.find(p => p.dir === tr.entry);
    assert.equal(tr.entryFloor, entry.floor.id);
    const last = tr.path.at(-1);
    assert.ok(Math.hypot(last.x - tr.button.x, last.z - tr.button.z) < 0.01, `${seed}/${d}: the path ends off the summit`);
    for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1, `${seed}/${d}: portal ${p.dir} cut off from the exit`);
    // nobody spawns on the way up
    assert.ok(tr.pathFloors.every(id => m.floors[id].noSpawn));
  }
  assert.ok(n > 150, `${n} floods`);
  assert.ok(attempts / n < 4, `${(attempts / n).toFixed(2)} attempts a room`);
});

test('the flood rises in pulses, never falls, and stops at its mark', () => {
  const tl = { kind: 'flood', from: 2, to: 15, step: 2, rise: 3, pulses: [3, 10, 17, 24, 31, 38, 45] };
  let last = -Infinity;
  for (let t = 0; t <= 80; t += 0.05) {
    const l = floodLevel(tl, t);
    assert.ok(l >= last - 1e-9, `falls at ${t}`);
    assert.ok(l <= tl.to + 1e-9);
    last = l;
  }
  assert.equal(floodLevel(tl, 0), 2); assert.equal(floodLevel(tl, 3), 2);
  assert.equal(floodLevel(tl, 4.5), 3);   // half way up the first pulse
  assert.equal(floodLevel(tl, 6), 4); assert.equal(floodLevel(tl, 9.9), 4);   // holding
  assert.equal(floodLevel(tl, 80), 15);
  // floodTime is its inverse
  for (const h of [2.5, 3, 4.2, 9, 14.9]) assert.ok(Math.abs(floodLevel(tl, floodTime(tl, h)) - h) < 1e-9, `${h}`);
  assert.equal(floodTime(tl, 15), null);
  assert.equal(nextPulse(tl, 4), 10); assert.equal(nextPulse(tl, 46), null);
  assert.equal(drainLevel(tl, 10, 0), 10); assert.equal(drainLevel(tl, 10, DRAIN_TIME), 2);
});

test('fitting a flood: each pulse waits for the slow player and no longer, a rise after the one before at the soonest; a way too long fails', () => {
  const easy = fitFlood(2, 16, []);
  assert.equal(easy.pulses[0], ARM_TIME);
  for (let j = 1; j < easy.pulses.length; j++) assert.ok(Math.abs(easy.pulses[j] - easy.pulses[j - 1] - FLOOD.rise) < 1e-9, 'nothing waiting: one straight after the other');
  assert.equal(floodEnd(easy), ARM_TIME + 7 * FLOOD.rise);
  // a need holds its pulse (and the ones after it) back
  const held = fitFlood(2, 16, [20, undefined, 30]);
  assert.deepEqual(held.pulses.slice(0, 4), [20, 22, 30, 32]);
  assert.ok(floodEnd(held) <= 70);
  assert.equal(fitFlood(2, 16, [, , , , , , 69]), null);
});

test('the deadline check: a synthetic way up passes a fitted flood and fails a too fast one', () => {
  // a straight way up: node i at level 3 + i, reached after 1.5 s each
  const path = Array.from({ length: 12 }, (_, i) => ({ id: i, x: i, z: 0, top: 3 + i, landing: true }));
  const arr = { time: new Map(path.map((n, i) => [n.id, i * 1.5])) };
  const to = 13, needs = [];
  path.forEach((n, i) => { if (i + 1 < path.length && n.top < to) { const j = Math.floor((n.top - 2) / 2); needs[j] = Math.max(needs[j] ?? 0, slowTime(arr.time.get(i + 1))); } });
  const tl = fitFlood(2, to, needs), deadline = tl => n => n.top >= to ? null : floodTime(tl, n.top);
  assert.ok(checkDeadlines(path, arr, deadline(tl)).ok);
  const fast = { ...tl, pulses: tl.pulses.map((_, j) => ARM_TIME + j * 2) };
  const res = checkDeadlines(path, arr, deadline(fast));
  assert.ok(!res.ok && res.slack < 0, JSON.stringify(res.fail));
  // ending on a floor that floods fails
  assert.ok(!checkDeadlines(path.slice(0, 5), arr, deadline(tl)).ok);
});

test('every generated flood room passes its own timing check, and the water comes close to a perfect runner', () => {
  let n = 0;
  for (const { seed, d, m } of floods(SEEDS.slice(0, 6))) {
    n++;
    const { timeline: tl, check } = m.trial;
    assert.ok(check.slack >= 0, `${seed}/${d}: slack ${check.slack}`);
    assert.ok(check.close <= CLOSE, `${seed}/${d}: never closer than ${check.close} s`);
    assert.ok(floodEnd(tl) <= FLOOD.max + 1e-6, `${seed}/${d}: ${floodEnd(tl)} s`);
    assert.equal(tl.to, m.trial.summit.level - 2);
    // every floor of the checked path is left in time, again from the stored numbers
    check.path.forEach((p, i) => {
      if (p.dl == null) return;
      assert.ok(i + 1 < check.path.length, `${seed}/${d}: the path ends under water`);
      assert.ok(slowTime(check.path[i + 1].t) <= p.dl + 0.02, `${seed}/${d}: node ${i}`);
    });
    assert.equal(check.path.at(-1).dl, null);
  }
  assert.ok(n > 90);
});

test('the states: idle until a player steps off the pad, armed for ARM_TIME, then running; resolved for good, reset to idle', () => {
  const t = { key: 'k', kind: 'flood' };
  const s = newTrial(t);
  assert.equal(s.phase, 'idle');
  assert.equal(stepTrial(s, 1, { away: false }), null); assert.equal(s.phase, 'idle'); assert.equal(s.t, 0);
  assert.equal(stepTrial(s, 0.1, { away: true }), 'armed');
  for (let i = 0; i < 29; i++) stepTrial(s, 0.1);
  assert.equal(s.phase, 'armed');
  assert.equal(stepTrial(s, 0.1), 'running');
  stepTrial(s, 1); assert.ok(Math.abs(s.t - (ARM_TIME + 1)) < 1e-9);
  assert.ok(resolveTrial(s, 7)); assert.equal(s.phase, 'resolved'); assert.equal(resolveTrial(s), false);
  stepTrial(s, 2); assert.equal(s.done, 2);
  resetTrial(s); assert.deepEqual([s.phase, s.t], ['idle', 0]);
  assert.equal(newTrial(t, true).phase, 'resolved');
  // puzzles never arm
  const p = newTrial({ key: 'p', kind: 'slide' });
  stepTrial(p, 1, { away: true }); assert.equal(p.phase, 'idle');
  // the fluid: none while idle, the timeline's level while it runs, draining back once resolved
  const m = { kind: 'flood', timeline: { kind: 'flood', from: 2, to: 15, step: 2, rise: 3, pulses: [3, 10, 17] } };
  const f = newTrial({ key: 'f', kind: 'flood' });
  assert.equal(trialFluidLevel(m, f), null);
  stepTrial(f, 0, { away: true }); stepTrial(f, 11.5);
  assert.equal(trialFluidLevel(m, f), floodLevel(m.timeline, 11.5));
  resolveTrial(f, trialFluidLevel(m, f));
  stepTrial(f, DRAIN_TIME / 2);
  assert.ok(trialFluidLevel(m, f) < 5 && trialFluidLevel(m, f) > 2);
  stepTrial(f, DRAIN_TIME);
  assert.equal(trialFluidLevel(m, f), null);
});

test('spent (the robot carried the hero back to the start): unsealed, stopped, drained fast, never armed again; a new attempt once back in', () => {
  const m = { kind: 'flood', timeline: { kind: 'flood', from: 2, to: 15, step: 2, rise: 3, pulses: [3, 10, 17] } };
  const s = newTrial({ key: 'f', kind: 'flood' });
  assert.equal(spendTrial(s), false, 'idle: nothing to spend');
  stepTrial(s, 0, { away: true }); stepTrial(s, 11.5);
  const level = trialFluidLevel(m, s);
  assert.ok(spendTrial(s, level)); assert.equal(s.phase, 'spent'); assert.equal(spendTrial(s, level), false);
  assert.equal(trialSealed(s), false);
  assert.equal(trialFluidLevel(m, s), level);
  assert.equal(stepTrial(s, SPENT_DRAIN / 2, { away: true }), null);
  assert.equal(s.t, 11.5, 'its clock stopped');
  assert.ok(trialFluidLevel(m, s) < level && trialFluidLevel(m, s) > m.timeline.from);
  stepTrial(s, SPENT_DRAIN);
  assert.equal(trialFluidLevel(m, s), null, 'drained by the time the robot sets them down');
  assert.equal(s.phase, 'spent');
  // the fog lifts the same way; the collapse's crust: what fell stays gone, the rest holds
  const fog = { kind: 'miasma', timeline: { kind: 'miasma', top: 12, from: 0, to: 8, step: 2, rise: 1, pulses: [3, 6, 9, 12] } };
  const g = newTrial({ key: 'g', kind: 'miasma' });
  stepTrial(g, 0, { away: true }); stepTrial(g, 8);
  spendTrial(g, fogLevel(fog.timeline, g.t));
  stepTrial(g, SPENT_DRAIN);
  assert.equal(fogY(fog, g), null);
  const c = { kind: 'collapse', wave: { delay: 1, speed: 2 }, crust: [{ c: 1, f: 1, d: 0 }, { c: 2, f: 2, d: 20 }] };
  const k = newTrial({ key: 'c', kind: 'collapse' });
  stepTrial(k, 0, { away: true }); stepTrial(k, crumbleTime(c.wave, 20) - WAVE.shake / 2);
  assert.deepEqual(c.crust.map(q => crustState(c, k, q)), ['gone', 'shaking']);
  spendTrial(k, trialFluidLevel(c, k));
  assert.deepEqual(c.crust.map(q => crustState(c, k, q)), ['gone', 'whole']);
  assert.equal(trialFluidLevel(c, k), BASIN, 'the basin stays under the holes');
  resetTrial(k); assert.equal(k.phase, 'idle');
});

const DT = 1 / 60;
function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null });
  movePlayer(DT, 0, 0, false, false);
}

test('under the trial\'s fluid everything drowns, and walking stops at its edge', () => {
  const { m } = floods([1]).next().value, tr = m.trial, entry = m.portals.find(p => p.dir === tr.entry);
  const a = tr.check.path[1];
  place(m, a.x, a.y, a.z);
  const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
  setTrialFluid(null);
  assert.equal(inFluid(gr, player.y), 0);
  setTrialFluid({ y: player.y + 0.4, fluid: tr.fluid });
  assert.equal(inFluid(gr, player.y), tr.fluid === WATER ? 0 : tr.fluid, 'water to the chest is waded through, the rest drowns');
  setTrialFluid({ y: player.y + HEAD_Y + 0.1, fluid: tr.fluid });
  assert.equal(inFluid(gr, player.y), tr.fluid, 'over the head it drowns');
  assert.equal(inFluid(gr, player.y + 0.5), tr.fluid === WATER ? 0 : tr.fluid);
  assert.equal(inFluid(gr, player.y + HEAD_Y + 0.2), 0, 'over it is dry');
  // on the summit, the water round its foot: walking off the top towards it stops at the edge
  const b = tr.button;
  place(m, b.x, b.y, b.z);
  setTrialFluid({ y: b.y - 0.3, fluid: tr.fluid });
  assert.equal(underTrialFluid(b.y), false);
  assert.ok(underTrialFluid(b.y - 1.5));
  setTrialFluid(null);
  void entry;
});

// A runner along the checked path, the water rising as the timeline says from the moment it arms
// (they step off the pad), every step checked for drowning. Climbs the runner cannot do (a ladder, a
// jump) are taken at their checked time.
test('running the checked way up of every flood with the real water: the summit is reached dry', () => {
  let n = 0, worst = Infinity;
  for (const { seed, d, m } of floods(SEEDS.slice(0, 4))) {
    const { check, timeline: tl } = m.trial, pts = check.path;
    place(m, pts[0].x, pts[0].y, pts[0].z);
    let t = 0, drowned = null;
    const water = () => { setTrialFluid({ y: floodLevel(tl, t) * LH, fluid: m.trial.fluid }); };
    for (let j = 1; j < pts.length && !drowned; j++) {
      const q = pts[j];
      // (a walker that only goes straight stalls where a twisted slope wants steering, or at a
      // climb: after half a second without getting closer it is there at its checked time)
      let steps = 0, best = Infinity, since = 0;
      while (Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps++ < 300) {
        const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
        if (dist < best - 0.01) { best = dist; since = 0; } else if ((since += DT) > 0.5) break;
        movePlayer(DT, dx / dist, dz / dist, true, false);
        t += DT; water();
        const gr = groundAt(player.x, player.z, player.y + 0.1, 0);
        if (inFluid(gr, player.y)) { drowned = `at ${t.toFixed(1)} s on the way to point ${j}`; break; }
      }
      if (!drowned && Math.hypot(q.x - player.x, q.z - player.z) > 0.15) { t = Math.max(t - 0.5, q.t); place(m, q.x, q.y + 0.05, q.z); }
    }
    setTrialFluid(null);
    assert.ok(!drowned, `${seed}/${d}: drowned ${drowned}`);
    const dl = floodTime(tl, tl.to - 0.01);
    worst = Math.min(worst, dl - t);
    n++;
  }
  assert.ok(n > 40 && worst > 0, `${n} walks, the least margin ${worst.toFixed(1)} s`);
});

test('the flood\'s summit is climbed by its ramp: no stair, ladder or bridge leads onto it', () => {
  for (const { seed, d, m } of floods(SEEDS.slice(0, 5))) {
    const keep = new Set([...m.trial.summit.cells, ...m.trial.pathFloors.map(id => m.floors[id].c)]);
    const needle = new Set(m.trial.summit.cells);
    for (const r of m.runs) if (r.kind !== 'landing') assert.ok(!needle.has(r.from.c) && !needle.has(r.to.c), `${seed}/${d}: a ${r.kind} onto the summit`);
    for (const l of m.ladders) assert.ok(!needle.has(l.hi) && !needle.has(l.lo), `${seed}/${d}: a ladder onto the summit`);
    void keep;
  }
});

test('sealed while an event is armed or running; the exit locked by its gate until resolved', () => {
  const { m, t } = floods([3]).next().value, s = newTrial(m.trial), run = createRun();
  assert.equal(trialSealed(s), false);
  assert.ok(portalLocked(m, run, { dir: t.exit }), 'the exit is locked');
  assert.ok(!portalLocked(m, run, { dir: t.fromDir ^ 1 }), 'the way back is not');
  stepTrial(s, 0, { away: true });
  assert.ok(trialSealed(s));
  stepTrial(s, ARM_TIME + 1);
  assert.equal(s.phase, 'running'); assert.ok(trialSealed(s));
  resolveTrial(s); run.unlockedGates.add(m.trial.gate);
  assert.equal(trialSealed(s), false);
  assert.ok(!portalLocked(m, run, { dir: t.exit }), 'resolved: the exit opens');
  resetTrial(s); assert.equal(trialSealed(s), false);
  // puzzles and unsealed kinds never seal
  const p = newTrial({ key: 'p', kind: 'slide' }); p.phase = 'running';
  assert.equal(trialSealed(p), false);
});

test('discovery joins a trial room only through its portals; its gate keeps the way on shut', () => {
  for (let seed = 0; seed < 30; seed++) {
    const L = forced(seed, 'flood');
    for (const d of DEPTHS) for (const t of L(d).trials) {
      const rooms = new Map([...L(d).exists].map(k => [k, { key: k, visits: 1, map: { key: k, exit: L(d).exit.get(k), routeIndex: L(d).routeIndex.get(k),
        route: L(d).route, trialRoom: L(d).trialCells.has(k), gateKeys: [0, 1, 2, 3].map(d4 => L(d).gateFaces.get(faceKey(k, d4))),
        portals: [0, 1, 2, 3].filter(d4 => L(d).portals.has(faceKey(k, d4)) || L(d).portals.has(faceKey(step(k, d4), d4 ^ 1))).map(dir => ({ dir, kind: 'side' })) } }]));
      const run = createRun(), c = rooms.get(t.key);
      const open = discoveredFaces(rooms, c, run);
      assert.ok(!open.includes(faceKey(t.key, t.exit)), `${seed}/${d}: the exit opens before it is resolved`);
      for (const fk of open) assert.ok(c.map.portals.some(p => faceKey(t.key, p.dir) === fk), `${seed}/${d}: ${fk} is not a portal`);
      assert.ok(portalsOnly(c.map, run), 'unresolved, it joins only through its portals');
      run.unlockedGates.add(t.gate);
      assert.ok(discoveredFaces(rooms, c, run).includes(faceKey(t.key, t.exit)), `${seed}/${d}: resolved, the exit opens`);
      // resolved, it is a room like any other: its other faces open by discovery too
      assert.ok(!portalsOnly(c.map, run));
      const plain = new Map(rooms);
      plain.set(t.key, { ...c, map: { ...c.map, trialRoom: false } });
      assert.deepEqual(discoveredFaces(rooms, c, run), discoveredFaces(plain, plain.get(t.key), run), `${seed}/${d}: resolved, its faces open as any room's`);
    }
  }
});

test('an annex joins only through its portals, resolved or not; a trial room until it is resolved', () => {
  const run = createRun();
  assert.equal(portalsOnly({ key: 'a', annexRoom: true }, run), true);
  assert.equal(portalsOnly({ key: 'b', trialRoom: true }, run), true);
  assert.equal(portalsOnly({ key: 'c' }, run), false);
  assert.equal(portalsOnly(null, run), false);
  run.unlockedGates.add(trialGate('b'));
  assert.equal(portalsOnly({ key: 'b', trialRoom: true }, run), false);
  assert.equal(portalsOnly({ key: 'b', trialRoom: true }), true, 'without a run: as unresolved');
});

test('the warning: every map knows which of its faces lead into a trial room, as planned', () => {
  let n = 0;
  for (const seed of [0, 1]) {
    const w = new World(seed, { trial: 'flood' });
    for (const d of DEPTHS) {
      const L = w.layout(d);
      for (const k of L.exists) {
        const m = w.cube(k).map;
        for (let d4 = 0; d4 < 4; d4++) {
          const t = L.trials.find(x => x.from === k && x.fromDir === d4);
          assert.equal(m.trialFaces[d4], t ? t.kind : null, `${seed}/${d}: ${k} face ${d4}`);
          if (t) { n++; assert.ok(m.portals.some(p => p.dir === d4), `${seed}/${d}: no portal to warn on`); }
        }
      }
    }
  }
  assert.ok(n > 20, `${n} warnings`);
});

// --- collapse --------------------------------------------------------------------------------------

function* collapses(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'collapse' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'collapse') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}

test('every collapse room generates: aprons, a crust 25-40 cells along with its gaps and dead ends, the wave checked', () => {
  let n = 0, branches = 0, gaps = 0;
  for (const { seed, d, m, t } of collapses(SEEDS)) {
    n++;
    const tr = m.trial;
    assert.equal(tr.kind, 'collapse'); assert.equal(m.archetype, 'trial');
    assert.equal(tr.entryApron.length, 9); assert.equal(tr.exitApron.length, 9);
    const along = tr.crust.filter(q => !q.branch).length / 2;
    assert.ok(along >= 15 && along <= 40, `${seed}/${d}: ${along} cells along`);
    branches += tr.branches; gaps += tr.gaps;
    assert.ok(tr.check.slack >= 0 && tr.wave.delay <= WAVE.most, `${seed}/${d}: slack ${tr.check.slack}, delay ${tr.wave.delay}`);
    assert.ok(tr.check.close <= CLOSE, `${seed}/${d}: never closer than ${tr.check.close} s`);
    assert.ok(tr.wave.speed >= WAVE.speed && tr.wave.speed <= WAVE.fastest, `${seed}/${d}: the wave at ${tr.wave.speed} cells/s`);
    // the checked path crosses the crust (there is no way round it) and ends on the exit apron
    assert.ok(tr.check.path.some(p => p.dl != null), `${seed}/${d}: the way does not cross the crust`);
    const last = tr.check.path.at(-1);
    assert.ok(tr.exitApron.includes(Math.floor(last.z) * N + Math.floor(last.x)));
    assert.equal(last.dl, null);
    // under the crust, the basin: its fluid all round, nothing else to stand on
    for (const q of tr.crust) assert.ok(m.floors[q.f].crust && m.floors[q.f].noSpawn);
    const keep = new Set([...tr.crust.map(q => q.c), ...tr.entryApron, ...tr.exitApron]);
    for (const f of m.floors) {
      const ring = Math.min(f.x, f.z, N - 1 - f.x, N - 1 - f.z);
      if (ring >= 2 && !keep.has(f.c)) assert.ok(f.fluid, `${seed}/${d}: dry ground at ${f.x},${f.z} off the crust`);
    }
    // nothing built: no stairs, bridges or ladders, no fences on the crust
    assert.equal(m.runs.filter(r => r.kind !== 'landing').length, 0, `${seed}/${d}: a structure`);
    assert.equal(m.ladders.length, 0);
    for (const fe of m.fenceList) assert.ok(!tr.crust.some(q => q.f === fe.cliff), `${seed}/${d}: a fence on the crust`);
    void t;
  }
  assert.ok(n > 120, `${n} rooms`);
  assert.ok(branches / n > 0.9 && gaps / n > 0.5, `${branches} dead ends, ${gaps} gaps in ${n} rooms`);
});

test('the planner predicts where a trial room\'s portals stand', () => {
  for (const seed of [0, 1, 2]) {
    const w = new World(seed, { trial: 'collapse' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) {
      w.prepare(t.key);
      for (const p of w.spec(t.key).portals) if (p.dir < 4) assert.equal(p.pos, portalPos(seed, t.key, p.dir), `${seed}/${d}`);
    }
  }
});

// A runner again along the checked path while the crust falls away behind, as the wave says from the
// moment it arms; never in the basin, onto the exit apron in the end
test('running the checked way across every collapse with the real crust falling: across, dry', () => {
  let n = 0;
  for (const { seed, d, m } of collapses(SEEDS.slice(0, 4))) {
    const tr = m.trial, pts = tr.check.path;
    place(m, pts[0].x, pts[0].y, pts[0].z);
    let t = 0, fell = null;
    const goneNow = () => new Set(tr.crust.filter(q => crumbleTime(tr.wave, q.d) <= t).map(q => q.f));
    let gone = goneNow();
    setGoneFloors(f => gone.has(f.id));
    setTrialFluid({ y: BASIN * LH, fluid: tr.fluid });
    for (let j = 1; j < pts.length && !fell; j++) {
      const q = pts[j];
      // a gap ahead (the next point two cells on): run at it and jump at the edge, for real
      let steps = 0, jumped = false;
      const gap = Math.hypot(q.x - player.x, q.z - player.z) > 1.5;
      if (gap) {   // not running that way yet: step back first, for a run-up
        const ux = (q.x - player.x) / Math.hypot(q.x - player.x, q.z - player.z), uz = (q.z - player.z) / Math.hypot(q.x - player.x, q.z - player.z);
        if (player.vx * ux + player.vz * uz < 2) for (let k = 0; k < 24; k++) { movePlayer(DT, -ux, -uz, false, false); t += DT; gone = goneNow(); }
      }
      while (Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps++ < 300) {
        const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
        // (just before the edge would stop it: still running)
        const jump = gap && !jumped && player.grounded && dist - 1.5 < CHAR_R + Math.hypot(player.vx, player.vz) * DT * 2 + 0.1;
        if (jump) jumped = true;
        movePlayer(DT, dx / dist, dz / dist, true, jump);
        t += DT; gone = goneNow();
        if (inFluid(groundAt(player.x, player.z, player.y + 0.1, 0), player.y)) { fell = `at ${t.toFixed(1)} s, on the way to point ${j}`; break; }
        if (gap && jumped && player.grounded && dist < 0.6) break;
      }
      if (!fell && Math.hypot(q.x - player.x, q.z - player.z) > 0.6) fell = `stuck before point ${j} at ${player.x.toFixed(2)}, ${player.z.toFixed(2)}`;
    }
    setGoneFloors(null); setTrialFluid(null);
    assert.ok(!fell, `${seed}/${d}: fell ${fell}`);
    assert.ok(tr.exitApron.includes(Math.floor(player.z) * N + Math.floor(player.x)), `${seed}/${d}: not on the exit apron`);
    n++;
  }
  assert.ok(n > 40, `${n} walks`);
});

test('a crust cell shakes, then is gone; the wave follows the distance from the entry', () => {
  const m = { kind: 'collapse', wave: { speed: 1.3, delay: 2 } }, s = newTrial({ key: 'k', kind: 'collapse' });
  const q = { d: 6.5 };
  assert.equal(crustState(m, s, q), 'whole');
  stepTrial(s, 0, { away: true });
  const at = crumbleTime(m.wave, q.d);
  assert.equal(at, ARM_TIME + 2 + 5);
  stepTrial(s, at - WAVE.shake - 0.1); assert.equal(crustState(m, s, q), 'whole');
  stepTrial(s, 0.2); assert.equal(crustState(m, s, q), 'shaking');
  stepTrial(s, WAVE.shake); assert.equal(crustState(m, s, q), 'gone');
  assert.equal(trialFluidLevel(m, s), BASIN);
  resolveTrial(s); assert.equal(crustState(m, s, q), 'whole');   // the keystone: whole again, for good
});

// --- slide (and the puzzles' plan) ----------------------------------------------------------------

test('puzzles come with the seed: one on about 60% of the depths, a second on about 25%, in a branch where one fits', () => {
  let puzzles = 0, branch = 0, depths = 0, two = 0;
  for (let seed = 0; seed < 200; seed++) {
    const L = makeLayouts(seed);
    for (const d of DEPTHS) {
      const list = L(d).trials.filter(t => TRIALS[t.kind].family === 'puzzle');
      depths++; puzzles += list.length; two += list.length === 2;
      for (const t of list) {
        if (t.role === 'branch') {
          branch++;
          assert.equal(t.exit, null);
          assert.ok(!L(d).route.includes(t.key), `${seed}/${d}: a branch on the route`);
          assert.ok(L(d).sitePlans.get(t.key)?.length, `${seed}/${d}: a vault without its reward site`);
          assert.equal(step(t.from, t.fromDir), t.key);
        } else assert.equal(L(d).gateFaces.get(faceKey(t.key, t.exit)), t.gate);
      }
      // never two trials side by side
      for (const a of L(d).trials) for (const b of L(d).trials) if (a !== b)
        assert.ok(Math.abs(parse(a.key)[0] - parse(b.key)[0]) + Math.abs(parse(a.key)[2] - parse(b.key)[2]) > 1, `${seed}/${d}: ${a.key} by ${b.key}`);
    }
  }
  assert.ok(puzzles / depths > 0.7 && puzzles / depths < 0.9, `${puzzles} puzzles on ${depths} depths`);
  assert.ok(branch / puzzles > 0.3, `${branch} of ${puzzles} in a branch`);
  assert.ok(two / depths > 0.08, `${two} depths with two`);
});

test('the slide solver: a known field, its fewest slides, no trap', () => {
  // E . . . . #        the entry on the west of (0,0), the goal on the south of (3,5)
  // . . # . . .
  // . . . . . .
  // # . # . . .
  // # . . . . .
  // . . . G . .
  const rows = ['.....#', '..#...', '......', '#.#...', '#.....', '......'];
  const F = { w: 6, h: 6, rock: rows.flatMap(r => [...r].map(c => c === '#' ? 1 : 0)), entry: { x: 0, z: 0, side: 1 }, goal: { x: 3, z: 5, side: 2 } };
  assert.deepEqual(slideStop(F, 0, 0, 0), [4, 0]);
  assert.equal(slideStop(F, 0, 0, 1), 'out');
  assert.deepEqual(slideStop(F, 3, 5, 2), [3, 5]);
  assert.equal(slideStop(F, 3, 5, 2, true), 'goal');
  const s = solveSlide(F);
  assert.ok(Number.isFinite(s.slides) && s.way.length === s.slides);
  // the way, slid out from where stepping in ends, ends on the goal
  let at = slideStop(F, 0, 0, 0);
  for (const d of s.way) at = slideStop(F, at[0], at[1], d);
  assert.deepEqual(at, [3, 5]);
  // a trap: walled in where no slide leads back
  const T = { w: 3, h: 3, rock: [0, 0, 0, 1, 1, 0, 0, 0, 0], entry: { x: 0, z: 0, side: 1 }, goal: { x: 2, z: 2, side: 2 } };
  assert.ok(solveSlide(T).slides < Infinity);
});

function* slides(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'slide' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'slide') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}

test('every slide room generates: ice as the rule says, solvable in its band, no trap, its gate and plate', () => {
  let n = 0, vaults = 0;
  for (const { seed, d, m, t } of slides(SEEDS.slice(0, 6))) {
    n++;
    const tr = m.trial.puzzles[0], F = tr.field, D = tr.deck, [lo, hi] = slideBand(d);
    const s = solveSlide(F);
    assert.ok(s.slides >= lo && s.slides <= hi && !s.trapped && s.decoys >= 3, `${seed}/${d}: ${JSON.stringify(s)}`);
    assert.equal(s.slides, tr.check.slides);
    // the ground is the field: ice at the deck's level, rocks and the rim up out of reach, the two gaps open
    const top = (x, z) => m.cols[z * N + x].find(f => f.layer === 0)?.top;
    for (let z = -1; z <= F.h; z++) for (let x = -1; x <= F.w; x++) {
      const cx = D.x0 + x, cz = D.z0 + z, c = cz * N + cx, inField = fieldIn(F, x, z);
      if (inField && !isRock(F, x, z)) {
        const f = m.cols[c].find(g => g.layer === 0);
        assert.ok(f.ice && top(cx, cz) === D.level && !m.pieces[c].length, `${seed}/${d}: ice at ${x},${z}`);
      } else if (c === tr.entryGap || c === tr.goalGap) assert.equal(top(cx, cz), D.level, `${seed}/${d}: a gap`);
      else if (inField || (x === -1 || z === -1 || x === F.w || z === F.h) && !((x === -1 || x === F.w) && (z === -1 || z === F.h)))
        assert.ok(top(cx, cz) >= D.level + 3, `${seed}/${d}: rim or rock at ${x},${z}`);
    }
    assert.ok(tr.parts.some(p => p.type === 'plate') && tr.parts.some(p => p.type === 'gate'));
    assert.ok(m.trial.parts.length === tr.parts.length && m.trial.parts.every(p => p.puzzle === 0));
    // a route puzzle holds the exit, a vault its reward site
    if (t.role === 'branch') { vaults++; assert.ok(m.rewardSites.length >= 1, `${seed}/${d}: the vault is empty`); }
    else assert.equal(m.gateKeys[t.exit], t.gate);
  }
  assert.ok(n > 60 && vaults > 10, `${n} slides, ${vaults} vaults`);
});

test('parts: a lever flips, a button stays down, a reset lever puts the start back, a plate is held by whoever stands on it', () => {
  const s = newTrial({ key: 'k', kind: 'crates', start: { a: 1 } });
  assert.deepEqual(s.bits, { a: 1 });
  useBit(s, { id: 'l', type: 'lever' }); assert.equal(s.bits.l, 1);
  useBit(s, { id: 'l', type: 'lever' }); assert.equal(s.bits.l, 0);
  useBit(s, { id: 'b', type: 'button' }); useBit(s, { id: 'b', type: 'button' }); assert.equal(s.bits.b, 1);
  s.bits.a = 0;
  useBit(s, { id: 'r', type: 'reset' }, { a: 1 }); assert.deepEqual(s.bits, { a: 1 });
  const p = { x: 4.5, y: 2, z: 7.5 };
  assert.ok(plateHeld(p, [{ x: 4.1, y: 2.05, z: 7.9 }]));
  assert.ok(!plateHeld(p, [{ x: 5.1, y: 2, z: 7.5 }]));
  assert.ok(!plateHeld(p, [{ x: 4.5, y: 4, z: 7.5 }]));
  resetTrial(s, { a: 1 }); assert.deepEqual(s.bits, { a: 1 });
});

// --- sunken -----------------------------------------------------------------------------------------

function* sunkens(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'sunken' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'sunken') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}

test('every sunken room generates: in from up high, out on the ground, two puzzles of the rotation each as in its own room, each dry only once the one before drains', () => {
  let n = 0;
  const kinds = {};
  for (const { seed, d, m, t } of sunkens(SEEDS.slice(0, 5))) {
    n++;
    const tr = m.trial, W = tr.water, entry = m.portals.find(p => p.dir === tr.entry), exit = m.portals.find(p => p.dir === t.exit);
    assert.equal(m.K, 3); assert.equal(entry.layer, 2); assert.equal(exit.layer, 0);
    assert.equal(tr.puzzles.length, 2); assert.equal(tr.stages, 2); assert.equal(W.length, 3);
    assert.deepEqual(tr.puzzles.map(p => p.kind), t.stages);
    assert.notEqual(t.stages[0], t.stages[1]);
    // its portals where the plan moved them
    const along = p => p.dir < 2 ? p.z : p.x;
    assert.equal(along(entry), t.pads[tr.entry]); assert.equal(along(exit), t.pads[t.exit]);
    for (let i = 1; i < W.length; i++) assert.ok(W[i] < W[i - 1], `${seed}/${d}: the water sinks`);
    assert.ok(entry.y > W[0] * LH && exit.y < W[1] * LH, `${seed}/${d}: in over the water, out under it until the end`);
    tr.puzzles.forEach((pz, i) => {
      assert.ok(pz.deck.level > W[i], `${seed}/${d}: platform ${i} dry at its stage`);
      if (i) assert.ok(pz.deck.level < W[i - 1], `${seed}/${d}: platform ${i} under water before`);
      // the puzzle as in a room of its own: its field's size and how hard it is
      const size = PUZZLE_SIZE[pz.kind](d);
      assert.deepEqual([Math.min(pz.deck.w, pz.deck.h), Math.max(pz.deck.w, pz.deck.h)], [size.short, size.long], `${seed}/${d}: ${pz.kind} ${pz.deck.w}x${pz.deck.h}`);
      const bits = type => pz.parts.filter(p => p.type === type).sort((a, b) => a.i - b.i).map(p => tr.start[p.id]);
      const moves = pz.kind === 'slide' ? solveSlide(pz.field).slides : pz.kind === 'mirror' ? solveMirror(pz.field, bits('mirror')).flips
        : pz.kind === 'braziers' ? solveBraziers(pz.field.links, bits('brazier')).presses : pz.check.pushes;
      assert.ok(moves >= size.band[0] && moves <= size.band[1], `${seed}/${d}: ${pz.kind} in ${moves}, its band ${size.band}`);
      kinds[pz.kind] = (kinds[pz.kind] ?? 0) + 1;
    });
  }
  assert.ok(n > 40 && Object.keys(kinds).length >= 3, `${n} sunken rooms, puzzles ${JSON.stringify(kinds)}`);
});

test('the sunken water: a stage at a time, sinking over SINK s, gone once resolved', () => {
  const m = { kind: 'sunken', water: [15, 7, 2], stages: 2 }, s = newTrial({ key: 'k', kind: 'sunken' });
  assert.equal(trialFluidLevel(m, s), 15);
  stepTrial(s, 1, { away: true }); assert.equal(s.phase, 'idle', 'it never arms: not timed, not sealed');
  assert.equal(sinkStage(m, s, 1), false, 'only the stage it is at');
  assert.ok(sinkStage(m, s, 0)); assert.equal(s.stage, 1);
  assert.equal(trialFluidLevel(m, s), 15);
  s.sink.t = SINK / 2; assert.equal(trialFluidLevel(m, s), 11);
  s.sink.t = SINK; assert.equal(trialFluidLevel(m, s), 7);
  assert.ok(sinkStage(m, s, 1)); s.sink.t = SINK; resolveTrial(s);
  assert.equal(trialFluidLevel(m, s), null);
});

// --- mirror, braziers ------------------------------------------------------------------------------

test('the beam: straight on, turned by each mirror the way its bit says, stopped by a rock or a body', () => {
  // emitter on the west of row 1 heading +x; a mirror at (2, 1); the receiver north of (2, 0)
  const F = { w: 4, h: 3, mirrors: [[2, 1]], blockers: [[3, 2]], emitter: { x: 0, z: 1, dir: 0 }, receiver: { x: 2, z: 0, side: 3 } };
  assert.ok(traceBeam(F, [0]).lit, "'/' turns +x into -z");
  assert.ok(!traceBeam(F, [1]).lit, "'\\' turns it into +z");
  assert.deepEqual(traceBeam(F, [1]).end, [2, 3]);   // (the first place off the field)
  assert.ok(!traceBeam(F, [0], (x, z) => x === 1 && z === 1).lit, 'a body in the way');
  assert.deepEqual(solveMirror(F, [1]), { flips: 1, solution: [0], traps: 0 });
  // a lens on (1, 1): the beam lights it on its way; one off the way leaves it unsolved
  assert.deepEqual(traceBeam({ ...F, lenses: [[1, 1]] }, [0]).hits, [0]);
  assert.ok(beamDone({ ...F, lenses: [[1, 1]] }, traceBeam({ ...F, lenses: [[1, 1]] }, [0])));
  assert.ok(!beamDone({ ...F, lenses: [[0, 2]] }, traceBeam({ ...F, lenses: [[0, 2]] }, [0])));
  assert.equal(solveMirror({ ...F, lenses: [[0, 2]] }, [1]).traps, 1);
});

test('lights out: pressing toggles a brazier and its links; the solver finds the fewest presses', () => {
  for (const kind of ['grid', 'ring', 'star']) for (const size of [3, 5]) {
    const { at, links } = brazierPattern(kind, size);
    assert.ok(at.length >= 5 && at.length <= 9);
    // every way to press up to three braziers: the solver finds no more than that
    for (let a = 0; a < at.length; a++) for (let b = a; b < at.length; b++) {
      const bits = at.map(() => 1);
      pressBrazier(bits, links, a); if (b !== a) pressBrazier(bits, links, b);
      const s = solveBraziers(links, bits);
      assert.ok(s.presses <= (a === b ? 1 : 2), `${kind}: ${a},${b}: ${s.presses}`);
      for (const i of s.which) pressBrazier(bits, links, i);
      assert.ok(allLit(bits));
    }
  }
});

function* puzzlesOf(kind, seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: kind });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === kind) yield { t, seed, d, m: w.cube(t.key).map };
  }
}

test('every mirror and braziers room generates, unsolved, with its fewest moves in its band', () => {
  const n = {};
  for (const kind of ['mirror', 'braziers']) for (const { seed, d, m } of puzzlesOf(kind, [0, 1, 2])) {
    n[kind] = (n[kind] ?? 0) + 1;
    const pz = m.trial.puzzles[0], bits = type => pz.parts.filter(p => p.type === type).sort((a, b) => a.i - b.i).map(p => m.trial.start[p.id]);
    const deep = d >= 10;
    if (kind === 'mirror') {
      assert.ok(!traceBeam(pz.field, bits('mirror')).lit, `${seed}/${d}: lit at the start`);
      const s = solveMirror(pz.field, bits('mirror'));
      assert.ok(s.flips >= (deep ? 4 : 3) && pz.field.mirrors.length <= 12, `${seed}/${d}: ${s.flips} flips`);
      // the lenses: one (two from depth 10), on the way, and a way to the receiver that misses one
      assert.equal(pz.field.lenses.length, deep ? 2 : 1);
      assert.equal(pz.parts.filter(p => p.type === 'lens').length, pz.field.lenses.length);
      assert.ok(s.traps >= 1 && beamDone(pz.field, traceBeam(pz.field, s.solution)), `${seed}/${d}: ${s.traps} traps`);
    } else {
      assert.ok(!allLit(bits('brazier')));
      assert.ok(solveBraziers(pz.field.links, bits('brazier')).presses >= 3, `${seed}/${d}`);
    }
    assert.ok(pz.parts.every(p => p.puzzle === 0));
  }
  assert.ok(n.mirror > 30 && n.braziers > 30, JSON.stringify(n));
});

// --- crates -------------------------------------------------------------------------------------

test('Sokoban: a crate pushed (never pulled) onto its plate in the fewest pushes; a crate in a corner is lost', () => {
  // 4 x 3, no walls: the crate at (1,1), the plate at (3,1), the player at (0,1): two pushes east
  const F = { w: 4, h: 3, walls: [], plates: [7], entry: { x: 0, z: 1, side: 1 } };
  assert.deepEqual(solveSokoban(F, [5], 4), { pushes: 2, way: [[0, 0], [0, 0]] });
  assert.equal(pushTarget(F, [5], 5, 1), 4);
  assert.equal(pushTarget(F, [5], 7, 0), null, 'off the field');
  // in a corner it never comes out
  assert.equal(solveSokoban(F, [0], 5).pushes, Infinity);
  // a wall in the way: round it
  const W = { w: 4, h: 3, walls: [6], plates: [7], entry: { x: 0, z: 1, side: 1 } };
  assert.equal(solveSokoban(W, [5], 4).pushes, Infinity);
  assert.ok(platesHeld(F, [7]) && !platesHeld(F, [6]));
});

test('every crates room generates: solvable in its band from the way in, no crate on a plate at the start', () => {
  let n = 0;
  for (const { seed, d, m } of puzzlesOf('crates', [0, 1, 2])) {
    n++;
    const pz = m.trial.puzzles[0], F = pz.field, crates = pz.parts.filter(p => p.type === 'crate').sort((a, b) => a.i - b.i).map(p => m.trial.start[p.id]);
    const entry = F.entry.z * F.w + F.entry.x;
    assert.ok(!crates.some(c => F.plates.includes(c)), `${seed}/${d}: a crate on a plate`);
    assert.ok(pz.parts.some(p => p.type === 'reset'), `${seed}/${d}: no reset lever`);
    const s = solveSokoban(F, crates, entry, F.plates, 1e6);
    assert.ok(s.pushes === pz.check.pushes && s.pushes >= (d >= 10 ? 16 : 10), `${seed}/${d}: ${s.pushes} pushes`);
    assert.ok(pz.check.switches >= crates.length, `${seed}/${d}: ${pz.check.switches} switches`);
    assert.equal(crates.length, F.plates.length);
  }
  assert.ok(n > 30, `${n}`);
});

// --- the timed gate ----------------------------------------------------------------------------

test('every timed gate room: a causeway over the fluid with gaps to jump, the run along it tight', () => {
  let n = 0, gaps = 0;
  for (const { seed, d, m } of puzzlesOf('timedgate', [0, 1])) {
    n++;
    const pz = m.trial.puzzles[0], deep = d >= 10;
    assert.equal(m.trial.role, 'route');
    assert.ok(pz.check.run >= 6 && pz.T >= pz.check.run * (deep ? 1.08 : 1.15) && pz.T <= pz.check.run * (deep ? 1.08 : 1.15) + 1.01, `${seed}/${d}: ${pz.check.run} s, open ${pz.T}`);
    assert.ok(m.trial.check.path.length > 15, `${seed}/${d}: ${m.trial.check.path.length} cells`);
    gaps += pz.check.gaps;
    // the way runs over the fluid: the cells beside it are wet
    const wet = m.trial.check.path.filter(p => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => m.cols[Math.floor(p.z + dz) * 16 + Math.floor(p.x + dx)]?.some(f => f.fluid)));
    assert.ok(wet.length > 8, `${seed}/${d}: ${wet.length} cells by the fluid`);
  }
  assert.ok(n > 20 && gaps >= n / 3, `${n} rooms, ${gaps} gaps`);   // (many have a gap or two to jump)
});

// --- miasma -------------------------------------------------------------------------------------

function* fogs(seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: 'miasma' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'miasma') yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}

test('the fog sinks in pulses from over the highest floor, never rises while it runs, and lifts once resolved', () => {
  const { m } = fogs([1]).next().value, tl = m.trial.timeline;
  const top = Math.max(...m.floors.filter(f => !f.fluid).map(f => f.landing ? f.top : Math.max(...f.cs) / LH));
  assert.ok(tl.top >= top + FOG.over - 0.01);
  let last = Infinity;
  for (let t = 0; t < floodEnd(tl) + 5; t += 0.5) { const y = fogLevel(tl, t); assert.ok(y <= last + 1e-9); last = y; }
  const s = { phase: 'running', t: 20 }, y = fogY(m.trial, s);
  assert.ok(Math.abs(y - fogLevel(tl, 20) * LH) < 1e-9);
  resolveTrial(s, fogLevel(tl, 20));
  s.done = 2; assert.ok(fogY(m.trial, s) > y);
  s.done = 6; assert.equal(fogY(m.trial, s), null);
  assert.ok(fogHurt(100, 0) === 6 && fogHurt(100, 2) === 12);
});

// A runner along the checked way down, the fog sinking from the moment it arms: the head never in
// it, the valve reached; and the fog comes close
test('running the checked way down of every miasma room with the real fog: the valve reached, never in it', () => {
  let n = 0, worst = Infinity;
  for (const { seed, d, m } of fogs(SEEDS.slice(0, 3))) {
    const { check, timeline: tl } = m.trial, pts = check.path, valve = m.floors[m.trial.goalFloor];
    place(m, pts[0].x, pts[0].y, pts[0].z);
    let t = 0, choked = null;
    assert.ok(check.slack >= 0 && check.close <= CLOSE, `${seed}/${d}: slack ${check.slack}, closest ${check.close} s`);
    for (let j = 1; j < pts.length && !choked; j++) {
      const q = pts[j];
      let steps = 0, best = Infinity, since = 0;
      while (Math.hypot(q.x - player.x, q.z - player.z) > 0.15 && steps++ < 300) {
        const dx = q.x - player.x, dz = q.z - player.z, dist = Math.hypot(dx, dz);
        if (dist < best - 0.01) { best = dist; since = 0; } else if ((since += DT) > 0.5) break;
        movePlayer(DT, dx / dist, dz / dist, true, false);
        t += DT;
        if (player.y + CHAR_H > fogLevel(tl, t) * LH) { choked = `at ${t.toFixed(1)} s on the way to point ${j}`; break; }
      }
      if (!choked && Math.hypot(q.x - player.x, q.z - player.z) > 0.15) { t = Math.max(t - 0.5, q.t); place(m, q.x, q.y + 0.05, q.z); }
    }
    assert.ok(!choked, `${seed}/${d}: in the fog ${choked}`);
    // on the valve's ledge the fog stays over a head
    assert.ok(fogLevel(tl, 1e9) * LH > valve.top * LH + CHAR_H, `${seed}/${d}: the fog comes down onto the valve`);
    worst = Math.min(worst, (fogLevel(tl, t) * LH) - (player.y + CHAR_H));
    n++;
  }
  assert.ok(n > 15, `${n} walks`);
});

// --- cold, storm -----------------------------------------------------------------------------------

function* events(kind, seeds) {
  for (const seed of seeds) {
    const w = new World(seed, { trial: kind });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === kind) yield { w, t, seed, d, m: w.cube(t.key).map };
  }
}

test('the cold meter: up to 100 in COLD.freeze s away from warmth, down four times as fast by it', () => {
  let m = 0;
  for (let t = 0; t < COLD.freeze / 2; t += 0.1) m = coldStep(m, 0.1, false);
  assert.ok(Math.abs(m - 50) < 0.6, `${m}`);
  for (let t = 0; t < COLD.freeze / 8; t += 0.1) m = coldStep(m, 0.1, true);
  assert.ok(m < 1);
  assert.equal(coldStep(99.9, 1, false), 100);
});

test('every cold room: a long way round the ridges, the braziers along it far apart, the meter kept under freezing, no way straight to the fire', () => {
  let n = 0;
  for (const { seed, d, m, t } of events('cold', [0, 1, 2])) {
    const tr = m.trial, along = tr.parts.filter(p => p.type === 'warm' && !p.off), warm = tr.parts.filter(p => p.type === 'warm'), path = tr.check.path;
    assert.equal(t.exit, t.fromDir);   // (in on one side, out on the opposite one)
    assert.ok(path.length >= COLD.least, `${seed}/${d}: a way of ${path.length} cells`);
    assert.ok(along.length >= COLD.along[0] && along.length <= COLD.along[1], `${seed}/${d}: ${along.length} braziers`);
    assert.ok(Math.hypot(along[0].x - path[0].x, along[0].z - path[0].z) >= COLD.apart, `${seed}/${d}: the first by the entry`);
    for (const a of along) for (const b of warm) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= COLD.apart * 0.75 - 0.01, `${seed}/${d}: braziers too close`);
    // the freezing time fitted: going straight for the fire freezes a perfect runner, lighting the braziers keeps a slow player warm enough
    assert.ok(tr.freeze >= COLD.quick && tr.freeze <= COLD.freeze, `${seed}/${d}: freezes in ${tr.freeze} s`);
    assert.ok(tr.check.dash >= 100, `${seed}/${d}: straight to the fire the meter is at ${tr.check.dash}`);
    assert.ok(tr.check.worst <= COLD.reach * 100, `${seed}/${d}: the meter goes up to ${tr.check.worst}`);
    assert.ok(tr.parts.some(p => p.type === 'fire'));
    n++;
  }
  assert.ok(n > 15, `${n}`);
});

test('the storm\'s cycle: a warning, the gust, a lull, from the clock running', () => {
  assert.equal(stormPhase(1).phase, 'calm');
  assert.equal(stormPhase(ARM_TIME + 0.5).phase, 'warning');
  assert.equal(stormPhase(ARM_TIME + STORM.warning + 0.1).phase, 'gust');
  assert.equal(stormPhase(ARM_TIME + STORM.warning + STORM.gust + 0.1).phase, 'lull');
  assert.equal(stormPhase(ARM_TIME + STORM.period + 0.5).phase, 'warning');
});

test('every storm room: the rod on a tall hill, the way round it, out in the wind longer than a gust\'s warning, but not longer than a slow player can cross between gusts', () => {
  let n = 0;
  for (const { seed, d, m } of events('storm', [0, 1, 2])) {
    const tr = m.trial, rod = tr.parts.find(p => p.type === 'rod'), foot = tr.check.path[0];
    assert.ok(tr.check.exposed <= stormAllowance() + 1e-9 && tr.check.exposed >= STORM.wait - 1e-9, `${seed}/${d}: ${tr.check.exposed} s in the wind`);
    assert.ok(tr.check.slow <= STORM.lull + STORM.warning + 0.01, `${seed}/${d}: ${tr.check.slow} s in the wind, slowly`);
    assert.ok(rod.y - foot.y >= 6, `${seed}/${d}: the rod ${rod.y - foot.y} over the way's start`);   // (12 levels at least)
    assert.ok(tr.check.climb >= 20 && tr.stones.length >= 2 && tr.exposed.length > 10, `${seed}/${d}: ${tr.check.climb} cells up, ${tr.stones.length} boulders`);
    // the way goes round the hill: its angle about the eye sweeps most of a turn
    let turn = 0;
    const ang = p => Math.atan2(p.z - tr.eye.z, p.x - tr.eye.x), low = Math.min(...tr.check.path.map(p => p.y)), r = p => Math.hypot(p.x - tr.eye.x, p.z - tr.eye.z), path = tr.check.path.filter(p => p.y > low + 0.4 && r(p) < 4.8 && r(p) > 2.3);   // (up on the ramp, not the summit)
    for (let i = 1; i < path.length; i++) turn += ((ang(path[i]) - ang(path[i - 1]) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    assert.ok(Math.abs(turn) > Math.PI * 1.2, `${seed}/${d}: the way turns ${Math.abs(turn).toFixed(2)} round the hill`);
    n++;
  }
  assert.ok(n > 10, `${n}`);
});

// --- siege, chase -----------------------------------------------------------------------------------

test('every siege room: the ring flat round the beacon, 2-3 mouths far from it, each reaching it; the hold grows with depth', () => {
  let n = 0;
  for (const { seed, d, m } of events('siege', [0, 1, 2])) {
    const tr = m.trial;
    assert.ok(tr.mouths.length >= 2 && tr.mouths.length <= 3, `${seed}/${d}: ${tr.mouths.length} mouths`);
    assert.ok(tr.mouths.every(o => Math.hypot(o.x - tr.ring.x, o.z - tr.ring.z) >= 6.5));
    for (const f of m.floors) if (!f.fluid && f.layer === 0 && Math.hypot(f.x + 0.5 - tr.ring.x, f.z + 0.5 - tr.ring.z) <= tr.ring.r)
      assert.ok(Math.max(...f.cs) - Math.min(...f.cs) <= 0.2 && Math.abs(f.top * LH - tr.ring.y) < 0.01, `${seed}/${d}: the ring is not flat`);
    n++;
  }
  assert.ok(n > 20, `${n}`);
  assert.equal(holdTime(2), 45); assert.equal(holdTime(19), 90);
});

test('every relic room: a courtyard with both portals walled off from the hall but for its gate; the race to the lever won running, just', () => {
  let n = 0;
  for (const seed of [0, 1, 2, 3, 4]) {
    const w = new World(seed, { trial: 'chase' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'chase') {
      const m = w.cube(t.key).map, tr = m.trial, c = tr.check, hall = new Set(tr.hall);
      assert.ok(c.lever <= c.hunter && c.cells >= HUNTER.least, `${seed}/${d}: lever ${c.lever} s, warden ${c.hunter} s, ${c.cells} cells`);
      assert.ok(c.hunter - c.lever < 0.2, `${seed}/${d}: the warden ${c.hunter - c.lever} s behind the slow player: no race`);
      assert.ok(tr.wake >= HUNTER.wake && tr.wake <= HUNTER.late, `${seed}/${d}: it wakes after ${tr.wake} s`);
      const cellOf = p => Math.floor(p.z) * 16 + Math.floor(p.x), part = type => tr.parts.find(p => p.type === type);
      // the relic and the lair in the hall, the lever and both portals' pads out of it
      assert.ok(hall.has(cellOf(part('relic'))) && hall.has(cellOf(tr.lair)), `${seed}/${d}: relic or lair outside the hall`);
      assert.ok(!hall.has(cellOf(part('lever'))) && !hall.has(cellOf(part('portcullis'))), `${seed}/${d}: the lever in the hall`);
      for (const p of m.portals.filter(q => q.kind === 'side')) assert.ok(!hall.has(cellOf(p)), `${seed}/${d}: a portal in the hall`);
      // the run goes through the gate
      assert.ok(c.path.some(p => cellOf(p) === cellOf(part('portcullis'))), `${seed}/${d}: the run misses the gate`);
      assert.equal(m.populationScale, 0);
      n++;
    }
  }
  assert.ok(n > 15, `${n}`);
});

// --- runes -------------------------------------------------------------------------------------------

test('a rune order comes from the trial\'s id alone: 4 stones to depth 9, 5-6 from 10, each glyph once', () => {
  const a = runeOrder('7:1,-3,2:trial', 4), b = runeOrder('7:1,-3,2:trial', 4), c = runeOrder('7:1,-3,2:trial', 12);
  assert.deepEqual(a, b);
  assert.equal(a.glyphs.length, 4); assert.ok(c.glyphs.length === 5 || c.glyphs.length === 6);
  assert.equal(new Set(a.glyphs).size, 4);
  assert.deepEqual([...a.order].sort(), [0, 1, 2, 3]);
});

test('every rune room has its clue in an ordinary room the way passes before it, the tablet there telling its order', () => {
  let n = 0;
  for (const seed of [0, 1, 2]) {
    const w = new World(seed, { trial: 'runes' });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === 'runes') {
      const L = w.layout(d), route = L.route, at = route.indexOf(t.role === 'route' ? t.key : t.from);
      assert.ok(t.clue && route.indexOf(t.clue) >= 1 && route.indexOf(t.clue) <= at, `${seed}/${d}: the clue at ${route.indexOf(t.clue)}, the room at ${at}`);
      assert.ok(!L.trialCells.has(t.clue) && L.trialClues.get(t.clue).includes(t));
      const tab = w.cube(t.clue).map.clues.find(c => c.key === t.key), pz = w.cube(t.key).map.trial.puzzles[0];
      assert.ok(tab && tab.key === t.key, `${seed}/${d}: no tablet`);
      assert.deepEqual(tab.glyphs, pz.field.order.map(i => pz.field.glyphs[i]));
      assert.equal(pz.parts.filter(p => p.type === 'runestone').length, pz.field.glyphs.length);
      n++;
    }
  }
  assert.ok(n > 20, `${n}`);
});
