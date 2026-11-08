// Rollie and Megalimmer's fight (core/rollie.js has the rules, docs/bosses.md tells it): this cube's
// pair and the minions they call, in one list (`rollies`), so they fight, collide, travel and get
// shown to friends like any enemy. Each pair has a fight here: { r (Rollie), m (Megalimmer), either
// null once gone, pair (their key), turns (core/rollie.js newTurns), on (the fight has started),
// due (s to each timed attack), minions, circle / dash (Megalimmer running round), sabers, sweep,
// grids, floors, side (where Rollie stands at the side) }. A dev spawn of Rollie brings Megalimmer
// along (game/devspawn.js); one of Megalimmer alone fights alone.
//
// On each: `main` (the one who goes for you now: his eyes glow, his row of the boss bar lights up),
// on Megalimmer `hidden` (0 .. 1: turned invisible) and `circling` (running round you), all three
// drawn by render/megalimmerview.js and render/enemies.js. While neither is beaten the gate is
// nobody's (`pairGate`): it goes to whoever is left once one is beaten (`guardianGate`), so it
// opens with the second.
// Movement and attacks are the shared enemy AI's (game/enemyai.js): the fight says which attacks
// may start (`barred`), carries out the casts and the summons, moves Rollie to the side (`route`)
// and runs Megalimmer round you itself (he is left out of the shared AI meanwhile, but for his
// beatings). The blades, the sweep's beam and the grid's lasers are its own: drawn by
// render/rollieview.js, and only the game that runs the enemies has them.
import { player, state, setStatus } from './state.js';
import { ROLLIE, MEGALIMMER, ROLLIE_AT, MEGA_TWISTER, ENEMY_KINDS, makeEnemy, attackOf, blowOf, enemyName } from '../core/enemies.js';
import { ROLLIE_FIGHT as G, newTurns, stepTurns, sidePoint, newSpiral, spiralStep, spiralTime, newSaber, stepSaber, sabreCuts,
  trackAim, sweepStart, beamGap, gridCells, barredFor, between } from '../core/rollie.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { drawRollieFx, clearRollieFx } from '../render/rollieview.js';
import { living, engage, leave, minionFloors, minion, sweep as sweepList, players, fitting } from './bossfight.js';
import { hitBody, attacker } from './enemycombat.js';
import { throwTwister, twisters } from './twisters.js';
import { findPath, stepEnemy, walkable, groundY } from '../physics/enemynav.js';
import { walkerOf } from '../physics/dwell.js';
import { summonFx } from './juice.js';
import { narrate } from './narrator.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

export let rollies = [];
let fights = [];
const foe = e => e.target && (e.target === player || e.target.here) ? e.target : player;
const NAMES = { rollie: ROLLIE.attacks.map(a => a.name), megalimmer: MEGALIMMER.attacks.map(a => a.name) };
const BIG = new Set(['laser', 'sabers', 'swipe', 'summon', 'pummel', 'vanish', 'stunner', 'flimmers']);

export function resetRollies() {
  removeEnemyViews(rollies);
  clearRollieFx();
  rollies = []; fights = [];
  const spots = [ROLLIE, MEGALIMMER].flatMap(k => enemySpots(state.map, k));
  addRollies(spots.filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind, i)));
}
// (dev: the checks, tests/browser/rollie.js)
export const rollieFights = () => fights;
export function detachRollies() { const list = rollies; rollies = []; fights = []; clearRollieFx(); return list; }

