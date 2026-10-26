# Writing music for The Glass Bird

Read this before you write or change a song in `music/`. The technical side (player, moods,
files) is in `docs/music.md`; this file covers how the songs should sound and how to write them.

## The sound of the game

- **Dark, mysterious and glassy.** The songs grew out of the title song (`title.scrim`, The
  Glass Bird), which grew out of a test of Ramin Djawadi's Westworld theme on our glass: minor
  keys, a simple tune you can hum (a kid's toy tune) over a ticking ostinato, held notes and
  empty bars that leave room, and glass under everything. Each place keeps an instrument or two
  of its own (a fiddle, a harpsichord, an anvil), but over a glass core (below).
- **The story.** The glass bird (`docs/story.md`) is whole in the town and the first act,
  breaks at the bottom of the second (the swamp) and is in pieces in the third; at the core it
  is glued back together. The tune and the bird's calls follow it (below).
- **Slow and layered.** Mostly 56 to 96 bpm, often in the title's 6/8. The music is a bed you explore over, not a
  foreground track. Long loops (16 to 32 bars) so it doesn't wear thin.
- **Every voice plays in almost every bar.** The game switches voices on and off as the
  danger changes, so a voice that has just joined has to be heard within a beat or two. No
  `_` silent bars, and no voice that waits half a pattern for its entrance. Short rests
  inside a bar are fine. The bird's calls (and cymbals, gongs, breaking glass) are the exception.
- **Simple, because the synth is simple.** This is a small Web Audio synth, not an
  orchestra. Clear lines, triads, steady rhythms. Dense runs, thick chords and many
  sustained voices in the same register turn to mush.

## Moods

The game picks a mood from what is going on around the player (`src/game/music.js`), and
each mood names the voices that play in it. Moods don't have to stack. Like Wii Play
Tanks, a mood can strip the song down as well as add to it: when danger is sensed, the tune
drops out and only the bass, the pad and a pulse remain.

| Mood | When | Character | Overworld voices |
|---|---|---|---|
| `explore` | nothing going on | the song itself: tune, harmony, gentle motion, the bird's calls | lead bassoon ost pad bass bird |
| `treasure` | a chest within 6 cells, no enemy around | wonder: no drums, no bass, sparkle on top | ost pad bird wonder |
| `sense` | a live enemy within 8 cells, not after you | suspense: the tune drops out, the ostinato cracks, the drums lead | crack heart toms shaker pad bass bowl |
| `rise` | an enemy chasing you from afar | the tune comes back over the drums and a light kit | sense - bowl + lead kick snare |
| `fight` | an enemy after you within 4 cells, or blows traded in the last 6 s | driving low ostinato, battle drums, accented horn, breaking glass | rise - heart - shaker + horn drive war smash |
| `boss` | a guardian after you (or hurt and close) | the flute leaves, horn carries the tune, choir and gong | fight - lead + choir gong |

The mood rises at once and falls back once the calmer reason has held for 1 to 5 seconds.
Joining voices come in on the next sixteenth, and pick up notes already under way, so a
switch is heard within about 0.2 s. Leaving voices fade out from the next beat.

Moods are written as comments, so the score still pastes into the jukebox. A word is a voice,
the name of an earlier mood (take its voices), or `-voice` (drop it):

```
# mood explore:  lead harp strings tuba glock
# mood treasure: harp strings glock wonder
# mood sense:    toms timpani shaker pulse strings glock
# mood rise:     sense lead harp tuba kick snare
# mood fight:    rise -harp -glock horn brass crash
# mood boss:     fight -lead choir gong
```

`explore` is required. A missing mood falls back: boss to fight, fight to rise, rise to
sense, sense and treasure to explore. A simple song can stop after explore, sense and fight.

Guidelines:
- Give each mood its own voice set, so every switch is heard. A voice that only
  plays in one mood (`wonder`, `choir`, `gong`) gives that mood its own color.
- Keep the bass and the harmony (tuba, strings) in every mood except treasure, so the song
  never loses its ground.
- `explore` has to sound finished on its own and keep moving. A chord held for four bars
  with nothing else on top feels like silence.
- `sense` is suspense: cut the tune down to a fragment at most (a sparse bell) and let the
  drums carry it: toms, timpani, a shaker, a low pulse. Thinner and more nervous than
  `explore`, not louder. Those drums can then stay through `rise` and `fight`, which
  add the tune and the band on top.
- Write a mood's voices so they sound good together, and check the moods one by one
  (see the checklist).

## A boss's own song

A boss may have a song of his own (`core/bossmusic.js`, `music/gusto.scrim`): it plays in his
arena from the moment you come in, as long as he lives, and its moods are his fight's phases,
not the six above. The score names them, the first being the one before he fights:

```
# moods: lurk phase1 split phase2 gone
# mood lurk:   choir tuba box bell heart
# mood phase1: ost tuba choir horn organ kick snare taiko timp crash
```

The game switches at once when the phase changes. A phase can be short (Gusto's split lasts
1.8 s, his vanishing 1.3 s): write those moods from voices that sound all the time (held
chords, a cluster, a timpani roll), so they are heard the moment they join.

A **sting** marks the moment a mood begins: a pattern of its own, played once from the next
sixteenth, over the loop. Its voices play only in stings, never in a mood (their channel
stays open):

```
# sting phase2: three
voice hitgong gong vol=0.45
pattern three
hitgong | X... .... .... .... |
```

Use stings for what the loop can't do on cue: a gong when three of him appear, a brass hit
when the fight starts, a whoosh when he vanishes. Keep them to a bar.

A boss song can be faster than the rest (Gusto's is 150), and its fiercer phases can double
the drums (snare on every beat, sixteenth hats) instead of changing the tempo.

## Keep it simple

- Up to about 20 voices in a score, but at most about 12 in any one mood. One drum sound
  per drum voice.
- Keep registers apart: tuba/bass in octaves 1 to 2, pads around octaves 3 to 4 (set
  `center=`), lead in 5 to 6, glock and bells in 6.
- Write chords by name (`[Em]`, `[C/E]`, `[Dsus4]`) and voice them with `center=`.
- Sustained voices (strings, pad, choir) want `att=` of 0.2 or more and a low `vol`.
  Plucked and struck ones (pizz, harp, glock) carry the rhythm.
- Leads: one note per beat or slower for most of it, an eighth or sixteenth figure now
  and then. Leave breathing room at phrase ends; the accompaniment fills it.
- Keep the kit light in `rise` (kick on 1 and 3, soft `o` ghost notes) and save the brass
  and crashes for `fight` and `boss`.
- A voice can join in the middle of a phrase, so long notes are fine (they pick up
  mid-note), but a voice that only hits now and then (crash, gong) won't mark the
  moment a mood starts.
- Cymbals and gongs may sit out bars (one hit every four bars); everything else plays in
  almost every bar.
- Reuse material: `%` repeats a bar, `pattern A2 from A` copies a pattern and swaps a few
  lines, `loop A A2 B A2` sets the form, `A+2` transposes.
- Keys: stay near the title's A minor (with its Bb and G#): A or D minor, or A minor's notes
  centred elsewhere (E Phrygian, E Phrygian dominant, F Lydian, A Phrygian). Go further only
  where a place needs it (the volcanic depths' D Phrygian, the abyss's chords a tritone apart).

## Tricks that work

What the songs in `music/` use, from the title song and from listening closely to Golden Sun:

- **The glass core.** Every song has, under its own instruments: the bird's call (`bird`,
  crystal), glass harmonica chords (`pad`), a fretless bass, crystal sparkle for `treasure`
  (`wonder`), and for `sense` a cracked ostinato (`crack`), a glass heartbeat (`heart`,
  `glasstap`) and a singing bowl; glass breaking (`smash`, `shatter`) is the crash.
- **The bird's call.** A crystal grace note falling onto two notes a step apart, ringing
  (`A6 A5+B5----------`), in the bars the tune leaves empty or holds. Whole, the step is wide
  (a whole step); where the bird is broken it narrows to a half step (`A5+Bb5`).
- **The rocking ostinato.** The root and the step above it, in eighths (`A2!- A2- B2- A2!- A2- B2-`):
  the bird's interval inside the pulse. Cracked for `sense`, the step is a half step.
- **A bass that harmonizes.** The bass does not double the tune or only play roots: one or two
  notes a bar, mostly a third or sixth under the tune, far below, falling back on the chord
  where the tune rests.

- **Echo voice.** A second voice on the same instrument plays the lead a sixteenth to a
  dotted eighth later, at a third of the volume, panned to the other side. It gives space
  for nothing. Shift the lead's lines by hand: start with a rest of the delay, and continue
  a note across a bar line with `-` at the start of the next bar.
- **The lead for the fight.** `voice horn horn oct=-1` carries the tune an octave down, so
  `boss` can drop the lead and still have the tune. Re-articulate long notes and accent the
  start of each bar for a more urgent call; keep the exploration lead unchanged.
- **Combat-only motion.** Every dungeon score has a `drive` ostinato and `war` drum voice
  reserved for `fight` and `boss`. Keep the tempo, but use accented eighths, galloping
  sixteenths and short gates to make combat feel faster. Replace the gentle arpeggio or
  light percussion rather than stacking everything: at most 12 voices play at once.
  Use the place's own sound (a guitar in the badlands, a marimba in the swamp, clipped strings
  in the nests and the abyss); keep 6/8 and 3/4 where written.
  Battle drums fill every fourth bar, brass stabs start on the downbeat, and both new
  voices attack throughout every bar so a mid-phrase mood change is heard quickly.
