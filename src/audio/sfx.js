// Generated sound effects (Web Audio, no sample files): a sword whoosh, a flail's, a bow's draw and twang,
// a crossbow's shot and reload, a spell's cast and burst, shots striking walls, hits, kills,
// getting hurt, blocks, pickups, thrown fireballs / punches / ice balls and burning, lasers, storms, lightning and thunder, the player's body (jumps,
// falls, knock-downs, fluid deaths), travel, items and the bag, and the enemies' voices
// (voices.js). Footsteps are footsteps.js, the continuous sounds loops.js. The audio context
// lives in context.js. Nothing here knows the camera: the game says how a place in the world
// pans (setPanner, main.js), so tools/player.html plays these without the renderer.
import { onAudioStart } from './context.js';
import { voices } from './voices.js';

const NOISE = 3;   // seconds of noise: a layer may last up to NOISE - 0.5 s
const LEVEL = 0.45;   // all effects, before the limiter

let ctx = null, master = null, noiseBuf = null;
let panner = null;    // at {x,y,z} -> pan (-1..1), from the game
const last = {};
let combo = 0, comboAt = 0;

// the effects' bus on context c, into output: their level and a gentle limiter, so many hits at
// once do not clip
function effectsBus(c, output) {
  const g = c.createGain(); g.gain.value = LEVEL;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 6;
  g.connect(comp).connect(output);
  return g;
}
function noiseOn(c) {
  const b = c.createBuffer(1, NOISE * c.sampleRate, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

onAudioStart((ac, output) => {
  ctx = ac;
  master = effectsBus(ctx, output);
  noiseBuf = noiseOn(ctx);
});

// how a place in the world pans: fn(at) -> -1 (left) .. 1 (right)
export function setPanner(fn) { panner = fn; }

// building blocks: a gain envelope, noise and pitch-swept oscillators
// learn: sound.html#coin-code (see learn/README.md)
function amp(t, attack, peak, decay, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}
function noise(t, dur, into) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.connect(into);
  s.start(t, Math.random() * 0.5, dur + 0.05);
}
function filter(type, freq, q, into) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q; f.connect(into);
  return f;
}
function tone(type, f0, f1, t, dur, into) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(into); o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  swing(t, out, p) {   // band-passed noise sweeping up and back down
    const f = filter('bandpass', 500 * p, 0.9, amp(t, 0.04, 1.3, 0.17, out));
    f.frequency.setValueAtTime(500 * p, t);
    f.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.07);
    f.frequency.exponentialRampToValueAtTime(800 * p, t + 0.21);
    noise(t, 0.24, f);
  },
  flail(t, out, p) {   // a flail swung round: a deep, slow whoosh, its chain rattling
    const f = filter('bandpass', 260 * p, 0.8, amp(t, 0.08, 1.4, 0.26, out));
    f.frequency.setValueAtTime(260 * p, t);
    f.frequency.exponentialRampToValueAtTime(1300 * p, t + 0.14);
    f.frequency.exponentialRampToValueAtTime(420 * p, t + 0.34);
    noise(t, 0.36, f);
    for (let i = 0; i < 5; i++) {
      const at = t + 0.02 + i * 0.045 + Math.random() * 0.02, hz = (2800 + Math.random() * 1600) * p;
      tone('square', hz, hz * 0.9, at, 0.02, filter('highpass', 1800 * p, 1, amp(at, 0.001, 0.05, 0.03, out)));
    }
  },
  draw(t, out, p) {    // a bow being drawn: a creak of wood and a string stretching
    tone('sawtooth', 110 * p, 150 * p, t, 0.22, filter('bandpass', 700 * p, 6, amp(t, 0.06, 0.12, 0.18, out)));
    noise(t, 0.2, filter('bandpass', 2400 * p, 4, amp(t, 0.08, 0.1, 0.12, out)));
  },
  twang(t, out, p) {   // a bowstring let go: a plucked low note and the arrow's hiss leaving
    tone('triangle', 196 * p, 180 * p, t, 0.25, amp(t, 0.001, 0.55, 0.25, out));
    tone('sine', 392 * p, 370 * p, t, 0.15, amp(t, 0.001, 0.2, 0.15, out));
    sweep(t + 0.01, 0.18, 3000 * p, 4200 * p, 1800 * p, 1.5, 0.35, out, 0.01);
  },
  crossbow(t, out, p) {   // a crossbow shot: the nut's click, a heavy snap of the prod, the bolt's hiss
    tone('square', 2400 * p, 1800 * p, t, 0.015, amp(t, 0.001, 0.15, 0.015, out));
    tone('sine', 150 * p, 70 * p, t + 0.01, 0.14, amp(t + 0.01, 0.001, 0.8, 0.14, out));
    noise(t + 0.01, 0.06, filter('bandpass', 900 * p, 1.5, amp(t + 0.01, 0.001, 0.6, 0.06, out)));
    sweep(t + 0.02, 0.14, 3500 * p, 5000 * p, 2200 * p, 1.5, 0.3, out, 0.01);
  },
  reload(t, out, p) {     // the string drawn back to the nut and a bolt laid in: a ratchet and a click
    for (let i = 0; i < 4; i++)
      tone('square', 1500 * p, 1300 * p, t + i * 0.05, 0.012, filter('bandpass', 1800, 3, amp(t + i * 0.05, 0.001, 0.12, 0.012, out)));
    tone('triangle', 900 * p, 700 * p, t + 0.24, 0.05, amp(t + 0.24, 0.001, 0.3, 0.05, out));
    noise(t + 0.24, 0.04, filter('lowpass', 1500, 0.7, amp(t + 0.24, 0.001, 0.25, 0.04, out)));
  },
  spell(t, out, p) {      // a spell leaving the staff: a rising shimmer over a soft whoosh
    sweep(t, 0.3, 400 * p, 1800 * p, 900 * p, 1.2, 0.45, out, 0.04);
    for (const [i, hz] of [660, 880, 1320].entries())
      tone('sine', hz * p, hz * p * 1.5, t + i * 0.03, 0.25, amp(t + i * 0.03, 0.01, 0.12, 0.25, out));
  },
  thunk(t, out, p) {      // an arrow or bolt striking wood or stone: a short knock and a rattle
    tone('sine', 300 * p, 120 * p, t, 0.06, amp(t, 0.001, 0.6, 0.06, out));
    noise(t, 0.05, filter('bandpass', 1800 * p, 2, amp(t, 0.001, 0.4, 0.05, out)));
    tone('triangle', 420 * p, 380 * p, t + 0.01, 0.12, amp(t + 0.01, 0.002, 0.12, 0.12, out));
  },
  burst(t, out, p) {      // a spell bursting: a bright pop that fizzes out
    tone('sine', 520 * p, 130 * p, t, 0.18, amp(t, 0.002, 0.6, 0.18, out));
    noise(t, 0.3, filter('bandpass', 2600 * p, 0.8, amp(t, 0.004, 0.45, 0.28, out)));
    for (const [i, hz] of [1568, 2093, 2637].entries())
      tone('sine', hz * p, hz * p * 0.9, t + 0.02 + i * 0.03, 0.2, amp(t + 0.02 + i * 0.03, 0.002, 0.07, 0.2, out));
  },
  hit(t, out, p) {     // a thump, a body of noise and a bright crack
    tone('sine', 180 * p, 50 * p, t, 0.12, amp(t, 0.002, 0.8, 0.12, out));
    noise(t, 0.1, filter('lowpass', 2200 * p, 0.7, amp(t, 0.002, 0.7, 0.08, out)));
    noise(t, 0.04, filter('highpass', 3500, 0.7, amp(t, 0.001, 0.3, 0.03, out)));
  },
  kill(t, out, p) {    // deeper and longer, with a crunch
    tone('sine', 120 * p, 32 * p, t, 0.35, amp(t, 0.002, 1, 0.35, out));
    noise(t, 0.32, filter('lowpass', 900 * p, 0.7, amp(t, 0.003, 0.8, 0.3, out)));
    noise(t, 0.2, filter('bandpass', 320 * p, 3, amp(t, 0.002, 0.7, 0.18, out)));
    noise(t, 0.05, filter('highpass', 3000, 0.7, amp(t, 0.001, 0.35, 0.04, out)));
  },
  blur(t, out, p) {    // a blow through a blurry Flimmer: an airy flutter sweeping past, a faint wobbling ring
    sweep(t, 0.26, 1800 * p, 5200 * p, 1400 * p, 1.4, 0.55, out, 0.02);
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.045;
      noise(at, 0.03, filter('bandpass', (2600 + i * 500) * p, 5, amp(at, 0.002, 0.18, 0.025, out)));
    }
    tone('sine', 1400 * p, 1250 * p, t + 0.03, 0.22, amp(t + 0.03, 0.01, 0.08, 0.2, out));
  },
  hurt(t, out, p) {    // a dull grunt-like buzz over a thud
    tone('sawtooth', 260 * p, 120 * p, t, 0.18, filter('lowpass', 1000, 1, amp(t, 0.005, 0.3, 0.18, out)));
    tone('sine', 90 * p, 50 * p, t, 0.15, amp(t, 0.003, 0.7, 0.15, out));
    noise(t, 0.08, filter('lowpass', 700, 0.7, amp(t, 0.002, 0.4, 0.07, out)));
  },
  unlock(t, out, p) {   // rising chord: the red seal breaks
    for (const [i, hz] of [440, 554, 660, 880].entries()) {
      const at = t + i * .07;
      tone('triangle', hz * p, hz * p, at, .35, amp(at, .005, .25, .35, out));
    }
  },
  // learn: sound.html#coin-code (see learn/README.md)
  coin(t, out, p) {    // two quick bright notes; rapid pickups climb in pitch
    tone('triangle', 1568 * p, 1568 * p, t, 0.08, amp(t, 0.002, 0.32, 0.07, out));
    tone('triangle', 2093 * p, 2093 * p, t + 0.055, 0.2, amp(t + 0.055, 0.002, 0.3, 0.18, out));
  },
  fireball(t, out, p) {   // a breathy roar: low-passed noise swelling, with a low rumble
    const f = filter('lowpass', 600 * p, 1, amp(t, 0.06, 1, 0.35, out));
    f.frequency.setValueAtTime(400 * p, t); f.frequency.exponentialRampToValueAtTime(1800 * p, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(500 * p, t + 0.4);
    noise(t, 0.42, f);
    tone('sawtooth', 90 * p, 55 * p, t, 0.3, filter('lowpass', 300, 1, amp(t, 0.03, 0.35, 0.28, out)));
  },
  whump(t, out, p) {      // a fireball bursting: a soft thud and crackle
    tone('sine', 140 * p, 45 * p, t, 0.2, amp(t, 0.003, 0.8, 0.2, out));
    noise(t, 0.3, filter('bandpass', 1400 * p, 0.6, amp(t, 0.005, 0.6, 0.28, out)));
  },
  sizzle(t, out, p) {     // burning: hissing high noise
    noise(t, 0.22, filter('highpass', 3000 * p, 0.7, amp(t, 0.01, 0.35, 0.2, out)));
  },
  zap(t, out, p) {        // the Triangle's punch: a falling buzzy chirp
    tone('square', 900 * p, 160 * p, t, 0.22, filter('lowpass', 2400, 2, amp(t, 0.004, 0.25, 0.22, out)));
    tone('sine', 300 * p, 90 * p, t, 0.18, amp(t, 0.004, 0.5, 0.18, out));
  },
  shatter(t, out, p) {    // the punch landing: a glassy ping over a thump
    tone('triangle', 1760 * p, 1320 * p, t, 0.25, amp(t, 0.002, 0.25, 0.25, out));
    tone('sine', 160 * p, 60 * p, t, 0.15, amp(t, 0.002, 0.7, 0.15, out));
    noise(t, 0.08, filter('highpass', 2500, 0.7, amp(t, 0.001, 0.35, 0.07, out)));
  },
  frost(t, out, p) {      // an ice ball thrown: an airy whoosh with a cold, glassy shimmer on top
    const f = filter('bandpass', 900 * p, 1.2, amp(t, 0.04, 0.7, 0.3, out));
    f.frequency.setValueAtTime(700 * p, t); f.frequency.exponentialRampToValueAtTime(3200 * p, t + 0.25);
    noise(t, 0.34, f);
    for (const [i, hz] of [2637, 3520, 3136].entries()) {
      const at = t + 0.03 + i * 0.04;
      tone('sine', hz * p, hz * p * 0.98, at, 0.25, amp(at, 0.003, 0.08, 0.25, out));
    }
  },
  icecrack(t, out, p) {   // an ice ball bursting: a sharp crack, a thump and tinkling shards
    noise(t, 0.06, filter('highpass', 3500 * p, 0.8, amp(t, 0.001, 0.6, 0.06, out)));
    tone('sine', 180 * p, 70 * p, t, 0.12, amp(t, 0.002, 0.55, 0.12, out));
    for (let i = 0; i < 5; i++) {
      const at = t + 0.03 + i * 0.035 * (0.7 + Math.random() * 0.6), hz = (2200 + Math.random() * 2600) * p;
      tone('triangle', hz, hz * 0.97, at, 0.12, amp(at, 0.002, 0.12, 0.12, out));
    }
  },
  laser(t, out, p) {      // the Spicy's laser: a buzzing hum rising to a whine for its 0.6 s
    tone('sawtooth', 110 * p, 220 * p, t, 0.62, filter('bandpass', 900 * p, 2, amp(t, 0.04, 0.3, 0.58, out)));
    tone('square', 1650 * p, 2600 * p, t, 0.62, filter('lowpass', 3500, 1, amp(t, 0.08, 0.05, 0.54, out)));
    for (let i = 0; i < 6; i++) {   // and it crackles
      const at = t + 0.05 + i * 0.09 * (0.7 + Math.random() * 0.6);
      noise(at, 0.02, filter('highpass', 4000 * p, 1, amp(at, 0.001, 0.2, 0.02, out)));
    }
  },
  zapburst(t, out, p) {   // the laser bursting: a sharp electric pop, a falling zap and a thump
    noise(t, 0.12, filter('highpass', 2500 * p, 0.7, amp(t, 0.001, 0.7, 0.12, out)));
    tone('square', 1800 * p, 180 * p, t, 0.22, filter('lowpass', 3000, 1, amp(t, 0.002, 0.2, 0.22, out)));
    tone('sine', 190 * p, 50 * p, t, 0.25, amp(t, 0.002, 0.75, 0.25, out));
  },
  portal(t, out, p) {     // the town portal opening or taking you: a rising shimmer over a soft rush
    const f = filter('bandpass', 300 * p, 1.2, amp(t, 0.15, 0.6, 0.6, out));
    f.frequency.setValueAtTime(300 * p, t); f.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.6);
    noise(t, 0.75, f);
    for (const [i, hz] of [523, 659, 784, 1047].entries()) {
      const at = t + i * 0.08;
      tone('sine', hz * p, hz * p * 1.02, at, 0.5, amp(at, 0.01, 0.12, 0.5, out));
    }
  },
  pickup(t, out, p) {
    tone('sine', 660 * p, 990 * p, t, 0.1, amp(t, 0.004, 0.3, 0.1, out));
  },
  block(t, out, p) {     // a blow caught on a shield: a metal clang (inharmonic partials ringing out) over a thud
    for (const [hz, gain, dur] of [[520, 0.3, 0.35], [1310, 0.18, 0.28], [2270, 0.1, 0.2], [3480, 0.06, 0.12]])
      tone('triangle', hz * p, hz * p * 0.985, t, dur, amp(t, 0.001, gain, dur, out));
    tone('sine', 140 * p, 70 * p, t, 0.12, amp(t, 0.002, 0.6, 0.12, out));
    noise(t, 0.05, filter('bandpass', 3200, 1.2, amp(t, 0.001, 0.4, 0.05, out)));
  },
  drop(t, out, p) {      // a good weapon landing: a soft clink and a shimmering rising chime
    tone('triangle', 1200 * p, 900 * p, t, 0.06, amp(t, 0.001, 0.25, 0.06, out));
    for (const [i, hz] of [784, 988, 1175, 1568].entries()) {
      const at = t + 0.05 + i * 0.06;
      tone('sine', hz * p, hz * p * 1.005, at, 0.5, amp(at, 0.004, 0.16, 0.5, out));
    }
  },
  clink(t, out, p) {     // any other item landing: a small dull clink
    tone('triangle', 1400 * p, 1150 * p, t, 0.06, amp(t, 0.001, 0.2, 0.06, out));
    tone('sine', 2100 * p, 2000 * p, t + 0.01, 0.05, amp(t + 0.01, 0.001, 0.08, 0.05, out));
    noise(t, 0.03, filter('lowpass', 1200, 0.7, amp(t, 0.001, 0.15, 0.03, out)));
  },
  toss(t, out, p) {      // dropping an item from the bag: a little whoosh, then it lands
    sweep(t, 0.16, 500 * p, 1600 * p, 700 * p, 1.2, 0.35, out);
    tone('sine', 160 * p, 70 * p, t + 0.17, 0.08, amp(t + 0.17, 0.002, 0.4, 0.08, out));
  },

  // --- the player's body --------------------------------------------------------------------
  levelUp(t, out, p) {   // a bright rising arpeggio over a swelling sparkle
    for (const [i, hz] of [523, 659, 784, 1047, 1319].entries()) {
      const at = t + i * 0.07, last = i === 4;
      tone('triangle', hz * p, hz * p, at, last ? 0.9 : 0.35, amp(at, 0.005, 0.22, last ? 0.9 : 0.35, out));
      tone('sine', hz * 2 * p, hz * 2 * p, at, 0.3, amp(at, 0.005, 0.06, 0.3, out));
    }
    sweep(t, 0.9, 1000 * p, 6000 * p, 3000 * p, 1.5, 0.18, out, 0.3);
  },
  jump(t, out, p) {      // a short upward whoosh off a light scuff
    sweep(t, 0.14, 400 * p, 1500 * p, 900 * p, 1, 0.6, out, 0.02);
    noise(t, 0.04, filter('lowpass', 900, 0.7, amp(t, 0.002, 0.4, 0.035, out)));
  },
  knock(t, out, p) {     // knocked over: a whoosh and a grunt
    sweep(t, 0.3, 300 * p, 1200 * p, 300 * p, 1, 0.5, out, 0.05);
    tone('sawtooth', 220 * p, 110 * p, t, 0.15, filter('lowpass', 900, 1, amp(t, 0.005, 0.25, 0.15, out)));
  },
  thud(t, out, p) {      // the body hitting the ground (volume: how hard)
    tone('sine', 110 * p, 45 * p, t, 0.15, amp(t, 0.002, 0.9, 0.15, out));
    noise(t, 0.1, filter('lowpass', 600 * p, 0.7, amp(t, 0.002, 0.6, 0.09, out)));
  },
  step(t, out, p) {      // stepping onto a loose stone: a hollow knock and a little grit
    tone('sine', 220 * p, 140 * p, t, 0.08, amp(t, 0.001, 0.6, 0.08, out));
    tone('triangle', 480 * p, 400 * p, t, 0.05, amp(t, 0.001, 0.15, 0.05, out));
    noise(t, 0.06, filter('bandpass', 1500 * p, 1.2, amp(t, 0.001, 0.3, 0.05, out)));
  },
  getUp(t, out, p) {     // getting up: two soft rustles of cloth
    for (const at of [t, t + 0.22]) noise(at, 0.12, filter('bandpass', 1300 * p, 0.9, amp(at, 0.03, 0.4, 0.1, out)));
  },
  dizzy(t, out, p) {     // seeing stars after a hard landing: little twinkles going round
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.11, hz = [1568, 1976, 1760][i % 3] * p;
      tone('sine', hz, hz * 1.03, at, 0.12, amp(at, 0.004, 0.18, 0.12, out));
    }
  },
  fall(t, out, p) {      // a long fall: a whistle dropping away over rushing air
    tone('sine', 1400 * p, 300 * p, t, 1.3, amp(t, 0.15, 0.08, 1.15, out));
    sweep(t, 1.4, 2000 * p, 2200 * p, 500 * p, 0.8, 0.25, out, 0.3);
  },
  splash(t, out, p) {    // into the water: a big splash and gloops of air going up
    tone('sine', 120 * p, 50 * p, t, 0.2, amp(t, 0.002, 0.6, 0.2, out));
    sweep(t, 0.7, 4000 * p, 1500 * p, 400 * p, 0.6, 0.8, out, 0.005, 'lowpass');
    for (let i = 0; i < 7; i++) {
      const at = t + 0.2 + i * 0.12 + Math.random() * 0.06, hz = (300 + Math.random() * 300) * p;
      tone('sine', hz, hz * 2.2, at, 0.05, amp(at, 0.003, 0.18 * (1 - i / 9), 0.05, out));
    }
  },
  burn(t, out, p) {      // into the lava: a roaring whoomph and a long sizzle
    sweep(t, 0.8, 300 * p, 1500 * p, 250 * p, 1, 0.9, out, 0.04, 'lowpass');
    tone('sawtooth', 55 * p, 40 * p, t, 0.7, filter('lowpass', 200, 1, amp(t, 0.03, 0.5, 0.65, out)));
    noise(t + 0.1, 1.1, filter('highpass', 4000 * p, 0.7, amp(t + 0.1, 0.1, 0.35, 1, out)));
  },
  dissolve(t, out, p) {  // into the acid: fizzing, then sinking gloops
    for (let i = 0; i < 26; i++) {
      const at = t + Math.random() * 1.1;
      noise(at, 0.02, filter('bandpass', (2500 + Math.random() * 4000) * p, 4, amp(at, 0.001, 0.25, 0.015, out)));
    }
    noise(t, 1.1, filter('highpass', 3000 * p, 0.7, amp(t, 0.05, 0.25, 1, out)));
    for (let i = 0; i < 4; i++) {
      const at = t + 0.3 + i * 0.2, hz = (500 - i * 80) * p;
      tone('sine', hz, hz * 0.6, at, 0.08, amp(at, 0.003, 0.15, 0.08, out));
    }
  },
  death(t, out, p) {     // a low, falling tone; then a soft shimmer: back at the entry
    tone('sawtooth', 330 * p, 80 * p, t, 0.6, filter('lowpass', 900, 1, amp(t, 0.01, 0.3, 0.6, out)));
    tone('sine', 165 * p, 40 * p, t, 0.6, amp(t, 0.01, 0.4, 0.6, out));
    for (const [i, hz] of [523, 784, 1047].entries()) {
      const at = t + 0.6 + i * 0.06;
      tone('sine', hz * p, hz * p, at, 0.6, amp(at, 0.05, 0.1, 0.55, out));
    }
  },

  // --- travel ---------------------------------------------------------------------------------
  gate(t, out, p) {      // through a side portal: an airy whoosh with a soft shimmer
    sweep(t, 0.6, 600 * p, 2400 * p, 900 * p, 1, 0.45, out, 0.1);
    tone('sine', 880 * p, 1320 * p, t, 0.5, amp(t, 0.1, 0.07, 0.4, out));
  },
  wellDown(t, out, p) {  // down the well: a swirl sinking away
    sweep(t, 1, 2000 * p, 1200 * p, 250 * p, 1.4, 0.45, out, 0.08);
    tone('triangle', 660 * p, 180 * p, t, 0.9, amp(t, 0.05, 0.12, 0.85, out));
  },
  ringUp(t, out, p) {    // up through the ring: a swirl rising, with sparkles
    sweep(t, 1, 300 * p, 1200 * p, 2600 * p, 1.4, 0.4, out, 0.15);
    tone('triangle', 330 * p, 990 * p, t, 0.9, amp(t, 0.1, 0.12, 0.8, out));
    for (let i = 0; i < 5; i++) {
      const at = t + 0.3 + i * 0.1, hz = (1568 + i * 220) * p;
      tone('sine', hz, hz, at, 0.15, amp(at, 0.004, 0.06, 0.15, out));
    }
  },
  door(t, out, p) {      // a house door: a short wooden creak, then the latch clunks shut
    const f = filter('bandpass', 520 * p, 6, amp(t, 0.04, 0.35, 0.26, out));
    f.frequency.setValueAtTime(520 * p, t); f.frequency.exponentialRampToValueAtTime(980 * p, t + 0.25);
    noise(t, 0.3, f);
    tone('sawtooth', 190 * p, 240 * p, t, 0.25, filter('bandpass', 900, 4, amp(t, 0.03, 0.08, 0.22, out)));
    tone('sine', 120 * p, 60 * p, t + 0.3, 0.12, amp(t + 0.3, 0.002, 0.7, 0.12, out));
    noise(t + 0.3, 0.06, filter('lowpass', 1200, 0.7, amp(t + 0.3, 0.002, 0.45, 0.06, out)));
  },
  thunder(t, out, p) {   // the Wolla's little storm cloud: a sharp crack and a rolling rumble
    noise(t, 0.08, filter('highpass', 2200 * p, 0.7, amp(t, 0.001, 0.55, 0.08, out)));
    noise(t + 0.02, 0.12, filter('bandpass', 900 * p, 1, amp(t + 0.02, 0.003, 0.4, 0.12, out)));
    const rumble = filter('lowpass', 260 * p, 1.5, amp(t + 0.04, 0.06, 0.9, 1.1, out));
    rumble.frequency.setValueAtTime(420 * p, t + 0.04); rumble.frequency.exponentialRampToValueAtTime(110 * p, t + 1.1);
    noise(t + 0.04, 1.15, rumble);
    tone('sine', 70 * p, 38 * p, t + 0.03, 0.7, amp(t + 0.03, 0.02, 0.4, 0.65, out));
  },
  charge(t, out, p) {    // the Wolk's lightning gathering for its 0.8 s: a hum and static, crackling ever faster
    tone('sawtooth', 70 * p, 150 * p, t, 0.82, filter('lowpass', 650 * p, 3, amp(t, 0.3, 0.2, 0.5, out)));
    sweep(t, 0.8, 2500 * p, 4200 * p, 7500 * p, 1.5, 0.1, out, 0.45, 'highpass');
    for (let i = 0; i < 14; i++) {
      const u = i / 14, at = t + 0.78 * Math.sqrt(u);
      noise(at, 0.015, filter('highpass', 3500 * p, 1, amp(at, 0.001, 0.1 + 0.25 * u, 0.015, out)));
    }
  },
  lightning(t, out, p) { // the Wolk's bolt striking: a blinding crack, a sizzle and a thump
    noise(t, 0.05, filter('highpass', 3000 * p, 0.7, amp(t, 0.0005, 0.9, 0.05, out)));
    noise(t + 0.01, 0.25, filter('bandpass', 1800 * p, 0.8, amp(t + 0.01, 0.002, 0.45, 0.25, out)));
    tone('square', 2400 * p, 120 * p, t, 0.2, filter('lowpass', 4000, 1, amp(t, 0.001, 0.16, 0.2, out)));
    tone('sine', 140 * p, 40 * p, t, 0.3, amp(t, 0.002, 0.8, 0.3, out));
  },
  rumble(t, out, p) {    // the thunder after the Wolk's bolt: a low roll that swells twice and dies away
    const roll = filter('lowpass', 300 * p, 1.2, amp(t, 0.12, 0.9, 1.7, out));
    roll.frequency.setValueAtTime(520 * p, t); roll.frequency.exponentialRampToValueAtTime(90 * p, t + 1.85);
    noise(t, 1.9, roll);
    noise(t + 0.45, 0.9, filter('lowpass', 220 * p, 1, amp(t + 0.45, 0.15, 0.6, 0.75, out)));
    tone('sine', 55 * p, 32 * p, t, 1.4, amp(t, 0.1, 0.45, 1.3, out));
  },
  gust(t, out, p) {      // the Wolla blowing: a roaring wind that swells and howls away
    sweep(t, 0.65, 300 * p, 1100 * p, 450 * p, 1.2, 0.75, out, 0.05);
    sweep(t + 0.05, 0.55, 1400 * p, 2600 * p, 900 * p, 6, 0.12, out, 0.08);   // the howl
    noise(t, 0.6, filter('lowpass', 180 * p, 1, amp(t, 0.04, 0.5, 0.55, out)));
  },
  whirl(t, out, p) {     // a Tornado's twister spinning up: a whooshing wind whose band swings up and down ever faster
    const f = filter('bandpass', 500 * p, 2.2, amp(t, 0.12, 0.7, 0.75, out));
    let at = t;
    for (let i = 0; i < 9; i++) { f.frequency.setValueAtTime((i % 2 ? 1500 : 650) * p * (1 + i * 0.06), at); at += 0.13 - i * 0.008; }
    noise(t, 0.9, f);
    noise(t, 0.85, filter('lowpass', 220 * p, 1, amp(t, 0.15, 0.35, 0.7, out)));
  },
  twirl(t, out, p) {     // caught in a twister: a roaring spin, the wind howling round and round
    const f = filter('bandpass', 700 * p, 3, amp(t, 0.05, 0.9, 1.0, out));
    for (let i = 0; i < 12; i++) f.frequency.setValueAtTime((i % 2 ? 1900 : 600) * p, t + i * 0.085);
    noise(t, 1.1, f);
    sweep(t, 1.0, 250 * p, 700 * p, 300 * p, 1.2, 0.5, out, 0.06);
  },
  vortex(t, out, p) {    // Gusto's vortex: a deep roar that whirls (the band swinging up and down) and howls away
    const f = filter('bandpass', 400 * p, 1.4, amp(t, 0.05, 1.1, 0.75, out));
    for (let i = 0; i < 6; i++) f.frequency.setValueAtTime((i % 2 ? 380 : 900) * p, t + i * 0.12);
    noise(t, 0.8, f);
    sweep(t + 0.05, 0.7, 1200 * p, 2800 * p, 700 * p, 7, 0.1, out, 0.1);   // the howl
    noise(t, 0.7, filter('lowpass', 160 * p, 1, amp(t, 0.05, 0.7, 0.65, out)));
  },
  inhale(t, out, p) {    // Gusto breathing in: a long suck rising as the air rushes in, and a deep gulp
    sweep(t, 1.3, 260 * p, 700 * p, 1700 * p, 2.5, 0.5, out, 0.9);
    noise(t, 1.3, filter('lowpass', 220 * p, 1, amp(t, 0.8, 0.6, 0.5, out)));
    tone('sine', 90 * p, 55 * p, t + 1.3, 0.2, amp(t + 1.3, 0.01, 0.7, 0.19, out));
  },
  summon(t, out, p) {    // Gusto spitting his triangles: a wet hork, then a glassy sparkle
    noise(t, 0.12, filter('bandpass', 700 * p, 2, amp(t, 0.01, 0.6, 0.11, out)));
    tone('sine', 320 * p, 120 * p, t, 0.14, amp(t, 0.005, 0.4, 0.14, out));
    for (const [i, hz] of [1568, 2093, 2637].entries()) {
      const at = t + 0.1 + i * 0.05;
      tone('triangle', hz * p, hz * p * 1.03, at, 0.2, amp(at, 0.003, 0.08, 0.2, out));
    }
  },
  grab(t, out, p) {      // caught: a quick swish of claws and a squeeze
    sweep(t, 0.16, 900 * p, 2400 * p, 1200 * p, 2, 0.4, out, 0.01);
    tone('sine', 180 * p, 110 * p, t + 0.08, 0.12, amp(t + 0.08, 0.004, 0.6, 0.12, out));
  },
  chomp(t, out, p) {     // a Mecked biting down on what it holds: a wet crunch and its teeth clacking shut
    noise(t, 0.09, filter('bandpass', 1500 * p, 1.2, amp(t, 0.002, 0.7, 0.09, out)));
    noise(t + 0.01, 0.025, filter('highpass', 3200 * p, 2, amp(t + 0.01, 0.001, 0.5, 0.025, out)));
    tone('sine', 160 * p, 70 * p, t, 0.12, amp(t, 0.003, 0.6, 0.12, out));
  },
  skullthrow(t, out, p) {   // Totnar hurling a skull: a whoosh and its teeth chattering as it flies
    sweep(t, 0.35, 500 * p, 1500 * p, 700 * p, 1.5, 0.5, out, 0.03);
    for (let i = 0; i < 6; i++) { const at = t + 0.05 + i * 0.05; noise(at, 0.015, filter('bandpass', 2400 * p, 6, amp(at, 0.001, 0.3, 0.015, out))); }
  },
  bonk(t, out, p) {      // a thrown skull landing: a hollow bony knock and a clack
    tone('sine', 420 * p, 180 * p, t, 0.1, amp(t, 0.001, 0.6, 0.1, out));
    noise(t, 0.05, filter('bandpass', 1800 * p, 3, amp(t, 0.001, 0.5, 0.05, out)));
    noise(t + 0.07, 0.02, filter('bandpass', 2600 * p, 6, amp(t + 0.07, 0.001, 0.4, 0.02, out)));
  },
  rustle(t, out, p) {    // twigs and leaves: a dry crackling rustle (Totnar rolling off, tearing himself open)
    noise(t, 0.5, filter('bandpass', 2200 * p, 0.7, amp(t, 0.04, 0.35, 0.45, out)));
    for (let i = 0; i < 10; i++) { const at = t + Math.random() * 0.45; noise(at, 0.01, filter('highpass', 3000 * p, 1, amp(at, 0.001, 0.25, 0.01, out))); }
  },
  gloom(t, out, p) {     // the light going out: a deep falling whoosh and a low drone
    sweep(t, 1.1, 1400 * p, 600 * p, 120 * p, 1.2, 0.5, out, 0.15, 'lowpass');
    tone('sawtooth', 70 * p, 45 * p, t, 1.2, filter('lowpass', 260 * p, 2, amp(t, 0.3, 0.25, 0.9, out)));
  },
  dawn(t, out, p) {      // the light coming back: a rising rush with a shimmer
    sweep(t, 0.9, 200 * p, 900 * p, 2400 * p, 1.2, 0.35, out, 0.3);
    for (const [i, hz] of [784, 1175, 1568].entries()) { const at = t + 0.35 + i * 0.08; tone('triangle', hz * p, hz * p, at, 0.4, amp(at, 0.01, 0.06, 0.4, out)); }
  },
  shed(t, out, p) {      // a skull bursting off Totnar: a bony crack and sticks flying
    noise(t, 0.07, filter('highpass', 2000 * p, 0.7, amp(t, 0.001, 0.8, 0.07, out)));
    tone('sine', 180 * p, 60 * p, t, 0.25, amp(t, 0.002, 0.7, 0.25, out));
    for (let i = 0; i < 14; i++) { const at = t + 0.03 + Math.random() * 0.5; noise(at, 0.012, filter('bandpass', (1500 + Math.random() * 2000) * p, 4, amp(at, 0.001, 0.3, 0.012, out))); }
  },
  spray(t, out, p) {     // Squarlo's jet bursting out of his hands: a hissing gush of water
    sweep(t, 0.55, 1200 * p, 3200 * p, 1800 * p, 0.7, 0.7, out, 0.02);
    noise(t, 0.5, filter('highpass', 3500 * p, 0.6, amp(t, 0.02, 0.25, 0.45, out)));
    tone('sine', 220 * p, 120 * p, t, 0.12, amp(t, 0.002, 0.3, 0.12, out));
  },
  cannon(t, out, p) {    // a giant Squarlo's water cannon: a deep boom, then a long roaring gush of water
    tone('sine', 80 * p, 40 * p, t, 0.5, amp(t, 0.005, 0.9, 0.5, out));
    noise(t, 1.3, filter('lowpass', 1400 * p, 0.7, amp(t, 0.04, 0.7, 1.25, out)));
    sweep(t, 1.3, 600 * p, 2400 * p, 900 * p, 0.6, 0.45, out, 0.05);
    noise(t + 0.05, 1.1, filter('highpass', 3000 * p, 0.5, amp(t + 0.05, 0.05, 0.2, 1.05, out)));
  },
  spit(t, out, p) {      // a Squirtle spitting water: a wet puh with a gulp before it
    tone('sine', 300 * p, 520 * p, t, 0.06, amp(t, 0.003, 0.3, 0.06, out));
    noise(t + 0.05, 0.12, filter('bandpass', 1800 * p, 1.2, amp(t + 0.05, 0.004, 0.55, 0.11, out)));
  },
  drip(t, out, p) {      // water splattering: a bloop and a patter of drops
    tone('sine', 900 * p, 300 * p, t, 0.08, amp(t, 0.002, 0.35, 0.08, out));
    for (let i = 0; i < 5; i++) {
      const at = t + 0.04 + Math.random() * 0.25, hz = (700 + Math.random() * 900) * p;
      tone('sine', hz, hz * 1.8, at, 0.03, amp(at, 0.002, 0.12, 0.03, out));
    }
  },
  gulp(t, out, p) {      // swallowed by a Bolime: a deep wet gulp, the slime closing with a squelch
    tone('sine', 160 * p, 70 * p, t, 0.25, amp(t, 0.01, 0.6, 0.25, out));
    const f = filter('lowpass', 1400 * p, 9, amp(t + 0.05, 0.01, 0.5, 0.3, out));
    f.frequency.setValueAtTime(1400 * p, t + 0.05); f.frequency.exponentialRampToValueAtTime(200 * p, t + 0.35);
    noise(t + 0.05, 0.35, f);
    tone('sine', 240 * p, 520 * p, t + 0.3, 0.05, amp(t + 0.3, 0.003, 0.2, 0.05, out));
  },
  splorch(t, out, p) {   // spat out of a Bolime (or bursting out of it): a wet pop and slime splattering
    tone('sine', 120 * p, 380 * p, t, 0.07, amp(t, 0.002, 0.55, 0.07, out));
    noise(t, 0.2, filter('bandpass', 900 * p, 1.5, amp(t, 0.004, 0.5, 0.19, out)));
    for (let i = 0; i < 6; i++) {
      const at = t + 0.05 + Math.random() * 0.3, hz = (400 + Math.random() * 700) * p;
      tone('sine', hz, hz * 1.6, at, 0.04, amp(at, 0.002, 0.12, 0.04, out));
    }
  },
  boing(t, out, p) {     // a Bolime landing a hop: a soft, springy wobble
    tone('sine', 140 * p, 220 * p, t, 0.16, amp(t, 0.004, 0.25, 0.16, out));
    tone('sine', 280 * p, 200 * p, t + 0.03, 0.12, amp(t + 0.03, 0.004, 0.08, 0.12, out));
  },
  tidecall(t, out, p) {  // Squarlo calling the tide: a deep swell rising, waves rolling in
    tone('sine', 55 * p, 110 * p, t, 1.8, amp(t, 0.6, 0.45, 1.2, out));
    tone('triangle', 82 * p, 165 * p, t + 0.2, 1.6, filter('lowpass', 500 * p, 1, amp(t + 0.2, 0.5, 0.2, 1.1, out)));
    sweep(t, 2, 300 * p, 900 * p, 400 * p, 0.6, 0.35, out, 0.7, 'lowpass');
    for (let i = 0; i < 3; i++) sweep(t + 0.5 + i * 0.5, 0.6, 500 * p, 1500 * p, 600 * p, 0.6, 0.18, out, 0.15);
  },
  hooves(t, out, p) {    // a Moose charging: a drumming of hooves on the ground, four beats a stride
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.055 + (i > 1 ? 0.03 : 0);
      tone('sine', 120 * p, 60 * p, at, 0.07, amp(at, 0.002, 0.5, 0.07, out));
      noise(at, 0.04, filter('bandpass', 900 * p, 1.5, amp(at, 0.001, 0.3, 0.04, out)));
    }
  },
  stomp(t, out, p) {     // a giant's foot coming down: a boom you feel, and the ground rattling
    tone('sine', 70 * p, 28 * p, t, 0.7, amp(t, 0.004, 1.1, 0.7, out));
    tone('triangle', 120 * p, 45 * p, t, 0.35, filter('lowpass', 400, 1, amp(t, 0.003, 0.6, 0.35, out)));
    noise(t, 0.6, filter('lowpass', 700 * p, 0.8, amp(t, 0.005, 0.8, 0.55, out)));
    for (let i = 0; i < 8; i++) { const at = t + 0.1 + Math.random() * 0.5; noise(at, 0.02, filter('bandpass', (900 + Math.random() * 900) * p, 3, amp(at, 0.002, 0.2, 0.02, out))); }
  },
  reveal(t, out, p) {    // a boss's name coming up in his intro: a deep hit, a dark chord swelling under it, a cold shimmer
    tone('sine', 82 * p, 38 * p, t, 0.9, amp(t, 0.004, 1, 0.9, out));
    noise(t, 0.5, filter('lowpass', 900 * p, 0.8, amp(t, 0.004, 0.7, 0.45, out)));
    for (const hz of [55, 82.4, 116.5]) tone('sawtooth', hz * p, hz * p * 0.985, t, 2.2, filter('lowpass', 500 * p, 1.5, amp(t, 0.25, 0.14, 1.9, out)));
    for (const [i, hz] of [1245, 1661, 1760].entries()) { const at = t + 0.12 + i * 0.07; tone('triangle', hz * p, hz * p, at, 1.2, amp(at, 0.05, 0.035, 1.1, out)); }
  },
  // Mansk's intro (game/bossreveals.js): the curtain going up on his stage, his dance, his roar
  drumroll(t, out, p) {  // a snare roll swelling for a second, and its last stroke
    for (let i = 0; i < 36; i++) {
      const at = t + i * 0.028, l = 0.1 + 0.35 * i / 35;
      noise(at, 0.035, filter('bandpass', 1900 * p, 0.9, amp(at, 0.002, l, 0.035, out)));
      tone('triangle', 200 * p, 170 * p, at, 0.03, amp(at, 0.002, l * 0.3, 0.03, out));
    }
    noise(t + 1.0, 0.25, filter('bandpass', 1500 * p, 0.7, amp(t + 1.0, 0.002, 0.65, 0.25, out)));
    tone('sine', 130 * p, 70 * p, t + 1.0, 0.25, amp(t + 1.0, 0.003, 0.6, 0.25, out));
  },
  swish(t, out, p) {     // a heavy velvet curtain drawn open: a long soft rush of cloth, its rings rattling along the rail
    sweep(t, 1.4, 380 * p, 900 * p, 300 * p, 0.7, 0.4, out, 0.3, 'lowpass');
    sweep(t + 0.1, 1.2, 1200 * p, 2400 * p, 900 * p, 1.2, 0.12, out, 0.3);
    for (let i = 0; i < 14; i++) {
      const at = t + 0.1 + i * 0.075 + Math.random() * 0.03, hz = (2400 + Math.random() * 900) * p;
      tone('triangle', hz, hz * 0.97, at, 0.04, amp(at, 0.001, 0.05, 0.04, out));
    }
  },
  castanet(t, out, p) {  // castanets: two quick wooden clicks
    for (const k of [0, 0.045]) {
      noise(t + k, 0.02, filter('bandpass', 2600 * p, 3, amp(t + k, 0.001, 0.7, 0.025, out)));
      tone('sine', 1500 * p, 1250 * p, t + k, 0.03, amp(t + k, 0.001, 0.25, 0.03, out));
    }
  },
  clap(t, out, p) {      // a hand clap: a few slaps at once and the room after them
    for (const k of [0, 0.011, 0.022]) noise(t + k, 0.012, filter('bandpass', 1200 * p, 1.2, amp(t + k, 0.001, 0.55, 0.012, out)));
    noise(t + 0.03, 0.14, filter('bandpass', 1100 * p, 1, amp(t + 0.03, 0.002, 0.45, 0.13, out)));
  },
  tom(t, out, p) {       // a floor tom: a deep round drum, its pitch dropping
    tone('sine', 150 * p, 85 * p, t, 0.35, amp(t, 0.003, 0.9, 0.35, out));
    noise(t, 0.06, filter('lowpass', 1200 * p, 0.8, amp(t, 0.002, 0.35, 0.06, out)));
  },
  cymbal(t, out, p) {    // a crash cymbal: a bright splash of noise ringing out, a metallic shimmer in it
    noise(t, 1.8, filter('highpass', 5000 * p, 0.6, amp(t, 0.003, 0.45, 1.8, out)));
    noise(t, 0.4, filter('bandpass', 3200 * p, 1, amp(t, 0.002, 0.45, 0.4, out)));
    for (const hz of [587, 845, 1243, 1660]) tone('square', hz * p, hz * p * 0.99, t, 1.3, filter('highpass', 2500, 0.8, amp(t, 0.002, 0.05, 1.3, out)));
  },
  morph(t, out, p) {     // Squarlo growing in the fog: a long, rising, wobbling groan of stretching
    const g = amp(t, 0.4, 0.5, 2.6, out);
    tone('sawtooth', 60 * p, 160 * p, t, 3, filter('lowpass', 400 * p, 2, g));
    tone('sine', 90 * p, 30 * p, t + 2.4, 0.8, amp(t + 2.4, 0.01, 0.9, 0.8, out));
    sweep(t, 3, 200 * p, 600 * p, 150 * p, 0.8, 0.3, out, 0.8, 'lowpass');
  },
  flip(t, out, p) {      // Flip turning the world: a deep grinding rumble rising and falling, stone groaning, a swish
    tone('sine', 45 * p, 70 * p, t, 1.6, amp(t, 0.3, 0.8, 1.3, out));
    tone('sawtooth', 55 * p, 38 * p, t + 0.1, 1.5, filter('lowpass', 300 * p, 3, amp(t + 0.1, 0.4, 0.3, 1.1, out)));
    noise(t, 1.6, filter('lowpass', 500 * p, 0.8, amp(t, 0.5, 0.6, 1.1, out)));
    sweep(t + 0.2, 1.3, 300 * p, 1400 * p, 400 * p, 1.5, 0.3, out, 0.6);
    for (let i = 0; i < 6; i++) { const at = t + 0.2 + Math.random() * 1.2; noise(at, 0.05, filter('bandpass', (600 + Math.random() * 600) * p, 4, amp(at, 0.005, 0.25, 0.05, out))); }
  },
  blackhole(t, out, p) { // a black hole opening: a deep falling suck and a hollow hum that swirls
    sweep(t, 1.4, 2200 * p, 500 * p, 90 * p, 2, 0.45, out, 0.2, 'lowpass');
    const g = amp(t, 0.4, 0.4, 1.2, out), f = filter('bandpass', 140 * p, 6, g);
    for (let i = 0; i < 8; i++) f.frequency.setValueAtTime((i % 2 ? 110 : 190) * p, t + i * 0.18);
    tone('sawtooth', 60 * p, 40 * p, t, 1.6, f);
    tone('sine', 220 * p, 55 * p, t + 0.05, 1.2, amp(t + 0.05, 0.1, 0.25, 1.1, out));
  },
  clockwind(t, out, p) { // Renew gathering time: a clock ticking faster and faster under a rising shimmer
    for (let i = 0, at = t; i < 10; i++, at += 0.16 * Math.pow(0.86, i)) {
      noise(at, 0.02, filter('bandpass', (i % 2 ? 3200 : 2500) * p, 8, amp(at, 0.001, 0.35, 0.02, out)));
      tone('sine', (i % 2 ? 1900 : 1500) * p, (i % 2 ? 1880 : 1480) * p, at, 0.05, amp(at, 0.001, 0.08, 0.05, out));
    }
    sweep(t, 1.4, 600 * p, 2400 * p, 5200 * p, 3, 0.18, out, 0.9);
    tone('triangle', 440 * p, 880 * p, t + 0.2, 1.2, amp(t + 0.2, 0.8, 0.1, 0.4, out));
  },
  rewind(t, out, p) {    // time running back: a tape whirring backwards, warbling down and up, ticks racing the wrong way
    sweep(t, 2.2, 2600 * p, 700 * p, 1900 * p, 2.5, 0.3, out, 0.15);
    const g = amp(t, 0.2, 0.16, 1.9, out), f = filter('bandpass', 900 * p, 3, g), o = f.context.createOscillator();
    o.type = 'sawtooth';
    for (let i = 0; i <= 22; i++) o.frequency.setValueAtTime((i % 2 ? 330 : 250) * p * (1 - i * 0.012), t + i * 0.1);
    o.connect(f); o.start(t); o.stop(t + 2.25);
    for (let i = 0; i < 14; i++) { const at = t + 2 - i * 0.14; noise(at, 0.015, filter('bandpass', 2800 * p, 8, amp(at, 0.001, 0.22, 0.015, out))); }
  },
  rewound(t, out, p) {   // back at the start: a rush coming to a stop, and a bell's deep chime
    sweep(t, 0.5, 3000 * p, 900 * p, 300 * p, 1.2, 0.35, out, 0.02, 'lowpass');
    for (const [hz, l] of [[392, 0.3], [784, 0.12], [1175, 0.06]]) tone('sine', hz * p, hz * 0.995 * p, t + 0.12, 1.6, amp(t + 0.12, 0.005, l, 1.6, out));
  },
  dig(t, out, p) {       // a Squirtle diving into the floor: a scrape and a soft plop
    sweep(t, 0.25, 900 * p, 400 * p, 200 * p, 0.8, 0.4, out, 0.01, 'lowpass');
    tone('sine', 260 * p, 110 * p, t + 0.12, 0.1, amp(t + 0.12, 0.003, 0.3, 0.1, out));
  },
  pop(t, out, p) {       // ... and popping out of it: a cork-like pop and a sprinkle of dirt
    tone('sine', 180 * p, 620 * p, t, 0.07, amp(t, 0.002, 0.45, 0.07, out));
    noise(t + 0.03, 0.15, filter('bandpass', 2400 * p, 1, amp(t + 0.03, 0.003, 0.2, 0.14, out)));
  },
  poof(t, out, p) {      // a proxy (or a summoned triangle) going up in a cloud: a soft puff and a sparkle
    noise(t, 0.3, filter('lowpass', 1300 * p, 0.8, amp(t, 0.01, 0.7, 0.28, out)));
    tone('sine', 880 * p, 1760 * p, t + 0.02, 0.18, amp(t + 0.02, 0.005, 0.12, 0.18, out));
  },
  cloud(t, out, p) {     // the cloud bridge puffing out of the gate
    noise(t, 0.6, filter('lowpass', 900 * p, 0.7, amp(t, 0.08, 0.45, 0.5, out)));
  },
  castStart(t, out, p) { // reading the scroll: a soft two-note chime
    for (const [i, hz] of [523, 784].entries()) {
      const at = t + i * 0.08;
      tone('sine', hz * p, hz * p, at, 0.35, amp(at, 0.005, 0.15, 0.35, out));
    }
  },
  fizzle(t, out, p) {    // a cast or charge broken off: a crackle falling away
    sweep(t, 0.3, 1500 * p, 900 * p, 300 * p, 2, 0.35, out, 0.005);
    tone('sine', 660 * p, 330 * p, t, 0.25, amp(t, 0.005, 0.12, 0.25, out));
  },

  // --- items and the bag ----------------------------------------------------------------------
  equip(t, out, p) {     // a blade in hand: a metallic shing
    sweep(t, 0.18, 3000 * p, 8000 * p, 6000 * p, 1.5, 0.25, out, 0.01, 'highpass');
    tone('triangle', 1760 * p, 1760 * p, t + 0.03, 0.35, amp(t + 0.03, 0.002, 0.12, 0.35, out));
    tone('sine', 2637 * p, 2637 * p, t + 0.03, 0.25, amp(t + 0.03, 0.002, 0.06, 0.25, out));
  },
  bagOpen(t, out, p) {   // leather flap and a rummage, rising
    noise(t, 0.08, filter('bandpass', 900 * p, 1, amp(t, 0.01, 0.6, 0.07, out)));
    noise(t + 0.07, 0.1, filter('bandpass', 1500 * p, 1, amp(t + 0.07, 0.01, 0.45, 0.09, out)));
  },
  bagClose(t, out, p) {  // and back down, with a soft thump
    noise(t, 0.08, filter('bandpass', 1300 * p, 1, amp(t, 0.01, 0.2, 0.07, out)));
    tone('sine', 140 * p, 80 * p, t + 0.06, 0.06, amp(t + 0.06, 0.002, 0.3, 0.06, out));
  },
  use(t, out, p) {       // using a quick bar slot: a soft pop
    tone('sine', 900 * p, 600 * p, t, 0.05, amp(t, 0.002, 0.2, 0.05, out));
  },
  drink(t, out, p) {     // a potion: three gulps, then a warm rising glow
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.13, hz = (260 + i * 30) * p;
      tone('sine', hz, hz * 0.55, at, 0.09, amp(at, 0.004, 0.35, 0.09, out));
      noise(at, 0.05, filter('lowpass', 700 * p, 1, amp(at, 0.003, 0.15, 0.05, out)));
    }
    for (const [i, hz] of [392, 523, 659].entries()) {
      const at = t + 0.38 + i * 0.05;
      tone('sine', hz * p, hz * p * 1.01, at, 0.45, amp(at, 0.03, 0.07, 0.42, out));
    }
  },
  buff(t, out, p) {      // a potion's power taking hold after the gulps: a quick rising shimmer
    for (const [i, hz] of [523, 784, 1047, 1568].entries()) {
      const at = t + 0.3 + i * 0.045;
      tone('triangle', hz * p, hz * p * 1.02, at, 0.3, amp(at, 0.004, 0.09, 0.3, out));
    }
    sweep(t + 0.28, 0.4, 800 * p, 3200 * p, 2000 * p, 2, 0.12, out, 0.08);
  },
  poison(t, out, p) {    // a poison tick: a sickly bubbling gurgle
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.06, hz = (180 + Math.random() * 120) * p;
      tone('sine', hz, hz * 1.8, at, 0.05, amp(at, 0.004, 0.25, 0.05, out));
    }
    noise(t, 0.15, filter('bandpass', 600 * p, 3, amp(t, 0.01, 0.15, 0.14, out)));
  },
  lob(t, out, p) {       // a flask thrown: a short rising whoosh and the slosh inside
    sweep(t, 0.24, 400 * p, 1600 * p, 900 * p, 1, 0.5, out, 0.04);
    tone('sine', 300 * p, 520 * p, t + 0.03, 0.12, amp(t + 0.03, 0.01, 0.12, 0.12, out));
  },
  glass(t, out, p) {     // a flask breaking: a sharp crack and tinkling shards
    noise(t, 0.05, filter('highpass', 4200 * p, 0.8, amp(t, 0.001, 0.7, 0.05, out)));
    for (let i = 0; i < 6; i++) {
      const at = t + 0.02 + i * 0.03 * (0.6 + Math.random() * 0.8), hz = (2600 + Math.random() * 3000) * p;
      tone('triangle', hz, hz * 0.96, at, 0.1, amp(at, 0.002, 0.1, 0.1, out));
    }
  },
  boom(t, out, p) {      // a blast flask: a deep thump, a roar of noise and a long rumble
    tone('sine', 110 * p, 32 * p, t, 0.5, amp(t, 0.003, 1.2, 0.5, out));
    noise(t, 0.6, filter('lowpass', 1400 * p, 0.7, amp(t, 0.004, 1.1, 0.6, out)));
    noise(t + 0.05, 1.1, filter('lowpass', 260 * p, 1, amp(t + 0.05, 0.05, 0.6, 1, out)));
  },
  hiss(t, out, p) {      // a toxic flask: gas hissing out and bubbling
    sweep(t, 0.9, 5000 * p, 3200 * p, 2500 * p, 0.8, 0.35, out, 0.03, 'highpass');
    for (let i = 0; i < 5; i++) {
      const at = t + 0.1 + i * 0.09, hz = (220 + Math.random() * 200) * p;
      tone('sine', hz, hz * 1.7, at, 0.06, amp(at, 0.005, 0.15, 0.06, out));
    }
  },
  chest(t, out, p) {     // a chest lid: a creaking hinge, the lid knocking back (its glint: the jingle chest, game/chests.js)
    sweep(t, 0.35, 500 * p, 900 * p, 650 * p, 9, 0.25, out, 0.05);
    tone('sawtooth', 110 * p, 140 * p, t, 0.3, filter('bandpass', 700 * p, 6, amp(t, 0.05, 0.12, 0.28, out)));
    tone('sine', 150 * p, 70 * p, t + 0.33, 0.12, amp(t + 0.33, 0.003, 0.6, 0.12, out));
    noise(t + 0.33, 0.08, filter('lowpass', 900 * p, 1, amp(t + 0.33, 0.003, 0.4, 0.08, out)));
  },
};

