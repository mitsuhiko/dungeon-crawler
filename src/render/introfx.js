// What a boss's intro shows besides the boss (game/reveals.js, docs/bosses.md "The intro"): the
// shadow growing on his spot before he drops in, glowing eyes hanging in the empty air (Gusto's,
// before the rest of him comes; Qualmos's under his lagoon), a pool on the floor (Slomo's goo, the
// crack Monteur comes up out of) and a spotlight's beam (Mansk's stage). All made on first use and
// kept, hidden meanwhile.
import * as THREE from 'three';
import { scene } from './scene.js';

let shadow = null, eyes = null, pools = {}, beam = null;

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

// a soft round pool on the floor at (x, y, z), `r` cells wide, `a` how strong (0: hidden), in
// `color`: laid over the floor (`glow`: added to it, a pool of light)
export function showPool(x, y, z, r, a, color, glow = false) {
  const key = glow ? 'glow' : 'flat';
  if (!pools[key]) {
    const tex = radial([[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true,
      depthWrite: false, ...glow && { blending: THREE.AdditiveBlending } }));
    m.renderOrder = 2;
    scene.add(m);
    pools[key] = m;
  }
  const m = pools[key];
  m.visible = a > 0.005;
  m.position.set(x, y + (glow ? 0.05 : 0.04), z);
  m.scale.setScalar(Math.max(0.01, r));
  m.material.color.set(color);
  m.material.opacity = Math.min(1, a);
}

// a beam of light from `top` cells over (x, y, z) down onto it, `r` cells wide at the floor,
// `a` how bright (0: hidden): a cone, fading up towards where it comes from
export function showBeam(x, y, z, top, r, a, color = '#fff2d0') {
  if (!beam) {
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1, 1, 40, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vUp; varying vec3 vN; varying vec3 vView;
        void main() {
          vUp = position.y; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uAlpha; uniform vec3 uColor; varying float vUp; varying vec3 vN; varying vec3 vView;
        void main() {
          float face = abs(dot(normalize(vN), vView));
          float a = uAlpha * (0.25 + 0.75 * face * face) * (1.0 - 0.75 * vUp) * smoothstep(0.0, 0.06, vUp) * smoothstep(1.0, 0.9, vUp);
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
    }));
    beam.renderOrder = 1040; beam.frustumCulled = false;
    scene.add(beam);
  }
  beam.visible = a > 0.005;
  if (!beam.visible) return;
  beam.position.set(x, y, z);
  beam.scale.set(r, top, r);
  beam.material.uniforms.uAlpha.value = Math.min(1, a) * 0.35;
  beam.material.uniforms.uColor.value.set(color);
}

export function hideIntroFx() {
  if (shadow) shadow.visible = false;
  eyes?.forEach(s => { s.visible = false; });
  for (const m of Object.values(pools)) m.visible = false;
  if (beam) beam.visible = false;
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
