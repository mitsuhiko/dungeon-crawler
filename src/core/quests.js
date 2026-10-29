// Quests (docs/quests.md). Pure: no DOM, no game state, so it is tested in node; game/quests.js
// runs it, net/session.js shares it, core/save.js keeps it with the world.
//
// The quest log belongs to the world, not to a hero: everyone in a world plays the same quests.
//   { list, next, deepest, broken, version }
//   list:    the quests, offered ones included (newest last)
//   next:    { [giver]: n } how many quests each giver has made (the next one's number)
//   deepest: the deepest depth anyone got to in this world (what `reach` quests ask for)
//   broken:  the cube keys of the hordes broken (what `horde` quests ask for)
//   version: goes up with every change (what the panel and the others watch)
//
// A quest:
//   { id, giver, n, kind, depth, difficulty, target, title, text, stages, stage, payout,
//     rewards: { xp, copper, items }, state, archived, created, finished }
//   stages: [{ goal, depth, key?, spot?, item?, person?, chest?, text, done }], one after another;
//     `stage` is the current one
//   payout: 'return' (back to the giver, who pays), 'spot' (paid where the last goal is done, by
//     whoever is there) or 'self' (the quest is its own payout: a treasure's chest; only XP)
//   state:  'offered' | 'active' | 'ready' (to hand in) | 'done' | 'failed'
//   archived: put away by the players (a soft abandon): hidden, and it counts no progress
//
// What a giver offers comes from the world's quest plan (core/questplan.js: which kind, at which
// depth, from whom), filled in from the seed and the plan's slot, checked against the world as
// it is (`ctx`, below): every target is one the layout has and nobody has done yet. The quest is
// kept whole once made, so a changed generator leaves the quests taken alone.
//
// ctx: { seed, layout: depth -> the depth's layout (world/layout.js makeLayouts), gates: the
// guardian gates open (run.unlockedGates), chests: the chests open (run.chests), now }
// The facts goals are checked against: { gates, chests } (a Set alone: the gates).
import { mulberry32, hash32 } from './util.js';
import { hashString } from './gear/drops.js';
import { rollWeapon } from './gear/generate.js';
import { RARITY } from './gear/rarities.js';
import { validGen } from './loot.js';
import { rollPotions } from './potions.js';
import { ITEMS, QUEST_THINGS, isGear } from './items.js';
import { CHESTS } from './chests.js';
import { depthLevel, grown, GROWTH, ENEMY_KINDS, enemyWords } from './enemies.js';
import { xpToNext } from './progression.js';
import { bossAt } from './bosses.js';
import { PROP_METADATA } from './propmetadata.js';
import { ROLES, residentOf, isNpcGiver, spotOfGiver, keyOfSpot, personWords, roleWords, titleWords } from './npcs.js';
import { questPlan, clueOf, lostPerson, campOf, SCOUTS } from './questplan.js';
import { pickBounty, bountyKind } from './bounties.js';
import { msg, phrase, noun, tr, say, cleanWords } from '../i18n/i18n.js';

