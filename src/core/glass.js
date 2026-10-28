// The glassmaker's glass in the depths (docs/story.md, "How the story is told"): bubbles of
// star-glass he blew his words into, down at the core, and let rise. Pure: which of his recordings
// (core/narration.js RECORDINGS) come to rest at which depth of a world. The world keeps spots free
// for them (world/spots.js, kind `glass`; cubegen/spots.js places them), game/intro.js shows them
// and plays a recording when its glass is found.
//
// Each depth that has glass has a chapter of his story: three recordings of the same time
// (GLASS), told in the order of the depths, the before time from the top down (act I: his craft,
// the star-readers, the closing of the glass, the ark, its days, the creature; act II: the voyage
// with the creature aboard, down to the comet shower and the fall at its bottom; act III: down at
// the core, held by it). A world places two of each depth's three (glassAt): one
// on the way (`way`, easy to come across), one hidden off it (high up, down a branch, behind a
// guardian). So one world tells part of each chapter, and another world more of it: the
// recordings of a chapter each stand on their own, and say what matters most first.
//
// Every depth has one but the core (20), whose last recording is the ending's (docs/story.md, "The
// ending"), still to come. Act II's and act III's chapters are a first sketch.
import { hash32, mulberry32 } from './util.js';

// depth -> its chapter's recordings (RECORDINGS ids), in the story's order
export const GLASS = Object.freeze({
  0: ['breath', 'star-sand', 'birds'],          // his craft, before everything
  1: ['readers', 'red-light', 'lanterns'],      // the star-readers and the stone
  2: ['sea', 'lines', 'bread'],                 // closing the glass round the pieces
  3: ['feathers', 'rising', 'steam'],           // the ark's wings, and rising
  4: ['furnace', 'rigging', 'cracks'],          // tending the glass on the ark
  5: ['one-day', 'clockworks', 'evenings'],     // days on the ark
  6: ['cloth', 'face', 'jar'],                  // the creature brought on board
  // act II: the voyage, with the creature aboard (a sketch)
  7: ['hum', 'words', 'mountain'],              // the creature learns to speak
  8: ['charts', 'lantern', 'quarrel'],          // the star-readers' worry
  9: ['why', 'hatch', 'left-open'],             // its questions
  10: ['boilers', 'songs', 'frost'],            // the smiths, and the cold
  11: ['little-bird', 'cage', 'fond'],          // a glass bird for the creature
  12: ['calm', 'promise', 'counted'],           // the last calm night
  13: ['shower', 'wings-broke', 'bottom'],      // the comet shower and the fall
  // act III: down at the core, held (a sketch; the core itself, 20, is the ending's, still to come)
  14: ['hull', 'only-light', 'crystals'],       // waking in the dark
  15: ['voice', 'walls', 'bargain'],            // its voice in the dark
  16: ['lanterns-low', 'bones', 'names'],       // the others
  17: ['ruins', 'wings-again', 'slowly'],       // building it wings
  18: ['first-bubble', 'fire-below', 'who-hears'],   // his bubbles of glass
  19: ['nearly', 'afraid', 'find-me'],          // nearly finished
});
export const PER_DEPTH = 2;   // glasses placed at a depth: one on the way, one hidden
export const glassDepth = d => Object.hasOwn(GLASS, d);
// the depth whose chapter a recording is of (undefined: none)
export function depthOfGlass(part) {
  const at = Object.entries(GLASS).find(([, l]) => l.includes(part));
  return at ? Number(at[0]) : undefined;
}

// The recordings placed at depth d of world `seed`: [the one on the way, the hidden one] (none at
// a depth without glass). Two of the chapter's three, from the seed alone.
export function glassAt(seed, d) {
  const pool = GLASS[d];
  if (!pool) return [];
  const R = mulberry32(hash32(seed ^ Math.imul(d + 1, 0x61a55) ^ 0x6a55));
  const left = [...pool], out = [];
  while (out.length < Math.min(PER_DEPTH, pool.length)) out.push(left.splice(Math.floor(R() * left.length), 1)[0]);
  return out;
}
