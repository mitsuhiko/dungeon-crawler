// Generated footsteps, stylized and synthetic like the other sound effects (sfx.js): one
// recipe per surface, built from a heel thump, noise (swishes, grains of crunch, squelches)
// and tones (knocks, pings, clanks). Steps come several times a second, so nothing is
// synthesized per step: when audio starts every surface is rendered once into a few variants
// per gait (walk, run, land) and a step plays one of them, a little detuned, alternating feet.
// When the player steps and on what: game/footsteps.js, core/footing.js.
import { mulberry32 } from '../core/util.js';
import { SURFACES } from '../core/footing.js';
import { LADDER_STYLES } from '../themes/builds.js';
import { onAudioStart } from './context.js';

export const GAITS = { walk: 0.6, run: 1, land: 1.6 };   // how hard the foot comes down
const PEAK = { walk: 0.45, run: 0.6, land: 0.85 };       // loudest variant of each gait
const TRIM = { grass: 0.85, snow: 0.85, ice: 0.8, iron: 0.75, rope: 0.9, ladder: 0.8, 'ladder-rope': 0.75, 'ladder-vine': 0.7, 'ladder-iron': 0.7, 'ladder-stone': 0.75 };   // per-surface level
export const STEP_LEVEL = 0.3;   // all footsteps, into the sounds' bus
const VARIANTS = 6, SLOT = 0.8;   // variants per surface and gait; seconds rendered for each

// building blocks on context c (an OfflineAudioContext while rendering)
function kit(c, R) {
  const noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
  const amp = (t, attack, peak, decay, out) => {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  };
  const noise = (t, dur, into) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf; s.connect(into);
    s.start(t, R() * 0.5, dur + 0.05);
  };
  const filter = (type, freq, q, into) => {
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(into);
    return f;
  };
  const tone = (type, f0, f1, t, dur, into) => {
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(into); o.start(t); o.stop(t + dur + 0.05);
  };
  const thump = (t, f0, f1, dur, level, out) => tone('sine', f0, f1, t, dur, amp(t, 0.002, level, dur, out));
  // n tiny band-passed noise bursts scattered over `spread` seconds, front-loaded: crunch
  const grains = (t, n, spread, lo, hi, q, level, out) => {
    for (let i = 0; i < n; i++) {
      const at = t + R() ** 1.6 * spread, f = lo * (hi / lo) ** R();
      noise(at, 0.02, filter('bandpass', f, q, amp(at, 0.001, level * (1 - 0.5 * i / n) * (0.6 + 0.4 * R()), 0.006 + R() * 0.012, out)));
    }
  };
  return { amp, noise, filter, tone, thump, grains };
}

