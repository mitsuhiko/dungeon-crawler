// How the voices are made, heard and seen. The samples in learn/audio/ were made by
// tools/learn-voices.py with the game's own models and settings (as tools/narration.py says the
// game's lines), and samples.json keeps what the models made on the way: the voices' fingerprints
// (speaker embeddings), the words as tokens, the speech tokens, how alike the results are.
// The voices' samples (what Base takes a voice from) are not recordings of people: both voices are
// mixes, baked, so their samples were said by the model too (docs/narration.md, "Made voices").
// Modes (data-mode): voices (a voice's sample against a line said in it), pipeline (the steps one by one), mix,
// takes (seeds), instruct (instructions), filter (the robot's).
import { canvas, loop, html, t as tr, lang } from '../deck.js';

const AUDIO = new URL('../audio/', import.meta.url);
let data = null;
const samples = () => (data ??= fetch(new URL('samples.json', AUDIO)).then(r => r.json()));
const sample = (d, id) => d.samples[`${id}.${lang}`];
let frame = 0.08;   // seconds of sound a step of speech tokens makes (samples.json)

// ---- sound: decoding, one clip playing at a time --------------------------------------------------
let ac = null;
const audio = () => (ac ??= new AudioContext());
const buffers = new Map();
const bufferOf = file => {
  if (!buffers.has(file)) buffers.set(file, fetch(new URL(file, AUDIO)).then(r => r.arrayBuffer()).then(b => audio().decodeAudioData(b)));
  return buffers.get(file);
};
let playing = null;
function stop() { if (playing) { try { playing.src.stop(); } catch { /* not started */ } playing = null; } }
async function play(file) {
  const a = audio();
  if (a.state === 'suspended') await a.resume();
  const buffer = await bufferOf(file);
  stop();
  const src = a.createBufferSource();
  src.buffer = buffer;
  src.connect(a.destination);
  const p = { src, file, start: a.currentTime + 0.03, seconds: buffer.duration };
  src.onended = () => { if (playing === p) playing = null; };
  src.start(p.start);
  playing = p;
}
// how far a file is played (seconds), or null
const playedOf = file => (playing?.file === file ? Math.max(0, ac.currentTime - playing.start) : null);

// ---- pictures of sound ----------------------------------------------------------------------------
// a spectrogram: how loud each pitch is (bands up the side, low at the bottom), moment by moment
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr_ = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr_; im[q] = im[p] - ti; re[p] += tr_; im[p] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
const mel = hz => 2595 * Math.log10(1 + hz / 700), unmel = m => 700 * (10 ** (m / 2595) - 1);
const PALETTE = [[7, 9, 16], [52, 22, 92], [150, 40, 110], [240, 100, 50], [255, 210, 110], [255, 250, 225]];
const paint = v => {
  const x = Math.max(0, Math.min(1, v)) * (PALETTE.length - 1), i = Math.min(PALETTE.length - 2, Math.floor(x)), f = x - i;
  return PALETTE[i].map((c, k) => c + (PALETTE[i + 1][k] - c) * f);
};
const pictures = new Map();
async function pictureOf(file, maxHz = 8000) {
  const key = `${file}@${maxHz}`;
  if (!pictures.has(key)) pictures.set(key, bufferOf(file).then(buffer => {
    const x = buffer.getChannelData(0), rate = buffer.sampleRate, N = rate > 32000 ? 2048 : 1024, hop = Math.round(rate / 100);
    const frames = Math.max(1, Math.floor((x.length - N) / hop)), B = 96;
    const edges = Array.from({ length: B + 1 }, (_, i) => Math.round(unmel(mel(50) + (mel(maxHz) - mel(50)) * i / B) / rate * N));
    const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const db = new Float32Array(frames * B), re = new Float32Array(N), im = new Float32Array(N);
    let top = -Infinity;
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let b = 0; b < B; b++) {
        const lo = edges[b], hi = Math.max(lo + 1, edges[b + 1]);
        let p = 0;
        for (let k = lo; k < hi; k++) p += re[k] * re[k] + im[k] * im[k];
        const v = 10 * Math.log10(p / (hi - lo) + 1e-12);
        db[f * B + b] = v;
        if (v > top) top = v;
      }
    }
    const img = new OffscreenCanvas(frames, B), g = img.getContext('2d'), pix = g.createImageData(frames, B);
    for (let f = 0; f < frames; f++) for (let b = 0; b < B; b++) {
      const [r, gg, bb] = paint((db[f * B + b] - top + 70) / 70), o = ((B - 1 - b) * frames + f) * 4;
      pix.data[o] = r; pix.data[o + 1] = gg; pix.data[o + 2] = bb; pix.data[o + 3] = 255;
    }
    g.putImageData(pix, 0, 0);
    return { img, seconds: buffer.duration };
  }));
  return pictures.get(key);
}

