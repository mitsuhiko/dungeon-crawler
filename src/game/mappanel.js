// The Map tab of the inventory (game/inventory.js has the panel and its tabs; M opens it, a click or
// a tap on the minimap too; docs/map.md). One depth at a time, north up: every cube explored there
// (what the minimap knows: game/minimap.js) as a picture of its ground from above (game/mapdraw.js),
// the ways between them (open faces green, portals gold to somewhere new, cyan explored, red locked,
// the wells and rings), where nobody has been yet past a portal a ghost of a cube, the boss of the
// way down, the town portal, the quest followed, the rune stones (woken: amber, asleep: teal), and
// where the hero and the friends are.
//
// Down its left side the depths reached (the town first), to go through them; on the right what the
// cube under the pointer (or the one chosen) is and what is there, else the depth's rune stones.
// Dragging pans, the wheel or a pinch zooms, ⌖ comes back to the hero. A woken rune stone travels
// there (game/runestones.js travelTo): a click on it with the mouse, on a touch screen a tap chooses
// it and a second tap (or its Travel button) goes. The world stays paused meanwhile (the inventory
// is open), and the panel keeps its size (style.css: it lies over the bag, the quests ...).
import { N } from '../core/constants.js';
import { parse } from '../world/coords.js';
import { isInterior, isTown } from '../world/town.js';
import { isTestRoom } from '../world/testrooms.js';
import { isFaceOpen } from '../core/boundaries.js';
import { gateLocked, portalLocked, guardianName } from '../core/guardians.js';
import { trialGate, TRIALS } from '../core/trials.js';
import { clueOf } from '../core/questplan.js';
import { landmarkName } from '../core/quests.js';
import { runestonesIn, wokenAt, runeCube } from '../core/runestones.js';
import { step } from '../world/coords.js';
import { state, player } from './state.js';
import { truePosition } from './travel.js';
import { online, playerColor, together } from '../net/online.js';
import { followedQuest } from './questpanel.js';
import { questTarget } from './questworld.js';
import { guardianKind } from './enemyspawn.js';
import { travelTo, travelBlock, stoneOf } from './runestones.js';
import { thumbOf, cutSquare, gem, tri, crown, arrow, pin, COLORS } from './mapdraw.js';
import { DISPLAY, BODY } from '../render/fonts.js';
import { tr, say, onLanguageChange } from '../i18n/i18n.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const canvas = $('map-canvas'), g = canvas.getContext('2d'), tip = $('map-tip');
const MIN_S = 26, MAX_S = 260, FIT_S = 56;   // px a cube: the least and the most, the least a depth is fitted at (its cubes still legible)
const REFRESH = 250;             // ms between pictures while nothing moves (the friends, the hero's arrow)

// view: the depth shown, its centre (cubes) and px a cube; chosen / hovered: { key, stone? } on it
const view = { depth: null, cx: 0, cz: 0, s: 80, fitted: false };
let chosen = null, hovered = null, drawnAt = 0, dirty = true, listSig = '', detailSig = '', open = false;
onLanguageChange(() => { listSig = detailSig = ''; dirty = true; });
const redraw = () => { dirty = true; };

// --- what the map knows ---------------------------------------------------------------------------

