// Saving while playing: the hero and the world being played are written to the store
// (core/save.js) as they change, every 30 s anyway (the time played) and when the page goes
// away. A hero and a world are only saved once they came from the store (play) or went into it
// (saveAs): a game with the dev tools or a ?seed= starts with neither and saves nothing.
//
// The world stops being saved when another one takes its place (N, a friend's when joining):
// a guest's hero goes on being saved, the friend's world is theirs (detachWorld).
import { openStore, memoryStorage, createHero, createWorld, heroStats, cleanName, MAX_HEROES, MAX_WORLDS } from '../core/save.js';
import { parse } from '../world/coords.js';
import { isInterior } from '../world/town.js';
import { depthOf } from '../themes/depth.js';
import { player, state, setStatus } from './state.js';
import { newWorld, visitedKeys } from './flow.js';
import { savedLoot } from './loot.js';
import { knowDepths } from './log.js';
import { packQuestLog } from '../core/quests.js';
import { setCharacterSkin } from '../render/character.js';

const CHECK_EVERY = 1000, SAVE_EVERY = 30000;

function localStore() {
  try { localStorage.getItem(''); return localStorage; } catch { return memoryStorage(); }   // private mode: for this page only
}
export const store = openStore(localStore());

// hero / world: the records as last written (null: not saved); cubes: the world client of the
// saved world (state.cubes is another one: the world changed, it is not saved any more);
// visited: the discovered cubes, also those not made again yet since it was loaded
const current = { hero: null, world: null, cubes: null, visited: new Set() };
let signature = '', checkAt = 0, saveAt = 0, played = 0, lastTick = 0, failed = false;

// the hero being saved is kept through a new world (game/flow.js newWorld)
const setHero = h => { current.hero = h; state.keepHero = !!h; };
const worldSaved = () => !!current.world && state.cubes === current.cubes;
export const savedHero = () => current.hero;
export const savedWorld = () => worldSaved() ? current.world : null;

// --- starting -----------------------------------------------------------------------------------

// Play hero `heroId` in world `worldId` (both in the store): the hero comes in where it left that
// world (else in town), and that is its world from now on (Continue). What was being played is
// saved first. Resolves once the first cube is there.
export function play(heroId, worldId) {
  const world = store.world(worldId);
  if (!store.hero(heroId) || !world) return Promise.reject(new Error('No such hero or world'));
  saveNow();
  store.setHeroWorld(heroId, worldId);
  store.select(heroId);
  const hero = store.hero(heroId);
  Object.assign(player, heroStats(hero));
  setHero(hero);
  setCharacterSkin(hero.skin);
  Object.assign(current, { world, visited: new Set(world.visited) });
  knowDepths(world.seed, world.deepest);
  const started = newWorld(world.seed, { keepPlayer: true, restore: restoreOf(world, hero.id) });
  current.cubes = state.cubes;
  signature = ''; played = 0;
  return started;
}

// Hero `heroId` goes into a friend's world (game/menu.js, before joining): the friend's world
// is not ours to save, the hero is; its own world stays its world. false: there is no such hero.
export function playAsGuest(heroId) {
  const hero = store.hero(heroId);
  if (!hero) return false;
  saveNow();
  Object.assign(player, heroStats(hero));
  setHero(hero);
  setCharacterSkin(hero.skin);
  Object.assign(current, { world: null, cubes: null, visited: new Set() });
  signature = ''; played = 0;
  return true;
}

// Back to the main menu: what was played is saved a last time, then nothing is saved any more
export function stopSaving() {
  saveNow();
  setHero(null);
  Object.assign(current, { world: null, cubes: null, visited: new Set() });
}

// what newWorld restores (game/flow.js): the discovered cubes nearest to where the hero comes in first
function restoreOf(world, heroId) {
  const spot = world.spots[heroId] ?? null, [X, Y, Z] = spot && !isInterior(spot.cube) ? parse(spot.cube) : [0, 0, 0];
  const far = k => isInterior(k) ? Infinity : (([x, y, z]) => Math.abs(x - X) + Math.abs(y - Y) * 2 + Math.abs(z - Z))(parse(k));
  return { name: world.name, run: world.run, faces: world.faces, spot, deepest: world.deepest, visited: [...world.visited].sort((a, b) => far(a) - far(b)) };
}

// A new hero in the store (null: there are MAX_HEROES already, or the storage refused)
export function newHero(name) {
  if (store.heroes().length >= MAX_HEROES) return null;
  const h = createHero(name);
  return store.putHero(h) ? h : null;
}
// A new world in the store (seed: random if not given; a seed saved already makes a copy, "... II")
export function newSavedWorld(seed = (Math.random() * 2 ** 32) >>> 0) {
  if (store.worlds().length >= MAX_WORLDS) return null;
  const w = createWorld(seed, { copy: store.nextCopy(seed >>> 0) });
  return store.putWorld(w) ? w : null;
}

