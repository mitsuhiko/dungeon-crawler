// Independent seeded streams: enemies never alter the terrain generator's RNG.
// A level is a cube in the existing level flow. Its depth decides which species live there
// and how many (core/spawns.js); each species then places its count on dry floors with room
// for its body, away from entrances. A pack's first member keeps `profile.spacing` from
// every other enemy of its species; the rest of the pack gathers close around it.
// Each pack draws its kind from the roster's weights (core/spawns.js) on a stream of its own,
// so the kinds never move a spot. A spot carries its kind's profile as `kind`.
// A fluid dweller (physics/dwell.js: the Squirtles) is placed in a fluid of its kind's instead
// (`dwellerSpots`), and in an arena in its pond (cubegen/guardian.js).
import { N, LH } from '../core/constants.js';
import { enemyRoll, coinRange, guardianLevel, ENEMY_KINDS, GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, isRanged } from '../core/enemies.js';
import { guardianId } from '../core/guardians.js';
import { population } from '../core/spawns.js';
import { swarmKind, HORDE } from '../core/hordes.js';
import { mulberry32, hash32 } from '../core/util.js';
import { step as stepKey } from '../world/coords.js';
import { walkable, neighbors, groundY, floorAt } from '../physics/enemynav.js';
import { fixedWet, livesOn, walker, standY } from '../physics/dwell.js';

const CLOSE = 1.2;   // the least distance between two members of a pack

export function pickKind(kinds, r) {
  const list = Object.entries(kinds ?? {});
  let w = r * list.reduce((n, [, k]) => n + k, 0);
  for (const [type, k] of list) if ((w -= k) < 0) return ENEMY_KINDS[type];
  return ENEMY_KINDS[list.at(-1)?.[0]];
}

// An arena's and a horde's spots are placed for all species at once: each species asks for
// its own (every reset* of game/enemies.js), so they are placed once a map (55-100 ms on a fast
// machine for an arena, ~15 times over on entering) and each asker gets copies.
const placed = new WeakMap();
const placedOnce = (map, kind, place) => {
  let m = placed.get(map);
  if (!m) placed.set(map, m = {});
  return m[kind] ??= place(map);
};
const ofSpecies = (spots, profile) => spots.filter(s => s.kind.species === profile.species).map(s => ({ ...s }));

export function enemySpots(map, profile) {
  if (map.guardian) return ofSpecies(placedOnce(map, 'guardian', guardianSpots), profile);
  if (map.horde) return ofSpecies(placedOnce(map, 'horde', hordeSpots), profile);
  if (map.firstGlass) return ofSpecies(placedOnce(map, 'firstGlass', firstGlassSpots), profile);
  const spec = population(map).get(profile.type);
  if (!spec?.count) return [];
  if (profile.dwells) return dwellerSpots(map, profile, spec);
  const R = mulberry32(hash32(map.seed ^ profile.seedSalt)), { count, pack } = spec;
  const K = mulberry32(hash32(map.seed ^ profile.seedSalt ^ 0x6b1d5)), kinds = [];
  // room for the biggest kind the pack could draw
  const drawn = Object.keys(spec.kinds ?? {}).map(k => ENEMY_KINDS[k]).filter(Boolean);
  const height = Math.max(profile.height, ...drawn.map(k => k.height)), radius = Math.max(profile.radius, ...drawn.map(k => k.radius));
  const cand = map.floors.filter(f => !f.siteAnchor && !f.siteAccess && !f.spot && !f.noSpawn && walkable(f, height)
    && f.x > 0 && f.z > 0 && f.x < N - 1 && f.z < N - 1
    && map.portals.every(p => Math.hypot(f.x - p.x, f.z - p.z) >= 4)
    && neighbors(f, height).length >= 2
    && [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]
      .every(([x, z]) => floorAt(f, f.x + 0.5 + x, f.z + 0.5 + z, height)));
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const spots = [], used = new Set(), troop = profile.troop;
  const clear = (f, d) => spots.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= d || Math.abs(g.top - f.top) >= 6);
  for (const a of cand) {
    if (spots.length >= count) break;
    if (used.has(a) || !clear(a, profile.spacing)) continue;
    // the rest of the pack: ceil(pack / 2)..pack in all (a troop: exactly that many), within
    // reach of the first on its level
    const size = Math.min(count - spots.length, troop ?? Math.ceil(pack / 2) + Math.floor(R() * (Math.floor(pack / 2) + 1)));
    const reach = 1.5 + Math.sqrt(size), members = [a];
    for (let n = 1; n < size; n++) {
      const f = cand.find(f => !used.has(f) && !members.includes(f) && Math.abs(f.top - a.top) < 1
        && Math.hypot(f.x - a.x, f.z - a.z) <= reach && clear(f, CLOSE) && members.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= CLOSE));
      if (!f) break;
      members.push(f);
    }
    if (troop && members.length < size) continue;   // no room here for a whole troop: elsewhere
    const kind = pickKind(spec.kinds, K()) ?? profile;
    for (const f of members) { spots.push(f); used.add(f); kinds.push(kind); }
  }
  return spots.map((f, i) => ({ ...enemyRoll(map, kinds[i], f.id), respawn: map.key, kind: kinds[i], f, x: f.x + 0.5, z: f.z + 0.5, y: groundY(f, f.x + 0.5, f.z + 0.5), yaw: R() * Math.PI * 2 }));
}

