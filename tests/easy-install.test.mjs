import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseInstallerArguments,runEasyInstaller,preflightCodexRuntimeSigning} from '../scripts/easy-install.mjs';

async function fixture(t,overrides={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-easy-entry-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const calls=[],appPath=path.join(directory,'Fixture.app'),payloadRoot=path.join(directory,'payload'),dataHome=path.join(directory,'state'),backupDirectory=path.join(directory,'original-backup');let text='';
 const record=(name,value)=>{calls.push(name);return value;};
 const operations={
  verifyInstallerPayload:async()=>record('verify',{version:'test-version'}),
  preflightCodexRuntimeSigning:async()=>{},
  discoverCodexApps:async()=>record('discover-app',[{appPath,version:'test'}]),
  planCodexAppInstall:async options=>record('plan',{status:'ready',...options}),
  discoverDSHProfiles:async()=>record('discover-profile',[{name:'web',kind:'web'}]),
  selectDSHProfile:async()=>record('select-profile','web'),
  findDSHCLI:async()=>record('find-dsh','fixture-dsh'),
  assertCodexAppClosed:async()=>record('closed'),delay:async()=>record('delay'),sign:async()=>record('sign'),
  installCodexApp:async()=>record('install-app',{status:'installed',appPath,backupDirectory}),
  installCodex:async()=>record('install-catalog',[{id:'fixture'}]),
  easyInstallDSH:async()=>record('install-dsh',{profile:'web',changed:true}),
  doctorDSHInstallation:async()=>record('doctor-dsh',{ok:true,profile:'web',runtimeVerified:false}),
  rollbackCodexApp:async options=>record('rollback',{restored:true,...options}),
  uninstallCodex:async()=>record('remove-catalog',{moved:['fixture']}),
  uninstallDSH:async()=>record('remove-dsh',{removed:true}),
  ...overrides,
 };
 const config={payloadRoot,dataHome,platform:'darwin',input:{isTTY:false},output:{isTTY:false,write:value=>{text+=value;}},operations};
 return{directory,calls,appPath,payloadRoot,dataHome,backupDirectory,operations,run:args=>runEasyInstaller(args,config),text:()=>text,receipt:()=>fs.readFile(path.join(dataHome,'installation.json'),'utf8').then(JSON.parse)};
}
test('invalid arguments and failed payload verification stop before discovery or mutation',async t=>{
 assert.throws(()=>parseInstallerArguments(['--profile']),/需要一个值/);assert.throws(()=>parseInstallerArguments(['--unknown']),/未知安装参数/);
 const f=await fixture(t);await assert.rejects(f.run(['install','--unknown']),/未知安装参数/);assert.deepEqual(f.calls,[]);
 f.operations.verifyInstallerPayload=async()=>{f.calls.push('verify');throw Error('integrity failure');};await assert.rejects(f.run(['install','--both','--yes']),/integrity failure/);assert.deepEqual(f.calls,['verify']);await assert.rejects(f.receipt(),/ENOENT/);
});
test('public native installation stops before touching any app while macOS runtime signing is unresolved',async t=>{
 const f=await fixture(t,{preflightCodexRuntimeSigning});await assert.rejects(f.run(['--codex','--yes']),/运行库验证/);assert.deepEqual(f.calls,['verify']);await assert.rejects(f.receipt(),/ENOENT/);
});
test('both hosts finish preflight before either installation can mutate; noninteractive signing needs explicit consent',async t=>{
 const f=await fixture(t);f.operations.selectDSHProfile=async()=>{f.calls.push('select-profile');throw Error('profile missing');};
 await assert.rejects(f.run(['install','--both','--yes']),/profile missing/);assert.deepEqual(f.calls,['verify','discover-app','plan','discover-profile','select-profile']);
 f.calls.length=0;await assert.rejects(f.run(['install','--codex']),/终端确认应用签名改动/);assert.deepEqual(f.calls,['verify','discover-app','plan']);await assert.rejects(f.receipt(),/ENOENT/);
});
test('no-wait refuses a running app without mutations; wait then replans and records reversible installation',async t=>{
 const f=await fixture(t);let closedChecks=0;f.operations.assertCodexAppClosed=async()=>{f.calls.push('closed');if(++closedChecks<3)throw Error('Quit Codex completely before installing or restoring pets.');};
 await assert.rejects(f.run(['install','--codex','--yes','--no-wait']),/Quit Codex/);assert.ok(!f.calls.includes('install-app'));await assert.rejects(f.receipt(),/ENOENT/);
 f.calls.length=0;closedChecks=0;await f.run(['install','--both','--yes']);
 assert.deepEqual(f.calls,['verify','discover-app','plan','discover-profile','select-profile','find-dsh','closed','delay','closed','delay','closed','plan','install-app','install-catalog','install-dsh']);
 const installed=await f.receipt();assert.equal(installed.codex.backupDirectory,f.backupDirectory);assert.equal(installed.dsh.profile,'web');assert.equal(installed.version,'test-version');
 f.calls.length=0;await f.run(['uninstall','--codex']);assert.deepEqual(f.calls,['verify','discover-app','closed','rollback','remove-catalog']);const removed=await f.receipt();assert.equal(removed.codex,undefined);assert.deepEqual(removed.dsh,{profile:'web'});
});
test('missing DSH executable fails the combined preflight before any Codex mutation',async t=>{
 const f=await fixture(t);f.operations.findDSHCLI=async()=>{f.calls.push('find-dsh');throw Error('official DSH executable missing');};
 await assert.rejects(f.run(['install','--both','--yes']),/DSH executable missing/);assert.deepEqual(f.calls,['verify','discover-app','plan','discover-profile','select-profile','find-dsh']);await assert.rejects(f.receipt(),/ENOENT/);
});
test('a later DSH or catalog failure preserves the app backup receipt and permits rollback',async t=>{
 for(const failure of ['install-dsh','install-catalog'])await t.test(failure,async t=>{
  const f=await fixture(t);await fs.mkdir(f.dataHome,{recursive:true});await fs.writeFile(path.join(f.dataHome,'installation.json'),JSON.stringify({schema:1,dsh:{profile:'previous-profile'}}));
  const key=failure==='install-dsh'?'easyInstallDSH':'installCodex';f.operations[key]=async()=>{f.calls.push(failure);throw Error('later installation failed');};
  await assert.rejects(f.run(['install','--both','--yes']),/later installation failed/);
  const receipt=await f.receipt();assert.equal(receipt.codex.backupDirectory,f.backupDirectory);assert.deepEqual(receipt.dsh,{profile:'previous-profile'});
  f.calls.length=0;await f.run(['uninstall','--codex']);assert.deepEqual(f.calls,['verify','discover-app','closed','rollback','remove-catalog']);assert.equal((await f.receipt()).codex,undefined);
 });
});
test('doctor and help remain read-only and never claim runtime verification',async t=>{
 const f=await fixture(t);f.operations.planCodexAppInstall=async options=>{f.calls.push('plan');return{status:'installed',...options};};
 const result=await f.run(['doctor','--both']);assert.equal(result.codex.fullRenderer,true);assert.equal(result.codex.runtimeVerified,false);assert.equal(result.dsh.runtimeVerified,false);assert.deepEqual(f.calls,['verify','discover-app','plan','discover-profile','select-profile','doctor-dsh']);await assert.rejects(f.receipt(),/ENOENT/);
 f.calls.length=0;assert.deepEqual(await f.run(['help']),{status:'help'});assert.deepEqual(f.calls,[]);
});
