// Portal travel without a cut: the next cube is built beside (or below / above) this one, and
// both slide past the camera while the character walks, falls or floats through. The new cube
// is the active one from the start; the player moves in its coordinates plus the slide offset,
// so when the slide ends everything is exactly where it belongs.
import * as THREE from 'three';
import { N, CUBE_H, BASE, STEP, SWIM_STEP, SNAP } from '../core/constants.js';
import { isFaceOpen, openedSides, boundaryArrival, portalsOnly } from '../core/boundaries.js';
import { portalLocked, guardianLockMessage, lockMessage } from '../core/guardians.js';
import { guardianKind } from './enemyspawn.js';
import { step, D6, OPP6, faceKey } from '../world/coords.js';
import { setWorldOpenFaces } from '../render/world.js';
import { setGlassFaces, setGlassShut } from '../render/glass.js';
import { blockedAt, groundAt } from '../physics/collide.js';
import { railedFace } from '../physics/canmove.js';
import { respawnPoint } from '../physics/respawn.js';
import { detachNeighbors, buildNeighbors, showsNeighbor } from '../render/neighbors.js';
import { showPortalCloud, hidePortalCloud, CLOUD_DELAY } from '../render/portalcloud.js';
import { setFade } from '../render/fade.js';
import { setCut } from '../render/section.js';
import { shiftParticles } from '../render/particles.js';
import { shiftFloatText } from '../render/floattext.js';
import { shiftHeroFeet } from '../render/animator.js';
import { player, state, setStatus } from './state.js';
import { sfx } from '../audio/sfx.js';
import { jingle } from '../audio/jingles.js';
import { whenReady } from './hud.js';
import { resetEnemies, detachEnemies, drawEnemies, allEnemies } from './enemies.js';
import { cancelSword } from './sword.js';
import { clearMouseInput } from './orders.js';
import { arrivalPoint, spawnAt, settleIn, visitedNeighbors, discover, beginVisit, devShores, buildCube } from './flow.js';
import { enterTrial } from './trials.js';
import { slideVisuals, endVisuals } from './travelfx.js';
import { fallPoint } from './fall.js';
import { catchFall, liftArrived } from './rescue.js';
import { cancelCast } from './townportal.js';
import { tr } from '../i18n/i18n.js';
import { endHandover } from './handover.js';

const GAP = CUBE_H + BASE;   // vertical distance between strata while sliding
let trip = null;
const off = new THREE.Vector3(), oldOff = new THREE.Vector3();
const ease = t => t * t * (3 - 2 * t);

export const travelling = () => !!trip;
// Where the player really is: while travelling, the point on the walk in the new cube's
// coordinates (player.x / z also carry the slide offset, as everything drawn slides with it).
// What the minimap shows and the others are told (net/session.js), so neither jumps a cube
// ahead and back as the slide starts.
export const truePosition = () => trip ? (trip.last ?? trip.S) : player;
// what kind of trip goes on ('side', 'down', 'up', 'fall', 'lift': the robot carrying the hero back
// up out of the cube a fall went into, game/fall.js liftBack; null: none), and the cube it left:
// { key, group } where that is drawn while the slide carries it away (game/robot.js)
export const tripKind = () => trip?.kind ?? null;
export const leftCube = () => trip ? { key: trip.oldKey, group: trip.old.world.group } : null;
// while sliding, the two cubes as drawn: [[map, offset (world)], ...], the new one first; for what
// asks the ground under a point of the world (the hero's feet, render/animator.js). Null: none
export const slidingCubes = () => trip?.cubes ?? null;

// the cube behind the portal may still be generating: wait for it (frozen in the portal).
// A side portal into a cube not drawn yet gets a cloud to walk onto (render/portalcloud.js).
// force: ignore guardian locks (dev tools, game/dev.js); the gate itself stays locked.
// A 'lift' (game/fall.js liftBack): p.at, where it comes out; p.failed, should that cube not come.
export function startTravel(p, { force = false } = {}) {
  if (state.transitioning || (state.inventoryOpen && p.kind !== 'lift')) return;
  if (!force && portalLocked(state.map, state.run, p)) { setStatus(lockMessage(state.map, p.dir, guardianKind(state.map))); return; }
  clearMouseInput();
  state.transitioning = true;
  cancelSword(); cancelCast();
  const source = state.cubeKey, cubes = state.cubes, k = step(source, p.dir);
  const cloud = p.kind === 'side' && !showsNeighbor(k);   // somewhere new: nothing drawn there yet
  if (cloud) { showPortalCloud(p, player); sfx('cloud', { volume: 0.7 }); }
  // the town portal sounds on its own (game/townportal.js), a fall whistles (game/sounds.js)
  const sound = { side: 'gate', down: 'wellDown', up: 'ringUp' }[p.kind];
  if (sound) sfx(sound);
  // a portal not gone through before (the cube behind it not visited yet): the jingle portal;
  // not one gone through before, nor walking across an open face
  if (sound && !cubes.cubes.get(k)?.visits) jingle('portal');
  whenReady(cubes.get(k)).then(c => {
    if (state.cubes === cubes && state.cubeKey === source) slide(p, c, cloud); else hidePortalCloud();
  }, () => {
    hidePortalCloud();
    if (state.cubes !== cubes || state.cubeKey !== source) return;
    state.transitioning = false;
    if (p.failed) p.failed(); else setStatus(tr('The portal does not open'));
  });
}

