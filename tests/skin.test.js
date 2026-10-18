import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_UV, SKIN_SIZE, SKIN_NAME_MAX, cleanSkinName, skinNameKey, checkSkin, fillTexture, padTexture, linearPaintToPNG } from '../src/core/skin.js';
import { createHero, openStore, memoryStorage } from '../src/core/save.js';

const ref = { v: 2, uv: SKIN_UV, id: 'skin-1234-abcd' };
test('skin names are required, normalized, bounded and matched case-insensitively', () => {
  assert.equal(cleanSkinName('  Blue   Knight  '), 'Blue Knight');
  assert.equal(skinNameKey(' BLUE knight '), skinNameKey('Blue Knight'));
  assert.equal(cleanSkinName(' \n\t '), '');
  assert.equal(cleanSkinName(null), '');
  assert.equal(cleanSkinName('x'.repeat(100)).length, SKIN_NAME_MAX);
  assert.equal(skinNameKey('Ｂｌｕｅ'), 'blue');
});
test('hero records preserve a named skin while old unnamed references still work', () => {
  const named = { ...ref, name: '  Blue   Knight ' };
  assert.deepEqual(checkSkin(named), { ...ref, name: 'Blue Knight' });
  assert.deepEqual(checkSkin(ref), ref);
  const store = openStore(memoryStorage());
  const hero = { ...createHero('Artist', { id: 'h-named' }), skin: named };
  store.putHero(hero);
  assert.equal(store.hero(hero.id).skin.name, 'Blue Knight');
});
test('hero saves keep only an immutable PNG reference, not megapixels in localStorage', () => {
  const storage = memoryStorage(), store = openStore(storage);
  const h = { ...createHero('Artist', { id: 'h-artist' }), skin: ref };
  assert.equal(SKIN_SIZE, 2048);
  assert.equal(store.putHero(h), true);
  assert.deepEqual(openStore(storage).hero(h.id).skin, ref);
  store.putHero({ ...store.hero(h.id), name: 'Painter' });
  assert.deepEqual(store.hero(h.id).skin, ref);
  store.putHero(createHero('Clay', { id: 'h-clay' }));
  assert.equal(store.hero('h-clay').skin, undefined);
});
test('invalid, old vertex paint and mismatched UV versions do not damage a hero', () => {
  for (const value of [null, {}, [], [[123]], { ...ref, v: 3 }, { ...ref, uv: 'different-uv' }, { ...ref, id: '../bad' }]) {
    assert.equal(checkSkin(value), null);
    const store = openStore(memoryStorage());
    store.putHero({ ...createHero('Still here', { id: 'h-ok' }), skin: value });
    assert.equal(store.hero('h-ok').name, 'Still here');
    assert.equal(store.hero('h-ok').skin, undefined);
  }
  assert.deepEqual(checkSkin({ ...ref, unknown: 1 }), ref);
});
test('pixel fill stops at drawn lines and cannot escape into empty atlas gutters', () => {
  const w = 7, h = 5, mask = new Uint8Array(w*h).fill(1), pixels = new Uint8Array(w*h*4);
  const red = [255,0,0,255], blue = [0,0,255,255];
  for (let y = 0; y < h; y++) pixels.set(red, (y*w+3)*4);
  for (let y = 0; y < h; y++) mask[y*w+6] = 0;
  assert.equal(fillTexture(pixels,w,h,mask,new Map(),0,blue),15);
  assert.deepEqual([...pixels.slice(0,4)],blue);
  assert.deepEqual([...pixels.slice(4*4,4*4+4)],[0,0,0,0]);
  assert.equal(fillTexture(pixels,w,h,mask,new Map(),0,blue),0);
});
test('fill follows a closed area across UV seams without crossing its outline', () => {
  const pixels = new Uint8Array(8*4), mask = new Uint8Array([1,1,0,0,1,1,0,1]);
  const seams = new Map([[1,[4]],[4,[1]],[5,[7]],[7,[5]]]);
  pixels.set([255,0,0,255],5*4);
  assert.equal(fillTexture(pixels,8,1,mask,seams,0,[100,20,0,255]),3);
  assert.equal(pixels[4*4],100);
  assert.equal(pixels[7*4],0);
});
test('only a completely closed shape can be filled; a gap leaves every pixel unchanged', () => {
  const w=9,h=9,mask=new Uint8Array(w*h).fill(1),pixels=new Uint8Array(w*h*4);
  for(let y=2;y<=6;y++)for(let x=2;x<=6;x++)if(x===2||x===6||y===2||y===6)pixels.set([255,0,0,255],(y*w+x)*4);
  const closed=pixels.slice(),gap=(2*w+4)*4;
  pixels.fill(0,gap,gap+4);
  const open=pixels.slice();
  assert.equal(fillTexture(pixels,w,h,mask,new Map(),4*w+4,[0,0,255,255]),-1);
  assert.deepEqual(pixels,open,'Never flood the whole skin through a gap');
  pixels.set(closed);
  assert.equal(fillTexture(pixels,w,h,mask,new Map(),4*w+4,[0,0,255,255]),9);
  assert.equal(pixels[0],0);assert.equal(pixels[3],0,'Outside stays unpainted');
});
test('unrelated UV fragments cannot make an open shape appear closed', () => {
  const pixels=new Uint8Array(4*4),mask=new Uint8Array([1,1,0,1]);
  pixels.set([255,0,0,255],4);
  assert.equal(fillTexture(pixels,4,1,mask,new Map(),0,[0,0,255,255]),-1);
});
test('padding repeats island edges without thickening lines inside the atlas', () => {
  const pixels = new Uint8Array(7*4), mask = new Uint8Array([0,0,1,1,1,0,0]);
  pixels.set([255,0,0,255],2*4);
  padTexture(pixels,7,1,mask,2);
  assert.equal(pixels[0],255); assert.equal(pixels[4],255);
  assert.equal(pixels[3*4],0); assert.equal(pixels[6*4],0);
});
test('PNG export flips rows, unpremultiplies alpha and encodes linear RGB as sRGB', () => {
  const png = linearPaintToPNG(new Uint8Array([64,0,0,128, 0,255,0,255]),1,2);
  assert.deepEqual([...png.slice(0,4)],[0,255,0,255]);
  assert.ok(Math.abs(png[4]-188)<=1); assert.equal(png[7],128);
  assert.deepEqual([...linearPaintToPNG(new Uint8Array(4),1,1)],[0,0,0,0]);
});
