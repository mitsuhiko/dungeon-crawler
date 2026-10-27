import { loadEnemyModel } from './enemymodel.js';
// (change: his crumbling into the sun, played by render/monteurview.js while he changes; his walk
// as the sun is the gait `sun`; the stone he throws, and that rains, is a prop)
export const monteurModel = loadEnemyModel('assets/monteur.glb', 1, {
  walk: 'MonteurWalk', attack: { throw: 'MonteurThrow', charge: 'MonteurCharge', stuck: 'MonteurStuck', summon: 'MonteurSummon',
    change: 'MonteurChange', sunThrow: 'MonteurSunThrow', roll: 'MonteurRoll', sunStuck: 'MonteurSunStuck', rain: 'MonteurRain',
    spin: 'MonteurSpin', sunSummon: 'MonteurSunSummon' },
  death: 'MonteurDeath', gaits: { sun: 'MonteurSunWalk' }, props: ['MonteurStone'],
});
