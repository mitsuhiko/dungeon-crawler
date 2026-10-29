// The beginning (core/intro.js, docs/story.md "The beginning"): the glassmaker's glass on the town
// plaza, another in the merchant camp and his old sword there, the town's glass and the sword each
// opening a gate of its own; a world starts at noon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH } from '../src/core/constants.js';
import { containsXZ } from '../src/core/blockers.js';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey } from '../src/world/coords.js';
import { TOWN_KEY, TOWN_LEVEL, TOWN_SHARDS, CAMP_RELIC, CAMP_ROBOT, WAKE_HOUSE, merchantCampKey, rotateTownPoint } from '../src/world/town.js';
import { INTRO_GATES, INTRO_LOCKED, STORY_NEWS, glassThere, swordThere, pullSword, skipIntro, pastIntro, depthGlassIn, isStoryNews } from '../src/core/intro.js';
import { FIRST_GLASS } from '../src/core/spawns.js';
import { GLASS, PER_DEPTH, glassAt } from '../src/core/glass.js';
import { recordingLines } from '../src/core/narration.js';
import { portalLocked, lockMessage } from '../src/core/guardians.js';
import { createRun, createPlayerStats } from '../src/core/progression.js';
import { createWorld, checkWorld, createHero, checkHero } from '../src/core/save.js';
import { START_CLOCK, nightAt, glowAt, DAYTIMES } from '../src/core/daycycle.js';
import { OLD_SWORD } from '../src/core/items.js';
import { fixedWeapon } from '../src/core/gear/generate.js';
import { RELAYED } from '../src/net/protocol.js';

test('the town\'s way out is open; the merchant camp\'s opens for the sword, the rock\'s room\'s for the glass', () => {
  for (let seed = 0; seed < 40; seed++) {
    const L = makeLayouts(seed)(0), camp = merchantCampKey(seed), rock = step(camp, seed % 4);
    assert.equal(L.route[0], TOWN_KEY); assert.equal(L.route[1], camp); assert.equal(L.route[2], rock);
    assert.equal(L.firstGlass, rock);
    assert.equal(L.gateFaces.get(faceKey(TOWN_KEY, L.exit.get(TOWN_KEY))), undefined);
    assert.equal(L.gateFaces.get(faceKey(camp, L.exit.get(camp))), INTRO_GATES.sword);
    assert.equal(L.gateFaces.get(faceKey(rock, L.exit.get(rock))), INTRO_GATES.glass);
    assert.ok(!L.guardians.has(rock) && !L.hordes.has(rock) && !L.trialCells?.has(rock), 'nothing else in the rock\'s room');
  }
  const w = new World(5), town = w.cube(w.start).map, camp = w.cube(step(w.start, town.exit)).map, run = createRun();
  const rock = w.cube(step(camp.key, camp.exit)).map;
  assert.equal(portalLocked(town, run, { dir: town.exit }), false);
  assert.equal(portalLocked(camp, run, { dir: town.exit ^ 1 }), false, 'back into town from the camp');
  assert.equal(portalLocked(camp, run, { dir: camp.exit }), true);
  assert.equal(portalLocked(rock, run, { dir: rock.exit }), true);
  assert.equal(lockMessage(camp, camp.exit), INTRO_LOCKED[INTRO_GATES.sword]);
  assert.equal(lockMessage(rock, rock.exit), INTRO_LOCKED[INTRO_GATES.glass]);
  run.unlockedGates.add(INTRO_GATES.sword);
  assert.equal(portalLocked(camp, run, { dir: camp.exit }), false);
  assert.equal(portalLocked(rock, run, { dir: rock.exit }), true, 'his glass is still on the rock');
  run.unlockedGates.add(INTRO_GATES.glass);
  assert.equal(portalLocked(rock, run, { dir: rock.exit }), false);
});

