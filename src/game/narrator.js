// The narrator (docs/story.md, docs/narration.md): the voices that talk while the hero plays, like
// Bastion's: the glassmaker's recordings, found in his glass (game/intro.js), and the robot, from its
// hello on, about what it sees (core/narration.js). The game tells the narrator its moments
// (narrate: a recording found, a depth reached, a boss beaten, a death ...), and some it looks for
// itself every frame (updateNarrator: the villagers close by, an enemy of a new kind coming after
// the hero, a boss's fight and its attacks, low health, a long fight, standing about). What is
// said about a moment is core/narration.js's to pick (linesFor); it is said here: one line after
// the other, never two at once, the more important first (a recording before chatter), and what
// waited too long to still fit is left out. Each line is voiced from its clip
// (assets/narration/<lang>/, in the language of the moment, if it has a voice) through the voice
// bus (audio/context.js), worn like an old recording if the line is (a recording's), with the
// music turned down under it, shown as a subtitle (#subtitle, if the settings want them) and
// written into the chronicle. Without a clip (a language without a voice, no audio yet) the
// subtitle stays up as long as it takes to read it. A line is said once in a world: the world keeps
// what was said (state.run.told, saved with it, game/save.js); the memories play a recording heard
// again (hearAgain, game/memorypanel.js).
//
// While the game is paused (the Esc menu, the inventory: state.js worldPaused) the narrator pauses
// too, mid-word, and goes on where it stopped. Not in the guide's game window, nor with
// ?narration=0.
import { MOMENTS, LINES, linesFor, clipKey, formOf, lineById, lineText, outOfPlace, robotMayTalk } from '../core/narration.js';
import { robotMet } from '../core/robot.js';
import { TRIALS } from '../core/trials.js';
import { attackOf } from '../core/enemies.js';
import { gateLocked } from '../core/guardians.js';
import { hash32 } from '../core/util.js';
import { actAt, themeOf } from '../themes/depth.js';
import { language } from '../i18n/i18n.js';
import { onAudioStart } from '../audio/context.js';
import { duckMusic } from '../audio/music.js';
import { player, state, worldPaused } from './state.js';
import { allEnemies } from './enemies.js';
import { subtitles, voiceVolume, onSettingsChange } from './settings.js';
import { log } from './log.js';

// <body> .subtitled while the subtitles are on: on a phone the chat leaves out the lines they show (style.css)
if (typeof document === 'object') {
  const mark = () => document.body.classList.toggle('subtitled', subtitles());
  mark(); onSettingsChange(mark);
}

const GAP = 0.9;          // s of quiet between two lines
const FIRST = 1.2;        // s before the first line in a world (it fades in)
const LOAD_WAIT = 3;      // s a line waits for its clip before it is only read
const RESUME_WAIT = 400;  // ms a clip waits for the sound to start before it is only read
const CUT_FADE = 0.35;    // s a line cut short takes to fade out
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
// until fetched, {} if there is none. Without it, or without a clip, the line is only read
// (its subtitles).
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
    clips.set(k, fetch(new URL(`../../assets/narration/${lang}/${key}.opus`, import.meta.url))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b))
      .catch(e => { console.warn(`narration ${k}: ${e.message}`); clips.delete(k); return null; }));
  }
  return clips.get(k);
}

// a clip's source through the voice bus; worn: thin, as an old recording sounds (the film's lines,
// the glassmaker's recordings). -> its gain (to fade it, and to disconnect when it is over)
function voiceOut(src, worn) {
  const gain = ctx.createGain();
  gain.gain.value = worn ? 1.25 : 1;
  let end = src;
  if (worn) {
    const low = ctx.createBiquadFilter(), high = ctx.createBiquadFilter();
    low.type = 'highpass'; low.frequency.value = 320;
    high.type = 'lowpass'; high.frequency.value = 3200;
    end = src.connect(low).connect(high);
  }
  end.connect(gain).connect(bus);
  return gain;
}

// A clip said by someone else than the narrator (a film's line: film/player.js), in the current
// language: { buffer, play(offset, { worn }) -> stop() } through the voice bus (worn: thin, as an
// old recording sounds), or null (no clip, no sound yet). It waits for the manifest.
export async function voiceClip(key) {
  // (just started by a click; without one the browser may never let it, so not for long)
  if (ctx?.state === 'suspended') await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, RESUME_WAIT))]);
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
      const end = voiceOut(src, worn);
      src.start(0, Math.min(offset, buffer.duration));
      return () => { try { src.stop(); } catch { /* (over already) */ } end.disconnect(); };
    },
  };
}

