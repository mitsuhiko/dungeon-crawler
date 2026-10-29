// Flip's fight as rules, and the world he flips (game/flip.js runs the fight, game/flipworld.js
// turns the world; his profile is core/enemies.js FLIP). docs/bosses.md tells the whole fight.
//
// His arena (cubegen/fliparena.js) is a box: a floor and four walls of solid cells, open at the
// top, with a floating island in the middle. It is kept as cells (`map.flip.solid`, 16 x 16 x 16
// of them, a cell a unit each way) so that any of its sides can be the floor: an orientation
// (`O`, a rotation of the box about its middle, as a 3 x 3 matrix of whole numbers) says which
// way it is turned, and orientedMap builds the floors of the box turned that way (the physics
// stays the game's own: floors in columns, stacked where the cells are).
//
// Phase 1 (full health to half): he throws balls of light, now and then summons Sky wollas and
// flips the world: once a flip is due he starts nothing else, and at its hit frame the box turns a
// quarter (or, between the floor and the open top, half) round. Everything in it turns with it;
// the enemies drop onto clear spots of the new floor and his tractor beam carries the player to
// one, unhurt (turned upside down: onto the floating island). The holes in the side down are shut
// meanwhile and open a moment after the player is down.
// At half his health he stops, spins up (nothing hurts him meanwhile) and turns the world upside
// down. Phase 2: he opens black holes as well: the scene darkens, the hole pulls the player in,
// and whoever it swallows comes out of another one after the world has flipped; and when he flips
// the world a black hole takes the player through the turn instead of the beam.
export const FLIP_FIGHT = Object.freeze({
  split: 0.5,             // the share of his health phase 2 starts at
  splitTime: 2.4,         // s he spins up at half his health, nothing hurting him
  flip: { first: 7, every: [13, 18] },   // s into the fight before his first flip, then from one to the next
  turn: 1.5,              // s the box takes to turn a quarter round
  turnHalf: 2.1,          // ... and half round
  holes: { delay: 1.1, crack: 0.9 },     // s after the player landed before the holes crack, then open
  beam: 7,                // cells/s his tractor beam carries the player to the new floor (0.6 to 1.8 s)
  grace: 1,               // s after the beam (or a black hole) set the player down before anyone may strike
  stray: 1.2,             // s one stands off the fight's floors (a ledge out of reach) before his beam pulls them back
  balcony: 0.4,           // how often a turn takes the fight (him and the player) up onto the balcony of the side down
  hole: { first: 3, every: [9, 13], life: 6.5, open: 0.6, range: 5.5, pull: [1.3, 3.1], hold: 0.3,
    swallow: 0.42, damage: 0.55, limbo: 1.1, emerge: 1.2 },   // phase 2's black holes (game/flip.js)
  minions: [3, 3],        // the most Sky wollas at once, phase 1 / 2: a summon fills up to that
  summonCool: [11, 10],   // s from one summon to the next
  firstSummon: 5,         // s into the fight before his first summon
  leave: 0.5,             // s a minion he takes along lingers, gone, before it is let go
});
const ALL = ['throw', 'volley', 'flip', 'summon', 'hole'];

// the health phase 2 starts at (no blow takes him below it before)
export const splitHp = maxHp => Math.ceil(maxHp * FLIP_FIGHT.split);
// how many Sky wollas a summon brings in phase `phase` with `alive` of them about
export const summonCount = (phase, alive) => Math.max(0, FLIP_FIGHT.minions[phase - 1] - alive);
// The attacks he may not start now (names): only the flip when it is due (and the world can turn),
// else no flip; a summon only when it is due; the black hole only in phase 2 when it is due; the
// volley only in phase 2, the single throw only in phase 1.
export function barred({ phase, flipDue, summonDue, holeDue }) {
  if (flipDue) return new Set(ALL.filter(n => n !== 'flip'));
  return new Set(ALL.filter(n => n === 'flip' || (n === 'summon' && !summonDue) || (n === 'hole' && (phase < 2 || !holeDue))
    || (n === 'volley' && phase < 2) || (n === 'throw' && phase >= 2)));
}

