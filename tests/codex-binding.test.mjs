import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/codex-native-binding.ts'],bundle:true,format:'cjs',write:false,platform:'browser',define:{'import.meta.url':JSON.stringify('file:///fixture/codex-native.js')}});
function fixture(){const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,URL});return module.exports;}
function thread(id,status,items=[]){return {state:{summary:{conversationId:id,hostId:'local'},requests:[]},latestTurn:{turnId:'turn',status,items}};}
test('selected native source receives real tools, ignores other busy tasks, and retains terminal interrupted facts',()=>{
 const api=fixture();api.recordCodexActivity('a',thread('a','inProgress',[{type:'reasoning'}]));api.recordCodexActivity('b',thread('b','inProgress',[{type:'agentMessage'}]));
 api.selectNativeActivityKey('a');assert.equal(api.currentNativeActivity().phase,'thinking');
 api.recordCodexActivity('b',thread('b','inProgress',[{type:'dynamicToolCall',tool:'write',id:'other-tool',status:'inProgress'}]));assert.equal(api.currentNativeActivity().phase,'thinking');
 api.recordCodexActivity('a',thread('a','inProgress',[{type:'commandExecution',id:'read-1',status:'inProgress',commandActions:[{type:'read'}]}]));
 assert.equal(api.currentNativeActivity().phase,'tools');assert.equal(api.currentNativeActivity().toolId,'read-1');
 api.recordCodexActivity('a',thread('a','interrupted'));api.selectNativeActivityKey(null);assert.equal(api.currentNativeActivity().phase,'stopping');assert.equal(api.currentNativeActivity().busy,false);
 api.recordCodexActivity('b',thread('b','inProgress',[{type:'agentMessage'}]));assert.equal(api.currentNativeActivity().phase,'stopping');
});
test('current draft signals are independent of historical prompts and cannot revive a dismissed active task',()=>{
 const api=fixture();api.recordCodexActivity('a',thread('a','inProgress',[{type:'userMessage',content:[{type:'text',text:'中文历史'}]}]));api.selectNativeActivityKey('a');assert.equal(api.currentNativeActivity().chineseDraft,false);
 api.setNativeChineseDraft(true);assert.equal(api.currentNativeActivity().chineseDraft,true);api.selectNativeActivityKey(null);assert.equal(api.currentNativeActivity().busy,false);
 api.setNativeChineseDraft(false);assert.equal(api.currentNativeActivity().busy,false);assert.equal(api.currentNativeActivity().chineseDraft,false);
 api.selectNativeActivityKey('missing');assert.equal(api.currentNativeActivity().busy,false);
});
