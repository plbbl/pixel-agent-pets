import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const bootstrap=path.resolve('install.sh');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pets bootstrap 抱抱龙 ')),payload=path.join(root,'source/pixel-agent-pets'),shim=path.join(root,'bin');await fs.mkdir(payload,{recursive:true});await fs.mkdir(shim);
 await fs.writeFile(path.join(payload,'package.json'),JSON.stringify({version:'0.3.0'}));
 await fs.writeFile(path.join(payload,'install.cjs'),"require('node:fs').writeFileSync(process.env.BOOTSTRAP_RESULT,JSON.stringify({argv:process.argv.slice(2),file:__filename}));\nconsole.log('fixture installer executed');\n");
 const archive=path.join(root,'Pixel-Agent-Pets-Installer.tar.gz');assert.equal(spawnSync('tar',['-czf',archive,'-C',path.join(root,'source'),'pixel-agent-pets']).status,0);
 const digest=createHash('sha256').update(await fs.readFile(archive)).digest('hex'),sums=path.join(root,'SHA256SUMS');await fs.writeFile(sums,digest+'  Pixel-Agent-Pets-Installer.tar.gz\n');
 await fs.writeFile(path.join(shim,'curl'),'#!/bin/sh\npet_url=""\npet_out=""\nwhile [ "$#" -gt 0 ]; do\n case "$1" in https:*) pet_url="$1";; --output) shift; pet_out="$1";; esac\n shift\ndone\ncase "$pet_url" in */Pixel-Agent-Pets-Installer.tar.gz) cp "$BOOTSTRAP_ARCHIVE" "$pet_out";; */SHA256SUMS) cp "$BOOTSTRAP_SUMS" "$pet_out";; *) exit 88;; esac\n',{mode:0o755});
 const result=path.join(root,'result.json'),home=path.join(root,'installer data 抱抱龙'),env={...process.env,PATH:shim+path.delimiter+path.dirname(process.execPath)+path.delimiter+process.env.PATH,PIXEL_PETS_INSTALL_HOME:home,BOOTSTRAP_ARCHIVE:archive,BOOTSTRAP_SUMS:sums,BOOTSTRAP_RESULT:result};
 return{root,home,sums,result,env,run:(...args)=>spawnSync('bash',[bootstrap,...args],{env,encoding:'utf8',timeout:20000}),clean:()=>fs.rm(root,{recursive:true,force:true})};
}
test('one-command bootstrap executes the verified release from a permanent path, preserving target arguments and spaces',async()=>{
 const f=await fixture();try{const run=f.run('--dsh','--profile','web');assert.equal(run.status,0,run.stderr);const result=JSON.parse(await fs.readFile(f.result));assert.deepEqual(result.argv,['--dsh','--profile','web']);assert.equal(result.file,await fs.realpath(path.join(f.home,'versions/0.3.0/install.cjs')));assert.match(run.stdout,/校验通过/);}finally{await f.clean();}
});
test('corrupt release checksum stops before executing or installing any payload',async()=>{
 const f=await fixture();try{await fs.writeFile(f.sums,'0'.repeat(64)+'  Pixel-Agent-Pets-Installer.tar.gz\n');const run=f.run('--codex');assert.notEqual(run.status,0);assert.match(run.stderr,/校验失败/);await assert.rejects(fs.access(f.result));await assert.rejects(fs.access(path.join(f.home,'versions')));}finally{await f.clean();}
});
test('bootstrap help is offline and shell syntax is valid',()=>{
 assert.equal(spawnSync('bash',['-n',bootstrap],{encoding:'utf8'}).status,0);const result=spawnSync('bash',[bootstrap,'--help'],{encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/--dsh/);assert.match(result.stdout,/uninstall/);assert.match(result.stdout,/Codex.*unavailable/);assert.doesNotMatch(result.stdout,/install\.sh --codex/);
});

const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
function systemTool(name){
 const result=spawnSync('bash',['-c','command -v "$1"','bootstrap-fixture',name],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
async function runtimeFixture({system,machine,runtime,hash,oldNode=false,corrupt=false}){
 const f=await fixture(),shim=path.join(f.root,'bin'),runtimeName='node-v22.22.0-'+runtime,runtimeSource=path.join(f.root,'runtime-source'),node=path.join(runtimeSource,runtimeName,'bin/node');
 const downloads=path.join(f.root,'downloads.txt'),used=path.join(f.root,'runtime-used.txt'),globalCalls=path.join(f.root,'global-node-calls.txt'),runtimeArchive=path.join(f.root,runtimeName+'.tar.gz');
 await fs.mkdir(path.dirname(node),{recursive:true});
 await fs.writeFile(node,'#!/bin/sh\nprintf \'%s\\n\' "$0" >> "$BOOTSTRAP_RUNTIME_USED"\nexec '+shellQuote(process.execPath)+' "$@"\n',{mode:0o755});
 assert.equal(spawnSync('tar',['-czf',runtimeArchive,'-C',runtimeSource,runtimeName],{encoding:'utf8'}).status,0);
 // A restricted PATH makes Node genuinely unavailable to command lookup. Only
 // fixture executables and ordinary host shell utilities can be found there.
 for(const name of ['bash','tar','gzip','awk','mktemp','rm','mkdir','mv','date','dirname','cp'])await fs.symlink(systemTool(name),path.join(shim,name));
 await fs.writeFile(path.join(shim,'uname'),'#!/bin/sh\ncase "$1" in -s) printf \'%s\\n\' "$BOOTSTRAP_TEST_OS";; -m) printf \'%s\\n\' "$BOOTSTRAP_TEST_ARCH";; *) exit 1;; esac\n',{mode:0o755});
 await fs.writeFile(path.join(shim,'curl'),'#!/bin/sh\npet_url=""\npet_out=""\nwhile [ "$#" -gt 0 ]; do\n case "$1" in https:*) pet_url="$1";; --output) shift; pet_out="$1";; esac\n shift\ndone\nprintf \'%s\\n\' "$pet_url" >> "$BOOTSTRAP_DOWNLOADS"\ncase "$pet_url" in */Pixel-Agent-Pets-Installer.tar.gz) cp "$BOOTSTRAP_ARCHIVE" "$pet_out";; */SHA256SUMS) cp "$BOOTSTRAP_SUMS" "$pet_out";; "$BOOTSTRAP_RUNTIME_URL") cp "$BOOTSTRAP_RUNTIME_ARCHIVE" "$pet_out";; *) exit 88;; esac\n',{mode:0o755});
 // The tiny offline runtime stands in for the checksum-pinned official tarball.
 // Payload checksums remain real; the runtime hash provider can accept or reject
 // that distribution without downloading a large platform-specific executable.
 await fs.writeFile(path.join(shim,'shasum'),'#!/bin/sh\ncase "$3" in */node-v22.22.0-*.tar.gz) printf \'%s  %s\\n\' "$BOOTSTRAP_RUNTIME_HASH" "$3";; *) exec '+shellQuote(process.execPath)+' -e \'const fs=require("node:fs"),crypto=require("node:crypto");console.log(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));\' "$3";; esac\n',{mode:0o755});
 const globalNode=path.join(shim,'node'),globalBytes=oldNode?Buffer.from('#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$BOOTSTRAP_GLOBAL_NODE_CALLS"\nexit 1\n'):null;
 if(globalBytes)await fs.writeFile(globalNode,globalBytes,{mode:0o755});
 const runtimeURL='https://nodejs.org/download/release/v22.22.0/'+runtimeName+'.tar.gz';
 Object.assign(f.env,{PATH:shim,BOOTSTRAP_TEST_OS:system,BOOTSTRAP_TEST_ARCH:machine,BOOTSTRAP_RUNTIME_URL:runtimeURL,BOOTSTRAP_RUNTIME_ARCHIVE:runtimeArchive,BOOTSTRAP_RUNTIME_HASH:corrupt?'0'.repeat(64):hash,BOOTSTRAP_DOWNLOADS:downloads,BOOTSTRAP_RUNTIME_USED:used,BOOTSTRAP_GLOBAL_NODE_CALLS:globalCalls});
 return{...f,runtimeName,runtimeURL,downloads,used,globalNode,globalBytes,globalCalls};
}

test('missing or outdated Node is prepared offline for each supported platform and cached without replacing global Node',async t=>{
 const platforms=[
  {system:'Linux',machine:'x86_64',runtime:'linux-x64',hash:'c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744'},
  {system:'Linux',machine:'aarch64',runtime:'linux-arm64',hash:'25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be',oldNode:true},
  {system:'Darwin',machine:'arm64',runtime:'darwin-arm64',hash:'5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640'},
  {system:'Darwin',machine:'x86_64',runtime:'darwin-x64',hash:'5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce',oldNode:true},
 ];
 for(const platform of platforms)await t.test(platform.runtime,async()=>{
  const f=await runtimeFixture(platform);try{
   for(let attempt=0;attempt<2;attempt++){
    const result=f.run('--dsh','--profile','web');assert.equal(result.status,0,result.stderr);
    const installed=JSON.parse(await fs.readFile(f.result));assert.deepEqual(installed.argv,['--dsh','--profile','web']);assert.equal(installed.file,await fs.realpath(path.join(f.home,'versions/0.3.0/install.cjs')));
   }
   const downloads=(await fs.readFile(f.downloads,'utf8')).trim().split('\n');assert.equal(downloads.filter(url=>url===f.runtimeURL).length,1,'second install must reuse the private runtime');
   assert.equal(downloads.filter(url=>url.startsWith('https://nodejs.org/')).length,1);assert.ok((await fs.readFile(f.used,'utf8')).trim().split('\n').every(file=>file===path.join(f.home,'runtime',f.runtimeName,'bin/node')));
   if(f.globalBytes){assert.deepEqual(await fs.readFile(f.globalNode),f.globalBytes);assert.equal((await fs.readFile(f.globalCalls,'utf8')).trim().split('\n').length,2);}else await assert.rejects(fs.access(f.globalNode));
  }finally{await f.clean();}
 });
});

test('a rejected runtime checksum cannot execute the payload or replace an existing outdated Node',async()=>{
 const f=await runtimeFixture({system:'Linux',machine:'x86_64',runtime:'linux-x64',hash:'c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744',oldNode:true,corrupt:true});
 try{
  const result=f.run('--dsh','--profile','web');assert.notEqual(result.status,0);assert.match(result.stderr,/运行环境校验失败/);
  assert.deepEqual(await fs.readFile(f.globalNode),f.globalBytes);await assert.rejects(fs.access(f.used));await assert.rejects(fs.access(f.result));await assert.rejects(fs.access(path.join(f.home,'runtime')));await assert.rejects(fs.access(path.join(f.home,'versions')));
  const downloads=(await fs.readFile(f.downloads,'utf8')).trim().split('\n');assert.equal(downloads.filter(url=>url===f.runtimeURL).length,1);
 }finally{await f.clean();}
});
