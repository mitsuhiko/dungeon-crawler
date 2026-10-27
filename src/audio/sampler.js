// The music's melodic notes as samples. The synth (vendor/scrimshaw) builds every note from
// scratch, ten to twenty Web Audio nodes each (oscillators, filters, a vibrato, noise), and 30 to
// 70 of them sound at once: that was most of the audio thread's work. Old consoles and MIDI
// sound banks played a recorded sample at a pitch instead, and so does this: each note a song
// uses (its instrument, the voice's settings, the pitch) is rendered once by the same synth, in
// an OfflineAudioContext (the browser renders it off the main thread), when the song is first
// played, and kept for the next time. A note is then a buffer source and a gain: its envelope, and
// for some its vibrato. Until a song's notes are in, the synth plays them live (as the drums,
// drumkit.js).
//   - A held note (organ, strings, choir, flute, glass harmonica ...) is rendered without its
//     vibrato, as its attack and then a stretch of its steady tone that loops (a whole number of
//     its periods, crossfaded into the start of the loop, so the jump is not heard); the player
//     lets go of it with the instrument's own release, and plays the vibrato as the instrument
//     would have (synth.js captureNotes: one slow oscillator per voice into the notes' detune).
//     A note short enough is rendered whole.
//   - A struck note (mallets, bells, plucked strings ...) is rendered ringing, as long as the
//     song holds it at most, down to QUIET; the player damps it where the synth would have. The
//     synth's damping takes over from the note's own decay, the player's comes on top of the
//     decay in the sample: it damps slower by as much as the loudest partial decays.
//     One whose sound has noise in it (a mallet's knock, a plucked string's random start) gets
//     TAKES takes, so a quick ostinato is not one sound repeated.
//   - A struck note that rings long under one envelope (crystal: its FM settles, then one
//     sine fades for seconds) is rendered with the envelope taken out once it has settled, and
//     loops like a held one; the player puts the envelope back on, as the synth's gain had it.
//   - A note whose sound stays under HALF_TOP Hz (TOP) is rendered at half the context's rate:
//     half the memory.
//   - At most CAP notes of a song sound at once: one more lets the oldest go (a fading one first).
// Samples are kept up to BUDGET bytes; the least recently used of other songs go first.
import { INST, mtof, captureNotes } from '../../vendor/scrimshaw/synth.js';

const VEL_TIMBRE = new Set(['brass', 'trumpet', 'synbass', 'crystal']);   // their sound follows the velocity, not only their level
// how far above its pitch an instrument's sound reaches (its highest partial worth hearing, as a
// multiple of it): a note whose sound stays under HALF_TOP Hz is rendered at half the rate.
// Instruments behind a low-pass reach the cut-off at most.
const TOP = { musicbox: 6, bell: 4.5, glock: 9, celesta: 4.5, vibes: 4.5, xylophone: 6.5, steeldrum: 4.5,
  marimba: 4, timpani: 3, bowl: 5.5, flute: 3, theremin: 4, glassharp: 5,
  // (and the plucked strings at the full rate always: their Karplus-Strong loop sounds different at another rate)
  harp: Infinity, guitar: Infinity, banjo: Infinity, harpsichord: Infinity, pizz: Infinity, upright: Infinity };
const TOP_DEFAULT = 10;
const HALF_TOP = 10000;    // Hz: under a little less than half the rate's Nyquist
const LOOP = { glassharp: 1.25 };   // s a held note's loop lasts (about); the glass harmonica's 1.6 Hz beat, twice
const LOOP_LEN = 1.2;      // s, the others
const RING_LOOP = 0.4;     // s: the loop of a struck note's settled ring (one sine, about)
const XFADE = 0.12;        // s the end of a loop is crossfaded into what comes before its start
const WHOLE = 3;           // s: a held note this long at most (with its release) is rendered whole
const MAX_RING = 10;       // s: a struck note rings at most this long (a longer one is played live)
const QUIET = 2e-3;        // a struck note's ring is cut where it has fallen this far under its peak (-54 dB)
const TAKES = 2, SHORT = 2.5;   // takes of a struck note with noise in it, up to SHORT s long
const GAP = 0.05;          // s between notes in a render
const BATCH = 40;          // s of notes rendered at once (the render's output is held in memory)
const BUDGET = 40e6;       // bytes of samples kept
const CAP = 24;            // notes of a song sounding at once
const STEAL = 0.015;       // s: the time constant a note let go of fades with

