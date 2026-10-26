// The films' rules (docs/film.md), pure: how ink spreads through a layer, and when everything in
// a film happens. The player (film/player.js) draws them; a film is a file of its own
// (film/opening.js).
//
// A layer is a painting of white ink on black (assets/film/<name>.png). It is painted in as the
// film goes by its flow map: for each pixel, when the ink gets there (0 first, 1 last), the
// distance from where the brush starts (`from`) through the ink, so the paint runs along the
// strokes the way wet ink would. Through the black between two strokes it goes slower (`gap`), so
// a speck near a stroke still fills soon after it.

// the longer side of a flow map (it is smooth: the ink's own picture gives the detail)
export const FLOW_SIZE = 192;
const INK = 0.08;   // this bright is ink (the flow's ways); darker is the black between

// Where the brush starts, in a layer's picture (x right, y down, 0 to 1): a list of [x, y]
// points, or one of its sides ('top', 'bottom', 'left', 'right': the ink along that side first).
// The flow map of picture `ink` (w x h, brightness 0 to 1), as a Float32Array of w x h: 0 where
// the brush starts, 1 where the ink gets last. gap: how much slower ink goes through the black.
export function flowMap(ink, w, h, from = 'bottom', { gap = 5 } = {}) {
  const n = w * h, cost = new Float32Array(n), dist = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) cost[i] = ink[i] > INK ? 1 : gap;
  const heap = new MinHeap(n);
  const seed = (x, y) => {
    const i = Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x));
    if (dist[i] > 0) { dist[i] = 0; heap.push(0, i); }
  };
  if (typeof from === 'string') {
    // the side, from the first ink on each line across it
    const side = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[from];
    if (!side) throw new TypeError(`Unknown side ${from}`);
    const across = side[0] ? h : w, along = side[0] ? w : h;
    for (let a = 0; a < across; a++) {
      for (let b = 0; b < along; b++) {
        const k = side[0] > 0 || side[1] > 0 ? b : along - 1 - b;
        const [x, y] = side[0] ? [k, a] : [a, k];
        if (ink[y * w + x] > INK) { seed(x, y); break; }
      }
    }
    if (!heap.size) seed(side[0] < 0 ? w - 1 : 0, side[1] < 0 ? h - 1 : 0);
  } else {
    for (const [x, y] of from) seed(Math.round(x * (w - 1)), Math.round(y * (h - 1)));
  }
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy, len] of STEPS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, nd = d + len * (cost[i] + cost[j]) / 2;
      if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
    }
  }
  // 1 is where the last of the ink gets (the black beyond it is later still: kept at 1)
  let last = 0;
  for (let i = 0; i < n; i++) if (ink[i] > INK && dist[i] < Infinity) last = Math.max(last, dist[i]);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = last > 0 ? Math.min(1, dist[i] / last) : 0;
  return out;
}

// The flow its glow goes by: round each pixel (`r` pixels), the flow of the ink there, the
// brighter the more (a glow round a stroke comes and goes with the stroke, not with the black
// it lies on). Where there is no ink near, the flow itself.
export function glowFlow(flow, ink, w, h, r = 6) {
  const box = src => {   // a box blur, along the rows then the columns
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x < w + r; x++) {
        if (x + r < w) sum += src[y * w + Math.min(w - 1, x + r)];
        if (x - r - 1 >= 0) sum -= src[y * w + x - r - 1];
        if (x >= 0 && x < w) a[y * w + x] = sum;
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y < h + r; y++) {
        if (y + r < h) sum += a[Math.min(h - 1, y + r) * w + x];
        if (y - r - 1 >= 0) sum -= a[(y - r - 1) * w + x];
        if (y >= 0 && y < h) b[y * w + x] = sum;
      }
    }
    return b;
  };
  const weighted = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) weighted[i] = flow[i] * ink[i];
  const num = box(weighted), den = box(ink), out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = den[i] > 1e-3 ? num[i] / den[i] : flow[i];
  return out;
}

// A flow map that sweeps straight across the picture from a side ('left', 'right', 'top',
// 'bottom'): 0 at the first ink, 1 at the last, by how far along it is and nothing else. Written
// words are painted this way (a film's title): every letter comes at the same pace, the space
// between two words a pause as long as it is wide, however a letter's strokes run.
export function sweepMap(ink, w, h, from = 'left') {
  const side = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[from];
  if (!side) throw new TypeError(`Unknown side ${from}`);
  const along = (x, y) => (side[0] > 0 ? x : side[0] < 0 ? w - 1 - x : side[1] > 0 ? y : h - 1 - y);
  let first = Infinity, last = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (ink[y * w + x] > INK) { const a = along(x, y); first = Math.min(first, a); last = Math.max(last, a); }
  }
  const out = new Float32Array(w * h);
  if (!(last > first)) return out;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.min(1, Math.max(0, (along(x, y) - first) / (last - first)));
  return out;
}

