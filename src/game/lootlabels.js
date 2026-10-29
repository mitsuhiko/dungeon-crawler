// Name labels over the items on the floor, Diablo style, in their rarity's colour. X (or the
// settings: game/settings.js itemNames, which X switches and which is kept) shows them for
// everything in the cube but coins; otherwise only the item under the cursor gets one. A label (or the item itself) is clicked to walk there and pick it up (game/orders.js).
// Closed treasure chests are hovered and labelled the same way (coloured by how grand the site
// is), and clicked to go and open them (game/chests.js); so are villagers with something to say
// (named in gold, with their trade, core/shops.js), clicked to go and talk to them. A villager
// with a quest for you (!) or one to hand in (?, core/quests.js giverMark) is always labelled.
// A trial's parts the action key uses (levers, runestones, braziers, a rune room's tablet ...;
// game/trials.js usableParts) are hovered too, labelled with what using them does, and clicked to
// go and use them. The ways out of the cube (portals, the town portal, house doors: game/ways.js)
// too, labelled with where they go, and clicked to walk up to them and through. The robot asleep in
// the merchant camp (game/robot.js sleepingRobot) too, clicked to walk up to it and wake it.
// Labels that would overlap are pushed upwards into a stack. Runs after the camera moved.
//
// Everything clicked in the world (but the enemies: game/pointer.js) is hovered here, and the cursor
// shows it (a pointer). What is hovered is the thing itself, not its label: each has a body
// (bodyOf: what it takes up in the cube, from its view where it has one), and the cursor on that
// body, or on its label, hovers it. A label may hang well above its thing (labelY: the glassmaker's
// glass floats, his sword stands tall), so its place never says where the thing is. A new kind of
// thing to click gets a body here, never a hover of its own (tests/browser/hover.js checks them).
import * as THREE from 'three';
import { camera, renderer } from '../render/scene.js';
import { lootView } from '../render/loot.js';
import { rarityOf } from '../core/gear/rarities.js';
import { labelled } from '../core/loot.js';
import { displayName } from '../core/gear/stats.js';
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
import { state } from './state.js';
import { lootHere } from './loot.js';
import { pointer, hoveredEnemy } from './pointer.js';
import { orderPickup, orderChest, orderTrade, orderWalk, orderPart, orderWay, orderRobot } from './orders.js';
import { waysHere } from './ways.js';
import { usableParts, partLabel } from './trials.js';
import { questItemsHere } from './questworld.js';
import { introThingsHere } from './intro.js';
import { sleepingRobot } from './robot.js';
import { shopOf } from '../core/shops.js';
import { GIVERS, giverOf, giverMark } from '../core/quests.js';
import { talkative } from './action.js';
import { peopleHere } from './npcs.js';
import { closedChests } from './chests.js';
import { RARITY } from '../core/gear/rarities.js';
import { tr, say, onLanguageChange } from '../i18n/i18n.js';
import { itemNames, setItemNames, onSettingsChange } from './settings.js';
import { curtained } from './hud.js';
import { NPC_H } from '../core/npcs.js';

const layer = document.getElementById('loot-labels'), canvas = renderer.domElement;
const labels = new Map();   // pickup id (or 'chest:' + site id) -> { el, p, w, h }
// another language: the labels are made again in it
onLanguageChange(() => { for (const l of labels.values()) l.el.remove(); labels.clear(); });
// another UI scale or window (a phone turned: its labels are smaller upright, style.css): measured again
const remeasure = () => { for (const l of labels.values()) l.w = 0; };
onSettingsChange(remeasure);
addEventListener('resize', remeasure);
const PICK_PAD = 6;           // px the cursor may be off a thing's body and still hover it
const PICK_MIN = 14;          // px: the least a body is wide on screen (far off, small things)
const PART_COLOR = '#8fd0ff', WAY_COLOR = '#c9b8ff';
// a chest's label colour: a grander site, a rarer colour
const CHEST_COLOR = { basic: '#d8d2c4', uncommon: RARITY.decent.css, rare: RARITY.unusual.css, exceptional: RARITY.remarkable.css };
let hovered = null, overLabel = null, cursor = '';   // overLabel: the key of the thing whose label the cursor is on