- **Colour in the arpeggio.** Add the 2nd or 6th to a broken chord (`E3- B3- E4- F#4- G4- B4-`),
  and lean on one mode's own chord: Dorian's major IV, Lydian's raised 4th, Phrygian's flat 2nd.
- **An ostinato against the bar.** Accents every 3 eighths in a bar of 8 (`D3!- A3- D4- F3!-
  A3- D4- E4!- A3-`) or a six-note cycle in a 4/4 bar keep a loop from sounding square.
- **A drone with `=`.** One note held for 8 bars (`D2+A2--------------- | = | = | = |`) under
  changing chords gives the old, dark places their weight; a joining voice picks it up mid-note.
- **Each place its own `sense` drums.** Toms and timpani are the default, but a woodblock
  gallop (badlands), a ticking hi-hat over a tom heartbeat (nests), pickaxe woodblocks
  (mines) or conga and guiro (swamp) say where you are even with the tune gone.
- **The game's motif.** The title's toy tune opens on scale degrees 1 2 3 5 4 (A B C E D), and
  the songs open on it in their own mode, so they belong together. How much of it is left
  follows the bird: whole in the town and act I, varied in act II, in pieces in act III (A Bb C,
  then E; single notes like shards), whole again at the core.

## Format cheat sheet

```
title / composer / about     text
tempo 112   beats 4   steps 4 (sixteenths: 16 steps a bar)   swing 0   reverb 0.3
voice NAME INSTRUMENT  vol= pan= rev= gate= att= rel= center= trans= oct= glide= bright=
pattern NAME [from OTHER] [tempo= beats= steps= swing=]
  NAME | bar | bar | ...     one line per voice; several lines of the same voice continue it
  mute NAME ...              silence a voice copied with from
play intro                   once at the start
loop A A2 B A2               forever after; A+2 transposes, A*2 repeats
```

