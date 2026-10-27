# Narration

Status: the pipeline and the narrator are built. The lines ([story.md](story.md)) are rendered
ahead into audio files with a text-to-speech model, and the game plays them as things happen, one
after the other, with subtitles (`src/game/narrator.js`, "In the game" below). The lines so far are
the glassmaker's recordings (`RECORDINGS`: the beginning's, the glass on the town plaza and the
glass in the merchant camp, story.md "The beginning"; and his glass in the depths that have a
boss, a chapter a depth, story.md "His glass in the depths"), in the `glassmaker` voice, worn like
an old recording, which the inventory's Memories tab plays again ("The memories" below); and the
robot's, in its own voice, from its hello on (story.md "What the robot says"). His recordings
only ever come out of his glass: one plays when its bubble is found, never for coming somewhere or
doing something. He does not know where his glass comes to rest, so he never says what is there
(a town, a gate, the next one), only what is true wherever it came down. The old
narrator's lines (a grandmother remembering, for the town and the first three depths) went with the
old story; the moments they were said at stay, for the companion to come.

**The clips are not committed yet.** `assets/narration/` is in `.gitignore`: render them locally
(`node tools/narration.mjs`). Without them (no manifest, or a
clip missing) the game only shows the subtitles, each up as long as reading it takes, and the test
that the clips are current is skipped.

## Why ahead, not in the browser

The lines are a fixed table, so their audio can be made once and shipped like the other assets:
a few kilobytes per line, loaded when a line is said, no model in the browser. Generating in the
browser would mean downloading 200 MB or more per language and running it next to the renderer. Ahead
of time each line can also be listened to, and a bad take swapped for another before anyone hears
it. The cost: a recorded line cannot say a player's name (below).

## The voice

[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), its 1.7B base model
(`Qwen/Qwen3-TTS-12Hz-1.7B-Base`, Apache 2.0), in a voice **cloned** from a reference recording:

| Language | Model | Told it speaks | Voice | Cloned | Temperature |
|---|---|---|---|---|---|
| English | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | `English` | `glassmaker` | `embedding` | 0.7 |
| German | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | `German` | `glassmaker` | `embedding` | 0.7 |

(The base model takes the voice; CustomVoice says the lines in it: "Instructions" below.)

`VOICES` in `tools/narration.mjs` says this. Every language kept with every change
(`src/i18n/languages.js`: English and German) has a voice, which a test checks; the others
(Indonesian) show the narrator's words only. Qwen3-TTS also speaks French, Spanish, Italian,
Portuguese, Russian, Chinese, Japanese and Korean, not Indonesian.

A voice is a recording and its words: `tools/voices/<voice>.flac` (mono, 24 kHz; 10 to 30
seconds of one person talking, nothing else) and `tools/voices/<voice>.txt`, exactly what is
said in it (transcribe it, then check it by ear). To make a voice deeper, change the recording,
not the clips: the clone follows it, and says it without the artifacts a pitch shift leaves.
`experiment_glassmaker-low` is `experiment_glassmaker` 12% down
(`ffmpeg -i in -af "aresample=24000,asetrate=21120,aresample=24000,atempo=1.136364" -ac 1 -ar 24000 -sample_fmt s16 out.flac`),
and its clones come out 7 to 8% lower than `experiment_glassmaker`'s (the clone follows a little more than half
the shift: 13% down made them 10% lower, 14% 11%). Bass added to the recording carries over only
in part, and as boom: to make a voice fuller, use the `full` filter on the clips. The same voice speaks every language; in German
it keeps a little of its English. The model clones a voice one of two ways (`clone`):

- `embedding` (what we use): from the voice's speaker embedding alone. The voice, read in the
  model's own manner, like a reader.
- `context`: the model hears the recording and its words, then goes on in that voice with the
  line, so it takes the recording's manner too: its pace, its pauses, its tunes, the room. With
  a YouTube talk as the recording that means a talker's run-on sentences: pauses too short, and
  sentences that end going up, as if more were coming. It also said the German worse.

Compared on the same lines, the embedding's clips came out closer to the recording's voice by a
speaker-verification model (eight English lines, two takes each: 0.91 against 0.83, cosine), and
Whisper understood them better (22 clips, English and German: a word error rate of 2% against
10%, most of it the German).

### How a line is said

