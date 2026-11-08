// The render resolution follows the frame rate (core/resolution.js): main.js hands over when each
// frame began, after it rendered. With the lighting on Auto the quality level (game/quality.js)
// goes down before the resolution; the anti-aliasing stays as set (render/msaa.js).
// Auto goes no higher than the screen's ratio, on a small device no higher than its pixel budget
// (core/resolution.js nativeRatio: a tablet's memory), which follows the window's size.
// The settings (game/settings.js resolution) may pin it too: a share of the screen's own pixels
// (main.js setResolution: asked for, so not held to the budget). ?res=<pixel ratio> pins it over
// both (1: CSS pixels), e.g. to compare.
import { requestFit, viewSize } from './scene.js';
import { resolutionController, nativeRatio } from '../core/resolution.js';
import { small } from './device.js';

const pinned = Number(new URLSearchParams(location.search).get('res'));
const screenRatio = () => Math.min(devicePixelRatio, 2);
const native = () => { const { w, h } = viewSize(); return nativeRatio(devicePixelRatio, w, h, small); };
const control = pinned > 0 ? null : resolutionController(native());
let share = 'auto';
let last = 0;

// the canvas takes the new ratio right before the next frame is drawn (scene.js fitView): resized
// now, after this frame was drawn, it would show empty for a frame
const apply = ratio => requestFit(ratio);
if (pinned > 0) apply(pinned);

// start: performance.now() when the frame began (it has rendered by now); fps: the frame rate
// cap (0: none), frames are not too slow for coming at the rate asked for; drawn: whether it drew
// the world (behind the curtain a frame may not: not counted)
export function tickResolution(start, fps = 0, drawn = true) {
  const interval = last ? start - last : 0;
  last = start;
  if (!control || !drawn) return;
  const ratio = control.tick(interval, performance.now() - start, fps ? 1000 / fps : 0);
  if (ratio) apply(ratio);
}

// 'auto': it follows the frame rate, between the screen's pixels and half of them (at least 0.6);
// a number: that share of the screen's pixels, always
export function setResolution(s) {
  if (!control || s === share) return;
  share = s;
  apply(s === 'auto' ? control.setRange(native()) : control.setRange(screenRatio() * s, screenRatio() * s));
}
// the window changed size (Split View, Stage Manager; turning keeps its pixels): Auto starts
// again from the budget's ratio when that moved
if (control && small) addEventListener('resize', () => {
  if (share === 'auto' && Math.abs(native() / control.max - 1) > 0.02) apply(control.setRange(native()));
});

// the quality levels Auto steps through (levels above the lowest; 0: not on Auto) and the one
// to start from; the level it chose (game/quality.js follows it)
let fixed = 0;
export function setAutoQuality(levels, level) { fixed = level; control?.setQuality(levels, level); }
export const autoQuality = () => control ? control.level : fixed;
// the pixel ratio now (the perf overlay, game/perf.js)
export const resolutionState = () => ({ ratio: control?.ratio ?? pinned });