// a fingerprint: its 2048 numbers as 64 x 32 squares, orange above zero, blue below
function drawPrint(g, x, y, w, h, values) {
  const cols = 64, rows = Math.ceil(values.length / cols), s = [...values].map(Math.abs).sort((a, b) => a - b)[Math.floor(values.length * 0.97)];
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(-1, Math.min(1, values[i] / s)), a = Math.abs(v);
    g.fillStyle = v >= 0 ? `rgb(${30 + 225 * a},${30 + 108 * a},${40 * (1 - a) + 20})` : `rgb(${30 * (1 - a) + 20},${30 + 181 * a},${40 + 215 * a})`;
    g.fillRect(x + (i % cols) * cw, y + Math.floor(i / cols) * ch, Math.ceil(cw), Math.ceil(ch));
  }
}
// as tools/narration.py mixed_prompt: the weighted average, as long as the weighted lengths
function mixPrints(prints, weights) {
  const len = v => Math.hypot(...v), n = prints[0].length;
  const m = Array.from({ length: n }, (_, i) => prints.reduce((s, p, k) => s + weights[k] * p[i], 0));
  const want = prints.reduce((s, p, k) => s + weights[k] * len(p), 0), have = len(m);
  return m.map(v => v / have * want);
}
// speech tokens: a column a step (80 ms), a row a codebook, each code its own colour
const codeColor = (code, row) => `hsl(${(code * 137.508) % 360} ${row ? 50 : 80}% ${row ? 42 : 58}%)`;
const stepsOf = s => s.sentences.flatMap(sen => sen.codes.map((codes, f) => ({ codes, at: sen.start + f * frame })));
function drawCodes(g, x, y, w, h, steps, seconds, { rows = 16, upto = Infinity, fill = 16 } = {}) {
  const cw = frame / seconds * w, rh = h / rows;
  steps.forEach((s, i) => {
    if (i >= upto) return;
    const sx = x + s.at / seconds * w;
    for (let r = 0; r < rows; r++) {
      if (i === Math.floor(upto) - 1 && r >= fill) break;
      g.fillStyle = codeColor(s.codes[r], r);
      g.fillRect(sx, y + r * rh, Math.max(1, cw - 0.6), Math.max(1, rh - (rows > 1 ? 0.4 : 0)));
    }
  });
}
// a spectrogram of a file, with the playhead when it plays; `span`: the seconds the width stands
// for (the file's own when left out), so clips side by side keep their lengths
async function drawPicture(g, x, y, w, h, file, { maxHz, span } = {}) {
  const p = await pictureOf(file, maxHz), pw = span ? w * Math.min(1, p.seconds / span) : w;
  g.fillStyle = '#070910';
  g.fillRect(x, y, w, h);
  g.imageSmoothingEnabled = true;
  g.drawImage(p.img, x, y, pw, h);
  const at = playedOf(file);
  if (at != null && at <= p.seconds) { g.fillStyle = '#ffffffcc'; g.fillRect(x + at / p.seconds * pw - 1, y, 2, h); }
  return p;
}

// a clip to hear and see: its picture, a button, its words (file: a file, or what gives the one now)
function clipView(parent, file, title, words, { w = 640, h = 70, maxHz, span } = {}) {
  const box = html(parent, `<div style="margin:6px 0 10px;min-width:0">
    <div class="row" style="margin:0 0 4px"><button class="play">\u25B6 ${title}</button><span class="small muted">${words ?? ''}</span></div></div>`);
  const { g, c } = canvas(box, w, h);
  c.style.cursor = 'pointer';
  const now = () => (typeof file === 'function' ? file() : file), go = () => play(now());
  box.querySelector('.play').onclick = go;
  c.onclick = go;
  return () => drawPicture(g, 0, 0, w, h, now(), { maxHz, span });
}
// draws a list of views while the demo is on screen (each picture is worked out once)
function keepDrawing(el, views) {
  let busy = false;
  loop(el, () => {
    if (busy) return;
    busy = true;
    Promise.all(views.map(v => v())).finally(() => { busy = false; });
  });
}
const loading = el => html(el, `<div class="loading">${tr('Loading the voices...', 'Die Stimmen werden geladen...')}</div>`);

