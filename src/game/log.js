// The chronicle of this visit (core/chronicle.js): what happened and what was said, kept until
// the page closes. game/console.js shows it in the chat box. Playing together, what happened to
// us that the others care about goes to them too (`share`, net/session.js `news`), and theirs
// comes here with a `who`.
import { createLog, addEntry, clearLog, deathRecord } from '../core/chronicle.js';
import { equippedItem } from '../core/inventory.js';
import { itemWords } from '../core/gear/stats.js';
import { msg, phrase, noun } from '../i18n/i18n.js';
import { themeOf } from '../themes/depth.js';
import { relay } from '../net/online.js';
import { player, state } from './state.js';

export const chronicle = createLog();

// Write it down. who: the friend it is about (null: us); share: tell the others too.
// learn: memory.html#diary (see learn/README.md)
export function log(kind, data = {}, { who = null, share = false } = {}) {
  const entry = addEntry(chronicle, kind, data, { who, at: Date.now(), time: performance.now() / 1000 });
  if (share && !who) relay.news?.(kind, data);
  return entry;
}
// a line from the console itself (kind 'system') or a developer command ('dev')
export const note = (text, kind = 'system', extra = {}) => log(kind, { text, ...extra });
export const clearChronicle = () => clearLog(chronicle);

// the name of the place a cube is in, as words (said in the reader's language: core/chronicle.js)
const BUILDINGS = { town_inn_a: msg('Inn'), town_blacksmith_a: msg('Smithy'), town_pet_shop_a: msg('Pet shop'), town_stable_a: msg('Stable') };
export const placeOf = map => !map ? '' : map.town ? msg('Town')
  : map.interior ? phrase('inside {building:the}', { building: noun(BUILDINGS[map.interior.building] ?? msg('House')) }) : themeOf(map).name;

// We died (game/flow.js die): what did it is the last blow that hurt us (player.lastHurt,
// game/enemycombat.js, game/ragdoll.js)
export function logDeath() {
  const map = state.map, weapon = equippedItem(player.inventory);
  log('death', deathRecord(player.lastHurt, { depth: map?.depth ?? 0, place: placeOf(map), cube: state.cubeKey,
    weapon: weapon ? itemWords(weapon) : '', level: player.level, session: performance.now() / 1000 }), { share: true });
  player.lastHurt = null;
}

// The first time down at a depth in this world (game/flow.js settleIn): true then
let reached = new Set(), reachedIn = null;
export function noteDepth(map, seed) {
  if (seed !== reachedIn) { reached = new Set(); reachedIn = seed; }
  if (!map || map.depth <= 0 || map.interior || map.testRoom || reached.has(map.depth)) return false;
  reached.add(map.depth);
  log('depth', { depth: map.depth, place: placeOf(map) }, { share: true });
  return true;
}
// a saved world (game/save.js): its depths down to `deepest` were reached before
export function knowDepths(seed, deepest) {
  reached = new Set(Array.from({ length: deepest }, (_, i) => i + 1)); reachedIn = seed;
}
