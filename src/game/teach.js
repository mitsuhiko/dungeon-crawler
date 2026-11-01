// Teaching and debugging helpers, on window.__game.teach: for the Teacher (learn/tutor/) to show
// the reader what is going on in the game, and for tests. Draw over the world, switch on lenses
// that show the game's own rules (game/lenses.js), pause or slow down time (game/pace.js) and
// change the game's numbers with a way back (game/tune.js). None of it changes how the game plays
// except pace and tune, and reset() undoes all of it.
//
// Places are in cube coordinates, like the player's: x and z run from 0 to N (24) across the cube
// (the grid lens shows them), y is the height. A place (`at`) is one of:
//   { x, z } or [x, z]       on the floor there (the floor nearest the player's height)
//   { x, y, z } or [x, y, z]
//   'player', an enemy, or any object with x, z   the drawing follows it (and goes when the enemy dies)
//   a function returning { x, y, z }
//
//   pin(at, { label, color })                a pin standing on a place, a label over it
//   label(at, text, { color, size, lift })   words over a place ("\n" for more lines)
//   ring(at, radius, { color, fill })        a circle on the ground
//   sector(at, radius, { yaw, half, angle }) a slice of a circle on the ground; yaw: which way it
//                                            looks (the game's yaw; default: the way `at` faces);
//                                            half: half its angle in radians, like a weapon's arc,
//                                            or angle: its whole angle in degrees
//   cell(x, z, { color, label })             one square of the grid
//   arrow(from, to, { color, width })        an arrow between two places
//   path(places, { color, width, head })     a line through several places
// Every one takes { id, color, ttl (seconds), pulse, opacity } and returns its id; drawing again
// with the same id replaces it. Drawings at fixed places belong to the cube they were drawn in.
//   clear(id), clear()                       take drawings away
//   lens(name, on, { of })                   'sword', 'awareness', 'paths', 'grid', 'route'; of: only
//                                            these enemies
//   pause(), resume(), await step(frames), speed(0.25)
//   await tune('src/core/enemies.js#SPIDER.aggro', 6), tune(obj, 'key', value), untune(), tuned()
//   lightview(view)                          the baked light alone: 'lights' (the fixed lamps' light),
//                                            'sun' (its baked shadow), 'lightmap' (its texels), 'off'
//   toScreen(at)                             where a place is in the game's window, in pixels
//   status()                                 what is on, in words
//   reset()                                  everything above undone
import * as THREE from 'three';
import { camera } from '../render/scene.js';
import { overlay, fan, square, tube, pin as pinShape, label as labelShape, fade, dispose } from '../render/overlay.js';
import { groundAt } from '../physics/collide.js';
import { player, state } from './state.js';
import { allEnemies } from './enemies.js';
import { travelling } from './travel.js';
import { pace, pause, resume, step, setSpeed, resetPace } from './pace.js';
import { tune, untune, tuned } from './tune.js';
import { lens, lensesOn, tickLenses, resetLenses } from './lenses.js';
import { DISPLAY } from '../render/fonts.js';
import { BAKE } from '../render/lighthook.js';

const root = new THREE.Group();
root.name = 'teach';
overlay.add(root);
const drawings = new Map();   // id -> { obj, cube, until, pulse, update }
let serial = 0;

// the height of the floor at (x, z): the highest one not far above the player
function floorY(x, z) {
  if (!state.map) return player.y;
  for (const y of [player.y + 2.5, 99]) { const g = groundAt(x, z, y, 0); if (g.h > -Infinity) return g.h; }
  return player.y;
}
const isEnemy = o => !!o?.profile && 'mode' in o;
// a place as a function returning { x, y, z, yaw, h } (h: the height of the thing, 0 for a spot),
// or null when what it followed is gone; and whether it belongs to this cube
function where(at) {
  if (at === 'player' || at === player) return { get: () => ({ x: player.x, y: player.visY, z: player.z, yaw: player.yaw, h: player.h }), cube: false };
  if (isEnemy(at)) return { get: () => at.mode === 'dead' || !allEnemies().includes(at) ? null
    : { x: at.x, y: at.y, z: at.z, yaw: at.yaw, h: at.profile.bodyHeight }, cube: true };
  if (typeof at === 'function') return { get: () => { const p = at(); return p && { x: p.x, y: p.y ?? floorY(p.x, p.z), z: p.z, yaw: p.yaw ?? 0, h: p.h ?? 0 }; }, cube: true };
  if (Array.isArray(at)) at = at.length >= 3 ? { x: at[0], y: at[1], z: at[2] } : { x: at[0], z: at[1] };
  if (!Number.isFinite(at?.x) || !Number.isFinite(at?.z)) throw new Error('A place is { x, z }, [x, z], "player", an enemy or a function');
  const y0 = Number.isFinite(at.y) ? null : floorY(at.x, at.z);
  return { get: () => ({ x: at.x, y: Number.isFinite(at.y) ? at.y : y0, z: at.z, yaw: at.yaw ?? 0, h: 0 }), cube: true };
}

