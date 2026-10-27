// Lightweight scenery only. The bird, helmet and recording are ordinary loot/equipment models.
import * as THREE from 'three';
import { state } from '../game/state.js';
import { voyageHas, VOYAGE_POSITIONS as POS } from '../core/qualmos-voyage.js';
import { buildVillagers, tickVillagers } from './villagers.js';
import { dressGlassmaker, poseGlassmaker } from './glassmaker.js';
function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;}
const glass=()=>new THREE.MeshStandardMaterial({color:0x80e7d5,emissive:0x124a47,emissiveIntensity:.4,roughness:.27,metalness:.15,transparent:true,opacity:.65,depthWrite:false});
function glassmaker(parent,color=0xc9c4ac){
  const views=buildVillagers([{id:'rescued-glassmaker',tint:color,x:0,y:0,z:0,yaw:0,
    outfit:[]}],parent);
  const view=views[0];
  if(!view){const empty=new THREE.Group();parent.add(empty);return empty;}
  const f=view.f;
  dressGlassmaker(f);
  f.group.name='Glassmaker';
  f.group.userData.glassmaker=view;
  return f.group;
}
function pad(parent,position){
  const m=mesh(new THREE.TorusGeometry(.6,.035,5,24),new THREE.MeshBasicMaterial({color:0x83ffe3,transparent:true,opacity:.65,depthWrite:false}),parent,...position);
  m.rotation.x=Math.PI/2;m.position.y+=.03;return m;
}
export function buildVoyageView(map,parent){
  if(!map.qualmos)return null;
  const root=new THREE.Group();parent.add(root);
  const q=map.qualmos,view={root,maker:null,cage:null};
  const light=new THREE.PointLight(0x99f6e1,36,20,2);light.position.set(8,6,8);root.add(light);
  if(q.kind==='room'){
    // Eight glass shards outline the large breach; nothing else decorates the empty room.
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,pos=q.holeDir===0?[15.35,3.5+1.6*Math.sin(a),8+2.5*Math.cos(a)]:[8+2.5*Math.cos(a),3.5+1.6*Math.sin(a),15.35];
      const shard=mesh(new THREE.ConeGeometry(.16,.6,3),glass(),root,...pos);shard.rotation.set(a,.4,a*.3);
    }
    pad(root,q.hole);
    const preview=new THREE.Group();preview.position.set(q.holeDir===0?38:8,8,q.holeDir===0?8:38);root.add(preview);
    mesh(new THREE.SphereGeometry(1.2,32,20),new THREE.MeshStandardMaterial({color:0x226d78,roughness:.28,metalness:.2,emissive:0x092f37,emissiveIntensity:.6}),preview);
    mesh(new THREE.SphereGeometry(1.28,24,16),new THREE.MeshBasicMaterial({color:0x83e6e3,wireframe:true,transparent:true,opacity:.13}),preview);
  }else if(q.kind==='planet'){
    // The broad platform is INSIDE the transparent globe, not balanced on its outside.
    const r=q.planetRadius,cy=4;
    mesh(new THREE.SphereGeometry(r,64,40),new THREE.MeshStandardMaterial({color:0x69cfc9,
      roughness:.15,metalness:.12,transparent:true,opacity:.07,depthWrite:false,
      side:THREE.BackSide,emissive:0x124a51,emissiveIntensity:.35}),root,8,cy,8);
    mesh(new THREE.SphereGeometry(r,32,20),new THREE.MeshBasicMaterial({color:0x8bfff0,
      wireframe:true,transparent:true,opacity:.075,depthWrite:false}),root,8,cy,8);
    const lagoon=q.lagoon;
    view.waterRings=[];
    for(let i=0;i<3;i++){
      const ring=mesh(new THREE.TorusGeometry(.65+i*.55,.018,4,48),new THREE.MeshBasicMaterial({color:0x9beee5,transparent:true,opacity:.3,depthWrite:false}),root,lagoon.x,lagoon.surface+.035,lagoon.z);
      ring.rotation.x=Math.PI/2;view.waterRings.push(ring);
    }
    view.maker=glassmaker(root);view.maker.position.set(...POS.rescue);
    view.cage=mesh(new THREE.CylinderGeometry(.65,.65,1.8,12,1,true),new THREE.MeshBasicMaterial({color:0x86deeb,wireframe:true,transparent:true,opacity:.4}),root,8,2.9,4.5);
    view.launch=pad(root,POS.launch);
  }else{
    for(let i=0;i<3;i++){const g=glassmaker(root,[0xc9c4ac,0xa9bdc9,0xd0b5a4][i]);g.position.set(6+i*2,2,7);}
    for(let i=0;i<2;i++){const cube=mesh(new THREE.BoxGeometry(3,3,3),new THREE.MeshBasicMaterial({color:0x7eeed5,wireframe:true,transparent:true,opacity:.3}),root,i?23:-7,4,5);cube.rotation.y=.4+i;}
  }
  return view;
}
export function tickVoyageView(view,map){
  if(!view||!state.run?.told)return;
  const q=map.qualmos,told=state.run.told;
  for(const child of view.root.children){
    const npc=child.userData.glassmaker;if(!npc)continue;
    Object.assign(npc.v,{x:child.position.x,y:child.position.y,z:child.position.z});
    tickVillagers([npc],1/60,state.time);
    poseGlassmaker(npc.f,state.time,npc.head);
  }
  if(view.cage)view.cage.visible=!state.run.unlockedGates.has(map.key);
  if(view.maker)view.maker.visible=!voyageHas(told,q.chapter,'rescued');
  if(view.launch)view.launch.visible=voyageHas(told,q.chapter,'rescued');
  for(const [i,ring] of (view.waterRings??[]).entries()){
    const phase=(state.time*.35+i/3)%1;ring.scale.setScalar(.55+phase*.8);ring.material.opacity=(1-phase)*.35;
  }
}
