// Entry point: load the first cube and run the frame loop.
import * as THREE from 'three';
import { renderer, scene, camera, fitView } from './render/scene.js';
import { animateWorld } from './render/world.js';
import { animateCharacter } from './render/animator.js';
import { generate } from './cubegen/index.js';
import { groundAt } from './physics/collide.js';
import { player, state, setStatus, worldPaused } from './game/state.js';
import { loadCube } from './game/flow.js';
import { updatePlayer } from './game/update.js';
import { updateCamera } from './game/camera.js';
import { updateCut } from './game/cut.js';
import { updateHud } from './game/hud.js';
import { updateConsole, openChat, closeChat, say } from './game/console.js';
import { runCommand } from './game/commands.js';
import { chronicle } from './game/log.js';
import { updateInventory } from './game/inventory.js';
import { updateQuests } from './game/quests.js';
import { skinEditorOpen } from './game/skineditor.js';
import { devSwapWeapon, devDropWeapon, devWear } from './game/equipment.js';
import { updateLightPool, focusPoint } from './render/lightpool.js';
import { tickNeighbors, cullNeighbors } from './render/neighbors.js';
import { tickProps } from './render/props.js';
import { tickFluidDeath } from './render/fluiddeath.js';
import { applyLook } from './render/look.js';
import { tickSky } from './render/sky.js';
import { tickResolution } from './render/resolution.js';
import { keepPrograms } from './render/programs.js';
import { updatePlayerBar } from './render/playerbar.js';
import { updatePortalBar } from './render/portalbar.js';
import { updateCastBar } from './render/castbar.js';
import { updateQuickbar } from './game/quickbar.js';
import { updateTeleportMenu } from './game/teleportmenu.js';
import { updateLeave } from './game/leavefight.js';
import { updateTouch } from './game/touch.js';
import './game/nozoom.js';   // the page never zooms, only the game's view
import { updateLoot } from './game/loot.js';
import { updateLootLabels } from './game/lootlabels.js';
import { tickFloatText } from './render/floattext.js';
import { tickParticles } from './render/particles.js';
import { tickPortalCloud } from './render/portalcloud.js';
import { timeScale } from './game/juice.js';
import { gameTime, pace } from './game/pace.js';
import { teach, tickTeach } from './game/teach.js';
import { updatePointer } from './game/pointer.js';
import { depthOf } from './themes/depth.js';
import { goHorde, goSpan, goFeature } from './game/dev.js';
import { spawnEnemies, killEnemies, clearEnemies } from './game/devspawn.js';
import { updateSpiders, spiders } from './game/spiders.js';
import { stunders } from './game/stunders.js';
import { snakes } from './game/snakes.js';
import { octonauts } from './game/octonauts.js';
import { fireFaces } from './game/firefaces.js';
import { triangles } from './game/triangles.js';
import { fireCats } from './game/firecats.js';
import { shraps } from './game/shraps.js';
import { spicies } from './game/spicy.js';
import { wollas } from './game/wolla.js';
import { wolks } from './game/wolk.js';
import { projectiles } from './game/projectiles.js';
import { beams } from './game/beams.js';
import { tickBurning } from './render/burning.js';
import { tickChill } from './render/chilled.js';
import { tickShock } from './render/shocked.js';
import { tickStatuses } from './render/statuses.js';
import { updateEffects } from './game/effects.js';
import { updateAim } from './game/throws.js';
import { updateEnemies, allEnemies } from './game/enemies.js';
import { updateMusic, forceMood } from './game/music.js';
import { updateFootsteps } from './game/footsteps.js';
import { updateSounds } from './game/sounds.js';
import { updateAmbience } from './game/ambience.js';
import { musicInfo } from './audio/music.js';
import { travelling, updateTravel, drawTravelEnemies } from './game/travel.js';
import { updateOnline, hostGame, joinGame, leaveGame, sessionStatus } from './net/session.js';
import { online } from './net/online.js';
import { frameRate, antialias, onSettingsChange } from './game/settings.js';
import { setMsaa, beginFrame, endFrame } from './render/msaa.js';
import { updateSaves, store, play, saveAs, saveNow, savedHero, savedWorld } from './game/save.js';
import { openMainMenu, updateMenu, quitToMenu, heroBox } from './game/menu.js';
import { updateShowcase } from './game/showcase.js';
import { drawMinimap } from './game/minimap.js';
import { N } from './core/constants.js';
import { character, followHero } from './render/character.js';
import { drawPortrait, portraitShown } from './render/portrait.js';