// --- what she has to say --------------------------------------------------------------------------

// waiting their turn: { line, form, key, pri, ttl, at, n }; at: from when it may be said
let queue = [], current = null, n = 0;
let clock = 0, lastEnd = -Infinity;   // s of narrator time (it stops while paused); when the last line ended
let robotEnd = -Infinity;             // ... and when the robot's last line ended (or was cut short)

// the sibling's form (core/narration.js SIBLING): the hero's gender is not asked yet (docs/story.md,
// "What the game needs" 1), so the world's seed picks one
const sibling = () => (hash32((state.cubes?.seed ?? 0) ^ 0x51b1) & 1 ? 'f' : 'm');

const toldOrWaiting = () => new Set([...state.run.told, ...queue.map(q => q.line.id), ...current ? [current.item.line.id] : []]);
// The lines that may be said now: the robot's only once it has woken and said its hello (its hello
// is how it wakes: not while that is still being said or waits its turn)
const ROBOT_LATER = LINES.filter(l => l.voice === 'robot' && l.on !== 'robot');
const BEFORE_ROBOT = LINES.filter(l => !ROBOT_LATER.includes(l));
const saying = () => [...current ? [current.item] : [], ...queue];
const helloPending = () => saying().some(q => q.line.on === 'robot');
const sayable = () => (robotMet(state.run) && !helloPending() ? LINES : BEFORE_ROBOT);
// The robot is paced (core/narration.js ROBOT_REST): a line of it is not said while another of its
// is said or waits (but a story scene's), nor before it kept quiet long enough for its moment
const robotBusy = () => saying().some(q => q.line.voice === 'robot');
const robotPaced = (m, lines) => !lines.some(l => l.voice === 'robot') || m.pri >= 3
  || !robotBusy() && robotMayTalk(m.pri, clock - robotEnd);

// an enemy after the hero, close by
const engaged = () => allEnemies().some(e => (e.mode === 'chase' || e.mode === 'attack') && e.hp > 0
  && Math.hypot(e.x - player.x, e.z - player.z) < FOE_NEAR);

// Something happened: moment `on` (core/narration.js MOMENTS), about `data`. The narrator queues
// what there is to say about it (to say no sooner than `delay` s from now: after a jingle); true if
// there was something. A scene that `cuts` cuts short another of its moment still going; a `whole`
// one is told whole at once (even with the narrator off: the Memories have it).
export function narrate(on, data = {}, { delay = 0 } = {}) {
  const m = MOMENTS[on];
  if (!m) throw new TypeError(`Unknown narration moment: ${on}`);
  if (!state.run || state.mode !== 'play') return false;
  if (!enabled && !m.whole) return false;
  if (m.quiet && (current || queue.length || clock - lastEnd < m.quiet)) return false;
  if (m.calm && engaged()) return false;
  const lines = linesFor(on, data, toldOrWaiting(), sayable(), state.cubes?.seed ?? 0);
  if (enabled && !robotPaced(m, lines)) return false;   // (not now: it may come another time)
  if (m.whole) for (const line of lines) state.run.told.add(line.id);
  if (!enabled || !lines.length) return lines.length > 0;
  if (m.cuts) cut(l => l.on === on && !lines.includes(l));
  for (const line of lines) {
    const form = formOf(line, sibling()), key = clipKey(line, form);
    queue.push({ line, form, key, pri: m.pri, ttl: m.ttl ?? Infinity, at: clock + delay, n: n++ });
    if (ctx && clipEntry(language(), key)) clipOf(language(), key);   // (fetched while the others speak)
  }
  return lines.length > 0;
}

// Cut short the lines `which` picks (line -> true): those waiting are dropped, the one being said
// fades out (its subtitle goes), and all of them count as told. The next waits the usual GAP.
export function cut(which) {
  for (const q of queue) if (which(q.line)) state.run?.told.add(q.line.id);
  queue = queue.filter(q => !which(q.line));
  if (!current || !which(current.item.line)) return;
  const c = current;
  if (c.src) {
    const t = ctx.currentTime, src = c.src, out = c.out;
    out.gain.setTargetAtTime(0, t, CUT_FADE / 4);
    try { src.stop(t + CUT_FADE); } catch { /* (over already) */ }
    setTimeout(() => out.disconnect(), CUT_FADE * 1000 + 100);
    c.src = null;
    duckMusic(t, 0, 1);   // (the music comes back up)
  }
  ended(c);
  showSubtitle('');
}
// the line being said is over (said, or cut short)
function ended(c) {
  if (c?.item.line.voice === 'robot') robotEnd = clock;
  current = null;
  lastEnd = clock;
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
  c.out = voiceOut(src, c.item.line.worn);
  src.start(0, Math.min(offset, c.buffer.duration));
  c.src = src;
  if (voiceVolume() > 0) duckMusic(ctx.currentTime, Math.max(0, c.buffer.duration - offset) + 0.3, DUCK);
}
function hush() {
  const c = current;
  if (!c?.src) return;
  try { c.src.stop(); } catch { /* (already stopped) */ }
  c.out.disconnect();
  c.src = null;
  duckMusic(ctx.currentTime, 0, 1);   // (the music comes back up)
}

