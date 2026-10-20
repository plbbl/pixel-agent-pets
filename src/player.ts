import {baseAction,captionAt,frameAt,idleActions,toolAction,type Activity,type Character,type Pack} from './policy';
const CACHE_BYTES=10*1024*1024;
/** Local, event-driven canvas player. It has no host commands or network client. */
export class Player {
 private state:Activity={busy:false,phase:'thinking'};
 private action='';private since=0;private phaseSince=performance.now();private idleSince=performance.now();
 private idleIndex=0;private previewIndex=0;private toolIndex=0;private completeIndex=0;private tool='';
 private image:HTMLImageElement|null=null;private previous:HTMLCanvasElement|null=null;
 private transient=false;private hold=false;private resting=false;private frame=-1;private revision=0;private loading=false;private disposed=false;
 private timer:ReturnType<typeof setTimeout>|null=null;private raf:number|null=null;
 private cache=new Map<string,{image:HTMLImageElement,ready:Promise<HTMLImageElement>,bytes:number,cancel:()=>void}>();
 private media=matchMedia('(prefers-reduced-motion: reduce)');private lastSpecial=-Infinity;
 constructor(private canvas:HTMLCanvasElement,private character:Character,private pack:Pack,private caption:HTMLElement,private label:(title:string)=>void){
  document.addEventListener('visibilitychange',this.visibility);this.media.addEventListener('change',this.motion);
  this.tool=toolAction(character);this.base();
 }
 private stopClock(){if(this.timer!==null)clearTimeout(this.timer);if(this.raf!==null)cancelAnimationFrame(this.raf);this.timer=this.raf=null;}
 private family(s:Activity){return `${s.busy}:${s.awaitingInput}:${['thinking','preparing'].includes(s.phase)?'thinking':s.phase}`;}
 update(next:Activity){
  if(this.disposed)return;
  const old=this.state;this.state=next;
  if(this.family(old)!==this.family(next))this.phaseSince=performance.now();
  if(next.toolId&&next.toolId!==old.toolId)this.tool=toolAction(this.character,next.tool,this.toolIndex++);
  if(!next.busy&&old.busy)this.idleSince=performance.now();
  if(next.awaitingInput||next.phase==='stopping'&&next.busy){this.base(true);return;}
  if(next.errorId&&next.errorId!==old.errorId){this.play(this.character==='clawd'?'Facepalm':'error',true);return;}
  if(next.busy&&!old.busy){this.play(this.character==='clawd'?'Excited':this.character==='claude'?'sending':this.character==='gpt'?'wave':'fast',true);return;}
  if(!next.busy&&old.busy){const c=this.character,n=this.completeIndex++;this.play(c==='clawd'?['JumpingHappy','Confetti','DancingHappy','Spark'][n%4]:c==='gpt'?['happy','ready','idea'][n%3]:c==='deepseek'?['happy','riceHappy','dance'][n%3]:['happy','dance'][n%2],true);return;}
  if(this.character==='claude'&&next.chineseDraft&&!old.chineseDraft&&!next.busy&&performance.now()-this.lastSpecial>20000){this.lastSpecial=performance.now();this.play('special',true);return;}
  if(!this.transient&&this.desired()!==this.action)this.base();
 }
 private desired(){return baseAction(this.character,this.state,performance.now()-this.phaseSince,this.tool);}
 private base(urgent=false){
  if(this.disposed||document.hidden)return;
  if(this.transient&&!urgent)return;
  const busy=this.state.busy||this.state.awaitingInput;
  this.play(this.desired(),false,!!busy,!busy);
 }
 private load(action:string){
  const hit=this.cache.get(action);if(hit){this.cache.delete(action);this.cache.set(action,hit);return hit.ready;}
  const a=this.pack.animations[action],image=new Image();image.decoding='async';let pending=true,cancel=()=>{};
  const ready=new Promise<HTMLImageElement>((resolve,reject)=>{
   const fail=()=>{if(this.cache.get(action)?.image===image)this.cache.delete(action);reject(Error('Pet image unavailable'));};
   cancel=()=>{if(pending){pending=false;image.onload=image.onerror=null;image.src='';reject(Error('Pet image superseded'));}};
   image.onload=()=>image.decode().then(()=>{pending=false;resolve(image);},fail);image.onerror=fail;
  });
  this.cache.set(action,{image,ready,bytes:a.width*a.height*a.columns*Math.ceil(a.frames/a.columns)*4,cancel});
  while(this.cache.size>2||[...this.cache.values()].reduce((n,a)=>n+a.bytes,0)>CACHE_BYTES){const key=this.cache.keys().next().value!;const entry=this.cache.get(key)!;this.cache.delete(key);entry.cancel();}
  image.src=this.pack.urls[action];return ready;
 }
 private play(action:string,transient:boolean,hold=false,rest=false){
  if(!this.pack.animations[action]||this.disposed||document.hidden)return;
  if(this.action===action&&this.transient===transient&&this.hold===hold&&this.resting===rest&&(this.image||this.loading))return;
  this.stopClock();const revision=++this.revision;this.action=action;this.transient=transient;this.hold=hold;this.resting=rest;this.loading=true;this.image=null;this.frame=-1;
  this.load(action).then(image=>{
   if(this.disposed||revision!==this.revision||document.hidden)return;
   this.previous=document.createElement('canvas');this.previous.width=this.canvas.width;this.previous.height=this.canvas.height;this.previous.getContext('2d')!.drawImage(this.canvas,0,0);
   this.image=image;this.loading=false;this.since=performance.now();if(this.media.matches)this.previous=null;
   this.draw(this.media.matches?this.pack.animations[action].poster:0);this.label(this.pack.animations[action].title);
   if(!this.media.matches)this.schedule(50);
  }).catch(()=>{if(this.disposed||revision!==this.revision)return;this.loading=false;this.caption.textContent='';});
 }
 private schedule(ms:number){this.timer=setTimeout(()=>{this.timer=null;this.raf=requestAnimationFrame(this.tick);},ms);}
 private tick=()=>{
  this.raf=null;if(this.disposed||document.hidden||this.media.matches||!this.image)return;
  const elapsed=performance.now()-this.since,a=this.pack.animations[this.action];
  if(this.resting){
   if(this.previous)this.draw(0);
   if(elapsed>=15000){const choices=idleActions[this.character],choice=choices[this.idleIndex++%choices.length];if(choice==='sleep'&&performance.now()-this.idleSince<90000){this.since=performance.now();this.schedule(15000);return;}this.play(choice,true,choice==='sleep');return;}
   this.schedule(this.previous?50:Math.max(50,15000-elapsed));return;
  }
  if(!this.transient&&this.desired()!==this.action){this.base();return;}
  if(this.transient&&this.state.busy&&['sending','fast','wave','Excited'].includes(this.action)&&elapsed>=900){this.transient=false;this.base();return;}
  const n=frameAt(a,elapsed,this.hold);if(n===null){this.transient=false;this.base();return;}
  if(n!==this.frame||this.previous)this.draw(n);
  this.caption.textContent=captionAt(this.character,this.action,elapsed,a);
  this.schedule(this.hold&&n===(a.sustain??a.frames-1)&&!this.previous?1000:Math.max(1,1000/a.fps-(elapsed%(1000/a.fps))));
 };
 private draw(frame:number){
  if(!this.image)return;const a=this.pack.animations[this.action],c=this.canvas,w=a.width,h=a.height,ratio=Math.min(2,Math.max(1,Math.round(devicePixelRatio||1)));
  const mix=Math.min(1,(performance.now()-this.since)/150);
  if(c.width!==w*ratio||c.height!==h*ratio){c.width=w*ratio;c.height=h*ratio;}
  c.style.width=w+'px';c.style.left=(40-w/2)+'px';const ctx=c.getContext('2d')!;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,w,h);
  if(this.previous&&mix<1){const pw=this.previous.width/this.previous.height*h;ctx.globalAlpha=1-mix;ctx.drawImage(this.previous,0,0,this.previous.width,this.previous.height,(w-pw)/2,0,pw,h);ctx.globalCompositeOperation='lighter';}
  ctx.globalAlpha=this.previous?mix:1;ctx.drawImage(this.image,frame%a.columns*w,Math.floor(frame/a.columns)*h,w,h,0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';if(mix===1)this.previous=null;
  c.dataset.character=this.character;c.dataset.action=this.action;c.dataset.frame=String(frame);this.frame=frame;this.caption.textContent=captionAt(this.character,this.action,performance.now()-this.since,a);
 }
 preview(){if(this.state.busy||this.state.awaitingInput)return;const choices=Object.keys(this.pack.animations);this.play(choices[this.previewIndex++%choices.length],true);}
 private visibility=()=>{if(document.hidden){this.stopClock();++this.revision;this.loading=false;this.image=null;this.previous=null;for(const a of this.cache.values())a.cancel();this.cache.clear();}else{this.transient=false;this.base();}};
 private motion=()=>{this.stopClock();this.image=null;this.loading=false;++this.revision;this.transient=false;this.base();};
 dispose(){this.disposed=true;++this.revision;this.stopClock();document.removeEventListener('visibilitychange',this.visibility);this.media.removeEventListener('change',this.motion);for(const a of this.cache.values())a.cancel();this.cache.clear();this.image=null;this.previous=null;}
}
