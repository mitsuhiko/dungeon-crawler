// Cut cells (cubegen/cuts.js, core/cuts.js): a cliff that steps round cells in a staircase runs
// at an angle through them. The geometry, the fit on a staircase, and walking at a cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH, CHAR_R, CHAR_H, DIRS, WATER } from '../src/core/constants.js';
import { wading } from '../src/physics/fluid.js';
import { flatMap } from './fixtures.js';
import { player } from '../src/game/state.js';
import { movePlayer } from '../src/physics/move.js';
import { groundAt } from '../src/physics/collide.js';
import { floorY, partAt } from '../src/core/surfaces.js';
import { topTriangles, cutLine, clipPoly } from '../src/core/cuts.js';
import { cutCliffs } from '../src/cubegen/cuts.js';
import { edgeKey } from '../src/core/util.js';
import { worldOf } from './worlds.js';

const DT = 1 / 60;
const area = t => Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][0] - t[0][0])) / 2;

test('a cut cell: its two sides cover it, each with its own heights, a wall between them', () => {
  const part = { cs: [0, 0, 0, 0], split: 0 };
  // the corner (1, 0) cut off along x - z = 0.5, the floor at 3, its part at 0
  const n = [Math.SQRT1_2, -Math.SQRT1_2], f = { x: 0, z: 0, cs: [3, 3, 3, 3], split: 1, cut: { n, c: 0.5 * Math.SQRT1_2, a: [0.5, 0], b: [1, 0.5], part } };
  assert.equal(floorY(f, 0.5, 0.5), 3);
  assert.equal(floorY(f, 0.9, 0.1), 0);
  assert.equal(partAt(f, 0.9, 0.1), part);
  const own = topTriangles(f, 0), cut = topTriangles(f, 1);
  const a0 = own.reduce((s, t) => s + area(t), 0), a1 = cut.reduce((s, t) => s + area(t), 0);
  assert.ok(Math.abs(a0 - 7 / 8) < 1e-9 && Math.abs(a1 - 1 / 8) < 1e-9, `the sides: ${a0}, ${a1}`);
  assert.ok(own.every(t => t.every(p => p[1] === 3)) && cut.every(t => t.every(p => p[1] === 0)));
  const line = cutLine(f);
  assert.ok(line.length >= 1 && line.every(s => s.own.every(y => y === 3) && s.part.every(y => y === 0)));
  assert.deepEqual(clipPoly([[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0], 0.25, 1).length, 4);
});

// ground at 6 levels over the cells x <= z (a staircase down the diagonal), 0 levels elsewhere;
// cliff fences on all its risers (cubegen/fences.js); cut (cubegen/cuts.js) in style `style`
function staircase(style = 'octo') {
  const m = flatMap();
  for (const f of m.floors) { const l = f.x <= f.z ? 6 : 0; Object.assign(f, { top: l, bottom: -2, cs: Array(4).fill(l * LH) }); }
  for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
  const fenceList = [];
  for (const f of m.floors) if (f.top) for (let d = 0; d < 4; d++) {
    const g = f.link[d] === null && m.floors[(f.z + DIRS[d][1]) * N + f.x + DIRS[d][0]];
    if (!g || f.x + DIRS[d][0] < 0 || f.x + DIRS[d][0] >= N || f.z + DIRS[d][1] < 0 || f.z + DIRS[d][1] >= N) continue;
    const e = { pts: [], ymin: 3, ymax: 3, layer: 0, show: true, cliff: f.id, key: edgeKey(f.x, f.z, g.x, g.z) };
    fenceList.push(e);
    m.fences.set(e.key, [e]);
  }
  const ctx = { ...m, fenceList, seed: 1, stats: {}, ladders: [], runs: [], moves: [], spec: { cuts: { [style]: 1 } },
    border: f => !f.x || !f.z || f.x === N - 1 || f.z === N - 1 };
  cutCliffs(ctx, () => style);
  Object.assign(m, { fenceList: ctx.fenceList, lineFences: ctx.lineFences });
  return { m, ctx };
}

test('a 45° staircase is cut along one straight line through the middles of its risers', () => {
  const { m, ctx } = staircase();
  const cut = m.floors.filter(f => f.cut);
  assert.ok(ctx.stats.cuts > 2 * (N - 6), 'cut all along: ' + ctx.stats.cuts);
  for (const f of cut) {
    // the line x - z = 0.5 (through (1, 0.5) of the cell (x, x) and so on), whichever cell
    for (const p of [f.cut.a, f.cut.b]) assert.ok(Math.abs((f.x + p[0]) - (f.z + p[1]) - 0.5) < 1e-9, `on the line: ${f.x},${f.z}`);
    assert.ok(Math.abs(Math.abs(f.cut.n[0]) - Math.SQRT1_2) < 1e-9, '45°');
    // the high cells lose their corner to the low ground, the low ones get the high ground's
    const hi = f.top === 6, part = f.cut.part;
    assert.ok(hi ? Math.max(...part.cs) <= 0.001 : Math.min(...part.cs) >= 6 * LH - 0.001, `the part's ground: ${part.cs}`);
    assert.equal(floorY(f, 0.5, 0.5), f.top * LH, 'its middle its own');
  }
  // the fences moved onto the line
  assert.ok(m.fenceList.some(e => e.line && Math.abs(Math.abs(e.line[1][0] - e.line[0][0]) - Math.abs(e.line[1][1] - e.line[0][1])) < 1e-6),
    'a fence along the 45° line');
});

test('a gentler staircase (two along, one across: 26.6°, the nearest to 22.5° a grid keeps straight) is cut along its slope in the sixteen style, never in the octo one', () => {
  const angles = style => {
    const m = flatMap();
    for (const f of m.floors) { const l = f.x <= 2 * f.z - 4 ? 6 : 0; Object.assign(f, { top: l, bottom: -2, cs: Array(4).fill(l * LH) }); }
    for (const f of m.floors) f.link = f.link.map(g => g && g.top === f.top ? g : null);
    const ctx = { ...m, fenceList: [], seed: 1, stats: {}, ladders: [], runs: [], moves: [], spec: {}, border: f => !f.x || !f.z || f.x === N - 1 || f.z === N - 1 };
    cutCliffs(ctx, () => style);
    return new Set(m.floors.filter(f => f.cut).map(f => Math.round(Math.atan2(Math.abs(f.cut.n[0]), Math.abs(f.cut.n[1])) * 180 / Math.PI / 22.5)));
  };
  assert.ok(angles('sixteen').has(1) || angles('sixteen').has(3), 'a 26.6° line: ' + [...angles('sixteen')]);
  assert.ok(![...angles('octo')].some(k => k % 2), 'only 45° ones: ' + [...angles('octo')]);
});

function stand(m, x, z) {
  const gr = groundAt(x, z, 100, 0);
  Object.assign(player, { x, z, y: gr.h, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, fluid: 0, wade: 0,
    support: gr.s, stun: 0, coyote: 0, jumpBuf: 0, r: CHAR_R, h: CHAR_H, climb: null, gust: null, pull: null, effects: {}, brink: null,
    landImpact: 0, landCount: 0, jumpCount: 0 });
  return gr;
}
const push = (dx, dz, s) => { for (let t = 0; t < s; t += DT) movePlayer(DT, dx, dz, true, false, true); };

test('walking at a cut: up against the higher side it is a wall, its fence holds along the line', () => {
  const { m } = staircase();
  // the cell (8, 8) is high (6), its corner towards (9, 8) cut down: below the line, in the part
  const f = m.floors[8 * N + 8];
  assert.ok(f.cut && f.top === 6);
  const gr = stand(m, 8.9, 8.1);
  assert.equal(gr.s, f.cut.part, 'stands on the part');
  assert.ok(Math.abs(gr.h) < 0.01, 'down at the low ground: ' + gr.h);
  push(-1, 1, 1);   // towards the high side, square to the line
  assert.ok(player.y < 0.5 && (player.x - player.z) > 0.5 - 0.01, 'not up the wall: ' + [player.x, player.y, player.z]);
  // on the high side, walking at the line: the fence there holds
  const at = stand(m, 8.3, 8.6);
  assert.equal(at.s, f);
  push(1, -1, 1);
  assert.ok(player.grounded && Math.abs(player.y - 6 * LH) < 0.01 && player.x - player.z < 0.5 - 0.07 - CHAR_R + 0.05, 'held by the fence: ' + [player.x, player.y, player.z]);
  // without fences, it walks off and drops down onto the low ground
  m.lineFences = null;
  stand(m, 8.3, 8.6);
  push(1, -1, 1.5);
  assert.ok(player.y < 0.5, 'dropped down: ' + player.y);
});

test('a generated room: its staircase cliffs are cut, and every cut keeps its cell\'s middle', () => {
  const m = worldOf(461656543).cube('0,-8,2').map;
  const cut = m.floors.filter(f => f.cut);
  assert.ok(cut.length >= 15, 'cut: ' + cut.length);
  for (const f of cut) {
    assert.equal(partAt(f, 0.5, 0.5), f);
    assert.ok(f.cut.part.donor && f.cut.part.donor !== f);
  }
});

test('a shore at 45°: the bank takes a corner of the water, the water one of the bank, and it is waded in', () => {
  const m = flatMap();
  // water (surface 2 levels, its bed at 0) over the cells x <= z, a bank at its level elsewhere
  for (const f of m.floors) Object.assign(f, f.x <= f.z ? { top: 0, fluid: WATER, surf: 2, cs: [0, 0, 0, 0] } : { top: 2, cs: Array(4).fill(2 * LH) }, { bottom: -2 });
  for (const f of m.floors) f.link = f.link.map(g => g && !!g.fluid === !!f.fluid ? g : null);
  const ctx = { ...m, fenceList: [], seed: 1, stats: {}, ladders: [], runs: [], moves: [], spec: {}, border: f => !f.x || !f.z || f.x === N - 1 || f.z === N - 1 };
  cutCliffs(ctx, () => 'octo');
  const wet = m.floors.filter(f => f.cut && !f.fluid), dry = m.floors.filter(f => f.cut && f.fluid);
  assert.ok(wet.length > 10 && dry.length > 10, `cut: ${wet.length} banks, ${dry.length} waters`);
  for (const f of wet) assert.ok(f.cut.part.fluid === WATER && f.cut.part.surf === 2 && Math.max(...f.cut.part.cs) <= 0.001, 'a bank\'s part is the water');
  for (const f of dry) assert.ok(!f.cut.part.fluid && Math.min(...f.cut.part.cs) >= 2 * LH - 0.001, 'a water\'s part is the bank');
  // in a bank's cell, on the water's side of its line: the water's bed underfoot, in the water
  const f = m.floors[8 * N + 9], gr = groundAt(9.1, 8.9, 100, 0);
  assert.ok(f.cut && gr.s === f.cut.part && gr.s.fluid === WATER, 'the water is underfoot');
  assert.ok(wading(gr, gr.h) > 0.5, 'deep enough to wade: ' + wading(gr, gr.h));
});
