// Value noise like src/core/wnoise.js: random heights on a grid of whole numbers, smoothly
// blended in between, then a few layers (octaves) added up: big gentle hills plus smaller and
// smaller bumps. The ground is cut into levels, like the game's terrain steps.
import { hash32 } from '../../src/core/util.js';
import { canvas, html, t as tr } from '../deck.js';

export default function mount(el) {
  const W = 640, H = 300, { g } = canvas(el, W, H);
  const row = html(el, `<div class="row">
    <label><input type="checkbox" class="o0" checked> ${tr('big hills', 'große Hügel')}</label>
    <label><input type="checkbox" class="o1" checked> ${tr('medium bumps', 'mittlere Buckel')}</label>
    <label><input type="checkbox" class="o2" checked> ${tr('small bumps', 'kleine Buckel')}</label>
    <label>${tr('stretch', 'Dehnung')} <input type="range" class="zoom" min="2" max="40" value="12"></label>
    <label>${tr('levels', 'Stufen')} <input type="range" class="lv" min="2" max="24" value="12"></label>
    <button class="dice">${tr('New seed', 'Neuer Seed')}</button></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s);
  let seed = 7;
  // one octave of the game's value noise, along a line (z fixed)
  const at = (x, z) => hash32((Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed) | 0) / 4294967296;
  const sm = t => t * t * (3 - 2 * t);
  function vn(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
    const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
  const octave = (o, x) => vn(x * 2 ** o + o * 17.3, 0.37 + o * 9.1);

  function draw() {
    const on = [0, 1, 2].map(o => $('.o' + o).checked), zoom = +$('.zoom').value, levels = +$('.lv').value;
    g.clearRect(0, 0, W, H);
    const cells = 64, cw = W / cells, base = H - 10, top = 120;
    const colors = ['#ffcf7a', '#5fd3ff', '#b98cff'];
    // the separate octaves, small, at the top
    for (let o = 0; o < 3; o++) {
      g.strokeStyle = on[o] ? colors[o] : '#2a2f3a'; g.lineWidth = 1.5; g.beginPath();
      for (let px = 0; px <= W; px += 2) { const y = 8 + o * 34 + (1 - octave(o, px / cw / zoom)) * 28; px ? g.lineTo(px, y) : g.moveTo(px, y); }
      g.stroke();
      g.fillStyle = on[o] ? colors[o] : '#5a6678'; g.font = "14px 'Crimson Text', serif";
      g.fillText([tr('big hills \u00D71', 'große Hügel \u00D71'), tr('medium \u00D7\u00BD', 'mittel \u00D7\u00BD'), tr('small \u00D7\u00BC', 'klein \u00D7\u00BC')][o], W - 118, 20 + o * 34);
    }
    // their sum, normalised like the game's (each layer half as strong as the one before)
    const sum = x => { let s = 0, n = 0; for (let o = 0; o < 3; o++) if (on[o]) { s += octave(o, x) * 0.5 ** o; n += 0.5 ** o; } return n ? s / n : 0.5; };
    for (let i = 0; i < cells; i++) {
      const v = sum((i + 0.5) / zoom), lv = Math.max(1, Math.round(v * levels));
      const h = lv / levels * (base - top);
      g.fillStyle = '#4e382a'; g.fillRect(i * cw, base - h, cw + 0.5, h);
      g.fillStyle = '#4c8a3c'; g.fillRect(i * cw, base - h, cw + 0.5, Math.min(6, h));
    }
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 1.5; g.beginPath();
    for (let px = 0; px <= W; px += 2) { const y = base - sum(px / cw / zoom) * (base - top); px ? g.lineTo(px, y) : g.moveTo(px, y); }
    g.stroke();
    // cube borders: every 24 cells a new cube, but the ground goes on smoothly
    g.strokeStyle = '#ffffff33'; g.setLineDash([4, 4]);
    for (let i = 24; i < cells; i += 24) { g.beginPath(); g.moveTo(i * cw, top - 10); g.lineTo(i * cw, base); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = '#8a96a8'; g.fillText(tr('dashed lines: where one cube ends and the next begins', 'gestrichelt: wo ein Würfel endet und der nächste beginnt'), 8, top - 14);
    out.innerHTML = tr(`${on.filter(Boolean).length} layer(s) added together, cut into <b>${levels}</b> levels. White line: the smooth noise. Blocks: the ground.`,
      `${on.filter(Boolean).length} Schicht(en) zusammengezählt, in <b>${levels}</b> Stufen geschnitten. Weiße Linie: das glatte Rauschen. Blöcke: der Boden.`);
  }
  row.querySelectorAll('input').forEach(i => i.oninput = draw);
  $('.dice').onclick = () => { seed = Math.floor(Math.random() * 1e9); draw(); };
  draw();
}
