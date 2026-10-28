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
import { player, state } from './state.js';
import { allEnemies, mirroring, resetEnemies } from './enemies.js';
import { bossOf } from '../core/bossbar.js';
import { enemyName } from '../core/enemies.js';
import { INTROS, introOf, shotAt, shotFrame, shotPoint, shotScale, blendAt, blinking, BLINK, dimAt, within, epithetOf } from '../core/bossintro.js';
import { N, LH } from '../core/constants.js';
import { viewBlockedAt } from '../core/blockers.js';
import { REVEALS } from './reveals.js';
import { setCine, WALLED } from './camera.js';
import { spawnAt } from './flow.js';
import { curtained } from './hud.js';
import { clearInput } from './inputstate.js';
import { clearMouseInput } from './orders.js';
import { cancelSword } from './sword.js';
import { reduceMotion } from './settings.js';
import { online } from '../net/online.js';
import { camera, renderer } from '../render/scene.js';
import { groundAt, insideSolid, cellAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';
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
  if (state.mode !== 'play' || !state.map) { if (run) stop(); visit = null; return; }
  if (run && (run.visit !== state.visit || state.transitioning || run.e.mode === 'dead')) stop();
  if (!run) look(dt);
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
  visit = state.visit; waited = 0;
  const alone = !mirroring() && !online.buddies.some(b => b.here);
  const fresh = !['chase', 'attack', 'alert', 'split', 'gone'].includes(e.mode) && e.hp >= e.profile.hp;
  start(e, alone && fresh && !state.run.met.has(e.id));
}

function start(e, full) {
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
  state.intro = { full, bar: false };
  $('boss-intro-name').textContent = enemyName(e.profile);
  $('boss-intro-title').textContent = tr(epithetOf(e));
  if (!full) return;
  e.staged = true;
  state.enemyGrace = Math.max(state.enemyGrace, def.length + 0.5);   // (any defenders too)
  cancelSword(); clearInput(); clearMouseInput();
  reveal?.start(run);
  run.frame = shotFrame(player, spot, run.k, run.side);
  run.shots = clearShots(run);
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
    $('letterbox').classList.toggle('shut', !reduceMotion() && blinking(d, t));   // (the cut back to the game's camera)
  }
  const named = within(d.name, t);
  if (named && !r.named && r.full) sfx('reveal');
  r.named = named;
  $('boss-intro').classList.toggle('on', named);
  if (t >= d.bar) state.intro.bar = true;
  if (r.full && t >= d.hold && !r.free) { r.free = true; clearInput(); clearMouseInput(); }
  if (t >= d.length) stop();
}

// the arena's fires sinking low as the light goes, and flaring up again (with a burst of sparks)
function fires(r, t) {
  const f = r.def.fires;
  if (!f || !r.fires.length) return;
  const low = t >= f.out && t < f.back;
  if (low === r.firesLow) return;
  r.firesLow = low;
  for (const x of r.fires) {
    x.set.power(x.i, low ? 0.25 : 1);
    if (!low) for (let i = 0; i < 10; i++)
      emit(glow, x.x + rand(-0.1, 0.1), x.y + rand(0, 0.3), x.z + rand(-0.1, 0.1), { v: [rand(-0.7, 0.7), rand(1.5, 3.5), rand(-0.7, 0.7)],
        life: rand(0.4, 0.8), size: rand(0.04, 0.08), color: ['#fff0a0', '#ffd25a', '#ff8a2a'][i % 3], gravity: -0.5, drag: 1 });
  }
  if (!low) sfx('fireball', { at: r.e, pitch: 0.5, volume: 0.7 });
}

