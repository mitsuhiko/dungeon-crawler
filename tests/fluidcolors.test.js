// The fluids' colours (themes/fluids.js): made from the world's seed within each theme's family,
// and which body of fluid takes which (cubegen/fluidbodies.js): what runs on from cube to cube
// keeps its colour. And fires under a trial's water go out (core/douse.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, WATER, LAVA, ACID } from '../src/core/constants.js';
import { parse } from '../src/world/coords.js';
import { worldThemes, MAX_DEPTH } from '../src/themes/depth.js';
import { worldPalettes, palRow, rowDepth, rowSlot, rowFluid, linearToOklch, familyOf, ANCHORS, PAL_ROWS, PAL_SLOTS, HUE, HUE_GAP } from '../src/themes/fluids.js';
import { stampFluidBodies } from '../src/cubegen/fluidbodies.js';
import { doused, douses } from '../src/core/douse.js';

const HUES = { [WATER]: [188, 270], [ACID]: [118, 146], [LAVA]: [25, 72] };

test('palettes: from the seed alone, in gamut, each fluid in its hues, the pattern lighter than the body', () => {
  for (const seed of [1, 2, 3, 99]) {
    const themes = worldThemes(seed), rows = worldPalettes(seed, themes);
    assert.equal(rows.length, PAL_ROWS);
    assert.deepEqual(worldPalettes(seed, themes).map(p => p.hex), rows.map(p => p.hex));
    rows.forEach((p, row) => {
      const fluid = rowFluid(row);
      assert.equal(p.fluid, fluid);
      for (const c of ['body', 'dark', 'line', 'foam', 'emissive', 'fallBase', 'fallLine', 'fallLight', 'cap']) {
        assert.ok(p[c].every(v => v >= 0 && v <= 1), `${seed} row ${row} ${c} in gamut`);
        assert.match(p.hex[c], /^#[0-9a-f]{6}$/);
      }
      const [L, C, h] = linearToOklch(p.body), [lo, hi] = HUES[fluid];
      if (C > 0.02) assert.ok(h >= lo - 1 && h <= hi + 1, `${seed} row ${row}: hue ${h.toFixed(0)} of ${p.hex.body}`);
      assert.ok(linearToOklch(p.line)[0] > L + (fluid === WATER ? 0.05 : 0.01), `${seed} row ${row}: its lines show`);   // (bright acid: paler)
      if (fluid !== LAVA) assert.ok(linearToOklch(p.dark)[0] < L, `${seed} row ${row}: its swirls are darker`);
      else assert.ok(linearToOklch(p.dark)[0] < L * 0.5, `${seed} row ${row}: lava's crust is dark`);
      assert.ok(p.opacity > 0.6 && p.opacity <= 1);
    });
  }
});

test('water and acid never look alike: hues far apart, acid always vivid, water\'s lines never green', () => {
  assert.ok(HUE_GAP >= 40);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const rows = worldPalettes(seed, worldThemes(seed));
    rows.forEach((p, row) => {
      const [L, C, h] = linearToOklch(p.body);
      if (rowFluid(row) === ACID) {
        assert.ok(C > 0.15 && L > 0.65, `${seed} row ${row}: acid ${p.hex.body} is vivid`);
        assert.ok(h <= HUE[ACID][1] + 1, `${seed} row ${row}: acid hue ${h.toFixed(0)}`);
      }
      if (rowFluid(row) === WATER) for (const c of ['body', 'dark', 'line', 'fallBase', 'fallLine', 'fallLight']) {
        const [, cc, hh] = linearToOklch(p[c]);
        if (cc > 0.025) assert.ok(hh >= 170, `${seed} row ${row}: water's ${c} ${p.hex[c]} (hue ${hh.toFixed(0)}) is not green`);
      }
    });
  }
});

test('palettes: the running fluid is the same through a stretch of one theme, the still pools vary', () => {
  const seed = 5, themes = worldThemes(seed), rows = worldPalettes(seed, themes);
  const stretch = d => themes.filter(s => s.at <= d).at(-1).at;
  for (const fluid of [WATER, LAVA, ACID]) for (let d = 1; d <= MAX_DEPTH; d++) {
    const same = stretch(d) === stretch(d - 1);
    assert.equal(rows[palRow(d, fluid, 0)].hex.body === rows[palRow(d - 1, fluid, 0)].hex.body, same, `depth ${d} fluid ${fluid}`);
  }
  const water = new Set(Array.from({ length: PAL_SLOTS }, (_, s) => rows[palRow(9, WATER, s)].hex.body));
  assert.ok(water.size >= 4, 'a depth has several waters');
  // (no world: the look the game always had)
  const classic = worldPalettes(null);
  assert.equal(classic[palRow(3, WATER, 2)].hex.body, '#2c9ad8');
  assert.equal(classic[palRow(18, LAVA, 0)].hex.body, '#ff6a00');
});

