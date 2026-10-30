// What the cutaway needs to know about a map: clean cut heights just under each upper layer,
// the slabs (free-standing upper-layer floors) with their height bands, and the "no cut"
// height above everything.
import { LH } from '../core/constants.js';

export function mapInfo(m) {
  if (!m.cutInfo) {
    // just below the lowest underside of each upper layer (pools are cut below their bed; not a
    // roof over a cave carved under it, cubegen/grotto.js: that is a slab of its own, below)
    const bases = m.B.slice(1).map((b, i) => {
      let lo = b - 2;
      for (const f of m.floors) if (f.layer === i + 1 && !f.roof) lo = Math.min(lo, f.merged ? Infinity : f.bottom, f.fluid ? f.top - 1 : Infinity);
      return lo * LH - 0.02;
    });
    const slabs = m.floors.filter(f => (f.layer > 0 || f.roof) && !f.merged && !f.ramp)   // (and tunnel roofs)
      .map(f => ({ x: f.x + 0.5, z: f.z + 0.5, lo: f.bottom * LH - 0.02, hi: f.top * LH + 0.05 }));
    const terrainTop = Math.max(...m.floors.map(f => f.top)) * LH;
    const propTop = Math.max(terrainTop, ...(m.occluders || []).map(b => b.top));
    m.cutInfo = { bases, slabs, top: propTop + 0.8 };
  }
  return m.cutInfo;
}

// a slab near the character (only those can show in the cut circle) that height c would slice
const slabAt = (m, c, p) => mapInfo(m).slabs.find(s => c > s.lo + 0.01 && c < s.hi
  && Math.abs(s.x - p.x) < 3.5 && Math.abs(s.z - p.z) < 3.5);
export const inSlab = (m, c, p) => !!slabAt(m, c, p);

// move cut height g out of nearby slabs: just over a slab if that still clears the blocker
// (need), else just under it if that stays above our feet (floor); null if neither works
export function outOfSlabs(m, g, floor, need, p) {
  for (let i = 0; i < 6; i++) {
    const s = slabAt(m, g, p);
    if (!s) return g;
    if (s.hi <= need) g = s.hi; else if (s.lo >= floor) g = s.lo; else return null;
  }
  return null;
}
