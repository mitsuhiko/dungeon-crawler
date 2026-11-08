// Megalimmer (core/enemies.js MEGALIMMER, `cloth`): a Flimmer, but a ghost twice the hero's
// height, and no person under him: a hidden ball (his head) with a sheet thrown over it, and two
// small hidden balls (his hands) under it that push it out. The sheet is cloth (core/cloth.js),
// hung over the ball every frame, drawn as a mesh made anew from its points; pale like a Flimmer,
// with two dark, angry, slanted eyes on its front over the ball (from a child's drawing of an
// angry ghost), which glow brighter while he is the one who goes for you (`main`, game/rollie.js).
// He is drawn blurry like a Flimmer (render/flimmerview.js BLUR: the sheet see-through, copies of
// it each its own little way off and a shade off in colour, a puffed-up shell fading out to its
// outline and a haze over all of it):
//   - Shimmering (shimmerOf) the copies wander round him and trail behind as he glides; he leaves
//     smudges where he runs. He comes into focus to beat you or cast, and blurs again after.
//   - His hands: low at his sides at rest, trailing a little as he goes; beating you (`pummel`)
//     they come up in front (the warning) and punch out in turn, the right one first, at the
//     attack's hit times, pushing the sheet out a cell in front of him; casting `vanish` they wave
//     out to his sides; calling Flimmers out (`stunner`, `flimmers`) both go up and the sheet
//     billows. Running round you (`circling`) the sheet streams out behind him.
//   - `hidden` (0 .. 1, game/rollie.js): how far he has turned invisible; all the way, only a
//     faint shimmer of him is left in the air: no eyes, no silhouette through walls, no shadow.
//   - A blow that went through him (`flinch`) throws the copies apart and him aside for a moment.
//   - Killed, the ball goes: the sheet falls onto the floor, lies there a moment and dissolves into
//     specks like a Flimmer.
// He is a boss (core/bossbar.js): no bar over his head (render/flimmerview.js tags: the same).
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { attackOf, shimmerOf, enemyName, makeEnemy, ENEMY_KINDS } from '../core/enemies.js';
import { toLinear, toHex } from '../core/oklch.js';
import { guardianColor, guardianTitle } from '../core/guardians.js';
import { bossBarred } from '../core/bossbar.js';
import { newCloth, stepCloth } from '../core/cloth.js';
import { BLUR, FLINCH, blurry, hazeTexture } from './flimmerview.js';
import { makeBar, makeLevelLabel, makeAlertMark } from './bars.js';
import { glow, soft, emit, rand } from './particles.js';
import { trackLight, untrackLight } from './lightpool.js';
import { player } from '../game/state.js';
import { uiScale } from '../game/uiscale.js';

