import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, CHAR_R, CHAR_H, count16 } from '../src/core/constants.js';
import { PROP_METADATA } from '../src/core/propmetadata.js';
import { THEMES } from '../src/themes/index.js';
import { World } from '../src/world/world.js';
import { vignettesOf, turnBox, DRESSING } from '../src/cubegen/vignettes.js';
import { landmarksOf } from '../src/world/sites.js';
import { signatureProp, propMetadata } from '../src/core/propcatalog.js';

const VIGNETTES = PROP_METADATA.filter(p => p.vignette);
const rooms = (seed, themes) => {
  const w = new World(seed, { themes }), out = [];
  for (const d of [1, 2]) for (const k of w.layout(d).exists) {
    const m = w.cube(k).map;
    if (themes.includes(m.biome) && !m.guardian) out.push(m);
  }
  return out;
};

test('the vignettes are big props with boxes of their own, never landmarks nor scattered', () => {
  assert.ok(VIGNETTES.length >= 6);
  for (const p of VIGNETTES) {
    assert.ok(!p.landmark && p.blocking && p.attach === 'ground' && signatureProp(p), p.name);
    assert.ok(p.colliders.length && p.occluders.length && p.height > 0, p.name);
    for (const b of [...p.colliders, ...p.occluders]) assert.ok(b[0] < b[2] && b[1] < b[3] && b[4] >= 0 && b[4] < b[5], p.name);
  }
  // reward sites are built round landmarks only
  for (const t of THEMES) assert.ok(landmarksOf(t.props).every(p => !p.vignette), t.props);
  // a vignette's dressing: the theme's own small things, none in the way
  for (const [set, bases] of Object.entries(DRESSING)) for (const b of bases)
    assert.ok(['a', 'b'].some(v => propMetadata.get(`${set}_${b}_${v}`)) && !propMetadata.get(`${set}_${b}_a`).blocking, `${set}_${b}`);
});

test('a box turns with its prop, a quarter turn at a time', () => {
  const b = [0.25, -0.5, 1, 0.5, 0, 1];
  assert.deepEqual(turnBox(b, 5, 5, 0), { shape: 'box', x0: 5.25, z0: 4.5, x1: 6, z1: 5.5, bottom: 0, top: 1 });
  // (three.js about Y: x' = x cos + z sin, z' = -x sin + z cos)
  assert.deepEqual(turnBox(b, 5, 5, Math.PI / 2), { shape: 'box', x0: 4.5, z0: 4, x1: 5.5, z1: 4.75, bottom: 0, top: 1 });
  assert.deepEqual(turnBox(b, 5, 5, Math.PI), { shape: 'box', x0: 4, z0: 4.5, x1: 4.75, z1: 5.5, bottom: 0, top: 1 });
});

test('the dark forest scatters its vignettes off the way, collidable, never cutting anything off', () => {
  let total = 0;
  const kinds = new Set();
  for (const seed of [1, 2, 3]) for (const m of rooms(seed, ['darkforest'])) {
    const theme = THEMES.find(t => t.props === 'darkforest');
    assert.ok(m.vignettes.length <= count16(theme.vignettes[1]), m.key);   // (a bigger room holds more: cubegen/vignettes.js)
    total += m.vignettes.length;
    for (const v of m.vignettes) {
      kinds.add(v.name);
      const p = PROP_METADATA.find(q => q.name === v.name);
      assert.ok(vignettesOf('darkforest').includes(p), v.name);
      assert.ok(m.sitePlacements.some(q => q.name === v.name && q.x === v.x && q.z === v.z), `${m.key}: drawn`);
      const boxes = p.colliders.map(b => turnBox(b, v.x, v.z, v.yaw));
      for (const b of boxes) {
        assert.ok(b.x0 >= 0 && b.z0 >= 0 && b.x1 <= N && b.z1 <= N, `${m.key}: ${v.name} inside the cube`);
        // its colliders are the map's: in every cell the character could touch them from
        const c = Math.floor((b.z0 + b.z1) / 2) * N + Math.floor((b.x0 + b.x1) / 2);
        assert.ok(m.staticBlockers[c].some(q => q.shape === 'box' && Math.abs(q.x0 - b.x0) < 1e-9 && Math.abs(q.z0 - b.z0) < 1e-9
          && Math.abs(q.bottom - (v.y + b.bottom)) < 1e-9), `${m.key}: ${v.name} collides`);
      }
      // the ways through the room never run into it
      const walls = boxes.filter(b => b.bottom < CHAR_H);
      for (const route of m.routes) for (const pt of route) {
        const hit = walls.find(b => pt.x > b.x0 - CHAR_R * 0.9 && pt.x < b.x1 + CHAR_R * 0.9 && pt.z > b.z0 - CHAR_R * 0.9
          && pt.z < b.z1 + CHAR_R * 0.9 && pt.y < v.y + b.top && pt.y + CHAR_H > v.y + b.bottom);
        assert.ok(!hit, `${m.key}: the way runs into ${v.name}`);
      }
    }
    // every portal still leads to the exit
    for (const p of m.portals) assert.equal(m.safe[p.floor.id], 1, `${m.key}: portal ${p.id}`);
  }
  assert.ok(total > 30, `only ${total} vignettes`);
  assert.equal(kinds.size, vignettesOf('darkforest').length, 'every kind comes up');
});

test('vignettes come from the seed, and only where the theme has them', () => {
  const a = rooms(4, ['darkforest']).map(m => m.vignettes), b = rooms(4, ['darkforest']).map(m => m.vignettes);
  assert.deepEqual(a, b);
  for (const m of rooms(4, ['meadow'])) assert.deepEqual(m.vignettes, [], m.key);
});