// Save what is being played now as hero `heroName` (that hero is overwritten, or a new one made)
// and, unless this world is saved already, as a new world; it becomes the hero's world. A
// message: what happened.
export function saveAs(heroName) {
  const name = cleanName(heroName);
  if (!name) return 'A hero needs a name';
  if (!state.cubes) return 'No world yet';
  const hero = store.heroes().find(h => h.name.toLowerCase() === name.toLowerCase()) ?? newHero(name);
  if (!hero) return `There are ${MAX_HEROES} heroes already`;
  if (current.hero?.id !== hero.id) played = 0;
  setHero(hero);
  if (!worldSaved()) {
    const world = newSavedWorld(state.cubes.seed);
    if (!world) { saveNow(); return `Saved ${hero.name}; there are ${MAX_WORLDS} worlds already, this one is not saved`; }
    Object.assign(current, { world, cubes: state.cubes, visited: new Set() });
  }
  setHero({ ...current.hero, world: current.world.id });
  if (!saveNow()) return 'Could not save (is the storage full?)';
  store.select(current.hero.id);
  return `Saved ${current.hero.name} in ${current.world.name}`;
}

// This world is not ours to save any more (joining a friend's: net/session.js). It is saved one
// last time as it was.
export function detachWorld() {
  if (!worldSaved()) return;
  saveNow();
  current.world = null; current.cubes = null; current.visited = new Set();
}

// the hero or world `id` was deleted from the store: not saved any more
export function forget(id) {
  if (current.hero?.id === id) setHero(null);
  if (current.hero?.world === id) setHero({ ...current.hero, world: null });
  if (current.world?.id === id) { current.world = null; current.cubes = null; }
}

// --- saving -------------------------------------------------------------------------------------

function heroNow() {
  const h = current.hero;
  return { ...h, xp: player.xp, inventory: structuredClone(player.inventory), updated: Date.now(), playTime: h.playTime + played / 1000 };
}

// where the hero comes back in: the entry of the cube it is in (of the cube a fall started in);
// null while it is on the way somewhere (the spot it had stays)
function spotNow() {
  if (state.transitioning || !state.map) return null;
  const f = state.fallFrom, cube = f ? f.key : state.cubeKey, a = f ? f.arrival : state.arrival;
  return a && cube ? { cube, arrival: { x: a.x, y: a.y, z: a.z } } : null;
}

function worldNow() {
  const w = current.world, r = state.run, tp = r.townPortal, spot = spotNow();
  for (const k of visitedKeys()) current.visited.add(k);
  const visited = [...current.visited];
  const deepest = Math.max(w.deepest, ...visited.filter(k => !isInterior(k)).map(depthOf));
  return { ...w, updated: Date.now(), deepest,
    run: { defeated: [...r.defeated], gates: [...r.unlockedGates], chests: [...r.chests], dropped: [...r.dropped], loot: savedLoot(),
      quests: packQuestLog(r.quests),
      townPortal: tp ? { key: tp.key, depth: tp.depth, pad: { x: tp.pad.x, y: tp.pad.y, z: tp.pad.z }, back: { x: tp.back.x, y: tp.back.y, z: tp.back.z } } : null },
    faces: [...state.openedFaces], visited,
    spots: spot && current.hero ? { ...w.spots, [current.hero.id]: spot } : w.spots };
}

// Write the hero and the world now. false: the storage refused (said once in the game).
export function saveNow() {
  let ok = true;
  if (current.hero) {
    const h = heroNow();
    if (store.putHero(h)) { setHero(h); played = 0; } else ok = false;
  }
  if (worldSaved() && state.run) {
    const w = worldNow();
    if (store.putWorld(w)) current.world = w; else ok = false;
  }
  signature = changes(); saveAt = performance.now() + SAVE_EVERY;
  if (!ok && !failed) setStatus('Could not save the game (is the storage full?)');
  failed = !ok;
  return ok;
}

// what changes when there is something new to save
function changes() {
  const r = state.run;
  let loot = 0;
  for (const l of r.loot.values()) loot += l.length;
  return [player.xp, player.inventory.version, state.cubeKey, r.defeated.size, r.unlockedGates.size, r.chests.size, r.dropped.size,
    loot, state.openedFaces.size, r.townPortal?.key ?? '', state.cubes ? visitedKeys().length : 0, r.quests.version].join('|');
}

// main.js, every frame: count the time played, and once a second save what changed (every 30 s
// anyway); not on the way between cubes
export function updateSaves() {
  const now = performance.now(), dt = Math.min(1000, now - (lastTick || now));
  lastTick = now;
  if (!current.hero) return;
  if (document.visibilityState === 'visible') played += dt;
  if (now < checkAt) return;
  checkAt = now + CHECK_EVERY;
  if (current.world && state.cubes !== current.cubes) { current.world = null; current.cubes = null; }   // another world (N)
  if (state.transitioning || !state.map) return;
  if (changes() !== signature || now >= saveAt) saveNow();
}

addEventListener('pagehide', () => saveNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
