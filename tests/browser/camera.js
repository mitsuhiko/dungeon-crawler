// Browser checks for the two views (docs/camera.md): the camera key (tap, hold, the mouse
// turning the view, the overview settling on a side), the close view's cutaway and walls, its
// arm out of the solids and the player's bar at the bottom of the screen; mouse look (capturing
// and giving back the mouse, turning, the crosshair, clicks) and the lock-on. Pointer lock is
// stood in for (headless Chrome has none): what the browser does is faked, what the game does
// is checked. In a cave of the current world (a horde's: /horde 7), the enemies kept still. The
// settings come back afterwards. From the console:
//   await (await import('./tests/browser/camera.js')).runCameraChecks()
import * as THREE from 'three';
import { N } from '../../src/core/constants.js';
import { player, state, view } from '../../src/game/state.js';
import { cameraMode, setCameraMode } from '../../src/game/settings.js';
import { settleCamera, closeView, closeArm, updateCamera } from '../../src/game/camera.js';
import { updateCut } from '../../src/game/cut.js';
import { insideSolid } from '../../src/physics/collide.js';
import { camera } from '../../src/render/scene.js';
import { U } from '../../src/render/cutshader.js';
import { snapYaw, closeDistance, LOOK_PER_PX, PITCH } from '../../src/core/view.js';
import { renderer } from '../../src/render/scene.js';
import { updateMouseLook, looking, capture, mouseLook, lookBy, escJustReleased } from '../../src/game/mouselook.js';
import { lockTarget, toggleLock, releaseLock, updateLockOn } from '../../src/game/lockon.js';
import { lockYaw, wrapAngle, LOCK_RANGE } from '../../src/core/lockon.js';
import { pointer, updatePointer, hoveredEnemy } from '../../src/game/pointer.js';
import { setInventoryOpen } from '../../src/game/inventory.js';
import { setMenuOpen } from '../../src/game/escmenu.js';
import { lookSpeed, setLookSpeed, invertLook, setInvertLook } from '../../src/game/settings.js';
import { allEnemies } from '../../src/game/enemies.js';
import { absent } from '../../src/core/enemies.js';
import { clearLine } from '../../src/physics/enemynav.js';
import { order } from '../../src/game/orders.js';
import { combatStats } from '../../src/core/combat.js';
import { goHorde } from '../../src/game/dev.js';
import '../../src/game/input.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const down = code => { const e = new KeyboardEvent('keydown', { code, key: code, cancelable: true }); dispatchEvent(e); return e; };
const up = code => dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
const move = (dx, dy) => dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: dx, movementY: dy }));
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

