# Playing together

Status: implemented: exploring together or apart, fighting together, sharing the rewards,
being helped up and getting back in. Up to four players, co-op.

## Connecting

- Hosting is in the Esc menu (Esc or O, the menu button with touch controls;
  `src/game/escmenu.js`). You always start alone; "Host this world" opens a room: the host gets a
  four letter room code (no I or O) and a link (`?join=CODE`); up to three guests type the code
  in the main menu's Join Game (`src/game/menu.js`) or open the link, which opens it there. The room stays open while there is room, friends come and go. "Stop
  hosting" closes it (with friends in it, the button asks again first: they drop out). Your name
  is your saved hero's (`docs/saves.md`); without one (`?seed=`, the dev tools), a random one.
- `src/net/transport.js`: the links the session talks over, whatever carries them. Over the
  internet `src/net/peerjs.js`: PeerJS (`vendor/peerjs/`, loaded only when hosting or
  joining). The host registers `cube-crawler-<CODE>` with the public PeerJS broker. Each guest
  connects to it, and from then on talks to the host directly over a WebRTC data channel
  (reliable, ordered). `?net=local` uses a BroadcastChannel between tabs of one browser
  instead (`src/net/tabs.js`): for testing without a network.
- **The wire** (`src/net/wire.js`): a carrier only moves text frames of at most 16000 bytes
  (what any data channel takes; PeerJS runs with `serialization: 'raw'`, as its `json` mode
  drops messages over 16300 bytes and closes the connection). A message (an object with a
  type `t`) goes as one frame, or, when big (`welcome` in a long-played world, `faces`,
  `quests`), cut into pieces that follow one another and are put together on the other side,
  up to 8 MB. Too big a message or no message at all throws when sent; a frame that breaks
  the rules closes the link. Carriers make their links with `wireLink` only, and
  `transport.js` refuses any other: whatever carries the frames (PeerJS now, a WebSocket or
  bare WebRTC later), the session and the size rules stay the same. A game from before the
  wire (`PROTOCOL` 10 and older) is told the versions differ.
- **A star:** the guests are only connected to the host, which passes on what they say to
  each other. Every player has a number (slot): the host 0, the guests 1 to 3 in the order
  they came (`MAX_PLAYERS` in `src/net/protocol.js`). A guest's message goes to everyone
  else, unless it says `to` (a number or a list); the host stamps who it is `from` and passes
  on only the types in `RELAYED`, so a guest cannot speak for the host or for someone else.
  Only the host has to be reachable, and only it holds a connection to each player.
- `src/net/session.js`: a guest says `hello`, the host answers `welcome` with the guest's
  number, the players there, its world seed, and what it defeated and opened so far, and
  tells the others (`joined`; `left` when one goes). The guest starts that world and keeps
  its character (level, bag, gear); the floor loot and opened chests come in the `welcome`
  too (a guest getting back in takes the host's instead of its own). Every world is the
  same for the same seed, whatever the order cubes are visited in (`world/wfc.js`), so no
  map goes over the wire. Only the host starts new worlds (with the dev tools, N); the guests follow
  (`world` brings the seed and the progress there, like the `welcome`).
- **One clock:** the world's play time (`run.clock`: enemies coming back, the slime marsh's days,
  nights and meteorites) must be the same in every game. Counting frames it would drift (a slow
  frame is cut short, a crit's hit pause, a hidden tab, loading), so together the host's runs on
  real time (`performance.now`) from where it was, and tells it with every `ping` (once a second,
  also from a background tab) and in the `welcome` and `world`. A guest runs it on, on its own
  real time, from the word that came quickest of the last 8 s (each is late by its trip): a word
  ahead of it puts its clock forward at once; up to 2 s behind it waits for the host's; further
  behind it goes back (`game/worldclock.js`, `core/worldclock.js`). Alone it counts the frames
  played again, from where it was.
- Everyone sends `me` 20 times a second: cube, position, the character's 14 bone rotations
  (`render/partner.js capturePose`), weapon model, worn things (armor with its rarity, so it
  shines the same, and whether the shield is on the back: `id@rarity@back`, `net/protocol.js
  wornOf`; [armor.md](armor.md)), skin id, health and level. The
  others draw them as a figure in the player's colour, ~110 ms in the past, blending the two
  messages around that moment (`src/net/sync.js Timeline`). Animation, attacks, ragdolls and
  get-ups all come along with the bones; nothing is animated twice. The host passes `me` on
  at once to players in the same cube and when it changes cubes, else only every 500 ms
  (`FAR_EVERY`): far away it is only needed for the minimap.
- **Colours:** every player has one colour, by their number (`PLAYER_COLORS` in
  `src/net/online.js`: host blue, then green, orange, violet), the same on every screen: their
  hero's clay (`render/partner.js playerTint`; our own hero wears ours too while together,
  `render/character.js tintCharacter`, and goes back to its own look alone) and their arrow on
  the minimap; over a friend's head their health bar is in their colour too (your own stays
  red, like playing alone).
