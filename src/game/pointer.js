// The mouse: where the cursor points in the world. Picks the floor under the cursor (by
// marching the view ray through the collision data, skipping what the cutaway hides), a
// point at the player's height for aiming, and the enemy under the cursor (hover). With mouse
// look (the close view, game/mouselook.js) the cursor is the crosshair in the middle of the
// screen, and an enemy locked on to (game/lockon.js) is the hovered one.
import * as THREE from 'three';
import { N, BASE, DIRS } from '../core/constants.js';
import { camera, renderer } from '../render/scene.js';
import { U } from '../render/cutshader.js';
import { solidTop, acrossOf } from '../physics/collide.js';
import { mapInfo } from './cutinfo.js';
import { player, state, view } from './state.js';
import { allEnemies } from './enemies.js';
import { absent, baseY } from '../core/enemies.js';
import { mouseLook } from './mouselook.js';
import { lockTarget } from './lockon.js';

const canvas = renderer.domElement;
// mode: what the held button does ('move' | 'attack')
export const pointer = { ndc: new THREE.Vector2(), inside: false, down: false, mode: null };
const raycaster = new THREE.Raycaster(), ray = raycaster.ray;
let hovered = null;

// the cursor at (x, y) px; a finger only points where it taps (game/touch.js), it does not hover
export function pointAt(x, y) {
  pointer.ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  pointer.inside = true;
}
// (not while the mouse turns the view, game/camerakey.js: what it points at stays)
canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch' && !view.orbiting && !mouseLook()) pointAt(e.clientX, e.clientY); });
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
addEventListener('pointerup', e => { if (e.button === 0) pointer.down = false; });
addEventListener('blur', () => { pointer.down = false; });

function cast() { raycaster.setFromCamera(pointer.ndc, camera); return ray; }

const CUT_REACH = 3.5;   // around the player, surfaces above the cut height are hidden
// the walkable surface under the cursor: { x, y, z, s } or null. Where the ray meets none in the
// cube, the ground of a cube beyond one of its sides walked across (game/handover.js), the first
// it met: { x, y, z (in this cube's coordinates), s (a floor of that cube), across (the side) }
// learn: drawing.html#click #click-code (see learn/README.md)
export function pickFloor() {
  const m = state.map, r = cast(), o = r.origin, d = r.direction;
  if (!m || d.y > -1e-3) return null;
  const top = mapInfo(m).top + 0.5, cut = U.uCutY.value < 999 ? U.uCutY.value : Infinity;
  let t = o.y > top ? (o.y - top) / -d.y : 0, beyond = null;
  for (let i = 0; i < 1500; i++, t += 0.04) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < -BASE - 1) break;
    if (x < 0 || z < 0 || x >= N || z >= N) { beyond ??= besideAt(x, y, z); continue; }
    const s = solidTop(x, z, y);
    if (!s || (s.h > cut && Math.hypot(x - player.x, z - player.z) < CUT_REACH)) continue;
    return { x, y: s.h, z, s: s.s };
  }
  return beyond;
}
// the ground of the cube beyond a side walked across at (x, y, z) (past one side only), or null
function besideAt(x, y, z) {
  const ox = x >= N ? 0 : x < 0 ? 1 : -1, oz = z >= N ? 2 : z < 0 ? 3 : -1;
  if ((ox < 0) === (oz < 0)) return null;
  const side = ox >= 0 ? ox : oz, b = acrossOf(state.map)[side];
  if (!b) return null;
  const lx = x - DIRS[side][0] * N, lz = z - DIRS[side][1] * N;
  if (lx < 0 || lz < 0 || lx >= N || lz >= N) return null;
  const s = solidTop(lx, lz, y, b);
  return s ? { x, y: s.h, z, s: s.s, across: side } : null;
}

// the cursor on a level plane through the player's chest: where to aim / which way to go
// (null when the cursor is not over the game)
export function aimPoint(y = player.y + 0.4) {
  if (!pointer.inside) return null;
  const r = cast(), o = r.origin, d = r.direction;
  if (Math.abs(d.y) < 1e-4) return null;
  const t = (o.y - y) / -d.y;
  return t > 0 ? { x: o.x + d.x * t, z: o.z + d.z * t } : null;
}

const v = new THREE.Vector3();
// the living enemy under the cursor (in screen space, around its body)
function pickEnemy() {
  if (!pointer.inside || state.inventoryOpen || state.transitioning) return null;
  const px = (pointer.ndc.x + 1) / 2 * innerWidth, py = (1 - pointer.ndc.y) / 2 * innerHeight;
  const unit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));   // px per unit at depth 1
  let best = null, bestD = 1;
  for (const e of allEnemies()) {
    if (absent(e)) continue;
    const h = e.profile.bodyHeight;
    v.set(e.x, baseY(e) + h / 2, e.z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -v.z;
    if (depth <= 0) continue;
    v.set(e.x, baseY(e) + h / 2, e.z).project(camera);
    const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight, ppu = unit / depth;
    const rx = Math.max(16, (e.profile.radius + 0.2) * ppu), ry = Math.max(16, (h / 2 + 0.2) * ppu);
    const dn = Math.hypot((px - sx) / rx, (py - sy) / ry);
    if (dn < bestD) { bestD = dn; best = e; }
  }
  return best;
}

export const hoveredEnemy = () => hovered;
// once per frame, after the camera moved
export function updatePointer() {
  if (mouseLook()) { pointer.ndc.set(0, 0); pointer.inside = true; }   // the crosshair
  const e = (mouseLook() && lockTarget()) || pickEnemy();
  if (e === hovered) return;
  if (hovered) hovered.hovered = false;
  hovered = e;
  if (e) e.hovered = true;   // the cursor itself: game/lootlabels.js
}