export async function runCameraChecks() {
  const mode = cameraMode(), yaw = view.yawTarget, pitch = view.pitch, results = [];
  const speed = lookSpeed(), inverted = invertLook(), passive = state.devPassive;
  try {
    if (!state.map?.walled) await goHorde(7);
    check(state.map?.walled, 'Needs a cave');
    await delay(500);

    // the keys
    setCameraMode('overview'); settleCamera();
    const tap = down('Tab'); await delay(40); up('Tab');
    check(tap.defaultPrevented && cameraMode() === 'close', 'A tap on Tab switches to the close view (and the focus stays)');
    down('KeyC'); await delay(40); up('KeyC');
    check(cameraMode() === 'overview', 'A tap on C switches back');
    down('Tab'); await delay(400); up('Tab');
    check(cameraMode() === 'overview', 'A long hold does not switch');
    down('Tab'); dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab', repeat: true })); await delay(40); up('Tab');
    check(cameraMode() === 'close', 'Key repeats do not count as presses');
    results.push('tap switches, hold and repeats do not');

    // turning with the mouse: the close view freely, also up and down
    settleCamera();
    const y0 = view.yaw, p0 = view.pitch;
    down('Tab');
    for (let i = 0; i < 5; i++) move(10, 4);
    check(view.orbiting && document.body.classList.contains('orbiting'), 'Holding and moving the mouse turns the view, the cursor hides');
    check(view.yaw < y0 && view.pitch > p0, 'Right and down: the view turns right and looks down more');
    up('Tab');
    check(cameraMode() === 'close' && !view.orbiting && !document.body.classList.contains('orbiting'), 'Letting go after turning does not switch');
    // ... the overview settles on the nearest side
    setCameraMode('overview'); settleCamera();
    down('Tab'); move(30, 0); move(30, 0); up('Tab');
    check(near(view.yawTarget, snapYaw(view.yawTarget)), 'The overview settles on one of its four sides');
    down('Tab'); move(30, 0); dispatchEvent(new Event('blur'));
    check(!view.orbiting && cameraMode() === 'overview', 'Losing the window ends the turning without switching');
    results.push('the mouse turns the view; the overview settles on a side');

    // the close view: no cutaway, the cave walls stay up, the neighbours' reveal is off
    view.yaw = view.yawTarget = snapYaw(view.yawTarget); view.pitch = pitch;
    updateCut(0);
    check(U.uFront.value.x + U.uFront.value.y + U.uFront.value.z + U.uFront.value.w > 0, 'In a cave the overview lowers the walls on its side');
    setCameraMode('close'); settleCamera(); updateCut(0);
    check(closeView() && U.uCutY.value >= 999 && U.uFront.value.x + U.uFront.value.y + U.uFront.value.z + U.uFront.value.w === 0, 'The close view cuts nothing');
    check(near(camera.fov, 60), 'The close view has the wide lens');
    results.push('close view: no cut, walls up, wide lens');

    // its arm: never in a solid, all around the hero, as long as the zoom says where it is free
    let shortest = Infinity;
    for (let k = 0; k < 16; k++) {
      view.yaw = view.yawTarget = k * Math.PI / 8;
      settleCamera();
      const c = camera.position;
      check(!insideSolid(c.x, c.z, c.y) || c.x < 0 || c.z < 0 || c.x >= N || c.z >= N, `The camera is in a solid at yaw ${k}/16`);
      check(closeArm() <= closeDistance(view.zoom) + 1e-6, 'The arm is never longer than the zoom says');
      shortest = Math.min(shortest, closeArm());
    }
    results.push(`arm out of the solids all around (shortest ${shortest.toFixed(2)})`);

    // the player's bar at the bottom of the screen
    updateCamera(0);
    const { updatePlayerBar } = await import('../../src/render/playerbar.js');
    updatePlayerBar(true);
    const bar = new THREE.Vector3(); let found = null;
    for (const o of (await import('../../src/render/scene.js')).scene.children) {
      if (o.isGroup && o.visible && o.children.length === 3 && Math.abs(o.scale.x - 1) > 1e-3) found = o;
    }
    check(found, 'The player bar is drawn in the close view');
    bar.copy(found.position).project(camera);
    check(bar.y < -0.6 && Math.abs(bar.x) < 0.05, 'The player bar sits at the bottom middle of the screen');
    results.push('player bar at the bottom of the screen');

    await mouseLookChecks(results);
    return results;
  } finally {
    unfake();
    releaseLock(); setMenuOpen(false); setInventoryOpen(false);
    setLookSpeed(speed); setInvertLook(inverted); state.devPassive = passive;
    view.yawTarget = yaw; view.pitch = pitch;
    setCameraMode(mode); settleCamera();
  }
}

// the browser's side of pointer lock, faked: capturing always works, `lose()` is Esc
const canvas = renderer.domElement;
let locked = false;
const changed = () => document.dispatchEvent(new Event('pointerlockchange'));
function fake() {
  locked = false;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (locked ? canvas : null) });
  canvas.requestPointerLock = () => { locked = true; changed(); return Promise.resolve(); };
  document.exitPointerLock = () => { locked = false; changed(); };
}
function unfake() {
  locked = false;
  delete document.pointerLockElement; delete canvas.requestPointerLock; delete document.exitPointerLock;
}
const lose = () => { locked = false; changed(); };
const mouse = (dx, dy) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy }));
const press = button => canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', button, bubbles: true, cancelable: true }));
const shown = id => !document.getElementById(id).hidden;

