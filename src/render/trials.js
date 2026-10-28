// What a trial room shows (docs/trials.md): its parts, the rising fluid (one surface clipped to
// the cube's box: the room fills like an aquarium) and the tide lines on the glass that warn of it.
// The parts are models: the trials' library (assets/trials.glb, blender/trials.py; loaded with
// the cube's prop sets, render/propplace.js), each part of pieces that move on their own (a
// lever's arm, a gate's bars, a flame), and the props it borrows (the ruins' brazier, the mines'
// crate: TRIAL_PROPS). buildTrialView adds them to a cube being built (render/world.js);
// game/trials.js sets the level and the parts' state every frame.
import * as THREE from 'three';
import { N, BASE, LH, DIRS, OPP } from '../core/constants.js';
import { EDGE_CORNERS, edgePts } from '../core/constants.js';
import { fluidMaterial, cellMaterial, FLUID_LOOK, solidMaterial } from './materials.js';
import { restY, tideY, stepWet } from './surface.js';
import { TRIALS } from '../core/trials.js';
import { GeoBuilder } from './builder.js';
import { gradient } from './palette.js';
import { cutMaterial, setTrialWaterCap, WATER_OWN, WATER_SHORE } from './section.js';
import { groundAt, slopeAt, waterSolids } from './shore.js';
import { wallPieces, wetWall, wetSlope } from './floors.js';
import { inb } from '../core/util.js';
import { inject } from './cutshader.js';
import { themeOf } from '../themes/depth.js';
import { palRow } from '../themes/fluids.js';
import { soft, glow as glowLayer, rand, emit } from './particles.js';
import { props } from './props.js';
import { TRIAL_PROPS } from './propplace.js';
import { flameSet, douseFlames } from './flames.js';
import { BODY } from './fonts.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// --- the models ----------------------------------------------------------------------------------
// The materials of the cube being built: one per material of the library, cloned for the cube
// like the props' (render/props.js); a piece that changes colour gets its own.
let shared = new Map();
// (cut open, their insides show in their own colour)
const cutPart = m => cutMaterial(m, 'self', false);
const cut = m => shared.get(m) ?? shared.set(m, cutPart(m.clone())).get(m);
const isGlow = m => m.name.endsWith('_glow');
// A piece of the trials' library or a borrowed prop (its catalog geometry): its mesh, or a group
// of its meshes (a glowing part is a mesh of its own: userData.glow). own: its own materials;
// mat: drawn with this one. Not loaded (yet: the cube is built again once it is, game/flow.js):
// an empty mesh, so the setters still find a material.
function piece(name, { own = false, mat = null } = {}) {
  const parts = props.byName.get(name)?.parts;
  if (!parts) return new THREE.Mesh(new THREE.BufferGeometry(), mat ?? new THREE.MeshStandardMaterial());
  const meshes = parts.map(part => {
    const m = new THREE.Mesh(part.geometry, mat ?? (own ? cutPart(part.material.clone()) : cut(part.material)));
    m.userData.sharedGeo = true;   // the catalog owns the geometry
    m.userData.glow = isGlow(part.material);
    m.castShadow = !m.userData.glow; m.receiveShadow = true;
    return m;
  });
  if (meshes.length === 1) return meshes[0];
  const g = new THREE.Group();
  g.add(...meshes);
  return g;
}
// what a piece turns round (its extras), in its part
const pivotOf = name => props.byName.get(name)?.pivot ?? [0, 0, 0];
// cut off beyond a plane (a gate's bars where they rise into the lintel, a cage below the ground)
function clipTo(obj, plane) {
  obj.traverse(o => { if (o.material) { o.material.clippingPlanes = [plane]; o.material.clipShadows = true; } });
}
const at = (g, p) => { g.position.set(p.x, p.y, p.z); return g; };

// the button (and the parts built like one: the lightning rod, the vent valve): its model with
// a glowing knob in its cup (rest: the knob's height; pressed it sinks), a halo on the ground
function button(p, color, model = 'trial_button', knobAt = [0, 0.74, 0]) {
  const g = new THREE.Group(), knob = piece('trial_knob', { own: true });
  knob.material.color.set(color); knob.material.emissive.set(color); knob.material.emissiveIntensity = 1.4;
  knob.position.set(...knobAt);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24), glow(color, 0.35));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
  const light = new THREE.PointLight(color, 2.5, 4, 2);
  light.position.set(knobAt[0], knobAt[1] + 0.35, knobAt[2]);
  g.add(piece(model), knob, halo, light);
  return { obj: at(g, p), knob, halo, light, rest: knobAt[1] };
}

// a pressure plate: a stone slab, its rune glowing once it holds
function plate(p, color) {
  const g = new THREE.Group(), rune = piece('trial_plate_rune', { mat: glow(color, 0.5) });
  g.add(piece('trial_plate'), rune);
  return { obj: at(g, p), rune, color: new THREE.Color(color) };
}
// a portcullis across a gap (across the way through, side: the way), w cells wide: stone posts,
// a lintel, the iron grate (a piece a cell) that rises open into the lintel's slot
const SLOT = 2.55;   // the lintel's underside: the grate is cut off above it
function portcullis(p) {
  const g = new THREE.Group(), w = p.w ?? 1, bars = new THREE.Group(), clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  for (let i = 0; i < w; i++) {
    const x = -w / 2 + 0.5 + i, grate = piece('trial_portcullis_bars', { own: true }), lintel = piece('trial_portcullis_lintel');
    grate.position.x = lintel.position.x = x;
    bars.add(grate); g.add(lintel);
  }
  for (const s of [-1, 1]) {   // (the right-hand post turned round: its groove faces the grate)
    const post = piece('trial_portcullis_post'), end = piece('trial_portcullis_lintel');
    post.position.x = s * (w / 2 + 0.12); if (s > 0) post.rotation.y = Math.PI;
    end.position.x = s * (w / 2 + 0.14); end.scale.x = 0.3;
    g.add(post, end);
  }
  clipTo(bars, clip);
  g.add(bars);
  if (p.side < 2) g.rotation.y = Math.PI / 2;
  return { obj: at(g, p), bars, clip, open: 0, want: 0 };
}
// a lever on a stone block: its arm leans one way or the other (the reset lever: red knob)
function lever(p, color) {
  const g = new THREE.Group(), arm = new THREE.Group(), knob = piece('trial_lever_knob', { own: true });
  knob.material.color.set(p.type === 'reset' ? 0xd04030 : color);
  arm.add(piece('trial_lever_arm'), knob);
  arm.position.set(...pivotOf('trial_lever_arm'));
  g.add(piece('trial_lever'), arm);
  g.rotation.y = p.yaw ?? 0;
  return { obj: at(g, p), arm, angle: -0.6, want: -0.6 };
}
// a cage round a vault's chest; it sinks into the ground open
function cage(a) {
  const g = new THREE.Group(), bars = piece('trial_cage', { own: true }), clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  clipTo(bars, clip);
  g.add(bars);
  return { obj: at(g, a), bars, clip, open: 0, want: 0 };
}

