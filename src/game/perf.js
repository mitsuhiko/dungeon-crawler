// What the frames cost, to see on any device (phones above all, where there are no dev tools at
// hand):
//   - the overlay (?perf=1, or /perf with the dev tools): graphs of the last 30 seconds side by
//     side, the frames, what WebGL holds (render/gpumem.js) and what is drawn, and a line of what
//     the lighting draws, the bake and shaders compiled while drawing (render/programs.js) (graph).
//   - the bench (/bench with the dev tools, runBench): the game held, the world drawn a few times
//     over with a part of it off at a time, each timed to the end of the GPU's work (a pixel read
//     back from the screen waits for it: there are no GPU timers in Safari). Prints a table to
//     the console, and what each part costs to the chat box.
import { renderer, scene, camera, sun } from '../render/scene.js';
import { lamp } from '../render/character.js';
import { programStats } from '../render/programs.js';
import { bakeStats, baked } from '../render/bake.js';
import { resolutionState } from '../render/resolution.js';
import { BAKE } from '../render/lighthook.js';
import { beginFrame, endFrame, msaaSamples, readScreenPixel } from '../render/msaa.js';
import { CELLS, bakeCells } from '../render/watercells.js';
import { graphics, frameRate } from './settings.js';
import { qualityLevel } from './quality.js';
import { gpuMemory } from '../render/gpumem.js';
import { small } from '../render/device.js';
import { state } from './state.js';

// --- the overlay -----------------------------------------------------------------------------

// The game's own frames (main.js perfFrame, after each one: the screen may ask for more than a
// frame rate cap draws), gathered into columns of COLUMN seconds, WINDOW seconds of them kept,
// for the graphs; the text from the last second and the last few.
const COLUMN = 0.1, WINDOW = 30, COLUMNS = Math.round(WINDOW / COLUMN);
let box = null, text = null, canvas = null, frames = [], last = 0, drawnAt = 0;
let columns = [], column = null, compiled = programStats.compiledWhileDrawing, steps = bakeStats.steps, cube = null;
const round = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '∞');
const heap = () => performance.memory ? performance.memory.usedJSHeapSize / 2 ** 20 : null;   // (Chrome's; Safari has none)

// after every frame (main.js): when it began, whether it drew the world
export function perfFrame(start, drawn = true) {
  if (!box) return;
  const now = performance.now(), interval = last ? start - last : 0;
  last = start;
  frames.push([start, interval]);
  while (frames.length && start - frames[0][0] > 10000) frames.shift();
  // the column it falls in (a new one each COLUMN seconds; none while the page sleeps)
  const at = Math.floor(now / 1000 / COLUMN);
  if (!column || column.at !== at) {
    column = { at, worst: 0, sum: 0, n: 0, work: 0, compiled: 0, steps: 0, calls: 0, tris: 0, cube: false };
    columns.push(column);
    while (columns.length && at - columns[0].at >= COLUMNS) columns.shift();
  }
  const c = column, info = renderer.info.render, m = gpuMemory();
  if (interval) { c.worst = Math.max(c.worst, interval); c.sum += interval; c.n++; }
  c.work = Math.max(c.work, now - start);   // (the page's own time: what the CPU did, not the GPU)
  c.compiled += programStats.compiledWhileDrawing - compiled; compiled = programStats.compiledWhileDrawing;
  c.steps += bakeStats.steps - steps; steps = bakeStats.steps;
  if (drawn) { c.calls = Math.max(c.calls, info.calls); c.tris = Math.max(c.tris, info.triangles); }
  if (state.cubeKey !== cube) { if (cube !== null) c.cube = true; cube = state.cubeKey; }
  c.level = qualityLevel(); c.ratio = resolutionState().ratio;
  if (m) { c.tex = m.textures; c.buf = m.buffers; c.rb = m.renderbuffers; }
  c.heap = heap() ?? undefined;
  if (now - drawnAt > 100) { drawnAt = now; draw(now); }   // (ten times a second: the overlay is cheap)
}

// The overlay: three graphs side by side, the last WINDOW seconds on one time axis (a column a
// COLUMN, newest on the right), each titled with what it shows now, and a line of text under them.
//   frames  the worst frame of each column (green within the cap, yellow to 50 ms, red past it;
//           cut off at FRAME_MS), the page's own time in it in grey; ticks along the top where a
//           shader compiled while drawing (magenta), along the bottom where the bake stepped (blue)
//   memory  what WebGL holds, stacked: textures (green), buffers (blue), render buffers (purple);
//           the JS heap as a line (Chrome only)
//   drawing draw calls (orange) and triangles (cyan), each to its own scale, over a strip of the
//           quality level (a colour each)
// A white line in all three where the hero went into another cube.
// The text: the lighting's level, the pixel ratio, MSAA, the sun's map, whether the device counts
// as small (render/device.js); the bake; shaders compiled while drawing; the most WebGL held.
const TITLE = 11, PANEL = 40, SPACE = 6, H = TITLE + PANEL;
const FRAME_MS = 66;        // the frames graph's top
const PAGE = '#55607a';     // the page's own time in a frame
const LEVEL_COLOURS = { lowest: '#8a5a5a', low: '#a8854a', medium: '#5a8a9a', high: '#5aa070' };
const width = () => Math.min(480, (document.documentElement.clientWidth || innerWidth) - 16);

