# Glass phoenix asset

An original faceted glass bird with broad articulated wings, three crest feathers, long tail
streamers, an amber core and landing feet. It is not a downloaded stock illustration.
This asset-only change does not alter the splash bird, equipment, story or travel rules.

- Editable scene: `blender/glassphoenix.blend` (flight selected; Space plays it).
- Authoring source: `blender/glassphoenix.py`.
- Runtime asset: `assets/glassphoenix.glb`, one skeleton and four materials.
- Clips: `PhoenixTakeoff`, `PhoenixFly`, `PhoenixLand` (approximately 2.2, 1.2 and 1.4 s).

```sh
Blender -b --python blender/glassphoenix.py
node tools/compress-assets.mjs assets/glassphoenix.glb
node --test tests/glassphoenix.test.js
```

The authoring script saves an ignored preview under `blender/previews/`.
On Windows, asset compression needs the separately submitted npx/path fix.

Die Blender-Datei zeigt den Glasphönix mit Flügeln, Schweif und Landefüßen.
Mit der Leertaste läuft die Fluganimation. Diese Änderung fügt nur das Modell hinzu;
die spielbare Reise folgt getrennt.
