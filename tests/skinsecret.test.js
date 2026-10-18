import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { assets } from './paths.js';
import { NINJA_SKIN_CODE, isNinjaSkinCode, SKIN_SIZE, SKIN_UV } from '../src/core/skin.js';

test('the Easter egg requires the complete colon-prefixed skin name', () => {
  assert.equal(NINJA_SKIN_CODE, ':ninjajavamc');
  for (const value of [':ninjajavamc', ' :NinjaJavaMC ', ':ＮＩＮＪＡＪＡＶＡＭＣ']) assert.equal(isNinjaSkinCode(value), true);
  for (const value of ['', null, 'ninjajavamc', ':ninjajava', ':ninjajavamc!', 'prefix:ninjajavamc']) assert.equal(isNinjaSkinCode(value), false);
});

test('the bundled skin is a UV-versioned 2048² stone/cyan PNG with eyes and a grass/dirt back motif', () => {
  const png = readFileSync(resolve(assets, 'skins/ninjajavamc.png'));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const compressed = [];
  let uv;
  for (let offset=8; offset<png.length;) {
    const length=png.readUInt32BE(offset), type=png.toString('ascii',offset+4,offset+8);
    const data=png.subarray(offset+8,offset+8+length);
    if(type==='IHDR') {
      assert.equal(data.readUInt32BE(0),SKIN_SIZE);assert.equal(data.readUInt32BE(4),SKIN_SIZE);
      assert.equal(data[8],8);assert.equal(data[9],6,'8-bit RGBA');assert.equal(data[12],0,'Non-interlaced');
    }
    if(type==='tEXt'&&data.toString().startsWith('SkinUV\0'))uv=data.toString().slice(7);
    if(type==='IDAT')compressed.push(data);
    offset+=length+12;
  }
  assert.equal(uv,SKIN_UV,'Baked paint must match the runtime UV layout');
  const rows=inflateSync(Buffer.concat(compressed)), stride=SKIN_SIZE*4+1;
  assert.equal(rows.length,stride*SKIN_SIZE);
  let cyan=0,stone=0,grass=0,dirt=0,darkEye=0,iceEye=0,navy=0,transparent=0;
  for(let y=0;y<SKIN_SIZE;y++) {
    assert.equal(rows[y*stride],0,'The procedural authoring script writes unfiltered RGBA rows');
    for(let x=0;x<SKIN_SIZE;x++) {
      const i=y*stride+1+x*4,r=rows[i],g=rows[i+1],b=rows[i+2],a=rows[i+3];
      if(!a){transparent++;continue;}
      assert.equal(a,255,'Painted texels are opaque; only atlas gutters are transparent');
      if(b>150&&g>130&&b>r*1.7)cyan++;
      if(r>70&&r<140&&g>=r&&b>=g&&b-r<45)stone++;
      if(g>70&&g>r*1.6&&g>b*1.6)grass++;
      if(r>60&&r>g*1.2&&g>b*1.2)dirt++;
      if(r<25&&g<25&&b<25)darkEye++;
      if(r>=225&&g>=250&&b===255)iceEye++;
      if(r<25&&g>=30&&g<65&&b>=60&&b<100)navy++;
    }
  }
  assert.ok(cyan>10000&&stone>10000,'Both halves must be present');
  assert.ok(grass>1000&&dirt>1000,'Grass and dirt cape motif');
  assert.ok(darkEye>25,'The stone-side eye stays dark');
  assert.ok(iceEye>25,'The cyan-side eye is very pale ice blue');
  assert.ok(navy>1000,'A dark-blue stripe separates the two halves');
  assert.ok(transparent>10000,'Unused atlas space stays transparent');
});
