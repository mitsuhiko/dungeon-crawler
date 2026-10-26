# Films

Short animated scenes that tell the story (`docs/story.md`). So far there is one, the opening: a
new game starts with it. It looks like the splash screen, the glass bird on its dark stage, and
it is made so that the next film is a new script and a few paintings, not new code.

## The style

Keep to these rules, so that every film looks like the others:

- **One stage, always the same.** Black, one light from above, a little mist, a black floor that
  mirrors everything (`src/render/stage.js`, shared with the splash screen). The splash's light is
  narrow, on the bird alone; a film's is wide (`BEAM` in `src/film/player.js`), over the whole
  stage. The
  camera does not cut. It only drifts a little and closes in slowly over the film.
- **The dark is the paper.** A sheet of dark paper stands at the back, and the light shows a faint
  grain of fibres on it. The pictures are **white, bluish ink on that black**, painted in as the
  film goes, glowing. They are not line drawings: they are brush and ink, soft washes that bleed.
- **One colour more, rarely.** Amber is for what burns: the stone, the comets.
- **Glass is what gets made.** Glass in the bird's look (thin bright edges), but in the ink's blue white, stands on
  the floor in front of the paper. It grows out of the floor, takes a picture's ink into it, where
  the ink hangs like ink in water, rises, turns and breaks.
- **It is alive.** Dust drifts in the light, wet ink throws sparks as it spreads and as it lifts
  off, the drawings float a little, and the glass turns. None of this is in a film's script: the
  player always does it.
- **People as the game draws them.** Faceless figures with a ball for a head and soft rounded
  limbs with round stubs for hands, like the hero and the villagers (`blender/figure.py`); who
  they are shows in what they wear and hold (goggles, a top hat, a blowpipe).
- **No text in the pictures.** The words are the narration and its subtitles, so a film needs no
  pictures per language. The one exception is a film's title, the game's name, which stays in
  English in every language and is drawn from the title's face, not painted (`text` below).

## The pieces

| | |
|---|---|
| `src/film/opening.js` | the opening: its layers, glasses and shots (a film is a file like it) |
| `src/film/films.js` | the films there are, by name |
| `src/film/player.js` | plays a film: the stage, the cues, the voice, the subtitles, skipping |
| `src/film/ink.js` | the ink: a layer's picture, its flow map, the shader that paints it in |
| `src/film/glass.js` | a glass box: growing, its ink inside, breaking into pieces |
| `src/core/film.js` | the rules, pure: the flow map (how ink spreads), when everything happens (`schedule`), the lines for the narration |
| `src/render/stage.js` | the dark stage, shared with the splash screen (`src/game/splash.js`) |
| `assets/film/<picture>.png` | the paintings: grey, white ink on black |
| `tools/inklayer.py` | makes a painting into such a picture |
| `tests/film.test.js` | the flow, the schedule, every film whole (its pictures there, its cues naming its layers) |

## Layers: painting as it happens

A layer is one painting, one thing (the Earth, the town, the rocket), standing on the sheet. A
picture is made of several layers, each painted in when its cue comes. That is the layering: a
picture is never one flat image. Its parts are separate paintings, placed by the script and timed
one by one.

