// The two views (docs/camera.md): the overview, high over the cube, and the close view behind
// the hero. Pure numbers and the camera key's tap / hold decision, for game/camera.js and
// game/camerakey.js.
import { DEFAULT_ZOOM } from './zoom.js';

export const OVERVIEW_FOV = 28, CLOSE_FOV = 60;   // vertical field of view (degrees; the close view's at first: the settings)
export const BLEND_TIME = 0.4;                    // s from one view to the other

// The overview looks from one of four sides, diagonally over the cube (the yaw the game starts
// with, and what Q / E turn it by); after the mouse turned it, it settles on the nearest one.
export const SIDE0 = -Math.PI / 4;
export const snapYaw = yaw => SIDE0 + Math.round((yaw - SIDE0) / (Math.PI / 2)) * Math.PI / 2;

// The close view: the camera on an arm from a point at the hero's shoulders, `pitch` over the
// level (rad, looking down; less looks up), as long as the zoom says (the same six presets:
// about 1.2 to 4.7 units, 3 at the default) and shorter where something is in the way
// (game/camera.js). The middle of the screen is the pivot, a little over the hero's head: the
// crosshair (game/mouselook.js). The overview's presets lie closer round its default than they
// spread out past it (core/zoom.js), so the arm grows faster closing in than going out
// (CLOSE_IN, CLOSE_OUT): the same lengths as before the overview started closer.
export const ANCHOR = 1.2;          // the arm's pivot over the feet
export const AHEAD = 2;             // the camera looks at a point this far past the pivot
export const PITCH = 0.24, PITCH_MIN = -0.45, PITCH_MAX = 1.1;
export const clampPitch = p => Math.min(PITCH_MAX, Math.max(PITCH_MIN, p));
const CLOSE_IN = 2.4, CLOSE_OUT = 0.943;
export const closeDistance = zoom => 3 * (zoom / DEFAULT_ZOOM) ** (zoom < DEFAULT_ZOOM ? CLOSE_IN : CLOSE_OUT);
// where the close camera looks (seen from above): its yaw is where it stands, seen from the hero
export const forwardYaw = yaw => yaw + Math.PI;

// Mouse look (the close view, game/mouselook.js): rad the view turns per pixel the mouse moves,
// at look speed 1 (the settings: a slider in percent, LOOK_SPEED_MIN to LOOK_SPEED_MAX)
export const LOOK_PER_PX = 0.0035;
export const LOOK_SPEED_MIN = 0.2, LOOK_SPEED_MAX = 3;
export const clampLookSpeed = s => (Number.isFinite(s) ? Math.min(LOOK_SPEED_MAX, Math.max(LOOK_SPEED_MIN, s)) : 1);
// what one mouse movement does to the view: { yaw, pitch } turned by (dx, dy) px; right turns
// right (the yaw goes down), down looks down (the pitch goes up), unless `invert`
export function look(yaw, pitch, dx, dy, speed = 1, invert = false) {
  const k = LOOK_PER_PX * speed;
  return { yaw: yaw - dx * k, pitch: clampPitch(pitch + dy * k * (invert ? -1 : 1)) };
}
// a mouse movement this big in one event is the browser's glitch (Chrome jumps right after
// locking now and then), not the hand
export const LOOK_SPIKE = 300;

// The camera key: a tap switches the view, holding it while the mouse moves turns the view.
// A press is a tap when it is let go within TAP_MS and the mouse did not turn the view; the
// mouse turns it once it moved ORBIT_PX while the key is down (no need to wait).
export const TAP_MS = 250, ORBIT_PX = 4;
export const YAW_PER_PX = 0.008, PITCH_PER_PX = 0.005;
export const keyPress = t => ({ t0: t, moved: 0, orbiting: false });
// true once the movement turns the view
export function keyMove(k, dx, dy) {
  k.moved += Math.abs(dx) + Math.abs(dy);
  if (k.moved >= ORBIT_PX) k.orbiting = true;
  return k.orbiting;
}
// what letting go does: 'toggle' (switch the view), 'orbited' (the view was turned) or null
export const keyRelease = (k, t) => (k.orbiting ? 'orbited' : t - k.t0 < TAP_MS ? 'toggle' : null);
