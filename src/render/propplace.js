// Deterministic ambient placement, independent of the terrain RNG. Destination arrangements
// are emitted by the worker; ambient blockers stay away from routes and reservations.
import { N, LH, BASE, DIRS, EDGE_CORNERS, FLUID_NAME, CHAR_H } from '../core/constants.js';
import { mulberry32, hash32, idx, inb, makeNoise } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { restY } from './surface.js';
import { props, signatureProp, CLUTTER } from '../core/propcatalog.js';

// the prop sets ambient props come from in a theme
const ambientSets = theme => [theme.props, 'any', ...(theme.cave ? ['relics'] : [])];

// The props a trial room's parts borrow (render/trials.js): its braziers (the cold's to warm
// at too) and the crates of a crate puzzle; the rest of its parts are the trials' library
// (assets/trials.glb, set `trial`), a rune room's clue tablet too.
export const TRIAL_PROPS = { brazier: 'ruins_brazier_a', warm: 'ruins_brazier_a', crate: 'mines_crate_a' };
function trialSets(m, of) {
  if (!m.trial && !m.clues?.length) return;
  of({ name: 'trial_button' });
  for (const p of m.trial?.parts || []) if (TRIAL_PROPS[p.type]) of({ name: TRIAL_PROPS[p.type] });
}

// the prop sets a cube shows (render/props.js loads them before the cube is entered)
export function propSetsOf(m, theme) {
  const sets = new Set(), of = q => { const p = props.byName.get(q.name); if (p) sets.add(p.set); };
  trialSets(m, of);
  if (m.authoredProps) { m.authoredProps.forEach(of); return [...sets]; }
  if (theme.props) ambientSets(theme).forEach(s => sets.add(s));
  [...(m.sitePlacements || []), ...(m.arenaPlacements || []), ...(m.flip?.clutter || [])].forEach(of);   // (Flip's box's clutter)
  return [...sets];
}

function picker(theme, R) {
  const lists = new Map();
  return (attach, allow = () => true) => {
    if (!lists.has(attach)) lists.set(attach, ambientSets(theme)
      .flatMap(set => props.sets.get(set + '/' + attach) || [])
      .filter(p => !signatureProp(p) && (theme.cave || !p.base.startsWith('stala'))));
    const c = lists.get(attach).filter(allow);
    const weight = p => (p.priority === 1 ? 3 : 1) * (p.blocking ? 0.6 : 1)
      * (p.set === 'any' ? 0.5 : p.set === 'relics' ? 0.12 : 1);
    let r = R() * c.reduce((sum, p) => sum + weight(p), 0);
    return c.find(p => (r -= weight(p)) < 0) || null;
  };
}

