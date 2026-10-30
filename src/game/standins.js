// The people of the surroundings (docs/world.md "The people of the surroundings"): the villagers
// and the people out in the world (map.villagers, map.npcs with the quests' part: game/questworld.js)
// of every cube shown round us, NEAR cubes at most (game/drawn.js), stand where they live, breathe
// and look about, and turn to the hero coming close across a seam, as in the cube played in.
// Their stand-ins are figures of their own (render/villagers.js), drawn as their cube is
// (render/farlook.js: dimmed like it, a little less, dissolving with it), without the lights of
// what they wear; nothing to hover or click (game/lootlabels.js knows the cube played in only).
// The cube played in, and the one a slide carries away, have their own people (render/world.js).
// Each proxy has its own (travel's two sets cross-fade, each with its people); a proxy kept across
// a refresh, a slide or the town's tiles handed over keeps them.
import * as THREE from 'three';
import { scene } from '../render/scene.js';
import { liveNeighbors } from '../render/neighbors.js';
import { buildVillagers, tickVillagers } from '../render/villagers.js';
import { setFarLook } from '../render/farlook.js';
import { rig } from '../render/figure.js';
import { state } from './state.js';
import { leftCube } from './travel.js';
import { proxyShown } from './drawn.js';
import { questWorld, questWorldChanged } from './questworld.js';

const CHECK = 1;   // s: how often the quests' part of the cubes shown is looked at again
const sets = new Map();   // proxy -> { map, sig, group, views }
let check = 0;

function build(map) {
  const list = [...(map.villagers ?? []), ...(map.npcs ?? [])];
  const group = new THREE.Group(), views = list.length ? buildVillagers(list, group, { lights: false }) : [];
  if (views.length) scene.add(group);
  return { map, sig: map.questSig, group, views };
}
function drop(s) {
  s.group.removeFromParent();
  s.group.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
}

// every frame (main.js; dt: game time): who stands where in the cubes shown now
export function updateStandins(dt, time) {
  const keep = new Set();
  if (state.mode === 'play' && state.cubes && rig.ready) {
    const left = leftCube()?.key, look = (check -= dt) <= 0;
    if (look) check = CHECK;
    for (const g of liveNeighbors()) {
      if (g.key === state.cubeKey || g.key === left || !proxyShown(g)) continue;
      const map = state.cubes.cubes.get(g.key)?.map;
      if (!map || map.interior) continue;
      // (the town's tiles never entered yet have no quests' part put in: game/questworld.js)
      if (map.questSig === undefined || look && questWorldChanged(map)) questWorld(map);
      let s = sets.get(g);
      if (s && (s.map !== map || s.sig !== map.questSig)) { drop(s); s = null; }
      if (!s) sets.set(g, s = build(map));
      keep.add(g);
      if (!s.views.length) continue;
      s.group.position.copy(g.group.position);
      setFarLook(s.group, g);
      tickVillagers(s.views, dt, time, g.group.position);
    }
  }
  for (const [g, s] of sets) if (!keep.has(g)) { drop(s); sets.delete(g); }
}

// (tests/browser/neighbor.js) the stand-ins drawn now: [{ key, people, group }]
export const standins = () => [...sets].filter(([, s]) => s.views.length).map(([g, s]) => ({ key: g.key, people: s.views.length, group: s.group, proxy: g }));