const MAX_DEPTH = 20;   // themes/depth.js MAX_DEPTH
export const STATES = ['offered', 'active', 'ready', 'done', 'failed'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'];
// quests a giver has out at a time: offered or not done yet (going on, to hand in, failed; also
// archived), so nobody hands out a second quest before the first is done
export const MAX_OFFERS = 1;
// offers standing in town at a time (the villagers'); new ones come only when the party comes back
// to town from below (log.townOpen): a few at a time, not all six villagers at once
export const TOWN_OFFERS = 2;
// how many things a gathering quest has you find, spread over one depth's hiding places
export const GATHER = 3;
// how close (cells) to a landmark's chest counts as standing beside it
export const LANDMARK_REACH = 3.5;

// Who gives quests, and which kinds they lean towards (weights); where they are, as words. The six villagers of the town
// and the merchant camp (world/town.js VILLAGERS, by name); and the people living at the seats
// and camps out in the world (core/npcs.js), 'npc:' + their spot's id, who ask about their own
// depth and the one below. A giver once talked to (log.met) makes offers like the villagers.
export const GIVERS = {
  innkeeper: { title: 'Innkeeper', where: phrase("on the inn's porch in town"), kinds: { reach: 3, horde: 2, landmark: 1 } },
  groom: { title: 'Groom', where: phrase('at the stable in town'), kinds: { reach: 2, landmark: 2, guardian: 1 } },
  smith: { title: 'Smith', where: phrase('at the anvil in town'), kinds: { guardian: 3, horde: 2 } },
  keeper: { title: 'Pet keeper', where: phrase('by the pet shop in town'), kinds: { landmark: 3, reach: 1, horde: 1 } },
  alchemist: { title: 'Alchemist', where: phrase('in the merchant camp'), kinds: { landmark: 2, guardian: 1, horde: 1 } },
  enchanter: { title: 'Enchanter', where: phrase('in the merchant camp'), kinds: { landmark: 3, reach: 2, guardian: 1 } },
};
export const giverOf = villager => villager?.giver ?? (GIVERS[villager?.name] ? villager.name : null);
export const isGiver = g => !!GIVERS[g] || isNpcGiver(g);

// What a giver is to the quests: { name (in a sentence, '{giver:the}': 'the Innkeeper', 'Ada the
// hermit'), title (on its own: 'Innkeeper', 'Ada the hermit'), owner (whose a thing is: 'the
// Innkeeper', 'Ada'), where, kinds, depths(log) }, the words as words (src/i18n/i18n.js); null: nobody
export function giverProfile(giver, ctx) {
  if (GIVERS[giver]) {
    const who = noun(GIVERS[giver].title, { caps: true });
    return { ...GIVERS[giver], title: who, name: who, owner: who, role: giver, depths: log => window(log) };
  }
  const id = spotOfGiver(giver), key = id && keyOfSpot(id);
  if (!key) return null;
  const depth = -Number(key.split(',')[1]), plan = ctx.layout(depth)?.spots?.get(key)?.find(s => s.id === id), npc = residentOf(plan);
  if (!npc) return null;
  return { title: npc.title, name: npc.title, owner: personWords(npc.name), who: npc.name, role: npc.role, where: whereAt(plan.kind === 'camp', depth),
    kinds: ROLES[npc.role].kinds, depths: () => range(depth, depth + 1) };
}
// how a quest names its giver: in a sentence ('{giver:the}'), on its own; as words
export const giverName = q => q.from?.name ?? noun(GIVERS[q.giver]?.title ?? 'giver', { caps: true });
export const giverTitle = q => q.from?.title ?? noun(GIVERS[q.giver]?.title ?? 'Giver', { caps: true });

//   used:   the plan's slots offered (or passed over: core/questplan.js)
//   living: the people found and come to live at a camp: [{ id, name, tint, outfit, camp }]
//   repeats: the repeatable quests done, waiting to come back (REPEAT): [{ id, giver, kind, depth,
//           away, ready }]; repeated: how many came back (their slots' numbers)
//   townOpen: the villagers may bring out new offers (TOWN_OFFERS): at first, and each time the
//           party comes back to town from below (away: it has been below since)
export const createQuestLog = () => ({ list: [], next: {}, deepest: 0, broken: [], met: [], used: [], living: [], repeats: [], repeated: 0,
  townOpen: true, away: false, version: 0 });
// Repeatable quests (docs/quests.md "Repeatable quests"): what happens in a world again may be
// asked again. One of these done comes back to its giver once the party has been away from the
// giver's depth (the town: depth 0) and come back; filled in anew (a new target), paying half the
// XP and coins and potions instead of a weapon. They are not part of the plan's hundred.
export const REPEAT = { kinds: ['bounty', 'defense'], share: 0.5 };
const repeatable = q => REPEAT.kinds.includes(q.kind) && !q.stages.some(s => s.opens);   // (an annex's defense is done once)
const giverDepth = g => { const key = keyOfSpot(spotOfGiver(g) ?? ''); return key ? -Number(key.split(',')[1]) : 0; };
const factsOf = f => f instanceof Set ? { gates: f, chests: new Set(), defeated: new Set() }
  : { gates: f?.gates ?? new Set(), chests: f?.chests ?? new Set(), defeated: f?.defeated ?? new Set() };
// talked to giver g for the first time: from now on it makes offers (refreshOffers)
export function meet(log, g) {
  if (GIVERS[g] || !isNpcGiver(g) || log.met.includes(g)) return false;
  log.met.push(g); log.version++;
  return true;
}

// --- words ----------------------------------------------------------------------------------------

// A quest is told in words to say in any language (src/i18n/i18n.js: phrase, noun, person): it keeps
// them, not sentences, so a world saved in one language reads in another, and so do the quests a
// host sends to friends. Places, things and people are nouns, and the sentences say how they go:
// 'on {where:the}' is 'on depth 3' and 'on the road out of town' in English, 'auf Tiefe 3' and
// 'auf dem Weg aus der Stadt' in German.
const cap = s => s[0].toUpperCase() + s.slice(1);
// the guardians of a depth, in the order they are come to
const ORDINAL = [noun('first guardian'), noun('second guardian'), noun('third guardian'), noun('fourth guardian')];
// a depth as a place ('{where:the}': 'the road out of town', 'depth 3')
export const depthName = d => d === 0 ? noun('road out of town') : phrase('depth {depth}', { depth: d });
// where somebody lives: at the camp on a depth, or on it
const whereAt = (camp, depth) => camp ? phrase('at the camp on {where:the}', { where: depthName(depth) }) : phrase('on {where:the}', { where: depthName(depth) });
// what a depth looks like ('{place:the}': 'the meadows', 'the deep canyon')
const themeName = (ctx, d) => d === 0 ? noun('Meadows') : noun(ctx.layout(d).theme.name);
// a landmark's name as said: 'meadow_windmill_a' -> 'windmill' (src/i18n/sources.js lists them)
export function landmarkName(name) {
  const base = PROP_METADATA.find(p => p.name === name)?.base ?? String(name).replace(/^[a-z]+_|_[a-z]$/g, '');
  return base.replace(/^(.+)_(great|small)$/, '$2_$1').replace(/_/g, ' ');   // ('chorten_great': 'great chorten')
}
const pick = (R, xs) => xs[Math.floor(R() * xs.length)];
const NUMBER = [msg('no'), msg('one'), msg('two'), msg('three'), msg('four'), msg('five')];
// whose a thing is ("Ada's lantern"), a noun of the thing's gender
const owned = (owner, thing) => ({ t: msg("{owner:the}'s {thing:lower}"), p: { owner, thing }, of: 'thing' });

// --- the things the quests are about (core/items.js QUEST_THINGS) ---------------------------------

// what a giver is more likely to have lost, or to want gathered or carried: by villager, or by the
// role of somebody out in the world (core/npcs.js ROLES); any other thing may come up too
const LEANS = {
  innkeeper: ['cider_barrel', 'flour_sack', 'fireworks', 'honey_pot', 'pearl_clam', 'pink_salt', 'ring', 'locket'],
  groom: ['wagon_wheel', 'backpack', 'lantern', 'compass', 'supply_crate'],
  smith: ['shield', 'silver_bars', 'gears', 'crucible', 'pickaxe', 'obsidian', 'fire_crystal'],
  keeper: ['crab', 'bird_nest', 'toy_rabbit', 'spider_eggs'],
  alchemist: ['toadstool', 'cave_mushrooms', 'spore_pod', 'pitcher_plant', 'ice_shard', 'honey_pot'],
  enchanter: ['singing_crystal', 'rainbow_crystal', 'thunder_jar', 'ice_heart', 'void_crystal', 'rune_stone'],
  hermit: ['candles', 'incense_bowl', 'bone_lantern', 'prayer_stone', 'journal'],
  explorer: ['backpack', 'compass', 'lantern', 'journal'],
  miner: ['pickaxe', 'lantern', 'singing_crystal', 'silver_bars'],
  pilgrim: ['butter_lamps', 'prayer_stone', 'paper_lantern', 'incense_bowl', 'candles'],
  trapper: ['crab', 'bird_nest', 'horned_skull', 'spider_eggs'],
  scholar: ['stone_tablet', 'statue_head', 'jade_idol', 'old_urn', 'painted_pots', 'journal'],
  carter: ['supply_crate', 'flour_sack', 'cider_barrel', 'wagon_wheel'],
};
const LEAN = 4;   // how much likelier a thing the giver leans to is
// the things of the quests not done yet (offered too): a thing is about one quest at a time
const thingsOut = log => new Set(log.list.filter(q => q.state !== 'done').flatMap(q => q.stages.map(s => s.item)).filter(Boolean));
// a thing for a quest of somebody of `role` (a villager's name, or a role out in the world)
function pickThing(R, log, role) {
  const out = thingsOut(log), lean = new Set((LEANS[role] ?? []).map(id => `quest_${id}`)), free = QUEST_THINGS.filter(id => !out.has(id));
  return weighted(R, free.length ? free : QUEST_THINGS, id => lean.has(id) ? LEAN : 1);
}
// a thing as a noun (src/i18n/en.js knows the plural ones and how many of a thing are said)
export const thingWords = id => noun(ITEMS[id].name);
// whose a lost thing is: the giver's own (mine), or somebody of their family's (their name and how
// they are related, as words; kin: who they are, kept with the quest)
function ownerOf(R, g, ctx, log, giver, depth, seed) {
  if (R() < 0.5) return { owner: g.owner, mine: true };
  const known = kinOf(log, giver), p = known.length && R() < 0.6 ? known[Math.floor(R() * known.length)] : lostPerson(seed, namesTaken(log, g, ctx, depth));
  return { owner: personWords(p.name), person: personWords(p.name), relation: roleWords(p.relation, p.name), kin: p };
}
// The people of a giver's family the quests told of so far (their things lost, they lost
// themselves): the same people, related the same way, whenever the giver speaks of them again
export const kinOf = (log, giver) => [...new Map(log.list.filter(q => q.giver === giver)
  .flatMap(q => [q.kin, ...q.stages.filter(s => s.goal === 'rescue').map(s => s.person)]).filter(p => p?.name && p.relation)
  .map(p => [p.name, p])).values()];
// the names a new person of the quests should not have: the giver's own, everybody's the quests
// know already (the families, the people found, those living at camps), and the people living near
// depth `depth` (the seats and camps two up and two down)
function namesTaken(log, g, ctx, depth) {
  const out = new Set(g.who ? [g.who] : []);
  for (const d of range(Math.max(0, depth - 2), depth + 2)) for (const s of ctx.layout(d).spotList) { const n = residentOf(s); if (n) out.add(n.name); }
  for (const q of log.list) {
    if (q.kin?.name) out.add(q.kin.name);
    for (const s of q.stages) for (const p of [s.person, s.to?.person]) if (p?.name) out.add(p.name);
  }
  for (const p of log.living) out.add(p.name);
  return out;
}

// --- the kinds of quests ---------------------------------------------------------------------------

// Each kind: targets(ctx, log, depths) -> what it could be about now, at those depths ({ id,
// depth, ... }), and quest(t,
// ctx, R, giver) -> its words and stages. A target's `id` is what two quests may not share.
const KINDS = {
  // get down to a depth nobody has been to yet
  reach: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.filter(d => d > log.deepest && d <= log.deepest + 2).map(depth => ({ id: `reach:${depth}`, depth })),
    quest(t, ctx, R) {
      const w = { place: themeName(ctx, t.depth), depth: t.depth };
      return {
        title: phrase('Down to depth {depth}', w),
        text: pick(R, [
          phrase('Travellers talk about {place:the}, down on depth {depth}. Nobody I know has been there. Go and see, and come back to tell me what it is like.', w),
          phrase('I have heard of {place:the}, deep down on depth {depth}. Will you go there for me? Then come back and tell me all about it.', w),
        ]),
        stages: [{ goal: 'reach', depth: t.depth, text: phrase('Reach depth {depth} ({place:the})', w) }],
      };
    },
  },
  // stand beside the landmark of a depth (its grand reward site, world/sites.js)
  landmark: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.filter(d => d > 0).flatMap(depth => [...ctx.layout(depth).sitePlans]
      .filter(([, plans]) => plans[0]?.landmark).map(([key, plans]) => ({ id: `landmark:${key}`, depth, key, landmark: plans[0].landmark }))),
    quest(t, ctx, R) {
      const w = { landmark: noun(landmarkName(t.landmark)), place: themeName(ctx, t.depth), depth: t.depth };
      return {
        title: phrase('{landmark:The}', w),
        text: pick(R, [
          phrase('Somewhere in {place:the} on depth {depth} there is {landmark:a}. My grandmother told me about it. Find it, stand beside it, and come back to tell me it is really there.', w),
          phrase('They say {landmark:a} stands in {place:the}, on depth {depth}. I would love to know what it looks like. Find it for me and come back.', w),
        ]),
        target: { landmark: t.landmark },
        stages: [{ goal: 'landmark', depth: t.depth, key: t.key, text: phrase('Find {landmark:the} on depth {depth}', w) }],
      };
    },
  },
  // beat a guardian (core/guardians.js): its gate opens
  guardian: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.flatMap(depth => {
      const L = ctx.layout(depth), side = [...L.guardians].filter(([, g]) => g.role === 'side')
        .sort(([a], [b]) => L.route.indexOf(a) - L.route.indexOf(b)).map(([k]) => k);
      return [...L.guardians].filter(([k]) => !ctx.gates.has(k)).map(([key, g]) => ({ id: `guardian:${key}`, depth, key,
        role: g.role, boss: bossAt(depth, g.role), nth: side.indexOf(key), sides: side.length }));
    }),
    quest(t, ctx, R) {
      const where = depthName(t.depth), boss = t.boss && noun(cap(t.boss), { proper: true });
      if (t.role === 'descent') return {
        title: boss ? phrase('Beat {boss}', { boss }) : phrase('The guardian of the well'),
        text: boss ? phrase('{boss} guards the way down from {where:the}, and nobody gets past. Beat {boss}, and come back to tell me the way is open.', { boss, where })
          : pick(R, [phrase('The way down from {where:the} is guarded by something big. Beat the guardian of the well and come back to tell me.', { where }),
            phrase('A guardian sits by the well at the end of {where:the}. Nobody gets down while it is there. Beat it, then come back.', { where })]),
        target: { role: t.role },
        stages: [{ goal: 'guardian', depth: t.depth, key: t.key, text: boss ? phrase('Defeat {boss} on {where:the}', { boss, where })
          : phrase('Defeat the Temp Boss on {where:the}', { where }) }],
      };
      const which = t.sides > 1 ? ORDINAL[t.nth] ?? noun('next guardian') : noun('guardian'), w = { where, which, n: t.sides };
      return {
        title: phrase('A gate on {where:the}', w),
        text: pick(R, [
          t.sides > 1 ? phrase('On {where:the} a guardian blocks the way through. There are {n} of them; I mean {which:the} you come to. Beat it so the way is open for everyone, then come back.', w)
            : phrase('On {where:the} a guardian blocks the way through. Beat it so the way is open for everyone, then come back.', w),
          phrase('{which:The} on {where:the} has scared off everyone who went that way. Beat it, and come back to tell me.', w),
        ]),
        target: { role: t.role, nth: t.nth },
        stages: [{ goal: 'guardian', depth: t.depth, key: t.key, text: phrase('Defeat {which:the} on {where:the}', w) }],
      };
    },
  },
  // break a depth's horde (world/hordes.js): every one of it defeated
  horde: {
    payout: 'return',
    targets: (ctx, log, depths) => depths.flatMap(depth => [...ctx.layout(depth).hordes]
      .map(([key, h]) => ({ id: `horde:${key}`, depth, key, enemy: h.kind }))),
    quest(t, ctx, R) {
      const w = { enemy: noun(ENEMY_KINDS[t.enemy]?.label ?? 'enemy'), where: depthName(t.depth) };
      return {
        title: phrase('A horde of {enemy:pl}', w),
        text: pick(R, [
          phrase('A whole horde of {enemy:pl} has gathered on {where:the}. Left alone they only get bolder. Break it up, and come back to tell me.', w),
          phrase('People coming back from {where:the} talk of a horde of {enemy:pl}. Scatter them, every last one, then come back.', w),
        ]),
        target: { enemy: t.enemy },
        stages: [{ goal: 'horde', depth: t.depth, key: t.key, text: phrase('Break the horde of {enemy:pl} on {where:the}', w) }],
      };
    },
  },
  // find a thing somebody lost on a hiding place (world/spots.js) and bring it back
  find: {
    payout: 'return',
    targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths),
    quest(t, ctx, R, { id, log, g, giver }) {
      const item = pickThing(R, log, g.role), thing = thingWords(item), where = depthName(t.depth);
      const clue = clueOf(ctx.layout, t.plan, landmarkName), o = ownerOf(R, g, ctx, log, giver, t.depth, hash32(ctx.seed ^ hashString(id) ^ 0x7a11));
      const label = owned(o.owner, thing), w = { thing, where, clue, label, person: o.person, relation: o.relation };
      return {
        title: o.mine ? phrase('The lost {thing:lower}', w) : phrase('{label:cap}', w),
        text: o.mine ? pick(R, [
          phrase('I lost my {thing:lower} down on {where:the}, {clue}. Could you look for {thing:it} and bring {thing:it} back to me?', w),
          phrase('My {thing:lower}! I dropped {thing:it} when I ran from the monsters on {where:the}, {clue}. Please bring {thing:it} back.', w),
          phrase('I only put my {thing:lower} down for a moment on {where:the}, {clue}, and then something came at me and I ran. Would you fetch {thing:it} for me?', w),
          phrase('A big bird snatched my {thing:lower} and let {thing:it} fall on {where:the}, {clue}. Can you get {thing:it} back for me?', w),
        ]) : pick(R, [
          phrase('My {relation:lower} {person} left {person:his} {thing:lower} on {where:the}, {clue}. {person} is too scared to go back. Would you fetch {thing:it}?', w),
          phrase('{person}, my {relation:lower}, was carrying {person:his} {thing:lower} down to {where:the} and dropped {thing:it} {clue}. Please bring {thing:it} back to me.', w),
          phrase('Somebody saw {label} lying on {where:the}, {clue}. {person} is my {relation:lower}. Would you bring {thing:it} back for us?', w),
        ]),
        target: { spot: t.spot, item },
        ...(o.kin ? { kin: o.kin } : {}),
        stages: [{ goal: 'find', depth: t.depth, key: t.key, spot: t.spot, item, label, text: phrase('Find {label} on {where:the}', w) }],
      };
    },
  },
  // find somebody lost on a hiding place; they go to live at the camp of whoever asked
  rescue: {
    payout: 'spot',
    targets: (ctx, log, depths, giver) => campOf(ctx.layout, giver) ? hidingPlaces(ctx, log, depths) : [],
    quest(t, ctx, R, { id, log, g, giver }) {
      const lost = lostPerson(hash32(ctx.seed ^ hashString(id)), namesTaken(log, g, ctx, t.depth));
      // (somebody of theirs found before: they say so)
      const before = log.list.findLast(q => q.giver === giver && q.kind === 'rescue' && q.id !== id)?.stages.find(s => s.goal === 'rescue')?.person;
      const w = { person: personWords(lost.name), relation: roleWords(lost.relation, lost.name), where: depthName(t.depth),
        clue: clueOf(ctx.layout, t.plan, landmarkName), before: before && personWords(before.name) };
      return {
        title: phrase('Where is {person}?', w),
        kin: lost,
        text: before ? pick(R, [
          phrase('First {before}, and now my {relation:lower} {person} is gone too! {person} went down to {where:the}, and somebody saw {person:him} {clue}. Would you look once more?', w),
          phrase('You brought {before} home to me, so I know you can do it. Now {person}, my {relation:lower}, is lost on {where:the}, {clue}. Please!', w),
        ]) : pick(R, [
          phrase('My {relation:lower} {person} went down to {where:the} and has not come back. Somebody saw {person:him} {clue}. Please find {person:him}! I will wait here.', w),
          phrase('{person}, my {relation:lower}, wanted to see {where:the} and never came back. The last I heard, {clue}. Bring {person:him} home to me, please.', w),
        ]),
        target: { spot: t.spot, person: lost.name },
        stages: [{ goal: 'rescue', depth: t.depth, key: t.key, spot: t.spot, person: lost, text: phrase('Find {person} on {where:the}', w) }],
      };
    },
  },
  // a treasure map: the chest on a hiding place is the reward (opened like a reward site's)
  treasure: {
    payout: 'self',
    targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths),
    quest(t, ctx, R, { id, difficulty }) {
      const w = { where: depthName(t.depth), clue: clueOf(ctx.layout, t.plan, landmarkName) };
      return {
        title: phrase('A map with a cross'),
        text: pick(R, [
          phrase('I found this scrap of an old map. The cross is on {where:the}, {clue}. I am too old to go digging; whatever is there is yours.', w),
          phrase('Look at this map scrap! Treasure, on {where:the}, {clue}. Find it, and keep what is in it.', w),
        ]),
        target: { spot: t.spot },
        stages: [{ goal: 'open', depth: t.depth, key: t.key, spot: t.spot, chest: `q:${id}`, prestige: REWARD.chest[difficulty],
          text: phrase('Find the treasure on {where:the}', w) }],
      };
    },
  },
};
// beat a named, stronger enemy that waits on a hiding place (core/bounties.js)
KINDS.bounty = {
  payout: 'return',
  targets: (ctx, log, depths) => hidingPlaces(ctx, log, depths).filter(t => t.depth > 0 || t.tier > 0),
  quest(t, ctx, R, { id, log }) {
    const used = new Set(log.list.flatMap(q => q.stages.map(s => s.goal === 'bounty' && s.name)).filter(Boolean));
    const b = pickBounty(t.depth, hash32(ctx.seed ^ hashString(id)), used), kind = bountyKind(b.enemy, b.name);
    const w = { name: noun(b.name, { proper: true }), bounty: enemyWords(kind), kind: noun(ENEMY_KINDS[b.enemy].label), where: depthName(t.depth),
      clue: clueOf(ctx.layout, t.plan, landmarkName) };
    return {
      title: phrase('Wanted: {name}', w),
      text: pick(R, [
        phrase('{bounty:cap} has been seen on {where:the}, {clue}. It is bigger and meaner than the others of its kind. Beat it, and come back for the reward.', w),
        phrase('There is a reward on {name}! {kind:A} the size of a cart, on {where:the}, {clue}. Bring me word it is gone.', w),
      ]),
      target: { spot: t.spot, enemy: b.enemy },
      stages: [{ goal: 'bounty', depth: t.depth, key: t.key, spot: t.spot, enemy: b.enemy, name: b.name, enemyId: `q:${id}`,
        text: phrase('Defeat {name} on {where:the}', w) }],
    };
  },
};
// take something to somebody further down (a letter, a parcel, or any of the quest things):
// somebody living at a seat or a camp there, else somebody waiting on a hiding place; they end it
// and pay
KINDS.delivery = {
  payout: 'spot',
  targets: (ctx, log, depths, giver) => recipients(ctx, log, depths, giver),
  quest(t, ctx, R, { log, g }) {
    const item = R() < 0.35 ? pick(R, ['quest_letter', 'quest_parcel']) : pickThing(R, log, g.role), where = depthName(t.depth);
    const at = t.to.resident ? t.to.where : phrase('on {where:the}, {clue}', { where, clue: clueOf(ctx.layout, t.plan, landmarkName) });
    const w = { thing: thingWords(item), name: t.to.name, to: t.to.title, at, where };
    return {
      title: phrase('{thing:cap} for {name}', w),
      text: pick(R, [
        phrase('Could you take {thing:this} {thing:lower} to {to}, {at}? {name} has been waiting for {thing:it} for a long time.', w),
        phrase('{thing:This} {thing:lower} must get to {to}, {at}. Nobody else dares to go that far down. {name} will thank you for it.', w),
        phrase('{to} ({at}) asked me for {thing:this} {thing:lower}, and I promised to send {thing:it}. Would you carry {thing:it} down there for me?', w),
        phrase('I owe {name} a favour. {thing:This} {thing:lower} should make us even. You will find {to} {at}.', w),
      ]),
      target: { recipient: t.id },
      stages: [{ goal: 'deliver', depth: t.depth, key: t.key, to: t.to, item, reply: pick(R, [
        phrase('{name}: At last! Thank you so much. Here, this is for your trouble.', w),
        phrase('{name}: For me? I hoped {thing:it} would come. Take this, you have earned it.', w),
        phrase('{name}: Oh, wonderful! I was beginning to think nobody would come. Here, take this.', w)]),
        text: phrase('Bring {thing:the} to {to} on {where:the}', w) }],
    };
  },
};
// ask somebody further down where a lost thing is, then find it there and bring it back
KINDS.relay = {
  payout: 'return',
  targets: (ctx, log, depths, giver) => recipients(ctx, log, depths, giver).flatMap(r => {
    const near = hidingPlaces(ctx, log, [r.depth]).filter(h => h.spot !== r.to.spot);
    return near.length ? [{ ...r, id: `${r.id}|${near[0].id}`, find: near[0] }] : [];
  }),
  quest(t, ctx, R, { log, g }) {
    const item = pickThing(R, log, g.role), thing = thingWords(item), where = depthName(t.depth);
    const at = t.to.resident ? t.to.where : phrase('on {where:the}, {clue}', { where, clue: clueOf(ctx.layout, t.plan, landmarkName) });
    const clue = clueOf(ctx.layout, t.find.plan, landmarkName), label = owned(g.owner, thing);
    const w = { thing, name: t.to.name, to: t.to.title, at, where, clue };
    return {
      title: phrase('Ask {name}', w),
      text: pick(R, [
        phrase('My {thing:lower} {thing:is} gone, and {to} ({at}) saw where {thing:they} went. Ask {name}, find {thing:it}, and bring {thing:it} back to me.', w),
        phrase('{to} found my {thing:lower} once before! Go and ask, {at}. Then bring {thing:it} back to me, please.', w),
        phrase('Somebody took my {thing:lower} down below. {to} hears all the gossip down there, {at}. Ask, then bring {thing:it} back to me.', w),
      ]),
      target: { recipient: t.id, spot: t.find.spot, item },
      stages: [
        { goal: 'talk', depth: t.depth, key: t.key, to: t.to, reply: phrase('{name}: Your {thing:lower}? I saw {thing:it} on {where:the}, {clue}.', w),
          text: phrase('Ask {to} on {where:the}', w) },
        { goal: 'find', depth: t.depth, key: t.find.key, spot: t.find.spot, item, label, clue, text: phrase('Find {thing:the} on {where:the}, {clue}', w) },
      ],
    };
  },
};
// gather several of one thing, spread over the hiding places of one depth (in as many different
// cubes as there are), and bring them all back
KINDS.gather = {
  payout: 'return',
  targets: (ctx, log, depths) => depths.flatMap(depth => {
    const free = hidingPlaces(ctx, log, [depth]);
    return free.length >= GATHER ? [{ id: `gather:${depth}`, depth, key: free[0].key, tier: 1, free }] : [];
  }),
  quest(t, ctx, R, { log, g }) {
    const pool = [...t.free], spots = [];
    while (spots.length < GATHER) {
      const apart = pool.filter(h => !spots.some(x => x.key === h.key)), from = apart.length ? apart : pool;
      const h = from[Math.floor(R() * from.length)];
      spots.push(h); pool.splice(pool.indexOf(h), 1);
    }
    const item = pickThing(R, log, g.role), thing = thingWords(item), clue = clueOf(ctx.layout, spots[0].plan, landmarkName);
    const w = { thing, where: depthName(t.depth), n: phrase(NUMBER[GATHER]), clue };
    return {
      title: phrase('{thing:Pl} on {where:the}', w),
      text: pick(R, [
        phrase('A cart tipped over on {where:the}, and {n} {thing:pl} went rolling off all over the place. One was seen {clue}. Could you gather them up and bring them back to me?', w),
        phrase('The monsters on {where:the} ran off with my {thing:pl}, {n} of them, and dropped them here and there. Bring back every one! I think one is {clue}.', w),
        phrase('I need {n} {thing:pl}, and there are some lying about on {where:the}, one of them {clue}. Would you collect them for me?', w),
        phrase('A great gust of wind blew {n} of my {thing:pl} all over {where:the}. I saw one come down {clue}. Please find them all!', w),
      ]),
      target: { item },
      stages: [{ goal: 'gather', depth: t.depth, spots: spots.map(h => h.spot), keys: spots.map(h => h.key), got: spots.map(() => false),
        item, label: owned(g.owner, thing), clue, text: phrase('Collect {n} {thing:pl} on {where:the}', w) }],
    };
  },
};
// who a letter may go to, or who may be asked, at these depths: those living at the seats and
// camps (but whoever asks), else somebody waiting on a hiding place
function recipients(ctx, log, depths, giver) {
  return depths.flatMap(depth => {
    const living = ctx.layout(depth).spotList.filter(s => s.kind !== 'hide' && s.kind !== 'glass' && !s.annex).map(residentOf)   // (not behind a sealed portal)
      .filter(n => n && n.giver !== giver)
      .map(n => ({ id: `to:${n.giver}`, depth, key: keyOfSpot(n.spot),
        to: { resident: n.giver, name: personWords(n.name), title: n.title, where: whereAt(n.camp, depth) } }));
    if (living.length) return living;
    return hidingPlaces(ctx, log, [depth]).map(h => {
      const p = lostPerson(hash32(ctx.seed ^ hashString(h.spot) ^ 0x4e1));
      return { ...h, id: `to:${h.spot}`, to: { spot: h.spot, name: personWords(p.name), title: titleWords(p.name, 'messenger'),
        person: { ...p, relation: 'messenger' } } };
    });
  });
}
// defend an outpost's supply cart (world/spots.js) against raiders, for whoever keeps it
// (game/defense.js runs the raid); it may fail, and start again
KINDS.defense = {
  payout: 'spot',
  targets: (ctx, log, depths, giver) => depths.flatMap(depth => ctx.layout(depth).spotList
    .filter(s => s.kind === 'outpost' && (s.annex || residentOf(s)?.giver === giver))
    .map(plan => ({ id: `defend:${plan.id}`, depth, key: plan.key, spot: plan.id, tier: 1, plan }))),
  quest(t, ctx, R) {
    const w = { keeper: personWords(residentOf(t.plan).name), where: depthName(t.depth) };
    // an annex's: behind a portal sealed until the quest is taken (world/layout.js)
    if (t.plan.annex) return {
      title: phrase('The sealed storehouse'),
      text: pick(R, [
        phrase('Behind a sealed door on {where:the} {keeper} keeps a hidden storehouse, and the monsters have found it. Here is the way in: take it, and help {keeper} hold the cart until they give up.', w),
        phrase("There is a door on {where:the} that nobody can open. I can. Behind it, {keeper}'s storehouse is under attack. Go in and keep them off the cart!", w),
      ]),
      target: { spot: t.spot },
      stages: [{ goal: 'defend', depth: t.depth, key: t.key, spot: t.spot, waves: 3, opens: t.plan.annex,
        text: phrase("Defend {keeper}'s storehouse on {where:the}", w) }],
    };
    return {
      title: phrase('Raiders at the cart'),
      text: pick(R, [
        phrase('Every night the monsters come for my supply cart. I cannot hold them off alone! When you are ready, stand by the cart and I will ring the bell. Keep them off it until they give up.'),
        phrase('They have been at my cart again, and next time there will be more of them. Will you stand by it with me? Keep them away from it, wave after wave.'),
      ]),
      target: { spot: t.spot },
      stages: [{ goal: 'defend', depth: t.depth, key: t.key, spot: t.spot, waves: 3, text: phrase("Defend {keeper}'s cart on {where:the}", w) }],
    };
  },
};
// the hiding places at these depths no quest going on is about
function hidingPlaces(ctx, log, depths) {
  // (a treasure's spot stays its: its chest stays there, open)
  const busy = new Set(log.list.filter(q => q.state !== 'done' || q.kind === 'treasure')
    .flatMap(q => q.stages.flatMap(s => [s.spot, s.to?.spot, ...(s.spots ?? [])])).filter(Boolean));
  return depths.flatMap(depth => ctx.layout(depth).spotList.filter(s => s.kind === 'hide' && !busy.has(s.id))
    .map(plan => ({ id: `spot:${plan.id}`, depth, key: plan.key, spot: plan.id, tier: plan.tier, plan })));
}
// what a goal is, by name (the kinds' stages)
export const GOALS = ['reach', 'landmark', 'guardian', 'horde', 'find', 'gather', 'rescue', 'open', 'bounty', 'deliver', 'talk', 'defend'];
export const QUEST_KINDS = Object.keys(KINDS);

