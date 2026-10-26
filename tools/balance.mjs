// Balance simulation: plays runs through the real tables (layouts, rosters, enemy levels, XP,
// drops, chests, combat stats) and prints, for every depth, where the player stands on arrival
// and how the fights there go. docs/balance.md explains the targets.
//   node tools/balance.mjs [seeds, default 8] [kill share, default 0.6]
// The player kills `kill share` of every ordinary cube on the route, all of a guardian arena,
// and visits half of the branch cubes (killing the same share and opening their chests). It
// equips the best weapon by damage per second. Numbers are averages over the seeds; `p10` is the
// unluckiest tenth of the runs (the level and damage per second only 10% arrive below), and
// `rng%` the runs that have seen a bow, crossbow or staff drop by then (kept or not). `trials`:
// the trial rooms on the way (docs/trials.md) and the minutes they take (core/trials.js trialTime).
// Then what each depth pays (copper from kills and chests, crystals) beside what the Enchanter
// and the Smith ask for weapons of its item level (core/crafting.js). It wears the piece of armor
// with the most armor in each slot (dropped or found: none bought); `armor%` is what all of it
// takes off a blow from an enemy of the depth's level (core/gear/stats.js armorReduction), and
// the blows the enemies need to kill the player count it.
//   node tools/balance.mjs farm [respawns, default 6] [seeds, default 200]
// Farming the road out of town before Gusto: every ordinary enemy of depth 0 (not the side
// guardian's arena) is killed once a life, as often as they come back (core/respawn.js: every
// RESPAWN s), with the glassmaker's old sword in hand. Prints, after each round, how many runs have seen a
// ranged weapon drop, and the level.
globalThis.location = { search: '' };
const { makeLayouts } = await import('../src/world/layout.js');
const { enemyFreeAt } = await import('../src/world/town.js');
const { population } = await import('../src/core/spawns.js');
const { BOSSES } = await import('../src/core/bosses.js');
const { swarmKind } = await import('../src/core/hordes.js');
const { ENEMY_KINDS, GUARDIAN_KINDS, DESCENT_GUARDIAN_KINDS, enemyProfile, enemyRoll, guardianLevel, threat, attackDamage, depthLevel, coinRange } =
  await import('../src/core/enemies.js');
const { enemyDrops } = await import('../src/core/gear/drops.js');
const { chestLoot } = await import('../src/core/chests.js');
const { weaponDps, armorStats, armorReduction, wornTotals } = await import('../src/core/gear/stats.js');
const P = await import('../src/core/progression.js');
const { combatStats, swordState, favoredKind } = await import('../src/core/combat.js');
const { addInstance, equipItem, takeItem, equippedItem, wearItem, wornItem, bareSlots } = await import('../src/core/inventory.js');
const { mulberry32, hash32 } = await import('../src/core/util.js');
const { RESPAWN } = await import('../src/core/respawn.js');
const { ITEMS, isMelee } = await import('../src/core/items.js');
const { trialTime } = await import('../src/core/trials.js');
const { hordeKinds, hordeSize } = await import('../src/world/hordes.js');
const { enchantCost, rerollCost } = await import('../src/core/crafting.js');

const ranged = item => !isMelee(ITEMS[item.itemId]?.weapon?.kind);
const SEEDS = Number(process.argv[2] || 8), SHARE = Number(process.argv[3] || 0.6);

const pick = (kinds, r) => {
  const list = Object.entries(kinds);
  let w = r * list.reduce((n, [, k]) => n + k, 0);
  for (const [t, k] of list) if ((w -= k) < 0) return ENEMY_KINDS[t];
  return ENEMY_KINDS[list.at(-1)[0]];
};
const dps = p => { const s = combatStats(p); return s ? weaponDps(s) : 0; };
if (process.argv[2] === 'farm') { farm(Number(process.argv[3] || 6), Number(process.argv[4] || 200)); process.exit(0); }

