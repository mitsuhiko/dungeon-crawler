// One simulation step for the player.
import { SIT_IMPACT, RAGDOLL_IMPACT, FALL_DAMAGE } from '../core/constants.js';
import { player, state, worldPaused } from './state.js';
import { sfx } from '../audio/sfx.js';
import { inputDir, wantsWalk, takeJump, autoAttackHeld, autoAttack, lookHeld, lookAttack } from './input.js';
import { updateSword, cancelSword } from './sword.js';
import { holdPointer, followOrder, clearOrder } from './orders.js';
import { canMoveCancel, cancelSwing, LUNGE_REACH } from '../core/combat.js';
import { checkPortals } from './portals.js';
import { knockDown, stepRagdoll, tickGetUp } from './ragdoll.js';
import { tickRescue } from './rescue.js';
import { tickSwim } from './swim.js';
import { beforeStep, noticeSwimOut, holdSwimOut } from './swimout.js';
import { tickHeld } from './grab.js';
import { tickTwirl } from './twirl.js';
import { tickEngulf, holdInside } from './engulf.js';
import { movePlayer, updateLayer, landingSpeed } from '../physics/move.js';
import { applyHazards } from '../physics/hazards.js';
import { climb } from '../physics/climb.js';
import { unstick } from '../physics/unstuck.js';
import { landFall } from './fall.js';
import { tickCast, cancelCast } from './townportal.js';
import { tickEffects, effectMod } from '../core/potions.js';
import { absent } from '../core/enemies.js';
import { iceStep } from './trials.js';
import { introHolds, introSteer } from './bossintro.js';
import { msg, tr } from '../i18n/i18n.js';

// during the wind-up, step in towards an enemy that is just out of reach
// learn: combat.html#chain (see learn/README.md)
function lunge(s) {
  const e = s.target, stats = s.stats;
  if (!e?.profile || stats.ranged || absent(e) || s.t >= stats.activeStart) return [0, 0];
  const d = Math.hypot(e.x - player.x, e.z - player.z);
  return d > (stats.range + e.profile.radius) * 0.7 && d < stats.range + e.profile.radius + LUNGE_REACH
    ? [Math.sin(s.yaw), Math.cos(s.yaw)] : [0, 0];
}

// learn: physics.html#landing (see learn/README.md)
export function updatePlayer(dt) {
  if (worldPaused() || state.transitioning) return;
  if (state.deathAsk) return;   // dead, asked what next (game/deathask.js): the body lies where it fell
  tickEffects(player, dt, state.time);   // potions at work (core/potions.js)
  // a portal's charge only carries over while checkPortals sees us standing in it
  const charge = state.portalCharge;
  state.portalCharge = null;
  // in the robot's hands (game/rescue.js): carried out of a fluid onto safe ground
  if (player.rescue) { cancelSword(); cancelCast(tr('Portal interrupted')); clearOrder(); tickRescue(dt); return; }
  if (player.ragdoll) { cancelSword(); cancelCast(tr('Portal interrupted')); clearOrder(); stepRagdoll(dt); return; }
  // in a boss's hands (game/grab.js): carried, then thrown; or spun round in a twister (game/twirl.js)
  if (player.held) { cancelSword(); cancelCast(tr('Portal interrupted')); clearOrder(); if (player.held.twirl) tickTwirl(dt); else tickHeld(dt); return; }
  // carried round as Flip turns the world, in his tractor beam or inside a black hole (game/flipworld.js moves us)
  if (player.flipping) { cancelSword(); cancelCast(tr('Portal interrupted')); clearOrder(); return; }
  // a boss's intro (game/bossintro.js): walking on a few steps, then standing, looking at him
  if (introHolds()) {
    cancelSword(); clearOrder();
    const [dx, dz] = introSteer(), gr = movePlayer(dt, dx, dz, false, false);
    updateLayer(gr);
    applyHazards(dt, gr);
    return;
  }
  if (player.getUp) tickGetUp(dt);
  // keys win over mouse orders
  const keys = inputDir();
  if (keys[0] || keys[1] || state.inventoryOpen) clearOrder(); else holdPointer(dt);   // (the inventory open: playing together)
  // held Shift: swing whenever an enemy is in reach, re-picking the target each time
  if (autoAttackHeld()) autoAttack();
  // the button held with mouse look (the close view): keep attacking where the crosshair is
  if (lookHeld()) lookAttack();
  const order = followOrder(dt);   // may queue an attack on its target
  updateSword(dt);
  let [dx, dz] = order ? [order.dx, order.dz] : keys;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  const steer = [dx, dz];   // where we go ourselves (a lunge does not count for leaving a fight)
  // (a mouse order jumps by itself where its way does: game/orders.js)
  const jumpKey = takeJump();
  let jump = jumpKey || !!order?.jump;
  // inside a Bolime (game/engulf.js): struggling to get out (a jump is a heave, not a jump)
  const engulfed = !!player.engulfed;
  if (engulfed) { clearOrder(); if (tickEngulf(dt, dx, dz, jumpKey)) jump = false; }
  tickCast(dt, len > 0 || jump || engulfed);   // reading the town portal scroll: moving interrupts it
  // on a ladder (a mouse order takes hold of none but its own, and climbs on unless the jump key lets go)
  if (!engulfed && climb(dt, dx, dz, jump, order ? order.ladder ?? null : undefined)) { cancelSword(); if (!order || jumpKey) clearOrder(); return; }
  if (iceStep(dt, dx, dz)) { cancelSword(); return; }   // on a slide puzzle's ice (game/trials.js)
  // climbing out of the water onto a bank (game/swimout.js): it holds the body, unless they move
  // away from the bank (or jump), which cuts it short
  if (player.swimOut && holdSwimOut(dt, dx, dz, jump)) { dx = dz = 0; jump = false; }
  // Attacks plant you: no walking until the blade went through (the shot left), then moving
  // cuts the rest short
  const s = player.sword;
  if (s.active) {
    if ((dx || dz) && canMoveCancel(player)) cancelSwing(player);
    else [dx, dz] = lunge(s);
  }
  // always run (mouse orders too), unless Ctrl is held (but for an order's jump) or a swing plants the feet
  const before = beforeStep();
  const gr = movePlayer(dt, dx, dz, (order?.run || !wantsWalk()) && !s.active, jump);
  noticeSwimOut(before);   // (out of the water onto a bank: game/swimout.js)
  holdInside();   // (still inside a Bolime: kept in it)
  updateLayer(gr);
  if (unstick(dt)) return;   // wedged in something: out onto the nearest free spot (physics/unstuck.js)

  // Fluid contact takes priority over landing damage (even a high fall into water).
  if (!applyHazards(dt, gr)) return;
  // a fall through cubes ends on the first landing, however soft (in water too)
  if (state.fallFrom && (player.grounded || player.swimming)) { landFall(); return; }
  if (tickSwim(dt)) return;   // in the water: its splash, and no way out of it (game/swim.js)

  // hard landings: tumble over as a ragdoll (and get hurt), or land on your bottom (not on
  // something soft, physics/move.js landingSpeed)
  const landed = landingSpeed(gr, effectMod(player, 'jump'));
  if (landed > RAGDOLL_IMPACT) {
    knockDown({ damage: Math.min(FALL_DAMAGE, (landed - RAGDOLL_IMPACT) * 6), reason: msg('Hard landing!') });
    return;
  }
  if (landed > SIT_IMPACT) { player.stun = 1.5; sfx('dizzy'); }

  if (!player.engulfed) checkPortals(dx, dz, dt, charge, steer);
}
