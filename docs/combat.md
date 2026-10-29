# Combat and enemies

Five kinds of weapon: swords swing (most of this page) and so do flails (see [Flails](#flails)),
bows, crossbows and staffs shoot (see [Bows, crossbows and staffs](#bows-crossbows-and-staffs)).
The controls are the same for all.

- **Mouse (Diablo style):** click the floor to walk there (pathing over the floor
  graph, to the closest reachable floor if the spot cannot be reached), click an enemy
  to walk up and swing at it. Holding the button keeps following the cursor / keeps
  attacking. WASD
  still moves and cancels any mouse order. The character only turns when you click
  (or move), never just from hovering. **Space:** movement-only jump.
- **Mouse in the close view (third-person style, [camera.md](camera.md#mouse-look-gamemouselookjs)):**
  the mouse looks around, a click attacks where the crosshair is (held: again and again; the
  enemy on it, else the best one in reach ahead, else into the air), no walking by mouse; the
  right button locks on to an enemy.
- **Movement speed:** the player always runs, by keyboard and by mouse order; holding
  **left Ctrl** walks (right Ctrl is the action key, `game/action.js`). On the ground speed ramps up linearly, standing to a full run in
  `RUN_RAMP` (0.25 s, walking pace after about 0.17 s, so taps stay precise), and brakes
  at `BRAKE` (30 units/s², about 0.1 s from a run). The direction follows the input at
  once, so turning keeps the speed. Swimming and air control are unchanged. Ctrl+W/A/S/D
  are tracked as movement and Ctrl+S/D/A are kept from the browser; on Windows/Linux
  browsers do not let pages stop Ctrl+W from closing the tab (use the arrow keys there).
- **Auto-attack (hold Shift):** swings at the best enemy the blade can reach (blade
  reach plus 0.15 the wind-up step-in covers, the same height band as the blade, in line
  of sight): the hovered one first, else the closest, preferring those ahead of the
  movement keys or the facing (`softTarget`). It never swings at the air and never walks
  up: without an enemy that close it does nothing. Holding keeps swinging and re-picks
  the target; a mouse order carries on between swings.
- A swing is fast and buffered (`core/combat.js`, `game/sword.js`): the blade connects
  0.16–0.27 s after it starts; from 0.3 s moving cuts the recovery short; from 0.42 s
  a queued click chains into the next swing (clicks are kept for 0.3 s). A weapon's
  `interval` (its attack speed: 0.32 s for a short sword to 0.66 s for a greatsword) is
  that chain point; every swing time scales with it. The Slash clip (frames 15–21 are its contact) is retimed
  to fit (`swingClipTime`). During the wind-up the player steps in towards an enemy
  that is just out of reach.
- Blade hits land in a forward arc, within blade reach and vertical overlap, with
  slab / prop line-of-sight. Each target can be hit once per swing. No contact /
  landing / stomp damage. Every weapon crits 5% of the time (a bigger, golden number);
  affixes can widen the arc, crit more often and harder, add life on hit and harder
  knockback ([loot.md](loot.md)). Without a weapon there are no attacks.
- **Stagger and poise:** a hit staggers an enemy: it interrupts its wind-up, stuns it
  briefly and holds its next attack for 0.45 s. Then the enemy is *poised* for
  `profile.poise` seconds (none for spiders and snakes, 0.4 s Fire-cat, 0.8 s Octonaut,
  Shraps and Fire-face, 1.2 s Triangle, 1.5 s Stunder, 1.4 s / 2 s side / descent guardians): lighter
  hits hurt it (it flashes, barely moves) but do not stagger it, so it can strike back. A
  blow of a quarter of its health or more (`HEAVY_HIT`) staggers it anyway.
- Hit feedback (`game/juice.js`): a short hit pause (critical hits only), a camera nudge, sparks and
  ichor, a knockback, a damage number and generated sounds (`audio/sfx.js`).
  Spider bites are a short flinch; a Stunder ram or a lethal bite knocks you over.
- The armor you wear takes its share off every blow first, and a shield in hand now and then
  blocks one: a clang, "Blocked!", a fifth of it and nothing else, no shove, no fire or poison
  (`game/armor.js guardBlow`, [armor.md](armor.md)).
- Knocked over, you ragdoll until the body settles, then get up from where it lies
  (`game/ragdoll.js`): face down or on the back picks `GetUpFront` / `GetUpBack`,
  turned to the body; the animator morphs the ragdoll pose into the clip's first frames.
  The clips keep the feet planted (or lift them), so nothing slides. You can't act until
  you are nearly upright (the clip's `move_time`); walking or swinging then cuts the
  rest short. `GET_UP_SPEED` sets the pace.
- Swimming, ladder climbing, stun, knockdown and travel cancel / block slashes.
- The Glassmaker's Old Sword deals 30 base damage. Level-1 spider has 32 HP / 15 damage (two slashes);
  Stunder has 140 HP / 30 damage (five slashes), a heavier collision body and an
  always-knockdown head-down ram. The enemy under the cursor is highlighted and shows its health. Player/enemy levels and alternative weapons scale these numbers;
  see [progression.md](progression.md). Inventory (`I`) pauses simulation and input.
- Each depth has its own roster (`src/core/spawns.js`, see [depths.md](depths.md)):
  snakes and a rare Stunder near the surface, then spiders, then the stronger species
  further down. Each cube rolls which species it holds, how many, and which one leads.
  Melee species spawn in packs that grow with depth; ranged ones stay at a few per cube.
  Spawn sites must be dry, clear for the species' height, linked to walkable floors,
  at least four cells from portals and spaced apart (a pack gathers closer around its
  first member). If no safe site exists, spawn fewer.
- Every layer has one [wild horde pack](hordes.md) in ordinary terrain: numerous lighter melee enemies
  rally together on sight or damage, approaching from different sides. Their
  attack starts are staggered and capped at three simultaneous attacks. Hordes
  use a small reserved open patch, replacing that cube's scattered roster without
  turning it into an arena. Ordinary packs and guardians keep
  their existing behaviour.
- All species share navigation / AI / melee (`core/enemies.js` holds the tuning; see
  [Enemy behaviour](#enemy-behaviour)).
  Stunder walks at 0.45 cells/s, pursues at 1.05 cells/s using its fast wiggling
  walk, commits its heading before the ram, and contacts at animation frame 16.
- Snake (light green, `blender/snake.py`): slithers with a lateral wave that runs
  back along its body at exactly its ground speed, so the body follows a fixed path
  on the floor. It coils, strikes forward and down and bites at frame 12 (16 damage,
  a flinch like a spider bite).
- Octonaut (pale blue, six legs, two arms, floating face; `blender/octonaut.py`):
  two attacks, listed in the profile's `attacks` and picked at random each time it
  strikes (slaps twice as often): a two-armed slap in front of it (frame 13), and a
  full spin on five legs that sweeps the sixth, stretched out, all around it (frame
  19): 1.4x damage, hits in every direction, knocks the player down. Each attack has
  its own clip; the renderer plays the one `attackOf(e)` names.
- Snake and Octonaut share shining purple eyes (an emissive material; the eyes
  shrink away as they die).
- Fire-face, Triangle and Fire-cat are much stronger than the rest (120 / 170 / 130 HP,
  22 / 28 / 26 damage, 90–110 XP at level 1). Fire-face and Triangle hover: their idle loop runs
  on time, not on ground speed. Any other enemy standing still stands on its walk's first frame,
  unless its model has an idle of its own (a gait `idle`: Qualmos's), played on its own clock.
- Fire-face (`blender/fireface.py`): a floating, glowing red and orange flame with an
  angry face whose tongues flicker. From up to 4.5 cells away, with a clear line to the
  player, it rears back, grows a fireball in front of its mouth and spits it (frame
  18). The fireball sets the player on fire for half a second (6 more damage in two
  ticks, flames and an orange light on the body; water puts it out).
- Triangle (`blender/triangle.py`): a floating, pulsing purple triangle with two
  smaller triangles inside it. From up to 4 cells away it pulls them back and shoots
  them out as a punch (frame 20) that knocks the player down; new ones grow back.
- Projectiles (`core/projectiles.js`, `game/projectiles.js`) leave from the clip's
  muzzle point (`extras.muzzle`, mirrored in the profile) and fly straight along the
  thrower's heading, pitched at the player's chest. The thrower stops aiming before it
  lets go, so stepping aside dodges. Walls, props and range stop them; travel clears
  them. The meshes are exported beside the rig in the same GLB (`props` in
  `render/enemymodel.js`).
- Fire-cat (`blender/firecat.py`): a dark red, striped cat that is slightly on fire
  (tail tip, spine and a mane of flames). It prowls, runs in at 3.4 cells/s (a gallop
  blended in by speed) and pounces from up to 2.2 cells: the AI carries it forward
  between 0.3 s and 0.6 s of the attack until it is 0.55 cells short of the player, and
  it bites on landing (frame 20). The bite does not burn.
- Shraps (`blender/shraps.py`): a light blue crab-armed creature on bent, frog-like legs
  with wavy shins, and a block of ice for a head. It fights near and far: each of its two
  attacks has its own `reach` (and `minReach`), and it picks among those the player is in
  (`attacksInReach`). Within 1.05 cells it raises both claws, lunges and pinches them shut
  (frame 13). From 1.8 to 5 cells, with a clear line, it cocks its right claw back over its
  head while an ice ball grows in it and throws it (frame 21). The ice ball chills the
  player: it moves at half speed for 1.6 s, thawing back over the last 0.4 s (frost on the
  body, `render/chilled.js`). While a throw recovers it keeps closing in, so it ends up at
  the claws. Fire puts a chill out and ice puts out a fire.
- Slowed (`core/status.js`, the general slowing; slime: a Slug's slime ball, a slime meteorite
  and its splat, being inside a Bolime): `slowed` ({ time, slow, weapons, source }) scales how
  fast the body moves like a chill does, thawing over the last 0.4 s; the stronger of a chill and
  a slowing counts (`moveFactor`), and a weaker slowing does not cut short a stronger one that
  lasts longer (`slower`). By default only the body: the weapon is slowed too (`weaponFactor`,
  `game/sword.js`: swings, draws, reloads and throws) only while a Bolime has you (`weapons`).
  On enemies it only slows how fast they move (`game/enemyai.js`). Green goo drips off whoever
  is slowed (`render/statuses.js`).
- Fire shraps: a kind of the Shraps (`docs/enemy-kinds.md`), red, with a head of flames in
  place of the ice block, that throws the Fire-face's burning fireball. The one model carries
  both heads (and both balls in the claw); each kind hides the other's materials (`hide`).
- Spicy (`blender/spicy.py`): a toxic green, curved bar of a body with four glowing stalks,
  red eyes floating above it and two thin legs on wheels, from which three-fingered arms
  branch off. It rolls: `render/enemies.js` spins the wheel bones by the distance the body
  covers along its heading (`profile.wheel` is their radius), so its clips leave them still,
  and a corpse's wheels spin down. It fights from afar (`style: 'ranged'`, 2.4–4.2 cells). To
  attack it rolls backwards, swaying, for 0.7 cells (`retreat`: the AI backs it off between
  0.05 s and 0.75 s of the attack, eased like a lunge), braces, and at 0.9 s shines a green
  laser from both eyes (`beam`, `game/beams.js`, `core/beams.js`). The beam aims at the
  player's chest and follows them at 0.8 cells/s, runs on until a wall or the player's body
  stops it, and after 0.6 s bursts (clip frame 45): a player within 0.28 cells of it (body
  radius included) takes the hit. Walking or running across the beam gets out of it in time;
  standing still or backing straight off does not. A stagger or death of the Spicy puts the
  beam out before it bursts.
- Wolla (`blender/wolla.py`): four wavy rings of water stacked into a body, with two eyes
  floating above them. The game spins the rings about their own axes (every other one the other
  way, `profile.waves` in rad/s, `render/enemies.js`), so the crests keep running round it, and
  faster while it storms. It glides (`hover`) and leaves a wet trail of puddles that dry up
  again (`render/trails.js`). It fights from afar (`style: 'ranged'`, 1.5–2.8 cells, from 3
  cells): a little storm cloud puffs up above it and lightning flashes out of it twice (0.43 s
  and 0.67 s, a light and a thunder clap), then at 0.9 s (clip frame 27) its upper rings lift
  like a lid, it opens its mouth and blows for 0.57 s (`gust`, `game/gusts.js`,
  `core/gusts.js`). A player up to 3.6 cells ahead of the mouth, in a cone 0.35 cells either
  side at the mouth widening by 0.36 per cell, with a clear line to it, is hit once: the blow's
  damage and knock, and then blown back at 7.5 cells/s fading over 0.5 s (about 1.9 cells,
  `physics/move.js`; walls stop it, ledges and fluids do not), with little steering meanwhile.
  It stops turning at 0.5 s, so stepping out of the cone then dodges it. A stagger ends the
  storm. Kinds: Bog wolla (green), Storm wolla (purple), Ember wolla (orange).
- Gusto (`blender/gusto.py`), the first real boss, in place of the first descent guardian: a
  big floating white-grey head with red eyes, jagged teeth, long clawed arms and eight frantic
  tentacles. He grabs and throws, spits Custo triangles (half-size, light blue, fast Triangles),
  splits into three at half health (two proxies that any hit dispels) and blows a vortex through
  his hands. See [bosses.md](bosses.md).
- Totnar (`blender/totnar.py`), the second real boss, in place of the descent guardian of depth
  1: a tumbleweed of sticks and dry leaves with a glowing red heart and three skulls floating
  above it. He makes the arena dark and light again all fight long, throws skulls that push you
  back and come to life (snapping skulls), loses a skull at two thirds and at a third of his
  health, then pours out twig spiders and rolls at you, and at the last calls lightning out of
  the sky and summons bramble Stunders. See [bosses.md](bosses.md).
- Squarlo (`blender/squarlo.py`), the third real boss, in place of the descent guardian of depth
  2, in tidal hills of his own: tiny (smaller than the player), teal and boxy, with a floppy cap,
  three dots for a face and cupped hands, and super fast. He blows jets of water that knock you
  back, summons Squirtles out of his water and, warded while he casts, calls the tide: the flats
  go under (you swim, slowly, and strike nothing) and only the hills stay dry; now and then he has to rest. At half his health he grows
  into a giant six cells tall in a fog and stomps (his foot's shadow shows where). See
  [bosses.md](bosses.md).
- Flip (`blender/flip.py`), the fourth real boss, in place of the descent guardian of depth 3, in a
  box of his own: three overlapping rings of little rings, light blue, floating, the rings now
  and then turning. He throws balls of light (three at once from half his health on), summons
  Sky wollas and flips the world: the box turns a quarter round (or upside down) with everything
  in it, and his tractor beam sets you down on the new floor (upside down: on the floating island
  in the middle; now and then up on a balcony jutting out of a wall); the holes in the new floor
  open once you are down, and the walls round it break open. Every side has stairs, towers, ledges
  and a balcony to fight on. From half his health on he opens black holes that darken the scene
  and pull you in; swallowed, you come out of another one after the world has flipped, and a black
  hole takes you through his flips too. See [bosses.md](bosses.md#flip).
- Foggery (`blender/foggery.py`), the fifth real boss, in place of the descent guardian of depth 4,
  in a caldera of lava with a great round tower in the middle: an orange red frog a little taller
  than you, with big yellow eyes on top of his head. You come in on a bridge over the lava, and he
  waits at the foot of the tower; once you set foot on the ramp the lava rises for a minute, three
  Fire-faces wait for you up the ramp, and he comes up after you, throwing his eyes at you (one at
  a time; they grow back) and croaking up more Fire-faces. Once the
  lava is at its highest, platforms rise out of it round the top and slide about like a sliding
  puzzle. At a third of his health he curls up into a ball with a shield: two Fire-cats guard
  him, and only with both dead can he be hurt, until he calls new ones 8 s later. He spits
  fireballs and makes fire geysers burst out of the floor. At a sixth the lava floods the top and
  only the platforms are safe. Falling into his lava kills, unless your robot pulls you out (a
  quarter of your health). See [bosses.md](bosses.md#foggery).
- Renew, the sixth real boss, in place of the descent guardian of depth 5, in the arena his depth
  would have anyway (with braziers lit round it): no monster but a hero like you, the same figure,
  in a hood. He runs as fast as you, chains his blows, lunges, and rolls out of the way of your
  swings. Each of his four phases is a whole health bar, with a weapon in his hands: a sword, a
  bow (he runs backwards and leaps back to keep his distance), a morning star and a twin morning
  star (two balls: every swing strikes twice). At the end of every bar he turns back time: everything in the room runs backwards to when the phase began, you too (nothing
  hurts anybody meanwhile), and then there are two of you: your echo does again what you did, and
  its blows hurt you, while ghosts of him and his minions fight it again as they fought you. After
  the last one he does not come back: he rises into the sky as a ghost, and his loot falls out of it,
  always a flail among it. In phases 2 and 3 he casts
  spiders, then Fire-faces, out of the sky, and the fight falls from dusk into night. See
  [bosses.md](bosses.md#renew).
- Mansk (`blender/mansk.py`), the seventh real boss, in place of the descent guardian of depth 6,
  on the stage of his museum: a white mask with a blue diamond and two long wavy beige horns,
  floating. He breathes in, and what gets to his mouth he chews and spits out; he throws balls of
  light from his horns that hang a moment and burst where they land; he calls Tornados. At two
  thirds he flies (only shots reach him up there; he lands now and then) and slows time for you
  and his Tornados, not for himself. At a third his horns break and long red ribbons come out,
  simulated as ropes (`core/ribbon.js`): they swirl round him, catch you, squeeze you and let you
  go. See [bosses.md](bosses.md#mansk).
- Squirtle (`blender/squirtle.py`, drawn as the fluid it lives in: `render/squirtleview.js`): a living wave, taller than the hero: its back arches up into
  the crest, which is its head, and the wave's curl in front is its mouth. It lives in a fluid
  (water, lava or slime, each kind its own: `physics/dwell.js`), dives under its surface (nothing
  touches it there), spits balls of water with a tiny push, and leaps out at a player near it to
  crash down on them. On land it shrinks, stands a moment, then dissolves into a puddle that runs
  back into its fluid. It lives in the lagoons, the sunken grotto, the cenote, the slime marsh,
  the volcanic depths and the abyss; Squarlo and Slomo summon them. See
  [bosses.md](bosses.md#squirtle).
- Wolk (`blender/wolk.py`): a sad little light blue cloud with a tear on its cheek, walking on
  two long stick legs, two thin arms with three-fingered hands hanging from its belly. It
  fights from afar (`style: 'ranged'`, 2.6–4.2 cells, from 4.5 cells). To strike it closes its
  eyes and lifts its arms, and its cloud darkens to storm grey (`gloom`, `render/enemies.js`),
  swelling and trembling, lightning flickering inside. Its lightning is a beam of kind `bolt`
  (`game/beams.js`, `core/beams.js`): from 0.3 s a crackling ring with the cloud's dark shadow
  shows on the floor under the player's feet, following them at 1.4 cells/s; for the last
  0.35 s before the strike it holds still. At 1.1 s (clip frame 33) it throws its hands forward
  and a jagged bolt jumps from the front of its belly to the spot (`render/beams.js`): a player
  within 0.3 cells of it (body radius included) takes the blow and is stunned for 0.9 s
  (`shock`: no moving, jumping or striking; sparks crackle over them, `render/shocked.js`).
  The thunder rolls in after it, the later the further from the player it struck (0.45 s plus
  0.11 s a cell, `game/juice.js`). Stepping off the spot once it holds still dodges it; a
  stagger or death puts the lightning out. It dies falling apart: its legs topple away, the
  cloud drops and squashes flat, its arms pop off and land beside it, and it turns light blue
  again. Its side guardian is a grey rain cloud, its descent guardian a polished silver one
  that glints (`guardianLooks` in `core/enemies.js`, `finish` in `render/enemies.js`).
- Mecked (`blender/mecked.py`, after the kids' sketch): a round-bellied beast standing on two
  stubby legs, with long rabbit ears, a long neck, a crocodile snout full of zig-zag teeth, two
  short striped arms and a ringed tail curled into a spiral. It waddles after you
  (`style: 'brute'`, a `charge` of 1.4×) and, from 1.05 cells, mostly grabs (two times in three)
  or bites (clip frame 13). Both have the same reach: it strikes as soon as you are in reach, so
  a shorter grab would hardly ever be picked. Caught at frame 15 (`grab`, `game/grab.js`), you are
  held up against its belly, where nothing else can hurt you and you cannot strike, and bitten at
  1.0 s and 1.5 s (`bites`: each 0.6 of its damage, through the armor but past the shield; a Bog
  mecked's bites poison), then shoved away on your feet at 1.9 s, stunned for 0.3 s. A stagger
  (a friend's blow, a heavy one) or its death makes it let go early: you drop. It dies reeling
  back and toppling over onto its side.
- Moose (`blender/moose.py`, after the kids' drawing; in herds of two to four): a grumpy moose
  with a big round head, angry brows, a wide grin full of jagged teeth and branching antlers, on a
  long thin neck, a long oval body on four stubby legs, and a long tail curving up to a hard,
  smooth ball. Its antlers guard its front and its tail its back; it turns slowly (`turnSpeed`
  2.2 rad/s), so its sides are the place to stand (`style: 'brute'`, a `charge` of 1.3×). It is
  drawn at two thirds of its model's size (`size`), about 1.6 cells tall, twice the player's height:
  - Toss (up to 1.6 cells, in front): it lowers its antlers and flings them up at frame 14.
  - Charge (from 3.2 to 8 cells): it lowers its head, scrapes a hoof and snorts (dust and puffs of
    breath, `render/mooseview.js`), then from 0.7 s gallops along its heading at 6.5 cells/s for
    a second, steering only 0.35 rad/s (Monteur's charge: a `roll`), and tramples whoever it runs
    into (1.3× its damage, knocked down). It cannot be staggered while it runs (`steady`). One that
    runs into something with nobody run over `crash`es into its daze: stars circle over its head,
    and for 1.5 s every blow hurts it 1.5× (`exposed`). One that runs out in the open skids to a
    stop. Jump aside!
  - Tail (up to 2 cells, behind it): an attack that is `back` is started only with the player
    behind it (`behind` in `core/enemies.js`: off its heading by more than about 107°), without
    turning round to them; while it winds up it turns its back to them, and its blow lands behind
    it (the arc about its back). It cocks its tail and sweeps the ball round behind it at frame 16.
  It dies staggering and falling onto its side.
- Slug (`blender/slug.py`, after the kids' sketch; the Slime marsh only): a big dark green slug, a
  long, low body striped across its back on four short curly legs (bending at a knee out to the
  side: two bones each, so they stand on the ground in the game, `render/ik.js`), two eye stalks with a round
  eye on each tip. It crawls very slowly (0.7 cells/s at most), rippling, and leaves a trail of
  slime (`trail`); the marsh's slime does not hold it (`slimeborn`). It fights from afar
  (`style: 'ranged'`, 2.2–4.5 cells, reach 5.5): it rears up and swells, then lunges and spits a
  ball of slime at frame 24 (`slimeball`, 6 cells/s). One that hits slows you (`slow`: to 55% for
  2.5 s, the Black slug's to 45% for 3 s; only the body, not the weapon). It dies sagging flat,
  its eye stalks drooping.
- Bolime (`blender/bolime.py`, after the kids' sketch; the Slime marsh only): a big, see-through
  blob of lime green slime (its skin drawn translucent over the rest: its `shell`,
  `render/enemymodel.js dressEnemy`), a squiggly core floating inside it that glows, two eye
  stalks on top and a little V of slime between them. It gets about only by hopping (its gait;
  a soft boing as it lands, `hops`). It pounces (`style: 'brute'`, from up to 3.2 cells): its
  shadow follows you (a stomp beam, as the Tornado's slam, 2.2 cells/s, holding still for the
  last 0.25 s), it crouches and leaps at 0.4 s (a `ride` onto its shadow, 1.3 cells high) and comes
  down at 1.0 s. Whoever stands in its shadow then is swallowed (`engulf`, `game/engulf.js`):
  inside it, held near its middle, slowed to 35% (a slowing with `weapons`: the sword, the bow and
  the throws too, but you can fight on from in there), digested every 0.9 s (0.4 of its damage
  through the armor alone; the Toxic bolime's poisons). Walking out fills the struggle in 2.6 s
  (the green bar over you), every jump adds 5% of it; full, you burst out the way you walked. A
  stagger or its death lets you out, and at 4.4 s it spits you out anyway; out of it, a second of
  sticky walking, the weapon free. A pounce that catches nobody spits out at once. Playing
  together it is carried out like a grab: by the game of the player it caught. It dies bursting
  flat and melting into a puddle, its eyes in it.
- Tornado (`blender/tornado.py`, after the kids' sketch): a little wind spirit, light purple, a
  floating face with angry V brows over a thin body whose two arms rise up either side of it
  like a U, a round, scalloped overskirt over a long A-line skirt, both swirl-striped, and four
  stubby feet pattering under the hem (each with a knee, so they stand on the ground in the game). The game turns its two skirts about their axes, the other
  way each (`waves`, `render/enemies.js`), faster while it spins up twisters or rides one. It fights
  from afar (`style: 'ranged'`, 2.2–4.2 cells) with twisters (`core/twisters.js`,
  `game/twisters.js`, drawn with its `TornadoTwister` prop by `render/twisters.js`):
  - Two twisters (`twister`, from 1.6 to 4.6 cells; four times in five where it could slam
    too): it lifts its hands and whirls them, a twister spinning up over each (from clip frame
    6), then flings them down and forward at frame 27. The twisters drop to the floor below its
    hands and run out at 2.6 cells/s, bowing out to either side to cross where you stood as it
    let go (it stops turning at 0.7 s), then on the way they came in, 6.5 cells in all. Up a
    step or down one they go on; a wall, a tree or a drop ends them. One that touches you
    (within 0.3 cells of its middle, from a little under its foot to 1.1 cells over it) catches
    you (`game/twirl.js`): you are lifted 1.3 cells and spun round, faster and faster, for 1.1 s,
    held like in a grab (nothing else hurts you, you cannot strike), then flung down the way it
    was going: the blow through the armor alone (no shield stops the wind), and you go over.
    Stepping aside as it lets go dodges them.
  - The hop (`ride` with `back`, within 1.6 cells): when you come close it crouches, a twister
    spins up under it and carries it 2.6 cells straight back from you between 0.3 s and 1.1 s, up
    to 1.1 cells over the way (`game/enemyai.js` ride: the way runs over the floor it can stand
    on, so it is not carried off a ledge or through a wall). A twister stays behind where it took
    off for 1.4 s and catches whoever comes in after it.
  - The slam (`ride` with `onto`, once in five, from 2.2 to 4.4 cells): its shadow (a beam of kind
    `stomp`, like Squarlo's) shows under you from 0.2 s on and follows you at 1.8 cells/s, holding
    still for the last 0.3 s; a twister lifts it from 0.3 s, up to 1.5 cells, and carries it onto
    the shadow, and at 1.5 s (frame 45) it crashes down there, slamming both hands down: within
    0.85 cells you are knocked down (1.2 of its damage).
  While it rides (`airborne`, `steady`) nothing bumps into it, no blade reaches it (arrows and
  spells do), and no blow staggers or shoves it; killed up there, it comes down where it is. It
  dies spinning round and round, slower and slower, and topples over onto its side. Kinds: Dust
  tornado (ochre), Frost tornado (pale blue), Fire tornado (on fire: its twisters and its slam
  burn).
- Flimmer (the kids' idea; act I, depths 2–6): a small person, the hero's own figure (rig and
  clips: `figure`, `model: 'character'`) at 0.65 of the hero's size (0.72 for the biggest kind),
  tinted its kind's colour and all blurry (`render/flimmerview.js`). There is no screen filter:
  the body is drawn see-through, with four more copies of it on its skeleton, each wandering a
  little way round it and a shade off in colour (red, green, blue, plain), a puffed-up shell round
  it that fades towards its outline, and a soft haze of its colour over all of it (one shader for
  every part, moving them in the vertex shader). Running, the copies trail behind it (up to
  0.1 s of its way) and it leaves shimmering smudges. Flimmers come in threes (`troop`: every
  pack exactly three of one kind; the count is rounded to whole troops, `core/spawns.js`, and a
  troop is placed only where all three fit, `game/enemyspawn.js`; `/spawn flimmer` brings a
  troop). It fights like a spider (`style: 'skirmish'`, circling at 1.5 cells, sidestepping),
  fast (2.4 cells/s) and light (28 health at level 1, one hit of a decent weapon). Its attack is
  a beating (from 0.8 cells): it comes into focus, fists up (the warning, 0.5 s), then five quick
  punches right and left in turn (the hero's `Pummel` clip, `blender/character.py`), at 0.5,
  0.67, 0.83, 1.0 and 1.23 s (`hitAt`, then its `more`: blows of their own power and shove,
  `game/enemyai.js`), 0.28 of its damage each and a gentle shove, the last 0.55 and a shove that
  sends you back; meanwhile it steps after you at 1.6 cells/s (`press`) and turns with you.
  While it shimmers (`core/enemies.js shimmerOf`: always, but not while it beats you nor while a
  blow or a bolt stuns it) every blow, shot and flask burst has a 40% chance to go right through
  it (`blur.evade`, `evades`): "Missed!", an airy whoosh (`blur`), its blur flickers aside
  (`game/juice.js evadedFx`); an arrow or a bolt flies on to what is behind it (`core/shots.js
  stepShot`'s `dodges`). The one who strikes rolls (`game/sword.js rolls.evade`): playing
  together, a friend's hit that lands is applied as it is. So: wait until it is sharp, then hit
  it. Killed, it dissolves: the copies fly apart, it fades and breaks into specks of its colour
  that drift up (0.9 s), and no body is left. Kinds: Flimmer (grey, depths 2, 4 and 5), Frost
  flimmer (pale frost, depth 3), Haze flimmer (ochre like heat haze, depths 4–6), Shadow flimmer
  (almost black, the dark forest's at depths 4–6).
- The glow lives in `render/enemies.js`: each of the three (and the Fire shraps) carries a light from the
  shared light pool (`trackLight`), bones named `flame*` keep flickering over any clip,
  the Triangle's emissive materials pulse with its hover beat, fire sheds embers, and
  all of it dies down with the death clip.
- Actual GLB death clips play once and hold their corpse poses, then fade and
  release their skeletons, mixers and instance materials. Portals detach /
  slide / dispose both species, rather than leaving enemies in the old cube.

## Enemy behaviour

One brain for every species (`game/enemyai.js`), a state machine that thinks about five
times a second (0.2 s, jittered so a pack does not decide in lockstep) and acts every frame.

- **Navigation** (`physics/enemynav.js`, `physics/floornav.js`): the floor graph's nodes are
  floors and structure pieces. A stair or bridge piece links to the pieces before and after it
  along its run, the run's end pieces to its floors or landings, a landing to the landings its
  walkways open to (`structureLinks`). So enemies follow you up and down stairs, over ramps,
  bridges and landings, and so does a click-to-move walk. Nobody climbs ladders or jumps. The
  body probe is kept within 0.42 cells, so broad bodies fit on one-cell structures.
- **Noticing** (idle, walk, home, search): within `aggro` ahead of it (100° either side of its
  heading), half that behind it, or within 1.6 cells whatever it faces; with a clear line from
  its eyes to your chest and within 1.6 height. Within 1.4 × aggro in sight it turns towards
  you slowly, so sneaking up from behind works only so long. Noticing puts it in `alert` (a
  "!" over its head) for 0.3–0.6 s, then it gives chase and calls the others: idle enemies
  within 5 cells react a little later. A hit (any damage, also unstaggered ones) makes it hunt at
  once, for longer, and calls the others too. Hordes and guardian defenders keep their group
  logic ([hordes.md](hordes.md), [guardians.md](guardians.md)).
- **Hunting** (`chase`): a path (up to 24 steps; 40 for 6 s after a hit) to the node you stand
  on; while you are not on one it can walk (jumping, swimming, on a ladder, under a ceiling too
  low for it), to the one you jumped from while you are above it; else to the nearest node it
  can start an attack on you from (`game/tactics.js` `postPath`: a blow's reach from the edge of
  the cell, a throw's within its reach with a clear line from its muzzle), so a thrower goes to
  the bank across the river and shoots. It sees you within the larger of `aggro` and `giveUp`,
  all around and up to 4 above or below. A hit tells it where you stand even out of sight, so
  shot from afar it comes. Out of sight it keeps going for 3 s (6 s after a hit); once it
  reaches the spot where it lost you or runs out of memory, it `search`es: it walks as close
  to that spot as it gets, looks around near there for 4 s, then goes home.
- **Out of reach** (`hide`): with no way to you and no spot to attack you from, it walks as
  close as it gets, glares for 1.5 s and takes cover; after a hit it does not stand there as a
  target: it takes cover after 0.4 s. Cover (`coverPath`) is the nearest node (by steps, up to
  40) out of your sight or further than your weapon shoots (its range, at least 4; a friend's
  counts as 8) plus a cell; with none, the furthest it gets. It lies low there for 6 s, facing
  where it saw you, moves on when you come where you see it again, comes back out once it sees
  a way to you, and else goes home. Hit again, it picks cover anew.
- **Between blows**, by the profile's `style`:
  - `skirmish` (spiders, snakes, Fire-cats, Flimmers): backs off after a blow, circles at `circle` cells
    (spiders and Flimmers sidestep facing you, `strafe`; the others walk round), switching sides
    when blocked and now and then, and darts in once the cooldown is over.
  - `ranged` (Fire-face, Triangle, Spicy, Wolla, Wolk, Tornado, Slug): backs away while closer than `keep[0]`, sidesteps while the
    throw recovers, and moves for a clear shot when it has none.
  - `brute` (Stunder, Octonaut, Shraps, Mecked, Bolime, Moose): holds its ground. The Stunder `charge`s: it runs the
    last 1.5–5 cells at 1.8× its chase speed when it can strike again (the Mecked at 1.4×, the Moose at 1.3×).
  Cooldowns vary by ±20% per blow. Throws are aimed ahead of a running player by half the way
  they would run before the throw arrives; changing direction dodges them.
- Blows start within 0.75 height (a stair step or a ramp) and land within 0.85.

## Flails

Flails (`kind: 'flail'`, five bases; stats in [progression.md](progression.md#flails)) are swung
like swords, with the same rules: the blade arc becomes the sweep of the ball, within its reach
and the same height band, one hit per target and ball, the wind-up's step-in, Shift's
auto-attack. Their timing (`FLAIL` in `core/combat.js`) comes round later than a sword's (the
ball trails the hand) and sweeps longer; they play the Slash clip retimed to it. They sweep wider
than any sword and shove harder (their base `knockback`). A flail of two or three balls shares its
active window out between them (`ballAt`): each ball strikes once in its part of it (`sword.ball`;
the hits so far are forgotten as the next ball comes round), for the damage it shows; a body
the first ball shoved out of reach is missed by the next. Their whoosh is deeper, with the
chain rattling (`flail`, `audio/sfx.js`).

In the hand (`render/held.js swingFlail`) each ball hangs on its chain from the top of the
handle and swings with whatever the hand does: a point that falls, keeps its speed and stays
within its chain's length of the anchor (Verlet, in steps of 1/120 s), off the floor under the
one holding it (dragged along it) and apart from its other balls; the ball turns to hang along
its chain, the links are copies of the model's first one laid along it, sagging as it
slackens. The model's own chains, lying as on the floor, are hidden (`blender/items.py` FLAILS:
the anchor, the chain's length and each ball's pivot are in the item's extras). Renew's, the
others' and the echoes' flails swing the same way.

## Bows, crossbows and staffs

The ranged kinds (`kind` in `core/items.js`, five bases each; stats in
[progression.md](progression.md#weapons)) attack like swords do: a planted wind-up, an active
moment, a recovery that movement or the next attack cuts short, every time scaled by the
weapon's `interval`. Each kind has its timing in `core/combat.js` (`KINDS`: `BOW`, `CROSSBOW`,
`STAFF` at a middling interval) and its clip in `character.glb`, retimed the same way as Slash
(`swingClipTime`). Instead of a blade arc, the attack lets a shot go at `activeStart`
(`shotDue`, `game/sword.js`):

- **Shots** (`core/shots.js`, `game/shots.js`, `render/shots.js`): an arrow, a bolt or a spell
  flies straight at the middle of what it was aimed at, where that was when it left (the drawing
  player keeps turning to the target until then, so a moving enemy is tracked during the wind-up
  but can step out of the shot's line afterwards). It flies from the middle of the body at the
  height the weapon lets go (`MUZZLES`, the clips' `extras.muzzle`), so an enemy pressed up
  against you is hit too; the renderer draws it from the weapon and lets it catch up. It hits
  every enemy body it passes once: an arrow stops at the first, a bolt goes through `pierce`
  more, a spell stops at the first and bursts (`burst` cells, `BURST_SHARE` = half its damage
  to everything else there). Walls, props and its `range` stop it (a spell bursts there too).
  Damage, crits, life on hit, knockback (along the flight) and staggering are the sword's
  (`weaponHit`). Travel and level resets clear shots in flight.
- **Targeting**: clicking an enemy walks until it is in range *and* in sight (a clear line from
  where the shot leaves to its body, `lineOfFire`), then shoots without walking further;
  holding keeps shooting. Shift auto-attack picks enemies within the range that are in sight.
  Shots reach enemies up to 2.6 cells above and 2.2 below your feet (`AIM_BAND`), so ledges
  are fair game. There is no lunge.
- **Bow** (left fist): turn side-on, raise the bow, draw to the cheek, loose. A chained shot
  starts the clip at `redraw` with the bow still up, and the two attacks cross-fade (every
  kind's attack clip is played on alternating actions for this, `render/animator.js`). The
  string is drawn by the right fist and an arrow lies on the bow from the moment the fist takes
  the string until the arrow leaves (`render/held.js`).
- **Crossbow** (right fist, like a pistol): raise to the chest, shoot with a kick, then lower
  it to the belly where the left hand draws the string and lays the next bolt. It shows empty
  (string forward, no bolt) from the shot until the reload (`crossbowLoaded`, at the clip's
  `reloaded`), also when walking cut the reload short; a ratchet and click sound just before.
- **Staff** (right fist): lift it beside the shoulder, then thrust it so its head points at the
  target as the spell leaves, the left palm pushing along. The stone glows in the spell's
  colour (`color` per staff) as it gathers, with sparks at the head.
- **Carrying**: the ranged kinds are carried in a hold pose (`HoldBow`, `HoldCrossbow`,
  `HoldStaff`: one arm's two bones, laid over idle, walk, run and jumps by the animator, a
  little looser while running): a bow upright at the left hip, a crossbow pointing ahead at
  the right, a staff upright beside you. Their attack clips start and end in it.
- **Mounting**: every weapon GLB says in its extras which fist it goes in and how it sits there
  (`socket`, `mount_quat_gltf`, from `MOUNTS` in `blender/items.py`); bows and crossbows have
  their string (and a crossbow its loaded bolt) as separate parts that the game poses. `blender/
  loadout.py` renders the player with each kind at the clips' key frames and solves the mounts
  (`--mounts`): the bow upright at the loose, the crossbow level at the shot, the staff upright
  in the hold.

![The bow's Shoot clip, from the hold to the loose](img/loadout-bow.jpg)

The other kinds: [sword](img/loadout-sword.jpg),
[crossbow](img/loadout-crossbow.jpg),
[staff](img/loadout-staff.jpg).

## Fluids and falls

- **Water is swum in.** Clear water is waded through while it is shallow, slowed by up to 45% the
  deeper it is (`WADE_SLOW`, `physics/move.js`); deeper than `SWIM_DEPTH` (0.6 cells) it lifts the
  body off its feet and the hero swims (`player.swimming`, the `Swim` / `SwimIdle` clips, mixed by
  speed: `render/blendtree.js`), slowly (`SWIM_SPEED`), the feet `SWIM_FEET` (0.5) under the
  surface, held there like a spring a plunge sinks into a little and bobs back out of; a tide
  rising or falling carries them along. No weapon swings while swimming (`core/combat.js`); the
  weapon is hidden. A jump out of it is a hop. Into the water there is a splash
  (louder the harder the plunge), strokes slosh (`paddle`) and rings spread on the surface
  (`game/swim.js`, `render/ripples.js`: thin lines in the water's foam colour, like its shore's):
  a collar of little ones where the body cuts it, a wake behind a swimmer, a bigger one with each
  stroke and where they went in, smaller ones round the legs of a wader; no fall into water hurts. The robot says a line about it the first few times. The swimmer is drawn floating on the
  water as it is drawn (its surface rests under the level physics swims at and rises and falls
  with the tide: `render/animator.js`, `render/materials.js waterShownAt`): head and shoulders out
  of it, the hands paddling under the surface. The hero's silhouette (shown where something hides
  the body) is cut off under the surface they swim or wade in (`render/figure.js ghostMaterial`,
  `render/waterline.js`): the water hides the body, but it is no wall. Sollmeldon's mud is swum in too
  (`physics/fluid.js swum`), slowing the strokes like his mud slows a wader; Slomo's slime is not.
- **Out of the water**: a swimmer (or one wading at least `WADE_CLIMB` deep) steps up onto a bank
  up to `SWIM_STEP` (1.1) over the feet: a level over the water's surface. Under a bridge they swim
  on (a structure only a plain step over the feet), if its deck leaves room for the head. Onto a
  bank more than a plain step (`STEP`) over the feet they **climb out** (`game/swimout.js`, the
  `SwimOut` clip of `blender/character.py`): the body is put where the clip's feet end up on the
  bank, turned to its edge, and drawn coming out of the water, morphing from the swimming pose: the
  fists onto the edge, pull up and press, a knee up, the feet onto the bank, stand (about a second,
  `SWIM_OUT_SPEED`). The clip is made for one bank (a level over the water's surface, the feet half a
  unit under it); IK fits it to the real one ([Posing by IK](#posing-by-ik)): for a lower bank the
  body is drawn higher while it is in the water, the fists hold on to the real edge (across from the
  body, on the ground there, however high or far the clip has them), the feet stand on the real bank
  once the knee is up. Water drips off the body and rings spread where it comes out. Moving on
  towards the bank (or not at all) lets it play out, and once the feet are on the bank any moving
  ends it; moving more than 60 degrees away cuts it short: back into the water while the body is
  not up yet and the way leads back, else on from the bank. Coming out, the feet leave wet prints
  for a while, fainter as they dry (brown out of Sollmeldon's mud: `render/footprints.js`). A ladder
  out of the water (`wet`, [world.md](world.md#the-way-down-cubegenroutejs-cubegenreachjs-cubegenescapejs))
  is taken hold of swimming. The generator gives every water a way out; where a standing water (a
  trial's, a boss's) leaves none (`physics/swimout.js wayOut`, looked for twice a second), the robot
  carries them out after 2 s; with no robot yet they tire, and drown after 8 s. So do they with the
  robot along when it cannot take them out (nowhere safe to go, or in his mud too little health
  left for its share): it tries again twice a second while they tire.
- **Walking** stops at edges facing lava, acid or water deeper than wading goes from dry land
  (the head's height but for a margin, judged where the foot goes); already wading it walks on
  into deep water and swims. Jumps, knockbacks and airborne falls can still enter any of them.
  Bridges and dry floors above fluids remain walkable. A mouse order's way may go through the
  water ([clickmove.md](clickmove.md)).
- **What kills** (`physics/fluid.js peril`): lava and acid on contact, and a boss's slime (a
  standing water with a look of its own, Slomo's) over the head. With the robot along (woken in the
  merchant camp) it pulls the hero out instead (`game/rescue.js`, `core/rescue.js`; [story.md](story.md#the-robot)):
  a quarter of their most health, and it flies them to safe ground (where they last stood safely,
  else the nearest floor that leads on: in a boss's arena a floor of the fight, well over a fluid
  that comes and goes if any is, else just over it, else a platform). Only if that quarter is all
  they have left does it kill. Without the robot it kills (`dieInFluid` in `game/ragdoll.js`): you
  burn up in lava, dissolve in acid, sink in the slime. The player ragdolls, slowed
  down and sinking, for at least 2.2 s, then respawns at the cube entry with full health. A
  ragdoll that tumbles in dies the same way (or is pulled out); one knocked into deep water (or his mud) swims
  on. Enemies drown once a standing fluid is over their `bodyHeight`, unless they `swim` (Squarlo,
  the Squirtles); things on the floor are lost in water over the head (`inFluid`).
- There are no dedicated death animations; `render/fluiddeath.js` layers an effect
  over the ragdoll: a splash and bubbles (water); embers, smoke, a glowing then
  charred body and an orange light (lava); fizz, vapour and a green body that fades
  away (acid). The shared character material is restored when that ragdoll ends.
- Falling through a cube into a fluid preserves the landing position; a fall through cubes ends
  on the first landing, in water too. A fall through cubes always ends back in the cube it
  started in (see `docs/world.md`).
- Dying puts the cube back as it was when you came in (`game/flow.js` `die`): enemies
  defeated since return and the coins they dropped that are still on the floor go.
- Entering a cube (or respawning) gives a grace period (`ENTRY_GRACE`, 1.2 s in
  `game/enemies.js`): enemies may chase but start no attack until it runs out or you
  land a hit. Carried by the robot nothing hits the hero, and no enemy strikes until 1.5 s after it
  let go (`RESCUE.grace`).
- Lava and acid *falls* (the sheets pouring off ledges) are unchanged: lavafalls knock
  you down for 50 damage, acid falls hurt over time.

## Development

Run the game and its tests from any checkout:

```sh
uv run --no-project tools/serve.py 8001   # or: npm run serve -- 8001
# http://localhost:8001/?seed=123
npm test
```

When working in a git worktree, the server automatically serves `/assets/*`
from the main checkout, while game code stays in the worktree. This permits
re-exporting Blender assets in the main checkout without copying them into the
worktree. Asset tests follow the same convention (`CRAWLER_ASSETS_ROOT` can
point them at a different checkout).

Use `--assets-root /path/to/repo` to override asset location. The player GLB
is unarmed: just the skinned body, clips and empty `hand.L` / `hand.R` sockets.
The game separately loads the equipped weapon's GLB and mounts it in the socket its extras
name (the Glassmaker's Old Sword, `assets/sword.glb`, on `hand.R`). Gameplay equipment uses `game/equipment.js`: it loads a weapon first,
then atomically updates inventory equipment and the hand-held model. `?dev=1`
adds a weapon roller (base, rarity, item level) to inventory. `render/character.js` also
exposes low-level `loadSword(url)` / `equipSword(null)` for renderer tests only;
these do not change inventory or combat stats. Swimming / climbing hides the prop.
`Climb` is an in-place IK loop covering two ladder rungs (0.56 game units);
vertical speed advances its phase, descent reverses it, and stopping holds
the grip. Regenerate via the Blender commands in
`character.py`, `spider.py`, `stunder.py`, `snake.py`, `octonaut.py`, `fireface.py`,
`triangle.py`, `firecat.py`, `shraps.py`, `spicy.py`, `wolla.py`, `wolk.py`, `mecked.py`, `moose.py`, `tornado.py` and `sword.py` (the SDF creatures share `blender/creature.py`
and can also be rebuilt from a Blender MCP session; previews land in `blender/previews/`, not committed; the pictures here are copies in `docs/img/`, `node tools/preview-images.mjs`). Tests check balance, hit timing,
direction / reach / height, cancellations, deterministic spawns, clearance,
navigation and the exported asset/clip contract.

### Posing by IK

The clips are posed in code and baked. Where a limb touches something (a foot on the floor, a hand
on what it holds, a tentacle's tip on a spot it slams), turning bones by angles never quite keeps
it there: the foot skates, the tip sinks into the floor. Such a limb is posed backwards from the
point it must reach, with `blender/ik.py`, shared by every script:

- `two_bone`: a leg or an arm reaching a point, its knee (elbow) bending towards a pole; `pole_from`
  picks the pole the way the joint already bends, so it never flips (most creature scripts call it
  as `character.two_bone_ik`).
- `chain` (FABRIK, any number of bones) and `arc`: a chain laid along a smooth arc from its root to
  a point, its slack bowing out one way (a tentacle, a tail, a neck), never folding into a zigzag;
  `soften` keeps it from snapping as its target nears full stretch (soft IK).
- `step`: a planted contact's walk loop: on the floor, sliding back as fast as the body walks (in a
  clip played in place, the floor slides under it), then lifted and swung forward.
- `aim`, `aim_chain`: the bases that put bones along the joints a solver gave; `blend` eases an IK
  reach in and out of the pose by angles without a jump; `frame_turn`, `curl`: a shape hung off a
  chain's end (a tentacle's curling tip) following it.

Qualmos is its first user ([bosses.md](bosses.md#qualmos)): his tentacles and his arms' reaches, and
a check that his walk does not skate. The others may move over to it as they are worked on. To look
at clips in motion (a still frame hides a foot skating or a limb snapping), `creature.py
clip_videos` renders each as a little video (`blender/previews/` is not committed).

In the game, IK is laid over the clips every frame (`src/render/ik.js`; which bones of each
creature look, stand and reach in `src/render/rigs.js`): heads (and eyes) turn towards what they
look at (an enemy at the hero once it noticed them, the hero at the enemy they fight, villagers and
the robot at the hero), each foot stands on the ground under it (stairs, slopes, ledges: the hips
go down for the lower foot), a claw reaches for the hero round a melee hit, and the hero's fists
hold on to a bank's edge as they climb out of the water (`grips`). A foot the clip has
down is **held** where it came down (foot locking): turning on the spot, tracking the hero in an
attack or shoved, a body no longer skates over its feet; a held foot too far from where the clip
has it takes a step of its own, while the other feet stand. Only near the hero, in the cube being
played. `tests/browser/ik.js` checks every rig (`runIkChecks`), measures skating as a creature turns
(`runSkateCheck`) and how well the walk clips match their pace (`runStrideChecks`); from the
console, `(await import('/src/render/ik.js')).IK.on = false` turns it all off to compare.

For browser integration checks, load the game, wait for the assets, then run
in the browser console:

```js
const checks = await import('./tests/browser/combat.js');
await checks.runCombatChecks(); // real input (click on an enemy, Shift), controller, damage, GLB poses, cleanup
await checks.runControlChecks(); // run ramp / left Ctrl walk (not right) / Ctrl+W, Space jump, Shift auto-attack only in reach, F unbound
await checks.runNewEnemyChecks(); // snake bite, Octonaut slap / spin kick, their clips and corpses
await checks.runFireChecks(); // fireball + burning, Triangle punch / dodge / walls, Fire-cat chase and pounce
await checks.runTacticsChecks(); // out of reach: shot takes cover, seen glares then hides, back out; shot from afar comes; a thrower shoots from its bank
await checks.runClimbChecks(); // ladder controller, reverse / hold / exits, dynamic weapon
await checks.runGetUpChecks(); // knockdown -> ragdoll -> GetUpFront / GetUpBack, move time, idle pose
await checks.runRangedChecks(); // bow / crossbow / staff: sockets, hold pose, drawn string and arrow, range and walking up, pierce, reload, burst
await checks.runTravelCheck(); // real portal; leaves the player in the next cube
await (await import('./tests/browser/mecked.js')).runMeckedChecks(); // Mecked bite, grab: held, two bites (poison), shoved off, dropped when it lets go
await (await import('./tests/browser/moose.js')).runMooseChecks(); // Moose: tail behind it without turning, nothing at its side, toss, charge tramples, crash dazes
await (await import('./tests/browser/tornado.js')).runTornadoChecks(); // Tornado twisters: spun up, let go, caught, lifted and flung (or sidestepped); hop, slam, burning twisters
const water = await import('./tests/browser/water.js');
await water.runWaterChecks(); // swimming in, out; lava and acid deadly or pulled out by the robot; no way out of the water
const inventory = await import('./tests/browser/inventory.js');
await inventory.runInventoryChecks(); // resets the run; UI, equipment, rewards, revisits
await inventory.runWeaponLootChecks(); // weapon drops, labels, click pickup, the inventory floor column, deaths
```
