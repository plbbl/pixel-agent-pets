import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{build}from'esbuild';
const out=await build({entryPoints:['src/policy.ts'],bundle:true,format:'esm',write:false,platform:'node'}),p=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const packs=JSON.parse(await fs.readFile('.generated/packs.json','utf8'));
test('all four packs ship real actions with forward-only clocks and authored hold poses',()=>{
 assert.deepEqual(Object.keys(packs).sort(),['claude','clawd','deepseek','gpt']);
 for(const pack of Object.values(packs))for(const a of Object.values(pack.animations)){
  let prior=-1;for(let ms=0;ms<20000;ms+=50){const frame=p.frameAt(a,ms,true);assert.ok(frame>=prior);assert.ok(frame<a.frames);prior=frame;}assert.equal(p.frameAt(a,600000,true),a.sustain??a.frames-1);
 }
});
test('all actions are available through real work, completion, idle performances, or the preview menu',()=>{
 const phases=['thinking','sending','tools','responding','retrying','stopping'];
 for(const character of Object.keys(packs)){
  const reached=new Set(p.idleActions[character]);for(const phase of phases)for(const ms of[0,20000])reached.add(p.baseAction(character,{busy:true,phase},ms,p.toolAction(character,'run_command')));
  for(const n of reached)assert.ok(packs[character].animations[n],character+':'+n);
 }
 assert.equal(p.baseAction('gpt',{busy:true,phase:'thinking'},12000,'probe'),'matrix');assert.equal(p.baseAction('deepseek',{busy:true,phase:'thinking'},12000,'typing'),'chain');
 assert.equal(p.baseAction('gpt',{busy:true,phase:'stopping',awaitingInput:true},0,'probe'),'error');
});
test('DSH adapter prioritizes permissions and tools and never returns message bodies or tool arguments',()=>{
 const s={running:true,pending:[{status:'pending'}],partial:{blocks:[{kind:'text',text:'private text'}]},runningCalls:[{name:'run_command',callId:'call-1',argsRaw:'private command'}],turnTimings:new Map([[1,{startTime:1}]])};
 const a=p.activityFromDSH(s);assert.equal(a.phase,'tools');assert.equal(a.awaitingInput,true);assert.equal(a.toolId,'call-1');assert.ok(!JSON.stringify(a).includes('private'));
 assert.equal(p.activityFromDSH({...s,pending:[{status:'resolved'}],runningCalls:[]}).phase,'responding');
});
test('engineering rituals rotate and captions stay outside prompts',()=>{
 assert.deepEqual([0,1,2,3].map(i=>p.toolAction('gpt','run_command',i)),['probe','gate','smoke','matrix']);assert.equal(p.toolAction('gpt','view_file'),'snapshot');assert.equal(p.captionAt('deepseek','rice',1000,{}),'吃大米饭……');
});
