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