function finish() {
  hush();
  ended(current);
  showSubtitle('');
}

// main.js, every frame of play: her clock (stopped while paused), what she notices, and the
// line being said
export function updateNarrator(elapsed) {
  if (!enabled) return;
  fetchManifest();
  if (worldPaused()) { hush(); return; }
  // a boss's intro (game/bossintro.js): she stops (her subtitle goes) and waits till it is over
  if (state.intro?.full) { if (current) finish(); return; }
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
  robotEnd = -Infinity;
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

// The memories (game/memorypanel.js): a recording's `lines` played again from the start, while the
// world is paused too (the inventory is open), not remembered as told: onLine(i) as line i starts
// (its subtitle is the panel's), onLine(-1) once they are all said. -> stop()
export function hearAgain(lines, onLine) {
  let stopped = false, stopClip = null, timer = null;
  const say = i => {
    if (stopped) return;
    if (i >= lines.length) { onLine(-1); return; }
    onLine(i);
    const line = lines[i], form = formOf(line, sibling());
    const read = Math.max(MIN_READ, lineText(line, form).length / READ);
    voiceClip(clipKey(line, form)).then(clip => {
      if (stopped) return;
      if (clip) {
        stopClip = clip.play(0, { worn: !!line.worn });
        if (voiceVolume() > 0) duckMusic(ctx.currentTime, clip.buffer.duration + 0.3, DUCK);
      }
      timer = setTimeout(() => { stopClip?.(); stopClip = null; say(i + 1); }, ((clip ? clip.buffer.duration + LINGER : read) + GAP) * 1000);
    });
  };
  say(0);
  return () => {
    if (stopped) return;
    stopped = true; clearTimeout(timer); stopClip?.();
    if (ctx) duckMusic(ctx.currentTime, 0, 1);   // (the music comes back up)
  };
}

// whose voice is saying a line now ('robot', 'glassmaker'; null: nobody): game/robot.js talks while it is its
export const speaking = () => current?.phase === 'say' ? current.item.line.voice ?? null : null;

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
    if (!e.summoned && !e.guardian && species && !seen.foes.has(species) && robotMet(state.run)) { seen.foes.add(species); narrate('foe', { species }); }
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

// a boss's fight, read off him: it starting, each attack as it starts, his change at a stage, the
// world he tips
function bossFight(e) {
  const was = seen.boss.get(e.id) ?? { started: false, attacks: -1, mode: '' };
  if (!was.started && (e.mode === 'chase' || e.mode === 'attack')) { was.started = true; narrate('boss', { boss: e.boss, what: 'start' }); }
  if (was.started && e.mode === 'attack' && e.attacks !== was.attacks) {
    was.attacks = e.attacks;
    narrate('boss', { boss: e.boss, what: attackOf(e).name });
  }
  if (e.mode === 'split' && was.mode !== 'split') narrate('boss', { boss: e.boss, what: 'split', stage: e.stage });
  // the world tipped (Sollmeldon's landing, game/tilt.js), once until it is level again
  const tipped = e.tilt ? Math.hypot(e.tilt[0], e.tilt[1]) : 0;
  if (tipped > 0.8 && !was.tipped) { was.tipped = true; narrate('boss', { boss: e.boss, what: 'tilt' }); }
  else if (tipped < 0.2) was.tipped = false;
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
  cut(line => outOfPlace(line, map));   // a recording of the place left is cut short (core/narration.js `where`)
  if (map.testRoom || map.interior) return;
  if (map.town) {
    if (from && !from.town && !from.interior && !from.merchantCamp) narrate('home');
    return;
  }
  if (map.merchantCamp) { narrate('camp'); return; }
  const depth = map.depth ?? 0;
  if (deeper) narrate('depth', { depth });
  // a trial room's puzzle not solved yet (an event says its piece when it seals the room)
  if (map.trial && !TRIALS[map.trial.kind]?.sealed && !state.run.unlockedGates.has(map.trial.gate)) narrate('trial', { what: 'puzzle', kind: map.trial.kind });
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