- **Skins:** a painted skin goes over that colour, on every screen. `me` carries only its id;
  the others ask for the PNG once and get it in pieces (`skinWant`, `skin`; `docs/skins.md`).
- Each explores where they like. Each player is an arrow in their colour on the minimap, pointing
  where they face (a friend off the map is a line under it: another depth, in a house, far
  away). The map is an octagon of glass, follows you and turns with the camera (`game/minimap.js`).
- **The teleport scroll**: playing together, the room portal scroll goes by that name (the
  same item, `core/items.js` `together`, `game/itemnames.js`). Using it first asks where to
  (`game/teleportmenu.js`, on the quick bar keys or a click): where you came into the room, or
  one of the others, in their colour. A friend in another world, travelling or right beside you
  cannot be picked (it says why). Then it is read as alone (3 s holding still), and where the
  friend is counts once it is read: you fade over to their cube and stand beside them, locked
  out of any portal you arrive in (`online.js travel`, `session.js follow`,
  `game/portals.js lockPortalsHere`). Esc, using the scroll again or moving closes the menu.
- Friends may play in different languages: each reads their own. What goes between the games
  about things (news, quests, rewards) carries words to say, not sentences (`docs/i18n.md`), and
  each game says them in its language.
- A fifth player is turned away (`full`), another version too (`version`, `PROTOCOL` in
  `src/net/protocol.js`). Leaving sends `bye`; 12 s of silence counts as gone. The host's
  room stays open for new guests. When the host leaves, the game is over for everyone.
- A guest that lost the connection (no `bye`) tries to get back in, every 3 s, ten times.
  Its `hello` carries the page's `pid`: when the host still holds the old, broken connection
  of the same player, it swaps it for the new one instead of turning it away, and a player
  that comes back gets its number back while it is free. Same seed: the guest keeps its world
  and goes on where it was.

## Who runs the enemies

- A cube's enemies are run by one game, the **runner**: of the players in the cube, the one
  with the lowest number (`protocol.js runnerOf`), so the host's while the host is in it.
  Alone in a cube a player runs its own enemies, like playing alone. The others in the cube
  are **viewers**: shown the runner's enemies (`net/foes.js Runner`, `Viewer`).
