import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {activityDirectory,bridgeFile,activityFacts,createActivityStore,createActivityWriter,subscribeDSHActivity,activityHandler,watchActivitySentinel} from '../scripts/dsh-activity-bridge.mjs';
const session={id:'synthetic-session',header:{}},agent={id:session.id,session,status:'idle'};
const event=(type,data={},seq=1)=>({type,data,seq,time:1000});
function emitter(){const listeners=new Map();return{on(name,fn){const rows=listeners.get(name)??new Set();rows.add(fn);listeners.set(name,rows);return()=>{rows.delete(fn);if(!rows.size)listeners.delete(name);};},emit(name,...args){for(const fn of listeners.get(name)??[])fn(...args);},get count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0);},agents:{roots:()=>[]}};}
function clock(){let time=100000,id=0;const tasks=new Map();return{now:()=>time,setInterval(fn,ms){tasks.set(++id,{fn,ms});return id;},clearInterval(id){tasks.delete(id);},advance(ms){time+=ms;},get count(){return tasks.size;},tick(){for(const {fn}of tasks.values())fn();}};}

test('public DSH emitter adapter follows background work, tool approval and cancel without borrowing message bodies',()=>{
 const store=createActivityStore(),ctx=emitter(),outputs=[],off=subscribeDSHActivity(ctx,store,value=>outputs.push(value));
 ctx.emit('agent/status',{agent,status:'running'});assert.equal(store.snapshot().busy,true);assert.equal(store.snapshot().phase,'preparing');
 ctx.emit('session/event',session,event('turn/start',{turn:4}));
 ctx.emit('session/event',session,event('assistant/chunk',{turn:4,chunk:{type:'reasoning-delta',text:'PRIVATE reasoning'}}));assert.equal(store.snapshot().phase,'thinking');
 ctx.emit('session/event',session,event('assistant/chunk',{turn:4,chunk:{type:'text-delta',text:'PRIVATE answer'}}));assert.equal(store.snapshot().phase,'responding');
 ctx.emit('session/event',session,event('tool/call',{turn:4,callId:'tool-private',name:'read_file',arguments:'PRIVATE command args'}));assert.equal(store.snapshot().tool,'read_file');assert.equal(store.snapshot().phase,'tools');
 ctx.emit('session/event',session,event('approval/asked',{id:'approval-private',reason:'PRIVATE permission text'}));assert.equal(store.snapshot().awaitingInput,true);
 ctx.emit('session/event',session,event('approval/decided',{id:'approval-private',outcome:'allowed-once'}));assert.equal(store.snapshot().awaitingInput,false);
 ctx.emit('session/event',session,event('tool/result',{turn:4,message:{content:[{type:'tool-result',toolCallId:'tool-private',content:[{type:'text',text:'PRIVATE result'}]}]}}));assert.equal(store.snapshot().toolId,undefined);assert.equal(store.snapshot().phase,'thinking');
 ctx.emit('agent/turn-stopping',{agent,turn:4});assert.equal(store.snapshot().phase,'stopping');assert.equal(store.snapshot().busy,true);
 ctx.emit('session/event',session,event('turn/end',{turn:4,reason:{kind:'aborted',reason:{kind:'user'}}},20));ctx.emit('agent/status',{agent,status:'idle'});assert.equal(store.snapshot().phase,'stopping');assert.equal(store.snapshot().busy,false);
 assert.ok(!JSON.stringify(outputs).includes('PRIVATE'));assert.ok(!JSON.stringify(outputs).includes('tool-private'));assert.match(store.snapshot().owner,/^[a-f0-9]{24}$/);
 off();assert.equal(ctx.count,0);const length=outputs.length;ctx.emit('agent/status',{agent,status:'running'});assert.equal(outputs.length,length);
});
test('token floods do not publish repeated facts, retry and errors carry stable opaque IDs',()=>{
 const ctx=emitter(),store=createActivityStore(),outputs=[],off=subscribeDSHActivity(ctx,store,value=>outputs.push(value));ctx.emit('session/event',session,event('turn/start',{turn:1}));ctx.emit('session/event',session,event('assistant/chunk',{turn:1,chunk:{type:'text-delta',text:'PRIVATE'}}));const count=outputs.length;
 for(let n=0;n<10000;n++)ctx.emit('session/event',session,event('assistant/chunk',{turn:1,chunk:{type:'text-delta',text:'PRIVATE '+n}}));assert.equal(outputs.length,count);
 ctx.emit('session/event',session,event('llm/retry',{turn:1,retry:2,failure:{message:'PRIVATE failure',code:'PRIVATE code'}}));assert.equal(store.snapshot().phase,'retrying');assert.equal(store.snapshot().busy,true);
 ctx.emit('session/event',session,event('llm/retry-started',{turn:1}));assert.equal(store.snapshot().phase,'thinking');ctx.emit('agent/error',{agent,turn:1,step:3,error:{message:'PRIVATE exception'}});const id=store.snapshot().errorId;ctx.emit('agent/error',{agent,turn:1,step:3,error:{message:'DIFFERENT PRIVATE'}});assert.equal(store.snapshot().errorId,id);
 ctx.emit('session/event',session,event('turn/end',{turn:1,reason:{kind:'error',error:{message:'PRIVATE'}}},40));assert.equal(store.snapshot().busy,false);assert.equal(store.snapshot().errorId,id,'agent and durable terminal error are one stable feedback event');ctx.emit('session/event',session,event('turn/start',{turn:2}));assert.equal(store.snapshot().errorId,undefined);off();
});
test('selected UI only supplements booleans while background busy owners stay authoritative',()=>{
 let now=1000;const store=createActivityStore({now:()=>now}),other={id:'other',header:{}};store.event(session,event('turn/start',{turn:1}));store.event(other,event('turn/start',{turn:2}));store.ui({sessionId:session.id,selected:true,chineseDraft:true,awaitingInput:false});const selected=store.snapshot().owner;
 assert.equal(store.snapshot().chineseDraft,true);now+=10;store.event(other,event('assistant/chunk',{turn:2,chunk:{type:'text-delta'}}));assert.equal(store.snapshot().owner,selected);
 store.event(session,event('turn/end',{turn:1,reason:{kind:'completed'}}));assert.notEqual(store.snapshot().owner,selected,'background work continues after selected UI becomes idle');
 now+=16000;store.event(other,event('turn/end',{turn:2,reason:{kind:'completed'}}));store.ui({sessionId:session.id,selected:false,chineseDraft:false,awaitingInput:false});assert.equal(store.snapshot().chineseDraft,true,'unselection retains the latched input event for native deduplication');
});
test('platform bridge location matches Tauri app_config_dir without scanning profile folders',()=>{
 assert.equal(activityDirectory({platform:'darwin',home:'/home/test',env:{}}),path.join('/home/test','Library/Application Support','io.github.plbbl.pixel-agent-pets','activity'));
 assert.equal(activityDirectory({platform:'win32',home:'/home/test',env:{APPDATA:'/roaming'}}),path.join('/roaming','io.github.plbbl.pixel-agent-pets','activity'));
 assert.equal(activityDirectory({platform:'linux',home:'/home/test',env:{XDG_CONFIG_HOME:'/config'}}),path.join('/config','io.github.plbbl.pixel-agent-pets','activity'));
});
test('writer is dormant without fresh desktop sentinel; active facts are atomic, bounded and expire',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-facts-')),time=clock(),writer=createActivityWriter({directory:root,now:time.now,clock:time});try{
  assert.equal(await writer.update({owner:'a'.repeat(24),busy:true,phase:'thinking',awaitingInput:false,chineseDraft:false}),false);assert.deepEqual(await fs.readdir(root),[]);assert.equal(time.count,0);
  await fs.writeFile(path.join(root,'desktop-active.json'),JSON.stringify({version:1,updatedAt:time.now()}));assert.equal(await writer.refresh(),true);const file=path.join(root,bridgeFile),first=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(first.source,'dsh');assert.equal(first.busy,true);assert.equal(time.count,1);assert.ok((await fs.stat(file)).size<8192);assert.ok(!(await fs.readdir(root)).some(name=>name.endsWith('.tmp')));
  if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
  time.advance(16000);assert.equal(await writer.flush(),false);assert.equal(time.count,0);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).updatedAt,first.updatedAt);
 }finally{await writer.dispose();assert.equal(time.count,0);await fs.rm(root,{recursive:true,force:true});}
});
function response(){return{status:0,headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(){}};}
function request(body,headers={}){const req=Readable.from([Buffer.from(body)]);req.method='POST';req.headers={host:'127.0.0.1:19360',origin:'http://127.0.0.1:19360','content-type':'application/json','x-baobaolong-activity':'1','sec-fetch-site':'same-origin',...headers};req.socket={remoteAddress:'127.0.0.1'};return req;}
test('UI bridge route rejects cross-origin, LAN, token/body abuse and only accepts tiny boolean facts',async()=>{
 const store=createActivityStore(),writes=[],handler=activityHandler(store,{update:value=>writes.push(value)}),valid=JSON.stringify({sessionId:session.id,selected:true,chineseDraft:true,awaitingInput:true});
 for(const headers of [{origin:'https://evil.invalid'},{host:'evil.invalid',origin:'http://evil.invalid'},{'x-baobaolong-activity':undefined},{'sec-fetch-site':'cross-site'}]){const res=response();await handler(request(valid,headers),res);assert.equal(res.status,403);}
 const remote=request(valid);remote.socket.remoteAddress='192.168.0.2';const lan=response();await handler(remote,lan);assert.equal(lan.status,403);
 const huge=response();await handler(request('x'.repeat(1025)),huge);assert.equal(huge.status,413);
 const extra=response();await handler(request(JSON.stringify({...JSON.parse(valid),text:'PRIVATE'})),extra);assert.equal(writes.length,0);
 const good=response();await handler(request(valid),good);assert.equal(good.status,204);assert.equal(writes.length,1);assert.equal(writes[0].chineseDraft,true);assert.ok(!JSON.stringify(writes).includes(session.id));
});


