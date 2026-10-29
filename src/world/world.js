// The world: a lazily grown set of cubes. Preparing a cube collapses its whole depth (WFC, once
// per depth), decides its faces, and then generates its map from a spec built out of those faces.
import { hash32 } from '../core/util.js';
import { WATER, LAVA } from '../core/constants.js';
import { worldNoise } from '../core/wnoise.js';
import { generate } from '../cubegen/index.js';
import { WFC } from './wfc.js';
import { key, parse, step, faceKey, hashKey } from './coords.js';
import { decideFaces, LAYER_BASE } from './faces.js';
import { worldThemes } from '../themes/depth.js';
import { makeLayouts } from './layout.js';
import { voidAllowed, fallMask } from './voids.js';
import { isTown, isMerchantCamp, isClearing, enemyFreeAt, isInterior } from './town.js';
import { generateInterior } from '../cubegen/interior.js';
import { stampFluidBodies } from '../cubegen/fluidbodies.js';
import { spanSpec } from './spans.js';
import { heightSpec, heightsOf, shaftAbove } from './heights.js';
import { areaSpec } from './areas.js';
import { bridgesOf } from '../themes/builds.js';
import { trialFaces } from './trials.js';
import { isTestRoom, testRoomOf } from './testrooms.js';
import { generateTestRoom } from '../cubegen/testrooms.js';
import { addWaterfallHideout, waterfallOutside } from './waterfalls.js';
import { generateWaterfallRoom } from '../cubegen/waterfallroom.js';

// how much each WFC kind leans towards an archetype (times the theme's weights)
const LEAN = { highland: { mesa: 2, spire: 2, archipelago: 0.3 }, lake: { archipelago: 3, crater: 2 }, gorge: { chasm: 3 },
  river: { chasm: 1.5, archipelago: 0.5 }, meadow: { plain: 1.5 }, slope: { mesa: 1.5 } };
// learn: random.html#pick-code (see learn/README.md)
function archetype(theme, kind, R) {
  const w = Object.entries(theme.arche).map(([a, v]) => [a, v * (LEAN[kind]?.[a] ?? 1)]);
  let r = R() * w.reduce((s, [, v]) => s + v, 0);
  for (const [a, v] of w) if ((r -= v) < 0) return a;
  return 'plain';
}

export class World {
  // opts.arche: force one archetype everywhere (dev); opts.themes: theme ids that win every depth
  // they may appear at (dev, tests; themes/depth.js worldThemes); opts.bridge / opts.ladder: one
  // bridge / ladder style wherever it fits (dev, tests; themes/builds.js)
  constructor(seed, opts = {}) {
    this.seed = seed;
    this.opts = opts;
    this.layout = makeLayouts(seed, worldThemes(seed, opts.themes || []), { trial: opts.trial });   // depth -> which cubes exist and how they connect
    this.themes = this.layout.themes;   // the world's themes, by stretches of depths
    this.wfc = new WFC(seed, this.layout);
    this.noise = worldNoise(seed);
    this.faces = new Map();
    this.cubes = new Map();
    this.start = key(0, 0, 0);
  }

  // learn: architecture.html#cube-journey (see learn/README.md)
  prepare(k) {
    const d = -parse(k)[1];
    if (!this.layout(d).exists.has(k)) throw new Error(`${k} is not part of depth ${d}`);
    this.wfc.collapseDepth(d);
    decideFaces(this, k);
  }

