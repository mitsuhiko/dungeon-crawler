// Defending an outpost's supply cart (docs/quests.md, "Defense"; core/quests.js kind `defense`).
// With the quest going on (not archived), coming close to the cart starts the raid: after a
// moment the first wave comes in through the cube's portals, then the next once it is beaten,
// `waves` of them, a few more each time. The raiders go for the cart: each makes for a cell beside
// it and, once there, takes from it (its strength drains); a player close by, or one who hits
// them, they fight like any enemy (they are posted like a guardian's defenders: e.defence,
// game/enemyai.js). The cart's strength shows over it. All waves beaten: the quest is done, its
// keeper pays. The cart emptied, or the player down: it fails (Restart in the quest menu, then
// again by the cart). Leaving the cube calls the raid off; it starts over next time.
//
// Only the game that runs the cube's enemies runs the raid (alone: ours; playing together: the
// runner, net/foes.js); the others fight the raiders it shows them.
import * as THREE from 'three';
import { camera } from '../render/scene.js';
import { state, player, setStatus, worldLevel } from './state.js';
import { addEnemies, allEnemies, mirroring, removeEnemies } from './enemies.js';
import { questGoalsIn } from '../core/quests.js';
import { DEPTH_SPAWNS } from '../core/spawns.js';
import { ENEMY_KINDS, isRanged, makeEnemy, coinRange, depthLevel, absent } from '../core/enemies.js';
import { walkable, groundY, neighbors, findPath } from '../physics/enemynav.js';
import { mulberry32, hash32 } from '../core/util.js';
import { hashString } from '../core/gear/drops.js';
import { sfx } from '../audio/sfx.js';
import { tr } from '../i18n/i18n.js';
import { uiScale } from './uiscale.js';

// start: how close to the cart the raid starts; reach: how close to it a raider takes from it;
// drain: how much of it one raider takes a second; engage: how close a player draws a raider off
export const RAID = { start: 3.5, countdown: 3, between: 4, reach: 2.7, drain: 0.04, engage: 2.6, sizes: [3, 4, 5] };

let raid = null, attempt = 0, calmUntil = 0;
export const raiding = () => raid;
// we died (game/flow.js die): a raid going on is lost
export function raidDied() { if (raid) raid.died = true; }

const goalHere = () => questGoalsIn(state.run.quests, state.map.key).find(g => g.stage.goal === 'defend') ?? null;

// the raiders' kinds at this depth: those that fight up close (a cart is not shot at)
function raiders(depth) {
  const roster = DEPTH_SPAWNS[Math.min(depth, DEPTH_SPAWNS.length - 1)].roster;
  const out = roster.flatMap(r => Object.entries(r.kinds).map(([type, w]) => [ENEMY_KINDS[type], w * r.chance]))
    .filter(([k]) => k && !k.boss && !isRanged(k));
  return out.length ? out : [[ENEMY_KINDS.snake, 1]];
}

function begin(goal, spot) {
  attempt++;
  // where raiders stand to take from it: the floors round the outpost they can stand on (the cart
  // and its keeper are in the way right beside it)
  const cart = spot.anchor, ring = state.map.floors.filter(f => Math.abs(f.top * 0.5 - cart.y) < 1.2 && walkable(f, 0.9)
    && Math.hypot(f.x + .5 - cart.x, f.z + .5 - cart.z) <= RAID.reach - 0.2);
  raid = { quest: goal.quest.id, cube: state.cubeKey, depth: state.map.depth, cart, ring, hp: 1, wave: 0, waves: goal.stage.waves,
    phase: 'countdown', t: RAID.countdown, ids: new Set(), seed: hash32(hashString(goal.quest.id) ^ attempt) };
  setStatus(tr('The keeper rings the bell: here they come! Keep them off the cart!'));
  sfx('unlock');
}

// where raiders come from: the floors by the portals they can walk to the cart from; where none
// can (the cart up on a ledge, say), the floors a few cells off that can
function arrivals(height) {
  // the floors the raiders can walk to the cart from (over the enemies' floor graph, out from it)
  const seen = new Set(raid.ring), queue = [...raid.ring];
  for (let i = 0; i < queue.length && queue.length < 400; i++) for (const g of neighbors(queue[i], height)) if (!seen.has(g)) { seen.add(g); queue.push(g); }
  const to = f => seen.has(f);
  const fits = f => walkable(f, height) && !f.spot && !f.fluid;
  const near = (x, z, lo, hi) => state.map.floors.filter(f => { const d = Math.hypot(f.x + .5 - x, f.z + .5 - z); return d >= lo && d < hi && fits(f); });
  const portals = state.map.portals.filter(p => p.kind !== 'spawn');
  let out = portals.flatMap(p => near(p.x + .5, p.z + .5, 0, 3).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 4)).filter(to);
  if (out.length < 3) out = near(raid.cart.x, raid.cart.z, 4.5, 8).filter(to);
  // each with the post by the cart it has a way to (the graph's drops go one way only)
  return out.slice(0, 24).map(f => ({ f, post: raid.ring.find(p => findPath(f, p, 48, height)) })).filter(a => a.post);
}