// add a drawing: places, the object, and how to move it to them each frame
function add(opts, places, obj, update) {
  const id = String(opts.id ?? `d${++serial}`);
  clear(id);
  const at = places.map(where);
  const d = { id, obj, at, cube: at.some(a => a.cube) ? state.cubeKey : null, until: opts.ttl ? now() + opts.ttl : Infinity,
    pulse: !!opts.pulse, opacity: opts.opacity ?? 1, update };
  root.add(obj);
  drawings.set(id, d);
  move(d, now());
  return id;
}
const now = () => performance.now() / 1000;
function move(d, t) {
  const ps = d.at.map(a => a.get());
  if (ps.some(p => !p) || t > d.until) { clear(d.id); return; }
  d.obj.visible = !d.cube || d.cube === state.cubeKey;
  d.update(ps);
  fade(d.obj, d.opacity * (d.pulse ? 0.65 + 0.35 * Math.sin(t * 5) : 1));
}
const lift = (p, extra) => extra ?? (p.h ? p.h + 0.3 : 0.4);

export function pin(at, opts = {}) {
  // over a thing, the pin stands taller than it
  const color = opts.color ?? '#ffcf4a', height = Math.max(1.1, (where(at).get()?.h ?? 0) + 0.8), shape = pinShape({ color, height });
  if (opts.label != null) { const l = labelShape(opts.label, { color }); l.position.y = height + 0.25; shape.add(l); }
  return add({ pulse: true, ...opts }, [at], shape, ([p]) => shape.position.set(p.x, p.y, p.z));
}
export function label(at, text, opts = {}) {
  const l = labelShape(text, { color: opts.color, size: opts.size });
  return add(opts, [at], l, ([p]) => l.position.set(p.x, p.y + lift(p, opts.lift), p.z));
}
export function ring(at, radius, opts = {}) {
  const g = fan(radius, { color: opts.color ?? '#ffcf4a', fill: opts.fill ?? 0.15, width: opts.width ?? 0.06 });
  return add(opts, [at], g, ([p]) => g.position.set(p.x, p.y + 0.05, p.z));
}
export function sector(at, radius, opts = {}) {
  const half = opts.half ?? (opts.angle != null ? opts.angle / 2 * Math.PI / 180 : Math.PI / 4);
  const g = fan(radius, { half, color: opts.color ?? '#ffcf4a', fill: opts.fill ?? 0.2, width: opts.width ?? 0.06 });
  return add(opts, [at], g, ([p]) => { g.position.set(p.x, p.y + 0.05, p.z); g.rotation.y = opts.yaw ?? p.yaw; });
}
export function cell(x, z, opts = {}) {
  const color = opts.color ?? '#ffcf4a', g = square({ color, fill: opts.fill ?? 0.3 }), cx = Math.floor(x), cz = Math.floor(z);
  const y = Number.isFinite(opts.y) ? opts.y : floorY(cx + 0.5, cz + 0.5);
  if (opts.label != null) { const l = labelShape(opts.label, { color, size: 0.2 }); l.position.set(0.5, 0.25, 0.5); g.add(l); }
  return add(opts, [[cx + 0.5, y, cz + 0.5]], g, () => g.position.set(cx, y + 0.04, cz));
}
// a line through places, rebuilt when they move
export function path(places, opts = {}) {
  if (!Array.isArray(places) || places.length < 2) throw new Error('A path needs at least two places');
  const g = new THREE.Group(), color = opts.color ?? '#ffcf4a';
  let last = '';
  return add(opts, places, g, ps => {
    const pts = ps.map(p => ({ x: p.x, y: p.y + (p.h ? p.h * 0.6 : opts.lift ?? 0.15), z: p.z }));
    const key = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(' ');
    if (key === last) return;
    last = key;
    for (const c of [...g.children]) dispose(c);
    g.add(tube(pts, { color, width: opts.width ?? 0.08, head: opts.head ?? false }));
  });
}
export const arrow = (from, to, opts = {}) => path([from, to], { head: true, width: 0.1, ...opts });

