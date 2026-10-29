// The world's quest plan (docs/quests.md, "The numbers"): about 100 quests, which kind, at which
// depth and from whom, from the seed and the layouts alone. Pure. A giver offers its slots in
// order (core/quests.js makeQuest), each filled in when it is offered, against the world as it
// is then; a slot that cannot be filled (its target done meanwhile) gives way to another kind at
// its depth, or is passed over.
//
// Also here: the clues a quest gives about a place (from what the layout knows of it) and the
// people somebody may have lost.
import { mulberry32, hash32 } from './util.js';
import { residentOf, npcGiver, KIN_NAMES, isShe } from './npcs.js';
import { msg, phrase, noun } from '../i18n/i18n.js';

export const MAX_DEPTH = 20;
// quests per depth: heavier near the top, where a run spends its first hours
export const perDepth = d => d === 0 ? 4 : d <= 3 ? 7 : d <= 11 ? 5 : d <= 19 ? 4 : 3;
// the share of each kind (docs/quests.md "Kinds"). `scout` is one of the kinds about what the
// world has anyway (reach, landmark, guardian, horde), as the giver leans.
// (defense is not drawn: every outpost has one, at its depth, from whoever keeps it)
export const MIX = { find: 13, treasure: 5, rescue: 10, bounty: 15, delivery: 14, gather: 10, scout: 10, pieces: 8, prisoners: 6 };
export const SCOUTS = ['reach', 'landmark', 'guardian', 'horde'];
// the kinds there are so far; a planned kind that is not yet stands in as one of these
export const BUILT = new Set(['find', 'gather', 'treasure', 'rescue', 'scout', 'bounty', 'delivery', 'relay', 'defense']);
// (scattered pieces are much like gathering or a treasure map; freeing prisoners like breaking a horde)
const STAND_IN = { pieces: [['gather', 1], ['treasure', 1]], prisoners: [['scout', 1]] };
// how many people found may come to live at one camp (its places beside the resident's,
// world/spots.js): so one giver does not lose half the world's people
export const CAMP_RESCUES = 2;
// how many of a depth's quests the villagers give (the rest: the people out in the world)
const townShare = d => d <= 3 ? 0.7 : d <= 7 ? 0.45 : d <= 11 ? 0.3 : 0.1;
export const TOWN = ['innkeeper', 'groom', 'smith', 'keeper', 'alchemist', 'enchanter'];

const weighted = (R, list) => {
  let r = R() * list.reduce((n, [, w]) => n + w, 0);
  for (const [x, w] of list) if ((r -= w) < 0) return x;
  return list.at(-1)[0];
};

const plans = new WeakMap();
// The plan: { slots: [{ id, depth, kind, giver }], byGiver: giver -> its slots, by depth }
// layout: depth -> the depth's layout (world/layout.js makeLayouts)
// learn: memory.html#quests (see learn/README.md)
export function questPlan(seed, layout) {
  if (plans.has(layout)) return plans.get(layout);
  const slots = [], rescues = new Map();
  for (let d = 0; d <= MAX_DEPTH; d++) {
    const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x3c6ef372) ^ 0x9a17));
    // the people of this depth and the one above who could ask (their seats and camps)
    const near = [d, d - 1].filter(x => x >= 0).flatMap(x => layout(x).spotList).filter(s => s.kind !== 'hide' && s.kind !== 'glass');
    const camps = [d, d - 1, d - 2].filter(x => x >= 0).flatMap(x => layout(x).spotList).filter(s => s.kind === 'camp');
    for (let i = 0; i < perDepth(d); i++) {
      let kind = weighted(R, Object.entries(MIX));
      if (kind === 'delivery' && R() < 0.4) kind = 'relay';   // (now and then: ask somebody, then find it)
      if (!BUILT.has(kind)) kind = weighted(R, STAND_IN[kind]);
      let giver;
      // somebody lost: asked for by whoever waits at a camp near above (they wait there together),
      // the camp that has asked least first, and none more than it has room for
      if (kind === 'rescue') {
        const open = camps.filter(c => (rescues.get(c.id) ?? 0) < CAMP_RESCUES), fewest = Math.min(...open.map(c => rescues.get(c.id) ?? 0));
        const least = open.filter(c => (rescues.get(c.id) ?? 0) === fewest), camp = least.length ? least[Math.floor(R() * least.length)] : null;
        if (camp) rescues.set(camp.id, (rescues.get(camp.id) ?? 0) + 1);
        giver = camp && npcGiver(camp.id);
      }
      else if (R() < townShare(d) || !near.length) giver = TOWN[Math.floor(R() * TOWN.length)];
      else giver = npcGiver(near[Math.floor(R() * near.length)].id);
      if (!giver) { kind = 'find'; giver = TOWN[Math.floor(R() * TOWN.length)]; }
      slots.push({ id: `${d}:${i}`, depth: d, kind, giver });
    }
    // an outpost's defense, in place of one of the depth's quests: from whoever keeps it; an
    // annex's (behind its sealed portal) from somebody living on the depth who knows the way in,
    // else a villager
    for (const o of layout(d).spotList.filter(s => s.kind === 'outpost')) {
      const slot = slots.findLast(s => s.depth === d && s.kind !== 'defense');
      const seats = layout(d).spotList.filter(s => s.kind === 'seat' || s.kind === 'camp');
      const giver = !o.annex ? npcGiver(o.id) : seats.length ? npcGiver(seats[Math.floor(R() * seats.length)].id) : TOWN[Math.floor(R() * TOWN.length)];
      if (slot) Object.assign(slot, { kind: 'defense', giver });
    }
  }
  const byGiver = new Map();
  for (const s of slots) { if (!byGiver.has(s.giver)) byGiver.set(s.giver, []); byGiver.get(s.giver).push(s); }
  const plan = { slots, byGiver };
  plans.set(layout, plan);
  return plan;
}

