import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export {mountNativePet} from './src/codex-native'; export {Player} from './src/player';",resolveDir:process.cwd(),sourcefile:'native-parity-fixture.ts'},bundle:true,format:'cjs',write:false,platform:'browser',define:{'import.meta.url':JSON.stringify('file:///fixture/webview/assets/codex-native.js')}});
const referencePacks=JSON.parse(await fs.readFile('.generated/native-packs.json'));
const referenceHD=JSON.parse(await fs.readFile('.generated/native-hd.json'));
function fixture(character='claude'){
 let now=0,sequence=0,fetches=0;const tasks=new Map(),listeners=new Map(),images=[];
 const context={setTransform(){},clearRect(){},drawImage(){}};
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.attrs={};this.events=new Map();this.width=80;this.height=80;this.clientWidth=112;}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
  setAttribute(key,value){this.attrs[key]=value;}
  getContext(){return context;}
  addEventListener(key,value){this.events.set(key,value);}
  removeEventListener(key){this.events.delete(key);}
 }
 class Image{
  constructor(){images.push(this);}
  set src(url){this.url=url;}
  get src(){return this.url;}
  decode(){return Promise.resolve();}
 }
 const media={matches:false,addEventListener(){},removeEventListener(){}};
 const document={hidden:false,createElement:tag=>new Element(tag),addEventListener:(key,value)=>listeners.set(key,value),removeEventListener:key=>listeners.delete(key)};
 const scope={module:{exports:{}},exports:{},URL,document,Image,devicePixelRatio:2,matchMedia:()=>media,performance:{now:()=>now},fetch:()=>{fetches++;throw Error('Native renderer must not fetch a service');},setTimeout:(fn,ms)=>{tasks.set(++sequence,{at:now+ms,fn});return sequence;},clearTimeout:id=>tasks.delete(id),requestAnimationFrame:fn=>{tasks.set(++sequence,{at:now,fn});return sequence;},cancelAnimationFrame:id=>tasks.delete(id)};
 scope.exports=scope.module.exports;vm.runInNewContext(bundle.outputFiles[0].text,scope);
 const root=new Element(),controller=scope.module.exports.mountNativePet(root,{character,activity:{busy:false,phase:'thinking'}}),canvas=controller.element.children[0].children[0];
 async function ready(){for(let i=0;i<20;i++){for(const image of images)if(image.onload&&image.url){const load=image.onload;image.onload=null;load();}await Promise.resolve();}}
 function advance(ms){const end=now+ms;let count=0;for(;;){const next=[...tasks].filter(([,task])=>task.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>10000)throw Error('Clock loop');now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}
 function reference(){const c=new Element('canvas'),caption=new Element('span'),p=new scope.module.exports.Player(c,character,referencePacks[character],caption,()=>{},async()=>referenceHD);p.setView({size:112,quality:'auto'});p.update({busy:false,phase:'thinking'});return{p,c,caption};}
 return {root,controller,canvas,images,listeners,tasks,ready,advance,reference,fetches:()=>fetches};
}
test('original-window module plays all source frames through the shared Player using local package assets only',async()=>{
 const f=fixture();await f.ready();assert.equal(f.root.children.length,1);assert.equal(f.controller.actions().length,12);assert.equal(f.controller.actions().find(a=>a.id==='special').frames,195);
 f.controller.preview('special');await f.ready();f.advance(500);await f.ready();assert.equal(f.canvas.dataset.action,'special');assert.equal(f.canvas.dataset.frame,'10');assert.equal(f.canvas.dataset.resolution,'320');
 f.advance(8300);await f.ready();assert.equal(f.canvas.dataset.action,'special');assert.equal(f.canvas.dataset.frame,'176');
 assert.equal(f.fetches(),0);assert.ok(f.images.every(image=>!image.url||image.url.startsWith('file:///fixture/webview/assets/baobaolong-assets/')));
 assert.ok(f.images.some(image=>image.url.includes('/base/claude/special.png')));assert.ok(f.images.some(image=>image.url.includes('/assets-hd/claude/special/320-')));
 f.controller.dispose();assert.equal(f.root.children.length,0);assert.equal(f.tasks.size,0);assert.equal(f.listeners.size,0);
});
test('native size/detail changes keep the full action time and native frame geometry; all four characters remain available',async()=>{
 const f=fixture('gpt');await f.ready();f.controller.preview('probe');await f.ready();f.advance(1250);await f.ready();const frame=f.canvas.dataset.frame;
 f.controller.setSize(224);f.controller.setQuality('80');await f.ready();assert.equal(f.canvas.dataset.frame,frame);assert.equal(f.canvas.dataset.resolution,'80');assert.equal(f.controller.element.style.width,'224px');assert.equal(f.controller.element.style.height,224*208/192+'px');
 f.controller.setQuality('auto');await f.ready();assert.equal(f.canvas.dataset.frame,frame);assert.equal(f.canvas.dataset.resolution,'320');
 f.controller.update({busy:true,phase:'tools',awaitingInput:true});await f.ready();assert.equal(f.canvas.dataset.action,'gate');
 for(const [character,count,action]of[['deepseek',15,'hungry'],['claude',12,'pointing'],['clawd',25,'Pointing'],['gpt',14,'gate']]){
  f.controller.setCharacter(character);await f.ready();assert.equal(f.controller.actions().length,count);assert.equal(f.canvas.dataset.action,action);
 }
 assert.equal(f.fetches(),0);f.controller.dispose();
});
test('native artifact contains metadata and image files, without embedding image data or creating another window',async()=>{
 const source=await fs.readFile('src/codex-native.ts','utf8');assert.ok(source.includes("import {Player} from './player'"));assert.ok(source.includes("from './policy'"));assert.ok(!/BrowserWindow|NSPanel|window\.open|child_process/.test(source));
 const module=await fs.readFile('dist/codex-native.js','utf8');assert.ok(!module.includes('data:image/'));assert.ok(module.includes('./baobaolong-assets/'));
 const marker=JSON.parse(await fs.readFile('dist/baobaolong-assets/artifact.json'));assert.equal(marker.animations,66);assert.equal(marker.kernelChanges,false);
 await fs.access('dist/baobaolong-assets/base/clawd/Thinking.png');await fs.access('dist/baobaolong-assets/assets-hd/claude/special/320-0.png');
});