test('the shards lie on the plaza; the robot and the sword beside each other in the camp, off its road: dry, reachable, clear', () => {
  const exits = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed), town = w.cube(w.start).map, camp = w.cube(step(w.start, town.exit)).map;
    exits.add(town.exit);
    assert.deepEqual(Object.keys(town.relics), ['shards']);
    assert.deepEqual(Object.keys(camp.relics), ['sword', 'robot']);
    for (const [r, spot, m, plan] of [[town.relics.shards, TOWN_SHARDS, town, town.town],
      [camp.relics.sword, CAMP_RELIC, camp, camp.merchantCamp], [camp.relics.robot, CAMP_ROBOT, camp, camp.merchantCamp]]) {
      const cell = Math.floor(r.z) * N + Math.floor(r.x);
      assert.equal(r.y, TOWN_LEVEL * LH);
      assert.deepEqual([r.x, r.z].map(v => +v.toFixed(6)), rotateTownPoint(...spot, plan.yaw).map(v => +v.toFixed(6)));
      assert.equal(m.safe[cell], 1, 'reachable');
      assert.equal(m.cols[cell][0].fluid, 0, 'dry');
      assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => containsXZ(b, r.x, r.z, 0.4)), 'nothing stands on it');
      assert.ok(!m.authoredProps.some(p => Math.hypot(p.x - r.x, p.z - r.z) < 0.9), 'no clutter on it');
    }
    const { sword, robot } = camp.relics, apart = Math.hypot(sword.x - robot.x, sword.z - robot.z);
    assert.ok(apart > 0.8 && apart < 1.8, `the sword stands beside the robot (${apart})`);
    // beside the camp's road, not on it: walking along it takes neither
    const road = camp.merchantCamp.paths[0].points, [a, b] = [road[0], road.at(-1)];
    for (const [what, q] of Object.entries(camp.relics)) {
      const along = Math.abs(a[0] - b[0]) < 1e-9 ? Math.abs(q.x - a[0]) : Math.abs(q.z - a[1]);
      assert.ok(along > 0.85, `the ${what} is ${along} off the road`);
    }
    // a new hero comes out of the inn's door
    assert.ok(town.doors.some(d => d.building === WAKE_HOUSE));
  }
  assert.deepEqual([...exits].sort(), [0, 1, 2, 3]);
});

test('the rock\'s room: a lone peak, his glass on top up its ladder, three snakes at its foot, no chest', async () => {
  const { state } = await import('./fixtures.js');
  const { enemySpots } = await import('../src/game/enemyspawn.js');
  const { ENEMY_KINDS } = await import('../src/core/enemies.js');
  for (let seed = 0; seed < 24; seed++) {
    const w = new World(seed), k = w.layout(0).route[2], m = state.map = w.cube(k).map, g = m.firstGlass;
    assert.equal(m.archetype, 'peak');
    assert.ok(g && g.glass && g.ladder, 'his glass and the ladder up to it');
    assert.ok(g.glass.y > g.ladder.y + 2, 'up on the rock');
    assert.ok(Math.abs(g.glass.y - g.ladder.top) < 0.6, 'where the ladder goes up to');
    const at = g.approach, top = m.floors.find(f => f.x === Math.floor(at.x) && f.z === Math.floor(at.z) && Math.abs(f.top * LH - at.y) < 0.6);
    assert.ok(top && m.safe[top.id] && Math.hypot(at.x - g.glass.x, at.z - g.glass.z) < 1.2, 'reachable');
    assert.equal(m.rewardSites.length, 0, 'his glass is no chest');
    const snakes = enemySpots(m, ENEMY_KINDS.snake);
    assert.equal(snakes.length, FIRST_GLASS.count);
    for (const s of snakes) {
      const d = Math.hypot(s.x - g.ladder.x, s.z - g.ladder.z);
      assert.ok(d < 4 && Math.abs(s.y - g.ladder.y) < 1, `at the rock's foot (${d})`);
      assert.equal(s.kind.type, 'snake');
    }
  }
});

