// Umbra's fight (core/umbra.js has the rules, docs/bosses.md tells it): this cube's Umbra, the bodies
// that pass for him along his body (UMBRA_BODY: a blade or a shot that reaches one hits him) and the
// squirtles he calls, in one list (`umbras`), so they are hit, travel and get shown to friends like
// any enemy. Each Umbra has a fight of his own here: { e (him), reef (map.dive), h (his head: where
// and which way), trail (where it went: his body, core/umbra.js), segs (his body's), goal, spot,
// timers, vents, jets, mud, minions }. A dev spawn (game/devspawn.js) gets one too: out of his reef
// there is no water (no air, no mud), he fights at once.
//
// The shared enemy AI never moves him: this swims him (core/umbra.js steer) and runs his attacks
// (mode 'attack', `attack`, `t` as any enemy's, so his clips play and game/quakes.js runs his
// shockwave). His reef's water is his too (`dive`: { phase, t }, game/dive.js floods it after it):
// dry until somebody takes the diving suit (`suitUp`, from game/dive.js or a friend's game), then
// the suit going on, the water rising, and him coming (his intro, game/bossreveals.js: `holdIntro`
// until then); `fightT`: the air used since the fight started.
//
// Sent to friends with his row (net/protocol.js): `stage`, the reef's water, the air's clock, his
// shield, the mud, his volcanoes and his jets; their games draw them after it and hurt nobody (the
// runner's blows reach them through hitBody).
import { player, state, setStatus } from './state.js';
import { UMBRA, UMBRA_BODY, STAGE_PROFILES, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName, blowOf } from '../core/enemies.js';
import { UMBRA_FIGHT as G, phaseFloor, summonCount, barred, newTrail, pushTrail, settleTrail, bodyAt, bodyParts, steer, nextSpot, swimSpots,
  ventSpots, ventPhase, inColumn, bombAt, jetVolley, jetWay, inJet, mudY as mudWorldY, nextMudStep, mudLevel } from '../core/umbra.js';
import { LH, N } from '../core/constants.js';
import { launch } from '../core/projectiles.js';
import { floorY } from '../core/surfaces.js';
import { groundAt } from '../physics/collide.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, players, nearest } from './bossfight.js';
import { hitBody, attacker } from './enemycombat.js';
import { addProjectile } from './projectiles.js';
import { summonFx, quake, tremor } from './juice.js';
import { relay } from '../net/online.js';
import { wallBurst } from '../render/dive.js';
import { sfx } from '../audio/sfx.js';
import { tr, msg } from '../i18n/i18n.js';

export let umbras = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();
const HEAD = 0.46;   // cells from the middle of his head to its bottom (his `y`; blender/umbra.py MID)
const index = name => UMBRA.attacks.findIndex(a => a.name === name);

export function resetUmbras() {
  removeEnemyViews(umbras);
  umbras = []; fights = [];
  addUmbras(enemySpots(state.map, UMBRA).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? UMBRA, i)));
}
// Umbras to fight: this cube's, or spawned with the dev tools
export function addUmbras(list) {
  for (const e of list) {
    const reef = state.map?.dive ?? null, dy = Math.sin(e.yaw), dz = Math.cos(e.yaw);
    const h = { x: e.x, y: e.y + 0.7, z: e.z, dx: dy, dy: 0, dz };
    Object.assign(e, { stage: 1, hpFloor: phaseFloor(e.profile.hp, 1), dive: { phase: reef ? 'dry' : 'wet', t: 0 }, fightT: reef ? NaN : 0,
      mudY: NaN, vents: [], jets: null, lift: 0, holdIntro: !!reef, mode: reef ? 'gone' : 'idle' });
    const f = { e, reef, h, trail: newTrail(h, [h.dx, 0, h.dz]), segs: [], goal: null, spot: null, spots: [], speed: 0,
      huntIn: 2, quakeIn: G.quake.first, ventsIn: G.vents.first, summonIn: G.squirtles.first, jetsIn: G.jets.first, shieldIn: G.shield.first,
      mud: null, mudIn: Infinity, jetRun: null, lock: null, slam: null, burnt: new Map(), minions: [], n: 0, vented: 0,
      nonce: Math.random().toString(36).slice(2, 7), seed: (Math.random() * 1e9) >>> 0, over: false, last: null };
    f.spots = swimSpots(reef?.hills ?? [], reef?.low ?? e.y, reef?.surface ?? e.y + 6);
    e.post = { x: e.x, y: e.y, z: e.z, yaw: e.yaw };   // (his spot: where his intro frames him, game/bossreveals.js)
    e.trail = f.trail;
    e.suitUp = () => suitUp(f);
    e.summon = () => {};
    makeBody(f);
    fights.push(f); umbras.push(e, ...f.segs);
  }
}
export function detachUmbras() { const list = umbras; umbras = []; fights = []; return list; }

