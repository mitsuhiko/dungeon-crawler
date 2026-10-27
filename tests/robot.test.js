import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, decoderReady } from '../tools/glb.mjs';
import { N } from '../src/core/constants.js';
import { createRun } from '../src/core/progression.js';
import { HELLO, FOLLOW, MAX_LAG, WAKE, HELLO_AFTER, robotMet, meetRobot, robotLies, beside, newWay, noteWay, stepWay, wayPoint, wayEnd, shortcut } from '../src/core/robot.js';

await decoderReady;

// the robot (blender/robot.py, docs/story.md "The robot"): a hovering egg of star-glass with
// amber eyes, little glass wings and glass gears, every part rigid on its bone; its clips loop or
// come back to RobotHover
test('the robot comes with its parts, its bones and its clips', () => {
  const j = readGlb(resolve(assets, 'robot.glb')).json;
  const node = name => j.nodes.find(n => n.name === name);
  const robot = node('Robot'), rig = node('RobotRig');
  assert.ok(robot && rig, 'Robot and RobotRig');
  assert.equal(rig.extras.companion, 'robot');
  assert.ok(rig.extras.hover_height > 0.5, 'it hovers');
  const materials = new Set(j.meshes[robot.mesh].primitives.map(p => j.materials[p.material].name));
  for (const m of ['RobotGlass', 'RobotGear', 'RobotEye', 'RobotCore', 'RobotBrass']) assert.ok(materials.has(m), m);
  const bones = new Set(j.skins[robot.skin].joints.map(i => j.nodes[i].name));
  for (const b of ['body', 'core', 'eye.L', 'eye.R', 'hub.L', 'hub.R', 'wing.L', 'wing.R', 'gear.A', 'gear.B', 'key']) assert.ok(bones.has(b), b);
  const clips = Object.fromEntries(j.animations.map(a => [a.name, a.extras]));
  for (const name of ['RobotHover', 'RobotFly', 'RobotTalk', 'RobotDormant']) assert.equal(clips[name]?.loop, true, `${name} loops`);
  for (const name of ['RobotWake', 'RobotRevive', 'RobotCheer']) {
    assert.equal(clips[name]?.loop, false, `${name} plays once`);
    assert.equal(clips[name].then, 'RobotHover', `${name} ends where RobotHover starts`);
  }
  assert.ok(clips.RobotRevive.hit_frame > 0, 'the moment the hero comes back');
  assert.ok(clips.RobotWake.wake_frame < clips.RobotWake.lift_frame, 'it opens its eyes, then lifts off');
});

// The hero runs (RUN cells/s) from (x, z) in cube k along `path` (each leg: [dx, dz, seconds, cube
// change?]); the robot follows. -> every frame's { k, x, z (the hero), p (the robot's point), w }
const RUN = 2.8, DT = 1 / 60;
function run(w, start, legs, after = 0) {
  let { k, x, y, z } = start;
  const frames = [];
  const tick = () => { noteWay(w, k, x, y, z); stepWay(w, DT, wayPoint(w).k !== k); frames.push({ k, x, z, p: wayPoint(w), lag: wayEnd(w) - w.s, fade: w.fade }); };
  for (const [dx, dz, secs, to] of legs) {
    if (to) ({ k, x, y, z } = to(k, x, y, z));
    for (let t = 0; t < secs; t += DT) { x += dx * RUN * DT; z += dz * RUN * DT; tick(); }
  }
  for (let t = 0; t < after; t += DT) tick();
  return frames;
}
// the hero walks across the east side into the next cube: the same point, in its coordinates
const east = (k, x, y, z) => { const [X, Y, Z] = k.split(',').map(Number); return { k: `${X + 1},${Y},${Z}`, x: x - N, y, z }; };

test('the robot lies asleep in the merchant camp until it is woken, and the world keeps its hello', () => {
  assert.ok(HELLO.length > 0 && HELLO.every(l => l.voice === 'robot'));
  assert.ok(HELLO_AFTER > 0 && HELLO_AFTER < WAKE, 'it says hello as it wakes');
  const run = createRun(), camp = { merchantCamp: {}, relics: { robot: { x: 7, y: 0, z: 12 } } };
  for (const map of [{ town: true, relics: {} }, { interior: 'town_inn_a' }, { merchantCamp: {}, relics: {} }, { depth: 3 }, null]) assert.ok(!robotLies(map, run), JSON.stringify(map));
  assert.ok(robotLies(camp, run));
  assert.ok(!robotMet(run));
  meetRobot(run);
  assert.ok(robotMet(run));
  assert.ok(!robotLies(camp, run), 'woken: it lies there no more');
});

test('cubes beside each other: points carried across a side, none to a cube above or a house', () => {
  assert.deepEqual(beside('0,0,0', '1,0,0'), [-N, 0, 0]);
  assert.deepEqual(beside('0,-1,3', '0,-1,2'), [0, 0, N]);
  assert.equal(beside('0,0,0', '0,-1,0'), null);
  assert.equal(beside('0,0,0', '2,0,0'), null);
  assert.equal(beside('0,0,0', 'interior:town_inn_a'), null);
});

