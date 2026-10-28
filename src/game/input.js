// Keyboard, mouse and wheel. Modal input never enters the game queue.
// Keys are actions (core/keybinds.js), each on the keys the settings give it (game/settings.js);
// the keys named here are the defaults. Esc is always the menu (and closes what is open).
// The player always runs; holding left Ctrl walks. Holding Shift auto-attacks enemies the weapon
// can reach (and does nothing without one, or with a flask in hand). Space jumps.
// Mouse: click the floor to walk there, click an enemy to attack it (hold for more), click an
// item on the floor to pick it up, click a treasure chest to open it, click a villager who
// has quests or wares to go and talk to them. With a flask in hand (game/throws.js) a click throws it at the cursor
// instead, whatever is there. F or right Ctrl: the action key (game/action.js): open the chest
// beside the player, else talk to the villager beside them, else collect what lies around
// (Enter is the chat, game/console.js). I (or V): the inventory, with the floor in reach beside the bag
// when something lies there (game/inventory.js); U: the inventory's quests tab; X: item labels.
// Tab or C: the camera key (game/camerakey.js): a tap switches the overview and the close view,
// held it lets the mouse turn the overview. In the close view the mouse looks around (captured,
// game/mouselook.js) and there is no walking by mouse: a click attacks where the crosshair is
// (hold for more; a flask is thrown there; what is under it and in reach is used instead), the
// right button locks on to an enemy (game/lockon.js). 1-6: the quick bar (game/
// quickbar.js; while the teleport scroll asks where to, they pick there: game/teleportmenu.js). Touch (game/touch.js) feeds the same paths: its stick moves like the keys, its
// action button holds like Shift, its use button is the action key, and a tap on the game
// clicks there without walking.
import { stepZoom } from '../core/zoom.js';
import { player, state, view, setStatus } from './state.js';
import { spawnEntry, nextCube } from './flow.js';
import { knockDown } from './ragdoll.js';
import { toggleInventory, toggleQuests, setInventoryOpen, talkTo } from './inventory.js';
import { controls, clearInput } from './inputstate.js';
import { pointer, pickFloor, aimPoint, hoveredEnemy, pointAt, updatePointer } from './pointer.js';
import { orderMove, orderAttack, orderPickup, orderChest, clearOrder, orderTrade, orderWalk, orderPart, orderWay, orderRobot, canTrade } from './orders.js';
import { hoveredPickup, hoveredChest, hoveredVillager, hoveredPart, hoveredWay, hoveredRobot, toggleLabels, updateLootLabels } from './lootlabels.js';
import { canWakeRobot, wakeRobot } from './robot.js';
import { queueAttack } from './sword.js';
import { softTarget, combatStats, readiedFlask, LUNGE_REACH } from '../core/combat.js';
import { throwTarget } from './throws.js';
import { lineOfFire } from './shots.js';
import { clearLine } from '../physics/enemynav.js';
import { allEnemies } from './enemies.js';
import { toggleMusic, keysOf, bindings, actionsOf, clickMove, invertZoom } from './settings.js';
import { settingsOpen } from './settingsmenu.js';
import { actionsFor, isChar, isModifier, BAR_ACTIONS, MOVE_ACTIONS } from '../core/keybinds.js';
import { barKey } from './quickbar.js';
import { teleportMenuOpen, closeTeleportMenu, pickTeleport } from './teleportmenu.js';
import { setMenuOpen, toggleMenu } from './escmenu.js';
import { answerLeave } from './leavefight.js';
import { answerDeath } from './deathask.js';
import { useAction } from './action.js';
import { cameraKeyDown, cameraKeyUp, cancelCameraKey } from './camerakey.js';
import { screenToWorld, WALK_BELOW } from '../core/stick.js';
import { unturn, ROLL } from '../core/roll.js';
import { keyRoll } from './roll.js';
import { mouseLook, looking, capture, escJustReleased } from './mouselook.js';
import { toggleLock } from './lockon.js';
import { forwardYaw } from '../core/view.js';
import { canReachPickup, takePickup } from './loot.js';
import { canReachChest, openChest } from './chests.js';
import { canReachPart, usePart } from './trials.js';
import { msg, tr } from '../i18n/i18n.js';
export { clearInput };

