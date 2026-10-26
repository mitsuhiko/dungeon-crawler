import { loadEnemyModel } from './enemymodel.js';
// (rise and break: his changes into phases 2 and 3, played by render/manskview.js while he changes)
export const manskModel = loadEnemyModel('assets/mansk.glb', 1, {
  walk: 'ManskHover', attack: { inhale: 'ManskInhale', spit: 'ManskSpit', orbs: 'ManskOrbs', summon: 'ManskSummon', slow: 'ManskSlow',
    lash: 'ManskLash', whirl: 'ManskWhirl', rise: 'ManskRise', break: 'ManskBreak' },
  death: 'ManskDeath',
});
