// In devtools (?dev=1): await (await import('./tests/browser/intros.js')).runIntroChecks()
// Every real boss's intro (game/bossintro.js, game/reveals.js, game/bossreveals.js; docs/bosses.md
// "The intro"), in his own arena: his own reveal plays; at first he is not there yet (hidden, under
// his spot or away from it, or Slomo flat as a pool); when his name comes up he is on his spot and
// all there; at the end, and skipped half way, he is on his spot as the fight wants him, nothing of
// the reveal left on him or his view, the light and the camera the game's again. Mansk's curtain
// shut at first, open by then, and gone.
import { paused } from './combat.js';
import { state } from '../../src/game/state.js';
import { BOSSES } from '../../src/core/bosses.js';
import { INTROS } from '../../src/core/bossintro.js';
import { allEnemies, drawEnemies } from '../../src/game/enemies.js';
import { goBoss } from '../../src/game/dev.js';
import { devIntro, introRun, introPlaying, updateBossIntro } from '../../src/game/bossintro.js';
import { loadSpecies } from '../../src/render/enemies.js';
import { characterReady } from '../../src/render/character.js';
import { curtainShown } from '../../src/render/stagecurtain.js';

const check = (value, message) => { if (!value) throw Error(message); };
const DT = 1 / 30;
// the intro (and his view) on for s seconds, or till it is over
function play(s) {
  for (let t = 0; t < s && introPlaying(); t += DT) { updateBossIntro(DT); drawEnemies(DT); }
}
const LEFT = ['veil', 'unseen', 'pose', 'clipBelow', 'dressView', 'ringSpin', 'spectral'];
function over(boss, e, spot, how) {
  check(!introPlaying() && !e.staged, `${boss} (${how}): over, and he is free to fight`);
  check(Math.hypot(e.x - spot.x, e.z - spot.z) < 1e-6 && Math.abs(e.y - spot.y) < 1e-6, `${boss} (${how}): back on his spot`);
  for (const k of LEFT) check(e[k] === undefined || e[k] === null || e[k] === false, `${boss} (${how}): nothing of the reveal left (${k}: ${e[k]})`);
  const v = e.view, base = v?.prefab ? v.prefab.scale * v.size : 1;
  if (v?.model && v.prefab) check(v.model.scale.toArray().every(s => Math.abs(s - base) < 1e-6), `${boss} (${how}): his model as big as it is`);
  check(state.introDim === 0 && !document.body.classList.contains('cinematic'), `${boss} (${how}): the light and the camera back`);
  check(curtainShown() === null, `${boss} (${how}): no curtain left`);
}

export async function runIntroChecks(only = null) {   // only: the bosses to check (names), else all
  return paused(async () => {
    const results = [];
    for (const boss of Object.values(BOSSES)) {
      if (only && !only.includes(boss)) continue;
      await goBoss(boss);
      await Promise.all([loadSpecies([boss]), characterReady]);
      // the whole of it
      check(devIntro(true) === null, `${boss}: an intro to play`);
      let r = introRun(), e = r.e;
      const spot = { ...r.spot }, d = INTROS[boss];
      check(r.def === d && r.full, `${boss}: his own intro (${r.def.reveal})`);
      play(1);
      const base = e.view?.prefab ? e.view.prefab.scale * e.view.size : 1;
      const away = e.veil === 0 || e.y < spot.y - 0.5 || Math.hypot(e.x - spot.x, e.z - spot.z) > 1.5 || (e.view?.model?.scale.y ?? 1) < 0.2 * base;
      check(away, `${boss}: not there yet at first`);
      if (boss === 'mansk') check(curtainShown() === 0, 'Mansk: the curtain shut over his stage at first');
      play(d.name[0] + 0.05 - 1);
      check(Math.hypot(e.x - spot.x, e.z - spot.z) < 0.15 && Math.abs(e.y - spot.y) < 0.3, `${boss}: on his spot when his name comes up`);
      check((e.veil ?? 1) === 1 && !e.spectral && e.clipBelow === undefined, `${boss}: all there when his name comes up`);
      if (boss === 'mansk') check(Math.abs(e.lift - r.data.low) < 0.05 && curtainShown() > 0.95, 'Mansk: floating low again, the curtain open');
      play(20);
      over(boss, e, spot, 'whole');
      if (boss === 'flip') check(state.introVoid === 1, 'Flip: the world round the box stays away till his fight');
      // skipped half way
      check(devIntro(true) === null, `${boss}: again`);
      r = introRun(); e = r.e;
      play(2.5);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      play(20);
      over(boss, e, { ...r.spot }, 'skipped');
      results.push(`${boss}: ${r.def.reveal}`);
    }
    return results;
  });
}
