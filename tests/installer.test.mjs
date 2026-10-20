import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installCodex,uninstallCodex,doctorCodexInstallation,installDSH,profileDirectory,packageName} from '../scripts/install-lib.mjs';
const root=process.cwd();
async function fixture(t,{sourceCopy=false}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-catalog-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const home=path.join(directory,'home');let repo=root;
 if(sourceCopy){repo=path.join(directory,'source');await fs.mkdir(repo);for(const folder of ['codex','codex-pixel'])await fs.cp(path.join(root,folder),path.join(repo,folder),{recursive:true});await fs.copyFile(path.join(root,'package.json'),path.join(repo,'package.json'));}
 return{directory,home,repo,backups:()=>fs.readdir(path.join(home,'pixel-agent-pets-backups'))};
}

test('identical verified Codex sources skip writes and backup growth while preserving unrelated pets',async t=>{
 const f=await fixture(t),other=path.join(f.home,'pets/someone-else');await fs.mkdir(other,{recursive:true});await fs.writeFile(path.join(other,'pet.json'),'{}');
 assert.equal((await installCodex(f.repo,f.home)).length,4);const file=path.join(f.home,'pets/pixel-agent-claude/pet.json'),before=(await fs.stat(file)).mtimeMs;
 const again=await installCodex(f.repo,f.home);assert.ok(again.every(pet=>pet.changed===false));assert.equal((await fs.stat(file)).mtimeMs,before);await assert.rejects(f.backups(),/ENOENT/);
 assert.equal((await uninstallCodex(f.home)).moved.length,4);assert.equal(await fs.readFile(path.join(other,'pet.json'),'utf8'),'{}');assert.equal((await uninstallCodex(f.home)).moved.length,0);
});

test('a changed source backs up only the replaced owned pet; a package version change alone adds no backup',async t=>{
 const f=await fixture(t,{sourceCopy:true});await installCodex(f.repo,f.home,{qualityChoices:true});
 const source=path.join(f.repo,'codex/claude/pet.json'),original=await fs.readFile(source),pet=JSON.parse(original);pet.displayName+=' updated';await fs.writeFile(source,JSON.stringify(pet));
 const changed=await installCodex(f.repo,f.home,{qualityChoices:true});assert.deepEqual(changed.filter(p=>p.changed).map(p=>p.id),['custom:pixel-agent-claude']);const backups=await f.backups();assert.equal(backups.length,1);assert.deepEqual(await fs.readdir(path.join(f.home,'pixel-agent-pets-backups',backups[0])),['pixel-agent-claude']);assert.deepEqual(await fs.readFile(path.join(f.home,'pixel-agent-pets-backups',backups[0],'pixel-agent-claude/pet.json')),original);
 const packageFile=path.join(f.repo,'package.json'),pkg=JSON.parse(await fs.readFile(packageFile));pkg.version='99.0.0';await fs.writeFile(packageFile,JSON.stringify(pkg));assert.ok((await installCodex(f.repo,f.home,{qualityChoices:true})).every(p=>!p.changed));assert.deepEqual(await f.backups(),backups);
});

test('late collisions and invalid source state metadata stop before installing any pet',async t=>{
 const f=await fixture(t,{sourceCopy:true}),collision=path.join(f.home,'pets/pixel-agent-gpt');await fs.mkdir(collision,{recursive:true});await fs.writeFile(path.join(collision,'pet.json'),'unrelated');
 await assert.rejects(installCodex(f.repo,f.home),/another pet/);await assert.rejects(fs.access(path.join(f.home,'pets/pixel-agent-claude')));assert.equal(await fs.readFile(path.join(collision,'pet.json'),'utf8'),'unrelated');
 await fs.rm(f.home,{recursive:true});const source=path.join(f.repo,'codex/clawd/.pixel-agent-export.json'),value=JSON.parse(await fs.readFile(source));value.layout.states=8;await fs.writeFile(source,JSON.stringify(value));
 await assert.rejects(installCodex(f.repo,f.home),/nine-state/);await assert.rejects(fs.access(f.home));
 for(const name of ['../web','/tmp','x/y','','web;touch'])assert.throws(()=>profileDirectory(f.home,name));
});

