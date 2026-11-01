// Renew's time, as this game's own hero lives it (core/renew.js has the rules, game/renew.js runs
// his fight; docs/bosses.md). Every game does this for its own hero, after the Renew it runs or is
// shown (his `on`, `stage`, `clock` and `rewinding`, sent to friends with his row):
//   - while the fight is on and time runs forward, a tape of the hero (where, how posed, the
//     health, the attack in hand, render/partner.js capturePose) and of the shots in flight, at
//     the room's clock;
//   - while time runs back, the hero is put where the tape has them at the clock (carried, warded:
//     `player.flipping`, no steering, nothing hurts them), posed as they were (render/renewview.js
//     poseHero), the shots flying back (drawn, harmless), and the view goes pale and blue
//     (style.css `body.rewinding`);
//   - once it has run back to the start of the phase, the hero stands where they stood then, with
//     the health they had, and the tape becomes an echo: the hero's past self, doing again what
//     they did in that phase, at the room's clock (its blows and shots hurt the hero); and the
//     bodies of the fight on the tape become ghosts, him and his minions as they were then,
//     fighting the echo again (harmless: drawn only);
//   - beaten, he rewinds once more but rises away as a ghost instead of coming back; the echoes and
//     ghosts fight on a while, harmless, and fade;
//   - the dusk: how dark the fight has got (state.dusk, render/look.js), never lighter till he is
//     beaten.
import { player, state } from './state.js';
import { RENEW_FIGHT as G, newTape, record, spanAt, tapeLength, lerp, lerpYaw, echoEvents, inStrike, duskAt, bodyRow, bodiesAt } from '../core/renew.js';
import { equippedWeapon, readiedFlask, cancelSwing } from '../core/combat.js';
import { groundAt } from '../physics/collide.js';
import { capturePose } from '../render/partner.js';
import { character } from '../render/character.js';
import { poseHero, drawEchoes, removeEchoViews } from '../render/renewview.js';
import { projectiles, addProjectile, clearProjectiles } from './projectiles.js';
import { shots, clearShots } from './shots.js';
import { drawProjectiles, removeProjectileViews } from '../render/projectiles.js';
import { animateEnemies, removeEnemyViews } from '../render/enemies.js';
import { drawShots, removeShotViews } from '../render/shots.js';
import { hitBody } from './enemycombat.js';
import { sfx } from '../audio/sfx.js';
import { msg } from '../i18n/i18n.js';

let boss = null, stage = 0, tape = newTape(), next = 0, rewinding = false, echoes = [], dusk = 0;
let ghosts = { pr: new Set(), shots: new Set() }, whirr = 0, outro = 0;

export function resetRewind() {
  if (rewinding && player.flipping?.kind === 'rewind') player.flipping = null;
  rewinding = false; boss = null; stage = 0; tape = newTape(); next = 0; dusk = 0; state.dusk = 0; outro = 0;
  removeEchoViews(echoes); for (const x of echoes) removeEnemyViews(x.ghosts); echoes = [];
  dropGhosts(); poseHero(null); pale(false);
}

// for the checks (tests/browser/renew.js)
export const echoesNow = () => echoes;
export const rewindInfo = () => ({ rewinding, echoes: echoes.filter(x => !x.going).length, frames: tape.frames.length, dusk,
  shown: echoes.filter(x => x.view?.group.visible).length });

// every step, after the enemies (list: the ones run or shown here)
export function updateRewind(dt, list) {
  const e = list.find(b => b.boss === 'renew' && b.profile?.figure && b.mode !== 'gone');
  if (e !== boss) { resetRewind(); boss = e ?? null; stage = e?.stage ?? 0; }
  if (!e || !e.on) return;
  if (e.stage !== stage) {   // a new phase (the rewind is over; or missed: a friend's game joining late)
    if (!rewinding) { tape = newTape(); next = 0; }
    stage = e.stage;
  }
  if (rewinding && !e.rewinding) finish();   // back at the start of the phase
  // Beaten (his last rewind over, he rises away, then he is gone): the echoes and the ghosts fight
  // on, harmless now, the room's clock running on, and fade a while after he is gone; the light
  // comes back once he is
  if (e.rising || e.mode === 'dead') {
    outro = e.rising ? e.clock ?? outro : outro + dt;
    for (const x of echoes) { x.at = outro; ghostsOf(x); if (e.mode === 'dead' && e.deadT > G.outro) x.going = true; }
    if (e.mode === 'dead') state.dusk = dusk = 0;
    return;
  }
  const clock = e.clock ?? 0;
  if (e.rewinding) {
    if (!rewinding) begin();
    play(clock, dt);
  } else {
    if (clock >= next) { tapeHero(clock, list); next = clock + G.sample; }
    for (const x of echoes) strikeAs(x, clock, e);
  }
  for (const x of echoes) { x.at = clock; ghostsOf(x); }
  // darker the more of his health is gone in a phase, a third darker every phase; at the next
  // phase's while he rewinds
  dusk = Math.max(dusk, e.rewinding ? duskAt(e.stage + 1, 0) : duskAt(e.stage, 1 - e.hp / e.profile.hp));
  state.dusk = dusk;
}

