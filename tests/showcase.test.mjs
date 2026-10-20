import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('every custom animation has real 360p and 720p previews with complete source duration',async()=>{
 const media=JSON.parse(await fs.readFile('showcase/manifest.json'));let count=0;
 for(const c of ['claude','gpt','deepseek']){
  const {animations}=JSON.parse(await fs.readFile(`assets/${c}/manifest.json`));
  assert.deepEqual(Object.keys(media.characters[c]).sort(),Object.keys(animations).sort());
  for(const [name,a]of Object.entries(animations)){
   const clip=media.characters[c][name];count++;
   assert.ok(Math.abs(clip.duration-a.frames/a.fps)<.06,c+'/'+name);
   assert.equal(clip.width,Math.round(a.width/80*720));assert.equal(clip.height,720);
   assert.ok(clip.fps>=24);assert.match(clip.sourceSha256,/^[a-f0-9]{64}$/);
   for(const quality of ['360','720']){
    assert.equal(clip.sources[quality],`media/${c}/${name}-${quality}.mp4`);
    const bytes=await fs.readFile('showcase/'+clip.sources[quality].slice(6));
    assert.ok(bytes.length>1000);assert.ok(bytes.indexOf('moov')<bytes.indexOf('mdat'),'web video should start before download completes');
   }
  }
 }assert.equal(count,41);assert.equal(media.characters.claude.special.frames,585);
});
test('website brand uses the supplied dragon and HD media stays out of the desktop bundles',async()=>{
 assert.deepEqual(await fs.readFile('docs/media/baobaolong.png'),await fs.readFile('site/baobaolong.png'));
 for(const c of ['claude','gpt','deepseek'])await fs.access(`showcase/posters/${c}.png`);
 const html=await fs.readFile('site/index.html','utf8');assert.ok(html.includes('favicon.png'));assert.ok(html.includes('抱抱龙'));
 const build=await fs.readFile('scripts/build.mjs','utf8');assert.ok(!build.includes('showcase/'));
});
