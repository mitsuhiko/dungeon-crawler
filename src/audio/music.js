// Music: Scrimshaw scores (music/<name>.scrim, docs/music.md) played by the vendored Web Audio
// synth (vendor/scrimshaw). One song at a time: switching fades the old one out and starts
// the new one from the top. The mood (explore, treasure, sense, rise, fight, boss; picked by
// game/music.js) decides which voices play: joining ones come in on the next step (a
// sixteenth), picking up notes already under way, leaving ones fade out from the next beat. A
// boss's song has moods of its own (its fight's phases, game/music.js), and may have stings: a
// pattern played once, over the loop, from the next step as its mood begins (audio/score.js).
// Off until turned on (game/settings.js keeps that: the settings menu, or M). Turned on, the
// song starts from the top. It plays into the music bus (context.js), with its own volume.
// The synth (compressors, a long reverb) is built for the first song and only hangs on the bus
// while a song plays or rings out: the audio thread works on every node it can reach from the
// speakers, heard or not, and with the music off that was most of the game's sound work.
// The drums play from hits rendered once per song (drumkit.js), the other notes from samples
// the synth rendered when the song first played (sampler.js); until they are in, the synth plays
// them live.
// A film plays a score of its own (playFilmScore): its notes laid out ahead for the film's time
// (core/film.js scorePlan, score.js filmEvents), over the held songs, until it rings out or the
// film is skipped; the next song waits for its last notes. It plays unless the music was turned
// off (setMusicEnabled's films: the dev tools start with the songs off, not the films').
// Notes are scheduled from the main thread a second ahead: a frame that stalls (compiling a
// shader, building a cube) must not starve the audio. A note that comes late all the same
// still plays if it is at most LATE behind, at once; one later than that is dropped.
import { createSynth } from '../../vendor/scrimshaw/synth.js';
import { loadScore, voicesIn } from './score.js';
import { onAudioStart } from './context.js';
import { prepareDrums, playDrum } from './drumkit.js';
import { prepareSamples, playSampled, sampleInfo } from './sampler.js';

const VOLUME = 0.4;                         // the music sits under the sound effects
const LOOKAHEAD = 1, HIDDEN_LOOKAHEAD = 2.5;   // seconds scheduled ahead; timers slow down in hidden tabs
const LATE = 0.15;                          // s: a note this late still plays (at once)
const FADE = 0.35;                          // time constant of a song or voice fading out
const GAP = 0.8;                            // seconds between one song fading and the next starting
const JOIN_MARGIN = 0.04;                   // s: a joining voice comes in on the first step after this
const MIN_HELD = 0.15;                      // s: a held note joined with less than this left stays out

const DOWN = 0.6, UP = 1.2;                  // s the music takes to go down under a jingle, and to come back (duckMusic)
const RING_OUT = 4;                         // s after a song stops before the synth leaves the bus (the reverb's tail)

let ctx = null, syn = null, output = null, attached = false, idleAt = 0;
const scores = new Map();                   // name -> score once loaded (null if it failed)
const loading = new Map();                  // name -> a promise of it
let want = null, mood = 'explore';
let enabled = false, filmsOn = true;
let held = false;                           // the splash screen plays: no song yet (holdMusic)
let cur = null;                             // the song playing
let nextAt = 0;                             // the next song may start from here
let reel = null;                            // a film's score playing: { score, sess, events, base, i, last }

onAudioStart((ac, sounds, music) => {
  ctx = ac; output = music;
  setInterval(tick, 25);
});

// the synth, on the music bus (built on first use)
function attach() {
  if (!syn) {
    syn = createSynth(ctx, output);
    syn.out.gain.value = VOLUME;
    syn.out.disconnect(syn.analyser);   // nothing reads it, and an analyser is worked on even when unheard
    attached = true;
  }
  if (!attached) { syn.out.connect(output); attached = true; }
}
function detach() {
  syn.out.disconnect(output);
  attached = false;
}

