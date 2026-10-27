import { loadEnemyModel } from './enemymodel.js';
// (blender/squirtle.py; drawn by render/squirtleview.js, its body in its fluid's look: render/squirtlelook.js)
export const squirtleModel = loadEnemyModel('assets/squirtle.glb', 1, { walk: 'SquirtleIdle', attack: { spit: 'SquirtleSpit', leap: 'SquirtleLeap' },
  death: 'SquirtleDeath', gaits: { swim: 'SquirtleSwim', melt: 'SquirtleMelt' } });
