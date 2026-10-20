import {baseAction,captionAt,frameAt,idleActions,toolAction,type Activity,type Character,type Pack} from './policy';
import {hdAssetURL,loadHDManifest,petResolution,petView,type HDManifest,type HDVariant,type PetView} from './pet-view';
const CACHE_BYTES=24*1024*1024;
type SourceSpec={key:string;url:string;width:number;height:number;columns:number;start:number;count:number;level:80|160|320;bytes:number};
type Source=SourceSpec&{image:HTMLImageElement};
type CacheEntry={image:HTMLImageElement;ready:Promise<HTMLImageElement>;bytes:number;cancel:()=>void};
/** Optional local desktop playback. DSH keeps its real-time activity clock. */
export type PlayerOptions={frameLocked?:boolean;onComplete?:(action:string)=>void};
/** The display layer only: no CLI commands, model requests, or conversation text. */
export class Player {
 private state:Activity={busy:false,phase:'thinking'};
 private action='';private since=0;private phaseSince=performance.now();private idleSince=performance.now();
 private idleIndex=0;private previewIndex=0;private toolIndex=0;private completeIndex=0;private tool='';
 private source:Source|null=null;private previous:HTMLCanvasElement|null=null;
 private transient=false;private hold=false;private resting=false;private frame=-1;private revision=0;private viewRevision=0;private loading=false;private disposed=false;
 private timer:ReturnType<typeof setTimeout>|null=null;private raf:number|null=null;
 private cache=new Map<string,CacheEntry>();private pendingSource='';private hd:HDManifest|null|undefined;private manifestPending=false;private failedHD=new Set<string>();
 private view:PetView={size:80,quality:'80'};
 private frozenElapsed:number|null=null;private paintedFrame=-1;private paintedAt=0;
 private media=matchMedia('(prefers-reduced-motion: reduce)');private lastSpecial=-Infinity;
 constructor(private canvas:HTMLCanvasElement,private character:Character,private pack:Pack,private caption:HTMLElement,private label:(title:string)=>void,private manifest:()=>Promise<HDManifest|null>=loadHDManifest,private assetURL:(character:string,action:string,file:string)=>string|null=hdAssetURL,private options:PlayerOptions={}){
  document.addEventListener('visibilitychange',this.visibility);this.media.addEventListener('change',this.motion);
  this.tool=toolAction(character);this.base();
 }
 /** Scaling or changing detail never restarts an action or its authored clock. */
 setView(value:PetView){
  if(this.disposed)return;this.view=petView(value);++this.viewRevision;this.pendingSource='';
  if(this.source)this.draw(this.currentFrame());this.ensureSource(this.currentFrame());
 }
 private stopClock(){if(this.timer!==null)clearTimeout(this.timer);if(this.raf!==null)cancelAnimationFrame(this.raf);this.timer=this.raf=null;}
 private elapsed(){return this.frozenElapsed??performance.now()-this.since;}
 private lockedFrame(frame:number){
  if(!this.options.frameLocked||this.hold||this.resting||this.media.matches)return frame;
  const next=Math.min(this.pack.animations[this.action].frames-1,this.paintedFrame+1);
  if(frame<=next)return frame;
  const elapsed=next*1000/this.pack.animations[this.action].fps;
  if(this.frozenElapsed!==null)this.frozenElapsed=elapsed;else this.since=performance.now()-elapsed;
  return next;
 }
 private freeze(frame:number){if(this.frozenElapsed===null)this.frozenElapsed=frame*1000/this.pack.animations[this.action].fps;this.stopClock();}
 private family(s:Activity){return `${s.busy}:${s.awaitingInput}:${['thinking','preparing'].includes(s.phase)?'thinking':s.phase}`;}
 update(next:Activity){
  if(this.disposed)return;
  const old=this.state;this.state=next;
  if(this.family(old)!==this.family(next))this.phaseSince=performance.now();
  if(next.toolId&&next.toolId!==old.toolId)this.tool=toolAction(this.character,next.tool,this.toolIndex++);
  if(!next.busy&&old.busy)this.idleSince=performance.now();
  if(next.awaitingInput){this.base(true);return;}
  if(next.phase==='stopping'){
   const action=this.character==='clawd'?'Turning':this.character==='claude'?'stopped':'error';
   if(next.busy){this.base(true);return;}
   if(old.busy||old.phase!=='stopping'){this.play(action,true);return;}
   // Cached terminal facts remain after feedback ends. Keep that feedback
   // intact, then allow a genuinely new idle draft to trigger its own action.
   if(this.transient&&this.action===action)return;
  }
  if(next.errorId&&next.errorId!==old.errorId){this.play(this.character==='clawd'?'Facepalm':'error',true);return;}
  if(next.busy&&!old.busy){if(this.media.matches){this.base(true);return;}this.play(this.character==='clawd'?'Excited':this.character==='claude'?'sending':this.character==='gpt'?'wave':'fast',true);return;}
  if(!next.busy&&old.busy){const c=this.character,n=this.completeIndex++;this.play(c==='clawd'?['JumpingHappy','Confetti','DancingHappy','Spark'][n%4]:c==='gpt'?['happy','ready','idea'][n%3]:c==='deepseek'?['happy','riceHappy','dance'][n%3]:['happy','dance'][n%2],true);return;}
  if(this.character==='claude'&&next.chineseDraft&&!old.chineseDraft&&!next.busy&&performance.now()-this.lastSpecial>20000){this.lastSpecial=performance.now();this.play('special',true);return;}
  if(!this.transient&&this.desired()!==this.action)this.base();
 }
 private desired(){return baseAction(this.character,this.state,performance.now()-this.phaseSince,this.tool);}
 private base(urgent=false){
  if(this.disposed||document.hidden)return;if(this.transient&&!urgent)return;
  const busy=this.state.busy||this.state.awaitingInput;this.play(this.desired(),false,!!busy,!busy);
 }
 private baseSpec(action:string):SourceSpec{
  const a=this.pack.animations[action];return {key:action+':80',url:this.pack.urls[action],width:a.width,height:a.height,columns:a.columns,start:0,count:a.frames,level:80,bytes:a.width*a.height*a.columns*Math.ceil(a.frames/a.columns)*4};
 }
 private variant(level:160|320):HDVariant|undefined{
  const a=this.pack.animations[this.action],v=this.hd?.characters[this.character]?.animations[this.action]?.[String(level) as '160'|'320'];
  if(!v||v.height!==level||v.width!==a.width*level/80||v.frames!==a.frames||v.fps!==a.fps||v.columns!==4||v.chunkFrames!==16||!Array.isArray(v.files)||v.files.length!==Math.ceil(v.frames/v.chunkFrames))return;
  return v;
 }
 private wantedSpec(frame:number):SourceSpec{
  const target=petResolution(this.view,devicePixelRatio||1,this.character==='clawd');
  for(const level of target===320?[320,160]as const:target===160?[160]as const:[]){
   if(this.failedHD.has(this.action+':'+level))continue;const v=this.variant(level);if(!v)continue;
   const chunk=Math.floor(frame/v.chunkFrames),file=v.files[chunk],url=typeof file==='string'?this.assetURL(this.character,this.action,file):null;if(!url)continue;
   const start=chunk*v.chunkFrames,count=Math.min(v.chunkFrames,v.frames-start);
   return {key:this.action+':'+level+':'+chunk,url,width:v.width,height:v.height,columns:v.columns,start,count,level,bytes:v.width*v.height*v.columns*Math.ceil(count/v.columns)*4};
  }
  return this.baseSpec(this.action);
 }
 private requestManifest(){
  if(this.hd!==undefined||this.manifestPending||this.character==='clawd'||petResolution(this.view,devicePixelRatio||1)===80)return;
  this.manifestPending=true;this.manifest().then(metadata=>{this.manifestPending=false;if(this.disposed)return;this.hd=metadata;this.ensureSource(this.currentFrame());}).catch(()=>{this.manifestPending=false;this.hd=null;});
 }
 private load(spec:SourceSpec){
  const hit=this.cache.get(spec.key);if(hit){this.cache.delete(spec.key);this.cache.set(spec.key,hit);return hit.ready;}
  const image=new Image();image.decoding='async';let pending=true,cancel=()=>{};
  const ready=new Promise<HTMLImageElement>((resolve,reject)=>{
   const fail=()=>{pending=false;if(this.cache.get(spec.key)?.image===image)this.cache.delete(spec.key);reject(Error('Pet image unavailable'));};
   cancel=()=>{if(pending){pending=false;image.onload=image.onerror=null;image.src='';reject(Error('Pet image superseded'));}};
   image.onload=()=>image.decode().then(()=>{pending=false;resolve(image);},fail);image.onerror=fail;
  });
  this.cache.set(spec.key,{image,ready,bytes:spec.bytes,cancel});
  while(this.cache.size>2||[...this.cache.values()].reduce((n,a)=>n+a.bytes,0)>CACHE_BYTES){
   const key=[...this.cache.keys()].find(k=>k!==spec.key&&k!==this.source?.key);if(!key)break;
   const entry=this.cache.get(key)!;this.cache.delete(key);entry.cancel();
  }
  image.src=spec.url;return ready;
 }
 private currentFrame(){
  const a=this.pack.animations[this.action];if(!a)return 0;
  return this.media.matches?a.poster:this.resting?0:this.lockedFrame(frameAt(a,this.elapsed(),this.hold)??a.frames-1);
 }
 private ensureSource(frame:number){
  if(this.disposed||document.hidden||!this.action||this.loading)return;
  this.requestManifest();const spec=this.wantedSpec(frame);
  if(this.source?.key===spec.key){this.prefetch(frame);return;}if(this.pendingSource===spec.key)return;
  this.pendingSource=spec.key;const rev=this.revision,view=this.viewRevision;
  this.load(spec).then(image=>{
   if(this.disposed||document.hidden||rev!==this.revision||view!==this.viewRevision)return;
   this.pendingSource='';const latest=this.currentFrame(),wanted=this.wantedSpec(latest);
   if(wanted.key!==spec.key){this.ensureSource(latest);return;}
   const resume=this.frozenElapsed!==null;
   if(resume){this.since=performance.now()-this.frozenElapsed!;this.frozenElapsed=null;}
   this.source={...spec,image};this.frame=-1;this.draw(latest);this.prefetch(latest);
   if(resume&&!this.media.matches)this.schedule(1000/this.pack.animations[this.action].fps);
  }).catch(()=>{
   if(this.disposed||rev!==this.revision||view!==this.viewRevision)return;
   this.pendingSource='';if(spec.level!==80){this.failedHD.add(this.action+':'+spec.level);this.ensureSource(this.currentFrame());}
  });
 }
 private prefetch(frame:number){
  const current=this.source;if(!current||current.level===80||frame<current.start+current.count-5)return;
  const nextFrame=current.start+current.count;if(nextFrame>=this.pack.animations[this.action].frames)return;
  const spec=this.wantedSpec(nextFrame);if(spec.level!==current.level||spec.key===current.key)return;
  void this.load(spec).catch(()=>{});
 }
 private play(action:string,transient:boolean,hold=false,rest=false){
  if(!this.pack.animations[action]||this.disposed||document.hidden)return;transient=transient&&!this.media.matches;
  if(this.action===action&&this.transient===transient&&this.hold===hold&&this.resting===rest&&(this.source||this.loading))return;
  this.stopClock();const revision=++this.revision;this.action=action;this.transient=transient;this.hold=hold;this.resting=rest;this.loading=true;this.source=null;this.pendingSource='';this.frame=-1;this.paintedFrame=-1;this.frozenElapsed=null;
  const spec=this.baseSpec(action);
  this.load(spec).then(image=>{
   if(this.disposed||revision!==this.revision||document.hidden)return;
   this.previous=document.createElement('canvas');this.previous.width=this.canvas.width;this.previous.height=this.canvas.height;this.previous.getContext('2d')!.drawImage(this.canvas,0,0);
   this.source={...spec,image};this.loading=false;this.since=performance.now();if(this.media.matches)this.previous=null;
   this.draw(this.currentFrame());this.label(this.pack.animations[action].title);this.ensureSource(this.currentFrame());
   if(!this.media.matches)this.schedule(50);
  }).catch(()=>{if(this.disposed||revision!==this.revision)return;this.loading=false;this.caption.textContent='';});
 }
 private schedule(ms:number){this.timer=setTimeout(()=>{this.timer=null;this.raf=requestAnimationFrame(this.tick);},ms);}
 private tick=()=>{
  this.raf=null;if(this.disposed||document.hidden||this.media.matches||!this.source)return;
  let elapsed=this.elapsed();const a=this.pack.animations[this.action];
  if(this.resting){
   if(this.previous)this.draw(0);
   if(elapsed>=15000){const choices=idleActions[this.character],choice=choices[this.idleIndex++%choices.length];if(choice==='sleep'&&performance.now()-this.idleSince<90000){this.since=performance.now();this.schedule(15000);return;}this.play(choice,true,choice==='sleep');return;}
   this.schedule(this.previous?50:Math.max(50,15000-elapsed));return;
  }
  if(!this.transient&&this.desired()!==this.action){this.base();return;}
  if(this.transient&&this.state.busy&&['sending','fast','wave','Excited'].includes(this.action)&&elapsed>=900){this.transient=false;this.base();return;}
  const nominal=frameAt(a,elapsed,this.hold);
  if(nominal===null&&(!this.options.frameLocked||this.paintedFrame===a.frames-1)){
   if(this.options.frameLocked){const remaining=1000/a.fps-(performance.now()-this.paintedAt);if(remaining>0){this.schedule(Math.max(1,remaining));return;}}
   const revision=this.revision,action=this.action,complete=this.transient;this.transient=false;
   if(complete)this.options.onComplete?.(action);
   if(revision===this.revision)this.base();return;
  }
  const n=this.lockedFrame(nominal??a.frames-1);this.ensureSource(n);
  if(this.options.frameLocked&&(n<this.source.start||n>=this.source.start+this.source.count)){this.freeze(n);return;}
  if(n!==this.frame||this.previous)this.draw(n);elapsed=this.elapsed();
  this.caption.textContent=captionAt(this.character,this.action,elapsed,a);
  this.schedule(this.hold&&n===(a.sustain??a.frames-1)&&!this.previous?1000:Math.max(1,1000/a.fps-(elapsed%(1000/a.fps))));
 };
 private draw(frame:number){
  if(!this.source)return;const a=this.pack.animations[this.action],source=this.source;if(frame<source.start||frame>=source.start+source.count)return;
  const c=this.canvas,scale=this.view.size/80,w=a.width*scale,h=a.height*scale,ratio=Math.min(2,Math.max(1,devicePixelRatio||1)),mix=Math.min(1,(performance.now()-this.since)/150);
  const width=Math.round(w*ratio),height=Math.round(h*ratio);if(c.width!==width||c.height!==height){c.width=width;c.height=height;}
  c.style.width=w+'px';c.style.height=h+'px';c.style.left=(this.view.size-w)/2+'px';
  const ctx=c.getContext('2d')!;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
  if(this.previous&&mix<1){const pw=this.previous.width/this.previous.height*h;ctx.globalAlpha=1-mix;ctx.drawImage(this.previous,0,0,this.previous.width,this.previous.height,(w-pw)/2,0,pw,h);ctx.globalCompositeOperation='lighter';}
  const local=frame-source.start;ctx.globalAlpha=this.previous?mix:1;ctx.drawImage(source.image,local%source.columns*source.width,Math.floor(local/source.columns)*source.height,source.width,source.height,0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(mix===1)this.previous=null;
  c.dataset.character=this.character;c.dataset.action=this.action;c.dataset.frame=String(frame);if(c.dataset.resolution!==String(source.level))c.dataset.resolution=String(source.level);this.frame=frame;if(frame>this.paintedFrame)this.paintedAt=performance.now();this.paintedFrame=Math.max(this.paintedFrame,frame);this.caption.textContent=captionAt(this.character,this.action,this.elapsed(),a);
 }
 preview(action?:string){if(this.state.busy||this.state.awaitingInput)return;const choices=Object.keys(this.pack.animations);const selected=action&&this.pack.animations[action]?action:choices[this.previewIndex++%choices.length];this.play(selected,true);}
 private visibility=()=>{if(document.hidden){this.stopClock();++this.revision;this.loading=false;this.source=null;this.previous=null;this.pendingSource='';for(const a of this.cache.values())a.cancel();this.cache.clear();}else{this.transient=false;this.base();}};
 private motion=()=>{this.stopClock();this.source=null;this.loading=false;++this.revision;this.transient=false;this.base();};
 dispose(){this.disposed=true;++this.revision;++this.viewRevision;this.stopClock();document.removeEventListener('visibilitychange',this.visibility);this.media.removeEventListener('change',this.motion);for(const a of this.cache.values())a.cancel();this.cache.clear();this.source=null;this.previous=null;}
}