// --- the box turned -----------------------------------------------------------------------------

export const S = 16, MID = S / 2;   // the box: S cells each way (a cell is a unit), turned about its middle
export const vi = (x, y, z) => (y * S + z) * S + x;
export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
// row-major 3 x 3 matrices of whole numbers
export const mul = (A, B) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
export const apply = (O, [x, y, z]) => [O[0] * x + O[1] * y + O[2] * z, O[3] * x + O[4] * y + O[5] * z, O[6] * x + O[7] * y + O[8] * z];
export const transpose = O => [O[0], O[3], O[6], O[1], O[4], O[7], O[2], O[5], O[8]];
export const orientKey = O => O.join(',');
// a point of the box (in its own frame) where it is with the box turned by O
export function turnPoint(O, x, y, z) {
  const [a, b, c] = apply(O, [x - MID, y - MID, z - MID]);
  return { x: a + MID, y: b + MID, z: c + MID };
}
// a quarter turn about the x axis (by q quarters: 1, -1, 2), or about the z axis
export function rotation(axis, q) {
  const a = q * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return axis === 'x' ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
}
// all 24 ways to turn the box, in a fixed order (sent to friends as an index, net/protocol.js)
export const ORIENTS = (() => {
  const out = [IDENTITY], keys = new Set([orientKey(IDENTITY)]);
  for (let i = 0; i < out.length; i++) for (const R of [rotation('x', 1), rotation('z', 1), [0, 0, 1, 0, 1, 0, -1, 0, 0]]) {
    const O = mul(R, out[i]);
    if (!keys.has(orientKey(O))) { keys.add(orientKey(O)); out.push(O); }
  }
  return out;
})();
export const orientIndex = O => ORIENTS.findIndex(o => orientKey(o) === orientKey(O));

