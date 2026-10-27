// The narrator's lines (docs/story.md, docs/narration.md): the glassmaker's recordings, by id, and
// when they are said. game/narrator.js tells the moments as they happen (a recording found ...)
// and plays what there is to say about them, one line after the other, with subtitles;
// `node tools/narration.mjs` says every line in every voiced language, in each of its forms, and
// renders it to assets/narration/<lang>/<clip>.mp3.
//
// For now the lines are his recordings (RECORDINGS) and the robot's hello (`robot`): the old
// narrator's (a grandmother whose memories were the cubes) went with the old story. The other
// moments are kept for the robot, who sees what the hero does and will talk about it (docs/story.md,
// "The robot"); a moment without lines says nothing. The memories (the inventory's Memories tab)
// are his recordings only: the robot's lines are not in them, unless one is marked to be (a
// recording of its own in RECORDINGS; none is yet).
//
// A line:
//   id      what it is kept, sent and recorded under: lowercase words joined by '-' or '.'
//   on      the moment it is said at (MOMENTS)
//   when    (optional) what the moment must be about: { key: value } of its data, each a value,
//           a list of values, or [lo, hi] for a number (a depth)
//   text    the English message (src/i18n: translated like every other, German in
//           src/i18n/de/story.js); at most two short sentences. It may carry performance tags
//           for the voice, `[sad]`, `[whispers]`, `[sighing]` ... (TAG): never shown, said as
//           instructions (tools/narration.mjs TAGS; docs/narration.md, "Performance tags")
//   note    when it comes, how it should feel, who it is said to: for the translators and the voice
//   voice   (optional) whose voice says it (tools/voices/<voice>), not the language's narrator's
//   worn    (optional) it sounds like an old recording when played (game/narrator.js)
//   forms   (optional) the parameters it is said with, one recording each, by form name: the
//           clip is `<id>.<form>`. Without forms the line has no parameters and one clip, `<id>`.
//   instruct (optional) how the line is said, for the voice: plain vivid English ('Speak slowly
//           and softly, as if half asleep.'); tags in the text win (docs/narration.md,
//           "Instructions")
//   seed    (optional) the take: the TTS noise seed, a number, or by language (`{ de: 3 }`) or
//           language and form (`{ 'de.f': 3 }`); 0 when left out. Pick one with
//           `node tools/narration.mjs --takes 4 --only <id>`.
//
// Every line is said once in a world (the world keeps what was told, game/narrator.js). The
// lines of a moment are said in the order of this table: the first one not told yet that fits,
// or, for a moment that tells `all`, every one of them that fits, one after the other.
//
// A recorded line never says a name: the names are the players' own and cannot be recorded
// ahead. Say people by their words ({sib, select, m {him} other {her}}), not by name. Nobody says
// cube: a piece of the world, the glass.

import { tr, msg } from '../i18n/i18n.js';

// a performance tag in a line's text: a lowercase word or a few in brackets, `[very slowly]`
export const TAG = /\s*\[[a-z][a-z ]*\]\s*/g;
// a line's text without its tags: what is shown, and what the voice says
export const untagged = text => text.replace(TAG, ' ').trim();
// the tags a line's text carries, in order ('very slowly', 'sad' ...)
export const tagsOf = text => [...text.matchAll(TAG)].map(m => m[0].trim().slice(1, -1));
// a line said in the current language, in its form `form`, without its tags
export const lineText = (line, form) => untagged(tr(line.text, line.forms?.[form]));

// two forms by the hero's gender, for a line that has to say him or her ({sib, select, ...})
export const SIBLING = { m: { sib: 'm' }, f: { sib: 'f' } };

