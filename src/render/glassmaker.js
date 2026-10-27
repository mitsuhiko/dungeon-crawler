// The opening painting's craftsman (assets/film/glassmaker.png), on the town's human rig:
// round double goggles with a head strap, long tied leather apron, and his own blowpipe
// carrying a bubble of hot glass. None of these are borrowed merchant tools or hats.
import * as THREE from 'three';
import { restInverse } from './figure.js';

export function dressGlassmaker(f){
  const leather=new THREE.MeshStandardMaterial({color:0x875a3c,roughness:.9});
  const shirt=new THREE.MeshStandardMaterial({color:0x607774,roughness:.95});
  const brass=new THREE.MeshStandardMaterial({color:0xc49b55,metalness:.65,roughness:.27});
  const iron=new THREE.MeshStandardMaterial({color:0x53616a,metalness:.65,roughness:.3});
  const glass=new THREE.MeshStandardMaterial({color:0xa0efdb,emissive:0x278a74,emissiveIntensity:.5,
    roughness:.1,transparent:true,opacity:.32,depthWrite:false});
  const add=(parent,geo,mat,x,y,z)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const attach=(bone,group)=>{group.applyMatrix4(restInverse(bone));f.bones[bone].add(group);};
  const apron=new THREE.Group();
  add(apron,new THREE.BoxGeometry(.47,.56,.32),shirt,0,1.14,0);
  add(apron,new THREE.BoxGeometry(.43,.81,.035),leather,0,.98,.20);
  add(apron,new THREE.BoxGeometry(.25,.32,.035),leather,0,1.42,.18);
  for(const s of [-1,1])add(apron,new THREE.BoxGeometry(.045,.35,.035),leather,s*.13,1.5,.15);
  add(apron,new THREE.BoxGeometry(.49,.055,.36),leather,0,1.03,0);
  const knot=add(apron,new THREE.SphereGeometry(.055,8,6),leather,0,1.03,-.2);knot.scale.y=.6;
  for(const s of [-1,1]){const tie=add(apron,new THREE.BoxGeometry(.035,.28,.02),leather,s*.06,.92,-.22);tie.rotation.z=s*.5;}
  add(apron,new THREE.BoxGeometry(.20,.14,.025),leather,0,1.04,.23);
  attach('spine',apron);
  const goggles=new THREE.Group();goggles.name='GlassmakerGoggles';
  for(const s of [-1,1]){
    const side=s<0?'L':'R';
    const rim=add(goggles,new THREE.TorusGeometry(.098,.016,8,24),brass,s*.115,1.76,.258);
    rim.name=`GlassmakerGoggleRim.${side}`;
    const lens=add(goggles,new THREE.SphereGeometry(.087,16,10),glass,s*.115,1.76,.263);
    lens.name=`GlassmakerLens.${side}`;lens.scale.z=.14;
  }
  add(goggles,new THREE.BoxGeometry(.055,.026,.025),brass,0,1.76,.25);
  // The strap runs round the BACK of the head, never across the lenses.
  const strap=add(goggles,new THREE.TorusGeometry(.268,.018,6,32,Math.PI),leather,0,1.75,0);
  strap.name='GlassmakerGoggleStrap';strap.rotation.x=-Math.PI/2;
  for(const s of [-1,1])add(goggles,new THREE.BoxGeometry(.025,.025,.25),brass,s*.245,1.75,.125);
  attach('head',goggles);
  const pipe=new THREE.Group();
  const start=new THREE.Vector3(0,1.62,.23),end=new THREE.Vector3(0,1.46,2.25),direction=end.clone().sub(start);
  const tube=add(pipe,new THREE.CylinderGeometry(.018,.023,direction.length(),10),iron,...start.clone().add(end).multiplyScalar(.5).toArray());
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  const bubble=add(pipe,new THREE.IcosahedronGeometry(.26,2),glass,...end.toArray());
  add(pipe,new THREE.IcosahedronGeometry(.065,1),new THREE.MeshBasicMaterial({color:0xffb95a}),...end.toArray());
  attach('spine',pipe);
  f.group.userData.glassmakerOutfit={goggles,apron,pipe,bubble};
}
export function poseGlassmaker(f,time){
  // Both hands support his own blowpipe; a little breathing brings its glass to life.
  f.bones['upper_arm.R'].rotateX(-.8);f.bones['forearm.R'].rotateX(-1.15);
  f.bones['upper_arm.L'].rotateX(-1);f.bones['forearm.L'].rotateX(-.95);
  const outfit=f.group.userData.glassmakerOutfit;
  outfit?.bubble.scale.setScalar(1+.035*Math.sin(time*1.8));
}
