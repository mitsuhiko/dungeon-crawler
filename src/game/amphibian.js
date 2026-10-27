// Qualmos prototype: the core's boss, or a developer spawn. Shared AI owns hits and movement.
import { AMPHIBIAN, makeEnemy, attackOf } from '../core/enemies.js';
import { amphibianFloor, amphibianBarred } from '../core/amphibian.js';
import { state, setStatus } from './state.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { sweep } from './bossfight.js';
import { removeEnemyViews } from '../render/enemies.js';
import { tr } from '../i18n/i18n.js';
export let amphibians = [];
export function addAmphibians(list) {
  for (const e of list) {
    e.stage = 1; e.barred = amphibianBarred(1);
    e.hpFloor = amphibianFloor(1, e.profile.hp);
    e.cast = () => {};
    amphibians.push(e);
  }
}
export function resetAmphibians() {
  removeEnemyViews(amphibians); amphibians = [];
  addAmphibians(enemySpots(state.map, AMPHIBIAN).filter(s => !state.run.defeated.has(s.id)).map(s => makeEnemy(s, AMPHIBIAN)));
}
export function detachAmphibians() { const out = amphibians; amphibians = []; return out; }
export function updateAmphibians(dt) {
  for (const e of amphibians) {
    if (e.mode === 'dead') continue;
    if (e.stage < 5 && e.hp <= e.hpFloor && e.mode !== 'attack') {
      e.stage++;
      e.barred = amphibianBarred(e.stage);
      e.hpFloor = amphibianFloor(e.stage, e.profile.hp);
      e.attack = e.profile.attacks.findIndex(a => a.name === 'rage');
      e.mode = 'attack'; e.t = 0; e.bit = false; e.attacks++; e.speed = 0;
      setStatus(tr('Qualmos enters phase {phase}!', { phase: e.stage }));
    }
    // Invulnerability only for the visible phase transition, not for an entire phase.
    e.shield = e.mode === 'attack' && attackOf(e).name === 'rage' ? .1 : 0;
  }
  stepEnemies(amphibians, dt);
  amphibians = sweep(amphibians, dt);
}
