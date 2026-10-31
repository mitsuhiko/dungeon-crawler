// The puzzles and the other events of the trial rooms, generated and played (their plan, the
// floods and the collapses: tests/trials.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { makeLayouts } from '../src/world/layout.js';
import { worldOf } from './worlds.js';
import { step, faceKey, parse } from '../src/world/coords.js';
import { MAX_DEPTH, worldThemes } from '../src/themes/depth.js';
import { TRIALS, floodEnd, ARM_TIME, CLOSE, stormAllowance, newTrial, stepTrial, resolveTrial, resetTrial,
  trialFluidLevel, slideStop, fieldIn, isRock, useBit, plateHeld, sinkStage, SINK, traceBeam, beamDone,
  pressBrazier, allLit, pushTarget, platesHeld, FOG, fogLevel, fogY, fogHurt, COLD, coldStep, STORM,
  stormPhase, holdTime, HUNTER, runeOrder } from '../src/core/trials.js';
import { solveSlide, slideBand, solveMirror, solveBraziers, brazierPattern, solveSokoban } from '../src/cubegen/trials/solve.js';
import { PUZZLE_SIZE } from '../src/cubegen/trials/puzzles.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { N, LH, CHAR_R, CHAR_H } from '../src/core/constants.js';

const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);
const forced = (seed, trial) => makeLayouts(seed, worldThemes(seed), { trial });

const SEEDS = Array.from({ length: 10 }, (_, i) => i);

const DT = 1 / 60;
function place(m, x, y, z) {
  state.map = m;
  Object.assign(player, { x, y, z, vx: 0, vy: 0, vz: 0, visY: y, grounded: true, swimming: false, fluid: 0,
    stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, support: null, climb: null });
  movePlayer(DT, 0, 0, false, false);
}

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
    const w = worldOf(seed, { trial: 'slide' });
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
    const w = worldOf(seed, { trial: 'sunken' });
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
    const w = worldOf(seed, { trial: kind });
    for (const d of DEPTHS) for (const t of w.layout(d).trials) if (t.kind === kind) yield { t, seed, d, m: w.cube(t.key).map };
  }
}

test('every mirror and braziers room generates, unsolved, with its fewest moves in its band', () => {
  const n = {};
  for (const kind of ['mirror', 'braziers']) for (const { seed, d, m } of puzzlesOf(kind, [0, 1])) {
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
    const w = worldOf(seed, { trial: 'miasma' });
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
    const w = worldOf(seed, { trial: kind });
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
  for (const { seed, d, m } of events('storm', [0, 1, 3])) {
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
    const w = worldOf(seed, { trial: 'chase' });
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
    const w = worldOf(seed, { trial: 'runes' });
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
