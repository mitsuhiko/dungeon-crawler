// Touch controls (docs/touch.md): on from the first touch of the screen, as body.touch; the
// settings (Input, Touch) can have them always on or off instead (off only where there is a mouse
// or a trackpad too: a phone would have no way left to play), and ?touch=1 or ?touch=0 over that.
// The left of the screen is a floating stick: where the thumb lands, it pushes the way to move (a
// little: walk, further: run). On the right the action button attacks while held (as Shift); with a
// flask in hand it is a stick that aims the throw (core/stick.js aimReach): let go to throw, back
// to the middle to call it off, and a tap throws at the best enemy in range. The jump button sits
// beside it, the use button above it while there is something to do (the action key,
// game/action.js; its picture shows what). A turn button at each side of the screen turns the view
// a quarter (as Q and E). On the game itself a tap does what a click does, except walking (an
// enemy, an item, a chest, a villager), a long press collects what is around, and two fingers pinch
// to zoom. The quick bar moves to the top (on a phone; a tablet keeps it at the bottom) with a bag
// button (game/quickbar.js, style.css).
import { stickVector, pinchStep } from '../core/stick.js';
import { stepZoom } from '../core/zoom.js';
import { readiedFlask } from '../core/combat.js';
import { equippedItem } from '../core/inventory.js';
import { ITEMS } from '../core/items.js';
import { renderer } from '../render/scene.js';
import { itemPicture } from '../render/itemviews.js';
import { player, state, view } from './state.js';
import { controls } from './inputstate.js';
import { tapGame, quickThrow, autoAttack } from './input.js';
import { requestCollect } from './loot.js';
import { throwTarget } from './throws.js';
import { queueAttack } from './sword.js';
import { pendingAction, useAction } from './action.js';
import { tr } from '../i18n/i18n.js';
import { defName } from './itemnames.js';
import { touchSetting, onSettingsChange } from './settings.js';

const STICK_R = 56, AIM_R = 72;   // px the thumb goes out to for a full push
const TAP_TIME = 300;             // ms: a touch let go sooner (without moving) is a tap
const LONG_PRESS = 450;           // ms held still: collect
const SLOP = 12;                  // px a finger may wander and still tap or long-press

const $ = id => document.getElementById(id);
const root = $('touch'), zone = $('touch-stick'), ring = $('touch-ring'), knob = $('touch-knob'),
  action = $('touch-action'), aimKnob = $('touch-action-knob'), icon = action.querySelector('img'),
  use = $('touch-use'), useImg = use.querySelector('img'), useSpeak = use.querySelector('svg'), useCount = $('touch-use-count'),
  jump = $('touch-jump'), hold = $('touch-hold'), turnLeft = $('touch-turn-left'), turnRight = $('touch-turn-right'),
  canvas = renderer.domElement;
const now = () => performance.now();
const place = (el, x, y) => { el.style.transform = `translate(${x}px, ${y}px)`; };
// the knob dx, dy px off its middle, kept within r
const nudge = (el, dx, dy, r) => { const d = Math.hypot(dx, dy), k = d > r ? r / d : 1; place(el, dx * k, dy * k); };

const forced = new URLSearchParams(location.search).get('touch');
const coarse = matchMedia('(pointer: coarse)'), fine = matchMedia('(any-pointer: fine)');
// whether the screen can be touched (the settings show the touch controls' row only then)
export const touchScreen = () => navigator.maxTouchPoints > 0 || coarse.matches || forced === '1';
// whether they may be turned off here: something else to point with
export const touchOptional = () => fine.matches;
// what to do: 'auto' (on from a touch), 'on' or 'off'
const wanted = () => {
  if (forced === '1') return 'on';
  if (forced === '0') return 'off';
  const t = touchSetting();
  return t === 'off' && !touchOptional() ? 'auto' : t;
};
let on = false;
export const touchMode = () => on;
function enable() {
  if (on || wanted() === 'off') return;
  on = true;
  document.body.classList.add('touch');
  root.hidden = false;
}
function disable() {
  if (!on) return;
  dropAll();
  on = false;
  document.body.classList.remove('touch');
  root.hidden = true;
}
// as the settings say ('auto' turns nothing off: a touch has turned them on)
function apply() {
  const w = wanted();
  if (w === 'off') disable();
  else if (w === 'on' || coarse.matches) enable();
}
apply();
onSettingsChange(apply);
coarse.addEventListener('change', () => { if (coarse.matches) enable(); });
addEventListener('pointerdown', e => { if (e.pointerType === 'touch') enable(); }, true);

