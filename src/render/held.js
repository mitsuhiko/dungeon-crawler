// What the weapon in hand does while you attack with it, on top of the player's clips:
//   bow:      its string is drawn by the right fist from the moment that takes it until the
//             arrow goes; a nocked arrow lies on the bow meanwhile
//   crossbow: the string sits in the nut and a bolt lies on top while it is loaded
//             (core/combat.js crossbowLoaded); after a shot the string is forward and the
//             groove empty until the reload
//   staff:    its stone glows in the spell's colour, brighter as the spell gathers
//   trident:  its stones glow in its lightning's colour as its lightning gathers (a stab: not)
//   flail:    its balls hang and swing on their chains, whatever the hand does (swingFlail)
// The strings are drawn here (the GLB's own string part, as found, is hidden), and so are a
// flail's chains (its own, lying as on the floor, are hidden: its first link is copied along
// them). Item extras (blender/items.py) say where the strings and chains run.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { clamp } from '../core/util.js';
import { ITEMS } from '../core/items.js';
import { crossbowLoaded, swingClipTime, swingClipFrom, SHOOT_CLIP } from '../core/combat.js';
import { glow, emit, rand } from './particles.js';

const stringMaterial = new THREE.MeshStandardMaterial({ color: 0xefe6c8, roughness: 0.8 });
const stringGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 4, 1).translate(0, 0.5, 0);
let arrowModel = null;
loadGLB('assets/items/weapon_arrow.glb').then(g => { arrowModel = g.scene; })
  .catch(e => console.error('arrow model failed to load', e));