- Every game works it out for itself from the others' last `me` (`session.js
  updateRunner`). When a player with a lower number comes into a cube (and the runner there
  was there first, a second or more), the old runner hands its enemies over as they are
  (`handover`: positions, health, fighting or not) and is shown the new runner's from then on;
  the new runner's freshly spawned ones take those over (`game/enemies.js adoptEnemies`).
  The other viewers follow the new runner (`Viewer.follow`). When the runner leaves (or its
  connection goes), the next lowest number there takes them over the same way, from what it
  was shown.
- A kill apart tells the other games the enemy is gone (`defeated`), and a guardian's gate
  opens for everyone; the XP and loot are only the killer's. An ordinary enemy's `defeated` says
  its cube and life (`cube`, `n`), so it comes back for everyone
  ([progression.md](progression.md#enemies-come-back)). The `welcome` brings the host's play time
  and kills along, and the guest's clock follows the host's from then on (**One clock**, above). Coming into a cube a friend is in
  already brings nothing back: it stays as they have it. The roster says each enemy's `respawn`
  and `wave`, so a viewer's kill drops the life it is in.

## One map for both

- Discovered cubes are shared (`visited`, from `game/flow.js discover`): what anyone found is
  on every minimap and counts for the faces discovery opens (`shareVisit`; a cube the friend
  found is made here first if it is not yet).
- Open side faces are shared too (`faces`, `shareFaces`): where one walked across (a gate gone,
  a portal turned into an open wall), the others can as well.
- Joining (and getting back in) both send what they have: the host in `welcome`, a guest that
  keeps its world after a lost connection in `visited` and `faces`.
- The beginning ([story.md](story.md#the-beginning)) is shared too (`story`): whoever takes his
  sword opens the camp's gate for everyone; whoever finds the glassmaker's glass on the rock past
  it opens that room's gate for everyone, and his recording plays for everyone at the same moment,
  wherever they are; whoever finds his glass on the road after it sets its recording playing, for
  everyone (and it is gone for everyone), each recording cutting short the one before. Each player
  takes a sword of their own: it stays in the ground for a hero with no weapon at all (one who joins
  empty-handed). The beginning's scenes (the robot waking, the glass shown) play whole only for a
  player alone in their cube, else what they do happens at once; the tutorial's card is each
  player's own, and a guest gets none.
- The robot ([story.md](story.md#the-robot)): every player has their own, which lies asleep in
  the merchant camp until they come by (a guest's too, in a world where the host's woke long ago:
  what the narrator said is not sent), says hello only to them and follows only them. Everyone sees everyone's: each game flies its own
  and sends where it is in its `me` (`robot`: cube, place, yaw, fade, clip, `protocol.js
  robotOf`, `game/robot.js robotWord`); the others draw it there, ~110 ms in the past like the
  figures, also left behind in a cube beside theirs (`game/robot.js showOtherRobot`, a copy of the
  model each, `render/robot.js drawOtherRobot`). Each game's robot flies round every hero and
  enemy it shows, so it goes round the friends too, never through them.

## Fighting together

- In a cube together the enemies live on the runner. Its AI goes after any player there
  (`game/party.js`): each enemy picks the nearest one that can be hurt (`chooseTarget`), keeps
  it unless another is clearly nearer (2 cells) and never switches in the middle of an
  attack; whoever hits it becomes its target. Unaware enemies notice any player. A guardian's
  room and a horde mind the player nearest to them. Every other player there is a stand-in
  body on the runner (`body` of each player in `session.js`), updated from its latest `me`
  (position, floor, down or not).
- A viewer has no enemies of its own (`game/enemies.js mirrorEnemies`). The runner sends a
  `roster` of its cube's enemies (ids, levels, profiles: plain data) to each viewer new
  there, to all when they change, and to one that asks (`want`, after coming into a cube or
  dying; asked again after a second without an answer), and `foes` 15 times a second: one row
  per enemy (`protocol.js rowOf`). Viewers show them ~110 ms in the past, like the other
  players (`src/net/foes.js Viewer`).
- A viewer fights what it is shown with its own weapons and rules. Its hits and statuses go to
  the runner (`hit`, `afflict`, via `net/online.js relay` from `game/sword.js hitEnemy` and
  `game/statuses.js`), which applies them (no hit pause or camera kick for a friend's hits).
  Statuses are burning, poison, chill and zap (enchanted weapons, `game/enchants.js`); a
  viewer tells the runner about each at most every 0.5 s per enemy (a zap every time), so an
  Icky weapon's poison piles up a little slower on another's enemies. The rows carry which
  statuses an enemy shows (`protocol.js` `BURNING`, `TOXIC`, `CHILLED`, `ZAPPED`).
  For 1.5 s the viewer's own result beats older rows from the runner; a death it saw first
  stays.
- Blows on a viewer (bites, projectiles, beams) are decided on the runner against its
  stand-in and sent to that player only (`hurt`); it applies them like any blow
  (`game/enemycombat.js hitPlayer`). The runner's projectiles fly for the viewers too
  (`shot`, `landed`), beams shine there from the rows. Everyone in a cube sees the others'
  arrows, bolts, spells and flasks fly (`arrow`, `flask`): only the thrower's side hurts
  anything with them.
- While together the inventory does not stop the world (`game/state.js worldPaused`): your
  own input stops, the others and the enemies go on.

## Rewards

- Every kill in a cube together gives each player there its XP (scaled by their own level):
  each game sees the enemy die and runs its own `awardKills` (`game/enemies.js`).
- The floor loot is **shared** (`game/loot.js`): one copy of every pickup, for whoever takes
  it first. Coins go to whoever runs over them, weapons to whoever clicks them first.
- **Drops:** only the killer's game drops an enemy's loot: whoever hit it last (`lastHit`,
  set by `game/sword.js hitEnemy` and statuses; the runner sends it in the `foes` rows). The
  runner drops it for a killer who is no longer in the cube. Loot is seeded (world seed,
  enemy, the killer's weapon kind), so the killer's game rolls it and shows it at once, no
  waiting: it is a guess the host confirms. A guest sends its drop (`drop`); the host keeps
  the first drop of each source (`run.dropped`) and tells everyone (`loot`). A guest whose
  guess did not stand gets what stands instead (another's drop of the same source) or `null`
  (the host runs that cube and the enemy is still alive there: the guest's killing `hit`
  reaches the host before its `drop`, over the same ordered line).
- Sources and ids: an enemy `e:<id>`, a chest `c:<site id>`, something put down from the bag
  `b:<player>:<page><n>` (page: a tag of the page, new after a reload, so it never meets what
  a saved world still holds); a pickup is `<source>#<i>`, so a guessed drop and the one that
  stands line up pickup by pickup (`acceptDrop` keeps what matches, swaps what does not).
