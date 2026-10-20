import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{desktopPolicy}from'../scripts/build-desktop.mjs';
test('native full mode uses original animation files and complete frame counts for all four characters',async()=>{
 const policy=await desktopPolicy();let count=0;for(const c of Object.keys(policy.names)){
  const m=JSON.parse(await fs.readFile(`assets/${c}/manifest.json`));count+=Object.keys(m.animations).length;
  const actions=[...Object.values(policy.states[c]),...policy.idle[c],...policy.complete[c],policy.send[c],policy.error[c]];for(const a of actions)assert.ok(m.animations[a],c+':'+a);
 }assert.equal(count,66);const claude=JSON.parse(await fs.readFile('assets/claude/manifest.json'));assert.equal(claude.animations.special.frames,195);assert.equal(claude.animations.special.fps,20);
});
test('website ships real full clips with lazy local file URLs, not the native 57-frame sampler',async()=>{
 const packs=JSON.parse(await fs.readFile('.generated/site-packs.json'));assert.equal(packs.claude.animations.special.frames,195);for(const [c,p]of Object.entries(packs))for(const [name,url]of Object.entries(p.urls)){assert.ok(url.startsWith('assets/'+c+'/'));assert.ok(!url.startsWith('data:'));await fs.access('site/'+url);}
 const html=await fs.readFile('site/index.html','utf8');assert.ok(html.includes('id="timeline"'));assert.ok(html.includes('id="action"'));
});