function slide(p, c, cloud) {
  endHandover();   // (a cube walked out of still dissolving: game/handover.js)
  const k = c.key, m = c.map, oldKey = state.cubeKey;
  const oldWorld = state.world, oldMap = state.map;
  const crossing = p.kind === 'side' && isFaceOpen(state.openedFaces, oldKey, p.dir);
  // Only open-boundary travel preserves motion. Ordinary portal and fall travel is unchanged.
  const motion = crossing ? Object.fromEntries(['vx', 'vy', 'vz', 'grounded', 'swimming', 'fluid', 'airTime', 'coyote', 'jumpBuf', 'stun', 'layer'].map(key => [key, player[key]])) : null;
  state.map = m;   // arrivalPoint and collision queries read the destination map
  const arr = m.portals.find(q => q.dir === OPP6[p.dir]), fall = p.kind === 'fall' && fallPoint(m);
  // carried back up out of a fall: into the cube it started in, as it was then (its visit goes on)
  const lift = p.kind === 'lift' ? state.fallFrom : null;
  const A = crossing ? boundaryArrival(player, p.dir) : fall ? fall.air : lift ? p.at : arrivalPoint(arr);
  // No route/safety adjustment: just respect solid terrain at the destination, as walking
  // would. A body-sized footprint also prevents sliding into a pillar or cliff beside it.
  // Nor onto a stair or bridge over its side rail (physics/canmove.js railedFace).
  if (crossing && (railedFace(A.x, A.z, A.y, OPP6[p.dir]) || [[0, 0], [player.r, 0], [-player.r, 0], [0, player.r], [0, -player.r]].some(([dx, dz]) =>
    blockedAt(A.x + dx, A.z + dz, A.y, player.swimming ? SWIM_STEP : STEP)))) {
    state.map = oldMap; state.transitioning = false; hidePortalCloud();
    setStatus(tr('The way across is blocked'));
    return;
  }
  // a forced (dev) trip past a guardian leaves its gate locked and closed
  if (p.kind === 'side' && !portalLocked(oldMap, state.run, p)) {
    state.openedFaces.add(faceKey(oldKey, p.dir));
    setWorldOpenFaces(oldWorld, openedSides(state.openedFaces, oldKey));
  }
  const D = new THREE.Vector3(D6[p.dir][0] * N, D6[p.dir][1] * GAP, D6[p.dir][2] * N);
  trip = { t: 0, s: 0, D, kind: p.kind, k, oldKey, old: { world: oldWorld, enemies: detachEnemies(), ghosts: detachNeighbors() },
    S: new THREE.Vector3(player.x, player.y, player.z).sub(D), A: new THREE.Vector3(A.x, A.y, A.z), last: null, motion,
    drawn: D.clone(),   // the new cube's offset as last drawn (the old one's is that minus D)
    cubes: [[m, off], [oldMap, oldOff]] };
  off.copy(D); oldOff.set(0, 0, 0);   // (as drawn until the first updateTravel)
  // T: the walk and slide. Into a cube not drawn yet the new cube fades in CLOUD_DELAY later
  // (game/travelfx.js), so the travel lasts that much longer: you wait on the cloud.
  trip.T = p.kind === 'side' ? THREE.MathUtils.clamp(trip.S.distanceTo(trip.A) / 2.2, 0.9, 1.4) : 1.3;
  trip.delay = cloud ? CLOUD_DELAY : 0;
  setCut(Infinity, null, 0, 0, 0);
  if (!lift && discover(c)) setWorldOpenFaces(oldWorld, openedSides(state.openedFaces, oldKey));
  state.cubeKey = k;
  if (lift) {
    Object.assign(state, { arrival: lift.arrival, portalLock: lift.portalLock, boundaryLock: lift.boundaryLock, visit: lift.visit, fallFrom: null });
  } else {
    state.arrival = fall ? fall.rest : A;
    beginVisit();
    state.portalLock = fall || p.kind === 'side' ? 0 : arr.id;
    state.boundaryLock = p.kind === 'side' ? OPP6[p.dir] : -1;
  }
  trip.A0 = A;
  devShores(m);
  // with the people living here and what the quests put here (else the quests found it changed
  // once the slide ended and built the whole cube again: game/quests.js), and the portals into
  // trial rooms warning of them (game/flow.js buildCube); its bake most likely made ahead
  // (game/bakeahead.js)
  state.world = buildCube(c);
  setGlassShut(state.world.glass, portalsOnly(m, state.run));
  enterTrial(m);   // its trial, as built or resolved (game/trials.js)
  // Live crossings retain their height/motion; the death entry must be supported and dry.
  state.arrival = respawnPoint(state.arrival);
  state.world.group.position.copy(D);
  setFade(state.world.group, 0);
  trip.ghosts = buildNeighbors(visitedNeighbors(k), trip.old.ghosts);   // common cubes stay visible
  // Reused proxies now use destination-local coordinates, but start beside the old cube.
  for (const g of trip.ghosts) g.group.position.copy(g.base).add(D);
  for (const g of trip.old.ghosts) {
    g.fade0 = g.group.userData.fade;
    setGlassFaces(g.glass, openedSides(state.openedFaces, g.key));
  }
  resetEnemies();
}


