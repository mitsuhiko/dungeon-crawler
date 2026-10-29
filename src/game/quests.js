// The world's quests while playing (core/quests.js has the rules, docs/quests.md the design).
// The quest log is the world's (state.run.quests), shared by everyone in it: playing together the
// host's game keeps it and decides (the authority), the guests are told the log as it changes
// (relay.quests, net/session.js) and ask the host for what they do (relay.questAct). Alone, our
// game is the authority.
//
// What happens in the world comes in as events (questEvent): a cube visited (game/flow.js), a
// horde broken (game/enemies.js), standing beside a landmark (updateQuests looks), a guardian's
// gate open (the gates are looked at every half second). A quest handed in pays everyone in the
// game: the host pays itself and tells the others (relay.questReward), each game pays its own
// player once (grant).
import { player, state, setStatus } from './state.js';
import { online, relay } from '../net/online.js';
import { log } from './log.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { awardXP } from '../core/progression.js';
import { addCopper, addInstance, autoBar, fits, formatCoins, removeItem } from '../core/inventory.js';
import { ITEMS, HEALTH_POTION } from '../core/items.js';
import { dropAtFeet } from './loot.js';
import { giverOf, giverName, meet, fail, openedGates, makeQuest, refreshOffers, settle, questEvent as noteEvent, accept, archive, restart, handIn, wantsLandmark,
  progressOf, restoreProgress, checkQuestLog, checkRewards, packQuestLog, LANDMARK_REACH } from '../core/quests.js';
import { pickUpQuestItems, questWorldChanged, bountiesHere, guardsHere, guardsLeft } from './questworld.js';
import { allEnemies, addEnemies, mirroring } from './enemies.js';
import { rebuildWorld, refreshOpenFaces } from './flow.js';
import { drawTracker } from './questpanel.js';
import { tr, say, phrase, cleanWords } from '../i18n/i18n.js';
import { narrate } from './narrator.js';
import { foundSays } from '../core/questvoices.js';

const CHECK_EVERY = 0.5;   // s (real time): the gates looked at, offers brought up to date, a landmark looked for
// seen: the quests' states as last told (in run seenIn); sent: the log as last given out
let checkIn = 0, seen = null, seenIn = null, sent = null, sentVersion = -1;
// the quests paid here already (quest id, per world): a reward comes once
const granted = new Set();

export const questLog = () => state.run.quests;
// do we decide about the quests (alone, or the host), or does the host (a guest)?
export const questAuthority = () => online.role !== 'guest';
const ctx = () => ({ seed: state.cubes.seed, level: state.cubes.level, layout: state.cubes.layout, gates: state.run.unlockedGates, chests: state.run.chests,
  defeated: state.run.defeated, told: state.run.told, now: Date.now() });
// what the goals are checked against (core/quests.js goalDone)
const facts = () => ({ gates: state.run.unlockedGates, chests: state.run.chests, defeated: state.run.defeated, told: state.run.told });
const live = () => state.mode === 'play' && !!state.cubes && !!state.run?.quests;

// --- what happens ---------------------------------------------------------------------------------

// Something happened in the world (core/quests.js questEvent): the authority notes it, a guest
// tells the host
export function questEvent(ev) {
  if (!live()) return;
  if (ev.kind === 'lost') { questAct('fail', ev.quest); return; }   // a raid lost (game/defense.js)
  if (!questAuthority()) { relay.questAct?.({ act: 'event', ev }); return; }
  const paid = noteEvent(questLog(), ev, facts(), Date.now());
  for (const q of paid) payEveryone(q);
  share();
}

// What the players do with a quest: 'accept', 'archive', 'unarchive', 'restart', 'handIn'. A guest
// asks the host. true: done (or asked).
export function questAct(act, id) {
  if (!live()) return false;
  if (!questAuthority()) { relay.questAct?.({ act, id }); return true; }
  const done = doAct(act, id);
  share();
  return done;
}
function doAct(act, id) {
  const L = questLog(), gates = facts();
  switch (act) {
    case 'accept': return accept(L, id, gates);
    case 'archive': return archive(L, id, true, gates);
    case 'unarchive': return archive(L, id, false, gates);
    case 'restart': return restart(L, id, gates);
    case 'meet': return meet(L, id) && refreshOffers(L, ctx(), [id]);
    case 'fail': return fail(L, id);
    case 'handIn': {
      const q = handIn(L, id, Date.now());
      if (q) payEveryone(q);
      return !!q;
    }
  }
  return false;
}

// The host: what a guest asked for (net/session.js)
export function guestQuestAct(m) {
  if (!questAuthority() || !live() || !m || typeof m !== 'object') return;
  if (m.act === 'event' && m.ev && typeof m.ev === 'object') {
    const { kind, depth, key } = m.ev;
    if (['visit', 'horde', 'landmark'].includes(kind)) questEvent({ kind, depth: Number.isInteger(depth) ? depth : undefined, key: typeof key === 'string' ? key : undefined });
    if (['found', 'rescued', 'talked', 'defended'].includes(kind) && typeof m.ev.quest === 'string')
      questEvent({ kind, quest: m.ev.quest, ...(kind === 'found' && typeof m.ev.spot === 'string' ? { spot: m.ev.spot } : {}) });
  } else if (typeof m.id === 'string' && ['accept', 'archive', 'unarchive', 'restart', 'handIn', 'meet', 'fail'].includes(m.act)) { doAct(m.act, m.id); share(); }
}

