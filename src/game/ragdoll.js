// Knocking the player over: the body turns into a ragdoll; once it has settled the player
// either gets up where the body lies (GetUpBack / GetUpFront, see render/animator.js) or respawns.
import { Ragdoll } from '../physics/ragdoll.js';
import { rescue, robotCanRescue, catchFall } from './rescue.js';
import { startFall } from './fall.js';
import { groundAt } from '../physics/collide.js';
import { canMove } from '../physics/canmove.js';
import { WATER, LAVA, MUD, STEP, GET_UP_SPEED, SWIM_FEET } from '../core/constants.js';
import { peril, swimWater } from '../physics/fluid.js';
import { character } from '../render/character.js';
import { beginRagdoll } from '../render/ragdollpose.js';
import { fluidDeathFx } from '../render/fluiddeath.js';
import { characterYaw } from '../render/animator.js';
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { takeDamage } from '../core/progression.js';
import { flash } from './hud.js';
import { hurt, die, recover } from './flow.js';
import { cancelSword } from './sword.js';
import { goDown, tickDown } from './downed.js';
import { tr, msg } from '../i18n/i18n.js';

// respawn: 'safe' (last safe spot, game/flow.js recover), or null (get up where you lie);
// by: the enemy behind it (game/enemycombat.js attacker), for the chronicle should it kill
export function knockDown({ damage = 0, reason = '', respawn = null, push = 0, hop = 0, by = null } = {}) {
  player.climb = null; player.getUp = null; player.gust = null; player.held = null; player.engulfed = null;
  cancelSword();
  sfx('knock');
  if (!character.ready) { hurt(damage, reason, by); return; }
  if (damage > 0 || player.hp <= 0) player.lastHurt = { reason, by };
  takeDamage(player, damage, state.time);
  if (damage > 0) flash();
  if (reason) setStatus(tr(reason));
  const yaw = characterYaw(), fx = Math.sin(yaw), fz = Math.cos(yaw);
  const r = new Ragdoll(beginRagdoll(player.x, player.y, player.z), [player.vx + fx * push, player.vy + hop, player.vz + fz * push]);
  // a push topples the upper body more than the feet
  if (push) for (const i of [2, 3]) r.kick(i, [fx * push, 0, fz * push]);
  player.ragdoll = r;
  player.ragdollThen = respawn;
}

// Lava, acid and a boss's mud or slime over the head (physics/fluid.js peril) are fatal, including
// when an existing ragdoll tumbles in, unless the robot pulls the hero out (game/rescue.js); and so
// is water with no way out of it, with no robot (game/swim.js). The body keeps ragdolling (slowed
// down, sinking) under a fluid-specific effect.
const DEATH = { [WATER]: msg('Drowned!'), [LAVA]: msg('Burned up in lava!') };
const deathReason = (fluid, look) => fluid === WATER && look ? (look === MUD ? msg('Sank in the mud!') : msg('Sank in the slime!'))
  : DEATH[fluid] || msg('Dissolved in acid!');
const FLUID_DEATH_TIME = 2.2;   // keep the body around long enough for the effect

export function dieInFluid(fluid, surface, look = 0) {
  if (player.hp <= 0) return;
  if (rescue(fluid, look, surface)) return;   // the robot pulls them out: it hurts (game/rescue.js)
  const reason = deathReason(fluid, look);
  if (player.god) { setStatus(tr(reason) + ' (god mode: back to safety)'); recover(); return; }   // dev: /god on
  player.swimming = false;
  const { x, z } = player;   // before a no-asset fallback respawns the player
  player.lastHurt = { reason, by: null };
  if (!player.ragdoll) knockDown({ damage: player.hp, reason });
  else { takeDamage(player, player.hp, state.time); flash(); setStatus(tr(reason)); }
  player.fluidDeath = player.ragdoll ? fluid : 0;
  sfx(fluid === WATER ? 'splash' : fluid === LAVA ? 'burn' : 'dissolve');
  fluidDeathFx(fluid, x, surface, z, player.ragdoll);
}

// A ragdoll that tumbles into water deep enough to swim in: a live one swims (it is knocked into
// the water, not under it), one that dies sinks; a fall's (back to safety after it) goes on
function intoWater(gr) {
  const water = swimWater(gr);
  if (water === null || player.y > water - SWIM_FEET || player.fluidDeath) return false;
  if (player.hp <= 0) {
    player.fluidDeath = WATER;
    fluidDeathFx(WATER, player.x, water, player.z, player.ragdoll);
    return false;
  }
  if (player.ragdollThen === 'safe' || state.fallFrom) return false;
  Object.assign(player, { ragdoll: null, fluidDeath: 0, grounded: false, swimming: false, vy: -1, vx: 0, vz: 0, support: gr.s, visY: player.y });
  sfx('splash', { at: { x: player.x, y: water, z: player.z }, pitch: 1.2 });
  return true;
}