export default async function mount(el) {
  const wait = loading(el);
  const d = await samples();
  frame = d.frame;
  wait.remove();
  const mode = el.dataset.mode ?? 'voices';
  ({ voices, pipeline, mix, takes, instruct, filter })[mode](el, d);
  return stop;
}

// ---- the voices' samples, and lines said in them--------------------------------------------------------
function voices(el, d) {
  const g = d.voices.glassmaker, c = d.voices.child, glass = sample(d, 'glass'), woke = sample(d, 'woke'), robot = sample(d, 'woke-robot');
  const span = Math.max(g.seconds, c.seconds, glass.seconds, woke.seconds) + 0.3, opt = { w: 320, h: 84, span };
  const grid = html(el, '<div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr;gap:0 14px;align-items:end"></div>');
  const cell = s => html(grid, `<div style="min-width:0">${s ?? ''}</div>`);
  const views = [];
  for (const [who, v, line, more] of [[tr('The glassmaker', 'Der Glasmacher'), g, glass, null], [tr('The robot', 'Der Roboter'), c, woke, robot]]) {
    cell(`<h3 style="margin:0 0 12px">${who}</h3>`);
    views.push(clipView(cell(), v.sample, tr('the voice sample', 'die Stimmprobe'), '', opt));
    views.push(clipView(cell(), line.file, tr('a line from the game', 'ein Satz aus dem Spiel'), '', opt));
    const last = cell();
    if (more) views.push(clipView(last, more.file, tr('+ the clockwork filter', '+ der Uhrwerk-Filter'), '', opt));
  }
  const buttons = el.querySelectorAll('.play');
  buttons[0].title = g.words; buttons[2].title = c.words;
  html(el, `<div class="small muted" style="margin-top:4px">${tr('What they say', 'Was sie sagen')}: "${glass.text}" · "${woke.text}"</div>`);
  keepDrawing(el, views);
}

