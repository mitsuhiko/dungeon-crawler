// Mud in the wild (core/constants.js MUD): the mud pools of some themes (water with the look of
// mud, cubegen/mudpools.js) and the pockets of mud lying on the ground round some of them
// (map.mudPockets, each a field of mud: cubegen/mudpools.js pocketField). Wading or swimming through
// a mud pool slows as Sollmeldon's mud does (SOLLMELDON_FIGHT.mud.wade, game/mud.js), and so does
// wading through a pocket, the player's and the enemies' alike (not those of the mud, nor what
// floats). A pocket is a little field of mud as his is (core/sollmeldon.js), a dome of it settled on
// the ground once, holding still from then on, drawn as his is (render/mud.js; in the cubes round
// about baked, render/mudgeo.js); rings spread where the hero wades through it, its footsteps
// squelch and leave brown prints after it (game/footsteps.js pocketAt).
import { LH, WATER, MUD } from '../core/constants.js';
import { SOLLMELDON_FIGHT as G, MUD_FLOW, depthAt, surfaceAt } from '../core/sollmeldon.js';
import { pocketField } from '../cubegen/mudpools.js';
import { MUD_ROW } from '../themes/fluids.js';
import { mudSheet } from '../render/mud.js';
import { ripple } from '../render/ripples.js';
import { state, player } from './state.js';
import { slowPlayer } from './enemycombat.js';
import { afflictEnemy } from './statuses.js';
import { mirroring } from './enemies.js';

let map = null, pockets = [];   // [{ field, sheet, y }]

function build(m) {
  for (const p of pockets) p.sheet.clear();
  pockets = (m?.mudPockets ?? []).map(p => ({ field: pocketField(m, p), sheet: mudSheet({ still: true }), y: p.y }));
}

// the surface of the pocket of mud over (x, z), where a body with its feet at y wades in it
// (-Infinity: none)
export function pocketAt(x, y, z) {
  for (const p of pockets) {
    const s = surfaceAt(p.field, x, z);
    if (s > y - 0.05 && y > p.y - 0.3 && depthAt(p.field, x, z) > MUD_FLOW.wet * 2) return s;
  }
  return -Infinity;
}
// in a mud pool (wading or swimming)?
const inPool = b => b.swimming ? b.swimLook === MUD : (b.wade ?? 0) > 0 && b.support?.look === MUD;
const enemyInPool = e => e.f?.look === MUD && e.y < e.f.surf * LH - 0.02;

let walked = 0, was = null;
// every frame of play (game/enemies.js), the enemies of the cube
export function updateMuddy(list, dt) {
  if (state.map !== map) { map = state.map; build(map); walked = 0; was = null; }
  const p = player;
  if (p.hp > 0 && !p.ragdoll) {
    const pocket = p.grounded !== false ? pocketAt(p.x, p.y, p.z) : -Infinity;
    if (pocket > -Infinity || inPool(p)) slowPlayer(G.mud.wade);
    // (rings round the feet as they wade through a pocket)
    if (pocket > -Infinity && was) {
      walked += Math.hypot(p.x - was.x, p.z - was.z);
      if (walked > 0.3) {
        walked = 0;
        ripple(p.x, p.z, { level: pocket, fluid: WATER, look: MUD, row: MUD_ROW }, { r0: 0.1, r1: 0.32, life: 1.4, width: 0.03, alpha: 0.7 });
      }
    }
    was = { x: p.x, z: p.z };
  }
  if (mirroring()) return;
  for (const e of list) {
    if (e.mode === 'dead' || e.profile?.mudborn || e.profile?.hover || e.profile?.dwells || e.riding || e.under) continue;
    if (enemyInPool(e) || pocketAt(e.x, e.y, e.z) > -Infinity) afflictEnemy(e, 'slowed', G.mud.wade);
  }
}
// drawn (game/enemies.js drawEnemies; off: where the cube is drawn, sliding away in portal travel)
export function drawMuddy(dt, off) {
  for (const p of pockets) p.sheet.draw(p.field, dt, off);
}
// how many pockets the cube has (the checks)
export const pocketCount = () => pockets.length;
