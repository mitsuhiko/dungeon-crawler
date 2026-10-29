// The robot pulls the hero out (docs/story.md "The robot", the rules core/rescue.js). What would kill
// them in a fluid (physics/fluid.js peril: lava, acid, a boss's mud or slime over the head; and water
// with no way out of it, game/swim.js) calls `rescue` first (game/ragdoll.js dieInFluid): with the
// robot along (game/robot.js robotHere, awake), and enough health left to pay its share, it does not
// kill. The robot zips over (`reach`: the hero sunk in it, treading), grabs them by the hands and
// pulls them up (`lift`), flies them over to safe ground (`carry`, core/rescue.js flight: under the
// roof; where even that does not fit, it blinks there, like it jumps on its way) and lets go on it.
// Meanwhile nothing hurts them (game/enemycombat.js hitPlayer), no enemy strikes until a little
// after (RESCUE.grace), and the robot is drawn where it carries them (game/robot.js rescuePose).
// The safe ground it takes them to: physics/rescuespot.js.
import { WATER, LAVA, ACID, MUD, SWIM_FEET } from '../core/constants.js';
import { RESCUE, GRIP, shareOf, flight, along } from '../core/rescue.js';
import { beside } from '../core/robot.js';
import { player, state, setStatus } from './state.js';
import { robotHere } from './robot.js';
import { flash } from './hud.js';
import { takeDamage } from '../core/progression.js';
import { groundAt, ceilingAt, insideSolid } from '../physics/collide.js';
import { spotFor } from '../physics/rescuespot.js';
import { sfx } from '../audio/sfx.js';
import { emit, glow, soft, rand } from '../render/particles.js';
import { narrate } from './narrator.js';
import { msg, tr } from '../i18n/i18n.js';

const HOLD = 0.72;     // how far under the surface the feet hang while the robot comes (the head just out)
const PULL = 0.75;     // how far up out of it the robot pulls them before it flies
const NEAR = 12;       // cells: the robot further than this (or in no cube beside) blinks in over them

// what each fluid says: the damage's reason (should it come to that) and the status
const SAYS = {
  [LAVA]: { reason: msg('Burned by the lava!'), status: msg('Burned by the lava! The robot pulls you out'), sound: 'burn',
    colors: ['#ffd25a', '#ff8a2a', '#ff4a17'] },
  [ACID]: { reason: msg('Burned by the acid!'), status: msg('Burned by the acid! The robot pulls you out'), sound: 'dissolve',
    colors: ['#e2ffb0', '#9dff4a', '#5adf20'] },
  [MUD]: { reason: msg('Stuck in the mud!'), status: msg('Stuck in the mud! The robot pulls you out'), sound: 'splash',
    colors: ['#3a3129', '#17130f', '#5a4e43'] },
  slime: { reason: msg('Stuck in the slime!'), status: msg('Stuck in the slime! The robot pulls you out'), sound: 'splash',
    colors: ['#c8ff8a', '#7ae03a', '#4a9a20'] },
  [WATER]: { reason: msg('No way out of the water!'), status: msg('No way out of the water: the robot carries you out'), sound: 'splash',
    colors: ['#ffffff', '#c8f0ff', '#7fcaf0'] },
};
const saysOf = (fluid, look) => fluid === WATER && look ? SAYS[look === MUD ? MUD : 'slime'] : SAYS[fluid] ?? SAYS[LAVA];
// what the robot's line says it pulled them out of (core/narration.js `rescue`)
const nameOf = (fluid, look) => fluid === WATER ? (look === MUD ? 'mud' : look ? 'slime' : 'water') : fluid === LAVA ? 'lava' : 'acid';

// can the robot come now? (with the hero, awake)
export const robotCanRescue = () => { const r = robotHere(); return !!r && !(r.waking > 0) && state.mode === 'play'; };