// A guest: the host's quest log (net/session.js); fresh: it comes with the welcome (nothing to
// tell about it: it is not news)
export function takeQuestLog(packed, fresh = false) {
  if (!state.run) return;
  state.run.quests = checkQuestLog(packed);
  if (fresh) seen = null;
  share();
}

// --- paying -------------------------------------------------------------------------------------

function payEveryone(q) {
  relay.questReward?.(q.id, q.rewards, q.title);
  grant(q.id, q.rewards, q.title);
}
// A guest: the host says a quest was handed in: our reward (net/session.js)
export function questRewarded(id, rewards, title) {
  if (typeof id === 'string' && id.length <= 60) grant(id, checkRewards(rewards), cleanWords(title) || phrase('a quest'));
}
// pay our player for quest `id` (once): XP, coins, and the items into the bag (or at our feet
// when it is full)
function grant(id, rewards, title) {
  const key = `${state.cubes?.seed}:${id}`;
  if (granted.has(key)) return;
  granted.add(key);
  const levels = rewards.xp ? awardXP(player, rewards.xp) : 0;
  if (rewards.copper) addCopper(player.inventory, rewards.copper);
  for (const item of rewards.items) {
    const it = structuredClone(item);
    if (fits(player.inventory, it) && addInstance(player.inventory, it)) { if (ITEMS[it.itemId].use) autoBar(player.inventory, it.itemId); }
    else if (state.map) dropAtFeet(it);
  }
  log('quest', { title, what: 'done', xp: rewards.xp, copper: rewards.copper });
  setStatus([tr('Quest complete: {title}', { title: say(title) }), tr('+{xp} XP', { xp: rewards.xp }),
    ...rewards.copper ? [formatCoins(rewards.copper)] : []].join(' · '));
  sfx('coin', { pitch: 0.8 }); jingle('quest');
  if (levels) { log('level', { level: player.level }, { share: true }); jingle('levelup'); narrate('level'); }
}

// --- a death puts the cube back (game/flow.js) ------------------------------------------------

export const questMark = () => state.run?.quests ? progressOf(state.run.quests) : null;
export function restoreQuests(mark) {
  if (mark && questAuthority() && state.run?.quests) restoreProgress(state.run.quests, mark);
}

// --- every frame ----------------------------------------------------------------------------------

// tell what changed about the quests: a quest taken, its goals done, failed (a reward is told
// when it is paid)
function announce(L) {
  const now = new Map(L.list.map(q => [q.id, q.state]));
  if (seen && seenIn === state.run) for (const q of L.list) {
    const was = seen.get(q.id);
    if (!was || was === q.state) continue;
    const giver = giverName(q);
    const title = q.title, said = say(title);
    if (q.state === 'active' && was === 'offered') { log('quest', { title, what: 'taken' }); setStatus(tr('Quest taken: {title}', { title: said })); jingle('questtaken'); narrate('quest'); }
    else if (q.state === 'active' && was === 'failed') log('quest', { title, what: 'restarted' });
    else if (q.state === 'ready') {
      log('quest', { title, what: 'ready', giver: phrase('{giver:the}', { giver }) });
      setStatus(tr('Quest done: {title} · back to {giver}', { title: said, giver: tr('{giver:the}', { giver }) })); sfx('unlock');
    } else if (q.state === 'failed') { log('quest', { title, what: 'failed' }); setStatus(tr('Quest failed: {title}', { title: said })); jingle('questfailed'); }
  }
  seen = now; seenIn = state.run;
}