// --- the grid puzzles' parts (mirror, braziers, crates, runes) -----------------------------------
const BEAM_Y = 0.75;   // how high over the field the beam runs
// a mirror on a turntable: a pane at 45 degrees, turned the other way by its bit
function mirrorPart(p) {
  const g = new THREE.Group(), turn = new THREE.Group();
  const glass = cutMaterial(new THREE.MeshStandardMaterial({ color: 0xe8f2fa, emissive: 0x5a7486, roughness: 0.2, metalness: 0.25 }));
  turn.add(piece('trial_mirror_frame'), piece('trial_mirror_pane', { mat: glass }));
  g.add(piece('trial_mirror'), turn);
  return { obj: at(g, p), turn, angle: 0 };
}
// the emitter (a crystal that shines its beam) and the receiver (a crystal that lights when hit)
function crystal(p, color, model) {
  const g = new THREE.Group(), gem = piece('trial_gem', { own: true });
  gem.material.color.set(color); gem.material.emissive.set(color); gem.material.emissiveIntensity = 0.8;
  const light = new THREE.PointLight(color, 1, 3, 2); light.position.y = BEAM_Y;
  g.add(piece(model), gem, light);
  return { obj: at(g, p), gem, light };
}
// A fire (a brazier, the cold's great fire, the beacon): its model and the light it gives; its
// flame is one of the room's flames (render/flames.js), where the model's own stood (the ruins'
// brazier's, taken out of it) or where its flame piece would (trials.glb, at its pivot). Out it
// has no flame and gives no light; game/trials.js lights it, the flame flares up and the light
// flickers with it.
let fires = null;
function fire(p, { model, flame = null, scale = 1, light = 2.2, reach = 4, high = 1.1 }) {
  const g = new THREE.Group(), body = piece(model);
  body.scale.setScalar(scale);
  const glowing = new THREE.PointLight(0xff9040, 0, reach, 2); glowing.position.y = high;
  g.add(body, glowing);
  const f = props.byName.get(flame ?? model)?.flames?.[0], off = flame ? pivotOf(flame) : [0, 0, 0], k = flame ? 1 : scale;
  const i = fires.specs.length, seed = (p.x * 1.7 + p.z * 2.3) % 6.28;
  fires.specs.push(f ? { x: p.x + off[0] + f.x * k, y: p.y + off[1] + f.y * k, z: p.z + off[2] + f.z * k, w: f.w * k, h: f.h * k, power: 0, seed }
    : { x: p.x, y: p.y, z: p.z, w: 0, h: 0, power: 0, seed });   // (not loaded yet: the cube is built again)
  fires.lights.push({ light: glowing, gain: light, i, seed });
  return { obj: at(g, p), flame: i, lit: false };
}
const brazierPart = p => fire(p, { model: TRIAL_PROPS.brazier, scale: 1.25 });
const greatFire = p => fire(p, { model: 'trial_great_fire', flame: 'trial_great_fire_flame', light: 3, reach: 8, high: 1.2 });
const beaconPart = p => fire(p, { model: 'trial_beacon', flame: 'trial_beacon_flame', light: 3.2, reach: 7, high: 2.1 });
const FIRES = new Set(['brazier', 'warm', 'fire', 'beacon']);

// a heavy crate: the mines' crate, a cell big
function cratePart(p) {
  const g = new THREE.Group(), box = piece(TRIAL_PROPS.crate);
  box.scale.setScalar(1.75);
  g.add(box);
  return { obj: at(g, p) };
}
// The glowing lines between linked braziers: a ring round each brazier's foot and a strip from
// ring to ring for every link. The brazier in reach lights up its ring, its strips and the rings
// of those it would light or put out with it (setGridParts).
const LINK_DIM = { color: 0xffa040, opacity: 0.35 }, LINK_HOT = { color: 0xffe0a0, opacity: 0.95 };
const floorMat = ({ color, opacity }) => Object.assign(glow(color, opacity), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
function linkLines(pz) {
  const group = new THREE.Group(), dim = floorMat(LINK_DIM), hot = floorMat(LINK_HOT);
  const at = new Map(pz.parts.filter(p => p.type === 'brazier').map(p => [p.i, p])), links = pz.field.links;
  let near = Infinity;   // the nearest two braziers: how big a ring fits
  links.forEach((list, i) => { for (const j of list) near = Math.min(near, Math.hypot(at.get(i).x - at.get(j).x, at.get(i).z - at.get(j).z)); });
  const r = Math.min(0.55, near * 0.35), w = 0.07, rings = new Map(), strips = [];
  for (const [i, p] of at) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 40), dim);
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, p.y + 0.03, p.z);
    group.add(ring); rings.set(i, ring);
  }
  links.forEach((list, i) => {
    for (const j of list) {
      if (j < i && links[j].includes(i)) continue;   // (one strip for a link both ways)
      const a = at.get(i), b = at.get(j), len = Math.hypot(b.x - a.x, b.z - a.z) - 2 * r;
      if (len <= 0) continue;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, w * 1.6).rotateX(-Math.PI / 2), dim);   // (flat, along x)
      strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      strip.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.03, (a.z + b.z) / 2);
      group.add(strip); strips.push({ i, j, mesh: strip });
    }
  });
  return { group, rings, strips, dim, hot, near: undefined };
}
// the brazier in reach (its part id, or null) lit up with its links
function setLinks(lk, pz, nearId) {
  const p = nearId && pz.parts.find(q => q.id === nearId && q.type === 'brazier'), i = p ? p.i : -1;
  if (lk.near === i) return;
  lk.near = i;
  const flips = new Set(i < 0 ? [] : [i, ...pz.field.links[i]]);
  for (const [k, ring] of lk.rings) ring.material = flips.has(k) ? lk.hot : lk.dim;
  for (const s of lk.strips) s.mesh.material = (s.i === i && flips.has(s.j)) || (s.j === i && flips.has(s.i)) ? lk.hot : lk.dim;
}

