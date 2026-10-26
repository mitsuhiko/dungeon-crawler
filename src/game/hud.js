// The dev overlay (?dev=1: seed, depth, layer, fps, cube stats) and screen fades. What the game
// says (setStatus) shows in the chat box (game/console.js).
// The player's own bars float over the character (render/playerbar.js).
import { themeOf } from '../themes/depth.js';
import { isFaceOpen } from '../core/boundaries.js';
import { state } from './state.js';
import { population } from '../core/spawns.js';
import { renderer } from '../render/scene.js';
import { baked } from '../render/bake.js';
import { reduceMotion } from './settings.js';

const $ = id => document.getElementById(id);
const shown = {};
// write only on change: rewriting text every frame would drop a selection being copied
const put = (id, text, html = false) => { if (shown[id] === text) return; shown[id] = text; $(id)[html ? 'innerHTML' : 'textContent'] = text; };

if (state.dev) {
  $('dev').hidden = false;
  $('dev-copy').addEventListener('click', () => navigator.clipboard?.writeText([...$('dev').children].filter(el => el.id !== 'dev-hint')
    .map(el => el.innerText).join('\n').replace(/^copy\s*/, '')));
}

export function showStats(map, cube, seed, visits) {
  // the cube's drawn population (before placement); * marks the lead species
  const pop = [...population(map)].map(([type, p]) => `${type} ${p.count}${p.lead ? '*' : ''}`).join(', ');
  put('dev-depth', `${map.depth} · ${map.town ? 'Town' : map.merchantCamp ? 'Merchant camp' : map.interior ? 'Inside ' + map.interior.building : map.testRoom ? `Test room ${map.testRoom.name} · ${themeOf(map).name}` : themeOf(map).name}${map.horde ? ' · HORDE' : ''}${map.enemyFree ? ' · safe' : pop ? ' · ' + pop : ''}`);
  put('dev-seed', String(seed));
  const s = map.stats;
  const portals = map.portals.filter(p => p.kind !== 'spawn' && !isFaceOpen(state.openedFaces, cube, p.dir)).map(p => ['E', 'W', 'S', 'N', 'down', 'up'][p.dir] + (p.layer ? '@L' + p.layer : ''));
  const open = [0, 1, 2, 3].filter(d => isFaceOpen(state.openedFaces, cube, d)).map(d => ['E', 'W', 'S', 'N'][d]);
  put('dev-stats',
    `cube ${cube} · ${map.kind} · ${map.archetype} · ${s.layers} layer${s.layers > 1 ? 's' : ''} · portals ${portals.join(' ')} · open ${open.join(' ') || '-'} · visit ${visits}<br>` +
    `slopes ${s.slopes} · cliffs ${s.cliffs} · ramps ${s.ramps} · pillars ${s.pillars} · ` +
    `stairs ${s.stairs} · landings ${s.landings} · bridges ${s.bridges} · fences ${s.fences}<br>` +
    `${s.fluids.join(', ') || 'no fluids'} · gen tries ${map.attempts}`, true);
}

let frames = 0, since = performance.now();
export function updateHud(player, map) {
  if (!state.dev) return;
  put('dev-layer', map ? `${player.layer + 1}/${map.K}` : '-');
  frames++;
  const now = performance.now();
  if (now - since >= 500) {
    put('dev-fps', String(Math.round(frames * 1000 / (now - since)))); frames = 0; since = now;
    put('dev-res', renderer.getPixelRatio().toFixed(2) + '×');   // pixels per CSS pixel (render/resolution.js)
  }
}

// the screen flashing red (hurt); a faint one where motion is reduced (the settings)
export function flash() {
  const f = $('flash');
  f.style.transition = 'none'; f.style.opacity = reduceMotion() ? 0.15 : 0.45;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
}

export const fadeOut = () => { $('fade').style.transitionDuration = ''; $('fade').style.opacity = 1; };
// (the curtain lifts once the cube's lights are baked, render/bake.js: behind it they bake as
// fast as the GPU goes, nothing else drawn meanwhile, main.js; no longer than FADE_WAIT). Coming
// into a world it lifts slowly (slowFade: SLOW_FADE s), else in a moment (style.css #fade).
const FADE_WAIT = 2000, SLOW_FADE = 1.6;
let slow = false;
export const slowFade = () => { slow = true; };
export function fadeIn() {
  const start = performance.now(), el = $('fade'), seconds = slow ? SLOW_FADE : null;
  slow = false;
  requestAnimationFrame(function wait() {
    if (!baked(state.world) && performance.now() - start < FADE_WAIT) { requestAnimationFrame(wait); return; }
    el.style.transitionDuration = seconds ? `${seconds}s` : '';
    el.style.opacity = 0;
  });
}
// whether the curtain is down (nothing of the world shows)
export const curtained = () => $('fade').style.opacity !== '0';

// a spinner while waiting for the world worker (only if it takes more than a moment)
export function whenReady(promise) {
  const t = setTimeout(() => $('loading').classList.add('on'), 80);
  const done = () => { clearTimeout(t); $('loading').classList.remove('on'); };
  return promise.then(v => { done(); return v; }, e => { done(); throw e; });
}
