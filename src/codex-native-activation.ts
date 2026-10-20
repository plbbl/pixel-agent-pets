import packageMetadata from '../package.json';

export const nativePetActivationKey='baobaolong.codex-native.activation.v1';
export const defaultNativePetActivationIntent='pixel-agent-pets@'+packageMetadata.version;
const defaultPetId='custom:pixel-agent-claude';
const ownedPet=/^custom:pixel-agent-(claude|gpt|deepseek|clawd)(-pixel)?$/;
type StorageLike=Pick<Storage,'getItem'|'setItem'>&Partial<Pick<Storage,'removeItem'>>;
type ActivationLockManager={request:(name:string,options:{mode:'exclusive';ifAvailable:true},callback:(lock:unknown)=>Promise<unknown>)=>Promise<unknown>};
const openStateListeners=new Set<(open:unknown)=>void>();
export function recordNativePetOpenState(open:unknown):void{if(typeof open!=='boolean')return;for(const listener of [...openStateListeners])listener(open);}
export function subscribeNativePetOpenState(listener:(open:unknown)=>void):()=>void{openStateListeners.add(listener);return()=>{openStateListeners.delete(listener);};}
let activationSequence=0;
type HostEffect=()=>unknown|Promise<unknown>;
export type NativePetActivationOptions={
 intent?:string;
 storage?:StorageLike|null;
 getSelected:()=>unknown|Promise<unknown>;
 select:(petId:string)=>unknown|Promise<unknown>;
 showPet:HostEffect;
 refreshCatalog:HostEffect;
 subscribeOpenState?:(listener:(open:unknown)=>void)=>(()=>void);
 lock?:ActivationLockManager|null;
 requestOpenState:HostEffect;
 /** The host's existing toggle. Called only after a fresh, observed false state. */
 open?:HostEffect;
 openIfClosed?:HostEffect;
 /** Initial hints do not authorize a toggle; the subscribed host state does. */
 openState?:unknown;
 timeoutMs?:number;
};
export type NativePetActivationResult={status:'complete'|'already-complete'|'cancelled'|'timeout'|'failed';persisted?:boolean;reason?:'catalog'|'selection'|'visibility'|'open-state'|'open'};
/** React effects can return this cleanup immediately; tests may await .done. */
export type NativePetActivationHandle=(()=>void)&{readonly done:Promise<NativePetActivationResult>};
type Run={references:number;done:Promise<NativePetActivationResult>;start:()=>void;cancel:()=>void};
type Registry={pending:Map<string,Run>;complete:Set<string>;togglePending:Set<string>};
const registries=new WeakMap<object,Registry>();
const noStorageRegistry:Registry={pending:new Map(),complete:new Set(),togglePending:new Set()};
function storageFor(options:NativePetActivationOptions):StorageLike|null{
 if(options.storage!==undefined)return options.storage;
 try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}
}
function registryFor(storage:StorageLike|null):Registry{
 if(!storage)return noStorageRegistry;
 let registry=registries.get(storage);if(!registry){registry={pending:new Map(),complete:new Set(),togglePending:new Set()};registries.set(storage,registry);}return registry;
}
function completedIntents(storage:StorageLike|null):string[]{
 try{const value=JSON.parse(storage?.getItem(nativePetActivationKey)??'null');return value?.version===1&&Array.isArray(value.completed)?value.completed.filter((intent:unknown):intent is string=>typeof intent==='string'&&intent.length>0&&intent.length<=256).slice(-32):[];}catch{return[];}
}
function persistCompleted(storage:StorageLike|null,intent:string):boolean{
 if(!storage)return false;
 try{const completed=[...completedIntents(storage).filter(value=>value!==intent),intent].slice(-32);storage.setItem(nativePetActivationKey,JSON.stringify({version:1,completed}));return true;}catch{return false;}
}
function settledHandle(result:NativePetActivationResult):NativePetActivationHandle{
 const dispose=()=>{};return Object.assign(dispose,{done:Promise.resolve(result)});
}
function makeRun(options:NativePetActivationOptions,storage:StorageLike|null,registry:Registry,intent:string):Run{
 let stopped=false,requested=false,settingsReady=false,attempting=false,ownsLease=false,unsubscribe:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const leaseKey=nativePetActivationKey+'.lease.'+encodeURIComponent(intent),owner=Date.now().toString(36)+'-'+(++activationSequence)+'-'+Math.random().toString(36).slice(2);
 const claimLease=()=>{if(!storage)return true;try{const now=Date.now();let lease;try{lease=JSON.parse(storage.getItem(leaseKey)??'null');}catch{}if(lease?.owner&&lease.owner!==owner&&Number.isFinite(lease.expiresAt)&&lease.expiresAt>now&&lease.expiresAt<=now+30000)return false;storage.setItem(leaseKey,JSON.stringify({version:1,owner,expiresAt:now+10000}));return JSON.parse(storage.getItem(leaseKey)??'null')?.owner===owner;}catch{return false;}};
 const releaseLease=()=>{if(!storage||!ownsLease)return;ownsLease=false;try{const lease=JSON.parse(storage.getItem(leaseKey)??'null');if(lease?.owner!==owner)return;if(storage.removeItem)storage.removeItem(leaseKey);else storage.setItem(leaseKey,'');}catch{}};
 let stage:NonNullable<NativePetActivationResult['reason']>='catalog';
 let resolveDone!:(result:NativePetActivationResult)=>void;
 const done=new Promise<NativePetActivationResult>(resolve=>{resolveDone=resolve;});
 const finish=(result:NativePetActivationResult)=>{
  if(stopped)return;stopped=true;
  if(timer!==undefined){clearTimeout(timer);timer=undefined;}
  const detach=unsubscribe;unsubscribe=undefined;try{detach?.();}catch{}
  releaseLease();
  if(registry.pending.get(intent)===run)registry.pending.delete(intent);
  resolveDone(result);
 };
 const confirm=()=>{
  if(stopped||!settingsReady)return;
  registry.togglePending.delete(intent);
  const persisted=persistCompleted(storage,intent);registry.complete.add(intent);
  finish({status:'complete',persisted});
 };
 const attemptToggle=async()=>{
  if(stopped||attempting||registry.togglePending.has(intent))return;
  attempting=true;
  const execute=async()=>{
   if(stopped||registry.togglePending.has(intent)||!claimLease())return;
   ownsLease=!!storage;
   if(stopped){releaseLease();return;}
   const open=options.open??options.openIfClosed;
   if(typeof open!=='function'){finish({status:'failed',reason:'open'});return;}
   registry.togglePending.add(intent);stage='open';
   try{
    const effect=Promise.resolve(open()).then(value=>({kind:'effect' as const,value}));
    const outcome=await Promise.race([effect,done.then(()=>({kind:'stopped' as const}))]);
    if(outcome.kind==='stopped')return;
    if(outcome.value===false){finish({status:'failed',reason:'open'});return;}
    await done;
   }
   catch{finish({status:'failed',reason:'open'});}
  };
  try{
   let lock=options.lock;
   if(lock===undefined){try{lock=typeof navigator==='undefined'?null:navigator.locks as ActivationLockManager;}catch{lock=null;}}
   if(lock?.request)await lock.request(leaseKey,{mode:'exclusive',ifAvailable:true},async held=>{if(held)await execute();});
   else await execute();
  }catch{finish({status:'failed',reason:'open'});}
  finally{attempting=false;}
 };
 const observed=(state:unknown)=>{
  if(stopped||!settingsReady||!requested||typeof state!=='boolean')return;
  if(state){confirm();return;}
  // A cancelled effect may have already issued the normal host toggle. Keep
  // that in-memory pending fact until an actual open event confirms it.
  void attemptToggle();
 };
 const run:Run={references:0,done,cancel:()=>finish({status:'cancelled'}),start:()=>{
  if(stopped)return;
  const timeout=typeof options.timeoutMs==='number'&&Number.isFinite(options.timeoutMs)?Math.min(30000,Math.max(1,Math.round(options.timeoutMs))):10000;
  timer=setTimeout(()=>finish({status:'timeout'}),timeout);
  void(async()=>{
   try{
    stage='catalog';if(await options.refreshCatalog()===false){finish({status:'failed',reason:stage});return;}if(stopped)return;
    stage='selection';const selected=await options.getSelected();if(stopped)return;
    if(typeof selected!=='string'||!ownedPet.test(selected)){if(await options.select(defaultPetId)===false){finish({status:'failed',reason:stage});return;}if(stopped)return;}
    stage='visibility';if(await options.showPet()===false){finish({status:'failed',reason:stage});return;}if(stopped)return;
    settingsReady=true;stage='open-state';
    unsubscribe=(options.subscribeOpenState??subscribeNativePetOpenState)(observed);
    if(typeof unsubscribe!=='function'){unsubscribe=undefined;finish({status:'failed',reason:'open-state'});return;}
    if(stopped){try{unsubscribe();}catch{}unsubscribe=undefined;return;}
    // Ignore subscription replay/default values. Request the actual host state
    // only after all setting writes succeeded and the listener is installed.
    requested=true;
    await options.requestOpenState();
   }catch{finish({status:'failed',reason:stage});}
  })();
 }};
 return run;
}
/** Activate this installed payload once, entirely through injected host callbacks. */
export function ensureNativePetActive(options:NativePetActivationOptions):NativePetActivationHandle{
 const intent=options.intent??defaultNativePetActivationIntent;
 if(typeof intent!=='string'||!intent.trim()||intent.length>256)return settledHandle({status:'failed',reason:'catalog'});
 const storage=storageFor(options),registry=registryFor(storage);
 if(registry.complete.has(intent)||completedIntents(storage).includes(intent))return settledHandle({status:'already-complete',persisted:completedIntents(storage).includes(intent)});
 let run=registry.pending.get(intent);
 if(!run){run=makeRun(options,storage,registry,intent);registry.pending.set(intent,run);const start=run.start;void Promise.resolve().then(start);}
 run.references++;let released=false;
 const dispose=()=>{if(released)return;released=true;run!.references--;if(run!.references===0)run!.cancel();};
 return Object.assign(dispose,{done:run.done});
}
export const activateNativePetOnce=ensureNativePetActive;
