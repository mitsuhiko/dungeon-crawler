# The camera: overview and close view

The game has two views. The **overview** (the default) looks down at 44° from far away with a
narrow lens (28°), so the whole cube shows like a model on a table; zoomed in it follows the
hero. In the town (many cubes walked across without a seam, [town.md](town.md)) it follows the hero
all the way, at any zoom, eased in and out as they come and go: framing the cube played in, it
would jump a cube's width as the next one takes over (`game/camera.js` `townFollow`). Out of the
town, walking across an open face into the cube beyond ([world.md](world.md#opened-side-connections),
`game/handover.js`) the overview pans over to the new cube in 0.7 s instead (`panCamera`). The **close view** sits behind the hero with a wide lens (60°; 50° to 90° in the settings), the mouse looking around
(captured, as in other third-person games). It is meant for finding the way through tunnels,
caves and the deep, where the overview's cutaway gets busy, and it works everywhere: cubes,
tunnels, house interiors, while travelling.

## The camera key (`game/camerakey.js`, `core/view.js`)

The `camera` action (core/keybinds.js, the View group) is on **Tab** and **C** by default;
both can be rebound in the settings. Browsers deliver Tab to the page, and the game keeps it from
moving the focus; menus, the inventory and the chat keep their own Tab. C is there in case
Tab is taken anyway.

- **Tap** (let go within `TAP_MS`, 250 ms, without turning the view): switches between the
  overview and the close view. The choice sticks: it is a setting (`crawler.settings`
  `camera`, also in the settings menu under Graphics) and nothing switches it back on its own.
- **Hold and move the mouse:** turns the overview while the key is down. Turning starts once
  the mouse moved `ORBIT_PX` (4 px), without waiting for the hold. Right turns the view to the
  right. The cursor hides and what it pointed at stays (game/pointer.js), so hovering and
  clicking do not drift. Letting go after turning never switches the view. (In the close view
  the captured mouse turns it anyway, see below, and a hold and a move only keep the tap from
  switching; while it is not captured the hold turns the close view, also up and down.)
- **The overview settles on a side:** it keeps looking diagonally from one of four sides (the
  ones Q / E turn between); after the mouse turned it, letting go eases it to the nearest one
  (`snapYaw`). Switching from the close view to the overview does the same.
- Key repeats are ignored; losing the window (blur) ends the turning without switching; the
  mouse does not turn the view with the inventory, the menu or "Leave the fight?" open.
- No pointer lock for the hold: the browser would show its banner on every hold, and Chrome
  refuses to lock again for a moment after Esc.

Q / E still turn by a quarter in both views; the zoom keys and the wheel keep their six
presets, which in the close view set the arm's length (`closeDistance`: about 1.2 to 4.7 units).
The settings can turn the wheel round and pick the preset a game starts at (the fourth at first).
Where motion is reduced (the settings; at first as the system says) hits do not kick the camera
and the ground does not shake it. Otherwise "Camera shake" (Graphics, Comfort: Off, Low, Full)
says how much they do, a film's shake too (`shakeAmount`, applied where the camera is placed, so
whatever shakes it obeys).
WASD always moves relative to the camera, so in the close view W runs away from it.

## Mouse look (`game/mouselook.js`)

The close view plays like other third-person games: the mouse is captured (pointer lock) and
turns the view, there is no cursor and no walking by mouse.

- **Turning:** right turns right, down looks down (`look`, `LOOK_PER_PX` 0.0035 rad a pixel),
  at once, no easing. Up and down go from `PITCH_MIN` (-0.45, looking up) to `PITCH_MAX` (1.1,
  steeply down); looking up, the arm meets the floor and comes in. The settings (Input, Mouse) have
  the look speed (20% to 300%) and invert up / down. One movement over `LOOK_SPIKE` (300 px)
  is a browser glitch and is dropped, so is the first one after capturing.