Melodic bars: a note takes one step plus one per `-`: `D5---` is a quarter note at
`steps 4`. `.` is a rest (`.---` a quarter rest), `C4+E4+G4` or `[C]` a chord, `!` louder,
`?` softer, `~` glides from the previous note. A bar alone: `%` repeats the last bar, `_` is
silent, `=` holds the last note through the bar. Every bar has to add up to exactly
`beats * steps` steps.

Drum bars: one character a step, `X` accent, `x` hit, `o` ghost, `.` rest; spaces are
ignored (`x.o. x.oo x.o. xoxo`).

Melodic instruments: steeldrum marimba vibes celesta glock xylophone musicbox bell organ
pipe strings pad choir voices brass trumpet horn tuba flute clarinet oboe bassoon accordion
fiddle harp guitar banjo harpsichord pizz upright fretless synbass timpani chip sine square
saw triangle, the game's glass instruments: glassharp crystal bowl, and its theremin.

Drums: kick snare rim hat ohat ride crash shaker tamb conga tumba bongo bongolo clave block
cowbell guiro tomlo tommid tomhi bodhran timbale tri clap gong thunder surf, and the game's
glass drums: glasstap chimes shatter.

The glass instruments and the theremin are the game's own (added to `vendor/scrimshaw/`), the
glass ones for a world inside glass cubes. The Scrimshaw Jukebox does not know them; listen in
`tools/player.html`.

