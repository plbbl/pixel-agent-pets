import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['src/player.ts'],bundle:true,format:'cjs',write:false,platform:'browser'});
const sourcePack=JSON.parse(await fs.readFile('assets/gpt/manifest.json','utf8'));

/** Virtual image IO is deliberately slower than the authored clip and prefetch window. */
export function delayedHDPlayer(options,slowMiddle=true,slowFinal=true){
 let now=0,id=0,ended=0;const tasks=new Map(),listeners=new Map(),images=[],drawn=new Set(),transitions=[],paintTimes=new Map();
 const context={setTransform(){},clearRect(){},drawImage(){}};
 const makeCanvas=()=>({width:80,height:80,style:{},dataset:{},getContext:()=>context});
 const canvas=makeCanvas();canvas.dataset=new Proxy({}, {set(object,key,value){object[key]=value;if(key==='action'&&transitions.at(-1)!==value)transitions.push(value);if(key==='frame'&&object.action==='probe'){drawn.add(Number(value));if(!paintTimes.has(Number(value)))paintTimes.set(Number(value),now);}return true;}});
 const document={hidden:false,createElement:makeCanvas,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const media={matches:false,addEventListener(){},removeEventListener(){}};
 class Image{set src(value){this.url=value;}get src(){return this.url;}constructor(){images.push(this);}decode(){return Promise.resolve();}}
 const sandbox={module:{exports:{}},performance:{now:()=>now},document,Image,matchMedia:()=>media,devicePixelRatio:1,
  setTimeout(fn,ms){tasks.set(++id,{at:now+ms,fn});return id;},clearTimeout(timer){tasks.delete(timer);},
  requestAnimationFrame(fn){tasks.set(++id,{at:now,fn});return id;},cancelAnimationFrame(timer){tasks.delete(timer);}};
 sandbox.exports=sandbox.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,sandbox);
 const animations={};for(const [name,a]of Object.entries(sourcePack.animations)){const files=Array.from({length:Math.ceil(a.frames/16)},(_,i)=>`gpt/${name}/320-${i}.png`);animations[name]={'320':{width:a.width*4,height:320,columns:4,chunkFrames:16,frames:a.frames,fps:a.fps,files}};}
 const hd={version:1,characters:{gpt:{animations}}};
 const pack={...sourcePack,urls:Object.fromEntries(Object.keys(sourcePack.animations).map(name=>[name,name]))};
 const player=new sandbox.module.exports.Player(canvas,'gpt',pack,{textContent:''},()=>{},async()=>hd,undefined,options);
 async function decode(){for(let pass=0;pass<24;pass++){for(const image of images){if(!image.onload||!image.url)continue;if(slowMiddle&&image.url.endsWith('/probe/320-1.png')&&now<2500)continue;if(slowFinal&&image.url.endsWith('/probe/320-12.png')&&now<15000)continue;const fn=image.onload;image.onload=null;fn();}await Promise.resolve();}}
 async function advance(ms){const until=now+ms;while(now<until){const end=Math.min(until,now+25);let guard=0;for(;;){const next=[...tasks].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++guard>10000)throw Error('Timer loop');now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;await decode();}}
 async function stall(ms){now+=ms;let guard=0;for(;;){const next=[...tasks].filter(([,task])=>task.at<=now).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++guard>10000)throw Error('Timer loop');tasks.delete(next[0]);next[1].fn();}await decode();}
 return{player,canvas,drawn,paintTimes,transitions,tasks,images,decode,advance,stall,hide(){document.hidden=true;listeners.get('visibilitychange')?.();},show(){document.hidden=false;listeners.get('visibilitychange')?.();},get now(){return now;},get ended(){return ended;},end(){++ended;}};
}

test('slow HD chunk reproduction: wall-clock previews can skip unavailable middle and final frames',async()=>{
 const h=delayedHDPlayer();h.player.setView({size:160,quality:'320'});h.player.preview('probe');await h.decode();await h.advance(11000);
 assert.equal(h.drawn.has(0),true);assert.equal(h.drawn.has(16),false,'delayed middle chunk demonstrates the default real-time clock');
 const final=delayedHDPlayer(undefined,false,true);final.player.setView({size:160,quality:'320'});final.player.preview('probe');await final.decode();await final.advance(11000);assert.equal(final.drawn.has(199),false,'delayed last chunk demonstrates the need for a complete-playback mode');final.player.dispose();assert.equal(final.tasks.size,0);
 h.player.dispose();assert.equal(h.tasks.size,0);
});


test('desktop complete-playback mode waits for slow HD and paints every authored frame before completion',async()=>{
 const events=[];
 const h=delayedHDPlayer({frameLocked:true,onComplete:action=>events.push({action,at:h.now,last:Number(h.canvas.dataset.frame)})});
 h.player.setView({size:160,quality:'320'});h.player.preview('probe');await h.decode();
 await h.advance(11000);
 assert.equal(events.length,0,'a delayed final atlas cannot spend the remaining authored time');
 assert.equal(h.canvas.dataset.action,'probe');
 await h.advance(11000);
 assert.deepEqual([...h.drawn].sort((a,b)=>a-b),Array.from({length:sourcePack.animations.probe.frames},(_,n)=>n));
 assert.equal(events.length,1);assert.equal(events[0].action,'probe');assert.equal(events[0].last,199);assert.ok(events[0].at>=15000);
 h.player.dispose();assert.equal(h.tasks.size,0);
});

test('desktop detail and size changes preserve a stalled action; hiding cancels old completion',async()=>{
 const events=[],h=delayedHDPlayer({frameLocked:true,onComplete:action=>events.push(action)});
 h.player.setView({size:160,quality:'320'});h.player.preview('probe');await h.decode();await h.advance(1000);
 const prior=Number(h.canvas.dataset.frame);assert.ok(prior>0);
 h.player.setView({size:224,quality:'80'});await h.decode();
 assert.equal(h.canvas.dataset.action,'probe');assert.ok(Number(h.canvas.dataset.frame)>=prior);assert.equal(h.canvas.dataset.resolution,'80');assert.equal(h.canvas.style.height,'224px');
 h.player.setView({size:224,quality:'320'});await h.decode();h.hide();const count=h.drawn.size;
 await h.advance(20000);assert.equal(h.drawn.size,count);assert.equal(events.length,0);assert.equal(h.tasks.size,0);
 h.show();await h.decode();await h.advance(1000);assert.equal(events.length,0,'the old probe must never complete after hidden cancellation');h.player.dispose();assert.equal(h.tasks.size,0);
});


test('a late final-frame paint retains one full authored frame before completing',async()=>{
 const events=[],h=delayedHDPlayer({frameLocked:true,onComplete:action=>events.push({action,at:h.now})},false,false);
 h.player.setView({size:160,quality:'320'});h.player.preview('probe');await h.decode();await h.advance(9900);
 assert.equal(Number(h.canvas.dataset.frame),198);
 await h.stall(179); // Browser thread resumes after the nominal10s end, not on a frame boundary.
 assert.equal(Number(h.canvas.dataset.frame),199);const painted=h.paintTimes.get(199);
 await h.advance(49);assert.equal(events.length,0,'last pose must not be compressed to the old clock remainder');
 await h.advance(2);assert.equal(events.length,1);assert.ok(events[0].at-painted>=50);h.player.dispose();assert.equal(h.tasks.size,0);
});
