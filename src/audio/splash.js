// The splash screen's sounds (game/splash.js): the glass bird breaking. Generated like every
// other sound (docs/sound.md), into the sounds' bus, with a little room of their own (a reverb
// made from decaying noise).
//   splashHit()      the invisible blow: a soft, muffled knock, and a thin ring of the glass held
//                    while time stands nearly still
//   splashShatter()  the bright shatter as time runs again: a sharp crack, then a shower of
//                    glass, small pieces ringing and falling, panned across
//   splashSwell()    then a deep swell (like a film studio's logo): many detuned voices from
//                    all over gliding down into one low chord on D, a sub under it, dying away
// Each returns how long it rings (s); nothing plays before the first click or key.
import { onAudioStart } from './context.js';

// when each is heard, s after the click: game/splash.js times its picture by them (the blow
// lands at hit, time runs again at the shatter), tools/player.html plays them in this order
export const SPLASH_CUES = Object.freeze({ hit: 0.05, shatter: 1.27, swell: 1.42 });

let ctx = null, out = null, room = null, noiseBuf = null, offline = false;

onAudioStart((ac, sounds) => {
  ctx = ac;
  out = ctx.createGain(); out.gain.value = 0.6;   // (the game's sounds play at 0.45: audio/sfx.js)
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -8; limit.ratio.value = 8;
  out.connect(limit).connect(sounds);
});

// the room: a stereo impulse of noise dying away over `seconds`, made on first use
function reverb() {
  if (room) return room;
  const seconds = 2.6, rate = ctx.sampleRate, n = Math.floor(seconds * rate);
  const ir = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  room = ctx.createGain(); room.gain.value = 0.2;
  room.connect(conv).connect(out);
  return room;
}

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

// a gain that rises to `peak` over `attack` and falls away over `decay` (s), into `dest` and
// some of it into the room
function env(t, attack, peak, decay, dest = out, wet = 0.5) {
  const g = ctx.createGain();
  g.gain.value = 0.0001;   // (silent before t too: its source may start earlier)
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(reverb()); }
  return g;
}
function panned(dest, pan) {
  if (!ctx.createStereoPanner) return dest;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(dest);
  return p;
}
const ready = () => ctx && (offline || ctx.state === 'running');

