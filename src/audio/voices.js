// The enemies' voices, stylized like the other sound effects: per species an `alert` (it
// noticed you), a `windup` (an attack is coming) and a `death` (on top of the shared kill
// thump). Registered with sfx.js as `<species>_<kind>`; pitch: the kind's profile pitch.
// h: sfx.js's building blocks (amp, noise, filter, tone, sweep).
export const VOICE_KINDS = ['alert', 'windup', 'death'];

export function voices({ amp, noise, filter, tone, sweep }) {
  // n quick band-passed clicks: chitter
  const clicks = (t, n, gap, f, level, out) => {
    for (let i = 0; i < n; i++) {
      const at = t + i * gap * (0.8 + Math.random() * 0.4);
      noise(at, 0.015, filter('bandpass', f * (0.85 + Math.random() * 0.3), 6, amp(at, 0.001, level, 0.012, out)));
    }
  };
  // a sawtooth bending f0 -> f1 -> f2 through a band: growls, yowls and groans
  const bend = (t, dur, f0, f1, f2, band, level, out) => {
    const o = filter('bandpass', band, 2, amp(t, 0.02, level, dur - 0.02, out));
    const s = o.context.createOscillator();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.4);
    s.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(o); s.start(t); s.stop(t + dur + 0.05);
  };
  const gloops = (t, n, lo, hi, spread, level, out, up = true) => {
    for (let i = 0; i < n; i++) {
      const at = t + i * spread, hz = lo + Math.random() * (hi - lo);
      tone('sine', hz, up ? hz * 2 : hz * 0.5, at, 0.06, amp(at, 0.003, level, 0.06, out));
    }
  };

  const V = {
    spider: {   // dry chitters and a hiss
      alert: (t, out, p) => clicks(t, 6, 0.035, 4200 * p, 0.7, out),
      windup: (t, out, p) => { noise(t, 0.3, filter('highpass', 4000 * p, 0.7, amp(t, 0.1, 0.25, 0.2, out))); clicks(t, 3, 0.04, 3500 * p, 0.25, out); },
      death: (t, out, p) => { tone('square', 1800 * p, 600 * p, t, 0.2, filter('lowpass', 3000, 1, amp(t, 0.003, 0.15, 0.2, out))); clicks(t + 0.05, 8, 0.04, 3000 * p, 0.5, out); },
    },
    stunder: {  // a heavy beast: a low growl, a snort, a groan
      alert: (t, out, p) => bend(t, 0.5, 70 * p, 90 * p, 60 * p, 400 * p, 0.5, out),
      windup: (t, out, p) => { noise(t, 0.25, filter('lowpass', 700 * p, 1, amp(t, 0.02, 0.5, 0.22, out))); bend(t, 0.3, 90 * p, 110 * p, 80 * p, 500 * p, 0.3, out); },
      death: (t, out, p) => bend(t, 0.9, 110 * p, 80 * p, 40 * p, 350 * p, 0.55, out),
    },
    snake: {    // hisses
      alert: (t, out, p) => noise(t, 0.5, filter('highpass', 4500 * p, 0.7, amp(t, 0.05, 0.3, 0.45, out))),
      windup: (t, out, p) => sweep(t, 0.25, 3000 * p, 7000 * p, 5000 * p, 2, 0.35, out, 0.03),
      death: (t, out, p) => sweep(t, 0.7, 6000 * p, 3000 * p, 1500 * p, 1.2, 0.3, out, 0.01),
    },
    octonaut: { // bubbly blips
      alert: (t, out, p) => gloops(t, 4, 400 * p, 900 * p, 0.06, 0.2, out),
      windup: (t, out, p) => { tone('sine', 300 * p, 700 * p, t, 0.2, amp(t, 0.02, 0.25, 0.18, out)); gloops(t + 0.1, 2, 600 * p, 900 * p, 0.05, 0.15, out); },
      death: (t, out, p) => gloops(t, 8, 300 * p, 800 * p, 0.07, 0.2, out, false),
    },
    fireface: { // flames: a whoomph, a swelling roar, sputtering out
      alert: (t, out, p) => { sweep(t, 0.4, 300 * p, 1200 * p, 400 * p, 1, 0.6, out, 0.05, 'lowpass'); clicks(t + 0.05, 5, 0.05, 2500 * p, 0.3, out); },
      windup: (t, out, p) => sweep(t, 0.45, 300 * p, 900 * p, 2000 * p, 1, 0.4, out, 0.25, 'lowpass'),
      death: (t, out, p) => { sweep(t, 0.8, 1500 * p, 800 * p, 200 * p, 1, 0.4, out, 0.01, 'lowpass'); clicks(t + 0.2, 10, 0.06, 2500 * p, 0.15, out); },
    },
    triangle: { // a machine: beeps, a rising charge, a glitching fall
      alert: (t, out, p) => {
        for (const [i, hz] of [880, 1320].entries())
          tone('square', hz * p, hz * p, t + i * 0.09, 0.07, filter('lowpass', 3000, 1, amp(t + i * 0.09, 0.003, 0.18, 0.07, out)));
      },
      windup: (t, out, p) => tone('square', 300 * p, 1200 * p, t, 0.35, filter('lowpass', 2500, 2, amp(t, 0.05, 0.2, 0.3, out))),
      death: (t, out, p) => {
        for (let i = 0; i < 6; i++) {
          const at = t + i * 0.07, hz = [1320, 990, 1175, 784, 880, 523][i] * p;
          tone('square', hz, hz * 0.97, at, 0.06, filter('lowpass', 2500, 1, amp(at, 0.002, 0.18, 0.06, out)));
        }
      },
    },
    firecat: {  // a yowl, a spitting hiss, a falling wail
      alert: (t, out, p) => bend(t, 0.45, 350 * p, 650 * p, 420 * p, 1200 * p, 0.3, out),
      windup: (t, out, p) => noise(t, 0.3, filter('bandpass', 3500 * p, 1.5, amp(t, 0.01, 0.4, 0.28, out))),
      death: (t, out, p) => bend(t, 0.7, 600 * p, 450 * p, 150 * p, 1000 * p, 0.3, out),
    },
    shraps: {   // clacking claws over an icy creak: a click-clack and a crackle, a snap, cracking apart
      alert: (t, out, p) => { clicks(t, 4, 0.07, 1800 * p, 0.6, out); tone('triangle', 1400 * p, 1900 * p, t + 0.05, 0.25, amp(t + 0.05, 0.02, 0.08, 0.22, out)); },
      windup: (t, out, p) => { clicks(t, 2, 0.09, 1500 * p, 0.7, out); noise(t + 0.05, 0.25, filter('bandpass', 2500 * p, 3, amp(t + 0.05, 0.05, 0.18, 0.2, out))); },
      death: (t, out, p) => {
        noise(t, 0.5, filter('bandpass', 1800 * p, 1.5, amp(t, 0.005, 0.35, 0.45, out)));
        clicks(t + 0.05, 9, 0.06, 2200 * p, 0.4, out);
        tone('triangle', 1200 * p, 500 * p, t + 0.1, 0.6, amp(t + 0.1, 0.02, 0.1, 0.55, out));
      },
    },
    spicy: {    // a little wheeled thing: squeaky chirps, wheels whirring backwards and a charge, sputtering out
      alert: (t, out, p) => {
        for (const [i, [f0, f1]] of [[700, 1300], [950, 1700]].entries())
          tone('square', f0 * p, f1 * p, t + i * 0.1, 0.08, filter('lowpass', 2800, 1, amp(t + i * 0.1, 0.004, 0.14, 0.08, out)));
      },
      windup: (t, out, p) => {
        sweep(t, 0.6, 600 * p, 1400 * p, 500 * p, 4, 0.22, out, 0.05);
        clicks(t, 7, 0.08, 2600 * p, 0.3, out);
        tone('sine', 300 * p, 900 * p, t + 0.55, 0.35, amp(t + 0.55, 0.05, 0.12, 0.3, out));
      },
      death: (t, out, p) => {
        tone('sawtooth', 900 * p, 90 * p, t, 0.8, filter('bandpass', 1200 * p, 2, amp(t, 0.01, 0.25, 0.78, out)));
        clicks(t + 0.1, 10, 0.07, 3200 * p, 0.35, out);
      },
    },
    wolla: {    // made of water: a bubbly warble, a long breath drawn in, and a splash running out
      alert: (t, out, p) => {
        gloops(t, 4, 300 * p, 520 * p, 0.06, 0.3, out);
        tone('sine', 380 * p, 760 * p, t + 0.22, 0.18, amp(t + 0.22, 0.01, 0.18, 0.17, out));
      },
      windup: (t, out, p) => {   // (the thunder and the blow are their own sounds, game/gusts.js)
        sweep(t + 0.1, 0.75, 500 * p, 1500 * p, 2400 * p, 3, 0.22, out, 0.4);
        gloops(t, 3, 250 * p, 400 * p, 0.09, 0.2, out);
      },
      death: (t, out, p) => {
        gloops(t, 9, 180 * p, 600 * p, 0.07, 0.28, out, false);
        noise(t + 0.55, 0.5, filter('bandpass', 1300 * p, 0.8, amp(t + 0.55, 0.005, 0.5, 0.45, out)));   // the splash
      },
    },
    wolk: {     // a sad cloud: a sighing "ohh", a deep breath and a hum, a long falling sob
      alert: (t, out, p) => {
        bend(t, 0.6, 340 * p, 310 * p, 220 * p, 650 * p, 0.3, out);
        noise(t, 0.45, filter('bandpass', 900 * p, 1, amp(t, 0.12, 0.05, 0.3, out)));   // the breath in it
      },
      windup: (t, out, p) => {   // (the crackle, the bolt and the thunder are their own sounds, game/juice.js)
        noise(t, 0.4, filter('bandpass', 650 * p, 1.5, amp(t, 0.25, 0.07, 0.15, out)));
        tone('sine', 196 * p, 233 * p, t + 0.2, 0.55, amp(t + 0.2, 0.12, 0.14, 0.42, out));
      },
      death: (t, out, p) => {   // and the plop of the cloud, and its sticks clattering down
        bend(t, 1.0, 380 * p, 320 * p, 150 * p, 600 * p, 0.36, out);
        noise(t + 0.72, 0.2, filter('lowpass', 450 * p, 0.8, amp(t + 0.72, 0.005, 0.55, 0.2, out)));
        clicks(t + 0.68, 2, 0.05, 1300 * p, 0.35, out);
        clicks(t + 0.9, 2, 0.06, 1600 * p, 0.3, out);
      },
    },
    gusto: {    // the boss: a big, mean laugh, a growl through the teeth, a long wail as he sinks
      alert: (t, out, p) => {
        for (let i = 0; i < 3; i++) bend(t + i * 0.16, 0.14, 160 * p, 190 * p, 140 * p, 700 * p, 0.45, out);   // "ha-ha-ha"
        noise(t, 0.5, filter('bandpass', 500 * p, 1, amp(t, 0.05, 0.08, 0.4, out)));
      },
      windup: (t, out, p) => { bend(t, 0.45, 90 * p, 120 * p, 80 * p, 520 * p, 0.4, out); clicks(t + 0.05, 4, 0.05, 2600 * p, 0.2, out); },
      death: (t, out, p) => {
        bend(t, 1.4, 260 * p, 200 * p, 70 * p, 600 * p, 0.5, out);
        noise(t + 0.95, 0.35, filter('lowpass', 380 * p, 0.8, amp(t + 0.95, 0.01, 0.6, 0.33, out)));   // the flop onto the floor
      },
    },
    totnar: {   // the tumbleweed boss: a dry cackle through three sets of teeth, a rattle, a creaking collapse
      alert: (t, out, p) => {
        for (let i = 0; i < 4; i++) bend(t + i * 0.13, 0.11, 210 * p, 240 * p, 180 * p, 900 * p, 0.32, out);   // "heh-heh-heh"
        clicks(t, 9, 0.045, 2200 * p, 0.35, out);   // the jaws clacking along
        noise(t, 0.55, filter('bandpass', 1400 * p, 0.8, amp(t, 0.05, 0.08, 0.45, out)));   // dry leaves
      },
      windup: (t, out, p) => { clicks(t, 6, 0.035, 1800 * p, 0.3, out); bend(t, 0.35, 120 * p, 150 * p, 100 * p, 600 * p, 0.3, out); },
      death: (t, out, p) => {
        bend(t, 1.3, 240 * p, 180 * p, 60 * p, 700 * p, 0.45, out);
        for (let i = 0; i < 5; i++) clicks(t + 0.5 + i * 0.12, 3, 0.03, (1200 + 300 * i) * p, 0.35, out);   // sticks and skulls clattering down
        noise(t + 0.9, 0.5, filter('lowpass', 900 * p, 0.8, amp(t + 0.9, 0.02, 0.4, 0.45, out)));
      },
    },
    squarlo: {   // the little tide boss: a squeaky gurgle, a bubbly war cry, a long sinking blub
      alert: (t, out, p) => {
        for (let i = 0; i < 3; i++) bend(t + i * 0.09, 0.08, 620 * p, 900 * p, 700 * p, 2400 * p, 0.3, out);   // "bip-bip-bip"
        gloops(t + 0.25, 6, 500 * p, 2 * 500 * p, 0.05, 0.25, out);
      },
      windup: (t, out, p) => { bend(t, 0.25, 500 * p, 800 * p, 650 * p, 2000 * p, 0.3, out); gloops(t, 3, 600 * p, 2 * 600 * p, 0.05, 0.2, out); },
      death: (t, out, p) => {
        bend(t, 1.1, 700 * p, 500 * p, 120 * p, 1600 * p, 0.4, out);
        gloops(t + 0.4, 10, 300 * p, 2 * 300 * p, 0.05, 0.3, out);
      },
    },
    foggery: {   // the frog boss: a deep double croak, a gulping ribbit, a long sinking croak and a squelch
      alert: (t, out, p) => {
        for (let i = 0; i < 2; i++) {
          const at = t + i * 0.24;
          bend(at, 0.2, 110 * p, 150 * p, 95 * p, 520 * p, 0.55, out);
          noise(at, 0.18, filter('bandpass', 380 * p, 3, amp(at, 0.01, 0.2, 0.17, out)));
        }
      },
      windup: (t, out, p) => { bend(t, 0.16, 140 * p, 230 * p, 160 * p, 700 * p, 0.4, out); gloops(t + 0.12, 2, 260 * p, 2 * 260 * p, 0.06, 0.25, out); },
      death: (t, out, p) => {
        bend(t, 1.4, 150 * p, 110 * p, 45 * p, 480 * p, 0.55, out);
        noise(t + 1.2, 0.35, filter('lowpass', 600 * p, 1, amp(t + 1.2, 0.02, 0.35, 0.3, out)));
        gloops(t + 0.8, 6, 180 * p, 2 * 180 * p, 0.07, 0.3, out, false);
      },
    },
    renew: {   // the time boss, a hero like you: a sharp "hah!", a grunt as he strikes, a long falling sigh
      alert: (t, out, p) => { bend(t, 0.22, 180 * p, 260 * p, 150 * p, 900 * p, 0.4, out); noise(t, 0.12, filter('bandpass', 1400 * p, 2, amp(t, 0.01, 0.15, 0.1, out))); },
      windup: (t, out, p) => { bend(t, 0.13, 150 * p, 190 * p, 120 * p, 800 * p, 0.3, out); noise(t, 0.1, filter('bandpass', 900 * p, 1.5, amp(t, 0.01, 0.12, 0.08, out))); },
      death: (t, out, p) => {
        bend(t, 1.3, 220 * p, 160 * p, 70 * p, 700 * p, 0.4, out);
        for (let i = 0; i < 6; i++) { const at = t + 0.6 + i * 0.13, hz = (1760 - i * 180) * p; tone('sine', hz, hz * 0.98, at, 0.25, amp(at, 0.003, 0.1, 0.22, out)); }
      },
    },
    flimmer: {   // a blurry little person: a wobbly, breathy giggle, a sharp zing as it comes into focus, a shimmer fizzing away
      alert: (t, out, p) => {
        for (let i = 0; i < 4; i++) { const at = t + i * 0.07; bend(at, 0.08, (520 + 40 * i) * p, 640 * p, 480 * p, 1600 * p, 0.18, out); }
        noise(t, 0.3, filter('bandpass', 3000 * p, 2, amp(t, 0.05, 0.1, 0.25, out)));
      },
      windup: (t, out, p) => { tone('triangle', 700 * p, 1800 * p, t, 0.16, amp(t, 0.01, 0.16, 0.15, out)); clicks(t + 0.14, 2, 0.04, 3200 * p, 0.25, out); },
      death: (t, out, p) => {
        bend(t, 0.5, 600 * p, 420 * p, 200 * p, 1400 * p, 0.25, out);
        for (let i = 0; i < 7; i++) { const at = t + 0.1 + i * 0.09, hz = (2400 - i * 220) * p; tone('sine', hz, hz * 1.04, at, 0.12, amp(at, 0.003, 0.07, 0.11, out)); }
        noise(t + 0.1, 0.8, filter('highpass', 4000 * p, 0.7, amp(t + 0.1, 0.1, 0.12, 0.65, out)));
      },
    },
    flip: {   // the ring boss: glassy chimes ringing round, a rising shimmer, rings clattering down
      alert: (t, out, p) => {
        for (const [i, hz] of [880, 1175, 988, 1319].entries()) { const at = t + i * 0.08; tone('triangle', hz * p, hz * 1.02 * p, at, 0.35, amp(at, 0.005, 0.12, 0.35, out)); }
        bend(t, 0.4, 330 * p, 440 * p, 300 * p, 1400 * p, 0.2, out);
      },
      windup: (t, out, p) => { tone('sine', 660 * p, 1320 * p, t, 0.35, amp(t, 0.05, 0.15, 0.3, out)); clicks(t, 4, 0.06, 3200 * p, 0.15, out); },
      death: (t, out, p) => {
        bend(t, 1.2, 520 * p, 400 * p, 110 * p, 1500 * p, 0.35, out);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
          const at = t + 0.5 + i * 0.25 + j * 0.05, hz = (1400 + 300 * j - 200 * i) * p;
          tone('triangle', hz, hz, at, 0.15, amp(at, 0.002, 0.12, 0.15, out));   // the rings landing, one after the other
        }
      },
    },
    squirtle: {   // a Squirtle: a wet chirp, a hiss, a gurgle
      alert: (t, out, p) => { bend(t, 0.14, 1200 * p, 1700 * p, 1300 * p, 3500 * p, 0.25, out); gloops(t + 0.1, 3, 800 * p, 2 * 800 * p, 0.05, 0.15, out); },
      windup: (t, out, p) => noise(t, 0.18, filter('highpass', 3000 * p, 0.8, amp(t, 0.03, 0.18, 0.15, out))),
      death: (t, out, p) => { bend(t, 0.5, 1000 * p, 700 * p, 250 * p, 2500 * p, 0.3, out); gloops(t + 0.2, 5, 400 * p, 2 * 400 * p, 0.05, 0.2, out); },
    },
    mecked: {    // a Mecked: a goofy honking bark, a snort and its jaws clacking open, a long gurgling groan
      alert: (t, out, p) => { bend(t, 0.22, 260 * p, 380 * p, 300 * p, 900 * p, 0.45, out); bend(t + 0.26, 0.2, 280 * p, 400 * p, 260 * p, 900 * p, 0.4, out); },
      windup: (t, out, p) => { noise(t, 0.16, filter('bandpass', 900 * p, 1.2, amp(t, 0.01, 0.4, 0.15, out))); clicks(t + 0.12, 3, 0.05, 2200 * p, 0.35, out); },
      death: (t, out, p) => { bend(t, 1.0, 300 * p, 220 * p, 70 * p, 700 * p, 0.5, out); gloops(t + 0.5, 4, 120 * p, 240 * p, 0.09, 0.2, out, false); },
    },
    tornado: {  // a cross little wind spirit: a whistling huff, a sharp intake of breath, a sigh that blows itself out
      alert: (t, out, p) => {
        bend(t, 0.3, 520 * p, 760 * p, 600 * p, 1400 * p, 0.3, out);
        noise(t, 0.35, filter('bandpass', 1800 * p, 3, amp(t, 0.05, 0.3, 0.3, out)));
      },
      windup: (t, out, p) => {   // (the twisters' whirl is their own sound, game/juice.js)
        const f = filter('bandpass', 900 * p, 2, amp(t, 0.12, 0.3, 0.2, out));
        f.frequency.setValueAtTime(900 * p, t); f.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.3);
        noise(t, 0.32, f);
      },
      death: (t, out, p) => {
        bend(t, 0.8, 600 * p, 420 * p, 160 * p, 1200 * p, 0.35, out);
        sweep(t + 0.1, 1.2, 1600 * p, 700 * p, 150 * p, 2.5, 0.35, out, 0.05);
      },
    },
    bolime: {   // a Bolime: a bubbling, rising burble, a deep breath drawn in, a long collapsing gloop
      alert: (t, out, p) => gloops(t, 6, 300 * p, 700 * p, 0.05, 0.22, out),
      windup: (t, out, p) => { bend(t, 0.35, 180 * p, 320 * p, 260 * p, 900 * p, 0.3, out); gloops(t + 0.15, 3, 400 * p, 800 * p, 0.06, 0.15, out); },
      death: (t, out, p) => { bend(t, 0.9, 260 * p, 160 * p, 60 * p, 700 * p, 0.4, out); gloops(t + 0.3, 8, 120 * p, 400 * p, 0.08, 0.22, out, false); },
    },
    slomo: {   // the slime boss: a huge bubbling roar, a deep slurping heave, a long gurgling collapse
      alert: (t, out, p) => {
        bend(t, 0.7, 70 * p, 110 * p, 60 * p, 380 * p, 0.55, out);
        gloops(t + 0.15, 9, 90 * p, 260 * p, 0.06, 0.28, out, false);
        noise(t, 0.6, filter('bandpass', 260 * p, 2, amp(t, 0.05, 0.25, 0.5, out)));
      },
      windup: (t, out, p) => { bend(t, 0.4, 90 * p, 140 * p, 110 * p, 500 * p, 0.35, out); gloops(t + 0.1, 4, 140 * p, 320 * p, 0.07, 0.22, out); },
      death: (t, out, p) => {
        bend(t, 1.8, 120 * p, 80 * p, 30 * p, 400 * p, 0.55, out);
        gloops(t + 0.5, 14, 70 * p, 220 * p, 0.09, 0.3, out, false);
        noise(t + 1.2, 0.8, filter('lowpass', 500 * p, 1, amp(t + 1.2, 0.05, 0.35, 0.7, out)));
      },
    },
    mansk: {   // the mask: a hollow, breathy moan through his mouth, a long breath drawn in, a cracking sigh dying away
      alert: (t, out, p) => {
        bend(t, 0.9, 140 * p, 190 * p, 120 * p, 600 * p, 0.35, out);
        noise(t, 0.8, filter('bandpass', 700 * p, 3, amp(t, 0.1, 0.25, 0.65, out)));
      },
      windup: (t, out, p) => { sweep(t, 0.5, 400 * p, 1200 * p, 900 * p, 3, 0.28, out, 0.2); bend(t + 0.1, 0.4, 160 * p, 220 * p, 200 * p, 700 * p, 0.2, out); },
      death: (t, out, p) => {
        bend(t, 1.6, 200 * p, 130 * p, 50 * p, 600 * p, 0.45, out);
        noise(t + 0.2, 1.4, filter('bandpass', 500 * p, 2, amp(t + 0.2, 0.2, 0.3, 1.1, out)));
        noise(t + 1.4, 0.3, filter('highpass', 2500 * p, 1, amp(t + 1.4, 0.005, 0.3, 0.25, out)));
      },
    },
    moose: {     // a grumpy Moose: a nasal, wavering bellow, two hard snorts through its nose, a long groan sinking away
      alert: (t, out, p) => {
        bend(t, 0.75, 150 * p, 230 * p, 130 * p, 900 * p, 0.5, out);
        noise(t + 0.05, 0.6, filter('bandpass', 700 * p, 4, amp(t + 0.05, 0.1, 0.18, 0.45, out)));
      },
      windup: (t, out, p) => {
        for (const at of [0, 0.22]) noise(t + at, 0.14, filter('bandpass', 1200 * p, 1.5, amp(t + at, 0.008, 0.5, 0.12, out)));
        bend(t + 0.05, 0.3, 120 * p, 150 * p, 110 * p, 600 * p, 0.25, out);
      },
      death: (t, out, p) => { bend(t, 1.3, 180 * p, 130 * p, 55 * p, 700 * p, 0.5, out); noise(t + 0.9, 0.5, filter('lowpass', 500 * p, 1, amp(t + 0.9, 0.05, 0.2, 0.4, out))); },
    },
    monteur: {   // the stone moose: a long, low bellow rising and falling, stone grinding under it, a crumbling groan
      alert: (t, out, p) => {
        bend(t, 1.1, 70 * p, 140 * p, 85 * p, 420 * p, 0.5, out);
        noise(t + 0.1, 0.9, filter('lowpass', 500 * p, 2, amp(t + 0.1, 0.15, 0.3, 0.7, out)));
      },
      windup: (t, out, p) => { noise(t, 0.35, filter('bandpass', 260 * p, 2, amp(t, 0.03, 0.45, 0.3, out))); bend(t + 0.05, 0.35, 90 * p, 120 * p, 100 * p, 450 * p, 0.3, out); },
      death: (t, out, p) => {
        bend(t, 1.8, 120 * p, 80 * p, 40 * p, 380 * p, 0.5, out);
        for (let i = 0; i < 6; i++) noise(t + 0.3 + i * 0.22, 0.12, filter('bandpass', (300 + 120 * i) * p, 3, amp(t + 0.3 + i * 0.22, 0.005, 0.3, 0.1, out)));
      },
    },
    sollmeldon: {   // the three-headed mud dinosaur: three throats roaring at once (a low chord), a wet hiss and growl, three groans sinking into gurgling mud
      alert: (t, out, p) => {
        for (const [k, at] of [[1, 0], [1.26, 0.06], [1.5, 0.12]]) bend(t + at, 0.8, 75 * p * k, 125 * p * k, 70 * p * k, 450 * p, 0.32, out);
        gloops(t + 0.25, 6, 80 * p, 220 * p, 0.07, 0.22, out, false);
      },
      windup: (t, out, p) => { noise(t, 0.3, filter('bandpass', 1800 * p, 2, amp(t, 0.04, 0.3, 0.25, out))); bend(t + 0.05, 0.35, 85 * p, 115 * p, 95 * p, 420 * p, 0.3, out); },
      death: (t, out, p) => {
        for (const [k, at] of [[1, 0], [1.26, 0.3], [1.5, 0.6]]) bend(t + at, 1.3, 130 * p * k, 85 * p * k, 35 * p * k, 420 * p, 0.35, out);
        gloops(t + 0.8, 16, 60 * p, 200 * p, 0.1, 0.3, out, false);
      },
    },
    qualmos: {   // the core's amphibian: a deep gurgling croak, a wet hiss through his teeth, a long bubbling sinking groan
      alert: (t, out, p) => {
        bend(t, 0.6, 90 * p, 150 * p, 80 * p, 520 * p, 0.5, out);
        bend(t + 0.35, 0.5, 120 * p, 170 * p, 95 * p, 600 * p, 0.4, out);
        gloops(t + 0.1, 6, 160 * p, 420 * p, 0.06, 0.2, out, false);
      },
      windup: (t, out, p) => { noise(t, 0.35, filter('bandpass', 2400 * p, 2, amp(t, 0.05, 0.3, 0.3, out))); bend(t + 0.1, 0.3, 110 * p, 160 * p, 120 * p, 600 * p, 0.25, out); },
      death: (t, out, p) => {
        bend(t, 1.8, 140 * p, 90 * p, 35 * p, 500 * p, 0.5, out);
        gloops(t + 0.4, 12, 90 * p, 300 * p, 0.1, 0.25, out, false);
        noise(t + 1, 1, filter('lowpass', 700 * p, 1, amp(t + 1, 0.1, 0.3, 0.9, out)));
      },
    },
    slug: {   // a Slug: a low wet gurgle, a slurp drawing breath, a long deflating sigh
      alert: (t, out, p) => { bend(t, 0.4, 110 * p, 150 * p, 95 * p, 500 * p, 0.4, out); gloops(t + 0.2, 4, 150 * p, 300 * p, 0.07, 0.18, out, false); },
      windup: (t, out, p) => {
        const f = filter('bandpass', 500 * p, 3, amp(t, 0.05, 0.35, 0.3, out));
        f.frequency.setValueAtTime(400 * p, t); f.frequency.exponentialRampToValueAtTime(1400 * p, t + 0.35);
        noise(t, 0.4, f);
      },
      death: (t, out, p) => { bend(t, 1.1, 160 * p, 110 * p, 50 * p, 450 * p, 0.45, out); gloops(t + 0.4, 6, 90 * p, 200 * p, 0.12, 0.2, out, false); },
    },
    snapskull: {   // a skull come to life: chattering teeth, a hollow clack, a crack
      alert: (t, out, p) => clicks(t, 7, 0.04, 2600 * p, 0.45, out),
      windup: (t, out, p) => { clicks(t, 3, 0.05, 2000 * p, 0.35, out); tone('sine', 520 * p, 300 * p, t, 0.08, amp(t, 0.002, 0.2, 0.08, out)); },
      death: (t, out, p) => { noise(t, 0.06, filter('highpass', 2500 * p, 0.8, amp(t, 0.001, 0.5, 0.06, out))); clicks(t + 0.05, 5, 0.04, 1500 * p, 0.35, out); },
    },
  };
  const out = {};
  for (const [species, kinds] of Object.entries(V)) for (const k of VOICE_KINDS) out[`${species}_${k}`] = kinds[k];
  return out;
}
