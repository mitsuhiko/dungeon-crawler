# Developer starter kit

With `?dev=1`, a fresh developer hero starts with god mode enabled and the following
ordinary generated OMG items, all at item level 99, in addition to the tools, potions and test gold:

- Arcane Staff, equipped, on quick bar slot 3.
- Triple Flail (three spiked morning-star balls), on quick bar slot 4.
- Great Helm, Plate Armor, Tower Shield and Iron Greaves, all worn immediately, like the
  heavy armor in the reference recording. Existing rarity colors/animations are unchanged.

The normal equipment controls switch between staff and flail; both remain in the bag.
Starting HP includes the worn armor's life bonuses.
`?at=<boss>` keeps the staff while setting the hero's level to that encounter's level.
`/god off` disables invulnerability and `/god on` enables it again.

Normal heroes retain their usual starting equipment and are not invincible.
This is a developer convenience, not a new gameplay reward or a hero level-99 boost.

## Deutsch

Mit `?dev=1` beginnt ein frischer Entwickler-Held im God-Modus mit vollständig angelegter
OMG-Rüstung (Großhelm, Plattenrüstung, Turmschild und Eisenschienen), einem ausgerüsteten
OMG-Arkanstab auf Schnellleistenplatz 3 und einem OMG-Dreifach-Flegel mit drei Stachelkugeln
auf Platz 4. Alle sechs Gegenstände haben Gegenstandsstufe 99; die Heldenstufe bleibt unverändert.
Die vorhandenen Farben und Animationen bleiben erhalten, ebenso Werkzeuge, Tränke und Testgold.
Die anfänglichen Lebenspunkte berücksichtigen die angelegte Rüstung. Normale Helden und
bestehende Spielstände bekommen diese Entwickler-Ausrüstung nicht.

Checks: `node --test tests/progression.test.js tests/intro.test.js`.