// tide lines: marks on the glass all round, every few levels up to where the water will stop
function tideLines(tl) {
  const pts = [], e = 0.03;
  for (let l = tl.from + 3; l <= tl.to; l += 3) {
    const y = l * LH;
    pts.push(e, y, e, N - e, y, e, N - e, y, e, N - e, y, N - e, N - e, y, N - e, e, y, N - e, e, y, N - e, e, y, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, depthWrite: false }));
}

// a seal across an open face (its portal's gate is gone, the face open): a red curtain with a
// cross, where the portal was
function barrier(p) {
  const g = new THREE.Group(), red = 0xff3547;
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), glow(red, 0.28));
  curtain.material.side = THREE.DoubleSide; curtain.position.y = 1.1;
  g.add(curtain);
  for (const yaw of [-0.6, 0.6]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.1), glow(red, 0.9));
    bar.material.side = THREE.DoubleSide; bar.rotation.z = yaw; bar.position.set(0, 1.1, 0.01); g.add(bar);
  }
  const out = 0.06, pos = [[N - out, p.z + 0.5], [out, p.z + 0.5], [p.x + 0.5, N - out], [p.x + 0.5, out]][p.dir];
  g.position.set(pos[0], p.y, pos[1]);
  if (p.dir < 2) g.rotation.y = Math.PI / 2;
  g.visible = false;
  return g;
}

// a crust cell of the crumbling floor (cubegen/trials/collapse.js): its column of rock, drawn
// on its own (render/floors.js leaves it out) round its centre, so it can shake and fall
function crustCell(m, f, theme) {
  const b = new GeoBuilder(), cs = f.cs, slab = m.trial?.kind === 'sinking',
    y0 = slab ? Math.min(...cs) - 0.35 : f.bottom * LH, cx = f.x + 0.5, cz = f.z + 0.5;
  const avg = (cs[0] + cs[1] + cs[2] + cs[3]) / 4, top = (slab ? new THREE.Color('#827d76') : gradient(theme.top, avg / LH)).multiplyScalar(0.92);
  const P = [[-0.5, cs[0], -0.5], [0.5, cs[1], -0.5], [-0.5, cs[2], 0.5], [0.5, cs[3], 0.5]];
  b.tri(P[0], P[1], P[3], top, [0, 1, 0]); b.tri(P[0], P[3], P[2], top, [0, 1, 0]);
  for (let d = 0; d < 4; d++) {
    const [a, c] = EDGE_CORNERS[d], [p0, p1] = edgePts(f.x, f.z, d), side = gradient(theme.side, avg / LH).multiplyScalar(d & 1 ? 0.8 : 0.9);
    const A = [p0[0] - cx, cs[a], p0[1] - cz], B = [p1[0] - cx, cs[c], p1[1] - cz];
    b.quad([A[0], y0, A[2]], [B[0], y0, B[2]], B, A, [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][d], side);
  }
  const mesh = new THREE.Mesh(b.build(), cutMaterial(solidMaterial('full')));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(cx, 0, cz);
  return mesh;
}

