import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { assets } from './paths.js';
import { readGlb, accessorValues, decoderReady } from '../tools/glb.mjs';
import { SKIN_UV } from '../src/core/skin.js';

await decoderReady;
test('exported character UVs cover every triangle, have no mirrored overlap and pack densely', () => {
  const file = readGlb(resolve(assets,'character.glb')), j = file.json;
  assert.ok(j.nodes.some(n=>n.extras?.skin_uv_version === SKIN_UV));
  const size = 1024, occupied = new Uint8Array(size*size);
  let coverage = 0, overlaps = 0;
  for (const mesh of j.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'SkinUV must survive GLB compression');
    const uv = accessorValues(file,primitive.attributes.TEXCOORD_0);
    const indices = accessorValues(file,primitive.indices);
    assert.ok(uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'UV inside atlas');
    for (let i = 0; i < indices.length; i+=3) {
      const points = indices.slice(i,i+3).map(v=>[uv[v*2]*size,uv[v*2+1]*size]);
      const edge = (a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
      const [a,b,c] = points, area = edge(a,b,...c), sign = Math.sign(area);
      assert.ok(Math.abs(area)>1e-6,'No collapsed UV triangle');
      const x0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))));
      const y0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))));
      const x1=Math.min(size-1,Math.ceil(Math.max(...points.map(p=>p[0]))));
      const y1=Math.min(size-1,Math.ceil(Math.max(...points.map(p=>p[1]))));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
        if(edge(a,b,x+.5,y+.5)*sign<=1e-7||edge(b,c,x+.5,y+.5)*sign<=1e-7||edge(c,a,x+.5,y+.5)*sign<=1e-7)continue;
        const p=y*size+x;
        if(occupied[p])overlaps++;else{occupied[p]=1;coverage++;}
      }
    }
  }
  assert.equal(overlaps,0,'Separate body surfaces must never share painted texels');
  assert.ok(coverage>size*size*.5,`Use at least half the atlas (${(coverage/size/size*100).toFixed(1)}%)`);
});
