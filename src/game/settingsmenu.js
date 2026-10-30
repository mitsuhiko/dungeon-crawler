// The settings menu, from the Esc menu (game/escmenu.js) and the main menu (game/menu.js), in four
// pages, picked from the tabs on the left (Up and Down go through them too; the menu opens on the
// last one shown):
//   General   Interface: the language (a dropdown, game/dropdown.js), the UI scale
//             (game/uiscale.js: taken when the slider is let go, as the panel itself grows or
//             shrinks with it), the minimap's size, the item names on the floor, the damage
//             numbers, fullscreen (where the browser can: game/display.js). Guidance: the
//             narrator's subtitles and their size, and the tutorial's card (game/tutorial.js: done
//             or skipped, "Show again" starts it over)
//   Graphics  the frame rate cap, the render resolution, the anti-aliasing, the lighting's quality
//             level (Auto or pinned, game/quality.js), the particles; the camera (overview or close
//             view), the zoom a game starts at, the close view's field of view; the brightness,
//             reducing motion (System: as the system says) and the camera's shaking (none while
//             motion is reduced)
//   Sound     the volume of everything, the sound effects', the ambience's and the narrator's, being
//             quiet in the background; the music on or off and its volume
//   Input     the mouse look's speed and inverting it up and down, clicking the floor to walk,
//             inverting the wheel's zoom; the touch controls (only where the screen can be touched,
//             game/touch.js; Off only with a mouse or a trackpad too), and the keys: each control's
//             primary and secondary key (core/keybinds.js)
// What each one does: game/settings.js. The pages keep the size of the largest, so the panel does
// not jump between them. Everything is kept as it changes. "Reset page" (asking again first) puts
// the page shown back as it was at first, but the language, fullscreen, the tutorial and the keys
// (they have their own button).
//
// The keys come in tabs, one per kind of control (core/keybinds.js GROUPS; Left and Right go
// through them too). A click on a key waits for the new one: the next key pressed takes the place (taken from the
// control that had it, which the line at the bottom names), Esc keeps the old one, Backspace
// or Delete leaves the place empty. While the settings are open the game gets no keys.
import { ACTIONS, ACTION, GROUPS, UNBINDABLE } from '../core/keybinds.js';
import {
  FRAME_RATES, frameRate, setFrameRate, antialias, setAntialias, cameraMode, setCameraMode, uiScale, setUiScale, graphics, setGraphics,
  RESOLUTIONS, resolution, setResolution, particles, setParticles, brightness, setBrightness, MOTIONS, motion, setMotion,
  systemReducesMotion, reduceMotion, closeFov, setCloseFov, minimap, setMinimap, itemNames, setItemNames, damageNumbers, setDamageNumbers,
  lookSpeed, setLookSpeed, invertLook, setInvertLook, clickMove, setClickMove, invertZoom, setInvertZoom,
  startZoomStep, setStartZoomStep, startZoom, shake, setShake, touchSetting, setTouchSetting,
  musicOn, setMusic, masterVolume, setMasterVolume, musicVolume, setMusicVolume, soundVolume, setSoundVolume, quietBehind, setQuietBehind,
  ambienceVolume, setAmbienceVolume, voiceVolume, setVoiceVolume, subtitles, setSubtitles, subtitleSize, setSubtitleSize, tutorialOn, setTutorial,
  keysOf, bindKey, unbindKey, resetKeys, resetPage, pageIsDefault, nameOf, onSettingsChange, languageNow, chooseLanguage,
} from './settings.js';
import { tr, tc, LANGUAGES, onLanguageChange } from '../i18n/i18n.js';
import { sfx } from '../audio/sfx.js';
import { MSAA_LEVELS, msaaLevel } from '../render/msaa.js';
import { ZOOM_LEVELS, DEFAULT_ZOOM } from '../core/zoom.js';
import { dropdown } from './dropdown.js';
import { canFullscreen, isFullscreen, setFullscreen, onFullscreenChange } from './display.js';
import { touchScreen, touchOptional } from './touch.js';
import { state, view } from './state.js';

