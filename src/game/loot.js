// Loot lying in the cubes: defeated enemies scatter their coins and sometimes a weapon. Walking
// over coins and stackables takes them, coins within a cell pull themselves in, and the action
// key (F or right Ctrl, game/action.js, when no chest or villager is beside the player) pulls in
// every stackable pickup within four cells. Weapons are only taken on purpose: click one (or
// its label) to walk there and pick it up, or take it in the inventory (game/inventory.js), which also
// puts things from the bag back on the floor. Pickups stay where they fell (per cube, for the
// whole run) until collected. They are credited when they reach the player.
//
// They lie on the ground that stays (physics/rest.js): never on one of Foggery's platforms (it
// would slide away from under them), never in a pit of lava or acid. Ground that goes from under
// one (a trial's crumbling crust, a black hole opening) lets it fall to the ground under it; with
// none, or a pit, it goes to the nearest dry spot. A standing fluid that rises and falls may go over
// it (Foggery's lava over what his death scatters): nothing under a deep one can be taken until it
// drains (`drowned`).
//
// Every drop has a source: an enemy (`e:<id>`, from its second life `e:<id>~<life>`, core/respawn.js), a chest (`c:<site id>`) or something put down
// from the bag (`b:<player>:<page><n>`), and each pickup is `<source>#<i>`. A source drops once per
// run (run.dropped), until a death puts its enemy back (forgetLoot).
//
// Playing together the floor loot is shared: one copy of every pickup, for whoever takes it
// first. Whoever killed the enemy or opened the chest rolls the drop (it leans towards their
// weapons) and sees it at once; the host decides (net/session.js): the first drop of a source
// stands, and the others get that one instead of their own. Taking a pickup is a claim: the
// host's and a lone player's stand at once, a guest's flies in at once but is only credited
// once the host says it is theirs (or flies on to whoever got it first).
//
// A pickup: { id, source, seq, itemId, count, gen?, x, y, z, from, toss, phase, fly, claim,
// refused, kept? }; gen: a generated weapon's own data; kept: put down by the player or
// spilled by a chest (a death leaves it); seq: the order they came onto this game's floors;
// claim: null, 'mine' (it is ours), 'asked' (the host has not answered yet) or 'other' (going
// to another player); fly: { t, dur, to? (the player number it flies to, not us) };
// carried: something else moves it for now (Flip's world turning, game/flipworld.js), it does not
// settle; vy: falling.
import { player, state, setStatus } from './state.js';
import { coinDrops, inCollectReach, inMagnetReach, inFloorReach, steppedOn, walkTakes } from '../core/loot.js';
import { addItem, addInstance, takeItem, isBound, formatCoins, autoBar, fits, equippedItem, bareSlots } from '../core/inventory.js';
import { ITEMS } from '../core/items.js';
import { RARITY, rarityOf } from '../core/gear/rarities.js';
import { enemyDrops } from '../core/gear/drops.js';
import { enchantOf } from '../core/gear/enchants.js';
import { dropSource } from '../core/respawn.js';
import { favoredKind } from '../core/combat.js';
import { displayName, itemWords } from '../core/gear/stats.js';
import { inFluid } from '../physics/fluid.js';
import { restGround, scatterSpot, settle } from '../physics/rest.js';
import { drawLoot, lootLanded } from '../render/loot.js';
import { questItemsHere } from './questworld.js';
import { introThingsHere } from './intro.js';
import { floatText } from '../render/floattext.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { online, relay } from '../net/online.js';
import { log } from './log.js';
import { tr } from '../i18n/i18n.js';
import { narrate } from './narrator.js';

export const TOSS_TIME = 0.55;   // the arc out of the body
const TAKE_REACH = 0.6;          // a clicked pickup is taken from this close (cells)
const TO_FRIEND = 0.3;           // s a pickup takes to fly to the friend who got it
let seq = 1, bagDrops = 0, collectRequested = false;
// what this page puts down from the bag is `b:<player>:<page><n>`: a saved world (or a friend's
// we come back to after a reload) may still hold what an earlier page put down
const page = Math.random().toString(36).slice(2, 7);
let gained = null, quiet = 0;      // pickups credited recently, shown together
let settledIn = null;              // the cube whose loot has settled once (a new one's snaps, unseen)

