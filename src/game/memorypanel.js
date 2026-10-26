// The Memories tab of the inventory (game/inventory.js has the panel and its tabs): the
// glassmaker's recordings heard in this world (core/narration.js RECORDINGS), to hear again. It is
// there once his first glass is found (core/intro.js: the glass on the town plaza opens it), or a
// recording was heard. A recording counts as heard whole the moment it begins, even if it was cut
// short or never listened to (core/narration.js RECORDINGS). On the left the recordings; on the
// right the one selected: where it was found, all its words, and Listen / Stop. Played here the world stays paused (the inventory is open):
// his voice plays on its own (game/narrator.js hearAgain), the line being said lit up in its words.
// Closing the panel or going to another tab stops it.
import { RECORDINGS, recordingLines, recordingsHeard, lineText } from '../core/narration.js';
import { glassThere } from '../core/intro.js';
import { hearAgain } from './narrator.js';
import { state } from './state.js';
import { tr, onLanguageChange } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// selected: the recording shown (its id); playing: the one being played again ({ id, at: the line
// being said, stop })
let selected = null, playing = null, signature = '';
onLanguageChange(() => { signature = ''; });

// a recording's words: all of them, heard or not (one begun is told whole: core/narration.js)
const heardLines = recordingLines;
// is the tab there? (the glass found, or something heard: a world from before, a friend's)
export const memoriesOpen = () => !!state.run && (!glassThere(state.run) || recordingsHeard(state.run.told).length > 0);

// stop playing (the panel closed, another tab)
export function stopMemories() {
  playing?.stop();
  playing = null; signature = '';
}

function play(id) {
  stopMemories();
  const lines = heardLines(id);
  if (!lines.length) return;
  const p = { id, at: 0, stop: null };
  playing = p;
  p.stop = hearAgain(lines, i => {
    if (playing !== p) return;
    if (i < 0) { playing = null; } else p.at = i;
    signature = '';
  });
}

export function drawMemories() {
  if (!state.run) return;
  const heard = recordingsHeard(state.run.told);
  if (!heard.some(r => r.id === selected)) selected = heard[0]?.id ?? null;
  const next = `${heard.map(r => `${r.id}:${heardLines(r.id).length}`)}:${selected}:${playing?.id}:${playing?.at}`;
  if (next === signature) return;
  signature = next;
  const focus = document.activeElement?.dataset?.memory;
  $('memories-list').innerHTML = heard.length ? heard.map(r => {
    const on = r.id === selected;
    return `<button class="quest-entry memory-entry${on ? ' selected' : ''}" role="option" aria-selected="${on}" data-memory="${r.id}">`
      + `<span class="mark">${playing?.id === r.id ? '♪' : '◇'}</span><span><b>${esc(tr(r.title))}</b><small>${esc(tr(r.found))}</small></span></button>`;
  }).join('') : `<div class="quest-empty">${esc(tr('Nothing heard yet. The glassmaker blows his words into glass: listen for them.'))}</div>`;
  const r = RECORDINGS.find(x => x.id === selected);
  if (!r) $('memories-details-inner').innerHTML = `<h2>${esc(tr('Memories'))}</h2><p class="quest-text">${esc(tr('What the glassmaker said, to hear again.'))}</p>`;
  else {
    const on = playing?.id === r.id;
    const words = heardLines(r.id).map((l, i) => `<p class="memory-line${on && playing.at === i ? ' now' : ''}">${esc(lineText(l))}</p>`).join('');
    $('memories-details-inner').innerHTML = `<h2>${esc(tr(r.title))}</h2><div class="quest-meta">${esc(tr(r.found))}</div>`
      + `<div class="quest-actions"><button class="main" data-play="${r.id}">${esc(on ? tr('Stop') : tr('Listen'))}</button></div>`
      + `<div class="memory-words">${words}</div>`;
  }
  if (focus) document.querySelector(`#memories-body [data-memory="${CSS.escape(focus)}"]`)?.focus();
}

$('memories-body').addEventListener('click', e => {
  const pick = e.target.closest('[data-memory]'), act = e.target.closest('[data-play]');
  if (pick) selected = pick.dataset.memory;
  else if (act) { if (playing?.id === act.dataset.play) stopMemories(); else play(act.dataset.play); }
  else return;
  signature = '';
  drawMemories();
});
