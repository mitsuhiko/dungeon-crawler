# The chat box: chronicle, chat and console

Status: implemented. One box, bottom left, for what happened (the chronicle), what the players
say to each other (chat) and the commands (the console).

## The box

- **Enter** opens it to type (the action key is F or right Ctrl, `game/action.js`). A line is chat; a line that starts with `/` is a command.
  **`** (the key left of 1, `^` on a German keyboard; by `e.code`, so any layout) opens it with
  the `/` already typed. **Esc** closes the list of suggestions first, then the box. Enter on an
  empty line closes it too, and so does a chat line or a command. The game goes on while it is
  open (it does not pause).
- While typing, the game's keys are not the game's (`game/console.js` stops them at the field;
  the keys held to walk are let go when it opens). Clicks in the box keep the field focused; a
  click into the world closes it. The wheel scrolls the box, not the camera.
- Open, the log's text can be selected and copied (Cmd / Ctrl + C), a `/seed` or a `/where` line.
  A new line leaves the selection as it is: the rows are only added and taken away, a changed one
  (kills merged, a death's record opened) made again. While the log has the focus the keys still
  are not the game's: copying goes to the browser, Esc closes the box, any other key goes back to
  the field. A click in the log that selects nothing goes back to the field too. Closed, nothing
  is selectable, and closing drops the selection.
- Closed, a new line shows for `SHOW_FOR` (12 s) and fades; open, the whole chronicle scrolls,
  filtered by **All / Chat / Events**. A death's line opens to its record when clicked.
- Under the lines, the game's last word (`setStatus`: "Inventory is full", "Horde awakened!") shows
  for a moment. It is not kept: the chronicle keeps what matters.
- **Up / Down** move through the suggestions while they show (the list wraps and scrolls; up to
  50). Without suggestions (an empty line, chat, after Esc) they go through the lines typed
  before (the last 50, kept in `localStorage` across reloads: `cube-crawler-history`); once
  going through those, they go on through them.

## The chronicle

`src/core/chronicle.js` (pure) and `src/game/log.js` (the session's diary). An entry is plain data:
`{ id, kind, data, who, at, time }`; the words are made when it is shown (`describe`), so the same
entry reads "You died" on our screen and "Anna died" on a friend's, each in the reader's language:
what an entry keeps about things is an English message or words to say (`docs/i18n.md`), never a
sentence in one language. It is kept for the visit only:
a reload starts a new diary, a new world adds a separator line. At most `LOG_LIMIT` (200) entries.

| kind | when | data | told to friends |
|---|---|---|---|
| `death` | we died (`game/flow.js die`) | the death record | yes |
| `down` / `up` | knocked out / helped up, playing together (`game/downed.js`) | `{ cause, by }` / `{ by }` | yes |
| `level` | a level up (`game/enemies.js awardKills`) | `{ level }` | yes |
| `guardian` | a guardian defeated, its gate open | `{ label, level, depth, boss }` (label: its words, `enemyWords`) | yes |
| `depth` | the first time at a depth in this world (`game/flow.js settleIn`) | `{ depth, place }` | yes |
| `loot` | an Unusual (or better) weapon picked up (`game/loot.js`) | `{ item, rarity }` (item: `itemWords`) | Remarkable and better |
| `kill` | enemies defeated; kills within `MERGE_TIME` (6 s) are one line | `{ count, xp }` | no |
| `horde` | a horde woke up | `{}` | no |
| `trade` | bought something (`game/inventory.js`) | `{ item, copper }` | no |
| `craft` | the Enchanter or the Smith worked on a weapon | `{ what, item, enchant \| affix, into?, copper }` (ids) | no |
| `quest` | a quest taken, done, handed in, failed | `{ title, what, giver?, xp?, copper? }` (words) | no |
| `party` | someone joined or left (`net/session.js`) | `{ text }` | (each sees it) |
| `world` | a new world began | `{ seed }` | no |
| `chat` | someone said something | `{ text }` | always |
| `system` / `dev` | what the console says / a developer command did | `{ text, error? }` | no |

**The death record** (`deathRecord`): the cause (the last blow's reason, `player.lastHurt`,
"Bitten by a Redback!", said "bitten by a Redback" in English, "Von einem Rotrücken gebissen" in
German), the enemy behind it (`by`: its words, level, whether a guardian), the depth
and its place, the cube, the weapon in hand, our level and how long into the session. Every blow
carries its enemy along (`game/enemycombat.js attacker`, set on strikes, projectiles and beams;
it travels with a `hurt` over the network too), and so do the fire and the poison it leaves;
`knockDown`, `hurt` and the fluids note the last one as `player.lastHurt`.

## Chat and news when playing together

Two messages (`src/net/protocol.js`, `PROTOCOL` 8), relayed by the host like the others:

- `chat { text }`: a typed line, to everyone. At most `CHAT_MAX` (160) characters of plain text
  (`cleanText`). The host passes on at most `CHAT_BURST` (5) lines of a guest per `CHAT_WINDOW`
  (5 s) and drops the rest (`chatAllowed`). It shows in the box in the speaker's colour
  (`PLAYER_COLORS`) and over their head for a few seconds (`console.js speech`).
- `news { kind, data }`: what happened to a player that the others care about (the "told to
  friends" column). The receiver checks it (`cleanNews`: only those kinds, only their fields, of
  the right types, short) and writes it into its own chronicle with `who`.

Alone, a chat line is kept all the same; the box says once that nobody else hears it.

## Commands

`src/core/commands.js` (pure: the registry, words, matching, completing, reading),
`src/game/commands.js` (the argument types and the commands everyone has),
`src/game/devcommands.js` (the developer commands, only with `?dev=1`; without it they do not
exist, not even in the suggestions).

Everyone: `/help [command]`, `/seed`, `/clear` (empties the box), `/who`.

Developer (`?dev=1`):

| command | what |
|---|---|
| `/spawn <enemy> [level] [count] [front\|cursor]` | enemies into this cube (no level: this depth's); a kind that comes in troops (the Flimmers) comes `count` troops strong |
| `/kill`, `/remove` | every enemy here dies (XP and loot) / goes (none) |
| `/passive [on\|off]` | enemies stand still and never attack (no argument: toggle) |
| `/daytime [morning\|noon\|evening\|dusk\|night\|dawn]` | the world's time of day (`core/daycycle.js`): the world's play time moves on to the next one (alone or as the host); none: what it is now, and what this cube's sky makes of it |
| `/dayspeed [speed]` | how fast the time of day runs in this game (0: it stands still, 1: as the world's clock, up to 60); the world's play time (respawns) is left as it is |
| `/roll [0\|90\|180\|270\|spin\|off]` | the world rolled on the screen (Monteur's spin, `game/roll.js`, [camera.md](camera.md), "The world's roll"): slowly to a quarter and stays, or spins from quarter to quarter by itself, holding it meanwhile (Monteur does not turn it); off: back to him (the right way up, or as a Monteur here has it); none: how it is |
| `/rollkeys [latch\|world\|screen\|catchup]` | what the movement keys follow while the world is rolled: the screen as it was when the direction was given, held through the turn and caught up once it rests (the default); the world as it was unturned; the screen; or the world while it turns and the screen once it rests; none: which |
| `/tilt [+x\|-x\|+z\|-z\|here\|off]` | the world tipped (Sollmeldon's landing, `game/tilt.js`, [camera.md](camera.md), "The world's tilt"): down towards a side of the cube (or towards where you stand, from its middle) and held there, his mud running to that side; off: level again; none: how it is, and his mud |
| `/mud [balls]` | balls' worth of Sollmeldon's mud poured in round you, in his mire (`game/mud.js`, [bosses.md](bosses.md#his-mud)); negative: taken out again; 0: only his |
| `/mountain [mesa\|terraces\|ridge\|tiers\|crag\|off]` | one of Monteur's mountains (`game/mountains.js`, [bosses.md](bosses.md#his-mountains)) pulled out of the floor round you, here, on any open ground (no Monteur needed; none: a shape at random): the floor cracks, it rises and stands 25 s, then falls apart; off: it falls apart now |
| `/god [on\|off]` | invincible: blows, falls, fire and poison take no health, a fluid puts you back on safe ground (no argument: toggle) |
| `/goto <down\|up>`, `/find <down\|up>` | take the nearest way down / up (PgDn / PgUp), or stand next to it (G) |
| `/goto <east\|west\|south\|north>` | into the next cube on that side, if the depth has one (Alt + WASD: the side on screen) |
| `/goto [depth] [X,Z] [x,y,z]` | a place (`world/coords.js readPlace`, `game/dev.js goPlace`): `/goto 7` depth 7's entrance, come down its way up (`0`: the town's spawn pad); `/goto 3,2` the cube X 3, Z 2 of this depth (as the minimap says it: "cube 3, 2"), in by a side portal; `/goto 7 3,2` that cube on depth 7; `/goto 7 3,2 8.4,3,11.2` a spot in it, in cells (`x,z`: on the highest ground there), on the nearest ground. Only cubes of the depth's plan |
| `/where` | where you are: the depth, the cube, what it is (`world/sites.js` roles: landmark, side-guardian ...), the theme, and a `/goto` line to the spot to copy |
| `/arena [kind] [depth]` | a guardian arena of that kind, the nearest depth first (no kind: this depth's way down) |
| `/horde [depth]` | a depth's wild horde (H) |
| `/span [n]` | the start of a gorge span's long bridge: the next one, or the n-th (docs/world.md) |
| `/bridge [style] [depth]` | the next bridge (of that style) from this depth (or that one) on down (docs/world.md) |
| `/ladder [style] [depth]` | the foot of the next ladder (of that style) from this depth (or that one) on down (docs/world.md) |
| `/height <kind>` | the next tableland ascent, plateau or descent, great shaft, pinnacle, spiral or hairpin (in at its foot), lone peak, great lake or tunnel (docs/world.md) |
| `/waterfall` | into the pool before the next waterfall with a hidden cave behind it (`cubegen/grotto.js`, docs/world.md "Waterfall grottos"): the cubes after this one are made in turn until one has it; again: the next one |
| `/quest <kind> [depth]` | a quest of that kind on that depth (default: this one), from somebody who could give it, taken at once; says where its goal is (docs/quests.md) |
| `/trial [kind\|win\|fail\|reset\|solve\|list] [depth]` | stand in the room before the next trial of a kind (from this depth or that one on down), facing its portal; none in this world: the page comes again with `?trial=<kind>` (same seed) and goes there. `win`, `fail`, `reset`: this room's trial; `solve`: what the generator proved, drawn over the room; no argument or `list`: this world's trials by depth (docs/trials.md) |
| `/spot [kind] [depth]` | stand at the next spot the quests keep free (`hide`, `seat`, `camp`, `outpost`, `glass`; the easy ones of a depth first) from this depth (or that one) on down (docs/quests.md) |
| `/boss <boss>` | into the arena of a real boss (Gusto, Totnar, Squarlo, Flip, Foggery, Renew, Mansk, Monteur, Sollmeldon, Slomo, Qualmos: `core/bosses.js`), through its entrance; one beaten is up again (his gate stays as it is) |
| `/intro [full\|again\|<s>\|go]` | the intro of the boss here again ([bosses.md](bosses.md#the-intro)): `full` (the default) as the first time, him back on his spot and you at the way in; `again` as after, his name a moment and his bar; a number holds the one playing at that second (to look at a moment of it), `go` lets it go on |
| `/testroom [room\|leave] [depth or boss]` | into a test room (`world/testrooms.js`, built by `cubegen/testrooms.js`), dressed as this depth (or that one; a boss: his depth, `world/testrooms.js testRoomDepth`); `leave`: back to where you were; none: the list. `water_hill`: a hill standing in a lake to halfway up, with a shallow shelf to its east to wade down until the water lifts you and you swim, deep water past it, a rim a level over the water to climb out onto anywhere; `fluids`: a waterfall off a cliff into a lake that shelves, a lava pool, an acid pool, a mud pool with pockets of mud on the ground round it; `climb`: a tower for every ladder style, and the hanging styles hanging from a floating platform; `enemies`: every species with its kinds (and the bosses' minions), a row each; `guardians`: every side guardian. In those two every kind stands idle until hit (docs/enemy-kinds.md "Previewing"); `boss`: a boss alone in his own arena, idle until hit (`/testroom boss gusto`, `/testroom boss 1`: Totnar, the boss of depth 1; a depth without a boss has none; no depth: this one's boss, else Gusto; docs/bosses.md "Dev"). They are cubes off the grid (no portals, no props, no enemies of their own: `/spawn` some), never saved as where the hero is |
| `/newworld [seed] [level]` | a new world (N), not saved, of that world level (else the one played now; `?worldlevel=` in the address for the first); a saved hero comes along as it is |
| `/menu` | save and quit to the main menu |
| `/give <item> [count]` | things into the bag as if found: a potion goes on the quick bar, coins into the purse; a weapon or a piece of armor is Vanilla, item level 1, the first equipped or put on and the rest in the bag; a portal scroll only if the hero lacks it (every hero carries one, and it cannot be dropped) |
| `/weapon <weapon> [rarity] [level] [drop]` | roll a weapon and equip it, or drop it at your feet (default unusual, item level 8) |
| `/enchant <enchantment\|off>` | enchant the equipped weapon for free (Toasty, Icky, Nippy, Zappy, Shiny: `core/gear/enchants.js`), or take it off |
| `/armor <armor> [rarity] [level] [drop]` | roll a piece of armor and put it on, or drop it at your feet (default unusual, item level 8; `docs/armor.md`) |
| `/wear <thing\|off>` | a hat on (a Vanilla one into the bag: hats are head armor, `docs/armor.md`), or off what is on the head |
| `/gold <amount>`, `/heal`, `/level <n>` | the hero |
| `/music <mood\|auto>` | hold one mood of the music |
| `/lightview <off\|sun\|lights\|lightmap>` | what the cube's fixed lights' baked shadows look like: the sun's baked shadow alone, the fixed lights' light alone, the lightmap's texels on the solids; `off`: the picture (`docs/lighting.md`) |
| `/perf [on\|off]` | the perf overlay (also `?perf=1`, without the dev tools): frame rate and the worst frames, the lighting's quality level and what it draws, the resolution, the bake's pace, shaders compiled while drawing, draw calls (`game/perf.js`, `docs/lighting.md`) |
| `/bench` | the game held, the frame timed to the end of the GPU's work with a part of it off at a time: the lamp's maps, the sun's map, the enemies' shadows, the fixed lights, plus the fluids' patterns; the table in the console, the costs in the chat box |
| `/saves` | the saved heroes and worlds, and what is being saved now |
| `/save <hero>` | save as this hero (overwritten, or a new one) in this world (a new saved world unless it is saved already, now the hero's world); from then on it saves itself |
| `/load <hero> [world\|new]` | play a saved hero in a saved world (no world: the hero's own one, else a new one) |
| `/delete <hero\|world>` | delete a saved hero or world |

The spawn row of the dev panel, its J key and the inventory's "Developer weapons" section are
gone: these commands replace them.

### Completing

An argument has a type. A type with a list may also read a value written out (`read`: `/goto`'s
cube `3,2`), tried before the list. Types with a list of values (`item`, `weapon`, `wearable`, `enemy`,
`rarity`, `depth`, `mood`, the saves `hero`, `savedworld` and `save`, and small fixed ones
like `way`, `dir`, `toggle`) take their values from the game's own tables (`ITEMS`,
`ENEMY_KINDS`, `RARITIES`, the store of saves ...), so new ones complete without any change
here. `int` and `text` take what is typed.

What was typed is matched against a value's id and its name, ignoring case (`score`):

1. the very one (the name, the id, or the id without `item_` / `weapon_` / `wear_` / `held_`): 100
2. the name starts with it (`rec` → Recurve Bow): 80
3. every typed word starts a word of the name, in order (`gr hea` → Greater health potion): 60;
   of the id: 55
4. the id starts with it (`flask_f` → `item_flask_fire`): 50
5. its letters come in this order (`grsw` → Greatsword): 30 from the first letter, else 20

Best first; equally good ones: the shorter name, then as listed (with nothing typed: as listed).

A list argument may take several words: as many as together still fit something, while enough
are left for the arguments that must follow (`/give health potion 2`, `/spawn fire shraps 4`).
Completion knows this too: the next word goes on with the item while they still fit.

While typing a command the box shows the suggestions (up to 50, 8 at a time, scrolling) (an item's picture, name, dimmed id, a hint: the
rarity's colour, a depth's theme), how the command goes with the argument being typed underlined,
and greyed out after the cursor the rest of the highlighted value (or what it is). **Tab** puts
the highlighted value (its id) in place of the word. **Enter** runs the line: an argument that
clearly fits one value (the only one, or a better fit than any other) is read as that one, so
`/give gr hea` + Enter works without Tab; when it could be several, the box says which. A
suggestion picked with Up / Down is taken by Enter as well (`/height`, Down to `spiral`, Enter).

## Files and checks

- `src/core/chronicle.js`, `src/core/commands.js`: pure; `tests/console.test.js`.
- `src/game/log.js`: the chronicle of this visit; `logDeath`, `noteDepth`.
- `src/game/console.js`: the box; `src/game/commands.js`, `src/game/devcommands.js`: the commands.
- `src/net/session.js`: `chat` and `news`.
- `tests/browser/console.js`: keys, completion, commands, history, deaths and depths in the
  chronicle (`?dev=1`: `await (await import('/tests/browser/console.js')).runConsoleChecks()`).
- `window.__game.chat`: `open(text)`, `close()`, `say(text)`, `run(line)`, `chronicle`.
