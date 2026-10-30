// The settings (the settings menu, game/settingsmenu.js, changes them):
//   General   the language (once chosen; before that the browser's, src/i18n/i18n.js
//             startLanguage), the UI scale (game/uiscale.js), the minimap's size (game/display.js),
//             the item names on the floor always or only hovered (game/lootlabels.js; X switches
//             it too), the damage numbers (game/juice.js), the narrator's subtitles
//             (game/narrator.js) and their size (game/display.js: the films' too), the tutorial's
//             card (game/tutorial.js)
//   Graphics  the frame rate cap (main.js), the render resolution (render/resolution.js), the
//             anti-aliasing (render/msaa.js), the lighting's quality level (game/quality.js), the
//             particles (render/particles.js), the brightness (game/display.js), reducing motion
//             (the system's choice at first: game/display.js), the camera's shaking (game/camera.js,
//             film/player.js), the camera (the overview or the close view, game/camera.js; the
//             camera key switches it too, game/camerakey.js), the zoom a game starts at
//             (core/zoom.js) and the close view's field of view
//   Sound     the volume of everything, the sounds', the ambience's, the narrator's and the music's
//             (audio/context.js), the music on or off, and whether the game is quiet in the
//             background
//   Input     the mouse look's speed and whether up and down are inverted (game/mouselook.js),
//             clicking the floor to walk (game/input.js), the zoom's wheel direction
//             (game/input.js), the touch controls (game/touch.js) and the keys (core/keybinds.js)
// Each page but the keys can go back to the defaults (resetPage); the keys have resetKeys.
// Kept in localStorage
// (crawler.settings) as soon as they change, for every hero alike; the keys only as far as they
// differ from the defaults. The music setting of before (crawler.music) is taken over once.
// The music is on at first, but off with the dev tools (?dev=1), and kept only once chosen; the
// films' scores play unless it was turned off (audio/music.js setMusicEnabled). Before version 3
// off was the default, so an off kept then counts as not chosen.
import { resolveBindings, overrides, assignKey, clearKey, actionsFor, defaultBindings, keyName, BAR_ACTIONS } from '../core/keybinds.js';
import { setMusicEnabled } from '../audio/music.js';
import { setVolume, setQuietBehind as quietAudio } from '../audio/context.js';
import { clampLookSpeed, CLOSE_FOV } from '../core/view.js';
import { ZOOM_LEVELS, DEFAULT_ZOOM } from '../core/zoom.js';
import { SETTINGS_KEY, isLanguage, setLanguage, language } from '../i18n/i18n.js';

