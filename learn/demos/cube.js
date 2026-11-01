// The real world generator (src/world/world.js, src/cubegen/), running in the page: pick a seed,
// a depth and a room on that depth's route, and it builds the cube and draws it from above in
// the game's diagonal view: floors as blocks, fluids, stairs and bridges, portals, and the
// generator's route (the pink line, like P in the game).
import { World } from '../../src/world/world.js';
import { themeAt, themeOf, MAX_DEPTH } from '../../src/themes/depth.js';
import { runY } from '../../src/core/surfaces.js';
import { N, LH, BASE } from '../../src/core/constants.js';
import { canvas, html, t as tr, themeLabel } from '../deck.js';

const FLUID = { 1: [46, 134, 222], 2: [255, 90, 0], 3: [125, 255, 58] };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, k = 1, a = 1) => `rgba(${c.map(v => Math.round(Math.min(255, v * k))).join(',')},${a})`;
// a colour from a theme's stops by height in levels ([[level, '#hex'], ...])
function stop(stops, level) {
  let i = 0;
  while (i + 1 < stops.length && stops[i + 1][0] <= level) i++;
  const a = stops[i], b = stops[i + 1] || a;
  return mix(hex(a[1]), hex(b[1]), b === a ? 0 : Math.min(1, Math.max(0, (level - a[0]) / (b[0] - a[0]))));
}

