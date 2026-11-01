// Renderer, scene, lights and camera.
import './lighthook.js';   // (before any material: render/lighthook.js)
import * as THREE from 'three';
import { N } from '../core/constants.js';
import { NOON } from '../core/daycycle.js';
import { bakeScene, bakeRenderer } from './lighthook.js';

// no antialias: the anti-aliasing is our own, at the level of the settings (msaa.js)
export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.localClippingEnabled = true;
bakeRenderer(renderer);   // (its programs, and only its, take the fixed lights: render/lighthook.js)
// Checking a program for errors the first time it draws asks the driver for its log, and in
// Chrome that waits for everything the GPU process has queued (other programs compiling ahead
// among it): 100-400 ms stalls on entering a cube. Only with the dev tools (?dev=1).
renderer.debug.checkShaderErrors = new URLSearchParams(location.search).get('dev') === '1';
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// The canvas fills the window by CSS (style.css, #view), so it can never be wider or taller than
// the page: on an iPad a canvas bigger than the page for a moment (turning it, the keyboard) made
// Safari change its zoom, and nothing turned it back. Its drawing buffer follows the layout
// viewport: not innerWidth / innerHeight, which in Safari are the visual viewport (smaller while
// the keyboard is up or the page is zoomed, stale while an iPad turns).
export const viewSize = () => ({ w: document.documentElement.clientWidth || innerWidth, h: document.documentElement.clientHeight || innerHeight });
//
// The canvas only changes size right before a frame is drawn (main.js calls fitView before
// rendering): resizing a WebGL canvas clears it, and the browser then shows that empty canvas.
// Resized after drawing (the resolution controller after the frame, a ResizeObserver, which runs
// after requestAnimationFrame) the whole picture vanished for a frame. So the resize events and
// the resolution controller (render/resolution.js) only ask for it (requestFit).
let fitDue = false, wantRatio = renderer.getPixelRatio();
const fitSize = new THREE.Vector2();
// ratio: a new pixel ratio (render/resolution.js); none: the window may have changed size
export function requestFit(ratio) { if (ratio) wantRatio = ratio; fitDue = true; }
export function fitView() {
  if (!fitDue) return;
  fitDue = false;
  const { w, h } = viewSize();
  renderer.getSize(fitSize);
  if (wantRatio === renderer.getPixelRatio() && fitSize.x === w && fitSize.y === h) return;
  if (wantRatio !== renderer.getPixelRatio()) renderer.setPixelRatio(wantRatio);   // (resizes the canvas too)
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
renderer.domElement.id = 'view';
renderer.setSize(viewSize().w, viewSize().h, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // soft since r182 (PCFSoftShadowMap is gone)
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
bakeScene(scene);   // (the cube's fixed lights shine in it, render/lighthook.js)
scene.fog = new THREE.Fog(0x000000, 1e4, 2e4);   // always present (adding fog later recompiles shaders)

// the backdrop (sky gradient, clouds, stars) is in sky.js

// learn: drawing.html#camera (see learn/README.md)
export const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 500);

// learn: drawing.html#light (see learn/README.md)
export const hemi = new THREE.HemisphereLight(0xdfeaff, 0x3a3020, 1.1);
scene.add(hemi);
// It stands where the cube played in has its sun (render/bake.js setCurrentBake: at noon, or
// where the time of day has it, core/daycycle.js), looking at the cube's middle a little up (its
// shadow map's box holds the cube however low the sun goes).
// learn: drawing.html#light, light.html#shadow-map (see learn/README.md)
export const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
sun.target.position.set(N / 2, 4, N / 2);
sun.position.set(...NOON).multiplyScalar(38).add(sun.target.position);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// (its box: the cube, VIEW_H high, seen from the sun as low as it goes, SUN_LOW, wants about
// 0.85 N either way)
const SUN_BOX = N * 7 / 8;
Object.assign(sun.shadow.camera, { left: -SUN_BOX, right: SUN_BOX, top: SUN_BOX, bottom: -SUN_BOX, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

addEventListener('resize', () => requestFit());
// and whenever the canvas itself changes size: iOS settles the sizes late after a turn
new ResizeObserver(() => requestFit()).observe(renderer.domElement);
