import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, accessorValues, decoderReady, isCompressed } from '../tools/glb.mjs';
import { readdirSync } from 'node:fs';
import { SLASH_CLIP, SHOOT_CLIP, CROSSBOW_CLIP, CAST_CLIP, THROW_CLIP, KINDS } from '../src/core/combat.js';
import { MUZZLES } from '../src/core/shots.js';
import { WEAPONS, WEARABLES, OUTFIT_SLOTS, POTIONS } from '../src/core/items.js';
import { SPIDER, STUNDER, SNAKE, OCTONAUT, FIREFACE, TRIANGLE, FIRECAT, SHRAPS, FIRE_SHRAPS, SPICY, WOLK, GUSTO, GUSTO_SPLIT, TOTNAR, SNAP_SKULL,
  SQUARLO, SQUARLO_GIANT, SQUIRTLE, MECKED, TORNADO, SLUG, BOLIME, FLIMMER, FLIP, FOGGERY, FOGGERY_BALL, SLOMO, SLOMO_SLUG, MANSK, MANSK_SKY, MANSK_RIBBONS, fireAt } from '../src/core/enemies.js';
import { MANSK_FIGHT } from '../src/core/mansk.js';
import { CHAR_SCALE } from '../src/core/constants.js';

await decoderReady;
// an exported GLB: its JSON, an accessor's values (decoded: the files are meshopt-compressed,
// tools/compress-assets.mjs) and a clip's length (its samplers' input accessors' max)
function glb(name) {
  const file = readGlb(resolve(assets, name + '.glb')), json = file.json;
  const floats = index => accessorValues(file, index);
  return { json, floats, duration: clip => Math.max(...clip.samplers.map(s => json.accessors[s.input].max[0])) };
}
test('every exported GLB is meshopt-compressed (node tools/compress-assets.mjs after exporting)', () => {
  const all = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? all(resolve(dir, e.name)) : e.name.endsWith('.glb') ? [resolve(dir, e.name)] : []);
  const files = all(assets);
  assert.ok(files.length > 100);
  for (const f of files) assert.ok(isCompressed(readGlb(f).json), `${f} is not compressed`);
});

// every skinned triangle is drawn three times a frame (body, silhouette, shadow), for every
// enemy on screen: the models keep to blender/figure.py TRIANGLE_BUDGET (mesh -> triangles)
const BUDGETS = {
  character: { Character: 6000 }, spider: { Spider: 6000 }, stunder: { Stunder: 6000 }, snake: { Snake: 6000 },
  octonaut: { Octonaut: 6000 }, fireface: { FireFace: 6000, FireFaceBall: 1500 }, triangle: { Triangle: 6000, TrianglePunch: 1500 },
  firecat: { FireCat: 8000 }, shraps: { Shraps: 8000, ShrapsIceBall: 1500 }, spicy: { Spicy: 6000 }, wolla: { Wolla: 8000 }, wolk: { Wolk: 6000 },
  gusto: { Gusto: 8000 }, totnar: { Totnar: 10000, TotnarSkull: 1500 }, snapskull: { SnapSkull: 3000 },
  squarlo: { Squarlo: 8000 }, squirtle: { Squirtle: 5000, SquirtleDrop: 800 }, flip: { Flip: 10000, FlipBall: 1200 },
  foggery: { Foggery: 12000, FoggeryEye: 1500 }, mecked: { Mecked: 7000 }, tornado: { Tornado: 7000, TornadoTwister: 1500 }, slug: { Slug: 6000, SlugBall: 800 }, bolime: { Bolime: 6000 },
  slomo: { Slomo: 12000, SlomoArmSlug: 1500 }, mansk: { Mansk: 9000 }, robot: { Robot: 3000 },
};
test('characters and enemies keep to their triangle budgets', () => {
  for (const [file, budget] of Object.entries(BUDGETS)) {
    const { json: j } = glb(file);
    const meshes = j.nodes.filter(n => n.mesh !== undefined);
    assert.deepEqual(meshes.map(n => n.name).sort(), Object.keys(budget).sort(), file);
    for (const n of meshes) {
      const tris = j.meshes[n.mesh].primitives.reduce((sum, p) => sum + j.accessors[p.indices].count / 3, 0);
      assert.ok(tris <= budget[n.name], `${file} ${n.name}: ${tris} triangles, budget ${budget[n.name]}`);
    }
  }
});

