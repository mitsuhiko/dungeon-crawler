// The world's roll (docs/camera.md "The world's roll"): the view turns about where it looks, the
// world turning on the screen while gravity stays with its floor, so the hero may seem to run up a
// wall or along the ceiling. Monteur's spin (docs/bosses.md, still to come); for now a prototype the
// developer commands drive (/roll, /rollkeys). Pure rules; game/roll.js runs them, game/camera.js
// turns the camera.
//
// The roll turns slowly: speeding up and slowing down (`accel`) to at most `speed`, until it rests
// at a quarter turn (0, 90, 180 or 270 degrees), where it stays; spinning (`spin`), it stays `hold`
// seconds and goes on to another quarter.
//
// What the movement keys (and the touch move stick) do while the world is turned (`KEY_MODES`):
// - `latch` (the default): a direction is taken on the screen as it is when it is given; held
//   unchanged, it keeps its way in the world while the screen turns under it (the hero does not
//   swerve), and once the roll rests it catches up with the screen quickly (`latchUp`). Every new
//   direction (a key pressed or let go, the stick let go or swung more than `swing`) is taken on
//   the screen anew (`latchKeys`, `settleLatch`). Only the roll is latched: a turn the player makes
//   (the camera keys, the mouse, the lock-on) steers the keys at once (game/input.js).
// - `world`: they stay with the world as it was unturned (rolled half round, up on the keys runs
//   down the screen);
// - `screen`: they follow the screen (up is always up the screen; while it turns, a key held
//   curves the hero's way along);
// - `catchup`: they stay with the world while it turns and catch up with the screen once it has
//   rested `settle` seconds.
// The angle they follow is their own (`keyAngle`, or the latch's); the mouse (clicks, the close
// view's look) and the touch aim stick always follow the screen.
export const ROLL = {
  speed: 25 * Math.PI / 180,   // rad/s at most
  accel: 20 * Math.PI / 180,   // rad/s² speeding up and slowing down
  hold: [6, 10],               // s it rests at a quarter, spinning
  settle: 1,                   // s it must have rested before the keys catch up (`catchup`)
  catchUp: 2.5,                // 1/s: how fast they catch up (an ease; 90° are most of the way in 1 s)
  latchUp: 8,                  // 1/s: how fast a direction held catches up once the roll rests (`latch`)
  swing: 60 * Math.PI / 180,   // rad: the stick swung further than this from where it was taken is a new direction
};
export const KEY_MODES = ['latch', 'world', 'screen', 'catchup'];
export const QUARTER = Math.PI / 2;

// an angle into (-π, π]
export const wrap = a => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));
// the angle that is `a` (give or take whole turns) nearest to `from` (the roll never jumps)
export const nearestTo = (from, a) => from + wrap(a - from);

// One step of the turning: r = { angle, target, speed } (rad, rad, rad/s, speed ≥ 0) towards its
// target, speeding up and slowing down so it comes to rest there exactly. Returns r.
export function stepRoll(r, dt, R = ROLL) {
  const left = r.target - r.angle, dist = Math.abs(left);
  if (dist < 1e-6) { r.angle = r.target; r.speed = 0; return r; }
  // as fast as still lets it stop in time, at most `speed`
  const want = Math.min(R.speed, Math.sqrt(2 * R.accel * dist));
  r.speed = r.speed < want ? Math.min(want, r.speed + R.accel * dt) : want;
  const step = Math.max(r.speed, R.accel * dt) * dt;   // (never stalling just short of it)
  if (step >= dist) { r.angle = r.target; r.speed = 0; }
  else r.angle += Math.sign(left) * step;
  return r;
}

// Spinning: the next quarter to turn to from the one it rests at (rnd: 0..1): a quarter either way
// or half round (that way or the other), never staying
export function nextStop(angle, rnd) {
  const steps = [QUARTER, -QUARTER, 2 * QUARTER, -2 * QUARTER];
  return angle + steps[Math.min(3, Math.floor(rnd * 4))];
}

// The angle the keys follow, one step on: `still` is how long the roll has rested (s)
export function stepKeys(mode, keyAngle, angle, still, dt, R = ROLL) {
  if (mode === 'screen') return angle;
  if (mode === 'world') return 0;
  if (still < R.settle) return keyAngle;
  const left = wrap(angle - keyAngle);   // (the shorter way: the roll may have gone whole turns)
  return Math.abs(left) < 1e-3 ? angle : keyAngle + left * Math.min(1, dt * R.catchUp);
}

// `latch`: the angle a direction on the screen (x, y: what the keys or the stick give) is taken
// at, the roll at `angle` now. l = { held, x, y, angle }: the direction held and the angle it was
// taken at (changed here). Nothing given lets go (and follows the screen); a direction given anew,
// or further than `swing` from the one held (keys: 0, any change), is taken at the roll now; else
// it keeps its angle.
export function latchKeys(l, x, y, angle, swing = 0) {
  if (!x && !y) { l.held = false; return angle; }
  const turned = l.held ? Math.abs(wrap(Math.atan2(y, x) - Math.atan2(l.y, l.x))) : Infinity;
  if (turned > swing + 1e-6) Object.assign(l, { held: true, x, y, angle });   // (measured from where it was taken)
  return l.angle;
}
// ... every step: once the roll rests (`still` s), a direction held catches up with it, the shorter way
export function settleLatch(l, angle, still, dt, R = ROLL) {
  if (!l.held || still <= 0) return l;
  const left = wrap(angle - l.angle);
  l.angle = Math.abs(left) < 1e-3 ? angle : l.angle + left * Math.min(1, dt * R.latchUp);
  return l;
}

// A direction on the turned screen (x right, y up) as it is on the screen unturned: the camera
// turned by `a` about where it looks (its right side up, for a > 0), the picture turns the other
// way, so the screen's right is up-and-right on the unturned one
export function unturn(x, y, a) {
  if (!a) return [x, y];
  const c = Math.cos(a), s = Math.sin(a);
  return [c * x - s * y, s * x + c * y];
}
// ... a mouse movement (px: x right, y down) likewise
export function unturnMouse(dx, dy, a) {
  const [x, y] = unturn(dx, -dy, a);
  return [x, -y];
}
