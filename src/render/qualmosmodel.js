import { loadEnemyModel } from './enemymodel.js';
// (rage: his change into the next phase, an attack of its own: core/enemies.js QUALMOS)
export const qualmosModel = loadEnemyModel('assets/qualmos.glb', 0.65, {
  walk: 'QualmosWalk', attack: { whip: 'QualmosWhip', grab: 'QualmosGrab', doubleSlam: 'QualmosDoubleSlam', waterJet: 'QualmosWaterJet',
    dive: 'QualmosDive', inkBurst: 'QualmosInkBurst', tailSpin: 'QualmosTailSpin', undertow: 'QualmosUndertow',
    spikeVolley: 'QualmosSpikeVolley', tidalSurge: 'QualmosTidalSurge', bellyFlop: 'QualmosBellyFlop', rage: 'QualmosRage' },
  death: 'QualmosDeath',
});
