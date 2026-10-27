// In a rescue planet / home world: await (await import('./tests/browser/glassmaker.js')).runGlassmakerChecks()
import { state } from '../../src/game/state.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function runGlassmakerChecks(){
  const makers=state.world?.voyageView?.root.children.filter(o=>o.userData.glassmaker)??[];
  check(makers.length>0,'Enter a rescue planet or the glassmakers’ home first');
  for(const maker of makers){
    const outfit=maker.userData.glassmakerOutfit,goggles=outfit?.goggles;
    check(goggles?.parent===maker.userData.glassmaker.f.bones.head,'Glasses must follow the head');
    for(const side of ['L','R']){
      const lens=goggles.getObjectByName(`GlassmakerLens.${side}`);
      check(lens?.material.transparent&&lens.material.opacity<1,`Missing transparent ${side} lens`);
      check(!!goggles.getObjectByName(`GlassmakerGoggleRim.${side}`),`Missing ${side} round frame`);
    }
    const strap=goggles.getObjectByName('GlassmakerGoggleStrap');
    check(strap?.geometry.parameters.arc===Math.PI&&strap.rotation.x<0,'Strap must go behind the head, not across the eyes');
  }
  return `${makers.length} glassmaker(s): round glasses, clear lenses and head straps OK`;
}
