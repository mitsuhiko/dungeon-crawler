// What the quests put in the cube we are in (docs/quests.md, "Find"): a thing to find lying on its
// hiding place, somebody lost standing on theirs, a treasure's chest; and the people found who
// live at a camp now. They show only while a quest going on (not archived) has them as its goal,
// on the spots the world keeps free for them (world/spots.js, cubegen/spots.js), so the world
// itself never depends on the quests.
//
// The people and the chests are part of the cube as it is built (game/flow.js enterCube calls
// questWorld; updateQuests builds the cube again when they change); the things are drawn with
// the loot (game/loot.js) and picked up by walking onto them.
import { state, player, setStatus, worldLevel } from './state.js';
import { npcsIn } from './npcs.js';
import { questGoalsIn, livingAt, giverName, stageKey } from '../core/quests.js';
import { ITEMS } from '../core/items.js';
import { loadPropSets } from '../render/props.js';
import { propSetsOf } from '../render/propplace.js';
import { themeOf } from '../themes/depth.js';
import { sfx } from '../audio/sfx.js';
import { makeEnemy, coinRange, ENEMY_KINDS, depthLevel } from '../core/enemies.js';
import { walkable, groundY } from '../physics/enemynav.js';
import { addEnemies, mirroring } from './enemies.js';
import { hash32 } from '../core/util.js';
import { hashString } from '../core/gear/drops.js';
import { bountyKind, bountyLevel } from '../core/bounties.js';
import { residentsOf, spotOfGiver, keyOfSpot } from '../core/npcs.js';
import { TOWN_KEY, isInterior } from '../world/town.js';
import { isIntroGate } from '../core/intro.js';
import { parse, step, faceKey } from '../world/coords.js';
import { tr, noun, say } from '../i18n/i18n.js';

const FIND_REACH = 0.75;   // cells: walking this close to a thing picks it up

const spotOf = (map, id) => (map.spots ?? []).find(s => s.id === id) ?? null;

// The quests' part of map m, as it should be now: { people, chests, placements, sig }
function overlay(map, log) {
  const people = [], chests = [], placements = [];
  if (!log || map.interior) return { people, chests, placements, sig: '' };
  for (const { quest, stage } of questGoalsIn(log, map.key)) {
    const s = spotOf(map, stage.spot ?? stage.to?.spot);
    if (!s) continue;
    if ((stage.goal === 'deliver' || stage.goal === 'talk') && stage.to.spot) {
      const s2 = spotOf(map, stage.to.spot), p = stage.to.person;
      if (s2) people.push({ id: `${quest.id}:helper`, helper: quest.id, name: say(stage.to.name), title: stage.to.title, tint: p.tint, outfit: p.outfit,
        x: s2.anchor.x, y: s2.anchor.y, z: s2.anchor.z, yaw: s2.approach ? Math.atan2(s2.approach.x - s2.anchor.x, s2.approach.z - s2.anchor.z) : 0 });
      continue;
    }
    if (stage.goal === 'rescue') {
      const p = stage.person;
      people.push({ id: `${quest.id}:lost`, lost: quest.id, name: p.name, title: p.name, tint: p.tint, outfit: p.outfit,
        x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw: s.approach ? Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z) : 0 });
    }
  }
  // a treasure's chest: closed while its quest is going on, and once opened it stays (open), like
  // a reward site's
  for (const q of log.list) {
    const stage = q.kind === 'treasure' && q.stages.find(x => x.goal === 'open'), s = stage?.key === map.key && spotOf(map, stage.spot);
    if (!s || !(state.run.chests.has(stage.chest) || q.state === 'active' && !q.archived)) continue;
    const yaw = Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z);
    chests.push({ id: stage.chest, prestige: stage.prestige ?? 'basic', quest: q.id, anchor: { ...s.anchor, yaw }, approach: s.approach,
      cells: s.cells, layer: s.layer, landmark: null });
    placements.push({ name: 'treasure_chest', x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw, s: 0.8, site: stage.chest });
  }
  // the people found, at the camp of whoever asked (its places beside the resident's)
  for (const s of (map.spots ?? []).filter(x => x.kind === 'camp'))
    livingAt(log, s.id).forEach((p, i) => {
      const at = s.places[1 + i];
      if (at) people.push({ id: `${p.id}:home`, name: p.name, title: p.name, tint: p.tint, outfit: p.outfit, home: true, ...at });
    });
  return { people, chests, placements, sig: [...people.map(p => p.id), ...chests.map(c => c.id)].join('|') };
}