// villagers (state.map.villagers) have an outfit, chests (reward sites) a prestige; the trial's
// usable parts are this frame's usableParts()
let parts = new Set();
const isVillager = p => !!p?.outfit, isPart = p => parts.has(p), isWay = p => !!p?.way, isRobot = p => !!p?.robot;
// the pickup under the cursor, the closed chest (a reward site), the trading villager, the trial's part, the way out and the robot asleep
export const hoveredPickup = () => hovered && !hovered.prestige && !isVillager(hovered) && !isPart(hovered) && !isWay(hovered) && !isRobot(hovered) ? hovered : null;
export const hoveredRobot = () => isRobot(hovered) ? hovered : null;
export const hoveredChest = () => hovered?.prestige ? hovered : null;
export const hoveredVillager = () => isVillager(hovered) ? hovered : null;
export const hoveredPart = () => isPart(hovered) ? hovered : null;
export const hoveredWay = () => isWay(hovered) ? hovered : null;
const keyOf = p => p.prestige ? 'chest:' + p.id : isVillager(p) ? 'villager:' + (p.id ?? p.name) : isPart(p) ? `part:${p.type === 'tablet' ? p.key : p.id}` : isWay(p) ? 'way:' + p.key : p.id;
const textOf = p => isVillager(p) ? villagerText(p) : isPart(p) ? partLabel(p) : isWay(p) ? tr(p.label) : null;   // (labels whose text changes)
// the villagers in this cube with something to say
const traders = () => peopleHere().filter(talkative);
// what a villager's label says: the quest mark, their name, their trade
function villagerText(v) {
  const shop = shopOf(v), mark = v.lost || v.helper ? '!' : giverOf(v) && state.run?.quests ? giverMark(state.run.quests, giverOf(v)) : '';
  const name = v.title ? say(v.title) : GIVERS[v.name] ? tr(GIVERS[v.name].title) : shop ? tr(shop.title) : v.name;
  return `${mark ? `${mark} ` : ''}${name}${shop ? ` · ${tr(shop.trade)}` : ''}`;
}
export function toggleLabels() { setItemNames(!itemNames()); }

function label(p) {
  let l = labels.get(keyOf(p));
  if (l) return l;
  const el = document.createElement('button');
  el.className = 'loot-label'; el.tabIndex = -1;
  const part = isPart(p);
  el.textContent = textOf(p) ?? (p.prestige ? tr('Treasure chest') : p.story || isRobot(p) ? tr(p.title) : p.questItem ? tr('{thing} · quest', { thing: p.label ? capital(say(p.label)) : displayName(p) })
    : displayName(p) + (p.count > 1 ? ` (${p.count})` : ''));
  el.style.color = isWay(p) ? WAY_COLOR : part ? PART_COLOR : isVillager(p) || p.questItem || isRobot(p) ? '#e6c35a' : p.prestige ? CHEST_COLOR[p.prestige] ?? CHEST_COLOR.basic : p.gen ? rarityOf(p).css : '#d8d2c4';
  if (p.gen) { el.dataset.rarity = rarityOf(p).id; el.classList.toggle('rainbow', !!rarityOf(p).glow?.rainbow); }
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || state.inventoryOpen || state.transitioning) return;
    e.preventDefault(); e.stopPropagation();
    if (isWay(p)) orderWay(p); else if (isRobot(p)) orderRobot(p); else if (part) orderPart(p); else if (isVillager(p)) orderTrade(p); else if (p.prestige) orderChest(p); else if (p.questItem) orderWalk(p.x, p.y, p.z); else orderPickup(p);
  });
  // (by key: some lists make their things anew every frame, game/intro.js, game/questworld.js)
  const key = keyOf(p);
  el.addEventListener('pointerenter', () => { overLabel = key; });
  el.addEventListener('pointerleave', () => { if (overLabel === key) overLabel = null; });
  layer.append(el);
  l = { el, p, w: 0, h: 0 };
  labels.set(keyOf(p), l);
  return l;
}