const range = (a, b) => Array.from({ length: Math.max(0, Math.min(b, MAX_DEPTH) - a + 1) }, (_, i) => a + i);
// the depths quests are about: one above how far anyone got, down to two below it
const window = log => range(Math.max(0, log.deepest - 1), log.deepest + 2);

// --- what a goal needs ----------------------------------------------------------------------------

// is the stage's goal done in the world as it is? (a landmark only by being there: `done`)
export function goalDone(stage, log, facts) {
  if (stage.done) return true;
  const f = factsOf(facts);
  switch (stage.goal) {
    case 'reach': return log.deepest >= stage.depth;
    case 'guardian': return f.gates.has(stage.key);
    case 'horde': return log.broken.includes(stage.key);
    case 'open': return f.chests.has(stage.chest);
    case 'bounty': return f.defeated.has(stage.enemyId);
    case 'gather': return !!stage.got?.length && stage.got.every(Boolean);
    default: return false;   // landmark, find, rescue: only by being there (events)
  }
}

// --- rewards --------------------------------------------------------------------------------------

// XP: a share of the level's cost at the quest's depth, more for harder quests; coins like a
// chest (basic, uncommon, rare); items: potions, a weapon half the time, a weapon from Decent up
export const REWARD = { xpShare: 0.07, factor: { easy: 0.6, medium: 1, hard: 1.6 }, chest: { easy: 'basic', medium: 'uncommon', hard: 'rare' } };
export function questRewards(R, depth, difficulty) {
  const level = depthLevel(depth), xp = Math.round(REWARD.xpShare * xpToNext(level) * REWARD.factor[difficulty]);
  const [lo, hi] = CHESTS[REWARD.chest[difficulty]].copper.map(c => Math.round(grown(c, GROWTH.coins, level)));
  const copper = lo + Math.floor(R() * (hi - lo + 1));
  const items = [];
  if (difficulty === 'hard') items.push(rollWeapon(R, level + 1, { floor: RARITY.decent.rank, luck: 0.3 }), ...rollPotions(R, level, 1));
  else if (difficulty === 'medium' && R() < 0.5) items.push(rollWeapon(R, level, { floor: RARITY.decent.rank, luck: 0.2 }));
  else items.push(...rollPotions(R, level, difficulty === 'medium' ? 2 : 1));
  return { xp, copper, items };
}

