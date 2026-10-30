// What the world around the player sounds like, set every frame (audio/loops.js): water,
// waterfalls, lava and acid by how close the nearest is (falls carry further), wind under an
// open sky by the depth and the height, cave air and drips below ground. Also the two drones:
// the charge of a well, ring or the town portal pad, and the cast of the town portal scroll.
import { N, LH, CUBE_H, WATER, LAVA, ACID } from '../core/constants.js';
import { player, state } from './state.js';
import { fallShift } from '../core/falls.js';
import { themeOf } from '../themes/depth.js';
import { portalChargeDuration } from './portals.js';
import { setAmbience, setDrone, drip, pop } from '../audio/loops.js';
import { sfx } from '../audio/sfx.js';

const WIND = { meadow: 0.3, peaks: 0.7, badlands: 0.45, clouds: 0.65, lagoon: 0.4, karst: 0.3,
  highlands: 0.75, saltflats: 0.5, darkforest: 0.12, slime: 0.2, swamp: 0.15, cenote: 0.2, forge: 0.25 };   // under an open sky; others 0.3 (the forest: still)
const DRIPS = { roots: 0.6, frozen: 0.9, nests: 0.3, mines: 0.4, ruins: 0.5, volcanic: 0.1, abyss: 0.25,
  grotto: 0.9, hive: 0.4, ossuary: 0.3 };   // per second
const KIND = { [WATER]: 'water', [LAVA]: 'lava', [ACID]: 'acid' };

let sources = null, sourcesOf = null, charging = null, last = {};
export const ambienceLevels = () => last;   // checks and the dev tools

// the fluid surfaces and falls of a map: [{ x, y, z, kind, fall }]
function soundSources(m) {
  if (sourcesOf === m) return sources;
  sourcesOf = m; sources = [];
  for (const f of m.floors) if (f.fluid) sources.push({ x: f.x + 0.5, y: f.surf * LH, z: f.z + 0.5, kind: KIND[f.fluid], fall: false });
  for (const f of m.falls || []) {
    const [sx, sz] = fallShift(f), x = f.c % N + 0.5 + sx, z = ((f.c / N) | 0) + 0.5 + sz;
    sources.push({ x, y: (f.top + f.bot) / 2 * LH, z, kind: KIND[f.type], fall: true });
  }
  return sources;
}

const falloff = (d, near, far) => { const t = Math.min(1, Math.max(0, (far - d) / (far - near))); return t * t; };

export function updateAmbience(dt) {
  const m = state.map, p = player;
  if (!m) return;
  const theme = themeOf(m), levels = { water: 0, falls: 0, lava: 0, acid: 0, wind: 0, cave: 0 };
  for (const s of soundSources(m)) {
    const d = Math.hypot(s.x - p.x, (s.y - p.y) * 0.5, s.z - p.z);
    if (s.fall && s.kind === 'water') levels.falls = Math.max(levels.falls, falloff(d, 1.5, 12));
    else levels[s.kind] = Math.max(levels[s.kind], falloff(d, 1, s.fall ? 11 : 8));
  }
  if (theme.cave) {
    levels.cave = 0.6;
    if (Math.random() < (DRIPS[theme.props] ?? 0.3) * dt) drip(0.4 + Math.random() * 0.6);
  } else levels.wind = (WIND[theme.props] ?? 0.3) * (0.7 + 0.3 * Math.min(1, Math.max(0, p.y / CUBE_H)));
  if (levels.lava > 0.05 && Math.random() < 3 * levels.lava * dt) pop(levels.lava);
  setAmbience(last = levels);
  drones();
}

function drones() {
  // the charge rises in pitch as it fills; stepping off before it fills fizzles
  const c = !state.transitioning && state.portalCharge, kind = c && (c.id === 'town' ? 'town' : state.map.portals.find(q => q.id === c.id)?.kind);
  if (c && kind) {
    const f = Math.min(1, c.t / portalChargeDuration(kind)), base = kind === 'up' ? 330 : kind === 'down' ? 196 : 262;
    setDrone('charge', 1, base * (1 + f));
    charging = f;
  } else {
    if (charging !== null && charging < 0.9 && !state.transitioning) sfx('fizzle', { volume: 0.4 });
    setDrone('charge', 0); charging = null;
  }
  const cast = state.cast;
  setDrone('cast', cast ? 0.8 : 0, cast ? 294 * (1 + cast.t / cast.duration) : 294);
}
