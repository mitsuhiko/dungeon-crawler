// The beginning of every world (docs/story.md, "The beginning"): the town (its tiles, docs/town.md)
// and the first room of the road past its gate (a rock with his first glass on top), which are the
// game's tutorial too. Pure: the world's layout puts the gates in and says which room is the rock's
// (world/layout.js firstGlass), the plaza's tile says where the crash is and the sword lies
// (world/town.js CRASH, CRASH_SWORD: map.relics), the rock's cube where his glass floats
// (cubegen/index.js map.firstGlass), and game/intro.js puts them there and does what they do.
//
// The glassmaker's memories are always in his glass: a recording plays when its bubble is found,
// never for coming somewhere or doing something (core/narration.js RECORDINGS).
//
// - The town: what is left of the big glass that came down on it lies on its plaza, a crater;
//   nothing to take (render/shards.js).
// - The sword: his old sword (core/items.js OLD_SWORD), stuck in the ground at the crash beside the
//   robot (which wakes as the hero comes: core/robot.js). Pulled out it is the hero's and the town's
//   gate out to the road opens (no words: it is no glass).
// - The glass: a bubble of star-glass on top of the rock in the room past the gate, up a ladder,
//   three snakes at its foot (core/spawns.js FIRST_GLASS). Picked up, it breaks and his words play
//   (core/narration.js RECORDINGS 'glass'), the memories open (the inventory's Memories tab,
//   game/memorypanel.js: his recordings heard, to hear again), and the room's gate on along the
//   road opens.
// - The recording that came up with his sword ('camp') is the first of his glass past the rock, on
//   depth 0's way (world/spots.js).
// Each recording cuts short the one before, and leaving its place cuts it short: nobody has to stand
// about and listen (core/narration.js RECORDINGS).
//
// The gates are the world's, like a guardian's (run.unlockedGates: saved with it, and playing
// together opened for everyone). The glass is there while its gate is shut; the sword while its
// gate is shut, and after that for a hero without any weapon (one who joins a friend's world with
// an empty bag, or sold everything): it is never short of one. A hero who comes into a world with
// his sword in the bag already (from another world) does not get a second: the one pulled out takes
// its place (pullSword).
import { msg } from '../i18n/i18n.js';
import { OLD_SWORD } from './items.js';
import { fixedWeapon } from './gear/generate.js';
import { addInstance, fits, ownedItem, slotOf, replaceInstance } from './inventory.js';
import { isInterior } from '../world/town.js';
import { recordingLines } from './narration.js';
import { glassAt, depthOfGlass } from './glass.js';

export const INTRO_GATES = { glass: 'intro:glass', sword: 'intro:sword' };
export const isIntroGate = g => typeof g === 'string' && g.startsWith('intro:');
// what a shut gate of the beginning says (core/guardians.js lockMessage)
export const INTRO_LOCKED = {
  [INTRO_GATES.glass]: msg('The gate will not open yet. Something glints on top of the rock.'),
  [INTRO_GATES.sword]: msg('The gate will not open yet. Take the sword from the ground first.'),
};

// the beginning done already: both gates open (the dev tools, a world played before it existed)
export function skipIntro(run) {
  for (const g of Object.values(INTRO_GATES)) run.unlockedGates.add(g);
}
// a world saved before there was a beginning: somebody has been out past it, beyond the rock's room
// on the road (layout0: depth 0's layout, world/layout.js; a branch off a room counts as that room)
// or deeper down
export const pastIntro = (visited, layout0) => visited.some(k => {
  if (isInterior(k)) return false;
  const [, y] = k.split(',').map(Number);
  return y !== 0 || (layout0.routeIndex.get(k) ?? -1) >= 2;
});

// is his glass on the rock still there (run: the world's)?
export const glassThere = run => !run.unlockedGates.has(INTRO_GATES.glass);
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

// what playing together tells the others (net/session.js `story`): the glass on the rock found (its
// gate open, its recording heard by everyone), the sword taken (its gate open), and a glass of his
// further on found (its recording heard by everyone, by id: 'camp' too)
export const STORY_NEWS = ['glass', 'sword', 'camp'];
export const isStoryNews = what => STORY_NEWS.includes(what) || depthOfGlass(what) !== undefined;

// His glass in the depths (core/glass.js): the glass spots of a cube (map.spots, kind `glass`),
// each with its recording (`part`), those whose recording is not heard yet (run.told). seed: the
// world's.
export function depthGlassIn(map, run, seed) {
  const out = [];
  for (const s of map?.spots ?? []) {
    if (s.kind !== 'glass') continue;
    const part = s.part ?? glassAt(seed, s.depth)[s.glass];
    if (part && !recordingLines(part).some(l => run.told.has(l.id))) out.push({ spot: s, part });
  }
  return out;
}
