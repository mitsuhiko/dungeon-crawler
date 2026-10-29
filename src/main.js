// Entry point: load the first cube and run the frame loop.
import './render/lighthook.js';   // (first: every lit material takes the fixed lights, render/lighthook.js)
import { playSplash, splashCovers } from './game/splash.js';   // (early: its input comes before the game's)
import { playFilm, filmCovers, filmNow } from './film/player.js';   // (early too: the same)
import { FILMS } from './film/films.js';
import * as THREE from 'three';
import { renderer, scene, camera, fitView } from './render/scene.js';
import { tickBakes, updateBakes, setCurrentBake, baked } from './render/bake.js';
import { animateWorld } from './render/world.js';
import { animateCharacter } from './render/animator.js';
import { generate } from './cubegen/index.js';
import { groundAt } from './physics/collide.js';
import { player, state, setStatus, worldPaused } from './game/state.js';
import { loadCube } from './game/flow.js';
import { updatePlayer } from './game/update.js';
import { updateArmor } from './game/armor.js';
import { updateMovers } from './game/movers.js';
import { updateCamera, closeView, cineView, cameraFocus } from './game/camera.js';
import { updateRoll } from './game/roll.js';
import { updateTilt } from './game/tilt.js';
import { updateCut } from './game/cut.js';
import { updateHud, curtained } from './game/hud.js';
import { updateConsole, openChat, closeChat, say } from './game/console.js';
import { runCommand } from './game/commands.js';
import { chronicle } from './game/log.js';
import { updateInventory } from './game/inventory.js';
import { updateQuests, questEvent } from './game/quests.js';
import { updateDefense } from './game/defense.js';
import { skinEditorOpen } from './game/skineditor.js';
import { devSwapWeapon, devDropWeapon, devWear } from './game/equipment.js';
import { updateLightPool, focusPoint } from './render/lightpool.js';
import { tickNeighbors, cullNeighbors, setNeighborVeil } from './render/neighbors.js';
import { tickProps } from './render/props.js';
import { tickFluidDeath } from './render/fluiddeath.js';
import { applyLook } from './render/look.js';
import { updateDayCycle, lookCycle } from './game/daycycle.js';
import { tickSky } from './render/sky.js';
import { tickResolution, setResolution } from './render/resolution.js';
import { keepPrograms } from './render/programs.js';
import { updatePlayerBar } from './render/playerbar.js';
import { updatePortalBar } from './render/portalbar.js';
import { updateCastBar } from './render/castbar.js';
import { updateBossBar } from './game/bossbar.js';
import { updateBossIntro, updateIntroCard, introFull } from './game/bossintro.js';
import { updateScene, sceneFull } from './game/scene.js';
import { updateTutorial } from './game/tutorial.js';
import { updateQuickbar } from './game/quickbar.js';
import { updateTeleportMenu } from './game/teleportmenu.js';
import { updateLeave } from './game/leavefight.js';
import { updateTouch } from './game/touch.js';
import { missingTranslations } from './game/language.js';   // the page's own words in the game's language
import { language, tr } from './i18n/i18n.js';
import './game/nozoom.js';   // the page never zooms, only the game's view
import './game/uiscale.js';  // the HUD and the menus at the UI scale of the settings
import { updateLoot } from './game/loot.js';
import { updateLootLabels } from './game/lootlabels.js';
import { tickFloatText } from './render/floattext.js';
import { tickParticles, setParticleShare } from './render/particles.js';
import { tickRipples } from './render/ripples.js';
import { tickPortalCloud } from './render/portalcloud.js';
import { timeScale } from './game/juice.js';
import { gameTime, pace } from './game/pace.js';
import { tickWorldClock } from './game/worldclock.js';
import { teach, tickTeach } from './game/teach.js';
import { updatePointer } from './game/pointer.js';
import { updateMouseLook } from './game/mouselook.js';
import { updateLockOn, updateLockMarker } from './game/lockon.js';
import { depthOf, themeById } from './themes/depth.js';
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
import { meckeds } from './game/mecked.js';
import { tornados } from './game/tornado.js';
import { slugs } from './game/slugs.js';
import { bolimes } from './game/bolimes.js';
import { flimmers } from './game/flimmers.js';
import { mooses } from './game/moose.js';
import { updateMeteors } from './game/meteors.js';
import { twisters } from './game/twisters.js';
import { projectiles } from './game/projectiles.js';
import { beams } from './game/beams.js';
import { tickBurning } from './render/burning.js';
import { tickFlames } from './render/flames.js';
import { tickMotes } from './render/motes.js';
import { tickFootprints } from './render/footprints.js';
import { tickQuality } from './game/quality.js';   // the lighting's quality level (the settings: Auto or pinned)
import './game/perf.js';   // ?perf=1: what the frames cost, on any device
import { tickChill } from './render/chilled.js';
import { tickShock, tickDaze } from './render/shocked.js';
import { tickStatuses } from './render/statuses.js';
import { updateEffects } from './game/effects.js';
import { updateAim } from './game/throws.js';
import { updateEnemies, allEnemies } from './game/enemies.js';
import { updateTrial, updateTrialTip } from './game/trials.js';
import { updateMusic, forceMood } from './game/music.js';
import { updateFootsteps } from './game/footsteps.js';
import { updateSounds } from './game/sounds.js';
import { updateAmbience } from './game/ambience.js';
import { musicInfo } from './audio/music.js';
import { setPanner } from './audio/sfx.js';
import { travelling, updateTravel, drawTravelEnemies } from './game/travel.js';
import { updateOnline, hostGame, joinGame, leaveGame, sessionStatus } from './net/session.js';
import { online } from './net/online.js';
import { frameRate, antialiasSamples, resolution, particleShare, onSettingsChange, chooseLanguage } from './game/settings.js';
import './game/display.js';   // the brightness, the minimap's size, reducing motion (the settings)
import { setMsaa, beginFrame, endFrame } from './render/msaa.js';
import { updateSaves, store, play, saveAs, saveNow, savedHero, savedWorld } from './game/save.js';
import { openMainMenu, updateMenu, quitToMenu, heroBox } from './game/menu.js';
import { updateShowcase } from './game/showcase.js';
import { updateNarrator } from './game/narrator.js';
import { updateIntro } from './game/intro.js';
import { updateRobot } from './game/robot.js';
import { drawMinimap } from './game/minimap.js';
import { N } from './core/constants.js';
import { character, followHero } from './render/character.js';
import { applyHeroPose } from './render/renewview.js';
import { drawPortrait, portraitShown } from './render/portrait.js';

