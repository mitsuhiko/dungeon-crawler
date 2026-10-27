// The camera key (Tab, or C: core/keybinds.js `camera`; docs/camera.md). A tap switches
// between the overview and the close view and keeps it (game/settings.js). Held, the mouse
// turns the overview while it moves; the cursor hides meanwhile and what it points at stays as
// it was (game/pointer.js). The overview settles on the nearest of its four sides when the key
// is let go. No pointer lock for that: the browser would show its banner on every hold. The
// close view has the mouse captured anyway (game/mouselook.js), it turns without the key; there
// a hold and a move only keep the tap from switching.
import { keyPress, keyMove, keyRelease, snapYaw, clampPitch, YAW_PER_PX, PITCH_PER_PX } from '../core/view.js';
import { unturnMouse } from '../core/roll.js';
import { view, state, setStatus } from './state.js';
import { cameraMode, setCameraMode } from './settings.js';
import { looking } from './mouselook.js';
import { tr } from '../i18n/i18n.js';

let key = null;   // the press going on: { code, t0, moved, orbiting }

const canTurn = () => state.mode === 'play' && !state.inventoryOpen && !state.menuOpen && !state.leaveAsk && !state.deathAsk;

export function toggleCamera() {
  if (state.mode !== 'play') return;
  const close = cameraMode() !== 'close';
  setCameraMode(close ? 'close' : 'overview');   // (going back, the overview settles on a side: game/camera.js)
  setStatus(close ? tr('Close view') : tr('Overview'));
}

export function cameraKeyDown(code) {
  if (!key) key = { code, ...keyPress(performance.now()) };
}
// a key let go: if it is the one held, a tap switches the view
export function cameraKeyUp(code) {
  if (!key || key.code !== code) return;
  const done = keyRelease(key, performance.now());
  stop();
  if (done === 'toggle') toggleCamera();
}
// the window lost the keys (blur): the turning ends, nothing switches
export function cancelCameraKey() { stop(); }
export const cameraKeyHeld = () => !!key;

function stop() {
  if (key?.orbiting && cameraMode() !== 'close') view.yawTarget = snapYaw(view.yawTarget);
  key = null;
  view.orbiting = false;
  document.body.classList.remove('orbiting');
}

addEventListener('pointermove', e => {
  if (!key || e.pointerType === 'touch' || !canTurn()) return;
  if (!keyMove(key, e.movementX, e.movementY) || looking()) return;
  view.orbiting = true;
  document.body.classList.add('orbiting');
  // right turns the view to the right (the yaw is where the camera stands, seen from the hero), on
  // the screen as the world is rolled on it (game/roll.js)
  const [mx, my] = unturnMouse(e.movementX, e.movementY, view.roll);
  view.yaw -= mx * YAW_PER_PX;
  view.yawTarget = view.yaw;
  if (cameraMode() === 'close') view.pitch = clampPitch(view.pitch + my * PITCH_PER_PX);
});
