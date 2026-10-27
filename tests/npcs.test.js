import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts } from '../src/world/layout.js';
import { World } from '../src/world/world.js';
import { residentOf, residentsOf, ROLES, NAMES, npcGiver, isNpcGiver, spotOfGiver } from '../src/core/npcs.js';
import { createQuestLog, refreshOffers, meet, giverProfile, giverOf, accept, checkQuestLog, packQuestLog, giverName } from '../src/core/quests.js';
import { WEARABLES, outfitOf } from '../src/core/items.js';
import { say } from '../src/i18n/i18n.js';

const L = makeLayouts(123);
const ctx = { seed: 123, layout: L, gates: new Set(), now: 1 };

test('somebody lives at every seat and camp, nobody at a hiding place or his glass, the same for everyone', () => {
  for (let d = 0; d <= 20; d++) for (const s of L(d).spotList) {
    const npc = residentOf(s);
    if (s.kind === 'hide' || s.kind === 'glass') { assert.equal(npc, null); continue; }
    assert.deepEqual(residentOf(structuredClone(s)), npc, 'from the spot alone');
    assert.ok(ROLES[npc.role] && NAMES.includes(npc.name) && say(npc.title).startsWith(npc.name));
    assert.ok(d >= ROLES[npc.role].depths[0] && d <= ROLES[npc.role].depths[1], `a ${npc.role} at depth ${d}`);
    assert.ok(npc.outfit.every(id => WEARABLES.some(w => w.id === id)));
    assert.doesNotThrow(() => outfitOf(npc.outfit));
    assert.equal(spotOfGiver(npc.giver), s.id);
    assert.ok(isNpcGiver(npc.giver) && giverOf(npc) === npc.giver);
  }
});

test('the residents stand where their cube put the seat and the camp', () => {
  const world = new World(123), [key] = [...world.layout(1).spots].find(([, list]) => list.some(s => s.kind === 'camp'));
  const map = world.cube(key).map, people = residentsOf(map.spots);
  const camp = map.spots.find(s => s.kind === 'camp'), resident = people.find(p => p.spot === camp.id);
  assert.deepEqual([resident.x, resident.z], [camp.places[0].x, camp.places[0].z], 'at the fire');
  for (const s of map.spots.filter(s => s.kind === 'seat')) {
    const p = people.find(n => n.spot === s.id);
    assert.deepEqual([p.x, p.z, p.yaw], [s.anchor.x, s.anchor.z, s.anchor.yaw], 'on the seat, facing who comes');
  }
});

test('a resident once met offers quests about its depth and the next', () => {
  const log = createQuestLog();
  const seats = [3, 8, 15].map(d => L(d).spotList.find(s => s.kind === 'seat'));
  for (const s of seats) {
    const g = npcGiver(s.id), profile = giverProfile(g, ctx);
    assert.deepEqual(profile.title, residentOf(s).title);
    log.deepest = s.depth;
    refreshOffers(log, ctx);
    assert.ok(!log.list.some(q => q.giver === g), 'nothing before they are met');
    assert.ok(meet(log, g));
    assert.ok(!meet(log, g), 'met once');
    refreshOffers(log, ctx);
    const mine = log.list.filter(q => q.giver === g);
    assert.ok(mine.length <= 1);
    for (const q of mine) {
      assert.ok(q.depth === s.depth || q.depth === s.depth + 1, `${say(q.title)} at depth ${q.depth} from depth ${s.depth}`);
      assert.deepEqual(giverName(q), residentOf(s).title);
      accept(log, q.id);
    }
  }
  const back = checkQuestLog(JSON.parse(JSON.stringify(packQuestLog(log))));
  assert.deepEqual(back.met, log.met);
  assert.deepEqual(back.list.map(q => q.from), log.list.map(q => q.from));
  assert.ok(!meet(log, 'innkeeper'), 'the villagers need no meeting');
});
