// Lock-on in the close view (docs/camera.md; the numbers: core/lockon.js). The right mouse button
// locks on to the enemy under the crosshair, else the one nearest the middle of the view (in
// range and in sight); the camera then swings round to keep it in view past the hero, and it
// counts as hovered (game/pointer.js): clicks, Shift and flasks go for it, its health shows. A
// quick flick of the mouse sideways moves the lock to the next enemy on that side; up and down
// still tilt the view. Pressed again, or the enemy dead, too far, out of sight for a while, the
// overview, travelling: let go. Pressed with nothing to lock on to: the camera turns round
// behind the hero.
import * as THREE from 'three';
import { player, state, view } from './state.js';
import { allEnemies } from './enemies.js';
import { absent, baseY } from '../core/enemies.js';
import { clearLine } from '../physics/enemynav.js';
import { camera } from '../render/scene.js';
import { pickLock, nextLock, lockYaw, wrapAngle, LOCK_RANGE, LOCK_DROP, LOCK_BLIND, LOCK_TURN, FLICK_PX } from '../core/lockon.js';
import { forwardYaw } from '../core/view.js';
import { mouseLook } from './mouselook.js';

const marker = document.getElementById('lock-marker');
let target = null, blind = 0, flick = 0;

const chest = e => baseY(e) + e.profile.bodyHeight * 0.5;
const sees = e => clearLine(player.x, player.y + 0.6, player.z, e.x, chest(e), e.z);
const inRange = e => Math.hypot(e.x - player.x, e.z - player.z) <= LOCK_RANGE;
const candidates = () => allEnemies().filter(e => !absent(e) && inRange(e) && sees(e));

export const lockTarget = () => target;
export function releaseLock() { target = null; blind = flick = 0; marker.hidden = true; }
function lockOn(e) { target = e; blind = flick = 0; }

// the right mouse button: `hovered` is the enemy under the crosshair
export function toggleLock(hovered) {
  if (target) { releaseLock(); return; }
  const e = hovered && !absent(hovered) && inRange(hovered) && sees(hovered) ? hovered : pickLock(player, forwardYaw(view.yaw), candidates());
  if (e) { lockOn(e); return; }
  // nothing to lock on to: behind the hero (game/camera.js eases the yaw there)
  view.yawTarget = view.yaw + wrapAngle(forwardYaw(player.yaw) - view.yaw);
}

// the mouse moved sideways by dx px while locked (game/mouselook.js)
export function nudgeLock(dx) {
  if (!target) return;
  flick += dx;
  if (Math.abs(flick) < FLICK_PX) return;
  const next = nextLock(player, target, candidates(), Math.sign(flick));
  flick = 0;
  if (next) lockOn(next);
}

// every frame, before the camera: let go when it is time, else keep the locked enemy in view
export function updateLockOn(dt) {
  if (!target) return;
  const d = Math.hypot(target.x - player.x, target.z - player.z);
  if (!mouseLook() || state.transitioning || absent(target) || d > LOCK_DROP || !allEnemies().includes(target)) { releaseLock(); return; }
  blind = sees(target) ? 0 : blind + dt;
  if (blind > LOCK_BLIND) { releaseLock(); return; }
  flick *= Math.exp(-dt * 5);   // only a quick flick moves the lock on
  if (d > 0.4) {
    view.yaw += wrapAngle(lockYaw(player.x, player.z, target.x, target.z) - view.yaw) * Math.min(1, dt * LOCK_TURN);
    view.yawTarget = view.yaw;
  }
}

const v = new THREE.Vector3();
// after the camera moved: the ring over the locked enemy
export function updateLockMarker() {
  const off = state.world?.group.position;
  if (target && off) v.set(target.x + off.x, chest(target) + off.y, target.z + off.z).project(camera);
  const show = !!target && !!off && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
  marker.hidden = !show;
  if (show) marker.style.transform = `translate(${Math.round((v.x + 1) / 2 * innerWidth)}px, ${Math.round((1 - v.y) / 2 * innerHeight)}px)`;
}