const { keys } = controls;
const typed = new Map();   // code -> the character it typed last (for keys bound by character)

// is any of the action's keys held?
export function held(id) {
  return keysOf(id).some(k => k !== null && (isChar(k) ? [...keys].some(c => typed.get(c) === k) : keys.has(k)));
}
// a chord with Ctrl or Alt held that the game does not hold as one of its keys, or with Cmd:
// the browser's or the system's shortcut (Ctrl+L), not the game's
const ours = (a, b) => [a, b].some(c => keys.has(c) && actionsFor(bindings(), c, null).length);
const foreign = e => e.metaKey || (e.ctrlKey && !ours('ControlLeft', 'ControlRight')) || (e.altKey && !ours('AltLeft', 'AltRight'));

// what a press does (the hold actions are read every frame: inputDir, wantsWalk, autoAttackHeld;
// the inventory, the quick bar and the menu are handled before, as they work with
// panels open)
const PRESS = {
  jump: () => { controls.jumpPressed = true; },
  // a tap between two frames still swings (holding is handled every frame in update.js)
  attack: () => { if (!state.transitioning) autoAttack(); },
  music: () => setStatus(toggleMusic() ? tr('Music on') : tr('Music off')),
  turnLeft: () => { view.yawTarget -= Math.PI / 2; },
  turnRight: () => { view.yawTarget += Math.PI / 2; },
  respawn: () => { spawnEntry(); setStatus(tr('Respawned where you came in')); },
  labels: () => toggleLabels(),
  action: () => useAction(),   // chest, villager, collect, else nothing
  zoomIn: () => { view.zoomTarget = stepZoom(view.zoomTarget, -1); },
  zoomOut: () => { view.zoomTarget = stepZoom(view.zoomTarget, 1); },
  knockOver: () => { if (!player.ragdoll) knockDown({ push: 3, hop: 2.5, reason: msg('Whoops!') }); },
  path: () => { state.showPath = !state.showPath; if (state.world) state.world.pathLine.visible = state.showPath; },
};

