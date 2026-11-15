// Woppylava's fight (core/woppylava.js has the rules, docs/bosses.md tells it): this cube's Woppylava
// and the fire creatures he calls, in one list (`woppylavas`), so they fight, collide, travel and get
// shown to friends like any enemy. Each Woppylava has a fight of his own here: { e (him), timers,
// the walls, the hands and the bombs running, the volcano's and the lava's clocks, minions }. A dev
// spawn (game/devspawn.js) gets one too: out of his arena there is no volcano and no lava.
//
// The shared enemy AI starts his attacks (game/enemyai.js, `anchored`: it never moves him); this
// walks him (`walk`: straight at whom he fights, over everything, the lava too: he is too big for the
// others' ways, and his feet follow the ground), says which attacks may start (`barred`) and carries
// out his casts at their hit frames: the eruption (lava bombs, projectiles lobbed out of his crater,
// their landing spots glowing), the walls of lava and the lava hands (who they catch is hurt here:
// only this game runs them, its blows reach friends through hitBody). In phase 2 his summon spits
// fire creatures out of his crater. At two thirds of his health he rises (mode 'split', posed in his
// clip `rise`, nothing hurting him): the volcano comes up out of the middle of his arena (his
// `mountain`, a core/mountains.js spec: game/mountains.js raises it in every game), then the lava over
// the basin (his `tide`: game/tide.js), then the fuse burns (`fuse`, s left) and once it is out the
// volcano erupts (`burst`, s since).
//
// Sent to friends with his row (net/protocol.js): `stage`, `tide`, `mountain`, `fuse`, `burst`,
// `stir`, `seed`, his walls, hands and bomb marks; every game draws them (render/woppylavafx.js),
// shows the fuse (game/fusebar.js) and lets the lava stand where it does (`lavaOf`, game/tide.js).
import { state, player, setStatus } from './state.js';
import { WOPPYLAVA, STAGE_PROFILES, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName, blowOf } from '../core/enemies.js';
import { WOPPYLAVA_FIGHT as G, phaseFloor, summonCount, barred, stirOf, wallVolley, wallAt, wallSpan, inWall, wallWay,
  handVolley, handPhase, handLands, handSpan, trackHand, underHand, bombSpots, islesOf, lavaSurfaces } from '../core/woppylava.js';
import { LH, N } from '../core/constants.js';
import { stepMountain, bringDown, planMountain, freeCells } from '../core/mountains.js';
import { mountainPlan } from './mountains.js';
import { launch } from '../core/projectiles.js';
import { muzzleAt } from '../core/beams.js';
import { groundAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { drawWoppylavaFx, clearWoppylavaFx } from '../render/woppylavafx.js';
import { fuseBar } from './fusebar.js';
import { living, engage, leave, minionFloors, minion, sweep, players, nearest } from './bossfight.js';
import { hitBody, attacker } from './enemycombat.js';
import { addProjectile } from './projectiles.js';
import { summonFx, quake, tremor } from './juice.js';
import { relay } from '../net/online.js';
import { narrate } from './narrator.js';
import { sfx } from '../audio/sfx.js';
import { tr, msg } from '../i18n/i18n.js';

export let woppylavas = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();
const index = name => WOPPYLAVA.attacks.findIndex(a => a.name === name);
const AWAKE = new Set(['chase', 'attack']);

export function resetWoppylavas() {
  removeEnemyViews(woppylavas);
  woppylavas = []; fights = [];
  addWoppylavas(enemySpots(state.map, WOPPYLAVA).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? WOPPYLAVA, i)));
}
// Woppylavas to fight: this cube's, or spawned with the dev tools
export function addWoppylavas(list) {
  for (const e of list) {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    Object.assign(e, { stage: 1, hpFloor: phaseFloor(e.profile.hp, 1), mountain: null, tide: 0, fuse: -1, burst: -1, stir: 0, seed,
      walls: [], hands: [], marks: [] });
    const f = { e, awake: false, rise: -1, flood: -1, eruptIn: G.erupt.first, wallsIn: G.walls.first, handsIn: G.hands.first, summonIn: Infinity,
      wallRun: null, handRun: null, bombs: [], minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false, kinds: 0 };
    e.barred = barred({ phase: 1 });
    e.summon = a => summon(f, a);
    e.cast = a => cast(f, a);
    fights.push(f); woppylavas.push(e);
  }
}
export function detachWoppylavas() { const list = woppylavas; woppylavas = []; fights = []; return list; }