// ---- the whole way, step by step ------------------------------------------------------------------
function pipeline(el, d) {
  const STEPS = [
    ['sample', tr('Voice sample', 'Stimmprobe')], ['print', tr('Fingerprint', 'Fingerabdruck')], ['prompt', tr('The order', 'Der Auftrag')],
    ['talker', 'Talker'], ['predictor', tr('Code predictor', 'Code-Prädiktor')], ['decoder', tr('Decoder', 'Decoder')], ['finish', tr('Finishing', 'Feinschliff')],
  ];
  const top = html(el, `<div><div class="row">
      <label>${tr('voice', 'Stimme')} <select class="who"><option value="glass">${tr('the glassmaker', 'der Glasmacher')}</option><option value="woke">${tr('the robot', 'der Roboter')}</option></select></label>
      <button class="prev">\u25C0</button><button class="next">${tr('next step', 'nächster Schritt')} \u25B6</button></div>
    <div class="row steps-bar" style="gap:4px">${STEPS.map(([k, n], i) => `<button data-i="${i}" style="padding:3px 7px;font-size:12px">${i + 1}. ${n}</button>`).join('')}</div></div>`);
  const stage = html(el, '<div style="margin-top:8px"></div>');
  const out = html(el, '<div class="out"></div>');
  let at = 0, who = 'glass', since = 0, draw = null;

  function show(i) {
    at = Math.max(0, Math.min(STEPS.length - 1, i));
    top.querySelectorAll('[data-i]').forEach(b => b.classList.toggle('on', +b.dataset.i === at));
    stop();
    stage.innerHTML = '';
    since = performance.now() / 1000;
    const s = sample(d, who), voice = who === 'glass' ? 'glassmaker' : 'child', v = d.voices[voice], steps = stepsOf(s);
    const say = (en, de) => { out.innerHTML = tr(en, de); };
    const name = who === 'glass' ? tr('the glassmaker', 'der Glasmacher') : tr('the robot (a child\'s voice)', 'der Roboter (eine Kinderstimme)');
    const kind = STEPS[at][0];
    if (kind === 'sample') {
      const view = clipView(stage, v.sample, tr('listen', 'anhören'), `"${v.words}"`, { h: 120 });
      draw = view;
      say(`<b>Base</b> listens to half a minute of the voice, its <b>voice sample</b>: here ${name}, ${v.seconds} of its 30 seconds. Usually that's a recording of a person. The game's samples are not: the AI said them itself, in a mix of voices (see "A voice as 2048 numbers"). First Base turns the sound into a picture like this one, a <i>spectrogram</i>: 128 bands from low to high, 94 times a second. A computer can't hear, but it can look at numbers.`,
        `<b>Base</b> hört sich eine halbe Minute der Stimme an, ihre <b>Stimmprobe</b>: hier ${name}, ${v.seconds.toLocaleString('de')} ihrer 30 Sekunden. Meistens ist das eine Aufnahme von einem Menschen. Die Proben des Spiels nicht: Die hat die KI selbst gesprochen, mit einer Mischung aus Stimmen (siehe "Eine Stimme als 2048 Zahlen"). Zuerst macht Base aus dem Klang ein Bild wie dieses, ein <i>Spektrogramm</i>: 128 Streifen von tief bis hoch, 94-mal pro Sekunde. Ein Computer kann nicht hören, aber er kann Zahlen anschauen.`);
    } else if (kind === 'print') {
      const { g, w, h } = canvas(stage, 640, 200);
      draw = async () => {
        g.clearRect(0, 0, w, h);
        await drawPicture(g, 0, 40, 200, 120, v.sample);
        g.fillStyle = '#e7dfcf'; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText('\u2192', 235, 108);
        g.font = '10px sans-serif'; g.fillText(tr('speaker', 'Sprecher-'), 235, 74); g.fillText('encoder', 235, 86); g.textAlign = 'start';
        drawPrint(g, 270, 20, 370, 160, v.fingerprint);
        g.fillStyle = '#9aa3ad'; g.fillText(v.fingerprint.slice(0, 6).map(n => n.toFixed(2)).join('  ') + '  ...', 270, 196);
      };
      say(`A smaller network inside Base, the <b>speaker encoder</b>, was trained only to tell voices apart. It looks at the whole picture and writes down <b>2048 numbers</b>: the voice's fingerprint. Each square on the right is one of them (orange above zero, blue below). They say nothing about the words, only how the voice sounds: how high, how big, how bright, how breathy.`,
        `Ein kleineres Netz in Base, der <b>Sprecher-Encoder</b>, wurde nur darauf trainiert, Stimmen auseinanderzuhalten. Er schaut sich das ganze Bild an und schreibt <b>2048 Zahlen</b> auf: den Fingerabdruck der Stimme. Jedes Quadrat rechts ist eine davon (orange über null, blau darunter). Sie sagen nichts über die Worte, nur wie die Stimme klingt: wie hoch, wie groß, wie hell, wie hauchig.`);
    } else if (kind === 'prompt') {
      const chips = s.sentences.map(sen => sen.tokens.map(t => `<span class="chip">${t.replace(/ /g, '\u2423')}</span>`).join('')).join(' <span class="muted">|</span> ');
      stage.innerHTML = `<table class="small"><tr><td><b>${tr('instruction', 'Anweisung')}</b></td><td>"${s.instruct}"</td></tr>
        <tr><td><b>${tr('language', 'Sprache')}</b></td><td>${lang === 'de' ? 'German' : 'English'}</td></tr>
        <tr><td><b>${tr('speaker', 'Sprecher')}</b></td><td><canvas class="mini" style="display:block;width:192px;height:48px;margin-bottom:4px"></canvas>${tr('the fingerprint, where one of its own nine voices would go', 'der Fingerabdruck, wo sonst eine seiner neun eigenen Stimmen steht')}</td></tr>
        <tr><td><b>${tr('words', 'Worte')}</b></td><td>${chips}</td></tr></table>`;
      const mini = stage.querySelector('.mini');
      mini.width = 384; mini.height = 96;
      drawPrint(mini.getContext('2d'), 0, 0, 384, 96, v.fingerprint);
      draw = null;
      say(`Now <b>CustomVoice</b> gets its order. The words are cut into <b>tokens</b>, pieces of words a language model knows (\u2423 is a space). The game says a line one sentence at a time, so here each sentence (between the | marks) is its own order. The instruction is plain English, in every language.`,
        `Jetzt bekommt <b>CustomVoice</b> seinen Auftrag. Die Worte werden in <b>Tokens</b> geschnitten, Wortstücke, die ein Sprachmodell kennt (\u2423 ist ein Leerzeichen). Das Spiel lässt eine Zeile Satz für Satz sprechen, darum ist hier jeder Satz (zwischen den |-Zeichen) ein eigener Auftrag. Die Anweisung ist einfaches Englisch, in jeder Sprache.`);
    } else if (kind === 'talker' || kind === 'predictor') {
      const all = kind === 'predictor', { g, w, h } = canvas(stage, 640, all ? 190 : 80), seconds = s.seconds, last = steps.length;
      draw = async () => {
        const t = performance.now() / 1000 - since, per = d.frame * (all ? 1.5 : 1), cycle = last * per + 2;
        const k = Math.min(last, (t % cycle) / per), fill = all ? Math.floor((k % 1) * 16) + 1 : 16;
        g.fillStyle = '#070910'; g.fillRect(0, 0, w, h);
        drawCodes(g, 0, 18, w, h - 22, steps, seconds, { rows: all ? 16 : 1, upto: Math.ceil(k), fill });
        const cur = steps[Math.max(0, Math.ceil(k) - 1)];
        g.fillStyle = '#e7dfcf'; g.font = '12px sans-serif';
        g.fillText(`${tr('step', 'Schritt')} ${Math.ceil(k)} / ${last}   ${tr('code', 'Code')} ${cur.codes[0]}${all ? `  + ${cur.codes.slice(1, 5).join(', ')} ...` : ''}`, 4, 13);
      };
      if (!all) say(`The <b>Talker</b> is the big part: 28 layers, most of the model's 1.7 billion numbers. It works like a chat AI, but instead of the next word it writes the next <b>speech token</b>: a number from 0 to 2047 that stands for the next 80 milliseconds of sound, 12.5 a second. Each square is one. It doesn't pick the most likely one every time: it rolls dice among the likely ones, from a seed. That's what makes it sound alive.`,
        `Der <b>Talker</b> ist der große Teil: 28 Schichten, die meisten der 1,7 Milliarden Zahlen des Modells. Er arbeitet wie eine Chat-KI, aber statt des nächsten Worts schreibt er das nächste <b>Sprach-Token</b>: eine Zahl von 0 bis 2047, die für die nächsten 80 Millisekunden Klang steht, 12,5 pro Sekunde. Jedes Quadrat ist eins. Er nimmt nicht jedes Mal das wahrscheinlichste: Er würfelt unter den wahrscheinlichen, mit einem Seed. Darum klingt es lebendig.`);
      else say(`One number for 80 milliseconds is only a rough sketch. So after every step a small helper, the <b>code predictor</b> (5 layers), adds 15 more numbers below it, each one a finer detail: first what is said, then the voice, then the breath and the crackle. Like describing a picture: "a house", "a red house", "a red house with a crooked door"... 16 numbers for every 80 milliseconds.`,
        `Eine Zahl für 80 Millisekunden ist nur eine grobe Skizze. Darum fügt nach jedem Schritt ein kleiner Helfer, der <b>Code-Prädiktor</b> (5 Schichten), 15 weitere Zahlen darunter hinzu, jede ein feineres Detail: erst was gesagt wird, dann die Stimme, dann der Atem und das Knistern. Wie wenn man ein Bild beschreibt: "ein Haus", "ein rotes Haus", "ein rotes Haus mit einer schiefen Tür"... 16 Zahlen für alle 80 Millisekunden.`);
    } else if (kind === 'decoder') {
      const { g, w, h, c } = canvas(stage, 640, 220), seconds = s.seconds;
      const btn = html(stage, `<div class="row"><button>\u25B6 ${tr('listen', 'anhören')}</button></div>`).querySelector('button');
      btn.onclick = c.onclick = () => play(s.file);
      draw = async () => {
        g.fillStyle = '#070910'; g.fillRect(0, 0, w, h);
        drawCodes(g, 0, 0, w, 90, steps, seconds);
        await drawPicture(g, 0, 100, w, 120, s.file);
        const p = playedOf(s.file);
        if (p != null) { g.fillStyle = '#ffffffcc'; g.fillRect(p / seconds * w - 1, 0, 2, 90); }
      };
      say(`The <b>decoder</b> turns each column of 16 numbers back into sound: 1920 tiny steps of the sound wave, 24,000 a second. Play it, and watch: every column above becomes the bit of sound under it. Where there are no columns, there is a pause: the game put it there, between two sentences.`,
        `Der <b>Decoder</b> macht aus jeder Spalte mit 16 Zahlen wieder Klang: 1920 winzige Schritte der Schallwelle, 24.000 pro Sekunde. Spiel es ab und schau zu: Jede Spalte oben wird zum Stück Klang darunter. Wo keine Spalten sind, ist eine Pause: Die hat das Spiel dort hingesetzt, zwischen zwei Sätze.`);
    } else {
      const views = [clipView(stage, s.file, tr('as the model said it, sentence by sentence', 'wie das Modell es gesagt hat, Satz für Satz'), '', { h: 90 })];
      if (who === 'woke') views.push(clipView(stage, sample(d, 'woke-robot').file, tr('through the clockwork filter: the robot', 'durch den Uhrwerk-Filter: der Roboter'), '', { h: 90 }));
      draw = () => Promise.all(views.map(f => f()));
      say(who === 'woke'
        ? `Last, the game's own steps: each sentence trimmed and made as loud as the others, a pause after each, and for the robot a filter that makes the child's voice clockwork. Then it is squeezed into a small file. That's the file the game plays.`
        : `Last, the game's own steps: each sentence trimmed and made as loud as the others, a pause after each. Then it is squeezed into a small file. That's the file the game plays. (Try the robot too!)`,
        who === 'woke'
          ? `Zum Schluss die eigenen Schritte des Spiels: jeder Satz zurechtgeschnitten und so laut wie die anderen gemacht, eine Pause nach jedem, und für den Roboter ein Filter, der die Kinderstimme zum Uhrwerk macht. Dann wird es in eine kleine Datei gepresst. Diese Datei spielt das Spiel ab.`
          : `Zum Schluss die eigenen Schritte des Spiels: jeder Satz zurechtgeschnitten und so laut wie die anderen gemacht, eine Pause nach jedem. Dann wird es in eine kleine Datei gepresst. Diese Datei spielt das Spiel ab. (Probier auch den Roboter!)`);
    }
  }
  top.querySelector('.who').onchange = e => { who = e.target.value; show(at); };
  top.querySelector('.prev').onclick = () => show(at - 1);
  top.querySelector('.next').onclick = () => show(at + 1);
  top.querySelectorAll('[data-i]').forEach(b => b.onclick = () => show(+b.dataset.i));
  let busy = false;
  loop(el, () => {
    if (!draw || busy) return;
    busy = true;
    Promise.resolve(draw()).finally(() => { busy = false; });
  });
  show(0);
}

