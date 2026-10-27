// Mouse look in the close view (docs/camera.md): the mouse is captured (pointer lock) and turns
// the view, left and right and up and down, as in other third-person games. A crosshair in the
// middle of the screen is what the cursor was: what it is on is hovered (game/pointer.js), a
// click attacks there (game/input.js lookClick), the right button locks on (game/lockon.js).
//
// The mouse is captured whenever the close view is played and nothing needs the cursor; what
// does (the Esc menu and the settings, the inventory and trading, the chat, "Leave the fight?",
// the teleport scroll's menu, the main menu, the overview) gives it back while it is open.
// Browsers only capture it right after a click or a key (not Esc), so it comes back by itself
// when one of those closed it (or switched to the close view); else (closed with Esc, a page
// loaded straight into the close view) a hint asks for a click, and that click only captures.
// Esc while captured is the browser's: it gives the mouse back and the page may never see the
// key, so losing the capture on its own (Esc, another window) opens the Esc menu. Chrome refuses
// to capture again for a moment after that; a refused capture is tried again a little later.
// Touch has no mouse look (its turn buttons and pinch stay).
import { state, view } from './state.js';
import { cameraMode, lookSpeed, invertLook } from './settings.js';
import { look, LOOK_SPIKE } from '../core/view.js';
import { unturnMouse } from '../core/roll.js';
import { renderer } from '../render/scene.js';
import { setMenuOpen } from './escmenu.js';
import { settingsOpen } from './settingsmenu.js';
import { teleportMenuOpen } from './teleportmenu.js';
import { chatOpen } from './console.js';
import { lockTarget, nudgeLock, releaseLock } from './lockon.js';

const canvas = renderer.domElement, $ = id => document.getElementById(id);
const crosshair = $('crosshair'), hint = $('look-hint');
const RETRY_MS = 1200;      // a refused capture is tried again after this long
const GESTURE_MS = 4000;    // without navigator.userActivation: how long after a click or key a capture may be asked for
const ESC_MS = 400;         // an Esc that comes this soon after the capture was lost was that loss

let pending = false;        // a capture asked for, not answered yet
let releasing = false;      // we gave the mouse back ourselves (not Esc)
let retryAt = 0, gestureAt = -Infinity, lostAt = -Infinity;
let skip = false;           // the first movement after capturing (Chrome's can be a jump)

// does the mouse look around (the close view is played with a mouse)?
export const mouseLook = () => state.mode === 'play' && cameraMode() === 'close' && !document.body.classList.contains('touch');
// is the mouse captured?
export const looking = () => document.pointerLockElement === canvas;
// what needs the cursor
const busy = () => state.inventoryOpen || state.menuOpen || !!state.leaveAsk || !!state.deathAsk || settingsOpen() || teleportMenuOpen() || chatOpen();
const wanted = () => mouseLook() && !busy();
// was this Esc the one that just gave the mouse back (game/input.js: it must not close the
// menu it opened)?
export const escJustReleased = () => performance.now() - lostAt < ESC_MS;

// may we ask for a capture now (a click or a key, not Esc, just before)?
const gesture = () => navigator.userActivation?.isActive ?? performance.now() - gestureAt < GESTURE_MS;
addEventListener('keydown', e => { if (e.code !== 'Escape') gestureAt = performance.now(); }, true);
addEventListener('pointerdown', () => { gestureAt = performance.now(); }, true);

function refused() { pending = false; retryAt = performance.now() + RETRY_MS; }
// capture the mouse (a click on the game while not captured, game/input.js; else each frame)
export function capture() {
  if (pending || looking() || !canvas.requestPointerLock || !wanted()) return;
  pending = true;
  try {
    const r = canvas.requestPointerLock();
    if (r?.then) r.then(() => { pending = false; }, refused);
  } catch { refused(); }
}
function release() {
  if (!looking()) return;
  releasing = true;
  document.exitPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  pending = false;
  if (looking()) { skip = true; return; }
  const ours = releasing;
  releasing = false;
  // lost on its own (Esc, another window, the tab hidden): the menu, as Esc would open it
  if (!ours && wanted()) { lostAt = performance.now(); setMenuOpen(true); }
});
document.addEventListener('pointerlockerror', refused);

// the mouse moved this far (px) while captured: the view turns (with a lock-on, sideways
// movement moves the lock instead: game/lockon.js). The world rolled (game/roll.js), it turns the
// way the mouse went on the screen
export function lookBy(dx, dy) {
  [dx, dy] = unturnMouse(dx, dy, view.roll);
  const turned = look(view.yaw, view.pitch, dx, dy, lookSpeed(), invertLook());
  if (lockTarget()) nudgeLock(dx);
  else { view.yaw = view.yawTarget = turned.yaw; }
  view.pitch = turned.pitch;
}
document.addEventListener('mousemove', e => {
  if (!looking() || !wanted()) return;
  if (skip) { skip = false; return; }
  if (Math.abs(e.movementX) > LOOK_SPIKE || Math.abs(e.movementY) > LOOK_SPIKE) return;
  lookBy(e.movementX, e.movementY);
});

// every frame: capture or give back the mouse as the game asks; the crosshair and the hint
export function updateMouseLook() {
  const want = wanted(), on = looking();
  if (!mouseLook() && lockTarget()) releaseLock();
  if (on && !want) release();
  else if (!on && want && !pending && performance.now() >= retryAt && gesture()) capture();
  document.body.classList.toggle('look', want);
  crosshair.hidden = !want;
  hint.hidden = !want || looking() || pending;
}