// a picture's brightness (RGBA bytes, w x h) at most FLOW_SIZE on its longer side: { ink, w, h }
export function shrink(rgba, w, h, size = FLOW_SIZE) {
  const s = Math.min(1, size / Math.max(w, h)), W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  const ink = new Float32Array(W * H), count = new Float32Array(W * H);
  for (let y = 0; y < h; y++) {
    const Y = Math.min(H - 1, Math.floor(y * s));
    for (let x = 0; x < w; x++) {
      const X = Math.min(W - 1, Math.floor(x * s)), i = (y * w + x) * 4;
      ink[Y * W + X] += rgba[i] / 255; count[Y * W + X]++;
    }
  }
  for (let i = 0; i < ink.length; i++) ink[i] /= count[i] || 1;
  return { ink, w: W, h: H };
}

// a binary min-heap of (key, index) in typed arrays
class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap * 4); this.v = new Int32Array(cap * 4); this.size = 0; }
  push(key, val) {
    if (this.size === this.k.length) { const k = new Float64Array(this.size * 2), v = new Int32Array(this.size * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
    let i = this.size++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = key; V[i] = val;
  }
  pop() {
    const K = this.k, V = this.v, top = [K[0], V[0]], n = --this.size;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = key;
        if (l < n && K[l] < mk) { m = l; mk = K[l]; }
        if (r < n && K[r] < mk) { m = r; }
        if (m < 0) break;
        K[i] = K[m]; V[i] = V[m]; i = m;
      }
      K[i] = key; V[i] = val;
    }
    return top;
  }
}

// --- when things happen -------------------------------------------------------------------------

// how long a line without a voice stays up: as long as it takes to read it (like the narrator's,
// game/narrator.js)
export const READ = 14, MIN_READ = 2.5;
export const readTime = text => Math.max(MIN_READ, text.length / READ);

// the things a film does (film/player.js does them): what each cue needs after its time
export const CUES = {
  paint: ['layer'],          // a layer's ink spreads in, by its flow ({ for: s })
  fade: ['layer'],           // a layer's ink goes, by its flow ({ for: s })
  move: ['layer'],           // a layer slides ({ by: [x, y] } in sheet units, { for: s })
  break: ['layer'],          // a layer cracks and falls apart in pieces ({ hold: [x, y, rx, ry] } stays whole, falls)
  lift: ['layer', 'glass'],  // a layer's ink leaves the sheet and goes into a glass
  grow: ['glass'],           // a glass grows up out of the floor ({ for: s })
  rise: ['glass'],           // a glass floats up ({ by: height, for: s })
  drift: ['glass'],          // a glass drifts off ({ by: [x, y, z] world units, fade: to, spin: degrees, for: s })
  crack: ['glass'],          // a crack runs round a glass, and holds
  shatter: ['glass'],        // a glass breaks, its ink scatters ({ from: [x, y, z] } the blow's direction)
  lights: ['glass'],         // lights come on in the ink inside a glass, and a thread of smoke
  bubble: ['glass'],         // a star-glass bubble with a light in it rises into a glass ({ from: [x, y, z], for: s })
  vanish: ['glass'],         // a glass goes clear and is gone; its ink stays ({ for: s })
  closer: ['glass'],         // the camera goes closer to a glass ({ by: 0 to 1, for: s })
  light: [],                 // the light to a level ({ to: 0 to 1, for: s })
  crackle: [],               // the recording's crackle to a level ({ to: 0 to 1, for: s })
  knock: [],                 // a soft knock, as of something far off hitting glass
  music: ['pattern'],        // the film's score plays this pattern from here ({ then: pattern, last: pattern }:
                             // filling the time up to the next music cue, scorePlan; { level: 0 to 1 })
  black: [],                 // the picture fades to black ({ for: s }): the film is over, and the game
                             // comes up out of the black ({ reveal: s })
};
// the cues a film ends with
export const ENDS = ['black'];

// A shot's time: a number (s from the shot's start), or 'NN%' of the shot (a line's length
// changes with the language, its cues go with it).
export function cueTime(at, length) {
  if (typeof at === 'number') return at;
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(at));
  if (!m) throw new TypeError(`Not a cue time: ${at}`);
  return length * Number(m[1]) / 100;
}

// A film's lines as the narrator's table has them (core/narration.js LINES), to be voiced like
// them by tools/narration.mjs: the clip of a shot's line is `film.<film>.<shot id>`, said in the
// film's voice (tools/voices/<voice>), with its note, instruct and seed.
export const lineKey = (film, shot) => `film.${film.name}.${shot.id}`;
export const filmLines = film => film.shots.filter(s => s.line).map(s => ({
  id: lineKey(film, s), text: s.line, note: s.note, voice: film.voice,
  ...(s.instruct ? { instruct: s.instruct } : {}), ...(s.seed != null ? { seed: s.seed } : {}),
}));

