// A boss's intro (core/bossintro.js has the timings and the shots, docs/bosses.md "The intro").
// Coming into the arena of a boss who still stands (a real boss or a Temp Boss), once the curtain is
// up: the first time in this world (state.run.met, saved), alone and with him not yet in a fight,
// the whole intro. The hero walks on a few steps and stops, looking at him, with no control; black
// bars come in, the HUD goes; the free camera (game/camera.js setCine) leaves the hero and goes
// through the intro's shots while he appears his way (game/reveals.js); his name and epithet come
// up under him; the camera comes back, the bars go and his bar fades in (game/bossbar.js), and
// the hero is free. A click, Space or Enter skips to the end. Meanwhile enemies hold their attacks
// and the robot keeps quiet (game/narrator.js). Met before (or shown another player's enemies, or
// someone else is here: their world must not stop for us, nor their boss jump about), only his
// name shows a moment while his bar fades in. Reducing motion: no camera, the rest as always.
// Before the whole intro starts, while the screen comes up (the slide into his cube), he is not
// there yet (his reveal brings him in), or his reveal sets his arena for it (`waiting`: Mansk's
// curtain shut over his stage).
import { player, state } from './state.js';
import { allEnemies, mirroring, resetEnemies } from './enemies.js';
import { bossOf } from '../core/bossbar.js';
import { enemyName } from '../core/enemies.js';
import { INTROS, introOf, shotAt, shotFrame, shotScale, blendAt, blinking, BLINK, dimAt, within, epithetOf } from '../core/bossintro.js';
import { REVEALS } from './reveals.js';
import { setCine } from './camera.js';
import { clearShots } from './cineshots.js';
import { spawnAt } from './flow.js';
import { curtained } from './hud.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { cancelSword } from './sword.js';
import { reduceMotion } from './settings.js';
import { online } from '../net/online.js';
import { camera, renderer } from '../render/scene.js';
import { groundAt } from '../physics/collide.js';
import { firesUnder } from '../render/flames.js';
import { emit, glow, rand } from '../render/particles.js';
import { hideIntroFx } from '../render/introfx.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const WAIT = 3;        // s to wait for a boss to turn up (a friend's enemies come over the network)
const SKIP_FROM = 1;   // s into it before a click skips it (not the one that brought the hero in)
const STEP = 0.7;      // cells ahead the walk looks for the ground going on
let run = null;        // the intro under way
let visit = null, waited = 0;   // the visit (state.visit) the boss was looked for in
let voidVisit = null;  // the visit an intro took the world round the arena away in (state.introVoid)
let waiting = null;    // { e, reveal }: the boss whose intro is due, his arena set for it (wait)

export const introPlaying = () => !!run;
export const introFull = () => !!run?.full;
export const introRun = () => run;   // (dev: the checks)
// the hero is held (game/update.js): no control, walking on (introSteer) or standing
export const introHolds = () => !!run?.full && run.t < run.def.hold;
// where the hero walks meanwhile: towards the boss for the intro's `walk` s, while the ground goes on
export function introSteer() {
  const r = run;
  if (!r?.full || r.t >= r.def.walk) return [0, 0];
  const [dx, dz] = r.walk, g = groundAt(player.x + dx * STEP, player.z + dz * STEP, player.y + 0.5, 0.5);
  return g.h > player.y - 0.45 ? [dx, dz] : [0, 0];
}

// main.js, every frame (after the enemies)
export function updateBossIntro(dt) {
  // (the world round his arena his intro took away stays away till his fight takes over: Flip's)
  if (state.introVoid && !run && (voidVisit !== state.visit || state.void || state.mode !== 'play')) state.introVoid = 0;
  if (state.mode !== 'play' || !state.map) { if (run) stop(); unwait(); visit = null; return; }
  if (run && (run.visit !== state.visit || state.transitioning || run.e.mode === 'dead')) stop();
  if (!run) look(dt);
  if (!run) wait();
  if (!run || dt <= 0) return;
  if (!run.held) run.t += dt;
  step(run.held ? 1 / 60 : dt);   // (held: what turns still turns)
}