// the sides of map whose portals are sealed: an annex's, the beginning's
const sealedSides = map => [0, 1, 2, 3].filter(d => {
  const g = map.gateKeys?.[d];
  return (g?.startsWith('annex:') || isIntroGate(g)) && !state.run?.unlockedGates.has(g);
});

// Put the quests' part into map m (game/flow.js, before the cube is built): its people with the
// residents (map.npcs), its chests with the reward sites. The signature of what was put there.
export function questWorld(map) {
  map.baseSites ??= map.rewardSites ?? [];
  map.basePlacements ??= map.sitePlacements ?? [];
  const o = overlay(map, state.run?.quests);
  map.npcs = [...npcsIn(map), ...o.people];
  map.rewardSites = [...map.baseSites, ...o.chests];
  map.sitePlacements = [...map.basePlacements, ...o.placements];
  // an annex's portal, sealed until a quest opens it, and the beginning's gates (core/intro.js)
  // until their things are found (render/markers.js draws them grey)
  map.sealed = sealedSides(map);
  map.questSig = o.sig + '|' + map.sealed.join(',');
  if (o.placements.length) loadPropSets(propSetsOf(map, themeOf(map))).catch(() => {});   // (the chest's set; game/flow.js builds again once in)
  return o.sig;
}
// has the quests' part of the cube we are in changed since it was built?
export const questWorldChanged = () => !!state.map && overlay(state.map, state.run?.quests).sig + '|'
  + sealedSides(state.map).join(',')
  !== (state.map.questSig ?? '');

// the things to find lying here, as pickups to draw (render/loot.js drawLoot)
export function questItemsHere() {
  const map = state.map, log = state.run?.quests;
  if (!map || !log || map.interior) return [];
  const out = [];
  const thing = (quest, stage, spot, part) => {
    const s = spotOf(map, spot);
    if (s) out.push({ id: `q:${quest.id}${part ? `:${spot}` : ''}`, quest: quest.id, spot: part ? spot : undefined, itemId: stage.item,
      label: stage.label, x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, toss: 1, phase: 0, from: [s.anchor.x, s.anchor.y, s.anchor.z], count: 1,
      questItem: true });
  };
  for (const { quest, stage } of questGoalsIn(log, map.key)) {
    if (stage.goal === 'find' && !stage.done) thing(quest, stage, stage.spot, false);
    // a gathering's things here not picked up yet
    if (stage.goal === 'gather') stage.spots.forEach((spot, i) => { if (!stage.got[i] && stage.keys[i] === map.key) thing(quest, stage, spot, true); });
  }
  return out;
}

// Every frame (game/quests.js): walking onto a thing picks it up for its quest (but not while its
// guards stand: core/quests.js TWISTS). found: the quest event to raise.
const picked = new Set();
let guardedSaid = '';
export function pickUpQuestItems(found) {
  if (state.transitioning || player.hp <= 0 || player.ragdoll) return;
  for (const p of questItemsHere()) {
    if (picked.has(p.id) || Math.hypot(p.x - player.x, p.z - player.z) > FIND_REACH || Math.abs(p.y - player.y) > 1) continue;
    const q = state.run.quests.list.find(x => x.id === p.quest), s = q?.stages[q.stage], thing = noun(ITEMS[p.itemId].name);
    if (s && guardsLeft(q, s)) {
      if (guardedSaid !== p.id) { guardedSaid = p.id; setStatus(tr('Its guards are still here! Beat them first.')); sfx('block'); }
      continue;
    }
    picked.add(p.id);
    if (s?.ambush) ambush(q, s, p);
    const giver = q ? giverName(q) : noun('whoever asked', { proper: true });
    sfx('pickup');
    if (p.spot) {
      const have = (s?.got?.filter(Boolean).length ?? 0) + 1, need = s?.got?.length ?? have;
      setStatus(have >= need ? tr('That is all of them! Bring them back to {giver:the}', { giver }) : tr('Found one! {have} of {need}', { have, need }));
    } else setStatus(tr('Found {thing:the}! Bring {thing:it} back to {giver:the}', { thing, giver }));
    found({ kind: 'found', quest: p.quest, spot: p.spot });
  }
}
// a death put the cube back: what was picked up there may be picked up again
export const forgetPicked = () => { picked.clear(); guardedSaid = ''; };

// --- twists (core/quests.js TWISTS): guards round a hiding place, an ambush on it ---------------