- **Taking** is a claim (`claim`): the host's stand at once (it tells the others `took`); a
  guest's pickup flies in at once, the guest asks (`take`) and credits it once the host's
  `took` names it. If someone else was first, it turns and flies to them. A claim is only
  made when the item fits the bag; if the bag filled up meanwhile, it lands at the feet
  again. Alone again, whatever a guest was still waiting for is its own (`settleClaims`).
- **Chests** open for everyone: the opener's game rolls the spill (leaning to its weapons) and
  sends it like any drop; the others see the lid open (`game/chests.js shareChest`). Two
  players opening one chest at once: the first drop stands, the other's is swapped for it.
- **Putting something down** (from the inventory) drops it for everyone: a way to hand a friend a
  weapon.
- **A death that puts a cube back** (the runner dying with nobody on their feet beside them)
  undoes the drops since it came in for everyone (`forget` to the host, `gone` to all): those
  enemies are back and can drop them again. What was put down or spilled by a chest stays.

## Quests

The world's quests are shared ([quests.md](quests.md)): everyone plays the same ones. The host's
game keeps the quest log (`state.run.quests`) and decides; it sends the whole log (`quests`) with
the welcome and whenever it changes. A guest asks the host for what it does (`quest`: accept,
archive, unarchive, restart, hand in) and tells it what happened where it is (`quest` with an
event: a cube visited, a horde broken, standing at a landmark). Kills and opened gates reach the
host anyway (`defeated`). A quest handed in pays everyone in the game, wherever they are: the host
pays itself and sends `questReward`, each guest pays itself once (`game/quests.js`).

## Downed and helped up

- A fatal blow on dry land, with a friend in the cube and on their feet, leaves you lying
  where you fell (`game/downed.js`): the ragdoll stays, enemies leave you be. Any friend
  helps you up by standing within 1.3 cells for 2 s; you get up with 30% of your health.
  After 30 s, or when no friend is left in the cube on their feet, you are back at the
  entry (R gives up at once). Notes over the figures say what is going on (`me.ko`).
- Playing together a death never resets the cube (`game/flow.js die`) while a friend is still
  fighting in it, and a viewer's enemies are the runner's anyway. Only the runner dying with
  nobody on their feet beside them resets it, for everyone there.
- Time runs alike for everyone: the Teacher cannot pause or slow it while together
  (`game/pace.js`).

## Talking

- **Enter** opens the chat box (`game/console.js`, `docs/console.md`): a typed line goes to
  everyone (`chat`), shows in their box in the speaker's colour and over the speaker's head.
  The host passes on at most 5 lines of a guest per 5 s and only plain text up to 160
  characters.
- What happens to a player that the others care about goes to them as `news` (died, knocked
  out and helped up, levelled up, a guardian defeated, a new depth reached, a Remarkable or better
  weapon found): each game writes it into its own chronicle as the friend's
  (`core/chronicle.js NEWS`, checked by `cleanNews`). Joining and leaving are in it too.

## Not done

- Dev-spawned enemies stay with the game that spawned them: they are not handed over.
- The host cannot pass the game on: when it leaves, the others play on alone.
- Guests only reach each other through the host, which doubles the trip between two of them.