// The bodies along his body: their health is his (a blow on one is his, core/combat.js damageEnemy),
// they are there while he is, and pass for him (no bar over them, game/bossbar.js)
function makeBody(f) {
  const e = f.e, parts = bodyParts(f.trail);
  f.segs = parts.slice(1).map((p, i) => {
    const s = makeEnemy({ id: `${e.id}:body:${i}`, level: e.level, f: e.f, x: p.x, y: p.y - p.r, z: p.z, yaw: e.yaw,
      guardian: e.guardian, guardianRole: e.guardianRole, coinDrop: 0, summoned: true, noReward: true }, UMBRA_BODY, i);
    s.profile = { ...s.profile, radius: p.r, height: p.r * 2, bodyHeight: p.r * 2 };
    s.host = e;
    Object.defineProperty(s, 'hp', { get: () => e.hp, set: () => {}, enumerable: true, configurable: true });
    Object.defineProperty(s, 'mode', { get: () => e.mode === 'dead' || e.mode === 'gone' || e.staged ? 'gone' : 'chase', set: () => {}, enumerable: true, configurable: true });
    return s;
  });
}
function placeBody(f) {
  const parts = bodyParts(f.trail);
  f.segs.forEach((s, i) => { const p = parts[i + 1]; Object.assign(s, { x: p.x, y: p.y - p.r, z: p.z, yaw: f.e.yaw }); });
}

export function updateUmbras(dt) {
  for (const f of fights) run(f, dt);
  for (const e of umbras) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  // (his squirtles bob as they swim: core/enemies.js DEEP_SQUIRTLE `free`)
  const free = umbras.filter(m => m.profile.free);
  stepEnemies(free.filter(m => m.mode !== 'gone' && m.mode !== 'split'), dt);
  for (const m of free) { m.bob = (m.bob ?? Math.random() * 6) + dt; m.lift = 0.3 + 0.18 * Math.sin(m.bob * 2.1); }
  umbras = sweep(umbras, dt);
  fights = fights.filter(f => umbras.includes(f.e));
  umbras = umbras.filter(b => !b.host || fights.some(f => f.e === b.host));
}

// --- the ground and the water he swims in -----------------------------------------------------------

const groundOf = f => (x, z) => {
  const top = f.reef ? f.reef.surface + 4 : f.e.y + 8, h = groundAt(x, z, top, 0).h;
  return Number.isFinite(h) ? h : (f.reef?.low ?? 0);
};
const surfaceOf = f => f.reef ? f.reef.surface : f.h.y + 5;
const boxOf = f => f.reef?.box ?? [1, 1, N - 1, N - 1];
const swim = (f, goal, dt, speed, turn = G.swim.turn) => {
  steer(f.h, goal, dt, { speed, turn, surface: surfaceOf(f), box: boxOf(f), ground: groundOf(f) });
  f.speed = speed;
};
// him where his head is (his `y` its bottom), its heading; the trail and his body after it
function sync(f) {
  const e = f.e, h = f.h;
  Object.assign(e, { x: h.x, y: h.y - HEAD, z: h.z, yaw: Math.atan2(h.dx, h.dz), pitch: Math.asin(Math.max(-1, Math.min(1, h.dy))), speed: f.speed });
  pushTrail(f.trail, h);
  placeBody(f);
}
// his head where his intro (or a friend's row) put him
function fromEnemy(f) {
  const e = f.e, h = f.h, nx = e.x - h.x, ny = e.y + HEAD - h.y, nz = e.z - h.z, l = Math.hypot(nx, ny, nz);
  if (l > 1e-3) { h.dx = nx / l; h.dy = ny / l; h.dz = nz / l; }
  Object.assign(h, { x: e.x, y: e.y + HEAD, z: e.z });
  pushTrail(f.trail, h);
  placeBody(f);
}
const chest = p => ({ x: p.x, y: p.y + 0.5, z: p.z });
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// --- the reef's water: the suit, the water rising, him coming, the water draining ------------------