export function placeProps(m, theme) {
  const out = [...(m.sitePlacements || []), ...(m.arenaPlacements || [])], blockers = Array.from({ length: N * N }, () => []);
  if (m.authoredProps) return { out: m.authoredProps, blockers };
  if (!theme.props) return { out, blockers };
  const R = mulberry32(hash32(m.seed ^ 0x9a0b5)), pick = picker(theme, R);
  const walkCols = new Set((m.moves || []).flatMap(mv => [mv.from.c, mv.to.c, ...mv.cells]));
  for (const r of m.runs || []) for (const c of [...r.cells, r.from.c, r.to.c]) walkCols.add(c);
  const reservations = new Set([...(m.siteReservations || []).map(q => q.c + ':' + q.layer),
    ...m.floors.filter(f => f.hordeReserved).map(f => f.c + ':' + f.layer)]);
  const reserved = f => reservations.has(f.c + ':' + f.layer);
  // Enemy navigation treats a blocked column conservatively across all layers.
  const hordeColumns = new Set(m.floors.filter(f => f.hordeReserved).map(f => f.c));
  const nearHorde = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && hordeColumns.has(idx(f.x + dx, f.z + dz)));
  const nearSite = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && reservations.has(idx(f.x + dx, f.z + dz) + ':' + f.layer));
  const nearRoute = f => [[0, 0], ...DIRS].some(([dx, dz]) => inb(f.x + dx, f.z + dz) && walkCols.has(idx(f.x + dx, f.z + dz)));
  const nearPortal = f => m.portals.some(p => Math.abs(p.x - f.x) <= 2 && Math.abs(p.z - f.z) <= 2);
  const fits = (p, y, s, lo, hi) => y + p.minY * s >= lo && y + p.maxY * s + 0.1 <= hi;
  const add = (p, x, y, z, yaw, s, normal) => out.push({ name: p.name, x, y, z, yaw, s,
    tint: p.set === 'any' ? theme.side[1][1] : null, ...(normal ? { normal } : {}) });
  // a mostly empty set piece (cubegen/setpieces.js): a few things here and there, nothing in the way
  const sparse = m.sparse ? 0.25 : 1;
  const shoreOf = f => DIRS.some(([dx, dz]) => inb(f.x + dx, f.z + dz)
    && m.cols[idx(f.x + dx, f.z + dz)].some(g => g.fluid && Math.abs(g.surf - f.top) <= 3));

  for (const f of m.floors) {
    if (f.arenaCell) continue;   // guardian arena: dressed with its terrain (cubegen/arenaprops.js)
    const col = m.cols[f.c], above = col[col.indexOf(f) + 1];
    const pieces = m.pieces[f.c], top = Math.max(...f.cs), ceiling = above ? above.bottom * LH : Infinity;
    const slope = top - Math.min(...f.cs), s = 0.85 + R() * 0.3;
    const dry = !f.fluid && !f.covered && !pieces.length;
    const focal = reserved(f);

    // Ordinary objects retain the sparse one-prop draw. Shore items are never inland.
    if (dry && !f.prot && !focal && R() < (theme.propDensity ?? 0.32) * CLUTTER * sparse) {
      const blockOK = !m.sparse && !nearRoute(f) && !nearPortal(f) && !nearSite(f) && !nearHorde(f) && slope < 0.25;
      const p = pick('ground', p => !p.cover && (!p.shore || shoreOf(f)) && (blockOK || !p.blocking));
      if (p) {
        const room = Math.max(0, 0.9 - 2 * p.radius * s), fx = 0.5 + (R() - 0.5) * room, fz = 0.5 + (R() - 0.5) * room;
        const y = floorY(f, fx, fz) - 0.02;
        if (y + p.maxY * s + 0.2 < ceiling) {
          add(p, f.x + fx, y, f.z + fz, R() * Math.PI * 2, s);
          if (p.blocking) blockers[f.c].push({ x: f.x + fx, z: f.z + fz, r: p.radius * s * 0.8, bottom: y, top: y + p.height * s });
        }
      }
    }

    // Ground cover can dress routes and slopes, but not structure decks or focal footprints.
    if (dry && (!focal || f.hordeReserved) && R() < (f.hordeReserved ? .12 : .55) * CLUTTER * (m.sparse ? 0.4 : 1))
      for (let n = f.hordeReserved ? 1 : 1 + Math.floor(R() * 2); n > 0; n--) {
      const p = pick('ground', p => p.cover && !p.blocking);
      if (!p) break;
      const cs = 0.7 + R() * 0.3, room = Math.max(0, 0.9 - 2 * p.radius * cs);
      const fx = 0.5 + (R() - 0.5) * room, fz = 0.5 + (R() - 0.5) * room;
      const y = floorY(f, fx, fz) + 0.008, e = 0.01;
      const dx = (floorY(f, fx + e, fz) - floorY(f, fx - e, fz)) / (2 * e);
      const dz = (floorY(f, fx, fz + e) - floorY(f, fx, fz - e)) / (2 * e);
      if (top + p.maxY * cs + 0.2 < ceiling) add(p, f.x + fx, y, f.z + fz, R() * Math.PI * 2, cs, [-dx, 1, -dz]);
    }

    if (f.fluid && !pieces.length && !focal && R() < 0.12 * CLUTTER) {
      const p = pick('water', p => !p.blocking && p.fluid === FLUID_NAME[f.fluid]);
      if (p && f.surf * LH + p.maxY * s + 0.2 < ceiling)
        add(p, f.x + 0.5, restY(f.surf * LH), f.z + 0.5, R() * Math.PI * 2, s);   // (on its surface: render/surface.js)
    }

    // No ceiling props: undersides of slabs are never visible from the camera.
    // Hanging decoration is limited to lip props draped over visible ledges.

    if (f.fluid || focal || nearPortal(f)) continue;
    for (let d = 0; d < 4; d++) {
      const nx = f.x + DIRS[d][0], nz = f.z + DIRS[d][1];
      if (!inb(nx, nz) || f.link[d]) continue;
      const [a, b] = EDGE_CORNERS[d], edgeTop = Math.min(f.cs[a], f.cs[b]);
      const other = m.cols[idx(nx, nz)];
      if (other.some(g => g.bottom * LH < edgeTop + 0.1
        && (g.fluid ? g.surf * LH : Math.max(...g.cs)) >= edgeTop - 0.1)) continue;
      const low = Math.max(-BASE, ...other.filter(g => g.top * LH < edgeTop - 0.1)
        .map(g => g.fluid ? g.surf * LH : Math.max(...g.cs)));
      const t = 0.3 + R() * 0.4, [ex, ez] = [[1, t], [0, t], [t, 1], [t, 0]][d];
      const yaw = Math.atan2(-DIRS[d][0], -DIRS[d][1]);
      if (R() < 0.15 * CLUTTER) {
        const p = pick('lip', p => !p.blocking && p.drop * s + 0.2 < edgeTop - low);
        if (p && edgeTop + p.maxY * s + 0.1 < ceiling)
          add(p, f.x + ex, edgeTop, f.z + ez, yaw, s);
      }
      const wallLow = Math.max(low, f.bottom * LH);
      if (edgeTop - wallLow < 1.2 || R() > 0.12 * CLUTTER) continue;
      const p = pick('wall', p => !p.blocking);
      if (p) {
        const y = wallLow + (edgeTop - wallLow) * 0.5;
        if (fits(p, y, s, wallLow, edgeTop)) add(p, f.x + ex, y, f.z + ez, yaw, s);
      }
    }
  }
  if (theme.grove && !m.sparse) grove(m, theme, add, out, blockers, { walkCols, reserved, nearSite, nearPortal, nearHorde });
  if (theme.waylights && !m.sparse) waylights(m, theme, add, out, blockers, { walkCols, reserved, nearSite, nearPortal, nearHorde });
  return { out, blockers };
}

