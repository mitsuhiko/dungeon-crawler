// Rare doors behind ordinary clear-water falls. Placement never changes terrain or routing:
// only an already reachable, dry, head-clear doorstep under the overhang is eligible.
import { N, LH, DIRS, CHAR_R, CHAR_H, STEP, WATER } from '../core/constants.js';
import { hash32 } from '../core/util.js';
import { floorY } from '../core/surfaces.js';
import { containsXZ } from '../core/blockers.js';
import { doorArrival } from '../core/doors.js';

const PREFIX = 'interior:waterfall:';
export const waterfallRoomKey = outside => PREFIX + outside;
export const waterfallOutside = key => typeof key === 'string'
  ? /^interior:waterfall:(-?\d+,-\d+,-?\d+)$/.exec(key)?.[1] ?? null : null;

function dryFootprint(m, x, y, z) {
  const r = CHAR_R + 0.03;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    const px = x + dx, pz = z + dz;
    if (px < 1 || pz < 1 || px >= N - 1 || pz >= N - 1) return false;
    const c = Math.floor(pz) * N + Math.floor(px), col = m.cols[c];
    const f = col.find(f => !f.fluid && Math.abs(floorY(f, px % 1, pz % 1) - y) < STEP * 0.8);
    if (!f || !m.safe?.[f.id]) return false;
    const h = floorY(f, px % 1, pz % 1);
    if (col.some(g => g !== f && g.bottom * LH > h && g.bottom * LH < h + CHAR_H + 0.25)) return false;
    if (m.pieces[c]?.length) return false;
    if ((m.staticBlockers?.[c] ?? []).some(b => b.top > h + 0.05 && b.bottom < h + CHAR_H && containsXZ(b, px, pz, 0.03))) return false;
  }
  return true;
}

export function waterfallDoors(m) {
  const candidates = [];
  for (const fall of m.falls ?? []) {
    if (fall.type !== WATER || fall.in || fall.out || fall.top - fall.bot < 4) continue;
    const [nx, nz] = DIRS[fall.d];
    for (const across of [0, -1, 1]) for (const back of [1, 2]) {
      const x = fall.c % N - nx * back - nz * across, z = Math.floor(fall.c / N) - nz * back + nx * across;
      if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
      for (const f of m.cols[z * N + x]) {
        const y = floorY(f, 0.5, 0.5);
        if (f.fluid || y < fall.bot * LH - 0.15 || y + 1.65 > fall.top * LH) continue;
        const door = { id: 'waterfall', building: 'waterfall:' + m.key, to: waterfallRoomKey(m.key),
          x: x + 0.5 - nx * 0.55, z: z + 0.5 - nz * 0.55, nx, nz, y, w: 1, layer: f.layer, waterfall: true };
        const at = doorArrival(door);
        if (dryFootprint(m, x + 0.5, y, z + 0.5) && dryFootprint(m, at.x, at.y, at.z))
          candidates.push({ door, fall, width: 2.2 + Math.abs(across) * 2 });
      }
    }
  }
  return candidates;
}

export function addWaterfallHideout(m) {
  if (m.depth <= 0 || m.town || m.merchantCamp || m.interior || m.testRoom || m.guardian || m.trial || m.doors?.length) return m;
  // Independent of generator retry RNG: no rerolling ordinary rooms, enemies or rewards.
  if (hash32(m.seed ^ 0x7a7ef411) % 3 !== 0) return m;
  const choice = waterfallDoors(m)[0];
  if (choice) {
    choice.fall.width = choice.width;
    const f = choice.fall, [nx, nz] = DIRS[f.d];
    // The curtain itself is the entrance, rather than a wooden door on the dry ledge.
    Object.assign(choice.door, { x: f.c % N + 0.5 - nx * 0.4,
      z: Math.floor(f.c / N) + 0.5 - nz * 0.4, y: f.bot * LH - 0.5, w: choice.width * 0.7, swim: true });
    m.doors = [choice.door];
  }
  return m;
}
