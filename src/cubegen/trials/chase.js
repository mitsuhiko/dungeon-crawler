// The relic (docs/trials.md, `chase`): the room is entered and left on two faces that meet at a
// corner, both portals in a courtyard there, walled off (rock, six levels up) from the rest of the
// room, the hall, but for a gate with a portcullis in the wall, its lever just inside. Across the
// hall, in its far corner, the relic on its altar, and behind it in the corner the warden's lair (a
// dark arch). Rocks stand about the hall. Taking the relic wakes the warden: run back through
// the gate and drop the portcullis on it (cubegen/trials/index.js finishChase checks the race).
//   build: { courtyard: [cells], wall: [cells], gate: { c, dir (the way out of the hall) },
//            lever: { c }, altar: { c, cells }, lair: { c, x, z, yaw }, rocks: [cells], hall: Set }
import { N, at16 } from '../../core/constants.js';
import { idx, clamp } from '../../core/util.js';

export const WALL_UP = 6;   // levels over the ground round the wall (and the rocks)
const SD = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The corner where faces a and b meet ([x, z]), or null (not neighbours); a portal on an x face
// (dir 0, 1) stands at z = pos, one on a z face (2, 3) at x = pos
export function cornerOf(a, b) {
  const xf = [a, b].find(d => d < 2), zf = [a, b].find(d => d === 2 || d === 3);
  if (xf == null || zf == null) return null;
  return [xf === 0 ? N - 1 : 0, zf === 2 ? N - 1 : 0];
}
// how far along its face from the corner a portal at pos on face d stands
export const fromCorner = (d, pos, corner) => Math.abs(pos - (d < 2 ? corner[1] : corner[0]));
export const COURT = { least: Math.round(at16(4)), most: Math.round(at16(8)) };   // the courtyard's reach from the corner (cells), each way

