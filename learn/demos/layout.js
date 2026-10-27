// The real layout of a depth (src/world/layout.js): which cubes exist, the route through them,
// side rooms, guardians, the horde and reward sites. Seen from above, centred on the world's axis.
import { makeLayouts } from '../../src/world/layout.js';
import { parse } from '../../src/world/coords.js';
import { MAX_DEPTH } from '../../src/themes/depth.js';
import { bossAt } from '../../src/core/bosses.js';
import { canvas, html, t as tr, themeLabel } from '../deck.js';

const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export default function mount(el) {
  const W = 640, H = 470, { g } = canvas(el, W, H);
  const row = html(el, `<div class="row"><label>Seed <input type="number" class="seed" value="123"></label>
    <label>${tr('depth', 'Tiefe')} <input type="range" class="depth" min="0" max="${MAX_DEPTH}" value="1"> <b class="dn"></b></label>
    <button class="dice">${tr('New seed', 'Neuer Seed')}</button></div>`);
  const out = html(el, '<div class="out"></div>');
  const seedIn = row.querySelector('.seed'), depthIn = row.querySelector('.depth');
  let layouts = null, seed = null;

  function draw() {
    const s = +seedIn.value >>> 0, d = +depthIn.value;
    if (s !== seed) { seed = s; layouts = makeLayouts(seed); }
    const L = layouts(d);
    row.querySelector('.dn').textContent = `${d} \u00B7 ${themeLabel(L.theme)}`;
    const S = 50, ox = 30, oy = 10, R = 4;
    const cx = x => ox + (x + R) * S, cz = z => oy + (z + R) * S;
    g.clearRect(0, 0, W, H);
    // the grid of possible cubes; the ring the route may use is a little brighter
    for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
      g.fillStyle = '#141922'; g.fillRect(cx(x) + 2, cz(z) + 2, S - 4, S - 4);
    }
    const pos = k => { const [X, , Z] = parse(k); return [X, Z]; };
    const center = k => { const [x, z] = pos(k); return [cx(x) + S / 2, cz(z) + S / 2]; };
    const spine = L.route, cells = [...L.exists];
    // links: along the route, and from each side room back to its room
    g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i + 1 < spine.length; i++) {
      g.strokeStyle = '#ffc94a'; g.beginPath(); g.moveTo(...center(spine[i])); g.lineTo(...center(spine[i + 1])); g.stroke();
    }
    for (const k of cells) if (!spine.includes(k)) {
      const [x, z] = pos(k), [dx, dz] = AXES[L.exit.get(k)];
      g.strokeStyle = '#70d6aa'; g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(...center(k)); g.lineTo(cx(x + dx) + S / 2, cz(z + dz) + S / 2); g.stroke(); g.setLineDash([]);
    }
    // the rooms
    g.font = "bold 13px 'Cinzel', serif"; g.textAlign = 'center';
    for (const k of cells) {
      const [x, z] = pos(k), i = spine.indexOf(k), role = L.roles.get(k) || '';
      const guard = L.guardians.get(k);
      g.fillStyle = guard ? (guard.role === 'descent' ? '#7a5a10' : '#6a1f4a') : i >= 0 ? '#2c3a48' : '#1f3a30';
      g.fillRect(cx(x) + 5, cz(z) + 5, S - 10, S - 10);
      g.strokeStyle = guard ? (guard.role === 'descent' ? '#ffb000' : '#ff5ab4') : '#5a6678'; g.lineWidth = 2;
      g.strokeRect(cx(x) + 5, cz(z) + 5, S - 10, S - 10);
      g.fillStyle = '#fff';
      g.fillText(i >= 0 ? String(i + 1) : '+', cx(x) + S / 2, cz(z) + S / 2 + 5);
      if (L.sitePlans.get(k)?.length) { g.fillStyle = '#ffcf7a'; g.fillRect(cx(x) + S - 16, cz(z) + 8, 8, 7); }
      if (L.hordes.has(k)) { g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(cx(x) + 13, cz(z) + S - 13, 5, 0, 7); g.fill(); }
      if (role === 'town' || (d === 0 && i === 0)) { g.fillStyle = '#76ad50'; g.fillText(tr('town', 'Stadt'), cx(x) + S / 2, cz(z) + S - 9); }
    }
    // the way in (ring up) and the way down (well)
    const ring = k => { const [a, b] = center(k); g.strokeStyle = '#5fd3ff'; g.lineWidth = 3; g.beginPath(); g.arc(a - 13, b - 12, 6, 0, 7); g.stroke(); };
    if (L.up) ring(L.up);
    if (L.down) { const [a, b] = center(L.down); g.fillStyle = '#05070a'; g.beginPath(); g.arc(a + 13, b - 12, 6, 0, 7); g.fill(); g.strokeStyle = '#ffc94a'; g.lineWidth = 2; g.stroke(); }
    // legend
    g.textAlign = 'left'; g.font = "15px 'Crimson Text', serif";
    const lx = ox + (2 * R + 1) * S + 14;
    [['#ffc94a', tr('the route', 'die Route')], ['#70d6aa', tr('side room (+)', 'Nebenraum (+)')], ['#ff5ab4', tr('guardian', 'Wächter')], ['#ffb000', tr('Temp Boss or boss', 'Temp-Boss oder Boss')], ['#5fd3ff', tr('way in (ring up)', 'Eingang (Ring)')], ['#ffc94a', tr('well down', 'Brunnen runter')], ['#ffcf7a', tr('treasure site', 'Schatzplatz')], ['#ff5a4a', tr('horde', 'Horde')]]
      .forEach(([c, t], j) => { g.fillStyle = c; g.fillRect(lx, 20 + j * 22, 12, 12); g.fillStyle = '#aab3c2'; g.fillText(t, lx + 18, 31 + j * 22); });
    const sides = [...L.guardians.values()].filter(x => x.role === 'side').length;
    const boss = bossAt(d) && bossAt(d)[0].toUpperCase() + bossAt(d).slice(1);   // (the well's: a real boss, else a Temp Boss)
    const hordes = [...L.hordes].map(([k, h]) => [spine.indexOf(k) + 1, h.count]);
    out.innerHTML = tr(`depth ${d}: <b>${spine.length}</b> rooms on the route, <b>${cells.length - spine.length}</b> side rooms, `
      + (d < MAX_DEPTH ? `<b>${sides}</b> guardian${sides === 1 ? '' : 's'} and ${boss ? `the boss <b>${boss}</b>` : 'a Temp Boss'} at the well` : `the core: no way further down, the boss <b>${boss}</b> in its last room`)
      + hordes.map(([i, n]) => `; a horde of <b>${n}</b> in room ${i}`).join(''),
      `Tiefe ${d}: <b>${spine.length}</b> Räume auf der Route, <b>${cells.length - spine.length}</b> Nebenräume, `
      + (d < MAX_DEPTH ? `<b>${sides}</b> Wächter und ${boss ? `der Boss <b>${boss}</b>` : 'ein Temp-Boss'} am Brunnen` : `der Kern: kein Weg weiter nach unten, der Boss <b>${boss}</b> in seinem letzten Raum`)
      + hordes.map(([i, n]) => `; eine Horde aus <b>${n}</b> in Raum ${i}`).join(''));
  }
  seedIn.oninput = draw; depthIn.oninput = draw;
  row.querySelector('.dice').onclick = () => { seedIn.value = Math.floor(Math.random() * 99999); draw(); };
  draw();
}