// --- making offers --------------------------------------------------------------------------------

const weighted = (R, list, weight) => {
  const total = list.reduce((n, x) => n + weight(x), 0);
  let r = R() * total;
  for (const x of list) if ((r -= weight(x)) < 0) return x;
  return list.at(-1);
};
// the targets the quests have already: never two quests about one thing (but a hiding place
// again once its quest is done)
const takenTargets = log => new Set(log.list.filter(q => q.state !== 'done' || !q.target?.spot).map(q => q.target?.id).filter(Boolean));
// the kinds to try for a slot of the plan: its own (a scout as the giver leans), then the others
const FALLBACK = { scout: ['find', 'gather'], find: ['gather', 'treasure', 'scout'], gather: ['find', 'treasure'], treasure: ['find', 'gather'],
  rescue: ['find', 'gather'], bounty: ['find', 'gather'], delivery: ['relay', 'find', 'gather'], relay: ['delivery', 'find', 'gather'], defense: ['find'] };
function kindsFor(slot, g, R) {
  const scouts = () => {
    const left = SCOUTS.map(k => [k, g.kinds[k] ?? 0.3]), out = [];
    while (left.length) { const k = weighted(R, left, ([, w]) => w); out.push(k[0]); left.splice(left.indexOf(k), 1); }
    return out;
  };
  return [slot.kind, ...(FALLBACK[slot.kind] ?? [])].flatMap(k => k === 'scout' ? scouts() : [k]);
}
// the kinds of the quests out (offered, going on, to hand in, failed; not put away): a slot tries
// the kinds nobody has out first, so the quests going on at once differ
const kindsOut = log => new Set(log.list.filter(q => q.state !== 'done' && !q.archived).map(q => q.kind));

