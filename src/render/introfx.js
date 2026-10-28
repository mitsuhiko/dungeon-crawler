// What a boss's intro shows besides the boss (game/reveals.js, docs/bosses.md "The intro"): the
// shadow growing on his spot before he drops in, glowing eyes hanging in the empty air (Gusto's,
// before the rest of him comes; Qualmos's under his lagoon), a pool on the floor (Slomo's goo, the
// crack Monteur comes up out of), a spotlight's beam (Mansk's stage), his curtain
// (render/stagecurtain.js) and the confetti he roars out. All made on first use and kept, hidden
// meanwhile.
import * as THREE from 'three';
import { scene } from './scene.js';
import { hideCurtain, curtainWarmup } from './stagecurtain.js';
import { trackLight } from './lightpool.js';

let shadow = null, eyes = null, pools = {}, beam = null, confetti = null, lamp = null;

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
  const m = inScene(poolOf(glow));
  m.visible = a > 0.005;
  m.position.set(x, y + (glow ? 0.05 : 0.04), z);
  m.scale.setScalar(Math.max(0.01, r));
  m.material.color.set(color);
  m.material.opacity = Math.min(1, a);
}
function poolOf(glow) {
  const key = glow ? 'glow' : 'flat';
  if (!pools[key]) {
    const tex = radial([[0, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
    pools[key] = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true,
      depthWrite: false, ...glow && { blending: THREE.AdditiveBlending } }));
    pools[key].renderOrder = 2;
  }
  return pools[key];
}
// (made on first use or for the warming up, introWarmup; in the scene once first shown)
const inScene = o => { if (!o.parent) scene.add(o); return o; };

// a beam of light from `top` cells over (x, y, z) down onto it, `r` cells wide at the floor,
// `a` how bright (0: hidden): a cone, fading up towards where it comes from
export function showBeam(x, y, z, top, r, a, color = '#fff2d0') {
  inScene(beamOf());
  beam.visible = a > 0.005;
  if (!beam.visible) return;
  beam.position.set(x, y, z);
  beam.scale.set(r, top, r);
  beam.material.uniforms.uAlpha.value = Math.min(1, a) * 0.35;
  beam.material.uniforms.uColor.value.set(color);
}
function beamOf() {
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
  }
  return beam;
}

// the light a spotlight throws, from (x, y, z): `a` how bright (0: out), `reach` cells (a moving
// light, render/lightpool.js: it lights him and the stage, not just the beam's look)
export function showSpotLight(x, y, z, a, reach = 6, color = '#fff0d0') {
  if (!lamp) {
    const holder = new THREE.Object3D(), light = new THREE.PointLight(color, 0, reach, 2);
    holder.add(light); scene.add(holder);
    trackLight(light, holder);
    lamp = { holder, light };
  }
  lamp.holder.position.set(x, y, z);
  lamp.light.color.set(color); lamp.light.distance = reach;
  lamp.light.intensity = Math.max(0, a) * 2.4;
}

// Confetti: `n` little paper squares burst out of (x, y, z) along `dir` ([x, y, z], about one
// long), at 5 to 10 cells/s and fanning out; they tumble, flutter down slowly and lie where they
// land (stepConfetti)
const CONFETTI = ['#ff4f6d', '#ffd23f', '#3bceac', '#4d8bff', '#ffffff', '#c86bfa', '#ff9f43'], MAX_CONFETTI = 220;
export function burstConfetti(x, y, z, dir, n = 180) {
  inScene(confettiOf().mesh);
  const [dx, dy, dz] = dir, r = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < n && confetti.flakes.length < MAX_CONFETTI; i++) {
    const v = r(5, 10);
    confetti.flakes.push({ p: new THREE.Vector3(x + r(-0.12, 0.12), y + r(-0.12, 0.12), z + r(-0.12, 0.12)),
      v: new THREE.Vector3(dx * v + r(-2.2, 2.2), dy * v + r(0.5, 3), dz * v + r(-2.2, 2.2)),
      rot: new THREE.Euler(r(0, 6.3), r(0, 6.3), r(0, 6.3)), spin: new THREE.Vector3(r(-12, 12), r(-12, 12), r(-12, 12)),
      sway: r(0, 6.3), down: false });
  }
  confetti.mesh.visible = true;
}
function confettiOf() {
  if (!confetti) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.055), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX_CONFETTI);
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    const c = new THREE.Color();
    for (let i = 0; i < MAX_CONFETTI; i++) mesh.setColorAt(i, c.set(CONFETTI[i % CONFETTI.length]));
    confetti = { mesh, flakes: [], o: new THREE.Object3D() };
  }
  return confetti;
}
// the confetti on by dt: slowed hard by the air, falling slowly, drifting from side to side, and
// lying flat where it comes down (floorAt(x, z, y): the floor under it)
export function stepConfetti(dt, floorAt) {
  if (!confetti?.mesh.visible) return;
  const { mesh, flakes, o } = confetti, drag = Math.exp(-2.1 * dt);
  flakes.forEach((f, i) => {
    if (!f.down) {
      f.v.multiplyScalar(drag);
      f.v.y = Math.max(f.v.y - 3.2 * dt, -0.7);   // (paper: it falls slowly)
      f.sway += dt * 5;
      f.p.addScaledVector(f.v, dt);
      f.p.x += Math.sin(f.sway) * 0.35 * dt; f.p.z += Math.cos(f.sway * 0.8) * 0.35 * dt;
      f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt; f.rot.z += f.spin.z * dt;
      const floor = floorAt(f.p.x, f.p.z, f.p.y + 0.2);
      if (f.v.y < 0 && f.p.y < floor + 0.015) {
        f.down = true; f.p.y = floor + 0.012 + Math.random() * 0.006;
        f.rot.set(-Math.PI / 2, 0, Math.random() * 6.3);
      }
    }
    o.position.copy(f.p); o.rotation.copy(f.rot); o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.count = flakes.length;
  mesh.instanceMatrix.needsUpdate = true;
}

// What to compile ahead for the intro of the boss of a cube's map (render/cubeassets.js): his
// stage's (Mansk's): the spotlight's beam and pool, the confetti and the curtain (objects out of
// the scene until first shown, so they compile as they will be drawn)
export function introWarmup(map) {
  if (!map?.arena?.stage) return [];
  return [beamOf(), poolOf(true), confettiOf().mesh, ...curtainWarmup()].filter(o => !o.parent);
}

export function hideConfetti() { if (confetti) { confetti.mesh.visible = false; confetti.flakes = []; } }

export function hideIntroFx() {
  if (shadow) shadow.visible = false;
  eyes?.forEach(s => { s.visible = false; });
  for (const m of Object.values(pools)) m.visible = false;
  if (beam) beam.visible = false;
  hideConfetti();
  hideCurtain();
  if (lamp) lamp.light.intensity = 0;
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
