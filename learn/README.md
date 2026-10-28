# The kids' guide

An interactive guide to how The Glass Bird works, written for children around 12, in English and
German. It goes from the big ideas down to the real code. The grown-up design notes are in
`docs/`; this is the friendly version of the same knowledge.

```sh
npm run serve        # then http://localhost:8000/learn/
```

The guide reads the game's code and modules, so it needs the server (not `file://`).

## When you change the game

Slides say which code they explain, and `learn/stamps.json` remembers what that code
looked like when the slides were last checked. Above every definition a slide explains, the
game's code carries a marker:

```js
// learn: combat.html#arc-code #hit-test (see learn/README.md)
export function inSwordArc(p, enemy) {
```

When you change such a definition, finish the game change first, then:

1. `npm run learn` (or `npm test`) lists the slides that explain code that changed.
2. Read those slides in both languages and fix what no longer matches. Code shown with
   `data-code` and numbers shown with `data-val` update themselves; the words around them
   do not.
3. `npm run learn -- --stamp` accepts the code as it is now. It also rewrites the markers and
   the written fallbacks of `data-val` numbers. If you reviewed only some of the slides, name
   them: `--stamp combat.html#arc-code`; slides that explain the same code are noted as outdated.

If the slides should wait, `npm run learn -- --defer` (or `--defer page.html#slide ...`)
accepts the code but notes the slides as outdated in `stamps.json`, with the commit the change
was made on (`git diff <commit>` shows it); the guide then shows a "may be out of date" note on
them. A note stays until that slide is reviewed: `--stamp page.html#slide` clears it, a plain
`--stamp` for other code does not. Either way `npm test` passes again, so the guide never blocks
a game change, and nothing goes stale silently: `npm run learn` lists the noted slides.

Small fixes to the words belong in the same change as the code. A bigger rewrite can wait:
defer it, and catch up on the noted slides later, on their own.

Never edit markers or `stamps.json` by hand; the tool owns them.

## How it is built

Plain HTML, CSS and ES modules, no build step, like the game.

| File | What |
|---|---|
| `index.html` | the map: the rooms, the detail level picker (`map.js`) |
| `nav.js` | makes the guide one long-lived page: links between its pages swap `<main>` (see below) |
| `decks.js` | the list of rooms in order, their titles in both languages, the game depth (theme) each borrows its look from (its name: the game's, `deck.js` themeName) |
| `lang.js` | picks the language before the page is drawn: the reader's choice (or `?lang=`, the game's link), else the browser's; the game's words (`src/i18n/`) follow it |
| `deck.js` | the engine every page loads: slides, quick bar, levels, scroll mode, language switch, glossary tips, live code and values, demo loading; sets each page up as it comes and takes it down as it goes |
| `refs.js` | finds a definition in a source file, and fingerprints it (used by `deck.js` and the tool) |
| `crawl.js` | reads the game's import graph from `src/main.js` and its worker, for demos that show the code's structure |
| `stamps.json` | fingerprints of the code the slides explain; slides noted as outdated |
| `kids.css` | the look, taken from the game's `style.css` |
| `<room>.html` | one room: `<main class="deck">` with `<section class="slide">` slides; its `<head>` has the import map for three.js, so demos can draw items from their models (`src/render/itempictures.js`), as the game does |
| `words.html` | the glossary; `<a class="w" href="words.html#seed">` anywhere shows its entry on hover |
| `demos/*.js` | interactive demos, loaded when they scroll into view |
| `img/` | screenshots of the game, and `model-*.jpg`: copies of Blender previews (`node tools/preview-images.mjs`) |
| `audio/` | the voices the sound room plays and shows: samples and lines said by the game's TTS models, and `samples.json`, what the models made on the way (`uv run tools/learn-voices.py`; docs/narration.md, "In the kids' guide") |
| `tutor/` | the Teacher: an AI tutor in a side panel (see below) |
| `../tools/learn.mjs` | the check / `--stamp` / `--defer` tool |

## Two languages in one file

Every piece of text is a pair, English first:

```html
<p lang="en">Every cube is a room of <b>16 by 16</b> squares.</p>
<p lang="de">Jeder Würfel ist ein Raum aus <b>16 mal 16</b> Feldern.</p>
```

Pair whole blocks (`p`, `li`, `h2`, `td`, `figcaption`, `q` ...), or `<span lang>` pairs inside a
shared element. Everything else (slides, demos, code, images) exists once. Attributes take a
`data-de-` twin: `alt="..." data-de-alt="..."`; the title is `<title data-de="...">`. Demos use
`tr('English', 'Deutsch')` from `deck.js`. The tests fail on a text without its partner.