const KEY = SETTINGS_KEY, OLD_MUSIC = 'crawler.music';
const listeners = new Set();

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return s;
    const old = localStorage.getItem(OLD_MUSIC);
    return old == null ? {} : { music: old === '1' };
  } catch { return {}; }
}
const volume = v => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
export const FRAME_RATES = [30, 60, 0];       // frames a second at most; 0: as many as the screen shows
// MSAA samples; 0: off (the GPU may offer fewer, render/msaa.js). 'auto' (the default) picks once,
// when the page starts, by the screen: 2x on a high-DPI one (it looks like 4x there, for less of
// the GPU's work), 4x on others. It never changes by itself after that (render/msaa.js: a new
// number of samples freezes the game for a moment). Where the screen is touched (phones,
// tablets) 30 frames a second at first: they stay cooler and last longer, and the GPU has twice
// the time for a frame.
export const ANTIALIAS = ['auto', 0, 2, 4, 8];
const AUTO_MSAA = (globalThis.devicePixelRatio || 1) >= 1.5 ? 2 : 4;
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const DEFAULT_FPS = touch ? 30 : 60, DEFAULT_MSAA = 'auto';
export const CAMERAS = ['overview', 'close'];
// the lighting's quality level (game/quality.js): 'auto' (it follows the frame rate,
// render/resolution.js) or one of them pinned, the best first
export const GRAPHICS = ['auto', 'high', 'medium', 'low', 'lowest'];
const DEFAULT_GRAPHICS = 'auto';
// (what the settings said before the levels: Full is Auto now, Simple the low level)
const OLD_GRAPHICS = { full: 'auto', simple: 'low' };
// the render resolution: 'auto' (it follows the frame rate, render/resolution.js) or pinned, a
// share of the screen's own pixels
export const RESOLUTIONS = ['auto', 1, 0.75, 0.5];
// the particles (sparks, droplets, smoke ...): the share of them made (render/particles.js)
export const PARTICLES = { high: 1, medium: 0.5, low: 0.25 };
// reducing motion (game/display.js): 'system' (as the system says: prefers-reduced-motion), or on or off
export const MOTIONS = ['system', 'reduce', 'full'];
// the minimap's size (game/display.js): 0 hides it
export const MINIMAPS = { off: 0, small: 0.75, normal: 1, large: 1.3 };
// the brightness of the world (not of the HUD): 70% to 150%
export const BRIGHTNESS_MIN = 0.7, BRIGHTNESS_MAX = 1.5;
const clampBrightness = b => (Number.isFinite(b) ? Math.round(Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, b)) * 100) / 100 : 1);
// the close view's vertical field of view, in degrees
export const FOV_MIN = 50, FOV_MAX = 90;
const clampFov = f => (Number.isFinite(f) ? Math.round(Math.min(FOV_MAX, Math.max(FOV_MIN, f))) : CLOSE_FOV);
// the zoom a game starts at: one of core/zoom.js ZOOM_LEVELS (closest first)
const DEFAULT_START_ZOOM = ZOOM_LEVELS.indexOf(DEFAULT_ZOOM);
const zoomStep = i => (Number.isInteger(i) && i >= 0 && i < ZOOM_LEVELS.length ? i : DEFAULT_START_ZOOM);
// in the guide's game window the guide is in front: the game is not quiet when it has the focus
const embedded = (() => { try { return window.top !== window; } catch { return true; } })();
// the UI scale: the HUD and the menus 90% to 200% of their size (100%: as they were made)
export const UI_SCALE_MIN = 0.9, UI_SCALE_MAX = 2;
export const clampUiScale = s => (Number.isFinite(s) ? Math.round(Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, s)) * 100) / 100 : 1);
// the subtitles' size (game/display.js), against how they were made
export const SUBTITLE_SIZES = { small: 0.85, normal: 1, large: 1.25, huge: 1.5 };
// the camera's shaking: hit kicks and the ground's tremors (game/camera.js), the films' (film/player.js)
export const SHAKES = { off: 0, low: 0.5, full: 1 };
// the touch controls (game/touch.js): 'auto' (on from the first touch), or always on or off
export const TOUCHES = ['auto', 'on', 'off'];
const oneOf = (list, v, fallback) => (list.includes(v) ? v : fallback);
const dev = typeof location === 'object' && new URLSearchParams(location.search).get('dev') === '1';
// the settings from what was kept ({}: the defaults)
function settingsFrom(stored) {
  // the music: true or false once chosen, null before (on, but not with the dev tools)
  const storedMusic = typeof stored.music !== 'boolean' || (stored.v ?? 1) < 3 && !stored.music ? null : stored.music;
  // (settings kept before version 2 always had msaa: 2x was the default then, not a choice)
  const storedMsaa = (stored.v ?? 1) < 2 && stored.msaa === 2 ? 'auto' : stored.msaa;
  return {
    language: isLanguage(stored.language) ? stored.language : null,   // null: the browser's
    fps: oneOf(FRAME_RATES, stored.fps, DEFAULT_FPS), msaa: oneOf(ANTIALIAS, storedMsaa, DEFAULT_MSAA),
    graphics: oneOf(GRAPHICS, OLD_GRAPHICS[stored.graphics] ?? stored.graphics, DEFAULT_GRAPHICS),
    camera: oneOf(CAMERAS, stored.camera, CAMERAS[0]), uiScale: clampUiScale(stored.uiScale),
    lookSpeed: clampLookSpeed(stored.lookSpeed), invertLook: stored.invertLook === true,
    resolution: oneOf(RESOLUTIONS, stored.resolution, 'auto'), particles: stored.particles in PARTICLES ? stored.particles : 'high',
    motion: oneOf(MOTIONS, stored.motion, 'system'), brightness: clampBrightness(stored.brightness), fov: clampFov(stored.fov),
    minimap: stored.minimap in MINIMAPS ? stored.minimap : 'normal', itemNames: stored.itemNames === true, damageNumbers: stored.damageNumbers !== false,
    clickMove: stored.clickMove !== false, invertZoom: stored.invertZoom === true, startZoom: zoomStep(stored.startZoom),
    music: storedMusic, quietBehind: typeof stored.quietBehind === 'boolean' ? stored.quietBehind : !embedded,
    masterVolume: volume(stored.masterVolume), musicVolume: volume(stored.musicVolume), soundVolume: volume(stored.soundVolume),
    voiceVolume: volume(stored.voiceVolume), ambienceVolume: volume(stored.ambienceVolume), subtitles: stored.subtitles !== false,
    subtitleSize: stored.subtitleSize in SUBTITLE_SIZES ? stored.subtitleSize : 'normal', shake: stored.shake in SHAKES ? stored.shake : 'full',
    touch: oneOf(TOUCHES, stored.touch, 'auto'), tutorial: stored.tutorial !== false,
    keys: resolveBindings(stored.keys),
  };
}
const settings = settingsFrom(read());

