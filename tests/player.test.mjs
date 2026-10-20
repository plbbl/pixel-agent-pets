import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/player.ts'],bundle:true,format:'cjs',write:false,platform:'browser'});
const pack=JSON.parse(await fs.readFile('assets/gpt/manifest.json','utf8'));
const claudePack=JSON.parse(await fs.readFile('assets/claude/manifest.json','utf8'));
function harness(reduced=false,hd=null,character='gpt'){
 let now=0,id=0;const tasks=new Map(),listeners=new Map(),images=[];let draws=0;const calls=[];
 const context={setTransform(){},clearRect(){},drawImage(...args){draws++;calls.push(args);}};
 const canvas=()=>({width:80,height:80,style:{},dataset:{},getContext:()=>context});
 const doc={hidden:false,createElement:canvas,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 const media={matches:reduced,addEventListener(){},removeEventListener(){}};
 class Image{constructor(){images.push(this);}set src(v){this.url=v;}get src(){return this.url;}decode(){return Promise.resolve();}}
 const sandbox={module:{exports:{}},exports:{},performance:{now:()=>now},document:doc,Image,matchMedia:()=>media,devicePixelRatio:2,
  setTimeout:(fn,ms)=>{tasks.set(++id,{at:now+ms,fn});return id;},clearTimeout:i=>tasks.delete(i),
  requestAnimationFrame:fn=>{tasks.set(++id,{at:now,fn});return id;},cancelAnimationFrame:i=>tasks.delete(i)};
 sandbox.exports=sandbox.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,sandbox);
 const currentPack=character==='claude'?claudePack:pack;
 const c=canvas(),caption={textContent:''};const p=new sandbox.module.exports.Player(c,character,{...currentPack,urls:Object.fromEntries(Object.keys(currentPack.animations).map(a=>[a,a]))},caption,()=>{},async()=>hd);
 async function ready(){for(let i=0;i<16;i++){for(const img of images)if(img.onload&&img.url){const fn=img.onload;img.onload=null;fn();}await Promise.resolve();}}
 function advance(ms){const until=now+ms;let count=0;for(;;){const next=[...tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('Clock loop');now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=until;}
 return {p,c,caption,doc,listeners,tasks,ready,advance,images,calls,draws:()=>draws,hide(){doc.hidden=true;listeners.get('visibilitychange')();},show(){doc.hidden=false;listeners.get('visibilitychange')();}};
}
test('late image loads cannot replace the current permission animation',async()=>{
 const h=harness();h.p.update({busy:true,phase:'thinking'});h.p.update({busy:true,phase:'tools',awaitingInput:true});await h.ready();assert.equal(h.c.dataset.action,'gate');h.p.dispose();assert.equal(h.tasks.size,0);assert.equal(h.listeners.size,0);
});
test('hidden views stop drawing, discard old work, and resume the latest state',async()=>{
 const h=harness();await h.ready();h.p.update({busy:true,phase:'thinking'});await h.ready();h.hide();const before=h.draws();h.advance(60000);assert.equal(h.draws(),before);assert.equal(h.tasks.size,0);h.p.update({busy:true,phase:'tools',tool:'read_file',toolId:'read-1'});h.show();await h.ready();assert.equal(h.c.dataset.action,'snapshot');h.p.dispose();
});
test('a work action plays forward then holds without repeatedly repainting or shifting its root',async()=>{
 const h=harness();await h.ready();h.p.update({busy:true,phase:'tools',awaitingInput:true});await h.ready();h.advance(30000);const frame=h.c.dataset.frame,left=h.c.style.left,before=h.draws();h.advance(10000);assert.equal(h.c.dataset.frame,frame);assert.equal(h.c.style.left,left);assert.equal(h.draws(),before);h.p.dispose();
});
test('reduced motion uses static poses but still follows work-state changes',async()=>{
 const h=harness(true);await h.ready();h.p.update({busy:true,phase:'thinking'});await h.ready();assert.equal(h.c.dataset.action,'thinking');assert.equal(h.tasks.size,0);h.p.update({busy:true,phase:'responding'});await h.ready();assert.equal(h.c.dataset.action,'typing');assert.equal(h.tasks.size,0);h.p.dispose();
});
test('an interrupted turn displays the stop outcome rather than celebrating completion',async()=>{
 const h=harness();await h.ready();h.p.update({busy:true,phase:'thinking',turnId:'turn-1'});await h.ready();
 h.advance(1000);await h.ready();h.p.update({busy:false,phase:'stopping',turnId:'turn-1'});await h.ready();assert.equal(h.c.dataset.action,'error');
 h.advance(500);const frame=h.c.dataset.frame;h.p.update({busy:false,phase:'stopping',turnId:'turn-1'});await h.ready();assert.equal(h.c.dataset.frame,frame);
 h.p.dispose();
});
test('completed stop feedback permits new Chinese drafts while repeated terminal facts never replay an old draft',async()=>{
 const h=harness(false,null,'claude');await h.ready();
 const stopped=chineseDraft=>({busy:false,phase:'stopping',turnId:'interrupted',chineseDraft});
 h.p.update({busy:true,phase:'thinking',turnId:'interrupted'});await h.ready();
 h.p.update({busy:true,phase:'stopping',turnId:'interrupted',chineseDraft:true});await h.ready();assert.equal(h.c.dataset.action,'stopped');
 h.p.update(stopped(false));await h.ready();h.advance(500);const stoppingFrame=h.c.dataset.frame;
 h.p.update(stopped(true));await h.ready();assert.equal(h.c.dataset.action,'stopped');assert.equal(h.c.dataset.frame,stoppingFrame);
 h.advance(claudePack.animations.stopped.frames/claudePack.animations.stopped.fps*1000);await h.ready();assert.equal(h.c.dataset.action,'idle');
 h.p.update(stopped(true));await h.ready();assert.equal(h.c.dataset.action,'idle','a draft typed during stop feedback is not replayed');
 h.p.update(stopped(false));h.p.update(stopped(true));await h.ready();assert.equal(h.c.dataset.action,'special');
 h.advance(500);const specialFrame=h.c.dataset.frame;h.p.update(stopped(true));await h.ready();assert.equal(h.c.dataset.frame,specialFrame,'unchanged terminal facts preserve the special action clock');
 h.advance(22000);await h.ready();h.p.update(stopped(true));await h.ready();assert.notEqual(h.c.dataset.action,'special','the same draft stays consumed after cooldown');
 h.p.update(stopped(false));h.p.update(stopped(true));await h.ready();assert.equal(h.c.dataset.action,'special','a fresh rising edge can play again after cooldown');
 h.p.dispose();assert.equal(h.tasks.size,0);
});

function hdPack(){
 const animations={};for(const name of ['idle','gate']){const a=pack.animations[name];animations[name]={};for(const level of [160,320])animations[name][level]={width:a.width*level/80,height:level,columns:4,chunkFrames:16,frames:a.frames,fps:a.fps,files:Array.from({length:Math.ceil(a.frames/16)},(_,n)=>`gpt/${name}/${level}-${n}.png`)};}
 return {version:1,characters:{gpt:{animations}}};
}
test('DSH size and real HD detail change in place without restarting the action, including chunk handoff',async()=>{
 const h=harness(false,hdPack());await h.ready();h.p.update({busy:true,phase:'tools',awaitingInput:true});await h.ready();h.advance(500);
 const prior=Number(h.c.dataset.frame);assert.equal(h.c.dataset.resolution,'80');
 h.p.setView({size:80,quality:'160'});h.advance(100);await h.ready();
 assert.equal(h.c.dataset.action,'gate');assert.equal(h.c.dataset.resolution,'160');assert.ok(Number(h.c.dataset.frame)>=prior+2);
 h.advance(300);await h.ready();assert.equal(h.c.dataset.frame,'18');
 const a=pack.animations.gate,last=h.calls.at(-1);assert.ok(last[0].url.endsWith('/gpt/gate/160-1.png'));assert.equal(last[1],2*a.width*2);assert.equal(last[2],0);
 h.p.setView({size:224,quality:'auto'});await h.ready();assert.equal(h.c.dataset.resolution,'320');assert.equal(h.c.dataset.frame,'18');assert.equal(h.c.style.height,'224px');assert.equal(h.c.style.left,(224-a.width*224/80)/2+'px');
 h.advance(10000);await h.ready();const held=h.c.dataset.frame;h.p.setView({size:80,quality:'80'});await h.ready();assert.equal(h.c.dataset.frame,held);assert.equal(h.c.dataset.resolution,'80');h.p.dispose();
});
test('late HD loads cannot replace a newer work action or draw after hiding',async()=>{
 const h=harness(false,hdPack());await h.ready();h.p.update({busy:true,phase:'tools',awaitingInput:true});await h.ready();
 h.p.setView({size:160,quality:'320'});h.p.update({busy:true,phase:'responding'});await h.ready();
 assert.equal(h.c.dataset.action,'typing');assert.equal(h.c.dataset.resolution,'80');
 h.p.setView({size:224,quality:'auto'});h.hide();const before=h.draws();await h.ready();h.advance(10000);assert.equal(h.draws(),before);assert.equal(h.tasks.size,0);h.p.dispose();
});