- `glassharp`: a glass harmonica, a pure tone that swells in and slowly wavers, with a faint
  rub. Sustained: chords (`att=` 0.3 or so) or a slow counter-line.
- `crystal`: FM glass, a bell-like strike melting into a long pure ring. A lead or arpeggios
  in octaves 5 and 6.
- `bowl`: a struck singing bowl, its ring beating slowly. One stroke a bar or two, octaves 3
  and 4: tolls and drones.
- `glasstap`: a knuckle on the glass, a high tink; a light pulse like `tri` or `rim`.
- `chimes`: a few glass wind chimes (C pentatonic, so keys around C, F, G and A, D, E minor),
  different each hit; every few bars.
- `shatter`: breaking glass, a crash for `fight` and `boss` accents.
- `theremin`: a near-pure tone with a wide, slow vibrato from the start, a ghost singing. Give
  the voice a long `glide=` (0.2 to 0.3) and `~` its notes so it slides between them; half
  notes and slower, in octaves 5 and 6.

Good fits for this game: flute, oboe, clarinet, horn, trumpet, brass, strings, pad, choir,
harp, pizz, glock, musicbox, bell, celesta, tuba, fretless, timpani, kick, snare, tomlo,
crash, gong, tri, and the glass instruments. Avoid chip, square, saw, steeldrum and the latin percussion unless a
place calls for it.

## Example

A smaller song than the overworld: ten voices, all playing in every bar of every pattern.
It has no treasure or boss voices, so those moods fall back to explore and fight.
`music/overworld.scrim` is the full example with all six moods.

