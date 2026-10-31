// What the frames cost, to see on any device (phones above all, where there are no dev tools at
// hand):
//   - the overlay (?perf=1, or /perf with the dev tools): frame rate and the worst frames, the
//     lighting's quality level and what it draws (render/shadows.js), the resolution, the bake's
//     pace (render/bake.js), shaders compiled while drawing (render/programs.js), draw calls,
//     what WebGL holds (render/gpumem.js) and whether the device counts as small (render/device.js).
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
import { graphics } from './settings.js';
import { qualityLevel } from './quality.js';
import { gpuMemory } from '../render/gpumem.js';
import { small } from '../render/device.js';
import { state } from './state.js';

// --- the overlay -----------------------------------------------------------------------------

let box = null, last = 0, frames = [], shownAt = 0, bake0 = { ...bakeStats };
const round = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '∞');
function tick(t) {
  if (!box) return;
  if (last) frames.push([t, t - last]);
  last = t;
  while (frames.length && t - frames[0][0] > 10000) frames.shift();
  if (t - shownAt > 500) { shownAt = t; show(t); }
  requestAnimationFrame(tick);
}
function show(t) {
  const second = frames.filter(([at]) => t - at < 1000).map(f => f[1]).sort((a, b) => a - b);
  const worst = Math.max(0, ...frames.filter(([at]) => t - at < 5000).map(f => f[1]));
  const long = frames.filter(([, d]) => d > 50).length;
  const sh = shadowState(), res = resolutionState(), info = renderer.info.render;
  const b = { frames: bakeStats.frames - bake0.frames, waits: bakeStats.waits - bake0.waits, steps: bakeStats.steps - bake0.steps, suns: bakeStats.suns - bake0.suns };
  bake0 = { ...bakeStats };
  box.textContent = [
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
  const m = gpuMemory();
  const sizes = m ? `${round(m.total)} MB (textures ${round(m.textures)}, buffers ${round(m.buffers)}, render buffers ${round(m.renderbuffers)}) · at most ${round(m.peak)} MB` : 'counted with ?perf=1';
  return `WebGL holds ${sizes} · ${small ? 'small device' : 'not a small device'}`;
}
export function showPerf(on = !box) {
  if (on && !box) {
    box = Object.assign(document.createElement('pre'), { id: 'perf' });
    document.body.append(box);
    last = 0; frames = [];
    requestAnimationFrame(tick);
  } else if (!on && box) { box.remove(); box = null; }
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
