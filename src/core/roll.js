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
// What the movement keys (and the touch sticks) do while the world is turned (`KEY_MODES`): they
// stay with the world as it was unturned (`world`: rolled half round, up on the keys runs down the
// screen), they follow the screen (`screen`: up is always up the screen; while it turns, a key
// held curves the hero's way along), or they stay with the world while it turns and catch up with
// the screen once it has rested `settle` seconds (`catchup`). The angle they follow is their own
// (`keyAngle`); the mouse (clicks, the close view's look) always follows the screen.
export const ROLL = {
  speed: 25 * Math.PI / 180,   // rad/s at most
  accel: 20 * Math.PI / 180,   // rad/s² speeding up and slowing down
  hold: [6, 10],               // s it rests at a quarter, spinning
  settle: 1,                   // s it must have rested before the keys catch up (`catchup`)
  catchUp: 2.5,                // 1/s: how fast they catch up (an ease; 90° are most of the way in 1 s)
};
export const KEY_MODES = ['world', 'screen', 'catchup'];
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
