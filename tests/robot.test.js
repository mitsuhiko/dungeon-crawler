import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, decoderReady } from '../tools/glb.mjs';

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
