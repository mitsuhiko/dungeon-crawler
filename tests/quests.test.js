import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLayouts } from '../src/world/layout.js';
import { createQuestLog, refreshOffers, makeQuest, accept, archive, restart, fail, handIn, questEvent, settle, goalDone,
  progressOf, restoreProgress, checkQuestLog, packQuestLog, giverMark, questLists, carried, questGoalsIn, livingAt,
  GIVERS, MAX_OFFERS, TOWN_OFFERS, GATHER, questRewards, GOALS } from '../src/core/quests.js';
import { questPlan, perDepth, BUILT, clueOf, campOf, TOWN } from '../src/core/questplan.js';
import { npcGiver, isNpcGiver } from '../src/core/npcs.js';
import { createWorld, checkWorld } from '../src/core/save.js';
import { mulberry32 } from '../src/core/util.js';
import { ITEMS } from '../src/core/items.js';
import { say } from '../src/i18n/i18n.js';

const layouts = new Map();
const ctxOf = (seed, gates = new Set(), chests = new Set()) => {
  if (!layouts.has(seed)) layouts.set(seed, makeLayouts(seed));
  return { seed, layout: layouts.get(seed), gates, chests, now: 1 };
};
const roundTrip = x => JSON.parse(JSON.stringify(x));
// a quest of this kind at this depth, from a giver who could give it (the plan's slots aside)
function questOf(seed, kind, depth, deepest = depth - 1) {
  const ctx = ctxOf(seed), log = createQuestLog();
  log.deepest = Math.max(0, deepest);
  const camps = [depth, depth - 1, depth - 2].filter(d => d >= 0).flatMap(d => ctx.layout(d).spotList).filter(s => s.kind === 'camp');
  const giver = kind === 'rescue' ? npcGiver(camps[0].id) : 'innkeeper';
  const q = makeQuest(log, ctx, giver, { id: `${depth}:99`, depth, kind });
  assert.ok(q, `a ${kind} quest at depth ${depth}`);
  assert.equal(q.kind, kind);
  log.list.push(q);
  return { ctx, log, q };
}

test('the plan: about a hundred quests, by depth, from the villagers and the people out in the world', () => {
  for (const seed of [1, 123, 4242]) {
    const ctx = ctxOf(seed), plan = questPlan(seed, ctx.layout);
    assert.equal(plan.slots.length, Array.from({ length: 21 }, (_, d) => perDepth(d)).reduce((a, b) => a + b));
    assert.ok(plan.slots.length >= 95 && plan.slots.length <= 105);
    assert.deepEqual(questPlan(seed, ctx.layout), plan, 'the same plan again');
    const town = plan.slots.filter(s => TOWN.includes(s.giver)).length;
    assert.ok(town >= 25 && town <= 50, `${town} from the villagers`);
    for (const s of plan.slots) {
      assert.ok(BUILT.has(s.kind), s.kind);
      assert.ok(TOWN.includes(s.giver) || isNpcGiver(s.giver));
      if (s.kind === 'rescue') assert.ok(campOf(ctx.layout, s.giver), 'somebody lost is asked for by somebody at a camp');
      if (s.kind === 'defense') assert.ok(ctx.layout(s.depth).spotList.some(o => o.kind === 'outpost' && (o.annex || npcGiver(o.id) === s.giver)),
        'by its keeper (an annex: by somebody of the depth)');
    }
    const outposts = Array.from({ length: 21 }, (_, d) => ctx.layout(d).spotList.filter(o => o.kind === 'outpost')).flat();
    assert.equal(plan.slots.filter(s => s.kind === 'defense').length, outposts.length, 'every outpost has its defense');
    for (const [giver, slots] of plan.byGiver) assert.deepEqual(slots.map(s => s.depth), [...slots.map(s => s.depth)].sort((a, b) => a - b), giver);
  }
});

