// Cutaway: a slowly turning nine-cornered shape on screen around the character (cutshader.js).
// Inside it, everything above the cut height on the camera's side of the character (a
// vertical plane through it, facing the camera) is discarded; nothing behind the character is
// touched, however high it reaches. Cut solids show their insides: back
// faces are drawn as a flat cap, and the cut-away part as faint glass (ghosts.js). The cap
// has one colour per kind of solid (rock strata at the cut height, structure stone, wood), so
// the inner faces seen through the cut read as a single flat lid.
// Cut fluids get flat caps. Props (and the trials' parts) are cut too; their insides show as a
// cap in their own colour ('self').
import * as THREE from 'three';
import { N, LH, CUBE_H } from '../core/constants.js';
import { floorY, runY } from '../core/surfaces.js';
import { GeoBuilder } from './builder.js';
import { C, gradient } from './palette.js';
import { paletteOf } from './fluidpal.js';
import { palRow } from '../themes/fluids.js';
import { themeOf } from '../themes/depth.js';
import { buildOf } from '../themes/builds.js';
import { scene, camera, renderer } from './scene.js';
import { U, inject, turnShape, CUT_KINDS } from './cutshader.js';
import { WALL_CUT, CUT_HEIGHT } from './interior.js';
import { showGhosts } from './ghosts.js';
import { restY, ownTakes } from './surface.js';
import { waterSolids } from './shore.js';

const RADIUS = 2.8;   // world units around the character

// how much darker a cap is than an unshadowed floor of the same colour
const CAP_SHADE = 0.68;

const CAP_UNIFORM = { rock: 'uCapRock', stone: 'uCapStone', wood: 'uCapWood', self: 'diffuseColor.rgb' };

// a cap's colour: the kind's flat colour, lit like an upward-facing floor (sky + sun, no
// shadows), a little darker; tint: GLSL the colour is multiplied with (the proxies' darkening)
export const capLight = (caps, tint = 'vec3(1.0)') => `{
        vec3 capUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), capIrr = vec3(0.0);
        #if NUM_HEMI_LIGHTS > 0
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) capIrr += getHemisphereLightIrradiance(hemisphereLights[i], capUp);
        #endif
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) capIrr += directionalLights[i].color * max(dot(capUp, directionalLights[i].direction), 0.0);
        #endif
        outgoingLight = BRDF_Lambert(${CAP_UNIFORM[caps]} * ${tint}) * capIrr * ${CAP_SHADE.toFixed(3)};
      }`;
// A prop stands a little sunk into the ground, so where a cut opens one its underside, the cap
// there, lies just under the ground's surface, and the ground showed through: its back faces
// count as a few centimetres nearer the camera (only they: what sits on the prop's surface, a
// rune, a glowing pane, must not go under it).
const PROP_AHEAD = 0.03;   // world units
const PROP_AHEAD_DEPTH = `gl_FragDepth = gl_FragCoord.z;
      if (!gl_FrontFacing) {
        vec4 capClip = projectionMatrix * viewMatrix * vec4(vCutW + normalize(cameraPosition - vCutW) * ${PROP_AHEAD.toFixed(3)}, 1.0);
        gl_FragDepth = clamp(capClip.z / capClip.w * 0.5 + 0.5, 0.0, 1.0);
      }`;
const CUT_DISCARD = 'if (cutRegion(true) > 0.5 || frontWall()) discard;\n#include <clipping_planes_fragment>';

