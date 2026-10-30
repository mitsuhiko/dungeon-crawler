// Playing together: up to four players in one world, seeing each other and fighting together.
// The host opens a room (a four letter code), the guests join it and play in the host's world:
// the same seed makes the same cubes everywhere (world/), so the world itself never goes over
// the wire. The guests are connected to the host only, and the host passes on what they say to
// each other (a star, protocol.js). Every player has a number: the host 0, the guests 1 to 3.
// Each game runs its own player and tells the others about 20 times a second where it is and
// how its character is posed (protocol.js `me`); they draw that as a figure in the player's
// colour (render/partner.js), a little in the past so it moves smoothly (sync.js Timeline).
//
// Each explores where they like. A cube's enemies are run by one game (net/foes.js): of the
// players in the cube, the one with the lowest number (the host, if it is there). They go
// after any player there; the others are shown them and fight them, blows on them are sent
// over as `hurt`. When players meet or part, the enemies change hands as they are
// (`handover`, game/enemies.js adoptEnemies). In a cube together every kill gives each player
// XP; apart, a kill only tells the others the enemy is gone (`defeated`). The teleport scroll
// (game/roomportal.js) fades you over to a friend (online.js travel: goTo).
//
// The floor loot and the chests are shared (game/loot.js): the killer's or opener's game rolls
// a drop and shows it at once (`drop`), the host keeps the first drop of each source and tells
// everyone (`loot`). Whoever reaches a pickup first gets it: a guest asks (`take`), the host
// says who got it (`took`).
//
// A guest keeps their character (level, bag, gear) when they join and plays on with the
// host's world as it is: what was defeated and opened, the loot on the floor. Only the host
// starts new worlds; the guests come along.
//
// The chat box (game/console.js) is shared: what a player types goes to everyone (`chat`,
// shown in their colour and over their head), and so does what happens to them that the
// others care about (`news`: died, levelled up, found something Remarkable; core/chronicle.js NEWS).
// Each game writes it into its own chronicle (game/log.js) as the friend's.
//
// A painted skin (docs/skins.md) is too big to go along with every `me`: that only says which
// one the player wears. Who sees a new one asks its wearer (`skinWant`), which sends the PNG in
// pieces (`skin`), a little at a time; the figure wears it once all came (render/partner.js).
import { player, state, setStatus } from '../game/state.js';
import { newWorld, enterCube, spawnAt, shareVisit, visitedKeys, shareFaces } from '../game/flow.js';
import { visitedFaces } from '../core/boundaries.js';
import { STEP } from '../core/constants.js';
import { supportedPoint } from '../physics/respawn.js';
import { blockedAt } from '../physics/collide.js';
import { whenReady, fadeOut, fadeIn } from '../game/hud.js';
import { cancelSword } from '../game/sword.js';
import { cancelCast } from '../game/townportal.js';
import { clearMouseInput } from '../game/orders.js';
import { setInventoryOpen } from '../game/inventory.js';
import { lockPortalsHere } from '../game/portals.js';
import { truePosition } from '../game/travel.js';
import { equippedWeapon, readiedFlask } from '../core/combat.js';
import { floatText } from '../render/floattext.js';
import { capturePose, capturedLook, showPartner, showHelp, removePartner, playerTint, setPartnerSkin } from '../render/partner.js';
import { tintCharacter, wornSkin } from '../render/character.js';
import { skinImage } from '../game/skinfiles.js';
import { isSkinPng } from '../core/skin.js';
import { openRoom, joinRoom } from './transport.js';
import { PROTOCOL, MAX_PLAYERS, RELAYED, isFor, validTo, freeSlot, runnerOf, roomCode, cleanName, isMe, robotOf,
  SEND_EVERY, FOES_EVERY, FAR_EVERY, PING_EVERY, LOST, REJOIN_EVERY, REJOIN_TRIES, CHAT_MAX, chatAllowed,
  SKIN_EVERY, SKIN_BYTES, skinIdOf, skinPieces, isSkinPiece, toBase64, fromBase64 } from './protocol.js';
import { Timeline } from './sync.js';
import { cubesNear } from '../core/viewdistance.js';
import { drawnAt } from '../game/drawn.js';
import { robotWord, showOtherRobot } from '../game/robot.js';
import { removeOtherRobot } from '../render/robot.js';
import { online, relay, travel } from './online.js';
import { Runner, Viewer, canBeHit } from './foes.js';
import { setOthers } from '../game/party.js';
import { allEnemies, adoptEnemies, shareDefeat } from '../game/enemies.js';
import { cleanWorldLevel } from '../core/enemies.js';
import { hitEnemy } from '../game/sword.js';
import { afflictEnemy, AFFLICTIONS } from '../game/statuses.js';
import { hitPlayer } from '../game/enemycombat.js';
import { mirrorProjectile, endMirrored } from '../game/projectiles.js';
import { ghostShot } from '../game/shots.js';
import { ghostFlask } from '../game/throws.js';
import { damageEnemy } from '../core/combat.js';
import { CHAR_R, CHAR_H } from '../core/constants.js';
import { groundAt } from '../physics/collide.js';
import { downInfo } from '../game/downed.js';
import { packPickup, acceptDrop, takenBy, grant, forgetDrops, dropOf, allLoot, takeLoot, settleClaims } from '../game/loot.js';
import { shareChest } from '../game/chests.js';
import { validPickup } from '../core/loot.js';
import { sourceEnemy, shareKill, packKills, unpackKills } from '../core/respawn.js';
import { cleanText, cleanNews } from '../core/chronicle.js';
import { checkTrials } from '../core/save.js';
import { log } from '../game/log.js';
import { speech } from '../game/console.js';
import { detachWorld } from '../game/save.js';
import { worldClock, heardClock } from '../game/worldclock.js';
import { takeQuestLog, guestQuestAct, questRewarded, questLogPacked } from '../game/quests.js';
import { heardStory } from '../game/intro.js';
import { isStoryNews } from '../core/intro.js';
import { TrialOwner, trialMessage, trialAct } from './trials.js';
import { takeTrialWord, trialActFrom, shareTrialResolved, shareTrialStage, sealedIn } from '../game/trials.js';
import { tr, msg, phrase, say as sayWords } from '../i18n/i18n.js';

const FADE_MS = 380;
const BESIDE = 0.9;      // cells from the friend where going to them puts you
const SETTLED = 1000;    // ms in a cube: then a friend coming in is the one who arrived (handover)
const AFFLICT_EVERY = 500;   // ms: a viewer tells the runner about a status at most this often
const SKIN_ASK_AGAIN = 8000; // ms without a piece of a skin we wait for: ask for it again

