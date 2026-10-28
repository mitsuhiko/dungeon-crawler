// Foggery's fight (core/foggery.js has the rules, docs/bosses.md tells it): this cube's Foggery and
// the Fire-faces and Fire-cats he calls, in one list (`foggerys`), so they fight, collide, travel and
// get shown to friends like any enemy. Each Foggery has a fight of his own here: { e (him), on
// (the fight has started), lava (core/foggery.js newLava), cool (s to the next summon of
// Fire-faces), geyserIn (s until the next geysers are due), catsIn (s until he calls new cats,
// null while one lives), split (s left of curling up or rising), minions }. A dev spawn
// (game/devspawn.js) gets one too; out of his caldera there is no lava and no tower to climb.
//
// On him: `stage` (1 a frog, 2 a ball, 3 a ball over the drowned tower: his profile, core/enemies.js
// STAGE_PROFILES), `tide` (his lava, game/tide.js), `eyes` ([left, right]: 1 in his head, 0 just
// thrown, growing back), `guard` (1 while his shield holds: a Fire-cat lives) and `clock` (his
// platforms', game/movers.js; all sent to friends with his row, net/protocol.js).
// Movement and attacks are the shared enemy AI's (game/enemyai.js): before the fight he waits at the
// foot of his tower (`waiting`), up the ramp he follows a way of his own (`route`: after the player,
// or to the top in a hurry), over the drowned tower the fight holds him (`anchored`), going over the
// platforms from one to another; the fight
// says which attacks may start (`barred`) and carries out the summons at their hit frames.
// His Fire-cats leap after a player standing on a platform (`jump`) and fight on it (`deck`: the AI
// moves them over the slab, physics/enemynav.js onDeck, and the platform carries them), and leap
// back down onto the top of the tower after one who goes back there.
import { LH } from '../core/constants.js';
import { state, setStatus } from './state.js';
import { FOGGERY, FOGGERY_BALL, ENEMY_KINDS, makeEnemy, enemyProfile, attackOf, enemyName } from '../core/enemies.js';
import { FOGGERY_FIGHT as G, TOWER, PLATFORMS, LAVA, splitHp, summonCount, barred, newLava, moveLava, stepLava } from '../core/foggery.js';
import { muzzleAt } from '../core/beams.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { findPath, pathToward, walkable, onDeck } from '../physics/enemynav.js';
import { standingAt } from '../physics/fluid.js';
import { playerFloor } from './enemycombat.js';
import { removeEnemyViews } from '../render/enemies.js';
import { living, engage, leave, minionFloors, minion, sweep, players, nearest } from './bossfight.js';
import { summonFx } from './juice.js';
import { moverClock } from './movers.js';
import { groundAt, moversNow } from '../physics/collide.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

export let foggerys = [];
let fights = [];
const between = ([a, b]) => a + (b - a) * Math.random();

export function resetFoggerys() {
  removeEnemyViews(foggerys);
  foggerys = []; fights = [];
  addFoggerys(enemySpots(state.map, FOGGERY).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? FOGGERY, i)));
}
// Foggerys to fight: this cube's, or spawned with the dev tools
export function addFoggerys(list) {
  for (const e of list) {
    // (in his caldera he waits at the foot of his tower, the AI leaves him be: game/enemyai.js)
    Object.assign(e, { stage: 1, tide: 0, hpFloor: splitHp(e.profile.hp, 1), eyes: [1, 1], guard: 0, clock: 0, waiting: !!tower() });
    const f = { e, on: false, lava: newLava(), cool: G.firstSummon, geyserIn: G.geyser.first, catsIn: null, split: 0, thrown: -1,
      minions: [], n: 0, nonce: Math.random().toString(36).slice(2, 7), over: false, angle: null, settle: null };
    e.barred = barred({ phase: 1, eyes: e.eyes });
    e.summon = a => summon(f, a);
    fights.push(f); foggerys.push(e);
  }
}
export function detachFoggerys() { const list = foggerys; foggerys = []; fights = []; return list; }