export function updateWoppylavas(dt) {
  for (const f of fights) run(f, dt);
  for (const e of woppylavas) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  stepEnemies(woppylavas.filter(e => e.mode !== 'gone' && e.mode !== 'split'), dt);
  for (const f of fights) walk(f, dt);
  woppylavas = sweep(woppylavas, dt);
  fights = fights.filter(f => woppylavas.includes(f.e));
}

// the arena's box the walls run in and the hands come down in (his lava's), or the cube's inside
const boxOf = () => state.map?.tide?.box ?? [2, 2, N - 2, N - 2];

function run(f, dt) {
  const e = f.e, a = e.mode === 'attack' ? attackOf(e) : null;
  f.minions = f.minions.filter(m => living(m) && woppylavas.includes(m));
  volcano(f, dt);
  bombs(f, dt);
  walls(f, dt);
  hands(f, dt);
  if (e.mode === 'dead') { dying(f); return; }
  if (e.mode === 'split') { rising(f, dt); return; }
  if (!f.awake && (AWAKE.has(e.mode) || e.hp < e.profile.hp)) wake(f);
  if (f.awake && !e.staged) {
    f.eruptIn -= dt; f.wallsIn -= dt; f.handsIn -= dt;
    if (e.stage === 2) f.summonIn -= dt;
  }
  if (e.stage === 1) e.stir = Math.round(stirOf(e.hp, e.profile.hp) * 100) / 100;
  // an attack he starts sets its own clock
  if (a && f.started !== e.attacks) {
    f.started = e.attacks;
    if (a.name === 'erupt') { f.eruptIn = between(G.erupt.every); rumble(e, 0.5 + 0.5 * e.stir); }
    if (a.name === 'walls') f.wallsIn = between(G.walls.every);
    if (a.name === 'hands') f.handsIn = between(G.hands.every);
  }
  e.barred = barred({ phase: e.stage, eruptDue: f.eruptIn <= 0, wallsDue: f.wallsIn <= 0, handsDue: f.handsIn <= 0,
    summonDue: f.summonIn <= 0 && summonCount(e.stage, f.minions.length) > 0, wallsBusy: !!f.wallRun, handsBusy: !!f.handRun });
  // (while his volcano still rises he waits, watching: no blow, no cast, no step onto its rising road)
  if (rising_(e)) e.barred = new Set(WOPPYLAVA.attacks.map(a => a.name));
  if (e.stage < 2 && e.hp <= e.hpFloor) rise(f);
}
// is his volcano coming up (cracking or rising) now?
const rising_ = e => !!e.mountain && (e.mountain.phase === 'crack' || e.mountain.phase === 'rise') && e.mode !== 'dead';
// into the fight: from now on his fight walks him (the AI only starts his attacks)
function wake(f) {
  f.awake = true;
  f.e.anchored = true;
}
// the ground shakes as he erupts, harder the closer the volcano under the floor is to waking
function rumble(e, k) {
  quake(0.02 + 0.03 * k); tremor.a = Math.max(tremor.a, 0.02 + 0.03 * k);
  sfx('rumble', { at: e, pitch: 0.5, volume: 0.6 + 0.4 * k });
}

// --- walking ------------------------------------------------------------------------------------------

