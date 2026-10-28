// Qualmos's fight (core/qualmos.js has the rules, docs/bosses.md tells it): this cube's Qualmos,
// in a list of his own (`qualmoses`), so he fights, collides, travels and gets shown to friends
// like any enemy. A dev spawn (game/devspawn.js) gets a fight too.
//
// On him: `stage` (his phase, 1 .. 5, sent to friends with his row: net/protocol.js), `hpFloor`
// (core/qualmos.js phaseFloor) and `barred` (the attacks of the phases still to come, and while
// his belly flop is due all but it: core/qualmos.js choices); `sinceFlop` (attacks since his last
// flop; `tallied`: the attacks counted so far), `diveIn` (s of fighting till he next heads for his lagoon) and `dive` (on his way there,
// or under its surface: { step: 'go' | 'under', t, hide }).
// Movement and attacks are the shared enemy AI's (game/enemyai.js). When a blow has brought him
// down to his phase's floor and he is not in the middle of an attack, he starts the next phase:
// he rages (his `rage` attack, warded) and fights on with its attacks too, harder.
// His dive (core/qualmos.js QUALMOS_DIVE): his way there and his way under the water are ways of
// his own (`route`: the shared AI follows it, striking whoever is in reach on the way), and under
// the surface (`under`, shown to friends with his row) the shared AI keeps him in the water
// (physics/dwell.js walkerOf), moving fast and striking nothing.
import { QUALMOS, makeEnemy, enemyName, attackOf, lungeDistance } from '../core/enemies.js';
import { phaseDue, enterPhase, choices, counted, QUALMOS_DIVE } from '../core/qualmos.js';
import { player, state, setStatus } from './state.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { sweep } from './bossfight.js';
import { nearest, floorAt, stepEnemy } from '../physics/enemynav.js';
import { wetAt, livesOn, walker, walkerOf } from '../physics/dwell.js';
import { tr } from '../i18n/i18n.js';

export let qualmoses = [];

const between = ([a, b]) => a + (b - a) * Math.random();
// the player he goes after (game/enemyai.js foe)
const foe = e => e.target && (e.target === player || e.target.here) ? e.target : player;

export function resetQualmoses() {
  removeEnemyViews(qualmoses);
  qualmoses = [];
  addQualmoses(enemySpots(state.map, QUALMOS).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? QUALMOS, i)));
}
// Qualmoses to fight: this cube's, or spawned with the dev tools
export function addQualmoses(list) {
  for (const e of list) {
    enterPhase(e, 1);
    Object.assign(e, { sinceFlop: undefined, tallied: e.attacks, diveIn: between(QUALMOS_DIVE.every), dive: null });
    qualmoses.push(e);
  }
}
export function detachQualmoses() { const list = qualmoses; qualmoses = []; return list; }

