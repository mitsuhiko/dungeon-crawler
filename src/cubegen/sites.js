// Reserve destinations before slabs/routing. Site prestige is fixed by the world spec;
// only the arrangement changes on a terrain retry. All coordinates are attachment-space.
import { N, LH, HEAD, MAX_L, CHAR_H, CHAR_R } from '../core/constants.js';
import { idx, hash32, mulberry32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { propMetadata } from '../core/propcatalog.js';
import { PRESTIGE } from '../world/sites.js';
import { search, take } from './route.js';
import { reachTo } from './reach.js';
import { PINNACLE_TOP } from './heights.js';

export const RECIPES = {
  mines: { storage: ['sacks', 'plank_stack', 'lantern'], gallery: ['sacks', 'pickaxe_in_rock', 'lantern'],
    excavation: ['ore_pile', 'tipped_cart', 'crystal_cluster'] },
  ruins: { burial: ['oil_lamps', 'sarcophagus', 'urn'], hall: ['column_base', 'stone_tablet', 'brazier'],
    courtyard: ['altar', 'obelisk_broken', 'urn'] },
  roots: ['moss_rock', 'mushroom_cluster', 'cave_fern'], frozen: ['frozen_adventurer', 'ice_crystal', 'ice_pillar'],
  swamp: ['fungal_tree', 'puffballs', 'glow_mushroom'], nests: ['glow_eggs', 'egg_sac', 'webbed_crate'],
  volcanic: ['fire_crystal', 'scorched_bones', 'obsidian_shard'], abyss: ['broken_altar', 'void_crystal', 'ritual_circle'],
  meadow: ['fairy_ring', 'fern', 'berry_bush'], peaks: ['expedition_flag', 'alpine_flowers', 'ice_crystal'],
  badlands: ['rib_cage', 'agave', 'broken_wagon_wheel'],
  clouds: ['rainbow_crystal', 'sky_nest', 'storm_jar'], lagoon: ['buried_chest', 'tiki_torch', 'driftwood'],
  karst: ['rice_sheaves', 'stone_lantern', 'banana_plant'], highlands: ['butter_lamps', 'mani_stones', 'chorten_small'],
  darkforest: ['glow_mushrooms', 'lantern_post', 'mossy_stump'], slime: ['slime_mushrooms', 'goo_mound', 'bubble_vent'],
  saltflats: ['pink_halite', 'salt_cones', 'salt_bricks'], canyon: ['cairn', 'clay_pots', 'luminaria'], grotto: ['giant_clam', 'jelly_lantern', 'sunken_anchor'],
  hive: ['wax_candles', 'honey_pot', 'comb_mound'], ossuary: ['candelabra', 'funeral_urn', 'sarcophagus'],
  forge: ['crucible', 'ingot_stack', 'anvil_block'], cenote: ['copal_bowl', 'orchid_rock', 'jade_idol'],
};
const rotate = (u, v, yaw) => [[u, v], [-v, u], [-u, -v], [v, -u]][yaw];
const at = (site, u, v) => { const [dx, dz] = rotate(u, v, site.turn); return idx(site.cx + dx, site.cz + dz); };
// site-local (u, v), cell centres at whole numbers -> cube (x, z)
const toCube = (site, u, v) => { const [dx, dz] = rotate(u, v, site.turn); return [site.cx + dx + 0.5, site.cz + dz + 0.5]; };
const heightAt = (site, u, v) => {
  const { setting, rank, rx, rz, level } = site;
  if (setting === 'landmark') return level;
  if (rank && (setting === 'excavation' || setting === 'courtyard') && Math.abs(u) < rx && Math.abs(v) < rz - 1)
    return level - (setting === 'excavation' ? 4 : 2);
  if (rank && ['hall', 'burial', 'gallery'].includes(setting) && v >= rz - 1) return level + 2;
  return level;
};

// The shape of a site in site-local cells: u across, v towards its back (the approach comes from
// -v). Ordinary sites are a (2 rx + 1) x (2 rz + 1) block with the chest (anchor) in the middle of
// the back row and its access cell in front of it. A landmark site is laid out around its landmark
// (assets/themes/, see docs/assets/themes.md) by the landmark's role, the chest at (0, 0):
//   shrine    the landmark right behind the chest
//   gate      the landmark right in front of the access cell, its way through at u = 0
//   camp      beside the chest, level with it; monument: beside it, reaching back from it
// The landmark's own (x, z) lands on site-local (lu - x, lv - z): it faces the approach.
// side: which side a camp or monument stands on (1: +u, -1: -u)
function siteShape(intent, rank, side = 1) {
  if (!intent.landmark) {
    let rx = [1, 2, 2, 3][rank], rz = [1, 1, 2, 2][rank];
    if (intent.setting === 'gallery' || intent.setting === 'hall') [rx, rz] = [rz, rx];
    return { rx, rz, u0: -rx, u1: rx, v0: -rz, v1: rz, anchor: [0, rz], access: [0, rz - 1] };
  }
  const [minX, minZ, maxX, maxZ] = propMetadata.get(intent.landmark).bounds, gap = 0.05;
  const cell = t => Math.floor(t + 0.5);
  let lu = 0, lv;
  if (intent.role === 'shrine') lv = 0.5 + gap + maxZ;
  else if (intent.role === 'gate') lv = -1.5 - gap + minZ;
  else {
    lu = side > 0 ? 0.5 + gap + maxX : -0.5 - gap + minX;
    lv = intent.role === 'camp' ? (minZ + maxZ) / 2 : maxZ - 0.5;
  }
  const u0 = Math.min(cell(lu - maxX), -1), u1 = Math.max(cell(lu - minX), 1);
  const v0 = Math.min(cell(lv - maxZ), -1) - 1, v1 = Math.max(cell(lv - minZ), 0);
  return { rx: Math.max(-u0, u1), rz: Math.max(-v0, v1), u0, u1, v0, v1, anchor: [0, 0], access: [0, -1], lu, lv, side,
    landmarkCells: [cell(lu - maxX), cell(lu - minX), cell(lv - maxZ), cell(lv - minZ)] };
}

export function reserveSites(ctx) {
  ctx.sites = []; ctx.siteFailures = []; ctx.siteSpace = new Map();
  const occupied = new Set();
  for (const intent of ctx.spec.rewardSites || []) {
    const rank = PRESTIGE.indexOf(intent.prestige);
    if (rank < 0) throw Error('Unknown site prestige: ' + intent.prestige);
    if (intent.landmark && !propMetadata.get(intent.landmark)?.landmark) throw Error('Unknown landmark: ' + intent.landmark);
    const R = mulberry32(hash32(ctx.seed ^ intent.seed)), candidates = [];
    const portalCells = new Set(ctx.portals.flatMap(p => p.cells));
    const shapes = intent.landmark && ['camp', 'monument'].includes(intent.role)
      ? [siteShape(intent, rank, 1), siteShape(intent, rank, -1)] : [siteShape(intent, rank)];
    // on a pinnacle (cubegen/heights.js) the site is its top: only there, facing any way; likewise
    // on a lone peak's top or a great lake's islet (cubegen/setpieces.js)
    const first = !ctx.sites.length && !intent.landmark, sp = ctx.spec;
    const pin = !first ? null : sp.pinnacle ? { ...sp.pinnacle, fixed: true, ok: c => Math.hypot(c % N - sp.pinnacle.x, Math.floor(c / N) - sp.pinnacle.z) < PINNACLE_TOP, level: ctx.pinnacleTop }
      : ctx.peakTop?.size ? { ok: c => ctx.peakTop.has(c), level: ctx.pinnacleTop }
        : ctx.islet?.size ? { ok: c => ctx.islet.has(c), level: ctx.isletLevel } : null;
    // (the cells no site takes: another site's, a portal's, the sky's, a spout's)
    const taken = new Uint8Array(N * N);
    for (const c of [...occupied, ...portalCells, ...pin ? [] : ctx.sky, ...ctx.spouts.flatMap(s => s.cells)]) taken[c] = 1;
    for (const shape of shapes) for (const layer of pin ? [0] : [...new Set([ctx.K - 1, 0])]) for (let turn = 0; turn < 4; turn++) {
      for (let cz = 2; cz < N - 2; cz++) for (let cx = 2; cx < N - 2; cx++) {
        if (pin?.fixed && (cx !== pin.x || cz !== pin.z)) continue;
        const { u0, u1, v0, v1 } = shape;
        // (every cell in the cube but its outer two rings, free, on the pinnacle if there is one,
        // and on dry solid ground on the lowest layer)
        let fits = true;
        for (let v = v0; v <= v1 && fits; v++) for (let u = u0; u <= u1 && fits; u++) {
          const [dx, dz] = rotate(u, v, turn), x = cx + dx, z = cz + dz;
          if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) fits = false;
          else { const c = idx(x, z); fits = !taken[c] && (!pin || pin.ok(c)) && (layer || !(ctx.fluid0[c] || ctx.void0[c])); }
        }
        if (!fits) continue;
        const site = { ...intent, ...shape, rank, cx, cz, turn, layer }, cells = [];
        for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
          const [dx, dz] = rotate(u, v, turn);
          cells.push({ c: idx(cx + dx, cz + dz), u, v });
        }
        // Top-layer platforms preserve fluids/void below; never crush existing ground.
        // (as high as the ground goes on a tableland's shelves, a pinnacle's top and in a large
        // area, where there are no slabs; elsewhere under the first layer)
        site.level = layer ? ctx.B[layer] : pin ? pin.level : Math.min(ctx.spec.height || ctx.spec.area ? MAX_L - 2 : 12, Math.max(4,
          Math.round(cells.reduce((sum, { c }) => sum + ctx.lvl0[c], 0) / cells.length)));
        if (cells.some(({ c, u, v }) => {
          const h = heightAt(site, u, v);
          return h < 2 || h > MAX_L || (layer && !ctx.void0[c]
            && Math.max(ctx.lvl0[c], ctx.surf0[c]) + HEAD > h - 2);
        })) continue;
        const distance = Math.min(...ctx.portals.map(p => Math.hypot(cx - p.c % N, cz - Math.floor(p.c / N))));
        if (distance < 2 + rank * 0.6 && !pin) continue;
        candidates.push({ site, cells, score: distance + R() * 3 + (layer ? rank * 2 : 0) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0];
    if (!selected) { ctx.siteFailures.push({ id: intent.id, prestige: intent.prestige, reason: 'no footprint' }); continue; }
    const { site, cells } = selected;
    site.cells = cells.map(p => p.c); site.anchorCell = at(site, ...site.anchor); site.accessCell = at(site, ...site.access);
    site.uv = cells;
    site.dressing = [];
    for (const { c, u, v } of cells) {
      occupied.add(c);
      ctx.siteSpace.set(c, { site, top: heightAt(site, u, v), layer: site.layer });
      if (!site.layer) ctx.lvl0[c] = heightAt(site, u, v);
    }
    ctx.sites.push(site);
  }
}

// The cells a landmark (or a vignette, cubegen/vignettes.js) takes on its floors, from its colliders
// and occluders in cube space: { blocked, covered } (sets of cells). A cell is blocked when the
// character could not stand on its centre, and of two free neighbours with a wall between them the
// one nearer the wall is too (never one of `keep`), so whatever the route search walks the
// character can walk. Covered cells stay flat and no structure runs through them.
export function landmarkClaims(floors, colliders, occluders, keep = new Set()) {
  const walls = colliders.filter(b => b.bottom < CHAR_H);   // in the character's way (not the overhangs)
  const near = (b, x0, z0, x1, z1, r) => x1 > b.x0 - r && x0 < b.x1 + r && z1 > b.z0 - r && z0 < b.z1 + r;
  const blocked = new Set(floors.filter(f => walls.some(b => near(b, f.x + .5, f.z + .5, f.x + .5, f.z + .5, CHAR_R + .05)))
    .map(f => f.c));
  for (const f of floors) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const g = floors.find(h => h.x === f.x + dx && h.z === f.z + dz);
    if (!g || blocked.has(f.c) || blocked.has(g.c)) continue;
    const wall = walls.find(b => near(b, f.x + .5, f.z + .5, g.x + .5, g.z + .5, CHAR_R));
    if (!wall) continue;
    const mx = (wall.x0 + wall.x1) / 2, mz = (wall.z0 + wall.z1) / 2;
    const [a, b] = Math.hypot(f.x + .5 - mx, f.z + .5 - mz) < Math.hypot(g.x + .5 - mx, g.z + .5 - mz) ? [f, g] : [g, f];
    blocked.add(keep.has(a.c) ? b.c : a.c);
  }
  const covered = new Set(floors.filter(f => blocked.has(f.c)
    || [...colliders, ...occluders].some(b => near(b, f.x, f.z, f.x + 1, f.z + 1, 0))).map(f => f.c));
  return { blocked, covered };
}

// A landmark site's landmark: its colliders and occluders in cube space (boxes, quarter turns
// only), the cells it blocks and the cells it covers (landmarkClaims).
function placeLandmark(ctx, site) {
  const p = propMetadata.get(site.landmark), yaw = -site.turn * Math.PI / 2 + Math.PI;
  const point = (x, z) => toCube(site, site.lu - x, site.lv - z);
  const box = b => {
    const [ax, az] = point(b[0], b[1]), [bx, bz] = point(b[2], b[3]);
    return { shape: 'box', x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz),
      bottom: b[4], top: b[5] };
  };
  const colliders = p.colliders.map(box), occluders = p.occluders.map(box);
  const floors = site.uv.map(({ c }) => ctx.layerFloor(c, site.layer)).filter(Boolean);
  const keep = new Set([site.anchorCell, site.accessCell]);
  const { blocked, covered } = landmarkClaims(floors, colliders, occluders, keep);
  const height = Math.ceil(p.height / LH);
  for (const f of floors) {
    if (blocked.has(f.c) && !keep.has(f.c)) { f.siteBlocked = true; f.siteBlockTop = f.top + height; }
    if (covered.has(f.c)) { f.siteDressing = true; f.siteClaimTop = f.top + height; }
  }
  const [x, z] = point(0, 0);
  site.landmarkPlacement = { name: p.name, x, z, yaw, colliders, occluders,
    anchors: (p.anchors || []).map(([ax, ay, az]) => { const [wx, wz] = point(ax, az); return [wx, ay, wz]; }) };
}