const v = new THREE.Vector3();
// p on screen (px), over the item; null when behind the camera or off screen
function screen(p, off) {
  if (isVillager(p)) v.set(p.x + off.x, p.y + off.y + 1.05, p.z + off.z).project(camera);
  else if (p.prestige) v.set(p.anchor.x + off.x, p.anchor.y + off.y + 0.75, p.anchor.z + off.z).project(camera);
  else if (isPart(p)) v.set(p.x + off.x, p.y + off.y + 0.9, p.z + off.z).project(camera);
  else if (isWay(p)) v.set(p.x + off.x, p.y + off.y, p.z + off.z).project(camera);
  else v.set(p.x + off.x, p.y + off.y + (p.labelY ?? (p.gen ? 0.12 : 0.35)), p.z + off.z).project(camera);
  if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}

// everything here to hover and click (parts: this frame's usableParts)
const thingsHere = () => [...parts, ...lootHere().filter(p => labelled(p) && p.toss >= 1 && !p.fly && lootView(p)), ...questItemsHere().filter(lootView),
  ...introThingsHere().filter(lootView), ...closedChests(), ...traders(), ...(state.mode === 'play' ? waysHere() : []), ...[sleepingRobot()].filter(Boolean)];
const ZERO = new THREE.Vector3(), cubeOffset = () => state.world?.group.position ?? ZERO;
// (tests/browser/hover.js) everything hovered here, each with its body; and the key of what is hovered
export const hoverables = () => thingsHere().map(p => ({ key: keyOf(p), body: bodyOf(p, cubeOffset()) }));
export const hoveredKey = () => hovered && keyOf(hovered);

// What thing p takes up, for the hover: a standing cylinder { x, z, y0, y1, r } in the scene (off:
// where the cube is drawn). A thing with a view (an item, a quest's or the beginning's thing,
// render/loot.js) is where its view is, however it floats, stands or is scaled; the others by
// what they are.
const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
const body = (x, y, z, h, r, off) => ({ x: x + off.x, z: z + off.z, y0: y + off.y, y1: y + off.y + h, r });
// a way out (game/ways.js): a gate, a well, a ring, the town portal's pad, a door
function wayBody(p, off) {
  if (p.kind === 'door') return body(p.x, p.door.y, p.z, 1.7, 0.55, off);
  if (p.kind === 'town') return body(p.x, p.pad.y, p.z, 0.8, 0.7, off);
  const y = p.portal.y;
  if (p.kind === 'side') return body(p.x, y, p.z, 2.2, 0.9, off);
  if (p.kind === 'up') return body(p.walk.x, y, p.walk.z, 2.2, 0.7, off);
  return body(p.walk.x, y - 0.2, p.walk.z, 0.7, 0.6, off);
}
export function bodyOf(p, off) {
  if (isVillager(p)) return body(p.x, p.y, p.z, NPC_H + 0.1, 0.32, off);
  if (p.prestige) return body(p.anchor.x, p.anchor.y, p.anchor.z, 0.8, 0.5, off);
  if (isPart(p)) return body(p.x, p.y, p.z, 0.9, 0.4, off);
  if (isWay(p)) return wayBody(p, off);
  if (isRobot(p)) return body(p.x, p.y, p.z, 0.5, 0.45, off);   // (lying on its back: render/robot.js RobotDormant)
  const view = lootView(p);
  if (view) {
    box.setFromObject(view);
    if (!box.isEmpty()) {
      box.getSize(size); box.getCenter(mid);
      return { x: mid.x, z: mid.z, y0: box.min.y, y1: box.max.y, r: Math.max(size.x, size.z) / 2 };
    }
  }
  return body(p.x, p.y, p.z, 0.5, 0.3, off);
}
// how far the cursor (px, py) is from body b on screen, in its widths (under 1: on it)
const ends = [new THREE.Vector3(), new THREE.Vector3()];
function offBody(b, px, py) {
  const [a, c] = ends;
  a.set(b.x, (b.y0 + b.y1) / 2, b.z).applyMatrix4(camera.matrixWorldInverse);
  const depth = -a.z;
  if (depth <= 0) return Infinity;
  const unit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));   // px per unit at depth 1
  const r = Math.max(PICK_MIN, b.r * unit / depth) + PICK_PAD;
  a.set(b.x, b.y0, b.z).project(camera); c.set(b.x, b.y1, b.z).project(camera);
  const ax = (a.x + 1) / 2 * innerWidth, ay = (1 - a.y) / 2 * innerHeight, bx = (c.x + 1) / 2 * innerWidth, by = (1 - c.y) / 2 * innerHeight;
  // the nearest point on the body's axis from foot to top, on screen
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy, t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t) / r;
}

