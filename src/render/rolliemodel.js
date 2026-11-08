import { loadEnemyModel } from './enemymodel.js';
// (Rollie, blender/rollie.py: his wheels spun by the game, render/enemies.js; idle: what he does
// standing still. Megalimmer has no model: render/megalimmerview.js)
export const rollieModel = loadEnemyModel('assets/rollie.glb', 1, {
  walk: 'RollieRoll', attack: { laser: 'RollieLaser', sabers: 'RollieSabers', sweep: 'RollieSweep', grid: 'RollieGrid', swipe: 'RollieSwipe',
    summon: 'RollieSummon' },
  death: 'RollieDeath', gaits: { idle: 'RollieIdle' },
});