// ---- mixing two fingerprints ----------------------------------------------------------------------
function mix(el, d) {
  const STOPS = [['glass-plain', 0], ['mix25', 0.25], ['mix50', 0.5], ['mix75', 0.75], ['mix100', 1]];
  const g0 = d.voices.glassmaker.fingerprint, c0 = d.voices.child.fingerprint;
  const slider = html(el, `<div class="row"><span>${tr('glassmaker', 'Glasmacher')}</span>
    <input type="range" min="0" max="4" step="1" value="0" style="flex:1"><span>${tr('child', 'Kind')}</span></div>`).querySelector('input');
  const { g, w, h } = canvas(el, 640, 120);
  let cur = null;
  const view = clipView(el, () => cur.s.file, tr('listen', 'anhören'), '', { h: 70 });
  const out = html(el, '<div class="out"></div>');
  function pick(i) {
    const [id, k] = STOPS[i];
    cur = { s: sample(d, id), print: mixPrints([g0, c0], [1 - k, k]) };
    out.innerHTML = tr(`${Math.round((1 - k) * 100)}% glassmaker, ${Math.round(k * 100)}% child. Base listened to the result and compared it with both voices' fingerprints: the longer the bar, the more alike.`,
      `${Math.round((1 - k) * 100)}% Glasmacher, ${Math.round(k * 100)}% Kind. Base hat sich das Ergebnis angehört und mit den Fingerabdrücken beider Stimmen verglichen: Je länger der Balken, desto ähnlicher.`);
  }
  slider.oninput = () => { pick(+slider.value); play(cur.s.file); };
  pick(0);
  const bars = () => {
    g.fillStyle = '#070910'; g.fillRect(0, 0, w, h);
    drawPrint(g, 0, 0, 300, 120, cur.print);
    const bar = (y, label, v, color) => {
      g.fillStyle = '#e7dfcf'; g.font = '13px sans-serif'; g.fillText(label, 320, y - 6);
      g.fillStyle = '#232a35'; g.fillRect(320, y, 310, 14);
      g.fillStyle = color; g.fillRect(320, y, 310 * Math.max(0, (v - 0.88) / 0.12), 14);
    };
    bar(40, tr('like the glassmaker', 'wie der Glasmacher'), cur.s.like.glassmaker, '#ff8a2a');
    bar(95, tr('like the child', 'wie das Kind'), cur.s.like.child, '#5fd3ff');
  };
  keepDrawing(el, [bars, view]);
}

