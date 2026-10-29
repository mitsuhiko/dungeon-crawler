import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomCode, readCode, CODE_LETTERS, CODE_LENGTH, cleanName, packPose, isPose, isMe, BONES, Q,
  MAX_PLAYERS, RELAYED, isFor, validTo, freeSlot, runnerOf, robotOf, ROBOT_CLIPS } from '../src/net/protocol.js';
import { Timeline, lerpAngle, DELAY } from '../src/net/sync.js';
import { TrialOwner, trialMessage, trialAct, followTrial, TRIAL_EVERY } from '../src/net/trials.js';
import { newTrial, stepTrial, trialSealed, ARM_TIME } from '../src/core/trials.js';

test('room codes are four letters without I and O', () => {
  assert.ok(!CODE_LETTERS.includes('I') && !CODE_LETTERS.includes('O'));
  for (let i = 0; i < 200; i++) {
    const code = roomCode();
    assert.equal(code.length, CODE_LENGTH);
    assert.equal(readCode(code), code);
  }
  assert.equal(roomCode(() => 0), 'AAAA');
  assert.equal(roomCode(() => 0.9999), 'ZZZZ');
});

test('a typed code or a pasted link reads as the code', () => {
  assert.equal(readCode(' abcd '), 'ABCD');
  assert.equal(readCode('ab-cd'), 'ABCD');
  assert.equal(readCode('https://example.com/game/?join=WXYZ&net=local'), 'WXYZ');
  assert.equal(readCode('abc'), null);
  assert.equal(readCode('abcde'), null);
  assert.equal(readCode('ABIO'), null);   // letters a code never has
  assert.equal(readCode(null), null);
});

test('names are short plain text', () => {
  assert.equal(cleanName('  Anna '), 'Anna');
  assert.equal(cleanName(''), 'Friend');
  assert.equal(cleanName('a\nb'), 'ab');
  assert.equal(cleanName('x'.repeat(40)).length, 16);
});

test('a pose packs into whole numbers and checks out', () => {
  const quats = BONES.flatMap(() => [0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  const pose = packPose([1.23456, 2, 3], 0.5, [0, 0.69, 0.01], quats);
  assert.deepEqual(pose.p, [1.235, 2, 3]);
  assert.ok(pose.q.every(Number.isInteger));
  assert.equal(pose.q[1], Math.round(Math.SQRT1_2 * Q));
  assert.ok(isPose(pose));
  assert.ok(!isPose({ ...pose, q: pose.q.slice(1) }));
  assert.ok(!isPose({ ...pose, p: [1, 2, NaN] }));
  const me = { t: 'me', ts: 1, seed: 7, cube: '0,0,0', pose, body: [1, 2, 3, 0, 0], hp: 10, maxHp: 10 };
  assert.ok(isMe(me));
  assert.ok(!isMe({ ...me, cube: 3 }));
  assert.ok(!isMe({ ...me, pose: null }));
});

// everyone sees everyone's robot (game/robot.js robotWord): its cube, place, yaw, fade and clip
test("a `me` says where the player's robot is and what it does", () => {
  assert.deepEqual(robotOf(['0,0,0', 1.5, 2, 3, 0.5, 0.25, ROBOT_CLIPS.indexOf('fly')]),
    { k: '0,0,0', x: 1.5, y: 2, z: 3, yaw: 0.5, fade: 0.25, clip: 'fly' });
  assert.equal(robotOf(['0,0,0', 1, 2, 3, 0, 4, 99]).fade, 1);
  assert.equal(robotOf(['0,0,0', 1, 2, 3, 0, 1, 99]).clip, 'hover');
  for (const bad of [undefined, null, [], ['0,0,0', 1, 2, 3, 0, 1], [7, 1, 2, 3, 0, 1, 0], ['0,0,0', 1, NaN, 3, 0, 1, 0], 'robot'])
    assert.equal(robotOf(bad), null);
});

test('messages go to everyone, one player or a few', () => {
  assert.ok(isFor(undefined, 2));
  assert.ok(isFor(2, 2) && !isFor(1, 2));
  assert.ok(isFor([0, 3], 3) && !isFor([0, 3], 1));
  assert.ok(validTo(undefined) && validTo(3) && validTo([1, 2]));
  assert.ok(!validTo('all') && !validTo([1, 'x']) && !validTo({}) && !validTo(1.5));
  // what only the host may say does not go on from a guest
  for (const t of ['hello', 'welcome', 'joined', 'left', 'world', 'full', 'version', 'bye', 'ping']) assert.ok(!RELAYED.has(t));
});

test('guests get the free numbers, and their own back', () => {
  assert.equal(MAX_PLAYERS, 4);
  assert.equal(freeSlot(new Set()), 1);
  assert.equal(freeSlot(new Set([1, 3])), 2);
  assert.equal(freeSlot(new Set([1, 2, 3])), null);   // full: the host and three guests
  assert.equal(freeSlot(new Set([1]), 3), 3);           // back after a lost connection
  assert.equal(freeSlot(new Set([3]), 3), 1);           // ... unless someone has it now
  assert.equal(freeSlot(new Set(), 0), 1);              // never the host's
});

test('the lowest player number in a cube runs its enemies', () => {
  assert.equal(runnerOf([2]), 2);
  assert.equal(runnerOf([2, 1, 3]), 1);
  assert.equal(runnerOf([3, 0]), 0);   // the host, when it is there
});

const me = (ts, x = ts / 100) => ({ ts, x });

test('the timeline shows the partner a little in the past, blending two messages', () => {
  const tl = new Timeline();
  assert.equal(tl.at(0), null);
  // sent every 50 ms, arriving 30 ms later (their clock is 1000 ms behind ours)
  for (let ts = 0; ts <= 500; ts += 50) tl.push(me(ts), ts + 1000 + 30);
  const span = tl.at(1530);   // shown: their clock at 1530 - 1030 - DELAY
  const t = 500 - DELAY;
  assert.ok(span.a.ts <= t && span.b.ts > t);
  assert.ok(Math.abs(span.a.ts + span.k * (span.b.ts - span.a.ts) - t) < 1e-9);
  assert.equal(tl.latest().ts, 500);
});

test('the timeline holds the newest message when nothing newer came, and drops late ones', () => {
  const tl = new Timeline();
  tl.push(me(0), 10); tl.push(me(50), 60);
  tl.push(me(20), 70);   // sent before the last one: ignored
  assert.equal(tl.list.length, 2);
  const span = tl.at(5000);
  assert.equal(span.a.ts, 50); assert.equal(span.b.ts, 50); assert.equal(span.k, 0);
  // jitter: a message that took longer does not move the clock offset
  tl.push(me(100), 180);
  assert.equal(tl.offset, 10);
});

test('angles blend the short way round', () => {
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - (3 + (2 * Math.PI - 6) / 2)) < 1e-9);
  assert.equal(lerpAngle(0, 1, 0.25), 0.25);
});

