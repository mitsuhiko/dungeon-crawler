// The narrator's lines (docs/story.md, docs/narration.md): the glassmaker's recordings, by id, and
// when they are said. game/narrator.js tells the moments as they happen (a recording found ...)
// and plays what there is to say about them, one line after the other, with subtitles;
// `node tools/narration.mjs` says every line in every voiced language, in each of its forms, and
// renders it to assets/narration/<lang>/<clip>.opus.
//
// Two voices say them. The glassmaker's recordings (RECORDINGS): the beginning's two in the town,
// and his glass in the depths (core/glass.js), a chapter of the before time a depth. And the robot
// (docs/story.md, "The robot"), who lies asleep in the merchant camp until the hero wakes it, and
// from then on talks about what it sees: the places, the enemies met, the bosses and how to beat
// them, the puzzles, a death. Its lines are said only once it has woken and said its hello
// (robotMet, core/robot.js; its hello itself, the moment `robot`, is how it wakes), and paced
// (ROBOT_REST): it does not talk all the time. A moment without lines says nothing. The memories
// (the inventory's Memories tab) are his recordings only: the robot's lines are not in them,
// unless one is marked to be (a recording of its own in RECORDINGS; none is yet).
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
// or, for a moment that tells `all`, every one of them that fits, one after the other. A moment
// that `shuffle`s (a death, a chest ...: what happens again and again) says the line that fits
// best (the one whose `when` says most), and of those one picked by the world's seed (a line
// marked `lead` first), so every world hears them in another order.
//
// A recorded line never says a name: the names are the players' own and cannot be recorded
// ahead. Say people by their words ({sib, select, m {him} other {her}}), not by name. Nobody says
// cube: a piece of the world, the glass.

import { tr, msg } from '../i18n/i18n.js';
import { depthOfGlass } from './glass.js';

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
//   shuffle the line that fits best, of those one picked by the world's seed (linesFor)
export const MOMENTS = {
  recording: { pri: 3, all: true, cuts: true, whole: true },   // one of the glassmaker's recordings found ({ part }: RECORDINGS)
  robot: { pri: 3, all: true, whole: true },  // the robot ({ what }): 'hello', the hero woke it (core/robot.js; told: it woke)
  town: { pri: 1, ttl: 6, quiet: 4 },         // close to one of the villagers ({ who }: world/town.js VILLAGERS)
  camp: { pri: 2, ttl: 25 },                  // in the merchant camp, the first time
  road: { pri: 2, ttl: 25 },                  // out on the road, where the enemies start
  wander: { pri: 0, ttl: 8, quiet: 35, calm: true, shuffle: true },   // a place not seen before ({ act, depth })
  theme: { pri: 2, ttl: 20 },                 // a theme's first place ({ theme }: its id)
  depth: { pri: 3, all: true },               // a depth reached for the first time ({ depth })
  foe: { pri: 1, ttl: 6 },                    // a species after the hero for the first time ({ species })
  fight: { pri: 0, ttl: 4, quiet: 40, shuffle: true },   // in a fight, now and then
  kill: { pri: 1, ttl: 5, quiet: 12, shuffle: true },    // enemies defeated ({ many }: three or more at once)
  hurt: { pri: 1, ttl: 4, quiet: 20, shuffle: true },    // the hero's health low
  death: { pri: 2, ttl: 15, shuffle: true },  // the hero died ({ depth, boss }: the boss whose arena it was, if he is still there)
  level: { pri: 1, ttl: 8, shuffle: true },   // a level gained
  chest: { pri: 1, ttl: 8, shuffle: true },   // a chest opened
  loot: { pri: 1, ttl: 8, shuffle: true },    // a rare weapon or piece of armor picked up
  quest: { pri: 1, ttl: 10, shuffle: true },  // a quest taken
  horde: { pri: 2, ttl: 5, shuffle: true },   // a horde woke up
  fall: { pri: 2, ttl: 6, shuffle: true },    // it caught the hero falling through the void, to carry them back up (game/rescue.js catchFall)
  swim: { pri: 1, ttl: 5, shuffle: true },    // into water deep enough to swim in (game/swim.js)
  rescue: { pri: 2, ttl: 6, shuffle: true },  // it pulls the hero out of a fluid ({ fluid }: 'lava', 'acid', 'mud', 'slime', 'water'; game/rescue.js)
  idle: { pri: 0, ttl: 3, quiet: 30, calm: true, shuffle: true },     // standing about for a while
  home: { pri: 1, ttl: 10, quiet: 10, shuffle: true },   // back in town from out there
  guardian: { pri: 2, ttl: 15, shuffle: true },          // a side guardian, or a boss's stand-in ({ what: 'near' | 'beaten' })
  arena: { pri: 3, ttl: 30, all: true },      // a boss's arena entered, the boss still there ({ boss })
  boss: { pri: 2, ttl: 4 },                   // in a boss's fight ({ boss, what }: 'start', an attack's name, 'split' { stage })
  beaten: { pri: 3, all: true },              // a boss beaten ({ boss })
  trial: { pri: 2, ttl: 8, shuffle: true },   // a trial room ({ what: 'sealed' | 'resolved' | 'failed' | 'puzzle': come into one not solved yet, kind })
};

// How often the robot talks (game/narrator.js). It is a companion, not a commentator: after a line
// of its own it keeps quiet a while before the next, the longer the less the moment matters (its
// `pri`): chatter (0) waits ROBOT_REST[0] s, what happens (1) [1], a boss's calls and a death (2)
// [2]; the story's scenes (3: its hello, a depth, an arena, a boss beaten) wait for nothing. Nor
// does it say anything while another line of its own is being said or waits (but such a scene).
// What comes while it must keep quiet is not said, and not told: it may come another time.
export const ROBOT_REST = [75, 40, 12, 0];
// may it say a line of a moment of priority `pri`, having kept quiet `quiet` s?
export const robotMayTalk = (pri, quiet) => quiet >= (ROBOT_REST[pri] ?? 0);

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
//
// His glass in the depths (core/glass.js GLASS): a chapter of his story a depth, three
// recordings each, of which a world places two (one on the way, one hidden). In the order of the
// depths: his craft (the road out of town), the star-readers and the stone (1), closing the glass
// round the pieces (2), the ark's wings and rising (3), tending the glass aboard (4), days on the
// ark (5), the creature brought on board (6); the voyage with it aboard (7 to 12: it learns to
// speak, the star-readers' worry, its questions, the smiths and the cold, a glass bird, the last
// calm night), the comet shower and the fall (13); down at the core, held (14 to 19: waking in the
// dark, its voice, the others, building it wings, his bubbles, nearly finished). Acts II and III
// are a first sketch; the core's is the ending's, still to come. They tell his story, never what
// is where the glass lies; now and then one touches on the depth it rests
// at, sideways (breath where Gusto breathes, the dark where Totnar makes it, a tide where Squarlo
// calls his ...). `depth`: where it lies; `where` { depth }: leaving the depth (for the town, the
// camp or another depth) cuts it short.
const FOUND_ROAD = msg('Found on the road out of town'), FOUND_DEEP = msg('Found at depth {depth}');
const deep = (id, title) => { const depth = depthOfGlass(id); return { id, title, found: depth ? FOUND_DEEP : FOUND_ROAD, depth, where: { depth } }; };
export const RECORDINGS = [
  { id: 'glass', title: msg('A voice in the glass'), found: msg('Found on a rock by the road'), where: { depth: 0 } },
  { id: 'camp', title: msg('Where the sword fell'), found: FOUND_ROAD, where: { depth: 0 } },
  deep('breath', msg('Every glass begins with a breath')),
  deep('star-sand', msg('Star-sand')),
  deep('birds', msg('Little birds of glass')),
  deep('readers', msg('The tower with no roof')),
  deep('red-light', msg('A red light')),
  deep('lanterns', msg('Lanterns at the door')),
  deep('sea', msg('A piece of the sea')),
  deep('lines', msg('Lines on a map')),
  deep('bread', msg('The smell of bread')),
  deep('feathers', msg('A thousand feathers')),
  deep('rising', msg('The ground turned away')),
  deep('steam', msg('Brass and steam')),
  deep('furnace', msg('A small furnace')),
  deep('rigging', msg('Up the rigging')),
  deep('cracks', msg('Cracks that hold')),
  deep('one-day', msg('If I could keep one day')),
  deep('clockworks', msg('Little clockworks')),
  deep('evenings', msg('Evenings on deck')),
  deep('cloth', msg('Under a cloth')),
  deep('face', msg('A face that watched')),
  deep('jar', msg('What it made')),
  deep('hum', msg('It hummed back')),
  deep('words', msg('Its first words')),
  deep('mountain', msg('The ground, standing up')),
  deep('charts', msg('Drifting, a little')),
  deep('lantern', msg('Her lantern')),
  deep('quarrel', msg('Voices on deck')),
  deep('why', msg('Why it was kept')),
  deep('hatch', msg('An inch of sky')),
  deep('left-open', msg('Left open')),
  deep('boilers', msg('Brass hearts')),
  deep('songs', msg('Work songs')),
  deep('frost', msg('Frost on the feathers')),
  deep('little-bird', msg('A little bird')),
  deep('cage', msg('In its cage')),
  deep('fond', msg('Do not grow fond')),
  deep('calm', msg('The last calm night')),
  deep('promise', msg('A promise')),
  deep('counted', msg('All of them')),
  deep('shower', msg('The comet shower')),
  deep('wings-broke', msg('The wings')),
  deep('bottom', msg('Something soft and dark')),
  deep('hull', msg('Waking in the hull')),
  deep('only-light', msg('The only light')),
  deep('crystals', msg('Walls that glitter')),
  deep('voice', msg('A voice like mine')),
  deep('walls', msg('Along the walls')),
  deep('bargain', msg('A bargain')),
  deep('lanterns-low', msg('Lanterns in the hull')),
  deep('bones', msg('Older than us')),
  deep('names', msg('Their names')),
  deep('ruins', msg('A town that fell')),
  deep('wings-again', msg('Wings again')),
  deep('slowly', msg('Slowly')),
  deep('first-bubble', msg('The first bubble')),
  deep('fire-below', msg('Fire below')),
  deep('who-hears', msg('Who hears them')),
  deep('nearly', msg('Nearly finished')),
  deep('afraid', msg('Afraid of the dark')),
  deep('find-me', msg('Find me')),
];
// a recording's lines, in order
export const recordingLines = id => LINES.filter(l => l.on === 'recording' && l.when?.part === id);
// the recordings heard in a world, or begun (told: run.told; a recording is told whole once it begins)
export const recordingsHeard = told => RECORDINGS.filter(r => recordingLines(r.id).some(l => told.has(l.id)));
// the recording a line is of (undefined: not a recording's)
export const recordingOf = line => line.on === 'recording' ? RECORDINGS.find(r => r.id === line.when?.part) : undefined;
// the place a map is, for a recording's `where`: 'town' (its houses too), 'camp', or null (out there)
export const placeOf = map => map?.town || map?.interior ? 'town' : map?.merchantCamp ? 'camp' : null;
// is line out of its place where the hero is now (map)? (game/narrator.js cuts it) A place is
// 'town' or 'camp' (placeOf), or { depth }: out there at that depth
export function outOfPlace(line, map) {
  const w = recordingOf(line)?.where;
  if (!w) return false;
  if (typeof w === 'string') return placeOf(map) !== w;
  return placeOf(map) !== null || (map?.depth ?? 0) !== w.depth;
}
// what the Memories tab says of where a recording was found
export const foundText = r => tr(r.found, { depth: r.depth ?? 0 });

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
// The robot at any other moment (MOMENTS): `robot.<id>`, what it sees and says about it. It knows
// the enemies and how the bosses fight, and gives tips; about the story it knows only scraps, which
// come back to it now and then (a boss beaten): never more than the glassmaker's recordings tell.
const says = (on, when, id, text, note, instruct, more = {}) => ({ id: `robot.${id}`, on, ...when ? { when } : {},
  voice: 'robot', text, note, instruct, ...more });

