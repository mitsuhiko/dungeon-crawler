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

Checks: `node --test tests/progression.test.js tests/intro.test.js`.
