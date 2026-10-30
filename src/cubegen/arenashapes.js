// Guardian arena terrain. Each type turns the arena frame (entrance, guardian, gate and the
// cells that must stay flat) into relative levels and a fight zone:
//   rel:   levels above or below the entrance level (interior cells only)
//   zone:  1 where the fight happens (the encounter floors); everything else is scenery
//   crisp: a level change at this cell is a step, not a slope (terraces, walls)
//   ramp:  overrides crisp, so terraces stay connected by slopes
//   marks: where the type wants its focal clutter (cubegen/arenaprops.js)
// Scenery is never walkable from the zone: guardian.js raises it into walls or rails it off.
import { N, LH, HEAD_Y } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
function each(fn) {
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) fn(x, z, idx(x, z));
}
export function segDist(px, pz, [ax, az], [bx, bz]) {
  const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
  const t = l ? clamp(((px - ax) * vx + (pz - az) * vz) / l, 0, 1) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
const polyDist = (x, z, pts) => Math.min(...pts.slice(1).map((p, i) => segDist(x, z, pts[i], p)));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const blank = () => ({ rel: new Int8Array(N * N), zone: new Uint8Array(N * N),
  crisp: new Uint8Array(N * N), ramp: new Uint8Array(N * N), marks: {} });
// Space for the doubled population: busy arenas get wider floors.
const roomy = fr => fr.need > 44 ? 1 : fr.need > 26 ? .5 : 0;

// Neighbouring active cells end up at most one level apart (slopes, never cliffs).
// Fixed cells keep their level; the rest yield to them.
export function relax(rel, active, fixed) {
  for (let it = 0; it < 60; it++) {
    let changed = false;
    each((x, z, c) => {
      if (!active[c] || fixed[c]) return;
      let lo = -99, hi = 99;
      for (const [dx, dz] of DIRS4) {
        const n = idx(x + dx, z + dz);
        if (!inner(x + dx, z + dz) || !active[n]) continue;
        lo = Math.max(lo, rel[n] - 1); hi = Math.min(hi, rel[n] + 1);
      }
      const v = Math.max(lo, Math.min(hi, rel[c]));
      if (v !== rel[c]) { rel[c] = v; changed = true; }
    });
    if (!changed) break;
  }
}

// Crisp zone cells the entrance cannot reach (by the links guardian.js will make) soften
// into slopes, so a broken lip or terrace never strands part of the zone.
export function settle(s, fr) {
  for (let pass = 0; pass < 6; pass++) {
    const seen = new Uint8Array(N * N), start = idx(...fr.E), queue = [start];
    seen[start] = 1;
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i], ax = a % N, az = (a / N) | 0;
      for (const [dx, dz] of DIRS4) {
        const b = idx(ax + dx, az + dz);
        if (!inner(ax + dx, az + dz) || !s.zone[b] || seen[b]) continue;
        const dh = Math.abs(s.rel[a] - s.rel[b]);
        if (dh === 0 || dh === 1 && ((!s.crisp[a] && !s.crisp[b]) || s.ramp[a] || s.ramp[b])) { seen[b] = 1; queue.push(b); }
      }
    }
    let changed = false;
    each((x, z, c) => { if (s.zone[c] && !seen[c] && s.crisp[c]) { s.crisp[c] = 0; changed = true; } });
    if (!changed) return s;
  }
  return s;
}

function finish(s, fr, lo = -2, hi = 3) {
  each((x, z, c) => {
    if (fr.flat[c]) { s.zone[c] = 1; s.rel[c] = 0; s.crisp[c] = 0; }
    else if (s.zone[c]) s.rel[c] = clamp(s.rel[c], lo, hi);
  });
  return s;
}
// A spot at least `gap` cells from the entrance, the guardian and the flat pads.
function openSpot(fr, gap, tries = 40, edge = 3) {
  for (let i = 0; i < tries; i++) {
    const x = edge + Math.floor(fr.R() * (N - 2 * edge)), z = edge + Math.floor(fr.R() * (N - 2 * edge));
    if (Math.hypot(x - fr.E[0], z - fr.E[1]) >= gap && Math.hypot(x - fr.U[0], z - fr.U[1]) >= gap
      && !fr.flat[idx(x, z)]) return [x, z];
  }
  return null;
}
const middle = (fr, pull = .5) => lerp(lerp(fr.E, fr.U, .5), [7.5, 7.5], pull);

