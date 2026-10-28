// The player's flasks (core/throws.js) in the current cube: in flight, bursting, and what the
// fire and toxic ones leave behind for a while: a burning patch, a poison cloud. With a flask
// in hand (core/inventory.js readied) a click throws it at the cursor (game/input.js), or the
// touch action button aims it like a stick (game/touch.js), and the arc it would fly is shown
// (render/throws.js). Nothing here hurts the player. Travel and level
// resets clear them all. Playing together, the friend's flasks fly and burst here too (`ghost`),
// but what they do to the enemies is the friend's to do.
import { player, state, view, setStatus } from './state.js';
import { insideSolid, groundAt } from '../physics/collide.js';
import { clearLine } from '../physics/enemynav.js';
import { damageEnemy, readiedFlask } from '../core/combat.js';
import { launchFlask, stepFlask, releasePoint, clampTarget, arcOf, burstVictims, inArea } from '../core/throws.js';
import { slotOf, removeItem, readiedItem } from '../core/inventory.js';
import { startCooldown } from '../core/potions.js';
import { hitEnemy, rolls } from './sword.js';
import { afflictEnemy } from './statuses.js';
import { flaskFx, evadedFx } from './juice.js';
import { pickFloor, aimPoint, hoveredEnemy, pointer } from './pointer.js';
import { syncEquippedWeapon } from './equipment.js';
import { controls } from './inputstate.js';
import { inFluid, trialFluid } from '../physics/fluid.js';
import { douses } from '../core/douse.js';
import { screenToWorld, aimReach } from '../core/stick.js';
import { unturn } from '../core/roll.js';
import { relay } from '../net/online.js';
import { drawFlasks, removeFlaskViews, drawAreas, removeAreaViews, drawArc } from '../render/throws.js';
import { absent, hurtBy, evades } from '../core/enemies.js';
import { tr } from '../i18n/i18n.js';

export let flasks = [], areas = [];
const solid = (x, y, z) => insideSolid(x, z, y);

// What a throw would aim at: the touch aim while a thumb aims; else the enemy under the cursor
// (its feet), else the floor under it, else the cursor's point at the player's height; null off
// the game.
export function throwTarget() {
  if (controls.aim.active) return aimTarget();
  const e = hoveredEnemy();
  if (e) return { x: e.x, y: e.y, z: e.z, enemy: e };
  const hit = pickFloor();
  if (hit) return { x: hit.x, y: hit.y, z: hit.z };
  const a = aimPoint(player.y);
  return a && { x: a.x, y: player.y, z: a.z };
}
// the touch aim (game/touch.js): that way on the screen (also with the world rolled: you aim at the
// mark you see, game/roll.js), as far as pushed, on the floor there
// (or at the player's height over a drop); null in the middle
function aimTarget() {
  const flask = readiedFlask(player), a = controls.aim;
  if (!flask || !a.m) return null;
  const [dx, dz] = screenToWorld(...unturn(a.x, a.y, view.roll), view.yaw), d = aimReach(a.m, flask.flask.range);
  const x = player.x + dx * d, z = player.z + dz * d, h = groundAt(x, z, player.y + 1.5, 0).h;
  return { x, y: Number.isFinite(h) && h > player.y - 4 ? h : player.y, z };
}
// where a throw at `target` (an enemy, a point, or null: straight ahead) comes down, in range
function landing(p, target, range, yaw) {
  const to = target ?? { x: p.x + Math.sin(yaw) * range * 0.6, y: p.y, z: p.z + Math.cos(yaw) * range * 0.6 };
  return clampTarget(p.x, p.z, { x: to.x, y: to.y, z: to.z }, range);
}

// The throw with stats `stats` lets its flask go at `target`, from p turned to `yaw`: one
// fewer in the bag, and that kind's cooldown starts. The last one gone, the weapon comes back.
export function throwFlask(p, stats, target, yaw) {
  const inv = p.inventory, slot = slotOf(inv, stats.flask);
  if (!slot) return null;
  removeItem(inv, slot.instanceId, 1);
  startCooldown(p, stats.flask, state.time);
  const f = launchFlask(releasePoint(p, yaw), landing(p, target, stats.range, yaw), stats);
  flasks.push(f);
  flaskFx(f, 'launch');
  relay.toss?.(f);
  if (!readiedItem(inv)) { syncEquippedWeapon(); setStatus(tr('That was the last one')); }
  return f;
}

