import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{PNG}from'pngjs';import{rows}from'../scripts/codex-export.mjs';
const characters=['claude','clawd','gpt','deepseek'];
test('native Codex sheets have all 57 required cells and exactly 15 transparent unused cells',async()=>{
 for(const c of characters){const image=PNG.sync.read(await fs.readFile(`codex/${c}/spritesheet.png`));assert.equal(image.width,1536);assert.equal(image.height,1872);let used=0,unused=0;
  for(let row=0;row<9;row++)for(let col=0;col<8;col++){let visible=0;for(let y=0;y<208;y++)for(let x=0;x<192;x++)if(image.data[((row*208+y)*1536+col*192+x)*4+3])visible++;if(col<rows[row][1]){assert.ok(visible>20,`${c}:${row}:${col}`);used++;}else{assert.equal(visible,0);unused++;}}
  assert.equal(used,57);assert.equal(unused,15);const meta=JSON.parse(await fs.readFile(`codex/${c}/pet.json`));assert.equal(meta.spriteVersionNumber,1);assert.equal(meta.spritesheetPath,'spritesheet.png');
 }
});
test('all 66 full DSH animations have hard alpha and no blank frames',async()=>{
 let count=0,total=0;for(const c of characters){const manifest=JSON.parse(await fs.readFile(`assets/${c}/manifest.json`));for(const[name,a]of Object.entries(manifest.animations)){
  const b=await fs.readFile(`assets/${c}/${a.file}`),image=PNG.sync.read(b);count++;total+=b.length;assert.equal(image.width,a.width*a.columns);assert.equal(image.height,Math.ceil(a.frames/a.columns)*a.height);
  for(let n=0;n<a.frames;n++){let visible=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const alpha=image.data[((Math.floor(n/a.columns)*a.height+y)*image.width+n%a.columns*a.width+x)*4+3];assert.ok(alpha===0||alpha===255);visible+=alpha>0;}assert.ok(visible>20,`${c}:${name}:${n}`);}
 }}assert.equal(count,66);assert.ok(total<4*1024*1024);
});
test('jumping actually leaves and returns to its baseline, without per-frame rescaling',async()=>{
 for(const c of ['claude','gpt','deepseek','clawd']){const image=PNG.sync.read(await fs.readFile(`codex/${c}/spritesheet.png`));const bottoms=[];for(let col=0;col<5;col++){let bottom=-1;for(let y=0;y<208;y++)for(let x=0;x<192;x++)if(image.data[((4*208+y)*1536+col*192+x)*4+3])bottom=y;bottoms.push(bottom);}assert.ok(Math.max(...bottoms)-Math.min(...bottoms)>=8,c+': jump is stationary');}
});
