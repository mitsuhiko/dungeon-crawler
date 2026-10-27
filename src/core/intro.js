// The beginning of every world (docs/story.md, "The beginning"): things lie in the town's two
// parts, and two of them open a gate. Pure: the world's layout puts the gates in (world/layout.js),
// the clearings say where the things lie (world/town.js TOWN_RELIC, CAMP_GLASS, CAMP_RELIC:
// map.relics), and game/intro.js puts them there and does what they do.
//
// The glassmaker's memories are always in his glass: a recording plays when its bubble is found,
// never for coming somewhere or doing something (core/narration.js RECORDINGS).
//
// - The glass: a bubble of star-glass over the town's plaza, one of the glassmaker's recordings.
//   Picked up, it breaks and his words play (core/narration.js RECORDINGS 'glass'), the memories
//   open (the inventory's Memories tab, game/memorypanel.js: his recordings heard, to hear again),
//   and the gate out of the town opens.
// - The camp's glass: another bubble, a few steps into the merchant camp. Picked up, it breaks and
//   his words go on (RECORDINGS 'camp'): his old sword rose tied to this glass; if it came loose it
//   lies close by, point first in the ground. It opens nothing.
// - The sword: his old sword (core/items.js OLD_SWORD), stuck in the ground in the merchant camp.
//   Pulled out it is the hero's and the camp's gate out to the road opens (no words: it is no glass).
// Each recording cuts short the one before, and leaving its place cuts it short: nobody has to stand
// about and listen (core/narration.js RECORDINGS).
//
// The gates are the world's, like a guardian's (run.unlockedGates: saved with it, and playing
// together opened for everyone). The town's glass is there while its gate is shut; the camp's until
// its recording is heard (run.told); the sword while its gate is shut, and after that for a hero
// without any weapon (one who joins a friend's world with an empty bag, or sold everything): it is
// never short of one. A hero who comes into a world with his sword in the bag already (from another
// world) does not get a second: the one pulled out takes its place (pullSword).
import { msg } from '../i18n/i18n.js';
import { OLD_SWORD } from './items.js';
import { fixedWeapon } from './gear/generate.js';
import { addInstance, fits, ownedItem, slotOf, replaceInstance } from './inventory.js';
import { isClearing, isInterior } from '../world/town.js';
import { recordingLines } from './narration.js';
import { glassAt, depthOfGlass } from './glass.js';

export const INTRO_GATES = { glass: 'intro:glass', sword: 'intro:sword' };
export const isIntroGate = g => typeof g === 'string' && g.startsWith('intro:');
// what a shut gate of the beginning says (core/guardians.js lockMessage)
export const INTRO_LOCKED = {
  [INTRO_GATES.glass]: msg('The gate will not open yet. Something glints on the plaza.'),
  [INTRO_GATES.sword]: msg('The gate will not open yet. Take the sword from the ground first.'),
};

// the beginning done already: both gates open (the dev tools, a world played before it existed)
export function skipIntro(run) {
  for (const g of Object.values(INTRO_GATES)) run.unlockedGates.add(g);
}
// a world saved before there was a beginning: somebody has been out past the town and the camp
export const pastIntro = (visited, seed) => visited.some(k => !isInterior(k) && !isClearing(k, seed));

// is the glass on the town's plaza still there (run: the world's)?
export const glassThere = run => !run.unlockedGates.has(INTRO_GATES.glass);
// is the glass in the merchant camp still there? (until its recording is heard: told)
export const campGlassThere = run => !recordingLines('camp').some(l => run.told.has(l.id));
// is the sword there, for a hero who carries `weapons` weapons (any, in the bag)?
export const swordThere = (run, weapons) => !run.unlockedGates.has(INTRO_GATES.sword) || weapons === 0;

// The sword pulled out of the ground into the bag (inv). One of his in the bag already (the one in
// hand, else the first) is replaced by it where it is: still in hand, on the quick bar. Else it goes
// into a free slot. { id: its instanceId, replaced }, or null: the bag is full.
export function pullSword(inv) {
  const sword = fixedWeapon(OLD_SWORD.id), held = ownedItem(inv, inv.equipped);
  const had = held?.itemId === OLD_SWORD.id ? held : slotOf(inv, OLD_SWORD.id);
  if (had) return replaceInstance(inv, had.instanceId, sword) && { id: had.instanceId, replaced: true };
  if (!fits(inv, sword)) return null;
  const id = addInstance(inv, sword);
  return id && { id, replaced: false };
}

// what playing together tells the others (net/session.js `story`): the town's glass found (its gate
// open, its recording heard by everyone), the sword taken (its gate open), the camp's glass found
// (its recording heard by everyone), and a glass of his in the depths found (its recording, by id)
export const STORY_NEWS = ['glass', 'sword', 'camp'];
export const isStoryNews = what => STORY_NEWS.includes(what) || depthOfGlass(what) !== undefined;

// His glass in the depths (core/glass.js): the glass spots of a cube (map.spots, kind `glass`),
// each with its recording (`part`), those whose recording is not heard yet (run.told). seed: the
// world's.
export function depthGlassIn(map, run, seed) {
  const out = [];
  for (const s of map?.spots ?? []) {
    if (s.kind !== 'glass') continue;
    const part = glassAt(seed, s.depth)[s.glass];
    if (part && !recordingLines(part).some(l => run.told.has(l.id))) out.push({ spot: s, part });
  }
  return out;
}
