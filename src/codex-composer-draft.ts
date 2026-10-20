import {hasChineseDraft} from './codex-activity';

export const nativeDraftChannel='baobaolong.codex-native.draft.v1';
export type NativeDraftMessage={ownerId:string;chineseDraft:boolean};
export type NativeDraftChannel={
 postMessage(message:NativeDraftMessage):void;
 addEventListener(type:'message',listener:(event:MessageEvent<unknown>)=>void):void;
 removeEventListener(type:'message',listener:(event:MessageEvent<unknown>)=>void):void;
 close():void;
};
export type NativeComposerDraftOptions={
 /** Explicit injection keeps this source-only bridge independent of native bindings. */
 onDraft:(chineseDraft:boolean)=>void;
 createChannel?:(name:string)=>NativeDraftChannel|null;
};
function editorFor(target:EventTarget|null):HTMLElement|HTMLTextAreaElement|null{
 const node=target as Node|null;
 const element=node?.nodeType===1?node as Element:node?.parentElement;
 if(!element||typeof element.closest!=='function')return null;
 const editor=element.closest('textarea,[contenteditable]') as HTMLElement|HTMLTextAreaElement|null;
 if(!editor||!editor.closest('[data-codex-composer]'))return null;
 if(editor.tagName.toLowerCase()==='textarea'){
  const textarea=editor as HTMLTextAreaElement;
  return textarea.disabled||textarea.readOnly?null:textarea;
 }
 const editable=editor.getAttribute('contenteditable')?.toLowerCase();
 return editable===''||editable==='true'||editable==='plaintext-only'?editor:null;
}
function chineseIn(editor:HTMLElement|HTMLTextAreaElement){
 // This local value is discarded immediately. Only the computed boolean crosses documents.
 return hasChineseDraft(editor.tagName.toLowerCase()==='textarea'?(editor as HTMLTextAreaElement).value:editor.textContent);
}
function validMessage(value:unknown):value is NativeDraftMessage{
 if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='chineseDraft,ownerId')return false;
 const message=value as NativeDraftMessage;
 return typeof message.chineseDraft==='boolean'&&typeof message.ownerId==='string'&&/^[a-zA-Z0-9_-]{8,96}$/.test(message.ownerId);
}
/**
 * Explicitly installed by a source proposal; never scans historical messages or unrelated inputs.
 * A document with no focused native composer acts only as a boolean receiver.
 */
export function installNativeComposerDraft(doc:Document,options:NativeComposerDraftOptions):()=>void{
 if(typeof options?.onDraft!=='function')throw Error('An explicit native draft boolean receiver is required');
 const ownerId=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():'draft_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
 const channel=options.createChannel?options.createChannel(nativeDraftChannel):typeof BroadcastChannel==='function'?new BroadcastChannel(nativeDraftChannel):null;
 let active:HTMLElement|HTMLTextAreaElement|null=null,observer:MutationObserver|null=null;
 let currentOwner:string|null=null,lastPublished:boolean|undefined,lastDelivered:boolean|undefined,disposed=false;
 const ownsFocusedComposer=()=>!!active&&doc.hasFocus()&&editorFor(doc.activeElement)===active;
 const deliver=(value:boolean)=>{if(value===lastDelivered)return;lastDelivered=value;options.onDraft(value);};
 const deactivate=()=>{observer?.disconnect();observer=null;active=null;};
 const publish=(force=false)=>{
  if(disposed||currentOwner!==ownerId||!ownsFocusedComposer())return;
  const chineseDraft=chineseIn(active!);
  if(!force&&chineseDraft===lastPublished)return;
  lastPublished=chineseDraft;deliver(chineseDraft);channel?.postMessage({ownerId,chineseDraft});
 };
 const claim=(editor:HTMLElement|HTMLTextAreaElement)=>{
  if(disposed||!doc.hasFocus()||editorFor(doc.activeElement)!==editor)return;
  if(active!==editor){
   deactivate();active=editor;
   const Observer=doc.defaultView?.MutationObserver??(typeof MutationObserver==='function'?MutationObserver:undefined);
   if(Observer){observer=new Observer(()=>publish());observer.observe(editor,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['value','contenteditable']});}
  }
  currentOwner=ownerId;publish(true);
 };
 const focused=(event:Event)=>{const editor=editorFor(event.target);if(editor)claim(editor);else deactivate();};
 const input=(event:Event)=>{const editor=editorFor(event.target);if(editor&&editor===active)publish();};
 const windowFocused=()=>{const editor=editorFor(doc.activeElement);if(editor)claim(editor);};
 const message=(event:MessageEvent<unknown>)=>{
  if(disposed||!validMessage(event.data)||event.data.ownerId===ownerId)return;
  // Delayed messages cannot steal ownership from the actually focused composer.
  if(currentOwner===ownerId&&ownsFocusedComposer())return;
  currentOwner=event.data.ownerId;deactivate();deliver(event.data.chineseDraft);
 };
 const dispose=()=>{
  if(disposed)return;disposed=true;
  const owned=currentOwner===ownerId;deactivate();
  if(owned){deliver(false);channel?.postMessage({ownerId,chineseDraft:false});}
  doc.removeEventListener('input',input,true);doc.removeEventListener('compositionend',input,true);doc.removeEventListener('focusin',focused,true);
  doc.defaultView?.removeEventListener('focus',windowFocused);doc.defaultView?.removeEventListener('blur',deactivate);doc.defaultView?.removeEventListener('pagehide',dispose);
  channel?.removeEventListener('message',message);channel?.close();currentOwner=null;lastPublished=undefined;lastDelivered=undefined;
 };
 doc.addEventListener('input',input,true);doc.addEventListener('compositionend',input,true);doc.addEventListener('focusin',focused,true);
 doc.defaultView?.addEventListener('focus',windowFocused);doc.defaultView?.addEventListener('blur',deactivate);doc.defaultView?.addEventListener('pagehide',dispose);
 channel?.addEventListener('message',message);
 const editor=editorFor(doc.activeElement);if(editor)claim(editor);
 return dispose;
}
