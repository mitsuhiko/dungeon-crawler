// Where falls land: splash rings, and point lights over lava. The sheets themselves are part of
// the cube's geometry (render/parts.js), drawn by the cube and its proxy alike.
import * as THREE from 'three';
import { N, LH, LAVA, DIRS } from '../core/constants.js';
import { FLUID_LOOK, WIND } from './materials.js';
import { restY, swellGLSL } from './surface.js';
import { CELLS, useCells } from './watercells.js';
import { paletteOf } from './fluidpal.js';
import { palRow } from '../themes/fluids.js';
import { cutMaterial } from './section.js';
import { FALL_WIDTH } from './parts.js';
import { fallShift } from '../core/falls.js';
import { camera } from './scene.js';

// What rides on the water where a cartoon fall lands (FLUID_LOOK rides): a crown of foam
// round the foot of the sheet, its top edge in peaks that rise and fall, and on the pool a ragged
// patch of foam with arcs of ripples spreading from it downstream, breaking up and fading as they
// go, and a trail of foam streaming off downstream, spreading and thinning out. In the cube's
// coordinates, rising and falling with the pool's swell (materials.js), in the foam colour of
// the pool's palette (render/fluidpal.js), its pattern the fluid's (watercells.js CELLS).
// (rides edits a cut material: the cut's inject replaces what was there before it)
const TAU = Math.PI * 2;
function rides(mat, name, S, style, fragment) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  useCells(mat, style);
  mat.onBeforeCompile = (sh, r) => {
    compile?.call(mat, sh, r);
    sh.uniforms.uCellTime = WIND; sh.uniforms.uCellTex = CELLS[style].tex;
    sh.vertexShader = 'uniform float uCellTime;\nvarying vec2 vRideUv;\nvarying vec2 vRideP;\n' + swellGLSL(S) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRideUv = uv; vRideP = position.xz;
      transformed.y += swellY(position.xz, uCellTime);`);
    sh.fragmentShader = 'uniform float uCellTime;\nuniform sampler2D uCellTex;\nvarying vec2 vRideUv;\nvarying vec2 vRideP;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { float tm = uCellTime; ${fragment} }`);
  };
  mat.customProgramCacheKey = () => key + '-' + name + '-' + style;   // (programs are shared by key)
  return mat;
}
// The crown stands round the sheet's foot, half behind it and half in front: the sheet does not
// write depth, so the half away from the camera is drawn before the sheets (PART_ORDER.fall,
// render/partmeshes.js) and the half towards it after them (tickFalls picks which is which).
// Returns [the cliff's half, the downstream half].
function foamCrown(cx, y, cz, dx, dz, width, foam, S, style) {
  const mat = crownMaterial(foam, S, style), down = Math.atan2(dx, dz);
  return [down + Math.PI / 2, down - Math.PI / 2].map(start => {
    // half an open ring, wide across the sheet, shallow out from the cliff; u round the whole
    // ring (the peaks run on across the halves), v up
    const g = new THREE.CylinderGeometry(1, 1, 0.42, 14, 1, true, start, Math.PI).translate(0, 0.21, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (start + uv.getX(i) * Math.PI) / TAU);
    g.scale(dx ? 0.36 : width * 0.62, 1, dx ? width * 0.62 : 0.36).translate(cx, y - 0.06, cz);
    return new THREE.Mesh(g, mat);
  });
}
function crownMaterial(foam, S, style) {
  return rides(cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, depthWrite: false, side: THREE.DoubleSide })), 'crown', S, style, `
    float u = vRideUv.x * ${TAU.toFixed(4)}, v = vRideUv.y;
    float peak = 0.3 + 0.7 * (0.5 + 0.5 * sin(u * 9.0 + tm * 4.0)) * (0.6 + 0.4 * sin(u * 5.0 - tm * 2.7 + 1.0));
    float av = fwidth(v) + 1e-4;
    diffuseColor.a = 1.0 - smoothstep(peak - av, peak + av, v);
    diffuseColor.rgb *= mix(vec3(0.78, 0.9, 1.0), vec3(1.0), smoothstep(0.1, 0.35, v));
    if (diffuseColor.a < 0.01) discard;`);
}
const TRAIL = 4.5;   // world units the foam streams off downstream
function ripples(cx, y, cz, dx, dz, foam, S, style) {
  // from R behind the foot to TRAIL downstream, R to either side
  const R = 1.45, along = R + TRAIL, mid = (TRAIL - R) / 2;
  const g = new THREE.PlaneGeometry(dx ? along : R * 2, dx ? R * 2 : along, dx ? 12 : 6, dx ? 6 : 12).rotateX(-Math.PI / 2)
    .translate(cx + dx * mid, y, cz + dz * mid);
  const T = (CELLS[style].tile / CELLS[style].perUnit).toFixed(4);
  const mat = rides(cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, depthWrite: false })), 'ripples', S, style, `
    vec2 d = vRideP - vec2(${cx.toFixed(3)}, ${cz.toFixed(3)}), dir = vec2(${dx.toFixed(1)}, ${dz.toFixed(1)});
    float r = length(d), ang = atan(d.y, d.x), down = dot(d / max(r, 1e-3), dir);
    float ar = fwidth(r) + 1e-4;
    // the trail: the cells' gaps stretched along the stream, flowing off, spreading and thinning
    float al = dot(d, dir), ac = dot(d, vec2(-dir.y, dir.x));
    vec4 c = texture2D(uCellTex, vec2(ac * 0.9 / ${T}, (al - tm * 1.1) * 0.35 / ${T}) + 0.41);
    float wide = 0.35 + al * 0.22, at = fwidth(c.r) * 0.7 + 1e-3;
    float trail = smoothstep(0.5 - at, 0.5 + at, c.r + 0.12 * smoothstep(1.2, 0.3, al))
      * smoothstep(0.2, 0.6, al) * smoothstep(${TRAIL.toFixed(1)}, 1.2, al) * smoothstep(wide, wide * 0.6, abs(ac));
    // the foam where it lands
    float a = trail;
    a = max(a, 1.0 - smoothstep(0.42 - ar, 0.42 + ar, r + 0.06 * sin(ang * 6.0 + tm * 3.0) + 0.03 * sin(ang * 13.0 - tm * 5.0)));
    // the arcs, downstream (and a little round the sides), broken up, thinning and fading as they spread
    for (int i = 0; i < 3; i++) {
      float fi = float(i), ph = fract(tm * 0.55 + fi / 3.0), rad = 0.45 + ph * 0.9, wid = 0.045 * (1.0 - ph) + 0.012;
      float band = 1.0 - smoothstep(wid - ar, wid + ar, abs(r + 0.04 * sin(ang * 7.0 + fi * 2.0 + tm) - rad));
      float broken = smoothstep(0.15, 0.3, 0.5 + 0.5 * sin(ang * 3.0 + fi * 1.7 + ph * 2.0));
      a = max(a, band * broken * smoothstep(-0.35, 0.15, down) * (1.0 - ph * ph));
    }
    diffuseColor.a = a;
    if (a < 0.01) discard;`);
  return new THREE.Mesh(g, mat);
}

