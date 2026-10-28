# The opening's glassmaker

`render/glassmaker.js` adds the craftsman's own outfit to the existing town character rig,
following `assets/film/glassmaker.png`: round brass goggles and clear lenses, a strap behind
the head, a tied leather apron, and a short blowpipe with a bubble of hot glass.
It does not borrow a villager's hat, crystal ball or pliers.

```js
const figure = createFigure();
dressGlassmaker(figure);
// Each frame, after restoring / animating the figure's ordinary pose:
poseGlassmaker(figure, time);
```

The goggles follow the head bone, clothes and pipe the spine. A two-bone arm solve keeps
both hands on forward grip points instead of rotating them behind the torso. This standalone
renderer does not place NPCs, add dialogue or change rescue progression; that integration is separate.

In the game browser console:

```js
await (await import('/tests/browser/glassmaker-model.js')).runGlassmakerModelChecks()
```

Eigene Ausstattung nach der Anfangsgeschichte: runde Brille mit durchsichtigen Gläsern,
Kopfband hinten, gebundene Lederschürze und kurzes Blasrohr. Die Hände halten das Rohr
vor dem Körper. Diese Änderung fügt nur das wiederverwendbare Modell hinzu.
