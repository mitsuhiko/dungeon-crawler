// The room tasks (docs/trials.md "Room tasks"): their plan, their rules and what the generator
// lays over the rooms they are in, each kind made on purpose (every task of whole worlds:
// tests/sweeps/tasks.js)
import './fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts } from '../src/world/layout.js';
import { worldOf } from './worlds.js';
import { faceKey, step } from '../src/world/coords.js';
import { MAX_DEPTH, worldThemes } from '../src/themes/depth.js';
import { TRIALS } from '../src/core/trials.js';
import { TASK_KINDS, taskCount, taskMark, bitsOf, litNow, lanternLit, fitBurn, FADING, holdTime, PLACE, pickBearer, keybearerKind, BEARER } from '../src/core/tasks.js';
import { ENEMY_KINDS, isRanged } from '../src/core/enemies.js';
import { checkTrials } from '../src/core/save.js';
import { N } from '../src/core/constants.js';

const DEPTHS = Array.from({ length: MAX_DEPTH - 1 }, (_, i) => i + 1);

test('room tasks come with the seed: 2-4 a depth in ordinary rooms, never two gated rooms in a row, at most one in a branch', () => {
  let tasks = 0, depths = 0, branch = 0;
  const kinds = new Map();
  for (let seed = 0; seed < 30; seed++) {
    const L = makeLayouts(seed), again = makeLayouts(seed);
    for (const d of [0, MAX_DEPTH]) assert.equal(L(d).tasks.length, 0);
    for (const d of DEPTHS) {
      const l = L(d), list = l.tasks, [, hi] = taskCount(d);
      depths++; tasks += list.length;
      assert.deepEqual(list, again(d).tasks, `${seed}/${d}: the same plan`);
      assert.ok(list.length <= hi, `${seed}/${d}: ${list.length} tasks`);
      assert.ok(list.filter(t => t.role === 'branch').length <= 1, `${seed}/${d}: two in branches`);
      const gated = k => l.guardians.has(k) || l.trialCells.has(k) || l.taskCells.has(k);
      for (const t of list) {
        kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
        const T = TRIALS[t.kind];
        assert.equal(T.family, 'task');
        assert.ok(d >= T.depths[0] && d <= T.depths[1], `${seed}/${d}: ${t.kind}`);
        assert.ok(!l.guardians.has(t.key) && !l.hordes.has(t.key) && !l.trialCells.has(t.key) && !l.spanCells?.has(t.key) && t.key !== l.up && t.key !== l.down,
          `${seed}/${d}: ${t.kind} in ${t.key}`);
        assert.equal(step(t.from, t.fromDir), t.key);
        if (t.role === 'branch') {
          branch++;
          assert.ok(!T.routeOnly && t.exit === null && !l.route.includes(t.key) && l.sitePlans.get(t.key)?.length, `${seed}/${d}: a vault without its site`);
        } else {
          const i = l.route.indexOf(t.key);
          assert.ok(i >= 2 && i <= l.route.length - 2, `${seed}/${d}: at ${i} of ${l.route.length}`);
          assert.equal(l.gateFaces.get(faceKey(t.key, t.exit)), t.gate);
          assert.equal(t.gate, `trial:${t.key}`);
          assert.ok(!gated(l.route[i - 1]) && !gated(l.route[i + 1]), `${seed}/${d}: ${t.key} beside a gated room`);
        }
      }
    }
  }
  assert.ok(tasks / depths > 2 && tasks / depths < 3.6, `${(tasks / depths).toFixed(2)} a depth`);
  assert.ok(branch > 10, `${branch} in branches`);
  for (const k of TASK_KINDS) assert.ok(kinds.get(k) > 10, `${k}: ${kinds.get(k) ?? 0}`);
});

test('a forced task kind (?trial=) fills the depths with it, and no trial rooms', () => {
  const L = makeLayouts(3, worldThemes(3), { trial: 'shards' });
  let n = 0;
  for (const d of DEPTHS) { assert.equal(L(d).trials.length, 0); for (const t of L(d).tasks) { assert.equal(t.kind, 'shards'); n++; } }
  assert.ok(n > 30, `${n}`);
});