// ---- three takes: the same order, other dice ------------------------------------------------------
function takes(el, d) {
  const ids = ['glass', 'glass-seed1', 'glass-seed2'], all = ids.map(id => sample(d, id)), seconds = Math.max(...all.map(s => s.seconds));
  const views = all.map(s => {
    const box = html(el, `<div style="margin:6px 0"><div class="row" style="margin:0 0 4px"><button>\u25B6 seed ${s.seed}</button></div></div>`);
    const { g, c, w } = canvas(box, 640, 120);
    box.querySelector('button').onclick = c.onclick = () => play(s.file);
    const steps = stepsOf(s);
    return async () => {
      g.fillStyle = '#070910'; g.fillRect(0, 0, w, 120);
      drawCodes(g, 0, 0, w * s.seconds / seconds, 50, steps, s.seconds);
      await drawPicture(g, 0, 54, w * s.seconds / seconds, 66, s.file);
      const p = playedOf(s.file);
      if (p != null) { g.fillStyle = '#ffffffcc'; g.fillRect(p / seconds * w - 1, 0, 2, 50); }
    };
  });
  html(el, `<div class="out">${tr('Same voice, same words, same instruction. Only the seed differs, so the Talker rolled other dice from the first step on: other tokens, another take. Which one would you pick?',
    'Dieselbe Stimme, dieselben Worte, dieselbe Anweisung. Nur der Seed ist anders, also hat der Talker ab dem ersten Schritt anders gewürfelt: andere Tokens, ein anderer Versuch. Welchen würdest du nehmen?')}</div>`);
  keepDrawing(el, views);
}

