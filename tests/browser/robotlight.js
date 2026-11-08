// In the game's page (?dev=1&seed=11):
// await (await import('/tests/browser/robotlight.js')).runRobotLightChecks()
// Draw real shadow maps: the hero casts into the robot's, not its own lamp's, and the robot
// never blocks its own core. Check the quality fade and hiding without removing the light.
import * as THREE from 'three';
import { renderer, scene, camera } from '../../src/render/scene.js';
import { character, characterReady, lamp } from '../../src/render/character.js';
import { robotView, robotReady, drawRobot, hideRobot } from '../../src/render/robot.js';
import { robotLamp, ROBOT_GLOW } from '../../src/render/robotlight.js';
import { setShadowLook, setLampShare, snapShadows, shadowState } from '../../src/render/shadows.js';

const check = (value, message) => { if (!value) throw Error(message); };
export async function runRobotLightChecks() {
  await Promise.all([characterReady, robotReady]);
  check(character.ready && character.group.visible && robotView.ready, 'hero and robot loaded');
  const saved = shadowState(), v = robotView, at = v.group.position.clone(), yaw = v.group.rotation.y,
    fade = v.group.userData.fade ?? 1, visible = v.group.visible;
  const hooks = [], heroDraws = [], robotDraws = [];
  for (const [group, draws] of [[character.group, heroDraws], [v.group, robotDraws]]) group.traverse(m => {
    if (!m.isMesh || !m.castShadow) return;
    const before = m.onBeforeShadow;
    hooks.push(() => { m.onBeforeShadow = before; });
    m.onBeforeShadow = function (...args) { draws.push(args[3]); before.apply(this, args); };
  });
  const render = () => { heroDraws.length = robotDraws.length = 0; renderer.render(scene, camera); };
  try {
    setShadowLook({ lamp: { range: Infinity, figures: Infinity, every: 1, strength: 1 }, sun: saved.sun });
    setLampShare(1); snapShadows();
    drawRobot(character.group.position.clone().add(new THREE.Vector3(-1.2, 0, -1.5)), 0, 1, 'hover', 1);
    render();
    check(robotLamp.parent === scene && robotLamp.castShadow, 'persistent shadow light');
    check(robotLamp.shadow.map, 'shadow cube allocated');
    check(Math.abs(robotLamp.intensity - ROBOT_GLOW * 2) < 1e-6, 'same gain as the pool, no duplicate source');
    check(heroDraws.includes(robotLamp.shadow.camera), 'hero drawn into robot shadow maps, even in sunshine');
    check(!heroDraws.includes(lamp.shadow.camera), 'hero absent from its own lamp maps');
    check(!robotDraws.includes(robotLamp.shadow.camera), 'robot does not block its own core');
    check(character.mesh.castShadow, 'hero casting restored');
    setLampShare(0); snapShadows(); render();   // sunshine suppresses our lamp, not the robot's
    check(heroDraws.includes(robotLamp.shadow.camera), 'sunshine keeps the robot shadows');
    setShadowLook({ lamp: { figures: 0 } }); snapShadows(); render();
    check(heroDraws.includes(robotLamp.shadow.camera), 'Low keeps the hero in the robot maps');
    const core = robotLamp.position.clone();
    check(core.distanceTo(v.group.position.clone().add(new THREE.Vector3(0, 0.9, 0))) < 1e-6, 'light at the core');
    drawRobot(v.group.position, 0, 0.5, 'hover', 1);
    check(Math.abs(robotLamp.intensity - ROBOT_GLOW) < 1e-6, 'light fades with robot');
    drawRobot(v.group.position, 0, 1, 'dormant', 1);
    check(Math.abs(robotLamp.intensity - ROBOT_GLOW * 2 * 0.2) < 1e-6, 'asleep core stays dim');
    setShadowLook({ lamp: { strength: 0 } }); snapShadows(); render();
    check(robotLamp.shadow.intensity === 0 && !heroDraws.includes(robotLamp.shadow.camera), 'Lowest skips the robot maps');
    hideRobot(); render();
    check(robotLamp.intensity === 0 && !robotLamp.shadow.autoUpdate && robotLamp.parent === scene, 'hidden robot: off, no shader recompile');
    return { ok: true, strength: ROBOT_GLOW * 2, reach: robotLamp.distance };
  } finally {
    for (const restore of hooks) restore();
    setShadowLook(saved); setLampShare(saved.lampShare); snapShadows();
    if (visible) drawRobot(at, yaw, fade, 'hover', 0); else hideRobot();
  }
}
