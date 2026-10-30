import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { PRESTIGE, siteIntent } from '../src/world/sites.js';
import { generate } from '../src/cubegen/index.js';
import { reachTo } from '../src/cubegen/reach.js';
import { propMetadata } from '../src/core/propcatalog.js';
import { N, CHAR_R } from '../src/core/constants.js';
import { containsXZ } from '../src/core/blockers.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';

const context = m => ({ ...m,
  nextAbove: f => m.cols[f.c][m.cols[f.c].indexOf(f) + 1],
  headOK: (f, h) => { const a = m.cols[f.c][m.cols[f.c].indexOf(f) + 1]; return !a || a.bottom >= Math.max(h, f.top) + 2; },
});
const signature = m => ({ sites: m.rewardSites, placements: m.sitePlacements, failures: m.siteFailures,
  floors: m.floors.map(f => [f.c, f.layer, f.top, f.cs]), attempts: m.attempts });

function checkSites(m) {
  const ctx = context(m);
  for (const site of m.rewardSites) {
    const f = m.floors[site.floor], access = m.floors[site.accessFloor];
    assert.ok(reachTo(ctx, access, true).has(site.entryFloor), 'entry must reach site');
    assert.ok(reachTo(ctx, m.floors[site.exitFloor], true).has(access.id), 'site must reach onward route');
    assert.equal(m.safe[access.id], 1);
    assert.equal(f.fluid, 0); assert.equal(access.fluid, 0);
    assert.ok(Math.max(...f.cs) - Math.min(...f.cs) < 0.2);
    assert.ok(Math.max(...access.cs) - Math.min(...access.cs) < 0.2);
    assert.ok(Math.hypot(site.anchor.x - site.approach.x, site.anchor.z - site.approach.z) <= 1.01);
    assert.ok(Math.abs(site.anchor.y - site.approach.y) < 0.1);
    assert.equal(m.sitePlacements.filter(p => p.site === site.id && p.name === 'treasure_chest').length, 1);
    for (const b of m.staticBlockers[access.c])
      assert.ok(!containsXZ(b, site.approach.x, site.approach.z, CHAR_R), 'standing/interacting position stays clear');
    for (const c of site.cells) assert.ok(c % N >= 2 && c % N < N - 2 && Math.floor(c / N) >= 2 && Math.floor(c / N) < N - 2);
  }
  // Even when optional sites cannot fit, the required portal-to-exit contract remains intact.
  for (const portal of m.portals) assert.equal(m.safe[portal.floor.id], 1);
  for (const route of m.routes) for (const q of route) {
    const c = Math.floor(q.z) * N + Math.floor(q.x);
    for (const b of m.staticBlockers[c] || []) if (b.bottom < q.y + 0.85 && b.top > q.y + 0.3)
      assert.ok(!containsXZ(b, q.x, q.z, CHAR_R), 'routes cannot walk through destination dressing');
  }
}

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

test('reward destinations remain accessible, framed and collider-safe across depths and seeds', () => {
  let requested = 0, realized = 0;
  for (const seed of [0, 3, 7]) {
    const w = new World(seed);
    for (let depth = 1; depth <= 20; depth++) for (const [key, intent] of w.layout(depth).sitePlans) {
      const m = w.cube(key).map;
      checkSites(m);
      requested += intent.length; realized += m.rewardSites.length;
      // (a quest's spot that found no place is reported there too: tests/spots.test.js)
      const failed = m.siteFailures.filter(s => s.id.includes(':site:'));
      assert.equal(m.rewardSites.length + failed.length, intent.length);
      for (const s of [...m.rewardSites, ...failed]) {
        assert.equal(s.id, intent[0].id); assert.equal(s.prestige, intent[0].prestige);
      }
    }
  }
  assert.ok(realized / requested > 0.97, 'optional site success rate');
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