// The quest of `giver` for slot `slot` of the plan (core/questplan.js), or null: nothing it
// could be about at the slot's depth now. The log is not changed (refreshOffers does that).
export function makeQuest(log, ctx, giver, slot) {
  const g = giverProfile(giver, ctx);
  if (!g) throw new TypeError(`Not a quest giver: ${giver}`);
  const id = `${giver}:${slot.id}`, f = factsOf(ctx);
  const R = mulberry32(hash32(ctx.seed ^ hashString(giver) ^ hashString(slot.id)));
  const taken = takenTargets(log), out = kindsOut(log), kinds = kindsFor(slot, g, R);
  // (slot.force: of its kind or none, the dev tools' and a repeat's)
  const order = slot.force ? [slot.kind] : [...kinds.filter(k => !out.has(k)), ...kinds.filter(k => out.has(k))];
  for (const kind of order) {
    const options = KINDS[kind].targets(ctx, log, [slot.depth], giver).filter(t => !taken.has(t.id)
      && !goalDone({ goal: kind, depth: t.depth, key: t.key }, log, f));
    if (!options.length) continue;
    const t = options[Math.floor(R() * options.length)];
    const step = Math.max(0, Math.min(2, t.depth - log.deepest + (t.role === 'descent' || kind === 'bounty' || kind === 'defense' ? 1 : 0)
      + ((t.tier ?? 0) >= 3 ? 1 : 0)));
    const difficulty = DIFFICULTIES[step], made = KINDS[kind].quest(t, ctx, R, { id, giver, difficulty, log, g });
    const rewards = questRewards(R, t.depth, difficulty);
    return { id, giver, n: Number(slot.id.split(':')[1]) || 0, slot: slot.id, from: { name: g.name, title: g.title, where: g.where },
      kind, depth: t.depth, difficulty, target: { id: t.id, ...made.target },
      ...(made.kin ? { kin: made.kin } : {}),
      title: made.title, text: made.text, stages: made.stages.map(s => ({ ...s, done: false })), stage: 0,
      payout: KINDS[kind].payout, rewards: KINDS[kind].payout === 'self' ? { xp: rewards.xp, copper: 0, items: [] } : rewards,
      state: 'offered', archived: false, created: ctx.now ?? 0, finished: 0 };
  }
  return null;
}