// The moments, and how what is said at them is said (game/narrator.js is told of them):
//   pri    which goes first when several wait: the story (3), a boss (2), what happens (1), chatter (0)
//   ttl    s a line may wait for its turn before it is too late to say (none: it waits)
//   quiet  s nothing must have been said before (chatter waits for a pause)
//   calm   only while no enemy is after the hero
//   all    every line that fits, in order (a scene), not just the next one
//   cuts   a scene of it cuts short any other of the same moment still being said or waiting: what
//          was left of that one is dropped (the line being said fades out), and counts as told
//   whole  a scene counts as told as a whole the moment it begins: all its lines go into what was
//          told at once (the Memories show it whole; leaving it early loses nothing there)
export const MOMENTS = {
  recording: { pri: 3, all: true, cuts: true, whole: true },   // one of the glassmaker's recordings found ({ part }: RECORDINGS)
  robot: { pri: 3, all: true, whole: true },  // the robot ({ what }): 'hello', it came flying up (core/robot.js; told: it came)
  town: { pri: 1, ttl: 6, quiet: 4 },         // close to one of the villagers ({ who }: world/town.js VILLAGERS)
  camp: { pri: 2, ttl: 25 },                  // in the merchant camp, the first time
  road: { pri: 2, ttl: 25 },                  // out on the road, where the enemies start
  wander: { pri: 0, ttl: 8, quiet: 35, calm: true },   // a place not seen before ({ act, depth })
  theme: { pri: 2, ttl: 20 },                 // a theme's first place ({ theme }: its id)
  depth: { pri: 3, all: true },               // a depth reached for the first time ({ depth })
  foe: { pri: 1, ttl: 6 },                    // a species after the hero for the first time ({ species })
  fight: { pri: 0, ttl: 4, quiet: 40 },       // in a fight, now and then
  kill: { pri: 1, ttl: 5 },                   // enemies defeated ({ many }: three or more at once)
  hurt: { pri: 1, ttl: 4, quiet: 20 },        // the hero's health low
  death: { pri: 2, ttl: 15 },                 // the hero died
  level: { pri: 1, ttl: 8 },                  // a level gained
  chest: { pri: 1, ttl: 8 },                  // a chest opened
  loot: { pri: 1, ttl: 8 },                   // a rare weapon or piece of armor picked up
  quest: { pri: 1, ttl: 10 },                 // a quest taken
  horde: { pri: 2, ttl: 5 },                  // a horde woke up
  fall: { pri: 1, ttl: 6 },                   // fell through a gap into the place below
  idle: { pri: 0, ttl: 3, quiet: 30, calm: true },     // standing about for a while
  home: { pri: 1, ttl: 10, quiet: 10 },       // back in town from out there
  guardian: { pri: 2, ttl: 15 },              // a side guardian ({ what: 'near' | 'beaten' })
  arena: { pri: 3, ttl: 30, all: true },      // a boss's arena entered, the boss still there ({ boss })
  boss: { pri: 2, ttl: 4 },                   // in a boss's fight ({ boss, what }: 'start', an attack's name, 'split' { stage })
  beaten: { pri: 3, all: true },              // a boss beaten ({ boss })
  trial: { pri: 2, ttl: 8 },                  // a trial room ({ what: 'sealed' | 'resolved' | 'failed' })
};

// The glassmaker's recordings (docs/story.md): bubbles of star-glass he blew his words into, down in
// the dark, and let rise. Each is a scene of lines (`on: 'recording'`, `when: { part }`), said when
// its bubble is found and breaks (core/intro.js, game/intro.js), never for coming somewhere or doing
// something: his memories are always in his glass. Kept: the inventory's Memories tab
// (game/memorypanel.js) plays the ones heard again. title: what the tab calls it; found: where.
//
// He does not know where his glass comes to rest, nor what lies about it: he never says what is
// there (a town, a gate, the next one), only what is true wherever it came down.
//
// Players do not stand about to listen, so a recording never holds them up: it is told whole the
// moment it begins (MOMENTS `whole`: the Memories have all of it), the next one cuts it short
// (`cuts`), and so does leaving its place (`where`: game/narrator.js arrived; placeOf). Write a
// recording so its first line says what matters most.
export const RECORDINGS = [
  { id: 'glass', title: msg('A voice in the glass'), found: msg('Found on the town plaza'), where: 'town' },
  { id: 'camp', title: msg('Where the sword fell'), found: msg('Found in the merchant camp'), where: 'camp' },
];
// a recording's lines, in order
export const recordingLines = id => LINES.filter(l => l.on === 'recording' && l.when?.part === id);
// the recordings heard in a world, or begun (told: run.told; a recording is told whole once it begins)
export const recordingsHeard = told => RECORDINGS.filter(r => recordingLines(r.id).some(l => told.has(l.id)));
// the recording a line is of (undefined: not a recording's)
export const recordingOf = line => line.on === 'recording' ? RECORDINGS.find(r => r.id === line.when?.part) : undefined;
// the place a map is, for a recording's `where`: 'town' (its houses too), 'camp', or null (out there)
export const placeOf = map => map?.town || map?.interior ? 'town' : map?.merchantCamp ? 'camp' : null;
// is line out of its place where the hero is now (map)? (game/narrator.js cuts it)
export const outOfPlace = (line, map) => { const w = recordingOf(line)?.where; return !!w && placeOf(map) !== w; };

// His recordings are his voice (tools/voices/glassmaker), worn like an old recording when played
// (the film's `worn`, game/narrator.js): low, tired and calm, a man talking to whoever finds the
// glass, not knowing who or where they are. He cannot see them, nor where the glass came to rest:
// he says what is true wherever that is.
const recording = (part, id, text, note, instruct, more = {}) => ({ id: `recording.${part}.${id}`, on: 'recording', when: { part },
  voice: 'glassmaker', worn: true, text, note, instruct, ...more });

// The robot (docs/story.md, "The robot"; core/robot.js, game/robot.js): a clockwork of star-glass,
// in its own voice (tools/voices: `robot`, docs/narration.md "Made voices"), said live, not worn.
// Cheerful and eager, a child's voice through clockwork; it cannot get at all it remembers.
const robot = (what, id, text, note, instruct, more = {}) => ({ id: `robot.${what}.${id}`, on: 'robot', when: { what },
  voice: 'robot', text, note, instruct, ...more });

