// Cube archetypes: the big shape of a cube, applied on top of the blended ground. The shaping
// fades out towards the faces (the outer ring stays as the face profiles say), and void is only
// used where the world allows it; otherwise pits and seas hold the depth's fluid instead.
//   plain       nothing extra
//   chasm       a deep, winding split across the cube with raised rims (void or fluid)
//   spire       a tall needle of rock on a raised base
//   sinkhole    a round pit in the middle, rim raised
//   archipelago islands in void (or in a sea)
//   mesa        one big flat-topped block
//   crater      a ring wall around a lake
// and the big height pieces (cubegen/heights.js): ascent, plateau, descent, pinnacle; the large
// areas (cubegen/areas.js): spiral, and the hairpin's foot, turn and summit; the set pieces
// (cubegen/setpieces.js): peak, lake; a trial room (cubegen/trials/); then the basin under a great shaft and a tunnel
// (cubegen/tunnel.js) where the spec asks for them
import { N, MAX_L, at16, count16 } from '../core/constants.js';
import { idx, clamp } from '../core/util.js';
import { shapeGorge, shapeIsland } from './span.js';
import { shapeAscent, shapePlateau, shapeDescent, shapePinnacle, shapeShaftBottom } from './heights.js';
import { carveTunnel } from './tunnel.js';
import { shapeSpiral, shapeFoot, shapeTurn, shapeSummit } from './areas.js';
import { shapePeak, shapeLake } from './setpieces.js';
import { shapeTrial } from './trials/index.js';

const PIECES = { ascent: shapeAscent, plateau: shapePlateau, descent: shapeDescent, pinnacle: shapePinnacle,
  spiral: shapeSpiral, foot: shapeFoot, turn: shapeTurn, summit: shapeSummit, peak: shapePeak, lake: shapeLake };

// 0 at the faces, 1 from three cells in
const inner = (x, z) => clamp((Math.min(x, z, N - 1 - x, N - 1 - z) - 1) / 2, 0, 1);

export function shapeCube(ctx) {
  ctx.seaCells = []; ctx.keep = new Set(); ctx.soft = new Set(); ctx.roofs = new Map(); ctx.noCross = new Set(); ctx.pinnacle = new Set(); ctx.rails = new Set();
  ctx.ramp = new Set(); ctx.railed = new Set(); ctx.peakTop = new Set(); ctx.islet = new Set(); ctx.foot = new Set();
  shapeArchetype(ctx);
  if (ctx.spec.shaftBottom) shapeShaftBottom(ctx);
  if (ctx.spec.tunnel) carveTunnel(ctx);
}

function shapeArchetype(ctx) {
  const { R, ri, lvl0, void0, spec, noise } = ctx, kind = spec.archetype || 'plain';
  if (kind === 'gorge') return shapeGorge(ctx);   // a span's valley (cubegen/span.js)
  if (kind === 'island') return shapeIsland(ctx);
  if (kind === 'trial') return shapeTrial(ctx);   // a trial room (cubegen/trials/)
  if (PIECES[kind]) return PIECES[kind](ctx);
  // open: void if allowed, else a pit (sea: filled with fluid)
  const open = (i, sea) => { if (spec.voidOK) void0[i] = 1; else { lvl0[i] = 0; if (sea) ctx.seaCells.push(i); } };
  const raise = (i, w, h) => { lvl0[i] = clamp(Math.round(lvl0[i] + w * h), 2, MAX_L); };
  const each = fn => { for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) fn(x, z, idx(x, z), inner(x, z)); };

  if (kind === 'chasm') {
    const alongX = R() < 0.5, c0 = at16(5 + R() * 5), w = 1 + R() * 1.2, ph = R() * 6;
    each((x, z, i, w0) => {
      const u = alongX ? x : z, v = alongX ? z : x, mid = c0 + Math.sin(u * 0.45 + ph) * 1.6;
      const d = Math.abs(v + 0.5 - mid);
      if (d < w && w0 >= 1) open(i, true);   // void, or a gorge with the depth's fluid
      else if (d < w + 2.2) raise(i, w0, 4);
    });
  } else if (kind === 'spire') {
    const cx = at16(5 + R() * 6), cz = at16(5 + R() * 6), r = 1.2 + R() * 0.9, top = ri(18, MAX_L);
    each((x, z, i, w0) => {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d < r) lvl0[i] = Math.round(lvl0[i] + (top - lvl0[i]) * w0);
      else if (d < r + 2) raise(i, w0, 3);
    });
  } else if (kind === 'sinkhole') {
    const cx = at16(6.5 + R() * 3), cz = at16(6.5 + R() * 3), r = at16(2.4 + R() * 1.6);
    each((x, z, i, w0) => {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) + (noise(x * 0.9, z * 0.9) - 0.5) * 0.8;
      if (d < r && w0 >= 1) open(i, true);
      else if (d < r + 1.6) raise(i, w0, 2);
    });
  } else if (kind === 'archipelago') {
    const off = R() * 50;
    each((x, z, i, w0) => { if (w0 >= 1 && noise(x * 0.35 + off, z * 0.35 - off) < 0.47) open(i, true); });
  } else if (kind === 'mesa') {
    const cx = at16(5 + R() * 6), cz = at16(5 + R() * 6), hx = at16(3 + R() * 2), hz = at16(3 + R() * 2), h = ri(6, 10);
    each((x, z, i, w0) => {
      const dx = Math.abs(x + 0.5 - cx) / hx, dz = Math.abs(z + 0.5 - cz) / hz;
      if (dx ** 4 + dz ** 4 + (noise(x * 0.7 + 20, z * 0.7) - 0.5) * 0.6 < 1) raise(i, w0, h);
    });
  } else if (kind === 'crater') {
    const cx = at16(6.5 + R() * 3), cz = at16(6.5 + R() * 3), r = at16(3 + R() * 1.5), h = ri(5, 8);
    each((x, z, i, w0) => {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d < r - 0.4 && w0 >= 1) { lvl0[i] = 0; ctx.seaCells.push(i); }
      else if (d < r + 1.8) raise(i, w0, h * (1 - Math.abs(d - r - 0.6) / 2.4));
    });
  }
  // caves: a few rock columns from the floor up into the dark (the ceiling is implied)
  if (spec.cave) for (let n = ri(1, count16(3)); n > 0; n--) {
    const cx = at16(4 + R() * 8), cz = at16(4 + R() * 8), r = 0.7 + R() * 0.6;
    each((x, z, i) => { if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) { lvl0[i] = MAX_L; void0[i] = 0; } });
  }
  ctx.stats.mode = spec.kind + ' / ' + kind;
}