// a repeatable quest come back (REPEAT): of its kind, at its giver's depth (a villager's: at or a
// little above the deepest anyone got), filled in anew; half the pay, potions for a weapon
function makeRepeat(log, ctx, r) {
  const R = mulberry32(hash32(ctx.seed ^ hashString(r.id) ^ Math.imul(log.repeated + 1, 0x2545f491)));
  const depth = GIVERS[r.giver] ? Math.max(1, log.deepest - Math.floor(R() * 3)) : Math.min(MAX_DEPTH, r.depth + (r.kind === 'defense' ? 0 : Math.floor(R() * 2)));
  const q = makeQuest(log, ctx, r.giver, { id: `r:${++log.repeated}`, depth, kind: r.kind, force: true });
  if (!q || q.kind !== r.kind) return null;
  const level = depthLevel(q.depth);
  Object.assign(q, { repeat: true, title: phrase('{title} (again)', { title: q.title }), text: phrase('Back again? {text}', { text: q.text }),
    rewards: { xp: Math.round(q.rewards.xp * REPEAT.share), copper: Math.round(q.rewards.copper * REPEAT.share),
      items: rollPotions(R, level, 1 + Math.floor(R() * 2)) } });
  return q;
}
// an offer that can no longer be done (its goal is done already): it goes
const stale = (q, log, facts) => q.state === 'offered' && q.stages.some(s => goalDone(s, log, facts));

// a giver's quests out: offered, or taken and not done yet
const outFrom = (log, giver) => log.list.filter(q => q.giver === giver && q.state !== 'done').length;

// The next offer of `giver`, or null: the next slot of its plan that something fits (as far down
// as two below the deepest anyone got; a slot nothing fits is passed over, log.used), else a
// repeatable quest of theirs come back. The log notes the slots and repeats used up.
function nextOffer(log, ctx, plan, giver) {
  for (const slot of plan.byGiver.get(giver) ?? []) {
    if (log.used.includes(slot.id)) continue;
    if (slot.depth > log.deepest + 2) break;
    log.used.push(slot.id);
    const q = makeQuest(log, ctx, giver, slot);
    if (q) return q;
  }
  const r = log.repeats.find(x => x.giver === giver && x.ready);
  if (!r) return null;
  log.repeats.splice(log.repeats.indexOf(r), 1);
  return makeRepeat(log, ctx, r);
}
// how many offers stand in town
const townOffers = log => log.list.filter(q => GIVERS[q.giver] && q.state === 'offered').length;

// Every giver's offers brought up to date: those that went stale go. Out in the world each giver
// with fewer than MAX_OFFERS quests out (outFrom) offers their next one (nextOffer). In town the
// villagers take turns: when the town is open (log.townOpen: at first, and on coming back from
// below), those who have given fewest so far (and have nothing out) bring out offers until
// TOWN_OFFERS stand. true: something changed.
export function refreshOffers(log, ctx, givers = [...Object.keys(GIVERS), ...log.met]) {
  const before = log.list.length, plan = questPlan(ctx.seed, ctx.layout), usedBefore = log.used.length, repeatsBefore = log.repeats.length;
  log.list = log.list.filter(q => !stale(q, log, ctx));
  let changed = log.list.length !== before;
  if (log.townOpen && givers.some(g => GIVERS[g])) {
    const given = g => log.list.filter(q => q.giver === g).length;
    const turns = Object.keys(GIVERS).filter(g => outFrom(log, g) < MAX_OFFERS).sort((a, b) => given(a) - given(b));
    for (const giver of turns) {
      if (townOffers(log) >= TOWN_OFFERS) break;
      const q = nextOffer(log, ctx, plan, giver);
      if (q) log.list.push(q);
    }
    log.townOpen = false;
    changed = true;
  }
  for (const giver of givers.filter(g => !GIVERS[g])) {
    if (outFrom(log, giver) >= MAX_OFFERS) continue;
    const q = nextOffer(log, ctx, plan, giver);
    if (q) log.list.push(q);
  }
  changed ||= log.list.length !== before || log.used.length !== usedBefore || log.repeats.length !== repeatsBefore;
  if (changed) log.version++;
  return changed;
}

// --- what players do ------------------------------------------------------------------------------

const find = (log, id) => log.list.find(q => q.id === id) ?? null;
const touch = log => { log.version++; return true; };

// take an offered quest
export function accept(log, id, gates = new Set()) {
  const q = find(log, id);
  if (q?.state !== 'offered') return false;
  q.state = 'active';
  settle(log, gates);
  return touch(log);
}
// put a quest away (on: true) or bring it back; offers cannot be
export function archive(log, id, on, gates = new Set()) {
  const q = find(log, id);
  if (!q || q.state === 'offered' || q.archived === !!on) return false;
  q.archived = !!on;
  if (!on) settle(log, gates);
  return touch(log);
}
// a quest that failed starts again from the beginning
export function restart(log, id, gates = new Set()) {
  const q = find(log, id);
  if (q?.state !== 'failed') return false;
  q.state = 'active'; q.stage = 0;
  for (const s of q.stages) { s.done = false; if (s.got) s.got = s.got.map(() => false); }
  settle(log, gates);
  return touch(log);
}
export function fail(log, id) {
  const q = find(log, id);
  if (q?.state !== 'active') return false;
  q.state = 'failed';
  return touch(log);
}
// hand a quest in to its giver: the quest (now done; its rewards go to everyone), or null
export function handIn(log, id, now = 0) {
  const q = find(log, id);
  if (q?.state !== 'ready') return null;
  q.state = 'done'; q.finished = now;
  settled(log, q);
  touch(log);
  return q;
}

// --- what happens in the world --------------------------------------------------------------------

// Every quest that is going on (active, not archived) moves on past the goals that are done.
// The quests that were finished on the spot (payout 'spot'), to be paid.
export function settle(log, gates = new Set(), now = 0) {
  const paid = [];
  for (const q of log.list) {
    if (q.state !== 'active' || q.archived) continue;
    let moved = false;
    while (q.stage < q.stages.length && goalDone(q.stages[q.stage], log, gates)) { q.stages[q.stage].done = true; q.stage++; moved = true; }
    if (q.stage < q.stages.length) { if (moved) log.version++; continue; }
    q.state = q.payout === 'return' ? 'ready' : 'done';
    if (q.state === 'done') { q.finished = now; paid.push(q); settled(log, q); }
    log.version++;
  }
  return paid;
}
// what a quest done leaves behind: somebody found goes to live at the camp of whoever asked
function settled(log, q) {
  const s = q.stages.find(x => x.goal === 'rescue');
  const camp = s && spotOfGiver(q.giver);
  if (camp && !log.living.some(p => p.id === q.id)) log.living.push({ id: q.id, ...s.person, camp });
  // a repeatable one waits to come back (REPEAT)
  if (repeatable(q) && !log.repeats.some(r => r.id === q.id))
    log.repeats.push({ id: q.id, giver: q.giver, kind: q.kind, depth: giverDepth(q.giver), away: false, ready: false });
}

