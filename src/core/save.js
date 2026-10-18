import { checkSkin } from './skin.js';

// Saved games: heroes and worlds, apart. Pure: no DOM, no game state (game/save.js runs it).
//
// A hero (up to MAX_HEROES) is the character: name, XP and the bag, and its world (the one
// Continue goes back to; null: none yet). It goes into any world, a friend's too, and takes home
// what it found there; a friend's world does not become its world.
//   { v, id, name, created, updated, playTime, xp, inventory, world }
// A world (up to MAX_WORLDS) is a seed and what was done in it: what was defeated and opened,
// the loot on the floor, the cubes discovered, and where each hero left it (spots). Its name
// comes from the seed (core/names.js); the same seed saved again is the second copy, "... II".
//   { v, id, seed, copy, name, created, updated, deepest,
//     run: { defeated, gates, chests, dropped, loot, townPortal, quests }, faces, visited,
//     spots: { [heroId]: { cube, arrival: { x, y, z } } } }
// The map itself is never saved: the same seed makes the same cubes (world/). The name is
// written along (to read the file) but never read back.
//
// The store keeps them in a Storage (localStorage, or a stand-in in the tests) under KEYS: the
// heroes in one entry, the worlds one entry each (they grow) plus an index for the menu, and
// the hero chosen in the menu. What is read is checked: a damaged or unknown entry is left out
// (and left alone), an item the game no longer knows leaves the bag. `v` says which version
// wrote it: migrate brings older ones up.
import { ITEMS, COINS } from './items.js';
import { BAG_SIZE, BAR_SIZE, createInventory, whole } from './inventory.js';
import { createPlayerStats, carryTools, levelFromXP, maxHealth } from './progression.js';
import { validGen, validPickup } from './loot.js';
import { worldName } from './names.js';
import { createQuestLog, checkQuestLog } from './quests.js';

export const SAVE_VERSION = 1, MAX_HEROES = 3, MAX_WORLDS = 8, NAME_MAX = 16;
export const KEYS = {
  heroes: 'cube-crawler.heroes', worlds: 'cube-crawler.worlds', selected: 'cube-crawler.last',
  world: id => `cube-crawler.world.${id}`,
};

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (...xs) => xs.every(Number.isFinite);
const strings = xs => Array.isArray(xs) ? xs.filter(x => typeof x === 'string') : [];
const point = p => isObj(p) && finite(p.x, p.y, p.z) ? { x: p.x, y: p.y, z: p.z } : null;
const time = t => Number.isFinite(t) && t >= 0 ? t : 0;
const isId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);

export const newId = (prefix, rand = Math.random) => `${prefix}-${Date.now().toString(36)}${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}`;

// a name as typed: plain, single spaced, at most NAME_MAX characters ('' if nothing is left)
export function cleanName(s) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
}

// A saved world's name: its seed's (core/names.js), the second copy of a seed "... II"
const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const savedWorldName = (seed, copy = 1) => worldName(seed) + (copy > 1 ? ` ${ROMAN[copy] ?? copy}` : '');

// --- heroes -------------------------------------------------------------------------------------

export function createHero(name, { id = newId('h'), now = Date.now() } = {}) {
  return { v: SAVE_VERSION, id, name: cleanName(name) || 'Hero', created: now, updated: now, playTime: 0,
    xp: 0, inventory: createPlayerStats().inventory, world: null };
}
export const heroLevel = h => levelFromXP(h.xp);

// What the hero is when it comes into a world: its level, its bag, full health, no potions at work
// (the fields of core/progression.js createPlayerStats)
export function heroStats(h) {
  const level = levelFromXP(h.xp), maxHp = maxHealth(level);
  return { ...createPlayerStats(), xp: h.xp, level, maxHp, hp: maxHp, inventory: carryTools(structuredClone(h.inventory)) };
}