const rows = [];
let beforeBoss = 0;   // runs that saw a ranged weapon drop before fighting the first real boss (Gusto)
for (let seed = 1; seed <= SEEDS; seed++) {
  const R = mulberry32(hash32(seed * 7919)), layouts = makeLayouts(seed);
  const p = { ...P.createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() }, run = P.createRun();
  let serial = 0, potions = 0, row = null, seenRanged = false;
  const offer = (item, from) => {   // keep a weapon when it beats the one in hand
    if (ranged(item)) seenRanged = true;
    const before = dps(p), id = addInstance(p.inventory, item), was = p.inventory.equipped;
    if (!id) return;
    equipItem(p.inventory, id);
    if (dps(p) > before) { takeItem(p.inventory, was); row.upgrades[from]++; }
    else { equipItem(p.inventory, was); takeItem(p.inventory, id); }
  };
  const wear = item => {   // wear a piece of armor when it holds more than what is worn there
    const slot = ITEMS[item.itemId].armor.slot, was = wornItem(p.inventory, slot);
    if (was && armorStats(was).armor >= armorStats(item).armor) return;
    const id = addInstance(p.inventory, item);
    if (!id) return;
    wearItem(p.inventory, id);
    if (was) takeItem(p.inventory, was.instanceId);
    p.maxHp = P.fullHealth(p.level, p.inventory);
  };
  const take = (items, from) => { for (const i of items) if (ITEMS[i.itemId].armor) wear(i); else if (i.gen) offer(i, from); else if (ITEMS[i.itemId].crystal) row.crystals += i.count; else potions += i.count; };
  // what a blow from an enemy of this depth leaves after the armor worn
  const cut = () => 1 - armorReduction(wornTotals(p.inventory).armor, depthLevel(row.depth));
  const kill = (kind, level, extra = {}) => {
    const e = { id: `s${seed}:${serial++}`, level, kind, mode: 'dead', hp: 0, profile: enemyProfile(kind, level), coinDrop: 0, ...extra };
    const before = p.xp;
    P.awardKill(p, run, e);
    const [lo, hi] = coinRange(kind, level); row.copper += (lo + hi) / 2;
    row.xpShare += (p.xp - before) / e.profile.xp; row.kills++;
    take(enemyDrops(e, seed, favoredKind(p), bareSlots(p.inventory)), extra.guardian ? 'guardian' : 'enemy');
  };
  for (let depth = 0; depth <= 20; depth++) {
    const L = layouts(depth), s = combatStats(p);
    row = rows[depth] ??= { depth, n: 0, level: 0, hp: 0, hit: 0, dps: 0, interval: 0, kills: 0, xp: 0, xpShare: 0, potions: 0, chests: 0,
      upgrades: { enemy: 0, guardian: 0, chest: 0 }, weapons: new Map(), kinds: new Map(), guards: { side: [], descent: [] },
      levels: [], dpss: [], ranged: 0, trials: 0, trialTime: 0, copper: 0, crystals: 0, armor: 0 };
    row.n++; row.level += p.level; row.hp += p.maxHp; row.hit += s.damage; row.dps += dps(p); row.interval += s.interval;
    row.levels.push(p.level); row.dpss.push(dps(p)); row.ranged += seenRanged;
    row.armor += armorReduction(wornTotals(p.inventory).armor, depthLevel(depth));
    const w = equippedItem(p.inventory), wl = `${w.gen.rarity} ${w.itemId.replace('weapon_', '').replace('_', ' ')} i${w.gen.ilvl}`;
    row.weapons.set(wl, (row.weapons.get(wl) || 0) + 1);
    const xp0 = p.xp, potions0 = potions;
    const cubes = [...L.route.map(k => ({ k, share: L.guardians.has(k) ? 1 : SHARE })),
      ...[...L.exists].filter(k => !L.route.includes(k)).map(k => ({ k, share: R() < 0.5 ? SHARE : 0 }))];
    // the trial rooms on the way (and those in the branches visited): their time
    for (const t of L.trials) if (t.role === 'route' || R() < 0.5) {
      row.trials++; row.trialTime += trialTime(t.kind);
      // a siege's waves (game/trialevents.js): the horde's kinds at swarm strength, half rewards;
      // about half of them fall before the hold is full, the rest flee
      if (t.kind === 'siege') {
        const [lo, hi] = hordeSize(depth), kinds = hordeKinds(depth);
        for (let i = 0; i < Math.round((lo + hi) / 4); i++) kill(swarmKind(ENEMY_KINDS[kinds[i % kinds.length]], 0.5), depthLevel(depth));
      }
    }
    for (const { k, share } of cubes) {
      if (enemyFreeAt(k) || !share) continue;
      const g = L.guardians.get(k), map = { seed: hash32(seed * 31 + serial * 977), depth, key: k, biome: L.theme.props, guardian: g ?? null, horde: L.hordes.get(k), populationScale: L.populationScale.get(k) ?? 1 };
      // (the map's theme: the species that keep to some themes, the dark forest's, the slime marsh's)
      // a real boss (core/bosses.js) stands alone: it is the guardian, below
      if (!g?.boss) for (const [, spec] of population(map)) for (let i = 0; i < spec.count; i++) {
        const base = pick(spec.kinds, R()), kind = spec.swarm ? swarmKind(base, spec.rewardScale) : base;
        const level = enemyRoll(map, kind, i * 13 + 1).level;
        const k2 = row.kinds.get(kind.type) ?? { kind, level: 0, n: 0 };
        k2.level += level; k2.n++; row.kinds.set(kind.type, k2);
        if (R() < share) kill(kind, level);
      }
      if (g) {
        const species = [...population(map).keys()], chosen = species[Math.floor(R() * species.length)];
        const kind = g.boss ? ENEMY_KINDS[g.boss] : (g.role === 'descent' ? DESCENT_GUARDIAN_KINDS : GUARDIAN_KINDS)[chosen];
        const level = guardianLevel(depth, g.role), prof = enemyProfile(kind, level), hit = combatStats(p).damage;
        const ttk = prof.hp / dps(p);
        row.guards[g.role].push({ type: chosen, level, hp: prof.hp, ttk, php: p.maxHp,
          blows: p.maxHp / (attackDamage(prof) * cut()), brawl: threat(prof) * cut() * ttk / p.maxHp, hits: prof.hp / hit });
        if (g.boss === BOSSES[0]) beforeBoss += seenRanged;
        kill(kind, level, { guardian: true, guardianRole: g.role });
      }
      for (const site of L.sitePlans.get(k) || []) { const c = chestLoot(site, depth, seed, favoredKind(p), bareSlots(p.inventory)); take(c.items, 'chest'); row.copper += c.copper; row.chests++; }
    }
    row.xp += p.xp - xp0; row.potions += potions - potions0;
  }
}

