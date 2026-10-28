// Shared by native Qualmos and the rescue-route prototype. Once unlocked, show the belly
// flop first and again after two other attacks, rather than leaving it entirely to chance.
// Only prefer it in its real range: the boss keeps his ranged attacks when the hero is far away.
export function prioritizeBellyFlop(e, barred, distance, rise = 0) {
  const attacks = e.profile.attacks, current = attacks[e.attack];
  if (e.mode === 'attack' && current?.name === 'bellyFlop') e.lastBellyFlopAttack = e.attacks;
  const flop = attacks.find(a => a.name === 'bellyFlop');
  if (!flop || barred.has(flop.name) || e.mode === 'dead' || e.mode === 'gone') return barred;
  const due = !Number.isFinite(e.lastBellyFlopAttack) || e.attacks - e.lastBellyFlopAttack >= 2;
  if (!due || distance >= flop.reach || distance < (flop.minReach ?? 0) || rise >= (flop.rise ?? .75)) return barred;
  return new Set([...barred, ...attacks.filter(a => a !== flop).map(a => a.name)]);
}