// seconds since the last frame (THREE.Clock is deprecated; Timer measures the same)
const timer = new THREE.Timer(), clock = { getDelta: () => timer.update().getDelta() };
// s: the longest step the game takes at once, so a hitch is not one huge jump (a little over
// 1/30: frames capped at 30 a second wobble around it)
const MAX_STEP = 1 / 27;

// The frame rate cap (the settings, game/settings.js): the screen asks for a frame as often as it
// shows one (60, 120 times a second ...); under a cap the ones that come too early are skipped.
// SLACK: ms a frame may come early (the screen's ticks wobble a little).
const SLACK = 2;
let due = 0;   // when the next frame is due (ms)
function tooEarly(now) {
  const fps = frameRate();
  if (!fps) return false;
  const interval = 1000 / fps;
  if (now < due - SLACK) return true;
  if (now - due > interval) due = now;   // fell behind (or just started): count from here
  due += interval;
  return false;
}

// learn: architecture.html#conductor #main-js, loop.html#frame-code #one-tick #pause #smoothing (see learn/README.md)
function frame(now = performance.now()) {
  if (tooEarly(now)) { requestAnimationFrame(frame); return; }
  const start = performance.now();
  const elapsed = Math.min(clock.getDelta(), MAX_STEP);
  updateLeave();   // "Leave the fight?" goes away once it cannot be answered (game/leavefight.js)
  if (state.mode === 'menu') { menuFrame(elapsed, start); return; }
  if (character.ready) character.group.visible = true;
  const dt = worldPaused() ? 0 : gameTime(elapsed) * timeScale(elapsed);
  updatePointer();   // the enemy under the cursor (with last frame's camera)
  state.time += dt;
  if (dt > 0 && travelling()) updateTravel(dt);
  else if (dt > 0 && state.map && !state.transitioning) { updatePlayer(dt); if (!state.transitioning) updateEnemies(dt); }

  // smooth out small vertical snaps (steps), but not falls
  player.visY += (player.y - player.visY) * Math.min(1, dt * 25);
  if (Math.abs(player.y - player.visY) > 1.5 || player.ragdoll) player.visY = player.y;
  animateCharacter(dt, state.time);
  updateFootsteps();   // on the cycle the animator just advanced
  updateSounds(dt); updateAmbience(dt);
  tickFluidDeath(dt);
  tickBurning(dt); tickChill(dt); tickShock(dt); tickStatuses(allEnemies(), dt);
  drawTravelEnemies(dt);
  updateLoot(dt, state.time);
  tickFloatText(dt);
  tickParticles(dt);
  tickPortalCloud(dt);
  tickNeighbors(dt);
  tickProps(state.time);
  if (state.world) animateWorld(state.world, dt, state.time);
  updateHud(player, state.map);
  updateConsole();   // the chat box: the chronicle and the game's last word (game/console.js)
  updateInventory();
  updateQuickbar(); updateTeleportMenu(); updateEffects(); updateTouch();
  updateCamera(pace.paused ? elapsed : dt);   // paused by the Teacher (game/pace.js): the view still turns
  if (!state.transitioning) updateCut(dt);   // after the camera: the cut depends on what the camera can see
  updateLootLabels();   // after the camera too: labels sit over their items
  drawMinimap();   // after the camera too: the map turns with it
  updateAim(allEnemies());   // the arc a flask in hand would fly (game/throws.js)
  tickTeach();   // what the Teacher draws over the world (game/teach.js)
  // the look follows the depth smoothly (also while sliding down / up)
  if (state.cubeKey) state.lookDepth += (depthOf(state.cubeKey) - state.lookDepth) * Math.min(1, dt * 2.5);
  applyLook(state.lookDepth, camera.position.distanceTo(focusPoint(player.x, player.visY, player.z)), state.cubes?.layout.themes);
  followHero();   // the hero's light where it stands (render/character.js)
  updateLightPool(focusPoint(player.x, player.visY + 1, player.z));
  cullNeighbors(player.x, player.z, !state.transitioning, state.showNeighbors, player.visY + (player.swimming ? 0.6 : 0.3));
  updatePlayerBar();
  updateOnline();   // playing together: send our pose, follow, show the partner (net/session.js)
  updatePortalBar();
  updateCastBar();
  updateMusic(elapsed);
  updateQuests(elapsed);   // the world's quests: goals done, offers made, told to the others (game/quests.js)
  updateSaves();   // the hero and world being played, as they change (game/save.js)
  tickSky(performance.now() / 1000);   // real time: the stars shimmer on while paused
  fitView();      // a new size or resolution only now, right before drawing (render/scene.js)
  beginFrame();   // anti-aliasing: draw into the multisampled buffer (render/msaa.js)
  renderer.render(scene, camera);
  endFrame();     // and onto the screen
  keepPrograms();   // compiled shaders stay (render/programs.js)
  tickResolution(start, frameRate());   // fewer pixels while the GPU cannot keep up (render/resolution.js)
  requestAnimationFrame(frame);
}

