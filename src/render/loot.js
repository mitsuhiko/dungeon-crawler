// Pickups on the ground: they arc out of the body, and when collected they swoop into the
// player and shrink away. Coins and stackables hover, spin and bob with a faint glow of their
// own colour; weapons lie flat (armor stands, a shield lies face up), and their rarity shows in what glows around them (RARITIES
// glow in core/gear/rarities.js): a ring on the floor, a soft pool of light, a beam, rising
// sparks, a turning circle of runes and a real light, more of it the rarer the weapon.
// The bottom four (Crap to Unremarkable) do not glow at all; OMG runs through the rainbow and
// hops on the floor. A quest's thing to find glows gold (QUEST_GLOW), so it
// stands out from the clutter it may look like (core/items.js: made from the world's props); so do
// the beginning's (core/intro.js): the glassmaker's glass floating over the plaza
// (render/glassbubble.js) and his sword standing in the ground.
// Views hang in the cube's group, so they slide along with it during travel and go away with
// it; their geometry and materials are shared between all copies (per item / per rarity), so
// disposing a cube leaves them alone.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { layFlat } from './itempictures.js';
import { ITEMS } from '../core/items.js';
import { RARITIES, rarityOf } from '../core/gear/rarities.js';
import { player } from '../game/state.js';
import { partnerAt } from './partner.js';
import { trackLight, untrackLight } from './lightpool.js';
import { emit, glow as glowLayer, rand } from './particles.js';
import { glassBubble, GLASS_VIEW } from './glassbubble.js';

const protos = new Map();   // itemId -> prototype (null while loading)
const loads = new Map();    // itemId -> Promise (resolves once loaded or failed)
const views = new Map();                               // pickup id -> { o, model, fx, light }
let viewsWorld = null;
const HOVER = 0.08, TOSS_HEIGHT = 0.75, SCALE = 1.35, WEAPON_SCALE = 0.72, ARMOR_SCALE = 0.5;
// a sword stuck in the ground (core/intro.js): how much bigger than one lying about, the share of
// its length in the ground, and how it stands: point down (the blade lies along -Z), leaning a little
const STUCK_SCALE = 1.7, STUCK_SINK = 0.22, STUCK_TILT = -Math.PI / 2 + 0.2;
// how a quest's thing glows: like a rarity, in gold
const QUEST_GLOW = { id: 'quest', rank: 6, rgb: [1, 0.78, 0.32], glow: { ring: 0.9, halo: 0.9, beam: 1.6, sparks: 3, runes: false, light: 1.2 } };
// the glassmaker's glass (core/intro.js): amber, with no beam (its own glow is the light: a beam
// would wash it out)
const GLASS_GLOW = { id: 'glass', rank: 6, rgb: [1, 0.7, 0.35], glow: { ring: 0.8, halo: 1, beam: 0, sparks: 2.5, runes: false, light: 1.4 } };
const glowOf = p => p.lift ? GLASS_GLOW : p.questItem ? QUEST_GLOW : p.gen ? rarityOf(p) : null;
// how far above Vanilla a rarity is (the first that glows is 2): what scales its pulse and burst
const steps = r => Math.max(0, r.rank - 2);
// a rainbow rarity's colour at hue h (0..1)
const RAINBOW_HZ = 0.4, RUNES = 8;
const rainbow = (out, h) => out.setHSL(((h % 1) + 1) % 1, 1, 0.6);
const sparkColor = new THREE.Color();
const sparkOf = (r, k) => r.glow?.rainbow ? rainbow(sparkColor, Math.random()) : k.color;

