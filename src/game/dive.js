// Under water in Umbra's reef (core/umbra.js has the rules, game/umbra.js runs his fight, docs/bosses.md
// "Umbra"). The reef (map.dive, cubegen/guardian.js) is dry as the hero comes in, a diving suit of
// brass on its stand in the middle of the room (a thing to click: game/lootlabels.js). Taking it starts
// it all: the hero puts the suit on (render/divesuit.js: the boots, the tank, the helmet coming
// down, its bolts, a hiss of air), the water rises over everything and he comes. Playing together everyone in the room gets a suit as the first takes theirs; a friend's
// game tells the runner (relay.suit).
//
// What the fight's water does here, for our hero (each game its own): the suit's heavy boots keep
// them on the bottom (`player.diving`: physics/move.js walks them there, slower, and jumps them
// higher and slower), what they swing and what flies through the water is slowed (core/umbra.js
// DIVE: game/sword.js, game/shots.js, game/projectiles.js, game/throws.js), fire goes out, there is
// no way out (game/portals.js), the robot waits in the entrance (game/robot.js), the air in the tank runs out
// (the bar under the boss's, `air`): at none they drown ("Ran out of air!"). His mud (phase 3) slows
// them the deeper they stand in it. Beaten, the water drains away and the suit comes off.
//
// His state comes with him (`dive` on Umbra: { phase, t }, `fightT` (s of air used), `mudY`), from
// our own fight or as the runner shows him (net/foes.js), so every game sees the same water.
import { player, state, setStatus } from './state.js';
import { UMBRA_FIGHT as G, DIVE, airLeft, airText, mudSlow } from '../core/umbra.js';
import { knockDown } from './ragdoll.js';
import { slowPlayer } from './enemycombat.js';
import { relay } from '../net/online.js';
import { narrate } from './narrator.js';
import { drawDive, clearDive } from '../render/dive.js';
import { setSuitedAt } from '../render/divesuit.js';
import { msg, tr } from '../i18n/i18n.js';
import { sfx } from '../audio/sfx.js';

const REACH = 0.85;   // cells: walking this close to the suit's stand takes it
// the friends here wear theirs too while the water is in (render/partner.js draws them so)
setSuitedAt((x, y, z) => {
  const reef = reefHere();
  if (!reef || !['suit', 'flood', 'wet'].includes(divePhase())) return false;
  const [x0, z0, x1, z1] = reef.box;
  return x >= x0 && z >= z0 && x < x1 && z < z1;
});
let boss = null;      // this cube's Umbra (ours, or as the runner shows him)
let visit = -1;       // the visit our hero's suit is from
let warned = 0;       // the air's last warning said (s left)

export const reefHere = () => state.map?.dive ?? null;
export const diveBoss = () => boss;
// the phase of the reef's water: 'dry' (the suit on its stand), 'suit' (being put on), 'flood'
// (rising), 'wet' (his fight), 'drain' (beaten, draining), 'over' (dry again)
export const divePhase = () => boss?.dive?.phase ?? (reefHere() ? 'over' : null);
// The water's surface now (world units), or null where there is none
export function waterY() {
  const reef = reefHere(), d = boss?.dive;
  if (!reef || !d) return null;
  const k = d.phase === 'flood' ? Math.min(1, d.t / G.flood) : d.phase === 'wet' ? 1 : d.phase === 'drain' ? 1 - Math.min(1, d.t / G.drain) : 0;
  if (k <= 0) return null;
  const e = k * k * (3 - 2 * k);
  return reef.low - 0.3 + (reef.surface - reef.low + 0.3) * e;
}
// is (x, y, z) under the reef's water?
export function inWater(x, y, z) {
  const w = waterY(), reef = reefHere();
  if (w === null || !(y < w)) return false;
  const [x0, z0, x1, z1] = reef.box;
  return x >= x0 && z >= z0 && x < x1 && z < z1;
}
// how much slower a thing flying at (x, y, z) goes (core/umbra.js DIVE.shots), 1 out of the water
export const waterDrag = (x, y, z) => inWater(x, y, z) ? DIVE.shots : 1;
// the mud's level now (world units, his third phase), or null
export const mudY = () => Number.isFinite(boss?.mudY) && boss.mode !== 'dead' ? boss.mudY : null;
// no way out: the water is in (or coming), our hero in their suit
export const diveSealed = () => !!player.suit && ['suit', 'flood', 'wet'].includes(divePhase());
// where the robot waits meanwhile: in the entrance, outside the water (game/robot.js); null: it follows
export function robotPark() {
  const reef = reefHere();
  if (!reef || !['suit', 'flood', 'wet'].includes(divePhase())) return null;
  const h = reef.door, [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][h.dir];
  return { x: h.x + dx * 0.15, y: h.y + 1.1, z: h.z + dz * 0.15 };
}

