// The fluids of whole worlds (tests/sweep.js): walled in, kept clear of their banks, one colour per
// fluid in a cube and the same across a face (themes/fluids.js, cubegen/fluidbodies.js), and no
// fire standing in water or acid (core/douse.js)
import assert from 'node:assert/strict';
import { N, DIRS, OPP, EDGE_CORNERS, LH, WATER, LAVA, ACID, MUD, drawnFluid } from '../../src/core/constants.js';
import { idx, inb } from '../../src/core/util.js';
import { step } from '../../src/world/coords.js';
import { worldThemes, themeOf } from '../../src/themes/depth.js';
import { worldPalettes, rowFluid, MUD_ROW } from '../../src/themes/fluids.js';
import { shoreIssues } from '../../src/render/shore.js';
import { placeProps } from '../../src/render/propplace.js';
import { props } from '../../src/core/propcatalog.js';
import { fallCells } from '../../src/core/falls.js';
import { douses } from '../../src/core/douse.js';
import { cubesOf } from './cubes.js';

// how far a fluid floor's surface stands above what is next to it on side d (0: walled in),
// with the heights the renderer uses (smoothed corners); falls spill on purpose
function standing(m, f, d) {
  const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
  if (!inb(x, z)) return 0;   // the face: the neighbour cube matches it
  const n = idx(x, z);
  if (m.falls.some(fl => fallCells(fl).some(c => c === f.c || c === n))) return 0;
  const [na, nb] = EDGE_CORNERS[OPP[d]], top = g => g.fluid ? g.surf : Math.min(g.cs[na], g.cs[nb]) / LH;
  const y = f.surf - 0.25, col = m.cols[n];
  if (col.some(g => g.bottom <= y && top(g) >= y)) return 0;
  const under = col.map(top).filter(t => t < f.surf);
  return f.surf - (under.length ? Math.max(...under) : -Infinity);
}

const FIRE = new Set(['brazier', 'torch_sconce', 'tiki_torch', 'copal_bowl', 'fire_shrine']);

export default [{
  name: 'no fluid stands in the air: every pool, river and stream is walled in',
  run(w) {
    const bad = [];
    for (const { k, m } of cubesOf(w)) for (const f of m.floors) if (f.fluid) for (let d = 0; d < 4; d++) {
      const h = standing(m, f, d);
      // corner smoothing may sag a bank by up to a level next to the water
      if (h > 1.25) bad.push(`${k} (${f.x},${f.z}) L${f.layer} side ${d}: ${h === Infinity ? 'over nothing' : h.toFixed(1) + ' levels'}`);
    }
    assert.deepEqual(bad, []);
  },
}, {
  name: 'banks keep out of the fluids beside them, and no column shows two fluid surfaces',
  run(w) {
    const issues = [];
    let cubes = 0;
    for (const { k, m } of cubesOf(w)) { cubes++; issues.push(...shoreIssues(m).map(l => `${k}: ${l}`)); }
    // (a stair's or ladder's pinned corner may win now and then: render/shore.js shoreIssues)
    assert.ok(issues.length <= Math.ceil(cubes / 500), `${issues.length} in ${cubes} cubes:\n${issues.join('\n')}`);
    assert.ok(!issues.some(l => l.includes('two fluids')), issues.join('\n'));
  },
}, {
  name: 'one colour per fluid in a cube, and whatever crosses a face keeps it on both sides',
  run(w, seed) {
    const bad = [], rows = worldPalettes(seed, w.layout.themes ?? worldThemes(seed));
    const body = row => rows[row].hex.body;
    let crossings = 0, fromAbove = 0;
    for (const { d: depth, k, m } of cubesOf(w)) {
      // one colour per kind of fluid in a cube, its falls landing in it too (a mud pool: the mud's,
      // cubegen/mudpools.js)
      for (const t of [WATER, LAVA, ACID, MUD]) {
        const rows = new Set([...m.floors.filter(f => f.fluid && drawnFluid(f) === t).map(f => f.pal), ...m.falls.filter(fl => fl.type === t).map(fl => fl.pal[1])]);
        if (rows.size > 1) bad.push(`${k}: ${rows.size} colours of fluid ${t}`);
      }
      for (const f of m.floors) {
        if (!f.fluid) continue;
        if (f.pal == null) { bad.push(`${k}: a fluid floor without colours`); continue; }
        if (f.look === MUD ? f.pal !== MUD_ROW : rowFluid(f.pal) !== f.fluid) bad.push(`${k} (${f.x},${f.z}): another fluid's colours`);
        const edge = [f.x === N - 1, f.x === 0, f.z === N - 1, f.z === 0];
        edge.forEach((on, d) => {
          if (!on) return;
          const nk = step(k, d);
          if (!w.layout(depth).exists.has(nk)) return;
          const n = w.cube(nk).map, x = (f.x + DIRS[d][0] + N) % N, z = (f.z + DIRS[d][1] + N) % N;
          const g = n.cols[z * N + x].find(h => h.fluid === f.fluid && h.surf === f.surf);
          if (g) crossings++;
          if (g && body(g.pal) !== body(f.pal)) bad.push(`${k} → ${nk} (${f.x},${f.z}): ${body(f.pal)} / ${body(g.pal)}`);
        });
      }
      // a fall from above starts in the colour of the pool it left
      for (const fl of m.falls.filter(fl => fl.in)) {
        const up = w.cube(step(k, 5)).map, out = up.falls.find(o => o.out && o.c === fl.c);
        if (out) fromAbove++;
        if (out && body(out.pal[0]) !== body(fl.pal[0])) bad.push(`${k}: the fall from above changes colour`);
      }
    }
    assert.deepEqual(bad, []);
    assert.ok(crossings > 100 && fromAbove > 3, `${crossings} crossings, ${fromAbove} falls from above checked`);
  },
}, {
  name: 'no fire stands in a pool, river or lake of water or acid in the ordinary cubes',
  run(w) {
    const bad = [];
    let fires = 0;
    for (const { k, m } of cubesOf(w)) {
      if (m.trialRoom) continue;   // (a trial's rising water: render/flames.js douses those)
      for (const q of placeProps(m, themeOf(m)).out) {
        const p = props.byName.get(q.name);
        if (!p || !FIRE.has(p.base)) continue;
        fires++;
        const x = Math.floor(q.x), z = Math.floor(q.z);
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const wet = m.cols[z * N + x].find(f => douses(f.fluid) && f.top * LH <= q.y + 0.01 && f.surf * LH > q.y + 0.05);
        if (wet) bad.push(`${k} ${q.name} at (${q.x.toFixed(1)}, ${q.y.toFixed(2)}, ${q.z.toFixed(1)})`);
      }
    }
    assert.ok(fires > 20, `${fires} fires checked`);
    assert.deepEqual(bad, []);
  },
}];
