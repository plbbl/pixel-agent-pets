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
 await fs.writeFile(path.join(payload,'install.cjs'),"require('node:fs').writeFileSync(process.env.BOOTSTRAP_RESULT,JSON.stringify({argv:process.argv.slice(2),file:__filename}));\nconsole.log('fixture installer executed');\nprocess.exitCode=Number(process.env.BOOTSTRAP_EXIT_CODE??0);\n");
 const archive=path.join(root,'Pixel-Agent-Pets-Installer.tar.gz');assert.equal(spawnSync('tar',['-czf',archive,'-C',path.join(root,'source'),'pixel-agent-pets']).status,0);
 const digest=createHash('sha256').update(await fs.readFile(archive)).digest('hex'),sums=path.join(root,'SHA256SUMS');await fs.writeFile(sums,digest+'  Pixel-Agent-Pets-Installer.tar.gz\n'+digest+'  Pixel-Agent-Pets-Codex.tar.gz\n');
 await fs.writeFile(path.join(shim,'curl'),'#!/bin/sh\npet_url=""\npet_out=""\nwhile [ "$#" -gt 0 ]; do\n case "$1" in https:*) pet_url="$1";; --output) shift; pet_out="$1";; esac\n shift\ndone\ncase "$pet_url" in */Pixel-Agent-Pets-Installer.tar.gz|*/Pixel-Agent-Pets-Codex.tar.gz) cp "$BOOTSTRAP_ARCHIVE" "$pet_out";; */SHA256SUMS) cp "$BOOTSTRAP_SUMS" "$pet_out";; *) exit 88;; esac\n',{mode:0o755});
 const result=path.join(root,'result.json'),home=path.join(root,'installer data 抱抱龙'),env={...process.env,PATH:shim+path.delimiter+path.dirname(process.execPath)+path.delimiter+process.env.PATH,PIXEL_PETS_INSTALL_HOME:home,BOOTSTRAP_ARCHIVE:archive,BOOTSTRAP_SUMS:sums,BOOTSTRAP_RESULT:result};
 return{root,home,sums,result,env,run:(...args)=>spawnSync('bash',[bootstrap,...args],{env,encoding:'utf8',timeout:20000}),clean:()=>fs.rm(root,{recursive:true,force:true})};
}
test('one-command bootstrap executes the verified release from a permanent path, preserving target arguments and spaces',async()=>{
 const f=await fixture();try{const run=f.run('--dsh','--profile','web');assert.equal(run.status,0,run.stderr);const result=JSON.parse(await fs.readFile(f.result));assert.deepEqual(result.argv,['--dsh','--profile','web']);assert.equal(result.file,await fs.realpath(path.join(f.home,'versions/0.3.0/install.cjs')));assert.match(run.stdout,/校验通过/);}finally{await f.clean();}
});
test('corrupt release checksum stops before executing or installing any payload',async()=>{
 const f=await fixture();try{await fs.writeFile(f.sums,'0'.repeat(64)+'  Pixel-Agent-Pets-Codex.tar.gz\n');const run=f.run('--codex');assert.notEqual(run.status,0);assert.match(run.stderr,/校验失败/);await assert.rejects(fs.access(f.result));await assert.rejects(fs.access(path.join(f.home,'versions')));}finally{await f.clean();}
});
test('bootstrap help is offline and shell syntax is valid',()=>{
 assert.equal(spawnSync('bash',['-n',bootstrap],{encoding:'utf8'}).status,0);const result=spawnSync('bash',[bootstrap,'--help'],{encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/--dsh/);assert.match(result.stdout,/uninstall/);assert.match(result.stdout,/--codex/);assert.match(result.stdout,/九状态/);
});

test('Codex bootstrap selects the small catalog archive and keeps its payload separate from the full DSH package',async()=>{
 const f=await fixture();try{
  const codex=f.run('--codex');assert.equal(codex.status,0,codex.stderr);const selected=JSON.parse(await fs.readFile(f.result));assert.deepEqual(selected.argv,['--codex']);assert.equal(selected.file,await fs.realpath(path.join(f.home,'versions/0.3.0-codex/install.cjs')));
  const dsh=f.run('--dsh');assert.equal(dsh.status,0,dsh.stderr);assert.deepEqual((await fs.readdir(path.join(f.home,'versions'))).sort(),['0.3.0','0.3.0-codex']);
 }finally{await f.clean();}
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
 await fs.writeFile(path.join(shim,'curl'),'#!/bin/sh\npet_url=""\npet_out=""\nwhile [ "$#" -gt 0 ]; do\n case "$1" in https:*) pet_url="$1";; --output) shift; pet_out="$1";; esac\n shift\ndone\nprintf \'%s\\n\' "$pet_url" >> "$BOOTSTRAP_DOWNLOADS"\ncase "$pet_url" in */Pixel-Agent-Pets-Installer.tar.gz|*/Pixel-Agent-Pets-Codex.tar.gz) cp "$BOOTSTRAP_ARCHIVE" "$pet_out";; */SHA256SUMS) cp "$BOOTSTRAP_SUMS" "$pet_out";; "$BOOTSTRAP_RUNTIME_URL") cp "$BOOTSTRAP_RUNTIME_ARCHIVE" "$pet_out";; *) exit 88;; esac\n',{mode:0o755});
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

test('repeated same-version install, doctor and uninstall retain one current payload and leave other versions and user links intact',async()=>{
 const f=await fixture();try{
  const versions=path.join(f.home,'versions'),older=path.join(versions,'0.2.0'),historical=path.join(versions,'0.3.0.previous.user-kept'),current=path.join(versions,'0.3.0'),link=path.join(f.root,'user-plugin-link');
  for(const directory of [older,historical]){await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'keep.txt'),'user-owned marker');}
  await fs.symlink(current,link);
  for(const args of [['--dsh'],['doctor','--dsh'],['--dsh'],['uninstall','--dsh']]){
   const result=f.run(...args);assert.equal(result.status,0,result.stderr);assert.deepEqual((await fs.readdir(versions)).sort(),['0.2.0','0.3.0','0.3.0.previous.user-kept']);
   assert.equal(await fs.readlink(link),current);assert.equal(await fs.readFile(path.join(link,'package.json'),'utf8'),JSON.stringify({version:'0.3.0'}));
  }
  assert.equal(await fs.readFile(path.join(older,'keep.txt'),'utf8'),'user-owned marker');assert.equal(await fs.readFile(path.join(historical,'keep.txt'),'utf8'),'user-owned marker');
 }finally{await f.clean();}
});

test('a failed same-version payload restores the exact previous package, returns its exit code and leaves no extra backup',async()=>{
 const f=await fixture();try{
  const versions=path.join(f.home,'versions'),current=path.join(versions,'0.3.0'),older=path.join(versions,'0.2.0'),link=path.join(f.root,'user-plugin-link');
  await fs.mkdir(current,{recursive:true});await fs.mkdir(older);const original=Buffer.from('previous package must remain available\n');
  await fs.writeFile(path.join(current,'keep.txt'),original);await fs.writeFile(path.join(current,'package.json'),'{"version":"0.3.0","original":true}');await fs.writeFile(path.join(current,'install.cjs'),'original installer bytes');await fs.writeFile(path.join(older,'keep.txt'),'other version');await fs.symlink(current,link);
  f.env.BOOTSTRAP_EXIT_CODE='37';const result=f.run('doctor','--dsh');assert.equal(result.status,37,result.stderr);
  assert.deepEqual((await fs.readdir(versions)).sort(),['0.2.0','0.3.0']);assert.deepEqual(await fs.readFile(path.join(current,'keep.txt')),original);assert.equal(await fs.readFile(path.join(current,'package.json'),'utf8'),'{"version":"0.3.0","original":true}');assert.equal(await fs.readFile(path.join(current,'install.cjs'),'utf8'),'original installer bytes');
  assert.equal(await fs.readlink(link),current);assert.deepEqual(await fs.readFile(path.join(link,'keep.txt')),original);assert.equal(await fs.readFile(path.join(older,'keep.txt'),'utf8'),'other version');
 }finally{await f.clean();}
});

test('no target installs into the Codex and DSH web profiles already on this machine',async()=>{
 const f=await fixture();try{
  const home=path.join(f.root,'home');f.env.HOME=home;delete f.env.CODEX_HOME;delete f.env.DSH_HOME;await fs.mkdir(home);
  const none=f.run();assert.equal(none.status,1);assert.match(none.stderr,/没有找到 Codex 或 DSH/);await assert.rejects(fs.access(f.result));
  await fs.mkdir(path.join(home,'.codex'));
  const codex=f.run();assert.equal(codex.status,0,codex.stderr);assert.match(codex.stdout,/已识别：Codex/);
  let installed=JSON.parse(await fs.readFile(f.result));assert.deepEqual(installed.argv,['--codex']);assert.equal(installed.file,await fs.realpath(path.join(f.home,'versions/0.3.0-codex/install.cjs')));
  const headless=path.join(home,'.dsh/profiles/tui'),web=path.join(home,'.dsh/profiles/web');await fs.mkdir(headless,{recursive:true});await fs.mkdir(web,{recursive:true});
  await fs.writeFile(path.join(headless,'package.json'),JSON.stringify({dsh:{profile:{bundles:['@deepseek-ai/dsh-headless']}}}));
  assert.equal(f.run().status,0);assert.deepEqual(JSON.parse(await fs.readFile(f.result)).argv,['--codex'],'a terminal-only DSH profile cannot show a web pet');
  await fs.writeFile(path.join(web,'package.json'),JSON.stringify({dsh:{profile:{bundles:['@deepseek-ai/dsh-web-app']}}}));
  const both=f.run('--profile','web');assert.equal(both.status,0,both.stderr);installed=JSON.parse(await fs.readFile(f.result));
  assert.deepEqual(installed.argv,['--profile','web','--codex','--dsh']);assert.equal(installed.file,await fs.realpath(path.join(f.home,'versions/0.3.0/install.cjs')));
  const explicit=f.run('uninstall','--dsh');assert.equal(explicit.status,0,explicit.stderr);assert.deepEqual(JSON.parse(await fs.readFile(f.result)).argv,['uninstall','--dsh']);
 }finally{await f.clean();}
});

async function desktopFixture(){
 const f=await fixture(),shim=path.join(f.root,'bin'),home=path.join(f.root,'home'),dmg=path.join(f.root,'desktop.dmg'),log=path.join(f.root,'desktop.log');
 await fs.mkdir(home);await fs.writeFile(dmg,'verified disk image');
 const digest=createHash('sha256').update(await fs.readFile(dmg)).digest('hex');await fs.writeFile(dmg+'.sha256',digest+'  Pixel-Agent-Pets-macOS-arm64.dmg\n');
 await fs.writeFile(path.join(shim,'uname'),'#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo arm64;; esac\n',{mode:0o755});
 await fs.writeFile(path.join(shim,'curl'),'#!/bin/sh\npet_url=""\npet_out=""\nwhile [ "$#" -gt 0 ]; do\n case "$1" in https:*) pet_url="$1";; --output) shift; pet_out="$1";; esac\n shift\ndone\necho "curl $pet_url" >> "$DESKTOP_LOG"\ncase "$pet_url" in */Pixel-Agent-Pets-macOS-arm64.dmg) cp "$DESKTOP_DMG" "$pet_out";; */Pixel-Agent-Pets-macOS-arm64.dmg.sha256) cp "$DESKTOP_DMG.sha256" "$pet_out";; */Pixel-Agent-Pets-Codex.tar.gz) cp "$BOOTSTRAP_ARCHIVE" "$pet_out";; */SHA256SUMS) cp "$BOOTSTRAP_SUMS" "$pet_out";; *) exit 88;; esac\n',{mode:0o755});
 // The mounted image holds the app bundle; detaching removes it like a real unmount.
 await fs.writeFile(path.join(shim,'hdiutil'),'#!/bin/sh\necho "hdiutil $1" >> "$DESKTOP_LOG"\ncase "$1" in attach) cat >/dev/null; while [ "$#" -gt 1 ]; do [ "$1" = -mountpoint ] && mnt="$2"; shift; done; mkdir -p "$mnt/抱抱龙桌宠.app/Contents/MacOS"; echo new > "$mnt/抱抱龙桌宠.app/Contents/MacOS/version";; detach) for last; do :; done; rm -rf "$last"/*;; esac\n',{mode:0o755});
 await fs.writeFile(path.join(shim,'ditto'),'#!/bin/sh\ncp -R "$1" "$2"\n',{mode:0o755});
 for(const[name,status]of[['open',0],['pkill',1]])await fs.writeFile(path.join(shim,name),'#!/bin/sh\necho "'+name+' $*" >> "$DESKTOP_LOG"\nexit '+status+'\n',{mode:0o755});
 Object.assign(f.env,{HOME:home,DESKTOP_DMG:dmg,DESKTOP_LOG:log});delete f.env.CODEX_HOME;delete f.env.DSH_HOME;
 return{...f,home,dmg,log,app:path.join(home,'Applications/抱抱龙桌宠.app')};
}
test('macOS desktop install verifies the disk image, replaces the app and launches it without touching plugins',async()=>{
 const f=await desktopFixture();try{
  await fs.mkdir(path.join(f.app,'Contents/MacOS'),{recursive:true});await fs.writeFile(path.join(f.app,'Contents/MacOS/version'),'old');
  const result=f.run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/安装桌面版/);
  assert.equal(await fs.readFile(path.join(f.app,'Contents/MacOS/version'),'utf8'),'new\n');await assert.rejects(fs.access(f.app+'.installing'));await assert.rejects(fs.access(f.result));
  const log=await fs.readFile(f.log,'utf8');assert.match(log,/hdiutil attach/);assert.match(log,/hdiutil detach/);assert.match(log,new RegExp('open '+f.app.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(f.run('doctor','--desktop').stdout,/桌面版：.*抱抱龙桌宠\.app/);
  const removed=f.run('uninstall','--desktop');assert.equal(removed.status,0,removed.stderr);await assert.rejects(fs.access(f.app));assert.match(f.run('doctor','--desktop').stdout,/未安装/);
  // `curl | bash`: the script arrives on stdin, which the mounting tool must not swallow before the Codex step.
  const piped=spawnSync('bash',['-s','--','--desktop','--codex'],{env:f.env,input:await fs.readFile(bootstrap),encoding:'utf8',timeout:20000});
  assert.equal(piped.status,0,piped.stderr);assert.match(piped.stdout,/桌面版已安装/);await fs.access(f.app);
  assert.deepEqual(JSON.parse(await fs.readFile(f.result)).argv,['--codex']);await fs.rm(f.result);
  await fs.rm(f.app,{recursive:true});
  await fs.writeFile(f.dmg+'.sha256','0'.repeat(64)+'  Pixel-Agent-Pets-macOS-arm64.dmg\n');
  const corrupt=f.run('--desktop');assert.notEqual(corrupt.status,0);assert.match(corrupt.stderr,/校验失败/);await assert.rejects(fs.access(f.app));
 }finally{await f.clean();}
});
