// The realtime shadow maps, drawn as the quality level asks (game/quality.js): the hero's lamp's
// cube of six maps and the sun's map of what moves (the fixed parts' shadows are baked,
// render/bake.js). Drawing them is most of what they cost (on a software renderer: the lamp's
// ~9 ms of a 79 ms frame, its lookups ~3; in a fight with 24 enemies the lamp's 16 ms and the
// sun's 23 of 136), and every enemy is drawn again in each of the seven, so what scales down is
// what is drawn and how often, never whether a light casts shadows at all: that would compile
// every lit shader again (3.5 s on a fast machine, the first time).
//   - lamp.range: how far its shadows reach (its light reaches on, without them: a wall past
//     that lets it through, faintly). The shadow camera's far plane, not the light's distance;
//     eased like the figures' reach.
//   - lamp.figures / sun.figures: enemies farther than this from the lamp / the hero cast none
//     into that map (0: none, Infinity: all). Eased (FIGURE_EASE), so their shadows drop out (and
//     come back) one by one at the edge, not all at once.
//   - lamp.every / sun.every: the map drawn every n-th frame.
//   - lamp.strength / sun.strength: shadow.intensity, faded towards (tickShadows). At 0 the
//     lamp's map is no longer drawn at all.
// The lamp's strength is also times how much its light still counts next to the sun's
// (setLampShare, from render/look.js): in sunshine everything near the hero would cast two
// shadows, the sun's and the lamp's, so there the lamp's go (and its maps are not drawn).
// The hero casts none into the lamp's maps at all: it hangs over the head, and the figure's
// shadow under it was a second one next to the sun's (its own light: a lantern carried).
// Enemy views are marked figures (render/enemies.js makeView: userData.figure).
import { renderer, scene, sun } from './scene.js';
import { character, lamp } from './character.js';

const FIGURE_EASE = 8;    // units/s: how fast the figures' reach follows what is asked
const FADE = 2;           // 1/s: shadow strength (half a second from one end to the other)
const ALL = 40;           // a reach past any cube: every enemy (Infinity eases through it)

const want = { lamp: { range: Infinity, figures: Infinity, every: 1, strength: 1 }, sun: { figures: Infinity, every: 1, strength: 1 } };
const now = { lampRange: ALL, lampFigures: ALL, sunFigures: ALL, lampStrength: 1, sunStrength: 1 };
let frame = 0, lampShare = 1;

// how much the lamp's shadows still count (0..1: none in full sun, all in the dark)
export function setLampShare(share) { lampShare = Math.min(1, Math.max(0, share)); }
const lampWanted = () => want.lamp.strength * lampShare;

export function setShadowLook(look) {
  Object.assign(want.lamp, look.lamp);
  Object.assign(want.sun, look.sun);
}

// straight to what is asked (the first level, at the start)
export function snapShadows() {
  Object.assign(now, { lampRange: Math.min(ALL, want.lamp.range), lampFigures: Math.min(ALL, want.lamp.figures), sunFigures: Math.min(ALL, want.sun.figures),
    lampStrength: lampWanted(), sunStrength: want.sun.strength });
  lamp.shadow.intensity = now.lampStrength;
  sun.shadow.intensity = now.sunStrength;
}

const toward = (v, w, step) => v + Math.sign(w - v) * Math.min(step, Math.abs(w - v));
// every frame (game/quality.js): the eased values
export function tickShadows(dt) {
  now.lampRange = toward(now.lampRange, Math.min(ALL, want.lamp.range), dt * FIGURE_EASE);
  now.lampFigures = toward(now.lampFigures, Math.min(ALL, want.lamp.figures), dt * FIGURE_EASE);
  now.sunFigures = toward(now.sunFigures, Math.min(ALL, want.sun.figures), dt * FIGURE_EASE);
  now.lampStrength = toward(now.lampStrength, lampWanted(), dt * FADE);
  now.sunStrength = toward(now.sunStrength, want.sun.strength, dt * FADE);
  lamp.shadow.intensity = now.lampStrength;
  sun.shadow.intensity = now.sunStrength;
}

