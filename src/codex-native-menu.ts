import type {NativePetController} from './codex-native';
import type {PetQuality} from './pet-view';
import {names,type Character} from './policy';

export const nativePetPreferenceKey='baobaolong.codex-native.pet.v1';
export const nativePetIds:Record<Character,string>={claude:'custom:pixel-agent-claude',gpt:'custom:pixel-agent-gpt',deepseek:'custom:pixel-agent-deepseek',clawd:'custom:pixel-agent-clawd'};
export const nativePetSizes=[80,112,160,224] as const;
export const nativePetQualities=['auto','80','160','320'] as const;
const characters=Object.keys(nativePetIds) as Character[];
const prefix='baobaolong:';

export type NativePetPreferences={character:Character;quality:PetQuality;size:number};
export type NativePetMenuState=NativePetPreferences&{busy:boolean};
export type NativePetAction={id:string;title:string;frames:number;fps:number};
export type NativePetMenuItem={id?:string;label?:string;type?:'normal'|'separator'|'radio';checked?:boolean;enabled?:boolean;submenu?:NativePetMenuItem[]};
export type NativePetMenuBridge={showContextMenu(items:NativePetMenuItem[]):Promise<unknown>|unknown};
export type NativePetStorage=Pick<Storage,'getItem'|'setItem'>;
export type NativePetMenuModel={state:NativePetMenuState;actions:readonly NativePetAction[];canChangeCharacter:boolean;canResize:boolean;hasSettings:boolean;hasClose:boolean};
export type NativePetMenuContext={
 controller:Pick<NativePetController,'setCharacter'|'setQuality'|'setSize'|'preview'|'actions'>;
 getState:()=>NativePetMenuState;
 bridge?:NativePetMenuBridge|null;
 storage?:NativePetStorage|null;
 /** The host persists Codex's selected native pet ID. The menu never edits it. */
 onCharacter?:(character:Character,nativePetId:string)=>void|Promise<void>;
 /** The host updates its supported pet-size setting and native window geometry. */
 onSize?:(size:number)=>void|Promise<void>;
 onSettings?:()=>void|Promise<void>;
 onClose?:()=>void|Promise<void>;
 isActive?:()=>boolean;
 onError?:(error:unknown)=>void;
};

