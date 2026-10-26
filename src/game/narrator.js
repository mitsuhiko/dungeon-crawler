// The narrator (docs/story.md, docs/narration.md): the Glassmaker's voice while the hero plays,
// like Bastion's. The game tells her its moments (narrate: a depth reached, a boss beaten, a
// death ...), and some she looks for herself every frame (updateNarrator: the villagers close by,
// an enemy of a new kind coming after the hero, a boss's fight and its attacks, low health, a
// long fight, standing about). What she says about a moment is core/narration.js's to pick
// (linesFor); she says it here: one line after the other, never two at once, the more important
// first (a boss before chatter), and what waited too long to still fit is left out. Each line is
// voiced from its clip (assets/narration/<lang>/, in the language of the moment, if it has a
// voice) through the voice bus (audio/context.js) with the music turned down under it, shown as
// a subtitle (#subtitle, if the settings want them) and written into the chronicle. Without a
// clip (a language without a voice, no audio yet) the subtitle stays up as long as it takes to
// read it. A line is said once in a world: the world keeps what was said (state.run.told, saved
// with it, game/save.js).
//
// While the game is paused (the Esc menu, the inventory: state.js worldPaused) she pauses too,
// mid-word, and goes on where she stopped. Not in the guide's game window, nor with ?narration=0.
import { MOMENTS, linesFor, clipKey, formOf, lineById, lineText } from '../core/narration.js';
import { attackOf } from '../core/enemies.js';
import { gateLocked } from '../core/guardians.js';
import { hash32 } from '../core/util.js';
import { actAt, themeOf } from '../themes/depth.js';
import { language } from '../i18n/i18n.js';
import { onAudioStart } from '../audio/context.js';
import { duckMusic } from '../audio/music.js';
import { player, state, worldPaused } from './state.js';
import { allEnemies } from './enemies.js';
import { subtitles, voiceVolume } from './settings.js';
import { log } from './log.js';

const GAP = 0.9;          // s of quiet between two lines
const FIRST = 1.2;        // s before the first line in a world (it fades in)
const LOAD_WAIT = 3;      // s a line waits for its clip before it is only read
const DUCK = 0.5;         // the music's level under her voice
const READ = 14;          // characters a second: how long a line without a voice stays up (at least MIN_READ)
const MIN_READ = 2.5;
const LINGER = 0.5;       // s the subtitle stays after the voice
const NEAR_VILLAGER = 3;  // cells: a villager this close is passed
const FOE_NEAR = 9;       // cells: an enemy after the hero this close is a new foe
const FIGHT_LONG = 7;     // s of fighting before she talks about it
const LOW = 0.3, HIGH = 0.6;   // the share of health that is low, and back up again
const IDLE = 45;          // s standing still

const params = typeof location === 'object' ? new URLSearchParams(location.search) : new URLSearchParams();
const embedded = (() => { try { return window.top !== window; } catch { return true; } })();
const enabled = params.get('narration') !== '0' && !embedded;

let ctx = null, bus = null;
onAudioStart((ac, sounds, music, voice) => { ctx = ac; bus = voice; });

// the clips there are (assets/narration/manifest.json: per language and clip, its length); null
// until fetched, {} if there is none. The clips are not in the repository yet (docs/narration.md):
// without them, or without one of them, she is only read.
let manifest = null, asked = null;
function fetchManifest() {
  asked ??= fetch(new URL('../../assets/narration/manifest.json', import.meta.url))
    .then(r => { if (r.status === 404) return {}; if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(m => { manifest = m; }, e => { console.warn(`narration manifest: ${e.message}`); manifest = {}; });
  return asked;
}
const clipEntry = (lang, key) => manifest?.clips?.[lang]?.[key] ?? null;

// `${lang}/${key}` -> a promise of the decoded clip (null: it did not come)
const clips = new Map();
function clipOf(lang, key) {
  const k = `${lang}/${key}`;
  if (!clips.has(k)) {
    if (!ctx) return Promise.resolve(null);
    clips.set(k, fetch(new URL(`../../assets/narration/${lang}/${key}.mp3`, import.meta.url))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b))
      .catch(e => { console.warn(`narration ${k}: ${e.message}`); clips.delete(k); return null; }));
  }
  return clips.get(k);
}