// a material that gets cut away; caps ('rock' | 'stone' | 'wood'): its back faces show as
// the flat cap in that kind's colour (capLight; the mesh also gets a capTwin); 'self': in the
// material's own colour, and only under a cut (a prop's model need not be closed: its back faces
// stay hidden elsewhere); ghost: the cut-away part is drawn again as glass (ghosts.js)
export function cutMaterial(mat, caps = false, ghost = !!caps) {
  // (unlit materials have no light to give a cap)
  if (caps === 'self' && !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) caps = false;
  const self = caps === 'self';
  if (caps) { mat.side = THREE.DoubleSide; mat.shadowSide = THREE.BackSide; }
  mat.userData.ghost = ghost;
  inject(mat, fs => {
    fs = fs.replace('#include <clipping_planes_fragment>', CUT_DISCARD);
    if (self) fs = 'uniform mat4 projectionMatrix;\n' + fs.replace('#include <clipping_planes_fragment>', `if (!gl_FrontFacing && !underCut()) discard;
      ${PROP_AHEAD_DEPTH}
      #include <clipping_planes_fragment>`);
    // cap-only faces (palette.js CAP_ONLY) are not drawn from the front
    if (caps && !self) fs = fs.replace('#include <clipping_planes_fragment>', `#ifdef USE_COLOR
        if (gl_FrontFacing && vColor.r + vColor.g + vColor.b < 1e-4) discard;
      #endif
      #include <clipping_planes_fragment>`);
    if (caps) fs = fs.replace('#include <opaque_fragment>', `if (!gl_FrontFacing) ${capLight(caps)}
      #include <opaque_fragment>`);
    return fs;
  }, caps ? 'cut-caps-' + caps : 'cut', CUT_KINDS[caps] ?? 3);
  return mat;
}