let landmarkSaid = '';
// main.js, every frame
export function updateQuests(dt) {
  if (!live()) return;
  const L = questLog();
  if ((checkIn -= dt) <= 0) {
    checkIn = CHECK_EVERY;
    if (questAuthority()) {
      for (const q of settle(L, facts(), Date.now())) payEveryone(q);
      refreshOffers(L, ctx());
    }
    // standing beside a landmark a quest wants
    const site = state.map && !state.transitioning && wantsLandmark(L, state.cubeKey)
      && (state.map.rewardSites ?? []).find(s => s.landmark && s.anchor);
    if (site && Math.hypot(site.anchor.x - player.x, site.anchor.z - player.z) <= LANDMARK_REACH && Math.abs(site.anchor.y - player.y) < 2.5
      && landmarkSaid !== `${state.cubeKey}:${L.version}`) {
      landmarkSaid = `${state.cubeKey}:${L.version}`;
      questEvent({ kind: 'landmark', key: state.cubeKey });
    }
    // the sealed portals the quests taken open (an annex's): open for good, for everyone
    for (const g of openedGates(L)) if (!state.run.unlockedGates.has(g)) { state.run.unlockedGates.add(g); refreshOpenFaces(); }
    // somebody lost found, a chest opened, a quest taken: the cube as it is now
    if (state.map && !state.transitioning && questWorldChanged()) rebuildWorld();
    // a bounty waiting here (where we run the enemies): on its hiding place
    if (state.map && !state.transitioning && !mirroring()) {
      const here = new Set(allEnemies().map(e => e.id)), missing = [...bountiesHere(), ...guardsHere()].filter(e => !here.has(e.id));
      if (missing.length) addEnemies(missing);
    }
  }
  pickUpQuestItems(questEvent);
  share();
  drawTracker();
}
// what changed is told: on our screen, and (the authority) to the others
function share() {
  const L = questLog();
  if (!L || L.version === sentVersion && sent === L) return;
  sentVersion = L.version; sent = L;
  announce(L);
  if (questAuthority()) relay.quests?.(packQuestLog(L));
}
// a guest just came in: the log goes out again (net/session.js)
export const questLogPacked = () => state.run?.quests ? packQuestLog(state.run.quests) : null;

// --- the dev tools ------------------------------------------------------------------------------

// /quest <kind> [depth] [twist] (game/devcommands.js): a quest of that kind there, taken at once,
// from somebody who could give it (with that twist: core/quests.js TWISTS; null: none). What it
// says (or why not).
let devSerial = 0;
export function devQuest(kind, depth, twist) {
  if (!live()) return 'No world';
  if (!questAuthority()) return 'Only the host makes quests';
  const L = questLog(), c = ctx(), layout = c.layout(depth), spots = [depth, depth - 1, depth - 2].filter(d => d >= 0).flatMap(d => c.layout(d).spotList);
  const camp = spots.find(s => s.kind === 'camp'), outpost = layout.spotList.find(s => s.kind === 'outpost');
  const seat = layout.spotList.find(s => s.kind === 'seat');
  const giver = kind === 'rescue' ? camp && `npc:${camp.id}` : kind === 'defense' ? outpost && (outpost.annex ? (seat ? `npc:${seat.id}` : 'innkeeper') : `npc:${outpost.id}`) : 'innkeeper';
  if (!giver) return `Nobody near depth ${depth} could ask for that`;
  const q = makeQuest(L, c, giver, { id: `dev:${++devSerial}`, depth, kind, force: true, ...(twist !== undefined ? { twist } : {}) });
  if (!q || q.kind !== kind) return `No ${kind} quest fits on depth ${depth} now`;
  L.list.push(q); L.version++;
  doAct('accept', q.id);
  share();
  const key = q.stages[0].key ?? q.stages[0].keys?.join(', ');
  return `${say(q.title)}: ${say(q.stages[0].text)}${key ? ` (cube ${key})` : ''}`;
}

// --- talking to a giver ---------------------------------------------------------------------------

// talking to somebody a quest sends us to (a letter for them, a question; game/questworld.js puts
// the ones waiting on a hiding place there): what they say, or null
export function questTalk(v) {
  if (!live()) return null;
  const giver = giverOf(v);
  for (const q of questLog().list) {
    const s = q.stages[q.stage];
    if (q.state !== 'active' || q.archived || !['deliver', 'talk'].includes(s?.goal)) continue;
    if (!(giver && s.to.resident === giver || v.helper === q.id)) continue;
    questEvent({ kind: 'talked', quest: q.id });
    return s.reply ? say(s.reply) : tr('{name}: Thank you!', { name: s.to.name });
  }
  return null;
}
// talking to somebody a quest is looking for (game/questworld.js): found! They thank you. But not
// while their guards stand, and somebody hurt first needs a health potion (core/quests.js TWISTS)
export function rescue(v) {
  if (!v?.lost || !live()) return false;
  const q = questLog().list.find(x => x.id === v.lost), s = q?.stages[q.stage];
  if (s && guardsLeft(q, s)) { setStatus(tr('{name}: Help! Not while they are still here!', { name: v.name })); return true; }
  if (s?.hurt) {
    const potion = player.inventory.slots.find(x => x?.itemId === HEALTH_POTION.id);
    if (!potion) { setStatus(tr('{name} is hurt and cannot walk. Bring a health potion!', { name: v.name })); return true; }
    removeItem(player.inventory, potion.instanceId, 1);
    sfx('drink');
  }
  setStatus(tr(foundSays(v.lost), { name: v.name }));
  questEvent({ kind: 'rescued', quest: v.lost });
  return true;
}

// what talking to villager v is about: their offers brought up to date first (the authority)
export function talkQuests(v) {
  const giver = giverOf(v);
  if (!giver || !live()) return giver;
  if (!questLog().met.includes(giver) && v.giver) questAct('meet', giver);   // somebody out in the world: met now
  if (questAuthority()) refreshOffers(questLog(), ctx(), [giver]);
  return giver;
}
