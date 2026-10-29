// The free camera's shots, kept out of the way (a boss's intro, game/bossintro.js; the story's
// scenes, game/scene.js). A shot's keys are points on named anchors in a frame (core/bossintro.js
// shotAt, shotFrame, shotPoint); before a scene starts, each key's camera is moved out of what is
// in the way of what it looks at (clearShots), and where the way from one key to the next would go
// through something, it cuts instead (cutWhereBlocked).
import { N, LH } from '../core/constants.js';
import { shotAt, shotPoint } from '../core/bossintro.js';
import { viewBlockedAt } from '../core/blockers.js';
import { WALLED } from './camera.js';
import { state } from './state.js';
import { insideSolid, cellAt } from '../physics/collide.js';
import { standingAt } from '../physics/fluid.js';

// Each key's camera out of the way: where it is (at the key's moment: anchorsAt(t), the anchors
// where they are then) inside something, under a fluid, outside the cube, or with something between
// it and what it looks at, it is moved round what it looks at (TRIES: the nearest first: a little
// round, further or closer, higher), to the first place that is clear. None clear: as it was (the
// camera then keeps in front of what is in the way, game/camera.js). Keys on the anchor 'hero' are
// not scaled by the frame's k; an anchor not there falls back to `spot`, else `hero`.
const TRIES = (() => {
  const out = [];
  for (const turn of [0, 20, -20, 40, -40, 65, -65, 90, -90, 120, -120, 150, -150, 180])
    for (const far of [1, 0.85, 1.2, 0.7, 1.45, 0.55])
      for (const up of [0, 0.8, 1.6, 2.6, 4])
        out.push({ turn: turn * Math.PI / 180, far, up, cost: Math.abs(turn) / 25 + Math.abs(Math.log(far)) * 4 + up * 0.7 });
  return out.sort((a, b) => a.cost - b.cost);
})();
export function clearShots(keys, frame, anchorsAt) {
  const { f, r: right, k } = frame;
  return cutWhereBlocked(keys.map(key => {
    const anchors = anchorsAt(key.t), look = shotPoint(frame, anchors, key.look);
    const cam = shotPoint(frame, anchors, key.cam), dx = cam[0] - look[0], dz = cam[2] - look[2];
    const o = anchors[key.cam[0]] ?? anchors.spot ?? anchors.hero;
    const kk = key.cam[0] === 'hero' ? 1 : k;
    for (const { turn, far, up } of TRIES) {
      const c = Math.cos(turn), s = Math.sin(turn);
      const p = [look[0] + (dx * c - dz * s) * far, cam[1] + up, look[2] + (dx * s + dz * c) * far];
      if (!clearView(p, look)) continue;
      if (!turn && far === 1 && !up) return key;
      // (back into the key's terms: round its anchor, in the frame)
      const ox = p[0] - o.x, oz = p[2] - o.z;
      return { ...key, cam: [key.cam[0], (ox * f[0] + oz * f[1]) / kk, (ox * right[0] + oz * right[1]) / kk, (p[1] - o.y) / kk] };
    }
    return key;
  }), frame, anchorsAt);
}
// Where the camera's way from one key to the next would go into something (or under a fluid), or
// lose sight of what it looks at for a while (a tower between), it cuts to the next key instead.
export function cutWhereBlocked(keys, frame, anchorsAt) {
  const STEPS = 10;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (keys[i + 1].cut) continue;
    let hidden = 0;
    for (let n = 1; n < STEPS; n++) {
      const t = keys[i].t + (keys[i + 1].t - keys[i].t) * n / STEPS;
      const shot = shotAt(keys, t, frame, anchorsAt(t)), [x, y, z] = shot.cam;
      const inside = insideSolid(x, z, y) || viewBlockedAt(state.map, x, y, z) || underFluid(x, y, z);
      hidden = clearView(shot.cam, shot.look) ? 0 : hidden + 1;
      if (inside || hidden >= 3) { keys[i + 1] = { ...keys[i + 1], cut: true }; break; }
    }
  }
  return keys;
}
// a camera at p looking at `at`: in the cube (off the walls round it), out of every solid (a little round it too) and over
// every fluid, with nothing between
export function clearView(p, at) {
  const m = state.map, [x, y, z] = p;
  const edge = m.walled ? WALLED : 0.4;
  if (x < edge || z < edge || x > N - edge || z > N - edge || underFluid(x, y, z)) return false;
  for (const [dx, dy, dz] of [[0, 0, 0], [0.35, 0, 0], [-0.35, 0, 0], [0, 0, 0.35], [0, 0, -0.35], [0, 0.35, 0], [0, -0.35, 0]])
    if (insideSolid(x + dx, z + dz, y + dy) || viewBlockedAt(m, x + dx, y + dy, z + dz)) return false;
  const len = Math.hypot(x - at[0], y - at[1], z - at[2]);
  for (let s = 0.3; s < len; s += 0.12) {
    const k = s / len, px = at[0] + (x - at[0]) * k, py = at[1] + (y - at[1]) * k, pz = at[2] + (z - at[2]) * k;
    if (insideSolid(px, pz, py) || viewBlockedAt(m, px, py, pz)) return false;
  }
  return true;
}
// is (x, y, z) in a fluid, or just over it (a standing one too: a boss's tide, Foggery's lava)?
export function underFluid(x, y, z) {
  const s = standingAt(x, z);
  if (s && y < s.y + 0.35) return true;
  const i = cellAt(x, z);
  return i >= 0 && state.map.cols[i].some(f => f.fluid && y < f.surf * LH + 0.35 && y > f.top * LH - 1);
}