test('the rules: fading flames, braziers lit, the keybearer, the circle, progress kept', () => {
  // a flame lit at 2.0 s (bit 21) burning 5 s goes out at 7 s
  assert.ok(litNow(21, 6.9, 5) && !litNow(21, 7.1, 5) && !litNow(0, 1, 5));
  const m = { kind: 'fading', burn: 5 }, p = { id: 'lantern0' };
  assert.ok(lanternLit(m, { phase: 'running', t: 3, bits: { lantern0: 1 } }, p));
  assert.ok(!lanternLit(m, { phase: 'running', t: 6, bits: { lantern0: 1 } }, p));
  assert.ok(lanternLit(m, { phase: 'resolved', t: 0, bits: {} }, p));
  assert.ok(lanternLit({ kind: 'lanterns' }, { phase: 'idle', t: 0, bits: { lantern0: 1 } }, p));
  // the burn: a slow player's round, within its bounds
  assert.equal(fitBurn(0, 3), FADING.least);
  assert.equal(fitBurn(100, 4), FADING.most);
  assert.ok(fitBurn(10, 3) >= 10 + 2);
  assert.equal(holdTime(2), 20); assert.equal(holdTime(19), 40);
  assert.deepEqual(bitsOf(0b1011), [0, 1, 3]);
  assert.equal(taskMark('1,-2,3'), 'task:1,-2,3');
  // a task's progress is kept with the run (bits up to 1023)
  assert.deepEqual(checkTrials([['task:a', 31], ['task:b', 2000], ['x', 3]]), [['task:a', 31], ['x', 3]]);
  // the keybearer: one of the depth's kinds that fights up close, golden and stronger
  for (const d of DEPTHS) {
    const type = pickBearer(d, 1234 + d);
    assert.ok(type && ENEMY_KINDS[type] && !isRanged(ENEMY_KINDS[type]) && !ENEMY_KINDS[type].dwells, `${d}: ${type}`);
    const k = keybearerKind(type);
    assert.equal(k.hp, Math.round(ENEMY_KINDS[type].hp * BEARER.hp));
    assert.ok(k.bounty && k.keybearer);
  }
});

// every task of a kind in a few forced worlds, built
function* built(kind, seeds = [0, 1]) {
  for (const seed of seeds) {
    const w = worldOf(seed, { trial: kind });
    for (const d of DEPTHS) for (const t of w.layout(d).tasks) yield { seed, d, t, m: w.cube(t.key).map };
  }
}

test('every kind is built as planned in most rooms: its things apart, off the floors of the way, reached both ways', () => {
  for (const kind of TASK_KINDS) {
    let n = 0, own = 0;
    for (const { seed, d, t, m } of built(kind)) {
      const tr = m.trial;
      n++;
      assert.ok(tr?.task && tr.key === t.key && tr.gate === t.gate && tr.planned === kind, `${seed}/${d}: ${kind} not built`);
      if (tr.kind !== kind) { assert.equal(tr.kind, 'hidden', `${seed}/${d}: fell back to ${tr.kind}`); continue; }
      own++;
      const things = [...tr.parts.filter(p => p.f != null), ...(tr.wards || []), ...tr.bearer ? [tr.bearer] : []];
      if (kind !== 'clear') assert.ok(things.length >= 1, `${seed}/${d}: nothing placed`);
      for (const q of things) {
        const f = m.floors[q.f];
        assert.equal(m.safe[f.id], 1, `${seed}/${d}: ${kind} on a floor that does not lead on`);
        assert.ok(!f.fluid && Math.floor(q.x) === f.x && Math.floor(q.z) === f.z, `${seed}/${d}: ${kind} not on its floor`);
        assert.ok(m.portals.every(p => Math.max(Math.abs(p.x - f.x), Math.abs(p.z - f.z)) >= 1), `${seed}/${d}: ${kind} on a portal's pad`);
      }
      const P = PLACE[kind];
      if (P.apart) for (const a of things) for (const b of things) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 0.6 >= P.apart - 0.01,
        `${seed}/${d}: two ${kind} ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} apart`);
      if (kind === 'fading') assert.ok(tr.burn >= FADING.least && tr.burn <= FADING.most && tr.burn >= tr.check.tour, `${seed}/${d}: burns ${tr.burn} s for a round of ${tr.check.tour} s`);
      if (kind === 'hold') {
        assert.ok(tr.mouths.length === 2 && tr.mouths.every(o => Math.hypot(o.x - tr.ring.x, o.z - tr.ring.z) >= 6), `${seed}/${d}: the arches`);
        assert.ok(tr.ring.cells.length >= 5 && tr.ring.cells.every(id => !m.floors[id].fluid), `${seed}/${d}: the circle`);
        assert.ok(tr.mouths.every(o => Math.min(Math.floor(o.x), Math.floor(o.z), N - 1 - Math.floor(o.x), N - 1 - Math.floor(o.z)) <= 2), `${seed}/${d}: an arch off the edge`);
      }
    }
    assert.ok(n > 10, `${kind}: ${n}`);
    assert.ok(own / n >= 0.75, `${kind}: built as itself ${own} of ${n}`);
  }
});