test('writer whitelist strips untrusted fields and per-process files cannot collide across DSH servers',()=>{
 const value=activityFacts({owner:'a'.repeat(24),busy:true,phase:'tools',awaitingInput:true,tool:'read_file',toolId:'b'.repeat(24),chineseDraft:true,text:'PRIVATE',arguments:'PRIVATE',errorId:'PRIVATE'});
 assert.ok(!JSON.stringify(value).includes('PRIVATE'));assert.equal(value.tool,'read_file');assert.match(bridgeFile,/^dsh-\d+\.json$/);assert.equal(activityFacts({owner:'PRIVATE',busy:true,phase:'thinking'}),undefined);
});

test('EMFILE watcher failure falls back to only the own sentinel and disposes its interval',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-sentinel-watch-')),time=clock(),writer=createActivityWriter({directory:root,now:time.now,clock:time});let refreshes=0;
 const off=watchActivitySentinel(root,()=>{++refreshes;return writer.refresh();},{watcherFactory(){throw Object.assign(Error('watch limit'),{code:'EMFILE'});},clock:time,fallbackMs:10000});
 try{await writer.update({owner:'a'.repeat(24),busy:true,phase:'thinking'});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(time.count,1,'only fallback interval exists without a desktop');await fs.writeFile(path.join(root,'desktop-active.json'),JSON.stringify({version:1,updatedAt:time.now()}));time.tick();await new Promise(resolve=>setTimeout(resolve,15));assert.ok(refreshes>0);assert.equal(JSON.parse(await fs.readFile(path.join(root,bridgeFile),'utf8')).busy,true);off();await writer.dispose();assert.equal(time.count,0);}
 finally{off();await writer.dispose();await fs.rm(root,{recursive:true,force:true});}
});

