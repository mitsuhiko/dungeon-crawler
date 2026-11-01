// The cut cells of whole worlds (tests/sweep.js; docs/world.md "Angled cliffs"): a cut never takes
// what a way needs (its cell's middle, a linked side's middle, what the generator pinned), its part
// carries on its donor's ground, and two cuts meet on the side they share.
import assert from 'node:assert/strict';
import { N, LH, DIRS, OPP } from '../../src/core/constants.js';
import { partAt } from '../../src/core/surfaces.js';
import { cutPoints } from '../../src/core/cuts.js';
import { cubesOf } from './cubes.js';

const MID = [[1, .5], [0, .5], [.5, 1], [.5, 0]];

export default [{
  name: 'cut cells: the middle and linked sides kept, nothing pinned cut, the part on its donor\'s ground (or nothing, over a void or a gap), cuts meeting on their sides',
  run(w) {
    let cut = 0, cubes = 0, met = 0, empty = 0;
    for (const { k, m } of cubesOf(w)) {
      if (!m.floors) continue;
      let here = 0;
      for (const f of m.floors) if (f.cut) {
        here++;
        const where = `${k} (${f.x}, ${f.z})`, { part } = f.cut;
        assert.equal(partAt(f, 0.5, 0.5), f, `${where}: its middle cut off`);
        for (let d = 0; d < 4; d++) if (f.link[d]) assert.equal(partAt(f, ...MID[d]), f, `${where}: a linked side's middle cut off`);
        assert.ok(!f.prot && f.ramp !== true && !f.landing && !f.site && !f.spot && (!f.surface || m.arena?.type === 'tower') && !f.underStair, `${where}: a pinned floor cut`);   // (Foggery's tower is cut, built as it is)
        assert.ok(f.x && f.z && f.x < N - 1 && f.z < N - 1 && !m.pieces[f.c].length, `${where}: on the outer ring, or under a structure`);
        assert.ok(f === m.cols[f.c][m.cols[f.c].length - 1], `${where}: not the top floor`);
        assert.ok(Math.min(...part.cs) >= f.bottom * LH, `${where}: the part under the floor's bottom`);
        // an empty part: on a dry floor's edge over the void or a gap under it
        if (part.empty) {
          empty++;
          assert.ok(!f.fluid && DIRS.some(([dx, dz]) => {
            const x = f.x + dx, z = f.z + dz, col = x >= 0 && z >= 0 && x < N && z < N ? m.cols[z * N + x] : null;
            return col && (!col.length || col[col.length - 1].top < f.bottom);
          }), `${where}: an empty part, but no void nor gap beside it`);
        }
        // its donor's corners it shares: the part's there (as smoothed: a little apart at most)
        const g = part.donor;
        if (g) for (let c = 0; c < 4; c++) {
          const X = f.x + (c & 1), Z = f.z + (c >> 1), gx = X - g.x, gz = Z - g.z;
          if (gx < 0 || gx > 1 || gz < 0 || gz > 1) continue;
          assert.ok(Math.abs(part.cs[c] - g.cs[gx + 2 * gz]) < 0.3, `${where}: the part off its donor's ground at (${X}, ${Z})`);
        }
        // where its line meets a side, a cut across it meets it in the same place
        for (let d = 0; d < 4; d++) for (const t of cutPoints(f, d)) {
          const x = f.x + DIRS[d][0], z = f.z + DIRS[d][1];
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const col = m.cols[z * N + x], h = col[col.length - 1], ts = h ? cutPoints(h, OPP[d]) : [];
          if (!ts.length) continue;
          met++;
          assert.ok(ts.some(u => Math.abs(u - t) < 1e-6), `${where}: its cut and (${x}, ${z})'s meet the side apart`);
        }
      }
      if (here) cubes++;
      cut += here;
    }
    assert.ok(cut > 300 && cubes > 60 && met > 50 && empty > 30, `cuts: ${cut} in ${cubes} cubes, ${met} meeting, ${empty} over nothing`);
  },
}];