// music/<name>.scrim, loaded and compiled once: a promise of the score (null if it failed)
function fetchScore(name) {
  if (loading.has(name)) return loading.get(name);
  scores.set(name, undefined);
  const p = fetch(new URL(`../../music/${name}.scrim`, import.meta.url))
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
    .then(text => {
      const score = loadScore(text);
      if (score.errors.length) console.warn(`music/${name}.scrim:\n${score.errors.join('\n')}`);
      scores.set(name, { ...score, name });
      return scores.get(name);
    })
    .catch(e => { console.warn(`music/${name}.scrim: ${e.message}`); scores.set(name, null); return null; });
  loading.set(name, p);
  return p;
}

// the song to play (null for silence); loads it on first use
export function playSong(name) {
  want = name;
  if (name) fetchScore(name);
}
export function setMood(name) {
  if (name === mood) return;
  mood = name;
  if (!cur) return;
  retarget();
  const sting = cur.score.stings[mood];
  if (sting) playSting(sting);
}

// turn the music down to `level` (of its volume) for `seconds` from ctx time `start`, under a
// jingle (audio/jingles.js), then bring it back: smoothly both ways (a smoothstep, followed each
// tick). A jingle asked for while another holds it down takes over from where that one is then.
let duck = null, ducked = 1;   // duck: { prev, level, start, end, from }; ducked: the level set last
export function duckMusic(start, seconds, level) {
  duck = { prev: duck, level, start, end: start + seconds, from: null };
}
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
function duckAt(d, t) {
  if (!d) return 1;
  if (d.from == null) {
    if (t < d.start) return duckAt(d.prev, t);
    d.from = duckAt(d.prev, d.start); d.prev = null;
  }
  if (t < d.start + DOWN) return d.from + (d.level - d.from) * smooth((t - d.start) / DOWN);
  if (t < d.end) return d.level;
  return d.level + (1 - d.level) * smooth((t - d.end) / UP);
}
function applyDuck() {
  const now = ctx.currentTime, f = duckAt(duck, now);
  if (duck && duck.from != null && now >= duck.end + UP) duck = null;
  if (!syn || f === ducked || Math.abs(f - ducked) < 1e-4 && f !== 1) return;
  syn.out.gain.setTargetAtTime(VOLUME * f, now, 0.03);
  ducked = f;
}

export const musicEnabled = () => enabled;
// the songs on or off; films: the films' scores (as the songs, unless said)
export function setMusicEnabled(on, films = on) { enabled = !!on; filmsOn = !!films; }
// while the splash screen plays (game/splash.js) no song starts; let go, the one wanted starts
export function holdMusic(on) { held = !!on; }

// for checks and the devtools console: what plays right now
export function musicInfo() {
  return {
    enabled, want, mood, playing: cur?.score.name ?? null, time: cur ? ctx.currentTime - cur.startAt : 0,
    film: reel && { score: reel.score.name, time: ctx.currentTime - reel.base, notes: reel.events.length, played: reel.i },
    voices: cur ? cur.score.song.voices.filter((_, i) => cur.voices[i].on).map(v => v.name) : [],
    samples: sampleInfo(cur?.sess),
  };
}

function tick() {
  if (ctx.state !== 'running') return;
  applyDuck();
  const name = enabled && !held ? want : null;
  if (cur && cur.score.name !== name) stopSong();
  const score = name && scores.get(name);
  if (!cur && score && ctx.currentTime >= nextAt && !reel) startSong(score);
  if (reel) scheduleFilm();
  if (cur) schedule();
  else if (attached && !reel && ctx.currentTime >= idleAt) detach();
}