// --- fighting together ---------------------------------------------------------------------
import './fixtures.js';
const { chooseTarget, nearestTo, alive, SWITCH } = await import('../src/game/party.js');
const { stepProjectile } = await import('../src/core/projectiles.js');
const { rowOf, rosterOf, MODES } = await import('../src/net/protocol.js');

const body = (x, z, more = {}) => ({ x, y: 0, z, r: 0.22, h: 0.85, hp: 10, ragdoll: null, ...more });

test('an enemy goes after the nearer player and does not dither between two', () => {
  const a = body(0, 0), b = body(5, 0), e = { x: 4, y: 0, z: 0, mode: 'chase' };
  assert.equal(chooseTarget(e, [a, b]), b);
  e.target = b; e.x = 2.4;   // a is a little nearer now: it stays with b
  assert.equal(chooseTarget(e, [a, b]), b);
  e.x = 2.5 - SWITCH;        // a is clearly nearer
  assert.equal(chooseTarget(e, [a, b]), a);
  e.target = b; e.mode = 'attack';   // never in the middle of an attack
  assert.equal(chooseTarget(e, [a, b]), b);
  e.mode = 'chase';
  b.ragdoll = {};            // a fallen player is not gone after
  e.x = 5;
  assert.equal(chooseTarget(e, [a, b]), a);
  a.hp = 0;                  // nobody to hurt: it keeps its target
  assert.equal(chooseTarget(e, [a, b]), b);
  assert.equal(chooseTarget(e, [a]), a);
  assert.ok(!alive(a) && !alive(null));
  assert.equal(nearestTo(5, 0, [body(0, 0), body(4, 0)]).x, 4);
});

test('a projectile hits whichever player it touches first', () => {
  const pr = { spec: { speed: 10, radius: 0.1, range: 20 }, x: 0, y: 0.5, z: 0, vx: 10, vy: 0, vz: 0, travelled: 0, t: 0 };
  const near = body(3, 0), far = body(6, 0);
  let end = null;
  for (let i = 0; !end && i < 100; i++) end = stepProjectile(pr, 1 / 60, [far, near], () => false);
  assert.equal(end, 'hit');
  assert.equal(pr.victim, near);
});

