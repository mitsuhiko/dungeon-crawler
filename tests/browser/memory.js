// await (await import('./tests/browser/memory.js')).runMemoryChecks()
// What the game holds stays within its budgets while it is played (docs/lighting.md, "Small
// devices"; docs/world.md, "Off the main thread"; docs/narration.md, "Memory"): the cubes'
// geometry away from the hero, the narrator's decoded clips, a small device's pixels. Goes down
// to a few depths' hordes (the dev tools: ?dev=1) and back to the town. Returns what it found.
import { renderer } from '../../src/render/scene.js';
import { small } from '../../src/render/device.js';
import { SMALL_PIXELS } from '../../src/core/resolution.js';
import { baked } from '../../src/render/bake.js';
import { goHorde, goPlace } from '../../src/game/dev.js';
import { voiceClip, narrationMemory } from '../../src/game/narrator.js';
import { neighborStats } from '../../src/render/neighbors.js';
import { parse } from '../../src/world/coords.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mb = b => +(b / 2 ** 20).toFixed(1);

export async function runMemoryChecks(depths = [2, 4, 6, 8]) {
  const g = window.__game, state = g.state;
  check(state.dev, 'needs the dev tools (?dev=1)');
  const settle = async () => {
    for (let i = 0; i < 600 && g.transitioning; i++) await sleep(50);
    for (let i = 0; i < 1200 && !baked(state.world); i++) await sleep(50);
    await sleep(1000);
  };
  const report = {};

  // a small device's canvas: no more than its pixel budget (or its CSS pixels)
  const gl = renderer.getContext(), px = gl.drawingBufferWidth * gl.drawingBufferHeight;
  report.pixels = { small, ratio: renderer.getPixelRatio(), px };
  if (small) check(px <= SMALL_PIXELS * 1.01 || renderer.getPixelRatio() <= 1, `a small device draws ${px} pixels`);

  // the cubes' geometry away from the hero: within the budget, the hero's layer round it aside
  for (const d of depths) { await goHorde(d); await settle(); }
  await goPlace({ depth: 0 }); await settle();
  const cubes = state.cubes, [x, y, z] = parse(state.cubeKey);
  let far = 0;
  for (const c of cubes.cubes.values()) {
    if (!c.geo || c.key === state.cubeKey) continue;
    const p = parse(c.key);
    if (p.length !== 3 || p[1] !== y || Math.max(Math.abs(p[0] - x), Math.abs(p[2] - z)) > 4) far += c.geoBytes ?? 0;
  }
  report.geometry = { ...cubes.geometryHeld(), far: mb(far), budget: mb(cubes.geoBudget) };
  report.geometry.bytes = mb(report.geometry.bytes);
  check(far <= cubes.geoBudget, `${mb(far)} MB of geometry away from the hero, the budget ${mb(cubes.geoBudget)}`);
  check(state.cubes.cubes.get(state.cubeKey).geo, 'the cube played in has its geometry');
  report.neighbors = neighborStats();

  // the narrator's decoded clips: the files stay, the decoded ones only up to 16 MB (and the last)
  const manifest = await (await fetch('/assets/narration/manifest.json')).json();
  let biggest = 0, played = 0;
  for (const key of Object.keys(manifest.clips?.en ?? {}).slice(0, 60)) {
    const clip = await voiceClip(key);
    if (clip) { played++; biggest = Math.max(biggest, clip.buffer.length * clip.buffer.numberOfChannels * 4); }
  }
  const voice = narrationMemory();
  report.voice = { played, decoded: mb(voice.decoded), clips: voice.clips, files: voice.files };
  if (played) check(voice.decoded <= 16 * 2 ** 20 + biggest, `${mb(voice.decoded)} MB of decoded clips kept`);
  return report;
}
