import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Player} from './player';
import {names,type Activity,type Character,type Packs} from './policy';
import {readPetView,viewKey,petView,type PetQuality,type PetView} from './pet-view';
import {anchoredPosition,clampPetPoint,draggedPetPoint,petPosition,positionKey,positionEvent,readPetPosition,savePetPosition,type PetPoint,type PetPosition} from './pet-position';
import packs from '../.generated/packs.json';
const library=packs as Packs,key='pixel-agent-pets.character',viewEvent='pixel-agent-pets:view';
function initial():Character{try{const c=localStorage.getItem(key)as Character;return library[c]?c:'deepseek';}catch{return 'deepseek';}}
function initialView():PetView{try{return readPetView(localStorage.getItem(viewKey));}catch{return readPetView(null);}}
function initialPosition():PetPosition{try{return readPetPosition(localStorage.getItem(positionKey));}catch{return anchoredPosition();}}
export function Pet({activity}:{activity:Activity}){
 const [character,setCharacter]=useState(initial),[view,setView]=useState(initialView);
 const [savedPosition]=useState(initialPosition);
 const canvas=useRef<HTMLCanvasElement>(null),button=useRef<HTMLButtonElement>(null),caption=useRef<HTMLSpanElement>(null),player=useRef<Player>();
 const anchor=useRef<HTMLDivElement>(null),floating=useRef<HTMLDivElement>(null),position=useRef(savedPosition),repositionPet=useRef<()=>void>(()=>{}),resetPosition=useRef<()=>void>(()=>{});
 const beginDrag=useRef<(event:React.PointerEvent<HTMLButtonElement>)=>void>(()=>{}),suppressClickUntil=useRef(0);
 const latest=useRef(activity);latest.current=activity;const currentView=useRef(view);currentView.current=view;const dismiss=useRef<()=>void>();
 useLayoutEffect(()=>{
  let frame:number|undefined,drag:{id:number;start:PetPoint;origin:PetPoint;moved:boolean}|undefined;
  const viewport=()=>({width:window.visualViewport?.width??innerWidth,height:window.visualViewport?.height??innerHeight,left:window.visualViewport?.offsetLeft??0,top:window.visualViewport?.offsetTop??0});
  // A conversation slot already has the exact input anchor. The home slot is
  // outside that tree, so use the official composer's stable public marker.
  const composer=anchor.current?.closest<HTMLElement>('[data-composer-card]')??[...document.querySelectorAll<HTMLElement>('[data-composer-card]')].find(node=>{const rect=node.getBoundingClientRect();return rect.width>0&&rect.height>0;});
  const homeComposer=!!composer&&!composer.contains(anchor.current);
  const place=()=>{
   frame=undefined;if(!floating.current||!anchor.current)return;
   const size=currentView.current.size;
   let point:PetPoint;
   if(position.current.mode==='free'){point=clampPetPoint(position.current,size,viewport());position.current={mode:'free',...point};}
   else if(homeComposer&&composer){const rect=composer.getBoundingClientRect();point={x:rect.right-8-size,y:rect.top-size*67/80};}
   else {const rect=anchor.current.getBoundingClientRect();point={x:rect.left,y:rect.top};}
   if(position.current.mode==='anchored')point=clampPetPoint(point,size,viewport());
   const shown=position.current.mode==='free'||!!(homeComposer?composer:anchor.current)?.getClientRects().length;
   floating.current.style.visibility=shown?'visible':'hidden';
   floating.current.style.transform=`translate3d(${point.x}px, ${point.y}px, 0)`;
   floating.current.dataset.position=position.current.mode;
  };
  const queue=()=>{if(frame===undefined)frame=requestAnimationFrame(place);};
  const persist=()=>{try{localStorage.setItem(positionKey,savePetPosition(position.current));}catch{}window.dispatchEvent(new CustomEvent(positionEvent,{detail:position.current}));};
  const release=()=>{if(drag&&button.current?.hasPointerCapture(drag.id))button.current.releasePointerCapture(drag.id);};
  const finish=(event?:PointerEvent)=>{
   if(!drag||event&&event.pointerId!==drag.id)return;
   if(drag.moved){suppressClickUntil.current=performance.now()+350;persist();}
   release();drag=undefined;if(button.current)button.current.style.cursor='grab';queue();
  };
  const move=(event:PointerEvent)=>{
   if(!drag||event.pointerId!==drag.id)return;
   const point=draggedPetPoint(drag.origin,drag.start,{x:event.clientX,y:event.clientY},currentView.current.size,viewport(),drag.moved?0:5);
   if(!point)return;
   event.preventDefault();drag.moved=true;dismiss.current?.();position.current={mode:'free',...point};
   if(button.current)button.current.style.cursor='grabbing';queue();
  };
  const sync=(event:Event)=>{
   if(drag)return;
   if(event instanceof StorageEvent&&event.key!==positionKey&&event.key!==null)return;
   position.current=event instanceof CustomEvent?petPosition(event.detail):initialPosition();queue();
  };
  const blur=()=>finish();
  beginDrag.current=event=>{
   if(event.button!==0||!floating.current)return;
   const rect=floating.current.getBoundingClientRect();suppressClickUntil.current=0;
   drag={id:event.pointerId,start:{x:event.clientX,y:event.clientY},origin:{x:rect.left,y:rect.top},moved:false};
   button.current?.setPointerCapture(event.pointerId);
  };
  resetPosition.current=()=>{release();drag=undefined;position.current=anchoredPosition();persist();queue();};
  repositionPet.current=queue;
  const resize=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(queue);
  const observed=new Set<Element>();
  for(const start of [anchor.current,composer])for(let node:Element|null=start??null;node&&node!==document.body;node=node.parentElement){if(!observed.has(node)){resize?.observe(node);observed.add(node);}}
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('blur',blur);
  window.addEventListener('storage',sync);window.addEventListener(positionEvent,sync);window.addEventListener('resize',queue);window.addEventListener('scroll',queue,{capture:true,passive:true});
  window.visualViewport?.addEventListener('resize',queue);window.visualViewport?.addEventListener('scroll',queue);document.addEventListener('transitionend',queue,true);
  place();
  return()=>{release();drag=undefined;resize?.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);repositionPet.current=()=>{};resetPosition.current=()=>{};beginDrag.current=()=>{};
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('blur',blur);
   window.removeEventListener('storage',sync);window.removeEventListener(positionEvent,sync);window.removeEventListener('resize',queue);window.removeEventListener('scroll',queue,true);
   window.visualViewport?.removeEventListener('resize',queue);window.visualViewport?.removeEventListener('scroll',queue);document.removeEventListener('transitionend',queue,true);
  };
 },[]);
 useLayoutEffect(()=>repositionPet.current(),[view.size]);
 useEffect(()=>{const p=library[character];if(!p||!canvas.current||!caption.current)return;const engine=new Player(canvas.current,character,p,caption.current,title=>{if(button.current)button.current.setAttribute('aria-label',`${names[character]}：${title}，拖动移动，右键调整宠物`);});player.current=engine;engine.setView(currentView.current);engine.update(latest.current);return()=>{engine.dispose();dismiss.current?.();};},[character]);
 useEffect(()=>player.current?.update(activity),[activity]);
 useEffect(()=>player.current?.setView(view),[view]);
 useEffect(()=>{
  const sync=()=>{const next=initialView();setView(old=>old.size===next.size&&old.quality===next.quality?old:next);};
  const resize=()=>player.current?.setView(currentView.current);
  window.addEventListener('storage',sync);window.addEventListener(viewEvent,sync);window.addEventListener('resize',resize);
  return()=>{window.removeEventListener('storage',sync);window.removeEventListener(viewEvent,sync);window.removeEventListener('resize',resize);};
 },[]);
 const changeView=(next:PetView)=>{const value=petView(next);setView(value);try{localStorage.setItem(viewKey,JSON.stringify(value));window.dispatchEvent(new Event(viewEvent));}catch{}};
 const menu=(e:React.MouseEvent|React.KeyboardEvent)=>{
  e.preventDefault();e.stopPropagation();dismiss.current?.();
  const panel=document.createElement('div');panel.setAttribute('role','menu');panel.setAttribute('aria-label','宠物、位置、大小与清晰度');
  Object.assign(panel.style,{position:'fixed',zIndex:'2147483000',width:'230px',maxHeight:'min(560px, calc(100vh - 16px))',overflowY:'auto',padding:'7px',borderRadius:'12px',background:'var(--background-elevated, #fff)',color:'var(--text-primary, #222)',border:'1px solid #ddd',boxShadow:'0 6px 24px #0002',font:'13px system-ui'});
  let detailObserver:MutationObserver|undefined;let positionFrame:number|undefined;let closed=false;const close=()=>{if(closed)return;closed=true;detailObserver?.disconnect();if(positionFrame!==undefined)cancelAnimationFrame(positionFrame);window.removeEventListener('resize',positionMenu);panel.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keyboard,true);};
  const outside=(event:Event)=>{if(!panel.contains(event.target as Node))close();};
  const positionMenu=()=>{if(closed||!button.current)return;const anchor=button.current.getBoundingClientRect(),bounds=panel.getBoundingClientRect(),above=anchor.top-bounds.height-6;const left=above>=8?anchor.right-bounds.width:anchor.left-bounds.width-10;panel.style.left=Math.max(8,Math.min(innerWidth-bounds.width-8,left))+'px';panel.style.top=Math.max(8,Math.min(innerHeight-bounds.height-8,above>=8?above:anchor.bottom-bounds.height))+'px';};
  const reposition=()=>{if(positionFrame!==undefined)cancelAnimationFrame(positionFrame);positionFrame=requestAnimationFrame(()=>{positionFrame=undefined;positionMenu();});};
  const items:HTMLButtonElement[]=[];const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();button.current?.focus();return;}
   if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)return;
   const at=items.indexOf(document.activeElement as HTMLButtonElement);
   if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
  };
  const add=(label:string,select:()=>void,disabled=false)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.disabled=disabled;b.setAttribute('role','menuitem');Object.assign(b.style,{display:'block',width:'100%',border:'0',borderRadius:'7px',padding:'8px 9px',textAlign:'left',background:'transparent',color:'inherit',cursor:disabled?'default':'pointer',opacity:disabled?'.45':'1'});b.onmouseenter=()=>b.style.background='#9992';b.onmouseleave=()=>b.style.background='transparent';b.onclick=()=>{select();close();};panel.append(b);if(!disabled)items.push(b);};
  const divider=()=>{const line=document.createElement('div');Object.assign(line.style,{height:'1px',background:'#8883',margin:'6px 3px'});line.setAttribute('role','separator');panel.append(line);};
  for(const c of Object.keys(library)as Character[])add(names[c]+(c===character?' ✓':''),()=>{setCharacter(c);try{localStorage.setItem(key,c);}catch{}});
  divider();
  add('重置位置 · 跟随输入框',()=>resetPosition.current());
  divider();
  const sizeLabel=document.createElement('label'),sizeTitle=document.createElement('span'),sizeValue=document.createElement('output'),size=document.createElement('input');
  Object.assign(sizeLabel.style,{display:'block',padding:'8px 9px'});Object.assign(sizeTitle.style,{display:'flex',justifyContent:'space-between',marginBottom:'11px'});sizeTitle.append('大小');sizeValue.value=view.size+'px';sizeTitle.append(sizeValue);
  size.type='range';size.min='80';size.max='224';size.step='1';size.value=String(view.size);size.setAttribute('aria-label','宠物大小');Object.assign(size.style,{display:'block',width:'100%',accentColor:'#d6653c',cursor:'pointer'});
  size.oninput=()=>{const value=Number(size.value);sizeValue.value=value+'px';changeView({...currentView.current,size:value});reposition();};sizeLabel.append(sizeTitle,size);panel.append(sizeLabel);
  const qualityLabel=document.createElement('label'),qualityTitle=document.createElement('span'),quality=document.createElement('select');
  Object.assign(qualityLabel.style,{display:'block',padding:'8px 9px'});qualityTitle.textContent='清晰度';Object.assign(qualityTitle.style,{display:'block',marginBottom:'7px'});
  for(const [value,title]of[['auto','自动 · 放大时提升'],['80','80px · 桌面像素'],['160','160px · 清晰'],['320','320px · 高清']]){const option=document.createElement('option');option.value=value;option.textContent=title;quality.append(option);}
  quality.value=character==='clawd'?'80':view.quality;quality.disabled=character==='clawd';quality.setAttribute('aria-label','宠物清晰度');Object.assign(quality.style,{width:'100%',padding:'6px',background:'transparent',color:'inherit',border:'1px solid #8885',borderRadius:'5px',font:'inherit'});quality.onchange=()=>changeView({...currentView.current,quality:quality.value as PetQuality});qualityLabel.append(qualityTitle,quality);panel.append(qualityLabel);
  const detail=document.createElement('div');detail.textContent=character==='clawd'?'Clawd 保留原版像素；大小可调。':`当前 ${canvas.current?.dataset.resolution??'80'}px · 自动模式随大小和屏幕精度调整。`;Object.assign(detail.style,{fontSize:'11px',lineHeight:'1.6',padding:'2px 9px 8px',opacity:'.7'});panel.append(detail);
  if(character!=='clawd'&&canvas.current){detailObserver=new MutationObserver(()=>{detail.textContent=`当前 ${canvas.current?.dataset.resolution??'80'}px · 自动模式随大小和屏幕精度调整。`;});detailObserver.observe(canvas.current,{attributes:true,attributeFilter:['data-resolution']});}
  divider();
  const actionLabel=document.createElement('label'),actions=document.createElement('select');Object.assign(actionLabel.style,{display:'block',padding:'8px 9px'});actionLabel.append('播放完整动作');
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择一个动作…';actions.append(placeholder);
  for(const [id,a]of Object.entries(library[character]!.animations)){const option=document.createElement('option');option.value=id;option.textContent=a.title+' · '+a.frames+' 帧';actions.append(option);}
  actions.disabled=activity.busy||!!activity.awaitingInput;actions.setAttribute('aria-label','播放完整动作');Object.assign(actions.style,{display:'block',width:'100%',marginTop:'7px',padding:'6px',background:'transparent',color:'inherit',border:'1px solid #8885',borderRadius:'5px',font:'inherit'});actions.onchange=()=>{if(actions.value)player.current?.preview(actions.value);};actionLabel.append(actions);panel.append(actionLabel);
  add('预览下一个动作',()=>player.current?.preview(),activity.busy||activity.awaitingInput);
  document.body.append(panel);positionMenu();window.addEventListener('resize',positionMenu);
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keyboard,true);dismiss.current=close;items[0]?.focus();
 };
 const size=view.size,scale=size/80;
 return <><div ref={anchor} data-pixel-agent-pet-anchor aria-hidden="true" style={{position:'absolute',right:8,bottom:`calc(100% - ${13*scale}px)`,width:size,height:size,pointerEvents:'none'}}/>{createPortal(<div ref={floating} data-pixel-agent-pet style={{position:'fixed',left:0,top:0,transform:'translate3d(0,0,0)',visibility:'hidden',width:size,height:size,pointerEvents:'none',zIndex:2147482000}}>
  <span ref={caption} aria-live="off" data-pet-caption style={{position:'absolute',right:0,bottom:74*scale,width:Math.max(180,size),textAlign:'right',whiteSpace:'nowrap',font:'600 10px/14px system-ui',color:'var(--text-secondary, #777)'}}/>
  <button ref={button} type="button" aria-label={names[character]+'，拖动移动，右键调整宠物'} data-pet-button onContextMenu={menu} onKeyDown={e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)menu(e);}} onPointerDown={e=>beginDrag.current(e)} onMouseDown={e=>e.preventDefault()} onClick={e=>{if(performance.now()<suppressClickUntil.current){e.preventDefault();return;}player.current?.preview();}}
   style={{position:'relative',display:'block',width:size,height:size,margin:0,border:0,padding:0,background:'transparent',pointerEvents:'auto',cursor:'grab',touchAction:'none'}}>
   <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',left:0,top:0,width:size,height:size,pointerEvents:'none',imageRendering:'pixelated',clipPath:`inset(0 0 ${13*scale}px 0)`}}/>
  </button>
 </div>,document.body)}</>;
}