// What lies flat on the pool (the ripples, the splash ring) is drawn after the fluids' surfaces
// and before the sheets (PART_ORDER, render/partmeshes.js): what of it lies behind a sheet shows
// through it, what lies in front is under the water where the sheet runs on. The crown's half
// behind the sheet just after it, its half in front after the sheets.
const FLAT_ORDER = 2.5, BACK_ORDER = 2.6;

// a splash ring where a fall lands (render/parts.js fallSheets has the sheet), or the cartoon
// foam and ripples; crowns: what tickFalls turns to the camera
export function buildFalls(m, group) {
  const splashes = [], lights = [], crowns = [];
  for (const f of m.falls) {
    const [dx, dz] = DIRS[f.d], bx = f.c % N, bz = (f.c / N) | 0, [sx, sz] = fallShift(f);
    const yTop = restY(f.top * LH) + 0.02, yBot = restY(f.bot * LH) - 0.02, h = yTop - yBot;
    const ex = (dx > 0 ? bx : dx < 0 ? bx + 1 : bx + 0.5) + sx, ez = (dz > 0 ? bz : dz < 0 ? bz + 1 : bz + 0.5) + sz;
    if (f.out) continue;   // pours out through the bottom of the cube: no splash here
    const L = FLUID_LOOK[f.type], pal = paletteOf(f.pal?.[1] ?? palRow(m.depth ?? 0, f.type, 0)), foam = pal.hex.foam, cells = L.cells;
    if (L.rides) {
      // the pool's surface (render/floors.js fluidVolume) and the foot of the sheet (parts.js)
      const surf = restY(f.bot * LH), cx = ex + dx * 0.32, cz = ez + dz * 0.32;
      const [cliff, downstream] = foamCrown(cx, surf, cz, dx, dz, f.width ?? FALL_WIDTH, foam, cells, L.style), rip = ripples(cx, surf + 0.015, cz, dx, dz, foam, cells, L.style);
      rip.renderOrder = FLAT_ORDER;
      crowns.push({ cliff, downstream, cx, cz, dx, dz, front: 10 * f.layer + 5 });
      group.add(cliff, downstream, rip);
      continue;
    }
    const splash = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.05, 14),
      cutMaterial(new THREE.MeshBasicMaterial({ color: foam, transparent: true, opacity: 0.55, depthWrite: false })));
    splash.position.set(ex + dx * 0.3, yBot + 0.06, ez + dz * 0.3);
    splash.renderOrder = FLAT_ORDER;
    group.add(splash); splashes.push(splash);
    if (f.type === LAVA) {
      const l = new THREE.PointLight(lavaGlow(pal), 6, 6, 2);
      l.position.set(ex + dx * 0.6, yBot + h * 0.4, ez + dz * 0.6);
      lights.push(l); group.add(l);
    }
  }
  tickFalls(crowns, group);
  return { splashes, lights, crowns };
}