// recipe(k, t, out, w, R): w = how hard the foot comes down (GAITS), R = this variant's random
const RECIPES = {
  grass(k, t, out, w) {     // a padded thump under a muffled rustle sweeping down
    k.thump(t, 100, 50, 0.08, 0.5 * w, out);
    const lp = k.filter('lowpass', 1100, 0.5, k.amp(t, 0.02, 0.45 * w, 0.08 + 0.04 * w, out));
    const f = k.filter('bandpass', 900, 0.5, lp);
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.1);
    k.noise(t, 0.14, f);
  },
  dirt(k, t, out, w) {      // a dull, muffled thud with a little grit
    k.thump(t, 150, 55, 0.08, 0.7 * w, out);
    k.noise(t, 0.08, k.filter('lowpass', 700, 0.9, k.amp(t, 0.003, 0.55 * w, 0.07, out)));
    k.grains(t + 0.005, 3, 0.03, 500, 1400, 2, 0.25 * w, out);
  },
  gravel(k, t, out, w) {    // a crunch of bright grains over a light thud
    k.thump(t, 130, 60, 0.06, 0.45 * w, out);
    k.grains(t, Math.round(6 + 5 * w), 0.05 + 0.02 * w, 1500, 5500, 3, 0.5, out);
    k.noise(t, 0.05, k.filter('lowpass', 1200, 0.7, k.amp(t, 0.002, 0.25 * w, 0.04, out)));
  },
  snow(k, t, out, w, R) {   // dense soft grains with a tiny synthetic squeak
    k.thump(t, 100, 55, 0.07, 0.3 * w, out);
    k.grains(t, Math.round(12 + 8 * w), 0.08 + 0.03 * w, 1200, 3200, 4, 0.35, out);
    k.noise(t, 0.12, k.filter('lowpass', 2500, 0.7, k.amp(t, 0.02, 0.2 * w, 0.09, out)));
    const s = 1050 + R() * 200, at = t + 0.02 + R() * 0.02;
    k.tone('square', s, s * 1.2, at, 0.05, k.filter('lowpass', 2500, 1, k.amp(at, 0.005, 0.04 * w, 0.05, out)));
  },
  ice(k, t, out, w, R) {    // a hard click and a glassy ping
    k.thump(t, 200, 90, 0.04, 0.35 * w, out);
    k.noise(t, 0.012, k.filter('highpass', 3500, 0.7, k.amp(t, 0.001, 0.4 * w, 0.008, out)));
    const f = 2400 * (0.9 + 0.2 * R()), ring = 0.12 + 0.05 * w;
    k.tone('triangle', f, f * 0.99, t, ring, k.amp(t, 0.002, 0.18 * w, ring, out));
    k.tone('sine', f * 2.76, f * 2.74, t, ring / 2, k.amp(t, 0.002, 0.08 * w, ring / 2, out));
  },
  mud(k, t, out, w, R) {    // a resonant squelch sweeping down, then a little sucking pop
    k.thump(t, 90, 45, 0.1, 0.6 * w, out);
    const f = k.filter('lowpass', 1400, 8, k.amp(t, 0.008, 0.6 * w, 0.14, out));
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.12);
    k.noise(t, 0.16, f);
    const at = t + 0.09 + 0.03 * R();
    k.tone('sine', 280, 620, at, 0.035, k.amp(at, 0.002, 0.12 * w, 0.035, out));
  },
  slime(k, t, out, w, R) {  // a wet, sticky squelch, then the foot pulled out with a gloop
    k.thump(t, 80, 40, 0.11, 0.55 * w, out);
    const f = k.filter('lowpass', 1100, 10, k.amp(t, 0.012, 0.55 * w, 0.16, out));
    f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.14);
    k.noise(t, 0.18, f);
    const at = t + 0.12 + 0.04 * R(), p = 220 + 60 * R();
    k.tone('sine', p, p * 2.4, at, 0.05, k.amp(at, 0.004, 0.16 * w, 0.05, out));
    k.tone('sine', p * 1.5, p * 3, at + 0.03, 0.03, k.amp(at + 0.03, 0.003, 0.06 * w, 0.03, out));
  },
  stone(k, t, out, w) {     // a dry click and a short "tok"
    k.thump(t, 170, 80, 0.045, 0.55 * w, out);
    k.noise(t, 0.03, k.filter('bandpass', 2000, 1.4, k.amp(t, 0.001, 0.45 * w, 0.025, out)));
    k.tone('triangle', 750, 700, t, 0.04, k.amp(t, 0.001, 0.15 * w, 0.04, out));
  },
  wood(k, t, out, w, R, pitch = 1) {   // a hollow knock: two short modes over a click
    k.thump(t, 140, 70, 0.06, 0.5 * w, out);
    const f = 230 * pitch * (0.94 + 0.12 * R());
    k.tone('triangle', f, f * 0.97, t, 0.11, k.amp(t, 0.002, 0.35 * w, 0.11, out));
    k.tone('sine', f * 2.3, f * 2.25, t, 0.07, k.amp(t, 0.002, 0.18 * w, 0.07, out));
    k.noise(t, 0.02, k.filter('lowpass', 2500, 0.7, k.amp(t, 0.001, 0.3 * w, 0.015, out)));
  },
  rope(k, t, out, w, R) {   // lighter, higher planks, and mostly a creak of the ropes
    RECIPES.wood(k, t, out, w * 0.8, R, 1.2);
    if (R() < 0.35 && w < 1.5) return;
    const at = t + 0.03 + 0.02 * R(), f = 110 + 30 * R();
    k.tone('sawtooth', f, f * 0.82, at, 0.16, k.filter('bandpass', 1100, 4, k.amp(at, 0.03, 0.12 * w, 0.14, out)));
  },
  iron(k, t, out, w, R) {   // a clank: inharmonic partials ringing on, struck by a click
    k.thump(t, 160, 70, 0.05, 0.4 * w, out);
    k.noise(t, 0.015, k.filter('highpass', 2500, 0.7, k.amp(t, 0.001, 0.3 * w, 0.01, out)));
    const f = 380 * (0.95 + 0.1 * R()), long = 0.7 + 0.3 * w;
    [[1, 0.4, 0.2], [2.69, 0.25, 0.14], [4.67, 0.16, 0.1], [6.83, 0.1, 0.06]].forEach(([m, decay, level]) =>
      k.tone('sine', f * m, f * m * 0.998, t, decay * long, k.amp(t, 0.001, level * w, decay * long, out)));
  },
  ladder(k, t, out, w, R) {   // a rung: a dry, high knock, the slap of a hand or boot, now and then a creak
    k.thump(t, 120, 70, 0.04, 0.25 * w, out);
    const f = 330 * (0.94 + 0.12 * R());
    k.tone('triangle', f, f * 0.97, t, 0.07, k.amp(t, 0.002, 0.3 * w, 0.07, out));
    k.tone('sine', f * 2.6, f * 2.5, t, 0.04, k.amp(t, 0.002, 0.12 * w, 0.04, out));
    k.noise(t, 0.025, k.filter('bandpass', 1400, 1.2, k.amp(t, 0.001, 0.35 * w, 0.02, out)));
    if (R() < 0.7) return;
    const at = t + 0.03, c = 140 + 20 * R();
    k.tone('sawtooth', c, c * 0.88, at, 0.12, k.filter('bandpass', 900, 5, k.amp(at, 0.02, 0.08 * w, 0.1, out)));
  },
  'ladder-rope'(k, t, out, w, R) {   // a softer, lower knock on a swinging rung, and the ropes creaking
    k.thump(t, 100, 60, 0.05, 0.25 * w, out);
    const f = 260 * (0.94 + 0.12 * R());
    k.tone('triangle', f, f * 0.96, t, 0.05, k.amp(t, 0.002, 0.2 * w, 0.05, out));
    k.noise(t, 0.03, k.filter('lowpass', 1200, 0.8, k.amp(t, 0.002, 0.25 * w, 0.025, out)));
    if (R() < 0.4) return;
    const at = t + 0.02 + 0.03 * R(), c = 120 + 40 * R();
    k.tone('sawtooth', c, c * 0.8, at, 0.18, k.filter('bandpass', 1000, 5, k.amp(at, 0.04, 0.1 * w, 0.15, out)));
  },
  'ladder-vine'(k, t, out, w, R) {   // a rustle of leaves and a soft creak of the stems
    k.thump(t, 90, 55, 0.05, 0.2 * w, out);
    const f = k.filter('bandpass', 2200, 0.8, k.amp(t, 0.01, 0.35 * w, 0.1 + 0.03 * w, out));
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    k.noise(t, 0.14, f);
    k.grains(t + 0.01, 4, 0.06, 1800, 4000, 3, 0.15 * w, out);
    if (R() < 0.6) return;
    const at = t + 0.03, c = 180 + 40 * R();
    k.tone('sawtooth', c, c * 0.9, at, 0.08, k.filter('bandpass', 1300, 6, k.amp(at, 0.02, 0.05 * w, 0.07, out)));
  },
  'ladder-iron'(k, t, out, w, R) {   // a short clank of a rung: the iron step's partials, damped by the hand
    k.thump(t, 150, 80, 0.035, 0.25 * w, out);
    k.noise(t, 0.012, k.filter('highpass', 3000, 0.7, k.amp(t, 0.001, 0.25 * w, 0.008, out)));
    const f = 560 * (0.95 + 0.1 * R());
    [[1, 0.18, 0.16], [2.69, 0.12, 0.1], [4.67, 0.08, 0.06]].forEach(([m, decay, level]) =>
      k.tone('sine', f * m, f * m * 0.998, t, decay, k.amp(t, 0.001, level * w, decay, out)));
  },
  'ladder-stone'(k, t, out, w, R) {   // a scuff of grit in a hold of rock, now and then the chain jingling
    k.thump(t, 160, 80, 0.04, 0.3 * w, out);
    k.grains(t, Math.round(4 + 3 * w), 0.05, 900, 3500, 2.5, 0.35 * w, out);
    k.noise(t, 0.05, k.filter('bandpass', 1600, 1, k.amp(t, 0.003, 0.2 * w, 0.04, out)));
    if (R() < 0.6) return;
    for (let i = 0; i < 3; i++) {
      const at = t + 0.03 + i * (0.02 + 0.02 * R()), f = 2600 + 1800 * R();
      k.tone('sine', f, f, at, 0.05, k.amp(at, 0.001, 0.04 * w, 0.05, out));
    }
  },
};
// what is rendered: the ground's surfaces and the ladders' rungs and holds (hands: walk, feet: run)
export const STEP_SOUNDS = [...SURFACES, ...new Set(Object.values(LADDER_STYLES).map(s => s.sound))];