// The hero is in `fluid` (`look`: a boss's mud or slime) whose surface stands at `surface`: does the
// robot pull them out? true: it does (it is under way: tickRescue)
export function rescue(fluid, look, surface) {
  if (player.rescue) return true;
  if (!robotCanRescue() || player.hp <= 0) return false;
  const lose = Math.ceil(player.maxHp * shareOf(fluid, look));
  if (lose > 0 && player.hp <= lose) return false;
  const to = spotFor(player.x, player.y, player.z);
  if (!to) return false;
  const says = saysOf(fluid, look), x = player.x, z = player.z;
  const hold = fluid === WATER && !look ? SWIM_FEET : HOLD;
  const from = { x, y: Math.max(groundAt(x, z, surface, 0).h, surface - hold), z };
  if (lose > 0) {
    player.lastHurt = { reason: says.reason, by: null };
    takeDamage(player, lose, state.time);
    flash();
  }
  sfx(says.sound, { at: { x, y: surface, z } });
  sfx('rescue', { at: { x, y: surface + 1, z } });
  burst(x, surface, z, says.colors, true);
  // the flight, from where it pulled them up to: a blink if even under the roof it would go
  // through something (a cave's narrow way)
  const up = { x, y: from.y + PULL, z }, path = flight(up, to, ceilingAt);
  const blink = blocked(path);
  Object.assign(player, { ragdoll: null, fluidDeath: 0, climb: null, getUp: null, swimming: false, grounded: false, engulfed: null,
    gust: null, pull: null, vx: 0, vy: 0, vz: 0, x, z, y: from.y, visY: from.y, stun: 0 });
  player.rescue = { phase: 'reach', t: 0, fluid, look, surface, from, up, to, path: blink ? hop(up, to) : path, blink,
    robot: robotStart(), colors: says.colors, drip: 0 };
  state.enemyGrace = Math.max(state.enemyGrace, RESCUE.reach + RESCUE.lift + player.rescue.path.time + RESCUE.grace);
  setStatus(tr(says.status));
  narrate('rescue', { fluid: nameOf(fluid, look) });
  return true;
}

// where the robot comes from: its place in our cube's coordinates, or null (far, or out of sight:
// it blinks in over them)
function robotStart() {
  const r = robotHere(), o = r && beside(r.at.k, state.cubeKey);
  if (!o) return null;
  const at = { x: r.at.x + o[0], y: r.at.y + o[1], z: r.at.z + o[2] };
  return Math.hypot(at.x - player.x, at.z - player.z) < NEAR && r.way.fade > 0.5 ? at : null;
}

// does the flight go through something solid (the hero's middle, or the robot over them)?
function blocked(path) {
  for (let i = 1; i < 20; i++) {
    const p = path.at(i / 20);
    if ([0.5, GRIP + 0.9].some(h => insideSolid(p.x, p.z, p.y + h))) return true;
  }
  return false;
}
// a blink: straight up out of it, gone, and down onto the spot from a little over it
function hop(up, to) {
  return { time: 1, length: 0, top: up.y, at: t => t < 0.5 ? { x: up.x, y: up.y + t * 1.2, z: up.z } : { x: to.x, y: to.y + (1 - t) * 1.2, z: to.z } };
}

// every frame of it (game/update.js, instead of moving)
export function tickRescue(dt) {
  const r = player.rescue, p = player;
  r.t += dt;
  if (r.phase === 'reach') {
    // sunk in it, treading, bobbing a little, while the robot comes
    p.y = r.from.y + Math.sin(r.t * 9) * 0.03;
    if (Math.random() < dt * 14) emit(glow, p.x + rand(-0.3, 0.3), r.surface + 0.05, p.z + rand(-0.3, 0.3),
      { v: [0, rand(0.6, 1.4), 0], life: rand(0.3, 0.6), size: rand(0.04, 0.08), color: r.colors[(Math.random() * 3) | 0], gravity: 3 });
    if (r.t >= RESCUE.reach) { r.phase = 'lift'; r.t = 0; sfx('rescue', { at: { x: p.x, y: p.y + 1.5, z: p.z }, pitch: 1.25 }); }
  } else if (r.phase === 'lift') {
    const k = along(r.t, RESCUE.lift);
    p.y = r.from.y + (r.up.y - r.from.y) * k;
    drip(r, dt);
    if (r.t >= RESCUE.lift) { r.phase = 'carry'; r.t = 0; }
  } else {
    const k = along(r.t, r.path.time), at = r.path.at(k), next = r.path.at(Math.min(1, k + 0.02));
    if (Math.hypot(next.x - at.x, next.z - at.z) > 1e-3) p.yaw = Math.atan2(next.x - at.x, next.z - at.z);
    Object.assign(p, at);
    if (r.blink) {
      const gone = r.t > 0.4 && r.t < 0.6;
      if (gone !== p.vanished) burst(p.x, p.y + 0.6, p.z, ['#ffffff', '#ffe9a0', '#9fdcff'], false);
      p.vanished = gone;
    }
    drip(r, dt);
    if (r.t >= r.path.time) letGo();
  }
  p.visY = p.y;
}

