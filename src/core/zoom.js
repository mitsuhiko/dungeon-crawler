// Camera distance scales: smaller means closer. The overview starts 22% closer than it used to
// (PREVIOUS_ZOOM, itself 1.23x the first magnification): less of the world round the cube shows,
// the cube played in fills more of the screen.
export const PREVIOUS_ZOOM = 1 / 1.23;
export const ZOOM_IN = 1.22;                     // a step closer, from the default in
export const ZOOM_INTERVAL = 1.1;                // a step further out, past the previous default
export const DEFAULT_ZOOM = PREVIOUS_ZOOM / ZOOM_IN;
export const CLOSEST_ZOOM = DEFAULT_ZOOM / ZOOM_IN ** 2;                      // as close as before
export const FARTHEST_ZOOM = PREVIOUS_ZOOM * ZOOM_INTERVAL ** 2 * 1.1;        // as far as before
const zoomLevels = [
  CLOSEST_ZOOM,
  DEFAULT_ZOOM / ZOOM_IN,
  DEFAULT_ZOOM,
  PREVIOUS_ZOOM,
  PREVIOUS_ZOOM * ZOOM_INTERVAL,
  FARTHEST_ZOOM,
];
export const ZOOM_LEVELS = Object.freeze(zoomLevels.slice());

// Keyboard and wheel share six reversible presets: two closer than the default, three further.
// direction: -1 zooms in, +1 zooms out, 0 leaves the target unchanged.
export function stepZoom(target, direction) {
  if (!direction) return target;
  const step = zoomLevels.reduce((best, zoom, i) =>
    Math.abs(target - zoom) < Math.abs(target - zoomLevels[best]) ? i : best, 0);
  const next = Math.max(0, Math.min(zoomLevels.length - 1, step + Math.sign(direction)));
  return zoomLevels[next];
}
