// Foggery's arena (core/bosses.js BOSS_ARENAS.foggery, docs/bosses.md): a caldera full of lava
// with a great round tower in the middle (core/foggery.js TOWER). No walls: the caldera's floor and
// its lava go out to the cube's sides (like Flip's box, its edge does not match the neighbours'
// ground: only the doorway does), and a stone bridge leads from the doorway over the lava to the
// tower. The tower is a stepped cone, wide at its foot and half as
// wide at its top, a ramp winding round it from the caldera's floor up to the top, inward as it
// climbs: flat where the bridge joins it, a wall on its inner side up to the turn above. One floor
// to a column (but the bridge over the caldera's floor). The bridge has low stone parapets; the
// ramp and the top have none (the platforms float round the top, core/foggery.js PLATFORMS). He
// waits at the foot of the ramp, just out of the lava. The well
// lies on the caldera's floor in a far corner, under the lava until he is beaten (game/tide.js
// drains it). Loose stones and rubble lie about the tower and the caldera's floor, and on the floor
// the small things his arena brings (core/bosses.js BOSS_ARENAS.foggery `props`: volcanic rocks).
// The tower, the ramp and the bridge are its theme's masonry, the caldera's floor its crust
// (`surface`, themes/surfaces.js).
import { N, LH, DIRS, OPP, EDGE_CORNERS, LAVA } from '../core/constants.js';
import { idx, edgeKey, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { propMetadata } from '../core/propcatalog.js';
import { TOWER, PLATFORMS, slotGrid, slotNext, rampAt, rampHeight, rampMarks, puzzleStart } from '../core/foggery.js';
import { themeOf } from '../themes/depth.js';
import { rockTint } from '../themes/surfaces.js';
import { placePortals, edgeCell } from './portals.js';
import { smallProps } from './arenaprops.js';
import { finishArena, reachFrom } from './arenamap.js';

const TAU = Math.PI * 2;
const wrapTurn = a => a - Math.floor(a + 0.5);
const flat = top => Array(4).fill(top * LH);
// how closely two floors' edges must meet to be one walkable surface (units)
const MEET = 0.26;
// the clutter (non-blocking, small): what lies on the tower and the bridge (neutral stones, tinted
// the theme's rock), and on the caldera's floor (slabs, and what the arena brings)
const STONES = ['any_rock_a', 'any_rock_b', 'any_rock_c', 'any_pebbles_a', 'any_pebbles_b', 'any_stone_chips_a', 'any_stone_chips_b',
  'ruins_rubble_a', 'ruins_rubble_b', 'any_gravel_patch_a', 'any_gravel_patch_b'];
const SLABS = ['any_rock_slab_a', 'any_rock_slab_b'];

export function towerArena({ spec, ctx, entry, role, own }) {
  const T = TOWER, door = entry.level, R = mulberry32(hash32(spec.seed ^ 0x70e4a));
  ctx.spec = { ...spec, portals: [entry] };
  placePortals(ctx);
  const pad = ctx.portals[0], d = pad.dir;
  // local (j steps in from the doorway's side, t along it) -> the cell
  const at = (j, t) => edgeCell(d, t, j);
  // the bridge joins the ramp on the doorway's side; the ramp turns one way or the other
  const [ox, oz] = DIRS[d], junction = Math.atan2(oz, ox), spin = R() < 0.5 ? 1 : -1;
  const radius = (x, z) => Math.hypot(x - T.mid, z - T.mid);
  const portalCells = new Set(pad.cells);
  // the bridge: from the doorway to the ramp (over the doorway's rows, and along the side to the
  // middle rows if the doorway is off to a side), wherever the tower does not stand yet
  const bridge = new Set();
  for (let t = Math.min(pad.pos - 1, 6); t <= Math.max(pad.pos + 1, 8); t++) for (let j = 0; j <= 4; j++) bridge.add(at(j, t));
  // the well: a 3 x 3 pad on the caldera's floor in a far corner, clear of the tower's foot
  const wt = R() < 0.5 ? 2 : 13, wellC = at(13, wt), well = [];
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) well.push(at(13 + a, wt + b));
  const wellId = pad.id + 1;

  // the tower's surface at the point (x, z) for the ramp's turn at u (the cell's own turn,
  // followed round, so a cell's corners lie on one smooth ramp)
  const towerAt = (x, z) => {
    const r = radius(x, z);
    if (r < T.crown) return { u: Infinity };
    if (r >= T.base) return { u: -Infinity };
    return { u: rampAt(r, Math.atan2(z - T.mid, x - T.mid), junction, spin, door) };
  };
  const cols = Array.from({ length: N * N }, () => []);
  const add = (c, top, bottom, cs, extra = {}) => {
    const f = ctx.mk(c, top, bottom, 0);
    Object.assign(f, { cs, split: Math.abs(cs[0] - cs[3]) <= Math.abs(cs[1] - cs[2]) ? 0 : 1, arenaCell: true, encounter: false }, extra);
    cols[c].push(f);
    return f;
  };
  const m = rampMarks(door);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = idx(x, z);
    const { u } = towerAt(x + 0.5, z + 0.5);
    const ground = () => add(c, T.ground, 0, flat(T.ground), { surface: 'crust', ground: true, prot: well.includes(c) ? wellId : 0 });
    if (u === -Infinity || u <= 0) {   // the caldera's floor (and the bridge over it)
      ground();
      if (bridge.has(c)) add(c, door, door - T.slab, flat(door), { surface: 'masonry', encounter: true, tower: 'bridge', prot: portalCells.has(c) ? pad.id : 0 });
      continue;
    }
    if (u >= m.t) { add(c, T.top, 0, flat(T.top), { surface: 'masonry', encounter: true, tower: 'top' }); continue; }
    // the ramp: the cell's corners follow its turn round
    const mid = Math.atan2(z + 0.5 - T.mid, x + 0.5 - T.mid);
    const cs = [0, 1, 2, 3].map(k => {
      const a = Math.atan2(z + (k >> 1) - T.mid, x + (k & 1) - T.mid);
      return rampHeight(u + wrapTurn(spin * (a - mid) / TAU), door) * LH;
    });
    const top = Math.round(Math.max(...cs) / LH), level = cs.every(v => Math.abs(v - T.top * LH) < 1e-6);
    add(c, top, 0, cs, { surface: 'masonry', encounter: true, ramp: u, tower: level ? 'top' : 'ramp' });
  }
  for (const col of cols) col.sort((a, b) => a.top - b.top);
  const floors = cols.flat();
  floors.forEach((f, i) => { f.id = i; });

  // links: neighbouring floors whose edges meet
  const edge = (f, dd) => EDGE_CORNERS[dd].map(k => f.cs[k]);
  for (const f of floors) f.link = DIRS.map(([dx, dz], dd) => {
    const x = f.x + dx, z = f.z + dz;
    if (x < 0 || z < 0 || x >= N || z >= N) return null;
    const mine = edge(f, dd);
    let best = null, gap = MEET;
    for (const g of cols[idx(x, z)]) {
      const theirs = edge(g, OPP[dd]), off = Math.max(Math.abs(mine[0] - theirs[0]), Math.abs(mine[1] - theirs[1]));
      if (off < gap) { best = g; gap = off; }
    }
    return best;
  });

  // parapets along the bridge where it drops away (none up the ramp, none round the top)
  const fences = new Map(), fenceList = [];
  for (const f of floors) if (f.tower === 'bridge') DIRS.forEach(([dx, dz], dd) => {
    if (f.link[dd]) return;
    const x = f.x + dx, z = f.z + dz, mine = edge(f, dd), lo = Math.min(...mine);
    if (x < 0 || z < 0 || x >= N || z >= N) return;
    // a wall there (the turn above): none needed
    if (cols[idx(x, z)].some(g => g.bottom * LH < lo + 0.5 && Math.max(...edge(g, OPP[dd])) > lo + 0.3)) return;
    const pts = [0.07, 0.5, 0.93].map(t => {
      const fx = dd === 0 ? 0.93 : dd === 1 ? 0.07 : t, fz = dd === 2 ? 0.93 : dd === 3 ? 0.07 : t;
      return [f.x + fx, floorY(f, fx, fz), f.z + fz];
    });
    const ys = pts.map(p => p[1]), rail = { pts, ymin: Math.min(...ys), ymax: Math.max(...ys), layer: 0, show: true, style: 'stone' };
    fenceList.push(rail);
    const k = edgeKey(f.x, f.z, x, z);
    fences.set(k, [...fences.get(k) ?? [], rail]);
  });

  const entrance = { id: pad.id, kind: 'side', dir: d, layer: 0, cells: pad.cells, x: pad.c % N, z: Math.floor(pad.c / N), y: door * LH, floor: cols[pad.c].at(-1) };
  const wellFloor = cols[wellC].find(f => f.ground);
  const down = { id: wellId, kind: 'down', dir: 4, layer: 0, cells: well, x: wellC % N, z: Math.floor(wellC / N), y: T.ground * LH, floor: wellFloor };
  const portals = [entrance, down];
  // he waits at the foot of the ramp, on its first floor out of the lava at rest (his intro has
  // him leap out of it onto there), facing the doorway
  const dry = f => floorY(f, .5, .5) > T.lava.rest * LH + 0.02;
  const guardFloor = floors.filter(f => f.tower === 'ramp' && f.link.filter(Boolean).length >= 2 && dry(f)).sort((a, b) => a.ramp - b.ramp)[0];
  const goal = cols[idx(T.mid, T.mid)].at(-1);
  const boss = role === 'descent' ? spec.guardian.boss ?? null : null;
  const guardian = { role, bossPlaceholder: !boss, boss, exit: 4, floor: guardFloor, x: guardFloor.x + .5, z: guardFloor.z + .5,
    y: floorY(guardFloor, .5, .5), yaw: Math.atan2(entrance.x + .5 - guardFloor.x - .5, entrance.z + .5 - guardFloor.z - .5),
    approach: [-ox, -oz], portalId: wellId };
  // the way from the doorway to the well: over the bridge, down the ramp, across the floor
  const reached = reachFrom(entrance.floor);
  if (!reached.has(guardFloor) || !reached.has(wellFloor) || !reached.has(goal)) throw new Error('Disconnected tower arena');

  // the platforms: their slots (none where the tower reaches up close under them), the ones
  // touching the top, where they start
  const under = PLATFORMS.top - PLATFORMS.clear;
  const slots = slotGrid().filter(s => {
    for (let b = 0; b < PLATFORMS.size; b++) for (let a = 0; a < PLATFORMS.size; a++)
      if (cols[idx(s.x + a, s.z + b)].some(f => Math.max(...f.cs) / LH > under)) return false;
    return true;
  });
  const next = slotNext(slots);
  const touch = slots.flatMap((s, k) => {
    for (let b = 0; b < PLATFORMS.size; b++) for (let a = 0; a < PLATFORMS.size; a++) for (const [dx, dz] of DIRS) {
      const x = s.x + a + dx, z = s.z + b + dz;
      if (x >= 0 && z >= 0 && x < N && z < N && cols[idx(x, z)].some(f => f.tower === 'top')) return [k];
    }
    return [];
  });
  const movers = { seed: hash32(spec.seed ^ 0x9a7f0), slots, next, start: puzzleStart(slots, touch, R), touch, top: PLATFORMS.top * LH, thick: PLATFORMS.thick };
  const L = T.lava;
  const tower = { door, junction, spin, top: T.top, goal: { x: goal.x, z: goal.z }, marks: m };

  // clutter: loose stones about the tower, the bridge and the floor of the caldera (under the lava
  // till he is beaten), never in the doorway or on the well
  const tint = rockTint(themeOf(spec)), placements = [], floorProps = [...SLABS, ...smallProps(own?.props ?? [])];
  const put = (f, names, chance) => {
    if (f.prot || R() >= chance) return;
    const name = names[Math.floor(R() * names.length)], p = propMetadata.get(name);
    if (!p || p.blocking) return;
    const s = 0.75 + R() * 0.4, room = Math.max(0, 0.8 - 2 * p.radius * s), fx = 0.5 + (R() - 0.5) * room, fz = 0.5 + (R() - 0.5) * room;
    placements.push({ name, x: f.x + fx, y: floorY(f, fx, fz) - 0.02, z: f.z + fz, yaw: R() * TAU, s, tint: name.startsWith('any_') ? tint : null });
  };
  for (const f of floors) {
    if (f.tower === 'top') put(f, STONES, f.x === goal.x && f.z === goal.z ? 0 : 0.22);
    else if (f.tower === 'ramp') put(f, STONES, 0.3);
    else if (f.tower === 'bridge') put(f, STONES, 0.15);
    else if (f.ground && !cols[f.c].some(g => g.tower === 'bridge')) put(f, floorProps, 0.35);
  }

  ctx.stats.layers = 1; ctx.stats.mode = 'guardian arena (tower)';
  return finishArena({ spec, ctx, role, cols, floors, portals, exit: 4, guardian, reached,
    arena: { type: 'tower', requested: 'tower' },
    // his lava (game/tide.js): at rest it fills the caldera's floor, he raises it (core/foggery.js
    // LAVA); beaten, it is gone (`gone`, the level it drains to)
    tide: { rest: L.rest, high: L.high, gone: L.gone, fluid: LAVA, box: [T.pit[0], T.pit[0], T.pit[1], T.pit[1]], follow: 2.6, defeat: 'drain' },
    fences, fenceList, placements, walled: false, more: { tower, movers } });
}
