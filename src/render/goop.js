// The look of Sollmeldon's mud, one for all of it: the mud lying in his mire (render/mud.js) and his
// Mud squirtles, who are of it (render/squirtlelook.js). Glossy marbled goop like that of Isle
// Delfino: near-black mud, its darker and browner patches turning through each other, thin brown
// streaks swirling through it with a pale core here and there; a lighter rim where it thins out.
// GLSL: goopColor(p, tm) the colour at p (its own coordinates, world units: the swirls are about a
// cell and a half across) at time tm.
import * as THREE from 'three';

export const GOOP_COLORS = { dark: '#0d0805', mid: '#22160e', light: '#6a4a30', cream: '#a8845e', rim: '#3c2a1c' };
const c = name => { const v = new THREE.Color(GOOP_COLORS[name]); return `vec3(${v.r.toFixed(4)}, ${v.g.toFixed(4)}, ${v.b.toFixed(4)})`; };
export const GOOP_RIM = c('rim');
export const GOOP_GLSL = `
  float goopHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float goopNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(goopHash(i), goopHash(i + vec2(1.0, 0.0)), f.x), mix(goopHash(i + vec2(0.0, 1.0)), goopHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float goopFbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * goopNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  vec3 goopColor(vec2 p, float tm) {
    p *= 0.45;
    vec2 q = vec2(goopFbm(p + vec2(0.0, tm * 0.015)), goopFbm(p + vec2(5.2, 1.3) - vec2(tm * 0.012, 0.0)));
    float m = goopFbm(p + 2.4 * q);
    float band = sin(m * 15.0 + q.y * 5.0), aw = fwidth(band) * 0.8 + 1e-3;
    float streak = smoothstep(0.72 - aw, 0.72 + aw, band), core = smoothstep(0.95 - aw, 0.95 + aw, band);
    vec3 col = mix(${c('dark')}, ${c('mid')}, smoothstep(0.4, 0.68, m));
    col = mix(col, ${c('light')}, streak * 0.85);
    return mix(col, ${c('cream')}, core * 0.5);
  }
`;