The game speaks German too (src/i18n/, docs/i18n.md), and the guide calls things what the game
calls them: the German text says "Blutviper", "Ungewöhnlich", "Wächter-Spinne", "Aufträge", with the
words of the glossary (`src/i18n/glossary.js`: Würfel, Tiefe, Level, Monster, Wächter ...). Where
the guide only names a thing, let the game say it: `<span data-name="Blood viper">Blood viper</span>`
shows the game's name in the page's language (the written one is the fallback). `npm run i18n`
(and `npm test`) fails on an English name of the game's things in the German text. Names that are
the same in both languages (Stunder, Gusto, the world names) stay as they are. Code and its
comments stay as they are.

## What belongs in the guide

Teach ideas that would survive a rewrite of the game (the game loop, seeds, search, state
machines, how the parts fit together), and show this game's code as the example. Leave out
clever fixes for this game's own problems (a rendering workaround, a single tuning trick); the
grown-up notes in `docs/` are the place for those. The guide teaches; it does not teach
prompting. Specific numbers come live from the code (`data-val`, `data-code`), not from the text.

## Writing slides

- Every slide has a detail level: `data-lv="1"` the big idea, `2` how it works, `3` the real code.
  Within a room, go from 1 to 3. The last slide of a room is level 1 (a short summary or the
  room's big takeaway), since `deck.js` puts the room's end card there: the way on to the next
  room and back to the map. The quick bar also leads on: doors to the previous and the next
  room on either side of the slides; on the last slide the next arrow (and the right arrow key)
  goes into the next room, on the first slide the back arrow (and the left arrow key) into the
  previous room, at its last slide (`room.html#end`).
- Link down with `<a class="deeper" data-lv="3" href="#slide-id">`, across rooms with
  `<a class="portal" href="room.html#slide-id">`, and words with `<a class="w" href="words.html#id">`.
- Say what a slide explains: `data-src="src/core/enemies.js#SPIDER src/game/enemyai.js#decide,act"`
  on the `<section>`. A reference is `path#name`, `path#a,b` or a whole file `path`; a name is a
  function, class, const, method or Python def (`#header` is the comment a file starts with).
- Real code: `<pre data-code="src/core/combat.js#inSwordArc"></pre>` shows the definition, read
  from the game when the page opens, so it is never out of date. Prefer it over copying code.
  A shortened excerpt is `<pre data-src="path#name"><code>...</code></pre>` (escape `<` and `&`);
  other code is `<pre data-label="...">`. In a narrow column, `class="wrap"` wraps long lines.
- Names of the game's things: `<td data-name="Pointy">Pointy</td>` shows the game's own name for it,
  in the page's language (demos: `gameName('Pointy')` from `deck.js`, or the game's own `displayName`,
  `enemyName` ...).
- Numbers: `<b data-val="src/core/constants.js#RUN_SPEED">2.8</b>` shows the game's value,
  formatted for the language (`data-fmt="pct"`: 0.17 as 17%). The written text is the fallback;
  `--stamp` keeps it right. Use it for values the code exports.
- A journey: `<ol class="steps journey">` with `<li data-at="game" lang="en">` pairs next to a
  `<div class="demo real" data-demo="parts">`; the parts demo lights up the part (folder of `src/`)
  of each step.
- Short sentences, the reader's own words, one idea per paragraph. Explain a term the first
  time, or link it to the glossary.

## Writing demos

A demo is a module with a default export `mount(el)`, which may return a function that stops
it (a song that plays, say) when its page is left; a slide asks for it with
`<div class="demo" data-demo="name">`. Add `class="real"` when the demo runs the game's own code
(it is labelled "REAL GAME CODE"). `deck.js` exports `canvas(el, w, h)`, `loop(el, fn)` (ends when its page is left; runs
only while visible), `html(el, s)`, `t` (as `tr` in demos) and `lang`. A demo that takes keys
sets `el.dataset.keys`, so the arrow keys do not turn the slide. Load files relative to the
module (`new URL('../img/x.jpg', import.meta.url)`), not the page.

Demos that show the code's structure (which files import which, who uses a field) read it live
with `crawl.js` instead of listing it, so they cannot go out of date.

Prefer importing the game's pure modules (`src/core/`, `src/world/`, `src/cubegen/`,
`src/themes/`) over copying them. When a demo has to copy game logic (it needs the game state,
or it is 2D), say where it comes from in its first comment.

## One long-lived page

