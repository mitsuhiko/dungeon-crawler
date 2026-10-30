import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assets } from './paths.js';
import { propCatalog } from '../tools/prop-metadata.mjs';
import { PROP_METADATA, PROP_FILES } from '../src/core/propmetadata.js';
import { props, catalogProp, signatureProp } from '../src/core/propcatalog.js';
import { placeProps } from '../src/render/propplace.js';
import { restY } from '../src/render/surface.js';
import { themeById } from '../src/themes/depth.js';
import { N, LH, WATER, LAVA, ACID, FLUID_NAME, DIRS } from '../src/core/constants.js';


function terrain(seed) {
  const floors = Array.from({ length: N * N }, (_, c) => ({ c, id: c, x: c % N, z: Math.floor(c / N),
    top: 8, bottom: 0, layer: 0, cs: [4, 4, 4, 4], link: [null, null, null, null], fluid: 0, surf: 0 }));
  return { seed, floors, cols: floors.map(f => [f]), pieces: floors.map(() => []), moves: [], runs: [], portals: [],
    siteReservations: [], sitePlacements: [] };
}

test('checked-in metadata matches all 906 exported models, including the 240 clutter roots, the 429 theme roots, the chest, the town (its houses, trees, clutter, homes and wall) and the 42 trial pieces', () => {
  const { metadata, files } = propCatalog(assets);
  assert.deepEqual(PROP_METADATA, metadata);
  assert.deepEqual(PROP_FILES, files);
  assert.equal(new Set(PROP_METADATA.map(p => p.name)).size, 906);
  assert.equal(PROP_METADATA.filter(p => p.set === 'town').length, 61);
  assert.equal(PROP_METADATA.filter(p => p.cube_crawler_town_clutter).length, 23);
  // the garlands' segments hang from their cord (attach 'line')
  assert.deepEqual(PROP_METADATA.filter(p => p.set === 'town' && p.attach === 'line').map(p => p.name), ['town_garland_a', 'town_garland_b', 'town_garland_c']);
  // the wall round the town (blender/town_walls.py)
  assert.equal(PROP_METADATA.filter(p => p.cube_crawler_town_wall).length, 8);
  // the homes and their yards (blender/town_homes.py)
  assert.equal(PROP_METADATA.filter(p => 'cube_crawler_town_home' in p).length, 20);
  // the trials' parts (blender/trials.py): one library, never scattered
  assert.deepEqual(PROP_FILES.trial, ['trials.glb']);
  assert.equal(PROP_METADATA.filter(p => p.set === 'trial' && p.attach === 'trial').length, 42);
  // a set's files: one per library it is in (props, clutter, themes), each holding only that set
  assert.deepEqual(PROP_FILES.abyss, ['props/abyss.glb', 'clutter/abyss.glb', 'themes/abyss.glb']);
  assert.deepEqual(PROP_FILES.town, ['town.glb', 'town_trees.glb', 'town_clutter.glb', 'town_homes.glb', 'town_walls.glb']);
  for (const [set, list] of Object.entries(PROP_FILES)) for (const f of list) assert.ok(f.startsWith('town') || f.startsWith('items/') || f === 'trials.glb' || f.endsWith(`/${set}.glb`), f);
  assert.ok(PROP_METADATA.some(p => p.name === 'treasure_chest' && p.blocking && p.clips === 'Open,Close'));
  const clutter = PROP_METADATA.filter(p => p.cube_crawler_clutter);
  assert.equal(clutter.length, 240);
  assert.equal(new Set(clutter.map(p => p.set)).size, 13);
  for (const mode of ['ground', 'wall', 'ceiling', 'lip', 'water']) assert.ok(clutter.some(p => p.attach === mode));
  const themes = PROP_METADATA.filter(p => p.cube_crawler_themes);
  assert.equal(themes.length, 429);
  // the thirteen new sets, landmarks for the eleven classic ones, and Mansk's museum
  assert.equal(new Set(themes.map(p => p.set)).size, 25);
  for (const mode of ['ground', 'wall', 'ceiling', 'lip', 'water', 'line']) assert.ok(themes.some(p => p.attach === mode));
  // landmarks, vignettes and string segments are never scattered
  for (const p of themes.filter(p => p.landmark || p.vignette || p.attach === 'line')) assert.ok(p.attach === 'line' || signatureProp(p), p.name);
});