export function splashHit(at = 0) {
  if (!ready()) return 0;
  const t = ctx.currentTime + at + 0.005;
  // a knock, felt more than heard
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  o.connect(env(t, 0.004, 0.5, 0.22, out, 0.3));
  o.start(t); o.stop(t + 0.3);
  const n = noise(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  n.connect(lp).connect(env(t, 0.002, 0.25, 0.08, out, 0.2));
  n.start(t); n.stop(t + 0.12);
  // the glass ringing on, very quietly, while time crawls
  for (const [f, v] of [[3140, 0.03], [4710, 0.016], [6290, 0.008]]) {
    const r = ctx.createOscillator();
    r.frequency.value = f;
    r.connect(env(t + 0.02, 0.15, v, 1.3, out, 0.8));
    r.start(t); r.stop(t + 1.6);
  }
  return 1.5;
}

export function splashShatter(at = 0) {
  if (!ready()) return 0;
  const t = ctx.currentTime + at + 0.005;
  // the crack: a hard, bright burst of noise
  const n = noise(), hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 2200;
  n.connect(hp).connect(env(t, 0.002, 0.6, 0.09, out, 0.6));
  n.start(t); n.stop(t + 0.2);
  const n2 = noise(), bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1.2;
  n2.connect(bp).connect(env(t, 0.004, 0.4, 0.35, out, 0.7));
  n2.start(t); n2.stop(t + 0.5);
  // the body of it breaking: a lower, glassy clank
  for (const [f, v] of [[1180, 0.16], [1870, 0.1], [2650, 0.07]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(env(t, 0.002, v, 0.25, out, 0.6));
    o.start(t); o.stop(t + 0.35);
  }
  // the shower: small pieces ringing, thick at first, then fewer and further apart; each a few
  // inharmonic partials of a little piece of glass
  const grains = 70;
  for (let i = 0; i < grains; i++) {
    const at = t + 0.01 + 1.3 * Math.pow(Math.random(), 2.2);
    const f = 2400 + Math.random() * 6200, decay = 0.03 + Math.random() * 0.12;
    const loud = (0.04 + Math.random() * 0.08) * (1 - 0.6 * (at - t) / 1.3);
    const dest = panned(out, (Math.random() * 2 - 1) * 0.8);
    for (const [m, v] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) {
      if (f * m > 14000) continue;
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      o.connect(env(at, 0.001, loud * v, decay / m ** 0.3, dest, 0.5));
      o.start(at); o.stop(at + decay + 0.05);
    }
  }
  return 1.8;
}

// the chord the swell comes down to (Hz): D1, D2, A2, D3, A3, D4, F#4
const CHORD = [36.7, 73.4, 110, 146.8, 220, 293.7, 370];

export function splashSwell(seconds = 3.6, at = 0) {
  if (!ready()) return 0;
  const t = ctx.currentTime + at + 0.01, glide = 1.1, peak = 1.25;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + peak);
  lp.frequency.exponentialRampToValueAtTime(160, t + seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.62, t + peak);
  g.gain.setValueAtTime(0.62, t + peak + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  lp.connect(g).connect(out);
  const w = ctx.createGain(); w.gain.value = 0.6; g.connect(w).connect(reverb());
  // the voices: each starts somewhere of its own (a wandering cluster), and glides to a note
  // of the chord, a few cents off it, so the chord beats and breathes
  const voices = 26;
  for (let i = 0; i < voices; i++) {
    const target = CHORD[i % CHORD.length] * Math.pow(2, (Math.random() * 2 - 1) * 6 / 1200);
    const from = 180 + Math.random() * 320;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(from, t);
    o.frequency.setTargetAtTime(from * (0.9 + Math.random() * 0.2), t, 0.2);
    o.frequency.setTargetAtTime(target, t + 0.25 + Math.random() * 0.2, glide / 3.2);
    const v = ctx.createGain();
    v.gain.value = (target < 80 ? 0.1 : 0.075) / Math.sqrt(voices / CHORD.length);
    o.connect(v).connect(panned(lp, (i / (voices - 1)) * 1.4 - 0.7));
    o.start(t); o.stop(t + seconds + 0.1);
  }
  // and under it a sub, coming in as the chord lands
  const sub = ctx.createOscillator();
  sub.frequency.value = CHORD[0];
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.28, t + peak + 0.1);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  sub.connect(sg).connect(out);
  sub.start(t); sub.stop(t + seconds + 0.1);
  return seconds;
}

// checks: sounds rendered offline, `plan` a name ('hit', 'shatter', 'swell') or [[name, at s], ...]:
// the peak level, how long it is heard (s above -60 dB) and the AudioBuffer
export async function renderSplashSound(plan) {
  if (typeof plan === 'string') plan = [[plan, 0]];
  const live = { ctx, out, room, noiseBuf }, gain = out?.gain.value ?? 0.6;
  const off = new OfflineAudioContext(2, Math.ceil((5 + Math.max(...plan.map(p => p[1]))) * 44100), 44100);
  ctx = off; out = off.createGain(); out.gain.value = gain; out.connect(off.destination);
  room = null; noiseBuf = null; offline = true;
  try {
    for (const [name, at] of plan) {
      if (name === 'hit') splashHit(at);
      else if (name === 'shatter') splashShatter(at);
      else splashSwell(undefined, at);
    }
  } finally { ({ ctx, out, room, noiseBuf } = live); offline = false; }
  const data = await off.startRendering();
  let peak = 0, last = 0;
  for (let c = 0; c < data.numberOfChannels; c++) {
    const d = data.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; if (v > 0.001) last = Math.max(last, i); }
  }
  return { peak, seconds: last / 44100, buffer: data };
}