test('all seven quality choices remain official nine-state atlases, and doctor detects corruption without changing files',async t=>{
 const f=await fixture(t);assert.equal((await installCodex(f.repo,f.home,{qualityChoices:true})).length,7);let status=await doctorCodexInstallation(f.repo,f.home);
 assert.equal(status.ok,true);assert.equal(status.expectedPets,7);assert.equal(status.installedPets,7);assert.equal(status.states,9);assert.equal(status.frames,57);assert.equal(status.fullAnimations,false);assert.equal(status.runtimeVerified,false);
 for(const c of ['claude','gpt','deepseek']){const high=JSON.parse(await fs.readFile(path.join(f.home,'pets','pixel-agent-'+c,'.pixel-agent-export.json'))),low=JSON.parse(await fs.readFile(path.join(f.home,'pets','pixel-agent-'+c+'-pixel','.pixel-agent-export.json')));assert.equal(high.resolvedQuality,'hd');assert.equal(low.resolvedQuality,'pixel');}
 const file=path.join(f.home,'pets/pixel-agent-gpt/.pixel-agent-export.json'),metadata=JSON.parse(await fs.readFile(file));metadata.layout.frames=58;const broken=JSON.stringify(metadata);await fs.writeFile(file,broken);
 status=await doctorCodexInstallation(f.repo,f.home);assert.equal(status.ok,false);assert.equal(status.pets.find(p=>p.id==='custom:pixel-agent-gpt').valid,false);assert.equal(await fs.readFile(file,'utf8'),broken);assert.equal((await uninstallCodex(f.home)).moved.length,7);
});

test('ownership cannot be forged through a directory symlink, and uninstall leaves unrelated collisions untouched',async t=>{
 const f=await fixture(t),outside=path.join(f.directory,'outside'),link=path.join(f.home,'pets/pixel-agent-claude');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'.pixel-agent-pets.json'),JSON.stringify({package:packageName}));await fs.writeFile(path.join(outside,'keep'),'user data');await fs.mkdir(path.dirname(link),{recursive:true});await fs.symlink(outside,link);
 await assert.rejects(installCodex(f.repo,f.home),/another pet/);assert.equal((await uninstallCodex(f.home)).moved.length,0);assert.equal(await fs.readlink(link),outside);assert.equal(await fs.readFile(path.join(outside,'keep'),'utf8'),'user data');
});

test('DSH installer uses the official CLI and only appends its own bundle',async t=>{
 const f=await fixture(t),dir=profileDirectory(f.home,'web');await fs.mkdir(dir,{recursive:true});const original={name:'user-profile',private:true,dependencies:{original:'1'},dsh:{profile:{bundles:['official-base','official-web']}}},file=path.join(dir,'package.json');await fs.writeFile(file,JSON.stringify(original));await fs.writeFile(path.join(dir,'cordis.patch.yml'),'user-owned-policy');
 let called=false;const run=(bin,args,opts)=>{called=true;assert.equal(bin,process.env.PIXEL_PETS_DSH_BIN??'dsh');assert.equal(opts.shell,false);assert.deepEqual(args.slice(0,4),['plugin','--profile','web','add']);return{status:0};};
 await installDSH(f.repo,f.home,'web',{run});assert.ok(called);const installed=JSON.parse(await fs.readFile(file));assert.deepEqual(installed.dependencies,original.dependencies);assert.deepEqual(installed.dsh.profile.bundles,[...original.dsh.profile.bundles,packageName]);assert.equal(await fs.readFile(path.join(dir,'cordis.patch.yml'),'utf8'),'user-owned-policy');
});
