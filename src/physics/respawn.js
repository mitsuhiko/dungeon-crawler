// Respawns need a dry, supported body footprint, unlike live airborne boundary crossings.
import { N, STEP } from '../core/constants.js';
import { topOf } from '../core/surfaces.js';
import { player, state } from '../game/state.js';
import { groundAt, blockedAt } from './collide.js';
import { townPadIn, PAD_RADIUS } from '../core/townportal.js';

// (x, y, z) if a body can stand there: on dry, supported ground, off the portals
export function supportedPoint(x, y, z) {
  const g = groundAt(x, z, y + 0.05, 0);
  if (!Number.isFinite(g.h) || g.h < -1.5 || !g.s || g.s.fluid) return null;
  // Do not respawn on a vertical portal (or the town portal) and immediately travel again.
  if (state.map.portals.some(p => (p.kind === 'up' || p.kind === 'down')
    && Math.abs(g.h - p.y) < 0.6 && Math.hypot(x - p.x - 0.5, z - p.z - 0.5) < 0.55)) return null;
  const pad = townPadIn(state.map, state.run);
  if (pad && Math.abs(g.h - pad.y) < 0.6 && Math.hypot(x - pad.x, z - pad.z) < PAD_RADIUS + 0.1) return null;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
    [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]]) {
    const px = x + dx * player.r, pz = z + dz * player.r;
    const rim = groundAt(px, pz, g.h, STEP);
    if (!rim.s || rim.s.fluid || Math.abs(rim.h - g.h) > STEP || blockedAt(px, pz, g.h, STEP)) return null;
  }
  return { x, y: g.h, z };
}

export function respawnPoint(point) {
  const x = Number.isFinite(point?.x) ? point.x : N / 2;
  const z = Number.isFinite(point?.z) ? point.z : N / 2;
  const y = Number.isFinite(point?.y) ? point.y : 0;
  const original = supportedPoint(x, y, z);
  if (original) return original;
  let best = null, distance = Infinity;
  // Include every layer and walkable structure, not just the highest floor in a column.
  // (not into a hidden cave, cubegen/grotto.js, but from inside it)
  for (const s of [...state.map.floors.filter(f => !f.grotto), ...state.map.pieces.flat().filter(p => p.kind !== 'pillar')]) {
    const px = s.c % N + 0.5, pz = Math.floor(s.c / N) + 0.5;
    const candidate = supportedPoint(px, topOf(s, 0.5, 0.5), pz);
    if (!candidate) continue;
    const d = (candidate.x - x) ** 2 + (candidate.y - y) ** 2 + (candidate.z - z) ** 2;
    if (d < distance) { best = candidate; distance = d; }
  }
  if (!best) throw new Error('No dry, supported respawn point in this cube');
  return best;
}