let enabled = true;
// key -> { takes (AudioBuffers, null while rendering), held, a, r, loop, damp, env, vib, vel,
// covers (s: the longest note it plays), asked (the longest asked for), bytes, used }
const cache = new Map();
const playing = new WeakMap();   // a session -> its sampled notes sounding: [{ start, rel, end, g, src }]
const lfos = new WeakMap();      // a voice's channel -> its vibrato: { osc, users }
const lastTake = new Map();
const noises = new Map();        // rate -> 3 s of white noise (the synth's S.noise)
let queue = Promise.resolve(), stamp = 0, stolen = 0;

// the samples on or off (to hear and measure the synth against them, from the dev tools)
export function setSampling(on) { enabled = !!on; }

const velStep = vs => Math.max(0.25, Math.round(vs * 4) / 4);   // (the level itself is exact: the player's gain)
// a note's sample: its voice's instrument and settings, the pitch, and the velocity where it
// changes the sound
export const keyOf = (v, m, vs) => `${v.inst}|${v.bright}|${v.att ?? ''}|${v.rel ?? ''}|${m}|${VEL_TIMBRE.has(v.inst) ? velStep(vs) : 1}`;

// every note a song plays (or a film's events), once: key -> { key, voice (its first), voices, m, vel, maxDur }
export function noteSpecs(song, events = null) {
  const specs = new Map();
  const lists = events ? [events] : [song.intro.events, song.loop.events, ...Object.values(song.stings ?? {}).map(tl => tl.events)];
  for (const list of lists) for (const ev of list) {
    const v = song.voices[ev.v];
    if (!v || v.drum || !INST[v.inst] || !ev.m) continue;
    const vs = ev.vel / Math.sqrt(ev.m.length);
    for (const m of ev.m) {
      const key = keyOf(v, m, vs);
      let s = specs.get(key);
      if (!s) specs.set(key, s = { key, voice: v, voices: new Set(), m, vel: VEL_TIMBRE.has(v.inst) ? velStep(vs) : 1, maxDur: 0 });
      s.voices.add(ev.v);
      s.maxDur = Math.max(s.maxDur, ev.d);
    }
  }
  return specs;
}

// the loop of a held note at frequency f: [start, end) in frames, a whole number of periods
export function loopFrames(f, rate, start, seconds) {
  const period = rate / f, n = Math.max(1, Math.round(seconds * rate / period));
  const a = Math.round(start * rate);
  return [a, a + Math.round(n * period)];
}
// crossfade the X frames before `end` into the X before `start` (in place): playing on from
// end - 1 into start is then what played on from start - 1
export function crossfadeLoop(y, start, end, x) {
  for (let i = 0; i < x; i++) {
    const w = 0.5 - 0.5 * Math.cos(Math.PI * i / x);
    y[end - x + i] = y[end - x + i] * (1 - w) + y[start - x + i] * w;
  }
}

function noiseAt(rate) {
  if (!noises.has(rate)) {
    const b = new AudioBuffer({ length: 3 * rate, sampleRate: rate }), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(rate, b);
  }
  return noises.get(rate);
}
// what the instruments need of the synth (synth.js S) on context c; every source stops by `until`
// at the latest (a note in a render does not ring into the next), onStop(t) hears where it would
function synthOn(c, { until = Infinity, onStop = null, sources = null } = {}) {
  const watch = node => {
    const stop = node.stop.bind(node);
    node.stop = t => { onStop?.(t); stop(Math.min(t, until)); };
    if (sources) sources.n++;
    return node;
  };
  return {
    nyq: c.sampleRate / 2, noise: noiseAt(c.sampleRate), waves: {}, ks: {},
    ctx: {
      sampleRate: c.sampleRate,
      createGain: () => c.createGain(), createBiquadFilter: () => c.createBiquadFilter(),
      createOscillator: () => watch(c.createOscillator()), createBufferSource: () => watch(c.createBufferSource()),
      createPeriodicWave: (re, im) => c.createPeriodicWave(re, im), createBuffer: (...a) => c.createBuffer(...a),
    },
  };
}
const paramsOf = v => ({ bright: v.bright, att: v.att, rel: v.rel, glide: v.glide, from: null });
function build(S, out, t, d, s) {
  const cap = {};
  captureNotes(cap);
  try { INST[s.voice.inst].play(S, out, t, d, mtof(s.m), s.vel, paramsOf(s.voice)); } finally { captureNotes(null); }
  return cap;
}