export function updateFoggerys(dt) {
  for (const e of foggerys) if (e.shield > 0) e.shield = Math.max(0, e.shield - dt);
  for (const f of fights) run(f, dt);
  carry();
  stepEnemies(foggerys.filter(e => e.mode !== 'gone' && e.mode !== 'split' && !(e.jump && e.mode !== 'dead')), dt);
  for (const f of fights) float(f, dt);
  leaps(dt);
  foggerys = sweep(foggerys, dt);
  fights = fights.filter(f => foggerys.includes(f.e));
}

// his tower (his caldera, or its test room): the floor he climbs to
const tower = () => state.map?.tower ?? null;
const goal = () => { const t = tower(); return t && state.map.cols[t.goal.z * 16 + t.goal.x].at(-1); };
const onTop = e => !tower() || e.f?.tower === 'top';

function run(f, dt) {
  const e = f.e;
  e.clock = moverClock();
  e.tide = tower() ? stepLava(f.lava, dt) : 0;
  f.minions = f.minions.filter(m => living(m) && foggerys.includes(m));
  if (e.mode === 'dead') {   // his minions go with him, the lava drains away for good
    if (!f.over) {
      f.over = true; e.route = null; e.anchored = false; e.guard = 0;
      f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
      if (tower()) moveLava(f.lava, LAVA.gone, G.lava.drain);
      // (floating over the lava, he sinks onto the floor under him)
      const g = groundAt(e.x, e.z, e.y + 0.2, 0);
      f.settle = Number.isFinite(g.h) ? g.h : e.y;
    }
    if (f.settle !== null) e.y += (f.settle - e.y) * Math.min(1, dt * 3);
    return;
  }
  // his eyes: the one he throws is gone at the throw, then grows back
  if (e.stage === 1 && e.mode === 'attack' && e.bit && f.thrown !== e.attacks) {
    const eye = attackOf(e).projectile?.eye;
    if (eye !== undefined) { e.eyes[eye] = 0; f.thrown = e.attacks; }
  }
  for (let i = 0; i < 2; i++) if (e.eyes[i] < 1) e.eyes[i] = Math.min(1, e.eyes[i] + dt / G.eyes.grow);
  if (!f.on) { if (!e.staged) wake(f); return; }   // (not while his intro shows him: game/bossintro.js)
  if (e.mode === 'split') {   // curling up into his ball, or rising over the lava
    e.t += dt;
    if ((f.split -= dt) <= 0) e.stage === 1 ? curled(f) : risen(f);
    return;
  }
  const fighting = e.mode === 'chase' || e.mode === 'attack';
  if (fighting) { f.cool -= dt; if (e.stage > 1) f.geyserIn -= dt; }
  // phase 1: after the player, up the ramp (in a hurry to the top once he cannot be hurt any further)
  const top = onTop(e), stuck = e.hp <= e.hpFloor;
  if (e.stage === 1) {
    e.route = !tower() ? null : stuck && !top ? climb(e) : chase(e);
    e.hurry = stuck && !top ? G.hurry : 1;
    if (stuck && top) { split(f); return; }
  }
  // phases 2 and 3: his cats guard him; both dead, he calls new ones a while later
  if (e.stage > 1) {
    const cats = f.minions.length;
    if (cats && f.catsIn !== null) f.catsIn = null;
    else if (!cats && f.catsIn === null) {
      f.catsIn = G.catsAgain;
      setStatus(tr("{name}'s shield is down! Hit him now!", { name: enemyName(e.profile) }));
      sfx('shatter', { at: e });
    } else if (!cats) f.catsIn -= dt;
    // (and while he is about to call them: only the while before that leaves him open)
    e.guard = cats || (f.catsIn !== null && f.catsIn <= 0) ? 1 : 0;
    if (e.guard) e.shield = Math.max(e.shield ?? 0, 0.1);
    if (e.stage === 2 && stuck) { split(f); return; }
  }
  const hurrying = e.stage === 1 && e.hurry > 1;
  e.barred = hurrying ? new Set(['eyeL', 'eyeR', 'summon']) : barred({ phase: e.stage, eyes: e.eyes,
    summonDue: f.cool <= 0 && summonCount(1, f.minions.length) > 0, catsDue: f.catsIn !== null && f.catsIn <= 0,
    geyserDue: f.geyserIn <= 0 });
  // (the geysers he starts set their own clock)
  if (e.mode === 'attack' && attackOf(e).name === 'geyser' && f.geyserIn <= 0) f.geyserIn = between(G.geyser.every);
}

