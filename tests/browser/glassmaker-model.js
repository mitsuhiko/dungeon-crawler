// In a game page: await (await import('/tests/browser/glassmaker-model.js')).runGlassmakerModelChecks()
// Standalone: does not require the rescue route or alter the current world / hero.
import * as THREE from 'three';
import {rigReady,createFigure,poseFigure} from '../../src/render/figure.js';
import {dressGlassmaker,poseGlassmaker} from '../../src/render/glassmaker.js';
const check=(ok,text)=>{if(!ok)throw Error(text);};
export async function runGlassmakerModelChecks(){
  await rigReady;
  const f=createFigure(),materials=new Set(),geometries=new Set();
  try{
    dressGlassmaker(f);
    for(const time of [0,1,3]){
      poseFigure(f);poseGlassmaker(f,time);
      const outfit=f.group.userData.glassmakerOutfit;
      check(outfit.goggles.parent===f.bones.head,'Goggles must follow the head');
      for(const side of ['L','R']){
        check(!!outfit.goggles.getObjectByName(`GlassmakerGoggleRim.${side}`),'Missing round frame');
        const lens=outfit.goggles.getObjectByName(`GlassmakerLens.${side}`);
        check(lens?.material.transparent&&lens.material.opacity<1,'Missing clear lens');
        const hand=f.bones[`hand.${side}`].getWorldPosition(new THREE.Vector3());
        const grip=outfit.grips[side].getWorldPosition(new THREE.Vector3());
        check(f.model.worldToLocal(hand.clone()).z>.2,`${side} hand points behind the body`);
        check(hand.distanceTo(grip)<.02,`${side} hand misses the shortened pipe`);
      }
    }
    return 'Glassmaker: own goggles, apron, blowpipe and forward grips OK';
  }finally{
    f.group.traverse(o=>{if(o.geometry&&!o.userData.sharedGeo)geometries.add(o.geometry);
      if(o.material)for(const m of [].concat(o.material))materials.add(m);});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  }
}
