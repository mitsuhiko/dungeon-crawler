// Qualmos rescue route. Equipment is ordinary floor loot and uses the existing bag/wear system.
import { player, state, setStatus } from './state.js';
import { enterCube } from './flow.js';
import { whenReady } from './hud.js';
import { clearOrder } from './orders.js';
import { cancelSword } from './sword.js';
import { groundItems } from './loot.js';
import { playRecording, narrate } from './narrator.js';
import { setInventoryOpen } from './inventory.js';
import { playVoyageFlight } from '../render/voyage-flight.js';
import { ITEMS } from '../core/items.js';
import { wornItem, equippedItem, countOf, takeOffItem } from '../core/inventory.js';
import { tr, msg } from '../i18n/i18n.js';
import { voyageFlag, voyageHas, voyageDestination, spendVoyageFlight, rescuedGlassmakers, voyageEquipmentProblem,
  GLASS_HELMET, glassBirdId, glassRecordingId, VOYAGE_POSITIONS as POS } from '../core/qualmos-voyage.js';

const bossDown = () => !!state.run?.unlockedGates.has(state.cubeKey);
export function voyageThingsHere() {
  const q=state.map?.qualmos,told=state.run?.told;
  if(!q||!told||state.mode!=='play')return [];
  const thing=(kind,xyz,title,height=.7)=>({id:`qualmos:${q.chapter}:${kind}`,voyage:true,voyageKind:kind,
    chapter:q.chapter,x:xyz[0],y:xyz[1],z:xyz[2],title,story:'voyage',questItem:true,
    count:1,labelY:height+.3,bodyHeight:height,radius:kind==='fly'?1:.45});
  if(q.kind==='room')return [thing('fly',q.hole,msg('Fly through the opening'),2)];
  if(q.kind==='planet'&&bossDown())return [
    !voyageHas(told,q.chapter,'rescued')&&thing('rescue',POS.rescue,msg('Rescue the glassmaker'),1.4),
    voyageHas(told,q.chapter,'rescued')&&thing('fly',POS.launch,msg('Fly to the next glass world'),1),
  ].filter(Boolean);
  return [];
}
export function pendingVoyageAction(){
  const list=voyageThingsHere().filter(t=>Math.hypot(t.x-player.x,t.z-player.z)<(t.voyageKind==='fly'?2.1:1.6)&&Math.abs(t.y-player.y)<1.3);
  list.sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
  const q=state.map?.qualmos,held=wornItem(player.inventory,'shield')?.itemId;
  // Holding the bird enables the action button anywhere in the room / rescued planet.
  // Taking it in hand alone never starts a flight.
  const heldFlight=q&&held===glassBirdId(q.chapter)?voyageThingsHere().find(t=>t.voyageKind==='fly'):null;
  const target=list.find(t=>t.voyageKind==='rescue')??heldFlight??list[0];
  return target?{kind:'voyage',target,label:tr(target.title)}:null;
}
// Called after an ordinary pickup has actually reached the bag; a full bag never sets progress.
export function voyageItemTaken(itemId){
  const def=ITEMS[itemId],q=state.map?.qualmos;
  if(!def?.voyagePart||!state.run)return;
  const chapter=def.voyageChapter??(q?.kind==='room'?q.chapter:null);
  if(!chapter)return;
  state.run.told.add(voyageFlag(chapter,def.voyagePart));
  if(def.voyagePart==='message')playVoyageRecording(chapter);
}
export function playVoyageRecording(chapter){
  if(!countOf(player.inventory,glassRecordingId(chapter)))return false;
  state.run.told.add(voyageFlag(chapter,'message'));
  return playRecording('qualmos');
}
export function voyageEquipmentReady(chapter){
  const inv=player.inventory;
  const problem=voyageEquipmentProblem(chapter,{head:wornItem(inv,'head')?.itemId,
    offhand:wornItem(inv,'shield')?.itemId,bow:ITEMS[equippedItem(inv)?.itemId]?.weapon?.kind==='bow'});
  if(problem==='helmet'){setStatus(tr('Put on the glass breathing helmet in your inventory first.'));return false;}
  if(problem==='bird'){
    setStatus(tr('Hold this world’s glass bird in your off hand before flying.'));return false;
  }
  return true;
}
export function useVoyageThing(target){
  const current=pendingVoyageAction();
  if(!current||current.target.id!==target.id||state.transitioning||state.inventoryOpen||state.menuOpen||player.hp<=0||player.ragdoll)return false;
  const q=state.map.qualmos,told=state.run.told;
  if(target.voyageKind==='rescue'){
    told.add(voyageFlag(q.chapter,'rescued'));
    narrate('glassmaker',{what:'rescued',chapter:q.chapter});
    setStatus(tr('Glassmakers rescued: {n}/3',{n:rescuedGlassmakers(told)}));return true;
  }
  if(target.voyageKind==='fly'){
    startVoyageFlight();
    return true;
  }
  return false;
}
function startVoyageFlight(){
  const q=state.map?.qualmos;
  if(!q||!['room','planet'].includes(q.kind)||state.transitioning||state.menuOpen||player.hp<=0||player.ragdoll)return false;
  if(!voyageEquipmentReady(q.chapter))return false;
  const to=voyageDestination(state.run.told,q,bossDown());
  if(!to){setStatus(q.kind==='planet'?tr('First defeat Qualmos and rescue the glassmaker.')
    :tr('First collect the recording and listen to the glassmaker.'));return false;}
  if(state.inventoryOpen)setInventoryOpen(false);
  flyTo(to,q.chapter).catch(error=>{console.error('Glass bird flight failed',error);setStatus(tr('The flight could not start. Your bird charge was not used.'));});
  return true;
}
async function flyTo(to,chapter){
  if(state.transitioning)return;
  const cubes=state.cubes,run=state.run,from=state.map.qualmos.kind;state.transitioning=true;clearOrder();cancelSword(true);
  try{
    const c=await whenReady(cubes.get(to.key));if(state.cubes!==cubes)return;
    await playVoyageFlight({from,to:c.map.qualmos.kind,current:()=>state.cubes===cubes});if(state.cubes!==cubes)return;
    if(!spendVoyageFlight(run.told,chapter,to.charge))throw Error('No bird charge');
    try{enterCube(c,null,null,c.map.qualmos.arrival);}
    catch(error){if(to.charge)run.told.delete(voyageFlag(chapter,to.charge));throw error;}
    // The bird shrinks back into the bag. Take it in hand again for the return flight.
    takeOffItem(player.inventory,'shield');
    player.hp=player.maxHp;
    setStatus(c.map.qualmos.kind==='home'?tr('All three glassmakers are safe. Thank you!')
      :tr('Glassmakers rescued: {n}/3',{n:rescuedGlassmakers(run.told)}));
  }finally{if(state.cubes===cubes)state.transitioning=false;}
}
// The action button starts travel; this loop only prepares the ordinary floor pickups.
export function updateVoyage(){
  const q=state.map?.qualmos;if(!q||state.mode!=='play'||state.transitioning)return;
  if(q.kind==='room'){
    const items=[['bird',glassBirdId(q.chapter)],['helmet',GLASS_HELMET],['message',glassRecordingId(q.chapter)]];
    groundItems(`qualmos-kit:${q.chapter}`,items.map(([kind,itemId])=>({itemId,count:1,x:POS[kind][0],y:POS[kind][1],z:POS[kind][2]})));
  }
}