function suitUp(f) {
  const d = f.e.dive;
  if (d.phase !== 'dry' || f.e.mode === 'dead') return;
  Object.assign(d, { phase: 'suit', t: 0 });
}
function stepWater(f, dt) {
  const e = f.e, d = e.dive;
  d.t += dt;
  if (d.phase === 'suit' && d.t >= G.suit) {
    Object.assign(d, { phase: 'flood', t: 0 });
    setStatus(tr('The water is rising!'));
    sfx('rumble', { at: e, pitch: 0.5, volume: 1 });
  } else if (d.phase === 'flood' && d.t >= G.flood) {
    Object.assign(d, { phase: 'wet', t: 0 });
    // he comes, straight out of the wall nearest his spot: his intro (game/bossintro.js waits for
    // him, `holdIntro`)
    Object.assign(e, { holdIntro: false, mode: 'idle', fightT: 0 });
    emerge(f);
  } else if (d.phase === 'drain' && d.t >= G.drain) Object.assign(d, { phase: 'over', t: 0 });
}

// Out of the wall: the inner face of the bank nearest his spot, his head at it looking into the room
// halfway up the bank, his body straight back into the wall; what of him is still in it is not drawn
// (`clipWall`: [nx, nz, d], drawn where nx x + nz z >= d, render/umbraview.js) till all of him is out
function wallOf(f) {
  const e = f.e, p = e.post, [x0, z0, x1, z1] = boxOf(f), g = groundOf(f);
  const sides = [[x0 + 1, 1, 0, p.x - x0], [x1 - 1, -1, 0, x1 - p.x], [z0 + 1, 0, 1, p.z - z0], [z1 - 1, 0, -1, z1 - p.z]];
  const [at, nx, nz] = sides.sort((a, b) => a[3] - b[3])[0];
  const along = nx ? Math.min(z1 - 2.5, Math.max(z0 + 2.5, p.z)) : Math.min(x1 - 2.5, Math.max(x0 + 2.5, p.x));
  const x = nx ? at : along, z = nx ? along : at;
  // (between the floor in front of it and the bank's top)
  const floor = g(x + nx * 0.6, z + nz * 0.6), bank = g(x - nx * 0.5, z - nz * 0.5);
  return { x, z, y: Math.max(floor + 0.75, Math.min(bank - 0.45, floor + 1.4)), nx, nz };
}
function emerge(f) {
  const e = f.e, w = wallOf(f);
  Object.assign(f.h, { x: w.x + w.nx * 0.05, y: w.y, z: w.z + w.nz * 0.05, dx: w.nx, dy: 0, dz: w.nz });
  f.trail = e.trail = newTrail(f.h, [w.nx, 0, w.nz]);
  e.clipWall = [w.nx, w.nz, w.nx * w.x + w.nz * w.z];
  f.spot = nextSpot(f.spots, null);
  sync(f);
  sfx('rumble', { at: w, pitch: 0.4, volume: 1 }); quake(0.03);
  wallBurst(w.x, w.y, w.z, w.nx, w.nz);
}
// all of him out of the wall: drawn whole
function outOfWall(f) {
  const c = f.e.clipWall;
  if (!c) return;
  const tail = bodyAt(f.trail, G.body.length);
  if (c[0] * tail.x + c[1] * tail.z > c[2] + 0.3) f.e.clipWall = null;
}

// --- the fight --------------------------------------------------------------------------------------

