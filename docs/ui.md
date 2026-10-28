# The look of the menus: glass

The menus borrow the look of the glass bird on the splash screen (`src/game/splash.js`,
`blender/glassbird.py`): faceted teal glass in the dark, lit from above, with an amber core
glowing inside. The world is low-poly and flat-shaded too, so the menus now match it. The main
menu, the settings, the Esc menu, the "Leave the fight?" and "You died" questions, the teleport
scroll's list, the skin painter, the inventory (with its quests) and the HUD have it: the quick
bar, the chat (open), the minimap, the potions at work, the quest followed and the boss bar (`style.css`, the
block "the glass" near the top).

## The rules

- **Cool glass outside, warm amber inside.** Frames, edges and headings are dark teal glass.
  Amber (the bird's core, `--ember`) only marks what is alive: the main action (`.menu-big`),
  what is chosen (a choice, a toggle that is on, the page tab, the chosen hero or world), the
  focus, a key place waiting for its key. If everything glowed, nothing would stand out.
- **Cut corners, not round ones.** Every surface has its corners cut, like a cut stone. Panels
  have uneven cuts (big at the top left and bottom right), buttons small even ones.
- **The light comes from the top left.** Edges are brighter on top than below. Panels carry a
  faint low-poly surface whose facets are lit from there and fade out towards the bottom right,
  and a still spark of light sits where the light meets the top left cut.
- **What is chosen glows from inside**: an amber light rising from its lower edge, not a ring
  drawn around it.
- **A glint only where the mouse is.** A band of light crosses a button as it is hovered. Never
  across a panel, the logo or anything that is not under the pointer: it would distract.
  Reduce motion (`body.calm`) turns the glint off.
- **Amber is also money**: the coins, the prices, what is equipped. The rarity colours of the
  items stay as they are; a selected item shows amber edges and light coming in from them, so its
  middle keeps its rarity's colour (even a Fabled one's, which is amber too).
- **The dark stage.** The main menu darkens towards its left edge, the other menus with a
  vignette, in the near-black the bird waits in (`--void`), not in blue; dying, in a red dark.
- **A panel keeps its size.** Switching its tabs or pages never makes it larger or smaller: the
  settings' pages and the inventory's bag and quests lie in one place, the ones not shown only
  unseen, so the panel is as large as the largest. Nothing in a header changes its width with the
  tab either (the inventory's close button names only Esc).

## How it is built

Each panel has the class `glass`. A surface (the panel, every button and text field on it but a
`.plain` one, a well sunk into it such as the inventory's details, the dropdown's list) is drawn
with a few registered custom properties, so a state only changes values and the changes ease:

| Property | What it is |
| --- | --- |
| `--c1` … `--c4` | the cuts: top left, top right, bottom right, bottom left (`clip-path`) |
| `--face` | the glass's fill |
| `--edge-hi`, `--edge-lo` | the edge on top and below (a `border-image` gradient for the straight edges, a line in each cut corner); `--edge-w` thick (the inventory's slots: 2px) |
| `--glow`, `--glow-at` | the amber light inside, and where it comes from |
| `--under` | what lies between the glow and the face: an item's rarity in its slot, the hero's backdrop |
| `--glint`, `--glint-color` | the hovered band of light: from `100%` (off the left) to `0%` (off the right) |

The shared rules use `:where()`, so they weigh nothing: each kind of surface and each state
overrides them by setting those values. `clip-path` also cuts off outlines and outer shadows, so
the focus shows as pale amber edges and an inner line; a well's lower edge is its lit one (it lies
below the panel's surface). A `.plain` button (the close buttons that are only a word) is not glass
at all.

The chat is a `.glass-back` panel: it is not cut itself, its glass lies on a `::before` behind
what is in it, so the list of what a command can go on with may reach out above it.
`game/console.js` gives it `.glass` only while it is open; closed, only its lines show over the
game.

The minimap is drawn on a canvas (`game/minimap.js`), so it repeats the look there: an upright
octagon (a cut stone) of the same glass, lit from the top left, with the spark at its upper left
corner, the N on a little cut stone, and a plate under it for its lines.

The sliders in the settings are a thin line of glass, amber as far as they are filled
(`--fill`, set by `src/game/settingsmenu.js`), with a cut gem to hold.

The panels' facets are `assets/ui/facets.svg`, made by `node tools/facets.mjs`: a jittered grid
of points with random heights, each cell cut into two triangles, every triangle shaded by its
slope against the key light. The seed is fixed, so running it again makes the same picture;
change the numbers at the top of the tool to change the surface.

## The boss bar

A boss shows his health on the screen, not over his head: a strip of glass along the top
(`#boss-bar`, `src/game/bossbar.js`; whose and how in `src/core/bossbar.js`), his title in amber
over an amber fill: `♛ Gusto · Lv 1`, `♛ Temp Boss Spider · Lv 3`.

- **Whose:** every descent guardian, a real boss and a Temp Boss alike (`bossBarred`: `guardian`
  with `guardianRole` `'descent'`, [guardians.md](guardians.md)), wherever it stands, a dev spawn
  and the boss test room too. There is one bar: of several (dev spawns) the nearest. Nothing shows
  over his head, nor over the bodies that pass for him (Gusto's proxies, which never drive the
  bar: only the real one does, vanished too). Everything else that can be hit keeps its small bar
  over its head (`render/enemies.js`, `render/flimmerview.js`, `render/squirtleview.js`): side
  guardians, defenders, minions.
- **When:** from the moment you come into his cube until he is beaten, whether he has noticed you
  or not. Beaten, the fill drops to nothing and the bar fades about a second later. It is not there
  while the curtain is down or between cubes, and the menus hide it (`body.in-menu`).
- **No phases.** One fill, his health of his profile's. It follows his health as it is, so Renew's
  bar runs back while his time runs back (his health comes off the fight's tape) and is full again
  for his next phase.
- **The damage strip:** behind the fill a pale strip stands where his health was a moment ago.
  A hit drops the fill at once; the strip stands `TRAIL.hold` (0.4 s; each new hit meanwhile
  starts that again, so a combo makes one chunk, but at most `TRAIL.most`, 1.2 s, so a burn ticking
  on does not hold it up), then eases down to the fill (`TRAIL.rate`). Health coming back takes it
  up at once. With reduce motion it goes along with the fill.
- On touch the quick bar is along the top: the boss bar goes under it.

Its checks: `node --test tests/bossbar.test.js`, and in the game (`?dev=1`)
`await (await import('./tests/browser/bossbar.js')).runBossBarChecks()`.