function startSong(score) {
  const { song, stingVoices } = score, playing = voicesIn(score, mood);
  attach();
  const sess = syn.session(song);
  syn.warm(song);
  prepareDrums(ctx, song);
  prepareSamples(ctx, song, { first: playing });
  // gain: the voice's level; on: in the mood; at: when it last joined or leaves; scheduled:
  // how far its notes were scheduled when it last left (they still play, unheard, and are
  // heard again if it comes back before then)
  // (a sting's voices are in no mood: they stay open, and play only when a sting does)
  const voices = sess.ch.map((c, i) => ({ gain: c.input.gain.value, on: playing.has(i), at: 0, scheduled: 0 }));
  voices.forEach((vc, i) => { if (!vc.on && !stingVoices.has(i)) sess.ch[i].input.gain.value = 0; });
  const startAt = ctx.currentTime + 0.1;
  cur = { score, sess, voices, startAt, list: 'intro', i: 0, offset: 0, until: startAt };
}

function stopSong() {
  cur.sess.stop(FADE);
  cur = null;
  nextAt = ctx.currentTime + GAP;
  idleAt = ctx.currentTime + RING_OUT;
}

// a voice joining plays from its switch time on, one leaving plays up to it
const audible = (vc, t) => (vc.on ? t >= vc.at : t < vc.at);

// one note of the song: a drum from its rendered hits, the others from their samples, once they
// are in; else the synth.
// On a sample frame: Chrome renders the synth's short attacks (a ramp of a few ms, then a decay)
// at about half their energy when they start between two frames, so the drums' and plucks'
// loudness jumped by up to 3 dB with where the beat fell.
function play(ev, t, on = cur) {
  t = Math.round(t * ctx.sampleRate) / ctx.sampleRate;
  const v = on.score.song.voices[ev.v];
  if (v.drum ? playDrum(ctx, v.inst, ev.vel, on.sess.ch[ev.v].input, t) : playSampled(ctx, on.sess, ev, t)) return;
  on.sess.play(ev, t);
}

// the jukebox's scheduler: the intro once, then the loop forever
function schedule() {
  const { song } = cur.score;
  const horizon = ctx.currentTime + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  for (let guard = 0; guard < 5000; guard++) {
    const tl = cur.list === 'intro' ? song.intro : song.loop;
    if (cur.i >= tl.events.length) {
      if (cur.list === 'intro') { cur.list = 'loop'; cur.i = 0; cur.offset = song.intro.dur; continue; }
      const next = cur.offset + song.loop.dur;
      if (!song.loop.dur || cur.startAt + next > horizon) break;
      cur.i = 0; cur.offset = next;
      continue;
    }
    const ev = tl.events[cur.i], t = cur.startAt + cur.offset + ev.t;
    if (t > horizon) break;
    if (t >= ctx.currentTime - LATE && audible(cur.voices[ev.v], t)) play(ev, Math.max(t, ctx.currentTime + 0.005));
    cur.i++;
  }
  cur.until = Math.max(cur.until, horizon);
}

// the pass of the intro or the loop playing at time t, and when it started
function passAt(t) {
  const { song } = cur.score, st = t - cur.startAt;
  if (st < song.intro.dur || !song.loop.dur) return { tl: song.intro, base: cur.startAt };
  const n = Math.floor((st - song.intro.dur) / song.loop.dur);
  return { tl: song.loop, base: cur.startAt + song.intro.dur + n * song.loop.dur };
}

// the first step, beat or bar line at or after time t
function nextBoundary(t, unit) {
  const { tl, base } = passAt(t), st = t - base;
  const s = tl.sections.find(s => st < s.start + s.dur) ?? tl.sections.at(-1);
  if (!s) return t;
  const len = unit === 'bar' ? s.barDur : unit === 'beat' ? 60 / s.tempo : 60 / s.tempo / s.steps;
  return base + s.start + Math.max(0, Math.ceil((st - s.start) / len - 1e-6)) * len;
}

// play voice i's notes from time `at` up to what the scheduler has done (cur.until), which
// passed them over while the voice was out; with held, also the rest of notes sounding at `at`.
// Notes never cross from one pass into the next, so the passes at both ends cover it all.
function catchUp(i, at, held) {
  const passes = [passAt(at)], last = passAt(Math.max(at, cur.until - 1e-6));
  if (last.base !== passes[0].base) passes.push(last);
  const drum = cur.score.song.voices[i].drum;
  for (const { tl, base } of passes) for (const ev of tl.events) {
    if (ev.v !== i) continue;
    const t = base + ev.t, end = t + ev.d;
    if (t >= cur.until) break;
    if (t >= at) play(ev, t);
    else if (held && !drum && end - at >= MIN_HELD) play({ ...ev, d: end - at, g: undefined }, at);
  }
}