function run(f, dt) {
  const e = f.e;
  f.minions = f.minions.filter(m => living(m) && umbras.includes(m));
  stepWater(f, dt);
  stepVents(f, dt);
  stepJets(f, dt);
  stepMud(f, dt);
  if (e.mode === 'dead') { dying(f, dt); return; }
  if (e.mode === 'gone') return;   // (the reef dry, the suit going on, the water rising: not here yet)
  outOfWall(f);
  if (e.staged) { fromEnemy(f); return; }   // his intro moves him (game/bossreveals.js)
  // into the fight once his intro has had him (game/bossintro.js marks him met as it starts it; out of a
  // reef or in a test room he has none), or, a test room's, once he is hit (`dormant`)
  if (e.mode === 'idle') {
    const met = !f.reef || state.map?.testRoom || state.run?.met?.has(e.id);
    if (e.dormant && e.hp >= e.profile.hp) { swim(f, f.spot ?? (f.spot = nextSpot(f.spots, null)), dt, G.swim.cruise * 0.6); if (dist3(f.spot, f.h) < 1.1) f.spot = nextSpot(f.spots, f.spot); sync(f); return; }
    if (!met) { swim(f, { x: f.h.x + f.h.dx, y: f.h.y, z: f.h.z + f.h.dz }, dt, 0.4); sync(f); return; }
    e.dormant = false;
    engage(e);
  }
  if (e.dive.phase === 'wet' && Number.isFinite(e.fightT)) e.fightT += dt;
  if (e.mode === 'split') { raging(f, dt); return; }
  const fighting = state.enemyGrace <= 0 && !state.intro?.full;
  if (fighting) {
    for (const k of ['huntIn', 'quakeIn', 'ventsIn', 'summonIn', 'shieldIn']) f[k] -= dt;
    if (!f.jetRun) f.jetsIn -= dt;
    if (f.mud) f.mudIn -= dt;
  }
  if (e.mode === 'attack') attacking(f, dt);
  else {
    e.cool = Math.max(0, (e.cool ?? 0) - dt);
    cruising(f, dt);
    if (fighting && e.cool <= 0 && !f.jetRun) choose(f);
  }
  sync(f);
  if (e.stage < 3 && e.hp <= e.hpFloor && e.mode !== 'attack') rage(f);
}

// whom he goes after: who hit him last, else the nearest of the players to his head
function targetOf(f) {
  const e = f.e, list = players();
  if (e.target?.here && list.includes(e.target)) return e.target;
  return list.reduce((best, p) => !best || dist3(chest(p), f.h) < dist3(chest(best), f.h) ? p : best, null) ?? player;
}
// Swimming between attacks: over the hilltops and the deep (his swim spots), now and then after
// whom he goes after (a hunt, ending in a bite once his head is near them); up high while his jets run
function cruising(f, dt) {
  const e = f.e, p = targetOf(f), S = G.swim;
  if (f.jetRun) {
    f.goal = { x: f.goal?.x ?? f.h.x, y: surfaceOf(f) - S.top - 0.4, z: f.goal?.z ?? f.h.z };
    if (Math.hypot(f.goal.x - f.h.x, f.goal.z - f.h.z) < 1.2 || !f.goal.high) f.goal = { ...nextSpot(f.spots.filter(s => s.high), f.spot), high: true };
    f.goal.y = surfaceOf(f) - S.top - 0.4;
    swim(f, f.goal, dt, S.cruise);
    return;
  }
  if (f.huntIn <= 0 && p) {
    swim(f, chest(p), dt, e.profile.chase * S.approach / S.cruise);
    return;
  }
  if (!f.spot || dist3(f.spot, f.h) < 1.1) { f.spot = nextSpot(f.spots, f.spot); f.spotT = 0; }
  if ((f.spotT = (f.spotT ?? 0) + dt) > 7) f.spot = nextSpot(f.spots, f.spot);
  swim(f, f.spot, dt, e.profile.chase);
}

