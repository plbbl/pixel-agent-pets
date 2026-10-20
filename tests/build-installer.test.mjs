import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildInstaller,verifyInstallerPayload,installerArchiveName,codexInstallerArchiveName} from '../scripts/build-installer.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function tarEntries(compressed){
 const bytes=gunzipSync(compressed),entries=[];let offset=0;
 while(bytes.subarray(offset,offset+512).some(value=>value!==0)){
  const header=bytes.subarray(offset,offset+512),field=(start,length)=>header.subarray(start,start+length).toString().replace(/\0.*$/s,'');
  const name=field(0,100),prefix=field(345,155),size=parseInt(field(124,12).trim(),8),mode=parseInt(field(100,8),8);
  assert.equal(field(156,1),'0','only regular files are archived');assert.equal(parseInt(field(108,8),8),0);assert.equal(parseInt(field(116,8),8),0);
  assert.ok(Number.isSafeInteger(size)&&size>=0);const full=prefix?prefix+'/'+name:name;
  assert.ok(full.startsWith('pixel-agent-pets/')&&!full.split('/').includes('..'));
  entries.push({path:full,size,mode,data:bytes.subarray(offset+512,offset+512+size)});offset+=512+Math.ceil(size/512)*512;
 }
 assert.ok(bytes.subarray(offset,offset+1024).every(value=>value===0));return entries;
}
test('downloadable package is complete, relocatable, dependency-free and verifies each exact file',async t=>{
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-release-')),entryPoint=path.join(root,'.generated','release-fixture-'+randomUUID()+'.mjs');
 await fs.mkdir(path.dirname(entryPoint),{recursive:true});
 t.after(async()=>{await fs.rm(work,{recursive:true,force:true});await fs.rm(entryPoint,{force:true});});
 await fs.writeFile(entryPoint,`#!/usr/bin/env node\nimport fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {exists,installCodex} from '../scripts/install-lib.mjs';import {discoverDSHProfiles} from '../scripts/easy-install-dsh.mjs';async function main(){const root=path.dirname(fileURLToPath(import.meta.url));if(process.argv[2]==='catalog'){console.log((await installCodex(root,process.argv[3],{qualityChoices:true})).length);}else console.log(JSON.stringify({clawd:await exists(path.join(root,'assets/clawd/manifest.json')),hd:await exists(path.join(root,'assets-hd/manifest.json')),codex:await exists(path.join(root,'codex/claude/pet.json')),profiles:(await discoverDSHProfiles(path.join(root,'no-profile-fixture'))).length,version:JSON.parse(await fs.readFile(path.join(root,'package.json'))).version}));}main().catch(error=>{console.error(error);process.exitCode=1;});`);
 const result=await buildInstaller({root,entryPoint,outdir:path.join(work,'release')});
 assert.equal(path.basename(result.archive),installerArchiveName);assert.equal(result.animations,66);assert.ok(result.archiveBytes<100*1024*1024);assert.ok(result.files>500);
 const archive=await fs.readFile(result.archive);assert.equal(result.sha256,hash(archive));assert.equal(await fs.readFile(path.join(work,'release/SHA256SUMS'),'utf8'),result.sha256+'  '+installerArchiveName+'\n');
 const entries=tarEntries(archive),extracted=path.join(work,'relocated');await fs.mkdir(extracted);
 const listing=spawnSync('tar',['-tzf',result.archive],{encoding:'utf8'});assert.equal(listing.status,0,listing.stderr);assert.equal(listing.stdout.trim().split('\n').length,entries.length);
 const extraction=spawnSync('tar',['-xzf',result.archive,'-C',extracted],{encoding:'utf8'});assert.equal(extraction.status,0,extraction.stderr);
 const payload=path.join(extracted,'pixel-agent-pets'),verified=await verifyInstallerPayload(payload);assert.equal(verified.files,result.files);assert.deepEqual(verified.targets,['codex','dsh']);assert.ok(!entries.some(entry=>/codex-native|codex-app-install|deferred-codex|build-desktop/.test(entry.path)));
 const metadata=JSON.parse(await fs.readFile(path.join(payload,'package.json')));assert.equal(metadata.devDependencies,undefined);assert.equal(metadata.dependencies,undefined);assert.equal(metadata.scripts,undefined);assert.equal(metadata.engines.node,'>=22');
 assert.ok(entries.every(entry=>!entry.path.includes('/node_modules/')&&!entry.path.includes('/src/')&&!entry.path.includes('/.generated/')&&!entry.path.includes('/baobaolong-assets/')));
 assert.equal(entries.filter(entry=>entry.path.endsWith('assets-hd/manifest.json')).length,1);
 assert.equal(entries.find(entry=>entry.path.endsWith('/install.cjs')).mode,0o755);
 for(const entry of entries.filter(entry=>/\.(?:cjs|mjs|js|json|yml|md)$/.test(entry.path)))assert.ok(!entry.data.toString().includes(root),entry.path+' must not disclose source paths');
 const probe=spawnSync(process.execPath,[path.join(payload,'install.cjs'),'probe'],{cwd:work,encoding:'utf8',env:{...process.env,NODE_PATH:''}});assert.equal(probe.status,0,probe.stderr);assert.deepEqual(JSON.parse(probe.stdout),{clawd:true,hd:true,codex:true,profiles:0,version:metadata.version});
 const catalog=spawnSync(process.execPath,[path.join(payload,'install.cjs'),'catalog',path.join(work,'fake-codex-home')],{cwd:work,encoding:'utf8',env:{...process.env,NODE_PATH:''}});assert.equal(catalog.status,0,catalog.stderr);assert.equal(catalog.stdout.trim(),'7');
 const host=await import('file://'+path.join(payload,'dist/index.js'));assert.equal(typeof host.apply,'function');assert.deepEqual(host.inject,['webServer']);
 const clientModule=await fs.readFile(path.join(payload,'dist/client.js'));await fs.appendFile(path.join(payload,'dist/client.js'),'\n// corrupted');await assert.rejects(verifyInstallerPayload(payload),/integrity mismatch/);
 await fs.writeFile(path.join(payload,'dist/client.js'),clientModule);await fs.writeFile(path.join(payload,'unexpected.txt'),'unlisted');await assert.rejects(verifyInstallerPayload(payload),/unexpected files/);
});