// Not yet in the fight: a player setting foot on the ramp of his tower (or coming close, or a hit)
// wakes him; a dormant one (a test room's, game/devspawn.js) only a hit. Then the lava starts
// rising, Fire-faces wait up the ramp, and he comes after the player.
const onRamp = p => { const s = groundAt(p.x, p.z, p.y + 0.1, 0.3).s; return s?.tower === 'ramp' || s?.tower === 'top'; };
function wake(f) {
  const e = f.e, near = players().some(p => Math.hypot(p.x - e.x, p.z - e.z) < G.wake && Math.abs(p.y - e.y) < 2);
  const climbing = !!tower() && players().some(onRamp);
  if (!(e.hp < e.profile.hp || e.attacks > 0 || ((near || climbing) && !e.dormant))) return;
  f.on = true;
  e.dormant = false; e.waiting = false;
  engage(e);
  if (tower()) {
    moveLava(f.lava, LAVA.high, G.lava.rise);
    setStatus(tr('{name} croaks: the lava is rising! Up the tower!', { name: enemyName(e.profile) }));
    sfx('rumble', { at: e });
    lieInWait(f);
  }
}
// Fire-faces waiting up the ramp, spread along the way from the bridge to the top: each waits
// where it is till the player comes up to it (it notices them closer than a Fire-face would)
function lieInWait(f) {
  const e = f.e, kind = ENEMY_KINDS.fogface, t = tower(), n = summonCount(1, f.minions.length);
  const ramp = state.map.floors.filter(g => g.tower === 'ramp' && walkable(g, kind.height));
  const taken = [];
  for (let k = 1; k <= n; k++) {
    const u = t.marks.j1 + (t.marks.t - t.marks.j1) * k / (G.lieInWait + 1);
    const s = ramp.filter(g => taken.every(o => Math.hypot(o.x - g.x, o.z - g.z) > 2)).sort((a, b) => Math.abs(a.ramp - u) - Math.abs(b.ramp - u))[0];
    if (!s) continue;
    taken.push(s);
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, Math.atan2(TOWER.mid - s.x - 0.5, TOWER.mid - s.z - 0.5) + Math.PI, f.n);
    m.profile = { ...m.profile, aggro: G.waitAggro };
    Object.assign(m, { mode: 'idle', t: 1, target: null, provoked: 0, path: null, seen: null });
    foggerys.push(m); f.minions.push(m);
  }
  sfx('fireball', { at: e, pitch: 0.7 });
}
// after the nearest player: the way to their floor, else as close to them as it gets
function chase(e) {
  return () => {
    const p = nearest(e), h = e.profile.height, to = playerFloor(h, p);
    return (to && findPath(e.f, to, 200, h)) || pathToward(e.f, p.x, p.y, p.z, 200, h) || [e.f];
  };
}
// the way up the ramp to the top of the tower
function climb(e) {
  return () => findPath(e.f, goal(), 200, e.profile.height) ?? [e.f];
}

