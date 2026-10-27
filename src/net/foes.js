// The enemies when playing together (net/session.js wires this up). A cube's enemies live on
// one game, the runner: of the players in the cube, the one with the lowest number (the host,
// if it is there; protocol.js runnerOf). Its AI moves them and goes after any player there
// (game/party.js). A player exploring alone runs its cube's enemies itself, like any game. The
// others in the cube (viewers) are shown them:
//   roster  the runner's enemies in its cube, once (and again when they change): who they are
//           and what they are like, so the viewer can draw and fight them (`replicas`)
//   foes    about 15 times a second, where each is and what it does (one row each)
// A viewer fights what it is shown: its hits go to the runner (`hit`, game/sword.js), which
// applies them; until the runner's next word the viewer shows its own result (predicted
// health, and a predicted death stays dead). Kills give every player there XP and loot of
// their own (game/enemies.js awardKills), because each side sees its enemies die.
import { player, state } from '../game/state.js';
import { online } from './online.js';
import { allEnemies, mirrorEnemies, adoptEnemies } from '../game/enemies.js';
import { mirrorBeam } from '../game/beams.js';
import { clearProjectiles } from '../game/projectiles.js';
import { removeEnemyViews } from '../render/enemies.js';
import { guardianId } from '../core/guardians.js';
import { STAGE_PROFILES, enemyProfile } from '../core/enemies.js';
import { followMovers } from '../game/movers.js';
import { SHAPES, PHASES } from '../core/mountains.js';
import { Timeline, lerpAngle, PREDICT } from './sync.js';
import { MODES, BURNING, TOXIC, CHILLED, ZAPPED, rosterOf, rowOf } from './protocol.js';

const ASK_AGAIN = 1000;   // ms: a viewer without a roster asks the runner again

// --- the runner ------------------------------------------------------------------------------

// The runner's side: when to send a roster (a new cube, new enemies, a viewer new here or
// asking) and the rows
export class Runner {
  constructor() { this.sent = null; this.told = new Set(); }
  // send the roster again: to `slot` (it asked), or to everyone (the enemies changed)
  forget(slot) { if (slot === undefined) this.sent = null; else this.told.delete(slot); }
  // [message, to] pairs to send now, for the viewers (slots) in this cube
  messages(now, viewers) {
    for (const s of this.told) if (!viewers.includes(s)) this.told.delete(s);   // gone: a roster when back
    if (!viewers.length) return [];
    const list = allEnemies(), out = [];
    if (!this.sent || this.sent.cube !== state.cubeKey || list.some(e => e.id && !this.sent.index.has(e))) {
      const ids = list.filter(e => e.id);
      this.sent = { cube: state.cubeKey, ids, index: new Map(ids.map((e, i) => [e, i])) };
      this.told.clear();
    }
    const fresh = viewers.filter(s => !this.told.has(s));
    if (fresh.length) {
      out.push([rosterOf(this.sent.ids, state.cubeKey, state.cubes.seed), fresh]);
      for (const s of fresh) this.told.add(s);
    }
    const rows = [];
    for (const e of list) { const i = this.sent.index.get(e); if (i !== undefined) rows.push(rowOf(e, i, online.slot)); }
    out.push([{ t: 'foes', ts: now, cube: state.cubeKey, list: rows }, viewers]);
    return out;
  }
}

// --- a viewer --------------------------------------------------------------------------------

// an enemy shown here, from its roster entry (the fields the game reads of an enemy)
function replica(entry, profile, i) {
  return { id: entry.id, profile, type: profile.type, level: entry.level, coinDrop: entry.coinDrop, kind: entry.kind,
    guardian: entry.guardian, guardianRole: entry.guardianRole, bossPlaceholder: entry.bossPlaceholder,
    guardianGate: entry.guardianGate, hordeId: entry.hordeId,
    respawn: typeof entry.respawn === 'string' ? entry.respawn : undefined, wave: Number.isInteger(entry.wave) && entry.wave > 0 ? entry.wave : 0,
    boss: entry.boss, proxy: !!entry.proxy, summoned: !!entry.summoned, noReward: !!entry.noReward,
    x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw, hp: entry.hp, mode: entry.mode === 'dead' ? 'dead' : 'idle',
    t: 0, attacks: 0, attack: 0, speed: 0, deadT: entry.mode === 'dead' ? 1e9 : 0, hurtT: 0, stun: 0, cool: 0,
    phase: (i * 0.37) % 1, shownHp: entry.hp };
}

