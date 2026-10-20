import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {discoverDSHProfiles,selectDSHProfile,verifyPrebuiltDSHPackage,doctorDSHInstallation,easyInstallDSH,easyUninstallDSH} from '../scripts/easy-install-dsh.mjs';
import {packageName} from '../scripts/install-lib.mjs';

async function fixture(t){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'baobaolong-easy-dsh-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const repo=path.join(temp,'prebuilt'),home=path.join(temp,'dsh-home');await fs.mkdir(repo,{recursive:true});
 await fs.writeFile(path.join(repo,'package.json'),JSON.stringify({name:packageName,version:'test'}));
 for(const file of ['dist/client.js','dist/index.js','scripts/hd-asset-route.mjs','scripts/dsh-activity-bridge.mjs','cordis.patch.yml']){await fs.mkdir(path.dirname(path.join(repo,file)),{recursive:true});await fs.writeFile(path.join(repo,file),'prebuilt');}
 await fs.mkdir(path.join(repo,'assets-hd/claude/idle'),{recursive:true});
 await fs.writeFile(path.join(repo,'assets-hd/claude/idle/320-0.png'),'fixture PNG');
 await fs.writeFile(path.join(repo,'assets-hd/manifest.json'),JSON.stringify({version:1,characters:{claude:{animations:{idle:{'320':{files:['claude/idle/320-0.png']}}}}}}));
 async function profile(name,kind='web'){
  const dir=path.join(home,'profiles',name);await fs.mkdir(dir,{recursive:true});
  const value={name:'user-profile',private:true,dependencies:{'other-plugin':'1.0.0'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base',kind==='headless'?'@deepseek-ai/dsh-headless':'@deepseek-ai/dsh-web-app','other-plugin'],custom:{keep:true}}}};
  await fs.writeFile(path.join(dir,'package.json'),JSON.stringify(value));await fs.writeFile(path.join(dir,'cordis.patch.yml'),'private-user-policy');await fs.writeFile(path.join(dir,'pnpm-lock.yaml'),'old-lockfile');return{dir,value};
 }
 const calls=[];
 function run(bin,args,options){
  calls.push({bin,args,options});if(args[0]==='--version')return{status:0,stdout:'0.1.0-rc.6'};
  assert.deepEqual(args.slice(0,2),['plugin','--profile']);assert.ok(['add','remove'].includes(args[3]));assert.equal(options.shell,false);assert.equal(options.stdio,'pipe');
  assert.equal(options.env.DSH_HOME,home);return{status:0};
 }
 // installDSH invokes a synchronous host CLI. This mock performs only the same
 // package-link mutation in the isolated temporary profile, without a live DSH.
 const officialRun=(bin,args,options)=>{
  const result=run(bin,args,options);if(args[0]==='--version')return result;
  const dir=path.join(home,'profiles',args[2]);
  const command=`import fs from'node:fs';import path from'node:path';const dir=process.argv[1],repo=process.argv[2],name=process.argv[3],action=process.argv[4];const p=path.join(dir,'package.json'),j=JSON.parse(fs.readFileSync(p));if(action==='remove'){for(const key of['dependencies','devDependencies','optionalDependencies'])if(j[key])delete j[key][name];fs.rmSync(path.join(dir,'node_modules',name),{recursive:true,force:true});}else{j.dependencies[name]='link:'+repo;fs.mkdirSync(path.join(dir,'node_modules'),{recursive:true});try{fs.symlinkSync(repo,path.join(dir,'node_modules',name),'dir')}catch(e){if(e.code!=='EEXIST')throw e;}}fs.writeFileSync(p,JSON.stringify(j));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',command,dir,repo,packageName,args[3]],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);return result;
 };
 return{temp,repo,home,profile,calls,run:officialRun};
}
// Built-in subprocess only; never resolves or starts the real official DSH.
import {spawnSync} from 'node:child_process';

test('profile discovery selects one existing UI profile without guessing names and excludes known headless',async t=>{
 const f=await fixture(t);await f.profile('my-desk');await f.profile('headless','headless');await fs.mkdir(path.join(f.home,'profiles','node_modules'),{recursive:true});
 const profiles=await discoverDSHProfiles(f.home);assert.deepEqual(profiles.map(p=>p.name),['headless','my-desk']);assert.equal(await selectDSHProfile(profiles), 'my-desk');
 await assert.rejects(()=>selectDSHProfile(profiles,{profile:'headless'}),/终端/);
 await assert.rejects(()=>selectDSHProfile(profiles,{profile:'../my-desk'}),/Invalid DSH profile/);
});

test('multiple UI profiles require an explicit choice, and noninteractive installs never guess',async t=>{
 const f=await fixture(t);await f.profile('work');await f.profile('personal');const profiles=await discoverDSHProfiles(f.home);
 await assert.rejects(()=>selectDSHProfile(profiles),/多个/);
 assert.equal(await selectDSHProfile(profiles,{interactive:true,choose:async options=>{assert.deepEqual(options.map(x=>x.name),['personal','work']);return'work';}}),'work');
 assert.equal(await selectDSHProfile(profiles,{profile:'personal'}),'personal');
 await assert.rejects(()=>selectDSHProfile(profiles,{interactive:true,choose:async()=>'/tmp'}),/未选择/);
});

test('prebuilt installer needs no build dependencies, adds one plugin and is idempotent with recoverable backups',async t=>{
 const f=await fixture(t),p=await f.profile('desk');assert.equal(await fs.stat(path.join(f.repo,'node_modules')).catch(()=>null),null);
 assert.equal((await verifyPrebuiltDSHPackage(f.repo)).prebuilt,true);
 const result=await easyInstallDSH({repo:f.repo,dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});
 assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(result.runtimeVerified,false);
 const pkg=JSON.parse(await fs.readFile(path.join(p.dir,'package.json')));assert.equal(pkg.dependencies['other-plugin'],'1.0.0');assert.deepEqual(pkg.dsh.profile.bundles,[...p.value.dsh.profile.bundles,packageName]);assert.deepEqual(pkg.dsh.profile.custom,{keep:true});assert.equal(await fs.readFile(path.join(p.dir,'cordis.patch.yml'),'utf8'),'private-user-policy');
 assert.equal((await doctorDSHInstallation(f.repo,f.home,'desk')).ok,true);
 const adds=f.calls.filter(c=>c.args[0]==='plugin').length,before=await fs.readdir(path.join(f.home,'pixel-agent-pets-backups'));
 const again=await easyInstallDSH({repo:f.repo,dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});assert.equal(again.changed,false);assert.equal(f.calls.filter(c=>c.args[0]==='plugin').length,adds);assert.deepEqual(await fs.readdir(path.join(f.home,'pixel-agent-pets-backups')),before);
});

test('a CLI step changing an unrelated plugin or policy is rejected and original config is restored',async t=>{
 const f=await fixture(t),p=await f.profile('desk'),original=await fs.readFile(path.join(p.dir,'package.json'),'utf8');
 const run=(bin,args,options)=>{const result=f.run(bin,args,options);if(args[0]==='plugin'){const command="import fs from'node:fs';const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p));j.dependencies['other-plugin']='999';fs.writeFileSync(p,JSON.stringify(j));fs.writeFileSync(process.argv[2],'changed')";assert.equal(spawnSync(process.execPath,['--input-type=module','-e',command,path.join(p.dir,'package.json'),path.join(p.dir,'cordis.patch.yml')]).status,0);}return result;};
 await assert.rejects(()=>easyInstallDSH({repo:f.repo,dshHome:f.home,run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}}),/配置已从备份恢复/);
 assert.equal(await fs.readFile(path.join(p.dir,'package.json'),'utf8'),original);assert.equal(await fs.readFile(path.join(p.dir,'cordis.patch.yml'),'utf8'),'private-user-policy');
 assert.equal((await doctorDSHInstallation(f.repo,f.home,'desk')).enabled,false);
});

test('missing prebuilt files or ambiguous profile stops before plugin installation without exposing private config',async t=>{
 const f=await fixture(t);await f.profile('one');await f.profile('two');let calls=0;
 await assert.rejects(()=>easyInstallDSH({repo:f.repo,dshHome:f.home,run:()=>{calls++;return{status:0};}}),/多个/);assert.equal(calls,0);
 await fs.unlink(path.join(f.repo,'dist/client.js'));
 await assert.rejects(()=>easyInstallDSH({repo:f.repo,dshHome:f.home,profile:'one',run:()=>{calls++;return{status:0};}}),/缺少已构建文件/);assert.equal(calls,0);
});

test('failed official CLI output is kept private and profile files remain unchanged',async t=>{
 const f=await fixture(t),p=await f.profile('desk'),before=await fs.readFile(path.join(p.dir,'package.json'),'utf8'),logs=[];
 const run=(_bin,args)=>args[0]==='--version'?{status:0}:{status:1,stdout:'SENSITIVE_CONFIG',stderr:'PRIVATE_KEY'};
 let failure;try{await easyInstallDSH({repo:f.repo,dshHome:f.home,run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'},log:m=>logs.push(m)});}catch(error){failure=error;}
 assert.ok(failure);assert.ok(!failure.message.includes('PRIVATE_KEY'));assert.ok(!logs.join('').includes('SENSITIVE_CONFIG'));assert.equal(await fs.readFile(path.join(p.dir,'package.json'),'utf8'),before);
});

test('easy uninstall removes only this plugin through the located official CLI, backs up and is idempotent without payload or CLI',async t=>{
 const f=await fixture(t),p=await f.profile('desk');await easyInstallDSH({payloadRoot:f.repo,dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});
 const logs=[],result=await easyUninstallDSH({dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'},log:message=>logs.push(message)});
 assert.deepEqual(result,{profile:'desk',removed:true,backupCreated:true});assert.equal(f.calls.at(-1).args[3],'remove');assert.equal(f.calls.at(-1).bin,'fixture-dsh');
 const pkg=JSON.parse(await fs.readFile(path.join(p.dir,'package.json')));assert.deepEqual(pkg,p.value);assert.equal(await fs.readFile(path.join(p.dir,'cordis.patch.yml'),'utf8'),'private-user-policy');assert.ok(logs.some(message=>message.includes('移除')));
 const backups=await fs.readdir(path.join(f.home,'pixel-agent-pets-backups'));let calls=0;
 await fs.rm(f.repo,{recursive:true,force:true});assert.deepEqual(await easyUninstallDSH({payloadRoot:f.repo,dshHome:f.home,run:()=>{calls++;throw Error('CLI unavailable');}}),{profile:'desk',removed:false,backupCreated:false});assert.equal(calls,0);assert.deepEqual(await fs.readdir(path.join(f.home,'pixel-agent-pets-backups')),backups);
});

test('uninstall rejects unrelated plugin or policy changes and restores the full config backup',async t=>{
 const f=await fixture(t),p=await f.profile('desk');await easyInstallDSH({repo:f.repo,dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});const before=await fs.readFile(path.join(p.dir,'package.json'),'utf8');
 const run=(bin,args,options)=>{const result=f.run(bin,args,options);if(args[3]==='remove'){const command="import fs from'node:fs';const p=process.argv[1],j=JSON.parse(fs.readFileSync(p));delete j.dependencies['other-plugin'];fs.writeFileSync(p,JSON.stringify(j));fs.writeFileSync(process.argv[2],'changed');";assert.equal(spawnSync(process.execPath,['--input-type=module','-e',command,path.join(p.dir,'package.json'),path.join(p.dir,'cordis.patch.yml')]).status,0);}return result;};
 await assert.rejects(()=>easyUninstallDSH({dshHome:f.home,run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}}),/卸载未完成，原 profile 配置已从备份恢复/);
 assert.equal(await fs.readFile(path.join(p.dir,'package.json'),'utf8'),before);assert.equal(await fs.readFile(path.join(p.dir,'cordis.patch.yml'),'utf8'),'private-user-policy');assert.equal(await fs.readFile(path.join(p.dir,'pnpm-lock.yaml'),'utf8'),'old-lockfile');
});

test('uninstall failure captures private CLI diagnostics and restores its pre-command bundle removal',async t=>{
 const f=await fixture(t),p=await f.profile('desk');await easyInstallDSH({repo:f.repo,dshHome:f.home,run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});const before=await fs.readFile(path.join(p.dir,'package.json'),'utf8'),logs=[];
 const run=(_bin,args,options)=>{assert.equal(options.stdio,'pipe');return args[0]==='--version'?{status:0}:{status:1,stdout:'SENSITIVE_CONFIG',stderr:'PRIVATE_KEY'};};
 let failure;try{await easyUninstallDSH({dshHome:f.home,run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'},log:message=>logs.push(message)});}catch(error){failure=error;}
 assert.match(failure.message,/卸载未完成/);assert.ok(!failure.message.includes('PRIVATE_KEY'));assert.ok(!logs.join('').includes('SENSITIVE_CONFIG'));assert.equal(await fs.readFile(path.join(p.dir,'package.json'),'utf8'),before);
});

test('ambiguous uninstall profiles require a choice and a no-op CLI cannot report successful removal',async t=>{
 const f=await fixture(t);await f.profile('one');await f.profile('two');let calls=0;
 await assert.rejects(()=>easyUninstallDSH({dshHome:f.home,run:()=>{calls++;return{status:0};}}),/多个/);assert.equal(calls,0);
 await easyInstallDSH({repo:f.repo,dshHome:f.home,profile:'one',run:f.run,env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}});
 const file=path.join(f.home,'profiles/one/package.json'),before=await fs.readFile(file,'utf8');
 await assert.rejects(()=>easyUninstallDSH({dshHome:f.home,interactive:true,choose:async()=> 'one',run:()=>({status:0}),env:{PIXEL_PETS_DSH_BIN:'fixture-dsh'}}),/配置已从备份恢复/);assert.equal(await fs.readFile(file,'utf8'),before);
});
