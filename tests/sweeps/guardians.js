// The guardians' arenas of whole worlds (tests/sweep.js): dry, connected and entered on the ground,
// and the roster in them (core/spawns.js, game/enemyspawn.js)
import assert from 'node:assert/strict';
import { state } from '../fixtures.js';
import { DIRS } from '../../src/core/constants.js';
import { edgeKey } from '../../src/core/util.js';
import { step } from '../../src/world/coords.js';
import { voidAllowed } from '../../src/world/voids.js';
import { ENEMY_PROFILES, ENEMY_KINDS, GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, guardianLevel, depthLevel } from '../../src/core/enemies.js';
import { guardianId } from '../../src/core/guardians.js';
import { population } from '../../src/core/spawns.js';
import { enemySpots, guardianSpots } from '../../src/game/enemyspawn.js';
import { walkable, findPath } from '../../src/physics/enemynav.js';
import { walker } from '../../src/physics/dwell.js';
import { buildCubeGeometry } from '../../src/render/cubegeo.js';

const signature = spots => spots.map(s => [s.id, s.kind.type, s.level, s.f.id, s.x, s.y, s.z, s.yaw]);
const pondFluids = m => new Set([...population(m)].flatMap(([type, p]) => Object.keys(p.kinds ?? { [type]: 1 }))
  .map(k => ENEMY_KINDS[k]).filter(k => k?.dwells).map(k => k.dwells[0]));
// every guardian's arena of world w: { d, key, g }
function* arenas(w) {
  for (let d = 0; d < 20; d++) for (const [key, g] of w.layout(d).guardians) yield { d, key, g };
}

export default [{
  name: 'guardian arenas have dry, connected floors (but their fluid dwellers\' ponds), shared ground entrances and no fall-through bypass',
  run(w) {
    for (const { key, g } of arenas(w)) {
      const m = state.map = w.cube(key).map, clone = structuredClone(m);
      assert.equal(m.portals.length, 2);
      assert.deepEqual(m.portals.map(p => p.kind), ['side', g.role === 'side' ? 'side' : 'down']);
      assert.equal(m.K, 1); assert.equal(m.exit, g.exit); assert.equal(m.roomRole, `${g.role}-guardian`);
      assert.equal(m.guardian.role, g.role); assert.equal(m.guardian.bossPlaceholder, g.role === 'descent' && !g.boss);
      assert.equal(m.guardian.boss, g.boss ?? null);
      assert.equal(voidAllowed(w, m.key), false);
      // (Flip's box has floors stacked in its columns: its walls, its island, core/flip.js; so has
      // Foggery's caldera, its bridge over the floor, cubegen/towerarena.js)
      const stacked = !!m.flip || !!m.tower;
      if (!stacked) assert.equal(m.floors.length, 256);
      const fluids = pondFluids(m);
      assert.ok(m.floors.every(f => !f.covered && (!f.fluid || f.encounter && fluids.has(f.fluid))));
      if (!stacked) for (const f of m.floors) if (f.encounter) for (const [dx, dz] of DIRS) {
        const other = m.floors[(f.z + dz) * 16 + f.x + dx];
        if (!other.encounter && other.top < f.top - 1) assert.ok(m.fences.has(edgeKey(f.x, f.z, other.x, other.z)));
      }
      const entry = m.portals[0], down = m.portals[1];
      assert.equal(entry.layer, 0);
      if (m.tower) assert.ok(down.y < entry.y); else assert.equal(entry.y, down.y);   // (his well lies on the caldera's floor)
      for (const cfg of ENEMY_PROFILES) {
        assert.ok(walkable(m.guardian.floor, cfg.height));
        assert.ok(findPath(entry.floor, m.guardian.floor, 40, cfg.height));
        assert.ok(findPath(m.guardian.floor, down.floor, 40, cfg.height));
      }
      if (!m.tower) assert.equal(Math.hypot(m.guardian.x - down.x - .5, m.guardian.z - down.z - .5), 2);
      assert.equal(clone.guardian.floor, clone.floors[m.guardian.floor.id]);
      assert.equal(buildCubeGeometry(m).length, 1);
      const neighbor = w.cube(step(m.key, entry.dir)).map;
      const other = neighbor.portals.find(p => p.dir === (entry.dir ^ 1));
      assert.equal(other.layer, 0); assert.equal(other.y, entry.y);
    }
  },
}, {
  name: 'double the full local roster with exactly one promoted guardian, without overlapping spawns',
  run(w) {
    for (const { d, key, g } of arenas(w)) {
      if (g.boss) continue;   // a boss stands alone (tests/gusto.test.js)
      const map = state.map = w.cube(key).map, spots = guardianSpots(map);
      const ordinary = population({ ...map, guardian: null }), pop = population(map);
      assert.deepEqual(signature(spots), signature(guardianSpots(map)));
      assert.deepEqual(signature(spots), signature(guardianSpots(structuredClone(map))));
      assert.equal(spots.filter(s => s.guardian).length, 1);
      const guard = spots.find(s => s.guardian);
      assert.equal(guard.id, guardianId(map.key)); assert.equal(guard.guardianGate, map.key);
      assert.equal(guard.kind, (g.role === 'descent' ? DESCENT_GUARDIAN_KINDS : GUARDIAN_KINDS)[guard.kind.species]);
      assert.equal(guard.guardianRole, g.role); assert.equal(guard.bossPlaceholder, g.role === 'descent');
      assert.equal(guard.level, guardianLevel(d, g.role));
      assert.equal(guard.level, depthLevel(d) + (d ? g.role === 'descent' ? 2 : 1 : 0));
      for (const [type, p] of pop) {
        // (the same species, twice over: never more than twice the ordinary room's, core/spawns.js fitBudget)
        assert.ok(p.count % 2 === 0 && p.count <= ordinary.get(type).count * 2, `${type}: ${p.count}`);
        const cfg = ENEMY_PROFILES.find(p => p.species === type), placed = enemySpots(map, cfg).length;
        // (a fluid dweller: as many as its pond holds, most of them)
        if (cfg.dwells) assert.ok(placed <= p.count && placed >= p.count * 0.6, `${type}: ${placed} of ${p.count}`);
        else assert.equal(placed, p.count);
      }
      assert.equal(new Set(spots.map(s => s.f.id)).size, spots.length);
      for (const a of spots) {
        // (a fluid dweller in its pond, and the guardian a way off: it is only ever there)
        if (a.kind.dwells) { assert.ok(walkable(a.f, walker(a.kind)), 'in its pond'); continue; }
        assert.ok(walkable(a.f, a.kind.height) && findPath(a.f, guard.kind.dwells ? map.guardian.floor : guard.f, 40, a.kind.height));
        for (const b of spots) if (a !== b)
          assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.kind.radius + b.kind.radius + .1);
      }
    }
  },
}];
