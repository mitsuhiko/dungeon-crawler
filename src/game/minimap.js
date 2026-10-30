// Overview of the cubes visited at the current depth: a map centred on the player that turns with
// the camera (what is ahead on screen is up on the map; the "N" on the rim is north, -z), in an
// upright octagon of glass (a cut stone, like the menus: docs/ui.md). Cubes are coloured by their WFC tile; edges show rivers (blue) and portals (gold: leads
// somewhere new, cyan: explored; ringed in a trial's colour: into a trial room); triangles are wells / rings; a violet dot is the open town
// portal. Each player is an arrow pointing where they face, in their colour (ours is white when
// playing alone). The quest followed (game/questpanel.js followedQuest) shows in gold where it
// wants you, once that cube has been visited (game/questworld.js questTarget): a pin on the person
// or cart, a dashed frame round the cube when the place has to be looked for, an arrow on the rim
// when it is off the map. Wherever the goal is (questWay), an arrow on the gate of our cube that
// leads towards it: out through a portal or an open face, or on the way down or up. Inside a house it shows the cube outside, centred on the house's door. Below:
// the cube we are in and its depth. Asked for every frame (main.js), drawn when the camera or a
// player moved, else REFRESH times a second (for the rest: faces opening, portals, friends' lines).
import { KIND_COLOR } from '../world/tiles.js';
import { key, parse, step } from '../world/coords.js';
import { state, player, view } from './state.js';
import { isFaceOpen } from '../core/boundaries.js';
import { gateLocked, portalLocked } from '../core/guardians.js';
import { N } from '../core/constants.js';
import { isInterior } from '../world/town.js';
import { online, playerColor, together } from '../net/online.js';
import { truePosition } from './travel.js';
import { followedQuest } from './questpanel.js';
import { questTarget, questWay } from './questworld.js';
import { warnedFace } from './trials.js';
import { TRIALS } from '../core/trials.js';
import { DISPLAY, BODY } from '../render/fonts.js';
import { tr } from '../i18n/i18n.js';
import { uiScale } from './uiscale.js';
import { minimapSize } from './settings.js';

// R: the map's radius in cubes; REACH: the cubes around ours that can show inside it
const R = 3.5, CELL = 24, PAD = 6, SIZE = 2 * R * CELL + PAD * 2, C = SIZE / 2, REACH = Math.ceil(R + 0.5);
// drawn in CSS pixels, its backing store in device pixels (sharp on high-DPI screens, and at any
// UI scale); the stylesheet gives its width, the height follows the canvas's proportions
const canvas = Object.assign(document.createElement('canvas'), { id: 'minimap', width: SIZE, height: SIZE + 42 });
document.body.appendChild(canvas);
const g = canvas.getContext('2d');
const OUTLINE = '#0b0c0d', QUEST = '#ffd34a', TEXT = '#98aaa5';
// the octagon: its corners RIM from the centre, its sides APO (the map's edge, for what is on it)
const RIM = C - 1, APO = RIM * Math.cos(Math.PI / 8);
const REFRESH = 4;
let drawn = '', drawnAt = -Infinity, drawnScale = 0;   // what the map showed last, when (ms), at what pixel ratio

function octagon(r = RIM) {
  g.beginPath();
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(C + r * Math.cos(a), C + r * Math.sin(a)); }
  g.closePath();
}
// how far the octagon's edge is from the centre in the direction a (radians)
const reach = a => APO / Math.max(...[0, 1, 2, 3].map(k => Math.abs(Math.cos(a - k * Math.PI / 4))));
// a point on the canvas at least `margin` inside the octagon
const onMap = ([x, y], margin = 0) => Math.hypot(x - C, y - C) <= reach(Math.atan2(y - C, x - C)) - margin;

// a point on edge d of the cell at (px, pz), t in [0,1] along it
const edgePt = (px, pz, d, t) => [[px + CELL, pz + t * CELL], [px, pz + t * CELL], [px + t * CELL, pz + CELL], [px + t * CELL, pz]][d];

// The map is drawn in a turned frame: pixels from the centre, x east and y south as in the
// world. screen() takes a point in it to the canvas, where symbols are drawn upright.
let cos = 1, sin = 0;
const screen = (x, y) => [C + x * cos - y * sin, C + x * sin + y * cos];

