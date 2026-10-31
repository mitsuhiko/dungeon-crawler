// The reward sites of whole worlds (tests/sweep.js): accessible, framed and collider-safe
// (checkSites; tests/generation.test.js has the sites made on purpose)
import assert from 'node:assert/strict';
import { N, CHAR_R } from '../../src/core/constants.js';
import { reachTo } from '../../src/cubegen/reach.js';
import { containsXZ } from '../../src/core/blockers.js';

const context = m => ({ ...m,
  nextAbove: f => m.cols[f.c][m.cols[f.c].indexOf(f) + 1],
  headOK: (f, h) => { const a = m.cols[f.c][m.cols[f.c].indexOf(f) + 1]; return !a || a.bottom >= Math.max(h, f.top) + 2; },
});

// map m's reward sites: reached and left by the way, on dry level ground, the chest in place and
// nothing in the way of whoever stands at it; and the way through the cube kept
export function checkSites(m) {
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
    // (a cave behind a waterfall, cubegen/grotto.js, lies where its fall does: off the outer ring)
    const ring = site.setting === 'grotto' ? 1 : 2;
    for (const c of site.cells) assert.ok(c % N >= ring && c % N < N - ring && Math.floor(c / N) >= ring && Math.floor(c / N) < N - ring);
  }
  // Even when optional sites cannot fit, the required portal-to-exit contract remains intact.
  for (const portal of m.portals) assert.equal(m.safe[portal.floor.id], 1);
  for (const route of m.routes) for (const q of route) {
    const c = Math.floor(q.z) * N + Math.floor(q.x);
    for (const b of m.staticBlockers[c] || []) if (b.bottom < q.y + 0.85 && b.top > q.y + 0.3)
      assert.ok(!containsXZ(b, q.x, q.z, CHAR_R), 'routes cannot walk through destination dressing');
  }
}

export default [{
  name: 'reward destinations remain accessible, framed and collider-safe across depths',
  run(w) {
    let requested = 0, realized = 0;
    for (let depth = 1; depth <= 20; depth++) for (const [key, intent] of w.layout(depth).sitePlans) {
      const m = w.cube(key).map;
      checkSites(m);
      // (a cave behind a waterfall has a chest of its own besides: cubegen/grotto.js)
      const sites = m.rewardSites.filter(s => s.setting !== 'grotto');
      requested += intent.length; realized += sites.length;
      // (a quest's spot that found no place is reported there too: tests/spots.test.js)
      const failed = m.siteFailures.filter(s => s.id.includes(':site:'));
      assert.equal(sites.length + failed.length, intent.length);
      for (const s of [...sites, ...failed]) {
        assert.equal(s.id, intent[0].id); assert.equal(s.prestige, intent[0].prestige);
      }
    }
    assert.ok(realized / requested > 0.97, `optional site success rate: ${realized} of ${requested}`);
  },
}];