function sound() {
  setMusicEnabled(settings.music ?? !dev, settings.music !== false);
  setVolume('master', settings.masterVolume);
  quietAudio(settings.quietBehind);
  setVolume('music', settings.musicVolume);
  setVolume('sounds', settings.soundVolume);
  setVolume('voice', settings.voiceVolume);
  setVolume('ambience', settings.ambienceVolume);
}
function changed() {
  sound();
  try {
    const { language: lang, keys, ...rest } = settings;
    localStorage.setItem(KEY, JSON.stringify({ v: 3, ...(lang && { language: lang }), ...rest, keys: overrides(keys) }));
  } catch { /* private mode: for this page only */ }
  for (const fn of listeners) fn();
}
// What each page of the settings menu holds (but the language, fullscreen, the tutorial and the
// keys): what resetPage(page) puts back as it was at first.
const PAGES = {
  general: ['uiScale', 'minimap', 'itemNames', 'damageNumbers', 'subtitles', 'subtitleSize'],
  graphics: ['fps', 'resolution', 'msaa', 'graphics', 'particles', 'camera', 'startZoom', 'fov', 'brightness', 'motion', 'shake'],
  sound: ['masterVolume', 'soundVolume', 'ambienceVolume', 'voiceVolume', 'quietBehind', 'music', 'musicVolume'],
  input: ['lookSpeed', 'invertLook', 'clickMove', 'invertZoom', 'touch'],
};
export function resetPage(page) {
  const first = settingsFrom({});
  for (const k of PAGES[page] ?? []) settings[k] = first[k];
  changed();
}
// whether the page is as it was at first
export function pageIsDefault(page) {
  const first = settingsFrom({});
  const now = k => (k === 'music' ? settings.music ?? !dev : settings[k]), was = k => (k === 'music' ? first.music ?? !dev : first[k]);
  return (PAGES[page] ?? []).every(k => now(k) === was(k));
}

// fn() after any change (the keys shown in the help, the quick bar ...)
export function onSettingsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
sound();

// --- language ----------------------------------------------------------------------------------

export const languageNow = () => language();
// switch the game to it (the page's words, src/i18n/dom.js, follow at once) and keep the choice
export async function chooseLanguage(code) {
  settings.language = await setLanguage(code);
  changed();
}

// --- graphics ----------------------------------------------------------------------------------

