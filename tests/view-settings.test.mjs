import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['site/view-settings.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const view=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('share links override saved quality and size, while corrupt preferences stay usable',()=>{
 assert.deepEqual(view.readViewSettings('?quality=720&size=240','{"quality":"pixel","size":80}'),{quality:'720',size:240});
 assert.deepEqual(view.readViewSettings('?quality=bogus&size=NaN','{"quality":"360","size":144}'),{quality:'360',size:144});
 assert.deepEqual(view.readViewSettings('','bad json'),{quality:'auto',size:216});
 assert.equal(view.readViewSettings('?size=900').size,300);
 assert.equal(view.readViewSettings('?size=-8').size,54);
});
test('display size is independent of quality and keeps the video square inside narrow stages',()=>{
 for(const width of [280,346,600])for(const size of [54,216,300])for(const aspect of [1,1.6]){
  const p=view.stagePlacement(size,width,aspect);
  assert.ok(p.videoWidth<=width);
  assert.ok(p.videoTop>=45);
  assert.ok(p.height-p.baseline>=42);
  assert.ok(p.videoTop+p.videoSize<=p.height);
  assert.ok(p.actor<=size);
 }
});

test('auto quality increases with visible size and pixel density; manual selection stays pinned',()=>{
 assert.equal(view.resolveQuality('auto',54,1),'pixel');
 assert.equal(view.resolveQuality('auto',100,1),'360');
 assert.equal(view.resolveQuality('auto',250,1),'720');
 assert.equal(view.resolveQuality('auto',160,2),'720');
 assert.equal(view.resolveQuality('360',300,3),'360');
 assert.equal(view.resolveQuality('auto',300,2,true),'pixel');
 assert.equal(view.resolveQuality('auto',100,NaN),'360');
});
