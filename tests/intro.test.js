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
import { TOWN_KEY, TOWN_LEVEL, TOWN_RELIC, CAMP_GLASS, CAMP_RELIC, CAMP_ROBOT, merchantCampKey, rotateTownPoint } from '../src/world/town.js';
import { INTRO_GATES, INTRO_LOCKED, STORY_NEWS, glassThere, campGlassThere, swordThere, pullSword, skipIntro, pastIntro, depthGlassIn, isStoryNews } from '../src/core/intro.js';
import { GLASS, PER_DEPTH, glassAt } from '../src/core/glass.js';
import { recordingLines } from '../src/core/narration.js';
import { portalLocked, lockMessage } from '../src/core/guardians.js';
import { createRun, createPlayerStats } from '../src/core/progression.js';
import { createWorld, checkWorld, createHero, checkHero } from '../src/core/save.js';
import { START_CLOCK, nightAt, glowAt, DAYTIMES } from '../src/core/daycycle.js';
import { OLD_SWORD } from '../src/core/items.js';
import { fixedWeapon } from '../src/core/gear/generate.js';
import { RELAYED } from '../src/net/protocol.js';

test('the town\'s way out opens for the glass, the merchant camp\'s for the sword', () => {
  for (let seed = 0; seed < 40; seed++) {
    const L = makeLayouts(seed)(0), camp = merchantCampKey(seed);
    assert.equal(L.route[0], TOWN_KEY); assert.equal(L.route[1], camp);
    assert.equal(L.gateFaces.get(faceKey(TOWN_KEY, L.exit.get(TOWN_KEY))), INTRO_GATES.glass);
    assert.equal(L.gateFaces.get(faceKey(camp, L.exit.get(camp))), INTRO_GATES.sword);
  }
  const w = new World(5), town = w.cube(w.start).map, camp = w.cube(step(w.start, town.exit)).map, run = createRun();
  assert.equal(portalLocked(town, run, { dir: town.exit }), true);
  assert.equal(portalLocked(camp, run, { dir: town.exit ^ 1 }), true, 'nor back into town from the camp');
  assert.equal(portalLocked(camp, run, { dir: camp.exit }), true);
  assert.equal(lockMessage(town, town.exit), INTRO_LOCKED[INTRO_GATES.glass]);
  assert.equal(lockMessage(camp, camp.exit), INTRO_LOCKED[INTRO_GATES.sword]);
  run.unlockedGates.add(INTRO_GATES.glass);
  assert.equal(portalLocked(town, run, { dir: town.exit }), false);
  assert.equal(portalLocked(camp, run, { dir: camp.exit }), true, 'the sword is still in the ground');
  run.unlockedGates.add(INTRO_GATES.sword);
  assert.equal(portalLocked(camp, run, { dir: camp.exit }), false);
});

test('the glass floats over the plaza near the spawn, the camp\'s near its way in, the sword stands beside the camp\'s road: dry, reachable, clear', () => {
  const exits = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed), town = w.cube(w.start).map, camp = w.cube(step(w.start, town.exit)).map;
    exits.add(town.exit);
    assert.deepEqual(Object.keys(town.relics), ['glass']);
    assert.deepEqual(Object.keys(camp.relics), ['glass', 'sword', 'robot']);
    for (const [r, spot, m, plan] of [[town.relics.glass, TOWN_RELIC, town, town.town], [camp.relics.glass, CAMP_GLASS, camp, camp.merchantCamp],
      [camp.relics.sword, CAMP_RELIC, camp, camp.merchantCamp], [camp.relics.robot, CAMP_ROBOT, camp, camp.merchantCamp]]) {
      const cell = Math.floor(r.z) * N + Math.floor(r.x);
      assert.equal(r.y, TOWN_LEVEL * LH);
      assert.deepEqual([r.x, r.z].map(v => +v.toFixed(6)), rotateTownPoint(...spot, plan.yaw).map(v => +v.toFixed(6)));
      assert.equal(m.safe[cell], 1, 'reachable');
      assert.equal(m.cols[cell][0].fluid, 0, 'dry');
      assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => containsXZ(b, r.x, r.z, 0.4)), 'nothing stands on it');
      assert.ok(!m.authoredProps.some(p => Math.hypot(p.x - r.x, p.z - r.z) < 0.9), 'no clutter on it');
    }
    const spawn = town.portals.find(p => p.kind === 'spawn');
    const d = Math.hypot(town.relics.glass.x - spawn.x - 0.5, town.relics.glass.z - spawn.z - 0.5);
    assert.ok(d > 1 && d < 3, 'a few steps from where a new hero stands');
    // the camp's glass a few steps in from the town's gate (the camp's second: the first is its exit)
    const into = camp.portals[1], g = camp.relics.glass;
    assert.notEqual(into.dir, camp.exit);
    const steps = Math.hypot(g.x - into.x - 0.5, g.z - into.z - 0.5);
    assert.ok(steps > 2 && steps < 4.5, `the camp's glass is ${steps} from the way in`);
    // beside the camp's road, not on it: walking along it takes neither the glass nor the sword
    const road = camp.merchantCamp.paths[0].points, [a, b] = [road[0], road.at(-1)];
    for (const [what, q] of Object.entries(camp.relics)) {
      const along = Math.abs(a[0] - b[0]) < 1e-9 ? Math.abs(q.x - a[0]) : Math.abs(q.z - a[1]);
      assert.ok(along > 0.85, `the ${what} is ${along} off the road`);
    }
  }
  assert.deepEqual([...exits].sort(), [0, 1, 2, 3]);
});

test('a glass is there until it is found; the sword until it is taken, and for anyone without a weapon', async () => {
  const { recordingLines } = await import('../src/core/narration.js');
  const run = createRun();
  assert.ok(glassThere(run)); assert.ok(campGlassThere(run)); assert.ok(swordThere(run, 3));
  run.told.add(recordingLines('camp')[0].id);
  assert.ok(!campGlassThere(run), 'its recording heard');
  run.unlockedGates.add(INTRO_GATES.glass);
  assert.ok(!glassThere(run));
  run.unlockedGates.add(INTRO_GATES.sword);
  assert.ok(!swordThere(run, 1)); assert.ok(swordThere(run, 0), 'never short of one');
  const dev = createRun();
  skipIntro(dev);
  assert.ok(!glassThere(dev) && !swordThere(dev, 1));
  const seed = 7, camp = merchantCampKey(seed), road = step(camp, seed % 4);
  assert.equal(pastIntro([TOWN_KEY, camp, 'interior:town_inn_a'], seed), false);
  assert.equal(pastIntro([TOWN_KEY, camp, road], seed), true);
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
  const [glass] = recordingLines('glass'), [inCamp] = recordingLines('camp');
  assert.ok(!outOfPlace(glass, town) && !outOfPlace(glass, house) && outOfPlace(glass, camp), 'leaving the town cuts the glass\'s');
  assert.ok(outOfPlace(inCamp, road) && !outOfPlace(inCamp, camp));
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
  run.told.add(recordingLines(glassAt(5, 1)[0])[2].id);
  assert.deepEqual(depthGlassIn(map, run, 5).map(g => g.part), glassAt(5, 1).slice(1), 'heard: its glass is gone');
  assert.ok(isStoryNews('glass') && isStoryNews('red-light') && !isStoryNews('nonsense'));
});

test('playing together the beginning is told to everyone, through the host', () => {
  assert.ok(RELAYED.has('story'));
  assert.deepEqual(STORY_NEWS, ['glass', 'sword', 'camp']);
});