  // learn: architecture.html#cube-journey (see learn/README.md)
  spec(k) {
    const [X, Y, Z] = parse(k), t = this.wfc.tiles.get(k), theme = this.layout(-Y).theme, L = this.layout(-Y);
    const span = spanSpec(L, k, bridgesOf(theme, this.opts.bridge)), height = heightSpec(this, k), area = areaSpec(this, k);
    const faces = [0, 1, 2, 3].map(d => {
      const f = this.faces.get(faceKey(k, d));
      return { sock: t.sock[d], profile: Int16Array.from(f.profile), river: f.river, portal: f.portal, wall: f.wall, spout: f.spout,
        clearingBoundary: isClearing(k, this.seed) || isClearing(step(k, d), this.seed) };
    });
    const portals = [];
    faces.forEach((f, d) => { if (f.portal) portals.push({ dir: d, ...f.portal }); });
    for (const d of [4, 5]) {
      const f = this.faces.get(faceKey(k, d));
      if (f?.portal) portals.push({ dir: d, ...f.portal });
    }
    const outflow = this.faces.get(faceKey(k, 4))?.fall || null, inflow = this.faces.get(faceKey(k, 5))?.fall || null;
    const trial = L.trialCells?.get(k) || null;   // a trial room (world/trials.js, cubegen/trials/)
    // (the balance's stones stand over lava or acid, never over harmless water)
    const fluid = trial?.kind === 'balance' && theme.river === WATER ? LAVA : theme.river;
    const special = isClearing(k, this.seed) || L.guardians.has(k) || span || height || area || trial;
    // a needle with a reward site on top (heights.js), where no river runs
    const R = this.wfc.rng(k, 0x9e1d7), top = heightsOf(theme).top;
    const pinnacle = L.pinnacle === k && !special && !t.sock.includes('W')
      ? { x: 6 + Math.floor(R() * 4), z: 6 + Math.floor(R() * 4), top: top[0] + Math.floor(R() * (top[1] - top[0] + 1)) } : null;
    // the set-piece cubes (cubegen/setpieces.js): a lone peak with a discovery on top, up a ladder,
    // in a flat empty field; a great lake, a discovery on an islet in it
    const discovery = (L.sitePlans.get(k) || []).find(i => !i.landmark), Rs = this.wfc.rng(k, 0x5e7c);
    const peak = L.peak === k && !special ? { x: 5 + Math.floor(Rs() * 3), z: 5 + Math.floor(Rs() * 3),
      side: discovery && discovery.prestige !== 'basic' ? 5 : 4, rise: 10 + Math.floor(Rs() * 4) } : null;
    const lake = L.lake === k && !special ? { islet: discovery ? { x: 7 + Rs(), z: 7 + Rs(), r: discovery.prestige === 'basic' ? 2.3 : 2.9 } : null } : null;
    // a short tunnel the way leads through (cubegen/tunnel.js): not where rivers run, falls come
    // or go, spouts pour, a horde waits, or something else shapes the cube
    // an annex (world/layout.js): plain ground to fight on, no holes, no tunnel
    const annex = L.annex?.key === k;
    const tunnel = -Y > 0 && !special && !annex && !pinnacle && !peak && !lake && !L.hordes.has(k) && !t.sock.includes('W') && !outflow && !inflow
      && faces.every(f => !f.spout) && R() < heightsOf(theme).tunnel;
    return {
      key: k, X, Y, Z, kind: t.kind, exit: this.layout(-Y).exit.get(k) ?? null, K: t.K, B: LAYER_BASE.slice(0, t.K), faces, portals,
      spawn: k === this.start, town: isTown(k), merchantCamp: isMerchantCamp(k, this.seed), enemyFree: enemyFreeAt(k), noise: this.noise, depth: -Y, cave: theme.cave, walled: theme.cave || !!theme.walls,
      biome: theme.props, guardian: this.layout(-Y).guardians.get(k) || null,
      horde: this.layout(-Y).hordes.get(k) || null, populationScale: this.layout(-Y).populationScale.get(k) ?? 1,
      routeIndex: this.layout(-Y).routeIndex.get(k), route: this.layout(-Y).route,
      gateKeys: [0, 1, 2, 3].map(d => this.layout(-Y).gateFaces.get(faceKey(k, d)) || null),
      roomRole: this.layout(-Y).roles.get(k), rewardSites: this.layout(-Y).sitePlans.get(k) || [],
      spots: L.spots.get(k) || [],   // places kept free for the quests (world/spots.js, cubegen/spots.js)
      annexRoom: L.annex?.key === k,   // a quest's room behind a sealed portal (world/layout.js)
      fluid, fluidMix: theme.fluids, voidOK: !annex && voidAllowed(this, k), fallIn: fallMask(this, k),
      outflow, inflow, relief: theme.relief, height, pinnacle, tunnel, shaftBottom: special ? null : shaftAbove(this, k),
      area, peak, lake, sparse: !!(peak || lake),   // sparse: mostly empty (few props, render/propplace.js)
      // islands without pillars: lakes, the sky islands near the top and the abyss
      floating: !isClearing(k, this.seed) && (t.kind === 'lake' || ((-Y <= 3 || -Y >= 19) && this.wfc.rng(k, 0xf10a7)() < 0.5)),
      seed: hash32(this.seed ^ hashKey(k)),
      trial: trial && { id: trial.id, key: trial.key, kind: trial.kind, role: trial.role, from: trial.from, fromDir: trial.fromDir,
        exit: trial.exit, gate: trial.gate, stages: trial.stages || null, depth: trial.depth, entry: trial.fromDir ^ 1 },
      trialFaces: trialFaces(L, k),   // the kind of trial behind each side face (the warning on its portal)
      clues: (L.trialClues?.get(k) ?? []).map(t => ({ key: t.key, id: t.id, depth: t.depth })),   // rune rooms' tablets (world/trials.js)
      archetype: trial ? 'trial' : span ? span.role : area ? area.role : height ? height.role : pinnacle ? 'pinnacle' : peak ? 'peak' : lake ? 'lake' : -Y === 0 || annex ? 'plain'
        : this.opts.arche || archetype(theme, t.kind, this.wfc.rng(k, 0xa7c4)), span,
      forceBridge: this.opts.bridge || null, forceLadder: this.opts.ladder || null,
    };
  }