// what our hero is now: where, how posed, the health, the attack in hand (sw: core/renew.js
// echoEvents), the weapon; the shots in flight; and every body of the fight (him, his minions:
// core/renew.js bodyRow), for the ghosts of them that fight the echo
function tapeHero(clock, list) {
  const p = player, s = p.sword, st = s.stats;
  record(tape, clock, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, grounded: p.grounded, pose: capturePose(),
    weapon: (readiedFlask(p) ?? equippedWeapon(p))?.model ?? null, look: character.look ?? '',   // (in its look: core/looks.js)
    sw: s.active && st ? { n: s.serial, t: s.t, yaw: s.yaw, fired: s.fired, ranged: !!st.ranged, kind: st.kind, range: st.range,
      arc: st.arc, a0: st.activeStart, a1: st.activeEnd, color: st.color ?? null, balls: st.balls ?? 1 } : null,
    pr: projectiles.map(pr => [pr, pr.x, pr.y, pr.z]), shots: shots.map(sh => [sh, sh.x, sh.y, sh.z]),
    bodies: list.filter(b => b.mode !== 'gone' && !b.ghost).map(bodyRow) });
}

// time starts running back: the hero is carried by the tape from now on, and nothing hurts them
function begin() {
  rewinding = true;
  clearShots(); clearProjectiles();   // (they fly back with the tape instead)
  if (player.hp > 0 && tape.frames.length) {
    cancelSwing(player, true);
    Object.assign(player, { flipping: { kind: 'rewind' }, ragdoll: null, getUp: null, held: null, pull: null, gust: null,
      burning: null, chilled: null, slowed: null, toxic: null, stun: 0, vx: 0, vy: 0, vz: 0 });
  }
  pale(true); whirr = 0;
}
function play(clock, dt) {
  const span = spanAt(tape, clock);
  if ((whirr -= dt) <= 0) { sfx('rewind', { volume: 0.7 }); whirr = 2.2; }
  if (!span) return;
  const { a, b, k } = span;
  if (player.flipping?.kind === 'rewind') {
    const y = lerp(a.y, b.y, k);
    Object.assign(player, { x: lerp(a.x, b.x, k), y, visY: y, z: lerp(a.z, b.z, k), yaw: lerpYaw(a.yaw, b.yaw, k),
      hp: Math.max(1, Math.round(lerp(a.hp, b.hp, k))) });
    poseHero(a.pose && b.pose ? { a: a.pose, b: b.pose, k } : null);
  }
  // the shots that were in flight, flying back
  ghostsAt(a.pr, b.pr, k, ghosts.pr, removeProjectileViews);
  ghostsAt(a.shots, b.shots, k, ghosts.shots, removeShotViews);
}
function ghostsAt(A = [], B = [], k, shown, remove) {
  const at = new Map(B.map(r => [r[0], r])), now = new Set();
  for (const r of A) {
    const o = at.get(r[0]) ?? r, g = r[0];
    g.x = lerp(r[1], o[1], k); g.y = lerp(r[2], o[2], k); g.z = lerp(r[3], o[3], k);
    now.add(g);
  }
  remove([...shown].filter(g => !now.has(g)));
  shown.clear();
  for (const g of now) shown.add(g);
}
function dropGhosts() {
  removeProjectileViews([...ghosts.pr]); removeShotViews([...ghosts.shots]);
  ghosts = { pr: new Set(), shots: new Set() };
}
// drawn with the enemies (game/enemies.js drawEnemies): the shots flying back, and the echoes
export function drawRewind(dt, off) {
  if (ghosts.pr.size) drawProjectiles([...ghosts.pr], dt, off);
  if (ghosts.shots.size) drawShots([...ghosts.shots], dt, off);
  drawEchoes(echoes.map(x => echoPose(x, dt)), dt, off);
  for (const x of echoes) {
    for (const g of x.ghosts) g.ghostAlpha = x.life;
    if (x.life <= 0 && x.going) { removeEnemyViews(x.ghosts); continue; }
    animateEnemies(x.ghosts.filter(g => x.life > 0 || g.view), dt, off);
  }
}

