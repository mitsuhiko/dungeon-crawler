// What a boss's intro shows besides the boss (game/reveals.js, docs/bosses.md "The intro"): the
// shadow growing on his spot before he drops in, and glowing eyes hanging in the empty air
// (Gusto's, before the rest of him comes). Both made on first use and kept, hidden meanwhile.
import * as THREE from 'three';
import { scene } from './scene.js';

let shadow = null, eyes = null;

// a soft dark disc on the floor at (x, y, z), `r` cells wide, `a` how dark (0: hidden)
export function showShadow(x, y, z, r, a) {
  if (!shadow) {
    const tex = radial([[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]);
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, color: '#0b0c12', transparent: true, depthWrite: false }));
    shadow.renderOrder = 2;
    scene.add(shadow);
  }
  shadow.visible = a > 0.005;
  shadow.position.set(x, y + 0.03, z);
  shadow.scale.setScalar(Math.max(0.01, r));
  shadow.material.opacity = Math.min(1, a);
}

// two glowing eyes: at points [[x, y, z], [x, y, z]], `size` cells, `a` how bright (0: hidden)
export function showEyes(points, size, a, color = '#ff3020') {
  if (!eyes) {
    const tex = radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    eyes = [0, 1].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.renderOrder = 1050;
      scene.add(s);
      return s;
    });
  }
  eyes.forEach((s, i) => {
    s.visible = a > 0.005;
    if (!s.visible) return;
    s.position.set(...points[i]);
    s.scale.setScalar(size);
    s.material.color.set(color);
    s.material.opacity = Math.min(1, a);
  });
}

export function hideIntroFx() {
  if (shadow) shadow.visible = false;
  eyes?.forEach(s => { s.visible = false; });
}

function radial(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