// A forest's own passes (themes/index.js `grove`), on a random stream of their own (the other
// themes' props stay as they were):
//   trees: thickets and clearings, where the cube's noise says (density: the most a floor gets
//     one), off the portals, the sites and the horde, on gentle slopes too; beside the way (half
//     as often) they stand back from it, so the way runs between trunks. Only a tree's trunk is
//     in the way, so one may walk between them
//   lanterns: the share of the trees with branches (their props' `anchors` away from the trunk)
//     that have a lantern hanging from one, high enough to walk under (`hanging_lantern`)
//   strings: the most strings of lanterns (`lantern_string`, attach 'line') a cube gets, tied
//     between the anchors of two trees 2 to 5 apart and sagging between them, never into the
//     ground or anything over it and always a head's room over the ground; over the way first
function grove(m, theme, add, out, blockers, { walkCols, reserved, nearSite, nearPortal, nearHorde }) {
  const G = theme.grove, R = mulberry32(hash32(m.seed ^ 0x6a07e)), noise = makeNoise(R);
  const trees = G.trees.map(b => props.byName.get(`${theme.props}_${b}_a`) && b).filter(Boolean);
  const free = f => !f.fluid && !f.covered && !m.pieces[f.c].length && !f.prot && !reserved(f) && !blockers[f.c].length
    && !nearPortal(f) && !nearSite(f) && !nearHorde(f);
  const above = f => { const col = m.cols[f.c], a = col[col.indexOf(f) + 1]; return a ? a.bottom * LH : Infinity; };
  const way = f => DIRS.filter(([dx, dz]) => inb(f.x + dx, f.z + dz) && walkCols.has(idx(f.x + dx, f.z + dz)));
  const placed = [];   // the trees: [{ x, y, z, anchors: [[x, y, z]] in the cube }]
  for (const f of m.floors) {
    const slope = Math.max(...f.cs) - Math.min(...f.cs);
    if (f.arenaCell || !free(f) || walkCols.has(f.c) || slope >= 0.6) continue;
    const beside = way(f), n = noise(f.x * 0.22 + 5, f.z * 0.22 + 9);
    const chance = G.density * Math.min(1, Math.max(0, (n - 0.38) / 0.24)) * (beside.length ? 0.5 : 1);
    if (trees.length && R() < chance) {
      const p = props.byName.get(`${theme.props}_${trees[Math.floor(R() * trees.length)]}_${R() < 0.5 ? 'a' : 'b'}`);
      const s = G.scale[0] + R() * (G.scale[1] - G.scale[0]);
      // (beside the way: back from it; elsewhere anywhere in the floor)
      const back = beside.reduce(([ax, az], [dx, dz]) => [ax - dx, az - dz], [0, 0]), bl = Math.hypot(...back);
      const [fx, fz] = beside.length ? (bl ? [0.5 + back[0] / bl * 0.3, 0.5 + back[1] / bl * 0.3] : [0.5, 0.5])
        : [0.5 + (R() - 0.5) * 0.5, 0.5 + (R() - 0.5) * 0.5];
      const y = floorY(f, fx, fz) - 0.02;
      if (y + p.maxY * s + 0.2 >= above(f) || beside.length && !bl) continue;
      const yaw = R() * Math.PI * 2, c = Math.cos(yaw), sn = Math.sin(yaw);
      add(p, f.x + fx, y, f.z + fz, yaw, s);
      blockers[f.c].push({ x: f.x + fx, z: f.z + fz, r: 0.16 * s, bottom: y, top: y + p.height * s });
      // its anchors in the cube (turned like the tree, three.js about Y), and a lantern from a branch
      const anchors = (p.anchors || []).map(([ax, ay, az]) => [f.x + fx + s * (ax * c + az * sn), y + s * ay, f.z + fz + s * (-ax * sn + az * c), Math.hypot(ax, az)]);
      placed.push({ x: f.x + fx, y, z: f.z + fz, anchors, used: 0 });
      const branches = anchors.filter(a => a[3] > 0.12), lantern = props.byName.get(`${theme.props}_hanging_lantern_${R() < 0.5 ? 'a' : 'b'}`);
      if (lantern && branches.length && R() < (G.lanterns ?? 0)) {
        const [ax, ay, az] = branches[Math.floor(R() * branches.length)];
        // (never off the cube: a tree on its rim may reach out over the next one)
        if (ay + lantern.minY - y >= CHAR_H + 0.15 && ax >= 0 && az >= 0 && ax < N && az < N) add(lantern, ax, ay, az, R() * Math.PI * 2, 1);
      }
    }
  }
  if (G.strings) strings(m, theme, G, R, placed, out, walkCols);
}

