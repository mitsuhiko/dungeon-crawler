// The world's roll on the screen (core/roll.js has the rules, docs/camera.md tells it): how far it
// is turned (`view.roll`, game/camera.js turns the camera by it) and the angle the movement keys
// follow (`view.keyRoll`, game/input.js). Monteur turns it (`followRoll`: his `quarter`, which comes
// to friends with his row, so every game turns its own view after him; back the right way up once
// he is beaten or nowhere here), and so do the developer commands (/roll, /rollkeys:
// game/devcommands.js; while they hold it, he does not). Out of play (the main menu) and in another
// cube it is unturned at once.
import { state, view } from './state.js';
import { ROLL, KEY_MODES, stepRoll, nextStop, stepKeys, nearestTo } from '../core/roll.js';

const r = { angle: 0, target: 0, speed: 0 };
let spin = false;        // going on from quarter to quarter by itself
let rest = 0;            // s it has rested at its target
let holdFor = 0;         // s it rests there, spinning, before it goes on
let mode = 'catchup';    // what the keys follow (core/roll.js KEY_MODES)
let keyAngle = 0;
let held = false;        // the developer commands hold it (Monteur does not turn it meanwhile)
let followed = null;     // the quarter a Monteur here wants (null: none), and the cube it was in
let cube = null;

const deg = a => Math.round(a * 180 / Math.PI);
const quarterOf = a => ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4 * 90;

// how it is now (the dev commands, the checks): degrees, unwrapped for `angle`
export const rollNow = () => ({ angle: deg(r.angle), target: deg(r.target), at: quarterOf(r.target), spin, mode, keys: deg(keyAngle),
  turning: r.angle !== r.target });

// turn to a quarter (degrees: 0, 90, 180, 270), the shorter way, and stay there (now: at once, the
// keys too, as if it had rested there long: the checks)
export function setRoll(degrees, now = false) {
  spin = false;
  r.target = nearestTo(r.angle, degrees * Math.PI / 180);
  if (!now) return;
  r.angle = r.target; r.speed = 0; rest = ROLL.settle + 10;
  keyAngle = stepKeys(mode, keyAngle, r.angle, rest, 1e3);
  view.roll = r.angle; view.keyRoll = keyAngle;
}
// spin: from quarter to quarter by itself (resting a while at each), starting now
export function spinRoll() {
  spin = true;
  holdFor = 0;
}
// the developer commands take the roll over (on) or give it back to the fight (off: and it turns
// back the right way up, or to where a Monteur here has it)
export function holdRoll(on) {
  held = on;
  if (!on) { spin = false; followed = undefined; }
}

// Every step, with the enemies of the cube (ours or those we are shown): a Monteur alive here turns
// the world to his quarter; with none, it turns back the right way up. Into another cube (and out
// of play) it is the right way up at once.
export function followRoll(list) {
  if (state.cubeKey !== cube) { cube = state.cubeKey; if (!held) resetRoll(); followed = null; }
  if (held) return;
  const m = list.find(e => e.boss === 'monteur' && e.mode !== 'dead' && Number.isInteger(e.quarter));
  const want = m ? m.quarter : null;
  if (want === followed) return;
  followed = want;
  spin = false;
  r.target = nearestTo(r.angle, (want ?? 0) * Math.PI / 2);
}
// unturned at once (out of play, the checks)
export function resetRoll() {
  r.angle = r.target = r.speed = 0;
  spin = false; rest = 0; holdFor = 0; keyAngle = 0; followed = undefined;
  view.roll = view.keyRoll = 0;
}
export const rollKeys = () => mode;
export function setRollKeys(m) {
  if (!KEY_MODES.includes(m)) return false;
  mode = m;
  return true;
}

export function updateRoll(dt) {
  if (state.mode !== 'play') { if (r.angle || r.target || spin) resetRoll(); return; }
  stepRoll(r, dt);
  const moving = r.angle !== r.target;
  rest = moving ? 0 : rest + dt;
  if (spin && !moving && rest >= holdFor) {
    r.target = nextStop(r.target, Math.random());
    holdFor = ROLL.hold[0] + Math.random() * (ROLL.hold[1] - ROLL.hold[0]);
    rest = 0;
  }
  keyAngle = stepKeys(mode, keyAngle, r.angle, rest, dt);
  view.roll = r.angle;
  view.keyRoll = keyAngle;
}
