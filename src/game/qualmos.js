// Qualmos's fight (core/qualmos.js has the rules, docs/bosses.md tells it): this cube's Qualmos,
// in a list of his own (`qualmoses`), so he fights, collides, travels and gets shown to friends
// like any enemy. A dev spawn (game/devspawn.js) gets a fight too.
//
// On him: `stage` (his phase, 1 .. 5, sent to friends with his row: net/protocol.js), `hpFloor`
// (core/qualmos.js phaseFloor) and `barred` (the attacks of the phases still to come).
// Movement and attacks are the shared enemy AI's (game/enemyai.js). When a blow has brought him
// down to his phase's floor and he is not in the middle of an attack, he starts the next phase:
// he rages (his `rage` attack, warded) and fights on with its attacks too.
import { QUALMOS, makeEnemy, enemyName } from '../core/enemies.js';
import { phaseDue, enterPhase } from '../core/qualmos.js';
import { state, setStatus } from './state.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { removeEnemyViews } from '../render/enemies.js';
import { sweep } from './bossfight.js';
import { tr } from '../i18n/i18n.js';

export let qualmoses = [];

export function resetQualmoses() {
  removeEnemyViews(qualmoses);
  qualmoses = [];
  addQualmoses(enemySpots(state.map, QUALMOS).filter(s => !state.run.defeated.has(s.id)).map((s, i) => makeEnemy(s, s.kind ?? QUALMOS, i)));
}
// Qualmoses to fight: this cube's, or spawned with the dev tools
export function addQualmoses(list) {
  for (const e of list) {
    enterPhase(e, 1);
    qualmoses.push(e);
  }
}
export function detachQualmoses() { const list = qualmoses; qualmoses = []; return list; }

export function updateQualmoses(dt) {
  for (const e of qualmoses) if (phaseDue(e)) {   // on into his next phase: his rage, then its attacks on top
    enterPhase(e, e.stage + 1);
    setStatus(tr('{name} enters phase {phase}!', { name: enemyName(e.profile), phase: e.stage }));
  }
  stepEnemies(qualmoses, dt);
  qualmoses = sweep(qualmoses, dt);
}
