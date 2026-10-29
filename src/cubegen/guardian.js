// A deliberate side/descent arena: shared boundary terrain, one ground entrance, a dry
// fight zone shaped by one of the arena types (cubegen/arenashapes.js) and dressed with
// generated clutter (cubegen/arenaprops.js), and a sealed onward exit. The doorways and the
// guardian's spot stay flat. Every free zone floor connects without jumps, and the zone
// holds the doubled population; an arena that cannot falls back to a plainer one. Its fluid
// dwellers (the Squirtles, physics/dwell.js) get a pond of their fluid dug into it (`digPonds`).
import { N, LH, DIRS, OPP, MAX_L, WATER, ACID, MUD, FLUID_NAME } from '../core/constants.js';
import { idx, edgeKey, clamp, mulberry32, hash32, makeNoise } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { population } from '../core/spawns.js';
import { ENEMY_KINDS } from '../core/enemies.js';
import { themeOf } from '../themes/depth.js';
import { rockTint } from '../themes/surfaces.js';
import { createContext } from './context.js';
import { groundHeights } from './ground.js';
import { placePortals } from './portals.js';
import { SHAPES, BOSS_SHAPES, TIDAL, BOWL, STAGE, MIRE } from './arenashapes.js';
import { dressArena } from './arenaprops.js';
import { BOSS_ARENAS } from '../core/bosses.js';
import { flipArena } from './fliparena.js';
import { towerArena } from './towerarena.js';
import { finishArena, reachFrom } from './arenamap.js';

const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
const FLAT = { rel: new Int8Array(N * N), zone: new Uint8Array(N * N).fill(1),
  crisp: new Uint8Array(N * N), ramp: new Uint8Array(N * N), marks: {} };

// The arenas of their own a boss may bring (core/bosses.js BOSS_ARENAS `type`; docs/bosses.md "An
// arena of its own"), but those drawn from a shape (cubegen/arenashapes.js BOSS_SHAPES): each
// builds its whole cube and makes its map with finishArena (cubegen/arenamap.js). It is given
// { spec, ctx, role, own (its BOSS_ARENAS entry), entry, exit, level }; `bare`: that alone (it
// places its own way on), else also what every arena shape is drawn around, its portals placed:
// { U (the boss's spot), approach, R, frame }. Its floors name what they are built of
// (`surface`, themes/surfaces.js), never a colour: they look like the theme of their depth.
const OWN_ARENAS = { tower: { build: towerArena, bare: true }, flip: { build: flipArena } };

