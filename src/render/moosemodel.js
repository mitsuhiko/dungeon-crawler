import { loadEnemyModel } from './enemymodel.js';
export const mooseModel = loadEnemyModel('assets/moose.glb', 1, {
  walk: 'MooseWalk', fast: 'MooseRun', attack: { toss: 'MooseToss', charge: 'MooseCharge', dazed: 'MooseDazed', tail: 'MooseTail' },
  death: 'MooseDeath',
});
