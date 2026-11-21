import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {assets} from './paths.js';
import {readGlb,isCompressed} from '../tools/glb.mjs';

test('the glass phoenix is compressed, skinned and has articulated wings and landing feet',()=>{
  const {json:j}=readGlb(resolve(assets,'glassphoenix.glb'));
  assert.ok(isCompressed(j));assert.equal(j.skins.length,1);
  assert.ok(j.materials.length<=4);
  for(const bone of ['body','head','wing.L','wing.R','foot.L','foot.R','tail'])
    assert.ok(j.nodes.some(n=>n.name===bone),bone);
  assert.ok(j.materials.some(m=>m.alphaMode==='BLEND'),'glass must let light through');
  const clips=new Map(j.animations.map(a=>[a.name,a]));
  assert.deepEqual([...clips.keys()].sort(),['PhoenixFly','PhoenixLand','PhoenixTakeoff']);
  for(const [name,seconds] of [['PhoenixFly',1.2],['PhoenixLand',1.4],['PhoenixTakeoff',2.2]]){
    const clip=clips.get(name),duration=Math.max(...clip.samplers.map(s=>j.accessors[s.input].max[0]));
    assert.ok(Math.abs(duration-seconds)<.05,name);
    for(const bone of ['wing.L','wing.R']){
      const index=j.nodes.findIndex(n=>n.name===bone);
      assert.ok(clip.channels.some(c=>c.target.node===index&&c.target.path==='rotation'),`${name}: ${bone} must move`);
    }
  }
});
