# Notes for agents

See `README.md` for the layout and how to run things.

## Translations

`src/i18n/languages.js` lists the languages and how each keeps up (`docs/i18n.md`). When you change
or add English text, translate it in the same change into the languages kept with every change
(English and German: game and guide). The ones that catch up later (Indonesian, game only) are
left for their own changes: do not translate into them unless asked.

## Narration

The narrator's lines (`src/core/narration.js`, German in `src/i18n/de/story.js`) are pre-rendered
with Qwen3-TTS (1.7B CustomVoice, in the speaker embedding of a voice cloned from a reference
recording, `tools/voices/`), into `assets/narration/` (`docs/narration.md`). When you add or change a
line, its text or its German, also run `node tools/narration.mjs` (needs `uv` and the voice's
recording; the first run downloads about 9 GB of models): `npm test` fails while a clip rendered
here is missing or its text changed. A change to a voice, a filter, an instruction or `PIPELINE`
does not render anything again by itself: only `--stale` (or `--force`) does, and only when asked
(it takes long). `node tools/narration.mjs --check` lists what is out of date. For now the clips and the
manifest are not committed (`assets/narration/` is in `.gitignore`); the game only shows the
subtitles without them. Every line is said in `glassmaker` (`tools/voices/`, committed, with
`child`, which the robot's voice `robot` is made from: `docs/narration.md`, "Made voices"); the
ones tried out are `tools/voices/experiment_<voice>` (ignored). Do not commit the clips or an
experiment unless asked.

- Check what you rendered. The `transcribe_file` tool only understands English; for German use the
  `audio-transcription` skill with `--language de`. If a clip says the text wrong, try other takes
  (`node tools/narration.mjs --takes 4 --only <id> --lang <lang>`), listen or transcribe them, and
  pin the good one as the line's `seed`; or reword the line.
- A recorded line never says a player's name: give a line with parameters `forms` (e.g.
  `SIBLING`), never a name.
- Only the languages in `VOICES` (`tools/narration.mjs`: English, German) are voiced; do not add
  Indonesian (Qwen3-TTS does not speak it).
- How a line is said: performance tags in its text (`[sad]`, `[whispers]`, `[sighing]` ...: the
  table `TAGS` / `POINT` in `tools/narration.mjs`) or its `instruct` (plain vivid English). Both
  are instructions to CustomVoice, never shown (`docs/narration.md`, "Instructions"). Keep the
  English's tags in the German. Strong instructions pull the voice off: listen.

## Blender previews

`blender/previews/` is local output and ignored by Git: never commit renders from it.

- To see a model, render its preview. Every `blender/<x>.py` names its headless command at the top
  (`Blender -b --python blender/<x>.py -- ...`; on macOS `Blender` is
  `/Applications/Blender.app/Contents/MacOS/Blender`). Most scripts take the preview path or an
  output directory as arguments, and write into `blender/previews/` by default.
- The full commands also export `assets/` and save the `.blend` files. If you only want to look,
  give the script scratch paths (e.g. under `/tmp`) for the GLB, the `.blend` and the output
  directory, so nothing in the repository changes.
- The guide (`learn/img/model-*.jpg`) and the docs (`docs/img/`) show a few previews as small
  JPEG copies. If you change a model that one of them shows, render its preview into
  `blender/previews/` and refresh the copy: `node tools/preview-images.mjs [name ...]` (its
  `IMAGES` table lists which preview goes where). To show a new preview in the guide or the docs,
  add it to that table; do not link to `blender/previews/`.