// A bag as it was saved, checked: slots with items the game no longer knows (or that do not
// make sense) are emptied, the quick bar keeps only what it can point at
export function checkInventory(saved) {
  const inv = createInventory();
  if (!isObj(saved)) return inv;
  const seen = new Set();
  let top = 0;
  (Array.isArray(saved.slots) ? saved.slots : []).slice(0, BAG_SIZE).forEach((s, i) => {
    if (!isObj(s) || typeof s.instanceId !== 'string' || seen.has(s.instanceId)) return;
    const def = ITEMS[s.itemId];
    if (!def || def.category === 'currency' || !Number.isInteger(s.count) || s.count < 1 || s.count > def.stackLimit) return;
    if (s.gen !== undefined && (!def.weapon || !validGen(s.gen))) return;
    seen.add(s.instanceId);
    top = Math.max(top, Number(/^item-(\d+)$/.exec(s.instanceId)?.[1] ?? 0));
    inv.slots[i] = { instanceId: s.instanceId, itemId: s.itemId, count: s.count, ...s.gen ? { gen: structuredClone(s.gen) } : {} };
  });
  const counts = new Map((Array.isArray(saved.currency) ? saved.currency : []).filter(isObj).map(c => [c.itemId, c.count]));
  inv.currency = COINS.map(c => ({ itemId: c.id, count: Number.isSafeInteger(counts.get(c.id)) && counts.get(c.id) > 0 ? counts.get(c.id) : 0 }));
  const own = id => inv.slots.find(s => s?.instanceId === id);
  inv.bar = Array.from({ length: BAR_SIZE }, (_, i) => {
    const r = Array.isArray(saved.bar) ? saved.bar[i] : null;
    if (isObj(r) && typeof r.itemId === 'string' && ITEMS[r.itemId]?.use && ITEMS[r.itemId].stackLimit > 1) return { itemId: r.itemId };
    if (isObj(r) && typeof r.instanceId === 'string' && own(r.instanceId)) return { instanceId: r.instanceId };
    return null;
  });
  inv.equipped = typeof saved.equipped === 'string' && ITEMS[own(saved.equipped)?.itemId]?.weapon ? saved.equipped : null;
  inv.readied = typeof saved.readied === 'string' && ITEMS[saved.readied]?.use === 'throw' && inv.slots.some(s => s?.itemId === saved.readied) ? saved.readied : null;
  inv.nextInstance = Math.max(Number.isSafeInteger(saved.nextInstance) ? saved.nextInstance : 1, top + 1);
  inv.version = Number.isSafeInteger(saved.version) && saved.version >= 0 ? saved.version : 0;
  return inv;
}

export function checkHero(h) {
  h = migrate(h);
  if (!h || !isId(h.id)) return null;
  let xp = 0;
  try { xp = whole(h.xp); } catch { return null; }
  const skin = checkSkin(h.skin);
  return { v: SAVE_VERSION, id: h.id, name: cleanName(h.name) || 'Hero', created: time(h.created), updated: time(h.updated),
    playTime: time(h.playTime), xp, inventory: checkInventory(h.inventory), world: isId(h.world) ? h.world : null,
    ...(skin ? { skin } : {}) };
}

// --- worlds -------------------------------------------------------------------------------------

export function createWorld(seed, { copy = 1, id = newId('w'), now = Date.now() } = {}) {
  seed >>>= 0;
  return { v: SAVE_VERSION, id, seed, copy, name: savedWorldName(seed, copy), created: now, updated: now, deepest: 0,
    run: { defeated: [], gates: [], chests: [], dropped: [], loot: [], townPortal: null, quests: createQuestLog() }, faces: [], visited: [], spots: {} };
}

function checkTownPortal(tp) {
  if (!isObj(tp) || typeof tp.key !== 'string' || !Number.isInteger(tp.depth)) return null;
  const pad = point(tp.pad), back = point(tp.back);
  return pad && back ? { key: tp.key, depth: tp.depth, pad, back } : null;
}
// [[cube key, pickups]] with each pickup's source
function checkLoot(loot) {
  if (!Array.isArray(loot)) return [];
  return loot.filter(c => Array.isArray(c) && typeof c[0] === 'string' && Array.isArray(c[1]))
    .map(([k, list]) => [k, list.filter(p => typeof p?.source === 'string' && validPickup(p))])
    .filter(([, list]) => list.length);
}

export function checkWorld(w) {
  w = migrate(w);
  if (!w || !isId(w.id) || !Number.isInteger(w.seed) || w.seed < 0 || w.seed > 0xffffffff) return null;
  const run = isObj(w.run) ? w.run : {}, spots = {};
  if (isObj(w.spots)) for (const [hero, s] of Object.entries(w.spots)) {
    const arrival = point(s?.arrival);
    if (isId(hero) && typeof s.cube === 'string' && arrival) spots[hero] = { cube: s.cube, arrival };
  }
  const copy = Number.isInteger(w.copy) && w.copy > 0 ? w.copy : 1;
  return { v: SAVE_VERSION, id: w.id, seed: w.seed, copy, name: savedWorldName(w.seed, copy),
    created: time(w.created), updated: time(w.updated), deepest: Number.isInteger(w.deepest) && w.deepest > 0 ? w.deepest : 0,
    run: { defeated: strings(run.defeated), gates: strings(run.gates), chests: strings(run.chests), dropped: strings(run.dropped),
      loot: checkLoot(run.loot), townPortal: checkTownPortal(run.townPortal), quests: checkQuestLog(run.quests) },
    faces: strings(w.faces), visited: strings(w.visited), spots };
}
// what the menu lists of a world, without reading all of it (the heroes: those that were there)
export const worldEntry = w => ({ id: w.id, seed: w.seed, copy: w.copy, updated: w.updated, deepest: w.deepest, heroes: Object.keys(w.spots) });
function checkEntry(e) {
  if (!isObj(e) || !isId(e.id) || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0xffffffff) return null;
  const copy = Number.isInteger(e.copy) && e.copy > 0 ? e.copy : 1;
  return { id: e.id, seed: e.seed, copy, name: savedWorldName(e.seed, copy), updated: time(e.updated),
    deepest: Number.isInteger(e.deepest) && e.deepest > 0 ? e.deepest : 0, heroes: strings(e.heroes) };
}

