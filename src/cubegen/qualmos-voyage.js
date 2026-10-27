// Lightweight authored spaces for Qualmos' three-world rescue route. No random clutter or falls.
import { N, LH, DIRS, WATER } from '../core/constants.js';
import { idx } from '../core/util.js';
import { indexBlockers } from '../core/blockers.js';
import { createContext } from './context.js';
import { VOYAGE_LAGOON, VOYAGE_PLANET_RADIUS } from '../core/qualmos-voyage.js';

export function generateVoyageMap(spec, voyage) {
  const ctx = createContext(spec.seed), planet = voyage.kind === 'planet', room = voyage.kind === 'room';
  const entry = spec.portals?.find(p => p.dir < 4);
  const level = 4, holeDir = entry?.dir === 0 ? 2 : 0;
  const hole = holeDir === 0 ? [13.5, 2, 8] : [8, 2, 13.5];
  const portalAt = p => {
    const pos = p.pos ?? 7;
    return [[N - 1, pos], [0, pos], [pos, N - 1], [pos, 0]][p.dir];
  };
  const isDoor = (x, z) => entry && (() => { const [px, pz] = portalAt(entry); return Math.hypot(x-px,z-pz) < 2; })();
  const isHole = (x, z) => holeDir === 0 ? x === N-1 && z >= 5 && z <= 10 : z === N-1 && x >= 5 && x <= 10;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (planet && Math.hypot(x+.5-8, z+.5-8) > 9.6) continue;
    const border = x===0 || z===0 || x===N-1 || z===N-1;
    const wall = room && border && !isDoor(x,z) && !isHole(x,z);
    const wet = planet && Math.hypot(x+.5-VOYAGE_LAGOON.x,z+.5-VOYAGE_LAGOON.z) < VOYAGE_LAGOON.radius;
    const f=ctx.mk(idx(x,z), wet ? VOYAGE_LAGOON.bed/LH : wall ? 15 : level, wet ? VOYAGE_LAGOON.bed/LH-1 : 0, 0);
    Object.assign(f,{fluid:wet?WATER:0,surf:wet?VOYAGE_LAGOON.surface/LH:0,
      cs:Array(4).fill(f.top*LH),split:0,encounter:planet,arenaCell:true});
    ctx.cols[f.c].push(f);
  }
  const floors=ctx.cols.flat();
  floors.forEach((f,i)=>{f.id=i;f.link=DIRS.map(([dx,dz])=>{
    const x=f.x+dx,z=f.z+dz;
    if(x<0||z<0||x>=N||z>=N)return null;
    return ctx.cols[idx(x,z)].find(g=>g.top===f.top)??null;
  });});
  const at=(x,z)=>ctx.cols[idx(Math.floor(x),Math.floor(z))][0];
  const portals=entry?[(()=>{const [x,z]=portalAt(entry);return {id:1,kind:'side',dir:entry.dir,layer:0,cells:[idx(x,z)],x,z,y:2,floor:at(x,z)};})()]:[];
  const blockers=indexBlockers([]),guardFloor=at(8.5,8.5);
  Object.assign(ctx.stats,{layers:1,mode:`Qualmos ${voyage.kind} ${voyage.chapter}`});
  return {
    key:spec.key,seed:spec.seed,depth:20,K:1,B:[0],attempts:1,kind:'meadow',biome:spec.biome,
    archetype:'arena',cave:false,walled:false,qualmos:{...voyage,hole,holeDir,arrival:{x:8,y:2,z:12},
      ...(planet?{planetRadius:VOYAGE_PLANET_RADIUS,lagoon:{...VOYAGE_LAGOON}}:{})},
    cols:ctx.cols,floors,pieces:Array.from({length:N*N},()=>[]),runs:[],falls:[],ladders:[],
    fences:new Map(),fenceList:[],moves:[],routes:[],portals,exit:null,stats:ctx.stats,
    safe:Uint8Array.from(floors,f=>f.top===level&&!f.fluid?1:0),gateKeys:[null,null,null,null],trialFaces:[null,null,null,null],
    enemyFree:!planet,populationScale:planet?1:0,horde:null,
    guardian:planet?{role:'descent',bossPlaceholder:false,boss:'amphibian',final:true,exit:null,portalId:null,
      floor:guardFloor,x:8.5,z:8.5,y:2,yaw:0,approach:[0,-1]}:null,
    arena:planet?{type:'glass-planet',requested:'glass-planet'}:null,
    authoredProps:[],arenaPlacements:[],rewardSites:[],siteFailures:[],sitePlacements:[],siteReservations:[],spots:[],
    staticBlockers:blockers,blockers,occluders:[],clues:[],
  };
}
