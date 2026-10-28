// Mutable game state shared between modules.
import { CHAR_R, CHAR_H } from '../core/constants.js';
import { swordState } from '../core/combat.js';
import { DEFAULT_ZOOM } from '../core/zoom.js';
import { PITCH } from '../core/view.js';
import { createPlayerStats, createRun } from '../core/progression.js';
import { together } from '../net/online.js';

const params = new URLSearchParams(location.search);
const dev = params.get('dev') === '1';
// the dev tools and ?seed= start in a world right away (?menu=1: in the main menu after all;
// ?join=CODE always: joining is done there)
const skipMenu = (dev || params.has('seed')) && params.get('menu') !== '1' && !params.has('join');

// learn: architecture.html#notebook (see learn/README.md)
export const player = {
  x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, visY: 0,
  r: CHAR_R, h: CHAR_H, layer: 0, yaw: 0,
  ...createPlayerStats(dev, { armed: dev }),   // ?dev=1: armed, with gold to spend (core/progression.js DEV_GOLD)
  sword: swordState(),
  grounded: true, swimming: false, fluid: 0, fluidDeath: 0, support: null,
  airTime: 0, coyote: 0, jumpBuf: 0, stun: 0,
  burning: null,   // on fire (core/projectiles.js ignite)
  chilled: null,   // slowed by an ice ball (core/projectiles.js chillFrom)
  slowed: null,    // slowed by slime (core/status.js slowFrom)
  gust: null,      // blown back by a Wolla's storm (core/gusts.js pushStep)
  pull: null,      // drawn in by Gusto breathing in (game/gusts.js, physics/move.js)
  shocked: 0,      // stunned by a Wolk's bolt: how long its sparks still crackle (render/shocked.js)
  dazed: 0,        // squashed flat by a giant (Squarlo): how long the stars still circle (render/shocked.js)
  flat: 0,         // ... and how long the squash still shows on the hero (render/animator.js)
  // event counters the animator watches
  jumpCount: 0, landCount: 0, landImpact: 0,
  ragdoll: null, getUp: null,   // getting up after a ragdoll (game/ragdoll.js)
  ragdollThen: null, climb: null, climbV: 0,
  safe: { x: 0, y: 0, z: 0 }, safeTimer: 0,
  autoDir: null,   // overrides the movement keys (used by test bots)
  god: dev,        // dev starts invincible; /god off disables it (core/progression.js takeDamage)
};

// learn: architecture.html#notebook (see learn/README.md)
export const state = {
  map: null, world: null, time: 0,
  mode: skipMenu ? 'play' : 'menu',   // 'menu': the main menu (game/menu.js); 'play': in a world
  showPath: false, transitioning: false, inventoryOpen: false, equipping: false,
  menuOpen: false,   // the Esc menu (game/escmenu.js)
  leaveAsk: null,   // "Leave the fight?" asked: { key, dir } (game/leavefight.js)
  deathAsk: null,   // "You died" asks what next: { back } (game/deathask.js)
  film: false,      // a film plays over everything (film/player.js): the world waits
  intro: null,      // a boss's intro plays (game/bossintro.js): { full (the whole of it), bar (his bar may show) }
  introVoid: 0,     // how far a boss's intro takes the world round his arena (0 .. 1, like `void`: Flip's, game/reveals.js)
  introDim: 0,      // how far a boss's intro has taken the light (0 .. 1, like `dark`: main.js, render/look.js)
  run: createRun(),
  statusMsg: '', statusUntil: 0,
  // the world of cubes and where we are in it; lookDepth: the depth the lighting shows
  cubes: null, cubeKey: '', arrival: null, portalLock: 0, portalCharge: null, showNeighbors: true, lookDepth: 0,   // showNeighbors: tests only
  openedFaces: new Set(), boundaryLock: -1,   // shared side faces unlocked this world
  enemyGrace: 0,     // s left before enemies may attack (game/enemies.js ENTRY_GRACE)
  dark: 0,           // 1 while a boss keeps this cube dark (Totnar, game/totnar.js)
  lookDark: 0,       // how dark it looks, following `dark` (main.js, render/look.js)
  mist: 0,           // 1 while a boss's fog rolls in (Squarlo growing, game/squarlo.js)
  lookMist: 0,       // how misty it looks, following `mist` (main.js, render/look.js)
  tide: null,        // the level (in levels) a boss's tide stands at in this cube, or null (game/tide.js)
  void: 0,           // 1 while Flip's fight goes on: the world round his box goes (game/flipworld.js)
  lookVoid: 0,       // how far it has gone, following `void` (main.js: render/look.js, render/neighbors.js)
  dusk: 0,           // how far into the dusk Renew's fight has gone, 0 .. 1 (game/rewind.js)
  lookDusk: 0,       // how dusky it looks, following `dusk` (main.js, render/look.js)
  night: 0,          // how far into the world's night the cube is, 0 .. 1 (0 without days and nights: game/daycycle.js)
  daySpeed: 1,       // dev (/dayspeed): how fast the time of day runs (0: it stands still)
  dayShift: 0,       // dev: how far (s) the time of day is ahead of the world's play time (game/daycycle.js dayClock)
  cast: null,        // reading a portal scroll: { kind, t, duration, ... } (game/townportal.js startCast)
  visit: null,       // this cube as you came in: what a death restores (game/flow.js)
  fallFrom: null,    // falling through cubes: the cube the fall started in (game/fall.js)
  trial: null,       // the trial of the cube we are in: { key, kind, phase, t, ... } (game/trials.js, core/trials.js)
  dev,   // debug tools (?dev=1)
  keepHero: false,   // a saved hero is played (game/save.js): a new world (N) keeps it as it is
  devPassive: false,   // dev: enemies stand still and never attack (game/devspawn.js)
  baseSeed: params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : (Math.random() * 1e9) >>> 0,
};

// the camera (game/camera.js): which way it looks from and how far (the zoom presets), eased towards the targets; the close
// view's pitch (core/view.js), and whether the mouse is turning it (game/camerakey.js); how far the world
// is rolled on the screen (game/roll.js, core/roll.js; the angle the movement keys follow: roll.js keyRoll)
export const view = { yaw: -Math.PI / 4, yawTarget: -Math.PI / 4, zoom: DEFAULT_ZOOM, zoomTarget: DEFAULT_ZOOM, pitch: PITCH, orbiting: false,
  roll: 0 };

// The inventory, the Esc menu, "Leave the fight?" and "You died" stop the world, except when playing
// together: the friend plays on, and so do the enemies (only your own input stops)
export const worldPaused = () => (state.inventoryOpen || state.menuOpen || !!state.leaveAsk || !!state.deathAsk || state.film) && !together();

// what the game just said: a short line in the chat box (game/console.js), not kept (the
// chronicle, game/log.js, keeps what matters)
export function setStatus(s) { state.statusMsg = s; state.statusUntil = state.time + 2.2; }