function tri([x, y], up, color) {
  g.fillStyle = color; g.beginPath();
  g.moveTo(x - 4, y + (up ? 3 : -3)); g.lineTo(x + 4, y + (up ? 3 : -3)); g.lineTo(x, y + (up ? -4 : 4)); g.fill();
}
function dot([x, y], r, color, outline = null) {
  g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  if (outline) { g.strokeStyle = outline; g.lineWidth = 1.5; g.stroke(); }
}
// a player at [x, y] (canvas) facing `yaw` (world: towards sin, cos)
function arrow([x, y], yaw, color) {
  if (!Number.isFinite(yaw)) { dot([x, y], 4, color, OUTLINE); return; }
  const [fx, fy] = [Math.sin(yaw) * cos - Math.cos(yaw) * sin, Math.sin(yaw) * sin + Math.cos(yaw) * cos];
  const at = (f, s) => [x + fx * f - fy * s, y + fy * f + fx * s];   // f along the facing, s to its side
  g.fillStyle = color; g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath();
  g.moveTo(...at(7, 0)); g.lineTo(...at(-5, 5)); g.lineTo(...at(-2, 0)); g.lineTo(...at(-5, -5)); g.closePath();
  g.fill(); g.stroke();
}
// the quest's pin: a diamond
function pin([x, y]) {
  g.fillStyle = QUEST; g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath();
  g.moveTo(x, y - 6); g.lineTo(x + 4.5, y); g.lineTo(x, y + 6); g.lineTo(x - 4.5, y); g.closePath();
  g.fill(); g.stroke();
}
// the quest's arrow: centred on [x, y] (canvas), pointing along [fx, fy] (a unit vector)
function pointer([x, y], [fx, fy]) {
  const at = (f, s) => [x + fx * f - fy * s, y + fy * f + fx * s];
  g.fillStyle = QUEST; g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.lineJoin = 'round'; g.beginPath();
  g.moveTo(...at(6, 0)); g.lineTo(...at(-5, 6)); g.lineTo(...at(-5, -6)); g.closePath();
  g.fill(); g.stroke();
}
// the quest off the map: an arrow on the rim towards [x, y] (canvas)
function rimArrow([x, y]) {
  const a = Math.atan2(y - C, x - C), r = reach(a) - 8, fx = Math.cos(a), fy = Math.sin(a);
  pointer([C + fx * r, C + fy * r], [fx, fy]);
}

// a friend's place on this map (turned frame), or null (another depth, in a house, far away);
// cx, cz: the map's centre in cubes
function spot(b, cx, Y, cz) {
  if (isInterior(b.cube)) return null;
  const [bx, by, bz] = parse(b.cube), u = bx + b.x / N - cx, v = bz + b.z / N - cz;
  return by === Y && onMap(screen(u * CELL, v * CELL), 4) ? [u * CELL, v * CELL] : null;
}
// where a friend is when not on this map
function whereabouts(b, Y) {
  const by = isInterior(b.cube) ? NaN : parse(b.cube)[1];
  return isInterior(b.cube) ? tr('in a house') : by === Y ? tr('far away') : tr('depth {depth}', { depth: -by });
}