const f = (n, d = 0) => n.toFixed(d);
// the value only a tenth of `list` falls below
const p10 = list => [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) * 0.1)];
console.log(`${SEEDS} seeds, ${SHARE * 100}% of each ordinary cube killed. On arrival at each depth:\n`);
console.log('depth elvl plvl  p10 maxHP  hit   int   DPS  p10  rng% armor%  kills  XP got  xp%  potions chests  trials  upgrades e/g/c  weapon (most common)');
for (const r of rows) {
  const w = [...r.weapons].sort((a, b) => b[1] - a[1])[0][0], n = r.n;
  console.log(`${String(r.depth).padStart(5)} ${String(depthLevel(r.depth)).padStart(4)} ${f(r.level / n, 1).padStart(4)} ${String(p10(r.levels)).padStart(4)} ${f(r.hp / n).padStart(5)} ${f(r.hit / n).padStart(4)} ${f(r.interval / n, 2).padStart(5)} ${f(r.dps / n).padStart(5)} ${f(p10(r.dpss)).padStart(4)} ${f(r.ranged / n * 100).padStart(5)} ${f(r.armor / n * 100).padStart(6)} ${f(r.kills / n).padStart(6)} ${f(r.xp / n).padStart(7)} ${f(r.xpShare / r.kills * 100).padStart(4)} ${f(r.potions / n, 1).padStart(8)} ${f(r.chests / n, 1).padStart(6)} ${`${f(r.trials / n, 1)}/${f(r.trialTime / n / 60, 1)}m`.padStart(7)}  ${[r.upgrades.enemy, r.upgrades.guardian, r.upgrades.chest].map(x => f(x / n, 1)).join('/').padStart(14)}  ${w}`);
}
const trialMinutes = rows.reduce((s, r) => s + r.trialTime / r.n, 0) / 60;
console.log(`\nTrial rooms take about ${f(trialMinutes, 1)} minutes of a run (their own time, on top of the walking and the fights).`);
console.log(`\nBefore Gusto, ${f(beforeBoss / SEEDS * 100)}% of the runs have seen a ranged weapon drop (node tools/balance.mjs farm: when farming).`);
console.log('\nWhat a depth pays (copper from kills and chests, crystals of all kinds) and what the Enchanter and the Smith ask for its');
console.log('weapons (item level = the depth\'s; a re-roll on an Unusual and on a Fabled one):');
console.log('depth  copper  crystals   enchant         re-roll  unusual  fabled');
for (const r of rows) {
  const n = r.n, ilvl = depthLevel(r.depth), w = rarity => ({ itemId: 'weapon_sword_long', gen: { rarity, ilvl, affixes: [{}] } }), e = enchantCost(w('unusual'), 'toasty');
  console.log(`${String(r.depth).padStart(5)} ${f(r.copper / n).padStart(7)} ${f(r.crystals / n, 1).padStart(9)}   ${`${e.copper}c + ${e.count}`.padEnd(14)}  ${String(rerollCost(w('unusual'))).padStart(15)}  ${String(rerollCost(w('fabled'))).padStart(6)}`);
}
console.log('\nOrdinary kinds on arrival: level, the hits it takes, the blows it needs to kill the player');
for (const r of rows) {
  const n = r.n, hit = r.hit / n, hp = r.hp / n, cut = 1 - r.armor / n;
  const parts = [...r.kinds.values()].sort((a, b) => b.n - a.n).slice(0, 8).map(({ kind, level, n }) => {
    const lv = Math.round(level / n), prof = enemyProfile(kind, lv);
    return `${kind.type} L${lv} ${Math.ceil(prof.hp / hit)}/${f(hp / (attackDamage(prof) * cut), 1)}`;
  });
  console.log(`d${r.depth}: ${parts.join(', ')}`);
}
console.log('\nGuardians: level, HP, hits to kill, seconds at full DPS, their blows to kill the player, a toe-to-toe brawl (their damage over that time / max HP)');
for (const r of rows) for (const role of ['side', 'descent']) {
  const g = r.guards[role];
  if (!g.length) continue;
  const avg = k => g.reduce((n, x) => n + x[k], 0) / g.length, max = k => Math.max(...g.map(x => x[k]));
  console.log(`d${String(r.depth).padEnd(2)} ${role.padEnd(7)} L${f(avg('level'), 0).padEnd(3)} HP ${f(avg('hp')).padStart(5)}  hits ${f(avg('hits')).padStart(3)}  ${f(avg('ttk'), 1).padStart(4)}s  blows ${f(avg('blows'), 1).padStart(4)}  brawl ${f(avg('brawl') * 100).padStart(3)}% (worst ${f(max('brawl') * 100)}%)  [${[...new Set(g.map(x => x.type))].join(' ')}]`);
}

