import { MAX_DEPTH } from '../../src/themes/depth.js';

// every cube of world w (on the depths given, all of them by default): { d, k, m }
export function* cubesOf(w, depths = Array.from({ length: MAX_DEPTH + 1 }, (_, d) => d)) {
  for (const d of depths) for (const k of w.layout(d).exists) yield { d, k, m: w.cube(k).map };
}
