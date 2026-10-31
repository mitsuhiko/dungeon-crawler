// What the frames cost, to see on any device (phones above all, where there are no dev tools at
// hand):
//   - the overlay (?perf=1, or /perf with the dev tools): frame rate and the worst frames, the
//     lighting's quality level and what it draws (render/shadows.js), the resolution, the bake's
//     pace (render/bake.js), shaders compiled while drawing (render/programs.js), draw calls,
//     what WebGL holds (render/gpumem.js) and whether the device counts as small (render/device.js);
//     under it graphs of the last 30 seconds: the frames, the memory, what is drawn (graph).
//   - the bench (/bench with the dev tools, runBench): the game held, the world drawn a few times
//     over with a part of it off at a time, each timed to the end of the GPU's work (a pixel read
//     back from the screen waits for it: there are no GPU timers in Safari). Prints a table to
//     the console, and what each part costs to the chat box.
import { renderer, scene, camera, sun } from '../render/scene.js';
import { lamp } from '../render/character.js';
import { programStats } from '../render/programs.js';
import { bakeStats, baked } from '../render/bake.js';
import { shadowState } from '../render/shadows.js';
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
const LEVEL_COLOURS = { lowest: '#8a5a5a', low: '#a8854a', medium: '#5a8a9a', high: '#5aa070' };
let box = null, text = null, canvas = null, frames = [], last = 0, drawnAt = 0, bake0 = { ...bakeStats };
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

let textAt = 0;
function draw(now) {
  if (now - textAt > 500) { textAt = now; show(now); }
  graph();
}

function show(t) {
  const second = frames.filter(([at]) => t - at < 1000).map(f => f[1]).sort((a, b) => a - b);
  const worst = Math.max(0, ...frames.filter(([at]) => t - at < 5000).map(f => f[1]));
  const long = frames.filter(([, d]) => d > 50).length;
  const sh = shadowState(), res = resolutionState(), info = renderer.info.render;
  const b = { frames: bakeStats.frames - bake0.frames, waits: bakeStats.waits - bake0.waits, steps: bakeStats.steps - bake0.steps, suns: bakeStats.suns - bake0.suns };
  bake0 = { ...bakeStats };
  text.textContent = [
    `fps ${second.length} · p95 ${round(second[Math.floor(second.length * 0.95)] ?? 0)} ms · worst (5 s) ${round(worst)} ms · over 50 ms (10 s) ${long}`,
    `lighting ${qualityLevel()}${graphics() === 'auto' ? ' (auto)' : ''} · pixel ratio ${round(res.ratio, 2)} · MSAA ${msaaSamples() ? msaaSamples() + 'x' : 'off'}`,
    `lamp: shadow reach ${round(sh.lampRange, 1)} · enemies within ${round(sh.lampFigures, 1)} · every ${sh.lamp.every} · strength ${round(sh.lampStrength, 2)}`,
    `sun: map ${sun.shadow.mapSize.x} · enemies within ${round(sh.sunFigures, 1)} · every ${sh.sun.every}`,
    `fixed lights a point ${round(BAKE.uBakeK.value, 1)} · draw calls ${info.calls} · triangles ${round(info.triangles / 1000)}k`,
    `bake: ${baked(state.world) ? 'done' : 'baking'} · steps ${b.steps} in ${b.frames} frames · waited ${b.waits} · sun places ${b.suns}`,
    `shaders compiled while drawing ${programStats.compiledWhileDrawing}${programStats.last ? ' (last ' + programStats.last + ')' : ''}`,
    memoryLine(),
  ].join('\n');
}
// what WebGL holds (counted only with ?perf=1 in the address: from the start)
function memoryLine() {
  const m = gpuMemory(), h = heap();
  const sizes = m ? `${round(m.total)} MB (textures ${round(m.textures)}, buffers ${round(m.buffers)}, render buffers ${round(m.renderbuffers)}) · at most ${round(m.peak)} MB` : 'counted with ?perf=1';
  return `WebGL holds ${sizes}${h !== null ? ` · JS ${round(h)} MB` : ''} · ${small ? 'small device' : 'not a small device'}`;
}

