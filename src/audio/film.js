// The films' sound (film/player.js), made like every other (docs/sound.md), into the sounds' bus:
//   filmCrackle()  the crackle and hiss of an old recording, looping, silent until given a level:
//                  { level(v, seconds), stop() }; null before the first click or key
import { onAudioStart } from './context.js';

let ctx = null, out = null;
onAudioStart((ac, sounds) => { ctx = ac; out = sounds; });

export function filmCrackle() {
  if (!ctx || ctx.state === 'closed') return null;
  const rate = ctx.sampleRate, n = Math.floor(rate * 4), buf = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    // a soft hiss, a little darker than white
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * 0.09; }
    // pops and ticks: sharp, most of them tiny, now and then a bigger one
    for (let k = 0; k < 4 * 38; k++) {
      const at = Math.floor(Math.random() * n), big = Math.random() ** 4, len = 6 + Math.floor(big * 60), sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < len && at + j < n; j++) d[at + j] += sign * (0.12 + 0.75 * big) * Math.exp(-j / (2 + big * 14)) * (j % 2 ? -0.6 : 1);
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const band = ctx.createBiquadFilter(), top = ctx.createBiquadFilter(), gain = ctx.createGain();
  band.type = 'highpass'; band.frequency.value = 450;
  top.type = 'lowpass'; top.frequency.value = 6500;
  gain.gain.value = 0;
  src.connect(band).connect(top).connect(gain).connect(out);
  src.start();
  return {
    level(v, seconds = 0.5) { gain.gain.setTargetAtTime(Math.max(0, v) * 0.5, ctx.currentTime, Math.max(0.01, seconds / 3)); },
    stop(seconds = 0.6) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
      setTimeout(() => { try { src.stop(); } catch { /* (stopped) */ } gain.disconnect(); }, seconds * 1000 + 200);
    },
  };
}