// where he may float in his lagoon (physics/dwell.js): wet for him, with room
const wet = e => f => wetAt(e.profile, f) !== null && livesOn(e.profile, f);
// is his body all in the water at (x, z) on floor f, clear of the bank (as he moves under it:
// physics/enemynav.js stepEnemy)?
function inWater(e, f, x, z) {
  const w = walker(e.profile, false), r = Math.min(e.profile.radius, 0.42);
  return wet(e)(f) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => floorAt(f, x + dx, z + dz, w));
}
// a floor of the water he fits in, standing in its middle
const roomy = e => f => inWater(e, f, f.x + 0.5, f.z + 0.5);
// His leap out of the water from the middle of floor f at hero p, as it would go (game/enemyai.js
// leap: along his heading, `lunge.stop` short of them, no further than `lunge.max`, over the floors
// he can step onto: a bank close enough over the water's surface, physics/dwell.js): how near the
// hero it takes him; null where it leaves him in the water (too high a bank that way).
function leapsTo(e, p, f) {
  const lunge = e.profile.attacks.find(a => a.name === 'dive').lunge;
  const s = { x: f.x + 0.5, z: f.z + 0.5, y: 0, f, profile: e.profile, under: 0 }, dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 1;
  const go = lungeDistance(lunge, d), n = Math.ceil(go / 0.1);
  for (let i = 0; i < n; i++) stepEnemy(s, dx / d * go / n, dz / d * go / n);
  return s.f.fluid ? null : Math.hypot(p.x - s.x, p.z - s.z);
}
// where under the water he swims to: where his leap out takes him nearest hero p; with no leap out
// anywhere, where the water comes nearest them (he walks out there)
const OUT = 100;
const outTo = (e, p) => f => {
  const near = leapsTo(e, p, f);
  return near === null ? -Math.hypot(p.x - f.x - 0.5, p.z - f.z - 0.5) : OUT - near;
};
// out of the water (or never in): back to his fight, his next dive a while off
function surface(e) {
  Object.assign(e, { under: 0, route: null, dive: null, diveIn: between(QUALMOS_DIVE.every) });
}
// up and out at the hero, if they are in his leap's reach and it takes him out of the water
function leap(e) {
  const p = foe(e), list = e.profile.attacks, i = list.findIndex(a => a.name === 'dive'), a = list[i];
  const d = Math.hypot(p.x - e.x, p.z - e.z);
  if (p.ragdoll || p.held || p.hp <= 0 || d >= a.reach || d < (a.minReach ?? 0) || leapsTo(e, p, e.f) === null) return;
  Object.assign(e, { mode: 'attack', attack: i, t: 0, bit: false, leap: 0, speed: 0, path: null, yaw: Math.atan2(p.x - e.x, p.z - e.z) });
  e.attacks++;
}
// his dive into the lagoon (core/qualmos.js QUALMOS_DIVE)
function dive(e, dt) {
  const D = QUALMOS_DIVE, d = e.dive;
  if (e.mode === 'dead' || e.mode === 'gone') { if (d) surface(e); return; }
  if (!d) {
    if (e.stage < D.from || (e.mode !== 'chase' && e.mode !== 'attack') || state.devPassive || e.dormant) return;
    if ((e.diveIn -= dt) > 0 || e.mode !== 'chase') return;
    if (!nearest(e.f, roomy(e), D.far, walkerOf(e))) { e.diveIn = 2; return; }   // (no water near: later)
    e.dive = { step: 'go', t: 0 };
    e.route = () => nearest(e.f, roomy(e), D.far, walkerOf(e));
    return;
  }
  d.t += dt;
  if (d.step === 'go') {
    if (d.t > D.go) { surface(e); return; }
    if (e.mode === 'attack' || !inWater(e, e.f, e.x, e.z)) return;
    // under: to where his leap out takes him nearest the hero
    Object.assign(e, { under: 1, dive: { step: 'under', t: 0, hide: between(D.hide) }, path: null, think: 0 });
    e.route = () => nearest(e.f, () => false, D.far, walkerOf(e), outTo(e, foe(e)));
    setStatus(tr('{name} slips under the water!', { name: enemyName(e.profile) }));
    return;
  }
  const there = !e.path || e.path.at(-1) === e.f;
  if (d.t < d.hide || (!there && d.t < D.most)) return;
  surface(e);
  leap(e);
}

// an attack he started (his rage or leap here, any other in the shared AI): towards his next flop
function tally(e) {
  if (e.attacks === e.tallied) return;
  e.tallied = e.attacks;
  if (e.mode === 'attack') counted(e, attackOf(e).name);
}

export function updateQualmoses(dt) {
  for (const e of qualmoses) {
    if (phaseDue(e)) {   // on into his next phase: his rage, then its attacks on top
      enterPhase(e, e.stage + 1);
      setStatus(tr('{name} enters phase {phase}!', { name: enemyName(e.profile), phase: e.stage }));
    }
    dive(e, dt);
    tally(e);
    const p = foe(e);
    e.barred = choices(e, Math.hypot(p.x - e.x, p.z - e.z), Math.abs(p.y - e.y));
  }
  stepEnemies(qualmoses, dt);
  qualmoses.forEach(tally);
  qualmoses = sweep(qualmoses, dt);
}