// every frame (render/world.js animateWorld): each crown's half on the camera's side of its sheet
// in front of the sheets, the other behind them
const eye = new THREE.Vector3();
export function tickFalls(crowns, group) {
  if (!crowns.length) return;
  group.updateWorldMatrix(true, false);
  group.worldToLocal(eye.copy(camera.position));
  for (const c of crowns) {
    const downstream = (eye.x - c.cx) * c.dx + (eye.z - c.cz) * c.dz > 0;
    c.cliff.renderOrder = downstream ? BACK_ORDER : c.front;
    c.downstream.renderOrder = downstream ? c.front : BACK_ORDER;
  }
}

// the light lava gives off: its palette's glow, a little towards the classic orange
const lavaGlow = pal => new THREE.Color().setRGB(...pal.emissive).lerp(new THREE.Color(0xff5a1a), 0.4);
// a few glows over lava bodies (at most 4 lights in total)
export function lavaLights(m, group, lights) {
  for (const f of m.floors) {
    if (f.fluid !== LAVA) continue;
    const x = f.x + 0.5, z = f.z + 0.5, y = f.surf * LH + 0.7;
    if (lights.some(l => Math.hypot(l.position.x - x, l.position.z - z, l.position.y - y) < 4) || lights.length >= 4) continue;
    const l = new THREE.PointLight(lavaGlow(paletteOf(f.pal ?? palRow(m.depth ?? 0, LAVA, 0))), 6, 6, 2);
    l.position.set(x, y, z);
    lights.push(l); group.add(l);
  }
}
