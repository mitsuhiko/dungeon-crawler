import { loadEnemyModel } from './enemymodel.js';
// (his spine is where render/umbraview.js puts it; the clips move his jaw, eyes and frills: the swim
// as his walk, his attacks, `rage` between phases (posed: game/umbra.js), his death)
export const umbraModel = loadEnemyModel('assets/umbra.glb', 1, {
  walk: 'UmbraSwim', attack: { bite: 'UmbraBite', wave: 'UmbraWave', quake: 'UmbraQuake', vents: 'UmbraVents', summon: 'UmbraSummon',
    jets: 'UmbraJets', shield: 'UmbraShield', rage: 'UmbraRage' },
  death: 'UmbraDeath',
});
