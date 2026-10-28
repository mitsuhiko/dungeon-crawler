// Short, self-contained travel film: the real glass bird grows, the hero mounts it,
// then they fly from the room/planet to the next world. All temporary GPU resources are owned here.
import * as THREE from 'three';
import { loadGLB } from './gltf.js';
import { createFigure, poseFigure, rigReady, wearLike, takeOff, loadThing, wear } from './figure.js';
import { character } from './character.js';
import { setSkinMap } from './skin.js';
import { cloneSkinned } from './skinned.js';
import { VOYAGE_FLIGHT_SECONDS, voyageFlightPose, GLASS_HELMET } from '../core/qualmos-voyage.js';
import { reduceMotion } from '../game/settings.js';
import { tr } from '../i18n/i18n.js';

function planet() {
  const group=new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.5,40,24),new THREE.MeshStandardMaterial({
    color:0x79ddd7,roughness:.15,transparent:true,opacity:.1,depthWrite:false,side:THREE.BackSide })));
  const land=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1,.18,32),new THREE.MeshStandardMaterial({color:0x689d86,roughness:.8}));
  land.position.y=-.35;group.add(land);
  const lake=new THREE.Mesh(new THREE.CircleGeometry(.38,32),new THREE.MeshStandardMaterial({color:0x2aadd0,roughness:.2,metalness:.3}));
  lake.rotation.x=-Math.PI/2;lake.position.set(.45,-.25,0);group.add(lake);
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.56,32,20),new THREE.MeshBasicMaterial({
    color:0x91ffed,wireframe:true,transparent:true,opacity:.13,depthWrite:false })));
  return group;
}
function glassWorld() {
  const group=new THREE.Group();
  const glass=new THREE.MeshStandardMaterial({color:0x79e8d3,emissive:0x17665c,roughness:.15,
    transparent:true,opacity:.28,depthWrite:false,metalness:.2});
  for(const [x,y,z,s] of [[0,0,0,1.6],[-1.6,.8,-.8,.65],[1.3,-.5,-.7,.8]]){
    const geo=new THREE.BoxGeometry(s,s,s),cube=new THREE.Mesh(geo,glass);cube.position.set(x,y,z);group.add(cube);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0xa1ffdf}));
    edges.position.copy(cube.position);group.add(edges);
  }
  const heart=new THREE.Mesh(new THREE.IcosahedronGeometry(.22,1),new THREE.MeshBasicMaterial({color:0xffbd67}));group.add(heart);
  group.rotation.y=.5;return group;
}
function ownedModel(source) {
  const root=source.clone(true);
  root.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=[].concat(o.material).map(m=>m.clone());if(o.material.length===1)o.material=o.material[0];}});
  return root;
}
function dispose(scene) {
  const geometries=new Set(),materials=new Set();
  scene.traverse(o=>{if(o.geometry&&!o.userData.sharedGeo)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material))materials.add(m);});
  for(const g of geometries)g.dispose();
  for(const m of materials)m.dispose(); // textures belong to the shared model loaders
}
export async function playVoyageFlight({ from='room', to='planet', current=()=>true }={}) {
  const [asset,phoenixAsset]=await Promise.all([loadGLB('assets/items/held_glass_bird.glb'),loadGLB('assets/glassphoenix.glb'),rigReady,loadThing(GLASS_HELMET)]);
  if(!current())return;
  const overlay=document.createElement('div');overlay.className='qualmos-flight';
  Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'75',background:'#030d20',overflow:'hidden',pointerEvents:'auto'});
  const caption=document.createElement('p');caption.textContent=to==='planet'
    ?tr('The glass bird grows. Climb on — next stop, the planet!')
    :tr('Climb on! The glass bird carries you back to the glass world.');
  Object.assign(caption.style,{position:'absolute',bottom:'8%',width:'100%',textAlign:'center',color:'#d7fff3',font:'22px system-ui',padding:'0 20px',boxSizing:'border-box'});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100);
  let renderer;
  try {
    renderer=new THREE.WebGLRenderer({alpha:false,antialias:true});renderer.setClearColor(0x030d20);
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    overlay.append(renderer.domElement,caption);document.body.append(overlay);
    Object.assign(renderer.domElement.style,{display:'block',width:'100%',height:'100%'});
    scene.add(new THREE.HemisphereLight(0xd9fff5,0x192b58,3));
    const light=new THREE.DirectionalLight(0xffdba6,4);light.position.set(-3,6,5);scene.add(light);
    const stars=new Float32Array(180*3);
    for(let i=0;i<stars.length;i+=3){stars[i]=Math.sin(i*13.37)*20;stars[i+1]=Math.cos(i*4.71)*12;stars[i+2]=-8-Math.abs(Math.sin(i*1.93))*12;}
    const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(stars,3));
    scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xbadfff,size:.045})));
    const destination=to==='planet'?planet():glassWorld();destination.position.set(5,1,-7);scene.add(destination);
    const origin=from==='planet'?planet():glassWorld();origin.position.set(-6,-2,-5);origin.scale.setScalar(.8);scene.add(origin);
    const mount=new THREE.Group(),bird=ownedModel(asset.scene);mount.add(bird);scene.add(mount);
    const phoenix=cloneSkinned(phoenixAsset.scene);phoenix.visible=false;
    phoenix.traverse(o=>{if(o.isMesh){o.material=[].concat(o.material).map(m=>m.clone());
      if(o.material.length===1)o.material=o.material[0];o.userData.sharedGeo=true;o.frustumCulled=false;}});
    const phoenixSize=new THREE.Box3().setFromObject(phoenix).getSize(new THREE.Vector3());
    phoenix.scale.setScalar(1.2/Math.max(...phoenixSize.toArray()));phoenix.rotation.y=Math.PI/2;mount.add(phoenix);
    const phoenixMixer=new THREE.AnimationMixer(phoenix),phoenixActions={};
    for(const clip of phoenixAsset.animations){const action=phoenixMixer.clipAction(clip);action.play();action.timeScale=0;
      action.setEffectiveWeight(0);phoenixActions[clip.name]=action;}
    // Centre the model in its own frame; its long axis is glTF Z.
    const box=new THREE.Box3().setFromObject(bird);bird.position.sub(box.getCenter(new THREE.Vector3()));
    bird.rotation.y=Math.PI/2;
    const rider=createFigure();
    // Keep the player's actual paint/skin, not an unrelated clay placeholder.
    rider.model.traverse(o=>{
      if(!o.isMesh)return;
      const source=character.clay?.find(mesh=>mesh.name===o.name);
      if(source){o.material.color.copy(source.material.color);if(source.material.map)setSkinMap(o,source.material.map);}
    });
    wearLike(rider,character);takeOff(rider,'shield');wear(rider,GLASS_HELMET,{slot:'head'});scene.add(rider.group);
    rider.group.rotation.y=Math.PI/2;
    const calm=reduceMotion(),duration=calm?5:VOYAGE_FLIGHT_SECONDS;
    const closeCamera=new THREE.Vector3(-.1,1.25,3.1),wideCamera=new THREE.Vector3(3,3.2,9);
    const look=new THREE.Vector3();
    const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};
    resize();addEventListener('resize',resize);
    const start=performance.now();
    try {
      await new Promise((resolve,reject)=>{
        const frame=now=>{
          try {
            if(!current()){resolve();return;}
            const elapsed=(now-start)/1000,t=elapsed/duration*VOYAGE_FLIGHT_SECONDS,p=voyageFlightPose(t);
            const distanceScale=THREE.MathUtils.lerp(1,.22,p.travel);
            const scale=THREE.MathUtils.lerp(.45,3.7,p.grow)*distanceScale;mount.scale.setScalar(scale);
            bird.visible=p.grow<.35;phoenix.visible=!bird.visible;
            const name=p.land>0?'PhoenixLand':p.grow<1?'PhoenixTakeoff':'PhoenixFly';
            for(const [clip,action] of Object.entries(phoenixActions)){
              action.setEffectiveWeight(clip===name?1:0);
              action.time=clip==='PhoenixLand'?p.land*1.4:clip==='PhoenixTakeoff'?p.grow*2.2:t%1.2;
            }
            phoenixMixer.update(0);
            const targetY=to==='planet'?.84:.54;
            mount.position.set(THREE.MathUtils.lerp(-1,1,p.grow)+p.travel*4,
              THREE.MathUtils.lerp(THREE.MathUtils.lerp(.6,1.1,p.grow)+p.travel*1.9,targetY,p.land),
              -p.travel*6.5-p.land*.5);
            mount.rotation.z=calm?0:Math.sin(p.travel*Math.PI)*.12*(1-p.land);
            rider.group.scale.setScalar(.8*distanceScale);
            const perch=new THREE.Vector3(0,-.01,0).multiplyScalar(scale).add(mount.position);
            rider.group.position.set(THREE.MathUtils.lerp(-1.6,perch.x,p.board),
              THREE.MathUtils.lerp(0,perch.y,p.board)+(calm?0:Math.sin(p.board*Math.PI)*1.35),
              THREE.MathUtils.lerp(.15,perch.z,p.board));
            poseFigure(rider);
            const seat=THREE.MathUtils.smoothstep(p.board,.55,1);
            for(const side of ['L','R']){
              rider.bones[`thigh.${side}`].rotation.x-=1.15*seat;
              rider.bones[`shin.${side}`].rotation.x+=1.3*seat;
              rider.bones[`upper_arm.${side}`].rotation.x-=.8*seat;
              rider.bones[`forearm.${side}`].rotation.x-=.65*seat;
            }
            if(p.board>=1)rider.group.position.y+=calm?0:Math.sin(t*3)*.025*distanceScale*(1-p.land);
            camera.position.lerpVectors(closeCamera,wideCamera,calm?1:p.grow);
            look.set(THREE.MathUtils.lerp(-1,.7,p.grow)+p.travel*1.5,
              THREE.MathUtils.lerp(.6,1.3,p.grow)+p.travel*.3,-1-p.travel*1.5);
            camera.lookAt(look);
            destination.rotation.y=t*.08;origin.position.x=-6-p.travel*5;
            overlay.style.opacity=String(1-p.fade);
            renderer.render(scene,camera);
            if(elapsed>=duration)resolve();else requestAnimationFrame(frame);
          }catch(error){reject(error);}
        };requestAnimationFrame(frame);
      });
    } finally { removeEventListener('resize',resize); }
  } finally {
    overlay.remove();dispose(scene);renderer?.dispose();renderer?.forceContextLoss();
  }
}
