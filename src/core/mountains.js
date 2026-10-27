// Monteur's mountains as rules (game/mountains.js raises them in the active cube, render/mountains.js
// shows them, game/monteur.js has him pull them; docs/bosses.md, "Monteur"). As the sun (phase 2)
// he pulls a mountain out of the floor under the fight: the floor cracks (`crack` s), the mountain
// rises (`rise` s) and whoever stands on it rides up; up there it is floor like any other (one walks,
// fights and falls off it). After `life` s it falls apart, sinking back into the floor in jolts
// (`fall` s), and whoever is on it rides down; `next` s later he may pull up another. Each looks
// different (SHAPES): a mesa with sheer sides, a terraced cone, a ridge, a ledge round a needle, a
// crag. A way up is some slopes, a ladder now and then, a jump or none at all.
//
// A mountain is given by a spec: { n (which one), seed, x, z (its middle), shape, a (the heading of a
// ridge), phase, t (s into it), life }; every game raises the same mountain out of the same cube
// from it (planMountain): the cells it takes (FREE ones: open ground of the fight, nothing over
// it, nothing built or standing on it), how high each rises over the highest of them (`h`, in
// levels), which neighbours join as walkable slopes (`link`: no more than a level apart, and
// joined before for ground outside it), the corners of each (`cs`, smoothed like the generator's,
// cubegen/smooth.js) and its ladders. It rises as one body out of the ground (`sunk`: how far
// under its height it is now), never under the floor it rose from.
import { N, LH, DIRS, OPP, EDGE_CORNERS } from './constants.js';
import { mulberry32, hash32, idx, inb } from './util.js';

export const MOUNTAIN = Object.freeze({
  crack: 36 / 30,   // s the floor cracks before it rises (from the stomp of his clip MonteurRaise)
  rise: 1.8,        // s it rises
  fall: 2.4,        // s it sinks back, in `jolts`
  jolts: 4,
  life: [20, 30],   // s it stands
  first: 8,         // s into phase 2 before the first
  next: [6, 10],    // s after one is gone before the next
  apart: 2,         // s he and the player stay apart on it (no way between them) before he brings it down
  settle: 1,        // s up before that counts
  least: 16,        // the fewest cells a mountain takes
});
export const SHAPES = ['mesa', 'terraces', 'ridge', 'tiers', 'crag'];
export const PHASES = ['crack', 'rise', 'up', 'fall'];

// The cells a mountain may take (1) in map: open ground of the fight, one floor in its column
// (nothing over it), not a fluid, not by the cube's edge, nothing built or standing on it (a
// stair, a ladder's foot or top, a portal, a prop that blocks). `any`: not only the fight's floor
// (the developer command, anywhere).
export function freeCells(map, any = false) {
  const busy = new Set();
  for (const r of map.runs ?? []) {
    for (const p of r.pieces ?? []) busy.add(p.c);
    if (r.from?.c !== undefined) busy.add(r.from.c);
    if (r.to?.c !== undefined) busy.add(r.to.c);
  }
  for (const l of map.ladders ?? []) { const [dx, dz] = DIRS[l.d]; busy.add(l.c); if (inb(l.x + dx, l.z + dz)) busy.add(idx(l.x + dx, l.z + dz)); }
  for (const p of map.portals ?? []) for (const c of p.cells ?? []) busy.add(c);
  const ok = new Uint8Array(N * N);
  for (let c = 0; c < N * N; c++) {
    const col = map.cols[c], f = col?.[0], x = c % N, z = (c / N) | 0;
    ok[c] = col?.length === 1 && (any || f.encounter) && !f.fluid && !f.open && !f.covered && !f.crust && !f.hole && !f.landing
      && !map.pieces?.[c]?.length && !map.blockers?.[c]?.length && !busy.has(c) && x > 0 && z > 0 && x < N - 1 && z < N - 1 ? 1 : 0;
  }
  return ok;
}