// A clip said by someone else than the narrator (a film's line: film/player.js), in the current
// language: { buffer, play(offset, { worn }) -> stop() } through the voice bus (worn: thin, as an
// old recording sounds), or null (no clip, no sound yet). It waits for the manifest.
export async function voiceClip(key) {
  if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});   // (just started by a click)
  if (!ctx || ctx.state !== 'running') return null;
  await fetchManifest();
  const lang = language();
  if (!clipEntry(lang, key)) return null;
  const buffer = await clipOf(lang, key);
  if (!buffer) return null;
  return {
    buffer,
    play(offset = 0, { worn = false } = {}) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      let end = src;
      if (worn) {
        const low = ctx.createBiquadFilter(), high = ctx.createBiquadFilter(), gain = ctx.createGain();
        low.type = 'highpass'; low.frequency.value = 320;
        high.type = 'lowpass'; high.frequency.value = 3200;
        gain.gain.value = 1.25;
        end = src.connect(low).connect(high).connect(gain);
      }
      end.connect(bus);
      src.start(0, Math.min(offset, buffer.duration));
      return () => { try { src.stop(); } catch { /* (over already) */ } end.disconnect(); };
    },
  };
}

// --- what she has to say --------------------------------------------------------------------------

// waiting their turn: { line, form, key, pri, ttl, at, n }; at: from when it may be said
let queue = [], current = null, n = 0;
let clock = 0, lastEnd = -Infinity;   // s of narrator time (it stops while paused); when the last line ended

// the sibling's form (core/narration.js SIBLING): the hero's gender is not asked yet (docs/story.md,
// "What the game needs" 1), so the world's seed picks one
const sibling = () => (hash32((state.cubes?.seed ?? 0) ^ 0x51b1) & 1 ? 'f' : 'm');

const toldOrWaiting = () => new Set([...state.run.told, ...queue.map(q => q.line.id), ...current ? [current.item.line.id] : []]);
// an enemy after the hero, close by
const engaged = () => allEnemies().some(e => (e.mode === 'chase' || e.mode === 'attack') && e.hp > 0
  && Math.hypot(e.x - player.x, e.z - player.z) < FOE_NEAR);

// Something happened: moment `on` (core/narration.js MOMENTS), about `data`. She queues what she
// has to say about it (to say no sooner than `delay` s from now: after a jingle); true if she had
// something.
export function narrate(on, data = {}, { delay = 0 } = {}) {
  const m = MOMENTS[on];
  if (!m) throw new TypeError(`Unknown narration moment: ${on}`);
  if (!enabled || !state.run || state.mode !== 'play') return false;
  if (m.quiet && (current || queue.length || clock - lastEnd < m.quiet)) return false;
  if (m.calm && engaged()) return false;
  const lines = linesFor(on, data, toldOrWaiting());
  for (const line of lines) {
    const form = formOf(line, sibling()), key = clipKey(line, form);
    queue.push({ line, form, key, pri: m.pri, ttl: m.ttl ?? Infinity, at: clock + delay, n: n++ });
    if (ctx && clipEntry(language(), key)) clipOf(language(), key);   // (fetched while the others speak)
  }
  return lines.length > 0;
}

// the next line to say: the most important, the oldest of those; the ones waited too long go
function next() {
  queue = queue.filter(q => clock - q.at <= q.ttl);
  const ready = queue.filter(q => q.at <= clock);
  if (!ready.length) return null;
  const best = ready.reduce((a, b) => (b.pri > a.pri || b.pri === a.pri && b.n < a.n ? b : a));
  queue.splice(queue.indexOf(best), 1);
  return best;
}

// --- saying it ----------------------------------------------------------------------------------

