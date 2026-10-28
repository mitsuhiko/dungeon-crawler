// The tidal hills' water (cubegen/guardian.js map.tide, Squarlo's arena): it stands at its rest
// level in the low flats, and Squarlo raises it (game/squarlo.js: his `tide`, 0 at rest .. 1 at
// high tide, sent to friends with his row, net/protocol.js). Every frame its level goes to the
// physics (physics/fluid.js setTide: what drowns, what is waded through) and is drawn
// (render/trials.js: the trial's rising water, in the tide's box). Enemies it goes over drown,
// but those that swim float in it.
// Slomo's flood (his slime bowl, map.tide `flood`: cubegen/guardian.js) comes in from a side: his
// `floodSide` and `front` (core/slomo.js floodBox) say how far across it has come; only that part of
// its box is in it (the physics) and shown (render/trials.js setFloodFront), its front a wall of
// slime rolling on (render/slomofx.js). It is drawn as slime (`look`), waded through as water.
// Sollmeldon's mud (his mire, map.tide `mud`) is a volume, not a level: game/mud.js runs it.
import { LH, WATER, LAVA } from '../core/constants.js';
import { tideLevel } from '../core/squarlo.js';
import { setTide, standingAt, enemyUnder } from '../physics/fluid.js';
import { standY } from '../physics/dwell.js';
import { setTrialWater, setFloodFront } from '../render/trials.js';
import { drawFloodFront } from '../render/slomofx.js';
import { state, player } from './state.js';
import { slowPlayer } from './enemycombat.js';
import { SLOMO_FIGHT, floodBox } from '../core/slomo.js';
import { guardianId } from '../core/guardians.js';
import { updateMud, resetMud } from './mud.js';

// how fast a shown level follows the boss's (levels/s): it moves smoothly between rows (a tide's
// own `follow`, else this)
const FOLLOW = 1.2;
let shown = null;
const dry = () => { state.tide = null; setTide(null); setTrialWater(state.world, null, null); setFloodFront(state.world, null); drawFloodFront(null); };
// Foggery's lava (map.tide.gone, cubegen/towerarena.js) can go over the top of his tower (his
// `tide` over 1) and drain away (under 0); once he is beaten it is gone for good
const beaten = m => m.tide.gone !== undefined && !!m.guardian && state.run.defeated.has(guardianId(m.key));
export function updateTide(list, dt) {
  const t = state.map?.tide;
  if (!t) {
    if (shown !== null) { shown = null; dry(); resetMud(); }
    return;
  }
  if (t.mud) { shown = 0; return updateMud(list, dt); }
  let k = 0, own = false, by = null;
  for (const e of list) if (e.boss && Number.isFinite(e.tide) && (!own || e.tide > k)) { k = e.tide; own = true; by = e; }
  if (beaten(state.map) && (!own || k > 0)) k = (t.gone - t.rest) / (t.high - t.rest);
  const want = tideLevel(t, k), follow = t.follow ?? FOLLOW;
  shown = shown === null ? want : shown + Math.max(-follow * dt, Math.min(follow * dt, want - shown));
  if (t.gone !== undefined && shown <= t.gone + 0.05) { state.tide !== null && dry(); state.tide = null; return; }
  state.tide = shown;
  // (a flood: only as far across as its front has come)
  const box = t.flood ? floodBox(t.box, by?.floodSide ?? 0, by ? by.front ?? 1 : 1) : t.box;
  setTide({ y: shown * LH, fluid: t.fluid, look: t.look, box });
  setTrialWater(state.world, shown * LH, 'running');
  if (t.flood) {
    setFloodFront(state.world, box);
    drawFloodFront({ box, side: by?.floodSide ?? 0, front: by ? by.front ?? 1 : 1, y: shown * LH, base: t.rest * LH }, dt);
    // its slime holds our player's feet, on top of the wading
    const p = player, s = standingAt(p.x, p.z);
    if (s && s.y > p.y + 0.05 && p.hp > 0 && !p.ragdoll) slowPlayer(SLOMO_FIGHT.flood.slow);
  }
}
// (and a boss's water or lava still standing from the cube before goes: it would drown what is here)
export const resetTide = () => { if (shown !== null || state.tide != null) dry(); shown = null; resetMud(); };

// enemies a standing fluid goes over drown (no reward: the water took them)
export function drownEnemies(list) {
  for (const e of list) {
    if (e.mode === 'dead' || e.hp <= 0 || !enemyUnder(e)) continue;
    e.noReward = true; e.hp = 0; e.mode = 'dead'; e.deadT = 0; e.path = null; e.speed = 0;
  }
}
// those lava does not burn (Foggery, his Fire-faces and Fire-cats: `lavaproof`) walk on it: where it
// stands over the floor under them, they stand on its surface, wherever they move (not one held
// where its fight puts it: on a platform, leaping, Foggery floating)
export function walkOnLava(list) {
  for (const e of list) {
    if (!e.profile.lavaproof || e.mode === 'dead' || e.anchored || e.deck || e.jump) continue;
    const s = standingAt(e.x, e.z);
    if (s?.fluid === LAVA && s.y > e.y) e.y = s.y;
  }
}
// those that swim float in deep water (their body half under; `swimming`), wherever they move; a
// fluid dweller floats as deep in its fluid as it does (physics/dwell.js standY), rising and
// falling with it
export function floatSwimmers(list) {
  for (const e of list) {
    if (e.mode === 'dead' || e.deck || e.jump || e.riding) continue;
    if (e.profile.dwells && e.f) { e.y = standY(e.profile, e.f, e.x, e.z); continue; }
    if (!e.profile.swims) continue;
    const s = standingAt(e.x, e.z), half = e.profile.bodyHeight * 0.5;
    e.swimming = !!s && s.fluid === WATER && s.y - e.y > half;
    if (e.swimming) e.y = s.y - half;
  }
}