// --- clues ----------------------------------------------------------------------------------------

// What can be said about where a spot (world/spots.js) is, from what the layout knows of its
// room: never its cube on a map, only words (docs/quests.md "Only where you have been"), as words
// to say in any language (src/i18n/i18n.js). landmarkName: a landmark prop's name as said.
export function clueOf(layout, spot, landmarkName = n => n) {
  const L = layout(spot.depth), k = spot.key, out = [];
  const route = L.route, at = L.routeIndex.get(k) ?? 0, last = route.length - 1;
  const site = (L.sitePlans.get(k) || []).find(i => i.landmark);
  const area = L.areaCells?.get(k), height = L.heightCells?.get(k), span = L.spanCells?.get(k);
  if (k === L.pinnacle) out.push(msg('up on the needle of rock'));
  else if (k === L.peak) out.push(msg('on top of the lone peak'));
  else if (k === L.lake) out.push(msg('by the great lake'));
  else if (area?.piece.kind === 'spiral') out.push(msg('at the foot of the great mountain'));
  else if (area?.piece.kind === 'hairpin') out.push(area.i === 0 ? msg('at the foot of the two bridges') : msg('up where the high bridge comes back'));
  else if (height) out.push({ ascent: msg('below the great cliff'), plateau: msg('up on the high plateau'), descent: msg('where the plateau comes down') }[height.role]
    ?? msg('by the high ground'));
  else if (span?.role === 'island') out.push(msg('on the island at the end of the long bridge'));
  if (site) out.push(phrase('near {landmark:the}', { landmark: noun(landmarkName(site.landmark)) }));
  if (L.hordes.has(k)) out.push(msg('where the horde gathers'));
  if (route.indexOf(k) < 0) out.push(msg('off the main way'));
  const gates = [...L.guardians].filter(([g, x]) => x.role === 'side' && route.indexOf(g) < at).length;
  if (gates) out.push(gates > 1 ? msg("past the guardians' gates") : msg("past the guardian's gate"));
  if (!out.length) out.push(at <= 2 ? msg('not far from where the depth begins') : at >= last - 2 ? msg('close to the way down') : msg('about halfway along'));
  const said = out.slice(0, 2).map(x => typeof x === 'string' ? phrase(x) : x);
  return said.length > 1 ? phrase('{a}, {b}', { a: said[0], b: said[1] }) : said[0];
}

// --- people somebody lost -------------------------------------------------------------------------

// how they are related to the one asking: a girl's or a boy's (as many of each, so a pick takes
// one random number either way)
const RELATIONS = { she: ['daughter', 'sister', 'friend', 'apprentice', 'cousin', 'granddaughter'],
  he: ['son', 'brother', 'friend', 'apprentice', 'cousin', 'grandson'] };
const LOST_TINTS = ['#e0c7a0', '#d9b48c', '#c99a86', '#b9c79a', '#d6a9a0'];
const LOST_OUTFITS = [['wear_explorer_hat'], ['wear_headscarf'], ['wear_straw_hat'], ['wear_hood'], ['held_rope'], []];
// who went missing for quest `seed`, whose `relation` they are to the one asking; avoid: names
// not to take (the one asking, the people the quests know already), if any are left
export function lostPerson(seed, avoid = new Set()) {
  const R = mulberry32(hash32(seed ^ 0x1057)), free = KIN_NAMES.filter(n => !avoid.has(n)), names = free.length ? free : KIN_NAMES;
  const name = names[Math.floor(R() * names.length)], relations = RELATIONS[isShe(name) ? 'she' : 'he'];
  return { name, relation: relations[Math.floor(R() * relations.length)],
    tint: LOST_TINTS[Math.floor(R() * LOST_TINTS.length)], outfit: LOST_OUTFITS[Math.floor(R() * LOST_OUTFITS.length)] };
}
// the camp a giver lives at (its spot plan), if it does
export function campOf(layout, giver) {
  const id = String(giver).slice(4), key = id.split(':')[1];
  if (!key) return null;
  const plan = layout(-Number(key.split(',')[1]))?.spots?.get(key)?.find(s => s.id === id);
  return plan?.kind === 'camp' ? plan : null;
}
export { residentOf };
