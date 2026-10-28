// What the game adds to Qualmos's clips (render/enemies.js; his fight: game/qualmos.js, the rules
// core/qualmos.js): as he winds up his grab, the floor before him where his hand will catch glows
// (the blow's reach and arc, core/enemies.js QUALMOS), brighter and pulsing faster as the catch
// comes, so there is time to step out of it. Under his lagoon's surface (`under`) none.
import * as THREE from 'three';
import { QUALMOS, attackOf } from '../core/enemies.js';

const GRAB = QUALMOS.attacks.find(a => a.name === 'grab'), HALF = Math.acos(GRAB.arc), COLOR = 0xffa24a;
// (in the group's space: forward is +z; a ring's angles run from +x towards -z once laid flat)
const ARC = new THREE.RingGeometry(QUALMOS.radius + 0.15, GRAB.hitReach, 40, 1, -Math.PI / 2 - HALF, 2 * HALF).rotateX(-Math.PI / 2);

export function makeQualmosLook(group) {
  const material = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const warn = new THREE.Mesh(ARC, material);
  warn.position.y = 0.06; warn.visible = false; warn.renderOrder = 2;
  group.add(warn);
  return { warn };
}

export function qualmosLook(v, e) {
  const q = v.qualmos, a = e.mode === 'attack' ? attackOf(e) : null;
  const on = a?.grab && !e.under && e.t < a.hitAt;
  q.warn.visible = !!on;
  if (!on) return;
  const k = Math.max(0, Math.min(1, e.t / a.hitAt));
  q.warn.material.opacity = (0.12 + 0.3 * k) * (0.8 + 0.2 * Math.sin(e.t * (8 + 16 * k)));
}

export const disposeQualmosLook = q => q.warn.material.dispose();