// A fluid dweller's spots: on fluid floors of its kind's (a pool, a river, a lake), with room for it
// there and more of its fluid round it, away from the entrances. Each pack draws its kind among
// those the cube has a free spot for (each lives in a fluid of its own), and gathers in that fluid
// round its first; none where the cube has no such fluid.
function dwellerSpots(map, profile, spec) {
  const R = mulberry32(hash32(map.seed ^ profile.seedSalt)), K = mulberry32(hash32(map.seed ^ profile.seedSalt ^ 0x6b1d5));
  const kinds = Object.keys(spec.kinds ?? { [profile.type]: 1 }).map(k => ENEMY_KINDS[k]).filter(k => k?.dwells);
  const fits = kind => f => fixedWet(kind, f) && !f.noSpawn && livesOn(kind, f, map)
    && f.x > 0 && f.z > 0 && f.x < N - 1 && f.z < N - 1
    && map.portals.every(p => Math.hypot(f.x - p.x, f.z - p.z) >= 4)
    && neighbors(f, walker(kind)).length >= 2;
  const shuffled = list => {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  };
  const cand = new Map(kinds.map(k => [k, shuffled(map.floors.filter(fits(k)))]));
  const spots = [], out = [], used = new Set();
  const clear = (f, d) => spots.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= d || Math.abs(g.top - f.top) >= 6);
  const free = kind => cand.get(kind).find(f => !used.has(f) && clear(f, profile.spacing));
  while (spots.length < spec.count) {
    const open = kinds.filter(free);
    if (!open.length) break;
    const kind = pickKind(Object.fromEntries(open.map(k => [k.type, spec.kinds?.[k.type] ?? 1])), K()), a = free(kind);
    const size = Math.min(spec.count - spots.length, Math.ceil(spec.pack / 2) + Math.floor(R() * (Math.floor(spec.pack / 2) + 1)));
    const reach = 1.5 + Math.sqrt(size), apart = Math.max(CLOSE, kind.radius * 2), members = [a];
    for (let n = 1; n < size; n++) {
      const f = cand.get(kind).find(f => !used.has(f) && !members.includes(f) && f.surf === a.surf
        && Math.hypot(f.x - a.x, f.z - a.z) <= reach && members.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= apart));
      if (!f) break;
      members.push(f);
    }
    for (const f of members) { spots.push(f); used.add(f); out.push(kind); }
  }
  return spots.map((f, i) => ({ ...enemyRoll(map, out[i], f.id), respawn: map.key, kind: out[i], f, x: f.x + 0.5, z: f.z + 0.5,
    y: standY(out[i], f, f.x + 0.5, f.z + 0.5), yaw: R() * Math.PI * 2 }));
}