let room = null, myName = 'Friend', local = false, rejoin = null;
// this page's player: getting back in after a lost connection, the host knows it is still us
const pid = Math.random().toString(36).slice(2, 12);
// a guest's line to the host (the host has one per guest, in `peers`), and when it last spoke
let link = null, lastHeard = 0;
let lastSend = 0, ping = null;
// lastKey / cubeSince: the cube we are in and since when; following: a fade to a friend is
// under way; pendingSeed: a world the host asked for, started once we are not travelling (its
// level and progress: pendingRun); announced: the world the guests were told about (host: its
// seed and level, worldOf)
let lastKey = null, cubeSince = 0, following = false, pendingSeed = null, pendingRun = null, announced = null;
// how many open faces the others know of (a face once open stays open: more is new)
let facesSent = 0;
// the enemies (net/foes.js): a Runner (ours, maybe shown to others) or a Viewer (another's); the
// runner owns the cube's trial too (net/trials.js)
let foes = null, lastFoes = 0;
const trialOwner = new TrialOwner();
// our painted skin as pieces ({ id, pieces: a promise of them, null: too big to send}), and who
// we are sending it to (slot -> { id, pieces, n: the next piece }), one piece each SKIN_EVERY
let ownSkin = null, lastSkinPiece = 0;
const skinSends = new Map();

// The other players, by number: { slot, name, pid, timeline (their `me`), body (their
// stand-in, for the enemies we run to go after, game/party.js), inCube (in our cube, not
// travelling: as of their last word), here (and we are not travelling either), skin (the one
// they wear: { id, of, parts, got, done, heard }, followSkin) }. The host
// also keeps its line to each guest: link, lastHeard, and passed (whose `me` it passed on to
// them last: slot -> { ts, cube, seed, busy }).
const peers = new Map();
// the host's slot for each page's player that came, so one getting back in gets its number back
const slotOf = new Map();

function standIn(slot) {
  return { remote: true, slot, here: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: CHAR_R, h: CHAR_H,
    hp: 1, maxHp: 1, ragdoll: false, grounded: true, swimming: false, support: null, stun: 0,
    hurt(blow, fx, fz, nx, nz) { post({ t: 'hurt', blow, fx, fz, nx, nz }, slot); } };
}
function addPeer(slot, name) {
  const p = peers.get(slot) ?? { slot, timeline: new Timeline(), body: standIn(slot), inCube: false, here: false,
    skin: { id: null, done: true } };
  p.name = name;
  peers.set(slot, p); online.peers.set(slot, { name });
  return p;
}
function dropPeer(slot) {
  const p = peers.get(slot);
  if (!p) return;
  p.body.here = false;
  peers.delete(slot); online.peers.delete(slot);
  removePartner(slot); removeOtherRobot(slot);
  setPartnerSkin(slot, null);
  skinSends.delete(slot);
}
// 'Anna, Ben and Cleo' (in the language of the moment)
const names = list => list.length < 2 ? list.join('') : tr('{some} and {last}', { some: list.slice(0, -1).join(', '), last: list.at(-1) });

// what the Esc menu shows (game/escmenu.js): { phase, text }; phase: idle | opening | waiting |
// joining | connected
const listeners = new Set();
// text: in the language of the moment (words: what is kept, src/i18n/i18n.js say)
let status = { phase: 'idle', words: '', get text() { return sayWords(this.words); } };
export const sessionStatus = () => status;
export function onSessionChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setPhase(phase, words = '') { status = { phase, words, get text() { return sayWords(this.words); } }; for (const fn of listeners) fn(status); }
// connected (or the host waiting): who we play with
function showPlayers(note = null) {
  const list = names([...peers.values()].sort((a, b) => a.slot - b.slot).map(p => p.name)), free = MAX_PLAYERS - 1 - peers.size;
  if (online.role === 'host') {
    if (!room) return;
    const open = phrase('Room {code} is open. Waiting for friends...', { code: online.code });
    if (!peers.size) setPhase('waiting', note ? phrase('{note}. {open}', { note, open }) : open);
    else setPhase('connected', free ? phrase('Playing with {list}. Room {code} is open for {n} more.', { list, code: online.code, n: free })
      : phrase('Playing with {list}.', { list }));
  } else if (online.slot !== null) setPhase('connected', phrase('Playing with {list}', { list }));
}

// what the player needs to see: over the character, and in the chat box (setStatus)
function say(words) {
  const text = sayWords(words);
  setStatus(text);
  floatText(text, q => q.set(player.x, player.visY + 2.1, player.z), { color: '#cfe2ff', size: 0.2, life: 2.2, rise: 0.35 });
}
// ... and what the chronicle keeps: someone came or went
function tell(text) { say(text); log('party', { text }); }

const reason = e => phrase({
  'unavailable-id': msg('That room code is taken'),
  'peer-unavailable': msg('There is no game with that code'),
  'browser-incompatible': msg('This browser cannot play online'),
  'timeout': msg('No answer: check the code and the internet connection'),
}[e?.type] ?? msg('Could not connect'));

// --- sending ---------------------------------------------------------------------------------

// send m to players `to`: a number, a list of numbers, or undefined: everyone
function post(m, to) {
  if (online.role === 'host') { m.from = 0; deliver(m, to, 0); }
  else link?.send(to === undefined ? m : { ...m, to });
}
// the host: hand m to the guests it is for, but not back to the one it came from
function deliver(m, to, from) {
  for (const p of peers.values()) if (p.slot !== from && p.link && isFor(to, p.slot)) p.link.send(m);
}
// The host passes `me` of player `from` on: at once to those in the same cube or near it (they
// see them move, in the surroundings too: game/drawn.js) and when it changed cubes or started or
// stopped travelling, now and then to the others (they only need it for the minimap and to know
// where to go)
function passMe(m, from) {
  for (const p of peers.values()) {
    if (p.slot === from || !p.link) continue;
    const last = p.passed.get(from), theirs = p.timeline.latest();
    const near = theirs && theirs.seed === m.seed && cubesNear(theirs.cube, m.cube);
    if (near || !last || last.cube !== m.cube || last.seed !== m.seed || last.busy !== m.busy || m.ts - last.ts >= FAR_EVERY) {
      p.link.send(m);
      p.passed.set(from, { ts: m.ts, cube: m.cube, seed: m.seed, busy: m.busy });
    }
  }
}

// --- opening and joining -------------------------------------------------------------------