const Y = new THREE.Vector3(0, 1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
const vec = a => new THREE.Vector3(...a);

// a string segment from a to b (the item's space)
function segment(mesh, a, b) {
  _d.subVectors(b, a);
  const l = _d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(Y, _d.divideScalar(l || 1));
  mesh.scale.set(1, l || 1e-4, 1);
}

// the held weapon's details, made once per weapon model; `item`: the GLB node with the extras
export function prepareHeld(weapon, item) {
  if (weapon.userData.held) return weapon.userData.held;
  const d = item?.userData ?? {}, h = { kind: d.weapon ?? 'sword', item, glow: 0 };
  const part = suffix => item?.children.find(c => c.name.endsWith(suffix));
  if (h.kind === 'bow' || h.kind === 'crossbow') {
    const own = part('_string');
    if (own) own.visible = false;
    h.tips = [vec(d.string_tip_gltf), vec(d.string_tip_gltf)];
    if (h.kind === 'bow') h.tips[1].y *= -1; else h.tips[1].x *= -1;
    h.rest = vec(h.kind === 'bow' ? d.nock_gltf : d.string_rest_gltf);
    h.latch = h.kind === 'crossbow' ? vec(d.string_latch_gltf) : null;
    h.strings = h.tips.map(() => new THREE.Mesh(stringGeometry, stringMaterial));
    for (const s of h.strings) { s.castShadow = true; item.add(s); }
    h.nock = h.rest.clone();
  }
  if (h.kind === 'crossbow') h.bolt = part('_bolt');
  if (h.kind === 'staff' || h.kind === 'trident') {
    h.color = new THREE.Color(ITEMS[item.name]?.weapon?.color ?? '#c48cff');
    h.head = vec(d.head_gltf ?? [0, 1.2, 0]);
    h.stones = [];
    item?.traverse(o => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map(m => {
        if (!/Facets/.test(m.name)) return m;
        m = m.clone(); h.stones.push(m);
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }
  if (h.kind === 'flail') {
    // (each ball, and each copy of the first link, turns about a pivot of its own: the end of its
    // chain, the link's middle; wherever the loaded node has its geometry, it keeps it from there)
    const own = part('_chain'), link = part('_link'), n = d.balls ?? 1, ends = d.ball_ends_gltf ?? [], off = d.ball_offsets_gltf ?? [];
    const pivot = (o, at) => { const g = new THREE.Group(); item.add(g); o.position.sub(at); g.add(o); return g; };
    if (own) own.visible = false;
    if (link) link.visible = false;
    Object.assign(h, { anchor: vec(d.anchor_gltf ?? [0, 0.4, 0]), length: d.chain_length ?? 0.4, was: null, balls: [] });
    const middle = vec(d.link_gltf ?? [0, 0.4, 0]), count = Math.round(h.length / (d.link_pitch ?? 0.062));
    for (let i = 0; i < n; i++) {
      const ball = part(i ? `_ball${i + 1}` : '_ball');
      if (!ball) continue;
      const dir = new THREE.Vector3(off[i * 3] ?? 0, off[i * 3 + 1] ?? 1, off[i * 3 + 2] ?? 0), links = [];
      for (let k = 0; link && k < count; k++) {
        const l = link.clone();
        l.visible = true; links.push(pivot(l, middle));
      }
      h.balls.push({ part: pivot(ball, new THREE.Vector3(ends[i * 3] ?? 0, ends[i * 3 + 1] ?? 0, ends[i * 3 + 2] ?? 0)),
        dir: dir.clone().normalize(), reach: dir.length(), side: ends[i * 3] ?? 0, pos: null, prev: new THREE.Vector3(), links });
    }
  }
  weapon.userData.held = h;
  return h;
}

// pose the details for player p (its attack in p.sword) with the fists where the animator put
// them; `hands`: { L, R } bones
export function updateHeld(h, p, hands, dt) {
  if (!h) return;
  const s = p.sword, mine = s.stats?.kind === h.kind || (h.kind === 'trident' && s.stats?.kind === 'zap');
  if (h.kind === 'bow') {
    const clip = mine && s.active ? swingClipTime(s.stats, s.t, swingClipFrom(s)) : 0;
    // drawn from when the right fist takes the string until the arrow goes
    const drawn = mine && s.active && !s.fired && clip >= SHOOT_CLIP.redraw * 0.9;
    if (drawn) h.item.worldToLocal(hands.R.getWorldPosition(h.nock));
    else h.nock.lerp(h.rest, Math.min(1, dt * 40));   // snaps back, quivering a moment
    if (drawn && !h.arrow && arrowModel) { h.arrow = arrowModel.clone(); h.item.add(h.arrow); }
    if (h.arrow) {
      h.arrow.visible = drawn;
      // nock on the string, resting on the bow hand just above the grip
      h.arrow.position.copy(h.nock);
      h.arrow.quaternion.setFromUnitVectors(Y, _a.set(0, 0.035, 0).sub(h.nock).normalize());
    }
  }
  if (h.kind === 'crossbow') {
    const loaded = crossbowLoaded(p);
    if (h.bolt) h.bolt.visible = loaded;
    h.nock.copy(loaded ? h.latch : h.rest);
  }
  if (h.strings) for (let i = 0; i < 2; i++) segment(h.strings[i], h.tips[i], h.nock);
  if (h.kind === 'flail') swingFlail(h, dt);
  if (h.kind === 'staff' || h.kind === 'trident') {
    // gathering until the spell goes, then fading (a trident's lightning only)
    const casting = h.kind === 'staff' || s.stats?.kind === 'zap';
    const gather = mine && s.active && !s.fired && casting ? clamp(s.t / s.stats.activeStart, 0, 1) : 0;
    h.glow = gather > h.glow ? gather : Math.max(gather, h.glow - dt * 4);
    for (const m of h.stones) { m.emissive?.copy(h.color); m.emissiveIntensity = 0.25 + 1.6 * h.glow; }
    if (gather > 0.3 && Math.random() < dt * 40) {
      h.item.localToWorld(_b.copy(h.head));
      emit(glow, _b.x + rand(-0.04, 0.04), _b.y + rand(-0.04, 0.04), _b.z + rand(-0.04, 0.04), {
        v: [rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3)], life: rand(0.2, 0.35), size: rand(0.05, 0.1),
        color: '#' + h.color.getHexString(), drag: 3 });
    }
  }
}

// A flail's balls: each a point (world space: the end of its chain) that falls, keeps going and is
// held within its chain's length of the anchor at the top of the handle (Verlet, in small steps,
// the anchor moved along between them), the balls kept apart and off the floor under the one who
// holds it (the figure's feet: dragged along it); then each ball turned to hang along its chain,
// and the links laid along it, sagging as it slackens. A body that jumped (a portal, coming in)
// hangs its balls straight down again.
const FLAIL = { gravity: 16, keep: 0.996, step: 1 / 120, sag: 0.6, drag: 0.25 };
const _s = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3(), _at = new THREE.Vector3();
function swingFlail(h, dt) {
  const item = h.item, A = item.localToWorld(_a.copy(h.anchor)), k = item.getWorldScale(_s).x, L = h.length * k;
  const was = h.was ?? (h.was = A.clone()), jumped = was.distanceTo(A) > 1.5;
  let root = item;
  while (root.parent && !root.parent.isScene) root = root.parent;
  const feet = root.getWorldPosition(_c).y;
  // (hung each a little to its own side, as they lie in the model: balls started in one spot
  // would move as one forever, drawn as a single ball)
  for (const b of h.balls) if (!b.pos || jumped || b.pos.distanceTo(A) > L * 3) {
    b.pos = A.clone(); b.pos.y -= L;
    if (b.side) b.pos.addScaledVector(_u.set(1, 0, 0).transformDirection(item.matrixWorld), b.side * k);
    b.prev.copy(b.pos);
  }
  if (jumped) was.copy(A);
  const steps = dt > 0 ? Math.min(8, Math.ceil(dt / FLAIL.step)) : 0, h2 = (dt / Math.max(1, steps)) ** 2;
  for (let i = 1; i <= steps; i++) {
    _at.lerpVectors(was, A, i / steps);
    for (const b of h.balls) {
      _p.subVectors(b.pos, b.prev).multiplyScalar(FLAIL.keep);
      b.prev.copy(b.pos);
      b.pos.add(_p); b.pos.y -= FLAIL.gravity * h2;
      _p.subVectors(b.pos, _at);
      if (_p.length() > L) b.pos.copy(_at).addScaledVector(_p.normalize(), L);
      const low = feet + b.reach * k * 1.8;   // (the ball's middle a ball's width over the floor)
      if (b.pos.y < low) { b.pos.y = low; b.prev.x += (b.pos.x - b.prev.x) * FLAIL.drag; b.prev.z += (b.pos.z - b.prev.z) * FLAIL.drag; }
    }
    // (the balls of one flail knock each other aside)
    for (let x = 0; x < h.balls.length; x++) for (let y = x + 1; y < h.balls.length; y++) {
      const a = h.balls[x], b = h.balls[y], min = (a.reach + b.reach) * 0.7 * k;
      _p.subVectors(b.pos, a.pos);
      const d = _p.length();
      if (d >= min) continue;
      if (d < 1e-6) { _p.set(min / 2, 0, 0); a.pos.sub(_p); b.pos.add(_p); continue; }   // (one on the other: apart along x)
      _p.multiplyScalar((min - d) / d / 2); a.pos.sub(_p); b.pos.add(_p);
    }
  }
  was.copy(A);
  // in the item's space: each ball along its chain, its links between
  _c.copy(A).y -= 1;
  const down = item.worldToLocal(_c).sub(h.anchor).normalize();
  for (const b of h.balls) {
    const P = item.worldToLocal(_p.copy(b.pos)), span = _u.subVectors(P, h.anchor), d = span.length();
    if (d < 1e-6) continue;
    span.divideScalar(d);
    b.part.position.copy(P);
    b.part.quaternion.setFromUnitVectors(b.dir, span);
    // the chain: a curve from the anchor to the ball, bent down by its slack
    const C = _b.addVectors(h.anchor, P).multiplyScalar(0.5).addScaledVector(down, Math.max(0, h.length - d) * FLAIL.sag);
    const n = b.links.length;
    b.links.forEach((l, i) => {
      const t = (i + 0.5) / n, u = 1 - t;
      l.position.set(0, 0, 0).addScaledVector(h.anchor, u * u).addScaledVector(C, 2 * u * t).addScaledVector(P, t * t);
      _d.subVectors(C, h.anchor).multiplyScalar(2 * u).addScaledVector(_s.subVectors(P, C), 2 * t).normalize();
      l.quaternion.setFromUnitVectors(Y, _d);
      if (i % 2) l.rotateY(Math.PI / 2);
    });
  }
}
