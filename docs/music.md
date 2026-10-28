# Music

Songs are plain-text [Scrimshaw](https://tools.simonwillison.net/scrimshaw-jukebox) scores in
`music/<name>.scrim`, played by a Web Audio synth in the browser. There is no build step: the
game fetches the score and compiles it when it is first needed. The parser and synth are
vendored in `vendor/scrimshaw/` (Apache-2.0, from Simon Willison's tools), with the game's own
glass instruments added (`glassharp`, `crystal`, `bowl` and the drums `glasstap`, `chimes`,
`shatter`: `music/README.md`), and a `theremin`. The jukebox page does not know those, so a score
using them only plays in the game and `tools/player.html`. Two more changes there: `compile`
also gives one pattern on its own (for the stings), and a `~` glide comes from the note before
it (the jukebox only glided the first one of a pattern).

**Writing a song?** Start with `music/README.md`: the game's musical style, how to build the
layers, a format cheat sheet and a full example score.

Music is on at first, but off with the dev tools (`?dev=1`); the settings (in the Esc menu and
the main menu) or M turn it on and off, and the choice is kept once made. A film's score
(below) plays unless the music was turned off, with the dev tools too. The settings set its volume apart from the sound effects' (`src/game/settings.js`, kept in
`crawler.settings`; the music plays into its own bus of `src/audio/context.js`). Both buses go
into a master with the volume of everything, which is quiet while the game is behind another tab
or window (a setting: on at first, but not in the guide's game window). The synth is
built for the first song and leaves the bus a few seconds after the music stops, so with the
music off its compressors and reverb cost nothing.

The synth builds every note from Web Audio nodes (ten to twenty a note: oscillators, filters,
a vibrato, noise), and every running node is work for the audio thread; 30 to 70 notes sound at
once. So the game plays its songs from samples, as old consoles and MIDI sound banks did: the
synth renders each sound a song uses once, offline, and the player plays it back as a buffer
source and a gain. Until a song's samples are in, the synth plays its notes live.

- The drums (`src/audio/drumkit.js`): each drum and velocity the song uses, three takes of the
  short hits (their noise differs); the long ones (a gong, thunder, a crash) stay live.
- The other notes (`src/audio/sampler.js`): each note the song plays (the instrument, the voice's
  settings, the pitch, and for brass, trumpet, synth bass and crystal the velocity in quarter
  steps, which changes their sound), when the song first plays, kept for the next time up to
  40 MB (the least recently used of other songs go first). A held note (strings, choir, flute,
  glass harmonica ...) is rendered without its vibrato: its attack, then a stretch of its steady
  tone, a whole number of its periods, that loops, its end crossfaded into what comes before its
  start; the player lets it go with the instrument's release and plays the vibrato as the
  instrument would have, one slow oscillator per voice into its notes' detune (the synth tells
  the sampler both: `captureNotes`). A note short enough is rendered whole. A struck note
  (mallets, bells, plucked strings) is rendered ringing as long as the song holds it, and damped
  by the player where the synth would have; one with noise in it (a mallet's knock, a plucked
  string's random start) gets two takes. Crystal, whose FM settles into one long fading sine, is
  rendered with its envelope taken out and loops; the player puts the envelope back. A note whose
  sound stays under 10 kHz is rendered at half the rate (half the memory; not the plucked
  strings, whose Karplus-Strong loop sounds different at another rate). A song takes 10 to 24 MB
  of samples and a quarter to half a second to render (on a fast machine, off the main thread).
- At most 24 notes of a song sound at once; one more lets the one going longest go, a fading one
  first.

Against the synth playing it all live, the notes cost the audio thread a fifth to a half (an
offline render, without the reverb: overworld 1.5% of a core to 0.7%, Gusto's second phase 6.1%
to 1.2%); with the reverb, which costs the same either way and is now most of what is left, the
music as a whole 40 to 70%. The jingles (below) stay live: short, and seldom.
`tests/browser/samples.js` checks that the samples sound like the synth: every instrument note
by note, and the songs second by second. `tools/player.html` plays a song both ways ("samples").

Notes are scheduled from the main thread 1 s ahead (2.5 s in a hidden tab, whose timers slow
down), so a stalled frame does not starve the audio. A note that comes late all the same still
plays, at once, if it is at most 150 ms late; a later one is dropped.

| File | Role |
|---|---|
| `src/audio/context.js` | the AudioContext shared with the sound effects, made on the first key or click |
| `src/audio/score.js` | compiles a score and reads its moods (pure, tested in node) |
| `src/audio/music.js` | the player: schedules notes ahead, loops, switches songs, fades voices between moods |
| `src/audio/drumkit.js` | the drum hits a song uses, rendered once and played as samples |
| `src/audio/sampler.js` | the other notes a song uses, rendered once (held ones looping) and played as samples |
| `src/game/music.js` | picks the song (`songFor`) and the mood from the game state; `forceMood` holds one (`__game.musicMood`) |
| `src/core/bossmusic.js` | the bosses with a song of their own, its moods and how his fight picks one (Gusto's: `gustoMusic` in `src/core/gusto.js`; Sollmeldon's: `sollmeldonMusic` in `src/core/sollmeldon.js`) |

## Editing

`tools/player.html` (`npm run serve`, then `/tools/player.html`) plays every score with the
game's synth: pick a song on the left (or `#overworld` in the URL), switch
moods, click a voice to mute it or shift-click to solo it, click the bar to seek; a piano roll
shows what plays (its rows span the whole score, so they stay put). It reloads the score each
time you pick it, so edit, then pick the song again. The same player plays the game's sounds too
(`docs/sound.md`).

Or paste a score into the jukebox page to hear it, see it as a piano roll and get errors per
line, then copy it back. Its "Read guide" section documents the format; in short, settings,
then `voice NAME INSTRUMENT [vol= pan= rev= ...]`, then `pattern` blocks with one line per
voice (`|` separates bars, a step per note plus one per `-`), then `play` (once) and `loop`
(forever). `npm test` compiles every score in `music/` and fails on any error.

## Moods

The game picks one of six moods and each score names the voices that play in it, in
`# mood NAME: voices` comments (`music/README.md` explains the syntax and the fallbacks). Moods are not
levels: a calmer-sounding set can replace a fuller one, so a mood can take voices away.

| Mood | When (`src/game/music.js`) | Holds after its reason is gone |
|---|---|---|
| `explore` | nothing below applies | |
| `treasure` | a reward site's chest (`map.rewardSites[].anchor`) within 6 cells and 3 up or down | 1 s |
| `sense` | a live enemy within 8 cells and 3 up or down | 2 s |
| `rise` | an enemy in `chase` or `attack` | 3 s |
| `fight` | an enemy in `chase` or `attack` within 4 cells; or blows within the last 6 s (an enemy in `attack`, its hp dropping, yours dropping) while an enemy is after you or sensed | 4 s |
| `boss` | a guardian in `chase` or `attack`, or hurt and within 12 cells | 5 s |

The highest mood that applies wins and takes over at once; a calmer one takes over only
after the current one's hold time.

## A boss's own song

A boss in `BOSS_MUSIC` (`src/core/bossmusic.js`) has a song of his own. While he lives in the
cube (`bossHere` in `src/game/music.js`: the boss himself, not a proxy, not dead), his song
plays, from the moment you come into his arena (a dev spawn too), and its moods are his fight's
phases instead of the six above: the score names them (`# moods:`, `music/README.md`), the first
the one before he fights. They come from what every game sees of him, so a friend shown his
fight hears the same. A phase takes over at once; only going back to the first waits 3 s (he
went home). Once he is dead the place's own song comes back, from `explore`.

| Gusto's mood | When (`gustoMusic`, `src/core/gusto.js`) | Voices |
|---|---|---|
| `lurk` | he has not noticed you, unhurt | choir, tuba drone, music box motif, bell toll, a tom heartbeat |
| `phase1` | after you, or hurt, above half his health | horn tune, low string ostinato, organ stabs, tuba, choir, kick, snare, taiko, timpani, crash |
| `split` | he shudders (`split`) | choir, a held cluster (D Eb Ab), a timpani roll, tuba, bell |
| `phase2` | his proxies stand, or he is below half, or he has split | phase1 without organ, with brass stabs, the theremin, a snare on every beat and sixteenth hats |
| `gone` | he vanished (`gone`) | choir, theremin, heartbeat, bell, tuba |

| Sollmeldon's mood | When (`sollmeldonMusic`, `src/core/sollmeldon.js`) | Voices |
|---|---|---|
| `lurk` | he has not noticed you, unhurt | choir, tuba, a singing bowl tolling, a tom heartbeat |
| `phase1` | after you, or hurt: three heads | his heads' canon (the motif D Eb F A G one bar apart: a horn, a bassoon an octave under, a glass harmonica over), low strings rocking in three, tuba, choir, timpani, kick, taiko |
| `sever` | a head being cut off (`split`) | choir, a held cluster, a timpani roll, tuba, bowl |
| `phase2` | two heads | phase1 without the glass harmonica (its head is gone), with a snare and brass stabs |
| `phase3` | one head | the horn alone, doubled by the theremin; strings, tuba, timpani, kick, a snare in sixteenths, taiko, hats, brass |
| `tilt` | the world tipped over a third of the way (his `tilt`) | the horn, strings, tuba, choir, timpani, taiko, the cluster and a theremin sliding down and down |

A **sting** is a pattern a score plays once as a mood begins (`# sting MOOD: PATTERN`), from the
next sixteenth, over the loop; its voices play in no mood, so their channels stay open
(`audio/music.js` `playSting`). Gusto's: a brass hit and crash as he comes for you, thunder and
a dissonant brass chord as he splits, gong, crash and brass as the three of him appear (again
each time he comes back), a whoosh as he vanishes. Sollmeldon's: a three-throated brass chord and a
crash as he comes for you, a gong, a splash and a brass cluster as a head comes off, a brass hit
and a crash as the next phase begins, a boom as the world tips.

Beating a boss (a real one or a Temp Boss) plays a jingle (`src/audio/jingles.js`,
`music/jingles/victory.scrim`, `docs/sound.md`), and the music is turned down under it, smoothly
(`duckMusic`); a boss with his own song is gone by then, and the place's song comes back after it.
The jingles are scores in `music/jingles/` (with its `index.json`), which `tools/player.html`
lists under Jingles; they are no songs, so they are in no `SONGS`. The others, built on the title
song too, play at the game's other big moments (`docs/sound.md` says where): `death` (the victory's ring and the title's shatter, then the
toy tune trying again), `trial` (a trial room lived through), `quest` (a quest done), `act1`,
`act2`, `act3` and `core` (the first cube of each act and the core, the toy tune whole, varied,
in pieces and mended), all 3.5 to 4.5 s, and short
stingers meant to play over the music: `levelup`, `chest` (a chest's glint), `legendary` and
`memorized` (one soft ring for a cube got through), `questtaken`, `questfailed`, `trialsealed` (the
knock and the ring), `trialfailed`, `revived` (by a friend), `horde` (it wakes), `dawn`, `dusk`,
`enchant` and `portal` (a portal not gone through before).

## A film's score

A film (`docs/film.md`) has a score of its own, in `music/films/<film>.scrim` (the opening's is
the title song told along the film), listed like the jingles in an `index.json`, for
`tools/player.html` (Films). The film's `music` cues say which pattern plays when. A shot lasts
as long as its line takes, which changes with the language and with the clip, so the score is
laid out when the film starts, from its plan (`scorePlan` in `src/core/film.js`): each cue starts
a stretch up to the next one, which plays its pattern, then a `then` pattern's bars over and over,
then a `last` pattern, as many bars as come nearest its time, up to 5% faster or slower to fill it
exactly (a short stretch holds its last notes). The cues stand at the shots without a line, which
never change length, so what has to land on the picture lands; the beds go under the words, a
`level` softer, so that the voice is heard. `filmEvents` (`src/audio/score.js`) turns that into
notes in the film's time, and `playFilmScore` (`src/audio/music.js`) plays them on the sound's
clock, which the film keeps to (its pictures follow that clock, not the frames). The songs wait
for it: the next one starts once its last notes are over, or at once when the film is skipped
(the score fades out with the picture). `music/README.md` says how to write one.

## Scheduling

Voices that are out are not scheduled at all. A joining voice comes in on the first sixteenth
at least 40 ms away. Its notes from there up to what the scheduler has already done (1 s
ahead) are scheduled at once (except those it still had scheduled from before it left, which
are heard again), and a note already sounding plays its remainder from the join,
so a switch is heard within about 0.2 s. A leaving voice fades out from the next beat.

## Songs

Each theme names its song (`music:` in `src/themes/`); the town and the merchant camp
(`map.enemyFree`) play `town` and depth 20 plays `core` (`songFor` in `src/game/music.js`). The
main menu plays `title` (`openMainMenu` in `src/game/menu.js`), always in `explore`.
A boss with a song of his own plays it in his arena (above). `SONGS` in `src/themes/index.js`
lists them all, for the test and `tools/player.html`; the
test also checks that every score in `music/` is one of them.

| Song | Themes (act) | Key, tempo, meter | Sound | `sense` drums |
|---|---|---|---|---|
| `title` | main menu | A minor (Westworld's, with Bb and G#), 67, 6/8 | The Glass Bird: a kid's toy tune on crystal over a rocking crystal ostinato, the bird's calls and answers, glass harmonica, singing bowl, glass heartbeat, fretless bass; it cracks and shatters like the splash screen's bird (knock, ring, shatter, a swell onto D), then the pieces ring; explore only | — |
| `town` | town, merchant camp | D minor, 92, 3/4 | a dark waltz: clarinet opening on the toy tune (D E F A G), accordion off-beats, music box picking high; explore and treasure only | — |
| `overworld` | the meadows, cloud kingdom, lagoon isles, karst terraces, dark forest (I) | A minor, 76 | flute opening on the toy tune (A B C, E D, C), marimba rocking on the step above each root, bassoon line | low toms, shaker |
| `peaks` | snowy peaks, prayer highlands (I) | E Phrygian (A minor's notes on E), 60 | a theremin sliding like wind, crystal quarters, low harp | bodhran, triangle |
| `badlands` | salt flats, badlands, deep canyon (I) | A minor, Andalusian (Am G F E), 60, 6/8 | lonely fiddle, strummed guitar, harp high | woodblock gallop, low tom |
| `roots` | root caves (II) | D minor, 58, 6/8 | vibraphone tune like water, rocking pizzicato, crystal drips | bodhran, woodblock |
| `frozen` | sunken grotto, frozen caves (II) | E Phrygian, 72, 3/4 | low flute opening on the toy tune (E F G B A), celesta arpeggios with added seconds, vibes on the second beat | rim, triangle |
| `swamp` | honey hive, fungal swamp, slime marsh (II) | D minor, a Phrygian Eb, 58, 6/8 | low clarinet, a marimba ostinato with the crack's half step in it, pizzicato off-beats; the calls are half steps (the bird broke here) | conga, guiro |
| `nests` | spider nests, ossuary (III) | A Phrygian (the title's Bb), 96 | thin fiddle with pieces of the toy tune (A Bb C, then E), harpsichord scurrying in sixteenths, low choir | hi-hat ticking, low tom |
| `mines` | dwarven forge (II), crystal mines (III) | A minor, 60, 6/8 | crystal tune over rocking vibes, a glockenspiel spark, ending on the toy tune | woodblock pickaxe, triangle |
| `ruins` | jungle cenote (II), buried ruins (III) | E Phrygian dominant (A harmonic minor on E), 70 | oboe opening on the toy tune (E F G# B A), harp, a choir drone on E | bodhran, rim |
| `volcanic` | volcanic depths (III) | D Phrygian, 66 | crystal tune in single notes like shards, low crystal ostinato on the half step, organ chords | deep toms, timbale |
| `abyss` | obsidian abyss (III) | minor chords a tritone apart over an E pedal, 56 | a theremin singing the toy tune a note a bar, a bell tolling, low choir | far thunder, low tom |
| `core` | the core (20) | A minor, 67, 6/8 (the title's) | the title's toy tune whole again on crystal, the rocking crystal, harp; its Bb turns to B the second time (mended) | low tom, triangle |
| `gusto` | Gusto's arena (depth 0's descent), while he lives | D minor with a Phrygian Eb, Bb A Eb Gm and an Ab a tritone off, 150 | horn tune, short low strings in 3+3+2, organ and brass stabs, choir, music box motif, bell, theremin; his fight's own moods and stings (above) | taiko and a tom heartbeat |
| `sollmeldon` | Sollmeldon's mire (depth 10's descent), while he lives | D minor with the swamp's Phrygian Eb, Dm Eb Dm A Bb Gm Eb A, then up a fourth; 84, 3/4 (three of everything) | his three heads singing the motif as a canon one bar apart (horn, bassoon, glass harmonica), a head's voice gone with each head cut off; low strings in three, tuba, choir, brass stabs, theremin; his fight's own moods and stings (above) | timpani, taiko, kick, snare |

Every song but the title, the town and the bosses' own has all six moods. Combat keeps the exploration tempo and meter,
but replaces gentle motion with two combat-only voices: `drive` (an accented, short-gated
ostinato) and `war` (denser battle drums with four-bar fills). The horn re-articulates the tune,
an octave down, accenting each bar, and glass breaking (`shatter`) is the crash. These layers also
stay in `boss`, under its choir and gong; no combat arrangement exceeds 12 active voices.

The songs grew out of the title song (`title`, The Glass Bird) and share its frame: a glass core
under each place's own instruments. The glass bird's call (a crystal grace note falling onto two
notes a step apart) answers the tune's phrases; glass harmonica chords and a low fretless bass that
harmonizes the tune rather than doubling it. `treasure` sparkles on crystal; `sense` drops the
tune for a cracked crystal ostinato (the half step above each root) over a glass heartbeat
(`glasstap`), the place's drums and a singing bowl. The keys stay near the title's A minor
(A or D minor, or its notes on E or F), except the volcanic depths and the abyss.

The tunes share the game's motif, scale degrees 1 2 3 5 4: the opening of the title's toy tune
(A B C E D), in each song's own mode. It follows the story (`docs/story.md`): whole in the town
and act I, varied in act II, where the calls narrow to half steps at its bottom (the swamp, where
the bird broke); in act III only pieces of it are left and the calls are half steps; at the core
it is whole again, its cracked Bb mended to B.
