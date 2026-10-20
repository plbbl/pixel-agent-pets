import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';
test('website ships real full clips with lazy local file URLs, not the native 57-frame sampler',async()=>{
 const packs=JSON.parse(await fs.readFile('.generated/site-packs.json'));assert.equal(packs.claude.animations.special.frames,195);for(const [c,p]of Object.entries(packs))for(const [name,url]of Object.entries(p.urls)){assert.ok(url.startsWith('assets/'+c+'/'));assert.ok(!url.startsWith('data:'));await fs.access('site/'+url);}
 const html=await fs.readFile('site/index.html','utf8');assert.ok(html.includes('id="timeline"'));assert.ok(html.includes('id="action"'));
});