export const lootHere = () => state.run.loot.get(state.cubeKey) || [];
const lootIn = key => { let l = state.run.loot.get(key); if (!l) state.run.loot.set(key, l = []); return l; };
export function requestCollect() { collectRequested = true; }
// what a collect (the action key, game/action.js) would take
export const collectable = () => lootHere().filter(p => !p.fly && !p.claim && p.toss >= 0 && walkTakes(p)
  && inCollectReach(p, player.x, player.y, player.z) && !drowned(p));
// is pickup p under a fluid too deep to reach into (a boss's lava over it)?
export const drowned = p => !!inFluid(restGround(p.x, p.z, p.y), p.y + 0.01);
// pickups dropped from now on have seq >= lootMark(); forgetLoot takes their drops out of a
// cube again (except what is kept)
export const lootMark = () => seq;
export function forgetLoot(key, mark) {
  const sources = new Set((state.run.loot.get(key) ?? []).filter(p => p.seq >= mark && !p.kept && !p.claim).map(p => p.source));
  if (!sources.size) return;
  forgetDrops(key, sources);
  relay.forget?.(key, [...sources]);
}
// the drops of `sources` (a Set) in cube key are undone: they can drop again
export function forgetDrops(key, sources) {
  const list = state.run.loot.get(key);
  if (list) state.run.loot.set(key, list.filter(p => !sources.has(p.source) || p.claim));
  for (const s of sources) state.run.dropped.delete(s);
}

// a landing spot near (x, y, z), between near and far away (physics/rest.js scatterSpot)
const landing = (x, y, z, near = 0.3, far = 0.8) => scatterSpot(x, y, z, near, far);
// Pickups lying about come to rest on the ground that stays under them (physics/rest.js
// settle); `snap`: no falling (a cube just come into: what was already there lies where it rests)
function settleAll(list, dt, snap) {
  for (const p of list) {
    if (p.toss < 1 || p.fly || p.claim || p.carried) continue;
    if (settle(p, dt, snap)) p.gen ? landed(p) : sfx('clink', { at: p, volume: 0.4 });   // (a noticeable fall: it lands again)
  }
}

function place(list, item, id, source, at, from, extra = {}) {
  const p = { id, source, seq: seq++, itemId: item.itemId, count: item.count ?? 1, ...item.gen ? { gen: item.gen } : {},
    ...at, from, toss: 0, phase: Math.random() * Math.PI * 2, fly: null, claim: null, refused: false, ...extra };
  list.push(p);
  return p;
}

// what enemy e leaves behind: its coins and its seeded weapon, armor, potion and crystal drops
// (core/gear/drops.js), leaning towards our weapons and the armor we lack (we killed it); a Shiny weapon in hand shakes
// more coins loose (core/gear/enchants.js)
export function dropLoot(e, copper) {
  const source = dropSource(e);
  if (state.run.dropped.has(source)) return;
  const shiny = enchantOf(equippedItem(player.inventory));
  if (shiny?.id === 'shiny') copper = Math.round(copper * (1 + shiny.value / 100));
  const items = enemyDrops(e, state.map?.seed ?? 0, favoredKind(player), bareSlots(player.inventory));
  // (nothing at all: a Custo triangle, mostly; from where it went, if not its body: Renew's, out of the sky)
  if (copper || items.length) spill(source, e, copper, items, {}, e.lootFrom ?? undefined);
}
// coins and items of drop `source` bursting out of a body (or a chest: `from`) and landing
// around `at`; extra: what every pickup carries; delay: seconds before the first one comes out
// (hidden till then); stow(pickups): puts them somewhere to wait and start from instead (a
// chest, inside it: render/chests.js stowLoot)
export function spill(source, at, copper, items, extra = {}, from = { x: at.x, y: at.y + 0.4, z: at.z }, delay = 0, stow = null) {
  const wait = delay / TOSS_TIME, list = lootIn(state.cubeKey), out = [];
  const id = () => `${source}#${out.length}`;
  coinDrops(copper).forEach((d, i) => out.push(place(list, d, id(), source, landing(at.x, at.y, at.z), from, { toss: -wait - i * 0.06, ...extra })));   // one after another
  items.forEach((item, i) => out.push(place(list, item, id(), source, landing(at.x, at.y, at.z, 0.5, 1.1), from, { toss: -wait - 0.15 - i * 0.18, ...extra })));
  stow?.(out);
  state.run.dropped.add(source);
  relay.drop?.(state.cubeKey, source, out);
  return out;
}

