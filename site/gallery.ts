import {captionAt,names,type Animation,type Character,type Pack} from '../src/policy';
import {signatureStory,storyTimeline,storyAt,storyCaption,type StoryTimeline} from '../src/stories';
import {readViewSettings,stagePlacement,resolveQuality,type Quality} from './view-settings';
import data from '../.generated/site-packs.json';

type HDVariant={width:number;height:number;columns:number;chunkFrames:number;frames:number;fps:number;files:string[]};
type HDManifest={characters:Partial<Record<Character,{animations:Record<string,Partial<Record<'160'|'320',HDVariant>>>}>>};
type Source={url:string;width:number;height:number;columns:number;frame:number;pixel:boolean};
const packs=data as Record<Character,Pack>,ids=Object.keys(packs) as Character[];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const q=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const group=q<HTMLCanvasElement>('#group'),solo=q<HTMLCanvasElement>('#solo');
const context=solo.getContext('2d')!,groupContext=group.getContext('2d')!,stage=q<HTMLDivElement>('.stage');
const actionSelect=q<HTMLSelectElement>('#action'),timeline=q<HTMLInputElement>('#timeline');
const caption=q('#caption'),playButton=q<HTMLButtonElement>('#play'),counter=q<HTMLOutputElement>('#counter');
const info=q('#clip-info'),loop=q<HTMLInputElement>('#loop'),quality=q<HTMLSelectElement>('#quality');
const sizeInput=q<HTMLInputElement>('#pet-size'),sizeOutput=q<HTMLOutputElement>('#size-value'),qualityNote=q('#quality-note');
let saved:string|null=null;try{saved=localStorage.getItem('pixel-pets-view');}catch{}
const view=readViewSettings(location.search,saved);quality.value=view.quality;sizeInput.value=String(view.size);
const requestedPet=new URLSearchParams(location.search).get('pet');
let character:Character=ids.includes(requestedPet as Character)?requestedPet as Character:'claude';
let action='__story',story=storyTimeline(signatureStory(character),packs[character]);
let elapsed=0,playing=!reduced.matches,soloVisible=false,groupVisible=false,lastNow=0,raf:number|undefined,revision=0;
let signature='',groupSignature='',hd:HDManifest|undefined,failedHD=false;
const images=new Map<string,{image:HTMLImageElement;ready:boolean;failed:boolean}>();
const hero=Object.fromEntries(ids.map(c=>[c,{story:storyTimeline(signatureStory(c),packs[c]),elapsed:0}])) as Record<Character,{story:StoryTimeline;elapsed:number}>;
const manifest=fetch('assets-hd/manifest.json').then(async r=>{if(!r.ok)throw Error('HD manifest unavailable');hd=await r.json();signature='';groupSignature='';schedule();}).catch(()=>{failedHD=true;note();});
function save(){try{localStorage.setItem('pixel-pets-view',JSON.stringify(view));}catch{}const url=new URL(location.href);url.searchParams.set('quality',view.quality);url.searchParams.set('size',String(view.size));history.replaceState(null,'',url);}
function load(url:string){
 let entry=images.get(url);if(entry){images.delete(url);images.set(url,entry);return entry;}
 const image=new Image();image.decoding='async';entry={image,ready:false,failed:false};const own=entry;
 image.onload=()=>void image.decode().then(()=>{own.ready=true;signature='';groupSignature='';if(!document.hidden){drawSolo();drawGroup(0);schedule();}},()=>{own.failed=true;failedHD=true;signature='';groupSignature='';drawSolo();drawGroup(0);schedule();});
 image.onerror=()=>{own.failed=true;failedHD=true;signature='';groupSignature='';drawSolo();drawGroup(0);schedule();};image.src=url;images.set(url,entry);
 // At most twelve decoded atlas chunks; hero uses real160px sources, solo up to320.
 while(images.size>12){const key=images.keys().next().value!,old=images.get(key)!;images.delete(key);if(!old.ready){old.image.onload=old.image.onerror=null;old.image.src='';}}
 return entry;
}
function source(c:Character,a:string,n:number,level:'pixel'|'160'|'320'):Source|undefined{
 const animation=packs[c].animations[a];if(!animation)return;
 const variant=level==='pixel'||failedHD?undefined:hd?.characters[c]?.animations[a]?.[level];
 if(variant){const chunk=Math.floor(n/variant.chunkFrames),file=variant.files[chunk];if(!file)return;
  return{url:'assets-hd/'+file,width:variant.width,height:variant.height,columns:variant.columns,frame:n%variant.chunkFrames,pixel:false};}
 if(c!=='clawd'&&level!=='pixel'&&!failedHD)return;
 return{url:packs[c].urls[a],width:animation.width,height:animation.height,columns:animation.columns,frame:n,pixel:true};
}
function currentPosition(ms=elapsed){
 if(action==='__story')return storyAt(story,ms);
 const a=packs[character].animations[action],time=Math.max(0,Math.min(ms,a.frames/a.fps*1000));
 return{action,localMs:time,frame:Math.min(a.frames-1,Math.floor(time*a.fps/1000)),globalFrame:Math.min(a.frames-1,Math.floor(time*a.fps/1000)),step:{action},ended:time>=a.frames/a.fps*1000};
}
function duration(){const a=packs[character].animations[action];return action==='__story'?story.durationMs:a.frames/a.fps*1000;}
function totalFrames(){return action==='__story'?story.frames:packs[character].animations[action].frames;}
function aspect(){return Math.max(...(action==='__story'?story.steps.map(s=>packs[character].animations[s.action]):[packs[character].animations[action]]).map(a=>a.width/a.height));}
function wantedLevel():'pixel'|'160'|'320'{const p=stagePlacement(view.size,stage.clientWidth,aspect());const legacy=resolveQuality(view.quality,p.actor,devicePixelRatio||1,character==='clawd');return legacy==='720'?'320':legacy==='360'?'160':'pixel';}
function draw(ctx:CanvasRenderingContext2D,s:Source,nx:number,y:number,height:number){const entry=load(s.url);if(!entry.ready)return false;ctx.imageSmoothingEnabled=!s.pixel;ctx.imageSmoothingQuality='high';const width=height*s.width/s.height;ctx.drawImage(entry.image,s.frame%s.columns*s.width,Math.floor(s.frame/s.columns)*s.height,s.width,s.height,Math.round(nx-width/2),Math.round(y),Math.round(width),Math.round(height));return true;}
function prefetch(c:Character,a:string,n:number,level:'pixel'|'160'|'320'){
 const variant=level==='pixel'||failedHD?undefined:hd?.characters[c]?.animations[a]?.[level];
 if(variant){const next=Math.floor(n/variant.chunkFrames)+1;if(variant.files[next])load('assets-hd/'+variant.files[next]);}
}
function soloReady(ms:number){const p=currentPosition(ms),s=source(character,p.action,p.frame,wantedLevel());return s&&load(s.url).ready;}
function drawSolo(){
 const p=currentPosition(),a=packs[character].animations[p.action],level=wantedLevel(),s=source(character,p.action,p.frame,level);
 const next=[revision,p.globalFrame,level,solo.width,view.size].join(':');if(next===signature)return;
 if(!s||!load(s.url).ready){note(true);return;}signature=next;context.clearRect(0,0,solo.width,solo.height);
 const place=stagePlacement(view.size,stage.clientWidth,aspect()),dpr=Math.min(devicePixelRatio||1,2),height=place.actor/54*80;
 draw(context,s,solo.width/2,(place.baseline-67*place.actor/54)*dpr,height*dpr);prefetch(character,p.action,p.frame,level);
 if(action==='__story'){const nextStep=story.steps[(p as ReturnType<typeof storyAt>).index+1];if(nextStep){const next=source(character,nextStep.action,0,level);if(next)load(next.url);}}
 timeline.value=String(p.globalFrame);counter.value=String(p.globalFrame+1).padStart(3,'0')+' / '+totalFrames();
 caption.textContent=action==='__story'?storyCaption(p.step,a,Math.min(p.localMs,(a.frames-1)/a.fps*1000)):captionAt(character,p.action,Math.min(p.localMs,(a.frames-1)/a.fps*1000),a);note();
}
function drawGroup(dt:number){
 let changed=false;const states=ids.map(c=>{const h=hero[c],next=reduced.matches?h.elapsed:Math.min(h.story.durationMs,h.elapsed+dt),p=storyAt(h.story,next),s=source(c,p.action,p.frame,c==='clawd'?'pixel':'160');if(s&&load(s.url).ready){h.elapsed=next>=h.story.durationMs?0:next;prefetch(c,p.action,p.frame,c==='clawd'?'pixel':'160');return{c,p,s};}const held=storyAt(h.story,h.elapsed),heldSource=source(c,held.action,held.frame,c==='clawd'?'pixel':'160');return{c,p:held,s:heldSource&&load(heldSource.url).ready?heldSource:undefined};});
 const key=states.map(s=>s.s?s.c+':'+s.p.globalFrame:'loading').join('|');changed=key!==groupSignature;if(!changed)return;groupSignature=key;
 groupContext.clearRect(0,0,group.width,group.height);
 states.forEach(({c,p,s},i)=>{if(!s)return;const a=packs[c].animations[p.action];draw(groupContext,s,140+i*280,94,216);groupContext.fillStyle='#6c6353';groupContext.font='500 12px "PingFang SC",sans-serif';groupContext.textAlign='center';groupContext.fillText(storyCaption(p.step,a,p.localMs),140+i*280,61,258);});
}
function updateInfo(){const fps=action==='__story'?story.fps:packs[character].animations[action].fps;info.textContent=(action==='__story'?signatureStory(character).title:packs[character].animations[action].title)+` · ${totalFrames()} 帧 · ${fps} fps · ${(duration()/1000).toFixed(2)}s`;timeline.max=String(totalFrames()-1);}
function note(loading=false){const level=wantedLevel();qualityNote.classList.toggle('is-loading',loading);q('#stage-label').textContent=level==='pixel'?'ORIGINAL PIXEL FRAMES':`${level}PX · HD SOURCE FRAMES`;qualityNote.textContent=character==='clawd'?'Clawd 保留原版像素；完整25动作可逐一选择或连续播放。':loading?'正在加载下一段高清帧，保留当前画面……':failedHD?'高清素材暂不可用，已保留完整像素版；刷新页面可重试。':level==='pixel'?'80px 桌面像素版 · 完整帧序；大小与清晰度独立调整。':`${level}px 真实高清素材 · 完整帧序与全程字幕，按需加载。`;}
function updatePlay(){playButton.textContent=playing?'Ⅱ':'▶';playButton.setAttribute('aria-label',playing?'暂停动画':'播放动画');}
function layout(){const p=stagePlacement(view.size,stage.clientWidth,aspect()),dpr=Math.min(devicePixelRatio||1,2);stage.style.height=p.height+'px';const width=Math.round(stage.clientWidth*dpr),height=Math.round(p.height*dpr);if(solo.width!==width||solo.height!==height){solo.width=width;solo.height=height;}sizeOutput.value=view.size+'px';sizeInput.setAttribute('aria-valuetext',view.size+'像素');signature='';drawSolo();}
function schedule(){if(raf===undefined&&!document.hidden&&((soloVisible&&playing)||(groupVisible&&!reduced.matches)))raf=requestAnimationFrame(clock);}
function clock(now:number){raf=undefined;const dt=lastNow?Math.min(100,now-lastNow):0;lastNow=now;if(document.hidden)return;
 if(soloVisible&&playing){let next=Math.min(duration(),elapsed+dt);if(soloReady(next)){elapsed=next;if(elapsed>=duration()){if(loop.checked)elapsed=0;else{playing=false;updatePlay();}}}drawSolo();}
 if(groupVisible)drawGroup(dt);schedule();}