// At a third of his health (on top) he curls up into his ball; at a sixth he rises over the
// tower and the lava floods it. Nothing hurts him meanwhile.
function split(f) {
  const e = f.e, first = e.stage === 1, time = first ? G.morphTime : G.floodTime;
  Object.assign(e, { hpFloor: first ? e.hpFloor : 0, mode: 'split', speed: 0, path: null, t: 0, shield: time + 0.4, route: null, hurry: 1 });
  f.split = time;
  if (first) {
    f.minions.forEach(m => leave(m, G.leave)); f.minions = [];
    setStatus(tr('{name} curls up into a ball!', { name: enemyName(e.profile) }));
  } else {
    if (tower()) moveLava(f.lava, LAVA.flood, G.lava.flood);
    setStatus(tower() ? tr('The lava swallows the tower! Jump onto the platforms!') : tr('{name} rises up!', { name: enemyName(e.profile) }));
    if (tower()) sfx('rumble', { at: e });
  }
}
function curled(f) {
  const e = f.e;
  e.profile = enemyProfile(FOGGERY_BALL, e.level);
  Object.assign(e, { stage: 2, attack: 0, t: 0, cool: 0.6, hpFloor: splitHp(e.profile.hp, 2), eyes: [1, 1] });
  f.catsIn = 0; f.geyserIn = G.geyser.first;
  engage(e);
}
function risen(f) {
  const e = f.e;
  Object.assign(e, { stage: 3, attack: 0, t: 0, cool: 0.8, hpFloor: 0, anchored: !!tower() });
  f.geyserIn = Math.min(f.geyserIn, G.geyser.first);
  engage(e);
}

// Phase 3 (and rising into it): he floats over the drowned top of the tower, circling, and once the
// platforms are up he goes over them from one to another (`hop`), most often to one next to the
// player's, rides it a while (`dwell` s) and goes on: on the platforms a blade reaches him too
function float(f, dt) {
  const e = f.e, t = tower();
  if (!t || e.mode === 'dead' || !(e.stage === 3 || (e.stage === 2 && e.mode === 'split'))) return;
  const O = G.orbit, H = G.hop, mid = TOWER.mid, platforms = moversNow();
  let tx, tz, ty, rate;
  if (e.mode !== 'split' && platforms.length) {
    let on = platforms.find(o => o.p === f.hop?.p);
    if (!on || (f.hop.there && (f.hop.dwell -= dt) <= 0)) on = hopTo(f, platforms);
    tx = (on.x0 + on.x1) / 2; tz = (on.z0 + on.z1) / 2; ty = on.y1 + H.lift;
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz), step = H.speed * dt;
    if (d > step) { e.x += dx / d * step; e.z += dz / d * step; e.speed = H.speed; }
    else { e.x = tx; e.z = tz; e.speed = 0; f.hop.there = true; }
    e.y += (ty - e.y) * Math.min(1, dt * 6);
  } else {
    if (f.angle === null) f.angle = Math.atan2(e.z - mid, e.x - mid);
    if (e.mode !== 'split') f.angle += O.speed * dt;
    tx = mid + Math.cos(f.angle) * O.r; tz = mid + Math.sin(f.angle) * O.r; ty = PLATFORMS.top * LH + O.lift;
    rate = Math.min(1, dt * (e.mode === 'split' ? 1.2 : 2));
    e.x += (tx - e.x) * rate; e.z += (tz - e.z) * rate; e.y += (ty - e.y) * rate;
  }
  // (for the summons and the AI: the floor of the top nearest under him)
  let best = null, gap = Infinity;
  for (const g of state.map.floors) if (g.tower === 'top') {
    const d = Math.hypot(g.x + 0.5 - e.x, g.z + 0.5 - e.z);
    if (d < gap) { gap = d; best = g; }
  }
  if (best) e.f = best;
}
// the next platform he goes to: mostly the nearest to the player but theirs (so he lands next to
// them), now and then any other
function hopTo(f, platforms) {
  const p = nearest(f.e), under = o => p.x >= o.x0 && p.x < o.x1 && p.z >= o.z0 && p.z < o.z1;
  const others = platforms.filter(o => o.p !== f.hop?.p && !under(o)), centre = o => Math.hypot((o.x0 + o.x1) / 2 - p.x, (o.z0 + o.z1) / 2 - p.z);
  const pick = Math.random() < G.hop.near ? others.sort((a, b) => centre(a) - centre(b))[0] : others[Math.floor(Math.random() * others.length)];
  const on = pick ?? platforms[0];
  f.hop = { p: on.p, there: false, dwell: between(G.hop.dwell) };
  return on;
}