function proto(itemId) {
  if (protos.has(itemId)) return protos.get(itemId);
  if (itemId === GLASS_VIEW || ITEMS[itemId]?.voyagePart === 'message') {   // All recordings share the beginning's glass sphere.
    protos.set(itemId, glassBubble()); loads.set(itemId, Promise.resolve());
    return protos.get(itemId);
  }
  protos.set(itemId, null);
  const def = ITEMS[itemId], weapon = !!def.weapon, gear = weapon || !!def.armor;
  loads.set(itemId, loadGLB(def.model).then(g => {
    const root = g.scene;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.userData.sharedGeo = true;
      // a faint glow of their own colour, so pickups stand out from the ground clutter;
      // weapons glow by rarity instead
      o.material = [].concat(o.material).map(m => {
        m = m.clone(); m.userData.keep = true;
        // (a quest thing's own glowing parts, '<name>_glow', keep their light)
        if (m.emissive && !gear && !m.name.endsWith('_glow')) { m.emissive.copy(m.color); m.emissiveIntensity = 0.2; }
        return m;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    if (def.category === 'currency') root.rotation.x = Math.PI / 2;   // coins stand on their rim
    if (weapon) root.rotation.x = -Math.PI / 2;   // the blade (+Y) flat along the floor, its face up
    layFlat(root);   // a shield face up (blender/armor.py floor_gltf)
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), centre = box.getCenter(new THREE.Vector3());
    root.position.sub(centre);
    const wrap = new THREE.Group(), scale = def.floorScale ?? (weapon ? WEAPON_SCALE : def.armor ? ARMOR_SCALE : SCALE);
    wrap.add(root); wrap.scale.setScalar(scale);
    wrap.userData.half = (box.max.y - box.min.y) / 2 * scale;
    wrap.userData.scale = scale;
    wrap.userData.size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
    protos.set(itemId, wrap);
  }).catch(e => console.error('item model failed to load', itemId, e)));
  return null;
}

// Models fetched ahead (render/cubeassets.js: the coins every enemy drops), so the first one
// dropped shows at once, not a moment later. -> Promise
export const loadLoot = ids => Promise.all(ids.map(id => { proto(id); return loads.get(id); }));

// What loot is drawn with, for its shaders (render/warmup.js): these items' models (once
// loaded) and every rarity's glow; each once.
const warmedLoot = new Set();
export function lootWarmup(ids) {
  const out = [];
  for (const id of ids) if (!warmedLoot.has(id) && protos.get(id)) { warmedLoot.add(id); out.push(protos.get(id)); }
  if (!warmedLoot.has('')) {
    warmedLoot.add('');
    for (const r of [...RARITIES, QUEST_GLOW, GLASS_GLOW]) {
      const fx = makeFx(r);
      if (!fx) continue;
      if (fx.userData.light) untrackLight(fx.userData.light);
      out.push(fx);   // (its materials and geometry are the rarity's, kept: nothing to dispose)
    }
  }
  return out;
}

// the shared glow pieces of each rarity, made on first use
const fxKit = new Map();
function gradient(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let poolTex = null, beamTex = null;
// additive glows wash out to white on bright ground; the floor marks blend normally, so their
// colour reads in daylight too, and only the beams and the runes add light
const glowMat = (color, map, opacity, additive = true) => {
  const m = new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, forceSinglePass: true, fog: false });
  m.userData.keep = true; m.userData.base = opacity;
  return m;
};
function kit(r) {
  if (fxKit.has(r.id)) return fxKit.get(r.id);
  poolTex ||= gradient(g => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  beamTex ||= gradient(g => {   // bright at the floor, fading out upwards (v runs bottom to top)
    const grd = g.createLinearGradient(0, 64, 0, 0);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.25, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  const color = new THREE.Color().setRGB(...r.rgb), g = r.glow;
  const k = {
    color,
    ring: glowMat(color, null, 0.8 * g.ring, false),
    pool: glowMat(color, poolTex, 0.45 * g.halo, false),
    beam: glowMat(color, beamTex, 0.4),
    core: glowMat(new THREE.Color(1, 1, 1).lerp(color, 0.7), beamTex, 0.45),
    rune: glowMat(color, null, 0.9, false),
  };
  // a rainbow's runes each have their own hue, so the circle shows all of them at once
  if (g.rainbow) k.runes = Array.from({ length: RUNES }, () => glowMat(color.clone(), null, 0.9, false));
  fxKit.set(r.id, k);
  return k;
}
const GEO = {};
function geo() {
  if (GEO.ring) return GEO;
  GEO.ring = new THREE.RingGeometry(0.34, 0.42, 40).rotateX(-Math.PI / 2);
  GEO.pool = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  GEO.beam = new THREE.CylinderGeometry(0.16, 0.22, 1, 18, 1, true).translate(0, 0.5, 0);
  GEO.core = new THREE.CylinderGeometry(0.05, 0.08, 1, 10, 1, true).translate(0, 0.5, 0);
  GEO.rune = new THREE.PlaneGeometry(0.09, 0.09).rotateZ(Math.PI / 4).rotateX(-Math.PI / 2);
  return GEO;
}
const shared = m => { m.userData.sharedGeo = true; m.renderOrder = 950; return m; };

// the glow under and above a weapon of rarity r (null for none)
function makeFx(r) {
  const g = r.glow;
  if (!g) return null;
  const k = kit(r), G = geo(), fx = new THREE.Group();
  const ring = shared(new THREE.Mesh(G.ring, k.ring));
  ring.scale.setScalar(0.85 + 0.5 * g.ring); ring.position.y = 0.02;
  fx.add(ring);
  if (g.halo) {
    const pool = shared(new THREE.Mesh(G.pool, k.pool));
    pool.scale.setScalar(1 + 1.1 * g.halo); pool.position.y = 0.015;
    fx.add(pool);
  }
  if (g.beam) {
    const beam = shared(new THREE.Mesh(G.beam, k.beam)), core = shared(new THREE.Mesh(G.core, k.core));
    beam.scale.y = core.scale.y = g.beam;
    fx.add(beam, core);
  }
  if (g.runes) {
    const runes = new THREE.Group();
    for (let i = 0; i < RUNES; i++) {
      const a = i / RUNES * Math.PI * 2, m = shared(new THREE.Mesh(G.rune, k.runes?.[i] ?? k.rune));
      m.position.set(Math.cos(a) * 0.62, 0.025, Math.sin(a) * 0.62);
      runes.add(m);
    }
    fx.add(runes); fx.userData.runes = runes;
  }
  if (g.light) {
    const light = new THREE.PointLight(k.color, g.light, 3.5, 2);
    light.position.y = 0.6;
    fx.userData.light = light;
    trackLight(light, fx, fx, 2);   // a light source, not in the scene (render/lightpool.js)
  }
  return fx;
}

// every rarity's shared materials pulse together; OMG runs through every hue
const WHITE = new THREE.Color(1, 1, 1);
function pulse(time) {
  for (const r of [...RARITIES, QUEST_GLOW, GLASS_GLOW]) {
    const k = fxKit.get(r.id);
    if (!k) continue;
    const s = 0.78 + 0.22 * Math.sin(time * (2 + steps(r) * 0.25));
    for (const m of [k.ring, k.pool, k.beam, k.core]) m.opacity = m.userData.base * s;
    if (r.glow.rainbow) {
      const h = time * RAINBOW_HZ;
      rainbow(k.color, h);
      for (const m of [k.ring, k.pool, k.beam, k.rune]) m.color.copy(k.color);
      k.core.color.copy(WHITE).lerp(k.color, 0.7);
      k.runes.forEach((m, i) => rainbow(m.color, h + i / RUNES));
    }
  }
}

// a rainbow weapon's hop: up and down in the first part of each beat, then still (0..1 of the
// way up, and how far through the air it is, 0..1; -1 on the floor)
const HOP_HZ = 0.9, HOP_AIR = 0.35, HOP_HEIGHT = 0.06;
function hop(p, time) {
  const u = ((time * HOP_HZ + p.phase) % 1 + 1) % 1;
  if (u >= HOP_AIR) return { up: 0, air: -1 };
  const x = u / HOP_AIR;
  return { up: 4 * x * (1 - x), air: x };
}

const ease = t => t * t * (3 - 2 * t);
const v = new THREE.Vector3(), target = new THREE.Vector3();
const TAU = Math.PI * 2;

// where p is when nobody pulls it: on its arc out of the body (lift: its middle above `from`),
// then resting (weapons lie on the floor, everything else hovers and bobs; the glassmaker's glass
// floats `p.lift` higher and bobs more, his sword stands in the ground: its middle `stand` over it)
function rest(p, half, time, out, lift = 0, stand = null) {
  const y = stand !== null ? p.y + stand : p.gen ? p.y + half + 0.01 + (rarityOf(p).glow?.rainbow ? hop(p, time).up * HOP_HEIGHT : 0)
    : p.y + half + HOVER + (p.lift ?? 0) + Math.sin(time * (p.lift ? 1.4 : 2.6) + p.phase) * (p.lift ? 0.07 : 0.035);
  if (p.toss >= 1) return out.set(p.x, y, p.z);
  const u = Math.max(0, p.toss), e = ease(u), fy = p.from.y + lift;
  return out.set(p.from.x + (p.x - p.from.x) * u, fy + (y - fy) * e + TOSS_HEIGHT * 4 * u * (1 - u), p.from.z + (p.z - p.from.z) * u);
}

// how p lies in a chest before it comes out (render/chests.js stowLoot): its scale, shrunk to
// fit its spot, and how far its middle is above the spot's bottom
function stowed(p, ud) {
  const { size, scale } = ud, i = p.inside;
  const across = i.flat ? Math.max(size.x, size.y) : Math.max(size.x, size.z), high = i.flat ? size.z : size.y;
  const k = Math.min(1, i.fit / across, i.h / high);
  return { scale: scale * k, lift: high / 2 * k };
}

function forget(view) {
  view.o.removeFromParent();
  if (view.fx?.userData.light) untrackLight(view.fx.userData.light);
}

export function drawLoot(list, world, time, dt = 0) {
  if (world !== viewsWorld) {   // old views leave with their cube; their lights go out
    for (const view of views.values()) if (view.fx?.userData.light) untrackLight(view.fx.userData.light);
    views.clear(); viewsWorld = world;
  }
  if (!world) return;
  pulse(time);
  const seen = new Set(), off = world.group.position;
  for (const p of list) {
    seen.add(p.id);
    let view = views.get(p.id);
    if (!view) {
      const pr = proto(p.itemId);
      if (!pr) continue;
      const glow = glowOf(p), o = new THREE.Group(), model = pr.clone(), fx = glow?.glow ? makeFx(glow) : null;
      model.rotation.order = 'YXZ';   // (a coin laid on its face in a chest, then turned)
      o.add(model); if (fx) o.add(fx);
      world.group.add(o);
      view = { o, model, fx };
      views.set(p.id, view);
    }
    const { o, model, fx } = view, half = model.userData.half;
    let base = model.userData.scale;
    // the glassmaker's sword (core/intro.js), standing in the ground point first, leaning a little:
    // bigger than a weapon lying about, some of its blade sunk (stand: its middle over the floor)
    let stand = null;
    if (p.stuck) {
      base *= STUCK_SCALE;
      const length = model.userData.size.z / model.userData.scale * base;
      stand = length / 2 - length * STUCK_SINK;
    }
    // flying to another player (playing together), there if we see them; taken and waiting to be
    // ours (game/loot.js claim): out of sight
    const friend = p.fly?.to != null ? partnerAt(p.fly.to) : null;
    o.visible = (p.toss >= 0 || !!p.inside) && !(p.claim && (!p.fly || p.fly.t >= p.fly.dur || (p.fly.to != null && !friend)));
    o.position.set(p.x, p.y, p.z);
    // waiting in a chest: still and shrunk; on the way out it grows, turns and gets up
    const inside = p.inside && p.toss < 1 ? stowed(p, model.userData) : null;
    rest(p, half, time, v, inside?.lift, stand);
    let spin = p.gen || p.stuck ? 0 : p.lift ? 0.5 : 1.8, scale = base, yaw = p.phase, tilt = p.stuck ? STUCK_TILT : 0;
    if (p.toss < 1) { spin = 9; if (p.gen) { spin = 0; yaw += (1 - p.toss) * 7; } }   // tumbling out, a weapon unwinding into place
    if (inside) {
      const u = Math.max(0, p.toss), e = ease(u);
      scale = inside.scale + (base - inside.scale) * e;
      spin = 0;
      // a weapon unwinds from how it lay into place; the rest tumbles from how it lay
      yaw = p.gen ? p.phase + (1 - u) * ((((p.inside.yaw - p.phase) % TAU) + TAU) % TAU + TAU) : p.inside.yaw + u * 5;
      if (p.inside.flat) tilt = -Math.PI / 2 * (1 - e);
    }
    if (p.fly) {
      const u = Math.min(1, Math.max(0, p.fly.t / p.fly.dur)), e = u * u;   // accelerate into the player
      if (friend) target.set(friend.x - off.x, friend.y + 0.55 - off.y, friend.z - off.z);
      else target.set(player.x - off.x, player.visY + 0.55 - off.y, player.z - off.z);
      const lift = p.fly.t < 0 ? 0.12 * Math.min(1, (p.fly.t + 0.15) / 0.15) : 0;   // a little hop before it goes
      v.lerp(target, e).y += Math.sin(u * Math.PI) * 0.35 + Math.max(0, lift);
      spin = 4 + 14 * e; scale *= 1 - 0.65 * e;
    }
    model.position.copy(v).sub(o.position);
    model.rotation.y = time * spin + yaw;
    model.rotation.x = tilt;
    // a hopping weapon wobbles while it is in the air
    if (p.gen && rarityOf(p).glow?.rainbow) {
      const air = p.toss >= 1 && !p.fly ? hop(p, time).air : -1;
      model.rotation.x = air < 0 ? 0 : Math.sin(air * Math.PI * 2) * 0.12;
    }
    model.scale.setScalar(scale);
    if (fx) {
      fx.visible = p.toss >= 1 && !p.fly;
      if (fx.userData.runes) fx.userData.runes.rotation.y = time * 0.6;
      const r = glowOf(p), sparks = r.glow.sparks;
      if (r.glow.rainbow && fx.userData.light) fx.userData.light.color.copy(kit(r).color);
      if (fx.visible && sparks && Math.random() < sparks * dt) {
        const k = kit(r), a = Math.random() * Math.PI * 2, d = Math.random() * 0.35;
        emit(glowLayer, p.x + off.x + Math.cos(a) * d, p.y + off.y + 0.05, p.z + off.z + Math.sin(a) * d,
          { v: [0, rand(0.7, 1.5), 0], spread: 0.3, life: rand(0.7, 1.2), size: rand(0.05, 0.09), color: sparkOf(r, k), drag: 0.5 });
      }
    }
  }
  for (const [id, view] of views) if (!seen.has(id)) { forget(view); views.delete(id); }
}

// a weapon came down: Decent and better ones burst in their colour, the best ones more
export function lootLanded(p, world) {
  const r = rarityOf(p);
  if (!r.glow || !world) return;
  const k = kit(r), off = world.group.position, n = 4 + steps(r) * 3;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, s = rand(0.8, 1.6) * (0.6 + steps(r) * 0.12);
    emit(glowLayer, p.x + off.x, p.y + off.y + 0.08, p.z + off.z,
      { v: [Math.cos(a) * s, rand(0.3, 1.2) + (r.glow.beam ? 1.5 : 0), Math.sin(a) * s], life: rand(0.4, 0.8),
        size: rand(0.06, 0.12), color: sparkOf(r, k), gravity: 2, drag: 2 });
  }
}

// the glassmaker's glass breaking, his sword pulled out (game/intro.js): a burst of light in `rgb`
// at (x, y, z) in the cube
export function storyBurst(world, x, y, z, rgb, n) {
  if (!world) return;
  const off = world.group.position, color = new THREE.Color().setRGB(...rgb);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, up = rand(-0.6, 1), s = rand(0.8, 2.2);
    emit(glowLayer, x + off.x, y + off.y, z + off.z, { v: [Math.cos(a) * s, up * s + 0.6, Math.sin(a) * s], life: rand(0.5, 1.1),
      size: rand(0.06, 0.14), color, gravity: 1.5, drag: 1.8 });
  }
}

// the view of pickup p, if it has one (labels and the hover pick in game/pointer.js)
export const lootView = p => views.get(p.id)?.model || null;
