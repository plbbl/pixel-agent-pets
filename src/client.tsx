import React from 'react';
import {Pet} from './pet';
import {activityFromDSH,activityWithDSHInput} from './policy';
export const inject=['slots'];
function Companion({useSession,useInput}:any){
 // Stable JSON scalar avoids rerendering the pet for every generated token.
 const facts=useSession((s:any)=>JSON.stringify(activityFromDSH(s)));
 const input=useInput((s:any)=>JSON.stringify({chineseDraft:/[\u3400-\u9fff]/u.test(s.draft),phase:s.phase,queued:(s.queue??[]).some((row:any)=>row.placement==='queued')}));
 return <Pet activity={activityWithDSHInput(JSON.parse(facts),JSON.parse(input))}/>;
}
function HeroCompanion({useSessions}:any){
 const selected=useSessions((s:any)=>!!s.current);
 return selected?null:<div style={{position:'fixed',right:24,bottom:28,width:80,height:0,pointerEvents:'none'}}><Pet activity={{busy:false,phase:'thinking'}}/></div>;
}
export function apply(ctx:any){
 const conversation=ctx.slots.inject('conversation.input.overlay',()=>ctx.slots.register({name:'conversation.input.overlay',id:'pixel-agent-pets',order:90},Companion));
 const hero=ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'pixel-agent-pets-hero',order:90},HeroCompanion));
 return()=>{conversation();hero();};
}