// Floors, links and corner heights for one arena shape.
function buildFloors(ctx, base, shape, level) {
  const { prot0 } = ctx, floors = [];
  for (let c = 0; c < N * N; c++) {
    const x = c % N, z = (c / N) | 0, cell = inner(x, z);
    const top = !cell ? base[c] : prot0[c] ? level : clamp(level + shape.rel[c], shape.min ?? 2, MAX_L);
    const f = ctx.mk(c, top, 0, 0);
    f.id = c; f.prot = prot0[c]; f.arenaCell = cell; f.encounter = cell && !!shape.zone[c];
    if (cell && shape.surface?.[c]) f.surface = shape.surface[c];   // (built: Mansk's museum, themes/surfaces.js)
    floors.push(f);
  }
  const at = (x, z) => x >= 0 && z >= 0 && x < N && z < N ? floors[idx(x, z)] : null;
  // Scenery beside the zone is a wall (two levels up at least), never a ledge to climb.
  for (const f of floors) if (f.arenaCell && !f.encounter) {
    const tops = DIRS.map(([dx, dz]) => at(f.x + dx, f.z + dz)).filter(g => g?.encounter).map(g => g.top);
    if (tops.length && f.top > Math.max(...tops) - 2) f.top = Math.min(MAX_L, Math.max(f.top, Math.max(...tops) + 2));
  }
  const linked = (f, g) => {
    if (!f.arenaCell || !g.arenaCell) return f.top === g.top && (!f.arenaCell || f.encounter) && (!g.arenaCell || g.encounter);
    if (f.encounter !== g.encounter) return false;
    const dh = Math.abs(f.top - g.top);
    if (dh === 0) return true;
    if (dh > 1) return false;
    return (!shape.crisp[f.c] && !shape.crisp[g.c]) || !!shape.ramp[f.c] || !!shape.ramp[g.c];
  };
  for (const f of floors) f.link = DIRS.map(([dx, dz]) => { const g = at(f.x + dx, f.z + dz); return g && linked(f, g) ? g : null; });
  // Corners blend linked floors into slopes. Border cells and pads stay exactly flat.
  const pinned = f => !f.arenaCell || f.prot;
  for (const f of floors) {
    if (pinned(f)) { f.cs = Array(4).fill(f.top * LH); f.split = f.c % 2; continue; }
    f.cs = [0, 1, 2, 3].map(k => {
      const X = f.x + (k & 1), Z = f.z + (k >> 1), group = [f];
      for (let i = 0; i < group.length; i++) for (const g of group[i].link)
        if (g && (g.x === X - 1 || g.x === X) && (g.z === Z - 1 || g.z === Z) && !group.includes(g)) group.push(g);
      const pins = group.filter(pinned);
      if (pins.length) return pins.reduce((s, g) => s + g.top, 0) / pins.length * LH;
      const mean = group.reduce((s, g) => s + g.top, 0) / group.length * LH;
      return mean + ((hash32(X * 7919 + Z * 104729 + Math.round(mean * 8) * 31337) % 1000) / 1000 - .5) * .06;
    });
    f.split = Math.abs(f.cs[0] - f.cs[3]) <= Math.abs(f.cs[1] - f.cs[2]) ? 0 : 1;
  }
  return floors;
}

