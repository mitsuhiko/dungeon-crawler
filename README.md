# The Glass Bird

A browser dungeon crawler made of 16x16-cell cubes stacked into themed depths.
Plain ES modules and a vendored three.js; no build step.

**[Play it in your browser](https://mitsuhiko.github.io/dungeon-crawler/)**

<p>
  <img src="learn/img/town.jpg" alt="The town cube" width="49%">
  <img src="learn/img/fight.jpg" alt="Fighting on a floating island" width="49%">
</p>

This game is AI generated and was made together with my kids. It comes with interactive live
docs that explain how the game works, from the big ideas down to the real code:
**[read the guide](https://mitsuhiko.github.io/dungeon-crawler/learn/)**.

## Layout

- `index.html`, `style.css`, `src/`: the game.
  - `src/core/`: pure rules and data (constants, combat, items, inventory, ...);
    `src/core/gear/` is the weapon generator (rarities, affixes, names, drops, enchantments;
    `docs/loot.md`) and armor (`docs/armor.md`, its models `blender/armor.py`); `src/core/crafting.js`
    is the town's Enchanter and Smith working on weapons and armor (the Smith sells armor too,
    `src/core/shops.js`).
  - `src/world/`: the world graph and everything shared between cubes (layout, WFC, faces,
    falls across faces, sites, town plan, the trial rooms' plan), plus the worker that owns it.
    Trial rooms (`docs/trials.md`): planned in `src/world/trials.js`, built in `src/cubegen/trials/`,
    run by `src/game/trials.js` (rules in `src/core/trials.js`).
  - `src/cubegen/`: builds one cube's map from the spec `world/` hands it. Files named like
    a `world/` file (`cascades`, `spouts`, `sites`, `town`) carve that shared decision into the cube.
  - `src/themes/`: per-theme data: palettes, lighting, generator settings, structure materials;
    each theme belongs to one of the story's three acts, and each world shows half of each act's
    themes, picked from its seed (`themes/depth.js`).
  - `src/physics/`, `src/render/`, `src/game/`: movement, drawing and game state/flow.
    Click to move (`src/game/orders.js`, `docs/clickmove.md`) finds its way over stairs, up and down
    ladders and over the jumps the hero can make (`src/physics/playernav.js`, `src/physics/leaps.js`),
    and walks through the portals and doors clicked (`src/game/ways.js`).
    `src/game/teach.js` (`window.__game.teach`) draws over the world, shows the game's rules
    (lenses), pauses / steps / slows time and tunes numbers with a way back, for the guide's tutor.
  - `src/net/`: playing together (hosting in the Esc menu, joining in the main menu, up to four
    players): a room code, PeerJS between the host and each guest, the others' poses,
    following each other through portals and one player's enemies shown to the others in its
    cube (`docs/online.md`).
  - The splash screen (`src/game/splash.js`, its sounds `src/audio/splash.js`): before the main
    menu the glass bird (`blender/glassbird.py`) waits in the dark for the first click or key, is
    struck and breaks in slow motion, and everything fades to black into the menu. Not with
    `?dev=1`, `?seed=` or in the guide; `?splash=1` shows it anyway, `?splash=0` never.
  - The films (`src/film/`, `docs/film.md`): the opening, played when a hero goes into a new world.
    On the splash screen's dark stage (`src/render/stage.js`), white ink paints itself in on dark
    paper (generated paintings, `assets/film/`, made by `tools/inklayer.py`, each spreading along
    its strokes), and glass grows, takes the ink in, rises and breaks. Narrated like the narrator,
    in the glassmaker's voice, and scored with the title song (`music/films/`), fitted to how long
    the lines take in each language. `?film=opening` plays it, `&at=12&hold=1` stops at a moment.
  - The look of the menus (`docs/ui.md`): the bird's faceted teal glass with an amber core, on the
    menus, the inventory and the HUD (`style.css`, the panels' facets `assets/ui/facets.svg`).
  - Saves (`src/core/save.js`, `src/game/save.js`): up to three heroes and eight worlds,
    apart, in `localStorage`; each hero remembers its world, goes into any other, a friend's too;
    every seed has its own name (`src/core/names.js`, `docs/saves.md`).
  - Quests (`src/core/quests.js`, `src/game/quests.js`, the inventory's Quests tab in
    `src/game/questpanel.js`, U): the villagers give quests, shared by everyone in the world and
    saved with it (`docs/quests.md`).
  - The beginning (`src/core/intro.js`, `src/game/intro.js`, `docs/story.md` "The beginning"): a
    new world comes up at noon; the hero, empty-handed, finds the glassmaker's glass floating over
    the town's plaza (`src/render/glassbubble.js`), which plays his recording and opens the town's
    gate, and his old sword stuck in the ground in the merchant camp, which opens the camp's gate to
    the road.
  - The robot (`src/core/robot.js`, `src/game/robot.js`, its view `src/render/robot.js`, its model
    `blender/robot.py`; `docs/story.md` "The robot"): the first time the hero is out of the town a
    little clockwork of star-glass comes flying up and says hello; from then on it follows them
    along their way, a little behind, through gates and doors and into other cubes, catching up
    once they stop, and lights the way. It is in no fight and nobody's target.
  - The narrator (`docs/story.md`, `docs/narration.md`): for now the glassmaker's recordings and
    the robot's hello, and when they play (`src/core/narration.js`), voiced ahead with Qwen3-TTS (1.7B CustomVoice, in a
    voice cloned from a reference recording, following instructions and the lines' tags) into
    `assets/narration/` by `node tools/narration.mjs`; `src/game/narrator.js` plays them as things
    happen, one after the other, with subtitles. The inventory's Memories tab
    (`src/game/memorypanel.js`) plays the ones heard again. The clips are not committed yet
    (`assets/narration/` is ignored): without them the game shows only the subtitles.
  - Skins (main menu: **Choose Skin**, like Choose World; the painter in `src/game/skineditor.js`):
    up to ten named skins in the browser's IndexedDB, each with a thumbnail of the hero wearing
    it; choose one (or none), paint on one, delete one, or paint a new one. The painter has a
    pen, color picker, closed-outline fill, eraser, rotation and zoom. Paint is a 2048² UV
    texture, not vertex colors; GPU projection carries strokes across UV seams without painting
    through the body. Fill refuses outlines with gaps. Save Skin needs a name and puts the skin
    on the hero; Cancel leaves it unchanged. Playing together the others see it (sent once, in
    pieces). See `docs/skins.md`.
  - Settings (`src/game/settings.js`, the menu in `src/game/settingsmenu.js`, from the Esc menu
    and the main menu; pages in tabs on the left):
    - General: the language (English, German or Indonesian, in a dropdown: `src/game/dropdown.js`;
      at first the browser's), the UI scale, the minimap's size (or none), the item names on the
      floor when hovered or always (X switches it too), the damage numbers, fullscreen (also
      Cmd+Enter on a Mac, Alt+Enter elsewhere: `src/game/display.js`); music on /
      off, the volume of everything, the music's, the sounds' and the narrator's, its subtitles, and
      quiet in the background
      (another tab or window in front; on at first, but not in the guide's game window).
    - Graphics: the frame rate cap (30, 60 or unlimited, `src/main.js`; 30 at first on touch
      screens), the render resolution (Auto: it follows the frame rate, or 50% to 100% of the
      screen's pixels: `src/render/resolution.js`), the anti-aliasing (Auto: 2x MSAA on high-DPI
      screens, 4x elsewhere, picked once; or off to 8x, `src/render/msaa.js`), the lighting's
      quality level (Auto, or Lowest to High: `src/game/quality.js`, `docs/lighting.md`), the
      particles; the camera (the overview or the close view behind the hero; Tab or C taps
      between them: `src/game/camera.js`, `docs/camera.md`), the zoom a game starts at, the close
      view's field of view; for comfort the brightness of the world and reducing motion (no camera
      kicks or shaking, a fainter red flash, nothing blinking; at first as the system says:
      `src/game/display.js`). Levels show Auto first, then from the least to the most.
    - Input: the close view's mouse look (speed, invert up / down: `src/game/mouselook.js`),
      clicking the floor to walk, inverting the wheel's zoom, and the keys. Every control is an
      action with a primary and a secondary key (`src/core/keybinds.js`: codes, so WASD keeps its
      place on any layout).

    Kept in `localStorage` as `crawler.settings`.
  - Languages (`src/i18n/`, `docs/i18n.md`): the English text in the code is the message
    (`tr('Resume')`), each other language a catalog from it (`src/i18n/de/`, `src/i18n/id/`; which
    languages the game and the guide want: `src/i18n/languages.js`), with the grammar a
    sentence needs (a noun's gender and case, plurals). What is kept or sent is words to say, so
    saves and friends work across languages. `src/i18n/glossary.js` holds the important words in
    every language, which the game and the guide both use. `npm run i18n` (`tools/i18n.mjs`, also
    in `npm test`) lists what is missing, unused or broken.
  - The chat box (Enter, bottom left; `src/game/console.js`): the chronicle of what happened,
    chat when playing together, and commands after a `/` that complete the game's items and
    enemies; with `?dev=1` the developer commands (`` ` ``, `/help`; `docs/console.md`).
- `assets/`: exported game data (meshopt-compressed GLB models, manifests, and item icons that only
  the guide uses: the game draws items from their models). The game loads assets only from here
  (and music from `music/`), each when it is first needed: the prop libraries are one file per
  prop set (`assets/props/`, `clutter/`, `themes/`), loaded with the enemy models a cube has
  before it is entered, and its shaders compiled ahead (`src/render/cubeassets.js`,
  `src/render/warmup.js`). These files are generated; do not edit them by hand.
- `music/`: hand-written Scrimshaw scores the game plays (`docs/music.md`). Before writing
  or changing a song, read `music/README.md` for the style, the layers and the format.
- `blender/`: authoring sources: Blender scripts and `.blend` files that export
  into `assets/`, Blender test scripts in `blender/tests/`. Their preview renders go to
  `blender/previews/`, which is not committed (see `AGENTS.md`); the few the guide and the docs show
  are JPEG copies in `learn/img/` and `docs/img/` (`node tools/preview-images.mjs`).
- `tests/`: `node --test` unit tests; `tests/browser/` holds integration checks
  that run from the game's devtools console (in English, `?lang=en`: some read what it says).
- `tools/`: dev server, the prop metadata generator, the GLB compressor (`compress-assets.mjs`;
  `glb.mjs` reads the GLBs for the tools and tests), the depth population measurement, the
  weapon drop tables (`node tools/loot-table.mjs`), the balance simulation
  (`node tools/balance.mjs`, see `docs/balance.md`), the enemy palette page
  (`/tools/palette.html`, see `docs/enemy-kinds.md`) and the iOS Safari probe in an Xcode simulator
  (`uv run --no-project tools/sim-probe.py --full`, see `docs/lighting.md`), and the menus' glass
  facets (`node tools/facets.mjs`, see `docs/ui.md`).
- `docs/`: design notes; `docs/assets/` documents the asset libraries.
- `learn/`: an interactive guide for children (about 12), in English and German (the German in the
  game's own words: `src/i18n/glossary.js`), from the
  big ideas down to the real code (`/learn/` on the dev server), with an AI tutor on every page
  (`learn/tutor/`, needs an API key, see `learn/README.md`). Code it
  explains carries a `// learn: ...` marker. After changing such code, run
  `npm run learn` (`npm test` runs it too): it names the slides to review; then
  `npm run learn -- --stamp`, or `-- --defer` to note them as outdated. See `learn/README.md`.
- `vendor/three/`: three.js (r186: `three.core.js`, which the world worker imports by path, and
  `three.module.js` with the renderer) and the addons in use (with the meshopt decoder for the
  GLBs, `addons/libs/`); `vendor/scrimshaw/`: the music score parser and synth;
  `vendor/peerjs/`: PeerJS for playing together, loaded only when someone hosts or joins;
  `vendor/pi-durable/`: Pi's durable agent harness and model access for the tutor, one bundle built
  by `node tools/vendor-pi-durable.mjs <pi checkout>`; `vendor/fonts/`: the type, from Google Fonts
  by `node tools/vendor-fonts.mjs` (`fonts.css` sets `--font-display`, Cinzel, for buttons, headings
  and labels; `--font-body`, Crimson Text, for the rest; `--font-mono`, IBM Plex Mono, only for code
  and the dev panel; canvas text takes the same faces from `src/render/fonts.js`).

## Running

```sh
npm run serve            # uv run --no-project tools/serve.py [port]
# http://localhost:8000/            the main menu: your hero, its world, joining a friend
# http://localhost:8000/?seed=123   straight into that world, nothing saved
#   (?dev=1 for dev tools: ` opens their commands; it skips the menu too, ?menu=1 shows it;
#    ?trial=flood puts a trial of that kind on every depth, docs/trials.md; the dev tools skip
#    the beginning, its glass and sword: &intro=1 plays it, docs/story.md)
# ?touch=1 forces the touch controls (docs/touch.md); ?lang=de or ?lang=en picks the language
# with RADIUS_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY set, the guide's tutor uses it through the server
npm run i18n             # what is left to translate (docs/i18n.md)
node tools/narration.mjs # render the narrator's new or changed lines (docs/narration.md)
npm test
```

In a git worktree the server and tests take `assets/` from the main checkout;
see `docs/combat.md`.

## Blender MCP (Pi)

Pi talks to Blender through the [Blender Lab MCP server](https://projects.blender.org/lab/blender_mcp).
With Node.js, git, [uv](https://docs.astral.sh/uv/getting-started/installation/), and
Blender 5.1+ installed, start Pi from the repository root. `.pi/mcp.json` runs
`tools/blender-mcp.mjs`, which automatically:

- Checks out the pinned server and addon revision into `.pi/blender_mcp/src/`
  and installs the server into a Python environment in `.pi/blender_mcp/venv/`
  (both ignored by Git).
- Reuses a running Blender that serves the addon, or opens a new Blender window
  with it. An installed and enabled copy of the addon is used as is; otherwise
  the project checkout is loaded for that session only, without saving it to
  your Blender preferences.

The first launch needs internet access. Keep the Blender window open. To update
the server, change `revision` in `tools/blender-mcp.mjs`; delete
`.pi/blender_mcp/` to rebuild everything.

The launcher detects standard Windows and macOS Blender installs, or uses
`blender` on PATH; `BLENDER_PATH` overrides that. It finds uv in `~/.local/bin`
or on PATH; `BLENDER_MCP_UV` overrides that. It reuses the first port in
9876-9885 that runs the addon and skips ports held by other servers; otherwise it
starts Blender on the first free one. `BLENDER_MCP_PORT` pins a single port. A
remote `BLENDER_MCP_HOST` requires an already running addon there; the launcher
will not start a local Blender for it.

Run `pi mcp list` to check discovery and ask Pi for scene information to verify
the live connection. Use `/reload` after configuration changes in an existing
Pi session. Keep the addon bound to localhost: it allows arbitrary Python
execution. Save your work first.

## Re-exporting assets

The Blender scripts export plain GLBs; `npm run compress-assets` (`tools/compress-assets.mjs`)
then compresses every one not compressed yet with meshopt (gltf-transform through `npx`: the
vertices are quantized, geometry and animation meshopt-encoded; `src/render/gltf.js` decodes them),
keeping each prop's exact bounds in its extras, and regenerates the prop metadata
(`src/core/propmetadata.js`, also `npm run prop-metadata`). A test fails on an uncompressed GLB.

```sh
Blender -b --python blender/props.py          # likewise character, spider, stunder, snake, octonaut,
                                              # fireface, triangle, firecat, shraps, spicy, wolla, wolk, mecked, tornado, gusto, mansk, sword
Blender -b --python blender/clutter.py        # libraries: clutter, items, town, town_trees
Blender -b --python blender/town_clutter.py   # the town's lamps, benches, well, carts ... (docs/assets/town.md)
Blender -b --python blender/tests/test_clutter.py
Blender -b --python blender/trials.py         # the trial rooms' parts (assets/trials.glb, docs/trials.md)
Blender -b --python blender/glassbird.py      # the glass bird, whole and in pieces (assets/glassbird.glb: the splash screen)
Blender -b --python blender/themes.py         # the alternative themes' library and every theme's
                                              # landmarks (assets/themes/; see docs/assets/themes.md)
npm run compress-assets                       # after any export, before committing
Blender -b --python blender/loadout.py        # the player with each kind of weapon and the
                                              # villagers (previews; -- --mounts solves the mounts
                                              # of weapons and worn / held things)
```
