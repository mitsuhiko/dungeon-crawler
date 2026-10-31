// The lighting's quality level (the settings, game/settings.js graphics): one pinned, or Auto,
// which follows the frame rate (render/resolution.js, core/resolution.js: down before the
// resolution, up again after it once frames have been calm a while). The level Auto
// reached is kept for the next visit (KEY); it starts low where the screen is touched and at
// medium elsewhere.
//
// Every level looks the same in kind: every fixed light with its baked shadow (render/bake.js),
// the hero's lamp and the sun casting shadows. What changes is how much is drawn for that, and
// nothing compiles a shader again (render/shadows.js); every change fades or eases in:
//   lamp    its shadows' reach, which enemies cast into it, how often its six maps are drawn,
//           how strong they are (the lowest level fades them out and stops drawing them)
//   sun     the size of its map of what moves, which enemies cast into it, how often it is drawn
//   cells   the fixed lights a point walks at most (render/lighthook.js uBakeK, eased: the last
//           light fades)
//   fluid   the fluids' patterns: texels a side, drawn how often a second (render/watercells.js)
//   motes   what drifts in the air
//   bake    how finely a cube is baked (render/bake.js BAKE_DETAIL: for the next cube baked; the
//           lightmap's texels a unit when a world starts)
//   movingSun whether the sun goes round with the time of day under an open sky, its shadows baked
//           again as it goes (game/daycycle.js; else it stays at noon and only the light turns)
//   dressing how far from the hero the surroundings' small dressing shows (render/neighbors.js:
//           flowers, grass and stones of the town's tiles round the one played in, most of what
//           they draw)
// A small device (render/device.js: phones, tablets) bakes no finer than `light` and keeps the
// sun's map at SMALL_SUN_MAP at most on every level: what its memory affords, whatever the frame rate.
import { graphics, onSettingsChange } from './settings.js';
import { BAKE } from '../render/lighthook.js';
import { setShadowLook, tickShadows, snapShadows } from '../render/shadows.js';
import { sun } from '../render/scene.js';
import { setMoteRate } from '../render/motes.js';
import { setCellDetail } from '../render/watercells.js';
import { setAutoQuality, autoQuality } from '../render/resolution.js';
import { setBakeDetail } from '../render/bake.js';
import { small, touchScreen, SMALL_SUN_MAP } from '../render/device.js';
import { setProxyDressing } from '../render/neighbors.js';

export const LEVELS = ['lowest', 'low', 'medium', 'high'];
// learn: light.html#looks #looks-code (see learn/README.md)
export const LOOKS = {
  high: { lamp: { range: Infinity, figures: Infinity, every: 1, strength: 1 }, sun: { map: 2048, figures: Infinity, every: 1 },
    cells: 16, fluid: [512, 0], motes: 1, bake: 'full', movingSun: true, dressing: Infinity },
  medium: { lamp: { range: 5, figures: 5, every: 1, strength: 1 }, sun: { map: 1024, figures: 12, every: 1 },
    cells: 12, fluid: [512, 30], motes: 1, bake: 'full', movingSun: true, dressing: 32 },
  low: { lamp: { range: 5, figures: 0, every: 2, strength: 1 }, sun: { map: 1024, figures: 8, every: 2 },
    cells: 8, fluid: [256, 30], motes: 0.5, bake: 'light', movingSun: true, dressing: 18 },
  lowest: { lamp: { range: 5, figures: 0, every: 2, strength: 0 }, sun: { map: 512, figures: 0, every: 2 },
    cells: 6, fluid: [256, 20], motes: 0.5, bake: 'lighter', movingSun: false, dressing: 10 },
};
const KEY = 'crawler.quality';    // the level Auto reached last
const CELL_EASE = 8;              // lights a second: how fast uBakeK follows

const saved = () => { try { return LEVELS.indexOf(localStorage.getItem(KEY)); } catch { return -1; } };
let level = -1, cells = BAKE.uBakeK.value;

// the level asked for now: the pinned one, or Auto's
const asked = () => graphics() === 'auto' ? autoQuality() : LEVELS.indexOf(graphics());
function settings() {
  if (graphics() === 'auto') {
    const start = level >= 0 ? level : saved() >= 0 ? saved() : touchScreen ? 1 : 2;
    setAutoQuality(LEVELS.length - 1, start);
  } else setAutoQuality(0, LEVELS.indexOf(graphics()));
}

// learn: light.html#looks-code (see learn/README.md)
function apply(n) {
  const L = LOOKS[LEVELS[n]];
  setShadowLook({ lamp: L.lamp, sun: { figures: L.sun.figures, every: L.sun.every, strength: 1 } });
  const map = small ? Math.min(L.sun.map, SMALL_SUN_MAP) : L.sun.map;
  if (sun.shadow.mapSize.x !== map) {
    sun.shadow.mapSize.set(map, map);
    sun.shadow.map?.dispose(); sun.shadow.map = null;   // (three makes it anew at the new size)
  }
  setCellDetail(...L.fluid);
  setMoteRate(L.motes);
  setBakeDetail(L.bake);   // (on a small device no finer than `light`: render/bake.js)
  setProxyDressing(L.dressing);
}

// every frame (main.js; dt: real seconds, the fades go on while the game is paused)
export function tickQuality(dt) {
  const n = asked();
  if (n !== level) {
    const first = level < 0;
    level = n;
    apply(n);
    if (first) { cells = LOOKS[LEVELS[n]].cells; snapShadows(); }   // (no fading in at the start)
    if (graphics() === 'auto') try { localStorage.setItem(KEY, LEVELS[n]); } catch { /* private mode */ }
  }
  const want = LOOKS[LEVELS[level]].cells;
  cells += Math.sign(want - cells) * Math.min(Math.abs(want - cells), dt * CELL_EASE);
  BAKE.uBakeK.value = cells;
  tickShadows(dt);
}
export const qualityLevel = () => LEVELS[level] ?? null;
// does the sun go round with the time of day on this level (game/daycycle.js)?
export const movingSun = () => LOOKS[LEVELS[level]]?.movingSun ?? true;

settings();
tickQuality(0);
onSettingsChange(settings);
