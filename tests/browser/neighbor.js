// await (await import('./tests/browser/neighbor.js')).runNeighborChecks()
// await (await import('./tests/browser/neighbor.js')).runExpandedTravelChecks()
// await (await import('./tests/browser/neighbor.js')).runPartParityChecks()
// await (await import('./tests/browser/neighbor.js')).runProxyIntegrityChecks()
// await (await import('./tests/browser/neighbor.js')).runShaftViewChecks()
import * as THREE from 'three';
import { N, WATER, LAVA, ACID, FLUIDS } from '../../src/core/constants.js';
import { camera, scene, renderer } from '../../src/render/scene.js';
import { GeoBuilder } from '../../src/render/builder.js';
import { packParts, PARTS } from '../../src/render/parts.js';
import { FLUID_LOOK, PROXY } from '../../src/render/materials.js';
import { buildWorld, disposeWorld } from '../../src/render/world.js';
import { setFade } from '../../src/render/fade.js';
import { U } from '../../src/render/cutshader.js';
import { buildNeighbors, disposeNeighbors, detachNeighbors, adoptNeighbors, showNeighbors,
  clearNeighbors, clearNeighborCache, cullNeighbors, tickNeighbors, neighborStats, liveNeighbors, instanceFade } from '../../src/render/neighbors.js';
import { paused } from './combat.js';

const check = (condition, message) => { if (!condition) throw Error(message); };

// A great shaft (world/heights.js) is a hole like any other: the room under it stays hidden until
// you have been there (docs/world.md, "Only where you have been"), even once it is made.
export async function runShaftViewChecks() {
  const { state } = await import('../../src/game/state.js');
  const { goFeature } = await import('../../src/game/dev.js');
  const { newWorld } = await import('../../src/game/flow.js');
  const { step } = await import('../../src/world/coords.js');
  const show = state.showNeighbors, out = [];
  try {
    state.showNeighbors = true;
    // (great shafts are rare: other worlds where this one has none)
    for (let n = 0, seed = 0; n < 3; n++) {
      await goFeature('shaft');
      if (!state.map?.shaft && !out.length && seed < 12) { await newWorld(++seed); n--; continue; }
      const m = state.map;
      if (!m?.shaft) break;
      const below = step(m.key, 4);
      check(!state.cubes.cubes.get(below)?.visits, `${m.key}: the room below was visited already`);
      await state.cubes.get(below);   // made (it may well be, prefetched): still not shown
      await new Promise(r => setTimeout(r, 300));
      check(!liveNeighbors().some(g => g.key === below), `${m.key}: the room under the shaft is shown before it was visited`);
      check(liveNeighbors().every(g => state.cubes.cubes.get(g.key)?.visits), `${m.key}: an unvisited cube is shown`);
      out.push(m.key);
    }
    check(out.length, 'no great shaft in this world');
    return out;
  } finally { state.showNeighbors = show; }
}

