import React,{useEffect,useRef,useState} from 'react';
import {Player} from './player';
import {names,type Activity,type Character,type Packs} from './policy';
import packs from '../.generated/packs.json';
const library=packs as Packs,key='pixel-agent-pets.character';
function initial():Character{try{const c=localStorage.getItem(key)as Character;return library[c]?c:'deepseek';}catch{return 'deepseek';}}
export function Pet({activity}:{activity:Activity}){
 const [character,setCharacter]=useState(initial),canvas=useRef<HTMLCanvasElement>(null),button=useRef<HTMLButtonElement>(null),caption=useRef<HTMLSpanElement>(null),player=useRef<Player>();
 const latest=useRef(activity);latest.current=activity;const dismiss=useRef<()=>void>();
 useEffect(()=>{const p=library[character];if(!p||!canvas.current||!caption.current)return;const engine=new Player(canvas.current,character,p,caption.current,title=>{if(button.current)button.current.setAttribute('aria-label',`${names[character]}：${title}，右键切换`);});player.current=engine;engine.update(latest.current);return()=>{engine.dispose();dismiss.current?.();};},[character]);
 useEffect(()=>player.current?.update(activity),[activity]);
 const menu=(e:React.MouseEvent|React.KeyboardEvent)=>{
  e.preventDefault();e.stopPropagation();dismiss.current?.();
  const panel=document.createElement('div'),anchor=button.current!.getBoundingClientRect();panel.setAttribute('role','menu');panel.setAttribute('aria-label','切换宠物');
  Object.assign(panel.style,{position:'fixed',zIndex:'2147483000',width:'184px',padding:'6px',borderRadius:'12px',background:'var(--background-elevated, #fff)',color:'var(--text-primary, #222)',border:'1px solid #ddd',boxShadow:'0 6px 24px #0002',font:'13px system-ui',left:Math.max(8,Math.min(innerWidth-200,anchor.right-184))+'px',top:Math.max(8,anchor.top-190)+'px'});
  let closed=false;const close=()=>{if(closed)return;closed=true;panel.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keyboard,true);};
  const outside=(event:Event)=>{if(!panel.contains(event.target as Node))close();};
  const items:HTMLButtonElement[]=[];const keyboard=(event:KeyboardEvent)=>{const at=items.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}};
  const add=(label:string,select:()=>void,disabled=false)=>{const b=document.createElement('button');b.textContent=label;b.type='button';b.disabled=disabled;b.setAttribute('role','menuitem');Object.assign(b.style,{display:'block',width:'100%',border:'0',borderRadius:'7px',padding:'9px',textAlign:'left',background:'transparent',color:'inherit',cursor:disabled?'default':'pointer',opacity:disabled?'.45':'1'});b.onmouseenter=()=>b.style.background='#9992';b.onmouseleave=()=>b.style.background='transparent';b.onclick=()=>{select();close();};panel.append(b);if(!disabled)items.push(b);};
  for(const c of Object.keys(library)as Character[])add(names[c]+(c===character?' ✓':''),()=>{setCharacter(c);try{localStorage.setItem(key,c);}catch{}});
  add('预览下一个动作',()=>player.current?.preview(),activity.busy||activity.awaitingInput);
  document.body.append(panel);document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keyboard,true);dismiss.current=close;items[0]?.focus();
 };
 return <div data-pixel-agent-pet style={{position:'absolute',right:8,bottom:'calc(100% - 13px)',width:80,height:80,pointerEvents:'none',zIndex:30}}>
  <span ref={caption} aria-live="off" data-pet-caption style={{position:'absolute',right:0,bottom:74,width:180,textAlign:'right',whiteSpace:'nowrap',font:'600 10px/14px system-ui',color:'var(--text-secondary, #777)'}}/>
  <button ref={button} type="button" aria-label={names[character]+'，右键切换宠物'} data-pet-button onContextMenu={menu} onKeyDown={e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey)menu(e);}} onMouseDown={e=>e.preventDefault()} onClick={()=>player.current?.preview()}
   style={{position:'relative',display:'block',width:80,height:80,margin:0,border:0,padding:0,background:'transparent',pointerEvents:'auto',cursor:'default'}}>
   <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',left:0,top:0,width:80,height:80,imageRendering:'pixelated',clipPath:'inset(0 0 13px 0)'}}/>
  </button>
 </div>;
}