export async function hostGame({ name, local: viaTabs = false } = {}) {
  if (online.role) return;
  myName = cleanName(name); local = viaTabs;
  online.role = 'host';
  setPhase('opening', phrase('Opening a room...'));
  for (let tries = 0; ; tries++) {
    const code = roomCode(crypto.getRandomValues ? cryptoRandom : Math.random);
    try {
      room = await openRoom(code, guestArrived, { local });
      if (online.role !== 'host') { room.close(); room = null; return; }   // left while opening
      online.code = code; online.slot = 0;
      ping ??= setInterval(pingAll, PING_EVERY);
      showPlayers();
      return;
    } catch (e) {
      if (e.type === 'unavailable-id' && tries < 4) continue;
      console.warn('could not open a room', e);
      online.role = null;
      setPhase('idle', reason(e));
      return;
    }
  }
}
function cryptoRandom() { return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32; }

// resolves true once connected (the host still has to welcome us)
export async function joinGame(code, { name, local: viaTabs = false } = {}) {
  if (online.role) return false;
  myName = cleanName(name); local = viaTabs;
  online.role = 'guest'; online.code = code;
  if (!rejoin) setPhase('joining', phrase('Joining {code}...', { code }));
  try {
    const l = await joinRoom(code, { local });
    if (online.role !== 'guest') { l.close(); return false; }   // left while joining
    link = l; lastHeard = performance.now();
    l.onmessage = fromHost;
    l.onclose = () => { if (link === l) lost(); };
    ping ??= setInterval(pingAll, PING_EVERY);
    l.send({ t: 'hello', v: PROTOCOL, name: myName, pid });
    return true;
  } catch (e) {
    console.warn('could not join', e);
    online.role = null; online.code = null;
    if (!rejoin) setPhase('idle', reason(e));
    return false;
  }
}

// a guest lost the connection (not a goodbye): try to get back in a few times
// learn: network.html#broken (see learn/README.md)
function retry() {
  if (!rejoin) return;
  if (rejoin.tries++ >= REJOIN_TRIES) { rejoin = null; setPhase('idle', phrase('The connection was lost')); return; }
  setPhase('joining', phrase('Connection lost. Trying again ({n}/{of})...', { n: rejoin.tries, of: REJOIN_TRIES }));
  const r = rejoin;
  joinGame(r.code, { name: myName, local }).then(ok => { if (!ok && rejoin === r) r.timer = setTimeout(retry, REJOIN_EVERY); });
}

export function leaveGame() {
  if (rejoin) { clearTimeout(rejoin.timer); rejoin = null; }
  if (online.role === 'host') for (const p of [...peers.values()]) { const l = p.link; unhook(l); l?.send({ t: 'bye' }); l?.close(); }
  else { const l = link; unhook(l); l?.send({ t: 'bye' }); l?.close(); }
  end();
  room?.close(); room = null;
  online.role = null; online.code = null;
  pendingSeed = null;
  setPhase('idle', '');
}
const unhook = l => { if (l) l.onmessage = l.onclose = null; };

// nobody to play with any more: the session's state goes
function end() {
  for (const slot of [...peers.keys()]) dropPeer(slot);
  link = null; online.slot = null;
  clearInterval(ping); ping = null;
  apart();
}
// alone again (the others left, or we did): our enemies are our own
function apart() {
  if (foes instanceof Viewer) foes.stop(foes.cube === state.cubeKey);   // the runner's enemies here are ours now
  foes = null;
  relay.hit = relay.afflict = relay.launch = relay.landed = relay.shoot = relay.toss = relay.defeated = relay.visited = null;
  relay.drop = relay.take = relay.forget = relay.chat = relay.news = relay.story = null;
  relay.trialAct = relay.trialDone = relay.trialStage = null;
  relay.quests = relay.questAct = relay.questReward = null;
  settleClaims();   // what we reached for is ours: nobody else is left to have it
  setOthers([]);
  online.buddies = [];
  removePartner(); removeOtherRobot();
}

// --- the host: guests coming and going ---------------------------------------------------------

// someone connected: they say hello first (a friend getting back in over a new connection, the
// old one broken, gets their number back)
function guestArrived(l) {
  l.onmessage = m => {
    if (m?.t !== 'hello') return;
    if (m.v !== PROTOCOL) {
      l.send({ t: 'version', v: PROTOCOL }); setTimeout(() => l.close(), 300);
      tell(phrase('A friend with another version of the game tried to join: both reload the page'));
      return;
    }
    const id = typeof m.pid === 'string' ? m.pid : null;
    const back = id && [...peers.values()].find(p => p.pid === id);
    if (back) { const old = back.link; unhook(old); old?.close(); }
    const slot = back ? back.slot : freeSlot(new Set(peers.keys()), slotOf.get(id));
    if (slot === null) { l.send({ t: 'full' }); setTimeout(() => l.close(), 300); return; }
    welcome(l, slot, cleanName(m.name), id, !!back);
  };
}

function welcome(l, slot, name, id, again) {
  const p = addPeer(slot, name);
  Object.assign(p, { pid: id, link: l, lastHeard: performance.now(), passed: new Map() });
  if (id) slotOf.set(id, slot);
  l.onmessage = m => fromGuest(p, l, m);
  l.onclose = () => { if (p.link === l) lostGuest(p); };
  if (foes instanceof Runner) foes.forget(slot);
  announced = worldOf();
  const players = [{ slot: 0, name: myName }, ...[...peers.values()].filter(o => o !== p).map(o => ({ slot: o.slot, name: o.name }))];
  l.send({ t: 'welcome', v: PROTOCOL, slot, players, seed: state.cubes?.seed ?? null, ...runOf() });
  facesSent = state.openedFaces.size;
  deliver({ t: 'joined', slot, name, from: 0 }, undefined, slot);
  together();
  showPlayers();
  tell(again ? phrase('{name} is back', { name }) : phrase('{name} joined', { name }));
}

// the host's progress in its world, for a guest (welcome, world): what was defeated, opened
// and discovered, the loot on its floors, the quest log, its play time (game/worldclock.js) and
// the kills that come back
const worldOf = () => state.cubes ? `${state.cubes.seed}:${state.cubes.level}` : null;
const runOf = () => ({ level: state.cubes?.level ?? 1, defeated: [...state.run.defeated], gates: [...state.run.unlockedGates], visited: visitedKeys(), faces: [...state.openedFaces],
  trials: [...state.run.trials], loot: allLoot(), dropped: [...state.run.dropped], chests: [...state.run.chests], quests: questLogPacked(),
  clock: worldClock(), kills: packKills(state.run.kills) });

function fromGuest(p, l, m) {
  p.lastHeard = performance.now();
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
  if (m.t === 'bye') { lostGuest(p); l.close(); return; }
  if (!RELAYED.has(m.t) || !validTo(m.to)) return;
  // a chat line goes on short and plain, and not too many at once
  if (m.t === 'chat' && (!(m.text = cleanText(m.text, CHAT_MAX)) || !chatAllowed(p.chatTimes ??= [], performance.now()))) return;
  m.from = p.slot;
  if (m.t === 'me') { if (isMe(m)) { p.timeline.push(m, performance.now()); passMe(m, p.slot); } return; }
  deliver(m, m.to, p.slot);
  if (isFor(m.to, 0)) handle(m);
}