// an entry written by an older version of the game, brought up to this one; null: not a save
// we can read (one from a newer version is left alone)
export function migrate(x) {
  if (!isObj(x) || !Number.isInteger(x.v) || x.v < 1 || x.v > SAVE_VERSION) return null;
  return x;
}

// --- the store ----------------------------------------------------------------------------------

// The saves in `storage` (getItem / setItem / removeItem). Writes return false when the storage
// refused (full, or switched off).
export function openStore(storage) {
  const read = k => { try { const s = storage.getItem(k); return s === null ? null : JSON.parse(s); } catch { return null; } };
  const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const remove = k => { try { storage.removeItem(k); } catch { /* nothing to do */ } };
  const rawList = k => { const l = read(k); return Array.isArray(l) ? l : []; };
  const newestFirst = (a, b) => b.updated - a.updated;

  const store = {
    heroes: () => rawList(KEYS.heroes).map(checkHero).filter(Boolean).sort((a, b) => a.created - b.created),
    hero: id => store.heroes().find(h => h.id === id) ?? null,
    // false: no room for another hero, or the storage refused
    putHero(h) {
      const list = rawList(KEYS.heroes), i = list.findIndex(x => x?.id === h.id);
      if (i < 0 && store.heroes().length >= MAX_HEROES) return false;
      if (i < 0) list.push(h); else list[i] = h;
      return write(KEYS.heroes, list);
    },
    // a hero goes, and so do its spots in the worlds; the one after it (else before) is chosen instead
    deleteHero(id) {
      const heroes = store.heroes(), i = heroes.findIndex(h => h.id === id);
      write(KEYS.heroes, rawList(KEYS.heroes).filter(x => x?.id !== id));
      for (const e of store.worlds()) {
        const w = store.world(e.id);
        if (w?.spots[id]) { delete w.spots[id]; store.putWorld(w); }
      }
      if (read(KEYS.selected)?.hero === id) {
        const next = heroes[i + 1] ?? heroes[i - 1];
        if (next) store.select(next.id); else remove(KEYS.selected);
      }
    },
    // the hero chosen in the menu (Continue plays it in its world): if gone, the first one; null: none
    selected() {
      const heroes = store.heroes(), id = read(KEYS.selected)?.hero;
      return (heroes.find(h => h.id === id) ?? heroes[0])?.id ?? null;
    },
    select: id => write(KEYS.selected, { hero: id }),
    // hero `heroId` goes on in world `worldId` from now on (Continue)
    setHeroWorld(heroId, worldId) {
      const h = store.hero(heroId);
      return !!h && (h.world === worldId || store.putHero({ ...h, world: worldId }));
    },
    // the hero's world as the menu lists it; null: none (yet, or deleted)
    heroWorld(heroId) {
      const w = store.hero(heroId)?.world;
      return w ? store.worlds().find(e => e.id === w) ?? null : null;
    },
    worlds: () => rawList(KEYS.worlds).map(checkEntry).filter(Boolean).sort(newestFirst),
    world: id => isId(id) ? checkWorld(read(KEYS.world(id))) : null,
    putWorld(w) {
      const index = rawList(KEYS.worlds), i = index.findIndex(e => e?.id === w.id);
      if (i < 0 && store.worlds().length >= MAX_WORLDS) return false;
      if (!write(KEYS.world(w.id), w)) return false;
      if (i < 0) index.push(worldEntry(w)); else index[i] = worldEntry(w);
      return write(KEYS.worlds, index);
    },
    // a world goes, and the heroes whose world it was have none
    deleteWorld(id) {
      remove(KEYS.world(id));
      write(KEYS.worlds, rawList(KEYS.worlds).filter(e => e?.id !== id));
      for (const h of store.heroes()) if (h.world === id) store.putHero({ ...h, world: null });
    },
    // the copy number for one more world of this seed (1: the first)
    nextCopy: seed => 1 + Math.max(0, ...store.worlds().filter(e => e.seed === seed).map(e => e.copy)),
  };

  // saves from before the heroes had a world: the world played last with that hero, else the
  // newest one it was in
  const raw = rawList(KEYS.heroes);
  const old = h => isObj(h) && !('world' in h) && !!checkHero(h);
  if (raw.some(old)) {
    const last = read(KEYS.selected), worlds = store.worlds();
    for (const h of raw) if (old(h))
      h.world = last?.hero === h.id && worlds.some(e => e.id === last.world) ? last.world : worlds.find(e => e.heroes.includes(h.id))?.id ?? null;
    write(KEYS.heroes, raw);
  }
  return store;
}

// A Storage in memory (tests; private browsing where localStorage throws)
export function memoryStorage() {
  const m = new Map();
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, get size() { return m.size; } };
}