// Rollies and Megalimmers to fight: this cube's pair (`pair`: the arena's key), or dev spawns
export function addRollies(list) {
  const groups = new Map();
  for (const e of list) {
    const key = e.pair ?? `dev:${e.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  for (const [key, bodies] of groups) {
    let r = bodies.find(b => b.profile.species === 'rollie') ?? null, m = bodies.find(b => b.profile.species === 'megalimmer') ?? null;
    if (r && !m && !r.pair) m = partnerOf(r, MEGALIMMER);   // (a dev spawn of Rollie brings Megalimmer along)
    const f = { r, m, pair: key, gate: (r ?? m).pairGate ?? null, turns: newTurns(r ? 'rollie' : 'megalimmer'), on: false,
      due: { sweep: G.rollie.sweep.first, grid: G.rollie.grid.first, summon: G.rollie.summon.first,
        vanish: G.megalimmer.vanish.first, stunner: G.megalimmer.stunner.first, flimmers: G.megalimmer.flimmers.first },
      minions: { summon: [], stunner: [], flimmers: [] }, circle: null, dash: null, twisterIn: between(G.twisters.every),
      sabers: [], sweep: null, grids: [], floors: null, side: null, sideIn: 0, calm: G.calm, vanish: 0, seenSwap: false,
      started: {}, n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false };
    if (r && m) { r.other = m; m.other = r; }   // (each other's: their intro, game/bossreveals.js; the intro's name)
    for (const e of [r, m]) if (e) {
      Object.assign(e, { pair: key, main: e === (r ?? m), hidden: 0, circling: false });
      e.cast = a => cast(f, e, a);
      e.summon = a => summon(f, e, a);
      rollies.push(e);
    }
    fights.push(f);
  }
}
// the other of a dev spawn, beside it
function partnerOf(e, kind) {
  const s = minionFloors(e, kind, 1, rollies.filter(living), { ahead: 0, within: 5 })[0] ?? e.f;
  const b = makeEnemy({ id: `${e.id}:partner`, level: e.level, coinDrop: e.coinDrop, kind, f: s, x: s.x + 0.5, z: s.z + 0.5,
    y: e.y, yaw: e.yaw, ...(e.guardian && { guardian: true, guardianRole: e.guardianRole, bossPlaceholder: false, boss: kind.boss }) }, kind);
  if (e.dormant) b.dormant = true;
  return b;
}

export function updateRollies(dt) {
  for (const f of fights) run(f, dt);
  // (Megalimmer running round is moved by his fight, not by the shared AI, but for his beatings)
  stepEnemies(rollies.filter(e => !(e.circling && e.mode !== 'attack' && e.mode !== 'dead')), dt);
  for (const f of fights) { aim(f, dt); started(f); }
  rollies = sweepList(rollies, dt);
  fights = fights.filter(f => (f.r && rollies.includes(f.r)) || (f.m && rollies.includes(f.m)));
  drawRollieFx(fights, dt);
}

const alive = e => !!e && e.mode !== 'dead';
const role = (f, e) => {
  if (!alive(e)) return null;
  const other = e === f.r ? f.m : f.r;
  if (alive(other)) return f.turns.main === e.profile.species ? 'main' : 'side';
  return f.turns.side ? 'side' : 'main';
};
const busy = e => alive(e) && e.mode === 'attack' && BIG.has(attackOf(e).name);

function run(f, dt) {
  const { r, m } = f, bodies = [r, m].filter(alive);
  for (const k of Object.keys(f.minions)) f.minions[k] = f.minions[k].filter(b => living(b) && rollies.includes(b));
  stunners(f, dt);
  if (!bodies.length) { over(f); return; }
  // the gate is the last one's
  if (f.gate && bodies.length === 1) bodies[0].guardianGate = f.gate;
  // Megalimmer invisible: fading out, a while, fading back in (his intro fades him in itself)
  if (alive(m) && !m.staged) {
    f.vanish = Math.max(0, f.vanish - dt);
    m.hidden = f.vanish > G.vanish.fade ? Math.min(1, m.hidden + dt / G.vanish.fade) : Math.max(0, m.hidden - dt / G.vanish.fade);
  }
  if (!f.on) { wake(f, bodies); if (!f.on) return; }
  const main = bodies.find(e => role(f, e) === 'main') ?? bodies[0];
  // the turns
  if (stepTurns(f.turns, dt, main.hp, main.profile.hp, bodies.length === 2)) swapped(f);
  for (const e of bodies) e.main = role(f, e) === 'main';
  const lead = bodies.find(e => e.main) ?? null;
  f.calm = busy(lead) ? 0 : f.calm + dt;
  for (const k of Object.keys(f.due)) f.due[k] -= dt;
  // (one held where something else wants him, `staged`: an intro, the checks, is left be)
  if (alive(r) && !r.staged) rollie(f, r, dt);
  if (alive(m) && !m.staged) megalimmer(f, m, dt);
  else if (m) Object.assign(m, { circling: false, hidden: Math.max(0, m.hidden - dt / G.vanish.fade) });
}
// either one woken (hurt, struck, chasing) or a player near wakes them both
function wake(f, bodies) {
  if (state.intro || state.devPassive || bodies.some(e => e.staged)) return;
  const near = players().some(p => bodies.some(e => Math.hypot(p.x - e.x, p.z - e.z) < G.wake && Math.abs(p.y - e.y) < 3));
  const up = bodies.some(e => e.hp < e.profile.hp || e.attacks > 0 || ['chase', 'attack', 'alert'].includes(e.mode));
  if (bodies.some(e => e.dormant) && !bodies.some(e => e.hp < e.profile.hp)) return;   // (a test room's: till one is hit)
  if (!near && !up) return;
  f.on = true;
  for (const e of bodies) { e.dormant = false; if (e.mode !== 'attack') engage(e); }
}
function swapped(f) {
  const e = [f.r, f.m].find(b => alive(b) && role(f, b) === 'main');
  if (!e) return;
  sfx('morph', { at: e, pitch: e === f.r ? 0.7 : 1.2, volume: 0.6 });
  if (!f.seenSwap && alive(f.r) && alive(f.m)) { f.seenSwap = true; narrate('boss', { boss: 'rollie', what: 'swap' }); }
}

// Rollie: the main one goes for you as the AI does; at the side he goes round to the side and
// keeps there, sweeping his beam and making the floor blink now and then
function rollie(f, r, dt) {
  const main = role(f, r) === 'main', other = f.m && alive(f.m) ? f.m : null;
  const due = { sweep: f.due.sweep <= 0, grid: f.due.grid <= 0, summon: f.due.summon <= 0 };
  r.barred = barredFor('rollie', NAMES.rollie, { main, due, busy: !main && (busy(other) || f.calm < G.calm),
    room: { summon: f.minions.summon.length < G.rollie.summon.most } });
  if (main) { r.route = null; f.side = null; return; }
  if ((f.sideIn -= dt) <= 0 || !f.side) {
    f.sideIn = G.side.every;
    const p = foe(r), at = sidePoint(p, r, other && role(f, other) === 'main' ? other : null);
    f.floors ??= fitting(r.profile);
    f.side = f.floors.reduce((best, g) => Math.hypot(g.x + 0.5 - at.x, g.z + 0.5 - at.z) < Math.hypot(best.x + 0.5 - at.x, best.z + 0.5 - at.z) ? g : best, f.floors[0] ?? r.f);
  }
  r.route = () => findPath(r.f, f.side, 60, walkerOf(r)) || [r.f];
}

// Megalimmer: the main one goes for you as the AI does (and turns invisible, sends Stun flimmers,
// calls Ghost flimmers); at the side he runs round you, closer and closer, sending twisters, and
// breaks off to beat you
function megalimmer(f, m, dt) {
  const main = role(f, m) === 'main', other = f.r && alive(f.r) ? f.r : null, p = foe(m);
  const due = { vanish: f.due.vanish <= 0, stunner: f.due.stunner <= 0, flimmers: f.due.flimmers <= 0 };
  const quiet = !busy(other) && f.calm >= G.calm;
  m.barred = barredFor('megalimmer', NAMES.megalimmer, { main, due, busy: !quiet, hidden: f.vanish > 0,
    room: { stunner: f.minions.stunner.length < G.megalimmer.stunner.most, flimmers: f.minions.flimmers.length < G.megalimmer.flimmers.most } });
  m.hurtT = Math.max(0, (m.hurtT ?? 0) - dt);
  if (main || p.hp <= 0) { if (m.circling) stopCircling(f, m); return; }
  if (m.mode === 'attack') return;   // (a beating out of his run: the shared AI's)
  if (!m.circling || !f.circle) {   // (round again: from as far as he is, or after his last beating from the widest)
    Object.assign(m, { circling: true, path: null, route: null });
    f.circle = newSpiral(m, p, f.wide ? 0 : spiralTime(Math.hypot(m.x - p.x, m.z - p.z)));
    f.dash = null; f.wide = false;
  }
  const d = Math.hypot(p.x - m.x, p.z - m.z);
  if (f.dash) {   // dashing in to beat you
    f.dash.t += dt;
    if (d < G.spiral.catch && quiet && !p.ragdoll && !p.held) { beat(f, m, p); return; }
    if (f.dash.t > 2.5) { f.dash = null; f.circle = newSpiral(m, p, spiralTime(d)); return; }
    moveTo(m, p.x, p.z, G.spiral.dash, dt, G.spiral.catch * 0.8);
    return;
  }
  const c = f.circle, to = spiralStep(c, p, dt);
  moveTo(m, to.x, to.z, G.spiral.speed * 1.4, dt);
  // breaking off: midway (once), and at the end
  if (quiet && ((c.midway !== null && c.t >= c.midway) || c.t >= G.spiral.time)) {
    if (c.t >= G.spiral.time) c.end = true; else c.midway = null;
    f.dash = { t: 0 };
  }
  // twisters at you
  if ((f.twisterIn -= dt) <= 0 && quiet) {
    f.twisterIn = between(G.twisters.every);
    if (twisters.filter(w => w.e === m && !w.gone).length < G.twisters.most) twister(m, p);
  }
}
function stopCircling(f, m) {
  Object.assign(m, { circling: false, path: null, think: 0 });
  f.circle = null; f.dash = null;
  if (m.mode !== 'attack') engage(m);
}
// on along the floor towards (x, z), at most speed cells/s, stopping `stop` short; facing the way
function moveTo(e, x, z, speed, dt, stop = 0) {
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d <= stop + 1e-3) { e.speed = 0; return; }
  const step = Math.min(d - stop, speed * dt), x0 = e.x, z0 = e.z;
  stepEnemy(e, dx / d * step, dz / d * step);
  const mx = e.x - x0, mz = e.z - z0, moved = Math.hypot(mx, mz);
  if (moved > 1e-4) e.yaw = Math.atan2(mx, mz);
  e.speed = moved / Math.max(dt, 1e-4);
}
// out of his run into a beating (the shared AI carries it out); then he runs round again
function beat(f, m, p) {
  const i = m.profile.attacks.findIndex(a => a.name === 'pummel');
  Object.assign(m, { mode: 'attack', attack: i, t: 0, bit: false, leap: 0, speed: 0, path: null, yaw: Math.atan2(p.x - m.x, p.z - m.z) });
  m.attacks++;
  const end = !!f.circle?.end;
  f.dash = null;
  if (end) { f.circle = null; f.wide = true; m.circling = false; }   // (after the last one, round again from the widest)
}
function twister(m, p) {
  const yaw = m.yaw;
  m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
  throwTwister(m, G.twisters.spec, { ...blowOf(m.profile, MEGA_TWISTER), by: attacker(m) }, Math.hypot(p.x - m.x, p.z - m.z));
  m.yaw = yaw;
  sfx('whirl', { at: m, pitch: 1.3, volume: 0.5 });
}

// what each started this frame: its timer set anew (the shared AI started it)
function started(f) {
  for (const e of [f.r, f.m]) {
    if (!alive(e) || e.mode !== 'attack' || f.started[e.profile.species] === e.attacks) continue;
    f.started[e.profile.species] = e.attacks;
    const name = attackOf(e).name, who = e === f.r ? G.rollie : G.megalimmer;
    if (who[name]) f.due[name] = between(who[name].every);
  }
}

// a cast's hit frame
function cast(f, e, a) {
  if (a.cast === 'vanish') {
    f.vanish = G.vanish.time + G.vanish.fade;
    sfx('blur', { at: e, pitch: 0.6, volume: 0.9 });
    setStatus(tr('{name} turns invisible!', { name: enemyName(e.profile) }));
    return;
  }
  if (a.cast === 'sabers') {
    const p = foe(e), aim = Math.atan2(p.x - e.x, p.z - e.z);
    ROLLIE_AT.hands.forEach((h, i) => f.sabers.push({ ...newSaber(muzzleAt(e, h), aim + (i ? -0.55 : 0.55)), i,
      blow: { ...blowOf(e.profile, a), by: attacker(e) }, owner: e }));
    sfx('laser', { at: e, pitch: 0.7 });
    return;
  }
  if (a.cast === 'sweep') {
    const p = foe(e);
    f.sweep = { e, t: 0, tick: 0, aim: sweepStart(e, p, Math.random() < 0.5 ? -1 : 1), blow: { ...blowOf(e.profile, a), by: attacker(e) }, attacks: e.attacks };
    sfx('laser', { at: e, pitch: 0.5, volume: 0.8 });
    return;
  }
  if (a.cast === 'grid') {
    const blow = { ...blowOf(e.profile, a), by: attacker(e) };
    for (let i = 0; i < G.grid.waves; i++) f.grids.push({ at: i * G.grid.every, t: 0, cells: null, struck: false, blow, e });
    sfx('charge', { at: e, pitch: 1.2 });
  }
}
// a summon's hit frame: as many as fill up to the most
function summon(f, e, a) {
  const kind = ENEMY_KINDS[a.summon.kind], name = a.name, most = name === 'summon' ? G.rollie.summon.most : G.megalimmer[name].most;
  const n = Math.max(0, most - f.minions[name].length);
  if (!n) return;
  const list = minionFloors(e, kind, n, rollies.filter(living), { ahead: 1.6, within: 5 }).map(s => {
    const b = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 1.5, f.n);
    b.cool = name === 'stunner' ? 0 : 0.6 + Math.random();
    if (name === 'stunner') b.born = 0;
    return b;
  });
  rollies.push(...list); f.minions[name].push(...list);
  summonFx(muzzleAt(e, a.summon.muzzle), list, name === 'summon' ? 'embers' : 'wind');
}
// a Stun flimmer goes once it has struck (a moment after), or after its time
function stunners(f, dt) {
  for (const b of f.minions.stunner) {
    b.born += dt;
    if (b.attacks > 0 && b.mode !== 'attack') b.struck ??= 0;
    if (b.struck !== undefined) b.struck += dt;
    if (b.born > G.stunner.life || b.struck > G.stunner.linger) leave(b, 0.5);
  }
}
// both beaten: their minions go with them, the blades and beams go out
function over(f) {
  if (f.over) return;
  f.over = true;
  for (const list of Object.values(f.minions)) for (const b of list) leave(b, G.minionsLeave);
  f.sabers = []; f.sweep = null; f.grids = [];
}

// The fight's own shots, every frame after the AI: the blades fly, the sweep's beam follows, the
// grid's cells blink and are struck
function aim(f, dt) {
  const bodies = players();
  // the blades
  for (const s of f.sabers) {
    const e = s.owner, home = alive(e) ? muzzleAt(e, ROLLIE_AT.hands[s.i]) : null;
    const p = foe(e), target = { x: p.x, y: p.y + 0.9, z: p.z };
    if (!home && !s.out) { s.done = true; continue; }
    stepSaber(s, s.out ? target : null, home, dt);
    for (const b of bodies) {
      if (s.hit.has(b) || b.ragdoll || b.held || !sabreCuts(s, { x: b.x, y: b.y, z: b.z, r: b.r, h: b.h })) continue;
      s.hit.add(b);
      hitBody(b, s.blow, s.x, s.z, Math.sin(s.h), Math.cos(s.h));
      sfx('zap', { at: b, pitch: 1.4, volume: 0.6 });
    }
  }
  f.sabers = f.sabers.filter(s => !s.done && s.t < 6);
  // the sweep's beam, while his attack goes on
  const w = f.sweep;
  if (w) {
    const e = w.e, a = alive(e) && e.mode === 'attack' && e.attacks === w.attacks ? attackOf(e) : null;
    if (!a || e.t > a.hitAt + G.sweep.time) f.sweep = null;
    else {
      const p = foe(e);
      w.t += dt;
      trackAim(w.aim, { x: p.x, y: p.y + 0.6, z: p.z }, dt);
      w.from = muzzleAt(e, ROLLIE_AT.sweep);
      const want = Math.atan2(w.aim.x - e.x, w.aim.z - e.z), off = Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw));
      e.yaw += Math.max(-4 * dt, Math.min(4 * dt, off));
      if ((w.tick -= dt) <= 0) {
        for (const b of bodies) {
          if (b.ragdoll || b.held || beamGap(w.from, w.aim, { x: b.x, y: b.y + 0.7, z: b.z }) > G.sweep.radius + (b.r ?? 0.3)) continue;
          w.tick = G.sweep.tick;
          const dx = b.x - e.x, dz = b.z - e.z, d = Math.hypot(dx, dz) || 1;
          hitBody(b, w.blow, e.x, e.z, dx / d, dz / d);
        }
      }
    }
  }
  // the grid's waves
  for (const g of f.grids) {
    g.t += dt;
    if (g.t < g.at) continue;
    if (!g.cells) {
      const p = foe(g.e);
      g.cells = gridCells({ x: Math.floor(p.x), z: Math.floor(p.z) }, gridFloors(p));
      sfx('charge', { at: p, pitch: 1.6, volume: 0.5 });
    }
    if (!g.struck && g.t >= g.at + G.grid.warn) {
      g.struck = true;
      sfx('zapburst', { at: foe(g.e), pitch: 0.8 });
      for (const b of bodies) {
        if (b.ragdoll || b.held) continue;
        const c = g.cells.find(c => c.x === Math.floor(b.x) && c.z === Math.floor(b.z) && Math.abs(b.y - c.y) < G.grid.rise);
        if (c) hitBody(b, g.blow, c.x + 0.5, c.z + 0.5, 0, 0);
      }
    }
  }
  f.grids = f.grids.filter(g => g.t < g.at + G.grid.warn + G.grid.strike);
}
// the floors round p a grid may strike: those of the fight (in an arena, its fight zone) about p's level
function gridFloors(p) {
  const arena = !!state.map.arena, out = [];
  for (const g of state.map.floors) {
    if ((arena && !g.encounter) || !walkable(g, 1) || Math.hypot(g.x + 0.5 - p.x, g.z + 0.5 - p.z) > G.grid.near + 1) continue;
    const y = groundY(g, g.x + 0.5, g.z + 0.5);
    if (Math.abs(y - p.y) < G.grid.rise) out.push({ x: g.x, z: g.z, y });
  }
  return out;
}