// the flask bursts where it is: it hurts, burns or poisons the enemies around (in sight of the
// burst; a blurry Flimmer may shimmer out of its way, core/enemies.js evades), and a fire or toxic
// one leaves its patch or cloud on the floor below
function burst(f, enemies) {
  const s = f.stats, at = { x: f.x, y: f.y, z: f.z };
  for (const { e, share } of f.ghost ? [] : burstVictims(at, s.radius, enemies)) {
    if (!clearLine(at.x, at.y + 0.25, at.z, e.x, e.y + e.profile.bodyHeight * 0.5, e.z)) continue;
    if (evades(e, rolls.evade())) { evadedFx(e, e.x - at.x, e.z - at.z); continue; }
    if (s.blast) {
      const before = e.hp, damage = Math.max(1, Math.round(s.blast * share * hurtBy(e)));
      if (damageEnemy(e, damage)) hitEnemy(e, { damage, crit: false }, before, e.x - at.x, e.z - at.z, s.burn ? 0.4 : 1.8);
    }
    if (s.burn) afflictEnemy(e, 'burning', s.burn);
    if (s.toxin) afflictEnemy(e, 'toxic', s.toxin);
  }
  if (!f.ghost) state.enemyGrace = 0;   // you started it
  const ground = groundAt(at.x, at.z, at.y + 0.3, 0), floor = ground.h;
  const y = Number.isFinite(floor) && at.y - floor < 2.5 ? floor : null;
  const ghost = !!f.ghost;
  // (no fire burns on the bed under water or acid)
  if (y !== null && s.patch && !douses(inFluid(ground, y + 0.05))) areas.push({ kind: 'fire', status: 'burning', spec: s.burn, x: at.x, y, z: at.z, r: s.radius * 0.8, t: 0, time: s.patch, ghost });
  if (y !== null && s.cloud) areas.push({ kind: 'toxic', status: 'toxic', spec: s.toxin, x: at.x, y, z: at.z, r: s.radius, t: 0, time: s.cloud, ghost });
  flaskFx(f, 'burst');
}

export function updateThrows(dt, enemies) {
  if (state.inventoryOpen || state.transitioning) return;
  if (flasks.length) flasks = flasks.filter(f => {
    const end = stepFlask(f, dt, enemies, solid);
    f.spin += dt * 9;
    if (!end) return true;
    if (end !== 'lost') burst(f, enemies);
    removeFlaskViews([f]);
    return false;
  });
  // what walks into a burning patch catches fire, what stands in a cloud is poisoned (a status
  // already running is left to run, core/status.js)
  const tf = trialFluid();
  for (const a of areas) {
    a.t += dt;
    // a trial's water rising over a burning patch puts it out
    if (a.kind === 'fire' && tf && douses(tf.fluid) && tf.y > a.y + 0.05) a.t = a.time;
    if (!a.ghost) for (const e of enemies)
      if (!e[a.status] && !absent(e) && inArea(a, e.x, e.y, e.z, e.profile.radius)) afflictEnemy(e, a.status, a.spec);
  }
  if (areas.some(a => a.t >= a.time)) {
    removeAreaViews(areas.filter(a => a.t >= a.time));
    areas = areas.filter(a => a.t < a.time);
  }
}
// the friend's flask (what relay.toss sent): it flies and bursts here, harmlessly
export function ghostFlask(f) {
  const g = { ...f, ghost: true };
  flasks.push(g);
  flaskFx(g, 'launch');
}
export function drawThrows(dt, off) { drawFlasks(flasks, dt, off); drawAreas(areas, dt, off); }
export function clearThrows() { removeFlaskViews(flasks); removeAreaViews(areas); flasks = []; areas = []; }

// every frame: the arc a click (or the touch aim) would throw the flask in hand along, or none
export function updateAim(enemies) {
  const flask = readiedFlask(player);
  if (!flask || !state.map || state.inventoryOpen || state.transitioning || !(pointer.inside || controls.aim.active) || player.ragdoll || player.climb || player.swimming
      || (player.sword.active && player.sword.fired)) { drawArc(null); return; }
  const target = throwTarget();
  if (!target) { drawArc(null); return; }
  const range = flask.flask.range, yaw = Math.atan2(target.x - player.x, target.z - player.z);
  const to = landing(player, target, range, yaw), arc = arcOf(releasePoint(player, yaw), to, enemies, solid);
  drawArc({ ...arc, radius: flask.flask.radius, color: flask.flask.color, clamped: !!to.clamped });
}