test('native own-directory watcher or its real error fallback activates pre-existing busy facts',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-real-watch-')),writer=createActivityWriter({directory:root});let refreshes=0;const off=watchActivitySentinel(root,()=>{++refreshes;return writer.refresh();},{fallbackMs:30});
 try{await writer.update({owner:'a'.repeat(24),busy:true,phase:'tools',tool:'read_file'});await fs.writeFile(path.join(root,'desktop-active.json'),JSON.stringify({version:1,updatedAt:Date.now()}));let value;
  for(let n=0;n<30;n++){await new Promise(resolve=>setTimeout(resolve,30));try{value=JSON.parse(await fs.readFile(path.join(root,bridgeFile),'utf8'));break;}catch{}}
  assert.equal(value?.busy,true);assert.equal(value?.phase,'tools');assert.ok(refreshes>0);
 }finally{off();await writer.dispose();await fs.rm(root,{recursive:true,force:true});}
});


test('declared optional agents child seeds already-running work; UI booleans persist until actual unselection/disposal',()=>{
 const ctx=emitter(),store=createActivityStore();let seed,disposed=0;
 Object.defineProperty(ctx,'agents',{get(){throw Error('Undeclared service access');}});
 ctx.inject=(dependencies,apply)=>{assert.deepEqual(dependencies,['agents']);seed=apply;return{dispose(){++disposed;}};};
 const off=subscribeDSHActivity(ctx,store,()=>{});seed({agents:{roots:()=>[{...agent,status:'running'}]}});assert.equal(store.snapshot().busy,true);
 store.ui({sessionId:session.id,selected:true,chineseDraft:true,awaitingInput:true});assert.equal(store.snapshot().chineseDraft,true);ctx.emit('session/disposed',session);assert.equal(store.snapshot(),undefined);off();assert.equal(disposed,1);assert.equal(ctx.count,0);
});

