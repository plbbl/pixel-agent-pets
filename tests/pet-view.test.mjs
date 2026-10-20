import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/pet-view.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const view=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('desktop appearance preferences stay bounded and automatic detail follows actual backing density',()=>{
 assert.deepEqual(view.readPetView('bad'),{size:80,quality:'auto'});assert.deepEqual(view.petView({size:500,quality:'invalid'}),{size:224,quality:'auto'});
 assert.equal(view.petResolution({size:80,quality:'auto'},1),80);assert.equal(view.petResolution({size:80,quality:'auto'},2),160);assert.equal(view.petResolution({size:120,quality:'auto'},2),320);
 assert.equal(view.petResolution({size:224,quality:'80'},2),80);assert.equal(view.petResolution({size:224,quality:'320'},2,true),80);
});
test('HD assets remain on the installed package route and reject foreign, crossed, or escaping paths',()=>{
 assert.equal(view.hdAssetURL('gpt','gate','gpt/gate/320-1.png'),'/pixel-agent-pets/assets/gpt/gate/320-1.png');
 for(const value of ['https://example.com/a.png','../private.png','gpt/other/320-1.png','gpt/gate/../../private.png','gpt/gate/80-1.png'])assert.equal(view.hdAssetURL('gpt','gate',value),null);
});