// The beginning's rock (core/intro.js, core/spawns.js FIRST_GLASS): its snakes wait round the foot of
// its ladder, on the side the hero comes from (the room's way in from the merchant camp), a little
// apart, facing that way: they stand between the hero and his glass.
const FOOT = [1.2, 3.6];   // cells from the ladder's foot
function firstGlassSpots(map) {
  const [type, spec] = [...population(map)][0], kind = ENEMY_KINDS[type], l = map.firstGlass.ladder;
  const came = map.route?.[map.routeIndex - 1], into = map.portals.find(p => came && stepKey(map.key, p.dir) === came) ?? map.portals[0];
  const ix = into.x + 0.5, iz = into.z + 0.5, R = mulberry32(hash32(map.seed ^ 0xf1a55));
  const cand = map.floors.filter(f => walkable(f, kind.height) && !f.siteAnchor && !f.siteAccess && !f.spot
    && Math.abs(f.top * LH - l.y) < 0.6 && f.x > 0 && f.z > 0 && f.x < N - 1 && f.z < N - 1
    && Math.hypot(f.x + 0.5 - l.x, f.z + 0.5 - l.z) >= FOOT[0] && Math.hypot(f.x + 0.5 - l.x, f.z + 0.5 - l.z) <= FOOT[1]
    && Math.hypot(f.x - into.x, f.z - into.z) >= 4 && neighbors(f, kind.height).length >= 2
    && [[kind.radius, 0], [-kind.radius, 0], [0, kind.radius], [0, -kind.radius]].every(([x, z]) => floorAt(f, f.x + 0.5 + x, f.z + 0.5 + z, kind.height)))
    .map(f => ({ f, s: Math.hypot(f.x + 0.5 - ix, f.z + 0.5 - iz) + R() * 0.8 }))
    .sort((a, b) => a.s - b.s).map(c => c.f);
  const spots = [];
  for (const f of cand) {
    if (spots.length >= spec.count) break;
    if (spots.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= 1.4)) spots.push(f);
  }
  return spots.map(f => ({ ...enemyRoll(map, kind, f.id), respawn: map.key, kind, f, x: f.x + 0.5, z: f.z + 0.5,
    y: groundY(f, f.x + 0.5, f.z + 0.5), yaw: Math.atan2(ix - f.x - 0.5, iz - f.z - 0.5) }));
}

// A connected local spawn patch; IDs/rolls use member slots, not terrain floor IDs.
export function hordeSpots(map) {
  const spec = [...population(map).values()][0];
  if (!map.horde || !spec) return [];
  const kind = swarmKind(ENEMY_KINDS[map.horde.kind], spec.rewardScale);
  const R = mulberry32(hash32(map.seed ^ 0x40ade)), { anchor } = map.horde;
  const candidates = (map.horde.spawnFloors ?? []).filter(f => walkable(f, kind.height)
    && map.portals.every(p => Math.hypot(f.x - p.x, f.z - p.z) >= 4)
    && [[kind.radius, 0], [-kind.radius, 0], [0, kind.radius], [0, -kind.radius]]
      .every(([x, z]) => floorAt(f, f.x + .5 + x, f.z + .5 + z, kind.height)))
    .map(f => ({ f, score: Math.hypot(f.x + .5 - anchor.x, f.z + .5 - anchor.z) + R() * .6 }))
    .sort((a, b) => a.score - b.score);
  const floors = [];
  for (const { f } of candidates) {
    if (floors.every(g => Math.hypot(g.x - f.x, g.z - f.z) >= kind.radius * 2 + .15)) floors.push(f);
    if (floors.length === spec.count) break;
  }
  if (floors.length !== spec.count) throw new Error(`Horde patch cannot hold ${spec.count} members: ${map.key}`);
  return floors.map((f, i) => ({ ...enemyRoll(map, kind, i), id: `${map.horde.id}:member:${i}`, respawn: map.key,
    kind, hordeId: map.horde.id, hordeSlot: i, hordeReaction: R() * HORDE.reaction,
    f, x: f.x + .5, z: f.z + .5, y: groundY(f, f.x + .5, f.z + .5), yaw: R() * Math.PI * 2 }));
}

