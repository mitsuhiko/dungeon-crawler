import { loadEnemyModel } from './enemymodel.js';
export const amphibianModel = loadEnemyModel('assets/amphibian.glb', .65, {
  walk: 'BossWalk', death: 'BossDeath', attack: {
    whip: 'BossWhip', grab: 'BossGrab', waterJet: 'BossWaterJet', dive: 'BossDive',
    tailSpin: 'BossTailSpin', doubleSlam: 'BossDoubleSlam', inkBurst: 'BossInkBurst',
    undertow: 'BossUndertow', spikeVolley: 'BossSpikeVolley', tidalSurge: 'BossTidalSurge',
    bellyFlop: 'BossBellyFlop', rage: 'BossRage',
  },
});