// how the robot says things (plain, gentle instructions: strong ones pull its voice off)
const BRIGHT = 'Speak brightly and quickly, like an eager child.';
const WARN = 'Speak quickly and urgently but clearly, like a child calling out a warning.';
const WONDER = 'Speak with curious wonder, like a child seeing something new.';
const SOFT = 'Speak softly and a little wistfully, like a child remembering something half forgotten.';
const CHEER = 'Speak with bright, bouncy joy, like a child cheering.';
const KIND = 'Speak warmly and kindly, like a child comforting a friend.';
const CHATTY = 'Speak lightly and playfully, chatting to pass the time.';
const UNEASY = 'Speak a little nervously, like a child trying to sound brave.';
const TIP = 'Speak brightly and clearly, like a child sharing a clever tip.';
// how he says his: low, old and tired, worn
const G_CALM = 'Speak low and calm, like an old man remembering, unhurried.';
const G_FOND = 'Speak low and fond, with a faint smile, remembering.';
const G_WRY = 'Speak low and dry, with a little wry humour.';
const G_SAD = 'Speak low and quiet, sad and tired, but steady.';
const G_HUSH = 'Speak low and hushed, slowly, as if afraid to wake something.';
const G_PROUD = 'Speak low and steady, with a craftsman\'s quiet pride.';

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

  // --- the robot wakes: the hero found it asleep in the merchant camp and woke it (core/robot.js) ---
  robot('hello', 'there', 'Oh! You woke me up! I have been lying here for a long, long time.',
    'The robot\'s first words. It lay asleep on its back in the merchant camp, and the hero just woke it: it opens its eyes, lifts off and shakes itself as it says this. Surprised and delighted.',
    'Speak brightly and quickly, surprised and glad, like an eager child just woken.'),
  robot('hello', 'who', 'The star-readers made me, of glass and clockwork. I had a name once, but I cannot find it any more.',
    'Who it is: the star-readers built it. It cannot get at all of what it remembers, its own name too. Cheerful about the first sentence, puzzled and a little wistful about the second, not sad.',
    'Speak cheerfully, then a little puzzled and wistful.'),
  robot('hello', 'come', 'So I will come with you, and light the way. Further down, it gets dark.',
    'From now on it follows the hero and glows; the way down through the depths gets darker. A small, warm promise.',
    'Speak warmly and brightly, like a small promise.'),

  // === the glassmaker's glass in the depths (core/glass.js): a chapter of the before time a depth ===
  // Recorded long after, down at the core, in the dark. He tells what was, not what is round the
  // hero: he cannot know where the glass comes to rest. Each recording stands on its own (a world
  // places two of a depth's three, in either order).

  // --- the road out of town (depth 0, Gusto's): his craft, before everything ---------------------
  recording('breath', 'begins', 'Every glass begins as a breath. Mine have, for forty years.',
    'A bubble of his glass found on the road out of town, before anything of the story. He talks about his craft: glassblowing is breathing. (Gusto, who breathes in and blows, waits at the end of this depth: the hero may notice; he does not mean it.)',
    G_FOND),
  recording('breath', 'slowly', 'You breathe out slowly, and the glass grows round your breath. Too fast, and it bursts in your face.',
    'How glass is blown, said plainly by somebody who has done it all his life.', G_CALM),
  recording('breath', 'master', 'My master said a glassmaker\'s lungs are his best tools. Then he coughed for an hour.',
    'A small joke about the old master who taught him. Fond.', G_WRY),
  recording('breath', 'small', 'I am old now, and short of breath. So I make my words small, and blow them carefully.',
    'Why his recordings are short: he is old, down in the dark, and blows each one into a little bubble of glass. Tired, gentle.', G_SAD),

  recording('star-sand', 'left', 'Star-sand is what is left where a star came down. It is pale, and warm even in winter.',
    'What star-sand is (the glass of his kind is made of it). Found on the road out of town. Wonder in it, though he has known it all his life.', G_CALM),
  recording('star-sand', 'wants', 'It wants to go back up. A glass made of it rises, unless somebody holds on to it.',
    'The second thing star-glass does (the first, that it keeps what it holds, the hero knows from the town). Plain.', G_CALM),
  recording('star-sand', 'boy', 'When I was a boy, I let one go by mistake. I watched it until it was a star again.',
    'A memory of his childhood: a small glass of star-sand that got away and rose until it looked like a star. Fond, a little wondering.', G_FOND),
  recording('star-sand', 'old-craft', 'Nobody bought star-glass any more, by then. It was an old craft, for old men like my master.',
    'Star-glass was nearly forgotten before the stone: why the star-readers later came to him and not the guild.', G_CALM),

  recording('birds', 'workshop', 'My workshop stood at the edge of town, by the well. I made windows, mostly, and bottles.',
    'His workshop, long ago and far away (not the town the hero is from: he does not know where his glass lands). Plain and warm.', G_FOND),
  recording('birds', 'children', 'Children stood at my window and watched the glass glow. Some of them stood there all day.',
    'The children who watched him work. Smiling.', G_FOND),
  recording('birds', 'blew', 'For the ones who stayed longest, I blew little birds. Wings out, as if they were just landing.',
    'He made little glass birds for them (the glass bird of the game\'s title and splash screen is never named; this is only a hint).', G_FOND),
  recording('birds', 'windowsill', 'I wonder where those birds are now. I hope somebody still keeps one on a windowsill.',
    'Wistful: the world broke since, and he does not know what became of anything.', G_SAD),

  // --- depth 1 (Totnar's, who makes it dark): the star-readers, and the stone ----------------------
  recording('readers', 'tower', 'The star-readers lived on the hill, in a tower with no roof. They slept by day and read the sky by night.',
    'Who the star-readers were, to the people of his town: odd folk on a hill. Found at depth 1.', G_CALM),
  recording('readers', 'pebbles', 'We thought them odd. Children threw pebbles at their door, and ran away laughing.',
    'A little ashamed and amused.', G_WRY, { seed: { de: 3 } }),
  recording('readers', 'once', 'I did too, once. I was not always old.',
    'He owns up to having been one of those children. Dry, smiling.', G_WRY),
  recording('readers', 'fire', 'They never lit a fire up there, not even in winter. A fire, they said, makes you blind to the sky.',
    'The star-readers kept to the dark to see the stars. (Totnar, who brings the dark, lives at this depth; he does not know.)', G_CALM),

  recording('red-light', 'listened', 'When the star-readers spoke of the stone, nobody listened. Then we saw it ourselves.',
    'The stone the star-readers warned of: at first nobody believed them. Found at depth 1. Grave.', G_CALM),
  recording('red-light', 'small', 'A small red light, low in the sky, that did not move with the others.',
    'What the stone looked like at first. Quiet, a little uneasy still.', G_HUSH),
  recording('red-light', 'bigger', 'Every night it was a little bigger. People stopped going out after dark.',
    'The fear growing in his town.', G_SAD),
  recording('red-light', 'furnace', 'I kept my furnace burning all night, so I would not have to look up.',
    'How he coped: he worked through the nights with his fire lit, so he did not have to see it. Sad, a little ashamed.', G_SAD),

  recording('lanterns', 'night', 'They came at night, three of them, each with a lantern turned down low.',
    'The night the star-readers came to his door (the opening film says they came; this is how). Found at depth 1. Hushed.', G_HUSH),
  recording('lanterns', 'handful', 'The oldest held out a handful of star-sand. She asked whether I could make a great deal of it rise.',
    'The oldest star-reader, a woman, asks him for star-glass enough to lift pieces of the world (she does not say so yet).', G_CALM),
  recording('lanterns', 'yes', 'I said yes before I understood what she meant. I have always been too quick to say yes.',
    'He agreed at once. Wry, and a little rueful.', G_WRY),
  recording('lanterns', 'looked-up', 'That night, for the first time, I looked up at the red light for a long while.',
    'After they left, he finally looked at the stone. Quiet, slow.', G_HUSH),

  // --- depth 2 (Squarlo's, whose tide floods his hills): closing the glass round the pieces --------
  recording('sea', 'hardest', 'The hardest piece to close was the sea. Water will not hold still to be measured.',
    'Closing his glass round a piece of the sea (the opening film names it). Found at depth 2. A craftsman\'s memory of a hard job.', G_PROUD),
  recording('sea', 'low-tide', 'I closed the glass at low tide, round the beach, the shallows and a few small hills.',
    'How he did it. Plain.', G_CALM),
  recording('sea', 'tide-came', 'The tide came in anyway, inside the glass. It still does, twice a day, with nowhere to go.',
    'Glass keeps what it holds, its tide too: the water rises and falls inside the piece for ever. (Squarlo calls a tide at this depth; he does not know.)', G_CALM),
  recording('sea', 'hills', 'Whoever lives there learned to love the hills. I am sorry about that.',
    'A dry joke with an apology in it.', G_WRY),

  recording('lines', 'chose', 'I did not choose the pieces. The star-readers drew lines on their maps, and I closed my glass along the lines.',
    'Who decided which pieces of the world were kept: the star-readers, not he. Found at depth 2. Whether all the world was cut up or only some saved stays unclear on purpose.', G_CALM),
  recording('lines', 'here-there', 'A town here. A forest there. Half a mountain, because the line ran through it.',
    'Lists what went into the glass, plainly, the last with a little wonder at how odd it was.', G_WRY, { seed: { de: 1 } }),
  recording('lines', 'between', 'I never asked about the places between the lines. What would become of them.',
    'He does not say what happened to them: he does not know, or will not say. Slow.', G_SAD),
  recording('lines', 'every-night', '[sad]I should have asked. I ask it every night now, down here.',
    'Regret. Down here: at the core, where he is held.', G_SAD),

  recording('bread', 'kindness', 'People did not have to do anything. That is the kindness of star-glass: it closes round you, and you hardly notice.',
    'Being closed in the glass did not hurt anyone. Found at depth 2. Gentle.', G_CALM),
  recording('bread', 'baker', 'In one piece a baker went on baking. I could smell the bread through the glass.',
    'A small warm memory. Smiling.', G_FOND),
  recording('bread', 'keeps', 'Glass keeps what it holds. Even the smell of bread, even the morning it was baked.',
    'What star-glass keeps, said tenderly.', G_FOND),
  recording('bread', 'hungry', 'I was hungry the whole time. I did not have a piece of my own.',
    'He closed the glass round others\' homes and had none himself. Dry, then a little sad.', G_WRY),

  // --- depth 3 (Flip's, who turns his box over): the ark's wings, and rising -----------------------
  recording('feathers', 'idea', 'The ark was the star-readers\' idea, and its brass was the smiths\' work. The wings were mine.',
    'The winged ark that carried the pieces up. Found at depth 3. The last sentence with quiet pride.', G_PROUD),
  recording('feathers', 'thousand', 'A thousand feathers of glass, each blown to want the sky a little.',
    'How he made the wings: star-glass rises, so each feather pulled up a little. Wonder.', G_PROUD),
  recording('feathers', 'too-much', 'Too much, and the ark would never have come down. Too little, and it would never have gone up.',
    'The balance he had to find. Thoughtful.', G_CALM),
  recording('feathers', 'proud', 'I got it just right. I was proud of that, for a while.',
    '\'For a while\': the wings broke later (he does not say so here). Pride with a shadow over it.', G_SAD),

  recording('rising', 'page', 'When we rose, the ground turned away below us, slowly, like the page of a book.',
    'The ark rising, the world falling away under it. Found at depth 3. Wonder.', G_CALM),
  recording('rising', 'up-down', 'After a while, up and down did not mean much. There was only towards the stars, and away from them.',
    'Up in the sky. (Flip turns his box any side up at this depth; he does not know.)', G_CALM),
  recording('rising', 'smiths', 'The smiths were sick for days. I was not. Glassmakers are used to turning things.',
    'A dry joke: a glassblower turns his pipe all day long.', G_WRY),
  recording('rising', 'lanterns', 'The pieces came up after us, through the clouds, like lanterns on a string.',
    'The pieces of the world rising after the ark. Tender, a beautiful memory.', G_FOND),

  recording('steam', 'huff', 'The ark breathed steam to steer. You could hear it all over the deck, a slow huff, like a sleeping horse.',
    'What the ark sounded like. Found at depth 3. Fond.', G_FOND),
  recording('steam', 'kept', 'The smiths kept her boilers. The star-readers kept her charts. I kept the glass.',
    'Who did what aboard. A steady rhythm.', G_PROUD),
  recording('steam', 'lines', 'Every piece of the world hung under her on lines of light, and turned when she turned.',
    'The pieces were held together under the ark (the comet shower later lets them go).', G_CALM),
  recording('steam', 'slowly', 'When she turned too fast, everything we carried swung round with her. We learned to turn slowly.',
    'Turning the ark: careful. (Flip turns things too fast at this depth; he does not know.)', G_CALM),

  // --- depth 4 (Foggery's, a tower in rising lava): tending the glass aboard ----------------------
  recording('furnace', 'hold', 'I had a small furnace in the hold of the ark. Glass mends, if it is hot enough and you are quick.',
    'His work aboard: mending the glass. Found at depth 4. Matter-of-fact.', G_PROUD),
  recording('furnace', 'quick', 'I was very quick, in those days.',
    'Wry about his age.', G_WRY),
  recording('furnace', 'heat', 'Star-glass does not mind the cold, but it minds heat. Too hot, and it forgets what it holds.',
    'A rule of his glass: heat is its danger. (A lava-filled place lies at this depth; he does not know.) Grave.', G_CALM),
  recording('furnace', 'quarrel', 'So I kept the fire small, and the pieces far from it. Fire and glass are old friends, but they quarrel.',
    'A craftsman\'s saying, with a little smile.', G_FOND),

  recording('rigging', 'morning', 'Every morning I climbed the rigging to look at the pieces. The higher you climb, the more of them you see.',
    'His mornings aboard. Found at depth 4. (Foggery\'s fight is a climb; he does not know.)', G_FOND),
  recording('rigging', 'sound', 'A cracked pane has a sound of its own, high and thin. You learn to hear it over the wind.',
    'How he found cracks: by ear. Quiet, precise.', G_HUSH),
  recording('rigging', 'glowing', 'When I heard one, I went down to the furnace, and up again with the glass still glowing.',
    'Running down to his furnace and back up. A little proud.', G_PROUD, { seed: { de: 1 } }),
  recording('rigging', 'knees', 'Down and up, all day. My knees remember it better than I do.',
    'Dry joke about being old.', G_WRY),

  recording('cracks', 'watch', 'Not every crack can be mended. Some you can only watch.',
    'About cracks in his glass. Found at depth 4. Quiet.', G_CALM),
  recording('cracks', 'hold', 'But a crack is not a break. Star-glass can crack a hundred times and still hold.',
    'Reassuring: the pieces of the world have cracks, and they hold (docs/story.md).', G_PROUD),
  recording('cracks', 'afraid', 'If you see cracks in the sky where you are, do not be afraid of them. I made that glass to hold.',
    'Said to whoever finds this, without knowing where they are: if. Warm, steady, a promise.', G_CALM),
  recording('cracks', 'heat', 'It is the heat I worry about. Never the cracks.',
    'A small shadow at the end.', G_SAD),

  // --- depth 5 (Renew's, who turns time back): days on the ark -----------------------------------
  recording('one-day', 'keeps', 'Glass keeps things as they are. That is why people trusted it, and why it frightened me a little.',
    'What his glass does, and his unease about it. Found at depth 5. Thoughtful.', G_CALM),
  recording('one-day', 'which', 'If I could keep one day the way my glass keeps things, I know which one I would keep.',
    'A wish. (Renew turns time back at this depth; he does not know.) Slow.', G_CALM),
  recording('one-day', 'morning', 'The morning before the star-readers came. Bread, a cold window, and nothing to be afraid of.',
    'The day he would keep. Tender.', G_FOND),
  recording('one-day', 'gives', '[sighing]But glass only keeps. It never gives anything back.',
    'He knows a wish is only a wish.', G_SAD),

  recording('clockworks', 'aboard', 'The star-readers brought little clockworks on board, with wings, to fly between the pieces and carry word.',
    'Little winged clockworks of the star-readers aboard the ark (the robot is one, never said: it cannot remember). Found at depth 5.', G_FOND),
  recording('clockworks', 'feathers', 'I made their glass, and their wings. Four feathers on each side, like a sparrow\'s.',
    'He made them (the robot has four glass feathers on each wing: a hint, never said outright).', G_FOND, { seed: 3 }),
  recording('clockworks', 'names', 'They ticked faster when they were happy. Some of them had names; I never learned them.',
    'Fond, and a little sorry (the robot has lost its name).', G_FOND),
  recording('clockworks', 'finding', 'I hope some of them still fly. They were very good at finding people.',
    'Hopeful (the robot found the hero).', G_CALM),

  recording('evenings', 'best', 'On the ark, the evenings were the best part. The sun went down below us, not in front of us.',
    'Evenings in the sky. Found at depth 5 (where Renew\'s fight falls from dusk into night; he does not know). Warm.', G_FOND),
  recording('evenings', 'gold', 'We sat on the deck, the smiths, the star-readers and I, and watched the pieces turn gold, one after the other.',
    'A peaceful memory.', G_FOND),
  recording('evenings', 'stone', 'Nobody spoke of the stone. We had left it behind, or so we told each other.',
    'A shadow under the peace.', G_CALM),
  recording('evenings', 'stars', 'Then the night came, and with it the stars, more of them than I had ever seen.',
    'Wonder, quiet. (Comets come later: he does not say so.)', G_HUSH),

  // --- depth 6 (Mansk's, a mask in a museum): the creature brought on board ------------------------
  recording('cloth', 'last-day', 'On the last day before we rose, the star-readers brought one more thing on board, under a cloth.',
    'The creature, first seen (never named: \'a thing\', \'it\'). Found at depth 6, the last of the sky. Hushed, uneasy.', G_HUSH),
  recording('cloth', 'carried', 'Four of them carried it, slowly, as if it might break. Or bite.',
    'The last two words after a pause, dry.', G_WRY),
  recording('cloth', 'needed', 'They said it was needed for the glass. They did not say for what.',
    'What the creature makes stays open. Grave.', G_CALM),
  recording('cloth', 'sleep', 'They put it in the hold, next to my furnace. I did not sleep well, after that.',
    'Uneasy.', G_HUSH),

  recording('face', 'slipped', 'Once, the cloth slipped. Behind the bars there was a face, and it was looking at me.',
    'He saw the creature. Found at depth 6 (Mansk, a mask, lives here: he does not know). Hushed.', G_HUSH),
  recording('face', 'people', 'Not the way an animal looks. The way people look, when they want to know what you are thinking.',
    'The creature is clever. Slow, a little shiver in it.', G_HUSH),
  recording('face', 'on-show', 'The star-readers kept it like a thing on show, and talked about it in front of it, as if it were not there.',
    'He did not like how it was kept (the creature is a prisoner too: docs/story.md). Disapproving, quietly.', G_CALM),
  recording('face', 'sorry', 'I did not like that. I put the cloth back, gently, and said I was sorry.',
    'He spoke to it: the creature learned the people\'s language (he does not know it yet, here). Gentle.', G_SAD),

  recording('jar', 'evening', 'Every evening a star-reader went down into the hold with an empty jar, and came back up with a full one.',
    'The creature makes something the star-readers need for the pieces. Found at depth 6. Plain, curious.', G_CALM),
  recording('jar', 'hummed', 'I never saw what was in it. It hummed, and the pieces shone brighter afterwards.',
    'What it is stays open: maybe what keeps the glass aloft, or its light. Wondering.', G_HUSH),
  recording('jar', 'ask', 'I did not ask. In those days I thought it was not my place to ask.',
    'Rueful.', G_SAD),
  recording('jar', 'questions', 'Down here, I have had a long time to think of all the questions I did not ask.',
    'Down here: at the core, held by the creature. Tired.', G_SAD),

  // === act II (depths 7 to 12): the voyage, with the creature aboard (a sketch: one chapter a depth) ===
  // Between the creature brought on board (depth 6) and the comet shower (13): it learns his words,
  // the star-readers worry, it asks its questions, the smiths, a glass bird he gives it, the last
  // calm night. Each touches its depth sideways now and then (the mountain where Monteur pulls them
  // up, frost where the frozen caves may lie, a forge's anvil); the creature is never named.

  // --- depth 7 (Monteur's, who pulls mountains out of the floor): the creature learns to speak ---
  recording('hum', 'furnace', 'At night I kept my furnace low, and the thing in the hold hummed along with it.',
    'The creature\'s first sounds, on the ark. Found at depth 7, the first of act II. Hushed, a little wondering.', G_HUSH),
  recording('hum', 'answered', 'I hummed back, to see what it would do. It answered, a little higher.',
    'He hummed to it, and it hummed back. Fond, surprised still.', G_FOND),
  recording('hum', 'every-night', 'After that we hummed every night. The smiths thought I had gone strange.',
    'A dry little joke.', G_WRY),

  recording('words', 'hot', 'The first word it learned from me was hot. I said it every time I opened the furnace.',
    'It learns his language (docs/story.md, "The kidnapping"): the first word. Found at depth 7. Fond.', G_FOND),
  recording('words', 'more', 'Then glass, and sorry, and night. It learned faster than any apprentice I ever had.',
    'More words; the last sentence dry.', G_WRY),
  recording('words', 'my-voice', 'It said them in my voice, almost. That frightened me more than its face had.',
    'A shiver.', G_HUSH),

  recording('mountain', 'asked', 'One night it asked me what a mountain was. It had never seen the ground from above.',
    'Its questions about the world below. Found at depth 7 (where Monteur pulls mountains out of the floor; he does not know). Calm.', G_CALM),
  recording('mountain', 'standing', 'I told it a mountain is the ground, standing up to look at the sky.',
    'His answer, with a smile.', G_FOND),
  recording('mountain', 'story', 'It liked that. It asked for the mountain again every night, the way a child asks for a story.',
    'Tender.', G_FOND),

  // --- depth 8: the star-readers' worry ------------------------------------------------------------
  recording('charts', 'drift', 'Every night the star-readers marked the pieces on their charts. Every night the marks were a little further apart.',
    'The pieces begin to drift. Found at depth 8. Grave.', G_CALM),
  recording('charts', 'thin', 'The lines of light still held them, but they grew thin. I could see the stars through them.',
    'The lines of light that hold the pieces under the ark (depth 3\'s chapter). Quiet.', G_SAD),
  recording('charts', 'jar', 'So they went down with their jar more often. The humming in the hold grew quieter.',
    'They take more of what the creature makes (the jar, depth 6), and it weakens. Hushed.', G_HUSH),

  recording('lantern', 'tired', 'The oldest star-reader grew tired up there. She slept through the nights, and missed the stars.',
    'The oldest star-reader, the woman who came to his door (depth 1). Found at depth 8. Sad.', G_SAD),
  recording('lantern', 'gave', 'One evening she gave me her lantern. She said a glassmaker should have one light that is not a fire.',
    'A gift. Fond.', G_FOND),
  recording('lantern', 'still', 'I have it still, down here. It is the only light I do not have to feed.',
    'Down here: at the core. Calm.', G_CALM),

  recording('quarrel', 'smiths', 'The smiths wanted the thing put off the ark. The star-readers said we would fall without what it made.',
    'A quarrel aboard about the creature. Found at depth 8. Plain.', G_CALM),
  recording('quarrel', 'loud', 'They quarrelled on deck at night, loud enough to wake the pieces.',
    'Dry.', G_WRY),
  recording('quarrel', 'nobody', 'Nobody asked the thing what it wanted. Nobody asked me, either.',
    'Rueful.', G_SAD),

  // --- depth 9: its questions --------------------------------------------------------------------
  recording('why', 'asked', 'Once it had words enough, it asked me why it was kept in the dark.',
    'The creature asks why it is a prisoner. Found at depth 9. Hushed.', G_HUSH),
  recording('why', 'whom', 'I said it was needed, and it asked: by whom? I had no answer I liked.',
    'He had no good answer. Sad.', G_SAD),
  recording('why', 'thinking', 'I thought about that question all night, at the furnace. I am still thinking about it.',
    'Tired.', G_SAD),

  recording('hatch', 'see', 'It asked to see the stars, just once. It had heard us talk about them every night.',
    'Found at depth 9. Calm.', G_CALM),
  recording('hatch', 'inch', 'So I opened the hatch over the hold an inch, no more. Starlight fell in, a thin white line.',
    'He shows it the stars, secretly. Hushed.', G_HUSH),
  recording('hatch', 'still', 'It did not move all night. I have never seen anything keep so still.',
    'Wonder.', G_HUSH, { seed: { de: 1 } }),

  recording('left-open', 'after', 'After that I left the hatch open a little every night. Nobody noticed, or nobody said.',
    'Found at depth 9. Dry.', G_WRY),
  recording('left-open', 'eleven', 'It counted the stars it could see. Eleven, through an inch of sky.',
    'Fond.', G_FOND),
  recording('left-open', 'wider', 'Sometimes I wonder whether I should have opened it wider. Or not at all.',
    'Doubt.', G_SAD),

  // --- depth 10: the smiths, and the cold ---------------------------------------------------------
  recording('boilers', 'hearts', 'The smiths fed the ark\'s boilers day and night. They called them her hearts.',
    'The smiths aboard. Found at depth 10 (a forge may stand at this depth; he does not know). Fond.', G_FOND),
  recording('boilers', 'anvil', 'Even up there they had an anvil. You could hear it ring out across the pieces.',
    'Fond.', G_FOND),
  recording('boilers', 'harder', 'Brass or glass, which is harder to work? We argued about it every evening, and both of us were wrong.',
    'A friendly old argument. Wry.', G_WRY),

  recording('songs', 'sang', 'The smiths sang while they worked, slow songs in time with the hammer.',
    'Found at depth 10. Fond.', G_FOND),
  recording('songs', 'learned', 'The thing in the hold learned their songs too. It hummed them back, a little out of time.',
    'Wry, warm.', G_WRY),
  recording('songs', 'stopped', 'When the smiths heard it, they stopped singing. I never heard those songs again.',
    'Sad.', G_SAD),

  recording('frost', 'cold', 'High up it was cold, colder than any winter at home. Frost grew on the wings every night.',
    'The cold of the sky. Found at depth 10 (frozen caves may lie at this depth; he does not know). Calm.', G_CALM),
  recording('frost', 'scraped', 'Every morning I scraped the feathers clean, one by one, before the sun could crack them.',
    'His work on the wings. Proud.', G_PROUD),
  recording('frost', 'sound', 'A thousand feathers, every morning. I knew each one by its sound.',
    'Fond.', G_FOND),

  // --- depth 11: a bird for the creature --------------------------------------------------------
  recording('little-bird', 'blew', 'One night I blew a little glass bird for it, like the ones I made for the children at my window.',
    'A gift to the creature (the birds for the children: depth 0; the glass bird of the game\'s splash is never named). Found at depth 11. Fond.', G_FOND),
  recording('little-bird', 'bars', 'I passed it through the bars. It held the bird the way you hold something that might fly away.',
    'Hushed.', G_HUSH),
  recording('little-bird', 'fly', 'It asked me whether glass could fly. I said only if you make it want to.',
    'Star-glass wants the sky (depth 0). Fond; a hint of what it will want of him.', G_FOND),

  recording('cage', 'face', 'It kept the bird close to its face, and hummed to it.',
    'Found at depth 11. Tender.', G_FOND),
  recording('cage', 'light', 'When the hold was dark, the bird caught the last of my furnace light.',
    'Hushed.', G_HUSH),
  recording('cage', 'wings', 'It turned the bird round and round, and looked at its wings for a long time.',
    'A hint: it will want wings. Hushed, uneasy.', G_HUSH),

  recording('fond', 'saw', 'The oldest star-reader saw the bird. She told me not to grow fond of the thing.',
    'Found at depth 11. Calm.', G_CALM),
  recording('fond', 'late', 'I told her it was too late for that. She did not smile.',
    'Wry.', G_WRY),
  recording('fond', 'knew', 'I think she knew something I did not. I wish I had asked her what.',
    'Regret (he never asked enough: depth 6).', G_SAD),

  // --- depth 12: the last calm night --------------------------------------------------------------
  recording('calm', 'quiet', 'The night before the comets was the calmest of all. No wind, no quarrels, only the boilers breathing.',
    'The night before the comet shower (depth 13). Found at depth 12, the last before the bottom of act II. Hushed.', G_HUSH),
  recording('calm', 'deck', 'Everyone was on deck, even the oldest star-reader. Nobody said why.',
    'Calm, a little uneasy.', G_CALM),
  recording('calm', 'coming', 'I think we all felt something coming. We just did not know which way to look.',
    'Sad.', G_SAD),

  recording('promise', 'asked', 'That night it asked me to promise one thing: never to leave it alone in the dark.',
    'The creature\'s promise (it holds him to it, down at the core). Found at depth 12. Hushed.', G_HUSH),
  recording('promise', 'easy', 'I promised. It was an easy promise to make, up there, under all those stars.',
    'Sad.', G_SAD),
  recording('promise', 'kept', '[sighing]I have kept it. Down here, it has kept me to it.',
    'Down here: he is its prisoner. Tired, steady.', G_SAD),

  recording('counted', 'pieces', 'Before I slept, I climbed the rigging and counted the pieces. They were all there.',
    'Found at depth 12. Fond.', G_FOND),
  recording('counted', 'last', 'It was the last time I saw them all together, hanging in the night like lanterns.',
    'Sad.', G_SAD),
  recording('counted', 'number', 'I am glad I counted. I still know the number by heart.',
    'Calm.', G_CALM),

  // --- depth 13 (Slomo's, the bottom of act II, under falling slime): the comet shower, the fall ---
  recording('shower', 'night', 'The comets came at night, a whole shower of small ones. The star-readers had only ever looked for the one stone.',
    'The comet shower that broke the ark (the opening film shows it without a word). Found at depth 13, the bottom of the second act. Grave.', G_CALM),
  recording('shower', 'beautiful', 'At first they were beautiful. Green and white, falling slowly, like sparks from a furnace.',
    'Wonder, before the harm.', G_HUSH),
  recording('shower', 'wing', 'Then the first one struck the wing, and they were not beautiful any more.',
    'Flat, heavy.', G_SAD),
  recording('shower', 'still', 'Some of them still fall, I think, even now. Small ones, at night.',
    'The meteors that still fall at night in the slime marsh (and Slomo\'s) are what is left of the shower: a hint. Quiet.', G_HUSH),

  recording('wings-broke', 'sound', 'A cracked pane sounds high and thin. That night, the whole sky made that sound.',
    'The night the ark\'s wings broke. Found at depth 13. Slow, heavy.', G_SAD),
  recording('wings-broke', 'feather', 'My wings broke one feather at a time. I counted, and then I stopped counting.',
    'His wings. Steady, barely.', G_SAD),
  recording('wings-broke', 'drifted', 'The lines of light went slack. The pieces drifted off, each its own way, like lanterns let go.',
    'The pieces scattered into the dark (the world the hero lives in).', G_SAD),
  recording('wings-broke', 'fell', '[sad]I watched them go until I could not see them any more. Then we fell.',
    'The end of it.', G_SAD),

  recording('bottom', 'long', 'We fell for a long time. Past everything, below everything, into the dark.',
    'The ark\'s hull falling to the core, with him and the creature in it. Found at depth 13. Slow.', G_HUSH),
  recording('bottom', 'soft', 'We came down in something soft and cold, that held on to us the way mud holds a boot.',
    'Where they came down (slime holds the hero at this depth; he does not know). Uneasy.', G_CALM),
  recording('bottom', 'empty', 'When I woke, the hold was open, and the cage was empty.',
    'The creature got out. Hushed.', G_HUSH),
  recording('bottom', 'name', '[whispers]Then something in the dark said my name. It had learned it from me.',
    'The creature speaks his language now (docs/story.md, "The kidnapping"): the end of act II. He never says the name.', G_HUSH),

  // === act III (depths 14 to 19): down at the core, held (a sketch: one chapter a depth) ==========
  // After the fall: waking in the hull, its voice in the dark, the others gone, building it wings,
  // his bubbles of glass, nearly done. Never what lies round the hero; now and then its depth
  // sideways (crystals, threads like a spider's, old bones, a buried town, rock that runs like
  // syrup). The ending (the core's last recording, the glass bird) is still to come.

  // --- depth 14: waking in the dark -------------------------------------------------------------
  recording('hull', 'woke', 'I woke in the hull of the ark, lying on my back. Above me there was no sky at all.',
    'After the fall, at the core. Found at depth 14, the first of act III, the deep. Hushed.', G_HUSH),
  recording('hull', 'boilers', 'The boilers had stopped. For the first time in a year, nothing was breathing but me.',
    'The ark\'s boilers (her hearts, depth 10) silent. Sad.', G_SAD),
  recording('hull', 'called', 'I called out for the others. Only my own voice came back.',
    'Sad.', G_SAD),

  recording('only-light', 'lit', 'My little furnace had come down with me. I lit it with shaking hands.',
    'His furnace from the hold (depth 4). Found at depth 14. Calm.', G_CALM),
  recording('only-light', 'burning', 'Down here it is the only light there is. Whatever happens, I keep it burning.',
    'Steady, proud.', G_PROUD),
  recording('only-light', 'dark', 'Star-glass minds the heat, but I mind the dark more.',
    'Star-glass minds heat (depth 4). Dry.', G_WRY, { seed: { en: 1 } }),

  recording('crystals', 'glitter', 'In the furnace light the walls glittered. Crystals, everywhere, as tall as doors.',
    'Found at depth 14 (crystal mines may lie at this depth; he does not know). Hushed wonder.', G_HUSH),
  recording('crystals', 'grow', 'I think they grow from all the glass that ever fell this far. Some of it may be mine.',
    'Calm.', G_CALM),
  recording('crystals', 'company', 'They catch the light and give it back. It is a kind of company.',
    'Fond, lonely.', G_FOND),

  // --- depth 15: its voice in the dark ------------------------------------------------------------
  recording('voice', 'sentences', 'It speaks in whole sentences now, slowly, in a voice very like mine.',
    'The creature, who learned his words on the ark. Found at depth 15. Hushed.', G_HUSH),
  recording('voice', 'please', 'It is always polite, and it says please. Somehow that is the worst of it.',
    'Wry, uneasy.', G_WRY),
  recording('voice', 'hurt', 'It has never once hurt me. It only will not let me go.',
    'Sad.', G_SAD),

  recording('walls', 'arms', 'It moves along the walls on long, soft arms. I hear it more than I see it.',
    'Found at depth 15 (spider nests may lie at this depth; he does not know). Hushed.', G_HUSH),
  recording('walls', 'threads', 'It hangs threads of something from the rock, the way a spider would. I do not know what for.',
    'Hushed.', G_HUSH),
  recording('walls', 'lower', 'When it comes near, my furnace burns lower. I have learned to feed it first.',
    'Calm.', G_CALM),

  recording('bargain', 'build', 'It wants me to build something. In return it brings me food, and sand for my glass.',
    'What it holds him for (docs/story.md, "The kidnapping"). Found at depth 15. Calm.', G_CALM),
  recording('bargain', 'wings', 'It wants to leave this place, and it cannot climb. So it wants wings.',
    'Calm.', G_CALM),
  recording('bargain', 'yes', 'I said yes too quickly, as I always do. But what else could I have said?',
    'He was always too quick to say yes (depth 1). Wry.', G_WRY),

  // --- depth 16: the others --------------------------------------------------------------------
  recording('lanterns-low', 'searched', 'I searched the whole hull for the others. I found their lanterns, still turned down low.',
    'The smiths and star-readers are gone; what became of them stays open. Found at depth 16. Sad.', G_SAD, { seed: { de: 1 } }),
  recording('lanterns-low', 'nothing', 'Nothing else. Whether they climbed out or were carried off, I do not know.',
    'Sad.', G_SAD),
  recording('lanterns-low', 'choose', 'I choose to think they climbed. A man needs something to choose.',
    'Quiet resolve.', G_CALM),

  recording('bones', 'old', 'Down here lie the bones of things that fell long before us. Big things, and very old.',
    'Found at depth 16 (an ossuary may lie at this depth; he does not know). Hushed, not frightening.', G_HUSH),
  recording('bones', 'first', 'So we were not the first to fall this far. That should not comfort me, but it does.',
    'Calm.', G_CALM),
  recording('bones', 'softly', 'I walk softly among them. It seems polite.',
    'Dry.', G_WRY),

  recording('names', 'furnace', 'Each night, before I sleep, I say the names of the smiths and the star-readers to my furnace.',
    'He never says them (a recorded line says no name). Found at depth 16. Sad.', G_SAD),
  recording('names', 'keep', 'I do not blow their names into my glass. Names do not keep in glass.',
    'As in the opening film: "Names do not keep in glass". Calm.', G_CALM),
  recording('names', 'fire', 'But the fire remembers them, I think, for as long as it burns.',
    'Sad, gentle.', G_SAD),

  // --- depth 17: building ------------------------------------------------------------------------
  recording('ruins', 'town', 'Not far from the hull lie the ruins of a town that fell long ago. A whole piece of the world.',
    'Found at depth 17 (buried ruins may lie at this depth; he does not know). Hushed.', G_HUSH),
  recording('ruins', 'windows', 'I take glass from its windows for the thing I must build. I always say sorry to the houses.',
    'Sad, a little wry.', G_SAD),
  recording('ruins', 'nobody', 'Nobody lives there any more. I looked, and I was glad, and I was sorry.',
    'Sad.', G_SAD),

  recording('wings-again', 'again', 'So I am making wings again. Smaller than the ark\'s, but they must carry more.',
    'Wings for the creature. Found at depth 17. Proud, uneasy.', G_PROUD),
  recording('wings-again', 'want', 'Every feather has to want the sky. This far from it, that is hard to blow.',
    'Star-glass wants to rise (depth 0). Calm.', G_CALM),
  recording('wings-again', 'breath', 'Every glass begins with a breath. I give each feather a little of mine.',
    'As in depth 0\'s first recording. Tired.', G_SAD),

  recording('slowly', 'work', 'I work slowly. It does not hurry me, but I work slowly all the same.',
    'Found at depth 17. Hushed.', G_HUSH),
  recording('slowly', 'after', 'Once it has its wings, I do not know what becomes of me. Or of it, up there.',
    'Sad.', G_SAD),
  recording('slowly', 'master', 'My master said there is no shame in a careful glassmaker. I am being very careful.',
    'His old master (depth 0). Wry.', G_WRY),

  // --- depth 18: his bubbles of glass --------------------------------------------------------------
  recording('first-bubble', 'accident', 'The first bubble I blew my words into was an accident. I spoke while I blew, and the glass kept it.',
    'How his recordings began. Found at depth 18. Calm.', G_CALM),
  recording('first-bubble', 'another', 'I let it go, and it rose into the dark. That night I blew another, on purpose.',
    'Fond.', G_FOND),
  recording('first-bubble', 'hundreds', 'I have blown hundreds since. You are listening to one of them.',
    'Dry, warm.', G_WRY),

  recording('fire-below', 'syrup', 'Below the hull the rock is hot, and in places it runs like syrup.',
    'Found at depth 18 (volcanic depths may lie here; he does not know). Calm.', G_CALM),
  recording('fire-below', 'fast', 'My bubbles must rise fast, or the heat makes them forget what they hold.',
    'Star-glass minds heat (depth 4). Calm.', G_CALM),
  recording('fire-below', 'quiet', 'So I blow them when the rock is quiet, and let them go straight up.',
    'Calm.', G_CALM),

  recording('who-hears', 'where', 'I never know where they come to rest. In a field, maybe, or a river, or somebody\'s pocket.',
    'He does not know where his glass lands. Found at depth 18. Fond.', G_FOND),
  recording('who-hears', 'talk', 'I talk to whoever finds them as if I knew them. It is easier than talking to the dark.',
    'Calm.', G_CALM),
  recording('who-hears', 'thank', '[whispers]If you have heard this many, thank you for listening.',
    'Quiet thanks.', G_SAD),

  // --- depth 19: nearly finished ------------------------------------------------------------------
  recording('nearly', 'light', 'The thing I am building is nearly finished. Its wings catch my furnace light like water.',
    'Found at depth 19, the last before the core. What it is stays open. Proud.', G_PROUD),
  recording('nearly', 'birds', 'It looks like the little birds I made for the children. I did not mean it to, but my hands did.',
    'A hint at the glass bird (docs/story.md, "Ideas"): never said. Fond.', G_FOND),
  recording('nearly', 'watches', 'It watches me work, and holds the little bird I gave it, all the time.',
    'The bird of depth 11. Hushed.', G_HUSH),

  recording('afraid', 'too', 'Last night it told me it is afraid of the dark too. It always has been.',
    'The creature is a prisoner too. Found at depth 19. Hushed.', G_HUSH),
  recording('afraid', 'together', 'I did not know what to say. So I turned my furnace up, and we sat by it together.',
    'Sad, tender.', G_SAD),
  recording('afraid', 'prisoners', 'Two old prisoners by one small fire. That is what we are now.',
    'Sad.', G_SAD),

  recording('find-me', 'close', 'Some of my glass does not rise far. If you found this one deep down, you are close.',
    'He cannot know where it lands, only that some of it stays deep. Found at depth 19. Calm.', G_CALM),
  recording('find-me', 'follow', 'Follow the heat and the dark. I will keep my furnace burning.',
    'Steady.', G_CALM),
  recording('find-me', 'find', '[whispers]Find me.',
    'As the opening film ends. Hushed.', G_HUSH),

  // === the robot (docs/story.md, "The robot"): what it sees, and says, from its hello on ============

  // --- a depth reached for the first time (every one down to the core; acts II and III a sketch) ---
  says('depth', { depth: 1 }, 'depth.1.sky', 'Down a well, and the sky is still up there! The pieces must hang one under the other.',
    'The robot, the first time the hero comes out at depth 1 (down the first well, after Gusto). Still sky islands.', WONDER),
  says('depth', { depth: 2 }, 'depth.2.voice', 'Every piece has a well, and every well goes down. I think that is where the voice in the glass comes from.',
    'Depth 2. The robot guesses the glassmaker\'s glass comes up from below.', BRIGHT),
  says('depth', { depth: 3 }, 'depth.3.counted', 'Three wells down! I counted. I am good at counting, when I remember to.',
    'Depth 3. Proud and a little forgetful.', CHATTY, { seed: { de: 7 } }),
  says('depth', { depth: 4 }, 'depth.4.warmer', 'It is warmer down here, or is that my core? Hard to tell.',
    'Depth 4. Puzzled about itself.', CHATTY),
  says('depth', { depth: 5 }, 'depth.5.further', 'The sky looks further away from here. Still blue, though.',
    'Depth 5. Looking up.', WONDER),
  says('depth', { depth: 6 }, 'depth.6.last', 'This is the last piece under the open sky, I think. After this, the light only comes through cracks.',
    'Depth 6, the last of the first act. Below it the second act\'s caves and hollows, where the light falls in through cracks.', SOFT),
  says('depth', { depth: 13 }, 'depth.13.dim', 'It is so dim down here. Good thing you brought me.',
    'Depth 13, the bottom of the second act. Half proud of its light, half nervous.', UNEASY),
  says('depth', { depth: 13 }, 'depth.13.wet', 'Something lives at the bottom of this piece. It sounds wet.',
    'Right after: it hears Slomo (a slime boss) somewhere ahead without knowing him.', UNEASY),
  // (act II, the sunlit hollows: caves, marshes and jungles, light through cracks)
  says('depth', { depth: 7 }, 'depth.7.lantern', 'No more open sky, only cracks of light. It is like being inside a lantern.',
    'Depth 7, the first of act II (Monteur waits here). The light falls in through cracks now.', WONDER),
  says('depth', { depth: 8 }, 'depth.8.hum', 'Do you hear that? The walls hum down here, as if something big is asleep.',
    'Depth 8.', UNEASY),
  says('depth', { depth: 9 }, 'depth.9.halfway', 'I think we are about halfway. Halfway to what, I do not know.',
    'Depth 9.', CHATTY),
  says('depth', { depth: 10 }, 'depth.10.counted', 'Ten wells down! I counted every one of them, I promise.',
    'Depth 10. Proud (it counted three before, at depth 3).', BRIGHT, { seed: { de: 1 } }),
  says('depth', { depth: 11 }, 'depth.11.warmer', 'The glassmaker\'s glass comes from below, I am sure of it now. It feels warmer, the deeper we go.',
    'Depth 11. It guesses where his glass comes from (it said so at depth 2).', SOFT),
  says('depth', { depth: 12 }, 'depth.12.brighter', 'It is getting darker. I will glow a little brighter, just for you.',
    'Depth 12, the last before the bottom of act II.', KIND),
  // (act III, the deep: no light but its own fires and crystals)
  says('depth', { depth: 14 }, 'depth.14.dark', 'It is really dark now, no cracks, no sky. Stay where my light is.',
    'Depth 14, the first of act III: from here on only the deep\'s own fires and crystals light it.', UNEASY),
  says('depth', { depth: 14 }, 'depth.14.braver', 'Good thing you have a lamp too. Two lights are braver than one.',
    'Right after. Warm.', KIND),
  says('depth', { depth: 15 }, 'depth.15.hearth', 'The rock is warm down here, like a hearth after the fire went out.',
    'Depth 15.', WONDER),
  says('depth', { depth: 16 }, 'depth.16.below', 'If you listen, you can hear something far below. Like breathing, or a furnace.',
    'Depth 16. Far below: the glassmaker\'s furnace at the core (it does not know).', SOFT),
  says('depth', { depth: 17 }, 'depth.17.fell', 'Everything down here fell from somewhere. I wonder if I did too.',
    'Depth 17. Musing about its past.', SOFT),
  says('depth', { depth: 18 }, 'depth.18.close', 'My gears are ticking faster. I think we are close to something.',
    'Depth 18.', UNEASY),
  says('depth', { depth: 19 }, 'depth.19.last', 'One more well, the very last one. I am not ready, but I am coming with you.',
    'Depth 19, the last before the core.', UNEASY),
  says('depth', { depth: 20 }, 'depth.20.bottom', 'This is it: the bottom of everything. The core.',
    'Depth 20, the core of the world. Hushed awe.', WONDER),
  says('depth', { depth: 20 }, 'depth.20.furnace', 'If the glassmaker is anywhere, he is here. Can you smell a furnace?',
    'Right after. Hopeful.', SOFT),

  // --- the first place of a theme (every theme; acts II and III a sketch) -------------------------
  says('theme', { theme: 'meadow' }, 'theme.meadow', 'Grass and flowers, all the way down! These pieces kept their summer.',
    'The meadow islands, below the town. Delighted.', WONDER),
  says('theme', { theme: 'clouds' }, 'theme.clouds', 'We are walking on clouds! Do not tell them, they might stop holding us.',
    'The cloud kingdom. Playful, whispering the second sentence a little.', CHATTY),
  says('theme', { theme: 'lagoon' }, 'theme.lagoon', 'Islands and blue water. Something small in there is watching us.',
    'The lagoon isles, where Squirtles live in the water.', WONDER),
  says('theme', { theme: 'karst' }, 'theme.karst', 'These rocks look like somebody poured them out and forgot to stop.',
    'The karst terraces: rock terraces like poured stone.', CHATTY),
  says('theme', { theme: 'peaks' }, 'theme.peaks', 'Snow! I cannot feel the cold, but my gears tick slower.',
    'The snowy peaks.', WONDER, { seed: { en: 2 } }),
  says('theme', { theme: 'highlands' }, 'theme.highlands', 'Prayer flags. Somebody up here hoped very hard for something.',
    'The prayer highlands, with flags and shrines. Soft.', SOFT),
  says('theme', { theme: 'badlands' }, 'theme.badlands', 'Everything here is the colour of rust. I hope it is not catching.',
    'The badlands, red and ochre rock. A joke about itself (it is glass and clockwork).', CHATTY),
  says('theme', { theme: 'saltflats' }, 'theme.saltflats', 'Salt, as far as I can see. I think this was a sea once, and the glass kept the salt.',
    'The salt flats.', WONDER),
  says('theme', { theme: 'canyon' }, 'theme.canyon', 'Red walls on both sides, and the sky is only a stripe up there.',
    'The deep canyon, walled in by sandstone: the last of the open sky.', WONDER),
  says('theme', { theme: 'darkforest' }, 'theme.darkforest', 'It is always night in this forest. Good thing I glow, so stay close.',
    'The dark forest, always at night. Brave, a little nervous.', UNEASY),
  says('theme', { theme: 'slime' }, 'theme.slime', 'Ugh, everything sticks. Do not step in the green, it does not let go.',
    'The slime marsh, the last theme of the second act. Disgusted, a little funny.', CHATTY),
  says('theme', { theme: 'roots' }, 'theme.roots', 'Roots, hanging from the ceiling! Something enormous is growing right above us.',
    'The root caves, the first theme of act II.', WONDER),
  says('theme', { theme: 'grotto' }, 'theme.grotto', 'A grotto full of water, and it glows. The light comes from under the water!',
    'The sunken grotto.', WONDER),
  says('theme', { theme: 'forge' }, 'theme.forge', 'Anvils and chimneys! Somebody worked brass here, like the smiths on... something. I forget.',
    'The dwarven forge, a works yard. A scrap of memory (the ark\'s smiths) slips away.', SOFT),
  says('theme', { theme: 'hive' }, 'theme.hive', 'Everything here is honey and wax. It smells sweet, and it is very, very sticky.',
    'The honey hive.', CHATTY),
  says('theme', { theme: 'swamp' }, 'theme.swamp', 'Mushrooms taller than you! Do not touch the green water, it bites.',
    'The fungal swamp, with its acid river.', TIP),
  says('theme', { theme: 'cenote' }, 'theme.cenote', 'A jungle, under the ground! And a round hole of sky, far up there.',
    'The jungle cenote.', WONDER),
  says('theme', { theme: 'frozen' }, 'theme.frozen', 'Ice caves, and frost on my feathers! Somebody used to scrape frost off feathers like these, I think.',
    'The frozen caves. A scrap of memory (the glassmaker scraping the ark\'s wings).', SOFT),
  says('theme', { theme: 'mines' }, 'theme.mines', 'Crystals as tall as doors! They catch my light and throw it everywhere.',
    'The crystal mines, the first theme of act III.', WONDER),
  says('theme', { theme: 'nests' }, 'theme.nests', 'Webs everywhere, big ones. I would like to go home now, please.',
    'The spider nests.', UNEASY),
  says('theme', { theme: 'ossuary' }, 'theme.ossuary', 'Bones, lots of old bones. They are very quiet, so let us be quiet too.',
    'The ossuary. Hushed, not scary.', SOFT),
  says('theme', { theme: 'ruins' }, 'theme.ruins', 'A whole town, buried down here. Somebody lived in these houses, a long time ago.',
    'The buried ruins.', SOFT),
  says('theme', { theme: 'volcanic' }, 'theme.volcanic', 'Lava, and it is so hot my glass tingles! Keep away from the glowing rock.',
    'The volcanic depths. Star-glass minds heat.', WARN),
  says('theme', { theme: 'abyss' }, 'theme.abyss', 'Black glass all around. It looks like the night sky fell down here and froze.',
    'The obsidian abyss, the last theme, round the core.', WONDER),

  // --- an enemy of a kind not met before comes after the hero: what it is, and a tip --------------
  says('foe', { species: 'snake' }, 'foe.snake', 'Snakes! They lunge when they bite, so step back when they rear up.',
    'The first snake that comes after the hero.', TIP),
  says('foe', { species: 'spider' }, 'foe.spider', 'Spiders, a whole bunch. Do not let them get round you.',
    'The first spiders (they come in packs and pounce).', WARN),
  says('foe', { species: 'stunder' }, 'foe.stunder', 'That big one hits hard. Wait for its swing, then hit back.',
    'The first Stunder, a heavy hitter.', TIP),
  says('foe', { species: 'wolk' }, 'foe.wolk', 'A little cloud with lightning! When the ground under you crackles, step off it.',
    'The first Wolk: its lightning strikes a crackling spot under its target and stuns.', TIP, { seed: { de: 1 } }),
  says('foe', { species: 'squirtle' }, 'foe.squirtle', 'Squirtles! They hide under the water and pop up to spit at you.',
    'The first Squirtle.', TIP),
  says('foe', { species: 'tornado' }, 'foe.tornado', 'A walking tornado! Its twisters throw you down, so step out of their way.',
    'The first Tornado: it sends twisters that lift and throw you.', TIP),
  says('foe', { species: 'flimmer' }, 'foe.flimmer', 'Those three flicker, and some blows go right through them. Hit them when they stop to punch.',
    'The first Flimmers, blurry, in threes: a blow may go through one while it shimmers; it comes into focus to punch.', TIP),
  says('foe', { species: 'shraps' }, 'foe.shraps', 'That one throws ice. If it hits you, you go cold and slow.',
    'The first Shraps: its ice ball chills.', TIP),
  says('foe', { species: 'triangle' }, 'foe.triangle', 'A triangle with a temper! Its punches knock you over.',
    'The first Triangle, a strong one.', UNEASY),
  says('foe', { species: 'wolla' }, 'foe.wolla', 'A Wolla! Its storm blows you back, so step out of it sideways.',
    'The first Wolla: a gust from its mouth, dodged by stepping out of the cone.', TIP),
  says('foe', { species: 'octonaut' }, 'foe.octonaut', 'Arms everywhere! When it spins, back off.',
    'The first Octonaut: its spin kicks you over.', WARN),
  says('foe', { species: 'mecked' }, 'foe.mecked', 'Big ears, big teeth. Do not let it grab you.',
    'The first Mecked: it grabs and bites.', WARN),
  says('foe', { species: 'moose' }, 'foe.moose', 'A whole herd of Moose! When one lowers its head, jump aside. And watch out for that tail!',
    'The first Moose, in a herd: it charges with its head lowered (sidestep it), and clubs whoever stands behind it with its tail.', WARN),
  says('foe', { species: 'fireface' }, 'foe.fireface', 'A face made of fire! Its fireballs keep burning for a while.',
    'The first Fire-face (in the dark forest a Lantern-face): its fireball sets you on fire.', WARN),
  says('foe', { species: 'firecat' }, 'foe.firecat', 'A cat made of fire! It runs in and pounces, so keep moving.',
    'The first Fire-cat: it runs in fast and pounces.', WARN),
  says('foe', { species: 'slug' }, 'foe.slug', 'A slug that spits! The slime slows you down.',
    'The first Slug, in the slime marsh.', TIP),
  says('foe', { species: 'bolime' }, 'foe.bolime', 'Careful, that blob swallows things! If it gets you, walk and jump until you are out.',
    'The first Bolime: it leaps on you and swallows you; walking and jumping breaks out.', WARN),
  says('foe', { species: 'spicy' }, 'foe.spicy', 'A pepper with a laser! Step aside when it aims.',
    'The first Spicy: a laser that follows you, dodged by sidestepping.', TIP),

  // --- a boss's arena, the boss still there: what it sees, and the one thing to remember ----------
  says('arena', { boss: 'gusto' }, 'arena.gusto.teeth', 'Oh. Oh no. That one has a lot of teeth.',
    'Gusto\'s arena, the first boss: a big floating head with jagged teeth, long clawed arms and tentacles.', UNEASY),
  says('arena', { boss: 'gusto' }, 'arena.gusto.arms', 'When it throws its arms wide, step back. If it grabs nothing, it falls flat on its face!',
    'Gusto\'s tell: arms flung wide before a grab; a grab that misses lays him on his face (hit him then).', TIP),
  says('arena', { boss: 'totnar' }, 'arena.totnar.sticks', 'A big ball of sticks, with skulls on top. And somebody lit fires all round the edge.',
    'Totnar\'s arena: a tumbleweed with three skulls; braziers burn round its edge.', WONDER),
  says('arena', { boss: 'totnar' }, 'arena.totnar.dark', 'I think he likes the dark. If it goes dark, I will glow as bright as I can.',
    'Totnar makes it night again and again in his fight.', UNEASY),
  says('arena', { boss: 'squarlo' }, 'arena.squarlo.small', 'That little fellow? He is smaller than you!',
    'Squarlo\'s arena: he is tiny (until he grows into a giant).', CHATTY),
  says('arena', { boss: 'squarlo' }, 'arena.squarlo.hills', 'Shells on the ground, and hills everywhere: this place floods. Remember the hills.',
    'His tidal hills: when he calls the tide the flats drown and the hilltops stay dry.', TIP),
  says('arena', { boss: 'flip' }, 'arena.flip.box', 'It is a box. We are in a box!',
    'Flip\'s arena: a great box he turns any side down.', WONDER),
  says('arena', { boss: 'flip' }, 'arena.flip.rings', 'Rings of light. I think he turns things upside down, so mind the floor, wherever it ends up.',
    'Flip, three rings of rings: after he turns the box, holes in the new floor break open.', TIP),
  says('arena', { boss: 'foggery' }, 'arena.foggery.hot', 'Lava all round, and a tower in the middle. Whoever lives here likes it hot.',
    'Foggery\'s caldera: lava round a tower, a bridge to it.', WONDER),
  says('arena', { boss: 'foggery' }, 'arena.foggery.climb', 'If the lava rises, climb. Do not stop to look at the view!',
    'The lava rises once the fight starts: up the tower\'s ramp.', TIP),
  says('arena', { boss: 'renew' }, 'arena.renew.hood', 'That one looks a bit like you. In a hood.',
    'Renew\'s arena: a hero like the player, tinted blue grey, in a hood.', UNEASY, { seed: { en: 2 } }),
  says('arena', { boss: 'renew' }, 'arena.renew.ticking', 'Something here ticks louder than I do. Be careful with time in this place.',
    'Renew turns time back at the end of each of his bars.', SOFT),
  says('arena', { boss: 'mansk' }, 'arena.mansk.museum', 'A museum! Paintings, a stage, and a mask that is looking at us.',
    'Mansk\'s arena, a museum hall with a stage; he is a floating mask.', WONDER),
  says('arena', { boss: 'mansk' }, 'arena.mansk.hollow', 'There is nobody behind it. It is hollow, so do not let it breathe you in.',
    'Mansk breathes players in and chews them.', TIP),
  says('arena', { boss: 'slomo' }, 'arena.slomo.night', 'It is night here, and everything is slime. Everything!',
    'Slomo\'s slime bowl, always at night.', CHATTY),
  says('arena', { boss: 'slomo' }, 'arena.slomo.mounds', 'Slime is slow to wade through. Keep to the mounds when you can.',
    'His flood of slime slows; the mounds stay dry.', TIP),
  says('arena', { boss: 'monteur' }, 'arena.monteur.stone', 'A moose, made of stone! And stones float between its antlers.',
    'Monteur\'s arena, the first boss of act II: a stone moose with stones floating between his antlers.', WONDER, { seed: { de: 3 } }),
  says('arena', { boss: 'monteur' }, 'arena.monteur.wall', 'When he lowers his head, jump aside. If he runs into a wall, he gets dizzy!',
    'His charge: sidestep it; one that hits a wall leaves him dazed, every blow double.', TIP),
  says('arena', { boss: 'sollmeldon' }, 'arena.sollmeldon.heads', 'Three heads! And all of him is mud. Black, sticky mud.',
    'Sollmeldon\'s mire, in the middle of act II: a dinosaur of black mud with three heads.', WONDER),
  says('arena', { boss: 'sollmeldon' }, 'arena.sollmeldon.uphill', 'If the ground tips, get up high. The mud runs downhill, and there it gets deep.',
    'His landings tip the world; his mud runs to the low side, deep there.', TIP),
  says('arena', { boss: 'qualmos' }, 'arena.qualmos.grin', 'So many tentacles, and it is grinning at us. This is the bottom of everything, and it lives here.',
    'Qualmos\'s arena at the core: a blue-green amphibian on six tentacles, grinning. For now the boss at the core (docs/story.md).', UNEASY),
  says('arena', { boss: 'qualmos' }, 'arena.qualmos.tricks', 'It gets angrier every time it is hurt, and learns a new trick. Be ready for anything!',
    'Qualmos has five phases, each with new attacks.', TIP),

  // --- in a boss's fight: its start, an attack as it starts, a stage changing (short: it is quick) -
  says('boss', { boss: 'gusto', what: 'summon' }, 'boss.gusto.summon', 'Little triangles! Mind your back.',
    'Gusto spits Custo triangles out of his mouth.', WARN),
  says('boss', { boss: 'gusto', what: 'inhale' }, 'boss.gusto.inhale', 'It is breathing in! Step sideways, out of its breath!',
    'Gusto sucks in a player who keeps away: stepping out sideways escapes.', WARN),
  says('boss', { boss: 'gusto', what: 'stuck' }, 'boss.gusto.stuck', 'Ha, flat on its face! Now, quick!',
    'A grab that missed: Gusto face-plants and takes double damage for a moment.', CHEER),
  says('boss', { boss: 'gusto', what: 'split' }, 'boss.gusto.split', 'There are three of it now! Only one is real, the others pop at a touch.',
    'At half health Gusto splits into three; two are fakes that burst at any hit.', WARN),
  says('boss', { boss: 'gusto', what: 'vortex' }, 'boss.gusto.vortex', 'Wind! Get out of its way!',
    'Gusto blows a vortex through his hands.', WARN, { seed: { de: 1 } }),

  says('boss', { boss: 'totnar', what: 'throw' }, 'boss.totnar.throw', 'Skulls! And they bite when they land!',
    'Totnar throws a skull; where it lands it comes alive as a snapping skull.', WARN),
  says('boss', { boss: 'totnar', what: 'gloom' }, 'boss.totnar.gloom', 'It is getting dark. Stay close to me.',
    'Totnar makes it night.', UNEASY),
  says('boss', { boss: 'totnar', what: 'split', stage: 2 }, 'boss.totnar.skull', 'A skull came off! Look, you can see his heart.',
    'Totnar loses his first skull and a shell of sticks: his burning heart shows. Next he rolls.', BRIGHT),
  says('boss', { boss: 'totnar', what: 'roll' }, 'boss.totnar.roll', 'He is rolling! Get out of the way, then hit him while he is dizzy.',
    'Totnar rolls at the player; at the end he sits dizzy.', TIP),
  says('boss', { boss: 'totnar', what: 'spiders' }, 'boss.totnar.spiders', 'Twig spiders! So many legs.',
    'Totnar tears himself open and twig spiders pour out.', UNEASY),
  says('boss', { boss: 'totnar', what: 'split', stage: 3 }, 'boss.totnar.last', 'Only one skull left, and he is angry. Watch the ground for rings.',
    'Totnar\'s last stage: lightning strikes where rings show on the floor.', WARN),
  says('boss', { boss: 'totnar', what: 'storm' }, 'boss.totnar.storm', 'Clouds over you! Step out of the rings!',
    'Totnar\'s storm.', WARN),

  says('boss', { boss: 'squarlo', what: 'blow' }, 'boss.squarlo.blow', 'A jet of water! Step out of the way.',
    'Squarlo\'s jet.', WARN),
  says('boss', { boss: 'squarlo', what: 'summon' }, 'boss.squarlo.summon', 'Squirtles, out of the water!',
    'Squarlo slaps the floor and Squirtles pop out of his water.', WARN),
  says('boss', { boss: 'squarlo', what: 'tide' }, 'boss.squarlo.tide', 'He is calling the tide! Up a hill, quick!',
    'Squarlo wiggles and the water rises: the hilltops stay dry.', WARN),
  says('boss', { boss: 'squarlo', what: 'rest' }, 'boss.squarlo.rest', 'He is out of breath! Now is your chance!',
    'Squarlo sits down to catch his breath: blows do more.', CHEER),
  says('boss', { boss: 'squarlo', what: 'split' }, 'boss.squarlo.grow', 'He is growing. He is growing a lot!',
    'At half health Squarlo grows into a giant six cells tall.', UNEASY),
  says('boss', { boss: 'squarlo', what: 'stomp' }, 'boss.squarlo.stomp', 'Watch the shadow of his foot! When it gets stuck, hit it.',
    'The giant stomps where his foot\'s shadow lies; then it sticks and blows do more.', TIP),
  says('boss', { boss: 'squarlo', what: 'jump' }, 'boss.squarlo.jump', 'He is jumping! Keep running, his shadow is slower than you.',
    'The giant jumps onto his shadow, which follows the player slower than they run.', TIP, { seed: { de: 2 } }),
  says('boss', { boss: 'squarlo', what: 'cannon' }, 'boss.squarlo.cannon', 'Water cannon! Right up close, it cannot reach you.',
    'The giant\'s water cannon blasts the floor from a little ahead of him outwards.', TIP),

  says('boss', { boss: 'flip', what: 'throw' }, 'boss.flip.throw', 'A ball of light! Dodge it!',
    'Flip throws a ball of light.', WARN),
  says('boss', { boss: 'flip', what: 'summon' }, 'boss.flip.summon', 'Wollas, out of his rings!',
    'Flip calls Sky wollas.', WARN),
  says('boss', { boss: 'flip', what: 'flip' }, 'boss.flip.turn', 'Hold on! The whole world is turning!',
    'Flip turns his box: another side comes down.', WARN),
  says('boss', { boss: 'flip', what: 'flip' }, 'boss.flip.holes', 'After a turn, the holes in the floor crack open. Step off them, quick!',
    'The second turn: the holes of the side that comes down burst open soon after; who stands on one falls out.', TIP),
  says('boss', { boss: 'flip', what: 'split' }, 'boss.flip.spin', 'His rings are spinning so fast! Something is about to change.',
    'At half health Flip spins up; then black holes.', UNEASY),
  says('boss', { boss: 'flip', what: 'hole' }, 'boss.flip.hole', 'A black hole! Run away from it, it pulls!',
    'Flip opens black holes that pull the player in.', WARN),
  says('boss', { boss: 'flip', what: 'volley' }, 'boss.flip.volley', 'Three balls at once now!',
    'Flip\'s volley in his second phase.', WARN),

  says('boss', { boss: 'foggery', what: 'start' }, 'boss.foggery.rising', 'The lava is rising! Up the tower, go, go!',
    'Foggery wakes and the lava starts rising: up the ramp round the tower.', WARN),
  says('boss', { boss: 'foggery', what: ['eyeL', 'eyeR'] }, 'boss.foggery.eye', 'Did he just throw his eye at us?',
    'Foggery plucks out one of his eyes and throws it (it grows back).', WONDER),
  says('boss', { boss: 'foggery', what: 'summon' }, 'boss.foggery.faces', 'Fire-faces, out of his mouth. Of course.',
    'Foggery croaks and Fire-faces come out of his mouth. A little sarcastic.', CHATTY, { seed: { de: 2 } }),
  says('boss', { boss: 'foggery', what: 'split', stage: 1 }, 'boss.foggery.curl', 'He is curling up into a ball...',
    'At a third of his health on top of the tower, the frog turns into a burning ball.', UNEASY),
  says('boss', { boss: 'foggery', what: 'cats' }, 'boss.foggery.cats', 'Cats! His shield holds while they live, so beat the cats first.',
    'Foggery\'s fire-cats: his shield holds while one lives.', TIP),
  says('boss', { boss: 'foggery', what: 'geyser' }, 'boss.foggery.geyser', 'Cracks under you! Move before they burst!',
    'Rings of glowing cracks open under the player: fire bursts out.', WARN),
  says('boss', { boss: 'foggery', what: 'split', stage: 2 }, 'boss.foggery.platforms', 'The lava is over the tower! Jump onto the platforms!',
    'The lava floods the top of the tower: the sliding platforms are the only ground.', WARN),

  says('boss', { boss: 'renew', what: 'start' }, 'boss.renew.like-you', 'He fights like you do! He even rolls away like you.',
    'Renew fights like a player: chained blows, a lunge, a roll out of the way.', WONDER),
  says('boss', { boss: 'renew', what: 'split', stage: 1 }, 'boss.renew.backwards', 'Wait, wait! Time is running backwards!',
    'Renew\'s first bar is gone: he turns back time to the start of the phase.', WARN),
  says('boss', { boss: 'renew', what: 'shoot' }, 'boss.renew.bow', 'He has a bow now. Step aside while he draws!',
    'Renew\'s second phase: the bow.', TIP),
  says('boss', { boss: 'renew', what: 'summon' }, 'boss.renew.spiders', 'Spiders, falling out of the sky!',
    'Renew casts spiders out of the sky.', WARN),
  says('boss', { boss: 'renew', what: 'split', stage: 2 }, 'boss.renew.echo', 'Again! And the pale one is you. Do not stand where you stood before!',
    'The second rewind: the hero\'s past self (an echo) does again what it did, and its blows hurt.', TIP),
  says('boss', { boss: 'renew', what: 'split', stage: 3 }, 'boss.renew.echoes', 'Your echoes are piling up. Keep moving!',
    'The third rewind: more echoes.', WARN),
  says('boss', { boss: 'renew', what: 'split', stage: 4 }, 'boss.renew.out', 'He is out of time! I think.',
    'Renew\'s last bar gone: "One more time..." is all he had.', BRIGHT),

  says('boss', { boss: 'mansk', what: 'inhale' }, 'boss.mansk.inhale', 'He is breathing in! Step to the side, out of his mouth\'s way!',
    'Mansk breathes in: stepping out of the cone to a side escapes at once.', WARN),
  says('boss', { boss: 'mansk', what: 'spit' }, 'boss.mansk.spit', 'Ew. He spat you out. Are you sticky?',
    'Mansk swallowed the hero, chewed and spat them out. Disgusted and sympathetic.', CHATTY, { seed: { de: 1 } }),
  says('boss', { boss: 'mansk', what: 'orbs' }, 'boss.mansk.orbs', 'Balls of light! They burst where the rings are, so get out of the rings.',
    'Mansk\'s balls of light burst where rings show on the floor.', TIP),
  says('boss', { boss: 'mansk', what: 'summon' }, 'boss.mansk.tornados', 'Tornados, dancing round him.',
    'Mansk calls Tornados.', WONDER, { seed: { de: 3 } }),
  says('boss', { boss: 'mansk', what: 'split', stage: 1 }, 'boss.mansk.flying', 'He is flying! Up there, only a bow or a staff can reach him.',
    'Mansk rises into the air: a blade does not reach him up there.', TIP),
  says('boss', { boss: 'mansk', what: 'slow' }, 'boss.mansk.slow', 'Everything is slow... even my gears...',
    'Mansk slows time for the players. Said a little slowly.', 'Speak slowly and dreamily, like a child getting sleepy.'),
  says('boss', { boss: 'mansk', what: 'split', stage: 2 }, 'boss.mansk.horns', 'His horns broke! Ribbons... careful, they grab.',
    'Mansk\'s horns break and red ribbons grow out of the stumps.', WARN),
  says('boss', { boss: 'mansk', what: 'lash' }, 'boss.mansk.lash', 'Do not get tangled in his ribbons!',
    'Mansk lashes his ribbons at the player.', WARN),
  says('boss', { boss: 'mansk', what: 'whirl' }, 'boss.mansk.whirl', 'He is spinning! Get away from him!',
    'Mansk whirls round, his ribbons knocking down who is close.', WARN),

  says('boss', { boss: 'slomo', what: ['armL', 'armR'] }, 'boss.slomo.arm', 'He threw a slug! It wants to sit on your head!',
    'Slomo throws the slug on the end of his arm; it crawls after the hero and latches on to their head.', WARN),
  says('boss', { boss: 'slomo', what: 'meteor' }, 'boss.slomo.meteor', 'Do not look up, look down: watch for the shadows!',
    'Slomo spits gloop into the sky; slime meteorites come down where shadows grow.', TIP),
  says('boss', { boss: 'slomo', what: 'flood' }, 'boss.slomo.flood', 'Slime coming in! Up on a mound!',
    'Slomo floods the bowl with slime from one side.', WARN),
  says('boss', { boss: 'slomo', what: 'split', stage: 1 }, 'boss.slomo.burst', 'The blob burst! It was a slug the whole time.',
    'The blob bursts and the slug turns round.', WONDER),
  says('boss', { boss: 'slomo', what: 'spit' }, 'boss.slomo.spit', 'Slime balls! They slow you down.',
    'Slomo spits three balls of slime.', WARN, { seed: { en: 3 } }),
  says('boss', { boss: 'slomo', what: 'summon' }, 'boss.slomo.slimes', 'More slime. He is making friends.',
    'Slime slugs and bolimes plop out of his back. Dry.', CHATTY),

  says('boss', { boss: 'monteur', what: 'throw' }, 'boss.monteur.throw', 'He throws the stones from his antlers! Keep moving.',
    'Monteur throws one of his floating stones.', WARN),
  says('boss', { boss: 'monteur', what: 'charge' }, 'boss.monteur.charge', 'Head down, here he comes! Jump out of the way!',
    'His charge (as the sun, he rolls).', WARN),
  says('boss', { boss: 'monteur', what: 'stuck' }, 'boss.monteur.stuck', 'He crashed! Hit him now, it hurts him double!',
    'His charge ran into something: dazed, every blow double.', CHEER, { seed: { en: 3 } }),
  says('boss', { boss: 'monteur', what: 'summon' }, 'boss.monteur.summon', 'Moose, coming up out of the floor!',
    'Monteur stomps and Moose come up round him.', WARN),
  says('boss', { boss: 'monteur', what: 'split', stage: 1 }, 'boss.monteur.sun', 'He is crumbling... into a sun made of stone?',
    'At half health the moose crumbles into a sun of stone.', UNEASY),
  says('boss', { boss: 'monteur', what: 'rain' }, 'boss.monteur.rain', 'Stones from the sky! Watch for their shadows!',
    'The sun throws stones up; they come down where shadows grow.', WARN),
  says('boss', { boss: 'monteur', what: 'spin' }, 'boss.monteur.spin', 'The world is turning! Do not worry, the floor stays under your feet.',
    'The sun turns the world; gravity stays with the floor.', TIP),
  says('boss', { boss: 'monteur', what: 'mountain' }, 'boss.monteur.mountain', 'The floor is cracking! Hold on, a mountain is coming up!',
    'The sun pulls a mountain out of the floor; whoever stands on it rides up.', WARN),

  says('boss', { boss: 'sollmeldon', what: ['biteL', 'biteM', 'biteR'] }, 'boss.sollmeldon.bite', 'A head is coming! The one that pulls back is the one that bites.',
    'One of Sollmeldon\'s heads draws back and lunges to bite.', WARN, { seed: { de: 2 } }),
  says('boss', { boss: 'sollmeldon', what: 'spit' }, 'boss.sollmeldon.spit', 'Mud balls! They stay where they land, so mind your feet.',
    'Every head spits a ball of mud; it leaves a puddle that slows.', WARN),
  says('boss', { boss: 'sollmeldon', what: 'rain' }, 'boss.sollmeldon.rain', 'He is flying! And dropping mud on us from up there!',
    'Up in the air he rains mud.', WARN),
  says('boss', { boss: 'sollmeldon', what: 'summon' }, 'boss.sollmeldon.squirtles', 'Something is crawling out of the mud!',
    'Mud squirtles come up out of his mud.', UNEASY),
  says('boss', { boss: 'sollmeldon', what: 'split', stage: 1 }, 'boss.sollmeldon.two', 'His head came off! Only two left.',
    'A head is cut off at two thirds of his health.', CHEER),
  says('boss', { boss: 'sollmeldon', what: 'split', stage: 2 }, 'boss.sollmeldon.one', 'Another one! Just one head now, and it is angry.',
    'The second head comes off; the last bites faster.', WARN),
  says('boss', { boss: 'sollmeldon', what: 'tilt' }, 'boss.sollmeldon.tilt', 'The whole world is tipping! Run uphill, away from the mud!',
    'He landed and the world tips towards him; his mud runs to the low side.', WARN),

  says('boss', { boss: 'qualmos', what: 'grab' }, 'boss.qualmos.grab', 'An arm! Step back before it grabs you!',
    'Qualmos reaches out to grab.', WARN),
  says('boss', { boss: 'qualmos', what: 'rage' }, 'boss.qualmos.rage', 'It is furious! Stay back until it calms down.',
    'Qualmos rages between his phases; nothing hurts him meanwhile.', WARN),
  says('boss', { boss: 'qualmos', what: 'waterJet' }, 'boss.qualmos.jet', 'A jet of water! Step out of it sideways.',
    'His jet pushes you away.', TIP),
  says('boss', { boss: 'qualmos', what: 'dive' }, 'boss.qualmos.dive', 'It is leaping at you! Move!',
    'His dive.', WARN),
  says('boss', { boss: 'qualmos', what: 'inkBurst' }, 'boss.qualmos.ink', 'Ink! It slows you down, so keep out of its way.',
    'His ink slows.', TIP, { seed: { de: 3 } }),
  says('boss', { boss: 'qualmos', what: 'tailSpin' }, 'boss.qualmos.spin', 'All its tentacles at once! Get away from it!',
    'His tentacles sweep all round him.', WARN, { seed: { en: 3 } }),
  says('boss', { boss: 'qualmos', what: 'undertow' }, 'boss.qualmos.pull', 'It is pulling you in! Run the other way, hard!',
    'His undertow pulls you towards him.', WARN),
  says('boss', { boss: 'qualmos', what: 'spikeVolley' }, 'boss.qualmos.spines', 'Spines, three at once! Step between them!',
    'Three spines fanned out.', TIP, { seed: { de: 1 } }),
  says('boss', { boss: 'qualmos', what: 'tidalSurge' }, 'boss.qualmos.wave', 'A big wave! It will shove you, so brace yourself.',
    'A wide wave that shoves.', WARN),
  says('boss', { boss: 'qualmos', what: 'bellyFlop' }, 'boss.qualmos.flop', 'It is puffing up! Get out from under it, then hit it while it lies there!',
    'Blown up, he flops onto you; then he lies there a moment, exposed.', TIP, { seed: { en: 3 } }),

  // --- a boss beaten: a cheer, and a scrap of what it remembers coming back --------------------
  says('beaten', { boss: 'gusto' }, 'beaten.gusto.open', 'We did it! The well is open!',
    'Gusto beaten, the first boss. Cheering.', CHEER),
  says('beaten', { boss: 'gusto' }, 'beaten.gusto.before', 'I think I have followed somebody down a well before. I cannot remember who.',
    'A scrap of memory: the robot\'s past is lost to it. Puzzled, wistful.', SOFT),
  says('beaten', { boss: 'totnar' }, 'beaten.totnar.light', 'The light is back! I did not like that one.',
    'Totnar beaten: the light comes back for good.', CHEER),
  says('beaten', { boss: 'totnar' }, 'beaten.totnar.tower', 'A tower with no roof... I remember a tower with no roof. Then it is gone again.',
    'A scrap of memory: the star-readers\' tower (one of the glassmaker\'s recordings tells of it).', SOFT),
  says('beaten', { boss: 'squarlo' }, 'beaten.squarlo.drain', 'The water is draining away. You can stop holding your breath.',
    'Squarlo beaten: his water drains.', CHEER),
  says('beaten', { boss: 'squarlo' }, 'beaten.squarlo.tide', 'Water inside glass, with a tide... I have seen that before. From high above.',
    'A scrap of memory: the piece of the sea, seen from the ark.', SOFT),
  says('beaten', { boss: 'flip' }, 'beaten.flip.right-way', 'The world is the right way up again! I think. Is it?',
    'Flip beaten: his box turns the right way up.', CHEER),
  says('beaten', { boss: 'flip' }, 'beaten.flip.lines', 'I used to fly between things that hung in the sky. Lots of them, on lines of light.',
    'A scrap of memory: the pieces under the ark (the robot was one of the star-readers\' clockworks: never said).', SOFT),
  says('beaten', { boss: 'foggery' }, 'beaten.foggery.drain', 'The lava is draining away. My glass was getting nervous.',
    'Foggery beaten. Star-glass minds heat.', CHEER),
  says('beaten', { boss: 'foggery' }, 'beaten.foggery.furnace', 'There was a furnace once, a small one, and someone very quick with hot glass. Was that my glass?',
    'A scrap of memory: the glassmaker at his furnace on the ark, mending glass. Puzzled.', SOFT),
  says('beaten', { boss: 'renew' }, 'beaten.renew.sky', 'He went up into the sky. I hope he finds more time up there.',
    'Renew beaten: he rose away into the sky, out of time. Kind.', KIND),
  says('beaten', { boss: 'renew' }, 'beaten.renew.name', 'If I could turn time back, only a little, I would go and find my name.',
    'Wistful: it lost its name.', SOFT),
  says('beaten', { boss: 'mansk' }, 'beaten.mansk.nobody', 'The mask fell over. There really was nobody inside.',
    'Mansk beaten: he falls flat like a mask dropped.', CHATTY),
  says('beaten', { boss: 'mansk' }, 'beaten.mansk.cloth', 'There was a cloth over something once, something that watched. I was told not to look.',
    'A scrap of memory: the creature under its cloth on the ark (the glassmaker\'s recordings tell of it). Uneasy.', SOFT),
  says('beaten', { boss: 'slomo' }, 'beaten.slomo.sticky', 'Is it over? It is over! I am all sticky.',
    'Slomo beaten, the bottom of the second act.', CHEER),
  says('beaten', { boss: 'slomo' }, 'beaten.slomo.dark', 'That was the bottom of something, I can feel it in my gears. From here on, it gets dark for real.',
    'Below lies the third act: the deep, only its own fires and crystals for light.', SOFT),
  says('beaten', { boss: 'monteur' }, 'beaten.monteur.out', 'The stone sun went out! We did it!',
    'Monteur beaten, the first boss of act II.', CHEER),
  says('beaten', { boss: 'monteur' }, 'beaten.monteur.hatch', 'I remember a hatch, open just a crack, and starlight falling through. And something very still, watching it.',
    'A scrap of memory: the hatch the glassmaker opened for the creature (his recordings of depth 9 tell of it). Wistful.', SOFT, { seed: { de: 1 } }),
  says('beaten', { boss: 'sollmeldon' }, 'beaten.sollmeldon.puddle', 'He melted! Just a puddle now. A very big puddle.',
    'Sollmeldon beaten: he melts into his mud.', CHEER),
  says('beaten', { boss: 'sollmeldon' }, 'beaten.sollmeldon.gears', 'I will never get this mud out of my gears.',
    'Grumbling, playful.', CHATTY),
  says('beaten', { boss: 'qualmos' }, 'beaten.qualmos.beat', 'We beat it! The thing at the bottom of the world!',
    'Qualmos beaten, at the core (for now he ends nothing: docs/story.md).', CHEER),
  says('beaten', { boss: 'qualmos' }, 'beaten.qualmos.where', 'But where is the glassmaker? I was so sure he would be here.',
    'The glassmaker is not found yet: the ending is still to come. Puzzled, sad.', SOFT),

  // --- the hero died (said once they are back where they came into the cube) -------------------
  // the boss whose arena it was first (a tip), then the depth's, then any; a world picks its order
  says('death', { boss: 'gusto' }, 'death.gusto.arms', 'Its arms! Wide arms mean it is about to grab. Step back then.',
    'The hero died fighting Gusto. A tip.', KIND),
  says('death', { boss: 'gusto' }, 'death.gusto.fakes', 'Only one of it is real. The fakes pop at the smallest touch.',
    'Died to Gusto again: find the real one among the three.', TIP),
  says('death', { boss: 'totnar' }, 'death.totnar.roll', 'When he rolls, get out of the way, and hit him while he is dizzy.',
    'Died fighting Totnar.', KIND),
  says('death', { boss: 'totnar' }, 'death.totnar.fires', 'In the dark, stay near the fires. They show you the way.',
    'Died to Totnar again: braziers burn round his arena.', TIP),
  says('death', { boss: 'squarlo' }, 'death.squarlo.hill', 'When he calls the tide, run for a hill before the water comes.',
    'Died fighting Squarlo.', KIND),
  says('death', { boss: 'squarlo' }, 'death.squarlo.rest', 'When he sits down out of breath, that is your moment.',
    'Died to Squarlo again.', TIP),
  says('death', { boss: 'flip' }, 'death.flip.holes', 'After the world turns, step off the holes in the floor, quick.',
    'Died fighting Flip.', KIND),
  says('death', { boss: 'flip' }, 'death.flip.early', 'Run from a black hole early, before it pulls too hard.',
    'Died to Flip again.', TIP),
  says('death', { boss: 'foggery' }, 'death.foggery.climb', 'Keep climbing while the lava rises. Do not stop for the fire-faces.',
    'Died fighting Foggery.', KIND),
  says('death', { boss: 'foggery' }, 'death.foggery.cats', 'His shield only breaks once both cats are beaten. Cats first!',
    'Died to Foggery again.', TIP),
  says('death', { boss: 'renew' }, 'death.renew.echo', 'That was your own echo. Remember where you stood, and stand somewhere else.',
    'Died fighting Renew, whose rewinds make the hero\'s past self strike again.', KIND),
  says('death', { boss: 'renew' }, 'death.renew.arrows', 'When he draws his bow, step aside. His arrows are slower than yours.',
    'Died to Renew again.', TIP),
  says('death', { boss: 'mansk' }, 'death.mansk.side', 'When he breathes in, step to the side, not back. Sideways gets you out at once.',
    'Died fighting Mansk.', KIND),
  says('death', { boss: 'mansk' }, 'death.mansk.whirl', 'When he whirls his ribbons, get far away from him.',
    'Died to Mansk again.', TIP),
  says('death', { boss: 'slomo' }, 'death.slomo.mound', 'When the slime floods in, get onto a mound. Wading is too slow.',
    'Died fighting Slomo.', TIP),
  says('death', { boss: 'monteur' }, 'death.monteur.wall', 'Let him charge into a wall. Then he is dazed, and every hit counts double.',
    'The hero died fighting Monteur. A tip.', KIND),
  says('death', { boss: 'monteur' }, 'death.monteur.mountain', 'When the floor cracks, a mountain is coming. Ride it up with him, or keep well away.',
    'Died to Monteur again: his mountains.', TIP),
  says('death', { boss: 'sollmeldon' }, 'death.sollmeldon.uphill', 'When he lands, the world tips. Go uphill before the mud gets there.',
    'The hero died fighting Sollmeldon. A tip.', KIND),
  says('death', { boss: 'sollmeldon' }, 'death.sollmeldon.heads', 'Watch his heads. The one that pulls back bites next, and never the same one twice.',
    'Died to Sollmeldon again: his bites.', TIP),
  says('death', { boss: 'qualmos' }, 'death.qualmos.flop', 'When it puffs up, run. After its belly flop it lies still a moment, and that is your chance.',
    'Died fighting Qualmos.', KIND),
  says('death', { boss: 'qualmos' }, 'death.qualmos.pull', 'When it pulls you in, run away at once. The longer you wait, the harder it pulls.',
    'Died to Qualmos again.', TIP),
  says('death', { depth: 13 }, 'death.13.together', 'It is dark and sticky down here. Let us be careful together.',
    'Died at depth 13. Gentle.', KIND),
  says('death', { depth: [7, 12] }, 'death.caves.find', 'Up you get. Even down in the caves, I will always find you.',
    'Died in act II. Gentle.', KIND),
  says('death', { depth: [14, 20] }, 'death.deep.scared', 'You scared me. It is far too dark down here to lose you.',
    'Died in act III, the deep. Shaken.', UNEASY),
  says('death', null, 'death.carried', 'Up you get! I carried you back to where we came in, and you are heavier than you look.',
    'The first time the hero dies with the robot about: it brings them back to where they came into the cube (docs/story.md, "The robot").', KIND, { lead: true }),
  says('death', null, 'death.hurt', 'That looked like it hurt. Shall we try again, a bit more carefully?',
    'The hero died.', KIND),
  says('death', null, 'death.find', 'I found you. I will always find you, that is what I am for, I think.',
    'The hero died. A small promise.', KIND),
  says('death', null, 'death.back', 'Everything we beat in there is back, I am sorry. It is like the glass remembers.',
    'Dying puts the cube back as it was when the hero came in.', SOFT),
  says('death', null, 'death.cold', 'My core went all cold. Please do not do that too often.',
    'The hero died. A little shaken.', UNEASY),
  says('death', null, 'death.potion', 'You could drink a potion before it gets that bad. Just an idea.',
    'A tip: health potions.', TIP),
  says('death', null, 'death.again', 'Again! But this time, maybe not all of them at once?',
    'Cheerful about it.', BRIGHT),
  says('death', null, 'death.polished', 'I polished you up a little: good as new, almost.',
    'Joking.', CHATTY),
  says('death', null, 'death.glassmaker', 'You fall down, and you get up. The glassmaker would like you, I think.',
    'Kind.', KIND),
  says('death', null, 'death.crack', 'Do not be sad. Even star-glass cracks, and it still holds.',
    'Comforting (the glassmaker says the same of his glass).', KIND, { seed: { de: 1 } }),

  // --- low health, a long fight, enemies beaten ---------------------------------------------------
  says('hurt', null, 'hurt.drink', 'You are hurt! Drink something, quick!',
    'The hero\'s health is low.', WARN),
  says('hurt', null, 'hurt.back-off', 'Careful! Back off a moment and catch your breath.',
    'The hero\'s health is low.', WARN),
  says('hurt', null, 'hurt.terrible', 'You look terrible! I mean, still brave, but terrible.',
    'The hero\'s health is low. Worried, then a little funny.', UNEASY),
  says('hurt', null, 'hurt.light', 'You are nearly out of health! I would help, but all I have is light.',
    'The hero\'s health is low. Sorry it cannot fight.', UNEASY),
  says('hurt', null, 'hurt.reach', 'Not so close! Fight from where they cannot all reach you.',
    'A tip when health is low.', TIP),
  says('fight', null, 'fight.left', 'Left! No, your other left!',
    'Now and then in a fight. Playful.', BRIGHT),
  says('fight', null, 'fight.shining', 'I am helping! I am shining at them!',
    'In a fight: it lights the way, and that is all it can do.', CHEER),
  says('fight', null, 'fight.moving', 'Keep moving, they cannot hit what is not there.',
    'A tip in a long fight.', TIP),
  says('fight', null, 'fight.well', 'You are doing well! I think. It is hard to see from back here.',
    'In a fight, from behind the hero.', CHATTY),
  says('kill', { many: true }, 'kill.three', 'Three at once! Did you see that? I saw that!',
    'Three or more enemies beaten at once.', CHEER, { seed: { en: 3 } }),
  says('kill', { many: true }, 'kill.storm', 'All of them at once! That was like a storm.',
    'Three or more enemies beaten at once.', CHEER),
  says('kill', { many: true }, 'kill.clap', 'Whoosh! I would clap, if I had hands.',
    'Three or more enemies beaten at once.', CHEER),
  says('kill', null, 'kill.one-less', 'Got it! One less.',
    'An enemy beaten.', BRIGHT),
  says('kill', null, 'kill.name', 'Did that one have a name? Never mind.',
    'An enemy beaten. Musing (it has lost its own name).', CHATTY, { seed: { de: 2 } }),

  // --- getting stronger, finding things -------------------------------------------------------
  says('level', null, 'level.grew', 'You look stronger! Did you grow? You grew.',
    'A level gained.', CHEER),
  says('level', null, 'level.gears', 'Another level! My gears are proud of you.',
    'A level gained.', CHEER),
  says('level', null, 'level.carry', 'Stronger again. Soon you will carry me.',
    'A level gained. Joking.', CHATTY),
  says('level', null, 'level.click', 'I felt that from here! Something in you just went click.',
    'A level gained.', WONDER),
  says('chest', null, 'chest.inside', 'A chest! What is inside? What is inside?',
    'A chest opened. Eager.', BRIGHT),
  says('chest', null, 'chest.shiny', 'Shiny things! Somebody hid these a long time ago.',
    'A chest opened.', WONDER),
  says('chest', null, 'chest.glass', 'I love chests. They are like glass, but you can open them.',
    'A chest opened. Musing.', CHATTY),
  says('loot', null, 'loot.glows', 'Ooh, that one glows. Keep that one.',
    'A rare weapon or piece of armor picked up.', WONDER),
  says('loot', null, 'loot.sparkle', 'That is a good one! I can tell by the sparkle.',
    'A rare weapon or piece of armor picked up.', BRIGHT),
  says('loot', null, 'loot.skilled', 'Somebody very skilled made that. Not as skilled as the glassmaker, though.',
    'A rare weapon or piece of armor picked up. Loyal to the glassmaker.', CHATTY),
  says('quest', null, 'quest.job', 'A job! I like jobs. They make the day go round.',
    'A quest taken.', BRIGHT),
  says('quest', null, 'quest.yes', 'You said yes. You always say yes, right?',
    'A quest taken. Teasing (the glassmaker was always too quick to say yes).', CHATTY),

  // --- hordes, falls, home, standing about ----------------------------------------------------
  says('horde', null, 'horde.too-many', 'That is a lot of them. That is too many of them!',
    'A horde woke up.', WARN),
  says('horde', null, 'horde.narrow', 'They are all waking up at once! Find a narrow spot!',
    'A horde woke up: a tip.', WARN),
  says('horde', null, 'horde.surround', 'Here they come! Do not let them surround you.',
    'A horde woke up.', WARN),
  says('fall', null, 'fall.whee', 'Yippee! I mean: are you all right?',
    'The hero fell through a gap: it dove after them and caught them.', CHEER, { seed: { en: 1, de: 2 } }),
  says('fall', null, 'fall.got-you', 'Got you! Not down there, not yet. Back up we go!',
    'The hero fell through a gap: it caught them, and carries them back up.', BRIGHT),
  says('fall', null, 'fall.hold-on', 'Hold on to me! I will fly you back up to where it is safe.',
    'The hero fell through a gap: it caught them, and carries them back up.', CHATTY),
  // --- in the water, and pulled out of what would kill (game/swim.js, game/rescue.js) ------------
  says('swim', null, 'swim.sink', 'You can swim! I cannot. I would sink like a stone. A shiny stone.',
    'The hero swims for the first time.', CHATTY),
  says('swim', null, 'swim.dry', 'Splash! Do not worry about me, I will stay up here where it is dry.',
    'The hero went into deep water.', BRIGHT),
  says('swim', null, 'swim.wait', 'If you cannot find a way out of the water, just wait. I will come and get you.',
    'The hero swims: if there is no way out, the robot comes.', KIND),
  says('rescue', { fluid: 'lava' }, 'rescue.lava', 'Got you! Hot, hot, hot! Hold on to me!',
    'The robot pulls the hero out of lava.', WARN, { seed: { en: 2 } }),
  says('rescue', { fluid: 'lava' }, 'rescue.lava.wings', 'Out of the lava you come! My wings were not made for this, you know.',
    'The robot pulls the hero out of lava again.', UNEASY),
  says('rescue', { fluid: 'acid' }, 'rescue.acid', 'Up you come! That green stuff ate a bit of you, I think.',
    'The robot pulls the hero out of acid.', WARN),
  says('rescue', { fluid: 'mud' }, 'rescue.mud', 'Hold on! Pull, pull... and out you pop!',
    'The robot pulls the hero out of a boss\'s mud.', BRIGHT),
  says('rescue', { fluid: 'slime' }, 'rescue.slime', 'Eww, slime! Hold on, I have got you.',
    'The robot pulls the hero out of a boss\'s slime.', BRIGHT),
  says('rescue', { fluid: 'water' }, 'rescue.water', 'No way out of there? Grab hold of me, I will fly you out.',
    'The robot carries the hero out of water with no way out.', KIND),
  says('rescue', null, 'rescue.tight', 'Hold on tight! And please do not look down.',
    'The robot pulls the hero out of something.', UNEASY),
  says('rescue', null, 'rescue.good', 'Again? I am getting good at this.',
    'The robot pulls the hero out again.', CHATTY),
  says('home', null, 'home.have-you', 'Home! Well, your home. I do not have one, I have you.',
    'Back in town from out there.', KIND),
  says('home', null, 'home.bread', 'The town smells of bread. Is it the same bread, do you think?',
    'Back in town (a recording of the glassmaker tells of bread kept in the glass).', WONDER),
  says('home', null, 'home.rest', 'Rest a bit. The well will wait for us.',
    'Back in town.', KIND),
  says('idle', null, 'idle.waiting', 'Are we waiting for something? I am good at waiting, I waited a very long time once.',
    'The hero has stood about for a while.', CHATTY),
  says('idle', null, 'idle.hum', 'Hum hum hum. Sorry, I hum when it is quiet.',
    'Standing about. It hums to itself.', CHATTY),
  says('idle', null, 'idle.gears', 'I am counting my gears: all there, good.',
    'Standing about.', CHATTY),
  says('idle', null, 'idle.tick', 'Tick, tock. That is me, not a clock.',
    'Standing about.', CHATTY),
  says('idle', null, 'idle.glass', 'If we wait here long enough, will his glass come to us? Probably not.',
    'Standing about. His glass: the glassmaker\'s.', CHATTY),
  says('idle', null, 'idle.name', 'I nearly remembered my name just now. Gone again.',
    'Standing about. Wistful.', SOFT),

  // --- wandering about: what it sees, the sky, the caves of act II, the deep, the core -----------
  says('wander', { depth: [0, 6] }, 'wander.crack', 'If you look hard at the edge of the sky, you can see a crack. It holds; most of them hold.',
    'A place not seen before, under the sky. The pieces are in cracked glass that holds.', WONDER),
  says('wander', { depth: [0, 6] }, 'wander.light', 'There is a light far off, in another piece. Somebody is home.',
    'Under the sky: other pieces of the world far off, where people live whom the hero will never meet.', SOFT),
  says('wander', { depth: [0, 6] }, 'wander.others', 'Do you think the people in the other pieces know we are here?',
    'Under the sky, musing.', WONDER),
  says('wander', { depth: [0, 6] }, 'wander.forever', 'The star-readers said the pieces would float for ever. I do not know how I know that.',
    'A scrap of memory, puzzled.', SOFT, { seed: { en: 3 } }),
  says('wander', { depth: [0, 6] }, 'wander.clouds', 'I counted the clouds, then I lost count, then I counted again. Forty-one.',
    'Chatter.', CHATTY),
  says('wander', { depth: [0, 6] }, 'wander.made-me', 'I wonder if the glassmaker made my glass. It would explain why I like his voice so much.',
    'Musing (whether he made it stays open).', SOFT),
  says('wander', { depth: [0, 6] }, 'wander.feathers', 'My wings are glass too: four feathers on each side. Somebody counted them very carefully.',
    'Chatter about itself (the glassmaker made the clockworks\' wings so: never said outright).', CHATTY),
  says('wander', { depth: [0, 6] }, 'wander.in-front', 'I like flying behind you. It means somebody is in front.',
    'Warm.', KIND),
  says('wander', { depth: [0, 6] }, 'wander.ticking', 'Sometimes I hear ticking that is not mine. Then I remember it is mine.',
    'Chatter, a little funny.', CHATTY),
  says('wander', { depth: [13, 13] }, 'wander.13.sky', 'The sky is so far up now. I can barely see it through the cracks.',
    'Depth 13, the bottom of the second act.', SOFT),
  says('wander', { depth: [13, 13] }, 'wander.13.light', 'My light matters now. I will try not to blink.',
    'Depth 13, dim.', UNEASY),
  says('wander', { depth: [13, 13] }, 'wander.13.drip', 'Drip, drip. Everything down here drips.',
    'Depth 13: slime and water.', CHATTY),
  says('wander', { depth: [7, 12] }, 'wander.caves.crack', 'Light is coming through a crack up there. Somebody else\'s sky, far away.',
    'Act II: light falls in through cracks.', SOFT),
  says('wander', { depth: [7, 12] }, 'wander.caves.music', 'Plink, plonk. The caves are playing music with their drips.',
    'Act II, chatter.', CHATTY),
  says('wander', { depth: [7, 12] }, 'wander.caves.cousins', 'Some of these mushrooms glow like me. I think we are cousins.',
    'Act II: glowing things.', CHATTY),
  says('wander', { depth: [7, 12] }, 'wander.caves.hum', 'Sometimes I think I can hear humming, far below. Then it stops.',
    'Act II. The humming: the creature, far below (it does not know).', SOFT),
  says('wander', { depth: [14, 19] }, 'wander.deep.bright', 'I am glowing as bright as I can. It is just a very big dark.',
    'Act III, the deep.', KIND),
  says('wander', { depth: [14, 19] }, 'wander.deep.warm', 'The deeper we go, the warmer my core gets. I hope that is a good thing.',
    'Act III.', UNEASY),
  says('wander', { depth: [14, 19] }, 'wander.deep.glass', 'Look, a little piece of glass in the rock. Old star-glass, maybe.',
    'Act III: glass that fell this far.', WONDER),
  says('wander', { depth: [14, 19] }, 'wander.deep.thinking', 'It is so quiet down here, I can hear my own gears thinking.',
    'Act III, chatter.', CHATTY),
  says('wander', { depth: [20, 20] }, 'wander.core.smoke', 'Do you smell that? Smoke, like from a small furnace.',
    'The core: the glassmaker\'s furnace somewhere (not found yet).', SOFT, { seed: { de: 2 } }),

  // --- guardians (a side guardian, or a boss's stand-in) ---------------------------------------
  says('guardian', { what: 'near' }, 'guardian.big', 'Something big is guarding this place. Watch its friends too.',
    'A guardian\'s arena entered: it has defenders.', UNEASY),
  says('guardian', { what: 'near' }, 'guardian.another', 'Another guardian. They really do not want us to go down.',
    'A guardian\'s arena entered.', CHATTY),
  says('guardian', { what: 'beaten' }, 'guardian.clear', 'The guardian is down! The way is clear.',
    'A side guardian beaten.', CHEER, { seed: { en: 2 } }),
  says('guardian', { what: 'beaten' }, 'guardian.bigger', 'That one was big. You were bigger.',
    'A side guardian beaten.', CHEER),

  // --- trial rooms: an event sealing the room, a puzzle come to, done, failed -------------------
  says('trial', { what: 'sealed', kind: 'flood' }, 'trial.flood', 'The water is rising! Up, up to the button!',
    'A rising water event sealed the room: press the button on the summit.', WARN),
  says('trial', { what: 'sealed', kind: 'collapse' }, 'trial.collapse', 'The floor is falling away! Run, and do not look back!',
    'A crumbling floor event: run for the far side.', WARN),
  says('trial', { what: 'sealed', kind: 'balance' }, 'trial.balance', 'Stepping stones! They sink when you land on them, and the dark ones rise and fall by themselves. Watch, then hop!',
    'Balance: stone slabs over lava or acid. Grey ones sink three seconds after the first landing, pale ones after two, dark ones rise and sink to a beat of their own.', WARN),
  says('trial', { what: 'sealed', kind: 'cold' }, 'trial.cold', 'So cold! Light the braziers on the way, they keep you warm.',
    'A cold snap: light the braziers on the way to the great fire.', WARN),
  says('trial', { what: 'sealed', kind: 'storm' }, 'trial.storm', 'Wind! Hide behind the rocks when it gusts, and climb when it calms.',
    'A storm: climb in the lulls to the lightning rod on top.', TIP),
  says('trial', { what: 'sealed', kind: 'siege' }, 'trial.siege', 'Keep them away from the beacon! Only for a little while.',
    'Hold the beacon: defend it long enough.', WARN),
  says('trial', { what: 'sealed', kind: 'chase' }, 'trial.chase', 'Take the relic and run! Drop the gate behind us!',
    'The relic: take it, run, drop the portcullis on its warden.', WARN),
  says('trial', { what: 'sealed', kind: 'miasma' }, 'trial.miasma', 'Fog from above! Down, down to the valve!',
    'Sinking fog: get down to the vent valve.', WARN, { seed: { en: 3 } }),
  says('trial', { what: 'puzzle', kind: 'slide' }, 'trial.slide', 'Ice! You slide until a rock stops you, so think where each slide ends.',
    'An ice slide puzzle, not solved yet.', TIP),
  says('trial', { what: 'puzzle', kind: 'mirror' }, 'trial.mirror', 'Mirrors! The beam has to shine through every crystal, not just reach the end.',
    'A mirror beam puzzle: through every lens into the receiver.', TIP),
  says('trial', { what: 'puzzle', kind: 'braziers' }, 'trial.braziers', 'See the lines on the floor? Each brazier flips the ones it is joined to, and we want them all burning.',
    'Lights out: lighting one toggles the ones linked to it.', TIP),
  says('trial', { what: 'puzzle', kind: 'crates' }, 'trial.crates', 'Crates and plates. You can only push, so do not push one into a corner; the lever puts them back.',
    'Crates on plates: push only, the reset lever at the entrance.', TIP),
  says('trial', { what: 'puzzle', kind: 'timedgate' }, 'trial.timedgate', 'The lever only opens the gate for a little while. Walk the path first, then pull and run!',
    'A timed gate: learn the causeway, then run it.', TIP),
  says('trial', { what: 'puzzle', kind: 'runes' }, 'trial.runes', 'Runestones! The order is carved on a tablet, somewhere else in this piece.',
    'Rune order: the clue is a tablet in another room of the depth.', TIP),
  says('trial', { what: 'puzzle', kind: 'sunken' }, 'trial.sunken', 'This room is under water. Every puzzle we solve drains it a bit.',
    'The sunken room: each puzzle solved drains a stage.', TIP),
  says('trial', { what: 'resolved' }, 'trial.done', 'We did it! I mean, you did it. I glowed.',
    'A trial room done.', CHEER),
  says('trial', { what: 'resolved' }, 'trial.knew', 'Solved! I knew you could.',
    'A trial room done.', CHEER, { seed: { de: 3 } }),
  says('trial', { what: 'failed' }, 'trial.again', 'Not quite. We can try again!',
    'A trial failed: back in the room before.', KIND),
  says('trial', { what: 'failed' }, 'trial.start', 'Back to the start. At least I know the way now.',
    'A trial failed.', KIND),
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

