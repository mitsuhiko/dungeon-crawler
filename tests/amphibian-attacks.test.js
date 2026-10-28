import './fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AMPHIBIAN, attacksInReach, pickAttack } from '../src/core/enemies.js';
import { amphibianBarred } from '../src/core/amphibian.js';
import { prioritizeBellyFlop } from '../src/core/qualmos-attacks.js';

for(const [profile,phaseBarred] of [[AMPHIBIAN,amphibianBarred]]){
  test(`${profile.type}: belly flop is unlocked in phase two and preferred in range`,()=>{
    const e={profile,stage:1,mode:'chase',attack:0,attacks:2};
    assert.ok(phaseBarred(1).has('bellyFlop'));
    assert.ok(!phaseBarred(2).has('bellyFlop'));
    const base=phaseBarred(2),priority=prioritizeBellyFlop(e,base,3);
    const ready=attacksInReach(profile,3,0).filter(i=>!priority.has(profile.attacks[i].name));
    assert.deepEqual(ready.map(i=>profile.attacks[i].name),['bellyFlop']);
    for(const random of [0,.25,.5,.99])assert.equal(profile.attacks[pickAttack(profile,random,ready)].name,'bellyFlop');
    assert.ok(!base.has('grab'),'priority must not mutate the phase rules');
  });
  test(`${profile.type}: two other attacks make the next belly flop due, distant targets keep ranged attacks`,()=>{
    const e={profile,mode:'attack',attack:profile.attacks.findIndex(a=>a.name==='bellyFlop'),attacks:3};
    const base=phaseBarred(2);
    assert.equal(prioritizeBellyFlop(e,base,3),base);
    assert.equal(e.lastBellyFlopAttack,3);
    e.mode='chase';e.attack=0;e.attacks++;
    assert.equal(prioritizeBellyFlop(e,base,3),base);
    e.attacks++;
    assert.ok(prioritizeBellyFlop(e,base,3).has('grab'));
    assert.equal(prioritizeBellyFlop(e,base,7),base);
    assert.equal(prioritizeBellyFlop(e,base,3,2),base);
    assert.equal(prioritizeBellyFlop(e,phaseBarred(1),3).has('bellyFlop'),true);
  });
}
