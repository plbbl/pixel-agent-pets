import {Player} from './player';
import {hdAssetURL,petView,type HDManifest,type PetQuality,type PetView} from './pet-view';
import {names,type Activity,type Character,type Pack} from './policy';
import metadata from '../.generated/native-packs.json';
import hdMetadata from '../.generated/native-hd.json';
export {recordCodexActivity,selectNativeActivityKey,setNativeChineseDraft,currentNativeActivity,mountBoundNativePet,setNativePetHostActions} from './codex-native-binding';
export {activityFromCodex,activityForCodexSource,hasChineseDraft} from './codex-activity';
export {installNativeComposerDraft,nativeDraftChannel} from './codex-composer-draft';
export {buildNativePetMenu,showNativePetContextMenu,readNativePetPreferences} from './codex-native-menu';

const assetBase=new URL('./baobaolong-assets/',import.meta.url);
const original=metadata as Record<Character,Pack>;
const hd=hdMetadata as HDManifest;
const packs=Object.fromEntries(Object.entries(original).map(([character,p])=>[character,{...p,urls:Object.fromEntries(Object.entries(p.urls).map(([action,file])=>[action,new URL(file,assetBase).href]))}])) as Record<Character,Pack>;
const phases=new Set(['sending','preparing','thinking','responding','tools','retrying','stopping']);
function activityFacts(value:Activity):Activity{
 const next:Activity={busy:!!value.busy,phase:phases.has(value.phase)?value.phase:'thinking'};
 for(const key of ['awaitingInput','chineseDraft'] as const)if(value[key]!==undefined)next[key]=!!value[key];
 for(const key of ['tool','toolId','errorId','turnId'] as const)if(typeof value[key]==='string')next[key]=value[key]!.slice(0,256);
 return next;
}
function localHD(character:string,action:string,file:string){
 return hdAssetURL(character,action,file)?new URL('assets-hd/'+file,assetBase).href:null;
}
export type NativePetOptions={
 character:Character;
 activity:Activity;
 size?:number;
 quality?:PetQuality;
 onNativeContext?:(event:MouseEvent)=>void;
};
export type NativePetController={
 readonly element:HTMLDivElement;
 update(activity:Activity):void;
 setSize(size:number):void;
 setQuality(quality:PetQuality):void;
 setCharacter(character:Character):void;
 preview(action?:string):void;
 actions():{id:string;title:string;frames:number;fps:number}[];
 dispose():void;
};
/** Mounts inside an existing native pet root. It creates no window and has no host/model APIs. */
export function mountNativePet(root:HTMLElement,options:NativePetOptions):NativePetController{
 if(!packs[options.character])throw Error('Unknown native pet character');
 let character=options.character,activity=activityFacts(options.activity),disposed=false;
 let view:PetView=petView({size:options.size??(root.clientWidth>0?root.clientWidth:112),quality:options.quality??'auto'});
 const container=document.createElement('div'),layer=document.createElement('div'),canvas=document.createElement('canvas'),caption=document.createElement('span');
 container.dataset.baobaolongNativePet='true';container.setAttribute('role','img');
 Object.assign(container.style,{position:'relative',display:'block',overflow:'visible',pointerEvents:'none',isolation:'isolate'});
 // Preserve the original 192 × 208 frame. Source 80px tiles occupy 160 × 160 at (16,42).
 Object.assign(layer.style,{position:'absolute',left:'8.3333333333%',top:'20.1923076923%',transform:'scale(0.833333333333)',transformOrigin:'0 0',overflow:'visible',pointerEvents:'none'});
 Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',imageRendering:'pixelated',pointerEvents:'none'});canvas.setAttribute('aria-hidden','true');
 caption.setAttribute('aria-live','off');caption.dataset.petCaption='true';
 Object.assign(caption.style,{position:'absolute',left:'50%',top:'0',transform:'translateX(-50%)',minWidth:'200px',textAlign:'center',whiteSpace:'nowrap',font:'600 10px/14px system-ui',color:'var(--text-secondary, #777)',pointerEvents:'none'});
 layer.append(canvas);container.append(layer,caption);root.append(container);
 let engine:Player;
 const geometry=()=>{container.style.width=view.size+'px';container.style.height=view.size*208/192+'px';layer.style.width=view.size+'px';layer.style.height=view.size+'px';};
 const makePlayer=()=>{
  engine=new Player(canvas,character,packs[character],caption,title=>container.setAttribute('aria-label',names[character]+'：'+title),()=>Promise.resolve(hd),localHD);
  engine.setView(view);engine.update(activity);container.dataset.character=character;
 };
 const context=(event:MouseEvent)=>options.onNativeContext?.(event);
 if(options.onNativeContext)root.addEventListener('contextmenu',context);
 geometry();makePlayer();
 return {
  element:container,
  update(next){if(disposed)return;activity=activityFacts(next);engine.update(activity);},
  setSize(size){if(disposed)return;view=petView({...view,size});geometry();engine.setView(view);},
  setQuality(quality){if(disposed)return;view=petView({...view,quality});engine.setView(view);},
  setCharacter(next){if(disposed||next===character)return;if(!packs[next])throw Error('Unknown native pet character');engine.dispose();character=next;makePlayer();},
  preview(action){if(!disposed)engine.preview(action);},
  actions(){return Object.entries(packs[character].animations).map(([id,a])=>({id,title:a.title,frames:a.frames,fps:a.fps}));},
  dispose(){if(disposed)return;disposed=true;engine.dispose();root.removeEventListener('contextmenu',context);container.remove();},
 };
}