// Something happened (game/quests.js):
//   { kind: 'visit', depth }      someone came to a cube at that depth
//   { kind: 'horde', key }        the horde in that cube is broken
//   { kind: 'landmark', key }     someone stands beside the landmark in that cube
//   { kind: 'gate', key }         a guardian's gate opened (run.unlockedGates has it already)
//   { kind: 'found', quest, spot } somebody picked up the thing quest `quest` is looking for (of
//                                 a gathering, the one on hiding place `spot`)
//   { kind: 'rescued', quest }    somebody found the person quest `quest` is looking for
//   { kind: 'talked', quest }     somebody talked to who quest `quest` sends them to (a letter
//                                 delivered, somebody asked)
//   { kind: 'defended', quest }   the raid on quest `quest`'s cart is beaten (game/defense.js)
// The log takes note, and the quests move on (settle). The quests paid on the spot.
export function questEvent(log, ev, gates = new Set(), now = 0) {
  if (ev.kind === 'visit' && Number.isInteger(ev.depth) && ev.depth > log.deepest) { log.deepest = Math.min(MAX_DEPTH, ev.depth); log.version++; }
  // below, and back in town: the villagers may bring out new offers (refreshOffers)
  if (ev.kind === 'visit' && Number.isInteger(ev.depth)) {
    if (ev.depth > 0 && !log.away) { log.away = true; log.version++; }
    if (ev.depth === 0 && log.away) { log.away = false; log.townOpen = true; log.version++; }
  }
  // away from a repeatable quest's giver, and back: it comes back (REPEAT)
  if (ev.kind === 'visit' && Number.isInteger(ev.depth)) for (const r of log.repeats) {
    if (r.ready) continue;
    if (ev.depth !== r.depth) { if (!r.away) { r.away = true; log.version++; } } else if (r.away) { r.ready = true; log.version++; }
  }
  if (ev.kind === 'horde' && typeof ev.key === 'string' && !log.broken.includes(ev.key)) { log.broken.push(ev.key); log.version++; }
  if (ev.kind === 'landmark' && typeof ev.key === 'string') for (const q of log.list) {
    const s = q.stages[q.stage];
    if (q.state === 'active' && !q.archived && s?.goal === 'landmark' && s.key === ev.key && !s.done) { s.done = true; log.version++; }
  }
  if (ev.kind === 'found' && typeof ev.spot === 'string') {
    const q = find(log, ev.quest), s = q?.stages[q.stage], i = s?.goal === 'gather' ? s.spots.indexOf(ev.spot) : -1;
    if (q?.state === 'active' && !q.archived && i >= 0 && !s.got[i]) { s.got[i] = true; log.version++; }
  } else if (['found', 'rescued', 'talked', 'defended'].includes(ev.kind) && typeof ev.quest === 'string') {
    const q = find(log, ev.quest), s = q?.stages[q.stage];
    const goals = { found: ['find'], rescued: ['rescue'], talked: ['deliver', 'talk'], defended: ['defend'] }[ev.kind];
    if (q?.state === 'active' && !q.archived && goals.includes(s?.goal) && !s.done) { s.done = true; log.version++; }
  }
  return settle(log, gates, now);
}
// does a quest that is going on want someone at the landmark in cube `key`?
export const wantsLandmark = (log, key) => log.list.some(q => q.state === 'active' && !q.archived
  && q.stages[q.stage]?.goal === 'landmark' && q.stages[q.stage].key === key);

// A death puts the cube back as it was when you came in (game/flow.js): quest progress made since
// goes back with it. progressOf before, restoreProgress after.
export const progressOf = log => ({ broken: [...log.broken],
  quests: new Map(log.list.map(q => [q.id, { state: q.state, stage: q.stage, done: q.stages.map(s => s.done), got: q.stages.map(s => s.got && [...s.got]) }])) });
export function restoreProgress(log, before) {
  let changed = log.broken.length !== before.broken.length;
  log.broken = [...before.broken];
  for (const q of log.list) {
    const was = before.quests.get(q.id);
    const gotSame = q.stages.every((s, i) => !s.got || String(s.got) === String(was?.got?.[i]));
    if (!was || q.state === 'done' || was.state === q.state && was.stage === q.stage && gotSame) continue;
    if (!['active', 'ready'].includes(q.state) || !['active', 'ready'].includes(was.state)) continue;
    q.state = was.state; q.stage = was.stage;
    q.stages.forEach((s, i) => { s.done = !!was.done[i]; if (s.got && was.got?.[i]) s.got = [...was.got[i]]; });
    changed = true;
  }
  if (changed) log.version++;
  return changed;
}

// --- what the quests put in the world -------------------------------------------------------------

// The quests going on whose current goal is in cube `key`: [{ quest, stage }] (a thing to find,
// somebody lost, a treasure's chest; they show only while it is the goal)
export const questGoalsIn = (log, key) => log.list.filter(q => q.state === 'active' && !q.archived && inCube(q.stages[q.stage], key))
  .map(q => ({ quest: q, stage: q.stages[q.stage] }));
// is stage s's goal (or a part of it still to do: a gathering's things not picked up) in cube `key`?
const inCube = (s, key) => s?.key === key || !!s?.keys?.some((k, i) => k === key && !s.got[i]);
// where a stage's goal is now: its cube, or a gathering's next thing still to pick up
export const stageKey = s => s.keys ? s.keys.find((k, i) => !s.got[i]) ?? null : s.key ?? null;
// the people living at camp `campId` (a spot's id), found by the quests
export const livingAt = (log, campId) => log.living.filter(p => p.camp === campId);
// what a quest carries (core/items.js QUEST_ITEMS): the things found for it, a treasure's map
export function carried(q) {
  if (q.state === 'done' || q.state === 'offered') return [];
  const out = q.stages.filter(s => s.goal === 'find' && s.done).map(s => s.item);
  for (const s of q.stages.filter(x => x.goal === 'gather')) out.push(...s.got.filter(Boolean).map(() => s.item));
  out.push(...q.stages.filter(s => s.goal === 'deliver' && !s.done).map(s => s.item));
  if (q.kind === 'treasure') out.push('quest_map_scrap');
  return out;
}

// the sealed portals the quests taken have opened (an annex's: world/layout.js annexGate); they
// stay open, also once the quest is done
export const openedGates = log => log.list.filter(q => q.state !== 'offered').flatMap(q => q.stages.map(s => s.opens)).filter(Boolean);

// --- what is shown --------------------------------------------------------------------------------

// what a giver has for the players: quests to hand in, offers, and those going on
export const giverQuests = (log, giver) => log.list.filter(q => q.giver === giver && ['offered', 'ready', 'active', 'failed'].includes(q.state));
// the mark over a giver's head: '?' a quest to hand in, '!' an offer, '' nothing new
export function giverMark(log, giver) {
  const mine = log.list.filter(q => q.giver === giver);
  const awaited = log.list.some(q => q.state === 'active' && !q.archived && ['deliver', 'talk'].includes(q.stages[q.stage]?.goal)
    && q.stages[q.stage].to.resident === giver);   // a letter for them, a question for them
  return awaited || mine.some(q => q.state === 'ready' && !q.archived) ? '?' : mine.some(q => q.state === 'offered') ? '!' : '';
}
// the panel's lists: going on (active, ready, failed), done, archived; newest first
export function questLists(log) {
  const shown = log.list.filter(q => q.state !== 'offered').reverse();
  return { active: shown.filter(q => !q.archived && q.state !== 'done'), done: shown.filter(q => !q.archived && q.state === 'done'),
    archived: shown.filter(q => q.archived) };
}
// a stage in words (of the language of the moment): a gathering with how many are found
export const stageText = s => s.goal === 'gather' ? `${say(s.text)} (${s.got.filter(Boolean).length}/${s.got.length})` : say(s.text);
// a quest's state in words
export function stateText(q) {
  if (q.archived) return tr('Archived');
  switch (q.state) {
    case 'offered': return tr('Offered');
    case 'active': return q.stages[q.stage] ? stageText(q.stages[q.stage]) : tr('Going on');
    case 'ready': return tr('Done: back to {giver:the}', { giver: giverName(q) });
    case 'done': return tr('Complete');
    default: return tr('Failed');
  }
}

