import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state } from './fixtures.js';
import { DIRS } from '../src/core/constants.js';
import { edgeKey } from '../src/core/util.js';
import { World } from '../src/world/world.js';
import { makeLayouts, guardianDepth } from '../src/world/layout.js';
import { faceKey, step } from '../src/world/coords.js';
import { voidAllowed } from '../src/world/voids.js';
import { guardianColor, guardianTitle } from '../src/core/guardians.js';
import { bossAt } from '../src/core/bosses.js';
import { parseColor } from '../src/core/oklch.js';
import { ENEMY_PROFILES, ENEMY_KINDS, GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, GUARDIAN_TIERS, enemyProfile, makeEnemy, threat, guardianLevel, depthLevel } from '../src/core/enemies.js';
import { guardianId, gateLocked, portalLocked, restoreDefeated, leavingFight, steersOut, guardianName, guardianLockMessage, lockMessage } from '../src/core/guardians.js';
import { createRun, createPlayerStats, awardKill } from '../src/core/progression.js';
import { population } from '../src/core/spawns.js';
import { damageEnemy } from '../src/core/combat.js';
import { enemySpots, guardianSpots, guardianKind } from '../src/game/enemyspawn.js';
import { coordinateDefence } from '../src/game/defence.js';
import { walkable, findPath } from '../src/physics/enemynav.js';
import { buildCubeGeometry } from '../src/render/cubegeo.js';

const signature = spots => spots.map(s => [s.id, s.kind.type, s.level, s.f.id, s.x, s.y, s.z, s.yaw]);
const arena = (seed = 123, depth = 7) => {   // (the first descent without a real boss, core/bosses.js)
  const world = new World(seed), key = world.layout(depth).down;
  return { world, map: state.map = world.cube(key).map };
};

test('every descent is guarded, with one or two mandatory seeded side guardians', () => {
  for (let seed = 0; seed < 100; seed++) {
    const get = makeLayouts(seed), same = makeLayouts(seed);
    for (let d = 0; d <= 20; d++) {
      const L = get(d);
      assert.equal(L.guardian, guardianDepth(seed, d));
      assert.deepEqual(L, same(d));
      assert.equal(L.exit.size, L.exists.size - (d === 20 ? 1 : 0));
      if (L.guardian) {
        assert.ok(d >= 0 && d < 20);
        assert.equal(L.guardians.get(L.down).role, 'descent');
        // a real boss takes the first descent guardian's place (core/bosses.js); the rest are placeholders
        assert.equal(L.guardians.get(L.down).bossPlaceholder, !bossAt(d));
        assert.equal(L.guardians.get(L.down).boss, bossAt(d) ?? undefined);
        const side = [...L.guardians].filter(([, g]) => g.role === 'side');
        assert.ok(side.length >= 1 && side.length <= 2);
        for (const [k, g] of side) {
          assert.ok(L.route.includes(k)); assert.notEqual(k, L.up); assert.notEqual(k, L.down);
          assert.equal(L.gateFaces.get(faceKey(k, g.exit)), k);
          assert.equal([0, 1, 2, 3].filter(dir => L.portals.has(faceKey(k, dir))).length, 2);
        }
        assert.equal([0, 1, 2, 3].filter(dir => L.portals.has(faceKey(L.down, dir))).length, 1);
        assert.equal(L.exit.get(L.down), 4);
      }
    }
    for (let d = 0; d < 20; d++) assert.equal(get(d).guardian, true);
    assert.equal(get(20).guardians.size, 0);
  }
});

test('each species has a distinct pink guardian kind with unchanged movement and attacks', () => {
  assert.equal(Object.keys(GUARDIAN_KINDS).length, ENEMY_PROFILES.length);
  for (const base of ENEMY_PROFILES) {
    const kind = GUARDIAN_KINDS[base.species];
    assert.equal(ENEMY_KINDS[kind.type], kind);
    assert.ok(kind.guardian && kind.label.startsWith('Guardian'));
    assert.notEqual(kind.type, base.type);
    for (const role of Object.keys(base.parts)) assert.ok(kind.colors[role]);
    for (const key of ['chase', 'radius', 'height', 'attackTime', 'hitAt', 'cooldown']) assert.equal(kind[key], base[key]);
    const normal = enemyProfile(base, 5), guardian = enemyProfile(kind, 6);
    assert.ok(guardian.hp >= normal.hp * 3 && guardian.damage > normal.damage, base.type);
    assert.ok(kind.poise >= base.poise && kind.poise >= GUARDIAN_TIERS.side.poise, 'a guardian strikes back through blows');
  }
});