```
title    Morning on the Kingsmeadow
composer Claude
about    The banners are up and the dew is still on the grass as the party sets out across the meadow. A flute march over oom-pah tuba, pizzicato strings and a field snare.
tempo    112
beats    4        # 4 beats per bar
steps    4        # sixteenth notes, so every bar holds 16 steps
swing    0
reverb   0.3

# mood explore: pizz tuba strings glock lead
# mood sense:   pizz tuba strings kick
# mood rise:    explore kick snare
# mood fight:   rise horn trumpet crash
voice lead    flute    vol=1.0  pan=-0.1
voice trumpet trumpet  vol=0.75 pan=0.1
voice horn    horn     vol=0.7  pan=0.25
voice pizz    pizz     vol=0.55 pan=0.3  gate=0.5 center=G4
voice strings strings  vol=0.35 pan=-0.3 center=D4 att=0.2
voice glock   glock    vol=0.35 pan=0.4  rev=0.5
voice tuba    tuba     vol=0.85 gate=0.7
voice kick    kick     vol=0.6
voice snare   snare    vol=0.45 pan=0.1
voice crash   crash    vol=0.25 pan=-0.2

pattern intro
trumpet | G4- G4 B4 D5--- B4- D5- G5--- | F#5--- E5- D5- E5------- | G4- G4 B4 D5--- G5- F#5- E5--- | D5--------------- |
lead    | .------- G6--- D6--- | A6------- F#6------- | .------- G6--- E6--- | F#6------- A6------- |
horn    | B4------- D5------- | A4--------------- | B4------- C5------- | A4------- F#4------- |
pizz    | .- [G]- .- [G]- .- [G]- .- [G]- | .- [D]- .- [D]- .- [D]- .- [D]- | .- [G]- .- [G]- .- [C]- .- [C]- | .- [D]- .- [D]- .- [D]- .- [D]- |
strings | [G]--------------- | [D]--------------- | [G]------- [C]------- | [D]--------------- |
glock   | G6--- .--- D6--- .--- | F#6--- .--- A6--- .--- | G6--- .--- E6--- .--- | F#6--- .--- D6--- .--- |
tuba    | G1------- D2------- | D2------- A1------- | G1------- C2------- | D2--------------- |
snare   | X.oo x.oo X.oo x.xx | % | % | oooo oooo xxxx XXXX |
kick    | X... .... x... .... | % | % | X... X... X... X... |
crash   | X... .... .... .... | x... .... .... .... | % | % |

pattern A
lead    | B5-- G5 D5- G5- A5-- B5 D6--- | A5------- F#5- E5- D5--- | E5- G5- B5- E6- D6--- B5--- | C6--- B5- A5- G5------- |
lead    | B5-- G5 D5- G5- A5-- B5 D6--- | E6--- D6- C6- E6--- G5--- | C#6--- B5- A5- G5- A5- B5- C#6- | D6------- A5- F#5- D5--- |
trumpet | .------- B4-- B4 D5--- | .------- A4-- A4 D5--- | .------- G4-- G4 B4--- | .------- G4-- G4 C5--- |
trumpet | .------- B4-- B4 D5--- | .------- C5-- C5 E5--- | .------- C#5-- C#5 E5--- | D5-- D5 D5-- D5 A4-- A4 F#4--- |
horn    | D4------- G4------- | F#4------- A4------- | G4------- B4------- | E4------- G4------- |
horn    | D4------- G4------- | G4------- C5------- | E4------- C#5------- | D5------- A4------- |
pizz    | .- [G]- .- [G]- .- [G]- .- [G]- | .- [D]- .- [D]- .- [D]- .- [D]- | .- [Em]- .- [Em]- .- [Em]- .- [Em]- | .- [C]- .- [C]- .- [C]- .- [C]- |
pizz    | .- [G]- .- [G]- .- [G]- .- [G]- | .- [C]- .- [C]- .- [C]- .- [C]- | .- [A7]- .- [A7]- .- [A7]- .- [A7]- | .- [D]- .- [D]- .- [D]- .- [D]- |
strings | [G]?--------------- | [D]?--------------- | [Em]?--------------- | [C]?--------------- |
strings | [G]?--------------- | [C]?--------------- | [A7]?--------------- | [D]?--------------- |
glock   | .--- G6--- .--- D6--- | .--- F#6--- .--- A6--- | .--- E6--- .--- B6--- | .--- E6--- .--- G6--- |
glock   | .--- G6--- .--- D6--- | .--- E6--- .--- C6--- | .--- C#6--- .--- E6--- | .--- F#6--- .--- A6--- |
tuba    | G1--- D2--- G1--- D2--- | D2--- A1--- D2--- A1--- | E2--- B1--- E2--- B1--- | C2--- G1--- C2--- G1--- |
tuba    | G1--- D2--- G1--- D2--- | C2--- G1--- C2--- G1--- | A1--- E2--- A1--- C#2--- | D2--- A1--- F#1--- A1--- |
snare   | x.o. x.oo x.o. xoxo | % | % | % |
snare   | % | % | % | x.o. x.oo xxxx XxXx |
kick    | X... .... x... .... | % | % | % |
kick    | % | % | % | X... .... X... X... |
crash   | X... .... .... .... | x... .... .... .... | % | % |
crash   | X... .... .... .... | x... .... .... .... | % | % |

# A2 copies A; here the horn doubles the flute tune an octave lower
pattern A2 from A
horn    | B4-- G4 D4- G4- A4-- B4 D5--- | A4------- F#4- E4- D4--- | E4- G4- B4- E5- D5--- B4--- | C5--- B4- A4- G4------- |
horn    | B4-- G4 D4- G4- A4-- B4 D5--- | E5--- D5- C5- E5--- G4--- | C#5--- B4- A4- G4- A4- B4- C#5- | D5------- A4- F#4- D4--- |

pattern B
lead    | E6------- D6- C6- G5--- | D6------- .------- | C6------- B5- A5- E5--- | B5------- .------- |
lead    | A5--- C6--- F6--- E6- D6- | E6------- G5------- | G5--- A5--- D6--- C6--- | A5------- F#5- G5- A5- C6- |
trumpet | .------- C5-- C5 E5--- | .------- B4-- B4 D5--- | .------- C5-- C5 E5--- | .------- B4-- B4 E5--- |
trumpet | .------- A4-- A4 C5--- | .------- G4-- G4 C5--- | .------- A4-- A4 D5--- | D5-- D5 D5-- D5 C5-- C5 A4--- |
horn    | E4------- G4------- | D4------- G4- A4- B4- G4- | C4------- E4------- | B3------- G4- F#4- E4- D4- |
horn    | F4--------------- | E4--------------- | D4------- G4------- | F#4------- C5------- |
pizz    | .- [C]- .- [C]- .- [C]- .- [C]- | .- [G/B]- .- [G/B]- .- [G/B]- .- [G/B]- | .- [Am]- .- [Am]- .- [Am]- .- [Am]- | .- [Em]- .- [Em]- .- [Em]- .- [Em]- |
pizz    | .- [F]- .- [F]- .- [F]- .- [F]- | .- [C/E]- .- [C/E]- .- [C/E]- .- [C/E]- | .- [Dsus4]- .- [Dsus4]- .- [Dsus4]- .- [Dsus4]- | .- [D7]- .- [D7]- .- [D7]- .- [D7]- |
strings | [C]?--------------- | [G/B]?--------------- | [Am]?--------------- | [Em]?--------------- |
strings | [F]?--------------- | [C/E]?--------------- | [Dsus4]?--------------- | [D7]?--------------- |
glock   | .--- G6--- .--- E6--- | .--- D6--- .--- B5--- | .--- E6--- .--- C6--- | .--- B5--- .--- G6--- |
glock   | .--- A6--- .--- F6--- | .--- G6--- .--- E6--- | .--- A6--- .--- G6--- | .--- F#6--- .--- C6--- |
tuba    | C2--- G1--- C2--- G1--- | B1--- D2--- B1--- G1--- | A1--- E2--- A1--- E2--- | E2--- B1--- E2--- B1--- |
tuba    | F1--- C2--- F1--- C2--- | E2--- C2--- G1--- C2--- | D2--- A1--- D2--- A1--- | D2--- A1--- C2--- F#1--- |
snare   | x... .... x... ..o. | % | % | % |
snare   | % | % | % | x.o. x.oo xxxx XxXx |
kick    | X... .... x... .... | % | % | % |
kick    | % | % | % | X... .... X... X... |
crash   | X... .... .... .... | x... .... .... .... | % | % |
crash   | X... .... .... .... | x... .... .... .... | % | % |

play intro
loop A A2 B A2
```