// the lamp's shadow camera reaches as far as lamp.range (three sets its far plane to the
// light's distance)
const updateMatrices = lamp.shadow.updateMatrices.bind(lamp.shadow);
lamp.shadow.updateMatrices = (light, face) => {
  const d = light.distance;
  light.distance = Math.min(d || Infinity, now.lampRange);
  updateMatrices(light, face);
  light.distance = d;
};

// enemies too far from `at` stop casting for one map; restored after it
const hidden = [];
function hideFigures(at, reach) {
  if (reach >= ALL) return;
  for (const o of scene.children) {
    if (!o.userData.figure || !o.visible) continue;
    if (reach > 0 && o.position.distanceToSquared(at) <= reach * reach) continue;
    o.traverse(m => { if (m.isMesh && m.castShadow) { m.castShadow = false; hidden.push(m); } });
  }
}
// the hero (and what it wears and holds) casts none into the lamp's maps
function hideHero() {
  if (!character.ready) return;
  character.group.traverse(m => { if (m.isMesh && m.castShadow) { m.castShadow = false; hidden.push(m); } });
}
function showFigures() { for (const m of hidden) m.castShadow = true; hidden.length = 0; }

// three.js gives every shadow map a colour target beside its depth, as big as the map (RGBA: the
// sun's 16 MB at 2048², the lamp's cube 6 MB, a bake light's cube 24 MB while it bakes, each sun
// place baked a moment), and nothing reads it: the shaders read the depth. Once three has set a
// map up (its first draw), its colour goes: a framebuffer of depth alone is complete in WebGL 2,
// and what the depth materials write to colour falls away. three binds a cube's colour again for
// each face it draws: none now (its texture is null). Its own note of the framebuffer bound is
// kept (state.bindFramebuffer), and what it had bound bound again.
const gl = renderer.getContext();
function colourless(target) {
  if (!target || target.colourless) return;
  const texture = renderer.properties.get(target.texture), buffers = renderer.properties.get(target).__webglFramebuffer;
  if (!texture.__webglTexture || !buffers) return;
  const cube = !!target.isWebGLCubeRenderTarget;
  for (let face = 0; face < (cube ? 6 : 1); face++) {
    renderer.state.bindFramebuffer(gl.FRAMEBUFFER, cube ? buffers[face] : buffers);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, cube ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + face : gl.TEXTURE_2D, null, 0);
  }
  gl.deleteTexture(texture.__webglTexture);
  texture.__webglTexture = null;
  target.colourless = true;
  renderer.setRenderTarget(renderer.getRenderTarget(), renderer.getActiveCubeFace(), renderer.getActiveMipmapLevel());
}

// three draws every light's map in one call: the lamp and the sun each get a call of their own,
// with their own casters (anything else, a bake's light, passes as it came); each map's colour
// let go after (colourless)
const draw = renderer.shadowMap.render.bind(renderer.shadowMap);
const render = (lights, s, camera) => {
  draw(lights, s, camera);
  for (const light of lights) colourless(light.shadow?.map);
};
renderer.shadowMap.render = (lights, s, camera) => {
  frame++;
  const hasLamp = lights.includes(lamp), hasSun = lights.includes(sun);
  if (!hasLamp && !hasSun) return render(lights, s, camera);
  const rest = lights.filter(l => l !== lamp && l !== sun);
  if (rest.length) render(rest, s, camera);
  const due = (every, light) => !light.shadow.map || every <= 1 || frame % every === 0;
  if (hasSun && due(want.sun.every, sun)) {
    hideFigures(character.ready ? character.group.position : sun.target.position, now.sunFigures);
    try { render([sun], s, camera); } finally { showFigures(); }
  }
  // (at no strength the lamp's map stays as it is: drawn once at least, its sampler needs one)
  if (hasLamp && (now.lampStrength > 0 || !lamp.shadow.map) && due(want.lamp.every, lamp)) {
    hideFigures(lamp.position, now.lampFigures); hideHero();
    try { render([lamp], s, camera); } finally { showFigures(); }
  }
};

export const shadowState = () => ({ ...now, lampShare, lamp: { ...want.lamp }, sun: { ...want.sun } });