// a sound at a place in the world pans by where it is on the screen
const ndc = new THREE.Vector3();
setPanner(at => ndc.set(at.x, at.y, at.z).project(camera).x * 0.6);

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
  updateMouseLook();   // the close view captures the mouse, what needs the cursor gives it back (game/mouselook.js)
  if (state.mode === 'menu') { menuFrame(elapsed, start); return; }
  if (character.ready) character.group.visible = !player.vanished && !player.gulped;   // (inside one of Flip's black holes: game/flipworld.js; in Mansk's mouth: game/mansk.js)
  const dt = worldPaused() ? 0 : gameTime(elapsed) * timeScale(elapsed);
  updatePointer();   // the enemy under the cursor (with last frame's camera)
  state.time += dt;
  tickWorldClock(dt);   // the world's play time: when its enemies come back, its nights (game/worldclock.js)
  if (dt > 0 && travelling()) updateTravel(dt);
  else if (dt > 0 && state.map && !state.transitioning) {
    updateMovers(dt);   // the platforms round Foggery's tower, before whoever stands on one moves (game/movers.js)
    updatePlayer(dt);
    if (!state.transitioning) updateEnemies(dt);
    if (!state.transitioning) updateMeteors(dt);   // the slime meteorites at night (game/meteors.js)
    if (!state.transitioning) updateTrial(dt);   // a trial room's clock, its rising fluid (game/trials.js)
  }
  updateBossIntro(dt);   // a boss's intro: him appearing, the camera's shots (game/bossintro.js; after the enemies)
  updateScene(dt);   // a scene of the story: the robot waking, his first glass (game/scene.js)
  updateTutorial();   // the tutorial's card in the beginning (game/tutorial.js)

  // smooth out small vertical snaps (steps), but not falls
  player.visY += (player.y - player.visY) * Math.min(1, dt * 25);
  if (Math.abs(player.y - player.visY) > 1.5 || player.ragdoll) player.visY = player.y;
  animateCharacter(dt, state.time);
  updateArmor(state.time);   // the hero wears what the bag says, the maximum health with it (game/armor.js)
  applyHeroPose();   // (while Renew's time runs back: the hero as the tape has them, game/rewind.js)
  updateFootsteps();   // on the cycle the animator just advanced
  updateSounds(dt); updateAmbience(dt);
  tickFluidDeath(dt);
  tickBurning(dt); tickChill(dt); tickShock(dt); tickDaze(dt); tickStatuses(allEnemies(), dt);
  drawTravelEnemies(dt);
  updateLoot(dt, state.time);
  updateRobot(dt);   // the robot follows the hero (game/robot.js; before the lights: it has one)
  tickFloatText(dt);
  tickParticles(dt);
  tickRipples(dt);   // (on the water round a swimmer: game/swim.js)
  tickPortalCloud(dt);
  tickNeighbors(dt);
  tickProps(state.time, state.night);   // (the wind; the town's windows and lamps lit at night: render/night.js)
  const focus = cameraFocus();   // (the hero, or what a boss's intro looks at: game/camera.js)
  tickFlames(dt, state.time, focusPoint(focus.x, focus.y, focus.z));   // the fires: flames, embers, smoke (render/flames.js)
  tickMotes(dt, state.map?.biome && themeById(state.map.biome), player.x, player.visY, player.z, state.night);   // what drifts in the air (render/motes.js)
  tickFootprints(dt, state.cubeKey);   // wet prints on the slime dry up (render/footprints.js)
  if (state.world) animateWorld(state.world, dt, state.time);
  updateHud(player, state.map);
  updateConsole();   // the chat box: the chronicle and the game's last word (game/console.js)
  updateInventory();
  updateQuickbar(); updateTeleportMenu(); updateEffects(); updateTouch();
  updateLockOn(pace.paused ? elapsed : dt);   // a lock-on swings the close view round (game/lockon.js)
  updateRoll(pace.paused ? elapsed : dt);   // the world rolled on the screen (game/roll.js)
  updateTilt(pace.paused ? elapsed : dt);   // the cube tipped (Sollmeldon's landings, game/tilt.js)
  updateCamera(pace.paused ? elapsed : dt);   // paused by the Teacher (game/pace.js): the view still turns
  if (!state.transitioning) updateCut(dt);   // after the camera: the cut depends on what the camera can see
  updateLootLabels();   // after the camera too: labels sit over their items
  updateIntroCard();   // and a boss's name under him in his intro (game/bossintro.js)
  updateLockMarker();   // and the lock-on's ring over its enemy
  updateTrialTip();   // after the camera too: the name of a trial over its portal (game/trials.js)
  drawMinimap();   // after the camera too: the map turns with it
  updateAim(allEnemies());   // the arc a flask in hand would fly (game/throws.js)
  tickTeach();   // what the Teacher draws over the world (game/teach.js)
  // the look follows the depth smoothly (also while sliding down / up)
  if (state.cubeKey) state.lookDepth += (depthOf(state.cubeKey) - state.lookDepth) * Math.min(1, dt * 2.5);
  // and a boss's darkness comes and goes over a second or so (game/totnar.js)
  // (and a boss's intro takes some of the light for a while: game/bossintro.js)
  const dark = Math.max(state.dark, state.introDim);
  state.lookDark += (dark - state.lookDark) * Math.min(1, dt * (dark > state.lookDark ? 1.6 : 2.2));
  // and so does a boss's fog (Squarlo growing, game/squarlo.js)
  state.lookMist += (state.mist - state.lookMist) * Math.min(1, dt * (state.mist ? 1.2 : 0.8));
  // and the world round Flip's box goes while his fight is on (game/flipworld.js): the sky black,
  // the neighbours gone
  // (and in his intro, before the fight starts: game/reveals.js)
  const voided = Math.max(state.void, state.introVoid);
  state.lookVoid += (voided - state.lookVoid) * Math.min(1, dt * (voided ? 1.5 : 1));
  if (state.lookVoid < 0.002) state.lookVoid = 0;
  setNeighborVeil(state.lookVoid);
  // and the dusk of Renew's fight falls slowly, and lifts as slowly once he is beaten (game/rewind.js)
  state.lookDusk += (state.dusk - state.lookDusk) * Math.min(1, dt * (state.dusk > state.lookDusk ? 0.8 : 0.4));
  if (state.lookDusk < 0.002) state.lookDusk = 0;
  // and the world's days and nights go round (game/daycycle.js)
  updateDayCycle(dt);
  applyLook(state.lookDepth, camera.position.distanceTo(cameraFocus()), state.cubes?.layout.themes, state.lookDark, state.lookMist, state.lookVoid, state.lookDusk, lookCycle(dt));
  followHero(dt);   // the hero's light where it stands (render/character.js)
  const lit = cameraFocus();
  updateLightPool(focusPoint(lit.x, lit.y + 1, lit.z));
  // (the close view's camera stays out of the solids: nothing of the neighbours is cut either)
  cullNeighbors(player.x, player.z, !state.transitioning && !closeView() && !cineView(), state.showNeighbors, player.visY + (player.swimming ? 0.6 : 0.3));
  updatePlayerBar(closeView(), introFull() || sceneFull());   // (not in a boss's intro, nor a scene)
  updateOnline();   // playing together: send our pose, follow, show the partner (net/session.js)
  updatePortalBar();
  updateCastBar();
  updateBossBar(dt);   // a boss's health along the top of the screen (game/bossbar.js)
  updateMusic(elapsed);
  updateNarrator(elapsed);   // the Glassmaker's voice and her subtitles (game/narrator.js)
  updateQuests(elapsed);   // the world's quests: goals done, offers made, told to the others (game/quests.js)
  updateIntro(dt);   // the beginning: the sword and his glass taken, the shards on the plaza (game/intro.js)
  updateDefense(dt, questEvent);   // a raid on an outpost's cart (game/defense.js), in game time
  updateSaves();   // the hero and world being played, as they change (game/save.js)
  tickSky(performance.now() / 1000);   // real time: the stars shimmer on while paused
  tickQuality(elapsed);   // what the lighting's level draws, its changes fading in (game/quality.js)
  // the cube's fixed lights: baked a little each frame, and where they shine now (render/bake.js;
  // last before drawing: anything above may have built the cube again)
  tickBakes(state.world, curtained()); updateBakes(); setCurrentBake(state.world?.bake);
  // behind the curtain (game/hud.js) while the cube bakes nothing is drawn: the GPU bakes instead
  const draw = !(curtained() && !baked(state.world));
  fitView();      // a new size or resolution only now, right before drawing (render/scene.js)
  if (draw) {
    beginFrame();   // anti-aliasing: draw into the multisampled buffer (render/msaa.js)
    renderer.render(scene, camera);
    endFrame();     // and onto the screen
  }
  keepPrograms(true);   // compiled shaders stay (render/programs.js); any new one was compiled while drawing
  tickResolution(start, frameRate(), draw);   // fewer pixels while the GPU cannot keep up (render/resolution.js)
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
  tickWorldClock(0);   // (playing together the world's play time runs on: game/worldclock.js)
  if (character.ready && !portraitShown()) character.group.visible = false;
  if (portraitShown()) { player.yaw = Math.sin(state.time * SWAY_SPEED) * SWAY; animateCharacter(dt, state.time); updateArmor(state.time); }
  updatePlayerBar(); updatePortalBar(); updateCastBar();   // (they hide with no hero)
  updateOnline();
  updateMenu();
  updateShowcase(dt);
  if (state.map && !state.transitioning) updateEnemies(dt);
  tickBurning(dt); tickChill(dt); tickShock(dt); tickDaze(dt); tickStatuses(allEnemies(), dt);
  tickFloatText(dt); tickParticles(dt);
  tickProps(state.time);
  tickFlames(dt, state.time, menuFocus);
  if (state.world) animateWorld(state.world, dt, state.time);
  updateRoll(dt);   // (out of play: unturned)
  updateTilt(dt);   // (and level)
  updateCamera(dt);
  applyLook(state.lookDepth, camera.position.distanceTo(menuFocus), state.cubes?.layout.themes);
  followHero();   // (off: the hero is not in the world here)
  updateLightPool(menuFocus);
  tickSky(performance.now() / 1000);
  tickQuality(dt);
  tickBakes(state.world, curtained()); updateBakes(); setCurrentBake(state.world?.bake);
  fitView();
  const draw = !splashCovers() && !filmCovers();   // (behind the splash screen or a film nothing shows: game/splash.js, film/player.js)
  if (draw) {
    beginFrame();
    renderer.render(scene, camera);
    drawPortrait(heroBox());
    endFrame();
  }
  keepPrograms(true);
  tickResolution(start, frameRate(), draw);
  requestAnimationFrame(frame);
}

