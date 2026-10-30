// Continuous sounds, generated like the rest: two drones the game tunes every frame (`charge`:
// standing in a well or ring, `cast`: reading the town portal scroll) and the ambient beds
// (water, waterfalls, lava, acid, wind, cave air) plus single drips and lava pops, on the ambience's
// bus (its own volume in the settings). Levels glide to their targets, so the game just says how
// much of each it wants (game/ambience.js).
// A bed or drone is only built while it is wanted: the audio thread works on every node that
// runs, heard or not, so one silent for IDLE seconds is stopped and taken apart again.
import { onAudioStart } from './context.js';

let ctx = null, bus = null, ambient = null, noiseBuf = null;
const AMBIENT = 0.6;   // the beds, drips and pops under the drones
const IDLE = 3;        // s at level 0 before a bed's or drone's nodes are stopped (the fade takes ~2)
const BED_GAIN = { water: 0.5, falls: 0.35, lava: 0.7, acid: 0.25, wind: 0.4, cave: 0.5 };

// the drones into the sounds' bus, the beds, drips and pops into the ambience's (its own volume in
// the settings: audio/context.js)
onAudioStart((ac, sounds, music, voice, ambience) => {
  ctx = ac;
  bus = ctx.createGain(); bus.gain.value = 0.5;
  bus.connect(sounds);
  ambient = ctx.createGain(); ambient.gain.value = 0.5 * AMBIENT;
  ambient.connect(ambience);
  noiseBuf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
});

// how each bed is made from a looping noise source n
const BEDS = {
  water: n => { const f = biquad('bandpass', 700, 0.5); lfo(0.3, 150, f.frequency); return chain(n, f, biquad('lowpass', 2500, 0.7)); },
  falls: n => chain(n, biquad('highpass', 900, 0.7), biquad('lowpass', 5000, 0.7)),
  lava: n => chain(n, biquad('lowpass', 180, 2)),
  acid: n => tremolo(chain(n, biquad('highpass', 3500, 0.7)), 9),
  wind: n => { const f = biquad('bandpass', 500, 1.2); lfo(0.13, 250, f.frequency); return gusts(chain(n, f), 0.07); },
  cave: n => chain(n, biquad('lowpass', 300, 0.7)),
};
// the drones: oscillators at `ratios` of one pitch through a low-pass; trem: a shimmer rate
const DRONES = { charge: { ratios: [1, 1.005, 2], type: 'triangle', cutoff: 1800 }, cast: { ratios: [1, 1.5, 2.01], type: 'sine', cutoff: 2500, trem: 6 } };
const live = {};   // name -> { g (its gain), sources (to stop), oscs (drones: [osc, ratio]), target, quiet (since when at 0) }

let started = null;   // the sources a sound being built starts (to stop them when it goes)
const begin = src => { src.start(); started.push(src); return src; };
const biquad = (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
// connect a -> b -> ... and return the last; the first may be a source
function chain(...nodes) { for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]); return nodes.at(-1); }
// a slow oscillator moving `param` by +-depth
function lfo(freq, depth, param) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = depth;
  o.connect(g).connect(param); begin(o);
}
// a gain pulsing at `rate` (fizz) / swelling slowly (gusts)
function tremolo(node, rate, depth = 0.5) { const g = ctx.createGain(); g.gain.value = 1 - depth; lfo(rate, depth, g.gain); return chain(node, g); }
const gusts = (node, rate) => tremolo(node, rate, 0.45);

// a looping noise source shaped by build(source) -> node, faded by its own gain
function bed(build) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  src.start(0, Math.random() * 2); started.push(src);
  const g = ctx.createGain(); g.gain.value = 0;
  chain(build(src), g, ambient);
  return { g };
}

function drone({ ratios, type, cutoff, trem = 0 }, pitch) {
  const f = biquad('lowpass', cutoff, 0.7), g = ctx.createGain(), oscs = [];
  g.gain.value = 0;
  chain(trem ? tremolo(f, trem, 0.3) : f, g, bus);
  for (const [i, r] of ratios.entries()) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = i ? 'sine' : type; o.frequency.value = pitch * r; og.gain.value = 1 / (i + 1.5);
    o.connect(og).connect(f); begin(o);
    oscs.push([o, r]);
  }
  return { g, oscs };
}

function build(name, make) {
  started = [];
  const s = make();
  s.sources = started; s.target = 0; s.quiet = null;
  started = null;
  return (live[name] = s);
}
function takeDown(name) {
  const s = live[name];
  for (const src of s.sources) src.stop();
  s.g.disconnect();
  delete live[name];
}

const glide = (param, v, tau) => param.setTargetAtTime(v, ctx.currentTime, tau);
const ready = () => ctx && ctx.state === 'running';

// glide sound `name` to `v` (building it first with make() when it is wanted); a sound held at
// 0 for IDLE seconds goes
function steer(name, v, tau, make) {
  let s = live[name];
  if (v > 0 && !s) s = build(name, make);
  if (!s) return null;
  if (v !== s.target) { glide(s.g.gain, v, tau); s.target = v; }
  if (v > 0) s.quiet = null;
  else if (s.quiet === null) s.quiet = ctx.currentTime;
  else if (ctx.currentTime - s.quiet > IDLE) { takeDown(name); return null; }
  return s;
}

// levels 0..1 per bed (missing: 0)
export function setAmbience(levels) {
  if (!ready()) return;
  for (const k in BEDS) steer(k, (levels[k] ?? 0) * BED_GAIN[k], 0.4, () => bed(BEDS[k]));
}

// drone `name` (charge, cast): level 0..1, pitch in Hz
export function setDrone(name, level, pitch) {
  if (!ready()) return;
  const d = steer(name, level * 0.18, level > 0 ? 0.05 : 0.08, () => drone(DRONES[name], pitch));
  if (d && level > 0) for (const [o, r] of d.oscs) glide(o.frequency, pitch * r, 0.05);
}

// the sounds running right now (checks and the dev tools)
export const runningLoops = () => Object.keys(live);

// one water drop in a cave (level: loudness)
export function drip(level = 1) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01, hz = 1400 + Math.random() * 1600, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.05);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * level, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(ambient); o.start(t); o.stop(t + 0.15);
}

// one bubble bursting on lava
export function pop(level = 1) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01, hz = 90 + Math.random() * 120, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 2.5, t + 0.05);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(ambient); o.start(t); o.stop(t + 0.12);
}