// The attack he starts now, if any: what is due first (the jets and the earthquake before anything
// else), then a bite once his head is near whom he hunts, else a shockwave now and then
function choose(f) {
  const e = f.e, p = targetOf(f);
  if (!p) return;
  const near = dist3(chest(p), f.h) < G.bite.from + 0.3;
  const due = { quake: f.quakeIn <= 0, vents: f.ventsIn <= 0, jets: f.jetsIn <= 0 && !f.jetRun, shield: f.shieldIn <= 0,
    summon: f.summonIn <= 0 && summonCount(e.stage, f.minions.length) > 0 };
  const no = barred({ phase: e.stage, due, near });
  const order = ['jets', 'quake', 'shield', 'vents', 'summon'];
  let name = order.find(n => !no.has(n));
  if (!name && !no.has('bite') && f.huntIn <= 0) name = 'bite';
  if (!name && !no.has('wave') && Math.random() < 0.004) name = 'wave';
  if (name) start(f, name, p);
}
function start(f, name, p) {
  const e = f.e;
  Object.assign(e, { mode: 'attack', attack: index(name), t: 0, attacks: (e.attacks ?? 0) + 1, target: p, bit: false });
  f.lock = null; f.slam = null;
  if (name === 'quake') {
    // down onto the bottom near them: the lowest floor within a few cells of them, off them
    const g = groundOf(f);
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = p.x + Math.cos(a) * 2.4, z = p.z + Math.sin(a) * 2.4, [x0, z0, x1, z1] = boxOf(f);
      if (x < x0 + 0.7 || z < z0 + 0.7 || x > x1 - 0.7 || z > z1 - 0.7) continue;
      const y = g(x, z);
      if (!best || y < best.y) best = { x, y, z };
    }
    f.slam = best ?? { x: p.x, y: g(p.x, p.z), z: p.z };
  }
}
function attacking(f, dt) {
  const e = f.e, a = attackOf(e), p = e.target?.here || e.target === player ? e.target : targetOf(f);
  e.t += dt;
  const name = a.name, S = G.swim;
  if (name === 'bite') {
    if (e.t < a.trackUntil) {   // drawing back, his eyes on them
      swim(f, chest(p), dt, S.cruise * 0.35, S.turn * 1.6);
      const c = chest(p), dx = c.x - f.h.x, dy = c.y - f.h.y, dz = c.z - f.h.z, l = Math.hypot(dx, dy, dz) || 1;
      f.lock = { x: c.x + dx / l * 0.4, y: c.y + dy / l * 0.4, z: c.z + dz / l * 0.4 };
    } else if (e.t < a.hitAt + 0.15 && f.lock) {   // the lunge, straight at where they were
      const dx = f.lock.x - f.h.x, dy = f.lock.y - f.h.y, dz = f.lock.z - f.h.z, l = Math.hypot(dx, dy, dz), step = Math.min(l, G.bite.lunge * dt);
      if (l > 1e-3) { Object.assign(f.h, { dx: dx / l, dy: dy / l, dz: dz / l }); f.h.x += dx / l * step; f.h.y += dy / l * step; f.h.z += dz / l * step; }
      f.h.y = Math.max(f.h.y, groundOf(f)(f.h.x, f.h.z) + 0.3);
      f.speed = G.bite.lunge;
    } else swim(f, f.spot ?? chest(p), dt, S.cruise);   // and away again
    if (!e.bit && e.t >= a.hitAt) {
      e.bit = true;
      sfx('chomp', { at: f.h, pitch: 0.5, volume: 0.9 });
      for (const b of players()) if (dist3(chest(b), f.h) < G.bite.reach + (b.r ?? 0.3)) strike(f, b, a);
      f.huntIn = between(S.wander);
      f.spot = nextSpot(f.spots, f.spot);
    }
  } else if (name === 'wave') {   // down to the bottom, the ring runs out from under his head (game/quakes.js)
    const g = groundOf(f)(f.h.x, f.h.z);
    if (e.t < a.hitAt) swim(f, { x: f.h.x + f.h.dx, y: g + 0.6, z: f.h.z + f.h.dz }, dt, 1.6, S.turn * 1.5);
    else f.speed = 0;
  } else if (name === 'quake') {
    if (e.t < a.hitAt) swim(f, { x: f.slam.x, y: f.slam.y + HEAD + 0.05, z: f.slam.z }, dt, S.approach * 1.2, S.turn * 1.8);
    else f.speed = 0;   // (lying on the bottom, exposed: core/enemies.js `exposed`)
    if (!e.bit && e.t >= a.hitAt) { e.bit = true; quaking(f); }
  } else {
    // the casts: hanging in the water, turning slowly; the jets from up high
    const high = name === 'jets' ? { x: f.h.x, y: surfaceOf(f) - S.top - 0.4, z: f.h.z } : { x: f.h.x + f.h.dx, y: f.h.y, z: f.h.z + f.h.dz };
    swim(f, high, dt, name === 'jets' ? S.cruise : 0.6);
    if (!e.bit && e.t >= a.hitAt) { e.bit = true; cast(f, name, p); }
  }
  if (e.t >= a.attackTime) {
    Object.assign(e, { mode: 'chase', t: 0, cool: e.profile.cooldown });
    if (name === 'quake') f.quakeIn = between(G.quake.every);
  }
}
function strike(f, b, a) {
  const e = f.e, dx = b.x - f.h.x, dz = b.z - f.h.z, l = Math.hypot(dx, dz) || 1;
  hitBody(b, { ...blowOf(e.profile, a), by: attacker(e) }, f.h.x, f.h.z, dx / l, dz / l);
}
// the attacks that call something: at their hit frame
function cast(f, name, p) {
  const e = f.e;
  if (name === 'vents') {
    f.ventsIn = between(G.vents.every);
    const floors = (state.map?.floors ?? []).filter(g => (!state.map.arena || g.encounter) && !g.kind).map(g => ({ x: g.x + 0.5, y: floorY(g, 0.5, 0.5), z: g.z + 0.5 }));
    const n = G.vents.count[0] + Math.floor(Math.random() * (G.vents.count[1] - G.vents.count[0] + 1)) + (e.stage > 2 ? 1 : 0);
    for (const s of ventSpots(floors, p.x, p.z, n, f.seed + e.attacks * 31)) e.vents.push({ n: ++f.vented, x: s.x, y: s.y, z: s.z, t: 0, bombs: 0, seed: (f.seed + f.vented * 977) >>> 0 });
    setStatus(tr('{name} breaks the floor open!', { name: enemyName(e.profile) }));
    sfx('rumble', { at: p, pitch: 0.6, volume: 0.9 });
  } else if (name === 'summon') {
    f.summonIn = G.squirtles.every[e.stage - 1];
    summon(f, p);
  } else if (name === 'shield') {
    f.shieldIn = between(G.shield.every);
    e.shield = G.shield.time;
    setStatus(tr('{name} wraps himself in a shield of air and water!', { name: enemyName(e.profile) }));
    sfx('whirl', { at: e, pitch: 0.6, volume: 0.9 });
  } else if (name === 'jets') {
    const J = G.jets;
    f.jetRun = { n: J.volleys[0] + Math.floor(Math.random() * (J.volleys[1] - J.volleys[0] + 1)), i: -1, t: 0, seed: f.seed + e.attacks * 101 };
    setStatus(tr('{name} calls the jets!', { name: enemyName(e.profile) }));
    sfx('tidecall', { at: e, pitch: 0.5, volume: 0.9 });
  }
}