// the fluid running off them as they come up out of it
function drip(r, dt) {
  r.drip += dt;
  if (r.drip > 0.9 || Math.random() > dt * 30) return;
  const p = player;
  emit(r.fluid === LAVA ? glow : soft, p.x + rand(-0.12, 0.12), p.y + rand(0, 0.5), p.z + rand(-0.12, 0.12),
    { v: [0, -0.5, 0], life: rand(0.4, 0.8), size: rand(0.04, 0.08), color: r.colors[(Math.random() * 3) | 0], gravity: 9 });
}

// set down on the spot: they stand there, the robot follows them again
function letGo() {
  const r = player.rescue, to = r.to, g = groundAt(to.x, to.z, to.y + 0.05, 0);
  Object.assign(player, { x: to.x, y: g.s ? g.h : to.y, z: to.z, visY: g.s ? g.h : to.y, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false,
    support: g.s, vanished: false, rescue: null, landImpact: 2, landCount: player.landCount + 1, airTime: 0 });
  if (g.s) player.layer = g.s.kind ? g.s.run.layer : g.s.layer;
  burst(to.x, player.y, to.z, ['#ffffff', '#ffe9a0', '#9fdcff'], false);
  sfx('land', { at: to });
  state.enemyGrace = Math.max(state.enemyGrace, RESCUE.grace);
}

// game/robot.js: where the robot is while it carries them ({ x, y, z, yaw, fade, clip } in our
// cube's coordinates), or null: it does not
export function rescuePose() {
  const r = player.rescue;
  if (!r) return null;
  const over = { x: player.x, y: player.y + GRIP, z: player.z, yaw: player.yaw };
  if (r.phase !== 'reach') return { ...over, fade: player.vanished ? 0 : 1, clip: 'carry' };
  const k = along(r.t, RESCUE.reach);
  if (!r.robot) return { ...over, y: over.y + 1.2 * (1 - k), fade: k, clip: 'fly' };   // (blinking in over them)
  // a swoop: from where it was, down onto them from a little over them
  const s = r.robot, lift = Math.sin(Math.PI * k) * 0.8;
  return { x: s.x + (over.x - s.x) * k, y: s.y + (over.y - s.y) * k + lift, z: s.z + (over.z - s.z) * k,
    yaw: Math.atan2(over.x - s.x, over.z - s.z), fade: 1, clip: k > 0.8 ? 'carry' : 'fly' };
}

// a splash of the fluid where they come out (up), or a shimmer of the robot's light where they are set down
function burst(x, y, z, colors, up) {
  emit(glow, x, y + 0.5, z, { life: 0.4, size: 1.6, grow: 1.2, color: colors[1], alpha: 0.8 });
  for (let i = 0; i < 30; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.6, 2.4);
    emit(i % 3 ? glow : soft, x + Math.cos(a) * 0.3, y + rand(0, 1.1), z + Math.sin(a) * 0.3, { v: [Math.cos(a) * s, rand(1, 3.5) * (up ? 1.2 : 0.6), Math.sin(a) * s],
      life: rand(0.4, 0.9), size: rand(0.06, 0.14), color: colors[i % 3], alpha: 0.95, gravity: up ? 6 : -0.5, drag: 1.5 });
  }
}