const guardIds = (q, s) => Array.from({ length: s.guards?.n ?? 0 }, (_, i) => `q:${q.id}:g${i}`);
// are some of stage s's guards (quest q's) still standing?
export const guardsLeft = (q, s) => guardIds(q, s).some(id => !state.run.defeated.has(id));
// the floors round point `at` an enemy of `height` can stand on (lo to hi cells off, about level
// with it, not on a planned spot or in a fluid), in an order of the quest's own
function floorsRound(at, lo, hi, height, seed) {
  const order = f => hash32(seed ^ Math.imul(f.x + 97, 0x9e3779b1) ^ Math.imul(f.z + 89, 0x85ebca6b));
  return (state.map.floors ?? []).filter(f => {
    const d = Math.hypot(f.x + .5 - at.x, f.z + .5 - at.z);
    return d >= lo && d <= hi && Math.abs(groundY(f, f.x + .5, f.z + .5) - at.y) < 1.6 && walkable(f, height) && !f.spot && !f.fluid;
  }).sort((a, b) => order(a) - order(b));
}
// enemies of kind `type` at depth's level on floors round `at`, facing it, with these ids
function standRound(type, depth, at, ids, lo, hi, seed) {
  const kind = ENEMY_KINDS[type], level = depthLevel(depth, worldLevel()), floors = floorsRound(at, lo, hi, kind.height, seed);
  if (!floors.length) return [];
  return ids.map((id, i) => {
    const f = floors[i % floors.length], x = f.x + .5, z = f.z + .5, [lo2, hi2] = coinRange(kind, level);
    return makeEnemy({ id, level, coinDrop: Math.round((lo2 + hi2) / 3), kind, f, x, y: groundY(f, x, z), z, yaw: Math.atan2(at.x - x, at.z - z) }, kind, i);
  });
}
// the guards standing here (core/quests.js TWISTS), as enemies (game/quests.js adds them), but
// those defeated: round their hiding place (or their bounty)
export function guardsHere() {
  const map = state.map, log = state.run?.quests;
  if (!map || !log || map.interior) return [];
  const out = [];
  for (const { quest, stage } of questGoalsIn(log, map.key)) {
    if (!stage.guards) continue;
    const s = spotOf(map, stage.spot), ids = guardIds(quest, stage).filter(id => !state.run.defeated.has(id));
    if (s && ids.length) out.push(...standRound(stage.guards.enemy, stage.depth, s.anchor, ids, 1.4, 3.6, hash32(hashString(quest.id))));
  }
  return out;
}
// picking up quest q's thing springs its ambush: they come running from a few cells off (only the
// game that runs the cube's enemies)
let sprung = 0;
function ambush(q, s, p) {
  if (mirroring()) return;
  const n = ++sprung, ids = Array.from({ length: s.ambush.n }, (_, i) => `q:${q.id}:a${n}:${i}`);
  const list = standRound(s.ambush.enemy, s.depth, { x: p.x, y: p.y, z: p.z }, ids, 4, 7.5, hash32(hashString(q.id) ^ n));
  if (!list.length) return;
  // (they know where you are: noticed, they turn and come running)
  for (const e of list) Object.assign(e, { mode: 'alert', t: 0.4, speed: 0, seen: { x: player.x, y: player.y, z: player.z, f: null }, lost: 0 });
  addEnemies(list);
  setStatus(tr('An ambush!'));
  sfx('unlock');
}

// the bounties waiting here (core/bounties.js), as enemies (game/quests.js adds them), but those
// defeated: on their hiding place, facing where you come from
export function bountiesHere() {
  const map = state.map, log = state.run?.quests;
  if (!map || !log || map.interior) return [];
  const out = [];
  for (const { stage } of questGoalsIn(log, map.key)) {
    if (stage.goal !== 'bounty' || state.run.defeated.has(stage.enemyId)) continue;   // (its gang: guardsHere)
    const s = spotOf(map, stage.spot), f = s && map.floors[s.floor];
    if (!f) continue;
    const kind = bountyKind(stage.enemy, stage.name), level = bountyLevel(stage.depth, worldLevel()), [lo, hi] = coinRange(kind, level);
    out.push(makeEnemy({ id: stage.enemyId, level, coinDrop: Math.round((lo + hi) / 2), kind, f,
      x: s.anchor.x, y: s.anchor.y, z: s.anchor.z, yaw: Math.atan2(s.approach.x - s.anchor.x, s.approach.z - s.anchor.z) }, kind, 0));
  }
  return out;
}

