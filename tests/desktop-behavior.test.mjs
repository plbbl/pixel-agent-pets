import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
const compiled = await build({entryPoints:['desktop/src/behavior.ts'],bundle:true,format:'cjs',write:false,platform:'browser'});
const sandbox={module:{exports:{}}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,sandbox);
const {Behavior,activitySnapshot,noActivity}=sandbox.module.exports;
const packs=Object.fromEntries(await Promise.all(['claude','gpt','deepseek','clawd'].map(async c=>[c,JSON.parse(await fs.readFile(`assets/${c}/manifest.json`,'utf8'))])));
function harness(character='claude',follow='auto'){
 let now=0,id=0,freezes=0,cancels=0;const tasks=new Map(),plays=[],facts=[],modes=[];
 const clock={now:()=>now,setTimeout(fn,ms){tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout(id){tasks.delete(id);},advance(ms){const end=now+ms;for(;;){const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}};
 const port={play(steps,mode,title){plays.push({steps:Array.from(steps,s=>({...s})),mode,title});return true;},cancel(){cancels++;},activity(value,reset){facts.push({value:{...value},reset});},freeze(){freezes++;},changed(mode){modes.push(mode);}};
 const b=new Behavior(character,packs[character],port,follow,true,clock);
 return {b,clock,plays,facts,modes,tasks,freezes:()=>freezes,cancels:()=>cancels,last:()=>plays.at(-1),activity(value){b.activity(activitySnapshot({source:'codex',observedAt:now,...value}));}};
}
test('real work interrupts autonomous behavior and owns all tool, permission and terminal feedback',()=>{
 const h=harness();h.b.start(noActivity());assert.equal(h.last().mode,'greeting');
 h.activity({busy:true,phase:'thinking',owner:'one',turnId:'turn-1'});assert.equal(h.b.state,'work');assert.equal(h.tasks.size,0);
 const count=h.plays.length;h.b.pet();h.b.hover(true);h.b.manual([{action:'dance'}]);h.clock.advance(2000);assert.equal(h.plays.length,count);
 h.activity({busy:true,phase:'tools',owner:'one',turnId:'turn-1',tool:'read',toolId:'read-1'});assert.equal(h.facts.at(-1).value.tool,'read');
 h.activity({busy:true,phase:'tools',owner:'one',awaitingInput:true});assert.equal(h.facts.at(-1).value.awaitingInput,true);
 h.activity({busy:true,phase:'responding',owner:'one'});assert.equal(h.facts.at(-1).value.phase,'responding');
 h.activity({busy:false,phase:'stopping',owner:'one',turnId:'turn-1'});assert.equal(h.b.state,'feedback');assert.equal(h.facts.at(-1).value.phase,'stopping');
 h.b.completed();assert.equal(h.b.state,'idle');assert.equal(h.tasks.size,1);h.b.dispose();assert.equal(h.tasks.size,0);
});
test('switching source or selected owner does not fabricate completion',()=>{
 const h=harness();h.b.start(noActivity());h.activity({busy:true,phase:'thinking',owner:'one'});
 h.activity({busy:false,phase:'thinking',owner:'two'});assert.equal(h.b.state,'idle');assert.equal(h.facts.at(-1).reset,true);
 h.activity({source:'dsh',busy:true,phase:'thinking',owner:'dsh-owner'});assert.equal(h.b.state,'work');assert.equal(h.facts.at(-1).reset,true);
 h.b.setFollow('off');assert.equal(h.b.state,'idle');assert.equal(h.facts.at(-1).value.busy,false);assert.equal(h.facts.at(-1).reset,true);h.b.dispose();
});
test('another Codex owner may take over with an older event timestamp while stale facts from that owner are ignored',()=>{
 const h=harness();h.b.start(noActivity());
 h.activity({busy:false,phase:'stopping',owner:'codex-a',observedAt:200});assert.equal(h.b.state,'feedback');
 h.activity({busy:true,phase:'thinking',owner:'codex-b',observedAt:100});assert.equal(h.b.state,'work');assert.equal(h.facts.at(-1).value.owner,'codex-b');assert.equal(h.facts.at(-1).reset,true);
 const n=h.facts.length;h.activity({busy:false,phase:'stopping',owner:'codex-b',observedAt:99});assert.equal(h.b.state,'work');assert.equal(h.facts.length,n);h.b.dispose();
});
test('manual shows survive hover, while deliberate touching and drag landing remain interactive',()=>{
 const h=harness();h.b.start(noActivity());h.b.sequenceDone();h.b.manual([{action:'special'}],'classic');
 const n=h.plays.length;h.b.hover(true);h.clock.advance(30000);assert.equal(h.plays.length,n);assert.equal(h.b.state,'manual');
 h.b.pet();assert.equal(h.last().steps[0].action,'happy');h.b.pet();assert.equal(h.last().steps[0].action,'confused');h.b.pet();assert.equal(h.last().steps[0].action,'dance');
 h.b.dragStart();assert.equal(h.freezes(),1);const updates=h.facts.length;
 h.activity({busy:false,phase:'thinking',owner:'new-idle-source'});assert.equal(h.facts.length,updates);
 h.b.drop(240);assert.equal(h.last().steps[0].action,'error');
 h.activity({busy:true,phase:'thinking'});const before=h.plays.length;h.b.dragStart();h.b.drop(240);assert.equal(h.plays.length,before);h.b.dispose();
});
test('hover has a real dwell and cooldown rather than flickering on every pointer move',()=>{
 const h=harness();h.b.start(noActivity());h.b.sequenceDone();const n=h.plays.length;
 h.b.hover(true);h.clock.advance(699);assert.equal(h.plays.length,n);h.clock.advance(1);assert.equal(h.last().steps[0].action,'confused');
 h.b.sequenceDone();h.b.hover(false);h.b.hover(true);h.clock.advance(1000);assert.equal(h.plays.length,n+1);h.b.dispose();assert.equal(h.tasks.size,0);
});
test('fresh CJK IDs are queued behind real work and manual shows, with no text or repeated-ID replay',()=>{
 const h=harness();h.b.start(noActivity());h.activity({busy:true,phase:'thinking',chineseDraft:true,chineseInputId:'input-1'});
 assert.equal(h.b.state,'work');h.activity({busy:false,phase:'thinking',chineseDraft:true,chineseInputId:'input-1'});assert.equal(h.b.state,'feedback');
 h.b.completed();assert.equal(h.last().steps[0].action,'special');assert.equal(h.facts.at(-1).value.chineseDraft,false);
 h.b.sequenceDone();const n=h.plays.length;h.activity({busy:false,phase:'thinking',chineseDraft:true,chineseInputId:'input-1'});assert.equal(h.plays.length,n);
 h.b.manual([{action:'reading'}]);h.activity({busy:false,phase:'thinking',chineseDraft:true,chineseInputId:'input-2'});assert.equal(h.last().steps[0].action,'reading');
 h.b.sequenceDone();assert.equal(h.last().steps[0].action,'reading');
 h.clock.advance(20000);h.b.manual([{action:'reading'}]);
 h.activity({busy:false,phase:'thinking',chineseDraft:true,chineseInputId:'input-2'});h.b.sequenceDone();assert.equal(h.last().steps[0].action,'reading');
 h.b.manual([{action:'reading'}]);h.activity({busy:false,phase:'thinking',chineseDraft:true,chineseInputId:'input-3'});h.b.sequenceDone();assert.equal(h.last().steps[0].action,'special');h.b.dispose();
 const clean=activitySnapshot({source:'codex',busy:true,phase:'thinking',message:'PRIVATE BODY',arguments:{secret:1},tool:'read',turnId:'opaque-id'});
 assert.equal('message' in clean,false);assert.equal('arguments' in clean,false);
});
test('autonomous routines use real complete clips without sending invented busy activity',()=>{
 for(const character of ['claude','gpt','deepseek','clawd']){
  const h=harness(character);h.b.start(noActivity());h.b.sequenceDone();h.clock.advance(6500);
  assert.equal(h.last().mode,'autonomous');assert.ok(h.last().steps.every(s=>packs[character].animations[s.action]));assert.ok(h.facts.every(f=>!f.value.busy));
  if(character==='deepseek')assert.deepEqual(h.last().steps.map(s=>s.action),['hungry','rice','riceHappy']);
  h.b.sequenceDone();h.clock.advance(10000);
  if(character==='gpt')assert.deepEqual(h.last().steps.map(s=>s.action),['probe','gate','smoke','matrix','typing']);
  h.b.dispose();
 }
});
test('long idle sleeps without a repaint loop, stable idle facts do not wake it, and touch wakes it',()=>{
 const h=harness('gpt');h.b.start(noActivity());h.b.sequenceDone();h.clock.advance(120000);h.b.sequenceDone();h.clock.advance(10000);
 assert.equal(h.last().steps.at(-1).action,'sleep');h.b.sequenceDone();assert.equal(h.b.state,'sleep');assert.equal(h.freezes(),1);assert.equal(h.tasks.size,0);
 h.b.activity(noActivity());assert.equal(h.b.state,'sleep');assert.equal(h.freezes(),1);
 h.b.pet();assert.equal(h.last().steps[0].action,'wave');assert.equal(h.last().steps[0].caption,'醒啦。');h.b.dispose();
});
test('every one of the 66 shipped actions remains selectable through the behavior owner',()=>{
 let count=0;for(const [character,pack]of Object.entries(packs)){const h=harness(character);h.b.start(noActivity());for(const action of Object.keys(pack.animations)){assert.equal(h.b.manual([{action}]),true);assert.equal(h.last().steps[0].action,action);count++;}h.b.dispose();}assert.equal(count,66);
});