// Farming the road (see the top): rounds 0..respawns, each killing every ordinary enemy of the
// road once, in its next life
function farm(respawns, seeds) {
  const seen = Array(respawns + 1).fill(0), level = Array(respawns + 1).fill(0), drops = Array(respawns + 1).fill(0);
  let enemies = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const R = mulberry32(hash32(seed * 7919)), L = makeLayouts(seed)(0);
    const p = { ...P.createPlayerStats(), x: 0, y: 0, z: 0, yaw: 0, stun: 0, sword: swordState() }, run = P.createRun();
    const spots = [];
    for (const k of L.exists) {
      if (enemyFreeAt(k) || L.guardians.has(k)) continue;
      const map = { seed: hash32(seed * 31 + spots.length * 977), depth: 0, key: k, guardian: null, horde: L.hordes.get(k), populationScale: L.populationScale.get(k) ?? 1 };
      for (const [, spec] of population(map)) for (let i = 0; i < spec.count; i++) {
        const base = pick(spec.kinds, R()), kind = spec.swarm ? swarmKind(base, spec.rewardScale) : base;
        spots.push({ id: `${k}:${kind.type}:${i}`, kind, level: enemyRoll(map, kind, i * 13 + 1).level });
      }
    }
    if (seed === 1) enemies = spots.length;
    let found = false;
    for (let wave = 0; wave <= respawns; wave++) {
      for (const s of spots) {
        const e = { id: s.id, wave, level: s.level, kind: s.kind, mode: 'dead', hp: 0, profile: enemyProfile(s.kind, s.level), coinDrop: 0 };
        run.defeated.delete(e.id);
        P.awardKill(p, run, e);
        for (const item of enemyDrops(e, seed, favoredKind(p))) if (ITEMS[item.itemId].weapon) { drops[wave]++; if (ranged(item)) found = true; }
      }
      seen[wave] += found; level[wave] += p.level;
    }
  }
  const f = (n, d = 0) => n.toFixed(d);
  console.log(`Farming the road out of town (${enemies} enemies in seed 1's), ${seeds} seeds, a round every ${RESPAWN / 60} min:\n`);
  console.log('round  minutes  weapons  seen a ranged one  level');
  for (let w = 0; w <= respawns; w++)
    console.log(`${String(w).padStart(5)} ${String(w * RESPAWN / 60).padStart(8)} ${f(drops.slice(0, w + 1).reduce((a, b) => a + b, 0) / seeds, 1).padStart(8)} ${(f(seen[w] / seeds * 100) + '%').padStart(18)} ${f(level[w] / seeds, 1).padStart(6)}`);
}