// A finger let go is not always told: now and then no pointerup, pointercancel or
// lostpointercapture comes (seen around falls, maybe the long hitch of loading the cube below;
// or the system taking the touch: an edge swipe, the app switcher). Without a word the stick (or the action
// button) stayed held, pushing on, and took no new touch. So a hold whose pointer the element no
// longer has captured is let go (every frame, updateTouch), a new touch on the stick or the
// button takes over from an old one, and leaving the page lets go of everything.
const captured = (el, id) => { try { return el.hasPointerCapture(id); } catch { return false; } };
const release = (el, id) => { try { el.releasePointerCapture(id); } catch { /* already gone */ } };

// --- the stick ----------------------------------------------------------------------------------

let stick = null;   // { id, x, y (where it landed), t0, moved }
function dropStick() {
  if (!stick) return;
  release(zone, stick.id);
  stick = null; ring.hidden = true;
  Object.assign(controls.stick, { x: 0, y: 0, m: 0 });
}
zone.addEventListener('pointerdown', e => {
  e.preventDefault();
  dropStick();   // a second thumb there, or one whose end never came: the new touch is the stick
  zone.setPointerCapture(e.pointerId);
  stick = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: now(), moved: false };
  place(ring, e.clientX, e.clientY); place(knob, 0, 0);
  ring.hidden = false;
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== stick?.id) return;
  const dx = e.clientX - stick.x, dy = e.clientY - stick.y;
  if (Math.hypot(dx, dy) > SLOP) stick.moved = true;
  nudge(knob, dx, dy, STICK_R);
  Object.assign(controls.stick, stickVector(dx, dy, STICK_R));
});
function endStick(e) {
  if (e.pointerId !== stick?.id) return;
  const s = stick;
  dropStick();
  // a quick touch that pushed nothing: a tap on the game under it
  if (e.type === 'pointerup' && !s.moved && now() - s.t0 < TAP_TIME) tapGame(e.clientX, e.clientY);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, endStick);

// --- the action button: attack, or aim the flask in hand ------------------------------------------

let press = null;   // { id, x, y (the button's middle), t0, aimed }
// the button let go without a throw
function dropPress() {
  if (!press) return;
  release(action, press.id);
  press = null;
  action.classList.remove('down'); place(aimKnob, 0, 0);
  controls.attackHeld = false;
  Object.assign(controls.aim, { active: false, x: 0, y: 0, m: 0 });
}
action.addEventListener('pointerdown', e => {
  if (state.inventoryOpen) return;
  e.preventDefault();
  dropPress();   // a touch whose end never came: the new one presses
  action.setPointerCapture(e.pointerId);
  const r = action.getBoundingClientRect();
  press = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2, t0: now(), aimed: false };
  action.classList.add('down');
  if (readiedFlask(player)) Object.assign(controls.aim, { active: true, x: 0, y: 0, m: 0 });
  else { controls.attackHeld = true; if (!state.transitioning) autoAttack(); }   // a tap still swings
});
action.addEventListener('pointermove', e => {
  if (e.pointerId !== press?.id || !controls.aim.active) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y, v = stickVector(dx, dy, AIM_R);
  if (v.m > 0) press.aimed = true;
  nudge(aimKnob, dx, dy, AIM_R);
  Object.assign(controls.aim, v);
});
function endPress(e) {
  if (e.pointerId !== press?.id) return;
  const p = press, aim = controls.aim;
  // let go out on the stick: throw there; a tap: at the best enemy; back in the middle: not at all
  if (aim.active && e.type === 'pointerup') {
    if (aim.m > 0) { const t = throwTarget(); if (t) queueAttack(t.enemy ?? t); }
    else if (!p.aimed && now() - p.t0 < TAP_TIME) quickThrow();
  }
  dropPress();
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) action.addEventListener(type, endPress);

// the use button: the action key (chest, villager, collect)
use.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (useAction()) navigator.vibrate?.(10);
});

jump.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!state.inventoryOpen && !state.transitioning) controls.jumpPressed = true;
});

// the turn buttons: a quarter turn of the view, the left one as Q, the right one as E
for (const [button, way] of [[turnLeft, -1], [turnRight, 1]]) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!state.inventoryOpen) view.yawTarget += way * Math.PI / 2;
  });
}

// --- fingers on the game: tap, long press, pinch ---------------------------------------------------

const fingers = new Map();   // pointerId -> { x, y, x0, y0, t0, tap }
let pressTimer = 0, gesture = null;   // gesture: { d } of two fingers when last stepped