test('player is unarmed, retains both hand sockets and exports only its own clips', () => {
  const { json: j, duration } = glb('character');
  assert.ok(!j.nodes.some(n => n.name === 'Sword' || n.extras?.weapon));
  for (const name of ['hand.L', 'hand.R']) {
    const socket = j.nodes.find(n => n.name === name);
    assert.ok(socket);
    assert.equal(socket.children?.length || 0, 0, 'hand socket must be empty');
  }
  assert.equal(j.meshes.length, 1); assert.equal(j.skins.length, 1);
  assert.ok(!j.animations.some(a => /Spider|Stunder|Snake|Octo|Fire|Tri|Cat/.test(a.name)));
  const slash = j.animations.find(a => a.name === 'Slash');
  assert.ok(slash);
  assert.ok(Math.abs(duration(slash) - SLASH_CLIP.duration) < 1e-5);
  assert.equal(slash.extras.weapon_socket, 'hand.R');
  assert.equal(slash.extras.active_start, SLASH_CLIP.activeStart);
  assert.equal(slash.extras.active_end, SLASH_CLIP.activeEnd);
  assert.equal(j.images?.length || 0, 0);
});
test('the hero\'s Pummel is the Flimmer\'s beating: its fists land on the attack\'s blows', () => {
  const { json: j, duration } = glb('character'), clip = j.animations.find(a => a.name === 'Pummel'), [a] = FLIMMER.attacks;
  assert.ok(clip);
  assert.ok(Math.abs(duration(clip) - a.attackTime) < 1e-5);
  const hits = [a.hitAt, ...a.more.map(m => m.at)];
  assert.equal(clip.extras.hits.length, hits.length);
  clip.extras.hits.forEach((t, i) => assert.ok(Math.abs(t - hits[i]) < 1e-9, `blow ${i + 1}`));
});
test('the bow, crossbow, staff and throw clips match the attack timing, shoot from the profile muzzles and come with hold poses', () => {
  const { json: j, duration } = glb('character');
  const clip = name => j.animations.find(a => a.name === name);
  for (const [kind, name, C] of [['bow', 'Shoot', SHOOT_CLIP], ['crossbow', 'CrossbowShot', CROSSBOW_CLIP], ['staff', 'Cast', CAST_CLIP],
    ['throw', 'Throw', THROW_CLIP]]) {
    const a = clip(name);
    assert.ok(a, name); assert.equal(KINDS[kind].clip, C);
    assert.ok(Math.abs(duration(a) - C.duration) < 1e-5, name);
    for (const [k, extra] of [['activeStart', 'active_start'], ['activeEnd', 'active_end'], ['redraw', 'redraw'], ['reloaded', 'reloaded']])
      if (C[k] !== undefined) assert.ok(Math.abs(a.extras[extra] - C[k]) < 1e-9, `${name} ${extra}`);
    assert.deepEqual(a.extras.muzzle, [...MUZZLES[kind]], `${name} muzzle`);
    const hold = clip('Hold' + kind[0].toUpperCase() + kind.slice(1));
    assert.equal(hold.extras.weapon, kind);
    const bones = hold.extras.arm_bones.split(',');
    assert.equal(bones.length, 2);
    for (const b of bones) assert.ok(hold.channels.some(c => j.nodes[c.target.node].name === b && c.target.path === 'rotation'), b);
  }
});
test('every weapon model says which socket it goes in, how it sits there and which clip it attacks with', () => {
  const names = { sword: 'Slash', flail: 'Slash', bow: 'Shoot', crossbow: 'CrossbowShot', staff: 'Cast' };
  for (const w of WEAPONS.filter(w => !w.model.endsWith('sword.glb'))) {
    const { json: j } = glb(w.model.replace(/^assets\//, '').replace(/\.glb$/, ''));
    const node = j.nodes.find(n => n.name === w.id), e = node.extras;
    assert.equal(e.weapon, w.weapon.kind, w.id);
    assert.equal(e.attack_clip, names[w.weapon.kind]);
    assert.equal(e.socket, w.weapon.kind === 'bow' ? 'hand.L' : 'hand.R');
    assert.ok(Math.abs(Math.hypot(...e.mount_quat_gltf) - 1) < 1e-3, w.id);
    // (compressing gives a root's own mesh an unnamed node of its own: not a part)
    const parts = (node.children ?? []).map(c => j.nodes[c].name).filter(Boolean).sort();
    const balls = Array.from({ length: w.weapon.balls ?? 1 }, (_, i) => i ? `ball${i + 1}` : 'ball');
    const want = { bow: ['string'], crossbow: ['bolt', 'string'], flail: [...balls, 'chain', 'link'] }[w.weapon.kind] ?? [];
    if (w.weapon.kind === 'flail') {   // where its chains hang from, how long, and where each ball is from its chain's end
      assert.equal(e.anchor_gltf.length, 3); assert.ok(e.chain_length > 0.3 && e.link_pitch > 0, w.id);
      assert.equal(e.balls, w.weapon.balls ?? 1); assert.equal(e.ball_offsets_gltf.length, 3 * e.balls, w.id);
    }
    assert.deepEqual(parts, want.map(p => `${w.id}_${p}`), w.id);
  }
  for (const name of ['items/weapon_arrow', 'items/weapon_bolt']) assert.ok(glb(name).json.meshes.length, name);
});
test('every potion has a model on the floor; a flask also says how the fist holds it to throw', () => {
  for (const p of POTIONS) {
    const { json: j } = glb(p.model.replace(/^assets\//, '').replace(/\.glb$/, ''));
    const e = j.nodes.find(n => n.name === p.id).extras;
    assert.equal(e.attach, 'ground', p.id);
    if (p.use !== 'throw') { assert.equal(e.weapon, undefined, p.id); continue; }
    assert.equal(e.weapon, 'throw'); assert.equal(e.attack_clip, 'Throw'); assert.equal(e.socket, 'hand.R'); assert.equal(e.hold, 'throw');
    assert.ok(Math.abs(Math.hypot(...e.mount_quat_gltf) - 1) < 1e-3, p.id);
    assert.ok(e.mount_scale > 0.5 && e.mount_scale < 2 && Math.hypot(...e.mount_offset_gltf) < 0.6, p.id);
  }
});
test('worn and held things say where they sit and how the arm holds them, and the rig has those holds', () => {
  const { json: character } = glb('character');
  const sockets = { head: 'head', right: 'hand.R', left: 'hand.L' };
  assert.deepEqual([...new Set(WEARABLES.map(w => w.slot))].sort(), [...OUTFIT_SLOTS].sort());
  for (const w of WEARABLES) {
    const { json: j } = glb(w.model.replace(/^assets\//, '').replace(/\.glb$/, ''));
    const node = j.nodes.find(n => n.name === w.id), e = node.extras;
    assert.equal(e.category, w.category, w.id);
    assert.equal(e.slot, w.slot, w.id);
    assert.equal(e.socket, sockets[w.slot], w.id);
    assert.ok(Math.abs(Math.hypot(...e.mount_quat_gltf) - 1) < 1e-3, w.id);
    assert.equal(e.mount_offset_gltf.length, 3);
    assert.ok(Math.hypot(...e.mount_offset_gltf) < .5, 'close to the bone it sits on');
    if (w.slot === 'head') { assert.equal(e.hold, undefined, w.id); continue; }
    const clip = character.animations.find(a => a.extras?.hold === e.hold);
    assert.ok(clip, `${w.id}: a hold clip for ${e.hold}`);
    assert.equal(clip.name, 'Hold' + e.hold[0].toUpperCase() + e.hold.slice(1));
    assert.deepEqual(clip.extras.arm_bones.split(','), ['upper_arm', 'forearm'].map(b => `${b}.${e.socket.slice(-1)}`), w.id);
    if (w.glow) assert.ok(j.materials.some(m => m.name === 'Items_Facets'), `${w.id} has a part to glow`);
    if (e.float) assert.ok(e.float > 0 && e.float < .6);
  }
});
test('player climbing is a seamless in-place loop covering two ladder rungs', () => {
  const { json: j, floats, duration } = glb('character');
  const clip = j.animations.find(a => a.name === 'Climb');
  assert.ok(clip);
  assert.ok(Math.abs(duration(clip) - 1.2) < 1e-5);
  assert.ok(Math.abs(clip.extras.distance * CHAR_SCALE - 0.56) < 1e-6);
  assert.ok(Math.abs(clip.extras.speed * duration(clip) - clip.extras.distance) < 1e-6);
  const moving = new Set();
  for (const channel of clip.channels) {
    const sampler = clip.samplers[channel.sampler], a = j.accessors[sampler.output];
    const values = floats(sampler.output), n = a.type === 'VEC4' ? 4 : 3;
    const name = j.nodes[channel.target.node].name;
    for (let k = 0; k < n; k++) {
      assert.ok(Math.abs(values[k] - values[values.length - n + k]) < 1e-5, name + ' loop seam');
      const component = values.filter((_, i) => i % n === k);
      const span = Math.max(...component) - Math.min(...component);
      if (channel.target.path === 'rotation' && span > 0.1) moving.add(name);
      if (channel.target.path === 'translation') assert.ok(span < 0.05, name + ' must stay in place');
    }
  }
  for (const name of ['upper_arm.L', 'upper_arm.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']) {
    assert.ok(moving.has(name), name + ' must reach / step');
  }
});
test('spider has exactly walk, bite and a held 2-second death animation', () => {
  const { json: j, duration } = glb('spider');
  assert.deepEqual(j.animations.map(a => a.name).sort(), ['SpiderAttack', 'SpiderDeath', 'SpiderWalk']);
  const death = j.animations.find(a => a.name === 'SpiderDeath');
  assert.equal(death.extras.hold_last_frame, true);
  assert.ok(Math.abs(duration(death) - SPIDER.deathTime) < 1e-5);
});
test('Stunder timings and speeds match the four existing clips', () => {
  const { json: j, duration } = glb('stunder');
  assert.deepEqual(j.animations.map(a => a.name).sort(), ['StunderAttack', 'StunderDeath', 'StunderWalk', 'StunderWalkFast']);
  const a = Object.fromEntries(j.animations.map(a => [a.name, a]));
  assert.equal(a.StunderWalk.extras.speed, STUNDER.wander);
  assert.equal(a.StunderWalkFast.extras.speed, STUNDER.chase);
  assert.equal(a.StunderAttack.extras.hit_frame / 30, STUNDER.hitAt);
  assert.equal(a.StunderAttack.extras.attack_style, 'head_down');
  assert.ok(Math.abs(duration(a.StunderDeath) - STUNDER.deathTime) < 1e-5);
  assert.equal(a.StunderDeath.extras.hold_last_frame, true);
});
test('snake slithers at its wander speed, bites on the profile hit frame and holds its corpse', () => {
  const { json: j, duration } = glb('snake');
  assert.deepEqual(j.animations.map(a => a.name).sort(), ['SnakeAttack', 'SnakeDeath', 'SnakeWalk']);
  const a = Object.fromEntries(j.animations.map(a => [a.name, a]));
  assert.equal(a.SnakeWalk.extras.speed, SNAKE.wander);
  // the body wave travels one wavelength per loop: it stays put on the floor as the snake moves
  assert.ok(Math.abs(a.SnakeWalk.extras.wavelength - SNAKE.wander * duration(a.SnakeWalk)) < 1e-5);
  assert.equal(a.SnakeAttack.extras.hit_frame / 30, SNAKE.hitAt);
  assert.ok(Math.abs(duration(a.SnakeAttack) - SNAKE.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a.SnakeDeath) - SNAKE.deathTime) < 1e-5);
  assert.equal(a.SnakeDeath.extras.hold_last_frame, true);
});
test('Octonaut has a slap and a spin kick whose clips match the attack timings', () => {
  const { json: j, duration } = glb('octonaut');
  assert.deepEqual(j.animations.map(a => a.name).sort(), ['OctoDeath', 'OctoSlap', 'OctoSpin', 'OctoWalk']);
  const a = Object.fromEntries(j.animations.map(a => [a.name, a]));
  assert.equal(a.OctoWalk.extras.speed, OCTONAUT.wander);
  const [slap, spin] = OCTONAUT.attacks;
  for (const [clip, attack, style] of [[a.OctoSlap, slap, 'slap'], [a.OctoSpin, spin, 'spin_kick']]) {
    assert.equal(clip.extras.attack_style, style);
    assert.equal(clip.extras.hit_frame / 30, attack.hitAt);
    assert.ok(Math.abs(duration(clip) - attack.attackTime) < 1e-5);
  }
  assert.ok(Math.abs(duration(a.OctoDeath) - OCTONAUT.deathTime) < 1e-5);
  assert.equal(a.OctoDeath.extras.hold_last_frame, true);
  const legs = new Set(j.nodes.map(n => n.name).filter(n => /^leg\d_upper$/.test(n)));
  assert.equal(legs.size, 6);
  assert.ok(j.nodes.some(n => n.name === 'hand.L') && j.nodes.some(n => n.name === 'hand.R'));
});
test('the new enemies have shining purple eyes', () => {
  for (const name of ['snake', 'octonaut']) {
    const { json: j } = glb(name), eyes = j.materials.find(m => /Eyes_glow/.test(m.name));
    const [r, g, b] = eyes.emissiveFactor;
    assert.ok(b === 1 && r > 2 * g && b > r, name);
    assert.ok(eyes.extensions.KHR_materials_emissive_strength.emissiveStrength > 1, name);
  }
});
// clips by name, and the clip contract every enemy shares: an idle / walk loop at its
// wander speed, an attack whose hit frame and length match the profile, a held death
function enemyClips(name, profile, { walk, attack, death, fast }) {
  const { json: j, duration } = glb(name), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), [walk, attack, death, fast].filter(Boolean).sort());
  assert.equal(a[walk].extras.speed, profile.wander);
  assert.equal(a[walk].extras.loop, true);
  assert.equal(a[attack].extras.hit_frame / 30, profile.hitAt);
  assert.ok(Math.abs(duration(a[attack]) - profile.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a[death]) - profile.deathTime) < 1e-5);
  assert.equal(a[death].extras.hold_last_frame, true);
  return { j, a };
}
// a standalone, unskinned projectile mesh beside the rig
function projectileProp(j, name, kind) {
  const node = j.nodes.find(n => n.name === name);
  assert.ok(node && j.scenes[0].nodes.includes(j.nodes.indexOf(node)), name);
  assert.equal(node.skin, undefined); assert.ok(node.mesh !== undefined);
  assert.equal(node.extras.projectile, kind);
}
const glowing = j => j.materials.filter(m => /_glow/.test(m.name) && !/Eyes/.test(m.name)).map(m => [m.name, m.emissiveFactor]);
test('Fire-face hovers, spits its fireball from the profile muzzle and glows red and orange', () => {
  const { j, a } = enemyClips('fireface', FIREFACE, { walk: 'FireFloat', attack: 'FireAttack', death: 'FireDeath' });
  assert.equal(a.FireFloat.extras.hover, true); assert.equal(FIREFACE.hover, true);
  assert.deepEqual(a.FireAttack.extras.muzzle, [...FIREFACE.projectile.muzzle]);
  projectileProp(j, 'FireFaceBall', 'fireball');
  assert.ok(j.nodes.filter(n => /^flame\d_[ab]$/.test(n.name)).length >= 10, 'flickering flame tongues');
  const mats = glowing(j);
  assert.ok(mats.length >= 4);
  for (const [name, [r, g, b]] of mats) assert.ok(r === 1 && g < 0.4 && b < 0.05, name);   // red .. orange
});
test('Triangle hovers, punches with its inner triangles from the profile muzzle and glows purple', () => {
  const { j, a } = enemyClips('triangle', TRIANGLE, { walk: 'TriFloat', attack: 'TriPunch', death: 'TriDeath' });
  assert.equal(a.TriFloat.extras.hover, true); assert.equal(TRIANGLE.hover, true);
  assert.deepEqual(a.TriPunch.extras.muzzle, [...TRIANGLE.projectile.muzzle]);
  projectileProp(j, 'TrianglePunch', 'triangle_punch');
  for (const bone of ['body', 'ring', 'core']) assert.ok(j.nodes.some(n => n.name === bone), bone);
  const mats = glowing(j);
  assert.equal(mats.length, 3);
  for (const [name, [r, g, b]] of mats) assert.ok(b >= r && b > 3 * g, name);   // purple
});
test('Fire-cat prowls and gallops at its speeds, pounces over the profile window and is on fire', () => {
  const { j, a } = enemyClips('firecat', FIRECAT, { walk: 'CatWalk', fast: 'CatRun', attack: 'CatPounce', death: 'CatDeath' });
  assert.equal(a.CatRun.extras.speed, FIRECAT.chase);
  assert.equal(a.CatPounce.extras.lunge_from, FIRECAT.lunge.from);
  assert.equal(a.CatPounce.extras.lunge_to, FIRECAT.lunge.to);
  assert.ok(j.nodes.filter(n => /^flame_/.test(n.name)).length >= 9, 'flames on the tail, back and head');
  for (const bone of ['jaw', 'tail_5', 'upperarm.L', 'thigh.R']) assert.ok(j.nodes.some(n => n.name === bone), bone);
  const body = j.materials.find(m => m.name === 'FireCatBody').pbrMetallicRoughness.baseColorFactor;
  assert.ok(body[0] > 4 * body[1] && body[0] < 0.4, 'dark red');
  assert.ok(!j.materials.find(m => m.name === 'FireCatBody').emissiveFactor);
  for (const [name, [r, g, b]] of glowing(j).filter(([n]) => /Flame/.test(n))) assert.ok(r === 1 && g < 0.5 && b < 0.05, name);
});
test('Shraps pinches and throws on the profile timings, from the profile muzzle, and carries both heads', () => {
  const { json: j, duration } = glb('shraps');
  assert.deepEqual(j.animations.map(a => a.name).sort(), ['ShrapsDeath', 'ShrapsPinch', 'ShrapsThrow', 'ShrapsWalk']);
  const a = Object.fromEntries(j.animations.map(a => [a.name, a]));
  assert.equal(a.ShrapsWalk.extras.speed, SHRAPS.wander); assert.equal(a.ShrapsWalk.extras.loop, true);
  const [pinch, toss] = SHRAPS.attacks;
  for (const [clip, attack, style] of [[a.ShrapsPinch, pinch, 'pinch'], [a.ShrapsThrow, toss, 'throw']]) {
    assert.equal(clip.extras.attack_style, style);
    assert.equal(clip.extras.hit_frame / 30, attack.hitAt);
    assert.ok(Math.abs(duration(clip) - attack.attackTime) < 1e-5);
  }
  assert.deepEqual(a.ShrapsThrow.extras.muzzle, [...toss.projectile.muzzle]);
  assert.ok(Math.abs(duration(a.ShrapsDeath) - SHRAPS.deathTime) < 1e-5);
  assert.equal(a.ShrapsDeath.extras.hold_last_frame, true);
  projectileProp(j, 'ShrapsIceBall', 'iceball');
  for (const bone of ['head', 'claw.L', 'pincer.R', 'thigh.L', 'foot.R', 'charge']) assert.ok(j.nodes.some(n => n.name === bone), bone);
  assert.ok(j.nodes.filter(n => /^flame\d_[ab]$/.test(n.name)).length >= 10, 'flickering flame tongues on the fire head');
  // every material a kind hides or recolours is in the model, and each head is hidden by exactly one kind
  const names = new Set(j.materials.map(m => m.name));
  for (const k of [SHRAPS, FIRE_SHRAPS]) for (const m of [...k.hide, ...Object.values(k.parts).flat()]) assert.ok(names.has(m), m);
  assert.deepEqual([...SHRAPS.hide, ...FIRE_SHRAPS.hide].sort(), [...names].filter(n => /Ice|Fire|Flame/.test(n)).sort());
  const shell = j.materials.find(m => m.name === 'ShrapsShell').pbrMetallicRoughness.baseColorFactor;
  assert.ok(shell[2] > shell[1] && shell[1] > shell[0], 'light blue');
  for (const [name, [r, g, b]] of glowing(j).filter(([n]) => /Fire|Flame/.test(n))) assert.ok(r === 1 && g < 0.5 && b < 0.05, name);
});
test('Spicy rolls on wheels, backs off and fires its laser on the profile timings, from the profile muzzle', () => {
  const { j, a } = enemyClips('spicy', SPICY, { walk: 'SpicyRoll', attack: 'SpicyLaser', death: 'SpicyDeath' });
  const laser = a.SpicyLaser.extras;
  assert.equal(laser.attack_style, 'laser');
  assert.ok(Math.abs(laser.beam_frame / 30 - fireAt(SPICY)) < 1e-9, 'the beam shines for its time up to the burst');
  assert.deepEqual(laser.muzzle, [...SPICY.beam.muzzle]);
  assert.deepEqual([laser.retreat_from, laser.retreat_to, laser.retreat], [SPICY.retreat.from, SPICY.retreat.to, SPICY.retreat.dist]);
  assert.equal(a.SpicyRoll.extras.wheel_radius, SPICY.wheel);
  for (const bone of ['body', 'stalk0', 'stalk3', 'eye.L', 'eye.R', 'axle.L', 'wheel.L', 'wheel.R', 'arm_upper.L', 'hand.R'])
    assert.ok(j.nodes.some(n => n.name === bone), bone);
  // the game spins the wheels: no clip turns them
  const wheels = new Set(j.nodes.flatMap((n, i) => /^wheel\./.test(n.name) ? [i] : []));
  for (const clip of j.animations) for (const c of clip.channels) if (wheels.has(c.target.node) && c.target.path === 'rotation') {
    const q = glb('spicy').floats(clip.samplers[c.sampler].output);
    for (let i = 0; i < q.length; i += 4) assert.ok(Math.abs(Math.abs(q[i + 3]) - 1) < 1e-4, clip.name);
  }
  const body = j.materials.find(m => m.name === 'SpicyBody').pbrMetallicRoughness.baseColorFactor;
  assert.ok(body[1] > 0.6 && body[1] > 2 * body[0] && body[0] > body[2], 'toxic green');
  const [r, g, b] = j.materials.find(m => m.name === 'SpicyEyes_glow').emissiveFactor;
  assert.ok(r === 1 && g < 0.1 && b < 0.1, 'red eyes');
});
test('Wolk walks, strikes on the profile timings from the profile muzzle and can lose its limbs', () => {
  const { j, a } = enemyClips('wolk', WOLK, { walk: 'WolkWalk', attack: 'WolkZap', death: 'WolkDeath' });
  const zap = a.WolkZap.extras;
  assert.equal(zap.attack_style, 'lightning');
  assert.ok(Math.abs(zap.beam_frame / 30 - fireAt(WOLK)) < 1e-9, 'the spot shows for its time up to the strike');
  assert.deepEqual(zap.muzzle, [...WOLK.beam.muzzle]);
  const node = name => j.nodes.find(n => n.name === name), index = name => j.nodes.indexOf(node(name));
  for (const bone of ['body', 'eye.L', 'eye.R', 'thigh.L', 'shin.R', 'arm_upper.L', 'arm_lower.R', 'hand.L']) assert.ok(node(bone), bone);
  // the limbs hang from the root, not the cloud, so they can fall off and the cloud can squash
  const root = node('root');
  for (const limb of ['thigh.L', 'thigh.R', 'arm_upper.L', 'arm_upper.R']) assert.ok(root.children.includes(index(limb)), limb);
  assert.ok(!node('body').children?.some(i => /thigh|arm/.test(j.nodes[i].name)));
  // every material it recolours or darkens is in the model
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(WOLK.parts).flat()) assert.ok(names.has(m), m);
  for (const role of WOLK.gloom.parts) assert.ok(WOLK.parts[role], role);
  const cloud = j.materials.find(m => m.name === 'WolkCloud').pbrMetallicRoughness.baseColorFactor;
  assert.ok(cloud[2] > cloud[1] && cloud[1] > cloud[0] && cloud[0] > 0.3, 'light blue');
});
test('standalone sword is a small untextured, unskinned prop', () => {
  const { json: j } = glb('sword');
  assert.equal(j.meshes.length, 1);
  assert.equal(j.skins?.length || 0, 0);
  assert.equal(j.images?.length || 0, 0);
  assert.equal(j.animations?.length || 0, 0);
  const triangles = j.meshes[0].primitives.reduce((n, p) => n + j.accessors[p.indices].count / 3, 0);
  assert.ok(triangles < 500);
});

test('Gusto: his clips match his attacks, the grip and the muzzles come from them, and he flails eight tentacles', () => {
  const { json: j, duration } = glb('gusto'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['GustoBlow', 'GustoDeath', 'GustoFloat', 'GustoGrab', 'GustoInhale', 'GustoStuck', 'GustoSummon']);
  assert.equal(a.GustoFloat.extras.loop, true);
  assert.ok(Math.abs(duration(a.GustoDeath) - GUSTO.deathTime) < 1e-5); assert.equal(a.GustoDeath.extras.hold_last_frame, true);
  const clip = { grab: 'GustoGrab', summon: 'GustoSummon', blow: 'GustoBlow', inhale: 'GustoInhale', stuck: 'GustoStuck' };
  for (const at of GUSTO_SPLIT.attacks) {
    const x = a[clip[at.clip]].extras;
    if (at.exposed) assert.equal(x.exposed_end / 30, at.exposed.until, at.name);   // (no blow of its own)
    else assert.equal(x.hit_frame / 30, at.hitAt, at.name);
    assert.ok(Math.abs(duration(a[clip[at.clip]]) - at.attackTime) < 1e-5, at.name);
  }
  const pull = GUSTO.attacks.find(t => t.pull).pull, i = a.GustoInhale.extras;
  assert.deepEqual(i.muzzle, pull.muzzle);
  assert.ok(Math.abs((i.pull_end - i.hit_frame) / 30 - pull.time) < 1e-9);
  const grab = GUSTO.attacks.find(t => t.grab).grab, g = a.GustoGrab.extras;
  assert.equal(g.throw_frame / 30, grab.throwAt);
  assert.deepEqual(g.grip.map(p => p.map(v => Math.abs(v) < 1e-9 ? 0 : v)), grab.grip.map(p => p.map(v => v || 0)));
  assert.deepEqual(a.GustoSummon.extras.muzzle, GUSTO.attacks.find(t => t.summon).summon.muzzle);
  const vortex = GUSTO_SPLIT.attacks.find(t => t.gust).gust, b = a.GustoBlow.extras;
  assert.deepEqual(b.muzzle, vortex.muzzle);
  assert.equal(b.inhale_frame / 30, vortex.inhale);
  assert.ok(Math.abs((b.gust_end - b.hit_frame) / 30 - vortex.time) < 1e-9);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(GUSTO.parts).flat()) assert.ok(names.has(m), m);
  const tentacles = j.nodes.filter(n => /^tentacle\d+_\d+$/.test(n.name));
  assert.equal(tentacles.length, 24);
  const body = j.materials.find(m => m.name === 'GustoBody').pbrMetallicRoughness.baseColorFactor;
  assert.ok(Math.max(...body.slice(0, 3)) - Math.min(...body.slice(0, 3)) < 0.12 && body[0] > 0.45, 'white-grey');
  const eye = j.materials.find(m => m.name === 'GustoEyes_glow').emissiveFactor;
  assert.ok(eye[0] > 0.8 && eye[1] < 0.2, 'red eyes');
});