export default function mount(el) {
  const W = 640, H = 540, { g } = canvas(el, W, H);
  const row = html(el, `<div class="row">
    <label>Seed <input type="number" class="seed" value="${1 + Math.floor(Math.random() * 999)}"></label>
    <label>${tr('depth', 'Tiefe')} <select class="depth">${Array.from({ length: MAX_DEPTH + 1 }, (_, d) => `<option value="${d}" ${d === 1 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <label>${tr('room', 'Raum')} <input type="range" class="room" min="0" max="6" value="2"> <b class="rn"></b></label></div>
    <div class="row"><button class="build">${tr('Build it!', 'Bauen!')}</button><button class="dice">${tr('New seed', 'Neuer Seed')}</button><button class="turn">${tr('Turn view', 'Ansicht drehen')}</button>
    <label><input type="checkbox" class="route" checked> ${tr('show route', 'Route zeigen')}</label></div>`);
  const out = html(el, '<div class="out"></div>');
  const $ = s => row.querySelector(s) || el.querySelector(s);
  let world = null, worldSeed = null, rot = 0, last = null;

  function build() {
    const seed = +$('.seed').value >>> 0, d = +$('.depth').value;
    if (!world || worldSeed !== seed) {
      world = new World(seed); worldSeed = seed;
      // every world picks its own theme per depth
      for (const o of $('.depth').options) o.textContent = `${o.value} \u00B7 ${themeLabel(themeAt(+o.value, world.themes))}`;
    }
    const L = world.layout(d), route = L.route;
    $('.room').max = route.length - 1;
    const i = Math.min(+$('.room').value, route.length - 1), k = route[i];
    $('.rn').textContent = `${i + 1}/${route.length}`;
    const t0 = performance.now(), fresh = !world.cubes.has(k);
    const map = world.cube(k).map, ms = performance.now() - t0;
    last = { map, d, k, i, n: route.length, ms, fresh, role: L.roles.get(k) };
    draw();
  }

  function draw() {
    const { map: m, d } = last, theme = themeOf(m);
    g.clearRect(0, 0, W, H);
    // (sized so that a cube of any width N fills the canvas as one of 16 did)
    const S = 16 / N, TW = 34 * S, TH = 17 * S, HS = 17 * S, ox = W / 2, oy = 130;
    // turn a point in cube coordinates (x, z in 0..N) by the view rotation
    const turn = (x, z) => [[x, z], [N - z, x], [N - x, N - z], [z, N - x]][rot];
    const P = (x, z, y) => { const [u, v] = turn(x, z); return [ox + (u - v) * TW / 2, oy + (u + v) * TH / 2 - y * HS]; };
    const poly = (pts, fill, stroke) => {
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      g.fillStyle = fill; g.fill();
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.5; g.stroke(); }
    };
    // a block over one cell (or a part of it): heights at the four corners on top, a flat bottom
    function block(x0, z0, x1, z1, top, bottom, color, alpha = 1) {
      const corners = [[x0, z0, top[0]], [x1, z0, top[1]], [x0, z1, top[2]], [x1, z1, top[3]]]
        .map(([x, z, h]) => { const [u, v] = turn(x, z); return { x, z, h, u, v }; });
      const by = f => corners.reduce((a, b) => f(b) > f(a) ? b : a);
      const A = by(c => -(c.u + c.v)), C = by(c => c.u + c.v), B = by(c => c.u - c.v), D = by(c => c.v - c.u);
      const top3 = c => P(c.x, c.z, c.h), bot = c => P(c.x, c.z, bottom);
      poly([bot(B), bot(C), top3(C), top3(B)], rgb(color, 0.72, alpha));   // right side
      poly([bot(D), bot(C), top3(C), top3(D)], rgb(color, 0.55, alpha));   // left side
      poly([top3(A), top3(B), top3(C), top3(D)], rgb(color, 1, alpha), alpha < 1 ? null : 'rgba(0,0,0,0.12)');
    }
    // everything to draw, sorted back to front (farther cells first, lower things first)
    const items = [];
    const depthKey = (x, z) => { const [u, v] = turn(x + 0.5, z + 0.5); return u + v; };
    for (const f of m.floors) {
      const top = f.cs, bottom = f.layer === 0 || f.merged || f.bottom === 0 ? -BASE : f.bottom * LH;
      items.push({ key: depthKey(f.x, f.z), y: bottom, draw() {
        const color = stop(theme.top, f.top);
        block(f.x, f.z, f.x + 1, f.z + 1, top, bottom, f.fluid ? stop(theme.side, f.top) : color);
        if (f.fluid) { const s = f.surf * LH; block(f.x, f.z, f.x + 1, f.z + 1, [s, s, s, s], Math.max(...top), FLUID[f.fluid], 0.75); }
      } });
    }
    m.pieces.forEach((list, c) => {
      for (const p of list || []) {
        const x = c % N, z = (c / N) | 0;
        if (p.kind === 'pillar') {
          items.push({ key: depthKey(x, z), y: p.bottom, draw: () => block(x + p.x0, z + p.z0, x + p.x1, z + p.z1, [p.top, p.top, p.top, p.top], p.bottom, [120, 112, 104]) });
          continue;
        }
        const style = p.run?.style, wood = p.kind === 'bridge' && style !== 'stone';
        const color = wood ? (style === 'iron' ? [96, 102, 110] : [150, 102, 60]) : [176, 168, 154];
        const top = [runY(p, 0, 0), runY(p, 1, 0), runY(p, 0, 1), runY(p, 1, 1)];
        const bottom = p.kind === 'bridge' ? Math.min(...top) - 0.2 : Math.max(p.base ?? 0, Math.min(...top) - 3);
        items.push({ key: depthKey(x, z), y: bottom + 0.01, draw: () => block(x + 0.04, z + 0.04, x + 0.96, z + 0.96, top, bottom, color) });
      }
    });
    items.sort((a, b) => a.key - b.key || a.y - b.y);
    for (const it of items) it.draw();
    // portals: gates on the sides, the well down (gold) and the ring up (cyan)
    for (const p of m.portals) {
      const [x, y] = P(p.x + 0.5, p.z + 0.5, p.y);
      const col = p.dir === 4 ? '#ffc94a' : p.dir === 5 ? '#5fd3ff' : '#ffc94a';
      g.strokeStyle = col; g.lineWidth = 3;
      g.beginPath(); g.ellipse(x, y, 13, 6.5, 0, 0, 7); g.stroke();
      if (p.dir < 4) { g.fillStyle = col; g.fillRect(x - 2, y - 26, 4, 24); }
      else { g.fillStyle = col + '44'; g.fillRect(x - 8, y - 60, 16, 60); }
    }
    // the route the generator planned through the cube
    if ($('.route').checked) for (const pts of m.routes || []) {
      if (pts.length < 2) continue;
      g.strokeStyle = '#ff6ad5'; g.lineWidth = 2.5; g.setLineDash([6, 4]);
      g.beginPath(); pts.forEach((q, i) => { const [x, y] = P(q.x, q.z, q.y); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      g.setLineDash([]);
    }
    const roomName = last.role ? last.role.replace(/-/g, ' ') : tr('room', 'Raum');
    out.innerHTML = `${tr('cube', 'Würfel')} <b>${last.k}</b> \u00B7 ${tr('depth', 'Tiefe')} ${d}: <b>${themeLabel(theme)}</b> \u00B7 ${roomName} ${last.i + 1} ${tr('of', 'von')} ${last.n}\n`
      + `${tr('land', 'Land')}: <b>${m.kind}</b> \u00B7 ${tr('shape', 'Form')}: <b>${m.archetype || 'town'}</b> \u00B7 ${tr('layers', 'Ebenen')}: <b>${m.K}</b> \u00B7 `
      + (last.fresh ? tr(`built in <b>${last.ms.toFixed(0)} ms</b>`, `gebaut in <b>${last.ms.toFixed(0)} ms</b>`) + (m.attempts ? tr(` on try number <b>${m.attempts}</b>`, ` beim <b>${m.attempts}.</b> Versuch`) : '')
        : tr('already built (the world remembers its cubes)', 'schon gebaut (die Welt merkt sich ihre Würfel)'));
  }

  $('.build').onclick = build;
  $('.dice').onclick = () => { $('.seed').value = 1 + Math.floor(Math.random() * 99999); build(); };
  $('.turn').onclick = () => { rot = (rot + 1) % 4; if (last) draw(); };
  $('.route').onchange = () => last && draw();
  for (const s of ['.depth', '.room', '.seed']) $(s).onchange = build;
  $('.room').oninput = build;
  build();
}