// how a spec is rendered: built once on a context never rendered, to hear how it sounds and ends
function plan(s, rate, probe) {
  const f = mtof(s.m), sources = { n: 0 };
  let end = 0;
  const cap = build(synthOn(probe, { onStop: t => { end = Math.max(end, t); }, sources }), probe.destination, 0, 1000, s);
  const p = { spec: s, rate, vib: cap.vib ?? null, takes: 1 };
  if (cap.held) {
    Object.assign(p, { held: true, a: cap.a, r: cap.r });
    const whole = s.maxDur + cap.r * 1.8 + 0.05;
    if (whole <= WHOLE) Object.assign(p, { len: whole, covers: s.maxDur });
    else {
      const loop = loopFrames(f, rate, Math.max(cap.a + cap.dc + 0.2, 0.8), LOOP[s.voice.inst] ?? LOOP_LEN);
      Object.assign(p, { loop, len: loop[1] / rate, covers: Infinity });
    }
  } else {
    // (damped at 1000 s in the probe: the earliest damping after the note's end, as an offset)
    const damp = (cap.damps ?? []).map(([at, tau]) => [at - 1000, tau]).sort((x, y) => x[0] - y[0])[0] ?? null;
    const after = damp ? damp[0] + damp[1] * 6 : 0, cut = damp ? s.maxDur + after : Infinity;
    const len = Math.min(end, cut, MAX_RING);
    // (one held longer than the sample damps it sounds live)
    Object.assign(p, { held: false, damp, len, covers: !damp || len >= end ? Infinity : len === cut ? s.maxDur : Math.max(0, len - after) });
    const env = cap.percs?.length === 1 ? cap.percs[0] : null;
    if (env && env.tau >= 0.25 && p.len > SHORT) {
      // (aligned to two periods: crystal's FM at 3.5 makes half-numbered partials)
      const loop = loopFrames(f / 2, rate, Math.max(0.4, env.at + env.tau), RING_LOOP);
      Object.assign(p, { env, loop, len: loop[1] / rate, covers: Infinity });
      return p;
    }
    if (damp) {   // on top of the loudest partial's own decay, damping as the synth's does in its place
      const own = cap.percs.reduce((x, y) => (y.peak > x.peak ? y : x)).tau;
      if (own > damp[1] * 1.05) p.damp = [damp[0], damp[1] * own / (own - damp[1])];
    }
    if (sources.n > 0 && p.len <= SHORT) p.takes = TAKES;   // (noise or a plucked string in it)
  }
  return p;
}

// render the plans (one rate) in one go into their entries
async function render(rate, plans) {
  const slot = p => Math.ceil((p.len + GAP) * rate);
  let frames = 0;
  for (const p of plans) { p.at = frames; frames += p.takes * slot(p); }
  const c = new OfflineAudioContext(1, frames + 1, rate);
  const waves = {};
  for (const p of plans) for (let k = 0; k < p.takes; k++) {
    const from = p.at + k * slot(p), t = from / rate, cut = t + p.len;
    const S = synthOn(c, { until: (from + slot(p)) / rate });
    S.waves = waves;   // (a plucked string gets a fresh start each take: S.ks)
    // a gate shut after the sample, before its sources stop: what rings on from their stopping
    // (filters) does not reach the next
    const gate = c.createGain();
    gate.gain.setValueAtTime(1, cut);
    gate.gain.linearRampToValueAtTime(0, cut + GAP / 4);
    gate.connect(c.destination);
    // a held note holds on past the end of its sample, a struck one is damped by the player
    build(S, gate, t, p.held ? p.len : 1000, p.spec);
  }
  const data = (await c.startRendering()).getChannelData(0);
  for (const p of plans) {
    const takes = [];
    for (let k = 0; k < p.takes; k++) {
      const from = p.at + k * slot(p);
      const y = data.slice(from, from + Math.ceil(p.len * rate));
      let n = y.length;
      if (p.env) {   // the envelope out, from its start: the player puts it back
        const a = Math.round(p.env.at * rate);
        for (let i = a; i < y.length; i++) y[i] *= Math.exp((i - a) / rate / p.env.tau);
      }
      if (p.loop) { crossfadeLoop(y, p.loop[0], p.loop[1], Math.min(Math.round(XFADE * rate), p.loop[0])); n = p.loop[1]; }
      else {
        if (!p.held) {   // the tail under QUIET
          let peak = 0;
          for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
          while (n > 1 && Math.abs(y[n - 1]) < peak * QUIET) n--;
        }
        const fade = Math.min(n, Math.round(0.008 * rate));
        for (let i = 0; i < fade; i++) y[n - 1 - i] *= i / fade;
      }
      const b = new AudioBuffer({ length: n, sampleRate: rate });
      b.copyToChannel(y.subarray(0, n), 0);
      takes.push(b);
    }
    const e = cache.get(p.spec.key);
    if (!e) continue;
    Object.assign(e, {
      takes, held: p.held, a: p.a, r: p.r, damp: p.damp, env: p.env, vib: p.vib, vel: p.spec.vel, covers: p.covers,
      loop: p.loop && [p.loop[0] / rate, p.loop[1] / rate], bytes: takes.reduce((sum, b) => sum + b.length * 4, 0),
    });
  }
}