- **The crosshair** is the middle of the screen: the arm's pivot, a little over the hero's
  head. It is the cursor now (game/pointer.js): the enemy on it is hovered (tinted, its health
  shown), so are items, chests, villagers and a trial's parts (their labels show; they are not
  clicked: `body.look`).
- **Facing:** the hero turns to where it runs, as before; an attack turns it to its target
  (the animator snaps into the swing), so it faces that way until the swing is over.
- **Left click** (game/input.js `lookAttack`), held: again and again (game/update.js).
  - What is hovered and in reach (a villager, an item, a closed chest, a trial's part): used,
    as the action key would. Out of reach nothing walks there.
  - A blade: the hovered enemy if the swing's step-in reaches it, else the best enemy in reach
    within a radian either side of where the view looks (`softTarget`), else a swing that way
    (towards the hovered enemy, or straight on). Unlike Shift it swings into the air.
  - A bow, crossbow or staff: the hovered enemy (the shot aims at its body), else the best one
    in sight within 0.35 rad of the view, else straight on, level.
  - A flask in hand: thrown where the crosshair is (the arc shows it), else straight on; once
    a click.
- **Right click:** lock-on (below).
- **Capturing:** whenever the close view is played and nothing needs the cursor: the Esc menu
  and the settings, the inventory and trading, the chat, "Leave the fight?", the teleport
  scroll's menu give it back while they are open; the overview and the main menu do too.
  Browsers only capture right after a click or a key (`navigator.userActivation`; Esc does not
  count), so switching to the close view with Tab, closing the inventory with I or the menu
  with Resume captures again at once. Closed with Esc, or a page loaded straight into the close
  view, a hint over the crosshair says "Click to look around"; that click only captures.
- **Esc** while captured is the browser's: it gives the mouse back, and the page may never see
  the key. So losing the capture on its own (Esc, another window) opens the Esc menu, and an
  Esc arriving just after (`ESC_MS`) does not close it again. Chrome refuses to capture again
  for about a second after that: a refused capture is tried again after `RETRY_MS`, or with the
  next click.
- Touch has no mouse look (the touch controls work as before in the close view).

## Lock-on (`game/lockon.js`, `core/lockon.js`)

- **Right click** locks on to the enemy under the crosshair, else the one nearest the middle of
  the view (within `LOCK_CONE`, 1 rad either side; how far away counts a little), within
  `LOCK_RANGE` (14 units) and in sight. The camera swings round (`LOCK_TURN`) to look past the
  hero at it, a ring marks it, and it is the hovered enemy: clicks, Shift and flasks go for it,
  its health shows. WASD runs relative to the camera, so A / D circle round it.
- **A flick** of the mouse sideways (`FLICK_PX`, 90 px, quickly) moves the lock to the next
  enemy on that side (within a quarter turn); slower movement does nothing sideways. Up and
  down still tilt the view.
- **Let go:** right click again; the enemy dead or gone; farther than `LOCK_DROP` (20 units);
  out of sight for `LOCK_BLIND` (1.5 s); the overview; travelling.
- **Nothing to lock on to:** the camera turns round behind the hero (where it faces).

## The close view (`game/camera.js`)

- **The arm:** from a pivot at the hero's shoulders (`ANCHOR`, under a low ceiling a little
  below it), `pitch` over the level, looking at a point `AHEAD` past the pivot. Points along
  the arm are probed: terrain, structures and blockers (`physics/collide.js insideSolid`), and
  what hides the hero from the overview too (tree crowns, roofs: `core/blockers.js
  viewBlockedAt`). Out of the cube there is nothing else, but in a house everything beyond the
  room counts (its walls are only drawn). The arm stops `CLEAR` short of the first hit, comes
  in at once and goes out again gently.
- **Fluids** have no underside: the camera stays over their surface.
- **Travelling** the player and the cubes slide together and the map is already the new
  cube's: the arm keeps its length until the travel is over.