// put item ({ itemId, count, gen? }) down at the player's feet; it stays there through a death
export function dropAtFeet(item) {
  const source = `b:${online.slot ?? 0}:${page}${++bagDrops}`;
  const p = place(lootIn(state.cubeKey), item, `${source}#0`, source, landing(player.x, player.y, player.z, 0.35, 0.8),
    { x: player.x, y: player.y + 0.5, z: player.z }, { kept: true, refused: true });   // refused: not straight back in when walking over it
  state.run.dropped.add(source);
  relay.drop?.(state.cubeKey, source, [p]);
  return p;
}
// a bag item onto the floor (the inventory): false when there is no such item
export function dropFromBag(instanceId) {
  const slot = player.inventory.slots.find(s => s?.instanceId === instanceId);
  if (slot && isBound(slot.itemId)) { setStatus(tr('{item} cannot be dropped', { item: tr(ITEMS[slot.itemId].name) })); return false; }
  const item = takeItem(player.inventory, instanceId);
  if (!item) return false;
  dropAtFeet(item); sfx('toss');
  setStatus(tr('Dropped {item}', { item: displayName(item) }));
  return true;
}

// Take p: claim it and pull it towards the player (delay before it lifts off, dur of the
// flight; none: it goes straight into the bag once it is ours, the inventory). Playing together
// as a guest the host says whether it is ours.
function claim(p, delay = null, dur = 0) {
  p.claim = relay.take ? relay.take(state.cubeKey, p) : 'mine';
  if (delay !== null) p.fly = { t: -delay, dur };
}
// would p go into the bag? (asked before claiming: what we claim we can take)
const room = p => fits(player.inventory, p);

function credit(p) {
  if (p.gen ? !addInstance(player.inventory, p) : !addItem(player.inventory, p.itemId, p.count)) return false;
  autoBar(player.inventory, p.itemId);   // a potion goes on the quick bar
  gained ||= { copper: 0, items: new Map(), color: null };
  const def = ITEMS[p.itemId];
  if (def.category === 'currency') { gained.copper += def.value * p.count; sfx('coin', { pitch: def.value >= 1000 ? 0.8 : def.value >= 10 ? 0.9 : 1 }); }
  else {
    const name = displayName(p);   // (said now: the line is shown at once)
    gained.items.set(name, (gained.items.get(name) || 0) + p.count);
    if (p.gen) {
      const r = rarityOf(p);
      gained.color = r.css;
      // an unusual one (or better) goes into the chronicle; a remarkable one (or better) the friends hear of
      if (r.rank >= RARITY.unusual.rank) log('loot', { item: itemWords(p), rarity: r.id }, { share: r.rank >= RARITY.remarkable.rank });
      if (r.rank >= RARITY.remarkable.rank) narrate('loot');
    }
    sfx('pickup');
  }
  quiet = 0;
  return true;
}
// ours now, into the bag; no room after all (it filled up meanwhile): down at our feet again
function receive(p) {
  if (credit(p)) return;
  setStatus(tr('Inventory is full'));
  dropAtFeet({ itemId: p.itemId, count: p.count, ...p.gen ? { gen: p.gen } : {} });
}

function announce(dt) {
  if (!gained || (quiet += dt) < 0.25) return;
  const parts = [...gained.copper ? ['+' + formatCoins(gained.copper)] : [], ...[...gained.items].map(([n, c]) => c > 1 ? `+${c} ${n}` : `+${n}`)];
  const single = gained.items.size === 1 && !gained.copper && gained.color;
  floatText(parts.join('  '), q => q.set(player.x, player.visY + 1.55, player.z), { life: single ? 1.6 : 1.2, ...single ? { color: single } : {} });
  setStatus(tr('Picked up {what}', { what: parts.join(', ').replace(/\+/g, '') }));
  gained = null;
}

