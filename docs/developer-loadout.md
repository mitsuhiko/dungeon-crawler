# Developer starter kit

With `?dev=1`, a fresh developer hero starts with god mode enabled and an equipped
OMG Arcane Staff at item level 99, in addition to the existing tools, potions and test gold.
`?at=<boss>` keeps the staff while setting the hero's level to that encounter's level.
`/god off` disables invulnerability and `/god on` enables it again.

Normal heroes retain their usual starting equipment and are not invincible.
This is a developer convenience, not a new gameplay reward or a hero level-99 boost.

Checks: `node --test tests/progression.test.js tests/intro.test.js`.