const W = () => state.cubes;
const depthOfKey = k => -parse(k)[1];
// the explored cubes of depth d (not the houses, nor the dev test rooms)
function explored(d) {
  const out = [];
  for (const c of W()?.cubes.values() ?? []) if (c.visits && !isInterior(c.key) && !isTestRoom(c.key) && depthOfKey(c.key) === d) out.push(c);
  return out;
}
// the depths reached: those with a cube explored, and the one we are in
export function depthsReached() {
  const ds = new Set();
  for (const c of W()?.cubes.values() ?? []) if (c.visits && !isInterior(c.key) && !isTestRoom(c.key)) ds.add(depthOfKey(c.key));
  const here = hereKey();
  if (here) ds.add(depthOfKey(here));
  return [...ds].sort((a, b) => a - b);
}
// the cube we are in on the map (in a house: the town's tile its door is in)
const hereKey = () => !state.cubeKey ? null : isInterior(state.cubeKey) ? state.map?.interior?.outside ?? null : isTestRoom(state.cubeKey) ? null : state.cubeKey;
// where we stand, in cubes on the map, and which way we face
function hereAt() {
  const k = hereKey();
  if (!k) return null;
  const [X, , Z] = parse(k), inside = state.map?.interior;
  if (inside) {
    const door = W().cubes.get(k)?.map.doors?.find(d => d.building === inside.building);
    return { k, x: X + (door ? door.x / N : 0.5), z: Z + (door ? door.z / N : 0.5), yaw: NaN };
  }
  const me = truePosition();
  return { k, x: X + me.x / N, z: Z + me.z / N, yaw: player.yaw };
}
// the friends on depth d: [{ x, z, yaw, color, name }]
function friendsOn(d) {
  return online.buddies.filter(b => b.cube && !isInterior(b.cube) && depthOfKey(b.cube) === d).map(b => {
    const [X, , Z] = parse(b.cube);
    return { x: X + b.x / N, z: Z + b.z / N, yaw: b.yaw, color: playerColor(b.slot), name: b.name, key: b.cube };
  });
}
// the rune stones placed in the explored cubes of depth d: [{ s, key, x, z, awake }]
function stonesOn(cubes) {
  const out = [];
  for (const c of cubes) {
    const [X, , Z] = parse(c.key);
    for (const s of runestonesIn(c.map)) out.push({ s, id: s.id, key: c.key, x: X + s.anchor.x / N, z: Z + s.anchor.z / N, awake: state.run.runes.has(s.id) });
  }
  return out;
}

// --- the picture ----------------------------------------------------------------------------------

// canvas px <-> cubes
const size = () => ({ w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 });
const toScreen = (x, z) => { const { w, h } = size(); return [w / 2 + (x - view.cx) * view.s, h / 2 + (z - view.cz) * view.s]; };
const toMap = (px, py) => { const { w, h } = size(); return [view.cx + (px - w / 2) / view.s, view.cz + (py - h / 2) / view.s]; };

