// The town portal scroll. Using it starts a 5 s cast; moving, jumping, attacking, being hurt or
// knocked over interrupts it. Then a portal opens on free ground in front of you (or beside you:
// a 1.5 x 1.5 cell spot is enough). Without such a spot the scroll is not read at all. It works like
// a well: stand in it (it charges for a second) and the screen fades to town, where its other
// end stands beside the plaza. Stepping into that end fades you back to exactly where you cast
// it, and both ends close. Casting again moves the portal; a new world closes it.
import { N, STEP, DIRS } from '../core/constants.js';
import { isFaceOpen, faceDistance } from '../core/boundaries.js';
import { CAST_TIME, PAD_RADIUS, padOffsets } from '../core/townportal.js';
import { isInterior } from '../world/town.js';
import { groundAt, blockedAt } from '../physics/collide.js';
import { respawnPoint, supportedPoint } from '../physics/respawn.js';
import { setTownPortal } from '../render/world.js';
import { floatText } from '../render/floattext.js';
import { sfx } from '../audio/sfx.js';
import { player, state, setStatus } from './state.js';
import { sealedIn } from './trials.js';
import { SEALED_MESSAGE } from '../core/trials.js';
import { whenReady, fadeOut, fadeIn } from './hud.js';
import { enterCube } from './flow.js';
import { cancelSword } from './sword.js';
import { clearMouseInput } from './orders.js';
import { tr, msg } from '../i18n/i18n.js';

const FADE_MS = 380;

// status messages are a dev overlay; what the player needs to see also rises over C
function say(message) {
  setStatus(message);
  floatText(message, q => q.set(player.x, player.visY + 2.1, player.z), { color: '#d9c2ff', size: 0.2, life: 1.8, rise: 0.35 });
}

// why the scroll cannot be read right now (null: it can)
function castBlocked() {
  const p = player;
  if (!state.map || state.transitioning) return tr('Not now');
  if (state.map?.waterfallRoom) return tr('Swim back through the small waterfall first');
  if (state.map.town || isInterior(state.cubeKey)) return tr('You are already in town');
  if (sealedIn()) return tr(SEALED_MESSAGE);   // a trial room while its event runs (game/trials.js)
  if (state.fallFrom || p.hp <= 0 || p.ragdoll || p.getUp || p.climb || p.swimming || !p.grounded) return tr('You need firm ground to open a portal');
  if (p.stun > 0 || p.sword.active) return tr('Finish your current action first');
  return null;
}

// use the scroll: start casting (or stop a cast in progress)
export function useTownPortal() {
  if (state.cast) { cancelCast(tr('Portal cancelled')); return false; }
  const why = castBlocked();
  if (why) { say(why); return false; }
  // look for room first: no point standing still for 5 s to learn there is none
  if (!padSpot()) { say(tr(NO_ROOM)); sfx('fizzle'); return false; }
  startCast({ kind: 'townPortal', duration: CAST_TIME, firm: true, done: openTownPortal });
  setStatus(tr('Opening a portal to town... hold still'));
  return true;
}

// Start reading a scroll (this one, or the room portal scroll, game/roomportal.js): kind: the
// item's `use`; done: what happens once it is read; firm: it needs you standing on firm ground
// all along (else only not to fall or drift off far).
export function startCast({ kind, duration, firm, done }) {
  state.cast = { kind, t: 0, duration, firm, done, x: player.x, y: player.y, z: player.z, since: state.time };
  sfx('castStart');
  clearMouseInput();
}

export function cancelCast(message = '') {
  if (!state.cast) return;
  state.cast = null;
  if (message) { say(message); sfx('fizzle'); }
}

// every simulation step while casting; moving: the player asked to move or jump this step
export function tickCast(dt, moving) {
  const c = state.cast, p = player;
  if (!c) return;
  const drift = Math.hypot(p.x - c.x, p.z - c.z);
  if (moving || p.sword.active || p.sword.requested || p.lastDamageAt > c.since || p.ragdoll || state.fallFrom
    || (c.firm ? p.climb || p.swimming || !p.grounded || drift > 0.2 : drift > 1 || c.y - p.y > 1)) {
    cancelCast(tr('Portal interrupted'));
    return;
  }
  c.t += dt;
  if (c.t >= c.duration) { state.cast = null; c.done(); }
}