const available = p => p.toss >= 1 && !p.fly && !p.claim && lootHere().includes(p) && !drowned(p);
// the clicked pickup p: the player is at it (game/orders.js); fly it in, or say why not
export function takePickup(p) {
  if (!available(p)) return false;
  if (!room(p)) { setStatus(tr('Inventory is full')); return false; }
  claim(p, 0, 0.22);
  return true;
}
export const canReachPickup = p => Math.hypot(p.x - player.x, p.z - player.z) <= TAKE_REACH && Math.abs(p.y - player.y) <= 0.8;
// straight into the bag (the inventory): false when there is no room (a guest's waits for the
// host's word, hidden meanwhile)
export function takeNow(p) {
  const list = lootHere(), i = list.indexOf(p);
  if (i < 0 || p.fly || p.claim || drowned(p)) return false;
  if (!room(p)) { setStatus(tr('Inventory is full')); return false; }
  claim(p);
  if (p.claim === 'mine') { list.splice(list.indexOf(p), 1); receive(p); }
  return true;
}
// labelled pickups within C's reach, best first, then nearest: what the inventory lists beside the bag
export function floorItems() {
  const d = p => Math.hypot(p.x - player.x, p.z - player.z);
  return lootHere().filter(p => !p.fly && !p.claim && p.toss >= 0 && inFloorReach(p, player.x, player.y, player.z) && !drowned(p))
    .sort((a, b) => (b.gen ? rarityOf(b).rank : -1) - (a.gen ? rarityOf(a).rank : -1) || d(a) - d(b));
}

export function updateLoot(dt, time) {
  const list = lootHere(), collect = collectRequested;
  collectRequested = false;
  if (!state.transitioning && !player.ragdoll && player.hp > 0 && dt > 0) {
    for (const p of list) {
      if (p.fly || p.claim || p.toss < 0 || !walkTakes(p)) continue;   // not out yet, or going
      const settled = p.toss >= 1;
      // a refused pickup waits until the player has moved out of its reach again
      const near = steppedOn(p, player.x, player.y, player.z) || inMagnetReach(p, player.x, player.y, player.z);
      if (p.refused) { p.refused = near; continue; }
      const take = settled && near ? 'walk' : collect && inCollectReach(p, player.x, player.y, player.z) ? 'collect' : null;
      if (!take || drowned(p)) continue;   // (none out of a deep fluid over it)
      if (!room(p)) { p.refused = true; setStatus(tr('Inventory is full')); continue; }
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (take === 'walk') claim(p, 0, 0.16 + d * 0.12);
      else claim(p, d * 0.07 + Math.random() * 0.05, 0.28 + d * 0.1);   // the near ones first
    }
  }
  if (state.map && !state.transitioning) {
    settleAll(list, dt, settledIn !== state.cubeKey);
    settledIn = state.cubeKey;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.toss < 1) {
      p.toss = Math.min(1, p.toss + dt / TOSS_TIME);
      if (p.toss === 1 && p.gen) landed(p);
    }
    if (!p.fly) continue;
    p.fly.t += dt;
    if (p.fly.t < p.fly.dur || p.claim === 'asked') continue;   // on the way, or waiting for the host's word
    list.splice(i, 1);
    if (p.claim === 'mine') receive(p);
  }
  announce(dt);
  // (and the quests' things to find, game/questworld.js, and the beginning's, game/intro.js)
  drawLoot([...list, ...questItemsHere(), ...introThingsHere()], state.world, time, dt);
}

// a weapon hit the floor: the better it is, the more it announces itself
function landed(p) {
  const r = rarityOf(p);
  if (r.rank >= RARITY.unusual.rank) sfx('drop', { at: p, pitch: 1 + 0.12 * (r.rank - RARITY.unusual.rank), volume: 0.86 + 0.12 * (r.rank - RARITY.unusual.rank) });
  else sfx('clink', { at: p, volume: 0.6 });
  if (r.rank >= RARITY.fabled.rank) jingle('legendary');   // Fabled or better: a jingle too
  lootLanded(p, state.world);
}

// --- playing together (net/session.js) ---------------------------------------------------------

// a pickup as it goes over the wire, and back
const r3 = x => Math.round(x * 1000) / 1000;
export const packPickup = p => ({ id: p.id, itemId: p.itemId, count: p.count, ...p.gen ? { gen: p.gen } : {},
  x: r3(p.x), y: r3(p.y), z: r3(p.z), from: [r3(p.from.x), r3(p.from.y), r3(p.from.z)], toss: r3(p.toss), ...p.kept ? { kept: true } : {} });