// the ground under him: the highest under his feet (his middle and round it), or the lava where it
// stands higher (he wades in it a little)
function groundUnder(x, z) {
  let h = -Infinity;
  for (const [dx, dz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) h = Math.max(h, groundAt(x + dx, z + dz, 99, 99).h);
  const s = standingAt(x, z);
  if (s && s.y - 0.25 > h) h = s.y - 0.25;
  return h;
}
function walk(f, dt) {
  const e = f.e, W = G.walk;
  if (!f.awake || e.staged || e.mode === 'gone') return;
  const g = groundUnder(e.x, e.z);
  if (Number.isFinite(g)) e.y += Math.max(-W.climb * dt, Math.min(W.climb * dt, g - e.y));
  floorUnder(e);
  if (e.mode !== 'chase' || e.stun > 0 || state.devPassive || rising_(e)) { if (e.mode !== 'attack') e.speed = 0; return; }
  const p = e.target?.here || e.target === player ? e.target : nearest(e), dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  let turn = ((want - e.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  turn = Math.max(-W.turn * dt, Math.min(W.turn * dt, turn));
  e.yaw += turn;
  // (a hero a turn of the road above or below him: he comes closer, onto their turn, not to stand over them)
  const stop = Math.abs(p.y - e.y) > 1.2 ? W.close : W.stop;
  if (d <= stop) { e.speed = 0; return; }
  const speed = W.speed[e.stage - 1] * Math.max(0, Math.cos(want - e.yaw)), step = Math.min(d - stop, speed * dt);
  const [x0, z0, x1, z1] = boxOf(), r = e.profile.radius * 0.6;
  e.x = Math.max(x0 + r, Math.min(x1 - r, e.x + Math.sin(e.yaw) * step));
  e.z = Math.max(z0 + r, Math.min(z1 - r, e.z + Math.cos(e.yaw) * step));
  e.speed = step / dt;
}
// (for the summons and the AI: the floor nearest under him)
function floorUnder(e) {
  const c = Math.floor(e.z) * N + Math.floor(e.x), col = state.map?.cols?.[c];
  if (!col?.length) return;
  let best = col[0], gap = Infinity;
  for (const g of col) { const d = Math.abs(g.top * LH - e.y); if (d < gap) { gap = d; best = g; } }
  e.f = best;
}

// --- the casts ------------------------------------------------------------------------------------------

function cast(f, a) {
  const e = f.e, ps = players().map(p => ({ x: p.x, z: p.z }));
  if (a.cast === 'erupt') erupt(f, a, ps);
  else if (a.cast === 'walls') {
    const p = ps[Math.floor(Math.random() * ps.length)] ?? player;
    f.wallRun = { t: 0, list: wallVolley(e.seed + e.attacks * 31, e.stage, p, boxOf()).map(w => ({ ...w, n: ++f.n })), hit: new Set() };
    setStatus(tr('{name} sends a wall of lava! Find the gap!', { name: enemyName(e.profile) }));
    sfx('rumble', { at: e, pitch: 0.7, volume: 1 });
  } else if (a.cast === 'hands') {
    const list = players();
    f.handRun = { t: 0, list: handVolley(e.seed + e.attacks * 53, e.stage, list.map(p => ({ x: p.x, z: p.z })), boxOf())
      .map(h => ({ ...h, n: ++f.n, t: 0, who: h.follow >= 0 ? list[h.follow] : null })), hit: new Set() };
    setStatus(tr('Lava hands are reaching down! Keep moving!'));
    sfx('whirl', { at: e, pitch: 0.4, volume: 0.8 });
  }
}

// The eruption: his crater blasts lava bombs out, lobbed onto the floor round the heroes and
// anywhere in the fight, each landing `flight` s after it left (its spot glowing meanwhile)
function erupt(f, a, ps) {
  const e = f.e, from = muzzleAt(e, a.muzzle);
  const floors = (state.map?.floors ?? []).filter(g => (!state.map.arena || g.encounter) && !g.kind).map(g => ({ x: g.x + 0.5, z: g.z + 0.5 }));
  const blow = { ...blowOf(e.profile, a), by: attacker(e) };
  for (const b of bombSpots(e.seed + e.attacks * 17, e.stage, ps, floors)) {
    const y = groundUnder(b.x, b.z) + 0.25;
    if (!Number.isFinite(y)) continue;
    const d = Math.hypot(b.x - from.x, b.z - from.z);
    const spec = { kind: 'fireball', speed: Math.max(0.5, d / b.flight), radius: 0.24, range: 60, lob: 9, blast: G.erupt.r, muzzle: a.muzzle };
    const pr = launch(e, spec, { x: b.x, y, z: b.z });
    Object.assign(pr, { blow, profile: e.profile, thrower: e });
    addProjectile(pr);
    relay.launch?.(pr, e);
    f.bombs.push({ n: ++f.n, x: b.x, y, z: b.z, t: 0, flight: Math.max(0.45, d / spec.speed) });
  }
  setStatus(tr('{name} erupts!', { name: enemyName(e.profile) }));
  sfx('fireball', { at: e, pitch: 0.35, volume: 1 });
  rumble(e, 0.6 + 0.4 * e.stir);
}
function bombs(f, dt) {
  for (const b of f.bombs) b.t += dt;
  f.bombs = f.bombs.filter(b => b.t < b.flight + 0.4);
  f.e.marks = f.bombs.map(b => ({ n: b.n, x: b.x, y: b.y, z: b.z, t: b.t, flight: b.flight }));
}

// The walls of lava rolling across the arena: who is in one's band (not its gap) is hurt once by it,
// set on fire, knocked down and thrown along
function walls(f, dt) {
  const e = f.e, run = f.wallRun, box = boxOf();
  if (!run || e.mode === 'dead') { f.wallRun = null; e.walls = []; return; }
  run.t += dt;
  const span = wallSpan(box);
  e.walls = run.list.filter(w => run.t >= w.delay).map(w => ({ n: w.n, side: w.side, gap: w.gap, t: run.t - w.delay }));
  if (run.list.every(w => run.t - w.delay >= span)) { f.wallRun = null; e.walls = []; return; }
  const a = WOPPYLAVA.attacks[index('walls')];
  for (const w of e.walls) {
    if (wallAt(w, w.t, box).phase !== 'roll') continue;
    for (const p of players()) {
      const key = `${w.n}:${p.slot ?? 'me'}`;
      if (run.hit.has(key) || p.ragdoll || !inWall(w, w.t, p.x, p.z, box)) continue;
      run.hit.add(key);
      const [wx, wz] = wallWay(w.side);
      hitBody(p, { ...blowOf(e.profile, a), by: attacker(e), push: { speed: G.walls.push, time: G.walls.pushTime } }, p.x - wx, p.z - wz, wx, wz);
    }
  }
}

// The lava hands: each ring follows its hero, holds still, and the hand comes down on it; who is
// under it as it lands is hurt, set on fire and knocked down
function hands(f, dt) {
  const e = f.e, run = f.handRun;
  if (!run || e.mode === 'dead') { f.handRun = null; e.hands = []; return; }
  const was = run.t;
  run.t += dt;
  const land = handLands();
  for (const h of run.list) {
    h.t = run.t;
    if (handPhase(h.t) === 'track' && h.who && living(h.who)) trackHand(h, h.who, dt);
  }
  if (was < land && run.t >= land) {
    const a = WOPPYLAVA.attacks[index('hands')];
    for (const h of run.list) {
      sfx('thud', { at: { x: h.x, y: player.y, z: h.z }, pitch: 0.5, volume: 0.8 });
      for (const p of players()) {
        if (run.hit.has(p) || p.ragdoll || !underHand(h, p.x, p.z)) continue;
        run.hit.add(p);
        const dx = p.x - h.x, dz = p.z - h.z, l = Math.hypot(dx, dz) || 1;
        hitBody(p, { ...blowOf(e.profile, a), by: attacker(e) }, h.x, h.z, dx / l, dz / l);
      }
    }
  }
  if (run.t >= handSpan()) { f.handRun = null; e.hands = []; return; }
  e.hands = run.list.map(h => ({ n: h.n, x: Math.round(h.x * 100) / 100, z: Math.round(h.z * 100) / 100, t: h.t }));
}

// a summon's hit frame (phase 2): fire creatures out of his crater onto the floors round him, as
// many as fill up to the most, a Magma-face and a Magma cat by turns
function summon(f, a) {
  const e = f.e, n = summonCount(e.stage, f.minions.length);
  f.summonIn = G.minions.every;
  if (!n) return;
  const list = [];
  for (let i = 0; i < n; i++) {
    const kind = ENEMY_KINDS[f.kinds++ % 2 ? a.summon.also : a.summon.kind];
    const [s] = minionFloors(e, kind, 1, woppylavas.filter(living).concat(list), { ahead: 2.5, within: 7 });
    if (!s) break;
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.6 + Math.random();
    list.push(m);
  }
  woppylavas.push(...list); f.minions.push(...list);
  if (list.length) summonFx(muzzleAt(e, a.summon.muzzle), list, 'embers');
}

// --- between the phases: the volcano and the lava --------------------------------------------------------

// down to two thirds of his health: he stops and rises (his clip `rise`, nothing hurting him); the
// volcano cracks open under the middle of the arena on its way
function rise(f) {
  const e = f.e;
  Object.assign(e, { mode: 'split', speed: 0, path: null, t: 0, rolling: null, shield: G.rise + G.appear, pose: { clip: 'rise', t: 0 } });
  f.rise = 0; f.wallRun = null; f.handRun = null; e.walls = []; e.hands = [];
  setStatus(tr('{name} rises! The volcano is waking up!', { name: enemyName(e.profile) }));
  sfx('morph', { at: e, pitch: 0.45 });
  rumble(e, 1);
}
function rising(f, dt) {
  const e = f.e, was = f.rise;
  f.rise += dt; e.t = f.rise; e.pose = { clip: 'rise', t: f.rise };
  if (was < G.volcano.at && f.rise >= G.volcano.at) wakeVolcano(f);
  if (f.rise < G.rise) return;
  e.stage = 2;
  e.profile = enemyProfile(STAGE_PROFILES.woppylava[1], e.level);
  Object.assign(e, { mode: 'chase', attack: 0, t: 0, cool: 0.8, shield: G.appear, pose: undefined, hpFloor: phaseFloor(e.profile.hp, 2), stir: 1 });
  Object.assign(f, { summonIn: G.minions.first, eruptIn: Math.min(f.eruptIn, 4), wallsIn: Math.max(f.wallsIn, 9), handsIn: Math.max(f.handsIn, 6) });
  engage(e);
  e.anchored = f.awake = true;
}
// The volcano comes up out of the middle of his arena (map.volcano; a dev spawn: round where he
// stands, if it fits); the lava rises once it is up
function wakeVolcano(f) {
  const e = f.e, v = state.map?.volcano;
  const spec = { n: Math.floor(Math.random() * 2 ** 30), seed: e.seed, shape: 'volcano', a: v?.a ?? e.yaw, x: v?.x ?? Math.round(e.x), z: v?.z ?? Math.round(e.z),
    phase: 'crack', t: 0, life: 1e6 };
  if (!state.map || !planMountain(state.map, spec, freeCells(state.map, !v))) return;
  if (!v) spec.any = true;
  e.mountain = spec;
}
// The volcano's clock, the lava's and the fuse's: the lava rises once the volcano is up, the fuse
// burns once the lava is up, and the volcano erupts once it is out. His death brings the volcano
// down and drains the lava.
function volcano(f, dt) {
  const e = f.e, m = e.mountain;
  if (m) {
    if (e.mode === 'dead') bringDown(m);
    const was = m.phase;
    stepMountain(m, dt);
    if (m.phase === 'rise' && was === 'crack') { setStatus(tr('A volcano is rising out of the floor!')); rumble(e, 1); }
    if (m.phase === 'up' && was !== 'up' && e.mode !== 'dead' && state.map?.tide) f.flood = 0;
    if (m.phase === 'gone') e.mountain = null;
  }
  if (e.mode === 'dead') { e.tide = 0; e.fuse = -1; return; }
  if (f.flood >= 0) {
    const was = f.flood;
    f.flood += dt;
    if (was < G.flood.after && f.flood >= G.flood.after) {
      setStatus(tr('The lava is rising! Climb the volcano!')); sfx('rumble', { at: e, pitch: 0.4, volume: 1 });
    }
    e.tide = Math.round(Math.max(0, Math.min(1, (f.flood - G.flood.after) / G.flood.rise)) * 1000) / 1000;
    if (e.tide >= 1 && e.fuse < 0 && e.burst < 0) e.fuse = G.fuse;
  }
  if (e.fuse > 0) {
    const was = e.fuse;
    e.fuse = Math.max(0, e.fuse - dt);
    if (was > 30 && e.fuse <= 30) setStatus(tr('The volcano is about to erupt!'));
    if (e.fuse <= 0) {
      e.fuse = -1; e.burst = 0;
      setStatus(tr('The volcano erupts! Find a dry spot!'));
      quake(0.12); tremor.a = Math.max(tremor.a, 0.12);
      sfx('rumble', { at: e, pitch: 0.3, volume: 1 }); sfx('fireball', { at: e, pitch: 0.25, volume: 1 });
    }
  } else if (e.burst >= 0) e.burst += dt;
}
// beaten: his fire creatures go with him; the volcano comes down and the lava drains (game/tide.js)
function dying(f) {
  const e = f.e;
  if (f.over) return;
  f.over = true;
  f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
  f.wallRun = null; f.handRun = null; f.bombs = [];
  Object.assign(e, { walls: [], hands: [], marks: [], fuse: -1, burst: -1, tide: 0, anchored: false });
}

// --- in every game: the lava as it stands, his effects drawn, the fuse ----------------------------------

// The lava over each cell (world units, NaN dry) with Woppylava `e` here and the basin's lava at
// `level` (units): the crater's pool once the volcano stands, and after the eruption the lava pouring
// down everything but the isles (core/woppylava.js lavaSurfaces); null while there is only the flat
// lava of the basin. For game/tide.js.
let isles = null;   // { key (the volcano's n), list }
export function lavaOf(e, level) {
  const plan = mountainPlan(), up = plan && e.mountain?.shape === 'volcano' && e.mountain.phase === 'up' && plan.spec.n === e.mountain.n;
  const crater = [], cells = [], road = [];
  if (up) for (const m of plan.cells.values()) {
    if (m.crater) crater.push({ c: m.c, y: m.top * LH });
    if (m.road) road.push({ c: m.c, x: m.x, z: m.z, top: m.top });
  }
  const since = e.burst >= 0 ? e.burst : NaN;
  if (!crater.length && !Number.isFinite(since)) return null;   // (only the flat lava: no surfaces of their own)
  if (Number.isFinite(since)) {
    for (const g of state.map?.floors ?? []) if (g.encounter && !g.kind) cells.push({ c: g.c, y: Math.max(...g.cs) });
    if (up && (!isles || isles.key !== plan.spec.n)) isles = { key: plan.spec.n, list: islesOf(road, e.seed) };
  }
  return lavaSurfaces({ level, box: state.map?.tide?.box, crater, cells, since, isles: up && isles?.key === plan.spec.n ? isles.list : [] });
}

// Every frame, with the enemies of the cube (ours or those we are shown; `own`: we run them): his
// effects drawn and the fuse shown; a friend's walls, hands and marks run on between his rows
let drawn = false;
const said = { key: null };
export function showWoppylava(list, dt, own = true) {
  const e = list.find(b => b.boss === 'woppylava' && b.walls);
  if (!e || !state.world) {
    if (drawn) { clearWoppylavaFx(); fuseBar(null); drawn = false; }
    return;
  }
  if (!own) {
    for (const w of e.walls) w.t += dt;
    for (const h of e.hands) h.t += dt;
    for (const b of e.marks) b.t += dt;
    if (e.fuse > 0) e.fuse = Math.max(0, e.fuse - dt); else if (e.burst >= 0) e.burst += dt;
  }
  drawn = true;
  // the robot calls the lava rising, the fuse running low and the eruption out (in every game)
  const key = `${state.cubeKey}:${e.id}`;
  if (said.key !== key) Object.assign(said, { key, flood: e.tide > 0, fuse: e.fuse > 0 && e.fuse <= 30, burst: e.burst >= 0 });
  for (const [what, now] of [['flood', e.tide > 0], ['fuse', e.fuse > 0 && e.fuse <= 30], ['burst', e.burst >= 0]]) {
    if (now && !said[what] && e.mode !== 'dead') narrate('boss', { boss: 'woppylava', what });
    said[what] = now || said[what];
  }
  const level = state.tide != null ? state.tide * LH : -Infinity;
  drawWoppylavaFx(state.world, {
    walls: e.walls, hands: e.hands, marks: e.marks, lava: lastLava, level,
    // (beaten: no more smoke and glow out of the mound or the crater as the volcano sinks)
    volcano: e.mode === 'dead' ? null : state.map?.volcano ?? null, stir: e.stir ?? 0,
    stage: e.stage ?? 1, box: boxOf(), burst: e.burst >= 0 ? e.burst : NaN,
  }, dt);
  fuseBar(e.mode !== 'dead' && e.fuse > 0 ? e.fuse : null, G.fuse);
}
// the lava surfaces game/tide.js last set (drawn over the flat lava where higher)
let lastLava = null;
export const keepLava = ys => { lastLava = ys; };