const $ = id => document.getElementById(id);
const overlay = $('settings-overlay'), keysBox = $('settings-keys'), tabs = $('settings-tabs'), feedback = $('settings-feedback');
const pages = $('settings-pages');
const PAGES = [...pages.querySelectorAll('[data-page]')].map(b => b.dataset.page);
const CONFIRM_MS = 4000;
let page = PAGES[0];   // the page shown
let waiting = null;    // { id, slot }: the key place waiting for a key
let tab = GROUPS[0];   // the kind of controls shown
let resetUntil = 0;    // the reset button asks again until then
let pageResetUntil = 0;   // the page's reset button too
let opener = null;     // what had the focus before (it gets it back)

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const say = text => { feedback.textContent = text; };

export const settingsOpen = () => !overlay.hidden;
export function openSettings() {
  if (settingsOpen()) return;
  opener = document.activeElement;
  overlay.hidden = false;
  waiting = null; resetUntil = 0; pageResetUntil = 0; say('');
  render();
  $('settings-close').focus();
}
export function closeSettings() {
  if (!settingsOpen()) return;
  languages.close(false);
  overlay.hidden = true;
  waiting = null;
  if (opener?.isConnected && opener.offsetParent) opener.focus(); else document.activeElement?.blur?.();
  opener = null;
}

// --- drawing ------------------------------------------------------------------------------------

