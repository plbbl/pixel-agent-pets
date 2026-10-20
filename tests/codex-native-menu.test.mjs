import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const bundle=await build({entryPoints:['src/codex-native-menu.ts'],bundle:true,write:false,format:'cjs',platform:'browser'});
function fixture(){
 const events=[],values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{events.push(['store',key]);values.set(key,value);}};
 const scope={module:{exports:{}},exports:{},window:{localStorage:storage}};scope.exports=scope.module.exports;
 vm.runInNewContext(bundle.outputFiles[0].text,scope);const api=scope.module.exports;
 const state={character:'claude',quality:'auto',size:112,busy:false};
 const actions=[{id:'idle',title:'等待',frames:80,fps:20},{id:'special',title:'中文彩蛋',frames:195,fps:20}];
 const controller={actions:()=>actions,setCharacter:c=>{events.push(['controller-character',c]);state.character=c;},setQuality:q=>{events.push(['controller-quality',q]);state.quality=q;},setSize:s=>{events.push(['controller-size',s]);state.size=s;},preview:a=>events.push(['preview',a])};
 const context={controller,getState:()=>({...state}),storage,onCharacter:(character,id)=>events.push(['host-character',character,id]),onSize:size=>events.push(['host-size',size]),onSettings:()=>events.push(['settings']),onClose:()=>events.push(['close'])};
 const event={preventDefault:()=>events.push(['prevent']),stopPropagation:()=>events.push(['stop'])};
 const model=()=>({state:{...state},actions,canChangeCharacter:true,canResize:true,hasSettings:true,hasClose:true});
 return{api,events,storage,values,state,actions,controller,context,event,model};
}
function plain(value){return JSON.parse(JSON.stringify(value));}
function flatten(items){return items.flatMap(item=>item.submenu?flatten(item.submenu):[item]);}

test('native context menu has four radio characters, independent quality and host-backed sizes',()=>{
 const f=fixture(),items=f.api.buildNativePetMenu(f.model()),leaves=flatten(items);
 assert.deepEqual(plain(items[0].submenu.map(i=>i.id)),['baobaolong:character:claude','baobaolong:character:gpt','baobaolong:character:deepseek','baobaolong:character:clawd']);
 assert.ok(items[0].submenu.every(item=>item.type==='radio'));assert.equal(items[0].submenu.filter(i=>i.checked).length,1);
 assert.deepEqual(plain(items[1].submenu.map(i=>i.id)),['baobaolong:quality:auto','baobaolong:quality:80','baobaolong:quality:160','baobaolong:quality:320']);
 assert.deepEqual(plain(items[2].submenu.map(i=>i.label)),['80 px','112 px','160 px','224 px']);
 assert.ok(leaves.some(i=>i.label==='中文彩蛋 · 195 帧'));assert.ok(leaves.every(i=>!Object.values(i).some(v=>typeof v==='function')));
});

test('character and size selections persist through host callbacks before changing renderer state',async()=>{
 const f=fixture();assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:character:gpt'},f.context),true);
 assert.deepEqual(f.events.slice(0,2),[['host-character','gpt','custom:pixel-agent-gpt'],['controller-character','gpt']]);
 f.events.length=0;assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:size:224'},f.context),true);
 assert.deepEqual(f.events.slice(0,2),[['host-size',224],['controller-size',224]]);
 const prefs=JSON.parse(f.values.get(f.api.nativePetPreferenceKey));assert.deepEqual(prefs,{character:'gpt',quality:'auto',size:224});
 assert.ok([...f.values.keys()].every(key=>key==='baobaolong.codex-native.pet.v1'));
});

test('quality changes are local preferences and do not invoke native geometry or character settings',async()=>{
 const f=fixture();assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:quality:320'},f.context),true);
 assert.deepEqual(f.events[0],['controller-quality','320']);assert.ok(!f.events.some(e=>e[0].startsWith('host-')));
 assert.deepEqual(plain(f.api.readNativePetPreferences(f.storage)),{character:'claude',quality:'320',size:112});
 const menu=f.api.buildNativePetMenu(f.model());assert.equal(menu[1].submenu.find(i=>i.id==='baobaolong:quality:320').checked,true);
});