// Lights by the way (a theme's `waylights`: { props: [names, a variant drawn], share, back, foot }):
// on the floors beside the way (the share of them), a lamp on the far side of the floor (`back`
// from its middle), turned so that what it holds out (a lantern on its arm) hangs over the way. In
// the way only by its foot (`foot`: a post's, a candelabra's), so the floor it stands on stays
// walkable. On a random stream of their own.
function waylights(m, theme, add, out, blockers, { walkCols, reserved, nearSite, nearPortal, nearHorde }) {
  const W = theme.waylights, R = mulberry32(hash32(m.seed ^ 0x3a7119));
  const list = W.props.flatMap(n => ['a', 'b'].map(v => props.byName.get(`${n}_${v}`)).filter(Boolean));
  const back = W.back ?? 0.36, foot = W.foot ?? 0.06;
  if (!list.length) return;
  for (const f of m.floors) {
    if (f.arenaCell || f.fluid || f.covered || m.pieces[f.c].length || f.prot || reserved(f) || blockers[f.c].length
      || walkCols.has(f.c) || nearPortal(f) || nearSite(f) || nearHorde(f) || Math.max(...f.cs) - Math.min(...f.cs) >= 0.25) continue;
    const beside = DIRS.filter(([dx, dz]) => inb(f.x + dx, f.z + dz) && walkCols.has(idx(f.x + dx, f.z + dz)));
    if (!beside.length || R() >= W.share) continue;
    const p = list[Math.floor(R() * list.length)], [dx, dz] = beside[0];
    const x = f.x + 0.5 - dx * back, z = f.z + 0.5 - dz * back, y = floorY(f, 0.5 - dx * back, 0.5 - dz * back) - 0.02;
    const col = m.cols[f.c], above = col[col.indexOf(f) + 1];
    if (above && y + p.maxY + 0.2 >= above.bottom * LH) continue;
    add(p, x, y, z, Math.atan2(-dz, dx), 1);
    out[out.length - 1].way = true;
    if (p.blocking) blockers[f.c].push({ x, z, r: foot, bottom: y, top: y + p.height });
  }
}

