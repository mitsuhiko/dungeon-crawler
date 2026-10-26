// Break a test: one of the game's real tests (tests/combat.test.js, "the glassmaker's old sword takes two
// slashes for a spider and five for a Stunder"), run here with the game's real combat code
// (src/core/combat.js, src/core/enemies.js). Change the sword's damage and run it again; the strip
// shows every damage the test would accept.
import { SPIDER, STUNDER, makeEnemy } from '../../src/core/enemies.js';
import { SWORD, swordState, startSwing, advanceSwing, swordHit } from '../../src/core/combat.js';
import { canvas, html, t as tr } from '../deck.js';

// swing at a monster standing right in front until it is dead, like the test does
function slashes(profile, damage) {
  const p = { x: 0, y: 0, z: 0, yaw: 0, hp: 100, stun: 0, sword: swordState() };
  const e = makeEnemy({ x: 0, y: 0, z: 0.8, yaw: Math.PI }, profile);
  let n = 0;
  while (e.mode !== 'dead' && n < 99) {
    advanceSwing(p, 2);
    if (!startSwing(p)) return n;
    p.sword.stats = { ...p.sword.stats, damage };
    advanceSwing(p, SWORD.activeStart + 0.01);
    if (!swordHit(p, e, 1)) return n;   // a roll of 1: never a critical hit
    n++;
  }
  return n;
}
const CHECKS = [
  { profile: SPIDER, want: 2, name: () => tr('a spider', 'eine Spinne') },
  { profile: STUNDER, want: 5, name: () => tr('a Stunder', 'ein Stunder') },
];
const LO = 5, HI = 60;

export default function mount(el) {
  const row = html(el, `<div class="row"><label>${tr("The glassmaker's old sword's damage", 'Schaden des alten Schwerts des Glasmachers')} <input type="range" class="dmg" min="${LO}" max="${HI}" value="${SWORD.damage}"> <b class="v"></b></label>
    <button class="run">${tr('Run the test', 'Test laufen lassen')}</button><button class="reset">${tr('Back to the game\'s value', 'Zurück zum Wert des Spiels')}</button></div>`);
  const out = html(el, '<div class="out"></div>');
  const W = 560, H = 54, { g } = canvas(el, W, H);
  const cap = html(el, `<div class="legend"><span><i style="background:#3c8a4a"></i>${tr('the test passes', 'der Test besteht')}</span><span><i style="background:#8a3c3c"></i>${tr('the test fails', 'der Test schlägt fehl')}</span><span>\u25B2 ${tr('the game\'s value', 'der Wert des Spiels')}</span></div>`);
  const $ = s => row.querySelector(s);
  const pass = d => CHECKS.every(c => slashes(c.profile, d) === c.want);

  function strip(d) {
    g.clearRect(0, 0, W, H);
    const x = v => 10 + (v - LO) / (HI - LO + 1) * (W - 20), w = (W - 20) / (HI - LO + 1);
    for (let v = LO; v <= HI; v++) { g.fillStyle = pass(v) ? '#3c8a4a' : '#8a3c3c'; g.fillRect(x(v), 8, w - 1, 22); }
    g.strokeStyle = '#ffcf7a'; g.lineWidth = 2; g.strokeRect(x(d) - 1, 6, w + 1, 26);
    g.fillStyle = '#ffcf7a'; g.beginPath(); const sx = x(SWORD.damage) + w / 2; g.moveTo(sx, 36); g.lineTo(sx - 6, 46); g.lineTo(sx + 6, 46); g.fill();
    g.fillStyle = '#8a96a8'; g.font = "13px 'Crimson Text', serif";
    g.fillText(LO, x(LO), 48); g.fillText(HI, x(HI) - 8, 48);
  }
  function run() {
    const d = +$('.dmg').value;
    $('.v').textContent = d;
    const lines = CHECKS.map(c => {
      const n = slashes(c.profile, d), ok = n === c.want;
      return `<span style="color:${ok ? '#8fe39a' : '#ff9a8a'}">${ok ? '\u2714' : '\u2716'}</span> ${tr(`${c.name()} needs ${c.want} slashes: it took <b>${n}</b>`, `${c.name()} braucht ${c.want} Hiebe: es waren <b>${n}</b>`)}`;
    });
    const ok = pass(d);
    out.innerHTML = `<b>test</b> the glassmaker's old sword takes two slashes for a spider and five for a Stunder\n${lines.join('\n')}\n\n` + (ok
      ? tr('<span style="color:#8fe39a">PASS</span>: the sword still feels the way the game\'s makers wanted.', '<span style="color:#8fe39a">BESTANDEN</span>: Das Schwert fühlt sich noch so an, wie die Macher des Spiels es wollten.')
      : tr('<span style="color:#ff9a8a">FAIL</span>: did you mean to change this? If yes, the test needs to change too. If not, you just found a bug before any player did.',
        '<span style="color:#ff9a8a">FEHLGESCHLAGEN</span>: Wolltest du das ändern? Wenn ja, muss der Test auch geändert werden. Wenn nicht, hast du gerade einen Fehler gefunden, bevor ihn ein Spieler findet.'));
    strip(d);
  }
  $('.dmg').oninput = () => { $('.v').textContent = $('.dmg').value; strip(+$('.dmg').value); };
  $('.run').onclick = run;
  $('.reset').onclick = () => { $('.dmg').value = SWORD.damage; run(); };
  cap.style.marginTop = '4px';
  run();
}
