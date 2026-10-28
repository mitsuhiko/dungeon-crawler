# Sound

Every sound is generated with Web Audio: no sample files. Music is separate (`docs/music.md`).
All of it plays into the one AudioContext of `src/audio/context.js`, made on the first key or
click. It runs at 44.1 kHz whatever the speakers run at (the browser resamples), with
`latencyHint: 'balanced'`: the audio thread's work grows with the sample rate, and at a device's
96 or 192 kHz the music alone took two to four times as long, up to all of a core, and broke up.

| File | What |
|---|---|
| `src/audio/sfx.js` | one-shot effects: `sfx(name, { at, pan, pitch, volume })`; `at` pans by screen position (`setPanner`, which `main.js` gives the camera: sfx.js knows nothing of the renderer) |
| `src/audio/splash.js` | the splash screen's (`game/splash.js`): the glass bird struck (a muffled knock, the glass ringing on while time crawls), its shatter, and a deep swell gliding into a low chord on D; music waits for it (`holdMusic`, `audio/music.js`) |
| `src/audio/jingles.js` | the jingles: short scores (`music/jingles/`) for a boss beaten, a death, a quest, a level, a chest ..., played once by a synth of their own, one after another, the music turned down under them |
| `src/audio/voices.js` | the enemies' voices, registered with sfx.js as `<species>_alert/_windup/_death` |
| `src/audio/footsteps.js` | footsteps per surface and gait (the slime marsh's slime squelches and lets go with a gloop), pre-rendered into variants when audio starts |
| `src/audio/loops.js` | continuous sounds: the charge and cast drones, the ambient beds, drips and lava pops |
| `src/core/footing.js` | the surface under the player (theme, height, structures, banks, town paths) |
| `src/game/footsteps.js` | steps on the walk / run cycle and the ladder rungs (each ladder style its own sound: `LADDER_STYLES[style].sound`, `themes/builds.js`), landings |
| `src/game/sounds.js` | sounds from watching state: jumps, long falls, ragdoll thuds, getting up, enemy voices |
| `src/game/ambience.js` | ambient levels from the surroundings, the charge and cast drones |

## Listening

`tools/player.html` (`npm run serve`, then `/tools/player.html`) plays every sound with the game's
own code, into the same AudioContext and buses, under Sounds (`#sounds/effects` ...):

- **Effects:** every one in `SOUND_NAMES` but the voices, grouped as `tools/player-sounds.js`
  says (`tests/player.test.js` checks that each is in one group), with pitch, pan, level and a
  repeat (a coin's combo climbs).
- **Enemy voices:** per species its alert, windup and death.
- **Footsteps:** every surface and ladder in walk, run and land; repeated at about the gait's pace.
- **Ambience:** the beds and drones on sliders, drips and lava pops, steered every frame as
  `game/ambience.js` does.
- **Splash screen:** the hit, the shatter and the swell, alone or at their moments
  (`SPLASH_CUES`, `audio/splash.js`, which `game/splash.js` times its picture by).

A one-shot shows its wave, rendered again offline (`renderSfx`, `renderSteps`: the variant
played, `renderSplashSound`), with its peak and how long it is heard above -60 dB, in decibels
or linear; the ambience shows the sounds' bus live. Each recipe's comment in the code is its
description there.

## Effects and where they come from

| Sound | Event |
|---|---|
| `swing`, `flail`, `hit`, `kill`, `hurt`, `sizzle` | combat and burning (`game/juice.js`) |
| `fireball`, `zap`, `frost`, `whump`, `shatter`, `icecrack` | projectiles (`game/juice.js`) |
| `laser`, `zapburst`, `fizzle` | the Spicy's laser shining, bursting, put out (`game/juice.js`) |
| `thunder`, `gust` | the Wolla's storm cloud flashing, its blow (`game/juice.js`) |
| `grab`, `chomp` | caught in a grab, and a Mecked biting down on you while it holds you (`game/grab.js`) |
| `hooves` | a Moose charging: its hooves drumming, a beat a stride (`render/mooseview.js`) |
| `blur` | a blow, a shot or a flask's burst going right through a shimmering Flimmer (`game/juice.js evadedFx`) |
| `whirl`, `twirl` | a Tornado's twister spinning up (over its hands, under its feet), and catching you and spinning you round (`game/juice.js`) |
| `charge`, `lightning`, `rumble` | the Wolk's lightning gathering, striking, and its thunder rolling in later, the later the further away (`sfx`'s `delay`, `game/juice.js`) |
| `draw`, `twang`, `crossbow`, `reload`, `spell`, `thunk`, `burst` | the player's bow, crossbow and staff: drawing, loosing, a crossbow's shot and reload, a spell leaving, a shot striking a wall, a spell bursting (`game/juice.js`) |
| `coin`, `pickup`, `drop`, `clink`, `toss` | loot: coins, items, a rare+ weapon landing, any other landing, dropping from the bag |
| `unlock`, `levelUp` | a guardian falls, a kill gains a level (`game/enemies.js`) |
| `jump`, `fall`, `thud`, `getUp` | watched in `game/sounds.js`; a fall whistles below 9 units/s down |
| `knock`, `splash`, `burn`, `dissolve` | knocked over, dying in water / lava / acid (`game/ragdoll.js`) |
| `dizzy` | a landing hard enough to sit you down (`game/update.js`) |
| `death` | any death, with a shimmer for coming back at the entry (`game/flow.js`) |
| `gate`, `wellDown`, `ringUp`, `cloud` | portal travel (`game/travel.js`); the town portal keeps `portal` |
| `door` | through a house door (`game/doors.js`): a wooden creak and the latch |
| `castStart`, `fizzle` | reading the scroll, a broken cast or charge (`game/townportal.js`, `game/ambience.js`) |
| `equip`, `bagOpen`, `bagClose`, `use` | equipping, the inventory, quick bar slots |
| `drink`, `buff`, `chest` | drinking a potion and a buff or cure taking hold (`game/quickbar.js`), opening a treasure chest (`game/chests.js`) |
| `lob`, `glass`, `boom`, `hiss`, `poison` | a flask thrown, breaking, a blast, a toxic cloud, a poison tick (`game/juice.js`) |
| `reveal`, `stomp`, `boom` | a boss's intro: his name coming up under him; a boss dropping onto his spot (with his kind's `_alert`, deeper: his roar; `game/bossintro.js`, `game/reveals.js`); each real boss's own intro puts together sounds the game has for what he does (Squarlo's spout `spray` and `tidecall`, Mansk's spotlight `thunk` and, his own, the `drumroll` before his curtain goes up, its `swish`, the `castanet`, `clap` and `tom` of his dance and the `cymbal` of his confetti, Renew's `clockwind`, `rewind` and `rewound`, Monteur's `rumble` and `dig` ...: `game/bossreveals.js`) |
| `<species>_alert/_windup/_death` | an enemy starts chasing you (at most every 0.3 s), winds up an attack, dies |

