// A quiet old hideout, using the ordinary house interior, stairs, doors and reward-site chest.
import { N, LH } from '../core/constants.js';
import { hash32 } from '../core/util.js';
import { indexBlockers } from '../core/blockers.js';
import { propMetadata } from '../core/propcatalog.js';
import { generateInterior, interiorLayout } from './interior.js';

const HIDEOUT = { name: 'waterfall_hideout', body: { x: 0, w: 2.5, d: 2.7 }, door: { x: 0 }, upper: 'loft' };
const THEMES = [
  ['mines_crystal_cluster_a', 'mines_crystal_cluster_b', 'mines_lantern_a'],
  ['swamp_glow_mushroom_a', 'swamp_glow_mushroom_b', 'mines_lantern_b'],
  ['meadow_fern_a', 'meadow_fern_b', 'mines_lantern_a'],
];
export function generateWaterfallRoom(spec, outside, entry) {
  const facing = [entry.nx, entry.nz], L = interiorLayout(HIDEOUT, facing);
  const m = generateInterior(spec, facing, HIDEOUT), y = m.doors[0].y;
  m.depth = outside.depth; m.biome = outside.biome;
  m.waterfallRoom = true; m.interior.outside = outside.key;
  Object.assign(m.doors[0], { to: outside.key, building: entry.building });
  const palette = THEMES[hash32(spec.seed) % THEMES.length];
  const prop = (name, u, v, height = y, s = 1) => {
    const [x, z] = L.at(u, v); return { name, x, y: height, z, yaw: 0, s };
  };
  m.authoredProps = [prop(palette[0], 1.2, L.D - 2, y, 1.6), prop(palette[1], L.W - 2, L.D - 2, y, 1.4),
    prop(palette[2], 1.1, L.D - 1), prop(palette[0], 1.4, 1.4, L.level * LH, 1.8),
    prop(palette[1], L.W - 2.5, 1.4, L.level * LH, 1.5)];
  const [x, z] = L.at(L.W / 2, L.D / 2 + 1), [ax, az] = L.at(L.W / 2, L.D / 2 + 2);
  const floor = m.cols[Math.floor(z) * N + Math.floor(x)].find(f => f.layer === 0);
  const access = m.cols[Math.floor(az) * N + Math.floor(ax)].find(f => f.layer === 0);
  m.rewardSites = [{ id: `${outside.key}:waterfall:${spec.seed}`, seed: hash32(spec.seed ^ 0x51e7),
    prestige: 'uncommon', biome: m.biome, setting: 'alcove', form: 'alcove', encounter: null, spawn: 'treasure', layer: 0,
    cells: [floor.c], anchor: { x, y, z, yaw: Math.atan2(entry.nx, entry.nz) }, floor: floor.id,
    accessFloor: access.id, entryFloor: access.id, exitFloor: access.id, approach: { x: ax, y, z: az } }];
  const site = m.rewardSites[0], chest = propMetadata.get('treasure_chest'), s = 0.8;
  m.authoredProps.push({ name: 'treasure_chest', ...site.anchor, s, site: site.id });
  m.staticBlockers = m.blockers = indexBlockers([...new Set(m.staticBlockers.flat()),
    { x, z, r: chest.radius * s, bottom: y, top: y + chest.maxY * s }]);
  m.stats.mode = 'waterfall hideout'; m.stats.sites = 1;
  return m;
}
