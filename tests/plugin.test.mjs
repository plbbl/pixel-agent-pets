import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import vm from'node:vm';import{createRequire}from'node:module';import{parseClawd}from'../scripts/import-clawd.mjs';
const require=createRequire(import.meta.url);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
test('DSH browser bundle is lazy, additive, and does not replace any official UI slot',async()=>{
 let module;vm.runInNewContext(await fs.readFile('dist/client.js','utf8'),{window:{__ModuleLoader__:{load:m=>module=m}}});assert.equal(module.id,'dsh-pixel-agent-pets');const exports=module.factory(require);const mounts=[];let disposed=0;
 const ctx={slots:{inject:(name,callback)=>{callback();return()=>disposed++;},register:(spec,component)=>{mounts.push({spec,component});return()=>{};}}};const off=exports.apply(ctx);assert.deepEqual(mounts.map(m=>m.spec.name),['conversation.input.overlay','shell.overlay']);assert.ok(!mounts.some(m=>['root','conversation','sidebar'].includes(m.spec.name)));off();assert.equal(disposed,2);
 const hero=mounts[1].component;assert.equal(hero({useSessions:fn=>fn({current:'active'})}),null);
 let pet;renderToStaticMarkup(React.createElement(function Probe(){pet=mounts[0].component({useSession:fn=>fn({sessionId:'fixture',running:true,pending:[],runningCalls:[{name:'read_file',callId:'x'}]}),useInput:fn=>fn({draft:'中文'})});return null;}));assert.equal(pet.props.activity.phase,'tools');assert.equal(pet.props.activity.chineseDraft,true);
});
test('local Clawd importer never evaluates installed JavaScript',()=>{
 const source='const data={BreakDancing:{w:1,h:1,base:"0",deltas:"(".split("(")},Running:{w:1,h:1,base:"0",deltas:[]}};';assert.equal(parseClawd(source).BreakDancing.base,'0');assert.throws(()=>parseClawd('const data={BreakDancing:{base:evil()},Running:{base:"0"}}'),/non-literal/);
});