// --- checks (saves, the others' word) -------------------------------------------------------------

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (s, max = 400) => typeof s === 'string' ? s.slice(0, max) : '';
// words (a quest's text): English of an older save, or words to say (src/i18n/i18n.js cleanWords)
const words = (x, max = 400) => typeof x === 'string' ? x.slice(0, max) : cleanWords(x) ?? '';
const nat = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
function checkItem(i) {
  if (!isObj(i) || !Object.hasOwn(ITEMS, i.itemId) || ITEMS[i.itemId].category === 'currency') return null;
  const count = Number.isInteger(i.count) && i.count > 0 && i.count <= ITEMS[i.itemId].stackLimit ? i.count : null;
  if (!count) return null;
  if (i.gen !== undefined) return isGear(i.itemId) && validGen(i.gen) ? { itemId: i.itemId, count: 1, gen: structuredClone(i.gen) } : null;
  return { itemId: i.itemId, count };
}
function checkStage(s) {
  if (!isObj(s) || !GOALS.includes(s.goal) || !Number.isInteger(s.depth) || s.depth < 0 || s.depth > MAX_DEPTH) return null;
  if (s.key !== undefined && typeof s.key !== 'string') return null;
  const out = { goal: s.goal, depth: s.depth, ...(s.key !== undefined ? { key: s.key } : {}), text: words(s.text, 120), done: !!s.done };
  if (typeof s.spot === 'string') out.spot = s.spot.slice(0, 60);
  if (typeof s.chest === 'string') out.chest = s.chest.slice(0, 90);
  if (typeof s.prestige === 'string' && CHESTS[s.prestige]) out.prestige = s.prestige;
  if (s.goal === 'find' && ITEMS[s.item]?.category !== 'quest') return null;
  if (s.goal === 'find') out.item = s.item;
  if ((s.goal === 'find' || s.goal === 'gather') && s.label) out.label = words(s.label, 60);
  if (s.goal === 'gather') {
    const spots = Array.isArray(s.spots) ? s.spots : [], keys = Array.isArray(s.keys) ? s.keys : [], got = Array.isArray(s.got) ? s.got : [];
    if (ITEMS[s.item]?.category !== 'quest' || !spots.length || spots.length > 9 || keys.length !== spots.length
      || ![...spots, ...keys].every(x => typeof x === 'string' && x.length <= 60)) return null;
    Object.assign(out, { item: s.item, spots: [...spots], keys: [...keys], got: spots.map((_, i) => !!got[i]) });
  }
  if (s.goal === 'rescue') { const p = checkPerson(s.person); if (!p) return null; out.person = p; }
  if (s.goal === 'bounty') {
    if (!ENEMY_KINDS[s.enemy] || typeof s.name !== 'string' || typeof s.enemyId !== 'string') return null;
    Object.assign(out, { enemy: s.enemy, name: text(s.name, 30), enemyId: s.enemyId.slice(0, 90) });
  }
  if (s.goal === 'deliver' && ITEMS[s.item]?.category !== 'quest') return null;
  if (s.goal === 'deliver') out.item = s.item;
  if (s.goal === 'deliver' || s.goal === 'talk') {
    const t = isObj(s.to) ? s.to : {};
    out.to = { name: words(t.name, 30), title: words(t.title, 60) };
    if (isNpcGiver(t.resident)) Object.assign(out.to, { resident: t.resident.slice(0, 60), where: words(t.where, 80) });
    else if (typeof t.spot === 'string' && checkPerson(t.person)) Object.assign(out.to, { spot: t.spot.slice(0, 60), person: checkPerson(t.person) });
    else return null;
    out.reply = words(s.reply, 200);
  }
  if (s.clue) out.clue = words(s.clue, 120);
  if (s.goal === 'defend') out.waves = Math.max(1, Math.min(9, nat(s.waves) || 3));
  if (typeof s.opens === 'string' && s.opens.startsWith('annex:')) out.opens = s.opens.slice(0, 60);
  if (['find', 'rescue', 'open', 'bounty', 'defend'].includes(s.goal) && !out.spot) return null;
  return out;
}
// somebody (lost, or living at a camp): their name, how they are related, how they look
function checkPerson(p) {
  if (!isObj(p) || typeof p.name !== 'string' || !p.name) return null;
  const outfit = Array.isArray(p.outfit) ? p.outfit.filter(id => ITEMS[id]?.slot) : [];
  if (new Set(outfit.map(id => ITEMS[id].slot)).size !== outfit.length) return null;
  return { name: text(p.name, 20), relation: text(p.relation, 20), tint: /^#[0-9a-f]{6}$/i.test(p.tint) ? p.tint : '#d9b48c', outfit };
}
// a quest's rewards as saved or told by the host
export function checkRewards(r) {
  r = isObj(r) ? r : {};
  return { xp: nat(r.xp), copper: nat(r.copper), items: (Array.isArray(r.items) ? r.items : []).map(checkItem).filter(Boolean) };
}
export function checkQuest(q) {
  if (!isObj(q) || typeof q.id !== 'string' || q.id.length > 80 || !isGiver(q.giver) || !QUEST_KINDS.includes(q.kind)) return null;
  if (!STATES.includes(q.state) || !DIFFICULTIES.includes(q.difficulty) || !['return', 'spot', 'self'].includes(q.payout)) return null;
  const stages = Array.isArray(q.stages) ? q.stages.map(checkStage) : [];
  if (!stages.length || stages.includes(null) || !Number.isInteger(q.depth)) return null;
  const target = isObj(q.target) && typeof q.target.id === 'string' ? structuredClone(q.target) : { id: q.id };
  const f = isObj(q.from) ? q.from : {}, town = GIVERS[q.giver];
  const who = town && noun(town.title, { caps: true });
  const from = { name: words(f.name, 60) || who || noun('somebody', { proper: true }), title: words(f.title, 60) || who || noun('Somebody', { proper: true }),
    where: words(f.where, 80) || town?.where || '' };
  return { id: q.id, giver: q.giver, n: nat(q.n), ...(typeof q.slot === 'string' ? { slot: q.slot.slice(0, 12) } : {}),
    ...(q.repeat ? { repeat: true } : {}), ...(checkPerson(q.kin) ? { kin: checkPerson(q.kin) } : {}), from, kind: q.kind, depth: q.depth, difficulty: q.difficulty, target,
    title: words(q.title, 80), text: words(q.text), stages, stage: Math.min(nat(q.stage), stages.length), payout: q.payout,
    rewards: checkRewards(q.rewards),
    state: q.state, archived: !!q.archived, created: nat(q.created), finished: nat(q.finished) };
}
// a quest log as saved or as told by the host; a damaged quest is left out
export function checkQuestLog(x) {
  const log = createQuestLog();
  if (!isObj(x)) return log;
  const seen = new Set();
  for (const q of Array.isArray(x.list) ? x.list : []) {
    const c = checkQuest(q);
    if (c && !seen.has(c.id)) { seen.add(c.id); log.list.push(c); }
  }
  if (isObj(x.next)) for (const [g, n] of Object.entries(x.next)) if (isGiver(g)) log.next[g] = nat(n);
  log.met = Array.isArray(x.met) ? [...new Set(x.met.filter(g => isNpcGiver(g) && g.length <= 60))] : [];
  log.used = Array.isArray(x.used) ? [...new Set(x.used.filter(u => typeof u === 'string' && u.length <= 12))] : [];
  log.repeats = (Array.isArray(x.repeats) ? x.repeats : []).filter(r => isObj(r) && typeof r.id === 'string' && isGiver(r.giver)
    && REPEAT.kinds.includes(r.kind) && Number.isInteger(r.depth)).map(r => ({ id: r.id.slice(0, 80), giver: r.giver, kind: r.kind,
    depth: Math.min(MAX_DEPTH, nat(r.depth)), away: !!r.away, ready: !!r.ready }));
  log.repeated = nat(x.repeated);
  log.townOpen = x.townOpen !== false; log.away = !!x.away;
  log.living = (Array.isArray(x.living) ? x.living : []).map(p => {
    const c = checkPerson(p);
    return c && typeof p.id === 'string' && typeof p.camp === 'string' ? { id: p.id.slice(0, 80), ...c, camp: p.camp.slice(0, 60) } : null;
  }).filter(Boolean);
  log.deepest = Math.min(MAX_DEPTH, nat(x.deepest));
  log.broken = Array.isArray(x.broken) ? [...new Set(x.broken.filter(k => typeof k === 'string'))] : [];
  log.version = nat(x.version);
  return log;
}
// what is saved and sent of a log (plain JSON)
export const packQuestLog = log => structuredClone({ list: log.list, next: log.next, deepest: log.deepest, broken: log.broken, met: log.met,
  used: log.used, living: log.living, repeats: log.repeats, repeated: log.repeated, townOpen: log.townOpen, away: log.away, version: log.version });
