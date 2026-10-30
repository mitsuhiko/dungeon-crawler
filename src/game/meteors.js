// The slime meteorites of the cube being played (core/meteors.js): at the world's night in a
// theme with `meteors` (the slime marsh: under its sky, game/daycycle.js), each one's shadow grows where it will come down, then it falls and
// lands: our player within its reach is hit (unless under a roof), and the enemies there too, but
// only in the game that runs them (playing together: net/foes.js; the others are shown what it
// does to them). Where it landed a splat of slime slows whoever wades through it, the enemies too.
// Not in the town and the camp, inside houses, in trial rooms, test rooms or a boss's arena.
// Playing together the world's play time runs on real time (game/worldclock.js), so a long frame
// can skip much of a warning: one whose shadow showed less than METEOR.notice does not hit the
// player (it lands all the same), and one that landed does not come again if the clock goes back.
//
// A boss may spit meteorites of his own (Slomo: an attack's `rain`, core/enemies.js SLOMO_METEOR),
// in his arena, day or night: read off his attack clock like a shockwave (game/quakes.js), every game
// lets them come down round its own player as he spits them (core/slomo.js rainOf), each hitting
// only that player (with the boss's blow, `rain.power` of his damage) and leaving its splat. They
// spare the enemies (they are his). A rain of another `look` (Monteur's: 'stone', stones falling
// out of the sky, render/meteors.js) leaves no splat, and does not slow.
import { state, player, worldLevel } from './state.js';
import { allEnemies, mirroring } from './enemies.js';
import { hitBody } from './enemycombat.js';
import { afflictEnemy } from './statuses.js';
import { dayClock, skyOf, fullCycle } from './daycycle.js';
import { themeOf } from '../themes/depth.js';
import { DAY } from '../core/daycycle.js';
import { slowPlayer } from './enemycombat.js';
import { METEOR, meteorsAt, meteorBlow, enemyMeteorDamage } from '../core/meteors.js';
import { damageEnemy } from '../core/combat.js';
import { absent, attackOf, blowOf } from '../core/enemies.js';
import { rainOf } from '../core/slomo.js';
import { attacker } from './enemycombat.js';
import { groundAt, ceilingAt } from '../physics/collide.js';
import { floorY } from '../core/surfaces.js';
import { LH, N } from '../core/constants.js';
import { meteorFx, statusHurtFx } from './juice.js';
import { drawMeteors, removeMeteorView, drawSplats, clearMeteorViews } from '../render/meteors.js';

let shown = new Map(), splats = [], cube = null;
// a boss's meteorites ({ m: { id, t }, at, since, landed, blow }, on `rainClock`: s since they started
// coming), those still to come (their warning not yet started) and those showing
let rain = [], raining = [], rainClock = 0, rainId = 0;
const landed = new Map();   // id -> when, of those that landed in this cube (kept two days and nights)
// where meteorites may come down in a map: its dry floors open to the sky (cached)
const spots = new WeakMap();
function spotsOf(m) {
  if (!spots.has(m)) spots.set(m, m.floors.filter(f => !f.fluid && !f.kind && !m.pieces[f.c].length && m.cols[f.c].at(-1) === f));
  return spots.get(m);
}
const allowed = m => !!m && !m.town && !m.interior && !m.testRoom && !m.trialRoom && !m.guardian?.boss && !m.enemyFree;
// open to the sky over (x, y, z)?
const open = (x, y, z) => ceilingAt(x, z, y + 0.2) > y + METEOR.sky * 0.5;

// a meteorite's spot: an aimed one beside the player as it starts to fall, else a floor of the cube
function place(m, map) {
  if (m.aimed) {
    const a = m.u * Math.PI * 2, d = m.v * METEOR.near, x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
    const g = groundAt(x, z, player.y + 0.5, 1);
    if (g.s && Number.isFinite(g.h) && open(x, g.h, z)) return { x, y: g.h, z };
  }
  const list = spotsOf(map);
  if (!list.length) return null;
  const f = list[Math.floor(m.u * list.length) % list.length], fx = 0.25 + m.v * 0.5, fz = 0.75 - m.v * 0.5;
  const y = floorY(f, fx, fz);
  return open(f.x + fx, y, f.z + fz) ? { x: f.x + fx, y, z: f.z + fz } : null;
}