test('Totnar: his clips match his attacks, the throw, summon and storm points come from them, and he has what he sheds', () => {
  const { json: j, duration } = glb('totnar'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['TotnarDeath', 'TotnarDrift', 'TotnarGloom', 'TotnarRoll', 'TotnarStorm', 'TotnarSummon', 'TotnarThrow']);
  assert.equal(a.TotnarDrift.extras.loop, true);
  assert.ok(Math.abs(duration(a.TotnarDeath) - TOTNAR.deathTime) < 1e-5); assert.equal(a.TotnarDeath.extras.hold_last_frame, true);
  const clip = { throw: 'TotnarThrow', gloom: 'TotnarGloom', summon: 'TotnarSummon', roll: 'TotnarRoll', storm: 'TotnarStorm' };
  for (const at of TOTNAR.attacks) {
    const c = a[clip[at.clip]];
    assert.equal(c.extras.hit_frame / 30, at.hitAt, at.name);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.name);
  }
  const roll = TOTNAR.attacks.find(t => t.roll).roll, r = a.TotnarRoll.extras;
  assert.equal(r.roll_from / 30, roll.from); assert.equal(r.roll_to / 30, roll.to);
  assert.deepEqual(a.TotnarThrow.extras.muzzle, TOTNAR.attacks.find(t => t.projectile).projectile.muzzle);
  for (const t of TOTNAR.attacks.filter(t => t.summon)) assert.deepEqual(a.TotnarSummon.extras.muzzle, t.summon.muzzle);
  assert.deepEqual(a.TotnarStorm.extras.muzzle, TOTNAR.attacks.find(t => t.beam).beam.muzzle);
  const names = new Set(j.materials.map(m => m.name)), nodes = new Set(j.nodes.map(n => n.name));
  for (const m of Object.values(TOTNAR.parts).flat()) assert.ok(names.has(m), m);
  for (const b of ['brush', 'heart', 'held', ...Object.values(TOTNAR.shed).flat(), 'skull1']) assert.ok(nodes.has(b), b);
  const heart = j.materials.find(m => m.name === 'TotnarHeart_glow').emissiveFactor;
  assert.ok(heart[0] > 0.8 && heart[1] < 0.2, 'a red heart');
  const sticks = j.materials.find(m => m.name === 'TotnarSticks').pbrMetallicRoughness.baseColorFactor;
  assert.ok(sticks[0] > sticks[2] * 1.5, 'brown sticks');
});
test('Squarlo: his clips match his attacks in both his sizes, the jet, the cannon, the summon and the stomping foot come from them', () => {
  const { json: j, duration } = glb('squarlo'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['SquarloBlow', 'SquarloCannon', 'SquarloCast', 'SquarloDeath', 'SquarloJump', 'SquarloKick', 'SquarloRest',
    'SquarloRun', 'SquarloStomp', 'SquarloStride', 'SquarloSummon', 'SquarloSwim']);
  for (const loop of ['SquarloRun', 'SquarloSwim', 'SquarloStride']) assert.equal(a[loop].extras.loop, true, loop);
  assert.ok(Math.abs(duration(a.SquarloDeath) - SQUARLO.deathTime) < 1e-5); assert.equal(a.SquarloDeath.extras.hold_last_frame, true);
  const clip = { blow: 'SquarloBlow', cast: 'SquarloCast', summon: 'SquarloSummon', rest: 'SquarloRest', stomp: 'SquarloStomp',
    jump: 'SquarloJump', kick: 'SquarloKick', cannon: 'SquarloCannon' };
  for (const at of [...SQUARLO.attacks, ...SQUARLO_GIANT.attacks]) {
    const c = a[clip[at.clip]];
    if (c.extras.hit_frame !== undefined) assert.equal(c.extras.hit_frame / 30, at.hitAt, at.name);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.name);
  }
  const jet = SQUARLO.attacks.find(t => t.gust).gust, b = a.SquarloBlow.extras;
  assert.deepEqual(b.muzzle, jet.muzzle);
  assert.ok(Math.abs((b.gust_end - b.hit_frame) / 30 - jet.time) < 1e-9);
  assert.deepEqual(a.SquarloSummon.extras.muzzle, SQUARLO.attacks.find(t => t.summon).summon.muzzle);
  const k = SQUARLO_GIANT.size, near = (u, v) => u.every((x, i) => Math.abs(x - v[i]) < 1e-6);
  // the giant's water cannon blasts out of his hands, for as long as the clip says
  const cannon = SQUARLO_GIANT.attacks.find(t => t.name === 'cannon').gust, c = a.SquarloCannon.extras;
  assert.ok(near(cannon.muzzle, c.muzzle.map(v => v * k)), 'the cannon from his hands');
  assert.ok(Math.abs((c.gust_end - c.hit_frame) / 30 - cannon.time) < 1e-9);
  // the stomp's shadow is where the foot comes down (the beam's muzzle, grown with him)
  const stomp = SQUARLO_GIANT.attacks.find(t => t.name === 'stomp'), foot = a.SquarloStomp.extras.foot;
  assert.ok(Math.abs(stomp.beam.muzzle[0] - foot[0] * k) < 1e-6 && Math.abs(stomp.beam.muzzle[2] - foot[2] * k) < 1e-6);
  assert.equal(a.SquarloStomp.extras.planted_until / 30, stomp.exposed.until);
  // he springs off when the jump says, and lands on the hit frame
  const jump = SQUARLO_GIANT.attacks.find(t => t.name === 'jump');
  assert.equal(a.SquarloJump.extras.takeoff / 30, jump.jump.from);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(SQUARLO.parts).flat()) assert.ok(names.has(m), m);
  const body = j.materials.find(m => m.name === 'SquarloBody').pbrMetallicRoughness.baseColorFactor;
  assert.ok(body[1] > body[0] * 2 && body[2] > body[0] * 2, 'teal');
  // smaller than the player, a giant of six cells
  assert.ok(SQUARLO.height < 0.85 && Math.abs(SQUARLO_GIANT.height - 6) < 1e-9);
});
test('Flip: his clips match his attacks, the ball and the Sky wollas come from his rings, the rings turn', () => {
  const { json: j, duration } = glb('flip'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['FlipDeath', 'FlipFlip', 'FlipHole', 'FlipHover', 'FlipSummon', 'FlipThrow']);
  assert.equal(a.FlipHover.extras.loop, true);
  assert.ok(Math.abs(duration(a.FlipDeath) - FLIP.deathTime) < 1e-5); assert.equal(a.FlipDeath.extras.hold_last_frame, true);
  const clip = { throw: 'FlipThrow', flip: 'FlipFlip', hole: 'FlipHole', summon: 'FlipSummon' };
  for (const at of FLIP.attacks) {
    const c = a[clip[at.clip]];
    assert.equal(c.extras.hit_frame / 30, at.hitAt, at.name);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.name);
  }
  for (const at of FLIP.attacks.filter(t => t.projectile)) assert.deepEqual(a.FlipThrow.extras.muzzle, at.projectile.muzzle);
  assert.deepEqual(a.FlipSummon.extras.muzzle, FLIP.attacks.find(t => t.summon).summon.muzzle);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(FLIP.parts).flat()) assert.ok(names.has(m), m);
  const rings = j.materials.find(m => m.name === 'FlipRings_glow').pbrMetallicRoughness.baseColorFactor;
  assert.ok(rings[2] > rings[0] * 2 && rings[1] > rings[0], 'light blue');
  // three rings, each a bone the game turns (render/enemies.js spinRings), and the ball he throws
  for (const k of [0, 1, 2]) assert.ok(j.nodes.some(n => n.name === `ring${k}`), `ring${k}`);
  assert.ok(j.nodes.some(n => n.name === 'FlipBall'));
});
test('Foggery: a frog and his ball, his clips match his attacks, his eyes thrown from his hands', () => {
  const { json: j, duration } = glb('foggery'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['FoggeryCats', 'FoggeryDeath', 'FoggeryEyeL', 'FoggeryEyeR', 'FoggeryFloat', 'FoggeryGeyser',
    'FoggerySpit', 'FoggerySummon', 'FoggeryWalk']);
  assert.equal(a.FoggeryWalk.extras.loop, true); assert.equal(a.FoggeryFloat.extras.loop, true);
  assert.ok(Math.abs(duration(a.FoggeryDeath) - FOGGERY.deathTime) < 1e-5); assert.equal(a.FoggeryDeath.extras.hold_last_frame, true);
  const clip = { eyeL: 'FoggeryEyeL', eyeR: 'FoggeryEyeR', summon: 'FoggerySummon', spit: 'FoggerySpit', geyser: 'FoggeryGeyser', cats: 'FoggeryCats' };
  for (const at of [...FOGGERY.attacks, ...FOGGERY_BALL.attacks]) {
    const c = a[clip[at.clip]];
    assert.equal(c.extras.hit_frame / 30, at.hitAt, at.name);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.name);
    if (at.projectile) assert.deepEqual(c.extras.muzzle, at.projectile.muzzle, at.name);
    if (at.summon) assert.deepEqual(c.extras.muzzle, at.summon.muzzle, at.name);
  }
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(FOGGERY.parts).flat()) assert.ok(names.has(m), m);
  const body = j.materials.find(m => m.name === 'FoggeryBody').pbrMetallicRoughness.baseColorFactor;
  const eyes = j.materials.find(m => m.name === 'FoggeryEyes_glow').pbrMetallicRoughness.baseColorFactor;
  assert.ok(body[0] > 0.6 && body[0] > body[1] * 2 && body[1] > body[2], 'orange red'); assert.ok(eyes[0] > eyes[2] * 3 && eyes[1] > eyes[2] * 2, 'yellow eyes');
  // his forms and his eyes are bones the game scales (render/foggeryview.js), and the eye he throws
  for (const n of ['frog', 'ball', 'eye.L', 'eye.R', 'FoggeryEye']) assert.ok(j.nodes.some(o => o.name === n), n);
  // on fire: flames on bones of their own off his eyes (and round his ball), which the game flickers
  assert.ok(['L', 'R'].every(s => j.nodes.some(o => o.name === `flame_eye${s}`)) && j.nodes.filter(o => /^flame_ball/.test(o.name)).length >= 6);
  // a little taller than the player
  assert.ok(FOGGERY.height > CHAR_SCALE * 2 && FOGGERY.height < 2);
});
test('the Squirtle sways, spits from its beak at its hit frame and wilts', () => {
  const { json: j, duration } = glb('squirtle'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['SquirtleDeath', 'SquirtleSpit', 'SquirtleSway']);
  assert.equal(a.SquirtleSway.extras.loop, true);
  assert.equal(a.SquirtleSpit.extras.hit_frame / 30, SQUIRTLE.hitAt);
  assert.ok(Math.abs(duration(a.SquirtleSpit) - SQUIRTLE.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a.SquirtleDeath) - SQUIRTLE.deathTime) < 1e-5);
  assert.deepEqual(a.SquirtleSpit.extras.muzzle, SQUIRTLE.projectile.muzzle);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(SQUIRTLE.parts).flat()) assert.ok(names.has(m), m);
  assert.ok(j.nodes.some(n => n.name === 'SquirtleDrop'));
});
test('the Mecked waddles, bites and grabs on its attacks\' timings, and holds what it grabs along its clip', () => {
  const { json: j, duration } = glb('mecked'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['MeckedBite', 'MeckedDeath', 'MeckedGrab', 'MeckedWalk']);
  assert.equal(a.MeckedWalk.extras.loop, true); assert.equal(a.MeckedWalk.extras.speed, MECKED.wander);
  const bite = MECKED.attacks.find(t => t.name === 'bite'), grab = MECKED.attacks.find(t => t.grab), g = grab.grab;
  assert.equal(a.MeckedBite.extras.hit_frame / 30, bite.hitAt);
  assert.ok(Math.abs(duration(a.MeckedBite) - bite.attackTime) < 1e-5);
  const x = a.MeckedGrab.extras;
  assert.equal(x.hit_frame / 30, grab.hitAt); assert.equal(x.release_frame / 30, g.throwAt);
  assert.deepEqual(x.bite_frames.map(f => f / 30), g.bites);
  assert.ok(Math.abs(duration(a.MeckedGrab) - grab.attackTime) < 1e-5);
  // where it holds you: off the clip, between its hands, every `step` from the catch to the release
  assert.deepEqual(x.grip, g.grip);
  assert.equal(g.grip.length, Math.round((g.throwAt - grab.hitAt) / g.step) + 1);
  for (const [gx, up, ahead] of g.grip) assert.ok(gx === 0 && up > 0.5 && up < 1 && ahead > MECKED.radius && ahead < grab.hitReach, 'held up in front of it');
  assert.ok(g.bites.every(t => t > grab.hitAt && t < g.throwAt), 'it bites while it holds you');
  assert.ok(Math.abs(duration(a.MeckedDeath) - MECKED.deathTime) < 1e-5); assert.equal(a.MeckedDeath.extras.hold_last_frame, true);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(MECKED.parts).flat()) assert.ok(names.has(m), m);
  for (const bone of ['jaw', 'ear.L', 'ear_tip.R', 'hand.L', 'tail_1', 'tail_8']) assert.ok(j.nodes.some(n => n.name === bone), bone);
});
test('the Tornado shuffles, spins up its twisters over its hands, rides them and topples over', () => {
  const { json: j, duration } = glb('tornado'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['TornadoCast', 'TornadoDeath', 'TornadoHop', 'TornadoSlam', 'TornadoWalk']);
  assert.equal(a.TornadoWalk.extras.loop, true); assert.equal(a.TornadoWalk.extras.speed, TORNADO.wander);
  const [twin, hop, slam] = TORNADO.attacks, x = a.TornadoCast.extras;
  assert.equal(x.hit_frame / 30, twin.hitAt); assert.equal(x.form_frame / 30, twin.twister.form);
  assert.ok(Math.abs(duration(a.TornadoCast) - twin.attackTime) < 1e-5);
  // the twisters leave from over its hands as the clip has them at the fling
  assert.deepEqual(x.hands, twin.twister.hands);
  for (const [clip, at] of [['TornadoHop', hop], ['TornadoSlam', slam]]) {
    const c = a[clip].extras;
    assert.equal(c.hit_frame / 30, at.hitAt, clip); assert.equal(c.ride_frame / 30, at.ride.from, clip);
    assert.ok(Math.abs(duration(a[clip]) - at.attackTime) < 1e-5, clip);
  }
  assert.ok(Math.abs(duration(a.TornadoDeath) - TORNADO.deathTime) < 1e-5); assert.equal(a.TornadoDeath.extras.hold_last_frame, true);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(TORNADO.parts).flat()) assert.ok(names.has(m), m);
  // the skirts turn (render/enemies.js waves), and the tips of its hands are where twisters stand
  for (const bone of ['wave0', 'wave1', 'head', 'tip.L', 'tip.R', 'leg.FL', 'leg.BR']) assert.ok(j.nodes.some(n => n.name === bone), bone);
  assert.ok(j.nodes.some(n => n.name === 'TornadoTwister'));
});
test('the Slug crawls, spits from its mouth at its hit frame and sags flat', () => {
  const { json: j, duration } = glb('slug'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['SlugCrawl', 'SlugDeath', 'SlugSpit']);
  assert.equal(a.SlugCrawl.extras.loop, true); assert.equal(a.SlugCrawl.extras.speed, SLUG.wander);
  assert.equal(a.SlugSpit.extras.hit_frame / 30, SLUG.hitAt);
  assert.ok(Math.abs(duration(a.SlugSpit) - SLUG.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a.SlugDeath) - SLUG.deathTime) < 1e-5); assert.equal(a.SlugDeath.extras.hold_last_frame, true);
  assert.deepEqual(a.SlugSpit.extras.muzzle, SLUG.projectile.muzzle);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(SLUG.parts).flat()) assert.ok(names.has(m), m);
  for (const bone of ['tail', 'head', 'stalk.L', 'stalk.R', 'leg.FL', 'leg.BR']) assert.ok(j.nodes.some(n => n.name === bone), bone);
  assert.ok(j.nodes.some(n => n.name === 'SlugBall'));
});
test('the Bolime hops, pounces on its attack\'s timings (the leap, the landing, the spitting out) and melts', () => {
  const { json: j, duration } = glb('bolime'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['BolimeDeath', 'BolimeHop', 'BolimePounce']);
  assert.equal(a.BolimeHop.extras.loop, true); assert.equal(a.BolimeHop.extras.speed, BOLIME.wander);
  const [pounce] = BOLIME.attacks, x = a.BolimePounce.extras;
  assert.equal(x.hit_frame / 30, pounce.hitAt); assert.equal(x.ride_frame / 30, pounce.ride.from);
  assert.equal(x.release_frame / 30, pounce.engulf.release);
  assert.ok(Math.abs(duration(a.BolimePounce) - pounce.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a.BolimeDeath) - BOLIME.deathTime) < 1e-5); assert.equal(a.BolimeDeath.extras.hold_last_frame, true);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of [...Object.values(BOLIME.parts).flat(), ...BOLIME.shell.parts]) assert.ok(names.has(m), m);
  for (const bone of ['body', 'top', 'core', 'stalk.L', 'stalk.R']) assert.ok(j.nodes.some(n => n.name === bone), bone);
});
test('Slomo: three shapes in one model, his clips match his attacks, his slugs thrown from his arms\' ends', () => {
  const { json: j, duration } = glb('slomo'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['SlomoArmL', 'SlomoArmR', 'SlomoCrawl', 'SlomoDeath', 'SlomoFlood', 'SlomoFloodSlug', 'SlomoJump',
    'SlomoMeteor', 'SlomoMeteorLegs', 'SlomoMeteorSlug', 'SlomoOoze', 'SlomoSpit', 'SlomoStride', 'SlomoSummon']);
  for (const n of ['SlomoOoze', 'SlomoStride', 'SlomoCrawl']) assert.equal(a[n].extras.loop, true, n);
  assert.ok(Math.abs(duration(a.SlomoDeath) - SLOMO.deathTime) < 1e-5); assert.equal(a.SlomoDeath.extras.hold_last_frame, true);
  const clip = { armL: 'SlomoArmL', armR: 'SlomoArmR', meteor: 'SlomoMeteor', spit: 'SlomoSpit', summon: 'SlomoSummon', meteorSlug: 'SlomoMeteorSlug',
    floodSlug: 'SlomoFloodSlug' };
  for (const at of [...SLOMO.attacks, ...SLOMO_SLUG.attacks]) {
    const c = a[clip[at.clip]];
    assert.ok(c, at.clip);
    assert.equal(c.extras.hit_frame / 30, at.hitAt, at.clip);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.clip);
    if (at.projectile) assert.deepEqual(c.extras.muzzle, at.projectile.muzzle, at.clip);
    if (at.summon) assert.deepEqual(c.extras.muzzle, at.summon.muzzle, at.clip);
    if (at.rain) assert.deepEqual(c.extras.muzzle, at.rain.muzzle, at.clip);
  }
  // his gait's pace: the feet that are down sweep back as fast as he goes (blender/slomo.py)
  assert.ok(a.SlomoCrawl.extras.speed >= SLOMO_SLUG.chase * 0.9);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of [...Object.values(SLOMO.parts).flat(), ...SLOMO.shell.parts]) assert.ok(names.has(m), m);
  const skin = j.materials.find(m => m.name === 'SlomoSkin').pbrMetallicRoughness.baseColorFactor;
  assert.ok(skin[1] > skin[0] && skin[1] > skin[2] * 3, 'lime green');
  // his shapes and his arms' slugs are bones the game scales and blends (render/slomoview.js), and the slug he throws
  for (const n of ['blob', 'body', 'top', 'core', 'slug', 'slug.head', 'hand.L', 'hand.R', 'arm.L.1', 'leg.1L', 'leg.3R', 'antenna.L', 'SlomoArmSlug'])
    assert.ok(j.nodes.some(o => o.name === n), n);
});
test('Mansk: a mask with horns, his clips match his attacks, his mouth, horns and ribbons\' stumps where the game takes them', () => {
  const { json: j, duration } = glb('mansk'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['ManskBreak', 'ManskDeath', 'ManskHover', 'ManskInhale', 'ManskLash', 'ManskOrbs', 'ManskRise',
    'ManskSlow', 'ManskSpit', 'ManskSummon', 'ManskWhirl']);
  assert.equal(a.ManskHover.extras.loop, true);
  assert.ok(Math.abs(duration(a.ManskDeath) - MANSK.deathTime) < 1e-5); assert.equal(a.ManskDeath.extras.hold_last_frame, true);
  const clip = { inhale: 'ManskInhale', spit: 'ManskSpit', orbs: 'ManskOrbs', summon: 'ManskSummon', slow: 'ManskSlow', lash: 'ManskLash', whirl: 'ManskWhirl' };
  for (const at of new Set([...MANSK.attacks, ...MANSK_SKY.attacks, ...MANSK_RIBBONS.attacks])) {
    const c = a[clip[at.clip]];
    assert.ok(c, at.clip);
    if (c.extras.hit_frame !== undefined) assert.equal(c.extras.hit_frame / 30, at.hitAt, at.clip);
    assert.ok(Math.abs(duration(c) - at.attackTime) < 1e-5, at.clip);
    if (at.pull) { assert.deepEqual(c.extras.muzzle, at.pull.muzzle); assert.ok(Math.abs(c.extras.pull_end / 30 - at.hitAt - at.pull.time) < 1e-9); }
    if (at.summon) assert.deepEqual(c.extras.muzzle, at.summon.muzzle);
    if (at.orb) { assert.deepEqual(c.extras.tips, at.orb.tips); assert.deepEqual(c.extras.diamond, at.orb.diamond); }
    if (at.grab) {
      assert.deepEqual(c.extras.grip, at.grab.grip, at.clip);
      assert.equal(c.extras.throw_frame / 30, at.grab.throwAt, at.clip);
      assert.deepEqual(c.extras.bites, at.grab.bites, at.clip);
    }
  }
  assert.equal(a.ManskBreak.extras.break_time, MANSK_FIGHT.breakAt);
  assert.equal(a.ManskDeath.extras.flat_frame, 34, 'he lies flat where render/manskview.js slaps him down (FLAT)');
  const names = new Set(j.materials.map(m => m.name));
  for (const m of [...Object.values(MANSK.parts).flat(), 'ManskEyes', 'ManskMouth']) assert.ok(names.has(m), m);
  const color = n => j.materials.find(m => m.name === n).pbrMetallicRoughness.baseColorFactor;
  const [hr, hg, hb] = color('ManskHead'), [br, bg, bb] = color('ManskHorns'), [dr, , db] = color('ManskDiamond_glow');
  assert.ok(hr > 0.8 && hg > 0.8 && hb > 0.8, 'a white mask');
  assert.ok(br > bb * 1.3 && br > 0.5, 'beige horns'); assert.ok(db > dr * 3, 'a blue diamond');
  // the bones the game scales (the horns broken), reads (the stumps the ribbons come out of) and opens (his mouth)
  for (const n of ['body', 'mouth', 'horn.L.0', 'horn.L.1', 'horn.R.3', 'stump.L', 'stump.R', 'tip.L', 'tip.R']) assert.ok(j.nodes.some(o => o.name === n), n);
});
test('the snapping skull hops, bites at its hit frame and crumbles', () => {
  const { json: j, duration } = glb('snapskull'), a = Object.fromEntries(j.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(a).sort(), ['SnapBite', 'SnapDeath', 'SnapHop']);
  assert.equal(a.SnapHop.extras.loop, true);
  assert.equal(a.SnapBite.extras.hit_frame / 30, SNAP_SKULL.hitAt);
  assert.ok(Math.abs(duration(a.SnapBite) - SNAP_SKULL.attackTime) < 1e-5);
  assert.ok(Math.abs(duration(a.SnapDeath) - SNAP_SKULL.deathTime) < 1e-5);
  const names = new Set(j.materials.map(m => m.name));
  for (const m of Object.values(SNAP_SKULL.parts).flat()) assert.ok(names.has(m), m);
});
