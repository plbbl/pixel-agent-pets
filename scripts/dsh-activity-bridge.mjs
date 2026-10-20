import fs from 'node:fs/promises';
import {watch} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
export const activityRoute='/pixel-agent-pets/activity';
export const bridgeTTL=15000;
export const bridgeFile=`dsh-${process.pid}.json`;
const opaque=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,24);
const phases=new Set(['sending','preparing','thinking','responding','tools','retrying','stopping']);
export function activityDirectory({platform=process.platform,env=process.env,home=os.homedir()}={}){
 const config=platform==='darwin'?path.join(home,'Library/Application Support'):platform==='win32'?(env.APPDATA||path.join(home,'AppData/Roaming')):(env.XDG_CONFIG_HOME||path.join(home,'.config'));
 return path.join(config,'io.github.plbbl.pixel-agent-pets','activity');
}
export function toolCategory(value){const name=typeof value==='string'?value:'';return /^(read|view_file|cat|list|ls)/i.test(name)?'read_file':/^(search|grep|find|glob)/i.test(name)?'search':/^(write|edit|replace|str_replace)/i.test(name)?'write_file':'run_command';}
const safeId=value=>(typeof value==='string'||typeof value==='number')&&String(value).length<=256?String(value):undefined;
function identity(value){const raw=safeId(value);return raw===undefined?undefined:opaque(raw);}

