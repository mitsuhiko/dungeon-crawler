import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inflateSync} from 'node:zlib';
import {assets} from './paths.js';
import {TECHNOBLADE_SKIN_CODE,secretSkinOf,isSecretSkinCode,isNinjaSkinCode,SKIN_SIZE,SKIN_UV} from '../src/core/skin.js';

test('Technoblade needs its whole colon-prefixed code; normal names and the old secret still work',()=>{
  assert.equal(TECHNOBLADE_SKIN_CODE,':technoblade');
  for(const code of [':technoblade',' :TECHNOBLADE ',':ｔｅｃｈｎｏｂｌａｄｅ']){
    assert.equal(isSecretSkinCode(code),true);
    assert.deepEqual(secretSkinOf(code),{id:'technoblade',name:'Technoblade',file:'technoblade.png'});
  }
  for(const name of ['',null,'Technoblade',':techno',':technoblade!',':technoblade extra','prefix:technoblade','toString','constructor','__proto__']){
    assert.equal(isSecretSkinCode(name),false,name);
    assert.equal(secretSkinOf(name),null,name);
  }
  assert.equal(isNinjaSkinCode(':technoblade'),false);
  assert.equal(isNinjaSkinCode(':NINJAJAVAMC'),true);
  assert.equal(secretSkinOf(':ninjajavamc').file,'ninjajavamc.png');
});

test('the Technoblade texture is a compatible pig-king paint layer, not the private reference screenshot',()=>{
  const png=readFileSync(resolve(assets,'skins/technoblade.png')),compressed=[];
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let uv;
  for(let at=8;at<png.length;){
    const length=png.readUInt32BE(at),type=png.toString('ascii',at+4,at+8),data=png.subarray(at+8,at+8+length);
    if(type==='IHDR'){
      assert.equal(data.readUInt32BE(0),SKIN_SIZE);assert.equal(data.readUInt32BE(4),SKIN_SIZE);
      assert.equal(data[8],8);assert.equal(data[9],6);
    }
    if(type==='tEXt'&&data.toString().startsWith('SkinUV\0'))uv=data.toString().slice(7);
    if(type==='IDAT')compressed.push(data);
    at+=length+12;
  }
  assert.equal(uv,SKIN_UV);
  const rows=inflateSync(Buffer.concat(compressed)),stride=SKIN_SIZE*4+1;
  assert.equal(rows.length,stride*SKIN_SIZE);
  const count={pink:0,red:0,gold:0,white:0,boots:0,gems:0,transparent:0};
  for(let y=0;y<SKIN_SIZE;y++){
    assert.equal(rows[y*stride],0);
    for(let x=0;x<SKIN_SIZE;x++){
      const at=y*stride+1+x*4,[r,g,b,a]=rows.subarray(at,at+4);
      if(!a){count.transparent++;continue;}
      assert.equal(a,255);
      if(r>200&&g>130&&g<190&&b>130&&b<190)count.pink++;
      if(r>140&&g<35&&b<45)count.red++;
      if(r>200&&g>170&&b<60)count.gold++;
      if(r>210&&g>210&&b>200)count.white++;
      if(r<30&&g<30&&b<30)count.boots++;
      if(b>150&&b>r*2)count.gems++;
    }
  }
  for(const key of ['pink','red','gold','white','boots'])assert.ok(count[key]>1000,`${key} must be visible`);
  assert.ok(count.gems>25,'the crown needs colored jewels');
  assert.ok(count.transparent>10000,'unused UV gutters stay transparent');
});