test('unsupported host actions, busy previews and original Clawd HD choices remain disabled and cannot be forged',async()=>{
 const f=fixture();delete f.context.onCharacter;delete f.context.onSize;delete f.context.onSettings;delete f.context.onClose;
 for(const id of ['baobaolong:character:gpt','baobaolong:size:224','baobaolong:settings','baobaolong:close'])assert.equal(await f.api.applyNativePetMenuSelection({id},f.context),false);
 f.state.busy=true;assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:action:special'},f.context),false);
 f.state.busy=false;f.state.character='clawd';assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:quality:320'},f.context),false);
 assert.equal(f.events.length,0);
});

test('async native menu rechecks busy state, handles cancellation and keeps original Settings and Close callbacks',async()=>{
 const f=fixture();let resolveMenu;f.context.bridge={showContextMenu:items=>{assert.ok(items.length>0);return new Promise(resolve=>{resolveMenu=resolve;});}};
 const pending=f.api.showNativePetContextMenu(f.event,f.context);f.state.busy=true;resolveMenu({id:'baobaolong:action:special'});assert.equal(await pending,false);
 assert.ok(!f.events.some(e=>e[0]==='preview'));
 f.context.bridge={showContextMenu:()=>null};assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),false);
 f.context.bridge={showContextMenu:()=>({id:'baobaolong:settings'})};assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),true);
 f.context.bridge={showContextMenu:()=>({id:'baobaolong:close'})};assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),true);
 assert.ok(f.events.some(e=>e[0]==='settings'));assert.ok(f.events.some(e=>e[0]==='close'));
});

test('malformed IDs, disabled parent items and invalid stored values cannot alter renderer or host state',async()=>{
 const f=fixture();for(const selection of [null,'baobaolong:quality:320',{id:'baobaolong:size:999'},{id:'baobaolong:size:0112'},{id:'baobaolong:character:unknown'},{id:'baobaolong:action:../file'},{id:'baobaolong:preview'},Object.create({id:'baobaolong:close'})])assert.equal(await f.api.applyNativePetMenuSelection(selection,f.context),false);
 assert.equal(f.events.length,0);
 f.values.set(f.api.nativePetPreferenceKey,JSON.stringify({character:'attacker',quality:'720',size:999,prompt:'never retained'}));
 assert.deepEqual(plain(f.api.readNativePetPreferences(f.storage)),{character:'claude',quality:'auto',size:80});
 assert.equal(f.api.writeNativePetPreferences({character:'gpt',quality:'320',size:999},f.storage),false);
});

test('missing bridge leaves the original host menu untouched; host failure or disposal does not fake success',async()=>{
 const f=fixture();f.context.bridge=null;assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),false);assert.equal(f.events.length,0);
 f.context.bridge={showContextMenu:()=>({id:'baobaolong:size:160'})};f.context.onSize=async()=>{throw Error('Host refused resize');};let error;
 f.context.onError=e=>{error=e;};assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),false);assert.match(error.message,/Host refused/);
 assert.ok(!f.events.some(e=>e[0]==='controller-size'||e[0]==='store'));
 f.context.isActive=()=>false;assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:quality:80'},f.context),false);
});

test('one menu per native pet prevents overlapping actions and allows retry after dismissal',async()=>{
 const f=fixture();let resolveMenu,count=0;f.context.bridge={showContextMenu:()=>{count++;return new Promise(resolve=>{resolveMenu=resolve;});}};
 const first=f.api.showNativePetContextMenu(f.event,f.context);assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),false);assert.equal(count,1);
 resolveMenu(null);await first;f.context.bridge={showContextMenu:()=>({id:'baobaolong:action:idle'})};assert.equal(await f.api.showNativePetContextMenu(f.event,f.context),true);
 assert.deepEqual(f.events.at(-1),['preview','idle']);
});


test('official arbitrary integer sizes persist during quality changes while the menu accepts only its size presets',async()=>{
 const f=fixture();f.state.size=133;
 assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:quality:160'},f.context),true);
 assert.deepEqual(plain(f.api.readNativePetPreferences(f.storage)),{character:'claude',quality:'160',size:133});
 assert.deepEqual(plain(f.api.readNativePetPreferences(null,{character:'gpt',quality:'320',size:133})),{character:'gpt',quality:'320',size:133});
 assert.equal(f.api.writeNativePetPreferences({character:'gpt',quality:'auto',size:133},f.storage),true);
 const before=f.events.length;
 assert.equal(await f.api.applyNativePetMenuSelection({id:'baobaolong:size:133'},f.context),false);
 assert.equal(f.events.length,before);
 assert.equal(f.api.writeNativePetPreferences({character:'gpt',quality:'auto',size:133.5},f.storage),false);
});