  // the spec of depth d's descent arena (the cube with its well and its guardian or boss), or null
  descentSpec(d) {
    const k = [...this.layout(d).guardians].find(([, g]) => g.role === 'descent')?.[0];
    if (!k) return null;
    this.prepare(k);
    return this.spec(k);
  }

  // the generated cube (built on first use); house interiors and the dev test rooms
  // (world/testrooms.js) are not part of the grid
  cube(k) {
    let c = this.cubes.get(k);
    if (!c && isTestRoom(k)) {
      const d = -parse(k)[1];
      // (the boss room is built from the spec of the depth's own descent arena: cubegen/testrooms.js)
      const arena = testRoomOf(k) === 'boss' ? this.descentSpec(d) : null;
      c = { key: k, map: stampFluidBodies(generateTestRoom({ key: k, depth: d, seed: hash32(this.seed ^ hashKey(k)), biome: this.layout(d).theme.props, arena })), visits: 0 };
      this.cubes.set(k, c);
    }
    if (!c && waterfallOutside(k)) {
      const outside = this.cube(waterfallOutside(k)).map, door = outside.doors?.find(d => d.to === k);
      if (!door) throw new Error('No waterfall door leads to ' + k);
      c = { key: k, map: stampFluidBodies(generateWaterfallRoom({ key: k, seed: hash32(outside.seed ^ 0x7a7ef411) }, outside, door)), visits: 0 };
      this.cubes.set(k, c);
    }
    if (!c && isInterior(k)) {
      // turned the way the house stands in town (the town turns with its exit)
      const door = this.cube(this.start).map.doors.find(d => d.to === k);
      if (!door) throw new Error('No door leads to ' + k);
      c = { key: k, map: generateInterior({ key: k, seed: hash32(this.seed ^ hashKey(k)) }, [door.nx, door.nz]), visits: 0 };
      this.cubes.set(k, c);
    }
    if (!c) {
      this.prepare(k);
      // (and the colour of each body of fluid in it: cubegen/fluidbodies.js)
      c = { key: k, map: addWaterfallHideout(stampFluidBodies(generate(this.spec(k)))), visits: 0 };
      this.cubes.set(k, c);
    }
    return c;
  }
}