// The suit on its stand, as a thing to click (game/lootlabels.js): while the reef is dry, he still
// lives and our hero has none on
export function diveThingsHere() {
  const reef = reefHere();
  if (!reef || divePhase() !== 'dry' || player.suit || !boss || boss.mode === 'dead') return [];
  const s = reef.stand;
  return [{ id: 'dive:suit', dive: true, story: 'suit', questItem: true, x: s.x, y: s.y, z: s.z, toss: 1, title: msg('Diving suit'), labelY: 2.1 }];
}
// take the suit: our own fight starts at once, a friend's game asks the runner
function takeSuit() {
  if (boss?.suitUp) boss.suitUp();
  else relay.suit?.();
  suitOn();
}
// our hero puts it on (the suit's clip: render/divesuit.js; they stand still meanwhile)
function suitOn() {
  if (player.suit) return;
  player.suit = { t: 0 };
  visit = state.visit;
  player.stun = Math.max(player.stun ?? 0, G.suit);
  player.vx = player.vz = 0;
  sfx('unlock', { at: player, pitch: 0.6, volume: 0.8 });
  setStatus(tr('You put on the diving suit'));
}

// game/enemies.js, every frame (the enemies of the cube as we run them, or as we are shown them)
export function updateDive(list, dt) {
  const reef = reefHere(), p = player;
  boss = reef ? list.find(e => e.profile?.boss === 'umbra' && e.dive) ?? null : null;
  const phase = divePhase();
  // the suit: on with the water (as the first of us took it), off once it is gone (or elsewhere)
  if (p.suit && (visit !== state.visit || !reef || phase === 'over' || phase === 'dry' && !boss)) p.suit = null;
  if (reef && boss && ['suit', 'flood', 'wet'].includes(phase) && !p.suit && p.hp > 0) suitOn();
  if (p.suit) p.suit.t += dt;
  // walking up to the stand takes the suit
  if (reef && phase === 'dry' && boss && boss.mode !== 'dead' && !p.suit && p.hp > 0 && !p.ragdoll
    && Math.hypot(p.x - reef.stand.x, p.z - reef.stand.z) < REACH && Math.abs(p.y - reef.stand.y) < 1) takeSuit();
  // under water: on the bottom in the suit, the fire out
  p.diving = !!p.suit && p.suit.t >= G.suit && inWater(p.x, p.y + 0.4, p.z);
  if (p.diving) p.burning = null;
  // the air: running out once his fight is on
  const on = p.diving && phase === 'wet' && Number.isFinite(boss?.fightT) && boss.mode !== 'dead';
  const left = on ? airLeft(boss.fightT) : G.air;
  if (on && p.hp > 0 && !p.ragdoll) {
    for (const at of [60, 30, 10]) if (left <= at && warned > at) setStatus(tr('{time} of air left!', { time: airText(left) }));
    if (left <= 60 && warned > 60) narrate('boss', { boss: 'umbra', what: 'air' });   // (the robot calls it from the entrance)
    if (left <= 0) knockDown({ damage: p.hp, hop: 0, reason: msg('Ran out of air!') });
  }
  warned = on ? left : G.air + 1;
  airBar(on && left > 0 ? left : null);
  // his mud: the deeper it stands over the feet, the slower
  const m = mudY();
  if (m !== null && p.hp > 0 && !p.ragdoll && m > p.y) slowPlayer({ time: 0.2, slow: Math.max(0.35, mudSlow(m - p.y)), source: 'mud' });
}
// The water, the mud and the suit's stand, drawn (render/dive.js)
export function drawDiveFx(dt, off) {
  const reef = reefHere();
  if (!reef || !boss) { clearDive(); return; }
  drawDive(reef, { water: waterY(), mud: mudY(), phase: divePhase(), boss }, dt, off);
}
export function resetDive() { boss = null; warned = G.air + 1; airBar(null); clearDive(); }

// The air bar under the boss's (index.html #boss-air): what is left, as a bar and in minutes
const $ = id => document.getElementById(id);
let shownAir = null;
function airBar(left) {
  const el = $('boss-air');
  if (!el) return;
  const key = left === null ? null : Math.ceil(left * 4) / 4;
  if (key === shownAir) return;
  shownAir = key;
  el.classList.toggle('on', left !== null);
  if (left === null) return;
  $('boss-air-text').textContent = tr('Air {time}', { time: airText(left) });
  $('boss-air-fill').style.transform = `scaleX(${(left / G.air).toFixed(4)})`;
  el.classList.toggle('low', left <= 30);
}