function pauseOrPlay(next:boolean){if(next&&elapsed>=duration())elapsed=0;playing=next;lastNow=performance.now();updatePlay();drawSolo();schedule();}
function select(c:Character,a='__story'){if(a!=='__story'&&!packs[c].animations[a])return;character=c;action=a;story=storyTimeline(signatureStory(c),packs[c]);elapsed=0;revision++;playing=!reduced.matches;
 actionSelect.replaceChildren(...[{id:'__story',title:'★ '+signatureStory(c).title},...Object.entries(packs[c].animations).map(([id,a])=>({id,title:a.title}))].map(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.title;return o;}));actionSelect.value=a;
 quality.disabled=c==='clawd';quality.value=c==='clawd'?'pixel':view.quality;stage.setAttribute('aria-labelledby','role-'+c);
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-character]')){const active=b.dataset.character===c;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
 updateInfo();updatePlay();layout();lastNow=performance.now();schedule();
 const url=new URL(location.href);url.searchParams.set('pet',c);history.replaceState(null,'',url);
}
const roles=[...document.querySelectorAll<HTMLButtonElement>('[data-character]')];
for(const b of roles){b.id='role-'+b.dataset.character;b.setAttribute('aria-controls','pet-stage');b.addEventListener('click',()=>select(b.dataset.character as Character));b.addEventListener('keydown',e=>{const i=roles.indexOf(b),target=e.key==='Home'?0:e.key==='End'?roles.length-1:e.key==='ArrowRight'?(i+1)%roles.length:e.key==='ArrowLeft'?(i+roles.length-1)%roles.length:-1;if(target<0)return;e.preventDefault();roles[target].focus();roles[target].click();});}
 actionSelect.addEventListener('change',()=>select(character,actionSelect.value));
 quality.addEventListener('change',()=>{view.quality=quality.value as Quality;save();signature='';drawSolo();schedule();});
 sizeInput.addEventListener('input',()=>{view.size=Number(sizeInput.value);save();layout();});
 playButton.addEventListener('click',()=>pauseOrPlay(!playing));q('#replay').addEventListener('click',()=>{elapsed=0;signature='';pauseOrPlay(true);});
 timeline.addEventListener('input',()=>{const frame=Number(timeline.value);if(action==='__story'){const step=story.steps.find(s=>frame<s.startFrame+s.frames)??story.steps.at(-1)!;elapsed=step.startMs+(frame-step.startFrame)/step.fps*1000;}else elapsed=frame/packs[character].animations[action].fps*1000;signature='';lastNow=performance.now();drawSolo();});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-state]'))b.addEventListener('click',()=>{const map={claude:{thinking:'thinking',tools:'typing',waiting:'pointing',done:'happy'},gpt:{thinking:'thinking',tools:'probe',waiting:'gate',done:'ready'},deepseek:{thinking:'chain',tools:'typing',waiting:'hungry',done:'riceHappy'},clawd:{thinking:'Thinking',tools:'Laptop',waiting:'Pointing',done:'Confetti'}};select(character,map[character][b.dataset.state as 'thinking']);});
 const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.target===stage)soloVisible=e.isIntersecting;else groupVisible=e.isIntersecting;}lastNow=performance.now();drawSolo();drawGroup(0);schedule();},{threshold:.05});observer.observe(group);observer.observe(stage);
 new ResizeObserver(layout).observe(stage);window.addEventListener('resize',()=>{signature='';drawSolo();});document.addEventListener('visibilitychange',()=>{lastNow=performance.now();if(document.hidden){if(raf!==undefined)cancelAnimationFrame(raf);raf=undefined;}else{drawSolo();drawGroup(0);schedule();}});
 reduced.addEventListener('change',()=>{pauseOrPlay(!reduced.matches);groupSignature='';drawGroup(0);});
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')){const label=b.getAttribute('aria-label')??'复制安装命令';let reset:number|undefined;b.addEventListener('click',async()=>{const command=document.getElementById(b.dataset.copyTarget??'')?.textContent?.trim();if(!command)return;clearTimeout(reset);try{await navigator.clipboard.writeText(command);b.textContent='已复制';b.setAttribute('aria-label',label+'，已复制');}catch{b.textContent='请选中复制';}reset=window.setTimeout(()=>{b.textContent='复制';b.setAttribute('aria-label',label);},1800);});}
 for(const c of ids)for(const folder of c==='clawd'?['codex']:['codex','codex-pixel']){const title=names[c]+(c==='clawd'?' · 原版像素':folder==='codex'?' · 高清':' · 80px 像素'),link=document.createElement('a');link.textContent=title+' ↗';link.href='codex://pets/install?'+new URLSearchParams({name:title,imageUrl:'https://raw.githubusercontent.com/plbbl/pixel-agent-pets/main/'+folder+'/'+c+'/spritesheet.png',spriteVersionNumber:'1'});q('#native-links').append(link);}
select(character);void manifest;