// His Fire-cats on the platforms. A player standing on a platform the cat is not on: a moment
// later it leaps after them (`jump`), straight onto theirs if it is in reach (G.leap.reach, edge
// to edge), else onto the one in reach nearest to theirs, and fights them there (`deck`). One on a
// platform after a player standing on the top of the tower (out of the lava) leaps back down to
// them. A platform carries what stands on it, the living and the dead.
const L = G.leap;
const cats = () => foggerys.filter(e => e.type === 'fogcat');
function carry() {
  const decks = moversNow();
  for (const c of cats()) {
    if (c.deck && !decks.includes(c.deck)) offDeck(c);
    if (!c.deck) continue;
    const x = c.x, z = c.z;
    onDeck(c, c.x + c.deck.dx, c.z + c.deck.dz);
    // (and its feet, held where they stand: render/enemies.js poseEnemy)
    c.carried ??= { x: 0, z: 0 }; c.carried.x += c.x - x; c.carried.z += c.z - z;
  }
}
// (its platform gone: onto the floor under it, the lava holding it up)
function offDeck(c) {
  c.deck = null;
  const g = groundAt(c.x, c.z, c.y + 0.2, 0);
  if (g.s && !g.s.mover && !g.s.kind && walkable(g.s, c.profile.height)) c.f = g.s;
}
function leaps(dt) {
  const decks = moversNow();
  for (const c of cats()) {
    if (c.jump) { leaping(c, dt, decks); continue; }
    c.again = Math.max(0, (c.again ?? 0) - dt);
    const to = tower() && decks.length && living(c) && c.mode !== 'attack' && !(c.stun > 0) && !c.again ? wanted(c, decks) : null;
    if (!to) { c.leapIn = null; continue; }
    c.leapIn = (c.leapIn ?? between(L.react)) - dt;
    if (c.leapIn <= 0) { c.leapIn = null; leap(c, to, decks); }
  }
}
// where cat c should be and is not: { deck } (the platform its player stands on) or { floor, p }
// (the top of the tower, out of the lava, the player on it); null while they are in the air
function wanted(c, decks) {
  const p = c.target && players().includes(c.target) ? c.target : nearest(c);
  const g = groundAt(p.x, p.z, p.y + 0.1, 0.3);
  if (!g.s || Math.abs(g.h - p.y) > 0.15) return null;
  if (g.s.mover) return g.s === c.deck || !decks.includes(g.s) ? null : { deck: g.s };
  if (!c.deck || g.s.kind || g.s.tower !== 'top' || (standingAt(p.x, p.z)?.y ?? -Infinity) > g.h) return null;
  return { floor: g.s, p };
}
// how far (x, z) is from the platform o's edge (0 on it)
const gap = (o, x, z) => Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1));
function leap(c, to, decks) {
  const r = c.profile.radius + 0.15;
  let j = null;
  if (to.deck) {
    let o = to.deck;
    if (gap(o, c.x, c.z) > L.reach) {   // (too far: onto the one in reach nearest to theirs)
      const now = gap(o, c.x, c.z), mid = (q) => gap(o, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2);
      o = decks.filter(q => q !== c.deck && gap(q, c.x, c.z) <= L.reach && mid(q) < now).sort((a, b) => mid(a) - mid(b))[0];
      if (!o) return;
    }
    // (onto its near side)
    const x = Math.min(o.x1 - r, Math.max(o.x0 + r, c.x)), z = Math.min(o.z1 - r, Math.max(o.z0 + r, c.z));
    j = { deck: o, lx: x - o.x0, lz: z - o.z0 };
  } else {
    // (down next to the player, on the top of the tower)
    const p = to.p, d = Math.hypot(c.x - p.x, c.z - p.z) || 1, k = Math.min(1.1, d);
    const x = p.x + (c.x - p.x) / d * k, z = p.z + (c.z - p.z) / d * k, g = groundAt(x, z, p.y + 0.3, 0.6);
    const ok = g.s && !g.s.mover && g.s.tower === 'top' && walkable(g.s, c.profile.height) && Math.abs(g.h - p.y) < 0.6;
    j = ok ? { floor: g.s, x, y: g.h, z } : { floor: to.floor, x: to.floor.x + 0.5, y: groundAt(to.floor.x + 0.5, to.floor.z + 0.5, p.y + 0.3, 0.6).h, z: to.floor.z + 0.5 };
    if (gap({ x0: j.x, x1: j.x, z0: j.z, z1: j.z }, c.x, c.z) > L.reach + 1) return;
  }
  const tx = j.deck ? j.deck.x0 + j.lx : j.x, tz = j.deck ? j.deck.z0 + j.lz : j.z, d = Math.hypot(tx - c.x, tz - c.z);
  Object.assign(j, { x0: c.x, y0: c.y, z0: c.z, t: 0, T: 0.25 + d / L.speed, h: L.arc[0] + L.arc[1] * d });
  Object.assign(c, { jump: j, deck: null, path: null, yaw: Math.atan2(tx - c.x, tz - c.z) });
  sfx('jump', { at: c, pitch: 1.3, volume: 0.6 });
}
// through the air, onto a platform (where it is now: it slides on meanwhile) or the top of the tower
function leaping(c, dt, decks) {
  const j = c.jump;
  if (j.deck && !decks.includes(j.deck)) { c.jump = null; offDeck(c); return; }
  j.t += dt;
  const k = Math.min(1, j.t / j.T), tx = j.deck ? j.deck.x0 + j.lx : j.x, tz = j.deck ? j.deck.z0 + j.lz : j.z, ty = j.deck ? j.deck.y1 : j.y;
  const x = c.x, z = c.z;
  c.x = j.x0 + (tx - j.x0) * k; c.z = j.z0 + (tz - j.z0) * k;
  c.y = j.y0 + (ty - j.y0) * k + 4 * j.h * k * (1 - k);
  if (dt > 0) c.speed = Math.hypot(c.x - x, c.z - z) / dt;
  if (k < 1) return;
  c.jump = null; c.speed = 0; c.think = 0; c.again = L.again;
  if (j.deck) { c.deck = j.deck; onDeck(c, c.x, c.z); }
  else { c.f = j.floor; c.y = ty; }
}

// a summon's hit frame: Fire-faces croaked up (phase 1), or two Fire-cats to guard him
function summon(f, a) {
  const e = f.e, kind = ENEMY_KINDS[a.summon.kind], cats = a.name === 'cats', n = summonCount(e.stage, f.minions.length);
  if (cats) f.catsIn = null; else f.cool = G.summonCool;
  if (!n) return;
  const list = minionFloors(e, kind, n, foggerys.filter(living), { ahead: 1.4, within: 5 }).map(s => {
    const m = minion(e, `${e.id}:minion:${f.nonce}${++f.n}`, kind, s, e.yaw + (Math.random() - 0.5) * 2, f.n);
    m.cool = 0.8 + Math.random();
    return m;
  });
  foggerys.push(...list); f.minions.push(...list);
  if (cats && list.length) e.guard = 1;
  summonFx(muzzleAt(e, a.summon.muzzle), list, 'embers');
}