// fade voices in or out for the new mood: joining ones on the next step, leaving ones from
// the next beat (the fade takes a moment, so they don't cut off mid-note)
function retarget() {
  const now = ctx.currentTime;
  const step = nextBoundary(now + JOIN_MARGIN, 'step'), beat = nextBoundary(now + JOIN_MARGIN, 'beat');
  const playing = voicesIn(cur.score, mood);
  cur.voices.forEach((vc, i) => {
    if (cur.score.stingVoices.has(i)) return;
    const on = playing.has(i);
    if (on === vc.on) return;
    const g = cur.sess.ch[i].input.gain;
    g.cancelScheduledValues(now);
    if (!on) vc.scheduled = cur.until;   // (a voice leaving before it even joined has its caught-up notes)
    if (vc.at > now) {
      // the last change has not happened yet: dropping it is enough, except that a voice
      // that was about to leave missed its notes after that point (those it had scheduled
      // before it was told to leave are still there)
      if (on) catchUp(i, Math.max(vc.at, vc.scheduled), false);
      vc.on = on; vc.at = 0; return;
    }
    vc.on = on; vc.at = on ? step : beat;
    g.setTargetAtTime(on ? vc.gain : 0, vc.at, on ? 0.01 : FADE);
    // back before its scheduled notes ran out: those play again, the rest is caught up
    if (on) catchUp(i, Math.max(step, vc.scheduled), step >= vc.scheduled);
  });
}

// a sting: its notes from the next step on, all scheduled at once (a bar or so)
function playSting(tl) {
  const at = nextBoundary(ctx.currentTime + JOIN_MARGIN, 'step');
  for (const ev of tl.events) play(ev, at + ev.t);
}

// --- a film's score -------------------------------------------------------------------------------

// music/<name>.scrim loaded (a film's score: films/<film>), for the film to wait for
export const loadMusic = name => fetchScore(name);

// play a film's notes (score.js filmEvents) with the film's time 0 at ctx time `base` (a film started further
// in: the notes before now are left out), over the songs held for the film (holdMusic). It plays
// to the end and rings out; the next song waits for its last notes.
export function playFilmScore(score, events, base) {
  if (!ctx || !score || !events.length) return;
  stopFilmScore();
  attach();
  const sess = syn.session(score.song);
  syn.warm(score.song);
  prepareDrums(ctx, score.song);
  prepareSamples(ctx, score.song, { events });
  const last = base + Math.max(...events.map(e => e.t + e.d));
  reel = { score, sess, events, base, i: 0, last };
}
// the film's score fades out (skipped; fade: the time constant, s)
export function stopFilmScore(fade = FADE) {
  if (!reel) return;
  reel.sess.stop(fade);
  reel = null;
  nextAt = Math.max(nextAt, ctx.currentTime + GAP);
  idleAt = ctx.currentTime + RING_OUT;
}
function scheduleFilm() {
  if (!filmsOn) { stopFilmScore(); return; }
  const now = ctx.currentTime, horizon = now + (document.hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
  while (reel.i < reel.events.length) {
    const ev = reel.events[reel.i], t = reel.base + ev.t;
    if (t > horizon) break;
    if (t >= now - LATE) play(ev, Math.max(t, now + 0.005), reel);
    reel.i++;
  }
  // all of it played: once its last notes are over, the next song may come; it rings out
  if (reel.i >= reel.events.length && now >= reel.last) {
    const { sess } = reel;
    reel = null;
    setTimeout(() => sess.stop(FADE), RING_OUT * 1000);
    idleAt = now + RING_OUT + 1;
  }
}