export function updateTravel(dt) {
  trip.s = Math.min(trip.T + trip.delay, trip.s + dt);   // seconds; the walk ends at T
  trip.t = Math.min(1, trip.s / trip.T);
  const t = trip.t, e = ease(t), p = player;
  off.copy(trip.D).multiplyScalar(1 - e); oldOff.copy(off).sub(trip.D);
  // what is in the air (sparks, embers, fireflies, numbers) slides with both cubes
  const dx = off.x - trip.drawn.x, dy = off.y - trip.drawn.y, dz = off.z - trip.drawn.z;
  // and so does the ground the hero's feet stand on
  if (dx || dy || dz) { shiftParticles(dx, dy, dz); shiftFloatText(dx, dy, dz); shiftHeroFeet(dx, dy, dz); trip.drawn.copy(off); }
  // the path in the new cube's coordinates: walk straight through, fall, or rise
  const u = trip.kind === 'side' ? t : trip.kind === 'up' || trip.kind === 'lift' ? 1 - (1 - t) ** 2 : t * t;
  const x = trip.S.x + (trip.A.x - trip.S.x) * t, z = trip.S.z + (trip.A.z - trip.S.z) * t, y = trip.S.y + (trip.A.y - trip.S.y) * u;
  if (trip.last) { p.vx = (x - trip.last.x) / dt; p.vz = (z - trip.last.z) / dt; p.vy = (y - trip.last.y) / dt; }
  trip.last = { x, y, z };
  Object.assign(p, { x: x + off.x, y: y + off.y, visY: y + off.y, z: z + off.z,
    grounded: trip.motion ? trip.motion.grounded : trip.kind === 'side', swimming: trip.motion?.swimming ?? false });
  p.airTime = p.grounded ? 0 : p.airTime + dt;
  slideVisuals(trip, t, off, oldOff);
  if (trip.s >= trip.T + trip.delay) finish();
}

export function drawTravelEnemies(dt) {
  drawEnemies(dt, trip ? off : undefined);
  if (trip) for (const e of allEnemies()) if (e.view) e.view.group.visible = trip.fadeNew > 0.5 && e.view.group.visible;
}

function finish() {
  endVisuals(trip);
  const landed = trip.kind === 'down', falling = trip.kind === 'fall', lifted = trip.kind === 'lift', hp = player.hp, A = trip.A0, motion = trip.motion;
  const carried = player.rescue;   // (the robot's, through a 'lift': spawnAt lets go)
  trip = null;
  spawnAt(A.x, A.y, A.z);
  player.hp = hp;
  if (lifted && carried) Object.assign(player, { rescue: carried, grounded: false, support: null });
  if (motion) {
    const gr = groundAt(A.x, A.z, A.y, motion.swimming ? SWIM_STEP : STEP);
    Object.assign(player, motion);
    player.support = gr.s;
    player.grounded = motion.grounded && Math.abs(gr.h - A.y) <= SNAP;
    if (player.grounded && gr.s) player.layer = gr.s.kind ? gr.s.run.layer : gr.s.layer;
  }
  if (falling) { player.safe = { ...state.arrival }; Object.assign(player, { grounded: false, vy: -6, support: null }); }
  if (landed) { player.landImpact = 4; player.landCount++; }
  settleIn();   // reconcile toggles made during travel; unchanged proxies are reused
  state.transitioning = false;
  // the robot: carried back up, on to safe ground; fallen into this cube, caught before landing
  if (lifted) liftArrived();
  if (falling && state.fallFrom?.catch) catchFall(true);
}
