import test from 'node:test';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {proposeCodexSourceHooks} from '../scripts/codex-source-hooks.mjs';

// Minimal structural fixtures retain the inspected anchors, without shipping the
// vendor's application bundle. Tests parse transformed text; they never execute it.
const appInitial='const unrelated="keep foreign pets unchanged";function jIl(){let t=hi(U),o=e=>{let i=t.get(Akl);t.set(Akl,e.isOpen)},c=[];return(0,PIl.useEffect)(MIl,c),null}function MIl(){hs.dispatchMessage(`avatar-overlay-open-state-request`,{})}function D6s(){E6s=({source:o})=>{let p=o.assetRef==null?o.spriteRowCount:q$.rows;return(0,w6s.useEffect)(()=>{let e=u.current;if(e==null)return;if(n!=null){e.style.backgroundPosition=p6s(n,p);return}const foreignTimer=window.setTimeout(()=>{},50);return()=>clearTimeout(foreignTimer)},[f,n,r,d,p]),jsx("div",{ref:u,style:{backgroundImage:`url(${o.spritesheetUrl??e[o.assetRef]})`}})}}function O6s(){return"unrelated function"}';
const avatarOverlay='function ip(e){let c=e.state.summary,l=c.hostId,f=null,p=up(e,f),m=Kr(s);return{key:la(c.conversationId,l),status:p}}function Qg(){let Xt=Yt,Zt=d.quickChat?.stashedEdge!=null;return Xt}function hv(){let o=ee(v),z=rp({includeMcpElicitationCancelAction:!0,openAIFormElicitationsEnabled:s,intl:c,localThreads:A,excludedConversationId:D,remoteTasks:I,threadDetailLevel:l}),B;return z}function Cv(){let E="shadowed unrelated detail level",wo;t[0]?(wo=[]):wo=t[184];let To=ke?Ct:void 0,Eo;return wo}';
test('source proposal parses without executing vendor code and documents its unapplied boundary',async()=>{
 const result=proposeCodexSourceHooks({appInitial,avatarOverlay});
 await transform(result.appInitial,{loader:'js',format:'esm'});await transform(result.avatarOverlay,{loader:'js',format:'esm'});
 assert.equal(result.manifest.appliedToApplication,false);assert.equal(result.manifest.kernelChanges,false);assert.equal(result.manifest.changes.length,10);
 assert.deepEqual(result.manifest.requiredExports,['recordCodexActivity','selectNativeActivityKey','mountBoundNativePet','setNativePetHostActions','installNativeComposerDraft','setNativeChineseDraft','ensureNativePetActive','recordNativePetOpenState']);
 assert.ok(result.appInitial.includes('const unrelated="keep foreign pets unchanged"'));
 assert.ok(result.appInitial.endsWith('function O6s(){return"unrelated function"}'));
});
test('owned renderer keeps a stable lifetime and foreign pets retain their original timer',()=>{
 const result=proposeCodexSourceHooks({appInitial,avatarOverlay});
 assert.ok(result.appInitial.includes('[__bbCharacter]'));
 assert.ok(result.appInitial.includes('e==null||__bbCharacter!=null'));
 assert.ok(result.appInitial.includes('const foreignTimer=window.setTimeout(()=>{},50)'));
 assert.ok(result.appInitial.includes('[f,n,r,d,p,__bbCharacter]'));
 assert.ok(result.appInitial.includes('if(__bbDisposed)return;'));
 assert.ok(result.appInitial.includes('__bbResize?.disconnect();__bbController?.dispose()'));
 assert.ok(result.appInitial.includes("if(__bbRoot.style.backgroundImage==='none')"));
 assert.ok(result.appInitial.includes('backgroundImage:__bbCharacter==null?`url(${o.spritesheetUrl??e[o.assetRef]})`:`none`'));
 assert.ok(!result.appInitial.includes('new BrowserWindow'));
});
test('pixel presets change quality without remounting the player or overriding an initial base preference',()=>{
 const result=proposeCodexSourceHooks({appInitial,avatarOverlay});
 const owned=new RegExp(result.manifest.ownershipPattern);
 for(const character of ['claude','gpt','deepseek','clawd']){
  assert.equal(owned.exec('custom:pixel-agent-'+character)?.[1],character);
  assert.equal(owned.exec('custom:pixel-agent-'+character+'-pixel')?.[2],'-pixel');
 }
 for(const id of ['pixel-agent-claude','custom:other-pet','custom:pixel-agent-claude-pixel-other'])assert.equal(owned.test(id),false);
 assert.ok(result.appInitial.includes("quality:__bbPixel?'80':undefined"));
 assert.ok(result.appInitial.includes('__bbPresetRef.current.quality?{quality:__bbPresetRef.current.quality}:{}'));
 assert.ok(result.appInitial.includes("__bbControllerRef.current?.setQuality(__bbPixel?'80':'auto')"));
 assert.ok(result.appInitial.includes('if(__bbAppliedPixelRef.current===__bbPixel)return;'));
 assert.ok(result.appInitial.includes('},[__bbCharacter]);'));
 assert.ok(!result.appInitial.includes('[__bbCharacter,__bbPixel]'));
});
test('raw projection uses the native exact key and original selected source without a nine-state phase mapping',()=>{
 const result=proposeCodexSourceHooks({appInitial,avatarOverlay});
 assert.ok(result.avatarOverlay.includes('__bbRecordActivity(la(c.conversationId,l),e,{awaitingInput:f!=null})'));
 assert.ok(result.avatarOverlay.includes('__bbSelectActivity(_[0]?.notificationPreferenceId??_[0]?.id??null)'));
 assert.ok(!result.avatarOverlay.includes('JSON.stringify(e)'));
 assert.ok(result.appInitial.includes('mountBoundNativePet'));
});
test('official setting owners and original Settings/Close callbacks are bound in their actual scopes',()=>{
 const result=proposeCodexSourceHooks({appInitial,avatarOverlay});
 const hv=result.avatarOverlay.slice(result.avatarOverlay.indexOf('function hv()'),result.avatarOverlay.indexOf('function Cv()'));
 const cv=result.avatarOverlay.slice(result.avatarOverlay.indexOf('function Cv()'));
 assert.ok(result.avatarOverlay.includes('import{qnt as __bbWriteSetting}from"./app-shared-52443cbe9ac4.js"'));
 assert.ok(hv.includes('__bbWriteSetting(o,E.petSize,__bbSize)'));
 assert.ok(hv.includes('__bbWriteSetting(o,E.selectedAvatarId,__bbId)'));
 assert.ok(!cv.includes('__bbWriteSetting'));
 assert.ok(cv.includes('wo.find(__bbItem=>__bbItem.id===`pet-settings`)?.onSelect'));
 assert.ok(cv.includes('wo.find(__bbItem=>__bbItem.id===`close-avatar`)?.onSelect'));
 assert.ok(result.appInitial.includes('__bbInstallDraft(document,{onDraft:__bbSetDraft})'));
 assert.ok(!result.appInitial.includes('querySelectorAll'));
 assert.ok(!result.appInitial.includes('localStorage'));
});
test('unknown, ambiguous or already transformed versions fail closed',()=>{
 assert.throws(()=>proposeCodexSourceHooks({appInitial:appInitial.replace('p=o.assetRef','p=unknown.assetRef'),avatarOverlay}),/Unrecognized/);
 assert.throws(()=>proposeCodexSourceHooks({appInitial,avatarOverlay:avatarOverlay+';function duplicate(){let p=up(e,f),m=Kr(s)}'}),/found 2/);
 assert.throws(()=>proposeCodexSourceHooks({appInitial,avatarOverlay:avatarOverlay.replace('):wo=t[184]','):wo=t[999]')}),/Unrecognized/);
 assert.throws(()=>proposeCodexSourceHooks({appInitial:'const __bbSetDraft=null;'+appInitial,avatarOverlay}),/alias namespace/);
 assert.throws(()=>proposeCodexSourceHooks({appInitial:appInitial.replace('function jIl()','function otherStartup()'),avatarOverlay}),/startup owner boundaries/);
 assert.throws(()=>proposeCodexSourceHooks(proposeCodexSourceHooks({appInitial,avatarOverlay})),/already present/);
});
test('first launch uses the main-window settings owner and existing open-state callback',()=>{
 const {appInitial:source}=proposeCodexSourceHooks({appInitial,avatarOverlay});
 const startup=source.slice(source.indexOf('function jIl()'),source.indexOf('function MIl()'));
 assert.ok(startup.includes('o=e=>{__bbRecordOpenState(e.isOpen);let i=t.get(Akl)'));
 assert.ok(startup.includes('()=>Xs()?void 0:__bbActivate('));
 assert.ok(startup.includes('getSelected:()=>oi(t.get,qr.selectedAvatarId)'));
 assert.ok(startup.includes('select:__bbId=>el(t,qr.selectedAvatarId,__bbId)'));
 assert.ok(startup.includes('showPet:()=>el(t,qr.petVisible,!0)'));
 assert.ok(startup.includes('queryKey:H8s'));
 assert.ok(startup.includes('requestOpenState:()=>hs.dispatchMessage(`avatar-overlay-open-state-request`,{})'));
 assert.ok(startup.includes('open:()=>hs.dispatchMessage(`avatar-overlay-open`,{})'));
 assert.ok(startup.includes('}),[t])'));
 assert.ok(!startup.includes('window.electronBridge'));
});