test('guardian arenas have dry, connected floors, shared ground entrances and no fall-through bypass', () => {
  for (const seed of [0, 1, 2, 7, 42, 123]) {
    const w = new World(seed);
    for (let d = 0; d < 20; d++) for (const [key, g] of w.layout(d).guardians) {
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
      assert.ok(m.floors.every(f => !f.fluid && !f.covered));
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
  }
});

test('double the full local roster with exactly one promoted guardian, without overlapping spawns', () => {
  for (let seed = 0; seed < 30; seed++) {
    const w = new World(seed);
    for (let d = 0; d < 20; d++) for (const [key, g] of w.layout(d).guardians) {
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
        assert.equal(p.count, ordinary.get(type).count * 2);
        const cfg = ENEMY_PROFILES.find(p => p.species === type);
        assert.equal(enemySpots(map, cfg).length, p.count);
      }
      assert.equal(new Set(spots.map(s => s.f.id)).size, spots.length);
      for (const a of spots) {
        assert.ok(walkable(a.f, a.kind.height) && findPath(a.f, guard.f, 40, a.kind.height));
        for (const b of spots) if (a !== b)
          assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.kind.radius + b.kind.radius + .1);
      }
    }
  }
});

test('descent guardians are explicit stronger boss placeholders for every species and level', () => {
  for (const base of ENEMY_PROFILES) {
    const side = GUARDIAN_KINDS[base.species], descent = DESCENT_GUARDIAN_KINDS[base.species];
    assert.equal(ENEMY_KINDS[descent.type], descent);
    assert.equal(side.guardianRole, 'side'); assert.equal(side.bossPlaceholder, false);
    assert.equal(descent.guardianRole, 'descent'); assert.equal(descent.bossPlaceholder, true);
    assert.notEqual(descent.type, side.type); assert.notEqual(descent.colors, side.colors);
    assert.notEqual(guardianColor('side'), guardianColor('descent'));
    // a side guardian is the Guardian of its species, a descent guardian its Temp Boss
    assert.equal(side.label, `Guardian ${base.label}`); assert.equal(descent.label, `Temp Boss ${base.label}`);
    assert.equal(guardianTitle('side', side), `◆ Guardian ${base.label}`);
    assert.equal(guardianTitle('descent', descent), `♛ Temp Boss ${base.label}`);
    // each tier meets its floors (damage is rounded to whole points), so the species it promotes
    // decides how it fights, not how strong it is
    for (const [kind, t] of [[side, GUARDIAN_TIERS.side], [descent, GUARDIAN_TIERS.descent]]) {
      assert.ok(kind.hp >= t.hp && kind.hp >= Math.round(base.hp * t.hpMult) - 1, kind.type);
      assert.ok(threat(kind) >= t.threat * 0.97 && kind.damage >= Math.round(base.damage * t.damageMult) - 1, kind.type);
      assert.equal(kind.xp, t.xp);
    }
    for (let level = 1; level <= 30; level++) {
      const a = enemyProfile(side, level), b = enemyProfile(descent, level);
      assert.ok(b.hp >= a.hp * 1.55 && threat(b) >= threat(a) * 1.2 && b.xp > a.xp * 2);
      for (const other of Object.values(GUARDIAN_KINDS))
        assert.ok(b.hp > enemyProfile(other, level).hp, 'the boss tier outlasts every side guardian');
    }
    for (const key of ['chase', 'radius', 'height', 'attackTime', 'hitAt', 'cooldown']) assert.equal(descent[key], base[key]);
  }
});