export function drawMinimap() {
  const inside = state.map?.interior, W = state.cubes, size = minimapSize();
  if (!W || !state.cubeKey || !size) return;   // (hidden: the settings)
  const [X0, Y, Z0] = parse(inside ? inside.outside : state.cubeKey);
  // the centre: where we stand, in a house its door outside
  const door = inside && W.cubes.get(inside.outside)?.map.doors?.find(d => d.building === inside.building);
  const me = truePosition();
  // the same view as last time (to half a pixel), and drawn not long ago: nothing to do
  const px = v => Math.round(v / N * CELL * 2);
  const seen = [state.cubeKey, px(me.x), px(me.z), Math.round((view.yaw + view.roll) * 200), Math.round(player.yaw * 20),
    ...online.buddies.map(b => `${b.cube} ${px(b.x)} ${px(b.z)} ${Math.round(b.yaw * 20)}`)].join('|');
  const now = performance.now();
  const scale = Math.min(Math.max(devicePixelRatio || 1, 1), 3) * uiScale() * size;   // (style.css zooms it by the UI scale, and sizes it by the settings)
  if (seen === drawn && scale === drawnScale && now - drawnAt < 1000 / REFRESH) return;
  drawn = seen; drawnAt = now; drawnScale = scale;
  const fx = inside ? (door ? door.x / N : 0.5) : me.x / N, fz = inside ? (door ? door.z / N : 0.5) : me.z / N;
  const cx = X0 + fx, cz = Z0 + fz;
  // (the world rolled on the screen, game/roll.js: the map rolls with it)
  const turn = view.yaw + view.roll;
  cos = Math.cos(turn); sin = Math.sin(turn);
  const visited = k => !!W.cubes.get(k)?.visits;
  const tp = state.run.townPortal, friends = online.buddies.filter(b => b.cube), away = friends.filter(b => !spot(b, cx, Y, cz));
  // a line of text under the map each: the cube and depth, being in a house, the town portal,
  // each friend off the map
  const lines = [[tr('cube {x}, {z}   depth {depth}', { x: X0, z: Z0, depth: -Y }), TEXT]];
  if (inside) lines.push([tr('in a house'), TEXT]);
  if (tp) lines.push([tr('portal open: depth {depth}', { depth: tp.depth }), '#c9a8ff']);
  for (const b of away) lines.push([tr('{name}: {where} (F: go)', { name: b.name, where: whereabouts(b, Y) }), playerColor(b.slot)]);
  const height = SIZE + 14 * lines.length;
  const w = Math.round(SIZE * scale), h = Math.round(height * scale);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.clearRect(0, 0, SIZE, height);
  // the glass: darker away from the light (top left); under the map a plate for the lines, its
  // lower right corner cut
  const face = g.createLinearGradient(0, 0, SIZE, SIZE);
  face.addColorStop(0, '#1a2422bf'); face.addColorStop(1, '#0a0e0db3');
  g.fillStyle = face; octagon(); g.fill();
  g.fillStyle = '#0e1312b3'; g.beginPath();
  g.moveTo(0, SIZE); g.lineTo(SIZE, SIZE); g.lineTo(SIZE, height - 6); g.lineTo(SIZE - 6, height); g.lineTo(0, height); g.closePath(); g.fill();
  const line = g.createLinearGradient(0, 0, SIZE, 0);
  line.addColorStop(0, '#3b4f4b'); line.addColorStop(1, '#3b4f4b00');
  g.fillStyle = line; g.fillRect(0, SIZE, SIZE, 1);
  // the cubes, turned with the camera and cut to the circle; the marks on them come after,
  // upright (marks: [x, y] in the turned frame, how to draw it)
  const marks = [];
  g.save();
  octagon(); g.clip();
  g.translate(C, C); g.rotate(turn);
  for (let dz = -REACH; dz <= REACH; dz++) for (let dx = -REACH; dx <= REACH; dx++) {
    const k = key(X0 + dx, Y, Z0 + dz), c = W.cubes.get(k);
    if (!c?.visits) continue;
    const t = c.info;
    const px = (dx - fx) * CELL, pz = (dz - fz) * CELL;
    g.fillStyle = KIND_COLOR[t.kind]; g.fillRect(px + 1, pz + 1, CELL - 2, CELL - 2);
    for (let d = 0; d < 4; d++) {
      const f = t.faces[d];
      if (f?.river) { const [x, y] = edgePt(px, pz, d, (f.river.pos + f.river.w / 2) / 16); g.fillStyle = '#2e86de'; g.fillRect(x - 2, y - 2, 4, 4); }
      if (isFaceOpen(state.openedFaces, k, d)) {
        const [x, y] = edgePt(px, pz, d, 0.5);
        g.fillStyle = '#70d6aa';
        if (d < 2) g.fillRect(x - 1, y - CELL / 2 + 3, 2, CELL - 6);
        else g.fillRect(x - CELL / 2 + 3, y - 1, CELL - 6, 2);
      } else if (f?.portal) {
        const color = portalLocked(c.map, state.run, { dir: d }) ? '#ff3547' : visited(step(k, d)) ? '#5fd3ff' : '#ffc94a';
        // into a trial room not resolved yet: a ring of the trial's colour round it (game/trials.js)
        const trial = warnedFace(c.map, d);
        marks.push([edgePt(px, pz, d, (f.portal.pos + 0.5) / 16), ([x, y]) => {
          g.fillStyle = color; g.fillRect(x - 3, y - 3, 6, 6);
          if (trial) { g.strokeStyle = TRIALS[trial].color; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.stroke(); }
        }]);
      }
    }
    for (const d of [4, 5]) if (t.faces[d]?.portal) {
      const color = d === 4 && gateLocked(c.map, state.run) ? '#ff3547' : visited(step(k, d)) ? '#5fd3ff' : '#ffc94a';
      marks.push([[px + CELL / 2 + (d === 4 ? -5 : 5), pz + CELL / 2], at => tri(at, d === 5, color)]);
    }
  }
  // the cube we are in
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(-fx * CELL, -fz * CELL, CELL, CELL);
  // the quest followed: somewhere in a cube, a frame round it (inside, so ours still shows)
  const goal = questTarget(followedQuest()), [gx, gy, gz] = goal ? parse(goal.key) : [];
  const goalAt = goal && gy === Y ? [gx + (goal.at ? goal.at.x / N : 0.5) - cx, gz + (goal.at ? goal.at.z / N : 0.5) - cz] : null;
  const goalOn = goalAt && onMap(screen(goalAt[0] * CELL, goalAt[1] * CELL), 6);
  if (goalOn && !goal.at) {
    g.strokeStyle = QUEST; g.lineWidth = 2; g.setLineDash([4, 3]);
    g.strokeRect((gx - X0 - fx) * CELL + 3, (gz - Z0 - fz) * CELL + 3, CELL - 6, CELL - 6);
    g.setLineDash([]);
  }
  g.restore();
  for (const [at, draw] of marks) {
    const p = screen(...at);
    if (onMap(p, 2)) draw(p);
  }
  // the open town portal: a violet dot where it stands (in town too, at its other end)
  for (const [k, pad] of tp ? [[tp.key, tp.pad], [W.town.portal, W.cubes.get(W.town.portal)?.map.town?.portal]] : []) {
    const [x, y, z] = parse(k);
    if (!pad || y !== Y) continue;
    const u = x + pad.x / N - cx, v = z + pad.z / N - cz;
    const at = screen(u * CELL, v * CELL);
    if (onMap(at, 2)) dot(at, 3.5, '#b98cff');
  }
  // the octagon's edge, lit from above, and a spark where the light meets its upper left corner
  const edge = g.createLinearGradient(0, C - RIM, 0, C + RIM);
  edge.addColorStop(0, '#6b968d'); edge.addColorStop(1, '#1f2b29');
  g.strokeStyle = edge; g.lineWidth = 1; octagon(RIM - 0.5); g.stroke();
  const sx = C + RIM * Math.cos(Math.PI * 11 / 8), sy = C + RIM * Math.sin(Math.PI * 11 / 8);
  const spark = g.createRadialGradient(sx, sy, 0, sx, sy, 16);
  spark.addColorStop(0, '#f2fffcd9'); spark.addColorStop(0.12, '#d8f6f066'); spark.addColorStop(1, '#86e0d200');
  g.save(); octagon(); g.clip(); g.fillStyle = spark; g.fillRect(sx - 16, sy - 16, 32, 32); g.restore();
  // north on the rim: a cut stone with the N
  const na = Math.atan2(-cos, sin), [nx, ny] = [C + Math.cos(na) * (reach(na) - 9), C + Math.sin(na) * (reach(na) - 9)];
  g.fillStyle = '#0e1312e6'; g.strokeStyle = '#6b968d'; g.lineWidth = 1; g.beginPath();
  g.moveTo(nx, ny - 8); g.lineTo(nx + 8, ny); g.lineTo(nx, ny + 8); g.lineTo(nx - 8, ny); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e3ece9'; g.font = `bold 11px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', nx, ny + 0.5);
  g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  // the quest followed: a pin where it wants you, or an arrow on the rim (over the N) when that
  // is off the map
  if (goalOn && goal.at) pin(screen(goalAt[0] * CELL, goalAt[1] * CELL));
  else if (goalAt && !goalOn) rimArrow(screen(goalAt[0] * CELL, goalAt[1] * CELL));
  // the gate of our cube that leads towards it: out through it, or down or up
  const way = questWay(followedQuest(), key(X0, Y, Z0)), faces = W.cubes.get(key(X0, Y, Z0))?.info?.faces;
  if (way !== null && faces) {
    const px = -fx * CELL, pz = -fz * CELL;
    if (way >= 4) pointer(screen(px + CELL / 2 + (way === 4 ? -5 : 5), pz + CELL / 2), [0, way === 4 ? 1 : -1]);
    else {
      // just outside the gate, so that our own arrow does not hide it
      const p = faces[way]?.portal, [ux, uy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][way];
      const [ex, ey] = edgePt(px, pz, way, p && !isFaceOpen(state.openedFaces, key(X0, Y, Z0), way) ? (p.pos + 0.5) / 16 : 0.5);
      pointer(screen(ex + ux * 7, ey + uy * 7), [ux * cos - uy * sin, ux * sin + uy * cos]);
    }
  }
  // the players: the friends here, then us on top (in a house: a dot at its door)
  for (const b of friends) {
    const at = spot(b, cx, Y, cz);
    if (at) arrow(screen(...at), b.yaw, playerColor(b.slot));
  }
  const mine = together() && online.slot !== null ? playerColor(online.slot) : '#fff';
  if (inside) dot([C, C], 4, mine, OUTLINE);
  else arrow([C, C], player.yaw, mine);
  // the lines below
  g.font = `13px ${BODY}`;
  lines.forEach(([text, color], i) => { g.fillStyle = color; g.fillText(text, PAD, SIZE + 10 + 14 * i); });
}
