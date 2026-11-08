import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapYaw, SIDE0, closeDistance, clampPitch, PITCH, PITCH_MIN, PITCH_MAX, keyPress, keyMove, keyRelease, TAP_MS, ORBIT_PX,
  look, forwardYaw, clampLookSpeed, LOOK_PER_PX, LOOK_SPEED_MIN, LOOK_SPEED_MAX } from '../src/core/view.js';
import { DEFAULT_ZOOM, ZOOM_LEVELS, stepZoom } from '../src/core/zoom.js';
import { ACTION, defaultBindings, resolveBindings } from '../src/core/keybinds.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the overview settles on the nearest of its four diagonal sides', () => {
  for (let k = -5; k <= 5; k++) {
    const side = SIDE0 + k * Math.PI / 2;
    assert.ok(close(snapYaw(side), side));
    assert.ok(close(snapYaw(side + 0.7), side));
    assert.ok(close(snapYaw(side - 0.7), side));
    assert.ok(close(snapYaw(side + 0.9), side + Math.PI / 2));
  }
  assert.ok(close(snapYaw(0.1), Math.PI / 4));
  assert.ok(close(snapYaw(-0.1), -Math.PI / 4));
});

test('the close view zooms with the same presets, from about 1.2 to 4.7 units', () => {
  assert.equal(closeDistance(DEFAULT_ZOOM), 3);
  for (let i = 1; i < ZOOM_LEVELS.length; i++) assert.ok(closeDistance(ZOOM_LEVELS[i]) > closeDistance(ZOOM_LEVELS[i - 1]));
  let zoom = DEFAULT_ZOOM;
  for (let i = 0; i < 10; i++) zoom = stepZoom(zoom, -1);
  assert.ok(closeDistance(zoom) > 1.1 && closeDistance(zoom) < 1.3);
  for (let i = 0; i < 10; i++) zoom = stepZoom(zoom, 1);
  assert.ok(closeDistance(zoom) > 4.5 && closeDistance(zoom) < 4.9);
});

test('the close view pitch stays within its limits', () => {
  assert.equal(clampPitch(PITCH), PITCH);
  assert.equal(clampPitch(-5), PITCH_MIN);
  assert.equal(clampPitch(5), PITCH_MAX);
});

test('mouse look: right turns right, down looks down, within the pitch limits', () => {
  const r = look(1, PITCH, 100, 0);
  assert.ok(close(r.yaw, 1 - 100 * LOOK_PER_PX) && r.pitch === PITCH);
  // the view looks the other way from where the camera stands; turning right turns where it looks right
  assert.ok(close(forwardYaw(0), Math.PI));
  assert.ok(look(0, PITCH, 0, 20).pitch > PITCH);
  assert.ok(look(0, PITCH, 0, 20, 1, true).pitch < PITCH);
  assert.ok(close(look(0, PITCH, 100, 0, 2).yaw, 2 * look(0, PITCH, 100, 0).yaw));
  assert.equal(look(0, PITCH, 0, 1e6).pitch, PITCH_MAX);
  assert.equal(look(0, PITCH, 0, -1e6).pitch, PITCH_MIN);
  assert.ok(PITCH_MIN < 0 && PITCH_MAX > 1, 'room to look up and down');
  assert.equal(clampLookSpeed(undefined), 1);
  assert.equal(clampLookSpeed(10), LOOK_SPEED_MAX);
  assert.equal(clampLookSpeed(0), LOOK_SPEED_MIN);
});

test('the camera key: a quick tap switches, a hold or moving the mouse does not', () => {
  assert.equal(keyRelease(keyPress(0), TAP_MS - 1), 'toggle');
  assert.equal(keyRelease(keyPress(0), TAP_MS + 1), null);
  // a jitter under the threshold is still a tap
  const k = keyPress(0);
  assert.equal(keyMove(k, 1, 1), false);
  assert.equal(keyRelease(k, 100), 'toggle');
  // moving the mouse turns the view at once, and letting go then never switches
  const m = keyPress(0);
  assert.equal(keyMove(m, ORBIT_PX, 0), true);
  assert.equal(keyMove(m, 0, 0), true);
  assert.equal(keyRelease(m, 50), 'orbited');
});

test('the camera key is Tab, else C, and C does not take a key from others', () => {
  assert.deepEqual(defaultBindings().camera, ['Tab', 'KeyC']);
  assert.equal(ACTION.camera.group, 'View');
  const all = Object.values(defaultBindings()).flat().filter(Boolean);
  assert.equal(all.filter(k => k === 'Tab' || k === 'KeyC').length, 2);
  // whoever had moved another action onto Tab keeps it: the camera keeps C
  assert.deepEqual(resolveBindings({ jump: ['Tab', null] }).camera, [null, 'KeyC']);
});