// a glyph carved and lit: a texture of the glyph in `color` on a dark stone face
const glyphTextures = new Map();
function glyphTexture(glyph, color = '#e8d8ff') {
  const k = glyph + color;
  if (glyphTextures.has(k)) return glyphTextures.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3640'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = color; g.font = `bold 44px ${BODY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 32, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  glyphTextures.set(k, tex);
  return tex;
}
// a runestone: a standing stone, its glyph on the panels front and back; lit once pressed in turn
function runestone(p) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: glyphTexture(p.glyph), emissive: 0x000000, emissiveMap: glyphTexture(p.glyph), roughness: 0.8 }));
  face.position.set(0, 0.72, 0.151);
  const back = face.clone(); back.material = face.material.clone(); back.rotation.y = Math.PI; back.position.z = -0.151;
  g.add(piece('trial_runestone'), face, back);
  return { obj: at(g, p), face: [face, back], lit: null };
}
// the carved tablet (a rune room's clue, in another room): a slab on a plinth with the glyphs in order
function tablet(c) {
  const g = new THREE.Group();
  g.add(piece('trial_tablet'));
  c.glyphs.forEach((gl, i) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshBasicMaterial({ map: glyphTexture(gl, '#f0d890') }));
    q.position.set((i - (c.glyphs.length - 1) / 2) * 0.16, 0.68, 0.061); g.add(q);
  });
  return at(g, c);
}
// over: the cube's own fluids' (render/world.js): not drawn under the standing fluid
export function buildTrialView(m, group, over = null) {
  const t = m.trial;
  shared = new Map(); fires = { specs: [], lights: [] };
  for (const c of m.clues || []) group.add(tablet(c));
  if (!t) return m.tide ? tideView(m, group, over) : null;
  const color = new THREE.Color(TRIALS[t.kind].color);
  const view = { kind: t.kind, parts: new Map(), water: null, tide: null, level: null, phase: null, barriers: new Map(), crust: null,
    plates: new Map(), gates: new Map(), levers: new Map(), cage: null, grid: new Map(), beams: new Map(), links: new Map() };
  // the crumbling crust
  if (t.crust) {
    const theme = themeOf(m);
    view.crust = new Map(t.crust.map(q => {
      const f = m.floors[q.f], mesh = crustCell(m, f, theme);
      group.add(mesh);
      return [q.c, { mesh, f, state: 'whole', t: 0, base: mesh.material.color.clone() }];
    }));
  }
  for (const p of m.portals) if (p.kind === 'side') { const b = barrier(p); group.add(b); view.barriers.set(p.dir, b); }
  for (const p of t.parts || []) {
    if (p.type === 'button') { const b = button(p, color); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'rod') { const b = button(p, color, 'trial_rod', [0, 0.68, 0.2]); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'valve') { const b = button(p, color, 'trial_valve', [0, 0.89, 0]); group.add(b.obj); view.parts.set(p.id, b); }
    if (p.type === 'beacon') {   // its ring marked on the ground
      const ring = new THREE.Mesh(new THREE.RingGeometry(t.ring.r - 0.06, t.ring.r + 0.06, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(t.ring.x, t.ring.y + 0.04, t.ring.z); group.add(ring);
    }
    if (p.type === 'portcullis') { const b = portcullis({ ...p, side: p.side }); b.puzzle = -1; b.chase = true; group.add(b.obj); view.gates.set(p.id, b); }
    if (p.type === 'plate') { const b = plate(p, color); b.puzzle = p.puzzle ?? 0; b.cell = p.cell; group.add(b.obj); view.plates.set(p.id, b); }
    if (p.type === 'gate') { const b = portcullis(p); b.puzzle = p.puzzle ?? 0; group.add(b.obj); view.gates.set(p.id, b); }
    if (p.type === 'lever' || p.type === 'reset') { const b = lever(p, color); group.add(b.obj); view.levers.set(p.id, b); }
    const grid = p.type === 'mirror' ? mirrorPart(p) : p.type === 'emitter' ? crystal(p, 0xffe060, 'trial_emitter') : p.type === 'receiver' ? crystal(p, 0x6080a0, 'trial_receiver')
      : p.type === 'lens' ? crystal(p, 0x7a5aa0, 'trial_receiver') : p.type === 'relic' ? crystal(p, 0xffc040, 'trial_emitter')
      : p.type === 'brazier' || p.type === 'warm' ? brazierPart(p) : p.type === 'fire' ? greatFire(p) : p.type === 'beacon' ? beaconPart(p)
        : p.type === 'crate' ? cratePart(p) : p.type === 'runestone' ? runestone(p) : null;
    if (grid) { grid.part = p; group.add(grid.obj); view.grid.set(p.id, grid); }
  }
  for (const pz of t.puzzles || []) {
    if (pz.kind === 'braziers') { const lk = linkLines(pz); group.add(lk.group); view.links.set(pz.index, lk); }
    if (pz.kind === 'mirror') { const beam = new THREE.Group(); group.add(beam); view.beams.set(pz.index, { group: beam, key: '', segs: [], t0: 0, reach: 0, sparked: 0 }); }
  }
  // the siege's mouths: dark arches the waves come out of
  for (const mo of t.mouths || []) { const g = at(piece('trial_mouth'), mo); g.rotation.y = mo.yaw; group.add(g); }
  if (fires.specs.length) { view.fires = flameSet(fires.specs, fires.lights); group.add(view.fires.mesh); }
  // the relic's warden's lair: a dark arch in the wall it breaks out of
  if (t.lair) { const g = at(piece('trial_mouth'), t.lair); g.rotation.y = t.lair.yaw; group.add(g); }
  // a vault (a puzzle in a branch room): a cage round its reward site's chest
  const site = t.role === 'branch' && (m.rewardSites || [])[0];
  if (site) { view.cage = cage(site.anchor); group.add(view.cage.obj); }
  if (t.kind === 'miasma') {
    const fog = new THREE.Group(), haze = new THREE.Mesh(new THREE.BoxGeometry(N - 0.04, 1, N - 0.04),
      new THREE.MeshBasicMaterial({ color: 0x9adf50, transparent: true, opacity: 0.22, depthWrite: false }));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(N - 0.04, N - 0.04), new THREE.MeshBasicMaterial({ color: 0xb8f070, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    sheet.rotation.x = -Math.PI / 2;
    // after the bodies (render/character.js, partner.js: 1000), so it veils what of them is in it
    // (it writes no depth: what of them is over it stays clear)
    haze.renderOrder = 1001; sheet.renderOrder = 1001;
    fog.add(haze, sheet); fog.position.set(N / 2, 0, N / 2); fog.visible = false;
    haze.position.x = sheet.position.x = 0;
    group.add(fog);
    view.fog = fog; view.fogTop = (t.timeline.top + 8) * LH;
  }
  if (t.kind === 'flood' || t.kind === 'sunken' || t.kind === 'sinking') {
    standingWater(m, t.fluid, view, group, [0, 0, N, N], over);
    if (t.timeline) { view.tide = tideLines(t.timeline); group.add(view.tide); }
  }
  return view;
}
// a boss's tide (game/tide.js, map.tide): only the water, in its box, drawn as what it looks like
// (`look`: Slomo's flood is slime, waded through as water)
function tideView(m, group, over) {
  const view = { kind: 'tide', parts: new Map(), water: null, tide: null, level: null, phase: null, barriers: new Map(), crust: null,
    plates: new Map(), gates: new Map(), levers: new Map(), cage: null, grid: new Map(), beams: new Map(), links: new Map() };
  standingWater(m, m.tide.look ?? m.tide.fluid, view, group, m.tide.box, over);
  return view;
}
// How far a flood has come (game/tide.js: Slomo's, from one side of its box): the standing fluid is
// drawn only inside `box` ([x0, z0, x1, z1], cells; null: all of it), and only there what lies
// under it wavers, the light through it plays and the ground is wet (render/underwater.js, wet.js:
// the cube's standing box)
const FLOOD_BOX = { value: new THREE.Vector4(-1e4, -1e4, 1e4, 1e4) };
export function setFloodFront(world, box) {
  if (box) FLOOD_BOX.value.set(box[0], box[1], box[2], box[3]);
  else FLOOD_BOX.value.set(-1e4, -1e4, 1e4, 1e4);
  const v = world?.trialView;
  if (v?.over && v.box) v.over.box.value.set(...(box ?? v.box));
}
// A fluid standing over the cells of `box` ([x0, z0, x1, z1]: a trial's whole cube, a tide's
// basin) at one level, rising and falling (setTrialWater): its surface and the wet bands it
// leaves on the walls. over: the cube's own fluids' (render/world.js), hidden under it in its box.
function standingWater(m, fluid, view, group, box, over) {
  // nothing where the cube's own fluid takes its level (WATER_OWN: that one is drawn); dropped
  // above the cut inside the cutaway (its cap there: section.js setTrialWaterCap), not where cave
  // walls come down (it stays to the cube's edge)
  // (and outside the part a flood's front has reached: FLOOD_BOX, setFloodFront)
  const surface = inject(fluidMaterial(fluid, 'full'), fs => 'uniform sampler2D uWaterOwn;\nuniform vec4 uFloodBox;\n' + fs.replace('#include <clipping_planes_fragment>', `
    if (texelFetch(uWaterOwn, clamp(ivec2(floor(vCutW.xz)), ivec2(0), ivec2(${N - 1})), 0).r > 0.5) discard;
    if (vCutW.x < uFloodBox.x || vCutW.z < uFloodBox.y || vCutW.x > uFloodBox.z || vCutW.z > uFloodBox.w) discard;
    if (cutRegion(true) > 0.5) discard;
    #include <clipping_planes_fragment>`), 'cut-trial-fluid');
  const compile = surface.onBeforeCompile;
  surface.onBeforeCompile = (sh, r) => { compile.call(surface, sh, r); sh.uniforms.uWaterOwn = WATER_OWN; sh.uniforms.uFloodBox = FLOOD_BOX; };
  if (over) { over.box.value.set(...box); over.standKind.value.set(fluid, m.fluidRows?.[fluid] ?? palRow(m.depth ?? 0, fluid, 0)); view.over = over; }
  view.box = box;
  // Its shores are the ground's (materials.js cellMaterial: the walls round each cell, section.js
  // WATER_SHORE, and the ground under it, its `shore`), and the room's walls stay wet where it has
  // just been (wetBands, with the same material: its level and wet line in `waterTide`,
  // tickTrialView). (its colours: the cube's of its fluid, its depth's running one:
  // cubegen/fluidbodies.js)
  const pal = m.fluidRows?.[fluid] ?? palRow(m.depth ?? 0, fluid, 0);
  const geo = standingSurface(m, box);
  geo.setAttribute('pal', palAttribute(geo, pal));
  const tide = FLUID_LOOK[fluid].cells ? { level: { value: 0 }, wet: { value: 0 }, shore: WATER_SHORE } : null;
  const water = new THREE.Mesh(geo, cellMaterial(surface, fluid, tide, over));
  water.frustumCulled = false;   // (its heights are the shader's)
  water.material.side = THREE.DoubleSide;   // (it writes depth, like every fluid: materials.js fluidMaterial)
  water.userData.fluid = fluid; water.userData.pal = pal; water.visible = false; water.renderOrder = 5;
  group.add(water);
  view.water = water;
  if (tide) {
    view.waterTide = tide;
    view.wetBands = new THREE.Mesh(wetBands(m, pal), water.material);
    view.wetBands.visible = false; view.wetBands.renderOrder = 5;
    group.add(view.wetBands);
  }
}

// the storm's wind (phase: 'calm' | 'warning' | 'gust' | 'lull'; eye: the hill's middle, cells):
// streaks tearing outwards off the hill and round it, a few in the warning, many in the gust
export function setStorm(world, phase, eye, dt) {
  const v = world?.trialView;
  if (!v || !eye || (phase !== 'warning' && phase !== 'gust')) return;
  const n = (phase === 'gust' ? 70 : 14) * dt;
  for (let k = n; k > 0; k--) {
    if (k < 1 && Math.random() > k) break;
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3, ux = Math.cos(a), uz = Math.sin(a), speed = phase === 'gust' ? 9 : 5;
    emit(soft, eye.x + ux * r, 2 + Math.random() * 8, eye.z + uz * r, { v: [(ux - uz * 0.4) * speed, 0, (uz + ux * 0.4) * speed], spread: 0.3,
      life: 1.2, size: 0.12, grow: 4, color: '#e8ecff', alpha: phase === 'gust' ? 0.5 : 0.3, gravity: 0, drag: 0 });
  }
}

// the sinking fog's underside at y (world units; null: none): a sickly haze from there up, its
// underside a denser sheet
export function setTrialFog(world, y) {
  const v = world?.trialView;
  if (!v?.fog) return;
  v.fog.visible = y != null;
  if (y == null) return;
  const top = v.fogTop, h = Math.max(0.05, top - y);
  v.fog.children[0].scale.y = h; v.fog.children[0].position.y = y + h / 2;
  v.fog.children[1].position.y = y;
}

// every vertex of a geometry in palette row `row` (materials.js cellMaterial's `pal`)
function palAttribute(geo, row) {
  const n = geo.getAttribute('position').count, a = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = row; a[i * 4 + 1] = row; }
  return new THREE.BufferAttribute(a, 4);
}
// A standing fluid's wet bands (materials.js cellMaterial, trial), as the cube's own fluids have
// them (render/floors.js wetWall, wetSlope): a strip a little in front of every bit of wall a
// column shows to its neighbour, all the way up, and a skin over every sloping floor (the shader
// draws them only between the fluid's surface and its wet line).
function wetBands(m, pal) {
  const b = new GeoBuilder({ uvs: true });
  b.uvNow = [-1, 0];
  for (const f of m.floors) {
    if (f.fluid || f.crust) continue;
    for (let d = 0; d < 4; d++) if (inb(f.x + DIRS[d][0], f.z + DIRS[d][1])) wetWall(b, wallPieces(m, f, d), -BASE, 1e4);
    wetSlope(b, f);
  }
  const a = b.arrays(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  geo.setAttribute('shore', new THREE.BufferAttribute(a.shore, 4));
  geo.setAttribute('pal', palAttribute(geo, pal));
  return geo;
}

// The surface of a standing fluid over the cells of box [x0, z0, x1, z1], built like the cube's
// own fluids' (render/floors.js fluidVolume) but at every height it may stand at: over each floor
// or structure of a column (and over nothing where there is none), SUB x SUB quads a cell, split along the
// floor's own diagonal, each corner with the ground under it, its slope and the floor's ceiling
// (the bottom of the next floor up; render/shore.js) in its `shore`. The shader puts the surface
// at the fluid's level (materials.js cellMaterial, trial) and draws only where it stands over
// that ground and under that ceiling. Round the box, its sides (uv -2), from the ground up to
// the surface (their upper corners: shore w 2, the shader raises them).
const SUB = 4;
function standingSurface(m, [x0, z0, x1, z1]) {
  const b = new GeoBuilder({ uvs: true }), white = new THREE.Color(1, 1, 1);
  b.shoreAt = v => v[3];
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const col = waterSolids(m, z * N + x);
    // the grounds the fluid may stand over here: every floor (or stair, landing, bridge deck:
    // render/shore.js waterSolids) up to the next one's underside, and the depths under the
    // lowest (when it does not stand on the cube's base)
    const grounds = col.map((f, i) => ({ f, ceiling: col[i + 1] ? col[i + 1].bottom * LH : 0 }));
    if (!col.length || col[0].bottom > 0) grounds.unshift({ f: null, ceiling: col.length ? col[0].bottom * LH : 0 });
    for (const { f, ceiling } of grounds) {
      const ground = (px, pz) => f ? groundAt(f, px, pz) : -BASE, slope = (px, pz) => f ? slopeAt(m, f, px, pz) : 0;
      const at = (px, pz) => [px, 0, pz, [ground(px, pz), slope(px, pz), ceiling, 0]];
      b.uvNow = [0, 0];
      for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB; j++) {
        const xa = x + i / SUB, xb = x + (i + 1) / SUB, za = z + j / SUB, zb = z + (j + 1) / SUB;
        if (f?.split) b.quad(at(xa, zb), at(xb, zb), at(xb, za), at(xa, za), [0, 1, 0], white);
        else b.quad(at(xa, za), at(xa, zb), at(xb, zb), at(xb, za), [0, 1, 0], white);
      }
      // its sides round the box (just inside it)
      b.uvNow = [-2, 0];
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        if (nx >= x0 && nz >= z0 && nx < x1 && nz < z1) continue;
        const [[ax, az], [bx, bz]] = edgePts(x, z, d), ix = -DIRS[d][0] * 0.01, iz = -DIRS[d][1] * 0.01;
        for (let k = 0; k < SUB; k++) {
          const pa = [ax + (bx - ax) * k / SUB + ix, az + (bz - az) * k / SUB + iz], pb = [ax + (bx - ax) * (k + 1) / SUB + ix, az + (bz - az) * (k + 1) / SUB + iz];
          const lo = ([px, pz]) => [px, ground(px, pz), pz, [ground(px, pz), 0, ceiling, 1]];
          const hi = ([px, pz]) => [px, ground(px, pz) + 1, pz, [ground(px, pz), 0, ceiling, 2]];
          b.quad(lo(pa), lo(pb), hi(pb), hi(pa), [DIRS[d][0], 0, DIRS[d][1]], white);
        }
      }
    }
  }
  const a = b.arrays(), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  geo.setAttribute('shore', new THREE.BufferAttribute(a.shore, 4));
  return geo;
}

// the fluid's surface at y (world units; null: none), the trial's phase (the tide lines show while idle)
export function setTrialWater(world, y, phase) {
  const v = world?.trialView;
  setTrialWaterCap(null);
  if (!v) return;
  v.level = y; v.phase = phase;
  if (v.tide) v.tide.visible = phase === 'idle' || phase === 'armed';
  if (!v.water) return;
  v.water.visible = y != null && restY(y) > -BASE + 0.01;
  if (v.wetBands) v.wetBands.visible = v.water.visible;
  if (v.over) { v.over.level.value = v.water.visible ? y : -1e9; v.over.stand.value.w = v.water.visible ? 1 : 0; }
  // the fires under it go out (the props' and the trial's own; render/flames.js)
  douseFlames(world.group, v.water.visible ? y : null, v.water.userData.fluid);
  if (!v.water.visible) { v.wetAt = null; return; }
  setTrialWaterCap(y, v.water.userData.fluid, v.water.userData.pal);
  // (drawn where every fluid's surface is: render/surface.js)
  if (v.waterTide) v.waterTide.level.value = restY(y);
}

// the crust as the trial says (states: cell -> 'whole' | 'shaking' | 'gone'): a cell shakes, cracks
// and drops dust, then falls away into the basin; resolved, the fallen ones rise back whole
export function setCrust(world, states, dt, resolved = false) {
  const v = world?.trialView;
  if (!v?.crust) return;
  for (const [c, cell] of v.crust) {
    const want = resolved ? 'whole' : states.get(c) ?? 'whole', m = cell.mesh;
    if (want === 'gone' && cell.state !== 'falling' && cell.state !== 'gone') { cell.state = 'falling'; cell.t = 0; dust(m, 10); }
    else if (want === 'whole' && (cell.state === 'falling' || cell.state === 'gone')) { cell.state = 'rising'; cell.t = 0; }
    else if (want === 'shaking' && cell.state === 'whole') { cell.state = 'shaking'; cell.t = 0; }
    else if (want === 'whole' && cell.state === 'shaking') cell.state = 'whole';
    cell.t += dt;
    const p = m.position;
    if (cell.state === 'shaking') {
      const k = Math.min(1, cell.t / 1.5);
      p.x = cell.f.x + 0.5 + Math.sin(cell.t * 60) * 0.035 * k; p.z = cell.f.z + 0.5 + Math.cos(cell.t * 53) * 0.035 * k; p.y = 0;
      m.material.color.copy(cell.base).multiplyScalar(1 - 0.35 * k);
      if (Math.random() < dt * 6) dust(m, 1);
    } else if (cell.state === 'falling') {
      p.y = -6 * cell.t * cell.t;
      if (v.kind !== 'sinking') { m.rotation.x = cell.t * 0.6; m.rotation.z = cell.t * 0.4; }
      if (cell.t > 1.4) { cell.state = 'gone'; m.visible = false; }
    } else if (cell.state === 'rising') {
      m.visible = true; m.rotation.set(0, 0, 0);
      const k = Math.min(1, cell.t / 1.2);
      p.set(cell.f.x + 0.5, -4 * (1 - k) * (1 - k), cell.f.z + 0.5);
      m.material.color.copy(cell.base);
      if (k >= 1) cell.state = 'whole';
    } else if (cell.state === 'whole') { p.set(cell.f.x + 0.5, 0, cell.f.z + 0.5); m.material.color.copy(cell.base); }
  }
}
function dust(mesh, n) {
  const at = new THREE.Vector3();
  mesh.getWorldPosition(at);
  const top = Math.max(...mesh.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));
  for (let i = 0; i < n; i++) emit(soft, at.x + rand(-0.5, 0.5), at.y + top, at.z + rand(-0.5, 0.5),
    { v: [0, 0.4, 0], spread: 0.6, life: 1.1, size: 0.22, grow: 1.5, color: '#b8a888', alpha: 0.55, gravity: -0.2, drag: 1 });
}