// take a drawing away (by id), or all of them
export function clear(id) {
  if (id === undefined) { for (const k of [...drawings.keys()]) clear(k); return; }
  const d = drawings.get(String(id));
  if (!d) return;
  dispose(d.obj);
  drawings.delete(d.id);
}

// where a place is in the game's window, in CSS pixels; null when it is behind the camera
const v = new THREE.Vector3();
export function toScreen(at) {
  const p = where(at).get();
  if (!p) return null;
  v.set(p.x, p.y + (p.h ? p.h * 0.6 : 0), p.z).project(camera);
  if (v.z > 1) return null;
  return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - v.y) / 2 * innerHeight),
    onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
}

// the baked light alone (render/lighthook.js uBakeDbg; the console's /lightview): what the fixed
// lamps give, the sun's baked shadow, or the lightmap's texels; 'off': the picture again
export const LIGHT_VIEWS = ['off', 'sun', 'lights', 'lightmap'];
export function lightview(view = 'off') {
  if (!LIGHT_VIEWS.includes(view)) throw new Error(`There is no light view "${view}". Views: ${LIGHT_VIEWS.join(', ')}`);
  BAKE.uBakeDbg.value = LIGHT_VIEWS.indexOf(view);
  return view;
}
const lightviewOn = () => LIGHT_VIEWS[BAKE.uBakeDbg.value] ?? 'off';

// what is on, in a few words (for the Teacher's view of the game)
export function status() {
  const parts = [];
  if (pace.paused) parts.push('paused');
  if (pace.speed !== 1) parts.push(`speed ${pace.speed}`);
  if (lensesOn().length) parts.push(`lenses: ${lensesOn().join(', ')}`);
  if (lightviewOn() !== 'off') parts.push(`light view: ${lightviewOn()}`);
  if (drawings.size) parts.push(`${drawings.size} drawing${drawings.size > 1 ? 's' : ''} (${[...drawings.keys()].slice(0, 8).join(', ')})`);
  const t = tuned();
  if (t.length) parts.push(`tuned: ${t.map(c => `${c.label} ${JSON.stringify(c.before)} -> ${JSON.stringify(c.now)}`).join('; ')}`);
  return parts.join('; ');
}

// all of it undone: drawings, lenses, the light view, time and tuned values
export function reset() {
  clear(); resetLenses(); resetPace(); lightview('off');
  return untune();
}

// a badge at the top of the screen while time is paused or runs at another speed
let badge = null, shown = '';
function showPace() {
  const text = pace.paused ? 'Paused' : pace.speed < 1 ? `Slow motion \u00D7${pace.speed}` : pace.speed > 1 ? `Fast \u00D7${pace.speed}` : '';
  if (text === shown) return;
  shown = text;
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'teach-pace';
    Object.assign(badge.style, { position: 'fixed', top: 'calc(12px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
      padding: '4px 14px', borderRadius: '8px', background: '#1b1710dd', color: '#ffe4ae', border: '1px solid #ffcf7a',
      font: `bold 15px ${DISPLAY}`, letterSpacing: '0.04em' });
    document.body.append(badge);
  }
  badge.textContent = text;
  badge.style.display = text ? '' : 'none';
}

// once per frame, after the camera moved
export function tickTeach() {
  const hidden = state.transitioning || travelling(), t = now();
  showPace();
  root.visible = !hidden;
  if (!hidden) for (const d of [...drawings.values()]) move(d, t);
  tickLenses(hidden);
}

export const teach = {
  pin, label, ring, sector, cell, arrow, path, clear, toScreen,
  lens, lenses: lensesOn, lightview,
  pause, resume, step, speed: setSpeed, get paused() { return pace.paused; },
  tune, untune, tuned, status, reset,
};