// How high the cells of a mountain of spec's shape rise (levels over its highest ground: c -> h),
// before the free cells are picked; R draws its looks
function wanted(spec, R) {
  const out = new Map(), { x: cx, z: cz } = spec;
  const each = (reach, fn) => {
    for (let z = Math.floor(cz - reach - 1); z <= Math.ceil(cz + reach + 1); z++) for (let x = Math.floor(cx - reach - 1); x <= Math.ceil(cx + reach + 1); x++) {
      if (!inb(x, z)) continue;
      const h = fn(x + 0.5, z + 0.5, Math.hypot(x + 0.5 - cx, z + 0.5 - cz));
      if (h > 0) out.set(idx(x, z), Math.round(h));
    }
  };
  switch (spec.shape) {
    case 'mesa': {   // sheer sides, flat on top but a few bumps, the rim a level down
      const rad = 3 + R() * 0.9, H = 8 + Math.floor(R() * 4);
      each(rad, (x, z, d) => d > rad ? 0 : d > rad - 0.9 ? H - 1 : H + (R() < 0.12 ? 1 : 0));
      break;
    }
    case 'terraces': {   // a stepped cone: slopes and ledges you can jump up
      const rad = 3.4 + R() * 0.8, k = 1.5 + R() * 0.4;
      each(rad, (x, z, d) => d > rad ? 0 : Math.max(1, (rad + 0.4 - d) * k));
      break;
    }
    case 'ridge': {   // a long back, sheer sides, sloping down to both ends
      const L = 4 + R() * 1.2, W = 1.4 + R() * 0.4, top = Math.round(L) + 1 + Math.floor(R() * 2), ux = Math.sin(spec.a ?? 0), uz = Math.cos(spec.a ?? 0);
      each(L, (x, z) => {
        const along = (x - cx) * ux + (z - cz) * uz, across = -(x - cx) * uz + (z - cz) * ux;
        return Math.abs(across) > W || Math.abs(along) > L ? 0 : Math.max(1, top - (top - 1) * Math.abs(along) / L);
      });
      break;
    }
    case 'tiers': {   // a ledge all round a needle
      const rad = 3.2 + R() * 0.7, H1 = 4 + Math.floor(R() * 2), nx = cx + (R() - 0.5) * 1.4, nz = cz + (R() - 0.5) * 1.4, nr = 1.25 + R() * 0.35;
      const H2 = H1 + 5 + Math.floor(R() * 3);
      each(rad, (x, z, d) => d > rad ? 0 : Math.hypot(x - nx, z - nz) <= nr ? H2 : H1);
      break;
    }
    default: {   // crag: lumps and cliffs at random
      const rad = 3.3 + R() * 0.9, salt = Math.floor(R() * 1e9), S = 2.2;
      const at = (i, j) => (hash32((i * 73856093) ^ (j * 19349663) ^ salt) % 1000) / 1000;
      const noise = (x, z) => {
        const i = Math.floor(x / S), j = Math.floor(z / S), u = x / S - i, v = z / S - j, s = t => t * t * (3 - 2 * t);
        const a = at(i, j) + (at(i + 1, j) - at(i, j)) * s(u), b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * s(u);
        return a + (b - a) * s(v);
      };
      each(rad, (x, z, d) => d > rad ? 0 : Math.max(1, 2 + 8 * noise(x, z) * (1 - 0.5 * (d / rad) ** 2)));
    }
  }
  return out;
}

// the biggest piece of the cells (joined side by side)
function biggest(cells) {
  let best = [];
  const seen = new Set();
  for (const c of cells.keys()) {
    if (seen.has(c)) continue;
    const part = [c];
    seen.add(c);
    for (let i = 0; i < part.length; i++) {
      const x = part[i] % N, z = (part[i] / N) | 0;
      for (const [dx, dz] of DIRS) {
        const n = idx(x + dx, z + dz);
        if (inb(x + dx, z + dz) && cells.has(n) && !seen.has(n)) { seen.add(n); part.push(n); }
      }
    }
    if (part.length > best.length) best = part;
  }
  return new Set(best);
}

// How well a mountain of `shape` fits round (x, z): the free cells it would take less three times
// those it wants that are not free (holes in it); -Infinity when too small
export function fitOf(map, spec, ok = freeCells(map)) {
  const want = wanted(spec, mulberry32(spec.seed >>> 0));
  let got = 0, holes = 0;
  for (const c of want.keys()) if (ok[c]) got++; else holes++;
  return got < MOUNTAIN.least ? -Infinity : got - 3 * holes;
}
// Where round (x, z) (the middle between him and the player) a mountain of spec's shape fits best,
// no more than `within` cells off: { x, z } (on a tenth of a cell), or null
export function placeMountain(map, spec, within = 3, ok = freeCells(map)) {
  let best = null, score = -Infinity;
  for (let dz = -within; dz <= within; dz += 0.5) for (let dx = -within; dx <= within; dx += 0.5) {
    const d = Math.hypot(dx, dz);
    if (d > within) continue;
    const x = Math.round((spec.x + dx) * 10) / 10, z = Math.round((spec.z + dz) * 10) / 10;
    const s = fitOf(map, { ...spec, x, z }, ok) - d * 1.5;
    if (s > score) { score = s; best = { x, z }; }
  }
  return best;
}