// a guest went (said bye, or its connection broke): the others hear it
function lostGuest(p) {
  if (peers.get(p.slot) !== p) return;
  unhook(p.link);
  dropPeer(p.slot);
  deliver({ t: 'left', slot: p.slot, from: 0 }, undefined, p.slot);
  if (!peers.size) apart();
  showPlayers(phrase('{name} left', { name: p.name }));
  tell(phrase('{name} left', { name: p.name }));
}

// --- a guest: what the host says ---------------------------------------------------------------

function fromHost(m) {
  lastHeard = performance.now();
  if (!m || typeof m !== 'object') return;
  m.from = Number.isInteger(m.from) ? m.from : 0;
  if (m.t === 'ping') { if (online.slot !== null) heardClock(m.clock); return; }   // (the host's play time: game/worldclock.js)
  if (m.t === 'bye') { const l = link; lost(true); l?.close(); return; }
  if (online.slot === null) {
    if (m.t === 'welcome') welcomed(m);
    else if (m.t === 'full') { const l = link; unhook(l); end(); l?.close(); online.role = null; online.code = null; setPhase('idle', phrase('That game has {n} players already', { n: MAX_PLAYERS })); }
    else if (m.t === 'version') refuse();
    return;
  }
  if (m.t === 'me') { const p = peers.get(m.from); if (p && isMe(m)) p.timeline.push(m, performance.now()); return; }
  if (m.from === 0 && m.t === 'joined' && Number.isInteger(m.slot) && m.slot !== online.slot) {
    const known = peers.has(m.slot), name = cleanName(m.name);
    addPeer(m.slot, name); showPlayers();
    if (!known) tell(phrase('{name} joined', { name }));
    return;
  }
  if (m.from === 0 && m.t === 'left') {
    const p = peers.get(m.slot);
    if (p) { dropPeer(m.slot); showPlayers(); tell(phrase('{name} left', { name: p.name })); }
    return;
  }
  // the host went into another world: it and its progress there
  if (m.from === 0 && m.t === 'world' && Number.isFinite(m.seed)) { pendingSeed = m.seed; pendingRun = readRun(m); heardClock(m.clock, true); return; }
  handle(m);
}

function welcomed(m) {
  if (m.v !== PROTOCOL) { refuse(); return; }
  if (!Number.isInteger(m.slot) || m.slot < 1 || m.slot >= MAX_PLAYERS) return;
  online.slot = m.slot;
  detachWorld();   // the host's world is theirs to save: ours stays as it was (our hero is still saved)
  for (const pl of Array.isArray(m.players) ? m.players : [])
    if (Number.isInteger(pl?.slot) && pl.slot >= 0 && pl.slot < MAX_PLAYERS && pl.slot !== m.slot) addPeer(pl.slot, cleanName(pl.name));
  if (rejoin) { clearTimeout(rejoin.timer); rejoin = null; }
  // the host's world, and its progress so far: what it defeated stays defeated for us too; its
  // play time is ours from now on (game/worldclock.js)
  const run = readRun(m);
  heardClock(m.clock, true);
  if (Number.isFinite(m.seed) && (m.seed !== state.cubes?.seed || run.level !== state.cubes?.level)) { pendingSeed = m.seed; pendingRun = run; }
  else {
    takeRun(run);
    // (back after a lost connection: what we found meanwhile)
    post({ t: 'visited', keys: visitedKeys() });
    post({ t: 'faces', keys: [...state.openedFaces] });
  }
  together();
  showPlayers();
  tell(peers.get(0)?.name ? phrase("Joined {name}'s world", { name: peers.get(0).name }) : phrase("Joined your friend's world"));
}

// the host's progress in its world (runOf), as a guest takes it (takeRun)
function readRun(m) {
  const list = x => Array.isArray(x) ? x.filter(k => typeof k === 'string') : [];
  const loot = (Array.isArray(m.loot) ? m.loot : []).filter(c => Array.isArray(c) && typeof c[0] === 'string' && Array.isArray(c[1]))
    .map(([k, items]) => [k, items.filter(p => typeof p?.source === 'string' && validPickup(p))]);
  return { level: cleanWorldLevel(m.level), defeated: list(m.defeated), gates: list(m.gates), visited: list(m.visited), faces: list(m.faces), trials: checkTrials(m.trials),
    loot, dropped: list(m.dropped), chests: list(m.chests), quests: m.quests ?? null,
    clock: Number.isFinite(m.clock) && m.clock >= 0 ? m.clock : null, kills: unpackKills(m.kills) };
}

// we (a guest) lost the host: it said goodbye (bye), or the connection broke (then we try to
// get back in)
// learn: network.html#broken (see learn/README.md)
function lost(bye = false) {
  const name = peers.get(0)?.name, code = online.code, wasIn = online.slot !== null;
  unhook(link);
  end();
  online.role = null; online.code = null;
  if (wasIn && !bye) { rejoin = { code, tries: 0, timer: setTimeout(retry, 500) }; setPhase('joining', phrase('Connection lost. Trying again...')); }
  else setPhase('idle', name ? phrase('{name} left the game', { name }) : phrase('The connection was lost'));
  if (name) tell(bye || !wasIn ? phrase('{name} left', { name }) : phrase('Connection lost'));
}

function refuse() {
  const l = link;
  l?.send({ t: 'version', v: PROTOCOL });
  unhook(l); end(); l?.close();
  online.role = null; online.code = null;
  setPhase('idle', phrase('Your friend has another version of the game: both reload the page'));
}

// every second, to everyone (also from a background tab); silence for LOST: gone
function pingAll() {
  const now = performance.now();
  if (online.role === 'host') {
    for (const p of [...peers.values()]) {
      p.link?.send({ t: 'ping', clock: worldClock(now) });   // (our play time: game/worldclock.js)
      if (now - p.lastHeard > LOST) { const l = p.link; lostGuest(p); l?.close(); }
    }
  } else if (link) {
    link.send({ t: 'ping' });
    if (now - lastHeard > LOST) { const old = link; lost(); old.close(); }
  }
}

// --- together ----------------------------------------------------------------------------------

