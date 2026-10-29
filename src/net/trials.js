// A trial room when playing together (docs/trials.md "Playing together"; net/session.js wires
// this up). The player who runs the cube's enemies (net/foes.js, protocol.js runnerOf) owns its
// trial too: its game runs the clock and the rules and tells the others in the cube
//   trial     { key, seed, phase, time, gate?, stage?, bits? }  owner -> those in the cube: when the phase
//             or a puzzle's bits (core/trials.js) change,
//             every TRIAL_EVERY ms while it runs, and at once to one who just came in (who joins it
//             in progress, sealed); a resolved trial goes to everyone, with its gate (opened for all)
//   trialAct  { key, act, id? }               the others -> the owner: 'away' (I stepped off the
//             arrival pad: arm it), 'part' (I used part `id`)
// One who fails goes to the room before and the trial goes on for the others; with nobody left
// in the room, nobody runs it: the next one in finds it as built. One the robot carries back to the
// start waits there while the others go on (the last one in it spends it: game/trials.js). Pure: testable in node.
import { TRIALS, ARM_TIME } from '../core/trials.js';

export const TRIAL_EVERY = 1000;
const PHASES = new Set(['idle', 'armed', 'running', 'resolved', 'spent']);
const ACTS = new Set(['away', 'part']);

// a `trial` message as it may be used, or null
export function trialMessage(m) {
  if (!m || typeof m.key !== 'string' || !PHASES.has(m.phase) || !Number.isFinite(m.time) || m.time < 0 || !Number.isFinite(m.seed)) return null;
  if (m.gate != null && (typeof m.gate !== 'string' || !m.gate.startsWith('trial:'))) return null;
  if (m.stage != null && (!Number.isInteger(m.stage) || m.stage < 0 || m.stage > 9)) return null;
  const bits = m.bits && typeof m.bits === 'object' && !Array.isArray(m.bits) && Object.keys(m.bits).length < 200
    && Object.values(m.bits).every(v => Number.isInteger(v) && v >= 0 && v < 1000) ? m.bits : null;
  const stones = m.stones && typeof m.stones === 'object' && !Array.isArray(m.stones) && Object.keys(m.stones).length <= 64
    && Object.entries(m.stones).every(([k, v]) => /^\d+$/.test(k) && Number.isFinite(v) && v >= 0 && v <= m.time) ? m.stones : null;
  return { key: m.key, seed: m.seed, phase: m.phase, time: m.time, gate: m.gate ?? null, ...m.stage != null && { stage: m.stage }, ...bits && { bits }, ...stones && { stones } };
}
// a `trialAct` message as it may be used, or null
export function trialAct(m) {
  if (!m || typeof m.key !== 'string' || !ACTS.has(m.act)) return null;
  if (m.act === 'part' && typeof m.id !== 'string') return null;
  return { key: m.key, act: m.act, id: m.act === 'part' ? m.id : null };
}

// The owner's side: what to tell the others in the cube about its trial state s, and when
export class TrialOwner {
  constructor() { this.key = null; this.phase = null; this.bits = ''; this.last = -Infinity; this.told = new Set(); }
  // [message, to] pairs to send now; viewers: the slots of the others in the cube
  messages(now, viewers, s, seed) {
    if (!s) { this.key = null; this.told.clear(); return []; }
    if (s.key !== this.key) { this.key = s.key; this.phase = null; this.told.clear(); }
    for (const v of this.told) if (!viewers.includes(v)) this.told.delete(v);
    const bits = JSON.stringify([s.bits ?? {}, s.stones ?? {}]);
    const m = { t: 'trial', key: s.key, seed, phase: s.phase, time: Math.round(s.t * 100) / 100, bits: s.bits ?? {}, ...s.stage != null && { stage: s.stage }, ...s.stones && { stones: Object.fromEntries(Object.entries(s.stones).map(([id, t]) => [id, Math.round(t * 100) / 100])) } };
    const live = s.phase === 'armed' || s.phase === 'running';
    if (s.phase !== this.phase || bits !== this.bits || (live && now - this.last >= TRIAL_EVERY)) {
      this.phase = s.phase; this.bits = bits; this.last = now;
      for (const v of viewers) this.told.add(v);
      return viewers.length ? [[m, viewers]] : [];
    }
    const fresh = viewers.filter(v => !this.told.has(v));
    for (const v of fresh) this.told.add(v);
    return fresh.length ? [[m, fresh]] : [];
  }
}

// A viewer's side: its state s of the trial follows the owner's word m (trialMessage). Returns
// the phase it came into ('armed', 'running', 'resolved', 'idle', 'spent'), or null when it stayed.
export function followTrial(s, m) {
  if (!s || !m || m.key !== s.key) return null;
  const before = s.phase;
  if (before === 'resolved') return null;   // resolved stays resolved
  if (m.phase === 'resolved') { s.phase = 'resolved'; s.done = 0; return 'resolved'; }
  if (m.bits) s.bits = { ...m.bits };
  if (s.kind === 'balance' && m.stones) s.stones = { ...m.stones };
  // spent (core/trials.js spendTrial: the robot carried its last one in it back to the start): its
  // water is gone by the time anyone comes in
  if (m.phase === 'spent' && before !== 'spent') { s.done = Infinity; s.at = null; }
  s.phase = m.phase; s.t = m.time;
  // the clock is the owner's: between its words it runs on here (arming turns to running by itself)
  if (s.phase === 'armed' && s.t >= ARM_TIME && TRIALS[s.kind]) s.phase = 'running';
  return s.phase !== before ? s.phase : null;
}