test('the runner describes its enemies compactly for the others', () => {
  const profile = { type: 'snake', hp: 48, corpseTime: 3 };
  const e = { id: 'k:snake:1', profile, level: 2, coinDrop: 5, kind: { xp: 10, dropXP: undefined, dropScale: 1 },
    x: 1.23456, y: 2, z: 3, yaw: 0.5, hp: 40, mode: 'attack', t: 0.333, attacks: 3, attack: 1, speed: 0,
    burning: {}, toxic: null, beam: { t: 0.2, ex: 4, ey: 1, ez: 5 } };
  const row = rowOf(e, 7);
  assert.deepEqual(row, [7, 1.23, 2, 3, 0.5, MODES.indexOf('attack'), 0.33, 3, 1, 0, 40, 1, [0.2, 4, 1, 5], 0, 0, 0, 0, 0, 0]);
  // who hit it last: the runner (player 2 here) unless a friend did
  assert.equal(rowOf(e, 7, 2)[13], 2);
  assert.equal(rowOf({ ...e, lastHit: 3 }, 7, 2)[13], 3);
  // a boss's stage, its dark and the other bolts of its storm (game/totnar.js)
  const storm = rowOf({ ...e, stage: 3, dark: 1, bolts: [{ t: 0.2, ex: 6, ey: 1, ez: 5 }, { t: 0.2, ex: 2, ey: 1.004, ez: 4 }] }, 7);
  assert.deepEqual(storm.slice(14), [3, 1, [[0.2, 6, 1, 5], [0.2, 2, 1, 4]], 0, 0]);
  // Squarlo's tide and a Squirtle under the floor (game/squarlo.js, game/enemyai.js)
  assert.deepEqual(rowOf({ ...e, stage: 2, tide: 0.4567 }, 7).slice(14), [2, 0, 0, 0.46, 0]);
  assert.equal(rowOf({ ...e, under: 1 }, 7)[18], 1);
  const roster = rosterOf([e, { ...e, id: 'k:snake:2' }], 'k', 9);
  assert.equal(roster.profiles.length, 1);   // a pack shares its profile
  assert.deepEqual(roster.list.map(x => x.p), [0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(roster)).list[1].id, 'k:snake:2');
});

test('a painted skin goes in pieces small enough for one message each', async () => {
  const { SKIN_PIECE, SKIN_PIECES, SKIN_BYTES, skinIdOf, skinPieces, isSkinPiece, toBase64, fromBase64 } = await import('../src/net/protocol.js');
  const { isSkinPng, SKIN_SIZE } = await import('../src/core/skin.js');
  const { encodeMessage } = await import('../src/net/wire.js');
  assert.ok(RELAYED.has('skin') && RELAYED.has('skinWant'));
  assert.equal(skinIdOf('skin-1234-abcd'), 'skin-1234-abcd');
  for (const bad of [null, 3, '', 'skin-', 'skin-../x', 'other-1']) assert.equal(skinIdOf(bad), null);
  // a PNG header of SKIN_SIZE², then anything
  const png = new Uint8Array(40000);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, SKIN_SIZE); new DataView(png.buffer).setUint32(20, SKIN_SIZE);
  for (let i = 24; i < png.length; i++) png[i] = (i * 7919) & 255;
  assert.ok(isSkinPng(png));
  const small = png.slice(); new DataView(small.buffer).setUint32(20, 64);
  assert.ok(!isSkinPng(small) && !isSkinPng(png.subarray(1)) && !isSkinPng(null));
  const pieces = skinPieces(toBase64(png));
  assert.ok(pieces.length > 1 && pieces.every(p => p.length <= SKIN_PIECE));
  const messages = pieces.map((data, n) => ({ t: 'skin', id: 'skin-x', n, of: pieces.length, data }));
  for (const m of messages) {
    assert.ok(isSkinPiece(m));
    assert.equal(encodeMessage({ ...m, from: 3, to: 2 }, 1).length, 1);   // one frame each (net/wire.js)
  }
  assert.deepEqual(fromBase64(pieces.join('')), png);
  const m = messages[0];
  for (const bad of [{ ...m, id: 'x' }, { ...m, n: m.of }, { ...m, n: -1 }, { ...m, of: SKIN_PIECES + 1 }, { ...m, data: 'a"b' },
    { ...m, data: 'A'.repeat(SKIN_PIECE + 1) }, { ...m, t: 'me' }]) assert.ok(!isSkinPiece(bad));
  // the largest skin that goes still fits in SKIN_PIECES
  assert.ok(Math.ceil(Math.ceil(SKIN_BYTES / 3) * 4 / SKIN_PIECE) <= SKIN_PIECES);
});

