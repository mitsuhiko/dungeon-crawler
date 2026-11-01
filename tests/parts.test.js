import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { N, CUBE_H, FLUIDS, LAVA, ACID } from '../src/core/constants.js';
import { buildCubeGeometry, buildCubeParts } from '../src/render/cubegeo.js';
import { PARTS, packParts, partBuffers } from '../src/render/parts.js';
import { waterSolids } from '../src/render/shore.js';

// a few cubes with every fluid and some falls among them: the surface, the acid rivers of the
// fungal swamp and the lava rivers of the volcanic depths
function sample() {
  const out = [], w = new World(3, { themes: ['swamp'] });
  for (const depth of [0, 1, 2, 3, 4, 11, 18]) for (const k of [...w.layout(depth).exists].slice(0, 3)) out.push(w.cube(k).map);
  return out;
}
const maps = sample();
const tris = a => a ? a.pos.length / 9 : 0;

test('every layer the cube builder makes is a part, so the proxies cannot miss one', () => {
  const kinds = new Set(Object.keys(buildCubeGeometry(maps[0])[0]).filter(k => k !== 'fluids'));
  assert.deepEqual([...kinds].sort(), PARTS.filter(p => p.kind === 'solid').map(p => p.name).sort());
  for (const t of FLUIDS) assert.ok(PARTS.some(p => p.kind === 'fluid' && p.fluid === t) && PARTS.some(p => p.kind === 'fall' && p.fluid === t));
});

test('packed parts keep every triangle, in place to a quantization step', () => {
  for (const m of maps) {
    const layers = buildCubeGeometry(m), geo = packParts(layers, m);
    for (const part of PARTS.filter(p => p.kind !== 'fall')) {
      const src = layers.map(L => part.kind === 'solid' ? L[part.name] : L.fluids[part.fluid]).filter(a => a && a.pos.length);
      const p = geo.parts[part.name];
      assert.equal(!!p, src.length > 0, `${part.name} present iff built`);
      if (!p) continue;
      assert.equal(p.index.length / 3, src.reduce((s, a) => s + tris(a), 0), `${part.name}: triangle count`);
      const n = p.pos.length / 4;
      assert.ok(p.index.every(i => i < n), `${part.name}: indices in range`);
      assert.ok(n < p.index.length, `${part.name}: shared corners are stored once`);
      // the corners of the first triangles land where they were built
      let start = 0;
      for (const a of src) {
        for (let i = 0; i < Math.min(a.pos.length / 3, 30); i++) {
          const v = p.index[start + i];
          for (let j = 0; j < 3; j++) assert.ok(Math.abs(p.pos[v * 4 + j] * geo.scale - a.pos[i * 3 + j]) <= geo.scale / 2 + 1e-6);
        }
        start += a.pos.length / 3;
      }
      if (part.kind === 'solid') assert.ok(p.col.every((c, i) => i % 4 !== 3 || c === 65535), 'opaque vertex colours');
      else assert.equal(p.col, null, 'fluid surfaces take their colour from the material');
    }
    const [x0, y0, z0, x1, y1, z1] = geo.bounds;
    assert.ok(x0 >= -1 && z0 >= -1 && x1 <= N + 1 && z1 <= N + 1 && y0 >= -1 && y1 <= CUBE_H + 1, `${m.key}: bounds ${geo.bounds}`);
  }
});

test('fluid surfaces say where their shores are, and banks get a wet band', () => {
  let shores = 0, bands = 0;
  for (const m of maps) {
    const geo = buildCubeParts(m);
    for (const part of PARTS.filter(p => p.kind === 'fluid')) {
      const p = geo.parts[part.name];
      if (!p) continue;
      assert.equal(p.uv.length, p.pos.length / 2);
      for (let v = 0; v < p.uv.length / 2; v++) {
        const u = p.uv[v * 2], y = p.pos[v * 4 + 1] * geo.scale;
        if (u >= 0) {
          // a top: at its rest height, in its cell
          const c = Math.floor(u / 256), x = p.pos[v * 4] * geo.scale, z = p.pos[v * 4 + 2] * geo.scale;
          assert.ok(Math.abs(y - p.uv[v * 2 + 1]) <= geo.scale, 'tops at the rest height');
          assert.ok(x >= c % N - 1e-3 && x <= c % N + 1 + 1e-3 && z >= Math.floor(c / N) - 1e-3 && z <= Math.floor(c / N) + 1 + 1e-3, 'tops in their cell');
          if (u % 256) shores++;
        } else if (u === -1) bands++;
        else assert.equal(u, -2);
      }
    }
  }
  assert.ok(shores && bands, 'the sample has shores');
});

test('fluid tops carry the bed under them, the sides and bands nothing', () => {
  for (const m of maps) {
    const geo = buildCubeParts(m);
    for (const part of PARTS.filter(p => p.kind === 'fluid')) {
      const p = geo.parts[part.name];
      if (!p) continue;
      assert.equal(p.shore.length, p.pos.length);
      for (let v = 0; v < p.uv.length / 2; v++) {
        const [ground, slope, ceiling, none] = p.shore.slice(v * 4, v * 4 + 4);
        assert.equal(ceiling, 0);
        // (a wet band on sloping ground: 3)
        if (p.uv[v * 2] < 0) { assert.deepEqual([ground, slope], [0, 0]); assert.ok(none === 1 || none === 3 && p.uv[v * 2] === -1); continue; }
        assert.equal(none, 0);
        // (the cube's own fluids lie in beds, under their surface, but for a structure standing in them)
        const c = Math.floor(p.uv[v * 2] / 256);
        assert.ok(slope >= 0 && (ground <= p.uv[v * 2 + 1] + 1e-6 || waterSolids(m, c).some(g => g.piece)), `${m.key}: bed ${ground} under ${p.uv[v * 2 + 1]}`);
      }
    }
  }
});

test('falls are parts of their own fluid, with streak uvs', () => {
  const withFalls = maps.filter(m => m.falls.length);
  assert.ok(withFalls.length, 'the sample has falls');
  for (const m of withFalls) {
    const geo = buildCubeParts(m);
    for (const t of new Set(m.falls.map(f => f.type))) {
      const p = geo.parts[PARTS.find(q => q.kind === 'fall' && q.fluid === t).name];
      assert.ok(p.index.length / 3 >= m.falls.filter(f => f.type === t).length * 12 * 8, 'a sheet (rows of 12 triangles) per fall');
      assert.equal(p.index.length / 3 % 12, 0);
      assert.equal(p.uv.length, p.pos.length / 2);
    }
  }
});

test('the sample covers lava and acid, and the worker transfers every buffer', () => {
  const geos = maps.map(buildCubeParts);
  assert.ok(geos.some(g => g.parts.lava) && geos.some(g => g.parts.acid), `${LAVA}/${ACID} in the sample`);
  for (const g of geos) {
    const buffers = partBuffers(g);
    assert.equal(new Set(buffers).size, buffers.length);
    assert.ok(Object.values(g.parts).every(p => buffers.includes(p.pos.buffer) && buffers.includes(p.index.buffer)));
  }
});
