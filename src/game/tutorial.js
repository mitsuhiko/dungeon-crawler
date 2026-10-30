// The tutorial's card (core/tutorial.js has its stages and steps; docs/story.md "The beginning"):
// in the beginning's three rooms a card at the left shows what to do here and how, with the
// player's own keys (game/settings.js keysOf, named on their keyboard), or on a touch screen the
// stick and the buttons; each step is ticked off as it is done (done before the card shows counts
// too). It never holds anything up: nothing waits for a step.
//
// It is skipped with the button on it (or turned off in the settings, which can show it again);
// once its last step is done, or it is skipped, it is not shown again in this browser (the setting
// is off). Not with the dev tools (?tutorial=1 shows it), nor in the guide, nor with ?tutorial=0;
// not for a guest playing in a friend's world (net/online.js).
import { STAGE, stageAt, pieces, markers, MOVE_KEYS } from '../core/tutorial.js';
import { robotMet } from '../core/robot.js';
import { glassThere, INTRO_GATES } from '../core/intro.js';
import { player, state, view } from './state.js';
import { allEnemies } from './enemies.js';
import { scenePlaying } from './scene.js';
import { curtained } from './hud.js';
import { keysOf, nameOf, tutorialOn, setTutorial, onSettingsChange } from './settings.js';
import { online } from '../net/online.js';
import { tr, language } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const params = typeof location === 'object' ? new URLSearchParams(location.search) : new URLSearchParams();
const embedded = (() => { try { return window.top !== window; } catch { return true; } })();
const wanted = () => !embedded && params.get('tutorial') !== '0' && (!state.dev || params.get('tutorial') === '1');

const WALK = 4;   // cells walked: walking learned

// what was done in this world's beginning (each step's id), and what is watched for the steps
let run = null, done = new Set(), walked = 0, last = null, yaw = null, snakes = null, finished = false, shown = '';

const at = map => map?.town || map?.interior ? 'town' : map?.firstGlass ? 'rock' : null;

// main.js, every frame of play
export function updateTutorial() {
  const box = $('tutorial');
  if (!box) return;
  if (state.run !== run) { run = state.run; done = new Set(); walked = 0; last = null; yaw = null; snakes = null; finished = false; }
  const on = wanted() && tutorialOn() && online.role !== 'guest' && state.mode === 'play' && !!state.map && !!run;
  const stage = on ? stageAt({ at: at(state.map), robot: robotMet(run) && !scenePlaying('robot'), shown: run.met.has('scene:glass') && !scenePlaying('glass'),
    sword: run.unlockedGates.has(INTRO_GATES.sword), glass: !glassThere(run) }) : null;
  if (stage) watch(stage);
  const show = !!stage && !curtained() && !state.transitioning && !finished;
  box.hidden = !show;
  if (!show) { shown = ''; return; }
  draw(box, STAGE[stage]);
  // the last step done: the tutorial is over (the card lingers a moment with its tick)
  if (stage === 'heard' && done.has('memories') && !finished) {
    finished = true;
    setTimeout(() => setTutorial(false), 1600);
  }
}

// what the hero does, for the steps of the stage shown
function watch(stage) {
  const p = { x: player.x, z: player.z };
  if (last && !state.transitioning) walked += Math.min(1, Math.hypot(p.x - last.x, p.z - last.z));
  last = p;
  if (walked >= WALK) done.add('move');
  if (stage === 'town') {
    yaw ??= view.yawTarget;
    if (Math.abs(view.yawTarget - yaw) > 0.1) done.add('turn');
  }
  if (run.unlockedGates.has(INTRO_GATES.sword)) done.add('sword');
  if (stage === 'rock' || stage === 'heard') {
    const live = allEnemies().filter(e => e.profile?.species === 'snake' && e.hp > 0 && e.mode !== 'dead').length;
    snakes ??= live;
    if (live < snakes || !live) done.add('attack');
    const l = state.map.firstGlass.ladder;
    if (player.y > l.top - 0.4 && player.grounded) done.add('climb');
  }
  if (!glassThere(run)) done.add('glass');
  if (stage === 'heard' && state.inventoryOpen) done.add('memories');
}

// the card: the stage's title, its steps (ticked once done) and the skip button; drawn again only
// when what it shows changed (a step done, other keys, the language, a touch screen)
function draw(box, stage) {
  const touch = document.body.classList.contains('touch');
  const keys = stage.steps.flatMap(s => s.keys).map(k => (k === 'move' ? MOVE_KEYS : [k]).map(id => keysOf(id)[0] ?? keysOf(id)[1]).join());
  const sig = [stage.id, [...done].join(), touch, language(), keys.join('|')].join(';');
  if (sig === shown) return;
  shown = sig;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const kbd = id => {
    const [a, b] = keysOf(id), k = a ?? b;
    return k === null || k === undefined ? `<kbd class="none">${esc(tr('not bound'))}</kbd>` : `<kbd>${esc(nameOf(k))}</kbd>`;
  };
  const line = s => {
    if (touch && s.touch) return esc(tr(s.touch));
    return pieces(tr(s.text, markers(s.keys)), s.keys).map(p => p.text !== undefined ? esc(p.text)
      : p.keys.length > 1 ? `<span class="keys">${p.keys.map(kbd).join('')}</span>` : kbd(p.keys[0])).join('');
  };
  box.innerHTML = `<b>${esc(tr(stage.title))}</b><ul>${stage.steps.map(s =>
    `<li class="${done.has(s.id) ? 'done' : ''}">${line(s)}</li>`).join('')}</ul>`
    + `<button id="tutorial-skip" class="plain">${esc(tr('Skip the tutorial'))}</button>`;
  $('tutorial-skip').addEventListener('click', ev => { ev.stopPropagation(); setTutorial(false); });
}
if (typeof document === 'object') onSettingsChange(() => { shown = ''; });

// tests/browser/: the stage shown and the steps done
export const tutorialNow = () => ({ shown: !$('tutorial')?.hidden, done: [...done], finished });