function pair() {
  const [a, b] = fingers.values();
  return { d: Math.hypot(b.x - a.x, b.y - a.y) };
}
function startHold(f) {
  place(hold, f.x, f.y);
  hold.classList.remove('done', 'on');
  void hold.offsetWidth;   // restart the fill
  hold.classList.add('on');
  pressTimer = setTimeout(() => {
    pressTimer = 0; f.tap = false;
    hold.classList.remove('on');
    if (state.inventoryOpen || state.transitioning) return;
    requestCollect();
    hold.classList.add('done');
    navigator.vibrate?.(15);
  }, LONG_PRESS);
}
function stopHold() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = 0;
  hold.classList.remove('on');
}

// fingers whose end never came (no longer captured) are forgotten, else no tap counted again
function pruneFingers() {
  for (const id of fingers.keys()) if (!captured(canvas, id)) fingers.delete(id);
  if (fingers.size < 2) gesture = null;
  if (!fingers.size) stopHold();
}
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  e.preventDefault();
  pruneFingers();
  canvas.setPointerCapture(e.pointerId);
  const f = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: now(), tap: true };
  fingers.set(e.pointerId, f);
  if (fingers.size === 1) { startHold(f); return; }
  // a second finger: no tap, no long press, but a pinch with the first two
  stopHold();
  for (const g of fingers.values()) g.tap = false;
  if (fingers.size === 2) gesture = pair();
});
canvas.addEventListener('pointermove', e => {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  f.x = e.clientX; f.y = e.clientY;
  if (f.tap && Math.hypot(f.x - f.x0, f.y - f.y0) > SLOP) { f.tap = false; stopHold(); }
  if (!gesture || fingers.size !== 2 || state.inventoryOpen) return;
  const p = pair(), zoom = pinchStep(p.d / gesture.d);
  if (zoom) { view.zoomTarget = stepZoom(view.zoomTarget, zoom); gesture.d = p.d; }
});
function endFinger(e) {
  const f = fingers.get(e.pointerId);
  if (!f) return;
  fingers.delete(e.pointerId);
  if (fingers.size < 2) gesture = null;
  if (fingers.size === 0) stopHold();
  if (e.type === 'pointerup' && f.tap && !fingers.size && now() - f.t0 < TAP_TIME) tapGame(e.clientX, e.clientY);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, endFinger);

// leaving the page (another app, the tab hidden, the window unfocused): every finger let go
function dropAll() {
  dropStick(); dropPress();
  for (const id of fingers.keys()) release(canvas, id);
  fingers.clear(); gesture = null; stopHold();
}
addEventListener('blur', dropAll);
addEventListener('pagehide', dropAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) dropAll(); });

// --- every frame -------------------------------------------------------------------------------

let shown = '', useShown = '';
// an <img> showing item `id`'s picture (render/itemviews.js fills it in once it is rendered)
const showPicture = (img, id) => { img.dataset.itemPicture = id; img.src = itemPicture(id); };
// hidden while the inventory is open; the action button shows the weapon, or the flask in hand;
// the use button what the action key would do, or nothing
export function updateTouch() {
  if (!on) return;
  // a hold the browser let go of without telling (see captured above)
  if (stick && !captured(zone, stick.id)) dropStick();
  if (press && !captured(action, press.id)) dropPress();
  if (fingers.size) pruneFingers();
  root.hidden = state.inventoryOpen;
  updateUse();
  const flask = readiedFlask(player), weapon = equippedItem(player.inventory), def = flask || (weapon && ITEMS[weapon.itemId]);
  const next = `${def?.id}:${!!flask}`;
  if (next === shown) return;
  shown = next;
  icon.hidden = !def;
  if (def) showPicture(icon, def.id);
  action.classList.toggle('flask', !!flask);
  action.classList.toggle('empty', !def);
  action.setAttribute('aria-label', flask ? tr('Aim and throw {item}', { item: defName(flask) }) : tr('Attack'));
}

function updateUse() {
  const a = pendingAction(), next = a ? `${a.kind}:${a.picture}:${a.count ?? 0}:${a.label}` : '';
  if (next === useShown) return;
  useShown = next;
  use.hidden = !a;
  if (!a) return;
  useImg.hidden = !a.picture;
  if (a.picture) showPicture(useImg, a.picture);
  useSpeak.toggleAttribute('hidden', a.kind !== 'talk' && a.kind !== 'robot');   // (an svg has no .hidden)
  useCount.hidden = !(a.count > 1);
  useCount.textContent = a.count > 1 ? `${a.count}` : '';
  use.setAttribute('aria-label', a.label);
}