// The box's sides: the floor (`bottom`), the open top and the four walls, by their outward
// normals in the box's own frame; `group`: what its cells are marked in map.flip.solid (the top
// has none; 6 is the island)
export const FACES = Object.freeze({ bottom: [0, -1, 0], top: [0, 1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] });
export const GROUP = Object.freeze({ bottom: 1, px: 2, nx: 3, pz: 4, nz: 5, island: 6 });
export const SIDES = ['px', 'nx', 'pz', 'nz'];
// the side each group's cells belong to (the island's underside is the floor upside down)
export const GROUP_FACE = Object.freeze({ 1: 'bottom', 2: 'px', 3: 'nx', 4: 'pz', 5: 'nz', 6: 'top' });
// the six ways along the box's axes (a stair cell rises one of them: map.flip.stairs, 1 + index)
export const DIR6 = Object.freeze([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
export const dirIndex = v => DIR6.findIndex(d => same(d, v));
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
// the side that is down with the box turned by O
export function downFace(O) {
  const n = apply(transpose(O), [0, -1, 0]);
  return Object.keys(FACES).find(k => same(FACES[k], n));
}
const OPPOSITE = { bottom: 'top', top: 'bottom', px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' };
export const opposite = face => OPPOSITE[face];
// The turn that brings side `face` down from O: { R (the rotation, in the frame of the box as it
// stands), axis ('x' | 'z'), q (quarters), O (the new orientation) }. A side next to the one
// down turns a quarter; the opposite one half (about x or z: `r` < 0.5 picks x).
export function turnTo(O, face, r = 0) {
  const t = apply(O, FACES[face]);
  let axis, q;
  if (t[1] === 1) { axis = r < 0.5 ? 'x' : 'z'; q = 2; }
  else if (t[1] === -1) return null;   // down already
  else if (t[0]) { axis = 'z'; q = t[0] > 0 ? -1 : 1; }
  else { axis = 'x'; q = t[2] > 0 ? 1 : -1; }
  const R = rotation(axis, q);
  return { R, axis, q, O: mul(R, O) };
}
// The side to bring down next from `down` (weights: to the floor, to a wall next to the one down,
// to the open top or from it; never the opposite wall): r in 0..1. In phase 2 the island more often.
export function nextDown(down, phase, r) {
  const options = Object.keys(FACES).filter(f => f !== down && !(SIDES.includes(down) && f === OPPOSITE[down]))
    .map(f => [f, f === 'bottom' ? 1.6 : f === 'top' ? (down === 'bottom' || SIDES.includes(down) ? (phase >= 2 ? 1.2 : 0.7) : 0) : 1]);
  let w = r * options.reduce((n, [, k]) => n + k, 0);
  for (const [f, k] of options) if ((w -= k) < 0) return f;
  return options[options.length - 1][0];
}

// --- the floors of the box, turned --------------------------------------------------------------

const FLAT = top => Array(4).fill(top * 0.5);
const cell = (x, z) => z * S + x;
// A floor of a column: solid from `bottom` to `top` (levels), flat; the fields the physics reads
function slab(x, z, top, bottom) {
  return { id: -1, c: cell(x, z), x, z, top, bottom, layer: 0, fluid: 0, surf: 0, prot: 0, merged: true, ramp: false,
    link: [null, null, null, null], cs: FLAT(top), split: 0, arenaCell: x > 0 && z > 0 && x < S - 1 && z < S - 1, encounter: false };
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the corners on each side of a cell, in the same order along it (core/constants.js EDGE_CORNERS)
const EDGE = [[1, 3], [0, 2], [2, 3], [0, 1]], OPP = [1, 0, 3, 2];

// The floors of the box turned by O (flip: map.flip; down: the side down, downFace(O)):
// { cols, floors }. Every run of solid cells up a column is a floor, from its lowest cell to its
// highest (two levels a cell). A stair cell whose treads face up (map.flip.stairs, stairUp: drawn
// as steps, render/flipgeo.js) on top of a run makes its floor a slope a cell up over the cell,
// like the game's own stairs; turned any other way it is a whole cell. A floor on a balcony is
// `shelf` (map.flip.shelf). The cells `removed` (a Set: the walls broken open, game/flipworld.js)
// are not there. The side overhead does not count (it
// is not drawn either, render/flipview.js: it would hide everything from the camera). The holes
// in the side that is down are thin floors over the gap (`hole`: its id) until they open
// (`open`, game/flipworld.js). Unturned, the floor is at `flip.level` (the doorways' level, which
// need not be a whole cell). Floors whose edges meet (a slope's too) in neighbouring columns are
// linked; the most of them one can walk between are the fight's (`encounter`).
export function orientedFloors(flip, O, removed = null) {
  const down = downFace(O), up = orientKey(O) === orientKey(IDENTITY), over = GROUP[OPPOSITE[down]];
  const solid = new Uint8Array(S * S * S), stair = new Int8Array(S * S * S).fill(-1), shelf = new Uint8Array(S * S * S);
  for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    const i = vi(x, y, z), g = flip.solid[i];
    if (!g || g === over || removed?.has(i)) continue;
    const p = turnPoint(O, x + 0.5, y + 0.5, z + 0.5), j = vi(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    solid[j] = g;
    if (flip.shelf?.[i]) shelf[j] = 1;
    // a stair with its treads up: which way it rises, turned (level then)
    if (flip.stairs?.[i] && apply(O, DIR6[flip.stairUp[i] - 1])[1] === 1) stair[j] = dirIndex(apply(O, DIR6[flip.stairs[i] - 1]));
  }
  const cols = Array.from({ length: S * S }, () => []);
  for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
    let y0 = -1;
    for (let y = 0; y <= S; y++) {
      const on = y < S && !!solid[vi(x, y, z)];
      if (on && y0 < 0) y0 = y;
      else if (!on && y0 >= 0) {
        // unturned, the floor of the box stands at the doorways' level
        const top = up && y0 === 0 && y === flip.bottom ? flip.level : y * 2, f = slab(x, z, top, y0 * 2), k = stair[vi(x, y - 1, z)];
        if (k >= 0) {   // a stair: up a cell along its way
          const [dx, , dz] = DIR6[k];
          f.cs = [0, 1, 2, 3].map(c => { const ox = c & 1, oz = c >> 1; return y - 1 + (dx ? (dx > 0 ? ox : 1 - ox) : (dz > 0 ? oz : 1 - oz)); });
          f.stair = true;
        }
        if (shelf[vi(x, y - 1, z)]) f.shelf = true;
        cols[cell(x, z)].push(f);
        y0 = -1;
      }
    }
  }
  // the holes in the side that is down: shut (for now) over the gap
  for (const h of flip.holes) if (h.face === down) {
    const seen = new Set();
    for (const i of h.cells) {
      const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S)), p = turnPoint(O, x + 0.5, y + 0.5, z + 0.5);
      const c = cell(Math.floor(p.x), Math.floor(p.z));
      if (seen.has(c)) continue;
      seen.add(c);
      const f = slab(Math.floor(p.x), Math.floor(p.z), h.depth * 2, h.depth * 2 - 1);
      f.hole = h.id;
      cols[c].push(f);
    }
  }
  const floors = [];
  for (const col of cols) {
    col.sort((a, b) => a.top - b.top);
    for (const f of col) { f.id = floors.length; floors.push(f); }
  }
  // headroom over a floor: up to the next floor's underside in its column
  const room = f => { const col = cols[f.c], i = col.indexOf(f); return i < col.length - 1 ? col[i + 1].bottom - f.top : Infinity; };
  const meet = (f, g, d) => EDGE[d].every((c, i) => Math.abs(f.cs[c] - g.cs[EDGE[OPP[d]][i]]) < 0.01);
  for (const f of floors) f.link = DIRS.map(([dx, dz], d) => {
    const x = f.x + dx, z = f.z + dz;
    if (x < 0 || z < 0 || x >= S || z >= S) return null;
    return cols[cell(x, z)].find(g => meet(f, g, d) && room(g) >= 2) ?? null;
  });
  // the fight's floors: the most of them one can walk between (the side down; upside down, the
  // island), not the tops of the walls or of the blocks
  let best = new Set();
  const done = new Set();
  for (const start of floors) {
    if (done.has(start) || room(start) < 2 || start.top >= (S - 3) * 2) continue;
    const seen = new Set([start]), queue = [start];
    for (let i = 0; i < queue.length; i++) for (const g of queue[i].link) if (g && !seen.has(g)) { seen.add(g); queue.push(g); }
    for (const f of seen) done.add(f);
    if (seen.size > best.size) best = seen;
  }
  for (const f of best) f.encounter = true;
  return { cols, floors, down };
}

// The walls broken open with the box turned by O (game/flipworld.js, render/flipview.js): every
// wall round the side down, all of it but a parapet two cells over the floor (`baseY`, units)
// and a frame a cell wide round its edges; never a balcony or its staircase, nor the wall round
// where the side down's balcony juts out of it (two cells round it). -> { faces, removed (a Set
// of cells) }
export function brokenWalls(flip, O, baseY) {
  const down = downFace(O), mine = flip.shelves?.find(sh => sh.face === down);
  const faces = ['bottom', ...SIDES].filter(f => apply(O, FACES[f])[1] === 0);
  const near = new Set();
  if (mine && faces.includes(mine.host)) for (const i of mine.cells) {
    const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S));
    for (let c = -2; c <= 2; c++) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++)
      if (x + a >= 0 && x + a < S && y + b >= 0 && y + b < S && z + c >= 0 && z + c < S) near.add(vi(x + a, y + b, z + c));
  }
  const groups = new Set(faces.map(f => GROUP[f])), removed = new Set();
  if (faces.length) for (let i = 0; i < flip.solid.length; i++) {
    if (!groups.has(flip.solid[i]) || flip.shelf?.[i] || near.has(i)) continue;
    const x = i % S, z = Math.floor(i / S) % S, y = Math.floor(i / (S * S)), p = turnPoint(O, x + 0.5, y + 0.5, z + 0.5);
    const n = apply(O, FACES[GROUP_FACE[flip.solid[i]]]), along = n[0] ? p.z : p.x;
    if (p.y < baseY + 2 || p.y > S - 1 || along < 1 || along > S - 1) continue;   // (the parapet, the frame)
    removed.add(i);
  }
  return { faces, removed };
}