// The rows of buttons, one pressed: what each offers ([value, label] pairs), which is pressed, and
// what a press does. The values come back from the page as text: the one pressed is found again
// among the options.
// The graphics' levels all go the same way: Auto first where there is one, then from the least to
// the most.
const CHOICES = {
  'settings-fps': [() => FRAME_RATES.map(f => [f, f ? String(f) : tr('Unlimited')]), frameRate, setFrameRate],
  'settings-resolution': [() => [['auto', tc('resolution', 'Auto')], ...RESOLUTIONS.filter(r => r !== 'auto').sort((a, b) => a - b).map(r => [r, `${r * 100}%`])],
    resolution, setResolution],
  // Auto (by the screen), then the levels this GPU can do; one asked for beyond them shows as the one used
  'settings-msaa': [() => [['auto', tc('antialias', 'Auto')], ...MSAA_LEVELS.map(n => [n, n ? `${n}x` : tc('toggle', 'Off')])],
    () => antialias() === 'auto' ? 'auto' : msaaLevel(antialias()), setAntialias],
  'settings-graphics': [() => [['auto', tc('lighting', 'Auto')], ['lowest', tc('lighting', 'Lowest')], ['low', tc('lighting', 'Low')],
    ['medium', tc('lighting', 'Medium')], ['high', tc('lighting', 'High')]], graphics, setGraphics],
  'settings-particles': [() => [['low', tc('particles', 'Few')], ['medium', tc('particles', 'Some')], ['high', tc('particles', 'Many')]], particles, setParticles],
  // System says what the system asks for now
  'settings-motion': [() => MOTIONS.map(m => [m, m === 'system' ? `${tc('motion', 'System')} (${systemReducesMotion() ? tc('toggle', 'On') : tc('toggle', 'Off')})`
    : tc('toggle', m === 'reduce' ? 'On' : 'Off')]), motion, setMotion],
  'settings-camera': [() => [['overview', tr('Overview')], ['close', tc('camera', 'Close')]], cameraMode, setCameraMode],
  'settings-minimap': [() => [['off', tc('toggle', 'Off')], ['small', tc('minimap', 'Small')], ['normal', tc('minimap', 'Normal')], ['large', tc('minimap', 'Large')]],
    minimap, setMinimap],
  'settings-names': [() => [[false, tr('Hovered')], [true, tr('Always')]], itemNames, setItemNames],
  'settings-subtitle-size': [() => [['small', tc('subtitles', 'Small')], ['normal', tc('subtitles', 'Normal')], ['large', tc('subtitles', 'Large')],
    ['huge', tc('subtitles', 'Huge')]], subtitleSize, setSubtitleSize],
  // none while motion is reduced (the buttons stay, the setting kept for when it is not)
  'settings-shake': [() => [['off', tc('toggle', 'Off')], ['low', tc('shake', 'Low')], ['full', tc('shake', 'Full')]], shake, setShake],
  // Off only with something else to point with (game/touch.js; without, an Off kept counts as Auto)
  'settings-touch': [() => [['auto', tc('touch', 'Auto')], ['on', tc('toggle', 'On')], ...touchOptional() ? [['off', tc('toggle', 'Off')]] : []],
    () => (touchSetting() === 'off' && !touchOptional() ? 'auto' : touchSetting()), setTouchSetting],
};
function choice(box, options, current) {
  box.innerHTML = options.map(([v, label]) => `<button data-value="${esc(v)}" aria-pressed="${v === current}" class="${v === current ? 'on' : ''}">${esc(label)}</button>`).join('');
}
// the switches: on or off
const TOGGLES = {
  'settings-numbers': [damageNumbers, setDamageNumbers],
  'settings-fullscreen': [isFullscreen, setFullscreen],
  'settings-music': [musicOn, setMusic],
  'settings-quiet': [quietBehind, setQuietBehind],
  'settings-subtitles': [subtitles, setSubtitles],
  'settings-invert': [invertLook, setInvertLook],
  'settings-click-move': [clickMove, setClickMove],
  'settings-invert-zoom': [invertZoom, setInvertZoom],
};
function toggle(button, on) {
  button.textContent = on ? tc('toggle', 'On') : tc('toggle', 'Off');
  button.setAttribute('aria-pressed', String(on));
  button.classList.toggle('on', on);
}
// The sliders: the value on the slider, what it shows beside it, and what moving it does. `live`:
// the setting follows while it is dragged (else when it is let go, the number following);
// `done`: after it is let go.
const percent = v => `${v}%`;
// the starting zoom by how much it magnifies, against the usual (closest at the right)
const zoomStep = v => ZOOM_LEVELS.length - 1 - v;
const SLIDERS = {
  // while dragged only the number follows: the panel growing under the pointer would move the slider away from it
  'settings-ui-scale': { out: 'settings-ui-level', get: () => Math.round(uiScale() * 100), show: percent, set: v => setUiScale(v / 100) },
  'settings-master-volume': { out: 'settings-master-level', get: () => Math.round(masterVolume() * 100), show: percent,
    set: v => setMasterVolume(v / 100), live: true, done: () => sfx('coin') },   // (how loud it is now)
  'settings-music-volume': { out: 'settings-music-level', get: () => Math.round(musicVolume() * 100), show: percent, set: v => setMusicVolume(v / 100), live: true },
  'settings-sound-volume': { out: 'settings-sound-level', get: () => Math.round(soundVolume() * 100), show: percent,
    set: v => setSoundVolume(v / 100), live: true, done: () => sfx('coin') },
  'settings-ambience-volume': { out: 'settings-ambience-level', get: () => Math.round(ambienceVolume() * 100), show: percent,
    set: v => setAmbienceVolume(v / 100), live: true },
  'settings-voice-volume': { out: 'settings-voice-level', get: () => Math.round(voiceVolume() * 100), show: percent, set: v => setVoiceVolume(v / 100), live: true },
  'settings-brightness': { out: 'settings-brightness-level', get: () => Math.round(brightness() * 100), show: percent, set: v => setBrightness(v / 100), live: true },
  // the zoom changes at once while playing, to see it
  'settings-start-zoom': { out: 'settings-start-zoom-level', get: () => zoomStep(startZoomStep()),
    show: v => percent(Math.round(DEFAULT_ZOOM / ZOOM_LEVELS[zoomStep(v)] * 100)),
    set: v => { setStartZoomStep(zoomStep(v)); if (state.mode === 'play') view.zoomTarget = startZoom(); }, live: true },
  'settings-fov': { out: 'settings-fov-level', get: closeFov, show: v => `${v}\u00b0`, set: setCloseFov, live: true },
  'settings-look-speed': { out: 'settings-look-level', get: () => Math.round(lookSpeed() * 100), show: percent, set: v => setLookSpeed(v / 100), live: true },
};

