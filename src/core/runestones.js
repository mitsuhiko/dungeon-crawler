// Rune stones (docs/map.md): pure rules, no game state. Every depth but the town's has up to
// RUNESTONES (world/spots.js plans them, cubegen/spots.js places each in its cube: map.spots, kind
// 'runestone'). Pressed once, a stone wakes for good, for everyone in the world (run.runes, its
// spot id; saved with the world, core/save.js, and sent to friends, net/session.js `rune`), and
// from then on the map (game/mappanel.js) travels to it from anywhere it can be left
// (game/runestones.js travelBlock).
import { keyOfSpot } from './npcs.js';
import { RUNESTONES } from '../world/spots.js';

export { RUNESTONES };
export const RUNE_REACH = 1.5;   // how near the stone you press it (cells: from its middle; it stands in the way)
// a cube's placed rune stones
export const runestonesIn = map => (map?.spots ?? []).filter(s => s.kind === 'runestone' && s.anchor);
// the cube a rune stone stands in, and its depth (from its id: '<seed>:<cube>:spot:<n>')
export const runeCube = id => keyOfSpot(id);
export const runeDepth = id => { const k = runeCube(id), y = k ? Number(k.split(',')[1]) : NaN; return Number.isInteger(y) ? -y : null; };
// the woken stones of depth d, of a run (its ids)
export const wokenAt = (runes, d) => [...runes].filter(id => runeDepth(id) === d);
// where travelling to stone s puts you: where you stand to press it, facing it
export const arrivalAt = s => ({ x: s.approach.x, y: s.approach.y, z: s.approach.z, yaw: s.approach.yaw ?? 0 });
