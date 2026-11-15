// In devtools (?dev=1): await (await import('./tests/browser/woppylavafx.js')).runWoppylavaFxChecks()
// Woppylava's effects, drawn (render/woppylavafx.js), in his cinder pit, from made-up states of his
// fight (the game paused): a wall warns along its side of the arena (its seam glowing), then rolls
// across, its foot on the ground and a gap in it, and is gone once through; a hand's ring follows,
// the hand comes down out of the dark onto it, clutches and rises; a bomb's mark glows and splashes as
// it lands; the lava over the flat plane covers the cells it stands over; the mound smokes and glows
// in phase 1, the crater in phase 2; everything goes with null. (/woppyfx shows them running.)
import { paused } from './combat.js';
import { state } from '../../src/game/state.js';
import { goBoss } from '../../src/game/dev.js';
import { N } from '../../src/core/constants.js';
import { groundAt } from '../../src/physics/collide.js';
import { WOPPYLAVA_FIGHT as G, wallAt, handLands } from '../../src/core/woppylava.js';
import { drawWoppylavaFx, clearWoppylavaFx, woppylavaFxNow } from '../../src/render/woppylavafx.js';

const check = (value, message) => { if (!value) throw Error(message); };

export async function runWoppylavaFxChecks() {
  return paused(async () => {
    const out = [];
    if (state.map?.arena?.type !== 'cinder') await goBoss('woppylava');
    const map = state.map, box = map.tide?.box ?? [2, 2, N - 2, N - 2], vo = map.volcano;
    check(map.arena?.type === 'cinder' && vo, 'his cinder pit, its mound in the middle');
    const base = { walls: [], hands: [], marks: [], lava: null, level: -Infinity, volcano: vo, stir: 0, stage: 1, box, burst: NaN };
    const draw = (fx, dt = 1 / 30) => { drawWoppylavaFx(state.world, { ...base, ...fx }, dt); return woppylavaFxNow(); };
    // a wall: warning (its seam), rolling (its front where the rules say), gone once through
    const wall = { n: 1, side: 0, gap: (box[1] + box[3]) / 2, t: 0.5 };
    let now = draw({ walls: [wall] });
    check(now.walls.length === 1 && now.walls[0].seam, 'a wall warns: its seam glows along its side');
    const t = G.walls.warn + 1.5, at = wallAt({ ...wall, t }, t, box);
    now = draw({ walls: [{ ...wall, t }] });
    const xs = now.walls[0].x, front = Math.max(...xs);
    check(now.walls[0].wall && Math.abs(front - (at.start + at.front)) < 0.6, `the wall rolls where the rules say: ${front.toFixed(2)} vs ${(at.start + at.front).toFixed(2)}`);
    now = draw({ walls: [{ ...wall, t: 99 }] });
    check(!now.walls[0].wall && !now.walls[0].seam, 'through: gone');
    now = draw({ walls: [] });
    check(now.walls.length === 0, 'a wall no longer carried is dropped');
    out.push('walls: warn, roll, gone');
    // a hand: the ring alone while it follows, the hand coming down, on the floor clutching, rising
    const hx = vo.x - 4, hz = vo.z + 2, g = groundAt(hx, hz, 99, 0).h;
    const hand = s => draw({ hands: [{ n: 7, x: hx, z: hz, t: s }] }).hands[0];
    let h = hand(0.5);
    check(h.ring && !h.hand, 'the ring follows, no hand yet');
    h = hand(G.hands.track + G.hands.lock * 0.5);
    check(h.hand && h.y > g + 5, `the hand comes down out of the dark: ${(h.y - g).toFixed(1)} over the floor`);
    h = hand(handLands() + G.hands.hold * 0.8);
    check(h.hand && Math.abs(h.y - g) < 0.3 && h.curl > 0.9, `on the floor, clutching: ${(h.y - g).toFixed(2)}, curl ${h.curl.toFixed(2)}`);
    h = hand(handLands() + G.hands.hold + G.hands.rise * 0.7);
    check(h.hand && h.y > g + 3, 'and up again');
    check(!hand(99).hand, 'done: gone');
    draw({ hands: [] });
    out.push('hands: ring, down, clutch, up');
    // a bomb's mark: glowing till it lands, a splash then
    const mark = s => draw({ marks: [{ n: 3, x: hx, y: g, z: hz, t: s, flight: 1.5 }] });
    check(mark(0.2).marks[0].mark, 'a bomb\'s spot glows');
    now = mark(1.55);
    check(now.marks[0].landed && now.splashes === 1, 'it lands: a splash');
    draw({ marks: [] });
    out.push('marks: glow, splash');
    // the lava over the flat plane: the cells it stands higher over
    const lava = new Float32Array(N * N).fill(NaN);
    let cells = 0;
    for (let z = Math.floor(vo.z) - 1; z <= Math.floor(vo.z) + 1; z++) for (let x = Math.floor(vo.x) - 1; x <= Math.floor(vo.x) + 1; x++) { lava[z * N + x] = groundAt(x + 0.5, z + 0.5, 99, 0).h + 0.35; cells++; }
    now = draw({ lava, level: -Infinity, stage: 2 });
    check(now.lava === cells && now.crater && !now.mound, `the crater's pool over ${now.lava} cells, smoke over it`);
    now = draw({ lava, level: 99, stage: 2 });
    check(now.lava === 0, 'none where the flat lava stands higher');
    now = draw({ stage: 1, stir: 0.7 });
    check(now.mound && !now.crater && now.lights[0] > 1, 'phase 1: the mound smokes and glows');
    out.push('lava, mound, crater');
    drawWoppylavaFx(state.world, null, 1 / 30);
    check(woppylavaFxNow() === null, 'null: all gone');
    clearWoppylavaFx();
    return out;
  });
}