// Render all variants of one surface and gait (sample rate sr): [Float32Array] at the gait's level; exported for checks
export async function renderSteps(surface, gait, sr = 44100, seed = 1) {
  const c = new OfflineAudioContext(1, Math.ceil(VARIANTS * SLOT * sr), sr);
  const R = mulberry32(seed * 7919 + STEP_SOUNDS.indexOf(surface) * 131 + Object.keys(GAITS).indexOf(gait));
  const k = kit(c, R), w = GAITS[gait];
  for (let v = 0; v < VARIANTS; v++) {
    const t = v * SLOT + 0.002;
    RECIPES[surface](k, t, c.destination, w, R);
    if (gait === 'land') k.thump(t, 80, 40, 0.12, 0.5, c.destination);   // the body landing
  }
  const data = (await c.startRendering()).getChannelData(0), n = Math.round(SLOT * sr);
  const out = [];
  let peak = 0;
  for (let v = 0; v < VARIANTS; v++) {
    const s = data.subarray(v * n, (v + 1) * n);
    let end = s.length;
    while (end > 0 && Math.abs(s[end - 1]) < 1e-4) end--;   // drop the silent tail
    const clip = s.slice(0, Math.max(end, 1));
    for (const x of clip) peak = Math.max(peak, Math.abs(x));
    out.push(clip);
  }
  const g = peak > 0 ? PEAK[gait] * (TRIM[surface] ?? 1) / peak : 0;
  for (const clip of out) for (let i = 0; i < clip.length; i++) clip[i] *= g;
  return out;
}