// The earthquake: he slams his body onto the bottom; who stands on the ground is thrown off balance
// (slowed, the weapon too, sliding away from where he struck), who is in a jump is not
function quaking(f) {
  const e = f.e, Q = G.quake, at = f.slam;
  quake(0.05); tremor.a = Math.max(tremor.a, 0.05);
  sfx('thud', { at, pitch: 0.35, volume: 1 }); sfx('rumble', { at, pitch: 0.4, volume: 1 });
  setStatus(tr('{name} makes the earth quake!', { name: enemyName(e.profile) }));
  const blow = { ...blowOf(e.profile, { power: 0.15, knock: 0, hop: 0, reason: msg('Thrown off balance by the earthquake!') }), by: attacker(e),
    slow: { time: Q.stagger, slow: Q.slow, weapons: true, source: 'quake' } };
  for (const p of players()) {
    if (p.grounded === false || p.ragdoll) continue;
    const dx = p.x - at.x, dz = p.z - at.z, l = Math.hypot(dx, dz) || 1;
    hitBody(p, { ...blow, push: { speed: Q.slide, time: Q.slideTime } }, at.x, at.z, dx / l, dz / l);
  }
}

// --- the volcanoes ----------------------------------------------------------------------------------

const LAVA_BOMB = { kind: 'fireball', speed: 3.6, radius: 0.2, range: 40, lob: 9, blast: 0.85, muzzle: [0, 0.25, 0] };
function stepVents(f, dt) {
  const e = f.e, C = G.vents.column;
  for (const v of e.vents) {
    const was = ventPhase(v);
    v.t += dt;
    const now = ventPhase(v);
    if (now === 'erupt' && was === 'warn') { sfx('fireball', { at: v, pitch: 0.4, volume: 1 }); sfx('rumble', { at: v, pitch: 0.7, volume: 0.6 }); }
    if (now !== 'erupt' || e.mode === 'dead') continue;
    // its lava bombs, lobbed onto the floor round it
    const due = Math.floor((v.t - G.vents.warn) / G.vents.bomb) + 1;
    for (; v.bombs < due; v.bombs++) bomb(f, v);
    // the column burning up through the water over it
    for (const p of players()) {
      if (!inColumn(v, p.x, p.y, p.z)) continue;
      const key = `${v.n}:${p.slot ?? 'me'}`, last = f.burnt.get(key) ?? -Infinity;
      if (v.t - last < C.tick) continue;
      f.burnt.set(key, v.t);
      const dx = p.x - v.x, dz = p.z - v.z, l = Math.hypot(dx, dz) || 1;
      hitBody(p, { ...blowOf(e.profile, { power: C.power, knock: 2, hop: 2, reason: msg("Burnt by Umbra's volcano!") }), by: attacker(e), pop: C.pop },
        v.x, v.z, dx / l, dz / l);
    }
  }
  e.vents = e.vents.filter(v => ventPhase(v) !== 'done');
}
function bomb(f, v) {
  const e = f.e, a = attackOf({ ...e, mode: 'attack', attack: index('vents') }), d = bombAt(v, v.bombs, v.seed);
  const tx = v.x + d.dx, tz = v.z + d.dz, ty = groundOf(f)(tx, tz);
  const pr = launch({ x: v.x, y: v.y, z: v.z, yaw: 0 }, LAVA_BOMB, { x: tx, y: ty, z: tz });
  Object.assign(pr, { blow: { ...blowOf(e.profile, a), by: attacker(e) }, profile: e.profile, thrower: e });
  addProjectile(pr);
  relay.launch?.(pr, e);
}