// The main menu (game/menu.js): nothing to play; behind it a cube lives on (game/showcase.js:
// the chosen hero's, else random ones), the chosen hero stands over it (render/portrait.js), and
// joining a friend goes on (their world starts here, net/session.js)
const menuFocus = new THREE.Vector3(N / 2, 2, N / 2);
const SWAY = 0.6, SWAY_SPEED = 0.35;   // the hero in the menu turns a little to and fro (rad, rad/s)
function menuFrame(dt, start) {
  // The modal has its own renderer. Do not render/simulate a hidden dungeon and
  // portrait behind it, competing with brush input for both CPU and GPU time.
  if (skinEditorOpen()) { requestAnimationFrame(frame); return; }
  state.time += dt;
  if (character.ready && !portraitShown()) character.group.visible = false;
  if (portraitShown()) { player.yaw = Math.sin(state.time * SWAY_SPEED) * SWAY; animateCharacter(dt, state.time); }
  updatePlayerBar(); updatePortalBar(); updateCastBar();   // (they hide with no hero)
  updateOnline();
  updateMenu();
  updateShowcase(dt);
  if (state.map && !state.transitioning) updateEnemies(dt);
  tickBurning(dt); tickChill(dt); tickShock(dt); tickStatuses(allEnemies(), dt);
  tickFloatText(dt); tickParticles(dt);
  tickProps(state.time);
  if (state.world) animateWorld(state.world, dt, state.time);
  updateCamera(dt);
  applyLook(state.lookDepth, camera.position.distanceTo(menuFocus), state.cubes?.layout.themes);
  followHero();   // (off: the hero is not in the world here)
  updateLightPool(menuFocus);
  tickSky(performance.now() / 1000);
  fitView();
  beginFrame();
  renderer.render(scene, camera);
  drawPortrait(heroBox());
  endFrame();
  keepPrograms();
  tickResolution(start, frameRate());
  requestAnimationFrame(frame);
}

// the anti-aliasing follows the settings (render/msaa.js)
setMsaa(antialias());
onSettingsChange(() => setMsaa(antialias()));

// the dev tools and ?seed= start in a world, everyone else in the main menu (game/state.js mode)
if (state.mode === 'play') {
  loadCube();
  setStatus('Welcome to town. Follow the path through the grove to leave.');
} else openMainMenu();
// debug / test hooks
window.__game = {
  get map() { return state.map; }, player, generate, loadCube, updatePlayer, groundAt,
  get transitioning() { return state.transitioning; }, get spiders() { return spiders; }, updateSpiders, state,
  get stunders() { return stunders; }, get snakes() { return snakes; }, get octonauts() { return octonauts; },
  get fireFaces() { return fireFaces; }, get triangles() { return triangles; }, get fireCats() { return fireCats; }, get shraps() { return shraps; }, get spicies() { return spicies; }, get wollas() { return wollas; }, get wolks() { return wolks; },
  get projectiles() { return projectiles; }, get beams() { return beams; },
  get enemies() { return allEnemies(); }, updateEnemies,
  musicInfo, musicMood: forceMood,   // musicMood('boss') holds a mood to listen to it, musicMood() lets go
  net: { online, hostGame, joinGame, leaveGame, status: sessionStatus },   // playing together (net/session.js)
  saves: { store, play, saveAs, saveNow, get hero() { return savedHero(); }, get world() { return savedWorld(); } },   // game/save.js
  menu: { open: openMainMenu, quit: quitToMenu },   // the main menu (game/menu.js)
  chat: { open: openChat, close: closeChat, say, run: runCommand, chronicle },   // the chat box (game/console.js)
  teach,   // drawings, lenses, pause / slow / step, tuning with a way back (game/teach.js)
  devSwapWeapon: state.dev ? devSwapWeapon : undefined, devDropWeapon: state.dev ? devDropWeapon : undefined,
  devWear: state.dev ? devWear : undefined,   // devWear('wear_wizard_hat'), devWear(null)
  ...(state.dev && { spawnEnemy: spawnEnemies, killEnemies, clearEnemies, goHorde, goSpan, goFeature }),   // (the console's /spawn, /kill ...)
};
frame();