let ctx = null, bus = null;
const banks = {}, last = {};
let foot = 0;
const R = mulberry32(0x5735);

onAudioStart((ac, output) => {
  ctx = ac;
  bus = ctx.createGain(); bus.gain.value = STEP_LEVEL;
  bus.connect(output);
  for (const s of STEP_SOUNDS) for (const g of Object.keys(GAITS)) renderSteps(s, g, ctx.sampleRate).then(clips => {
    banks[`${s}/${g}`] = clips.map(clip => {
      const b = ctx.createBuffer(1, clip.length, ctx.sampleRate);
      b.copyToChannel(clip, 0);
      return b;
    });
  });
});

// One footfall on `surface` (SURFACES or a ladder's sound, LADDER_STYLES) at `gait` (walk, run, land). pan: -1..1.
// Which variant played (renderSteps' order), or -1
export function footstep(surface, gait = 'walk', { volume = 1, pan = 0 } = {}) {
  const bank = banks[`${surface}/${gait}`];
  if (!ctx || ctx.state !== 'running' || !bank) return -1;
  const key = `${surface}/${gait}`;
  let v = Math.floor(R() * bank.length);
  if (v === last[key]) v = (v + 1) % bank.length;   // never the same variant twice in a row
  last[key] = v;
  foot ^= 1;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = bank[v];
  src.playbackRate.value = (foot ? 1.03 : 0.97) * (0.97 + R() * 0.06);   // left / right foot
  g.gain.value = volume * (0.85 + R() * 0.3);
  let node = src.connect(g);
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(bus);
  src.start();
  return v;
}
