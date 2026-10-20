import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/codex-composer-draft.ts'],bundle:true,format:'cjs',write:false,platform:'browser'});
function setup(){
 const observers=[],messages=[],channels=new Set(),docs=[],reads=[];
 class Element{
  constructor(name,tag='div',attributes={},parent=null){this.name=name;this.tagName=tag.toUpperCase();this.nodeType=1;this.attributes=attributes;this.parentElement=parent;this.text='';this.disabled=false;this.readOnly=false;}
  getAttribute(name){return Object.hasOwn(this.attributes,name)?this.attributes[name]:null;}
  closest(selector){let node=this;while(node){if(selector==='[data-codex-composer]'&&Object.hasOwn(node.attributes,'data-codex-composer'))return node;if(selector==='textarea,[contenteditable]'&&(node.tagName==='TEXTAREA'||Object.hasOwn(node.attributes,'contenteditable')))return node;node=node.parentElement;}return null;}
  get textContent(){reads.push(this.name);if(this.privateHistory)throw Error('Historical messages must not be read');return this.text;}
  get value(){reads.push(this.name);if(this.privateHistory)throw Error('Unrelated fields must not be read');return this.text;}
 }
 class Observer{
  constructor(callback){this.callback=callback;this.closed=false;observers.push(this);}
  observe(target,options){this.target=target;this.options=options;this.closed=false;}
  disconnect(){this.closed=true;}
 }
 function target(){const listeners=new Map();return{listeners,addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);if(!listeners.get(type)?.size)listeners.delete(type);},emit(type,element){for(const listener of [...(listeners.get(type)??[])])listener({target:element});}};}
 function document(){
  const view={...target(),MutationObserver:Observer},body=new Element('body');const doc={...target(),defaultView:view,activeElement:body,focused:false,body,hasFocus(){return this.focused;},querySelectorAll(){throw Error('Global input/history scanning is forbidden');}};docs.push(doc);return doc;
 }
 const createChannel=name=>{
  const listeners=new Set();const channel={name,closed:false,postMessage(value){messages.push(structuredClone(value));for(const other of channels)if(other!==channel&&!other.closed)for(const listener of [...other.listeners])listener({data:structuredClone(value)});},listeners,addEventListener(type,listener){listeners.add(listener);},removeEventListener(type,listener){listeners.delete(listener);},close(){channel.closed=true;channels.delete(channel);}};channels.add(channel);return channel;
 };
 const scope={module:{exports:{}},exports:{},crypto:{randomUUID},MutationObserver:Observer};scope.exports=scope.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,scope);const install=scope.module.exports.installNativeComposerDraft;
 const element=(name,tag='div',attrs={},parent=null)=>new Element(name,tag,attrs,parent);
 function composer(doc,name='draft',tag='div'){
  const owner=element(name+'-composer','div',{'data-codex-composer':''},doc.body),editor=element(name,tag,tag==='textarea'?{}:{contenteditable:'true'},owner);return{owner,editor};
 }
 function focus(doc,editor){for(const other of docs)if(other!==doc&&other.focused){other.focused=false;other.defaultView.emit('blur');}doc.focused=true;doc.activeElement=editor;doc.emit('focusin',editor);}
 function mutate(editor,value){editor.text=value;for(const observer of observers)if(!observer.closed&&observer.target===editor)observer.callback();}
 return{install,createChannel,document,composer,element,focus,mutate,observers,messages,channels,reads};
}
test('only the actually focused native composer emits CJK rising/clear booleans, including scoped programmatic clear',()=>{
 const h=setup(),doc=h.document(),{editor}=h.composer(doc),values=[];
 const history=h.element('history');history.privateHistory=true;history.text='机密中文历史';
 const unrelated=h.element('search','textarea',{},doc.body);unrelated.privateHistory=true;
 assert.equal(h.channels.size,0);const off=h.install(doc,{onDraft:value=>values.push(value),createChannel:h.createChannel});assert.equal(h.observers.length,0);
 h.focus(doc,unrelated);doc.emit('input',unrelated);assert.deepEqual(h.reads,[]);assert.deepEqual(values,[]);
 h.focus(doc,editor);assert.deepEqual(values,[false]);editor.text='secret draft 中文';doc.emit('input',editor);assert.deepEqual(values,[false,true]);
 editor.text='更多中文私有内容';doc.emit('compositionend',editor);assert.deepEqual(values,[false,true]);
 h.mutate(editor,'');assert.deepEqual(values,[false,true,false]);
 assert.ok(h.observers.every(observer=>observer.target===editor));assert.ok(h.observers[0].options.subtree);assert.deepEqual(Array.from(h.observers[0].options.attributeFilter),['value','contenteditable']);
 for(const payload of h.messages){assert.deepEqual(Object.keys(payload).sort(),['chineseDraft','ownerId']);assert.equal(typeof payload.chineseDraft,'boolean');assert.equal(typeof payload.ownerId,'string');assert.ok(!JSON.stringify(payload).includes('secret'));assert.ok(!JSON.stringify(payload).includes('中文'));}
 off();assert.equal(doc.listeners.size,0);assert.equal(doc.defaultView.listeners.size,0);assert.equal(h.channels.size,0);assert.ok(h.observers.every(observer=>observer.closed));
});
test('last focused composer owns cross-document updates; inactive programmatic changes and cleanup cannot overwrite another owner',()=>{
 const h=setup(),first=h.document(),second=h.document(),overlay=h.document(),a=h.composer(first,'first').editor,b=h.composer(second,'second','textarea').editor;
 const seen=[];const offA=h.install(first,{onDraft:()=>{},createChannel:h.createChannel}),offB=h.install(second,{onDraft:()=>{},createChannel:h.createChannel}),offOverlay=h.install(overlay,{onDraft:value=>seen.push(value),createChannel:h.createChannel});
 a.text='中文';h.focus(first,a);assert.deepEqual(seen,[true]);
 b.text='english';h.focus(second,b);assert.deepEqual(seen,[true,false]);const before=h.messages.length;
 h.mutate(a,'别的中文');first.emit('input',a);assert.equal(h.messages.length,before);assert.deepEqual(seen,[true,false]);
 b.text='新的中文';second.emit('compositionend',b);assert.deepEqual(seen,[true,false,true]);offA();assert.deepEqual(seen,[true,false,true]);
 b.text='';second.emit('input',b);assert.deepEqual(seen,[true,false,true,false]);
 const ownerIds=new Set(h.messages.map(message=>message.ownerId));assert.equal(ownerIds.size,2);
 offB();offOverlay();assert.equal(h.channels.size,0);
});
test('readonly or false-editable nodes and forged payloads do not become composer sources; pagehide releases only its own boolean',()=>{
 const h=setup(),doc=h.document(),{owner,editor}=h.composer(doc),values=[];
 const off=h.install(doc,{onDraft:value=>values.push(value),createChannel:h.createChannel});
 const locked=h.element('locked','div',{contenteditable:'false'},owner);locked.text='中文';h.focus(doc,locked);doc.emit('input',locked);assert.deepEqual(values,[]);
 const readOnly=h.element('readonly','textarea',{},owner);readOnly.readOnly=true;readOnly.text='中文';h.focus(doc,readOnly);assert.deepEqual(values,[]);
 for(const channel of h.channels)for(const listener of channel.listeners)for(const payload of [{ownerId:'external_owner',chineseDraft:'中文'},{ownerId:'external_owner',chineseDraft:true,text:'private'},{ownerId:'x',chineseDraft:true}])listener({data:payload});assert.deepEqual(values,[]);
 editor.text='当前中文';h.focus(doc,editor);assert.deepEqual(values,[true]);doc.defaultView.emit('pagehide');assert.deepEqual(values,[true,false]);assert.equal(h.channels.size,0);off();assert.deepEqual(values,[true,false]);
});