// on (or right next to) one of the cube's own portal pads: wells and rings (a side gate is
// only a way across its face: edgeClear keeps the pad off that)
const nearPortal = (x, z) => state.map.portals.some(q => (q.kind === 'up' || q.kind === 'down') && q.cells.some(c => {
  const cx = c % N, cz = Math.floor(c / N);
  return Math.hypot(x - Math.max(cx, Math.min(cx + 1, x)), z - Math.max(cz, Math.min(cz + 1, z))) < PAD_RADIUS + 0.4;
}));

const NO_ROOM = msg('No room for a portal here');
// the disc stays inside the cube, and off an open face: whoever stands in it is not
// crossing over (they cross within 0.4 of it, game/portals.js)
const edgeClear = (x, z) => DIRS.every((_, d) => faceDistance({ x, z }, d)
  >= (isFaceOpen(state.openedFaces, state.cubeKey, d) ? 1 : PAD_RADIUS + 0.1));

// a spot for the pad: dry, flat, supported ground under its whole disc, best a step or two in
// front of the player, else anywhere around them down to right beside them (core/townportal.js
// padOffsets), on their level, clear of the cube's own portals and reachable in a straight line
function padSpot() {
  const p = player, ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
  for (const [dx, dz] of padOffsets(p.yaw, p.r)) {
    const x = p.x + dx, z = p.z + dz;
    if (!edgeClear(x, z)) continue;
    const s = supportedPoint(x, p.y, z);
    if (!s || Math.abs(s.y - p.y) > STEP) continue;
    if (nearPortal(x, z)) continue;
    const flat = ring.every(([dx, dz]) => {
      const px = x + dx * PAD_RADIUS, pz = z + dz * PAD_RADIUS, g = groundAt(px, pz, s.y, STEP);
      return g.s && !g.s.fluid && Math.abs(g.h - s.y) < 0.25 && !blockedAt(px, pz, s.y, STEP);
    });
    const clear = [.25, .5, .75].every(t => !blockedAt(p.x + (x - p.x) * t, p.z + (z - p.z) * t, p.y, STEP));
    if (flat && clear) return s;
  }
  return null;
}

function openTownPortal() {
  const pad = padSpot();
  if (!pad) { say(tr(NO_ROOM)); sfx('fizzle'); return; }
  const back = respawnPoint({ x: player.x, y: player.y, z: player.z });
  state.run.townPortal = { key: state.cubeKey, depth: state.map.depth, pad, back };
  setTownPortal(state.world, pad);
  sfx('portal', { at: pad });
  setStatus(tr('A portal to town opens'));
}

// where you stand in town: beside the town end, towards the middle of the plaza (its tile's)
function townArrival(m, pad) {
  const dx = N / 2 - pad.x, dz = N / 2 - pad.z, d = Math.hypot(dx, dz) || 1;
  return { x: pad.x + dx / d * 1.4, y: pad.y, z: pad.z + dz / d * 1.4, yaw: Math.atan2(dx, dz) };
}

// stepped through either end (game/portals.js): fade to the other one
export function takeTownPortal() {
  const tp = state.run.townPortal;
  if (!tp || state.transitioning) return false;
  const toTown = !state.map?.town, cubes = state.cubes, run = state.run;
  state.transitioning = true;
  state.portalCharge = null;
  cancelCast(); cancelSword(true); clearMouseInput();
  sfx('portal');
  fadeOut();
  setTimeout(() => whenReady(cubes.get(toTown ? cubes.town.portal : tp.key)).then(c => {
    if (state.cubes !== cubes || state.run !== run) return;
    const at = toTown ? townArrival(c.map, c.map.town.portal) : { ...tp.back };
    if (!toTown) run.townPortal = null;   // back through: both ends close
    enterCube(c, null, null, at);
    if (toTown) player.yaw = at.yaw;
    state.transitioning = false;
    say(toTown ? tr('The portal back to depth {depth} stays open', { depth: tp.depth }) : tr('The portal closes behind you'));
  }, () => {
    if (state.cubes !== cubes) return;
    state.transitioning = false;
    fadeIn();
    say(tr('The portal does not open'));
  }), FADE_MS);
  return true;
}