// The ghosts of the fight an echo was in: him and his minions as they were then, fighting it
// again (harmless: they only do what they did; drawn pale and see-through, render/enemies.js
// ghostLook), each where the echo's tape has it at the room's clock (not there then: gone)
const ghostOf = b => ({ ghost: true, id: `ghost:${b.id ?? ''}`, profile: b.profile, type: b.type, level: b.level, boss: b.boss,
  stage: b.stage, x: b.x, y: b.y, z: b.z, yaw: b.yaw, mode: 'gone', t: 0, attack: 0, attacks: 0, speed: 0, hp: b.hp, deadT: 0,
  hurtT: 0, phase: 0, ghostAlpha: 0, view: null });
function ghostsOf(x) {
  const now = bodiesAt(x.tape, Math.min(x.at, x.length));
  x.ghosts.forEach((g, i) => {
    const was = now.get(x.bodies[i]);
    if (!was) { g.mode = 'gone'; return; }
    const { f, ...state } = was;
    Object.assign(g, state);
  });
}

// back at the start of the phase: the hero stands where they stood then, and their past self
// walks again
function finish() {
  rewinding = false;
  const first = tape.frames[0];
  if (first && player.flipping?.kind === 'rewind') {
    const g = groundAt(first.x, first.z, first.y + 0.3, player.r);
    Object.assign(player, { x: first.x, y: first.y, visY: first.y, z: first.z, yaw: first.yaw, hp: Math.max(1, first.hp),
      vx: 0, vy: 0, vz: 0, grounded: true, airTime: 0, support: g.s ?? player.support, flipping: null });
  }
  poseHero(null);
  dropGhosts();
  pale(false);
  for (const x of echoes) { x.struck = 0; x.shot = 0; }   // (the echoes before do it all again too)
  if (tape.frames.length > 1) {
    const bodies = [...new Set(tape.frames.flatMap(fr => fr.bodies.map(row => row[0])))];
    echoes.push({ tape, length: tapeLength(tape), ...echoEvents(tape), at: 0, struck: 0, shot: 0, life: 0, going: false, view: null,
      bodies, ghosts: bodies.map(ghostOf) });
  }
  tape = newTape(); next = 0;
  sfx('rewound');
}

// An echo where the clock has it (null once its tape is over: it fades away), how solid it looks
function echoPose(x, dt) {
  const there = x.at <= x.length && !x.going;
  x.life = Math.max(0, Math.min(1, x.life + (there ? dt : -dt) / G.echo.fade));
  if (x.life <= 0 && x.going) return { echo: x, span: null, alpha: 0 };
  const span = spanAt(x.tape, Math.min(x.at, x.length));
  return { echo: x, span, alpha: x.life };
}
// As the clock runs on, the echo strikes the blows and lets go the shots the hero did: they hurt
// our hero (e: Renew, whose strength they have)
function strikeAs(x, clock, e) {
  if (x.going) return;
  const blow = { damage: Math.max(1, Math.round(e.profile.damage * G.echo.power)), knock: 3.5, knockDown: false, hop: 3,
    reason: msg('Struck by your own echo!'), by: { words: msg('your echo'), level: player.level, guardian: false } };
  const can = player.hp > 0 && !player.flipping && !player.ragdoll && !player.held;
  while (x.struck < x.strikes.length && x.strikes[x.struck].t <= clock) {
    const s = x.strikes[x.struck++];
    if (s.t < clock - 0.3 || !can || !inStrike(s, player)) continue;
    const dx = player.x - s.x, dz = player.z - s.z, d = Math.hypot(dx, dz) || 1;
    hitBody(player, blow, s.x, s.z, dx / d, dz / d);
    sfx('hit', { at: player, pitch: 1.2 });
  }
  while (x.shot < x.shots.length && x.shots[x.shot].t <= clock) {
    const s = x.shots[x.shot++];
    if (s.t < clock - 0.3) continue;
    const spec = { kind: 'orb', speed: 8, radius: 0.15, range: 7, color: '#ffe9a8', muzzle: [0, 0.75, 0.35] };
    const sx = Math.sin(s.yaw), cz = Math.cos(s.yaw);
    addProjectile({ kind: 'orb', spec, x: s.x + sx * 0.35, y: s.y + 0.75, z: s.z + cz * 0.35, vx: sx * spec.speed, vy: 0, vz: cz * spec.speed,
      travelled: 0, t: 0, blow: { ...blow, reason: msg('Shot by your own echo!') }, profile: null, only: player });
  }
}

// the view goes pale and blue while time runs back
function pale(on) {
  if (typeof document !== 'undefined') document.body.classList.toggle('rewinding', on);
}
