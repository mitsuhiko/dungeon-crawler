import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { PRESTIGE, siteIntent } from '../src/world/sites.js';
import { generate } from '../src/cubegen/index.js';
import { propMetadata } from '../src/core/propcatalog.js';
import { N } from '../src/core/constants.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';
import { checkSites } from './sweeps/sites.js';

const signature = m => ({ sites: m.rewardSites, placements: m.sitePlacements, failures: m.siteFailures,
  floors: m.floors.map(f => [f.c, f.layer, f.top, f.cs]), attempts: m.attempts });

test('stratum budgets and site IDs are seeded, sparse, and independent of WFC or exploration order', () => {
  for (let seed = 0; seed < 10; seed++) {
    const a = makeLayouts(seed), b = makeLayouts(seed);
    assert.deepEqual([...a(0).sitePlans.keys()], [a(0).firstGlass], 'depth 0: only the beginning\'s rock (core/intro.js)');
    for (let d = 20; d > 0; d--) {
      assert.deepEqual(a(d).sitePlans, b(d).sitePlans);
      // (a puzzle's vault in a branch, world/trials.js, holds a site of its own besides)
      const vaults = new Set(a(d).trials.filter(t => t.role === 'branch').map(t => t.key));
      assert.ok([...a(d).sitePlans.keys()].filter(k => !vaults.has(k)).length <= 4);
      const sites = [...a(d).sitePlans].filter(([k]) => !vaults.has(k)).flatMap(([, v]) => v);
      assert.equal(sites.filter(s => ['rare', 'exceptional'].includes(s.prestige)).length, 1);
      for (const key of a(d).sitePlans.keys()) {
        assert.ok(a(d).exists.has(key));
        assert.notEqual(key, a(d).up); assert.notEqual(key, a(d).down);
      }
    }
  }
});

test('all six mine/ruin settings generate and prestige invests more space without rerolling identity', () => {
  for (const [depth, settings] of [[16, ['storage', 'gallery', 'excavation']], [17, ['burial', 'hall', 'courtyard']]]) {
    const w = new World(3, { themes: ['mines', 'ruins'] }), key = w.layout(depth).sitePlans.keys().next().value;
    w.prepare(key);
    const spec = w.spec(key), sizes = [];
    assert.ok(['mines', 'ruins'].includes(spec.biome), spec.biome);
    for (const prestige of PRESTIGE) for (const setting of settings) {
      const intent = { ...siteIntent(1, key, spec.biome, prestige), setting };
      const custom = { ...spec, rewardSites: [intent] }, m = generate(custom);
      assert.equal(m.rewardSites.length, 1, `${spec.biome}/${prestige}/${setting}: ${JSON.stringify(m.siteFailures)}`);
      checkSites(m);
      assert.deepEqual(signature(m), signature(generate(custom)), 'same spec deterministically realizes the site');
      assert.deepEqual(signature(m), signature(structuredClone(m)), 'worker clone preserves site data');
      if (setting === settings[0]) sizes.push(m.rewardSites[0].cells.length);
      const geo = buildCubeGeometry(m);
      assert.equal(geo.length, m.K);
      assert.ok(geo.every(l => !l.terrain || [...l.terrain.pos].every(Number.isFinite)));
    }
    assert.ok(sizes.every((n, i) => i === 0 || n > sizes[i - 1]));
  }
});

test('unplaceable destinations are reported without downgrading or breaking required routes', () => {
  const w = new World(3, { themes: ['mines'] }), key = w.layout(16).sitePlans.keys().next().value;
  w.prepare(key);
  const spec = w.spec(key);
  // An overcrowded budget cannot fit: test bounded best-effort generation without a fake floor fallback.
  const blocked = { ...spec, rewardSites: Array.from({ length: 20 }, (_, slot) => siteIntent(3, key, 'mines', 'exceptional', slot)) };
  const m = generate(blocked);
  assert.ok(m.siteFailures.length);
  assert.ok((m.siteAttempts || m.attempts) <= 200);
  assert.equal(m.rewardSites.length + m.siteFailures.length, blocked.rewardSites.length);
  for (const s of [...m.rewardSites, ...m.siteFailures]) assert.equal(s.prestige, 'exceptional');
  checkSites(m);
});

test('site collider bounds come from worker-safe metadata, not runtime asset readiness', () => {
  const w = new World(3), key = w.layout(15).sitePlans.keys().next().value, m = w.cube(key).map;
  for (const p of m.sitePlacements) {
    const metadata = propMetadata.get(p.name);
    assert.ok(metadata);
    if (!metadata.blocking || metadata.landmark) continue;   // landmarks: boxes (tests/landmarks.test.js)
    const list = m.staticBlockers[Math.floor(p.z) * N + Math.floor(p.x)];
    const b = list.find(b => b.x === p.x && b.z === p.z);
    assert.equal(b.r, metadata.radius * p.s);
    assert.equal(b.top, p.y + metadata.maxY * p.s);
  }
});