export const frameRate = () => settings.fps;
export function setFrameRate(fps) { settings.fps = oneOf(FRAME_RATES, fps, DEFAULT_FPS); changed(); }
export const antialias = () => settings.msaa;
// the samples the setting means here ('auto': by the screen, chosen when the page started)
export const antialiasSamples = () => settings.msaa === 'auto' ? AUTO_MSAA : settings.msaa;
export function setAntialias(samples) { settings.msaa = oneOf(ANTIALIAS, samples, DEFAULT_MSAA); changed(); }
export const graphics = () => settings.graphics;
export function setGraphics(g) { settings.graphics = oneOf(GRAPHICS, g, DEFAULT_GRAPHICS); changed(); }
export const cameraMode = () => settings.camera;
export function setCameraMode(mode) { settings.camera = oneOf(CAMERAS, mode, CAMERAS[0]); changed(); }
export const resolution = () => settings.resolution;
export function setResolution(r) { settings.resolution = oneOf(RESOLUTIONS, r, 'auto'); changed(); }
export const particles = () => settings.particles;
export const particleShare = () => PARTICLES[settings.particles];
export function setParticles(p) { settings.particles = p in PARTICLES ? p : 'high'; changed(); }
export const brightness = () => settings.brightness;
export function setBrightness(b) { settings.brightness = clampBrightness(b); changed(); }
export const closeFov = () => settings.fov;
export function setCloseFov(f) { settings.fov = clampFov(f); changed(); }
// reducing motion: the setting ('system', 'reduce', 'full'), and whether motion is reduced now
// (the system's choice can change while the game runs)
const systemMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
systemMotion?.addEventListener?.('change', () => { if (settings.motion === 'system') for (const fn of listeners) fn(); });
export const motion = () => settings.motion;
export const systemReducesMotion = () => !!systemMotion?.matches;
export const reduceMotion = () => settings.motion === 'reduce' || settings.motion === 'system' && systemReducesMotion();
export function setMotion(m) { settings.motion = oneOf(MOTIONS, m, 'system'); changed(); }
// the camera's shaking: the setting ('off', 'low', 'full'), and how much of it there is now (none
// while motion is reduced)
export const shake = () => settings.shake;
export const shakeAmount = () => (reduceMotion() ? 0 : SHAKES[settings.shake]);
export function setShake(s) { settings.shake = s in SHAKES ? s : 'full'; changed(); }

// --- the HUD ------------------------------------------------------------------------------------

export const uiScale = () => settings.uiScale;
export function setUiScale(s) { settings.uiScale = clampUiScale(s); changed(); }
export const minimap = () => settings.minimap;
export const minimapSize = () => MINIMAPS[settings.minimap];
export function setMinimap(m) { settings.minimap = m in MINIMAPS ? m : 'normal'; changed(); }
// the names of everything on the floor (true), or only of what is hovered
export const itemNames = () => settings.itemNames;
export function setItemNames(on) { settings.itemNames = !!on; changed(); }
export const damageNumbers = () => settings.damageNumbers;
export function setDamageNumbers(on) { settings.damageNumbers = !!on; changed(); }

// --- mouse --------------------------------------------------------------------------------------

export const lookSpeed = () => settings.lookSpeed;
export function setLookSpeed(s) { settings.lookSpeed = clampLookSpeed(s); changed(); }
export const invertLook = () => settings.invertLook;
export function setInvertLook(on) { settings.invertLook = !!on; changed(); }
// a click on the floor walks there (off: a click only goes for what is under the cursor)
export const clickMove = () => settings.clickMove;
export function setClickMove(on) { settings.clickMove = !!on; changed(); }
// the wheel: towards you zooms out (inverted: in)
export const invertZoom = () => settings.invertZoom;
export function setInvertZoom(on) { settings.invertZoom = !!on; changed(); }
// the zoom a game starts at, as one of ZOOM_LEVELS (its index, closest first)
export const startZoomStep = () => settings.startZoom;
export const startZoom = () => ZOOM_LEVELS[settings.startZoom];
export function setStartZoomStep(i) { settings.startZoom = zoomStep(i); changed(); }
// the touch controls: 'auto', 'on' or 'off' (game/touch.js)
export const touchSetting = () => settings.touch;
export function setTouchSetting(t) { settings.touch = oneOf(TOUCHES, t, 'auto'); changed(); }

