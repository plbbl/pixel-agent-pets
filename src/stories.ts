import type {Animation,Character,Pack} from './policy';

export type StoryStep={action:string;caption?:string};
export type SignatureStory={id:string;title:string;character:Character;steps:readonly StoryStep[]};
export type StoryStepTiming=StoryStep&{index:number;startMs:number;endMs:number;startFrame:number;frames:number;fps:number};
export type StoryTimeline={story:SignatureStory;steps:StoryStepTiming[];durationMs:number;frames:number;fps:number};
export type StoryPosition={step:StoryStepTiming;index:number;action:string;localMs:number;frame:number;globalFrame:number;ended:boolean};

export const signatureStories:Record<Character,SignatureStory>={
 claude:{id:'claude-classic',title:'中文？中国人？完整中文彩蛋',character:'claude',steps:[{action:'special'}]},
 gpt:{id:'gpt-classic',title:'先走完流程，再真正开工',character:'gpt',steps:[
  {action:'probe',caption:'先打个探针……'},{action:'gate',caption:'检查89道门禁……'},
  {action:'smoke',caption:'先跑个冒烟……'},{action:'matrix',caption:'补个验收矩阵……'},{action:'typing',caption:'终于开工。'},
 ]},
 deepseek:{id:'deepseek-classic',title:'没饭、讨饭、吃饭、偷饭、晕碳',character:'deepseek',steps:[
  {action:'empty',caption:'饭呢……'},{action:'hungry',caption:'正在想办法吃大米饭……'},
  {action:'rice',caption:'吃大米饭……'},{action:'steal',caption:'正在想办法偷饭……'},{action:'sleep',caption:'晕碳ing……'},
 ]},
 clawd:{id:'clawd-library',title:'原版 Clawd · 25 套完整动作',character:'clawd',steps:[
  'LookingAroundEyesOnly','LookingAround','Thinking','Laptop','Desktop','Running','Walking','CrabWalking',
  'Turning','Waving','Pointing','Lightbulb','Meditating','Excited','Jumping','JumpingHappy','Confetti',
  'DancingHappy','BreakDancing','Hula','Swaying','Spark','Disappointed','Dizzy','Facepalm',
 ].map(action=>({action}))},
};
export function signatureStory(character:Character):SignatureStory{return signatureStories[character];}
/** Full authored clips only: no sustain frame, sampling, trimming or synthetic hold. */
export function storyTimeline(story:SignatureStory,pack:Pick<Pack,'animations'>):StoryTimeline{
 let durationMs=0,frames=0;
 const steps=story.steps.map((step,index)=>{
  const a=pack.animations[step.action];
  if(!a||!Number.isInteger(a.frames)||a.frames<1||!Number.isFinite(a.fps)||a.fps<=0)throw Error('Invalid full story clip: '+story.character+'/'+step.action);
  const timing={...step,index,startMs:durationMs,endMs:durationMs+a.frames/a.fps*1000,startFrame:frames,frames:a.frames,fps:a.fps};
  durationMs=timing.endMs;frames+=a.frames;return timing;
 });
 if(!steps.length)throw Error('A story needs at least one full clip');
 return{story,steps,durationMs,frames,fps:steps[0].fps};
}
export function storyAt(timeline:StoryTimeline,elapsedMs:number):StoryPosition{
 const time=Math.max(0,Number.isFinite(elapsedMs)?elapsedMs:0),ended=time>=timeline.durationMs;
 const step=timeline.steps.find(step=>time<step.endMs)??timeline.steps.at(-1)!;
 const localMs=Math.max(0,Math.min(step.endMs-step.startMs,time-step.startMs));
 const frame=Math.min(step.frames-1,Math.floor(localMs*step.fps/1000));
 return{step,index:step.index,action:step.action,localMs,frame,globalFrame:step.startFrame+frame,ended};
}
export function storyCaption(step:StoryStep,animation:Animation,localMs:number):string{
 return step.caption??animation.captions?.find(item=>localMs>=item.start*1000&&localMs<item.end*1000)?.text??'';
}