function spawnWave() {
  const R = mulberry32(hash32(raid.seed ^ Math.imul(raid.wave + 1, 0x9e37))), kinds = raiders(raid.depth);
  const n = (RAID.sizes[raid.wave] ?? RAID.sizes.at(-1) + raid.wave) + Math.floor(raid.depth / 6);
  const level = depthLevel(raid.depth, worldLevel()), list = [], from = arrivals(Math.max(...kinds.map(([k]) => k.height)));
  if (!from.length || !raid.ring.length) { end('off', () => {}); calmUntil = state.time + 30; setStatus(tr('Nothing comes... maybe another time.')); return; }
  for (let i = 0; i < n; i++) {
    let r = R() * kinds.reduce((s, [, w]) => s + w, 0), kind = kinds.at(-1)[0];
    for (const [k, w] of kinds) if ((r -= w) < 0) { kind = k; break; }
    const { f, post } = from[(i * 5 + Math.floor(R() * 3)) % from.length];
    const [lo, hi] = coinRange(kind, level), id = `q:${raid.quest}:raid${attempt}:${raid.wave}:${i}`;
    const e = makeEnemy({ id, level, coinDrop: Math.round((lo + hi) / 4), kind, f, x: f.x + .5, y: groundY(f, f.x + .5, f.z + .5), z: f.z + .5,
      yaw: Math.atan2(raid.cart.x - f.x - .5, raid.cart.z - f.z - .5) }, kind, i);
    e.raid = raid;
    e.defence = { post, engage: false };
    raid.ids.add(id);
    list.push(e);
  }
  addEnemies(list);
  raid.phase = 'wave';
  setStatus(raid.wave === 0 ? tr('They are coming!') : tr('Wave {n} of {of}!', { n: raid.wave + 1, of: raid.waves }));
}

function end(result, event) {
  const quest = raid.quest, ids = raid.ids;
  raid = null;
  hideBar();
  if (result === 'won') { setStatus(tr('They give up! The cart is safe.')); sfx('levelUp'); event({ kind: 'defended', quest }); return; }
  removeEnemies(e => ids.has(e.id) && e.mode !== 'dead');   // they run off with what they got
  if (result === 'lost') { setStatus(tr('The cart is emptied... the raid is lost.')); event({ kind: 'lost', quest }); }
}

// every frame (game time): event raises a quest event (game/quests.js questEvent; `lost`: the
// quest fails)
export function updateDefense(dt, event) {
  if (!raid && (!state.map || state.transitioning || mirroring() || !state.run?.quests)) return;
  if (raid && (raid.cube !== state.cubeKey || mirroring() || !state.map)) { end('off', event); return; }
  if (state.transitioning) return;
  const goal = goalHere();
  if (raid && goal?.quest.id !== raid.quest) { end('off', event); return; }
  if (!goal) return;
  const spot = (state.map.spots ?? []).find(s => s.id === goal.stage.spot);
  if (!spot) return;
  if (!raid) {
    if (player.hp > 0 && state.time >= calmUntil && Math.hypot(player.x - spot.anchor.x, player.z - spot.anchor.z) < RAID.start) begin(goal, spot);
    return;
  }
  drawBar();
  if (raid.died) { end('lost', event); return; }
  if (dt <= 0) return;
  if (raid.phase === 'countdown' || raid.phase === 'between') {
    if ((raid.t -= dt) <= 0) spawnWave();
    return;
  }
  const mine = allEnemies().filter(e => raid.ids.has(e.id) && !absent(e));
  for (const e of mine) {
    // close to the cart: taking from it; a player near (or a hit) and it fights instead
    if (e.defence) e.defence.engage = Math.hypot(player.x - e.x, player.z - e.z) < RAID.engage && player.hp > 0;
    if (e.mode !== 'attack' && Math.hypot(e.x - raid.cart.x, e.z - raid.cart.z) < RAID.reach) raid.hp -= RAID.drain * dt;
  }
  if (raid.hp <= 0) { end('lost', event); return; }
  if (!mine.length) {
    raid.wave++;
    if (raid.wave >= raid.waves) { end('won', event); return; }
    raid.phase = 'between'; raid.t = RAID.between;
    setStatus(tr('Wave {n} beaten! Get ready...', { n: raid.wave }));
  }
}

// --- the cart's strength, over it ---------------------------------------------------------------

let bar = null;
const v = new THREE.Vector3();
function drawBar() {
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'cart-bar';
    bar.innerHTML = `<span>${tr('Supply cart')}</span><i><b></b></i>`;
    document.getElementById('loot-labels').append(bar);
  }
  const off = state.world?.group.position ?? { x: 0, y: 0, z: 0 };
  v.set(raid.cart.x + off.x, raid.cart.y + off.y + 1.3, raid.cart.z + off.z).project(camera);
  bar.hidden = v.z > 1;
  const s = uiScale();   // (it grows with the UI scale: style.css)
  bar.style.transform = `translate(${Math.round((v.x + 1) / 2 * innerWidth - 50 * s)}px, ${Math.round((1 - v.y) / 2 * innerHeight - 20 * s)}px)`;
  bar.querySelector('b').style.width = `${Math.max(0, raid.hp) * 100}%`;
  bar.dataset.phase = raid.phase;
}
function hideBar() { bar?.remove(); bar = null; }
