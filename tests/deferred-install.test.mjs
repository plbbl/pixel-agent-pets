import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {scheduleCodexInstall} from '../scripts/deferred-codex-install.mjs';
test('one-shot installer queues only its own process, survives app exit, and removes its launch entry on completion',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pet deferred ')),calls=[];
 try{
  const dataHome=path.join(root,'抱抱龙'),result=await scheduleCodexInstall({payloadRoot:path.join(root,'payload'),dataHome,appPath:'/Applications/ChatGPT.app',codexHome:path.join(root,'codex')},{home:root,node:'/node',uid:501,platform:'darwin',execute:async(...args)=>{calls.push(args);assert.equal(JSON.parse(await fs.readFile(path.join(dataHome,'pending/pending.json'))).status,'queued');}});
  assert.equal(result.status,'queued');assert.equal(calls.length,1);assert.equal(calls[0][0],'/bin/launchctl');assert.deepEqual(calls[0][1].slice(0,2),['bootstrap','gui/501']);
  const runner=path.join(dataHome,'pending',result.label+'.cjs'),source=await fs.readFile(runner,'utf8');assert.ok(!/osascript|killall|pkill|window\.open/.test(source));
  const written=new Map(),deleted=[],children=[];const syncFS={writeFileSync:(file,text)=>written.set(file,JSON.parse(text)),unlinkSync:file=>deleted.push(file)};
  const scope={require:name=>name==='node:fs'?syncFS:{spawnSync:(file,argv)=>{children.push([file,argv]);return{status:0};}},process:{env:{},exitCode:0},__filename:runner};vm.runInNewContext(source,scope);
  assert.equal(children[0][0],'/node');assert.ok(children[0][1].includes('--yes'));assert.equal(written.get(path.join(dataHome,'pending/pending.json')).status,'installed');assert.ok(deleted.includes(runner));assert.ok(deleted.includes(calls[0][1][2]));assert.equal(children.at(-1)[1][0],'bootout');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('a failed launch registration removes generated executables and records failure',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pet deferred fail '));try{const dataHome=path.join(root,'data');await assert.rejects(scheduleCodexInstall({payloadRoot:path.join(root,'payload'),dataHome,appPath:'/Applications/ChatGPT.app',codexHome:path.join(root,'codex')},{home:root,uid:501,platform:'darwin',execute:async()=>{throw Error('test registration failure');}}),/registration failure/);assert.deepEqual(await fs.readdir(path.join(root,'Library/LaunchAgents')),[]);assert.equal(JSON.parse(await fs.readFile(path.join(dataHome,'pending/pending.json'))).status,'failed');}finally{await fs.rm(root,{recursive:true,force:true});}
});
