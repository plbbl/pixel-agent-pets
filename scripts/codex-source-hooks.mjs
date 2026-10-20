import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
const marker='baobaolong-native-source-proposal-v1';
const idle={busy:false,phase:'thinking'};

/**
 * Pure, review-only source transformation for the inspected desktop version.
 * It never reads/writes an application, builds ASARs, edits signatures/plists,
 * changes guards, invokes IPC, or launches code. The caller owns both strings.
 */
export function proposeCodexSourceHooks({appInitial,avatarOverlay}){
 if(typeof appInitial!=='string'||typeof avatarOverlay!=='string')throw Error('Expected two extracted JavaScript source strings');
 if(appInitial.includes(marker)||avatarOverlay.includes(marker))throw Error('Source proposal already present');
 if(/\b__bb[A-Za-z0-9_$]*/.test(appInitial)||/\b__bb[A-Za-z0-9_$]*/.test(avatarOverlay))throw Error('Unrecognized source: proposal alias namespace already used');
 const original={appInitial,avatarOverlay},changes=[];
 function replace(source,anchor,replacement,file,purpose){
  const count=source.split(anchor).length-1;
  if(count!==1)throw Error(`Unrecognized ${file}: expected one ${purpose} anchor, found ${count}`);
  changes.push({file,purpose,anchorSha256:digest(anchor),occurrences:count});
  return source.replace(anchor,replacement);
 }
 const start='function D6s()',end='function O6s(';
 const left=appInitial.indexOf(start),right=appInitial.indexOf(end,left+start.length);
 if(left<0||right<0||appInitial.indexOf(start,left+start.length)!==-1)throw Error('Unrecognized native sprite renderer boundaries');
 let renderer=appInitial.slice(left,right);
 const ownership='let __bbMatch=/^custom:pixel-agent-(claude|gpt|deepseek|clawd)(-pixel)?$/.exec(o.petId??``),__bbCharacter=__bbMatch?.[1]??null,__bbPixel=__bbMatch?.[2]!=null;';
 const mount=`
${ownership}
let __bbControllerRef=(0,w6s.useRef)(null),__bbPresetRef=(0,w6s.useRef)({pixel:__bbPixel,quality:__bbPixel?'80':undefined}),__bbAppliedPixelRef=(0,w6s.useRef)(__bbPixel);
if(__bbPresetRef.current.pixel!==__bbPixel)__bbPresetRef.current={pixel:__bbPixel,quality:__bbPixel?'80':'auto'};
(0,w6s.useEffect)(()=>{
 if(__bbCharacter==null)return;
 let __bbRoot=u.current;if(__bbRoot==null)return;
 let __bbDisposed=false,__bbController=null,__bbResize=null;
 const __bbBackground=__bbRoot.style.backgroundImage,__bbOverflow=__bbRoot.style.overflow;
 const __bbWidth=()=>Math.max(80,Math.min(224,Math.round(__bbRoot.clientWidth||112)));
 import('./codex-native.js').then(__bbModule=>{
  if(__bbDisposed)return;
  __bbController=__bbModule.mountBoundNativePet(__bbRoot,{character:__bbCharacter,size:__bbWidth(),...(__bbPresetRef.current.quality?{quality:__bbPresetRef.current.quality}:{})});
  __bbControllerRef.current=__bbController;
  __bbRoot.style.backgroundImage='none';__bbRoot.style.overflow='visible';
  __bbRoot.setAttribute('data-baobaolong-native-renderer','full');
  __bbResize=new ResizeObserver(()=>{if(!__bbDisposed)__bbController?.setSize(__bbWidth());});
  __bbResize.observe(__bbRoot);
 }).catch(()=>{if(!__bbDisposed)__bbRoot.setAttribute('data-baobaolong-native-renderer','unavailable');});
 return()=>{
  __bbDisposed=true;__bbResize?.disconnect();__bbController?.dispose();
  if(__bbControllerRef.current===__bbController)__bbControllerRef.current=null;
  if(__bbRoot.style.backgroundImage==='none')__bbRoot.style.backgroundImage=__bbBackground;
  if(__bbRoot.style.overflow==='visible')__bbRoot.style.overflow=__bbOverflow;
  __bbRoot.removeAttribute('data-baobaolong-native-renderer');
 };
},[__bbCharacter]);
(0,w6s.useEffect)(()=>{
 if(__bbAppliedPixelRef.current===__bbPixel)return;
 __bbAppliedPixelRef.current=__bbPixel;
 __bbControllerRef.current?.setQuality(__bbPixel?'80':'auto');
},[__bbPixel]);
`;
 renderer=replace(renderer,'p=o.assetRef==null?o.spriteRowCount:q$.rows;return','p=o.assetRef==null?o.spriteRowCount:q$.rows;'+mount+'return','app-initial','stable owned-character mount');
 renderer=replace(renderer,'let e=u.current;if(e==null)return;if(n!=null)','let e=u.current;if(e==null||__bbCharacter!=null)return;if(n!=null)','app-initial','foreign-only legacy sprite timer');
 renderer=replace(renderer,'},[f,n,r,d,p])','},[f,n,r,d,p,__bbCharacter])','app-initial','ownership transition timer cleanup');
 renderer=replace(renderer,'backgroundImage:`url(${o.spritesheetUrl??e[o.assetRef]})`','backgroundImage:__bbCharacter==null?`url(${o.spritesheetUrl??e[o.assetRef]})`:`none`','app-initial','owned background stays hidden across React image updates');
 appInitial=appInitial.slice(0,left)+renderer+appInitial.slice(right);
 appInitial='/* '+marker+'; review-only source text, not an installed patch */\n'+
  'import{installNativeComposerDraft as __bbInstallDraft,setNativeChineseDraft as __bbSetDraft}from"./codex-native.js";\n'+
  '__bbInstallDraft(document,{onDraft:__bbSetDraft});\n'+appInitial;
 avatarOverlay=replace(avatarOverlay,'p=up(e,f),m=Kr(s)','p=(__bbRecordActivity(la(c.conversationId,l),e,{awaitingInput:f!=null}),up(e,f)),m=Kr(s)','avatar-overlay','project raw activity before notification filtering');
 avatarOverlay=replace(avatarOverlay,'let Xt=Yt,Zt=d.quickChat?.stashedEdge!=null',"__bbSelectActivity(_[0]?.notificationPreferenceId??_[0]?.id??null);let Xt=Yt,Zt=d.quickChat?.stashedEdge!=null",'avatar-overlay','preserve original selected notification source');
 const settingsAnchor='z=rp({includeMcpElicitationCancelAction:!0,openAIFormElicitationsEnabled:s,intl:c,localThreads:A,excludedConversationId:D,remoteTasks:I,threadDetailLevel:l}),B;';
 avatarOverlay=replace(avatarOverlay,settingsAnchor,
  'z=(__bbSetHost({onSize:__bbSize=>__bbWriteSetting(o,E.petSize,__bbSize),onCharacter:(__bbCharacter,__bbId)=>__bbWriteSetting(o,E.selectedAvatarId,__bbId)}),rp({includeMcpElicitationCancelAction:!0,openAIFormElicitationsEnabled:s,intl:c,localThreads:A,excludedConversationId:D,remoteTasks:I,threadDetailLevel:l})),B;',
  'avatar-overlay','bind official size and selected-avatar setting owners in hv');
 const contextAnchor='):wo=t[184];let To=ke?Ct:void 0,Eo;';
 avatarOverlay=replace(avatarOverlay,contextAnchor,
  '):wo=t[184];__bbSetHost({onSettings:wo.find(__bbItem=>__bbItem.id===`pet-settings`)?.onSelect,onClose:wo.find(__bbItem=>__bbItem.id===`close-avatar`)?.onSelect});let To=ke?Ct:void 0,Eo;',
  'avatar-overlay','preserve original Settings and Close callbacks from Cv');
 avatarOverlay='/* '+marker+'; review-only source text, not an installed patch */\n'+
  'import{recordCodexActivity as __bbRecordActivity,selectNativeActivityKey as __bbSelectActivity,setNativePetHostActions as __bbSetHost}from"./codex-native.js";\n'+
  'import{qnt as __bbWriteSetting}from"./app-shared-52443cbe9ac4.js";\n'+avatarOverlay;
 return{appInitial,avatarOverlay,manifest:{
  version:1,mode:'review-only-source-proposal',appliedToApplication:false,kernelChanges:false,
  inspectedVersion:'26.1013.40934 (20770)',
  ownershipPattern:'^custom:pixel-agent-(claude|gpt|deepseek|clawd)(-pixel)?$',
  sources:Object.fromEntries(Object.entries(original).map(([name,source])=>[name,{originalSha256:digest(source),proposedSha256:digest(name==='appInitial'?appInitial:avatarOverlay)}])),
  changes,requiredExports:['recordCodexActivity','selectNativeActivityKey','mountBoundNativePet','setNativePetHostActions','installNativeComposerDraft','setNativeChineseDraft'],
  behavior:{idleFallback:idle,selectedSource:'Qg notifications[0].notificationPreferenceId ?? notifications[0].id',nativeWindow:'existing E6s root',mountDependency:'owned character only; never legacy animation state or quality preset',pixelPreset:'owned -pixel IDs initially select quality 80; changes call setQuality without remount',foreignPetTimer:'original timer body preserved',sourceStore:'only selected exact key is observed',composerDraft:'explicit installer; current composer Chinese boolean only, same-origin BroadcastChannel',nativeSettings:'hv uses original query client and Fct petSize/selectedAvatarId setting registry',nativeContextMenu:'Cv preserves original pet-settings and close-avatar onSelect callbacks'},
  limitations:['Source proposal is not a running native integration.','Native callbacks are proposed exact source hooks, not installed or runtime-verified.','Real native visual testing, caption edge clipping, and native menu/size changes remain unverified.','A failed renderer import is marked unavailable; it does not claim full animation support.','No signature, ASAR integrity, permission, runtime, or computer-use guard changes are provided.'],
 }};
}