// A film's shots one after the other: [{ start, length, said, line, key, shot }] and its cues in
// order: [{ t, do, ...cue, shot }], and how long it is. A shot with a line lasts as long as it
// takes to say it (lengthOf(shot), s) and `after` (s) more, and `hold` s on top (a shot without
// a line: only that).
export function schedule(film, lengthOf) {
  const shots = [], cues = [];
  let t = 0;
  for (const [i, shot] of film.shots.entries()) {
    if (shot.line && !shot.id) throw new TypeError(`Shot ${i}: a shot with a line needs an id (its clip)`);
    const said = shot.line ? lengthOf(shot) : 0;
    const length = (shot.line ? said + (shot.after ?? 0.45) : 0) + (shot.hold ?? 0);
    shots.push({ start: t, length, said, line: shot.line ?? null, key: shot.line ? lineKey(film, shot) : null, shot: i });
    for (const [at, what, ...rest] of shot.cues ?? []) {
      if (!CUES[what]) throw new TypeError(`Shot ${i}: unknown cue ${what}`);
      const args = typeof rest[rest.length - 1] === 'object' && rest[rest.length - 1] !== null ? rest.pop() : {};
      const named = Object.fromEntries(CUES[what].map((k, j) => [k, rest[j]]));
      for (const k of CUES[what]) if (named[k] == null) throw new TypeError(`Shot ${i}: ${what} needs a ${k}`);
      cues.push({ t: t + cueTime(at, length), do: what, ...named, ...args, shot: i });
    }
    t += length;
  }
  cues.sort((a, b) => a.t - b.t);
  return { shots, cues, length: t };
}

// --- the score ------------------------------------------------------------------------------------

// A film's music is a score of its own (music/films/<score>.scrim), in patterns; its `music` cues
// say which plays when. A shot's length changes with the language and with its clip, so the music
// cannot be one fixed piece: each cue starts a stretch that lasts up to the next one, and the
// stretch fills it. It plays its pattern, then the bars of its `then` pattern over and over (cut
// at any bar), then its `last` pattern (which leads into the next stretch), as many bars as come
// nearest its time, at a tempo up to FIT faster or slower so that they fill it exactly. If even
// FIT faster does not fill it (a short stretch, or one with no `then`), the notes sounding at its
// end hold on until the next (a fermata). The last stretch plays its pattern and its `last` as
// written. Put the cues at the start of the shots without a line: those never change length, so
// what has to land on the picture (the break, the title) goes there. A stretch under the words
// plays softer (`level`, 0 to 1: its notes' loudness), so that they are heard.
export const FIT = 0.05;

// The stretches of a film's score from its plan (schedule above): barsOf(pattern) gives the length
// of each bar of a pattern (s). [{ at, end, scale, hold, level, bars: [{ pattern, bar, at, dur }] }]: each
// bar starts at `at` (s into the film) and lasts `dur` (its written length times `scale`); the
// stretch's last notes hold for `hold` s more, up to `end`.
export function scorePlan(plan, barsOf) {
  const cues = plan.cues.filter(c => c.do === 'music');
  return cues.map((c, k) => {
    const span = k + 1 < cues.length ? cues[k + 1].t - c.t : Infinity;
    const bars = name => (name ? barsOf(name).map((dur, bar) => ({ pattern: name, bar, dur })) : []);
    const head = bars(c.pattern), bed = bars(c.then), tail = bars(c.last);
    // the first n bars a stretch can play: its pattern, its bed over and over, its last pattern
    // (fewer than those two: the start of its pattern and all of its last, or the end of its last)
    const most = bed.length ? Infinity : head.length + tail.length;
    const take = n => {
      if (n <= tail.length) return tail.slice(tail.length - n);
      if (n <= head.length + tail.length || !bed.length) return [...head.slice(0, Math.min(head.length, n - tail.length)), ...tail];
      return [...head, ...Array.from({ length: n - head.length - tail.length }, (_, i) => bed[i % bed.length]), ...tail];
    };
    const length = list => list.reduce((s, b) => s + b.dur, 0);
    let n = most;
    if (span < Infinity) {
      // the number of bars nearest the time; fewer while even FIT faster is too long
      n = 0;
      while (n < most && Math.abs(length(take(n + 1)) - span) <= Math.abs(length(take(n)) - span)) n++;
      while (n > 0 && length(take(n)) * (1 - FIT) > span) n--;
    }
    const list = take(n), written = length(list);
    const scale = span < Infinity && written > 0 ? Math.min(1 + FIT, span / written) : 1;
    let t = c.t;
    const out = list.map(b => { const bar = { ...b, at: t, dur: b.dur * scale }; t += bar.dur; return bar; });
    return { at: c.t, end: span < Infinity ? c.t + span : t, scale, hold: span < Infinity ? span - written * scale : 0, level: c.level ?? 1, bars: out };
  });
}