test('his glass is there until it is found; the sword until it is taken, and for anyone without a weapon', () => {
  const run = createRun();
  assert.ok(glassThere(run)); assert.ok(swordThere(run, 3));
  run.unlockedGates.add(INTRO_GATES.glass);
  assert.ok(!glassThere(run));
  run.unlockedGates.add(INTRO_GATES.sword);
  assert.ok(!swordThere(run, 1)); assert.ok(swordThere(run, 0), 'never short of one');
  const dev = createRun();
  skipIntro(dev);
  assert.ok(!glassThere(dev) && !swordThere(dev, 1));
  // past it: further along the road than the rock (a branch off its room is not), or deeper
  const seed = 7, L = makeLayouts(seed)(0), camp = merchantCampKey(seed), rock = step(camp, seed % 4);
  assert.equal(pastIntro([TOWN_KEY, camp, 'interior:town_inn_a', rock], L), false);
  const branch = [...L.exists].find(k => L.routeIndex.get(k) === 2 && k !== rock);
  if (branch) assert.equal(pastIntro([TOWN_KEY, camp, rock, branch], L), false);
  assert.equal(pastIntro([TOWN_KEY, camp, rock, L.route[3]], L), true);
  assert.equal(pastIntro(['0,-1,0'], L), true);
});

test('a world starts at noon, in the light of the day', () => {
  assert.equal(START_CLOCK, DAYTIMES.noon);
  assert.equal(createRun().clock, START_CLOCK);
  assert.equal(checkWorld(createWorld(3)).run.clock, START_CLOCK);
  assert.equal(nightAt(START_CLOCK), 0); assert.equal(glowAt(START_CLOCK), 0);
});

test('a new hero comes empty-handed; the sword it finds is the glassmaker\'s, and an old save\'s Old Sword becomes his', () => {
  const h = createHero('Mia', { id: 'h-1' });
  assert.equal(h.inventory.equipped, null);
  assert.ok(createPlayerStats().inventory.equipped, 'the tests\' heroes and the dev tools\' have it in hand');
  assert.equal(fixedWeapon(OLD_SWORD.id).gen.name, "Glassmaker's Old Sword");
  const old = createHero('Ben', { id: 'h-2' });
  old.inventory = createPlayerStats().inventory;
  const slot = old.inventory.slots.find(s => s?.itemId === OLD_SWORD.id);
  slot.gen.name = 'Old Sword';
  const back = checkHero(JSON.parse(JSON.stringify(old)));
  assert.equal(back.inventory.slots.find(s => s?.itemId === OLD_SWORD.id).gen.name, "Glassmaker's Old Sword");
});

test('the sword pulled out replaces one of his already in the bag, where it is; else it takes a free slot', async () => {
  const { createInventory, equipItem, addInstance, assignBar, barIndexOf, ownedItem } = await import('../src/core/inventory.js');
  const count = inv => inv.slots.filter(s => s?.itemId === OLD_SWORD.id).length;
  // empty-handed: into the bag
  const fresh = createInventory(), got = pullSword(fresh);
  assert.equal(got.replaced, false); assert.equal(count(fresh), 1);
  // carrying his sword from another world (enchanted there, on the quick bar, in hand): replaced
  const inv = createPlayerStats().inventory, had = inv.slots.find(s => s?.itemId === OLD_SWORD.id);
  had.gen.enchant = 'something'; assignBar(inv, 2, had.instanceId);
  const at = inv.slots.indexOf(had), bar = barIndexOf(inv, had);
  const again = pullSword(inv);
  assert.deepEqual(again, { id: had.instanceId, replaced: true });
  assert.equal(count(inv), 1, 'never a second one');
  assert.equal(inv.slots.indexOf(ownedItem(inv, had.instanceId)), at);
  assert.equal(inv.equipped, had.instanceId); assert.equal(barIndexOf(inv, ownedItem(inv, had.instanceId)), bar);
  assert.equal(ownedItem(inv, had.instanceId).gen.enchant, undefined, 'a fresh one');
  // a full bag does not matter when there is one to replace; with none, it is refused
  while (addInstance(inv, fixedWeapon('weapon_sword_short')));
  assert.ok(pullSword(inv));
  const full = createInventory();
  while (addInstance(full, fixedWeapon('weapon_sword_short')));
  assert.equal(pullSword(full), null);
  // the one in hand is the one replaced, when there are two
  const two = createInventory(), a = addInstance(two, fixedWeapon(OLD_SWORD.id)), b = addInstance(two, fixedWeapon(OLD_SWORD.id));
  equipItem(two, b);
  assert.equal(pullSword(two).id, b); assert.ok(a);
});