test('activation prunes only stale project-format per-process files, preserving fresh, foreign and symlink files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-stale-clean-')),now=Date.now(),old=now-90000000;
 const facts={version:1,source:'dsh',updatedAt:old,owner:'a'.repeat(24),busy:false,phase:'thinking',awaitingInput:false,chineseDraft:false};
 const write=async(name,value)=>{const file=path.join(root,name);await fs.writeFile(file,JSON.stringify(value));await fs.utimes(file,old/1000,old/1000);};
 const writer=createActivityWriter({directory:root});
 try{await write('dsh-1000001.json',facts);await write('dsh-1000002.json',{...facts,updatedAt:now});await write('dsh-1000003.json',{...facts,unrelated:'PRIVATE'});await fs.symlink(path.join(root,'dsh-1000002.json'),path.join(root,'dsh-1000004.json'));await fs.writeFile(path.join(root,'desktop-active.json'),JSON.stringify({version:1,updatedAt:now}));await writer.update({owner:'b'.repeat(24),busy:true,phase:'thinking'});
  await assert.rejects(fs.stat(path.join(root,'dsh-1000001.json')),{code:'ENOENT'});for(const name of ['dsh-1000002.json','dsh-1000003.json','dsh-1000004.json'])await fs.lstat(path.join(root,name));
 }finally{await writer.dispose();await fs.rm(root,{recursive:true,force:true});}
});


test('terminal server facts clear stale UI waiting immediately even when a hidden page has not rerendered',()=>{
 const store=createActivityStore();store.event(session,event('turn/start',{turn:1}));store.ui({sessionId:session.id,selected:true,chineseDraft:true,awaitingInput:true});assert.equal(store.snapshot().awaitingInput,true);
 store.event(session,event('turn/end',{turn:1,reason:{kind:'aborted'}}));assert.equal(store.snapshot().phase,'stopping');assert.equal(store.snapshot().busy,false);assert.equal(store.snapshot().awaitingInput,false);assert.equal(store.snapshot().chineseDraft,true);
});


test('Chinese input rising edges remain visible after fast Enter and never use a turn identifier',()=>{
 const store=createActivityStore(),input={sessionId:session.id,selected:true,chineseDraft:true,awaitingInput:false};
 store.ui(input);const first=store.snapshot().chineseInputId;assert.match(first,/^[a-f0-9]{24}$/);
 store.ui({...input,chineseDraft:false});assert.equal(store.snapshot().chineseDraft,true);assert.equal(store.snapshot().chineseInputId,first,'Enter clearing the editor cannot erase an unpolled event');
 store.event(session,event('turn/start',{turn:1}));assert.equal(store.snapshot().chineseInputId,first,'turns do not manufacture input events');
 store.ui(input);const second=store.snapshot().chineseInputId;assert.notEqual(second,first,'the next actual input rising edge has its own opaque ID');
 store.ui({...input,selected:false,chineseDraft:false});assert.equal(store.snapshot().chineseInputId,second);
 store.ui(input);assert.equal(store.snapshot().chineseInputId,second,'selecting an unchanged Chinese draft does not duplicate the input');
 store.ui({...input,chineseDraft:false});store.ui(input);assert.notEqual(store.snapshot().chineseInputId,second);
 const clean=activityFacts({...store.snapshot(),text:'PRIVATE'});assert.equal(clean.chineseInputId,store.snapshot().chineseInputId);assert.ok(!JSON.stringify(clean).includes('PRIVATE'));
});
