import './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { birdFlights, voyageFlag, voyageHas, voyageReady, voyageDestination, spendVoyageFlight,
  rescuedGlassmakers, voyageRoomKey, voyagePlanetKey, voyagePocket, VOYAGE_HOME,
  GLASS_HELMET, glassBirdId, glassRecordingId, voyageEquipmentProblem,
  voyageFlightPose, VOYAGE_FLIGHT_SECONDS, VOYAGE_PLANET_RADIUS } from '../src/core/qualmos-voyage.js';
import { ITEMS } from '../src/core/items.js';
import { generateVoyageMap } from '../src/cubegen/qualmos-voyage.js';
import { WATER, LH } from '../src/core/constants.js';
import { readGlb, roots, BOUNDS, isCompressed } from '../tools/glb.mjs';
import { createInventory, addItem, slotOf, wearItem, wornItem } from '../src/core/inventory.js';

const collectKit = (told, chapter) => {
  for (const part of ['bird', 'helmet', 'message']) told.add(voyageFlag(chapter, part));
};

test('each rescue needs its kit, two distinct flights and a defeated boss', () => {
  const told = new Set();
  for (let chapter = 1; chapter <= 3; chapter++) {
    const room = { kind: 'room', chapter }, planet = { kind: 'planet', chapter };
    assert.equal(birdFlights(told, chapter), 0);
    assert.equal(voyageDestination(told, room), null);
    for (const part of ['bird', 'helmet']) told.add(voyageFlag(chapter, part));
    assert.equal(voyageReady(told, chapter), false);
    assert.equal(spendVoyageFlight(told, chapter, 'outbound'), false);
    told.add(voyageFlag(chapter, 'message'));
    assert.equal(birdFlights(told, chapter), 2);
    const outward = voyageDestination(told, room);
    assert.deepEqual(outward, { key: voyagePlanetKey(chapter), charge: 'outbound' });
    // Merely resolving/loading a destination never spends a charge.
    assert.equal(birdFlights(told, chapter), 2);
    assert.equal(spendVoyageFlight(told, chapter, outward.charge), true);
    assert.equal(birdFlights(told, chapter), 1);
    assert.equal(spendVoyageFlight(told, chapter, 'outbound'), false);
    assert.equal(voyageDestination(told, planet, true), null);
    assert.equal(spendVoyageFlight(told, chapter, 'onward'), false);
    told.add(voyageFlag(chapter, 'rescued'));
    assert.equal(voyageDestination(told, planet, false), null);
    const onward = voyageDestination(told, planet, true);
    assert.deepEqual(onward, { key: chapter < 3 ? voyageRoomKey(chapter + 1) : VOYAGE_HOME, charge: 'onward' });
    assert.equal(spendVoyageFlight(told, chapter, onward.charge), true);
    assert.equal(birdFlights(told, chapter), 0);
    assert.equal(spendVoyageFlight(told, chapter, 'onward'), false);
    assert.equal(voyageDestination(told, planet, true), null);
    assert.equal(voyageDestination(told, room), null);
    assert.equal(rescuedGlassmakers(told), chapter);
  }
});

test('returning to an unfinished chapter does not spend the outward charge again', () => {
  const told = new Set();
  collectKit(told, 1);
  assert.equal(spendVoyageFlight(told, 1, 'outbound'), true);
  const retry = voyageDestination(told, { kind: 'room', chapter: 1 });
  assert.deepEqual(retry, { key: voyagePlanetKey(1), charge: null });
  assert.equal(spendVoyageFlight(told, 1, retry.charge), true);
  assert.equal(birdFlights(told, 1), 1);
  // An entry failure rolls back the tentative charge, allowing another try.
  told.delete(voyageFlag(1, 'outbound'));
  assert.equal(birdFlights(told, 1), 2);
  assert.equal(spendVoyageFlight(told, 1, 'outbound'), true);
  assert.equal(spendVoyageFlight(told, 1, 'unknown'), false);
  assert.equal(voyageHas(told, 2, 'outbound'), false);
});

test('travel requires the helmet on the head and this chapter’s bird in the hand', () => {
  for (let chapter = 1; chapter <= 3; chapter++) {
    assert.equal(voyageEquipmentProblem(chapter, {}), 'helmet');
    assert.equal(voyageEquipmentProblem(chapter, { head: GLASS_HELMET }), 'bird');
    const equipped = { head: GLASS_HELMET, offhand: glassBirdId(chapter) };
    assert.equal(voyageEquipmentProblem(chapter, equipped), null);
    assert.equal(voyageEquipmentProblem(chapter, { ...equipped, bow: true }), 'bird');
    assert.equal(voyageEquipmentProblem(chapter, { ...equipped, head: 'wear_miner_helmet' }), 'helmet');
    assert.equal(voyageEquipmentProblem(chapter, { ...equipped, offhand: glassBirdId(chapter % 3 + 1) }), 'bird');
  }
});