Every page of the guide is a whole HTML file, but in the browser the guide is one page that never
reloads: `nav.js` catches links between the guide's pages, fetches the page, and swaps in its
`<main>`, title and theme (back and forward work too). So what lives outside `<main>` runs on
across rooms: the Teacher and the game window (in the guide's language: `index.html?lang=`). Scripts in the fetched page do not run; `deck.js`
knows every kind of page (rooms, the map, the word book) and sets it up in `enter()`, and
`leave()` takes it down: bars, listeners, demos. A reload or a deep link still loads the page
the ordinary way.

## The Teacher (the tutor)

Every page has an "Ask" button that opens the Teacher: an AI tutor that answers questions about the
game by asking questions back (the Socratic way), one small step at a time. It runs in the browser
on [pi-durable](../vendor/pi-durable/VERSION), Pi's durable agent harness, in one conversation for
the whole guide.

With every message it is told about the page (`tutor/state.js`): the room, slide, detail level and
language, what the reader did since their last message (slides, rooms, demo buttons and sliders),
text they selected, the demos on their slide, and the game window. The slide's text and the room's
slides only when they changed.

It can look (slides, demos, the game's code and `docs/`, the glossary), move the reader
(`navigate`) and point at things (`highlight`), and show real code in its panel (`show_code`). It can also open the real game in a window next to
the guide that stays open across rooms (`tutor/game.js`: `../index.html?dev=1` in an iframe of
the same site; the keyboard goes to the game only while it has focus, which a click into it gives
and a click on the guide takes back, and the window shows which). And it can run its own JavaScript (`run_js`) in the guide or in the game, with
full access: the page, the demos, the game's modules (the same ones the demos use, or the running
game's), and the running game's `window.__game`. It decides whether the reader sees the code.

To show things in the game, the game has teaching helpers, `window.__game.teach`
(`src/game/teach.js`, `teach` in `run_js`): drawings over the world (pins, labels, arrows, rings,
slices, squares, which can follow the hero or an enemy), lenses that draw the game's own rules
as they work (`src/game/lenses.js`: the sword's reach, what enemies see and hear, the paths they
plan, the grid, the routes), the baked light alone (`lightview`: the fixed lamps' light, the sun's shadow, the
lightmap's texels), pause, step and slow motion (`src/game/pace.js`), and changing the
game's numbers with a way back (`src/game/tune.js`: every value it changes is put back by
`untune()`; the game's tables are plain objects so they can be changed). `teach.reset()` undoes it
all; the game window's line in the `<page>` block says what is on.

| File | What |
|---|---|
| `tutor/tutor.js` | the button and the panel; loads the agent (about 1 MB) only when the panel opens |
| `tutor/agent.js` | the harness, the `guide` extension, the conversation, the notebook |
| `tutor/prompt.js` | how the Teacher teaches and what it can do: its instructions |
| `tutor/tools.js` | its tools: `read_slide`, `look_at_demo`, `look_at_game`, `read_code`, `show_code`, `search_code`, `search_guide`, `look_up_word`, `navigate`, `highlight`, `run_js`, `game`, `note` |
| `tutor/state.js` | what it is told about the page with every message |
| `tutor/game.js` | the game window |
| `tutor/page.js` | rooms and slides as text, the reader's slide, the glossary |
| `tutor/files.js` | a file system in IndexedDB for pi-durable's JSONL storage |
| `tutor/models.js` | which model, and how the key gets there |
| `tutor/markdown.js` | the answers as safe HTML |

Everything is kept in the browser: the conversation in IndexedDB, settings in `localStorage`
(`kids.tutor.*`). Every question, answer and tool call is stored before it shows, so a reload in
the middle of an answer loses nothing: the page finishes it when it is back. Only one tab runs the
Teacher at a time (a Web Lock); another tab offers to take it over.

It needs a Radius, Anthropic or OpenAI API key, one of:

```sh
RADIUS_API_KEY=... npm run serve      # or ANTHROPIC_API_KEY / OPENAI_API_KEY: the dev server
                                      # adds the key; the browser never sees it
```

or a key pasted into the Teacher's settings, kept in that browser only and sent straight to the
provider. The settings also pick the model, show what it has spent, start over, or forget everything.

When a slide changes, the Teacher needs no update: it reads the pages and the code live. When you
add a room, nothing to do either. Change `tutor/prompt.js` for how it teaches.

`vendor/pi-durable/pi-durable.js` is built from a Pi checkout (`node tools/vendor-pi-durable.mjs
<pi checkout>`), like three.js it is checked in.

## Tests

`tests/learn.test.js` checks the rooms, that every text has both languages, links, anchors,
images and demo modules, that every name a demo imports from the game is still exported, and
`tools/learn.mjs`'s check: references resolve, fingerprints, markers and written values
are current. `tests/tutor.test.js` runs the Teacher on a scripted model (its storage, tools, and
finishing an answer after the page closed); `tests/browser/tutor.js` does the same in a real
room opened with `?dev=1`, with every tool, the game window and moving on to the next room.