// The grid puzzles as their bits say (game/trials.js): mirrors turned, braziers lit, crates pushed,
// the beam along its way (shown: puzzle index -> { beam: { cells, lit, hits, turns } } | { held }).
// A mirror swings round on its turntable with a little overshoot; a changed beam grows anew from
// the emitter at BEAM_SPEED cells/s, sparking where it turns, and a lens or the receiver lights
// only once it gets there.
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, depthWrite: false });
const beamCore = new THREE.CylinderGeometry(1, 1, 1, 6);
const BEAM_SPEED = 24;
export function setGridParts(world, m, s, shown, nearId = null) {
  const v = world?.trialView;
  if (!v || !s) return;
  const now = performance.now() / 1000;
  for (const [i, lk] of v.links) if (m.puzzles?.[i]) setLinks(lk, m.puzzles[i], nearId);
  // the beams first: how far each has grown (what it lights depends on it)
  const reached = new Map();   // puzzle index -> { lit, lenses: Set (lit) }
  for (const [i, b] of v.beams) {
    const beam = shown.get(i)?.beam, pz = m.puzzles[i];
    if (!beam || !pz) continue;
    const key = beam.cells.map(c => c.join(',')).join(' ') + beam.lit;
    const D = pz.deck, y = D.level * 0.5 + BEAM_Y, cell = ([x, z]) => [D.x0 + x + 0.5, D.z0 + z + 0.5];
    if (key !== b.key) {   // a new way: lay it out, to grow from the emitter
      b.key = key;
      for (const c of [...b.group.children]) b.group.remove(c);
      const em = pz.parts.find(p => p.type === 'emitter');
      const pts = [[em.x, em.z], ...beam.cells.map(cell)];
      if (!beam.stopped) pts.push(cell(beam.end));
      // the turns' points along the way (its length to each), the lenses' too
      const turnAt = new Set(beam.turns.map(c => c.join(','))), lensAt = new Map((pz.field.lenses || []).map((c, k) => [c.join(','), k]));
      b.segs = []; b.marks = []; b.lensAt = [];
      let along = 0;
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1], [bx, bz] = pts[k], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const mesh = new THREE.Mesh(beamCore, beamMat);
        mesh.rotation.z = Math.PI / 2; mesh.rotation.y = -Math.atan2(bz - az, bx - ax); mesh.visible = false;
        b.group.add(mesh); b.segs.push({ mesh, ax, az, ux: (bx - ax) / len, uz: (bz - az) / len, from: along, len });
        along += len;
        const c = beam.cells[k - 1];
        if (c && turnAt.has(c.join(','))) b.marks.push({ at: along, x: bx, z: bz });
        if (c && lensAt.has(c.join(','))) b.lensAt.push({ at: along, k: lensAt.get(c.join(',')) });
      }
      b.total = along; b.t0 = now; b.sparked = 0;
    }
    const grown = (now - b.t0) * BEAM_SPEED, done = grown >= b.total;
    for (const sg of b.segs) {
      const seen = Math.max(0, Math.min(sg.len, grown - sg.from)), wide = 0.035 + 0.012 * Math.sin(now * 9 + sg.from);
      sg.mesh.visible = seen > 0.01;
      if (!sg.mesh.visible) continue;
      sg.mesh.scale.set(wide, seen, wide);
      sg.mesh.position.set(sg.ax + sg.ux * seen / 2, y, sg.az + sg.uz * seen / 2);
    }
    while (b.sparked < b.marks.length && b.marks[b.sparked].at <= grown) {   // a spark where it turns
      const mk = b.marks[b.sparked++];
      for (let n = 0; n < 6; n++) emit(glowLayer, mk.x, y, mk.z, { v: [rand(-1, 1), rand(0, 1.2), rand(-1, 1)], life: 0.35, size: 0.08, color: '#fff2b0', alpha: 0.9, gravity: 2 });
    }
    reached.set(i, { lit: done && beam.lit, lenses: new Set(b.lensAt.filter(l => l.at <= grown).map(l => l.k)) });
  }
  for (const [id, g] of v.grid) {
    const p = g.part, bit = s.bits?.[id] ?? 0;
    if (p.type === 'mirror') {   // swung round on its turntable, overshooting a little
      g.av = (g.av ?? 0) * 0.72 + (((bit ? -1 : 1) * Math.PI / 4) - g.angle) * 0.09;
      g.angle += g.av; g.turn.rotation.y = g.angle;
    }
    else if (FIRES.has(p.type)) {   // (the cold's: lit for good once resolved; the beacon once lit; its flame and light: render/flames.js)
      const lit = p.type === 'brazier' ? !!bit : p.type === 'beacon' ? s.phase !== 'idle' : s.phase === 'resolved' || (p.type === 'warm' && !!bit);
      if (g.lit !== lit) { g.lit = lit; v.fires?.power(g.flame, lit ? 1 : 0); }
    }
    else if (p.type === 'receiver' || p.type === 'lens') {   // lit once the beam gets there (the receiver: through every lens)
      const r = reached.get(p.puzzle ?? 0), lit = s.phase === 'resolved' || (p.type === 'receiver' ? !!r?.lit : !!r?.lenses.has(p.i));
      g.glow = (g.glow ?? 0) + ((lit ? 1 : 0) - (g.glow ?? 0)) * 0.12;
      g.gem.material.emissiveIntensity = 0.4 + g.glow * (2.1 + Math.sin(now * 6) * 0.3); g.light.intensity = 0.3 + g.glow * 2.7;
    }
    else if (p.type === 'relic') {   // on its altar, glowing, until it is taken
      const here = s.phase === 'idle';
      g.gem.visible = here; g.light.intensity = here ? 1.6 + Math.sin(now * 3) * 0.5 : 0;
      if (here) g.gem.rotation.y = now * 0.8;
    }
    else if (p.type === 'runestone') {   // lit: pressed in turn so far (the order's first n)
      const pz = m.puzzles[p.puzzle ?? 0], n = s.bits?.[`${pz.id}:n`] ?? 0, lit = s.phase === 'resolved' || pz.field.order.slice(0, n).includes(p.i);
      if (g.lit !== lit) { g.lit = lit; for (const f of g.face) f.material.emissive.set(lit ? 0xc0a0ff : 0x000000); }
    } else if (p.type === 'crate') {   // where its bit says (a field cell), slid there
      const pz = m.puzzles[p.puzzle ?? 0], F = pz.field, D = pz.deck;
      const x = D.x0 + bit % F.w + 0.5, z = D.z0 + Math.floor(bit / F.w) + 0.5, o = g.obj.position;
      o.x += (x - o.x) * 0.25; o.z += (z - o.z) * 0.25;
    }
  }
  // a crate puzzle's plates glow while held
  for (const [id, pl] of v.plates) {
    const held = shown.get(pl.puzzle)?.held;
    if (held && !(s.phase === 'resolved' || (s.stage ?? 0) > pl.puzzle)) pl.rune.material.color.set(held.has(pl.cell) ? 0xffe070 : pl.color);
  }
}

