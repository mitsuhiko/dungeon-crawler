import { loadEnemyModel } from './enemymodel.js';
export const slomoModel = loadEnemyModel('assets/slomo.glb', 1, {
  walk: 'SlomoOoze', attack: { armL: 'SlomoArmL', armR: 'SlomoArmR', meteor: 'SlomoMeteor',
    spit: 'SlomoSpit', summon: 'SlomoSummon', meteorSlug: 'SlomoMeteorSlug', floodSlug: 'SlomoFloodSlug' },
  death: 'SlomoDeath', gaits: { crawl: 'SlomoCrawl' }, props: ['SlomoArmSlug'],
});