Sentence by sentence (`tools/narration.py`): the line is split after every `.`, `!`, `?` and
`…` (a closing quote may follow), each sentence is rendered on its own, so it ends like a sentence
that ends and not like one the next follows on from, its quiet trimmed, levelled (every sentence's
speech at the same loudness: an instruction, a whisper or a shout, changes how loud the model
speaks, and a line's sentences jumped by up to 10 dB; levelled, they stay within 0.5 dB), and they
are put together with a set pause after each: 0.55 s after `.`, 0.5 s after `!`, 0.6 s after `?` and 0.8 s after
`...` (`PAUSE`). Said in one go the model barely stops between sentences. Within a sentence the
model's own pauses stand: a comma, a colon. To make it stop longer somewhere, end the sentence
there (or trail off: `we... Never mind.`). The temperature (0.7, the model's own 0.9) makes the
takes a little steadier.

### Filters

A voice can go through a filter after it is said (`filter` in `VOICES`; `FILTERS` in
`tools/narration.py`):

- `old-radio`: the voice as if heard through an old valve radio, with static on top. A narrow
  band (380 Hz to 3 kHz) with a hump at 1.3 kHz, soft clipping, a signal that drifts a little;
  hiss about 24 dB under the voice, crackle (clicks and pops, nine a second on average) and a
  trace of 50 Hz hum, all the way through the clip, its pauses and a moment before and after
  (0.3 s, faded in and out).
- `robot`: the voice gone a little machine, and still recognisably itself. Half of it is the
  voice, two semitones down; the other half a vocoder that says its words on a buzz following
  the voice's own melody, but stepped from semitone to semitone, as a machine would sing it (on
  hiss where it hisses: s, f, t); then a faint metal ring (a 4 ms comb) and a slight warble (ring
  modulation at 55 Hz, a tenth). On the intro: the speaker-verification model still finds the
  voice in it (0.76, the clean voice 0.92), its melody is kept (a pitch spread of 2.2 semitones,
  the clean voice 2.0), and Whisper understands it. Tried and dropped: bit crushing, held
  samples and strong ring modulation (too harsh, no longer understood), and a vocoder alone on a
  fixed low hum (a monotone in which the voice was gone: 0.53, a spread of 0.2).

- `full`: the voice fuller, not boomier. Warmth and body in the low mids rather than bass (a
  gentle shelf under 200 Hz, +2 dB; a broad lift around 300 Hz, +2.5 dB; 1.5 dB less of the boxy
  700 Hz), the faint low harmonics of a warm amplifier (soft saturation, 15% mixed in) and gentle
  compression (2.5:1 from 10 dB under the loud parts) so it sounds close and dense. On the intro:
  1.8 dB more under 250 Hz, 2.4 dB more between 150 and 500 Hz, and peaks 2 dB closer to the
  voice's level; Whisper understands every word.
- `metal-monotone`: a machine's voice, still the speaker's: mostly monotone (40% of the melody
  left, snapped to semitones, by Praat's PSOLA), in a metal can (ring modulation at 50 Hz, 35%
  mixed in, and a ringing 1.6 ms comb, half mixed in). Nothing is added under it: the pauses
  stay silent.
- `stepped-vocoder`: the robot's voice ("Made voices" below): a clockwork toy, and easy to
  understand.
- `tone:<voice>`: the voice given another voice's tone: an EQ, third-octave band by band
  (63 Hz to 10 kHz, smoothed over three, at most 15 dB either way), that makes the clip's
  spectrum that of `<voice>`'s recording (its speech, the quiet left out). The clip's hash takes
  the target recording's along.

Tried and dropped: `defects`, a machine's voice with defects (a speaker grille, a tin can, a
digital edge, now and then a dropout, a stutter or a burst of crushed digits, under it a faint
buzz, hiss and crackle). Whisper understood every word and the speaker-verification model still
found `child` in it (0.82).

### Made voices

A voice can also be **made** from another's recording (`MADE` in `tools/narration.mjs`): the
recording can go through a `prepare` step (`PREPARE` in `tools/narration.py`) before the voice is
taken from it, and the made voice brings its filter along (unless `VOICES` or `--filter` say
another). There is one:

- `robot`: the robot's voice ([story.md](story.md)), `child` through `stepped-vocoder` (no
  `prepare`). `node tools/narration.mjs --say "..." --voice robot`; a line in it says
  `voice: 'robot'`: its hello does (`core/narration.js`, the moment `robot`).

**The robot's voice.** This is the configuration to produce the robot's lines with. The voice is
`child`, cloned as every voice is (its speaker embedding, said by CustomVoice), its line said
clean; only then the filter `stepped-vocoder` (`tools/narration.py`) makes it a machine, in this
order:

1. **Stepped**: its melody kept whole (none of its range taken away), but every pitch snapped
   to the nearest semitone and moved a semitone up (`retune(keep=1.0, step=1.0, shift=1)`,
   Praat's PSOLA), so it glides no more: it sings its sentences as a machine would, still with
   their rise and fall.
2. **Vocoder, a quarter**: three quarters of that voice, a quarter of it through the `robot`
   filter (a vocoder saying its words on a buzz that follows its stepped melody, heard up to
   600 Hz, mixed half and half with its own copy two semitones down; a faint 4 ms ring and a
   55 Hz warble).
3. **Speaker**: a small toy's, a band from 350 Hz to 5 kHz (2nd-order Butterworth) and 3 dB of
   presence at 1.8 kHz (a bell, Q 1).
4. **Ring**: a short 1 ms feedback comb (feedback 0.5) as loud as the voice, 35% mixed in.

Then it is levelled like every clip; 0.05 s of quiet before it and 0.2 s after, and nothing
added under it: the pauses stay silent. On a 16-second sample Whisper understood every word.
It was picked by ear from 15 filters, from none to `metal-monotone` (the try before it, too
robotic to understand easily); with the new `child` it was tuned again by ear, from 20 versions
of it (more or less vocoder, melody flattened or not, up or down, speakers and rings of other
sizes, a wobble, digital grit): the "toy robot" (the steps above) won over the one before it (a
third vocoder, the voice where it was, 200 Hz to 6 kHz, 2 dB of presence, a 1.6 ms ring at
0.6, 30%).

**The child's voice.** `child` is baked (below) from two voices, 70 / 30:

- `experiment_child-recording`: a child reading a short story three times (a voice memo); the
  most fluid of the three, 29.7 s of it. The first stumbled three times ("made made", "a ship,
  a big ship", "the its"), the third misread twice and hesitated 1.5 s; the second only said
  "high up high", and its pauses were the most even (none over 0.55 s). Its words are what it
  says, slips and all.
- `experiment_child-design`: a voice Qwen3-TTS made up (its VoiceDesign model,
  `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`, from "A young boy, about nine years old, reading a
  story aloud. A light, clear child's voice, gentle and earnest, unhurried."), saying the same
  story. Of six made up (a girl, a boy, a child; two takes each) the one whose speaker
  embedding was closest to the recording's (0.95, cosine) and whose pitch was nearest (278 Hz,
  the recording 208 Hz).

```sh
node tools/narration.mjs --bake child --voice experiment_child-recording:0.7,experiment_child-design:0.3 --say "..." --seed 1
```

It says the story as written, 31 s, at 220 Hz; of three takes the one closest to the recording
(0.978, cosine; the made-up voice 0.979) with the steadiest melody, every word right. Mixed
40 / 60 the made-up voice took over (0.96 like the recording, 0.99 like it) and too little of
the child was left.

What was learned on the way:

- The model takes a voice's traits from a recording (its pitch, its size), never its artefacts.
  Roughing up `child`'s recording first (a `prepare` of a 4.5 ms feedback comb, ring modulation
  at 70 Hz and samples held at 8 kHz, each about a third) moved the clone only a little: its
  speaker embedding stayed close to the plain one (0.98, cosine), its clones a little further
  from `child` (0.79 against 0.88), twice as much 0.73, half as much nothing measurable. So `PREPARE`
  is empty, and the machine has to be in the filter.
- Whisper understands every word through any of the filters tried (`robot`, `defects`,
  `metal-monotone` and the milder ones), so it cannot say how hard a voice is to follow: listen.

A voice can also be a **mix** of voices (`mix` in `MADE`, or `--voice experiment_glassmaker:0.7,experiment_lost-hearing:0.3`):
the model takes their speaker embeddings, weighted and averaged, so it speaks as someone
between them (embedding cloning only). There is one, `glassmaker-mix`: `experiment_glassmaker` and
`experiment_lost-hearing` half and half, through `tone:experiment_lost-hearing`.

How `glassmaker` was found: why `experiment_glassmaker` sounds so unlike `experiment_lost-hearing` (the
narrator's voice before), measured on the intro: mostly the tone. `experiment_lost-hearing`'s
recording went through a radio: almost nothing under 250 Hz (40 dB under
its loudest band), its weight at 300 to 600 Hz and a strong 1 to 5 kHz, so its clones are thin,
forward and bright (a spectral centroid of 760 Hz). `experiment_glassmaker` is a phone held close: most of
its weight under 300 Hz, 10 to 20 dB less between 1 and 5 kHz, so its clones are full and dark
(211 Hz). The speaker embedding carries that along, and so do the clones. The rest is the
person. How far each step goes (the speaker-verification model's likeness to each voice's
recording; Whisper understood every word of each):

| | like `experiment_lost-hearing` | like `experiment_glassmaker` |
|---|---|---|
| `experiment_lost-hearing`'s own clone | 0.92 | 0.54 |
| `experiment_glassmaker` | 0.54 | 0.97 |
| `experiment_glassmaker`, `tone:experiment_lost-hearing` | 0.55 | 0.74 |
| mixed 70 / 30, `tone:experiment_lost-hearing` | 0.58 | 0.71 |
| mixed 50 / 50, `tone:experiment_lost-hearing` (`glassmaker-mix`) | 0.70 | 0.66 |
| mixed 30 / 70, `tone:experiment_lost-hearing` | 0.81 | 0.59 |

A mix (or a voice through a filter) can be **baked** into a voice of its own: a recording of it
saying something, made like any clip but lossless, which is then cloned like a recording of a
person. `glassmaker` is `experiment_glassmaker` and `experiment_lost-hearing` 30 / 70 through
`tone:experiment_lost-hearing`, baked:

```sh
node tools/narration.mjs --bake glassmaker --voice experiment_glassmaker:0.3,experiment_lost-hearing:0.7 --filter tone:experiment_lost-hearing
```

It says the words of the first voice's recording (or `--say`), 29 s of them, into
`tools/voices/glassmaker.flac` and `.txt`. A voice taken from a recording of itself comes
back a little off (its speaker embedding at 0.986, cosine, to the mix's, whatever the take; a
longer recording, or steering the mix against the drift, did not get closer than 0.99), but its
clones need no mix and no filter: on the intro the speaker-verification model finds them 0.99
like the mix's own (filtered) clones, 0.79 like `experiment_lost-hearing` and 0.58 like `experiment_glassmaker`, the tone
within 2.5 dB band by band, and Whisper understands every word.

The tone alone takes the low end away and brings the mids up (a centroid of 600 Hz; still about
7 dB darker between 1 and 2.5 kHz, where the EQ's smoothing and its 15 dB limit hold it back)
and still sounds quite clearly like `experiment_glassmaker`; the mix moves the person, and with it the
rest of the tone (from 50 / 50 on, every band within 2 dB of `experiment_lost-hearing`'s).

The noise is seeded by the line's seed and text, so a clip is the same every time. A voice without a filter makes the same clips as before filters
were there; turning one on (or changing it: raise `PIPELINE`) leaves the clips made before as
they are until asked (`--stale`, "Running it"). To hear it
first: `node tools/narration.mjs --say "..." --voice child --filter old-radio`.

The voices kept are committed: `glassmaker`, which says every line (the narrator's and the
films'), and `child`, which the robot's voice is made from (`robot`). The ones tried out are named
`experiment_<voice>` and stay out of Git (`tools/voices/experiment_*` is in `.gitignore`), among them
the two `glassmaker` was baked from (`experiment_glassmaker`, `experiment_lost-hearing`). Without a
voice's recording the tool cannot render or check its clips, and says so. Whose voice each is, and that we may use it, has to be
settled before it ships, and then credited where the game credits things.

### Instructions

The lines are said by **CustomVoice** (`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`), in the cloned
voice, and follow instructions (`speaks` in `VOICES`). Of Qwen3-TTS's 1.7B models only the base
model clones a voice, and it takes no instructions; CustomVoice takes them, but speaks only its
nine speakers. Its speaker goes into the model as an embedding, though, in the very place the base
model puts a cloned voice's, and the two models share almost all their weights: given the
voice's speaker embedding (taken with the base model) instead of a speaker of its own, CustomVoice
speaks in the cloned voice and follows instructions. The trick is from
[gabriele-mastrapasqua/qwen3-tts](https://github.com/gabriele-mastrapasqua/qwen3-tts)
(`docs/custom-voices.md`, `docs/emotion-instruct-control.md`); Qwen's own model for it
(VoiceEditing) is announced, not out.

Measured on `glassmaker`, two sentences, two takes each (an emotion classifier, the
speaker-verification model's likeness to the voice's recording):

| | like the voice | length | emotion heard |
|---|---|---|---|
| base model (no instructions) | 0.95 | 6.3 s | sad 0.15, angry 0.15 |
| base model, told "sad" | 0.95 | 6.6 s | sad 0.26 |
| CustomVoice, no instruction | 0.91 | 5.8 s | neutral 0.64 |
| CustomVoice, "sad" | 0.83 | 7.9 s | **sad 0.64** |
| CustomVoice, "angry" | 0.90 | 6.1 s | **angry 0.36** |
| CustomVoice, "slow, like a grandmother" | 0.85 | 7.5 s | (28% slower) |
| CustomVoice, "whisper" | 0.72 | 7.3 s | (the voice drifts most) |

The cost: the voice a little less exactly (0.91 for 0.95), and further off the stronger the
instruction. Whisper understood every word of each. Vivid plain English works best ("Speak in a
sad, sorrowful tone, voice low and heavy, on the verge of tears"); settings do not ("Tempo: +20%"
does nothing, or the opposite). Every line goes through CustomVoice, with an instruction or not,
so the voice sounds the same in all of them.

Where a line's instructions come from, for each of its sentences:

1. its **performance tags** (below): from a tag on, until the next;
2. else the line's `instruct` (`src/core/narration.js`): `instruct: 'Speak slowly and softly.'`,
   for the whole line, in every language;
3. else the voice's `instruct` (`VOICES`), for every line (none for now: as it comes).

Every line has its `instruct`, written from its `note` (how it should feel), gently worded:
"Speak fondly, smiling.", "Speak in a hushed, spooky voice, like telling a ghost story."
The stronger the instruction, the further the voice drifts from the recording.

The speaker embedding is taken once per voice, with the base model, and kept in
`~/.cache/narration-voices/` (by the voice's recording and words, its weights in a mix, its
`prepare`); after that the base model is not loaded. To hear an instruction:
`node tools/narration.mjs --say "..." --instruct "Speak slowly and warmly."`.

### Performance tags

A line's text may carry tags (`TAGS` and `POINT` in `tools/narration.mjs`): `[sad]`, `[whispers]`,
`[very slowly]` ... before the words they colour, and `[sighing]`, `[laughing]`, `[gasp]` ... for
the one sentence after them:

```js
text: "[sad]Not all of them. I couldn't catch them all. [sighing]Some have gone cloudy.",
```

Each is an instruction (`[sad]`: "Speak in a sad, sorrowful tone, voice low and heavy, on the
verge of tears."); an event tag goes before the mood of the moment ("Begin with a weary sigh, then
speak softly. Speak in a sad ..."). A tag the table does not know is a problem (`npm test` fails).
They are never shown (`lineText` in `core/narration.js`, for the subtitle and the chronicle).
The German keeps the tags of the English (translate the words, not the tags). A tag in the middle
of a sentence cuts it there, with a short breath (0.2 s). CustomVoice reads a mood well; the events
(a sigh, a laugh, a gasp) it does now and then, not every time: listen.

A voice without `speaks` (said by the base model) does not voice them: the tool takes them out,
and a line with tags makes the same clip as without.

## The pieces

| | |
|---|---|
| `src/core/narration.js` | the lines: `{ id, on, when?, text, note, voice?, worn?, forms?, seed? }`, the moments they are said at (`MOMENTS`) and what picks them (`linesFor`); the glassmaker's recordings (`RECORDINGS`); the English text is an i18n message; its tags (`TAG`, `untagged`, `lineText`) |
| `src/i18n/de/story.js` | their German (`src/i18n/sources.js` lists the table, so `npm run i18n` wants it) |
| `tools/narration.mjs` | says every line in every voiced language and form, decides what to render, writes the manifest |
| `tools/narration.py` | renders: Qwen3-TTS cloning the voice, then trimmed, levelled, Opus by ffmpeg (uv script, its dependencies inline) |
| `tools/voices/<voice>.flac`, `.txt` | the voices cloned: a recording and its words (`experiment_*` not committed) |
| `assets/narration/<lang>/<clip>.opus` | the clips: Ogg Opus, mono, 10 kbit/s (from the model's 24 kHz); `<clip>` is the id, or `<id>.<form>` |
| `assets/narration/manifest.json` | per language and clip: its text (`text`, and with its tags `source`), seed, length in seconds and a hash of the settings that made it |
| `src/game/narrator.js` | the narrator in the game: hears the moments, queues the lines, plays the clips, shows the subtitles; plays a recording again for the memories (`hearAgain`) |
| `src/game/memorypanel.js` | the inventory's Memories tab: the recordings heard, to hear again |
| `tests/narration.test.js` | the table is well formed and translated, every line has a moment, every clip is there and current |
| `src/film/*.js` | the films' lines ([film.md](film.md)): voiced by the same tool, `film.<film>.<shot>`, in the film's own voice |

## A line

```js
{
  id: 'recording.glass.found',
  on: 'recording',          // the moment it is said at (MOMENTS)
  when: { part: 'glass' },  // (optional) what the moment must be about
  text: 'So my glass found someone. Good.',
  note: 'The first words of the bubble of star-glass ...',
  voice: 'glassmaker',      // optional: whose voice (tools/voices/), not the language's narrator's
  worn: true,               // optional: played like an old recording
  forms: SIBLING,           // optional (not on this line): { m: { sib: 'm' }, f: { sib: 'f' } }: two clips, .m and .f
  instruct: 'Speak low and calm.', // optional: how it is said ("Instructions"); its tags win
  seed: { de: 3 },          // optional: the take, by language or 'lang.form'; 0 when left out
}
```

- `id`: lowercase words joined by `-` or `.`; what the line is kept and sent under, and the file's name.
- `on`, `when`: when it is said (below, "In the game").
- `text`: a message like every other (`docs/i18n.md`), at most two short sentences (story.md's
  rules), written to be spoken: the German too.
- `forms`: one recording per set of parameters. A line with parameters must have forms that give
  every one of them; that is how the tool knows a line says no name. The names are the players'
  own, so a line that has to say one (the core's "Her name was ...") is not recorded: the subtitle
  says it.
- `instruct`: how the line is said, an instruction for the voice in plain vivid English, in
  every language ("Instructions" above); a tag in the text wins over it.
- `seed`: the TTS sampling. The same text, model, voice and seed give the same audio on the same
  machine (another kind of GPU, or the CPU, may make another take of it).

## Running it

Needs Node, [uv](https://docs.astral.sh/uv/), [ffmpeg](https://ffmpeg.org/) with libopus (it
encodes the clips) and the voice's recording (above). The first run
downloads the model (about 4.5 GB into the Hugging Face cache; no account needed). The model's
revision is pinned (`REVISIONS` in `tools/narration.py`), so after that it is loaded from the
cache without asking the hub, and an update upstream does not change the takes. A run starts in
about 8 seconds (imports and loading the model); after that a line takes about as long as it is
spoken on an Apple Silicon GPU (MPS) or with CUDA. On the CPU it works, slowly.
`NARRATION_DEVICE=cpu` (or `mps`, `cuda:0`) overrides the pick.

Three processes render at once (`--workers n` or `NARRATION_WORKERS`; one on the CPU, and not
more than half as many as there are clips). One process keeps the GPU less than half busy, as
most of its time goes to launching the model's many small steps; three render about two and a
half times as many lines a minute on an M5 Max, more do not help. Each holds its own copy of
the model (about 4.5 GB). Every clip is seeded on its own, so it comes out the same whichever
process says it. Batching the lines through one model would be faster still, but its sampling
would no longer be the clip's own: a take would depend on the lines said with it.

```sh
node tools/narration.mjs --check            # what is missing, changed or gone (exit 1 if any); counts the stale
node tools/narration.mjs --dry-run          # what a run would render and drop
node tools/narration.mjs                    # render it, drop clips of lines that are gone
node tools/narration.mjs --lang de --only boss.   # some languages / ids only (prefixes)
node tools/narration.mjs --force --only boss.gusto  # again, even if current
node tools/narration.mjs --stale [--only film.]     # also the clips made with other settings
node tools/narration.mjs --takes 4 --only boss.gusto [--lang de] [--first-seed 10]
node tools/narration.mjs --say "Any text." [--voice child] [--lang de] [--seed 2]
```

`--say` previews a voice: it says any text (sentence by sentence, as a line) in a voice of
`tools/voices/` (the language's own when left out) into `narration-takes/say/` in the temp
directory, and prints the path. To try a new voice, put its recording and words there and
`--say` something with it; to make it the narrator's, set it in `VOICES`.

`--takes` renders seeds 0 to 3 (or from `--first-seed`) of the chosen clips into the temp
directory, without touching `assets/`, and prints their paths. Listen, put the best one in the
line's `seed`, and run the tool again.

A clip is rendered again by itself only when what it says changed: its line's text in its
language, with its tags (the English or the German, a form), or its `seed`. Everything else is
rendered again only when asked: a clip **stale** was made with other settings (its voice, the
voice's recording and words, the model, temperature, a filter, the line's `instruct`, a tag's
instruction in `TAGS`, `PIPELINE`), which the manifest keeps as a hash of them (`hash`). A run
leaves the stale clips as they are, `--check` counts them without failing, and `--stale`
renders them again (with `--only` and `--lang`, some of them; `--force`: the chosen clips,
stale or not). So changing a voice or a filter, or raising `PIPELINE`, costs nothing until you
ask for it, and the clips may be a mix of settings until you do.

A take can run away (the model does not stop, or babbles): a clip is cut at a length its text
cannot need, and the tool says "ran to the limit: try another seed".

## Changing lines

1. Write or change the line in `src/core/narration.js`, with its note, and its German in
   `src/i18n/de/story.js` (`npm run i18n`).
2. `node tools/narration.mjs`.
3. Listen to what changed. A line the model says badly (a word swallowed, odd stress, a pause in
   the wrong place) gets another take (`--takes`), or a rewording; punctuation steers the pauses.
   To check a clip without listening, transcribe it, in its language (a Whisper model that knows
   German for the German).
4. Once the clips are committed (not yet, above): commit them and the manifest with the
   line. `npm test` fails while a clip rendered here is missing, changed or left over (not while
   it is stale).

## In the game

`src/game/narrator.js`. The game tells the narrator its **moments** (`narrate(moment, data)`):

| Moment | When | Data |
|---|---|---|
| `recording` | one of the glassmaker's recordings found (game/intro.js): all its lines | `part`: the recording (`RECORDINGS`) |
| `town` | close to one of the villagers (the town, the merchant camp) | `who`: the villager (`VILLAGERS` in `world/town.js`) |
| `camp`, `road` | the merchant camp; the first place on the road with enemies | |
| `wander` | a place not seen before, after a quiet while, no enemy about | `act`, `depth` |
| `theme` | a place of a theme (below the town) | `theme`: its id (`props`) |
| `depth` | a depth reached for the first time | `depth` |
| `foe` | an enemy of a species not met before comes after the hero | `species` |
| `fight`, `hurt`, `idle` | a long fight; health under 30%; standing about | |
| `kill`, `level`, `chest`, `loot`, `quest`, `horde`, `fall`, `home` | what they say | `kill`: `many` |
| `death` | the hero died (said once they are back) | `depth`; `boss`: the arena's, if he is still there |
| `guardian` | a side guardian's arena entered, or the guardian beaten | `what`: `near`, `beaten` |
| `arena` | a boss's arena entered while he still holds the well | `boss` |
| `boss` | his fight: it starts, an attack starts, a stage changes | `boss`, `what`: `start`, the attack's name, `split` (`stage`) |
| `beaten` | the boss beaten (after his jingle) | `boss` |
| `trial` | a trial room sealed, mastered, failed; come into one whose puzzle is not solved yet | `what` (`sealed`, `resolved`, `failed`, `puzzle`), `kind` |

Most come from where the game does that thing anyway (`game/flow.js` `settleIn` and `die`,
`game/enemies.js`, `game/trials.js` ...); the ones about what goes on around the hero (the
villagers, the enemies, a boss's attacks read off his attack clock, health, standing still) the
narrator looks for itself every frame. `MOMENTS` in `core/narration.js` says how each is told:

- **Once.** Every line is said once in a world. What was said is kept with the world
  (`run.told`, saved with it: `core/save.js`), so nothing is said twice by itself, and a world
  played again later goes on where it left off. A moment's lines are said in the table's order: the
  first one not told yet that fits (`when`), or for a scene (`all`: a recording, a depth, an
  arena, a boss beaten) every one that fits. What happens again and again (a death, a kill, a
  chest, standing about ...: `shuffle`) says the line that fits best (the one whose `when` says
  most: dying to a boss, his tip first), and of those the one marked `lead`, else one picked by
  the world's seed: every world hears them in another order.
- **The robot's only once it woke.** Its lines (`voice: 'robot'`, but its hello, which is how it
  wakes) are not said before its hello was, nor while its hello is still being said or waits
  (`robotMet`, `core/robot.js`), and an enemy met before that is not counted as met. Waking it cuts
  short whatever is being said (`game/robot.js` `wakeRobot`).
- **The robot paced.** It does not talk all the time (`ROBOT_REST`, `robotMayTalk` in
  `core/narration.js`): after one of its lines it keeps quiet a while before the next, by the
  moment's `pri`: 75 s before chatter (0), 40 s before what happens (1), 12 s before a boss's calls
  or a death (2); the story's scenes (3: its hello, a depth, an arena, a boss beaten) never wait.
  Nor is a line of its queued while another of its is being said or waits (but such a scene). A
  moment that comes while it must keep quiet says nothing and is not told: it may come later.
- **One at a time.** Lines wait their turn in a queue; between two lines a short pause. The most
  important goes first (`pri`: the story, then the bosses, then what happens, then chatter);
  what waited too long to still fit is left out (`ttl`: a boss's attack is old news in four
  seconds, a depth's lines wait as long as it takes). Chatter (`quiet`) only comes after a
  while of quiet, some (`calm`) only when no enemy is after the hero.
- **Cut short.** Players do not stand about to listen, so a scene of a moment that `cuts` (a
  recording) cuts short another of the same moment still going: its lines waiting are dropped,
  the one being said fades out (0.35 s) with its subtitle, and after the usual pause the new
  scene starts. Leaving a recording's place cuts it short too (`where` in `RECORDINGS`: the
  glass's is the town, its houses too, the camp's the merchant camp, his glass in the depths its
  depth; `arrived` in `game/narrator.js`). `cut(which)` cuts short whatever lines `which` picks, for whatever else
  should.
- **Told whole.** A scene of a moment that is `whole` (a recording) counts as told as a whole the
  moment it begins: all its lines go into `run.told` at once, even with the narrator off. Cut
  short, or never listened to, it is still all in the Memories, and it never comes back.
- **Paused with the game**: the Esc menu, the inventory and "You died" stop it mid-word; it goes
  on where it stopped (a death's line comes once the hero is back).

A line is looked up in the manifest of the language of the moment (`clips[lang][clip]`): no entry
(a language without a voice), or no audio yet (before the first click or key), and it is only
read, its subtitle up for as long as reading it takes. Its clip is fetched when it is queued and
plays through the voice bus (`src/audio/context.js`), the music turned down under it
(`duckMusic`), through a thin band like an old recording if the line is `worn` (his recordings,
like the film's worn lines). The subtitle (`#subtitle`, over the quick bar) shows the line in the
language of the moment, and it goes into the chronicle (kind `narration`). Settings: the
narrator's volume and the subtitles on or off (General, Sound).

The sibling's gender (`SIBLING` forms) should be the hero's (story.md, "What the game needs"
1); until heroes have one, the world's seed picks it. Playing together, every screen has its own
narrator, telling what happens there.

Not in the guide's game window; `?narration=0` turns it off. With `?dev=1`, `/narrate <id>` says
a line now, `/narrate forget` forgets what was said in this world.

Playing together, a recording one player sets off (a glass of his found: the town's, the camp's,
one in the depths) plays for everyone at once, cutting short what was playing there (`story` messages,
[online.md](online.md)).

### The memories

The inventory's **Memories** tab (`src/game/memorypanel.js`), next to the Quests, is there once the
glassmaker's first glass is found (or a recording was heard). It lists his recordings begun in this
world (`recordingsHeard`: a line of it in `run.told`; one begun is told whole, so all of it is
there however little was heard; in the story's order), where each was found (the town, the camp,
the road out of town, depth N: `foundText`), and all its words; **Listen** plays it
from the start (`hearAgain` in `src/game/narrator.js`), the line being
said lit up. The world stays paused meanwhile (the inventory is open): the voice plays on its own,
not through the queue, and stops when the panel closes or the tab changes.

The memories are the glassmaker's recordings only. The robot's lines are not in them, unless one
is marked to be (a recording of its own in `RECORDINGS`; none is yet).

## The films' lines

The films ([film.md](film.md)) are narrated too: `tools/narration.mjs` takes their lines with the
narrator's (`filmLines` in `src/core/film.js`). Each is a line like hers (an id, its text, a note,
an instruct, a seed), but said in the film's `voice` (the opening: `glassmaker`) and not at a
moment: the film plays it when its shot comes (`voiceClip` in `src/game/narrator.js`).
`--only film.` renders just them.

## Adding lines

A new moment for a line: its `on` and `when`, and if the game does not tell the narrator of it
yet, a `narrate(...)` where it happens (a key in `MOMENTS`). Another recording of the glassmaker's
in the depths: its id in its depth's chapter (`GLASS` in `core/glass.js`: a depth with a chapter
gets its glass spots by itself), an entry in `RECORDINGS` (`deep(id, title)`: where it is found
follows) and its lines (`recording(part, ...)`); one somewhere else, an entry with its own `found`
and `where` and a bubble of his glass in the game that sets it off when it is found
(`narrate('recording', { part })`, as `src/game/intro.js` does). The robot's lines are `says(on,
when, id, ...)`: `depth` (with its `depth`), `wander` (`depth`: a range), `theme`, `foe`
(`species`), `arena` / `boss` / `beaten` for its boss (the attack names are the boss's attacks'
`name`, `core/enemies.js`; a change of stage `split` with the `stage` it has then: Totnar's
counts up before, the others' after), `death` (`boss`, `depth`), `trial` (`what`, `kind`).