// a boss here to meet, once a visit
function look(dt) {
  if (state.transitioning || curtained() || !state.visit || visit === state.visit) return;
  if (state.map.testRoom || state.map.interior) { visit = state.visit; return; }   // (/intro there)
  const e = bossOf(allEnemies(), player);
  if (!e) { if ((waited += dt) > WAIT) visit = state.visit; return; }
  if (e.holdIntro) return;   // (not here yet: Umbra comes once his reef is flooded, game/umbra.js)
  visit = state.visit; waited = 0;
  start(e, due(e));
}
// is boss e's whole intro due: the first time in this world, alone, him not yet in a fight
function due(e) {
  const alone = !mirroring() && !online.buddies.some(b => b.here);
  const fresh = !['chase', 'attack', 'alert', 'split', 'gone'].includes(e.mode) && e.hp >= e.profile.hp;
  return alone && fresh && !state.run.met.has(e.id);
}
// Before it starts (the screen still coming up as the hero comes in, look waits for it), every
// frame while it is due: he is out of sight (`veil`; else he stood there as the cube slid in, gone
// as his reveal began), or a reveal with a `waiting` sets his arena for it (Mansk's curtain shut
// over his stage). No longer due without it starting (someone came, he woke): back as it was.
const unseen = e => { e.veil = 0; };
function wait() {
  const b = visit !== state.visit && !state.map.testRoom && !state.map.interior ? bossOf(allEnemies(), player) : null, e = b?.holdIntro ? null : b;
  const w = e && due(e) ? { e, reveal: REVEALS[introOf(e, false).reveal] } : null;
  if (waiting && waiting.e !== w?.e) unwait();
  waiting = w;
  if (w) (w.reveal?.waiting ?? unseen)(w.e);
}
function unwait() {
  if (!waiting) return;
  Object.assign(waiting.e, { veil: undefined, flood: 0 });   // (and Sollmeldon's mud drains: game/mud.js)
  hideIntroFx();
  waiting = null;
}

function start(e, full) {
  const set = waiting;
  waiting = null;
  state.run.met.add(e.id);
  const spot = { x: e.x, y: e.y, z: e.z, yaw: e.yaw };
  let wx = spot.x - player.x, wz = spot.z - player.z;
  const l = Math.hypot(wx, wz) || 1;
  run = { e, t: 0, full, spot, visit: state.visit, data: {}, side: 1, walk: [wx / l, wz / l],
    anchors: { hero: { x: player.x, y: player.visY, z: player.z }, spot, boss: e }, k: shotScale(e.profile.height * (e.profile.size ?? 1)),
    named: false, done: false };
  // his own intro, or the drop where his cannot be played here (Qualmos without his lagoon)
  let def = introOf(e, !full), reveal = full ? REVEALS[def.reveal] : null;
  Object.assign(run, { def, at: def.at, reveal });
  if (reveal?.fits && !reveal.fits(run)) { def = INTROS.drop; reveal = REVEALS.drop; Object.assign(run, { def, at: def.at, reveal, data: {} }); }
  // (what his reveal's waiting set his arena for: it takes it over, else it goes; out of sight
  // only, his reveal shows him as it starts)
  if (set && (set.e !== e || set.reveal !== reveal || !reveal?.waiting)) { Object.assign(set.e, { veil: undefined, flood: 0 }); hideIntroFx(); }
  state.intro = { full, bar: false };
  $('boss-intro-name').textContent = enemyName(e.profile);
  $('boss-intro-title').textContent = tr(epithetOf(e));
  if (!full) return;
  e.staged = true;
  state.enemyGrace = Math.max(state.enemyGrace, def.length + 0.5);   // (any defenders too)
  cancelSword(); clearInput(); clearMouseInput();
  reveal?.start(run);
  run.frame = shotFrame(player, spot, run.k, run.side);
  run.shots = clearIntroShots(run);
  run.fires = def.fires && state.world ? firesUnder(state.world.group) : [];
  document.body.classList.add('cinematic');
}