async function mouseLookChecks(results) {
  fake();
  state.devPassive = true;
  setLookSpeed(1); setInvertLook(false);

  // capturing: the close view wants the mouse; a click captures it, and only captures
  setCameraMode('overview'); settleCamera(); updateMouseLook();
  check(!mouseLook() && !shown('crosshair') && !document.body.classList.contains('look'), 'The overview has no mouse look');
  setCameraMode('close'); settleCamera(); updateMouseLook();
  check(mouseLook() && shown('crosshair') && shown('look-hint') && !looking(), 'The close view shows the crosshair and asks for a click');
  player.sword.requested = false;
  press(0);
  check(looking() && !player.sword.requested, 'A click captures the mouse, and does nothing else');
  updateMouseLook();
  check(!shown('look-hint'), 'Captured: no hint');
  results.push('the close view captures the mouse on a click');

  // turning: right turns right, down looks down; the speed and invert settings; no spikes
  view.pitch = PITCH;
  mouse(5, 5);   // (the first movement after capturing is skipped)
  const y0 = view.yaw, p0 = view.pitch;
  mouse(40, 0);
  check(near(view.yaw, y0 - 40 * LOOK_PER_PX) && near(view.yawTarget, view.yaw), 'The mouse turns the view right at once');
  mouse(0, 20);
  check(view.pitch > p0, 'Down looks down');
  setInvertLook(true); mouse(0, 20); setInvertLook(false);
  check(near(view.pitch, p0), 'Inverted, down looks up');
  setLookSpeed(2); const y1 = view.yaw; mouse(10, 0); setLookSpeed(1);
  check(near(view.yaw, y1 - 20 * LOOK_PER_PX), 'The look speed scales it');
  const y2 = view.yaw; mouse(5000, 0);
  check(view.yaw === y2, 'A jump of thousands of pixels is a glitch, not the hand');
  updatePointer();
  check(pointer.inside && pointer.ndc.x === 0 && pointer.ndc.y === 0, 'The crosshair is the cursor');
  results.push('mouse look turns the view, with speed and invert');

  // what needs the cursor gives it back, without the menu
  setInventoryOpen(true); updateMouseLook();
  check(!looking() && !state.menuOpen && !shown('crosshair'), 'The inventory gives the mouse back');
  setInventoryOpen(false); updateMouseLook();
  check(!looking() && shown('look-hint'), 'Closed (without a key to capture with): the hint asks for a click');
  capture();
  check(looking(), 'Captured again');
  // losing it on its own (Esc): the menu opens, and that Esc does not close it again
  lose();
  check(state.menuOpen && escJustReleased(), 'Losing the mouse (Esc) opens the menu');
  dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', cancelable: true }));
  check(state.menuOpen, 'The Esc that gave the mouse back does not close the menu');
  updateMouseLook();
  check(!looking() && !shown('crosshair'), 'The menu keeps the mouse free');
  capture();
  check(!looking(), 'Nothing captures it while the menu is open');
  setMenuOpen(false); capture();
  // the camera key back to the overview gives it back
  down('Tab'); await delay(40); up('Tab'); updateMouseLook();
  check(cameraMode() === 'overview' && !looking() && !document.body.classList.contains('look'), 'The overview gives the mouse back');
  results.push('the inventory, Esc and the overview give the mouse back; Esc opens the menu once');

  // clicks: an attack where the crosshair is (no walking), held: more
  setCameraMode('close'); settleCamera(); updateMouseLook(); capture();
  const p = player;
  if (combatStats(p)) {
    p.sword.requested = false;
    press(0);
    check(p.sword.requested && !order.kind, 'A click attacks, it does not walk');
    check(pointer.down && pointer.mode === 'look', 'Held, it keeps attacking (game/update.js)');
    dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', button: 0 }));
    results.push('a click attacks where the crosshair is');
  }

  // the lock-on: the enemy ahead, the camera swings round to it, it is the hovered one
  const sees = e => clearLine(p.x, p.y + 0.6, p.z, e.x, e.y + e.profile.bodyHeight * 0.5, e.z);
  const e = allEnemies().find(e => !absent(e) && Math.hypot(e.x - p.x, e.z - p.z) < LOCK_RANGE - 1 && Math.hypot(e.x - p.x, e.z - p.z) > 1 && sees(e));
  if (e) {
    view.yaw = view.yawTarget = lockYaw(p.x, p.z, e.x, e.z) + 0.2;
    press(2);
    check(lockTarget(), 'The right button locks on to an enemy ahead');
    const t = lockTarget();
    for (let i = 0; i < 30; i++) updateLockOn(1 / 30);
    check(Math.abs(wrapAngle(view.yaw - lockYaw(p.x, p.z, t.x, t.z))) < 0.02, 'The camera swings round to keep it in view');
    updatePointer();
    check(hoveredEnemy() === t, 'The locked enemy is the hovered one');
    const ly = view.yaw; mouse(10, 0);
    check(view.yaw === ly, 'Locked, a little sideways movement does not turn the view');
    press(2);
    check(!lockTarget(), 'Pressed again: let go');
    results.push('lock-on: picks, swings the camera, hovers, lets go');
  }
  // nothing to lock on to: the camera turns behind the hero
  const enemies = allEnemies().filter(e => !absent(e));
  const saved = enemies.map(e => [e, e.mode]);
  for (const [en] of saved) en.mode = 'gone';
  try {
    view.yaw = view.yawTarget = p.yaw;   // looking at the hero's face
    press(2);
    check(!lockTarget() && Math.abs(wrapAngle(view.yawTarget - (p.yaw + Math.PI))) < 1e-6, 'Nothing to lock on to: the camera turns behind the hero');
  } finally { for (const [en, m] of saved) en.mode = m; }
  results.push('right button with nothing there: behind the hero');
  unfake();
}