function visibleState(canvas,caption){return{character:canvas.dataset.character,action:canvas.dataset.action,frame:canvas.dataset.frame,resolution:canvas.dataset.resolution,caption:caption.textContent??''};}
test('native and DSH replay identical activity facts, view changes, captions, and every one of the 195 full special frames',async()=>{
 for(const character of ['claude','gpt','deepseek','clawd']){
  const f=fixture(character),reference=f.reference(),nativeCaption=f.controller.element.children[1];
  const equal=()=>assert.deepEqual(visibleState(f.canvas,nativeCaption),visibleState(reference.c,reference.caption),character+' shared playback');
  const update=async activity=>{f.controller.update(activity);reference.p.update(activity);await f.ready();equal();};
  const advance=async ms=>{f.advance(ms);await f.ready();equal();};
  await f.ready();equal();
  await update({busy:true,phase:'sending'});await advance(950);
  await update({busy:true,phase:'tools',tool:'view_file',toolId:'read-1'});await advance(600);
  await update({busy:true,phase:'tools',tool:'run_command',toolId:'command-2'});await advance(700);
  await update({busy:true,phase:'tools',awaitingInput:true});await advance(2600);
  f.controller.setSize(80);f.controller.setQuality('80');reference.p.setView({size:80,quality:'80'});await f.ready();equal();
  f.controller.setSize(224);f.controller.setQuality('auto');reference.p.setView({size:224,quality:'auto'});await f.ready();equal();
  await update({busy:true,phase:'responding'});await advance(700);
  await update({busy:false,phase:'thinking'});await advance(1000);
  await update({busy:false,phase:'thinking',errorId:'failure-1'});await advance(4500);
  await update({busy:false,phase:'thinking'});
  if(character==='claude'){
   f.controller.preview('special');reference.p.preview('special');await f.ready();equal();
   const seen=[];for(let n=0;n<195;n++){if(n)await advance(50);else equal();seen.push(Number(f.canvas.dataset.frame));}
   assert.deepEqual(seen,Array.from({length:195},(_,n)=>n));assert.equal(nativeCaption.textContent,'your account is on hold');
  }
  f.controller.dispose();reference.p.dispose();assert.equal(f.tasks.size,0);assert.equal(f.fetches(),0);
 }
});
test('native frame owns only its children and keeps captions above the normalized actor at all supported sizes',async()=>{
 const f=fixture();await f.ready();const badge={nativeBadge:true};f.root.append(badge);const layer=f.controller.element.children[0],caption=f.controller.element.children[1];
 for(const size of [80,112,224]){
  f.controller.setSize(size);await f.ready();const frameHeight=parseFloat(f.controller.element.style.height),tileTop=frameHeight*parseFloat(layer.style.top)/100,tileWidth=size*5/6;
  assert.ok(Math.abs(frameHeight-size*208/192)<1e-9);assert.ok(Math.abs(tileTop-size*42/192)<1e-8);
  const firstActorPixel=tileTop+13/80*tileWidth;assert.ok(firstActorPixel>=28);assert.equal(caption.style.top,'0');assert.equal(f.controller.element.style.overflow,'visible');assert.equal(layer.style.overflow,'visible');
 }
 f.controller.dispose();assert.deepEqual(f.root.children,[badge]);
});