// every step (game/enemies.js, after the enemies moved)
export function updateMeteors(dt) {
  const map = state.map, falling = !!map && fullCycle(skyOf(map)) && !!themeOf(map).meteors;
  if (state.cubeKey !== cube) { clearMeteors(); cube = state.cubeKey; }
  splats = splats.filter(s => (s.t += dt) < METEOR.splat.time);
  wade();
  if (map && !state.transitioning) bossRain(dt);
  if (!falling || !allowed(map) || state.transitioning) { for (const v of shown.values()) removeMeteorView(v); shown.clear(); return; }
  const clock = dayClock(), now = meteorsAt(map.seed ?? 0, state.cubeKey, clock), ids = new Set(now.map(m => m.id));
  for (const [id, v] of shown) if (!ids.has(id)) { removeMeteorView(v); shown.delete(id); }
  for (const [id, t] of landed) if (t < clock - 2 * DAY.length) landed.delete(id);
  for (const m of now) {
    let v = shown.get(m.id);
    if (!v) {
      if (landed.has(m.id)) continue;
      const at = place(m, map);
      shown.set(m.id, v = { m, at, landed: false, view: null, since: clock });
      if (at) meteorFx(v, 'warn');
    }
    if (!v.at || v.landed) continue;
    if (!v.falling && clock >= m.t - METEOR.fall) { v.falling = true; meteorFx(v, 'fall'); }
    if (clock < m.t) continue;
    v.landed = true;
    landed.set(m.id, m.t);
    land(v);
  }
}
// it lands: whoever is in reach is hit, a splat is left
function land(v) {
  const { x, y, z } = v.at, depth = state.map.depth ?? 0;
  meteorFx(v, 'land');
  splats.push({ x, y, z, t: 0 });
  const p = player, d = Math.hypot(p.x - x, p.z - z), noticed = v.m.t - v.since >= METEOR.notice;
  if (noticed && d <= METEOR.radius + p.r && Math.abs(p.y - y) < 1.2 && p.hp > 0 && !p.ragdoll && open(p.x, p.y, p.z))
    hitBody(p, meteorBlow(depth, worldLevel()), x, z, d ? (p.x - x) / d : 1, d ? (p.z - z) / d : 0);
  if (mirroring()) return;   // (another runs the enemies: what it does to them is theirs to say)
  for (const e of allEnemies()) {
    if (absent(e)) continue;
    const de = Math.hypot(e.x - x, e.z - z);
    if (de > METEOR.radius + e.profile.radius || Math.abs(e.y - y) > 1.5) continue;
    const before = e.hp;
    if (!damageEnemy(e, enemyMeteorDamage(depth, worldLevel()), false)) continue;
    statusHurtFx(e, before - e.hp, 'meteor', !e.hp);
    e.lastHit = null;
    if (e.hp) {
      afflictEnemy(e, 'slowed', METEOR.slow);
      const push = METEOR.knock / e.profile.mass;
      e.kbx = (de ? (e.x - x) / de : 1) * push; e.kbz = (de ? (e.z - z) / de : 0) * push;
    }
  }
}
// A boss spitting meteorites (an attack's `rain`): as he passes the hit frame they are made round
// our player (each its warning `delay` s after the one before), shown from their warning on; each
// lands METEOR.warn s after its warning started, hitting our player if they are in reach.
function bossRain(dt) {
  rainClock += dt;
  for (const e of allEnemies()) {
    const a = e.mode === 'attack' ? attackOf(e) : null;
    if (!a?.rain || e.rained === e.attacks || e.t < a.hitAt) continue;
    e.rained = e.attacks;
    const look = a.rain.look ?? 'slime', slime = look === 'slime';
    const blow = { ...blowOf(e.profile, { power: a.rain.power, knock: METEOR.knock, hop: 3, reason: a.rain.reason, slow: slime ? METEOR.slow : null }), by: attacker(e) };
    const x0 = player.x, z0 = player.z;
    for (const { dx, dz, delay } of rainOf(a.rain, (Math.random() * 2 ** 32) >>> 0)) {
      const start = rainClock + delay, id = `rain:${++rainId}`;
      rain.push({ m: { id, t: start + METEOR.warn }, x: x0 + dx, z: z0 + dz, since: start, blow, look, landed: false, view: null });
    }
  }
  // their warnings starting: where they come down (on the ground there, open to the sky)
  for (const r of rain.filter(r => rainClock >= r.since)) {
    rain.splice(rain.indexOf(r), 1);
    const x = Math.min(N - 0.6, Math.max(0.6, r.x)), z = Math.min(N - 0.6, Math.max(0.6, r.z));
    const g = groundAt(x, z, player.y + 2, 1);
    if (!g.s || !Number.isFinite(g.h) || !open(x, g.h, z)) continue;
    r.at = { x, y: g.h, z };
    raining.push(r);
    meteorFx(r, 'warn');
  }
  raining = raining.filter(r => {
    if (r.landed) { if (rainClock < r.m.t + 0.1) return true; removeMeteorView(r); return false; }
    if (!r.falling && rainClock >= r.m.t - METEOR.fall) { r.falling = true; meteorFx(r, 'fall'); }
    if (rainClock < r.m.t) return true;
    r.landed = true;
    meteorFx(r, 'land');
    if (r.look === 'slime') splats.push({ x: r.at.x, y: r.at.y, z: r.at.z, t: 0 });
    const p = player, { x, y, z } = r.at, d = Math.hypot(p.x - x, p.z - z);
    if (d <= METEOR.radius + p.r && Math.abs(p.y - y) < 1.2 && p.hp > 0 && !p.ragdoll && open(p.x, p.y, p.z))
      hitBody(p, r.blow, x, z, d ? (p.x - x) / d : 1, d ? (p.z - z) / d : 0);
    return true;
  });
}
// wading through a splat: slowed, a little (the enemies too, those we run)
function wade() {
  if (!splats.length) return;
  const r = METEOR.splat.radius, inside = b => splats.some(s => Math.hypot(b.x - s.x, b.z - s.z) < r && Math.abs(b.y - s.y) < 0.4);
  if (player.grounded && inside(player)) slowPlayer(METEOR.splat.slow);
  if (!mirroring()) for (const e of allEnemies()) if (!absent(e) && !e.profile.slimeborn && !e.profile.hover && inside(e))
    afflictEnemy(e, 'slowed', METEOR.splat.slow);
}
export function drawAllMeteors(dt, off) {
  drawMeteors([...shown.values()], dayClock(), dt, off);
  drawMeteors(raining, rainClock, dt, off);
  drawSplats(splats, dt, off);
}
export function clearMeteors() {
  clearMeteorViews([...shown.values(), ...raining]); shown.clear(); splats = []; landed.clear();
  rain = []; raining = [];
}
export const meteorsNow = () => [...shown.values(), ...raining];
export const splatsNow = () => splats;