// Where quest q wants you now, for the minimap (game/minimap.js): { key, at } with `at` the place
// in that cube ({ x, z } in cells) or null (somewhere in it). Only a cube somebody has been to
// (docs/quests.md, rule 2), else null. People one is sent to (whoever lives at a seat, a camp, an
// outpost; a villager, a giver out in the world to hand in to) and an outpost's cart are pinned
// where they stand; what has to be looked for (a hiding place, a landmark, a guardian, a horde)
// only by its cube: the clue says the rest.
export function questTarget(q, cubes = state.cubes) {
  const goal = questGoal(q), c = goal?.key && cubes?.cubes.get(goal.key);
  if (!c?.visits) return null;
  let at = null;
  if (goal.resident) at = residentsOf((c.map.spots ?? []).filter(s => s.id === goal.resident))[0];
  else if (goal.villager) at = c.map.villagers?.find(x => x.name === goal.villager);
  else if (goal.cart) at = spotOf(c.map, goal.cart)?.anchor;
  return { key: c.key, at: at ? { x: at.x, z: at.z } : null };
}
// what quest q wants now, wherever that is: { key (the cube; null: only a depth to get to),
// depth, and who or what to pin there: resident (a spot's id), villager (a name), cart (a spot's
// id) }; null: nothing (offered, done, archived)
function questGoal(q) {
  if (!q || q.archived) return null;
  const resident = giver => { const id = spotOfGiver(giver), key = id && keyOfSpot(id); return key && { key, depth: -parse(key)[1], resident: id }; };
  if (q.state === 'ready') return spotOfGiver(q.giver) ? resident(q.giver) : { key: TOWN_KEY, depth: 0, villager: q.giver };
  if (q.state !== 'active' && q.state !== 'failed') return null;
  const stage = q.stages[q.stage];
  if (!stage) return null;
  if ((stage.goal === 'deliver' || stage.goal === 'talk') && stage.to?.resident) return resident(stage.to.resident);
  const key = stageKey(stage);
  return { key, depth: key ? -parse(key)[1] : stage.depth, cart: stage.goal === 'defend' ? stage.spot : null };
}

// Which way out of cube `from` leads towards quest q's goal (for the minimap's arrow on that
// gate): 0-3 a side, 4 down, 5 up; null: the goal is here, or there is no way known. Deeper: the
// way to the depth's way down, higher up: to its way up, on the depth: the shortest way to the
// goal's cube, through the portals of the depth's plan (world/layout.js) and the faces discovery
// opened. Only ever the gate of the cube one is in, which the minimap shows anyway: the way past
// it is not given away.
export function questWay(q, from = state.cubeKey, cubes = state.cubes) {
  const goal = questGoal(q);
  if (!goal || !from || !cubes || isInterior(from) || from === goal.key) return null;
  const depth = -parse(from)[1], L = cubes.layout(depth);
  if (goal.depth > depth) return from === L.down ? 4 : wayOnDepth(L, from, L.down);
  if (goal.depth < depth) return from === L.up ? 5 : wayOnDepth(L, from, L.up);
  return goal.key ? wayOnDepth(L, from, goal.key) : null;
}
function wayOnDepth(L, from, to, opened = state.openedFaces ?? new Set()) {
  if (!to || !L.exists.has(from) || !L.exists.has(to)) return null;
  const prev = new Map([[from, null]]), queue = [from];
  for (let i = 0; i < queue.length && !prev.has(to); i++) {
    const k = queue[i];
    for (let d = 0; d < 4; d++) {
      const n = step(k, d), f = faceKey(k, d);
      if (prev.has(n) || !L.exists.has(n) || !(L.portals.has(f) || opened.has(f))) continue;
      prev.set(n, [k, d]); queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  let k = to;
  while (prev.get(k)[0] !== from) k = prev.get(k)[0];
  return prev.get(k)[1];
}

// What there is to notice coming into a cube with a quest's goal in it: said once a visit
export function noticeQuestGoals() {
  const log = state.run?.quests;
  if (!log || !state.map) return;
  const here = questGoalsIn(log, state.map.key), goals = here.map(g => g.stage.goal);
  if (here.some(g => g.stage.guards && g.stage.goal !== 'bounty' && guardsLeft(g.quest, g.stage))) setStatus(tr('Something is guarded here...'));
  else if (goals.includes('bounty')) setStatus(tr('Something big is prowling about here...'));
  else if (goals.includes('rescue')) setStatus(tr('You hear somebody calling for help!'));
  else if (goals.includes('find') || goals.includes('gather')) setStatus(tr('Something glints somewhere here...'));
  else if (goals.includes('open')) setStatus(tr('The cross on the map must be here somewhere!'));
}
