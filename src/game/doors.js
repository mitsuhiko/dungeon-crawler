// House doors. Walk into a house's door in town and you are inside it (cubegen/interior.js);
// walk into the door inside and you are back on the doorstep. Doors take you at once, like side
// portals (no charge), with a fade between: the two places are not neighbours. The rules
// (which door, where you arrive) are core/doors.js.
import { atDoor, doorArrival, doorBack } from '../core/doors.js';
import { sfx } from '../audio/sfx.js';
import { player, state, setStatus } from './state.js';
import { whenReady, fadeOut, fadeIn } from './hud.js';
import { enterCube } from './flow.js';
import { cancelSword } from './sword.js';
import { cancelCast } from './townportal.js';
import { clearMouseInput } from './orders.js';
import { tr } from '../i18n/i18n.js';

const FADE_MS = 380;

// every step (game/portals.js): through a door the player walks into
export function checkDoors(dx = 0, dz = 0) {
  if (state.transitioning || !player.grounded) return false;
  const d = (state.map.doors || []).find(d => atDoor(player, d, dx, dz));
  return d ? takeDoor(d) : false;
}

export function takeDoor(d) {
  if (state.transitioning) return false;
  const cubes = state.cubes, from = state.cubeKey;
  state.transitioning = true;
  state.portalCharge = null;
  cancelCast(); cancelSword(true); clearMouseInput();
  sfx('door', { at: player });
  fadeOut();
  setTimeout(() => whenReady(cubes.get(d.to)).then(c => {
    if (state.cubes !== cubes) return;
    const back = doorBack(c.map, d, from);
    if (!back) throw new Error('No door back from ' + d.to);
    const at = doorArrival(back);
    enterCube(c, null, null, at);
    player.yaw = at.yaw;
    state.transitioning = false;
  }).catch(e => {
    console.error(e);
    if (state.cubes !== cubes) return;
    state.transitioning = false;
    fadeIn();
    setStatus(tr('The door is stuck'));
  }), FADE_MS);
  return true;
}