// Real travel in a fully explored stratum, not just the immediate portal pair.
export async function runExpandedTravelChecks() {
  return paused(async () => {
    const { state, player } = await import('../../src/game/state.js');
    const { newWorld, enterCube, visitedNeighbors, updateNeighbors } = await import('../../src/game/flow.js');
    const { startTravel, travelling, updateTravel } = await import('../../src/game/travel.js');
    const { step } = await import('../../src/world/coords.js');
    const seed = state.cubes.seed, show = state.showNeighbors;
    const finish = () => { for (let i = 0; i < 180 && travelling(); i++) updateTravel(1 / 60); };
    try {
      state.showNeighbors = true;
      await newWorld(3);
      const cubes = await Promise.all([...state.cubes.layout(1).exists].map(k => state.cubes.get(k)));
      cubes.forEach(c => c.visits = 1);
      const source = cubes[Math.floor(cubes.length / 2)];
      enterCube(source, source.map.portals.find(p => p.kind === 'side').dir);
      tickNeighbors(1);
      const before = detachNeighbors(), originals = new Map(before.map(g => [g.key, g]));
      adoptNeighbors(before);
      const portal = state.map.portals.find(p => p.kind === 'side');
      const common = visitedNeighbors(step(state.cubeKey, portal.dir)).map(g => g.key).filter(k => originals.has(k));
      check(common.length > 4, 'Test must cover more than immediate neighbors');
      startTravel(portal);
      for (let i = 0; i < 100 && !travelling(); i++) await new Promise(r => setTimeout(r, 20));
      check(travelling(), 'Expanded travel must start');
      const live = neighborStats().live;
      state.showNeighbors = false; updateNeighbors(); cullNeighbors(player.x, player.z, false, false);
      check(neighborStats().live === live && neighborStats().visible === 0, 'Travel toggle must hide without building a third set');
      state.showNeighbors = true; updateNeighbors();
      check(neighborStats().live === live, 'Re-enabling during travel must not duplicate proxies');
      for (let i = 0; i < 180 && travelling(); i++) {
        updateTravel(1 / 60); cullNeighbors(player.x, player.z, false);
        for (const k of common) check(originals.get(k).group.userData.fade === 1, 'Common surroundings must not fade out');
      }
      check(!travelling(), 'Expanded travel must finish');
      const after = detachNeighbors(); adoptNeighbors(after);
      for (const k of common) check(after.find(g => g.key === k) === originals.get(k), 'Travel must retain common proxy identity');
      check(new Set(after.map(g => g.key)).size === after.length, 'Travel must not duplicate proxies');
      check(neighborStats().live === after.length, 'Departing proxies must be released');
      return { discovered: cubes.length, reused: common.length, ...neighborStats() };
    } finally { finish(); state.showNeighbors = show; await newWorld(seed); }
  });
}
// a slab with a pool of each fluid and a waterfall, packed like the worker does
function fixture() {
  const box = (x0, y0, z0, x1, y1, z1, uvs = false) => { const b = new GeoBuilder({ uvs }), col = new THREE.Color('gray'); b.box(x0, y0, z0, x1, y1, z1, col, col); return b.arrays(); };
  const layer = { terrain: box(0, 0, 0, N, 2, N), stone: null, wood: null,
    fluids: { [WATER]: box(1, 2, 1, 4, 2.5, 4, true), [LAVA]: box(6, 2, 6, 9, 2.5, 9, true), [ACID]: box(11, 2, 11, 14, 2.5, 14, true) } };
  return packParts([layer], { falls: [{ type: WATER, d: 0, c: 5 * N + 5, top: 8, bot: 4, layer: 0 }] });
}

// The parts a proxy draws are the parts the full cube draws, for every cube generated so far.
export async function runPartParityChecks() {
  return paused(async () => {
    const { state } = await import('../../src/game/state.js');
    const seen = new Set(), original = detachNeighbors();
    try {
      for (const c of state.cubes.cubes.values()) {
        const world = buildWorld(c.map, false, {}, c.geo), full = [];
        // the part meshes (the ghost twins sharing their geometry live on layer 1)
        world.group.traverse(o => { if (o.isMesh && o.geometry.attributes.position?.array instanceof Int16Array && !o.layers.isEnabled(1)) full.push(o); });
        disposeWorld(world);
        showNeighbors([{ key: 'parity', geo: c.geo, dx: 1, dz: 0, open: [] }]);
        const [g] = detachNeighbors(); adoptNeighbors([g]);
        const proxy = new Set(g.instances.map(i => i.batch.part?.name).filter(Boolean));
        const names = PARTS.filter(p => c.geo.parts[p.name]).map(p => p.name);
        check(full.length === names.length, `${c.key}: the full cube must draw every part (${full.length} of ${names.length})`);
        check(names.every(n => proxy.has(n)) && proxy.size === names.length, `${c.key}: the proxy must draw the same parts`);
        names.forEach(n => seen.add(n));
        clearNeighbors();
      }
    } finally { clearNeighbors(); clearNeighborCache(); adoptNeighbors(original); }
    return [...seen];
  });
}

