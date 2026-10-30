// What lies on each face between two cubes. Side faces carry the ground profile along the face
// (both cubes blend their edge into it), an optional river crossing and an optional portal.
// Vertical faces only carry a portal (a well below, a ring above). A face is decided once,
// by whichever of its two cubes gets prepared first; its layout comes from the face's own
// random stream, so it does not depend on who decided it.
import { parse, step, faceKey } from './coords.js';
import { profile, caveWall, VOID } from './profile.js';
import { cascade } from './cascades.js';
import { spout } from './spouts.js';
import { spanFace } from './spans.js';
import { areaPad, isInnerFace } from './areas.js';
import { isTown, townExitPosition } from './town.js';
import { MAX_DEPTH } from '../themes/depth.js';
import { trialPortalLayer, trialPortalPos } from './trials.js';
import { BOSS_ARENAS } from '../core/bosses.js';

export const LAYER_BASE = [0, 10, 16, 22];   // the levels of the world-wide layers

const guardOf = (world, k) => {
  const d = -parse(k)[1];
  if (d < 0 || d > MAX_DEPTH) return null;
  return world.layout(d).guardians.get(k) ?? null;
};
const guarded = (world, k) => !!guardOf(world, k);
// a boss's arena may want its doorway higher up, and in the middle of the face (core/bosses.js
// BOSS_ARENAS: Foggery's, over his lava)
const doorOf = (world, k, d) => [guardOf(world, k), guardOf(world, step(k, d))].map(g => g?.role === 'descent' && BOSS_ARENAS[g.boss]).find(a => a?.door);

// learn: world.html#faces (see learn/README.md)
function sideFace(world, k, d, withPortal) {
  const fk = faceKey(k, d), R = world.wfc.rng(fk, 0x51de);
  const sock = world.wfc.tiles.get(k).sock[d];
  const f = { sock, profile: profile(world, fk, sock), river: null, portal: null };
  const guardian = guarded(world, k) || guarded(world, step(k, d));
  if (sock === 'W' && !guardian) {   // the crossing is never open to the depth below
    f.river = { pos: 4 + Math.floor(R() * 7), w: R() < 0.5 ? 2 : 3 };
    // ground under the crossing and a bank on either side of it (never water next to the void)
    for (let t = f.river.pos - 1; t <= f.river.pos + f.river.w; t++) if (f.profile[t] === VOID) f.profile[t] = 3;
  }
  // the faces inside a large area (areas.js) are never walled: once both sides are visited and the
  // face opens, the area reads as one place (until then it is a face like any other, a portal on it)
  const wall = () => isInnerFace(world, fk) ? null : caveWall(world, fk, f);
  if (!withPortal) { f.spout = guardian ? null : spout(world, fk, f, LAYER_BASE); f.wall = wall(); return f; }
  // (the town's gate: where its street meets the face)
  const townDir = isTown(k, world.seed) ? d : isTown(step(k, d), world.seed) ? d ^ 1 : null;
  let pos;
  if (townDir !== null) pos = townExitPosition(townDir);
  else do pos = 3 + Math.floor(R() * 10); while (f.river && Math.abs(pos - f.river.pos - (f.river.w - 1) / 2) < 3.5);
  if (spanFace(world, fk)?.kind === 'cross') pos = spanFace(world, fk).span.pos;   // one straight bridge
  pos = areaPad(world, fk)?.pos ?? pos;   // where a large area's ramp or ridge meets the face
  pos = trialPortalPos(world, fk) ?? pos;   // where a trial room's shape wants it (a sunken room's, world/trials.js)
  const own = guardian ? doorOf(world, k, d) : null;
  if (own?.centre) pos = own.centre;
  // the portal's layer: any layer both cubes have, mostly the highest one (sky routes)
  const maxL = Math.min(world.wfc.tiles.get(k).K, world.wfc.tiles.get(step(k, d)).K) - 1;
  const layer = guardian ? 0 : trialPortalLayer(world, fk, maxL) ?? (maxL > 0 && R() < 0.5 ? maxL : Math.floor(R() * (maxL + 1)));
  let level = LAYER_BASE[layer];
  if (!layer) {   // a flat pad of three cells at the highest ground level around it
    level = guardian ? own?.door ?? 4 : Math.max(4, f.profile[pos - 1], f.profile[pos], f.profile[pos + 1]);   // never void
    for (let t = pos - 1; t <= pos + 1; t++) f.profile[t] = level;
  }
  f.portal = { pos, layer, level };
  f.spout = guardian ? null : spout(world, fk, f, LAYER_BASE);
  f.wall = wall();
  return f;
}

function verticalFace(world, k, d, withPortal) {
  const fk = faceKey(k, d), R = world.wfc.rng(fk, 0xd0e);
  return { vertical: true, portal: withPortal ? { x: 4 + Math.floor(R() * 8), z: 4 + Math.floor(R() * 8) } : null,
    fall: guarded(world, k) || guarded(world, step(k, d)) ? null : cascade(world, d === 4 ? k : step(k, 5)) };   // a fall through it (cascades.js)
}

// faces follow the depth's layout (layout.js): side portals where it links two cubes, the
// well down / the ring up at the ends of its spine
export function decideFaces(world, k) {
  const L = world.layout(-parse(k)[1]);
  for (let d = 0; d < 6; d++) {
    const fk = faceKey(k, d);
    if (world.faces.has(fk)) continue;
    if (d < 4) world.faces.set(fk, sideFace(world, k, d, L.portals.has(fk)));
    else world.faces.set(fk, verticalFace(world, k, d, d === 4 ? L.down === k : L.up === k));
  }
}