test('voyage models have visible bird geometry, a close-fitting transparent helmet and a spherical recording', () => {
  const model = name => {
    const { json } = readGlb(new URL(`../assets/items/${name}.glb`, import.meta.url));
    assert.ok(isCompressed(json), name);
    const root = json.nodes[roots(json)[0]], bounds = root.extras[BOUNDS];
    return { json, root, size: bounds.max.map((v, i) => v - bounds.min[i]) };
  };
  assert.equal(ITEMS[GLASS_HELMET].floorScale,1.25);
  for(let chapter=1;chapter<=3;chapter++)assert.equal(ITEMS[glassBirdId(chapter)].floorScale,1.5);
  const bird = model('held_glass_bird');
  assert.equal(bird.root.extras.socket, 'hand.L');
  assert.ok(Math.max(...bird.size) >= .7 && Math.max(...bird.size) <= .75, 'bird must not be scaled down twice');
  const helmet = model('wear_glass_helmet');
  assert.equal(helmet.root.extras.socket, 'head');
  assert.ok(Math.max(...helmet.size) <= .65, 'helmet must fit the head, not surround the torso');
  const glass = helmet.json.materials.find(m => m.name === 'VoyageGlass');
  assert.equal(glass.alphaMode, 'BLEND');
  assert.ok(glass.pbrMetallicRoughness.baseColorFactor[3] <= .2, 'face must show through the dome');
  const recording = model('item_glass_recording');
  assert.ok(Math.max(...recording.size) / Math.min(...recording.size) < 1.1, 'recording must be a sphere, not an egg');
});

test('the wider platform has a globe and a deep water refuge beside dry arrivals', () => {
  for(let chapter=1;chapter<=3;chapter++){
    const map=generateVoyageMap({key:voyagePlanetKey(chapter),seed:123}, {kind:'planet',chapter});
    assert.equal(map.qualmos.planetRadius,8.25);
    assert.ok(map.floors.length>200,'the platform is wider than the original landing island');
    assert.equal(map.qualmos.planetRadius,VOYAGE_PLANET_RADIUS);
    const water=map.floors.filter(f=>f.fluid===WATER);
    assert.ok(water.length>=15);
    assert.ok(water.every(f=>(f.surf-f.top)*LH>3.35),'boss must fit completely under the water');
    const at=(x,z)=>map.cols[Math.floor(z)*16+Math.floor(x)][0];
    assert.equal(at(map.qualmos.lagoon.x,map.qualmos.lagoon.z).fluid,WATER);
    for(const [x,z] of [[8,12],[8,4.5],[8.5,8.5]]){
      assert.equal(at(x,z).fluid,0,'arrival, rescue and boss spawn stay dry');
      assert.equal(at(x,z).top*LH,2);
    }
  }
});

test('the flight grows the bird, boards the rider, travels, and lands before fading', () => {
  assert.deepEqual(voyageFlightPose(0),{grow:0,board:0,travel:0,land:0,fade:0});
  assert.equal(voyageFlightPose(.6).grow,0);
  assert.equal(voyageFlightPose(2.2).grow,1);
  assert.equal(voyageFlightPose(2.2).board,0);
  assert.ok(voyageFlightPose(3.3).board>.999);
  assert.equal(voyageFlightPose(3.5).travel,0);
  assert.ok(voyageFlightPose(6.1).travel>.999);
  assert.equal(voyageFlightPose(6.1).land,0);
  assert.ok(voyageFlightPose(7.5).land>.999);
  assert.equal(voyageFlightPose(7.9).fade,0);
  assert.ok(voyageFlightPose(VOYAGE_FLIGHT_SECONDS).fade>.999);
});

test('pocket keys are distinct and identify the right chapter', () => {
  const keys = [voyageRoomKey(1), VOYAGE_HOME];
  assert.equal(voyagePocket(voyageRoomKey(1)), null); // The real core is part of the world graph.
  for (let chapter = 1; chapter <= 3; chapter++) {
    const planet = voyagePlanetKey(chapter);
    keys.push(planet);
    assert.deepEqual(voyagePocket(planet), { kind: 'planet', chapter });
    if (chapter > 1) {
      keys.push(voyageRoomKey(chapter));
      assert.deepEqual(voyagePocket(voyageRoomKey(chapter)), { kind: 'room', chapter });
    }
  }
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(voyagePocket(VOYAGE_HOME), { kind: 'home', chapter: 3 });
  assert.equal(voyagePocket('0,0,0'), null);
});

test('the helmet and chapter birds use ordinary inventory wear slots', () => {
  const inv = createInventory();
  assert.equal(addItem(inv, GLASS_HELMET), true);
  assert.equal(wearItem(inv, slotOf(inv, GLASS_HELMET).instanceId), true);
  assert.equal(wornItem(inv, 'head').itemId, GLASS_HELMET);
  for (let chapter = 1; chapter <= 3; chapter++) {
    const bird = glassBirdId(chapter), recording = glassRecordingId(chapter);
    assert.equal(addItem(inv, bird), true);
    assert.equal(wearItem(inv, slotOf(inv, bird).instanceId), true);
    assert.equal(wornItem(inv, 'shield').itemId, bird);
    assert.equal(ITEMS[recording].use, 'glassRecording');
    assert.equal(ITEMS[recording].voyageChapter, chapter);
  }
});