// The graphs, the last WINDOW seconds on one time axis (a column a COLUMN), newest on the right;
// a white line where the hero went into another cube, across all three:
//   frames  the worst frame of each column (green within the cap, yellow to 50 ms, red past it;
//           cut off at the top, the worst one written there), the page's own time in it (grey),
//           the average as a line; 16.7 and 33.3 ms marked. Ticks along the top: shaders compiled
//           while drawing (magenta); along the bottom: the bake's steps (blue).
//   memory  what WebGL holds, stacked: textures, buffers, render buffers; the JS heap as a line
//           (Chrome only)
//   drawing draw calls and triangles, each to its own scale; along the bottom the quality level
//           (a colour each) and the pixel ratio as a line over it
const W = 300, PANEL = 54, GAP = 14, H = 3 * PANEL + 3 * GAP;
const FRAME_MS = 66;   // the frames graph's top
const PAGE = '#55607a';   // the page's own time in a frame
function graph() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '9px ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
  const newest = columns.at(-1)?.at ?? 0, cw = W / COLUMNS;
  const x = c => W - (newest - c.at + 1) * cw;
  const panels = [GAP, 2 * GAP + PANEL, 3 * GAP + 2 * PANEL];   // each panel's top
  // a panel's title: [text, colour] pieces (the colours are the graph's)
  const label = (y, ...pieces) => {
    let at = 0;
    for (const [s, colour = '#cfd6e2'] of pieces) { g.fillStyle = colour; g.fillText(s, at, y - GAP + 2); at += g.measureText(s).width; }
  };
  const frame = (y) => { g.strokeStyle = '#ffffff22'; g.strokeRect(0.5, y + 0.5, W - 1, PANEL - 1); };

  // frames
  let y = panels[0];
  const cap = frameRate(), budget = cap ? 1000 / cap + 2 : 17.5, sy = v => y + PANEL - Math.min(1, v / FRAME_MS) * PANEL;
  const shown = columns.filter(c => c.n), worst = Math.max(0, ...shown.map(c => c.worst)), now = columns.at(-1);
  label(y, [`frame ${round(now?.n ? now.sum / now.n : 0)} ms · worst ${round(worst)}${cap ? ` · cap ${cap}` : ''} · `], ['page ', PAGE], ['shader ', '#ff5ad2'], ['bake', '#5a9cff']);
  frame(y);
  for (const ms of [1000 / 60, 1000 / 30]) { g.fillStyle = '#ffffff30'; g.fillRect(0, Math.round(sy(ms)), W, 1); }
  for (const c of shown) {
    g.fillStyle = c.worst <= budget ? '#5fc48c' : c.worst <= 50 ? '#e2c05a' : '#f06464';
    g.fillRect(x(c), sy(c.worst), cw, y + PANEL - sy(c.worst));
    g.fillStyle = PAGE;
    g.fillRect(x(c), sy(c.work), cw, y + PANEL - sy(c.work));
    if (c.compiled) { g.fillStyle = '#ff5ad2'; g.fillRect(x(c), y, Math.max(cw, 2), 4); }
    if (c.steps) { g.fillStyle = '#5a9cff'; g.fillRect(x(c), y + PANEL - 3, Math.max(cw, 1.5), 3); }
  }
  g.strokeStyle = '#ffffffaa'; g.beginPath();
  shown.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](x(c) + cw / 2, sy(c.sum / c.n)));
  g.stroke();
  if (worst > FRAME_MS) { g.fillStyle = '#f06464'; g.textAlign = 'right'; g.fillText(`${round(worst)} ms`, W - 2, y + 2); g.textAlign = 'left'; }

  // memory
  y = panels[1];
  const mem = columns.filter(c => c.tex !== undefined), heaps = columns.filter(c => c.heap !== undefined);
  const top = Math.max(64, ...mem.map(c => c.tex + c.buf + c.rb), ...heaps.map(c => c.heap)) * 1.1;
  const my = v => y + PANEL - (v / top) * PANEL;
  const m = mem.at(-1);
  if (m) label(y, [`WebGL MB ${round(m.tex + m.buf + m.rb)}: `], [`tex ${round(m.tex)} `, '#5fc48c'], [`buf ${round(m.buf)} `, '#4fa3c7'], [`rb ${round(m.rb)}`, '#a98af0'],
    ...(heaps.length ? [[' · '], [`JS ${round(heaps.at(-1).heap)}`, '#ffffff']] : []));
  else label(y, ['WebGL MB · counted with ?perf=1']);
  frame(y);
  for (const c of mem) {
    let base = 0;
    for (const [v, colour] of [[c.rb, '#a98af0'], [c.buf, '#4fa3c7'], [c.tex, '#5fc48c']]) {
      g.fillStyle = colour; g.fillRect(x(c), my(base + v), cw, my(base) - my(base + v)); base += v;
    }
  }
  if (heaps.length) {
    g.strokeStyle = '#ffffffcc'; g.beginPath();
    heaps.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](x(c) + cw / 2, my(c.heap)));
    g.stroke();
  }
  g.fillStyle = '#ffffff70'; g.textAlign = 'right'; g.fillText(round(top), W - 2, y + 2); g.textAlign = 'left';

  // drawing
  y = panels[2];
  const drawn = columns.filter(c => c.calls), calls = Math.max(1, ...drawn.map(c => c.calls)), tris = Math.max(1, ...drawn.map(c => c.tris));
  const d = drawn.at(-1);
  label(y, [`draw calls ${d?.calls ?? 0} (most ${calls})`, '#f0a050'], [' · '], [`triangles ${round((d?.tris ?? 0) / 1000)}k (most ${round(tris / 1000)}k)`, '#60d0e0']);
  frame(y);
  for (const c of columns) if (c.level) { g.fillStyle = LEVEL_COLOURS[c.level] ?? '#666'; g.fillRect(x(c), y + PANEL - 6, cw, 6); }
  const line = (list, value, colour, scale) => {
    g.strokeStyle = colour; g.beginPath();
    list.forEach((c, i) => g[i ? 'lineTo' : 'moveTo'](x(c) + cw / 2, y + PANEL - 8 - (value(c) / scale) * (PANEL - 12)));
    g.stroke();
  };
  line(drawn, c => c.calls, '#f0a050', calls * 1.2);
  line(drawn, c => c.tris, '#60d0e0', tris * 1.2);
  line(columns.filter(c => c.ratio), c => c.ratio, '#ffffff88', 2.2);
  g.fillStyle = '#cfd6e2'; g.textAlign = 'right';
  g.fillText(`${now?.level ?? ''} · ×${round(now?.ratio ?? 0, 2)}`, W - 2, y + PANEL - 18); g.textAlign = 'left';

  // into another cube
  g.fillStyle = '#ffffffcc';
  for (const c of columns) if (c.cube) g.fillRect(Math.round(x(c)), GAP, 1, H - GAP);
}

export function showPerf(on = !box) {
  if (on && !box) {
    box = Object.assign(document.createElement('div'), { id: 'perf' });
    text = document.createElement('pre');
    canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    box.append(text, canvas);
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