// someone to play with (again): tell them what happens
function together() {
  const r = x => Math.round(x * 1000) / 1000;
  relay.defeated = e => post({ t: 'defeated', id: e.id, gate: e.guardian && e.guardianGate || null,
    ...e.respawn && { cube: e.respawn, n: e.wave ?? 0 } });
  // the chat box: what we say, and what happens to us (game/log.js)
  relay.chat = text => post({ t: 'chat', text });
  relay.story = what => post({ t: 'story', what, seed: state.cubes?.seed });
  relay.news = (kind, data) => post({ t: 'news', kind, data });
  relay.visited = key => post({ t: 'visited', keys: [key] });
  // the world's quests: the host decides and tells, a guest asks (game/quests.js)
  if (online.role === 'host') {
    relay.quests = log => post({ t: 'quests', log });
    relay.questReward = (id, rewards, title) => post({ t: 'questReward', id, rewards, title });
  } else relay.questAct = m => post({ t: 'quest', ...m }, 0);
  // our arrows, bolts, spells, lightning and flasks fly for those here too (they only look; the hits
  // are ours: game/shots.js, game/throws.js)
  relay.shoot = shot => {
    const to = hereSlots();
    if (!to.length) return;
    const { kind, range, pierce, burst, color, jumps } = shot.stats;
    post({ t: 'arrow', kind: shot.kind, stats: { kind, range, pierce, burst, color, jumps },
      at: [shot.x, shot.y, shot.z, shot.vx, shot.vy, shot.vz].map(r), origin: shot.from.map(r) }, to);
  };
  relay.toss = f => {
    const to = hereSlots();
    if (!to.length) return;
    const { view, ...flask } = f;
    post({ t: 'flask', flask }, to);
  };
  // shown another's enemies: our hits and statuses go to it
  const told = new Map();   // enemy and status -> when the runner was last told
  relay.hit = (e, damage, crit, dx, dz, kb) => {
    if (!(foes instanceof Viewer)) return;
    foes.predicted(e);
    post({ t: 'hit', id: e.id, damage, crit, dx, dz, kb }, foes.runner);
  };
  relay.afflict = (e, status, spec) => {
    if (!(foes instanceof Viewer)) return;
    const key = e.id + status, now = performance.now();
    if (status !== 'zapped' && now - (told.get(key) ?? -Infinity) < AFFLICT_EVERY) return;   // (a zap is rare, and over at once)
    told.set(key, now);
    post({ t: 'afflict', id: e.id, status, spec }, foes.runner);
  };
  // running the enemies: our enemies' projectiles fly for those here too
  // the shared floor loot (game/loot.js): the host decides, a guest asks
  const host = online.role === 'host';
  relay.drop = (key, source, list) => post({ t: host ? 'loot' : 'drop', cube: key, source, list: list.map(packPickup) }, host ? undefined : 0);
  relay.take = (key, p) => {
    if (host) { post({ t: 'took', cube: key, id: p.id, by: 0 }); return 'mine'; }
    post({ t: 'take', cube: key, id: p.id }, 0);
    return 'asked';
  };
  relay.forget = (key, sources) => post({ t: host ? 'gone' : 'forget', cube: key, sources }, host ? undefined : 0);
  relay.launch = (pr, e) => { const to = hereSlots(); if (to.length) post({ t: 'shot', n: pr.n, id: e.id, spec: pr.spec, at: [pr.x, pr.y, pr.z, pr.vx, pr.vy, pr.vz] }, to); };
  relay.landed = (pr, end) => { const to = hereSlots(); if (to.length) post({ t: 'landed', n: pr.n, end }, to); };
  // a trial room: shown another's, what we do there goes to its owner; resolved, to everyone
  relay.trialAct = a => { if (foes instanceof Viewer) post({ t: 'trialAct', ...a }, foes.runner); };
  relay.trialDone = d => post({ t: 'trial', key: d.key, seed: state.cubes?.seed, phase: 'resolved', time: d.time, gate: d.gate });
  relay.trialStage = d => post({ t: 'trial', key: d.key, seed: state.cubes?.seed, phase: 'idle', time: 0, stage: d.stage });
}
const hereSlots = () => [...peers.values()].filter(p => p.here).map(p => p.slot);

const enemy = id => allEnemies().find(e => e.id === id && e.mode !== 'dead');
const validState = s => s && typeof s.id === 'string' && [s.x, s.y, s.z, s.yaw, s.hp].every(Number.isFinite);
// an enemy as it is now, for another game to take over (game/enemies.js adoptEnemies)
const stateOf = e => ({ id: e.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, mode: e.mode });
const finite = (...xs) => xs.every(Number.isFinite);
// a status's spec from another's game, as afflictEnemy takes it (game/statuses.js): a burn or a
// poison, a chill (an enchanted weapon slows by at most half), a slowing (slime: by at most two
// thirds) or a zap (a short stun)
const validAffliction = (status, s) => !!s && typeof s === 'object' && finite(s.time) && s.time > 0 && s.time <= 30
  && (status === 'chilled' ? finite(s.slow) && s.slow >= 0.49 && s.slow <= 1
    : status === 'slowed' ? finite(s.slow) && s.slow >= 0.33 && s.slow <= 1 && s.time <= 10
    : status === 'zapped' ? s.time <= 1 : finite(s.damage, s.ticks) && s.damage >= 0 && s.ticks >= 1);

// a message from another player (not `me`; the host's own word was handled before)
function handle(m) {
  const p = peers.get(m.from);
  if (!p || shared(m, p) || lootReceive(m, p)) return;
  if (foes instanceof Runner) runnerReceive(m, p);
  else if (foes instanceof Viewer && m.from === foes.runner) viewerReceive(m);
}

