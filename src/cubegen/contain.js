// Every fluid is walled in: whatever lies next to it reaches its surface, except where it
// spills on purpose (falls). Otherwise water would stand in the air with its sides showing.
import { N, DIRS } from '../core/constants.js';
import { idx, inb } from '../core/util.js';
import { fallCells } from '../core/falls.js';

const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;

// Ground stage: a cell next to the water that is open (void) or lower than the surface is
// raised into a bank. Where it cannot be (the outer ring follows the shared face profiles,
// portal pads, lower water), the water cell itself becomes the bank. spill: fall cells.
export function bankGround(ctx, spill = new Set()) {
  const { lvl0, void0, fluid0, surf0, prot0 } = ctx;
  for (let changed = true, guard = 0; changed && guard < 8; guard++) {
    changed = false;
    for (let i = 0; i < N * N; i++) {
      if (!fluid0[i] || spill.has(i)) continue;
      const x = i % N, z = (i / N) | 0, S = surf0[i];
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, n = idx(nx, nz);
        if (!inb(nx, nz) || spill.has(n)) continue;
        if (fluid0[n] ? surf0[n] >= S : !void0[n] && lvl0[n] >= S) continue;   // it holds
        if (!fluid0[n] && inner(nx, nz) && !prot0[n]) { void0[n] = 0; lvl0[n] = S + 1; changed = true; continue; }
        if (inner(x, z) && !prot0[i]) { fluid0[i] = 0; surf0[i] = 0; lvl0[i] = S + 1; changed = true; break; }
      }
    }
  }
}

// After all fluids exist (before routing): a fluid floor whose neighbour does not reach its
// surface becomes ground up to where the water stood. Catches what later stages did to the
// banks (stream channels cut next to pools, lowered patches) and the upper layers.
export function containFluids(ctx) {
  const { cols } = ctx, spill = new Set((ctx.falls || []).flatMap(fallCells));
  const holds = (n, S) => cols[n].some(h => h.bottom <= S - 0.25 && (h.fluid ? h.surf : h.top) >= S);
  for (let changed = true, guard = 0; changed && guard < 8; guard++) {
    changed = false;
    for (const col of cols) for (const f of col) {
      if (!f.fluid || spill.has(f.c)) continue;
      const leaks = DIRS.some(([dx, dz]) => {
        const x = f.x + dx, z = f.z + dz;
        if (!inb(x, z)) return false;   // the face: the neighbour cube matches it
        const n = idx(x, z);
        return !spill.has(n) && !holds(n, f.surf);
      });
      if (!leaks) continue;
      f.fluid = 0; f.top = f.surf; f.surf = 0;
      changed = true;
    }
  }
}