/** Only enumerated facts are retained. Event bodies, tool arguments and errors are never copied. */
export function createActivityStore({now=Date.now}={}){
 const records=new Map();let selected;
 function entry(id,subagent=false){const owner=identity(id);if(!owner)return;let r=records.get(owner);if(!r){r={owner,busy:false,phase:'thinking',awaitingInput:false,chineseDraft:false,changedAt:now(),tools:new Map(),pending:new Set(),subagent};records.set(owner,r);}return r;}
 function publish(r,prior){const value=publicFacts(r);if(JSON.stringify(value)===prior)return false;r.changedAt=now();while(records.size>64){const victim=[...records.values()].filter(x=>!x.busy&&!x.awaitingInput&&x.owner!==selected).sort((a,b)=>a.changedAt-b.changedAt)[0]??records.values().next().value;records.delete(victim.owner);}return true;}
 function publicFacts(r){const latest=[...r.tools.entries()].at(-1),ui=r.ui;return{owner:r.owner,busy:r.busy,phase:r.phase,awaitingInput:r.pending.size>0||!!ui?.awaitingInput,chineseDraft:!!r.chineseInputId,...r.chineseInputId?{chineseInputId:r.chineseInputId}:{},...r.turnId?{turnId:r.turnId}:{},...latest?{toolId:latest[0],tool:latest[1]}:{},...r.errorId?{errorId:r.errorId}:{}};}
 function event(session,event){const r=entry(session?.id,session?.header?.origin==='subagent');if(!r||!event||typeof event.type!=='string')return false;const prior=JSON.stringify(publicFacts(r)),data=event.data??{};
  const turn=safeId(data.turn);if(turn!==undefined)r.turnId=opaque(r.owner+':turn:'+turn);
  if(event.type==='turn/start'){r.busy=true;r.phase='preparing';r.errorId=undefined;r.tools.clear();r.pending.clear();}
  else if(event.type==='step/start'||event.type==='request/header'){r.busy=true;r.phase='thinking';}
  else if(event.type==='assistant/chunk'){const kind=data.chunk?.type;if(kind==='text-delta'){r.busy=true;r.phase=r.tools.size?'tools':'responding';}else if(kind==='reasoning-delta'||kind==='tool-call-delta'){r.busy=true;r.phase=r.tools.size?'tools':'thinking';}}
  else if(event.type==='tool/call'){const call=identity(data.callId);if(call){r.tools.set(call,toolCategory(data.name));r.busy=true;r.phase='tools';}}
  else if(event.type==='tool/result'){const call=identity(data.message?.content?.[0]?.toolCallId);if(call)r.tools.delete(call);r.phase=r.tools.size?'tools':'thinking';}
  else if(event.type==='approval/asked'){const id=identity(data.id);if(id)r.pending.add(id);}
  else if(event.type==='approval/decided'){const id=identity(data.id);if(id)r.pending.delete(id);}
  else if(event.type==='llm/retry'){r.busy=true;r.phase='retrying';r.errorId=undefined;r.tools.clear();}
  else if(event.type==='llm/retry-started'){r.busy=true;r.phase='thinking';}
  else if(event.type==='turn/end'){r.busy=false;r.tools.clear();r.pending.clear();if(r.ui)r.ui.awaitingInput=false;const reason=data.reason?.kind;r.phase=['aborted','interrupted','blocked'].includes(reason)?'stopping':'thinking';if(reason==='error'||reason==='max-tokens')r.errorId=opaque(r.owner+':error:'+(r.turnId??String(event.seq)));}
  else return false;
  return publish(r,prior);
 }
 function status(agent,status){const r=entry(agent?.id,agent?.session?.header?.origin==='subagent');if(!r||!['running','idle'].includes(status))return false;const prior=JSON.stringify(publicFacts(r));if(status==='running'){if(!r.busy){r.phase='preparing';r.errorId=undefined;}r.busy=true;}else{r.busy=false;r.tools.clear();r.pending.clear();if(r.ui)r.ui.awaitingInput=false;}return publish(r,prior);}
 function stopped(agent){const r=entry(agent?.id,agent?.session?.header?.origin==='subagent');if(!r)return false;const prior=JSON.stringify(publicFacts(r));r.phase='stopping';return publish(r,prior);}
 function failed(agent,turn,step){const r=entry(agent?.id,agent?.session?.header?.origin==='subagent');if(!r)return false;const prior=JSON.stringify(publicFacts(r));const id=safeId(turn);if(id!==undefined)r.turnId=opaque(r.owner+':turn:'+id);r.errorId=opaque(r.owner+':error:'+(r.turnId??'unpositioned'));return publish(r,prior);}
 // Latch only an opaque input event, so fast Enter cannot erase it between native polls.
 // Unselect cleanup is not a new input edge; retain the previous selected draft boolean.
 function ui(input){if(!input||typeof input.sessionId!=='string'||input.sessionId.length>256||typeof input.chineseDraft!=='boolean'||typeof input.awaitingInput!=='boolean'||typeof input.selected!=='boolean')return false;const r=entry(input.sessionId);if(!r)return false;const prior=JSON.stringify(publicFacts(r)),before=selected;if(input.selected){selected=r.owner;if(input.chineseDraft&&!r.chineseDraft)r.chineseInputId=opaque(randomUUID());r.chineseDraft=input.chineseDraft;}else if(selected===r.owner)selected=undefined;r.ui={updatedAt:now(),awaitingInput:input.selected&&input.awaitingInput};if(before!==selected)r.changedAt=now();return publish(r,prior)||before!==selected;}
 function snapshot(){const all=[...records.values()].filter(r=>!r.subagent||r.owner===selected),picked=all.find(r=>r.owner===selected&&(r.busy||publicFacts(r).awaitingInput))??all.filter(r=>publicFacts(r).awaitingInput).sort((a,b)=>b.changedAt-a.changedAt)[0]??all.filter(r=>r.busy).sort((a,b)=>b.changedAt-a.changedAt)[0]??all.sort((a,b)=>b.changedAt-a.changedAt)[0];return picked?publicFacts(picked):undefined;}
 return{event,status,stopped,failed,ui,snapshot,remove(id){const owner=identity(id);if(owner===selected)selected=undefined;return records.delete(owner);},size:()=>records.size};
}

