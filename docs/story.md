# Story: the broken world

Status: a sketch, being worked out; of it a first try at the opening ([film.md](film.md)), the
beginning in the town and the robot coming and following (below) are built. This page replaces the
earlier story (an old Glassmaker woman whose memories were the cubes). The narrator's lines of that
story are gone: what it says now (`src/core/narration.js`, `src/game/narrator.js`,
[narration.md](narration.md)) are the glassmaker's recordings (the beginning's, and his glass in
the depths, down to the one above the core: "His glass in the depths" below) and the robot (its hello, and from
then on what it sees: "What the robot says" below). Complements [world.md](world.md),
[bosses.md](bosses.md), [quests.md](quests.md), [saves.md](saves.md), [online.md](online.md) and
[i18n.md](i18n.md).

Tone: still cheerful, with a sad edge, and hopeful at the end. Short lines while you play, one or
two sentences at a time.

Setting: mystical, with a steampunk turn: brass, steam, clockwork and star-glass. There are no
scientists, no space and no rockets; there are star-readers, the sky and winged machines.

## What happened before

- **The stone.** The star-readers saw that a great stone was falling towards the world.
- **The glassmakers.** They went to the glassmakers (craftsmen, not star-readers). Their glass is
  made of star-sand, and it does two things: it **keeps** whatever it closes round, unchanged,
  as amber keeps a fly, and it **rises**, because star-sand wants to go back to the sky. So the
  glassmakers closed their glass round pieces of the world, and the pieces rose. Whether they
  cut the whole world into pieces or only saved some of it is left unclear.
- **The ark.** A winged ark of brass and glass, with great wings like a bird's and steam
  billowing under it, carried the pieces up into the sky. One of the glassmakers went with them,
  to tend the glass.
- **The creature.** The star-readers also brought a creature on board, because it makes something
  important for keeping the pieces going (what exactly is still open; maybe what keeps the glass
  aloft, or the light in it).
- **The comet shower.** A small comet shower struck the ark. Its glass wings broke, and the
  pieces it carried, no longer held together, scattered into the dark, each its own way. The
  glass round them cracked, but held.
- **The fall.** The ark's hull fell, with the glassmaker and the creature in it, below all the
  pieces, to the bottom of the broken world: the core, where no light reaches. The game's way
  down through the depths is the way there.
- **The kidnapping.** The creature is very clever and learned the people's language. Down there it
  holds the glassmaker, and made him build something it could escape with. (Its escape did not
  break anything.)
- **The recordings.** While he is held, the glassmaker blows his words into small bubbles of
  star-glass (it keeps what it holds: his voice) and lets them go. Star-glass rises: they come up
  through the dark and come to rest wherever they come to rest, in the pieces above. He cannot
  know where, or who hears them. That is how they reach the hero's piece, and why they lie
  scattered about. The opening is one of them.
- **Forgotten.** Nobody remembers any more what happened.

## The world

- The world is broken into many cubes. Some still hang together; most cannot be reached at all.
  Many people live in parts of the world the game never takes you to.
- **You only ever play in one part of the world.** Every game you are a different person in a
  different part, which is why the world is different every time you play.
- **Nothing carries over** from one game to the next.
- Here and there the glass has **cracks** that still hold.

## The people

- **The glassmaker**: a man, a craftsman, who went up with the pieces on the ark, fell with it to
  the core and is held there by the creature. He is
  never seen; you only hear his recordings. His name is still open.
- **The robot**: a clockwork robot of star-glass, built by the star-readers (hearing the glassmaker's
  voice, it has a distant inkling that he made it). It lies asleep in the merchant camp and wakes as you come.
  From then on it goes with you, lights the way, and will help you, bring you back when you die
  and tell the story as you play (below, "The robot").