## A film's score

A film's score (`music/films/<film>.scrim`, `docs/film.md`, `docs/music.md`) is played by the
film's `music` cues, not by moods: one `# mood explore:` naming every voice, and a `loop` listing
the patterns, are only there for `npm test` and the player. How long the film's shots take
changes with the language, so write it in stretches:

- **A fixed pattern** for each shot without a line (they never change length): the moments the
  picture needs the music for. Count where the picture's cues fall in its bars (the opening's
  comets break the ark at 1 s, the seventh step of a bar at 67 in 6/8).
- **A bed** (`then`) under the words: bars that can follow each other over and over and be cut
  after any of them, and a `last` pattern that leads from any of them into what comes next. Keep
  out of the voice's way: no tune (a ghost of it at most, a note a bar), the pulse an octave above
  the voice, the bass far below; the film plays it at a `level` (0.3 to 0.4) under the words.
- The film makes its own sounds (a knock, breaking glass): leave them room rather than doubling
  them.

## Checklist

1. Write the score in `music/<name>.scrim` with `# mood` comments (at least `explore`).
2. Every voice plays in nearly every bar. `explore` alone sounds finished, and each mood
   sounds different from the one below it.
3. `npm test`: every score has to compile with no errors, use every voice it declares, and
   put every voice in some mood (or a sting). Errors name the line and bar (usually a bar with the wrong
   number of steps).
4. Listen: open `/tools/player.html` (`npm run serve`), which plays the score with the game's
   synth and switches moods and voices; or paste it into the
   [Scrimshaw Jukebox](https://tools.simonwillison.net/scrimshaw-jukebox) (every voice, no
   moods); or run the game with music on (M) and hold a
   mood from the devtools console with `__game.musicMood('sense')` (`__game.musicMood()`
   lets go, `__game.musicInfo()` shows what plays).
5. A new song: set it as a theme's `music:` in `src/themes/` (or add a special case to
   `songFor` in `src/game/music.js` and `SONGS` in `src/themes/index.js`; a boss's goes in
   `src/core/bossmusic.js`), and add it to the song table in `docs/music.md`. `npm test`
   fails on a score in `music/` that no place plays.
