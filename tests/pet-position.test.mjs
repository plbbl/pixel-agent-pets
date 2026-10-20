import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/pet-position.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const {anchoredPosition,readPetPosition,savePetPosition,clampPetPoint,draggedPetPoint}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('a clean install and invalid saved positions bind to the composer, while a free position survives reload and can reset',()=>{
 for(const raw of [null,'bad','{}','{"version":2,"mode":"free","x":100,"y":200}','{"version":1,"mode":"free","x":"100","y":200}','{"version":1,"mode":"free","x":1e999,"y":200}'])assert.deepEqual(readPetPosition(raw),{mode:'anchored'});
 const saved=savePetPosition({mode:'free',x:235.5,y:110});assert.deepEqual(readPetPosition(saved),{mode:'free',x:235.5,y:110});
 assert.deepEqual(readPetPosition(savePetPosition(anchoredPosition())),{mode:'anchored'});
});
test('a click and small pointer tremor do not detach; a drag preserves its grab offset and can return to its origin',()=>{
 const origin={x:300,y:200},start={x:320,y:225},viewport={width:1200,height:900};
 assert.equal(draggedPetPoint(origin,start,{x:323,y:228},80,viewport),null);
 assert.deepEqual(draggedPetPoint(origin,start,{x:360,y:195},80,viewport),{x:340,y:170});
 assert.deepEqual(draggedPetPoint(origin,start,start,80,viewport,0),origin);
});
test('resizing and enlarging keep both the widest props and the upper caption on screen',()=>{
 for(const size of [80,112,160,224])for(const viewport of [{width:1440,height:900},{width:390,height:360,left:12,top:20}]){
  for(const attempted of [{x:-500,y:-500},{x:2000,y:2000}]){
   const p=clampPetPoint(attempted,size,viewport),left=viewport.left||0,top=viewport.top||0;
   const captionLeft=p.x+size-Math.max(180,size),propLeft=p.x-size*.3,propRight=p.x+size*1.3,captionTop=p.y+size*.075-14;
   assert.ok(captionLeft>=left+8-1e-9);assert.ok(propLeft>=left+8-1e-9);assert.ok(propRight<=left+viewport.width-8+1e-9);
   assert.ok(captionTop>=top+8-1e-9);assert.ok(p.y+size<=top+viewport.height-8+1e-9);
  }
 }
 const old={x:1300,y:700},small=clampPetPoint(old,224,{width:500,height:400});
 assert.notDeepEqual(small,old);assert.deepEqual(clampPetPoint(small,224,{width:500,height:400}),small);
});
test('a viewport smaller than the pet still gives a finite centered placement instead of stale offscreen coordinates',()=>{
 const p=clampPetPoint({x:10000,y:10000},224,{width:180,height:160});
 assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.x<180&&p.y<160);
});