test('catalog registration is idempotent, not an additional scatter weight on a reload, and keeps the order', () => {
  const p = props.byName.get('any_cairn_a');
  const n = props.sets.get('any/ground').length;
  const at = props.sets.get('any/ground').indexOf(p);
  catalogProp({ ...p }); catalogProp(p);
  assert.equal(props.sets.get('any/ground').length, n);
  assert.equal(props.sets.get('any/ground').indexOf(p), at, 'a replaced entry keeps its place');
});

test('water and shoreline clutter respects fluid type, surface height and neighbouring banks', () => {
  const seen = new Set();
  for (let seed = 0; seed < 25; seed++) for (const [theme, fluid] of [['meadow', WATER], ['frozen', WATER], ['swamp', ACID], ['volcanic', LAVA]]) {
    const m = terrain(seed);
    for (const f of m.floors) if (f.x >= 5 && f.x <= 10 && f.z >= 5 && f.z <= 10) {
      f.fluid = fluid; f.surf = 7; f.top = 5; f.cs = [2.5, 2.5, 2.5, 2.5];
    }
    const placed = placeProps(m, themeById(theme));
    assert.deepEqual(placed, placeProps(m, themeById(theme)));
    for (const q of placed.out) {
      const p = props.byName.get(q.name), c = Math.floor(q.z) * N + Math.floor(q.x), f = m.floors[c];
      assert.ok(!signatureProp(p), 'signature assets are recipe-only');
      if (p.attach === 'water') {
        seen.add(p.fluid); assert.equal(f.fluid, fluid); assert.equal(p.fluid, FLUID_NAME[fluid]);
        assert.equal(q.y, restY(f.surf * LH));   // (on its surface as drawn)
      }
      if (p.shore) assert.ok(DIRS.some(([dx, dz]) => m.cols[(f.z + dz) * N + f.x + dx]?.some(g => g.fluid)));
      if (p.cover) { assert.equal(f.fluid, 0); assert.ok(q.normal); }
    }
  }
  assert.deepEqual([...seen].sort(), ['acid', 'lava', 'water']);
});

test('cover dresses routes/slopes without blockers; focal sites remain free of ambient clutter', () => {
  let cover = 0;
  for (let seed = 0; seed < 20; seed++) {
    const m = terrain(seed);
    m.moves = m.floors.map(f => ({ from: f, to: f, cells: [] }));
    const reserved = m.floors[8 * N + 8];
    m.siteReservations = [{ c: reserved.c, layer: 0 }];
    m.sitePlacements = [{ name: 'treasure_chest', x: 8.5, y: 4, z: 8.5, yaw: 0, s: 0.8, site: 'test' }];
    for (const f of m.floors) f.cs = [4, 4.4, 4, 4.4];
    const { out, blockers } = placeProps(m, themeById('roots'));
    assert.equal(out.filter(p => Math.floor(p.x) === 8 && Math.floor(p.z) === 8).length, 1);
    assert.ok(blockers.every(list => !list.length));
    for (const q of out) if (props.byName.get(q.name)?.cover) {
      cover++; assert.ok(q.normal[0] < 0); assert.equal(q.normal[1], 1);
    }
  }
  assert.ok(cover > 0);
});

test('cliff-lip props have vertical clearance and nothing hangs from slab undersides', () => {
  let lips = 0, ceilings = 0;
  for (let seed = 0; seed < 30; seed++) {
    const m = terrain(seed);
    for (const f of m.floors) if (f.x < 8) { f.top = 20; f.cs = [10, 10, 10, 10]; }
    // Add a genuinely floating slab with space for props below it.
    for (let c = 0; c < N * N; c++) if (c % N >= 10) {
      const ground = m.floors[c];
      const f = { ...ground, id: m.floors.length, layer: 1, bottom: 18, top: 20, cs: [10, 10, 10, 10], merged: false };
      m.cols[c].push(f); m.floors.push(f);
    }
    for (const q of placeProps(m, themeById('roots')).out) {
      const p = props.byName.get(q.name);
      if (p.attach === 'lip') {
        lips++; assert.ok(q.x === 8 || q.x === 10); assert.equal(q.y, 10);
        assert.ok(q.y - p.drop * q.s > 4.2);
        assert.ok(Math.abs(q.yaw - (q.x === 8 ? -Math.PI / 2 : Math.PI / 2)) < 1e-8);
      }
      if (p.attach === 'ceiling') ceilings++;
    }
  }
  assert.ok(lips > 0); assert.equal(ceilings, 0);
});
