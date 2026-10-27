import { state } from './state.js';
import { MOOSE, makeEnemy } from '../core/enemies.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';

// the Moose of a cube's roster, in herds (their toss, charge and tail are the shared AI's:
// game/enemyai.js)
export let mooses = [];
export function resetMooses() {
  removeEnemyViews(mooses);
  mooses = enemySpots(state.map, MOOSE).filter(spot => !state.run.defeated.has(spot.id)).map((spot, i) => makeEnemy(spot, spot.kind ?? MOOSE, i));
}
export function updateMooses(dt) {
  stepEnemies(mooses, dt);
  mooses = mooses.filter(e => e.mode !== 'dead' || e.deadT < e.profile.corpseTime || (removeEnemyViews([e]), false));
}
export function detachMooses() { const list = mooses; mooses = []; return list; }