// Called while floors are still unindexed, before optional fluids/supports change them.
export function prepareSites(ctx) {
  for (const site of ctx.sites) {
    site.floor = ctx.layerFloor(site.anchorCell, site.layer);
    site.access = ctx.layerFloor(site.accessCell, site.layer);
    const recipe = RECIPES[site.biome], bases = Array.isArray(recipe) ? recipe : recipe?.[site.setting] || [];
    const R = mulberry32(site.seed);
    const positions = [[-site.rx, site.rz], [site.rx, site.rz], [-site.rx, -site.rz]];
    const add = (name, c, s, yaw) => {
      const p = propMetadata.get(name), f = ctx.layerFloor(c, site.layer);
      if (!p || !f || p.attach !== 'ground') return;
      const above = ctx.nextAbove(f);
      if (above && above.bottom * LH < f.top * LH + p.maxY * s + CHAR_H) return;
      if (p.blocking) { f.siteBlocked = true; f.siteBlockTop = f.top + Math.ceil(p.maxY * s / LH); }
      f.siteDressing = true;
      site.dressing.push({ name, c, s, yaw, blocking: !!p.blocking });
    };
    // (the beginning's rock holds the glassmaker's glass there, no chest: cubegen/index.js firstGlassOf)
    if (site.spawn !== 'glass') add('treasure_chest', site.anchorCell, 0.8, -site.turn * Math.PI / 2 + Math.PI);
    if (site.landmark) {
      // the landmark, and a few small things of the theme's around the chest
      placeLandmark(ctx, site);
      const small = bases.filter(b => !propMetadata.get(`${site.biome}_${b}_a`)?.blocking);
      const spots = { shrine: [[-1, 0], [1, 0]], gate: [[-1, 0], [1, 0]], camp: [[-site.side, 0], [-site.side, -1]],
        monument: [[-site.side, 0]] }[site.role];
      spots.forEach(([u, v], i) => {
        const c = at(site, u, v), f = ctx.layerFloor(c, site.layer);
        if (small.length && f && !f.siteBlocked && !f.siteClaimTop)
          add(`${site.biome}_${small[i % small.length]}_${R() < 0.5 ? 'a' : 'b'}`, c, 0.9, -site.turn * Math.PI / 2);
      });
      continue;
    }
    positions.forEach(([u, v], i) => {
      // Basic alcoves get a chest and one non-blocking detail; larger sites get a composition.
      const name = `${site.biome}_${bases[i]}_${R() < 0.5 ? 'a' : 'b'}`, p = propMetadata.get(name);
      if (site.rank || (i === 0 && !p?.blocking)) add(name, at(site, u, v), 0.9, -site.turn * Math.PI / 2);
    });
    if (site.rank && site.setting === 'gallery') {
      for (let v = -site.rz; v < site.rz - 1; v++)
        add('mines_rail_piece_a', at(site, site.rx, v), 1, -site.turn * Math.PI / 2);
    }
    if (site.rank >= 2 && site.setting === 'hall') {
      for (const u of [-site.rx, site.rx]) for (const v of [-site.rz + 1, site.rz - 1])
        add('ruins_broken_column_a', at(site, u, v), 0.9, -site.turn * Math.PI / 2);
    }
  }
}