- **The creature**: the last boss, waiting at the core. Clever, speaks the people's language, and
  wanted to escape. It was brought on board as something to be used, which makes it a prisoner too.
  For now the boss at the core is Qualmos, a prototype of the fight ([bosses.md](bosses.md#qualmos)):
  he says nothing yet, and beating him ends nothing.
- **The hero**: a different person every game, from whichever part of the world the game is in.
  They remember nothing as the game begins, not even how they came to the town ("The beginning").
- **The other bosses**: just bosses that want to stop you. They have no story of their own, so
  the ones we have stay as they are.

## The robot

Decided:

- **Its look**: star-glass, mostly, like the glass bird: a floating, faceted oval of clear, faintly
  aqua glass with two eyes, that hovers (no legs) on little wings. Its gears show, and are glass
  too. The model (`blender/robot.py`, `assets/robot.glb`) adds a little brass:
  about 0.4 cells tall, 0.33 wide (0.6 with its wings), its middle 0.9 above the floor (the hero's
  shoulders). It has two round amber eyes in thin brass rims like portholes, a brass band round its
  waist, and an amber core glowing inside like the bird's, with two meshed glass gears turning
  behind it. Each wing is four glass feathers, swept back like the ark's, on a glass gear that
  turns as its hub. On top is a small wind-up key of glass on a brass shaft.
- **Its clips**: hovering (it looks about and blinks), flying after the hero, talking (its eyes and
  core pulse with the words), lying in the mud, waking up (eyes open, lifts off, shakes off the mud),
  bringing the hero back (rises, turns, spreads its wings, the core flares), cheering (a hop and
  a somersault) and carrying the hero (`RobotCarry`: straining, the wings beating hard and wide, the
  eyes squeezed, the core bright; the hero hangs from it by both hands, their clip `Hang`).
- **How it wakes** (built: `src/core/robot.js`, `src/game/robot.js`, `src/render/robot.js`; the
  scene `robot`, `core/scenes.js`): it lies on its back in the merchant camp, a few steps in from
  the town's side, beside the road (`CAMP_ROBOT`, `world/town.js`), the glassmaker's old sword
  stuck in the ground beside it, asleep (its clip `RobotDormant`), its core only glimmering,
  labelled "Robot of star-glass". As the hero comes into the camp (six cells from it) it wakes in a
  short scene (`game/scene.js`): the hero walks on a step and stops, black bars come in, the camera
  goes to it lying there, and whatever is being said is cut short. It wakes (`RobotWake`, 3.6 s:
  its eyes flicker open, it lifts off and shakes itself) and says hello as it does (`robot`
  'hello', `core/narration.js`, in its voice): oh, hello, where is it, how did it end up in the
  grass?; it cannot remember a thing, not even its name, only that it is made of glass; whoever the
  hero is, it will come along and light the way. Then it points out the sword in the ground right
  next to it: take it, it will be needed out there (`'sword'`, while it is in the ground). After
  the glassmaker's first recording it knows that voice from somewhere, and thinks he made it, out
  of his glass; that is all it can find (`'heard'`). Once it is up it follows. (A click on it, or the action key beside it, "Wake the
  robot", wakes it too.) Its character: cheerful and eager, forgetful. Its name stays open: it does
  not remember it. The world keeps that it woke (its hello, told: `run.told`; any of its lines, so
  a world that heard an older hello keeps it), so from then on it is with the hero as they come
  into the world, in the town too. A world played before it lay in the camp has it lying there
  until the hero comes by; the dev tools (`?dev=1`) skip its waking with the beginning
  (`&intro=1`: it lies there).
- **How it follows**: along the hero's way, not straight at them: where they went, a trail of
  crumbs, and it flies along it 1.6 cells behind them, a little to the side, never right on them,
  hovering at their shoulders. It flies a little slower than the hero runs, and faster the further
  behind it is: running, it falls back two or three cells; once they stop it catches up, from
  anywhere, within a few seconds (never more than 20, nor 60 cells behind: then it jumps ahead).
  It goes through the gates and across the sides they went through, so it can be left in the cube
  behind for a moment (drawn there while that cube shows). Where the way does not go on (a door
  into a house, a well, the town portal, a fall, coming back after a death) it fades out and in
  again where the hero came out. Coming back towards it the short way, it takes the short way too.
  While it waits it drifts about a little and looks at the hero; while it talks it faces them.
- **It is in no fight**: invincible, nobody's target, nothing hits it, it is never in the way
  (it has no body) and cannot be clicked. It flies round the heroes and the enemies, never through
  them (round to the side, or over one where a wall is beside it).
- **Its light**: its amber core lights what is round it (a moving light, about four cells).
- **It pulls you out** (built: `src/core/rescue.js`, `src/game/rescue.js`, the spot
  `src/physics/rescuespot.js`): once it is with the hero, what would kill them in a fluid does not.
  Fallen into lava or acid, sunk in a boss's slime over the head, or swimming in water (or his mud)
  with no way out of it (2 s of it), the hero treads in it while the robot zips over (0.5 s; from far
  off, or another cube, it blinks in over them), grabs hold of it with both hands over their head
  and is pulled up out of it, and it flies them along an arc (kept under the roof; where even that
  would go through rock, it blinks there) onto safe ground: where they last stood safely, else the
  nearest floor that leads on (in a boss's arena, of the fight), dry and well over a fluid that
  comes and goes (a boss's lava, his mud) if any floor is. There it lets go and follows again. It
  costs a quarter of their most health (water nothing), and only if that is all they have left does
  it kill. Meanwhile nothing hurts them, and no enemy strikes until a moment after. With no robot
  yet (it lies asleep in the merchant camp), the fluid kills (water with no way out: they tire, and
  drown after 8 s, as they do when the robot finds nowhere to take them or they cannot pay its
  share). In a trial room not resolved it takes them back to the start, where the room was
  entered, and the trial is not put back: a running event is over (spent) until they leave the
  room and come back, but for the balance, which it puts back for a new try (`docs/trials.md`,
  "Failing and dying"). It says a line as it does (`rescue`).
- **It catches you** (built: `game/rescue.js catchFall`, `game/fall.js`): falling through a hole
  in the ground, the hero still finds the piece below (the slide down, it is on the map from then
  on), but before they land it dives down after them, catches them by the hands and carries them
  back up the hole (the slide up) and on to where they last stood safely. Out of a piece with
  nothing below it (the core, a trial room, Flip's box) it catches them just under the floor. It
  costs a quarter of their most health; when that is all they have left it takes it, and they
  fall to their death. It says a line as it does (`fall`). With no robot yet the fall goes on to
  a hard landing (60) and back to the last safe spot of the piece it started in.
- **It brings you back** when you die, to the last safe place (not built yet).
- **Its memory**: it knows something about the glassmaker, but cannot get at all of what it
  remembers at once. What it says is not one of the memories (the inventory's Memories tab: the
  glassmaker's glass), unless a line of it is marked to be. A first try: a scrap comes back to it
  as each boss is beaten (a tower with no roof, water in glass seen from high above, flying between
  things hung on lines of light, a small furnace, a cloth over something that watched), never more
  than his recordings tell, and it does not know what it means.
- **Playing together**: every player has a robot of their own, and everyone sees everyone's
  ([online.md](online.md)). One of them, the host's, is the one that tells the story.

Still open:

- Its name and its character (its voice is settled: `robot`, [narration.md](narration.md); its
  hello is a first try).
- What it knows about the glassmaker and why it cannot get at all of it (damaged, or parts locked
  by the star-readers?). What brings a memory back (going deeper, a recording found, something it
  sees?), and how it tells one when it comes back.
- Whether the glassmaker made its glass, and whether it knew him.
- How it helps besides lighting the way and bringing you back (pointing at recordings, warning?),
  and whether it ever fights.
- What bringing you back looks like, what "the last safe place" is, and what it costs.
- Playing together: what the other players' robots do and say, whether they look different (a
  tint each?), and what happens to the story's robot when the host leaves.
- Whether it should fly straight over gaps and up cliffs where the hero takes the long way (now
  it keeps to their way), and whether it ever goes ahead (to a recording, to warn).
- Its sounds (ticking, the whir of its wings, a chime of glass).

## How the story is told

- **The opening.** A new game starts with a short animation of what happened before, told by the
  glassmaker. A first try is built (`src/film/opening.js`, [film.md](film.md)): a minute and a half, a
  recording of his from long after, down at the core. He never says his name ("Names do not keep
  in glass"), but the star-readers came to him, his hands made the glass, he gave the ark its
  wings. The stone; the glass closed round pieces of the world; the winged ark rising out of its
  steam; then, without a word, comets, the wings break, the hull falls, the pieces crack but hold
  and tumble apart. One comes to rest and time goes by in it; a bubble of star-glass (his words)
  rises into it from below; "Find me". The game's name, closer and closer into the piece, black,
  and the game starts in the town. It plays before the hero comes into a new world, scored with
  the title song (`music/films/opening.scrim`): the toy tune out of the dark, as the glass is
  closed and with the title; under the words only a ghost of it.
- **The robot** talks while you play, reacting to what happens (a robot can see what you do; a
  recording cannot). It replaces the earlier narrator's reactions.
- **The glassmaker's recordings** lie at random places on the map and tell his story, what
  happened to him and to the world. They are always in his glass: a bubble of star-glass, and a
  recording plays when its bubble is found and breaks, never for coming somewhere or doing
  something. The first two are the beginning's (below). Once begun, a recording is kept: the
  inventory's **Memories** tab plays it again. Only his recordings are memories: the robot's
  lines are not, unless one is marked to be.
- **He does not know where his glass lands.** He blew his words into it down at the core and let
  it rise; he never says what lies round the hero (a town, a gate, "the next gate"), only what is
  true wherever it came to rest.
- **The ending** (below) is the same in every world.

## His glass in the depths

Built for every depth but the core (`core/glass.js`, `world/spots.js`, `game/intro.js`): the road
out of town (0), the sky (1 to 6), act II (7 to 13) and act III (14 to 19); acts II and III are a
first sketch, apart from the bottom of act II (13). The core's (20) is the ending's last recording,
still to come. Each depth has a
**chapter** of the before time, three recordings of about four lines, and a world places two of
the three (from its seed): one **on the way**, in a room of the route about halfway along, and one
**hidden**, in the hardest room of the depth to get to (a branch, high up, behind a guardian). So
one world tells part of every chapter, another more of it, and a hero who goes looking hears more
than one who runs for the well. Each recording stands on its own and says what matters most first.

They are his glass like the town's: a bubble of star-glass floating over the floor (a spot of
kind `glass` the cube keeps clear, `cubegen/spots.js`), labelled and clicked like the
beginning's; walking into it breaks it and his recording plays (the memories keep it, "found at
depth N"). Leaving the depth cuts it short. Playing together, one found plays for everyone, its
glass gone for everyone.

They tell the before time, never what is where the glass lies: he cannot know where it comes to
rest. Now and then one touches on its depth sideways (a glassmaker's breath where Gusto breathes
in, star-readers who never light a fire where Totnar brings the dark, a tide trapped in glass where
Squarlo calls his, the ark turning where Flip turns his box, glass that minds heat over Foggery's
lava, a day he would keep where Renew turns time back, a face behind a cloth where Mansk is a mask,
comets still falling at night where Slomo's meteorites do, the ground standing up where Monteur
pulls mountains out of the floor, crystals, threads like a spider's, old bones, a buried town and
rock that runs like syrup where act III's caves may be).

The chapters, in the order of the depths:

| Depth | Chapter | The three recordings |
|---|---|---|
| 0 | his craft, before everything | `breath` (glass begins as a breath; he is old now, so his words are small), `star-sand` (what is left where a star came down; it wants to go back up; nobody bought star-glass any more), `birds` (his workshop; children at the window; the little glass birds he blew for them) |
| 1 | the star-readers and the stone | `readers` (the tower with no roof; they never lit a fire), `red-light` (the stone a small red light that grew; he kept his furnace burning so as not to look up), `lanterns` (they came at night; the oldest asked if he could make a great deal of star-sand rise; he said yes too quickly) |
| 2 | closing the glass round the pieces | `sea` (the sea the hardest; its tide still comes in inside the glass), `lines` (the star-readers drew lines on maps; he never asked about the places between), `bread` (nobody had to do anything; a baker went on baking; he had no piece of his own) |
| 3 | the ark's wings, and rising | `feathers` (a thousand glass feathers, each wanting the sky a little), `rising` (the ground turned away like a page; up and down stopped meaning much; the pieces came after like lanterns on a string), `steam` (the ark breathed steam; the pieces hung under her on lines of light; they learned to turn slowly) |
| 4 | tending the glass aboard | `furnace` (a small furnace in the hold; star-glass minds heat), `rigging` (every morning up the rigging; a cracked pane sounds high and thin), `cracks` (a crack is not a break; do not be afraid of them) |
| 5 | days on the ark | `one-day` (the day he would keep if he could; glass only keeps), `clockworks` (the star-readers' winged clockworks, four glass feathers a side, good at finding people: the robot is never named), `evenings` (the sun going down below them; nobody spoke of the stone) |
| 6 | the creature brought on board | `cloth` (one more thing under a cloth, put next to his furnace), `face` (the cloth slipped: a face that looked at him the way people look; he said he was sorry), `jar` (every evening a jar filled in the hold, humming; the pieces shone brighter; he did not ask) |
| 7 | the creature learns to speak | `hum` (it hummed along with his furnace, and answered), `words` (its first word was hot; it learned faster than any apprentice, in his voice almost), `mountain` (it asked what a mountain was: the ground, standing up to look at the sky) |
| 8 | the star-readers' worry | `charts` (the marks on their charts drifted apart; the lines of light grew thin; the jar went down more often), `lantern` (the oldest star-reader grew tired and gave him her lantern, a light that is not a fire), `quarrel` (the smiths wanted the thing off the ark; nobody asked it, or him) |
| 9 | its questions | `why` (why was it kept in the dark? needed, by whom?), `hatch` (he opened the hatch an inch to show it the stars; it kept still all night), `left-open` (he left it open every night; eleven stars through an inch of sky) |
| 10 | the smiths, and the cold | `boilers` (the boilers her hearts; an anvil ringing across the pieces), `songs` (the smiths' work songs, which it learned and hummed back, and they stopped singing), `frost` (frost on the wings every night; he scraped a thousand feathers every morning) |
| 11 | a glass bird for the creature | `little-bird` (he blew it a little bird, like the children's; could glass fly?), `cage` (it kept the bird by its face and looked at its wings for a long time), `fond` (the oldest star-reader told him not to grow fond of it; too late) |
| 12 | the last calm night | `calm` (the calmest night, everyone on deck, something coming), `promise` (it asked him never to leave it alone in the dark; it has kept him to it), `counted` (he counted the pieces, the last time he saw them all) |
| 13 | the comet shower and the fall | `shower` (small comets at night, beautiful, then the wing; some still fall), `wings-broke` (the whole sky sounded like a cracked pane; the pieces drifted off like lanterns let go), `bottom` (they fell below everything into something soft; the cage was empty; something in the dark said his name, learned from him) |
| 14 | waking in the dark | `hull` (he woke in the hull; the boilers still; only his own voice came back), `only-light` (his little furnace, the only light down there), `crystals` (walls glittering with crystals, grown from the glass that fell, a kind of company) |
| 15 | its voice in the dark | `voice` (it speaks in a voice like his, always polite; it never hurts him, only will not let him go), `walls` (it moves along the walls on long soft arms, hangs threads like a spider), `bargain` (it wants him to build it wings; he said yes too quickly) |
| 16 | the others | `lanterns-low` (only their lanterns in the hull; he chooses to think they climbed out), `bones` (old bones of things that fell long before them), `names` (he says their names to his furnace each night; names do not keep in glass) |
| 17 | building it wings | `ruins` (a buried town; he takes glass from its windows and says sorry to the houses), `wings-again` (wings again, each feather given a little of his breath), `slowly` (he works slowly, not knowing what becomes of him after) |
| 18 | his bubbles of glass | `first-bubble` (the first was an accident; hundreds since), `fire-below` (the rock runs like syrup below the hull; his bubbles must rise fast), `who-hears` (he never knows where they land; thank you for listening) |
| 19 | nearly finished | `nearly` (the thing he builds nearly done, like the children's birds), `afraid` (it is afraid of the dark too; two old prisoners by one small fire), `find-me` (some of his glass does not rise far: if you found this deep down, you are close; find me) |

## What the robot says

Built: from its hello on (`robotMet`, `core/robot.js`) it talks about what it sees, in its own
voice (`core/narration.js`, the robot's lines; never before its hello is over). Cheerful, a child's
voice through clockwork, it knows the enemies and the bosses and gives tips; of the story it knows
only scraps. It is a companion, not a commentator: it keeps quiet a good while between lines
(`ROBOT_REST`: over a minute before chatter, 40 s before what happens, 12 s before a call in a
boss's fight or after a death; only the story's scenes, a depth, an arena, a boss beaten, never
wait), and what comes while it keeps quiet is not said (it may come another time). Every line once in a world; what happens again and again (a death, a chest, standing about)
is said in another order in every world (`shuffle`), so playing again brings other lines.

- **The beginning** (`robot`, [The beginning](#the-beginning)): its hello as it wakes in the
  merchant camp, the sword beside it, his first glass on its rock and the snakes at its foot, the
  ladder up it, and his voice, which it knows from somewhere: it thinks he made it.
- **A depth reached** (every one, down to the core), **a theme's first place** (every theme),
  **wandering** about a place not seen before (the sky, the caves of act II, the deep, the core).
  Acts II and III are a first sketch.
- **An enemy of a new kind** coming after the hero: what it is and how to beat it.
- **A boss's arena**: what it sees and the one thing to remember (Gusto's wide arms, the hills
  that stay dry of Squarlo's tide, climbing ahead of Foggery's lava ...); **in the fight** a short
  call as his attacks start and as he changes (step out of the breath, up a hill, beat the cats
  first, jump over both waves ...); **beaten**, a cheer and a scrap of memory.
- **A death**: it brought the hero back to where they came in; dying to a boss, a tip for him.
- **Trial rooms**: what to do as an event seals the room, how a puzzle works as the hero comes to
  it (`trial` `puzzle`), done and failed.
- Low health, a long fight, enemies beaten, a level, a chest, a rare find, a quest taken, a horde
  waking, a fall, the first swims, coming home, standing about.
- **Pulling the hero out** of lava, acid, a boss's slime, or water or mud with no way out (`rescue`).

## The beginning

Built (`src/core/intro.js`, `src/game/intro.js`; the scenes `core/scenes.js`, `game/scene.js`;
the tutorial's card `core/tutorial.js`, `game/tutorial.js`). It is the game's tutorial too: the
first three rooms teach how to play, the robot tells the story of it once it is awake, and a card
(not voiced) shows the keys.

**What happened.** Shortly before the game begins, a big glass of the glassmaker's came up out of
the dark (the opening film ends with it rising into this piece) and burst over the town. Most of it
shattered on the town's plaza; the robot and his old sword (tied to it) were thrown into the
merchant camp; the orb with his first recording came down on a rock out on the road. The hero
remembers nothing: not who they are, nor how they came to be here. Nor does the robot. Neither
mystery is answered yet; the glassmaker's recordings mention neither of them (he only knows he tied
his sword to a glass).

**The three rooms.** The road on depth 0 always starts town, camp, then a third room
(`world/layout.js`: its first rooms run straight), and these are the beginning's:

1. **The town.** After the opening the town comes up slowly out of the black, at noon (a world's
   clock starts there: `core/daycycle.js` `START_CLOCK`), and a new hero in a world nobody has
   been in yet walks out of the inn's door onto its step (`WAKE_HOUSE`, `world/town.js`; the scene
   `wake`), empty-handed. On the plaza lies what is left of the big glass (`TOWN_SHARDS`,
   `render/shards.js`): shards of teal glass strewn round a scorched patch, some stuck in the
   cobbles, a few amber glints still in them and a little smoke rising, until the robot is awake;
   then they only glint dimly. A line (not voiced) says the hero does not remember how they came
   here. The tutorial's first card shows how to walk (the move keys, or a click on the ground), turn
   the view and go through the gate; the town's gate is open from the start. Nothing else happens
   here.
2. **The merchant camp: the robot wakes.** The robot lies asleep in the camp with the sword
   standing in the ground beside it. Coming into the camp the hero walks on a step and stops,
   and a short scene plays: black bars, the camera goes to the robot, it wakes (`RobotWake`) and
   the camera comes back. It says hello as it wakes: where is it, how did it end up in the grass;
   it remembers nothing, not even its name, only that it is made of glass; whoever the hero is, it
   will come along and light the way. Then it points out the sword in the ground right next to it
   (a card: walk to it, or click it). Pulled out, the sword is the hero's (the
   **Glassmaker's Old Sword**, in hand if nothing is) and the camp's gate out to the road opens.
   A hero who comes with his sword in the bag already (from another world) gets no second one: the
   one pulled out takes its place (in hand or on the quick bar, if it was). It says nothing: it is
   no glass.
3. **The first glass.** The third room is a flat field with a steep block of rock in it, a ladder
   up its side and the orb on top (the set piece `peak`, `cubegen/setpieces.js`). Three grass
   snakes wait at the foot of the rock, between the hero and the ladder (`FIRST_GLASS`,
   `core/spawns.js`). Coming in, a short scene shows it (`glass`, once a world): the camera goes
   from over the hero's shoulder past the snakes, up the rock to the orb glinting on top, and back.
   The robot says it (`'rock'`): something glowing up there, glass, like itself; it thinks glass
   like that is important, but cannot remember why, and does not remember any of it lying about out
   here; they have to get up there, watch out for the snakes, keep swinging. With the snakes beaten,
   or at the rock's foot, it points out the ladder: you climb, it flies (`'ladder'`).
   The card teaches fighting (hold the attack key, or click an enemy), walking somewhere far with a
   click (the hero finds the way, ladders and all) and walking into the glass. Walking into the orb
   breaks it (a short close-up, `break`), and his first recording plays
   (`'glass'`, `RECORDINGS` in `core/narration.js`): his glass found someone; it keeps his words,
   to hear again (the Memories tab opens); the world is in pieces, and where the pieces meet there
   are gates of his glass; they open for whoever carries it, so carry it and go on. And the room's
   gate on along the road opens (a gate of his glass, like a guardian's, kept with the world).
   After his words the robot knows that voice from somewhere: it thinks he made it, out of his
   glass (a distant inkling: whether he did, or only blew its glass round the star-readers'
   clockwork, stays open), and that is all it can find (`'heard'`). The last card says his words
   are kept in the bag's memories.

From there the story goes on as before. The recording that came up with his sword (`'camp'`: his
old sword rose with one of his glasses, tied to it, whoever finds it, it is theirs; it is old and
plain but honest; listen for more of his glass) is the first of his glass further down the road, in
the first room of the way past the rock (`world/spots.js`, a third glass at depth 0).

**The scenes** (the robot waking, the orb shown, the orb breaking) are played by the boss intros'
machinery, made general (`core/bossintro.js`, `game/bossintro.js`): its camera shots on named
points (the hero, the robot, the orb, the ladder), the black bars, holding the hero and walking them
on, and a click, Space or Enter skipping it. Like a boss's intro, a scene plays whole only for a hero
alone; with others there, it is short (the robot just wakes; the orb is just there).

**The tutorial's card** (`core/tutorial.js`, `game/tutorial.js`; how it looks: [ui.md](ui.md)):
at the left, the steps of where the hero is in the beginning (the town: walking, turning the view,
the gate; the camp, the robot awake: the sword; the rock, once shown: fighting, the way up, the
glass; his words heard: the memories), each ticked off as it is done (or done already: a hero who
clicks to walk has walked). The keys it shows are the player's own (`core/keybinds.js`, named on
their keyboard), and on a touch screen the stick and buttons instead. It never holds anything up:
no gate waits for a step. It can be skipped (on the card, or in the settings, "Tutorial", which can
show it again), and once its last step is done or it is skipped it is not shown again in that
browser. Not with the dev tools (`?tutorial=1` shows it), nor in the guide, nor with
`?tutorial=0`; nor for a guest playing in a friend's world.

Nobody has to stand about and listen. A recording counts as heard whole the moment it begins (the
Memories have all of it), the next recording cuts it short, and leaving its place does too: see
[narration.md](narration.md#in-the-game). This goes for his recordings to come too: each says what
matters most first.

The recording knows nothing of who hears it, nor where it came to rest: it only says what is true
wherever that is. Playing together, the orb's gate one player opens opens for everyone, and its
recording plays for everyone at once, its glass gone for everyone (`story` messages,
[online.md](online.md)); every player wakes a robot of their own and pulls a sword of their own. The
sword stays for a hero without any weapon, so a friend who joins empty-handed is never without one.
A world saved before the beginning, somebody already past the rock (further along the road, or
deeper), has its gates open; so have the dev tools (`?dev=1`; `&intro=1` plays it). A world saved
during the beginning as it was before, the town's glass found, has the orb's gate open and the orb
gone (its recording was heard).

## The ending

You beat the creature at the core. There you find the glassmaker's **last recording**, but not
him, and the **glass bird**. The bird **breaks**: the breaking glass bird is already the theme of
the music (`music/README.md`) and of the splash screen (`src/game/splash.js`).

Whether the world can ever be brought together again stays open. Maybe it never can. It must
not be clear, but it should be **hopeful**.

## What the game's rules mean

| The game | The story |
|---|---|
| Each world is different (the seed) | Another part of the broken world, and another person in it |
| A cube you never visited cannot be seen | A part of the world you have not reached (or never can) |
| Nothing kept from one world to the next | Every game is someone else, somewhere else |
| The bosses, the guardians sealing the way down | Bosses that want to stop you |
| The last boss at the core | The creature that kidnapped the glassmaker |
| The splash screen, the bird breaking | The ending |

Still open: what the town is (each part of the world's own town?), what dying and getting up again
means, and what the glass faces opening between two visited cubes are.

## Ideas, not decided

From the discussion; none of these is settled.

- **The opening should not give too much away**: the stone, the glassmakers' glass round the
  pieces of the world, the winged ark, the wings breaking, the pieces scattering. The creature and the kidnapping are left for the
  recordings to tell.
- **Why the robot cannot remember it all** (that it cannot is decided: "The robot"): its memory
  was damaged, or the star-readers locked parts of it, which open further down. It tells the
  official story; the recordings tell how it really was.
- **The recordings in order**: wherever they lie, the first one found is always the start of the
  story; or each is numbered, and the robot says which are missing (each game shows different
  pieces).
- **Cracks more often further down**, the closer you get to the core.
- **The thing the glassmaker had to build** for the creature's escape was the glass bird. (He
  can make wings: he helped make the ark's.)
- **The bird breaks, and its pieces fly off** in every direction, each a small light towards
  another cube. Whether they arrive or do anything is never told. Every new game could be another
  part of the world a piece flew to, never said.
- **The splash screen shows the ending** before the player understands it.
- **Unreachable cubes in sight**: other cubes far off, with lights, smoke or windows, where people
  live whom you will never meet.
- **The meteors** in the game (the marsh at night, Slomo's) as what is left of the comet shower.

## Still open

- What the creature makes for the pieces.
- The ark's name, and the star-readers' (a word of their own?).
- What happens to the creature when it is beaten.
- Whether the thing it had the glassmaker build was ever finished, and what it is.
- What happens to the bird's pieces.
- Whether the recordings come in a fixed order or are numbered and collected.
- The glassmaker's name; the robot's name and character ("The robot"). Their voices are settled
  ([narration.md](narration.md)): the glassmaker's is `glassmaker`, the robot's `robot` (the
  `child` clone through the `stepped-vocoder` filter, "Made voices").
- How the three acts of light ([depths.md](depths.md)) fit the story: they were the old story's
  childhood, growing up and the sealed memories, and the themes and depths still go by them.
- The music's arc (`music/README.md`, [music.md](music.md)): the bird whole in act I, broken at the
  bottom of act II, in pieces in act III and mended at the core. It followed the old story; the
  bird now breaks at the core.
- What the game needs to tell it (the opening animation, the robot as a companion that follows
  you, the recordings as things to find, the ending at the core), and which of what was built for
  the old story stays: the hero's gender (`core/save.js`, still needed for German words), the
  narrator's queue and subtitles, the lines kept with the world, the world's owner and guests.
- The words for both languages (the glassmaker, the star-readers, star-glass, the ark, the robot,
  the creature, the comet shower, a part of the world), decided before the first line is written
  ([i18n.md](i18n.md)).
