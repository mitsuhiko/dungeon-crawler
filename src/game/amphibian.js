// Qualmos prototype: the core's boss, or a developer spawn. Shared AI owns hits and movement.
import { AMPHIBIAN, makeEnemy, attackOf } from '../core/enemies.js';
import { amphibianFloor, amphibianBarred, amphibianWaterPose, amphibianPressure } from '../core/amphibian.js';
import { player, state, setStatus } from './state.js';
import { prioritizeBellyFlop } from '../core/qualmos-attacks.js';
import { enemySpots } from './enemyspawn.js';
import { stepEnemies } from './enemyai.js';
import { sweep } from './bossfight.js';
import { removeEnemyViews } from '../render/enemies.js';
import { tr } from '../i18n/i18n.js';
export let amphibians = [];
function strengthen(e){
  const base=e.nativeProfile,k=amphibianPressure(e.stage);
  e.profile={...base,damage:Math.round(base.damage*k.damage),chase:base.chase*k.chase,
    cooldown:base.cooldown*k.cooldown,size:1.08,
    attacks:base.attacks.map(a=>({...a,...(a.recover?{recover:a.recover*k.cooldown}:{})}))};
}
export function addAmphibians(list) {
  for (const e of list) {
    e.nativeProfile=e.profile;e.stage = 1;strengthen(e);e.barred = amphibianBarred(1);
    e.hpFloor = amphibianFloor(1, e.profile.hp);
    e.cast = () => {};
    e.waterWait = 12; e.waterRetreat = null;e.lastBellyFlopAttack=null;
    amphibians.push(e);
  }
}
export function resetAmphibians() {
  removeEnemyViews(amphibians); amphibians = [];
  addAmphibians(enemySpots(state.map, AMPHIBIAN).filter(s => !state.run.defeated.has(s.id)).map(s => makeEnemy(s, AMPHIBIAN)));
}
export function detachAmphibians() { const out = amphibians; amphibians = []; return out; }
export function updateAmphibians(dt) {
  const active=[];
  for (const e of amphibians) {
    if (e.mode === 'dead') { e.under=0;e.waterRetreat=null;active.push(e);continue; }
    const lagoon=state.map?.qualmos?.lagoon;
    if(lagoon&&!state.devPassive&&!e.dormant){
      if(e.mode==='chase'||e.mode==='attack')e.waterWait-=dt;
      if(!e.waterRetreat&&e.waterWait<=0&&e.mode==='chase'&&e.hp>e.hpFloor){
        e.waterRetreat={t:0,from:{x:e.x,y:e.y,z:e.z},floor:e.f};
        e.attack=e.profile.attacks.findIndex(a=>a.name==='dive');e.attacks++;
        e.path=null;e.kbx=e.kbz=0;
        setStatus(tr('Qualmos slips into the water. Watch for him to surface!'));
      }
    }
    if(e.waterRetreat){
      const retreat=e.waterRetreat;retreat.t+=dt;
      const pose=amphibianWaterPose(retreat.t,retreat.from,lagoon);
      e.x=pose.x;e.y=pose.y;e.z=pose.z;e.under=+pose.under;
      e.mode='attack';e.t=Math.min(retreat.t,2.8);e.speed=pose.under?0:2;
      e.hurtT=Math.max(0,e.hurtT-dt);e.shield=0;
      if(pose.done){
        Object.assign(e,retreat.from);e.f=retreat.floor;e.under=0;e.waterRetreat=null;
        e.waterWait=14;e.mode='chase';e.cool=1;e.speed=0;e.think=0;
      }
      // No ordinary AI, hits or knockback while following the authored dive route.
      continue;
    }
    active.push(e);
    if (e.stage < 5 && e.hp <= e.hpFloor && e.mode !== 'attack') {
      e.stage++;strengthen(e);
      e.barred = amphibianBarred(e.stage);
      e.hpFloor = amphibianFloor(e.stage, e.profile.hp);
      e.attack = e.profile.attacks.findIndex(a => a.name === 'rage');
      e.mode = 'attack'; e.t = 0; e.bit = false; e.attacks++; e.speed = 0;
      setStatus(tr('Qualmos enters phase {phase}!', { phase: e.stage }));
    }
    if(e.mode==='attack'&&attackOf(e).name==='grab'&&e.announcedGrab!==e.attacks){
      e.announcedGrab=e.attacks;setStatus(tr('Qualmos reaches for your throat — dodge the grab!'));
    }
    const target=e.target?.here?e.target:player;
    e.barred=prioritizeBellyFlop(e,amphibianBarred(e.stage),Math.hypot(target.x-e.x,target.z-e.z),Math.abs(target.y-e.y));
    // Invulnerability only for the visible phase transition, not for an entire phase.
    e.shield = e.mode === 'attack' && attackOf(e).name === 'rage' ? .1 : 0;
  }
  stepEnemies(active, dt);
  amphibians = sweep(amphibians, dt);
}