// 1. Rolling hills: soft noise, one or two broad mounds and a gentle dip, slopes everywhere.
function hills(fr) {
  const s = blank(), { R, noise } = fr, h = new Float32Array(N * N), bumps = [];
  for (let i = 0, n = 1 + (R() < .6 ? 1 : 0); i < n; i++) {
    const at = openSpot(fr, 4);
    if (at) bumps.push({ at, amp: 2.6 + R() * 1.8, rad: 2.8 + R() * 1.8 });
  }
  const dip = openSpot(fr, 3.5);
  if (dip) bumps.push({ at: dip, amp: -2, rad: 2.4 + R() });
  each((x, z, c) => {
    h[c] = (noise(x * .24, z * .24) - .5) * 3.6;
    for (const b of bumps) h[c] += b.amp * Math.max(0, 1 - (Math.hypot(x - b.at[0], z - b.at[1]) / b.rad) ** 2);
    s.rel[c] = Math.round(h[c]); s.zone[c] = 1;
  });
  finish(s, fr, -2, 4);
  relax(s.rel, s.zone, fr.flat);
  s.marks.peaks = bumps.filter(b => b.amp > 0).map(b => idx(b.at[0], b.at[1]));
  return s;
}

// 2. Gorge: a winding channel between cliffs from the entrance to the guardian and gate.
function gorge(fr) {
  const s = blank(), { R, noise, noise2 } = fr;
  const [ux, uz] = [fr.U[0] - fr.E[0], fr.U[1] - fr.E[1]], len = Math.hypot(ux, uz) || 1;
  const bend = (R() < .5 ? -1 : 1) * (1.5 + R() * 2.2);
  const M = middle(fr, .2).map((v, i) => clamp(v + (i ? ux : -uz) / len * bend, 3, N - 4));
  const pts = [fr.E, M, fr.U, fr.G], half = 2.7 + roomy(fr);
  each((x, z, c) => {
    const d = polyDist(x, z, pts), w = half + (noise(x * .3 + 11, z * .3 + 5) - .5) * 1.6;
    if (d <= w || fr.flat[c]) {
      s.zone[c] = 1;
      s.rel[c] = Math.round((noise(x * .35, z * .35) - .5) * 1.8) + (d > w - 1.1 ? 1 : 0);
    } else s.rel[c] = Math.min(8, 3 + Math.round((d - w) * .7 + noise2(x * .3, z * .3) * 2.5));
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks.path = pts;
  return s;
}

// 3. Colosseum: a flat oval of sand inside rings of stepped seating, entered through cuts.
function colosseum(fr) {
  const s = blank(), C = middle(fr, .55), bonus = roomy(fr) * .8;
  const [ux, uz] = [fr.U[0] - fr.E[0], fr.U[1] - fr.E[1]], len = Math.hypot(ux, uz) || 1;
  const ax = [ux / len, uz / len], rx = 5.4 + fr.R() * .5 + bonus, ry = 4.6 + fr.R() * .5 + bonus;
  each((x, z, c) => {
    const px = x - C[0], pz = z - C[1];
    const a = px * ax[0] + pz * ax[1], b = -px * ax[1] + pz * ax[0];
    const q = Math.sqrt((a / rx) ** 2 + (b / ry) ** 2);
    const lane = Math.min(segDist(x, z, fr.E, C), segDist(x, z, fr.G, C));
    if (q <= 1 || lane <= 1.3) { s.zone[c] = 1; return; }
    s.rel[c] = 2 + Math.min(4, Math.floor((q - 1) * Math.min(rx, ry))); s.crisp[c] = 1;
  });
  s.marks = { center: C, axis: ax, rx, ry };
  return finish(s, fr);
}

// 4. Throne dais: square terraces step down from the guardian's throne into a sunken court
// and back up to the entrance landing; a central ramp joins them, galleries flank the court.
function dais(fr) {
  const s = blank(), W = 4.6 + roomy(fr);
  const cheb = (x, z, p) => Math.max(Math.abs(x - p[0]), Math.abs(z - p[1]));
  each((x, z, c) => {
    const du = cheb(x, z, fr.U), de = cheb(x, z, fr.E), lane = segDist(x, z, fr.E, fr.U);
    const throne = du <= 2 ? 0 : du <= 3 ? -1 : -2, landing = de <= 1 ? 0 : de <= 2 ? -1 : -2;
    const level = Math.max(throne, landing);
    if (lane > W && level === -2) { s.rel[c] = lane > W + 2 ? 3 : 2; s.crisp[c] = 1; return; }
    s.zone[c] = 1; s.rel[c] = level; s.crisp[c] = 1; s.ramp[c] = lane <= 1.05 ? 1 : 0;
  });
  finish(s, fr);
  // Terrace pockets the ramp misses join the terrace above them.
  for (const lv of [-2, -1]) {
    const seen = new Uint8Array(N * N);
    each((x, z, c) => {
      if (seen[c] || !s.zone[c] || s.rel[c] !== lv) return;
      const part = [c], reach = { ok: false };
      seen[c] = 1;
      for (let i = 0; i < part.length; i++) {
        const px = part[i] % N, pz = (part[i] / N) | 0;
        if (s.ramp[part[i]] || fr.flat[part[i]]) reach.ok = true;
        for (const [dx, dz] of DIRS4) {
          const n = idx(px + dx, pz + dz);
          if (!inner(px + dx, pz + dz) || !s.zone[n]) continue;
          if (s.ramp[n] && Math.abs(s.rel[n] - lv) <= 1) reach.ok = true;
          if (!seen[n] && s.rel[n] === lv) { seen[n] = 1; part.push(n); }
        }
      }
      if (!reach.ok) for (const p of part) s.rel[p] = lv + 1;
    });
  }
  s.marks = { court: lerp(fr.E, fr.U, .5) };
  return settle(s, fr);
}

// 5. Henge: a ring of standing stones on a low berm, gentle ground inside.
function henge(fr) {
  const s = blank(), { R, noise } = fr, C = middle(fr, .6), rad = 4.1 + R() * .5 + roomy(fr) * .4;
  each((x, z, c) => {
    const d = Math.hypot(x - C[0], z - C[1]);
    s.zone[c] = 1;
    s.rel[c] = d < rad - 1.2 ? 0 : Math.round((noise(x * .3, z * .3) - .5) * 1.8)
      + (d > rad + 1.5 && d < rad + 2.8 ? 1 : 0);
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  const n = 7 + Math.floor(R() * 3), turn = R() * Math.PI * 2, stones = [];
  for (let i = 0; i < n; i++) {
    const a = turn + i / n * Math.PI * 2;
    const x = Math.round(C[0] + Math.cos(a) * rad), z = Math.round(C[1] + Math.sin(a) * rad);
    if (inner(x, z)) stones.push(idx(x, z));
  }
  s.marks = { center: C, stones: [...new Set(stones)], rad };
  return s;
}

// 6. Crater: a shallow bowl under a raised rim, crossed by an old trench ridge.
function crater(fr) {
  const s = blank(), { R, noise } = fr, C = middle(fr, .6), rad = 4.4 + R() * .6 + roomy(fr) * .5;
  const ang = R() * Math.PI, rx = Math.cos(ang), rz = Math.sin(ang);
  const gaps = [0, 1, 2].map(i => R() * Math.PI * 2 + i * 2.1);
  each((x, z, c) => {
    const d = Math.hypot(x - C[0], z - C[1]) / rad, e = d + (noise(x * .4, z * .4) - .5) * .25;
    let v = e < .4 ? -2 : e < .7 ? -1 : e < .9 ? 0 : e < 1.05 ? 1 : e < 1.3 ? 2 : 1;
    if (d < .8 && Math.abs(-(x - C[0]) * rz + (z - C[1]) * rx) < .6) v += 1;
    s.zone[c] = 1; s.rel[c] = v;
    // the rim is a crisp lip, crossed by a few slipped gaps and the doorway lanes
    if (e >= .9 && e < 1.3) {
      const a = Math.atan2(z - C[1], x - C[0]);
      const gap = gaps.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < .3);
      s.crisp[c] = 1;
      s.ramp[c] = gap || segDist(x, z, fr.E, C) < 1.3 || segDist(x, z, fr.U, C) < 1.3 ? 1 : 0;
    }
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks = { center: C, rad };
  return settle(s, fr);
}

// 7. Grove: gentle ground with clumps of trees, some on low knolls.
function grove(fr) {
  const s = blank(), { R, noise } = fr, clusters = [];
  for (let i = 0, n = 3 + Math.floor(R() * 2); i < 40 && clusters.length < n; i++) {
    const at = openSpot(fr, 3, 1, 2);
    if (at && segDist(at[0], at[1], fr.E, fr.U) >= 2.4
      && clusters.every(k => Math.hypot(k.at[0] - at[0], k.at[1] - at[1]) >= 4)) clusters.push({ at, knoll: R() < .5 });
  }
  each((x, z, c) => {
    s.zone[c] = 1;
    s.rel[c] = Math.round((noise(x * .28, z * .28) - .5) * 2.2);
    for (const k of clusters) if (k.knoll && Math.hypot(x - k.at[0], z - k.at[1]) < 1.8) s.rel[c] += 1;
  });
  finish(s, fr);
  relax(s.rel, s.zone, fr.flat);
  s.marks = { clusters: clusters.map(k => idx(k.at[0], k.at[1])) };
  return s;
}

// 8. Courtyard: a ruined walled yard, broken by the entrance and gate lanes, a few breaches
// and short wall stubs for cover.
function courtyard(fr) {
  const s = blank(), { R } = fr, C = [7.5, 7.5];
  const x0 = 3 + Math.floor(R() * 2), x1 = N - 4 - Math.floor(R() * 2);
  const z0 = 3 + Math.floor(R() * 2), z1 = N - 4 - Math.floor(R() * 2);
  const walls = new Set();
  for (let x = x0; x <= x1; x++) { walls.add(idx(x, z0)); walls.add(idx(x, z1)); }
  for (let z = z0; z <= z1; z++) { walls.add(idx(x0, z)); walls.add(idx(x1, z)); }
  // breaches: two random gaps, two cells wide
  const ring = [...walls];
  for (let i = 0; i < 2; i++) {
    const c = ring[Math.floor(R() * ring.length)], x = c % N, z = (c / N) | 0;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) walls.delete(idx(x + dx, z + dz));
  }
  // stubs inside the yard
  for (let i = 0, made = 0; i < 20 && made < 2; i++) {
    const x = x0 + 2 + Math.floor(R() * Math.max(1, x1 - x0 - 3)), z = z0 + 2 + Math.floor(R() * Math.max(1, z1 - z0 - 3));
    if (Math.hypot(x - fr.U[0], z - fr.U[1]) < 3 || segDist(x, z, fr.E, fr.U) < 1.6) continue;
    const [dx, dz] = R() < .5 ? [1, 0] : [0, 1];
    walls.add(idx(x, z)); walls.add(idx(x + dx, z + dz)); made++;
  }
  each((x, z, c) => {
    const lane = Math.min(segDist(x, z, fr.E, C), segDist(x, z, fr.G, C), segDist(x, z, fr.E, fr.U));
    if (walls.has(c) && lane > 1.4 && !fr.flat[c]) {
      s.rel[c] = fr.noise(x * .7, z * .7) < .4 ? 2 : 3; s.crisp[c] = 1;
    } else s.zone[c] = 1;
  });
  s.marks = { center: C, rect: [x0, z0, x1, z1] };
  return finish(s, fr);
}

export const SHAPES = { hills, gorge, colosseum, dais, henge, crater, grove, courtyard };
export const ARENA_TYPES = Object.keys(SHAPES);

// A boss's own arena (core/bosses.js BOSS_ARENAS `type`), never planned for any other guardian.
// 9. Tidal hills (Squarlo's): a basin of low flats `low` levels under the doorways, where his
// tide comes and goes (game/tide.js), with little hills standing out of it; a bank of scenery
// all round the cube keeps the water in (the tide's box: the cells inside it). A hill is steep:
// a top of two by two or three by three cells `top` levels over the doorways, crisp on every
// side but one, where a ramp comes down to the flats a level a cell (so they take little room:
// the flats stay wide). At rest the water stands `rest` levels over the flats; the high tide
// `high` under the doorways (they and the hilltops stay dry). Ground `safe` levels under them or
// higher is never deeper in it than a body can wade, the flats drown. There are `hills` hills,
// at least `peaks`; from every floor of the flats wadeable ground is at most `reach` steps away
// (another hill grows where it is not, or a low knoll where no hill fits), so a player who runs when he calls the tide gets out.
export const TIDAL = { low: -3, top: 1, safe: -1, reach: 4, rest: 0.8, high: -0.45, hills: 5, peaks: 4 };
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
function tidal(fr) {
  const { R, noise } = fr, hills = [];
  const bank = (x, z) => x === 1 || z === 1 || x === N - 2 || z === N - 2;
  const near = (x, z, cells, r) => cells.some(c => Math.max(Math.abs(c % N - x), Math.abs(((c / N) | 0) - z)) <= r);
  const flats = [];
  each((x, z, c) => { if (fr.flat[c]) flats.push(c); });
  // A hill at (x, z) of size n with its ramp going off along d: its top cells, its ramp cells (from
  // the top down) and the landing at the ramp's foot; null if it does not fit (on the doorways'
  // or his post's ground, on the bank, by another hill)
  const plan = (x, z, n, d) => {
    const top = [];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) top.push(idx(x + a, z + b));
    const [dx, dz] = DIRS4[d], k = TIDAL.top - TIDAL.low - 1;
    // the ramp leaves from the middle of the side facing d
    const mid = Math.floor((n - 1) / 2);
    let rx = dx > 0 ? x + n : dx < 0 ? x - 1 : x + mid, rz = dz > 0 ? z + n : dz < 0 ? z - 1 : z + mid;
    const ramp = [];
    for (let i = 0; i <= k; i++, rx += dx, rz += dz) ramp.push([rx, rz]);
    const cells = [...top.map(c => [c % N, (c / N) | 0]), ...ramp];
    for (const [cx, cz] of cells) {
      if (cx < 2 || cz < 2 || cx > N - 3 || cz > N - 3 || fr.flat[idx(cx, cz)]) return null;
      if (hills.some(h => near(cx, cz, [...h.top, ...h.ramp, h.landing], 1))) return null;
    }
    return { top, ramp: ramp.slice(0, k).map(([a, b]) => idx(a, b)), landing: idx(...ramp[k]) };
  };
  const knolls = [];   // (a low knoll where no hill fits: ground to wade on)
  // a hill: of the spots that fit, the one furthest from the other hills (and the doorways' and
  // his post's ground), or the nearest to `at`
  const centre = h => [h.top.reduce((t, c) => t + c % N, 0) / h.top.length, h.top.reduce((t, c) => t + ((c / N) | 0), 0) / h.top.length];
  let big = true;
  const addHill = (at = null) => {
    let best = null, score = -Infinity;
    for (let i = 0; i < 160; i++) {
      const n = big && R() < 0.3 ? 3 : 2;
      const x = at ? at[0] - Math.floor(R() * (n + 2)) + 1 : 2 + Math.floor(R() * (N - 3 - n)), z = at ? at[1] - Math.floor(R() * (n + 2)) + 1 : 2 + Math.floor(R() * (N - 3 - n));
      const h = plan(x, z, n, Math.floor(R() * 4));
      if (!h) continue;
      const [cx, cz] = centre(h);
      const sc = at ? -Math.hypot(cx - at[0], cz - at[1])
        : Math.min(9, ...hills.map(o => Math.hypot(cx - centre(o)[0], cz - centre(o)[1])), ...flats.map(c => Math.hypot(cx - c % N, cz - ((c / N) | 0)) + 1));
      if (sc > score) { best = h; score = sc; }
    }
    if (best) hills.push(best);
    return !!best;
  };
  let s;
  const shape = () => {
    s = blank();
    const fixed = new Uint8Array(N * N), active = new Uint8Array(N * N);
    each((x, z, c) => {
      if (bank(x, z) && !fr.flat[c]) { s.rel[c] = 2; s.crisp[c] = 1; return; }
      s.zone[c] = 1; active[c] = 1;
      s.rel[c] = Math.round(TIDAL.low + (noise(x * .37, z * .37) - .5) * 0.6);
    });
    for (const c of knolls) { s.rel[c] = TIDAL.safe + 1; fixed[c] = 1; }
    for (const h of hills) {
      for (const c of h.top) { s.rel[c] = TIDAL.top; s.crisp[c] = 1; active[c] = 0; }
      h.ramp.forEach((c, i) => { s.rel[c] = TIDAL.top - 1 - i; s.crisp[c] = 1; s.ramp[c] = 1; active[c] = 0; });
    }
    finish(s, fr, TIDAL.low, 3);
    for (const c of flats) fixed[c] = 1;
    relax(s.rel, active, fixed);
  };
  // (again, where fewer than `peaks` fit: smaller ones, closer together)
  for (let tries = 0; tries < 8; tries++) {
    hills.length = 0; big = tries < 4;
    for (let i = 0; i < TIDAL.hills; i++) addHill();
    if (hills.length >= TIDAL.peaks) break;
  }
  shape();
  // the flats too far from ground a body can wade: a hill grows near the farthest (or a knoll
  // there, where none fits), until none is
  for (let pass = 0; pass < 16; pass++) {
    const far = stepsUp(s);
    if (!far) break;
    if (!addHill(far)) knolls.push(idx(...far));
    shape();
  }
  s.marks.peaks = hills.map(h => h.top[0]);
  s.marks.hills = hills;
  s.min = 0;   // (the flats may sink lower than other arenas' floors)
  return s;
}
// are neighbouring zone cells a and b joined (the way cubegen/guardian.js links floors)?
function joined(s, a, b) {
  const dh = Math.abs(s.rel[a] - s.rel[b]);
  return dh === 0 || dh === 1 && ((!s.crisp[a] && !s.crisp[b]) || !!s.ramp[a] || !!s.ramp[b]);
}
// about how high the middle of zone cell (x, z) stands (levels): each corner is the mean of the
// cells round it joined to this one (cubegen/guardian.js blends joined floors into slopes)
function middleOf(s, x, z) {
  const c = idx(x, z);
  let sum = 0;
  for (const [ox, oz] of DIAG) {
    const a = idx(x + ox, z), b = idx(x, z + oz), d = idx(x + ox, z + oz), group = [c];
    const ja = inner(x + ox, z) && s.zone[a] && joined(s, c, a), jb = inner(x, z + oz) && s.zone[b] && joined(s, c, b);
    if (ja) group.push(a);
    if (jb) group.push(b);
    if (inner(x + ox, z + oz) && s.zone[d] && (ja && joined(s, a, d) || jb && joined(s, b, d))) group.push(d);
    sum += group.reduce((t, g) => t + s.rel[g], 0) / group.length;
  }
  return sum / 4;
}
// can a body wade where zone cell c (at x, z) is at high tide? (TIDAL.safe or higher, and its
// middle under no more water than the head stands, with a little to spare)
const wadeable = (s, x, z, c) => s.rel[c] >= TIDAL.safe && (TIDAL.high - middleOf(s, x, z)) * LH < HEAD_Y - 0.15;
// the zone cell farthest (in steps over the zone) from ground a body can wade at high tide, if
// it is further than TIDAL.reach: [x, z], else null
export function stepsUp(s) {
  const dist = new Int16Array(N * N).fill(-1), queue = [];
  each((x, z, c) => { if (s.zone[c] && wadeable(s, x, z, c)) { dist[c] = 0; queue.push(c); } });
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i], ax = a % N, az = (a / N) | 0;
    for (const [dx, dz] of DIRS4) {
      const b = idx(ax + dx, az + dz);
      if (!inner(ax + dx, az + dz) || !s.zone[b] || dist[b] >= 0 || !joined(s, a, b)) continue;
      dist[b] = dist[a] + 1; queue.push(b);
    }
  }
  let best = null, most = TIDAL.reach;
  each((x, z, c) => { if (s.zone[c] && (dist[c] < 0 || dist[c] > most)) { most = dist[c] < 0 ? 99 : dist[c]; best = [x, z]; } });
  return best;
}
// 10. Slime bowl (Slomo's): a wide flat basin `low` levels under the doorways, with a few round
// mounds standing out of it to the doorways' level (their tops `r` cells round, slopes down
// round them), and a bank of scenery all round the cube just inside its edge. His flood (game/tide.js,
// core/slomo.js) comes in over the basin from one side and stands `flood` levels over its floor:
// under anyone's head (HEAD_Y), over neither the slopes' tops, the mounds nor the doorways. The
// basin stays wide and flat: room for a big body to walk and land on, and the flood as deep
// everywhere on it.
export const BOWL = { low: -1, flood: 0.85, mounds: 3, r: [0.9, 1.3], apart: 5, clear: 3.5 };
function bowl(fr) {
  const { R } = fr, s = blank(), mounds = [];
  const bank = (x, z) => x === 1 || z === 1 || x === N - 2 || z === N - 2;
  const far = (x, z, [px, pz], d) => Math.hypot(x - px - 0.5, z - pz - 0.5) >= d;
  for (let i = 0; i < 300 && mounds.length < BOWL.mounds; i++) {
    const x = 3.5 + R() * (N - 7), z = 3.5 + R() * (N - 7), r = BOWL.r[0] + R() * (BOWL.r[1] - BOWL.r[0]);
    if (mounds.some(m => Math.hypot(m.x - x, m.z - z) < BOWL.apart) || ![fr.E, fr.U, fr.G].every(p => far(x, z, p, BOWL.clear))) continue;
    mounds.push({ x, z, r });
  }
  const active = new Uint8Array(N * N), fixed = new Uint8Array(N * N);
  each((x, z, c) => {
    if (bank(x, z) && !fr.flat[c]) { s.rel[c] = 2; s.crisp[c] = 1; return; }
    s.zone[c] = 1; active[c] = 1; s.rel[c] = BOWL.low;
    if (mounds.some(m => Math.hypot(x + 0.5 - m.x, z + 0.5 - m.z) <= m.r)) { s.rel[c] = 0; fixed[c] = 1; }
  });
  finish(s, fr, BOWL.low, 2);
  each((x, z, c) => { if (fr.flat[c]) fixed[c] = 1; });
  relax(s.rel, active, fixed);
  s.marks.peaks = mounds.map(m => idx(Math.floor(m.x), Math.floor(m.z)));
  s.marks.mounds = mounds;
  s.min = 0;   // (the basin may sink lower than other arenas' floors)
  return s;
}
// 12. Mire (Sollmeldon's): a wide basin `low` levels under the doorways, its floor flat, with a few
// round islands standing out of it to the doorways' level (their tops `r` cells round, slopes down
// round them) and a bank of scenery all round the cube just inside its edge. His mud (game/mud.js,
// core/sollmeldon.js) stands `mud` levels deep over its floor at first, shallow; it runs to the low
// side when the world tips, deep there, so the islands are spread over the basin (`apart`): wherever
// it tips, there is dry ground on the high side. The basin stays wide and flat: room for a big body to
// walk and land on.
export const MIRE = { low: -2, mud: 0.6, islands: 4, r: [1, 1.5], apart: 4.5, clear: 3 };
function mire(fr) {
  const { R } = fr, s = blank(), islands = [];
  const bank = (x, z) => x === 1 || z === 1 || x === N - 2 || z === N - 2;
  const far = (x, z, [px, pz], d) => Math.hypot(x - px - 0.5, z - pz - 0.5) >= d;
  for (let i = 0; i < 400 && islands.length < MIRE.islands; i++) {
    const x = 3.5 + R() * (N - 7), z = 3.5 + R() * (N - 7), r = MIRE.r[0] + R() * (MIRE.r[1] - MIRE.r[0]);
    if (islands.some(m => Math.hypot(m.x - x, m.z - z) < MIRE.apart) || ![fr.E, fr.U, fr.G].every(p => far(x, z, p, MIRE.clear))) continue;
    islands.push({ x, z, r });
  }
  const active = new Uint8Array(N * N), fixed = new Uint8Array(N * N);
  each((x, z, c) => {
    if (bank(x, z) && !fr.flat[c]) { s.rel[c] = 2; s.crisp[c] = 1; return; }
    s.zone[c] = 1; active[c] = 1; s.rel[c] = MIRE.low;
    if (islands.some(m => Math.hypot(x + 0.5 - m.x, z + 0.5 - m.z) <= m.r)) { s.rel[c] = 0; fixed[c] = 1; }
  });
  finish(s, fr, MIRE.low, 2);
  each((x, z, c) => { if (fr.flat[c]) fixed[c] = 1; });
  relax(s.rel, active, fixed);
  s.marks.peaks = islands.map(m => idx(Math.floor(m.x), Math.floor(m.z)));
  s.marks.islands = islands;
  s.min = 0;   // (the basin may sink lower than other arenas' floors)
  return s;
}
// 11. Museum stage (Mansk's): a hall paved in a checker `hall` levels under the doorways, walled
// all round `wall` levels high (masonry: the paintings and the curtain hang on it), a landing at
// the entrance with steps down its middle, and at the far end a stage at the doorways' level round
// him and the well: `depth` cells deep in front of him (and to the wall behind), `half` cells to
// each side, its edge trim. Its front drops a level into the hall, with steps up in its middle
// and at both ends. The hall stays open: room for a big body to fly over and land on.
export const STAGE = { hall: -1, wall: 5, depth: 2, half: 6 };
function stage(fr) {
  const s = blank(), [ux, uz] = fr.U, [ex, ez] = fr.E;
  s.surface = new Array(N * N).fill(null);
  // the way from him to the entrance, along a side of the cube
  const vx = ex - ux, vz = ez - uz, [dx, dz] = Math.abs(vx) >= Math.abs(vz) ? [Math.sign(vx), 0] : [0, Math.sign(vz)];
  const bank = (x, z) => x === 1 || z === 1 || x === N - 2 || z === N - 2;
  each((x, z, c) => {
    if (bank(x, z) && !fr.flat[c]) { s.rel[c] = STAGE.wall; s.crisp[c] = 1; s.surface[c] = 'masonry'; return; }
    const along = (x - ux) * dx + (z - uz) * dz, side = Math.abs((x - ux) * dz - (z - uz) * dx);
    s.zone[c] = 1; s.crisp[c] = 1;
    const landing = Math.max(Math.abs(x - ex), Math.abs(z - ez)) <= 1;
    if (along <= STAGE.depth && side <= STAGE.half) {
      s.rel[c] = 0;
      s.surface[c] = along === STAGE.depth || side === STAGE.half ? 'trim' : 'masonry';
      // steps up its front: in the middle and at both ends
      if (along === STAGE.depth && (side <= 1 || side >= STAGE.half - 1)) s.ramp[c] = 1;
    } else if (landing) {
      s.rel[c] = 0; s.surface[c] = 'masonry';
    } else {
      s.rel[c] = STAGE.hall; s.surface[c] = 'paving';
      if (along === STAGE.depth + 1 && (side <= 1 || side >= STAGE.half - 1)) s.ramp[c] = 1;
      if (Math.max(Math.abs(x - ex), Math.abs(z - ez)) === 2 && segDist(x, z, fr.E, fr.U) <= 1.05) s.ramp[c] = 1;
    }
  });
  finish(s, fr, STAGE.hall, STAGE.wall);
  each((x, z, c) => { if (s.zone[c] && s.rel[c] === 0 && s.surface[c] === 'paving') s.surface[c] = 'masonry'; });   // (the doorways' pads: the landing)
  s.marks = { axis: [dx, dz], U: fr.U, E: fr.E, center: lerp(fr.E, fr.U, 0.5) };
  return settle(s, fr);
}
// 13. Reef (Umbra's): the bottom of a sea, flooded once the fight starts (game/dive.js): a deep
// basin `low` levels under the doorways, and hills rising out of it, each to its own height
// (`tops`, levels over the doorways), the highest a spire with a broad flat top (`spire`), their
// slopes a level a cell (walked up and down, never climbed), so the hills run into each other in
// ridges and saddles. A bank of scenery all round the cube. His body swims over the hilltops at the
// height of a hero on them (core/umbra.js swimSpots), and his mud rises from the bottom in steps
// that leave the higher ground dry (UMBRA_FIGHT.mud). The water stands `surface` levels over the
// doorways, far over everything. marks.hills: { x, z, r, top (levels over the doorways) }.
export const REEF = { low: -3, bank: 5, tops: [2, 3, 4], spire: 5, spireR: 1.3, r: [0.6, 1.1], apart: 3, clear: 2.2, surface: 14 };
function reef(fr) {
  const { R } = fr, s = blank(), hills = [];
  const bank = (x, z) => x === 1 || z === 1 || x === N - 2 || z === N - 2;
  const far = (x, z, [px, pz], d) => Math.hypot(x - px - 0.5, z - pz - 0.5) >= d;
  // (a hill keeps off the doorways' and his flat pads; where its slopes would come down to them
  // steeper than a level a cell, it is shaved down towards them: relax)
  const fits = (x, z, r, apart, top) => hills.every(h => Math.hypot(h.x - x, h.z - z) >= apart + (h.r + r) * 0.5)
    && [fr.E, fr.U, fr.G].every(p => far(x, z, p, REEF.clear + Math.min(2, top * 0.3) + r));
  // the spire, near the middle; then the other hills round it, each its own height
  for (let i = 0; i < 400 && !hills.length; i++) {
    const x = 4 + R() * (N - 8), z = 4 + R() * (N - 8);
    if (fits(x, z, REEF.spireR, 0, REEF.spire)) hills.push({ x, z, r: REEF.spireR, top: REEF.spire, spire: true });
  }
  const tops = [...REEF.tops].sort(() => R() - 0.5);
  for (let i = 0; i < 600 && hills.length < 1 + tops.length; i++) {
    const x = 3 + R() * (N - 6), z = 3 + R() * (N - 6), r = REEF.r[0] + R() * (REEF.r[1] - REEF.r[0]);
    if (fits(x, z, r, REEF.apart, tops[hills.length - 1])) hills.push({ x, z, r, top: tops[hills.length - 1] });
  }
  const active = new Uint8Array(N * N), fixed = new Uint8Array(N * N);
  each((x, z, c) => {
    if (bank(x, z) && !fr.flat[c]) { s.rel[c] = REEF.bank; s.crisp[c] = 1; return; }
    s.zone[c] = 1; active[c] = 1;
    // the highest of the hills here: its top, a level lower each cell out from it
    let rel = REEF.low;
    for (const h of hills) {
      const d = Math.hypot(x + 0.5 - h.x, z + 0.5 - h.z) - h.r;
      rel = Math.max(rel, d <= 0 ? h.top : h.top - Math.ceil(d));
    }
    s.rel[c] = rel;
  });
  finish(s, fr, REEF.low, REEF.spire);
  each((x, z, c) => { if (fr.flat[c]) fixed[c] = 1; });
  relax(s.rel, active, fixed);
  s.marks.peaks = hills.map(h => idx(Math.floor(h.x), Math.floor(h.z)));
  s.marks.hills = hills;
  s.min = 0;   // (the basin may sink lower than other arenas' floors)
  return s;
}
export const BOSS_SHAPES = { tidal, bowl, stage, mire, reef };
