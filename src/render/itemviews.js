// Items as their 3D models in the DOM (the inventory, game/inventory.js; the quick bar,
// game/quickbar.js; and wherever else an item shows: the potions at work, the touch buttons,
// the chat's suggestions, the heroes in the main menu). The pictures are render/itempictures.js's
// (re-exported here); this adds the views that move:
//   drawLiveViews     every frame the inventory is open, the views that move, each a <canvas>:
//                     [data-live-item="key"] the item turning (the selected one; its picture's
//                     key, render/itempictures.js pictureKey),
//                     [data-live-hero] the hero as it stands, with the weapon (or the flask) in
//                     its hand, in its look (render/looks.js), and what it wears
import * as THREE from 'three';
import { rig, createFigure, poseFigure, takeOff, wearLike, wornKey, animateWorn } from './figure.js';
import { character, mountWeapon } from './character.js';
import { paint, load, modelUrl, paintItem, itemModel, pictureKey } from './itempictures.js';
import { parseLook } from '../core/looks.js';
import { dressLook } from './looks.js';
import { uiScale } from '../game/uiscale.js';

export { itemPicture, itemModelReady, onItemPictures, pictureImg, pictureKey } from './itempictures.js';

const SPIN = 0.9;            // rad/s a live item turns
const SWAY = 0.3, SWAY_SPEED = 0.35, FACING = -0.3;   // the hero turns a little to and fro (rad, rad/s) around a three-quarter view
// world units that stay in view around the hero: up and down from its middle (the figure ~1.1,
// a staff over its head), and to each side (a staff or bow held out, turning to and fro)
const HERO_HALF_HEIGHT = 0.8, HERO_HALF_WIDTH = 0.55, HERO_MIDDLE = 0.58, HERO_FOV = 24;

// the hero's stage, lit like the main menu's portrait (render/portrait.js)
const heroStage = new THREE.Scene(), heroCam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
{
  const key = new THREE.DirectionalLight(0xfff0d8, 2), rim = new THREE.DirectionalLight(0x9fc4ff, 1.8);
  key.position.set(2, 3, 3); rim.position.set(-2.5, 1.5, -3);
  heroStage.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3326, 1.2), key, rim);
}
// { f (render/figure.js), tint, url (the weapon wanted), look (its look's key), weapon (its model,
// mounted), kind, worn }
let hero = null;
const weapons = new Map();   // url -> the hand's own copy (shares geometry and materials with the item's)
function heroWeapon(url) {
  if (!weapons.has(url)) weapons.set(url, load(url).then(root => root && root.clone(true)));
  return weapons.get(url);
}
// the hero as the player's character looks (render/character.js): its colour, what it wears,
// and `hand` (a weapon's bag slot, or a flask readied to throw) in its hand
function dressHero(hand) {
  if (!rig.ready) return null;
  const tint = character.tint ?? null;
  if (hero && hero.tint !== tint) { hero.f.group.removeFromParent(); hero = null; }
  if (!hero) {
    hero = { f: createFigure(tint), tint, url: null, look: '', weapon: null, kind: null, worn: '' };
    heroStage.add(hero.f.group);
  }
  const look = hand ? pictureKey(hand) : '', url = look ? modelUrl(parseLook(look)?.itemId ?? look) : null;
  if (hero.look !== look && hero.url === url && hero.weapon) { hero.look = look; dressLook(hero.weapon, look); }
  if (hero.url !== url) {
    const h = hero;
    h.url = url; h.look = look;
    h.weapon?.removeFromParent(); h.weapon = null; h.kind = null;
    pose(h);
    if (url) heroWeapon(url).then(model => {
      if (hero !== h || h.url !== url || !model) return;
      dressLook(model, h.look);
      h.kind = mountWeapon(h.f.bones, model)?.userData.weapon ?? null;
      h.weapon = model;
      pose(h);
    });
  }
  // what the character wears (its armor, game/armor.js; headwear, game/equipment.js devWear)
  const key = wornKey(character.worn);
  if (hero.worn !== key) {
    for (const slot of Object.keys(hero.f.worn)) takeOff(hero.f, slot);
    if (wearLike(hero.f, character, true)) hero.worn = key;   // (else again once loaded)
    pose(hero);
  }
  return hero;
}
// standing; the arm that carries a bow, crossbow or staff in its Hold pose (render/animator.js)
function pose(h) {
  poseFigure(h.f);
  for (const [bone, q] of character.holds?.[h.kind] ?? []) h.f.nodes[bone.name]?.quaternion.copy(q);
}

// a live canvas as big as it is shown (null: not shown); its size in CSS pixels is before the
// UI scale's zoom (style.css)
function fit(c) {
  const k = Math.min(devicePixelRatio, 2) * uiScale(), w = Math.round(c.clientWidth * k), h = Math.round(c.clientHeight * k);
  if (w < 2 || h < 2) return null;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

// main.js, every frame the inventory is open: the live views inside `root`; `hand`: what is in
// the hero's hand (a bag slot, an item id, or null); time: s, for the turning
export function drawLiveViews(root, hand, time) {
  for (const c of root.querySelectorAll('canvas[data-live-item]')) {
    const m = itemModel(c.dataset.liveItem);
    if (m && fit(c)) paintItem(c, m, time * SPIN);
  }
  for (const c of root.querySelectorAll('canvas[data-live-hero]')) {
    const f = dressHero(hand);
    if (!f || !fit(c)) continue;
    f.f.group.rotation.y = FACING + Math.sin(time * SWAY_SPEED) * SWAY;
    animateWorn(f.f, time);
    heroCam.aspect = c.width / c.height;
    heroCam.fov = HERO_FOV;
    heroCam.updateProjectionMatrix();
    // far enough that the hero fits both ways, however narrow or wide the box
    const t = Math.tan(HERO_FOV * Math.PI / 360), d = Math.max(HERO_HALF_HEIGHT / t, HERO_HALF_WIDTH / (t * heroCam.aspect));
    heroCam.position.set(0, HERO_MIDDLE + 0.12, d);
    heroCam.lookAt(0, HERO_MIDDLE, 0);
    paint(c, heroStage, heroCam);
  }
}
