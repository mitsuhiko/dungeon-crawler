import { loadEnemyModel } from './enemymodel.js';
// (cutL / cutM / cutR: a head being cut off, played by render/sollmeldonview.js while it is (mode
// 'split'); idle: standing still, render/enemies.js; fly: up in the air, render/sollmeldonview.js
// blends it in by how high he flies)
export const sollmeldonModel = loadEnemyModel('assets/sollmeldon.glb', 1, {
  walk: 'SollmeldonWalk', attack: { biteL: 'SollmeldonBiteL', biteM: 'SollmeldonBiteM', biteR: 'SollmeldonBiteR', spit: 'SollmeldonSpit',
    airSpit: 'SollmeldonAirSpit', summon: 'SollmeldonSummon', cutL: 'SollmeldonCutL', cutM: 'SollmeldonCutM', cutR: 'SollmeldonCutR' },
  death: 'SollmeldonDeath', gaits: { idle: 'SollmeldonIdle', fly: 'SollmeldonFly' },
});