const box = typeof document === 'object' ? document.getElementById('subtitle') : null;
function showSubtitle(text) {
  if (!box) return;
  box.firstElementChild.textContent = text;
  box.classList.toggle('on', !!text && subtitles());
}

function begin(item) {
  state.run.told.add(item.line.id);
  const lang = language(), entry = ctx?.state === 'running' ? clipEntry(lang, item.key) : null;
  current = { item, phase: 'load', t: 0, dur: 0, buffer: null, src: null };
  if (!entry) { say(null); return; }
  const mine = current;
  clipOf(lang, item.key).then(buffer => { if (current === mine && mine.phase === 'load') say(buffer); });
}

function say(buffer) {
  const { item } = current, text = lineText(item.line, item.form);
  Object.assign(current, { phase: 'say', t: 0, buffer, dur: buffer ? buffer.duration : Math.max(MIN_READ, text.length / READ) });
  showSubtitle(text);
  log('narration', { line: item.line.id, form: item.form });
  if (buffer && !worldPaused()) play(0);
}

// the voice from `offset` s into the clip (and the music down under it)
function play(offset) {
  const c = current;
  if (!c?.buffer || !bus || c.src) return;
  const src = ctx.createBufferSource();
  src.buffer = c.buffer;
  src.connect(bus);
  src.start(0, Math.min(offset, c.buffer.duration));
  c.src = src;
  if (voiceVolume() > 0) duckMusic(ctx.currentTime, Math.max(0, c.buffer.duration - offset) + 0.3, DUCK);
}
function hush() {
  const c = current;
  if (!c?.src) return;
  try { c.src.stop(); } catch { /* (already stopped) */ }
  c.src.disconnect();
  c.src = null;
  duckMusic(ctx.currentTime, 0, 1);   // (the music comes back up)
}

function finish() {
  hush();
  current = null;
  lastEnd = clock;
  showSubtitle('');
}

// main.js, every frame of play: her clock (stopped while paused), what she notices, and the
// line being said
export function updateNarrator(elapsed) {
  if (!enabled) return;
  fetchManifest();
  if (worldPaused()) { hush(); return; }
  clock += elapsed;
  if (state.map && !state.transitioning) notice(elapsed);
  if (current) {
    current.t += elapsed;
    if (current.phase === 'load') { if (current.t >= LOAD_WAIT) say(null); }
    else {
      if (current.buffer && !current.src && current.t < current.dur) play(current.t);
      if (current.t >= current.dur + LINGER) finish();
    }
  }
  if (!current && clock - lastEnd >= GAP) {
    const item = next();
    if (item) begin(item);
  }
}

// She stops talking and forgets what waited (back to the menu, another world). `world`: a new
// world starts: what she noticed in the one before goes too.
export function stopNarrator() {
  if (current) finish();
  queue = [];
  lastEnd = clock + FIRST - GAP;
  Object.assign(seen, { foes: new Set(), boss: new Map(), villagers: new Set(), fight: 0, low: false, still: 0, at: null, from: null, arrived: '' });
}

// dev (/narrate): line `id` said now, before anything waiting, told or not ('forget': she forgets
// what she said in this world, and says it all again). A message: what happened.
export function devNarrate(id) {
  if (id === 'forget') { state.run.told.clear(); stopNarrator(); return 'The narrator forgot what she said in this world'; }
  const line = lineById(id);
  if (!line) return `No line ${id}`;
  if (!enabled) return 'The narrator is off (?narration=0, or in the guide)';
  const form = formOf(line, sibling()), key = clipKey(line, form);
  queue.push({ line, form, key, pri: 9, ttl: Infinity, at: clock, n: -1 - n++ });
  return `Narrating ${key}`;
}

// what she is saying and what waits (dev, tests/browser/): the clip, whether it is voiced, the rest's clips
export const narratorNow = () => ({ enabled, audio: ctx?.state ?? null, manifest: !!manifest,
  saying: current && { key: current.item.key, phase: current.phase, voiced: !!current.buffer, t: current.t, dur: current.dur },
  waiting: queue.map(q => q.key), told: state.run ? [...state.run.told] : [] });