// fit the depth's explored cubes into the view (centred on the hero, if here)
function fit() {
  const cubes = explored(view.depth), { w, h } = size();
  if (!cubes.length) { view.cx = view.cz = 0.5; view.s = 80; return; }
  const xs = cubes.map(c => parse(c.key)[0]), zs = cubes.map(c => parse(c.key)[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
  view.s = Math.max(FIT_S, Math.min(MAX_S * 0.6, Math.min(w / (x1 - x0 + 1.2), h / (z1 - z0 + 1.2))));
  view.cx = (x0 + x1) / 2; view.cz = (z0 + z1) / 2;
  const me = hereAt();
  if (me && depthOfKey(me.k) === view.depth) {
    // (the hero kept in view: the middle moved towards them as far as it takes)
    const mx = (w / 2 - 40) / view.s, mz = (h / 2 - 40) / view.s;
    view.cx = Math.min(me.x + mx, Math.max(me.x - mx, view.cx)); view.cz = Math.min(me.z + mz, Math.max(me.z - mz, view.cz));
  }
  view.fitted = true;
}

function draw() {
  const { w, h } = size(), dpr = Math.min(3, Math.max(1, devicePixelRatio || 1));
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!W() || view.depth === null) return;
  if (!view.fitted) fit();
  const d = view.depth, cubes = explored(d), S = view.s, run = state.run, keys = new Set(cubes.map(c => c.key));
  const gap = Math.max(2, S * 0.035), cut = Math.max(3, S * 0.09);
  // the well's floor: a faint lattice where cubes could be
  g.strokeStyle = 'rgba(134,224,210,.05)'; g.lineWidth = 1;
  const [ax, az] = toMap(0, 0), [bx, bz] = toMap(w, h);
  for (let x = Math.floor(ax); x <= Math.ceil(bx); x++) { const [sx] = toScreen(x, 0); g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, h); g.stroke(); }
  for (let z = Math.floor(az); z <= Math.ceil(bz); z++) { const [, sz] = toScreen(0, z); g.beginPath(); g.moveTo(0, sz); g.lineTo(w, sz); g.stroke(); }
  // the cubes past a portal nobody has been to: ghosts
  const ghosts = new Set();
  for (const c of cubes) c.info?.faces?.slice(0, 4).forEach((f, dir) => { const n = step(c.key, dir); if (f?.portal && !keys.has(n)) ghosts.add(n); });
  for (const k of ghosts) {
    const [X, , Z] = parse(k), [sx, sz] = toScreen(X, Z);
    g.save(); cutSquare(g, sx + gap, sz + gap, S - 2 * gap, cut);
    g.fillStyle = 'rgba(24,32,31,.45)'; g.fill();
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(134,224,210,.25)'; g.lineWidth = 1; g.stroke(); g.restore();
    if (S > 44) { g.fillStyle = 'rgba(152,170,165,.5)'; g.font = `${Math.round(Math.min(26, S * 0.28))}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', sx + S / 2, sz + S / 2); }
  }
  // the cubes: their ground, cut like stones, lit on the top left edge
  g.imageSmoothingEnabled = S < N * 4 * 0.75;
  for (const c of cubes) {
    const [X, , Z] = parse(c.key), [sx, sz] = toScreen(X, Z);
    if (sx > w || sz > h || sx + S < 0 || sz + S < 0) continue;
    g.save(); cutSquare(g, sx + gap, sz + gap, S - 2 * gap, cut); g.clip();
    g.drawImage(thumbOf(c.map, c.info?.kind), sx + gap, sz + gap, S - 2 * gap, S - 2 * gap);
    // (light from the top left over it)
    const lit = g.createLinearGradient(sx, sz, sx + S, sz + S);
    lit.addColorStop(0, 'rgba(216,246,240,.10)'); lit.addColorStop(0.5, 'rgba(0,0,0,0)'); lit.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = lit; g.fillRect(sx, sz, S, S);
    g.restore();
    cutSquare(g, sx + gap + 0.5, sz + gap + 0.5, S - 2 * gap - 1, cut);
    const edge = g.createLinearGradient(sx, sz, sx, sz + S);
    edge.addColorStop(0, '#6b968d'); edge.addColorStop(1, '#1f2b29');
    g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
  }
  g.imageSmoothingEnabled = true;
  // the ways: open faces across the gap, portals on their face, rings and wells where they stand
  const marks = [];
  for (const c of cubes) {
    const [X, , Z] = parse(c.key), [sx, sz] = toScreen(X, Z), faces = c.info?.faces ?? [];
    for (let dir = 0; dir < 4; dir++) {
      const f = faces[dir], at = t => [[sx + S, sz + t * S], [sx, sz + t * S], [sx + t * S, sz + S], [sx + t * S, sz]][dir];
      if (isFaceOpen(state.openedFaces, c.key, dir)) {
        const [x, y] = at(0.5), r = S * 0.36;
        g.fillStyle = COLORS.open; g.globalAlpha = 0.85;
        if (dir < 2) g.fillRect(x - gap * 1.2, y - r, gap * 2.4, 2 * r); else g.fillRect(x - r, y - gap * 1.2, 2 * r, gap * 2.4);
        g.globalAlpha = 1;
      } else if (f?.portal) {
        const color = portalLocked(c.map, run, { dir }) ? COLORS.locked : keys.has(step(c.key, dir)) ? COLORS.seen : COLORS.new;
        marks.push(() => { const [x, y] = at((f.portal.pos + 0.5) / N), r = Math.max(4, S * 0.05); g.fillStyle = color; g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.strokeRect(x - r, y - r, 2 * r, 2 * r); });
      }
    }
    for (const p of c.map.portals ?? []) if (p.kind === 'up' || p.kind === 'down') {
      const dir = p.kind === 'down' ? 4 : 5, locked = dir === 4 && gateLocked(c.map, run);
      const color = locked ? COLORS.locked : W().cubes.get(step(c.key, dir))?.visits ? COLORS.seen : COLORS.new;
      const [x, y] = toScreen(X + (p.x + 0.5) / N, Z + (p.z + 0.5) / N), r = Math.max(5, S * 0.06);
      marks.push(() => tri(g, x, y, r, p.kind === 'up', color));
      // the way down's boss: a crown over its well, dim once beaten
      if (p.kind === 'down' && c.map.guardian) marks.push(() => crown(g, x, y - r * 2.2, r * 1.15, locked ? COLORS.ember : '#6f7d79'));
    }
    // a side guardian still standing: a crown in red over its arena
    if (c.map.guardian && c.map.guardian.role === 'side' && gateLocked(c.map, run)) marks.push(() => crown(g, sx + S / 2, sz + S / 2, Math.max(6, S * 0.08), COLORS.locked));
  }
  for (const m of marks) m();
  // the town portal
  const tp = run.townPortal;
  for (const [k, pad] of tp ? [[tp.key, tp.pad], [W().town.portal, W().cubes.get(W().town.portal)?.map.town?.portal]] : []) {
    if (!pad || !keys.has(k)) continue;
    const [X, , Z] = parse(k), [x, y] = toScreen(X + pad.x / N, Z + pad.z / N);
    g.beginPath(); g.arc(x, y, Math.max(4, S * 0.05), 0, Math.PI * 2); g.fillStyle = COLORS.town; g.fill(); g.strokeStyle = COLORS.outline; g.lineWidth = 1.5; g.stroke();
  }
  // the quest followed, where it wants you
  const goal = questTarget(followedQuest());
  if (goal && keys.has(goal.key)) {
    const [X, , Z] = parse(goal.key), [x, y] = toScreen(X + (goal.at ? goal.at.x / N : 0.5), Z + (goal.at ? goal.at.z / N : 0.5));
    if (goal.at) pin(g, x, y, Math.max(6, S * 0.07));
    else { const [sx, sz] = toScreen(X, Z); g.save(); g.setLineDash([5, 4]); g.strokeStyle = COLORS.quest; g.lineWidth = 2; cutSquare(g, sx + gap * 2.5, sz + gap * 2.5, S - gap * 5, cut); g.stroke(); g.restore(); }
  }
  // the rune stones: woken an amber gem glowing, asleep a hollow teal one
  for (const st of stonesOn(cubes)) {
    const [x, y] = toScreen(st.x, st.z), r = Math.max(7, Math.min(14, S * 0.09)), on = chosen?.stone === st.id || hovered?.stone === st.id;
    if (st.awake) gem(g, x, y, r * (on ? 1.2 : 1), { fill: COLORS.ember, glow: on ? 'rgba(255,170,80,.75)' : 'rgba(255,160,64,.45)', stroke: on ? '#fff4e4' : COLORS.outline });
    else gem(g, x, y, r, { fill: 'rgba(14,19,18,.85)', stroke: on ? COLORS.glassHi : COLORS.glass, width: 2 });
  }
  // the cube chosen, and the one under the pointer: amber edges
  for (const [sel, a] of [[hovered, 0.55], [chosen, 1]]) {
    if (!sel?.key || !keys.has(sel.key) && !ghosts.has(sel.key)) continue;
    const [X, , Z] = parse(sel.key), [sx, sz] = toScreen(X, Z);
    g.save(); g.globalAlpha = a; g.strokeStyle = '#ffd6a0'; g.lineWidth = 2; g.shadowColor = '#ffa040'; g.shadowBlur = 10;
    cutSquare(g, sx + gap - 1, sz + gap - 1, S - 2 * gap + 2, cut); g.stroke(); g.restore();
  }
  // the friends, then us on top
  const R = Math.max(7, Math.min(12, S * 0.085));
  for (const f of friendsOn(d)) { const [x, y] = toScreen(f.x, f.z); arrow(g, x, y, f.yaw, R, f.color); }
  const me = hereAt();
  if (me && depthOfKey(me.k) === d) {
    const [x, y] = toScreen(me.x, me.z), mine = together() && online.slot !== null ? playerColor(online.slot) : '#ffffff';
    const halo = g.createRadialGradient(x, y, 0, x, y, R * 2.4);
    halo.addColorStop(0, 'rgba(255,255,255,.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.fillRect(x - R * 3, y - R * 3, R * 6, R * 6);
    arrow(g, x, y, me.yaw, R * 1.15, mine);
  }
  // nothing explored here
  if (!cubes.length) {
    g.fillStyle = COLORS.dim; g.font = `16px ${BODY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(tr('Nothing explored here yet'), w / 2, h / 2);
  }
  // north: a cut stone with the N, top right
  const nx = w - 22, ny = 22;
  g.fillStyle = '#0e1312e6'; g.strokeStyle = '#6b968d'; g.lineWidth = 1; g.beginPath();
  g.moveTo(nx, ny - 11); g.lineTo(nx + 11, ny); g.lineTo(nx, ny + 11); g.lineTo(nx - 11, ny); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = COLORS.ink; g.font = `bold 12px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}

// --- what a cube is -------------------------------------------------------------------------------

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// what cube k (of depth d) is called, and what is there: { title, lines: [[text, color?]], stones: [id] }
function about(k, d) {
  const c = W().cubes.get(k), L = W().layout(d), run = state.run;
  if (!c?.visits) return { title: tr('Not explored yet'), lines: [[tr('A portal leads there: nobody has been through it yet.'), COLORS.dim]], stones: [] };
  const m = c.map, lines = [], [X, , Z] = parse(k);
  let title;
  if (isTown(k, W().seed)) title = tr('The town');
  else if (L.down === k) title = tr('The way down');
  else if (L.guardians?.get(k)?.role === 'side') title = tr("A guardian's arena");
  else if (L.trialCells?.get(k)) title = tr(TRIALS[L.trialCells.get(k).kind]?.name ?? 'Trial');
  else if (L.hordes?.has(k)) title = tr('Where the horde gathers');
  else if (L.up === k) title = tr('Where the depth begins');
  else title = placeOf(k, d);
  const here = hereAt();
  if (here?.k === k) lines.push([isInterior(state.cubeKey) ? tr('You are in a house here') : tr('You are here'), '#ffffff']);
  for (const f of friendsOn(d)) if (f.key === k) lines.push([tr('{name} is here', { name: f.name }), f.color]);
  if (m.guardian) {
    const who = guardianName(m, guardianKind(m));
    lines.push(gateLocked(m, run) ? [tr('{who} guards the way on', { who }), COLORS.locked] : [tr('{who} is beaten: the way is open', { who }), COLORS.seen]);
  }
  const trial = L.trialCells?.get(k);
  if (trial) lines.push(run.unlockedGates.has(trialGate(trial.key)) ? [tr('Its trial is mastered'), COLORS.seen] : [tr('Its trial waits'), COLORS.new]);
  const stones = runestonesIn(m);
  for (const s of stones) lines.push(run.runes.has(s.id) ? [tr('A rune stone, awake: travel here'), COLORS.ember] : [tr('A rune stone, asleep: press it to wake it'), COLORS.glass]);
  const chests = (m.rewardSites ?? []).filter(s => s.spawn === 'treasure' || s.prestige);
  if (chests.length) lines.push([tr('Treasure chests opened: {n} of {all}', { n: chests.filter(s => run.chests.has(s.id)).length, all: chests.length })]);
  if (run.townPortal && (run.townPortal.key === k || W().town.portal === k)) lines.push([tr('The town portal stands here'), COLORS.town]);
  const goal = questTarget(followedQuest());
  if (goal?.key === k) lines.push([tr('The quest you follow wants you here'), COLORS.quest]);
  const ways = (c.info?.faces ?? []).filter(f => f?.portal).length;
  if (ways) lines.push([tr('Ways out: {n}', { n: ways }), COLORS.dim]);
  lines.push([tr('cube {x}, {z}   depth {depth}', { x: X, z: Z, depth: d }), COLORS.dim]);
  return { title, lines, stones: stones.filter(s => run.runes.has(s.id)).map(s => s.id) };
}
const depthLabel = d => d === 0 ? tr('The town') : tr('Depth {depth}', { depth: d });
const themeLabel = d => { try { return d === 0 ? tr('and the road out of it') : tr(W().layout(d).theme.name); } catch { return ''; } };
// a cube's place, in words (core/questplan.js clueOf; a set piece's room by its foot: its stone,
// its chests are not up on it)
function placeOf(k, d) {
  const L = W().layout(d);
  if (k === L.peak) return tr('By the lone peak');
  if (k === L.pinnacle) return tr('By the needle of rock');
  return cap(say(clueOf(W().layout, { depth: d, key: k, id: null }, landmarkName)));
}
const stonePlace = id => placeOf(runeCube(id), depthOfKey(runeCube(id)));

// --- the panel ------------------------------------------------------------------------------------

function drawList() {
  const ds = depthsReached(), here = hereKey() ? depthOfKey(hereKey()) : null, run = state.run;
  const sig = `${ds}:${view.depth}:${here}:${[...run.runes].length}`;
  if (sig === listSig) return;
  listSig = sig;
  const focus = document.activeElement?.dataset?.depth;
  $('map-depths').innerHTML = ds.map(d => {
    const all = d ? W().layout(d).runestones?.length ?? 0 : 0, woken = wokenAt(run.runes, d).length;
    const marks = all ? `<span class="map-runes" aria-label="${esc(tr('{n} of {all} rune stones awake', { n: woken, all }))}">${'◆'.repeat(woken)}${'◇'.repeat(all - woken)}</span>` : '';
    return `<button data-depth="${d}" role="tab" aria-selected="${d === view.depth}"${d === here ? ' class="here"' : ''}>`
      + `<b>${esc(depthLabel(d))}</b><small>${esc(themeLabel(d))}</small>${marks}</button>`;
  }).join('');
  if (focus != null) $('map-depths').querySelector(`[data-depth="${focus}"]`)?.focus();
}

function drawDetails() {
  const sel = hovered ?? chosen, run = state.run, d = view.depth;
  const sig = `${sel?.key}:${sel?.stone}:${chosen?.key}:${d}:${[...run.runes]}:${hereKey()}:${online.buddies.map(b => b.cube)}:${travelBlock()}`;
  if (sig === detailSig) return;
  detailSig = sig;
  const why = travelBlock();
  const go = id => `<button class="main map-go" data-travel="${esc(id)}"${why ? ` disabled title="${esc(why)}"` : ''}>${esc(tr('Travel there'))}</button>`;
  let html;
  if (sel?.key) {
    const a = about(sel.key, d);
    html = `<h2>${esc(a.title)}</h2>` + a.lines.map(([t, color]) => `<p class="map-line"${color ? ` style="color:${color}"` : ''}>${esc(t)}</p>`).join('')
      + (a.stones.length ? `<div class="quest-actions">${go(a.stones[0])}</div>` : '');
  } else {
    // (a stone's cube not made here yet still counts: travelling makes it)
    const woken = wokenAt(run.runes, d).filter(id => stoneOf(id) || !W().cubes.has(runeCube(id))), all = d ? W().layout(d).runestones?.length ?? 0 : 0;
    html = `<h2>${esc(depthLabel(d))}</h2><div class="quest-meta">${esc(themeLabel(d))}</div>`
      + `<p class="map-line">${esc(tr('Rooms explored: {n}', { n: explored(d).length }))}</p>`
      + (d ? `<p class="map-line">${esc(tr('Rune stones awake: {n} of {all}', { n: woken.length, all }))}</p>` : '')
      + (woken.length ? `<h3>${esc(tr('Travel to a rune stone'))}</h3>` + woken.map(id => `<div class="map-stone"><span>${esc(stonePlace(id))}</span>${go(id)}</div>`).join('')
        : d ? `<p class="quest-text">${esc(tr('Rune stones stand on every depth, often guarded. Press one to wake it, and travel back to it from this map.'))}</p>` : '')
      + `<p class="quest-text map-help">${esc(tr('Drag to look around, the wheel or two fingers zoom. A cube says what is there.'))}</p>`;
  }
  if (why && (sel?.stone || chosen?.stone)) html += `<p class="map-line" style="color:${COLORS.locked}">${esc(why)}</p>`;
  $('map-details-inner').innerHTML = html;
}

// show depth d (null: where the hero is)
export function showMapDepth(d = null, stone = null) {
  const ds = depthsReached();
  const here = hereKey() ? depthOfKey(hereKey()) : ds[0] ?? 0;
  view.depth = d ?? here;
  view.fitted = false; chosen = stone ? { key: runeCube(stone), stone } : null; hovered = null;
  listSig = detailSig = ''; dirty = true;
}
// the tab came to the front (game/inventory.js)
export function openMap(d = null, stone = null) { open = true; showMapDepth(d, stone); }
export function closeMap() { open = false; hovered = null; tip.hidden = true; }

// every frame while the tab is in front (game/inventory.js updateInventory)
export function drawMap() {
  if (!state.run || !W()) return;
  if (view.depth === null) showMapDepth();
  drawList(); drawDetails();
  const now = performance.now();
  if (!dirty && now - drawnAt < REFRESH) return;
  dirty = false; drawnAt = now;
  draw();
}

function travel(id) {
  const why = travelBlock();
  if (why) { detailSig = ''; return false; }
  hooks.close?.();
  return travelTo(id);
}
// game/inventory.js: how the panel closes (before travelling)
export const hooks = { close: null };

// --- pointing -------------------------------------------------------------------------------------

// what is at (px, py) on the canvas: { key, stone? } (a cube explored or a ghost, a stone on it)
function pick(px, py) {
  if (view.depth === null) return null;
  const cubes = explored(view.depth), r = Math.max(12, Math.min(18, view.s * 0.12));
  let best = null, bd = r;
  for (const st of stonesOn(cubes)) {
    const [x, y] = toScreen(st.x, st.z), dd = Math.hypot(x - px, y - py);
    if (dd < bd) { bd = dd; best = { key: st.key, stone: st.id, awake: st.awake }; }
  }
  if (best) return best;
  const [mx, mz] = toMap(px, py), X = Math.floor(mx), Z = Math.floor(mz);
  const k = cubes.find(c => { const [x, , z] = parse(c.key); return x === X && z === Z; })?.key;
  if (k) return { key: k };
  // a ghost: past a portal of an explored cube
  for (const c of cubes) for (let dir = 0; dir < 4; dir++) if (c.info?.faces?.[dir]?.portal) {
    const n = step(c.key, dir), [x, , z] = parse(n);
    if (x === X && z === Z) return { key: n, ghost: true };
  }
  return null;
}
const local = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.clientWidth / (r.width || 1), (e.clientY - r.top) * canvas.clientHeight / (r.height || 1)]; };
function zoomAt(px, py, k) {
  const [mx, mz] = toMap(px, py);
  view.s = Math.max(MIN_S, Math.min(MAX_S, view.s * k));
  const [ax, az] = toMap(px, py);
  view.cx += mx - ax; view.cz += mz - az;
  dirty = true;
}
function showTip(p, px, py) {
  if (!p) { tip.hidden = true; return; }
  const a = about(p.key, view.depth);
  tip.textContent = p.stone ? (p.awake ? tr('Rune stone: click to travel there') : tr('Rune stone, asleep')) : a.title;
  tip.hidden = false;
  const { w } = size();
  tip.style.left = `${Math.min(px + 14, w - tip.offsetWidth - 4)}px`; tip.style.top = `${Math.max(4, py - 30)}px`;
}

const touches = new Map();   // pointer id -> [x, y]
let press = null, pinch = null;   // press: { id, x, y, moved, type }; pinch: { d, s, cx, cz }
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* (a pointer no longer down) */ }
  const at = local(e);
  touches.set(e.pointerId, at);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: view.s }; press = null;
  } else if (touches.size === 1) press = { id: e.pointerId, x: at[0], y: at[1], moved: false, type: e.pointerType, cx: view.cx, cz: view.cz };
});
canvas.addEventListener('pointermove', e => {
  const at = local(e);
  if (touches.has(e.pointerId)) touches.set(e.pointerId, at);
  if (pinch && touches.size === 2) {
    const [a, b] = [...touches.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch.s * dd / pinch.d / view.s);
    return;
  }
  if (press && press.id === e.pointerId) {
    const dx = at[0] - press.x, dy = at[1] - press.y;
    if (!press.moved && Math.hypot(dx, dy) > 6) press.moved = true;
    if (press.moved) { view.cx = press.cx - dx / view.s; view.cz = press.cz - dy / view.s; dirty = true; tip.hidden = true; canvas.classList.add('dragging'); }
    return;
  }
  if (e.pointerType === 'mouse') {
    const p = pick(...at);
    if (p?.key !== hovered?.key || p?.stone !== hovered?.stone) { hovered = p; dirty = true; }
    showTip(p, ...at);
    canvas.style.cursor = p?.stone && p.awake ? 'pointer' : '';
  }
});
function release(e) {
  const was = press;
  touches.delete(e.pointerId);
  canvas.classList.remove('dragging');
  if (touches.size < 2) pinch = null;
  if (!was || was.id !== e.pointerId) return;
  press = null;
  if (was.moved || e.type === 'pointercancel') return;
  const p = pick(...local(e));
  const again = p && chosen && p.key === chosen.key && p.stone === chosen.stone;
  // a woken stone: the mouse goes at once, a touch at the second tap
  if (p?.stone && p.awake && (was.type === 'mouse' || again)) { travel(p.stone); return; }
  chosen = p; hovered = was.type === 'mouse' ? p : null; dirty = true; detailSig = '';
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hovered = null; tip.hidden = true; dirty = true; } });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(...local(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
canvas.addEventListener('keydown', e => {
  const step = 60 / view.s;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.code]) { view.cx += moves[e.code][0]; view.cz += moves[e.code][1]; dirty = true; e.preventDefault(); e.stopPropagation(); }
  else if (e.key === '+' || e.key === '=') { const { w, h } = size(); zoomAt(w / 2, h / 2, 1.25); e.preventDefault(); }
  else if (e.key === '-') { const { w, h } = size(); zoomAt(w / 2, h / 2, 0.8); e.preventDefault(); }
});
$('map-zoom').addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]');
  if (!b) return;
  const { w, h } = size();
  if (b.dataset.zoom === 'in') zoomAt(w / 2, h / 2, 1.3);
  else if (b.dataset.zoom === 'out') zoomAt(w / 2, h / 2, 1 / 1.3);
  else {   // back to the hero (on their depth)
    const me = hereAt();
    if (me) { if (depthOfKey(me.k) !== view.depth) showMapDepth(depthOfKey(me.k)); fit(); view.cx = me.x; view.cz = me.z; dirty = true; }
  }
});
$('map-depths').addEventListener('click', e => {
  const b = e.target.closest('[data-depth]');
  if (b) showMapDepth(Number(b.dataset.depth));
});
$('map-details').addEventListener('click', e => {
  const b = e.target.closest('[data-travel]');
  if (b && !b.disabled) travel(b.dataset.travel);
});
new ResizeObserver(redraw).observe(canvas);

// tests/browser/map.js
export const mapView = () => ({ ...view, chosen, hovered, open });
export const mapPick = pick;
export const mapScreen = toScreen;
export { stoneOf };
