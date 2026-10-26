// The beginning of every world (docs/story.md, "The beginning"): two things lie in the town's two
// parts, and each opens a gate. Pure: the world's layout puts the gates in (world/layout.js), the
// clearings say where the things lie (world/town.js TOWN_RELIC, CAMP_RELIC: map.relic), and
// game/intro.js puts them there and does what they do.
//
// - The glass: a bubble of star-glass over the town's plaza, one of the glassmaker's recordings.
//   Picked up, it breaks and his words play (core/narration.js RECORDINGS 'glass'), the memories
//   open (the inventory's Memories tab, game/memorypanel.js: his recordings heard, to hear again),
//   and the gate out of the town opens.
// - The sword: his old sword (core/items.js OLD_SWORD), stuck in the ground in the merchant camp.
//   Coming into the camp his words go on (RECORDINGS 'camp'): it fell here, take it. Pulled out it
//   is the hero's, the camp's gate out to the road opens, and he says a last word about it
//   (RECORDINGS 'sword').
// Each recording cuts short the one before, and leaving the town cuts the glass's short: nobody has
// to stand about and listen (core/narration.js RECORDINGS).
//
// The gates are the world's, like a guardian's (run.unlockedGates: saved with it, and playing
// together opened for everyone). The glass is there while its gate is shut; the sword while its
// gate is shut, and after that for a hero without any weapon (one who joins a friend's world with
// an empty bag, or sold everything): it is never short of one.
import { msg } from '../i18n/i18n.js';
import { isClearing, isInterior } from '../world/town.js';

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

// is the glass still there (run: the world's)?
export const glassThere = run => !run.unlockedGates.has(INTRO_GATES.glass);
// is the sword there, for a hero who carries `weapons` weapons (any, in the bag)?
export const swordThere = (run, weapons) => !run.unlockedGates.has(INTRO_GATES.sword) || weapons === 0;

// what playing together tells the others (net/session.js `story`): the glass found, the sword taken
// (each: its gate open, its recording heard by everyone), the camp reached with the glass found
// (its recording heard by everyone)
export const STORY_NEWS = ['glass', 'sword', 'camp'];