function step(dt) {
  const r = run, d = r.def, t = r.t, e = r.e;
  if (r.full) {
    if (!r.done) r.reveal?.step(r, t, dt);
    if (t < d.walk + 0.6) {   // the hero turns to him
      const want = Math.atan2(e.x - player.x, e.z - player.z), k = Math.min(1, dt * (t < d.walk ? 3 : 8));
      if (Math.hypot(player.vx, player.vz) < 0.3 || t > d.walk) player.yaw += Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw)) * k;
    }
    r.anchors.hero = { x: player.x, y: player.visY, z: player.z };
    r.anchors.boss = r.reveal?.seen?.(r) ?? e;
    state.introDim = dimAt(d, t);
    fires(r, t);
    const shot = shotAt(r.shots, t, r.frame, r.anchors), w = reduceMotion() || !shot ? 0 : blendAt(d, t);
    r.view = w > 0.3 ? shot.cam : null;   // (where the boss turns to: game/reveals.js)
    if (w > 0) {   // (held in a hand: a slow drift)
      const s = d.shake, n = i => s * (Math.sin(t * (1.3 + i * 0.37) + i * 2.1) + 0.5 * Math.sin(t * (2.9 + i * 0.23) + i));
      const h = e.profile.height * (e.profile.size ?? 1), avoid = [e.x, e.y + h * 0.5, e.z, Math.max(e.profile.radius, h * 0.5) + 0.7];
      setCine({ cam: shot.cam.map((v, i) => v + n(i)), look: shot.look.map((v, i) => v + n(i + 3) * 0.5), fov: shot.fov, roll: shot.roll, w, avoid });
    } else setCine(null);
    $('letterbox').classList.toggle('on', within(d.letterbox, t));
    $('letterbox').classList.toggle('shut', !reduceMotion() && blinking(d, t));   // (a cut: back to the game's camera, or in to the free one)
  }
  const named = within(d.name, t);
  if (named && !r.named && r.full) sfx('reveal');
  r.named = named;
  $('boss-intro').classList.toggle('on', named);
  if (t >= d.bar) state.intro.bar = true;
  if (r.full && t >= d.hold && !r.free) { r.free = true; clearInput(); clearMouseInput(); }
  if (t >= d.length) stop();
}

// the arena's fires sinking low as the light goes, and flaring up again (with a burst of sparks);
// with a `wave` (cells/s) one after the other, from his spot outwards
function fires(r, t) {
  const f = r.def.fires;
  if (!f || !r.fires.length) return;
  r.lowFires ??= new Set();
  let flared = 0;
  for (const x of r.fires) {
    const back = f.back + (f.wave ? Math.hypot(x.x - r.spot.x, x.z - r.spot.z) / f.wave : 0), low = t >= f.out && t < back;
    if (low === r.lowFires.has(x)) continue;
    if (low) r.lowFires.add(x); else r.lowFires.delete(x);
    x.set.power(x.i, low ? 0.25 : 1);
    if (low) continue;
    flared++;
    for (let i = 0; i < 10; i++)
      emit(glow, x.x + rand(-0.1, 0.1), x.y + rand(0, 0.3), x.z + rand(-0.1, 0.1), { v: [rand(-0.7, 0.7), rand(1.5, 3.5), rand(-0.7, 0.7)],
        life: rand(0.4, 0.8), size: rand(0.04, 0.08), color: ['#fff0a0', '#ffd25a', '#ff8a2a'][i % 3], gravity: -0.5, drag: 1 });
    if (f.wave) sfx('fireball', { at: x, pitch: rand(0.55, 0.7), volume: 0.4 });
  }
  if (flared && !f.wave) sfx('fireball', { at: r.e, pitch: 0.5, volume: 0.7 });
}

