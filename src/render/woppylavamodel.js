import { loadEnemyModel } from './enemymodel.js';
// (his walk ripples his seven legs; `rise` is his rising between the phases, posed by game/woppylava.js
// while the volcano comes up; the plume out of his crater is a bone the clips scale)
export const woppylavaModel = loadEnemyModel('assets/woppylava.glb', 1, {
  walk: 'WoppylavaWalk', attack: { swipe: 'WoppylavaSwipe', erupt: 'WoppylavaErupt', wall: 'WoppylavaWall', hands: 'WoppylavaHands',
    summon: 'WoppylavaSummon', rise: 'WoppylavaRise' },
  death: 'WoppylavaDeath',
});
