import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/codex-native-activation.ts'],bundle:true,write:false,format:'cjs',platform:'browser'});
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let index=0;index<24;index++)await Promise.resolve();};
function fixture({values=new Map(),storage:providedStorage,lock}={}){
 let clock=1000000,timerSequence=0,selected='default:cat';
 const events=[],listeners=new Set(),timers=new Map();
 const storage=providedStorage??{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 class TestDate extends Date{static now(){return clock;}}
 const scope={module:{exports:{}},exports:{},window:{localStorage:storage},Date:TestDate,setTimeout:(callback,delay)=>{const id=++timerSequence;timers.set(id,{callback,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};scope.exports=scope.module.exports;
 vm.runInNewContext(bundle.outputFiles[0].text,scope);const api=scope.module.exports;
 const emit=state=>{for(const listener of [...listeners])listener(state);};
 const options={storage,lock,intent:'fixture@0.3.0',refreshCatalog:()=>{events.push(['refresh']);},getSelected:()=>{events.push(['get-selected']);return selected;},select:id=>{events.push(['select',id]);selected=id;},showPet:()=>{events.push(['show']);},subscribeOpenState:listener=>{listeners.add(listener);return()=>{events.push(['unsubscribe']);listeners.delete(listener);};},requestOpenState:()=>{events.push(['request']);},open:()=>{events.push(['open']);}};
 const advance=async(milliseconds)=>{clock+=milliseconds;for(const [id,timer]of[...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}await flush();};
 const complete=()=>{const text=values.get(api.nativePetActivationKey);return text?JSON.parse(text):null;};
 return{api,storage,values,events,listeners,timers,options,emit,advance,complete,setSelected:value=>{selected=value;}};
}

test('writes settings and requests fresh host state before opening once; completion requires observed open',async()=>{
 const f=fixture(),handle=f.api.ensureNativePetActive(f.options);await flush();
 assert.deepEqual(f.events,[['refresh'],['get-selected'],['select','custom:pixel-agent-claude'],['show'],['request']]);
 assert.equal(f.complete(),null);f.emit(false);f.emit(false);await flush();
 assert.equal(f.events.filter(event=>event[0]==='open').length,1);assert.equal(f.complete(),null);
 f.emit(true);assert.deepEqual(plain(await handle.done),{status:'complete',persisted:true});
 assert.deepEqual(f.complete(),{version:1,completed:['fixture@0.3.0']});assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
 assert.equal([...f.values.keys()].filter(key=>key.includes('.lease.')).length,0);handle();
});

test('preserves an owned selection including pixel quality variants and never reopens a completed intent',async()=>{
 const f=fixture();f.setSelected('custom:pixel-agent-deepseek-pixel');f.options.requestOpenState=()=>{f.events.push(['request']);f.emit(true);};
 assert.equal((await f.api.activateNativePetOnce(f.options).done).status,'complete');
 assert.ok(!f.events.some(event=>event[0]==='select'||event[0]==='open'));
 const count=f.events.length;assert.equal((await f.api.ensureNativePetActive(f.options).done).status,'already-complete');assert.equal(f.events.length,count);
 const second=f.api.ensureNativePetActive({...f.options,intent:'fixture@0.3.1'});assert.equal((await second.done).status,'complete');
 assert.deepEqual(f.complete().completed,['fixture@0.3.0','fixture@0.3.1']);
});

test('persisted completion survives module reload and respects a user later hiding the pet',async()=>{
 const values=new Map(),first=fixture({values});first.options.requestOpenState=()=>first.emit(true);
 assert.equal((await first.api.ensureNativePetActive(first.options).done).status,'complete');
 const second=fixture({values});assert.equal((await second.api.ensureNativePetActive(second.options).done).status,'already-complete');assert.deepEqual(second.events,[]);
});

test('subscription replay, hints and unknown state never authorize opening',async()=>{
 const f=fixture();f.options.openState=false;f.options.subscribeOpenState=listener=>{listener(false);f.listeners.add(listener);return()=>f.listeners.delete(listener);};
 const handle=f.api.ensureNativePetActive(f.options);await flush();f.emit(null);f.emit('false');await flush();
 assert.ok(!f.events.some(event=>event[0]==='open'));await f.advance(10000);
 assert.equal((await handle.done).status,'timeout');assert.equal(f.complete(),null);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});

test('failed host writes do not request open state, toggle or persist activation',async()=>{
 for(const [field,reason]of[['refreshCatalog','catalog'],['select','selection'],['showPet','visibility']]){
  const f=fixture();f.options[field]=()=>false;const result=await f.api.ensureNativePetActive(f.options).done;
  assert.deepEqual(plain(result),{status:'failed',reason});assert.ok(!f.events.some(event=>event[0]==='request'||event[0]==='open'));assert.equal(f.complete(),null);assert.equal(f.timers.size,0);
 }
 const f=fixture();f.options.showPet=async()=>{throw Error('write failed');};assert.equal((await f.api.ensureNativePetActive(f.options).done).status,'failed');assert.equal(f.complete(),null);
});

test('concurrent effects share one activation and only the final cleanup cancels pending work',async()=>{
 const f=fixture(),first=f.api.ensureNativePetActive(f.options),second=f.api.ensureNativePetActive(f.options);assert.equal(first.done,second.done);first();first();await flush();
 assert.equal(f.events.filter(event=>event[0]==='refresh').length,1);assert.equal(f.listeners.size,1);second();
 assert.equal((await first.done).status,'cancelled');assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);assert.equal(f.complete(),null);
});

test('cancellation cleans a pending request and never duplicates a possibly in-flight normal host toggle',async()=>{
 const f=fixture(),first=f.api.ensureNativePetActive(f.options);await flush();f.emit(false);await flush();first();
 assert.equal((await first.done).status,'cancelled');assert.equal(f.listeners.size,0);assert.equal(f.complete(),null);
 const next=f.api.ensureNativePetActive(f.options);await flush();f.emit(false);await flush();assert.equal(f.events.filter(event=>event[0]==='open').length,1);
 f.emit(true);assert.equal((await next.done).status,'complete');assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});

test('cleanup during asynchronous settings prevents later settings, subscriptions or opening',async()=>{
 const f=fixture();let finishRefresh;f.options.refreshCatalog=()=>new Promise(resolve=>{finishRefresh=resolve;});
 const handle=f.api.ensureNativePetActive(f.options);await flush();handle();finishRefresh();await flush();
 assert.equal((await handle.done).status,'cancelled');assert.deepEqual(f.events,[]);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});

test('default open-state dispatcher ignores stale events and detaches after completion',async()=>{
 const f=fixture();delete f.options.subscribeOpenState;f.api.recordNativePetOpenState(false);
 const handle=f.api.ensureNativePetActive(f.options);await flush();assert.ok(!f.events.some(event=>event[0]==='open'));
 f.api.recordNativePetOpenState('false');f.api.recordNativePetOpenState(false);await flush();assert.equal(f.events.filter(event=>event[0]==='open').length,1);
 f.api.recordNativePetOpenState(true);assert.equal((await handle.done).status,'complete');const count=f.events.length;f.api.recordNativePetOpenState(false);await flush();assert.equal(f.events.length,count);
});

test('separate native windows share the lease and lock, so simultaneous closed responses toggle only once',async()=>{
 const values=new Map(),held=new Set(),lock={request:async(name,options,callback)=>{assert.equal(options.ifAvailable,true);if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
 const a=fixture({values,lock}),b=fixture({values,lock}),first=a.api.ensureNativePetActive(a.options),second=b.api.ensureNativePetActive(b.options);await flush();a.emit(false);b.emit(false);await flush();
 assert.equal([...a.events,...b.events].filter(event=>event[0]==='open').length,1);a.emit(true);b.emit(true);
 assert.equal((await first.done).status,'complete');assert.equal((await second.done).status,'complete');await flush();assert.equal(held.size,0);assert.equal([...values.keys()].filter(key=>key.includes('.lease.')).length,0);
});

test('an active foreign lease blocks opening; timeout never leaves our lease or completion marker',async()=>{
 const f=fixture(),leaseKey=f.api.nativePetActivationKey+'.lease.'+encodeURIComponent(f.options.intent);f.values.set(leaseKey,JSON.stringify({version:1,owner:'other-window',expiresAt:1009000}));
 const handle=f.api.ensureNativePetActive(f.options);await flush();f.emit(false);await flush();assert.ok(!f.events.some(event=>event[0]==='open'));await f.advance(10000);
 assert.equal((await handle.done).status,'timeout');assert.equal(f.complete(),null);assert.equal(JSON.parse(f.values.get(leaseKey)).owner,'other-window');assert.equal(f.listeners.size,0);
});

test('host toggle failure and blocked storage never claim a successful activation',async()=>{
 const f=fixture();f.options.open=()=>false;const handle=f.api.ensureNativePetActive(f.options);await flush();f.emit(false);assert.deepEqual(plain(await handle.done),{status:'failed',reason:'open'});assert.equal(f.complete(),null);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
 const blocked=fixture({storage:{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}}});const pending=blocked.api.ensureNativePetActive(blocked.options);await flush();blocked.emit(false);await flush();assert.ok(!blocked.events.some(event=>event[0]==='open'));await blocked.advance(10000);assert.equal((await pending.done).status,'timeout');
});

test('timeout releases the cross-window lock even if the host toggle promise never settles',async()=>{
 const held=new Set(),lock={request:async(name,options,callback)=>{held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
 const f=fixture({lock});f.options.open=()=>{f.events.push(['open']);return new Promise(()=>{});};
 const handle=f.api.ensureNativePetActive(f.options);await flush();f.emit(false);await flush();assert.equal(held.size,1);
 await f.advance(10000);assert.equal((await handle.done).status,'timeout');await flush();assert.equal(held.size,0);
 assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);assert.equal(f.complete(),null);assert.equal([...f.values.keys()].filter(key=>key.includes('.lease.')).length,0);
});
