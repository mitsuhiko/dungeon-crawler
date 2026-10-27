// Original glass phoenix: articulated wings, crest, long ribbon-like tail and landing feet.
// It is the little glass bird's grown form, not a downloaded stock illustration.
import * as THREE from 'three';

export function createGlassPhoenix(){
  const root=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color:0x75e5dc,
    roughness:.13,metalness:.18,transparent:true,opacity:.64,depthWrite:false,flatShading:true,
    emissive:0x19655b,emissiveIntensity:.35,side:THREE.DoubleSide});
  const gold=new THREE.MeshStandardMaterial({color:0xffc66e,emissive:0xff942e,emissiveIntensity:.7,roughness:.25,metalness:.2});
  const add=(geo,mat,parent,position,scale)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(...position);if(scale)m.scale.set(...scale);parent.add(m);return m;
  };
  const orb=(p,s,mat=glass,parent=root)=>add(new THREE.IcosahedronGeometry(1,2),mat,parent,p,s);
  // +X is forward; the back is broad enough for the rider.
  orb([0,0,0],[.85,.47,.36]);orb([.46,.43,0],[.30,.62,.25]);orb([.72,.9,0],[.31,.30,.23]);
  orb([.12,.06,0],[.22,.24,.21],gold);
  const feather=(parent,a,b,width,material=glass)=>{
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const m=add(new THREE.ConeGeometry(width,delta.length(),3),material,parent,start.clone().add(end).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
  };
  feather(root,[.9,.9,0],[1.35,.85,0],.13,gold);
  for(const side of [-1,1])orb([.86,.99,side*.19],[.055,.06,.045],gold);
  for(let i=0;i<5;i++)feather(root,[.53,.99,(i-2)*.045],[-.10-i*.075,1.45+Math.sin(i*.65)*.25,(i-2)*.11],.075);
  const wings=[];
  for(const side of [-1,1]){
    const wing=new THREE.Group();wing.position.set(-.1,.22,side*.22);root.add(wing);wings.push({wing,side});
    // Broad fan of overlapping long, faceted flight feathers; gold quills catch the light.
    for(let i=0;i<9;i++){
      const u=i/8;
      const a=[.2-u*.7,0,side*(.16+u*.68)];
      const b=[.1-u*1.65,.04,side*(1.15+Math.sin(u*Math.PI*.75)*1.65)];
      feather(wing,a,b,.22-u*.075);
      feather(wing,a,b,.016,gold);
    }
    feather(wing,[.35,.02,0],[.10,.08,side*1.85],.22);
  }
  const tails=[];
  for(let i=0;i<5;i++){
    const tail=new THREE.Group();tail.position.set(-.55,-.07,(i-2)*.1);root.add(tail);tails.push(tail);
    const tip=[-2.2-Math.cos((i-2)*.6)*.65,-.5-Math.cos(i)*.15,(i-2)*.26];
    feather(tail,[0,0,0],tip,.13);
    feather(tail,[0,0,0],tip,.016,gold);
    orb(tip,[.16,.07,.09],gold,tail);
  }
  const legs=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(.12,-.32,side*.18);root.add(leg);legs.push(leg);
    feather(leg,[0,0,0],[.1,-.42,0],.05,gold);
    for(const s of [-1,0,1])feather(leg,[.1,-.42,0],[.40,-.43,s*.09],.027,gold);
  }
  return {root,wings,tails,legs};
}
export function animateGlassPhoenix(view,time,{airborne=1,landing=0,calm=false}={}){
  const flap=calm?0:Math.sin(time*7.5);
  for(const {wing,side} of view.wings){
    wing.rotation.x=side*(.12+flap*.52*airborne)*(1-landing*.7);
    wing.rotation.y=side*(-.12-landing*.45);
  }
  view.tails.forEach((tail,i)=>{tail.rotation.z=calm?-.1:Math.sin(time*3.2+i*.6)*.09-.08;
    tail.rotation.y=Math.sin(time*1.6+i)*.025;});
  for(const leg of view.legs)leg.rotation.z=-(1-landing)*1.1;
}