// the seals across open faces (open: which faces are open, by dir): shown on the sealed ones
export function setTrialBarriers(world, dirs, open) {
  const v = world?.trialView;
  if (!v) return;
  for (const [dir, b] of v.barriers) b.visible = dirs.includes(dir) && !!open[dir];
}

// the parts as the trial's state says (a pressed button sinks and goes green; a solved puzzle's
// plate glows, its gates rise, its cage sinks)
export function setTrialParts(world, s, immediate = false) {
  const v = world?.trialView;
  if (!v || !s) return;
  const solved = s.phase === 'resolved', done = i => solved || (s.stage ?? 0) > i;   // (game/trials.js puzzleSolved)
  for (const [, pl] of v.plates) pl.rune.material.color.set(done(pl.puzzle) ? 0x6cff8a : pl.color);
  for (const [, g] of v.gates) {
    // (the relic's portcullis: up until the lever drops it, then shut for good)
    g.want = g.chase ? (solved ? 0 : 1) : done(g.puzzle) ? 1 : 0;
    if (immediate) g.open = g.want;
  }
  for (const [id, l] of v.levers) { l.want = s.bits?.[id] ? 0.6 : -0.6; if (immediate) l.angle = l.want; }
  if (v.cage) { v.cage.want = solved ? 1 : 0; if (immediate) v.cage.open = v.cage.want; }
  for (const [, b] of v.parts) {
    const done = s.phase === 'resolved';
    if (b.done === done) continue;
    b.done = done;
    b.knob.position.y = done ? b.rest - 0.06 : b.rest;
    const c = new THREE.Color(done ? 0x6cff8a : TRIALS[v.kind].color);
    b.knob.material.color.copy(c); b.knob.material.emissive.copy(c); b.halo.material.color.copy(c); b.light.color.copy(c);
  }
}

