// How what lives in the surroundings is drawn there (the people of a cube not played in,
// game/standins.js; a friend in one of them, render/partner.js): dimmed like its cube's proxy
// (render/neighbors.js), a little less (materials.js NEIGHBOR_DIM.people), and dissolving with it
// (its travel dissolve and distance fade, render/fade.js). Each figure's materials are its own
// (render/figure.js), so they take a look of their own: uniforms shared by everything in `root`.
import * as THREE from 'three';
import { dither } from './fade.js';
import { PROXY, NEIGHBOR_DIM } from './materials.js';

function patch(mat, u) {
  if (mat.userData.farLook) return;
  mat.userData.farLook = u;
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uFarFade: u.fade, uFarInv: u.inv, uFarRange: u.range, uFarDim: u.dim });
    sh.fragmentShader = 'uniform float uFarFade, uFarInv, uFarRange;\nuniform vec3 uFarDim;\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + dither('uFarFade', 'uFarInv', 'uFarRange'))
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= uFarDim;');
  };
  mat.customProgramCacheKey = () => key + '|far';
  mat.needsUpdate = true;
}

// Everything in root (and whatever was added to it since: call again) takes the look; its uniforms.
export function farLook(root) {
  const u = root.userData.farLook ??= { fade: { value: 1 }, inv: { value: 0 }, range: { value: 1 }, dim: { value: new THREE.Color(1, 1, 1) } };
  root.traverse(o => { if (o.material) for (const m of [].concat(o.material)) patch(m, u); });
  return u;
}

// What a colour is times, dimmed `dim` of the way to the proxies' tint, mixed as the eye sees it
// (the same as the proxies' shader, render/neighbors.js)
const tint = new THREE.Color(PROXY.tint);
export function dimColor(dim, target = new THREE.Color()) {
  const k = c => Math.pow(1 + (Math.pow(c, 1 / 2.2) - 1) * dim, 2.2);
  return target.setRGB(k(tint.r), k(tint.g), k(tint.b));
}

// root shown as part of cube `cube` (game/drawn.js drawnAt: its fades in `group`, its dim; null:
// as in the cube played in, solid and undimmed); people: dimmed as people are (a little less)
export function setFarLook(root, cube, people = true) {
  const u = farLook(root), f = cube?.group?.userData;
  u.fade.value = f?.fadeU?.value ?? 1;
  u.inv.value = f?.fadeInv?.value ?? 0;
  u.range.value = f?.rangeFadeU?.value ?? 1;
  dimColor((cube?.dim ?? 0) * (people ? NEIGHBOR_DIM.people : 1), u.dim.value);
}