// each language by its own name, so whoever reads it finds theirs
const languages = dropdown($('settings-language'), { labelledBy: 'settings-language-label', choose: chooseLanguage });
function renderPages() {
  for (const b of pages.children) {
    const on = b.dataset.page === page;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    $(`settings-page-${b.dataset.page}`).classList.toggle('shown', on);
  }
}
// a slider's amber line reaches as far as its value (style.css --fill)
function fill(el) {
  const lo = Number(el.min), hi = Number(el.max);
  el.style.setProperty('--fill', `${(Number(el.value) - lo) / (hi - lo) * 100}%`);
}
function renderSettings() {
  languages.set(LANGUAGES.map(l => ({ value: l.code, label: l.name, lang: l.code })), languageNow());
  for (const [id, [options, now]] of Object.entries(CHOICES)) choice($(id), options(), now());
  for (const [id, [now]] of Object.entries(TOGGLES)) toggle($(id), now());
  for (const [id, s] of Object.entries(SLIDERS)) {
    const v = s.get();
    $(id).value = String(v);
    fill($(id));
    $(s.out).textContent = s.show(v);
  }
  for (const el of document.querySelectorAll('.settings-fullscreen')) el.hidden = !canFullscreen();
  for (const el of document.querySelectorAll('.settings-touch')) el.hidden = !touchScreen();
  // the tutorial: "Show again" once it is done or skipped; still to come, nothing to press
  const tutorial = $('settings-tutorial'), pending = tutorialOn();
  tutorial.textContent = pending ? tr('Will show') : tr('Show again');
  tutorial.disabled = pending;
  // reducing motion: the camera does not shake whatever this says
  for (const b of $('settings-shake').children) b.disabled = reduceMotion();
  // the page's reset: nothing to do while it is as it was at first
  const reset = $('settings-reset-page'), sure = performance.now() < pageResetUntil;
  reset.classList.toggle('confirm', sure);
  reset.textContent = sure ? tr('Sure? Click again') : tr('Reset page');
  reset.disabled = pageIsDefault(page);
}
function keyButton(a, slot) {
  const k = keysOf(a.id)[slot], on = waiting?.id === a.id && waiting.slot === slot;
  const key = k === null ? tr('none') : nameOf(k), label = tr(a.label);
  return `<button data-id="${a.id}" data-slot="${slot}" class="${on ? 'waiting' : k === null ? 'empty' : ''}"`
    + ` aria-label="${esc(slot ? tr('{label}, secondary key: {key}', { label, key }) : tr('{label}, primary key: {key}', { label, key }))}">${on ? esc(tr('Press a key…')) : k === null ? '\u2014' : esc(nameOf(k))}</button>`;
}
// the tabs keep the height of the longest, so the panel does not jump between them
keysBox.style.setProperty('--rows', String(Math.max(...GROUPS.map(g => ACTIONS.filter(a => a.group === g).length))));
function renderKeys() {
  tabs.innerHTML = GROUPS.map(g => `<button role="tab" id="settings-tab-${g}" data-tab="${g}" aria-selected="${g === tab}"`
    + ` tabindex="${g === tab ? 0 : -1}" class="${g === tab ? 'on' : ''}">${esc(tr(g))}</button>`).join('');
  keysBox.setAttribute('aria-labelledby', `settings-tab-${tab}`);
  keysBox.innerHTML = ACTIONS.filter(a => a.group === tab)
    .map(a => `<div class="settings-key"><span>${esc(tr(a.label))}</span>${keyButton(a, 0)}${keyButton(a, 1)}</div>`).join('');
  const reset = $('settings-reset'), sure = performance.now() < resetUntil;
  reset.classList.toggle('confirm', sure);
  reset.textContent = sure ? tr('Sure? Click again') : tr('Reset keys');
}
function render() {
  if (!settingsOpen()) return;
  const focused = document.activeElement?.closest?.('#settings-keys [data-id]');
  const place = focused && { id: focused.dataset.id, slot: focused.dataset.slot };
  const onTab = document.activeElement?.closest?.('#settings-tabs');
  const onPage = document.activeElement?.closest?.('#settings-pages');
  const pressed = document.activeElement?.closest?.('.settings-choice [data-value]');
  const chosen = pressed && { box: pressed.parentElement.id, value: pressed.dataset.value };
  renderPages(); renderSettings(); renderKeys();
  // the focus stays on the key place, the tab or the choice it was on (they were drawn anew)
  if (chosen) $(chosen.box).querySelector(`[data-value="${chosen.value}"]`)?.focus();
  else if (place) keysBox.querySelector(`[data-id="${place.id}"][data-slot="${place.slot}"]`)?.focus();
  else if (onTab) tabs.querySelector('.on')?.focus();
  else if (onPage) pages.querySelector('.on')?.focus();
}
function showPage(p) {
  if (p === page) return;
  page = p; waiting = null; pageResetUntil = 0; say('');
  languages.close(false);
  render();
}
function showTab(g) {
  if (g === tab) return;
  tab = g; waiting = null; say('');
  render();
}
onSettingsChange(render);
onLanguageChange(render);