test('integrity verification rejects traversal, symlink substitution and unlisted payload files',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-release-integrity-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const value=Buffer.from('immutable fixture'),entry={path:'safe.txt',size:value.length,sha256:hash(value)},manifest={version:1,package:'dsh-pixel-agent-pets',packageVersion:'test',animations:66,files:[entry]};
 const write=()=>fs.writeFile(path.join(directory,'integrity.json'),JSON.stringify(manifest));await fs.writeFile(path.join(directory,'safe.txt'),value);await write();assert.equal((await verifyInstallerPayload(directory)).files,1);
 manifest.files=[{...entry,path:'../safe.txt'}];await write();await assert.rejects(verifyInstallerPayload(directory),/Invalid installer integrity entry/);
 manifest.files=[entry];await write();await fs.unlink(path.join(directory,'safe.txt'));await fs.symlink('integrity.json',path.join(directory,'safe.txt'));await assert.rejects(verifyInstallerPayload(directory),/regular files/);
});

test('release preparation rejects an incomplete asset set before staging any installer',async t=>{
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-release-missing-'));t.after(()=>fs.rm(work,{recursive:true,force:true}));
 await fs.mkdir(path.join(work,'scripts'),{recursive:true});await fs.writeFile(path.join(work,'package.json'),JSON.stringify({name:'dsh-pixel-agent-pets',version:'0.2.0'}));await fs.writeFile(path.join(work,'scripts/easy-install.mjs'),'console.log("fixture");');
 await assert.rejects(buildInstaller({root:work,outdir:path.join(work,'out'),archive:false}),/ENOENT/);await assert.rejects(fs.access(path.join(work,'out')));
});