A layer paints itself in along its **flow map** (`flowMap` in `src/core/film.js`): for each
pixel, when the ink gets there, from 0 to 1. The flow is the distance from where the brush starts
(the layer's `from`) *through the ink*, so the paint runs along the strokes the way wet ink runs
along wet paper. Through the black between two strokes it goes five times slower, so a speck near
a stroke still fills soon after it. It is worked out when the film loads, on a small copy of the
picture (192 pixels on its longer side). Nothing has to be painted by hand to animate it.

`from` is where the brush starts, in the picture (x right, y down, 0 to 1): a list of points
(`[[0.4, 0.9]]`, the thick start of the ring), or a side (`'bottom'`, the default: what stands on
the ground grows up from it). The ink can also leave the same way (`fade`): it goes back along
the flow and brightens as it lifts off.

The shader (`inkMaterial` in `src/film/ink.js`):

- behind the spreading front the ink is painted; just behind it, it is still **wet**: brighter,
  wobbling a little, running a little past its strokes (a blurred copy of the picture, broken up
  by noise);
- the front's edge is broken up by noise too, so it feathers like ink, not like a wipe;
- a **halo** of the ink's own light lies round it (a blurrier copy of the picture), coming and
  going with the strokes near it (`glowFlow`), not with the black;
- a grain like paper's, and the brightest ink goes white, as light does.

## Making a painting

The paintings are generated, one subject at a time, always with the same prompt, the subject at
its end:

> Sumi-e brush and ink painting, inverted: glowing white ink on a pure flat black background
> (#000000). Loose, expressive brush strokes with wet, bleeding, feathered edges, soft ink washes
> and some dry-brush texture. Monochrome, no colour, no text, no signature, no seal, no frame, no
> paper texture, no border, flat digital artwork filling the whole image (not a photo of a
> screen). One isolated subject in the middle with wide empty black margins all round. Subject:
> ...

With people in it, give the game's figures as a reference image
(`blender/previews/loadout-villagers-front.png`, rendered by `blender/loadout.py`) and put this
before "Subject:":

> The people are drawn exactly like the figures in the reference image: simple faceless figures
> with a big round ball for a head (no face, no eyes, no hair, no neck), a soft rounded body and
> thick rounded sausage arms and legs with round stubs instead of hands and feet, like smooth clay
> mannequins. Who they are is shown only by what they wear on top and what they hold. Only copy
> the figures' shapes from the reference, not its colours, lighting or grey background.

The opening's were made with Gemini 3 Pro Image ("Nano Banana Pro"). Describe one thing per
painting (a meteor; a little village on a floating chunk of ground; a glassblower seen from the
side). Where the subject should touch something, say so ("the rock is the head of the streak,
touching it"). Throw away a take that comes with a frame, a screen or a second subject. Then:

    uv run tools/inklayer.py painting.png <name>

This makes it grey, turns the generator's faint grey ground black, fades it out towards the edges,
cuts it down to the ink and writes `assets/film/<name>.png` (at most 1024 pixels). One painting can
be used by several layers (`image`: the three comets are one meteor).

## A film

```js
export default {
  name: 'opening',
  voice: 'glassmaker',   // who says its lines (tools/voices/)
  layers: {
    earth: { at: [-2.6, 5.0], h: 5.2, from: [[0.4, 0.9]] },
    stone: { at: [3.2, 7.0], h: 2.6, tint: 'amber', from: [[0.97, 0.03]] },
    comet2: { image: 'stone', at: [-4.6, 7.2], h: 1.7, tint: 'amber', turn: -12 },
  },
  glasses: {
    town: { at: -2.5, turn: 31, spin: 4 },
  },
  shots: [
    {
      id: 'stone',
      line: 'A stone is falling towards the Earth. ...',
      note: 'The first words ...',                 // for the translators and the voice
      instruct: 'Speak warmly and cheerfully ...', // how it is said (docs/narration.md)
      cues: [
        [0, 'light', { to: 1, for: 2.5 }],
        [0.3, 'paint', 'earth', { for: 3.2 }],
        ['30%', 'paint', 'stone', { for: 1.8, ease: 'in' }],
      ],
    },
    { hold: 5.6, cues: [ /* ... */ [3.5, 'black', { for: 2 }]] },
  ],
};
```

**The sheet** is 16 by 9 units: x from -8 (left) to 8, y from 0 (the floor) to 9. A layer stands
`at` its middle, `h` units high (its width follows its picture). `tint`: `ink` (the default) or
`amber`. `turn`: degrees, `flip`: mirrored. `text: 'The Glass Bird'` instead of a picture: the
words in the main menu's title face (Cinzel, spaced capitals), painted in from the left; never
translated. `screen: true`: not on the sheet but in front of the camera, so it stays where it is
in the picture whatever the camera does; `at` is then from the picture's middle, in sheet units of
a picture the sheet's height (the title: `at: [0, 0]`, in the middle).

**A glass** stands on the floor `at` units across (`z`: a little nearer or further), `turn`ed some
degrees (never square to the camera: a box seen flat looks like a hole), and `spin`s that many
degrees a second once it has grown. Once it is up, it moves in world units (a glass is 0.34
across).

**A shot** with a `line` lasts as long as its line is said (its clip, or without one as long as it
takes to read it) and `after` seconds more (0.45), plus `hold`. A shot without a line lasts `hold`
seconds. Since a line's length changes with the language, give cues in a line's shot in per cent
of the shot (`'30%'`) where they go with the words. Its `id` names its clip; `worn: true` plays it
thin, like an old recording.

**A cue** is `[when, what, ...whom, { more }]`. `when` is in seconds from the shot's start, or
`'NN%'` of it. `for` is how long it takes; `ease` is `in`, `out`, `inOut` or `linear`.

| Cue | | |
|---|---|---|
| `paint` | layer | its ink spreads in, along its flow (`ease: 'out'`: fast first, like a drop) |
| `fade` | layer | its ink goes again, the same way |
| `move` | layer | it slides `by: [x, y]` sheet units (the ark rises) |
| `break` | layer | cracks run through it, and it falls apart in pieces, each throwing sparks; `hold: [x, y, rx, ry]`, an ellipse of its picture, stays whole and falls as one (the ark's hull) |
| `grow` | glass | it grows up out of the floor, a bright seam where it is still being made |
| `lift` | layer, glass | the layer's ink leaves the sheet, flies into the glass and paints itself in there |
| `rise` | glass | it floats up `by` world units, and bobs from then on |
| `drift` | glass | it drifts `by: [x, y, z]` world units, turning (`spin` degrees a second more), `fade`d to that much (the far ones) |
| `crack` | glass | a crack runs round it (`across`: which way), flashes and holds |
| `shatter` | glass | it breaks, struck `from: [x, y, z]`; its ink scatters like a drop in water |
| `lights` | glass | night falls in it (its ink `dim`s), lights come on in it one by one, smoke rises |
| `bubble` | glass | a small bubble of star-glass with a light in it rises `from: [x, y, z]` (world) into it, and goes in with a glint (a recording) |
| `vanish` | glass | its glass goes clear and is gone; its ink stays |
| `closer` | glass | the camera goes closer to it, `by` 0 to 1 (0.95: it fills the picture) |
| `light` | | the light (and the glass and the stage with it; the ink shines by itself) `to` a level |
| `crackle` | | the recording's crackle and hiss `to` a level (`src/audio/film.js`) |
| `knock` | | a soft knock, as of something far off hitting glass |
| `black` | | to black: the film is over once it is, and the game comes up out of it in `reveal` s |

## The voice

A film's lines are voiced like the narrator's (`docs/narration.md`): `tools/narration.mjs` says
them too (`filmLines` in `src/core/film.js`), each its own clip, `film.<film>.<shot id>`, in the
film's `voice` rather than the narrator's. The German is in `src/i18n/de/story.js`. After changing
a line, run `node tools/narration.mjs` (`--only film.` for just the films) and check what it says
(`transcribe_file` for English, the `audio-transcription` skill for German). Without its clips a
film still plays, with subtitles only, each shot as long as reading its line takes.

The player loads the clips with the pictures (`voiceClip` in `src/game/narrator.js`), so the
schedule knows how long each line really is. Each line starts a quarter of a second into its shot,
through the voice bus, with its subtitle.

## In the game

The opening plays when a hero goes into a world nobody has been in yet (`start` in
`src/game/menu.js`). The world loads behind it and waits (`state.film`: nothing moves, the
narrator waits too), the music waits, and nothing of the game is drawn. A click or a key asks
"Click again to skip"; a second one skips; Esc skips at once. Afterwards the town comes out of the
black. Not with the dev tools, not in the guide's game window, and never with `?film=0`.

To look at a film while making it (every film, by its name in `src/film/films.js`):

- `?film=opening` plays it over the main menu, or over the world with `?dev=1`. Opened from the
  address bar the browser has no sound yet, so it waits for a click ("Click to begin"), and then
  plays with its voice;
- `&at=12` starts 12 seconds in (everything before is done at once), and `&hold=1` stops there, to
  look at one moment (no click, no voice);
- with `?dev=1`, `/film opening` in the chat box plays it now, `/film opening 40` from 40 seconds
  in (the film names complete);
- `window.__game.film('opening', { at: 40 })` plays it from the console, and
  `window.__game.filmNow()` says how far it is and which lines it has voices for.

## A new film

1. Write the lines (two short sentences at most each) and their German, with a note and an
   instruct each.
2. Paint its layers (above), one subject each, and run `tools/inklayer.py` on each.
3. Write the script, a file in `src/film/`, and name it in `src/film/films.js`.
4. Look at it (`?film=<name>`, `&at=`), and move the layers until the picture sits.
5. `node tools/narration.mjs --only film.<name>.`, and listen.
6. `npm test`.
