// The Teacher's tools. It can look (slides, demos, the game window, the game's code and design
// notes, the glossary), show the reader real code in its panel (show_code), move the reader
// (navigate) and point at things (highlight), run its own
// JavaScript in the guide or in the game (run_js), open and steer the game window (game), and
// keep notes about the reader (note).
//
// The guide is one long-lived page (nav.js), so tools act on the page on screen. Tools that only
// read are "replay: safe": if the page is reloaded in the middle of one, it runs again. run_js and
// game change things, so they are not; after a reload they come back as interrupted instead.
import { Type, defineTool } from '../../vendor/pi-durable/pi-durable.js';
import { DECKS, local } from '../decks.js';
import { parseRefs, extract } from '../refs.js';
import { crawl, purpose } from '../crawl.js';
import * as nav from '../nav.js';
import * as page from './page.js';
import * as game from './game.js';

const ROOT = new URL('../../', import.meta.url);
const MAX_OUTPUT = 24000;
const cut = (s, n = MAX_OUTPUT) => s.length > n ? s.slice(0, n) + '\n[... cut here]' : s;
const text = (s, details) => ({ output: [{ type: 'text', text: cut(s) }], ...(details ? { details } : {}) });
const numbered = (lines, from) => lines.map((l, i) => `${String(from + i + 1).padStart(4)}| ${l}`).join('\n');
const deck = () => import('../deck.js').then(m => m.controls);   // not imported up front: deck.js sets up the page
const PAGES = [...DECKS.map(d => d.file), 'index.html', 'words.html'];