test('guardians are pink and amber, except where a species dresses them otherwise: the Wolk goes grey and silver', () => {
  for (const base of ENEMY_PROFILES) {
    if (base.guardianLooks) continue;
    for (const [kinds, hue] of [[GUARDIAN_KINDS, 350], [DESCENT_GUARDIAN_KINDS, 65]])
      for (const [role, color] of Object.entries(kinds[base.species].colors)) if (role !== 'eyes') assert.equal(parseColor(color).h, hue, base.type);
  }
  const side = GUARDIAN_KINDS.wolk, descent = DESCENT_GUARDIAN_KINDS.wolk, wolk = ENEMY_KINDS.wolk;
  const grey = parseColor(side.colors.body), silver = parseColor(descent.colors.body);
  assert.ok(grey.c < 0.03 && grey.l > 0.5 && grey.l < 0.8, 'a grey side guardian');
  assert.ok(silver.c < 0.03 && silver.l > 0.85, 'a light silver descent guardian');
  assert.ok(descent.finish.metalness > 0 && descent.finish.roughness < 0.3 && descent.finish.glints > 0, 'that shines');
  assert.equal(side.finish, undefined); assert.equal(wolk.finish, undefined);
  for (const k of [side, descent]) {
    assert.ok(parseColor(k.gloom.color).l < parseColor(k.colors.body).l, 'still darkens to strike');
    assert.ok(k.hp > wolk.hp * 3 && k.guardian, k.type);
  }
});
test('the messages call a guardian by its kind: the one guardianSpots promotes', () => {
  const w = new World(5);
  for (const depth of [0, 1, 3, 4]) for (const [key, g] of w.layout(depth).guardians) {
    const map = w.cube(key).map, kind = guardianKind(map), label = kind.label;   // (English: the label is its name)
    assert.equal(kind, guardianSpots(map)[0].kind, 'the guardian that stands there');
    const exit = map.portals.find(p => p.dir === map.exit);
    if (g.role === 'side') {
      assert.match(label, /^Guardian /);
      assert.equal(guardianName(map, kind), `The ${label}`);
      assert.equal(lockMessage(map, exit.dir, kind), `Defeat the ${label} to unlock this passage`);
    } else if (bossAt(depth)) {
      assert.equal(guardianName(map, kind), label); assert.equal(guardianLockMessage(map, kind), `Defeat ${label} to unlock this descent`);
    } else {
      assert.match(label, /^Temp Boss /);
      assert.equal(guardianName(map, kind), `The ${label}`);
      assert.equal(guardianLockMessage(map, kind), `Defeat the ${label} to unlock this descent`);
    }
  }
  const plain = w.cube(w.layout(7).down).map;
  assert.equal(guardianLockMessage(plain), 'Defeat the Temp Boss to unlock this descent', 'unknown: by its tier');
  assert.equal(guardianKind(w.cube(w.layout(7).route[1]).map), null, 'no guardian');
});
test('leaving an arena while its guardian lives asks, and only when steered out', () => {
  const w = new World(3), run = createRun();
  for (const depth of [0, 1]) for (const [key, g] of w.layout(depth).guardians) {
    const map = w.cube(key).map, entry = map.portals[0];
    assert.equal(leavingFight(map, run, entry.dir), true, `${g.role} arena entrance asks`);
    assert.equal(leavingFight(map, run, 4), false, 'wells are not faces');
    assert.match(guardianName(map), g.role !== 'descent' ? /guardian$/ : depth === 0 ? /^Gusto$/ : /^Totnar$/);
    run.unlockedGates.add(map.key);
    assert.equal(leavingFight(map, run, entry.dir), false, 'not once it is dead');
  }
  const ordinary = w.cube(w.layout(0).route[1]).map;
  assert.equal(leavingFight(ordinary, run, 0), false, 'ordinary rooms never ask');
  const p = { ...createPlayerStats(), hp: 10, stun: 0 };
  assert.equal(steersOut(p, 0, 1, 0), true);
  assert.equal(steersOut(p, 0, 0, 0), false, 'a push alone does not ask');
  assert.equal(steersOut(p, 0, -1, 0), false, 'steering away does not ask');
  assert.equal(steersOut(p, 2, 0, 0.5), true);
  for (const state of [{ ragdoll: {} }, { held: {} }, { getUp: {} }, { stun: 0.4 }, { down: true }, { hp: 0 }])
    assert.equal(steersOut({ ...p, ...state }, 0, 1, 0), false, JSON.stringify(state));
});
test('side gates lock full-face and debug travel, preserve retreat, and stay unlocked after death', () => {
  for (const seed of [0, 1, 7, 42]) for (const depth of [0, 1, 12, 19]) {
    const w = new World(seed), L = w.layout(depth), run = createRun(), hero = createPlayerStats();
    for (const [key, g] of L.guardians) if (g.role === 'side') {
      const map = state.map = w.cube(key).map;
      const entry = map.portals[0], exit = map.portals[1];
      const neighbor = w.cube(step(key, exit.dir)).map;
      assert.equal(exit.dir, g.exit);
      assert.equal(portalLocked(map, run, exit), true);
      assert.equal(portalLocked(map, run, { kind: 'side', dir: exit.dir }), true);
      assert.equal(portalLocked(neighbor, run, { kind: 'side', dir: exit.dir ^ 1 }), true);
      assert.equal(portalLocked(map, run, entry), false);
      assert.equal(entry.y, exit.y);
      const reverse = neighbor.portals.find(p => p.dir === (exit.dir ^ 1));
      assert.equal(reverse.y, exit.y); assert.equal(reverse.layer, 0);
      const guard = guardianSpots(map).find(s => s.guardian);
      const enemy = makeEnemy(guard, guard.kind);
      damageEnemy(enemy, enemy.hp); awardKill(hero, run, enemy);
      assert.equal(portalLocked(map, run, exit), false);
      assert.equal(portalLocked(neighbor, run, reverse), false);
      restoreDefeated(run, new Set());
      assert.ok(run.defeated.has(enemy.id));
      assert.equal(portalLocked(map, run, exit), false);
    }
  }
});

