import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import{installCodex,uninstallCodex,installDSH,profileDirectory,packageName}from'../scripts/install-lib.mjs';
test('Codex installation is idempotent, backs up old versions, and preserves unrelated pets',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-pets-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));
 await fs.mkdir(path.join(home,'pets','someone-else'),{recursive:true});await fs.writeFile(path.join(home,'pets','someone-else','pet.json'),'{}');
 assert.equal((await installCodex(process.cwd(),home)).length,4);assert.equal((await installCodex(process.cwd(),home)).length,4);
 const r=await uninstallCodex(home);assert.equal(r.moved.length,4);assert.equal(await fs.readFile(path.join(home,'pets','someone-else','pet.json'),'utf8'),'{}');
});
test('installer refuses unrelated collisions and traversal profile names',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-pets-collision-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));await fs.mkdir(path.join(home,'pets','pixel-agent-claude'),{recursive:true});await assert.rejects(installCodex(process.cwd(),home),/another pet/);for(const name of ['../web','/tmp','x/y','','web;touch'])assert.throws(()=>profileDirectory(home,name));
});
test('DSH installer uses the official CLI and only appends its own dependency and bundle',async t=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-dsh-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));const dir=profileDirectory(home,'web');await fs.mkdir(dir,{recursive:true});
 const original={name:'user-profile',private:true,dependencies:{original:'1'},dsh:{profile:{bundles:['official-base','official-web']}}};const file=path.join(dir,'package.json');await fs.writeFile(file,JSON.stringify(original));await fs.writeFile(path.join(dir,'cordis.patch.yml'),'user-owned-policy');
 let called=false;const run=(bin,args,opts)=>{called=true;assert.equal(bin,process.env.PIXEL_PETS_DSH_BIN??'dsh');assert.equal(opts.shell,false);assert.deepEqual(args.slice(0,4),['plugin','--profile','web','add']);return {status:0};};
 await installDSH(process.cwd(),home,'web',{run});assert.ok(called);const installed=JSON.parse(await fs.readFile(file));assert.deepEqual(installed.dependencies,original.dependencies);assert.deepEqual(installed.dsh.profile.bundles,[...original.dsh.profile.bundles,packageName]);assert.equal(await fs.readFile(path.join(dir,'cordis.patch.yml'),'utf8'),'user-owned-policy');
});