// --- doing --------------------------------------------------------------------------------------

function wait(id, slot) {
  waiting = waiting?.id === id && waiting.slot === slot ? null : { id, slot };
  say(waiting ? tr('{label}: press the new key', { label: tr(ACTION[id].label) }) : '');
  render();
}
// the key pressed while a place waits for one
function take(e) {
  const { id, slot } = waiting;
  if (e.code === 'Escape') { waiting = null; say(''); render(); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') {
    waiting = null; unbindKey(id, slot);
    const label = tr(ACTION[id].label);
    say(slot ? tr('{label}: no secondary key', { label }) : tr('{label}: no primary key', { label }));
    return;
  }
  if (!e.code || UNBINDABLE.has(e.code)) {
    say(nameOf(e.code) ? tr('{key} cannot be used, try another', { key: nameOf(e.code) }) : tr('That key cannot be used, try another'));
    return;
  }
  waiting = null;
  const lost = bindKey(id, slot, e.code, e.key);
  say(lost.length ? lost.map(l => tr('{key} is no longer the key for {label}', { key: nameOf(l.key), label: tr(ACTION[l.id].label) })).join('. ')
    : `${tr(ACTION[id].label)}: ${nameOf(e.code)}`);
  if (lost.length) sfx('use', { volume: 0.6 });
}

// the keys go to the settings, none to the game (the buttons and sliders still work as usual)
addEventListener('keydown', e => {
  if (!settingsOpen()) return;
  e.stopImmediatePropagation();
  if (waiting) { e.preventDefault(); if (!e.repeat) take(e); return; }
  if (languages.key(e)) return;   // the open list takes its keys (Esc closes only it)
  if (e.code === 'Escape') { e.preventDefault(); closeSettings(); return; }
  // on the pages' tabs: Up and Down (Left and Right too) go to the one before and after
  if (e.target?.closest?.('#settings-pages') && /^Arrow(Up|Down|Left|Right)$/.test(e.code)) {
    e.preventDefault();
    const i = PAGES.indexOf(page) + (e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1);
    showPage(PAGES[(i + PAGES.length) % PAGES.length]);
    pages.querySelector('.on')?.focus();
    return;
  }
  // on the tabs: Left and Right go to the one before and after
  if (e.target?.closest?.('#settings-tabs') && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
    e.preventDefault();
    const i = GROUPS.indexOf(tab) + (e.code === 'ArrowLeft' ? -1 : 1);
    showTab(GROUPS[(i + GROUPS.length) % GROUPS.length]);
    tabs.querySelector('.on')?.focus();
  }
}, true);

pages.addEventListener('click', e => {
  const b = e.target.closest('[data-page]');
  if (b) showPage(b.dataset.page);
});
tabs.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
keysBox.addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) wait(b.dataset.id, Number(b.dataset.slot));
});
$('settings-close').onclick = () => closeSettings();
overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closeSettings(); });
for (const [id, [options, , set]] of Object.entries(CHOICES)) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('[data-value]');
    const o = b && options().find(([v]) => String(v) === b.dataset.value);
    if (o) set(o[0]);
  });
}
for (const [id, [now, set]] of Object.entries(TOGGLES)) $(id).onclick = () => set(!now());
$('settings-tutorial').onclick = () => setTutorial(true);
for (const [id, s] of Object.entries(SLIDERS)) {
  $(id).addEventListener('input', e => {
    const v = Number(e.target.value);
    fill(e.target);
    if (s.live) s.set(v); else $(s.out).textContent = s.show(v);
  });
  $(id).addEventListener('change', e => { if (!s.live) s.set(Number(e.target.value)); s.done?.(); });
}
onFullscreenChange(render);
$('settings-reset-page').onclick = () => {
  if (performance.now() >= pageResetUntil) {
    pageResetUntil = performance.now() + CONFIRM_MS;
    render();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  pageResetUntil = 0; waiting = null;
  resetPage(page);
  pages.querySelector('.on')?.focus();   // (the button is off now: nothing left to put back)
};
$('settings-reset').onclick = () => {
  if (performance.now() >= resetUntil) {
    resetUntil = performance.now() + CONFIRM_MS;
    renderKeys();
    setTimeout(render, CONFIRM_MS + 50);
    return;
  }
  resetUntil = 0; waiting = null;
  resetKeys();
  say(tr('All keys are back as they were at the start'));
};