function unpack(m, source) {
  const [fx, fy, fz] = m.from;
  return { id: m.id, source, seq: seq++, itemId: m.itemId, count: m.count, ...m.gen ? { gen: m.gen } : {},
    x: m.x, y: m.y, z: m.z, from: { x: fx, y: fy, z: fz }, toss: m.toss, phase: Math.random() * Math.PI * 2,
    fly: null, claim: null, refused: false, ...m.kept ? { kept: true } : {} };
}
// the pickups of `source` in cube key (as they lie, not the ones going to someone)
export const dropOf = (key, source) => (state.run.loot.get(key) ?? []).filter(p => p.source === source && !p.claim);

// What the host says source dropped in cube key: `list` (packed pickups; null: it did not drop
// after all). What we have of it already (we dropped it ourselves) stays as it is where it
// matches; the rest goes or comes. true: something changed.
// learn: network.html#loot (see learn/README.md)
export function acceptDrop(key, source, list) {
  const here = lootIn(key), mine = here.filter(p => p.source === source);
  if (!list) {   // our guess was wrong: it is not dead there
    state.run.loot.set(key, here.filter(p => p.source !== source || p.claim === 'mine'));
    state.run.dropped.delete(source);
    return mine.length > 0;
  }
  state.run.dropped.add(source);
  const same = (p, m) => p.itemId === m.itemId && p.count === m.count && JSON.stringify(p.gen ?? null) === JSON.stringify(m.gen ?? null);
  const keep = new Set();
  for (const m of list) {
    const p = mine.find(q => q.id === m.id);
    if (p && same(p, m)) { keep.add(p); continue; }
    const q = unpack(m, source);
    if (p) { q.fly = p.fly; q.claim = p.claim; }   // ours went another way: what we reached for is this
    here.push(q); keep.add(q);
  }
  // ours that the host does not have: someone else's drop of it stood (or it was taken already)
  const out = mine.filter(p => !keep.has(p) && p.claim !== 'mine');
  if (out.length) state.run.loot.set(key, lootIn(key).filter(p => !out.includes(p)));
  return out.length > 0 || keep.size > mine.length;
}

// Another player got pickup `id` in cube key (the host says so; `mine`: no, we did). Ours goes
// into the bag; another's flies to them if they are here (to: their number), else goes.
// learn: network.html#loot (see learn/README.md)
export function takenBy(key, id, mine, to = null) {
  const list = state.run.loot.get(key) ?? [], p = list.find(q => q.id === id);
  if (!p) return;
  if (mine) {
    if (p.claim === 'mine') return;
    p.claim = 'mine';
    if (!p.fly) { list.splice(list.indexOf(p), 1); receive(p); }   // the inventory: straight into the bag
    return;
  }
  if (p.claim === 'mine') return;   // (never: the host does not give away what it gave us)
  if (key === state.cubeKey && to !== null) { p.claim = 'other'; p.fly = { t: Math.min(p.fly?.t ?? 0, 0), dur: TO_FRIEND, to }; }
  else list.splice(list.indexOf(p), 1);
}
// the host: may another player have pickup `id` in cube key? It may when nobody has claimed
// it yet (then it flies to them, if they are here: to, their number)
export function grant(key, id, to = null) {
  const list = state.run.loot.get(key) ?? [], p = list.find(q => q.id === id);
  if (!p || p.claim) return false;
  takenBy(key, id, false, to);
  return true;
}
// the host's floor loot, for a guest who comes ([[cube, packed pickups]])
export const allLoot = () => [...state.run.loot].map(([k, list]) => [k, list.filter(p => !p.claim).map(p => ({ ...packPickup(p), source: p.source }))])
  .filter(([, list]) => list.length);
// the floor loot as a save keeps it: what lies there, landed (core/save.js)
export const savedLoot = () => allLoot().map(([k, list]) => [k, list.map(p => ({ ...p, toss: 1 }))]);
// a guest coming into the host's world (and a saved world, game/flow.js): its floor loot instead of ours
export function takeLoot(cubes) {
  state.run.loot.clear();
  settledIn = null;   // (what comes rests where it should at once)
  for (const [k, list] of cubes) state.run.loot.set(k, list.map(m => unpack(m, m.source)));
}
// alone again (net/session.js): what we reached for and the host did not answer is ours
export function settleClaims() {
  for (const list of state.run.loot.values()) for (const p of [...list]) {
    if (p.claim !== 'asked') continue;
    p.claim = 'mine';
    if (!p.fly) { list.splice(list.indexOf(p), 1); receive(p); }
  }
}