/** Own-file bridge only. No active desktop sentinel means no write and no idle polling. */
export function activityFacts(value){
 if(!value||!/^[a-f0-9]{24}$/.test(value.owner)||typeof value.busy!=='boolean'||!phases.has(value.phase))return;
 const result={owner:value.owner,busy:value.busy,phase:value.phase,awaitingInput:value.awaitingInput===true,chineseDraft:value.chineseDraft===true};
 for(const key of ['turnId','toolId','errorId','chineseInputId'])if(typeof value[key]==='string'&&/^[a-f0-9]{24}$/.test(value[key]))result[key]=value[key];
 if(['read_file','search','write_file','run_command'].includes(value.tool))result.tool=value.tool;
 return result;
}
async function cleanStaleBridgeFiles(directory,now){
 const dir=await fs.opendir(directory);let count=0;for await(const row of dir){if(++count>256)break;if(!/^dsh-\d+\.json$/.test(row.name)||row.name===bridgeFile)continue;const full=path.join(directory,row.name);try{const stat=await fs.lstat(full);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192||now-stat.mtimeMs<86400000)continue;const value=JSON.parse(await fs.readFile(full,'utf8'));if(Object.keys(value).every(key=>['version','source','updatedAt','owner','busy','phase','awaitingInput','chineseDraft','chineseInputId','turnId','toolId','errorId','tool'].includes(key))&&value.version===1&&value.source==='dsh'&&Number.isSafeInteger(value.updatedAt)&&now-value.updatedAt>86400000&&activityFacts(value))await fs.unlink(full);}catch{}}
}
export function createActivityWriter({directory=activityDirectory(),now=Date.now,clock=globalThis,snapshot}={}){
 let facts,disposed=false,heartbeat,queue=Promise.resolve(),lastProbe=-Infinity,enabled=false,lastSignature='',lastWritten=-Infinity,cleaned=false;
 async function active(){if(now()-lastProbe<1000)return enabled;lastProbe=now();try{const dir=await fs.lstat(directory),file=path.join(directory,'desktop-active.json'),stat=await fs.lstat(file);if(!dir.isDirectory()||dir.isSymbolicLink()||!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)return enabled=false;const sentinel=JSON.parse(await fs.readFile(file,'utf8'));return enabled=sentinel.version===1&&Number.isSafeInteger(sentinel.updatedAt)&&sentinel.updatedAt<=now()+5000&&now()-sentinel.updatedAt<=bridgeTTL;}catch{return enabled=false;}}
 async function flush(){if(snapshot)facts=snapshot();facts=activityFacts(facts);if(disposed||!facts){if(heartbeat!==undefined)clock.clearInterval(heartbeat);heartbeat=undefined;return false;}if(!await active()){if(heartbeat!==undefined)clock.clearInterval(heartbeat);heartbeat=undefined;return false;}if(!cleaned){cleaned=true;await cleanStaleBridgeFiles(directory,now()).catch(()=>{});}const signature=JSON.stringify(facts);if(signature===lastSignature&&now()-lastWritten<4000)return true;const value={version:1,source:'dsh',updatedAt:now(),...facts};if(!phases.has(value.phase))return false;const temporary=path.join(directory,`.dsh-${process.pid}-${randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});if(disposed)return false;await fs.rename(temporary,path.join(directory,bridgeFile));lastSignature=signature;lastWritten=now();}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}if(heartbeat===undefined&&!disposed){heartbeat=clock.setInterval(()=>{void run();},5000);heartbeat?.unref?.();}return true;}
 function run(){const result=queue.then(flush);queue=result.catch(()=>false);return result.catch(()=>false);}
 return{update(value){facts=value;return run();},flush:run,refresh(){lastProbe=-Infinity;return run();},async dispose(){disposed=true;if(heartbeat!==undefined)clock.clearInterval(heartbeat);heartbeat=undefined;await queue;}};
}

export function subscribeDSHActivity(ctx,store,publish){
 const off=[],on=(name,fn)=>{if(typeof ctx.on==='function'){const dispose=ctx.on(name,fn);if(typeof dispose==='function')off.push(dispose);}};
 const changed=change=>{if(change)void publish(store.snapshot());};
 on('session/event',(session,event)=>changed(store.event(session,event)));
 on('agent/status',({agent,status})=>changed(store.status(agent,status)));
 on('agent/turn-stopping',({agent})=>changed(store.stopped(agent)));
 on('agent/error',({agent,turn,step})=>changed(store.failed(agent,turn,step)));
 on('agent/disposed',({agent})=>changed(store.remove(agent?.id)));
 on('session/disposed',session=>changed(store.remove(session?.id)));
 // The optional child declares agents explicitly; no undeclared service access.
 const seed=bound=>{for(const agent of(bound.agents.roots?.()??[]).slice(0,64))store.status(agent,agent.status);void publish(store.snapshot());};
 const scope=typeof ctx.inject==='function'?ctx.inject(['agents'],seed):undefined;
 void publish(store.snapshot());return()=>{for(const dispose of off.reverse())dispose();void scope?.dispose?.();};
}

function localRequest(req){try{const host=new URL('http://'+req.headers.host),origin=new URL(req.headers.origin),remote=req.socket?.remoteAddress;return ['127.0.0.1','localhost','[::1]'].includes(host.hostname)&&origin.origin===host.origin&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)&&req.headers['x-baobaolong-activity']==='1'&&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin')&&/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'');}catch{return false;}}
export function activityHandler(store,writer){return async(req,res)=>{
 const finish=(status)=>{res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end();};
 if(req.method!=='POST'){res.setHeader('Allow','POST');finish(405);return;}if(!localRequest(req)){finish(403);return;}
 let size=0,body='';try{for await(const bytes of req){size+=bytes.length;if(size>1024){finish(413);return;}body+=bytes.toString('utf8');}const input=JSON.parse(body);if(!input||Object.keys(input).some(k=>!['sessionId','selected','chineseDraft','awaitingInput'].includes(k))||!store.ui(input)){finish(204);return;}await writer.update(store.snapshot());finish(204);}catch{finish(400);}
};}
/** Watch only the next component of our own path; no directory scans or idle polling. */
export function watchActivitySentinel(directory,refresh,{watcherFactory=watch,clock=globalThis,fallbackMs=10000}={}){
 let disposed=false,watcher,arming=false,fallback;
 const changed=()=>{try{void Promise.resolve(refresh()).catch(()=>{});}catch{}};
 function fallbackWatch(){if(disposed||fallback!==undefined)return;watcher?.close();watcher=undefined;fallback=clock.setInterval(changed,fallbackMs);fallback?.unref?.();}
 async function arm(){if(disposed||arming||fallback!==undefined)return;arming=true;let current=directory;
  try{for(;;){try{const stat=await fs.lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())return;break;}catch{const parent=path.dirname(current);if(parent===current)return;current=parent;}}
   if(disposed)return;const name=current===directory?'desktop-active.json':path.relative(current,directory).split(path.sep)[0];watcher?.close();watcher=watcherFactory(current,{persistent:false},(_event,file)=>{if(file&&file.toString()!==name)return;changed();if(current!==directory)void arm();});watcher.on('error',fallbackWatch);changed();
  }catch{fallbackWatch();}finally{arming=false;}
 }
 void arm();return()=>{disposed=true;watcher?.close();if(fallback!==undefined)clock.clearInterval(fallback);fallback=undefined;};
}
export function installActivityBridge(ctx,options={}){const store=createActivityStore(options),writer=createActivityWriter({...options,snapshot:()=>store.snapshot()}),off=subscribeDSHActivity(ctx,store,value=>writer.update(value));const unwatch=watchActivitySentinel(options.directory??activityDirectory(),()=>writer.refresh());const unregister=ctx.webServer.register({kind:'exact',path:activityRoute,handler:activityHandler(store,writer)});return async()=>{off();unwatch();unregister();await writer.dispose();};}
