// The opening (docs/story.md, "How the story is told"): before the hero comes into the world, a
// recording of the glassmaker's, made long after, down in the dark. He never says his name, but he
// is the one: the star-readers came to him, his glass holds the world, he gave the ark its wings.
// The stone; the glass round the pieces of the world; the winged ark rising out of its steam; the
// comets, the wings breaking, the hull falling (with him in it, below everything: the core), the
// pieces scattering, cracked but whole. One of them comes to rest, and time goes by in it. He blows
// his words into star-glass, and it rises: a bubble of it comes up out of the dark into that piece
// (this recording, found where the hero lives). He asks whoever finds it to find him; the game's
// name; closer and closer to the piece, its glass goes clear, black, and the game comes up out of
// it. The creature is left for his other recordings.
//
// Played by film/player.js (docs/film.md: the layers, the cues). Sheet units: x from -8 to 8,
// y from 0 (the floor) to 9. A layer's `from` is where its brush starts, in its picture (x right,
// y down, 0 to 1) or a side. A cue: [when, what, ...whom, { more }]; when: s into the shot, or
// 'NN%' of it. Glasses move in world units (a glass is 0.34 across). The lines are English
// messages (src/i18n/sources.js), German in src/i18n/de/story.js, voiced like the narrator's
// (tools/narration.mjs: the clip of a shot is film.opening.<its id>); `worn`: they sound like an
// old recording. The title is the game's name, as the main menu says it in the player's language
// (German: Der Glasvogel).
//
// The score (music/films/opening.scrim) is the title song's (music/title.scrim), told along: its
// `music` cues stand at the start of the shots without a line, which never change length, and
// each stretch fills the time to the next (core/film.js scorePlan), however long the lines take
// in a language. Out of the dark a music box plays the toy tune's first phrase, falling (A B C E
// D); under the words it rocks on, the tune only a ghost of a note a bar; as the glass is closed
// its second phrase climbs (A B C E G) into the flight, the ark rises in C major; a knock, a thin
// ring, and as the ark breaks the swell onto D and glass falling; over D the bird's calls in pieces
// and single notes of the tune; with the title the first phrase whole again, and the bird's call
// wide over D minor, the town's key, into the game.
export default {
  name: 'opening',
  voice: 'glassmaker',
  score: 'opening',
  layers: {
    starreaders: { at: [-3.4, 5.4], h: 3.6 },
    earth: { at: [4.3, 2.5], h: 4.6, from: [[0.4, 0.9]] },
    stone: { at: [2.4, 7.3], h: 2.4, tint: 'amber', from: [[0.97, 0.03]] },
    glassmaker: { at: [-2.0, 4.9], h: 4.9, from: [[0.25, 0.2]] },
    town: { at: [-4.4, 5.2], h: 3.0 },
    forest: { at: [0, 5.6], h: 3.0 },
    sea: { at: [4.36, 4.97], h: 1.37 },
    steam: { image: 'smoke', at: [0, 1.4], h: 2.4, from: [[0.5, 0.6]] },
    ark: { at: [0, 4.3], h: 4.0, from: [[0.5, 0.7]] },
    comet1: { image: 'stone', at: [5.2, 7.9], h: 2.2, tint: 'amber', from: [[0.97, 0.03]] },
    comet2: { image: 'stone', at: [-4.8, 7.6], h: 1.7, tint: 'amber', from: [[0.97, 0.03]], turn: -12 },
    comet3: { image: 'stone', at: [1.6, 8.4], h: 1.4, tint: 'amber', from: [[0.97, 0.03]], turn: 8 },
    title: { text: 'The Glass Bird', at: [0, 0], h: 0.8, screen: true },   // (in the middle of the picture)
  },
  // glasses on the floor: at (sheet units across), turned (degrees round, so they are not square to
  // the camera), spin (degrees a second, once grown)
  glasses: {
    town: { at: -2.5, turn: 31, spin: 4 },
    forest: { at: 0, z: -0.12, turn: -24, spin: -3 },
    sea: { at: 2.5, turn: 52, spin: 5 },
  },
  shots: [
    {
      // out of the dark, a music box through the crackle: the toy tune's first phrase
      hold: 4.2,
      cues: [
        [0, 'crackle', { to: 0.7, for: 0.4 }],
        [0, 'music', 'prelude'],
        [1.2, 'light', { to: 0.35, for: 4 }],
      ],
    },
    {
      id: 'name',
      line: 'Nobody says my name any more. That is all right. Names do not keep in glass.',
      note: 'The first words of the game, out of the dark: the glassmaker, long after, recording where he is held. He does not say his name. Low, tired, calm, a little bitter.',
      instruct: 'Speak low and calm, tired, like an old man talking to himself in the dark.',
      cues: [
        [0, 'music', 'making', { then: 'bed', last: 'arrive', level: 0.3 }],
        ['80%', 'crackle', { to: 0.25, for: 1.5 }],
      ],
    },
    {
      id: 'stars',
      line: 'The star-readers saw the stone first. They read the sky for a hundred nights, and it never changed its mind.',
      note: 'How it began. Measured, grave, with a dry edge.',
      instruct: 'Speak low and measured, grave, a storyteller remembering something terrible.',
      cues: [
        [0, 'light', { to: 1, for: 3 }],
        [0.1, 'paint', 'starreaders', { for: 2.6 }],
        ['18%', 'paint', 'earth', { for: 3.2 }],
        ['48%', 'paint', 'stone', { for: 1.8, ease: 'in' }],
        ['50%', 'knock'],
      ],
    },
    {
      id: 'door',
      line: 'Then they came to my door. Not to the guild. To me. I knew the old way of star-glass: glass that keeps what it holds, and rises.',
      note: 'Why it was him: quiet pride, not boasting. The star-glass is his craft.',
      instruct: 'Speak low and quietly proud, steady and plain.',
      cues: [
        [0, 'fade', 'earth', { for: 1.4 }],
        [0.2, 'fade', 'stone', { for: 1.0 }],
        [0.1, 'fade', 'starreaders', { for: 1.2 }],
        [0.7, 'paint', 'glassmaker', { for: 3.5 }],
      ],
    },
    {
      id: 'closed',
      line: 'I closed it round all I could. A town. A forest. A piece of the sea. My hands made every pane of the glass you live in.',
      note: 'The work of his life; the last sentence is to whoever hears this, and it lands hard.',
      instruct: 'Speak softly and fondly, then firm and quiet on the last sentence.',
      cues: [
        [0, 'fade', 'glassmaker', { for: 1.2 }],
        [0.3, 'paint', 'town', { for: 1.4 }],
        [0.9, 'grow', 'town', { for: 0.9 }],
        [1.6, 'lift', 'town', 'town', { for: 1.6 }],
        [1.5, 'paint', 'forest', { for: 1.4 }],
        [2.1, 'grow', 'forest', { for: 0.9 }],
        [2.8, 'lift', 'forest', 'forest', { for: 1.6 }],
        [2.7, 'paint', 'sea', { for: 1.4 }],
        [3.3, 'grow', 'sea', { for: 0.9 }],
        [4.0, 'lift', 'sea', 'sea', { for: 1.6 }],
      ],
    },
    {
      // the glasses stand and turn; the toy tune's second phrase climbs, into the flight
      hold: 3.7,
      cues: [[0, 'music', 'breath']],
    },
    {
      id: 'wings',
      line: 'I gave the ark its wings. When it rose, I went with it, to keep the glass whole.',
      note: 'The ark rising. The memory of the best day, told by a man who knows how it ended.',
      instruct: 'Speak low and slow, warm for a moment, then heavy.',
      seed: { de: 1 },   // (the others say "Arsch" for "Arche")
      cues: [
        [0, 'music', 'fly', { then: 'hover', last: 'land', level: 0.4 }],
        [0, 'paint', 'steam', { for: 2.2 }],
        [0.2, 'paint', 'ark', { for: 1.8 }],
        ['38%', 'move', 'ark', { by: [0, 3.2], for: 3.8, ease: 'inOut' }],
        ['40%', 'rise', 'town', { by: 0.95, for: 4 }],
        ['43%', 'rise', 'forest', { by: 1.1, for: 4 }],
        ['46%', 'rise', 'sea', { by: 0.9, for: 4 }],
        ['60%', 'fade', 'steam', { for: 2.4 }],
      ],
    },
    {
      // the comets: the ark's wings break, the pieces crack and hold, and tumble apart; one of them
      // (the town's) comes to rest in the light
      hold: 5.2,
      cues: [
        [0, 'music', 'comets'],
        [0, 'crackle', { to: 0.1, for: 0.5 }],
        [0.3, 'paint', 'comet1', { for: 0.6, ease: 'in' }],
        [0.3, 'knock'],
        [0.6, 'paint', 'comet2', { for: 0.5, ease: 'in' }],
        [0.85, 'paint', 'comet3', { for: 0.45, ease: 'in' }],
        [1.0, 'break', 'ark', { hold: [0.41, 0.72, 0.28, 0.2] }],   // (the hull stays whole, and falls)
        [1.1, 'crack', 'forest', { across: [0.4, 1, 0.1] }],
        [1.2, 'crack', 'sea', { across: [-0.3, 1, 0.4], sound: false }],
        [1.3, 'crack', 'town', { across: [0.2, 1, -0.3], sound: false }],
        [1.5, 'drift', 'forest', { by: [-0.9, 0.35, -1.7], fade: 0.22, spin: 30, for: 4.5 }],
        [1.5, 'drift', 'sea', { by: [1.2, -0.15, -1.5], fade: 0.22, spin: -26, for: 4.5 }],
        [1.6, 'drift', 'town', { by: [0.625, -0.2, 0.25], spin: -2, for: 4 }],
        [1.8, 'fade', 'comet1', { for: 1.4 }],
        [1.8, 'fade', 'comet2', { for: 1.2 }],
        [1.9, 'fade', 'comet3', { for: 1.0 }],
        [2.2, 'light', { to: 0.8, for: 2 }],
      ],
    },
    {
      id: 'mend',
      line: 'The wings were mine as well. They broke, and the ark fell, and I fell with it, below everything.',
      note: 'Guilt, and where he is now: the ark fell to the bottom of the world, with him in it. He has said this to himself many times.',
      instruct: 'Speak very low, full of regret, then flat and quiet.',
      cues: [
        [0, 'music', 'shards', { then: 'drift', last: 'home', level: 0.35 }],
        [0, 'crackle', { to: 0.3, for: 1.5 }],
      ],
    },
    {
      id: 'held',
      line: 'Most of the pieces held. But the world is broken apart now, scattered through the dark.',
      note: 'Time has passed. A little comfort, then the truth of it. The recording is getting worse.',
      instruct: 'Speak low and slow, quietly relieved, then sad.',
      worn: true,
      cues: [
        [0, 'crackle', { to: 0.45, for: 2 }],
        ['10%', 'lights', 'town', { for: 4 }],
      ],
    },
    {
      id: 'rise',
      line: 'So I blow my words into glass, and let them rise. I do not know where they come to rest.',
      note: 'How his recordings reach anyone: star-glass rises. He has no idea who hears them. Quiet, a little hopeful.',
      instruct: 'Speak low and quiet, with a faint hope.',
      seed: { de: 1 },   // (the others say "blasse" or "lasse" for "blase")
      worn: true,
      cues: [
        [0, 'crackle', { to: 0.5, for: 2 }],
        ['5%', 'bubble', 'town', { from: [0.35, 0.02, 1.3], for: 5 }],
      ],
    },
    {
      id: 'find',
      line: 'If this reaches you: I am down below, where no light reaches. Find me.',
      note: 'The last words, to whoever finds the recording, wherever it rose to. Urgent but quiet. "Find me" is the point of all of it.',
      instruct: 'Speak low, quiet and urgent, close to the listener, slowing down for the last two words.',
      seed: { en: 3 },
      worn: true,
      cues: [
        [0, 'crackle', { to: 0.6, for: 2 }],
        [0, 'closer', 'town', { by: 0.45, for: 6 }],
      ],
    },
    {
      // the game's name; closer to the piece until it fills the picture, its glass goes clear, and
      // halfway through that, black; then the game comes up out of it
      hold: 7.4,
      cues: [
        [0, 'crackle', { to: 0, for: 2.5 }],
        [0.4, 'music', 'title'],
        [0.4, 'paint', 'title', { for: 2.2, ease: 'linear' }],   // (its letters at one pace)
        [3.2, 'fade', 'title', { for: 1.4 }],
        [2.6, 'closer', 'town', { by: 0.95, for: 3.8 }],
        [4.6, 'vanish', 'town', { for: 2.0 }],
        [5.6, 'black', { for: 1.4, reveal: 1.8 }],
      ],
    },
  ],
};
