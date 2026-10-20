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
