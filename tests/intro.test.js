// The beginning (core/intro.js, docs/story.md "The beginning"): the glassmaker's glass on the town
// plaza and his old sword in the merchant camp, each behind a gate of its own; a world starts at noon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LH } from '../src/core/constants.js';
import { containsXZ } from '../src/core/blockers.js';
import { World } from '../src/world/world.js';
import { makeLayouts } from '../src/world/layout.js';
import { step, faceKey } from '../src/world/coords.js';
import { TOWN_KEY, TOWN_LEVEL, TOWN_RELIC, CAMP_RELIC, merchantCampKey, rotateTownPoint } from '../src/world/town.js';
import { INTRO_GATES, INTRO_LOCKED, STORY_NEWS, glassThere, swordThere, skipIntro, pastIntro } from '../src/core/intro.js';
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

test('the glass floats over the plaza near the spawn, the sword stands beside the camp\'s road: dry, reachable, clear', () => {
  const exits = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const w = new World(seed), town = w.cube(w.start).map, camp = w.cube(step(w.start, town.exit)).map;
    exits.add(town.exit);
    for (const [m, spot, plan] of [[town, TOWN_RELIC, town.town], [camp, CAMP_RELIC, camp.merchantCamp]]) {
      const r = m.relic, cell = Math.floor(r.z) * N + Math.floor(r.x);
      assert.equal(r.y, TOWN_LEVEL * LH);
      assert.deepEqual([r.x, r.z].map(v => +v.toFixed(6)), rotateTownPoint(...spot, plan.yaw).map(v => +v.toFixed(6)));
      assert.equal(m.safe[cell], 1, 'reachable');
      assert.equal(m.cols[cell][0].fluid, 0, 'dry');
      assert.ok(!new Set(m.staticBlockers.flat()).values().some(b => containsXZ(b, r.x, r.z, 0.4)), 'nothing stands on it');
      assert.ok(!m.authoredProps.some(p => Math.hypot(p.x - r.x, p.z - r.z) < 0.9), 'no clutter on it');
    }
    const spawn = town.portals.find(p => p.kind === 'spawn');
    const d = Math.hypot(town.relic.x - spawn.x - 0.5, town.relic.z - spawn.z - 0.5);
    assert.ok(d > 1 && d < 3, 'a few steps from where a new hero stands');
    // beside the camp's road, not on it: walking along it does not take the sword
    const road = camp.merchantCamp.paths[0].points, [a, b] = [road[0], road.at(-1)];
    const along = Math.abs(a[0] - b[0]) < 1e-9 ? Math.abs(camp.relic.x - a[0]) : Math.abs(camp.relic.z - a[1]);
    assert.ok(along > 1, `the sword is ${along} off the road`);
  }
  assert.deepEqual([...exits].sort(), [0, 1, 2, 3]);
});

test('the glass is there until it is found; the sword until it is taken, and for anyone without a weapon', () => {
  const run = createRun();
  assert.ok(glassThere(run)); assert.ok(swordThere(run, 3));
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

test('a recording is told whole once it begins, and is cut short by the next or by leaving its place', async () => {
  const { RECORDINGS, recordingLines, recordingsHeard, outOfPlace, placeOf, MOMENTS } = await import('../src/core/narration.js');
  // (game/narrator.js does it, which the tests cannot load: it draws)
  assert.ok(MOMENTS.recording.cuts && MOMENTS.recording.whole);
  assert.deepEqual(RECORDINGS.map(r => r.id), ['glass', 'camp', 'sword']);
  assert.deepEqual(recordingsHeard(new Set([recordingLines('glass')[0].id])).map(r => r.id), ['glass']);
  const town = { town: {} }, house = { interior: true }, camp = { merchantCamp: {} }, road = {};
  assert.deepEqual([town, house, camp, road].map(placeOf), ['town', 'town', 'camp', null]);
  const [glass] = recordingLines('glass'), [inCamp] = recordingLines('camp'), [sword] = recordingLines('sword');
  assert.ok(!outOfPlace(glass, town) && !outOfPlace(glass, house) && outOfPlace(glass, camp), 'leaving the town cuts the glass\'s');
  assert.ok(outOfPlace(inCamp, road) && !outOfPlace(inCamp, camp));
  assert.ok(!outOfPlace(sword, road), 'the sword\'s goes along');
});

test('playing together the beginning is told to everyone, through the host', () => {
  assert.ok(RELAYED.has('story'));
  assert.deepEqual(STORY_NEWS, ['glass', 'sword', 'camp']);
});