// --- sound --------------------------------------------------------------------------------------

export const musicOn = () => settings.music ?? !dev;
export function setMusic(on) { settings.music = !!on; changed(); return settings.music; }
export const toggleMusic = () => setMusic(!musicOn());
export const masterVolume = () => settings.masterVolume;
export function setMasterVolume(v) { settings.masterVolume = volume(v); changed(); }
// quiet while the game is in the background (another tab or window in front)
export const quietBehind = () => settings.quietBehind;
export function setQuietBehind(on) { settings.quietBehind = !!on; changed(); }
export const musicVolume = () => settings.musicVolume;
export const soundVolume = () => settings.soundVolume;
export function setMusicVolume(v) { settings.musicVolume = volume(v); changed(); }
export function setSoundVolume(v) { settings.soundVolume = volume(v); changed(); }
// the ambience: the world's beds, drips and pops (audio/loops.js)
export const ambienceVolume = () => settings.ambienceVolume;
export function setAmbienceVolume(v) { settings.ambienceVolume = volume(v); changed(); }
// the narrator (game/narrator.js): her voice's volume (0: she is only read), and her subtitles
export const voiceVolume = () => settings.voiceVolume;
export function setVoiceVolume(v) { settings.voiceVolume = volume(v); changed(); }
export const subtitles = () => settings.subtitles;
export function setSubtitles(on) { settings.subtitles = !!on; changed(); }
// the subtitles' size: the setting, and the share of their size it makes them (game/display.js)
export const subtitleSize = () => settings.subtitleSize;
export const subtitleScale = () => SUBTITLE_SIZES[settings.subtitleSize];
export function setSubtitleSize(s) { settings.subtitleSize = s in SUBTITLE_SIZES ? s : 'normal'; changed(); }
// the tutorial's card (game/tutorial.js): on until it is done or skipped; the settings' "Show
// again" turns it on again, and it shows again from its start in a beginning
export const tutorialOn = () => settings.tutorial;
export function setTutorial(on) { settings.tutorial = !!on; changed(); }

// --- keys ---------------------------------------------------------------------------------------

export const bindings = () => settings.keys;
export const keysOf = id => settings.keys[id] ?? [null, null];
// give the key to the action's slot; returns what lost it ([{ id, key }])
export function bindKey(id, slot, key, typed = null) {
  const { bindings: next, lost } = assignKey(settings.keys, id, slot, key, typed);
  settings.keys = next; changed();
  return lost;
}
export function unbindKey(id, slot) { settings.keys = clearKey(settings.keys, id, slot); changed(); }
export function resetKeys() { settings.keys = defaultBindings(); changed(); }

// the actions a key event is for
export const actionsOf = e => actionsFor(settings.keys, e.code, e.key);
export const isFor = (e, id) => actionsOf(e).includes(id);

// --- names --------------------------------------------------------------------------------------

// the keyboard's own characters (Chrome, Edge): a German keyboard's KeyZ shows as Y
let layout = null;
navigator.keyboard?.getLayoutMap?.().then(m => { layout = m; for (const fn of listeners) fn(); }, () => {});
export const nameOf = key => keyName(key, layout);
// the action's keys to show: both ('F / Right Ctrl'), or only the primary; '' with none
export function keyLabel(id, { both = true } = {}) {
  const ks = keysOf(id).filter(k => k !== null);
  return (both ? ks : ks.slice(0, 1)).map(nameOf).join(' / ');
}
// the quick bar's keys, in a few characters: '1-6', else each one's ('Z X C V B N')
export function barKeysText() {
  const names = BAR_ACTIONS.map(id => keyLabel(id, { both: false }) || '\u2014');
  return names.join('') === '123456' ? '1-6' : names.join(' ');
}
