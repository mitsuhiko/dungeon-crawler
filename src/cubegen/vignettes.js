// Vignettes: the little set pieces of a theme (the theme library's `vignette` props, bigger than a
// cell like landmarks: an abandoned shed, a collapsed cabin, a woodcutter's camp, a stone circle),
// scattered through its rooms as often as the theme says (`vignettes`: [min, max] a room). Placed
// once the route, the reward sites and the spots have their ways and before the structures:
//   - on dry ground of the bottom layer, off the portals, the reward sites, the spots and the
//     horde's patch, off the way's structures and never blocking or levelling a floor of the way
//     (one may reach over it), with room overhead; ground up to two levels up or down from where
//     it stands is levelled under it (a clearing cut into the slope)
//   - near the way (you come across them), each turned a quarter turn at random; where the one
//     whose turn it is finds no room, the next of the theme's that does (the smallest last), never
//     the same one twice in a room
//   - never cutting anything off: with its cells blocked, every portal, reward site and spot is
//     still reached from where the cube is entered and still leads to where it is left
// They claim their cells like a landmark (cubegen/sites.js landmarkClaims): blocked where the
// character could not stand, covered (kept flat, no structure through them) under them. Their
// colliders and occluders come from the prop (assets/themes/manifest.json). A few small things of
// the theme's stand around them. Optional: one that finds no room is left out.
import { N, LH, CHAR_R, DIRS, count16 } from '../core/constants.js';
import { idx, inb, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { PROP_METADATA } from '../core/propmetadata.js';
import { propMetadata } from '../core/propcatalog.js';
import { themeOf } from '../themes/depth.js';
import { reachTo, reachFrom } from './reach.js';
import { landmarkClaims } from './sites.js';

const BY_SET = new Map();
for (const p of PROP_METADATA) if (p.vignette) {
  if (!BY_SET.has(p.set)) BY_SET.set(p.set, []);
  BY_SET.get(p.set).push(p);
}
// a theme's vignettes (by its prop set)
export const vignettesOf = set => BY_SET.get(set) || [];

// the small things put round a vignette, by theme (bases of its set's props, none blocking)
export const DRESSING = {
  darkforest: ['glow_mushrooms', 'glowcap_patch', 'twig_charm', 'dark_fern', 'leaf_litter', 'bramble'],
  slime: ['slime_mushrooms', 'goo_puddle', 'spore_pods', 'slime_reeds', 'slime_moss'],
};

const TRIES = 120;   // footprints looked at per vignette
const CHECKS = 6;    // of those, how many are checked against everything the cube must reach
const NEAR = 7;      // how far from the way (cells) one may stand
const LEVEL = 2;     // how many levels of ground up or down are levelled under one

// the cells (relative to the cell its origin is in) a prop's boxes reach into, turned by yaw, its
// origin at (ox, oz) in that cell: the colliders with the character's reach, the occluders as they are
function reachCells(p, ox, oz, yaw) {
  const colliders = p.colliders.map(b => turnBox(b, ox, oz, yaw)), occluders = p.occluders.map(b => turnBox(b, ox, oz, yaw));
  const cells = new Set();
  for (const [list, r] of [[colliders, CHAR_R + 0.05], [occluders, 0]]) for (const b of list)
    for (let cz = Math.floor(b.z0 - r); cz <= Math.floor(b.z1 + r - 1e-6); cz++)
      for (let cx = Math.floor(b.x0 - r); cx <= Math.floor(b.x1 + r - 1e-6); cx++) cells.add(cx + ',' + cz);
  return [...cells].map(k => k.split(',').map(Number));
}
// where in its cell a prop's origin goes for each quarter turn (a cell's middle or a corner, as
// it takes the fewest cells) and the cells it takes: [{ ox, oz, cells }] by turn
const layouts = new Map();
function layoutOf(p) {
  if (!layouts.has(p.name)) layouts.set(p.name, [0, 1, 2, 3].map(turn => {
    const yaw = turn * Math.PI / 2;
    return [[0.5, 0.5], [0, 0.5], [0.5, 0], [0, 0]].map(([ox, oz]) => ({ ox, oz, cells: reachCells(p, ox, oz, yaw) }))
      .sort((a, b) => a.cells.length - b.cells.length)[0];
  }));
  return layouts.get(p.name);
}

// a prop's box [x0, z0, x1, z1, bottom, top] (glTF space) turned by yaw about Y (three.js, as the
// prop is drawn, render/props.js propMatrix) and moved to (x, z)
export function turnBox(b, x, z, yaw) {
  const c = Math.round(Math.cos(yaw)), s = Math.round(Math.sin(yaw));
  const pts = [[b[0], b[1]], [b[2], b[3]]].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
  return { shape: 'box', x0: Math.min(pts[0][0], pts[1][0]), z0: Math.min(pts[0][1], pts[1][1]),
    x1: Math.max(pts[0][0], pts[1][0]), z1: Math.max(pts[0][1], pts[1][1]), bottom: b[4], top: b[5] };
}

export function placeVignettes(ctx) {
  ctx.vignettes = [];
  const theme = themeOf(ctx.spec), range = theme.vignettes, pieces = vignettesOf(theme.props);
  if (!range || !pieces.length || !ctx.portalFloors.length || ctx.spec.trial) return;
  const R = mulberry32(hash32(ctx.seed ^ 0x7195e7));
  // (a theme's range is for a room of 16 cells: as many more as the room is bigger)
  const count = count16(range[0] + Math.floor(R() * (range[1] - range[0] + 1)));
  if (!count) return;
  // the way: its structures' cells and its floors, and how far every cell is from it
  const runCells = new Set(ctx.moves.flatMap(m => m.cells));
  const routeFloors = new Set(ctx.moves.flatMap(m => [m.from.id, m.to.id]));
  const away = new Array(N * N).fill(Infinity), queue = [];
  for (const c of new Set([...runCells, ...ctx.moves.flatMap(m => [m.from.c, m.to.c])])) { away[c] = 0; queue.push(c); }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], x = c % N, z = (c / N) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inb(x + dx, z + dz)) continue;
      const n = idx(x + dx, z + dz);
      if (away[n] > away[c] + 1) { away[n] = away[c] + 1; queue.push(n); }
    }
  }
  const portalCells = ctx.portals.flatMap(p => p.cells);
  const nearPortal = (f, r) => portalCells.some(c => Math.abs(c % N - f.x) <= r && Math.abs(((c / N) | 0) - f.z) <= r);
  // (a floor of the way may be under one, unblocked and as it is: `way`)
  const free = (f, way = false) => !!f && !f.layer && !f.fluid && !f.prot && !f.landing && !f.roof && !f.site && !f.spot && !f.siteBlocked
    && !f.siteDressing && !f.siteClaimTop && !f.hordeReserved && !f.soft && !ctx.border(f) && !runCells.has(f.c) && (way || !routeFloors.has(f.id))
    && !ctx.siteSpace?.has(f.c) && !ctx.keep?.has(f.c) && !ctx.ramp?.has(f.c) && !ctx.railed?.has(f.c) && !ctx.noCross?.has(f.c)
    && !ctx.foot?.has(f.c) && !nearPortal(f, 1);
  // what the cube must still reach: its portals, its reward sites and its spots
  const entry = ctx.portalFloors.find(f => f !== ctx.hub) || ctx.hub || ctx.portalFloors[0], exit = ctx.hub || entry;
  const must = [...ctx.portalFloors, ...ctx.sites.flatMap(s => [s.access, s.floor]), ...(ctx.spots || []).map(s => s.access)].filter(Boolean);
  const reached = () => { const from = reachFrom(ctx, [entry], false), to = reachTo(ctx, exit, false); return f => from.has(f.id) && to.has(f.id); };
  const needed = must.filter(reached());
  const order = pieces.map(p => ({ p, r: R() })).sort((a, b) => a.r - b.r).map(q => q.p);
  // the one whose turn it is where it fits, or else the next of the theme's that does
  const fit = (p, n) => {
    const height = Math.ceil(p.height / LH), options = [];
    for (const f of ctx.floors) {
      if (!free(f) || away[f.c] > NEAR || nearPortal(f, 2)) continue;
      options.push({ f, turn: Math.floor(R() * 4), score: -Math.abs(away[f.c] - 2.5) + R() * 3 });
    }
    options.sort((a, b) => b.score - a.score);
    let checks = 0;
    for (const { f, turn } of options.slice(0, TRIES)) {
      // its footprint: every cell its boxes reach into
      const { ox, oz, cells } = layoutOf(p)[turn];
      if (cells.some(([dx, dz]) => !inb(f.x + dx, f.z + dz))) continue;
      const x = f.x + ox, z = f.z + oz, yaw = turn * Math.PI / 2;
      const colliders = p.colliders.map(b => turnBox(b, x, z, yaw)), occluders = p.occluders.map(b => turnBox(b, x, z, yaw));
      const floors = cells.map(([dx, dz]) => ctx.layerFloor(idx(f.x + dx, f.z + dz), 0));
      if (floors.some(g => !free(g, true) || Math.abs(g.top - f.top) > LEVEL || ctx.nextAbove(g) && ctx.nextAbove(g).bottom < f.top + height + 1)) continue;
      const { blocked, covered } = landmarkClaims(floors, colliders, occluders), was = floors.map(g => g.top);
      if (floors.some(g => routeFloors.has(g.id) && (blocked.has(g.c) || g.top !== f.top))) continue;
      // (nor lowered where it walls in a fluid beside it: cubegen/contain.js)
      if (floors.some(g => f.top < g.top && DIRS.some(([dx, dz]) => inb(g.x + dx, g.z + dz)
        && ctx.cols[idx(g.x + dx, g.z + dz)].some(h => h.fluid && h.surf > f.top)))) continue;
      if (checks++ >= CHECKS) break;
      // levelled and its cells blocked, everything the cube must reach is still reached both ways
      for (const g of floors) { g.top = f.top; if (blocked.has(g.c)) g.siteBlocked = true; }
      if (!needed.every(reached())) {
        floors.forEach((g, i) => { g.top = was[i]; g.siteBlocked = false; });
        continue;
      }
      for (const g of floors) {
        ctx.lvl0[g.c] = g.top;
        if (blocked.has(g.c)) g.siteBlockTop = g.top + height;
        if (covered.has(g.c)) { g.siteDressing = true; g.siteClaimTop = g.top + height; }
        g.vignette = true;
      }
      return { name: p.name, f, x, z, yaw, colliders, occluders, floors, seed: hash32(ctx.seed ^ Math.imul(n + 1, 0x7195)) };
    }
    return null;
  };
  const size = p => layoutOf(p)[0].cells.length, used = new Set();
  for (let n = 0; n < count; n++) {
    const first = order[n % order.length], rest = order.filter(p => p !== first).sort((a, b) => size(b) - size(a));
    for (const p of [first, ...rest]) {
      if (used.has(p.name)) continue;
      const placed = fit(p, n);
      if (placed) { ctx.vignettes.push(placed); used.add(p.name); break; }
    }
  }
  // a few small things round each one, on the free floors beside it
  const dressing = DRESSING[theme.props] || [];
  for (const v of ctx.vignettes) {
    const DR = mulberry32(v.seed), taken = new Set(v.floors.map(g => g.c)), beside = [];
    for (const g of v.floors) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inb(g.x + dx, g.z + dz)) continue;
      const h = ctx.layerFloor(idx(g.x + dx, g.z + dz), 0);
      if (h && !taken.has(h.c) && free(h) && Math.abs(h.top - g.top) <= 1) { taken.add(h.c); beside.push(h); }
    }
    v.dressing = [];
    for (let k = 0; k < Math.min(beside.length, 1 + Math.floor(DR() * 3)) && dressing.length; k++) {
      const i = Math.floor(DR() * beside.length), h = beside.splice(i, 1)[0];
      const name = `${theme.props}_${dressing[Math.floor(DR() * dressing.length)]}_${DR() < 0.5 ? 'a' : 'b'}`;
      if (propMetadata.has(name) && !propMetadata.get(name).blocking) v.dressing.push({ name, f: h, yaw: DR() * Math.PI * 2 });
    }
  }
}