// A viewer's side: the enemies of `runner` (a player number) in this cube, kept where the
// runner says they are. ask(viewer): request this cube's roster from its runner.
// learn: network.html#guess (see learn/README.md)
export class Viewer {
  constructor(runner, ask) {
    this.runner = runner;
    this.ask = () => { this.asked = performance.now(); ask(this); };
    this.asked = -Infinity;
    this.timeline = new Timeline();
    this.byIndex = [];
    this.cube = null;
    this.mirror = { list: [], apply: dt => this.apply(dt), reset: () => this.reset() };
  }
  start() { mirrorEnemies(this.mirror); }
  // keep: the runner left us in this cube, its enemies go on here as we were shown them
  stop(keep = false) {
    const states = keep ? this.mirror.list.filter(e => e.mode !== 'dead')
      .map(e => ({ id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, mode: e.mode })) : null;
    mirrorEnemies(null);
    if (states) adoptEnemies(states);
    this.timeline.clear(); this.byIndex = []; this.cube = null;
  }
  // another player runs them now: shown as they are until its roster comes
  follow(runner) { this.runner = runner; clearProjectiles(); this.reset(); }
  // our cube's enemies went (we came into a cube, died, the world changed): ask for them again
  reset() { this.timeline.clear(); this.byIndex = []; this.cube = null; this.ask(); }
  // every frame: no roster yet (the question went astray, to a player who no longer ran them)
  check(now) { if (!this.cube && now - this.asked > ASK_AGAIN) this.ask(); }

  roster(m) {
    if (m.cube !== state.cubeKey || m.seed !== state.cubes?.seed) return;
    const old = new Map(this.mirror.list.map(e => [e.id, e]));
    const permanent = new Set([...state.run.unlockedGates].map(guardianId));
    this.byIndex = m.list.map((entry, i) => {
      const e = old.get(entry.id);
      // what the runner has alive, we have not defeated (it came back, after a death there)
      if (entry.mode !== 'dead' && !permanent.has(entry.id)) state.run.defeated.delete(entry.id);
      if (e && !(e.mode === 'dead' && entry.mode !== 'dead')) { old.delete(entry.id); return e; }
      return replica(entry, m.profiles[entry.p], i);
    });
    removeEnemyViews([...old.values()]);
    this.mirror.list = [...this.byIndex];
    this.cube = m.cube;
    this.timeline.clear();
  }
  foes(m, now) {
    if (m.cube === this.cube && m.cube === state.cubeKey && Array.isArray(m.list)) this.timeline.push(m, now);
  }
  find(id) { return this.mirror.list.find(e => e.id === id); }