// The terrain works when every zone floor, the guardian and the gate are reachable on foot.
function terrainOK(floors, start, ends) {
  const seen = new Set([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const g of queue[i].link)
    if (g && (g.encounter || g.prot) && !seen.has(g)) { seen.add(g); queue.push(g); }
  return ends.every(f => seen.has(f)) && floors.every(f => !f.encounter || seen.has(f));
}

// Free zone floors where the spawner may place bodies, with room to spare.
function roomFor(floors, blocked, entrance, gate, need) {
  const free = floors.filter(f => f.encounter && !blocked.has(f.c)
    && Math.hypot(f.x - entrance.x, f.z - entrance.z) >= 4 && Math.hypot(f.x - gate.x, f.z - gate.z) >= 1.8).length;
  return free >= need + Math.max(8, Math.ceil(need * .35));
}

// The fluid dwellers an arena's population brings (the Squirtles: core/enemies.js `dwells`): how
// many live in each fluid, Map fluid -> count (by its kinds' weights)
function dwellers(spec) {
  const out = new Map();
  if (spec.guardian?.boss && (spec.guardian.role ?? 'descent') === 'descent') return out;   // (a boss brings his own)
  for (const [type, p] of population({ seed: spec.seed, depth: spec.depth, guardian: true, biome: spec.biome })) {
    const kinds = Object.entries(p.kinds ?? { [type]: 1 }).filter(([k]) => ENEMY_KINDS[k]?.dwells), total = kinds.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of kinds) out.set(ENEMY_KINDS[k].dwells[0], (out.get(ENEMY_KINDS[k].dwells[0]) ?? 0) + p.count * w / total);
  }
  return out;
}
// The ponds an arena wants: [fluid, how many live in it, its cells at most] each. Its dwellers'
// (POND.per cells for each), or a boss's lagoon (core/bosses.js BOSS_ARENAS `lagoon`: Qualmos's,
// deep water he dives into, its cells; nobody lives in it).
function pondsWanted(spec) {
  const boss = (spec.guardian?.role ?? 'descent') === 'descent' ? spec.guardian?.boss : null, lagoon = boss && BOSS_ARENAS[boss]?.lagoon;
  if (lagoon) return [[WATER, 0, lagoon]];
  return [...dwellers(spec)].map(([fluid, n]) => [fluid, n, clamp(Math.round(n * POND.per), POND.least, POND.most)]);
}
// A pond for an arena's fluid dwellers, one per fluid they live in: `per` cells for each of them
// (`least`..`most`; smaller where that does not fit), or a boss's lagoon (pondsWanted), round, on about one level of the fight zone,
// away from the doorways, the guardian's spot, the props that block and the ramps. Its surface lies
// level with the lowest floor round it and under its own, its bed two levels under that (too deep
// to wade, as a pool's: cubegen/pools.js; water is swum in, its banks a level over it at most where
// they meet it); what was put on it that does not block goes. What is
// left of the zone must still hold together and hold the rest of the population. false: no room
// for one (the arena falls back to a plainer one; the plainest has none then, and the dwellers it
// has no room for stay away, game/enemyspawn.js guardianSpots).
const POND = { per: 3.5, least: 8, most: 28 };
function digPonds(ctx, { floors, dress, shape }, frame, ends, need) {
  const [start, gate] = ends, at = (x, z) => x >= 0 && z >= 0 && x < N && z < N ? floors[idx(x, z)] : null;
  let blocked = new Set(dress.blocked), left = need;
  const ponds = [], taken = new Set(), before = reachFrom(start, blocked);
  for (const [fluid, n, most] of pondsWanted(ctx.spec)) {
    const R = frame.R, far = (f, [x, z], d) => Math.hypot(f.x - x, f.z - z) >= d;
    const ok = f => f.encounter && !f.prot && !taken.has(f) && !frame.flat[f.c] && !blocked.has(f.c) && !shape.ramp[f.c]
      && far(f, frame.E, 4) && far(f, frame.U, 2.5) && far(f, frame.G, 2.5);
    const seeds = floors.filter(ok);
    for (let i = seeds.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
    const dig = size => {
      for (const seed of seeds) {
        const cells = [seed], set = new Set(cells);
        const near = floors.filter(f => f !== seed && ok(f) && Math.abs(f.top - seed.top) <= 1)
          .sort((a, b) => Math.hypot(a.x - seed.x, a.z - seed.z) - Math.hypot(b.x - seed.x, b.z - seed.z));
        for (const f of near) {
          if (cells.length >= size) break;
          if (DIRS.some(([dx, dz]) => set.has(at(f.x + dx, f.z + dz)))) { cells.push(f); set.add(f); }
        }
        if (cells.length < size) continue;
        const banks = cells.flatMap(f => DIRS.map(([dx, dz]) => at(f.x + dx, f.z + dz))).filter(g => !set.has(g));
        const S = Math.min(...cells.map(f => f.top), ...banks.map(g => g?.top ?? -Infinity)), bed = S - 2;
        if (bed < 1 || banks.some(g => !g || taken.has(g))) continue;
        const out = new Set([...blocked, ...cells.map(f => f.c)]), wet = new Set([...taken, ...cells].map(f => f.c));
        if (!roomFor(floors, out, start, gate, left - n)) continue;
        // (the zone round it still all one, and all reached past the props that was before it)
        const reach = reachFrom(start, wet), past = reachFrom(start, out);
        if (!floors.every(f => !f.encounter || wet.has(f.c) || reach.has(f)) || !floors.every(f => !before.has(f) || wet.has(f.c) || past.has(f))) continue;
        return { fluid, cells, set, S, bed, out };
      }
      return null;
    };
    let pond = null;
    for (let size = most; !pond && size >= POND.least; size = Math.floor(size * 0.8)) pond = dig(size);
    if (!pond) return false;
    ponds.push(pond); blocked = pond.out; left -= n;
    for (const f of pond.cells) taken.add(f);
  }
  for (const { fluid, cells, set, S, bed } of ponds) {
    for (const f of cells) Object.assign(f, { fluid, surf: S, top: bed, cs: Array(4).fill(bed * LH), split: f.c % 2 });
    // water: its banks' corners at it no higher than a level over its surface, so a swimmer climbs
    // out anywhere (physics/move.js SWIM_STEP; but where a pinned floor, a doorway's or the border's,
    // shares the corner: it stays as its neighbours have it)
    if (fluid === WATER) {
      const around = (X, Z) => [[X - 1, Z - 1], [X, Z - 1], [X - 1, Z], [X, Z]].map(([x, z]) => at(x, z));
      for (const g of floors) if (!set.has(g) && !g.fluid) {
        g.cs = g.cs.map((v, k) => {
          const near = around(g.x + (k & 1), g.z + (k >> 1));
          return near.some(h => set.has(h)) && !near.some(h => h && (!h.arenaCell || h.prot)) ? Math.min(v, (S + 1) * LH) : v;
        });
        g.split = Math.abs(g.cs[0] - g.cs[3]) <= Math.abs(g.cs[1] - g.cs[2]) ? 0 : 1;
      }
    }
    for (const f of cells) DIRS.forEach(([dx, dz], d) => {
      const g = at(f.x + dx, f.z + dz);
      if (g && !set.has(g)) { f.link[d] = null; if (g.link[OPP[d]] === f) g.link[OPP[d]] = null; }
    });
    for (let i = dress.placements.length - 1; i >= 0; i--)
      if (set.has(at(Math.floor(dress.placements[i].x), Math.floor(dress.placements[i].z)))) dress.placements.splice(i, 1);
    ctx.stats.fluids.push(`${FLUID_NAME[fluid]} pond`);
  }
  return true;
}


// The core's last arena (`final`, world/layout.js) has its entrance alone: its way on is planned
// all the same (the boss stands before it), but never opened, and the map has no exit.
export function generateGuardian(spec) {
  const exit = spec.guardian.exit ?? spec.exit, role = spec.guardian.role ?? 'descent', final = !!spec.guardian.final;
  const entry = spec.portals.find(p => p.dir < 4 && p.dir !== exit);
  const onward = final ? { dir: 4 } : spec.portals.find(p => p.dir === exit);
  if (!entry || !onward || spec.portals.length !== (final ? 1 : 2) || entry.layer || onward.layer
    || exit < 4 && entry.level !== onward.level)
    throw new Error('Guardian arena needs one ground entrance and one level onward exit');
  const ctx = createContext(spec.seed);
  ctx.spec = spec; ctx.K = 1; ctx.B = [0];
  groundHeights(ctx);
  const [dx, dz] = DIRS[exit < 4 ? exit ^ 1 : entry.dir], level = entry.level;
  // a boss may have an arena of its own (core/bosses.js BOSS_ARENAS: Squarlo's tidal hills)
  const own = role === 'descent' ? BOSS_ARENAS[spec.guardian.boss] : null;
  const custom = own?.type && !BOSS_SHAPES[own.type] ? OWN_ARENAS[own.type] : null;
  if (own?.type && !BOSS_SHAPES[own.type] && !custom) throw new Error(`No arena of type ${own.type}`);
  const given = { spec, ctx, role, own, entry, exit, level };
  // (Foggery's caldera and tower: its well on the caldera's floor, cubegen/towerarena.js)
  if (custom?.bare) {
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { ctx.lvl0[idx(x, z)] = level; ctx.void0[idx(x, z)] = 0; }
    return custom.build(given);
  }
  // Wells sit opposite the entrance; side exits retain their shared face position.
  const gx = dx ? dx > 0 ? 4 : N - 5 : N / 2;
  const gz = dz ? dz > 0 ? 4 : N - 5 : N / 2;
  ctx.spec = { ...spec, portals: [entry, exit < 4 ? onward : { dir: 4, x: gx, z: gz }] };
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    ctx.lvl0[idx(x, z)] = level; ctx.void0[idx(x, z)] = 0;
  }
  placePortals(ctx);
  // Ordinary wells clamp their height; every arena exit shares the entrance level.
  ctx.portals[1].level = level;
  for (const c of ctx.portals[1].cells) ctx.lvl0[c] = level;
  const base = Int16Array.from(ctx.lvl0);

  // The frame every arena type is drawn around (cell coordinates).
  const xz = c => [c % N, (c / N) | 0], inward = (p, d) => [p[0] - DIRS[d][0], p[1] - DIRS[d][1]];
  const [ex, ez] = xz(ctx.portals[0].c), [px, pz] = xz(ctx.portals[1].c);
  const U = [px + dx * 2, pz + dz * 2];
  const flat = new Uint8Array(N * N);
  const flatten = (x, z, r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (inner(x + a, z + b)) flat[idx(x + a, z + b)] = 1; };
  for (const p of ctx.portals) for (const c of p.cells) flatten(...xz(c), 1);
  flatten(U[0], U[1], 1);
  let need = 0;
  for (const [, p] of population({ seed: spec.seed, depth: spec.depth, guardian: true, biome: spec.biome })) need += p.count;
  const R = mulberry32(hash32(spec.seed ^ 0xa7e4a));
  const frame = { level, need, flat, R, noise: makeNoise(R), noise2: makeNoise(R),
    E: inward([ex, ez], entry.dir), U, G: exit < 4 ? inward([px, pz], exit) : [px, pz] };

  // (Flip's box, any side of which can be the floor, cubegen/fliparena.js)
  if (custom) return custom.build({ ...given, U, approach: [dx, dz], R, frame });
  const requested = own?.type ?? (spec.guardian.arena && SHAPES[spec.guardian.arena] ? spec.guardian.arena : 'hills');
  const tint = rockTint(themeOf(spec));
  // a boss who makes it dark has braziers lit round its arena (core/bosses.js)
  const braziers = own?.braziers ?? 0;
  let arena = null;
  for (const type of [...new Set([requested, 'hills', 'crater'])]) {
    const shape = (SHAPES[type] ?? BOSS_SHAPES[type])(frame), floors = buildFloors(ctx, base, shape, level);
    const start = floors[idx(ex, ez)], guard = floors[idx(...U)], gate = floors[idx(px, pz)];
    if (!terrainOK(floors, start, [guard, gate])) continue;
    for (const clutter of [1, .5, 0]) {
      const dress = dressArena({ type, shape, floors, frame, R, biome: spec.biome, tint, clutter, braziers, props: own?.props });
      if (!roomFor(floors, dress.blocked, start, gate, need)) continue;
      // (and its fluid dwellers' ponds)
      if (!digPonds(ctx, { floors, dress, shape }, frame, [start, gate, guard], need)) continue;
      arena = { type, shape, floors, dress };
      break;
    }
    if (arena) break;
  }
  if (!arena) {   // the plain flat arena of old: always fits (a pond too, if it can)
    const floors = buildFloors(ctx, base, FLAT, level);
    arena = { type: 'plain', shape: FLAT, floors, dress: dressArena({ type: 'hills', shape: FLAT, floors, frame, R, biome: spec.biome, tint, clutter: 0, braziers }) };
    digPonds(ctx, arena, frame, [floors[idx(ex, ez)], floors[idx(px, pz)], floors[idx(...U)]], need);
  }
  const { floors, dress } = arena;
  for (const f of floors) ctx.cols[f.c].push(f);

  const portals = ctx.portals.map(p => ({ id: p.id, kind: p.kind, dir: p.dir, layer: 0, cells: p.cells,
    x: p.c % N, z: Math.floor(p.c / N), y: level * LH, floor: floors[p.c] }));
  const gate = portals[1], entrance = portals[0];
  const guardFloor = floors[idx(...U)];
  const boss = role === 'descent' ? spec.guardian.boss ?? null : null;
  const guardian = { role, bossPlaceholder: role === 'descent' && !boss, boss, exit: final ? null : exit,
    floor: guardFloor, x: guardFloor.x + .5, z: guardFloor.z + .5,
    y: floorY(guardFloor, .5, .5), yaw: Math.atan2(dx, dz), approach: [dx, dz], portalId: final ? null : portals[1].id, ...final && { final } };
  const reached = reachFrom(entrance.floor, dress.blocked);
  if (!reached.has(guardFloor) || !reached.has(portals[1].floor)) throw new Error('Disconnected guardian arena');
  // Rails keep fights out of lower ground beside the zone: perimeter pockets two levels
  // down, and any lower scenery, without altering the neighbouring cube's terrain.
  const fences = new Map(), fenceList = [];
  for (const f of floors) if (f.encounter) DIRS.forEach(([ox, oz], d) => {
    const other = floors[idx(f.x + ox, f.z + oz)];
    if (other.encounter || other.top >= f.top - (other.arenaCell ? 0 : 1)) return;
    const pts = [.07, .5, .93].map(t => {
      const fx = d === 0 ? .93 : d === 1 ? .07 : t, fz = d === 2 ? .93 : d === 3 ? .07 : t;
      return [f.x + fx, floorY(f, fx, fz), f.z + fz];
    });
    const ys = pts.map(p => p[1]), rail = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer: 0, show: true };
    fenceList.push(rail); fences.set(edgeKey(f.x, f.z, other.x, other.z), [rail]);
  });
  ctx.stats.layers = 1; ctx.stats.mode = `guardian arena (${arena.type})`; ctx.stats.fences = fenceList.length;
  return finishArena({ spec, ctx, role, cols: ctx.cols, floors, portals: final ? [entrance] : portals, exit: final ? null : exit, guardian, reached,
    // (Mansk's museum: which way its stage looks, out over the hall, and how big it is: where his
    // intro hangs its curtain, core/mansk.js curtainLine)
    arena: { type: arena.type, requested, ...arena.type === 'stage' && { stage: { axis: [...arena.shape.marks.axis], depth: STAGE.depth, half: STAGE.half } } },
    // the tidal hills' water (game/tide.js): its levels at rest and at high tide, and the box of
    // cells it stands in (inside the bank)
    tide: arena.type === 'tidal' ? { rest: level + TIDAL.low + TIDAL.rest, high: level + TIDAL.high, fluid: WATER, box: [1, 1, N - 1, N - 1] }
      // Slomo's flood (game/tide.js, core/slomo.js): over the basin of his slime bowl, inside the
      // bank; dry at rest (and gone for good once he is beaten), wadeable as water (`fluid`, never
      // over the head), drawn as slime (`look`: the depth's acid colours); it comes in from a side
      // (`flood`: its front, game/tide.js) and follows his level fast
      : arena.type === 'bowl' ? { rest: level + BOWL.low - 0.5, gone: level + BOWL.low - 0.5, high: level + BOWL.low + BOWL.flood,
        fluid: WATER, look: ACID, box: [2, 2, N - 2, N - 2], flood: true, follow: 4 }
      // Sollmeldon's mud (game/mud.js, core/sollmeldon.js): over the basin of his mire, inside the
      // bank; `rest`: how high it stands at first (its volume: what that holds, level); waded
      // through as water, drawn as mud (`look`); his fight adds to it and the world's tilt leans it
      : arena.type === 'mire' ? { rest: level + MIRE.low + MIRE.mud, high: level + MIRE.low + MIRE.mud, fluid: WATER, look: MUD,
        box: [2, 2, N - 2, N - 2], mud: true } : null,
    fences, fenceList, placements: dress.placements, blockers: dress.blockers });
}
