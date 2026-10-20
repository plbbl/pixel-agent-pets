import {activityFromCodex, type CodexActivityOptions} from './codex-activity';
import {mountNativePet, type NativePetOptions} from './codex-native';
import {readNativePetPreferences,showNativePetContextMenu,type NativePetMenuContext} from './codex-native-menu';
import {petView} from './pet-view';
import type {Activity} from './policy';

const idle:Activity={busy:false,phase:'thinking'};
const facts=new Map<string,Activity>();
const listeners=new Set<(activity:Activity)=>void>();
let selected:string|null=null,lastSelected:string|null=null,chineseDraft=false;
let published='';
type HostActions=Pick<NativePetMenuContext,'onCharacter'|'onSize'|'onSettings'|'onClose'>;
let hostActions:HostActions={};
/** Callbacks supplied by the existing host settings and context-menu owners. */
export function setNativePetHostActions(actions:HostActions){hostActions={...hostActions,...actions};}
function publish(activity:Activity){
 const next={...activity,chineseDraft},json=JSON.stringify(next);
 if(published===json)return;published=json;
 for(const listener of listeners)listener(next);
}
/** Facts only, bounded to recent sources. Conversation text is never retained. */
export function recordCodexActivity(key:string,thread:unknown,options:CodexActivityOptions={}){
 if(typeof key!=='string'||!key||key.length>1024)return;
 const activity=activityFromCodex(thread,{awaitingInput:options.awaitingInput});
 facts.delete(key);facts.set(key,activity);
 while(facts.size>200){const discard=[...facts.keys()].find(candidate=>candidate!==selected&&candidate!==lastSelected);if(!discard)break;facts.delete(discard);}
 if(key===selected)publish(activity);
}
/** The host supplies its actual selected notification key; recency is never guessed. */
export function selectNativeActivityKey(key:string|null){
 const next=typeof key==='string'&&key.length<=1024&&key?key:null;
 if(next===selected)return;
 const previous=selected;selected=next;
 if(next){lastSelected=next;publish(facts.get(next)??idle);return;}
 const terminal=previous?facts.get(previous):undefined;
 // Native notifications disappear for interrupted/completed turns. Deliver the
 // cached final facts before becoming idle, so a stop cannot become a success.
 if(terminal&&!terminal.busy)publish(terminal);
 else publish(idle);
}
/** Current composer boolean supplied by a host UI hook, never historical text. */
export function setNativeChineseDraft(value:boolean){
 if(chineseDraft===!!value)return;chineseDraft=!!value;
 publish(currentNativeActivity());
}
export function currentNativeActivity():Activity{
 const candidate=selected?facts.get(selected):lastSelected?facts.get(lastSelected):undefined;
 const activity=selected?candidate??idle:candidate&&!candidate.busy?candidate:idle;
 return {...activity,chineseDraft};
}
/** Mounted by the original renderer once, independently of its legacy 9 states. */
export function mountBoundNativePet(root:HTMLElement,options:Omit<NativePetOptions,'activity'>&{activity?:Activity}){
 let active=true,character=options.character;
 const saved=readNativePetPreferences(undefined,{character,quality:options.quality??'auto',size:options.size??112});
 let view=petView({size:options.size??saved.size,quality:options.quality??saved.quality});
 const context=(event:MouseEvent)=>{
  if(options.onNativeContext){options.onNativeContext(event);return;}
  // Until the real host menu callbacks have arrived, retain the original menu.
  if(!hostActions.onSettings&&!hostActions.onClose)return;
  void showNativePetContextMenu(event,{controller:bound,getState:()=>({...view,character,busy:!!currentNativeActivity().busy||!!currentNativeActivity().awaitingInput}),...hostActions,isActive:()=>active});
 };
 const controller=mountNativePet(root,{...options,...view,activity:options.activity??currentNativeActivity(),onNativeContext:context});
 const update=(activity:Activity)=>controller.update(activity);listeners.add(update);
 const dispose=controller.dispose.bind(controller);
 const bound={...controller,
  setSize(size:number){view=petView({...view,size});controller.setSize(view.size);},
  setQuality(quality:NativePetOptions['quality']){view=petView({...view,quality});controller.setQuality(view.quality);},
  setCharacter(next:NativePetOptions['character']){character=next;controller.setCharacter(next);},
  dispose(){if(!active)return;active=false;listeners.delete(update);dispose();},
 };
 return bound;
}