## Jingles

The game's big moments get a jingle, written as a score like the songs (`music/jingles/`, listen
in `tools/player.html`, under Jingles) and played once by a synth of its own into the sounds' bus
(`src/audio/jingles.js`, `jingle(name)`). So they are sounds, heard with the music off too,
whatever song plays. One plays at a time: one asked for while another plays waits its turn,
unless that is more than 5 s away (then it is left out), and one already playing or waiting is
not played twice (a level gained with a boss's kill comes after his jingle). The music is turned
down under each, smoothly (a smoothstep down over 0.6 s and back up over 1.2 s, `duckMusic` in
`audio/music.js`): to 55% under the big ones, to 80% under the stingers. Where each plays (`memorized` plays nowhere yet: a cube got through, for the story, `docs/story.md`):

| Jingle | When |
|---|---|
| `victory` | a boss falls (a real one or a Temp Boss: a descent guardian), instead of `unlock` (`game/enemies.js`) |
| `death` | any death, instead of `death` (`game/flow.js`) |
| `revived` | helped up by a friend (`game/downed.js`) |
| `levelup` | a level gained, from a kill or a quest (`game/enemies.js`, `game/quests.js`) |
| `quest`, `questtaken`, `questfailed` | a quest's reward paid, a quest taken, failed (`game/quests.js`) |
| `trialsealed`, `trial`, `trialfailed` | a trial room arming, done, failed or its runestones gone dark (`game/trials.js`) |
| `horde` | a horde awakened (`game/enemies.js`) |
| `chest` | a chest opened: the glint after the sound `chest`'s hinge and lid (`game/chests.js`) |
| `legendary` | a Fabled weapon or better landing (`game/loot.js`) |
| `enchant` | the Enchanter enchanting, the Smith re-rolling (`game/inventory.js`) |
| `dawn`, `dusk` | the sun coming up, night falling (`game/daycycle.js`) |
| `portal` | a portal not gone through before: a side portal, a way down or up into a cube not visited yet; not a portal gone through before, nor walking across an open face (`game/travel.js`) |
| `act1`, `act2`, `act3`, `core` | the first time at the first depth of an act, or at the core, in a world (`game/flow.js settleIn`) |

`victory`, the boss's, is built on the title song (The
Glass Bird): a knock and a thin glass ring while time stands still (the end of the title's
cracking), the shatter and wind chimes, then the toy tune on crystal and its echo (A B C E D)
over glass harmonica chords, F and G, landing on an A major chord (the tune's C as C#), slowing,
with a crystal sweep, a singing bowl and the glass bird's wide call. About 4 s.

## Continuous sounds

- **Drones:** `charge` rises in pitch while standing in a well, ring or the town portal pad
  (stepping off early fizzles); `cast` rises over the scroll's 5 s cast.
- **Beds:** water, waterfalls, lava (plus pops), acid by the distance to the nearest fluid
  surface or fall (falls carry further); wind under an open sky by theme and height; cave air
  and random drips below ground (drip rates per theme). Levels glide over about 0.4 s.
- Each bed and drone is built when it is first wanted and taken apart after 3 s at level 0:
  the audio thread works on every running node, heard or not.

## Levels

Ladders sound like what they are made of: a dry knock on wooden rungs (`ladder`), a softer
knock and creaking ropes (`ladder-rope`), a rustle of leaves (`ladder-vine`), a short damped
clank (`ladder-iron`) and a scuff of grit with now and then the chain jingling (`ladder-stone`,
the footholds). Hands sound the walk variants, feet the run ones.

Effects go through a gain of 0.45 and a gentle compressor, footsteps through 0.3, the
continuous sounds through 0.5. Per-surface footstep trims are in `footsteps.js` (`TRIM`), bed
levels in `loops.js` (`setAmbience`).