// All species share one deterministic placement stream in an arena, avoiding overlapping
// spawns and making exactly one promoted member part of the doubled population.
export function guardianSpots(map) {
  const pop = population(map), species = [...pop.keys()];
  if (!species.length) return [];
  const R = mulberry32(hash32(map.seed ^ 0x6a7d1a)), guard = map.guardian;
  const role = guard.role ?? 'descent';
  if (guard.boss) return [bossSpot(map, ENEMY_KINDS[guard.boss], role)];
  const { chosen, kind } = promoted(species, role, R);
  // the guardian's level follows the depth (and the world's level) alone (core/enemies.js guardianLevel); its coins
  // still come from the arena's seeded roll. (A fluid dweller guards from the arena's pond, the
  // nearest of it to its spot.)
  const pond = kind.dwells && map.floors.filter(g => g.encounter && livesOn(kind, g, map))
    .sort((a, b) => Math.hypot(a.x + .5 - guard.x, a.z + .5 - guard.z) - Math.hypot(b.x + .5 - guard.x, b.z + .5 - guard.z))[0];
  const f = pond || guard.floor, at = pond ? { x: f.x + .5, z: f.z + .5, y: standY(kind, f, f.x + .5, f.z + .5) } : guard, R2 = mulberry32(hash32(map.seed ^ 0x6a7d1b)), level = guardianLevel(map.depth, role, map.level);
  const [lo, hi] = coinRange(kind, level);
  const spots = [{ id: guardianId(map.key), level, coinDrop: lo + Math.floor(R2() * (hi - lo + 1)),
    guardian: true, guardianRole: role, bossPlaceholder: role === 'descent', guardianGate: map.key, kind, f, x: at.x, z: at.z, y: at.y, yaw: guard.yaw }];
  const used = new Set([f.id]), entrance = map.portals.find(p => p.kind === 'side');
  const requests = [];
  for (const [type, spec] of pop) for (let i = type === chosen ? 1 : 0; i < spec.count; i++)
    requests.push(pickKind(spec.kinds, R()));
  // The largest bodies claim their spots first, so a swarm cannot crowd them out.
  requests.sort((a, b) => b.radius - a.radius);
  const [dx, dz] = guard.approach;
  for (const kind of requests) {
    const ahead = isRanged(kind) ? -1 + R() * 3 : 2 + R() * 5, side = (R() - .5) * 8;
    const tx = guard.x + dx * ahead - dz * side, tz = guard.z + dz * ahead + dx * side;
    // (a fluid dweller: in the arena's pond, as many as it holds)
    // (its body probed a little inside a cell's half-width, as it moves: physics/enemynav.js)
    const body = kind.dwells ? walker(kind) : kind.height, r = kind.dwells ? Math.min(kind.radius, .42) : kind.radius;
    const candidates = map.floors.filter(f => f.encounter && !used.has(f.id) && walkable(f, body)
      && Math.hypot(f.x - entrance.x, f.z - entrance.z) >= 4
      && map.portals.filter(p => p.dir === map.exit).every(p => Math.hypot(f.x - p.x, f.z - p.z) >= 1.8)
      && spots.every(s => Math.hypot(f.x + .5 - s.x, f.z + .5 - s.z) >= kind.radius + s.kind.radius + .12)
      && [[r, 0], [-r, 0], [0, r], [0, -r]]
        .every(([x, z]) => floorAt(f, f.x + .5 + x, f.z + .5 + z, body)));
    candidates.sort((a, b) => Math.hypot(a.x + .5 - tx, a.z + .5 - tz) - Math.hypot(b.x + .5 - tx, b.z + .5 - tz));
    const f = candidates[0];
    if (!f && kind.dwells) continue;
    if (!f) throw new Error('Guardian arena cannot hold its doubled population');
    used.add(f.id);
    spots.push({ ...enemyRoll(map, kind, f.id), kind, f, x: f.x + .5, z: f.z + .5,
      y: standY(kind, f, f.x + .5, f.z + .5), yaw: guard.yaw });
  }
  return spots;
}

// the species an arena promotes to its guardian (the stream's first draw), and that guardian's kind
function promoted(species, role, R) {
  const chosen = species[Math.floor(R() * species.length)];
  return { chosen, kind: (role === 'descent' ? DESCENT_GUARDIAN_KINDS : GUARDIAN_KINDS)[chosen] };
}
// The kind of map's guardian (a boss's, or the one guardianSpots promotes), without placing
// anyone: what the messages call it (core/guardians.js). null: no guardian.
export function guardianKind(map) {
  const guard = map?.guardian;
  if (!guard) return null;
  if (guard.boss) return ENEMY_KINDS[guard.boss];
  const species = [...population(map).keys()];
  return species.length ? promoted(species, guard.role ?? 'descent', mulberry32(hash32(map.seed ^ 0x6a7d1a))).kind : null;
}

// A real boss (core/bosses.js) stands on the guardian's spot alone, at the guardian's level, with
// the guardian's id and gate: no defenders, it brings its own (game/gusto.js).
function bossSpot(map, kind, role) {
  const guard = map.guardian, level = guardianLevel(map.depth, role, map.level), [lo, hi] = coinRange(kind, level);
  const R = mulberry32(hash32(map.seed ^ 0x6a7d1b));
  return { id: guardianId(map.key), level, coinDrop: lo + Math.floor(R() * (hi - lo + 1)), guardian: true, guardianRole: role,
    bossPlaceholder: false, boss: kind.boss, guardianGate: map.key, kind, f: guard.floor, x: guard.x, z: guard.z, y: guard.y, yaw: guard.yaw };
}