const SILHOUETTE = 0xff6a5a, SILHOUETTE_OPACITY = 0.4;
// His body, in cells over the floor under him (x: out to his left, z: forward; his right hand is
// the one at -x): the head's middle, its radius, how far it bobs (and how fast, 1/s); his hands'
// radius and where they are: at rest, up in front (the warning before a beating), out in a punch,
// out to his sides waving (vanish), up over his head (calling Flimmers).
export const GHOST = {
  head: 1.55, headR: 0.5, bob: 0.06, bobRate: 1.8, hand: 0.2,
  rest: [0.42, 0.95, 0.06], guard: [0.3, 1.28, 0.5], punch: [0.12, 1.32, 1.05],
  wave: [0.8, 1.35, 0.28], raised: [0.6, 1.8, 0.25],
  // the blur at his size: BLUR's distances (for a Flimmer of 0.72) times this (less than his size:
  // he should still read as a ghost); hidden all the way, how strongly his shell still shimmers
  blur: 1.3, shimmer: 0.3,
  haze: { w: 1.9, h: 2.7, y: 1.2 },
  // dying: the ball shrinks away in `pop` s and lets go of the sheet; it lies until `lie` of the
  // death's time, then fades and dissolves
  pop: 0.22, lie: 0.5,
  // the light under the sheet: intensity, reach (cells), height
  light: [1.3, 4.5, 1.0],
  // the eyes: where they are on the flat sheet (cells: across, and forward of its middle; over the
  // ball's front, a little above its middle), how big the patch they are drawn on is
  eyes: { b: 0.56, w: 0.84, h: 0.46 },
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// the eyes, painted once: their shape (white where they are: the alpha) and their glowing pupils.
// Angry: the top of each slants down towards the other, like brows drawn together.
let eyeMaps = null;
function eyeTextures() {
  if (eyeMaps) return eyeMaps;
  const W = 256, H = 138, shape = document.createElement('canvas'), pupil = document.createElement('canvas');
  shape.width = pupil.width = W; shape.height = pupil.height = H;
  const eye = (ctx, m) => {
    // m: 1 the eye on the left of the picture, -1 the right; its inner corner towards the middle
    const x = u => W / 2 + m * u;
    ctx.beginPath();
    ctx.moveTo(x(-118), 16);                         // outer top corner
    ctx.lineTo(x(-14), 70);                          // inner top corner, much lower: the slant
    ctx.bezierCurveTo(x(-8), 110, x(-40), 134, x(-72), 130);
    ctx.bezierCurveTo(x(-108), 126, x(-126), 80, x(-118), 16);
    ctx.closePath();
  };
  const a = shape.getContext('2d');
  a.fillStyle = '#000'; a.fillRect(0, 0, W, H);
  a.fillStyle = '#fff';
  for (const m of [1, -1]) { eye(a, m); a.fill(); }
  const b = pupil.getContext('2d');
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  for (const m of [1, -1]) {
    const cx = W / 2 + m * -46, cy = 102, gr = b.createRadialGradient(cx, cy, 0, cx, cy, 20);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#bbb'); gr.addColorStop(1, '#000');
    b.fillStyle = gr; b.fillRect(cx - 22, cy - 22, 44, 44);
  }
  const tex = c => { const t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = 4; return t; };
  return eyeMaps = { shape: tex(shape), pupil: tex(pupil) };
}
const hazeGeometry = new THREE.PlaneGeometry(1, 1);
const colorOf = profile => new THREE.Color(...toLinear(profile.colors?.skin ?? '#c8ccd8'));

// the ball over the floor under e now (cells, in the cube): bobbing slowly
const headOf = (e, t, r = GHOST.headR) => ({ x: e.x, y: e.y + GHOST.head + GHOST.bob * Math.sin(t * GHOST.bobRate), z: e.z, r });

function makeView(e) {
  const group = new THREE.Group(), color = colorOf(e.profile), seed = Math.random() * 100;
  const cloth = newCloth(headOf(e, seed), e.yaw ?? 0, undefined, 1 + (seed % 1) * 4);
  // the sheet's mesh: its points as they are this frame (relative to him), its normals made anew
  const geometry = new THREE.BufferGeometry(), position = new THREE.BufferAttribute(new Float32Array(cloth.n * 3), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(cloth.n * 3), 3);
  position.setUsage(THREE.DynamicDrawUsage); normal.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', new THREE.BufferAttribute(cloth.uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(cloth.tris, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 4.5);   // (never computed: it is wherever the sheet streams)
  const base = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const body = new THREE.Mesh(geometry, blurry(base, color));
  base.dispose();
  body.renderOrder = 1; body.castShadow = true;
  group.add(body);
  // where terrain hides him: his silhouette, drawn before the body
  const ghost = new THREE.MeshBasicMaterial({ color: SILHOUETTE, transparent: true, opacity: SILHOUETTE_OPACITY, depthFunc: THREE.GreaterDepth,
    depthWrite: false, side: THREE.DoubleSide });
  const silhouette = new THREE.Mesh(geometry, ghost);
  silhouette.renderOrder = -1;
  group.add(silhouette);
  // the eyes: the sheet's triangles over the front of the ball, the same points, painted
  const eyes = eyeMesh(cloth, position, normal);
  eyes.material.userData.blur.uSeed.value = body.material.userData.blur.uSeed.value;   // (wobbling with the sheet)
  group.add(eyes);
  const copies = BLUR.copies.map((c, i) => {
    const mesh = new THREE.Mesh(geometry, blurry(body.material, color.clone().multiply(new THREE.Color(...c.tint))));
    mesh.material.depthWrite = false; mesh.renderOrder = 2 + i;
    group.add(mesh);
    return { mesh, ...c, angle: i / BLUR.copies.length * Math.PI * 2 + rand(-0.4, 0.4), rate: rand(1.1, 1.7) * (i % 2 ? -1 : 1) };
  });
  const shell = new THREE.Mesh(geometry, blurry(body.material, color.clone().lerp(new THREE.Color(1, 1, 1), 0.3)));
  shell.material.depthWrite = false; shell.material.userData.blur.uRim.value = 1; shell.renderOrder = 2 + copies.length;
  group.add(shell);
  const haze = new THREE.Mesh(hazeGeometry, new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.15),
    alphaMap: hazeTexture(), roughness: 1, metalness: 0, transparent: true, depthWrite: false, opacity: 0 }));
  haze.scale.set(GHOST.haze.w, GHOST.haze.h, 1); haze.renderOrder = 3 + copies.length;
  group.add(haze);
  const [li, ld, ly] = GHOST.light, light = new THREE.PointLight(e.profile.light ?? 0xdfe6f5, li, ld, 2);
  light.position.y = ly;
  trackLight(light, group);
  scene.add(group);
  group.userData.figure = true;   // (casts into the realtime shadow maps as the quality level asks: render/shadows.js)
  // the bar, the label over it and the "!" over that, together over the head
  const role = e.guardian ? e.guardianRole : null, tint = guardianColor(role);
  const tag = new THREE.Group(); tag.position.y = e.profile.height + 0.12; group.add(tag);
  const hpBar = makeBar({ onTop: true, ...role && { color: tint, w: role === 'descent' ? 1.2 : .9 } }), bar = hpBar.group;
  tag.add(bar);
  const label = makeLevelLabel(e.level, { onTop: true, ...role && { color: tint, title: guardianTitle(role, e.profile) } });
  label.position.y = .21; tag.add(label);
  const mark = makeAlertMark(); mark.position.y = .5; tag.add(mark);
  const rest = GHOST.rest;
  return { megalimmer: true, group, cloth, geometry, position, normal, body, silhouette, ghost, eyes, copies, shell, haze, light,
    tag, bar, hpBar, label, mark, markT: 0, yaw: e.yaw ?? 0, was: { x: e.x, z: e.z }, speed: 0, vel: new THREE.Vector3(), focus: 0, color,
    smudge: toHex([color.r, color.g, color.b]), seed, clock: seed, glowT: 0,
    hands: [[-rest[0], rest[1], rest[2]], [rest[0], rest[1], rest[2]]] };
}
// the eyes' mesh: the sheet's triangles in the patch over the front of the ball (its points shared
// with the sheet's mesh, its own uv over the patch), drawn just off the sheet
function eyeMesh(cloth, position, normal) {
  const E = GHOST.eyes, inPatch = k => Math.abs(cloth.a[k]) < E.w / 2 + cloth.cell && Math.abs(cloth.b[k] - E.b) < E.h / 2 + cloth.cell;
  const index = [];
  for (let i = 0; i < cloth.tris.length; i += 3) {
    const [a, b, c] = [cloth.tris[i], cloth.tris[i + 1], cloth.tris[i + 2]];
    if (inPatch(a) && inPatch(b) && inPatch(c)) index.push(a, b, c);
  }
  const uv = new Float32Array(cloth.n * 2);
  // (u across, from the viewer's left as he faces you, his right, -x; v down from the patch's top)
  for (let k = 0; k < cloth.n; k++) { uv[2 * k] = 0.5 + cloth.a[k] / E.w; uv[2 * k + 1] = (cloth.b[k] - (E.b - E.h / 2)) / E.h; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', position); g.setAttribute('normal', normal); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 4.5);
  const maps = eyeTextures(), dark = new THREE.Color(0x0d0b12);
  const m = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.55, metalness: 0, alphaMap: maps.shape, emissive: 0xdfe6f5, emissiveMap: maps.pupil,
    emissiveIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mat = blurry(m, dark);
  m.dispose();
  mat.depthWrite = false;
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 4 + BLUR.copies.length;   // (over the blur: his eyes stay sharp in it)
  return mesh;
}

// where his hands go now (each [x, y, z] in his own turned frame: x to his left), and how much
// the sheet billows: -> billow
function handTargets(v, e, out) {
  const a = e.mode === 'attack' ? attackOf(e) : null, T = e.t ?? 0, t = v.clock, G = GHOST;
  const trail = Math.min(1, v.speed / 5);
  let billow = 0;
  for (let side = 0; side < 2; side++) {
    const m = side ? 1 : -1, at = p => [p[0] * m, p[1], p[2]];
    // at rest: low at his sides, swaying a little; trailing back as he goes
    let p = [G.rest[0] * m, G.rest[1] + 0.04 * Math.sin(t * 1.8 + side * 2.4), G.rest[2] - 0.32 * trail + 0.03 * Math.sin(t * 1.3 + side)];
    if (a?.name === 'pummel') {
      // fists up in front (the warning), then the punches: right first, then in turn
      const hits = [a.hitAt, ...(a.more ?? []).map(h => h.at)], end = a.attackTime ?? hits.at(-1) + 0.3;
      const up = smooth(0, 0.3, T) * (1 - smooth(hits.at(-1) + 0.12, end, T));
      const base = p = lerp3(p, at(G.guard), up);
      let ext = 0;
      hits.forEach((h, i) => {
        if (i % 2 !== side) return;
        const k = T < h ? smooth(h - 0.1, h, T) : 1 - smooth(h, h + 0.14, T), big = i === hits.length - 1 ? 1.2 : 1;
        if (k > ext) { ext = k; p = lerp3(base, [G.punch[0] * m, G.punch[1], G.punch[2] * big], k); }
      });
    } else if (a?.name === 'vanish') {
      const w = smooth(0, 0.2, T) * (1 - smooth((a.attackTime ?? 0.8) - 0.2, a.attackTime ?? 0.8, T)), ph = T * 18 + side * Math.PI;
      p = lerp3(p, [G.wave[0] * m, G.wave[1] + 0.2 * Math.sin(ph), G.wave[2] + 0.12 * Math.cos(ph)], w);
    } else if (a?.cast === 'summon' || a?.name === 'stunner' || a?.name === 'flimmers') {
      const w = smooth(0, 0.4, T) * (1 - smooth((a.attackTime ?? 1) - 0.25, a.attackTime ?? 1, T));
      p = lerp3(p, at(G.raised), w);
      billow = w * (0.55 + 0.45 * smooth(a.hitAt - 0.15, a.hitAt, T));
    }
    out[side] = p;
  }
  return billow;
}

const WHITE = new THREE.Color(1, 1, 1), HOVER = new THREE.Color(0xffd9a0);
const targets = [null, null];
// (off: where the cube is drawn, while a portal's travel slides it: game/travel.js)
function animate(e, dt, off) {
  const v = e.view ?? (e.view = makeView(e)), g = v.group, dead = e.mode === 'dead';
  v.clock += dt;
  g.position.set(e.x + off.x, e.y + off.y, e.z + off.z);   // (not turned: the sheet's points are where they are)
  v.yaw = e.mode === 'attack' ? angleTo(v.yaw, e.yaw, Math.min(1, dt * 20)) : angleTo(v.yaw, e.yaw, Math.min(1, dt * 8));
  const mx = e.x - v.was.x, mz = e.z - v.was.z, moved = Math.hypot(mx, mz) < 1.2 ? Math.hypot(mx, mz) : 0;
  v.was.x = e.x; v.was.z = e.z;
  if (dt > 1e-4) {
    const k = Math.min(1, dt * 10);
    v.speed += (moved / dt - v.speed) * k;
    if (moved) v.vel.set(mx / dt, 0, mz / dt); else v.vel.multiplyScalar(1 - k);
  }
  if (e.mode !== 'gone') hang(v, e, dt);
  blur(v, e, dt, off);
  tags(v, e, dt, dead);
}
// the sheet, hung over his head and hands for this frame, into its mesh
function hang(v, e, dt) {
  const dead = e.mode === 'dead', G = GHOST, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
  let world;
  if (dead) {
    // the ball shrinks away and lets go: the sheet falls
    const k = smooth(0, G.pop, e.deadT ?? 0), head = headOf(e, v.clock, G.headR * (1 - k));
    world = { head: k < 1 ? head : null, yaw: v.yaw, pin: 1 - k, hands: [], floor: e.y, wind: 0.6 };
  } else {
    const billow = handTargets(v, e, targets), follow = 1 - Math.exp(-30 * dt);
    const hands = v.hands.map((h, i) => {
      for (let c = 0; c < 3; c++) h[c] += (targets[i][c] - h[c]) * follow;
      // (his frame turned to the world's: x to his left, z forward)
      return { x: e.x + h[0] * cy + h[2] * sy, y: e.y + h[1], z: e.z - h[0] * sy + h[2] * cy, r: G.hand };
    });
    // he leans into a punch a little
    const punch = Math.max(0, ...v.hands.map(h => (h[2] - G.guard[2]) / (G.punch[2] - G.guard[2])));
    const head = headOf(e, v.clock), lean = 0.12 * clamp(punch, 0, 1);
    head.x += sy * lean; head.z += cy * lean;
    world = { head, yaw: v.yaw, hands, floor: e.y, drag: e.circling ? 1.9 : 1, billow };
  }
  stepCloth(v.cloth, dt, world);
  const p = v.cloth.p, a = v.position.array;
  for (let k = 0; k < v.cloth.n; k++) { a[3 * k] = p[3 * k] - e.x; a[3 * k + 1] = p[3 * k + 1] - e.y; a[3 * k + 2] = p[3 * k + 2] - e.z; }
  v.position.needsUpdate = true;
  v.geometry.computeVertexNormals();
}
// how blurry he is, where his copies are, how see-through all of him is (and how hidden); his
// eyes, his light, his smudges and, dying, how he dissolves
function blur(v, e, dt, off) {
  const dead = e.mode === 'dead', B = BLUR, s = GHOST.blur, t = performance.now() / 1000 + v.seed;
  const sharp = dead ? 0 : 1 - shimmerOf(e);
  v.focus += (sharp - v.focus) * Math.min(1, dt * (sharp > v.focus ? B.focus.in : B.focus.out));
  const k = dead ? clamp((e.deadT ?? 0) / e.profile.deathTime, 0, 1) : 0, fade = 1 - smooth(GHOST.lie, 1, k);
  const hidden = dead ? 0 : clamp(e.hidden ?? 0, 0, 1), vis = 1 - hidden;
  const haze = (1 - v.focus) * fade;
  const fl = e.flinch;
  let jolt = 0, sx = 0, sz = 0;
  if (fl) {
    fl.t += dt;
    if (fl.t > FLINCH) e.flinch = null;
    else {
      jolt = Math.sin(Math.PI * fl.t / FLINCH);
      const l = Math.hypot(fl.dx, fl.dz) || 1;
      sx = -fl.dz / l * fl.side * 0.3 * jolt; sz = fl.dx / l * fl.side * 0.3 * jolt;
    }
  }
  const wander = B.wander * s * (1 + 2.5 * jolt) + 0.5 * smooth(GHOST.lie, 1, k) ** 1.3;
  const flash = clamp((e.hurtT ?? 0) / 0.22, 0, 1) * 0.6, hover = e.hovered && !dead ? 0.22 : 0;
  const paint = m => m.color.copy(m.userData.base).lerp(flash > 0.1 || !hover ? WHITE : HOVER, Math.max(flash, hover));
  const set = (m, x, y, z, puff, jitter) => {
    const u = m.userData.blur;
    u.uShift.value.set(x, y, z); u.uPuff.value = puff; u.uJitter.value = jitter; u.uTime.value = t;
    paint(m);
  };
  // the sheet: solid in focus, see-through while blurry; all but gone while hidden
  const body = v.body.material;
  set(body, sx, 0, sz, 0, B.wobble.body * s * (haze + hidden));
  body.opacity = (B.body + (1 - B.body) * v.focus) * fade * vis * vis;
  body.depthWrite = v.focus > 0.85 && !dead && hidden < 0.05;
  v.body.visible = body.opacity > 0.005;
  v.body.castShadow = hidden < 0.5 && fade > 0.5;
  v.copies.forEach((c, i) => {
    const a = c.angle + t * c.rate, r = wander * (0.6 + 0.4 * Math.sin(t * 6.1 + i * 1.3)) * (dead ? 1 : 1 - v.focus);
    const lag = c.lag * (1 - v.focus) * (e.circling ? 1.6 : 1);
    set(c.mesh.material, sx + Math.cos(a) * r - v.vel.x * lag, Math.sin(t * 4.3 + i * 2.1) * r * 0.5 + (dead ? 0.25 * k * (i / 3) : 0),
      sz + Math.sin(a) * r - v.vel.z * lag, 0, B.wobble.copy * s * (1 + jolt));
    c.mesh.material.opacity = B.copy * c.alpha * haze * vis;
    c.mesh.visible = c.mesh.material.opacity > 0.005;
  });
  // the shell: what is left of him hidden, a faint wobbling shimmer in the air
  set(v.shell.material, sx, 0, sz, B.puff * s * (1 + 0.5 * jolt + 2 * k), B.wobble.shell * s * (1 + 1.5 * hidden));
  const shimmer = hidden * GHOST.shimmer * (1 + 0.4 * Math.sin(t * 5.3) * Math.sin(t * 2.9 + 1));
  v.shell.material.opacity = B.shell * Math.max(haze * vis, shimmer);
  v.shell.visible = v.shell.material.opacity > 0.005;
  v.haze.material.opacity = B.haze.alpha * Math.max(haze * vis, shimmer * 0.8) * (1 + 0.15 * Math.sin(t * 9.3));
  v.haze.position.set(sx, GHOST.haze.y, sz);
  v.haze.quaternion.copy(camera.quaternion);   // (facing the camera)
  v.haze.visible = v.haze.material.opacity > 0.005;
  // his eyes: dark, the pupils glowing (brighter while he goes for you); out while hidden, and as
  // the ball goes when he dies
  v.glowT += ((e.main ? 1 : 0) - v.glowT) * Math.min(1, dt * 4);
  const eyesOn = vis * vis * (dead ? 1 - smooth(0, GHOST.pop * 1.5, e.deadT ?? 0) : 1), eyes = v.eyes.material;
  set(eyes, sx, 0, sz, 0.012, B.wobble.body * s * haze);
  eyes.color.copy(eyes.userData.base);
  eyes.opacity = eyesOn * (0.85 + 0.15 * v.focus);
  eyes.emissiveIntensity = (0.45 + v.glowT * (2.2 + 0.6 * Math.sin(t * 7))) * eyesOn;
  v.eyes.visible = eyes.opacity > 0.01;
  v.ghost.opacity = SILHOUETTE_OPACITY * fade * vis;
  v.silhouette.visible = v.ghost.opacity > 0.01;
  v.light.intensity = GHOST.light[0] * vis * fade * (1 + 0.6 * v.glowT) * (dead ? 1 - 0.7 * smooth(0, GHOST.pop, e.deadT ?? 0) : 1);
  v.group.visible = e.mode !== 'gone' && fade > 0.01;
  const near = Math.hypot(e.x - player.x, e.z - player.z) < 16, P = v.cloth.p, n = v.cloth.n;
  const pick = (list = null) => { const i = list ? list[Math.floor(Math.random() * list.length)] : Math.floor(Math.random() * n); return [P[3 * i] + off.x, P[3 * i + 1] + off.y, P[3 * i + 2] + off.z]; };
  // gliding fast, he leaves shimmering smudges of his colour behind, off his hem
  if (!dead && near && v.speed > 0.8 && v.group.visible) for (let i = Math.floor(B.smudge * 1.6 * dt * Math.max(haze * vis, 0.15 * hidden) + Math.random()); i > 0; i--) {
    const [x, y, z] = pick(v.cloth.hem);
    emit(soft, x + rand(-0.1, 0.1), y + rand(0, 0.3), z + rand(-0.1, 0.1),
      { v: [rand(-0.15, 0.15), rand(0.05, 0.3), rand(-0.15, 0.15)], life: rand(0.5, 0.9), size: rand(0.35, 0.6), grow: 0.8,
        color: v.smudge, alpha: 0.2 * Math.max(vis, 0.3), drag: 1.5 });
  }
  if (dead && near) {
    const d = e.deadT ?? 0;
    // the ball going: a puff of specks where it was
    if (d < GHOST.pop * 1.5) for (let i = Math.floor(160 * dt + Math.random()); i > 0; i--) {
      const h = headOf(e, v.clock), u = Math.random() * Math.PI * 2, w = Math.acos(rand(-1, 1));
      const ox = Math.sin(w) * Math.cos(u), oy = Math.cos(w), oz = Math.sin(w) * Math.sin(u);
      emit(i % 3 ? glow : soft, h.x + off.x + ox * 0.5, h.y + off.y + oy * 0.5, h.z + off.z + oz * 0.5,
        { v: [ox * rand(0.6, 1.4), oy * rand(0.6, 1.4) + 0.4, oz * rand(0.6, 1.4)], life: rand(0.4, 0.8), size: rand(0.04, 0.08), grow: -0.4,
          color: i % 3 === 1 ? '#ffffff' : v.smudge, alpha: 0.9, drag: 1.5 });
    }
    // dissolving: specks off all over the fallen sheet, drifting up and going out
    if (k > GHOST.lie * 0.85 && k < 0.95) for (let i = Math.floor(150 * dt * (1 - k) + Math.random()); i > 0; i--) {
      const [x, y, z] = pick();
      emit(i % 3 ? glow : soft, x + rand(-0.06, 0.06), y + rand(0, 0.06), z + rand(-0.06, 0.06),
        { v: [rand(-0.3, 0.3), rand(0.4, 1.2), rand(-0.3, 0.3)], life: rand(0.5, 0.9), size: rand(0.04, 0.08), grow: -0.4,
          color: i % 3 === 1 ? '#ffffff' : v.smudge, alpha: 0.9, drag: 1.2 });
    }
  }
}
// his bar, label and "!" (as any enemy's, render/enemies.js; a boss's bar is on the screen)
function tags(v, e, dt, dead) {
  if (dead || e.mode === 'gone' || (e.hidden ?? 0) > 0.5) { v.bar.visible = v.label.visible = v.mark.visible = false; return; }
  v.tag.position.y = e.profile.height + 0.12; v.tag.scale.setScalar(uiScale());
  v.bar.visible = !!e.guardian || !!e.hovered || !e.hordeId && e.hp < e.profile.hp;
  v.label.visible = v.bar.visible || !e.hordeId && Math.hypot(e.x - player.x, e.z - player.z) < e.profile.aggro + 1;
  if (bossBarred(e)) v.bar.visible = v.label.visible = false;   // (on the screen: game/bossbar.js)
  if (!e.guardian) v.label.setLevel(e.level, e.hovered ? enemyName(e.profile) : null);
  v.bar.quaternion.copy(camera.quaternion);
  v.hpBar.set(e.hp / e.profile.hp);
  v.markT = e.mode === 'alert' ? Math.min(v.markT + dt * 8, 1) : Math.max(v.markT - dt * 2, 0);
  v.mark.visible = v.markT > 0;
  v.mark.scale.setScalar(0.5 * (e.mode === 'alert' ? 1 + 0.35 * Math.sin(Math.PI * v.markT) : v.markT));
}
function dispose(e) {
  const v = e.view;
  scene.remove(v.group);
  untrackLight(v.light);
  for (const m of [v.body.material, v.shell.material, v.haze.material, v.eyes.material, ...v.copies.map(c => c.mesh.material)]) m.dispose();
  v.ghost.dispose(); v.geometry.dispose(); v.eyes.geometry.dispose();
  v.label.material.map.dispose(); v.label.material.dispose();
  e.view = null;
}

// render/enemies.js: Megalimmer comes here
export const isMegalimmer = e => !!e.profile?.cloth;
export function animateMegalimmers(list, dt, off) { for (const e of list) animate(e, dt, off); }
export function removeMegalimmerViews(list) { for (const e of list) if (e.view?.megalimmer) dispose(e); }
// one made once off-screen, for the shaders he is drawn with (render/enemies.js enemyWarmup):
// his parts, his eyes, his silhouette, his bar and label. -> the enemies made
let warmed = false;
export function megalimmerWarmup(kinds) {
  const kind = kinds.map(k => ENEMY_KINDS[k]).find(k => k?.cloth);
  if (warmed || !kind) return [];
  warmed = true;
  const e = makeEnemy({ id: 'warm:megalimmer', x: 0, y: 0, z: 0, yaw: 0, level: 1,
    ...(kind.guardian && { guardian: true, guardianRole: kind.guardianRole, boss: kind.boss }) }, kind);
  e.view = makeView(e);
  scene.remove(e.view.group);
  untrackLight(e.view.light);   // (no light out of nowhere meanwhile)
  return [e];
}