test('only guardian death unlocks the descent, surviving enemies do not matter, and death cannot restore it', () => {
  const { map } = arena(), run = createRun(), hero = createPlayerStats();
  const list = guardianSpots(map).map(s => makeEnemy(s, s.kind)), guard = list.find(e => e.guardian);
  const ordinary = list.find(e => !e.guardian), down = map.portals.find(p => p.kind === 'down');
  assert.equal(gateLocked(map, run), true);
  assert.equal(portalLocked(map, run, down), true);
  assert.equal(portalLocked(map, run, map.portals[0]), false);
  assert.equal(awardKill(hero, run, guard), null);
  damageEnemy(ordinary, ordinary.hp); awardKill(hero, run, ordinary);
  assert.equal(gateLocked(map, run), true);
  damageEnemy(guard, guard.hp); assert.ok(awardKill(hero, run, guard));
  assert.equal(portalLocked(map, run, down), false);
  assert.ok(list.some(e => e.mode !== 'dead'));
  const xp = hero.xp;
  assert.equal(awardKill(hero, run, guard), null); assert.equal(hero.xp, xp);
  restoreDefeated(run, new Set());
  assert.equal(run.defeated.has(guard.id), true);
  assert.equal(run.defeated.has(ordinary.id), false);
  const respawns = guardianSpots(map).filter(s => !run.defeated.has(s.id));
  assert.ok(respawns.some(s => s.id === ordinary.id));
  assert.ok(!respawns.some(s => s.guardian));
  assert.equal(gateLocked(map, run), false);
  assert.equal(gateLocked(map, createRun()), true);
});

test('defenders intercept advances, rally when the guardian is hurt, and cannot all be lured to the entrance', () => {
  const { map } = arena(), run = createRun(), list = guardianSpots(map).map(s => makeEnemy(s, s.kind));
  const guard = list.find(e => e.guardian), g = map.guardian, [dx, dz] = g.approach;
  const hero = { hp: 100, x: g.x + dx * 2, y: g.y, z: g.z + dz * 2 };
  guard.hp--;
  coordinateDefence(map, run, list, hero);
  const defenders = list.filter(e => !e.guardian);
  assert.ok(defenders.every(e => e.defence.engage));
  for (const e of list) assert.ok(findPath(e.f, e.defence.post, 40, e.profile.height));
  assert.ok(new Set(defenders.map(e => e.defence.post.id)).size > 1);
  const entry = map.portals[0];
  Object.assign(hero, { x: entry.x + .5 - dx, z: entry.z + .5 - dz });
  coordinateDefence(map, run, list, hero);
  assert.equal(guard.defence.engage, false);
  assert.ok(defenders.filter(e => e.defence.engage).length <= Math.ceil(defenders.length / 3));
  const committed = defenders[0]; committed.mode = 'attack';
  coordinateDefence(map, run, list, hero); assert.equal(committed.mode, 'attack');
  run.unlockedGates.add(map.key);
  committed.mode = 'defend';
  coordinateDefence(map, run, list, hero);
  assert.ok(list.every(e => !e.defence)); assert.equal(committed.mode, 'idle');
});
