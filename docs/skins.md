# Skin painter

Main menu → **Choose Skin** (choose/create a hero first). It opens the last-20-skins menu
first, with a character preview on each card. Choose a saved skin to load it, or use the large
**Paint Skin** button at the bottom to enter the painter. All labels are English.

- **Pen** draws a continuous line directly into a 2048×2048 texture. Brush size is the
  diameter in CSS pixels, independent of the polygon density. Scroll to zoom for details.
- **Color** chooses the paint color.
- **Fill** requires a completely closed outline. Click inside to fill its connected region.
  A gap produces “Close the outline completely before filling it” without changing any pixels.
  Atlas seams are connections, not artificial boundaries or escape routes into empty space.
- **Eraser** removes paint alpha, revealing the original opaque clay.
- **Right mouse drag** rotates immediately, regardless of the selected paint tool, without
  painting or filling. The browser context menu is suppressed over the canvas.
  **Rotate** also supports left-drag/touch rotation, including above/below and behind the hero.
- **Skin name** is required before **Save Skin**. Names are up to 32 characters, with
  surrounding/repeated spaces normalized. Reusing a name asks before replacing its library copy.
- **Load Skin** restores a saved skin by its name (case-insensitive). It replaces the editor
  preview, not the hero immediately; choose **Save Skin** to apply it. Unsaved paint is replaced
  only after confirmation. Named skins are shared across your heroes in this browser, not online.
- **Recent Skins** opens a menu of the last 20 saved named skins, newest first. Click a name
  to load it, or choose **Paint Skin**. Resaving a name moves it to the top without
  duplicates. Older skins remain available through **Load Skin**; the menu limit does not delete them.
- **Save Skin** writes the named PNG and applies it to this hero; **Cancel** / Escape discards the draft.

## UV asset

`blender/character_uv.py` runs after decimation in `blender/character.py`. It separates the
body into anatomical, dominant-axis UV charts, projects without collapsing side faces,
equalises texel density and packs without overlap or mirrored body parts. Relaxed front/back
shells were tested but produced small overlaps on thin limb ends; the bounded-distortion
charts avoid those. The final atlas occupies about 50% of 2048², with 16-pixel island margins.
The source mesh, weights, rig and animations are unchanged. `SkinUV` and `skin_uv_version`
survive GLB export and meshopt compression.

To update just the UVs on the saved source, without rebaking animations:

```sh
Blender -b blender/character.blend --python blender/character_uv.py
node tools/compress-assets.mjs assets/character.glb
node --test tests/skinuv.test.js tests/assets.test.js
```

UV layout is a saved-data format: preserve the existing layout for existing paintings.
If the layout changes deliberately, increment both `UV_VERSION` in the Blender script
and `SKIN_UV` in `src/core/skin.js` rather than applying old PNGs to unrelated UVs.

## Painting and performance

`render/skinpaint.js` keeps a transparent, premultiplied-linear RGBA paint layer on the GPU.
A static copy of the standing pose is made once. The brush rasterises that copy in **UV
space**, projects each texel into the current editor camera, and tests against the visible
body's depth buffer. Consequently one screen-space segment paints across different UV
islands, but not through the torso onto its back. Three-pixel boundary skirts pad texture
filtering gutters. A stroke does not recolor vertices or perform thousands of CPU raycasts.

The editor renders on demand. The main-menu dungeon renderer/simulation is paused while
the modal is open. Depth is refreshed only when the camera or viewport changes. Pixel
readback is needed only for Fill and Save, not for normal drawing.

Fill builds a raster mask and links matching seam-edge texels; connected-component labels
exclude unrelated atlas fragments. It traverses the clicked color region without modifying
it, then checks for another same-color region on the same physical surface. If the outline
has a gap, both sides are still connected: reject the operation. If separated, fill the
clicked region and pad its gutters. This also works when the outline crosses UV seams.

`render/skin.js` composites paint over the original material without making the hero
transparent. The game uses the same UVs on its animated rig, including the menu portrait.
Skin textures currently stay local and are **not transmitted in multiplayer**.

## Character previews

`render/skinpreview.js` renders the real standing character with its saved paint into a
144×180 PNG, not an image of the flat UV atlas. One reusable figure, render target and the
editor's existing WebGL context serve all cards. New saves include a cached preview; older
named skins generate/cache theirs sequentially when the chooser opens. Revision checks keep
an old preview from overwriting a newer save. Preview generation stops when leaving the
chooser, and temporary image URLs/GPU resources are released when it closes.

## Persistence

`game/skinfiles.js` stores immutable hero PNG blobs in IndexedDB (`crawler.skins`, `textures`).
Database version 2 adds a `names` store keyed by normalized, case-insensitive skin name. The
named library keeps independent PNG copies: replacing or deleting a hero's texture never
removes the named skin. Database version 3 adds a `savedAt` index and reads at most 20 entries
through a newest-first cursor. Write transactions assign monotonic timestamps so rapid saves
have a stable order. Old named entries without dates are kept at the end of the list.
Existing version-1 hero textures survive the database upgrade.

Hero JSON in localStorage contains only `{v: 2, uv: 'character-v1', id: 'skin-…', name: 'Blue Knight'}`.
Save first writes the new hero PNG and named copy, then updates the hero reference. On failure,
the editor stays open, the orphan hero PNG is deleted, and the previous named copy is restored.
Revision checks prevent rollback from undoing a newer save made by another tab. Cancel never
updates either saved hero or live game material. Successful replacement deletes the hero's
previously referenced PNG, but not its named library entry. PNG encoding unpremultiplies
alpha, converts linear RGB to sRGB and flips WebGL rows; loading reverses this via a canvas.

## Checks

```sh
node --test tests/skin.test.js tests/skinuv.test.js tests/save.test.js tests/assets.test.js
```

From the main-menu browser console:

```js
(await import('/tests/browser/skin.js')).runSkinChecks()
(await import('/tests/browser/skin.js')).runRecentSkinChecks()
```

Checks cover exported UV coverage/non-overlap, sub-polygon texture detail, paint-through
rejection, seam-crossing strokes, erasing, PNG/IndexedDB round trips, closed-outline fills
and rejecting outlines with gaps. Named-library checks cover case-insensitive loading,
replacement rollback and independence from deleted/replaced hero textures.