const slot = new THREE.Vector3();
export function tickTrialView(world, time) {
  const v = world?.trialView;
  if (!v) return;
  // a gate's grate rises into its lintel (cut off at its slot); a cage sinks into the ground
  for (const [, g] of v.gates) {
    g.open += (g.want - g.open) * 0.06; g.bars.position.y = g.open * 2.1;
    g.clip.constant = g.obj.localToWorld(slot.set(0, SLOT, 0)).y;
  }
  for (const [, l] of v.levers) { l.angle += (l.want - l.angle) * 0.25; l.arm.rotation.z = l.angle; }
  for (const [, g] of v.grid) {
    if (g.part.type === 'emitter') g.gem.rotation.y = time;
  }
  if (v.cage) {
    v.cage.open += (v.cage.want - v.cage.open) * 0.05; v.cage.bars.position.y = -v.cage.open * 1.35; v.cage.obj.visible = v.cage.open < 0.98;
    v.cage.clip.constant = -v.cage.obj.localToWorld(slot.set(0, 0, 0)).y;
  }
  for (const [, pl] of v.plates) pl.rune.material.opacity = 0.45 + Math.sin(time * 2.6) * 0.2;
  for (const [, b] of v.parts) {
    const pulse = b.done ? 0.2 : 0.5 + Math.sin(time * 3.2) * 0.25;
    b.halo.material.opacity = pulse; b.light.intensity = b.done ? 1 : 2 + Math.sin(time * 3.2) * 0.8;
  }
  if (v.tide?.visible) v.tide.material.opacity = 0.3 + Math.sin(time * 2) * 0.15;
  if (v.water?.visible) {
    const t = v.water.userData.fluid, motion = FLUID_LOOK[t].motion;
    if (v.waterTide) {
      // the wet line: the highest the fluid stood (with the tide), drying off as it sinks, and
      // never too far over it (a drained stage leaves a band that follows it down)
      const S = FLUID_LOOK[t].cells, rest = restY(v.level), dt = Math.max(0, time - (v.wetTime ?? time));
      v.wetAt = stepWet(S, v.wetAt, rest + tideY(S, time), dt);
      v.wetTime = time;
      v.waterTide.wet.value = v.wetAt - rest;
      if (v.over) v.over.stand.value.set(rest, tideY(S, time), v.wetAt - rest, 1);   // (its structures: render/wet.js)
    }
    if (motion.pulse) v.water.material.emissiveIntensity = FLUID_LOOK[t].emissiveIntensity * (1 + Math.sin(time * 2) * 0.1);
  }
}