export function shapeChase(ctx) {
  const { spec, lvl0, void0, R } = ctx;
  ctx.trialBuild = { kind: 'chase', failed: true, keep: [] };
  ctx.stats.mode = `${spec.kind} / the relic`;
  const entry = spec.portals.find(p => p.dir === spec.trial.entry), exit = spec.portals.find(p => p.dir === spec.trial.exit);
  if (!entry || !exit) return;
  const corner = cornerOf(entry.dir, exit.dir);
  if (!corner) return;
  const [cx, cz] = corner, sx = cx ? -1 : 1, sz = cz ? -1 : 1;   // (inwards from the corner)
  const local = c => [Math.abs(c % N - cx), Math.abs(((c / N) | 0) - cz)], cell = (u, v) => idx(cx + sx * u, cz + sz * v);
  // the courtyard: from the corner A cells along x and B along z, the pads (and a cell more) in it
  const xFace = [entry, exit].find(p => p.dir < 2), zFace = [entry, exit].find(p => p.dir >= 2);
  const A = clamp(fromCorner(zFace.dir, zFace.pos, corner) + 2, COURT.least, COURT.most), B = clamp(fromCorner(xFace.dir, xFace.pos, corner) + 2, COURT.least, COURT.most);
  if (fromCorner(zFace.dir, zFace.pos, corner) + 2 > COURT.most || fromCorner(xFace.dir, xFace.pos, corner) + 2 > COURT.most) return;
  const courtyard = [], wall = [], hall = new Set();
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const c = idx(x, z), [u, v] = local(c);
    if (u <= A && v <= B) courtyard.push(c);
    else if ((u === A + 1 && v <= B + 1) || (v === B + 1 && u <= A + 1)) wall.push(c);
    else hall.add(c);
  }
  // the gate: in the middle of the longer arm of the wall; the lever inside, beside the way through
  const alongX = A >= B, g = alongX ? cell(Math.round(A / 2), B + 1) : cell(A + 1, Math.round(B / 2));
  const outDir = alongX ? (sz > 0 ? 3 : 2) : (sx > 0 ? 1 : 0);   // (out of the hall: towards the corner)
  const inside = g + SD[outDir][0] + SD[outDir][1] * N;
  const lever = alongX ? inside + sx : inside + sz * N;
  // the altar: a flat 3 x 3 in the hall's far corner, two cells in from the faces; the lair in the
  // corner behind it (the warden starts farther from the gate than the relic)
  const [au, av] = [N - 4, N - 4], altar = [];
  for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) altar.push(cell(au + du, av + dv));
  const lairCell = cell(N - 2, N - 2);
  // the ground: the courtyard about the pads' levels, the hall about its own, the wall over both
  const padLevel = Math.round((entry.level + exit.level) / 2);
  const hallCells = [...hall], hallLevel = clamp(Math.round(hallCells.reduce((s, c) => s + lvl0[c], 0) / hallCells.length), 3, 9);
  const pads = new Set();
  for (const p of [entry, exit]) for (let t = p.pos - 1; t <= p.pos + 1; t++) for (let j = 0; j < 2; j++) {
    const x = [N - 1 - j, j, t, t][p.dir], z = [t, t, N - 1 - j, j][p.dir];
    pads.add(idx(x, z));
  }
  for (const c of courtyard) { void0[c] = 0; if (!pads.has(c)) lvl0[c] = clamp(lvl0[c], padLevel - 1, padLevel + 1); }
  for (const c of hall) { void0[c] = 0; lvl0[c] = clamp(lvl0[c], hallLevel - 2, hallLevel + 2); }
  const top = Math.max(padLevel, hallLevel) + WALL_UP;
  for (const c of wall) { void0[c] = 0; lvl0[c] = top; ctx.keep.add(c); }
  // the way through the gate: the gate's cell and one either side at one level
  const through = [inside, g, g - SD[outDir][0] - SD[outDir][1] * N];
  const gateLevel = Math.round((padLevel + hallLevel) / 2);
  for (const c of through) { lvl0[c] = gateLevel; ctx.keep.add(c); }
  lvl0[lever] = gateLevel; ctx.keep.add(lever);
  for (const c of altar) { void0[c] = 0; lvl0[c] = hallLevel; ctx.keep.add(c); }
  // the lair: in the corner behind the altar, flat, kept, the hall's level
  for (const c of [lairCell, cell(N - 3, N - 2), cell(N - 2, N - 3)]) { void0[c] = 0; lvl0[c] = hallLevel; ctx.keep.add(c); }
  // rocks about the hall (2 x 2, the wall's height): off the altar, the lair, the gate and the way
  // between them straight, two to four
  const busy = new Set([...altar, lairCell, ...through]);
  const near = (c, set, d) => [...set].some(q => Math.max(Math.abs(q % N - c % N), Math.abs(((q / N) | 0) - ((c / N) | 0))) <= d);
  const rocks = [];
  for (let k = 0, tries = 0; k < 2 + Math.floor(R() * 3) && tries < 60; tries++) {
    const u = A + 3 + Math.floor(R() * (N - A - 7)), v = B + 3 + Math.floor(R() * (N - B - 7));
    const block = [cell(u, v), cell(u + 1, v), cell(u, v + 1), cell(u + 1, v + 1)];
    if (block.some(c => !hall.has(c) || near(c, busy, 2) || near(c, rocks, 1))) continue;
    rocks.push(...block); k++;
  }
  for (const c of rocks) { lvl0[c] = hallLevel + WALL_UP; ctx.keep.add(c); }
  const solid = new Set([...wall.filter(c => !through.includes(c)), ...rocks]);
  ctx.trialKeep = new Set([...wall, ...through, lever, ...altar, ...rocks, lairCell]);
  ctx.noFence = new Set([...ctx.noFence || [], ...wall, ...rocks]);
  ctx.noBuild ??= new Set();
  for (const c of solid) ctx.noBuild.add(c);
  const yaw = Math.atan2(-sx, -sz);   // (the arch faces into the room, at the altar)
  Object.assign(ctx.trialBuild, { failed: false, courtyard, wall, solid, hall, gate: { c: g, dir: outDir }, lever: { c: lever },
    altar: { c: cell(au, av), cells: altar }, lair: { c: lairCell, yaw }, rocks, keep: [...ctx.trialKeep] });
}

// nothing built onto, off or over the wall and the rocks: the gate is the only way between the
// courtyard and the hall
export function chaseRoute(ctx) {
  const movesFrom = ctx.movesFrom, solid = () => ctx.trialBuild?.solid, on = f => !!solid()?.has(f.c);
  ctx.movesFrom = (f, ...rest) => movesFrom(f, ...rest).filter(m => !on(f) && !on(m.to) && !m.cells?.some(c => solid()?.has(c)));
}

// the goal of the way in: the relic on its altar
export const chaseGoal = ctx => ctx.trialBuild.failed ? null : ctx.layerFloor(ctx.trialBuild.altar.c, 0);
