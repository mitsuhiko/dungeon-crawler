// Browser checks for the world's roll (docs/camera.md "The world's roll"): the camera turned about
// where it looks, which way the movement keys run the hero on the screen in each mode (projected
// through the turned camera), the mouse look turning the way the mouse went on the screen, the
// slow turn with a key held latched through it (and taken anew when another is pressed) and
// catching up once it rests, and /roll and /rollkeys. Wherever the hero stands; the
// roll, its key mode and the view come back afterwards. From the console:
//   await (await import('./tests/browser/roll.js')).runRollChecks()
import * as THREE from 'three';
import { player, view } from '../../src/game/state.js';
import { cameraMode, setCameraMode } from '../../src/game/settings.js';
import { settleCamera } from '../../src/game/camera.js';
import { camera } from '../../src/render/scene.js';
import { inputDir } from '../../src/game/input.js';
import { lookBy } from '../../src/game/mouselook.js';
import { setRoll, resetRoll, rollNow, rollKeys, setRollKeys, holdRoll } from '../../src/game/roll.js';
import { runCommand } from '../../src/game/commands.js';

const check = (condition, message) => { if (!condition) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const down = code => dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
const up = code => dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
const v = new THREE.Vector3();
const onScreen = (x, y, z) => { v.set(x, y, z).project(camera); return [v.x, v.y]; };
// which way a key held runs the hero on the screen (x right, y up), as a unit vector
function runs(code) {
  down(code);
  const [dx, dz] = inputDir();
  up(code);
  const a = onScreen(player.x, player.visY, player.z), b = onScreen(player.x + dx, player.visY, player.z + dz);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}
const along = ([x, y], [ex, ey]) => x * ex + y * ey > 0.9;

export async function runRollChecks() {
  const mode = cameraMode(), keys = rollKeys(), yaw = view.yawTarget, pitch = view.pitch, results = [];
  try {
    setCameraMode('overview');
    holdRoll(true); resetRoll(); settleCamera();
    check(along(runs('KeyW'), [0, 1]) && along(runs('KeyD'), [1, 0]), 'Unrolled: W runs up the screen, D right');

    // a quarter round: the picture turns clockwise
    setRollKeys('world'); setRoll(90, true); settleCamera();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    check(right.y > 0.6, 'Rolled a quarter round, the camera\'s right side is up');
    check(along(runs('KeyW'), [1, 0]) && along(runs('KeyD'), [0, -1]), 'World keys, a quarter round: W runs right on the screen, D down');
    setRollKeys('screen'); setRoll(90, true); settleCamera();
    check(along(runs('KeyW'), [0, 1]) && along(runs('KeyD'), [1, 0]), 'Screen keys, a quarter round: W runs up the screen, D right');
    results.push('a quarter round: the keys with the world or the screen');

    // half round
    setRollKeys('world'); setRoll(180, true); settleCamera();
    check(along(runs('KeyW'), [0, -1]) && along(runs('KeyA'), [1, 0]), 'World keys, half round: W runs down the screen, A right');
    setRollKeys('screen'); setRoll(180, true); settleCamera();
    check(along(runs('KeyW'), [0, 1]), 'Screen keys, half round: W runs up the screen');
    results.push('half round');

    // the close view's mouse look follows the screen: rolled a quarter round (the screen's right
    // was up), the mouse going right looks up
    setCameraMode('close'); setRoll(90, true); settleCamera();
    const p0 = view.pitch, y0 = view.yaw;
    lookBy(20, 0);
    check(view.pitch < p0 && Math.abs(view.yaw - y0) < 1e-9, 'Rolled a quarter round, the mouse going right looks up (as up did unrolled)');
    view.pitch = p0;
    setCameraMode('overview');
    results.push('the mouse look follows the screen');

    // turning slowly with W held (the hero kept still: the keys are latched all the same): W keeps
    // its way in the world, D pressed is taken on the screen as it is, and once it rests the keys
    // held catch up with the screen within a second
    setRollKeys('latch'); setRoll(0, true); settleCamera();
    player.autoDir = [0, 0];
    down('KeyW'); inputDir();
    check((await runCommand('/roll 90')) !== false, '/roll 90 runs');
    await delay(1000);
    let r = rollNow();
    check(r.turning && r.angle > 0 && r.angle < 45 && r.keys === 0, `A second in, it is turning slowly, W held still with the world (${r.angle}°, keys ${r.keys}°)`);
    down('KeyD'); inputDir(); r = rollNow();
    check(r.keys === r.angle && r.keys > 0, `D pressed while it turns is taken on the screen as it is (${r.angle}°, keys ${r.keys}°)`);
    up('KeyD');
    await delay(5500);
    r = rollNow();
    check(!r.turning && r.angle === 90, `It rests at a quarter round in about 5 s (${r.angle}°)`);
    check(Math.abs(r.keys - 90) <= 2, `Rested, the key held has caught up with the screen (${r.keys}°)`);
    player.autoDir = null;
    check(along(runs('KeyW'), [0, 1]), 'Rested, W held runs up the screen');
    up('KeyW');
    check((await runCommand('/rollkeys screen')) !== false && rollKeys() === 'screen', '/rollkeys switches what the keys follow');
    results.push('it turns slowly to rest at a quarter, a key held latched through it, the keys catch up');
    return results;
  } finally {
    up('KeyW'); up('KeyD'); player.autoDir = null;
    setRollKeys(keys); holdRoll(false); resetRoll();
    setCameraMode(mode); view.yaw = view.yawTarget = yaw; view.pitch = pitch; settleCamera();
  }
}