// what everyone hears about: kills, cubes, faces, the arrows and flasks of those here, and
// what they say and what happened to them (the chat box)
function shared(m, p) {
  if (m.t === 'defeated' && typeof m.id === 'string')
    shareDefeat(m.id, typeof m.gate === 'string' ? m.gate : null, typeof m.cube === 'string' ? { cube: m.cube, n: m.n } : null);
  else if (m.t === 'chat') {
    const text = cleanText(m.text, CHAT_MAX);
    if (text) { log('chat', { text }, { who: { slot: p.slot, name: p.name } }); speech(text, p.slot); }
  } else if (m.t === 'news') {
    const data = cleanNews(m.kind, m.data);
    if (data) log(m.kind, data, { who: { slot: p.slot, name: p.name } });
  }
  // the beginning (game/intro.js): a gate opened, a recording set off, for everyone (in this world)
  else if (m.t === 'story') { if (isStoryNews(m.what) && m.seed === state.cubes?.seed) heardStory(m.what); }
  else if (m.t === 'visited' && Array.isArray(m.keys)) { for (const k of m.keys) if (typeof k === 'string') shareVisit(k); }
  // the quests: the host hears what a guest did, a guest what the host decided
  else if (m.t === 'quest') { if (online.role === 'host') guestQuestAct(m); }
  else if (m.t === 'quests') { if (m.from === 0 && online.role === 'guest') takeQuestLog(m.log); }
  else if (m.t === 'questReward') { if (m.from === 0 && online.role === 'guest') questRewarded(m.id, m.rewards, m.title); }
  else if (m.t === 'skinWant') { const id = skinIdOf(m.id); if (id) sendSkin(p.slot, id); }
  else if (m.t === 'skin') { if (isSkinPiece(m)) skinPiece(p, m); }
  else if (m.t === 'faces' && Array.isArray(m.keys)) { shareFaces(m.keys.filter(k => typeof k === 'string')); facesSent = state.openedFaces.size; }
  // a trial room (net/trials.js): resolved, by anyone; its owner's word, to those shown it; an act on ours
  else if (m.t === 'trial') {
    const tm = trialMessage(m);
    if (tm && tm.seed === state.cubes?.seed) {
      if (tm.stage != null) shareTrialStage(tm);   // (a sunken room's stage: for everyone)
      if (tm.phase === 'resolved' && tm.gate) shareTrialResolved(tm);
      else if (foes instanceof Viewer && m.from === foes.runner) takeTrialWord(tm);
    }
  } else if (m.t === 'trialAct') {
    const a = trialAct(m);
    if (a && foes instanceof Runner && p.here) trialActFrom(a);
  }
  else if (m.t === 'arrow') {
    if (!p.here || !['arrow', 'bolt', 'spell', 'lightning'].includes(m.kind) || !Array.isArray(m.at) || m.at.length !== 6 || !finite(...m.at)
      || !Array.isArray(m.origin) || m.origin.length !== 3 || !finite(...m.origin) || !finite(m.stats?.range)) return true;
    const [x, y, z, vx, vy, vz] = m.at;
    ghostShot({ kind: m.kind, stats: m.stats, x, y, z, vx, vy, vz, from: m.origin });
  } else if (m.t === 'flask') {
    if (p.here && m.flask?.stats && finite(m.flask.x, m.flask.y, m.flask.z, m.flask.vx, m.flask.vy, m.flask.vz, m.flask.T)) ghostFlask({ ...m.flask, t: 0, spin: 0 });
  } else return false;
  return true;
}

const strings = xs => Array.isArray(xs) && xs.every(x => typeof x === 'string');

// --- painted skins -----------------------------------------------------------------------------

// player p's last `me` says which skin they wear: a new one, ask them for it (and again when
// its pieces stopped coming); none, their figure is clay again
function followSkin(p, m, now) {
  const id = skinIdOf(m.skin), s = p.skin;
  if (id === s.id) {
    if (!s.done && now - s.heard > SKIN_ASK_AGAIN) { s.heard = now; post({ t: 'skinWant', id }, p.slot); }
    return;
  }
  p.skin = { id, of: 0, parts: [], got: 0, done: !id, heard: now };
  setPartnerSkin(p.slot, null);
  if (id) post({ t: 'skinWant', id }, p.slot);
}
// a piece of the skin player p wears; all there: their figure wears it
function skinPiece(p, m) {
  const s = p.skin;
  if (m.id !== s.id || s.done || s.of && m.of !== s.of) return;
  s.of = m.of; s.heard = performance.now();
  if (s.parts[m.n] === undefined) { s.parts[m.n] = m.data; s.got++; }
  if (s.got < s.of) return;
  s.done = true;
  const base64 = s.parts.join('');
  s.parts = null;
  (async () => {
    const bytes = fromBase64(base64);
    if (bytes.length > SKIN_BYTES || !isSkinPng(bytes)) throw new Error('not a skin PNG');
    const canvas = await skinImage(new Blob([bytes], { type: 'image/png' }));
    if (peers.get(p.slot) === p && p.skin === s) setPartnerSkin(p.slot, canvas);   // (still theirs)
  })().catch(e => console.warn(`${p.name}'s skin could not be shown`, e));
}
// player `slot` asks for our skin `id` (if we still wear it: else our next `me` says what we do)
async function sendSkin(slot, id) {
  const worn = wornSkin();
  if (worn?.id !== id) return;
  if (ownSkin?.id !== id) ownSkin = { id, pieces: worn.blob.size > SKIN_BYTES ? Promise.resolve(null)
    : worn.blob.arrayBuffer().then(b => skinPieces(toBase64(new Uint8Array(b)))) };
  const own = ownSkin, pieces = await own.pieces.catch(e => { console.warn('could not send the skin', e); return null; });
  if (pieces && ownSkin === own && peers.has(slot)) skinSends.set(slot, { id, pieces, n: 0 });
}
// every frame: the next piece to everyone waiting for our skin
function sendSkinPieces(now) {
  if (!skinSends.size || now - lastSkinPiece < SKIN_EVERY) return;
  lastSkinPiece = now;
  for (const [slot, s] of skinSends) {
    if (s.id !== wornSkin()?.id) { skinSends.delete(slot); continue; }
    post({ t: 'skin', id: s.id, n: s.n, of: s.pieces.length, data: s.pieces[s.n] }, slot);
    if (++s.n >= s.pieces.length) skinSends.delete(slot);
  }
}

// The shared floor loot (game/loot.js). The host decides: a guest's drop stands if it is the
// first of its source (and, where the host runs the enemies, the enemy is dead there: the
// guest's killing hit came before its drop); else the guest gets what stands (or null: no
// drop). A pickup goes to whoever asks first. Guests hear what the host decided.
// learn: network.html#loot (see learn/README.md)
function lootReceive(m, p) {
  if (typeof m.cube !== 'string') return false;
  if (online.role === 'host') {
    if (m.t === 'drop' && typeof m.source === 'string' && Array.isArray(m.list) && m.list.every(validPickup)) {
      if (state.run.dropped.has(m.source)) post({ t: 'loot', cube: m.cube, source: m.source, list: dropOf(m.cube, m.source).map(packPickup) }, p.slot);
      else if (aliveHere(m.cube, m.source)) post({ t: 'loot', cube: m.cube, source: m.source, list: null }, p.slot);
      else {
        acceptDrop(m.cube, m.source, m.list);
        if (m.source.startsWith('c:')) shareChest(m.source.slice(2));
        post({ t: 'loot', cube: m.cube, source: m.source, list: m.list });   // everyone: it stands
      }
    } else if (m.t === 'take' && typeof m.id === 'string') {
      if (grant(m.cube, m.id, p.here ? p.slot : null)) post({ t: 'took', cube: m.cube, id: m.id, by: p.slot });
    } else if (m.t === 'forget' && strings(m.sources)) {
      forgetDrops(m.cube, new Set(m.sources));
      post({ t: 'gone', cube: m.cube, sources: m.sources });
    } else return false;
    return true;
  }
  if (m.from !== 0) return false;
  if (m.t === 'loot' && typeof m.source === 'string' && (m.list === null || Array.isArray(m.list) && m.list.every(validPickup))) {
    acceptDrop(m.cube, m.source, m.list);
    if (m.list && m.source.startsWith('c:')) shareChest(m.source.slice(2));
  } else if (m.t === 'took' && typeof m.id === 'string' && Number.isInteger(m.by))
    takenBy(m.cube, m.id, m.by === online.slot, peers.get(m.by)?.here ? m.by : null);
  else if (m.t === 'gone' && strings(m.sources)) forgetDrops(m.cube, new Set(m.sources));
  else return false;
  return true;
}
// is the enemy that dropped `source` still alive here, where we run the enemies?
const aliveHere = (key, source) => key === state.cubeKey && foes instanceof Runner && !!enemy(sourceEnemy(source));