let textAt = 0;
function draw(now) {
  if (now - textAt > 500) { textAt = now; show(now); }
  graph();
}

function show(t) {
  const res = resolutionState(), m = gpuMemory();
  const level = `${qualityLevel()}${graphics() === 'auto' ? ' (auto)' : ''}`;
  text.textContent = [
    `${level} · ×${round(res.ratio, 2)} · MSAA ${msaaSamples() ? msaaSamples() + 'x' : 'off'} · sun ${sun.shadow.mapSize.x}${small ? ' · small' : ''}`,
    `${baked(state.world) ? 'baked' : 'baking'} · ${programStats.compiledWhileDrawing} shaders while drawing${programStats.last ? ' (' + programStats.last + ')' : ''}${m ? ` · GL most ${round(m.peak)} MB` : ''}`,
  ].join('\n');
}

function graph() {
  const W = width(), PW = (W - 2 * SPACE) / 3, dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(W * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; text.style.width = W + 'px';
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '9px ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
  const newest = columns.at(-1)?.at ?? 0, cw = PW / COLUMNS, now = columns.at(-1);
  // a panel at x0: its title ([text, colour] pieces), its frame; x(c): a column's left
  const panel = (x0, ...title) => {
    let at = x0;
    for (const [s, colour = '#cfd6e2'] of title) { g.fillStyle = colour; g.fillText(s, at, 0); at += g.measureText(s).width; }
    g.strokeStyle = '#ffffff22'; g.strokeRect(x0 + 0.5, TITLE + 0.5, PW - 1, PANEL - 1);
    return c => x0 + PW - (newest - c.at + 1) * cw;
  };
  const bottom = TITLE + PANEL;
  const lineOf = (x, list, y) => {
    g.beginPath();
    list.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](x(c) + cw / 2, y(c)));
    g.stroke();
  };

  // frames
  const second = frames.filter(([at]) => performance.now() - at < 1000).length;
  const shown = columns.filter(c => c.n), worst = Math.max(0, ...shown.map(c => c.worst));
  const cap = frameRate(), budget = cap ? 1000 / cap + 2 : 17.5;
  const colour = ms => ms <= budget ? '#5fc48c' : ms <= 50 ? '#e2c05a' : '#f06464';
  let x = panel(0, [`${second} fps ${round(now?.n ? now.sum / now.n : 0)} ms`], ...(worst > budget ? [[` ▲${round(worst)}`, colour(worst)]] : []));
  const fy = ms => bottom - Math.min(1, ms / FRAME_MS) * PANEL;
  for (const ms of [1000 / 60, 1000 / 30]) { g.fillStyle = '#ffffff30'; g.fillRect(x({ at: newest - COLUMNS + 1 }), Math.round(fy(ms)), PW, 1); }
  for (const c of shown) {
    g.fillStyle = colour(c.worst); g.fillRect(x(c), fy(c.worst), cw, bottom - fy(c.worst));
    g.fillStyle = PAGE; g.fillRect(x(c), fy(c.work), cw, bottom - fy(c.work));
    if (c.compiled) { g.fillStyle = '#ff5ad2'; g.fillRect(x(c), TITLE, Math.max(cw, 1.5), 3); }
    if (c.steps) { g.fillStyle = '#5a9cff'; g.fillRect(x(c), bottom - 2, Math.max(cw, 1), 2); }
  }
  g.strokeStyle = '#ffffffaa'; lineOf(x, shown, c => fy(c.sum / c.n));
  cubes(x);

  // memory
  const mem = columns.filter(c => c.tex !== undefined), heaps = columns.filter(c => c.heap !== undefined), m = mem.at(-1);
  x = panel(PW + SPACE, [m ? `GL ${round(m.tex + m.buf + m.rb)} MB` : 'GL: ?perf=1'], ...(heaps.length ? [[` JS ${round(heaps.at(-1).heap)}`, '#ffffff']] : []));
  const top = Math.max(64, ...mem.map(c => c.tex + c.buf + c.rb), ...heaps.map(c => c.heap)) * 1.1;
  const my = v => bottom - (v / top) * PANEL;
  for (const c of mem) {
    let base = 0;
    for (const [v, fill] of [[c.rb, '#a98af0'], [c.buf, '#4fa3c7'], [c.tex, '#5fc48c']]) { g.fillStyle = fill; g.fillRect(x(c), my(base + v), cw, my(base) - my(base + v)); base += v; }
  }
  g.strokeStyle = '#ffffffcc'; lineOf(x, heaps, c => my(c.heap));
  cubes(x);

  // drawing
  const drawn = columns.filter(c => c.calls), d = drawn.at(-1);
  const calls = Math.max(1, ...drawn.map(c => c.calls)) * 1.2, tris = Math.max(1, ...drawn.map(c => c.tris)) * 1.2;
  x = panel(2 * (PW + SPACE), [`${d?.calls ?? 0}`, '#f0a050'], [' calls '], [`${round((d?.tris ?? 0) / 1000)}k`, '#60d0e0'], [' tris']);
  for (const c of columns) if (c.level) { g.fillStyle = LEVEL_COLOURS[c.level] ?? '#666'; g.fillRect(x(c), bottom - 4, cw, 4); }
  const dy = (v, scale) => bottom - 5 - (v / scale) * (PANEL - 7);
  g.strokeStyle = '#f0a050'; lineOf(x, drawn, c => dy(c.calls, calls));
  g.strokeStyle = '#60d0e0'; lineOf(x, drawn, c => dy(c.tris, tris));
  cubes(x);

  // where the hero went into another cube
  function cubes(x) {
    g.fillStyle = '#ffffffcc';
    for (const c of columns) if (c.cube) g.fillRect(Math.round(x(c)), TITLE, 1, PANEL);
  }
}