test('it follows the hero along their way: falls back a little as they run, keeps its distance when they stop', () => {
  const w = newWay('0,0,0', 2, 0, 2);
  const frames = run(w, { k: '0,0,0', x: 2, y: 0, z: 2 }, [[1, 0, 2], [0, 1, 2], [1, 0, 1]], 6);
  const running = frames.slice(60, 5 * 60), lags = running.map(f => f.lag);
  assert.ok(Math.max(...lags) < 4.5, `close behind as the hero runs: ${Math.max(...lags).toFixed(2)}`);
  assert.ok(Math.min(...lags.slice(60)) > FOLLOW + 0.3, 'it does not keep up exactly');
  const last = frames.at(-1);
  assert.ok(Math.abs(last.lag - FOLLOW) < 0.05, `FOLLOW behind once they stopped: ${last.lag}`);
  // along their way round the corners: it went where they went, not across
  for (const f of frames) assert.ok(frames.some(h => Math.hypot(h.x - f.p.x, h.z - f.p.z) < 0.36), `off the way at ${f.p.x}, ${f.p.z}`);
});

test('it follows across a side into the next cube, without a jump, and catches up', () => {
  const w = newWay('0,0,0', 12, 0, 8);
  const frames = run(w, { k: '0,0,0', x: 12, y: 0, z: 8 }, [[1, 0, 1.4], [1, 0, 3, east]], 8);
  assert.ok(frames.some(f => f.k === '1,0,0' && f.p.k === '0,0,0'), 'for a while it is still in the cube behind');
  assert.ok(frames.every(f => f.fade === 1), 'no jump across a side');
  // where it is drawn never leaps (in the hero's cube's coordinates)
  let last = null;
  for (const f of frames) {
    const o = beside(f.p.k, '1,0,0'), x = f.p.x + o[0];
    if (last !== null) assert.ok(Math.abs(x - last) < 0.2, `a leap from ${last} to ${x}`);
    last = x;
  }
  const end = frames.at(-1);
  assert.equal(end.p.k, '1,0,0');
  assert.ok(Math.abs(end.lag - FOLLOW) < 0.05);
});

test('over a jump (a door, a well, the town portal) it fades out and in again where the hero came out', () => {
  const w = newWay('0,0,0', 4, 0, 4);
  const house = () => ({ k: 'interior:town_inn_a', x: 3, y: 0, z: 3 });
  const frames = run(w, { k: '0,0,0', x: 4, y: 0, z: 4 }, [[1, 0, 1], [0, 1, 1, house]], 4);
  const gone = frames.findIndex(f => f.fade === 0);
  assert.ok(gone > 0, 'it faded out');
  assert.equal(frames[gone - 1].p.k, '0,0,0');
  assert.ok(frames.slice(gone).some(f => f.fade === 0 && f.p.k === 'interior:town_inn_a'), 'and came out in the house');
  assert.equal(frames.at(-1).fade, 1);
  assert.equal(frames.at(-1).p.k, 'interior:town_inn_a');
});

test('however far behind, it is back with the hero within 20 s of them standing still', () => {
  // a long run through five cubes, then a teleport (the town portal) far off
  const w = newWay('0,0,0', 1, 0, 8);
  const legs = [[1, 0, 5], [1, 0, 5.7, east], [1, 0, 5.7, east], [0, 1, 2], [1, 0, 4, east], [1, 0, 5.7, east], [0, -1, 1, () => ({ k: '-3,-2,1', x: 8, y: 0, z: 8 })]];
  const frames = run(w, { k: '0,0,0', x: 1, y: 0, z: 8 }, legs, 20);
  const stop = frames.length - 20 * 60;
  const back = frames.findIndex((f, i) => i >= stop && f.p.k === f.k && Math.abs(f.lag - FOLLOW) < 0.1 && f.fade === 1);
  assert.ok(back > 0, 'it never came back');
  assert.ok((back - stop) * DT < 20, `${((back - stop) * DT).toFixed(1)} s`);
  assert.ok(frames.every(f => f.lag <= MAX_LAG + 5), 'never much further behind than MAX_LAG');
  // left far behind (a way it did not fly yet: 30 or 100 cells, through cubes): never more than 20 s
  for (const cells of [30, 100]) {
    const w = newWay('0,0,0', 1, 0, 1);
    let k = '0,0,0', x = 1;
    for (let d = 0; d < cells; d += 0.3) { x += 0.3; if (x > N) ({ k, x } = east(k, x, 0, 1)); noteWay(w, k, x, 0, 1); }
    let t = 0;
    while (t < 30 && !(wayPoint(w).k === k && Math.abs(wayEnd(w) - w.s - FOLLOW) < 0.1 && w.fade === 1)) { stepWay(w, DT, wayPoint(w).k !== k); t += DT; }
    assert.ok(t < 20, `${cells} cells behind: back after ${t.toFixed(1)} s`);
  }
});

test('the hero coming back to it the short way: the way left is a straight line to them', () => {
  const w = newWay('0,0,0', 2, 0, 2);
  run(w, { k: '0,0,0', x: 2, y: 0, z: 2 }, [[1, 0, 2], [0, 1, 1], [-1, 0, 2]], 0);
  const p = wayPoint(w);
  shortcut(w, '0,0,0', 2, 0, 4.8);
  assert.ok(wayEnd(w) - w.s < 5, 'the long way round is gone');
  const q = wayPoint(w);
  assert.ok(Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.z - p.z) < 1e-9, 'from where it is');
});