function validCharacter(value:unknown):value is Character{return typeof value==='string'&&characters.includes(value as Character);}
function validQuality(value:unknown):value is PetQuality{return typeof value==='string'&&nativePetQualities.includes(value as PetQuality);}
function validSize(value:unknown):value is number{return typeof value==='number'&&Number.isInteger(value)&&value>=80&&value<=224;}
function presetSize(value:unknown):value is number{return validSize(value)&&nativePetSizes.includes(value as typeof nativePetSizes[number]);}
function assertState(value:NativePetMenuState){
 if(!validCharacter(value.character)||!validQuality(value.quality)||!validSize(value.size)||typeof value.busy!=='boolean')throw Error('Invalid native pet menu state');
}
function safeActions(actions:readonly NativePetAction[]):NativePetAction[]{
 const seen=new Set<string>();return actions.filter(action=>{
  if(!/^[A-Za-z0-9_-]{1,96}$/.test(action.id)||seen.has(action.id)||typeof action.title!=='string'||!Number.isInteger(action.frames)||action.frames<1||!Number.isFinite(action.fps)||action.fps<=0)return false;
  seen.add(action.id);return true;
 }).map(action=>({...action,title:action.title.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,96)}));
}
/** Serializable DTOs for the host's existing native menu. It contains no callbacks. */
export function buildNativePetMenu(model:NativePetMenuModel):NativePetMenuItem[]{
 const{state}=model;assertState(state);
 const qualityLabels:Record<PetQuality,string>={auto:'自动（跟随尺寸与屏幕）','80':'80 px · 轻量','160':'160 px · 清晰','320':'320 px · 高清'};
 const actions=safeActions(model.actions);
 return[
  {id:prefix+'characters',label:'切换角色',submenu:characters.map(character=>({id:prefix+'character:'+character,label:names[character],type:'radio',checked:state.character===character,enabled:model.canChangeCharacter}))},
  {id:prefix+'quality',label:state.character==='clawd'?'清晰度（Clawd 保持原像素）':'清晰度',submenu:nativePetQualities.map(quality=>({id:prefix+'quality:'+quality,label:qualityLabels[quality],type:'radio',checked:state.quality===quality,enabled:state.character!=='clawd'||quality==='auto'||quality==='80'}))},
  {id:prefix+'size',label:'显示大小',submenu:nativePetSizes.map(size=>({id:prefix+'size:'+size,label:size+' px',type:'radio',checked:state.size===size,enabled:model.canResize}))},
  {type:'separator'},
  {id:prefix+'preview',label:state.busy?'动作预览（任务进行中）':'动作预览',enabled:!state.busy&&actions.length>0,submenu:actions.map(action=>({id:prefix+'action:'+action.id,label:action.title+' · '+action.frames+' 帧',enabled:!state.busy}))},
  {type:'separator'},
  {id:prefix+'settings',label:'宠物设置…',enabled:model.hasSettings},
  {id:prefix+'close',label:'关闭宠物',enabled:model.hasClose},
 ];
}
function availableIds(items:readonly NativePetMenuItem[],enabled=true):Set<string>{
 const ids=new Set<string>();for(const item of items){const allowed=enabled&&item.enabled!==false;if(item.submenu){for(const id of availableIds(item.submenu,allowed))ids.add(id);}else if(allowed&&item.id)ids.add(item.id);}return ids;
}
function modelFor(context:NativePetMenuContext):NativePetMenuModel{
 return{state:context.getState(),actions:context.controller.actions(),canChangeCharacter:typeof context.onCharacter==='function',canResize:typeof context.onSize==='function',hasSettings:typeof context.onSettings==='function',hasClose:typeof context.onClose==='function'};
}
function browserStorage():NativePetStorage|null{try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}}
function browserBridge():NativePetMenuBridge|null{
 if(typeof window==='undefined')return null;
 const bridge=(window as unknown as {electronBridge?:Partial<NativePetMenuBridge>}).electronBridge;
 return typeof bridge?.showContextMenu==='function'?bridge as NativePetMenuBridge:null;
}
export function readNativePetPreferences(storage:NativePetStorage|null=browserStorage(),fallback:NativePetPreferences={character:'claude',quality:'auto',size:80}):NativePetPreferences{
 const defaults:NativePetPreferences={character:validCharacter(fallback.character)?fallback.character:'claude',quality:validQuality(fallback.quality)?fallback.quality:'auto',size:validSize(fallback.size)?fallback.size:80};
 try{
  const input=JSON.parse(storage?.getItem(nativePetPreferenceKey)??'null');
  if(!input||typeof input!=='object'||Array.isArray(input))return defaults;
  return{character:validCharacter(input.character)?input.character:defaults.character,quality:validQuality(input.quality)?input.quality:defaults.quality,size:validSize(input.size)?input.size:defaults.size};
 }catch{return defaults;}
}
export function writeNativePetPreferences(preferences:NativePetPreferences,storage:NativePetStorage|null=browserStorage()):boolean{
 if(!validCharacter(preferences.character)||!validQuality(preferences.quality)||!validSize(preferences.size))return false;
 try{if(!storage)return false;storage.setItem(nativePetPreferenceKey,JSON.stringify({character:preferences.character,quality:preferences.quality,size:preferences.size}));return true;}catch{return false;}
}
/** Accept only a known, enabled leaf returned by the existing bridge. */
export async function applyNativePetMenuSelection(selection:unknown,context:NativePetMenuContext):Promise<boolean>{
 if(context.isActive?.()===false||!selection||typeof selection!=='object'||!Object.hasOwn(selection,'id'))return false;
 const id=(selection as {id?:unknown}).id;if(typeof id!=='string')return false;
 const model=modelFor(context);if(!availableIds(buildNativePetMenu(model)).has(id))return false;
 const storage=context.storage===undefined?browserStorage():context.storage;
 if(id.startsWith(prefix+'character:')){
  const character=id.slice((prefix+'character:').length);if(!validCharacter(character)||!context.onCharacter)return false;
  await context.onCharacter(character,nativePetIds[character]);if(context.isActive?.()===false)return false;
  context.controller.setCharacter(character);writeNativePetPreferences({...context.getState(),character},storage);return true;
 }
 if(id.startsWith(prefix+'quality:')){
  const quality=id.slice((prefix+'quality:').length);if(!validQuality(quality))return false;
  context.controller.setQuality(quality);writeNativePetPreferences({...context.getState(),quality},storage);return true;
 }
 if(id.startsWith(prefix+'size:')){
  const raw=id.slice((prefix+'size:').length),size=Number(raw);if(!presetSize(size)||String(size)!==raw||!context.onSize)return false;
  await context.onSize(size);if(context.isActive?.()===false)return false;
  context.controller.setSize(size);writeNativePetPreferences({...context.getState(),size},storage);return true;
 }
 if(id.startsWith(prefix+'action:')){
  if(context.getState().busy)return false;
  const action=id.slice((prefix+'action:').length);
  if(!safeActions(context.controller.actions()).some(item=>item.id===action))return false;
  context.controller.preview(action);return true;
 }
 if(id===prefix+'settings'&&context.onSettings){await context.onSettings();return true;}
 if(id===prefix+'close'&&context.onClose){await context.onClose();return true;}
 return false;
}
const pendingMenus=new WeakSet<NativePetMenuContext['controller']>();
/** Reuses the native context menu; missing bridge leaves the host's fallback intact. */
export async function showNativePetContextMenu(event:Pick<MouseEvent,'preventDefault'|'stopPropagation'>,context:NativePetMenuContext):Promise<boolean>{
 const bridge=context.bridge===undefined?browserBridge():context.bridge;
 if(!bridge||typeof bridge.showContextMenu!=='function'||context.isActive?.()===false)return false;
 event.preventDefault();event.stopPropagation();if(pendingMenus.has(context.controller))return false;
 pendingMenus.add(context.controller);
 try{
  const selection=await bridge.showContextMenu(buildNativePetMenu(modelFor(context)));
  return await applyNativePetMenuSelection(selection,context);
 }catch(error){context.onError?.(error);return false;}
 finally{pendingMenus.delete(context.controller);}
}