// The mountain of spec in map (its cube's own floors, as they are without one), or null when it
// does not fit: { spec, ref (levels: the highest ground under it), cells: Map c -> { c, x, z, f (its
// floor), h, top (levels), base (the floor's corners), baseTop, cs (its corners up), link (per side:
// { f, up } a mountain cell's floor, { f, up: false } the ground's, or null) }, ladders (the map's
// kind, physics/climb.js), drop (how far under its height it starts: units) }
export function planMountain(map, spec, ok = freeCells(map)) {
  const R = mulberry32(spec.seed >>> 0), want = wanted(spec, R);
  const free = new Map([...want].filter(([c]) => ok[c]));
  const keep = biggest(free);
  if (keep.size < MOUNTAIN.least) return null;
  const cells = new Map();
  for (const c of keep) {
    const f = map.cols[c][0];
    cells.set(c, { c, x: c % N, z: (c / N) | 0, f, h: free.get(c), base: [...f.cs], baseTop: f.top });
  }
  const ref = Math.max(...[...cells.values()].map(m => m.baseTop));
  for (const m of cells.values()) m.top = ref + m.h;
  // the slopes: between its cells a level apart at most, and down onto the ground beside it where
  // that was walked onto before
  for (const m of cells.values()) m.link = DIRS.map(([dx, dz], d) => {
    if (!inb(m.x + dx, m.z + dz)) return null;
    const n = cells.get(idx(m.x + dx, m.z + dz));
    if (n) return Math.abs(n.top - m.top) <= 1 ? { f: n.f, up: true } : null;
    const g = m.f.link[d];
    return g && !g.fluid && !cells.has(g.c) && Math.abs(g.top - m.top) <= 1 ? { f: g, up: false } : null;
  });
  const ladders = laddersOf(map, spec, cells, R);
  corners(cells, ladders);
  let hi = -Infinity, lo = Infinity;
  for (const m of cells.values()) { hi = Math.max(hi, ...m.cs); lo = Math.min(lo, ...m.base); }
  return { spec, ref, cells, ladders, drop: hi - lo + 0.3 };
}

// Its ladders, by shape: up a mesa now and then, onto the ledge round a needle and up the needle
// now and then, up the side of a ridge rarely; from the ground (or a lower cell of it) against a
// cliff at least three levels high, where that ground's edge is level (the ladder's foot meets it)
const LADDER_CHANCE = { mesa: [0.6], tiers: [0.5, 0.7], ridge: [0.3] };
function laddersOf(map, spec, cells, R) {
  const out = [], used = new Set(), ok = freeCells(map, true);
  const ground = c => !cells.has(c) && ok[c] && map.cols[c][0];
  for (const [i, chance] of (LADDER_CHANCE[spec.shape] ?? []).entries()) {
    if (R() >= chance) continue;
    const tall = [...cells.values()].map(m => m.top), H = Math.max(...tall);
    const options = [];
    for (const hi of cells.values()) for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[OPP[d]], x = hi.x + dx, z = hi.z + dz, c = idx(x, z);
      if (!inb(x, z) || used.has(c) || used.has(hi.c)) continue;
      // (tiers: the first from the ground onto the ledge, the second from the ledge up the needle)
      const lo = cells.get(c), g = lo ? null : ground(c);
      if (spec.shape === 'tiers' && (i === 0 ? !g || hi.top === H : !lo || hi.top !== H)) continue;
      if (!lo && !g) continue;
      const loTop = lo ? lo.top : g.top, [a, b] = EDGE_CORNERS[d];
      if (hi.top - loTop < 3 || (g && Math.abs(g.cs[a] - g.cs[b]) > 0.08)) continue;
      options.push({ hi, lo, g, d, c });
    }
    if (!options.length) continue;
    const o = options[Math.floor(R() * options.length)], lo = o.lo?.f ?? o.g;
    const [a, b] = EDGE_CORNERS[o.d];
    used.add(o.c); used.add(o.hi.c);
    out.push({ c: lo.c, x: lo.x, z: lo.z, d: o.d, y0: o.lo ? o.lo.top * LH : (lo.cs[a] + lo.cs[b]) / 2, y1: o.hi.top * LH, layer: lo.layer ?? 0,
      lo: lo.id, hi: o.hi.f.id, hang: false, style: 'iron', mountain: true, loCell: o.lo ?? null, hiCell: o.hi });
  }
  return out;
}