- **The hero fades** when the arm gets very short (from 1 down to 0.55 units), and stops
  writing depth then; what it wears and holds stays.
- **No cutaway:** the camera stays out of the solids, so `game/cut.js` cuts nothing and the
  walls of caves, canyons and houses stay up (`setCut(..., walls = false)`), and the
  neighbours' reveal is off (`cullNeighbors`).
- **The player's bar** (render/playerbar.js) would cover the middle of the screen over the
  hero: it sits at the bottom, over the quick bar, a step in front of the camera.
- **Blending:** switching moves the camera, its direction and its lens from one view to the
  other in `BLEND_TIME` (0.4 s). Past halfway it counts as the close view (`closeView()`): the
  cut, the walls, the bar and the neighbours switch there. The main menu always shows the
  overview.

## A boss's intro: the free camera (`setCine`)

A boss's intro ([bosses.md](bosses.md#the-intro), `game/bossintro.js`) takes the camera over for
a few seconds, in either view: it hands `setCine` where the camera is to be, what it looks at, its
lens and roll and how far it has taken over (`w`). Coming in, the point looked at goes from the
game's to the intro's while the camera swings round it, from the game camera's direction and
distance to the intro's (so it never passes through what it looks at), or (where something big
stands between, Foggery's tower) it cuts in; going back it cuts, behind black bars shut for a
moment, as does a cut in. Wherever it is, it never goes into anything: kept off the boss's
body, inside the cube (off the walls of a cave or a canyon, `WALLED`), up out of what it would
pass through, in front of what stands between it and what it looks at (`reach`, like the close
view's arm) and over fluids. Past halfway it counts as there (`cineView()`): no cutaway, the
walls up, the neighbours' reveal off, the hero not faded. The fog, the moving lights and the fires
go by what it looks at (`cameraFocus()`), not the hero.

## The world's roll (`game/roll.js`, `core/roll.js`)

The view can turn about where it looks (`view.roll`), in both views: the world turns on the screen
while gravity stays with its floor, so the hero seems to run up a wall (a quarter round) or along
the ceiling (half round). It is Monteur's spin ([bosses.md](bosses.md#monteur)): a Monteur alive in
the cube turns it to his `quarter` (`followRoll`, every game after the one it is shown: it comes
with his row), and back the right way up once he is beaten or gone. The developer commands `/roll`
and `/rollkeys` ([console.md](console.md)) turn it without him, and hold it while they do (`/roll
off` gives it back). Only the view turns: in another cube, and out of play (the main menu), it is
unturned at once.

- **Turning** (`ROLL`, `stepRoll`): slowly, speeding up and slowing down (20°/s²) to at most
  25°/s, and it rests at a quarter (0, 90, 180 or 270 degrees) exactly: a quarter takes about
  5 s, half round about 8.5 s. `/roll 90` turns to a quarter the shorter way and stays;
  `/roll spin` goes on by itself, a quarter either way or half round (`nextStop`), resting 6–10 s
  at each.
- **The camera** (`game/camera.js`): turned last, about its own axis (before the shaking), so the
  overview's cutaway, the close view's arm and everything else see the camera where it was.
- **The keys** (and the touch move stick: `KEY_MODES`, `game/roll.js keyRoll`,
  `game/input.js inputDir`): `latch` (the default), a direction is taken on the screen as it is
  when it is given. Held unchanged, it keeps its way in the world while the view turns under it
  (the hero does not swerve), and once the view rests it catches up with the screen without waiting
  (most of the way in a quarter second). A new direction is taken on the screen anew: a key pressed or
  let go (W, then W and D), the stick let go or swung more than 60° from where it was taken. So
  nothing is ever upside down once the view has stopped, and every key pressed goes where it
  looks. Only the roll is latched: a turn the player makes (the camera keys, the mouse look, the
  lock-on following its enemy) steers the keys at once, as without a roll. The others, to compare
  (`/rollkeys`): `world`, they stay with the world as it was unturned (rolled half round, up on
  the keys runs down the screen); `screen`, up is always up the screen (while it turns a key held
  curves the hero's way along); `catchup`, they stay with the world while it turns and catch up
  with the screen once it has rested 1 s (a half turn was about 11 s off the screen).
- **The flask's aim stick** (touch) follows the screen: you aim at the mark you see.
- **The mouse** follows the screen whatever the keys do: clicks hit what is under the cursor
  anyway (the pick goes through the turned camera), and the close view's mouse look, the camera
  key's turning and the lock-on's flick turn the way the mouse went on the screen
  (`unturnMouse`).
- **The sky** (`render/sky.js`), drawn on the screen, rolls with it: the stars cover all the screen
  may turn to (a circle through its corners), the haze is mirrored past its edges.
- **The minimap** turns with it.

## The world's tilt (`game/tilt.js`)

Where Sollmeldon lands the cube tips a little (6°) down towards him ([bosses.md](bosses.md#the-worlds-tilt)):
his `tilt` (the way it tips down and how far, 0 to 1) comes with his row, and every game tips its own
view after it (`followTilt`, eased a little more: `updateTilt`). Only the view tips (`view.tilt`):
the camera goes round the middle of the cube, at the hero's height, the other way (`game/camera.js`,
before the roll and the shaking), so the world is drawn tipped where it is: gravity stays with the
floor, the hero keeps their footing, the keys and the mouse go as they did (a few degrees: nothing to
latch). His mud runs to the low side (`game/mud.js`). Level again once he is beaten or gone; level at
once in another cube and out of play. `/tilt` ([console.md](console.md)) tips it without him and
holds it until `/tilt off`.

## Not yet

- The world's tilt tips the sky along with the cube (it is drawn on the screen, like the roll's).
- The world's roll: reduced motion does nothing to it yet; labels and damage numbers stay
  upright on the screen.
- The backdrop (sky, stars) is fixed to the screen; turning the close view leaves it in place.
- Sounds pan by where they are on the screen; one behind the camera pans to the wrong side.
- Enemies' silhouettes through walls show as in the overview, larger up close.
- Touch has no camera key yet (its turn buttons and pinch work in both views).
- The lock-on leaves the pitch to the mouse: an enemy far above or below can end up near the
  edge of the screen.
- The crosshair is over the hero's head, not over a shoulder: a bow aims level, the hovered
  enemy is what aims it up or down.

## Checks

- `tests/view.test.js`: the sides the overview settles on, the arm's lengths, the pitch limits,
  mouse look's turning (speed, invert, limits), the tap / hold decision and the default keys.
- `tests/lockon.test.js`: which enemy the lock goes to, where a flick moves it, the locked
  camera's yaw.
- `tests/roll.test.js`: the world's roll turning slowly to rest at a quarter, spinning on, what
  the keys follow in each mode (a direction latched through a half turn and caught up once it rests),
  a direction on the rolled screen back on the unrolled one.
- `tests/browser/camera.js` (`runCameraChecks()`): the keys, turning, settling, losing the
  window, the close view's cut and walls and lens, the arm out of the solids all around the
  hero in a cave, the player's bar; mouse look (capturing on a click, turning, speed and
  invert, the crosshair as the cursor, what gives the mouse back, Esc opening the menu once, a
  click attacking instead of walking) and the lock-on, with a stand-in for pointer lock
  (headless Chrome has none). The other browser checks run in the overview
  (`paused()` in tests/browser/combat.js sets it and puts the setting back).
- `tests/browser/roll.js` (`runRollChecks()`): the world's roll: the camera's right side up a
  quarter round, which way W, A and D run the hero on the screen with the keys following the
  world or the screen (a quarter and half round), the close view's mouse look following the
  screen, the slow turn to rest at a quarter with W held latched through it (D pressed meanwhile
  taken on the screen as it is) and caught up once it rests, `/roll` and `/rollkeys`.