test('offers follow the plan and are about what the world has, never two about one thing', () => {
  for (const seed of [5, 77, 4242]) {
    const ctx = ctxOf(seed), plan = questPlan(seed, ctx.layout), log = createQuestLog();
    log.met = [...new Set(plan.slots.map(s => s.giver).filter(isNpcGiver))];
    for (let deepest = 0; deepest <= 20; deepest++) {
      log.deepest = deepest;
      for (let round = 0; round < 6; round++) {
        log.townOpen = true;   // (back in town from below)
        refreshOffers(log, ctx);
        for (const q of log.list) if (q.state === 'offered') {
          assert.ok(q.depth <= deepest + 2, `${q.id} at depth ${q.depth}, deepest ${deepest}`);
          q.state = 'done';
        }
      }
    }
    assert.equal(log.used.length, plan.slots.length, 'every slot offered or passed over');
    assert.ok(log.list.length >= plan.slots.length * 0.9, `${log.list.length} quests made`);
    const again = createQuestLog();
    Object.assign(again, { deepest: 3, met: log.met });
    refreshOffers(again, ctx);
    const twice = createQuestLog();
    Object.assign(twice, { deepest: 3, met: log.met });
    refreshOffers(twice, ctx);
    assert.deepEqual(again.list, twice.list, 'the same offers in the same world');
    for (const giver of Object.keys(GIVERS)) assert.ok(again.list.filter(q => q.giver === giver).length <= MAX_OFFERS);
    for (const q of log.list) {
      const s = q.stages[0], L = ctx.layout(q.depth);
      assert.ok(GOALS.includes(s.goal));
      if (q.kind === 'guardian') assert.ok(L.guardians.has(s.key));
      if (q.kind === 'horde') assert.ok(L.hordes.has(s.key));
      if (q.kind === 'landmark') assert.ok(L.sitePlans.get(s.key)?.[0]?.landmark);
      if (s.spot) assert.ok(L.spotList.some(p => p.id === s.spot && p.kind === (s.goal === 'defend' ? 'outpost' : 'hide') && p.key === s.key),
        'on a hiding place (a defense: at its outpost)');
      if (s.item) assert.equal(ITEMS[s.item].category, 'quest');
      if (s.goal === 'gather') s.spots.forEach((id, i) => assert.ok(L.spotList.some(p => p.id === id && p.kind === 'hide' && p.key === s.keys[i])));
      const words = [q.title, q.text, s.text].map(say).join(' ');
      assert.ok(say(q.title) && say(q.text) && say(s.text) && !/undefined|NaN|null|[{}]|\[object/.test(words), words);
      assert.ok(q.rewards.xp > 0);
    }
  }
});

test('a giver has one quest out at a time: the next only once the one taken is done', () => {
  const ctx = ctxOf(7), log = createQuestLog();
  log.deepest = 20;
  const offers = () => log.list.filter(q => q.giver === 'innkeeper' && q.state === 'offered');
  refreshOffers(log, ctx, ['innkeeper']);
  const [q] = offers();
  assert.ok(q, 'an offer');
  accept(log, q.id);
  for (const state of ['active', 'ready', 'failed']) {
    q.state = state;
    refreshOffers(log, ctx, ['innkeeper']);
    assert.equal(offers().length, 0, `nothing new while one is ${state}`);
  }
  q.state = 'active'; q.archived = true;
  refreshOffers(log, ctx, ['innkeeper']);
  assert.equal(offers().length, 0, 'nor while one is archived');
  q.archived = false; q.state = 'done';
  refreshOffers(log, ctx, ['innkeeper']);
  assert.equal(offers().length, 0, 'the town brings out new offers only when the party comes back from below');
  questEvent(log, { kind: 'visit', depth: 1 });
  questEvent(log, { kind: 'visit', depth: 0 });
  // (the villagers take turns: the ones who gave fewest come first)
  for (const g of Object.keys(GIVERS)) if (g !== 'innkeeper') log.list.push({ ...q, id: `x:${g}`, giver: g, state: 'done' });
  refreshOffers(log, ctx, ['innkeeper']);
  assert.equal(offers().length, 1, 'the next once it is done');
});

test('a clue about a place says what the layout knows of it, never where it is on a map', () => {
  const ctx = ctxOf(123);
  for (let d = 0; d <= 20; d++) for (const s of ctx.layout(d).spotList) {
    const clue = say(clueOf(ctx.layout, s));
    assert.ok(clue.length > 5 && !/\d+,\s*-?\d+/.test(clue), clue);
  }
});

test('a reach quest is done by getting there, and paid by its giver', () => {
  const { ctx, log, q } = questOf(31, 'reach', 2, 1);
  assert.ok(accept(log, q.id, ctx));
  questEvent(log, { kind: 'visit', depth: 1 }, ctx);
  assert.equal(q.state, 'active', 'not deep enough yet');
  questEvent(log, { kind: 'visit', depth: 2 }, ctx);
  assert.equal(q.state, 'ready', 'back to the giver');
  assert.equal(giverMark(log, q.giver), '?');
  assert.equal(handIn(log, 'nope'), null);
  assert.equal(handIn(log, q.id, 7), q);
  assert.equal(q.state, 'done');
  assert.equal(handIn(log, q.id), null, 'paid once');
});

test('guardian, horde and landmark quests', () => {
  const g = questOf(2, 'guardian', 2);
  accept(g.log, g.q.id, g.ctx);
  assert.equal(g.q.state, 'active');
  g.ctx.gates.add(g.q.stages[0].key);
  settle(g.log, g.ctx);
  assert.equal(g.q.state, 'ready', 'the gate is open');
  g.ctx.gates.clear();

  const h = questOf(3, 'horde', 2);
  accept(h.log, h.q.id);
  questEvent(h.log, { kind: 'horde', key: 'elsewhere' });
  assert.equal(h.q.state, 'active');
  questEvent(h.log, { kind: 'horde', key: h.q.stages[0].key });
  assert.equal(h.q.state, 'ready');

  const l = questOf(4, 'landmark', 2);
  accept(l.log, l.q.id);
  questEvent(l.log, { kind: 'landmark', key: l.q.stages[0].key });
  assert.equal(l.q.state, 'ready');
});

test('a thing to find shows on its hiding place while it is the goal, is carried once found', () => {
  const { log, q } = questOf(6, 'find', 3);
  const s = q.stages[0];
  assert.deepEqual(questGoalsIn(log, s.key), [], 'nothing before the quest is taken');
  accept(log, q.id);
  assert.deepEqual(questGoalsIn(log, s.key).map(g => g.quest), [q]);
  assert.deepEqual(carried(q), []);
  questEvent(log, { kind: 'found', quest: 'nope' });
  assert.equal(q.state, 'active');
  questEvent(log, { kind: 'found', quest: q.id });
  assert.equal(q.state, 'ready');
  assert.deepEqual(carried(q), [s.item], 'the quest carries it back');
  assert.deepEqual(questGoalsIn(log, s.key), [], 'gone from its place');
  handIn(log, q.id);
  assert.deepEqual(carried(q), []);
});

test('somebody lost is found, pays on the spot and goes to live at the camp of whoever asked', () => {
  const { log, q } = questOf(8, 'rescue', 4);
  assert.equal(q.payout, 'spot');
  accept(log, q.id);
  const paid = questEvent(log, { kind: 'rescued', quest: q.id });
  assert.deepEqual(paid, [q], 'paid at once');
  assert.equal(q.state, 'done');
  const camp = q.giver.slice(4);
  assert.deepEqual(livingAt(log, camp).map(p => p.name), [q.stages[0].person.name]);
  questEvent(log, { kind: 'rescued', quest: q.id });
  assert.equal(log.living.length, 1, 'once');
});

test('a treasure map: the chest is the reward, opening it ends the quest', () => {
  const ctx = ctxOf(9), { log, q } = questOf(9, 'treasure', 2);
  assert.equal(q.payout, 'self');
  assert.equal(q.rewards.copper, 0);
  assert.deepEqual(q.rewards.items, []);
  accept(log, q.id, ctx);
  assert.deepEqual(carried(q), ['quest_map_scrap']);
  ctx.chests.add(q.stages[0].chest);
  const paid = settle(log, ctx);
  assert.deepEqual(paid, [q]);
  assert.equal(q.state, 'done');
  ctx.chests.clear();
});

test('archiving pauses a quest; unarchiving catches up with the world', () => {
  const h = questOf(11, 'horde', 1), l = questOf(12, 'landmark', 1);
  accept(h.log, h.q.id); accept(l.log, l.q.id);
  assert.ok(archive(h.log, h.q.id, true));
  assert.ok(!archive(h.log, h.q.id, true), 'archived already');
  assert.deepEqual(questLists(h.log).archived.map(q => q.id), [h.q.id]);
  questEvent(h.log, { kind: 'horde', key: h.q.stages[0].key });
  assert.equal(h.q.state, 'active', 'paused while archived');
  archive(h.log, h.q.id, false);
  assert.equal(h.q.state, 'ready', 'the horde is broken: done once back');
  archive(l.log, l.q.id, true);
  questEvent(l.log, { kind: 'landmark', key: l.q.stages[0].key });
  archive(l.log, l.q.id, false);
  assert.equal(l.q.state, 'active', 'standing there while it was archived does not count');
  const f = questOf(13, 'find', 2);
  assert.ok(!archive(f.log, f.q.id, true), 'offers cannot be archived');
});

test('a failed quest starts again from the beginning', () => {
  const { log, q } = questOf(13, 'landmark', 1);
  accept(log, q.id);
  assert.ok(fail(log, q.id));
  assert.equal(q.state, 'failed');
  assert.ok(restart(log, q.id));
  assert.equal(q.state, 'active');
  assert.equal(q.stage, 0);
  assert.ok(q.stages.every(s => !s.done));
  assert.ok(!restart(log, q.id), 'only failed quests restart');
});

test('a death takes back the quest progress made in the cube since coming in', () => {
  const h = questOf(14, 'horde', 1);
  accept(h.log, h.q.id);
  const mark = progressOf(h.log);
  questEvent(h.log, { kind: 'horde', key: h.q.stages[0].key });
  assert.equal(h.q.state, 'ready');
  assert.ok(restoreProgress(h.log, mark));
  assert.equal(h.q.state, 'active');
  assert.ok(!h.log.broken.includes(h.q.stages[0].key), 'the horde is back');
  assert.ok(!goalDone(h.q.stages[0], h.log, new Set()));
  const f = questOf(15, 'find', 2);
  accept(f.log, f.q.id);
  const before = progressOf(f.log);
  questEvent(f.log, { kind: 'found', quest: f.q.id });
  restoreProgress(f.log, before);
  assert.deepEqual(carried(f.q), [], 'the thing lies there again');
});

test('the quest log is saved with the world and checked when read', () => {
  const { log, q } = questOf(15, 'rescue', 4);
  accept(log, q.id);
  questEvent(log, { kind: 'rescued', quest: q.id });
  log.used.push('4:1');
  const w = createWorld(15, { id: 'w-1', now: 1 });
  w.run.quests = packQuestLog(log);
  const back = checkWorld(roundTrip(w));
  assert.deepEqual(back.run.quests, roundTrip(packQuestLog(log)));
  assert.deepEqual(checkWorld(roundTrip(createWorld(1, { id: 'w-2' }))).run.quests, createQuestLog(), 'a world from before quests');
  const damaged = roundTrip(packQuestLog(log));
  damaged.list.push({ id: 'x', giver: 'nobody' }, { ...damaged.list[0], state: 'weird' }, 5);
  damaged.list[0].rewards.items.push({ itemId: 'no_such_item', count: 1 });
  damaged.living.push({ id: 'y', name: 7 });
  const c = checkQuestLog(damaged);
  assert.equal(c.list.length, log.list.length, 'damaged quests are left out');
  assert.equal(c.living.length, 1);
  assert.ok(c.list[0].rewards.items.every(i => ITEMS[i.itemId]));
});

test('rewards grow with the depth and the difficulty', () => {
  const r = d => questRewards(mulberry32(1), ...d);
  assert.ok(r([5, 'hard']).xp > r([5, 'medium']).xp && r([5, 'medium']).xp > r([5, 'easy']).xp);
  assert.ok(r([10, 'medium']).xp > r([2, 'medium']).xp);
  assert.ok(r([10, 'medium']).copper > r([2, 'medium']).copper);
  assert.ok(r([4, 'hard']).items.some(i => i.gen), 'a hard quest pays a weapon');
});

test('a giver whose slots are used up offers nothing more', () => {
  const ctx = ctxOf(16), log = createQuestLog();
  log.deepest = 20;
  for (let i = 0; i < 40; i++) { refreshOffers(log, ctx); for (const q of log.list) if (q.state === 'offered') q.state = 'done'; }
  const n = log.list.length;
  refreshOffers(log, ctx);
  assert.equal(log.list.length, n);
  assert.ok(!log.list.some(q => q.state === 'offered'));
});

test('a bounty: a named, stronger enemy of the depth waits on a hiding place; beating it is the goal', async () => {
  const { pickBounty, bountyKind, BOUNTY } = await import('../src/core/bounties.js');
  const { DEPTH_SPAWNS } = await import('../src/core/spawns.js');
  const { ENEMY_KINDS } = await import('../src/core/enemies.js');
  for (let d = 0; d <= 20; d++) for (let i = 0; i < 5; i++) {
    const b = pickBounty(d, i * 7919 + d);
    const species = ENEMY_KINDS[b.enemy].species;
    assert.ok(DEPTH_SPAWNS[d].roster.some(r => ENEMY_KINDS[r.type].species === species), `a ${b.enemy} at depth ${d}`);
    const k = bountyKind(b.enemy, b.name), base = ENEMY_KINDS[b.enemy];
    assert.ok(k.bounty && k.label.startsWith(b.name) && k.hp >= base.hp * (BOUNTY.hp - 0.1));
  }
  const ctx = ctxOf(17), { log, q } = questOf(17, 'bounty', 3);
  const s = q.stages[0];
  assert.ok(s.enemyId === `q:${q.id}` && s.spot);
  accept(log, q.id, ctx);
  assert.equal(q.state, 'active');
  settle(log, { ...ctx, defeated: new Set([s.enemyId]) });
  assert.equal(q.state, 'ready', 'beaten');
  assert.deepEqual(checkQuestLog(roundTrip(packQuestLog(log))).list[0].stages, q.stages);
});

test('a letter goes to somebody further down, who ends it and pays', () => {
  const { log, q } = questOf(18, 'delivery', 4);
  const s = q.stages[0];
  assert.ok(s.to.resident || s.to.spot, 'to somebody living there, or waiting on a hiding place');
  accept(log, q.id);
  assert.deepEqual(carried(q), [s.item], 'carried from the start');
  if (s.to.resident) assert.equal(giverMark(log, s.to.resident), '?', 'they are waiting for it');
  const paid = questEvent(log, { kind: 'talked', quest: q.id });
  assert.deepEqual(paid, [q]);
  assert.equal(q.state, 'done');
  assert.deepEqual(carried(q), []);
});

test('a relay: ask somebody, then find it where they say, then bring it back', () => {
  const { log, q } = questOf(19, 'relay', 5);
  assert.deepEqual(q.stages.map(s => s.goal), ['talk', 'find']);
  accept(log, q.id);
  questEvent(log, { kind: 'found', quest: q.id });
  assert.equal(q.stage, 0, 'nothing to find before asking');
  questEvent(log, { kind: 'talked', quest: q.id });
  assert.equal(q.stage, 1);
  assert.deepEqual(questGoalsIn(log, q.stages[1].key).map(g => g.stage), [q.stages[1]]);
  questEvent(log, { kind: 'found', quest: q.id });
  assert.equal(q.state, 'ready');
  assert.deepEqual(carried(q), [q.stages[1].item]);
});

test('a defense: the keeper of every outpost asks for one; beating the raid ends it there and pays', () => {
  const ctx = ctxOf(20);
  const outpost = Array.from({ length: 21 }, (_, d) => ctx.layout(d).spotList).flat().find(s => s.kind === 'outpost');
  const log = createQuestLog();
  log.deepest = outpost.depth;
  const q = makeQuest(log, ctx, npcGiver(outpost.id), { id: `${outpost.depth}:98`, depth: outpost.depth, kind: 'defense' });
  assert.equal(q.kind, 'defense');
  assert.equal(q.payout, 'spot');
  assert.equal(q.stages[0].spot, outpost.id);
  assert.equal(makeQuest(log, ctx, 'innkeeper', { id: `${outpost.depth}:97`, depth: outpost.depth, kind: 'defense' })?.kind ?? 'none', 'find',
    'only its keeper asks (anybody else finds something else to ask)');
  log.list.push(q);
  accept(log, q.id);
  assert.deepEqual(questGoalsIn(log, outpost.key).map(g => g.stage.goal), ['defend']);
  assert.ok(fail(log, q.id), 'a raid lost');
  assert.ok(restart(log, q.id));
  const paid = questEvent(log, { kind: 'defended', quest: q.id });
  assert.deepEqual(paid, [q]);
  assert.equal(q.state, 'done');
});

test('an annex: its storehouse defense opens the sealed portal, for good, once taken', async () => {
  const { openedGates } = await import('../src/core/quests.js');
  const ctx = ctxOf(21), L = ctx.layout;
  const d = Array.from({ length: 21 }, (_, i) => i).find(i => L(i).annex), annex = L(d).annex;
  const outpost = L(d).spotList.find(s => s.annex);
  assert.equal(outpost.annex, annex.gate);
  const seat = L(d).spotList.find(s => s.kind === 'seat'), log = createQuestLog();
  log.deepest = d;
  const q = makeQuest(log, ctx, npcGiver(seat.id), { id: `${d}:96`, depth: d, kind: 'defense' });
  assert.equal(q.stages[0].opens, annex.gate, 'somebody of the depth knows the way in');
  log.list.push(q);
  assert.deepEqual(openedGates(log), [], 'sealed while only offered');
  accept(log, q.id);
  assert.deepEqual(openedGates(log), [annex.gate]);
  questEvent(log, { kind: 'defended', quest: q.id });
  assert.deepEqual(openedGates(log), [annex.gate], 'and it stays open');
  const plan = questPlan(21, L);
  assert.ok(plan.slots.some(s => s.kind === 'defense' && s.depth === d && !isNpcGiver(s.giver) || s.giver !== npcGiver(outpost.id)));
});

test('a repeatable quest comes back to its giver once the party was away and came back, for half the pay', () => {
  const { log, q, ctx } = questOf(22, 'bounty', 3);
  accept(log, q.id);
  settle(log, { ...ctx, defeated: new Set([q.stages[0].enemyId]) });
  handIn(log, q.id);
  assert.deepEqual(log.repeats.map(r => [r.id, r.depth, r.ready]), [[q.id, 0, false]], 'a villager: at home in town');
  log.deepest = 4;
  log.used = questPlan(22, ctx.layout).slots.map(s => s.id);   // (the plan used up: only the repeat is left)
  refreshOffers(log, ctx, ['innkeeper']);
  assert.ok(!log.list.some(x => x.state === 'offered'), 'not before going away');
  questEvent(log, { kind: 'visit', depth: 0 });
  assert.ok(!log.repeats[0].ready, 'still at home');
  questEvent(log, { kind: 'visit', depth: 3 });
  questEvent(log, { kind: 'visit', depth: 0 });
  assert.ok(log.repeats[0].ready, 'away and back');
  refreshOffers(log, ctx, ['innkeeper']);
  const again = log.list.find(x => x.state === 'offered');
  assert.ok(again?.repeat && again.kind === 'bounty' && say(again.title).endsWith('(again)'));
  assert.notEqual(again.stages[0].enemyId, q.stages[0].enemyId, 'a new one');
  assert.ok(again.rewards.items.every(i => !i.gen), 'potions, no weapon');
  assert.deepEqual(log.repeats, [], 'it comes back when this one is done');
  assert.deepEqual(checkQuestLog(roundTrip(packQuestLog(log))).list.at(-1), again);
});

test('the town has a few offers at a time, and new ones each time the party comes back from below', () => {
  for (const seed of [1, 77, 4242]) {
    const ctx = ctxOf(seed), log = createQuestLog(), town = () => log.list.filter(q => GIVERS[q.giver] && q.state === 'offered');
    refreshOffers(log, ctx);
    assert.equal(town().length, TOWN_OFFERS, 'a start');
    for (const q of town()) accept(log, q.id);
    refreshOffers(log, ctx);
    assert.equal(town().length, 0, 'nothing more until the party has been below');
    questEvent(log, { kind: 'visit', depth: 0 });
    refreshOffers(log, ctx);
    assert.equal(town().length, 0, 'the road out of town is not below');
    questEvent(log, { kind: 'visit', depth: 1 });
    questEvent(log, { kind: 'visit', depth: 0 });
    refreshOffers(log, ctx);
    assert.equal(town().length, TOWN_OFFERS, 'back from below');
    assert.equal(new Set(log.list.map(q => q.giver)).size, log.list.length, 'from different villagers');
  }
});

test('the quests out at once are of different kinds where the plan lets them', () => {
  let same = 0, total = 0;
  for (const seed of [1, 5, 77, 99, 4242]) {
    const ctx = ctxOf(seed), plan = questPlan(seed, ctx.layout), log = createQuestLog();
    log.met = [...new Set(plan.slots.map(s => s.giver).filter(isNpcGiver))];
    for (let deepest = 0; deepest <= 6; deepest++) {
      log.deepest = deepest; log.townOpen = true;
      refreshOffers(log, ctx);
      const out = log.list.filter(q => q.state !== 'done');
      total += out.length; same += out.length - new Set(out.map(q => q.kind)).size;
      for (const q of out) q.state = 'done';
    }
  }
  assert.ok(same / total < 0.15, `${same} of ${total} share a kind`);
});

test('a gathering: several things over one depth, each picked up, then back to the giver', () => {
  const { ctx, log, q } = questOf(77, 'gather', 2);
  const s = q.stages[0];
  assert.equal(s.spots.length, GATHER);
  assert.equal(new Set(s.spots).size, GATHER);
  assert.ok(ITEMS[s.item].category === 'quest' && !['quest_letter', 'quest_parcel', 'quest_map_scrap'].includes(s.item));
  accept(log, q.id, ctx);
  assert.deepEqual(questGoalsIn(log, s.keys[0]).map(g => g.quest), [q]);
  const mark = progressOf(log);
  questEvent(log, { kind: 'found', quest: q.id, spot: s.spots[0] }, ctx);
  assert.deepEqual(carried(q), [s.item]);
  restoreProgress(log, mark);
  assert.deepEqual(carried(q), [], 'a death puts it back');
  for (const spot of s.spots) questEvent(log, { kind: 'found', quest: q.id, spot }, ctx);
  assert.equal(q.state, 'ready');
  assert.equal(carried(q).length, GATHER);
  const back = checkQuestLog(roundTrip(packQuestLog(log))).list[0];
  assert.deepEqual(back.stages[0].got, s.got);
});

test('the things lost, gathered and carried are many, not the same few', () => {
  const seen = new Set();
  for (const seed of [1, 5, 77, 99, 4242]) for (const kind of ['find', 'gather', 'delivery', 'relay']) for (let d = 1; d <= 6; d++) {
    const ctx = ctxOf(seed), log = createQuestLog();
    log.deepest = d - 1;
    const q = makeQuest(log, ctx, TOWN[d % TOWN.length], { id: `${d}:${kind}`, depth: d, kind, force: true });
    if (q) for (const s of q.stages) if (s.item) seen.add(s.item);
  }
  assert.ok(seen.size >= 30, `${seen.size} different things`);
});

test('the people of the quests hang together: families stay, names do not clash, camps have room, bounties differ', async () => {
  const { CAMP_RESCUES } = await import('../src/core/questplan.js');
  const { residentOf } = await import('../src/core/npcs.js');
  for (const seed of [7, 99, 31337]) {
    const ctx = ctxOf(seed), plan = questPlan(seed, ctx.layout), log = createQuestLog();
    const camps = new Map();
    for (const s of plan.slots.filter(x => x.kind === 'rescue')) camps.set(s.giver, (camps.get(s.giver) ?? 0) + 1);
    for (const [giver, n] of camps) assert.ok(n <= CAMP_RESCUES, `${giver} asks for ${n} people`);
    log.met = [...new Set(plan.slots.map(s => s.giver).filter(isNpcGiver))];
    for (let deepest = 0; deepest <= 20; deepest++) {
      log.deepest = deepest;
      for (let round = 0; round < 6; round++) { log.townOpen = true; refreshOffers(log, ctx); for (const q of log.list) if (q.state === 'offered') q.state = 'done'; }
    }
    const bounties = log.list.filter(q => q.kind === 'bounty').map(q => q.stages[0].name);
    assert.equal(new Set(bounties).size, bounties.length, `every bounty its own name: ${bounties}`);
    const relation = new Map();
    for (const q of log.list) {
      const lost = q.kin ?? q.stages.find(s => s.goal === 'rescue')?.person;
      if (!lost) continue;
      const spot = ctx.layout(0) && q.giver.startsWith('npc:') && q.giver.slice(4), key = spot && spot.split(':')[1];
      const giver = key && ctx.layout(-Number(key.split(',')[1])).spotList.map(residentOf).find(n => n?.giver === q.giver);
      assert.notEqual(lost.name, giver?.name, `${q.id}: nobody loses themselves`);
      const was = relation.get(lost.name);
      assert.ok(!was || was.giver === q.giver && was.relation === lost.relation, `${lost.name} is one person of one family: ${q.id}`);
      relation.set(lost.name, { giver: q.giver, relation: lost.relation });
    }
  }
});
