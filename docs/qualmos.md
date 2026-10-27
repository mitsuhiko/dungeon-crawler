# Qualmos — core boss prototype

## Playtest / Testen

Run `npm run serve`, then open:

`http://localhost:8000/?dev=1&seed=123&at=qualmos&lang=de&splash=0`

This starts a disposable seeded developer world, prepares a level-22 hero with an
item-level-22 Unusual Long Sword, and enters the actual final arena at `0,-20,0`.
It does not load a saved hero. Other seeds also work. Console: `/boss amphibian`
restarts the encounter; `/spawn amphibian` spawns another. `/god on` enables invulnerability.

`npm run serve` starten und den Link oben öffnen. Du beginnst auf Tiefe 20 mit
Level 22 und einem passenden Langschwert. Gespeicherte Helden werden nicht geladen.
In der Entwicklerkonsole: `/boss amphibian` für einen neuen Versuch, `/god on` für Unverwundbarkeit.

## Design / Entwurf

Blue-green slender amphibian based on the child's drawing: six tentacles with pale green
suckers, two arms, hard head and back spines, wide toothy grin. Named **Qualmos**.
The authored model and action showcase are in `blender/qualmos.blend`.
`blender/qualmos.py` joins/decimates the authored parts and exports the skinned GLB,
including a death clip. Run meshopt compression after exporting.

Blau-grünes, schlankes Amphibienwesen nach der Kinderzeichnung: sechs Tentakel mit
hellgrünen Saugnäpfen, zwei Arme, harte Stacheln und ein breites Grinsen mit Zähnen.
Das Blender-Modell mit Animationsvorschau liegt in `blender/qualmos.blend`.

Native health: **6760 at level 22**, exactly twice Slomo's **3380 at level 15**.
The base HP compensates for the ordinary level growth; the final value is not scaled twice.
Five phases are gated at 80%, 60%, 40% and 20%; a hit cannot skip a phase. A short
invulnerable rage animation marks each transition.

**6760 Lebenspunkte auf Level 22**, doppelt so viele wie Slomo normalerweise hat.
Fünf Phasen mit Grenzen bei 80, 60, 40 und 20 Prozent; Übergänge können nicht übersprungen werden.

| Phase | New attacks / Neue Angriffe |
|---|---|
| 1 | Tentacle whip, reaching strike, double slam / Peitsche, Greifschlag, Doppelschlag |
| 2 | Water jet, diving lunge, slowing ink projectile / Wasserstrahl, Tauchsprung, verlangsamendes Tintenprojektil |
| 3 | Circular sweep, undertow pull / Rundumschlag, Sog |
| 4 | Three-projectile spread / Stachelsalve |
| 5 | Wide water blast, inflated belly flop / Flutstoß, aufgeblähter Bauchplatscher |

Earlier attacks remain available. Belly flop leaves him exposed for 1.05 seconds
with 1.5x incoming damage, followed by a recovery pause.
Frühere Angriffe bleiben verfügbar. Nach dem Bauchplatscher ist er 1,05 Sekunden
verwundbar und nimmt anderthalbfachen Schaden, danach folgt eine Erholungspause.

## Prototype limitations / Noch offen

This is a playable integration prototype, not the final story encounter or polished balance.
It reuses the ordinary dry arena, generic melee hits, the existing jet/pull effects,
and slime/ice projectile visuals. There is not yet a swimming arena, held-player grab,
real thrown spine geometry, local ink cloud, bespoke sound, final dialogue, or multiplayer
validation. The dive pose needs further artistic polish. No new recorded narration is added.

Spielbarer Prototyp, noch kein fertig abgestimmter Endkampf: bisher trockene Arena und
wiederverwendete Treffer-/Projektil-/Wassereffekte. Wasserarena, echtes Festhalten,
eigene Stachelprojektile, Tintenwolke, Sounds und Story-Ende fehlen noch.
Die Tauchbewegung braucht noch Feinschliff; Mehrspieler ist noch nicht geprüft.

## Checks / Prüfungen

- `node --test tests/amphibian.test.js tests/kinds.test.js`: HP, phase gates, three seeded core
  arenas, compressed model/animations and existing material contracts.
- Chromium developer-entry smoke test: real core, level-22 hero, model loaded;
  all eleven attacks and all four phase transitions exercised without JavaScript errors.
- Full Windows test run is not clean: guide/music path-sensitive checks need separate review.

Gezielte Tests prüfen Lebenspunkte, Phasen, drei Welten und den Modellexport.
Im Chromium-Test wurden Einstieg, elf Angriffe und vier Phasenwechsel ohne JavaScript-Fehler geprüft.
Der vollständige Windows-Testlauf ist noch nicht fehlerfrei; Guide-/Musikpfade müssen separat geprüft werden.
