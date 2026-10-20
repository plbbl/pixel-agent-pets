export type Character='claude'|'gpt'|'deepseek'|'clawd';
export type Phase='sending'|'preparing'|'thinking'|'responding'|'tools'|'retrying'|'stopping';
export type Activity={busy:boolean;phase:Phase;awaitingInput?:boolean;tool?:string;toolId?:string;errorId?:string;turnId?:string;chineseDraft?:boolean};
export type Animation={title:string;file:string;width:number;height:number;columns:number;frames:number;fps:number;poster:number;sustain?:number;captions?:{start:number;end:number;text:string}[]};
export type Pack={name:string;animations:Record<string,Animation>;urls:Record<string,string>};
export type Packs=Partial<Record<Character,Pack>>;
export const names:Record<Character,string>={claude:'像素 Claude',gpt:'像素 GPT',deepseek:'像素 DeepSeek',clawd:'原版 Clawd'};
export function toolAction(c:Character,name='',n=0){
 const read=/^(read|view_file|cat|search|grep|find|glob|list|ls)/i.test(name);
 if(c==='clawd')return read?'Laptop':/run|bash|shell|exec/i.test(name)?'Desktop':'Pointing';
 if(c==='gpt')return read?'snapshot':/^(write|edit|replace)/i.test(name)?'typing':['probe','gate','smoke','matrix'][n%4];
 return read?(c==='claude'?'reading':'thinking'):'typing';
}
export function baseAction(c:Character,s:Activity,ms:number,tool:string){
 if(s.phase==='stopping'&&s.busy)return c==='clawd'?'Turning':c==='claude'?'stopped':'error';
 if(s.awaitingInput)return c==='clawd'?'Pointing':c==='claude'?'pointing':c==='gpt'?'gate':'hungry';
 if(!s.busy)return c==='clawd'?'LookingAroundEyesOnly':'idle';
 if(s.phase==='tools')return tool;
 if(s.phase==='responding')return c==='clawd'?'Laptop':c==='deepseek'?'fast':'typing';
 if(s.phase==='sending')return c==='clawd'?'Running':c==='claude'?'sending':c==='gpt'?'wave':'fast';
 if(s.phase==='retrying')return c==='clawd'?'Dizzy':c==='claude'?'confused':c==='gpt'?'probe':'empty';
 return c==='clawd'?'Thinking':ms>=12000?(c==='gpt'?'matrix':c==='deepseek'?'chain':'thinking'):'thinking';
}
export const idleActions:Record<Character,string[]>={
 claude:['idle','confused','reading','thinking','dance'],
 deepseek:['rice','hungry','pile','steal','riceHappy','empty','dance','sleep'],
 gpt:['idle','wave','probe','snapshot','gate','smoke','matrix','ready','idea','sleep'],
 clawd:['LookingAround','LookingAroundEyesOnly','Swaying','Walking','CrabWalking','Jumping','Hula','BreakDancing','Waving','Confetti','DancingHappy','Desktop','Disappointed','Dizzy','Excited','Facepalm','JumpingHappy','Laptop','Lightbulb','Meditating','Pointing','Running','Spark','Thinking','Turning']
};
export function frameAt(a:Animation,ms:number,hold:boolean){const n=Math.max(0,Math.floor(ms*a.fps/1000));return hold?Math.min(n,a.sustain??a.frames-1):n<a.frames?n:null;}
export function captionAt(c:Character,action:string,ms:number,a:Animation){
 if(c==='gpt')return ({probe:'先打个探针……',snapshot:'先留个快照……',gate:'检查89道门禁……',smoke:'先跑个冒烟……',matrix:'补个验收矩阵……',ready:ms<2000?'可以开始了。':'先确认一下……',idea:'你说得对。'}as Record<string,string>)[action]??'';
 if(c==='deepseek')return ({rice:'吃大米饭……',hungry:'正在想办法吃大米饭……',pile:'吃大米饭……',riceHappy:'开饭！',steal:'正在想办法偷懒……',sleep:'晕碳ing……',chain:'正在生成长雷霆思维链……',empty:'饭呢……',fast:'嗖——'}as Record<string,string>)[action]??'';
 return a.captions?.find(t=>ms>=t.start*1000&&ms<t.end*1000)?.text??'';
}
/** Select only public activity facts, never persist or forward conversation text. */
export function activityFromDSH(s:any):Activity{
 if(!s)return {busy:false,phase:'thinking'};
 const calls=s.runningCalls??s.chat?.legacy?.runningCalls??[],tool=calls.at(-1),partial=s.partial??s.chat?.legacy?.partial;
 const blocks=partial?.blocks??[],last=blocks.at(-1);
 const pending=(s.pending??[]).some((p:any)=>!['resolved','cancelled','done'].includes(p.status));
 const lastNode=(s.nodes??s.chat?.legacy?.nodes)?.at(-1),failed=lastNode&&/error|failure/.test(lastNode.kind??lastNode.type??'');
 const retry=lastNode?.kind==='model-retry'&&lastNode.retryState==='scheduled';
 const timeline=s.chat?.timeline,latestTurn=timeline?.turns?.get(timeline.turnOrder?.at(-1)),end=latestTurn?.end?.data?.reason?.kind;
 const frozen=lastNode?.kind==='assistant'&&lastNode.interrupted===true&&(latestTurn==null||lastNode.turn===latestTurn.turn);
 const stopped=!s.running&&(end===undefined?frozen:end==='aborted');
 const turn=tool?.turn??partial?.turn??latestTurn?.turn??lastNode?.turn;
 const errorId=s.running?undefined:failed?String(lastNode.id??lastNode.key??lastNode.seq??'failure'):s.promptError?'prompt:'+s.promptError.op+':'+(s.promptError.error?.code??'error'):s.openError?'open-error':s.lastAgentError?'agent-error':undefined;
 return {busy:!!s.running||retry,phase:stopped?'stopping':tool?'tools':retry?'retrying':last?.kind==='text'?'responding':'thinking',awaitingInput:pending,tool:tool?.name,toolId:tool?.callId,turnId:turn==null?undefined:String(turn),errorId};
}
/** rc.6 exposes submitting for claimed commands; plain text keeps phase=plain. */
export function activityWithDSHInput(activity:Activity,input:{phase?:string;queued?:boolean;chineseDraft?:boolean}):Activity{
 const sending=input.phase==='submitting'&&!input.queued&&!activity.busy&&!activity.awaitingInput&&activity.phase!=='tools';
 return {...activity,...sending?{busy:true,phase:'sending' as const,errorId:undefined}:{},chineseDraft:!!input.chineseDraft};
}