test('a trial room: its owner tells those in the cube its state, on a change, every second, and at once to one who comes in', () => {
  const owner = new TrialOwner(), s = newTrial({ key: 'k', kind: 'flood' });
  assert.deepEqual(owner.messages(0, [], s, 7), []);
  // a viewer in the cube: told at once, then only when something changes
  let out = owner.messages(10, [1], s, 7);
  assert.equal(out.length, 1); assert.deepEqual(out[0][1], [1]);
  assert.equal(out[0][0].t, 'trial');
  assert.deepEqual(trialMessage(out[0][0]), { key: 'k', seed: 7, phase: 'idle', time: 0, gate: null, bits: {} });
  // a puzzle's bits changing: told at once
  s.bits = { lever: 1 };
  assert.deepEqual(owner.messages(15, [1], s, 7).map(([m]) => m.bits), [{ lever: 1 }]);
  s.bits = {};
  owner.messages(16, [1], s, 7);
  assert.deepEqual(owner.messages(20, [1], s, 7), []);
  // armed: everyone hears, and every TRIAL_EVERY while it runs
  stepTrial(s, 0, { away: true });
  out = owner.messages(30, [1], s, 7);
  assert.equal(out[0][0].phase, 'armed');
  stepTrial(s, 0.5);
  assert.deepEqual(owner.messages(500, [1], s, 7), []);
  assert.equal(owner.messages(30 + TRIAL_EVERY, [1], s, 7).length, 1);
  // a friend coming in while it runs: told at once (and only they)
  stepTrial(s, ARM_TIME);
  owner.messages(2000, [1], s, 7);
  out = owner.messages(2100, [1, 2], s, 7);
  assert.deepEqual(out.map(([m, to]) => [m.phase, to]), [['running', [2]]]);
});

test('a trial room: one shown it follows its owner (joining in progress sealed), an act goes back, resolved is resolved for all', () => {
  const owner = newTrial({ key: 'k', kind: 'flood' }), viewer = newTrial({ key: 'k', kind: 'flood' });
  stepTrial(owner, 0, { away: true }); stepTrial(owner, ARM_TIME + 5);
  // the friend comes in while it runs: its trial follows the owner's word, sealed in
  assert.equal(followTrial(viewer, trialMessage({ key: 'k', seed: 1, phase: owner.phase, time: owner.t })), 'running');
  assert.ok(trialSealed(viewer)); assert.equal(viewer.t, owner.t);
  // a word on another room changes nothing
  assert.equal(followTrial(viewer, { key: 'x', seed: 1, phase: 'idle', time: 0 }), null);
  // one of them fails (back to the room before): the owner's trial goes on, the word keeps coming
  assert.equal(followTrial(viewer, trialMessage({ key: 'k', seed: 1, phase: 'running', time: owner.t + 1 })), null);
  assert.equal(viewer.t, owner.t + 1);
  // armed for long enough, a viewer's clock turns to running by itself
  const late = newTrial({ key: 'k', kind: 'flood' });
  assert.equal(followTrial(late, { key: 'k', seed: 1, phase: 'armed', time: ARM_TIME + 0.1 }), 'running');
  // what a viewer does goes to the owner, checked
  assert.deepEqual(trialAct({ key: 'k', act: 'part', id: 'button' }), { key: 'k', act: 'part', id: 'button' });
  assert.deepEqual(trialAct({ key: 'k', act: 'away' }), { key: 'k', act: 'away', id: null });
  assert.equal(trialAct({ key: 'k', act: 'part' }), null);
  assert.equal(trialAct({ key: 'k', act: 'cheat' }), null);
  // resolved: everyone hears it with its gate; resolved stays resolved
  const done = trialMessage({ key: 'k', seed: 1, phase: 'resolved', time: 30, gate: 'trial:k' });
  assert.equal(done.gate, 'trial:k');
  assert.equal(followTrial(viewer, done), 'resolved');
  assert.equal(followTrial(viewer, { key: 'k', seed: 1, phase: 'running', time: 31 }), null);
  assert.equal(viewer.phase, 'resolved');
  assert.equal(trialMessage({ key: 'k', seed: 1, phase: 'resolved', time: 1, gate: 'k:guardian' }), null);
  assert.equal(trialMessage({ key: 'k', seed: 1, phase: 'flying', time: 1 }), null);
  // spent (the robot carried its last one back to the start): one coming in finds it drained
  const spent = newTrial({ key: 's', kind: 'flood' });
  assert.equal(followTrial(spent, trialMessage({ key: 's', seed: 1, phase: 'spent', time: 12 })), 'spent');
  assert.deepEqual([spent.phase, spent.t, spent.at, spent.done], ['spent', 12, null, Infinity]);
  assert.ok(RELAYED.has('trial') && RELAYED.has('trialAct'));
});
