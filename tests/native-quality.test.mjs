import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PNG} from 'pngjs';
import {exportCodex,mappings} from '../scripts/codex-export.mjs';

async function fixture(t,{hd=true,level=320}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-native-quality-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const names=[...new Set(mappings.claude.map(x=>x[0]))],animations={};
 const low=new PNG({width:800,height:640});
 for(let n=0;n<80;n++)for(let y=40;y<65;y++)for(let x=25;x<55;x++){
  const at=((Math.floor(n/10)*80+y)*800+n%10*80+x)*4;
  low.data.set([30,180,60,255],at);
 }
 await fs.mkdir(path.join(root,'assets/claude'),{recursive:true});
 await fs.writeFile(path.join(root,'assets/claude/fixture.png'),PNG.sync.write(low));
 for(const name of names)animations[name]={file:'fixture.png',width:80,height:80,columns:10,frames:80,fps:20};
 const pack={name:'Fixture Claude',animations};
 if(hd){
  await fs.mkdir(path.join(root,'assets-hd/fixture'),{recursive:true});
  const image=new PNG({width:level*4,height:level*4}),ratio=level/80;
  for(let n=0;n<16;n++)for(let y=40*ratio;y<65*ratio;y++)for(let x=25*ratio;x<55*ratio;x++){
   const at=((Math.floor(n/4)*level+y)*image.width+n%4*level+x)*4;
   image.data.set([17,51,85,255],at);
  }
  // Two adjacent native pixels from direct HD detail, impossible in the old
  // 80px atlas's repeated 2×2 blocks.
  for(let n=0;n<16;n++)for(const [x,color]of [[30*ratio,[240,20,30,255]],[30.5*ratio,[10,60,240,255]]]){
   const at=((Math.floor(n/4)*level+50*ratio)*image.width+n%4*level+x)*4;
   image.data.set(color,at);
  }
  const encoded=PNG.sync.write(image),files=[];
  for(let i=0;i<5;i++){const file='fixture/'+level+'-'+i+'.png';files.push(file);await fs.writeFile(path.join(root,'assets-hd',file),encoded);}
  const variants={};for(const name of names)variants[name]={[level]:{width:level,height:level,columns:4,chunkFrames:16,frames:80,fps:20,files}};
  await fs.writeFile(path.join(root,'assets-hd/manifest.json'),JSON.stringify({version:1,characters:{claude:{animations:variants}}}));
 }
 return{root,pack};
}
async function result(root){return{image:PNG.sync.read(await fs.readFile(path.join(root,'codex/claude/spritesheet.png'))),report:JSON.parse(await fs.readFile(path.join(root,'codex/claude/.pixel-agent-export.json'))),metadata:JSON.parse(await fs.readFile(path.join(root,'codex/claude/pet.json')))}}
function pixel(image,x,y){return [...image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4)]}

test('auto native export uses actual 320px source detail in the existing official grid',async t=>{
 const{root,pack}=await fixture(t);await exportCodex(root,'claude',pack);
 const{image,report,metadata}=await result(root);
 assert.equal(image.width,1536);assert.equal(image.height,1872);
 assert.deepEqual(pixel(image,76,142),[240,20,30,255]);
 assert.deepEqual(pixel(image,77,142),[10,60,240,255]);
 assert.equal(report.resolvedQuality,'hd');assert.ok(Object.values(report.sourceResolutions).every(x=>x===320));
 assert.equal(report.layout.frames,57);assert.equal(report.layout.states,9);
 assert.deepEqual(Object.keys(metadata).sort(),['description','displayName','spriteVersionNumber','spritesheetPath']);
 // Fixed blank cells are still blank. No new native state or rendering code.
 assert.equal(pixel(image,7*192+96,150)[3],0);
});

test('pixel native export stays exact and independent of HD availability',async t=>{
 const{root,pack}=await fixture(t);await exportCodex(root,'claude',pack,{quality:'pixel'});
 const{image,report}=await result(root);
 assert.deepEqual(pixel(image,76,142),[30,180,60,255]);assert.deepEqual(pixel(image,77,142),[30,180,60,255]);
 assert.equal(report.requestedQuality,'pixel');assert.equal(report.resolvedQuality,'pixel');
});

test('auto falls back only when HD is absent; explicit hd reports unavailable sources',async t=>{
 const{root,pack}=await fixture(t,{hd:false});await exportCodex(root,'claude',pack);
 assert.equal((await result(root)).report.resolvedQuality,'pixel');
 await assert.rejects(()=>exportCodex(root,'claude',pack,{quality:'hd'}),/HD native source unavailable/);
 await assert.rejects(()=>exportCodex(root,'claude',pack,{quality:'unexpected'}),/Unknown native pet quality/);
});

test('native HD export supports the 160px variant and rejects unsafe paths',async t=>{
 const{root,pack}=await fixture(t,{level:160});await exportCodex(root,'claude',pack,{quality:'hd'});
 assert.equal((await result(root)).report.sourceResolutions.idle,160);
 const file=path.join(root,'assets-hd/manifest.json'),manifest=JSON.parse(await fs.readFile(file));
 manifest.characters.claude.animations.idle['160'].files[0]='../outside.png';
 await fs.writeFile(file,JSON.stringify(manifest));
 await assert.rejects(()=>exportCodex(root,'claude',pack,{quality:'hd'}),/Unsafe HD atlas path/);
});
