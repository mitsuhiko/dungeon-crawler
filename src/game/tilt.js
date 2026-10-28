// The world's tilt (core/sollmeldon.js has the rules, docs/camera.md "The world's tilt"): the cube
// tips a little to one side where Sollmeldon lands (his `tilt`, the way it tips down and how far,
// 1 at TILT.angle; it comes to friends with his row, so every game tips its own view after him).
// Only the view tips (`view.tilt`: the way, radians; game/camera.js turns the camera about the
// middle of the cube the other way); gravity stays with the floor, the hero keeps their footing and
// the keys go as they did. His mud is pulled to the low side and runs there (game/mud.js). Back level once he is beaten or gone; level at once in another cube
// and out of play. The developer's /tilt tips it without him (game/devcommands.js) and holds it.
import { state, view } from './state.js';
import { SOLLMELDON_FIGHT, newTilt, tiltToward, levelTilt, stepTilt } from '../core/sollmeldon.js';

const TILT = SOLLMELDON_FIGHT.tilt;
let want = [0, 0], cube = null;
let held = null;   // the developer's tilt (core/sollmeldon.js newTilt), null: his

// the tilt the developer holds ([x, z]), or null
export const heldTilt = () => held && held.v;
// /tilt: tip the world towards (dx, dz) (cells; [0, 0]: level it again and let go)
export function holdTilt(dx, dz) {
  if (!dx && !dz) { if (held) levelTilt(held); return; }
  held ??= newTilt();
  tiltToward(held, dx, dz);
  held.hold = Infinity;
}
// every step, with the enemies of the cube (ours or those we are shown)
export function followTilt(list) {
  if (state.cubeKey !== cube) { cube = state.cubeKey; resetTilt(); }
  const e = list.find(x => x.boss === 'sollmeldon' && x.mode !== 'dead' && Array.isArray(x.tilt));
  want = held ? held.v : e ? e.tilt : [0, 0];
}
export function updateTilt(dt) {
  if (state.mode !== 'play') { if (view.tilt[0] || view.tilt[1] || held) resetTilt(); return; }
  if (held && stepTilt(held, dt) === 'level') held = null;
  // (eased a little more: a friend's rows come now and then)
  const k = Math.min(1, dt * 10);
  view.tilt = [view.tilt[0] + (want[0] * TILT.angle - view.tilt[0]) * k, view.tilt[1] + (want[1] * TILT.angle - view.tilt[1]) * k];
  if (Math.hypot(view.tilt[0], view.tilt[1]) < 1e-5 && !want[0] && !want[1]) view.tilt = [0, 0];
}
export function resetTilt() { held = null; want = [0, 0]; view.tilt = [0, 0]; }
// how it is now (the checks): the way it tips and how far (degrees), held by the developer
export const tiltNow = () => ({ x: view.tilt[0] * 180 / Math.PI, z: view.tilt[1] * 180 / Math.PI, held: !!held });