// --- the moments she notices herself ------------------------------------------------------------

const seen = { foes: new Set(), boss: new Map(), villagers: new Set(), fight: 0, low: false, still: 0, at: null, from: null, arrived: '' };

function notice(dt) {
  const map = state.map;
  // the villagers passed (the town, the merchant camp)
  for (const v of map.villagers ?? []) {
    if (seen.villagers.has(v.name) || Math.hypot(v.x - player.x, v.z - player.z) > NEAR_VILLAGER) continue;
    if (narrate('town', { who: v.name }) || !queue.length) seen.villagers.add(v.name);
  }
  let boss = null, fighting = false;
  for (const e of allEnemies()) {
    if (e.hp <= 0 || e.mode === 'dead' || !e.profile) continue;
    if (e.boss && !e.proxy && !e.summoned) { boss = e; continue; }
    const after = e.mode === 'chase' || e.mode === 'attack', near = Math.hypot(e.x - player.x, e.z - player.z) < FOE_NEAR;
    if (!after || !near) continue;
    fighting = true;
    const species = e.profile.species;
    if (!e.summoned && !e.guardian && species && !seen.foes.has(species)) { seen.foes.add(species); narrate('foe', { species }); }
  }
  if (boss) bossFight(boss);
  // a long fight (not a boss's: he has lines of his own)
  seen.fight = fighting && !boss ? seen.fight + dt : 0;
  if (seen.fight > FIGHT_LONG && narrate('fight')) seen.fight = 0;
  // low health, once until it is back up
  const share = player.maxHp > 0 ? player.hp / player.maxHp : 1;
  if (player.hp > 0 && share < LOW && !seen.low) { seen.low = true; narrate('hurt'); }
  else if (share > HIGH) seen.low = false;
  // standing about
  const at = seen.at, moved = !at || Math.hypot(player.x - at.x, player.z - at.z) > 0.3;
  if (moved) { seen.at = { x: player.x, z: player.z }; seen.still = 0; }
  else if ((seen.still += dt) > IDLE) { seen.still = 0; narrate('idle'); }
}

// a boss's fight, read off him: it starting, each attack as it starts, his change at a stage
function bossFight(e) {
  const was = seen.boss.get(e.id) ?? { started: false, attacks: -1, mode: '' };
  if (!was.started && (e.mode === 'chase' || e.mode === 'attack')) { was.started = true; narrate('boss', { boss: e.boss, what: 'start' }); }
  if (was.started && e.mode === 'attack' && e.attacks !== was.attacks) {
    was.attacks = e.attacks;
    narrate('boss', { boss: e.boss, what: attackOf(e).name });
  }
  if (e.mode === 'split' && was.mode !== 'split') narrate('boss', { boss: e.boss, what: 'split', stage: e.stage });
  was.mode = e.mode;
  seen.boss.set(e.id, was);
}

// game/flow.js settleIn: the hero is in cube `key` now (its map; visits: how often, this time
// counted; deeper: the first time at this depth in this world). Called again for the same cube
// after a trip settles: only the first counts.
export function arrived(map, key, visits, deeper) {
  if (!enabled || seen.arrived === key) return;
  const from = seen.from;
  seen.arrived = key; seen.from = map;
  if (map.testRoom || map.interior) return;
  if (map.town) {
    if (!narrate('opening') && from && !from.town && !from.interior && !from.merchantCamp) narrate('home');
    return;
  }
  if (map.merchantCamp) { narrate('camp'); return; }
  const depth = map.depth ?? 0;
  if (deeper) narrate('depth', { depth });
  // a guardian's arena: the guardian is all she talks about
  if (map.guardian && gateLocked(map, state.run)) {
    if (map.guardian.boss) narrate('arena', { boss: map.guardian.boss });
    else narrate('guardian', { what: 'near' });
    return;
  }
  if (depth > 0) narrate('theme', { theme: themeOf(map).props });
  else if (!map.enemyFree) narrate('road');
  if (visits === 1) narrate('wander', { act: actAt(depth), depth });
}