// render the notes of `song` (or of a film's `events`) not in yet, at ctx's rate; the voices in
// `first` before the others (the mood the song starts in)
export function prepareSamples(ctx, song, { events = null, first = null } = {}) {
  if (typeof OfflineAudioContext === 'undefined' || typeof AudioBuffer === 'undefined') return Promise.resolve();
  const specs = noteSpecs(song, events), todo = [];
  for (const s of specs.values()) {
    const e = cache.get(s.key);
    if (e && (e.takes === null || s.maxDur <= Math.max(e.covers, e.asked))) { e.used = ++stamp; continue; }
    cache.set(s.key, { takes: null, covers: 0, asked: s.maxDur, used: ++stamp, bytes: 0 });
    todo.push(s);
  }
  if (!todo.length) return Promise.resolve();
  const firstOf = s => first && [...s.voices].some(v => first.has(v));
  todo.sort((x, y) => firstOf(y) - firstOf(x));
  const job = async () => {
    const full = ctx.sampleRate, probes = new Map();
    // (a rate the browser renders at: half, unless it cannot)
    const probeAt = rate => {
      if (!probes.has(rate)) try { probes.set(rate, new OfflineAudioContext(1, 1, rate)); } catch { probes.set(rate, null); }
      return probes.get(rate);
    };
    let batch = [], seconds = 0;
    const flush = async () => {
      const byRate = new Map();
      for (const p of batch) (byRate.get(p.rate) ?? byRate.set(p.rate, []).get(p.rate)).push(p);
      batch = []; seconds = 0;
      for (const [rate, plans] of byRate) await render(rate, plans);
    };
    try {
      for (const s of todo) {
        let rate = mtof(s.m) * (TOP[s.voice.inst] ?? TOP_DEFAULT) < HALF_TOP ? full / 2 : full;
        if (!probeAt(rate)) rate = full;
        const p = plan(s, rate, probeAt(rate));
        batch.push(p); seconds += p.takes * (p.len + GAP);
        if (seconds >= BATCH) await flush();
      }
      if (batch.length) await flush();
    } catch (e) {
      for (const s of todo) if (cache.get(s.key)?.takes === null) cache.delete(s.key);   // played live, tried again next time
      console.warn(`sample render: ${e.message}`);
    }
    evict(new Set(specs.keys()));
  };
  return (queue = queue.then(job));
}

// keep within BUDGET: the least recently used samples first, never the ones `keep` needs
function evict(keep) {
  let total = 0;
  for (const e of cache.values()) total += e.bytes;
  if (total <= BUDGET) return;
  const old = [...cache].filter(([k, e]) => e.takes && !keep.has(k)).sort((x, y) => x[1].used - y[1].used);
  for (const [k, e] of old) {
    if (total <= BUDGET) break;
    cache.delete(k); total -= e.bytes;
  }
}

// play the note event `ev` of session `sess` (synth.js) at time t from samples; false if any of
// its notes is not in (the synth plays it then)
export function playSampled(ctx, sess, ev, t) {
  if (!enabled || !ev.m) return false;
  const c = sess.ch[ev.v];
  if (!c || c.v.drum) return false;
  const n = ev.m.length, vs = ev.vel / Math.sqrt(n);
  const entries = ev.m.map(m => cache.get(keyOf(c.v, m, vs)));
  if (entries.some(e => !e?.takes || ev.d > e.covers)) return false;
  ev.m.forEach((m, i) => {
    const glide = i === n - 1 && ev.g != null ? mtof(ev.g) / mtof(m) : null;
    note(ctx, sess, c, entries[i], keyOf(c.v, m, vs), t, ev.d, vs, glide);
  });
  return true;
}

