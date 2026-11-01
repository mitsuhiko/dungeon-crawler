// Walkable surface heights shared by the generator, physics and rendering.

// A floor is a solid slab in one column: solid from `bottom` up to its smoothed top.
// The top of a cell is two triangles (`split` picks the diagonal); rendering uses the
// exact same triangles. (fx, fz) are local coordinates in [0,1].
// A cut cell (`cut`, cubegen/cuts.js, core/cuts.js): a straight line through the cell parts off
// a piece of it, `cut.part`, the ground beyond the line (its own corners `cs` and diagonal), so
// that a cliff or a shore runs at an angle through cells instead of round them.
export const inCut = (f, fx, fz) => !!f.cut && f.cut.n[0] * fx + f.cut.n[1] * fz > f.cut.c;
// the height of corners cs (diagonal `split`) at (fx, fz)
export function cornersY(cs, split, fx, fz) {
  const c00 = cs[0], c10 = cs[1], c01 = cs[2], c11 = cs[3];
  if (!split) {
    if (fx >= fz) return c00 + (c10 - c00) * fx + (c11 - c10) * fz;
    return c00 + (c11 - c01) * fx + (c01 - c00) * fz;
  }
  if (fx + fz <= 1) return c00 + (c10 - c00) * fx + (c01 - c00) * fz;
  return c11 + (c01 - c11) * (1 - fx) + (c10 - c11) * (1 - fz);
}
export function floorY(f, fx, fz) {
  if (f.cut && inCut(f, fx, fz)) f = f.cut.part;
  return cornersY(f.cs, f.split, fx, fz);
}
// what of floor f lies at (fx, fz): f, or its cut part
export const partAt = (f, fx, fz) => f.cut && inCut(f, fx, fz) ? f.cut.part : f;

// Height of a stair / bridge / landing piece: linear along the whole run, plank bridges sag.
export function runY(p, fx, fz) {
  const r = p.run;
  if (r.kind === 'landing') return r.y0;
  const t = p.dx > 0 ? fx : p.dx < 0 ? 1 - fx : p.dz > 0 ? fz : 1 - fz;
  const T = (p.j + t) / r.k;
  return r.y0 + (r.y1 - r.y0) * T - r.sag * Math.sin(Math.PI * T);
}

export const topOf = (s, fx, fz) => s.kind ? runY(s, fx, fz) : floorY(s, fx, fz);