// ---- instructions ---------------------------------------------------------------------------------
function instruct(el, d) {
  const ids = [['glass-plain', tr('no instruction', 'keine Anweisung')], ['glass', tr('the game\'s', 'die des Spiels')], ['glass-sad', tr('sad', 'traurig')],
    ['glass-whisper', tr('whisper', 'flüstern')], ['glass-excited', tr('excited', 'aufgeregt')]];
  const views = ids.map(([id, name]) => {
    const s = sample(d, id);
    return clipView(el, s.file, name, s.instruct ? `"${s.instruct}"` : '', { h: 56 });
  });
  html(el, `<div class="out">${tr('Look at the whisper: the bright stripes are gone. Those stripes are the voice humming; a whisper is only breath. And the sad one is slower and lower.',
    'Schau dir das Flüstern an: Die hellen Streifen sind weg. Diese Streifen sind das Summen der Stimme; ein Flüstern ist nur Atem. Und das traurige ist langsamer und tiefer.')}</div>`);
  keepDrawing(el, views);
}

// ---- the robot's filter ---------------------------------------------------------------------------
function filter(el, d) {
  const clean = sample(d, 'woke'), robot = sample(d, 'woke-robot');
  const views = [
    clipView(el, clean.file, tr('the child\'s voice, as the model said it', 'die Kinderstimme, wie das Modell sie gesagt hat'), '', { h: 110, maxHz: 4000 }),
    clipView(el, robot.file, tr('through the clockwork filter', 'durch den Uhrwerk-Filter'), '', { h: 110, maxHz: 4000 }),
  ];
  html(el, `<div class="out">${tr('Here only the low notes are shown, so you can see the stripes of the melody. In the child\'s voice they glide; in the robot\'s they jump from note to note, like stairs.',
    'Hier sind nur die tiefen Töne zu sehen, damit man die Streifen der Melodie erkennt. In der Kinderstimme gleiten sie; beim Roboter springen sie von Ton zu Ton, wie Treppenstufen.')}</div>`);
  keepDrawing(el, views);
}