// Solids are built of boxes that touch (stair steps, a stair on the ground or against a cliff,
// a panel on a wall). Where the cut opens one, its cap (a back face) lies in the very plane of
// the neighbour's front face, and the two flickered. The cap twin draws the back faces again,
// as caps, a few steps of the depth buffer nearer the camera, so the cap wins there: the inside
// of a cut solid reads as one flat lid. Only under a cut (cutshader.js underCut), so the edges of
// whole solids keep their outlines.
const CAP_AHEAD = 4;   // depth buffer steps (24 bits)
function capMaterial(caps) {
  const mat = inject(new THREE.MeshLambertMaterial({ side: THREE.BackSide }), fs => fs
    .replace('#include <clipping_planes_fragment>', 'if (!underCut()) discard;\n' + CUT_DISCARD)
    .replace('#include <opaque_fragment>', capLight(caps) + '\n#include <opaque_fragment>'), 'cut-cap-' + caps, CUT_KINDS[caps]);
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    compile.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>\n  gl_Position.z -= ${(2 * CAP_AHEAD / 2 ** 24).toExponential(6)} * gl_Position.w;`);
  };
  return mat;
}

// the cap twin of a solid mesh (cutMaterial(mat, caps)): shares its geometry, casts and takes no
// shadow, draws after the solids; wrap: what the solid's material went through after
// cutMaterial (swaying flags)
export function capTwin(mesh, caps, wrap = m => m) {
  const twin = new THREE.Mesh(mesh.geometry, wrap(capMaterial(caps)));
  twin.position.copy(mesh.position); twin.quaternion.copy(mesh.quaternion); twin.scale.copy(mesh.scale);
  twin.renderOrder = mesh.renderOrder + 1;
  twin.userData.sharedGeo = true;   // the solid owns the geometry
  return twin;
}

// fluid caps: a flat quad at the cut height for every fluid cell it passes through, drawn
// only inside the cutaway
const fluidCaps = new THREE.Mesh(new THREE.BufferGeometry(), inject(new THREE.MeshBasicMaterial({ vertexColors: true }),
  fs => fs.replace('#include <clipping_planes_fragment>', 'if (cutRegion(false) < 0.5) discard;\n#include <clipping_planes_fragment>'), 'cut-fluid-cap'));
scene.add(fluidCaps);
// (a fluid's cap: its palette's, render/fluidpal.js)
const capColor = row => C(paletteOf(row).hex.cap);

// A standing fluid (render/trials.js: a trial's, a boss's tide) is drawn over the ground it stands
// on (render/shore.js), not inside the solids. It is not drawn where the cube's own fluid takes
// its level (WATER_OWN: 1 in r; render/surface.js ownTakes). Its walls (materials.js cellMaterial):
// per cell the corners of the floor (or structure: render/shore.js waterSolids) it meets there,
// the highest under its surface (WATER_SHORE;
// none: far under). The cutaway drops it above the cut, and its cap covers only the cells open
// at the cut height. level: its level (world units; null: none)
let trialWater = null, solidKey = '', solidMap = null;
export function setTrialWaterCap(level, fluid, pal = palRow(0, fluid, 0)) {
  trialWater = level == null ? null : { level, fluid, pal };
}
const cellTexture = () => ({ value: new THREE.DataTexture(new Float32Array(N * N * 4), N, N, THREE.RGBAFormat, THREE.FloatType) });
export const WATER_OWN = cellTexture(), WATER_SHORE = cellTexture();
function standingCells(map) {
  const level = trialWater?.level, k = map && level != null ? level.toFixed(3) : '';
  if (k === solidKey && map === solidMap) return;
  solidKey = k; solidMap = map;
  const own = WATER_OWN.value.image.data, shore = WATER_SHORE.value.image.data;
  own.fill(0); shore.fill(-1e3);
  if (k) for (let i = 0; i < N * N; i++) {
    own[i * 4] = ownTakes(map.cols[i], level) ? 1 : 0;
    const meets = waterSolids(map, i).filter(f => f.bottom * LH < restY(level)).sort((p, q) => q.top - p.top)[0];
    if (meets) for (let c = 0; c < 4; c++) shore[i * 4 + c] = meets.cs[c];
  }
  WATER_OWN.value.needsUpdate = true; WATER_SHORE.value.needsUpdate = true;
}
// is the middle of cell i solid at height y (a floor's column or a structure piece)?
function solidAt(map, i, y) {
  for (const f of map.cols[i]) if (f.bottom * LH < y && floorY(f, 0.5, 0.5) > y) return true;
  for (const p of map.pieces?.[i] || []) {
    if (p.kind === 'pillar') continue;
    const t = runY(p, 0.5, 0.5);
    if (t > y && (p.kind === 'bridge' ? t - 0.2 : p.base) < y) return true;
  }
  return false;
}

const tmp = new THREE.Vector3(), right = new THREE.Vector3();
let key = '', capKey = '';

// cap colours for the theme of `map`: rock is the cliff strata band at height y (as on the
// cliff walls, see walls.js), stone and wood are the theme's structure materials
function capColors(map, y) {
  if (!map) return;
  const theme = themeOf(map), band = Math.max(0, Math.floor(y)), k = theme.props + ':' + band;
  if (k === capKey) return;
  capKey = k;
  const build = buildOf(theme);
  U.uCapRock.value.copy(gradient(theme.side, band / LH)).multiplyScalar(0.94);
  U.uCapStone.value.set(build.stone);
  U.uCapWood.value.set(build.wood);
}
// Caves and canyons: the walls on the camera's sides never come down below what stands behind
// them (the ground, a stair or bridge on it, at its lowest in that cell, and a little more):
// lower, they would hide nothing more. That is the first cell inside the band (uWallBand) the
// walls are cut in (in a corner, diagonally inside); per side (+x, -x, +z, -z), 16 heights
// along it.
const OVER_LAND = 0.25;
let floorsOf = null;
function wallFloors(map) {
  const a = U.uWallFloor.value;
  if (map === floorsOf) return;
  floorsOf = map;
  a.fill(0);
  if (!map?.walled || map.interior) return;
  // (in Flip's box only the fight's floors: what stands out of its walls overhead is wall)
  const tops = map.cols.map(col => Math.max(0, ...col.filter(f => !map.flip || f.encounter).map(f => f.fluid ? f.surf * LH : Math.min(...f.cs))));
  for (const r of map.runs) for (const p of r.pieces) tops[p.z * N + p.x] = Math.max(tops[p.z * N + p.x], Math.min(p.y0, p.y1));
  const top = (x, z) => tops[Math.min(N - 3, Math.max(2, z)) * N + Math.min(N - 3, Math.max(2, x))] + OVER_LAND;
  for (let t = 0; t < N; t++) { a[t] = top(N - 3, t); a[N + t] = top(2, t); a[2 * N + t] = top(t, N - 3); a[3 * N + t] = top(t, 2); }
}

// y = height of the cut (Infinity for none), (px, py, pz) = the point to keep visible; walls:
// the walls on the camera's side may come down (not in the close view, game/camera.js)
export function setCut(y, map, px, py, pz, walls = true) {
  const on = y < CUBE_H;
  turnShape(performance.now() / 1000);
  U.uCutY.value = on ? y : 1e3;
  // cave and canyon walls (and the walls of a house, inside) on the camera's side come down to a little
  // over the character
  // inside a house they go entirely, down to the floor, with what hangs on them (not the door)
  const inside = map?.interior, room = inside?.room, t = inside?.wall ?? 0;
  // (only the walls' own mesh there: not the floors, the stair or the railing beside them)
  if (room) { U.uWallBox.value.set(room.x0 - t, room.x1 + t, room.z0 - t, room.z1 + t); U.uWallBand.value = t + WALL_CUT; U.uFrontKinds.value.set(0, 1, 0, 0); U.uFrontCorners.value = 0; }
  // (Flip's box: what stands out of its walls comes down with them, cubegen/fliparena.js)
  else { U.uWallBox.value.set(0, N, 0, N); U.uWallBand.value = map?.flip ? 3.6 : 2.2; U.uFrontKinds.value.set(1, 1, 1, 1); U.uFrontCorners.value = 1; }
  const box = U.uWallBox.value, walled = walls && (!!map?.walled || !!room);
  const cx = camera.position.x - (box.x + box.y) / 2, cz = camera.position.z - (box.z + box.w) / 2;
  wallFloors(map);
  U.uFront.value.set(walled && cx > 6 ? 1 : 0, walled && cx < -6 ? 1 : 0, walled && cz > 6 ? 1 : 0, walled && cz < -6 ? 1 : 0);
  // the cut-away part as glass (ghosts.js): inside a cut, and where cave and canyon walls come down
  const f = U.uFront.value;
  U.uWallGlass.value = !room && f.x + f.y + f.z + f.w > 0 ? 1 : 0;
  showGhosts(on || U.uWallGlass.value > 0);
  // a room's walls whose inner face the camera is not beyond: no line of sight from the camera
  // into the room crosses them, so the cutaway must not open holes in them
  const cp = camera.position;
  if (room && walls) U.uBack.value.set(cp.x < room.x1 ? 1 : 0, cp.x > room.x0 ? 1 : 0, cp.z < room.z1 ? 1 : 0, cp.z > room.z0 ? 1 : 0);
  else U.uBack.value.set(0, 0, 0, 0);
  U.uWallY.value = inside ? inside.door.y + CUT_HEIGHT : py + 1;
  camera.updateMatrixWorld();
  renderer.getDrawingBufferSize(U.uRes.value);
  U.uAspect.value = camera.aspect;
  // horizontal direction towards the camera (the camera looks down at the character)
  camera.getWorldDirection(tmp);
  const len = Math.hypot(tmp.x, tmp.z), nx = len > 1e-4 ? -tmp.x / len : 0, nz = len > 1e-4 ? -tmp.z / len : 0;
  U.uSide.value.set(nx, nz, nx * px + nz * pz);
  tmp.set(px, py, pz).project(camera);
  U.uCenter.value.set(tmp.x, tmp.y);
  // radius: project a point RADIUS to the side of the character
  right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(RADIUS).add(new THREE.Vector3(px, py, pz)).project(camera);
  U.uRadius.value = Math.hypot((right.x - tmp.x) * camera.aspect, right.y - tmp.y);
  capColors(map, on ? y : py + 1);

  standingCells(map);
  const water = on && trialWater && restY(trialWater.level) > y ? trialWater.pal : null;
  const k = on ? y.toFixed(3) + ':' + (water ?? '') : 'off';
  if (k === key && map === fluidCaps.userData.map) return;
  key = k; fluidCaps.userData.map = map;
  const b = new GeoBuilder(), capped = new Set();
  if (on && map) for (const f of map.floors) {
    if (!f.fluid || f.top * LH >= y || restY(f.surf * LH) <= y) continue;
    b.quad([f.x, y, f.z], [f.x + 1, y, f.z], [f.x + 1, y, f.z + 1], [f.x, y, f.z + 1], [0, 1, 0], capColor(f.pal ?? map.fluidRows?.[f.fluid] ?? palRow(map.depth ?? 0, f.fluid, 0)));
    capped.add(f.z * N + f.x);
  }
  if (water != null && map) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    if (capped.has(i) || solidAt(map, i, y)) continue;
    b.quad([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1], [0, 1, 0], capColor(water));
  }
  fluidCaps.geometry.dispose();
  fluidCaps.geometry = b.build();
}