// a band of noise sweeping f0 -> f1 -> f2 over dur (q: band width); attack: swell time;
// type: the filter (bandpass by default)
function sweep(t, dur, f0, f1, f2, q, level, out, attack = 0.02, type = 'bandpass') {
  const f = filter(type, f0, q, amp(t, attack, level, Math.max(0.02, dur - attack), out));
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.35);
  f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  noise(t, dur, f);
}
Object.assign(SOUNDS, voices({ amp, noise, filter, tone, sweep }));
export const SOUND_NAMES = Object.keys(SOUNDS);

// checks and tools/player.html: a sound rendered offline as it leaves the effects' limiter for
// the sounds' bus (stereo, 4 s; its noise and random details drawn again): { peak, buffer }.
// The limiter starts out turned down and needs a moment to settle (as it has in the game):
// the sound starts after LEAD, which is cut off again.
export async function renderSfx(name, { pitch = 1, volume = 1, pan = 0 } = {}) {
  const LEAD = 0.5, SR = 44100, n = 4 * SR, skip = LEAD * SR;
  const live = ctx, liveNoise = noiseBuf;
  const off = new OfflineAudioContext(2, n + skip, SR);
  const out = off.createGain(), p = off.createStereoPanner();
  out.gain.value = volume; p.pan.value = pan;
  out.connect(p).connect(effectsBus(off, off.destination));
  ctx = off; noiseBuf = noiseOn(off);
  try { SOUNDS[name](LEAD, out, pitch); } finally { ctx = live; noiseBuf = liveNoise; }
  const all = await off.startRendering(), buffer = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: SR });
  let peak = 0;
  for (let c = 0; c < 2; c++) {
    const d = all.getChannelData(c).subarray(skip, skip + n);
    buffer.copyToChannel(d, c);
    for (const x of d) peak = Math.max(peak, Math.abs(x));
  }
  return { peak, buffer };
}

// sfx(name, { at: {x,y,z} (pans by screen position, setPanner) or pan (-1..1), pitch, volume,
// delay (s, from now) })
// learn: sound.html#coin-code #recipe (see learn/README.md)
export function sfx(name, { at = null, pan = 0, pitch = 1, volume = 1, delay = 0 } = {}) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (name === 'coin') {
    combo = now - comboAt < 0.4 ? combo + 1 : 0; comboAt = now;
    pitch *= 1 + Math.min(combo, 10) * 0.035;
  } else if (now - (last[name] ?? -1) < 0.03) return;   // the same sound twice in a frame
  last[name] = now;
  let out = ctx.createGain();
  out.gain.value = volume;
  if (at && panner) pan = panner(at);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p).connect(master);
  } else out.connect(master);
  SOUNDS[name](now + 0.005 + Math.max(0, delay), out, pitch * (0.95 + Math.random() * 0.1));
}