// What is said at moment `on` about `data`: the lines not told yet (`told`: a Set of ids, also
// those waiting their turn) that fit, in the table's order: all of them for a moment that tells
// `all`, else the first; for a moment that `shuffle`s, of those whose `when` says most, the one
// marked `lead`, else one picked by the world's `seed`. [] if there is nothing (more) to say.
export function linesFor(on, data = {}, told = new Set(), lines = LINES, seed = 0) {
  const fit = lines.filter(l => l.on === on && !told.has(l.id) && fits(l.when, data));
  if (MOMENTS[on]?.all) return fit;
  if (!MOMENTS[on]?.shuffle || fit.length < 2) return fit.slice(0, 1);
  const says = l => Object.keys(l.when ?? {}).length, most = Math.max(...fit.map(says));
  const best = fit.filter(l => says(l) === most);
  return [best.find(l => l.lead) ?? best.reduce((a, b) => (drawOf(seed, b.id) < drawOf(seed, a.id) ? b : a))];
}
// a line's place in world `seed`'s order of a shuffled moment (FNV-1a of its id, mixed with the seed)
function drawOf(seed, id) {
  let h = 0x811c9dc5 ^ (seed | 0);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

// a line's clip (core/narration.js forms): its id, or `<id>.<form>`
export const clipKey = (line, form) => line.forms && form ? `${line.id}.${form}` : line.id;
// the form of a line that has forms, for the sibling `sib` ('m' or 'f')
export const formOf = (line, sib) => !line.forms ? null : Object.keys(line.forms).find(f => line.forms[f].sib === sib) ?? Object.keys(line.forms)[0];
