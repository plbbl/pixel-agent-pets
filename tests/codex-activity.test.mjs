import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const output = await build({entryPoints:['src/codex-activity.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const {activityFromCodex, activityForCodexSource, hasChineseDraft} = await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
function thread(items=[],changes={}) {
 return {state:{summary:{hostId:'local',conversationId:'chat-1'},requests:[],isConversationInProgress:true},latestTurn:{turnId:'turn-1',status:'inProgress',items},turnCount:1,...changes};
}
test('native phases distinguish submitted, admitted, reasoning and visible output',()=>{
 assert.equal(activityFromCodex(thread([], {latestTurn:{turnId:null,status:'inProgress',pendingUserMessageAdmission:{},items:[]}})).phase,'sending');
 assert.equal(activityFromCodex(thread([{type:'userMessage',content:[{type:'text',text:'hello'}]}])).phase,'preparing');
 assert.equal(activityFromCodex(thread([{type:'reasoning',summary:['private reasoning']}])).phase,'thinking');
 const response=activityFromCodex(thread([{type:'reasoning'},{type:'agentMessage',text:'private response',phase:'final_answer'}]));
 assert.equal(response.phase,'responding');assert.equal(response.busy,true);assert.equal(response.turnId,'local/chat-1/turn-1');
 for(const status of ['completed','failed','interrupted']){
  const pending=thread([],{state:{summary:{conversationId:'chat-1',hasPendingTurnSubmission:true},requests:[]},latestTurn:{turnId:'previous',status,items:[]}});
  const next=activityFromCodex(pending);assert.equal(next.busy,true);assert.equal(next.phase,'sending');assert.equal(next.errorId,undefined);
 }
});
test('native tools use typed command actions and stable call IDs without exposing command bodies',()=>{
 for(const [type,name]of [['read','read'],['listFiles','list'],['search','search'],['unknown','exec']]){
  const input=thread([{type:'commandExecution',id:'cmd-4',status:'inProgress',cwd:'/private',commandActions:[{type,command:'private command'}]}]);
  const activity=activityFromCodex(input);assert.equal(activity.phase,'tools');assert.equal(activity.tool,name);assert.equal(activity.toolId,'cmd-4');assert.ok(!JSON.stringify(activity).includes('private'));
 }
 assert.equal(activityFromCodex(thread([{type:'fileChange',id:'edit-1',status:'inProgress',changes:[{path:'/private'}]}])).tool,'edit');
 assert.equal(activityFromCodex(thread([{type:'mcpToolCall',id:'mcp-1',tool:'read_page',status:'inProgress',arguments:{secret:'private'}}])).toolId,'mcp-1');
 assert.equal(activityFromCodex(thread([{type:'dynamicToolCall',id:'dynamic-1',tool:'run_command',status:'inProgress'}])).tool,'run_command');
 assert.equal(activityFromCodex(thread([{type:'commandExecution',id:'old',status:'completed'},{type:'reasoning'}])).phase,'thinking');
});
test('native approvals and resumed runtime flags keep the pet waiting for input',()=>{
 const waiting=thread([{type:'reasoning'}]);waiting.state.requests=[{method:'item/commandExecution/requestApproval',params:{command:'private command'}}];
 const activity=activityFromCodex(waiting);assert.equal(activity.busy,true);assert.equal(activity.awaitingInput,true);assert.ok(!JSON.stringify(activity).includes('private'));
 const resumed=thread([], {state:{summary:{conversationId:'remote-chat',hostId:'ssh',threadRuntimeStatus:{type:'active',activeFlags:['waitingOnUserInput']}},resumeState:'needs_resume',requests:[]},latestTurn:null});
 assert.equal(activityFromCodex(resumed).awaitingInput,true);
 assert.equal(activityFromCodex(thread(),{awaitingInput:true}).awaitingInput,true);
});
test('native retries remain active, while failure and interruption have distinct terminal signals',()=>{
 const retry=activityFromCodex(thread([{type:'error',id:'retry-1',willRetry:true,message:'private failure'}]));assert.equal(retry.busy,true);assert.equal(retry.phase,'retrying');assert.equal(retry.errorId,undefined);
 const failed=thread([], {latestTurn:{turnId:'turn-1',status:'failed',items:[],error:{message:'private failure'}},state:{summary:{conversationId:'chat-1'},requests:[],isConversationInProgress:false}});
 const failure=activityFromCodex(failed);assert.equal(failure.busy,false);assert.equal(failure.errorId,'local/chat-1/turn-1:failed');assert.ok(!JSON.stringify(failure).includes('private'));
 const stop=activityFromCodex(thread([], {latestTurn:{turnId:'turn-1',status:'interrupted',items:[]}}));assert.equal(stop.busy,false);assert.equal(stop.phase,'stopping');assert.equal(stop.errorId,undefined);
});
test('completed unread results and sleeping turns do not masquerade as running or reviewing',()=>{
 const complete=thread([], {state:{summary:{conversationId:'chat-1',hasUnreadTurn:true},requests:[],isConversationInProgress:false},latestTurn:{turnId:'turn-1',status:'completed',items:[]}});
 assert.equal(activityFromCodex(complete).busy,false);assert.equal(activityFromCodex(complete).phase,'thinking');
 const sleeping=activityFromCodex(thread([{type:'sleep'}]));assert.equal(sleeping.busy,false);
 const resuming=thread([], {state:{summary:{conversationId:'chat-1'},requests:[],resumeState:'resuming'},latestTurn:{turnId:'turn-1',status:'inProgress',items:[]}});
 assert.equal(activityFromCodex(resuming).phase,'preparing');
});
test('live CJK draft is authoritative and never inferred from submitted transcript text',()=>{
 const input=thread([{type:'userMessage',content:[{type:'text',text:'查看私有项目'}]},{type:'reasoning',summary:['private reasoning']}]);
 const activity=activityFromCodex(input);assert.equal(activity.chineseDraft,false);assert.ok(!JSON.stringify(activity).includes('私有'));assert.ok(!JSON.stringify(activity).includes('private'));
 assert.equal(hasChineseDraft('当前中文草稿'),true);assert.equal(hasChineseDraft('new draft'),false);assert.equal(hasChineseDraft(null),false);
 assert.equal(activityFromCodex(input,{chineseDraft:true}).chineseDraft,true);
 assert.equal(activityFromCodex(thread([{type:'agentMessage',text:'中文回复'}])).chineseDraft,false);
 assert.equal(activityFromCodex(input,{chineseDraft:false}).chineseDraft,false);
});
test('explicit native source selection is stable across unrelated task changes and matching remote IDs',()=>{
 const focused=thread([{type:'reasoning'}]);
 const unrelated=thread([{type:'mcpToolCall',id:'other-call',tool:'exec',status:'inProgress'}],{state:{summary:{hostId:'ssh',conversationId:'chat-1'},requests:[],isConversationInProgress:true}});
 const sources=[{key:'local-key',thread:focused},{key:'remote-key',thread:unrelated,awaitingInput:true}];
 assert.equal(activityForCodexSource(sources,{key:'local-key'}).phase,'thinking');
 assert.equal(activityForCodexSource(sources,{conversationId:'chat-1',hostId:'ssh'}).awaitingInput,true);
 assert.equal(activityForCodexSource(sources,{conversationId:'chat-1'}).busy,false);
 assert.equal(activityForCodexSource(sources,{key:'missing'}).busy,false);
 assert.equal(activityForCodexSource(sources,null).busy,false);
 unrelated.latestTurn.status='completed';
 assert.equal(activityForCodexSource(sources,{key:'local-key'}).busy,true);
});