// --- the jets ----------------------------------------------------------------------------------------

function stepJets(f, dt) {
  const e = f.e, run = f.jetRun, J = G.jets;
  if (!run) { e.jets = null; return; }
  if (e.mode === 'dead') { f.jetRun = null; e.jets = null; return; }
  run.t += dt;
  const span = J.warn + J.blast + J.gap;
  if (run.i < 0 || run.t >= span) {   // the next volley: at whom it is aimed, where it comes from
    run.i++; run.t = 0; run.hit = new Set();
    if (run.i >= run.n) { f.jetRun = null; e.jets = null; f.jetsIn = between(J.every); return; }
    const list = players(), p = list[Math.floor(Math.random() * list.length)] ?? player;
    run.list = jetVolley(run.seed + run.i * 17, p.x, p.z, boxOf(f)).map(j => j.kind === 'wall' ? { ...j, y: p.y + 0.55 } : { ...j, floor: groundOf(f)(j.x, j.z) });
    sfx('gulp', { at: p, pitch: 0.5, volume: 0.6 });
  }
  e.jets = { i: run.i, t: run.t, list: run.list };
  if (run.t < J.warn || run.t >= J.warn + J.blast) return;
  if (!run.blasted) { run.blasted = run.i; sfx('spray', { at: e, pitch: 0.45, volume: 1 }); }
  if (run.blasted !== run.i) { run.blasted = run.i; sfx('spray', { at: e, pitch: 0.45, volume: 1 }); }
  const g = groundOf(f);
  for (const p of players()) {
    if (run.hit.has(p) || p.ragdoll) continue;
    const j = run.list.find(j => inJet(j, p, j.y ?? 0, g, boxOf(f)));
    if (!j) continue;
    run.hit.add(p);
    const down = j.kind === 'down', D = down ? J.down : J, [wx, wz] = down ? [p.x - j.x, p.z - j.z] : jetWay(j.side), l = Math.hypot(wx, wz) || 1;
    const blow = { ...blowOf(e.profile, { power: D.power, knock: 0, hop: 0, reason: msg("Hit by Umbra's jet!") }), by: attacker(e), daze: D.daze,
      ...!down && { push: { speed: J.push, time: J.pushTime } } };
    hitBody(p, blow, p.x - wx / l, p.z - wz / l, wx / l, wz / l);
  }
}

// --- the mud (phase 3) -------------------------------------------------------------------------------

