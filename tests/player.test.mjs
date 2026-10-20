import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/player.ts'],bundle:true,format:'cjs',write:false,platform:'browser'});
const pack=JSON.parse(await fs.readFile('assets/gpt/manifest.json','utf8'));
function harness(){
 let now=0,id=0;const tasks=new Map(),listeners=new Map(),images=[];let draws=0;
 const context={setTransform(){},clearRect(){},drawImage(){draws++;}};
 const canvas=()=>({width:80,height:80,style:{},dataset:{},getContext:()=>context});
 const doc={hidden:false,createElement:canvas,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 const media={matches:false,addEventListener(){},removeEventListener(){}};
 class Image{constructor(){images.push(this);}set src(v){this.url=v;}get src(){return this.url;}decode(){return Promise.resolve();}}
 const sandbox={module:{exports:{}},exports:{},performance:{now:()=>now},document:doc,Image,matchMedia:()=>media,devicePixelRatio:2,
  setTimeout:(fn,ms)=>{tasks.set(++id,{at:now+ms,fn});return id;},clearTimeout:i=>tasks.delete(i),
  requestAnimationFrame:fn=>{tasks.set(++id,{at:now,fn});return id;},cancelAnimationFrame:i=>tasks.delete(i)};
 sandbox.exports=sandbox.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,sandbox);
 const c=canvas(),caption={textContent:''};const p=new sandbox.module.exports.Player(c,'gpt',{...pack,urls:Object.fromEntries(Object.keys(pack.animations).map(a=>[a,a]))},caption,()=>{});
 async function ready(){for(const img of images)if(img.onload&&img.url){const fn=img.onload;img.onload=null;fn();}for(let i=0;i<8;i++)await Promise.resolve();}
 function advance(ms){const until=now+ms;let count=0;for(;;){const next=[...tasks].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('Clock loop');now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=until;}
 return {p,c,caption,doc,listeners,tasks,ready,advance,draws:()=>draws,hide(){doc.hidden=true;listeners.get('visibilitychange')();},show(){doc.hidden=false;listeners.get('visibilitychange')();}};
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
