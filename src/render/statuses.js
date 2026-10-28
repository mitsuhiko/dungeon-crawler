// Statuses that show (core/status.js): enemies on fire lick with flames, poisoned ones (and the
// poisoned player) seep green bubbles and a sickly mist, chilled ones glitter with frost and
// zapped ones crackle with sparks (enchanted weapons, game/enchants.js); slowed ones (and the
// slowed player: slime, core/status.js) drip with green goo (Sollmeldon's mud: black, `source`
// 'mud'); what Mansk's slowed time holds (his
// Tornados, the player: game/mansk.js) has slow sparkles of light circling round it, like the
// hands of a clock. The player's own burning is
// render/burning.js, its chill render/chilled.js, its shock render/shocked.js.
import { glow, soft, emit, rand, ring } from './particles.js';
import { player } from '../game/state.js';
import { FIRE_COLORS } from './flames.js';
import { chillFactor } from '../core/projectiles.js';

const FLAMES = FIRE_COLORS, GREENS = ['#c8ff7a', '#8fdc3c', '#5f9f2a'], FROST = ['#ffffff', '#d8f4ff', '#9fdcff'],
  SPARKS = ['#ffffff', '#fff3a0', '#9fd0ff'], GOO = ['#8ae048', '#6cc23a', '#b8ff5a'], MUD = ['#2a231d', '#17130f', '#3a3129'], TIME = ['#ffffff', '#bfe0ff', '#ffe9a8'];

function flames(x, y, z, r, h, dt) {
  for (let i = Math.floor(70 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.05, h), z + dz, { v: [dx * 0.8, rand(0.8, 1.6), dz * 0.8], spread: 0.3, life: rand(0.25, 0.4),
      size: rand(0.08, 0.15), grow: -0.5, color: FLAMES[i % 4], gravity: -2, drag: 1 });
  }
}
function poison(x, y, z, r, h, dt) {
  for (let i = Math.floor(18 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.1, h), z + dz, { v: [0, rand(0.3, 0.7), 0], spread: 0.1, life: rand(0.4, 0.7), size: rand(0.04, 0.08),
      color: GREENS[i % 3], alpha: 0.85, drag: 1 });
  }
  if (Math.random() < 5 * dt) {
    const [dx, dz] = ring(r * 0.7);
    emit(soft, x + dx, y + rand(0.2, h), z + dz, { v: [0, rand(0.1, 0.3), 0], spread: 0.15, life: rand(0.7, 1), size: rand(0.2, 0.3),
      grow: 0.6, color: '#6fae2a', alpha: 0.25, drag: 0.6 });
  }
}

function frost(x, y, z, r, h, dt) {
  for (let i = Math.floor(30 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.05, h), z + dz, { v: [dx * 0.3, rand(-0.3, 0.1), dz * 0.3], spread: 0.1, life: rand(0.4, 0.7),
      size: rand(0.05, 0.09), color: FROST[i % 3], gravity: 0.6, drag: 1.5 });
  }
}
function sparks(x, y, z, r, h, dt) {
  for (let i = Math.floor(50 * dt + Math.random()); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(glow, x + dx, y + rand(0.05, h), z + dz, { v: [rand(-1.5, 1.5), rand(-0.5, 1.5), rand(-1.5, 1.5)], life: rand(0.06, 0.14),
      size: rand(0.04, 0.08), color: SPARKS[i % 3], drag: 4 });
  }
}

// slime: goo dripping off the body, the more the slower it still is (k: 0..1)
function goo(x, y, z, r, h, dt, k = 1, colors = GOO) {
  for (let i = Math.floor(14 * k * dt + Math.random() * k); i > 0; i--) {
    const [dx, dz] = ring(r);
    emit(soft, x + dx, y + rand(0.2, h), z + dz, { v: [dx * 0.2, rand(-0.4, 0), dz * 0.2], life: rand(0.5, 0.8), size: rand(0.06, 0.11),
      color: colors[i % 3], alpha: 0.85, gravity: 5 });
  }
}

// time slowed round it: sparkles going slowly round it at two heights, trailing
let clockT = 0;
function clockwork(x, y, z, r, h, dt, k = 1) {
  for (let i = Math.floor(30 * k * dt + Math.random() * k); i > 0; i--) {
    const a = clockT * 1.6 * (i % 2 ? 1 : -1) + Math.random() * 0.6 + (i % 3) * 2.1, rr = r + 0.25;
    emit(glow, x + Math.cos(a) * rr, y + (i % 2 ? 0.35 : 0.85) * h, z + Math.sin(a) * rr, { v: [-Math.sin(a) * 0.3, 0.05, Math.cos(a) * 0.3],
      life: rand(0.5, 0.9), size: rand(0.04, 0.08), color: TIME[i % 3], alpha: 0.9, drag: 1 });
  }
}

export function tickStatuses(enemies, dt) {
  if (dt <= 0) return;
  clockT += dt;
  for (const e of enemies) {
    if (e.mode !== 'dead' && e.warp < 1) clockwork(e.x, e.y, e.z, e.profile.radius * 0.8, e.profile.bodyHeight, dt);
    if (e.mode === 'dead' || (!e.burning && !e.toxic && !e.chilled && !e.slowed && !(e.zapped > 0))) continue;
    const r = e.profile.radius * 0.8, h = e.profile.bodyHeight;
    if (e.burning) flames(e.x, e.y, e.z, r, h, dt);
    if (e.toxic) poison(e.x, e.y, e.z, r, h, dt);
    if (e.chilled) frost(e.x, e.y, e.z, r, h, dt);
    if (e.zapped > 0) sparks(e.x, e.y, e.z, r, h, dt);
    if (e.slowed) goo(e.x, e.y, e.z, r, h, dt, 1, e.slowed.source === 'mud' ? MUD : GOO);
  }
  if (player.toxic && !player.ragdoll) poison(player.x, player.visY, player.z, 0.25, 1, dt);
  const s = player.slowed;
  if (s && !player.ragdoll) (s.source === 'time' ? clockwork : goo)(player.x, player.visY, player.z, 0.25, 1.1, dt, (1 - chillFactor(s)) / (1 - s.slow || 1),
    s.source === 'mud' ? MUD : GOO);
}