export async function runNeighborChecks() {
  return paused(async () => {
    const original = detachNeighbors(), position = camera.position.clone(), rotation = camera.quaternion.clone();
    const aspect = camera.aspect, geo = fixture(), open = [true, false, true, false];
    const entry = (key, dx, dz = 0, source = geo) => ({ key, geo: source, dx, dz, open });
    let travelling = [];
    try {
      showNeighbors([entry('east', 1), entry('far-east', 2), entry('west', -2), entry('outside', 5)]);
      tickNeighbors(1);
      let list = detachNeighbors(); adoptNeighbors(list);
      check(list[0].geometry === list[1].geometry, 'Worker geometry must be cached/shared');
      check(list[0].group.userData.fadeU !== list[1].group.userData.fadeU, 'Fades must be independent per proxy');
      const lava = list[0].instances.find(i => i.batch.part?.name === 'lava'), water = list[0].instances.find(i => i.batch.part?.name === 'water');
      check(lava && water && list[0].instances.some(i => i.batch.part?.name === 'acid') && list[0].instances.some(i => i.batch.part?.name === 'water-fall'),
        'Every fluid and its falls must get their own proxy part');
      const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
      for (const t of FLUIDS) {
        const mat = list[0].instances.find(i => i.batch.part?.fluid === t && i.batch.part.kind === 'fluid').batch.mesh.material;
        // (its colours are its palettes', render/fluidpal.js: the material only darkens them)
        check(mat.color.equals(dim(0xffffff, PROXY.fluid)) && mat.transparent === FLUID_LOOK[t].clear, `Proxy ${t} must look like the fluid it is`);
      }
      check(!lava.batch.mesh.material.transparent && water.batch.mesh.material.transparent, 'Lava is opaque, water is not');
      check(list[0].instances[0].batch === list[1].instances[0].batch && list[0].instances[0].id !== list[1].instances[0].id,
        'Proxies must be instances of shared batches');
      const east = list[0], cached = east.geometry;
      showNeighbors([entry('east', 1), entry('far-east', 2), entry('west', -2), entry('outside', 5)]);
      list = detachNeighbors(); adoptNeighbors(list);
      check(list[0] === east && list[0].group.userData.fade === 1, 'Refresh must preserve proxy and fade');
      check(east.glass.userData.panes.every((p, i) => p.visible === !open[i]), 'Open faces must survive refresh');

      camera.aspect = 1; camera.updateProjectionMatrix();
      camera.position.set(8, 8, 8); camera.lookAt(80, 8, 8);
      cullNeighbors(8, 8, false);
      check(east.cull.visible && list[1].cull.visible, 'Cubes farther than one neighbor must draw');
      check(!list[2].cull.visible, 'Behind-camera cube must be culled');
      check(!list[3].cull.visible, 'Beyond-distance cube must be culled');
      setFade(east.group, 0); cullNeighbors(8, 8, false);
      check(!east.group.visible, 'Culling must not resurrect travel-faded geometry');
      setFade(east.group, 1);
      camera.lookAt(-80, 8, 8); cullNeighbors(8, 8, false);
      check(list[2].cull.visible && !east.cull.visible, 'Turning must reveal cached cubes without rebuilding');
      camera.lookAt(80, 8, 8);
      // Compile/render every material with range/reveal/fade shader patches enabled.
      U.uRes.value.set(renderer.domElement.width, renderer.domElement.height);
      cullNeighbors(8, 8); renderer.render(scene, camera);
      check(!renderer.info.programs.some(p => p.diagnostics && !p.diagnostics.runnable), 'Proxy shaders must compile');
      const fogFar = scene.fog.far;
      try {
        scene.fog.far = 0; cullNeighbors(8, 8);
        check(!list[1].cull.visible, 'Wholly fogged cubes must be culled');
      } finally { scene.fog.far = fogFar; }
      cullNeighbors(-30, 8);
      check(east.group.userData.rangeFadeU.value > 0 && east.group.userData.rangeFadeU.value < 1,
        'Distance boundary must fade, not pop');
      const inst = east.instances[0], data = inst.batch.data.value.image.data;
      check(Math.abs(data[inst.id * 4 + 2] - east.group.userData.rangeFadeU.value) < 1e-6, 'Range fade must reach the batch');
      check(neighborStats().draws <= inst.batch.mesh.parent.children.filter(o => o.isBatchedMesh).length + 2, 'Proxies must draw per batch, not per cube');
      cullNeighbors(8, 8);
      cullNeighbors(8, 8, true, false);
      check(list.every(g => !g.cull.visible), 'V toggle must hide all proxies, including detached travel sets');
      cullNeighbors(8, 8);

      const old = detachNeighbors();
      travelling = buildNeighbors([entry('east', 0), entry('far-east', 1), entry('new', 2)], old);
      check(travelling[0] === east && east.continuing, 'Travel must reuse common proxies');
      check(!old.includes(east) && old.length === 2, 'Common proxies must leave the departing set');
      check(east.base.x === 0 && travelling[1].base.x === N, 'Reused proxies must rebase');
      disposeNeighbors(old); adoptNeighbors(travelling); travelling = [];
      clearNeighbors();
      showNeighbors([entry('east', 1)]);
      list = detachNeighbors(); adoptNeighbors(list);
      check(list[0].geometry === cached, 'Revisits must reuse released cached geometry');
      clearNeighbors();
      for (let i = 0; i < 70; i++) {
        const proxies = buildNeighbors([entry('cache-' + i, 1, 0, fixture())]);
        disposeNeighbors(proxies);
      }
      check(neighborStats().cached <= 64 && neighborStats().bytes <= 32 * 1024 * 1024, 'Unused cache must be bounded');
      clearNeighborCache();
      check(neighborStats().live === original.length, 'Disposed proxies must not remain in culling set');
      return ['distant proxies / shared geometry / independent fades / fluid looks', 'refresh and revisit reuse / opened panes',
        'frustum rotation / distance / fade isolation / shader compilation', 'travel overlap reuse / rebase / bounded cache'];
    } finally {
      disposeNeighbors(travelling); clearNeighbors(); clearNeighborCache(); adoptNeighbors(original);
      camera.position.copy(position); camera.quaternion.copy(rotation); camera.aspect = aspect;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    }
  });
}