// the folders of the game the tutor may read, and which files in them are text
const READABLE = /^(src|docs|music|blender|tools|tests|learn|vendor\/scrimshaw)\/|^(README\.md|CONTRIBUTING\.md|index\.html|style\.css|TODO\.txt)$/;
const TEXT = /\.(js|mjs|py|md|html|css|json|txt|scrim)$/;
const cleanPath = p => String(p).trim().replace(/^\.?\//, '').replace(/^\/+/, '');

// a folder as the dev server lists it (tools/serve.py serves directory listings)
async function listFolder(path) {
  const html = await page.fetchText(path.endsWith('/') ? path : path + '/');
  return [...html.matchAll(/href="([^"?#]+)"/g)].map(m => decodeURIComponent(m[1])).filter(n => !n.startsWith('/') && !n.startsWith('.') && !n.includes('..'));
}
async function gameFiles() {
  const { files } = await crawl();
  return [...files.keys()].filter(p => !p.startsWith('vendor/')).sort();
}

export function createTools({ addNote, lang = page.pageLang() }) {
  const slideOf = async (room, id) => {
    const doc = await page.roomDoc(room), slides = page.slidesOf(doc);
    return { slides, s: id ? slides.find(x => x.id === String(id).replace(/^#/, '')) : null };
  };
  const whereNow = () => {
    const s = page.currentSlide(), all = page.slidesOf(document);
    return `${nav.here()}${s ? `, slide ${all.indexOf(s) + 1}/${all.length} #${s.id}` : ''}`;
  };

  const readSlide = defineTool({
    name: 'read_slide',
    description: 'Read a slide of the guide as text, in the reader\'s language, with its code and (on the page on screen) the state of its demo. Without arguments: the slide the reader is looking at. Slide "all" reads a whole room (long). Only you see the result; to talk about another slide, take the reader there with navigate.',
    parameters: Type.Object({
      slide: Type.Optional(Type.String({ description: 'slide id, like "arc-code" (no #), or "all"' })),
      room: Type.Optional(Type.String({ description: 'room file, like "combat.html"; default: the page on screen' })),
    }),
    replay: 'safe',
    execute: async args => {
      const room = args.room ? cleanPath(args.room).replace(/^learn\//, '') : nav.here();
      if (!DECKS.some(d => d.file === room)) return text(`"${room}" is not a room. Rooms: ${DECKS.map(d => d.file).join(', ')}`);
      const live = room === nav.here();
      const { slides, s } = await slideOf(room, args.slide);
      if (args.slide === 'all') return text(slides.map(x => `=== #${x.id} (Lv ${x.dataset.lv}) ===\n${page.slideText(x, lang, { live })}`).join('\n\n'));
      const slide = args.slide ? s : live ? page.currentSlide() : null;
      if (!slide) return text(`Name a slide of ${room}: ${slides.map(x => x.id).join(', ')}`);
      return text(`Slide ${slides.indexOf(slide) + 1}/${slides.length} of ${room}, #${slide.id} (Lv ${slide.dataset.lv}):\n\n${page.slideText(slide, lang, { live })}`);
    },
  });

  const lookAtDemo = defineTool({
    name: 'look_at_demo',
    description: 'Take a picture of a demo on the page on screen as it is right now, with its controls. Without arguments: the demo on the reader\'s slide.',
    parameters: Type.Object({ slide: Type.Optional(Type.String({ description: 'slide id (no #)' })) }),
    replay: 'safe',
    execute: async args => {
      const { s } = await slideOf(nav.here(), args.slide);
      const slide = args.slide ? s : page.currentSlide();
      const demo = slide?.querySelector('[data-demo]');
      if (!demo) return text(`There is no demo on ${slide ? '#' + slide.id : 'that slide'}.`);
      if (!demo.dataset.mounted) return text(`The demo "${demo.dataset.demo}" starts when its slide is on screen. Navigate there first.`);
      const state = page.demoState(demo), out = [{ type: 'text', text: `Demo "${demo.dataset.demo}" on #${slide.id}${state ? `. Controls and text: ${state}` : ''}` }];
      const shot = snapshot(demo);
      out.push(shot ? { type: 'image', data: shot, mimeType: 'image/jpeg' } : { type: 'text', text: '(Nothing drawn to take a picture of.)' });
      return { output: out };
    },
  });

  const readCode = defineTool({
    name: 'read_code',
    description: 'Read the game\'s code or design notes (only you see it; show code to the reader with show_code). "src/core/combat.js#inSwordArc" reads one definition (function, class, const, method; "a,b" for several), "src/core/combat.js" the whole file with line numbers, "src/core/" lists a folder with what each file is for. "docs/" has the grown-ups\' design notes (Markdown).',
    parameters: Type.Object({
      ref: Type.String({ description: 'path, path#name or folder/' }),
      lines: Type.Optional(Type.String({ description: 'for a whole file: a line range like "40-90"' })),
    }),
    replay: 'safe',
    execute: async args => {
      const ref = cleanPath(args.ref);
      const [path] = ref.split('#');
      if (!READABLE.test(path)) return text(`Only the game's own files can be read: src/, docs/, music/, blender/, tools/, tests/, learn/, README.md and CONTRIBUTING.md.`);
      if (path.endsWith('/')) {
        const names = await listFolder(path).catch(() => null);
        if (!names) return text(`There is no folder ${path}.`);
        const rows = await Promise.all(names.map(async n => n.endsWith('/') || !/\.(js|mjs|py)$/.test(n) ? n : `${n}: ${purpose(await page.fetchText(path + n).catch(() => '')) || ''}`));
        return text(`${path}\n${rows.map(r => '  ' + r).join('\n')}`);
      }
      if (!TEXT.test(path)) return text(`${path} is not a text file.`);
      let source;
      try { source = await page.fetchText(path); } catch { return text(`There is no file ${path}.`); }
      const refs = parseRefs(ref);
      if (refs.some(r => r.name)) {
        return text(refs.map(r => {
          const e = extract(source, path, r.name);
          return e.error ? `(${e.error})` : `${path} lines ${e.start + 1}-${e.end + 1}:\n${numbered(e.text.split('\n'), e.start)}`;
        }).join('\n\n'));
      }
      const lines = source.split('\n');
      const [a, b] = (args.lines ?? '').split('-').map(n => parseInt(n, 10));
      const from = Number.isFinite(a) ? Math.max(1, a) - 1 : 0, to = Number.isFinite(b) ? b : Math.min(lines.length, from + 400);
      const more = to < lines.length ? `\n[${lines.length} lines in all; ask for lines "${to + 1}-${Math.min(lines.length, to + 400)}" for more]` : '';
      return text(`${path} (${lines.length} lines):\n${numbered(lines.slice(from, to), from)}${more}`);
    },
  });

  const showCode = defineTool({
    name: 'show_code',
    description: 'Show the reader a piece of the game\'s real code in your panel, read from the game right now (the reader cannot see what you read with read_code). One definition ("src/cubegen/index.js#generate") or lines of a file ("src/cubegen/index.js" with lines "40-62"); at most 40 lines. focus marks the lines that matter. Then talk about it: it is right above your message.',
    parameters: Type.Object({
      ref: Type.String({ description: 'path#name, or a path with lines' }),
      lines: Type.Optional(Type.String({ description: 'line range like "40-62" (of the file, or to narrow a definition)' })),
      focus: Type.Optional(Type.String({ description: 'lines to mark, like "44" or "44-46" (file line numbers)' })),
      note: Type.Optional(Type.String({ description: 'a few words over the code' })),
    }),
    replay: 'safe',
    execute: async args => {
      const ref = cleanPath(args.ref), [path, name] = ref.split('#');
      if (!READABLE.test(path) || !TEXT.test(path)) return text(`Only text files of the game can be shown: src/, docs/, music/, blender/, tools/, tests/, learn/.`);
      let source;
      try { source = await page.fetchText(path); } catch { return text(`There is no file ${path}.`); }
      const all = source.split('\n');
      let start = 0, end = all.length - 1;
      if (name) {
        const e = extract(source, path, name);
        if (e.error) return text(e.error);
        ({ start, end } = e);
      }
      const range = s => { const [a, b] = String(s ?? '').split('-').map(n => parseInt(n, 10)); return Number.isFinite(a) ? [a - 1, Number.isFinite(b) ? b - 1 : a - 1] : null; };
      const narrow = range(args.lines);
      if (narrow) { start = Math.max(start, narrow[0]); end = Math.min(end, narrow[1]); }
      if (end < start) return text('Those lines are empty.');
      if (end - start + 1 > 40) return text(`That is ${end - start + 1} lines; show at most 40. Pick lines, like "${start + 1}-${start + 30}".`);
      const code = all.slice(start, end + 1).join('\n').replace(/\s+$/, '');
      const f = range(args.focus);
      const details = { path, name: name ?? null, start: start + 1, end: end + 1, code, focus: f ? [f[0] + 1, f[1] + 1] : null, note: args.note ?? null };
      return text(`The reader now sees ${path}${name ? '#' + name : ''} lines ${start + 1}-${end + 1} in your panel:\n${numbered(code.split('\n'), start)}`, details);
    },
  });

  const searchCode = defineTool({
    name: 'search_code',
    description: 'Search the game\'s code (every file the game loads) and the design notes in docs/ for a word or regular expression. Returns file:line matches.',
    parameters: Type.Object({
      query: Type.String({ description: 'text to find (case-insensitive), or a JavaScript regular expression with regex: true' }),
      regex: Type.Optional(Type.Boolean()),
      folder: Type.Optional(Type.String({ description: 'only files under this folder, like "src/core/" or "blender/"' })),
    }),
    replay: 'safe',
    execute: async args => {
      let re;
      try { re = args.regex ? new RegExp(args.query, 'i') : new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
      catch (e) { return text(`Not a regular expression: ${e.message}`); }
      const folder = args.folder ? cleanPath(args.folder).replace(/\/?$/, '/') : null;
      let paths = [...await gameFiles(), ...(await listFolder('docs/').catch(() => [])).filter(n => n.endsWith('.md')).map(n => 'docs/' + n)];
      if (folder) {
        paths = paths.filter(p => p.startsWith(folder));
        if (!paths.length && READABLE.test(folder)) paths = (await listFolder(folder).catch(() => [])).filter(n => TEXT.test(n)).map(n => folder + n);
      }
      const hits = [];
      for (const p of paths) {
        const lines = (await page.fetchText(p).catch(() => '')).split('\n');
        lines.forEach((l, i) => { if (re.test(l)) hits.push(`${p}:${i + 1}: ${l.trim().slice(0, 160)}`); });
        if (hits.length > 80) break;
      }
      return text(hits.length ? hits.slice(0, 80).join('\n') + (hits.length > 80 ? '\n[more matches; search for something narrower]' : '') : `No matches for ${args.query} in ${paths.length} files.`);
    },
  });

  const searchGuide = defineTool({
    name: 'search_guide',
    description: 'Search all rooms of the guide (in the reader\'s language) for a word, to find which room and slide explain something.',
    parameters: Type.Object({ query: Type.String() }),
    replay: 'safe',
    execute: async args => {
      const q = args.query.toLowerCase(), hits = [];
      for (const d of DECKS) {
        const doc = await page.roomDoc(d.file).catch(() => null);
        if (!doc) continue;
        for (const s of page.slidesOf(doc)) {
          const t = page.slideText(s, lang), at = t.toLowerCase().indexOf(q);
          if (at >= 0) hits.push(`${d.file}#${s.id} (${local(d, lang).title}): ...${t.slice(Math.max(0, at - 80), at + 120).replace(/\s+/g, ' ')}...`);
        }
      }
      return text(hits.length ? hits.slice(0, 20).join('\n') : `"${args.query}" is not in any room.`);
    },
  });

  const lookUpWord = defineTool({
    name: 'look_up_word',
    description: 'Look up a word in the guide\'s glossary (the Word Book), as the reader sees it.',
    parameters: Type.Object({ word: Type.String() }),
    replay: 'safe',
    execute: async args => {
      const q = args.word.toLowerCase().trim(), words = await page.glossary(lang);
      const found = words.filter(w => w.id === q || w.names.some(n => n.toLowerCase().includes(q)));
      if (!found.length) return text(`"${args.word}" is not in the glossary. Words: ${words.map(w => w.id).join(', ')}`);
      return text(found.slice(0, 5).map(w => `${w.title} (words.html#${w.id}): ${w.text}`).join('\n'));
    },
  });

  const navigate = defineTool({
    name: 'navigate',
    description: 'Move the reader: open another room (or the map, index.html, or the glossary, words.html), turn to a slide, change their detail level (1 big ideas, 2 how it works, 3 real code) or switch between slides and one long page. Tell the reader why.',
    parameters: Type.Object({
      room: Type.Optional(Type.String({ description: 'page file, like "paths.html"' })),
      slide: Type.Optional(Type.String({ description: 'slide id (no #)' })),
      level: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)])),
      layout: Type.Optional(Type.Union([Type.Literal('slides'), Type.Literal('page')])),
    }),
    replay: 'safe',
    execute: async args => {
      const room = args.room && cleanPath(args.room).replace(/^learn\//, '');
      if (room && !PAGES.includes(room)) return text(`There is no page "${room}". Pages: ${PAGES.join(', ')}`);
      if (args.level) { try { localStorage.setItem('kids.lv', String(args.level)); } catch { /* private mode */ } }
      if (room && room !== nav.here()) await nav.go(room + (args.slide ? '#' + args.slide : ''));
      const controls = await deck();
      if (args.level) controls?.setLevel(args.level);
      if (args.layout) controls?.setMode(args.layout === 'page' ? 'scroll' : 'slides');
      if (args.slide && controls && !controls.show(String(args.slide).replace(/^#/, '')))
        return text(`No slide "${args.slide}" in ${nav.here()}. Slides: ${controls.slides.map(s => s.id).join(', ')}`);
      return text(`The reader now sees ${whereNow()}.`);
    },
  });

  const highlight = defineTool({
    name: 'highlight',
    description: 'Point at something on the reader\'s screen: a glowing frame around the first element matching a CSS selector, with an optional short note next to it. In the guide (default) the slide it is on is turned to; where: "game" points into the game window.',
    parameters: Type.Object({
      selector: Type.String({ description: 'CSS selector, like "#chain .demo button" or "#arc-code pre"' }),
      note: Type.Optional(Type.String({ description: 'a few words shown next to it' })),
      where: Type.Optional(Type.Union([Type.Literal('guide'), Type.Literal('game')])),
      seconds: Type.Optional(Type.Number({ description: 'how long, default 10' })),
    }),
    replay: 'safe',
    execute: async args => {
      const doc = args.where === 'game' ? game.win()?.document : document;
      if (!doc) return text('The game window is not open.');
      let el;
      try { el = doc.querySelector(args.selector); } catch (e) { return text(`Not a CSS selector: ${e.message}`); }
      if (!el) return text(`Nothing matches ${args.selector}.`);
      const slide = args.where !== 'game' && el.closest('section.slide');
      if (slide && !slide.classList.contains('current') && !document.body.classList.contains('scroll')) (await deck())?.show(slide.id);
      spotlight(doc, el, args.note, args.seconds ?? 10);
      return text(`Pointing at <${el.tagName.toLowerCase()}> "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)}"${slide ? ` on #${slide.id}` : ''}.`);
    },
  });

  const runJs = defineTool({
    name: 'run_js',
    description: `Run JavaScript (the body of an async function) in the reader's browser, with full access to the page. where "guide" (default): the guide's page; where "game": inside the game window (its window, document and modules). "return" a value to see it; console output is collected too.
Helpers: $(selector), $$(selector) (in that page's document); teach (the game's teaching helpers, below); load(path) imports one of the game's modules (path from the game's folder, like "src/core/combat.js"; in "guide" they are the same modules the demos use, in "game" the running game's); wait(ms); guide: { go(url), here(), deck (the slide deck: current(), show(id), setLevel(n), slides) }; game: { open({ seed }), close(), restart(), api, window, load(path), summary(), enter(cubeKey), press(code, { hold, alt, shift }) }.
Inside the running game (where "game", or game.load / game.api from the guide), everything can be read and changed:
- game.api is window.__game: player (x, y, z, hp, maxHp, level, xp, inventory, sword), state (baseSeed, cubeKey, map, cubes: the world client, run, dev), map (the cube on screen: depth, portals, ...), enemies, spawnEnemy(type, { level, n, at }), killEnemies(), clearEnemies(), goHorde(depth), devSwapWeapon, devWear(id); chat: the chat box (src/game/console.js), chat.run('/spawn redback 5 3') runs a console command as if typed (/help lists them), chat.say(text) says something, chat.chronicle.entries is what happened this visit (deaths with their cause, levels, depths).
- teach (game.api.teach) shows things in the game and sets up experiments. Places are in cube cells (x and z from 0 to 16; the grid lens shows them): { x, z }, "player" or an enemy (the drawing follows it). Draw: teach.pin(at, { label }), label(at, text), arrow(from, to), path([places]), ring(at, radius), sector(at, radius, { angle (degrees), yaw }), cell(x, z, { label }); options { id, color, ttl (seconds), pulse }; clear(id) or clear(). Lenses draw the game's own rules live: teach.lens("sword" | "awareness" | "paths" | "grid" | "route", true/false, { of: enemy }). Time: teach.pause(), resume(), await step(frames) (60 a second), speed(0.25). Numbers: await teach.tune("src/core/enemies.js#SPIDER.aggro", 6) changes one (and the living enemies of that kind) and remembers the old value; untune() puts them all back; tuned() lists them. teach.toScreen(at) is a place in pixels (for highlight). teach.reset() undoes all of it. The full list is at the top of src/game/teach.js.
- game.enter("-2,-1,4") puts the hero into any cube of the world (key "x,y,z" where y is minus the depth); game.press("KeyG") presses a key: G walks to the next way down, PageDown / PageUp go down / up a depth, Alt+W/A/S/D jump to a neighbouring cube, plus the player's keys (see the game's help).
- Modules: src/game/state.js (player, state, view, setStatus), src/game/flow.js (enterCube, spawnAt, newWorld, hurt), src/game/dev.js (takePortal, goAdjacent, goHorde), src/game/travel.js (startTravel), src/world/layout.js; state.cubes.layout(depth) is a depth's plan (which cubes exist, the route), state.cubes.get(key) a cube's map. Read the code when you need more.
Changes to modules last until the page is reloaded (in the game: until it restarts). Set show: true when the reader should see the code (it is shown to them as a code block, so it should be short and clear); false for work behind the scenes.`,
    parameters: Type.Object({
      code: Type.String(),
      show: Type.Boolean({ description: 'show the code to the reader' }),
      where: Type.Optional(Type.Union([Type.Literal('guide'), Type.Literal('game')])),
      timeout_ms: Type.Optional(Type.Number({ description: 'default 10000, at most 120000' })),
    }),
    replay: 'unsafe',
    execute: async args => {
      const { value, logs, error } = await run(args.code, args.where ?? 'guide', Math.min(args.timeout_ms ?? 10_000, 120_000));
      const parts = [];
      if (error) parts.push(`error: ${error}`);
      else parts.push(`returned: ${describe(value)}`);
      if (logs.length) parts.push(`console:\n${logs.join('\n')}`);
      const out = text(parts.join('\n'), { ok: !error });
      if (error) throw new Error(out.output[0].text);
      return out;
    },
  });

  const gameTool = defineTool({
    name: 'game',
    description: 'The real game in a window next to the guide, which stays open while the reader moves between rooms. open it (optionally with a seed: the same seed gives the same world), close it, restart it (the same world from its start: undoes everything), go: put the hero into a cube (cube: its key, like "-2,-1,4"), key: press a key in the game (key: a code like "KeyG" or "PageDown"), make it bigger or smaller, or get its status. The reader can play in it with the mouse and keys. Look into it with look_at_game; anything else with run_js where "game".',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('open'), Type.Literal('close'), Type.Literal('restart'), Type.Literal('go'), Type.Literal('key'), Type.Literal('bigger'), Type.Literal('smaller'), Type.Literal('status')]),
      seed: Type.Optional(Type.Integer()),
      cube: Type.Optional(Type.String({ description: 'for go: the cube key "x,y,z"' })),
      key: Type.Optional(Type.String({ description: 'for key: the key code' })),
    }),
    replay: 'unsafe',
    execute: async args => {
      if (args.action === 'close') { game.close(); return text('The game window is closed.'); }
      if (args.action === 'status') return text(game.summary() ?? 'The game window is not open.');
      if (args.action === 'restart' && game.isOpen()) { await game.restart(); return text(`The game starts over: ${game.summary()}`); }
      if (args.action === 'go' || args.action === 'key') {
        if (!game.isOpen()) await game.open({ seed: args.seed });
        else await game.open();
        if (args.action === 'go') return text(`The hero is in cube ${args.cube}: ${await game.enter(args.cube)}`);
        await game.press(args.key ?? '');
        await new Promise(r => setTimeout(r, 400));
        return text(`Pressed ${args.key}. ${game.summary()}`);
      }
      await game.open({ seed: args.seed, ...(args.action === 'bigger' ? { big: true } : args.action === 'smaller' ? { big: false } : {}) });
      return text(`The game runs: ${game.summary()}`);
    },
  });

  const lookAtGame = defineTool({
    name: 'look_at_game',
    description: 'Take a picture of the game window\'s 3D view (without the bars and labels on top of it) and get a short status: seed, depth, the hero, enemies near.',
    parameters: Type.Object({}),
    replay: 'safe',
    execute: async () => {
      if (!game.api()) return text(game.isOpen() ? 'The game is still starting.' : 'The game window is not open; open it with the game tool.');
      const shot = await game.snapshot();
      return { output: [{ type: 'text', text: game.summary() }, ...(shot ? [{ type: 'image', data: shot, mimeType: 'image/jpeg' }] : [])] };
    },
  });

  const note = defineTool({
    name: 'note',
    description: 'Write a short note in your notebook about the reader, kept even when the conversation is started over: something they understood, found hard, or mixed up. One sentence.',
    parameters: Type.Object({ text: Type.String() }),
    replay: 'safe',
    execute: async (args, api, context) => {
      await addNote(api, nav.here(), args.text.slice(0, 300), context);
      return text('Noted.');
    },
  });

  return [readSlide, lookAtDemo, readCode, showCode, searchCode, searchGuide, lookUpWord, navigate, highlight, runJs, gameTool, lookAtGame, note];
}

// ---- running code -----------------------------------------------------------------------------------
async function run(code, where, timeout) {
  const inGame = where === 'game';
  if (inGame && !game.api()) return { logs: [], error: 'The game window is not open; open it with the game tool first.' };
  const w = inGame ? game.win() : window, doc = w.document, logs = [];
  const AsyncFunction = w.eval('(async function () {}).constructor');
  const controls = await import('../deck.js').then(m => m.controls);
  const helpers = {
    $: (s, root = doc) => root.querySelector(s),
    $$: (s, root = doc) => [...root.querySelectorAll(s)],
    load: inGame ? game.load : path => import(new URL(path, ROOT).href),
    wait: ms => new Promise(r => setTimeout(r, ms)),
    guide: { go: nav.go, here: nav.here, deck: controls },
    game: { open: game.open, close: game.close, restart: game.restart, api: game.api(), window: game.win(), load: game.load, summary: game.summary, enter: game.enter, press: game.press },
    teach: game.api()?.teach,
  };
  let fn;
  try { fn = new AsyncFunction(...Object.keys(helpers), code); }
  catch (e) { return { logs, error: `${e.name}: ${e.message}` }; }
  const con = w.console, saved = {};
  for (const k of ['log', 'info', 'warn', 'error']) {
    saved[k] = con[k];
    con[k] = (...a) => { logs.push((k === 'log' || k === 'info' ? '' : k + ': ') + a.map(x => typeof x === 'string' ? x : describe(x)).join(' ')); saved[k].apply(con, a); };
  }
  let timer;
  try {
    const value = await Promise.race([fn(...Object.values(helpers)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`still running after ${timeout} ms (it goes on in the background)`)), timeout); })]);
    return { value, logs };
  } catch (e) {
    return { logs, error: e?.stack ? String(e.stack).split('\n').slice(0, 4).join('\n') : String(e) };
  } finally {
    clearTimeout(timer);
    Object.assign(con, saved);
  }
}

// a value as short readable text (works for values from the game window too)
export function describe(v, depth = 0, seen = new WeakSet()) {
  const tag = x => Object.prototype.toString.call(x).slice(8, -1);
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === 'string') return depth ? JSON.stringify(v.length > 300 ? v.slice(0, 300) + '\u2026' : v) : cut(v, 12000);
  if (t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol') return String(v);
  if (t === 'function') return `[function ${v.name || ''}]`;
  if (v.nodeType === 1) return `<${v.tagName.toLowerCase()}${v.id ? '#' + v.id : ''}${v.classList.length ? '.' + [...v.classList].join('.') : ''}> ${JSON.stringify((v.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120))}`;
  if (v.nodeType) return `[${v.nodeName}]`;
  if (tag(v) === 'Error') return `${v.name}: ${v.message}`;
  if (seen.has(v)) return '[circular]';
  seen.add(v);
  if (depth >= 4) return Array.isArray(v) ? `[${v.length} items]` : '{\u2026}';
  const list = (items, n, open, close) => `${open}${items.slice(0, 50).map(x => describe(x, depth + 1, seen)).join(', ')}${n > 50 ? `, \u2026 (${n} in all)` : ''}${close}`;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return list([...v.slice(0, 50)], v.length, '[', ']');
  if (tag(v) === 'Set') return list([...v].slice(0, 50), v.size, 'Set {', '}');
  if (tag(v) === 'Map') return `Map {${[...v].slice(0, 40).map(([k, x]) => `${describe(k, depth + 1, seen)} => ${describe(x, depth + 1, seen)}`).join(', ')}${v.size > 40 ? `, \u2026 (${v.size} in all)` : ''}}`;
  if (tag(v) === 'Promise') return '[promise: use await]';
  const keys = Object.keys(v);
  const body = keys.slice(0, 40).map(k => { let x; try { x = describe(v[k], depth + 1, seen); } catch (e) { x = `[${e.message}]`; } return `${k}: ${x}`; });
  const out = `{ ${body.join(', ')}${keys.length > 40 ? `, \u2026 (${keys.length} keys)` : ''} }`;
  return depth ? out : cut(out, 12000);
}

// ---- pointing at things -----------------------------------------------------------------------------
const spots = new WeakMap();
function spotlight(doc, el, note, seconds) {
  spots.get(doc)?.();
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const box = doc.createElement('div');
  box.className = 'tutor-spot';
  Object.assign(box.style, { position: 'absolute', zIndex: 15, pointerEvents: 'none', border: '3px solid #ffcf7a', borderRadius: '8px', boxShadow: '0 0 0 4px #ffcf7a44, 0 0 24px #ffcf7aaa' });
  let bubble = null;
  if (note) {
    bubble = doc.createElement('div');
    bubble.className = 'tutor-spot-note';
    bubble.textContent = note;
    Object.assign(bubble.style, { position: 'absolute', zIndex: 16, maxWidth: '280px', background: '#2a2416', color: '#ffe4ae', border: '1px solid #ffcf7a', borderRadius: '8px',
      padding: '6px 10px', font: "16px/1.4 'Crimson Text', serif", boxShadow: '0 6px 20px #000a', cursor: 'pointer' });
  }
  const place = () => {
    const r = el.getBoundingClientRect(), w = doc.defaultView;
    Object.assign(box.style, { left: `${r.left + w.scrollX - 6}px`, top: `${r.top + w.scrollY - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    if (bubble) Object.assign(bubble.style, { left: `${Math.max(8, Math.min(r.left + w.scrollX, w.innerWidth + w.scrollX - 300))}px`, top: `${r.bottom + w.scrollY + 10}px` });
  };
  doc.body.append(box, ...(bubble ? [bubble] : []));
  place();
  const pulse = box.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 1200, iterations: Infinity });
  const follow = setInterval(() => el.isConnected ? place() : done(), 200);
  const done = () => { pulse.cancel(); clearInterval(follow); clearTimeout(timer); box.remove(); bubble?.remove(); spots.delete(doc); };
  const timer = setTimeout(done, seconds * 1000);
  bubble?.addEventListener('click', done);
  spots.set(doc, done);
}

// a picture of the biggest canvas of a demo as a JPEG (base64), or null when it is blank
function snapshot(demo) {
  const c = [...demo.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!c || !c.width) return null;
  const scale = Math.min(1, 900 / c.width), out = document.createElement('canvas');
  out.width = Math.round(c.width * scale); out.height = Math.round(c.height * scale);
  const g = out.getContext('2d');
  g.fillStyle = '#0b0d12'; g.fillRect(0, 0, out.width, out.height);
  try { g.drawImage(c, 0, 0, out.width, out.height); } catch { return null; }
  const px = g.getImageData(0, 0, out.width, out.height).data;
  let lit = 0;
  for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
  return lit ? out.toDataURL('image/jpeg', 0.82).split(',')[1] : null;
}
