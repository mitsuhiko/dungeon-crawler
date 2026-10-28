# Qualmos — rescue-route prototype

This integration draft depends on the separately submitted glass phoenix asset (PR #13)
and glassmaker renderer (PR #14). Merge those first. Developer conveniences (PR #11),
native Qualmos belly-flop tuning (PR #10), and Windows compression support (PR #12)
are separate changes, not included here.

Dieser Integrationsentwurf benötigt zuerst das Phönixmodell (#13) und die
Glasmacher-Ausstattung (#14). Die anderen Verbesserungen haben eigene PRs.

Upstream's native Qualmos (`src/core/qualmos.js`, `src/game/qualmos.js`,
`assets/qualmos.glb`, `blender/qualmos.py`) is kept intact after the rebase.
The rescue route uses the separate `amphibian` prototype (`assets/amphibian.glb`,
`blender/amphibian.py`, `blender/amphibian.blend`) so the two animation contracts do not collide.

Upstreams Qualmos bleibt unverändert erhalten. Die Rettungsreise verwendet den getrennten
`amphibian`-Prototyp, damit sich Modelle und Animationen nicht gegenseitig überschreiben.

## Playtest / Testen

Run `npm run serve`, then open:

`http://localhost:8000/?dev=1&seed=123&at=qualmos&lang=de&splash=0`

This starts a disposable seeded developer world, prepares a level-22 hero with the
ordinary developer loadout, and enters the glass-bird antechamber at `0,-20,0`.
The optional OMG staff and automatic invulnerability are submitted separately in PR #11.
It does not load a saved hero. Other seeds also work. Console: `/boss qualmos`
returns to the antechamber; `/spawn amphibian` spawns a boss in the current room.
`/god on` enables invulnerability.

`npm run serve` starten und den Link oben öffnen. Du beginnst auf Tiefe 20 mit
Level 22 und der normalen Entwicklermodus-Ausrüstung. Der automatische OMG-Stab und
Unverwundbarkeit gehören zum getrennten PR #11; hier aktiviert `/god on` die Unverwundbarkeit.
Gespeicherte Helden werden nicht geladen.
Du startest im Glasvogel-Vorraum. In der Entwicklerkonsole bringt dich `/boss qualmos`
zurück dorthin; `/god on` aktiviert Unverwundbarkeit.

## Rescue route / Rettungsreise

Each of the three antechambers provides ordinary floor loot: a glass bird, a breathing
helmet and the glassmaker's recording. Collect the kit, wear the helmet and hold that
chapter's bird in your off hand (not alongside a bow), then press the action button.
Equipping it alone never starts travel. The bird grows, the hero mounts it, and they fly
to the planet. Defeat Qualmos and rescue the glassmaker, then hold the bird and press
the action button again for the animated return to the next glass world. On arrival the bird goes back into the bag.
After the third rescue, the last flight reaches the three rescued glassmakers.

Each bird has two flights: outward and onward. Returning to an unfinished chapter does
not charge for the outward flight again; loading a destination does not spend a flight.
Progress is stored in the world's `run.told` flags. This route is still a prototype;
multiplayer and the complete browser journey need validation.

In jedem der drei Vorräume liegen ein Glasvogel, ein Atemhelm und die Aufnahme des
Glasmachers als gewöhnliche Beute. Sammle die Ausrüstung ein, setze den Helm auf und
halte den Vogel dieses Kapitels in der Nebenhand (nicht zusammen mit einem Bogen).
Halte den Vogel in der Hand und drücke den Aktionsbutton; Ausrüsten allein startet keinen
Flug. Der Vogel wächst, du steigst auf und fliegst zum Planeten. Besiege Qualmos und rette
den Glasmacher. Halte den Vogel erneut in der Hand und drücke den Aktionsbutton, um mit
Animation zur nächsten Glaswelt zu fliegen. Nach jeder Landung liegt der Vogel wieder im Inventar.
Nach der dritten Rettung führt der letzte Flug zu den drei befreiten Glasmachern.

The transparent globe has radius 8.25; its wider platform uses one 16-cell cube. A deep lagoon beside the dry rescue path lets Qualmos retreat
underwater for a few seconds before returning to the bank. He does not heal while hidden.
The distant preview through the antechamber's breach stays small. The bird and helmet are
enlarged only as floor pickups, not when worn. Both flights have a short 3D riding film;
reduced-motion settings shorten it and remove the hopping and banking.

Die durchsichtige Kugel hat Radius 8,25; die breitere Plattform verwendet einen 16-Zellen-Würfel. In einer tiefen Lagune neben dem trockenen Rettungsweg kann
Qualmos kurz untertauchen, bevor er ans Ufer zurückkehrt. Dabei heilt er sich nicht.
Vom Vorraum aus ist der Planet nur klein und weit entfernt zu sehen. Vogel und Helm sind
nur am Boden größer, nicht beim Tragen. Hin- und Rückflug zeigen eine kurze 3D-Reitanimation;
bei reduzierten Bewegungen ist sie kürzer und ohne Hüpfen oder Schräglage.

Jeder Vogel hat zwei Flüge: hin und weiter. Die Rückkehr zu einem noch nicht abgeschlossenen
Kapitel verbraucht den Hinflug nicht erneut; das Laden des Zielorts verbraucht keinen Flug.
Der Fortschritt wird mit der Welt gespeichert. Mehrspieler und die vollständige Reise im
Browser sind noch nicht geprüft.

## Design / Entwurf

Blue-green slender amphibian based on the child's drawing: six tentacles with pale green
suckers, two arms, hard head and back spines, wide toothy grin. Named **Qualmos**.
The prototype's authored model and action showcase are in `blender/amphibian.blend`.
`blender/amphibian.py` joins/decimates the authored parts and exports the skinned GLB,
including a death clip. Run meshopt compression after exporting.

Blau-grünes, schlankes Amphibienwesen nach der Kinderzeichnung: sechs Tentakel mit
hellgrünen Saugnäpfen, zwei Arme, harte Stacheln und ein breites Grinsen mit Zähnen.
Das Prototyp-Modell mit Animationsvorschau liegt in `blender/amphibian.blend`.

Native health: **6760 at level 22**, exactly twice Slomo's **3380 at level 15**.
The base HP compensates for the ordinary level growth; the final value is not scaled twice.
Five phases are gated at 80%, 60%, 40% and 20%; a hit cannot skip a phase. A short
invulnerable rage animation marks each transition.

**6760 Lebenspunkte auf Level 22**, doppelt so viele wie Slomo normalerweise hat.
Fünf Phasen mit Grenzen bei 80, 60, 40 und 20 Prozent; Übergänge können nicht übersprungen werden.

| Phase | New attacks / Neue Angriffe |
|---|---|
| 1 | Tentacle whip, reaching strike, double slam / Peitsche, Greifschlag, Doppelschlag |
| 2 | Water jet, diving lunge, slowing ink projectile, belly flop / Wasserstrahl, Tauchsprung, verlangsamendes Tintenprojektil, Bauchplatscher |
| 3 | Circular sweep, undertow pull / Rundumschlag, Sog |
| 4 | Three-projectile spread / Stachelsalve |
| 5 | Wide water blast / Flutstoß |

From phase 2, the belly flop is preferred first when in reach, then after two other attacks;
ranged attacks remain available when the hero is too far away. Earlier attacks remain available.
Ab Phase 2 kommt der Bauchplatscher in Reichweite zuerst und dann nach zwei anderen Angriffen;
auf Distanz bleiben die Fernangriffe verfügbar.

Belly flop leaves him exposed for 1.05 seconds
with 1.5x incoming damage, followed by a recovery pause.
Frühere Angriffe bleiben verfügbar. Nach dem Bauchplatscher ist er 1,05 Sekunden
verwundbar und nimmt anderthalbfachen Schaden, danach folgt eine Erholungspause.

## Prototype limitations / Noch offen

This is a playable integration prototype, not the final story encounter or polished balance.
It reuses generic melee hits, the existing jet/pull effects, and slime/ice projectile visuals.
The rescue planets now have a deep-water retreat, but there is not yet a held-player grab,
real thrown spine geometry, local ink cloud, bespoke sound, final dialogue, or multiplayer
validation. The dive pose needs further artistic polish. The rescue route adds narration text;
rendered voice clips are local, optional output.

Spielbarer Prototyp, noch kein fertig abgestimmter Endkampf: wiederverwendete
Treffer-/Projektil-/Wassereffekte und eine Lagune zum Untertauchen. Echtes Festhalten,
eigene Stachelprojektile, Tintenwolke, Sounds und Story-Ende fehlen noch.
Die Tauchbewegung braucht noch Feinschliff; Mehrspieler ist noch nicht geprüft.
Die Rettungsreise ergänzt Erzähltexte; Sprachaufnahmen sind optionale lokale Ausgaben.

## Checks / Prüfungen

- `node --test tests/amphibian.test.js tests/qualmos-voyage.test.js`: HP, phase gates,
  antechambers and three glass worlds across three seeds, compressed model/animations,
  rescue progression, charge accounting, retries and ordinary equipment slots.
- Chromium developer-entry smoke test: real core, level-22 hero, model loaded;
  all eleven attacks and all four phase transitions exercised without JavaScript errors.
- Full Windows test run is not clean: guide/music path-sensitive checks need separate review.

Gezielte Tests prüfen Lebenspunkte, Phasen, drei Welten und den Modellexport.
Im Chromium-Test wurden Einstieg, elf Angriffe und vier Phasenwechsel ohne JavaScript-Fehler geprüft.
Der vollständige Windows-Testlauf ist noch nicht fehlerfrei; Guide-/Musikpfade müssen separat geprüft werden.