// Everything a proxy shows must be in the batches as it says, after any number of trips: every
// live proxy is a discovered cube of the current set (or of a travel's two sets), each of its
// instances is active with its own geometry, placed at the proxy, shown exactly when the proxy
// is, with the proxy's fades; nothing else is drawn, and the glass boxes are exactly the shown
// proxies'.
function integrity(state, label, sliding = false) {
  const current = detachNeighbors(); adoptNeighbors(current);
  const list = liveNeighbors();
  if (!sliding) check(list.length === current.length && current.every(g => list.includes(g)), `${label}: ${list.length} live proxies, ${current.length} in the set (leak)`);
  check(new Set(list.map(g => g.key)).size === list.length || sliding, `${label}: a cube shown twice`);
  const batches = new Map();
  for (const g of list) {
    check(state.cubes.cubes.get(g.key)?.visits, `${label}: proxy of undiscovered ${g.key}`);
    check(!g.disposed && g.instances.length >= g.geometry.parts.length, `${label}: ${g.key} lost instances`);
    const shown = g.cull.visible && g.group.visible;
    g.instances.forEach((inst, i) => {
      const info = inst.batch.mesh._instanceInfo[inst.id];
      check(info?.active, `${label}: ${g.key} instance ${i} inactive`);
      if (i < g.geometry.parts.length) check(info.geometryIndex === g.geometry.parts[i].id, `${label}: ${g.key} instance ${i} draws another geometry`);
      check(inst.batch.mesh._geometryInfo[info.geometryIndex].active, `${label}: ${g.key} instance ${i} geometry deleted`);
      // (the small dressing only near the hero: render/neighbors.js instanceFade)
      const near = instanceFade(g, inst);
      check(info.visible === (shown && near > 0), `${label}: ${g.key} instance ${i} visible ${info.visible}, proxy ${shown}, near ${near}`);
      const m = new THREE.Matrix4(); inst.batch.mesh.getMatrixAt(inst.id, m);
      const at = new THREE.Vector3().setFromMatrixPosition(m), want = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().makeTranslation(g.group.position).multiply(inst.local));
      check(at.distanceTo(want) < 1e-4, `${label}: ${g.key} instance ${i} at ${at.toArray()}, proxy at ${g.group.position.toArray()}`);
      const d = inst.batch.data.value.image.data, u = g.group.userData;
      const f = Math.fround;
      check(d[inst.id * 4] === f(u.fadeU.value) && d[inst.id * 4 + 1] === f(u.fadeInv.value) && d[inst.id * 4 + 2] === f(u.rangeFadeU.value * near), `${label}: ${g.key} instance ${i} fade out of date`);
      batches.set(inst.batch, (batches.get(inst.batch) || 0) + (info.visible ? 1 : 0));
      // the batch still holds this cube's arrays where its draw range says
      if (i < g.geometry.parts.length) {
        const name = inst.batch.part.name, src = g.source.parts[name], geo = inst.batch.mesh._geometryInfo[info.geometryIndex];
        const pos = inst.batch.mesh.geometry.attributes.position.array, index = inst.batch.mesh.geometry.index.array;
        check(geo.vertexCount === src.pos.length / 4 && geo.indexCount === src.index.length, `${label}: ${g.key} ${name} range size`);
        for (const k of [0, 1, src.index.length >> 1, src.index.length - 1]) {
          const v = index[geo.indexStart + k] - geo.vertexStart;
          check(v === src.index[k], `${label}: ${g.key} ${name} index ${k} is ${v}, not ${src.index[k]}`);
          for (let j = 0; j < 3; j++) check(pos[(geo.vertexStart + v) * 4 + j] === src.pos[v * 4 + j], `${label}: ${g.key} ${name} vertex ${v} moved`);
        }
      }
    });
  }
  // what the GPU is told to draw (BatchedMesh builds its draw list when it renders)
  renderer.render(scene, camera);
  const viewFrustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
  for (const [batch, visible] of batches) {
    const mesh = batch.mesh, drawn = mesh._instanceInfo.filter(i => i.active && i.visible).length;
    check(drawn === visible, `${label}: a batch draws ${drawn} instances, the proxies show ${visible}`);
    if (!mesh.visible) { check(!visible, `${label}: a hidden batch with ${visible} shown instances`); continue; }
    // (the landmarks' batch culls each instance against the view: those in it)
    const inView = !mesh.perObjectFrustumCulled ? visible : mesh._instanceInfo.filter((info, id) => info.active && info.visible
      && viewFrustum.intersectsSphere(mesh.getBoundingSphereAt(info.geometryIndex, new THREE.Sphere()).applyMatrix4(mesh.getMatrixAt(id, new THREE.Matrix4()).premultiply(mesh.matrixWorld)))).length;
    check(mesh._multiDrawCount === inView, `${label}: ${batch.part?.name || 'landmark'} draw list has ${mesh._multiDrawCount} of ${inView}`);
    const bpe = mesh.geometry.index.array.BYTES_PER_ELEMENT, ids = mesh._indirectTexture.image.data;
    for (let k = 0; k < mesh._multiDrawCount; k++) {
      const info = mesh._instanceInfo[ids[k]], geo = mesh._geometryInfo[info.geometryIndex];
      check(info.active && info.visible && mesh._multiDrawStarts[k] === geo.start * bpe && mesh._multiDrawCounts[k] === geo.count,
        `${label}: draw ${k} of ${batch.part?.name || 'landmark'} does not match its instance`);
    }
  }
  const glass = scene.children.find(o => o.isMesh && o.geometry.isInstancedBufferGeometry && o.geometry.attributes.aPanes);
  const shown = list.filter(g => g.cull.visible && g.group.visible).length;
  check(!glass || glass.geometry.instanceCount === shown, `${label}: ${glass?.geometry.instanceCount} glass boxes for ${shown} shown proxies`);
  return list;
}