// the ground (or water) under a point of a string and whether the string runs into something there
function under(m, x, y, z) {
  if (!inb(Math.floor(x), Math.floor(z))) return { ground: Infinity, hit: true };
  let ground = -Infinity, hit = false;
  for (const f of m.cols[idx(Math.floor(x), Math.floor(z))]) {
    const top = f.fluid ? f.surf * LH : Math.max(...f.cs);
    if (top <= y) ground = Math.max(ground, top);
    else if (f.bottom * LH < y + 0.1) hit = true;   // (through a floor, or a slab over the ground)
  }
  return { ground, hit };
}

// strings of lanterns between the cube's trees (grove, above): each segment of the line prop
// sheared along the sagging curve (its X axis the step, Y up, so the lanterns hang straight;
// blender/themes.py string_segments), as an explicit matrix
function strings(m, theme, G, R, trees, out, walkCols) {
  const line = props.byName.get(`${theme.props}_lantern_string_a`);
  if (!line) return;
  const options = [];
  for (let i = 0; i < trees.length; i++) for (let j = i + 1; j < trees.length; j++) {
    const a = trees[i], b = trees[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 2 || d > 5) continue;
    // the pair of anchors most level with each other, both high enough
    let best = null;
    for (const p of a.anchors) for (const q of b.anchors) {
      if (p[1] - a.y < 1.9 || q[1] - b.y < 1.9) continue;
      const dy = Math.abs(p[1] - q[1]);
      if (dy <= 0.9 && (!best || dy < best.dy)) best = { p, q, dy };
    }
    if (!best) continue;
    const { p, q } = best, L = Math.hypot(q[0] - p[0], q[2] - p[2]), sag = 0.1 + 0.08 * L;
    const at = t => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t];
    let ok = true, over = 0;
    for (let k = 0, n = Math.ceil(L * 4); k <= n && ok; k++) {   // (its ends too: a branch may reach out over higher ground)
      const [x, y, z] = at(k / n), u = under(m, x, y, z);
      ok = !u.hit && y - 0.3 - u.ground >= CHAR_H + 0.3;
      if (walkCols.has(idx(Math.floor(x), Math.floor(z)))) over = 1;
    }
    if (ok) options.push({ a, b, at, L, score: over * 2 + R() });
  }
  options.sort((x, y) => y.score - x.score);
  let n = 0;
  for (const o of options) {
    if (n >= G.strings) break;
    if (o.a.used >= 2 || o.b.used >= 2) continue;
    o.a.used++; o.b.used++; n++;
    const steps = Math.max(2, Math.round(o.L / 0.85)), v = R() < 0.5 ? 'a' : 'b';
    for (let k = 0; k < steps; k++) {
      const a = o.at(k / steps), b = o.at((k + 1) / steps), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], h = Math.hypot(d[0], d[2]) || 1;
      out.push({ name: `${theme.props}_lantern_string_${v}`, x: a[0], y: a[1] - 0.2, z: a[2], yaw: 0, s: 1,
        matrix: [d[0], d[1], d[2], 0, 0, 1, 0, 0, -d[2] / h, 0, d[0] / h, 0, a[0], a[1], a[2], 1] });
    }
  }
}