// Both directions are required, unlike the generator's one-way exit guarantee.
export function routeSites(ctx) {
  for (const site of ctx.sites) {
    const entry = ctx.portalFloors.find(f => f !== ctx.hub) || ctx.hub || ctx.portalFloors[0];
    const exit = ctx.hub || entry;
    const approach = entry && search(ctx, entry, site.access, ctx.jitter, ctx.have);
    const back = exit && search(ctx, site.access, exit, ctx.jitter, ctx.have);
    site.connected = !!approach && !!back;
    if (site.connected) {
      take(ctx, approach); take(ctx, back);
      site.entry = entry; site.exitFloor = exit;
    }
  }
  // These are not disposable decorative routes: structural placement must fit them.
  if (ctx.sites.some(site => site.connected)) ctx.reqMoves = ctx.moves.length;
}

export function finishSites(ctx) {
  const rewardSites = [], placements = [], blockers = Array.from({ length: N * N }, () => []), occluders = [];
  // a blocker goes into every cell the character could touch it from
  const index = (b, x0, z0, x1, z1) => {
    for (let z = Math.max(0, Math.floor(z0 - CHAR_R)); z <= Math.min(N - 1, Math.floor(z1 + CHAR_R)); z++)
      for (let x = Math.max(0, Math.floor(x0 - CHAR_R)); x <= Math.min(N - 1, Math.floor(x1 + CHAR_R)); x++) blockers[idx(x, z)].push(b);
  };
  for (const site of ctx.sites) {
    const reachable = site.connected && reachTo(ctx, site.access, true)?.has(site.entry.id)
      && reachTo(ctx, site.exitFloor, true)?.has(site.access.id);
    const accessClear = site.access && !ctx.pieces[site.access.c].length && !ctx.pieces[site.floor.c].length
      && !site.access.fluid && !site.floor.fluid
      && Math.max(...site.access.cs) - Math.min(...site.access.cs) < 0.2
      && Math.max(...site.floor.cs) - Math.min(...site.floor.cs) < 0.2
      && Math.abs(floorY(site.floor, 0.5, 0.5) - floorY(site.access, 0.5, 0.5)) < 0.1;
    if (!reachable || !accessClear) {
      ctx.siteFailures.push({ id: site.id, prestige: site.prestige, reason: 'approach or return blocked' });
      continue;
    }
    for (const q of site.dressing) {
      const f = ctx.layerFloor(q.c, site.layer), p = propMetadata.get(q.name);
      const y = floorY(f, 0.5, 0.5);
      const placement = { name: q.name, x: f.x + 0.5, y, z: f.z + 0.5, yaw: q.yaw, s: q.s, site: site.id };
      placements.push(placement);
      if (q.blocking) {
        const b = { x: placement.x, z: placement.z, r: p.radius * q.s, bottom: y, top: y + p.maxY * q.s };
        index(b, b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r);
      }
    }
    let landmark = null;
    if (site.landmarkPlacement) {
      const L = site.landmarkPlacement, y = floorY(site.floor, 0.5, 0.5);
      placements.push({ name: L.name, x: L.x, y, z: L.z, yaw: L.yaw, s: 1, site: site.id });
      for (const c of L.colliders) { const b = { ...c, bottom: y + c.bottom, top: y + c.top }; index(b, b.x0, b.z0, b.x1, b.z1); }
      occluders.push(...L.occluders.map(b => ({ ...b, bottom: y + b.bottom, top: y + b.top })));
      landmark = { name: L.name, role: site.role, x: L.x, y, z: L.z, yaw: L.yaw,
        anchors: L.anchors.map(([x, ay, z]) => [x, y + ay, z]) };
    }
    const anchor = { x: site.floor.x + 0.5, y: floorY(site.floor, 0.5, 0.5), z: site.floor.z + 0.5, yaw: -site.turn * Math.PI / 2 + Math.PI };
    rewardSites.push({ id: site.id, seed: site.seed, prestige: site.prestige, biome: site.biome,
      setting: site.setting, form: site.form, encounter: site.encounter, spawn: site.spawn, layer: site.layer, landmark,
      cells: site.cells, anchor, floor: site.floor.id, accessFloor: site.access.id,
      entryFloor: site.entry.id, exitFloor: site.exitFloor.id,
      approach: { x: site.access.x + 0.5, y: floorY(site.access, 0.5, 0.5), z: site.access.z + 0.5 } });
  }
  ctx.stats.sites = rewardSites.length; ctx.stats.requestedSites = (ctx.spec.rewardSites || []).length;
  return { rewardSites, sitePlacements: placements, staticBlockers: blockers, occluders, siteFailures: ctx.siteFailures,
    siteReservations: ctx.sites.flatMap(site => site.cells.map(c => ({ c, layer: site.layer }))) };
}