// Many trips (sideways, down and up) through a fully explored world, checking the batches after
// each and while sliding.
export async function runProxyIntegrityChecks(trips = 40, explore = false) {
  return paused(async () => {
    const { state, player } = await import('../../src/game/state.js');
    const { newWorld, enterCube, updateNeighbors } = await import('../../src/game/flow.js');
    const { startTravel, travelling, updateTravel } = await import('../../src/game/travel.js');
    const { step } = await import('../../src/world/coords.js');
    const seed = state.cubes.seed, show = state.showNeighbors, log = [];
    const frame = () => { tickNeighbors(1 / 60); cullNeighbors(player.x, player.z, !state.transitioning, state.showNeighbors, player.visY); };
    try {
      state.showNeighbors = true;
      await newWorld(7);
      for (const d of [0, 1, 2, 3]) for (const c of await Promise.all([...state.cubes.layout(d).exists].map(k => state.cubes.get(k)))) c.visits = explore ? 0 : 1;
      let R = 12345;
      const rand = n => (R = (R * 1103515245 + 12345) & 0x7fffffff) % n;
      const first = state.cubes.cubes.get([...state.cubes.layout(1).exists][0]);
      enterCube(first, first.map.portals.find(p => p.kind !== 'spawn').dir);
      frame(); integrity(state, 'start');
      for (let t = 0; t < trips; t++) {
        const portals = state.map.portals.filter(p => p.kind !== 'spawn' && (explore || state.cubes.cubes.get(step(state.cubeKey, p.dir))?.visits));
        const vertical = portals.filter(p => p.kind !== 'side');
        const p = vertical.length && rand(2) ? vertical[rand(vertical.length)] : portals[rand(portals.length)];
        if (!p) break;
        startTravel(p, { force: true });
        for (let i = 0; i < 200 && state.transitioning && !travelling(); i++) await new Promise(r => setTimeout(r, 10));
        if (!travelling()) { state.transitioning = false; continue; }
        let steps = 0;
        while (travelling()) { updateTravel(1 / 60); frame(); if (steps++ % 20 === 10) integrity(state, `trip ${t} (${p.kind}) sliding`, true); }
        for (let i = 0; i < 90; i++) frame();
        const list = integrity(state, `trip ${t} (${p.kind}) to ${state.cubeKey}`);
        if (rand(4) === 0) { updateNeighbors(); frame(); integrity(state, `trip ${t} refresh`); }
        log.push(`${p.kind}:${state.cubeKey}:${list.length}`);
      }
      // and down and back up through every depth's well, entered the plain way first
      const trip = async (p, label) => {
        startTravel(p, { force: true });
        for (let i = 0; i < 200 && state.transitioning && !travelling(); i++) await new Promise(r => setTimeout(r, 10));
        check(travelling(), `${label}: travel must start`);
        let steps = 0;
        while (travelling()) { updateTravel(1 / 60); frame(); if (steps++ % 20 === 10) integrity(state, `${label} sliding`, true); }
        for (let i = 0; i < 90; i++) frame();
        log.push(`${p.kind}:${state.cubeKey}:${integrity(state, label).length}`);
      };
      for (const d of [0, 1, 2]) {
        const well = [...state.cubes.layout(d).exists].map(k => state.cubes.cubes.get(k)).find(c => c.map.portals.some(p => p.kind === 'down'));
        enterCube(well, well.map.portals.find(p => p.kind === 'side').dir);
        for (let i = 0; i < 90; i++) frame();
        integrity(state, `depth ${d} well`);
        await trip(state.map.portals.find(p => p.kind === 'down'), `depth ${d} down`);
        const up = state.map.portals.find(p => p.kind === 'up');
        if (up) await trip(up, `depth ${d + 1} up`);
      }
      // arriving without a slide (town portal, death, doors): the set is rebuilt in place
      const visited = [...state.cubes.cubes.values()].filter(c => c.visits && c.map.portals.some(p => p.kind === 'side'));
      for (let t = 0; t < 10; t++) {
        const c = visited[rand(visited.length)];
        enterCube(c, c.map.portals.find(p => p.kind === 'side').dir);
        frame(); integrity(state, `jump ${t} to ${c.key}`);
        for (let i = 0; i < 30; i++) frame();
        integrity(state, `jump ${t} settled`);
      }
      // leaving the world (the main menu draws without culling): nothing of it may stay drawn
      clearNeighbors();
      const glass = scene.children.filter(o => o.geometry?.isInstancedBufferGeometry);
      check(glass.every(o => !o.visible && o.geometry.instanceCount === 0), 'Glass boxes must go with their proxies, culled or not');
      check(!scene.children.some(o => o.isBatchedMesh && o.visible), 'Batches must hide with their proxies, culled or not');
      const kinds = {}; for (const l of log) kinds[l.split(':')[0]] = (kinds[l.split(':')[0]] || 0) + 1;
      return { trips: log.length, kinds, last: log.slice(-3), ...neighborStats() };
    } finally {
      for (let i = 0; i < 200 && travelling(); i++) updateTravel(1 / 60);
      state.showNeighbors = show; await newWorld(seed);
    }
  });
}