test('actual prebuilt installer runs help and read-only doctor from a relocated directory without runtime packages',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-release-entry-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const release=await buildInstaller({root,outdir:path.join(directory,'relocated'),archive:false}),entry=path.join(release.directory,'install.cjs');
 const env={...process.env,NODE_PATH:'',PIXEL_PETS_INSTALL_HOME:path.join(directory,'state')};
 const help=spawnSync(process.execPath,[entry,'help'],{cwd:directory,encoding:'utf8',env});assert.equal(help.status,0,help.stderr);assert.match(help.stdout,/一键安装/);
 const home=path.join(directory,'fake-dsh-home'),profile=path.join(home,'profiles/web');await fs.mkdir(profile,{recursive:true});
 const before=JSON.stringify({name:'fixture',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-web-app']}}});await fs.writeFile(path.join(profile,'package.json'),before);
 const doctor=spawnSync(process.execPath,[entry,'doctor','--dsh','--profile','web','--dsh-home',home],{cwd:directory,encoding:'utf8',env});assert.equal(doctor.status,0,doctor.stderr);
 const status=JSON.parse(doctor.stdout.slice(doctor.stdout.indexOf('{')));assert.equal(status.dsh.enabled,false);assert.equal(status.dsh.runtimeVerified,false);assert.equal(await fs.readFile(path.join(profile,'package.json'),'utf8'),before);await assert.rejects(fs.access(path.join(directory,'state/installation.json')));
});

test('Codex-only download contains seven official catalogs and installs without the DSH runtime or app access',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pixel-codex-release-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const release=await buildInstaller({root,outdir:path.join(directory,'release'),variant:'codex'});
 assert.equal(path.basename(release.archive),codexInstallerArchiveName);assert.equal(release.animations,0);assert.deepEqual(release.targets,['codex']);assert.ok(release.archiveBytes<12*1024*1024);
 const entries=tarEntries(await fs.readFile(release.archive));assert.equal(entries.filter(e=>e.path.endsWith('/pet.json')).length,7);
 assert.ok(entries.every(e=>!e.path.includes('/assets-hd/')&&!e.path.includes('/assets/')&&!e.path.includes('/dist/')&&!e.path.includes('/native/')));
 const entry=path.join(release.directory,'install.cjs'),codexHome=path.join(directory,'codex-home'),state=path.join(directory,'state');
 const run=(...args)=>spawnSync(process.execPath,[entry,...args,'--codex-home',codexHome],{encoding:'utf8',env:{...process.env,NODE_PATH:'',PIXEL_PETS_INSTALL_HOME:state}});
 const unsupported=run('--both');assert.notEqual(unsupported.status,0);assert.match(unsupported.stderr,/未包含|不包含|不含/);await assert.rejects(fs.access(codexHome));await assert.rejects(fs.access(state));
 const install=run('--codex');assert.equal(install.status,0,install.stderr);assert.equal((await fs.readdir(path.join(codexHome,'pets'))).length,7);
 const doctor=run('doctor','--codex');assert.equal(doctor.status,0,doctor.stderr);const facts=JSON.parse(doctor.stdout.slice(doctor.stdout.indexOf('{')));assert.equal(facts.codex.ok,true);assert.equal(facts.codex.states,9);assert.equal(facts.codex.fullAnimations,false);
 const again=run('--codex');assert.equal(again.status,0,again.stderr);await assert.rejects(fs.access(path.join(codexHome,'pixel-agent-pets-backups')));
 const uninstall=run('uninstall','--codex');assert.equal(uninstall.status,0,uninstall.stderr);assert.equal((await fs.readdir(path.join(codexHome,'pets'))).length,0);
});