export function showPerf(on = !box) {
  if (on && !box) {
    box = Object.assign(document.createElement('div'), { id: 'perf' });
    canvas = document.createElement('canvas');
    text = document.createElement('pre');
    box.append(canvas, text);
    document.body.append(box);
    last = 0; frames = []; columns = []; column = null; cube = state.cubeKey;
  } else if (!on && box) { box.remove(); box = text = canvas = null; }
  return !!box;
}
if (new URLSearchParams(location.search).get('perf') === '1') showPerf(true);

// --- the bench -------------------------------------------------------------------------------

const REPS = 7;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// the enemies' meshes casting no shadows (render/shadows.js: their views are figures)
function figuresCast(on) {
  for (const o of scene.children) if (o.userData.figure) o.traverse(m => {
    if (!m.isMesh) return;
    if (!on && m.castShadow) { m.castShadow = false; m.userData.benchCast = true; }
    if (on && m.userData.benchCast) { m.castShadow = true; delete m.userData.benchCast; }
  });
}
export async function runBench() {
  const gl = renderer.getContext(), px = new Uint8Array(4);
  // the game's frames held (main.js asks for the next one at the end of each)
  const raf = window.requestAnimationFrame, held = [];
  window.requestAnimationFrame = f => { held.push(f); return 0; };
  await sleep(50);
  const draw = () => { beginFrame(); renderer.render(scene, camera); endFrame(); };
  const sync = () => readScreenPixel(px);   // (the canvas, after the frame was resolved onto it)
  const time = fn => {
    fn(); fn(); sync();
    const t = [];
    for (let i = 0; i < REPS; i++) { sync(); const t0 = performance.now(); fn(); sync(); t.push(performance.now() - t0); }
    t.sort((a, b) => a - b);
    return { min: t[0], median: t[REPS >> 1] };
  };
  const k = BAKE.uBakeK.value;
  const parts = [
    ['as it is', () => {}, () => {}],
    ["lamp's maps not drawn", () => { lamp.shadow.autoUpdate = false; }, () => { lamp.shadow.autoUpdate = true; }],
    ["sun's map not drawn", () => { sun.shadow.autoUpdate = false; }, () => { sun.shadow.autoUpdate = true; }],
    ['enemies cast no shadow', () => figuresCast(false), () => figuresCast(true)],
    ['no fixed light a point', () => { BAKE.uBakeK.value = 0; }, () => { BAKE.uBakeK.value = k; }],
  ];
  const rows = [];
  try {
    for (const [name, on, off] of parts) {
      on();
      try { rows.push({ part: name, ...time(draw) }); } finally { off(); }
    }
    // the fluids' patterns drawn on top (both looks, as when every fluid shows)
    let tc = 0;
    const cells = time(() => { for (const c of Object.values(CELLS)) c.used = Infinity; bakeCells(tc += 1 / 60); draw(); });
    rows.push({ part: "with the fluids' patterns", ...cells });
  } finally {
    window.requestAnimationFrame = raf;
    for (const f of held) raf(f);
  }
  const base = rows[0].min;
  const table = rows.map(r => ({ part: r.part, 'min ms': +r.min.toFixed(2), 'median ms': +r.median.toFixed(2), 'vs as it is': (r.min - base >= 0 ? '+' : '') + (r.min - base).toFixed(2) }));
  console.table(table);
  const [w, h] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
  return `Bench at ${w}×${h}, ${qualityLevel()}, MSAA ${msaaSamples() ? msaaSamples() + 'x' : 'off'}: a frame ${base.toFixed(1)} ms; ` + table.slice(1).map(r => `${r.part} ${r['vs as it is']}`).join(', ') + ' (the console has the table)';
}