function note(ctx, sess, c, e, key, t, d, vs, glide) {
  e.used = ++stamp;
  let k = Math.floor(Math.random() * e.takes.length);
  if (e.takes.length > 1 && k === lastTake.get(key)) k = (k + 1) % e.takes.length;
  lastTake.set(key, k);
  const buf = e.takes[k], src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf;
  if (e.loop) { src.loop = true; src.loopStart = e.loop[0]; src.loopEnd = e.loop[1]; }
  const level = vs / e.vel;
  g.gain.value = 0;
  g.gain.setValueAtTime(level, t);
  let rel, end;
  if (e.held) {   // the synth's adsr release
    rel = t + Math.max(d, e.a + 0.003);
    g.gain.setTargetAtTime(0, rel, Math.max(0.002, e.r / 4));
    end = rel + e.r * 1.8 + 0.03;
  } else {
    const ring = e.env ? t + e.env.at + e.env.tau * 7 : t + buf.duration;   // (one looping rings as long as its envelope)
    if (e.env) g.gain.setTargetAtTime(0, t + e.env.at, e.env.tau);
    rel = e.damp ? t + d + e.damp[0] : ring;
    if (e.damp) g.gain.setTargetAtTime(0, rel, e.damp[1]);
    end = e.damp ? Math.min(ring, rel + e.damp[1] * 7) : ring;
  }
  if (glide) {
    src.playbackRate.setValueAtTime(glide, t);
    src.playbackRate.exponentialRampToValueAtTime(1, t + (c.v.glide ?? 0.07));
  }
  src.connect(g).connect(c.input);
  if (e.vib && src.detune) vibrato(ctx, c.input, src, e.vib, t);
  src.start(t);
  src.stop(end);
  admit(ctx, sess, { start: t, rel, end, g, src });
}

// a voice's vibrato: one slow oscillator into the detune of its notes, each through a gain that
// rises after the instrument's delay, as the synth's per-note one did
function vibrato(ctx, input, src, { rate, depth, delay, rise }, t) {
  let l = lfos.get(input);
  if (!l) {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    osc.start();
    lfos.set(input, l = { osc, users: 0 });
  }
  l.users++;
  const vg = ctx.createGain();
  vg.gain.value = 0;
  vg.gain.setValueAtTime(0, t + delay);
  vg.gain.linearRampToValueAtTime(depth, t + delay + rise);
  l.osc.connect(vg).connect(src.detune);
  src.onended = () => {
    l.osc.disconnect(vg);
    if (--l.users === 0 && lfos.get(input) === l) { l.osc.stop(); lfos.delete(input); }
  };
}

// at most CAP notes of a session at once: one more lets the one going longest go, a fading one first
function admit(ctx, sess, n) {
  const now = ctx.currentTime;
  const list = (playing.get(sess) ?? []).filter(x => x.end > now);
  playing.set(sess, list);
  const over = list.filter(x => x.start <= n.start && x.end > n.start);
  if (over.length >= CAP) {
    const victim = over.sort((x, y) => (x.rel > n.start) - (y.rel > n.start) || x.start - y.start)[0];
    victim.g.gain.cancelScheduledValues(n.start);
    victim.g.gain.setTargetAtTime(0, n.start, STEAL);
    try { victim.src.stop(n.start + STEAL * 6); } catch { /* (it had stopped) */ }
    victim.end = n.start + STEAL * 6;
    stolen++;
  }
  list.push(n);
}

// let every sample go (checks)
export function forgetSamples() { for (const [k, e] of cache) if (e.takes) cache.delete(k); }

// for checks and the dev tools: the samples in, their memory, the notes playing
export function sampleInfo(sess = null) {
  let notes = 0, takes = 0, bytes = 0, rendering = 0;
  const instruments = {};
  for (const [key, e] of cache) {
    if (!e.takes) { rendering++; continue; }
    notes++; takes += e.takes.length; bytes += e.bytes;
    const inst = key.split('|')[0];
    instruments[inst] = +((instruments[inst] ?? 0) + e.bytes / 1e6).toFixed(2);
  }
  return { enabled, notes, takes, rendering, mb: +(bytes / 1e6).toFixed(1), instruments, stolen, sounding: sess ? (playing.get(sess) ?? []).length : undefined };
}