// the anti-aliasing (render/msaa.js: nothing else changes it), the render resolution and the
// particles follow the settings
const graphicsSettings = () => { setMsaa(antialiasSamples()); setResolution(resolution()); setParticleShare(particleShare()); };
graphicsSettings();
onSettingsChange(graphicsSettings);

// the dev tools and ?seed= start in a world, everyone else in the main menu (game/state.js mode)
// ?film=<name>: that film over either (film/films.js), in place of the glass bird breaking; &at=<s>
// from that far in, &hold=1 stopped there (docs/film.md)
const urlParams = new URLSearchParams(location.search), film = FILMS[urlParams.get('film')];
if (state.mode === 'play') {
  loadCube();
  setStatus(tr('Welcome to town. Follow the path through the grove to leave.'));
} else {
  openMainMenu();
  if (!film) playSplash();   // the glass bird breaking, over the menu (game/splash.js)
}
if (film) playFilm(film, { at: urlParams.get('at'), hold: urlParams.get('hold') === '1', click: urlParams.get('hold') !== '1' });
// debug / test hooks
window.__game = {
  get map() { return state.map; }, player, generate, loadCube, updatePlayer, groundAt,
  film: (name = 'opening', opts) => playFilm(FILMS[name], opts), filmNow,   // a film now, and how far it is (film/player.js)
  get transitioning() { return state.transitioning; }, get spiders() { return spiders; }, updateSpiders, state,
  get stunders() { return stunders; }, get snakes() { return snakes; }, get octonauts() { return octonauts; },
  get fireFaces() { return fireFaces; }, get triangles() { return triangles; }, get fireCats() { return fireCats; }, get shraps() { return shraps; }, get spicies() { return spicies; }, get wollas() { return wollas; }, get wolks() { return wolks; }, get meckeds() { return meckeds; }, get tornados() { return tornados; }, get slugs() { return slugs; }, get bolimes() { return bolimes; }, get flimmers() { return flimmers; }, get mooses() { return mooses; }, get twisters() { return twisters; },
  get projectiles() { return projectiles; }, get beams() { return beams; },
  get enemies() { return allEnemies(); }, updateEnemies,
  musicInfo, musicMood: forceMood,   // musicMood('boss') holds a mood to listen to it, musicMood() lets go
  net: { online, hostGame, joinGame, leaveGame, status: sessionStatus },   // playing together (net/session.js)
  saves: { store, play, saveAs, saveNow, get hero() { return savedHero(); }, get world() { return savedWorld(); } },   // game/save.js
  menu: { open: openMainMenu, quit: quitToMenu },   // the main menu (game/menu.js)
  chat: { open: openChat, close: closeChat, say, run: runCommand, chronicle },   // the chat box (game/console.js)
  teach,   // drawings, lenses, pause / slow / step, tuning with a way back (game/teach.js)
  i18n: { language, setLanguage: chooseLanguage, get missing() { return missingTranslations(); } },   // the language (src/i18n/)
  devSwapWeapon: state.dev ? devSwapWeapon : undefined, devDropWeapon: state.dev ? devDropWeapon : undefined,
  devWear: state.dev ? devWear : undefined,   // devWear('wear_wizard_hat'), devWear(null)
  ...(state.dev && { spawnEnemy: spawnEnemies, killEnemies, clearEnemies, goHorde, goSpan, goFeature }),   // (the console's /spawn, /kill ...)
};
frame();