test('every theme family names anchors that exist', () => {
  for (const s of worldThemes(7)) for (const f of [WATER, LAVA, ACID])
    for (const a of familyOf(s.theme, f).anchors) assert.ok(ANCHORS[f][a], `${s.theme.props}: ${a}`);
});

// a flat map with fluid cells: [x, z, fluid, surf, layer?]
function pools(cells, falls = [], key = '0,-3,0') {
  const cols = Array.from({ length: N * N }, () => []), floors = [];
  for (const [x, z, fluid, surf, layer = 0] of cells) {
    const f = { c: z * N + x, x, z, layer, fluid, surf, top: surf - 2, bottom: surf - 3 };
    f.id = floors.length; floors.push(f); cols[f.c].push(f);
  }
  return { key, depth: -parse(key)[1], floors, cols, falls };
}
const square = (x0, z0, n, fluid, surf, layer) => Array.from({ length: n * n }, (_, i) => [x0 + i % n, z0 + ((i / n) | 0), fluid, surf, layer]);

test('a cube\'s fluids: one colour each, running on at the edge, from above, or one of the still ones', () => {
  // pools a stream joins, one apart, acid beside water: all its water one colour, a still one
  const m = stampFluidBodies(pools([...square(3, 3, 2, WATER, 9, 1), ...square(3, 6, 2, WATER, 4), ...square(10, 10, 2, WATER, 4),
    ...square(10, 3, 2, ACID, 4), ...square(12, 3, 2, WATER, 4)], [{ c: 5 * N + 3, d: 1, top: 9, bot: 4, type: WATER, layer: 0 }]));
  const at = (x, z) => m.cols[z * N + x][0].pal;
  assert.equal(new Set(m.floors.filter(f => f.fluid === WATER).map(f => f.pal)).size, 1);
  assert.equal(rowFluid(at(10, 3)), ACID);
  assert.equal(rowFluid(at(12, 3)), WATER);
  assert.ok(rowSlot(at(10, 10)) > 0 && rowDepth(at(10, 10)) === 3, 'still water: one of its depth\'s other slots');
  assert.deepEqual(m.falls[0].pal, [at(3, 3), at(3, 3)]);
  assert.deepEqual(m.fluidRows, { [WATER]: at(3, 3), [ACID]: at(10, 3) });
  // a fall from the depth above and no river: the colour it came in
  const a = stampFluidBodies(pools([...square(8, 8, 2, WATER, 4), ...square(3, 3, 2, WATER, 4)],
    [{ c: 8 * N + 8, d: 0, top: 40, bot: 4, type: WATER, layer: 0, in: true }]));
  assert.ok(a.floors.every(f => f.pal === palRow(2, WATER, 0)));
  assert.deepEqual(a.falls[0].pal, [palRow(2, WATER, 0), palRow(2, WATER, 0)]);
  // and a river at the cube's edge too: the depth's running water, the fall turning into it
  const r = stampFluidBodies(pools([...square(0, 7, 3, WATER, 2), ...square(8, 8, 2, WATER, 4)],
    [{ c: 8 * N + 8, d: 0, top: 40, bot: 4, type: WATER, layer: 0, in: true }]));
  assert.ok(r.floors.every(f => f.pal === palRow(3, WATER, 0)));
  assert.deepEqual(r.falls[0].pal, [palRow(2, WATER, 0), palRow(3, WATER, 0)]);
});

test('fires go out under water and acid, not under lava, once it stands over a quarter of the flame', () => {
  assert.equal(doused(1, 0.8, null, WATER), false);
  assert.equal(doused(1, 0.8, 1.1, WATER), false);
  assert.equal(doused(1, 0.8, 1.25, WATER), true);
  assert.equal(doused(1, 0.8, 3, ACID), true);
  assert.equal(doused(1, 0.8, 3, LAVA), false);
  assert.equal(doused(1, 0.8, 0.5, WATER), false);
  assert.equal(douses(0), false);
});