export const LINES = [
  // --- the glass on the town plaza: the first thing a hero finds (core/intro.js) -------------------
  recording('glass', 'found', 'So my glass found someone. Good.',
    'The first words of the bubble of star-glass the hero just broke open on the town plaza, at noon. He recorded it long ago, down in the dark, and has no idea who hears it. Quietly glad, a little surprised.',
    'Speak low and calm, quietly glad, like an old man in the dark.'),
  recording('glass', 'keep', 'This glass keeps my words. Keep them with you, and listen again whenever you need to.',
    'What the glass is: it keeps what it holds, his voice too. The game opens the memories here (the inventory\'s Memories tab), so this is a promise: his words can be heard again.',
    'Speak low and warm, plainly, like someone explaining a gift.'),
  recording('glass', 'gates', 'The world is in pieces now. Where the pieces meet, there are gates of my glass.',
    'He teaches the gates: the world is broken into pieces, and between them stand gates he made. He does not know where his glass came down, so he says nothing of what is round the hero. Matter-of-fact, a craftsman\'s pride under it.',
    'Speak low and steady, matter-of-fact.'),
  recording('glass', 'open', 'They know my glass, and they open for whoever carries it. So carry it, and go on.',
    'Why the gate out of the town opens now: the hero carries his glass (he does not know there is a town or a gate near; it is true of every gate). Then he sends them on, gently but firmly.',
    'Speak low and steady, then gently encouraging on the last sentence.'),

  // --- the glass in the merchant camp: where the sword fell ----------------------------------------
  recording('camp', 'tied', 'My old sword rose with this glass, tied to it. If the knot came loose, it did not fall far.',
    'A second bubble of his, found a few steps into the merchant camp. He tied his old sword to it so whoever found it would not go out empty-handed; it came loose on the way and lies close by, stuck in the ground (he cannot know that, only hope it).',
    'Speak low and thoughtful, a little wry about the knot.'),
  recording('camp', 'point', 'A sword falls point first. Look for one standing in the ground, and pull it out.',
    'Right after: he cannot see the hero, he only knows how a sword falls. Practical.',
    'Speak low and practical, calm.', { seed: { de: 2 } }),   // (the others mumble "Such eins")
  recording('camp', 'honest', 'It is old and plain, but it is honest. It never broke on me.',
    'About the sword, which the hero may not have found yet. Fond of it, the way a craftsman is fond of a good tool.',
    'Speak low and fond, with a faint smile.'),
  recording('camp', 'listen', 'And listen for more of my glass. I will keep talking, for as long as I can.',
    'The end of this recording: more of his bubbles lie somewhere, he does not know where. Tired, but he will not stop.',
    'Speak low and tired, slowing down at the end, a little hopeful.', { seed: 3 }),   // (the others pause long: "Und hör auf.")

  // --- the robot comes flying up, the first time the hero is out of the town (core/robot.js) ------
  robot('hello', 'there', 'There you are! I heard the glass break, and I flew as fast as my wings would go.',
    'The robot\'s first words. The hero just left the town and the merchant camp for the road, and the little robot of star-glass came flying up to them. It heard the glassmaker\'s glass break and came looking. Glad, a little out of breath.',
    'Speak brightly and a little out of breath, glad, like an eager child.'),
  robot('hello', 'who', 'The star-readers made me, of glass and clockwork. I had a name once, but I cannot find it any more.',
    'Who it is: the star-readers built it. It cannot get at all of what it remembers, its own name too. Cheerful about the first sentence, puzzled and a little wistful about the second, not sad.',
    'Speak cheerfully, then a little puzzled and wistful.'),
  robot('hello', 'come', 'So I will come with you, and light the way. Further down, it gets dark.',
    'From now on it follows the hero and glows; the way down through the depths gets darker. A small, warm promise.',
    'Speak warmly and brightly, like a small promise.'),
];

// the line with this id (undefined: none)
const BY_ID = new Map(LINES.map(l => [l.id, l]));
export const lineById = id => BY_ID.get(id);

// does a moment's data fit a line's `when`?
export function fits(when, data = {}) {
  if (!when) return true;
  for (const [k, want] of Object.entries(when)) {
    const v = data[k];
    if (Array.isArray(want)) {
      const range = want.length === 2 && want.every(x => typeof x === 'number') && typeof v === 'number';
      if (range ? v < want[0] || v > want[1] : !want.includes(v)) return false;
    } else if (v !== want) return false;
  }
  return true;
}

// What she says at moment `on` about `data`: the lines not told yet (`told`: a Set of ids, also
// those waiting their turn) that fit, in the table's order: all of them for a moment that tells
// `all`, else the first. [] if she has nothing (more) to say.
export function linesFor(on, data = {}, told = new Set(), lines = LINES) {
  const fit = lines.filter(l => l.on === on && !told.has(l.id) && fits(l.when, data));
  return MOMENTS[on]?.all ? fit : fit.slice(0, 1);
}

// a line's clip (core/narration.js forms): its id, or `<id>.<form>`
export const clipKey = (line, form) => line.forms && form ? `${line.id}.${form}` : line.id;
// the form of a line that has forms, for the sibling `sib` ('m' or 'f')
export const formOf = (line, sib) => !line.forms ? null : Object.keys(line.forms).find(f => line.forms[f].sib === sib) ?? Object.keys(line.forms)[0];