// The intro's shots, each key's camera out of the way (game/cineshots.js), the boss where the reveal
// has him at the key's moment
const anchorsAt = r => t => ({ ...r.anchors, boss: r.reveal?.where?.(r, t) ?? r.spot });
const clearIntroShots = r => clearShots(r.def.shots, r.frame, anchorsAt(r));

// skipped: on to where the camera goes back, him as the fight wants him
function skip() {
  const r = run;
  if (!r?.full || r.t < SKIP_FROM || r.t >= r.def.blend[2] - BLINK) return false;
  r.t = r.def.blend[2] - BLINK;
  finishReveal(r);
  return true;
}
function finishReveal(r) {
  if (r.done) return;
  r.done = true;
  r.reveal?.end(r);
  r.e.staged = false;
}
function stop() {
  const r = run;
  run = null;
  if (r.full) {
    finishReveal(r);
    for (const f of r.fires) f.set.power(f.i, 1);
    state.introDim = 0;
    if (state.introVoid) voidVisit = r.visit;
    setCine(null);
    $('letterbox').classList.remove('on', 'shut');
    document.body.classList.remove('cinematic');
    clearInput(); clearMouseInput();
  }
  hideIntroFx();
  $('boss-intro').classList.remove('on');
  state.intro = null;
}

// after the camera: his name under him (under his feet on the screen, kept on it)
export function updateIntroCard() {
  const r = run, el = $('boss-intro');
  if (!r || !el.classList.contains('on')) return;
  const s = onScreen(r.e), W = innerWidth, H = innerHeight, h = el.offsetHeight, w = el.offsetWidth;
  const x = Math.min(W - w / 2 - 16, Math.max(w / 2 + 16, s ? s.x : W / 2));
  const y = Math.min(H * 0.88 - h, Math.max(H * 0.14, s ? s.y + 18 : H * 0.62));
  el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`;
}
// where (x, y, z) is on the screen, in CSS pixels; null: behind the camera
function onScreen({ x, y, z }) {
  const m = camera.matrixWorldInverse.elements, q = camera.projectionMatrix.elements;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cx = q[0] * vx + q[4] * vy + q[8] * vz + q[12], cy = q[1] * vx + q[5] * vy + q[9] * vz + q[13], cw = q[3] * vx + q[7] * vy + q[11] * vz + q[15];
  return cw > 1e-4 ? { x: (cx / cw * 0.5 + 0.5) * innerWidth, y: (0.5 - cy / cw * 0.5) * innerHeight } : null;
}

// a click, Space or Enter skips the rest (and does nothing else)
function skipped(ev) {
  if (!run?.full || !skip()) return;
  ev.preventDefault(); ev.stopImmediatePropagation();
}
addEventListener('keydown', ev => { if (['Space', 'Enter', 'NumpadEnter'].includes(ev.code) && !ev.repeat) skipped(ev); }, true);
renderer.domElement.addEventListener('pointerdown', skipped, true);

// dev (/intro): this arena's boss's intro again, as the first time (him back on his spot, the hero
// at the way in) or as after; the hero met him either way
export function devIntro(full = true) {
  const e = bossOf(allEnemies(), player);
  if (!e) return 'No boss here';
  if (run) stop();
  let boss = e;
  if (full) {   // (the cube's enemies as on coming in: him fresh on his spot, his fight not begun)
    resetEnemies();
    boss = bossOf(allEnemies(), player) ?? e;
    const a = state.arrival;
    if (a) spawnAt(a.x, a.y, a.z);
  }
  visit = state.visit;
  start(boss, full);
  return null;
}
// dev (/intro 2.3, /intro go): the intro under way held at t s (to look at a moment of it), or let go
export function devHoldIntro(t) {
  if (!run) return 'No intro playing';
  run.held = t !== null;
  if (t !== null) run.t = t;
  return null;
}