// The intro's shots, each key's camera out of the way: where it is (at the key's moment: the boss
// where the reveal has him then) inside something, under a fluid, outside the cube, or with
// something between it and what it looks at, it is moved round what it looks at (TRIES: the
// nearest first: a little round, further or closer, higher), to the first place that is clear.
// None clear: as it was (the camera then keeps in front of what is in the way, game/camera.js).
const TRIES = (() => {
  const out = [];
  for (const turn of [0, 20, -20, 40, -40, 65, -65, 90, -90, 120, -120, 150, -150, 180])
    for (const far of [1, 0.85, 1.2, 0.7, 1.45, 0.55])
      for (const up of [0, 0.8, 1.6, 2.6, 4])
        out.push({ turn: turn * Math.PI / 180, far, up, cost: Math.abs(turn) / 25 + Math.abs(Math.log(far)) * 4 + up * 0.7 });
  return out.sort((a, b) => a.cost - b.cost);
})();
function clearShots(r) {
  const { f, r: right, k } = r.frame;
  return cutWhereBlocked(r, r.def.shots.map(key => {
    const anchors = { ...r.anchors, boss: r.reveal?.where?.(r, key.t) ?? r.spot }, look = shotPoint(r.frame, anchors, key.look);
    const cam = shotPoint(r.frame, anchors, key.cam), dx = cam[0] - look[0], dz = cam[2] - look[2], o = anchors[key.cam[0]] ?? anchors.spot;
    const kk = key.cam[0] === 'hero' ? 1 : k;
    for (const { turn, far, up } of TRIES) {
      const c = Math.cos(turn), s = Math.sin(turn);
      const p = [look[0] + (dx * c - dz * s) * far, cam[1] + up, look[2] + (dx * s + dz * c) * far];
      if (!clearView(p, look)) continue;
      if (!turn && far === 1 && !up) return key;
      // (back into the key's terms: round its anchor, in the frame)
      const ox = p[0] - o.x, oz = p[2] - o.z;
      return { ...key, cam: [key.cam[0], (ox * f[0] + oz * f[1]) / kk, (ox * right[0] + oz * right[1]) / kk, (p[1] - o.y) / kk] };
    }
    return key;
  }));
}
// Where the camera's way from one key to the next would go into something (or under a fluid), or
// lose sight of what it looks at for a while (a tower between), it cuts to the next key instead.
function cutWhereBlocked(r, keys) {
  const STEPS = 10;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (keys[i + 1].cut) continue;
    let hidden = 0;
    for (let n = 1; n < STEPS; n++) {
      const t = keys[i].t + (keys[i + 1].t - keys[i].t) * n / STEPS;
      const shot = shotAt(keys, t, r.frame, { ...r.anchors, boss: r.reveal?.where?.(r, t) ?? r.spot }), [x, y, z] = shot.cam;
      const inside = insideSolid(x, z, y) || viewBlockedAt(state.map, x, y, z) || underFluid(x, y, z);
      hidden = clearView(shot.cam, shot.look) ? 0 : hidden + 1;
      if (inside || hidden >= 3) { keys[i + 1] = { ...keys[i + 1], cut: true }; break; }
    }
  }
  return keys;
}
// a camera at p looking at `at`: in the cube (off the walls round it), out of every solid (a little round it too) and over
// every fluid, with nothing between
function clearView(p, at) {
  const m = state.map, [x, y, z] = p;
  const edge = m.walled ? WALLED : 0.4;
  if (x < edge || z < edge || x > N - edge || z > N - edge || underFluid(x, y, z)) return false;
  for (const [dx, dy, dz] of [[0, 0, 0], [0.35, 0, 0], [-0.35, 0, 0], [0, 0, 0.35], [0, 0, -0.35], [0, 0.35, 0], [0, -0.35, 0]])
    if (insideSolid(x + dx, z + dz, y + dy) || viewBlockedAt(m, x + dx, y + dy, z + dz)) return false;
  const len = Math.hypot(x - at[0], y - at[1], z - at[2]);
  for (let s = 0.3; s < len; s += 0.12) {
    const k = s / len, px = at[0] + (x - at[0]) * k, py = at[1] + (y - at[1]) * k, pz = at[2] + (z - at[2]) * k;
    if (insideSolid(px, pz, py) || viewBlockedAt(m, px, py, pz)) return false;
  }
  return true;
}
// is (x, y, z) in a fluid, or just over it (a standing one too: a boss's tide, Foggery's lava)?
function underFluid(x, y, z) {
  const s = standingAt(x, z);
  if (s && y < s.y + 0.35) return true;
  const i = cellAt(x, z);
  return i >= 0 && state.map.cols[i].some(f => f.fluid && y < f.surf * LH + 0.35 && y > f.top * LH - 1);
}

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
