// Render resolution that follows the frame rate (render/resolution.js applies it). On a high-DPI
// screen the GPU shades up to four pixels per CSS pixel; when frames come too slowly because of
// that, the resolution steps down, and creeps back up after a while of smooth frames.
//   - The anti-aliasing is not a step: it stays as the settings say (render/msaa.js: a new number
//     of samples rebuilds every pipeline, seconds of frozen frames).
//   - Frames are judged a second at a time (its hitches left out: steady), by the time between frames and by how much of it the
//     frame's own work (JavaScript, handing the draws to the GPU) took: slow frames that are
//     mostly that work are CPU-bound, and fewer pixels would not help.
//   - Every step down has to prove itself: if the next second is not clearly faster (a CPU-bound
//     frame after all, or a browser that caps the frame rate, like Safari in low power mode), it
//     is taken back and that kind of step rests for a while: a quality level that did not help
//     says nothing about the pixels, so the resolution goes down next (and the other way round).
//   - Stepping up again waits for a calm spell, twice as long each time a step up had to be taken
//     back right away, so the resolution does not see-saw.
//   - Under a frame rate cap (the settings, game/settings.js) frames are judged against the cap:
//     30 frames a second that were asked for are not slow.
//   - With the lighting on Auto (game/quality.js) the quality level is a step too (`levels` above
//     the lowest, `level` the one now). Down: the level first, then the resolution; slow frames
//     that are CPU-bound take only the level down (fewer shadow maps drawn is less work for the
//     CPU too). Up: the resolution first, then the level. A level's step is judged a second
//     later than the others (QUALITY_SETTLE): what it changes fades in over half a second.
//   - The settings may pin the resolution (game/settings.js resolution): `setRange` with min = max,
//     and only the quality level still steps.

export const SLOW = 1000 / 50;       // ms between frames: slower than 50 fps is too slow
const SMOOTH = 1000 / 57;            // ms between frames: faster than ~57 fps (vsync at 60 or more)
const CAP_SLOW = 1.2, CAP_SMOOTH = 1.05;   // under a cap: too slow / smooth, times the capped interval
const CPU_BOUND = 0.6;               // the frame's work takes this much of the time between frames
const STALL = 250;                   // ms: a hitch, a background tab; not counted
const WINDOW = 1000;                 // ms of frames judged at a time
const DOWN = 0.85, UP = 1.1;         // a step's factor
const PROOF = 0.9;                   // a step down must make frames at least this much shorter
const CALM = 4000, CALM_MAX = 64000; // ms of smooth frames before a step up
const REST = 30000;                  // ms without that kind of step down after one that did not help
const QUALITY_SETTLE = 1;           // windows a quality step waits before it is judged
// A window's hitches are not counted: frames over HITCH times its median (and over HITCH_MS) are
// a shader compiling or a cube built, not slow frames; a level stepped down for them was kept for
// the next visit too (game/quality.js). Slow frames all along leave the median slow: counted.
const HITCH = 3, HITCH_MS = 50;
// the average without the window's hitches
function steady(list) {
  const s = [...list].sort((a, b) => a - b), cut = Math.max(HITCH_MS, s[s.length >> 1] * HITCH);
  let sum = 0, n = 0;
  for (const v of s) if (v <= cut) { sum += v; n++; }
  return n ? sum / n : s[s.length >> 1];
}

// The pixel ratio the screen asks for (devicePixelRatio, at most 2: a 3x phone draws at 2x),
// and on a small device (render/device.js) no more than SMALL_PIXELS pixels in a w x h CSS
// pixel view, but never under 1. Auto (render/resolution.js) goes no higher. Memory, not the
// frame rate: a tablet holds 30 frames a second at 2x, and Auto then climbs back to it, but
// every pixel of the canvas (its colour and depth, the MSAA buffers, what Safari keeps to show
// it) stays in memory as long as the page, which iOS Safari kills past its limit. Phones keep
// their 2x (an iPhone 16e is 1.3 million pixels at 2x, a Pro Max 1.7); an 11" iPad draws about
// 1.45x, a 13" 1.2x.
export const SMALL_PIXELS = 2.1e6;
export function nativeRatio(dpr, w, h, small = false) {
  const r = Math.min(dpr || 1, 2);
  return small && w * h > 0 ? Math.min(r, Math.max(1, Math.sqrt(SMALL_PIXELS / (w * h)))) : r;
}

export function resolutionController(max, min = Math.min(max, Math.max(0.6, max / 2)), quality = {}) {
  let levels = quality.levels ?? 0, level = quality.level ?? levels;
  let ratio = max, sum = 0, work = 0, n = 0, span = 0;
  const seen = [];   // the window's intervals
  let smooth = 0, calm = CALM, rest = 0, restLevel = 0, trial = null, raised = -Infinity, clock = 0;
  const clamp = r => Math.min(max, Math.max(min, r));
  // interval: ms since the last frame; spent: ms the frame's own work took; target: ms between
  // frames the frame rate cap asks for (0: no cap).
  // Returns the new ratio when it changes, else null (`level` may have changed all the same).
  function tick(interval, spent, target = 0) {
    if (!(interval > 0) || interval > STALL) return null;
    clock += interval; rest = Math.max(0, rest - interval); restLevel = Math.max(0, restLevel - interval);
    sum += interval; work += spent; n++; span += interval; seen.push(interval);
    if (span < WINDOW) return null;
    const avg = steady(seen), busy = work / sum;
    const slow = Math.max(SLOW, target * CAP_SLOW), fast = Math.max(SMOOTH, target * CAP_SMOOTH);
    sum = work = n = span = 0; seen.length = 0;
    if (trial) {   // the second after a step down: did it help?
      if (trial.wait > 0) { trial.wait--; return null; }
      const t = trial; trial = null;
      if (avg > t.before * PROOF) { if (t.pixels) rest = REST; else restLevel = REST; level = t.level; return set(t.from); }
    }
    if (avg > slow) {
      smooth = 0;
      if (clock - raised < 3000) calm = Math.min(CALM_MAX, calm * 2);   // the step up was too much
      const gpu = busy < CPU_BOUND;
      if (level > 0 && !restLevel) { trial = { from: ratio, level, before: avg, wait: QUALITY_SETTLE }; level--; return null; }
      if (gpu && ratio > min && !rest) { trial = { from: ratio, level, before: avg, pixels: true }; return set(clamp(ratio * DOWN)); }
      return null;
    }
    smooth = avg < fast ? smooth + WINDOW : 0;
    if (smooth >= calm && (ratio < max || level < levels)) {
      smooth = 0; raised = clock;
      if (ratio < max) return set(clamp(ratio * UP));
      level++;
    }
    return null;
  }
  function set(r) { if (r === ratio) return null; ratio = r; return r; }
  // the ratios it goes between from now (the same: pinned); it starts again at the highest, and
  // returns it
  function setRange(hi, lo = Math.min(hi, Math.max(0.6, hi / 2))) {
    max = hi; min = Math.min(lo, hi); ratio = max;
    trial = null; smooth = 0; calm = CALM; rest = restLevel = 0;
    return ratio;
  }
  // the quality levels to step through (0: none, the lighting is not on Auto), the level now
  function setQuality(n, now = n) { levels = n; level = Math.max(0, Math.min(n, now)); if (trial) trial.level = level; }
  return { tick, setQuality, setRange, get ratio() { return ratio; }, get level() { return level; }, get levels() { return levels; },
    get min() { return min; }, get max() { return max; } };
}