// we run the enemies here: those shown them ask for them, hand theirs over, and hit them
function runnerReceive(m, p) {
  if (m.t === 'want') { foes.forget(p.slot); return; }
  // they ran this cube's enemies until we came in: take them over as they are
  if (m.t === 'handover' && m.cube === state.cubeKey && Array.isArray(m.list)) { adoptEnemies(m.list.filter(validState)); foes.forget(); return; }
  if (!p.here) return;
  if (m.t === 'hit' && finite(m.damage, m.dx, m.dz, m.kb) && m.damage > 0) {
    const e = enemy(m.id);
    if (!e) return;
    const before = e.hp;
    if (damageEnemy(e, m.damage)) hitEnemy(e, { damage: before - e.hp, crit: !!m.crit }, before, m.dx, m.dz, m.kb, p.body);
  } else if (m.t === 'afflict' && AFFLICTIONS.includes(m.status) && validAffliction(m.status, m.spec)) {
    const e = enemy(m.id);
    if (e && afflictEnemy(e, m.status, m.spec)) { e.target = p.body; e.lastHit = p.slot; }
  }
}

// we are shown another's enemies (m is from their runner)
function viewerReceive(m) {
  if (m.t === 'roster' && Array.isArray(m.list) && Array.isArray(m.profiles)) foes.roster(m);
  else if (m.t === 'foes') foes.foes(m, performance.now());
  else if (m.t === 'hurt') {
    const b = m.blow;
    if (b && typeof b === 'object' && finite(b.damage, b.knock ?? 0, m.fx, m.fz, m.nx, m.nz) && canBeHit() && runnerHere())
      hitPlayer(b, m.fx, m.fz, m.nx, m.nz);
  } else if (m.t === 'shot' && Array.isArray(m.at) && m.at.length === 6 && finite(...m.at) && m.spec?.speed > 0 && runnerHere())
    mirrorProjectile(m.n, foes.find(m.id), m.spec, ...m.at);
  else if (m.t === 'landed') endMirrored(m.n, ['hit', 'blocked', 'spent'].includes(m.end) ? m.end : 'spent');
}
const runnerHere = () => foes instanceof Viewer && !!peers.get(foes.runner)?.inCube;

// Who runs our cube's enemies: the lowest player number here. When one lower than us came in
// (we were here first), ours go over to it as they are; when the runner leaves us here, its
// go on here as we were shown them (net/foes.js).
function updateRunner(now) {
  const runner = runnerOf([online.slot, ...[...peers.values()].filter(p => p.inCube).map(p => p.slot)]);
  if (runner === online.slot) {
    if (foes instanceof Viewer) { foes.stop(foes.cube === state.cubeKey); foes = null; }
    if (!(foes instanceof Runner)) foes = new Runner();
    return;
  }
  if (foes instanceof Viewer) { if (foes.runner !== runner) foes.follow(runner); return; }
  if (state.cubeKey && now - cubeSince > SETTLED)
    post({ t: 'handover', cube: state.cubeKey, list: allEnemies().filter(e => e.id && e.mode !== 'dead').map(stateOf) }, runner);
  foes = new Viewer(runner, v => post({ t: 'want' }, v.runner));
  foes.start();
}

// the host's progress in its world (welcome): its kills and opened gates are ours too
// learn: network.html#seed (see learn/README.md)
function takeRun(run) {
  for (const id of run.defeated) state.run.defeated.add(id);
  // and when its enemies come back (core/respawn.js): on its clock
  if (run.clock !== null) state.run.clock = run.clock;
  for (const [id, k] of run.kills) state.run.kills.set(id, k);
  for (const k of run.gates) state.run.unlockedGates.add(k);
  for (const [k, n] of run.trials) state.run.trials.set(k, Math.max(n, state.run.trials.get(k) ?? 0));
  // the floor loot is the host's (also after getting back in: what we dropped meanwhile went)
  takeLoot(run.loot);
  state.run.dropped = new Set(run.dropped);
  for (const id of run.chests) shareChest(id);
  for (const k of run.visited) shareVisit(k);
  shareFaces(visitedFaces(run.faces, new Set(run.visited)));
  facesSent = state.openedFaces.size;
  if (run.quests) takeQuestLog(run.quests, true);
}

// --- every frame -----------------------------------------------------------------------------

const busy = () => !state.map || state.transitioning || !!state.fallFrom || following;

// learn: network.html#send-code (see learn/README.md)
function send(now) {
  const pose = capturePose();
  if (!pose || !state.cubes || !state.cubeKey) return;
  const weapon = (readiedFlask(player) ?? equippedWeapon(player))?.model ?? null;
  const p = player, at = truePosition(), r = x => Math.round(x * 1000) / 1000;
  const m = { t: 'me', ts: now, seed: state.cubes.seed, cube: state.cubeKey, busy: busy(), pose,
    body: [at.x, at.y, at.z, p.vx, p.vz].map(r), ground: p.grounded ? 1 : 0, swim: p.swimming ? 1 : 0, down: p.ragdoll ? 1 : 0,
    ko: downInfo(), hp: p.hp, maxHp: p.maxHp, level: p.level, weapon, ...capturedLook(), sealed: sealedIn() ? 1 : 0,
    robot: robotWord() };
  if (online.role === 'host') { m.from = 0; passMe(m, 0); }
  else link?.send(m);
}

// a spot a step away from p on the same level, in a straight line from it (null: none)
function beside(p) {
  for (let i = 0; i < 8; i++) {
    const a = p.yaw + Math.PI * (0.5 + (i >> 1) * 0.25) * (i & 1 ? -1 : 1);   // to the sides first, then behind
    const x = p.x + Math.sin(a) * BESIDE, z = p.z + Math.cos(a) * BESIDE, s = supportedPoint(x, p.y, z);
    if (s && Math.abs(s.y - p.y) <= STEP && [0.33, 0.66].every(t => !blockedAt(p.x + (x - p.x) * t, p.z + (z - p.z) * t, p.y, STEP))) return s;
  }
  return null;
}