// The vignettes as the map carries them, with the final ground: { list: [{ name, x, y, z, yaw }]
// (the surroundings show them like landmarks), placements, blockers and occluders (cube space,
// heights from the ground they stand on), reservations (no ambient props on their cells) }.
export function finishVignettes(ctx) {
  const out = { list: [], placements: [], blockers: [], occluders: [], reservations: [] };
  for (const v of ctx.vignettes || []) {
    // (structures keep out of their cells; one that got built over anyway is left out)
    if (v.floors.some(g => ctx.pieces[g.c].length)) continue;
    const y = floorY(v.f, 0.5, 0.5), at = { name: v.name, x: v.x, y, z: v.z, yaw: v.yaw };
    out.list.push(at);
    out.placements.push({ ...at, s: 1, vignette: true });
    out.blockers.push(...v.colliders.map(b => ({ ...b, bottom: y + b.bottom, top: y + b.top, vignette: v.name })));
    out.occluders.push(...v.occluders.map(b => ({ ...b, bottom: y + b.bottom, top: y + b.top })));
    out.reservations.push(...v.floors.map(g => ({ c: g.c, layer: 0 })));
    for (const d of v.dressing) out.placements.push({ name: d.name, x: d.f.x + 0.5, y: floorY(d.f, 0.5, 0.5), z: d.f.z + 0.5,
      yaw: d.yaw, s: 0.9, vignette: true });
  }
  ctx.stats.vignettes = out.list.length;
  return out;
}

// a box blocker into every cell the character could touch it from
export function indexBox(blockers, b) {
  for (let z = Math.max(0, Math.floor(b.z0 - CHAR_R)); z <= Math.min(N - 1, Math.floor(b.z1 + CHAR_R)); z++)
    for (let x = Math.max(0, Math.floor(b.x0 - CHAR_R)); x <= Math.min(N - 1, Math.floor(b.x1 + CHAR_R)); x++) blockers[idx(x, z)].push(b);
}