export function updateLootLabels() {
  // (not behind the curtain: they come up with the world as it lifts, under it, style.css #fade;
  // nothing unseen is hovered or clicked meanwhile)
  const live = !state.inventoryOpen && !state.transitioning && !!state.world && !curtained();
  parts = new Set(live && state.mode === 'play' ? usableParts() : []);
  const list = live ? thingsHere() : [];
  const off = cubeOffset(), spots = new Map();
  for (const p of list) { const s = screen(p, off); if (s) spots.set(p, s); }
  // the thing under the cursor: the one whose label it is on, else the one whose body it is on
  // (the nearest to its middle, for its size: a coin at a villager's feet wins on the coin)
  hovered = null;
  const onLabel = live && overLabel ? list.find(p => keyOf(p) === overLabel) : null;
  if (onLabel) hovered = onLabel;
  else if (live && pointer.inside && !hoveredEnemy()) {
    const px = (pointer.ndc.x + 1) / 2 * innerWidth, py = (1 - pointer.ndc.y) / 2 * innerHeight;
    let best = 1;
    for (const p of list) {
      const d = offBody(bodyOf(p, off), px, py);
      if (d < best) { best = d; hovered = p; }
    }
  }
  const show = [...spots.keys()].filter(p => itemNames() || p === hovered || p.questItem || isRobot(p) || isVillager(p) && villagerText(p).match(/^[!?] /));
  // nearest to the camera first; each label goes up past any it would cover
  show.sort((a, b) => spots.get(b).y - spots.get(a).y);
  const placed = [], keep = new Set();
  for (const p of show) {
    const l = label(p), s = spots.get(p);
    keep.add(keyOf(p));
    const text = textOf(p);
    if (text != null && l.el.textContent !== text) { l.el.textContent = text; l.w = 0; }
    if (!l.w) { l.w = l.el.offsetWidth || 80; l.h = l.el.offsetHeight || 18; }
    let x = s.x - l.w / 2, y = s.y - l.h - 6;
    for (let moved = true, n = 0; moved && n < 30; n++) {
      moved = false;
      for (const r of placed) if (x < r.x + r.w && x + l.w > r.x && y < r.y + r.h && y + l.h > r.y) { y = r.y - l.h - 2; moved = true; }
    }
    placed.push({ x, y, w: l.w, h: l.h });
    l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    l.el.classList.toggle('hovered', p === hovered);
  }
  for (const [id, l] of labels) if (!keep.has(id)) { l.el.remove(); labels.delete(id); if (overLabel === id) overLabel = null; }
  const want = hoveredEnemy() ? 'crosshair' : hovered ? 'pointer' : '';
  if (want !== cursor) canvas.style.cursor = cursor = want;
}
