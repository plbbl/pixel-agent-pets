import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/stories.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const s=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const packs={},hd=JSON.parse(await fs.readFile('assets-hd/manifest.json','utf8'));
for(const c of ['claude','gpt','deepseek','clawd'])packs[c]=JSON.parse(await fs.readFile('assets/'+c+'/manifest.json','utf8'));
test('classic stories contain the exact requested full clips in order',()=>{
 const expected={claude:['special'],gpt:['probe','gate','smoke','matrix','typing'],deepseek:['empty','hungry','rice','steal','sleep']};
 for(const [c,actions]of Object.entries(expected))assert.deepEqual(s.signatureStory(c).steps.map(x=>x.action),actions);
 assert.equal(s.storyTimeline(s.signatureStory('claude'),packs.claude).frames,195);
 assert.equal(s.storyTimeline(s.signatureStory('gpt'),packs.gpt).frames,520);
 assert.equal(s.storyTimeline(s.signatureStory('deepseek'),packs.deepseek).frames,400);
 assert.deepEqual(new Set(s.signatureStory('clawd').steps.map(x=>x.action)),new Set(Object.keys(packs.clawd.animations)));
});
test('timeline visits every full frame without sustain, trimming or premature next clip',()=>{
 for(const c of Object.keys(packs)){
  const t=s.storyTimeline(s.signatureStory(c),packs[c]);let expectedFrame=0;
  for(const step of t.steps){const a=packs[c].animations[step.action];assert.equal(step.frames,a.frames);assert.equal(step.fps,a.fps);
   for(let n=0;n<a.frames;n++){const p=s.storyAt(t,step.startMs+(n+.001)/a.fps*1000);assert.equal(p.action,step.action);assert.equal(p.frame,n);assert.equal(p.globalFrame,expectedFrame++);}
   if(step.index<t.steps.length-1)assert.equal(s.storyAt(t,step.endMs).action,t.steps[step.index+1].action);
  }
  const end=s.storyAt(t,t.durationMs);assert.equal(end.ended,true);assert.equal(end.globalFrame,t.frames-1);
 }
});
test('all advertised HD story segments are actual160/320 sources with complete frames',()=>{
 for(const c of ['claude','gpt','deepseek'])for(const step of s.signatureStory(c).steps){const a=packs[c].animations[step.action];for(const level of ['160','320']){const v=hd.characters[c].animations[step.action][level];assert.equal(v.height,Number(level));assert.equal(v.frames,a.frames);assert.equal(v.fps,a.fps);assert.equal(v.files.length,Math.ceil(a.frames/v.chunkFrames));assert.ok(v.width>=Number(level));}}
});
test('captions are presentation-only, authored Claude timing and final work/sleep labels survive',()=>{
 const claude=packs.claude.animations.special;assert.equal(s.storyCaption({action:'special'},claude,1400),'中文？');assert.equal(s.storyCaption({action:'special'},claude,2200),'中国人？');assert.equal(s.storyCaption({action:'special'},claude,5000),'检测到中国用户');assert.equal(s.storyCaption({action:'special'},claude,9000),'your account is on hold');
 assert.equal(s.signatureStory('gpt').steps.at(-1).caption,'终于开工。');assert.equal(s.signatureStory('deepseek').steps.at(-1).caption,'晕碳ing……');
});
