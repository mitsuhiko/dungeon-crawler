# Touch controls

On phones and tablets the game plays with the thumbs (`src/game/touch.js`, the numbers in
`src/core/stick.js`). They switch on with the first touch of the screen, or on a device whose
main pointer is coarse. The settings (Input, Touch; shown only where the screen can be touched)
can have them always on, or off where there is a mouse or a trackpad too (a touchscreen laptop: a
phone could not play without them, so there Off is not offered and counts as Auto). `?touch=1`
forces them on (to try them with a mouse), `?touch=0` keeps them off, whatever the settings say.
On, the body has the `touch` class and the layout changes with it (`style.css`).

## Layout

- **Left: the stick.** Wherever the thumb lands in the lower left, a stick appears under it.
  Pushing moves the way it points, turned with the view like WASD. A little push walks (like
  Ctrl), further runs. A quick touch there without pushing is a tap on the game.
- **Right: the action button.** It shows the equipped weapon. Held, it attacks whatever the
  weapon can reach, like holding Shift, preferring enemies the stick points at. A tap swings
  once.
- **With a flask in hand** the action button shows the flask and turns into a stick that aims
  it: drag out from the button, the arc shows where it lands (the further out, the further,
  up to the flask's range), and let go to throw. Dragging back into the middle before letting
  go calls the throw off. A tap without dragging throws at the best enemy in range and in sight,
  or straight ahead.
- **Jump** is the smaller button beside it.
- **Use**: above the action button, only while there is something to do: it is the action key
  (F or right Ctrl, `src/game/action.js`). Its picture shows what it does: the treasure chest
  beside you (open it), a speech bubble (talk to the trading villager beside you), or the best
  item around (collect, with how many pickups in a badge). The order is the action key's:
  chest, then villager, then collecting.
- **Turn**: a button at the middle of each side of the screen turns the view a quarter, the
  left one like Q, the right one like E.
- **The quick bar** moves to the top, with a bag button at its end that opens the inventory and
  a menu button for the Esc menu. With the inventory open, a bag item goes on the bar with
  the Quick bar buttons (1-6) beside it, or a tap on a slot of the bar (which pulses while such
  an item is selected); the same slot again takes it off.
  The potions at work show below it; the minimap gets smaller.
- The stick and buttons hide while the inventory is open.

### Phones

A phone (touch, and not roomy: `game/uiscale.js`) has little room around the cube:

- The closed chat is smaller and at most five lines, and leaves out the narrator's lines while
  the subtitles show them (`body.subtitled`, `game/narrator.js`). The subtitle is smaller, over
  the chat and clear of the use button.
- The labels in the world are smaller (12 px instead of 15, times the UI scale), as the world is
  drawn small (a screen at most 540 px wide or 500 px high).
- Held upright (`ui-w540`): the quick bar's stones are 40 px (36 px under 400 px), so all eight
  fit across; the potions at work and the boss bar go left of the minimap; the chat stays left of
  the jump button; the subtitle goes above the use button.
- Held sideways (at most 500 px high): the turn buttons sit higher, clear of the use button, and
  the quest followed stays left of the right one.
- A hold never sticks: the browser does not always report a finger lifted, so a new touch on
  the stick or the action button replaces the old one, a hold whose pointer capture is gone is
  released each frame, and leaving the page (blur, hidden tab) releases everything.

## On the game

- **Tap**: what a click does, except walking: an enemy is attacked, an item picked up, a chest
  opened, a villager traded with; with a flask in hand it is thrown there. A tap on the floor
  does nothing.
- **Long press** (about half a second, held still): collects coins and items around, like the action key (F or right Ctrl).
  A ring fills under the finger.
- **Two fingers**: pinch to zoom (one step each time they are a quarter further apart or
  closer).
- The page itself never zooms (`src/game/nozoom.js`), only the game's view:
  - no double-tap zoom: `touch-action: manipulation` on every element (the game and the touch
    controls take all touches, `none`);
  - no pinch zoom: the viewport is not scalable (`user-scalable=no`, enough for Android); iOS
    ignores that, so Safari's own `gesturestart` / `gesturechange` events are called off, and
    any `touchmove` with two or more fingers too (one finger still scrolls a list). The game's
    pinch reads pointer events and goes on;
  - no zoom into a field getting focus (iOS does that for text under 16 px): fields have 16 px
    text on touch screens (and `maximum-scale=1`);
  - no browser zoom from a trackpad pinch (a wheel with Ctrl: over the game it still zooms the
    game's view) or Ctrl/Cmd with + - 0;
  - no zoom from a canvas bigger than the page: the game's canvas fills the window by CSS and its
    size comes from the layout viewport, not `innerWidth` / `innerHeight` (in Safari the visual
    viewport, wrong while the keyboard is up or an iPad turns);
  - should Safari zoom anyway, the zoom is undone: when `visualViewport.scale` is off 1 (and after
    a turn or a field losing focus) the viewport tag is written anew, which sends Safari back to
    its first scale. Without that a stray zoom stayed, as the pinch back out is called off.

The menu button at the end of the quick bar opens the Esc menu (`src/game/escmenu.js`): playing
together and the settings (music, volumes, keys). Respawning has no touch control yet.