addEventListener('keydown', e => {
  // typing in a field: only Escape is ours
  if (e.target?.tagName === 'INPUT' && e.target.type === 'text') {
    if (e.code === 'Escape' && state.menuOpen) { setMenuOpen(false); e.preventDefault(); }
    return;
  }
  // the main menu (game/menu.js) has its own keys, the settings (game/settingsmenu.js) too
  if (state.mode === 'menu' || settingsOpen()) return;
  const acts = isModifier(e.code) || !foreign(e) ? actionsOf(e) : [];
  const is = id => acts.includes(id);
  // the Esc menu is open: Esc and the menu key close it, the game gets no keys
  if (state.menuOpen) {
    // (not the Esc that just gave the captured mouse back and opened it: game/mouselook.js)
    if ((e.code === 'Escape' ? !escJustReleased() : is('menu')) && !e.repeat) setMenuOpen(false);
    if (!['Tab', 'Enter', 'Space'].includes(e.code)) e.preventDefault();   // (the buttons keep Tab, Enter and Space)
    return;
  }
  // "Leave the fight?" (game/leavefight.js): Enter or Y leaves, Esc, N or the menu key stays
  if (state.leaveAsk) {
    if (!e.repeat && ['Enter', 'NumpadEnter', 'KeyY'].includes(e.code)) answerLeave(true);
    else if (!e.repeat && (['Escape', 'KeyN'].includes(e.code) || is('menu'))) answerLeave(false);
    if (!['Tab', 'Space'].includes(e.code)) e.preventDefault();   // (the buttons keep Tab and Space)
    return;
  }
  // "You died" (game/deathask.js): Enter or the respawn key respawns, Esc and the menu key open
  // the Esc menu over it (a focused button keeps Enter, Tab and Space)
  if (state.deathAsk) {
    const button = e.target?.tagName === 'BUTTON' && ['Enter', 'NumpadEnter', 'Space'].includes(e.code);
    if (!e.repeat && !button && (['Enter', 'NumpadEnter'].includes(e.code) || is('respawn'))) answerDeath(true);
    else if (!e.repeat && (e.code === 'Escape' || is('menu'))) setMenuOpen(true);
    if (!button && e.code !== 'Tab') e.preventDefault();
    return;
  }
  if (!isModifier(e.code) && foreign(e)) {
    // Ctrl held but not as one of the game's keys: moving still goes on (Ctrl+S, Ctrl+D and
    // Ctrl+A neither save, bookmark nor select), every other shortcut is left alone
    const move = actionsOf(e).some(id => MOVE_ACTIONS.includes(id));
    if (move && e.ctrlKey && !e.metaKey && !e.altKey && !state.inventoryOpen) { keys.add(e.code); typed.set(e.code, e.key); e.preventDefault(); }
    return;
  }
  if (is('inventory')) { if (!e.repeat) toggleInventory(); e.preventDefault(); return; }
  if (is('quests')) { if (!e.repeat) toggleQuests(); e.preventDefault(); return; }
  if (e.code === 'Escape' && state.inventoryOpen) { setInventoryOpen(false); e.preventDefault(); return; }
  // the quick bar (with the inventory open: put the selected item there); not while typing
  // (the teleport scroll asking where to, game/teleportmenu.js: the keys pick there; Esc closes it)
  const bar = BAR_ACTIONS.findIndex(is);
  if (bar >= 0 && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) {
    if (!e.repeat) { if (teleportMenuOpen()) pickTeleport(bar); else barKey(bar); }
    e.preventDefault(); return;
  }
  if (e.code === 'Escape' && teleportMenuOpen()) { closeTeleportMenu(); e.preventDefault(); return; }
  if (state.inventoryOpen) return;
  // the camera key: what it does is decided when it is let go (or the mouse moves)
  if (is('camera')) { if (!e.repeat) cameraKeyDown(e.code); e.preventDefault(); return; }
  // Esc with nothing else open, and the menu key: the menu (play together and the settings are in it)
  if (e.code === 'Escape' || is('menu')) { if (!e.repeat) toggleMenu(); e.preventDefault(); return; }
  keys.add(e.code); typed.set(e.code, e.key);
  if (acts.length || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  for (const id of acts) PRESS[id]?.();
  if (e.code === 'KeyN' && state.dev) nextCube();   // (new worlds come from the main menu)
});
addEventListener('keyup', e => { keys.delete(e.code); cameraKeyUp(e.code); });
addEventListener('blur', () => { clearInput(); cancelCameraKey(); });
// Ctrl+click is a right click on macOS: no context menu over the game
addEventListener('contextmenu', e => { if (e.target.tagName === 'CANVAS') e.preventDefault(); });
// no picture or link dragged off by accident (style.css stops text selection)
addEventListener('dragstart', e => e.preventDefault());
// Auto-attack (Shift): attack the best enemy the weapon can reach (a blade's reach, a shot's
// range), the hovered one first, else the closest, preferring those ahead of the movement keys
// or the facing. Never at the air and never walking up: without an enemy that close (and, for
// a shot, in sight) it does nothing. AUTO_REACH: the wind-up's step-in still connects a little
// beyond blade reach. Mouse orders carry on.
const AUTO_REACH = 0.15;
const bladeSees = e => clearLine(player.x, player.y + 0.4, player.z, e.x,
  Math.max(e.y + 0.1, Math.min(player.y + 0.4, e.y + e.profile.bodyHeight - 0.05)), e.z);
export function autoAttack() {
  if (readiedFlask(player)) return null;   // flasks are only ever thrown with a click
  const hovered = hoveredEnemy(), [dx, dz] = inputDir(), stats = combatStats(player);
  const visible = stats?.ranged ? e => lineOfFire(player, e, stats) : bladeSees;
  const yaw = dx || dz ? Math.atan2(dx, dz) : player.yaw;
  const target = (hovered && softTarget(player, [hovered], yaw, visible, AUTO_REACH))
    || softTarget(player, allEnemies(), yaw, visible, AUTO_REACH);
  if (target) queueAttack(target);
  return target;
}
// a tap on the action button with a flask in hand (game/touch.js): at the best enemy in range
// and in sight, else straight ahead
export function quickThrow() {
  if (!readiedFlask(player) || state.transitioning || state.inventoryOpen) return;
  const [dx, dz] = inputDir(), yaw = dx || dz ? Math.atan2(dx, dz) : player.yaw;
  queueAttack(softTarget(player, allEnemies(), yaw, bladeSees));
}
export const autoAttackHeld = () => !state.inventoryOpen && !state.transitioning && (controls.attackHeld || held('attack'));
// the walk key (left Ctrl), or the touch stick pushed only a little
export const wantsWalk = () => held('walk') || (controls.stick.m > 0 && controls.stick.m < WALK_BELOW);
addEventListener('pointerdown', e => {
  // touches are game/touch.js's (a tap comes back through tapGame)
  if (e.pointerType === 'touch' || e.target.tagName !== 'CANVAS') return;
  // mouse look: a click while the mouse is free only captures it
  if (mouseLook()) { e.preventDefault(); if (!looking()) capture(); else lookClick(e.button); return; }
  if (e.button !== 0 || state.transitioning || state.inventoryOpen) return;
  e.preventDefault();
  pointer.down = true;
  click(clickMove());   // (the settings: off, the floor does not walk)
});
// a tap on the game at (x, y) px (game/touch.js): a click there, except that the floor does not
// walk; nothing stays hovered afterwards
export function tapGame(x, y) {
  if (state.transitioning || state.inventoryOpen) return;
  pointAt(x, y); updatePointer(); updateLootLabels();
  pointer.down = false;
  click(false);
  pointer.inside = false;
}
// what a click on the game does: with a flask in hand, throw it there; else go for the enemy,
// villager, item, chest, trial part or way out (a portal, a door) under the cursor, or (walk) walk
// to the floor there (a mouse's click, unless the settings turn that off)
function click(walk) {
  if (readiedFlask(player)) {
    pointer.mode = null; clearOrder();
    const target = throwTarget();
    if (target) queueAttack(target.enemy ?? target);
    return;
  }
  const enemy = hoveredEnemy();
  if (enemy) { pointer.mode = 'attack'; orderAttack(enemy); return; }
  const villager = hoveredVillager();
  if (villager) { pointer.mode = null; orderTrade(villager); return; }
  const item = hoveredPickup();
  if (item) { pointer.mode = null; if (item.questItem) orderWalk(item.x, item.y, item.z); else orderPickup(item); return; }
  const chest = hoveredChest();
  if (chest) { pointer.mode = null; orderChest(chest); return; }
  const part = hoveredPart();
  if (part) { pointer.mode = null; orderPart(part); return; }
  const way = hoveredWay();
  if (way) { pointer.mode = null; orderWay(way); return; }
  const robot = hoveredRobot();
  if (robot) { pointer.mode = null; orderRobot(robot); return; }
  if (!walk) { pointer.mode = null; return; }
  pointer.mode = 'move';
  const hit = pickFloor();
  if (hit) orderMove(hit);
  else {   // off the map: head that way
    const a = aimPoint();
    if (a) orderMove({ x: a.x, z: a.z, s: null });
  }
}

// --- mouse look (the close view) ----------------------------------------------------------------

function lookClick(button) {
  if (state.transitioning || state.inventoryOpen) return;
  if (button === 2) { toggleLock(hoveredEnemy()); return; }
  if (button !== 0) return;
  clearOrder();
  pointer.down = true; pointer.mode = 'look';
  lookAttack(true);
}
// what the crosshair is on (game/lootlabels.js), if it is in reach: used (a click); true if so
function useHovered() {
  const villager = hoveredVillager();
  if (villager && canTrade(villager)) { talkTo(villager); return true; }
  const item = hoveredPickup();
  if (item && !item.questItem && canReachPickup(item)) { takePickup(item); return true; }
  const chest = hoveredChest();
  if (chest && canReachChest(chest)) { openChest(chest); return true; }
  const part = hoveredPart();
  if (part && canReachPart(part)) { usePart(part); return true; }
  const robot = hoveredRobot();
  if (robot && canWakeRobot(robot)) return wakeRobot(robot);
  return false;
}
// the enemies within `cone` rad of `yaw`, seen from the player
const inCone = (yaw, cone) => allEnemies().filter(e => {
  const dx = e.x - player.x, dz = e.z - player.z;
  return Math.hypot(dx, dz) < 0.3 || Math.cos(Math.atan2(dx, dz) - yaw) >= Math.cos(cone);
});
const RANGED_ASSIST = 0.35, MELEE_CONE = 1;   // rad either side of where the view looks
// what an attack goes for with mouse look: the enemy hovered (under the crosshair, or locked on
// to); a blade: unless it is out of reach, then the best one in reach ahead, else that way; a
// shot: else the best one in sight a little either side of the crosshair, else straight on
function lookTarget() {
  const fwd = forwardYaw(view.yaw), stats = combatStats(player), hovered = hoveredEnemy();
  const ahead = d => ({ x: player.x + Math.sin(fwd) * d, z: player.z + Math.cos(fwd) * d });
  if (stats?.ranged) return hovered ?? softTarget(player, inCone(fwd, RANGED_ASSIST), fwd, e => lineOfFire(player, e, stats)) ?? ahead(stats.range);
  const reach = e => Math.hypot(e.x - player.x, e.z - player.z) <= (stats?.range ?? 0.85) + e.profile.radius + AUTO_REACH + LUNGE_REACH;
  if (hovered && reach(hovered)) return hovered;
  return softTarget(player, inCone(fwd, MELEE_CONE), fwd, bladeSees, AUTO_REACH) ?? (hovered ? { x: hovered.x, z: hovered.z } : ahead(2));
}
// a click with mouse look (`click`), and every frame the button is held (game/update.js): attack
// where the crosshair is, unlike Shift also into the air; a flask is thrown there (only on the click)
export function lookAttack(click = false) {
  if (state.transitioning || state.inventoryOpen) return;
  const flask = readiedFlask(player);
  if (flask) {
    if (!click) return;
    const fwd = forwardYaw(view.yaw), d = flask.flask.range * 0.8;
    const t = throwTarget() ?? { x: player.x + Math.sin(fwd) * d, y: player.y, z: player.z + Math.cos(fwd) * d };
    queueAttack(t.enemy ?? t);
    return;
  }
  if (click && useHovered()) { pointer.down = false; return; }
  queueAttack(lookTarget());
}
export const lookHeld = () => pointer.down && pointer.mode === 'look' && mouseLook();

addEventListener('wheel', e => {
  if (!state.inventoryOpen && !state.menuOpen && state.mode === 'play') view.zoomTarget = stepZoom(view.zoomTarget, Math.sign(e.deltaY) * (invertZoom() ? -1 : 1));
}, { passive: true });

// desired direction in world space (WASD or the touch stick, relative to the camera; the world
// rolled on the screen, as the keys follow it: game/roll.js keyRoll, which is told what is held
// even when nothing moves the hero, so a key held through the inventory is a new one after it).
// Only the roll may be latched: the camera's yaw (the camera keys, the mouse, the lock-on) always
// steers the keys at once.
export function inputDir() {
  let ix = 0, iy = 0;
  if (held('moveUp')) iy += 1;
  if (held('moveDown')) iy -= 1;
  if (held('moveRight')) ix += 1;
  if (held('moveLeft')) ix -= 1;
  const s = controls.stick, keys = ix || iy;
  if (s.m > 0) { ix += s.x; iy += s.y; }
  const stopped = state.inventoryOpen || state.leaveAsk || state.deathAsk;
  const roll = keyRoll(stopped ? 0 : ix, stopped ? 0 : iy, keys ? 0 : ROLL.swing);
  if (stopped) return [0, 0];
  if (player.autoDir) return player.autoDir;
  return screenToWorld(...unturn(ix, iy, roll), view.yaw);
}
export function takeJump() { const j = controls.jumpPressed; controls.jumpPressed = false; return j; }