// why we cannot go over to the other player p now (null: we can)
function unreachable(p) {
  const them = p.timeline.latest();
  if (!them) return tr('Not here yet');
  if (them.seed !== state.cubes?.seed) return tr('In another world');
  if (them.busy) return tr('On the move');
  if (them.sealed) return tr('Sealed in a trial room');   // (a trial room while its event runs: game/trials.js)
  const [x, , z] = them.body;
  if (them.cube === state.cubeKey && Math.hypot(x - player.x, z - player.z) < 2) return tr('Right beside you');
  return null;
}
travel.targets = () => [...peers.values()].sort((a, b) => a.slot - b.slot).map(p => ({ slot: p.slot, name: p.name, why: unreachable(p) }));
// fade over to the cube player `slot` is in, and stand next to them
travel.goTo = slot => {
  const p = peers.get(slot), why = !p ? tr('They left') : busy() || player.down || player.ragdoll ? tr('Not now') : unreachable(p);
  if (why) { say(p ? phrase('{name}: {why}', { name: p.name, why }) : why); return false; }
  follow(p.timeline.latest(), p.name);
  return true;
};
function follow(them, name) {
  const cubes = state.cubes, key = them.cube, at = { x: them.pose.p[0], y: them.pose.p[1], z: them.pose.p[2] };
  following = true;
  if (state.inventoryOpen) setInventoryOpen(false);
  state.transitioning = true; state.portalCharge = null;
  cancelSword(true); cancelCast(); clearMouseInput();
  fadeOut();
  say(phrase('Off to {name}', { name }));
  setTimeout(() => whenReady(cubes.get(key)).then(c => {
    following = false;
    if (state.cubes !== cubes) return;
    enterCube(c, null, null, at);
    const spot = beside({ x: player.x, y: player.y, z: player.z, yaw: them.pose.yaw });   // enterCube put us on (or near) their spot
    if (spot) { spawnAt(spot.x, spot.y, spot.z); player.yaw = Math.atan2(at.x - spot.x, at.z - spot.z); }
    lockPortalsHere();   // arriving on a portal does not take us straight on
    state.transitioning = false;
  }, e => {
    console.error('could not follow', e);
    following = false;
    if (state.cubes !== cubes) return;
    state.transitioning = false; fadeIn();
  }), FADE_MS);
}

// main.js, every frame after the camera moved: send, hand enemies over, show the others
export function updateOnline() {
  const now = performance.now();
  if (state.cubeKey !== lastKey) { lastKey = state.cubeKey; cubeSince = now; }
  // together our hero wears our colour, as the others see it; alone it is as it always was
  tintCharacter(peers.size && online.slot !== null ? playerTint(online.slot) : null);
  if (!peers.size) return;
  // the host's world: start it once we are not on the way somewhere (or at once, from the main
  // menu: it takes the place of the cubes behind it)
  if (pendingSeed !== null && (state.mode === 'menu' || !busy())) {
    const seed = pendingSeed;
    pendingSeed = null;
    if (state.inventoryOpen) setInventoryOpen(false);
    newWorld(seed, { keepPlayer: true, level: pendingRun?.level ?? 1 });   // (it starts the fresh run at once, the cube comes later)
    if (pendingRun) { takeRun(pendingRun); pendingRun = null; }
  }
  if (online.role === 'host' && state.cubes && worldOf() !== announced) {
    announced = worldOf();
    post({ t: 'world', seed: state.cubes.seed, ...runOf() });
  }
  // faces we opened (crossing, discovering, a gate): the others can walk across there too
  if (state.openedFaces.size < facesSent) facesSent = state.openedFaces.size;   // a new world
  if (state.openedFaces.size > facesSent) {
    facesSent = state.openedFaces.size;
    post({ t: 'faces', keys: [...state.openedFaces] });
  }
  // where everyone is, as of their last word; the stand-ins of those here follow it
  const seed = state.cubes?.seed, buddies = [];
  for (const p of peers.values()) {
    const m = p.timeline.latest();
    if (m) followSkin(p, m, now);
    p.inCube = !!m && !m.busy && m.seed === seed && m.cube === state.cubeKey;
    p.here = p.body.here = p.inCube && !state.transitioning;
    if (p.here) {
      const [x, y, z, vx, vz] = m.body;
      Object.assign(p.body, { x, y, z, vx, vz, hp: m.hp, maxHp: m.maxHp, ragdoll: !!m.down || m.hp <= 0,
        grounded: !!m.ground, swimming: !!m.swim });
      p.body.support = p.body.grounded ? groundAt(x, z, y + 0.05, 0).s : null;
    }
    if (m && m.seed === seed) buddies.push({ slot: p.slot, name: p.name, cube: m.cube, here: p.here,
      x: m.body[0], y: m.body[1], z: m.body[2], yaw: m.pose?.yaw, hp: m.hp, out: !!m.ko });
  }
  online.buddies = buddies;   // (the minimap shows them: game/minimap.js)
  updateRunner(now);
  if (now - lastSend >= SEND_EVERY) { lastSend = now; send(now); }
  sendSkinPieces(now);
  if (foes instanceof Runner) {
    setOthers([...peers.values()].filter(p => p.here).map(p => p.body));
    const viewers = [...peers.values()].filter(p => p.inCube).map(p => p.slot);
    if (state.cubes && now - lastFoes >= FOES_EVERY) {
      lastFoes = now;
      for (const [msg, to] of foes.messages(now, viewers)) post(msg, to);
    }
    // and its trial, if this is a trial room
    if (state.cubes) for (const [msg, to] of trialOwner.messages(now, viewers, state.trial, state.cubes.seed)) post(msg, to);
  } else {
    setOthers([]);
    foes?.check(now);
  }
  // the others who are here or in a cube shown near (as they were DELAY ago; game/drawn.js)
  for (const p of peers.values()) {
    const span = p.timeline.at(now), b = span?.b;
    const where = b && !b.busy && b.seed === seed && !state.transitioning ? drawnAt(b.cube) : null, here = !!where && b.cube === state.cubeKey;
    showPartner(p.slot, where ? span : null, p.name, where);
    showHelp(p.slot, here && Array.isArray(b.ko) && finite(...b.ko) ? b.ko : null, p.name);
    // and their robot, wherever it is (it may be left behind in a cube beside ours)
    const rb = b && b.seed === seed ? robotOf(b.robot) : null, ra = rb && span.a.seed === seed ? robotOf(span.a.robot) : null;
    showOtherRobot(p.slot, rb && { a: ra, b: rb, k: span.k });
  }
}

addEventListener('pagehide', () => {
  if (online.role === 'host') for (const p of peers.values()) p.link?.send({ t: 'bye' });
  else link?.send({ t: 'bye' });
});
