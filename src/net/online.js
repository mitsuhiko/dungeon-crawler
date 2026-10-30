// Whether this game is played together with others (src/net/session.js runs it). The rest of
// the game only asks: role is null when playing alone, 'host' for the one whose world it is,
// 'guest' for those who joined.
export const online = {
  role: null,
  code: null,       // the room code (host: while the room is open)
  slot: null,       // our player number while together: the host 0, the guests 1 to 3
  peers: new Map(), // the others, once connected: slot -> { name }
  // the others as of their last word (in this world): [{ slot, name, cube, here (in our
  // cube, not travelling), x, y, z (in their cube), yaw (facing), hp, out (downed: game/downed.js) }]
  buddies: [],
};
export const together = () => online.peers.size > 0;

// Going over to another player (the teleport scroll: game/roomportal.js; net/session.js sets these):
//   targets()   the others, by number: [{ slot, name, why }]; why: null when they can be gone to
//               now, else why not ('In another world', 'On the move', ...)
//   goTo(slot)  fade over to them and stand beside them; false (having said why) when not now
export const travel = { targets: () => [], goTo: () => false };

// Every player's colour, by player number: the same on every screen (their hero, our own too
// while together, their health bar and minimap arrow: render/partner.js, render/character.js
// tintCharacter, game/minimap.js)
export const PLAYER_COLORS = ['#6fb4e8', '#7cc96e', '#e8a352', '#bb8ce8'];
export const playerColor = slot => PLAYER_COLORS[slot] ?? PLAYER_COLORS[0];

// What the game tells the others as it happens, while playing together (the session sets
// these; null: nobody to tell). For the runner of a cube's enemies (net/foes.js) and those
// shown them:
//   hit(e, damage, crit, dx, dz, knockback)   we hurt enemy e, shown here (game/sword.js hitEnemy)
//   afflict(e, status, spec)                  we set it burning or poisoned (game/statuses.js)
//   launch(pr, e)                             an enemy we run threw pr (game/projectiles.js)
//   landed(pr, end)                           ... and it ended: 'hit', 'blocked' or 'spent'
// and for everyone, so the others see them fly (only the thrower's side hurts anything with them):
//   shoot(shot)                               we shot an arrow, a bolt or a spell (game/shots.js)
//   toss(flask)                               we threw a flask (game/throws.js)
//   defeated(e)                               we got the reward for e (game/enemies.js): apart,
//                                             it stays defeated for the others
//   visited(key)                              we discovered a cube (game/flow.js): theirs too
// and the shared floor loot (game/loot.js; the host decides):
//   drop(key, source, pickups)                we dropped these in cube key (killed, opened, put down)
//   take(key, pickup)                         we reach for it: 'mine' (the host's word, or we are
//                                             the host) or 'asked' (the host will say)
//   forget(key, sources)                      a death put our cube back: those drops are undone
// and the chat box (game/console.js, game/log.js):
//   chat(text)                                we said something
//   news(kind, data)                          something happened to us (core/chronicle.js NEWS)
// and the world's quests (game/quests.js; the host decides):
//   quests(log)                               the host: the quest log changed (packed)
//   questAct({ act, id?, ev? })               a guest: we did this with a quest, or this happened
//   questReward(id, rewards, title)           the host: a quest was handed in, everyone gets this
// and the trial rooms (game/trials.js, net/trials.js):
//   trialAct({ key, act, id? })               shown another's trial: we stepped off the pad, used a part
//   trialDone({ key, gate, time })               a trial resolved here: its gate opens for everyone
//   trialStage({ key, stage })                a sunken room drained a stage further: for everyone
// and the beginning (game/intro.js, core/intro.js STORY_NEWS):
//   story(what)                               the glass found, the sword taken, his glass on the road found:
//                                             the gate opens and the recording plays for everyone
// and Umbra's reef (game/dive.js):
//   suit()                                    shown another's Umbra: we took the diving suit (the water rises)
export const relay = { hit: null, afflict: null, launch: null, landed: null, shoot: null, toss: null, defeated: null, visited: null,
  drop: null, take: null, forget: null, chat: null, news: null, quests: null, questAct: null, questReward: null,
  trialAct: null, trialDone: null, trialStage: null, story: null, suit: null };