function stepMud(f, dt) {
  const e = f.e, m = f.mud;
  if (!m) { e.mudY = NaN; return; }
  m.t += dt;
  if (e.mode !== 'dead' && f.mudIn <= 0) {
    f.mud = nextMudStep(m);
    f.mudIn = G.mud.rise + between(G.mud.hold);
    setStatus(f.mud.step > m.step ? tr('The mud is rising!') : tr('The mud sinks back a little'));
    if (f.mud.step > m.step) sfx('gulp', { at: e, pitch: 0.35, volume: 0.9 });
  }
  const level = mudLevel(f.mud);
  e.mudY = f.reef && level > 0.02 ? mudWorldY(f.mud, f.reef.low) : NaN;
  if (e.mode === 'dead' && level <= 0.02) f.mud = null;
}

// --- his squirtles -------------------------------------------------------------------------------------

function summon(f, p) {
  const e = f.e, kind = ENEMY_KINDS[e.stage >= 3 ? 'murksquirtle' : 'deepsquirtle'], n = summonCount(e.stage, f.minions.length);
  if (!n) return;
  const at = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(f.h.x - p.x, f.h.z - p.z), profile: { radius: 0.5 } };
  const list = minionFloors(at, kind, n, umbras.filter(b => living(b) && !b.host), { ahead: 2, within: 6 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, Math.atan2(p.x - s.x - 0.5, p.z - s.z - 0.5), f.n);
    m.cool = 0.8 + Math.random();
    return m;
  });
  umbras.push(...list); f.minions.push(...list);
  if (list.length) summonFx({ x: f.h.x, y: f.h.y, z: f.h.z }, list, e.stage >= 3 ? 'mud' : 'rings');
}

// --- between the phases, and the end ----------------------------------------------------------------

function rage(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', t: 0, speed: 0, shield: G.rage + G.appear, pose: { clip: 'rage', t: 0 } });
  f.jetRun = null; e.jets = null;
  setStatus(tr('{name} rages!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: 0.55 });
}
function raging(f, dt) {
  const e = f.e;
  e.t += dt; e.pose = { clip: 'rage', t: e.t };
  // round in a slow loop where he is
  const a = e.t * 1.6;
  swim(f, { x: f.h.x + Math.cos(a) * 2, y: f.h.y + 0.2 * Math.sin(a), z: f.h.z + Math.sin(a) * 2 }, dt, 1.2, 3);
  sync(f);
  if (e.t < G.rage) return;
  e.stage++;
  e.profile = enemyProfile(STAGE_PROFILES.umbra[e.stage - 1], e.level);
  Object.assign(e, { mode: 'chase', attack: 0, t: 0, cool: 0.8, shield: G.appear, pose: undefined, hpFloor: phaseFloor(e.profile.hp, e.stage) });
  f.jetsIn = G.jets.first; f.shieldIn = G.shield.first; f.summonIn = Math.min(f.summonIn, G.squirtles.first);
  if (e.stage === 3 && f.reef) { f.mud = { step: -1, from: 0, t: 0 }; f.mudIn = G.mud.first; }
}
// beaten: he sinks onto the bottom, his body after him; the water drains, so does his mud; his
// volcanoes and jets stop and his squirtles go with him
function dying(f, dt) {
  const e = f.e;
  if (!f.over) {
    f.over = true;
    f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
    e.vents = []; f.jetRun = null; e.jets = null; e.shield = 0;
    if (f.mud) f.mud = { step: -1, from: mudLevel(f.mud), t: 0 };
    if (e.dive.phase === 'wet' || e.dive.phase === 'flood') Object.assign(e.dive, { phase: 'drain', t: 0 });
  }
  // (the whole of him, his trail sinking onto the ground; his head the first of it)
  settleTrail(f.trail, groundOf(f), dt);
  const head = f.trail.pts[0];
  Object.assign(f.h, { x: head.x, y: head.y, z: head.z });
  f.speed = 0;
  const e2 = f.e;
  Object.assign(e2, { x: f.h.x, y: f.h.y - HEAD, z: f.h.z });
  placeBody(f);
}

// what of him a dev command shows (game/devcommands.js /air, /mud): his fight
export const umbraFight = () => fights[0] ?? null;
// /air <s>: that much air left; /mud: the mud's next step at once (phase 3 or not)
export function devAir(s) { const f = umbraFight(); if (!f || !Number.isFinite(f.e.fightT)) return false; f.e.fightT = G.air - s; return true; }
export function devMud() {
  const f = umbraFight();
  if (!f?.reef) return false;
  f.mud ??= { step: -1, from: 0, t: 0 };
  f.mudIn = 0;
  return true;
}
