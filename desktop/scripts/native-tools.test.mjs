import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {validateSmoke} from './smoke.mjs';
import {packageArtifacts} from './package-artifacts.mjs';
test('native smoke evidence requires real frames for every pet and quality',()=>{
 const checks=['claude','gpt','deepseek','clawd'].flatMap(character=>['auto','80','160','320'].map(quality=>({character,quality,drawnPixels:100})));
 const report={ok:true,frontendReady:true,frameDrawn:true,drawnPixels:100,characters:4,animations:66,checks};assert.equal(validateSmoke(report),report);
 assert.throws(()=>validateSmoke({...report,drawnPixels:0}),/nonblank/);assert.throws(()=>validateSmoke({...report,checks:checks.filter(c=>c.character!=='gpt')}),/every character/);
});
test('native download filenames and checksums are stable on both target operating systems',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pet-native-artifacts-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 for(const[platform,arch,input,expected]of[['darwin','arm64','抱抱龙桌宠_0.4.0_aarch64.dmg','Pixel-Agent-Pets-macOS-arm64.dmg'],['win32','x64','抱抱龙桌宠_0.4.0_x64-setup.exe','Pixel-Agent-Pets-Windows-x64-setup.exe']]){
  const source=path.join(temp,platform,'bundle'),output=path.join(temp,platform,'out'),bytes=Buffer.from('verified fixture '+platform);await fs.mkdir(source,{recursive:true});await fs.writeFile(path.join(source,input),bytes);
  const result=await packageArtifacts({platform,arch,source,output});assert.equal(result.filename,expected);assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(await fs.readFile(result.path),bytes);assert.equal(await fs.readFile(result.path+'.sha256','utf8'),result.sha256+'  '+expected+'\n');
 }
});