// The corners of its cells up, as the generator smooths a cube's (cubegen/smooth.js): each the mean
// of the cells joined round it, but where it joins the ground beside it the ground's corner, and
// at a ladder's top (and its foot on a lower cell) the cell's own height, so the ladder meets it
function corners(cells, ladders) {
  const pins = new Map();
  const pin = (m, d) => { for (const k of EDGE_CORNERS[d]) pins.set(m.c * 4 + k, m.top * LH); };
  for (const l of ladders) { pin(l.hiCell, OPP[l.d]); if (l.loCell) pin(l.loCell, l.d); }
  for (const m of cells.values()) m.cs = [0, 1, 2, 3].map(k => {
    const X = m.x + (k & 1), Z = m.z + (k >> 1), group = [m], ground = [];
    const near = (x, z) => (x === X - 1 || x === X) && (z === Z - 1 || z === Z);
    for (let i = 0; i < group.length; i++) for (const l of group[i].link) {
      if (!l || !near(l.f.x, l.f.z)) continue;
      if (!l.up) { if (!ground.includes(l.f)) ground.push(l.f); continue; }
      const n = cells.get(l.f.c);
      if (!group.includes(n)) group.push(n);
    }
    if (ground.length) return Math.max(...ground.map(g => g.cs[(X - g.x) + 2 * (Z - g.z)]));
    const pinned = group.map(g => pins.get(g.c * 4 + (X - g.x) + 2 * (Z - g.z))).filter(v => v !== undefined);
    if (pinned.length) return pinned.reduce((s, v) => s + v, 0) / pinned.length;
    const mean = group.reduce((s, g) => s + g.top, 0) / group.length * LH;
    return mean + ((hash32(X * 7919 + Z * 104729 + Math.round(mean * 8) * 31337) % 1000) / 1000 - 0.5) * 0.08;
  });
}

const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
// How far under its height mountain plan is in `phase`, t s into it (units): all of it before it
// rises; rising fast at first, slowing to a stop; up: 0; falling apart, a jolt at a time
export function sunk(plan, phase, t) {
  const D = plan.drop;
  if (phase === 'crack') return D;
  if (phase === 'rise') { const u = Math.min(1, t / MOUNTAIN.rise); return D * (1 - u) * (1 - u); }
  if (phase === 'fall') {
    const u = Math.min(1, Math.max(0, t / MOUNTAIN.fall)), n = MOUNTAIN.jolts, i = Math.min(n - 1, Math.floor(u * n)), f = u * n - i;
    return D * (i + ease(f / 0.4)) / n;
  }
  return phase === 'up' ? 0 : D;
}
// the corners of its cell m with the mountain `s` under its height: never under the ground
export const cornersAt = (m, s) => m.cs.map((y, k) => Math.max(m.base[k], y - s));

// One step of a mountain's clock (spec: its phase, t and life, game/monteur.js): on into the next
// phase once one is over. The phase it went into ('gone' at the end), or null.
export function stepMountain(spec, dt) {
  if (spec.phase === 'gone') return null;
  spec.t += dt;
  const T = spec.phase === 'crack' ? MOUNTAIN.crack : spec.phase === 'rise' ? MOUNTAIN.rise : spec.phase === 'up' ? spec.life : MOUNTAIN.fall;
  if (spec.t < T) return null;
  spec.t -= T;
  spec.phase = PHASES[PHASES.indexOf(spec.phase) + 1] ?? 'gone';
  return spec.phase;
}
// It falls apart now (his death, he brings it down): from as high as it got (one only cracking is gone)
export function bringDown(spec) {
  if (spec.phase === 'crack') { spec.phase = 'gone'; spec.t = 0; return; }
  if (spec.phase === 'fall' || spec.phase === 'gone') return;
  const up = spec.phase === 'rise' ? (1 - Math.min(1, spec.t / MOUNTAIN.rise)) ** 2 : 0;
  spec.phase = 'fall'; spec.t = up * MOUNTAIN.fall;
}