test('a recording is told whole once it begins, and is cut short by the next or by leaving its place', async () => {
  const { RECORDINGS, recordingsHeard, outOfPlace, placeOf, MOMENTS } = await import('../src/core/narration.js');
  // (game/narrator.js does it, which the tests cannot load: it draws)
  assert.ok(MOMENTS.recording.cuts && MOMENTS.recording.whole);
  assert.deepEqual(RECORDINGS.slice(0, 2).map(r => r.id), ['glass', 'camp'], 'his words are in his glass: the sword says nothing');
  assert.deepEqual(RECORDINGS.slice(2).map(r => r.id), Object.values(GLASS).flat(), 'the rest lie in the depths, in the order of the story');
  assert.deepEqual(recordingsHeard(new Set([recordingLines('glass')[0].id])).map(r => r.id), ['glass']);
  const town = { town: {} }, house = { interior: true }, camp = { merchantCamp: {} }, road = {};
  assert.deepEqual([town, house, camp, road].map(placeOf), ['town', 'town', 'camp', null]);
  const [glass] = recordingLines('glass'), [onTheRoad] = recordingLines('camp');
  for (const line of [glass, onTheRoad])
    assert.ok(!outOfPlace(line, road) && outOfPlace(line, camp) && outOfPlace(line, town) && outOfPlace(line, { depth: 1 }), 'leaving the road cuts it');
  // his glass in the depths: leaving the depth cuts it short (for the town too, at depth 0)
  const [deep] = recordingLines('red-light'), [onRoad] = recordingLines('breath');
  assert.ok(!outOfPlace(deep, { depth: 1 }) && outOfPlace(deep, { depth: 2 }) && outOfPlace(deep, town));
  assert.ok(!outOfPlace(onRoad, road) && outOfPlace(onRoad, { ...town, depth: 0 }) && outOfPlace(onRoad, camp));
});

test('his glass in the depths: two of each depth\'s three, one on the way, one hidden, gone once heard', () => {
  for (const seed of [1, 2, 3, 77]) for (const [d, pool] of Object.entries(GLASS)) {
    const at = glassAt(seed, Number(d));
    assert.equal(at.length, PER_DEPTH);
    assert.equal(new Set(at).size, at.length);
    assert.ok(at.every(p => pool.includes(p)));
    assert.deepEqual(glassAt(seed, Number(d)), at, 'from the seed alone');
  }
  assert.deepEqual(glassAt(1, 20), [], 'none at the core: its last recording is the ending\'s');
  const seen = new Set(Array.from({ length: 40 }, (_, s) => glassAt(s, 0).join()));
  assert.ok(seen.size > 2, 'worlds place different ones');
  const map = { spots: [{ kind: 'hide', depth: 1 }, { kind: 'glass', depth: 1, glass: 0, anchor: {} }, { kind: 'glass', depth: 1, glass: 1, anchor: {} }] };
  const run = { told: new Set() };
  assert.deepEqual(depthGlassIn(map, run, 5).map(g => g.part), glassAt(5, 1));
  // depth 0's third: the recording that came up with his sword, past the rock, on the way
  assert.deepEqual(depthGlassIn({ spots: [{ kind: 'glass', depth: 0, part: 'camp', way: true, anchor: {} }] }, run, 5).map(g => g.part), ['camp']);
  for (let seed = 0; seed < 12; seed++) {
    const L = makeLayouts(seed)(0), camp = L.spotList.filter(s => s.kind === 'glass' && s.part === 'camp');
    assert.equal(camp.length, 1);
    assert.ok(camp[0].way && L.routeIndex.get(camp[0].key) >= 3, 'past the rock, on the way');
    assert.ok(!L.spotList.some(s => s.kind === 'glass' && s.key === L.firstGlass), 'no other glass on the rock');
  }
  run.told.add(recordingLines(glassAt(5, 1)[0])[2].id);
  assert.deepEqual(depthGlassIn(map, run, 5).map(g => g.part), glassAt(5, 1).slice(1), 'heard: its glass is gone');
  assert.ok(isStoryNews('glass') && isStoryNews('red-light') && !isStoryNews('nonsense'));
});

test('playing together the beginning is told to everyone, through the host', () => {
  assert.ok(RELAYED.has('story'));
  assert.deepEqual(STORY_NEWS, ['glass', 'sword', 'camp']);
});
