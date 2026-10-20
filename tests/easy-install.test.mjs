import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseInstallerArguments,runEasyInstaller} from '../scripts/easy-install.mjs';

async function fixture(t,overrides={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-easy-entry-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const calls=[],argumentsSeen=[],payloadRoot=path.join(directory,'payload'),dataHome=path.join(directory,'state'),codexHome=path.join(directory,'codex'),dshHome=path.join(directory,'dsh');let text='';
 const record=(name,value)=>(...args)=>{calls.push(name);argumentsSeen.push({name,args});return value;};
 const operations={
  verifyInstallerPayload:record('verify',{version:'test-version',targets:['codex','dsh']}),
  discoverDSHProfiles:record('discover-profile',[{name:'web',kind:'web'}]),selectDSHProfile:record('select-profile','web'),findDSHCLI:record('find-dsh','fixture-dsh'),
  installCodex:record('install-catalog',[{id:'custom:pixel-agent-claude',changed:true}]),uninstallCodex:record('remove-catalog',{moved:['pixel-agent-claude']}),
  doctorCodexInstallation:record('doctor-codex',{ok:true,expectedPets:7,mode:'official-nine-state-catalog',states:9,frames:57,fullAnimations:false,runtimeVerified:false}),
  easyInstallDSH:record('install-dsh',{profile:'web',changed:true}),uninstallDSH:record('remove-dsh',{profile:'web',removed:true}),doctorDSHInstallation:record('doctor-dsh',{ok:true,profile:'web',runtimeVerified:false}),
  ...overrides,
 };
 const config={payloadRoot,dataHome,platform:'linux',input:{isTTY:false},output:{isTTY:false,write:value=>{text+=value;}},operations};
 return{directory,calls,argumentsSeen,payloadRoot,dataHome,codexHome,dshHome,operations,run:args=>runEasyInstaller(args,config),text:()=>text,receipt:()=>fs.readFile(path.join(dataHome,'installation.json'),'utf8').then(JSON.parse)};
}

test('unsupported legacy flags and failed integrity stop before discovery or any installation',async t=>{
 for(const args of [['--profile'],['--unknown'],['--codex-full'],['--background'],['--app','/tmp/App.app'],['--no-wait'],['--quality','hd']])assert.throws(()=>parseInstallerArguments(args),/需要一个值|未知安装参数/);
 const f=await fixture(t);await assert.rejects(f.run(['install','--codex-full']),/未知安装参数/);assert.deepEqual(f.calls,[]);
 f.operations.verifyInstallerPayload=async()=>{f.calls.push('verify');throw Error('integrity failure');};await assert.rejects(f.run(['--both','--yes']),/integrity failure/);assert.deepEqual(f.calls,['verify']);await assert.rejects(f.receipt(),/ENOENT/);
});

test('Codex installation uses only the seven-pet official catalog on any host, without app discovery or consent',async t=>{
 const f=await fixture(t);await f.run(['--codex','--codex-home',f.codexHome]);assert.deepEqual(f.calls,['verify','install-catalog']);
 assert.deepEqual(f.argumentsSeen.find(call=>call.name==='install-catalog').args,[f.payloadRoot,f.codexHome,{qualityChoices:true}]);
 assert.deepEqual((await f.receipt()).codex,{mode:'official-nine-state-catalog',pets:['custom:pixel-agent-claude']});assert.match(f.text(),/官方九种固定状态/);assert.match(f.text(),/完整动作仅在 DSH/);assert.doesNotMatch(f.text(),/签名|退出 Codex/);
});

test('unpackaged targets fail before discovery, receipts or writes for install, doctor and uninstall',async t=>{
 const f=await fixture(t,{verifyInstallerPayload:async()=>{f.calls.push('verify');return{version:'catalog-only',targets:['codex']};}});
 for(const command of ['install','doctor','uninstall'])for(const target of ['--dsh','--both']){
  f.calls.length=0;await assert.rejects(f.run([command,target]),/未包含 dsh/);assert.deepEqual(f.calls,['verify']);await assert.rejects(f.receipt(),/ENOENT/);
 }
 f.calls.length=0;await f.run(['install']);assert.deepEqual(f.calls,['verify','install-catalog']);
 const legacy=await fixture(t,{verifyInstallerPayload:async()=>({version:'legacy'})});await legacy.run(['--codex']);assert.deepEqual(legacy.calls,['install-catalog']);
});

test('combined installation resolves DSH and its executable before any Codex changes',async t=>{
 const f=await fixture(t);f.operations.selectDSHProfile=async()=>{f.calls.push('select-profile');throw Error('profile missing');};
 await assert.rejects(f.run(['--both']),/profile missing/);assert.deepEqual(f.calls,['verify','discover-profile','select-profile']);await assert.rejects(f.receipt(),/ENOENT/);
 f.calls.length=0;f.operations.selectDSHProfile=async()=>{f.calls.push('select-profile');return'web';};f.operations.findDSHCLI=async()=>{f.calls.push('find-dsh');throw Error('DSH executable missing');};
 await assert.rejects(f.run(['--both']),/DSH executable missing/);assert.deepEqual(f.calls,['verify','discover-profile','select-profile','find-dsh']);await assert.rejects(f.receipt(),/ENOENT/);
 f.calls.length=0;f.operations.findDSHCLI=async()=>{f.calls.push('find-dsh');return'fixture-dsh';};await f.run(['--both','--profile','web','--codex-home',f.codexHome,'--dsh-home',f.dshHome]);
 assert.deepEqual(f.calls,['verify','discover-profile','select-profile','find-dsh','install-catalog','install-dsh']);
 const dsh=f.argumentsSeen.find(call=>call.name==='install-dsh').args[0];assert.equal(dsh.payloadRoot,f.payloadRoot);assert.equal(dsh.dshHome,f.dshHome);assert.equal(dsh.profile,'web');assert.deepEqual((await f.receipt()).dsh,{profile:'web'});
});

test('a later DSH failure records only the completed compatible catalog and allows removing it independently',async t=>{
 const f=await fixture(t);await fs.mkdir(f.dataHome,{recursive:true});await fs.writeFile(path.join(f.dataHome,'installation.json'),JSON.stringify({schema:1,dsh:{profile:'previous-profile'}}));
 f.operations.easyInstallDSH=async()=>{f.calls.push('install-dsh');throw Error('guarded DSH installation failed');};
 await assert.rejects(f.run(['--both']),/guarded DSH installation failed/);const receipt=await f.receipt();assert.equal(receipt.codex.mode,'official-nine-state-catalog');assert.deepEqual(receipt.dsh,{profile:'previous-profile'});
 f.calls.length=0;await f.run(['uninstall','--codex']);assert.deepEqual(f.calls,['verify','remove-catalog']);assert.equal((await f.receipt()).codex,undefined);assert.deepEqual((await f.receipt()).dsh,{profile:'previous-profile'});
});

test('doctor and help stay read-only and describe compatibility without claiming full Codex animations',async t=>{
 const f=await fixture(t),result=await f.run(['doctor','--both']);assert.equal(result.codex.states,9);assert.equal(result.codex.expectedPets,7);assert.equal(result.codex.fullAnimations,false);assert.equal(result.codex.runtimeVerified,false);assert.equal(result.dsh.runtimeVerified,false);
 assert.deepEqual(f.calls,['verify','discover-profile','select-profile','doctor-codex','doctor-dsh']);await assert.rejects(f.receipt(),/ENOENT/);
 f.calls.length=0;assert.deepEqual(await f.run(['help']),{status:'help'});assert.deepEqual(f.calls,[]);assert.match(f.text(),/DSH：完整动作/);assert.doesNotMatch(f.text(),/签名改动|后台安装|--codex-full/);
});

test('uninstall invokes only the selected own-pet removers and keeps failed DSH records',async t=>{
 const f=await fixture(t);await f.run(['--both']);f.calls.length=0;f.operations.uninstallDSH=async()=>{f.calls.push('remove-dsh');throw Error('restore failed');};
 await assert.rejects(f.run(['uninstall','--both']),/restore failed/);assert.deepEqual(f.calls,['verify','discover-profile','select-profile','remove-catalog','remove-dsh']);assert.equal((await f.receipt()).codex,undefined);assert.deepEqual((await f.receipt()).dsh,{profile:'web'});
});

test('the real compatible catalog install, doctor and uninstall work together in an isolated home',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-entry-catalog-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const home=path.join(directory,'codex'),dataHome=path.join(directory,'installer'),config={payloadRoot:process.cwd(),dataHome,input:{isTTY:false},output:{isTTY:false,write:()=>{}},operations:{verifyInstallerPayload:async()=>({version:'fixture',targets:['codex']})}};
 const installed=await runEasyInstaller(['--codex','--codex-home',home],config);assert.equal(installed.codex.length,7);
 const status=await runEasyInstaller(['doctor','--codex','--codex-home',home],config);assert.equal(status.codex.ok,true);assert.equal(status.codex.installedPets,7);assert.equal(status.codex.fullAnimations,false);
 const repeated=await runEasyInstaller(['--codex','--codex-home',home],config);assert.ok(repeated.codex.every(pet=>!pet.changed));await assert.rejects(fs.access(path.join(home,'pixel-agent-pets-backups')));
 const removed=await runEasyInstaller(['uninstall','--codex','--codex-home',home],config);assert.equal(removed.codex.moved.length,7);assert.deepEqual(await fs.readdir(path.join(home,'pets')),[]);
});
