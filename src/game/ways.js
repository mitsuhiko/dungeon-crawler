// The ways out of the cube a click takes (game/orders.js orderWay; hovered and labelled with the
// items, game/lootlabels.js): a side portal's gate, a well down, a ring up, the town portal's pad
// and a town house's door (or the door back out of one). Each is { way, key, kind, label, x, y,
// z (where its label hangs), walk { x, y, z } (where to walk to), push [dx, dz] (then on into it
// until it takes you; null: stand on it while it charges, game/portals.js) }.
// The ways of a map are made once (the same objects frame after frame, for the hover); a side
// gate whose face stands open (the whole face takes you across) and the town portal while it is
// not open here are left out.
import { N, DIRS } from '../core/constants.js';
import { isFaceOpen } from '../core/boundaries.js';
import { townPadIn } from '../core/townportal.js';
import { state } from './state.js';
import { msg } from '../i18n/i18n.js';

const LABEL = { side: msg('Portal'), down: msg('Way down'), up: msg('Way up'), town: msg('Town portal'), door: msg('Door') };
const HANG = { side: 1, down: 0.35, up: 1.5, town: 0.3 };   // how high over its floor a label hangs

function portalWay(q) {
  const kind = q.kind, walk = { x: q.x + 0.5, y: q.y, z: q.z + 0.5 };
  const at = kind === 'side' ? [[N - 0.14, q.z + 0.5], [0.14, q.z + 0.5], [q.x + 0.5, N - 0.14], [q.x + 0.5, 0.14]][q.dir] : [walk.x, walk.z];
  return { way: true, key: 'portal:' + q.id, kind, label: LABEL[kind], portal: q, x: at[0], y: q.y + HANG[kind], z: at[1],
    walk, push: kind === 'side' ? DIRS[q.dir] : null };
}
// a door: walked up to on its doorstep, then into it
const doorWay = d => ({ way: true, key: 'door:' + d.id + ':' + d.to, kind: 'door', label: LABEL.door, door: d, x: d.x, y: d.y + 0.8, z: d.z,
  walk: { x: d.x + d.nx * 0.45, y: d.y, z: d.z + d.nz * 0.45 }, push: [-d.nx, -d.nz] });

const made = new WeakMap();   // map -> its portals' and doors' ways
let town = null;              // the town portal's way, for its pad
export function waysHere() {
  const m = state.map;
  if (!m || m.flipKey) return [];   // (Flip's box turned: its portals are in the walls, game/flipworld.js)
  let list = made.get(m);
  if (!list) made.set(m, list = [...m.portals.filter(q => q.kind !== 'spawn').map(portalWay), ...(m.doors || []).map(doorWay)]);
  const out = list.filter(w => w.kind !== 'side' || !isFaceOpen(state.openedFaces, state.cubeKey, w.portal.dir));
  const pad = townPadIn(m, state.run);
  if (pad) {
    if (town?.pad !== pad) town = { way: true, key: 'town', kind: 'town', label: LABEL.town, pad, x: pad.x, y: pad.y + HANG.town, z: pad.z, walk: pad, push: null };
    out.push(town);
  }
  return out;
}