// viscous fluids: the body slows down and sinks instead of bouncing off the bed
function sink(r, fluid) {
  const keep = fluid === WATER ? 0.92 : 0.82;
  for (let i = 0; i < r.p.length; i++) for (let k = 0; k < 3; k++) r.o[i][k] = r.p[i][k] - (r.p[i][k] - r.o[i][k]) * keep;
}

export function stepRagdoll(dt) {
  if (player.down) { tickDown(dt); return; }   // playing together: lying there (game/downed.js)
  const r = player.ragdoll, pel = r.p[0];
  r.step(dt);
  player.x = pel[0]; player.z = pel[2]; player.y = pel[1] - 0.35;
  const gr = groundAt(player.x, player.z, player.y, 0), takes = peril(gr, player.y);
  if (takes) dieInFluid(takes.fluid, takes.y, takes.look);
  if (!player.ragdoll || (!takes && intoWater(gr))) return;
  // tumbled down a hole into the void, the robot along: a fall like any other (physics/hazards.js),
  // into the cube below or caught here (game/rescue.js)
  if (pel[1] < -1.5 && player.hp > 0 && !player.fluidDeath && !state.fallFrom && robotCanRescue()) {
    Object.assign(player, { ragdoll: null, ragdollThen: null, vx: 0, vy: -4, vz: 0, grounded: false, visY: player.y });
    if (!startFall()) catchFall();
    return;
  }
  if (player.fluidDeath) { sink(r, player.fluidDeath); if (r.t < FLUID_DEATH_TIME) r.done = false; }
  if (pel[1] < -3) r.done = true;
  if (!r.done) return;
  // a fatal blow on dry land, playing together: lie there for the friend to help you up
  if (player.hp <= 0 && !player.fluidDeath && pel[1] >= -3 && !state.fallFrom && goDown()) return;
  if (player.hp <= 0) { die(); return; }   // (the body lies there until you respawn: game/deathask.js)
  player.ragdoll = null; player.fluidDeath = 0;
  if (player.ragdollThen === 'safe' || pel[1] < -3 || state.fallFrom) { recover(); return; }
  standUp(r);
}

// get up where the ragdoll r came to rest
export function standUp(r) {
  const pel = r.p[0], g = groundAt(pel[0], pel[2], pel[1] + 0.3, 0);
  Object.assign(player, { y: g.h, visY: g.h, vx: 0, vy: 0, vz: 0, grounded: true, swimming: false, support: g.s });
  startGetUp(r.p);
}

// Face down or on the back, and which way the body lies: the get-up clip is turned to match
// it and the player moves to where its feet end up (as far as walking there would get).
function startGetUp(P) {
  const d = (a, b) => [0, 1, 2].map(k => P[a][k] - P[b][k]);
  const up = d(2, 0), left = d(4, 7);   // pelvis -> neck, right -> left shoulder
  const side = left[2] * up[0] - left[0] * up[2] < 0 ? 'front' : 'back';   // forward = left x up
  const s = side === 'front' ? 1 : -1;   // face down the head is ahead, on the back behind
  if (Math.hypot(up[0], up[2]) > 1e-3) player.yaw = Math.atan2(up[0] * s, up[2] * s);
  const clip = character.getUps[side], [ox, oz] = clip.lie, c = Math.cos(player.yaw), n = Math.sin(player.yaw);
  shuffleTo(player.x - (ox * c + oz * n), player.z - (oz * c - ox * n));
  player.getUp = { side, t: 0, duration: clip.duration / GET_UP_SPEED, move: clip.move / GET_UP_SPEED };
  player.stun = player.getUp.move;
}

// move the controller towards (x, z) the way walking would (walls, fences and ledges stop it)
function shuffleTo(x, z) {
  const p = player, n = 8, dx = (x - p.x) / n, dz = (z - p.z) / n;
  for (let i = 0; i < n; i++) {
    if (Math.abs(dx) > 1e-6 && canMove(p.x + dx, p.z, 'x', Math.sign(dx))) p.x += dx;
    if (Math.abs(dz) > 1e-6 && canMove(p.x, p.z + dz, 'z', Math.sign(dz))) p.z += dz;
  }
  const g = groundAt(p.x, p.z, p.y, STEP);
  if (g.s) Object.assign(p, { y: g.h, visY: g.h, support: g.s });
}

// the clip runs to its end unless the player walks (or swings, jumps, ...) out of its tail
export function tickGetUp(dt) {
  const p = player, g = p.getUp;
  g.t += dt;
  const busy = Math.hypot(p.vx, p.vz) > 0.3 || p.sword.active || !p.grounded || p.swimming || p.climb;
  if (g.t >= g.duration || (g.t >= g.move && busy)) p.getUp = null;
}
