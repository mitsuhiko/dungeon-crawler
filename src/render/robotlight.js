// Our robot's light stays in the scene from the start, even before its model loads: adding a
// shadow light later would compile every lit shader again. Other players' robots use the
// moving light pool, without another six shadow maps each (render/robot.js).
import * as THREE from 'three';
import { scene } from './scene.js';

export const ROBOT_LIGHT = 0xffc27a, ROBOT_GLOW = 1.5, ROBOT_REACH = 4.8;
export const robotLamp = new THREE.PointLight(ROBOT_LIGHT, 0, ROBOT_REACH, 2);
robotLamp.castShadow = true;
robotLamp.shadow.mapSize.set(512, 512);
robotLamp.shadow.camera.near = 0.15;
robotLamp.shadow.bias = -0.03;   // world units, like the hero's lamp (render/character.js)
robotLamp.shadow.radius = 1.5;
robotLamp.shadow.autoUpdate = false;
robotLamp.shadow.needsUpdate = true;   // its sampler needs a map even before the robot appears
scene.add(robotLamp);

// The source's position is local to its robot; its intensity has the asleep / awake blend.
// Match the pool's gain of two, with the same fade when the robot leaves the cube.
export function followRobotLight(source = null, group = null) {
  const shown = source && group?.visible;
  robotLamp.intensity = shown ? source.intensity * 2 * (group.userData.fade ?? 1) : 0;
  robotLamp.shadow.autoUpdate = !!shown;
  robotLamp.userData.owner = group;
  if (!shown) return;
  group.updateWorldMatrix(true, false);
  robotLamp.position.copy(source.position).applyMatrix4(group.matrixWorld);
}