  // every frame: each enemy as the runner had it DELAY ago, blended between two messages
  apply(dt) {
    const span = this.timeline.at(performance.now()), now = performance.now();
    const rowsOf = m => m.rows ??= new Map(m.list.map(r => [r[0], r]));
    const A = span && rowsOf(span.a), B = span && rowsOf(span.b), k = span ? Math.min(1, Math.max(0, span.k)) : 0;
    this.byIndex.forEach((e, i) => {
      e.hurtT = Math.max(0, e.hurtT - dt);
      if (e.mode === 'dead') { e.deadT += dt; return; }   // dead stays dead (also a death we saw first)
      if (!B) return;
      const b = B.get(i), a = A.get(i) ?? b;
      // the runner let it go: no reward for that (a boss's proxies and minions he took along)
      if (!b) { e.mode = 'dead'; e.hp = 0; e.deadT = 1e9; e.noReward = true; return; }
      const mix = j => a[j] + (b[j] - a[j]) * k;
      e.x = mix(1); e.y = mix(2); e.z = mix(3); e.yaw = lerpAngle(a[4], b[4], k);
      e.mode = MODES[b[5]] ?? 'idle';
      e.attacks = b[7]; e.attack = b[8];
      e.t = a[7] === b[7] ? mix(6) : b[6];
      e.speed = mix(9);
      // the runner's word on its health, unless our own hit is newer
      const hp = e.predUntil > now ? Math.min(b[10], e.predHp) : b[10];
      if (b[10] < e.shownHp) e.hurtT = 0.22;   // someone else hurt it
      e.shownHp = b[10];
      e.hp = hp;
      // who hit it last (our own hit stands for a moment, like its health)
      e.lastHit = e.predUntil > now ? null : Number.isInteger(b[13]) ? b[13] : null;
      e.burning = b[11] & BURNING ? e.burning || { shown: true } : null;
      e.toxic = b[11] & TOXIC ? e.toxic || { shown: true } : null;
      e.chilled = b[11] & CHILLED ? e.chilled || { shown: true } : null;
      e.zapped = b[11] & ZAPPED ? 1 : 0;
      if (Number.isInteger(b[14]) && b[14] > 0) e.stage = b[14];   // a boss's stage and light (game/totnar.js)
      e.dark = b[15] === 1 ? 1 : 0;
      // a boss whose stages are profiles of their own (Squarlo a giant, game/squarlo.js), his tide
      // and a Squirtle under the floor (game/enemyai.js)
      const stages = STAGE_PROFILES[e.boss], want = stages?.[(e.stage ?? 1) - 1];
      if (want && e.profile.type !== want.type) e.profile = enemyProfile(want, e.level);
      e.tide = Number.isFinite(b[17]) ? Math.max(-2, Math.min(2, b[17])) : 0;   // (Foggery's lava goes over 1 and drains under 0)
      e.under = b[18] === 1 ? 1 : 0;
      // Flip's world and black holes (game/flipworld.js turns ours after them)
      if (Array.isArray(b[19])) {
        const [orient, turns, holes] = b[19];
        if (Number.isInteger(orient) && Number.isInteger(turns)) { e.orient = orient; e.turns = turns; }
        e.holes = (Array.isArray(holes) ? holes : []).filter(Array.isArray).map(([n, x, y, z, t, life]) =>
          Object.assign((e.holes ?? []).find(h => h.n === n) ?? { n }, { x, y, z, t, life }));
      }
      // Foggery's eyes, his shield and the clock of his platforms (game/foggery.js, game/movers.js)
      if (Array.isArray(b[20])) {
        const [eyes, guard, clock] = b[20];
        if (Array.isArray(eyes)) e.eyes = eyes.map(v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);
        e.guard = guard === 1 ? 1 : 0;
        followMovers(clock);
      }
      // Renew's time (game/renew.js): our own hero lives it after him (game/rewind.js)
      if (Array.isArray(b[21])) {
        const [clock, rewinding, on] = b[21], before = Array.isArray(a[21]) && a[21][1] === rewinding ? a[21][0] : clock;
        if (Number.isFinite(clock) && Number.isFinite(before)) e.clock = Math.max(0, before + (clock - before) * k);
        e.rewinding = rewinding === 1; e.on = on === 1;
        const risen = b[21][3];
        e.ascended = risen === 2;
        e.rising = Number.isFinite(risen) && risen > 0 && risen < 2 ? { u: Math.min(1, risen) } : null;
      }
      // Slomo's slug arms and his flood's side and front (game/slomo.js; game/tide.js floods ours after them)
      if (Array.isArray(b[22])) {
        const [arms, side, front] = b[22];
        if (Array.isArray(arms)) e.arms = arms.map(v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);
        e.floodSide = Number.isInteger(side) && side >= 0 && side < 4 ? side : 0;
        e.front = Number.isFinite(front) ? Math.max(0, Math.min(1, front)) : 1;
      }
      // Mansk's lift, his horns, his ribbons and his slowed time (game/mansk.js)
      if (Array.isArray(b[23])) {
        const [lift, horns, grow, slowing] = b[23], before = Array.isArray(a[23]) ? a[23][0] : lift;
        if (Number.isFinite(lift) && Number.isFinite(before)) e.lift = Math.max(0, Math.min(4, before + (lift - before) * k));
        e.horns = horns === 0 ? 0 : 1;
        e.grow = Number.isFinite(grow) ? Math.max(0, Math.min(1, grow)) : 0;
        e.slowing = Number.isFinite(slowing) ? Math.max(0, Math.min(10, slowing)) : 0;
      }
      // Monteur's stones, how far round he has turned the world and his mountain (game/monteur.js;
      // game/roll.js turns ours after it, game/mountains.js raises ours after it)
      if (Array.isArray(b[24])) {
        const [stones, quarter, mountain] = b[24];
        e.stones = Number.isFinite(stones) ? Math.max(0, Math.min(5, stones)) : 5;
        e.quarter = Number.isInteger(quarter) && quarter >= 0 && quarter < 4 ? quarter : 0;
        e.mountain = mountainOf(mountain, e.mountain);
      }
      if (e.mode === 'dead') { e.hp = 0; e.deadT = b[6]; e.dark = 0; (e.beam || e.bolts) && mirrorBeam(e, null); return; }
      mirrorBeam(e, Array.isArray(b[12]) ? b[12] : null, Array.isArray(b[16]) ? b[16] : null);
    });
    // corpses go once they have lain their time
    const gone = this.mirror.list.filter(e => e.mode === 'dead' && e.deadT >= e.profile.corpseTime);
    if (gone.length) {
      removeEnemyViews(gone);
      this.mirror.list = this.mirror.list.filter(e => !gone.includes(e));
    }
  }
  // our own hit on e: our result stands for a moment against older word from the runner
  predicted(e) { e.predHp = e.hp; e.predUntil = performance.now() + PREDICT; e.lastHit = null; }
}

// is the player able to take a blow from the runner's enemies now?
export const canBeHit = () => player.hp > 0 && !player.ragdoll && !state.transitioning;

// Monteur's mountain from his row ([n, seed, x, z, shape, a, phase, t, life], net/protocol.js), the
// one he had kept if it is the same (game/mountains.js runs its clock on between rows); null: none
function mountainOf(row, had) {
  if (!Array.isArray(row)) return null;
  const [n, seed, x, z, shape, a, phase, t, life] = row;
  if (![n, seed, x, z, a, t, life].every(Number.isFinite) || !SHAPES[shape] || !PHASES[phase]) return null;
  const m = had?.n === n ? had : { n, seed, x, z, shape: SHAPES[shape], a };
  return Object.assign(m, { phase: PHASES[phase], t, life });
}
